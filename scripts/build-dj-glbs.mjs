#!/usr/bin/env node
// Derive the two DJs from the checked-in Quaternius guest characters (CC0), so they can be rebuilt without the
// original outfit and animation packs:
//
//   club-dj-hernan.glb  <- club-guest-male.glb   with its beard cut out and the Universal Base Characters'
//                          rigged-to-head `Hair_Long` added over the short cap, shortened to shoulder length
//                          (half-long dark wavy hair, clean-shaven; the brown is a runtime tint)
//   club-dj-melera.glb  <- club-guest-female.glb   (long straight hair; the blond is a runtime tint)
//
// Both keep ONE clip, `Idle_Loop` (the DJ works the decks; it does not dance), so a DJ is about half the size of a
// guest file. Hair and clothes are tinted per DJ at load time (see DJ_LOOKS in js/club/11-audio-crowd.js): the pale
// strand texture is a grey map that the material colour turns into blond, brown or anything else.
//
//   node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>" [--out js/models/avatars]
//   npm run optimize:avatars -- js/models/avatars/club-dj-hernan.glb js/models/avatars/club-dj-melera.glb
//
// Every hair glTF must have the same ordered joint list as the guest skeleton (the same rule build-avatar-glb.mjs
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

/**
 * Cut the beard out of a merged hair mesh. The guest-male file was optimised with its beard merged into the hair
 * primitive, so find the beard's own vertices (it is the pack's `Hair_Beard`, exact positions) and drop them and every
 * triangle that touches them.
 */
function removeEmbeddedBeard(document, beardDocument) {
    const beardNode = beardDocument.getRoot().listNodes().find(node => node.getMesh() && node.getSkin());
    const beard = beardNode.getMesh().listPrimitives()[0].getAttribute('POSITION');
    const count = beard.getCount();
    const first = beard.getArray().subarray(0, 3);
    const last = beard.getArray().subarray((count - 1) * 3, count * 3);
    const same = (array, index, ref) => [0, 1, 2].every(axis => Math.abs(array[index * 3 + axis] - ref[axis]) < 1e-5);
    let removed = 0;
    for (const node of document.getRoot().listNodes()) {
        if (!node.getMesh() || !/^Hair_/.test(node.getName())) continue;
        for (const primitive of node.getMesh().listPrimitives()) {
            const positions = primitive.getAttribute('POSITION').getArray();
            const total = positions.length / 3;
            let start = -1;
            for (let i = 0; i + count <= total; i++) {
                if (same(positions, i, first) && same(positions, i + count - 1, last)) { start = i; break; }
            }
            if (start < 0) continue;
            for (const semantic of primitive.listSemantics()) {
                const accessor = primitive.getAttribute(semantic);
                const size = accessor.getElementSize();
                const array = accessor.getArray();
                const out = new array.constructor(array.length - count * size);
                out.set(array.subarray(0, start * size));
                out.set(array.subarray((start + count) * size), start * size);
                accessor.setArray(out);
            }
            const indices = primitive.getIndices();
            const source = indices.getArray();
            const kept = [];
            for (let t = 0; t < source.length; t += 3) {
                const tri = [source[t], source[t + 1], source[t + 2]];
                if (tri.some(v => v >= start && v < start + count)) continue;
                kept.push(...tri.map(v => (v >= start + count ? v - count : v)));
            }
            indices.setArray(new source.constructor(kept));
            removed += count;
        }
    }
    if (!removed) throw new Error('no embedded beard found to remove');
}

/**
 * Swap the character's hair for another rigged-to-head style, shortened to `keep` of its hang below the jaw line.
 * The hair is skinned to the head bone, so compressing its vertices downwards in bind space shortens the strands
 * and leaves the scalp untouched: Hernan's half-long hair is Hair_Long at about half its length.
 */
function swapHair(document, hairDocument, { keep, keepCap }) {
    // keepCap: the character's own short hair stays as the scalp cap (the long style is authored for the female
    // head and leaves a male crown bare); the long strands are added over it.
    for (const node of document.getRoot().listNodes()) {
        if (!keepCap && node.getMesh() && /^Hair_/.test(node.getName())) node.dispose();
    }
    const names = attachSkinned(document, hairDocument);
    if (keepCap) {
        // Share the cap's hair material so the optimiser can merge the strands into the same draw (a character is
        // held to six).
        const cap = document.getRoot().listNodes().find(node => node.getMesh() && /^Hair_/.test(node.getName()) && !names.includes(node.getName()));
        const material = cap && cap.getMesh().listPrimitives()[0].getMaterial();
        if (material) {
            for (const node of document.getRoot().listNodes().filter(item => names.includes(item.getName()) && item.getMesh())) {
                for (const primitive of node.getMesh().listPrimitives()) primitive.setMaterial(material);
            }
        }
    }
    const skin = document.getRoot().listSkins()[0];
    const headIndex = skin.listJoints().findIndex(joint => joint.getName() === 'Head');
    const ibm = skin.getInverseBindMatrices().getArray();
    // Bind world y of the head joint = -(R^T * t).y of its inverse bind matrix; the rig is upright, so the
    // translation row is enough once the rotation is the pack's rest pose.
    const m = Array.from(ibm.subarray(headIndex * 16, headIndex * 16 + 16));
    const headY = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
    const pivot = headY + 0.03;
    for (const node of document.getRoot().listNodes().filter(item => names.includes(item.getName()) && item.getMesh())) {
        for (const primitive of node.getMesh().listPrimitives()) {
            const position = primitive.getAttribute('POSITION');
            const array = position.getArray();
            for (let i = 0; i < array.length; i += 3) {
                if (array[i + 1] < pivot) array[i + 1] = pivot - (pivot - array[i + 1]) * keep;
            }
            position.setArray(array);
        }
    }
    return names;
}

async function build({ from, to, beard, hair }) {
    const document = await io.read(join(ROOT, 'js/models/avatars', from));
    keepOneClip(document);
    let added = [];
    if (hair) {
        const hairPath = join(ubc, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)', `${hair.style}.gltf`);
        if (hair.shave) {
            removeEmbeddedBeard(document, await readGltf(join(ubc, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)', 'Hair_Beard.gltf')));
        }
        added = swapHair(document, await readGltf(hairPath), hair);
    }
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

// Hernan Cattaneo: half-long dark wavy hair, no beard (his press photos). Miss Melera: long straight blond hair.
await build({ from: 'club-guest-male.glb', to: 'club-dj-hernan.glb', hair: { style: 'Hair_Long', keep: 0.5, keepCap: true, shave: true } });
await build({ from: 'club-guest-female.glb', to: 'club-dj-melera.glb' });
