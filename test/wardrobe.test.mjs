import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const io = new NodeIO();
const linear = hex => [1, 3, 5].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});
const near = (a, b) => a.every((value, i) => Math.abs(value - b[i]) < 0.004);
const primitives = doc => doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
const readCrowd = id => io.read(join(root, 'js', 'models', 'avatars', `club-crowd-${id}.glb`));

test('fashion provenance pins verified licences and the CC-BY creator remains credited in both app surfaces', () => {
    const provenance = JSON.parse(readFileSync(join(root, 'design', 'characters', 'provenance.json')));
    const packs = new Map(provenance.fashionPacks.map(pack => [pack.id, pack]));
    for (const pack of packs.values()) {
        assert.match(pack.sha256, /^[a-f0-9]{64}$/);
        assert.ok(['CC0-1.0', 'CC-BY-4.0'].includes(pack.license));
        for (const asset of pack.selectedAssets) {
            assert.ok(asset.author && asset.source.startsWith('http'), `${asset.id}: missing provenance`);
        }
    }
    const crop = packs.get('shirts03').selectedAssets.find(asset => asset.id === 'punkduck_high_neck_crop_top');
    assert.equal(crop.author, 'punkduck');
    assert.equal(crop.license, 'CC-BY-4.0');
    assert.equal(crop.source, 'http://www.makehumancommunity.org/node/1088');
    assert.equal(crop.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
    assert.match(crop.mhcloSha256, /^[a-f0-9]{64}$/);
    assert.match(crop.licenseEvidence, /# license CC BY 4\.0/);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html.slice(html.indexOf('splash-credits'), html.indexOf('<main>')), /punkduck/);
    const credits = html.slice(html.indexOf('id="modelCredits"'));
    assert.ok(credits.includes(crop.source));
    assert.match(credits, /High Neck Crop Top.*punkduck/);
    assert.match(credits, /fitted to Asha, recoloured, combined with trousers/);
});

test('packed wardrobe shoe masks preserve normalized source values rather than integer storage bytes', async () => {
    for (const id of ['nia', 'asha', 'sofia', 'iris', 'leila', 'amara', 'mei', 'rosa',
        'tao', 'luca', 'diego', 'ellis', 'felix', 'malik', 'ren', 'samir', 'idris']) {
        const source = await io.read(join(root, 'design', 'characters', 'wardrobe', `${id}.glb`));
        const built = await io.read(join(root, 'js', 'models', 'wardrobe', `${id}.glb`));
        for (const outfit of ['original', 'casual', 'smart']) {
            const name = `wardrobe_skin_${outfit}`;
            const masks = doc => doc.getRoot().listNodes().find(node => node.getName() === name)
                .getMesh().listPrimitives()[0].getAttribute('COLOR_0');
            const before = masks(source), after = masks(built), a = [], b = [];
            assert.equal(before.getCount(), after.getCount(), `${id}/${outfit}: mask topology changed`);
            for (let vertex = 0; vertex < before.getCount(); vertex++) {
                before.getElement(vertex, a); after.getElement(vertex, b);
                assert.ok(a.every((value, channel) => Math.abs(value - b[channel]) <= 1 / 255),
                    `${id}/${outfit}/${vertex}: normalized coverage corrupted during byte packing`);
            }
        }
    }
});

test('all personal wardrobe hair slots contain distinct fitted geometry and rejected braids are not shipped', async () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const ids = ['nia', 'asha', 'sofia', 'iris', 'leila', 'amara', 'mei', 'rosa',
        'tao', 'luca', 'diego', 'ellis', 'felix', 'malik', 'ren', 'samir', 'idris'];
    for (const id of ids) {
        const doc = await io.read(join(root, 'js', 'models', 'wardrobe', `${id}.glb`));
        const shapes = ['original', 'short', 'long'].map(option => {
            const node = doc.getRoot().listNodes().find(node => node.getName() === `wardrobe_hair_${option}`);
            const positions = node.getMesh().listPrimitives()[0].getAttribute('POSITION').getArray();
            return createHash('sha256').update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)).digest('hex');
        });
        assert.equal(new Set(shapes).size, 3, `${id}: a hair option repeats the original geometry`);
    }
    for (const recipe of recipes) assert.ok(!recipe.sources.some(source => /french_braid/.test(source)));
});

test('lightweight variants actually recolour their tops, not only their trousers or hair', async () => {
    const pairs = [
        ['vm1', 'm1', '#1b1b20', '#8c2a2a'], ['vf1', 'f4', '#7c1733', '#1f5f4a'],
        ['vm2', 'm9', '#6a3c8d', '#1f7a78'], ['vf2', 'f1', '#b4b4b4', '#d8a23a'],
        ['vm3', 'm3', '#1f5b3b', '#9c722e'], ['vf3', 'f3', '#322e2a', '#4a1c5a'],
        ['vm4', 'm7', '#b4b4b4', '#59354f'], ['vm7', 'm5', '#b4b4b4', '#167b82'],
        ['vf5', 'f8', '#e8d6a0', '#c24a5a'], ['vf6', 'f7', '#b4b4b4', '#a83e62'],
        ['vf7', 'f8', '#e8d6a0', '#3aa88c'], ['vm5', 'm4', '#a43c2a', '#2d4f7a'],
        ['vm6', 'm8', '#e2d9bd', '#5c3d3a']
    ];
    for (const [id, baseId, oldHex, newHex] of pairs) {
        const base = primitives(await readCrowd(baseId))[0], variant = primitives(await readCrowd(id))[0];
        assert.deepEqual(variant.getAttribute('POSITION').getArray(), base.getAttribute('POSITION').getArray(), `${id}: no geometry change`);
        const before = base.getAttribute('COLOR_0'), after = variant.getAttribute('COLOR_0');
        let topVertices = 0;
        for (let i = 0; i < before.getCount(); i++) {
            if (!near(before.getElement(i, []), linear(oldHex))) continue;
            assert.ok(near(after.getElement(i, []), linear(newHex)), `${id}: top vertex ${i} still shares its base outfit`);
            topVertices++;
        }
        assert.ok(topVertices >= 60, `${id}: the test must cover a real garment, not a tiny accessory`);
    }
});

test('the bald lightweight bouncer retains dark skin and eyebrows, with a contrasting shirt and charcoal suit', async () => {
    const document = await readCrowd('bouncer');
    const color = primitives(document)[0].getAttribute('COLOR_0');
    const count = hex => {
        let matches = 0;
        for (let i = 0; i < color.getCount(); i++) if (near(color.getElement(i, []), linear(hex))) matches++;
        return matches;
    };
    assert.equal(count('#553323'), 406, 'skin tone is unchanged');
    assert.equal(document.getRoot().getExtras().bald, true);
    assert.ok(count('#15110f') > 0 && count('#15110f') < 580, 'eyebrows and side hair stay, the scalp shell does not');
    assert.equal(count('#a6adb8'), 107, 'the shirt must be visibly separate');
    assert.equal(count('#303747'), 512, 'the suit is charcoal, not an undifferentiated black shape');
});

test('detailed residents sharing a garment mesh have distinct palettes; only alternative DJs share their stage outfit', () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    for (const [index, a] of recipes.entries()) for (const b of recipes.slice(index + 1)) {
        if (a.clothes !== b.clothes || [a.id, b.id].every(id => ['jin', 'zara'].includes(id))) continue;
        const distance = Math.hypot(...(a.clothingTint || [0, 0, 0]).map((value, i) => value - (b.clothingTint || [0, 0, 0])[i]));
        assert.ok(distance > 0.1, `${a.id} and ${b.id} have effectively the same ${a.clothes} palette`);
    }
});

test('the shipped detailed torso textures visibly distinguish the formerly repeated light tees and similar outfits', async () => {
    const torsoColor = async id => {
        const doc = await io.read(join(root, 'js', 'models', 'characters', `${id}.glb`));
        const primitive = primitives(doc).find(p => p.getMaterial().getAlphaMode() === 'OPAQUE');
        const position = primitive.getAttribute('POSITION'), uv = primitive.getAttribute('TEXCOORD_0');
        const { data, info } = await sharp(primitive.getMaterial().getBaseColorTexture().getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < position.getCount(); i++) {
            const y = position.getElement(i, [])[1]; min = Math.min(min, y); max = Math.max(max, y);
        }
        const colors = [[], [], []];
        for (let i = 0; i < position.getCount(); i++) {
            const p = position.getElement(i, []), height = (p[1] - min) / (max - min);
            if (height < 0.58 || height > 0.78 || Math.abs(p[0]) > (max - min) * 0.1) continue;
            const coords = uv.getElement(i, []);
            const x = Math.min(info.width - 1, Math.max(0, Math.floor(coords[0] * info.width)));
            const y = Math.min(info.height - 1, Math.max(0, Math.floor(coords[1] * info.height)));
            for (let c = 0; c < 3; c++) colors[c].push(data[(y * info.width + x) * info.channels + c]);
        }
        assert.ok(colors[0].length > 30, `${id}: actual torso samples`);
        return colors.map(channel => channel.sort((a, b) => a - b)[Math.floor(channel.length / 2)]);
    };
    for (const [a, b] of [['luca', 'noah'], ['luca', 'felix'], ['diego', 'jonas'], ['river', 'mara'], ['mei', 'ari']]) {
        const ca = await torsoColor(a), cb = await torsoColor(b);
        assert.ok(Math.hypot(...ca.map((value, i) => value - cb[i])) > 25, `${a}/${b}: torso colours too close (${ca}/${cb})`);
    }
});

test('the detailed club wardrobe includes fitted tops, tailored layers and night-out dress silhouettes', () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const clothes = Object.fromEntries(recipes.map(person => [person.id, person.clothes]));
    assert.equal(clothes.amara, 'toigo_cut_out_dress');
    assert.equal(clothes.asha, 'punkduck_high_neck_crop_top');
    assert.equal(clothes.eden, 'toigo_halter_dress_midi');
    assert.equal(clothes.mara, 'toigo_halter_dress_with_fluted_skirt');
    assert.equal(clothes.rosa, 'toigo_camisole_top');
    assert.equal(clothes.iris, 'toigo_turtleneck_halter_top');
    assert.equal(clothes.malik, 'male_casualsuit01');
    assert.equal(clothes.luca, 'male_casualsuit02');
    const people = Object.fromEntries(recipes.map(person => [person.id, person]));
    assert.equal(people.rosa.bottom, 'toigo_tiered_mini_skirt');
    assert.equal(people.asha.bottom, 'cortu_cargo_pants');
    assert.equal(people.iris.bottom, 'cortu_cargo_pants');
    assert.equal(people.vera.clothes, 'toigo_fisherman_sweater');
    assert.equal(people.vera.bottom, 'toigo_wool_pants');
    assert.equal(people.diego.hair, 'cortu_short_messy_hair');
    assert.equal(people.mei.hair, 'toigo_inverted_bob_with_bangs');
});

test('stock shirt emblems are removed before both original and casual wardrobe graphics are applied', async () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const printed = new Set(['male_casualsuit02', 'male_casualsuit04', 'male_casualsuit06']);
    for (const id of ['luca', 'diego', 'ren', 'felix']) {
        const recipe = recipes.find(person => person.id === id);
        const doc = await io.read(join(root, 'js', 'models', 'wardrobe', `${id}.glb`));
        for (const outfit of ['original', 'casual']) {
            if (outfit === 'original' && !printed.has(recipe.clothes)) continue;
            const material = doc.getRoot().listMaterials().find(item =>
                new RegExp(`^wardrobe_top_${outfit}(?:\\.\\d+)?$`).test(item.getName()));
            assert.ok(material, `${id}/${outfit}: missing shirt material`);
            const { data, info } = await sharp(material.getBaseColorTexture().getImage())
                .removeAlpha().raw().toBuffer({ resolveWithObject: true });
            const low = [255, 255, 255], high = [0, 0, 0];
            for (let y = 16; y < info.height * 0.45; y++) for (let x = 16; x < info.width - 16; x++) {
                for (let channel = 0; channel < 3; channel++) {
                    const value = data[(y * info.width + x) * info.channels + channel];
                    low[channel] = Math.min(low[channel], value);
                    high[channel] = Math.max(high[channel], value);
                }
            }
            assert.ok(high.every((value, channel) => value - low[channel] < 8),
                `${id}/${outfit}: the plain shirt still contains a baked emblem (${low}..${high})`);
        }
    }
});

test('all detailed women use verified sock-free footwear and retain a mixed shoe wardrobe', () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const women = recipes.filter(person => person.gender === 0);
    assert.equal(women.length, 15);
    const sources = { loafers: 'shoes03', pumps: 'toigo_ballet_flats', heels: 'toigo_stiletto_booties' };
    assert.equal(new Set(women.map(person => person.footwearStyle)).size, 3);
    for (const person of women) {
        assert.ok(Object.hasOwn(sources, person.footwearStyle), `${person.id}: missing sock-free shoe choice`);
        assert.equal(person.shoes, sources[person.footwearStyle]);
    }
});

test('detailed faces retain source-neutral expressions without custom smile shaping or runtime morph targets', async () => {
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const generator = readFileSync(join(root, 'scripts', 'characters', 'generate.py'), 'utf8');
    assert.doesNotMatch(generator, /relaxed_expression|mouth-angles-up|cheek-trans-up/);
    const wardrobeIds = new Set(['nia', 'asha', 'sofia', 'iris', 'leila', 'amara', 'mei', 'rosa',
        'tao', 'luca', 'diego', 'ellis', 'felix', 'malik', 'ren', 'samir', 'idris']);
    for (const person of recipes) {
        const expression = person.expression;
        assert.deepEqual(expression, { style: 'source-neutral', targets: {} }, `${person.id}: no forced facial deformation`);
        for (const folder of wardrobeIds.has(person.id) ? ['characters', 'wardrobe'] : ['characters']) {
            const doc = await io.read(join(root, 'js', 'models', folder, `${person.id}.glb`));
            assert.deepEqual(doc.getRoot().getExtras().expression, expression, `${folder}/${person.id}: stale generated face`);
            for (const primitive of primitives(doc)) assert.equal(primitive.listTargets().length, 0);
        }
    }
});
