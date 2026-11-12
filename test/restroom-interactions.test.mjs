import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { Blob } from 'node:buffer';
import { createHash } from 'node:crypto';
import { createRestroomState, applyRestroomAction } from '../worker/src/restroomState.js';
import { ClubRoom } from '../worker/src/relay.js';
import { NodeIO } from '@gltf-transform/core';
import { prepareToiletMechanics } from '../scripts/lib/toilet-mechanics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const box = { console, setTimeout, clearTimeout, performance, URL, Blob, TextDecoder, TextEncoder,
    ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
    atob: value => Buffer.from(value, 'base64').toString('binary') };
box.window = box; box.self = box; box.globalThis = box;
box.addEventListener = () => {};
box.removeEventListener = () => {};
vm.createContext(box);
for (const file of [join('js', 'vendor', 'babylon.js'), join('js', 'vendor', 'babylonjs.loaders.min.js'),
    join('js', 'audioUtils.js'), join('js', 'restroomInteractions.js'), join('js', 'networkClient.js')]) {
    vm.runInContext(readFileSync(join(root, file), 'utf8'), box, { filename: file });
}
const B = box.BABYLON, Fixtures = box.RestroomInteractions;

test('water audio schedules expiry without rendered frames, honors Ambience and disconnects', () => {
    const { fixtures, club, scene, engine } = harness();
    const param = () => ({ value: 0, setValueAtTime(value) { this.value = value; },
        linearRampToValueAtTime(value) { this.value = value; }, setTargetAtTime(value) { this.value = value; } });
    const nodes = [];
    const node = () => {
        const item = { connect() {}, disconnect() { this.disconnected = true; } };
        nodes.push(item);
        return item;
    };
    club.audioContext = {
        currentTime: 10, sampleRate: 32, state: 'running', destination: {},
        createBuffer: () => ({ getChannelData: () => new Float32Array(64) }),
        createBufferSource: () => Object.assign(node(), { start() {}, stop(at) { this.stopAt = at; } }),
        createBiquadFilter: () => Object.assign(node(), { frequency: param(), Q: param() }),
        createGain: () => Object.assign(node(), { gain: param() }),
        createPanner: () => Object.assign(node(), { positionX: param(), positionY: param(), positionZ: param() })
    };
    try {
        const until = fixtures.now() + 12000;
        fixtures._sound('tap0', new B.Vector3(-15, 1, -5), true, false, until);
        const sound = fixtures.sounds.get('tap0');
        assert.ok(sound.source.stopAt > 21.9 && sound.source.stopAt <= 22);
        assert.equal(sound.panner.positionX.value, 15);
        club.getCrowdAmbienceLevel = () => 0;
        fixtures._sound('tap0', null, true, false, until);
        assert.equal(sound.gain.gain.value, 0);
        sound.source.onended();
        assert.equal(fixtures.sounds.size, 0);
        assert.ok(nodes.every(item => item.disconnected));
        fixtures._sound('tap0', new B.Vector3(), true, false, until);
        fixtures._sound('tap0', null, false, false);
        assert.equal(fixtures.retiringSounds.size, 1);
        fixtures.dispose();
        assert.equal(fixtures.retiringSounds.size, 0);
        assert.ok(nodes.every(item => item.disconnected));
    } finally { fixtures.dispose(); scene.dispose(); engine.dispose(); }
});

function harness() {
    const engine = new B.NullEngine(), scene = new B.Scene(engine), errors = [];
    const club = {
        scene, _restroomDoors: [{ remote: false }, { remote: false }],
        _scanRemoteToilets() {}, showErrorMessage: message => errors.push(message), getCrowdAmbienceLevel: () => 1,
        materialFactory: {
            getPreset: name => new B.StandardMaterial(name, scene),
            createStandardMaterial: name => new B.StandardMaterial(name, scene)
        }
    };
    const fixtures = new Fixtures(club);
    fixtures._label = () => {};
    return { club, fixtures, errors, engine, scene };
}

test('relay and real clients share acknowledged restroom state across late join and host handover', () => {
    const room = new ClubRoom({}, {}), guests = [];
    room._roomName = 'private-restroom-test';
    const joinGuest = name => {
        const fixture = harness(), client = new box.NetworkClient();
        fixture.club.networkManager = client;
        client.onRestroom = state => fixture.fixtures.apply(state);
        const socket = { accept() {}, addEventListener() {}, send: data => client._onMessage({ data }), close() {} };
        const session = room._acceptSession(socket, name, null, 'any');
        client._send = message => room._onMessage(socket, session, { data: JSON.stringify(message) });
        const guest = { ...fixture, client, socket, session };
        guests.push(guest);
        return guest;
    };
    try {
        const host = joinGuest('Host'), follower = joinGuest('Follower');
        assert.equal(follower.client.isHost(), false);
        assert.equal(follower.fixtures.action('lid', 0, false), true);
        assert.equal(host.fixtures.state.lids[0], false);
        const late = joinGuest('Late');
        assert.equal(late.fixtures.state.lids[0], false);
        room._onClose(host.socket, host.session);
        assert.equal(follower.client.isHost(), true);
        assert.equal(late.fixtures.action('seat', 0, true), true);
        assert.equal(follower.fixtures.state.seats[0], true);
        assert.equal(follower.fixtures.state.lids[0], true);
    } finally {
        for (const [socket, session] of [...room.sessions]) room._onClose(socket, session);
        for (const guest of guests) { guest.fixtures.dispose(); guest.scene.dispose(); guest.engine.dispose(); }
    }
});

test('restroom protocol negotiates support and accepts self acknowledgements or visible peers only', () => {
    const client = new box.NetworkClient(), received = [], sent = [], errors = [];
    client.onRestroom = state => received.push(state);
    client.onError = error => errors.push(error.message);
    client._send = message => sent.push(message);
    const receive = message => client._onMessage({ data: JSON.stringify(message) }), state = createRestroomState();
    assert.equal(client.sendRestroom('tap', 0, true), false);
    receive({ type: 'welcome', id: 'self', hostId: 'self', peers: [], serverTime: Date.now(),
        restroomInteractions: true, restroom: state });
    assert.equal(received.length, 1);
    assert.equal(client.sendRestroom('tap', 0, true), true);
    assert.equal(JSON.stringify(sent.at(-1)), JSON.stringify({ type: 'restroom', action: 'tap', fixture: 0, on: true }));
    receive({ type: 'restroom', id: 'unknown', state });
    assert.equal(received.length, 1);
    receive({ type: 'restroom', id: 'self', state });
    client.peers.set('visible', {});
    receive({ type: 'restroom', id: 'visible', state });
    assert.equal(received.length, 3);
    receive({ type: 'restroom-error', message: 'This toilet is occupied.' });
    assert.match(errors.at(-1), /occupied/);
    receive({ type: 'welcome', id: 'self', hostId: 'self', peers: [], serverTime: Date.now() });
    assert.equal(client.sendRestroom('lid', 0, true), false);
    assert.match(errors.at(-1), /does not support/);
});

test('real restroom relay filters both block directions while retaining sender ack and authoritative occupancy', () => {
    const room = new ClubRoom({}, {});
    room._roomName = 'private-restroom-block-test';
    const guest = (name, pid) => {
        const frames = [], socket = { accept() {}, addEventListener() {}, send: data => frames.push(JSON.parse(data)), close() {} };
        const session = room._acceptSession(socket, name, pid, 'any');
        return { frames, socket, session };
    };
    const a = guest('A', 'aaaaaaaaaaaaaaaa'), b = guest('B', 'bbbbbbbbbbbbbbbb'), c = guest('C', 'cccccccccccccccc');
    const send = (person, message) => room._onMessage(person.socket, person.session, { data: JSON.stringify(message) });
    const clear = () => { for (const person of [a, b, c]) person.frames.length = 0; };
    try {
        send(a, { type: 'block', pid: b.session.pid });
        clear();
        send(a, { type: 'restroom', action: 'lid', fixture: 0, on: false });
        assert.equal(a.frames.filter(frame => frame.type === 'restroom').length, 1, 'blocked sender still gets its ack');
        assert.equal(b.frames.length, 0);
        assert.equal(c.frames.at(-1).state.lids[0], false);
        clear();
        send(b, { type: 'restroom', action: 'seat', fixture: 0, on: true });
        assert.equal(b.frames.filter(frame => frame.type === 'restroom').length, 1);
        assert.equal(a.frames.length, 0, 'blocking is two-way');
        assert.equal(c.frames.at(-1).state.seats[0], true);
        b.session.lastState = { seated: true, x: -15.62, z: -5.4 };
        clear();
        send(a, { type: 'restroom', action: 'lid', fixture: 0, on: false });
        assert.equal(a.frames.at(-1).type, 'restroom-error');
        assert.match(a.frames.at(-1).message, /occupied/);
        assert.equal(room.restroom.seats[0], true);
        assert.equal(c.frames.length, 0, 'rejection must not broadcast');
        b.session.lastState = null;
        const late = guest('Late', 'dddddddddddddddd');
        assert.equal(late.frames.find(frame => frame.type === 'welcome').restroom.seats[0], true);
        room._onClose(late.socket, late.session);
    } finally {
        for (const [socket, session] of [...room.sessions]) room._onClose(socket, session);
    }
    assert.equal(room.restroom.seats[0], false, 'last departure resets retained state');
});

test('restroom validation bounds occupancy, coupled seat/lid state, water expiry and flush cooldown', () => {
    const state = createRestroomState(), now = 100000;
    assert.equal(applyRestroomAction(state, { action: 'seat', fixture: 0, on: true }, now, false), null);
    assert.equal(state.lids[0], true);
    assert.equal(applyRestroomAction(state, { action: 'lid', fixture: 0, on: false }, now, false), null);
    assert.equal(state.seats[0], false);
    assert.match(applyRestroomAction(state, { action: 'lid', fixture: 0, on: true }, now, true), /occupied/);
    assert.equal(applyRestroomAction(state, { action: 'tap', fixture: 1, on: true }, now, false), null);
    assert.equal(state.taps[1], now + 12000);
    assert.equal(applyRestroomAction(state, { action: 'flush', fixture: 0 }, now, false), null);
    assert.equal(state.flushes[0], now + 6000);
    assert.match(applyRestroomAction(state, { action: 'flush', fixture: 0 }, now + 14999, false), /wait/);
    assert.equal(applyRestroomAction(state, { action: 'flush', fixture: 0 }, now + 15000, false), null);
    for (const message of [{ action: 'tap', fixture: 2, on: true }, { action: 'tap', fixture: '0', on: true },
        { action: '__proto__', fixture: 0, on: true }, { action: 'lid', fixture: 0, on: 'yes' }]) {
        assert.match(applyRestroomAction(state, message, now, false), /Invalid/);
    }
});

test('connected clients never apply optimistic actions or hostile snapshots', () => {
    const { fixtures, club, errors, scene, engine } = harness();
    try {
        const before = JSON.stringify(fixtures.state), requests = [];
        club.networkManager = { connected: true, serverNow: () => 100000,
            sendRestroom: (...args) => { requests.push(args); return true; } };
        assert.equal(fixtures.action('tap', 1, true), true);
        assert.deepEqual(requests, [['tap', 1, true]]);
        assert.equal(JSON.stringify(fixtures.state), before);
        const state = createRestroomState(); state.taps[1] = 112000;
        assert.equal(fixtures.apply(state), true);
        assert.equal(fixtures.apply({ ...state, taps: [Infinity, 0] }), false);
        assert.equal(fixtures.apply({ ...state, taps: [9999999, 0] }), false);
        assert.equal(fixtures.state.taps[1], 112000);
        club._activeSeat = { id: 'toilet-0' };
        assert.equal(fixtures.action('seat', 0, true), false);
        assert.match(errors.at(-1), /occupied/);
        fixtures.apply(null);
        assert.equal(fixtures.state.taps[1], 0);
    } finally { fixtures.dispose(); scene.dispose(); engine.dispose(); }
});

test('licensed Door Handle 3 preserves its hash, compact topology and textureless mounting bounds', async () => {
    const path = join(root, 'js', 'models', 'restroom', 'source'), bytes = readFileSync(join(path, 'door_handle_3.glb'));
    const provenance = JSON.parse(readFileSync(join(path, 'door_handle_3.provenance.json'), 'utf8'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.outputSha256);
    assert.equal(provenance.author, 'plaggy');
    assert.equal(provenance.license, 'CC0-1.0');
    const document = await new NodeIO().readBinary(new Uint8Array(bytes));
    assert.equal(document.getRoot().listTextures().length, 0);
    assert.equal(document.getRoot().listMeshes().length, 1);
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    assert.equal(primitive.getIndices().getCount() / 3, 766);
    const positions = primitive.getAttribute('POSITION');
    assert.ok(positions.getMin([])[2] >= -1e-7);
    assert.ok(positions.getMax([])[2] < 0.05);
});

test('real toilet parts hinge upward, flush displacement stays bounded and authoring is idempotent', async () => {
    const { fixtures, scene, engine } = harness();
    try {
        const bytes = readFileSync(join(root, 'js', 'models', 'restroom', 'source', 'toilet.glb'));
        const container = await B.SceneLoader.LoadAssetContainerAsync('', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
        container.addAllToScene();
        const meshes = container.meshes.filter(mesh => mesh.getTotalVertices?.());
        fixtures.attachToilet(meshes, 0);
        const toilet = fixtures.toilets[0];
        assert.ok(toilet);
        const vertices = toilet.lid.getVerticesData(B.VertexBuffer.PositionKind);
        let front = 0;
        for (let i = 3; i < vertices.length; i += 3) if (vertices[i + 1] < vertices[front + 1]) front = i;
        const local = new B.Vector3(vertices[front], vertices[front + 1], vertices[front + 2]);
        const before = B.Vector3.TransformCoordinates(local, toilet.lid.computeWorldMatrix(true));
        for (let i = 0; i < 120; i++) fixtures.update(1 / 60);
        const after = B.Vector3.TransformCoordinates(local, toilet.lid.computeWorldMatrix(true));
        assert.ok(after.y > before.y + 0.8);
        const start = toilet.position.y;
        fixtures.state.flushes[0] = fixtures.now() + 6000;
        for (let i = 0; i < 2000; i++) fixtures.update(1 / 60);
        assert.ok(Math.abs(toilet.water.position.y - start) < 0.026);
        const io = new NodeIO(), document = await io.readBinary(new Uint8Array(bytes)), beforeBytes = await io.writeBinary(document);
        prepareToiletMechanics(document);
        assert.deepEqual(await io.writeBinary(document), beforeBytes);
    } finally { fixtures.dispose(); scene.dispose(); engine.dispose(); }
});

test('rinse derives from actual hand positions and tap water shuts on its deadline', () => {
    const { fixtures, club, scene, engine } = harness();
    try {
        const water = new B.Mesh('water', scene), splash = new B.Mesh('splash', scene);
        fixtures.sinks[0] = { water, splash, position: new B.Vector3(0, 1, 0), bottom: 0.7, soundKey: 'tap0' };
        club.isInVRMode = true;
        club._xrControllers = [{ grip: { absolutePosition: new B.Vector3(0.025, 0.85, 0) } }];
        fixtures.action('tap', 0, true);
        fixtures.update(1 / 72);
        assert.equal(fixtures.sinks[0].rinsing, true);
        assert.equal(splash.isEnabled(), true);
        club._xrControllers[0].grip.absolutePosition.x = 0.2;
        fixtures.update(1 / 72);
        assert.equal(splash.isEnabled(), false);
        fixtures.state.taps[0] = fixtures.now() - 1;
        fixtures.update(1 / 72);
        assert.equal(water.isEnabled(), false);
    } finally { fixtures.dispose(); scene.dispose(); engine.dispose(); }
});
