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
        Uint8Array, Error, AbortController, performance, WebSocket: FakeSocket, setTimeout: () => 1, clearTimeout: () => {}, setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; }, clearInterval: id => { intervals[id - 1] = null; },
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

test('shared world time uses a monotonic clock, validates the relay shape and corrects authenticated ping replies', () => {
    const { NetworkClient, context } = load();
    let time = 1000;
    context.performance = { now: () => time };
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const socket = welcomed(client, { serverTime: 20000, world: { v: 1, startedAt: 10000, seed: 55 } });
    assert.equal(client.worldTime(), 10);
    time += 2000;
    assert.equal(client.worldTime(), 12);
    client.sendPing();
    const ping = socket.sent.at(-1);
    time += 100;
    socket.receive({ type: 'pong', time: ping.time, serverTime: 22050 });
    assert.equal(client.worldTime(), 12.1);
    socket.receive({ type: 'pong', time: ping.time, serverTime: 999999 });
    assert.equal(client.worldTime(), 12.1, 'duplicate/unsolicited replies cannot change the clock');
    client.disconnect();
    assert.equal(client.worldTime(), null);
    for (const world of [undefined, { v: 2, startedAt: 10000, seed: 55 },
        { v: 1, startedAt: 30000, seed: 55 }, { v: 1, startedAt: 10000, seed: -1 }]) {
        welcomed(client, { serverTime: 20000, world });
        assert.equal(client.worldTime(), null);
        client.disconnect();
    }
});

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

test('host transfer is advertised, host-only, targets a visible person and waits for the relay to change roles', () => {
    const host = connectedController(undefined, { hostTransfer: true });
    assert.equal(host.mp.transferHost('ghost'), false);
    assert.equal(host.mp.transferHost('me'), false);
    assert.equal(host.mp.transferHost('p1'), true);
    assert.deepEqual(host.socket.last('host-transfer'), { type: 'host-transfer', target: 'p1' });
    assert.equal(host.mp.isHost(), true, 'a request alone cannot change authority');
    host.socket.receive({ type: 'host', id: 'p1' });
    assert.equal(host.mp.connected, true);
    assert.equal(host.mp.following, true);
    assert.equal(host.mp.isHost(), false);
    assert.equal(host.mp.transferHost('p1'), false);
    const oldRelay = connectedController();
    assert.equal(oldRelay.mp.transferHost('p1'), false);
    assert.match(oldRelay.mp.lastError, /relay needs an update/);
    assert.ok(!oldRelay.socket.sent.some(message => message.type === 'host-transfer'));
});

test('the VR person page delegates host transfer, confirms a second press, hides it for guests and disables old relays', async () => {
    const { mp, context, window, socket } = connectedController(undefined, { hostTransfer: true });
    context.VRClubAnimationFinish = class {};
    vm.runInContext(readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8'), context);
    const ui = Object.create(window.VRClubUI.prototype);
    ui._multiplayer = () => mp;
    ui.isFollowingHost = () => mp.following;
    ui._refreshVRQuickMenu = () => {};
    ui._showVRQuickMenuPage = () => {};
    ui.showErrorMessage = () => {};
    ui.pulseHaptic = () => {};
    ui._vrPerson = 'p1';
    const common = { back: { action: 'back' }, close: { action: 'close' } };
    const button = ui._vrNetPageDefinitions('person', common).find(item => item.op === 'peerHost');
    assert.ok(button);
    assert.equal(ui._isVRButtonDisabled(button), false);
    await ui._runVRNetworkAction(button);
    assert.ok(!socket.last('host-transfer'), 'one accidental press must not hand over control');
    assert.equal(ui._vrNetPageDefinitions('person', common).find(item => item.op === 'peerHost').label, 'SURE? MAKE HOST');
    await ui._runVRNetworkAction(button);
    assert.equal(socket.last('host-transfer').target, 'p1');
    mp.client.hostTransferSupported = false;
    assert.equal(ui._isVRButtonDisabled(button), true);
    assert.equal(ui._vrNetValue(button), 'UPDATE RELAY');
    socket.receive({ type: 'host', id: 'p1' });
    ui._vrPerson = 'p1';
    assert.ok(!ui._vrNetPageDefinitions('person', common).some(item => item.op === 'peerHost'));
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

class MusicConnection {
    constructor() { this.events = {}; this.senders = []; }
    addEventListener(name, handler) { this.events[name] = handler; }
    addTrack(track, stream) { this.senders.push({ track, stream }); }
    getSenders() { return this.senders; }
    removeTrack(sender) { this.senders = this.senders.filter(item => item !== sender); }
    close() { this.closed = true; }
    async setRemoteDescription(description) { this.remoteDescription = description; }
    async setLocalDescription() { this.localDescription = { type: this.remoteDescription ? 'answer' : 'offer', sdp: 'test' }; }
    async addIceCandidate(candidate) { (this.ice ||= []).push(candidate); }
}

test('local music is host-only, consent-gated and independent of microphone muting', async () => {
    const { client, context, socket } = (() => {
        const env = load();
        const client = new env.NetworkClient({ serverUrl: 'wss://relay.example' });
        const socket = welcomed(client, { peers: [{ id: 'p1', pid: PID_B, name: 'Bo' }] });
        return { ...env, client, socket };
    })();
    context.RTCPeerConnection = MusicConnection;
    const track = { id: 'music' };
    const stream = { getAudioTracks: () => [track] };
    client.setLocalMusic(stream, { playing: true, title: 'Local file' });
    assert.equal(client.peers.get('p1').musicPc, undefined);
    assert.equal(socket.last('rtc-signal').signal.channel, 'music');
    await client._onSignal('p1', { channel: 'music', kind: 'listen', enabled: true });
    const pc = client.peers.get('p1').musicPc;
    assert.equal(pc.senders[0].track, track);
    client.disableVoice();
    assert.equal(pc.closed, undefined);
    assert.equal(pc.senders.length, 1, 'muting cannot remove the music sender');
    await pc.events.negotiationneeded();
    assert.equal(socket.last('rtc-signal').signal.kind, 'offer');
    client.setLocalMusic(null, { playing: false });
    assert.equal(pc.closed, true);
    assert.equal(socket.last('rtc-signal').signal.available, false);
    client.disconnect();
    assert.equal(client.musicStream, null);
});

test('broadcast offers and ICE require consent and the current visible host; ICE before SDP is queued', async () => {
    const env = load();
    env.context.RTCPeerConnection = MusicConnection;
    const client = new env.NetworkClient({ serverUrl: 'wss://relay.example' });
    const socket = welcomed(client, { hostId: 'host', peers: [
        { id: 'host', pid: PID_B }, { id: 'other', pid: 'c'.repeat(16) }
    ] });
    const offer = { channel: 'music', kind: 'offer', sdp: { type: 'offer', sdp: 'test' } };
    await client._onSignal('host', offer);
    assert.equal(client.peers.get('host').musicPc, undefined);
    client.setMusicListening(true);
    await client._onSignal('other', offer);
    assert.equal(client.peers.get('other').musicPc, undefined);
    await client._onSignal('host', { channel: 'music', kind: 'ice', candidate: { candidate: 'early' } });
    const pc = client.peers.get('host').musicPc;
    assert.equal(pc.ice, undefined);
    await client._onSignal('host', offer);
    assert.equal(pc.ice.length, 1);
    assert.equal(socket.last('rtc-signal').signal.kind, 'answer');
    socket.receive({ type: 'host', id: 'other' });
    assert.equal(pc.closed, true);
    assert.equal(client.musicListening, false);
    await client._onSignal('host', offer);
    assert.equal(client.peers.get('host').musicPc, null);
});

test('broadcast metadata uses the existing Listen along surfaces, stops on block and does not enter voice audio', async () => {
    const { mp, club, socket } = connectedController(undefined, { hostId: 'p1' });
    club._ensureAudioContext = () => {};
    club._stopSoundCloudPlayer = () => {};
    const played = [];
    club.startNetworkMusic = stream => { played.push(stream); return { gain: { gain: { value: 1 } } }; };
    club.stopNetworkMusic = remote => { remote.stopped = true; };
    mp.client.onRemoteStream = () => assert.fail('music must not be attached as voice');
    await mp.client._onSignal('p1', { channel: 'music', kind: 'state', available: true, playing: true, title: 'A.wav' });
    assert.match(mp.pendingMusicInfo().origin, /WebRTC.*IP/);
    mp.client.onRemoteMusic('p1', {});
    assert.equal(played.length, 0);
    mp.acceptListenAlong();
    assert.equal(socket.last('rtc-signal').signal.kind, 'listen');
    mp.client.onRemoteMusic('p1', {});
    assert.equal(played.length, 1);
    const remote = mp._remoteMusic;
    await mp.client._onSignal('p1', { channel: 'music', kind: 'state', available: true, playing: false });
    assert.equal(remote.gain.gain.value, 0);
    mp.blockPeer('p1');
    assert.equal(remote.stopped, true);
    assert.equal(mp._remoteMusic, null);
});

test('host audio capture reuses one raw-source destination, keeps pauses available and releases on source switch', () => {
    const { mp, club } = connectedController();
    let captures = 0, stopped = 0, disconnected = 0;
    const stream = { getAudioTracks: () => [], getTracks: () => [{ stop: () => stopped++ }] };
    club.audioContext = { createMediaStreamDestination: () => { captures++; return { stream, disconnect() {} }; } };
    club.audioSource = { connect() {}, disconnect: () => disconnected++ };
    club.audioElement = { paused: false, ended: false };
    club._audioKind = 'file';
    mp.shareLocalMusic();
    club.audioElement.paused = true;
    mp.shareLocalMusic();
    assert.equal(captures, 1);
    assert.equal(mp.client.musicState.available, true);
    assert.equal(mp.client.musicState.playing, false);
    club._audioKind = 'stream';
    mp.shareLocalMusic();
    assert.equal(stopped, 1);
    assert.equal(disconnected, 1);
    assert.equal(mp.client.musicState.available, false);
});

test('host handover clears the old broadcast and requires new consent even when the guest still follows a host', async () => {
    const { mp, club, socket } = connectedController([
        { id: 'p1', pid: PID_B }, { id: 'p2', pid: 'c'.repeat(16) }
    ], { hostId: 'p1' });
    club._ensureAudioContext = () => {};
    club._stopSoundCloudPlayer = () => {};
    club.startNetworkMusic = () => ({ gain: { gain: { value: 1 } } });
    club.stopNetworkMusic = remote => { remote.stopped = true; };
    await mp.client._onSignal('p1', { channel: 'music', kind: 'state', available: true, playing: true });
    mp.acceptListenAlong();
    mp.client.onRemoteMusic('p1', {});
    const remote = mp._remoteMusic;
    socket.receive({ type: 'host', id: 'p2' });
    assert.equal(mp.following, true);
    assert.equal(remote.stopped, true);
    assert.equal(mp.listenAlong, false);
    assert.equal(mp._broadcastState, null);
    await mp.client._onSignal('p1', { channel: 'music', kind: 'state', available: true, playing: true });
    assert.equal(mp.pendingMusic, null, 'old host cannot announce a broadcast');
    await mp.client._onSignal('p2', { channel: 'music', kind: 'state', available: true, playing: true });
    assert.equal(mp.pendingMusic.broadcast, true);
});

test('a late joiner is offered the paused local file immediately, without starting a music connection', () => {
    const { mp, club, socket } = connectedController([]);
    const stream = { getAudioTracks: () => [], getTracks: () => [] };
    club.audioContext = { createMediaStreamDestination: () => ({ stream, disconnect() {} }) };
    club.audioSource = { connect() {}, disconnect() {} };
    club.audioElement = { paused: true, ended: false };
    club._audioKind = 'file';
    club.nowPlayingLabel = 'Paused local file';
    socket.receive({ type: 'join', id: 'p1', pid: PID_B });
    const message = socket.last('rtc-signal');
    assert.equal(message.target, 'p1');
    assert.equal(message.signal.available, true);
    assert.equal(message.signal.playing, false);
    assert.equal(message.signal.title, 'Paused local file');
    assert.equal(mp.client.peers.get('p1').musicPc, undefined);
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

test('every host music source requires consent and the host clock uses the measured offset', async () => {
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
    assert.equal(started.length, 0, 'even a historical podcast source needs consent');
    mp.listenAlong = true;
    mp._applyMusic(mp.pendingMusic);
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(plain(started), [['https://mcdn.podbean.com/ep.mp3', true]]);
    assert.ok(Math.abs(el.currentTime - 110) < 1, `the guest joined at ${el.currentTime}s instead of 110s`);
    assert.equal(club.nowPlayingLabel, 'Colourizon 168');
    assert.equal(club.dj, undefined, 'music does not change the local generic DJ');
    assert.equal(mp.pendingMusicInfo(), null);
    mp.listenAlong = false;

    socket.receive({ type: 'music', url: 'https://unknown.example/live.mp3', playing: true, position: 0, updatedAt: Date.now() + 5000 });
    assert.equal(plain(started).length, 1);
    assert.equal(mp.pendingMusicInfo().origin, 'unknown.example');

    // A look-alike path on someone else's host is not the club's relay.
    socket.receive({ type: 'music', url: 'https://evil.example/podcast/colourizon/stream/a.mp3', playing: true, position: 0, updatedAt: Date.now() + 5000 });
    assert.equal(plain(started).length, 1);
});

test('the track position follows the host: a drift of a second is corrected, a small one is left alone, a live stream is never sought', async () => {
    const { mp, club, socket } = connectedController(undefined, { hostId: 'p1' });
    mp.listenAlong = true;
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
    assert.deepEqual(Object.keys(listeners).sort(), ['emptied', 'ended', 'loadeddata', 'pause', 'play', 'seeked']);
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

test('room browser is opt-in, queries only saved private codes on this relay, and filters private public results', async () => {
    const { mp, context } = makeController();
    const relay = 'wss://relay.example';
    assert.equal(mp.roomDirectory.loaded, false);
    assert.equal(mp.savePrivateRoom('123456', relay), true);
    assert.equal(mp.savePrivateRoom('654321', 'wss://another.example'), true);
    const requests = [];
    context.fetch = async (url, options) => {
        requests.push({ url, options });
        return Response.json(url.includes('/status') ? {
            rooms: [{ room: 'private-123456', people: 3, capacity: 8, active: true, locked: false },
                { room: 'private-unrequested', people: 1, capacity: 8, active: true, locked: false }]
        } : { rooms: [
            { room: 'lobby', people: 2, capacity: 8, active: true, locked: false },
            { room: 'private-leaked', people: 2, capacity: 8, active: true, locked: false }
        ], next: null });
    };
    await mp.refreshRooms({ serverUrl: relay });
    assert.deepEqual(JSON.parse(requests[1].options.body), { rooms: ['private-123456'] });
    assert.equal(requests[0].url, 'https://relay.example/rooms');
    assert.ok(requests.every(entry => entry.options.credentials === 'omit'));
    assert.deepEqual(Array.from(mp.directoryRooms(), item => item.room), ['lobby', 'private-123456']);
    mp.forgetPrivateRoom('private-123456');
    assert.equal(mp.savedPrivateRooms(relay).length, 0);
    assert.equal(mp.savedPrivateRooms('wss://another.example').length, 1);
    assert.equal(mp.roomDirectory.privateRooms.length, 0);
});

test('listed joins respect capacity and locks, retain the selected relay/name and remember private connections', async () => {
    const { mp, context } = makeController();
    context.fetch = async () => Response.json({ rooms: [
        { room: 'lobby', people: 2, capacity: 8, active: true, locked: false },
        { room: 'full', people: 8, capacity: 8, active: true, locked: false },
        { room: 'locked', people: 1, capacity: 8, active: true, locked: true }
    ], next: null });
    await mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    for (const name of ['full', 'locked', 'not-listed']) assert.equal(mp.joinListedRoom(name), false);
    assert.equal(mp.joinListedRoom('lobby', { name: 'New name' }), true);
    const url = new URL(FakeSocket.instances.at(-1).url);
    assert.equal(url.host, 'relay.example');
    assert.equal(url.searchParams.get('name'), 'New name');
    mp.disconnect();
    assert.equal(mp.joinRoom('123456'), true);
    FakeSocket.instances.at(-1).receive({ type: 'welcome', id: 'me', hostId: 'me', peers: [] });
    assert.equal(mp.savedPrivateRooms('wss://relay.example')[0].room, 'private-123456');
    mp.disconnect();
    assert.equal(mp.savedPrivateRooms('wss://relay.example')[0].room, 'private-123456', 'an empty private room remains bookmarked');
});

test('room browser pagination merges results, validates responses and surfaces offline/storage errors', async () => {
    const { mp, context, storage } = makeController();
    const entry = room => ({ room, people: 1, capacity: 8, active: true, locked: false });
    const requests = [];
    context.fetch = async url => {
        requests.push(url);
        return Response.json(url.includes('after=') ? { rooms: [entry('alpha'), entry('beta')], next: null }
            : { rooms: [entry('alpha')], next: 'alpha' });
    };
    await mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    await mp.refreshRooms({ serverUrl: 'wss://relay.example', more: true });
    assert.match(requests[1], /after=alpha/);
    assert.deepEqual(Array.from(mp.directoryRooms(), item => item.room), ['alpha', 'beta']);
    context.fetch = async () => Response.json({ rooms: [entry('bad\nname')] });
    await mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    assert.match(mp.roomDirectory.error, /invalid room/);
    context.fetch = async () => { throw new Error('Offline fixture'); };
    await mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    assert.match(mp.roomDirectory.error, /Offline/);
    storage.setItem('vrclub.privateRooms', 'bad json');
    context.fetch = async () => Response.json({ rooms: [], next: null });
    await mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    assert.match(mp.roomDirectory.error, /could not be read/);
    assert.equal(mp.savePrivateRoom('private-bad\ncode', 'wss://relay.example'), false);
    assert.equal(mp.savePrivateRoom('123456', 'wss://user:password@relay.example'), false);
});

test('disposing the multiplayer controller aborts an outstanding room lookup', async () => {
    const { mp, context } = makeController();
    let signal;
    context.fetch = (_url, options) => new Promise((_resolve, reject) => {
        signal = options.signal;
        signal.addEventListener('abort', () => reject(new Error('Aborted fixture')));
    });
    const lookup = mp.refreshRooms({ serverUrl: 'wss://relay.example' });
    mp.dispose();
    await lookup;
    assert.equal(signal.aborted, true);
    assert.equal(mp.roomDirectory.loading, false);
});

test('every room-browser page fits all twelve VR slots including navigation and close', () => {
    const { mp, context, window } = makeController();
    context.VRClubAnimationFinish = class {};
    vm.runInContext(readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8'), context);
    const ui = Object.create(window.VRClubUI.prototype);
    ui._multiplayer = () => mp;
    const common = { back: { action: 'back' }, close: { action: 'close' } };
    for (let count = 0; count < 64; count++) {
        mp.roomDirectory.publicRooms = Array.from({ length: count }, (_, i) => ({
            room: 'room-' + i, people: 1, capacity: 8, active: true, locked: false
        }));
        mp.roomDirectory.next = 'next';
        for (let page = 0; page <= Math.ceil(count / 5); page++) {
            ui._vrRoomsPage = page;
            const buttons = ui._vrNetPageDefinitions('rooms', common);
            assert.ok(buttons.length <= 12, `count=${count}, page=${page}`);
            assert.equal(buttons.at(-1).action, 'close');
            assert.equal(buttons.at(-2).action, 'back');
        }
    }
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

test('host music updates change the title but never select an artist DJ', () => {
    const { mp, club, socket, window } = connectedController(undefined, { hostId: 'p1' });
    mp.listenAlong = true;
    const djs = [];
    club.setDJ = id => { djs.push(id); return Promise.resolve(true); };
    // Like the real catalogue, an unknown id falls back to the default podcast (whose id differs from the one asked for).
    window.Podcasts = { get: id => (id === 'colourizon' ? { id, dj: 'melera' } : { id: 'resident', dj: 'hernan' }) };
    const url = 'https://mcdn.podbean.com/ep.mp3';
    club.audioElement = { src: url, paused: false, duration: 3000, currentTime: 50, play() { return Promise.resolve(); }, pause() { this.paused = true; } };
    const frame = (podcast, extra = {}) => ({ type: 'music', url, playing: true, position: 50, updatedAt: mp.client.serverNow(), podcast, title: `Episode of ${podcast}`, ...extra });
    socket.receive(frame('colourizon'));
    assert.deepEqual([...djs], [], 'host metadata cannot change the local DJ');
    assert.equal(club.nowPlayingLabel, 'Episode of colourizon');
    socket.receive(frame('resident', { playing: false }));
    assert.deepEqual([...djs], [], 'a paused host cannot change the DJ');
    socket.receive(frame('../nope'));
    socket.receive({ ...frame(null), podcast: null });
    assert.equal(djs.length, 0, 'an unknown or missing podcast leaves the DJ alone');
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
    assert.match(told.at(-1), /You are now the host\. Pick some music/);

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

test('chat and microphone audiences are independent and restricted chat fails closed on old relays', () => {
    const { mp, socket, club } = connectedController([
        { id: 'p1', pid: PID_B, name: 'Bo' }, { id: 'p2', pid: 'c'.repeat(16), name: 'Cy' }
    ], { targetedChat: true });
    const errors = [];
    club.showErrorMessage = message => errors.push(message);
    mp.setAudience('chat', ['p1', 'p1', 'missing']);
    mp.setAudience('voice', ['p2']);
    assert.equal(mp.audienceLabel('chat'), 'Bo');
    assert.equal(mp.audienceLabel('voice'), 'Cy');
    assert.equal(mp.sendChat('hi'), true);
    assert.deepEqual(socket.last('chat'), { type: 'chat', text: 'hi', targets: ['p1'] });
    assert.equal(mp.chat.at(-1).restricted, true);
    assert.equal(mp.chat.at(-1).audience, 'Bo');
    socket.receive({ type: 'chat', id: 'p2', text: 'reply', restricted: true });
    assert.equal(mp.chat.at(-1).restricted, true);
    assert.deepEqual(mp.manager.calls.at(-1), ['chat', 'p2', '[Selected recipients] reply']);
    mp.setAudience('chat', []);
    assert.equal(mp.sendChat('empty'), false);
    assert.equal(socket.last('chat').text, 'hi');
    mp.toggleAudiencePeer('chat', 'p2');
    mp.client.targetedChat = false;
    assert.equal(mp.sendChat('old relay'), false);
    assert.match(errors.at(-1), /relay needs an update/);
    assert.equal(socket.last('chat').text, 'hi');
    mp.setAudience('chat', null);
    assert.equal(mp.sendChat('public'), true);
    assert.deepEqual(socket.last('chat'), { type: 'chat', text: 'public' });
    assert.deepEqual(plain(mp.voiceAudience), ['p2']);
});

test('departure, reconnect and room changes never broaden a restricted audience', () => {
    const { mp, socket, club } = connectedController(undefined, { targetedChat: true });
    club.showErrorMessage = () => {};
    mp.setAudience('chat', ['p1']);
    mp.setAudience('voice', ['p1']);
    socket.receive({ type: 'leave', id: 'p1' });
    assert.deepEqual(plain(mp.chatAudience), []);
    assert.deepEqual(plain(mp.voiceAudience), []);
    assert.equal(mp.sendChat('nobody'), false);
    socket.receive({ type: 'join', id: 'new', name: 'Bo', pid: PID_B });
    assert.equal(mp.client.voiceAudience.has('new'), false);
    mp.setAudience('chat', ['new']);
    mp.setAudience('voice', ['new']);
    socket.close(1006);
    assert.equal(mp.chatAudience.length, 0);
    assert.equal(mp.voiceAudience.length, 0);
    mp.disconnect();
    mp.connect({ room: 'another' });
    assert.equal(mp.chatAudience.length, 0);
    assert.equal(mp.client.voiceAudience.size, 0);
});

test('a failed microphone restriction closes that voice connection and reports the error without touching music', async () => {
    const { NetworkClient } = load();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    welcomed(client, { peers: [{ id: 'p1', name: 'Bo' }] });
    const sender = { track: {}, replaceTrack: async () => { throw new Error('replacement failed'); } };
    const pc = { getSenders: () => [sender], close() { this.closed = true; } };
    const musicPc = {};
    Object.assign(client.peers.get('p1'), { pc, musicPc });
    const errors = [];
    client.onError = error => errors.push(error.message);
    client.setVoiceAudience([]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pc.closed, true);
    assert.equal(client.peers.get('p1').pc, null);
    assert.equal(client.peers.get('p1').musicPc, musicPc);
    assert.match(errors[0], /Could not update microphone recipients: replacement failed/);
});

test('microphone tracks follow recipients before capture, through late joins and changes without closing incoming voice or music', async () => {
    const { NetworkClient, context } = load();
    class VoiceConnection {
        constructor() { this.senders = []; this.closed = false; }
        addEventListener() {}
        addTrack(track) {
            const sender = { track, replaceTrack: async next => { sender.track = next; } };
            this.senders.push(sender);
            return sender;
        }
        getSenders() { return this.senders; }
        removeTrack(sender) { sender.track = null; }
        close() { this.closed = true; }
    }
    context.RTCPeerConnection = VoiceConnection;
    const track = { stop() {} };
    context.navigator = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } };
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const socket = welcomed(client, { peers: [{ id: 'p1', name: 'Bo' }, { id: 'p2', name: 'Cy' }] });
    client.setVoiceAudience(['p1']);
    await client.enableVoice();
    const sending = id => !!client.peers.get(id).pc?.getSenders().some(s => s.track);
    assert.equal(sending('p1'), true);
    assert.equal(sending('p2'), false);
    socket.receive({ type: 'join', id: 'p3', name: 'Dee' });
    assert.equal(sending('p3'), false);
    const incoming = client._createPeerConnection('p2');
    const music = { sentinel: true };
    client.peers.get('p1').musicPc = music;
    const first = client.peers.get('p1').pc;
    client.setVoiceAudience(['p2']);
    assert.equal(sending('p1'), false);
    assert.equal(first.closed, false);
    assert.equal(sending('p2'), true);
    assert.equal(client.peers.get('p2').pc, incoming);
    assert.equal(client.peers.get('p1').musicPc, music);
    client.setVoiceAudience([]);
    for (const id of client.peers.keys()) assert.equal(sending(id), false);
    assert.equal(client.micEnabled, true, 'capture remains available for a later recipient');
    client.setVoiceAudience(null);
    for (const id of client.peers.keys()) assert.equal(sending(id), true);
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
