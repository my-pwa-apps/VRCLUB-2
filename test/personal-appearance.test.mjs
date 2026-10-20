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
    'js/wardrobeCatalog.js', 'js/avatarAppearance.js']) {
        vm.runInContext(readFileSync(join(root, file), 'utf8'), box, { filename: file });
    }
    return box;
}

test('personal appearance validates the exact bounded descriptor and returns isolated drafts', () => {
    const { AvatarAppearance: A } = context();
    const appearance = A.defaults('f1');
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
                for (const mesh of active) {
                    assert.equal(mesh.material.maxSimultaneousLights, 3);
                    assert.equal(mesh.material.needAlphaBlending(), false);
                    assert.equal(mesh.material.disableDepthWrite, false);
                }
            }
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

test('load order keeps the wardrobe and personal editor before VRClub and before UI initialization', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(match => match[1]);
    for (const [before, after] of [['js/wardrobeCatalog.js', 'js/avatarAppearance.js'],
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
