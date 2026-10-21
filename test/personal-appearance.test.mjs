import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Blob } from 'node:buffer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function context(real = false) {
    const box = { console, setTimeout, clearTimeout, performance, URL, Blob, TextDecoder, TextEncoder,
        ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
        atob: s => Buffer.from(s, 'base64').toString('binary'), log: { warn() {} },
        document: { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, removeEventListener() {} },
        navigator: { userAgent: 'node' }, addEventListener() {}, removeEventListener() {} };
    box.window = box; box.self = box; box.globalThis = box;
    vm.createContext(box);
    for (const file of [...(real ? ['js/vendor/babylon.js', 'js/vendor/babylonjs.loaders.min.js',
        'js/materialFactory.js', 'js/avatarRig.js', 'js/avatarManager.js'] : []),
    'js/characterCatalog.js', 'js/wardrobeCatalog.js', 'js/avatarAccessoryAssets.js',
    'js/avatarDetails.js', 'js/avatarAppearance.js']) {
        vm.runInContext(readFileSync(join(root, file), 'utf8'), box, { filename: file });
    }
    return box;
}

test('personal appearance validates the exact bounded descriptor and returns isolated drafts', () => {
    const { AvatarAppearance: A } = context();
    const appearance = A.defaults('f1');
    assert.deepEqual(Object.keys(context().AvatarAccessoryAssets), ['round', 'square', 'sunglasses']);
    assert.equal(A.sanitize({ ...appearance, skin: '#ABCDEF' }).skin, '#abcdef');
    for (const bad of [undefined, [], {}, { ...appearance, extra: true }, { ...appearance, v: 2 },
        { ...appearance, base: 'bouncer' }, { ...appearance, outfit: '../../file' },
        { ...appearance, hairColor: 'red' }, { ...appearance, skin: '#ffff' }]) {
        assert.throws(() => A.sanitize(bad));
    }
    assert.equal(A.sanitize(null), null);
    assert.equal(Object.keys(context().WardrobeCatalog).length, 17);
    assert.notStrictEqual(A.defaults('f1'), A.defaults('f1'));
});

test('wardrobe saves only after authoritative acknowledgement, failures are visible and preferences survive', async () => {
    const box = context(), A = box.AvatarAppearance;
    const store = new Map(), errors = [];
    box.localStorage = { getItem: key => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
    const club = { ...box.PersonalAppearance, _loadWardrobeSource: async () => ({}), getLocalCharacter: () => 'f1',
        _syncMirrorDouble() {}, setLocalAvatarStyle() {}, showErrorMessage: message => errors.push(message) };
    const initial = A.defaults('f1'), next = { ...A.defaults('m2'), hair: 'long', top: '#337755' };
    assert.equal(await club.savePersonalAppearance(initial), true);
    assert.equal(JSON.parse(store.get(A.STORAGE_KEY)).base, 'f1');
    club.multiplayer = { connected: true, client: { appearanceSelectionSupported: false, setPreferredAppearance() {} } };
    assert.equal(await club.savePersonalAppearance(next), false);
    assert.equal(club.getPersonalAppearance().base, 'f1');
    assert.match(errors.at(-1), /relay needs an update/);
    let send;
    club.multiplayer.client.appearanceSelectionSupported = true;
    assert.equal(await club.savePersonalAppearance({ ...next, v: 2, glasses: 'star', facialHair: 'beard', hat: 'fedora' }), false);
    assert.match(errors.at(-1), /bald styles and accessories/);
    assert.equal(club.getPersonalAppearance().base, 'f1', 'an old relay must not overwrite the saved appearance');
    const footwear = { ...next, v: 3, glasses: 'none', facialHair: 'none', hat: 'none',
        shoes: 'pumps', legwear: 'sheer-nude' };
    assert.equal(await club.savePersonalAppearance(footwear), false);
    assert.match(errors.at(-1), /bald styles and accessories/);
    club.multiplayer.client.appearanceAccessoriesSupported = true;
    assert.equal(await club.savePersonalAppearance(footwear), false);
    assert.match(errors.at(-1), /shoes and tights/);
    assert.equal(club.getPersonalAppearance().base, 'f1', 'unsupported footwear must preserve the saved preference');
    club.multiplayer.client.selectAppearance = (value, base) => { send = { value, base }; return true; };
    const saving = club.savePersonalAppearance(next);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(send.base, 'm2');
    assert.equal(JSON.parse(store.get(A.STORAGE_KEY)).base, 'f1', 'no unacknowledged preference write');
    club._appearanceAcknowledged(next);
    assert.equal(await saving, true);
    assert.equal(club.getPersonalAppearance().top, '#337755');
    const draft = club.getAppearanceDraft();
    draft.top = '#ffffff';
    assert.equal(club.getPersonalAppearance().top, '#337755', 'editing never mutates the saved character');
    const resetting = club.resetPersonalAppearance();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(send.value, null);
    club._appearanceAcknowledged(null);
    assert.equal(await resetting, true);
    assert.equal(store.has(A.STORAGE_KEY), false);
    assert.equal(store.get('vrclub.myCharacter'), 'm2');
    store.set(A.STORAGE_KEY, '{broken');
    club._personalAppearanceLoaded = false;
    assert.equal(club.getPersonalAppearance(), null);
    assert.match(errors.at(-1), /could not be read/);
    box.localStorage.setItem = () => { throw new Error('Storage blocked'); };
    club.multiplayer.connected = false;
    assert.equal(await club.savePersonalAppearance(initial), false);
    assert.match(errors.at(-1), /Storage blocked/);
});

test('footwear saves and restores only the complete acknowledged v3 wardrobe', async () => {
    const box = context(), A = box.AvatarAppearance, store = new Map();
    box.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    const next = { ...A.defaults('m9'), v: 3, glasses: 'none', facialHair: 'none', hat: 'none',
        shoes: 'loafers', legwear: 'sheer-black' };
    let published;
    const club = { ...box.PersonalAppearance, _loadWardrobeSource: async () => ({}), getLocalCharacter: () => 'f1',
        _syncMirrorDouble() {}, setLocalAvatarStyle() {}, showErrorMessage() {},
        multiplayer: { connected: true, client: { appearanceSelectionSupported: true, appearanceAccessoriesSupported: true,
            appearanceFootwearSupported: true, setPreferredAppearance() {},
            selectAppearance(value) { published = value; return true; } } } };
    const saving = club.savePersonalAppearance(next);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(published.shoes, 'loafers');
    assert.equal(store.has(A.STORAGE_KEY), false);
    club._appearanceAcknowledged(next);
    assert.equal(await saving, true);
    assert.deepEqual(JSON.parse(store.get(A.STORAGE_KEY)), next);
    club._personalAppearanceLoaded = false;
    assert.equal(club.getPersonalAppearance().legwear, 'sheer-black');
});

test('editor upgrades isolated v1 and v2 drafts and offers all footwear on bounded VR subpages', () => {
    const box = context(), A = box.AvatarAppearance;
    vm.runInContext(readFileSync(join(root, 'js/avatarEditor.js'), 'utf8'), box);
    assert.equal(box.AvatarEditor.FOOTWEAR.shoes.heels, 'Heeled ankle boots');
    assert.deepEqual(Array.from(Object.values(box.AvatarEditor.FOOTWEAR.legwear)),
        ['Bare legs', 'Sheer black tights', 'Sheer nude tights']);
    for (const original of [A.defaults('f1'),
        { ...A.defaults('m9'), v: 2, hair: 'bald', glasses: 'heart', facialHair: 'beard', hat: 'fedora' },
        { ...A.defaults('f8'), v: 3, glasses: 'none', facialHair: 'none', hat: 'none', shoes: 'heels', legwear: 'sheer-nude' }]) {
        const before = JSON.stringify(original);
        const editor = new box.AvatarEditor({ getAppearanceDraft: () => original });
        editor.vrDraft = editor._freshDraft();
        assert.equal(editor.vrDraft.v, 3);
        assert.equal(editor.vrDraft.shoes, original.shoes || 'original');
        assert.equal(editor.vrDraft.legwear, original.legwear || 'bare');
        assert.equal(JSON.stringify(original), before);
        assert.doesNotThrow(() => A.sanitize(editor.vrDraft));
        assert.equal(editor.getVRDefinitions('appearanceEditor').length, 12);
        assert.ok(editor.getVRDefinitions('appearanceAccessories').some(button => button.target === 'appearanceFootwear'));
        for (const page of ['appearanceFootwear', 'appearanceShoes', 'appearanceLegwear']) {
            assert.ok(editor.getVRDefinitions(page).length <= 12);
        }
        for (const [page, field, values] of [
            ['appearanceShoes', 'shoes', ['original', 'loafers', 'pumps', 'heels']],
            ['appearanceLegwear', 'legwear', ['bare', 'sheer-black', 'sheer-nude']]
        ]) {
            const options = editor.getVRDefinitions(page).filter(button => button.action === 'appearanceSet');
            assert.deepEqual(Array.from(options, button => button.value), values);
            for (const button of options) {
                editor.setDraftValue(button.field, button.value);
                assert.equal(editor.vrDraft[field], button.value);
            }
            assert.equal(editor.getVRDefinitions(page).find(button => button.action === 'back').target, 'appearanceFootwear');
        }
    }
});

test('clothing designs use bounded original paths and only the two documented Japanese words', () => {
    const patterns = context().AvatarDetails.PRINTS;
    assert.equal(patterns.sound.text, '\u97f3');
    assert.equal(patterns.sound.meaning, 'sound');
    assert.equal(patterns.light.text, '\u5149');
    assert.equal(patterns.light.meaning, 'light');
    assert.deepEqual(Object.keys(patterns), ['sound', 'light', 'orbit', 'signal']);
    for (const pattern of Object.values(patterns)) {
        assert.ok(pattern.paths.reduce((sum, path) => sum + path.length - 1, 0) <= 48);
        for (const path of pattern.paths) {
            assert.ok(path.length >= 2);
            assert.ok(path.flat().every(value => Number.isFinite(value) && value >= 0 && value <= 1));
            for (let i = 1; i < path.length; i++) assert.ok(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) > 0.01);
        }
    }
});

test('legacy moustache choices normalize to none and create no generated facial-hair geometry', () => {
    const { AvatarDetails } = context(true);
    const face = {
        eye: [0, 1.6, 0], half: 0.08,
        project: (x, y) => [x, y, 0]
    };
    for (const facialHair of ['moustache', 'handlebar']) {
        const geometry = AvatarDetails._geometry(face, { facialHair });
        assert.equal(geometry.indices.length, 0);
        assert.equal(geometry.positions.length, 0);
    }
});

function assertHatFit(box, body, eye, hat, label) {
    const B = box.BABYLON, face = box.AvatarDetails._face(body, eye);
    const geometry = box.AvatarDetails._geometry(face, { hat });
    const p = geometry.positions, scalp = body.getVerticesData(B.VertexBuffer.PositionKind);
    const scale = face.half / 0.08, top = Math.max(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + 1]));
    const bottom = Math.min(...Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + 1]));
    assert.ok(top >= face.crown.top && top <= face.crown.top + 0.012 * scale, `${label}/${hat}: floating or clipping crown`);
    assert.ok(bottom > eye[1] + 0.01 * scale && bottom < eye[1] + 0.045 * scale,
        `${label}/${hat}: brim must rest above the eyes, not on top of the scalp`);
    const angleAt = (x, z) => {
        const curve = value => Math.sign(value) * Math.abs(value) ** (face.crown.power / 2);
        return (Math.atan2(curve(z / face.crown.rz), curve(x / face.crown.rx)) + Math.PI * 2) % (Math.PI * 2);
    };
    const rings = new Map();
    for (let i = 0; i < p.length; i += 3) {
        const level = (p[i + 1] - face.crown.bottom) / (top - face.crown.bottom) * 12;
        const band = Math.round(level), x = p[i] - face.crown.x, z = p[i + 2] - face.crown.z;
        const angle = angleAt(x, z) / (Math.PI * 2) * 24, side = Math.round(angle) % 24;
        if (band < 0 || band > 12 || Math.abs(level - band) > 1e-6 ||
            Math.abs(angle - Math.round(angle)) > 1e-6 || Math.hypot(x, z) < 1e-6) continue;
        const key = band * 24 + side, previous = rings.get(key);
        if (!previous || Math.hypot(x, z) < Math.hypot(previous[0] - face.crown.x, previous[2] - face.crown.z)) {
            rings.set(key, [p[i], p[i + 1], p[i + 2]]);
        }
    }
    assert.equal(rings.size, 13 * 24, `${label}/${hat}: missing crown surface`);
    const point = (band, side) => rings.get(band * 24 + side);
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    for (let i = 0; i < scalp.length; i += 3) {
        if (scalp[i + 1] < face.crown.bottom) continue;
        const x = scalp[i] - face.crown.x, z = scalp[i + 2] - face.crown.z, distance = Math.hypot(x, z);
        if (distance < 1e-6) continue;
        const angle = angleAt(x, z);
        const side = Math.min(23, Math.floor(angle / (Math.PI * 2) * 24));
        const level = (scalp[i + 1] - face.crown.bottom) / (top - face.crown.bottom) * 12;
        const band = Math.min(11, Math.floor(level)), t = level - band;
        const edge = [side, (side + 1) % 24].map(index => {
            const low = point(band, index), high = point(band + 1, index);
            return [low[0] + (high[0] - low[0]) * t - face.crown.x,
                low[2] + (high[2] - low[2]) * t - face.crown.z];
        });
        const direction = [x / distance, z / distance], delta = [edge[1][0] - edge[0][0], edge[1][1] - edge[0][1]];
        const shell = cross(edge[0], delta) / cross(direction, delta);
        assert.ok(shell >= distance - 0.0005, `${label}/${hat}: scalp vertex ${i / 3} protrudes through the crown`);
    }
    const widths = [0, 2].map(axis => {
        const values = Array.from({ length: p.length / 3 }, (_, i) => p[i * 3 + axis]);
        return Math.max(...values) - Math.min(...values);
    });
    assert.ok(widths[0] <= face.crown.rx * 2 + 0.085 * scale, `${label}/${hat}: oversized sides`);
    assert.ok(widths[1] <= face.crown.rz * 2 + 0.085 * scale, `${label}/${hat}: oversized depth`);
}

test('legacy party-cone appearances migrate to the squat bucket hat', () => {
    const { AvatarAppearance: A, AvatarDetails } = context(true);
    const legacy = { ...A.defaults('f1'), v: 2, glasses: 'none', facialHair: 'none', hat: 'party' };
    assert.equal(A.sanitize(legacy).hat, 'bucket');
    const face = {
        eye: [0, 1.6, 0], top: 1.78, half: 0.08, centerZ: 0, radiusZ: 0.05,
        front: () => 0.05, project: (x, y) => [x, y, 0],
        crown: { x: 0, z: 0, rx: 0.08, rz: 0.05, bottom: 1.63, top: 1.78, power: 2,
            profile: Array.from({ length: 13 }, (_, i) => Math.sqrt(1 - (i / 12) ** 2)) }
    };
    const geometry = AvatarDetails._geometry(face, { hat: 'bucket' });
    const topX = [];
    for (let i = 0; i < geometry.positions.length; i += 3) {
        if (geometry.positions[i + 1] > 1.78) topX.push(geometry.positions[i]);
    }
    assert.ok(geometry.indices.length > 0);
    assert.ok(topX.length > 0);
    assert.ok(Math.max(...topX) - Math.min(...topX) > 0.08, 'the flat crown retains a wide top rather than narrowing to a cone');
});

test('every hat encloses the real scalp without floating or oversized brims across both casts', async () => {
    const box = context(true), B = box.BABYLON;
    B.Logger.LogLevels = B.Logger.ErrorLogLevel;
    const engine = new B.NullEngine(), scene = new B.Scene(engine);
    const sources = [
        ...Object.entries(box.CharacterCatalog.people).map(([id, person]) => ({ id, ...person })),
        ...Object.keys(box.CharacterCatalog.players).map(id => ({ id: `lightweight/${id}`,
            url: `js/models/avatars/club-crowd-${id}.glb` }))
    ];
    try {
        for (const source of sources) {
            const bytes = readFileSync(join(root, source.url));
            const container = await B.SceneLoader.LoadAssetContainerAsync('',
                `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
            try {
                const body = container.meshes.find(mesh => mesh.skeleton && mesh.getTotalVertices() &&
                    /_opaque$|^Crowd$/i.test(mesh.material?.name || ''));
                assert.ok(body, `${source.id}: missing real head geometry`);
                for (const hat of ['cap', 'beanie', 'fedora', 'bucket']) {
                    assertHatFit(box, body, source.eye || box.AvatarDetails._eyes(body), hat, source.id);
                }
            } finally {
                container.dispose();
            }
        }
    } finally {
        scene.dispose(); engine.dispose();
    }
});

test('all 17 real wardrobe rigs share textures but never colours, select only fitted parts and retain clips', async () => {
    const box = context(true), B = box.BABYLON, A = box.AvatarAppearance;
    B.Logger.LogLevels = B.Logger.ErrorLogLevel;
    for (const [id, source] of Object.entries(box.WardrobeCatalog)) {
        const engine = new B.NullEngine(), scene = new B.Scene(engine);
        const bytes = readFileSync(join(root, source.url));
        const container = await B.SceneLoader.LoadAssetContainerAsync('',
            `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
        const factory = new box.MaterialFactory(scene, 3);
        let first, second;
        try {
            A.prepare(container);
            const skinParts = container.meshes.filter(mesh => /^wardrobe_skin_(original|casual|smart)$/.test(mesh.name));
            assert.equal(skinParts.length, 3, `${id}: each outfit needs its own authored body-occlusion mask`);
            assert.equal(new Set(skinParts.map(mesh => mesh.geometry)).size, 3);
            assert.equal(new Set(skinParts.map(mesh => mesh.material.albedoTexture)).size, 1, 'masked bodies share their skin texture');
            const baselineTextures = scene.textures.length;
            first = A.instantiate(container, 'one_', A.defaults(id), factory);
            second = A.instantiate(container, 'two_', { ...A.defaults(id), top: '#ff0000', skin: '#559955' }, factory);
            assert.equal(scene.textures.length, baselineTextures, `${id}: cloned a texture`);
            const meshes = instance => instance.root.getChildMeshes().filter(mesh => mesh.getTotalVertices());
            const skin = instance => meshes(instance).find(mesh => /wardrobe_skin(?:_|$)/.test(mesh.name) && mesh.isEnabled());
            assert.notStrictEqual(skin(first).material, skin(second).material);
            assert.strictEqual(skin(first).material.baseTexture, skin(second).material.baseTexture);
            assert.notDeepEqual(skin(first).material.baseColor.asArray(), skin(second).material.baseColor.asArray());
            for (const hair of ['original', 'short', 'long']) for (const outfit of ['original', 'casual', 'smart']) {
                first.update({ ...A.defaults(id), hair, outfit });
                const active = meshes(first).filter(mesh => mesh.isEnabled());
                assert.ok(active.length >= 4 && active.length <= 6, `${id}: ${active.length} visible draws`);
                assert.equal(active.filter(mesh => /wardrobe_hair_/.test(mesh.name)).length, 1);
                assert.equal(active.filter(mesh => mesh.name.endsWith(`wardrobe_skin_${outfit}`)).length, 1,
                    `${id}/${outfit}: skin mask must match the outfit`);
                assert.equal(active.filter(mesh => /wardrobe_skin_/.test(mesh.name)).length, 1);
                if (outfit === 'casual') {
                    const graphic = active.find(mesh => mesh.metadata?.vrclubPrint);
                    assert.ok(graphic, `${id}: Casual needs its fitted print`);
                    const start = graphic.metadata.vrclubPrintVertexStart;
                    assert.ok(graphic.getTotalVertices() > start);
                    first.update({ ...A.defaults(id), hair, outfit, top: '#ffffff' });
                    assert.ok(graphic.getVerticesData(B.VertexBuffer.ColorKind)[start * 4] < 0.1,
                        `${id}: pale shirts need dark ink rather than an invisible white print`);
                }
                for (const mesh of active) {
                    assert.equal(mesh.material.maxSimultaneousLights, 3);
                    assert.equal(mesh.material.needAlphaBlending(), false);
                    assert.equal(mesh.material.disableDepthWrite, false);
                }
            }
            const version2 = { ...A.defaults(id), v: 2, hair: 'bald', glasses: 'none', facialHair: 'none', hat: 'none' };
            for (const [field, choices] of Object.entries(A.ACCESSORIES)) for (const choice of choices) {
                const look = { ...version2, [field]: choice };
                first.update(look);
                const active = meshes(first).filter(mesh => mesh.isEnabled());
                assert.ok(active.length <= 6, `${id}/${field}/${choice}: ${active.length} draws`);
                assert.equal(active.filter(mesh => /wardrobe_hair_/.test(mesh.name)).length, 0, `${id}: bald still has hair`);
                const details = meshes(first).find(mesh => mesh.metadata?.vrclubAdornment);
                if (choice !== 'none') {
                    assert.ok(details?.isEnabled(), `${id}/${field}/${choice}: missing accessory`);
                    assert.strictEqual(details.skeleton, skin(first).skeleton);
                    assert.ok(details.getVerticesData(B.VertexBuffer.PositionKind).every(Number.isFinite));
                    assert.ok(details.getVerticesData(B.VertexBuffer.NormalKind).every(Number.isFinite));
                    assert.equal(details.material.maxSimultaneousLights, 3);
                    assert.equal(details.material.needAlphaBlending(), false);
                }
                if (field === 'glasses' && ['round', 'square', 'sunglasses'].includes(choice)) {
                    assert.equal(details.metadata.vrclubAuthoredGlasses, choice, `${id}: missing CC0 eyewear`);
                    const count = details.metadata.vrclubAuthoredGlassesVertexCount;
                    const points = details.getVerticesData(B.VertexBuffer.PositionKind);
                    const x = [], y = [];
                    for (let i = 0; i < count; i++) {
                        x.push(points[i * 3]);
                        y.push(points[i * 3 + 1]);
                    }
                    if (field === 'hat' && choice !== 'none') assertHatFit(box, skin(first), source.eye, choice, `wardrobe/${id}`);
                    assert.ok(Math.max(...x) - Math.min(...x) > 0.07 && Math.max(...x) - Math.min(...x) < 0.25,
                        `${id}/${choice}: eyewear width is outside face scale`);
                    assert.ok(Math.min(...y) < source.eye[1] && Math.max(...y) > source.eye[1] &&
                        Math.max(...y) - Math.min(...y) < 0.1, `${id}/${choice}: eyewear misses the measured eyes`);
                }
            }
            first.update({ ...version2, hair: 'long', glasses: 'star', facialHair: 'beard', hat: 'bucket' });
            assert.equal(meshes(first).filter(mesh => mesh.isEnabled() && /wardrobe_hair_/.test(mesh.name)).length, 0, 'hat hides intersecting hair');
            assert.equal(scene.textures.length, baselineTextures, 'accessories add no texture copies');
            const sourceSkin = container.meshes.find(mesh => mesh.name === 'wardrobe_skin_original');
            const sourceIndices = Array.from(sourceSkin.getIndices());
            const sourceMasks = Array.from(sourceSkin.getVerticesData(B.VertexBuffer.ColorKind));
            const secondIndices = Array.from(skin(second).getIndices());
            for (const shoes of A.FOOTWEAR.shoes) for (const legwear of A.FOOTWEAR.legwear) {
                first.update({ ...version2, v: 3, hair: 'original', shoes, legwear });
                const active = meshes(first).filter(mesh => mesh.isEnabled());
                assert.ok(active.length <= 6, `${id}/${shoes}/${legwear}: ${active.length} visible draws`);
                assert.equal(active.filter(mesh => /wardrobe_shoes_/.test(mesh.name)).length, 1);
                const shoeMesh = active.find(mesh => mesh.name.endsWith(`wardrobe_shoes_${shoes}`));
                assert.ok(shoeMesh);
                const shoePositions = shoeMesh.getVerticesData(B.VertexBuffer.PositionKind);
                const footHeights = Array.from({ length: shoeMesh.getTotalVertices() }, (_, vertex) =>
                    shoePositions[vertex * 3 + 1]).filter(height => height < 0.3);
                if (shoes !== 'original') assert.ok(Math.abs(Math.min(...footHeights)) < 0.015,
                    `${id}/${shoes}: the new shoe sole must meet the shared floor`);
                if (['loafers', 'pumps'].includes(shoes)) assert.ok(Math.max(...footHeights) < 0.12,
                    `${id}/${shoes}: low-cut shoes must not contain sock geometry`);
                const body = skin(first), flags = sourceMasks, channel = A.FOOTWEAR.shoes.indexOf(shoes);
                const expectedIndices = [];
                for (let index = 0; index < sourceIndices.length; index += 3) {
                    const triangle = sourceIndices.slice(index, index + 3);
                    const visible = vertex => flags[vertex * 4 + channel] < 0.5;
                    if (shoes === 'heels' ? triangle.some(visible) : triangle.every(visible)) expectedIndices.push(...triangle);
                }
                assert.deepEqual(Array.from(body.getIndices()), expectedIndices, `${id}/${shoes}: wrong foot mask`);
                if (shoes === 'heels') {
                    const positions = body.getVerticesData(B.VertexBuffer.PositionKind);
                    let toe = -Infinity;
                    for (let vertex = 0; vertex < shoeMesh.getTotalVertices(); vertex++) {
                        if (shoePositions[vertex * 3 + 1] < 0.3) toe = Math.max(toe, shoePositions[vertex * 3 + 2]);
                    }
                    assert.ok(Array.from(body.getIndices()).every(vertex =>
                        positions[vertex * 3 + 1] > 0.09 || positions[vertex * 3 + 2] <= toe + 0.005),
                        `${id}: bare toes must not protrude from the fitted high-heel silhouette`);
                }
                assert.notStrictEqual(body.geometry, sourceSkin.geometry, 'skin geometry must be instance-owned');
                assert.equal(body.useVertexColors, legwear !== 'bare');
                assert.equal(body.hasVertexAlpha, false, 'sheer tights must not introduce transparency');
                const colors = body.getVerticesData(B.VertexBuffer.ColorKind);
                const indices = body.getVerticesData(B.VertexBuffer.MatricesIndicesKind);
                const weights = body.getVerticesData(B.VertexBuffer.MatricesWeightsKind);
                const legs = new Set(body.skeleton.bones.filter(bone =>
                    /^(UpperLeg|LowerLeg|Foot)[.]/.test(bone.name)).map(bone => bone.getIndex()));
                let tinted = 0, untouched = 0;
                for (let vertex = 0; vertex < body.getTotalVertices(); vertex++) {
                    const legWeight = [0, 1, 2, 3].reduce((sum, slot) =>
                        sum + (legs.has(indices[vertex * 4 + slot]) ? weights[vertex * 4 + slot] : 0), 0);
                    if (legWeight < 0.001) {
                        assert.ok(colors[vertex * 4] > 0.999, `${id}: tights tinted a non-leg vertex`);
                        untouched++;
                    } else if (colors[vertex * 4] < 0.99) tinted++;
                    assert.equal(colors[vertex * 4 + 3], 1);
                }
                assert.ok(untouched > 500);
                if (legwear !== 'bare') assert.ok(tinted > 100, `${id}: tights did not reach the legs`);
                assert.equal(scene.textures.length, baselineTextures, 'footwear must share source textures');
                assert.deepEqual(Array.from(sourceSkin.getIndices()), sourceIndices, 'a choice mutated its source skin');
                assert.deepEqual(Array.from(sourceSkin.getVerticesData(B.VertexBuffer.ColorKind)), sourceMasks);
                assert.deepEqual(Array.from(skin(second).getIndices()), secondIndices, 'a choice changed another visitor');
            }
            first.update(A.defaults(id));
            assert.throws(() => first.update(A.defaults(id === 'f1' ? 'm1' : 'f1')));
            const eye = container.transformNodes.find(node => node.name === 'Head');
            eye.computeWorldMatrix(true);
            assert.ok(Math.abs(source.eye[1] - eye.absolutePosition.y - 0.07) < 0.08,
                `${id}: eye landmark must use this wardrobe's actual bind space`);
            new B.FreeCamera('camera', new B.Vector3(0, 2, -4), scene);
            const head = first.root.getChildTransformNodes().find(node => node.name.endsWith('_Head'));
            for (const name of ['Idle', 'Walk', 'Run', 'Wave', 'Yes', 'Dance_Loop', 'Seated_Loop', 'Seated_Low_Loop']) {
                const clip = first.entry.animationGroups.find(group => group.name.endsWith(`_${name}`));
                assert.ok(clip, `${id}: missing ${name}`);
                clip.start(true); clip.pause(); clip.goToFrame(clip.from + (clip.to - clip.from) * 0.45);
                scene.render();
                head.computeWorldMatrix(true);
                assert.ok(Number.isFinite(head.absolutePosition.y), `${id}/${name}: invalid skeleton`);
                clip.stop();
            }
            first.dispose(); first.dispose();
            assert.ok(!skin(second).material.baseTexture.isDisposed, 'one visitor cannot dispose another visitor texture');
        } finally {
            first?.dispose(); second?.dispose(); container.dispose(); factory.dispose(); scene.dispose(); engine.dispose();
        }
    }
});

test('detailed NPC accessories fit real heads and the bouncer plus two other men have no hair mesh', async () => {
    const box = context(true), B = box.BABYLON;
    B.Logger.LogLevels = B.Logger.ErrorLogLevel;
    for (const [id, look] of Object.entries(box.AvatarDetails.NPCS)) for (const lightweight of [false, true]) {
        const engine = new B.NullEngine(), scene = new B.Scene(engine);
        const sourceId = Object.keys(box.CharacterCatalog.npcs).find(key => box.CharacterCatalog.npcs[key] === id);
        const character = lightweight ? null : box.CharacterCatalog.people[id];
        const url = lightweight ? `js/models/avatars/club-crowd-${sourceId}.glb` : character.url;
        const bytes = readFileSync(join(root, url));
        const container = await B.SceneLoader.LoadAssetContainerAsync('', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
        const factory = new box.MaterialFactory(scene, 3);
        try {
            container.animationGroups.forEach(group => group.stop());
            const entry = container.instantiateModelsToScene(name => `npc_${name}`, false, { doNotInstantiate: true });
            const meshes = entry.rootNodes.flatMap(node => node.getChildMeshes());
            box.AvatarDetails.applyNPC(meshes, character, factory, id, sourceId);
            const hasAccessory = ['glasses', 'hat', 'facialHair'].some(key => look[key] && look[key] !== 'none');
            const hasPrint = !!look.print && (lightweight || character.printSurfaces.original === true);
            assert.equal(meshes.filter(mesh => mesh.metadata?.vrclubAdornment && mesh.isEnabled()).length,
                Number(hasAccessory || hasPrint), id);
            if (!hasAccessory && !hasPrint) {
                assert.ok(!meshes.some(mesh => mesh.metadata?.vrclubPrint), `${id}: do not overlay an unverified garment`);
                continue;
            }
            if (!lightweight && (look.bald || look.hat)) {
                const hair = meshes.filter(mesh => /hair/i.test(mesh.material?.name || ''));
                assert.ok(hair.length > 0, `${id}: no original hair was checked`);
                assert.ok(hair.every(mesh => !mesh.isEnabled()), `${id}: hair still visible`);
            }
            const adornment = meshes.find(mesh => mesh.metadata?.vrclubAdornment);
            const skin = meshes.find(mesh => mesh.skeleton && !mesh.metadata?.vrclubAdornment && /skin|opaque|Crowd/i.test(mesh.material?.name || ''));
            assert.strictEqual(adornment.skeleton, skin.skeleton);
            assert.ok(adornment.getTotalVertices() < 5000);
            assert.equal(adornment.material.needAlphaBlending(), false);
            if (look.hat) assertHatFit(box, skin, character?.eye || box.AvatarDetails._eyes(skin), look.hat, `${id}/${lightweight}`);
            if (['round', 'square', 'sunglasses'].includes(look.glasses)) {
                assert.equal(adornment.metadata.vrclubAuthoredGlasses, look.glasses, `${id}: expected creator-authored eyewear`);
                const eyes = character?.eye || box.AvatarDetails._eyes(skin);
                const points = adornment.getVerticesData(B.VertexBuffer.PositionKind);
                const vertexCount = adornment.metadata.vrclubAuthoredGlassesVertexCount;
                const glasses = points.slice(0, vertexCount * 3);
                const minX = Math.min(...Array.from({ length: vertexCount }, (_, i) => glasses[i * 3]));
                const maxX = Math.max(...Array.from({ length: vertexCount }, (_, i) => glasses[i * 3]));
                const minY = Math.min(...Array.from({ length: vertexCount }, (_, i) => glasses[i * 3 + 1]));
                const maxY = Math.max(...Array.from({ length: vertexCount }, (_, i) => glasses[i * 3 + 1]));
                assert.ok(maxX - minX > 0.07 && maxX - minX < 0.25, `${id}: glasses width is outside face scale`);
                assert.ok(minY < eyes[1] && maxY > eyes[1] && maxY - minY < 0.1,
                    `${id}: glasses ${minY.toFixed(3)}..${maxY.toFixed(3)} miss measured eye height ${eyes[1].toFixed(3)}`);
            }
            scene.activeCamera = new B.FreeCamera('camera', new B.Vector3(0, 1.7, -3), scene);
            scene.render();
            const head = adornment.skeleton.bones.find(bone => /(^|_)Head$/i.test(bone.name));
            head.getTransformNode().scaling.setAll(0.0001);
            scene.render();
            const matrix = B.Matrix.FromArray(adornment.skeleton.getTransformMatrices(adornment), head.getIndex() * 16);
            const points = adornment.getVerticesData(B.VertexBuffer.PositionKind);
            const min = new B.Vector3(Infinity, Infinity, Infinity), max = min.negate();
            for (let i = 0; i < adornment.metadata.vrclubPrintVertexStart * 3; i += 3) {
                const point = B.Vector3.TransformCoordinates(B.Vector3.FromArray(points, i), matrix);
                min.minimizeInPlace(point); max.maximizeInPlace(point);
            }
            if (adornment.metadata.vrclubPrintVertexStart) {
                assert.ok(B.Vector3.Distance(min, max) < 0.001, `${id}: accessories must collapse with the first-person head`);
            }
            if (look.print) {
                const eyes = character?.eye || box.AvatarDetails._eyes(skin);
                assert.equal(adornment.metadata.vrclubPrint, look.print);
                if (!lightweight) {
                    const unknown = box.AvatarDetails.create(meshes, { ...character, printSurfaces: undefined }, factory, 'unknown');
                    unknown.update(look);
                    assert.ok(!unknown.mesh.metadata.vrclubPrint, `${id}: an unknown textured shirt must not receive another graphic`);
                    unknown.mesh.dispose();
                }
                assert.ok(points.length / 3 > adornment.metadata.vrclubPrintVertexStart, `${id}: missing shirt print`);
                const joints = adornment.getVerticesData(B.VertexBuffer.MatricesIndicesKind);
                const weights = adornment.getVerticesData(B.VertexBuffer.MatricesWeightsKind);
                for (let i = adornment.metadata.vrclubPrintVertexStart; i < points.length / 3; i++) {
                    assert.ok(points[i * 3 + 1] > eyes[1] * 0.6 && points[i * 3 + 1] < eyes[1] * 0.95,
                        `${id}: print outside the shirt`);
                    const headShare = Array.from(weights.slice(i * 4, i * 4 + 4)).reduce((sum, weight, j) =>
                        sum + (joints[i * 4 + j] === head.getIndex() ? weight : 0), 0);
                    assert.ok(headShare < 0.1,
                        `${id}/${lightweight}: shirt print at ${Array.from(points.slice(i * 3, i * 3 + 3))} follows head ${head.getIndex()} instead of torso: ${Array.from(joints.slice(i * 4, i * 4 + 4))}, ${Array.from(weights.slice(i * 4, i * 4 + 4))}`);
                }
            }
            entry.dispose();
            assert.ok(adornment.isDisposed(), 'root disposal must release accessory geometry');
        } finally { container.dispose(); factory.dispose(); scene.dispose(); engine.dispose(); }
    }
});

test('the queue phone stays in the raised palm near the ear for both real character styles', async () => {
    const box = context(true), B = box.BABYLON;
    B.Logger.LogLevels = B.Logger.ErrorLogLevel;
    for (const url of ['js/models/avatars/club-crowd-vf7.glb', 'js/models/characters/vera.glb']) {
        const engine = new B.NullEngine(), scene = new B.Scene(engine);
        scene.activeCamera = new B.FreeCamera('camera', new B.Vector3(0, 1.7, -3), scene);
        const bytes = readFileSync(join(root, url));
        const container = await B.SceneLoader.LoadAssetContainerAsync('', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
        const factory = new box.MaterialFactory(scene, 3);
        try {
            container.animationGroups.forEach(group => group.stop());
            const entry = container.instantiateModelsToScene(name => `caller_${name}`, false, { doNotInstantiate: true });
            const node = entry.rootNodes[0];
            node.rotationQuaternion = null;
            node.rotation.y = -0.87;
            node.scaling.setAll(0.95);
            node.position.set(7.45, 2.8, 6.9);
            const group = entry.animationGroups.find(item => item.name.endsWith('Idle_TalkingPhone_Loop'));
            assert.ok(group, url);
            group.start(true); group.pause(); group.goToFrame(group.from);
            scene.render();
            const meshes = node.getChildMeshes();
            const phone = box.AvatarDetails.phone(meshes, factory, 'queue5');
            const hand = phone.parent;
            const bones = meshes.find(mesh => mesh.skeleton).skeleton.bones;
            const head = bones.find(bone => /(^|_)Head$/i.test(bone.name)).getTransformNode();
            const side = bones.find(bone => bone.getTransformNode() === hand).name.slice(-1);
            const knuckle = bones.find(bone => bone.name.endsWith(`Middle2.${side}`)).getTransformNode();
            for (let i = 0; i <= 60; i++) {
                group.goToFrame(group.from + (group.to - group.from) * i / 60);
                scene.render();
                assert.ok(Math.abs(phone.getWorldMatrix().determinant()) > 0.5, `${url}: collapsed, invisible phone`);
                const center = phone.getAbsolutePosition();
                assert.ok(B.Vector3.Distance(center, hand.getAbsolutePosition()) < 0.11, `${url}: phone left the palm`);
                assert.ok(B.Vector3.Distance(center, head.getAbsolutePosition()) < 0.3, `${url}: phone is not beside the head`);
                const palm = B.Vector3.Center(hand.getAbsolutePosition(), knuckle.getAbsolutePosition());
                const local = B.Vector3.TransformCoordinates(palm, phone.getWorldMatrix().clone().invert());
                assert.ok(Math.abs(local.x) < 0.01 && Math.abs(local.y + 0.02) < 0.01 &&
                    Math.abs(local.z + 0.014) < 0.003, `${url}/${i}: palm at ${local.asArray()}, outside the phone grip`);
                const screen = B.Vector3.TransformNormal(B.Axis.Z, phone.getWorldMatrix()).normalize();
                assert.ok(B.Vector3.Dot(screen, head.getAbsolutePosition().subtract(center)) > 0, `${url}: screen faces away from the ear`);
            }
            assert.equal(phone.material.needAlphaBlending(), false);
            assert.equal(phone.material.maxSimultaneousLights, 3);
            assert.equal(phone.subMeshes.length, 1);
            entry.dispose();
            assert.ok(phone.isDisposed(), 'style changes must dispose the hand prop');
        } finally { container.dispose(); factory.dispose(); scene.dispose(); engine.dispose(); }
    }
});

test('lightweight bald people retain a solid scalp without adding any mesh or material', async () => {
    const { NodeIO } = await import('@gltf-transform/core');
    const io = new NodeIO(), box = context(true), B = box.BABYLON;
    for (const id of ['bouncer', 'm4', 'm7']) {
        const document = await io.read(join(root, `js/models/avatars/club-crowd-${id}.glb`));
        assert.equal(document.getRoot().getExtras().bald, true);
        assert.ok(document.getRoot().getExtras().removedHairTriangles >= 100);
        assert.equal(document.getRoot().listMeshes().length, 1);
        assert.equal(document.getRoot().listMaterials().length, 1);
        const skin = document.getRoot().listSkins()[0], joints = skin.listJoints();
        const index = joints.findIndex(joint => joint.getName() === 'Head');
        const head = B.Matrix.FromArray(skin.getInverseBindMatrices().getElement(index, [])).invert().getTranslation();
        const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
        const position = primitive.getAttribute('POSITION'), indices = primitive.getIndices();
        const origin = new B.Vector3(head.x, head.y + 0.5, head.z);
        const ray = new B.Ray(origin, B.Vector3.Down(), 1);
        let hit = null;
        for (let i = 0; i < indices.getCount(); i += 3) {
            const points = [0, 1, 2].map(j => B.Vector3.FromArray(position.getElement(indices.getScalar(i + j), [])));
            const info = ray.intersectsTriangle(...points);
            if (info && (!hit || info.distance < hit.distance)) hit = info;
        }
        assert.ok(hit && origin.y - hit.distance > head.y + 0.08, `${id}: removing hair opened the scalp`);
    }
});

test('load order keeps the wardrobe and personal editor before VRClub and before UI initialization', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(match => match[1]);
    for (const [before, after] of [['js/wardrobeCatalog.js', 'js/avatarAccessoryAssets.js'],
        ['js/avatarAccessoryAssets.js', 'js/avatarDetails.js'],
        ['js/avatarDetails.js', 'js/avatarAppearance.js'],
        ['js/avatarAppearance.js', 'js/avatarEditor.js'], ['js/avatarEditor.js', 'js/club_hyperrealistic.js'],
        ['js/club_hyperrealistic.js', 'js/ui-init.js']]) {
        assert.ok(scripts.indexOf(before) >= 0 && scripts.indexOf(before) < scripts.indexOf(after));
    }
});

test('wardrobe source loads are deduplicated and retired textures are released only after the final user', async () => {
    const box = context();
    let timer, loads = 0, disposals = 0;
    box.setTimeout = callback => { timer = callback; return 1; };
    box.AvatarAppearance.prepare = () => {};
    const container = { dispose: () => disposals++ };
    const club = { ...box.PersonalAppearance, maxLights: 3, _avatarContainers: [container],
        _loadAvatarSource: async () => { loads++; return container; } };
    const [first, second] = await Promise.all([club._loadWardrobeSource('m2'), club._loadWardrobeSource('m2')]);
    assert.strictEqual(first, second);
    assert.equal(loads, 1);
    const record = club._wardrobeSources.get('m2');
    record.users = 1;
    club._scheduleWardrobeCleanup();
    timer();
    assert.equal(disposals, 0, 'another guest still uses this wardrobe');
    record.users = 0;
    club._scheduleWardrobeCleanup();
    timer();
    assert.equal(disposals, 1);
    assert.equal(club._wardrobeSources.size, 0);
    assert.equal(club._avatarContainers.length, 0);
});
