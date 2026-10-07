#!/usr/bin/env node
// Derive the two DJs from the checked-in Quaternius guest characters (CC0), so they can be rebuilt without the
// original outfit and animation packs:
//
//   club-dj-hernan.glb  <- club-guest-male.glb   + the Universal Base Characters' rigged-to-head `Hair_Beard`
//   club-dj-melera.glb  <- club-guest-female.glb   (long hair; the DJ's brunette is a runtime tint)
//
// Both keep ONE clip, `Idle_Loop` (the DJ works the decks; it does not dance), so a DJ is about half the size of a
// guest file. Hair and clothes are tinted per DJ at load time (see DJ_LOOKS in js/club/11-audio-crowd.js): the pale
// strand texture is a grey map that the material colour turns into silver, brunette or anything else.
//
//   node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>" [--out js/models/avatars]
//   npm run optimize:avatars -- js/models/avatars/club-dj-hernan.glb js/models/avatars/club-dj-melera.glb
//
// The beard glTF must have the same ordered joint list as the guest skeleton (the same rule build-avatar-glb.mjs
// enforces for every accessory).

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, prune } from '@gltf-transform/functions';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argument = name => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : null;
};
const ubc = argument('--ubc');
const outDir = argument('--out') || join(ROOT, 'js/models/avatars');
if (!ubc) {
    console.error('usage: node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>" [--out <dir>]');
    process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const KEEP_CLIP = 'Idle_Loop';

/** A glTF with external buffers and images, read from disk (the pack ships some textures as `<name>_png.png`). */
async function readGltf(path) {
    const json = JSON.parse(await readFile(path, 'utf8'));
    const resources = {};
    for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
        if (!resource.uri || resource.uri.startsWith('data:')) continue;
        try {
            resources[resource.uri] = await readFile(join(dirname(path), resource.uri));
        } catch (error) {
            if (!resource.uri.endsWith('_png.png')) throw error;
            resources[resource.uri] = await readFile(join(dirname(path), resource.uri.replace(/_png\.png$/, '.png')));
        }
    }
    return io.readJSON({ json, resources });
}

function keepOneClip(document) {
    const clips = document.getRoot().listAnimations();
    if (!clips.some(clip => clip.getName() === KEEP_CLIP)) throw new Error(`no ${KEEP_CLIP} clip`);
    for (const clip of clips) if (clip.getName() !== KEEP_CLIP) clip.dispose();
}

function attachSkinned(document, accessoryDocument) {
    const skin = document.getRoot().listSkins()[0];
    const baseJoints = skin.listJoints().map(joint => joint.getName());
    const nodes = accessoryDocument.getRoot().listNodes().filter(node => node.getMesh() && node.getSkin());
    const accessoryJoints = nodes[0]?.getSkin()?.listJoints().map(joint => joint.getName());
    if (!accessoryJoints || accessoryJoints.length !== baseJoints.length ||
        accessoryJoints.some((name, index) => name !== baseJoints[index])) {
        throw new Error('the accessory skeleton does not match the character');
    }
    const copies = copyToDocument(document, accessoryDocument, nodes.map(node => node.getMesh()));
    for (const node of nodes) {
        document.getRoot().listScenes()[0].addChild(
            document.createNode(node.getName()).setMesh(copies.get(node.getMesh())).setSkin(skin).setMatrix(node.getMatrix()));
    }
    return nodes.map(node => node.getName());
}

async function build({ from, to, beard }) {
    const document = await io.read(join(ROOT, 'js/models/avatars', from));
    keepOneClip(document);
    let added = [];
    if (beard) {
        const beardPath = join(ubc, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)', 'Hair_Beard.gltf');
        added = attachSkinned(document, await readGltf(beardPath));
        // The beard uses the same hair texture as the hair already on the head. Sharing that very material lets the
        // optimiser merge them into one mesh (a character is held to six draws).
        const nodes = document.getRoot().listNodes();
        const hair = nodes.find(node => /^Hair_(?!Beard)/.test(node.getName()) && node.getMesh());
        const hairMaterial = hair.getMesh().listPrimitives()[0].getMaterial();
        for (const node of nodes.filter(item => item.getName() === 'Hair_Beard' && item.getMesh())) {
            for (const primitive of node.getMesh().listPrimitives()) primitive.setMaterial(hairMaterial);
        }
    }
    await document.transform(prune());
    const buffers = document.getRoot().listBuffers();
    const target = buffers[0] || document.createBuffer('avatar');
    for (const accessor of document.getRoot().listAccessors()) accessor.setBuffer(target);
    for (const buffer of buffers.slice(1)) buffer.dispose();
    await io.write(join(outDir, to), document);
    console.log(`${to}: from ${from}, clip ${KEEP_CLIP}${added.length ? `, + ${added.join(', ')}` : ''}`);
}

await build({ from: 'club-guest-male.glb', to: 'club-dj-hernan.glb', beard: true });
await build({ from: 'club-guest-female.glb', to: 'club-dj-melera.glb', beard: false });
