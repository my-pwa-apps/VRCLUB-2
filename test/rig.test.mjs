// AvatarRig on the REAL dancer skeleton and the REAL Babylon, headless.
//
// The rig is mostly geometry (planted feet, IK, turning), so stubs would prove nothing: a
// stub cannot tell a foot that slides from one that is planted. These tests load the
// vendored Babylon into a vm with a NullEngine, load the shipped GLB from disk, and measure
// bone positions after posing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
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
    const bytes = readFileSync(isAbsolute(glb) ? glb : join(ROOT, 'js/models/avatars', glb));
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

test('single-mesh avatar head is re-skinned immediately for mirror and first-person passes', async () => {
    const { rig, scene, engine } = await loadRig('club-crowd-m1.glb', {
        eyeHeight: 1.7, hideHead: true, allowCustomSkeleton: true
    });
    assert.ok(rig.ok);
    assert.equal(rig.headMeshes.length, 0);
    const skeleton = rig.entry.skeletons[0];
    const head = skeleton.bones.find(bone => bone.getTransformNode() === rig.bone.Head);
    assert.ok(head);
    const scale = () => {
        const m = head.getAbsoluteTransform().m;
        return Math.hypot(m[0], m[1], m[2]);
    };
    skeleton.prepare(true);
    const hidden = scale();
    rig.setHeadVisible(true);
    const revealed = scale();
    rig.setHeadVisible(false);
    const restored = scale();
    assert.ok(revealed > hidden * 1000, `mirror head was not revealed: ${hidden} -> ${revealed}`);
    assert.ok(restored < revealed / 1000, `first-person head was not hidden again: ${revealed} -> ${restored}`);
    rig.dispose();
    scene.dispose();
    engine.dispose();
});

test('eye-height refitting preserves avatar facing after turning, including a hidden mirror head', async () => {
    const files = ['club-dancer-male.glb', 'club-crowd-m1.glb'];
    if (process.env.VRCLUB_TEST_PERSONAL_AVATAR) files.push(process.env.VRCLUB_TEST_PERSONAL_AVATAR);
    for (const file of files) {
        for (const yaw of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
            const { rig, scene, engine } = await loadRig(file, {
                eyeHeight: 1.7, hideHead: true, allowCustomSkeleton: true
            });
            assert.ok(rig.ok);
            const yaw0 = rig.yaw0, yawDir = rig.yawDir, sideL = rig.sideL;
            const pose = { ...makePose(), bodyYaw: yaw, headYaw: yaw };
            rig.update(DT, pose);
            const rotation = rig.root.rotation.y;
            rig.setEyeHeight(1.8);
            assert.ok(Math.abs(rig.yaw0 - yaw0) < 1e-5, `${file}: refitting changed bind facing at ${yaw}`);
            assert.equal(rig.yawDir, yawDir, `${file}: refitting reversed turn direction`);
            assert.equal(rig.sideL, sideL, `${file}: refitting swapped physical sides`);
            pose.eyeY = 1.8;
            rig.update(DT, pose);
            assert.ok(Math.abs(rig.root.rotation.y - rotation) < 1e-5, `${file}: calibration turned the body away from the mirror`);
            assert.equal(rig._headVisible, false);
            rig.dispose();
            scene.dispose();
            engine.dispose();
        }
    }
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
    const { rig, scene } = await loadRig('house.glb', { eyeHeight: 1.7 });
    assert.equal(rig.ok, false, 'a Mixamo skeleton must not be driven as a mannequin without allowCustomSkeleton');
    scene.dispose();
    const custom = await loadRig('house.glb', { eyeHeight: 1.7, allowCustomSkeleton: true });
    assert.equal(custom.rig.ok, true, 'a custom Mixamo / Ready Player Me .glb is driven when allowCustomSkeleton is enabled');
    const Performer = vm.runInContext('DJPerformer', sandbox());
    const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    const dj = new Performer({ x: 0, z: desk.near - 0.18, groundY: 0.5, eyeHeight: 1.7, desk, rng: () => 0.5 });
    const music = { hasAudio: true, beatPhase: 0, bar: 0, energy: 0.7, drop: false, bpm: 126 };
    for (let i = 0; i < 60; i++) custom.rig.update(DT, dj.update(DT, music, null));
    assert.ok(Number.isFinite(pos(custom.rig, 'hand_l').x) && Number.isFinite(pos(custom.rig, 'hand_r').x));
    custom.scene.dispose();
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

test('intentional seating bends the legs while physical seated play retains a full standing body', async () => {
    const { rig } = await loadRig();
    const pose = makePose();
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    const standingPelvis = pos(rig, 'pelvis').y;
    assert.ok(Math.abs(pos(rig, 'Head').y + rig.eyeAbove - 1.7) < 0.02);

    for (const groundY of [0, 0.5, 3]) {
        Object.assign(pose, { groundY, eyeY: groundY + 1.7, seatY: groundY + 0.76, seated: true, bodyYaw: 0 });
        for (let i = 0; i < 30; i++) rig.update(DT, pose);
        assert.ok(Math.abs(pos(rig, 'pelvis').y - pose.seatY) < 0.035, `pelvis missed seat at floor ${groundY}`);
        assert.ok(Math.abs(pos(rig, 'foot_l').y - (groundY + rig.ankleH)) < 0.015, `left foot floated at floor ${groundY}`);
        assert.ok(Math.abs(pos(rig, 'foot_r').y - (groundY + rig.ankleH)) < 0.015, `right foot floated at floor ${groundY}`);
    }

    Object.assign(pose, { groundY: 0, eyeY: 1.7, seated: false, seatY: 0 });
    for (let i = 0; i < 30; i++) rig.update(DT, pose);
    assert.ok(Math.abs(pos(rig, 'pelvis').y - standingPelvis) < 0.03, 'standing after a seat left the body shortened');
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

test('the mingling guest\'s hand carries the glass off the counter, tips it to his lips and sets it back down', async () => {
    const { scene, container, B } = await loadContainer('club-crowd-m6.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    // Where the club puts him at the bar, facing the bartender, and the counter glass he reaches for.
    const stand = { x: 9.55, z: -9.65 }, bartender = { x: 10.85, z: -9.9 };
    const yaw = Math.atan2(bartender.x - stand.x, bartender.z - stand.z);
    const glass = new B.Vector3(9.7 + 0.29, 1.1 + 0.06, bartender.z + 0.515);
    root.rotationQuaternion = null;
    root.rotation.y = yaw;
    root.position.set(stand.x, 0, stand.z);
    root.computeWorldMatrix(true);
    let bounds = root.getHierarchyBoundingVectors(true);
    root.scaling.setAll(1.84 / (bounds.max.y - bounds.min.y));
    root.computeWorldMatrix(true);
    bounds = root.getHierarchyBoundingVectors(true);
    root.position.y -= bounds.min.y;
    const scale = root.scaling.x;
    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
    const group = entry.animationGroups.find(animation => animation.name.endsWith('Drink_Loop'));
    group.start(false);
    group.pause();
    const forward = new B.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    // The same grip the club uses (VRClubAudioCrowd._updateMinglerGrip): wrist-local fingers +Y, thumb side -X.
    const sample = phase => {
        group.goToFrame(group.from + (group.to - group.from) * phase);
        root.computeWorldMatrix(true);
        const wrist = node('Wrist.R');
        wrist.computeWorldMatrix(true);
        const f = B.Vector3.TransformNormal(new B.Vector3(0, 1, 0), wrist.getWorldMatrix()).normalize();
        const t = B.Vector3.TransformNormal(new B.Vector3(-0.9994, 0, -0.0341), wrist.getWorldMatrix()).normalize();
        const n = B.Vector3.Cross(t, f).normalize();
        const palm = at('Wrist.R').add(at('Middle1.R')).scale(0.5);
        const cup = palm.add(n.scale(0.045)).add(t.scale(0.01));
        const lips = at('Head').add(forward.scale(0.115 * scale)).addInPlaceFromFloats(0, 0.006 * scale, 0);
        return {
            cup, tilt: Math.acos(Math.min(1, Math.max(-1, t.y))), rim: cup.add(t.scale(0.06)), lips,
            wrist: at('Wrist.R'), otherWrist: at('Wrist.L'), feet: [at('Foot.L'), at('Foot.R')]
        };
    };
    // He takes the glass where it stands (the club's pickup ends at phase 0.2 and its return begins at 0.86).
    for (const phase of [0.2, 0.86]) {
        const s = sample(phase);
        assert.ok(B.Vector3.Distance(s.cup, glass) < 0.03,
            `at phase ${phase} the cup is ${B.Vector3.Distance(s.cup, glass).toFixed(3)} m from the glass on the counter`);
    }
    let rimToLips = 99, topTilt = 0, topCup = 0;
    const start = sample(0);
    let footTravel = 0;
    for (let i = 0; i <= 64; i++) {
        const phase = i / 64;
        const s = sample(phase);
        footTravel = Math.max(footTravel, B.Vector3.Distance(s.feet[0], start.feet[0]), B.Vector3.Distance(s.feet[1], start.feet[1]));
        if (phase >= 0.2 && phase <= 0.68) {
            rimToLips = Math.min(rimToLips, B.Vector3.Distance(s.rim, s.lips));
            topTilt = Math.max(topTilt, s.tilt);
            topCup = Math.max(topCup, s.cup.y);
        }
        // His free hand rests on the counter while the other drinks, not through it.
        if (phase >= 0.16 && phase <= 0.86) {
            assert.ok(s.otherWrist.y > 1.05 && s.otherWrist.y < 1.2, `his free wrist is ${s.otherWrist.y.toFixed(3)} m high at phase ${phase}`);
        }
    }
    assert.ok(rimToLips < 0.07, `the rim of the glass stays ${rimToLips.toFixed(3)} m from his lips`);
    assert.ok(topTilt > 0.7, `the glass only tips ${topTilt.toFixed(2)} rad for the sip`);
    assert.ok(topCup > 1.3, `the glass only rises to ${topCup.toFixed(2)} m`);
    assert.ok(footTravel < 0.02, `a foot slides ${footTravel.toFixed(3)} m while he drinks`);
    scene.dispose();
});

test('the bar regular stays seated on the stool, plants both feet and raises the bottle to her face', async () => {
    const { scene, container, B } = await loadContainer('club-crowd-f6.glb');
    const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    root.rotationQuaternion = null;
    root.rotation.y = Math.PI / 2;
    root.position.set(9.08, 0, -11.6);
    root.computeWorldMatrix(true);
    let bounds = root.getHierarchyBoundingVectors(true);
    root.scaling.setAll(1.66 / (bounds.max.y - bounds.min.y));
    root.computeWorldMatrix(true);
    bounds = root.getHierarchyBoundingVectors(true);
    root.position.y -= bounds.min.y;
    const node = name => root.getDescendants(false, n => n.name === name)[0];
    const at = name => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
    const idle = entry.animationGroups.find(animation => animation.name.endsWith('Seated_Bar_Idle_Loop'));
    const drink = entry.animationGroups.find(animation => animation.name.endsWith('Seated_Bar_Drink_Loop'));
    assert.ok(idle && drink, 'club-crowd-f6.glb has no authored seated bar clips');

    idle.start(false);
    idle.pause();
    const feet = [];
    for (let i = 0; i <= 32; i++) {
        idle.goToFrame(idle.from + (idle.to - idle.from) * i / 32);
        root.computeWorldMatrix(true);
        feet.push([at('Foot.L'), at('Foot.R')]);
        const hips = at('Body');
        assert.ok(Math.abs(hips.y - 0.80) < 0.045, `her hips miss the stool cushion at ${hips.y.toFixed(3)} m`);
        const leftWrist = at('Wrist.L'), rightWrist = at('Wrist.R');
        for (const wrist of [leftWrist, rightWrist]) {
            assert.ok(Math.abs(wrist.x - 9.7) < 0.09, `her hand stops ${Math.abs(wrist.x - 9.7).toFixed(3)} m from the counter edge`);
            assert.ok(Math.abs(wrist.y - 1.1) < 0.10, `her hand misses the counter top by ${Math.abs(wrist.y - 1.1).toFixed(3)} m`);
        }
        // She leans on the bar with bent elbows, not an upright mannequin with locked arms.
        for (const side of ['L', 'R']) {
            const a = at(`UpperArm.${side}`).subtract(at(`LowerArm.${side}`)).normalize();
            const c = at(`Wrist.${side}`).subtract(at(`LowerArm.${side}`)).normalize();
            const elbow = Math.acos(B.Vector3.Dot(a, c)) * 180 / Math.PI;
            assert.ok(elbow > 105 && elbow < 160, `her ${side} elbow is ${elbow.toFixed(0)} degrees: locked straight or folded`);
        }
        assert.ok(at('Head').x - hips.x > 0.05, 'she sits bolt upright instead of leaning on the bar');
    }
    // The bottle stands in her right hand: the runtime's resting bottle point (VRClubAudioCrowd._createBarPatronBottle)
    // is her palm 6 cm up and 3 cm toward her midline.
    idle.goToFrame(idle.from);
    root.computeWorldMatrix(true);
    const palm = at('Middle1.R');
    assert.ok(Math.abs(palm.x - 9.698) < 0.015 && Math.abs(palm.y + 0.06 - 1.192) < 0.015 && Math.abs(palm.z - (-11.6 + 0.169)) < 0.015,
        `her resting palm ${palm.toString()} is not where the bottle stands`);
    for (const side of [0, 1]) {
        const travel = Math.max(...feet.map(pair => B.Vector3.Distance(pair[side], feet[0][side])));
        const high = Math.max(...feet.map(pair => pair[side].y));
        assert.ok(travel < 0.02, `seated foot ${side} slides ${travel.toFixed(3)} m`);
        assert.ok(high < 0.12, `seated foot ${side} floats ${high.toFixed(3)} m over the floor`);
    }

    idle.stop();
    drink.start(false);
    drink.pause();
    let closest = Infinity;
    for (let i = 0; i <= 48; i++) {
        drink.goToFrame(drink.from + (drink.to - drink.from) * i / 48);
        root.computeWorldMatrix(true);
        closest = Math.min(closest, B.Vector3.Distance(at('Wrist.R'), at('Head')));
    }
    assert.ok(closest < 0.25, `the bottle hand stays ${closest.toFixed(3)} m from her face`);
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

test('the DJ puts the palm, not the back of the hand, on the headphone cup, and raises open palms to the crowd', async () => {
    const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    for (const [glb, height] of [['club-dj-male.glb', 1.78], ['club-dj-female.glb', 1.68]]) {
        const { rig, B, scene } = await loadRig(glb, { eyeHeight: height * 0.93 });
        const Performer = vm.runInContext('DJPerformer', sandbox());
        const dj = new Performer({ x: 0, z: desk.near - 0.18, groundY: 0.5, eyeHeight: height * 0.93, desk, rng: () => 0.5 });
        const music = { hasAudio: true, beatPhase: 0, bar: 0, energy: 0.6, drop: false, bpm: 124 };
        const step = frames => { for (let i = 0; i < frames; i++) rig.update(DT, dj.update(DT, music, null)); };
        const at = name => pos(rig, name);
        const raw = side => {
            const hand = at(`hand_${side}`);
            return B.Vector3.Cross(at(`index_01_${side}`).subtract(hand), at(`pinky_01_${side}`).subtract(hand)).normalize();
        };
        // Palm side of each hand, calibrated where the palm is known: flat on the mixer, facing down.
        dj._begin('tweak', 99);
        step(90);
        const sign = {};
        for (const side of ['l', 'r']) sign[side] = B.Vector3.Dot(raw(side), new B.Vector3(0, -1, 0)) >= 0 ? 1 : -1;
        const palm = side => raw(side).scale(sign[side]);

        dj._begin('cue', 99);
        step(90);
        // Whichever bone the GLB calls left may be the DJ's right (see the knob test): the ear hand is the one at the ear.
        const target = dj.pose.left;
        const ear = B.Vector3.Distance(at('hand_l'), new B.Vector3(target.x, target.y, target.z))
            < B.Vector3.Distance(at('hand_r'), new B.Vector3(target.x, target.y, target.z)) ? 'l' : 'r';
        const toHead = at('Head').subtract(at(`hand_${ear}`)).normalize();
        assert.ok(B.Vector3.Distance(at(`hand_${ear}`), at('Head')) < 0.3, `${glb}: the hand is not at the ear (${B.Vector3.Distance(at(`hand_${ear}`), at('Head')).toFixed(2)} m from the head)`);
        const onCup = B.Vector3.Dot(palm(ear), toHead);
        assert.ok(onCup > 0.7, `${glb}: the back of the hand faces the head, not the palm (${onCup.toFixed(2)})`);

        music.drop = true; step(1); music.drop = false; step(60);
        for (const side of ['l', 'r']) {
            const forward = palm(side).z;
            assert.ok(forward > 0.5, `${glb}: the raised ${side} palm does not face the crowd (${forward.toFixed(2)})`);
        }
        scene.dispose();
    }
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
        const samples = [];
        // Every knob in reach (the performer picks a knob with rng; no bar lines pass, so nothing else draws):
        // the wrist 5 cm behind each palm target, whichever bone the GLB calls left.
        for (let knob = 0; knob < 6; knob++) {
            pick = (knob + 0.5) / 6;
            samples.push(step(70));
            for (const h of [dj.pose.left, dj.pose.right]) {
                const want = { x: h.x - h.fx * 0.05, y: h.y - h.fy * 0.05, z: h.z - h.fz * 0.05 };
                const miss = Math.min(dist(pos(rig, 'hand_l'), want), dist(pos(rig, 'hand_r'), want));
                assert.ok(miss < 0.03, `${glb}: knob ${knob}: a hand stops ${miss.toFixed(3)} m short of the controller`);
            }
        }
        dj._begin('mix', 99);
        samples.push(step(70));
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
        const orderedSamples = samples.slice().sort((a, b) => a - b);
        const ms = orderedSamples[Math.floor(orderedSamples.length / 2)];
        assert.ok(ms < 2, `${glb}: the performing DJ costs ${ms.toFixed(2)} ms a frame`);
        // Hands up on a drop: both wrists above the head.
        music.drop = true; step(1); music.drop = false; step(60);
        assert.ok(pos(rig, 'hand_l').y > pos(rig, 'Head').y && pos(rig, 'hand_r').y > pos(rig, 'Head').y, `${glb}: hands not up on the drop`);
        scene.dispose();
    }
});

test('crowd animation reuses interpolation results without changing the real skeleton pose', async () => {
    const { scene, container, B, box } = await loadContainer('club-crowd-f1.glb');
    if (typeof box.VRClubAudioCrowd?._reuseAnimationInterpolation !== 'function') {
        box.VRClubUI = class {};
        vm.runInContext(readFileSync(join(ROOT, 'js/club/11-audio-crowd.js'), 'utf8'), box, {
            filename: 'js/club/11-audio-crowd.js'
        });
    }
    const Crowd = box.VRClubAudioCrowd;
    const entry = container.instantiateModelsToScene(name => `reuse_${name}`, false, { doNotInstantiate: true });
    const root = entry.rootNodes[0];
    const group = entry.animationGroups.find(g => g.name.endsWith('Groove_Bounce'));
    assert.ok(group && group.targetedAnimations.length >= 23);
    const nodes = root.getChildTransformNodes(false).filter(node => node.rotationQuaternion).slice(0, 20);
    group.start(false);
    group.pause();
    const sample = fraction => {
        group.goToFrame(group.from + (group.to - group.from) * fraction);
        root.computeWorldMatrix(true);
        return nodes.flatMap(node => {
            node.computeWorldMatrix(true);
            const p = node.getAbsolutePosition(), q = node.rotationQuaternion;
            return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
        });
    };
    const before = sample(0.373);
    const animation = group.targetedAnimations.map(target => target.animation)
        .find(a => a.dataType === B.Animation.ANIMATIONTYPE_QUATERNION);
    const keys = animation.getKeys();
    assert.notEqual(animation.quaternionInterpolateFunction(keys[0].value, keys[1].value, 0.4),
        animation.quaternionInterpolateFunction(keys[0].value, keys[1].value, 0.4),
        'the stock Babylon path unexpectedly reused its interpolation result');
    const optimized = Crowd._reuseAnimationInterpolation(group);
    assert.ok(optimized >= 23, `only ${optimized} animated channels received reusable interpolation storage`);
    const first = animation.quaternionInterpolateFunction(keys[0].value, keys[1].value, 0.4);
    const second = animation.quaternionInterpolateFunction(keys[0].value, keys[1].value, 0.4);
    assert.equal(first, second, 'an animated joint still allocates a result every evaluation');
    const after = sample(0.373);
    assert.equal(after.length, before.length);
    for (let i = 0; i < after.length; i++) {
        assert.ok(Math.abs(after[i] - before[i]) < 1e-6, `reused interpolation changed pose component ${i}`);
    }
    scene.dispose();
});

// The grooves are authored procedurally onto the modular rig (scripts/build-crowd-glbs.mjs) at 120 BPM with a beat on
// every 0.5 s: measure them on the real skeleton, at the frames where the beats fall.
test('dance arms keep their elbow hinge aligned instead of corkscrewing the upper arm and forearm', async () => {
    for (const file of ['club-crowd-f1.glb', 'club-crowd-m1.glb', 'club-crowd-f2.glb', 'club-crowd-m7.glb',
        join(ROOT, 'js', 'models', 'characters', 'nia.glb'), join(ROOT, 'js', 'models', 'characters', 'tao.glb')]) {
        const { scene, engine, container, B } = await loadContainer(file);
        container.animationGroups.forEach(group => group.stop());
        const nodes = container.transformNodes;
        const node = name => nodes.find(n => n.name === name);
        const position = name => {
            const n = node(name);
            n.computeWorldMatrix(true);
            return n.getAbsolutePosition().clone();
        };
        const rotation = name => {
            const n = node(name);
            n.computeWorldMatrix(true);
            const q = new B.Quaternion();
            n.getWorldMatrix().decompose(undefined, q);
            return q;
        };
        const rotate = (v, q) => v.applyRotationQuaternion(q);
        const rest = {};
        for (const side of ['L', 'R']) {
            const upper = `UpperArm.${side}`, lower = `LowerArm.${side}`, wrist = `Wrist.${side}`;
            const axis = position(lower).subtract(position(upper)).normalize();
            const hinge = B.Vector3.Cross(axis, position(wrist).subtract(position(lower)).normalize()).normalize();
            rest[side] = { hinge, axis: position(wrist).subtract(position(lower)).normalize(),
                upper: rotation(upper), lower: rotation(lower), wrist: rotation(wrist) };
        }
        for (const group of container.animationGroups.filter(g => g.name.startsWith('Groove_') || g.name === 'Dance_Loop')) {
            const previousRotations = new Map();
            group.start(false);
            group.pause();
            for (let frame = group.from; frame <= group.to; frame += 3) {
                group.goToFrame(frame);
                for (const side of ['L', 'R']) {
                    const upper = `UpperArm.${side}`, lower = `LowerArm.${side}`, wrist = `Wrist.${side}`;
                    const a = position(lower).subtract(position(upper)).normalize();
                    const b = position(wrist).subtract(position(lower)).normalize();
                    const hinge = B.Vector3.Cross(a, b).normalize();
                    for (const part of ['upper', 'lower']) {
                        const current = rotation(part === 'upper' ? upper : lower);
                        const key = `${side}.${part}`, previous = previousRotations.get(key);
                        if (previous) {
                            const turn = 2 * Math.acos(Math.min(1, Math.abs(B.Quaternion.Dot(previous, current))));
                            assert.ok(turn < 0.65, `${file} ${group.name} ${key} frame ${frame}: arm snaps ${(turn * 180 / Math.PI).toFixed(1)} degrees`);
                        }
                        previousRotations.set(key, current);
                        const q = current.multiply(B.Quaternion.Inverse(rest[side][part]));
                        const alignment = B.Vector3.Dot(rotate(rest[side].hinge, q), hinge);
                        const minimum = part === 'lower' && group.name.startsWith('Groove_') ? Math.cos(76 * Math.PI / 180) : 0.98;
                        assert.ok(alignment > minimum, `${file} ${group.name} ${side} ${part} frame ${frame}: elbow hinge twisted (${alignment.toFixed(3)})`);
                    }
                    const lowerDelta = rotation(lower).multiply(B.Quaternion.Inverse(rest[side].lower));
                    const wristDelta = rotation(wrist).multiply(B.Quaternion.Inverse(rest[side].wrist));
                    const relative = B.Quaternion.Inverse(lowerDelta).multiply(wristDelta);
                    const angle = 2 * Math.atan2(relative.x * rest[side].axis.x + relative.y * rest[side].axis.y + relative.z * rest[side].axis.z, relative.w);
                    const roll = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
                    if (group.name.startsWith('Groove_')) {
                        assert.ok(roll < 61 * Math.PI / 180, `${file} ${group.name} ${side} frame ${frame}: wrist takes all palm roll (${(roll * 180 / Math.PI).toFixed(1)} degrees)`);
                    }
                }
            }
            group.stop();
        }
        scene.dispose();
        engine.dispose();
    }
});

test('the crowd grooves: on the beat where it matters, feet planted, hands where they should be, seamless loops', async () => {
    const GROOVES = {
        Groove_Bounce: 8, Groove_SideTap: 8, Groove_Clap: 2, Groove_ClapUp: 2, Groove_Pump: 8, Groove_Twist: 4, Groove_HandsUp: 4,
        Groove_Sway: 4, Groove_ArmsWide: 8, Groove_ArmsUp: 8, Groove_Still: 8
    };
    for (const file of ['club-crowd-f1.glb', 'club-crowd-m1.glb', 'club-crowd-m7.glb', 'club-crowd-f2.glb']) {
        const { scene, container, B } = await loadContainer(file);
        const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
        const root = entry.rootNodes[0];
        // Placed the way the club places a person: the glTF root's handedness flip replaced by a plain yaw.
        root.rotationQuaternion = null;
        root.rotation.y = 0;
        root.scaling.setAll(1);
        const node = name => root.getDescendants(false, n => n.name === name)[0];
        const names = ['Head', 'Chest', 'Hips', 'Wrist.L', 'Wrist.R', 'Foot.L', 'Foot.R', 'UpperArm.L', 'LowerArm.L', 'UpperLeg.R', 'LowerLeg.R',
            'Middle1.L', 'Middle1.R', 'Index2.L', 'Index2.R', 'Pinky2.L', 'Pinky2.R'];
        const at = () => {
            root.computeWorldMatrix(true);
            return Object.fromEntries(names.map(name => { const n = node(name); n.computeWorldMatrix(true); return [name, n.getAbsolutePosition().clone()]; }));
        };
        const rest = at();
        const height = rest.Head.y;
        // Which way a palm faces: (index knuckle - wrist) x (pinky knuckle - wrist). Every dancer shares the rig's
        // handedness, so the sign is fixed per hand: for the right hand, fingers forward and the thumb side up, the palm
        // faces the midline (confirmed against a render of a real clap).
        const rawNormal = (s, side) => B.Vector3.Cross(s[`Index2.${side}`].subtract(s[`Wrist.${side}`]), s[`Pinky2.${side}`].subtract(s[`Wrist.${side}`])).normalize();
        const palmSign = { R: 1, L: -1 };
        const palmNormal = (s, side) => rawNormal(s, side).scale(palmSign[side]);
        const palmCentre = (s, side) => s[`Wrist.${side}`].add(s[`Middle1.${side}`]).scale(0.5);
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
            if (clip === 'Groove_Clap' || clip === 'Groove_ClapUp') {
                for (const s of onBeats) assert.ok(B.Vector3.Distance(s['Wrist.L'], s['Wrist.R']) < 0.14, `${file} ${clip}: the hands do not meet on beat ${s.beat}`);
                for (const s of between) assert.ok(B.Vector3.Distance(s['Wrist.L'], s['Wrist.R']) > 0.3, `${file} ${clip}: the hands do not open between claps`);
                // PALMS meet palms: each palm faces the other all the way through (not the edge, the back or the outside).
                for (const s of samples) {
                    const toLeft = palmCentre(s, 'L').subtract(palmCentre(s, 'R')).normalize();
                    const right = B.Vector3.Dot(palmNormal(s, 'R'), toLeft), left = B.Vector3.Dot(palmNormal(s, 'L'), toLeft.scale(-1));
                    assert.ok(right > 0.9 && left > 0.9, `${file} ${clip}: the palms are not facing each other at beat ${s.beat} (${right.toFixed(2)}, ${left.toFixed(2)})`);
                }
                for (const s of onBeats) assert.ok(B.Vector3.Distance(palmCentre(s, 'L'), palmCentre(s, 'R')) < 0.06, `${file} ${clip}: the palms do not touch on beat ${s.beat}`);
                if (clip === 'Groove_Clap') {
                    for (const s of samples) assert.ok(s['Wrist.L'].y > s.Hips.y && s['Wrist.L'].y < s.Head.y, `${file}: the clap is not in front of the chest`);
                } else {
                    for (const s of samples) assert.ok(Math.min(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y + 0.1, `${file}: the overhead clap is not above the head at beat ${s.beat}`);
                }
            }
            if (clip === 'Groove_ArmsWide') {
                for (const s of samples) {
                    assert.ok(Math.abs(s['Wrist.L'].x - s['Wrist.R'].x) > 0.8, `${file}: the arms are not spread wide at beat ${s.beat}`);
                    assert.ok(palmNormal(s, 'L').y > 0.7 && palmNormal(s, 'R').y > 0.7, `${file}: the open hands do not face up at beat ${s.beat}`);
                }
            }
            if (clip === 'Groove_ArmsUp') {
                for (const s of samples) {
                    assert.ok(Math.min(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y, `${file}: a hand is not up at beat ${s.beat}`);
                    assert.ok(palmNormal(s, 'L').z > 0.7 && palmNormal(s, 'R').z > 0.7, `${file}: the raised palms do not face forward at beat ${s.beat}`);
                }
            }
            if (clip === 'Groove_Pump') {
                for (const s of onBeats) assert.ok(Math.max(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y + 0.05, `${file}: the fist is not up on beat ${s.beat}`);
            }
            if (clip === 'Groove_HandsUp') {
                for (const s of samples) assert.ok(Math.min(s['Wrist.L'].y, s['Wrist.R'].y) > s.Head.y, `${file}: a hand is not up at beat ${s.beat}`);
            }
            if (['Groove_Bounce', 'Groove_Clap', 'Groove_ClapUp', 'Groove_Pump', 'Groove_HandsUp', 'Groove_SideTap', 'Groove_Twist'].includes(clip)) {
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
