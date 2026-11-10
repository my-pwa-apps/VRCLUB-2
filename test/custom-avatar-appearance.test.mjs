import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const box = { console, setTimeout, clearTimeout, performance, URL, TextDecoder, TextEncoder };
box.window = box; box.self = box; box.globalThis = box;
box.addEventListener = () => {};
box.removeEventListener = () => {};
vm.createContext(box);
for (const file of ['js\\vendor\\babylon.js', 'js\\materialFactory.js', 'js\\avatarDetails.js',
    'js\\customAvatarAppearance.js', 'js\\avatarEditor.js']) {
    vm.runInContext(readFileSync(`${root}\\${file}`, 'utf8'), box, { filename: file });
}
const B = box.BABYLON, api = box.CustomAvatarAppearance;
B.Logger.LogLevels = B.Logger.ErrorLogLevel;

function fixture() {
    const engine = new B.NullEngine(), scene = new B.Scene(engine);
    const names = ['Hips', 'Spine', 'Spine1', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg',
        'RightLeg', 'LeftForeArm', 'RightForeArm', 'LeftFoot', 'RightFoot'];
    const skeleton = new B.Skeleton('testHumanoid', 'testHumanoid', scene);
    names.forEach(name => new B.Bone(name, skeleton, null, B.Matrix.Identity()));
    const parts = [[0, 1.25, 0, 0.55, 0.5], [-0.13, 0.52, 0, 0.25, 0.8],
        [0.13, 0.52, 0, 0.25, 0.8], [0, 1.66, 0, 0.26, 0.28],
        [-0.42, 1.2, 0, 0.12, 0.35], [0.42, 1.2, 0, 0.12, 0.35]].map((part, index) => {
        const mesh = B.MeshBuilder.CreateSphere(`part${index}`, { diameter: 1, segments: 12 }, scene);
        mesh.scaling.set(part[3], part[4], part[3]);
        mesh.position.set(part[0], part[1], part[2]);
        mesh.bakeCurrentTransformIntoVertices();
        return mesh;
    });
    const body = B.Mesh.MergeMeshes(parts, true, true);
    const p = body.getVerticesData(B.VertexBuffer.PositionKind), joints = [], weights = [];
    for (let i = 0; i < p.length; i += 3) {
        const y = p[i + 1], x = p[i];
        const name = y > 1.5 ? 'Head' : Math.abs(x) > 0.34 ? 'LeftForeArm' : y > 1.0 ? 'Spine' : 'LeftLeg';
        joints.push(names.indexOf(name), 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    body.setVerticesData(B.VertexBuffer.MatricesIndicesKind, joints);
    body.setVerticesData(B.VertexBuffer.MatricesWeightsKind, weights);
    body.skeleton = skeleton;
    const factory = vm.runInContext('MaterialFactory', box);
    const materialFactory = new factory(scene, 3, { log() {} });
    body.material = materialFactory.createPBRMaterial('original', { baseColor: [1, 1, 1], mutable: true }, false);
    const faceTexture = new B.RawTexture(new Uint8Array([211, 180, 150, 255]), 1, 1, B.Engine.TEXTUREFORMAT_RGBA, scene);
    body.material.albedoTexture = faceTexture;
    const rig = { meshes: [body], club: { materialFactory, maxLights: 3 } };
    return { engine, scene, body, rig, materialFactory, faceTexture,
        dispose() { api.dispose(rig); materialFactory.dispose(); scene.dispose(); engine.dispose(); } };
}

test('uploaded descriptor is bounded, canonical and rejects unknown wardrobe values', () => {
    const value = api.defaults();
    assert.equal(api.key({ ...value, top: '#AABBCC', extra: 'ignored' }),
        api.key({ ...value, top: '#aabbcc' }));
    for (const invalid of [null, {}, { ...value, v: 2 }, { ...value, outfit: 'dress' },
        { ...value, glasses: 'star' }, { ...value, hat: 'fedora' }, { ...value, top: 'red' }]) {
        assert.throws(() => api.sanitize(invalid));
    }
    assert.deepEqual(Object.keys(api.sanitize(value)), ['v', 'outfit', 'top', 'bottom', 'glasses', 'hat']);
});

test('single-mesh fitting preserves original face texture and geometry, cuts covered skin, retains skin weights', () => {
    const f = fixture();
    try {
        const sourceGeometry = f.body.geometry, sourceIndices = Array.from(f.body.getIndices());
        const originalVertices = Array.from(f.body.getVerticesData(B.VertexBuffer.PositionKind));
        const look = { ...api.defaults(), outfit: 'casual', top: '#bf3657' };
        const fitted = api.apply(f.rig, look);
        assert.equal(fitted.meshes.length, 3);
        const [skin, top, bottom] = fitted.meshes;
        assert.equal(f.body.isEnabled(), false);
        assert.equal(skin.material, f.body.material);
        assert.equal(skin.material.albedoTexture, f.faceTexture);
        assert.equal(top.material.albedoTexture == null, true);
        assert.equal(bottom.material.albedoTexture == null, true);
        assert.notEqual(top.geometry, sourceGeometry);
        assert.equal(top.skeleton, f.body.skeleton);
        assert.equal(top.getVerticesData(B.VertexBuffer.MatricesWeightsKind).length, top.getTotalVertices() * 4);
        assert.equal(skin.getIndices().length + top.getIndices().length + bottom.getIndices().length, sourceIndices.length);
        assert.deepEqual(Array.from(f.body.getIndices()), sourceIndices);
        assert.deepEqual(Array.from(f.body.getVerticesData(B.VertexBuffer.PositionKind)), originalVertices);
        const skinP = skin.getVerticesData(B.VertexBuffer.PositionKind);
        assert.ok(Array.from(skinP).some((value, index) => index % 3 === 1 && value > 1.5), 'face remains');
        assert.equal(top.material.transparencyMode, 0);
        assert.equal(top.material.needAlphaBlending(), false);
        assert.equal(top.material.maxSimultaneousLights, 3);
        assert.equal(api.apply(f.rig, look).meshes[0], skin, 'same descriptor reuses geometry');
        const casualVertices = top.getTotalVertices();
        const smart = api.apply(f.rig, { ...look, outfit: 'smart' });
        assert.ok(smart.meshes[1].getTotalVertices() > casualVertices, 'smart includes forearm sleeves');
        api.dispose(f.rig);
        assert.equal(f.rig.meshes.length, 1);
        assert.equal(f.body.isEnabled(), true);
        assert.equal(f.faceTexture.isDisposed, undefined);
    } finally { f.dispose(); }
});

test('unsupported fitting and material failures retain the previous look atomically', () => {
    const f = fixture();
    try {
        const before = api.apply(f.rig, { ...api.defaults(), outfit: 'casual' });
        f.rig.club._mirrorSignature = 'retained-mirror-list';
        const oldCreate = f.materialFactory.createPBRMaterial;
        f.materialFactory.createPBRMaterial = () => { throw new Error('GPU material failure'); };
        const count = f.scene.meshes.length;
        assert.throws(() => api.apply(f.rig, { ...api.defaults(), outfit: 'smart' }), /GPU material failure/);
        assert.equal(f.scene.meshes.length, count);
        assert.equal(before.meshes[0].isDisposed(), false);
        assert.equal(f.rig.club._mirrorSignature, 'retained-mirror-list');
        assert.equal(f.body.isEnabled(), false);
        f.materialFactory.createPBRMaterial = oldCreate;
        f.body.morphTargetManager = new B.MorphTargetManager(f.scene);
        assert.throws(() => api.apply(f.rig, { ...api.defaults(), outfit: 'smart' }), /no morph targets/);
        assert.equal(f.rig.club._mirrorSignature, 'retained-mirror-list');
        api.apply(f.rig, api.defaults());
        assert.equal(f.rig.club._mirrorSignature, null);
        assert.equal(f.body.isEnabled(), true);
        assert.equal(f.body.material.albedoTexture, f.faceTexture);
    } finally { f.dispose(); }
});

test('same-count wardrobe replacement and disposal invalidate the mirror list, but unchanged looks do not', () => {
    const f = fixture();
    try {
        const look = { ...api.defaults(), outfit: 'casual', glasses: 'round' };
        f.rig.club._mirrorSignature = 'initial-mirror-list';
        const first = api.apply(f.rig, look);
        assert.equal(f.rig.club._mirrorSignature, null);
        f.rig.club._mirrorSignature = 'current-mirror-list';
        api.apply(f.rig, look);
        assert.equal(f.rig.club._mirrorSignature, 'current-mirror-list');
        const next = api.apply(f.rig, { ...look, top: '#345678' });
        assert.equal(next.meshes.length, first.meshes.length);
        assert.equal(first.meshes[0].isDisposed(), true);
        assert.equal(f.rig.club._mirrorSignature, null);
        f.rig.club._mirrorSignature = 'replacement-mirror-list';
        api.dispose(f.rig);
        assert.equal(f.rig.club._mirrorSignature, null);
    } finally { f.dispose(); }
});

test('measured accessories reuse the head skin and preserve original clothing and face', () => {
    const f = fixture();
    try {
        const result = api.apply(f.rig, { ...api.defaults(), glasses: 'round', hat: 'beanie' });
        assert.equal(result.meshes.length, 1);
        assert.equal(f.body.isEnabled(), true);
        assert.equal(f.body.material.albedoTexture, f.faceTexture);
        const accessory = result.meshes[0], weights = accessory.getVerticesData(B.VertexBuffer.MatricesWeightsKind);
        const joints = accessory.getVerticesData(B.VertexBuffer.MatricesIndicesKind);
        assert.equal(accessory.skeleton, f.body.skeleton);
        assert.ok(accessory.getIndices().length > 30);
        for (let i = 0; i < weights.length; i += 4) {
            assert.deepEqual(Array.from(weights.slice(i, i + 4)), [1, 0, 0, 0]);
            assert.equal(f.body.skeleton.bones[joints[i]].name, 'Head');
        }
        api.apply(f.rig, api.defaults());
        assert.equal(accessory.isDisposed(), true);
        assert.equal(f.rig.meshes.length, 1);
    } finally { f.dispose(); }
});

test('fitted garments and accessories recover after appearance changes under a disabled root', () => {
    for (const intrinsicallyEnabled of [true, false]) {
        const f = fixture();
        try {
            const root = new B.TransformNode('culledAvatarRoot', f.scene);
            f.body.parent = root;
            f.body.setEnabled(intrinsicallyEnabled);
            root.setEnabled(false);
            const look = { ...api.defaults(), outfit: 'casual', glasses: 'round', hat: 'beanie' };
            const first = api.apply(f.rig, look);
            assert.equal(first.meshes.length, 4);
            for (const mesh of first.meshes) {
                assert.equal(mesh.isEnabled(), false, 'root culling remains effective');
                assert.equal(mesh.isEnabled(false), intrinsicallyEnabled, 'intrinsic enabled state survives fitting');
            }
            root.setEnabled(true);
            for (const mesh of first.meshes) {
                assert.equal(mesh.isEnabled(), intrinsicallyEnabled, 'garments and accessories recover with the root');
                assert.equal(mesh.isVisible, true);
            }
            root.setEnabled(false);
            const updated = api.apply(f.rig, { ...look, outfit: 'smart', glasses: 'square', top: '#4688aa' });
            assert.equal(updated.meshes.length, 4);
            root.setEnabled(true);
            for (const mesh of updated.meshes) {
                assert.equal(mesh.isEnabled(), intrinsicallyEnabled, 'replacement garments and accessories recover');
            }
            root.setEnabled(false);
            api.apply(f.rig, api.defaults());
            assert.equal(f.body.isEnabled(false), intrinsicallyEnabled, 'restoring original preserves intrinsic state');
            root.setEnabled(true);
            assert.equal(f.body.isEnabled(), intrinsicallyEnabled);
            root.setEnabled(false);
            api.apply(f.rig, look);
            api.dispose(f.rig);
            root.setEnabled(true);
            assert.equal(f.body.isEnabled(), intrinsicallyEnabled, 'disposal restores the uncullable intrinsic state');
        } finally { f.dispose(); }
    }
});

test('uploaded wardrobe routes desktop and VR to uploaded controls without changing the face', async () => {
    const Editor = box.AvatarEditor;
    const saved = [], club = { isCustomAvatarSelected: () => true, getCustomAvatarAppearance: () => api.defaults(),
        setCustomAvatarAppearance: value => { saved.push(value); return value; } };
    const editor = new Editor(club);
    let opened = false;
    editor.openCustom = () => { opened = true; return true; };
    assert.equal(editor.open(), true);
    assert.equal(opened, true);
    assert.equal(editor.openVR(), true);
    for (const page of ['appearanceEditor', 'appearanceOutfit', 'appearanceGlasses', 'appearanceHat', 'appearanceTop', 'appearanceBottom']) {
        const definitions = editor.getVRDefinitions(page);
        assert.ok(definitions.length <= 12, page);
        assert.ok(definitions.every(button => !['skin', 'base', 'hairColor'].includes(button.field)), 'face controls omitted');
    }
    editor.setDraftValue('outfit', 'smart');
    editor.setDraftValue('skin', '#ff0000');
    assert.equal(await editor.saveVR(), true);
    assert.equal(saved[0].outfit, 'smart');
    assert.equal(saved[0].skin, undefined);
});

test('sharing UI is explicit, personal and explains downloadable model privacy', () => {
    const html = readFileSync(`${root}\\index.html`, 'utf8'), ui = readFileSync(`${root}\\js\\ui-init.js`, 'utf8');
    assert.match(html, /Share uploaded avatar with room guests/);
    assert.match(html, /Guests can retain a copy/);
    assert.match(ui, /setCustomAvatarSharing\(customAvatarShare.checked\)/);
    assert.match(ui, /customAvatarSharingStatus\?\.\(\)/);
    assert.match(ui, /customavatarsharingchange/);
    const order = ['avatarDetails.js', 'customAvatarAppearance.js', 'uploadedAvatarSharing.js', 'avatarRig.js'];
    assert.ok(order.every((file, index) => !index || html.indexOf(`src="js/${order[index - 1]}`) < html.indexOf(`src="js/${file}`)));
});
