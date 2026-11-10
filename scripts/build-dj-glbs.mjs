#!/usr/bin/env node
// Derive the two DJs from the checked-in Quaternius guest characters (CC0), so they can be rebuilt without the
// original outfit and animation packs:
//
//   club-dj-male.glb  <- club-guest-male.glb   with its beard cut out and the Universal Base Characters'
//                          rigged-to-head `Hair_Long` added over the short cap, shortened to shoulder length and with
//                          its front (bangs, face-framing locks) removed: the cap makes the swept-back fringe, the long
//                          strands fall behind the ears (half-long dark wavy hair, clean-shaven; the brown is a
//                          runtime tint). Without the trim the fringe reads as very long eyebrows.
//   club-dj-female.glb  <- club-guest-female.glb   (long straight hair; the blond is a runtime tint)
//
// Both keep ONE clip, `Idle_Loop` (the DJ works the decks; it does not dance), so a DJ is about half the size of a
// guest file. Hair and clothes are tinted per DJ at load time (see DJ_LOOKS in js/club/11-audio-crowd.js): the pale
// strand texture is a grey map that the material colour turns into blond, brown or anything else.
//
//   node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>" [--out js/models/avatars]
//   npm run optimize:avatars -- js/models/avatars/club-dj-male.glb js/models/avatars/club-dj-female.glb
//
// Every hair glTF must have the same ordered joint list as the guest skeleton (the same rule build-avatar-glb.mjs
// enforces for every accessory).

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argument = name => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : null;
};
const ubc = argument('--ubc');
const headphonesDir = argument('--headphones');
const outDir = argument('--out') || join(ROOT, 'js/models/avatars');
if (!ubc) {
    console.error('usage: node scripts/build-dj-glbs.mjs --ubc "<unzipped Universal Base Characters[Standard]>" [--headphones "<unzipped Headphones dir>"] [--out <dir>]');
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
 * and leaves the scalp untouched: the male DJ uses Hair_Long at about half its length.
 */
function swapHair(document, hairDocument, { keep, keepCap, trimFront }) {
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
    if (trimFront) trimFrontStrands(document, names, trimFront);
    return names;
}

/**
 * Drop the long style's front: its bangs and face-framing locks hang over the forehead and cheeks and, over a short cap,
 * read as long eyebrows with bare skin between. Triangles whose centre is in front of the ear plane (`front`, metres) and
 * above `below` metres under the ears' height go; the sides, the back and the strands below the jaw stay.
 */
function trimFrontStrands(document, names, { front, below }) {
    const head = measureHead(document);
    for (const node of document.getRoot().listNodes().filter(item => names.includes(item.getName()) && item.getMesh())) {
        for (const primitive of node.getMesh().listPrimitives()) {
            const a = primitive.getAttribute('POSITION').getArray();
            const indices = primitive.getIndices();
            const source = indices.getArray();
            const kept = [];
            for (let t = 0; t < source.length; t += 3) {
                const y = (a[source[t] * 3 + 1] + a[source[t + 1] * 3 + 1] + a[source[t + 2] * 3 + 1]) / 3;
                const z = (a[source[t] * 3 + 2] + a[source[t + 1] * 3 + 2] + a[source[t + 2] * 3 + 2]) / 3;
                if (z > head.earZ + front && y > head.earY - below) continue;
                kept.push(source[t], source[t + 1], source[t + 2]);
            }
            indices.setArray(new source.constructor(kept));
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Headphones. A CC0 OBJ ("Headphones" on OpenGameArt: black cans, a blue accent, a 4K PBR set) is rebuilt as a mesh
// skinned 100% to the Head joint, in the character's own bind pose, so it follows the head exactly and needs no
// runtime axis guessing. The cups are moved out to each character's measured ears and the band widened to meet them.
// ---------------------------------------------------------------------------------------------------------------

/** Parse a triangulated-or-not OBJ into one indexed mesh (unique v/vt/vn triples), UVs flipped for glTF. */
function parseObj(text) {
    const v = [], vt = [], vn = [];
    const positions = [], normals = [], uvs = [], indices = [];
    const seen = new Map();
    const vertex = token => {
        if (seen.has(token)) return seen.get(token);
        const [a, b, c] = token.split('/').map(part => (part ? Number(part) : 0));
        positions.push(...v[a - 1]);
        uvs.push(...(b ? [vt[b - 1][0], 1 - vt[b - 1][1]] : [0, 0]));
        normals.push(...(c ? vn[c - 1] : [0, 1, 0]));
        seen.set(token, positions.length / 3 - 1);
        return positions.length / 3 - 1;
    };
    for (const line of text.split('\n')) {
        const part = line.trim().split(/\s+/);
        if (part[0] === 'v') v.push(part.slice(1, 4).map(Number));
        else if (part[0] === 'vt') vt.push(part.slice(1, 3).map(Number));
        else if (part[0] === 'vn') vn.push(part.slice(1, 4).map(Number));
        else if (part[0] === 'f') {
            const face = part.slice(1).map(vertex);
            for (let i = 1; i + 1 < face.length; i++) indices.push(face[0], face[i], face[i + 1]);
        }
    }
    return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

/** Where a character's ears and crown are, from its own bind pose and meshes (model space, metres). */
function measureHead(document) {
    const root = document.getRoot();
    const skin = root.listSkins()[0];
    const headIndex = skin.listJoints().findIndex(joint => joint.getName() === 'Head');
    const ibm = skin.getInverseBindMatrices().getArray();
    const m = Array.from(ibm.subarray(headIndex * 16, headIndex * 16 + 16));
    const headY = -(m[4] * m[12] + m[5] * m[13] + m[6] * m[14]);
    const body = [], hairTop = { y: -Infinity };
    for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        for (const primitive of mesh.listPrimitives()) {
            const a = primitive.getAttribute('POSITION').getArray();
            const isBody = /superhero/i.test(primitive.getMaterial().getName());
            for (let i = 0; i < a.length; i += 3) {
                if (isBody && a[i + 1] > headY - 0.02 && a[i + 1] < headY + 0.32) body.push([a[i], a[i + 1], a[i + 2]]);
                if (/^Hair_/.test(node.getName()) && Math.abs(a[i]) < 0.05 && a[i + 1] > hairTop.y) hairTop.y = a[i + 1];
            }
        }
    }
    const widest = Math.max(...body.map(p => Math.abs(p[0])));
    const ears = body.filter(p => Math.abs(p[0]) > 0.94 * widest);
    const mean = axis => ears.reduce((s, p) => s + p[axis], 0) / ears.length;
    return { headIndex, earX: widest, earY: mean(1), earZ: mean(2), crownY: Math.max(...body.map(p => p[1]), hairTop.y) };
}

async function addHeadphones(document, objDir) {
    const mesh = parseObj(await readFile(join(objDir, 'Headphones.obj'), 'utf8'));
    const head = measureHead(document);
    const S = 0.0021;            // the model's units to metres: its cups come out 7 cm across
    const CUP_Y = 73.7;          // the cups' centre height in the model
    const PAD_X = 25;            // where the ear pads face, either side of the middle
    const JOIN_X = 22;           // below this |x| it is band, above it cup
    const hair = 0.014;          // hair and a skin's width between the ear and the pad
    const innerHalf = head.earX + hair;
    const band = (innerHalf - (PAD_X - JOIN_X) * S) / JOIN_X;
    const positions = mesh.positions;
    let bandTop = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], ax = Math.abs(x);
        const nx = ax >= JOIN_X ? innerHalf + (ax - PAD_X) * S : ax * band;
        positions[i] = Math.sign(x) * nx;
        positions[i + 1] = (positions[i + 1] - CUP_Y) * S + head.earY;
        positions[i + 2] = positions[i + 2] * S + head.earZ;
        if (ax < JOIN_X) bandTop = Math.max(bandTop, positions[i + 1]);
    }
    // The band rests on the crown: lift it (more at the middle, none at the cups) if the hair is thicker than the head.
    const lift = Math.max(0, head.crownY - 0.004 - bandTop);
    if (lift > 0) {
        for (let i = 0; i < positions.length; i += 3) {
            const ax = Math.abs(positions[i]);
            const weight = Math.max(0, 1 - ax / (innerHalf * 0.95));
            if (Math.abs(mesh.positions[i]) < innerHalf) positions[i + 1] += lift * weight * weight;
        }
    }

    const root = document.getRoot();
    const buffer = root.listBuffers()[0];
    const skin = root.listSkins()[0];
    const count = positions.length / 3;
    const joints = new Uint16Array(count * 4);
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { joints[i * 4] = head.headIndex; weights[i * 4] = 1; }
    const accessor = (name, type, array) => document.createAccessor(name).setType(type).setArray(array).setBuffer(buffer);
    const primitive = document.createPrimitive()
        .setAttribute('POSITION', accessor('hp_pos', 'VEC3', positions))
        .setAttribute('NORMAL', accessor('hp_nrm', 'VEC3', mesh.normals))
        .setAttribute('TEXCOORD_0', accessor('hp_uv', 'VEC2', mesh.uvs))
        .setAttribute('JOINTS_0', accessor('hp_j', 'VEC4', joints))
        .setAttribute('WEIGHTS_0', accessor('hp_w', 'VEC4', weights))
        .setIndices(accessor('hp_i', 'SCALAR', mesh.indices));
    const colour = await sharp(join(objDir, 'Mat_Base_Color.png')).resize(1024, 1024).png().toBuffer();
    const material = document.createMaterial('Headphones')
        .setBaseColorTexture(document.createTexture('headphonesColour').setImage(colour).setMimeType('image/png'))
        .setMetallicFactor(0.15).setRoughnessFactor(0.5);
    primitive.setMaterial(material);
    const node = document.createNode('Headphones').setMesh(document.createMesh('Headphones').addPrimitive(primitive)).setSkin(skin);
    root.listScenes()[0].addChild(node);
    return `Headphones (ears ${head.earX.toFixed(3)} m out at y ${head.earY.toFixed(3)}, crown ${head.crownY.toFixed(3)}, lift ${lift.toFixed(3)})`;
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
    if (headphonesDir) added = [...added, await addHeadphones(document, headphonesDir)];
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

await build({ from: 'club-guest-male.glb', to: 'club-dj-male.glb', hair: { style: 'Hair_Long', keep: 0.5, keepCap: true, shave: true, trimFront: { front: 0.0, below: 1 } } });
await build({ from: 'club-guest-female.glb', to: 'club-dj-female.glb' });
