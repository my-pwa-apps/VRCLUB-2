// AvatarRig on the REAL dancer skeleton and the REAL Babylon, headless.
//
// The rig is mostly geometry (planted feet, IK, turning), so stubs would prove nothing: a
// stub cannot tell a foot that slides from one that is planted. These tests load the
// vendored Babylon into a vm with a NullEngine, load the shipped GLB from disk, and measure
// bone positions after posing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { TextDecoder, TextEncoder } from 'node:util';
import { Blob } from 'node:buffer';
import { setTimeout, clearTimeout, setInterval, clearInterval } from 'node:timers';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function loadRig(glb = 'club-dancer-male.glb', options = { eyeHeight: 1.7 }) {
    const sandbox = {
        console, setTimeout, clearTimeout, setInterval, clearInterval, performance, URL,
        TextDecoder, TextEncoder, Blob, ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        btoa: s => Buffer.from(s, 'binary').toString('base64')
    };
    sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
    sandbox.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
    sandbox.navigator = { userAgent: 'node' };
    vm.createContext(sandbox);
    for (const file of ['js/vendor/babylon.js', 'js/vendor/babylonjs.loaders.min.js', 'js/avatarRig.js']) {
        vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), sandbox, { filename: file });
    }
    const B = sandbox.BABYLON;
    B.Logger.LogLevels = B.Logger.WarningLogLevel | B.Logger.ErrorLogLevel;
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    const bytes = readFileSync(join(ROOT, 'js/models/avatars', glb));
    const container = await B.SceneLoader.LoadAssetContainerAsync(
        '', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
    const Rig = vm.runInContext('AvatarRig', sandbox);
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

test('the rig builds on every UE-skeleton body and stands at the requested eye height', async () => {
    for (const glb of ['club-dancer-female.glb', 'club-dancer-male.glb', 'club-dj.glb']) {
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
