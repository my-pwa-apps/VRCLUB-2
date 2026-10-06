// Behavioural unit tests.
//
// These EXECUTE first-party code in a VM with a minimal BABYLON stub. A previous
// version of this file was mostly `assert.match(readFileSync(...), /some regex/)`,
// which is a change detector: it cannot catch an off-by-one or an inverted branch,
// but it does fail whenever someone renames a parameter. Those were removed; what
// remains either runs the code or asserts a genuine cross-file invariant that
// nothing else can enforce.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Minimal BABYLON surface: enough for the pure logic under test. */
function makeBabylonStub() {
    class Color3 {
        constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
        set(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
        copyFrom(o) { return this.set(o.r, o.g, o.b); }
        copyFromFloats(r, g, b) { return this.set(r, g, b); }
        scale(f) { return new Color3(this.r * f, this.g * f, this.b * f); }
        scaleToRef(f, out) { return out.set(this.r * f, this.g * f, this.b * f); }
        clone() { return new Color3(this.r, this.g, this.b); }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    }
    // Used by the hue-cycling LED patterns.
    Color3.HSVtoRGBToRef = (h, s, v, out) => {
        const c = v * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        const m = v - c;
        const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
            : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
        return out.set(r + m, g + m, b + m);
    };
    return { Color3, Vector3, Material: { MATERIAL_OPAQUE: 0 } };
}

function loadClassic(relativePath, globals = {}) {
    const window = {};
    const context = vm.createContext({
        window,
        console,
        URL,
        Map,
        Set,
        Promise,
        Math,
        JSON,
        Object,
        Array,
        Number,
        String,
        performance: { now: () => 0 },
        ...globals
    });
    window.window = window;
    window.location = { href: 'https://vrclub.example/', protocol: 'https:' };
    vm.runInContext(readFileSync(join(ROOT, relativePath), 'utf8'), context, { filename: relativePath });
    return { window, context };
}

// ---------------------------------------------------------------------------
// Security boundary
// ---------------------------------------------------------------------------

test('multiplayer defaults to the hosted relay and migrates legacy local URLs', () => {
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const start = source.indexOf('function defaultNetworkServerUrl()');
    const end = source.indexOf('function initNetworkMenu()', start);
    const hosted = 'wss://vrclub-network.garfieldapp.workers.dev';
    for (const stored of [null, '', 'ws://localhost:8787', 'ws://127.0.0.1:8787/',
        'ws://[::1]:8787', 'wss://custom.example', 'invalid']) {
        let saved = stored;
        const context = vm.createContext({ URL, NETWORK_PREFS: { serverUrl: 'relay' },
            localStorage: { getItem: () => saved, setItem: (key, value) => { saved = value; } } });
        vm.runInContext(source.slice(start, end), context);
        const expected = stored === 'wss://custom.example' ? stored : hosted;
        assert.equal(vm.runInContext('defaultNetworkServerUrl()', context), expected);
        if (stored?.startsWith('ws:')) assert.equal(saved, hosted);
    }
    const context = vm.createContext({ URL, NETWORK_PREFS: { serverUrl: 'relay' },
        localStorage: { getItem() { throw new Error('Storage unavailable'); } } });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(vm.runInContext('defaultNetworkServerUrl()', context), hosted);
});

test('keyboard shortcuts leave focused buttons to native Space activation but still control scene audio', async () => {
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const start = source.indexOf('function initKeyboardShortcuts()');
    const end = source.indexOf('// =============================================================================\n// AUDIO MENU', start);
    const listeners = {};
    const audio = {
        paused: true,
        playCalls: 0,
        pauseCalls: 0,
        play() { this.paused = false; this.playCalls++; return Promise.resolve(); },
        pause() { this.paused = true; this.pauseCalls++; }
    };
    const context = vm.createContext({
        Promise,
        document: {
            addEventListener(type, handler) { listeners[type] = handler; },
            removeEventListener() {}
        },
        uiTeardowns: [],
        vrClubInstance: { audioElement: audio, moveCameraToPreset() {} },
        vjMacros: {}
    });
    vm.runInContext(source.slice(start, end), context);
    vm.runInContext('initKeyboardShortcuts()', context);
    const onKey = listeners.keydown;
    assert.equal(typeof onKey, 'function', 'keydown shortcut handler was not registered');

    let prevented = false;
    onKey({
        key: ' ',
        target: { tagName: 'BUTTON' },
        defaultPrevented: false,
        ctrlKey: false, metaKey: false, altKey: false,
        preventDefault() { prevented = true; }
    });
    assert.equal(prevented, false, 'Space on a focused button should keep the button\'s native activation');
    assert.equal(audio.playCalls, 0, 'focused button Space unexpectedly toggled audio');

    onKey({
        key: ' ',
        target: { tagName: 'DIV', closest() { return null; } },
        defaultPrevented: false,
        ctrlKey: false, metaKey: false, altKey: false,
        preventDefault() { prevented = true; }
    });
    await Promise.resolve();
    assert.equal(prevented, true, 'scene-focused Space should still be claimed by the audio shortcut');
    assert.equal(audio.playCalls, 1);

    onKey({
        key: ' ',
        target: { tagName: 'DIV', closest() { return null; } },
        defaultPrevented: true,
        ctrlKey: false, metaKey: false, altKey: false,
        preventDefault() { assert.fail('default-prevented keys must be ignored'); }
    });
    assert.equal(audio.pauseCalls, 0, 'a default-prevented Space should not pause audio');
});

test('the audio menu exposes a separate ambience slider and labels both ranges by scope', () => {
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const start = source.indexOf('function initAudioMenu()');
    const end = source.indexOf('// =============================================================================\n// MULTIPLAYER', start);
    const makeEl = () => ({
        value: '',
        textContent: '',
        className: '',
        style: {},
        dataset: {},
        attributes: {},
        listeners: {},
        files: [],
        classList: {
            add() {},
            remove() {},
            contains() { return false; },
            toggle() { return false; }
        },
        addEventListener(type, handler) { this.listeners[type] = handler; },
        removeEventListener(type) { delete this.listeners[type]; },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        focus() {},
        querySelector() { return null; },
        setCustomValidity() {},
        reportValidity() { return true; }
    });
    const elements = Object.fromEntries([
        'audioToggle', 'audioMenu', 'audioMinimize', 'audioClose', 'streamUrl',
        'playStreamBtn', 'playStreamBtnLabel', 'audioFileInput', 'audioFileName',
        'audioStatus', 'audioMenuTitle', 'audioNowPlaying', 'audioVolume',
        'audioVolumeValue', 'crowdAmbience', 'crowdAmbienceValue'
    ].map(id => [id, makeEl()]));
    elements.audioToggle.attributes['aria-expanded'] = 'false';
    elements.audioVolume.value = '1';
    elements.crowdAmbience.value = '1';

    const calls = [];
    const context = vm.createContext({
        Promise,
        document: {
            getElementById(id) { return elements[id] || null; },
            addEventListener() {},
            removeEventListener() {}
        },
        window: { addEventListener() {}, removeEventListener() {} },
        navigator: { onLine: true },
        uiTeardowns: [],
        entryNowPlaying: '',
        uiLog: { info() {}, warn() {} },
        rememberedStreamUrl: () => '',
        UI_TIMING: { statusMs: 3000 },
        AudioUtils: { isResidentEpisodeUrl: () => false },
        localStorage: { setItem() {} },
        setTimeout() { return 1; },
        clearTimeout() {},
        vrClubInstance: {
            _audioVolume: 0.6,
            audioElement: null,
            scene: null,
            _isSafeAudioUrl() { return true; },
            setAudioVolume(value) { calls.push(['music', value]); },
            getCrowdAmbienceLevel() { calls.push(['getAmbience']); return 0.25; },
            setCrowdAmbienceLevel(value) { calls.push(['ambience', value]); }
        }
    });
    vm.runInContext(source.slice(start, end), context);
    vm.runInContext('initAudioMenu()', context);

    assert.equal(elements.audioVolumeValue.textContent, '60%');
    assert.equal(elements.audioVolume.attributes['aria-valuetext'], '60%');
    assert.equal(elements.crowdAmbience.value, '0.25');
    assert.equal(elements.crowdAmbienceValue.textContent, '25%');
    assert.equal(elements.crowdAmbience.attributes['aria-valuetext'], '25%');
    assert.deepEqual(calls.slice(0, 2), [['getAmbience'], ['ambience', 0.25]],
        'the ambience slider should initialize from the club preference and push it back to the instance');

    elements.audioVolume.listeners.input({ target: { value: '0.4' } });
    elements.crowdAmbience.listeners.input({ target: { value: '0.1' } });
    assert.deepEqual(calls.slice(-2), [['music', 0.4], ['ambience', 0.1]]);
    assert.equal(elements.audioVolumeValue.textContent, '40%');
    assert.equal(elements.crowdAmbienceValue.textContent, '10%');
});

test('multiplayer stops initial failures and bounds cancellable reconnects', () => {
    const sockets = [];
    const timers = new Map();
    let timerId = 0;
    class FakeSocket {
        constructor() { this.listeners = {}; sockets.push(this); }
        addEventListener(event, handler) { this.listeners[event] = handler; }
        close() { this.listeners.close(); }
        welcome() { this.listeners.message({ data: JSON.stringify({ type: 'welcome', id: 'self', peers: [] }) }); }
    }
    const { window } = loadClassic('js/networkClient.js', {
        WebSocket: FakeSocket,
        setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    const client = new window.NetworkClient({ serverUrl: 'ws://localhost:8787' });
    const errors = [];
    client.onError = error => errors.push(error.message);
    client.connect();
    sockets.at(-1).close();
    assert.equal(client.status, 'error');
    assert.equal(timers.size, 0);
    assert.match(errors[0], /Start the relay/);
    client.connect();
    sockets.at(-1).welcome();
    sockets.at(-1).close();
    assert.equal(client.status, 'connecting');
    for (let attempt = 0; attempt < 3; attempt++) {
        assert.equal(timers.size, 1);
        const callback = timers.values().next().value;
        timers.clear();
        callback();
        sockets.at(-1).close();
    }
    assert.equal(client.status, 'error');
    assert.equal(timers.size, 0);
    client.connect();
    const oldSocket = sockets.at(-1);
    client.disconnect();
    client.connect();
    oldSocket.welcome();
    oldSocket.close();
    assert.equal(client.status, 'connecting');
    assert.equal(client.ws, sockets.at(-1));
    sockets.at(-1).welcome();
    sockets.at(-1).close();
    client.disconnect();
    assert.equal(timers.size, 0);
    assert.equal(client.status, 'disconnected');
});

// Two NetworkClients joined through an in-memory relay, with a fake
// RTCPeerConnection that models offer/answer signalling states and fires
// `negotiationneeded` when tracks change (as browsers do).
function createMultiplayerHarness() {
    class FakeSocket {
        static OPEN = 1;
        constructor() { this.listeners = {}; this.readyState = 1; this.sent = []; }
        addEventListener(event, handler) { this.listeners[event] = handler; }
        send(data) { this.sent.push(JSON.parse(data)); relayFrom(this, JSON.parse(data)); }
        close() { this.readyState = 3; this.listeners.close?.({ code: 1000 }); }
        deliver(msg) { this.listeners.message({ data: JSON.stringify(msg) }); }
    }
    class FakePC {
        constructor() { this.listeners = {}; this.senders = []; this.signalingState = 'stable'; this.localDescription = null; this.remoteDescription = null; }
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
        fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
        getSenders() { return this.senders; }
        addTrack(track) { this.senders.push({ track }); queueMicrotask(() => this.fire('negotiationneeded')); }
        removeTrack(sender) { sender.track = null; queueMicrotask(() => this.fire('negotiationneeded')); }
        async setLocalDescription() {
            const type = this.signalingState === 'have-remote-offer' ? 'answer' : 'offer';
            this.localDescription = { type, sdp: `${type}:${this.senders.filter(s => s.track).length}` };
            this.signalingState = type === 'offer' ? 'have-local-offer' : 'stable';
        }
        async setRemoteDescription(description) {
            this.remoteDescription = description;
            this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
        }
        async addIceCandidate() {}
        close() { this.closed = true; }
    }
    const sockets = new Map();
    function relayFrom(socket, msg) {
        if (msg.type !== 'rtc-signal') return;
        const from = [...sockets].find(([, s]) => s === socket)[0];
        sockets.get(msg.target)?.deliver({ type: 'rtc-signal', from, signal: msg.signal });
    }
    const navigatorStub = { mediaDevices: { getUserMedia: async () => {
        const track = { stop() { this.stopped = true; } };
        return { getTracks: () => [track] };
    } } };
    const { window } = loadClassic('js/networkClient.js', {
        WebSocket: FakeSocket,
        RTCPeerConnection: FakePC,
        queueMicrotask,
        setTimeout, clearTimeout,
        navigator: navigatorStub
    });
    const join = (id, peers) => {
        const client = new window.NetworkClient({ serverUrl: 'wss://relay.example' });
        client.connect();
        sockets.set(id, client.ws);
        client.ws.deliver({ type: 'welcome', id, hostId: 'a', peers: peers.map(p => ({ id: p, name: p, state: null })) });
        for (const [otherId, socket] of sockets) {
            if (otherId !== id) socket.deliver({ type: 'join', id, name: id });
        }
        return client;
    };
    const settle = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
    return { window, join, settle, navigatorStub };
}

test('voice negotiates whichever guest enables the mic first, and renegotiates a later mic', async () => {
    const { join, settle } = createMultiplayerHarness();
    const a = join('a', []);
    const b = join('b', ['a']);

    // The HIGHER id enables the mic first. Previously only the lower id ever offered,
    // so this guest was never heard.
    await b.enableVoice();
    await settle();
    const aPc = a.peers.get('b').pc;
    const bPc = b.peers.get('a').pc;
    assert.ok(aPc, 'the listener must receive an offer and create a connection');
    assert.equal(aPc.remoteDescription.type, 'offer');
    assert.equal(bPc.remoteDescription.type, 'answer');
    assert.equal(bPc.signalingState, 'stable');

    // The listener enables the mic afterwards: its existing receive-only connection
    // must be renegotiated with the new track.
    await a.enableVoice();
    await settle();
    assert.equal(bPc.remoteDescription.type, 'offer');
    assert.equal(bPc.remoteDescription.sdp, 'offer:1');
    assert.equal(aPc.signalingState, 'stable');

    // Muting stops sending but keeps the connection so the guest still hears others.
    b.disableVoice();
    await settle();
    assert.equal(b.peers.get('a').pc, bPc);
    assert.equal(bPc.closed, undefined);
});

test('a dropped relay socket reports every peer as gone and shared music never carries local URLs', () => {
    const { join } = createMultiplayerHarness();
    const a = join('a', []);
    join('b', ['a']);
    const left = [];
    a.onPeerLeave = id => left.push(id);
    a.onError = () => {};
    assert.equal(a.peerCount, 1);
    a.ws.close();
    assert.deepEqual(left, ['b']);
    assert.equal(a.peerCount, 0);

    const host = join('a2', []);
    host.hostId = host.selfId;
    const sent = () => host.ws.sent.filter(msg => msg.type === 'music');
    assert.equal(host.sendMusic({ url: 'blob:https://club.example/1', playing: true, position: 0 }), false);
    assert.equal(host.sendMusic({ url: 'data:audio/wav;base64,AA', playing: true, position: 0 }), false);
    assert.equal(sent().length, 0);
    assert.equal(host.sendMusic({ url: 'https://radio.example/live', playing: true, position: 0 }), true);
    assert.equal(sent().length, 1);
    host.hostId = 'someone-else';
    assert.equal(host.sendMusic({ url: 'https://radio.example/live', playing: true, position: 0 }), false);
});

test('the relay close codes stop reconnecting and explain why', () => {
    const { window } = createMultiplayerHarness();
    const client = new window.NetworkClient({ serverUrl: 'wss://relay.example' });
    const errors = [];
    client.onError = error => errors.push(error.message);
    client.connect();
    client.ws.listeners.message({ data: JSON.stringify({ type: 'welcome', id: 'x', peers: [] }) });
    client.ws.listeners.close({ code: window.NetworkClient.CLOSE_ROOM_FULL });
    assert.equal(client.status, 'error');
    assert.match(errors[0], /room is full/);
    assert.equal(client._reconnectTimer, null);
});

test('a terminal relay close releases the mic and a double click never leaks a capture', async () => {
    const stops = [];
    let resolveMic;
    const { window, navigatorStub } = createMultiplayerHarness();
    const client = new window.NetworkClient({ serverUrl: 'wss://relay.example' });
    client.onError = () => {};
    client.connect();
    client.ws.deliver({ type: 'welcome', id: 'x', hostId: 'x', peers: [] });

    const track = () => { const t = { stop() { stops.push(t); } }; return t; };
    const gum = [];
    navigatorStub.mediaDevices.getUserMedia = () => new Promise(resolve => { gum.push(1); resolveMic = resolve; });

    // Two clicks while the permission prompt is open: one request, one stream.
    const first = client.enableVoice();
    const second = client.enableVoice();
    assert.equal(gum.length, 1, 'a second click opened a second capture');
    const t1 = track();
    resolveMic({ getTracks: () => [t1] });
    await Promise.all([first, second]);
    assert.equal(client.micEnabled, true);

    client.ws.listeners.close({ code: window.NetworkClient.CLOSE_FLOODING });
    assert.equal(client.status, 'error');
    assert.equal(client.micEnabled, false, 'the mic stayed enabled after a terminal close');
    assert.deepEqual(stops, [t1], 'the capture track was not stopped');

    // Muted while the prompt was still open: the late stream is stopped at once.
    const late = client.enableVoice();
    client.disableVoice();
    const t2 = track();
    resolveMic({ getTracks: () => [t2] });
    await late;
    assert.equal(client.micEnabled, false);
    assert.ok(stops.includes(t2), 'a stream granted after mute kept capturing');
});

test('state for an id never announced by welcome or join creates no avatar', () => {
    const { join } = createMultiplayerHarness();
    const a = join('a', []);
    const seen = [];
    a.onPeerState = id => seen.push(id);
    a.ws.deliver({ type: 'state', id: 'ghost', state: { x: 0, y: 1.6, z: 0, rotY: 0 } });
    assert.deepEqual(seen, []);
    join('b', ['a']);
    a.ws.deliver({ type: 'state', id: 'b', state: { x: 0, y: 1.6, z: 0, rotY: 0 } });
    assert.deepEqual(seen, ['b']);
});

function loadAvatarManager() {
    class Node3 { constructor() { this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.rotation = { y: 0 }; } dispose() { this.disposed = true; } }
    const created = [];
    const BABYLON = {
        TransformNode: Node3,
        MeshBuilder: {
            CreateCapsule: () => new Node3(),
            CreateSphere: () => new Node3(),
            CreatePlane: () => { const m = new Node3(); created.push(m); return m; }
        },
        Mesh: { BILLBOARDMODE_ALL: 7 },
        DynamicTexture: class { getContext() { return { clearRect() {}, fillRect() {}, fillText() {} }; } getSize() { return { width: 256, height: 64 }; } update() {} dispose() {} },
        StandardMaterial: class { dispose() {} },
        Color3: class { constructor(r, g, b) { Object.assign(this, { r, g, b }); } }
    };
    let now = 0;
    const { window } = loadClassic('js/avatarManager.js', {
        BABYLON, performance: { now: () => now },
        AudioUtils: loadClassic('js/audioUtils.js').window.AudioUtils
    });
    const manager = new window.AvatarManager({ scene: {}, materialFactory: null });
    return { manager, AvatarManager: window.AvatarManager, created, advance: ms => { now += ms; } };
}

test('remote avatars stand on the floor under the sender eye and snap on their first sample', () => {
    const { manager, AvatarManager } = loadAvatarManager();
    manager.updatePeerState('p', 'Pat', { x: 3, y: 1.7, z: -12, rotY: 0.5 });
    const peer = manager.remotes.get('p');
    assert.equal(peer.root.position.y, 0, 'a standing guest (eye 1.7 m) must have feet at y = 0');
    assert.equal(peer.root.position.x, 3);
    assert.equal(peer.root.rotation.y, 0.5);
    assert.equal(peer.root.position.y + AvatarManager.EYE_HEIGHT, 1.7);

    // Booth riser: eye 2.65 m -> feet on the 0.95 m platform.
    manager.updatePeerState('p', null, { x: 0, y: 2.65, z: -18, rotY: 0 });
    for (let i = 0; i < 600; i++) manager.update(1 / 72);
    assert.ok(Math.abs(peer.root.position.y - 0.95) < 1e-6);
    manager.updatePeerState('p', null, { x: NaN, y: Infinity, z: 0, rotY: 0 });
    assert.ok(Number.isFinite(peer.target.x) && Number.isFinite(peer.target.y));
});

test('remote avatar turns follow the shortest arc', () => {
    const { manager, AvatarManager } = loadAvatarManager();
    assert.ok(Math.abs(AvatarManager.shortestAngle(3, -3) - (2 * Math.PI - 6)) < 1e-9);
    assert.ok(Math.abs(AvatarManager.shortestAngle(0, -3 * Math.PI / 2) - Math.PI / 2) < 1e-9);
    manager.updatePeerState('p', 'Pat', { x: 0, y: 1.7, z: 0, rotY: 3 });
    const peer = manager.remotes.get('p');
    manager.updatePeerState('p', null, { x: 0, y: 1.7, z: 0, rotY: -3 });
    manager.update(1 / 60);
    assert.ok(peer.root.rotation.y > 3, `expected a short turn through PI, got ${peer.root.rotation.y}`);
    const before = peer.root.rotation.y;
    manager.update(0);
    manager.update(undefined);
    assert.equal(peer.root.rotation.y, before, 'no frame step means no motion');
});

test('remote emoji are allow-listed and rate-limited per guest', () => {
    const { manager, created, advance } = loadAvatarManager();
    manager.updatePeerState('p', 'Pat', { x: 0, y: 1.7, z: 0, rotY: 0 });
    const planesBefore = created.length;
    manager.showEmoji('p', '<script>');
    assert.equal(created.length, planesBefore);
    manager.showEmoji('p', '🎉');
    manager.showEmoji('p', '🔥');
    assert.equal(created.length, planesBefore + 1, 'second reaction inside the interval is dropped');
    advance(600);
    manager.showEmoji('p', '🔥');
    assert.equal(created.length, planesBefore + 2);
});

test('audio URL policy accepts supported sources and rejects unsafe inputs', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;
    const httpsPage = 'https://vrclub.example/';
    const cases = [
        ['https://radio.example/live.mp3', true],
        ['blob:https://vrclub.example/01234567-89ab-cdef-0123-456789abcdef', true],
        ['http://localhost:8000/live.mp3', true],
        ['http://127.0.0.1:8000/live.mp3', true],
        // Whole 127.0.0.0/8 and the RFC 6761 special-use TLD, not just 127.0.0.1.
        ['http://127.0.0.2:8000/live.mp3', true],
        ['http://api.localhost:8000/live.mp3', true],
        ['http://[::1]:8000/live.mp3', true],
        // localhost.evil.com is NOT loopback.
        ['http://localhost.evil.com/live.mp3', false],
        ['http://radio.example/live.mp3', false],
        ['https://user:pass@radio.example/live.mp3', false],
        ['javascript:alert(1)', false],
        ['data:audio/mp3;base64,AAAA', false],
        ['file:///etc/passwd', false],
        ['', false],
        [null, false],
        // Unbounded input is synchronous O(n) work on the UI thread, straight from a paste.
        [`https://radio.example/${'a'.repeat(4000)}`, false]
    ];

    for (const [url, expected] of cases) {
        assert.equal(AudioUtils.isSafeAudioUrl(url, httpsPage), expected, String(url).slice(0, 60));
    }
    // Mixed content only applies when the PAGE is https.
    assert.equal(AudioUtils.isSafeAudioUrl('http://radio.example/live.mp3', 'http://localhost:8000/'), true);
});

test('podcast feeds resolve the newest https audio episode, even from a truncated head', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;
    const item = (title, enclosure) => `<item>\n<title>${title}</title>\n` +
        `<description><![CDATA[<p><a href='https://example.com/x.mp3'>x</a></p>]]></description>\n${enclosure}\n</item>`;
    const feed = '<?xml version="1.0"?><rss><channel><title>Resident</title>' +
        item('Video &amp; extras', '<enclosure url="https://cdn.example/v.mp4" type="video/mp4"/>') +
        item('Insecure', '<enclosure url="http://cdn.example/a.mp3" type="audio/mpeg"/>') +
        item('Resident / Episode 803 &#8211; Sept', '<enclosure url="https://mcdn.example/803.mp3?a=1&amp;b=2" length="1" type="audio/mpeg"/>') +
        item('Resident / Episode 802', '<enclosure url="https://mcdn.example/802.mp3" type="audio/mpeg"/>');

    assert.deepEqual({ ...AudioUtils.parseLatestPodcastEpisode(feed) }, {
        title: 'Resident / Episode 803 \u2013 Sept',
        url: 'https://mcdn.example/803.mp3?a=1&b=2'
    });
    // A byte-range head cut mid-way through a later item still resolves the first.
    const head = feed.slice(0, feed.indexOf('Episode 802') + 5);
    assert.equal(AudioUtils.parseLatestPodcastEpisode(head).url, 'https://mcdn.example/803.mp3?a=1&b=2');
    // A head cut before the first item closes yields nothing, so callers fetch the rest.
    assert.equal(AudioUtils.parseLatestPodcastEpisode(feed.slice(0, feed.indexOf('</item>'))), null);
    assert.equal(AudioUtils.parseLatestPodcastEpisode('<rss></rss>'), null);
    assert.equal(AudioUtils.parseLatestPodcastEpisode(null), null);
});

test('podcast feeds list every playable episode newest first, once each', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;
    const item = (title, url, type = 'audio/mpeg') =>
        `<item><title>${title}</title><enclosure url="${url}" type="${type}"/></item>`;
    const feed = '<rss><channel>' +
        item('803', 'https://cdn.example/803.mp3') +
        item('video', 'https://cdn.example/v.mp4', 'video/mp4') +
        item('802', 'https://cdn.example/802.mp3') +
        item('802 again', 'https://cdn.example/802.mp3') +
        item('insecure', 'http://cdn.example/801.mp3') +
        item('801', 'https://cdn.example/801.mp3') +
        '<item><title>cut off</title><enclosure url="https://cdn.example/800.mp3" ';
    // Spread: the arrays come from a separate VM realm, so compare plain copies.
    assert.deepEqual([...AudioUtils.parsePodcastEpisodes(feed).map(e => e.title)], ['803', '802', '801']);
    assert.deepEqual([...AudioUtils.parsePodcastEpisodes('<rss></rss>')], []);
    assert.deepEqual([...AudioUtils.parsePodcastEpisodes(undefined)], []);
});

// When an episode finishes the next older one must start, and choosing anything else ends the
// queue. The queue lives in ui-init.js (a DOM script), so it is driven here with its real source
// against a fake club and document.
test('a finished Resident episode is followed by the next older one, and a different choice stops the queue', async () => {
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    // The queue section: from its doc comment to the closing brace of advanceResidentQueue().
    const start = source.indexOf('/**\n * The Resident episodes in play order');
    const advance = source.indexOf('async function advanceResidentQueue');
    assert.ok(start > 0 && advance > start, 'queue code not found');
    const section = source.slice(start, source.indexOf('\n}\n', advance) + 3);
    const played = [];
    const listeners = {};
    const audio = { addEventListener: (type, fn) => { listeners[type] = fn; } };
    const club = {
        audioElement: audio,
        _audioStreamUrl: null,
        networkManager: null,
        startAudioStream(url, options) {
            if (club.failing.has(url)) return Promise.reject(new Error('404'));
            played.push({ url, onDemand: options && options.onDemand });
            club._audioStreamUrl = url;
            return Promise.resolve();
        },
        failing: new Set(),
        showErrorMessage(message) { club.lastError = message; }
    };
    const feedFetches = [];
    const nowPlaying = { textContent: '' };
    const context = vm.createContext({
        console, Promise, Error,
        document: {
            getElementById: id => (id === 'audioNowPlaying' ? nowPlaying : null),
            addEventListener() {}, removeEventListener() {}
        },
        uiLog: { warn() {} },
        entryNowPlaying: '',
        announceNowPlaying: label => { nowPlaying.textContent = `\u25B6 ${label}`; },
        RESIDENT_PODCAST: { feed: 'feed' },
        fetchPodcastEpisodes: async () => {
            feedFetches.push(true);
            return [{ title: 'new 900', url: 'https://x/900.mp3' }, { title: '899', url: 'https://x/899.mp3' }];
        }
    });
    vm.runInContext(section + '\nthis.api = { playResidentFrom, advanceResidentQueue, getQueue: () => residentQueue };', context);
    const api = context.api;
    const episodes = [
        { title: '803', url: 'https://x/803.mp3' },
        { title: '802', url: 'https://x/802.mp3' },
        { title: '801', url: 'https://x/801.mp3' }
    ];

    await api.playResidentFrom(club, episodes, 0);
    assert.deepEqual(played.map(p => p.url), ['https://x/803.mp3']);
    assert.equal(played[0].onDemand, true, 'an episode must play once, not loop, or it can never end');
    assert.equal(typeof listeners.ended, 'function', 'the end of an episode is not observed');

    // The episode ends: the next older one starts, and so on.
    listeners.ended();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(played[1].url, 'https://x/802.mp3');
    assert.equal(nowPlaying.textContent, '\u25B6 802');
    listeners.ended();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(played[2].url, 'https://x/801.mp3');

    // Out of older episodes: look at the feed again and start from the newest (a new one may be out).
    listeners.ended();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(feedFetches.length, 1);
    assert.equal(played[3].url, 'https://x/900.mp3');

    // A dead episode is skipped in favour of the next older one.
    club.failing.add('https://x/899.mp3');
    club.failing.add('https://x/898.mp3');
    await api.playResidentFrom(club, [
        { title: '899', url: 'https://x/899.mp3' }, { title: '898', url: 'https://x/898.mp3' },
        { title: '897', url: 'https://x/897.mp3' }
    ], 0);
    assert.equal(played[played.length - 1].url, 'https://x/897.mp3');

    // The guest chooses something else: the old episode ending must not start another.
    await api.playResidentFrom(club, episodes, 0);
    const before = played.length;
    club._audioStreamUrl = 'https://radio.example/live';
    listeners.ended();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(played.length, before, 'the queue kept playing after the guest chose another stream');

    // An autoplay block is rethrown at once, with the queue left on that episode for a retry.
    club.startAudioStream = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    await assert.rejects(() => api.playResidentFrom(club, episodes, 1), { name: 'NotAllowedError' });
    assert.equal(api.getQueue().index, 1);
});

// ---------------------------------------------------------------------------
// Asset caching primitives
// ---------------------------------------------------------------------------

test('InFlightRegistry de-duplicates concurrent work and clears completed entries', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true })
    });
    const registry = new window.InFlightRegistry();
    let calls = 0;
    let resolveWork;
    const work = new Promise(resolve => { resolveWork = resolve; });
    const factory = () => { calls++; return work; };

    const first = registry.run('model.glb', factory);
    const second = registry.run('model.glb', factory);
    assert.equal(first, second);
    assert.equal(calls, 1);

    resolveWork('done');
    assert.equal(await first, 'done');
    await Promise.resolve();

    assert.equal(await registry.run('model.glb', async () => { calls++; return 'again'; }), 'again');
    assert.equal(calls, 2);

    registry.clear();
    assert.equal(registry.pending.size, 0);
});

test('IndexedDBAssetCache settles aborted transactions and disables itself on quota failure', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, queueMicrotask,
        fetch: async () => ({ ok: true })
    });
    const warnings = [];
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test',
        storeName: 'assets',
        logger: { info() {}, warn: (...args) => warnings.push(args), error() {} }
    });
    const quotaError = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    cache.db = {
        transaction() {
            const tx = { error: quotaError, objectStore: () => ({ put: () => ({}), getAll: () => ({}) }) };
            queueMicrotask(() => tx.onabort());
            return tx;
        }
    };

    assert.equal(await cache.put('asset.glb', new Uint8Array([1])), false);
    assert.equal(cache.disabled, true, 'a full quota must disable persistence, not throw');
    assert.ok(warnings.length >= 1);
});

test('IndexedDBAssetCache resolves writes on transaction COMMIT, not request success', async () => {
    // Chromium reports QuotaExceededError at commit time for large blobs. Settling on
    // request.onsuccess made put() report success, so the cache never disabled itself
    // and retried a doomed write on every load.
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, queueMicrotask, fetch: async () => ({ ok: true })
    });
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test', storeName: 'assets',
        logger: { info() {}, warn() {}, error() {} }
    });
    let committed = false;
    cache.db = {
        transaction() {
            const request = {};
            const tx = { objectStore: () => ({ put: () => request }) };
            queueMicrotask(() => {
                request.onsuccess();
                // A commit that never arrives must NOT resolve put().
                queueMicrotask(() => { committed = true; tx.oncomplete(); });
            });
            return tx;
        }
    };
    assert.equal(await cache.put('a.glb', new Uint8Array([1])), true);
    assert.equal(committed, true, 'put() resolved before the transaction committed');
});

test('IndexedDBAssetCache.init is concurrency-safe', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true }),
        indexedDB: undefined
    });
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test', storeName: 'assets',
        logger: { info() {}, warn() {}, error() {} }
    });
    let opens = 0;
    cache._open = async function () { opens++; this.disabled = true; };
    await Promise.all([cache.init(), cache.init(), cache.init()]);
    assert.equal(opens, 1, 'concurrent init() calls must share one open');
});

test('body downloads preserve a caller abort signal', async () => {
    let observedSignal;
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout,
        fetch: async (_url, init) => {
            observedSignal = init.signal;
            if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
        }
    });
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        window.fetchBufferWithTimeout('/model.glb', { signal: controller.signal }),
        error => error.name === 'AbortError'
    );
    assert.equal(observedSignal.aborted, true);
});

test('cache eviction selects timestamp-indexed keys without reading payloads', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true })
    });
    const cache = new window.IndexedDBAssetCache({ dbName: 'test', storeName: 'assets' });
    const deleted = [];
    let selectedLimit;
    cache._run = async (mode, work) => work({
        count: () => 8,
        index: name => {
            assert.equal(name, 'timestamp');
            return {
                getAllKeys: (_range, limit) => {
                    selectedLimit = limit;
                    return ['old-a', 'old-b'];
                }
            };
        },
        delete: key => { deleted.push([mode, key]); }
    });

    assert.equal(await cache._evictOldest(0.25), 2);
    assert.equal(selectedLimit, 2);
    assert.deepEqual(deleted, [['readwrite', 'old-a'], ['readwrite', 'old-b']]);
});

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

test('MaterialFactory cache keys normalize colors and object key order', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/materialFactory.js', { BABYLON });
    const factory = new window.MaterialFactory(null, 4, console);

    const arrayKey = factory._cacheKey('pbr', {
        roughness: 0.3,
        baseColor: [1, 0, 0],
        clearCoat: { intensity: 1, roughness: 0.2 }
    });
    const colorKey = factory._cacheKey('pbr', {
        clearCoat: { roughness: 0.2, intensity: 1 },
        baseColor: new BABYLON.Color3(1, 0, 0),
        roughness: 0.3
    });
    assert.equal(arrayKey, colorKey);

    // Different configs must NOT collide.
    const other = factory._cacheKey('pbr', { roughness: 0.4, baseColor: [1, 0, 0] });
    assert.notEqual(arrayKey, other);
});

test('MaterialFactory freezes by explicit mutability, never by material name', () => {
    const BABYLON = makeBabylonStub();
    class FakeMaterial {
        constructor(name) { this.name = name; this.isFrozen = false; }
        freeze() { this.isFrozen = true; }
    }
    BABYLON.StandardMaterial = FakeMaterial;
    BABYLON.PBRMetallicRoughnessMaterial = FakeMaterial;
    BABYLON.PBRMaterial = class extends FakeMaterial {
        constructor(name) { super(name); this.clearCoat = {}; this.sheen = {}; }
    };
    const { window } = loadClassic('js/materialFactory.js', { BABYLON });
    const F = window.MaterialFactory;
    const factory = new F({}, 3, { info() {}, warn() {} });

    for (const create of ['createPBRMaterial', 'createStandardMaterial', 'createFullPBRMaterial']) {
        // A name that used to match the substring list is frozen without the flag...
        assert.equal(factory[create]('ledPanelMat', {}).isFrozen, true, `${create}: names must not decide`);
        // ...and a plain name stays live when the caller declares it mutable.
        assert.equal(factory[create]('trussMat', { mutable: true }).isFrozen, false, `${create}: mutable opts out`);
    }
    assert.equal(F.isHotMutated, undefined, 'the name-matching fallback is gone');
    assert.equal(F.HOT_MUTATED, undefined);

    // A shared frozen material must never be handed to a caller that mutates it.
    const frozen = factory.createPBRMaterial('a', { baseColor: [1, 0, 0] }, true);
    const live = factory.createPBRMaterial('b', { baseColor: [1, 0, 0], mutable: true }, true);
    assert.notEqual(frozen, live);
});

test('the factory floor is matte concrete, and SSR skips dielectrics', () => {
    const BABYLON = makeBabylonStub();
    BABYLON.PBRMaterial = class {
        constructor(name) { this.name = name; this.clearCoat = { isEnabled: false }; this.sheen = {}; }
        freeze() { this.isFrozen = true; }
    };
    const { window } = loadClassic('js/materialFactory.js', { BABYLON });
    const factory = new window.MaterialFactory({}, 3, { info() {}, warn() {} });
    const floor = factory.getPreset('floorConcrete');
    assert.equal(floor.clearCoat.isEnabled, false, 'a clear coat makes the concrete read as a wet floor');
    assert.equal(floor.metallic, 0);
    assert.equal(floor.roughness, 1, 'the roughness map must drive the floor at full strength');
    assert.equal(floor.environmentIntensity, 0.35);

    // A dielectric's F0 is ~0.04: the threshold must sit above it or SSR mirrors the
    // floor at grazing angles regardless of the material.
    const rendering = readFileSync(join(ROOT, 'js/club/03-rendering.js'), 'utf8');
    const threshold = Number(rendering.match(/ssr\.reflectivityThreshold\s*=\s*([\d.]+)/)?.[1]);
    assert.ok(threshold > 0.04, `SSR reflectivityThreshold ${threshold} would trace the concrete floor`);
});

test('every runtime-colour-written factory material declares mutable: true', () => {
    // Migration guard: the call sites that the old name heuristic kept unfrozen must
    // now opt in explicitly, so removing the heuristic changed no runtime behaviour.
    const legacyTags = ['lens', 'source', 'flare', 'beam', 'gobo', 'strobe', 'led', 'pool',
        'glow', 'laser', 'mirror', 'toggle', 'audiobtn', 'sliderhandle'];
    const missing = [];
    const files = ['js/materialFactory.js', ...readdirSync(join(ROOT, 'js/club')).map(f => `js/club/${f}`)];
    for (const file of files) {
        const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
        lines.forEach((line, i) => {
            const m = line.match(/create(?:PBR|Standard|FullPBR)Material\(\s*(['"`])([^'"`]*)/);
            if (!m || !legacyTags.some(tag => m[2].toLowerCase().includes(tag))) return;
            if (!/mutable:\s*true/.test(lines.slice(i, i + 3).join('\n'))) missing.push(`${file}:${i + 1}`);
        });
    }
    assert.deepEqual(missing, []);
});

// ---------------------------------------------------------------------------
// Light factory
// ---------------------------------------------------------------------------

test('LightFactory.disposeGroup disposes every light in the group', () => {
    // The group array is spliced by disposeLight() while forEach walks it, and
    // forEach does not re-index - so the live-array version skipped every other
    // light and then deleted the only handle to the survivors.
    const disposed = [];
    const makeLight = (name) => ({ name, dispose() { disposed.push(name); }, getShadowGenerator: () => null });
    const { window } = loadClassic('js/lightFactory.js', { BABYLON: makeBabylonStub() });
    const factory = new window.LightFactory({ lights: [] }, { info() {}, warn() {} });

    for (const name of ['a', 'b', 'c', 'd']) {
        const light = makeLight(name);
        factory.lights.set(name, light);
        factory.addToGroup('dj', light);
    }
    factory.disposeGroup('dj');

    assert.deepEqual(disposed.sort(), ['a', 'b', 'c', 'd']);
    assert.equal(factory.lights.size, 0);
});

test('LightFactory refuses to silently orphan a light on a name collision', () => {
    const warnings = [];
    const { window } = loadClassic('js/lightFactory.js', { BABYLON: makeBabylonStub() });
    const factory = new window.LightFactory({ lights: [] }, { info() {}, warn: m => warnings.push(m) });

    let disposedFirst = false;
    factory._register('spot', { dispose() { disposedFirst = true; }, getShadowGenerator: () => null });
    factory._register('spot', { dispose() {}, getShadowGenerator: () => null });

    assert.equal(disposedFirst, true);
    assert.equal(factory.lights.size, 1);
    assert.ok(warnings.some(w => String(w).includes('already exists')));
});

test('ambient preset preserves specular pre-lighting for clear-coated dark cues', () => {
    const { window } = loadClassic('js/lightFactory.js', { BABYLON: makeBabylonStub() });
    const factory = new window.LightFactory({ lights: [] }, { info() {}, warn() {} });
    factory.createHemisphericLight = (name, direction, config) => config;
    const config = factory.presets.ambient();
    assert.ok(config.specular.every(channel => channel > 0 && channel <= 0.02));
    assert.equal(config.intensity, 0.04);
});

test('XR initialization only creates a helper for supported immersive VR', async () => {
    const navigator = {};
    const { window } = loadClassic('js/club/02-lifecycle.js', {
        VRClubCore: class {}, navigator
    });
    let calls = 0;
    const options = { floorMeshes: [] };
    const helper = {};
    const club = { scene: { createDefaultXRExperienceAsync: async received => {
        assert.equal(received, options);
        calls++;
        return helper;
    } } };
    const create = () => window.VRClubLifecycle.prototype._createXRExperience.call(club, options);
    assert.equal(await create(), null);
    navigator.xr = { isSessionSupported: async () => false };
    assert.equal(await create(), null);
    navigator.xr.isSessionSupported = async () => { throw new Error('XR unavailable'); };
    assert.equal(await create(), null);
    assert.equal(calls, 0);
    navigator.xr.isSessionSupported = async mode => {
        assert.equal(mode, 'immersive-vr');
        return true;
    };
    assert.equal(await create(), helper);
    assert.equal(calls, 1);
});

test('startup preserves opaque depth for both later lighting groups', async () => {
    const BABYLON = makeBabylonStub();
    const configurations = new Map();
    BABYLON.Scene = class {
        setRenderingAutoClearDepthStencil(group, autoClear) {
            configurations.set(group, autoClear);
        }
    };
    const { window } = loadClassic('js/club/02-lifecycle.js', {
        BABYLON, VRClubCore: class {}, log: { info() {} }
    });
    const stopAfterSceneSetup = new Error('scene setup complete');
    const club = {
        _reportInitProgress() {},
        materialFactory: { set scene(value) { throw stopAfterSceneSetup; } }
    };
    await assert.rejects(window.VRClubLifecycle.prototype.init.call(club),
        error => error === stopAfterSceneSetup);
    assert.equal(configurations.get(1), false);
    assert.equal(configurations.get(2), false);
    assert.equal(configurations.has(0), false);
});

test('light budget sweeps refresh matching-budget lit materials without refreezing them', () => {
    const BABYLON = { Material: { LightDirtyFlag: 2 } };
    const rendering = loadClassic('js/club/03-rendering.js', {
        BABYLON, VRClubLifecycle: class {}, log: { info() {} }
    }).window.VRClubRendering.prototype._clampMaterialLightBudgets;
    const loader = loadClassic('js/modelLoader.js', { BABYLON })
        .window.ModelLoader.prototype._enforceSceneLightBudget;
    for (const sweep of [rendering, loader]) {
        const lit = {
            maxSimultaneousLights: 3, isFrozen: true, dirty: false,
            unfreeze() { this.isFrozen = false; },
            markAsDirty(flag) { this.dirty = flag === BABYLON.Material.LightDirtyFlag; }
        };
        const unlit = { maxSimultaneousLights: 3, disableLighting: true, isFrozen: true };
        const scene = {
            materials: [lit, unlit], blockMaterialDirtyMechanism: false,
            onAfterRenderObservable: { addOnce() { assert.fail('Lit shaders must remain responsive'); } }
        };
        sweep.call({ scene, maxLights: 3, log: { info() {} } });
        assert.equal(lit.isFrozen, false);
        assert.equal(lit.dirty, true);
        assert.equal(lit.maxSimultaneousLights, 3);
        assert.equal(unlit.isFrozen, true);
        assert.equal(scene.blockMaterialDirtyMechanism, false);
    }
});

test('graphics tier changes invalidate frozen pre-pass shader layouts', () => {
    const BABYLON = { Material: { AllDirtyFlag: 63 } };
    const { window } = loadClassic('js/club/01-core.js', {
        BABYLON, log: { info() {}, warn() {} }, localStorage: { setItem() {} }
    });
    const material = {
        isFrozen: true, dirty: false,
        unfreeze() { this.isFrozen = false; },
        markAsDirty(flag) { this.dirty = flag === BABYLON.Material.AllDirtyFlag; }
    };
    const club = {
        qualityTiers: { high: {}, ultra: {} }, graphicsTier: 'high',
        scene: { materials: [material] }, isInVRMode: false,
        _applyTierToPipeline() {}, _createScreenSpaceReflections() {},
        _createMotionBlur() {}, _suppressUnlitSpecular() {},
        _applyAnisotropicFiltering() {}, _applyShadowQuality() {},
        _rebuildFloorReflectionProbe() {}, _applyCrowdSize() {},
        applyDesktopSettings() {}, showErrorMessage() {}
    };
    window.VRClubCore.prototype.setGraphicsTier.call(club, 'ultra');
    assert.equal(club.graphicsTier, 'ultra');
    assert.equal(material.isFrozen, false);
    assert.equal(material.dirty, true);
});

test('ModelLoader.dispose releases loaded containers and procedural hierarchies', () => {
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON: makeBabylonStub(),
        navigator: { userAgent: '' },
        IndexedDBAssetCache: class {},
        InFlightRegistry: class {}
    });
    const loader = Object.create(window.ModelLoader.prototype);
    const calls = [];
    loader.inFlight = { clear: () => calls.push('clear') };
    loader.cache = { close: () => calls.push('close') };
    loader.loadedModels = {
        glb: {
            container: {
                removeAllFromScene: () => calls.push('remove-container'),
                dispose: () => calls.push('dispose-container')
            }
        },
        fallback: {
            rootMesh: { dispose: (...args) => calls.push(['dispose-root', ...args]) }
        }
    };
    loader._paSpeakerMatCache = {};

    loader.dispose();

    assert.deepEqual(calls, [
        'clear',
        'close',
        'remove-container',
        'dispose-container',
        ['dispose-root', false, false]
    ]);
    assert.equal(Object.keys(loader.loadedModels).length, 0);
    assert.equal(loader._paSpeakerMatCache, null);
});

// ---------------------------------------------------------------------------
// Web Audio spatial graph (structural; no audio is decoded)
// ---------------------------------------------------------------------------

function createAudioHarness(options = {}) {
    const localStorage = options.localStorage || { getItem: () => null, setItem() {} };
    const clock = options.performance || { now: () => 0 };
    const testLog = options.log || { info() {}, warn() {} };
    const edges = [];
    const started = new Set();
    class Param {
        constructor(value = 0) { this.value = value; this.targets = []; }
        setTargetAtTime(v, t, c) { this.value = v; this.targets.push([v, t, c]); }
    }
    class Node {
        constructor(kind) { this.kind = kind; }
        connect(target) { edges.push([this, target]); return target; }
        disconnect() { for (let i = edges.length - 1; i >= 0; i--) if (edges[i][0] === this) edges.splice(i, 1); }
    }
    class FakeAudioContext {
        constructor() {
            this.state = 'running';
            this.sampleRate = 8000;
            this.currentTime = 1;
            this.destination = new Node('destination');
            this.listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY',
                'forwardZ', 'upX', 'upY', 'upZ'].map(k => [k, new Param()]));
        }
        createAnalyser() { return Object.assign(new Node('analyser'), { fftSize: 2048, frequencyBinCount: 64 }); }
        createPanner() {
            const n = new Node('panner');
            for (const k of ['positionX', 'positionY', 'positionZ', 'orientationX', 'orientationY', 'orientationZ']) n[k] = new Param();
            return n;
        }
        createBiquadFilter() { return Object.assign(new Node('biquad'), { frequency: new Param(350), Q: new Param(1) }); }
        createGain() { return Object.assign(new Node('gain'), { gain: new Param(1) }); }
        createDelay() { return Object.assign(new Node('delay'), { delayTime: new Param() }); }
        createConvolver() { return new Node('convolver'); }
        createDynamicsCompressor() {
            const n = new Node('compressor');
            for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param();
            return n;
        }
        createBuffer(channels, length) {
            const data = Array.from({ length: channels }, () => new Float32Array(length));
            return { numberOfChannels: channels, length, getChannelData: c => data[c] };
        }
        createBufferSource() {
            const n = new Node('bufferSource');
            n.start = () => started.add(n);
            n.stop = () => started.delete(n);
            return n;
        }
        createMediaElementSource(element) {
            if (element._sourced) throw new Error('InvalidStateError');
            element._sourced = true;
            return new Node('mediaSource');
        }
        resume() { return Promise.resolve(); }
        close() { this.state = 'closed'; return Promise.resolve(); }
    }
    const positions = {
        paSpeakers: { left: { x: -6, y: 7.1, z: -16 }, right: { x: 6, y: 7.1, z: -16 } },
        danceFloor: { x: 0, y: 0, z: -12 }
    };
    class Vec {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        static Up() { return new Vec(0, 1, 0); }
        static Zero() { return new Vec(); }
        // Row-vector convention, as Babylon: v' = v * M (w = 0).
        static TransformNormalToRef(v, m, ref) {
            ref.x = v.x * m[0] + v.y * m[4] + v.z * m[8];
            ref.y = v.x * m[1] + v.y * m[5] + v.z * m[9];
            ref.z = v.x * m[2] + v.y * m[6] + v.z * m[10];
            return ref;
        }
        lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
        normalize() { const l = Math.sqrt(this.lengthSquared()) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    }
    const { window } = loadClassic('js/club/11-audio-crowd.js', {
        VRClubUI: class {},
        CLUB_POSITIONS: positions,
        ROOM_BOUNDS: { z: { min: -21, max: -5 } },
        log: testLog,
        BABYLON: { Vector3: Vec },
        AudioUtils: loadClassic('js/audioUtils.js').window.AudioUtils,
        localStorage,
        performance: clock,
        Float32Array, Uint8Array
    });
    window.AudioContext = FakeAudioContext;
    const club = Object.create(window.VRClubAudioCrowd.prototype);
    club.audioElement = options.audioElement || { src: '' };
    club._audioFrameData = { bass: 0, mid: 0, treble: 0, average: 0, hasAudio: false };
    // Reachability over the recorded connect() edges.
    const downstream = (from) => {
        const seen = new Set([from]);
        const queue = [from];
        while (queue.length) {
            const node = queue.shift();
            for (const [a, b] of edges) if (a === node && !seen.has(b)) { seen.add(b); queue.push(b); }
        }
        return seen;
    };
    const connected = (a, b) => edges.some(([x, y]) => x === a && y === b);
    return { club, edges, started, downstream, connected, positions, window, localStorage };
}

test('the Web Audio graph spatialises the PA, keeps the analyser pre-spatial and reaches the output', () => {
    const { club, downstream, connected, positions, started } = createAudioHarness();
    club._connectAudioSourceOnce();
    const ctx = club.audioContext;

    for (const [panner, side] of [[club.pannerLeft, 'left'], [club.pannerRight, 'right']]) {
        assert.ok(panner, `${side} PA panner missing`);
        assert.equal(panner.panningModel, 'HRTF', `${side} PA must use HRTF`);
        // Web Audio is right-handed and Babylon is left-handed, so X is mirrored on the way in.
        assert.equal(panner.positionX.value, -positions.paSpeakers[side].x);
        assert.equal(panner.positionY.value, positions.paSpeakers[side].y);
        assert.equal(panner.positionZ.value, positions.paSpeakers[side].z);
        assert.ok(connected(club.airAbsorptionFilter, panner));
        assert.ok(downstream(panner).has(ctx.destination), `${side} PA does not reach the output`);
    }

    // The analyser is fed straight from the source, never after spatial attenuation,
    // or walking away from the PA would dim the light show.
    assert.ok(connected(club.audioSource, club.audioAnalyser));
    assert.ok(!downstream(club.pannerLeft).has(club.audioAnalyser));
    assert.equal(club.audioAnalyser.fftSize, 256);

    // Sub channel, early reflection and convolution reverb all land on the master bus.
    for (const node of [club.subGain, club.roomDelayGain, club.reverbReturn, club.occlusionFilter]) {
        assert.ok(downstream(node).has(club.audioCompressor));
    }
    assert.ok(connected(club.audioCompressor, club.audioMasterGain));
    assert.ok(connected(club.audioMasterGain, ctx.destination));
    assert.ok(downstream(club.audioSource).has(club.roomConvolver));

    // The crowd bed runs, spatialised, into the same bus.
    assert.ok(started.has(club.crowdAmbienceSource));
    assert.equal(club.crowdAmbiencePanner.panningModel, 'HRTF');
    assert.ok(downstream(club.crowdAmbienceSource).has(ctx.destination));

    // createMediaElementSource throws if called twice for one element.
    const source = club.audioSource;
    club._connectAudioSourceOnce();
    assert.equal(club.audioSource, source);

    // A later play request (a user gesture) must resume a context the browser
    // suspended, even though the media source already exists.
    let resumed = 0;
    ctx.state = 'suspended';
    ctx.resume = () => { resumed++; ctx.state = 'running'; return Promise.resolve(); };
    club._connectAudioSourceOnce();
    assert.equal(resumed, 1, 'a suspended AudioContext was never resumed by Play');
    assert.equal(club.audioSource, source);
});

test('the Web Audio listener follows the camera and leaving the room occludes the PA', () => {
    const { club } = createAudioHarness();
    club._connectAudioSourceOnce();
    const ctx = club.audioContext;
    const camera = {
        globalPosition: { x: 1, y: 1.7, z: -10 },
        getForwardRay: () => ({ direction: { x: 0, y: 0, z: -1 } }),
        upVector: { x: 0, y: 1, z: 0 }
    };
    club.scene = { activeCamera: camera };
    club._audioFrameData = { average: 0 };
    club.updateSpatialAudioListener();
    assert.equal(ctx.listener.positionX.value, -1, 'X is mirrored into right-handed Web Audio space');
    assert.equal(ctx.listener.positionZ.value, -10);
    assert.equal(ctx.listener.forwardZ.value, -1);
    const insideCutoff = club.occlusionFilter.frequency.value;

    camera.globalPosition = { x: 0, y: 1.7, z: -1 };
    club.updateSpatialAudioListener();
    assert.ok(club.occlusionFilter.frequency.value < insideCutoff, 'the corridor must muffle the PA');
    assert.ok(club.audioMasterGain.gain.value < 1.15);
    assert.ok(club.reverbSend.gain.value > 0.08);
});

test('crowd ambience keeps a persisted user level separate from room ducking', () => {
    const store = new Map([['vrclub.crowdAmbience', '0']]);
    const { club } = createAudioHarness({
        localStorage: {
            getItem: key => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => store.set(key, value)
        }
    });
    club._connectAudioSourceOnce();
    assert.equal(club.crowdAmbienceUserGain.gain.value, 0, 'stored ambience level was not applied to the user gain');

    club.setCrowdAmbienceLevel(0.35);
    assert.equal(store.get('vrclub.crowdAmbience'), '0.35');

    club.scene = {
        activeCamera: {
            globalPosition: { x: 0, y: 1.7, z: -1 },
            getForwardRay: () => ({ direction: { x: 0, y: 0, z: 1 } }),
            upVector: { x: 0, y: 1, z: 0 }
        }
    };
    club._audioFrameData.average = 0.2;
    club.updateSpatialAudioListener();

    assert.ok(club.crowdAmbienceGain.gain.value < 0.085, 'the crowd bed did not duck under the music');
    assert.equal(club.crowdAmbienceUserGain.gain.value, 0.35, 'room acoustics overwrote the user ambience level');
});

test('silent analyser warnings are elapsed-time based, mute-aware and phrased as a heuristic', () => {
    const makeClub = () => {
        let now = 0;
        const warnings = [];
        const { club } = createAudioHarness({
            performance: { now: () => now },
            log: { info() {}, warn(message) { warnings.push(message); } }
        });
        club._connectAudioSourceOnce();
        Object.assign(club.audioElement, { paused: false, ended: false, currentTime: 3, volume: 1, muted: false });
        club.showErrorMessage = message => { club.lastError = message; };
        club.audioAnalyser.getByteFrequencyData = array => array.fill(0);
        const run = (hz, seconds) => {
            const frames = Math.ceil(hz * seconds);
            for (let i = 0; i < frames; i++) {
                now += 1000 / hz;
                club.getAudioData();
            }
        };
        return { club, warnings, run, setNow: value => { now = value; } };
    };

    const silent = makeClub();
    silent.run(120, 2.9);
    assert.equal(silent.club.lastError, undefined, 'the warning fired before 3 seconds had elapsed');
    silent.run(45, 0.2);
    assert.match(silent.club.lastError, /silent so far/i);
    assert.match(silent.club.lastError, /possible cause is a stream server CORS restriction/i);
    assert.doesNotMatch(silent.club.lastError, /does not send an Access-Control-Allow-Origin header/i);
    assert.match(silent.warnings[0], /may be blocked from analysis by CORS/i);

    const muted = makeClub();
    muted.club.audioElement.volume = 0;
    muted.run(60, 6.5);
    assert.equal(muted.club.lastError, undefined, 'muted playback must not raise a CORS warning');

    const recovered = makeClub();
    recovered.club.audioAnalyser.getByteFrequencyData = array => { array.fill(0); array[0] = 32; };
    recovered.run(60, 0.1);
    recovered.club.audioAnalyser.getByteFrequencyData = array => array.fill(0);
    recovered.run(60, 5.5);
    assert.equal(recovered.club.lastError, undefined, 'recent real analyser activity should defer the warning');
    recovered.run(60, 0.7);
    assert.match(recovered.club.lastError, /silent so far/i, 'a long silent window after real audio should still warn once');
});

// A source must be heard on the side it appears on screen. Babylon is left-handed
// (screen-right = up x forward) and Web Audio is right-handed (ear-right = forward x up);
// this was shipped mirrored, so the left PA played in the right ear.
test('every sound source is heard on the side it appears on screen', () => {
    const { club, positions } = createAudioHarness();
    club._connectAudioSourceOnce();
    const ctx = club.audioContext;
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

    const listenerAt = { x: 0, y: 1.7, z: -12 };
    for (const yaw of [0, 40, 90, 180, 250, 330].map(d => d * Math.PI / 180)) {
        const forward = [Math.sin(yaw), 0, Math.cos(yaw)];
        club.scene = {
            activeCamera: {
                globalPosition: listenerAt,
                getForwardRay: () => ({ direction: { x: forward[0], y: 0, z: forward[2] } }),
                upVector: { x: 0, y: 1, z: 0 }
            }
        };
        club._audioFrameData = { average: 0 };
        club.updateSpatialAudioListener();
        const L = ctx.listener;
        const audioForward = [L.forwardX.value, L.forwardY.value, L.forwardZ.value];
        const audioUp = [L.upX.value, L.upY.value, L.upZ.value];
        const audioRight = cross(audioForward, audioUp);
        const screenRight = cross([0, 1, 0], forward);

        for (const [side, panner] of [['left PA', club.pannerLeft], ['right PA', club.pannerRight]]) {
            const source = positions.paSpeakers[side.startsWith('left') ? 'left' : 'right'];
            const toSource = sub([source.x, source.y, source.z], [listenerAt.x, listenerAt.y, listenerAt.z]);
            const onScreen = Math.sign(dot(toSource, screenRight));
            const heard = Math.sign(dot(sub(
                [panner.positionX.value, panner.positionY.value, panner.positionZ.value],
                [L.positionX.value, L.positionY.value, L.positionZ.value]), audioRight));
            if (Math.abs(dot(toSource, screenRight)) > 0.5) {
                assert.equal(heard, onScreen, `${side} at yaw ${Math.round(yaw * 180 / Math.PI)} is on the wrong side`);
            }
        }
    }
});

test('the listener tilts with the head instead of staying upright', () => {
    const { club } = createAudioHarness();
    club._connectAudioSourceOnce();
    const ctx = club.audioContext;
    // A head rolled 30 degrees about its forward (z) axis: +Y maps to (sin30, cos30, 0), i.e.
    // tilts towards Babylon +X (row-vector convention, so +Y is row 1).
    const roll = 30 * Math.PI / 180;
    const matrix = [
        Math.cos(roll), -Math.sin(roll), 0, 0,
        Math.sin(roll), Math.cos(roll), 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
    club.scene = {
        activeCamera: {
            globalPosition: { x: 0, y: 1.7, z: -12 },
            getForwardRay: () => ({ direction: { x: 0, y: 0, z: 1 } }),
            getWorldMatrix: () => matrix,
            upVector: { x: 0, y: 1, z: 0 }
        }
    };
    club._audioFrameData = { average: 0 };
    club.updateSpatialAudioListener();
    // The matrix tilts +Y towards Babylon +X; Web Audio sees that mirrored.
    assert.ok(Math.abs(ctx.listener.upX.value - -Math.sin(roll)) < 1e-9, `upX ${ctx.listener.upX.value}`);
    assert.ok(Math.abs(ctx.listener.upY.value - Math.cos(roll)) < 1e-9);
});

test('disposing the club stops every audio source and closes the AudioContext', () => {
    const { club, started } = createAudioHarness();
    club.audioElement = { src: 'blob:x', pause() { this.paused = true; }, removeAttribute() {}, load() {} };
    let vrClickRemoved = false;
    club._vrButtonEl = {
        removeEventListener(type, handler) {
            vrClickRemoved = type === 'click' && handler === club._onVRButtonClick;
        }
    };
    club._onVRButtonClick = () => {};
    club._connectAudioSourceOnce();
    const ctx = club.audioContext;
    assert.equal(started.size, 1);

    const { window } = loadClassic('js/club/02-lifecycle.js', {
        VRClubCore: class {}, log: { info() {}, warn() {} }, URL: { revokeObjectURL() {} },
        document: { removeEventListener() {} }
    });
    window.VRClubLifecycle.prototype.dispose.call(club);
    assert.equal(started.size, 0, 'the crowd ambience source is still running after dispose');
    assert.equal(ctx.state, 'closed');
    assert.equal(club.audioContext, null);
    assert.equal(club.audioSource, null);
    assert.equal(vrClickRemoved, true);
    assert.equal(club._onVRButtonClick, null);
});
test('ModelLoader registers accent lights with LightFactory and never paints speakers magenta', async () => {
    const BABYLON = makeBabylonStub();
    const textures = [];
    BABYLON.Texture = class {
        constructor(url, scene, noMipmap, invertY, sampling, onLoad, onError) {
            Object.assign(this, { url, invertY, onLoad, onError });
            textures.push(this);
        }
    };
    BABYLON.Texture.TRILINEAR_SAMPLINGMODE = 3;
    BABYLON.PBRMetallicRoughnessMaterial = class { constructor(name) { this.name = name; } };
    BABYLON.PBRBaseMaterial = { PBRMATERIAL_OPAQUE: 0 };
    BABYLON.PointLight = class { constructor() { assert.fail('accent lights must go through LightFactory'); } };
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON, navigator: { userAgent: '' }, AbortController,
        IndexedDBAssetCache: class {}, InFlightRegistry: class {}
    });

    const created = [];
    const lightFactory = { createPointLight: (name, position, config) => { created.push({ name, config }); return { name }; } };
    const requested = [];
    const textureLoader = {
        loadOrDownloadTexture: (url) => {
            requested.push(url);
            return url.includes('albedo') ? Promise.reject(new Error('404')) : Promise.resolve(`blob:${url}`);
        }
    };
    const warnings = [];
    const loader = Object.create(window.ModelLoader.prototype);
    Object.assign(loader, {
        scene: {}, maxLights: 3, loadedModels: {}, lightFactory, textureLoader,
        log: { info() {}, warn: (...a) => warnings.push(a.join(' ')) }
    });

    const light = loader._createAccentLight('djConsoleLight', new BABYLON.Vector3(), { intensity: 2, range: 8, group: 'dj' });
    assert.equal(light.name, 'djConsoleLight');
    assert.equal(JSON.stringify(created[0].config), JSON.stringify({ intensity: 2, range: 8, diffuse: [1, 1, 1], group: 'dj' }));

    const mesh = { name: 'speaker_body' };
    loader.applyPASpeakerTextures(mesh, './tex/');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requested.length, 3, 'the original albedo, normal and packed ORM go through TextureLoader');
    assert.ok(requested.some(url => url.endsWith('_orm.jpg')));
    assert.ok(textures.every(t => t.url.startsWith('blob:')), 'textures bind the cached object URL');
    assert.ok(textures.every(t => t.invertY === false), 'recovered images retain their glTF orientation');
    assert.equal(mesh.material.metallic, 1);
    assert.equal(mesh.material.roughness, 1);
    assert.equal(mesh.material.invertNormalMapX, true);
    assert.equal(mesh.material.invertNormalMapY, false);
    assert.equal(mesh.material.normalTexture.gammaSpace, false);
    assert.equal(mesh.material.metallicRoughnessTexture.gammaSpace, false);
    assert.equal(mesh.material.occlusionTexture, mesh.material.metallicRoughnessTexture);
    const secondMesh = { name: 'second_speaker' };
    loader.applyPASpeakerTextures(secondMesh, './tex/');
    assert.equal(secondMesh.material, mesh.material);
    assert.equal(requested.length, 3, 'both cabinets share the same material and maps');
    const base = mesh.material.baseColor;
    assert.ok(!(base.r === 1 && base.g === 0 && base.b === 1), 'no magenta debug colour');
    assert.ok(base.r < 0.1 && base.g < 0.1 && base.b < 0.1);
    assert.equal(warnings.filter(w => w.includes('untextured fallback')).length, 1);

    assert.equal(loader._modelUnavailable('dj_console', { name: 'DJ console' }), null);
    assert.equal(loader.loadedModels.dj_console, undefined, 'an unavailable model is not recorded as loaded');
});

test('ModelLoader keeps the glTF handedness conversion instead of hand-written mirror signs', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON, navigator: { userAgent: '' }, AbortController,
        IndexedDBAssetCache: class {}, InFlightRegistry: class {}
    });
    const ML = window.ModelLoader;
    // What Babylon's glTF loader writes on __root__ in a left-handed scene.
    const loaderRoot = {
        parent: null,
        computeWorldMatrix: () => BABYLON.Matrix.Compose(
            new BABYLON.Vector3(1, 1, -1), new BABYLON.Quaternion(0, 1, 0, 0), BABYLON.Vector3.Zero())
    };
    assert.deepEqual({ ...ML._rootHandedness(loaderRoot) }, { x: -1, y: 1, z: 1 });
    const plain = { parent: null, computeWorldMatrix: () => BABYLON.Matrix.Identity() };
    assert.deepEqual({ ...ML._rootHandedness(plain) }, { x: 1, y: 1, z: 1 });
    const rotated = { parent: null, computeWorldMatrix: () => BABYLON.Matrix.RotationY(0.3) };
    assert.deepEqual({ ...ML._rootHandedness(rotated) }, { x: 1, y: 1, z: 1 }, 'non-axis-aligned roots are not guessed at');

    // The sign workaround is gone from every model config.
    const source = readFileSync(join(ROOT, 'js/modelLoader.js'), 'utf8');
    assert.ok(!/scale:\s*new BABYLON\.Vector3\(\s*-1/.test(source), 'no hand-written mirror signs in model configs');
});

test('equipment accent priorities only reorder the imported meshes they can light', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON, navigator: { userAgent: '' }, AbortController,
        IndexedDBAssetCache: class {}, InFlightRegistry: class {}
    });
    const loader = Object.create(window.ModelLoader.prototype);
    loader.scene = new BABYLON.Scene(new BABYLON.NullEngine());

    const room = BABYLON.MeshBuilder.CreateBox('room', { size: 1 }, loader.scene);
    const consoleMesh = BABYLON.MeshBuilder.CreateBox('console', { size: 1 }, loader.scene);
    room.material = new BABYLON.PBRMetallicRoughnessMaterial('roomMat', loader.scene);
    consoleMesh.material = new BABYLON.PBRMetallicRoughnessMaterial('consoleMat', loader.scene);

    new BABYLON.HemisphericLight('ambient', new BABYLON.Vector3(0, 1, 0), loader.scene);
    for (let i = 0; i < 4; i++) {
        new BABYLON.SpotLight(`spot${i}`,
            new BABYLON.Vector3(0, 8, -12),
            new BABYLON.Vector3(0, -1, 0),
            Math.PI / 3,
            2,
            loader.scene);
    }

    const accent = window.ModelLoader.prototype._createAccentLight.call(
        loader,
        'djConsoleLight',
        new BABYLON.Vector3(0, 2, -18),
        { intensity: 2, range: 8, group: 'dj' }
    );
    accent.renderPriority = 1;
    accent.includedOnlyMeshes = [consoleMesh];

    consoleMesh._resyncLightSources();
    room._resyncLightSources();

    assert.equal(loader.scene.requireLightSorting, true, 'accent priority did not enable Babylon light sorting');
    assert.deepEqual(
        room._lightSources.map(light => light.name).slice(0, 4),
        ['ambient', 'spot0', 'spot1', 'spot2'],
        'room lighting order changed after adding the console accent'
    );
    assert.deepEqual(
        consoleMesh._lightSources.map(light => light.name).slice(0, 5),
        ['djConsoleLight', 'ambient', 'spot0', 'spot1', 'spot2'],
        'console mesh did not receive the accent ahead of the room heads'
    );
    assert.deepEqual(
        consoleMesh._lightSources.map(light => light.name).slice(0, 3),
        ['djConsoleLight', 'ambient', 'spot0'],
        'the 3-light budget would still starve the console accent'
    );
    assert.deepEqual(
        consoleMesh._lightSources.map(light => light.name).slice(0, 4),
        ['djConsoleLight', 'ambient', 'spot0', 'spot1'],
        'the 4-light budget would still starve the console accent'
    );
});

// ---------------------------------------------------------------------------
// Show / VJ directors
// ---------------------------------------------------------------------------

test('ShowDirector resolves ramps and selects every calibrated energy band', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' }
    };
    const director = new window.ShowDirector(club);

    director._cue = { look: 'theWave', bars: 4 };
    director._cueStartBar = 0;
    director._barCounter = 2;
    director._beatInBar = 0;
    director._intensity = 1;
    director._applyContinuous({ beatEnvelope: 1, blackoutUntil: 0 }, { hasAudio: false });
    assert.equal(club.spotlightSpeed, 0.7);
    assert.ok(Number.isFinite(club.masterIntensity));

    director._barsSinceMovement = Number.MAX_SAFE_INTEGER;
    const bands = [
        [0.02, 'afterglow'],
        [0.10, 'arrival'],
        [0.20, 'pulse'],
        [0.30, 'ascent'],
        [0.40, 'ignition']
    ];
    for (const [energy, expected] of bands) {
        director._energy = energy;
        assert.equal(director._pickMovement(), expected);
    }
});

test('ShowDirector preserves fixture output between synthetic no-audio beats', () => {
    const { window } = loadClassic('js/showDirector.js');
    const makeDirector = () => {
        const club = {
            vjManualMode: false,
            photosensitiveSafeMode: false,
            vjDirector: { paletteMode: 'triad' }
        };
        const director = new window.ShowDirector(club);
        director._cue = { look: 'detonation', bars: 4 };
        director._cueStartBar = 0;
        director._barCounter = 0;
        director._beatInBar = 0;
        director._intensity = 0;
        return { club, director };
    };

    const synthetic = makeDirector();
    synthetic.director._applyContinuous({ beatEnvelope: 0, blackoutUntil: 0 }, { hasAudio: false });
    const tracked = makeDirector();
    tracked.director._applyContinuous({ beatEnvelope: 0, blackoutUntil: 0 }, { hasAudio: true });

    assert.ok(synthetic.club.masterIntensity > tracked.club.masterIntensity);
    assert.ok(synthetic.club.masterIntensity >= 0.25);
    assert.ok(tracked.club.masterIntensity >= 0.24);
});

test('no look writes a ShowDirector meta key onto the club instance', () => {
    // intensity / palette / punch are consumed by the director itself. Leaking one
    // onto the club would create a second, invisible writer for a fixture property.
    const { window } = loadClassic('js/showDirector.js');
    const meta = window.ShowDirector.META_KEYS;
    const baseClub = () => ({ vjManualMode: false, photosensitiveSafeMode: false, vjDirector: { paletteMode: 'analogous' } });
    const director = new window.ShowDirector(baseClub());

    const lookNames = Object.keys(director.looks);
    assert.ok(lookNames.length > 0, 'ShowDirector exposes no looks to validate');

    for (const name of lookNames) {
        const probe = baseClub();
        const d2 = new window.ShowDirector(probe);
        d2._applyLook(d2.looks[name]);
        for (const key of meta) {
            assert.equal(key in probe, false, `look "${name}" leaked meta key "${key}" onto the club`);
        }
    }
});

test('the LED wall is lit for most of the show, and only the deliberate solos go dark', () => {
    const { window } = loadClassic('js/showDirector.js');
    const looks = window.ShowDirector._buildLooks();
    const movements = window.ShowDirector._buildMovements();

    // A dark wall is a composition tool for SOLO cues. These are the only looks allowed to keep
    // it off, each for a stated reason; a new look that goes dark has to be added here on purpose.
    const darkOnPurpose = {
        deepBlue: 'negative space: the mirror ball alone',
        eclipse: 'the mirror ball alone',
        theVoid: 'near-total collapse of the comedown',
        bdFall: 'the floor drops out of the breakdown',
        silence: 'blackout',
        liquidPlane: 'the laser sheet solo (pinned by the e2e exclusivity check)',
        beamsOnly: 'pure volumetric geometry; sets up the hit that follows',
        whiteChase: 'strobe-only: nothing else may add flash area',
        strobeHeartbeat: 'strobe-only',
        strobeFloor: 'strobe-only',
        strobeOffbeat: 'strobe-only'
    };
    for (const [name, look] of Object.entries(looks)) {
        if (!look.ledWallActive) assert.ok(name in darkOnPurpose, `look "${name}" goes dark without being a deliberate solo`);
        if (look.ledLevel !== undefined) assert.ok(look.ledLevel >= 0 && look.ledLevel <= 1, `${name}: ledLevel is not 0..1`);
    }
    // Every look that DOES light the wall as an accompaniment declares its pattern, because a
    // look that omits it inherits whatever the previous cue left running.
    for (const [name, look] of Object.entries(looks)) {
        if (look.ledWallActive && look.ledLevel !== undefined && look.ledLevel < 1) {
            assert.ok(Number.isInteger(look.ledPattern), `${name}: a dimmed wall must name its pattern`);
        }
        // Strobe-only solos must never gain a wall: it would add flash area to the strobes.
        if (look.strobeSync && !look.lightsActive && !look.lasersActive) {
            assert.ok(!look.ledWallActive || look.ledLevel !== undefined, `${name}: a strobe look lit the wall at full strength`);
        }
    }

    let on = 0, total = 0;
    for (const [name, movement] of Object.entries(movements)) {
        let movementOn = 0, movementTotal = 0;
        for (const cue of movement.cues) {
            movementTotal += cue.bars;
            if (looks[cue.look].ledWallActive) movementOn += cue.bars;
        }
        on += movementOn; total += movementTotal;
        assert.ok(movementOn / movementTotal >= 0.4,
            `${name}: the wall is lit for only ${(100 * movementOn / movementTotal).toFixed(0)}% of the movement`);
    }
    assert.ok(on / total >= 0.6, `the wall is lit for only ${(100 * on / total).toFixed(0)}% of the show (was 24%)`);
});

test('the LED wall is one mesh whose texels take each panel colour by row and column', () => {
    const { window } = loadClassic('js/club/08-animation-fixtures.js', { VRClubAnimationCore: class {} });
    const flush = window.VRClubAnimationFixtures.prototype._flushLedWall;
    const cols = 4, rows = 3;
    const makeClub = useFloat => {
        const updates = [];
        const wall = {
            cols, rows, useFloat,
            buffer: useFloat ? new Float32Array(cols * rows * 4) : new Uint8Array(cols * rows * 4),
            texture: { update: data => updates.push(data) }
        };
        const ledPanels = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                ledPanels.push({ row, col, material: { emissiveColor: { r: col / 4, g: row / 4, b: 1.6 } } });
            }
        }
        return { club: { _ledWall: wall, ledPanels }, wall, updates };
    };

    // Float texture: values above 1 survive, because they are what drives the glow.
    let { club, wall, updates } = makeClub(true);
    flush.call(club);
    assert.equal(updates.length, 1, 'one texture upload per frame, not one per panel');
    const texel = (row, col) => Array.from(wall.buffer.slice((row * cols + col) * 4, (row * cols + col) * 4 + 4)).map(v => +v.toFixed(4));
    assert.deepEqual(texel(2, 3), [0.75, 0.5, 1.6, 1]);
    assert.deepEqual(texel(0, 0), [0, 0, 1.6, 1]);

    // 8-bit fallback clamps to what the screen shows anyway.
    ({ club, wall, updates } = makeClub(false));
    flush.call(club);
    assert.deepEqual(Array.from(wall.buffer.slice((2 * cols + 3) * 4, (2 * cols + 3) * 4 + 4)), [191, 127, 255, 255]);

    // A club without a wall (modular build, early frames) is a no-op rather than a crash.
    assert.doesNotThrow(() => flush.call({ ledPanels: [] }));
});
test('box UVs are metric and upright: a tile covers the same metres on every wall, whatever its size', () => {
    const BABYLON = makeBabylonStub();
    BABYLON.VertexBuffer = { PositionKind: 'position', NormalKind: 'normal', UVKind: 'uv' };
    const { window } = loadClassic('js/club/03-rendering.js', { BABYLON, VRClubLifecycle: class {} });
    const apply = window.VRClubRendering.prototype._applyWorldUVs;
    // A 0.5 x 10 x 45 m side wall: the +x face has normal (1,0,0) and spans z -22.5..22.5, y -5..5.
    const positions = [0.25, 5, 22.5, 0.25, -5, 22.5, 0.25, -5, -22.5, 0.25, 5, -22.5];
    const normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
    let uvs = null;
    const mesh = {
        getVerticesData: kind => (kind === 'position' ? positions : normals),
        setVerticesData: (kind, data) => { if (kind === 'uv') uvs = Array.from(data); }
    };
    apply.call({}, mesh, 1.5, { u: 4, v: 2 });
    const [u0, v0, , , u2, v2] = [uvs[0], uvs[1], uvs[2], uvs[3], uvs[4], uvs[5]];
    // 45 m along the wall at 1.5 m per tile and a texture scale of 4 is 7.5 texture units; 10 m up is 3.33.
    assert.ok(Math.abs((u0 - u2) - 45 / (1.5 * 4)) < 1e-6, `U must follow the 45 m run, got ${u0 - u2}`);
    assert.ok(Math.abs((v0 - v2) - 10 / (1.5 * 2)) < 1e-6, `V must follow the 10 m height, got ${v0 - v2}`);
});
test('a dimmed wall is an accompaniment: it scales every pattern, eases in, and resets per look', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', { BABYLON, VRClubAnimationFixtures: class {} });
    const apply = window.VRClubAnimationFinish.prototype._applyLedLevel;
    const panels = Array.from({ length: 6 }, () => ({
        colorBuffer: new BABYLON.Color3(), material: { emissiveColor: new BABYLON.Color3(1, 0.5, 0.25) }
    }));
    const club = { ledPanels: panels, ledWallLevel: 0.3 };
    const paint = () => panels.forEach(p => { p.material.emissiveColor = p.colorBuffer; p.colorBuffer.set(1, 0.5, 0.25); });
    const brightness = () => panels[0].material.emissiveColor.r;

    // First lit frame of a dimmed look: dark, not a pop. It then eases to the target level.
    paint(); apply.call(club, 10);
    assert.ok(brightness() < 0.02, 'a dimmed wall must not pop on');
    let t = 10;
    for (let i = 0; i < 60; i++) { t += 1 / 60; paint(); apply.call(club, t); }
    assert.ok(brightness() > 0.2 && brightness() <= 0.3 + 1e-9, `after a second the wall should be near 0.3, got ${brightness().toFixed(3)}`);
    for (let i = 0; i < 240; i++) { t += 1 / 60; paint(); apply.call(club, t); }
    assert.ok(Math.abs(brightness() - 0.3) < 0.01, 'the dimmed wall must settle at its level');
    assert.ok(Math.abs(panels[0].material.emissiveColor.g - 0.15) < 0.01, 'dimming must scale every channel, keeping the colour');

    // The wall switching off and back on (the pass is not called while it is dark) restarts the ease.
    t += 5; paint(); apply.call(club, t);
    assert.ok(brightness() < 0.02, 'a re-lit dimmed wall must fade in again');

    // A full-strength look is exactly as it was: no ease, no scaling, instantly at 1.
    club.ledWallLevel = 1;
    t += 0.1; paint(); apply.call(club, t);
    assert.equal(brightness(), 1, 'a full-strength wall must be untouched');
    // Going from full strength to a dimmed look EASES down to the level; it does not drop to black.
    club.ledWallLevel = 0.5;
    t += 0.016; paint(); apply.call(club, t);
    assert.ok(brightness() > 0.8 && brightness() < 1, 'a dimmed look after a full-strength one must ease down, not pop');
    for (let i = 0; i < 300; i++) { t += 1 / 60; paint(); apply.call(club, t); }
    assert.ok(Math.abs(brightness() - 0.5) < 0.01, 'and settle at its own level');
});

test('the Show Director resolves ledLevel per look and never leaks the dimmed level', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = { vjManualMode: false, photosensitiveSafeMode: false, vjDirector: { paletteMode: 'analogous', setLedHarmony() {}, unlockHue() {} } };
    const director = new window.ShowDirector(club);
    director._applyLook(director.looks.sideways);
    assert.equal(club.ledWallLevel, director.looks.sideways.ledLevel, 'a dimmed look must set the wall level');
    assert.ok(club.ledWallLevel < 1, 'sideways must be a dimmed accompaniment');
    director._applyLook(director.looks.theClimb);
    assert.equal(club.ledWallLevel, 1, 'a look that omits ledLevel must be full strength, not inherit the last dim');
    assert.equal('ledLevel' in club, false, 'the look key must not be written onto the club');
});

test('photosensitive safe mode force-clears strobes in every look', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: true,
        strobesActive: true,
        vjDirector: { paletteMode: 'analogous' }
    };
    const director = new window.ShowDirector(club);
    for (const name of Object.keys(director.looks)) {
        club.strobesActive = true;
        director._applyLook(director.looks[name]);
        assert.equal(club.strobesActive, false, `look "${name}" left strobes on in safe mode`);
    }
});

test('NOCTURNE includes recurring single-subject lighting looks', () => {
    const { window } = loadClassic('js/showDirector.js');
    const director = new window.ShowDirector({
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' }
    });
    const expectedSolo = {
        deepBlue: 'mirrorBallActive',
        eclipse: 'mirrorBallActive',
        driftAway: 'lightsActive',
        firstLight: 'lightsActive',
        theWave: 'ledWallActive',
        crossfire: 'lasersActive',
        sideways: 'lightsActive',
        beamsOnly: 'lasersActive',
        heldBreath: 'ledWallActive',
        liquidPlane: 'laserSheetActive',
        ceilingSidewash: 'laserSheetActive',
        ceilingDip: 'laserSheetActive',
        whiteChase: 'strobesActive',
        strobeHeartbeat: 'strobesActive',
        strobeFloor: 'strobesActive',
        strobeOffbeat: 'strobesActive',
        laserStorm: 'lasersActive',
        theVoid: 'mirrorBallActive'
    };
    const headlineSystems = [
        'lightsActive', 'lasersActive', 'laserSheetActive',
        'strobesActive', 'mirrorBallActive', 'ledWallActive'
    ];
    // A wall run below full strength (<= 0.85) is an ACCOMPANIMENT (lit and moving, but quiet enough
    // that the beams stay the subject), not a second headline. This is what lets the wall be on
    // under a single-subject look without breaking the one-idea-at-a-time rule.
    // A strobe on the bar (one hit per bar, about 0.5 a second) is likewise an ACCENT that builds
    // tension under another subject; a faster or solo strobe is still a headline.
    const otherHeadline = (look) => ['lightsActive', 'lasersActive', 'laserSheetActive', 'mirrorBallActive']
        .some(system => look[system] === true);
    const isHeadline = (look, key) => look[key] === true &&
        !(key === 'ledWallActive' && look.ledLevel !== undefined && look.ledLevel <= 0.85) &&
        !(key === 'strobesActive' && look.strobeSync === 'bar' && otherHeadline(look));

    for (const [name, expected] of Object.entries(expectedSolo)) {
        const active = headlineSystems.filter(key => isHeadline(director.looks[name], key));
        assert.deepEqual(active, [expected], `look "${name}" is not an exclusive ${expected} moment`);
    }

    const runningOrder = Object.values(director.movements).flatMap(movement => movement.cues.map(cue => cue.look));
    assert.equal(runningOrder.filter(name => name === 'whiteChase').length, 1, 'strobe chase belongs only in the peak');
    let totalBars = 0;
    let soloBars = 0;
    for (const [name, movement] of Object.entries(director.movements)) {
        for (const cue of movement.cues) {
            const look = director.looks[cue.look];
            const activeCount = headlineSystems.filter(key => isHeadline(look, key)).length;
            totalBars += cue.bars;
            if (activeCount <= 1) soloBars += cue.bars;
            if (look.mirrorBallActive) assert.equal(activeCount, 1, `${cue.look} crowds out the mirror ball`);
            if (name === 'ignition' && activeCount > 1) assert.ok(cue.bars <= 2, 'layered peak lasts too long');
        }
    }
    assert.ok(soloBars / totalBars >= 0.8, 'single-focus looks should dominate the show');
    director._energy = 0.5;
    director._movementName = 'ignition';
    director._movement = director.movements.ignition;
    director._barsSinceMovement = 100;
    assert.equal(director._pickMovement(), 'pulse', 'sustained energy must not loop the peak');
    director._enterMovement('pulse');
    assert.equal(director._pickMovement(), 'pulse', 'recovery cannot be skipped');
    director._barsSinceMovement = director.movements.pulse.cues.reduce((bars, cue) => bars + cue.bars, 0);
    assert.equal(director._pickMovement(), 'ignition', 'a later peak remains available');
    const sheetLooks = ['liquidPlane', 'ceilingSidewash', 'ceilingDip'];
    assert.ok(runningOrder.filter(name => sheetLooks.includes(name)).length >= 5, 'laser sheet is not recurring');
    for (const movement of Object.values(director.movements)) {
        assert.ok(movement.cues.some(cue => sheetLooks.includes(cue.look)),
            `${movement.title} has no laser-sheet cue`);
    }
    // Every sheet look fires BOTH truss projectors; the motion axis is what varies.
    assert.deepEqual(
        sheetLooks.map(name => [director.looks[name].laserSheetOrigin, director.looks[name].laserSheetMotion]),
        [['both', 'vertical'], ['both', 'lateral'], ['both', 'vertical']]
    );
    // The source only hangs from the truss; nothing may mount it behind the LED wall.
    for (const look of Object.values(director.looks)) {
        if ('laserSheetOrigin' in look) assert.match(look.laserSheetOrigin, /^(both|ceiling(Left|Right))$/);
    }
});

test('both truss projectors emit a sheet together, mirrored; a single side parks the other', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const effects = loadClassic('js/club/06-effects.js', { BABYLON, VRClubFixtures: class {} }).window.VRClubEffects.prototype;
    const core = loadClassic('js/club/07-animation-core.js', { BABYLON, VRClubEffects: class {} });
    const animate = core.window.VRClubAnimationCore.prototype.updateLaserSheet;

    const makeMount = x => ({
        housing: { position: new BABYLON.Vector3(x, 7.55, -16), rotation: new BABYLON.Vector3(0, 0, 0) },
        aperture: { material: { emissiveColor: null } }
    });
    const mat = { alpha: 0, emissiveColor: null, opacityTexture: { vOffset: 0, uOffset: 0 } };
    const fan = () => ({ isVisible: false, material: mat, parent: null });
    const club = Object.create(effects);
    Object.assign(club, {
        laserSheetActive: true, laserSheetMotion: 'lateral', laserSheetOrigin: 'both',
        _laserApertureOff: new BABYLON.Color3(0, 0, 0),
        cachedColors: {
            red: new BABYLON.Color3(1, 0, 0),
            green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1)
        },
        currentColorIndex: 1, currentSpotColor: new BABYLON.Color3(0, 1, 0),
        _laserSheetMounts: { ceilingLeft: makeMount(-6), ceilingRight: makeMount(6) },
        laserSheet: fan(), laserSheetHaze: fan(), _laserSheetFanB: { sheet: fan(), haze: fan() },
        laserSpeed: 1, kickPulse: 0,
        _poseLaserSheet: core.window.VRClubAnimationCore.prototype._poseLaserSheet,
        _laserColor: core.window.VRClubAnimationCore.prototype._laserColor
    });
    club.laserSheetSource = club._laserSheetMounts.ceilingLeft.housing;
    club.laserAperture = club._laserSheetMounts.ceilingLeft.aperture;
    const frame = time => animate.call(club, { time, audio: { average: 0.5 } });

    // BOTH: two fans visible, two lit slits, the right projector mirrors the left's yaw.
    club.configureLaserSheetVariant();
    frame(3);
    const left = club._laserSheetMounts.ceilingLeft, right = club._laserSheetMounts.ceilingRight;
    assert.equal(club.laserSheet.isVisible, true);
    assert.equal(club._laserSheetFanB.sheet.isVisible, true, 'the right fan never lit');
    assert.equal(club._laserSheetFanB.haze.isVisible, true);
    assert.notEqual(left.aperture.material.emissiveColor, club._laserApertureOff);
    assert.notEqual(right.aperture.material.emissiveColor, club._laserApertureOff, 'the right slit stayed dark');
    assert.ok(Math.abs(right.housing.rotation.y + left.housing.rotation.y) < 1e-9, 'the right fan does not mirror the left');
    frame(9);
    assert.ok(Math.abs(right.housing.rotation.y + left.housing.rotation.y) < 1e-9);
    // Not a copy: the right projector trails the left's pitch.
    club.laserSheetMotion = 'vertical';
    frame(5);
    assert.notEqual(right.housing.rotation.x, left.housing.rotation.x);

    // One side only: the other fan is hidden and its slit dark.
    club.laserSheetOrigin = 'ceilingRight';
    club.configureLaserSheetVariant();
    frame(3);
    assert.equal(club.laserSheetSource, right.housing, 'the lead projector did not move to the right');
    assert.equal(club.laserSheet.parent, right.housing);
    assert.equal(club._laserSheetFanB.sheet.isVisible, false);
    assert.equal(left.aperture.material.emissiveColor, club._laserApertureOff);

    // Back to both, then off: every fan and slit goes dark.
    club.laserSheetOrigin = 'both';
    club.configureLaserSheetVariant();
    assert.equal(club.laserSheetSource, left.housing);
    club.laserSheetActive = false;
    frame(4);
    assert.equal(club.laserSheet.isVisible, false);
    assert.equal(club._laserSheetFanB.sheet.isVisible, false);
    assert.equal(right.aperture.material.emissiveColor, club._laserApertureOff);
});

test('NOCTURNE color lock aligns the LED wall and mirror ball to the master hue', () => {
    const { window } = loadClassic('js/showDirector.js');
    const masterColor = { r: 0.2, g: 0.7, b: 1 };
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' },
        currentSpotColor: masterColor
    };
    const director = new window.ShowDirector(club);
    director._cue = { look: 'chromaticRoom', bars: 4 };
    director._cueStartBar = 0;
    director._barCounter = 0;
    director._beatInBar = 0;
    director._applyLook(director.looks.chromaticRoom);
    director._applyContinuous({ beatEnvelope: 1, blackoutUntil: 0 }, { hasAudio: false });

    assert.equal(club.colorLockActive, true);
    assert.equal(club.ledShowColor, masterColor);
    assert.equal(club.mirrorBallSpotlightColor, masterColor);
});

test('VJDirector envelope and intensity follow wall-clock time at any refresh rate', () => {
    const settle = (hz) => {
        let clock = 10000;
        const { window } = loadClassic('js/vjDirector.js', {
            BABYLON: makeBabylonStub(),
            performance: { now: () => clock }
        });
        const club = { vjBPM: 128, dtScale: 60 / hz };
        const director = new window.VJDirector(club);
        director.lastBeatAt = clock;
        director.beatEnvelope = 1;
        director.masterIntensity = 0;
        director.targetMasterIntensity = 1;
        director.blackoutUntil = 0;
        // 0.1 s: shorter than one beat at 128 BPM, so no synthetic beat re-punches.
        for (let frame = 0; frame < hz / 10; frame++) {
            clock += 1000 / hz;
            director.update(clock / 1000, { hasAudio: false });
        }
        return { envelope: director.beatEnvelope, intensity: director.masterIntensity };
    };
    const at60 = settle(60);
    const at120 = settle(120);
    assert.ok(Math.abs(at60.envelope - at120.envelope) < 1e-9,
        `beat envelope depends on refresh rate: ${at60.envelope} vs ${at120.envelope}`);
    assert.ok(Math.abs(at60.intensity - at120.intensity) < 1e-9,
        `master intensity depends on refresh rate: ${at60.intensity} vs ${at120.intensity}`);
});

test('the LED wall can sit a harmony away from the beams, and the show resets it per look', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const club = { vjBPM: 128, currentSpotColor: new BABYLON.Color3(1, 0, 0) };
    const vj = new window.VJDirector(club);
    vj.masterHue = 0;                                 // red beams
    const near = (c, r, g, b) => Math.abs(c.r - r) < 0.01 && Math.abs(c.g - g) < 0.01 && Math.abs(c.b - b) < 0.01;

    vj.setLedHarmony('match');
    assert.equal(club.ledShowColor, club.currentSpotColor, 'matching must still alias the beam colour');
    vj.setLedHarmony('complement');
    assert.ok(near(club.ledShowColor, 0, 1, 1), 'the complement of red is cyan');
    const shared = club.ledShowColor;
    vj.setLedHarmony('triad');
    assert.ok(near(club.ledShowColor, 0, 1, 0), 'a triad partner of red is green');
    assert.equal(club.ledShowColor, shared, 'the harmony colour must be one reused object (no per-frame allocation)');

    // `follow` joins the lasers: whatever partner the look's palette gives them.
    vj.paletteMode = 'complementary'; vj.setLedHarmony('follow');
    assert.ok(near(club.ledShowColor, 0, 1, 1), 'follow + complementary = the laser partner (cyan)');
    vj.paletteMode = 'triad'; vj.setLedHarmony('follow');
    assert.ok(near(club.ledShowColor, 0, 1, 0), 'follow + triad = the laser partner (green)');

    // A hue change from the phrase rotation carries the wall with it.
    vj.setLedHarmony('complement');
    vj.masterHue = 0.25;
    vj.refreshLedColor();
    assert.ok(near(club.ledShowColor, 0.5, 0, 1), 'the wall must follow the master hue (0.25 + 0.5 = violet)');
    vj.setLedHarmony('nonsense');
    assert.equal(vj.ledHarmony, 'match', 'an unknown harmony must fall back to matching');

    // Every look's harmony is a real one, ShowDirector and VJDirector agree on the names,
    // and every look resets (a look that omits it must not inherit the last cue's contrast).
    const { window: showWindow } = loadClassic('js/showDirector.js');
    const names = new Set([...Object.keys(window.VJDirector.LED_HARMONIES), 'follow']);
    assert.deepEqual([...showWindow.ShowDirector.LED_HARMONY_NAMES].sort(), [...names].sort());
    const looks = showWindow.ShowDirector._buildLooks();
    for (const [name, look] of Object.entries(looks)) {
        if (look.ledHarmony !== undefined) assert.ok(names.has(look.ledHarmony), `${name} has an unknown ledHarmony`);
        if (look.colorLock) assert.equal(look.ledHarmony, undefined, `${name}: colorLock overrides ledHarmony, so setting both is a lie`);
    }
    assert.equal(looks.theClimb.ledHarmony, 'complement');
    const applied = [];
    const director = new showWindow.ShowDirector({
        vjManualMode: false, photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous', setLedHarmony: h => applied.push(h), unlockHue() {} }
    });
    applied.length = 0;                               // the constructor applies the opening look itself
    director._applyLook(director.looks.theClimb);
    director._applyLook(director.looks.theWave);
    assert.deepEqual(applied, ['complement', 'match'], 'a look without ledHarmony must reset the wall to matching');
});

test('VJDirector converges on BPM from synthetic onset intervals', () => {
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: makeBabylonStub() });
    const club = { vjBPM: 128 };
    const director = new window.VJDirector(club);

    for (let beat = 0; beat < 14; beat++) {
        director._registerBeat(1000 + beat * 500, false);
    }

    assert.ok(Math.abs(director.bpm - 120) < 1, `expected about 120 BPM, got ${director.bpm}`);
    assert.equal(director.beatNumber, 14);
});

test('VJDirector publishes one phrase palette to the LED wall and mirror ball', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const mirrorColors = [
        new BABYLON.Color3(1, 0, 0),
        new BABYLON.Color3(0, 1, 0)
    ];
    const club = {
        vjBPM: 128,
        cachedColors: {},
        spotColorList: mirrorColors,
        mirrorBallColors: mirrorColors,
        mirrorBallColorIndex: 0
    };
    const director = new window.VJDirector(club);
    director.beatNumber = 16;

    director._applyPalette();

    assert.ok(club.ledShowColor instanceof BABYLON.Color3);
    assert.equal(club.ledShowColor.r, club.currentSpotColor.r);
    assert.equal(club.ledShowColor.g, club.currentSpotColor.g);
    assert.equal(club.ledShowColor.b, club.currentSpotColor.b);
    assert.equal(club.mirrorBallColorIndex, 1);
    assert.equal(club.mirrorBallSpotlightColor, mirrorColors[1]);
});

test('VJDirector keeps the bar grid counting through a kick-less breakdown', () => {
    let clock = 10000;
    const { window } = loadClassic('js/vjDirector.js', {
        BABYLON: makeBabylonStub(),
        performance: { now: () => clock }
    });
    const director = new window.VJDirector({ vjBPM: 128, dtScale: 1 });
    const silentKick = { hasAudio: true, bass: 0.05, mid: 0.2, treble: 0.1 };

    // Three seconds of melody with no kick at all.
    for (let frame = 0; frame < 180; frame++) {
        clock += 1000 / 60;
        director.update(clock / 1000, silentKick);
    }
    assert.ok(director.beatNumber >= 4 && director.beatNumber <= 7,
        `the flywheel lost the grid: ${director.beatNumber} beats in 3 s at 128 BPM`);
    assert.equal(director.realOnsetCount, 0, 'flywheel beats must not count as kicks');
    assert.equal(director.onsetStreak, 0);

    // Real kicks build a streak; a long gap restarts it.
    director._registerBeat(clock + 500, false);
    director._registerBeat(clock + 1000, false);
    director._registerBeat(clock + 1500, false);
    assert.equal(director.onsetStreak, 3);
    assert.equal(director.realOnsetCount, 3);
    director._registerBeat(clock + 6000, false);
    assert.equal(director.onsetStreak, 1);
});

test('a look can pin the master hue until the next look releases it', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const colors = [new BABYLON.Color3(1, 0, 0), new BABYLON.Color3(0, 1, 0)];
    const club = { vjBPM: 128, cachedColors: {}, spotColorList: colors, mirrorBallColors: colors, mirrorBallColorIndex: 0 };
    const director = new window.VJDirector(club);

    director.setMasterHue(0.08);
    director.beatNumber = 16;
    director._applyPalette();
    assert.equal(director.masterHue, 0.08, 'a pinned hue was rotated');
    assert.ok(Math.abs(club.currentSpotColor.r - 1) < 1e-9 && club.currentSpotColor.g < 0.5 && club.currentSpotColor.b === 0,
        'the pinned hue did not reach the rig as amber');

    director.unlockHue();
    director.beatNumber = 32;
    director._applyPalette();
    assert.notEqual(director.masterHue, 0.08, 'the hue stayed pinned after unlock');
});

test('NOCTURNE plays a breakdown arc while the kick is gone and releases when it returns', () => {
    let clock = 100000;
    const { window } = loadClassic('js/showDirector.js', { performance: { now: () => clock } });
    const makeShow = (safe = false) => {
        const vj = {
            paletteMode: 'analogous', bpm: 120, beatNumber: 0, beatEnvelope: 0, blackoutUntil: 0,
            realOnsetCount: 64, lastRealOnsetAt: clock, onsetStreak: 8, hue: null,
            setMasterHue(h) { this.hue = h; }, unlockHue() { this.hue = null; }
        };
        const club = { vjManualMode: false, photosensitiveSafeMode: safe, vjDirector: vj };
        return { vj, club, show: new window.ShowDirector(club) };
    };
    const beats = (ctx, n, audio = { hasAudio: true, bass: 0.4, mid: 0.3, treble: 0.1 }, kick = false) => {
        for (let i = 0; i < n; i++) {
            clock += 500;                       // 120 BPM
            ctx.vj.beatNumber++;
            if (kick) { ctx.vj.lastRealOnsetAt = clock; ctx.vj.realOnsetCount++; }
            ctx.show.update(clock / 1000, audio);
        }
    };

    const ctx = makeShow();
    // A groove with a kick on every beat, then the kick leaves.
    beats(ctx, 12, undefined, true);
    assert.equal(ctx.show._setPiece, null, 'a steady groove was mistaken for a breakdown');
    beats(ctx, 24);
    assert.equal(ctx.show._setPiece, ctx.show.setPieces.breakdown, 'two kick-less bars did not start the breakdown');
    assert.equal(ctx.vj.hue, 0.64, 'the breakdown opens in cold blue');

    // It develops with the bars instead of looping one look.
    beats(ctx, 4 * 5);
    assert.equal(ctx.club.laserSheetActive, true, 'the sheet never arrived');
    beats(ctx, 4 * 20);
    assert.equal(ctx.show._cue.look, 'bdRise', 'the breakdown never began to rise');
    assert.equal(ctx.vj.hue, 0.90);
    assert.equal(ctx.club.strobesActive === true, false, 'the breakdown must stay strobe-free');

    // The kick returns: two in a row release, re-lock the grid and fire the hit.
    clock += 500;
    ctx.vj.beatNumber++;
    ctx.vj.lastRealOnsetAt = clock;
    ctx.vj.realOnsetCount += 2;
    ctx.vj.onsetStreak = 2;
    ctx.show.update(clock / 1000, { hasAudio: true, bass: 0.7, mid: 0.4, treble: 0.2 });
    assert.equal(ctx.show._setPiece, ctx.show.setPieces.release);
    assert.equal(ctx.show._beatInBar, 1, 'the grid was not re-locked to the returning kick');
    assert.equal(ctx.club.strobesActive, true);
    assert.equal(ctx.club.lasersActive, true);
    assert.equal(ctx.vj.hue, null, 'the release must hand the colour back to the palette');
    beats(ctx, 4);
    assert.equal(ctx.show._setPiece, null);
    assert.equal(ctx.show._movementName, 'ignition', 'the release must land in the peak');

    // A groove has to be re-established before another breakdown can be declared.
    beats(ctx, 24);
    assert.notEqual(ctx.show._setPiece, ctx.show.setPieces.breakdown);

    // Safe Mode: the hit loses its strobes like every other look.
    const safe = makeShow(true);
    safe.show._applyLook(safe.show.looks.releaseHit);
    assert.equal(safe.club.strobesActive, false);
});

test('a breakdown ends in AFTERGLOW when the music stops, but survives a one-beat gap', () => {
    let clock = 100000;
    const { window } = loadClassic('js/showDirector.js', { performance: { now: () => clock } });
    const vj = {
        paletteMode: 'analogous', bpm: 120, beatNumber: 0, beatEnvelope: 0, blackoutUntil: 0,
        realOnsetCount: 64, lastRealOnsetAt: clock, onsetStreak: 8,
        setMasterHue() {}, unlockHue() {}
    };
    const show = new window.ShowDirector({ vjManualMode: false, photosensitiveSafeMode: false, vjDirector: vj });
    const step = (audio, ms = 500) => { clock += ms; vj.beatNumber++; show.update(clock / 1000, audio); };
    const music = { hasAudio: true, bass: 0.4, mid: 0.3, treble: 0.1 };
    const nothing = { hasAudio: false, bass: 0, mid: 0, treble: 0 };

    for (let i = 0; i < 36; i++) step(music);
    assert.equal(show._setPiece, show.setPieces.breakdown);
    step(nothing);                              // the classic empty beat before a drop
    step(music);
    assert.equal(show._setPiece, show.setPieces.breakdown, 'a one-beat gap ended the breakdown');
    for (let i = 0; i < 12; i++) step(nothing); // the music really stopped
    assert.equal(show._setPiece, null);
    assert.equal(show._movementName, 'afterglow');
});

test('the LED wall lifts on the kick, and a bare wall renders as before', () => {
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON: makeBabylonStub() });
    const panel = () => ({ colorBuffer: { r: 0, g: 0, b: 0 }, material: {} });
    const paint = (self, brightness) => {
        const p = panel();
        window.LEDPatterns.updateLEDPanel.call(self, p, { r: 1, g: 0.5, b: 0 }, brightness);
        return p.material.emissiveColor;
    };
    assert.deepEqual({ ...paint({}, 1) }, { r: 1, g: 0.5, b: 0 });
    assert.deepEqual({ ...paint({}, 0.5) }, { r: 0.5, g: 0.25, b: 0 });
    assert.deepEqual({ ...paint({ _ledLift: 1.5 }, 1) }, { r: 1.5, g: 0.75, b: 0 }, 'full-bright panels ignored the kick');
    assert.deepEqual({ ...paint({ _ledLift: 1.5 }, 0) }, { r: 0, g: 0, b: 0 }, 'a dark panel must stay dark');
});

test('crowd instances expand to the active tier without duplicating dancers', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', {
        BABYLON,
        VRClubUI: class {}
    });
    const club = {
        npcAvatars: [],
        _crowdSourceContainers: ['source-a'],
        _availableCrowdSources: ['source-a'],
        _crowdSlots: [
            { x: 0, z: 0, src: 0, height: 1.7, facing: 0 },
            { x: 1, z: 1, src: 0, height: 1.8, facing: 0.1 },
            { x: 2, z: 2, src: 0, height: 1.9, facing: 0.2 }
        ],
        _spawnAvatar(source, name) {
            this.npcAvatars.push({ source, name });
        }
    };

    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 2);
    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 3);
    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 3);

    assert.deepEqual(club.npcAvatars.map(npc => npc.name), ['dancer0', 'dancer1', 'dancer2']);
});

/** The JSON chunk of a GLB, without loading it into a 3D engine. */
function readGlbJson(relativePath) {
    const buffer = readFileSync(join(ROOT, relativePath));
    const length = buffer.readUInt32LE(12);
    return JSON.parse(buffer.subarray(20, 20 + length).toString('utf8'));
}

test('every guest slot asks for a clip its character file carries, inside the room and apart from the others', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const slots = window.VRClubAudioCrowd.prototype._guestSlots.call({});
    const clipsOf = file => new Set(readGlbJson(`js/models/avatars/${file}`).animations.map(animation => animation.name));
    // Source indices 5 and 6 are the guest files (see avatarSources in createDancingNPCs).
    const files = { 5: clipsOf('club-guest-female.glb'), 6: clipsOf('club-guest-male.glb') };

    for (const clips of Object.values(files)) {
        assert.ok(clips.has('Dance_Loop'), 'the guest characters also fill dance-floor slots, so they must dance');
    }
    slots.forEach((slot, index) => {
        assert.ok(files[slot.src], `slot ${index} points at a source that is not a guest file`);
        assert.ok(files[slot.src].has(slot.clip), `slot ${index} wants "${slot.clip}", which that file does not carry`);
        assert.ok(Math.abs(slot.x) <= 11.5 && slot.z >= -20 && slot.z <= -5.8, `slot ${index} is outside the room`);
        assert.ok(Number.isFinite(slot.yaw) && slot.height > 1.5 && slot.height < 2, `slot ${index} has an odd pose or height`);
    });
    for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
            const apart = Math.hypot(slots[a].x - slots[b].x, slots[a].z - slots[b].z);
            assert.ok(apart >= 0.9, `guests ${a} and ${b} overlap (${apart.toFixed(2)} m apart)`);
        }
    }

    const tiers = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    const sizes = [...tiers.matchAll(/guestSize:\s*(\d+)/g)].map(match => Number(match[1]));
    assert.equal(sizes.length, 3, 'every graphics tier must set guestSize');
    assert.ok(sizes.every(size => size <= slots.length) && sizes[0] >= sizes[1] && sizes[1] >= sizes[2],
        'guestSize must not exceed the slots and must fall with the tier');
});

test('a multi-clip character plays only its own clip, and does not react to the beat when it is a guest', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const spawn = window.VRClubAudioCrowd.prototype._spawnAvatar;
    const makeGroup = name => ({
        name, from: 0, to: 1, started: false, disposed: false, speedRatio: 1,
        start() { this.started = true; }, goToFrame() {}, dispose() { this.disposed = true; }
    });
    const make = names => {
        const groups = names.map(makeGroup);
        const root = {
            name: '', rotation: { y: 0 }, rotationQuaternion: {},
            position: { x: 0, y: 0, z: 0, copyFrom(v) { this.x = v.x; this.y = v.y; this.z = v.z; } },
            scaling: { setAll() {} }, computeWorldMatrix() {},
            getHierarchyBoundingVectors: () => ({ min: { y: 0 }, max: { y: 1.8 } }),
            getChildMeshes: () => []
        };
        const container = { instantiateModelsToScene: () => ({ rootNodes: [root], animationGroups: groups }) };
        const club = { npcAvatars: [], _attachOccupantCollider: () => null };
        return { groups, container, club };
    };

    let { groups, container, club } = make(['g_Dance_Loop', 'g_Idle_Talking_Loop', 'g_Yes']);
    spawn.call(club, container, 'g', new BABYLON.Vector3(), 0, 1.8, 1, { clip: 'Idle_Talking_Loop', reactsToBeat: false });
    assert.deepEqual(groups.map(group => group.started), [false, true, false]);
    assert.deepEqual(groups.map(group => group.disposed), [true, false, true], 'unused clips must be disposed');
    assert.equal(club.npcAvatars[0].animations.length, 1);
    assert.equal(club.npcAvatars[0].reactsToBeat, false);
    assert.equal(club.npcAvatars[0].homeYaw, null, 'a guest must not swing round when the camera nears');

    // Without a clip a multi-clip file dances, and a one-clip file (the Mixamo characters) is untouched.
    ({ groups, container, club } = make(['d_Idle_Talking_Loop', 'd_Dance_Loop']));
    spawn.call(club, container, 'd', new BABYLON.Vector3(), 0, 1.8, 1);
    assert.deepEqual(groups.map(group => group.started), [false, true]);
    assert.equal(club.npcAvatars[0].reactsToBeat, true);

    ({ groups, container, club } = make(['Armature|mixamo.com|Layer0']));
    spawn.call(club, container, 'm', new BABYLON.Vector3(), 0, 1.8, 1);
    assert.deepEqual(groups.map(group => [group.started, group.disposed]), [[true, false]]);
});
test('avatar materials preserve authored colors while enforcing opacity and depth', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', {
        BABYLON,
        VRClubUI: class {}
    });
    const texture = { hasAlpha: true, anisotropicFilteringLevel: 1 };
    const albedoColor = new BABYLON.Color3(0.1, 0.25, 0.7);
    const material = {
        maxSimultaneousLights: 8,
        alpha: 0.5,
        transparencyMode: 2,
        emissiveColor: new BABYLON.Color3(),
        albedoColor,
        albedoTexture: texture,
        needAlphaBlending: () => true,
        needAlphaTesting: () => true,
        freeze() { this.isFrozen = true; }
    };
    const authoredEmission = new BABYLON.Color3(0.3, 0.02, 0);
    const emissiveTexture = {};
    const glowingMaterial = { emissiveColor: authoredEmission, emissiveTexture };

    window.VRClubAudioCrowd.prototype._prepareAvatarMaterials.call({
        tierSettings: { anisotropy: 8 },
        maxLights: 3
    }, [material, glowingMaterial]);

    assert.deepEqual([material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b], [0, 0, 0]);
    assert.equal(material.albedoColor, albedoColor);
    assert.equal(material.albedoTexture, texture);
    assert.equal(glowingMaterial.emissiveColor, authoredEmission);
    assert.deepEqual([authoredEmission.r, authoredEmission.g, authoredEmission.b], [0.3, 0.02, 0]);
    assert.equal(glowingMaterial.emissiveTexture, emissiveTexture);
    assert.equal(material.alpha, 1);
    assert.equal(material.needAlphaBlending(), false);
    assert.equal(material.needAlphaTesting(), false);
    assert.equal(material.disableDepthWrite, false);
    assert.equal(material.forceDepthWrite, true);
    assert.equal(material.transparencyMode, BABYLON.Material.MATERIAL_OPAQUE);
    assert.equal(material.maxSimultaneousLights, 3);
    assert.equal(texture.hasAlpha, false);
    assert.equal(texture.anisotropicFilteringLevel, 8);
    assert.notEqual(material.isFrozen, true);
});

// ---------------------------------------------------------------------------
// LED wall
// ---------------------------------------------------------------------------

test('underground sequence tells all six scenes on bar lines and never flickers', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON });
    const cols = 21, rows = 10, bpm = 128;
    const panels = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            panels.push({ col, row, colorBuffer: new BABYLON.Color3(), material: { emissiveColor: new BABYLON.Color3() } });
        }
    }
    const club = {
        ledPanels: panels, ledCols: cols, ledRows: rows, ledMonochrome: false, bpm,
        vjDirector: { beatNumber: 0 }, barPhase: 0, beatEnvelope: 0
    };
    Object.assign(club, window.LEDPatterns);
    const colour = new BABYLON.Color3(0.2, 0.5, 1);
    const audio = { hasAudio: true, bass: 0.7, mid: 0.4, treble: 0.3 };
    const lum = p => (p.material.emissiveColor.r + p.material.emissiveColor.g + p.material.emissiveColor.b) / 3;

    const fps = 60;
    const loopSeconds = 38 * 4 * 60 / bpm;
    const frames = Math.round((loopSeconds + 4) * fps);
    const prev = new Float32Array(panels.length);
    const rising = new Int32Array(panels.length);
    let maxMeanStep = 0, lastMean = 0, worstRate = 0;
    const sceneMeans = [];
    for (let f = 0; f < frames; f++) {
        const t = 100 + f / fps;                       // not zero: the clock must not assume it
        const beats = (f / fps) * bpm / 60 + 4.5;      // the cue starts mid-bar
        club.vjDirector.beatNumber = Math.floor(beats);
        club.barPhase = ((Math.floor(beats) % 4) + (beats - Math.floor(beats))) / 4;
        club.patternUndergroundSequence(colour, t, audio);

        let mean = 0;
        for (let i = 0; i < panels.length; i++) {
            const v = lum(panels[i]);
            assert.ok(Number.isFinite(v), `non-finite colour at frame ${f}`);
            mean += v;
            if (prev[i] < 0.5 && v >= 0.5) rising[i]++;
            prev[i] = v;
        }
        mean /= panels.length;
        if (f > 0) maxMeanStep = Math.max(maxMeanStep, Math.abs(mean - lastMean));
        lastMean = mean;
        // Rising edges per panel over each one-second window.
        if (f % fps === fps - 1) {
            for (let i = 0; i < panels.length; i++) { worstRate = Math.max(worstRate, rising[i]); rising[i] = 0; }
            sceneMeans.push(mean);
        }
    }
    assert.ok(worstRate <= 3, `a panel crossed half brightness ${worstRate}x in one second (flash limit is 3)`);
    assert.ok(maxMeanStep < 0.06, `whole-wall brightness jumped ${maxMeanStep.toFixed(3)} in one frame`);

    // The film restarts on DESCENT, so a look that gets the wall always sees its opening.
    club.vjDirector.beatNumber = 400; club.barPhase = 0;
    club.patternUndergroundSequence(colour, 900, audio);
    assert.equal(club._ug.b0, 400, 'a new appearance must begin at the current bar line');

    // All six scenes fire: probe the middle of each one directly.
    const starts = [0, 8, 14, 20, 24, 30];
    const seen = new Set();
    for (let s = 0; s < starts.length; s++) {
        club.vjDirector.beatNumber = 400 + (starts[s] + 2) * 4; club.barPhase = 0;
        club.patternUndergroundSequence(colour, 900 + s * 10, audio);
        club.vjDirector.beatNumber += 1; club.barPhase = 0.25;
        for (let k = 0; k < 20; k++) club.patternUndergroundSequence(colour, 900 + s * 10 + k / 60, audio);
        const print = panels.map(p => Math.round(lum(p) * 4)).join('');
        seen.add(print);
        assert.ok(panels.some(p => lum(p) > 0.05), `scene ${s} rendered a black wall`);
    }
    assert.equal(seen.size, 6, 'each scene must look different');

    // A slow frame (or a headset hitch) must not restart the film; a wall that was
    // handed to another pattern for a while must.
    let frame = 1000;
    club.scene = { getFrameId: () => frame };
    club.vjDirector.beatNumber = 800; club.barPhase = 0;
    club.patternUndergroundSequence(colour, 2000, audio);
    const b0 = club._ug.b0;
    club.vjDirector.beatNumber = 806; frame += 1;
    club.patternUndergroundSequence(colour, 2003.5, audio);          // 3.5 s later, next frame
    assert.equal(club._ug.b0, b0, 'a slow frame restarted the sequence');
    club.vjDirector.beatNumber = 840; frame += 40;
    club.patternUndergroundSequence(colour, 2010, audio);            // 40 frames skipped
    assert.equal(club._ug.b0, 840, 'a skipped stretch must restart the sequence at a bar line');
});

test('the breathing wall paints the show colour, so a harmony can reach it', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON });
    const panels = [];
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 21; col++) {
            panels.push({ col, row, colorBuffer: new BABYLON.Color3(), material: { emissiveColor: new BABYLON.Color3() } });
        }
    }
    const club = { ledPanels: panels, ledCols: 21, ledRows: 10, _ledColor2: new BABYLON.Color3() };
    Object.assign(club, window.LEDPatterns);
    const hue = (color) => {
        let r = 0, g = 0, b = 0;
        for (const t of [0, 1.3, 2.6, 3.9, 5.2]) {
            club.patternBreathing(color, t, null);
            for (const p of panels) { r += p.material.emissiveColor.r; g += p.material.emissiveColor.g; b += p.material.emissiveColor.b; }
        }
        return { r, g, b };
    };
    const cyan = hue(new BABYLON.Color3(0, 1, 1));
    assert.ok(cyan.r < cyan.g * 0.4 && cyan.g > 1, 'a cyan wall must be cyan, not the old fixed blue-to-red');
    const red = hue(new BABYLON.Color3(1, 0, 0));
    assert.ok(red.g < red.r * 0.4 && red.b < red.r * 0.4, 'a red wall must be red');
    // It must write through the panel's own buffer, never mutate a shared emissive colour.
    assert.ok(panels.every(p => p.material.emissiveColor === p.colorBuffer), 'breathing wrote into a shared colour');
});

test('warehouse shapes flash on the beat but never faster than the photosensitivity limit', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON });
    const cols = 21, rows = 10;
    const lum = p => (p.material.emissiveColor.r + p.material.emissiveColor.g + p.material.emissiveColor.b) / 3;

    const run = ({ bpm, energy, bass, safe = false, multi = false, seconds = 40, mono = false }) => {
        const panels = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                panels.push({ col, row, colorBuffer: new BABYLON.Color3(), material: { emissiveColor: new BABYLON.Color3() } });
            }
        }
        const club = {
            ledPanels: panels, ledCols: cols, ledRows: rows, ledMonochrome: mono, ledMulti: multi,
            photosensitiveSafeMode: safe, bpm, vjDirector: { beatNumber: 0 }, barPhase: 0, beatEnvelope: 0,
            showDirector: { _energy: energy }, ledAccentColor: new BABYLON.Color3(1, 0.3, 0)
        };
        Object.assign(club, window.LEDPatterns);
        const colour = new BABYLON.Color3(0, 0.6, 1);
        const audio = { hasAudio: true, bass, mid: bass * 0.6, treble: 0.3 };
        const prev = new Float32Array(panels.length), rising = new Int32Array(panels.length);
        const peakByProgram = new Map();
        let worstPanel = 0, lastMean = 0, maxStep = 0, peakMean = 0, finite = true, peakCoverage = 0;
        // Wall-level flash events: the wall's mean light rising by >= 0.08 within a few frames.
        // A panel only sees every other flash (shapes alternate), so only the wall-level count
        // can tell whether the governor is doing its job.
        const history = [];
        const events = [];
        const flashTimes = [];             // every flash the governor ACCEPTED
        let lastFlashAt = null;
        let lastEvent = -1, worstEventsPerSecond = 0;
        const frames = seconds * 60;
        for (let f = 0; f < frames; f++) {
            const beats = (f / 60) * bpm / 60 + 2.5;
            club.vjDirector.beatNumber = Math.floor(beats);
            club.barPhase = ((Math.floor(beats) % 4) + (beats - Math.floor(beats))) / 4;
            club.patternWarehouse(colour, 100 + f / 60, audio);
            let mean = 0;
            for (let i = 0; i < panels.length; i++) {
                const v = lum(panels[i]);
                if (!Number.isFinite(v)) finite = false;
                mean += v;
                if (prev[i] < 0.5 && v >= 0.5) rising[i]++;
                prev[i] = v;
            }
            mean /= panels.length;
            if (f > 60) { maxStep = Math.max(maxStep, Math.abs(mean - lastMean)); peakMean = Math.max(peakMean, mean); }
            lastMean = mean;
            if (f > 60) {
                let litPanels = 0;
                for (let i = 0; i < panels.length; i++) if (lum(panels[i]) > 0.1) litPanels++;
                peakCoverage = Math.max(peakCoverage, litPanels / panels.length);
            }
            history.push(mean);
            if (history.length > 4) history.shift();
            if (f > 60 && mean - Math.min(...history) >= 0.08 && f - lastEvent > 9) {
                lastEvent = f;
                events.push(f);
                const inWindow = events.filter(e => e > f - 60).length;
                worstEventsPerSecond = Math.max(worstEventsPerSecond, inWindow);
            }
            if (club._wh.flashAt !== lastFlashAt) { lastFlashAt = club._wh.flashAt; flashTimes.push(lastFlashAt); }
            const program = club._wh.program;
            peakByProgram.set(program, Math.max(peakByProgram.get(program) || 0, mean));
            if (f % 60 === 59) {
                for (let i = 0; i < panels.length; i++) { worstPanel = Math.max(worstPanel, rising[i]); rising[i] = 0; }
            }
        }
        return { worstPanel, maxStep, peakMean, finite, peakByProgram, worstEventsPerSecond, flashTimes, stride: club._wh.stride, peakCoverage };
    };

    // The flash limit holds at every tempo, including ones faster than three beats a second.
    const programs = new Set();
    for (const bpm of [96, 128, 150, 174, 200]) {
        const r = run({ bpm, energy: 0.45, bass: 1 });
        assert.ok(r.finite, `a non-finite colour at ${bpm} BPM`);
        assert.ok(r.worstPanel <= 3, `at ${bpm} BPM a panel crossed half brightness ${r.worstPanel}x in one second`);
        assert.ok(r.worstEventsPerSecond <= 3, `at ${bpm} BPM the wall flashed ${r.worstEventsPerSecond}x in one second`);
        // Shapes step at most 2.5 times a second: every other beat once the tempo passes 150 BPM.
        assert.equal(r.stride, bpm > 150 ? 2 : 1, `at ${bpm} BPM the shapes step every ${r.stride} beat(s)`);
        // The governor itself: no two accepted flashes closer than 0.4 s, whatever the tempo.
        const gaps = r.flashTimes.slice(1).map((t, i) => t - r.flashTimes[i]).filter(g => g < 1e6);
        assert.ok(gaps.length > 10, `at ${bpm} BPM the wall almost never flashed`);
        assert.ok(Math.min(...gaps) >= 0.399, `at ${bpm} BPM two flashes were ${Math.min(...gaps).toFixed(3)} s apart`);
        assert.ok(r.peakMean > 0.12, `at ${bpm} BPM the wall never lit up (peak mean ${r.peakMean.toFixed(2)})`);
        assert.ok(r.peakCoverage <= 0.85, `at ${bpm} BPM a program lit ${(r.peakCoverage * 100).toFixed(0)}% of the wall at once`);
        r.peakByProgram.forEach((_, p) => programs.add(p));
    }
    for (const energy of [0.08, 0.25]) {
        const r = run({ bpm: 128, energy, bass: energy * 2 });
        r.peakByProgram.forEach((_, p) => programs.add(p));
        assert.ok(r.peakCoverage <= 0.85, `at energy ${energy} a program lit ${(r.peakCoverage * 100).toFixed(0)}% of the wall at once`);
    }
    assert.equal(programs.size, 8, `only ${programs.size} of 8 shape programs ever played`);

    // Every program really lights the wall: none is a blank frame.
    const all = run({ bpm: 128, energy: 0.45, bass: 1, seconds: 90 });
    for (const [program, peak] of all.peakByProgram) assert.ok(peak > 0.08, `program ${program} rendered a dark wall`);

    // Energy is read: a loud peak lights far more of the wall than a quiet groove.
    const quiet = run({ bpm: 128, energy: 0.05, bass: 0.1 });
    const loud = run({ bpm: 128, energy: 0.45, bass: 1 });
    assert.ok(loud.peakMean > quiet.peakMean * 1.6, `a loud peak (${loud.peakMean.toFixed(2)}) must outshine a quiet groove (${quiet.peakMean.toFixed(2)})`);

    // Safe Mode keeps the shapes and moves them but removes the flash: nothing crosses half
    // brightness, the whole wall never steps abruptly, and the peak is lower.
    for (const bpm of [128, 174]) {
        const safe = run({ bpm, energy: 0.45, bass: 1, safe: true });
        assert.equal(safe.worstPanel, 0, `Safe Mode at ${bpm} BPM still flashed a panel`);
        assert.ok(safe.maxStep < 0.15, `Safe Mode stepped the whole wall by ${safe.maxStep.toFixed(3)} in one frame`);
        assert.ok(safe.peakMean > 0.05, 'Safe Mode must still show shapes, not a dark wall');
        assert.ok(safe.peakMean < loud.peakMean, 'Safe Mode must be dimmer at the peak than the normal wall');
    }

    // Colour modes: one colour stays one hue; multi brings in the accent; mono has no hue rule
    // here (the wall's monochrome backstop collapses it) but must still render.
    const hueSums = (opts) => {
        const panels = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                panels.push({ col, row, colorBuffer: new BABYLON.Color3(), material: { emissiveColor: new BABYLON.Color3() } });
            }
        }
        const club = {
            ledPanels: panels, ledCols: cols, ledRows: rows, ledMonochrome: false, ledMulti: opts.multi,
            bpm: 128, vjDirector: { beatNumber: 0 }, barPhase: 0, showDirector: { _energy: 0.45 },
            ledAccentColor: new BABYLON.Color3(1, 0, 0)
        };
        Object.assign(club, window.LEDPatterns);
        let r = 0, b = 0;
        for (let f = 0; f < 600; f++) {
            const beats = (f / 60) * 128 / 60 + 2.5;
            club.vjDirector.beatNumber = Math.floor(beats);
            club.barPhase = ((Math.floor(beats) % 4) + (beats - Math.floor(beats))) / 4;
            club.patternWarehouse(new BABYLON.Color3(0, 0, 1), 100 + f / 60, { hasAudio: true, bass: 0.8, mid: 0.5, treble: 0.3 });
            for (const p of panels) { const e = p.material.emissiveColor; if (e.r + e.g + e.b < 0.9 * 3 * 0.99) { r += e.r; b += e.b; } }
        }
        return { r, b };
    };
    const one = hueSums({ multi: false }), multi = hueSums({ multi: true });
    assert.ok(one.b > 0 && multi.b > 0, 'the wall colour must stay visible, not wash to white, in both colour modes');
    assert.ok(one.b > one.r * 3, 'a one-colour blue wall must stay blue (white-hot flashes aside)');
    assert.ok(multi.r > one.r * 2, 'a multi-colour wall must bring in its accent colour');
});

test('every LED wall pattern runs without throwing', () => {
    // 37 pattern functions with zero coverage: a typo in any one of them threw into
    // the render loop's catch and silently blanked the club's flagship element.
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON });
    const patterns = window.LEDPatterns;
    assert.ok(patterns && Object.keys(patterns).length > 0, 'LEDPatterns is empty');

    const cols = 28;
    const rows = 10;
    const panels = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            panels.push({
                col, row,
                // Panels carry a per-panel scratch colour so updateLEDPanel() can write
                // in place rather than allocating one Color3 per panel per frame.
                colorBuffer: new BABYLON.Color3(),
                material: { emissiveColor: new BABYLON.Color3() }
            });
        }
    }
    const colour = new BABYLON.Color3(1, 0.2, 0.4);
    const audio = { bass: 0.5, mid: 0.4, treble: 0.3, average: 0.4, hasAudio: true };

    const club = {
        ledPanels: panels,
        ledCols: cols,
        ledRows: rows,
        ledTime: 3.5,
        ledMonochrome: false,
        bpm: 128,
        beatInterval: 60 / 128,
        beatEnvelope: 0.5,
        barPhase: 0.25,
        _ledColor: new BABYLON.Color3(),
        _ledColor2: new BABYLON.Color3(),
        cachedColors: {
            red: new BABYLON.Color3(1, 0, 0), green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1), white: new BABYLON.Color3(1, 1, 1),
            black: new BABYLON.Color3(0, 0, 0), cyan: new BABYLON.Color3(0, 1, 1),
            magenta: new BABYLON.Color3(1, 0, 1), yellow: new BABYLON.Color3(1, 1, 0),
            orange: new BABYLON.Color3(1, 0.5, 0), purple: new BABYLON.Color3(0.5, 0, 1),
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            ledMonoCool: new BABYLON.Color3(0.86, 0.92, 1),
            ledMonoWarm: new BABYLON.Color3(1, 0.95, 0.86)
        },
        cachedLEDColors: {
            matrixGreen: new BABYLON.Color3(0, 1, 0.2), auroraTeal: new BABYLON.Color3(0, 1, 1),
            oceanBlue: new BABYLON.Color3(0, 0.5, 1), heartRed: new BABYLON.Color3(1, 0.1, 0.2),
            fireOrange: new BABYLON.Color3(1, 0.6, 0)
        }
    };

    const failures = [];
    // The real app mixes LEDPatterns into VRClub.prototype, so the patterns call each
    // other and the shared helpers through `this`. Mirror that here.
    Object.assign(club, patterns);

    for (const [name, fn] of Object.entries(patterns)) {
        if (typeof fn !== 'function' || !name.startsWith('pattern')) continue;
        // Run twice: several patterns lazily allocate state on the first call, so a
        // one-shot smoke test misses bugs on the steady-state path.
        for (let i = 0; i < 2; i++) {
            try {
                fn.call(club, colour, 3.5 + i, audio);
            } catch (err) {
                failures.push(`${name}: ${err.message}`);
                break;
            }
        }
    }
    assert.deepEqual(failures, [], `LED patterns threw:\n${failures.join('\n')}`);

    // Every panel must end with a finite colour; a NaN propagates into the material
    // and renders as black for the rest of the session.
    const bad = panels.filter(p => !Number.isFinite(p.material.emissiveColor.r));
    assert.equal(bad.length, 0, 'a pattern wrote a non-finite colour');
});

test('per-frame exposure never dirties every material, and a strobe spike survives eye adaptation', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const proto = window.VRClubAnimationCore.prototype;

    // Mirrors Babylon's ImageProcessingConfiguration: the public setter notifies
    // every observing material, which then walks every mesh in the scene.
    let notifications = 0;
    const config = {
        _exposure: 1.2,
        get exposure() { return this._exposure; },
        set exposure(v) { if (v !== this._exposure) { this._exposure = v; notifications++; } }
    };
    const imageProcessing = {
        imageProcessingConfiguration: config,
        get exposure() { return config.exposure; },
        set exposure(v) { config.exposure = v; }
    };
    const club = {
        renderPipeline: { imageProcessing },
        vrSettings: { desktop: { exposure: 1.2 }, vr: { exposure: 1.35 } },
        isInVRMode: false,
        _adaptedExposure: null,
        masterIntensity: 1,
        lightsActive: true,
        ledWallActive: true,
        strobesActive: false,
        photosensitiveSafeMode: false,
        _writeExposure: proto._writeExposure
    };

    for (let i = 0; i < 120; i++) proto.updateEyeAdaptation.call(club, { dtScale: 1, beat: i % 2 });
    assert.equal(notifications, 0, 'eye adaptation notified image-processing observers per frame');
    assert.ok(config.exposure < 1.2, 'a bright rig did not stop the iris down');
    assert.equal(config.exposure, club._adaptedExposure, 'adapted exposure never reached the post-process');

    // A value of exactly 1 toggles the EXPOSURE shader define, so it must notify.
    proto._writeExposure.call(club, 1);
    assert.equal(notifications, 1, 'crossing exposure 1 skipped the define update');
    proto._writeExposure.call(club, 1.1);
    assert.equal(notifications, 2, 'leaving exposure 1 skipped the define update');

    // updateStrobes runs first; eye adaptation must not cancel its flash frame.
    club._preStrobeExposure = 1.1;
    proto._writeExposure.call(club, 2.1);
    proto.updateEyeAdaptation.call(club, { dtScale: 1, beat: 0 });
    assert.equal(config.exposure, 2.1, 'eye adaptation overwrote the strobe exposure spike');
});

test('safe mode keeps the dance-floor strip from strobing in the legacy strobe phase', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/08-animation-fixtures.js', {
        BABYLON,
        VRClubAnimationCore: class {}
    });
    const hardSwitches = (safe) => {
        const led = { material: { emissiveColor: new BABYLON.Color3() } };
        const club = { danceFloorLEDs: [led], lightingPhase: 'strobe_attack', photosensitiveSafeMode: safe };
        let previous = null;
        let switches = 0;
        for (let frame = 0; frame < 120; frame++) {
            window.VRClubAnimationFixtures.prototype.updateDanceFloorLEDs.call(club, {
                time: frame / 60,
                audio: { bass: 0.5, mid: 0.5 }
            });
            const c = led.material.emissiveColor;
            const level = (c.r + c.g + c.b) / 3;
            if (previous !== null && Math.abs(level - previous) > 0.5) switches++;
            previous = level;
        }
        return switches;
    };
    assert.ok(hardSwitches(false) > 4, 'control: the strobe phase should flash without Safe Mode');
    assert.equal(hardSwitches(true), 0, 'Safe Mode let the floor strip strobe');
});

test('master dimming keeps the LED wall live below the old blackout threshold', () => {
    const BABYLON = makeBabylonStub();
    const { window: fixturesWindow } = loadClassic('js/club/08-animation-fixtures.js', {
        BABYLON,
        VRClubAnimationCore: class {}
    });
    const { window: finishWindow } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const panel = {
        row: 0,
        col: 0,
        colorBuffer: new BABYLON.Color3(),
        material: { emissiveColor: new BABYLON.Color3() }
    };
    const club = {
        ledWallActive: true,
        masterIntensity: 0.01,
        ledWallLevel: 1,
        ledPanels: [panel],
        _flushLedWall() {},
        _applyLedLevel: finishWindow.VRClubAnimationFinish.prototype._applyLedLevel,
        updateLEDWall(time) {
            panel.colorBuffer.set(1, 0.5, 0.25);
            panel.material.emissiveColor = panel.colorBuffer;
            this._applyLedLevel(time);
        }
    };

    for (let frame = 0; frame < 90; frame++) {
        fixturesWindow.VRClubAnimationFixtures.prototype.updateLEDWallPass.call(club, {
            time: frame / 60,
            audio: { hasAudio: false }
        });
    }
    assert.ok(panel.material.emissiveColor.r > 0, 'the wall still blacked out below the old threshold');
    assert.ok(panel.material.emissiveColor.r < 0.02, 'the wall ignored the low master level');

    club.masterIntensity = 0;
    for (let frame = 90; frame < 180; frame++) {
        fixturesWindow.VRClubAnimationFixtures.prototype.updateLEDWallPass.call(club, {
            time: frame / 60,
            audio: { hasAudio: false }
        });
    }
    assert.ok(panel.material.emissiveColor.r < 1e-3, 'zero master did not black the wall');
});

test('strobe bursts light immediately and safe mode restores the scene', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const material = { emissiveColor: new BABYLON.Color3() };
    const flashLight = {
        enabled: false,
        intensity: 0,
        setEnabled(value) { this.enabled = value; }
    };
    const renderPipeline = {
        bloomEnabled: true,
        bloomWeight: 0.45,
        imageProcessing: { exposure: 1.22 }
    };
    const ambient = { intensity: 0.06 };
    const retinalFlash = { color: { a: 0 } };
    const club = {
        strobesActive: true,
        photosensitiveSafeMode: false,
        strobeSpeed: 1,
        vjDropActive: false,
        vjBuildIntensity: 0,
        masterIntensity: 1,
        cachedColors: {
            black: new BABYLON.Color3(0, 0, 0),
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7)
        },
        strobes: [{ material, light: null, flashDuration: 0, currentIntensity: 0 }],
        strobeFlashLight: flashLight,
        renderPipeline,
        scene: { getLightByName: name => name === 'ambient' ? ambient : null },
        strobeRetinalFlash: retinalFlash,
        vrSettings: { vr: { strobeImpulse: { ambient: 1.0, retinal: 0.06, exposure: 0.9 } } },
        isInVRMode: true
    };
    const { window: coreWindow } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    club._writeExposure = coreWindow.VRClubAnimationCore.prototype._writeExposure;

    window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
        time: 10,
        dt: 1 / 60,
        audio: { bass: 0, hasAudio: false }
    });

    assert.ok(material.emissiveColor.r > 0, 'new strobe burst started on a dark frame');
    assert.equal(flashLight.enabled, false, 'strobe flash light must stay disabled so it never takes a slot');
    assert.ok(flashLight.intensity >= 1000, 'shared strobe light was not bright enough');
    assert.ok(club.strobes[0].flashDuration <= 0.09, 'strobe burst was not brief');
    assert.equal(renderPipeline.bloomWeight, 1, 'strobe did not drive full bloom');
    const impulse = club.vrSettings.vr.strobeImpulse;
    assert.equal(renderPipeline.imageProcessing.exposure, impulse.exposure, 'VR strobe did not spike exposure to the configured level');
    assert.equal(ambient.intensity, impulse.ambient, 'VR strobe did not light the room to the configured level');
    assert.equal(retinalFlash.color.a, impulse.retinal, 'VR strobe did not create the configured retinal glare');

    club.photosensitiveSafeMode = true;
    window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
        time: 10.01,
        dt: 1 / 60,
        audio: { bass: 0, hasAudio: false }
    });
    assert.equal(renderPipeline.bloomWeight, 0.45, 'Safe Mode did not restore bloom');
    assert.equal(renderPipeline.imageProcessing.exposure, 1.22, 'Safe Mode did not restore exposure');
    assert.equal(ambient.intensity, 0.06, 'Safe Mode did not restore room lighting');
    assert.equal(retinalFlash.color.a, 0, 'Safe Mode did not clear retinal glare');
});

test('master dimming scales the strobe room impulse from blackout to full', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const { window: coreWindow } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const renderImpulse = (master) => {
        const material = { emissiveColor: new BABYLON.Color3() };
        const flashLight = { intensity: 0, setEnabled() {} };
        const renderPipeline = {
            bloomEnabled: true,
            bloomWeight: 0.45,
            imageProcessing: { exposure: 1.22 }
        };
        const ambient = { intensity: 0.06 };
        const retinalFlash = { color: { a: 0 } };
        const club = {
            strobesActive: true,
            photosensitiveSafeMode: false,
            strobePattern: 'all',
            strobeSpeed: 1,
            vjDropActive: false,
            vjBuildIntensity: 0,
            masterIntensity: master,
            cachedColors: {
                black: new BABYLON.Color3(0, 0, 0),
                ledMonoWhite: new BABYLON.Color3(1, 1, 1),
                warmWhite: new BABYLON.Color3(1, 0.9, 0.7)
            },
            strobes: [{ material, light: null, flashDuration: 0, currentIntensity: 0 }],
            strobeFlashLight: flashLight,
            renderPipeline,
            scene: { getLightByName: name => name === 'ambient' ? ambient : null },
            strobeRetinalFlash: retinalFlash,
            vrSettings: { vr: { strobeImpulse: { ambient: 1.0, retinal: 0.06, exposure: 0.9 } } },
            isInVRMode: true,
            _writeExposure: coreWindow.VRClubAnimationCore.prototype._writeExposure
        };
        window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
            time: 10,
            dt: 1 / 60,
            audio: { bass: 0, hasAudio: false }
        });
        return {
            light: flashLight.intensity,
            ambient: ambient.intensity,
            retinal: retinalFlash.color.a,
            exposure: renderPipeline.imageProcessing.exposure,
            bloom: renderPipeline.bloomWeight
        };
    };

    const off = renderImpulse(0);
    const half = renderImpulse(0.5);
    const full = renderImpulse(1);
    assert.equal(off.light, 0, 'zero master still lit the shared strobe flash');
    assert.equal(off.ambient, 0.06, 'zero master still lit the room impulse');
    assert.equal(off.retinal, 0, 'zero master still applied retinal glare');
    assert.equal(off.exposure, 1.22, 'zero master still spiked exposure');
    assert.equal(off.bloom, 0.45, 'zero master still spiked bloom');
    assert.ok(half.light > 0 && half.light < full.light, 'half master did not dim the shared strobe flash');
    assert.ok(half.ambient > off.ambient && half.ambient < full.ambient, 'half master did not dim the room impulse');
    assert.ok(half.retinal > 0 && half.retinal < full.retinal, 'half master did not dim the retinal flash');
    assert.ok(half.exposure < off.exposure && half.exposure > full.exposure, 'half master did not dim the exposure spike');
    assert.ok(half.bloom > off.bloom && half.bloom < full.bloom, 'half master did not dim the bloom spike');
});

// A burst is only 20-90 ms long, which is shorter than a frame on a loaded headset. The flash
// timer used to be decremented BEFORE it was checked, so on any frame longer than the burst it
// was lit and cleared in the same pass and never reached the screen: strobes silently vanished
// whenever the frame rate dipped. Every burst must be visible for at least one rendered frame.
test('a strobe burst is visible for at least one frame at any frame time', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const makeClub = (speed) => ({
        strobesActive: true,
        photosensitiveSafeMode: false,
        strobePattern: 'all',
        strobeSpeed: speed,
        vjDropActive: false,
        vjBuildIntensity: 0,
        masterIntensity: 1,
        cachedColors: { ledMonoWhite: new BABYLON.Color3(1, 1, 1), warmWhite: new BABYLON.Color3(1, 0.9, 0.7) },
        strobes: Array.from({ length: 4 }, () => ({
            material: { emissiveColor: new BABYLON.Color3() }, light: null, flashDuration: 0, currentIntensity: 0
        })),
        strobeFlashLight: { intensity: 0, setEnabled() {} },
        _nextStrobeBurstTime: 0
    });
    const lit = club => club.strobes.some(s => s.material.emissiveColor.r > 0);
    const step = (club, time, dt) => window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
        time, dt, audio: { bass: 0, hasAudio: false }
    });

    for (const speed of [1, 2.0, 2.4]) {
        for (const dt of [1 / 90, 1 / 72, 1 / 45, 1 / 36, 1 / 20, 4 / 60]) {
            const club = makeClub(speed);
            step(club, 10, dt);
            assert.ok(lit(club), `speed ${speed}, ${(dt * 1000).toFixed(1)} ms frame: the burst never reached the screen`);
            let litMs = dt * 1000;
            let frames = 1;
            while (lit(club) && frames < 200) {
                // Keep every later frame inside the burst interval so no second burst starts.
                club._nextStrobeBurstTime = 1e9;
                step(club, 10 + frames * dt, dt);
                if (lit(club)) litMs += dt * 1000;
                frames++;
            }
            assert.ok(!lit(club), `speed ${speed}, ${(dt * 1000).toFixed(1)} ms frame: the burst never ended`);
            // One frame of grace on top of the designed 90 ms ceiling.
            assert.ok(litMs <= 90 + dt * 1000 + 1e-6, `speed ${speed}, ${(dt * 1000).toFixed(1)} ms frame: lit for ${litMs.toFixed(0)} ms`);
        }
    }
});

// A strobe is a stab of light. At 72 Hz it must be lit for about 3 frames, and the free-running
// timer (manual VJ mode, drops) must stay under three flashes a second at any speed: it used to
// run 90 ms bursts, and up to 9 a second in a drop, so the room read as lit most of the time.
test('strobes are short stabs, and the free-running timer never exceeds three flashes a second', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const simulate = ({ speed, drop, hz, seconds }) => {
        const club = {
            strobesActive: true, photosensitiveSafeMode: false, strobePattern: 'all',
            strobeSpeed: speed, vjDropActive: drop, vjBuildIntensity: 0, masterIntensity: 1,
            cachedColors: { ledMonoWhite: new BABYLON.Color3(1, 1, 1) },
            strobes: Array.from({ length: 4 }, () => ({
                material: { emissiveColor: new BABYLON.Color3() }, light: null, flashDuration: 0, currentIntensity: 0
            })),
            strobeFlashLight: { intensity: 0, setEnabled() {} }
        };
        const dt = 1 / hz;
        let bursts = 0, litFrames = 0, wasLit = false, longestRun = 0, run = 0;
        for (let frame = 0; frame < seconds * hz; frame++) {
            window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
                time: 10 + frame * dt, dt, audio: { bass: 0, hasAudio: false }
            });
            const lit = club.strobes.some(s => s.material.emissiveColor.r > 0);
            if (lit) { litFrames++; run++; longestRun = Math.max(longestRun, run); } else run = 0;
            if (lit && !wasLit) bursts++;
            wasLit = lit;
        }
        return { perSecond: bursts / seconds, duty: litFrames / (seconds * hz), longestMs: longestRun * dt * 1000 };
    };

    for (const hz of [72, 90, 120, 45]) {
        for (const [speed, drop] of [[1, false], [2.4, false], [3, false], [1, true], [3, true]]) {
            const label = `${hz} Hz, speed ${speed}${drop ? ', drop' : ''}`;
            const result = simulate({ speed, drop, hz, seconds: 30 });
            assert.ok(result.perSecond <= 3.0, `${label}: ${result.perSecond.toFixed(2)} flashes a second`);
            // One burst is at most ~3 frames plus the frame it fires on: about 55 ms at 72 Hz.
            assert.ok(result.longestMs <= Math.max(60, 4 * 1000 / hz) + 1e-6, `${label}: one burst lasted ${result.longestMs.toFixed(0)} ms`);
            assert.ok(result.duty <= 0.15, `${label}: the room is lit ${(result.duty * 100).toFixed(0)}% of the time`);
        }
    }
});

test('headset MSAA follows the config, never exceeds the GPU, and can be overridden', () => {
    const store = new Map();
    const localStorage = { getItem: key => (store.has(key) ? store.get(key) : null) };
    const { window } = loadClassic('js/club/01-core.js', { localStorage });
    const resolve = window.VRClubCore.resolveVRMsaaSamples;
    assert.equal(resolve(4, 4), 4, 'the default is 4x where the GPU supports it');
    assert.equal(resolve(4, 8), 4);
    assert.equal(resolve(4, 2), 2, 'clamped to what the GPU supports');
    assert.equal(resolve(4, 1), 1);
    assert.equal(resolve(4, undefined), 1, 'unknown capability falls back to no MSAA');
    assert.equal(resolve(4, 0), 1);
    assert.equal(resolve(3, 4), 2, 'only powers of two are used');
    store.set('vrclub.vrMsaa', '2');
    assert.equal(resolve(4, 4), 2, 'a stored override wins');
    store.set('vrclub.vrMsaa', '1');
    assert.equal(resolve(4, 4), 1);
    store.set('vrclub.vrMsaa', '16');
    assert.equal(resolve(4, 4), 4, 'an invalid override is ignored');
    assert.equal(loadClassic('js/club/01-core.js', { localStorage: { getItem() { throw new Error('private'); } } })
        .window.VRClubCore.resolveVRMsaaSamples(4, 4), 4, 'unreadable storage uses the default');

    // The headset pipeline must use it: the XR layer's own antialias never reaches the offscreen target.
    const core = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    assert.match(core, /renderPipeline\.samples = VRClubCore\.resolveVRMsaaSamples\(/);
    assert.ok(!/renderPipeline\.samples = 1;/.test(core.slice(core.indexOf('applyVRSettings('), core.indexOf('applyDesktopSettings()'))),
        'the headset pipeline is back to no MSAA');
});

test('switching strobes on by hand resets a leftover show speed, but never a guest-chosen one', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {} });
    const apply = window.VRClubUI.prototype.applyFixtureExclusivity;
    const club = (driving, speed) => ({
        strobesActive: true, strobeSpeed: speed,
        showDirector: { isDriving: () => driving }
    });
    // After the countdown the show leaves 4.8 behind; the next free-running burst would be a stutter.
    const handedOver = club(true, 4.8);
    assert.equal(apply.call(handedOver, 'strobesActive'), null);
    assert.equal(handedOver.strobeSpeed, 1, 'the show speed leaked into the manual strobe');
    // Already in manual mode: the speed is the guest's own (slider), so it stays.
    const manual = club(false, 1.7);
    apply.call(manual, 'strobesActive');
    assert.equal(manual.strobeSpeed, 1.7);
    // Switching strobes OFF changes nothing.
    const off = club(true, 4.8);
    off.strobesActive = false;
    apply.call(off, 'strobesActive');
    assert.equal(off.strobeSpeed, 4.8);
    // No director at all must not throw.
    assert.doesNotThrow(() => apply.call({ strobesActive: true, strobeSpeed: 2 }, 'strobesActive'));
});

test('strobe chase randomizes corners and cadence without immediate repeats', () => {
    const BABYLON = makeBabylonStub();
    const randomValues = [
        0.1, 0.99, 0.1,
        0.2, 0.8, 0.9,
        0.3, 0.2, 0.3,
        0.4, 0.9, 0.7
    ];
    let randomIndex = 0;
    const testMath = Object.create(Math);
    testMath.random = () => randomValues[randomIndex++ % randomValues.length];
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {},
        Math: testMath
    });
    const strobes = Array.from({ length: 4 }, () => ({
        material: { emissiveColor: new BABYLON.Color3() },
        light: null,
        flashDuration: 0,
        currentIntensity: 0
    }));
    const club = {
        strobesActive: true,
        photosensitiveSafeMode: false,
        strobePattern: 'chase',
        strobeSpeed: 1,
        vjDropActive: false,
        vjBuildIntensity: 0,
        masterIntensity: 1,
        cachedColors: {
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7)
        },
        strobes,
        strobeFlashLight: { intensity: 0, setEnabled() {} }
    };
    const order = [];
    const intervals = [];

    for (let burst = 0; burst < 4; burst++) {
        strobes.forEach(strobe => { strobe.flashDuration = 0; });
        club._nextStrobeBurstTime = undefined;
        window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
            time: burst + 1,
            dt: 1 / 60,
            audio: { bass: 0, hasAudio: false }
        });
        const lit = strobes.flatMap((strobe, index) => strobe.material.emissiveColor.r > 0 ? [index] : []);
        assert.equal(lit.length, 1, `burst ${burst} lit ${lit.length} corners`);
        order.push(lit[0]);
        intervals.push(club._nextStrobeBurstTime - (burst + 1));
    }

    assert.equal(order[0], 3, 'the first burst must be able to select the last fixture');
    assert.ok(order.every((corner, index) => index === 0 || corner !== order[index - 1]));
    assert.deepEqual(intervals.map(value => Number(value.toFixed(3))), [0.455, 0.975, 0.585, 0.845]);
});

test('strobes fire on the beat grid when the show drives, and on their own timer otherwise', () => {
    const BABYLON = makeBabylonStub();
    let clock = 50000;
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON, VRClubAnimationFixtures: class {}, performance: { now: () => clock }
    });
    const proto = window.VRClubAnimationFinish.prototype;
    const makeClub = (sync, pattern = 'all') => {
        const club = Object.create(proto);
        Object.assign(club, {
            strobesActive: true, photosensitiveSafeMode: false, strobePattern: pattern, strobeSync: sync,
            strobeSpeed: 1, vjDropActive: false, vjBuildIntensity: 0, masterIntensity: 1,
            cachedColors: { ledMonoWhite: new BABYLON.Color3(1, 1, 1) },
            strobes: Array.from({ length: 4 }, () => ({
                material: { emissiveColor: new BABYLON.Color3() }, light: null, flashDuration: 0, currentIntensity: 0
            })),
            strobeFlashLight: { intensity: 0, setEnabled() {} },
            vjDirector: { beatNumber: 0, bpm: 120, lastBeatAt: clock },
            showDirector: { isDriving: () => true, _beatInBar: 0 }
        });
        return club;
    };
    const fires = (club, ms) => {
        club.strobes.forEach(s => { s.flashDuration = 0; });
        const before = club.strobes.map(s => s.material.emissiveColor.r);
        proto.updateStrobes.call(club, { time: clock / 1000, dt: ms / 1000, audio: { bass: 0 } });
        return club.strobes.some((s, i) => s.material.emissiveColor.r > 0 && before[i] === 0 || s.flashDuration > 0);
    };
    // 120 BPM = a beat every 500 ms; step in 50 ms frames and record when bursts fire.
    const run = (club, beats) => {
        const hits = [];
        for (let t = 0; t < beats * 500; t += 50) {
            clock += 50;
            if (clock - club.vjDirector.lastBeatAt >= 500) {
                club.vjDirector.lastBeatAt = clock;
                club.vjDirector.beatNumber++;
                club.showDirector._beatInBar = (club.showDirector._beatInBar + 1) % 4;
            }
            if (fires(club, 50)) hits.push({ beat: club.vjDirector.beatNumber, sinceBeat: clock - club.vjDirector.lastBeatAt });
        }
        return hits;
    };

    const onBeat = run(makeClub('beat'), 8);
    assert.ok(onBeat.length >= 7 && onBeat.length <= 8, `beat sync fired ${onBeat.length} times in 8 beats`);
    assert.ok(onBeat.every(h => h.sinceBeat <= 50), 'a beat-locked strobe fired away from the kick');

    const offbeat = run(makeClub('offbeat'), 8);
    assert.ok(offbeat.length >= 7 && offbeat.length <= 8, `offbeat sync fired ${offbeat.length} times`);
    assert.ok(offbeat.every(h => h.sinceBeat >= 250 && h.sinceBeat <= 350), 'an offbeat strobe fired on the kick');

    const bar = run(makeClub('bar'), 16);
    assert.ok(bar.length >= 3 && bar.length <= 4, `bar sync fired ${bar.length} times in 4 bars`);

    const roll = run(makeClub('roll'), 8);
    assert.ok(roll.length >= 14, `the roll fired only ${roll.length} times in 8 beats`);

    // A free look keeps the legacy random timer (no beat edges needed).
    const free = makeClub('free');
    assert.equal(fires(free, 50), true);

    // Without a driving show the grid is ignored.
    const manual = makeClub('beat');
    manual.showDirector.isDriving = () => false;
    assert.equal(manual._strobeSyncDue(), null);
});

test('a synced chase steps through the corners in order; Safe Mode never fires a synced strobe', () => {
    const BABYLON = makeBabylonStub();
    let clock = 80000;
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON, VRClubAnimationFixtures: class {}, performance: { now: () => clock }
    });
    const proto = window.VRClubAnimationFinish.prototype;
    const club = Object.create(proto);
    Object.assign(club, {
        strobesActive: true, photosensitiveSafeMode: false, strobePattern: 'chase', strobeSync: 'beat',
        strobeSpeed: 1, vjDropActive: false, vjBuildIntensity: 0, masterIntensity: 1,
        cachedColors: { ledMonoWhite: new BABYLON.Color3(1, 1, 1) },
        strobes: Array.from({ length: 4 }, () => ({
            material: { emissiveColor: new BABYLON.Color3() }, light: null, flashDuration: 0, currentIntensity: 0
        })),
        strobeFlashLight: { intensity: 0, setEnabled() {} },
        vjDirector: { beatNumber: 0, bpm: 120, lastBeatAt: clock },
        showDirector: { isDriving: () => true, _beatInBar: 0 }
    });
    const corners = [];
    const frame = () => proto.updateStrobes.call(club, { time: clock / 1000, dt: 0.05, audio: { bass: 0 } });
    frame();                                    // prime: adopt the current beat silently
    for (let beat = 1; beat <= 8; beat++) {
        club.strobes.forEach(s => { s.flashDuration = 0; s.material.emissiveColor.set(0, 0, 0); });
        clock += 50;
        club.vjDirector.beatNumber = beat;
        club.vjDirector.lastBeatAt = clock;
        frame();
        const lit = club.strobes.flatMap((s, i) => s.material.emissiveColor.r > 0 ? [i] : []);
        assert.equal(lit.length, 1, `beat ${beat} lit ${lit.length} corners`);
        corners.push(lit[0]);
        for (let i = 0; i < 9; i++) { clock += 50; frame(); }   // rest of the beat, no new edge
    }
    assert.deepEqual(corners, [0, 1, 2, 3, 0, 1, 2, 3]);

    club.photosensitiveSafeMode = true;
    club.strobes.forEach(s => { s.material.emissiveColor.set(0, 0, 0); });
    clock += 50;
    club.vjDirector.beatNumber++;
    club.vjDirector.lastBeatAt = clock;
    frame();
    assert.ok(club.strobes.every(s => s.material.emissiveColor.r === 0), 'Safe Mode let a synced strobe fire');
});

test('strobes are a real part of the show, locked to the grid, and the countdown climbs it', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = { vjManualMode: false, photosensitiveSafeMode: false, vjDirector: { paletteMode: 'analogous' } };
    const director = new window.ShowDirector(club);

    // Every strobing look sits on the grid; only the countdown base opens on the bar.
    for (const [name, look] of Object.entries(director.looks)) {
        if (look.strobesActive === true) {
            assert.ok(['beat', 'offbeat', 'bar', 'roll'].includes(look.strobeSync), `strobing look "${name}" is on a random timer`);
        }
    }
    // A look that does not declare a sync mode must not inherit the previous one.
    director._applyLook(director.looks.strobeFloor);
    assert.equal(club.strobeSync, 'beat');
    director._applyLook(director.looks.theWave);
    assert.equal(club.strobeSync, 'free');

    // Strobes are a real part of the whole show, not only the peak: an accent under the groove and
    // the build, the headline in the peak. Only the opening stays clean so the room can build.
    const barsWithStrobes = (movement) => director.movements[movement].cues
        .filter(cue => director.looks[cue.look].strobesActive === true)
        .reduce((sum, cue) => sum + cue.bars, 0);
    assert.ok(barsWithStrobes('ascent') >= 12, 'the build has too few strobe bars');
    assert.ok(barsWithStrobes('ignition') >= 10, `the peak has only ${barsWithStrobes('ignition')} strobe bars`);
    assert.ok(barsWithStrobes('pulse') >= 16, `the groove has only ${barsWithStrobes('pulse')} strobe bars`);
    assert.equal(barsWithStrobes('arrival'), 0, 'the opening must stay strobe-free');

    // Every strobe layered under another subject is a once-per-bar accent (about 0.5 flashes a
    // second at any tempo), so the added tension can never become a fast stutter. Only a strobe
    // look with nothing else running may use the faster beat grid.
    const layered = ['lightsActive', 'lasersActive', 'laserSheetActive', 'mirrorBallActive'];
    // The two designed everything-at-once peak hits (a bar or two long) may layer faster hits.
    const fastLayeredAllowed = new Set(['detonation', 'releaseHit']);
    for (const [name, look] of Object.entries(director.looks)) {
        if (look.strobesActive !== true || !layered.some(system => look[system] === true)) continue;
        if (fastLayeredAllowed.has(name)) continue;
        assert.equal(look.strobeSync, 'bar', `"${name}" layers a strobe on another subject faster than once a bar`);
    }
    // The breakdown arc stays strobe-free.
    for (const name of ['bdFall', 'bdSheet', 'bdAurora', 'bdRise']) {
        assert.ok(!director.looks[name] || director.looks[name].strobesActive !== true, `${name} must stay strobe-free`);
    }

    // The countdown ladder: once a bar, every kick, then the kick-and-offbeat roll.
    const rungs = [];
    for (let bar = 0; bar < 4; bar++) {
        director.setPieces.countdown.onBar(director, bar);
        rungs.push(club.strobeSync);
    }
    assert.deepEqual(rungs, ['bar', 'beat', 'roll', 'roll']);

    // Safe Mode: no strobe look strobes, and the countdown does not turn them back on.
    club.photosensitiveSafeMode = true;
    for (const name of Object.keys(director.looks)) {
        director._applyLook(director.looks[name]);
        assert.equal(club.strobesActive, false, `${name} strobes in Safe Mode`);
    }
    director.setPieces.countdown.onBar(director, 3);
    assert.equal(club.strobesActive, false);
});

test('VR comfort swaps mutually exclusive movement and teleportation features without changing show ownership', () => {
    const saved = new Map();
    const names = { MOVEMENT: 'xr-controller-movement', TELEPORTATION: 'xr-controller-teleportation' };
    const conflicts = { [names.MOVEMENT]: names.TELEPORTATION, [names.TELEPORTATION]: names.MOVEMENT };
    // Mirrors Babylon 8.30.5 (and 9.28.0) WebXRFeaturesManager: enabling a conflicting feature throws.
    const enabled = new Map();
    const featuresManager = {
        getEnabledFeature: name => enabled.get(name),
        disableFeature: name => enabled.delete(name),
        enableFeature(name, _version, options) {
            if (enabled.has(conflicts[name])) {
                throw new Error(`Feature ${name} cannot be enabled while ${conflicts[name]} is enabled.`);
            }
            const feature = {
                name, options, setSelectionFeature(sel) { this.selection = sel; },
                // Babylon 8.30.5 (and 9.28.0) WebXRMotionControllerTeleportation blocker API.
                addBlockerMesh(mesh) { (this.options.pickBlockerMeshes ||= []).push(mesh); },
                removeBlockerMesh(mesh) {
                    const list = this.options.pickBlockerMeshes || [];
                    const index = list.indexOf(mesh);
                    if (index !== -1) list.splice(index, 1);
                },
                // ...and its floor API.
                addFloorMesh(mesh) { (this.options.floorMeshes ||= []).push(mesh); },
                removeFloorMesh(mesh) {
                    const list = this.options.floorMeshes || [];
                    const index = list.indexOf(mesh);
                    if (index !== -1) list.splice(index, 1);
                }
            };
            enabled.set(name, feature);
            return feature;
        }
    };
    const { window } = loadClassic('js/club/10-ui.js', {
        VRClubAnimationFinish: class {},
        localStorage: { setItem: (key, value) => saved.set(key, value) },
        BABYLON: { WebXRFeatureName: names, WebXRState: { IN_XR: 2, NOT_IN_XR: 3 } },
        log: { error: (...args) => { throw new Error(args.join(' ')); } }
    });
    const originalTeleport = featuresManager.enableFeature(names.TELEPORTATION, 'latest', {});
    const sceneMeshes = new Map(['frontWall', 'backWall', 'leftWall', 'rightWall', 'djPlatform', 'djPlatformTop']
        .map(name => [name, { name }]));
    const club = {
        vjManualMode: false,
        movementFeature: null,
        floorMesh: { name: 'floor' },
        _mezzDeck: { name: 'mezzDeck' },
        scene: { getMeshByName: name => sceneMeshes.get(name) || null },
        vrHelper: {
            input: { name: 'input' },
            pointerSelection: { name: 'pointer' },
            teleportation: originalTeleport,
            baseExperience: { camera: {}, featuresManager, state: 2 }
        },
        jumpState: { active: true },
        _refreshVRQuickMenu() {}
    };
    Object.setPrototypeOf(club, window.VRClubUI.prototype);

    club.setVRComfortMode(true);
    assert.equal(club.movementFeature, null);
    assert.equal(club.vrHelper.teleportation, originalTeleport);
    assert.equal(club.vrHelper.teleportation.teleportationEnabled, true);
    assert.equal(club.vrHelper.teleportation.rotationEnabled, true);
    assert.equal(club.vrHelper.teleportation.backwardsMovementEnabled, false);
    assert.equal(club.vrHelper.teleportation.rotationAngle, Math.PI / 6);
    assert.equal(club.vrHelper.baseExperience.camera.applyGravity, false);
    assert.equal(club.jumpState.active, false);
    assert.equal(saved.get('vrclub.vrComfort'), '1');

    club.setVRComfortMode(false);
    assert.equal(enabled.has(names.TELEPORTATION), false, 'teleportation must be disabled before movement is enabled');
    assert.equal(club.vrHelper.teleportation, null);
    assert.equal(club.movementFeature.movementEnabled, true);
    assert.equal(club.movementFeature.rotationEnabled, true);
    assert.equal(club.movementFeature.options.xrInput, club.vrHelper.input);
    assert.equal(club.vrHelper.baseExperience.camera.applyGravity, true);
    assert.equal(saved.get('vrclub.vrComfort'), '0');

    club.setVRComfortMode(true);
    assert.equal(enabled.has(names.MOVEMENT), false);
    assert.equal(club.vrHelper.teleportation.options.floorMeshes[0], club.floorMesh);
    assert.equal(club.vrHelper.teleportation.selection, club.vrHelper.pointerSelection);
    assert.equal(club.vjManualMode, false);
    // The floor slab extends past the brick shell; the arc must stop at the walls
    // and the DJ platform, and re-applying the mode must not duplicate blockers.
    club.setVRComfortMode(true);
    assert.deepEqual(
        club.vrHelper.teleportation.options.pickBlockerMeshes.map(mesh => mesh.name).sort(),
        [...sceneMeshes.keys()].sort()
    );
    assert.equal(originalTeleport.options.pickBlockerMeshes.length, sceneMeshes.size);
    // The balcony deck (with its stair treads) is a teleport floor alongside the club floor, registered once.
    assert.deepEqual([...club.vrHelper.teleportation.options.floorMeshes].map(mesh => mesh.name), ['floor', 'mezzDeck']);
    assert.deepEqual([...originalTeleport.options.floorMeshes].map(mesh => mesh.name).sort(), ['floor', 'mezzDeck']);

    // Outside a session the preference is stored, teleport is left registered but inert,
    // and nothing throws; the IN_XR handler re-applies the mode on entry.
    club.vrHelper.baseExperience.state = 3;
    club.setVRComfortMode(false);
    assert.equal(club.movementFeature, null);
    assert.equal(club.vrHelper.teleportation.teleportationEnabled, false);
});

test('Enter VR waits for background model loading, with a ceiling', async () => {
    const run = async ({ settleModels }) => {
        const timers = [];
        const button = {
            disabled: false, textContent: '', title: '',
            classList: { toggle() {} },
            addEventListener() {}
        };
        let resolveModels;
        const { window } = loadClassic('js/club/10-ui.js', {
            VRClubAnimationFinish: class {},
            document: { getElementById: id => (id === 'vrButton' ? button : null) },
            navigator: { xr: { isSessionSupported: async () => true } },
            setTimeout: (fn) => { timers.push(fn); return timers.length; },
            clearTimeout() {},
            BABYLON: { WebXRState: { IN_XR: 2, NOT_IN_XR: 3 } }
        });
        const club = Object.create(window.VRClubUI.prototype);
        club.modelLoadPromise = new Promise(resolve => { resolveModels = resolve; });
        club.scene = { whenReadyAsync: async () => {} };
        club._setupVRButton({ baseExperience: { onStateChangedObservable: { add() {} } } });
        const flush = () => new Promise(resolve => setImmediate(resolve));
        await flush();
        const whileLoading = { disabled: button.disabled, label: button.textContent };
        if (settleModels) resolveModels(); else timers.forEach(fn => fn());
        await flush(); await flush();
        return { whileLoading, after: { disabled: button.disabled, label: button.textContent } };
    };

    const loaded = await run({ settleModels: true });
    assert.deepEqual(loaded.whileLoading, { disabled: true, label: '\u{1F97D} Preparing VR\u2026' });
    assert.deepEqual(loaded.after, { disabled: false, label: '\u{1F97D} Enter VR' });

    const stalled = await run({ settleModels: false });
    assert.equal(stalled.whileLoading.disabled, true);
    assert.equal(stalled.after.disabled, false, 'a stalled load must not lock VR out');
});

test('a dropped live stream reconnects with bounded backoff; files and bad URLs do not', async () => {
    const timeouts = [];
    let interval = null;
    const toasts = [];
    const { window } = loadClassic('js/club/10-ui.js', {
        VRClubAnimationFinish: class {},
        setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
        clearTimeout() {},
        setInterval: (fn) => { interval = fn; return 1; },
        log: { warn() {}, info() {}, error() {} }
    });
    const listeners = {};
    const audio = {
        paused: false, currentTime: 0, src: '', loads: 0, plays: 0,
        addEventListener(type, fn) { listeners[type] = fn; },
        load() { this.loads++; },
        play() { this.plays++; return Promise.resolve(); }
    };
    const club = Object.create(window.VRClubUI.prototype);
    club.audioElement = audio;
    club.showErrorMessage = message => toasts.push(message);
    club._watchAudioStream(audio);
    club._audioKind = 'stream';
    club._audioStreamUrl = 'https://radio.example/live';

    // A URL that never played is left to the play() rejection path.
    listeners.error();
    assert.equal(timeouts.length, 0, 'a stream that never started was retried');

    listeners.playing();
    listeners.error();
    assert.deepEqual(timeouts.map(t => t.ms), [2000]);
    listeners.error();
    assert.equal(timeouts.length, 1, 'a second fault while a retry is pending scheduled another');
    timeouts.shift().fn();
    assert.equal(audio.src, 'https://radio.example/live');
    assert.equal(audio.loads, 1);
    assert.equal(audio.plays, 1);

    // An un-paused stream whose clock stops for 8 s is treated as dropped.
    audio.currentTime = 42;
    for (let tick = 0; tick < 5; tick++) interval();
    assert.deepEqual(timeouts.map(t => t.ms), [5000], 'a stalled stream was not reconnected');
    timeouts.shift().fn();
    listeners.error();
    timeouts.shift().fn();
    listeners.error();
    assert.equal(timeouts.length, 0, 'retries are not bounded');
    assert.match(toasts.at(-1), /could not be reconnected/);

    // A successful reconnect resets the budget; user pauses never trigger recovery.
    listeners.playing();
    audio.paused = true;
    for (let tick = 0; tick < 10; tick++) interval();
    assert.equal(timeouts.length, 0, 'a paused stream was treated as stalled');

    // Local files are never re-fetched; a decode error is explained instead.
    club._audioKind = 'file';
    listeners.error();
    assert.equal(timeouts.length, 0);
    assert.match(toasts.at(-1), /file cannot be played/);
});

test('a dropped on-demand episode reconnects at its position; live streams restart', () => {
    const timeouts = [];
    const { window } = loadClassic('js/club/10-ui.js', {
        VRClubAnimationFinish: class {},
        setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; },
        clearTimeout() {},
        setInterval: () => 1,
        log: { warn() {}, info() {}, error() {} }
    });
    const listeners = {};
    const audio = {
        paused: false, currentTime: 0, duration: Infinity, src: '',
        addEventListener(type, fn) { listeners[type] = fn; },
        load() { this.currentTime = 0; },
        play() { return Promise.resolve(); }
    };
    const club = Object.create(window.VRClubUI.prototype);
    club.audioElement = audio;
    club.showErrorMessage = () => {};
    club._watchAudioStream(audio);
    club._audioKind = 'stream';
    club._audioStreamUrl = 'https://mcdn.example/803.mp3';
    listeners.playing();

    // A live stream (infinite duration) has no position to return to.
    audio.currentTime = 600;
    listeners.error();
    delete listeners.loadedmetadata;
    timeouts.shift().fn();
    assert.equal(listeners.loadedmetadata, undefined, 'a live stream tried to seek');

    // An hour-long episode resumes where it dropped, once the reload has metadata.
    audio.duration = 3565;
    audio.currentTime = 1834.5;
    listeners.error();
    timeouts.shift().fn();
    assert.equal(audio.currentTime, 0, 'reloading the element resets its position');
    listeners.loadedmetadata();
    assert.equal(audio.currentTime, 1834.5);
});

test('VR viewpoints preserve seated eye height and orientation without moving the desktop camera', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/club/10-ui.js', {
        BABYLON, VRClubAnimationFinish: class {}
    });
    const xrCamera = {
        position: new BABYLON.Vector3(0, 1.15, -12),
        realWorldHeight: 1.15,
        rotationQuaternion: BABYLON.Quaternion.Identity()
    };
    const orientation = xrCamera.rotationQuaternion.clone();
    const desktopPosition = new BABYLON.Vector3(0, 1.7, -5);
    const club = {
        isInVRMode: true,
        vrHelper: { baseExperience: { camera: xrCamera } },
        camera: { position: desktopPosition.clone() },
        showCameraTransitionFeedback() {}
    };
    const move = window.VRClubUI.prototype.moveCameraToPreset;
    move.call(club, 'djBooth');
    assert.equal(xrCamera.position.y, 1.65);
    move.call(club, 'danceFloor');
    assert.equal(xrCamera.position.y, 1.15);
    assert.equal(xrCamera.position.x, -2.8);
    assert.equal(xrCamera.position.z, -9.2);
    assert.ok(xrCamera.rotationQuaternion.equals(orientation));
    assert.ok(club.camera.position.equals(desktopPosition));
});

test('VR jump arc is identical at 72 and 120 Hz and lands at the player\'s own eye height', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/club/02-lifecycle.js', {
        BABYLON, VRClubCore: class {}
    });
    const proto = window.VRClubLifecycle.prototype;
    const jump = (hz) => {
        const xrCamera = { position: new BABYLON.Vector3(0, 1.15, -12), applyGravity: true };
        const club = {
            jumpState: { active: false, velocity: 0 },
            _jumpRayDir: new BABYLON.Vector3(0, -1, 0),
            _jumpRay: new BABYLON.Ray(BABYLON.Vector3.Zero(), new BABYLON.Vector3(0, -1, 0), 2.5),
            // A collidable floor at y = 0.
            scene: { pickWithRay: (ray) => {
                const distance = ray.origin.y;
                return distance >= 0 && distance <= ray.length
                    ? { hit: true, distance, pickedPoint: new BABYLON.Vector3(ray.origin.x, 0, ray.origin.z) }
                    : { hit: false };
            } },
            _pickJumpGround: proto._pickJumpGround,
            _stepVRJump: proto._stepVRJump
        };
        proto._startVRJump.call(club, xrCamera);
        let apex = xrCamera.position.y;
        let frames = 0;
        while (club.jumpState.active && frames < 1000) {
            club._stepVRJump(xrCamera, 1 / hz);
            apex = Math.max(apex, xrCamera.position.y);
            frames++;
        }
        return { apex, airtime: frames / hz, landedAt: xrCamera.position.y, gravity: xrCamera.applyGravity };
    };
    const at72 = jump(72);
    const at120 = jump(120);
    assert.ok(Math.abs(at72.apex - at120.apex) < 0.02, `apex depends on refresh rate: ${at72.apex} vs ${at120.apex}`);
    assert.ok(Math.abs(at72.airtime - at120.airtime) < 0.03, `airtime depends on refresh rate: ${at72.airtime} vs ${at120.airtime}`);
    assert.ok(at72.apex - 1.15 > 0.35 && at72.apex - 1.15 < 0.55, `unrealistic jump height ${at72.apex - 1.15}`);
    assert.equal(at72.landedAt, 1.15, 'a seated player was re-seated at a different eye height');
    assert.equal(at120.landedAt, 1.15);
    assert.equal(at72.gravity, true);
});

test('disabled haptics also suppress VR menu feedback pulses', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {} });
    let pulses = 0;
    const club = {
        bassHapticsEnabled: false,
        _xrControllers: [{ inputSource: { gamepad: {
            hapticActuators: [{ pulse() { pulses++; } }]
        } } }]
    };
    window.VRClubUI.prototype.pulseHaptic.call(club);
    assert.equal(pulses, 0);
    club.bassHapticsEnabled = true;
    window.VRClubUI.prototype.pulseHaptic.call(club);
    assert.equal(pulses, 1);
});

test('clear-air test suppresses fog and particles despite smoke cues in both modes', () => {
    const { window } = loadClassic('js/club/07-animation-core.js', {
        VRClubEffects: class {}
    });
    const update = window.VRClubAnimationCore.prototype.updateFogMachines;
    for (const isInVRMode of [false, true]) {
        const systems = Array.from({ length: 4 }, () => ({
            stops: 0,
            resets: 0,
            stop() { this.stops++; },
            reset() { this.resets++; },
            start() { assert.fail('Clear-air test must not start particles'); }
        }));
        const club = {
            isInVRMode,
            atmosphereTestDisabled: true,
            smokeActive: true,
            scene: { fogEnabled: true },
            haze: systems[0],
            dustMotes: systems[1],
            fogMachines: systems.slice(2).map(emitter => ({
                emitter, isBursting: true, burstTimer: 2
            }))
        };
        update.call(club, { time: 1, dt: 1 / 60 });
        club.scene.fogEnabled = true;
        update.call(club, { time: 2, dt: 1 / 60 });
        assert.equal(club.scene.fogEnabled, false);
        assert.equal(club.smokeActive, true);
        assert.ok(systems.every(system => system.stops === 1 && system.resets === 1));
        assert.ok(club.fogMachines.every(machine => !machine.isBursting && machine.burstTimer === 0));
    }
});

test('the local body is posed from the camera, the DJ riser and the controllers', () => {
    const BABYLON = {
        Axis: { Z: 'Z', Y: 'Y' },
        Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
    };
    const { window } = loadClassic('js/club/11-audio-crowd.js', { VRClubUI: class {}, BABYLON });
    const proto = window.VRClubAudioCrowd.prototype;
    // A camera looking 0.8 rad right of +Z and 0.5 rad up.
    const yaw = 0.8, up = 0.5;
    const forward = { x: Math.sin(yaw) * Math.cos(up), y: Math.sin(up), z: Math.cos(yaw) * Math.cos(up) };
    const camera = {
        position: { x: 2, y: 1.7, z: -9 },
        getDirectionToRef(axis, out) { Object.assign(out, axis === 'Z' ? forward : { x: 0, y: 1, z: 0 }); }
    };
    const calls = [];
    const club = {
        isInVRMode: false, camera, _xrControllers: [],
        _localRig: { ok: true, setEyeHeight(h) { calls.push(['eye', h]); }, update(dt, pose) { calls.push(['update', dt, { ...pose }]); } },
        _playerCamera: proto._playerCamera, _handPose: proto._handPose
    };
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    let pose = calls.at(-1)[2];
    assert.ok(Math.abs(pose.headYaw - yaw) < 1e-9, 'yaw must come from the camera forward vector');
    assert.ok(Math.abs(pose.headPitch - up) < 1e-9, 'a camera looking up must give a positive head pitch');
    assert.equal(pose.groundY, 0);
    assert.equal(pose.left, null, 'desktop has no hands');

    camera.position = { x: 0, y: 2.2, z: -18 };
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    assert.equal(calls.at(-1)[2].groundY, 0.5, 'on the DJ riser the feet stand 0.5 m higher');

    // VR: eye height is refitted once on entry, hands come from the controllers, and an
    // untracked controller (at the origin) is ignored rather than reached for.
    const tracked = (handedness, x, y, z) => ({
        inputSource: { handedness },
        grip: { getAbsolutePosition: () => ({ x, y, z }) },
        pointer: { getDirectionToRef(axis, out) { Object.assign(out, axis === 'Z' ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 }); } }
    });
    club.isInVRMode = true;
    club.vrHelper = { baseExperience: { camera } };
    camera.globalPosition = { x: 0, y: 1.6, z: -12 };
    club._xrControllers = [tracked('left', -0.3, 1.2, -11.7), tracked('right', 0, 0, 0)];
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    assert.equal(calls.filter(c => c[0] === 'eye').length, 1, 'the body is refitted once per VR session');
    pose = calls.at(-1)[2];
    assert.equal(pose.left.x, -0.3);
    assert.equal(pose.left.fz, 1);
    assert.equal(pose.right, null, 'an untracked controller must not drag the arm to the origin');

    // Back on desktop the fixed standing calibration must be restored, even on the DJ riser.
    club.isInVRMode = false;
    delete camera.globalPosition;
    camera.position = { x: 0, y: 2.2, z: -18 };
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    assert.deepEqual(calls.filter(c => c[0] === 'eye').map(c => c[1]), [1.6, 1.7]);
    pose = calls.at(-1)[2];
    assert.equal(pose.groundY, 0.5, 'desktop booth placement still needs the riser offset');

    // Re-entering VR keeps the measured seated/standing height again.
    club.isInVRMode = true;
    camera.globalPosition = { x: 0, y: 1.5, z: -18 };
    proto._updateLocalPlayerBody.call(club, 1 / 60);
    assert.deepEqual(calls.filter(c => c[0] === 'eye').map(c => c[1]), [1.6, 1.7, 1.0]);
});
test('beams light the smoke they cross and dust is only seen inside them', () => {
    const { window } = loadClassic('js/club/07-animation-core.js', { VRClubEffects: class {} });
    const proto = window.VRClubAnimationCore.prototype;
    const vec = (x, y, z) => ({ x, y, z });
    const spot = {
        _photoPos: vec(0, 7, -12), _photoDir: vec(0, -1, 0), _photoIntensity: 40, _photoAngle: 0.5,
        _surfaceHit: { centerDistanceToSurface: 7 }
    };
    const club = {
        lightsActive: true,
        spotlights: [spot],
        currentSpotColor: { r: 1, g: 0, b: 0 },
        scene: { getFrameId: () => 1, activeCamera: { globalPosition: vec(0, 1.7, -4) } },
        _gatherAirBeams: proto._gatherAirBeams
    };
    const particle = (x, y, z, a) => ({ position: vec(x, y, z), size: 1, color: { r: 0.6, g: 0.6, b: 0.7, a } });
    const inBeam = particle(0, 3, -12, 0.04);
    const outside = particle(6, 3, -12, 0.04);
    proto._lightAirParticles.call(club, [inBeam, outside], 'haze');
    assert.ok(inBeam.color.a > 0.04 * 1.5, 'a puff in the beam must brighten');
    assert.ok(inBeam.color.r > 0.6 && inBeam.color.g < 0.6, 'a puff in the beam must take the look colour');
    assert.equal(outside.color.a, 0.04, 'a puff outside every beam must be untouched');
    assert.ok(spot._mediumDensity > 0, 'the beam must read the medium inside it');

    club.scene.getFrameId = () => 2;
    const dustIn = particle(0, 3, -12, 0.5);
    const dustOut = particle(6, 3, -12, 0.5);
    proto._lightAirParticles.call(club, [dustIn, dustOut], 'dust');
    assert.ok(dustOut.color.a < 0.2, 'dust outside a beam must be nearly invisible');
    assert.ok(dustIn.color.a > dustOut.color.a * 3, 'dust must glint inside a beam');

    club.lightsActive = false;
    club.scene.getFrameId = () => 3;
    const dark = particle(0, 3, -12, 0.04);
    proto._lightAirParticles.call(club, [dark], 'haze');
    assert.equal(dark.color.a, 0.04, 'no beams, no lit smoke');

    // Nothing unmeasured runs in a headset: VR leaves particles and beams neutral.
    club.lightsActive = true;
    club.isInVRMode = true;
    club.scene.getFrameId = () => 4;
    club._airBeamCount = 1;
    const vr = particle(0, 3, -12, 0.5);
    proto._lightAirParticles.call(club, [vr], 'dust');
    assert.equal(vr.color.a, 0.5, 'VR must not alter particles');
    assert.equal(spot._mediumDensity, null, 'VR must hand the beams back to neutral');
});

test('shipped club air keeps fog on and tints toward the look without changing haze alpha', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const colour = (r, g, b, a) => ({ r, g, b, a, set(nr, ng, nb, na) { this.r = nr; this.g = ng; this.b = nb; this.a = na; } });
    const haze = {
        started: false,
        stops: 0,
        isStarted() { return this.started; },
        start() { this.started = true; },
        stop() { this.stops++; },
        color1: { r: 0.6, g: 0.6, b: 0.7, a: 0.04 },
        color2: { r: 0.7, g: 0.7, b: 0.8, a: 0.03 }
    };
    const stops = [0, 1, 1, 0].map(() => ({ color1: colour(0, 0, 0, 0), color2: colour(0, 0, 0, 0) }));
    const club = {
        atmosphereTestDisabled: false,
        smokeActive: true,
        lightsActive: true,
        isInVRMode: false,
        masterIntensity: 1,
        currentSpotColor: new BABYLON.Color3(1, 0, 0),
        vrSettings: {
            desktop: { fogDensity: 0.028 },
            vr: { fogDensity: 0.022 }
        },
        scene: {
            fogEnabled: false,
            fogDensity: 0,
            fogColor: new BABYLON.Color3(0.015, 0.012, 0.018)
        },
        haze,
        _hazeGradients: stops,
        _hazeFade: [0, 1, 1, 0],
        fogMachines: [{ emitter: { emitRate: 0 }, ledMat: {} }],
        cachedColors: {}
    };
    club._tintClubAir = window.VRClubAnimationCore.prototype._tintClubAir;
    const update = window.VRClubAnimationCore.prototype.updateFogMachines;
    update.call(club, { time: 1, dt: 1 / 60 });
    assert.equal(club.scene.fogEnabled, true);
    assert.equal(club.scene.fogDensity, 0.028);
    assert.ok(club.scene.fogColor.r > 0.015, 'fog should pick up the red look');
    assert.equal(haze.color1.a, 0.04, 'asserted haze alpha must not change');
    assert.equal(haze.started, true);
    assert.equal(stops[0].color1.a, 0, 'a puff must be born transparent');
    assert.equal(stops[3].color2.a, 0, 'a puff must die transparent');
    assert.equal(stops[1].color1.a, 0.04, 'peak alpha must follow color1.a');
    assert.equal(stops[2].color2.a, 0.03, 'peak alpha must follow color2.a');
    assert.ok(stops[1].color1.r > 0.42, 'gradient stops must carry the look tint');

    // A smoke-off cue stops the machines, never the hazer, and eases the fog.
    club.smokeActive = false;
    update.call(club, { time: 2, dt: 1 / 60 });
    assert.equal(haze.stops, 0, 'the ambient hazer must keep running');
    assert.ok(club.scene.fogDensity < 0.028 && club.scene.fogDensity > 0.028 * 0.45,
        'fog density must ease, not snap');
});

test('music on entry is on by default and a Resident episode is never remembered as the default', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;
    assert.equal(AudioUtils.shouldPlayOnEntry(null), true, 'nothing stored: music starts on entry');
    assert.equal(AudioUtils.shouldPlayOnEntry('1'), true);
    assert.equal(AudioUtils.shouldPlayOnEntry('0'), false, 'an explicit opt-out is honoured');

    // Episodes are resolved fresh from the feed; remembering one would pin the default to it.
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://mcdn.podbean.com/mf/web/x/803.mp3?a=1'), true);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://podbean.com/e.mp3'), true);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://notpodbean.com/e.mp3'), false);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://radio.example/live.mp3'), false);
    assert.equal(AudioUtils.isResidentEpisodeUrl('not a url'), false);

    // The entry flow is wired to them, and the old station is gone from the defaults.
    const ui = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    assert.ok(!/sunshine-live/i.test(ui), 'the old default station is still referenced');
    assert.match(ui, /AudioUtils\.shouldPlayOnEntry\(/);
    assert.match(ui, /fetchPodcastEpisodes\(RESIDENT_PODCAST\)/);
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /<input id="splashRadioOnEntry"[^>]*\bchecked\b/, 'the splash music toggle must default to checked');
});

test('safe mode is off by default, never inferred from reduced motion, and an explicit choice is honoured', () => {
    const store = new Map();
    const localStorage = {
        getItem: (key) => (store.has(key) ? store.get(key) : null)
    };
    const { window } = loadClassic('js/club/01-core.js', { localStorage });
    window.matchMedia = () => ({ matches: true }); // the OS asks for reduced motion
    const resolve = window.VRClubCore.resolvePhotosensitiveSafeMode;
    assert.equal(resolve(), false, 'nothing stored: Safe Mode must not turn itself on, even under reduced motion');
    store.set('vrclub.safeMode', '1');
    assert.equal(resolve(), true, 'an explicit stored on is honoured');
    store.set('vrclub.safeMode', '0');
    assert.equal(resolve(), false, 'an explicit stored off is honoured');
    const throwing = { getItem() { throw new Error('private browsing'); } };
    assert.equal(loadClassic('js/club/01-core.js', { localStorage: throwing }).window.VRClubCore
        .resolvePhotosensitiveSafeMode(), false, 'unreadable storage defaults to off');
});

test('one flash governor arbitrates every room flash source and Safe Mode blocks it', () => {
    const { window } = loadClassic('js/club/01-core.js', {
        localStorage: { getItem() { return null; } }
    });
    const tryFlash = window.VRClubCore.prototype._tryClubFlash;
    const club = { photosensitiveSafeMode: false };

    assert.equal(tryFlash.call(club, 1, 'moving-head'), true);
    assert.equal(tryFlash.call(club, 1.2, 'strobe'), false);
    assert.equal(tryFlash.call(club, 1.34, 'warehouse-led', 0.4), false);
    assert.equal(tryFlash.call(club, 1.41, 'warehouse-led', 0.4), true);
    assert.equal(club.flashGovernor.count, 2);
    assert.equal(club.flashGovernor.lastSource, 'warehouse-led');

    club.photosensitiveSafeMode = true;
    assert.equal(tryFlash.call(club, 2, 'strobe'), false);
    assert.equal(club.flashGovernor.count, 2);
});

test('an untextured gobo never replaces the soft light pool', () => {
    const fixtures = loadClassic('js/club/08-animation-fixtures.js', {
        VRClubAnimationCore: class {}
    }).window.VRClubAnimationFixtures.prototype;
    const disc = {
        enabled: null, visibility: 1,
        position: { set() {} }, rotation: {}, scaling: {},
        setEnabled(value) { this.enabled = value; }
    };
    const spot = {
        goboProjection: disc,
        goboMat: { emissiveTexture: null },
        lightPool: { visibility: 0, position: {}, rotation: {}, scaling: {} }
    };
    const club = { lightsActive: true, goboEnabled: true };
    fixtures._updateSpotGoboProjection.call(club, spot, { hitSurface: 'floor' },
        { beamVisible: true, physicsIntensity: 1, spotColor: null });
    assert.equal(disc.enabled, false, 'a flat untextured disc was drawn over the floor');
    assert.equal(spot.lightPool.visibility, 1, 'the soft pool must stay visible');
});

test('photometric slots follow the strongest surface hit without toggling lights', () => {
    const { window } = loadClassic('js/club/08-animation-fixtures.js', {
        VRClubAnimationCore: class {}
    });
    const vec = (x, y, z) => ({
        x, y, z,
        copyFrom(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }
    });
    const spots = [0, 1, 2, 3].map((index) => ({
        light: {
            position: vec(index === 3 ? 9 : index, 7, 0),
            direction: vec(0, -1, 0),
            intensity: 1,
            enabled: true,
            setEnabled() { throw new Error('slot bind must not toggle lights'); }
        },
        _photoPos: vec(index, 6, -1),
        _photoDir: vec(0, -1, index * 0.1),
        _photoIntensity: index === 3 ? 40 : 5,
        _photoAngle: 0.4,
        _photoRange: 20,
        _photoExponent: 4,
        _shadeScore: index === 3 ? 48 : 5
    }));
    window.VRClubAnimationFixtures.prototype._bindPhotometricSlots.call({
        spotlights: spots,
        maxLights: 3
    });
    assert.equal(spots[0].light.position.x, 3, 'slot 0 should carry the strongest head');
    assert.equal(spots[0].light.intensity, 40);
    assert.ok(Math.abs(spots[0].light.direction.z - 0.3) < 1e-9);
    assert.equal(spots[3].light.position.x, 9, 'a non-slot head must keep its own light');
    assert.equal(spots[3].light.enabled, true);
});

test('visual-only fixtures contribute bounded room bounce in desktop and VR', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const update = window.VRClubAnimationCore.prototype.updateRoomBounce;
    const ambient = {
        intensity: 0,
        diffuse: new BABYLON.Color3(1, 1, 1)
    };
    const club = {
        scene: { getLightByName: () => ambient },
        vrSettings: {
            desktop: { ambientIntensity: 0.08 },
            vr: { ambientIntensity: 0.05 }
        },
        cachedColors: { white: new BABYLON.Color3(1, 1, 1) },
        currentSpotColor: new BABYLON.Color3(0.2, 0.4, 1),
        masterIntensity: 1,
        ledWallActive: false,
        laserSheetActive: false
    };

    const settle = ({ vr, spots = false, lasers = false, mirror = false }) => {
        club.isInVRMode = vr;
        club.lightsActive = spots;
        club.lasersActive = lasers;
        club.mirrorBallActive = mirror;
        ambient.intensity = club.vrSettings[vr ? 'vr' : 'desktop'].ambientIntensity;
        for (let frame = 0; frame < 240; frame++) update.call(club, { dtScale: 1 });
        return ambient.intensity;
    };

    assert.ok(Math.abs(settle({ vr: false, mirror: true }) - 0.16) < 0.001);
    assert.ok(Math.abs(settle({ vr: false, lasers: true }) - 0.15) < 0.001);
    assert.ok(Math.abs(settle({ vr: false, spots: true }) - 0.20) < 0.001);
    assert.ok(Math.abs(settle({ vr: true, mirror: true }) - 0.13) < 0.001);
    assert.ok(Math.abs(settle({ vr: true, lasers: true }) - 0.12) < 0.001);
    assert.ok(Math.abs(settle({ vr: true, spots: true, lasers: true, mirror: true }) - 0.22) < 0.001);
    // The headset must never be lit more flatly than the desktop for the same rig.
    assert.ok(settle({ vr: true, spots: true }) <= settle({ vr: false, spots: true }));
});

test('mirror reflections use analytic room hits and thin-instance tier counts', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const update = window.VRClubAnimationCore.prototype.updateMirrorBall;
    const ROOM_INTERIOR = {
        x: { min: -12.25, max: 12.25 },
        y: { min: 0, max: 9.85 },
        z: { min: -20, max: -0.25 }
    };
    const effects = loadClassic('js/club/06-effects.js', {
        BABYLON,
        VRClubFixtures: class {},
        ROOM_INTERIOR
    }).window.VRClubEffects.prototype;
    const enabled = { spots: false, rays: false };
    const updates = { spots: 0, rays: 0 };
    const mesh = (name) => ({
        thinInstanceCount: 0,
        setEnabled(value) { enabled[name] = value; },
        thinInstanceBufferUpdated() { updates[name]++; }
    });
    const spotMatrices = new Float32Array(140 * 16);
    const rayMatrices = new Float32Array(64 * 16);
    const directions = new Float32Array(140 * 2);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 140; i++) {
        directions[i * 2] = golden * i;
        let latitude = 0.5 / 140;
        let weight = 0.5;
        for (let index = i; index > 0; index = Math.floor(index / 2)) {
            latitude += (index % 2) * weight;
            weight *= 0.5;
        }
        directions[i * 2 + 1] = Math.acos(1 - 2 * latitude);
    }
    const club = {
        mirrorBallActive: true,
        vjManualMode: true,
        mirrorBallRotation: 0,
        mirrorBallSpeed: 1,
        masterIntensity: 1,
        kickPulse: 0,
        mirrorBall: { position: new BABYLON.Vector3(0, 6.5, -12), rotation: { y: 0 } },
        mirrorBallSpotlightColor: new BABYLON.Color3(1, 0.5, 0.25),
        tierSettings: { mirrorSpots: 90, mirrorRays: 52 },
        mirrorReflectionBatch: {
            spots: mesh('spots'),
            rays: mesh('rays'),
            spotMat: { emissiveColor: new BABYLON.Color3() },
            rayMat: { emissiveColor: new BABYLON.Color3(), alpha: 0 },
            spotMatrices,
            rayMatrices,
            directions,
            hit: {}
        },
        _intersectRoomInterior: effects._intersectRoomInterior,
        _writeMirrorSpotMatrix: effects._writeMirrorSpotMatrix,
        _writeMirrorRayMatrix: effects._writeMirrorRayMatrix,
        _updateMirrorReflectionBatch: effects._updateMirrorReflectionBatch,
        scene: { pickWithRay() { throw new Error('mirror batching must not scene-raycast'); } }
    };
    update.call(club, { time: 1, dtScale: 1 });
    assert.equal(club.mirrorReflectionBatch.spots.thinInstanceCount, 90);
    assert.equal(club.mirrorReflectionBatch.rays.thinInstanceCount, 52);
    assert.deepEqual(enabled, { spots: true, rays: true });
    assert.deepEqual(updates, { spots: 1, rays: 1 });
    assert.ok([...spotMatrices.slice(0, 90 * 16)].every(Number.isFinite));
    assert.ok([...rayMatrices.slice(0, 52 * 16)].every(Number.isFinite));

    club.tierSettings = { mirrorSpots: 48, mirrorRays: 32 };
    update.call(club, { time: 2, dtScale: 1 });
    assert.equal(club.mirrorReflectionBatch.spots.thinInstanceCount, 48);
    assert.equal(club.mirrorReflectionBatch.rays.thinInstanceCount, 32);

    // Reflections land on the real shell (ceiling slab, front wall), not on the narrower walkable band.
    const hit = {};
    effects._intersectRoomInterior(0, 6.5, -12, 0, 1, 0, hit);
    assert.ok(Math.abs(hit.py - (9.85 - 0.02)) < 1e-9, `ceiling hit at y ${hit.py}`);
    effects._intersectRoomInterior(0, 6.5, -12, 0, 0, 1, hit);
    assert.ok(Math.abs(hit.pz - (-0.25 - 0.02)) < 1e-9, `front-wall hit at z ${hit.pz}`);
    assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 0, -1]);
});

test('laser sheet uses bounded two-axis motion for vertical and lateral cues', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/07-animation-core.js', {
        BABYLON,
        VRClubEffects: class {}
    });
    const source = { rotation: { x: 0, y: 0 }, isVisible: false };
    const club = {
        laserSpeed: 0.6,
        laserSheetActive: true,
        laserSheetMotion: 'vertical',
        laserSheetSource: source,
        laserSheet: {
            material: {
                alpha: 0,
                emissiveColor: null,
                opacityTexture: { uOffset: 0, vOffset: 0 }
            },
            isVisible: false
        },
        _laserSheetBasePitch: 0.3,
        _laserSheetBaseYaw: 0.1,
        _laserSheetPitchRange: 0.12,
        _laserSheetYawRange: 0.16,
        colorLockActive: false,
        currentColorIndex: 1,
        cachedColors: {
            red: new BABYLON.Color3(1, 0, 0),
            green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1)
        },
        _poseLaserSheet: window.VRClubAnimationCore.prototype._poseLaserSheet,
        _laserColor: window.VRClubAnimationCore.prototype._laserColor
    };
    const update = time => window.VRClubAnimationCore.prototype.updateLaserSheet.call(club, {
        time,
        audio: { average: 0 }
    });

    update(0);
    const verticalStart = { ...source.rotation };
    update(7);
    assert.notEqual(source.rotation.x, verticalStart.x);
    assert.notEqual(source.rotation.y, verticalStart.y);
    assert.ok(Math.abs(source.rotation.x - club._laserSheetBasePitch) <= club._laserSheetPitchRange);
    assert.ok(Math.abs(source.rotation.y - club._laserSheetBaseYaw) <= club._laserSheetYawRange);

    club.laserSheetMotion = 'lateral';
    update(0);
    const lateralStart = { ...source.rotation };
    update(7);
    assert.notEqual(source.rotation.x, lateralStart.x);
    assert.notEqual(source.rotation.y, lateralStart.y);
    assert.ok(Math.abs(source.rotation.x - club._laserSheetBasePitch) <= club._laserSheetPitchRange);
    assert.ok(Math.abs(source.rotation.y - club._laserSheetBaseYaw) <= club._laserSheetYawRange);
});

test('master dimming scales moving heads, ceiling lasers and the laser sheet continuously', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const fixtures = loadClassic('js/club/08-animation-fixtures.js', { BABYLON, VRClubAnimationCore: class {} }).window.VRClubAnimationFixtures.prototype;
    const core = loadClassic('js/club/07-animation-core.js', { BABYLON, VRClubEffects: class {} }).window.VRClubAnimationCore.prototype;

    const makeSpotClub = (master) => {
        const beam = {
            visibility: 0,
            rotationQuaternion: new BABYLON.Quaternion(),
            position: new BABYLON.Vector3(),
            scaling: new BABYLON.Vector3(1, 1, 1)
        };
        const beamGlow = {
            parent: null,
            position: new BABYLON.Vector3(),
            rotationQuaternion: new BABYLON.Quaternion(),
            scaling: new BABYLON.Vector3(1, 1, 1),
            visibility: 0,
            setParent(parent) { this.parent = parent; }
        };
        const spot = {
            light: {
                direction: new BABYLON.Vector3(),
                position: new BABYLON.Vector3(),
                angle: 0,
                range: 20,
                exponent: 1,
                intensity: 0
            },
            beam,
            beamGlow,
            beamMat: { emissiveColor: new BABYLON.Color3(), alpha: 0 },
            beamGlowMat: { emissiveColor: new BABYLON.Color3() },
            lens: { material: { isFrozen: false, emissiveColor: new BABYLON.Color3() } }
        };
        return {
            masterIntensity: master,
            useModularSystems: false,
            systems: {},
            lightsActive: true,
            spotlightSpeed: 1,
            spotlightMode: 1,
            spotlightPattern: 1,
            spotStrobeActive: false,
            currentSpotColor: new BABYLON.Color3(1, 0.5, 0.25),
            kickPulse: 0,
            isInVRMode: false,
            lastActivePhase: 0,
            vecPool: { direction: new BABYLON.Vector3() },
            spotlights: [spot],
            _solveSpotDirection(i, globalPhase, audioSpeedMultiplier, speedMultiplier, out) { out.x = 0; out.z = 0; return out; },
            _animateMovingHead() {},
            _updateSpotBeamGeometry() {
                return {
                    cosTheta: 1,
                    beamMidpoint: new BABYLON.Vector3(0, 4, -12),
                    beamLength: 7.3,
                    baseScale: 1,
                    tiltStretch: 1
                };
            },
            _updateSpotBeamAppearance: fixtures._updateSpotBeamAppearance,
            _updateSpotLightPool() {},
            _updateSpotGoboProjection() {},
            _bindPhotometricSlots() {}
        };
    };

    const renderSpot = (master) => {
        const club = makeSpotClub(master);
        fixtures.updateSpotlights.call(club, { time: 1, dtScale: 1, audio: { hasAudio: false } });
        const spot = club.spotlights[0];
        return {
            beam: spot.beamMat.emissiveColor.r,
            beamAlpha: spot.beamMat.alpha,
            light: spot.light.intensity,
            lens: spot.lens.material.emissiveColor.r
        };
    };

    const fullSpot = renderSpot(1);
    const halfSpot = renderSpot(0.5);
    const offSpot = renderSpot(0);
    assert.equal(offSpot.light, 0, 'zero master left the moving-head SpotLight on');
    assert.equal(offSpot.lens, 0, 'zero master left the moving-head lens glowing');
    assert.equal(offSpot.beamAlpha, 0, 'zero master left the moving-head beam visible');
    assert.ok(Math.abs(halfSpot.light / fullSpot.light - 0.5) < 0.02, 'half master did not halve the moving-head light');
    assert.ok(Math.abs(halfSpot.lens / fullSpot.lens - 0.5) < 0.02, 'half master did not halve the moving-head lens glow');
    assert.ok(Math.abs(halfSpot.beam / fullSpot.beam - 0.5) < 0.02, 'half master did not halve the moving-head beam glow');

    const effectsProto = loadClassic('js/club/06-effects.js', {
        BABYLON, VRClubFixtures: class {},
        ROOM_INTERIOR: { x: { min: -12.25, max: 12.25 }, y: { min: 0, max: 9.85 }, z: { min: -20, max: -0.25 } }
    }).window.VRClubEffects.prototype;
    const makeLaserBatch = (count) => {
        const mesh = () => ({ enabled: false, isEnabled() { return this.enabled; }, setEnabled(v) { this.enabled = v; }, updateVerticesData() {} });
        return {
            count,
            mesh: mesh(), hitMesh: mesh(),
            material: { emissiveColor: new BABYLON.Color3() },
            hitMaterial: { emissiveColor: new BABYLON.Color3() },
            positions: new Float32Array(count * 12), colors: new Float32Array(count * 16),
            hitPositions: new Float32Array(count * 12), hitColors: new Float32Array(count * 16),
            hit: {}
        };
    };
    const renderLasers = (master) => {
        const origin = new BABYLON.Vector3(0, 7, -12);
        const laser = {
            type: 'multi',
            rotation: 0,
            tiltPhase: 0,
            originPos: origin.clone(),
            emitter: { getAbsolutePosition: () => origin },
            beams: [0, 1, 2, 3, 4].map(i => ({ beamIndex: i, slot: i })),
            lights: [],
            emitterMat: { emissiveColor: new BABYLON.Color3() }
        };
        const club = {
            masterIntensity: master,
            lasersActive: true,
            vjManualMode: true,
            colorSwitchTime: 0,
            currentColorIndex: 0,
            colorLockActive: false,
            kickPulse: 0,
            isInVRMode: false,
            cachedColors: { black: new BABYLON.Color3(0, 0, 0) },
            cachedLaserColors: {
                red: new BABYLON.Color3(1, 0.06, 0.02),
                green: new BABYLON.Color3(0.28, 1, 0.04),
                blue: new BABYLON.Color3(0.14, 0.1, 1)
            },
            vecPool: { laserDir: new BABYLON.Vector3() },
            laserBeamBatch: makeLaserBatch(5),
            lasers: [laser],
            _laserColor: core._laserColor,
            _laserView: core._laserView,
            _intersectRoomInterior: effectsProto._intersectRoomInterior
        };
        Object.setPrototypeOf(club, fixtures);
        fixtures.updateLasers.call(club, { time: 1, dtScale: 1 });
        const batch = club.laserBeamBatch;
        return {
            beamAlpha: Math.max(...Array.from({ length: 20 }, (_, i) => batch.colors[i * 4 + 3])),
            dotAlpha: Math.max(...Array.from({ length: 20 }, (_, i) => batch.hitColors[i * 4 + 3])),
            enabled: batch.mesh.enabled,
            emitter: laser.emitterMat.emissiveColor.r
        };
    };

    const fullLaser = renderLasers(1);
    const halfLaser = renderLasers(0.5);
    const offLaser = renderLasers(0);
    assert.equal(offLaser.enabled, false, 'zero master left the ceiling laser beams drawn');
    assert.equal(offLaser.emitter, 0, 'zero master left the ceiling laser emitter glowing');
    assert.ok(fullLaser.beamAlpha > 0 && fullLaser.dotAlpha > 0);
    assert.ok(Math.abs(halfLaser.beamAlpha / fullLaser.beamAlpha - 0.5) < 0.02, 'half master did not halve the ceiling laser beam');
    assert.ok(Math.abs(halfLaser.dotAlpha / fullLaser.dotAlpha - 0.5) < 0.02, 'half master did not halve the ceiling laser dots');
    assert.ok(Math.abs(halfLaser.emitter / fullLaser.emitter - 0.5) < 0.02, 'half master did not halve the ceiling laser emitter');

    const renderSheet = (master) => {
        const club = {
            masterIntensity: master,
            laserSheetActive: true,
            laserSpeed: 1,
            laserSheetMotion: 'vertical',
            kickPulse: 0,
            colorLockActive: false,
            currentColorIndex: 0,
            cachedColors: {
                red: new BABYLON.Color3(1, 0, 0),
                green: new BABYLON.Color3(0, 1, 0),
                blue: new BABYLON.Color3(0, 0, 1)
            },
            laserSheet: { material: { alpha: 0, emissiveColor: new BABYLON.Color3(), opacityTexture: { uOffset: 0, vOffset: 0 } }, isVisible: false },
            laserSheetHaze: { material: { alpha: 0, emissiveColor: new BABYLON.Color3(), opacityTexture: { uOffset: 0, vOffset: 0 } }, isVisible: false },
            laserAperture: { material: { emissiveColor: new BABYLON.Color3() } },
            _laserSheetFollower: { mount: { aperture: { material: { emissiveColor: new BABYLON.Color3() } } } },
            laserLight: { diffuse: null, intensity: 0 },
            _poseLaserSheet() {},
            _laserColor: core._laserColor
        };
        core.updateLaserSheet.call(club, { time: 1, audio: { average: 0 } });
        return {
            alpha: club.laserSheet.material.alpha,
            haze: club.laserSheetHaze.material.alpha,
            aperture: club.laserAperture.material.emissiveColor.r,
            follower: club._laserSheetFollower.mount.aperture.material.emissiveColor.r,
            light: club.laserLight.intensity
        };
    };

    const fullSheet = renderSheet(1);
    const halfSheet = renderSheet(0.5);
    const offSheet = renderSheet(0);
    assert.equal(offSheet.alpha, 0, 'zero master left the laser sheet visible');
    assert.equal(offSheet.haze, 0, 'zero master left the laser-sheet haze visible');
    assert.equal(offSheet.aperture, 0, 'zero master left the laser-sheet aperture glowing');
    assert.equal(offSheet.follower, 0, 'zero master left the follower aperture glowing');
    assert.equal(offSheet.light, 0, 'zero master left the laser-sheet light on');
    assert.ok(Math.abs(halfSheet.alpha / fullSheet.alpha - 0.5) < 0.02, 'half master did not halve the laser-sheet alpha');
    assert.ok(Math.abs(halfSheet.light / fullSheet.light - 0.5) < 0.02, 'half master did not halve the laser-sheet light');
});

test('ceiling lasers end on the wall they reach, scatter forward, never alias below a few pixels, and the sheet ends where it meets the floor', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const ROOM_INTERIOR = { x: { min: -12.25, max: 12.25 }, y: { min: 0, max: 9.85 }, z: { min: -20, max: -0.25 } };
    const fixtures = loadClassic('js/club/08-animation-fixtures.js', { BABYLON, VRClubAnimationCore: class {} }).window.VRClubAnimationFixtures.prototype;
    const core = loadClassic('js/club/07-animation-core.js', { BABYLON, VRClubEffects: class {}, ROOM_INTERIOR }).window.VRClubAnimationCore.prototype;
    const effects = loadClassic('js/club/06-effects.js', { BABYLON, VRClubFixtures: class {}, ROOM_INTERIOR }).window.VRClubEffects.prototype;

    // A beam from the right-hand projector aimed out toward the side wall stops ON the wall.
    const hit = {};
    const d = new BABYLON.Vector3(0.8, -0.6, 0).normalize();
    effects._intersectRoomInterior(8, 7, -14, d.x, d.y, d.z, hit);
    assert.ok(Math.abs(hit.px - (12.25 - 0.02)) < 1e-9, `beam passed the side wall (x ${hit.px})`);
    assert.deepEqual([hit.nx, hit.ny, hit.nz], [-1, 0, 0]);

    // Haze scatters forward: toward the viewer > side-on (1) > away.
    const forward = fixtures._laserScatterGain(1), side = fixtures._laserScatterGain(0), away = fixtures._laserScatterGain(-1);
    assert.ok(Math.abs(side - 1) < 1e-9);
    assert.ok(forward > 2 && away < 0.8, `phase ${forward} / ${side} / ${away}`);

    // Ribbon width never falls under ~7 px, and the brightness is divided by that widening.
    const P = new Float32Array(12), C = new Float32Array(16);
    const beamDir = new BABYLON.Vector3(0, -1, 0);
    const pixelAngle = 0.8 / 1080;
    const widthAt = dist => {
        fixtures._writeLaserBeamEnd.call(fixtures, P, C, 0, 0, 0, 1, 0, 5, -12, beamDir, 0.032, 1,
            { x: dist, y: 5, z: -12 }, pixelAngle);
        return { width: Math.hypot(P[3] - P[0], P[4] - P[1], P[5] - P[2]), alpha: C[3] };
    };
    const near = widthAt(2), far = widthAt(20);
    assert.ok(far.width >= 20 * pixelAngle * 7 - 1e-6, 'a distant beam is narrower than a few pixels');
    assert.ok(Math.abs(near.width - 0.032) < 1e-6, 'a near beam lost its physical width');
    assert.ok(far.alpha < near.alpha, 'widening a distant beam must dim it, not brighten the room');

    // The fan ends where the floor occludes it; it draws no separate line on the floor (removed by request).
    assert.equal(core._updateLaserSheetScanLines, undefined);
});

test('moving-head spot strobes stay under the flash ceiling at every refresh rate and Safe Mode removes the transitions', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const fixtures = loadClassic('js/club/08-animation-fixtures.js', { BABYLON, VRClubAnimationCore: class {} }).window.VRClubAnimationFixtures.prototype;
    const g = {
        cosTheta: 1,
        beamMidpoint: new BABYLON.Vector3(0, 4, -12),
        beamLength: 7.3,
        baseScale: 1,
        tiltStretch: 1
    };
    const makeSpot = () => ({
        beam: {
            visibility: 0,
            rotationQuaternion: new BABYLON.Quaternion(),
            position: new BABYLON.Vector3(),
            scaling: new BABYLON.Vector3(1, 1, 1)
        },
        beamGlow: {
            parent: null,
            position: new BABYLON.Vector3(),
            rotationQuaternion: new BABYLON.Quaternion(),
            scaling: new BABYLON.Vector3(1, 1, 1),
            visibility: 0,
            setParent(parent) { this.parent = parent; }
        },
        beamMat: { emissiveColor: new BABYLON.Color3(), alpha: 0 },
        beamGlowMat: { emissiveColor: new BABYLON.Color3() }
    });
    const countRises = (hz, safe) => {
        const club = {
            masterIntensity: 1,
            lightsActive: true,
            photosensitiveSafeMode: safe,
            spotlightMode: 0,
            spotStrobeActive: true,
            currentSpotColor: new BABYLON.Color3(1, 1, 1),
            kickPulse: 0,
            isInVRMode: false,
            _sampleSpotFlash: fixtures._sampleSpotFlash
        };
        const spot = makeSpot();
        let previous = null;
        let rises = 0;
        const frames = hz * 30;
        for (let frame = 0; frame < frames; frame++) {
            fixtures._updateSpotBeamAppearance.call(club, spot, 0, frame / hz, frame / hz, 1.5, g);
            const lit = spot.beamVisible === true;
            if (previous !== null && !previous && lit) rises++;
            previous = lit;
        }
        return rises / 30;
    };

    for (const hz of [45, 60, 72, 90, 120]) {
        const flashes = countRises(hz, false);
        assert.ok(flashes <= 3.0, `${hz} Hz: moving-head strobes flashed ${flashes.toFixed(2)} times a second`);
        assert.equal(countRises(hz, true), 0, `${hz} Hz: Safe Mode still allowed moving-head flash transitions`);
    }
});

// ---------------------------------------------------------------------------
// Cross-file invariants that no other check can enforce
// ---------------------------------------------------------------------------

test('animation code never hard-codes a 60 fps frame step', () => {
    // Frame-rate independence is the project's stated non-negotiable rule, and it had
    // nine violations. `dtScale` / `dt` must carry every per-frame increment.
    const files = readdirSync(join(ROOT, 'js/club'))
        .filter(f => f.includes('animation'))
        .map(f => join('js/club', f));

    const offenders = [];
    for (const file of files) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        source.split('\n').forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
            // A literal 0.016 anywhere in the animation tree is the old "assume 60 fps"
            // constant. dt is derived from the measured frame time instead.
            if (/\b0\.0166?7?\b/.test(line)) offenders.push(`${file}:${i + 1}  ${trimmed}`);
            // `frameCounter % N` used as a TIMER (rather than as a work-stagger) makes
            // the interval refresh-rate dependent.
            if (/frameCounter\s*%\s*\d+\s*===?\s*0\s*\)/.test(line) && /\/\/.*second/i.test(line)) {
                offenders.push(`${file}:${i + 1}  ${trimmed}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        `use ctx.dt / ctx.dtScale instead of a fixed frame step:\n${offenders.join('\n')}`);
});

test('the device light budget is defined consistently everywhere', () => {
    // Exceeding it produces GL_INVALID_OPERATION / "uniform buffer too small" and a
    // black mesh on a headset. Two independent implementations had drifted from the
    // documented values before.
    const core = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    const loader = readFileSync(join(ROOT, 'js/modelLoader.js'), 'utf8');

    const coreBlock = core.slice(core.indexOf('detectMaxLights() {'));
    const questCore = /isQuest\)[\s\S]{0,200}?return (\d)/.exec(coreBlock)?.[1];
    const questLoader = /quest[\s\S]{0,120}?return (\d)/i.exec(loader.slice(loader.indexOf('detectDefaultMaxLights')))?.[1];

    assert.ok(questCore, 'could not read the Quest light budget from 01-core.js');
    assert.equal(questLoader, questCore, 'ModelLoader and VRClub disagree on the Quest light budget');
});

test('shared VJ actions exist on VRClub so the DOM and 3D surfaces cannot diverge', () => {
    // The two control surfaces used to implement the same actions twice, and had
    // already drifted (only the 3D path updated the mirror-ball reflection spots and
    // applied fixture exclusivity).
    const ui = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    const domUi = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');

    for (const method of ['cycleSpotColor()', 'cycleMirrorBallColor()', 'applyFixtureExclusivity(', 'resetVJControls()']) {
        assert.ok(ui.includes(method), `VRClubUI is missing shared action ${method}`);
    }
    for (const call of ['cycleSpotColor()', 'cycleMirrorBallColor()', 'applyFixtureExclusivity(']) {
        assert.ok(domUi.includes(call), `ui-init.js must delegate to VRClub.${call}, not reimplement it`);
    }
});

test('VJ panel toggles are allow-listed rather than written by DOM attribute name', () => {
    // `vrClubInstance[el.dataset.control] = !...` is an unrestricted dynamic property
    // write keyed by markup - `__proto__` would reach Object.prototype.
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    assert.match(source, /TOGGLE_CONTROLS\.has\(control\)/);

    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const listed = new Set(
        (source.match(/const TOGGLE_CONTROLS = Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\)/)?.[1] ?? '')
            .split(',').map(s => s.trim().replace(/['\s]/g, '')).filter(Boolean)
    );
    // Every boolean toggle in the DOM must appear in the allow-list, or it silently
    // stops working.
    const booleanControls = [...html.matchAll(/aria-pressed="[^"]*"\s+data-control="([^"]+)"/g)].map(m => m[1]);
    const missing = booleanControls.filter(c => !listed.has(c) && c !== 'toggleShow' && c !== 'goboActive');
    assert.deepEqual(missing, [], `data-control toggles missing from TOGGLE_CONTROLS: ${missing.join(', ')}`);
});

test('PWA manifest declares an installable configuration', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, 'NOCTURNE - Virtual Nightclub');
    assert.equal(manifest.display, 'fullscreen');
    // `id` pins app identity so a future start_url change does not create a second
    // installed app; `scope` bounds the SW-controlled navigation surface.
    assert.ok(manifest.id, 'manifest.json must declare an `id`');
    assert.ok(manifest.scope, 'manifest.json must declare a `scope`');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.json declares no icons');
});


// ---------------------------------------------------------------------------
// Bar and entrance
// ---------------------------------------------------------------------------

test('every bar bottle style is a closed, outward-facing lathe sampled inside its atlas cell', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/barProps.js');
    const { BarProps } = window;
    assert.equal(Object.keys(BarProps.STYLES).length, 12);
    for (const style of Object.keys(BarProps.STYLES)) {
        const g = BarProps.bottleGeometry(style);
        const vertices = g.positions.length / 3;
        assert.equal(g.normals.length, g.positions.length);
        assert.equal(g.uvs.length / 2, vertices);
        assert.equal(g.colors.length / 4, vertices);
        assert.ok(g.positions.every(Number.isFinite) && g.normals.every(Number.isFinite), `${style} has non-finite data`);
        assert.ok(g.uvs.every(value => value >= 0 && value <= 1), `${style} samples outside the atlas`);
        assert.ok(Math.max(...g.indices) < vertices && g.indices.length % 3 === 0);
        const ys = g.positions.filter((_, index) => index % 3 === 1);
        assert.ok(Math.min(...ys) >= -1e-9, `${style} reaches below its base`);
        assert.ok(Math.max(...ys) > 0.2 && Math.max(...ys) < 0.34, `${style} is not bottle sized (${Math.max(...ys)})`);

        // The winding must agree with Babylon's own face normals, or back-face culling would hide the glass.
        const derived = new Array(g.positions.length).fill(0);
        BABYLON.VertexData.ComputeNormals(g.positions, g.indices, derived);
        let agree = 0, counted = 0;
        for (let i = 0; i < derived.length; i += 3) {
            const own = Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2]);
            const theirs = Math.hypot(derived[i], derived[i + 1], derived[i + 2]);
            if (own < 0.5 || theirs < 0.5) continue;
            counted++;
            if (g.normals[i] * derived[i] + g.normals[i + 1] * derived[i + 1] + g.normals[i + 2] * derived[i + 2] > 0) agree++;
        }
        assert.ok(counted > vertices * 0.8 && agree / counted > 0.97, `${style} faces inward (${agree}/${counted})`);
    }
});

test('shelves are stocked deterministically, inside their span, without overlaps, below the next board', () => {
    const { window } = loadClassic('js/barProps.js');
    const layout = loadClassic('js/venueDressing.js').window.VenueLayout.bar;
    const { BarProps } = window;
    const spacing = layout.backBar.shelves[1] - layout.backBar.shelves[0];
    const tallest = Math.max(...Object.values(BarProps.STYLES).map(style => style.capTop));
    assert.ok(tallest < spacing - 0.05, `a ${tallest} m bottle does not fit a ${spacing} m shelf bay`);

    const shelf = { x: 12.06, y: 1.44, z0: -13.55, z1: -6.25, styles: ['vodka', 'gin', 'whisky', 'champagne'], yaw: -Math.PI / 2, seed: 7,
        avoid: [{ z: -9.9, half: 0.03 }, { z: -12.0, half: 0.03 }] };
    const first = BarProps.stockShelf(shelf);
    assert.deepEqual(BarProps.stockShelf(shelf), first, 'the shelf must look the same on every load');
    assert.ok(first.length >= 12, 'a back-bar shelf needs a stocked look');
    for (const bottle of first) {
        const radius = BarProps.STYLES[bottle.style].r;
        assert.ok(bottle.z - radius >= shelf.z0 - 1e-9 && bottle.z + radius <= shelf.z1 + 1e-9, 'a bottle overhangs the shelf');
        for (const zone of shelf.avoid) {
            assert.ok(bottle.z + radius <= zone.z - zone.half + 1e-9 || bottle.z - radius >= zone.z + zone.half - 1e-9,
                `a bottle stands across the upright at ${zone.z}`);
        }
    }
    for (let i = 1; i < first.length; i++) {
        const gap = first[i].z - first[i - 1].z - BarProps.STYLES[first[i].style].r - BarProps.STYLES[first[i - 1].style].r;
        assert.ok(gap > -1e-6, `bottles ${i - 1} and ${i} intersect`);
    }
    const merged = BarProps.mergePlacements(first);
    const expected = first.reduce((sum, bottle) => sum + BarProps.bottleGeometry(bottle.style).positions.length / 3, 0);
    assert.equal(merged.positions.length / 3, expected);
});

test('the bar layout leaves room for guests, stools and the bartender', () => {
    const BABYLON = makeBabylonStub();
    const layout = loadClassic('js/venueDressing.js').window.VenueLayout.bar;
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const { counter, backBar, stoolX, stoolZ, bartender } = layout;
    assert.ok(bartender.x > counter.xBack + 0.3 && bartender.x < backBar.xFront - 0.2, 'the bartender must stand between counter and back bar');
    assert.ok(bartender.z > counter.z0 && bartender.z < counter.z1, 'the bartender must be behind the counter, not beside it');
    assert.ok(stoolZ.every(z => z > counter.z0 && z < counter.z1) && stoolX < counter.xFront - 0.3, 'stools stand in front of the counter');
    for (let i = 1; i < stoolZ.length; i++) assert.ok(stoolZ[i] - stoolZ[i - 1] >= 1.0, 'stools are too close together to sit at');
    // Counter, stools and back bar end well inside the right wall's pillars at z -5 and -15.
    assert.ok(counter.z1 < -5.8 && backBar.z0 > -14.5);

    const slots = window.VRClubAudioCrowd.prototype._guestSlots.call({});
    for (const slot of slots) {
        const inFootprint = slot.x > stoolX - 0.7 && slot.z > backBar.z0 - 0.5 && slot.z < backBar.z1 + 0.5;
        assert.ok(!inFootprint, `a guest at ${slot.x}, ${slot.z} stands in the bar`);
    }
});

// ---------------------------------------------------------------------------
// Mezzanine
// ---------------------------------------------------------------------------

test('in VR the headset stands on the balcony, climbs its stair, steps off its edge and keeps the DJ riser', () => {
    const { window } = loadClassic('js/mezzanine.js');
    const follow = window.Mezzanine._updateVRWalkSurface;
    const D = window.MezzanineLayout.deck, S = window.MezzanineLayout.stairs;
    const eye = 1.62;
    const club = { jumpState: { active: false }, _walkLevel: 0 };
    const camera = { realWorldHeight: eye, position: { x: 0, y: eye, z: -12 } };
    const at = (x, z, feet) => { camera.position.x = x; camera.position.z = z; if (feet !== undefined) camera.position.y = feet + eye; follow.call(club, camera); return +(camera.position.y - eye).toFixed(3); };

    // A teleport lands the feet on the deck: they stay there, and the body is told.
    assert.equal(at(-10.9, -14.7, D.top), D.top);
    assert.equal(club._walkLevel, D.top);
    // Room-scale or smooth walking off the open edge drops the headset to the floor.
    assert.equal(at(-8.5, -14.7), 0);
    // Walking up the stair from the floor carries the headset tread by tread onto the deck.
    const mid = (S.x0 + S.x1) / 2;
    at(mid, S.zBottom + 0.5, 0);
    let feet = 0;
    for (let z = S.zBottom; z >= S.zTop - 0.6; z -= 0.05) {
        const next = at(mid, z);
        assert.ok(next >= feet - 1e-9 && next - feet < 0.2, `the stair jumped from ${feet} to ${next} at z ${z.toFixed(2)}`);
        feet = next;
    }
    assert.equal(feet, D.top, 'the top of the stair is the deck');
    // Under the deck is the floor, whatever is overhead.
    assert.equal(at(-11, -15, 0), 0);
    // Crouching lowers the eye and the tracked height together: the feet, and the surface, stay put.
    camera.realWorldHeight = 0.9;
    camera.position.y = 0.9;
    at(0, -12);
    assert.equal(camera.position.y, 0.9);
    camera.realWorldHeight = eye;
    // The DJ Booth destination stands the headset on the 0.5 m riser; it stays there.
    assert.equal(at(0, -19.4, 0.5), 0.5);
    // In flight, the jump owns the height.
    club.jumpState.active = true;
    camera.position.y = 2.6;
    at(0, -12);
    assert.equal(camera.position.y, 2.6);
});

test('the walking-surface follow climbs the stair and the deck but never snaps walkers off the floor', () => {
    const M = loadClassic('js/mezzanine.js').window.MezzanineLayout;
    const S = M.stairs, D = M.deck;
    const mid = (S.x0 + S.x1) / 2;

    // Climbing in small steps from the bottom lands exactly on the deck, level at every step.
    let level = 0;
    const heights = [];
    for (let z = S.zBottom; z >= S.zTop - 0.5; z -= 0.05) {
        const next = M.walkLevel(mid, z, level);
        assert.ok(Math.abs(next - level) < 0.1, `a ${Math.abs(next - level)} m jump at z=${z.toFixed(2)}`);
        level = next;
        heights.push(level);
    }
    assert.equal(level, D.top);
    assert.ok(heights.every((value, index) => index === 0 || value >= heights[index - 1] - 1e-9), 'the climb must be monotonic');
    // Back down the other way.
    for (let z = S.zTop; z <= S.zBottom + 0.5; z += 0.05) level = M.walkLevel(mid, Math.min(z, S.zBottom), level);
    assert.equal(level, 0);

    // Walking beneath the deck or the stair stays on the floor: the candidate surface is more than a step away.
    assert.equal(M.walkLevel(-11, -15, 0), 0);
    assert.equal(M.walkLevel(mid, -9.5, 0), 0);
    assert.equal(M.walkLevel(mid, S.zBottom, 0), 0);
    // Standing on the deck, then stepping off its edge, drops to the floor.
    assert.equal(M.walkLevel(-11, -15, D.top), D.top);
    assert.equal(M.walkLevel(-8, -15, D.top), 0);
});

test('mezzanine beams point from one end to the other and the stair rises to the deck', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const scene = new BABYLON.Scene(new BABYLON.NullEngine());
    // The same call the mezzanine's beam() makes: a box of the segment's length, centred, aimed with lookAt.
    for (const [from, to] of [[[0, 0.2, -6], [0, 3, -10.4]], [[-9.5, 0.2, -18.8], [-9.5, 2.6, -14.7]], [[-9.5, 4, -19], [-9.5, 4, -10.4]], [[-12, 1, -5], [-10, 2, -9]]]) {
        const length = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
        const mesh = BABYLON.MeshBuilder.CreateBox('beam', { width: 0.05, height: 0.05, depth: length }, scene);
        mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
        mesh.lookAt(new BABYLON.Vector3(...to));
        const world = mesh.computeWorldMatrix(true);
        const a = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0, -length / 2), world);
        const z = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, 0, length / 2), world);
        assert.ok(a.subtractFromFloats(...from).length() < 1e-4 && z.subtractFromFloats(...to).length() < 1e-4, `a beam does not run from ${from} to ${to}`);
    }
    scene.dispose();
    const M = loadClassic('js/mezzanine.js').window.MezzanineLayout;
    const run = M.stairs.zBottom - M.stairs.zTop;
    const riser = M.deck.top / M.stairs.steps;
    const tread = run / (M.stairs.steps - 1);
    assert.ok(riser >= 0.15 && riser <= 0.2 && tread >= 0.25 && tread <= 0.32, `the stair is not comfortable (${riser} / ${tread})`);
    assert.ok(2 * riser + tread >= 0.6 && 2 * riser + tread <= 0.66, 'the 2R+T rule of thumb fails');
    assert.ok(M.stairs.x1 - M.stairs.x0 >= 1.2, 'the stair is too narrow to pass a rail with the camera ellipsoid');
});

test('guests and the dance-floor crowd stay out of the mezzanine and its stair', () => {
    const BABYLON = makeBabylonStub();
    const M = loadClassic('js/mezzanine.js').window.MezzanineLayout;
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const slots = window.VRClubAudioCrowd.prototype._guestSlots.call({});
    const clear = 0.8;
    let onDeck = 0;
    for (const slot of slots) {
        const underOrBeside = slot.x < M.deck.x1 + clear && slot.z < M.stairs.zBottom + clear && slot.z > M.deck.z0 - clear;
        if (slot.y) {
            onDeck++;
            assert.equal(slot.y, M.deck.top);
            assert.ok(slot.x > M.deck.x0 + 0.4 && slot.x < M.deck.x1 - 0.3 && slot.z > M.deck.z0 + 0.4 && slot.z < M.deck.z1 - 0.4, 'the deck guest must stand on the deck');
        } else {
            assert.ok(!underOrBeside, `a floor guest at ${slot.x}, ${slot.z} stands in the mezzanine's footprint`);
        }
    }
    assert.equal(onDeck, 1);
    // The deck guest belongs to the high tier, not the balanced one.
    const index = slots.findIndex(slot => slot.y);
    const tiers = [...readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8').matchAll(/guestSize:\s*(\d+)/g)].map(match => Number(match[1]));
    assert.ok(index >= tiers[2] && index < tiers[1], `the deck guest is slot ${index}; tiers ${tiers}`);
});

// ---------------------------------------------------------------------------
// Bass bins under the PA
// ---------------------------------------------------------------------------

test('a bass bin hangs from its speaker: below it, facing the way it faces, and in the same accent light', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const CLUB_POSITIONS = { paSpeakers: { left: { x: -6, y: 7.1, z: -16 }, right: { x: 6, y: 7.1, z: -16 } } };
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON, CLUB_POSITIONS, navigator: { userAgent: '' }, AbortController, IndexedDBAssetCache: class {}, InFlightRegistry: class {}
    });
    const configs = window.ModelLoader.prototype.getModelConfigs.call({});
    for (const side of ['left', 'right']) {
        const bin = configs[`bass_bin_${side}`];
        assert.equal(bin.hangFrom, `pa_speaker_${side}`);
        assert.ok(bin.hangGap > 0.3 && bin.hangGap < 0.6, 'the chain gap must be visible but short');
        assert.equal(bin.placement.fitAxis, 'x');
        assert.ok(bin.placement.fitSize >= 1 && bin.placement.fitSize <= 1.4, 'a folded-horn bin is about 1.2 m wide');
    }
    assert.ok(Object.keys(configs).indexOf('bass_bin_left') > Object.keys(configs).indexOf('pa_speaker_right'),
        'bins are configured after the speakers they hang from');

    const scene = new BABYLON.Scene(new BABYLON.NullEngine());
    for (const [side, yaw] of [['left', Math.PI + Math.PI / 6], ['right', Math.PI - Math.PI / 6]]) {
        // A host standing in for the placed speaker: a tilted box with a known underside.
        const host = BABYLON.MeshBuilder.CreateBox('host', { width: 0.6, height: 1.45, depth: 0.6 }, scene);
        host.rotation.set(-Math.PI / 6, yaw, 0);
        host.position.set(side === 'left' ? -6 : 6, 6.4, -16);
        host.computeWorldMatrix(true);
        const bottomCentre = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0, -0.725, 0), host.getWorldMatrix());
        const loader = Object.create(window.ModelLoader.prototype);
        loader.loadedModels = { [`pa_speaker_${side}`]: { rootMesh: host, placed: { bottomCentre } } };
        const resolved = loader._resolveHangPlacement(`bass_bin_${side}`, configs[`bass_bin_${side}`]);
        assert.ok(Math.abs(resolved.placement.centerX - bottomCentre.x) < 1e-9 && Math.abs(resolved.placement.centerZ - bottomCentre.z) < 1e-9,
            'the bin must hang from the speaker\'s underside, not its centre');
        assert.ok(Math.abs(resolved.placement.topY - (bottomCentre.y - configs[`bass_bin_${side}`].hangGap)) < 1e-9);
        const front = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, -1), host.getWorldMatrix());
        assert.ok(Math.abs(Math.sin(resolved.rotation.y) - front.x / Math.hypot(front.x, front.z)) < 1e-9, 'the bin faces the way the speaker does');
        assert.equal(resolved.rotation.x, 0, 'the bin hangs level, not tilted with the speaker');
        assert.throws(() => Object.assign(Object.create(window.ModelLoader.prototype), { loadedModels: {} })._resolveHangPlacement('bass_bin_left', configs.bass_bin_left), /not loaded/);
    }
});

test('credits stay one click away and the splash names every CC BY creator', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const credits = html.match(/<details id="modelCredits">([\s\S]*?)<\/details>/);
    assert.ok(credits, '#modelCredits must be a <details> disclosure');
    assert.match(credits[1], /<summary[^>]*>[^<]*Credits/, 'the disclosure needs a visible Credits summary');
    const creators = [...credits[1].matchAll(/by <a [^>]*>([^<]+)<\/a>\s*—\s*<a [^>]*>CC BY 4\.0<\/a>/g)].map(m => m[1].trim());
    assert.ok(creators.length >= 4, `expected the CC BY creators in the credits, found ${creators.join(', ')}`);
    const splash = html.match(/<p class="splash-hint splash-credits">([\s\S]*?)<\/p>/);
    assert.ok(splash, 'the splash must carry the credits line');
    for (const creator of creators) assert.ok(splash[1].includes(creator), `${creator} is not named on the splash`);
});

test('the bass bin GLB is optimised: six draws, 512 px maps, and its credit is in the product', () => {
    const json = readGlbJson('js/models/bassbin/source/bass_bin_3.glb');
    assert.equal(json.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0), 6, 'a bin must cost six draws');
    assert.equal(json.materials.length, 6);
    assert.ok(json.images.length <= 3 && json.images.every(image => image.mimeType === 'image/webp'));
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /Bass Bin 3 - Subwoofer[\s\S]{0,400}darksoundlab[\s\S]{0,300}CC BY 4\.0/, 'the CC BY credit must name title, creator and licence');
    assert.match(readFileSync(join(ROOT, 'ASSETS.md'), 'utf8'), /bass_bin_3\.glb/);
});