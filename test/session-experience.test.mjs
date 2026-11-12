import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const B = require('../js/vendor/babylon.js');

function setup(t) {
    const text = [];
    const context = vm.createContext({
        window: {}, console, performance, BABYLON: {
            ...B, DynamicTexture: class extends B.Texture {
                constructor(name, size, scene) { super(null, scene); this.name = name; }
                getContext() { return { fillRect() {}, fillText(value) { text.push(value); } }; }
                update() {}
            }
        }
    });
    for (const file of ['audioUtils.js', 'materialFactory.js', 'sessionExperience.js']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8'), context);
    }
    const engine = new B.NullEngine(), scene = new B.Scene(engine);
    t.after(() => { scene.dispose(); engine.dispose(); });
    const requests = [];
    const client = { connected: true, selfId: 'me', hostId: 'me', vjId: null, sharedWaterSupported: true,
        peers: new Map() };
    const club = Object.assign({}, context.window.SessionExperience, {
        scene, materialFactory: new context.window.MaterialFactory(scene, 4), isInVRMode: false,
        multiplayer: { client, connected: true, requestWater: (...args) => { requests.push(args); return true; }, hostName: () => 'Host' },
        showErrorMessage(message) { this.error = message; }
    });
    club.createSessionExperience();
    t.after(() => club.disposeSessionExperience());
    return { club, scene, client, requests, text };
}

test('water pointer actions wait for authoritative snapshots and preserve the bounded geometry', t => {
    const { club, requests, client, scene } = setup(t), state = club._sessionExperience;
    const pick = { pickedMesh: state.station.mesh };
    const meshes = scene.meshes.length;
    assert.equal(club.pressSessionExperience(pick), true);
    assert.deepEqual(requests.at(-1), ['order', 'right']);
    club._updateSessionWaterMeshes();
    assert.equal(state.cups.filter(mesh => mesh.isEnabled()).length, 0);
    club.setSessionWater([{ id: 'me', slot: 0, held: false, hand: 'right' }]);
    club._updateSessionWaterMeshes();
    assert.equal(state.cups[0].isEnabled(), true);
    assert.ok(Math.abs(state.cups[0].position.y - 1.17) < 1e-8);
    club.pressSessionExperience(pick);
    assert.deepEqual(requests.at(-1), ['pickup', 'right']);
    assert.equal(state.drinks[0].held, false, 'requests never speculate about a held prop');
    club._vjDeskHandHold = { right: { amount: 1 } };
    club.pressSessionExperience(pick);
    assert.ok(club.error.includes('Let go'));
    for (let i = 0; i < 50; i++) club._updateSessionWaterMeshes();
    assert.equal(scene.meshes.length, meshes, 'updates create no meshes');
    client.sharedWaterSupported = false;
    club.pressSessionExperience(pick);
    assert.ok(club.error.includes('shared water support'));
});

test('held water follows actual physical palm landmarks without writing body, desk or seated poses', t => {
    const { club, scene } = setup(t);
    const root = new B.TransformNode('person', scene);
    const wrist = new B.TransformNode('wrist', scene), index = new B.TransformNode('index', scene), pinky = new B.TransformNode('pinky', scene);
    for (const node of [wrist, index, pinky]) node.parent = root;
    wrist.position.set(1, 1, 1); index.position.set(1.02, 1, 1.1); pinky.position.set(0.98, 1, 1.1);
    const rig = { root, order: [wrist, index, pinky], ix: { hand_l: 0, index_01_l: 1, pinky_01_l: 2 },
        arms: [{ suffix: 'l', side: 'right' }] };
    club._mirrorDouble = { shown: true, arms: rig };
    club._activeSeat = { id: 'bar-0' };
    club._vjDeskHandHold = { right: { amount: 1, x: 1, y: 1, z: 1 } };
    club.setSessionWater([{ id: 'me', slot: 1, held: true, hand: 'right' }]);
    club._updateSessionWaterMeshes();
    const cup = club._sessionExperience.cups[1], before = cup.position.clone();
    root.position.x += 0.4;
    root.computeWorldMatrix(true);
    club._updateSessionWaterMeshes();
    assert.ok(Math.abs(cup.position.x - before.x - 0.4) < 1e-6);
    assert.equal(wrist.position.y, 1);
    assert.equal(club._activeSeat.id, 'bar-0');
    assert.equal(club._vjDeskHandHold.right.amount, 1);
    club.setSessionWater([]);
    club._updateSessionWaterMeshes();
    assert.equal(cup.isEnabled(), false);
});

test('offline water is local, cleared on admission and never substitutes for an unsupported room', t => {
    const { club } = setup(t), state = club._sessionExperience;
    club.multiplayer = { client: null, connected: false, connecting: false };
    const pick = { pickedMesh: state.station.mesh };
    club.pressSessionExperience(pick);
    assert.equal(state.drinks.length, 1);
    assert.equal(state.drinks[0].held, false);
    club._updateSessionWaterMeshes();
    assert.equal(state.cups[0].isEnabled(), true);
    club.pressSessionExperience(pick);
    assert.equal(state.drinks[0].held, true);
    club.setSessionWater([]);
    club.multiplayer = { client: { connected: true, sharedWaterSupported: false }, connected: true };
    club.pressSessionExperience(pick);
    assert.equal(state.drinks.length, 0);
    assert.ok(club.error.includes('shared water support'));
    club.multiplayer = { client: { connected: false }, connected: false, connecting: false, _waterOfflineAllowed: false };
    club.pressSessionExperience(pick);
    assert.equal(state.drinks.length, 0, 'a failed room never falls back to local props');
});

test('booth feedback counts only visible real presence/reactions and disposal removes its observer', t => {
    const { club, client, text, scene } = setup(t), state = club._sessionExperience;
    client.peers.set('guest', { name: 'Guest', state: { x: 0, z: -13 } });
    client.peers.set('sim', { simulated: true, state: { x: 0, z: -13 } });
    club.recordBoothReaction('guest', 'wave');
    club.recordBoothReaction('sim', 'wave');
    club.updateSessionExperience(0.5);
    assert.ok(text.includes('1 real guests / 1 near the booth'));
    assert.ok(text.includes('1 reacted in 15 s / Lights: Host'));
    assert.equal(state.reactions.size, 1);
    client.peers.delete('guest');
    club.updateSessionExperience(0.5);
    assert.equal(state.reactions.size, 0);
    const observer = state.observer;
    club.disposeSessionExperience();
    assert.ok(observer._willBeUnregistered || !scene.onBeforeRenderObservable.observers.includes(observer));
    assert.equal(club._sessionExperience, null);
});

test('clink is explicit on another held cup and sounds only after acknowledgement, at the room position', t => {
    const { club, client } = setup(t), state = club._sessionExperience;
    const calls = [], nodes = [];
    client.peers.set('guest', { name: 'Guest' });
    club.multiplayer.requestWaterClink = id => calls.push(id);
    club.setSessionWater([{ id: 'me', slot: 0, held: true, hand: 'right' },
        { id: 'guest', slot: 1, held: true, hand: 'right' }]);
    club.pressSessionExperience({ pickedMesh: state.cups[1] });
    assert.deepEqual(calls, ['guest']);
    assert.equal(state.sounds.size, 0);
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => {
        const n = { connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() {},
            frequency: param(), gain: param(), positionX: { value: 0 }, positionY: { value: 0 }, positionZ: { value: 0 } };
        nodes.push(n); return n;
    };
    club.audioContext = { state: 'running', currentTime: 0, destination: {}, createOscillator: node, createGain: node, createPanner: node };
    club.getCrowdAmbienceLevel = () => 1;
    club.playSessionWaterClink({ x: 9, y: 1.3, z: -7 });
    assert.equal(state.sounds.size, 1);
    assert.equal(nodes[2].positionX.value, -9);
    assert.equal(nodes[2].positionZ.value, -7);
    club.disposeSessionExperience();
    assert.ok(nodes.every(n => n.disconnected));
});
