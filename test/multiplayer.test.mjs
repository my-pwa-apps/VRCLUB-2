// Multiplayer client and controller: the socket protocol as the browser sees it, and the safety features
// (block, kick, ban, lock, mute, personal space) that ClubMultiplayer exposes to the DOM panel and the VR menu.
import test from 'node:test';
import { URLSearchParams } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PID_A = 'a'.repeat(16);
const PID_B = 'b'.repeat(16);

const intervals = [];
const plain = value => JSON.parse(JSON.stringify(value));

class FakeSocket {
    static OPEN = 1;
    static instances = [];
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.listeners = {}; FakeSocket.instances.push(this); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code) { this.readyState = 3; this.listeners.close?.({ code }); }
    receive(msg) { this.listeners.message({ data: JSON.stringify(msg) }); }
    last(type) { return [...this.sent].reverse().find(m => m.type === type); }
}

class FakeStorage {
    constructor() { this.map = new Map(); }
    getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
    setItem(key, value) { this.map.set(key, String(value)); }
}

class FakeManager {
    constructor() {
        this.calls = [];
        this.peers = new Map();
    }
    setPersonalSpace(v) { this.calls.push(['space', v]); }
    setNameTags(v) { this.calls.push(['nameTags', v]); }
    setMuteAll(v) { this.calls.push(['muteAll', v]); }
    ensurePeer(id, name, info) { this.peers.set(id, { id, name, muted: false, speaking: false, ...info }); }
    setHost() {}
    updatePeerState() {}
    removePeer(id) { this.peers.delete(id); }
    setAvatar(id, avatar) { this.calls.push(['avatar', id, avatar]); }
    showEmoji(id, emoji) { this.calls.push(['emoji', id, emoji]); }
    showChat(id, text) { this.calls.push(['chat', id, text]); }
    anyoneSpeaking() { return false; }
    playGesture(id, gesture) { this.calls.push(['gesture', id, gesture]); }
    attachVoice() {}
    setMuted(id, muted) { const p = this.peers.get(id); if (p) p.muted = muted; }
    list() { return [...this.peers.values()]; }
}

function load() {
    FakeSocket.instances.length = 0;
    const window = { location: { search: '', href: 'https://vrclub.example/' } };
    window.window = window;
    const context = vm.createContext({
        window, console, URL, URLSearchParams, Map, Set, Promise, Math, JSON, Object, Array, Number, String, Date,
        Uint8Array, Error, performance, WebSocket: FakeSocket, setTimeout: () => 1, clearTimeout: () => {}, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: id => { intervals[id - 1] = null; },
        BABYLON: { Axis: { Z: {} }, Vector3: class { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } } }
    });
    for (const file of ['js/networkClient.js', 'js/multiplayer.js']) {
        vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
    }
    context.AvatarManager = class extends FakeManager {};
    return { window, context, NetworkClient: window.NetworkClient, ClubMultiplayer: window.ClubMultiplayer };
}

function welcomed(client, extra = {}) {
    client.connect();
    const socket = FakeSocket.instances.at(-1);
    socket.receive({ type: 'welcome', id: 'me', pid: PID_A, avatar: 'f3', hostId: 'me', locked: false, peers: [], ...extra });
    return socket;
}

test('the client carries its secret uid in the URL and reports the avatar and room lock from the welcome', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', room: 'r', name: 'Ann', uid: 'u'.repeat(24) });
    const seen = {};
    client.onSelfAvatar = a => { seen.avatar = a; };
    client.onRoom = l => { seen.locked = l; };
    const socket = welcomed(client, { locked: true });
    assert.match(socket.url, /uid=u{24}/);
    assert.equal(seen.avatar, 'f3');
    assert.equal(seen.locked, true);
    assert.equal(client.selfPid, PID_A);
    assert.ok(client.isHost());
});

test('an invalid uid is never sent, and a malformed pid or avatar is ignored', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', uid: 'short' });
    const socket = welcomed(client, { pid: 'nothex', avatar: 42, peers: [{ id: 'p1', pid: 'zz', name: 'X', avatar: {} }] });
    assert.ok(!/uid=/.test(socket.url));
    assert.equal(client.selfPid, null);
    assert.equal(client.avatar, null);
    assert.equal(client.peers.get('p1').pid, null);
    assert.equal(client.peers.get('p1').avatar, null);
});

test('peers, avatars and gestures: unknown ids and gestures are dropped, known ones are surfaced', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const calls = [];
    client.onPeerJoin = (id, name, info) => calls.push(['join', id, name, info.pid, info.avatar]);
    client.onGesture = (id, g) => calls.push(['gesture', id, g]);
    client.onPeerAvatar = (id, a) => calls.push(['avatar', id, a]);
    client.onSelfAvatar = a => calls.push(['self', a]);
    const socket = welcomed(client);
    calls.length = 0;
    socket.receive({ type: 'join', id: 'p1', pid: PID_B, name: 'Bo', avatar: 'm2' });
    socket.receive({ type: 'gesture', id: 'p1', gesture: 'wave' });
    socket.receive({ type: 'gesture', id: 'p1', gesture: 'explode' });
    socket.receive({ type: 'gesture', id: 'ghost', gesture: 'wave' });
    socket.receive({ type: 'avatar', id: 'p1', avatar: 'm5' });
    socket.receive({ type: 'avatar', id: 'me', avatar: 'f1' });
    socket.receive({ type: 'avatar', id: 'ghost', avatar: 'f1' });
    assert.deepEqual(calls, [
        ['join', 'p1', 'Bo', PID_B, 'm2'],
        ['gesture', 'p1', 'wave'],
        ['avatar', 'p1', 'm5'],
        ['self', 'f1']
    ]);
    assert.equal(client.peers.get('p1').avatar, 'm5');
});

test('a blocked pid is sent as a block list on welcome and never added, even if the relay announces it', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', blocked: [PID_B, 'junk'] });
    const joined = [];
    client.onPeerJoin = id => joined.push(id);
    const socket = welcomed(client, { peers: [{ id: 'p1', pid: PID_B, name: 'Bo' }, { id: 'p2', pid: 'c'.repeat(16), name: 'Cy' }] });
    assert.deepEqual(socket.last('blocklist').pids, [PID_B]);
    socket.receive({ type: 'join', id: 'p3', pid: PID_B, name: 'Bo again' });
    assert.deepEqual(joined, ['p2']);
});

test('blocking removes the guest at once, is idempotent, bounded, and cannot target oneself', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const left = [];
    client.onPeerLeave = id => left.push(id);
    const socket = welcomed(client, { peers: [{ id: 'p1', pid: PID_B, name: 'Bo' }] });
    assert.equal(client.blockPeer(PID_A), false, 'cannot block yourself');
    assert.equal(client.blockPeer('nope'), false);
    assert.equal(client.blockPeer(PID_B), true);
    assert.deepEqual(left, ['p1']);
    assert.equal(client.peers.size, 0);
    assert.deepEqual(socket.last('block'), { type: 'block', pid: PID_B });
    assert.equal(client.unblockPeer(PID_B), true);
    assert.equal(client.unblockPeer(PID_B), false);
    assert.deepEqual(socket.last('unblock'), { type: 'unblock', pid: PID_B });
    for (let i = 0; i < 80; i++) client.blockPeer(i.toString(16).padStart(16, '0'));
    assert.equal(client.blockedPids.size, NetworkClient.MAX_BLOCKED);
});

test('moderation sends are plain messages, and gestures are allow-listed before they leave', () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const socket = welcomed(client);
    client.kickPeer('p1');
    client.banPeer('p2');
    client.setRoomLocked(1);
    client.sendGesture('wave');
    client.sendGesture('hack');
    client.requestAvatar();
    assert.deepEqual(socket.sent.map(m => m.type), ['kick', 'ban', 'lock', 'gesture', 'avatar']);
    assert.equal(socket.last('lock').locked, true);
});

test('removal, ban and lock close codes are terminal and carry a reason; no reconnect is attempted', () => {
    const { NetworkClient } = load();
    for (const [code, pattern] of [[4010, /removed/i], [4011, /banned/i], [4012, /locked/i]]) {
        const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
        const errors = [];
        client.onError = e => errors.push(e);
        const socket = welcomed(client);
        socket.close(code);
        assert.equal(client.status, 'error');
        assert.match(errors[0].message, pattern);
        assert.equal(errors[0].code, code);
        assert.equal(client._reconnectTimer, null);
    }
});

// ---- ClubMultiplayer ----------------------------------------------------------------------------------------

function makeController(options = {}) {
    const env = load();
    const club = { camera: { position: { x: 0, z: 0 } } };
    const storage = options.storage || new FakeStorage();
    const mp = new env.ClubMultiplayer(club, { storage, rng: () => 0.37 });
    return { ...env, club, storage, mp };
}

function connectedController(peers = [{ id: 'p1', pid: PID_B, name: 'Bo', avatar: 'm1' }], welcome = {}) {
    const env = makeController();
    env.mp.connect({ serverUrl: 'wss://relay.example', room: 'r' });
    const socket = FakeSocket.instances.at(-1);
    socket.receive({ type: 'welcome', id: 'me', pid: PID_A, avatar: 'f3', hostId: 'me', locked: false, peers, ...welcome });
    return { ...env, socket };
}

test('a guest gets a stable secret uid and a name, saved on first use', () => {
    const { mp, storage, ClubMultiplayer } = makeController();
    const uid = mp.uid;
    assert.match(uid, /^[A-Za-z0-9_-]{16,64}$/);
    assert.equal(mp.uid, uid);
    assert.equal(storage.getItem(ClubMultiplayer.PREFS.uid), uid);
    assert.match(mp.name, /^Guest\d{4}$/);
    storage.setItem(ClubMultiplayer.PREFS.uid, 'bad');
    assert.notEqual(mp.uid, 'bad');
});

test('connecting is opt-in, one at a time, and joins with uid, room and the saved block list', () => {
    const { mp, storage, ClubMultiplayer, club } = makeController();
    assert.equal(mp.status, 'idle');
    storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    storage.setItem(ClubMultiplayer.PREFS.blocked, JSON.stringify([{ pid: PID_B, name: 'Bo' }]));
    assert.equal(mp.connect({ room: 'party' }), true);
    assert.equal(mp.connect({ room: 'party' }), false, 'a second connect while connecting does nothing');
    const socket = FakeSocket.instances.at(-1);
    assert.match(socket.url, /room=party/);
    assert.match(socket.url, /uid=/);
    socket.receive({ type: 'welcome', id: 'me', pid: PID_A, avatar: 'f3', hostId: 'me', peers: [] });
    assert.deepEqual(socket.last('blocklist').pids, [PID_B]);
    assert.equal(club.isMultiplayer, true);
    assert.equal(mp.selfAvatar, 'f3');
    assert.match(mp.statusText(), /^In room "party"/);
    assert.match(mp.statusText(), /you are the host/);
    mp.disconnect();
    assert.equal(club.isMultiplayer, false);
});

test('blocking from the controller persists the guest, removes them and survives a new controller', () => {
    const { mp, storage, ClubMultiplayer, socket } = connectedController();
    assert.equal(mp.people().length, 1);
    assert.equal(mp.blockPeer('p1'), true);
    assert.equal(mp.people().length, 0);
    assert.deepEqual(socket.last('block'), { type: 'block', pid: PID_B });
    const saved = JSON.parse(storage.getItem(ClubMultiplayer.PREFS.blocked));
    assert.equal(saved[0].pid, PID_B);
    assert.equal(saved[0].name, 'Bo');
    assert.equal(mp.blockPeer('p1'), false, 'already gone');
    assert.equal(mp.unblock(PID_B), true);
    assert.deepEqual(plain(mp.blockedList()), []);
    assert.equal(mp.unblock(PID_B), false);
});

test('unblockAll lifts every block and tells the relay about each', () => {
    const { mp, storage, ClubMultiplayer, socket } = connectedController();
    const other = 'c'.repeat(16);
    storage.setItem(ClubMultiplayer.PREFS.blocked, JSON.stringify([{ pid: PID_B, name: 'Bo' }, { pid: other, name: 'Cy' }]));
    mp.client.blockedPids.add(PID_B);
    mp.client.blockedPids.add(other);
    assert.equal(mp.unblockAll(), 2);
    assert.deepEqual(plain(mp.blockedList()), []);
    assert.equal(socket.sent.filter(m => m.type === 'unblock').length, 2);
});

test('a corrupt saved block list is ignored rather than breaking the menu', () => {
    const { mp, storage, ClubMultiplayer } = makeController();
    storage.setItem(ClubMultiplayer.PREFS.blocked, '{not json');
    assert.deepEqual(plain(mp.blockedList()), []);
    storage.setItem(ClubMultiplayer.PREFS.blocked, JSON.stringify([{ pid: 'short' }, null, { pid: PID_B, name: 'ok' }]));
    assert.deepEqual(plain(mp.blockedList().map(item => item.pid)), [PID_B]);
});

test('only the host can kick, ban or lock, and only a person in the room can be targeted', () => {
    const host = connectedController();
    assert.equal(host.mp.kickPeer('ghost'), false);
    assert.equal(host.mp.kickPeer('p1'), true);
    assert.equal(host.mp.banPeer('p1'), true);
    assert.equal(host.mp.setLocked(true), true);
    assert.deepEqual(host.socket.sent.filter(m => ['kick', 'ban', 'lock'].includes(m.type)).map(m => m.type), ['kick', 'ban', 'lock']);

    const guest = connectedController(undefined, { hostId: 'p1' });
    assert.equal(guest.mp.isHost(), false);
    assert.equal(guest.mp.kickPeer('p1'), false);
    assert.equal(guest.mp.banPeer('p1'), false);
    assert.equal(guest.mp.setLocked(true), false);
    assert.ok(!guest.socket.sent.some(m => ['kick', 'ban', 'lock'].includes(m.type)));
});

test('a kick closes the session with a reason and the panel and VR menu are told', () => {
    const { mp, socket } = connectedController();
    let changes = 0;
    mp.onChange(() => { changes++; });
    socket.close(4010);
    assert.equal(mp.status, 'error');
    assert.match(mp.statusText(), /removed/i);
    assert.ok(changes > 0);
});

test('mute is per person and mute-all and personal space are remembered and applied', () => {
    const { mp, storage, ClubMultiplayer } = connectedController();
    assert.equal(mp.togglePeerMute('p1'), true);
    assert.equal(mp.people()[0].muted, true);
    assert.equal(mp.mutePeer('ghost', true), false);
    mp.setMuteAll(true);
    assert.equal(mp.muteAll, true);
    mp.setPersonalSpace(false);
    assert.equal(mp.personalSpace, false);
    mp.setAutoNod(false);
    assert.equal(storage.getItem(ClubMultiplayer.PREFS.autoNod), '0');
});

test('gestures: wave and nod are one-shots, dance toggles and ends when the guest walks away', () => {
    const { mp, socket, club } = connectedController();
    assert.equal(mp.sendGesture('wave'), true);
    assert.equal(mp.sendGesture('dance'), true);
    assert.equal(mp.dancing, true);
    mp.update({});
    club.camera.position.x = 0.3;
    mp.update({});
    assert.equal(mp.dancing, true, 'a small step does not end a dance');
    club.camera.position.x = 1.2;
    mp.update({});
    assert.equal(mp.dancing, false);
    assert.equal(mp.sendGesture('explode'), false);
    assert.deepEqual(socket.sent.filter(m => m.type === 'gesture').map(m => m.gesture), ['wave', 'dance', 'stop']);
    assert.equal(mp.sendEmoji('🔥'), true);
    assert.equal(mp.sendEmoji('<b>'), false);
});

test('gestures, emoji and the mic do nothing while disconnected', async () => {
    const { mp } = makeController();
    assert.equal(mp.sendGesture('wave'), false);
    assert.equal(mp.sendEmoji('🔥'), false);
    assert.equal(mp.rerollAvatar(), false);
    assert.equal(await mp.toggleMic(), false);
    assert.deepEqual(plain(mp.people()), []);
});

test('a head nod in VR becomes the nod gesture, once, and never when looking up and staying there', () => {
    const { mp, socket } = connectedController();
    let pitch = 0;
    const camera = { getDirectionToRef: (axis, out) => { out.y = Math.sin(pitch); return out; } };
    const step = (p, t) => { pitch = p; mp._watchForNod(camera, t, 1 / 60); };
    for (let t = 0; t < 1; t += 1 / 60) step(0, t);
    step(-0.3, 1.0);
    step(-0.3, 1.1);
    step(0, 1.3);
    assert.equal(socket.sent.filter(m => m.gesture === 'nod').length, 1);
    step(-0.3, 1.5);
    step(0, 1.6);
    assert.equal(socket.sent.filter(m => m.gesture === 'nod').length, 1, 'cooldown');
    const quiet = connectedController();
    pitch = 0;
    const cam2 = { getDirectionToRef: (axis, out) => { out.y = Math.sin(pitch); return out; } };
    for (let t = 0; t < 1; t += 1 / 60) quiet.mp._watchForNod(cam2, t, 1 / 60);
    pitch = 0.4;
    for (let t = 1; t < 6; t += 1 / 60) quiet.mp._watchForNod(cam2, t, 1 / 60);
    assert.equal(quiet.socket.sent.filter(m => m.gesture === 'nod').length, 0);
});

test('shared music needs consent: nothing loads until Listen along, and the host is exempt', () => {
    const { mp, club } = connectedController(undefined, { hostId: 'p1' });
    const started = [];
    club.startAudioStream = url => { started.push(url); return Promise.resolve(); };
    mp._applyMusic({ url: 'https://stream.example/a.mp3', playing: true, position: 0, updatedAt: Date.now() });
    assert.deepEqual(plain(started), []);
    assert.deepEqual(plain(mp.pendingMusicInfo()), { origin: 'stream.example', playing: true });
    mp.acceptListenAlong();
    assert.deepEqual(plain(started), ['https://stream.example/a.mp3']);
    assert.equal(mp.pendingMusicInfo(), null);
    mp._applyMusic({ url: 'javascript:alert(1)', playing: true });
    assert.deepEqual(plain(started), ['https://stream.example/a.mp3']);

    const host = connectedController();
    host.club.startAudioStream = url => { started.push(url); return Promise.resolve(); };
    host.mp._applyMusic({ url: 'https://stream.example/b.mp3', playing: true });
    assert.equal(started.length, 1);
});

test('dispose releases the session and detaches from the club', () => {
    const { mp, club } = connectedController();
    mp.dispose();
    assert.equal(club.multiplayer, null);
    assert.equal(mp.connect({ serverUrl: 'wss://relay.example' }), false);
});

test('the VR menu and the DOM panel only call the controller; neither writes a block or a kick itself', () => {
    const vr = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    const dom = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const start = vr.indexOf('_runVRNetworkAction');
    assert.ok(start > 0);
    for (const [name, source] of [['10-ui.js', vr], ['ui-init.js', dom]]) {
        assert.ok(!/localStorage\.setItem\(['"]vrclub\.blockedPeers/.test(source), `${name} writes the block list directly`);
        assert.ok(!/networkManager\.(kickPeer|banPeer|blockPeer|setRoomLocked)/.test(source), `${name} bypasses ClubMultiplayer`);
    }
    for (const call of ['kickPeer', 'banPeer', 'blockPeer', 'togglePeerMute', 'setLocked', 'setPersonalSpace', 'setMuteAll', 'unblockAll']) {
        assert.ok(vr.includes(`.${call}(`), `the VR menu never calls multiplayer.${call}`);
    }
});

// ---- the host owns the music and the lights ------------------------------------------------------------------

function fakeRig(club) {
    const calls = [];
    club.vjManualMode = false;
    club.showDirector = {
        follower: false,
        enabled: true,
        setFollower(on) { this.follower = on; },
        isDriving() { return this.enabled && !club.vjManualMode; },
        snapshot() { return { mv: 'pulse', cue: 1, cb: 2, sp: null, spt: null, spb: 0, bib: 0, bar: 8 }; },
        applyRemote(frame, force) { calls.push(['apply', frame.mv, !!force]); return true; }
    };
    club.vjDirector = {
        remoteDriven: false,
        targetMasterIntensity: 0.8,
        colourSnapshot() { return { hue: 0.25, hl: true, pal: 'triad', lh: 'match', mbi: 2 }; },
        applyRemoteColour(frame) { calls.push(['colour', frame.hue]); }
    };
    return calls;
}

test('the host publishes the show on change, on every bar, and on a heartbeat, but not faster than the relay allows', () => {
    const { mp, socket, club } = connectedController();
    fakeRig(club);
    mp._syncShared(1000);
    const first = socket.last('show');
    assert.equal(first.m, 'show');
    assert.equal(first.mv, 'pulse');
    assert.equal(first.cue, 1);
    assert.equal(first.hue, 0.25);
    assert.equal(first.pal, 'triad');
    assert.ok(!('_bar' in first), 'the bar counter is local and never sent');
    const count = () => socket.sent.filter(m => m.type === 'show').length;
    mp._syncShared(1100);
    mp._syncShared(1400);
    assert.equal(count(), 1, 'an unchanged show is not repeated before the heartbeat');
    club.showDirector.snapshot = () => ({ mv: 'pulse', cue: 1, cb: 3, sp: null, spt: null, spb: 0, bib: 0, bar: 9 });
    mp._syncShared(1500);
    assert.equal(count(), 2, 'a new bar line is sent so guests stay on the beat');
    club.showDirector.snapshot = () => ({ mv: 'ignition', cue: 0, cb: 0, sp: null, spt: null, spb: 0, bib: 1, bar: 9 });
    mp._syncShared(1600);
    assert.equal(count(), 2, 'a change inside the minimum interval waits for it');
    mp._syncShared(1800);
    assert.equal(count(), 3);
    assert.equal(socket.last('show').mv, 'ignition');
    mp._syncShared(1800 + mp.constructor.SHOW_HEARTBEAT_MS + 10);
    assert.equal(count(), 4, 'the heartbeat brings a late joiner in');
});

test('under manual control the host publishes its console and never the director\'s cue', () => {
    const { mp, socket, club } = connectedController();
    fakeRig(club);
    club.vjManualMode = true;
    Object.assign(club, { lightsActive: true, lasersActive: false, laserSpeed: 1.5, spotlightMode: 2, secret: 'x', ledPattern: 7 });
    mp._syncShared(1000);
    const frame = socket.last('show');
    assert.equal(frame.m, 'manual');
    assert.ok(!('mv' in frame));
    assert.deepEqual({ ...frame.fx }, { lightsActive: true, lasersActive: false, laserSpeed: 1.5, spotlightMode: 2, ledPattern: 7, vjMaster: 0.8 });
});

test('a lone host sends nothing, and a newcomer is brought in at once', () => {
    const { mp, socket, club } = connectedController([]);
    fakeRig(club);
    mp._syncShared(1000);
    assert.equal(socket.sent.filter(m => m.type === 'show').length, 0);
    socket.receive({ type: 'join', id: 'p9', pid: 'c'.repeat(16), name: 'New', avatar: 'f1' });
    mp._syncShared(2000);
    assert.equal(socket.sent.filter(m => m.type === 'show').length, 1);
});

test('a guest follows the host: its director and colour engine are handed over, and handed back when it becomes host', () => {
    const { mp, socket, club } = connectedController(undefined, { hostId: 'p1' });
    fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    assert.equal(mp.following, true);
    assert.equal(club.showDirector.follower, true);
    assert.equal(club.vjDirector.remoteDriven, true);
    assert.equal(club.roomFollower, true);
    socket.receive({ type: 'host', id: 'me' });
    assert.equal(mp.following, false);
    assert.equal(club.showDirector.follower, false);
    assert.equal(club.vjDirector.remoteDriven, false);
});

test('a guest applies the host\'s show frames: the first one forces the look, the colour is always adopted', () => {
    const { mp, socket, club } = connectedController(undefined, { hostId: 'p1' });
    const calls = fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    club.vjManualMode = true; // the guest had been playing with its own console
    socket.receive({ type: 'show', m: 'show', mv: 'ignition', cue: 0, cb: 0, bib: 0, hue: 0.5 });
    socket.receive({ type: 'show', m: 'show', mv: 'ignition', cue: 0, cb: 1, bib: 0, hue: 0.5 });
    assert.equal(club.vjManualMode, false, 'the host is driving a show, so the guest\'s console is off');
    assert.deepEqual(plain(calls.filter(c => c[0] === 'apply')), [['apply', 'ignition', true], ['apply', 'ignition', false]]);
    assert.equal(calls.filter(c => c[0] === 'colour').length, 2);
});

test('a host that is not the room\'s host cannot drive a guest: only the followed host\'s frames land, and a host ignores frames', () => {
    const host = connectedController();
    const calls = fakeRig(host.club);
    host.socket.receive({ type: 'show', m: 'show', mv: 'pulse', cue: 0 });
    assert.equal(calls.length, 0, 'the host never applies a show frame');
});

test('manual frames set only known fixtures, of the right type and in range, and never turn strobes on under Safe Mode', () => {
    const { mp, socket, club } = connectedController(undefined, { hostId: 'p1' });
    fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    Object.assign(club, { lightsActive: true, laserSpeed: 1, strobesActive: false, spotlightMode: 0, photosensitiveSafeMode: true });
    socket.receive({ type: 'show', m: 'manual', fx: { lightsActive: false, laserSpeed: 99, strobesActive: true, spotlightMode: 2.6, evil: true, ledPattern: 'x', vjMaster: 0.4 } });
    assert.equal(club.vjManualMode, true);
    assert.equal(club.lightsActive, false);
    assert.equal(club.laserSpeed, 10, 'clamped to the fixture\'s range');
    assert.equal(club.strobesActive, false, 'Safe Mode is the guest\'s own setting');
    assert.equal(club.spotlightMode, 3, 'indexes are whole numbers');
    assert.ok(!('evil' in club), 'an unknown name is never written');
    assert.ok(!('ledPattern' in club) || club.ledPattern !== 'x');
    assert.equal(club.vjDirector.targetMasterIntensity, 0.4);
    club.photosensitiveSafeMode = false;
    socket.receive({ type: 'show', m: 'manual', fx: { strobesActive: true } });
    assert.equal(club.strobesActive, true);
});

test('when the host goes silent a guest\'s lights run themselves again, and rejoin the host\'s when it speaks', () => {
    const { mp, socket, club } = connectedController(undefined, { hostId: 'p1' });
    const calls = fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    const base = mp._show.lastFrameAt;
    mp._syncShared(base + 1000);
    assert.equal(club.showDirector.follower, true);
    mp._syncShared(base + mp.constructor.SHOW_STALE_MS + 1);
    assert.equal(club.showDirector.follower, false, 'a silent host does not freeze the room on one look');
    assert.equal(club.vjDirector.remoteDriven, false);
    socket.receive({ type: 'show', m: 'show', mv: 'pulse', cue: 1, cb: 0, bib: 0 });
    assert.equal(club.showDirector.follower, true);
    assert.equal(calls.filter(c => c[0] === 'apply').at(-1)[2], true, 'the look is applied afresh after a gap');
});

test('a guest\'s mode is re-asserted every frame, so a stray local change cannot pull the room off the host', () => {
    const { mp, socket, club } = connectedController(undefined, { hostId: 'p1' });
    fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    socket.receive({ type: 'show', m: 'show', mv: 'pulse', cue: 0 });
    club.vjManualMode = true;
    mp._syncShared(mp._show.lastFrameAt + 100);
    assert.equal(club.vjManualMode, false);
});

test('a podcast the app already talks to starts at once; any other stream waits for consent; the host\'s clock is read through the measured offset', async () => {
    const { mp, club, socket, window } = connectedController(undefined, { hostId: 'p1' });
    const started = [];
    const el = { src: '', paused: true, duration: 3000, currentTime: 0, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
    club.startAudioStream = (url, options) => { started.push([url, options.onDemand]); el.src = url; club.audioElement = el; return Promise.resolve(); };
    club.setDJ = id => { club.dj = id; return Promise.resolve(); };
    club.podcastPlayer = { queue: { x: 1 } };
    window.Podcasts = { get: id => ({ id, dj: id === 'colourizon' ? 'melera' : 'hernan' }) };
    // The relay's clock runs 5 s ahead of this browser's.
    mp.client.serverOffset = 5000;
    const updatedAt = Date.now() + 5000 - 10000; // stamped 10 s ago, on the relay's clock
    socket.receive({ type: 'music', url: 'https://mcdn.podbean.com/ep.mp3', playing: true, position: 100, updatedAt, podcast: 'colourizon', title: 'Colourizon 168' });
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(plain(started), [['https://mcdn.podbean.com/ep.mp3', true]], 'a Podbean episode needs no extra consent');
    assert.ok(Math.abs(el.currentTime - 110) < 1, `the guest joined at ${el.currentTime}s instead of 110s`);
    assert.equal(club.nowPlayingLabel, 'Colourizon 168');
    assert.equal(club.dj, 'melera');
    assert.equal(club.podcastPlayer.queue, null, 'the guest\'s own episode queue is dropped');
    assert.equal(mp.pendingMusicInfo(), null);

    socket.receive({ type: 'music', url: 'https://unknown.example/live.mp3', playing: true, position: 0, updatedAt: Date.now() + 5000 });
    assert.equal(plain(started).length, 1);
    assert.equal(mp.pendingMusicInfo().origin, 'unknown.example');

    // A look-alike path on someone else's host is not the club's relay.
    socket.receive({ type: 'music', url: 'https://evil.example/podcast/colourizon/stream/a.mp3', playing: true, position: 0, updatedAt: Date.now() + 5000 });
    assert.equal(plain(started).length, 1);
});

test('the track position follows the host: a drift of a second is corrected, a small one is left alone, a live stream is never sought', async () => {
    const { mp, club, socket } = connectedController(undefined, { hostId: 'p1' });
    const el = { src: 'https://mcdn.podbean.com/ep.mp3', paused: false, duration: 3000, currentTime: 100, play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
    club.audioElement = el;
    const music = (position) => ({ type: 'music', url: 'https://mcdn.podbean.com/ep.mp3', playing: true, position, updatedAt: mp.client.serverNow() });
    socket.receive(music(100.4));
    assert.equal(el.currentTime, 100, 'within the drift allowance');
    socket.receive(music(102));
    assert.ok(Math.abs(el.currentTime - 102) < 0.5);
    el.duration = Infinity;
    el.currentTime = 5;
    socket.receive(music(500));
    assert.equal(el.currentTime, 5, 'a live stream has no position to seek');
    socket.receive({ ...music(0), playing: false });
    assert.equal(el.paused, true, 'the host paused');
});

test('the host\'s player controls announce themselves however they were used (play, pause, seek)', () => {
    const { mp, club } = connectedController();
    const listeners = {};
    const el = {
        paused: false,
        addEventListener(type, fn) { listeners[type] = fn; },
        removeEventListener(type) { delete listeners[type]; }
    };
    club.audioElement = el;
    club._shareAudioPosition = () => {};
    fakeRig(club);
    mp._syncShared(1000);
    assert.deepEqual(Object.keys(listeners).sort(), ['pause', 'play', 'seeked']);
    mp.dispose();
    assert.deepEqual(Object.keys(listeners), []);
});

test('rooms: six digits open a private room, any other text is a room name, invite links carry the room', () => {
    const { ClubMultiplayer, mp, window } = makeController();
    assert.equal(ClubMultiplayer.roomFromCode(' 482913 '), 'private-482913');
    assert.equal(ClubMultiplayer.roomFromCode('afterhours'), 'afterhours');
    assert.equal(ClubMultiplayer.roomFromCode('12345'), '12345');
    assert.equal(ClubMultiplayer.roomFromCode(''), '');
    assert.match(ClubMultiplayer.newPrivateRoom(() => 0.5), /^private-\d{6}$/);
    assert.equal(mp.joinRoom(''), false);
    window.location.href = 'https://my-pwa-apps.github.io/VRCLUB-2/?x=1#top';
    mp.storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    assert.equal(mp.joinRoom('482913'), true);
    assert.match(FakeSocket.instances.at(-1).url, /room=private-482913/);
    assert.equal(mp.inviteUrl(), 'https://my-pwa-apps.github.io/VRCLUB-2/?room=private-482913');
});

test('the host is named in the status, and a guest is told whose room it is', () => {
    const { mp } = connectedController(undefined, { hostId: 'p1' });
    assert.equal(mp.hostName(), 'Bo');
    assert.match(mp.statusText(), /host: Bo/);
    const host = connectedController();
    assert.equal(host.mp.hostName(), host.mp.name);
    assert.match(host.mp.statusText(), /you are the host/);
});

test('every control that changes the room\'s music or lights is gated for a guest, on every surface', () => {
    const ui = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    const dom = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const podcasts = readFileSync(join(ROOT, 'js/podcasts.js'), 'utf8');
    const body = (source, signature) => {
        const start = source.indexOf(signature);
        assert.ok(start >= 0, `${signature} not found`);
        return source.slice(start, source.indexOf('\n    }\n', start));
    };
    for (const [name, what] of [['seekAudioTo(seconds) {', 'music'], ['toggleAudioPlayback() {', 'music'], ['_beginVRSeek(pickResult) {', 'music'],
        ['async _runVRMusicAction(button) {', 'music']]) {
        assert.match(body(ui, name), new RegExp(`guardHostControl\\('${what}'\\)`), `${name} is not gated`);
    }
    const activate = body(ui, '_activateVRQuickMenuButton(button) {');
    assert.ok((activate.match(/guardHostControl\('lights'\)/g) || []).length >= 3, 'reset, auto show and the show controls must be gated');
    assert.match(body(ui, 'toggleLightControl(control) {'), /guardHostControl\('lights'\)/, 'the shared light toggle is not gated');
    // The desk at the DJ table: every light, macro and fader goes through the host check; the music through its own;
    // only the resident-DJ button (who is in YOUR club) is local.
    const desk = readFileSync(join(ROOT, 'js/vjDesk.js'), 'utf8');
    const run = body(desk, '_runVJDeskButton(button) {');
    assert.ok(run.indexOf("guardHostControl('lights')") > run.indexOf("button.kind === 'music'"),
        'the desk must check the host before anything but the DJ and the music');
    assert.match(body(desk, '_vjDeskSetFader(button, x) {'), /guardHostControl\('lights'\)/, 'the desk faders are not gated');
    assert.match(body(desk, '_vjDeskMusic() {'), /guardHostControl\('music'\)/, 'the desk music button is not gated');
    assert.match(dom, /club\.guardHostControl\('lights'\)\) vjMacros\.drop\(\)/);
    assert.match(dom, /club\.guardHostControl\('lights'\)\) vjMacros\.blackout\(\)/);
    assert.match(dom, /guardHostControl\('music'\)/);
    assert.match(dom, /function initRoomGuestLock\(mp\)/);
    assert.match(podcasts, /isFollowingHost/, 'a following guest must not queue its own next episode');
    const director = readFileSync(join(ROOT, 'js/showDirector.js'), 'utf8');
    for (const name of ['triggerShowDrop() {', 'forceMovement(name) {', 'setEnabled(on) {']) {
        assert.match(body(director, name), /this\.follower/, `${name} must refuse a follower`);
    }
});

test('the DJ follows the host on every music update: a guest already on the track, or with the host paused, still changes DJ', () => {
    const { mp, club, socket, window } = connectedController(undefined, { hostId: 'p1' });
    const djs = [];
    club.setDJ = id => { djs.push(id); return Promise.resolve(true); };
    // Like the real catalogue, an unknown id falls back to the default podcast (whose id differs from the one asked for).
    window.Podcasts = { get: id => (id === 'colourizon' ? { id, dj: 'melera' } : { id: 'resident', dj: 'hernan' }) };
    const url = 'https://mcdn.podbean.com/ep.mp3';
    club.audioElement = { src: url, paused: false, duration: 3000, currentTime: 50, play() { return Promise.resolve(); }, pause() { this.paused = true; } };
    const frame = (podcast, extra = {}) => ({ type: 'music', url, playing: true, position: 50, updatedAt: mp.client.serverNow(), podcast, title: `Episode of ${podcast}`, ...extra });
    socket.receive(frame('colourizon'));
    assert.deepEqual([...djs], ['melera'], 'same track, new podcast');
    assert.equal(club.nowPlayingLabel, 'Episode of colourizon');
    socket.receive(frame('resident', { playing: false }));
    assert.deepEqual([...djs], ['melera', 'hernan'], 'a paused host still changes the DJ');
    socket.receive(frame('../nope'));
    socket.receive({ ...frame(null), podcast: null });
    assert.equal(djs.length, 2, 'an unknown or missing podcast leaves the DJ alone');
});

test('the avatar pool is a remembered preference, sent on joining, and a pool change replaces only a look outside it', () => {
    const { mp, storage, ClubMultiplayer } = makeController();
    assert.equal(mp.avatarPool, 'any');
    mp.setAvatarPool('women');
    assert.equal(storage.getItem(ClubMultiplayer.PREFS.avatarPool), 'women');
    mp.setAvatarPool('robots');
    assert.equal(mp.avatarPool, 'any', 'an unknown pool is anyone');
    mp.setAvatarPool('men');
    storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    mp.connect({ room: 'r' });
    const socket = FakeSocket.instances.at(-1);
    assert.match(socket.url, /avatars=men/);
    socket.receive({ type: 'welcome', id: 'me', pid: PID_A, avatar: 'f3', hostId: 'me', peers: [] });
    mp.selfAvatar = 'f3';
    mp.setAvatarPool('men');
    assert.equal(socket.last('avatar').pool, 'men', 'a woman asked to be a man is rerolled');
    const before = socket.sent.filter(m => m.type === 'avatar').length;
    mp.selfAvatar = 'm2';
    mp.setAvatarPool('men');
    mp.setAvatarPool('any');
    assert.equal(socket.sent.filter(m => m.type === 'avatar').length, before, 'a look already in the pool is kept');
    assert.equal(mp.client.avatarPool, 'any');
    mp.rerollAvatar();
    assert.equal(socket.last('avatar').pool, 'any');
    assert.ok(ClubMultiplayer.inPool('f1', 'women') && !ClubMultiplayer.inPool('f1', 'men') && ClubMultiplayer.inPool('m9', 'men'));
});

test('a default pool adds nothing to the join URL (older relays see the same request as before)', () => {
    const { mp, storage } = makeController();
    storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    mp.connect({ room: 'r' });
    assert.ok(!/avatars=/.test(FakeSocket.instances.at(-1).url));
});

test('a connected guest pings the relay every ten seconds, and stops when it leaves', () => {
    intervals.length = 0;
    const { mp, socket } = connectedController();
    const timer = intervals.find(item => item && item.ms === 10000);
    assert.ok(timer, 'no heartbeat timer');
    timer.fn();
    assert.equal(socket.sent.filter(m => m.type === 'ping').length, 1);
    mp.disconnect();
    assert.equal(intervals.filter(Boolean).length, 0, 'the heartbeat must not outlive the session');
});

test('a guest promoted because the host left is told, and asked for music when nothing is playing', () => {
    const quiet = connectedController(undefined, { hostId: 'p1' });
    const told = [];
    quiet.club.showErrorMessage = message => told.push(message);
    fakeRig(quiet.club);
    quiet.mp._roleApplied = null;
    quiet.mp._syncRole();
    quiet.socket.receive({ type: 'host', id: 'me' });
    assert.match(told.at(-1), /you are now the host\. Pick some music/);

    const playing = connectedController(undefined, { hostId: 'p1' });
    const toasts = [];
    playing.club.showErrorMessage = message => toasts.push(message);
    playing.club.audioElement = { paused: false };
    playing.club._audioKind = 'stream';
    fakeRig(playing.club);
    playing.mp._roleApplied = null;
    playing.mp._syncRole();
    playing.socket.receive({ type: 'host', id: 'me' });
    assert.match(toasts.at(-1), /You control the music and the lights/);
});

test('name tags are a remembered preference, applied to the room on joining and at once when changed', () => {
    const { mp, storage, ClubMultiplayer } = makeController();
    assert.equal(mp.nameTags, true, 'on by default');
    let changes = 0;
    mp.onChange(() => { changes++; });
    mp.setNameTags(false);
    assert.equal(storage.getItem(ClubMultiplayer.PREFS.nameTags), '0');
    assert.equal(changes, 1);
    storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    mp.connect({ room: 'r' });
    assert.deepEqual(plain(mp.manager.calls.filter(c => c[0] === 'nameTags')), [['nameTags', false]], 'joined with tags off');
    mp.setNameTags(true);
    assert.deepEqual(plain(mp.manager.calls.filter(c => c[0] === 'nameTags')).at(-1), ['nameTags', true]);
    const again = makeController({ storage });
    assert.equal(again.mp.nameTags, true);
    storage.setItem(ClubMultiplayer.PREFS.nameTags, '0');
    assert.equal(makeController({ storage }).mp.nameTags, false, 'remembered across sessions');
});

test('a guest who blocks the host is no longer locked out: the host is out of sight, so the music and lights are theirs', () => {
    const { mp, club, socket } = connectedController(undefined, { hostId: 'p1' });
    const calls = fakeRig(club);
    mp._roleApplied = null;
    mp._syncRole();
    const told = [];
    club.showErrorMessage = message => told.push(message);
    assert.equal(mp.following, true);
    assert.equal(club.showDirector.follower, true);
    mp.blockPeer('p1');
    assert.equal(mp.following, false, 'blocking is two-way: no more frames will come from this host');
    assert.equal(club.showDirector.follower, false);
    assert.equal(club.vjDirector.remoteDriven, false);
    assert.match(told.at(-1), /can no longer see the host/);
    assert.ok(!told.some(m => /you are now the host/.test(m)), 'nobody was promoted');
    void calls; void socket;
});

test('a guest whose blocked guest becomes host does not follow them, and does follow a visible new host', () => {
    const { mp, club, socket } = connectedController([{ id: 'p1', pid: PID_B, name: 'Bo' }, { id: 'p2', pid: 'c'.repeat(16), name: 'Cy' }], { hostId: 'p1' });
    fakeRig(club);
    club.showErrorMessage = () => {};
    mp.blockPeer('p2');
    assert.equal(mp.following, true, 'the host is still visible');
    socket.receive({ type: 'host', id: 'p2' });
    socket.receive({ type: 'leave', id: 'p1' });
    assert.equal(mp.following, false, 'the new host is someone this guest blocked');
    mp.unblock('c'.repeat(16));
    socket.receive({ type: 'join', id: 'p2', pid: 'c'.repeat(16), name: 'Cy' });
    assert.equal(mp.following, true, 'visible again: the room\'s host leads again');
});

test('the host looks for a show change at most every 100 ms, never on every render frame', () => {
    const { mp, club } = connectedController();
    fakeRig(club);
    let builds = 0;
    const real = club.vjDirector.colourSnapshot;
    club.vjDirector.colourSnapshot = function () { builds++; return real.call(this); };
    mp._syncShared(1000);                       // first frame: sent
    const afterFirst = builds;
    for (let t = 1300; t < 1400; t += 1000 / 90) mp._syncShared(t);   // ~9 frames at 90 Hz inside one 100 ms window
    assert.ok(builds - afterFirst <= 1, `built ${builds - afterFirst} frames in 100 ms`);
});

// ---- chat, quick phrases and lowering the music for voice ---------------------------------------------------

test('typed chat: sent cleaned, logged for both sides, counted as unread only when it comes from someone else', () => {
    const { mp, socket } = connectedController();
    const shown = [];
    mp.manager.showChat = (id, text) => shown.push([id, text]);
    assert.equal(mp.sendChat('   '), false, 'nothing to send');
    assert.equal(mp.sendChat('hi\u202E  there\n'), true);
    assert.deepEqual(plain(socket.last('chat')), { type: 'chat', text: 'hi there' });
    assert.equal(mp.chat.at(-1).self, true);
    assert.equal(mp.chatUnread, 0, 'my own message is not unread');
    socket.receive({ type: 'chat', id: 'p1', text: 'hello' });
    socket.receive({ type: 'chat', id: 'ghost', text: 'from nobody' });
    assert.equal(mp.chat.at(-1).name, 'Bo');
    assert.equal(mp.chat.at(-1).text, 'hello');
    assert.equal(mp.chatUnread, 1, 'a message from a guest who is not in the room is dropped');
    assert.deepEqual(plain(shown), [['p1', 'hello']], 'and it shows over the sender\'s head');
    mp.markChatRead();
    assert.equal(mp.chatUnread, 0);
    for (let i = 0; i < 80; i++) socket.receive({ type: 'chat', id: 'p1', text: `m${i}` });
    assert.equal(mp.chat.length, mp.constructor.MAX_CHAT_LOG, 'the log is bounded');
});

test('a new room starts a new conversation, and chat needs a room', () => {
    const { mp, socket, storage } = connectedController();
    socket.receive({ type: 'chat', id: 'p1', text: 'hello' });
    mp.disconnect();
    assert.equal(mp.sendChat('anyone?'), false);
    storage.setItem('vrclub.networkServerUrl', 'wss://relay.example');
    mp.connect({ room: 'other' });
    assert.deepEqual(plain(mp.chat), []);
    assert.equal(mp.chatUnread, 0);
});

test('the music is lowered while my mic is on or someone talks, held briefly, and only if the guest wants it', () => {
    const { mp, club } = connectedController();
    const calls = [];
    club.setVoiceDuck = on => { calls.push(on); return on; };
    let speaking = false;
    mp.manager.anyoneSpeaking = () => speaking;
    mp._updateVoiceDuck(1000);
    assert.equal(calls.at(-1), false);
    speaking = true;
    mp._updateVoiceDuck(1100);
    assert.equal(calls.at(-1), true, 'someone is talking');
    speaking = false;
    mp._updateVoiceDuck(1100 + mp.constructor.DUCK_HOLD_MS - 100);
    assert.equal(calls.at(-1), true, 'held between sentences');
    mp._updateVoiceDuck(1100 + mp.constructor.DUCK_HOLD_MS + 100);
    assert.equal(calls.at(-1), false, 'and released after the hold');
    mp.client.micEnabled = true;
    mp._updateVoiceDuck(5000);
    assert.equal(calls.at(-1), true, 'my own mic is on');
    mp.setDuckForVoice(false);
    assert.equal(calls.at(-1), false, 'switching it off brings the music back at once');
    mp._updateVoiceDuck(6000);
    assert.equal(calls.at(-1), false);
    assert.equal(mp.storage.getItem(mp.constructor.PREFS.duckForVoice), '0');
});

test('leaving the room always brings the music back up', () => {
    const { mp, club } = connectedController();
    const calls = [];
    club.setVoiceDuck = on => { calls.push(on); return on; };
    mp.disconnect();
    assert.equal(calls.at(-1), false);
});

test('the status line speaks plainly, and a private room is named by its code', () => {
    const { mp } = connectedController([], { hostId: 'me' });
    assert.match(mp.statusText(), /nobody else yet/);
    assert.equal(mp.roomLabel('private-482913'), 'private room 482 913');
    assert.equal(mp.roomLabel('lobby'), 'room "lobby"');
    const fresh = makeController();
    assert.equal(fresh.mp.statusText(), 'Not in a room');
});

test('quick phrases fit the VR keyboard-free chat page', () => {
    const { ClubMultiplayer, NetworkClient } = load();
    assert.ok(ClubMultiplayer.QUICK_PHRASES.length <= 10, 'the chat page has ten slots beside BACK and CLOSE');
    for (const phrase of ClubMultiplayer.QUICK_PHRASES) assert.equal(NetworkClient.cleanChat(phrase), phrase);
    for (const emoji of ClubMultiplayer.EMOJI) assert.ok(ClubMultiplayer.EMOJI_NAMES[emoji], `${emoji} has a name`);
});
