import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const repo = resolve(root, '..', '..');
const require = createRequire(join(repo, 'package.json'));
const B = require(join(repo, 'js', 'vendor', 'babylon.js'));
const V = value => B.Vector3.FromArray(value);
const Q = value => B.Quaternion.FromArray(value);
const inverse = q => B.Quaternion.Inverse(q);
const rotate = (q, v) => v.applyRotationQuaternion(q);
const delta = (a, b) => a.multiply(inverse(b));
const length = (a, b) => B.Vector3.Distance(a, b);
const identity = () => ({ p: B.Vector3.Zero(), q: B.Quaternion.Identity(), s: B.Vector3.One() });
const trunk = [['Body', 'pelvis'], ['Abdomen', 'spine_01'], ['Torso', 'spine_02'],
    ['Chest', 'spine_03'], ['Neck', 'neck_01'], ['Head', 'head']];
const jointMap = [...trunk];
for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
    jointMap.push([`Shoulder.${suffix}`, `clavicle_${side}`],
        [`UpperArm.${suffix}`, `upperarm_${side}`], [`LowerArm.${suffix}`, `lowerarm_${side}`],
        [`Wrist.${suffix}`, `hand_${side}`], [`UpperLeg.${suffix}`, `thigh_${side}`],
        [`LowerLeg.${suffix}`, `calf_${side}`], [`Foot.${suffix}`, `foot_${side}`]);
}

function decompose(matrix) {
    const state = identity();
    assert.ok(matrix.decompose(state.s, state.q, state.p));
    return state;
}

export function skeleton(doc) {
    const skin = doc.getRoot().listSkins()[0];
    const nodes = skin.listJoints();
    const indices = new Map(nodes.map((node, index) => [node, index]));
    const named = new Map(nodes.map(node => [node.getName(), node]));
    const bind = new Map();
    const local = new Map();
    const ibms = skin.getInverseBindMatrices().getArray();
    for (let index = 0; index < nodes.length; index++) {
        bind.set(nodes[index], decompose(B.Matrix.FromArray(Array.from(ibms.slice(index * 16, index * 16 + 16))).invert()));
    }
    const external = node => decompose(B.Matrix.FromArray(node.getWorldMatrix()));
    const order = [];
    const visited = new Set();
    const visit = node => {
        if (visited.has(node)) return;
        const parent = node.getParentNode();
        if (indices.has(parent)) visit(parent);
        visited.add(node);
        order.push(node);
        const state = bind.get(node);
        const parentBind = indices.has(parent) ? bind.get(parent) : parent ? external(parent) : identity();
        const t = rotate(inverse(parentBind.q), state.p.subtract(parentBind.p)).divide(parentBind.s);
        local.set(node, { p: t, q: inverse(parentBind.q).multiply(state.q), s: state.s.divide(parentBind.s) });
    };
    nodes.forEach(visit);
    return { skin, named, bind, local, order, external, indices };
}

export function sampler(animation) {
    const channels = new Map();
    let duration = 0;
    for (const channel of animation.listChannels()) {
        const s = channel.getSampler();
        assert.notEqual(s.getInterpolation(), 'CUBICSPLINE');
        const times = s.getInput().getArray(), values = s.getOutput().getArray();
        channels.set(`${channel.getTargetNode().getName()}:${channel.getTargetPath()}`,
            { times, values, size: s.getOutput().getElementSize(), step: s.getInterpolation() === 'STEP' });
        duration = Math.max(duration, times[times.length - 1]);
    }
    return { name: animation.getName(), duration, get(name, path, time, fallback) {
        const c = channels.get(`${name}:${path}`);
        if (!c) return fallback;
        let i = 0;
        while (i + 1 < c.times.length && c.times[i + 1] <= time) i++;
        const a = Array.from(c.values.slice(i * c.size, (i + 1) * c.size));
        if (i === c.times.length - 1 || c.step) return a;
        const b = Array.from(c.values.slice((i + 1) * c.size, (i + 2) * c.size));
        const f = Math.max(0, (time - c.times[i]) / (c.times[i + 1] - c.times[i]));
        return path === 'rotation' ? B.Quaternion.Slerp(Q(a), Q(b), f).asArray() : a.map((v, k) => v + (b[k] - v) * f);
    } };
}

export function pose(sk, clip = null, time = 0, overrides = new Map()) {
    const world = new Map();
    for (const node of sk.order) {
        const parent = node.getParentNode();
        const parentState = world.get(parent) || (parent ? sk.external(parent) : identity());
        const rest = sk.local.get(node);
        const supplied = overrides.get(node) || {};
        const p = supplied.p || (clip ? V(clip.get(node.getName(), 'translation', time, node.getTranslation())) : rest.p);
        const q = supplied.q || (clip ? Q(clip.get(node.getName(), 'rotation', time, node.getRotation())) : rest.q);
        const scale = clip ? V(clip.get(node.getName(), 'scale', time, node.getScale())) : rest.s;
        world.set(node, { p: parentState.p.add(rotate(parentState.q, p.multiply(parentState.s))),
            q: parentState.q.multiply(q), s: parentState.s.multiply(scale) });
    }
    return world;
}

function twoBone(start, end, l1, l2, pole) {
    const d = end.subtract(start);
    const distance = d.length();
    const reach = Math.min(l1 + l2 - 1e-5, Math.max(Math.abs(l1 - l2) + 1e-5, distance));
    const direction = d.normalize();
    const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
    let perpendicular = pole.subtract(direction.scale(B.Vector3.Dot(pole, direction)));
    if (perpendicular.length() < 1e-6) perpendicular = B.Vector3.Cross(direction, new B.Vector3(1, 0, 0));
    perpendicular.normalize();
    return { joint: start.add(direction.scale(along)).add(perpendicular.scale(Math.sqrt(Math.max(0, l1 * l1 - along * along)))),
        end: start.add(direction.scale(reach)), missed: Math.max(0, distance - reach) };
}

function swing(from, to) {
    const a = from.normalizeToNew(), b = to.normalizeToNew();
    const dot = B.Vector3.Dot(a, b);
    if (dot < -0.99999) {
        let axis = B.Vector3.Cross(a, new B.Vector3(1, 0, 0));
        if (axis.length() < 1e-6) axis = B.Vector3.Cross(a, new B.Vector3(0, 1, 0));
        return B.Quaternion.RotationAxis(axis.normalize(), Math.PI);
    }
    const cross = B.Vector3.Cross(a, b);
    return new B.Quaternion(cross.x, cross.y, cross.z, 1 + dot).normalize();
}

export function retarget(source, target, clip, options = {}) {
    const S = name => { const n = source.named.get(name); assert.ok(n, `Missing source ${name}`); return n; };
    const T = name => { const n = target.named.get(name); assert.ok(n, `Missing target ${name}`); return n; };
    const sb = name => source.bind.get(S(name));
    const tb = name => target.bind.get(T(name));
    const legScale = length(tb('thigh_l').p, tb('calf_l').p) / length(sb('UpperLeg.L').p, sb('LowerLeg.L').p);
    const armScale = (length(tb('upperarm_l').p, tb('lowerarm_l').p) + length(tb('lowerarm_l').p, tb('hand_l').p))
        / (length(sb('UpperArm.L').p, sb('LowerArm.L').p) + length(sb('LowerArm.L').p, sb('Wrist.L').p));
    const fingers = [];
    if (options.fingers) {
        for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
            for (const digit of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
                for (let part = 1; part <= 3; part++) {
                    fingers.push([`${digit}${digit === 'Thumb' ? part : part + 1}.${suffix}`,
                        `${digit.toLowerCase()}_0${part}_${side}`]);
                }
            }
        }
    }
    const driven = [...jointMap, ...fingers];
    const tracks = new Map(driven.map(([, name]) => [name, { rotation: [], translation: [] }]));
    const frames = Math.round(clip.duration * 30);
    const times = [];
    const metrics = { maxAnkleError: 0, maxHandError: 0, maxLimbLengthError: 0, minHipCorrection: 0 };
    for (let frame = 0; frame <= frames; frame++) {
        const time = frame * clip.duration / frames;
        times.push(time);
        const src = pose(source, clip, time);
        const sn = name => src.get(S(name));
        const changes = new Map();
        let world = pose(target);
        const at = name => world.get(T(name));
        const parentOf = name => {
            const parent = T(name).getParentNode();
            return world.get(parent) || (parent ? target.external(parent) : identity());
        };
        const setRotation = (name, q) => {
            const local = { ...changes.get(T(name)), q: inverse(parentOf(name).q).multiply(q).normalize() };
            changes.set(T(name), local);
            world = pose(target, null, 0, changes);
        };
        const setPosition = (name, p) => {
            const parent = parentOf(name);
            changes.set(T(name), { ...changes.get(T(name)),
                p: rotate(inverse(parent.q), p.subtract(parent.p)).divide(parent.s) });
            world = pose(target, null, 0, changes);
        };
        for (const [from, to] of jointMap.filter(([, to]) => /pelvis|spine|neck|head|clavicle/.test(to))) {
            setRotation(to, delta(sn(from).q, sb(from).q).multiply(tb(to).q));
        }
        setPosition('pelvis', tb('pelvis').p.add(sn('Body').p.subtract(sb('Body').p).scale(legScale)));
        const feet = {};
        let correction = 0;
        for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
            const goal = tb(`foot_${side}`).p.add(sn(`Foot.${suffix}`).p.subtract(sb(`Foot.${suffix}`).p).scale(legScale));
            feet[side] = goal;
            const thigh = at(`thigh_${side}`).p;
            const l1 = length(tb(`thigh_${side}`).p, tb(`calf_${side}`).p);
            const l2 = length(tb(`calf_${side}`).p, tb(`foot_${side}`).p);
            const dx = thigh.x - goal.x, dz = thigh.z - goal.z;
            const maxY = Math.sqrt(Math.max(0, (l1 + l2 - 1e-4) ** 2 - dx * dx - dz * dz));
            correction = Math.max(correction, thigh.y - goal.y - maxY);
        }
        if (correction > 0) setPosition('pelvis', at('pelvis').p.subtract(new B.Vector3(0, correction, 0)));
        metrics.minHipCorrection = Math.min(metrics.minHipCorrection, -correction);
        const hipAxis = at('thigh_l').p.subtract(at('thigh_r').p);
        hipAxis.y = 0;
        hipAxis.normalize();
        for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
            const upper = `thigh_${side}`, lower = `calf_${side}`, foot = `foot_${side}`;
            const l1 = length(tb(upper).p, tb(lower).p), l2 = length(tb(lower).p, tb(foot).p);
            // The stylised source bends inward; keep anatomical knees in each hip-to-ankle sagittal plane.
            const pole = B.Vector3.Cross(feet[side].subtract(at(upper).p), hipAxis);
            const solved = twoBone(at(upper).p, feet[side], l1, l2, pole);
            setRotation(upper, swing(tb(lower).p.subtract(tb(upper).p), solved.joint.subtract(at(upper).p)).multiply(tb(upper).q));
            setRotation(lower, swing(tb(foot).p.subtract(tb(lower).p), solved.end.subtract(at(lower).p)).multiply(tb(lower).q));
            setRotation(foot, delta(sn(`Foot.${suffix}`).q, sb(`Foot.${suffix}`).q).multiply(tb(foot).q));
            metrics.maxAnkleError = Math.max(metrics.maxAnkleError, length(at(foot).p, feet[side]));
            metrics.maxLimbLengthError = Math.max(metrics.maxLimbLengthError,
                Math.abs(length(at(upper).p, at(lower).p) - l1), Math.abs(length(at(lower).p, at(foot).p) - l2));
        }
        const sourceMid = sn('UpperArm.L').p.add(sn('UpperArm.R').p).scale(0.5);
        const targetMid = at('upperarm_l').p.add(at('upperarm_r').p).scale(0.5);
        const handRotations = new Map();
        const contactPoint = point => {
            const from = options.sourcePlacement, to = options.targetPlacement;
            const result = point.scale(from.scale);
            result.y += from.floor - to.floor;
            return result.scale(1 / to.scale);
        };
        for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
            const upper = `upperarm_${side}`, lower = `lowerarm_${side}`, hand = `hand_${side}`;
            const fingers = sn(`Middle1.${suffix}`).p.subtract(sn(`Wrist.${suffix}`).p).normalize();
            const index = sn(`Index2.${suffix}`).p.subtract(sn(`Pinky2.${suffix}`).p);
            const restFingers = tb(`middle_01_${side}`).p.subtract(tb(hand).p).normalize();
            let align = swing(restFingers, fingers);
            const restIndex = rotate(align, tb(`index_02_${side}`).p.subtract(tb(`pinky_02_${side}`).p));
            const project = v => v.subtract(fingers.scale(B.Vector3.Dot(v, fingers))).normalize();
            const a = project(restIndex), b = project(index);
            const twist = Math.atan2(B.Vector3.Dot(B.Vector3.Cross(a, b), fingers), B.Vector3.Dot(a, b));
            align = B.Quaternion.RotationAxis(fingers, twist).multiply(align);
            const palmSource = sn(`Wrist.${suffix}`).p.add(sn(`Middle1.${suffix}`).p).scale(0.5);
            const palmTarget = options.contactHands ? contactPoint(palmSource)
                : options.shoulderHands
                    ? at(upper).p.add(palmSource.subtract(sn(`UpperArm.${suffix}`).p).scale(armScale))
                    : targetMid.add(palmSource.subtract(sourceMid).scale(armScale));
            const palmOffset = rotate(align, tb(`middle_01_${side}`).p.subtract(tb(hand).p)
                .scale(options.fingers ? 0.115 : 0.5));
            const wristTarget = palmTarget.subtract(palmOffset);
            const l1 = length(tb(upper).p, tb(lower).p), l2 = length(tb(lower).p, tb(hand).p);
            const solved = twoBone(at(upper).p, wristTarget, l1, l2,
                sn(`LowerArm.${suffix}`).p.subtract(sn(`UpperArm.${suffix}`).p));
            setRotation(upper, swing(tb(lower).p.subtract(tb(upper).p), solved.joint.subtract(at(upper).p)).multiply(tb(upper).q));
            setRotation(lower, swing(tb(hand).p.subtract(tb(lower).p), solved.end.subtract(at(lower).p)).multiply(tb(lower).q));
            setRotation(hand, align.multiply(tb(hand).q));
            handRotations.set(side, at(hand).q.clone());
            metrics.maxHandError = Math.max(metrics.maxHandError, length(at(hand).p, wristTarget));
            metrics.maxLimbLengthError = Math.max(metrics.maxLimbLengthError,
                Math.abs(length(at(upper).p, at(lower).p) - l1), Math.abs(length(at(lower).p, at(hand).p) - l2));
        }
        const applyFingers = () => { for (const [from, to] of fingers) {
            const part = Number(from.match(/\d/)[0]);
            const nextName = from.replace(String(part), String(part + 1));
            const previousName = from.replace(String(part), String(part - 1));
            const next = source.named.get(nextName);
            const nextTargetName = to.replace(/_0(\d)_/, (_, n) => `_0${Number(n) + 1}_`);
            const nextTarget = target.named.get(nextTargetName);
            const restDirection = nextTarget
                ? target.bind.get(nextTarget).p.subtract(tb(to).p)
                : tb(to).p.subtract(tb(to.replace(/_0(\d)_/, (_, n) => `_0${Number(n) - 1}_`)).p);
            const direction = next ? src.get(next).p.subtract(sn(from).p)
                : rotate(delta(sn(from).q, sb(from).q), sb(from).p.subtract(sb(previousName).p));
            setRotation(to, swing(restDirection, direction).multiply(tb(to).q));
        } };
        applyFingers();
        if (options.contactHands) {
            const cupRim = axis => {
                const angle = Math.max(0, Math.acos(Math.max(-1, Math.min(1, axis.y))) - 0.28);
                const horizontal = Math.hypot(axis.x, axis.z);
                const k = horizontal > 1e-8 ? Math.sin(angle) * 0.06 / horizontal : 0;
                return new B.Vector3(axis.x * k, Math.cos(angle) * 0.06, axis.z * k);
            };
            const sourceGrip = suffix => {
                const hand = sn(`Wrist.${suffix}`);
                const f = rotate(hand.q, new B.Vector3(0, 1, 0)).normalize();
                const t = rotate(hand.q, new B.Vector3(-0.9994, 0, -0.0341)).normalize();
                const n = B.Vector3.Cross(t, f).normalize();
                return contactPoint(hand.p.add(sn(`Middle1.${suffix}`).p).scale(0.5))
                    .add(n.scale(0.045 / options.targetPlacement.scale)).add(t.scale(0.01 / options.targetPlacement.scale))
                    .add(cupRim(t).scale(1 / options.targetPlacement.scale));
            };
            const targetGrip = side => {
                const hand = at(`hand_${side}`).p, knuckle = at(`middle_01_${side}`).p;
                const f = knuckle.subtract(hand).normalize();
                const across = at(`index_01_${side}`).p.subtract(at(`pinky_01_${side}`).p);
                const t = across.subtract(f.scale(B.Vector3.Dot(across, f))).normalize();
                return hand.add(knuckle.subtract(hand).scale(0.115))
                    .add(B.Vector3.Cross(t, f).normalize().scale(0.045)).add(t.scale(0.01)).add(cupRim(t));
            };
            const filter = (point, names) => {
                const [i3, i4, m3, m4] = names.map(point);
                const direction = i4.subtract(i3).add(m4.subtract(m3)).normalize();
                const palm = B.Vector3.Cross(i3.subtract(m3), direction).normalize();
                return i3.add(i4).add(m3).add(m4).scale(0.25).add(palm.scale(0.045));
            };
            for (const [side, suffix] of [['l', 'L'], ['r', 'R']]) {
                let sourceAnchor, targetAnchor;
                if (/Railing/.test(clip.name)) {
                    sourceAnchor = contactPoint(sn(`Middle2.${suffix}`).p);
                    targetAnchor = at(`middle_01_${side}`).p;
                } else if (/Seated_Bar/.test(clip.name)) {
                    sourceAnchor = contactPoint(sn(`Middle1.${suffix}`).p);
                    const hand = at(`hand_${side}`).p;
                    targetAnchor = hand.add(at(`middle_01_${side}`).p.subtract(hand).scale(0.23));
                } else if (side === 'r' && clip.name === 'Drink_Loop') {
                    sourceAnchor = sourceGrip(suffix); targetAnchor = targetGrip(side);
                } else if (side === 'r' && clip.name === 'Smoke_Loop') {
                    sourceAnchor = contactPoint(filter(name => sn(name).p,
                        ['Index3.R', 'Index4.R', 'Middle3.R', 'Middle4.R']));
                    targetAnchor = filter(name => at(name).p,
                        ['index_02_r', 'index_03_r', 'middle_02_r', 'middle_03_r']);
                } else continue;
                if (/Drink_Loop|Smoke_Loop/.test(clip.name)) {
                    const sourceHead = contactPoint(sn('Head').p);
                    const near = Math.max(0, Math.min(1, (0.5 - length(sourceAnchor, sourceHead)) / 0.22));
                    sourceAnchor = sourceAnchor.add(at('head').p.subtract(sourceHead).scale(near * near * (3 - 2 * near)));
                }
                const upper = `upperarm_${side}`, lower = `lowerarm_${side}`, hand = `hand_${side}`;
                const wristTarget = at(hand).p.add(sourceAnchor.subtract(targetAnchor));
                const l1 = length(tb(upper).p, tb(lower).p), l2 = length(tb(lower).p, tb(hand).p);
                const solved = twoBone(at(upper).p, wristTarget, l1, l2,
                    sn(`LowerArm.${suffix}`).p.subtract(sn(`UpperArm.${suffix}`).p));
                setRotation(upper, swing(tb(lower).p.subtract(tb(upper).p), solved.joint.subtract(at(upper).p)).multiply(tb(upper).q));
                setRotation(lower, swing(tb(hand).p.subtract(tb(lower).p), solved.end.subtract(at(lower).p)).multiply(tb(lower).q));
                setRotation(hand, handRotations.get(side));
                applyFingers();
                metrics.maxHandError = Math.max(metrics.maxHandError, length(at(hand).p, wristTarget));
            }
        }
        for (const [, name] of driven) {
            const track = tracks.get(name);
            const local = changes.get(T(name)) || target.local.get(T(name));
            let q = (local.q || target.local.get(T(name)).q).asArray();
            const last = track.rotation[track.rotation.length - 1];
            if (last && last.reduce((sum, v, i) => sum + v * q[i], 0) < 0) q = q.map(v => -v);
            track.rotation.push(q);
            if (name === 'pelvis') track.translation.push(local.p.asArray());
        }
    }
    return { name: clip.name, times, tracks, metrics };
}

export function addAnimation(doc, sk, result) {
    const buffer = doc.getRoot().listBuffers()[0];
    const animation = doc.createAnimation(result.name);
    const input = doc.createAccessor(`${result.name}_time`).setType('SCALAR')
        .setArray(new Float32Array(result.times)).setBuffer(buffer);
    for (const [name, track] of result.tracks) {
        for (const path of ['rotation', 'translation']) {
            const values = track[path];
            if (!values.length) continue;
            const output = doc.createAccessor(`${result.name}_${name}_${path}`).setType(path === 'rotation' ? 'VEC4' : 'VEC3')
                .setArray(new Float32Array(values.flat())).setBuffer(buffer);
            const s = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
            animation.addSampler(s);
            animation.addChannel(doc.createAnimationChannel().setTargetNode(sk.named.get(name)).setTargetPath(path).setSampler(s));
        }
    }
}
