#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { copyToDocument } from '@gltf-transform/functions';

const [basePath, animationPath, clipName, outputPath, ...options] = process.argv.slice(2);
const headOnly = options.includes('--head-only');
const accessoryPaths = options.filter(option => option !== '--head-only');

if (!basePath || !animationPath || !clipName || !outputPath) {
    console.error('Usage: node scripts/build-avatar-glb.mjs <base.gltf> <animations.glb> <clip> <output.glb> [accessory.gltf ...]');
    process.exit(1);
}

const io = new NodeIO();

async function readDocument(path) {
    if (extname(path).toLowerCase() !== '.gltf') return io.read(path);

    const json = JSON.parse(await readFile(path, 'utf8'));
    const resources = {};
    for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
        if (!resource.uri || resource.uri.startsWith('data:')) continue;
        let resourcePath = join(dirname(path), resource.uri);
        try {
            resources[resource.uri] = await readFile(resourcePath);
        } catch (error) {
            if (!resource.uri.endsWith('_png.png')) throw error;
            resourcePath = join(dirname(path), resource.uri.replace(/_png\.png$/, '.png'));
            resources[resource.uri] = await readFile(resourcePath);
        }
    }
    return io.readJSON({ json, resources });
}

const baseDocument = await readDocument(basePath);
const animationDocument = await io.read(animationPath);
const baseSkin = baseDocument.getRoot().listSkins()[0];
const baseJointNames = baseSkin?.listJoints().map(joint => joint.getName());

if (headOnly) {
    const bodyNode = baseDocument.getRoot().listNodes()
        .find(node => node.getMesh() && /Superhero_(Female|Male)/i.test(node.getName()));
    const primitive = bodyNode?.getMesh()?.listPrimitives()[0];
    const joints = primitive?.getAttribute('JOINTS_0');
    const weights = primitive?.getAttribute('WEIGHTS_0');
    const indices = primitive?.getIndices();
    if (!bodyNode || !primitive || !joints || !weights || !indices || !baseJointNames) {
        throw new Error('Base character does not expose indexed skinned body geometry for --head-only');
    }

    const headJoints = new Set(['Head', 'neck_01']);
    const jointArray = joints.getArray();
    const weightArray = weights.getArray();
    const indexArray = indices.getArray();
    const influences = joints.getElementSize();
    const belongsToHead = vertex => {
        let headWeight = 0;
        for (let influence = 0; influence < influences; influence++) {
            const offset = vertex * influences + influence;
            if (headJoints.has(baseJointNames[jointArray[offset]])) headWeight += weightArray[offset];
        }
        return headWeight >= 0.5;
    };
    const selected = [];
    for (let index = 0; index < indexArray.length; index += 3) {
        const triangle = [indexArray[index], indexArray[index + 1], indexArray[index + 2]];
        if (triangle.every(belongsToHead)) selected.push(...triangle);
    }
    if (selected.length === 0) throw new Error('No head triangles matched the base character skin weights');

    primitive.setIndices(baseDocument.createAccessor('Head_indices')
        .setType('SCALAR')
        .setArray(new indexArray.constructor(selected)));
}

for (const accessoryPath of accessoryPaths) {
    const accessoryDocument = await readDocument(accessoryPath);
    const accessoryNodes = accessoryDocument.getRoot().listNodes()
        .filter(node => node.getMesh() && node.getSkin());
    const accessorySkin = accessoryNodes[0]?.getSkin();
    const accessoryJointNames = accessorySkin?.listJoints().map(joint => joint.getName());

    if (!baseSkin || accessoryNodes.length === 0 || !accessoryJointNames ||
        accessoryJointNames.length !== baseJointNames.length ||
        accessoryJointNames.some((name, index) => name !== baseJointNames[index])) {
        throw new Error(`Accessory skeleton does not match the base character: ${accessoryPath}`);
    }

    const propertyMap = copyToDocument(baseDocument, accessoryDocument,
        accessoryNodes.map(node => node.getMesh()));
    for (const accessoryNode of accessoryNodes) {
        const targetNode = baseDocument.createNode(accessoryNode.getName())
            .setMesh(propertyMap.get(accessoryNode.getMesh()))
            .setSkin(baseSkin)
            .setMatrix(accessoryNode.getMatrix());
        baseDocument.getRoot().listScenes()[0].addChild(targetNode);
    }
}

const sourceAnimation = animationDocument.getRoot().listAnimations()
    .find(animation => animation.getName() === clipName);

if (!sourceAnimation) {
    const available = animationDocument.getRoot().listAnimations()
        .map(animation => animation.getName())
        .join(', ');
    throw new Error(`Animation "${clipName}" not found. Available clips: ${available}`);
}

const targetNodes = new Map();
for (const node of baseDocument.getRoot().listNodes()) {
    if (node.getName()) targetNodes.set(node.getName(), node);
}

for (const animation of baseDocument.getRoot().listAnimations()) animation.dispose();

const targetAnimation = baseDocument.createAnimation(clipName);
const samplerMap = new Map();

for (const sourceSampler of sourceAnimation.listSamplers()) {
    const sourceInput = sourceSampler.getInput();
    const sourceOutput = sourceSampler.getOutput();
    const inputArray = sourceInput.getArray();
    const outputArray = sourceOutput.getArray();
    const input = baseDocument.createAccessor(`${clipName}_time`)
        .setType(sourceInput.getType())
        .setArray(new inputArray.constructor(inputArray))
        .setNormalized(sourceInput.getNormalized());
    const output = baseDocument.createAccessor(`${clipName}_value`)
        .setType(sourceOutput.getType())
        .setArray(new outputArray.constructor(outputArray))
        .setNormalized(sourceOutput.getNormalized());
    const sampler = baseDocument.createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation(sourceSampler.getInterpolation());

    samplerMap.set(sourceSampler, sampler);
    targetAnimation.addSampler(sampler);
}

for (const sourceChannel of sourceAnimation.listChannels()) {
    const sourceNode = sourceChannel.getTargetNode();
    const targetNode = sourceNode && targetNodes.get(sourceNode.getName());
    if (!targetNode) {
        throw new Error(`No target joint named "${sourceNode?.getName() || '(unnamed)'}"`);
    }

    const channel = baseDocument.createAnimationChannel()
        .setTargetNode(targetNode)
        .setTargetPath(sourceChannel.getTargetPath())
        .setSampler(samplerMap.get(sourceChannel.getSampler()));
    targetAnimation.addChannel(channel);
}

const buffers = baseDocument.getRoot().listBuffers();
const targetBuffer = buffers[0] || baseDocument.createBuffer('avatar');
for (const accessor of baseDocument.getRoot().listAccessors()) accessor.setBuffer(targetBuffer);
for (const buffer of buffers.slice(1)) buffer.dispose();
await io.write(outputPath, baseDocument);
console.log(`Wrote ${outputPath} with ${targetAnimation.listChannels().length} animation channels.`);