import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { skeleton, sampler, retarget, addAnimation } from './retarget.mjs';
import { addRoleHeadphones } from './headphones.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wardrobe = process.argv.includes('--wardrobe');
const require = createRequire(join(repo, 'package.json'));
const { NodeIO } = require('@gltf-transform/core');
const B = require(join(repo, 'js', 'vendor', 'babylon.js'));
const sharp = require('sharp');
const io = new NodeIO();
const base = join(repo, 'design', 'characters');
const output = join(repo, 'js', 'models', wardrobe ? 'wardrobe' : 'characters');
await mkdir(output, { recursive: true });
const recipes = JSON.parse(await readFile(join(base, 'recipes.json')));
const provenance = JSON.parse(await readFile(join(base, 'provenance.json')));
const assetLicences = new Map(provenance.fashionPacks.flatMap(pack =>
    pack.selectedAssets.map(asset => [asset.id, asset.license || pack.license])));
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
const only = new Set((process.env.AVATAR_ONLY || '').split(',').filter(Boolean));
for (const id of only) assert.ok(Object.values(wardrobe ? players : npcs).includes(id), `Unknown requested character ${id}`);
const playerClips = ['Idle', 'Walk', 'Run', 'Wave', 'Yes', 'Dance_Loop', 'Seated_Loop', 'Seated_Low_Loop', 'Idle_Talking_Loop'];
const sources = {};
for (const id of ['f1', 'f6', 'f7', 'm6']) sources[id] = await io.read(join(repo, 'js', 'models', 'avatars', `club-crowd-${id}.glb`));
const catalogFile = join(repo, 'js', wardrobe ? 'wardrobeCatalog.js' : 'characterCatalog.js');
const priorCatalog = only.size ? JSON.parse((await readFile(catalogFile, 'utf8')).split(' = ')[1].trim().replace(/;$/, '')) : null;
const people = priorCatalog ? (wardrobe ? Object.fromEntries(Object.entries(players).map(([key, id]) => [id, priorCatalog[key]])) : priorCatalog.people) : {};
const report = only.size && !wardrobe ? JSON.parse(await readFile(join(base, 'build-report.json'), 'utf8')) : [];

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

function eyePoint(doc, sk, wardrobeEyes = false, atlas = [0.5, 0.5, 1, 1]) {
    const head = sk.bind.get(sk.named.get('head')).p;
    const eye = [];
    for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
        if (wardrobeEyes ? !primitive.getMaterial().getName().startsWith('wardrobe_accessories') :
            !primitive.getMaterial().getName().endsWith('_opaque')) continue;
        const uv = primitive.getAttribute('TEXCOORD_0'), positions = primitive.getAttribute('POSITION');
        for (let i = 0; i < positions.getCount(); i++) {
            const [u, v] = uv.getElement(i, []), p = positions.getElement(i, []);
            if ((wardrobeEyes || u >= atlas[0] && v >= atlas[1] && u <= atlas[2] && v <= atlas[3]) && Math.abs(p[0] - head.x) < 0.1 &&
                p[1] > head.y && p[1] < head.y + 0.16) eye.push(p);
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
for (const [sourceId, id] of Object.entries(wardrobe ? players : npcs)) {
    if (only.size && !only.has(id)) continue;
    const recipe = recipes.find(p => p.id === id);
    assert.ok(recipe && recipe.age >= 0.5, `Unverified adult recipe ${id}`);
    const licences = [...new Set(recipe.sources.map(source => assetLicences.get(source) || 'CC0-1.0'))];
    assert.ok(licences.every(licence => ['CC0-1.0', 'CC-BY-4.0'].includes(licence)));
    assert.equal(recipe.license, licences.join(' AND '), `Unverified licences for ${id}`);
    const doc = await io.read(join(base, wardrobe ? 'wardrobe' : 'base', `${id}.glb`));
    assert.equal(recipe.expression?.style, 'source-neutral', `Regenerate ${id} without forced facial shaping`);
    assert.deepEqual(recipe.expression.targets, {}, `Custom expression targets are not supported for ${id}`);
    doc.getRoot().setExtras({ expression: recipe.expression });
    for (const material of doc.getRoot().listMaterials()) {
        material.setMetallicFactor(0).setRoughnessFactor(0.83).setEmissiveFactor([0, 0, 0]);
        material.setAlphaMode((material.getName().endsWith('_hair') || material.getName().startsWith('wardrobe_hair_')) ? 'MASK' : 'OPAQUE').setAlphaCutoff(0.45);
    }
    for (const texture of doc.getRoot().listTextures()) {
        if (texture.getMimeType() !== 'image/webp') texture.setImage(await sharp(texture.getImage()).webp({ quality: 90, alphaQuality: 100 }).toBuffer()).setMimeType('image/webp');
    }
    if (wardrobe) for (const node of doc.getRoot().listNodes()) {
        if (!node.getName().startsWith('wardrobe_skin_')) continue;
        for (const primitive of node.getMesh().listPrimitives()) {
            const masks = primitive.getAttribute('COLOR_0');
            assert.equal(masks?.getType(), 'VEC4', `${id}: missing four-channel shoe masks`);
            const packed = new Uint8Array(masks.getCount() * 4), values = [];
            for (let vertex = 0; vertex < masks.getCount(); vertex++) {
                // Blender may store normalized U16 colours, not raw 0..1 floats.
                masks.getElement(vertex, values);
                for (let channel = 0; channel < 4; channel++) {
                    assert.ok(values[channel] >= 0 && values[channel] <= 1, `${id}: invalid normalized shoe mask`);
                    packed[vertex * 4 + channel] = Math.round(values[channel] * 255);
                }
            }
            masks.setArray(packed).setNormalized(true);
        }
    }
    const target = skeleton(doc);
    for (const animation of doc.getRoot().listAnimations()) animation.dispose();
    for (const node of target.order) {
        const local = target.local.get(node);
        node.setTranslation(local.p.asArray()).setRotation(local.q.asArray()).setScale(local.s.asArray());
    }
    const procedural = sourceId === 'bartender' || sourceId.startsWith('dj-');
    const eye = eyePoint(doc, target, wardrobe, recipe.eyeAtlas);
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
        if (!wardrobe && dancers.has(sourceId)) add('f1', sources.f1.getRoot().listAnimations()
            .map(a => a.getName()).filter(n => n === 'Dance_Loop' || n.startsWith('Groove_') && n !== 'Groove_Still'));
        if (playerIds.has(id)) add('m6', playerClips.filter(n => !clips.has(n)));
        add('m6', ['Idle_Loop', 'Idle_Talking_Loop']);
        if (!wardrobe && sourceId === 'm6') add('m6', ['Walk', 'Dance_Loop', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop']);
        if (!wardrobe && sourceId === 'f7') add('f7', ['Idle_Railing_Loop']);
        if (!wardrobe && sourceId === 'f6') add('f6', ['Seated_Bar_Idle_Loop', 'Seated_Bar_Drink_Loop']);
        if (!wardrobe && sourceId === 'vf7') add('m6', ['Idle_TalkingPhone_Loop']);
        if (!wardrobe && ['vm6', 'vf6', 'vm7', 'vf2', 'vm3', 'vf7', 'vm4', 'vf3', 'bouncer'].includes(sourceId)) add('m6', ['Idle']);
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
        printSurfaces: { original: recipe.plainTop === true || recipe.clothes === 'female_sportsuit01',
            casual: true, smart: false },
        ...(wardrobe ? { footwear: ['original', 'loafers', 'pumps', 'heels'], footwearMasks: true } :
            { footwearStyle: recipe.footwearStyle || 'original' }),
        procedural, url: `./js/models/${wardrobe ? 'wardrobe' : 'characters'}/${id}.glb` };
    const entry = { id, bytes: bytes.byteLength, clips: doc.getRoot().listAnimations().map(a => a.getName()) };
    const previous = report.findIndex(item => item.id === id);
    if (previous >= 0) report[previous] = entry;
    else report.push(entry);
    console.log(`${id}: ${bytes.byteLength} bytes, ${entry.clips.length} clips`);
}
if (wardrobe) {
    await writeFile(join(repo, 'js', 'wardrobeCatalog.js'),
        `'use strict';\n// Generated by node scripts/characters/build.mjs --wardrobe.\nwindow.WardrobeCatalog = ${JSON.stringify(Object.fromEntries(Object.entries(players).map(([key, id]) => [key, people[id]])), null, 4)};\n`);
} else {
    await writeFile(join(repo, 'js', 'characterCatalog.js'),
        `'use strict';\n// Generated by npm run build:characters; source recipes are in design/characters.\nwindow.CharacterCatalog = ${JSON.stringify({ people, npcs, players }, null, 4)};\n`);
    await writeFile(join(base, 'build-report.json'), JSON.stringify(report, null, 2));
}
