// Laser sheets, measured on the real code and the real Babylon maths.
//
// Two scissoring planes are slow individually (~2 deg/s) but meet along a line that can run
// many times faster, and that bright crossing is what the eye follows. The old tuning
// (inward aim 0.10 rad, trail 0.9) put the crossing at a median 1.6 m/s, 7.5 m/s at the peak,
// and 3-5 m above the floor. This test runs the shipped configuration and pose methods on real
// transforms, so changing the geometry, the trail, the speed cap or the look speeds has to
// pass the same measurements.

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

function load() {
    const sandbox = {
        console, performance, URL, TextDecoder, TextEncoder, Blob, ArrayBuffer, Uint8Array, Float32Array, DataView,
        Promise, Map, Set, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        btoa: s => Buffer.from(s, 'binary').toString('base64')
    };
    sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
    sandbox.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
    sandbox.navigator = { userAgent: 'node' };
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(ROOT, 'js/vendor/babylon.js'), 'utf8'), sandbox, { filename: 'babylon.js' });
    sandbox.BABYLON.Logger.LogLevels = 0;
    sandbox.VRClubFixtures = class {};
    vm.runInContext(readFileSync(join(ROOT, 'js/club/06-effects.js'), 'utf8'), sandbox, { filename: '06-effects.js' });
    vm.runInContext(readFileSync(join(ROOT, 'js/club/07-animation-core.js'), 'utf8'), sandbox, { filename: '07-animation-core.js' });
    vm.runInContext(readFileSync(join(ROOT, 'js/showDirector.js'), 'utf8'), sandbox, { filename: 'showDirector.js' });
    return sandbox;
}

/** The shipped configure + pose methods, on real TransformNodes at the real mount points. */
function makeSheets(sb, { motion, speed }) {
    const B = sb.BABYLON;
    const scene = new B.Scene(new B.NullEngine());
    const mount = x => {
        const housing = new B.TransformNode(`housing${x}`, scene);
        housing.position.set(x, 7.55, -16);
        return { housing, aperture: { material: { emissiveColor: null } } };
    };
    const effects = sb.window.VRClubEffects.prototype;
    const core = sb.window.VRClubAnimationCore.prototype;
    const club = Object.create(effects);
    const fan = () => ({ isVisible: false, parent: null });
    Object.assign(club, {
        laserSheetOrigin: 'both', laserSheetMotion: motion, laserSpeed: speed,
        _laserApertureOff: new B.Color3(0, 0, 0),
        _laserSheetMounts: { ceilingLeft: mount(-6), ceilingRight: mount(6) },
        laserSheet: fan(), laserSheetHaze: fan(), _laserSheetFanB: { sheet: fan(), haze: fan() },
        _poseLaserSheet: core._poseLaserSheet
    });
    club.laserSheetSource = club._laserSheetMounts.ceilingLeft.housing;
    club.laserAperture = club._laserSheetMounts.ceilingLeft.aperture;
    club.configureLaserSheetVariant();
    return club;
}

/** Where the two fans' planes cross, on the plane z = zq (x across, y up); null if they do not. */
function crossingAt(club, zq) {
    const B = club._B;
    const plane = housing => {
        housing.computeWorldMatrix(true);
        const n = B.Vector3.TransformNormal(new B.Vector3(0, 1, 0), housing.getWorldMatrix());
        const o = housing.getAbsolutePosition();
        return { n, o };
    };
    const A = plane(club._laserSheetMounts.ceilingLeft.housing), C = plane(club._laserSheetMounts.ceilingRight.housing);
    const d = P => P.n.x * P.o.x + P.n.y * P.o.y + P.n.z * (P.o.z - zq);
    const det = A.n.x * C.n.y - C.n.x * A.n.y;
    if (Math.abs(det) < 1e-6) return null;
    const x = (d(A) * C.n.y - d(C) * A.n.y) / det, y = (A.n.x * d(C) - C.n.x * d(A)) / det;
    return Number.isFinite(x) && Math.abs(x) <= 14 && y >= 0 && y <= 9 ? { x, y } : null;
}

function measure(sb, motion, speed, seconds = 90) {
    const club = makeSheets(sb, { motion, speed });
    club._B = sb.BABYLON;
    const speeds = [], heights = [];
    let prev = null, inRoom = 0, frames = 0;
    for (let i = 0; i < seconds * 60; i++) {
        club._poseLaserSheet(100 + i / 60);
        frames++;
        const q = crossingAt(club, -9);
        if (!q) { prev = null; continue; }
        inRoom++;
        heights.push(q.y);
        if (prev) speeds.push(Math.hypot(q.x - prev.x, q.y - prev.y) * 60);
        prev = q;
    }
    speeds.sort((a, b) => a - b);
    return {
        median: speeds[Math.floor(speeds.length / 2)],
        p95: speeds[Math.floor(speeds.length * 0.95)],
        max: speeds[speeds.length - 1],
        minHeight: Math.min(...heights), maxHeight: Math.max(...heights),
        inRoom: inRoom / frames
    };
}

function summarizeCrossing(club, hz, runFrame) {
    const speeds = [];
    let prev = null;
    let inRoom = 0;
    let frames = 0;
    for (let frame = 0; runFrame(frame); frame++) {
        frames++;
        const q = crossingAt(club, -9);
        if (!q) { prev = null; continue; }
        inRoom++;
        if (prev) speeds.push(Math.hypot(q.x - prev.x, q.y - prev.y) * hz);
        prev = q;
    }
    speeds.sort((a, b) => a - b);
    return {
        p95: speeds[Math.floor(speeds.length * 0.95)],
        max: speeds[speeds.length - 1],
        inRoom: inRoom / frames
    };
}

test('the crossing of the two laser sheets drifts slowly and stays just above head height', () => {
    const sb = load();
    // Every shipped sheet look, at both ends of its speed ramp.
    const looks = sb.window.ShowDirector._buildLooks();
    const cases = [];
    for (const [name, look] of Object.entries(looks)) {
        if (!look.laserSheetActive) continue;
        const speeds = Array.isArray(look.laserSpeed) ? look.laserSpeed : [look.laserSpeed, look.laserSpeed];
        for (const speed of speeds) cases.push({ name, motion: look.laserSheetMotion || 'vertical', speed });
    }
    assert.ok(cases.length >= 8, 'expected the shipped sheet looks to be found');
    for (const c of cases) {
        const m = measure(sb, c.motion, c.speed);
        const label = `${c.name} (${c.motion}, speed ${c.speed})`;
        assert.ok(m.inRoom > 0.8, `${label}: the crossing left the room ${(100 - m.inRoom * 100).toFixed(0)}% of the time`);
        assert.ok(m.p95 <= 1.0, `${label}: the crossing runs at ${m.p95.toFixed(2)} m/s (p95), faster than a walk`);
        assert.ok(m.max <= 1.5, `${label}: the crossing peaks at ${m.max.toFixed(2)} m/s`);
        assert.ok(m.minHeight >= 1.9, `${label}: the crossing dips to ${m.minHeight.toFixed(2)} m, into the crowd's heads`);
        assert.ok(m.maxHeight <= 3.9, `${label}: the crossing rises to ${m.maxHeight.toFixed(2)} m, far above the crowd`);
    }
});

test('a sheet cannot be sped up past the cap by the laser speed slider or a legacy phase', () => {
    const sb = load();
    const slow = measure(sb, 'vertical', 1.4, 60);
    const wild = measure(sb, 'vertical', 2.0, 60);        // legacy phases and the slider can ask for this
    assert.ok(Math.abs(wild.p95 - slow.p95) < 1e-6, 'a laser speed above the cap still changed the sweep');
    assert.ok(wild.p95 <= 1.0, `even at the cap the crossing runs at ${wild.p95.toFixed(2)} m/s`);
});

test('the old tuning would fail these limits (the test is measuring the right thing)', () => {
    const sb = load();
    const club = makeSheets(sb, { motion: 'vertical', speed: 0.65 });
    club._B = sb.BABYLON;
    // Re-impose the geometry the sheets shipped with before this change.
    club._laserSheetBasePitch = 0.44; club._laserSheetPitchRange = 0.10;
    club._laserSheetBaseYaw = 0.10; club._laserSheetYawRange = 0.16; club._laserSheetTrail = 0.9;
    const speeds = [], heights = [];
    let prev = null;
    for (let i = 0; i < 90 * 60; i++) {
        club._poseLaserSheet(100 + i / 60);
        const q = crossingAt(club, -9);
        if (!q) { prev = null; continue; }
        heights.push(q.y);
        if (prev) speeds.push(Math.hypot(q.x - prev.x, q.y - prev.y) * 60);
        prev = q;
    }
    speeds.sort((a, b) => a - b);
    assert.ok(speeds[Math.floor(speeds.length * 0.95)] > 3, 'the old crossing was supposed to be fast');
    assert.ok(Math.max(...heights) > 4.5, 'the old crossing was supposed to be high');
});

test('shipped sheet ramps stay continuous across uptime and refresh rates', () => {
    const sb = load();
    const looks = sb.window.ShowDirector._buildLooks();
    const cases = Object.entries(looks)
        .filter(([, look]) => look.laserSheetActive && Array.isArray(look.laserSpeed))
        .map(([name, look]) => ({
            name,
            motion: look.laserSheetMotion || 'vertical',
            from: look.laserSpeed[0],
            to: look.laserSpeed[1]
        }));
    assert.ok(cases.length >= 4, 'expected the shipped sheet looks to include ramps');

    for (const startTime of [0, 60, 600]) {
        for (const hz of [45, 60, 72, 90, 120]) {
            for (const c of cases) {
                const club = makeSheets(sb, { motion: c.motion, speed: c.from });
                club._B = sb.BABYLON;
                const durationFrames = Math.max(1, Math.round((4 * 4 * 60 / 130) * hz));
                const metrics = summarizeCrossing(club, hz, frame => {
                    const t = durationFrames <= 1 ? 1 : frame / (durationFrames - 1);
                    club.laserSpeed = c.from + (c.to - c.from) * t;
                    club._poseLaserSheet(startTime + frame / hz);
                    return frame + 1 < durationFrames;
                });
                const label = `${c.name}, ${hz} Hz, start ${startTime}s`;
                assert.ok(metrics.inRoom > 0.8, `${label}: the crossing left the room ${(100 - metrics.inRoom * 100).toFixed(0)}% of the time`);
                assert.ok(metrics.p95 <= 1.0, `${label}: ramping drove the crossing at ${metrics.p95.toFixed(2)} m/s (p95)`);
                assert.ok(metrics.max <= 1.5, `${label}: a speed ramp teleported the crossing to ${metrics.max.toFixed(2)} m/s`);
            }
        }
    }
});
