import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { skeleton, sampler, retarget, addAnimation } from './retarget.mjs';
import { addRoleHeadphones } from './headphones.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(repo, 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const B = require(join(repo, 'js', 'vendor', 'babylon.js'));
const sharp = require('sharp');
const io = new NodeIO();
const base = join(repo, 'design', 'characters');
const output = join(repo, 'js', 'models', 'characters');
await mkdir(output, { recursive: true });
const recipes = JSON.parse(await readFile(join(base, 'recipes.json')));
const npcs = {
    f1: 'nia', m2: 'luca', vm1: 'robin', m1: 'tao', f3: 'sofia', f2: 'asha', m3: 'diego',
    f4: 'iris', vf1: 'eden', m7: 'ren', f5: 'felix', vm2: 'kai', m5: 'jonas', m9: 'mara',
    m4: 'ellis', f6: 'amara', m6: 'malik', f7: 'mei', f8: 'rosa', m8: 'samir', vm5: 'luz', vf5: 'ari',
    vm6: 'leila', vf6: 'kwame', vm7: 'hana', vf2: 'owen', vm3: 'alex', vf7: 'vera', vm4: 'noah', vf3: 'river',
    bartender: 'sana', bouncer: 'idris', 'dj-male': 'jin', 'dj-female': 'zara'
};
const players = {
    f1: 'nia', f2: 'asha', f3: 'sofia', f4: 'iris', f5: 'leila', f6: 'amara', f7: 'mei', f8: 'rosa',
    m1: 'tao', m2: 'luca', m3: 'diego', m4: 'ellis', m5: 'felix', m6: 'malik', m7: 'ren', m8: 'samir', m9: 'idris'
};
const dancers = new Set(Object.keys(npcs).slice(0, 14));
const playerIds = new Set(Object.values(players));
const playerClips = ['Idle', 'Walk', 'Run', 'Wave', 'Yes', 'Dance_Loop', 'Seated_Loop', 'Seated_Low_Loop', 'Idle_Talking_Loop'];
const sources = {};
for (const id of ['f1', 'f6', 'f7', 'm6']) sources[id] = await io.read(join(repo, 'js', 'models', 'avatars', `club-crowd-${id}.glb`));
const people = {};
const report = [];

function placement(doc, height) {
    let min = Infinity, max = -Infinity;
    for (const node of doc.getRoot().listNodes()) {
        if (!node.getMesh()) continue;
        const matrix = node.getSkin() ? B.Matrix.Identity() : B.Matrix.FromArray(node.getWorldMatrix());
        for (const primitive of node.getMesh().listPrimitives()) {
            const positions = primitive.getAttribute('POSITION');
            for (let i = 0; i < positions.getCount(); i++) {
                const p = B.Vector3.TransformCoordinates(B.Vector3.FromArray(positions.getElement(i, [])), matrix);
                min = Math.min(min, p.y); max = Math.max(max, p.y);
            }
        }
    }
    assert.ok(Number.isFinite(min) && max > min);
    return { scale: height / (max - min), floor: -min * height / (max - min) };
}

function eyePoint(doc, sk) {
    const head = sk.bind.get(sk.named.get('head')).p;
    const eye = [];
    for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        if (!primitive.getMaterial().getName().endsWith('_opaque')) continue;
        const uv = primitive.getAttribute('TEXCOORD_0'), positions = primitive.getAttribute('POSITION');
        for (let i = 0; i < positions.getCount(); i++) {
            const [u, v] = uv.getElement(i, []), p = positions.getElement(i, []);
            // The generator's second atlas cell is the low-poly eyes, never skin or clothes.
            if (u > 0.5 && v > 0.5 && Math.abs(p[0] - head.x) < 0.1 && p[1] > head.y && p[1] < head.y + 0.16) eye.push(p);
        }
    }
    assert.ok(eye.length >= 8, 'Eye atlas landmarks missing; do not fall back to an estimated camera height.');
    const point = [0, 0, Math.max(...eye.map(p => p[2])) - 0.005];
    for (const p of eye) { point[0] += p[0] / eye.length; point[1] += p[1] / eye.length; }
    assert.ok(point[1] > head.y && point[1] < head.y + 0.16);
    return point;
}

function modularNames(doc, sk) {
    const names = new Map([['pelvis', 'Body'], ['spine_01', 'Abdomen'], ['spine_02', 'Torso'],
        ['spine_03', 'Chest'], ['neck_01', 'Neck'], ['head', 'Head']]);
    for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
        for (const [a, b] of [['clavicle', 'Shoulder'], ['upperarm', 'UpperArm'], ['lowerarm', 'LowerArm'],
            ['hand', 'Wrist'], ['thigh', 'UpperLeg'], ['calf', 'LowerLeg'], ['foot', 'Foot'], ['ball', 'PT']]) names.set(`${a}_${side}`, `${b}.${suffix}`);
        for (const digit of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
            if (digit !== 'Thumb') {
                const first = sk.named.get(`${digit.toLowerCase()}_01_${side}`);
                sk.named.get(`hand_${side}`).addChild(doc.createNode(`${digit}1.${suffix}`)
                    .setTranslation(B.Vector3.FromArray(first.getTranslation()).scale(0.23).asArray()));
            }
            for (let part = 1; part <= 3; part++) names.set(`${digit.toLowerCase()}_0${part}_${side}`, `${digit}${digit === 'Thumb' ? part : part + 1}.${suffix}`);
        }
    }
    for (const [a, b] of names) sk.named.get(a).setName(b);
}

assert.equal(Object.keys(npcs).length, 34);
assert.equal(new Set(Object.values(npcs)).size, 34);
for (const [sourceId, id] of Object.entries(npcs)) {
    const recipe = recipes.find(p => p.id === id);
    assert.ok(recipe && recipe.license === 'CC0-1.0' && recipe.age >= 0.5, `Unverified adult recipe ${id}`);
    const doc = await io.read(join(base, 'base', `${id}.glb`));
    for (const material of doc.getRoot().listMaterials()) {
        material.setMetallicFactor(0).setRoughnessFactor(0.83).setEmissiveFactor([0, 0, 0]);
        material.setAlphaMode(material.getName().endsWith('_hair') ? 'MASK' : 'OPAQUE').setAlphaCutoff(0.45);
    }
    for (const texture of doc.getRoot().listTextures()) {
        if (texture.getMimeType() !== 'image/webp') texture.setImage(await sharp(texture.getImage()).webp({ quality: 90, alphaQuality: 100 }).toBuffer()).setMimeType('image/webp');
    }
    const target = skeleton(doc);
    for (const animation of doc.getRoot().listAnimations()) animation.dispose();
    for (const node of target.order) {
        const local = target.local.get(node);
        node.setTranslation(local.p.asArray()).setRotation(local.q.asArray()).setScale(local.s.asArray());
    }
    const procedural = sourceId === 'bartender' || sourceId.startsWith('dj-');
    const eye = eyePoint(doc, target);
    if (procedural) {
        target.named.get('Root').setName('root'); target.named.get('head').setName('Head');
        if (sourceId.startsWith('dj-')) await addRoleHeadphones(doc, repo);
    } else {
        const clips = new Map();
        const add = (from, names) => {
            for (const name of names) {
                const animation = sources[from].getRoot().listAnimations().find(a => a.getName() === name);
                assert.ok(animation, `Missing ${from}/${name}`);
                clips.set(name, { from, animation });
            }
        };
        if (dancers.has(sourceId)) add('f1', sources.f1.getRoot().listAnimations()
            .map(a => a.getName()).filter(n => n === 'Dance_Loop' || n.startsWith('Groove_') && n !== 'Groove_Still'));
        if (playerIds.has(id)) add('m6', playerClips.filter(n => !clips.has(n)));
        add('m6', ['Idle_Loop', 'Idle_Talking_Loop']);
        if (sourceId === 'm6') add('m6', ['Walk', 'Dance_Loop', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop']);
        if (sourceId === 'f7') add('f7', ['Idle_Railing_Loop']);
        if (sourceId === 'f6') add('f6', ['Seated_Bar_Idle_Loop', 'Seated_Bar_Drink_Loop']);
        if (sourceId === 'vf7') add('m6', ['Idle_TalkingPhone_Loop']);
        if (['vm6', 'vf6', 'vm7', 'vf2', 'vm3', 'vf7', 'vm4', 'vf3', 'bouncer'].includes(sourceId)) add('m6', ['Idle']);
        for (const [name, { from, animation }] of clips) {
            const dance = name === 'Dance_Loop' || name.startsWith('Groove_');
            const result = retarget(skeleton(sources[from]), target, sampler(animation), {
                fingers: !dance,
                shoulderHands: !dance,
                contactHands: /Railing|Seated_Bar|Drink_Loop|Smoke_Loop/.test(name),
                sourcePlacement: placement(sources[from], from === 'm6' ? 1.84 : 1.66),
                targetPlacement: placement(doc, recipe.heightMetres)
            });
            assert.ok(result.metrics.maxAnkleError < 0.005, `${id}/${name}: ankle reach`);
            assert.ok(result.metrics.maxHandError < 0.025, `${id}/${name}: hand reach ${result.metrics.maxHandError}`);
            addAnimation(doc, target, result);
        }
        modularNames(doc, target);
    }
    const bytes = await io.writeBinary(doc);
    await writeFile(join(output, `${id}.glb`), bytes);
    people[id] = { label: recipe.label, description: recipe.description, height: recipe.heightMetres, eye,
        procedural, url: `./js/models/characters/${id}.glb` };
    report.push({ id, bytes: bytes.byteLength, clips: doc.getRoot().listAnimations().map(a => a.getName()) });
    console.log(`${id}: ${bytes.byteLength} bytes, ${report.at(-1).clips.length} clips`);
}
await writeFile(join(repo, 'js', 'characterCatalog.js'),
    `'use strict';\n// Generated by npm run build:characters; source recipes are in design/characters.\nwindow.CharacterCatalog = ${JSON.stringify({ people, npcs, players }, null, 4)};\n`);
await writeFile(join(base, 'build-report.json'), JSON.stringify(report, null, 2));
