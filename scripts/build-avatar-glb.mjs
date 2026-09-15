#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';

const [basePath, animationPath, clipName, outputPath] = process.argv.slice(2);

if (!basePath || !animationPath || !clipName || !outputPath) {
    console.error('Usage: node scripts/build-avatar-glb.mjs <base.gltf> <animations.glb> <clip> <output.glb>');
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

await io.write(outputPath, baseDocument);
console.log(`Wrote ${outputPath} with ${targetAnimation.listChannels().length} animation channels.`);