#!/usr/bin/env node
// Build the club's diverse crowd from the CC0 Quaternius *Modular Women* and *Modular Men* packs.
//
//   node scripts/build-crowd-glbs.mjs --women "<dir of the Modular Women glTFs>" --men "<dir of the Modular Men glTFs>"
//   npm run optimize:avatars -- club-crowd-f1.glb ...        (the script runs it for you with --optimize)
//
// What it does, per person in CAST below:
//  1. Retargets the club's own clips (Dance_Loop, Idle_Talking_Loop, ...) from the Universal Animation Library
//     skeleton in `club-guest-female.glb` / `club-guest-male.glb` onto the modular 62-bone rig. The modular packs
//     ship Walk/Run/Punch clips and no dancing, and the two rigs differ (a `Body` bone carries the height, the
//     legs hang from it, the feet are separate IK bones, and the bind pose has the arms by the sides, not out in a
//     T). Trunk bones take the source's WORLD rotation delta from its bind pose; arms and legs are aimed along the
//     source's world bone directions (swing only), which is what makes a T-posed source drive a relaxed rig.
//  2. Recolours: skin tone, hair, and any garment, through a per-person palette. A person marked `mirror` plays the
//     dance reflected across the body's midline, so two dancers are not in step.
//  3. Bakes every material into per-vertex colour on ONE material, so a person is one draw call (the packs use
//     six to ten flat-colour materials each).
//  4. Drops props (pistols, hats, crowns), writes `club-crowd-<id>.glb`.
//
// Retargeting is geometry-free maths on rest poses and keyframes; it never touches the meshes or skin.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argument = name => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : null;
};
const dirs = { women: argument('--women'), men: argument('--men') };
const outDir = argument('--out') || join(ROOT, 'js/models/avatars');
const only = argument('--only');
if (!dirs.women || !dirs.men) {
    console.error('usage: node scripts/build-crowd-glbs.mjs --women "<dir>" --men "<dir>" [--out <dir>] [--only id,id] [--optimize]');
    process.exit(1);
}

const FPS = 30;
const CLIPS = ['Dance_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Yes'];
const PROPS = /Pistol|Gun|Sword|Hat|Crown|Helmet|Hood/i;

// Skin tones (sRGB). The packs' own skin is #cead86.
const SKIN = {
    fair: '#e9c8ae', light: '#dcae88', tan: '#c58e62', medium: '#b27a4f', brown: '#966141', deep: '#6b432d', espresso: '#553323'
};
const BLACK_HAIR = '#15110f', SILVER = '#c8c9d0';

/**
 * Who is in the crowd. `colors` keys are a material name, or `Part:Material` for one body part (Body, Head, Legs,
 * Feet) when a material is shared between, say, the hair and the shoes. Values are sRGB hex.
 */
const CAST = [
    // Women. `clips` defaults to the dance only; guests also carry the idle poses the guest slots ask for.
    { id: 'f1', base: 'women', file: 'Casual', skin: 'deep', colors: { Hair_Blond: BLACK_HAIR, Hair_Brown: BLACK_HAIR, Orange: '#2b3a5c' } },
    { id: 'f2', base: 'women', file: 'Casual', skin: 'fair', mirror: true, colors: { Hair_Blond: '#9a4a28', White: '#2f9082', Orange: '#1d1d22' } },
    { id: 'f3', base: 'women', file: 'Punk', skin: 'tan', colors: { Pink: '#16b8c8' } },
    { id: 'f4', base: 'women', file: 'Formal', skin: 'brown', mirror: true, colors: { LimeGreen: '#7c1733', 'Head:Red': BLACK_HAIR } },
    { id: 'f5', base: 'women', file: 'Formal', skin: 'light', colors: { LimeGreen: '#1c3270', 'Head:Red': '#b9893d' } },
    { id: 'f6', base: 'women', file: 'Suit', skin: 'fair', guest: true, colors: { Hair_Blond: SILVER, Hair_Brown: '#9a9aa2', Black: '#2b2230', White: '#cdd2ea' } },
    { id: 'f7', base: 'women', file: 'Suit', skin: 'espresso', guest: true, colors: { Hair_Blond: '#0d0b0a', Hair_Brown: '#0d0b0a', Black: '#7b1e2c' } },
    { id: 'f8', base: 'women', file: 'Casual', skin: 'medium', guest: true, colors: { Hair_Blond: '#2b1b12', White: '#e8d6a0', Orange: '#3a2a4a' } },
    // Men
    { id: 'm1', base: 'men', file: 'Casual_2', skin: 'deep', mirror: true, colors: { Hair: BLACK_HAIR, Eyebrows: BLACK_HAIR, LightBrown: '#1b1b20', LightBlue: '#2a3342' } },
    { id: 'm2', base: 'men', file: 'Casual_2', skin: 'fair', colors: { Hair: SILVER, Eyebrows: '#9c9ca3', LightBrown: '#6f7f93' } },
    { id: 'm3', base: 'men', file: 'Casual_Hoodie', skin: 'tan', mirror: true, colors: { Hair: '#2a1b10', Purple: '#1f5b3b' } },
    { id: 'm4', base: 'men', file: 'Casual_Hoodie', skin: 'brown', guest: true, colors: { Hair: BLACK_HAIR, Eyebrows: BLACK_HAIR, Purple: '#a43c2a' } },
    { id: 'm5', base: 'men', file: 'Punk', skin: 'light', colors: { Red: '#2f6dff', Red_Dark: '#1e40a2' } },
    { id: 'm6', base: 'men', file: 'Suit', skin: 'tan', guest: true, colors: { Hair: '#b9bac2', Eyebrows: '#9c9ca3', Suit: '#2a303b' } },
    { id: 'm7', base: 'men', file: 'Suit', skin: 'deep', mirror: true, colors: { Hair: BLACK_HAIR, Eyebrows: BLACK_HAIR, Suit: '#4b202c' } },
    { id: 'm8', base: 'men', file: 'Beach', skin: 'light', guest: true, colors: { Hair: '#c9a459', Eyebrows: '#8a6b34', LightBrown: '#e2d9bd', Red_Dark: '#1f6090' } },
    { id: 'm9', base: 'men', file: 'Casual_2', skin: 'medium', colors: { Hair: '#4a2f1a', LightBrown: '#6a3c8d' } }
];
const GUEST_CLIPS = ['Dance_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Yes'];
// Everybody can dance and nod (`Yes`); the guests who stand about also carry the idle poses. The people who walk the
// room as other players (js/avatarManager.js) additionally play the packs' own clips, kept as they are.
const DANCER_CLIPS = ['Dance_Loop', 'Yes'];
const NATIVE_CLIPS = ['Idle', 'Walk', 'Run', 'Wave'];

// --- small maths kit: quaternions [x, y, z, w], column-vector convention, rigid transforms only -----------------
const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
];
const qinv = q => [-q[0], -q[1], -q[2], q[3]];
const qnorm = q => { const l = Math.hypot(...q) || 1; return q.map(v => v / l); };
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const qrot = (q, v) => {
    const t = vscale(vcross([q[0], q[1], q[2]], v), 2);
    return vadd(vadd(v, vscale(t, q[3])), vcross([q[0], q[1], q[2]], t));
};
const qswing = (a, b) => {
    const d = vdot(a, b);
    if (d > 0.999999) return [0, 0, 0, 1];
    if (d < -0.999999) {
        const axis = vnorm(vcross(Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], a));
        return [axis[0], axis[1], axis[2], 0];
    }
    const c = vcross(a, b);
    return qnorm([c[0], c[1], c[2], 1 + d]);
};
const qslerp = (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = b.map(v => -v); }
    if (d > 0.9995) return qnorm(a.map((v, i) => v + (bb[i] - v) * t));
    const theta = Math.acos(d), s = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / s, wb = Math.sin(t * theta) / s;
    return a.map((v, i) => v * wa + bb[i] * wb);
};
/** Quaternion of the rotation part of a column-major 4x4 (unit scale assumed; columns are normalised). */
const mat4Rotation = m => {
    const c0 = vnorm([m[0], m[1], m[2]]), c1 = vnorm([m[4], m[5], m[6]]), c2 = vnorm([m[8], m[9], m[10]]);
    const [m00, m10, m20] = c0, [m01, m11, m21] = c1, [m02, m12, m22] = c2;
    const trace = m00 + m11 + m22;
    let q;
    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
    } else if (m00 > m11 && m00 > m22) {
        const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
        q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
        const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
        q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
    } else {
        const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
        q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
    }
    return qnorm(q);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function readGltf(path) {
    const json = JSON.parse(await readFile(path, 'utf8'));
    const resources = {};
    for (const resource of [...(json.buffers || []), ...(json.images || [])]) {
        if (resource.uri && !resource.uri.startsWith('data:')) resources[resource.uri] = await readFile(join(dirname(path), resource.uri));
    }
    return io.readJSON({ json, resources });
}

/** Joint hierarchy and bind pose (world), taken from the inverse bind matrices, which are the authority. */
function readSkeleton(document) {
    const skin = document.getRoot().listSkins()[0];
    const joints = skin.listJoints();
    const ibms = skin.getInverseBindMatrices().getArray();
    const set = new Set(joints);
    const byName = new Map();
    const bind = new Map();
    joints.forEach((joint, index) => {
        const m = Array.from(ibms.subarray(index * 16, index * 16 + 16));
        const rot = mat4Rotation(m); // rotation of the inverse bind matrix; the bind world rotation is its inverse
        const inv = qinv(rot);
        // bind world position = -(R^T) * t  (R is the IBM's upper 3x3)
        const t = [m[12], m[13], m[14]];
        const position = vscale(qrot(inv, t), -1);
        bind.set(joint, { q: inv, p: position });
        byName.set(joint.getName(), joint);
    });
    const parentOf = joint => { const p = joint.getParentNode(); return p && set.has(p) ? p : null; };
    const localBind = new Map();
    for (const joint of joints) {
        const parent = parentOf(joint);
        const b = bind.get(joint);
        if (!parent) { localBind.set(joint, { q: b.q, t: b.p }); continue; }
        const pb = bind.get(parent);
        localBind.set(joint, { q: qmul(qinv(pb.q), b.q), t: qrot(qinv(pb.q), vsub(b.p, pb.p)) });
    }
    // Everything above the root joint must be an identity transform (the maths assumes it).
    for (const joint of joints) {
        if (parentOf(joint)) continue;
        let node = joint.getParentNode();
        while (node) {
            const identity = node.getTranslation().every(v => Math.abs(v) < 1e-6)
                && Math.abs(node.getRotation()[3]) > 0.999999 && node.getScale().every(v => Math.abs(v - 1) < 1e-6);
            if (!identity) throw new Error(`${node.getName()} above the skeleton is not an identity transform`);
            node = node.getParentNode();
        }
    }
    return { skin, joints, byName, bind, localBind, parentOf };
}

/** A clip as callable samplers: evaluate(jointNode, 'rotation'|'translation', time). */
function clipSampler(animation) {
    const channels = new Map();
    for (const channel of animation.listChannels()) {
        const sampler = channel.getSampler();
        if (sampler.getInterpolation() === 'CUBICSPLINE') throw new Error('cubic spline clips are not supported');
        channels.set(`${channel.getTargetNode().getName()}:${channel.getTargetPath()}`, {
            times: sampler.getInput().getArray(), values: sampler.getOutput().getArray(),
            size: channel.getTargetPath() === 'rotation' ? 4 : channel.getTargetPath() === 'scale' ? 3 : 3,
            step: sampler.getInterpolation() === 'STEP'
        });
    }
    let duration = 0;
    for (const { times } of channels.values()) duration = Math.max(duration, times[times.length - 1]);
    const get = (name, path, time, fallback) => {
        const channel = channels.get(`${name}:${path}`);
        if (!channel) return fallback;
        const { times, values, size, step } = channel;
        if (time <= times[0]) return Array.from(values.subarray(0, size));
        if (time >= times[times.length - 1]) return Array.from(values.subarray((times.length - 1) * size, times.length * size));
        let lo = 0, hi = times.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= time) lo = mid; else hi = mid; }
        const a = Array.from(values.subarray(lo * size, lo * size + size));
        if (step) return a;
        const b = Array.from(values.subarray(hi * size, hi * size + size));
        const f = (time - times[lo]) / (times[hi] - times[lo]);
        return size === 4 ? qslerp(a, b, f) : a.map((v, i) => v + (b[i] - v) * f);
    };
    return { duration, get, name: animation.getName() };
}

/** World poses of every source joint at `time` (parents first, by walking the skin's joint order). */
function sourcePose(sk, clip, time) {
    const world = new Map();
    const visit = joint => {
        if (world.has(joint)) return world.get(joint);
        const parent = sk.parentOf(joint);
        const pw = parent ? visit(parent) : { q: [0, 0, 0, 1], p: [0, 0, 0] };
        const name = joint.getName();
        const lq = clip.get(name, 'rotation', time, joint.getRotation());
        const lt = clip.get(name, 'translation', time, joint.getTranslation());
        const w = { q: qmul(pw.q, lq), p: vadd(pw.p, qrot(pw.q, lt)) };
        world.set(joint, w);
        return w;
    };
    sk.joints.forEach(visit);
    return world;
}

// Source (UE mannequin) name -> target (modular) name, and how to drive it.
const SIDES = [['l', 'L'], ['r', 'R']];
const DELTA = [['pelvis', 'Body'], ['spine_01', 'Abdomen'], ['spine_02', 'Torso'], ['spine_03', 'Chest'], ['neck_01', 'Neck'], ['Head', 'Head']];
const SWING = [];
for (const [s, T] of SIDES) {
    SWING.push([`clavicle_${s}`, `upperarm_${s}`, `Shoulder.${T}`, `UpperArm.${T}`]);
    SWING.push([`upperarm_${s}`, `lowerarm_${s}`, `UpperArm.${T}`, `LowerArm.${T}`]);
    SWING.push([`lowerarm_${s}`, `hand_${s}`, `LowerArm.${T}`, `Wrist.${T}`]);
    SWING.push([`hand_${s}`, `middle_01_${s}`, `Wrist.${T}`, `Middle1.${T}`]);
    SWING.push([`thigh_${s}`, `calf_${s}`, `UpperLeg.${T}`, `LowerLeg.${T}`]);
    SWING.push([`calf_${s}`, `foot_${s}`, `LowerLeg.${T}`, `Foot.${T}`]);
}
const FEET = [['foot_l', 'Foot.L', 'LowerLeg.L'], ['foot_r', 'Foot.R', 'LowerLeg.R']];
/** `upperarm_l` <-> `upperarm_r`; names without a side (pelvis, spine, Head) are their own counterpart. */
const swapSides = name => (name.endsWith('_l') ? `${name.slice(0, -2)}_r` : name.endsWith('_r') ? `${name.slice(0, -2)}_l` : name);

/** Retarget one clip: returns { times, tracks: Map<targetName, { rotation: [], translation: [] }> }.
 *  `mirror` plays the source with its left and right swapped (a reflection across the body's midline), so a second
 *  copy of the same choreography is a different dance rather than a chorus line. */
function retarget(src, tgt, clip, mirror = false) {
    const S = name => src.byName.get(name);
    const T = name => {
        const joint = tgt.byName.get(name);
        if (!joint) throw new Error(`the modular rig has no joint "${name}"`);
        return joint;
    };
    const tgtBind = name => tgt.bind.get(T(name));
    const srcBind = name => src.bind.get(S(name));
    const legScale = (() => {
        const sLeg = vsub(srcBind('foot_l').p, srcBind('thigh_l').p);
        const tLeg = vsub(tgtBind('Foot.L').p, tgtBind('UpperLeg.L').p);
        return Math.hypot(...tLeg) / Math.hypot(...sLeg);
    })();

    const frames = Math.max(1, Math.round(clip.duration * FPS));
    const times = [];
    const tracks = new Map();
    const track = name => { if (!tracks.has(name)) tracks.set(name, { rotation: [], translation: [] }); return tracks.get(name); };
    const previous = new Map();
    const push = (name, path, value) => {
        const list = track(name)[path];
        if (path === 'rotation') {
            const last = previous.get(name);
            if (last && qdot(last, value) < 0) value = value.map(v => -v);
            previous.set(name, value);
        }
        list.push(value);
    };
    const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

    // Parent-first order of the target joints.
    const order = [];
    const seen = new Set();
    const visit = joint => {
        if (seen.has(joint)) return;
        const parent = tgt.parentOf(joint);
        if (parent) visit(parent);
        seen.add(joint); order.push(joint);
    };
    tgt.joints.forEach(visit);

    for (let k = 0; k <= frames; k++) {
        const time = Math.min(clip.duration, k / FPS);
        times.push(k / FPS);
        const pose = sourcePose(src, clip, time);
        const now = new Map();
        // Everything read from the source goes through these, so mirroring is one switch: a bone reads its
        // counterpart's pose, reflected across x (a world-space rotation reflects as [x, -y, -z, w]).
        const mname = name => (mirror ? swapSides(name) : name);
        const reflect = v => [-v[0], v[1], v[2]];
        const reflectQ = q => [q[0], -q[1], -q[2], q[3]];
        const srcNow = name => pose.get(S(mname(name)));
        const srcDelta = name => {
            const d = qmul(srcNow(name).q, qinv(srcBind(mname(name)).q));
            return mirror ? reflectQ(d) : d;
        };
        const srcDirection = (from, to) => {
            const v = vnorm(vsub(srcNow(to).p, srcNow(from).p));
            return mirror ? reflect(v) : v;
        };
        const srcTravel = name => {
            const v = vsub(srcNow(name).p, srcBind(mname(name)).p);
            return mirror ? reflect(v) : v;
        };

        for (const joint of order) {
            const name = joint.getName();
            const parent = tgt.parentOf(joint);
            const parentNow = parent ? now.get(parent) : { q: [0, 0, 0, 1], p: [0, 0, 0] };
            const bind = tgt.bind.get(joint);
            const local = tgt.localBind.get(joint);
            let lq = local.q, lt = local.t;
            const delta = DELTA.find(pair => pair[1] === name);
            const swing = SWING.find(item => item[2] === name);
            if (delta) {
                lq = qmul(qinv(parentNow.q), qmul(srcDelta(delta[0]), bind.q));
                if (name === 'Body') {
                    const world = vadd(bind.p, vscale(srcTravel(delta[0]), legScale));
                    lt = qrot(qinv(parentNow.q), vsub(world, parentNow.p));
                    push(name, 'translation', lt);
                }
                push(name, 'rotation', lq);
            } else if (swing) {
                const direction = srcDirection(swing[0], swing[1]);
                const rest = vnorm(vsub(tgtBind(swing[3]).p, bind.p));
                lq = qmul(qinv(parentNow.q), qmul(qswing(rest, direction), bind.q));
                push(name, 'rotation', lq);
            }
            now.set(joint, { q: qmul(parentNow.q, lq), p: vadd(parentNow.p, qrot(parentNow.q, lt)) });
        }

        // The feet are free-standing bones (IK targets): put each at the end of its animated leg.
        for (const [sName, tName, legName] of FEET) {
            const foot = T(tName), leg = T(legName);
            const legNow = now.get(leg), legBind = tgt.bind.get(leg), footBind = tgt.bind.get(foot);
            const offset = qrot(qinv(legBind.q), vsub(footBind.p, legBind.p));
            const world = { p: vadd(legNow.p, qrot(legNow.q, offset)) };
            world.q = qmul(srcDelta(sName), footBind.q);
            const parent = tgt.parentOf(foot);
            const parentNow = parent ? now.get(parent) : { q: [0, 0, 0, 1], p: [0, 0, 0] };
            push(tName, 'translation', qrot(qinv(parentNow.q), vsub(world.p, parentNow.p)));
            push(tName, 'rotation', qmul(qinv(parentNow.q), world.q));
        }
    }
    return { times, tracks, name: clip.name };
}

// --- colours ----------------------------------------------------------------------------------------------------
const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hexToLinear = hex => [1, 3, 5].map(i => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255));

function paintAndFlatten(document, person) {
    const skin = hexToLinear(SKIN[person.skin] || SKIN.tan);
    const darker = skin.map(v => v * 0.82);
    const overrides = new Map(Object.entries(person.colors).map(([key, hex]) => [key, hexToLinear(hex)]));
    const root = document.getRoot();
    const material = document.createMaterial('Crowd').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(0.55);

    for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const part = node.getName().split('_').pop();
        if (PROPS.test(part)) { node.dispose(); continue; }
        for (const primitive of mesh.listPrimitives()) {
            const original = primitive.getMaterial();
            const name = original.getName();
            let color;
            if (overrides.has(`${part}:${name}`)) color = overrides.get(`${part}:${name}`);
            else if (overrides.has(name)) color = overrides.get(name);
            else if (name === 'Skin') color = skin;
            else if (name === 'Skin_Darker') color = darker;
            else color = original.getBaseColorFactor().slice(0, 3);
            const count = primitive.getAttribute('POSITION').getCount();
            const array = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) array.set(color, i * 3);
            primitive.setAttribute('COLOR_0', document.createAccessor('color').setType('VEC3').setArray(array)
                .setBuffer(root.listBuffers()[0]));
            primitive.setMaterial(material);
        }
    }
}

function addAnimations(document, tgt, results) {
    const root = document.getRoot();
    const buffer = root.listBuffers()[0];
    for (const result of results) {
        const animation = document.createAnimation(result.name);
        const input = document.createAccessor(`${result.name}_t`).setType('SCALAR').setArray(new Float32Array(result.times)).setBuffer(buffer);
        for (const [name, paths] of result.tracks) {
            const node = tgt.byName.get(name);
            for (const path of ['rotation', 'translation']) {
                const values = paths[path];
                if (!values.length) continue;
                const size = path === 'rotation' ? 4 : 3;
                const array = new Float32Array(values.length * size);
                values.forEach((v, i) => array.set(v, i * size));
                const output = document.createAccessor(`${result.name}_${name}_${path}`)
                    .setType(path === 'rotation' ? 'VEC4' : 'VEC3').setArray(array).setBuffer(buffer);
                const sampler = document.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
                animation.addSampler(sampler);
                animation.addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
            }
        }
    }
}

const sources = {};
async function source(base) {
    if (sources[base]) return sources[base];
    const file = base === 'women' ? 'club-guest-female.glb' : 'club-guest-male.glb';
    const document = await io.read(join(ROOT, 'js/models/avatars', file));
    const sk = readSkeleton(document);
    const clips = document.getRoot().listAnimations().filter(a => CLIPS.includes(a.getName())).map(clipSampler);
    for (const clip of CLIPS) if (!clips.some(item => item.name === clip)) throw new Error(`${file} has no ${clip}`);
    return (sources[base] = { sk, clips });
}

async function build(person) {
    const document = await readGltf(join(dirs[person.base], `${person.file}.gltf`));
    const tgt = readSkeleton(document);
    const { sk: src, clips: all } = await source(person.base);
    const wanted = person.guest ? GUEST_CLIPS : DANCER_CLIPS;
    const results = all.filter(clip => wanted.includes(clip.name)).map(clip => retarget(src, tgt, clip, !!person.mirror));

    // Bind pose as the node pose. The packs' own Idle, Walk, Run and Wave animate exactly these nodes (same rig), so
    // they are kept as they are for the people who walk around as other guests; every other stock clip goes. Ours follow.
    for (const joint of tgt.joints) {
        const local = tgt.localBind.get(joint);
        joint.setTranslation(local.t).setRotation(local.q);
    }
    for (const animation of document.getRoot().listAnimations()) {
        if (!NATIVE_CLIPS.includes(animation.getName())) animation.dispose();
    }
    paintAndFlatten(document, person);
    addAnimations(document, tgt, results);
    await document.transform(prune());

    const buffers = document.getRoot().listBuffers();
    for (const accessor of document.getRoot().listAccessors()) accessor.setBuffer(buffers[0]);
    const name = `club-crowd-${person.id}.glb`;
    await io.write(join(outDir, name), document);
    console.log(`${name}: ${person.base} ${person.file}, skin ${person.skin}, ${results.length} clips`);
    return name;
}

const wanted = only ? only.split(',') : null;
const built = [];
for (const person of CAST) if (!wanted || wanted.includes(person.id)) built.push(await build(person));
if (process.argv.includes('--optimize')) {
    execFileSync(process.execPath, [join(ROOT, 'scripts/optimize-avatars.mjs'), ...built], { cwd: ROOT, stdio: 'inherit' });
}
