// AvatarRig on the REAL dancer skeleton and the REAL Babylon, headless.
//
// The rig is mostly geometry (planted feet, IK, turning), so stubs would prove nothing: a
// stub cannot tell a foot that slides from one that is planted. These tests load the
// vendored Babylon into a vm with a NullEngine, load the shipped GLB from disk, and measure
// bone positions after posing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { TextDecoder, TextEncoder } from 'node:util';
import { Blob } from 'node:buffer';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let shared = null;
/** Babylon, loaded once into a vm and reused: parsing the 6 MB bundle per test file would dominate the run. */
function sandbox() {
    if (shared) return shared;
    const box = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, performance, URL,
        TextDecoder, TextEncoder, Blob, ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        btoa: s => Buffer.from(s, 'binary').toString('base64')
    };
    box.window = box; box.self = box; box.globalThis = box;
    box.addEventListener = () => {};
    box.removeEventListener = () => {};
    box.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, removeEventListener() {} };
    box.navigator = { userAgent: 'node' };
    vm.createContext(box);
    for (const file of ['js/vendor/babylon.js', 'js/vendor/babylonjs.loaders.min.js', 'js/avatarRig.js', 'js/djPerformer.js', 'js/avatarManager.js']) {
        vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), box, { filename: file });
    }
    box.BABYLON.Logger.LogLevels = box.BABYLON.Logger.WarningLogLevel | box.BABYLON.Logger.ErrorLogLevel;
    shared = box;
    return box;
}

async function loadContainer(glb) {
    const box = sandbox();
    const B = box.BABYLON;
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    const bytes = readFileSync(join(ROOT, 'js/models/avatars', glb));
    const container = await B.SceneLoader.LoadAssetContainerAsync(
        '', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
    return { B, scene, engine, container, box };
}

async function loadRig(glb = 'club-dancer-male.glb', options = { eyeHeight: 1.7 }) {
    const { B, scene, engine, container, box } = await loadContainer(glb);
    const Rig = vm.runInContext('AvatarRig', box);
    const rig = new Rig({ scene }, container, options);
    return { rig, B, scene, engine, Rig };
}

const DT = 1 / 60;
const makePose = () => ({ x: 0, z: -8, groundY: 0, eyeY: 1.7, headYaw: 0, headPitch: 0, left: null, right: null });
const pos = (rig, name) => rig.pos[rig.ix[name]];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const limbLengths = rig => ({
    thigh: dist(pos(rig, 'thigh_l'), pos(rig, 'calf_l')),
    calf: dist(pos(rig, 'calf_l'), pos(rig, 'foot_l')),
    upper: dist(pos(rig, 'upperarm_l'), pos(rig, 'lowerarm_l')),
    lower: dist(pos(rig, 'lowerarm_l'), pos(rig, 'hand_l'))
});

test('every network avatar follows real left/right dance and wave targets after animation without stretching limbs', async () => {
    const files = readdirSync(join(ROOT, 'js/models/avatars')).filter(file => /^club-crowd-[fm]\d+\.glb$/.test(file));
    assert.equal(files.length, 17);
    let totalMs = 0, frames = 0;
    for (const file of files) {
        const { B, scene, engine, container, box } = await loadContainer(file);
        box.VRClubAudioCrowd = { sourceIndex: () => 0 };
        const manager = new box.AvatarManager({ scene, _loadCrowdSource: async () => container, _crowdSourceContainers: [] });
        manager._createLabel = () => {
            const mesh = new B.Mesh('testLabel', scene);
            mesh.material = new B.StandardMaterial('testLabelMaterial', scene);
            mesh.material.diffuseTexture = { dispose() {} };
            return mesh;
        };
        manager._drawNameplate = () => {};
        manager.setPersonalSpace(false);
        manager.ensurePeer('p', 'Pat');
        await manager.setAvatar('p', file.slice('club-crowd-'.length, -4));
        const peer = manager.remotes.get('p');
        assert.ok(peer.person?.arms, `${file}: tracking helper missing`);
        const arms = peer.person.arms;
        const updateArms = arms.updateTrackedArms;
        arms.updateTrackedArms = function (...args) {
            const start = performance.now();
            updateArms.apply(this, args);
            totalMs += performance.now() - start;
            frames++;
        };
        new B.FreeCamera('camera', new B.Vector3(0, 2, -4), scene);
        const at = name => {
            const node = peer.person.node.getChildTransformNodes(false).find(n => n.name === `peerp_${name}`);
            node.computeWorldMatrix(true);
            return node.getAbsolutePosition().clone();
        };
        // Physical left is -X when facing +Z; imported bone names can be mirrored.
        const leftSuffix = at('UpperArm.L').x < at('UpperArm.R').x ? 'L' : 'R';
        const rightSuffix = leftSuffix === 'L' ? 'R' : 'L';
        for (const yaw of [-2.4, 0.7, Math.PI]) {
            peer.root.rotation.y = yaw;
            peer.root.computeWorldMatrix(true);
            const rotated = box.AvatarRig.createTrackedArms(peer.person.node, 'peerp_');
            assert.equal(rotated.arms.find(arm => arm.side === 'left').suffix, leftSuffix.toLowerCase(),
                `${file}: construction while turned swaps physical sides`);
        }
        peer.root.rotation.y = 0;
        peer.root.computeWorldMatrix(true);
        const leftShoulder = at(`UpperArm.${leftSuffix}`), rightShoulder = at(`UpperArm.${rightSuffix}`);
        const reach = dist(leftShoulder, at(`LowerArm.${leftSuffix}`)) + dist(at(`LowerArm.${leftSuffix}`), at(`Wrist.${leftSuffix}`));
        for (let frame = 0; frame < 50; frame++) {
            const yaw = frame * 0.14;
            const root = { x: 4, y: 4.7, z: -8, rotY: yaw };
            const hand = (shoulder, side) => {
                const dx = shoulder.x + side * 0.15, dz = shoulder.z + 0.25;
                return { x: dx * Math.cos(yaw) + dz * Math.sin(yaw),
                    y: shoulder.y - 1.7 + 0.18 + 0.12 * Math.sin(frame * 0.3),
                    z: dz * Math.cos(yaw) - dx * Math.sin(yaw),
                    fx: Math.sin(yaw), fy: 0, fz: Math.cos(yaw), ux: 0, uy: 1, uz: 0 };
            };
            const hands = { left: hand(leftShoulder, -1), right: hand(rightShoulder, 1) };
            manager.updatePeerState('p', null, { ...root, hands });
            manager.update(1 / 60);
            scene.render();
            for (const [side, suffix] of [['left', leftSuffix], ['right', rightSuffix]]) {
                const target = peer.hands[side];
                const wrist = at(`Wrist.${suffix}`);
                const expected = { x: peer.root.position.x + target.x, y: peer.root.position.y + 1.7 + target.y,
                    z: peer.root.position.z + target.z };
                assert.ok(dist(wrist, expected) < 0.035, `${file} ${side} frame ${frame}: wrist misses by ${dist(wrist, expected).toFixed(3)} m`);
                const shoulder = at(`UpperArm.${suffix}`), elbow = at(`LowerArm.${suffix}`);
                const length = dist(shoulder, elbow) + dist(elbow, wrist);
                assert.ok(Math.abs(length - reach) < 0.025, `${file}: limb stretched`);
                const finger = at(`Index1.${suffix}`).add(at(`Pinky1.${suffix}`)).scale(0.5).subtract(wrist).normalize();
                const forward = new B.Vector3(target.fx, target.fy, target.fz).normalize();
                assert.ok(B.Vector3.Dot(finger, forward) > 0.97, `${file}: hand orientation does not follow the controller`);
            }
        }
        const onlyLeft = { x: leftShoulder.x - 0.1, y: leftShoulder.y - 1.7 + 0.2, z: leftShoulder.z + 0.25,
            fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 };
        manager.updatePeerState('p', null, { x: 4, y: 4.7, z: -8, rotY: 0, hands: { left: onlyLeft } });
        for (let frame = 0; frame < 30; frame++) { manager.update(DT); scene.render(); }
        assert.equal(peer.hands.right, null, 'missing right controller must not receive the left pose');
        const target = peer.hands.left;
        assert.ok(dist(at(`Wrist.${leftSuffix}`), {
            x: peer.root.position.x + target.x, y: peer.root.position.y + 1.7 + target.y,
            z: peer.root.position.z + target.z
        }) < 0.035, `${file}: left-only tracking drives the wrong arm`);
        manager.updatePeerState('p', null, { x: 4, y: 4.7, z: -8, rotY: 1.2 });
        manager.update(1 / 60);
        scene.render();
        assert.equal(peer.hands.left, null, 'tracking loss returns to clip animation');
        manager.dispose();
        scene.dispose();
        engine.dispose();
    }
    assert.ok(totalMs / frames < 2, `remote arm IK averaged ${(totalMs / frames).toFixed(2)} ms`);
});

test('the rig builds on every UE-skeleton body and stands at the requested eye height', async () => {
    for (const glb of ['club-dancer-female.glb', 'club-dancer-male.glb', 'club-dj-male.glb', 'club-dj-female.glb']) {
        const { rig } = await loadRig(glb, { eyeHeight: 1.7, hideHead: true });
        assert.equal(rig.ok, true, `${glb} did not build`);
        const pose = makePose();
        for (let i = 0; i < 30; i++) rig.update(DT, pose);
        const head = pos(rig, 'Head');
        assert.ok(Math.abs(head.y + rig.eyeAbove - 1.7) < 0.02, `${glb}: eyes are not at 1.70 m (${(head.y + rig.eyeAbove).toFixed(3)})`);
        assert.ok(Math.hypot(head.x - pose.x, head.z - pose.z) < 0.1, `${glb}: head is not under the camera`);
        assert.ok(Math.abs(pos(rig, 'foot_l').y - rig.ankleH) < 0.01, `${glb}: feet are not on the floor`);
        assert.ok(rig.meshes.some(mesh => !mesh.isVisible), `${glb}: hideHead hid nothing`);
    }
});

test('a non-mannequin skeleton is refused instead of half-posed', async () => {
    const { rig } = await loadRig('house.glb', { eyeHeight: 1.7 });
    assert.equal(rig.ok, false, 'a Mixamo skeleton must not be driven as a mannequin');
});

test('walking plants the stance foot, steps, keeps limbs rigid and stays cheap', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    const rest = limbLengths(rig);
    let minAnkle = Infinity, maxStretch = 0, ms = 0, frames = 0;
    const slide = [], rel = [];
    let prev = null;
    for (let i = 0; i < 360; i++) {
        pose.z += 1.4 * DT;
        const t0 = performance.now();
        rig.update(DT, pose);
        ms += performance.now() - t0; frames++;
        if (i < 90) continue;
        const foot = pos(rig, 'foot_l');
        minAnkle = Math.min(minAnkle, foot.y, pos(rig, 'foot_r').y);
        const l = limbLengths(rig);
        for (const k of Object.keys(rest)) maxStretch = Math.max(maxStretch, Math.abs(l[k] - rest[k]));
        rel.push(foot.z - pose.z);
        if (prev && foot.y < rig.ankleH + 0.01) slide.push(Math.abs((foot.z - prev) / DT));
        prev = foot.z;
    }
    slide.sort((a, b) => a - b);
    assert.ok(slide.length > 40, 'the foot was never planted');
    assert.ok(slide[Math.floor(slide.length * 0.5)] < 0.06, `a planted foot slides at ${slide[Math.floor(slide.length * 0.5)].toFixed(3)} m/s`);
    assert.ok(minAnkle > rig.ankleH - 0.015, 'a foot went through the floor');
    assert.ok(Math.max(...rel) - Math.min(...rel) > 0.5, 'the foot does not take a stride');
    assert.ok(maxStretch < 0.002, `a limb stretched by ${maxStretch.toFixed(4)} m`);
    assert.ok(ms / frames < 2, `rig update costs ${(ms / frames).toFixed(2)} ms/frame`);
});

test('the body turns after the head with a dead-zone, and the head covers the gap', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    pose.headYaw = 0.5;                                  // inside the dead-zone
    for (let i = 0; i < 60; i++) rig.update(DT, pose);
    assert.ok(Math.abs(rig.bodyYaw) < 0.01, 'the hips turned for a small head turn');
    pose.headYaw = 1.8;                                  // well outside it
    for (let i = 0; i < 12; i++) rig.update(DT, pose);
    assert.ok(rig.bodyYaw > 0 && rig.bodyYaw < 1.0, 'the hips should lag the eyes, not snap');
    for (let i = 0; i < 120; i++) rig.update(DT, pose);
    assert.ok(Math.abs(rig.bodyYaw - 1.8) < 0.25, 'the hips never caught up with the eyes');
});

test('crouching lowers the pelvis with the feet still on the floor', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    const standing = pos(rig, 'pelvis').y;
    pose.eyeY = 1.2;
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    assert.ok(standing - pos(rig, 'pelvis').y > 0.3, 'the pelvis did not drop');
    assert.ok(Math.abs(pos(rig, 'foot_l').y - rig.ankleH) < 0.01, 'the feet left the floor in a crouch');
});

test('re-fitting eye height across XR and desktop transitions keeps the feet grounded', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);

    rig.setEyeHeight(1.0);
    pose.eyeY = 1.0;
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    assert.ok(Math.abs(pos(rig, 'Head').y + rig.eyeAbove - 1.0) < 0.02, 'the seated XR fit missed 1.00 m eyes');
    assert.ok(Math.abs(pos(rig, 'foot_l').y - rig.ankleH) < 0.01, 'the seated XR fit lifted a foot off the floor');

    rig.setEyeHeight(1.7);
    pose.eyeY = 1.7;
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    assert.ok(Math.abs(pos(rig, 'Head').y + rig.eyeAbove - 1.7) < 0.02, 'desktop refit did not restore 1.70 m eyes');
    assert.ok(Math.abs(pos(rig, 'foot_l').y - rig.ankleH) < 0.01, 'desktop refit left the feet floating');

    rig.setEyeHeight(1.0);
    pose.eyeY = 1.5;
    pose.groundY = 0.5;
    pose.z = -18;
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    assert.ok(Math.abs(pos(rig, 'Head').y + rig.eyeAbove - 1.5) < 0.02, 'the seated booth fit missed the measured head height');
    assert.ok(Math.abs(pos(rig, 'foot_l').y - (rig.ankleH + 0.5)) < 0.01, 'the seated booth fit ignored the riser floor');
});

test('hands: a reachable target is met, an unreachable one straightens the arm without stretching it', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    const rest = limbLengths(rig);
    const R = rig.R, F = rig.F;
    // The physical left hand is on the -R side whichever way the GLB names its bones.
    const hand = (side, h, fwd, lateral = 0.22) => ({
        x: pose.x + F.x * fwd + R.x * side * lateral, y: h, z: pose.z + F.z * fwd + R.z * side * lateral,
        fx: F.x, fy: 0, fz: F.z, ux: 0, uy: 1, uz: 0
    });
    pose.left = hand(-1, 1.3, 0.3);
    pose.right = hand(1, 1.3, 0.3);
    for (let i = 0; i < 5; i++) rig.update(DT, pose);
    const sfxLeft = rig.sideL < 0 ? 'l' : 'r';
    const wrist = pos(rig, `hand_${sfxLeft}`);
    const want = { x: pose.left.x - F.x * 0.05, y: pose.left.y, z: pose.left.z - F.z * 0.05 };
    assert.ok(dist(wrist, want) < 0.01, `the wrist is ${dist(wrist, want).toFixed(3)} m from the controller`);
    assert.ok(((wrist.x - pose.x) * R.x + (wrist.z - pose.z) * R.z) < 0, 'the physical left hand ended up on the right');

    pose.left = hand(-1, 2.6, 1.5);
    rig.update(DT, pose);
    const l = limbLengths(rig);
    for (const k of Object.keys(rest)) assert.ok(Math.abs(l[k] - rest[k]) < 0.002, `${k} stretched reaching for a far target`);
});

test('bad input cannot poison the pose', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    rig.update(DT, { x: NaN, z: undefined, groundY: NaN, eyeY: NaN, headYaw: NaN, headPitch: NaN, left: { x: NaN }, right: null });
    rig.update(0, pose);
    rig.update(5, pose);
    for (const name of Object.keys(rig.ix)) {
        const p = pos(rig, name);
        assert.ok(Number.isFinite(p.x + p.y + p.z), `${name} went non-finite`);
    }
    // A teleport is not a sprint: the gait must not wind up.
    pose.x += 50;
    rig.update(DT, pose);
    assert.ok(rig.speed < 1, 'a teleport was read as running speed');
});

// The crowd people are Quaternius Modular Women/Men whose rig is NOT the mannequin the clips were authored for:
// scripts/build-crowd-glbs.mjs retargets them. Wrong axes, a flipped side or a bad scale do not throw, they give a
// dancer with a crooked spine, arms through the head or feet in the floor, so measure the real skeleton moving.
test('the retargeted crowd dances: arms and body move, limbs stay rigid, feet stay on the floor', async () => {
    const files = readdirSync(join(ROOT, 'js/models/avatars')).filter(file => /^club-crowd-.*\.glb$/.test(file));
    assert.ok(files.length >= 16, `expected the whole cast, found ${files.length}`);
    for (const file of files) {
        const { scene, container, B } = await loadContainer(file);
        const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
        const root = entry.rootNodes[0];
        const node = name => root.getDescendants(false, n => n.name === name)[0];
        const tracked = ['Head', 'Wrist.L', 'Wrist.R', 'Foot.L', 'Foot.R', 'UpperArm.L', 'LowerArm.L', 'UpperLeg.L', 'LowerLeg.L', 'Hips', 'Chest']
            .map(name => [name, node(name)]);
        for (const [name, n] of tracked) assert.ok(n, `${file} has no ${name}`);
        const at = name => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
        const dance = entry.animationGroups.find(group => group.name.endsWith('Dance_Loop'));
        assert.ok(dance, `${file} has no Dance_Loop`);
        dance.start(false);
        dance.pause();

        const samples = [];
        const steps = 24;
        for (let k = 0; k < steps; k++) {
            dance.goToFrame(dance.from + (dance.to - dance.from) * k / steps);
            root.computeWorldMatrix(true);
            samples.push(Object.fromEntries(tracked.map(([name]) => [name, at(name)])));
        }
        const range = (name, axis) => {
            const values = samples.map(sample => sample[name][axis]);
            return Math.max(...values) - Math.min(...values);
        };
        const everyFinite = samples.every(sample => Object.values(sample).every(p => Number.isFinite(p.x + p.y + p.z)));
        assert.ok(everyFinite, `${file}: a joint went non-finite`);

        // Reach the model's own height from its bind pose, to judge everything in proportion.
        const height = Math.max(...samples.map(sample => sample.Head.y));
        assert.ok(height > 1.2 && height < 2.4, `${file}: head at ${height.toFixed(2)}`);
        // It dances: hands travel, and the body moves with the beat.
        assert.ok(range('Wrist.L', 'y') + range('Wrist.L', 'x') > 0.15 && range('Wrist.R', 'y') + range('Wrist.R', 'x') > 0.15,
            `${file}: the hands barely move`);
        assert.ok(range('Head', 'y') + range('Head', 'x') + range('Head', 'z') > 0.03, `${file}: the head does not move`);
        // The head stays on top of the body.
        for (const sample of samples) {
            assert.ok(sample.Head.y > sample.Chest.y + 0.1, `${file}: the head dropped below the chest`);
            assert.ok(sample.Chest.y > sample.Hips.y, `${file}: the chest dropped below the hips`);
            assert.ok(Math.hypot(sample.Head.x - sample.Hips.x, sample.Head.z - sample.Hips.z) < 0.45 * height, `${file}: the head is thrown off the body`);
        }
        // Bones do not stretch: the upper arm and the thigh are the same length in every frame.
        for (const [a, b] of [['UpperArm.L', 'LowerArm.L'], ['UpperLeg.L', 'LowerLeg.L']]) {
            const lengths = samples.map(sample => B.Vector3.Distance(sample[a], sample[b]));
            assert.ok(Math.max(...lengths) - Math.min(...lengths) < 0.01 * height, `${file}: ${a} stretches`);
        }
        // Feet stay near the floor and the arms never cross to the other side of the body.
        const floor = Math.min(...samples.flatMap(sample => [sample['Foot.L'].y, sample['Foot.R'].y]));
        const feetHigh = Math.max(...samples.flatMap(sample => [sample['Foot.L'].y, sample['Foot.R'].y]));
        assert.ok(feetHigh - floor < 0.35 * height, `${file}: a foot leaves the floor by ${(feetHigh - floor).toFixed(2)}`);
        assert.ok(samples.every(sample => sample['Foot.L'].x * sample['Foot.R'].x <= 0.0001 || Math.abs(sample['Foot.L'].x - sample['Foot.R'].x) > 0.05), `${file}: the feet crossed`);
        scene.dispose();
    }
});

test('the balcony watcher keeps both hands on the rail while looking around the dance floor', async () => {
    const { scene, container } = await loadContainer('club-crowd-f7.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    root.rotationQuaternion = null;
    root.rotation.y = Math.PI / 2;
    root.position.set(-10.02, 3, -13.9);
    root.computeWorldMatrix(true);
    let bounds = root.getHierarchyBoundingVectors(true);
    root.scaling.setAll(1.66 / (bounds.max.y - bounds.min.y));
    root.computeWorldMatrix(true);
    bounds = root.getHierarchyBoundingVectors(true);
    root.position.y += 3 - bounds.min.y;
    root.computeWorldMatrix(true);

    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => {
        const n = node(name);
        n.computeWorldMatrix(true);
        return n.getAbsolutePosition().clone();
    };
    const group = entry.animationGroups.find(animation => animation.name.endsWith('Idle_Railing_Loop'));
    assert.ok(group, 'club-crowd-f7.glb has no Idle_Railing_Loop');
    group.start(false);
    group.pause();

    const samples = [];
    for (let i = 0; i <= 48; i++) {
        group.goToFrame(group.from + (group.to - group.from) * i / 48);
        root.computeWorldMatrix(true);
        const head = node('Head');
        head.computeWorldMatrix(true);
        samples.push({
            left: at('Wrist.L'),
            right: at('Wrist.R'),
            leftKnuckle: at('Middle2.L'),
            rightKnuckle: at('Middle2.R'),
            leftTip: at('Middle4.L'),
            rightTip: at('Middle4.R'),
            headRotation: head.absoluteRotationQuaternion.clone()
        });
    }
    const wrists = samples.flatMap(sample => [sample.left, sample.right]);
    const knuckles = samples.flatMap(sample => [sample.leftKnuckle, sample.rightKnuckle]);
    const tips = samples.flatMap(sample => [sample.leftTip, sample.rightTip]);
    const railX = -9.54, railY = 4.08, halfWidth = 0.03, halfHeight = 0.025;
    assert.ok(wrists.every(wrist => wrist.x < railX - halfWidth && wrist.y > railY + halfHeight),
        'a wrist is not above and behind the rail');
    assert.ok(knuckles.every(knuckle => knuckle.x > railX + halfWidth && Math.abs(knuckle.y - railY) < 0.04),
        'a knuckle does not wrap over the rail to its dance-floor side');
    assert.ok(tips.every(tip => tip.y < railY - halfHeight && Math.abs(tip.x - railX) < halfWidth),
        'a fingertip does not curl back underneath the rail');
    assert.ok(Math.max(...wrists.map(wrist => wrist.y)) - Math.min(...wrists.map(wrist => wrist.y)) < 0.015,
        'the planted hands slide vertically');
    assert.ok(Math.max(...wrists.map(wrist => wrist.x)) - Math.min(...wrists.map(wrist => wrist.x)) < 0.015,
        'the planted hands slide across the rail');
    const first = samples[0].headRotation;
    const headTravel = Math.max(...samples.map(sample => {
        const q = sample.headRotation;
        const dot = Math.min(1, Math.abs(first.x * q.x + first.y * q.y + first.z * q.z + first.w * q.w));
        return 2 * Math.acos(dot);
    }));
    assert.ok(headTravel > 0.35, `she only looks around by ${headTravel.toFixed(3)} rad`);
    scene.dispose();
});

test('the mingling guest raises a drink to his face without sliding his feet', async () => {
    const { scene, container, B } = await loadContainer('club-crowd-m6.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => {
        const n = node(name);
        n.computeWorldMatrix(true);
        return n.getAbsolutePosition().clone();
    };
    const group = entry.animationGroups.find(animation => animation.name.endsWith('Drink_Loop'));
    assert.ok(group, 'club-crowd-m6.glb has no Drink_Loop');
    group.start(false);
    group.pause();

    const samples = [];
    for (let i = 0; i <= 64; i++) {
        group.goToFrame(group.from + (group.to - group.from) * i / 64);
        root.computeWorldMatrix(true);
        samples.push({
            head: at('Head'),
            wrist: at('Wrist.R'),
            palm: at('Middle1.R'),
            shoulder: at('UpperArm.R'),
            leftFoot: at('Foot.L'),
            rightFoot: at('Foot.R')
        });
    }
    const wristTravel = Math.max(...samples.map(sample => sample.wrist.y))
        - Math.min(...samples.map(sample => sample.wrist.y));
    const counterReach = Math.max(...samples.slice(0, 14).map(sample => sample.palm.z));
    const closestSample = samples.reduce((best, sample) => {
        const distance = B.Vector3.Distance(sample.palm, sample.head);
        return !best || distance < best.distance ? { distance, sample } : best;
    }, null);
    const closestSip = closestSample.distance;
    const footTravel = side => {
        const first = samples[0][side];
        return Math.max(...samples.map(sample => B.Vector3.Distance(sample[side], first)));
    };
    assert.ok(wristTravel > 0.25, `the cup hand rises only ${wristTravel.toFixed(3)} m`);
    assert.ok(counterReach > 0.42, `the pickup hand reaches only ${counterReach.toFixed(3)} m toward the counter`);
    assert.ok(closestSip < 0.16,
        `the cup hand remains ${closestSip.toFixed(3)} m from his face `
        + `(shoulder ${closestSample.sample.shoulder.toString()}, wrist ${closestSample.sample.wrist.toString()}, `
        + `palm ${closestSample.sample.palm.toString()}, `
        + `head ${closestSample.sample.head.toString()})`);
    assert.ok(footTravel('leftFoot') < 0.015 && footTravel('rightFoot') < 0.015, 'a foot slides while he drinks');
    scene.dispose();
});

test('the mingling guest smokes like a smoker: the filter at his lips, his hand and the burning end out of his face', async () => {
    const { scene, container, B } = await loadContainer('club-crowd-m6.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    // Placed the way _spawnAvatar places him: the root's handedness flip replaced by a yaw and a uniform scale.
    root.rotationQuaternion = null;
    root.rotation.y = 0;
    root.computeWorldMatrix(true);
    const bounds = root.getHierarchyBoundingVectors(true);
    const scale = 1.84 / (bounds.max.y - bounds.min.y);
    root.scaling.setAll(scale);
    root.computeWorldMatrix(true);
    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => {
        const n = node(name);
        n.computeWorldMatrix(true);
        return n.getAbsolutePosition().clone();
    };
    const group = entry.animationGroups.find(animation => animation.name.endsWith('Smoke_Loop'));
    assert.ok(group, 'club-crowd-m6.glb has no Smoke_Loop');
    group.start(false);
    group.pause();
    const seconds = (group.to - group.from) / (group.animatables[0]?.animations?.[0]?.framePerSecond || 20);

    // The runtime's own placement (VRClubAudioCrowd._attachCigarette): pinched between the index and middle fingertips,
    // through the palm, measured in the body's frame; the lips 0.115 m in front of and 6 mm above the Head joint. The
    // face is ~0.14 m from the middle of the head (lips and nose), so anything nearer is in his face.
    group.goToFrame(group.from);
    root.computeWorldMatrix(true);
    const head = node('Head');
    const toHead = head.computeWorldMatrix(true).clone().invert();
    const lipsLocal = B.Vector3.TransformCoordinates(at('Head').add(new B.Vector3(0, 0.006 * scale, 0.115 * scale)), toHead);
    const centreLocal = B.Vector3.TransformCoordinates(at('Head').add(new B.Vector3(0, 0.088 * scale, 0)), toHead);
    const samples = [];
    for (let i = 0; i <= 96; i++) {
        group.goToFrame(group.from + (group.to - group.from) * i / 96);
        root.computeWorldMatrix(true);
        const rootWorld = root.getWorldMatrix();
        const toBody = rootWorld.clone().invert();
        const local = name => B.Vector3.TransformCoordinates(at(name), toBody);
        const i3 = local('Index3.R'), i4 = local('Index4.R'), m3 = local('Middle3.R'), m4 = local('Middle4.R');
        const hold = B.Vector3.TransformCoordinates(i3.add(i4).add(m3).add(m4).scale(0.25), rootWorld);
        const palm = B.Vector3.TransformNormal(B.Vector3.Cross(i3.subtract(m3), m4.subtract(m3).normalize()), rootWorld).normalize();
        const headWorld = head.computeWorldMatrix(true);
        const centre = B.Vector3.TransformCoordinates(centreLocal, headWorld);
        samples.push({
            filter: hold.add(palm.scale(0.045)),
            lit: hold.subtract(palm.scale(0.04)),
            lips: B.Vector3.TransformCoordinates(lipsLocal, headWorld),
            centre,
            tips: ['Index4.R', 'Middle4.R', 'Thumb3.R'].map(at),
            // How far the wrist is in front of his neck, in his own frame (the collar is ~6 cm in front of it).
            wristAhead: (local('Wrist.R').z - local('Neck').z) * scale,
            leftFoot: at('Foot.L'), rightFoot: at('Foot.R')
        });
    }
    const atLips = samples.filter(s => B.Vector3.Distance(s.filter, s.lips) < 0.05);
    const closest = Math.min(...samples.map(s => B.Vector3.Distance(s.filter, s.lips)));
    assert.ok(closest < 0.03, `the filter never reaches his lips (closest ${closest.toFixed(3)} m)`);
    assert.ok(seconds >= 10, `a drag every ${seconds.toFixed(1)} s is chain-smoking`);
    assert.ok(atLips.length / samples.length * seconds > 1, 'each drag is shorter than a second');
    for (const s of atLips) {
        const lit = B.Vector3.Distance(s.lit, s.centre);
        assert.ok(lit > 0.18, `the burning end is ${lit.toFixed(3)} m from the middle of his head: it is in his face`);
        const tip = Math.min(...s.tips.map(p => B.Vector3.Distance(p, s.centre)));
        assert.ok(tip > 0.15, `a finger is ${tip.toFixed(3)} m from the middle of his head: the hand is in his face`);
        assert.ok(s.wristAhead > 0.09, `his wrist is only ${s.wristAhead.toFixed(3)} m in front of his neck: it is in his collar`);
    }
    const footTravel = side => Math.max(...samples.map(s => B.Vector3.Distance(s[side], samples[0][side])));
    assert.ok(footTravel('leftFoot') < 0.015 && footTravel('rightFoot') < 0.015, 'a foot slides while he smokes');
    scene.dispose();
});

test('at the balcony the mingling guest rests both hands on the rail beside the watcher', async () => {
    const { scene, container } = await loadContainer('club-crowd-m6.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    // His balcony stop (_minglerRoute): x -9.93, z -12.95 on the deck at y 3, facing the rail (+x), 1.84 m tall.
    root.rotationQuaternion = null;
    root.rotation.y = Math.PI / 2;
    root.position.set(-9.93, 3, -12.95);
    root.computeWorldMatrix(true);
    let bounds = root.getHierarchyBoundingVectors(true);
    root.scaling.setAll(1.84 / (bounds.max.y - bounds.min.y));
    root.computeWorldMatrix(true);
    bounds = root.getHierarchyBoundingVectors(true);
    root.position.y += 3 - bounds.min.y;
    root.computeWorldMatrix(true);
    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
    const group = entry.animationGroups.find(animation => animation.name.endsWith('Idle_Railing_Loop'));
    assert.ok(group, 'club-crowd-m6.glb has no Idle_Railing_Loop');
    group.start(false);
    group.pause();
    const railX = -9.54, railTop = 3 + 1.08;   // MezzanineLayout: deck edge rail, railHeight 1.08
    for (let i = 0; i <= 32; i++) {
        group.goToFrame(group.from + (group.to - group.from) * i / 32);
        root.computeWorldMatrix(true);
        for (const wrist of [at('Wrist.L'), at('Wrist.R')]) {
            assert.ok(Math.abs(wrist.x - railX) < 0.08, `a hand misses the rail by ${Math.abs(wrist.x - railX).toFixed(3)} m`);
            assert.ok(Math.abs(wrist.y - railTop) < 0.06, `a hand is ${(wrist.y - railTop).toFixed(3)} m off the rail top`);
        }
    }
    scene.dispose();
});

test('the performing DJ reaches the controller, leans in, keeps the feet on the riser, and stays cheap', async () => {
    // The club's numbers: the controller's measured bounds, the DJ 0.18 m behind its near edge, the riser at 0.5 m,
    // eyes at 93% of the look's height (see _spawnPerformingDJ).
    const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    for (const [glb, height] of [['club-dj-male.glb', 1.78], ['club-dj-female.glb', 1.68]]) {
        const { rig, scene } = await loadRig(glb, { eyeHeight: height * 0.93 });
        assert.equal(rig.ok, true, `${glb} cannot be driven`);
        const Performer = vm.runInContext('DJPerformer', sandbox());
        let pick = 0.5;
        const dj = new Performer({ x: 0, z: desk.near - 0.18, groundY: 0.5, eyeHeight: height * 0.93, desk, rng: () => pick });
        const music = { hasAudio: true, beatPhase: 0, bar: 0, energy: 0.6, drop: false, bpm: 124 };
        const step = (frames) => {
            let ms = 0;
            for (let i = 0; i < frames; i++) {
                const t0 = performance.now();
                rig.update(DT, dj.update(DT, music, null));
                ms += performance.now() - t0;
            }
            return ms / frames;
        };
        dj._begin('crowd', 99);
        step(90);
        // The head stays over the eye point, so leaning tilts the chest ahead of the hips (the hips go back).
        const tilt = () => pos(rig, 'spine_03').z - pos(rig, 'pelvis').z;
        const upright = tilt();
        const rest = limbLengths(rig);
        dj._begin('tweak', 99);
        let ms = 0;
        // Every knob in reach (the performer picks a knob with rng; no bar lines pass, so nothing else draws):
        // the wrist 5 cm behind each palm target, whichever bone the GLB calls left.
        for (let knob = 0; knob < 6; knob++) {
            pick = (knob + 0.5) / 6;
            ms = Math.max(ms, step(70));
            for (const h of [dj.pose.left, dj.pose.right]) {
                const want = { x: h.x - h.fx * 0.05, y: h.y - h.fy * 0.05, z: h.z - h.fz * 0.05 };
                const miss = Math.min(dist(pos(rig, 'hand_l'), want), dist(pos(rig, 'hand_r'), want));
                assert.ok(miss < 0.03, `${glb}: knob ${knob}: a hand stops ${miss.toFixed(3)} m short of the controller`);
            }
        }
        dj._begin('mix', 99);
        step(70);
        for (const h of [dj.pose.left, dj.pose.right]) {
            const want = { x: h.x - h.fx * 0.05, y: h.y - h.fy * 0.05, z: h.z - h.fz * 0.05 };
            const miss = Math.min(dist(pos(rig, 'hand_l'), want), dist(pos(rig, 'hand_r'), want));
            assert.ok(miss < 0.03, `${glb}: mixing: a hand stops ${miss.toFixed(3)} m short of the jog wheel or mixer`);
        }
        assert.ok(tilt() - upright > 0.03, `${glb}: does not lean in over the decks`);
        assert.ok(pos(rig, 'pelvis').z < -19.0, `${glb}: the hips are inside the DJ table`);
        assert.ok(Math.abs(pos(rig, 'foot_l').y - (rig.ankleH + 0.5)) < 0.015, `${glb}: a foot left the riser`);
        const l = limbLengths(rig);
        for (const k of Object.keys(rest)) assert.ok(Math.abs(l[k] - rest[k]) < 0.002, `${glb}: ${k} stretched`);
        assert.ok(ms < 2, `${glb}: the performing DJ costs ${ms.toFixed(2)} ms a frame`);
        // Hands up on a drop: both wrists above the head.
        music.drop = true; step(1); music.drop = false; step(60);
        assert.ok(pos(rig, 'hand_l').y > pos(rig, 'Head').y && pos(rig, 'hand_r').y > pos(rig, 'Head').y, `${glb}: hands not up on the drop`);
        scene.dispose();
    }
});

// The grooves are authored procedurally onto the modular rig (scripts/build-crowd-glbs.mjs) at 120 BPM with a beat on
// every 0.5 s: measure them on the real skeleton, at the frames where the beats fall.
test('the crowd grooves: on the beat where it matters, feet planted, hands where they should be, seamless loops', async () => {
    const GROOVES = { Groove_Bounce: 2, Groove_SideTap: 4, Groove_Clap: 2, Groove_Pump: 4, Groove_Twist: 2, Groove_HandsUp: 4, Groove_Sway: 4, Groove_Still: 8 };
    for (const file of ['club-crowd-f1.glb', 'club-crowd-m1.glb', 'club-crowd-m7.glb']) {
        const { scene, container, B } = await loadContainer(file);
        const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
        const root = entry.rootNodes[0];
        const node = name => root.getDescendants(false, n => n.name === name)[0];
        const names = ['Head', 'Chest', 'Hips', 'Wrist.L', 'Wrist.R', 'Foot.L', 'Foot.R', 'UpperArm.L', 'LowerArm.L', 'UpperLeg.R', 'LowerLeg.R'];
        const at = () => {
            root.computeWorldMatrix(true);
            return Object.fromEntries(names.map(name => { const n = node(name); n.computeWorldMatrix(true); return [name, n.getAbsolutePosition().clone()]; }));
        };
        const rest = at();
        const height = rest.Head.y;
        for (const [clip, beats] of Object.entries(GROOVES)) {
            const group = entry.animationGroups.find(g => g.name === clip || g.name.endsWith(`_${clip}`) || g.name === `${clip}`);
            assert.ok(group, `${file} has no ${clip}`);
            entry.animationGroups.forEach(g => g.stop());
            group.start(false);
            group.pause();
            const span = group.to - group.from;
            // Babylon plays glTF at 60 frames a second: a beat at 120 BPM is 30 frames.
            assert.ok(Math.abs(span - beats * 30) < 0.5, `${file} ${clip}: ${span} frames for ${beats} beats`);
            const pose = beat => { group.goToFrame(group.from + beat * 30); return at(); };
            const samples = [];
            for (let k = 0; k <= beats * 8; k++) samples.push({ beat: k / 8, ...pose(k / 8) });
            const first = samples[0], last = samples[samples.length - 1];
            for (const name of names) assert.ok(B.Vector3.Distance(first[name], last[name]) < 0.01, `${file} ${clip}: the loop jumps at ${name}`);
            for (const s of samples) {
                assert.ok(s.Head.y > s.Chest.y + 0.08 && s.Chest.y > s.Hips.y, `${file} ${clip}: the body folds at beat ${s.beat}`);
                for (const [a, b] of [['UpperArm.L', 'LowerArm.L'], ['UpperLeg.R', 'LowerLeg.R']]) {
                    const d = B.Vector3.Distance(s[a], s[b]), d0 = B.Vector3.Distance(rest[a], rest[b]);
                    assert.ok(Math.abs(d - d0) < 0.005, `${file} ${clip}: ${a} stretches`);
                }
            }
            const floor = Math.min(rest['Foot.L'].y, rest['Foot.R'].y);
            const onBeats = samples.filter(s => Number.isInteger(s.beat));
            const between = samples.filter(s => s.beat % 1 === 0.5);
            if (clip === 'Groove_SideTap') {
                // A foot travels between beats and is down, on the floor, on every beat.
                const lift = Math.max(...samples.map(s => Math.max(s['Foot.L'].y, s['Foot.R'].y))) - floor;
                assert.ok(lift > 0.04, `${file}: the tapping foot never leaves the floor (${lift.toFixed(3)})`);
                for (const s of onBeats) assert.ok(Math.max(s['Foot.L'].y, s['Foot.R'].y) - floor < 0.01, `${file}: a foot is in the air on beat ${s.beat}`);
                const travel = Math.max(...samples.map(s => Math.abs(s['Foot.R'].x - rest['Foot.R'].x) + Math.abs(s['Foot.L'].x - rest['Foot.L'].x)));
                assert.ok(travel > 0.15, `${file}: the side tap does not go to the side`);
            } else {
                // Planted: the feet stay where they are.
                for (const s of samples) {
                    for (const foot of ['Foot.L', 'Foot.R']) {
                        assert.ok(Math.abs(s[foot].y - rest[foot].y) < 0.01, `${file} ${clip}: ${foot} lifts at beat ${s.beat}`);
                        assert.ok(Math.hypot(s[foot].x - first[foot].x, s[foot].z - first[foot].z) < 0.015, `${file} ${clip}: ${foot} slides`);
                    }
                }
            }
            if (clip === 'Groove_Clap') {
                for (const s of onBeats) assert.ok(B.Vector3.Distance(s['Wrist.L'], s['Wrist.R']) < 0.14, `${file}: the hands do not meet on beat ${s.beat}`);
                for (const s of between) assert.ok(B.Vector3.Distance(s['Wrist.L'], s['Wrist.R']) > 0.3, `${file}: the hands do not open between claps`);
                for (const s of samples) assert.ok(s['Wrist.L'].y > s.Hips.y && s['Wrist.L'].y < s.Head.y, `${file}: the clap is not in front of the chest`);
            }
            if (clip === 'Groove_Pump') {
                for (const s of onBeats) assert.ok(Math.max(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y + 0.05, `${file}: the fist is not up on beat ${s.beat}`);
            }
            if (clip === 'Groove_HandsUp') {
                for (const s of samples) assert.ok(Math.min(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y, `${file}: a hand is not up at beat ${s.beat}`);
            }
            if (['Groove_Bounce', 'Groove_Clap', 'Groove_Pump', 'Groove_HandsUp', 'Groove_SideTap', 'Groove_Twist'].includes(clip)) {
                // Down on the beat: the hips are lower on every beat than half way between.
                const low = Math.max(...onBeats.map(s => s.Hips.y)), high = Math.min(...between.map(s => s.Hips.y));
                assert.ok(low < high - 0.01, `${file} ${clip}: the bounce does not land on the beat (${low.toFixed(3)} vs ${high.toFixed(3)})`);
            }
            if (clip !== 'Groove_Still') {
                const wrists = Math.max(...samples.map(s => s['Wrist.L'].y)) - Math.min(...samples.map(s => s['Wrist.L'].y))
                    + Math.max(...samples.map(s => s['Wrist.R'].x)) - Math.min(...samples.map(s => s['Wrist.R'].x));
                assert.ok(wrists > 0.04 || clip === 'Groove_Twist', `${file} ${clip}: the arms do not move`);
            }
            assert.ok(height > 1.2, `${file}: odd height`);
        }
        scene.dispose();
    }
});
