import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { setInterval } from 'node:timers';
import { Blob } from 'node:buffer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const box = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, performance, URL,
    TextDecoder, TextEncoder, Blob, ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
    atob: s => Buffer.from(s, 'base64').toString('binary'), btoa: s => Buffer.from(s, 'binary').toString('base64')
};
box.window = box; box.self = box; box.globalThis = box;
box.addEventListener = () => {}; box.removeEventListener = () => {};
box.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, removeEventListener() {} };
box.navigator = { userAgent: 'node' };
vm.createContext(box);
for (const file of ['js/vendor/babylon.js', 'js/vendor/babylonjs.loaders.min.js', 'js/avatarRig.js',
    'js/djPerformer.js', 'js/avatarManager.js', 'js/characterCatalog.js', 'js/crowdDance.js']) {
    vm.runInContext(readFileSync(join(root, file), 'utf8'), box, { filename: file });
}
const B = box.BABYLON;
B.Logger.LogLevels = B.Logger.WarningLogLevel | B.Logger.ErrorLogLevel;
async function load(id) {
    return loadFile(box.CharacterCatalog.people[id].url, box.CharacterCatalog.people[id]);
}
async function loadFile(url, character = null) {
    const engine = new B.NullEngine(), scene = new B.Scene(engine);
    const bytes = readFileSync(join(root, url));
    const container = await B.SceneLoader.LoadAssetContainerAsync('', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
    container.animationGroups.forEach(group => group.stop());
    container.character = character;
    return { engine, scene, container };
}

test('Detailed and lightweight DJs keep the physical palm on the headphone shell throughout cue nods', async () => {
    for (const [url, height] of [
        ['js/models/avatars/club-dj-male.glb', 1.78], ['js/models/avatars/club-dj-female.glb', 1.68],
        ...['jin', 'zara'].map(id => [box.CharacterCatalog.people[id].url, box.CharacterCatalog.people[id].height])
    ]) {
        const { scene, engine, container } = await loadFile(url);
        try {
            const rig = new box.AvatarRig({ scene }, container, { eyeHeight: height * 0.93 });
            const mesh = rig.meshes.find(m => /Headphones/.test(m.name));
            const headBone = mesh.skeleton.bones.find(bone => bone.name === 'Head');
            const inverseBind = headBone.getAbsoluteInverseBindMatrix();
            const vertices = mesh.getVerticesData(B.VertexBuffer.PositionKind);
            const localVertices = [];
            for (let i = 0; i < vertices.length; i += 3) {
                localVertices.push(B.Vector3.TransformCoordinates(B.Vector3.FromArray(vertices, i), inverseBind));
            }
            const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
            const dj = new box.DJPerformer({ x: 0, z: desk.near - 0.18, groundY: 0.5,
                eyeHeight: height * 0.93, desk, rng: () => 0.5 });
            const music = { hasAudio: true, beatPhase: 0, bar: 0, energy: 0.6, bpm: 124 };
            const at = name => rig.bone[name].getAbsolutePosition();
            const rawPalm = side => B.Vector3.Cross(at(`index_01_${side}`).subtract(at(`hand_${side}`)),
                at(`pinky_01_${side}`).subtract(at(`hand_${side}`))).normalize();
            dj._begin('tweak', 99);
            for (let frame = 0; frame < 120; frame++) rig.update(1 / 60, dj.update(1 / 60, music, null));
            rig._refreshAll();
            const signs = Object.fromEntries(['l', 'r'].map(side => [side, rawPalm(side).y < 0 ? 1 : -1]));
            dj._begin('cue', 99);
            for (let frame = 0; frame < 240; frame++) {
                music.beatPhase = (frame / 60 * 124 / 60) % 1;
                rig.update(1 / 60, dj.update(1 / 60, music, null));
                rig._refreshAll();
                if (frame < 150 || frame % 10 !== 0) continue;
                const side = at('hand_l').x < at('hand_r').x ? 'l' : 'r';
                const wrist = at(`hand_${side}`);
                const index = at(`index_01_${side}`), pinky = at(`pinky_01_${side}`);
                const palm = wrist.scale(0.5).add(index.add(pinky).scale(0.25));
                const world = rig.bone.Head.getWorldMatrix();
                const shell = localVertices.map(vertex => B.Vector3.TransformCoordinates(vertex, world))
                    .filter(vertex => vertex.x < at('Head').x);
                const nearest = Math.min(...shell.map(vertex => B.Vector3.Distance(vertex, palm)));
                assert.ok(nearest < 0.025, `${url}: palm misses the real cup shell by ${(nearest * 100).toFixed(1)} cm`);
                const normal = rawPalm(side).scale(signs[side]);
                const inward = B.Vector3.TransformNormal(B.Vector3.TransformNormal(new B.Vector3(1, 0, 0), inverseBind), world).normalize();
                if (B.Vector3.Dot(inward, at('Head').subtract(palm)) < 0) inward.scaleInPlace(-1);
                assert.ok(B.Vector3.Dot(normal, inward) > 0.95,
                    `${url}: palm is not flat against the cup`);
            }
            rig.dispose();
        } finally { container.dispose(); scene.dispose(); engine.dispose(); }
    }
});

test('All 17 detailed online bodies play their full clips and track physical hands on the real skeleton', async () => {
    for (const [avatarId, id] of Object.entries(box.CharacterCatalog.players)) {
        const { scene, engine, container } = await load(id);
        let manager;
        try {
            box.VRClubAudioCrowd = { sourceIndex: () => 0 };
            manager = new box.AvatarManager({ scene, _crowdSourceContainers: [],
                _loadCrowdSource: async () => container, _loadPlayerSource: async () => container });
            manager._createLabel = () => {
                const mesh = new B.Mesh('label', scene);
                mesh.material = new B.StandardMaterial('labelMat', scene);
                mesh.material.diffuseTexture = { dispose() {} };
                return mesh;
            };
            manager._drawNameplate = () => {};
            manager.setPersonalSpace(false);
            manager.ensurePeer('test', 'Guest');
            await manager.setAvatar('test', avatarId);
            const peer = manager.remotes.get('test');
            assert.ok(peer.person?.arms, `${id}: no tracked arms`);
            new B.FreeCamera('camera', new B.Vector3(0, 2, -4), scene);
            const at = name => {
                const node = peer.person.node.getChildTransformNodes(false).find(n => n.name === `peertest_${name}`);
                node.computeWorldMatrix(true);
                return node.absolutePosition.clone();
            };
            const left = at('UpperArm.L').x < at('UpperArm.R').x ? 'L' : 'R';
            const right = left === 'L' ? 'R' : 'L';
            for (const clip of Object.keys(peer.person.groups)) {
                const group = peer.person.groups[clip];
                manager._play(peer, clip, true, 1);
                group.pause();
                group.goToFrame(group.from + (group.to - group.from) * 0.4);
                scene.render();
                assert.ok(Number.isFinite(at('Head').y), `${id}/${clip}: invalid pose`);
            }
            manager._play(peer, 'Idle', true, 1);
            for (let frame = 0; frame < 12; frame++) {
                const shoulders = { left: at(`UpperArm.${left}`), right: at(`UpperArm.${right}`) };
                const hands = Object.fromEntries(Object.entries(shoulders).map(([side, shoulder]) => [side, {
                    x: shoulder.x + (side === 'left' ? -0.12 : 0.12), y: shoulder.y - peer.eyeHeight - 0.12,
                    z: shoulder.z + 0.25, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0
                }]));
                manager.updatePeerState('test', null, { x: 0, y: 1.7, z: 0, rotY: 0, hands });
                manager.update(1 / 60);
                scene.render();
                for (const [side, suffix] of [['left', left], ['right', right]]) {
                    const h = peer.hands[side];
                    const expected = new B.Vector3(peer.root.position.x + h.x,
                        peer.root.position.y + peer.eyeHeight + h.y, peer.root.position.z + h.z);
                    assert.ok(B.Vector3.Distance(at(`Wrist.${suffix}`), expected) < 0.035, `${id}/${side}: hand misses target`);
                }
            }
        } finally {
            if (manager) manager.dispose();
            container.dispose(); scene.dispose(); engine.dispose();
        }
    }
});

test('Both detailed DJs reach the real decks and the bartender accepts its procedural rig', async () => {
    for (const id of ['jin', 'zara', 'sana']) {
        const { engine, scene, container } = await load(id);
        try {
            const height = box.CharacterCatalog.people[id].height;
            const rig = new box.AvatarRig({ scene }, container, { eyeHeight: id === 'sana' ? 1.58 : height * 0.93 });
            assert.equal(rig.ok, true, `${id}: incompatible rig`);
            if (id === 'sana') { rig.dispose(); continue; }
            const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
            const dj = new box.DJPerformer({ x: 0, z: desk.near - 0.18, groundY: 0.5, eyeHeight: height * 0.93, desk, rng: () => 0.5 });
            const music = { hasAudio: true, beatPhase: 0, bar: 0, energy: 0.6, drop: false, bpm: 124 };
            const at = name => rig.pos[rig.ix[name]];
            for (const activity of ['mix', 'tweak', 'cue', 'crowd', 'handsUp', 'wave']) {
                dj._begin(activity, 99);
                for (let i = 0; i < 100; i++) rig.update(1 / 60, dj.update(1 / 60, music, null));
                for (const side of ['l', 'r']) assert.ok(Math.abs(at(`foot_${side}`).y - rig.ankleH - 0.5) < 0.02);
                if (activity === 'mix' || activity === 'tweak') for (const hand of [dj.pose.left, dj.pose.right]) {
                    const target = new B.Vector3(hand.x - hand.fx * 0.05, hand.y - hand.fy * 0.05, hand.z - hand.fz * 0.05);
                    assert.ok(Math.min(B.Vector3.Distance(at('hand_l'), target), B.Vector3.Distance(at('hand_r'), target)) < 0.03);
                }
            }
            assert.ok(at('pelvis').z < -19);
            assert.ok(rig.meshes.some(mesh => /Headphones/.test(mesh.name)));
            rig.dispose();
        } finally { container.dispose(); scene.dispose(); engine.dispose(); }
    }
});

test('All fourteen detailed dancers retain rigid limbs, planted claps and anatomical knee planes in every live dance', async () => {
    for (const id of Object.values(box.CharacterCatalog.npcs).slice(0, 14)) {
        const { scene, engine, container } = await load(id);
        try {
            const entry = container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
            const node = entry.rootNodes[0];
            node.rotationQuaternion = null; node.rotation.y = 0; node.scaling.setAll(1);
            const nodes = new Map(node.getChildTransformNodes(false).map(n => [n.name, n]));
            const at = name => {
                const bone = nodes.get(name);
                bone.computeWorldMatrix(true);
                return bone.absolutePosition.clone();
            };
            const sample = () => Object.fromEntries(['UpperLeg.L', 'LowerLeg.L', 'Foot.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.R',
                'Wrist.L', 'Wrist.R', 'Middle2.L', 'Middle2.R'].map(name => [name, at(name)]));
            const dances = entry.animationGroups.filter(group => group.name === 'Dance_Loop' || group.name.startsWith('Groove_'));
            assert.equal(dances.length, 11);
            for (const group of dances) {
                for (const channel of group.targetedAnimations) channel.animation.enableBlending = false;
                group.start(false); group.pause(); group.goToFrame(group.from);
                const first = sample();
                const steps = box.CrowdDance.MOVES[group.name].beats * 16;
                for (let frame = 0; frame <= steps; frame++) {
                    group.goToFrame(group.from + (group.to - group.from) * frame / steps);
                    const points = sample();
                    const hipAxis = points['UpperLeg.L'].subtract(points['UpperLeg.R']);
                    hipAxis.y = 0; hipAxis.normalize();
                    for (const [side, sign] of [['L', 1], ['R', -1]]) {
                        const hip = points[`UpperLeg.${side}`], knee = points[`LowerLeg.${side}`], foot = points[`Foot.${side}`];
                        const line = foot.subtract(hip);
                        const along = B.Vector3.Dot(knee.subtract(hip), line) / line.lengthSquared();
                        const deviation = knee.subtract(hip.add(line.scale(along)));
                        assert.ok(-B.Vector3.Dot(deviation, hipAxis) * sign < 0.005, `${id}/${group.name}: inward knee collapse`);
                        for (const [a, b] of [['UpperLeg', 'LowerLeg'], ['LowerLeg', 'Foot']]) {
                            assert.ok(Math.abs(B.Vector3.Distance(points[`${a}.${side}`], points[`${b}.${side}`])
                                - B.Vector3.Distance(first[`${a}.${side}`], first[`${b}.${side}`])) < 0.001, `${id}/${group.name}: stretched leg`);
                        }
                        if (group.name === 'Groove_Clap' || group.name === 'Groove_ClapUp') {
                            assert.ok(B.Vector3.Distance(foot, first[`Foot.${side}`]) < 0.015, `${id}/${group.name}: sliding planted foot`);
                        }
                    }
                    if ((group.name === 'Groove_Clap' || group.name === 'Groove_ClapUp') && frame % 16 === 0) {
                        const palm = side => points[`Wrist.${side}`].add(points[`Middle2.${side}`]).scale(0.5);
                        assert.ok(B.Vector3.Distance(palm('L'), palm('R')) < 0.07, `${id}/${group.name}: palms miss on the beat`);
                    }
                }
                group.stop();
            }
            entry.dispose();
        } finally { container.dispose(); scene.dispose(); engine.dispose(); }
    }
});
