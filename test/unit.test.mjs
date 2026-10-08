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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    const { window } = loadClassic('js/multiplayer.js');
    const { ClubMultiplayer } = window;
    const hosted = 'wss://vrclub-network.garfieldapp.workers.dev';
    assert.equal(ClubMultiplayer.HOSTED_RELAY, hosted);
    for (const stored of [null, '', 'ws://localhost:8787', 'ws://127.0.0.1:8787/',
        'ws://[::1]:8787', 'wss://custom.example', 'invalid']) {
        let saved = stored;
        const storage = { getItem: () => saved, setItem: (key, value) => { saved = value; } };
        const expected = stored === 'wss://custom.example' ? stored : hosted;
        assert.equal(ClubMultiplayer.defaultServerUrl(storage), expected);
        if (stored?.startsWith('ws:')) assert.equal(saved, hosted);
    }
    assert.equal(ClubMultiplayer.defaultServerUrl({ getItem() { throw new Error('Storage unavailable'); } }), hosted);
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
        vrClubInstance: { audioElement: audio, moveCameraToPreset() {}, guardHostControl() { return true; } },
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
            querySelectorAll() { return []; },
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
        AudioUtils: { isResidentEpisodeUrl: () => false, formatClock: String },
        Podcasts: { get: () => ({ id: 'resident', artist: 'Hernan Cattaneo' }) },
        // The podcast player and its choice buttons are exercised by their own tests (podcasts.js).
        ensurePodcastPlayer: () => ({ selected: () => ({ id: 'resident', artist: 'Hernan Cattaneo' }), queue: null, isQueuedUrl: () => false }),
        refreshPodcastChoices() {},
        setInterval() { return 1; },
        clearInterval() {},
        localStorage: { setItem() {} },
        setTimeout() { return 1; },
        clearTimeout() {},
        vrClubInstance: {
            _audioVolume: 0.6,
            audioElement: null,
            scene: null,
            _isSafeAudioUrl() { return true; },
            getPlaybackInfo() { return { seekable: false, position: 0, duration: 0, playing: false }; },
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
    class Node3 { constructor() { this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.rotation = { y: 0 }; this.enabled = true; } setEnabled(v) { this.enabled = v; } isEnabled() { return this.enabled; } dispose() { this.disposed = true; } }
    const created = [];
    const BABYLON = {
        TransformNode: Node3,
        MeshBuilder: {
            CreateCapsule: () => new Node3(),
            CreateSphere: () => new Node3(),
            CreatePlane: (name, options) => { const m = new Node3(); m.name = name; m.options = options; created.push(m); return m; }
        },
        Mesh: { BILLBOARDMODE_ALL: 7 },
        DynamicTexture: class {
            constructor(name, size, scene, mipmaps) { this.mipmaps = mipmaps; }
            getContext() {
                const noop = () => {};
                return { clearRect: noop, fillRect: noop, fillText: noop, beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop, fill: noop, stroke: noop,
                    measureText: text => ({ width: String(text).length * 30 }) };
            }
            getSize() { return { width: 512, height: 128 }; } update() {} dispose() {}
        },
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

test('name tags and emoji never write depth, so desktop SSR cannot turn them black; tags are small and can be switched off', () => {
    const { manager, AvatarManager, created } = loadAvatarManager();
    manager.updatePeerState('p', 'Pat', { x: 0, y: 1.7, z: 0, rotY: 0 });
    manager.showEmoji('p', '🔥');
    const peer = manager.remotes.get('p');
    for (const plane of [peer.nameplate, peer.emojiPlane]) {
        // A StandardMaterial that writes depth is pre-pass capable, and the SSR composition drew it black.
        assert.equal(plane.material.disableDepthWrite, true, `${plane.name} writes depth`);
        assert.equal(plane.material.useAlphaFromDiffuseTexture, true);
        assert.equal(plane.material.fogEnabled, false);
    }
    assert.ok(AvatarManager.TAG_WIDTH <= 0.6 && AvatarManager.TAG_HEIGHT <= 0.15, 'the tag was 1.1 x 0.28 m; keep it small');
    const tag = created.find(m => m.name === 'remoteLabel_p');
    assert.equal(tag.options.width, AvatarManager.TAG_WIDTH);
    assert.equal(peer.nameplate.material.diffuseTexture.mipmaps, true, 'a small tag needs mipmaps to read from a distance');
    assert.equal(peer.nameplate.isEnabled(), true);

    manager.setNameTags(false);
    assert.equal(peer.nameplate.isEnabled(), false);
    assert.equal(peer.emojiPlane.isEnabled(), true, 'emoji are what the guest chose to say; they stay');
    manager.updatePeerState('q', 'Quinn', { x: 1, y: 1.7, z: 0, rotY: 0 });
    assert.equal(manager.remotes.get('q').nameplate.isEnabled(), false, 'a guest who arrives later follows the setting');
    manager.setNameTags(true);
    assert.equal(peer.nameplate.isEnabled(), true);
    assert.equal(manager.remotes.get('q').nameplate.isEnabled(), true);
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

// The podcasts module (js/podcasts.js) is shared by the Audio menu and the VR menu. It is driven here with its
// real source against a fake club and a fake feed fetcher.
function loadPodcasts(extra = {}) {
    const audio = loadClassic('js/audioUtils.js').window;
    const loaded = loadClassic('js/podcasts.js', { TextDecoder, TextEncoder, ...extra });
    loaded.window.AudioUtils = audio.AudioUtils;
    return loaded.window.Podcasts;
}

function fakeClub() {
    const played = [];
    const listeners = {};
    const club = {
        audioElement: { addEventListener: (type, fn) => { listeners[type] = fn; } },
        _audioStreamUrl: null,
        networkManager: null,
        failing: new Set(),
        djs: [],
        played,
        listeners,
        startAudioStream(url, options) {
            if (club.failing.has(url)) return Promise.reject(new Error('404'));
            played.push({ url, onDemand: options && options.onDemand });
            club._audioStreamUrl = url;
            return Promise.resolve();
        },
        setDJ(id) { club.djs.push(id); return Promise.resolve(true); },
        showErrorMessage(message) { club.lastError = message; }
    };
    return club;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const episodeList = (count, prefix = 'e') => Array.from({ length: count }, (_, i) => ({ title: `${prefix}${count - i}`, url: `https://x/${prefix}${count - i}.mp3` }));

function feedFor(episodes) {
    return `<rss><channel>${episodes.map(e => `<item><title>${e.title}</title><enclosure url="${e.url}" type="audio/mpeg"/></item>`).join('')}</channel></rss>`;
}

test('the podcast catalogue has the two DJs, remembers the choice and falls back safely', () => {
    const Podcasts = loadPodcasts();
    assert.deepEqual([...Podcasts.ids], ['resident', 'colourizon']);
    assert.equal(Podcasts.get('resident').dj, 'hernan');
    assert.equal(Podcasts.get('colourizon').dj, 'melera');
    assert.equal(Podcasts.get('nonsense').id, 'resident', 'an unknown id falls back to the default');

    const store = new Map();
    const storage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, value) };
    assert.equal(Podcasts.selectedId(storage), 'resident', 'nothing stored: Hernan Cattaneo');
    assert.equal(Podcasts.saveSelected('colourizon', storage), true);
    assert.equal(store.get('vrclub.podcast'), 'colourizon');
    assert.equal(Podcasts.selectedId(storage), 'colourizon');
    store.set('vrclub.podcast', '__proto__');
    assert.equal(Podcasts.selectedId(storage), 'resident', 'a tampered value is ignored');
    assert.equal(Podcasts.saveSelected('__proto__', storage), false);
    assert.equal(Podcasts.selectedId({ getItem() { throw new Error('blocked'); } }), 'resident', 'private browsing');
    assert.equal(Podcasts.selectedId(null), 'resident');
});

test('the Miss Melera feed is reached through the relay, whose https origin comes from its ws(s) address', () => {
    const Podcasts = loadPodcasts();
    assert.equal(Podcasts.relayBase('wss://vrclub-network.garfieldapp.workers.dev'), 'https://vrclub-network.garfieldapp.workers.dev');
    assert.equal(Podcasts.relayBase('wss://relay.example/some/path?room=1'), 'https://relay.example');
    assert.equal(Podcasts.relayBase('ws://192.168.1.5:8787'), 'http://192.168.1.5:8787');
    for (const bad of ['https://relay.example', 'javascript:alert(1)', 'not a url', '', null]) {
        assert.equal(Podcasts.relayBase(bad), null, String(bad));
    }
    const hernan = Podcasts.get('resident'), melera = Podcasts.get('colourizon');
    assert.equal(Podcasts.feedUrl(hernan, null), 'https://podcast.hernancattaneo.com/feed.xml', 'Hernan needs no relay');
    assert.equal(Podcasts.feedUrl(melera, 'https://relay.example'), 'https://relay.example/podcast/colourizon/feed.xml');
    assert.equal(Podcasts.feedUrl(melera, null), null, 'without a relay there is no way to read it');
    // What the splash tells the guest about who sees their IP address.
    assert.equal(Podcasts.serversText(hernan, null), 'podcast.hernancattaneo.com and Podbean');
    assert.equal(Podcasts.serversText(melera, 'https://relay.example'), 'relay.example and SoundCloud');
});

test('a random pick covers the whole list, never repeats the previous one and survives tiny lists', () => {
    const Podcasts = loadPodcasts();
    assert.equal(Podcasts.randomIndex(0), -1);
    assert.equal(Podcasts.randomIndex(1), 0);
    assert.equal(Podcasts.randomIndex(1, Math.random, 0), 0, 'a one-episode feed can only repeat');
    assert.equal(Podcasts.randomIndex(10, () => 0), 0);
    assert.equal(Podcasts.randomIndex(10, () => 0.999999), 9);
    assert.equal(Podcasts.randomIndex(10, () => 1), 9, 'an rng that returns exactly 1 stays in range');
    const seen = new Set();
    let state = 12345;
    const rng = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
    for (let i = 0; i < 2000; i++) {
        const avoid = i % 10;
        const index = Podcasts.randomIndex(10, rng, avoid);
        assert.ok(index >= 0 && index < 10 && index !== avoid, `index ${index} avoiding ${avoid}`);
        seen.add(index);
    }
    assert.equal(seen.size, 10, 'every episode must be reachable');
});

test('episodes come from the whole feed, from its head only for the newest, and without a feed there is an explanation', async () => {
    const Podcasts = loadPodcasts();
    const hernan = Podcasts.get('resident');
    const requests = [];
    const list = episodeList(40);
    const fetchBuffer = async (url, options) => {
        requests.push({ url, range: options.headers && options.headers.Range });
        const xml = feedFor(list);
        // A byte range returns only the head, which is cut mid-item like the real server's.
        return new TextEncoder().encode(options.headers && options.headers.Range ? xml.slice(0, xml.indexOf('e30.mp3') + 4) : xml).buffer;
    };
    const full = await Podcasts.fetchEpisodes(hernan, { fetchBuffer });
    assert.equal(full.length, 40, 'a random pick needs every episode');
    assert.equal(requests[0].range, undefined);

    requests.length = 0;
    const head = await Podcasts.fetchEpisodes(hernan, { fetchBuffer, headOnly: true });
    assert.equal(requests.length, 1, 'the newest episode needs only the head');
    assert.match(requests[0].range, /^bytes=0-\d+$/);
    assert.ok(head.length >= 1 && head.length < 40);
    assert.equal(head[0].title, 'e40');

    // A head that does not hold a whole item falls back to the full feed.
    requests.length = 0;
    const tiny = await Podcasts.fetchEpisodes(hernan, {
        fetchBuffer: async (url, options) => {
            requests.push(options.headers && options.headers.Range);
            return new TextEncoder().encode(options.headers && options.headers.Range ? '<rss><item><title>cut' : feedFor(list)).buffer;
        },
        headOnly: true
    });
    assert.equal(tiny.length, 40);
    assert.equal(requests.length, 2);

    await assert.rejects(() => Podcasts.fetchEpisodes(Podcasts.get('colourizon'), { relay: null, fetchBuffer }), /not reachable/);
    await assert.rejects(() => Podcasts.fetchEpisodes(hernan, { fetchBuffer: async () => new TextEncoder().encode('<rss></rss>').buffer }), /No playable episode/);
});

test('a random episode of the chosen podcast starts, saves the choice, switches the DJ and tells the room', async () => {
    const Podcasts = loadPodcasts();
    const club = fakeClub();
    const sent = [];
    club.networkManager = { connected: true, isHost: () => true, sendMusic: message => sent.push(message) };
    const store = new Map([['vrclub.podcast', 'resident']]);
    const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
    const episodes = episodeList(30, 'm');
    const fetches = [];
    const player = Podcasts.createPlayer(club, {
        getRelay: () => 'https://relay.example',
        rng: () => 0.5,
        storage,
        fetchBuffer: async (url) => { fetches.push(url); return new TextEncoder().encode(feedFor(episodes)).buffer; }
    });
    const announced = [];
    player.onEpisode = (episode, podcast) => announced.push([episode.title, podcast.id]);

    const episode = await player.switchTo('colourizon');
    assert.equal(episode.title, 'm15', 'index 15 of 30 with the injected rng');
    assert.equal(store.get('vrclub.podcast'), 'colourizon', 'choosing a podcast is remembered');
    assert.deepEqual(fetches, ['https://relay.example/podcast/colourizon/feed.xml'], 'Miss Melera is read through the relay');
    assert.deepEqual(club.played, [{ url: 'https://x/m15.mp3', onDemand: true }], 'an episode plays once, not looping');
    assert.deepEqual(club.djs, ['melera'], 'the DJ at the decks follows the podcast');
    assert.equal(club.nowPlayingLabel, 'm15');
    assert.deepEqual(announced, [['m15', 'colourizon']]);
    assert.deepEqual(JSON.parse(JSON.stringify(sent)), [{ url: 'https://x/m15.mp3', playing: true, position: 0 }], 'the room host publishes it');
    assert.equal(player.selectedId(), 'colourizon');

    // The list is reused for a few minutes, and a head read is never mistaken for the catalogue.
    await player.playRandom();
    assert.equal(fetches.length, 1, 'a second random pick must not download the feed again');
    for (let i = 0; i < 6; i++) {
        const before = club.played.at(-1).url;
        await player.playRandom();
        assert.notEqual(club.played.at(-1).url, before, 'a random pick must not repeat the episode that just played');
    }
    assert.ok(club.played.every(entry => entry.onDemand === true));
    assert.equal(player.isQueuedUrl(club.played.at(-1).url), true);
    assert.equal(player.isQueuedUrl('https://elsewhere/x.mp3'), false);
    assert.equal(player.isQueuedUrl('not a url'), false);

    await player.switchTo('resident');
    assert.deepEqual(club.djs.slice(-1), ['hernan']);
    assert.equal(fetches.at(-1), 'https://podcast.hernancattaneo.com/feed.xml');
});

test('a finished episode is followed by the next older one, then a random one; a different choice stops the queue', async () => {
    const Podcasts = loadPodcasts();
    const club = fakeClub();
    const player = Podcasts.createPlayer(club, { rng: () => 0, storage: null });
    const episodes = episodeList(3, 'p'); // p3 (newest), p2, p1
    const refetch = episodeList(5, 'q');
    player.episodesFor = async () => refetch;

    await player.playFrom(Podcasts.get('resident'), episodes, 0);
    assert.deepEqual(club.played.map(p => p.url), ['https://x/p3.mp3']);
    assert.equal(typeof club.listeners.ended, 'function', 'the end of an episode is not observed');
    assert.equal(club.audioElement._vrclubEpisodeWatch, true);

    club.listeners.ended(); await flush();
    assert.equal(club.played.at(-1).url, 'https://x/p2.mp3');
    club.listeners.ended(); await flush();
    assert.equal(club.played.at(-1).url, 'https://x/p1.mp3');

    // Out of older episodes: look again (a new one may be out) and pick a random one.
    club.listeners.ended(); await flush();
    assert.equal(club.played.at(-1).url, 'https://x/q5.mp3', 'rng 0 picks the first of the fresh list');
    assert.equal(club.played.length, 4);

    // One 'ended' listener per element, however many episodes it has carried.
    assert.equal(Object.keys(club.listeners).length, 1);

    // The guest chooses something else: the old episode ending must not start another.
    const before = club.played.length;
    club._audioStreamUrl = 'https://radio.example/live';
    club.listeners.ended(); await flush();
    assert.equal(club.played.length, before, 'the queue kept playing after the guest chose another stream');

    // A dead episode is skipped in favour of the next older one, a few times and no further.
    const dead = episodeList(6, 'd');
    for (const id of ['d6', 'd5', 'd4']) club.failing.add(`https://x/${id}.mp3`);
    await assert.rejects(() => player.playFrom(Podcasts.get('resident'), dead, 0), /404/, 'three dead links in a row is a dead feed');
    assert.equal(player.queue, null);
    club.failing.delete('https://x/d4.mp3');
    assert.equal((await player.playFrom(Podcasts.get('resident'), dead, 0)).title, 'd4');

    // An autoplay block is rethrown at once, with the queue left on that episode for a retry.
    club.startAudioStream = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    await assert.rejects(() => player.playFrom(Podcasts.get('resident'), episodes, 1), { name: 'NotAllowedError' });
    assert.equal(player.queue.index, 1);
    assert.equal(club.lastError, undefined);
});

test('when the next episode cannot start the guest is told and the queue is released', async () => {
    const Podcasts = loadPodcasts();
    const club = fakeClub();
    const player = Podcasts.createPlayer(club, { storage: null });
    await player.playFrom(Podcasts.get('resident'), episodeList(2, 'z'), 0);
    for (const url of ['https://x/z1.mp3']) club.failing.add(url);
    club.listeners.ended(); await flush();
    assert.equal(player.queue, null);
    assert.match(club.lastError, /next one could not start/);
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

test('a file\'s fingerprint comes from a HEAD that goes past the HTTP cache, and is null when it cannot be known', async () => {
    const requests = [];
    const headers = values => ({ get: name => values[name.toLowerCase()] ?? null });
    let reply = { ok: true, headers: headers({ etag: 'W/"6b6-1"', 'last-modified': 'Wed, 07 Oct 2026 21:00:00 GMT', 'content-length': '7038916' }) };
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout,
        fetch: async (url, init) => { requests.push([url, init.method, init.cache]); if (reply instanceof Error) throw reply; return reply; }
    });
    assert.equal(await window.fetchAssetFingerprint('./js/models/city/downtown.glb'), 'W/"6b6-1"|Wed, 07 Oct 2026 21:00:00 GMT|7038916');
    assert.deepEqual(requests[0], ['./js/models/city/downtown.glb', 'HEAD', 'no-cache'], 'a HEAD, revalidated, not served from the HTTP cache');
    reply = { ok: true, headers: headers({ 'content-length': '12' }) };
    assert.equal(await window.fetchAssetFingerprint('a.glb'), '||12', 'the length alone still tells a rebuilt file apart');
    reply = { ok: true, headers: headers({}) };
    assert.equal(await window.fetchAssetFingerprint('a.glb'), null, 'no validators: unknown');
    reply = { ok: false, headers: headers({ etag: 'x' }) };
    assert.equal(await window.fetchAssetFingerprint('a.glb'), null);
    reply = new Error('offline');
    assert.equal(await window.fetchAssetFingerprint('a.glb'), null, 'offline: unknown, never a throw');
});

test('the cache stores a fingerprint beside a payload and gives both back', async () => {
    const { window } = loadClassic('js/assetCache.js', { AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true }) });
    const cache = new window.IndexedDBAssetCache({ dbName: 'test', storeName: 'assets', logger: { info() {}, warn() {}, error() {} } });
    const store = new Map();
    cache.db = {};
    cache._run = async (mode, work) => work({ put: record => store.set(record.url, record), get: url => store.get(url) });
    await cache.put('new.glb', 'bytes', { fingerprint: 'abc' });
    await cache.put('old.glb', 'bytes');
    assert.deepEqual({ ...(await cache.getRecord('new.glb')) }, { payload: 'bytes', meta: { fingerprint: 'abc' } });
    assert.deepEqual({ ...(await cache.getRecord('old.glb')) }, { payload: 'bytes', meta: null }, 'an entry from before fingerprints has none');
    assert.equal(await cache.get('new.glb'), 'bytes');
    assert.equal(await cache.getRecord('missing.glb'), null);
});

test('a model rebuilt in place reaches a returning visitor: the cached copy is used only while it is still the same file', async () => {
    let fingerprint = 'v2';
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON: makeBabylonStub(),
        fetchAssetFingerprint: async () => fingerprint
    });
    const load = async (cached) => {
        const downloads = [], writes = [];
        const loader = {
            log: { info() {}, warn() {}, error() {} },
            abortController: new AbortController(),
            inFlight: { run: (_key, work) => work() },
            cache: { getRecord: async () => cached, put: async (url, payload, meta) => { writes.push(meta ? { ...meta } : meta); return true; } },
            downloadModel: async (url, options) => { downloads.push({ ...options }); return 'fresh'; }
        };
        const bytes = await window.ModelLoader.prototype.loadOrDownloadModel.call(loader, './js/models/city/downtown.glb');
        return { bytes, downloads, writes };
    };
    let r = await load({ payload: 'cached', meta: { fingerprint: 'v2' } });
    assert.equal(r.bytes, 'cached', 'the same file: no download');
    assert.equal(r.downloads.length, 0);

    r = await load({ payload: 'stale street', meta: { fingerprint: 'v1' } });
    assert.equal(r.bytes, 'fresh', 'a file rebuilt in place must be downloaded again');
    assert.deepEqual(r.downloads, [{ revalidate: true }], 'and past the HTTP cache too');
    assert.deepEqual(r.writes, [{ fingerprint: 'v2' }]);

    r = await load({ payload: 'stale street', meta: null });
    assert.equal(r.bytes, 'fresh', 'an entry cached before fingerprints existed is refreshed once');

    r = await load(null);
    assert.equal(r.bytes, 'fresh');
    assert.deepEqual(r.downloads, [{ revalidate: false }], 'a first download may use the HTTP cache');
    assert.deepEqual(r.writes, [{ fingerprint: 'v2' }]);

    fingerprint = null;   // offline, or a server without validators
    r = await load({ payload: 'cached', meta: { fingerprint: 'v1' } });
    assert.equal(r.bytes, 'cached', 'offline the cache still works');
    r = await load(null);
    assert.deepEqual(r.writes, [null]);
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

test('selective glow stays disabled because its private depth buffer cannot see opaque occluders', () => {
    class GlowLayer {
        constructor() {
            this.isEnabled = true;
            this.intensity = 0;
        }
    }
    const { window } = loadClassic('js/club/02-lifecycle.js', {
        BABYLON: { GlowLayer }, VRClubCore: class {}, log: { info() {} }
    });
    const club = {
        scene: {},
        vrSettings: { desktop: { glowIntensity: 0.65 } }
    };
    window.VRClubLifecycle.prototype._createGlowLayer.call(club);
    assert.equal(club.glowLayer.isEnabled, false, 'selective glow can reveal a light through a wall or person');
    assert.equal(club.glowLayer.intensity, 0.65, 'the configured value remains available to diagnostics');
    // Entering or leaving XR must not switch it back on: no source file may enable it.
    for (const file of ['js/club/01-core.js', 'js/club/02-lifecycle.js', 'js/club/03-rendering.js']) {
        assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /glowLayer\.isEnabled\s*=\s*true/,
            `${file} re-enables the selective glow layer`);
    }
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
    window.VenueLayout = loadClassic('js/venueDressing.js').window.VenueLayout;
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
    // The compressor feeds the voice-duck gain, then the master gain. The duck sits after the analyser tap, so the
    // light show still hears the whole track while people talk.
    assert.ok(connected(club.audioCompressor, club.voiceDuckGain));
    assert.ok(connected(club.voiceDuckGain, club.audioMasterGain));
    assert.ok(!downstream(club.voiceDuckGain).has(club.audioAnalyser));
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
    const Crowd = window.VRClubAudioCrowd;
    const slots = Crowd.prototype._guestSlots.call({});
    const clipsOf = file => new Set(readGlbJson(`js/models/avatars/${file}`).animations.map(animation => animation.name));

    slots.forEach((slot, index) => {
        const source = Crowd.AVATAR_SOURCES[slot.src];
        assert.ok(source, `slot ${index} points at no source`);
        const file = source.url.split('/').pop();
        assert.match(file, /^club-crowd-/, `slot ${index} must be one of the crowd people, who carry the guest clips`);
        assert.ok(clipsOf(file).has(slot.clip), `slot ${index} wants "${slot.clip}", which ${file} does not carry`);
        assert.ok(Math.abs(slot.x) <= 11.5 && slot.z >= -20 && slot.z <= -5.8, `slot ${index} is outside the room`);
        assert.ok(Number.isFinite(slot.yaw) && slot.height > 1.5 && slot.height < 2, `slot ${index} has an odd pose or height`);
        assert.notEqual(slot.clip, 'Idle_TalkingPhone_Loop', `slot ${index} tries to make a phone call beside the PA`);
        assert.notEqual(slot.clip, 'Idle_FoldArms_Loop', `slot ${index} uses the stiff crossed-arm pose`);
        for (const clip of slot.clips || []) {
            assert.ok(clipsOf(file).has(clip), `slot ${index} keeps "${clip}", which ${file} does not carry`);
        }
        if (slot.clips) assert.ok(slot.clips.includes(slot.clip), `slot ${index} does not keep the clip it starts in`);
    });
    assert.equal(slots[3].clip, 'Idle_Railing_Loop', 'the balcony guest must put her hands on the railing');
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

/** The mingling guest, the people on his round, and a club stub that can be stepped a frame at a time. */
function minglerHarness(guestTarget = 8) {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const Crowd = window.VRClubAudioCrowd;
    const slots = Crowd.prototype._guestSlots.call({});
    const makeGroup = name => ({
        name, from: 0, to: 30, isPlaying: false, speedRatio: 1,
        start(loop, ratio) { this.isPlaying = true; this.speedRatio = ratio; },
        stop() { this.isPlaying = false; },
        goToFrame(frame) { this.frame = frame; }
    });
    const npcs = slots.slice(0, guestTarget).map((slot, index) => {
        const groups = new Map((slot.clips || [slot.clip]).map(name => [name, makeGroup(name)]));
        const current = groups.get(slot.clip);
        current.isPlaying = true;
        return {
            name: `guest${index}`,
            root: {
                position: { x: slot.x, y: slot.y || 0, z: slot.z },
                rotation: { y: slot.yaw },
                enabled: true,
                isEnabled() { return this.enabled; }
            },
            animations: [current],
            baseSpeed: 0.9,
            slotYaw: slot.yaw,
            slotClip: slot.clip,
            poses: slot.clips ? { groups, current } : null,
            collider: { position: { x: slot.x, y: 0.85, z: slot.z, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
            _shadowIndex: index
        };
    });
    const bartenderGroup = makeGroup('Idle_Talking_Loop');
    bartenderGroup.isPlaying = true;
    npcs.push({
        name: 'bartender',
        root: {
            position: { x: 11, y: 0, z: -9.9 },
            rotation: { y: -Math.PI / 2 },
            enabled: true,
            isEnabled() { return this.enabled; }
        },
        animations: [bartenderGroup],
        baseSpeed: 0.9,
        slotYaw: -Math.PI / 2,
        slotClip: 'Idle_Talking_Loop',
        poses: null
    });
    const club = Object.assign(Object.create(Crowd.prototype), { npcAvatars: npcs });
    const minglerIndex = slots.findIndex(slot => slot.mingles);
    const mingler = npcs[minglerIndex];
    club._startMingling(mingler, slots[minglerIndex]);
    const playing = npc => (npc.poses ? npc.poses.current.name : npc.animations[0].name);
    return { Crowd, club, slots, npcs, mingler, minglerIndex, playing };
}

test('exactly one side guest walks the room, and his round never crosses anybody standing in it', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {}, log: { info() {}, warn() {}, error() {} } });
    const Crowd = window.VRClubAudioCrowd;
    const guests = Crowd.prototype._guestSlots.call({});
    const mingling = guests.filter(slot => slot.mingles);
    assert.equal(mingling.length, 1, 'one guest walks the room; the rest stand where they are placed');
    assert.ok(mingling[0].clips.includes('Walk') && mingling[0].clips.includes('Idle_Talking_Loop'),
        'the walking guest must keep a walk and a talking pose');
    assert.ok(mingling[0].clips.includes('Drink_Loop'), 'the walking guest must keep his bar pose');
    assert.ok(mingling[0].clips.includes('Smoke_Loop'), 'the walking guest must keep his outdoor smoking pose');

    const route = Crowd.prototype._minglerRoute.call({});
    assert.ok(route.nodes.length >= 4, 'a round of fewer than four points is not walking the room');
    assert.ok(route.speed > 0.6 && route.speed < 1.6, 'a club guest walks, he does not march or stroll to a halt');
    const stops = route.nodes.filter(node => node.guest != null);
    assert.ok(stops.length >= 2, 'he must have someone to talk to');
    for (const node of stops) {
        const partner = guests[node.guest];
        assert.ok(partner && !partner.mingles, `node points at guest slot ${node.guest}, who is not there to talk to`);
        assert.ok(partner.clip === 'Idle_Talking_Loop'
            || (partner.clips && partner.clips.includes('Idle_Talking_Loop')),
            `guest slot ${node.guest} cannot talk back`);
        assert.ok(Math.hypot(node.x - partner.x, node.z - partner.z) < 1.3,
            `he stops too far from guest ${node.guest} to be talking to them`);
    }
    const barStop = route.nodes.find(node => node.bartender);
    assert.ok(barStop && barStop.drink, 'his round never reaches the bartender for a drink');
    const barLayout = loadClassic('js/venueDressing.js').window.VenueLayout.bar;
    assert.ok(barStop.x < barLayout.counter.xFront - 0.1 && Math.abs(barStop.z - barLayout.bartender.z) < 0.4,
        'the drink stop is not on the customer side opposite the bartender');
    assert.deepEqual(Array.from(route.nodes.filter(node => node.activity), node => node.activity),
        ['watch', 'smoke', 'balcony'], 'the route must include the three intentional solo stops');
    // `home` is his own spot, where he stands on his own and where he starts.
    const home = route.nodes[route.home];
    assert.equal(home.guest, undefined);
    assert.ok(Math.hypot(home.x - mingling[0].x, home.z - mingling[0].z) < 0.01,
        'the round must start where he was placed');

    // Everybody he would have to walk through: the dance floor, the other side guests, the bar and the stair.
    const floor = Object.assign(Object.create(Crowd.prototype), {
        tierSettings: { crowdSize: 14, guestSize: 8 }, npcAvatars: [], _loadCrowdSources: async () => {},
        _applyDJ: async () => true, _initialDJId: () => 'hernan', _spawnCrowdTo() {}, _spawnLocalPlayerBody() {},
        _applyCrowdSize() {}, _refreshShadowCasters() {}, _spawnAvatar() {}
    });
    return floor.createDancingNPCs().then(() => {
        const standing = [...floor._crowdSlots, ...guests.filter(slot => !slot.mingles && !slot.y)];
        const bar = loadClassic('js/venueDressing.js').window.VenueLayout.bar;
        const mezz = loadClassic('js/mezzanine.js').window.MezzanineLayout;
        // Distance from a point to the leg a->b.
        const clearance = (a, b, p) => {
            const vx = b.x - a.x, vz = b.z - a.z;
            const len2 = vx * vx + vz * vz;
            const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2)) : 0;
            return Math.hypot(a.x + vx * t - p.x, a.z + vz * t - p.z);
        };
        for (let i = 0; i < route.nodes.length; i++) {
            const node = route.nodes[i];
            assert.ok(node.x > -12.5 && node.x < 12.5 && node.z > -20 && node.z < 8,
                `round point ${i} is outside the room`);
            assert.ok(node.bartender
                || !(node.x > bar.stoolX - 0.7 && node.z > bar.backBar.z0 - 0.5 && node.z < bar.backBar.z1 + 0.5),
                `round point ${i} walks through the bar`);
            // Under the deck is open floor (its top is at y 3); the stair itself is the only thing in his way.
            const followsMezzStair = node.x >= mezz.stairs.x0 - 0.1 && node.x <= mezz.stairs.x1 + 0.1
                && node.z <= mezz.stairs.zBottom && node.z >= mezz.stairs.zTop;
            assert.ok(followsMezzStair
                || !(node.x < mezz.stairs.x1 + 0.6 && node.z < mezz.stairs.zBottom + 0.6 && node.z > mezz.stairs.zTop - 0.6),
                `round point ${i} walks into the mezzanine stair`);
            if (i === 0) continue;
            for (const person of standing) {
                const gap = clearance(route.nodes[i - 1], node, person);
                assert.ok(gap >= 0.8, `the leg to round point ${i} passes ${gap.toFixed(2)} m from someone at ${person.x}, ${person.z}`);
            }
        }
    });
});

test('the mingling guest walks his round, talks with the people he stops at, and leaves them as he found them', () => {
    const { Crowd, club, mingler, npcs, playing } = minglerHarness(8);
    const random = Math.random;
    Math.random = () => 0.5;
    try {
        const route = Crowd.prototype._minglerRoute.call({});
        const partners = new Set();
        const drinkStages = new Set();
        let walked = 0, walkingFrames = 0, settling = 0, lastPartner = null, drank = false;
        const soloActivities = new Set([mingler.mingle.activity]);
        let last = { x: mingler.root.position.x, z: mingler.root.position.z };
        for (let frame = 0; frame < 60 * 180; frame++) {
            club._updateMingler(1 / 60);
            const pos = mingler.root.position;
            if (frame > 5 * 60 && mingler.mingle.phase === 'dwell') {
                const node = route.nodes[mingler.mingle.node];
                assert.ok(node.guest != null || node.bartender || node.activity,
                    `he stopped alone at navigation point ${mingler.mingle.node}`);
                if (node.activity) soloActivities.add(node.activity);
            }
            walked += Math.hypot(pos.x - last.x, pos.z - last.z);
            last = { x: pos.x, z: pos.z };
            if (playing(mingler) === 'Walk') walkingFrames++;
            const talking = mingler.mingle.partner;
            if (talking !== lastPartner) { lastPartner = talking; settling = 2 * 60; }
            if (settling > 0) settling--;
            if (talking && mingler.mingle.phase === 'dwell') {
                partners.add(talking.name);
                const drinking = ['pickup', 'drink', 'return'].includes(mingler.mingle.activity);
                const expected = drinking ? 'Drink_Loop' : 'Idle_Talking_Loop';
                assert.equal(playing(mingler), expected, 'he uses the wrong interaction pose');
                assert.equal(playing(talking), 'Idle_Talking_Loop', `${talking.name} does not talk back`);
                if (talking.name === 'bartender') drinkStages.add(mingler.mingle.activity);
                if (mingler.mingle.activity === 'drink') drank = true;
                // Both are turned toward each other, not past each other, once they have had a moment to turn round.
                if (settling === 0) {
                    const want = Math.atan2(pos.x - talking.root.position.x, pos.z - talking.root.position.z);
                    const off = Math.abs(Math.atan2(Math.sin(want - talking.root.rotation.y), Math.cos(want - talking.root.rotation.y)));
                    assert.ok(off < 0.4, `${talking.name} is not facing him (${off.toFixed(2)} rad off)`);
                }
            }
            // The collider travels with him; a left-behind collider is an invisible wall.
            assert.ok(Math.abs(mingler.collider.position.x - pos.x) < 1e-6
                && Math.abs(mingler.collider.position.z - pos.z) < 1e-6, 'his collider stayed behind');
        }
        assert.ok(partners.size >= 2, `he only ever talked to ${partners.size} person`);
        assert.ok(drank && partners.has('bartender'), 'he never got a drink from the bartender');
        assert.deepEqual([...soloActivities], ['watch', 'smoke', 'balcony'],
            'he did not complete every intentional solo destination');
        assert.deepEqual([...drinkStages], ['order', 'serve', 'served', 'pickup', 'drink', 'return', 'returned', 'clear'],
            'the bartender service, pickup, drink, return and clearing sequence did not run in order');
        assert.ok(walked > 25, `he barely moved (${walked.toFixed(1)} m in three minutes)`);
        assert.ok(walkingFrames > 0 && walkingFrames < 60 * 180, 'he either never walks or never stops');
        assert.ok(Math.abs(mingler.collider.position.x - mingler.root.position.x) < 1e-6
            && Math.abs(mingler.collider.position.z - mingler.root.position.z) < 1e-6, 'his collider stayed behind');
        // Everyone he visited is back in their own pose, facing the way they were placed.
        for (const npc of npcs) {
            if (npc === mingler || npc === mingler.mingle.partner) continue;
            assert.equal(playing(npc), npc.slotClip, `${npc.name} was left in the wrong pose`);
            const off = Math.abs(Math.atan2(Math.sin(npc.slotYaw - npc.root.rotation.y), Math.cos(npc.slotYaw - npc.root.rotation.y)));
            assert.ok(off < 0.2, `${npc.name} was left turned ${off.toFixed(2)} rad off her spot`);
        }
        assert.ok(route.nodes.length > 0);
    } finally {
        Math.random = random;
    }
});

test('the mingling guest walks the same distance at any frame rate, and still has somewhere to go on a lower tier', () => {
    const random = Math.random;
    Math.random = () => 0.5;
    try {
        const run = (dt, steps) => {
            const { club, mingler } = minglerHarness(8);
            let walked = 0;
            let last = { x: mingler.root.position.x, z: mingler.root.position.z };
            for (let i = 0; i < steps; i++) {
                club._updateMingler(dt);
                walked += Math.hypot(mingler.root.position.x - last.x, mingler.root.position.z - last.z);
                last = { x: mingler.root.position.x, z: mingler.root.position.z };
            }
            return walked;
        };
        const at60 = run(1 / 60, 60 * 90), at30 = run(1 / 30, 30 * 90), at90 = run(1 / 90, 90 * 90);
        assert.ok(Math.abs(at60 - at30) < 1.0 && Math.abs(at60 - at90) < 1.0,
            `the walk is frame-rate dependent (${at60.toFixed(1)} / ${at30.toFixed(1)} / ${at90.toFixed(1)} m)`);

        // The high tier shows four guests, so most of his round is empty: he must walk through those points,
        // not stall on them.
        const { club, mingler, playing } = minglerHarness(4);
        const visited = new Set();
        for (let frame = 0; frame < 60 * 180; frame++) {
            club._updateMingler(1 / 60);
            if (mingler.mingle.phase === 'dwell') visited.add(mingler.mingle.node);
            assert.ok(playing(mingler) !== 'Walk' || mingler.mingle.phase === 'walk');
        }
        assert.ok(visited.size >= 2, `on the high tier he stops at only ${visited.size} point`);
    } finally {
        Math.random = random;
    }
});

test('the crowd is diverse at every tier: every slot has a file that dances, and nobody is duplicated within a tier', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {}, log: { info() {}, warn() {}, error() {} } });
    const Crowd = window.VRClubAudioCrowd;
    const sources = Crowd.AVATAR_SOURCES;
    assert.equal(new Set(sources.map(source => source.id)).size, sources.length, 'source ids must be unique');
    assert.equal(Crowd.sourceIndex('f1'), sources.findIndex(source => source.id === 'f1'));
    assert.equal(Crowd.sourceIndex('nobody'), -1);
    for (const source of sources) {
        assert.ok(existsSync(join(ROOT, source.url.replace('./', ''))), `${source.url} does not exist`);
    }
    // scripts/build.mjs ships only the model paths it finds written out as string literals. A path assembled from
    // parts is silently missing from dist/, and the club then has no crowd in production.
    const shipped = new Set();
    for (const text of ['js/club/11-audio-crowd.js'].map(file => readFileSync(join(ROOT, file), 'utf8'))) {
        for (const m of text.matchAll(/['"`](?:\.\/)?(js\/models\/[^'"`]+\.(?:glb|gltf|bin))['"`]/g)) shipped.add(m[1]);
    }
    for (const source of sources) {
        assert.ok(shipped.has(source.url.replace('./', '')), `${source.url} is not a literal the production build can find`);
    }

    // The crowd slots are assigned in createDancingNPCs; read them back from a stub run.
    const slots = [];
    const club = Object.assign(Object.create(Crowd.prototype), {
        tierSettings: { crowdSize: 14, guestSize: 8 }, npcAvatars: [], _loadCrowdSources: async () => {},
        _applyDJ: async () => true, _initialDJId: () => 'hernan', _spawnCrowdTo() {}, _spawnLocalPlayerBody() {},
        _applyCrowdSize() {}, _refreshShadowCasters() {}, _spawnAvatar() {}
    });
    return club.createDancingNPCs().then(() => {
        slots.push(...club._crowdSlots);
        assert.equal(slots.length, 14);
        for (const slot of slots) {
            const source = sources[slot.src];
            assert.ok(source, 'a dancer slot points at no source');
            if (/club-crowd-/.test(source.url)) {
                const clips = readGlbJson(`js/models/avatars/${source.url.split('/').pop()}`).animations.map(clip => clip.name);
                assert.ok(clips.includes('Dance_Loop'), `${source.id} cannot dance`);
            }
        }
        const tiers = [[14, 8], [10, 4], [6, 2]];
        for (const [crowd, guests] of tiers) {
            const dancers = slots.slice(0, crowd).map(slot => slot.src);
            assert.equal(new Set(dancers).size, dancers.length, `a dancer repeats within the first ${crowd}`);
            const needed = club._requiredCrowdSources(crowd, guests);
            assert.ok(needed.every(index => index >= 0 && index < sources.length));
            // The player's body and the bartender are always needed; the rest follow the tier.
            for (const id of ['dancerF', 'dancerM', 'bartender']) assert.ok(needed.includes(Crowd.sourceIndex(id)), `${id} is not loaded`);
        }
        const balanced = club._requiredCrowdSources(6, 2).length, ultra = club._requiredCrowdSources(14, 8).length;
        assert.ok(balanced < ultra, 'a lower tier must fetch fewer characters');
        // Variety on the floor even at the lowest tier: men and women, and more than one of each.
        const first = slots.slice(0, 6).map(slot => sources[slot.src].id);
        assert.ok(first.some(id => /^f/.test(id)) && first.some(id => /^m/.test(id)) && first.length === 6);
    });
});

test('a higher quality tier fetches only the missing characters, then places them', async () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const Crowd = window.VRClubAudioCrowd;
    const requested = [];
    const club = Object.assign(Object.create(Crowd.prototype), {
        tierSettings: { crowdSize: 2, guestSize: 0 }, npcAvatars: [], _disposed: false,
        _crowdSlots: [{ x: 0, z: 0, src: 6, height: 1.7, facing: 0 }, { x: 1, z: 1, src: 7, height: 1.7, facing: 0 }, { x: 2, z: 2, src: 8, height: 1.7, facing: 0 }],
        _loadAvatarSource(url) { requested.push(url.split('/').pop()); return Promise.resolve({ url }); },
        _refreshContactShadows() {}
    });
    club._crowdSourceContainers = new Array(Crowd.AVATAR_SOURCES.length);
    // The player's body and the bartender are fetched at start-up.
    for (const id of ['dancerF', 'dancerM', 'bartender']) club._crowdSourceContainers[Crowd.sourceIndex(id)] = { id };
    club._crowdSourcePending = {};
    club._availableCrowdSources = [];
    const spawned = [];
    club._spawnAvatar = function (source, name) { spawned.push([name, source.url.split('/').pop()]); this.npcAvatars.push({ name, root: { setEnabled() {} }, animations: [] }); };
    club._spawnGuestsTo = () => {};

    await club._loadCrowdSources([6, 7, 6]);
    assert.deepEqual(requested, ['club-crowd-f1.glb', 'club-crowd-f2.glb'], 'a source was fetched twice');
    club._spawnCrowdTo(3);
    assert.deepEqual(spawned.map(item => item[0]), ['dancer0', 'dancer1'], 'a dancer whose file is not loaded yet must wait, not be replaced');

    club.tierSettings.crowdSize = 3;
    club._applyCrowdSize();
    club._applyCrowdSize();
    await club._crowdTopUp;
    assert.deepEqual(requested, ['club-crowd-f1.glb', 'club-crowd-f2.glb', 'club-crowd-f3.glb'], 'only the missing file is fetched, once');
    assert.deepEqual(spawned.map(item => item[0]), ['dancer0', 'dancer1', 'dancer2']);
    assert.equal(club._crowdTopUp, null);
});

test('the crowd character files: one skin, one draw, vertex-coloured, only the clips they are used for, and all different', async () => {
    const dir = join(ROOT, 'js/models/avatars');
    const files = readdirSync(dir).filter(file => /^club-crowd-.*\.glb$/.test(file));
    assert.equal(files.length, 18, 'the cast is 8 women, 9 men and the bouncer');
    const { createHash } = await import('node:crypto');
    const hashes = new Set();
    const guests = new Set(['f6', 'f7', 'f8', 'm4', 'm6', 'm8', 'bouncer']);
    for (const file of files) {
        const id = file.replace(/^club-crowd-|\.glb$/g, '');
        const json = readGlbJson(`js/models/avatars/${file}`);
        assert.equal(json.skins.length, 1, `${file} must keep one skin`);
        assert.equal(json.skins[0].joints.length, 62, `${file} is not the 62-bone modular rig`);
        assert.equal(json.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0), 1, `${file} must be one draw`);
        assert.equal(json.materials.length, 1, `${file} must bake its colours into vertices`);
        assert.ok(json.meshes[0].primitives[0].attributes.COLOR_0 !== undefined, `${file} lost its vertex colours`);
        assert.ok(!json.images && !json.textures, `${file} should not carry textures`);
        const clips = json.animations.map(animation => animation.name).sort();
        const natives = ['Idle', 'Run', 'Walk', 'Wave'];   // the packs' own clips, kept for the guests who walk the room
        // The dancers on the floor also carry the procedural grooves the choreographer switches between (js/crowdDance.js).
        const grooves = ['Groove_Bounce', 'Groove_SideTap', 'Groove_Clap', 'Groove_Pump', 'Groove_Twist', 'Groove_HandsUp', 'Groove_Sway', 'Groove_Still'];
        const expected = (guests.has(id)
            ? ['Dance_Loop', 'Idle_FoldArms_Loop', 'Idle_Loop', 'Idle_TalkingPhone_Loop', 'Idle_Talking_Loop', 'Yes']
            : ['Dance_Loop', 'Yes', ...grooves]).concat(natives).sort();
        if (id === 'f7') expected.push('Idle_Railing_Loop');
        if (id === 'm6') expected.push('Drink_Loop', 'Smoke_Loop');
        expected.sort();
        assert.deepEqual(clips, expected, `${file} carries the wrong clips`);
        const bytes = readFileSync(join(dir, file));
        assert.ok(bytes.length < 1.1 * 1048576, `${file} is too heavy (${bytes.length})`);
        hashes.add(createHash('sha1').update(bytes).digest('hex'));
    }
    assert.equal(hashes.size, files.length, 'two crowd files are identical');
    const assets = readFileSync(join(ROOT, 'ASSETS.md'), 'utf8');
    assert.ok(/Modular Women/.test(assets) && /Modular Men/.test(assets), 'ASSETS.md must credit both Modular packs');
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
        BABYLON: {
            WebXRFeatureName: names, WebXRState: { IN_XR: 2, NOT_IN_XR: 3 },
            WebXRControllerMovement: require('../js/vendor/babylon.js').WebXRControllerMovement
        },
        log: { error: (...args) => { throw new Error(args.join(' ')); } }
    });
    const originalTeleport = featuresManager.enableFeature(names.TELEPORTATION, 'latest', {});
    const sceneMeshes = new Map(['frontWall', 'backWall', 'leftWall', 'rightWall', 'djPlatform', 'djPlatformTop',
        'vestibuleWalls', 'vestibuleFrame', 'barJoinery', 'mezzRails']
        .map(name => [name, { name, checkCollisions: true, isEnabled: () => true }]));
    const club = {
        vjManualMode: false,
        movementFeature: null,
        floorMesh: { name: 'floor' },
        _mezzDeck: { name: 'mezzDeck' },
        scene: { meshes: [...sceneMeshes.values()] },
        vrHelper: {
            input: { name: 'input' },
            pointerSelection: { name: 'pointer' },
            teleportation: originalTeleport,
            baseExperience: { camera: {}, featuresManager, state: 2 }
        },
        jumpState: { active: true },
        _refreshVRQuickMenu() {}
    };
    club.floorMesh.checkCollisions = club._mezzDeck.checkCollisions = true;
    club.floorMesh.isEnabled = club._mezzDeck.isEnabled = () => true;
    club.scene.meshes.push(club.floorMesh, club._mezzDeck,
        { name: 'decoration', checkCollisions: false },
        { name: 'replaced-procedural-mesh', checkCollisions: true, isEnabled: () => false });
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
    const options = club.movementFeature.options;
    assert.equal(options.movementOrientationFollowsViewerPose, true);
    assert.equal(options.movementOrientationFollowsController, false);
    const axes = { moveX: 0, moveY: 0, rotateX: 0, rotateY: 0 };
    options.customRegistrationConfigurations.find(r => r.forceHandedness === 'left')
        .axisChangedHandler({ x: 0.5, y: -0.7 }, axes, options);
    assert.deepEqual(axes, { moveX: 0.5, moveY: -0.7, rotateX: 0, rotateY: 0 });
    options.customRegistrationConfigurations.find(r => r.forceHandedness === 'right')
        .axisChangedHandler({ x: 0.5, y: 0 }, axes, options);
    assert.equal(axes.rotateX, 0.5);
    assert.equal(club.vrHelper.baseExperience.camera.applyGravity, false, 'the walking-surface follow owns VR height, not camera gravity');
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
        _deferOnly: true, _deferredUpdated: true, _deferredPositionUpdate: new BABYLON.Vector3(0, 1.15, -12),
        realWorldHeight: 1.15,
        rotationQuaternion: BABYLON.Quaternion.Identity()
    };
    const orientation = xrCamera.rotationQuaternion.clone();
    const desktopPosition = new BABYLON.Vector3(0, 1.7, -5);
    const club = {
        isInVRMode: true,
        vrHelper: { baseExperience: { camera: xrCamera } },
        camera: { position: desktopPosition.clone() },
        _xrHeadHeight: () => 1.15,
        showCameraTransitionFeedback() {}
    };
    const move = window.VRClubUI.prototype.moveCameraToPreset;
    move.call(club, 'djBooth');
    assert.equal(xrCamera.position.y, 1.65);
    move.call(club, 'danceFloor');
    assert.equal(xrCamera.position.y, 1.15);
    assert.equal(xrCamera.position.x, -2.8);
    assert.equal(xrCamera.position.z, -9.2);
    assert.ok(xrCamera._deferredPositionUpdate.equals(xrCamera.position), 'a queued walking step must not undo travel');
    assert.ok(xrCamera.rotationQuaternion.equals(orientation));
    assert.ok(club.camera.position.equals(desktopPosition));
    const destination = xrCamera.position.clone();
    let reported = false;
    club._xrHeadHeight = () => null;
    club.showErrorMessage = () => { reported = true; };
    move.call(club, 'balcony');
    assert.ok(xrCamera.position.equals(destination), 'wait for actual tracking instead of inventing eye height');
    assert.equal(reported, true);
});

test('VR jump arc is identical at 72 and 120 Hz and lands at the player\'s own eye height', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/club/02-lifecycle.js', {
        BABYLON, VRClubCore: class {}
    });
    const proto = window.VRClubLifecycle.prototype;
    const jump = (hz) => {
        const xrCamera = {
            position: new BABYLON.Vector3(0, 1.15, -12), applyGravity: true,
            _deferOnly: true, _deferredUpdated: true, _deferredPositionUpdate: new BABYLON.Vector3(0, 1.15, -12)
        };
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
            xrCamera.position.copyFrom(xrCamera._deferredPositionUpdate);
            club._stepVRJump(xrCamera, 1 / hz);
            apex = Math.max(apex, xrCamera.position.y);
            frames++;
        }
        assert.ok(xrCamera._deferredPositionUpdate.equals(xrCamera.position), 'walking must not discard the jump arc');
        return { apex, airtime: frames / hz, landedAt: xrCamera.position.y, gravity: xrCamera.applyGravity };
    };
    const at72 = jump(72);
    const at120 = jump(120);
    assert.ok(Math.abs(at72.apex - at120.apex) < 0.02, `apex depends on refresh rate: ${at72.apex} vs ${at120.apex}`);
    assert.ok(Math.abs(at72.airtime - at120.airtime) < 0.03, `airtime depends on refresh rate: ${at72.airtime} vs ${at120.airtime}`);
    assert.ok(at72.apex - 1.15 > 0.35 && at72.apex - 1.15 < 0.55, `unrealistic jump height ${at72.apex - 1.15}`);
    assert.equal(at72.landedAt, 1.15, 'a seated player was re-seated at a different eye height');
    assert.equal(at120.landedAt, 1.15);
    assert.equal(at72.gravity, false, 'landing must not re-enable camera gravity (it fights the walking-surface follow)');
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

test('music always starts on entry and a Resident episode is never remembered as the default', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;

    // Episodes are resolved fresh from the feed; remembering one would pin the default to it.
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://mcdn.podbean.com/mf/web/x/803.mp3?a=1'), true);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://podbean.com/e.mp3'), true);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://notpodbean.com/e.mp3'), false);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://radio.example/live.mp3'), false);
    assert.equal(AudioUtils.isResidentEpisodeUrl('not a url'), false);

    // The entry flow is wired to them, and the old station is gone from the defaults.
    const ui = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    assert.ok(!/sunshine-live/i.test(ui), 'the old default station is still referenced');
    assert.match(ui, /player\.playRandom\(podcast\)/, 'ENTER must start a RANDOM episode of the chosen podcast');
    assert.doesNotMatch(ui, /playResidentFrom|fetchPodcastEpisodes|RESIDENT_PODCAST/, 'the old in-file queue is back');
    // A club has music when you walk in: there is no opt-out left to read, so ENTER must not branch on one.
    assert.doesNotMatch(ui, /shouldPlayOnEntry|radioOnEntry/, 'the music opt-in is gone; ENTER always starts the music');
    assert.match(ui, /startEntryMusic\(window\.vrClub, pointAtAudioMenu\);/, 'ENTER must start the music unconditionally');
    // Colourizon episodes (served by the relay) are never remembered either.
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://vrclub-network.garfieldapp.workers.dev/podcast/colourizon/stream/1-missmelera-x.mp3'), true);
    assert.equal(AudioUtils.isResidentEpisodeUrl('https://vrclub-network.garfieldapp.workers.dev/podcast/other'), false);
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    // The splash is one decision (music or silence): it must not name a show, a server or the relay.
    const splash = html.match(/<div id="splashScreen"[\s\S]*?<main id="mainExperience"/)[0];
    assert.doesNotMatch(splash, /splashRadioOnEntry|splash-podcast|workers\.dev|podbean|soundcloud|cattaneo|melera/i,
        'the splash must not carry a music toggle, the podcast picker or the servers behind it');
    // The choice and the disclosure both still exist, in the Audio menu and the credits.
    assert.match(html, /id="podcastResidentBtn"[^>]*aria-checked="true"/, 'Hernan Cattaneo is the default podcast');
    assert.match(html, /id="podcastColourizonBtn"[^>]*aria-checked="false"/);
    const credits = html.match(/<details id="modelCredits">([\s\S]*?)<\/details>/)[1];
    assert.match(credits, /podcast\.hernancattaneo\.com/, 'the credits must name the Resident feed');
    assert.match(credits, /SoundCloud/, 'the credits must name where Colourizon comes from');
    assert.match(credits, /IP address/, 'the credits must keep the streaming privacy disclosure');
});

test('the NOCTURNE wordmark is one geometry, shared by the splash and both neon signs', () => {
    const { NocturneLogo } = loadClassic('js/nocturneLogo.js').window;
    const d = NocturneLogo.path();

    // The letterforms are the club's own, not a typeface: no font draws these, and a headset has no
    // web fonts to fall back on. Each rule below is a feature of the sign that a font would lose.
    const glyph = (index) => NocturneLogo.GLYPHS[index].d(NocturneLogo.GLYPHS[index].x);
    assert.equal(NocturneLogo.GLYPHS.map(g => g.ch).join(''), 'NOCTURNE');
    // The O is a ring cut at nine and three o'clock: two arcs, nothing joining them.
    assert.equal((glyph(1).match(/A/g) || []).length, 2, 'the O must be two arcs');
    assert.equal((glyph(1).match(/M/g) || []).length, 2, 'the O must be cut open on both sides');
    // The R has no left stem: a top bar into a bowl, back along an inset middle bar, then the leg.
    assert.doesNotMatch(glyph(5), /V/, 'the R must not grow a vertical stem');
    assert.match(glyph(5), /A20\.6 23\.05 /, 'the R keeps its right-side bowl');
    // The E is three detached bars, all horizontal.
    assert.equal(glyph(7), 'M943.1 4.4H1016.6M943.1 50.5H1004.9M943.1 95.6H1016.6');
    // The N comes to a point: one mitred stroke, not a diagonal laid across two stems.
    assert.equal((glyph(0).match(/M/g) || []).length, 1, 'the N must be a single mitred run');

    // No float noise: the string is mirrored into index.html by hand, so it must be stable.
    assert.doesNotMatch(d, /\d\.\d{3}/, 'path numbers must be rounded to two decimals');

    // The splash carries that exact path, inline, so the logo is in the very first paint.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const splash = html.match(/<div id="splashScreen"[\s\S]*?<main id="mainExperience"/)[0];
    assert.ok(splash.includes(`d="${d}"`),
        `the splash SVG has drifted from NocturneLogo.path(); it should read:\n d="${d}"`);
    assert.ok(splash.includes(`viewBox="${NocturneLogo.VIEW_BOX}"`), 'the splash viewBox has drifted');
    assert.match(html, /<script src="js\/nocturneLogo\.js/, 'the wordmark module must be loaded');

    // The in-world signs stroke the same path rather than measuring a font.
    const env = readFileSync(join(ROOT, 'js/club/04-environment.js'), 'utf8');
    const neon = env.match(/\n    _drawNocturneNeon\(ctx[\s\S]*?\n    }\n/)[0];
    assert.match(neon, /new Path2D\(logo\.path\(\)\)/, 'the neon sign must stroke the shared geometry');
    assert.doesNotMatch(neon, /strokeText|ctx\.font/, 'the neon sign must not fall back to a font');

    // The tube is one width everywhere: the sign scales it with the canvas transform, the splash
    // states it in the same units, so the two signs and the splash read as the same piece of neon.
    const css = readFileSync(join(ROOT, 'css/styles.css'), 'utf8');
    assert.match(css, new RegExp(`stroke-width: ${NocturneLogo.STROKE};`), 'the splash tube width has drifted');
});

test('the splash carries no emoji or decorative symbols', () => {
    // The entry screen is the club's title card: the wordmark, a warning, two toggles and ENTER.
    // Emoji there are noise - they render differently on every platform, they are the first thing a
    // headset guest sees at low angular resolution, and every one of them sat beside a label that
    // already said the same thing. The words carry the meaning; nothing on the splash is decorated.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const splash = html.match(/<div id="splashScreen"[\s\S]*?<main id="mainExperience"/)[0];
    // Pictographs, dingbats, geometric shapes, arrows and variation selectors.
    const pictograph = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2460}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const found = splash.match(pictograph);
    assert.equal(found, null, `the splash still carries ${found && found[0]}`);
    // Nor may one be written back into it at runtime (the RETRY label is the splash's own button).
    const core = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    assert.match(core, /btn\.textContent = 'RETRY';/, 'the retry label must stay plain');
});

test('the animated splash background cannot create a transient scrollbar', () => {
    const css = readFileSync(join(ROOT, 'css/styles.css'), 'utf8');
    const splash = css.match(/#splashScreen\s*\{([\s\S]*?)\n\}/)[1];
    assert.match(splash, /\boverflow:\s*hidden;/,
        'the viewport must clip decorative compositor overflow instead of showing a page scrollbar');
    const card = css.match(/\.splash-content\s*\{([\s\S]*?)\n\}/)[1];
    assert.match(card, /\bmax-height:\s*100%;/, 'the card must fit a short viewport');
    assert.match(card, /\boverflow-y:\s*auto;/, 'real content overflow must remain reachable inside the card');
    const overlay = css.match(/#splashScreen::after\s*\{([\s\S]*?)\n\}/)[1];
    assert.match(overlay, /\binset:\s*0;/, 'the animated overlay must remain within the viewport');
    assert.doesNotMatch(overlay, /\b(width|height):\s*200%/, 'an oversized overlay expands the scroll area');
    assert.doesNotMatch(overlay, /\btransform\s*:/, 'transforming the overlay changes its scroll bounds');
    assert.match(overlay, /animation:\s*gradientDrift\b/, 'the gradient itself should move inside the fixed box');
    const animation = css.match(/@keyframes gradientDrift\s*\{([\s\S]*?)\n\}/)[1];
    assert.doesNotMatch(animation, /\btransform\s*:/, 'the background animation must not transform its box');
    assert.match(animation, /background-position:/, 'the gradient should animate as paint only');
});

test('smooth VR movement is the default but an explicit comfort preference is preserved', () => {
    let stored = null;
    const { window } = loadClassic('js/club/01-core.js', { localStorage: { getItem: () => stored } });
    const resolve = window.VRClubCore.resolveVRComfortMode;
    assert.equal(resolve(), false);
    stored = '1';
    assert.equal(resolve(), true);
    stored = '0';
    assert.equal(resolve(), false);
    assert.equal(loadClassic('js/club/01-core.js', {
        localStorage: { getItem() { throw new Error('storage blocked'); } }
    }).window.VRClubCore.resolveVRComfortMode(), false);

    // On the splash it is a press-to-enable button, exactly like Safe Mode: a headset guest reads one
    // line and presses it once. A checkbox with an explanatory paragraph was two things to understand.
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const splash = html.match(/<div id="splashScreen"[\s\S]*?<main id="mainExperience"/)[0];
    assert.doesNotMatch(splash, /type="checkbox"/, 'the splash must carry no checkboxes');
    assert.match(splash, /<button class="splash-toggle" id="splashVRComfortBtn"[^>]*aria-pressed="false"/,
        'VR Comfort must be a press-to-enable toggle that starts off');
    assert.match(splash, /id="splashVRComfortState">OFF</);
    // The explanation was removed, not moved into a tooltip: a headset and a touch screen never show one,
    // so a `title` here would be the same extra text hidden from exactly the guests it was written for.
    // Neither splash toggle may carry one; their labels say what they do.
    for (const id of ['splashVRComfortBtn', 'splashSafeModeBtn']) {
        const button = splash.match(new RegExp(`<button[^>]*id="${id}"[\\s\\S]*?</button>`))[0];
        assert.doesNotMatch(button, /\btitle=/, `${id} must not explain itself in a tooltip`);
    }
    assert.doesNotMatch(splash, /splash-hint">|aria-describedby/, 'the splash hint paragraphs are gone');
    // The club mirrors its own state back onto that button, not onto a checkbox.
    const ui = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    assert.match(ui, /splashVRComfortBtn/);
    assert.doesNotMatch(ui, /getElementById\('splashVRComfort'\)/, 'the old checkbox sync is back');
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
            vr: { ambientIntensity: 0.015 }
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
    assert.ok(Math.abs(settle({ vr: true, mirror: true }) - 0.063) < 0.001);
    assert.ok(Math.abs(settle({ vr: true, lasers: true }) - 0.057) < 0.001);
    assert.ok(Math.abs(settle({ vr: true, spots: true, lasers: true, mirror: true }) - 0.15) < 0.001);
    // The headset must never be lit more flatly than the desktop for the same rig.
    assert.ok(settle({ vr: true, spots: true }) <= settle({ vr: false, spots: true }));
});

test('spinning lasers run at quarter speed, independently of frame rate, with the existing multiplier', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const update = loadClassic('js/club/08-animation-fixtures.js', {
        BABYLON, VRClubAnimationCore: class {}
    }).window.VRClubAnimationFixtures.prototype.updateLasers;
    const mesh = { isEnabled: () => true, updateVerticesData() {} };
    for (const hz of [45, 60, 72, 90, 120]) {
        for (const speed of [0.1, 1, 2]) {
            const laser = { rotation: 0, tiltPhase: 0, beams: [] };
            const material = { emissiveColor: new BABYLON.Color3() };
            const club = {
                lasers: [laser], lasersActive: true, laserSpeed: speed, vjManualMode: true,
                vecPool: { laserDir: new BABYLON.Vector3() },
                _laserColor: () => BABYLON.Color3.White(), _laserView: () => ({}),
                laserBeamBatch: { mesh, hitMesh: mesh, material, hitMaterial: material }
            };
            for (let i = 0; i < hz; i++) update.call(club, { time: i / hz, dtScale: 60 / hz });
            assert.ok(Math.abs(laser.rotation - 0.225 * speed) < 1e-9, `${hz} Hz rotation at ${speed}x`);
            assert.ok(Math.abs(laser.tiltPhase - 0.3 * speed) < 1e-9, `${hz} Hz tilt at ${speed}x`);
        }
    }
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
        z: { min: -20, max: -0.25 },
        entrance: { halfWidth: 1.86, height: 3.26 }
    };
    const effectsModule = loadClassic('js/club/06-effects.js', {
        BABYLON,
        VRClubFixtures: class {},
        ROOM_INTERIOR
    });
    const effects = effectsModule.window.VRClubEffects.prototype;
    const enabled = { spots: false, rays: false };
    const updates = { spots: 0, rays: 0 };
    const mesh = (name) => ({
        thinInstanceCount: 0,
        setEnabled(value) { enabled[name] = value; },
        thinInstanceBufferUpdated() { updates[name]++; }
    });
    const spotMatrices = new Float32Array(280 * 16);
    const rayMatrices = new Float32Array(64 * 16);
    const directions = new Float32Array(280 * 2);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 280; i++) {
        directions[i * 2] = golden * i;
        let latitude = 0.5 / 280;
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
        tierSettings: { mirrorSpots: 180, mirrorRays: 52 },
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
        _intersectEntranceInterior: effects._intersectEntranceInterior,
        _considerEntranceHit: effects._considerEntranceHit,
        _writeMirrorSpotMatrix: effects._writeMirrorSpotMatrix,
        _writeMirrorRayMatrix: effects._writeMirrorRayMatrix,
        _updateMirrorReflectionBatch: effects._updateMirrorReflectionBatch,
        scene: { pickWithRay() { throw new Error('mirror batching must not scene-raycast'); } }
    };
    update.call(club, { time: 1, dtScale: 1 });
    assert.equal(club.mirrorReflectionBatch.spots.thinInstanceCount, 180);
    assert.equal(club.mirrorReflectionBatch.rays.thinInstanceCount, 52);
    assert.deepEqual(enabled, { spots: true, rays: true });
    assert.deepEqual(updates, { spots: 1, rays: 1 });
    assert.ok([...spotMatrices.slice(0, 180 * 16)].every(Number.isFinite));
    assert.ok([...rayMatrices.slice(0, 52 * 16)].every(Number.isFinite));

    club.tierSettings = { mirrorSpots: 96, mirrorRays: 32 };
    update.call(club, { time: 2, dtScale: 1 });
    assert.equal(club.mirrorReflectionBatch.spots.thinInstanceCount, 96);
    assert.equal(club.mirrorReflectionBatch.rays.thinInstanceCount, 32);
    club.tierSettings = { mirrorSpots: 280, mirrorRays: 64 };
    update.call(club, { time: 3, dtScale: 1 });
    assert.equal(club.mirrorReflectionBatch.spots.thinInstanceCount, 280);
    assert.ok([...spotMatrices].every(Number.isFinite));
    assert.ok([...rayMatrices].every(Number.isFinite));

    // Reflections land on the real shell (ceiling slab, front wall), not on the narrower walkable band.
    const hit = {};
    effects._intersectRoomInterior(0, 6.5, -12, 0, 1, 0, hit);
    assert.ok(Math.abs(hit.py - (9.85 - 0.02)) < 1e-9, `ceiling hit at y ${hit.py}`);
    effects._intersectRoomInterior(3, 6.5, -12, 0, 0, 1, hit);
    assert.ok(Math.abs(hit.pz - (-0.25 - 0.02)) < 1e-9, `front-wall hit at z ${hit.pz}`);
    assert.deepEqual([hit.nx, hit.ny, hit.nz], [0, 0, -1]);

    // The front doorway is not a phantom wall: a downward ray through it lands on the real stair.
    effectsModule.window.VenueLayout = {
        vestibule: {
            halfWidth: 3.85, wallZ: 0.25, farZ: 6, streetLevel: 2.8,
            stair: { halfWidth: 1.8, zBottom: 0.85, zTop: 5, steps: 16 }
        }
    };
    const stairDir = new BABYLON.Vector3(0, -0.36, 1).normalize();
    effects._intersectRoomInterior.call(club, 0, 6.5, -12, stairDir.x, stairDir.y, stairDir.z, hit);
    assert.ok(hit.pz > 0.25, `doorway reflection stopped on the old front-wall plane at z ${hit.pz}`);
    assert.ok(hit.py >= 0 && hit.py <= 2.83, `doorway reflection missed the stair at y ${hit.py}`);
    assert.ok(hit.ny === 1 || hit.nz === -1, 'doorway reflection did not land on a tread or riser');
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
    const ROOM_INTERIOR = {
        x: { min: -12.25, max: 12.25 },
        y: { min: 0, max: 9.85 },
        z: { min: -20, max: -0.25 },
        entrance: { halfWidth: 1.86, height: 3.26 }
    };
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

test('ceiling laser ribbons stay out of the depthless glow pass', () => {
    const source = readFileSync(join(ROOT, 'js/club/05-fixtures.js'), 'utf8');
    const start = source.indexOf('_createLaserBeamBatch(count)');
    const end = source.indexOf('\n    }\n\n}', start);
    const method = source.slice(start, end);
    assert.match(method, /glowLayer\.addExcludedMesh\(mesh\)/);
    assert.doesNotMatch(method, /glowLayer\.addIncludedOnlyMesh\(mesh\)/);
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

test('XR head height preserves low valid poses, ignores missing poses and resets between sessions', () => {
    const warnings = [];
    const { window } = loadClassic('js/mezzanine.js', { log: { warn: (...args) => warnings.push(args) } });
    const observable = () => {
        const observers = [];
        return {
            add(fn, _mask, first) { if (first) observers.unshift(fn); else observers.push(fn); return fn; },
            remove(fn) { const i = observers.indexOf(fn); if (i >= 0) observers.splice(i, 1); },
            notify(value) { for (const fn of observers) fn(value); }
        };
    };
    const manager = { onXRFrameObservable: observable(), onXRSessionInit: observable(), baseReferenceSpace: {}, worldScalingFactor: 1 };
    const club = Object.assign(Object.create(window.Mezzanine), { vrHelper: { baseExperience: { sessionManager: manager } } });
    let sampledBeforeCamera = null;
    manager.onXRFrameObservable.add(() => { sampledBeforeCamera = club._xrEyeHeight; });
    assert.equal(club._xrHeadHeight(), null, 'no invented standing height before the first pose');
    const camera = { position: { x: 0, y: 0.25, z: -12 } };
    club._updateVRWalkSurface(camera);
    assert.equal(camera.position.y, 0.25);
    for (const height of [1.6, 0.9, 0.31, 0.30, 0.29, 0.25, 0, 0.25, 1.6]) {
        manager.onXRFrameObservable.notify({ getViewerPose: () => ({ transform: { position: { y: height } } }) });
        assert.equal(sampledBeforeCamera, height, 'the camera must not consume a previous-frame height');
        camera.position.y = height;
        club._updateVRWalkSurface(camera);
        assert.equal(club._xrHeadHeight(), height);
        assert.equal(camera.position.y, height, 'crouching must not move the virtual floor');
        assert.equal(club._walkLevel, 0);
    }
    manager.onXRFrameObservable.notify({ getViewerPose: () => null });
    assert.equal(club._xrHeadHeight(), 1.6);
    manager.onXRFrameObservable.notify({ getViewerPose: () => ({ transform: { position: { y: NaN } } }) });
    assert.equal(club._xrHeadHeight(), 1.6);
    assert.equal(warnings.length, 1, 'invalid tracking must be reported');
    manager.onXRSessionInit.notify();
    assert.equal(club._xrHeadHeight(), null, 'a new session must not reuse old height calibration');
    manager.worldScalingFactor = 2;
    manager.onXRFrameObservable.notify({ getViewerPose: () => ({ transform: { position: { y: 0.25 } } }) });
    camera.position = { x: -11, y: 3.5, z: -15 };
    club._updateVRWalkSurface(camera);
    assert.equal(camera.position.y, 3.5, 'low tracked height on the balcony stays on the deck');
    assert.equal(club._walkLevel, 3);
});

test('in VR the headset stands on the balcony, climbs its stair, steps off its edge and keeps the DJ riser', () => {
    const { window } = loadClassic('js/mezzanine.js');
    const follow = window.Mezzanine._updateVRWalkSurface;
    const D = window.MezzanineLayout.deck, S = window.MezzanineLayout.stairs;
    const eye = 1.62;
    const club = Object.assign(Object.create(window.Mezzanine), { jumpState: { active: false }, _walkLevel: 0, _xrHeadHeight: () => camera.realWorldHeight });
    const camera = {
        realWorldHeight: eye, position: { x: 0, y: eye, z: -12 },
        _deferOnly: true, _deferredUpdated: true, _deferredPositionUpdate: { y: eye }
    };
    const at = (x, z, feet) => {
        camera.position.x = x;
        camera.position.z = z;
        if (feet !== undefined) camera.position.y = feet + eye;
        camera._deferredPositionUpdate.y = camera.position.y;
        follow.call(club, camera);
        assert.equal(camera._deferredPositionUpdate.y, camera.position.y, 'the queued XR step must not undo the surface correction');
        return +(camera.position.y - eye).toFixed(3);
    };

    // A teleport lands the feet on the deck: they stay there, and the body is told.
    assert.equal(at(-10.9, -14.7, D.top), D.top);
    assert.equal(club._walkLevel, D.top);
    // Room-scale or smooth walking off the open edge drops the headset to the floor, falling rather than snapping.
    const firstFallFrame = at(-8.5, -14.7);
    assert.ok(firstFallFrame < D.top && firstFallFrame > 0, `stepping off the deck snapped to ${firstFallFrame}`);
    let fallFrames = 1;
    while (at(-8.5, -14.7) > 0 && fallFrames < 400) fallFrames++;
    assert.equal(at(-8.5, -14.7), 0);
    assert.ok(fallFrames > 20 && fallFrames < 80, `a 3 m fall took ${fallFrames} frames at 60 Hz`);
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
    for (let z = S.zTop; z <= S.zBottom + 0.6; z += 0.25) {
        const next = at(mid, z);
        assert.ok(next <= feet + 1e-9 && feet - next < 0.3, `the descent jumped from ${feet} to ${next}`);
        feet = next;
    }
    assert.equal(feet, 0, 'the descent reaches the floor without hovering');
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
    club.jumpState.active = false;
    // Smooth locomotion aimed upward walks level, at the same speed; a hitch never takes more than 25 cm at once.
    const shape = window.Mezzanine._shapeVRStep;
    const level = { x: 0, y: 0.06, z: -0.08 };
    shape(level);
    assert.equal(level.y, 0);
    assert.ok(Math.abs(Math.hypot(level.x, level.z) - 0.1) < 1e-9);
    const hitch = { x: 3, y: 0, z: -4 };
    shape(hitch);
    assert.ok(Math.abs(Math.hypot(hitch.x, hitch.z) - 0.25) < 1e-9);
    // The guard wraps the camera's own step once, and collisions can no longer lift the walker.
    const stepper = {
        position: { y: 1.6 }, cameraDirection: { x: 0, y: 0.3, z: -0.4 },
        _deferOnly: true, _deferredUpdated: true, _deferredPositionUpdate: { y: 1.6 },
        _updatePosition() {
            this.position.y += 2;
            this._deferredPositionUpdate.y += 2;
            this.moved = { ...this.cameraDirection };
        }
    };
    const vrClub = Object.assign(Object.create(window.Mezzanine), { isInVRMode: true });
    vrClub._guardVRCameraSteps(stepper);
    const wrapped = stepper._updatePosition;
    vrClub._guardVRCameraSteps(stepper);
    assert.equal(stepper._updatePosition, wrapped, 'wrapped twice');
    stepper._updatePosition();
    assert.equal(stepper.position.y, 1.6);
    assert.equal(stepper._deferredPositionUpdate.y, 1.6);
    assert.equal(stepper.moved.y, 0);
});

test('real Babylon deferred collisions allow XR stair entry and descent while keeping the rail solid', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/mezzanine.js');
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    try {
        const box = (name, width, height, depth, x, y, z, group = -1) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
            mesh.position.set(x, y, z);
            mesh.checkCollisions = true;
            mesh.collisionGroup = group;
            mesh.computeWorldMatrix(true);
            return mesh;
        };
        const { deck: D, stairs: S } = window.MezzanineLayout;
        const midX = (S.x0 + S.x1) / 2;
        const tread = (S.zBottom - S.zTop) / (S.steps - 1), riser = D.top / S.steps;
        box('floor', 30, 0.1, 40, 0, -0.05, -10);
        for (let i = 1; i < S.steps; i++) {
            box(`tread${i}`, S.x1 - S.x0, 0.05, tread, midX, i * riser - 0.025, S.zBottom - (i - 0.5) * tread, 2);
        }
        const deck = box('deck', D.x1 - D.x0, D.thickness, D.z1 - D.z0,
            (D.x0 + D.x1) / 2, D.top - D.thickness / 2, (D.z0 + D.z1) / 2, 2);
        box('rail', 0.05, 1.08, D.z1 - D.z0, D.x1 - 0.04, D.top + 0.54, (D.z0 + D.z1) / 2);
        const camera = new BABYLON.FreeCamera('xr', new BABYLON.Vector3(midX, 1.6, S.zBottom + 0.6), scene);
        camera.ellipsoid.set(0.3, 0.8, 0.3);
        camera.checkCollisions = true;
        camera.collisionMask = ~deck.collisionGroup;
        camera._deferOnly = true;
        const club = Object.assign(Object.create(window.Mezzanine), {
            isInVRMode: true, _xrHeadHeight: () => 1.6, engine: { getDeltaTime: () => 100 }
        });
        club._guardVRCameraSteps(camera);
        const step = (x, z) => {
            if (camera._deferredUpdated) camera.position.copyFrom(camera._deferredPositionUpdate);
            camera._deferredUpdated = false;
            camera._deferredPositionUpdate.copyFrom(camera.position);
            camera.cameraDirection.set(x, 0, z);
            camera._updatePosition();
            club._updateVRWalkSurface(camera);
        };
        for (let i = 0; i < 60 && camera.position.z > -12.5; i++) step(0, -0.25);
        assert.equal(club._walkLevel, 3, `stuck entering the stair at z=${camera.position.z}`);
        assert.ok(Math.abs(camera.position.y - 4.6) < 0.02);
        for (let i = 0; i < 60 && camera.position.z < -5.4; i++) step(0, 0.25);
        assert.equal(club._walkLevel, 0);
        assert.ok(Math.abs(camera.position.y - 1.6) < 0.02);
        camera.position.set(-10.9, 4.6, -14.7);
        camera._deferredUpdated = false;
        for (let i = 0; i < 20; i++) step(0.25, 0);
        assert.ok(camera.position.x < D.x1, 'excluding treads must not exclude the railing');
        assert.equal(club._walkLevel, 3);
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('the XR collider is a torso: the floor never blocks a short or seated headset, walls and rails still do', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/mezzanine.js');
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    try {
        const box = (name, width, height, depth, x, y, z) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
            mesh.position.set(x, y, z);
            mesh.checkCollisions = true;
            mesh.computeWorldMatrix(true);
            return mesh;
        };
        // A floor made of tiles, as a real mesh has seams, a wall, and a knee-high bench that must still stop a walker.
        for (let x = -10; x < 10; x += 5) for (let z = -30; z < 0; z += 5) box(`tile${x}_${z}`, 5, 0.1, 5, x + 2.5, -0.05, z + 2.5);
        box('wall', 30, 6, 0.5, 0, 3, -20.25);
        box('bench', 1, 0.9, 1, 3, 0.45, -8);
        for (const eye of [0.9, 1.2, 1.5, 1.6, 1.7, 1.85]) {
            const camera = new BABYLON.FreeCamera(`xr${eye}`, new BABYLON.Vector3(0, eye, -2), scene);
            camera.checkCollisions = true;
            camera._deferOnly = false;
            const club = Object.assign(Object.create(window.Mezzanine), { isInVRMode: true, _xrHeadHeight: () => eye });
            club._guardVRCameraSteps(camera);
            const walk = (x, z, steps) => {
                for (let i = 0; i < steps; i++) { camera.cameraDirection.set(x, 0, z); camera._updatePosition(); }
            };
            walk(0, -0.1, 40);
            assert.ok(camera.position.z < -5.9, `a ${eye} m headset was stopped at z=${camera.position.z.toFixed(2)} on an open floor`);
            walk(0.1, 0, 20);
            assert.ok(camera.position.x > 1.9, `a ${eye} m headset could not walk sideways (x=${camera.position.x.toFixed(2)})`);
            assert.ok(Math.abs(camera.position.y - eye) < 1e-6, 'a collision lifted the walker');
            walk(0, -0.1, 160);
            assert.ok(camera.position.z > -20.0, `a ${eye} m headset walked into the wall (z=${camera.position.z.toFixed(2)})`);
            // The bench is 0.9 m high: knees and waist, so it blocks at every height.
            camera.position.set(3, eye, -4);
            walk(0, -0.1, 40);
            assert.ok(camera.position.z > -7.3, `a ${eye} m headset walked through the bench (z=${camera.position.z.toFixed(2)})`);
            // The collider hangs between 0.3 m and 1.3 m above the feet, and never above the eye.
            const bottom = camera.position.y - camera.ellipsoid.y + camera.ellipsoidOffset.y - camera.ellipsoid.y;
            const top = bottom + 2 * camera.ellipsoid.y;
            assert.ok(Math.abs(bottom - (camera.position.y - eye + 0.3)) < 1e-6, `bottom ${bottom} for eye ${eye}`);
            assert.ok(top <= camera.position.y + 1e-6 && top <= 1.3 + 1e-6, `top ${top} for eye ${eye}`);
        }
    } finally {
        scene.dispose();
        engine.dispose();
    }
});

test('a crowd member hidden by the quality tier takes its occupant collider with it', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const proto = window.VRClubAudioCrowd.prototype;
    const member = name => {
        const state = { rootEnabled: true, colliderEnabled: true };
        return {
            name, state, animations: [],
            root: { setEnabled: value => { state.rootEnabled = value; } },
            collider: { setEnabled: value => { state.colliderEnabled = value; } }
        };
    };
    const npcs = [member('dancer0'), member('dancer1'), member('dancer2'), member('guest0'), member('guest1'), member('bartender')];
    const club = {
        npcAvatars: npcs,
        tierSettings: { crowdSize: 2, guestSize: 1 },
        _spawnCrowdTo() {}, _spawnGuestsTo() {}, _refreshContactShadows() {}, _topUpCrowdSources() {},
        isPeopleVisible: proto.isPeopleVisible
    };
    proto._applyCrowdSize.call(club);
    const visible = npcs.filter(npc => npc.state.rootEnabled).map(npc => npc.name);
    const solid = npcs.filter(npc => npc.state.colliderEnabled).map(npc => npc.name);
    assert.deepEqual(visible.sort(), ['bartender', 'dancer0', 'dancer1', 'guest0']);
    assert.deepEqual(solid.sort(), ['bartender', 'dancer0', 'dancer1', 'guest0'], 'an invisible dancer is still solid');
    club.tierSettings = { crowdSize: 3, guestSize: 2 };
    proto._applyCrowdSize.call(club);
    assert.ok(npcs.every(npc => npc.state.colliderEnabled && npc.state.rootEnabled), 'a returning dancer is not solid again');
});

test('a group of people can be sent home, and stays away across a tier change and a reload', () => {
    const store = new Map();
    const localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key)
    };
    const VRClubCore = loadClassic('js/club/01-core.js', { localStorage }).window.VRClubCore;
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {}, VRClubCore, localStorage });
    const proto = window.VRClubAudioCrowd.prototype;

    const member = name => {
        const state = { root: true, collider: true };
        return {
            name, state, animations: [],
            root: { setEnabled: value => { state.root = value; }, isEnabled: () => state.root },
            collider: { setEnabled: value => { state.collider = value; } }
        };
    };
    const npcs = [member('dancer0'), member('dancer1'), member('guest0'), member('bartender'),
        member('bouncer'), member('queue0'), member('djPerformer')];
    const here = () => npcs.filter(npc => npc.state.root).map(npc => npc.name).sort();
    const club = Object.assign(Object.create(proto), {
        npcAvatars: npcs,
        tierSettings: { crowdSize: 2, guestSize: 1, queueSize: 1 },
        peopleVisibility: VRClubCore.resolvePeopleVisibility(),
        _crowdSlots: [{ src: 2 }, { src: 3 }],
        _spawnCrowdTo() {}, _spawnGuestsTo() {}, _refreshContactShadows() {}, _topUpCrowdSources() {}
    });
    // No _applyStreetPeople on the stub: the pavement is exercised through _showStreetPeople below.

    club._applyCrowdSize();
    club._applyDJVisibility();
    assert.deepEqual(here(), ['bartender', 'bouncer', 'dancer0', 'dancer1', 'djPerformer', 'guest0', 'queue0'],
        'a new visitor gets the full club');

    // One group at a time.
    assert.equal(club.togglePeopleVisible('dancers'), false);
    assert.deepEqual(here(), ['bartender', 'bouncer', 'djPerformer', 'guest0', 'queue0']);
    assert.equal(store.get('vrclub.hiddenPeople'), 'dancers');
    assert.ok(npcs.filter(npc => npc.name.startsWith('dancer')).every(npc => !npc.state.collider),
        'a dancer who is not there must not leave an invisible wall behind');

    // A quality-tier change must not bring a group back (it is _applyCrowdSize that reads the preference).
    club.tierSettings = { crowdSize: 14, guestSize: 8, queueSize: 8 };
    club._applyCrowdSize();
    assert.deepEqual(here(), ['bartender', 'bouncer', 'djPerformer', 'guest0', 'queue0'], 'a tier change refilled the floor');

    // In combination: the bystanders are the side guests, the bartender and the people outside.
    club.setPeopleVisible('bystanders', false);
    club._showStreetPeople(true);
    assert.deepEqual(here(), ['djPerformer']);
    assert.equal(store.get('vrclub.hiddenPeople'), 'dancers,bystanders');

    // ...and the DJ.
    club.setPeopleVisible('dj', false);
    assert.deepEqual(here(), [], 'the club can be emptied completely');
    assert.equal(store.get('vrclub.hiddenPeople'), 'dancers,bystanders,dj');
    assert.deepEqual(Object.assign({}, VRClubCore.resolvePeopleVisibility(localStorage)),
        { dancers: false, bystanders: false, dj: false },
        'the choice is what a reload reads back');

    // A group nobody can see is never downloaded either.
    assert.deepEqual([...club._requiredCrowdSources()], [0, 1], 'only the player\'s own body is still needed');

    // Everyone back in one press.
    assert.equal(club.togglePeopleVisible('all'), true);
    club._showStreetPeople(true);
    assert.deepEqual(here(), ['bartender', 'bouncer', 'dancer0', 'dancer1', 'djPerformer', 'guest0', 'queue0']);
    assert.equal(store.has('vrclub.hiddenPeople'), false, 'a full club stores nothing');
    assert.deepEqual(Object.assign({}, VRClubCore.resolvePeopleVisibility(localStorage)),
        { dancers: true, bystanders: true, dj: true });
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
// ---------------------------------------------------------------------------
// The street outside the club
// ---------------------------------------------------------------------------

test('the street layout in the bake script, the vestibule and the runtime agree', () => {
    const script = readFileSync(join(ROOT, 'scripts/build-city-assets.mjs'), 'utf8');
    const L = loadClassic('js/cityDistrict.js').window.CityLayout;
    const block = /const CITY = \{([\s\S]*?)\};/.exec(script)[1];
    for (const key of ['halfLength', 'forecourtFrom', 'sidewalkNear', 'roadFrom', 'roadTo', 'farFront', 'forecourtOpening']) {
        const match = new RegExp(`${key}:\\s*([\\d.]+)`).exec(block);
        assert.ok(match, `${key} is missing from the bake script`);
        assert.equal(Number(match[1]), L[key], `${key} differs between scripts/build-city-assets.mjs and js/cityDistrict.js`);
    }
    const vestibule = loadClassic('js/venueDressing.js').window.VenueLayout.vestibule;
    assert.equal(L.doorZ, vestibule.farZ + 0.3, 'the street door is the vestibule\'s far wall');
    assert.equal(L.doorHalfWidth, vestibule.doorHalfWidth);
    assert.equal(L.doorHeight, vestibule.doorHeight);
    assert.equal(L.forecourtFrom, vestibule.wallZ, 'the pavement starts at the club\'s front wall');
    assert.ok(L.sidewalkNear >= L.doorZ - 0.1, 'the street door must open onto the near sidewalk, not the forecourt');
    // The club is a basement: the street is at the top of the entrance stair, and its paving stops over the stairwell
    // but only inside the vestibule (the stair hall's own floors close the rest of the gap).
    assert.equal(L.groundY, vestibule.streetLevel, 'the street must be at the top of the entrance stair');
    assert.ok(L.forecourtOpening >= vestibule.stair.halfWidth, 'paving would cover the stairwell');
    assert.ok(L.forecourtOpening <= vestibule.halfWidth, 'the paving gap would show outside the vestibule');
    // The street is walled in at both ends inside its bollards, and the fence spans the pavement.
    assert.ok(L.fenceX < L.halfLength - 2);
    assert.ok(L.fenceZ[0] >= L.forecourtFrom && L.fenceZ[1] <= L.farFront);
});

test('the vestibule\'s enclosure curve runs from the room\'s mouth to the top of the stair', () => {
    const vestibule = loadClassic('js/venueDressing.js').window.VenueLayout.vestibule;
    const bounds = loadClassic('js/club/01-core.js', { localStorage: { getItem: () => null } }).window.ROOM_BOUNDS;
    assert.equal(vestibule.roomMouthZ, bounds.z.max, 'the enclosure must start at the dance floor\'s front edge');
    for (const z of [-21, -10, bounds.z.max]) assert.equal(vestibule.enclosure(z), 1, `(z ${z}) is fully in the room`);
    for (const z of [vestibule.stair.zTop, 6, 12]) assert.equal(vestibule.enclosure(z), 0, `(z ${z}) is out of the room`);
    let last = 1;
    for (let z = bounds.z.max; z <= vestibule.stair.zTop; z += 0.05) {
        const here = vestibule.enclosure(z);
        assert.ok(here <= last + 1e-9 && here >= 0 && here <= 1, `the curve must fall smoothly (z ${z.toFixed(2)})`);
        assert.ok(last - here < 0.02, `the curve stepped at z ${z.toFixed(2)}`);
        last = here;
    }
    assert.ok(vestibule.enclosure(vestibule.wallZ) > 0.4 && vestibule.enclosure(vestibule.wallZ) < 0.6,
        'the doorway should be about half way through the sweep');
});

test('how far outdoors a guest is: nothing in the club, everything on the street, one smooth ramp through the door', () => {
    const L = loadClassic('js/cityDistrict.js').window.CityLayout;
    for (const [x, z] of [[0, -15], [10, -3], [-12, -0.5], [0, 0.2], [0, 3], [0, 4.9]]) {
        assert.equal(L.exteriorAmount(x, z), 0, `(${x}, ${z}) is inside`);
    }
    // The forecourt beside the vestibule is outdoors even though it is only a metre from the club's wall.
    for (const [x, z] of [[0, 7.4], [0, 12], [8, 3], [-20, 1], [30, 20], [13, -1]]) {
        assert.equal(L.exteriorAmount(x, z), 1, `(${x}, ${z}) is outside`);
    }
    let last = 0;
    for (let z = 4.9; z <= 7.5; z += 0.05) {
        const value = L.exteriorAmount(0, z);
        assert.ok(value >= last - 1e-9, `the ramp goes backwards at z=${z.toFixed(2)}`);
        last = value;
    }
    const threshold = L.exteriorAmount(0, L.doorZ);
    assert.ok(threshold > 0.3 && threshold < 0.8, `the threshold is ${threshold}: neither inside nor out`);
    assert.equal(L.doorDistance(0, 3), 0, 'inside the vestibule is at the door');
    assert.ok(Math.abs(L.doorDistance(3, L.doorZ + 4) - 5) < 1e-9);
});

test('on the street only the low bass comes through: a little more at the door than down the avenue, and none of the room', () => {
    const { club, window } = createAudioHarness();
    window.CityLayout = loadClassic('js/cityDistrict.js').window.CityLayout;
    club._connectAudioSourceOnce();
    club._audioFrameData = { average: 0 };
    const stand = (x, z) => {
        club.scene = { activeCamera: { globalPosition: { x, y: 1.7, z }, getForwardRay: () => ({ direction: { x: 0, y: 0, z: 1 } }), upVector: { x: 0, y: 1, z: 0 } } };
        club.updateSpatialAudioListener();
        return {
            c1: club.occlusionFilter.frequency.value, c2: club.occlusionFilter2.frequency.value,
            reverb: club.reverbSend.gain.value, delay: club.roomDelayGain.gain.value, crowd: club.crowdAmbienceGain.gain.value,
            sub: club.subGain.gain.value, master: club.audioMasterGain.gain.value
        };
    };
    const room = stand(0, -10);
    const corridor = stand(0, 3);
    const door = stand(0, 7.5);
    const avenue = stand(30, 15);

    assert.ok(Math.abs(room.c1 - 20000) < 1 && Math.abs(room.c2 - 22050) < 1, 'the room hears the whole PA');
    assert.ok(corridor.c1 > 500 && corridor.c1 < 1200 && Math.abs(corridor.c2 - 22050) < 1, 'the stair hall keeps its single muffling pole');
    // In the stair hall the room's own tail and early reflection are shut away, not heard at their full strength.
    assert.ok(corridor.reverb < 0.62 * 0.2 && corridor.delay < 0.18 * 0.2,
        "the room's full-band tail must not follow the guest up the stair");
    for (const [label, spot] of [['at the door', door], ['down the avenue', avenue]]) {
        assert.ok(spot.c1 < 200 && spot.c2 < 200, `${label} the music must be bass only (${spot.c1.toFixed(0)} Hz / ${spot.c2.toFixed(0)} Hz)`);
        assert.ok(spot.c1 >= 85, `${label} the cutoff must stay audible bass`);
        assert.equal(spot.reverb, 0, `${label} the room's reverb tail must not be heard`);
        assert.equal(spot.delay, 0, `${label} the room's early reflection must not be heard`);
        assert.equal(spot.crowd, 0, `${label} nobody is chattering`);
        assert.ok(spot.sub >= 0.5, `${label} the thump must stay present`);
    }
    assert.ok(door.master >= 1.15, 'at the door the bass-only signal needs the make-up gain');
    assert.ok(door.c1 > avenue.c1, 'the bass is clearer at the door than down the avenue');
    assert.ok(door.sub > avenue.sub, 'the thump fades with distance from the door');
    // And it gets quieter the further from the club: steadily, about -6 dB 8 m from the door, well down the block.
    let last = Infinity;
    for (const z of [7.5, 9, 12, 16, 20, 23]) {
        const here = stand(0, z).master;
        assert.ok(here < last + 1e-9, `the music got louder walking away from the door (z ${z})`);
        last = here;
    }
    const eight = stand(0, 6.3 + 8).master;
    assert.ok(Math.abs(20 * Math.log10(eight / door.master) + 6) < 1.5, `8 m out is ${(20 * Math.log10(eight / door.master)).toFixed(1)} dB, not about -6`);
    assert.ok(avenue.master < door.master * 0.25, `30 m down the avenue is only ${(20 * Math.log10(avenue.master / door.master)).toFixed(1)} dB down`);
    assert.ok(room.reverb > 0 && room.crowd > 0, 'the room keeps its own tail and chatter');
});

test('walking down the entrance stair lifts the muffling gradually instead of opening at one step', () => {
    const { club, window } = createAudioHarness();
    window.CityLayout = loadClassic('js/cityDistrict.js').window.CityLayout;
    const stair = window.VenueLayout.vestibule.stair;
    club._connectAudioSourceOnce();
    club._audioFrameData = { average: 0 };
    const stand = (z) => {
        club.scene = { activeCamera: { globalPosition: { x: 0, y: 1.7, z }, getForwardRay: () => ({ direction: { x: 0, y: 0, z: 1 } }), upVector: { x: 0, y: 1, z: 0 } } };
        club.updateSpatialAudioListener();
        return {
            z, c1: club.occlusionFilter.frequency.value, reverb: club.reverbSend.gain.value,
            delay: club.roomDelayGain.gain.value, crowd: club.crowdAmbienceGain.gain.value,
            master: club.audioMasterGain.gain.value
        };
    };
    // Every 10 cm from the top of the stair to the edge of the dance floor.
    const walk = [];
    for (let z = stair.zTop; z >= -5 - 1e-9; z -= 0.1) walk.push(stand(Number(z.toFixed(3))));

    const octaves = (a, b) => Math.abs(Math.log2(b / a));
    for (let i = 1; i < walk.length; i++) {
        const prev = walk[i - 1], here = walk[i];
        assert.ok(here.c1 >= prev.c1 - 1e-6, `the muffling must only lift walking in (z ${here.z}: ${here.c1.toFixed(0)} Hz after ${prev.c1.toFixed(0)} Hz)`);
        assert.ok(here.master >= prev.master - 1e-9 && here.crowd >= prev.crowd - 1e-9,
            `the room must only come up walking in (z ${here.z})`);
        // No single 10 cm step may jump: the whole point is that it is a ramp, not a door opening.
        assert.ok(octaves(prev.c1, here.c1) < 0.35, `the filter jumped ${octaves(prev.c1, here.c1).toFixed(2)} octaves in one 10 cm step at z ${here.z}`);
    }

    const top = walk[0];
    const bottom = walk[walk.length - 1];
    assert.ok(top.c1 < 700, `the top of the stair must still be muffled (${top.c1.toFixed(0)} Hz)`);
    assert.ok(Math.abs(bottom.c1 - 20000) < 1, 'the dance floor hears the whole PA');
    // The lift must be spread over the stair itself, not saved up for the doorway.
    const atBottomStep = stand(stair.zBottom);
    assert.ok(octaves(top.c1, atBottomStep.c1) > 1.5,
        `the stair itself should open up by over an octave and a half (${octaves(top.c1, atBottomStep.c1).toFixed(2)})`);
    assert.ok(octaves(top.c1, atBottomStep.c1) < octaves(atBottomStep.c1, bottom.c1) * 1.5,
        'the stair must carry a real share of the sweep, not a token amount');
    // And the room's own tail arrives with it rather than being heard at full strength from the stairwell.
    assert.ok(top.reverb < bottom.reverb * 0.1 && top.delay < bottom.delay * 0.1 && top.crowd < bottom.crowd * 0.1,
        'the room must be shut away at the top of the stair');
});

test('the street is drawn only near the entrance (with hysteresis) and the outdoors amount eases', () => {
    const { window } = loadClassic('js/cityDistrict.js');
    const toggles = [];
    const pos = { x: 0, y: 1.7, z: -15 };
    const club = Object.assign({
        _cityRoot: { setEnabled: value => toggles.push(value) },
        _cityVisible: true,
        _cityWarm: true,
        _playerCamera: () => ({ globalPosition: pos })
    }, window.CityDistrict);
    const at = (z, x = 0) => { pos.z = z; pos.x = x; club.updateCityDistrict(1 / 60); };

    at(-15);
    assert.deepEqual(toggles, [], 'nothing is hidden while the materials are still compiling');
    club._cityWarm = false;
    at(-15);
    assert.deepEqual(toggles, [false], 'the street is hidden deep in the club');
    at(-9);
    assert.deepEqual(toggles, [false], 'still hidden between the two thresholds');
    at(-7);
    assert.deepEqual(toggles, [false, true], 'shown near the entrance');
    at(-9);
    at(-9.9);
    assert.deepEqual(toggles, [false, true], 'hysteresis: it does not flicker around one threshold');
    at(-11);
    assert.deepEqual(toggles, [false, true, false]);

    // Outdoors: the amount rises smoothly to 1 and falls back, never jumping.
    let previous = club._exterior || 0;
    pos.x = 0; pos.z = 12;
    for (let i = 0; i < 90; i++) {
        club.updateCityDistrict(1 / 30);
        assert.ok(club._exterior - previous < 0.2, 'the outdoors amount jumped');
        previous = club._exterior;
    }
    assert.ok(club._exterior > 0.95);
    pos.z = -10;
    for (let i = 0; i < 90; i++) club.updateCityDistrict(1 / 30);
    assert.ok(club._exterior < 0.05);
});

test('city materials are opaque, budgeted and never frozen; only the road paint is alpha-tested', () => {
    const BABYLON = { PBRMaterial: { PBRMATERIAL_OPAQUE: 0, PBRMATERIAL_ALPHATEST: 1 }, Material: { AllDirtyFlag: 0xff } };
    const { window } = loadClassic('js/cityDistrict.js', { BABYLON });
    const make = name => ({ name, alpha: 0.5, transparencyMode: 2, markAsDirty() {}, isFrozen: false });
    const materials = ['brick', 'trim', 'metal', 'windows', 'decals'].map(make);
    const club = Object.assign({ maxLights: 3 }, window.CityDistrict);
    club._styleCityMaterials(materials);
    for (const material of materials) {
        assert.equal(material.maxSimultaneousLights, 3, `${material.name} must obey the device light budget`);
        assert.equal(material.isFrozen, false, 'lit materials stay unfrozen');
        if (material.name === 'decals') {
            assert.equal(material.transparencyMode, 1, 'road paint is a cut-out');
        } else {
            assert.equal(material.transparencyMode, 0, `${material.name} must be opaque`);
            assert.equal(material.alpha, 1);
            assert.equal(material.needAlphaBlending(), false);
        }
    }
    assert.ok(materials.find(m => m.name === 'windows').emissiveIntensity > 1, 'lit rooms must glow');
});

test('the baked street is small, opaque and cheap to draw', () => {
    const path = 'js/models/city/downtown.glb';
    const json = readGlbJson(path);
    const bytes = readFileSync(join(ROOT, path)).length;
    assert.ok(bytes < 8 * 1024 * 1024, `${(bytes / 1048576).toFixed(1)} MB is too heavy a download`);
    assert.deepEqual([...json.extensionsRequired].sort(), ['EXT_texture_webp', 'KHR_mesh_quantization']);
    assert.ok(json.materials.length <= 8, `${json.materials.length} materials: merge tints into vertex colour`);
    for (const material of json.materials) {
        if (material.name === 'decals') assert.equal(material.alphaMode, 'MASK', 'road paint is a cut-out, never a blend');
        else assert.ok(!material.alphaMode || material.alphaMode === 'OPAQUE', `${material.name} must be opaque (VR rejects blending)`);
    }
    assert.ok(json.images.every(image => image.mimeType === 'image/webp'));
    const imageBytes = json.images.reduce((sum, image) => sum + json.bufferViews[image.bufferView].byteLength, 0);
    assert.ok(imageBytes < 3 * 1048576, `${(imageBytes / 1048576).toFixed(1)} MB of textures`);

    const primitives = json.meshes.flatMap(mesh => mesh.primitives);
    const triangles = primitives.reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
    assert.ok(triangles <= 160000, `${Math.round(triangles)} triangles`);
    assert.ok(primitives.length <= 70, `${primitives.length} draws when the whole street is in view`);
    // Every building is its own culled mesh set; the street is one.
    const names = json.nodes.map(node => node.name);
    assert.ok(names.includes('street'));
    assert.ok(names.filter(name => /^(far|near[LR])\d+$/.test(name)).length >= 8, 'the buildings are missing');
    assert.deepEqual(names.filter(name => /^parked(Car|Taxi)/.test(name)).sort(),
        ['parkedCarEast', 'parkedCarWest', 'parkedTaxi'], 'three baked parked cars are missing');
    assert.deepEqual(names.filter(name => /^streetBin/.test(name)).sort(),
        ['streetBinEntrance', 'streetBinQueue'], 'the two street bins are missing');
    assert.ok(names.includes('entrancePlant'), 'the entrance plant is missing');
    const node = name => json.nodes.find(item => item.name === name);
    for (const name of ['parkedCarWest', 'parkedTaxi']) {
        const { min, max } = node(name).extras;
        assert.ok(min[2] >= 9.25 && max[2] <= 12, `${name} is not parked against the near kerb`);
    }
    {
        const { min, max } = node('parkedCarEast').extras;
        assert.ok(min[2] >= 18.5 && max[2] <= 21.25, 'parkedCarEast is not parked against the far kerb');
    }
    for (const x of [0, -36, 36]) {
        for (const name of ['parkedCarWest', 'parkedCarEast', 'parkedTaxi']) {
            const { min, max } = node(name).extras;
            assert.ok(x < min[0] - 1 || x > max[0] + 1, `${name} blocks the crosswalk at x=${x}`);
        }
    }
    assert.ok(node('entrancePlant').extras.max[0] < -1.9, 'the plant narrows the street doorway');
    // The kit's own 4096 px (and bigger) PNGs must not have been carried over.
    assert.ok(json.images.length <= 16);
    assert.match(readFileSync(join(ROOT, 'ASSETS.md'), 'utf8'), /Downtown City MegaKit/);
});

test('the street door is shut until the street has loaded, then a person can walk through it', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const scene = new BABYLON.Scene(new BABYLON.NullEngine());
    const material = name => new BABYLON.StandardMaterial(name, scene);
    const log = { info() {}, warn() {} };
    const club = Object.assign({
        scene,
        materialFactory: {
            getPreset: material, createStandardMaterial: material,
            createPBRMaterial: name => new BABYLON.PBRMaterial(name, scene)
        },
        lightFactory: { createPointLight: (name, position) => new BABYLON.PointLight(name, position, scene) },
        textureLoader: null,
        concreteTextures: null,
        _applyWorldUVs() {}
    }, loadClassic('js/venueDressing.js', { BABYLON, log }).window.VenueDressing,
    loadClassic('js/cityDistrict.js', { BABYLON, log }).window.CityDistrict);
    club.createEntranceArea();
    const S = loadClassic('js/venueDressing.js').window.VenueLayout.vestibule.streetLevel;

    // A person's torso at street level, walking from the top of the entrance stair toward the street.
    const blocked = (x, y) => {
        const hit = scene.pickWithRay(new BABYLON.Ray(new BABYLON.Vector3(x, S + y, 4.5), new BABYLON.Vector3(0, 0, 1), 3),
            mesh => mesh.checkCollisions && mesh.isEnabled());
        return !!(hit && hit.hit);
    };
    for (const x of [-1.2, -0.4, 0, 0.4, 1.2]) assert.ok(blocked(x, 1.2), `the shut door lets x=${x} through`);
    assert.equal(club._streetDoor.open, false);
    assert.ok(club._streetDoor.meshes.every(mesh => mesh && mesh.isEnabled()), 'the glass leaves are drawn while the door is shut');

    club._cityRoot = {}; // the street has arrived
    club._openStreetDoor();
    assert.equal(club._streetDoor.open, true);
    assert.ok(club._streetDoor.meshes.every(mesh => !mesh.isEnabled()), 'the leaves and bars go when the door opens');
    for (const x of [-1.2, -0.4, 0, 0.4, 1.2]) {
        for (const y of [0.3, 1.2, 2.2]) assert.ok(!blocked(x, y), `the open door still blocks (x=${x}, y=${y})`);
    }
    // The wall around the doorway is still a wall.
    for (const x of [-3.5, 2.4, 3.5]) assert.ok(blocked(x, 1.2), `the street wall has a hole at x=${x}`);
    assert.ok(blocked(0, 3.4), 'the lintel is missing');
    assert.ok(blocked(1.6, 1.2), 'the door frame is not solid');
    scene.dispose();
});

/** The entrance built in the real (headless) Babylon, as the street-door test does. */
function buildEntrance() {
    const BABYLON = require('../js/vendor/babylon.js');
    const scene = new BABYLON.Scene(new BABYLON.NullEngine());
    const material = name => new BABYLON.StandardMaterial(name, scene);
    const log = { info() {}, warn() {} };
    const { window } = loadClassic('js/venueDressing.js', { BABYLON, log });
    const club = Object.assign({
        scene,
        materialFactory: {
            getPreset: material, createStandardMaterial: material,
            createPBRMaterial: name => new BABYLON.PBRMaterial(name, scene)
        },
        lightFactory: { createPointLight: (name, position) => new BABYLON.PointLight(name, position, scene) },
        textureLoader: null,
        concreteTextures: null,
        _applyWorldUVs() {}
    }, window.VenueDressing);
    club.createEntranceArea();
    const firstHit = (from, dir, length, predicate = mesh => mesh.checkCollisions && mesh.isEnabled()) => {
        const hit = scene.pickWithRay(new BABYLON.Ray(new BABYLON.Vector3(...from), new BABYLON.Vector3(...dir), length), predicate);
        return hit && hit.hit ? hit : null;
    };
    return { BABYLON, scene, club, layout: window.VenueLayout.vestibule, firstHit };
}

test('the entrance is a stair down from the street: comfortable, solid, carpeted and railed', () => {
    const { scene, club, layout, firstHit } = buildEntrance();
    const { streetLevel: S, stair } = layout;
    const rise = S / stair.steps, tread = (stair.zTop - stair.zBottom) / (stair.steps - 1);
    // A stair people can walk: rise 15-19 cm, going 26-32 cm, and 2R + G in the comfortable 60-66 cm band.
    assert.ok(rise >= 0.15 && rise <= 0.19, `rise ${rise.toFixed(3)} m`);
    assert.ok(tread >= 0.26 && tread <= 0.32, `going ${tread.toFixed(3)} m`);
    assert.ok(2 * rise + tread >= 0.6 && 2 * rise + tread <= 0.66, `2R + G = ${(2 * rise + tread).toFixed(3)} m`);

    const steps = club._vestibuleStair;
    assert.ok(steps && steps.checkCollisions, 'the stair must be solid (the desktop camera climbs it by collision)');
    assert.equal(steps.collisionGroup, 2, 'the headset follows the stair, it does not collide with it');
    const onStair = mesh => mesh === steps;
    for (let i = 1; i < stair.steps; i++) {
        const z = stair.zBottom + (i - 0.5) * tread;
        for (const x of [-1.5, 0, 1.5]) {
            const hit = firstHit([x, S + 2, z], [0, -1, 0], S + 3, onStair);
            assert.ok(hit && Math.abs(hit.pickedPoint.y - i * rise) < 0.005, `tread ${i} at x ${x} is at ${hit && hit.pickedPoint.y.toFixed(3)}, not ${(i * rise).toFixed(3)}`);
            // The walking surface never sits more than a riser off the tread underfoot.
            assert.ok(Math.abs(layout.walkLevel(x, z) - i * rise) <= rise, `walk level ${layout.walkLevel(x, z).toFixed(3)} over tread ${i}`);
        }
    }
    // The top landing is at street level, and the treads are a teleport floor.
    assert.ok(Math.abs(firstHit([0, S + 2, 5.5], [0, -1, 0], 3, onStair).pickedPoint.y - S) < 0.005);
    assert.ok(club._vestibuleFloor, 'the landings and galleries are a floor');

    // From either gallery, the stairwell is railed off at its side and at the gallery's front edge.
    for (const side of [-1, 1]) {
        assert.ok(firstHit([side * 2.8, S + 0.6, 3.0], [-side, 0, 0], 1.2), `the ${side < 0 ? 'left' : 'right'} gallery has no rail over the stair`);
        assert.ok(firstHit([side * 2.8, S + 0.6, 2.0], [0, 0, -1], 1.5), `the ${side < 0 ? 'left' : 'right'} gallery has no rail at its front`);
        // Going down the stair, the gallery walls are its sides.
        assert.ok(firstHit([0, 1.2, 2.5], [side, 0, 0], 1.85), 'the stairwell has no side wall');
    }
    // Nothing collidable on the way in from the club's doorway to the bottom step, or up the middle of the flight
    // just over the treads.
    assert.equal(firstHit([0, 1.0, -0.5], [0, 0, 1], 1.3), null, 'something blocks the landing at the foot of the stair');
    assert.equal(firstHit([0, 0.4, stair.zBottom + 0.1], [0, 1, 0], S + 1.5, mesh => mesh.checkCollisions && mesh !== steps && mesh.isEnabled()), null,
        'something hangs over the stair');
    // The carpet runs down the flight.
    const carpet = scene.getMeshByName('vestibuleCarpet');
    assert.ok(carpet && carpet.getBoundingInfo().boundingBox.maximumWorld.y > S, 'the carpet does not climb to the street');
    scene.dispose();
});

test('walking surfaces: the club floor, the entrance stair, its galleries and the street, joined to the balcony', () => {
    const layout = loadClassic('js/venueDressing.js').window.VenueLayout.vestibule;
    const { streetLevel: S, stair } = layout;
    assert.equal(layout.walkLevel(0, -12), null, 'inside the club the mezzanine and the floor decide');
    assert.equal(layout.walkLevel(0, 0.5), 0, 'the landing at the club\'s doorway is the club floor');
    let last = -1;
    for (let z = stair.zBottom; z <= stair.zTop + 1e-9; z += 0.1) {
        const level = layout.walkLevel(0, z);
        assert.ok(level >= last, `the stair goes down at z ${z.toFixed(2)}`);
        last = level;
    }
    assert.ok(Math.abs(last - S) < 0.1, 'the stair does not reach the street');
    for (const [x, z, what] of [[0, 5.5, 'the top landing'], [2.8, 3, 'the coat-check gallery'], [-2.8, 1.2, 'the ticket gallery'],
        [0, 6.15, 'the street doorway'], [0, 9, 'the pavement'], [10, 3, 'the forecourt beside the vestibule'], [30, 20, 'down the avenue']]) {
        assert.equal(layout.walkLevel(x, z), S, `${what} is not at street level`);
    }

    const { window } = loadClassic('js/mezzanine.js');
    window.VenueLayout = { vestibule: layout };
    const club = Object.assign({}, window.Mezzanine);
    const mezz = window.MezzanineLayout;
    assert.equal(club._walkSurfaceLevel(0, -12, 0), 0, 'the dance floor');
    assert.equal(club._walkSurfaceLevel(-11, -14, mezz.deck.top), mezz.deck.top, 'the balcony');
    assert.equal(club._walkSurfaceLevel(0, 9, 0), S, 'the street, whatever the last level');
    assert.ok(club._walkSurfaceLevel(0, 3, 1.2) > 0.5 && club._walkSurfaceLevel(0, 3, 1.2) < S - 0.5, 'half-way down the entrance stair');
});

// ---------------------------------------------------------------------------
// Seeking, the VR Music page, and the DJ that follows the podcast
// ---------------------------------------------------------------------------

function fakeAudio({ duration = 3600, currentTime = 0, paused = false, seekable = true } = {}) {
    return {
        duration, currentTime, paused, ended: false, src: 'https://x/e.mp3',
        seekable: { length: seekable ? 1 : 0 },
        play() { this.paused = false; return Promise.resolve(); },
        pause() { this.paused = true; }
    };
}

test('playback position: a set can be seeked, a live stream cannot, and a seek never jumps to the very end', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {} });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);

    assert.deepEqual({ ...club.getPlaybackInfo() }, { seekable: false, position: 0, duration: 0, playing: false }, 'nothing loaded');
    assert.equal(club.seekAudioTo(30), false);
    assert.equal(club.seekAudioBy(30), false);

    club.audioElement = fakeAudio({ duration: Infinity });
    assert.equal(club.getPlaybackInfo().seekable, false, 'a live stream has no length');
    assert.equal(club.seekAudioTo(30), false);
    assert.equal(club.audioElement.currentTime, 0, 'a live stream must not be touched');
    club.audioElement = fakeAudio({ duration: NaN });
    assert.equal(club.getPlaybackInfo().seekable, false, 'metadata has not arrived yet');
    club.audioElement = fakeAudio({ seekable: false });
    assert.equal(club.getPlaybackInfo().seekable, false, 'the browser says there is no seekable range');

    const audio = club.audioElement = fakeAudio({ duration: 3600, currentTime: 100 });
    assert.deepEqual({ ...club.getPlaybackInfo() }, { seekable: true, position: 100, duration: 3600, playing: true });
    assert.equal(club.seekAudioTo(1800), true);
    assert.equal(audio.currentTime, 1800);
    club.seekAudioBy(-30);
    assert.equal(audio.currentTime, 1770);
    club.seekAudioBy(60);
    assert.equal(audio.currentTime, 1830);
    club.seekAudioBy(-99999);
    assert.equal(audio.currentTime, 0, 'back past the start stops at the start');
    club.seekAudioBy(99999);
    assert.equal(audio.currentTime, 3599, 'forward past the end stops a second short: seeking to the very end would fire "ended"');
    club.seekAudioFraction(0.5);
    assert.equal(audio.currentTime, 1800);
    club.seekAudioFraction(-3);
    assert.equal(audio.currentTime, 0);
    club.seekAudioFraction(7);
    assert.equal(audio.currentTime, 3599);
    for (const bad of [NaN, Infinity, undefined, 'x']) {
        audio.currentTime = 500;
        assert.equal(club.seekAudioTo(bad), false, String(bad));
        assert.equal(club.seekAudioFraction(bad), false, String(bad));
        assert.equal(audio.currentTime, 500);
    }
    // A short file: the clamp never goes negative.
    club.audioElement = fakeAudio({ duration: 0.5, currentTime: 0 });
    assert.equal(club.seekAudioTo(10), true);
    assert.equal(club.audioElement.currentTime, 0);
});

test('a seek or a pause by the room host is published; a guest never publishes; a local file is never shared', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {} });
    const sent = [];
    const club = Object.create(window.VRClubUI.prototype);
    club.audioElement = fakeAudio({ duration: 3600, currentTime: 10 });
    club._audioKind = 'stream';
    club._audioStreamUrl = 'https://x/e.mp3';
    club.networkManager = { connected: true, isHost: () => true, sendMusic: message => sent.push({ ...message }) };

    club.seekAudioTo(900);
    assert.deepEqual(sent, [{ url: 'https://x/e.mp3', playing: true, position: 900 }]);
    club.toggleAudioPlayback();
    assert.equal(club.audioElement.paused, true);
    assert.deepEqual(sent.at(-1), { url: 'https://x/e.mp3', playing: false, position: 900 }, 'a pause is shared with its position');
    club.toggleAudioPlayback();
    assert.equal(club.audioElement.paused, false);
    assert.equal(sent.at(-1).playing, true);

    sent.length = 0;
    club.networkManager.isHost = () => false;
    club.seekAudioTo(100);
    assert.deepEqual(sent, [], 'a guest cannot publish music');
    club.networkManager.isHost = () => true;
    club._audioKind = 'file';
    club.seekAudioTo(200);
    assert.deepEqual(sent, [], 'a local file means nothing to other guests');
    club._audioKind = 'stream';
    club.networkManager.connected = false;
    club.seekAudioTo(300);
    assert.deepEqual(sent, [], 'not connected');

    // With no audio element the toggle explains itself instead of throwing.
    const quiet = Object.create(window.VRClubUI.prototype);
    let message = '';
    quiet.showErrorMessage = text => { message = text; };
    assert.equal(quiet.toggleAudioPlayback(), false);
    assert.match(message, /Nothing is playing/);
});

test('the VR seek bar maps a pointer position to a fraction, drags and commits on release', () => {
    const BABYLON = require('../js/vendor/babylon.js');
    const { window } = loadClassic('js/club/10-ui.js', { BABYLON, VRClubAnimationFinish: class {} });
    window.AudioUtils = loadClassic('js/audioUtils.js').window.AudioUtils;
    const scene = new BABYLON.Scene(new BABYLON.NullEngine());
    const mesh = BABYLON.MeshBuilder.CreatePlane('seek', { width: 1.48, height: 0.28 }, scene);
    // The menu is world-locked where the guest looks: any position and yaw must map the same way.
    mesh.position.set(3, 1.5, -7);
    mesh.rotation.y = Math.PI / 3;
    mesh.computeWorldMatrix(true);

    const ctx = new Proxy({ measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }) }, {
        get: (target, key) => (key in target ? target[key] : () => {}), set: () => true
    });
    const club = Object.create(window.VRClubUI.prototype);
    club.audioElement = fakeAudio({ duration: 3000, currentTime: 600 });
    club.nowPlayingLabel = 'Resident / Episode 803';
    club._vrSeek = { mesh, width: 1.48, drag: null, texture: { getContext: () => ctx, update() {} } };
    club.pulseHaptic = () => {};
    let toast = '';
    club.showErrorMessage = text => { toast = text; };

    const { left, right, width } = window.VRClubUI.VR_SEEK_BAR_PX;
    const worldAt = fractionOfBar => {
        // The bar's pixel position -> the plane's local x -> a world point on the plane.
        const px = left + fractionOfBar * (right - left);
        const localX = (px / width - 0.5) * 1.48;
        return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(localX, 0.03, 0), mesh.getWorldMatrix());
    };
    for (const f of [0, 0.25, 0.5, 0.9, 1]) {
        assert.ok(Math.abs(club._vrSeekFractionAt(worldAt(f)) - f) < 1e-6, `fraction ${f}`);
    }
    const bounds = mesh.getBoundingInfo().boundingBox;
    assert.equal(club._vrSeekFractionAt(BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(-0.74, 0, 0), mesh.getWorldMatrix())), 0, 'the left margin clamps to the start');
    assert.equal(club._vrSeekFractionAt(BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(0.74, 0, 0), mesh.getWorldMatrix())), 1, 'the right margin clamps to the end');
    assert.equal(club._vrSeekFractionAt(null), null);
    assert.ok(bounds);

    // Press, drag, release: nothing moves until the release, then the audio goes where the last pointer was.
    club._beginVRSeek({ pickedPoint: worldAt(0.2) });
    assert.equal(club.audioElement.currentTime, 600, 'pressing must not seek yet');
    assert.ok(Math.abs(club._vrSeek.drag.fraction - 0.2) < 1e-6);
    club._moveVRSeek({ hit: true, pickedMesh: { not: 'the bar' }, pickedPoint: worldAt(0.9) });
    assert.ok(Math.abs(club._vrSeek.drag.fraction - 0.2) < 1e-6, 'a ray that left the bar does not move the thumb');
    club._moveVRSeek({ hit: false });
    club._moveVRSeek({ hit: true, pickedMesh: mesh, pickedPoint: worldAt(0.75) });
    assert.ok(Math.abs(club._vrSeek.drag.fraction - 0.75) < 1e-6);
    club._endVRSeek();
    assert.equal(club._vrSeek.drag, null);
    assert.ok(Math.abs(club.audioElement.currentTime - 2250) < 0.01, '0.75 of 3000 s');
    club._endVRSeek(); // a stray pointer-up is harmless
    assert.ok(Math.abs(club.audioElement.currentTime - 2250) < 0.01);

    // A live stream has nothing to seek in.
    club.audioElement = fakeAudio({ duration: Infinity });
    club._beginVRSeek({ pickedPoint: worldAt(0.5) });
    assert.equal(club._vrSeek.drag, null);
    assert.match(toast, /live stream/i);
    scene.dispose();
});

test('the VR Music page: its seek row is free, every button is wired, and the actions use the shared player', async () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {} });
    window.Podcasts = loadPodcasts();
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);

    const home = club._vrQuickMenuPageDefinitions('home');
    assert.ok(home.some(item => item && item.target === 'music'), 'the home page must reach the Music page');
    for (const page of ['home', 'lighting', 'effects', 'comfort', 'travel', 'show', 'music']) {
        assert.ok(club._vrQuickMenuPageDefinitions(page).length <= 12, `${page} has more buttons than the menu has slots`);
    }
    const music = club._vrQuickMenuPageDefinitions('music');
    assert.deepEqual([...music.slice(0, 3)], [null, null, null], 'the first row belongs to the seek bar');
    assert.deepEqual([...music.slice(3).map(item => item.action)],
        ['seek', 'playPause', 'seek', 'podcast', 'podcast', 'randomEpisode', 'latestEpisode', 'back', 'close']);
    assert.deepEqual([...music.filter(item => item && item.action === 'seek').map(item => item.delta)], [-60, 60]);
    assert.deepEqual([...music.filter(item => item && item.action === 'podcast').map(item => item.podcast)], ['resident', 'colourizon']);

    // Actions.
    const log = [];
    const player = {
        selectedId: () => 'colourizon',
        switchTo: async id => { log.push(['switchTo', id]); },
        playRandom: async () => { log.push(['random']); },
        playLatest: async () => { log.push(['latest']); }
    };
    const toasts = [];
    Object.assign(club, {
        podcastPlayer: player,
        pulseHaptic() {}, _refreshVRQuickMenu() {},
        showErrorMessage: text => toasts.push(text),
        seekAudioBy: delta => { log.push(['seekBy', delta]); return true; },
        toggleAudioPlayback: () => { log.push(['toggle']); return true; }
    });
    await club._runVRMusicAction({ action: 'seek', delta: -60 });
    await club._runVRMusicAction({ action: 'playPause' });
    await club._runVRMusicAction({ action: 'podcast', podcast: 'resident' });
    await club._runVRMusicAction({ action: 'randomEpisode' });
    await club._runVRMusicAction({ action: 'latestEpisode' });
    assert.deepEqual(log, [['seekBy', -60], ['toggle'], ['switchTo', 'resident'], ['random'], ['latest']]);
    assert.ok(toasts.some(text => /Miss Melera/.test(text)), 'the toast names the artist whose set is being found');

    // Failures are reported, never thrown; a missing player is explained.
    player.playRandom = async () => { throw new Error('feed down'); };
    await club._runVRMusicAction({ action: 'randomEpisode' });
    assert.match(toasts.at(-1), /feed down/);
    club.podcastPlayer = null;
    await club._runVRMusicAction({ action: 'latestEpisode' });
    assert.match(toasts.at(-1), /not ready/);
    club.seekAudioBy = () => false;
    await club._runVRMusicAction({ action: 'seek', delta: 60 });
    assert.match(toasts.at(-1), /Nothing to seek/);

    // The page's button states.
    club.podcastPlayer = player; // colourizon is chosen
    assert.equal(club._isVRQuickMenuButtonActive({ action: 'podcast', podcast: 'colourizon' }), true);
    assert.equal(club._isVRQuickMenuButtonActive({ action: 'podcast', podcast: 'resident' }), false);
    assert.equal(club._vrQuickMenuButtonValue({ action: 'podcast' }, true), 'SELECTED');
    club.audioElement = fakeAudio({ paused: true });
    assert.equal(club._vrQuickMenuButtonValue({ action: 'playPause' }, club._isVRQuickMenuButtonActive({ action: 'playPause' })), 'PAUSED');
    club.audioElement.paused = false;
    assert.equal(club._vrQuickMenuButtonValue({ action: 'playPause' }, club._isVRQuickMenuButtonActive({ action: 'playPause' })), 'PLAYING');
});

test('clock labels read h:mm:ss and survive garbage', () => {
    const { AudioUtils } = loadClassic('js/audioUtils.js').window;
    assert.equal(AudioUtils.formatClock(0), '0:00');
    assert.equal(AudioUtils.formatClock(65), '1:05');
    assert.equal(AudioUtils.formatClock(3599), '59:59');
    assert.equal(AudioUtils.formatClock(3725), '1:02:05');
    assert.equal(AudioUtils.formatClock(10 * 3600 + 5), '10:00:05');
    for (const bad of [NaN, Infinity, -5, null, undefined, 'x']) assert.equal(AudioUtils.formatClock(bad), bad === Infinity ? '0:00' : '0:00', String(bad));
});

test('the DJ at the decks follows the podcast: one load per DJ, a clean swap, queued switches and safe ids', async () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const Crowd = window.VRClubAudioCrowd;

    // The looks: two people, each with its own file, height and tints; unknown ids are refused as own keys only.
    assert.deepEqual(Object.keys(Crowd.DJ_LOOKS), ['hernan', 'melera']);
    assert.match(Crowd.DJ_LOOKS.hernan.url, /club-dj-hernan\.glb$/);
    assert.match(Crowd.DJ_LOOKS.melera.url, /club-dj-melera\.glb$/);
    for (const bad of ['__proto__', 'constructor', 'toString', '', null, undefined, 7]) assert.equal(Crowd.djLook(bad), null, String(bad));
    const hair = id => Crowd.DJ_LOOKS[id].hair;
    // Hernan Cattaneo: half-long dark brown hair. Miss Melera: long light blond hair (their press photos).
    assert.ok(hair('hernan').r < 0.35 && hair('hernan').g < 0.2 && hair('hernan').b < 0.12 && hair('hernan').r > hair('hernan').b, 'Hernan Cattaneo has dark brown hair');
    assert.ok(hair('melera').r > 0.8 && hair('melera').g > 0.7 && hair('melera').b > 0.45 && hair('melera').r > hair('melera').b, 'Miss Melera has light blond hair');
    assert.ok(Crowd.DJ_LOOKS.hernan.garment.r < 0.15, 'Hernan wears a dark tee');
    const tee = Crowd.DJ_LOOKS.melera.garment;
    assert.ok(tee.r > 0.3 && tee.r < 0.6, 'Miss Melera wears a mid-grey tee');

    const spawned = [], disposed = [], loads = [];
    let initDone;
    const club = Object.create(Crowd.prototype);
    Object.assign(club, {
        npcAvatars: [{ name: 'dancer0' }],
        _disposed: false,
        initPromise: new Promise(resolve => { initDone = resolve; }),
        async _loadAvatarSource(url, garment, hairColour) { loads.push([url, garment, hairColour]); return { url }; },
        _spawnAvatar(container, name, position, facing, height, speed, options) {
            const npc = { name, collider: { dispose: () => disposed.push(`collider:${container.url}`) } };
            club.npcAvatars.push(npc);
            spawned.push({ url: container.url, height, speed, clip: options.clip, y: position.y, z: position.z });
            return { dispose: () => disposed.push(`entry:${container.url}`) };
        },
        _refreshContactShadows() { club.shadowRefreshes = (club.shadowRefreshes || 0) + 1; },
        _refreshShadowCasters() {}
    });

    // A switch requested while the club is still being built waits for init and does not race it.
    const early = club.setDJ('melera');
    await flush();
    assert.equal(spawned.length, 0, 'the DJ must wait for the club to finish building');
    initDone();
    assert.equal(await early, true);
    assert.equal(spawned.length, 1);
    assert.deepEqual({ ...spawned[0] }, { url: Crowd.DJ_LOOKS.melera.url, height: 1.68, speed: 0.55, clip: 'Idle_Loop', y: 0.5, z: -19.4 });
    assert.equal(club.npcAvatars.filter(npc => npc.name === 'djPerformer').length, 1);

    // The same DJ again does nothing; the other one replaces the first completely.
    assert.equal(await club.setDJ('melera'), true);
    assert.equal(spawned.length, 1);
    assert.equal(await club.setDJ('hernan'), true);
    assert.equal(spawned.length, 2);
    assert.equal(club.npcAvatars.filter(npc => npc.name === 'djPerformer').length, 1, 'exactly one DJ at the decks');
    assert.deepEqual(disposed, [`collider:${Crowd.DJ_LOOKS.melera.url}`, `entry:${Crowd.DJ_LOOKS.melera.url}`], 'the previous DJ is disposed entirely');
    assert.equal(club._djId, 'hernan');
    assert.ok(club.shadowRefreshes >= 2, 'the contact shadow follows the new DJ');

    // Switching back reuses the loaded file; quick switches end on the last one.
    club.setDJ('melera'); club.setDJ('hernan'); await club.setDJ('melera');
    assert.equal(club._djId, 'melera');
    assert.equal(loads.length, 2, 'each DJ file is loaded once');
    assert.deepEqual(loads.map(load => load[0]), [Crowd.DJ_LOOKS.melera.url, Crowd.DJ_LOOKS.hernan.url]);
    assert.equal(loads[0][1], Crowd.DJ_LOOKS.melera.garment);
    assert.equal(loads[0][2], Crowd.DJ_LOOKS.melera.hair);

    // Refused ids leave the DJ alone; a failed load keeps the current one; a disposed club does nothing.
    assert.equal(await club.setDJ('__proto__'), false);
    assert.equal(club._djId, 'melera');
    club._djContainers.hernan = null;
    club._loadAvatarSource = async () => null;
    assert.equal(await club.setDJ('hernan'), false, 'a DJ whose file cannot load never replaces the working one');
    assert.equal(club._djId, 'melera');
    club._disposed = true;
    assert.equal(await club.setDJ('hernan'), false);

    // Until a podcast is chosen the first DJ is Hernan Cattaneo's; afterwards the chosen podcast's.
    assert.equal(Object.create(Crowd.prototype)._initialDJId(), 'hernan');
    const store = new Map();
    window.Podcasts = loadPodcasts();
    const storage = { getItem: key => store.get(key) ?? null };
    window.localStorage = storage;
    const chooser = Object.create(Crowd.prototype);
    const withStorage = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {}, localStorage: storage });
    withStorage.window.Podcasts = window.Podcasts;
    const club2 = Object.create(withStorage.window.VRClubAudioCrowd.prototype);
    assert.equal(club2._initialDJId(), 'hernan');
    store.set('vrclub.podcast', 'colourizon');
    assert.equal(club2._initialDJId(), 'melera');
    assert.ok(chooser);
});

test('avatar materials take their hair and jacket tints only where they belong', () => {
    const BABYLON = makeBabylonStub();
    BABYLON.Material = { MATERIAL_OPAQUE: 0 };
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const material = name => ({ name, albedoColor: new BABYLON.Color3(1, 1, 1), albedoTexture: null });
    const [hair, brows, jacket, skin, eyes] = ['MI_Hair_2', 'MI_Hair_1', 'MI_Ranger', 'MI_Regular_Female', 'MI_Eyes'].map(material);
    const club = Object.create(window.VRClubAudioCrowd.prototype);
    Object.assign(club, { tierSettings: { anisotropy: 4 }, maxLights: 3 });
    club._prepareAvatarMaterials([hair, brows, jacket, skin, eyes], new BABYLON.Color3(0.1, 0.1, 0.1), new BABYLON.Color3(0.2, 0.1, 0.05));
    assert.deepEqual([hair, brows].map(m => [m.albedoColor.r, m.albedoColor.g, m.albedoColor.b]), [[0.2, 0.1, 0.05], [0.2, 0.1, 0.05]]);
    assert.deepEqual([jacket.albedoColor.r, jacket.albedoColor.g, jacket.albedoColor.b], [0.1, 0.1, 0.1]);
    for (const untouched of [skin, eyes]) assert.deepEqual([untouched.albedoColor.r, untouched.albedoColor.g, untouched.albedoColor.b], [1, 1, 1], `${untouched.name} must keep its own colour`);
    assert.ok([hair, jacket, skin].every(m => m.alpha === 1 && m.maxSimultaneousLights === 3), 'still opaque and budgeted');

    // The crowd's own loads pass no hair colour: their hair is untouched.
    const guestHair = material('MI_Hair_1');
    club._prepareAvatarMaterials([guestHair], null, null);
    assert.deepEqual([guestHair.albedoColor.r, guestHair.albedoColor.g, guestHair.albedoColor.b], [1, 1, 1]);
});

test('the DJ character files: one idle clip, six draws, the right hair, and the old DJ is gone', () => {
    const triangles = file => {
        const json = readGlbJson(`js/models/avatars/${file}`);
        return json.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);
    };
    const files = {
        // Hernan Cattaneo: the guest file's beard is cut out and Hair_Long, shortened to shoulder length and with its
        // front (bangs and face-framing locks) removed, goes over the short cap (+548 triangles net). Both DJs wear the
        // 3,324-triangle headphones.
        'club-dj-hernan.glb': { from: 'club-guest-male.glb', extra: [3500, 4200], hair: 'Hair_SimpleParted' },
        'club-dj-melera.glb': { from: 'club-guest-female.glb', extra: [3000, 3700], hair: 'Hair_Long' }
    };
    for (const [file, expected] of Object.entries(files)) {
        const json = readGlbJson(`js/models/avatars/${file}`);
        assert.deepEqual(json.animations.map(animation => animation.name), ['Idle_Loop'], `${file} must carry only the DJ's idle clip`);
        assert.ok(json.nodes.some(node => node.name === 'Eyes'), `${file} lost its eyes`);
        // Six draws, plus the headphones: a mesh skinned entirely to the Head joint, so they follow every head movement.
        assert.ok(json.meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0) <= 7, `${file} must stay within seven draws`);
        const headphones = json.nodes.find(node => node.name === 'Headphones');
        assert.ok(headphones && headphones.mesh !== undefined && headphones.skin === 0, `${file} has no headphones on its skeleton`);
        const headIndex = json.skins[0].joints.findIndex(joint => json.nodes[joint].name === 'Head');
        const attributes = json.meshes[headphones.mesh].primitives[0].attributes;
        assert.ok(attributes.JOINTS_0 !== undefined && attributes.WEIGHTS_0 !== undefined, `${file}'s headphones are not skinned`);
        assert.ok(headIndex >= 0, `${file} has no Head joint`);
        assert.ok(readFileSync(join(ROOT, `js/models/avatars/${file}`)).length < 3 * 1048576, `${file} is too heavy`);
        assert.match(readFileSync(join(ROOT, 'ASSETS.md'), 'utf8'), new RegExp(file.replace('.', '\\.')));
        const extra = triangles(file) - triangles(expected.from);
        assert.ok(extra >= expected.extra[0] && extra <= expected.extra[1], `${file} has ${extra} triangles more than ${expected.from}`);
    }
    assert.equal(readdirSync(join(ROOT, 'js/models/avatars')).includes('club-dj.glb'), false, 'the old DJ file is unused and must not ship');
    assert.equal(readdirSync(join(ROOT, 'js/models/avatars')).filter(file => /^club-dj/.test(file)).length, 2);
});

// ---------------------------------------------------------------------------
// A host drives the room's lights; guests follow
// ---------------------------------------------------------------------------

function makeFollowerShow() {
    const { window } = loadClassic('js/showDirector.js');
    const club = { vjManualMode: false, photosensitiveSafeMode: false, vjDirector: { paletteMode: 'analogous' } };
    const host = new window.ShowDirector({ ...club, vjDirector: { paletteMode: 'analogous' } });
    const follower = new window.ShowDirector(club);
    follower.setFollower(true);
    return { window, club, host, follower };
}

test('a following ShowDirector keeps the grid but never decides: no cue advance, no breakdown, no set-piece end', () => {
    const { follower } = makeFollowerShow();
    follower._barCounter = 40;
    follower._cueStartBar = 0;
    const before = [follower._movementName, follower._cueIndex];
    follower._onBar();
    assert.deepEqual([follower._movementName, follower._cueIndex], before, 'a follower advanced its own cue');
    follower._beginSetPiece('countdown', 'ignition');
    follower._setPieceStartBar = -100;
    follower._onBar();
    assert.ok(follower._setPiece, 'a follower ended a set-piece by itself');
    assert.equal(follower.forceMovement('pulse'), false);
    follower.triggerShowDrop();
    assert.equal(follower.setEnabled(false), true, 'a follower cannot be switched off');
});

test('a follower lands on the host\'s movement, cue and set-piece, and hands the rig on when the set-piece ends', () => {
    const { host, follower, club } = makeFollowerShow();
    host.forceMovement('ignition');
    host._cueIndex = 1;
    host._applyCue(host._movement.cues[1]);
    host._barCounter = 12;
    host._cueStartBar = 10;
    host._beatInBar = 2;
    const frame = { m: 'show', ...host.snapshot() };
    assert.equal(frame.mv, 'ignition');
    assert.equal(frame.cue, 1);
    assert.equal(frame.cb, 2);
    assert.equal(frame.bib, 2);
    follower._barCounter = 500;
    assert.equal(follower.applyRemote(frame), true);
    assert.equal(follower._movementName, 'ignition');
    assert.equal(follower._cueIndex, 1);
    assert.equal(follower._barCounter - follower._cueStartBar, 2, 'the ramps start where the host is in the cue');
    const look = follower.looks[follower._cue.look];
    for (const key in look) {
        if (window_isMeta(follower, key) || Array.isArray(look[key])) continue;
        assert.equal(club[key], look[key], `${key} was not applied from the host's cue`);
    }

    host._beginSetPiece('countdown', 'ignition');
    host._barCounter += 1;
    const piece = { m: 'show', ...host.snapshot() };
    assert.equal(piece.sp, 'countdown');
    assert.equal(piece.spt, 'ignition');
    follower.applyRemote(piece);
    assert.equal(follower._setPiece, follower.setPieces.countdown);
    assert.equal(follower._setPieceBar, piece.spb);

    host._endSetPiece();
    follower.applyRemote({ m: 'show', ...host.snapshot() });
    assert.equal(follower._setPiece, null, 'the set-piece ends when the host says so');
    assert.equal(follower._movementName, 'ignition');
});

function window_isMeta(director, key) {
    return director.constructor.META_KEYS.has(key);
}

test('a follower ignores names it does not know, and frames that are not a running show', () => {
    const { follower } = makeFollowerShow();
    const was = [follower._movementName, follower._cueIndex];
    assert.equal(follower.applyRemote({ m: 'show', mv: 'nonsense', cue: 0 }), false);
    assert.equal(follower.applyRemote({ m: 'show', mv: 'pulse', cue: 99 }), false);
    assert.equal(follower.applyRemote({ m: 'show', sp: 'nonsense', spb: 0 }), false);
    assert.equal(follower.applyRemote({ m: 'manual' }), false);
    assert.equal(follower.applyRemote(null), false);
    assert.deepEqual([follower._movementName, follower._cueIndex], was);
    follower.setFollower(false);
    assert.equal(follower.applyRemote({ m: 'show', mv: 'pulse', cue: 0 }), false, 'a director that is not following ignores the host');
});

test('beat alignment believes a persistent difference, not one beat of network delay', () => {
    const { follower } = makeFollowerShow();
    follower._beatInBar = 3;
    follower._alignBeat(0);            // the frame crossed the downbeat on its way here
    assert.equal(follower._beatInBar, 3);
    follower._alignBeat(0);            // twice in a row: it is real
    assert.equal(follower._beatInBar, 0);
    follower._beatInBar = 1;
    follower._alignBeat(3);            // two beats out is never latency
    assert.equal(follower._beatInBar, 3);
    follower._alignBeat(NaN);
    assert.equal(follower._beatInBar, 3);
});

test('leaving a host\'s show keeps the cue the room was on instead of restarting the opening', () => {
    const { follower } = makeFollowerShow();
    follower.applyRemote({ m: 'show', mv: 'ascent', cue: 1, cb: 0, bib: 0 });
    follower.setFollower(false);
    assert.equal(follower._movementName, 'ascent');
    assert.equal(follower._cueIndex, 1);
});

test('VJDirector adopts the host\'s colour, stops rotating its own, and applies it next frame', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const club = {
        vjBPM: 128, currentSpotColor: new BABYLON.Color3(1, 0, 0), mirrorBallColors: [{}, {}, {}, {}], mirrorBallColorIndex: 0,
        cycleMirrorBallColor() { this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length; }
    };
    const vj = new window.VJDirector(club);
    vj.beatNumber = 40;
    vj.remoteDriven = true;
    vj.applyRemoteColour({ hue: 0.6, hl: false, pal: 'complementary', lh: 'triad', mbi: 3 });
    assert.equal(vj.masterHue, 0.6);
    assert.equal(vj.paletteMode, 'complementary');
    assert.equal(vj.ledHarmony, 'triad');
    assert.equal(club.mirrorBallColorIndex, 3);
    assert.equal(vj.beatNumber - vj.lastPhraseBeat, 16, 'applied on the next frame, not the next phrase');
    vj._applyPalette();
    assert.equal(vj.masterHue, 0.6, 'a following director must not rotate the hue itself');
    assert.equal(club.mirrorBallColorIndex, 3, 'nor the mirror ball');
    vj.applyRemoteColour({ hue: 0.6, pal: 'bogus', lh: 'nonsense', mbi: 99 });
    assert.equal(vj.paletteMode, 'complementary', 'an unknown palette is ignored');
    assert.equal(club.mirrorBallColorIndex, 3, 'an out-of-range mirror colour is ignored');
    const snap = vj.colourSnapshot();
    assert.equal(snap.hue, 0.6);
    assert.equal(snap.pal, 'complementary');

    vj.remoteDriven = false;
    vj.lastPhraseBeat = vj.beatNumber - 16;
    vj._applyPalette();
    assert.notEqual(vj.masterHue, 0.6, 'on its own again it rotates as before');
});

test('a following VJDirector leaves scene choice to the host', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const club = { vjBPM: 128, dtScale: 1, showDirector: { isDriving: () => false } };
    const vj = new window.VJDirector(club);
    let picked = 0;
    vj._updateAutoScene = () => { picked++; };
    vj.manualSceneUntil = -1;
    vj.update(1, { hasAudio: false });
    assert.equal(picked, 1);
    vj.remoteDriven = true;
    vj.update(2, { hasAudio: false });
    assert.equal(picked, 1, 'a guest\'s own auto-scene picker must stand down');
});

test('VR menu: the room-code keypad types six digits, deletes, and the online page offers it', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {} });
    const proto = window.VRClubUI.prototype;
    const joined = [];
    const club = Object.create(proto);
    club.multiplayer = { joinRoom: code => { joined.push(code); return true; }, currentRoom: 'lobby', connected: false };
    club.showErrorMessage = () => {};
    club.pulseHaptic = () => {};
    const shown = [];
    club._showVRQuickMenuPage = page => shown.push(page);
    window.ClubMultiplayer = class { static EMOJI = []; };
    const common = { back: { label: 'BACK', action: 'back' }, close: { label: 'CLOSE', action: 'close' } };

    const keypad = proto._vrNetPageDefinitions.call(club, 'room', common);
    assert.deepEqual([...keypad.slice(0, 10).map(b => b.label)], ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
    assert.equal(keypad.length, 12, 'the menu has twelve slots');
    assert.equal(keypad[10].label, '\u2190 BACK');
    const online = proto._vrNetPageDefinitions.call(club, 'online', common);
    assert.ok(online.some(b => b.label === 'JOIN ROOM' && b.target === 'room'));
    assert.ok(online.length <= 12);
    assert.ok(window.VRClubUI.VR_NET_PAGES.includes('room'));

    const press = digit => proto._runVRNetworkAction.call(club, { op: 'digit', digit });
    for (const d of '48291') press(d);
    assert.equal(club._vrRoomDigits, '48291');
    proto._runVRNetworkAction.call(club, { op: 'roomBack' });
    assert.equal(club._vrRoomDigits, '4829', 'the back key deletes once something is typed');
    assert.equal(proto._vrNetPageDefinitions.call(club, 'room', common)[10].label, '\u2190 DELETE');
    press('1'); press('3');
    assert.deepEqual([...joined], ['482913']);
    assert.equal(club._vrRoomDigits, '');
    assert.equal(shown.at(-1), 'online');
    assert.equal(proto._vrNetSubtitle.call(Object.assign(club, { _vrRoomDigits: '48' }), 'room').replace(/\s+/g, ' '), 'ROOM CODE 48_ ___');
});

test('VR menu: lighting and music buttons read HOST ONLY for a guest, and travel and comfort stay local', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {} });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);
    club.multiplayer = { following: true };
    club.graphicsTier = 'ultra';
    for (const owned of [{ action: 'seek' }, { action: 'playPause' }, { action: 'podcast' }, { action: 'autoShow' }, { action: 'reset' },
        { action: 'cycle', control: 'changeColor' }, { control: 'lightsActive' }, { control: 'strobesActive' }]) {
        assert.equal(proto._vrQuickMenuButtonValue.call(club, owned, true), 'HOST ONLY', JSON.stringify(owned));
    }
    for (const local of [{ action: 'travel', control: 'danceFloor' }, { control: 'photosensitiveSafeMode' }, { control: 'vrComfortMode' },
        { control: 'bassHapticsEnabled' }, { action: 'quality' }]) {
        assert.notEqual(proto._vrQuickMenuButtonValue.call(club, local, true), 'HOST ONLY', JSON.stringify(local));
    }
    club.multiplayer = { following: false };
    assert.notEqual(proto._vrQuickMenuButtonValue.call(club, { control: 'lightsActive' }, true), 'HOST ONLY');
});

test('guardHostControl lets a host and a lone guest through and tells a following guest whose it is', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {}, performance: { now: () => 5000 } });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);
    const toasts = [];
    club.showErrorMessage = message => toasts.push(message);
    assert.equal(club.guardHostControl('lights'), true, 'no session at all');
    club.multiplayer = { following: false, hostName: () => 'Ann' };
    assert.equal(club.guardHostControl('lights'), true);
    club.multiplayer = { following: true, hostName: () => 'Ann' };
    assert.equal(club.guardHostControl('music'), false);
    assert.match(toasts[0], /Only the host \(Ann\) controls the music/);
    assert.equal(club.guardHostControl('music'), false);
    assert.equal(toasts.length, 1, 'repeated taps do not stack toasts');
});

test('VR menu: the LOOK page picks a pool and rerolls, and the online page still fits twelve slots', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {} });
    const proto = window.VRClubUI.prototype;
    const picked = [];
    const club = Object.create(proto);
    club.multiplayer = { avatarPool: 'men', connected: true, setAvatarPool: p => picked.push(p), rerollAvatar: () => picked.push('reroll') };
    club.showErrorMessage = () => {};
    window.ClubMultiplayer = class { static EMOJI = []; };
    const common = { back: { label: 'BACK', action: 'back' }, close: { label: 'CLOSE', action: 'close' } };
    const look = proto._vrNetPageDefinitions.call(club, 'look', common);
    assert.deepEqual([...look.slice(0, 4).map(b => b.label)], ['WOMEN', 'MEN', 'ANYONE', 'NEW LOOK']);
    assert.equal(proto._vrNetActive.call(club, look[1]), true, 'the chosen pool is lit');
    assert.equal(proto._vrNetActive.call(club, look[0]), false);
    assert.equal(proto._vrNetValue.call(club, look[1], true), 'SELECTED');
    for (const button of [look[0], look[2], look[3]]) proto._runVRNetworkAction.call(club, button);
    assert.deepEqual([...picked], ['women', 'any', 'reroll']);
    club.multiplayer.people = () => [];
    club.multiplayer.statusText = () => '';
    const online = proto._vrNetPageDefinitions.call(club, 'online', common);
    assert.ok(online.length <= 12);
    assert.ok(online.some(b => b.label === 'LOOK' && b.target === 'look'));
    assert.ok(window.VRClubUI.VR_NET_PAGES.includes('look'));
});

test('VR menu: SAFETY has a NAME TAGS switch that reads and flips the shared setting', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {} });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);
    club.multiplayer = { nameTags: true, setNameTags(v) { this.nameTags = v; } };
    club.showErrorMessage = () => {};
    window.ClubMultiplayer = class { static EMOJI = []; };
    const common = { back: { label: 'BACK', action: 'back' }, close: { label: 'CLOSE', action: 'close' } };
    const safety = proto._vrNetPageDefinitions.call(club, 'safety', common);
    assert.ok(safety.length <= 12, 'the menu has twelve slots');
    const button = safety.find(b => b.op === 'nameTags');
    assert.ok(button, 'no NAME TAGS button on the safety page');
    assert.equal(proto._vrNetActive.call(club, button), true);
    assert.equal(proto._vrNetValue.call(club, button, true), 'ON');
    proto._runVRNetworkAction.call(club, button);
    assert.equal(club.multiplayer.nameTags, false);
    assert.equal(proto._vrNetValue.call(club, button, proto._vrNetActive.call(club, button)), 'OFF');
});

test('speech bubbles wrap by word, split a word longer than a line, and end in an ellipsis past three lines', () => {
    const { AvatarManager } = loadAvatarManager();
    const measure = text => Array.from(text).length * 10;          // 10 px a character
    assert.deepEqual([...AvatarManager.wrapText('hello there friend', 120, 3, measure)], ['hello there', 'friend']);
    assert.deepEqual([...AvatarManager.wrapText('a'.repeat(25), 100, 3, measure)], ['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
    const long = AvatarManager.wrapText('one two three four five six seven eight nine ten', 90, 3, measure);
    assert.equal(long.length, 3);
    assert.ok(long[2].endsWith('\u2026'), 'truncated text says so');
    assert.ok(long.every(line => measure(line) <= 90), 'no line is wider than the bubble');
    assert.deepEqual([...AvatarManager.wrapText('', 90, 3, measure)], []);
});

test('a chat bubble appears over the sender, is reused for the next message, times out, and goes with them', () => {
    const { manager, created } = loadAvatarManager();
    manager.updatePeerState('p', 'Pat', { x: 0, y: 1.7, z: 0, rotY: 0 });
    const peer = manager.remotes.get('p');
    manager.showChat('p', 'hello');
    const plane = peer.chatPlane;
    assert.ok(plane && plane.isEnabled());
    assert.equal(plane.material.disableDepthWrite, true, 'a label, so it stays out of the SSR pre-pass');
    const planes = created.length;
    manager.showChat('p', 'again');
    assert.equal(created.length, planes, 'one plane per guest, redrawn');
    for (let i = 0; i < 20 * 60; i++) manager.update(1 / 60);
    assert.equal(plane.isEnabled(), false, 'it times out');
    manager.showChat('nobody', 'x');
    manager.removePeer('p');
    assert.equal(plane.disposed, true);
});

test('setVoiceDuck dips the music after the compressor, changes only on a change, and leaves the analyser alone', () => {
    const { club } = createAudioHarness();
    club._connectAudioSourceOnce();
    const gain = club.voiceDuckGain.gain;
    const targets = [];
    gain.setTargetAtTime = (value) => { targets.push(value); gain.value = value; };
    gain.cancelScheduledValues = () => {};
    assert.equal(club.setVoiceDuck(true), true);
    assert.equal(club.setVoiceDuck(true), true);
    assert.equal(targets.length, 1, 'a repeated request does not reschedule the fade');
    assert.equal(targets[0], club.constructor.VOICE_DUCK_LEVEL);
    club.setVoiceDuck(false);
    assert.equal(targets.at(-1), 1);
    assert.equal(club._audioVolume ?? 1, 1, 'the user\'s own music volume is untouched');
});

test('VR menu: in a room HOME starts with TALK, REACT and CHAT; out of a room they are not there', () => {
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {} });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);
    club.multiplayer = { connected: false };
    const offline = club._vrQuickMenuPageDefinitions('home').map(b => b.label);
    assert.ok(!offline.includes('TALK'));
    club.multiplayer = { connected: true };
    const home = club._vrQuickMenuPageDefinitions('home');
    assert.deepEqual([...home.slice(0, 3).map(b => b.label)], ['TALK', 'REACT', 'CHAT']);
    assert.ok(home.length <= 12, 'the menu has twelve slots');
    assert.equal(home[0].op, 'mic');
    assert.equal(home[1].target, 'gestures');
    assert.equal(home[2].target, 'chat');
    assert.ok(home.some(b => b.label === 'ONLINE'), 'everything else is still reachable');
});

test('VR menu: unavailable buttons are drawn disabled and say why; the chat page sends quick phrases', () => {
    const ClubMultiplayer = class { static EMOJI = []; static QUICK_PHRASES = ['Hi!', 'Great track!']; };
    const { window } = loadClassic('js/club/10-ui.js', { VRClubAnimationFinish: class {}, BABYLON: {}, log: { info() {}, warn() {}, error() {} }, document: {}, ClubMultiplayer });
    const proto = window.VRClubUI.prototype;
    const club = Object.create(proto);
    const sent = [];
    const toasts = [];
    club.showErrorMessage = m => toasts.push(m);
    club.multiplayer = {
        connected: false, following: false, chat: [], chatUnread: 0, duckForVoice: true,
        isHost: () => false, pendingMusicInfo: () => null, blockedList: () => [],
        sendChat: text => { sent.push(text); return true; }, setDuckForVoice(v) { this.duckForVoice = v; }
    };
    const common = { back: { label: 'BACK', action: 'back' }, close: { label: 'CLOSE', action: 'close' } };
    const mic = { label: 'TALK', action: 'net', op: 'mic' };
    assert.equal(proto._isVRButtonDisabled.call(club, mic), true, 'no mic before joining a room');
    assert.equal(proto._vrNetValue.call(club, mic, false), 'JOIN A ROOM FIRST');
    assert.equal(proto._isVRButtonDisabled.call(club, { action: 'net', op: 'lock' }), true, 'lock is the host\'s');
    assert.equal(proto._isVRButtonDisabled.call(club, { action: 'net', op: 'unblockAll' }), true, 'nobody to unblock');
    assert.equal(proto._isVRButtonDisabled.call(club, { action: 'travel', control: 'danceFloor' }), false);
    club.multiplayer.connected = true;
    assert.equal(proto._isVRButtonDisabled.call(club, mic), false);
    assert.equal(proto._vrNetValue.call(club, mic, false), 'MIC OFF');
    club.multiplayer.following = true;
    assert.equal(proto._isVRButtonDisabled.call(club, { control: 'lightsActive' }), true, 'a guest\'s lighting is the host\'s');
    assert.equal(proto._isVRButtonDisabled.call(club, { control: 'photosensitiveSafeMode' }), false, 'Safe Mode is always the guest\'s own');

    const chat = proto._vrNetPageDefinitions.call(club, 'chat', common);
    assert.deepEqual([...chat.slice(0, 2).map(b => b.phrase)], ['Hi!', 'Great track!']);
    assert.ok(chat.length <= 12);
    proto._runVRNetworkAction.call(club, chat[1]);
    assert.deepEqual([...sent], ['Great track!']);
    const duck = proto._vrNetPageDefinitions.call(club, 'safety', common).find(b => b.op === 'duck');
    assert.ok(duck, 'LOWER MUSIC is on the safety page');
    proto._runVRNetworkAction.call(club, duck);
    assert.equal(club.multiplayer.duckForVoice, false);
    club.multiplayer.chat = [{ name: 'Bo', text: 'hello', self: false }];
    assert.equal(proto._vrNetSubtitle.call(club, 'chat'), 'BO: HELLO', 'the chat page shows the last message received');
});

// ---------------------------------------------------------------------------
// Music-driven show: the kick band, its detector and the performing DJ
// ---------------------------------------------------------------------------

/**
 * A synthetic kick band, frame by frame at 60 Hz, as `_readKickBand` would read it: four-on-the-floor kicks (RMS
 * jumps to 0.42, decays in ~0.12 s) over a plucked eighth-note bassline (0.09, every eighth), a noise floor, and the
 * level normalised against an 8 s half-life peak. `sections` = [[seconds, withKicks], ...].
 */
function kickBandFrames(sections, bpm = 124) {
    const frames = [];
    const beat = 60 / bpm, dt = 1 / 60;
    let t = 0, peak = 1e-3;
    for (const [seconds, kicks] of sections) {
        const end = t + seconds;
        for (; t < end; t += dt) {
            const sinceKick = t % beat, sinceEighth = t % (beat / 2);
            let raw = 0.02 + 0.09 * Math.exp(-sinceEighth / 0.08);
            if (kicks) raw += 0.42 * Math.exp(-sinceKick / 0.12);
            peak = Math.max(raw, peak * Math.pow(0.5, dt / 8));
            frames.push({ t, now: 1000 + t * 1000, low: raw / peak, raw, kicks });
        }
    }
    return frames;
}

test('the kick detector takes kicks, not the bassline, through a groove, a long kick-less breakdown and back', () => {
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: makeBabylonStub() });
    const vj = new window.VJDirector({ vjBPM: 128 });
    const frames = kickBandFrames([[32, true], [24, false], [16, true]]);
    let groove = 0, breakdown = 0, back = 0, firstBack = null;
    for (const f of frames) {
        const before = vj.realOnsetCount;
        vj._detectKick(f.low, f.raw, f.now);
        if (vj.realOnsetCount === before) continue;
        if (f.t < 32) groove++;
        else if (f.t < 56) breakdown++;
        else { back++; if (firstBack === null) firstBack = f.t; }
    }
    const kicksInGroove = Math.ceil(32 * 124 / 60);
    assert.ok(groove >= kicksInGroove - 3 && groove <= kicksInGroove, `groove: ${groove} onsets for ${kicksInGroove} kicks`);
    // 24 s without a kick: the normalising peak has decayed to a sixth, so the bassline alone reaches full scale.
    // Only the raw reference keeps it out.
    assert.equal(breakdown, 0, 'the bassline must not be read as kicks in a breakdown');
    assert.ok(firstBack !== null && firstBack - 56 < 2 * 60 / 124 + 0.05, 'the returning kick must be caught within two beats');
    assert.ok(back >= Math.ceil(16 * 124 / 60) - 3, `after the breakdown: ${back} onsets`);
    assert.ok(Math.abs(vj.bpm - 124) < 2, `tempo read as ${vj.bpm}`);
});

test('the beat envelope is punched at most 2.5 times a second, however fast the track', () => {
    let clock = 0;
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: makeBabylonStub(), performance: { now: () => clock } });
    const vj = new window.VJDirector({ vjBPM: 128 });
    const gapMs = window.VJDirector.MIN_PUNCH_GAP_MS;
    assert.ok(gapMs >= 1000 / 3, 'the punch gap must stay under three a second');
    for (const bpm of [120, 150, 174, 200]) {
        const punches = [];
        for (let i = 0; i < 40; i++) {
            clock += 60000 / bpm;
            vj.beatEnvelope = 0;
            vj._registerBeat(clock, false);
            if (vj.beatEnvelope === 1) punches.push(clock);
        }
        for (let i = 1; i < punches.length; i++) {
            assert.ok(punches[i] - punches[i - 1] >= gapMs, `${bpm} BPM: punches ${punches[i] - punches[i - 1]} ms apart`);
        }
        // At or under 150 BPM every kick still punches.
        if (bpm <= 150) assert.equal(punches.length, 40, `${bpm} BPM must punch every beat`);
        else assert.ok(punches.length >= 18, `${bpm} BPM must still punch every other beat`);
        clock += 2000;
    }
});

test('the kick band reads a breakdown as low energy and the drop as high, and starts over after silence', () => {
    let now = 0;
    const h = createAudioHarness({ performance: { now: () => now } });
    const club = h.club;
    let level = 0;
    club.kickSamples = new Float32Array(512);
    club.kickAnalyser = { getFloatTimeDomainData: (out) => { for (let i = 0; i < out.length; i++) out[i] = (i % 2 ? 1 : -1) * level; } };
    const frame = { hasAudio: true };
    // Groove: a kick every 0.48 s; breakdown: a quiet pad; drop: kicks again, louder.
    const run = (seconds, fn) => {
        const out = [];
        for (let t = 0; t < seconds; t += 1 / 60) { now += 1000 / 60; level = fn(t); club._readKickBand(frame, now); out.push(frame.energy); }
        return out;
    };
    const kick = (amp) => (t) => 0.03 + amp * Math.exp(-(t % 0.484) / 0.12);
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const groove = run(40, kick(0.4)).slice(-600);
    const breakdown = run(12, () => 0.03).slice(-300);
    const drop = run(8, kick(0.5)).slice(-240);
    assert.ok(mean(groove) > 0.35 && mean(groove) < 0.8, `groove energy ${mean(groove)}`);
    assert.ok(mean(breakdown) < 0.2, `breakdown energy ${mean(breakdown)}`);
    assert.ok(mean(drop) > mean(groove) + 0.15, `drop ${mean(drop)} vs groove ${mean(groove)}`);
    assert.ok(frame.low >= 0 && frame.low <= 1, 'the normalised level stays in 0..1');
    // Three seconds of silence, then a new quiet track: it is its own reference, not a breakdown of the last one.
    run(3, () => 0);
    const next = run(4, kick(0.1)).slice(-120);
    assert.ok(mean(next) > 0.35, `a quieter new track must not read as a breakdown (${mean(next)})`);
    // No kick analyser (an old browser): the fields say so and the legacy detector keeps the beat.
    const bare = { hasAudio: true };
    club.kickAnalyser = null;
    club._readKickBand(bare, now);
    assert.equal(bare.low, null);
    assert.equal(bare.energy, null);
});

test('the kick band catches the same kicks at 60, 30, 20 and 12 frames a second', () => {
    // A continuous waveform under 120 Hz, as the kick analyser holds it: 124 BPM kicks (a 55 Hz thump) over a plucked
    // eighth-note bassline. Reading only the newest ~11 ms once per rendered frame caught 99% of a real set's beats
    // at 60 fps, 23% at 30 fps and none at 12 fps, and the crowd stood still whenever the room was heavy to draw.
    const rate = 48000, seconds = 30, bpm = 124, beat = 60 / bpm;
    const wave = new Float32Array(Math.ceil((seconds + 1) * rate));
    for (let n = 0; n < wave.length; n++) {
        const t = n / rate;
        const kick = 0.5 * Math.exp(-(t % beat) / 0.12) * Math.sin(2 * Math.PI * 55 * t);
        const bass = 0.12 * Math.exp(-(t % (beat / 2)) / 0.08) * Math.sin(2 * Math.PI * 110 * t);
        wave[n] = kick + bass + 0.01 * Math.sin(2 * Math.PI * 40 * t);
    }
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: makeBabylonStub() });
    const kicks = Math.floor(seconds / beat);
    for (const fps of [60, 30, 20, 12]) {
        const club = createAudioHarness().club;
        const ctx = { sampleRate: rate, currentTime: 0, state: 'running' };
        club.audioContext = ctx;
        club.kickSamples = new Float32Array(8192);
        club.kickAnalyser = {
            getFloatTimeDomainData(out) {
                const end = Math.round(ctx.currentTime * rate);
                for (let i = 0; i < out.length; i++) { const n = end - out.length + i; out[i] = n >= 0 ? wave[n] : 0; }
            }
        };
        const vj = new window.VJDirector({ vjBPM: 128 });
        const frame = { hasAudio: true };
        for (let now = 0; now < seconds * 1000; now += 1000 / fps) {
            ctx.currentTime = now / 1000;
            club._readKickBand(frame, now);
            vj._detectOnset(frame, now);
        }
        assert.ok(vj.realOnsetCount >= kicks - 4 && vj.realOnsetCount <= kicks + 1,
            `${fps} fps: ${vj.realOnsetCount} onsets for ${kicks} kicks`);
        assert.ok(Math.abs(vj.bpm - bpm) < 3, `${fps} fps: tempo read as ${vj.bpm}`);
    }
});

test('with a trusted kick the rig dips deeper between kicks, but not under Photosensitive Safe Mode', () => {
    const { window } = loadClassic('js/showDirector.js');
    const between = (audioData, safe) => {
        const club = { vjManualMode: false, photosensitiveSafeMode: safe, vjDirector: { paletteMode: 'analogous' } };
        const director = new window.ShowDirector(club);
        director._cue = { look: 'detonation', bars: 4 };
        director._cueStartBar = 0;
        director._barCounter = 0;
        director._beatInBar = 0;
        director._intensity = 0;
        director._applyContinuous({ beatEnvelope: 0, blackoutUntil: 0 }, audioData);
        return club.masterIntensity;
    };
    const kickBand = { hasAudio: true, low: 0.2, energy: 0.5 };
    const legacy = { hasAudio: true };
    assert.ok(between(kickBand, false) < between(legacy, false) * 0.8, 'the kick band must deepen the breath');
    assert.equal(between(kickBand, true), between(legacy, true), 'Safe Mode keeps the shallow breath');
});

function loadDJPerformer(seed = 7) {
    const { window } = loadClassic('js/djPerformer.js');
    let s = seed;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const desk = { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    const dj = new window.DJPerformer({ x: 0, z: -19.1, groundY: 0.5, eyeHeight: 1.65, desk, rng });
    return { dj, desk, DJPerformer: window.DJPerformer };
}

/** Run the performer at 60 Hz on a 124 BPM grid; `each(frame)` may change the music or visitors. */
function perform(dj, seconds, { energy = 0.5, hasAudio = true, visitors = null, each = null, t0 = 0 } = {}) {
    const music = { hasAudio, beatPhase: 0, bar: 0, energy, drop: false, bpm: 124 };
    const frames = [];
    for (let t = t0; t < t0 + seconds; t += 1 / 60) {
        const beats = t * 124 / 60;
        music.beatPhase = beats % 1;
        music.bar = Math.floor(beats / 4);
        music.drop = false;
        if (each) each(music, t);
        const pose = dj.update(1 / 60, music, visitors);
        frames.push({ t, bar: music.bar, activity: dj.activity, pitch: pose.headPitch, eyeY: pose.eyeY, leftY: pose.left.y, rightY: pose.right.y, pose });
    }
    return frames;
}

test('the DJ changes what they are doing only on bar lines, and does more than one thing', () => {
    const { dj } = loadDJPerformer();
    const frames = perform(dj, 120);
    const seen = new Set();
    for (let i = 1; i < frames.length; i++) {
        seen.add(frames[i].activity);
        if (frames[i].activity !== frames[i - 1].activity) {
            assert.notEqual(frames[i].bar, frames[i - 1].bar, `changed to ${frames[i].activity} mid-bar at ${frames[i].t.toFixed(2)} s`);
        }
    }
    for (const a of ['mix', 'cue', 'tweak', 'crowd']) assert.ok(seen.has(a), `never did ${a} in two minutes`);
    assert.ok(!seen.has('wave'), 'nobody came by, so nobody was waved at');
    // Same pose object every frame: nothing allocated per frame.
    assert.ok(frames.every(f => f.pose === frames[0].pose));
    assert.ok(frames.every(f => Number.isFinite(f.pitch) && Number.isFinite(f.pose.left.y) && Number.isFinite(f.pose.right.z)));
});

test('the DJ puts their hands up on the drop, and works the controller while mixing', () => {
    const { dj, desk } = loadDJPerformer();
    dj._begin('mix', 99);
    const mixing = perform(dj, 3);
    const p = mixing[mixing.length - 1].pose;
    for (const hand of [p.left, p.right]) {
        assert.ok(Math.abs(hand.y - (desk.top + 0.035)) < 0.02, `hand at y ${hand.y}, not on the controller`);
        assert.ok(hand.z > desk.near && hand.z < desk.far, `hand at z ${hand.z}, off the controller`);
        assert.ok(Math.abs(hand.x - desk.cx) < desk.halfWidth, `hand at x ${hand.x}, off the controller`);
    }
    let dropAt = null;
    const frames = perform(dj, 6, { t0: 3, each: (music, t) => { if (dropAt === null && t > 4) { music.drop = true; dropAt = t; } } });
    const at = frames.findIndex(f => f.t >= dropAt);
    assert.equal(frames[at].activity, 'handsUp', 'a drop puts the hands up at once');
    const up = frames[Math.min(frames.length - 1, at + 50)];
    assert.ok(up.leftY > up.eyeY && up.rightY > up.eyeY, 'both hands above the head');
    assert.notEqual(frames[frames.length - 1].activity, 'handsUp', 'and down again a couple of bars later');
    // Without music there is no drop to react to.
    const { dj: quiet } = loadDJPerformer();
    perform(quiet, 2, { hasAudio: false, each: (music) => { music.drop = true; } });
    assert.notEqual(quiet.activity, 'handsUp');
});

test('the DJ waves at someone who walks up to the booth, once, and looks their way', () => {
    const { dj, DJPerformer } = loadDJPerformer();
    const guest = { x: 2.5, z: -6, id: 'guest' };            // far back on the floor
    const visitors = [guest];
    let waves = 0, last = dj.activity;
    const count = (frames) => { for (const f of frames) { if (f.activity === 'wave' && last !== 'wave') waves++; last = f.activity; } };
    count(perform(dj, 4, { visitors }));
    assert.equal(waves, 0, 'nobody near the booth yet');
    guest.z = -15;                                            // walks up to the front of the booth
    const frames = perform(dj, 3, { visitors, t0: 4 });
    count(frames);
    assert.equal(waves, 1, 'waves as they arrive');
    assert.ok(dj.headYaw > 0.2, `looks toward the guest (head yaw ${dj.headYaw})`);
    assert.ok(frames[60].rightY > frames[60].eyeY, 'with a raised hand');
    guest.z = -6; count(perform(dj, 5, { visitors, t0: 7 }));
    guest.z = -15; count(perform(dj, 5, { visitors, t0: 12 }));
    assert.equal(waves, 1, `not again within ${DJPerformer.WAVE_COOLDOWN} s`);
    guest.z = -6; count(perform(dj, DJPerformer.WAVE_COOLDOWN, { visitors, t0: 17 }));
    guest.z = -15; count(perform(dj, 3, { visitors, t0: 17 + DJPerformer.WAVE_COOLDOWN }));
    assert.equal(waves, 2, 'but again after the cool-down');
});

test('the DJ nods and bounces on the beat, deeper when the music is louder', () => {
    const swing = (energy, key) => {
        const { dj } = loadDJPerformer();
        dj._begin('mix', 99);
        const frames = perform(dj, 6, { energy }).slice(-120);
        const values = frames.map(f => f[key]);
        // The nod peaks on the beat: compare the frames nearest the beat with those half a beat later.
        return Math.max(...values) - Math.min(...values);
    };
    assert.ok(swing(0.9, 'pitch') > swing(0.1, 'pitch') * 2, 'nod depth must grow with energy');
    assert.ok(swing(0.9, 'eyeY') > swing(0.1, 'eyeY') * 2, 'knee bounce must grow with energy');
    const { dj } = loadDJPerformer();
    dj._begin('mix', 99);
    const frames = perform(dj, 4, { energy: 0.8 });
    const onBeat = frames.filter(f => (f.t * 124 / 60) % 1 < 0.04).slice(-4);
    const offBeat = frames.filter(f => Math.abs((f.t * 124 / 60) % 1 - 0.5) < 0.04).slice(-4);
    assert.ok(Math.max(...onBeat.map(f => f.eyeY)) < Math.min(...offBeat.map(f => f.eyeY)), 'down on the beat, up between');
});

// ---------------------------------------------------------------------------
// The street door: the bouncer and the queue
// ---------------------------------------------------------------------------

test('the bouncer stands beside the street door and the queue waits behind the rope, on the pavement, facing the door', () => {
    const BABYLON = makeBabylonStub();
    const L = loadClassic('js/cityDistrict.js').window.CityLayout;
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    window.CityLayout = L;
    const Crowd = window.VRClubAudioCrowd;
    const { bouncer, queue } = Crowd.prototype._streetSlots.call({});
    const clipsOf = file => new Set(readGlbJson(`js/models/avatars/${file}`).animations.map(animation => animation.name));
    const all = [bouncer, ...queue];
    for (const [index, slot] of all.entries()) {
        const file = Crowd.AVATAR_SOURCES[slot.src].url.split('/').pop();
        assert.ok(clipsOf(file).has(slot.clip), `${file} has no "${slot.clip}"`);
        assert.equal(slot.y, L.groundY, 'everyone stands on the pavement, at street level');
        assert.ok(slot.z > L.doorZ + 0.35 && slot.z < L.ropeZ - 0.3, `slot ${index} is not between the facade and the rope`);
        assert.ok(Math.abs(slot.x) > L.doorHalfWidth + 0.3, `slot ${index} stands in the street door`);
        assert.ok(slot.height > 1.5 && slot.height < 2.0 && Number.isFinite(slot.yaw));
    }
    assert.equal(Crowd.AVATAR_SOURCES[bouncer.src].id, 'bouncer');
    assert.equal(bouncer.clip, 'Idle_Loop', 'the bouncer must use a neutral idle pose');
    assert.equal(queue.filter(slot => slot.clip === 'Idle_TalkingPhone_Loop').length, 1,
        'exactly one person in the outside queue should be on a phone');
    assert.ok(bouncer.x < L.ropeFromX && bouncer.height >= Math.max(...queue.map(slot => slot.height)), 'the bouncer is outside the rope and the biggest');
    for (const slot of queue) {
        assert.ok(slot.x > L.ropeFromX + 0.25 && slot.x < L.ropeToX - 0.25, 'a queue slot is outside the rope line');
        if (slot.clip === 'Idle_Talking_Loop') {
            // A talking pair faces each other.
            const partner = queue.find(other => other !== slot && other.clip === slot.clip && Math.hypot(other.x - slot.x, other.z - slot.z) < 1.2);
            assert.ok(partner, 'someone talks to nobody');
            assert.ok(Math.abs(Math.atan2(Math.sin(slot.yaw - Math.atan2(partner.x - slot.x, partner.z - slot.z)), Math.cos(slot.yaw - Math.atan2(partner.x - slot.x, partner.z - slot.z)))) < 0.1,
                'a talking pair does not face each other');
        } else {
            assert.ok(Math.sin(slot.yaw) < -0.6, `someone in the queue is not facing the door (yaw ${slot.yaw.toFixed(2)})`);
        }
    }
    for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
            assert.ok(Math.hypot(all[a].x - all[b].x, all[a].z - all[b].z) >= 0.6, `street slots ${a} and ${b} overlap`);
        }
    }
    // The queue's length follows the tier, and a short queue holds nobody who dances inside on that tier.
    const tiers = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    const sizes = [...tiers.matchAll(/queueSize:\s*(\d+)/g)].map(match => Number(match[1]));
    assert.equal(sizes.length, 3, 'every graphics tier must set queueSize');
    assert.ok(sizes.every(size => size <= queue.length) && sizes[0] >= sizes[1] && sizes[1] >= sizes[2] && sizes[2] >= 3);
    const ids = slots => slots.map(slot => Crowd.AVATAR_SOURCES[slot.src].id);
    const balancedQueue = ids(queue.slice(0, sizes[2]));
    assert.equal(new Set(balancedQueue).size, balancedQueue.length, 'the queue repeats a person');
    const balancedInside = ids(Crowd.prototype._guestSlots.call({}).slice(0, 2));
    for (const id of ['f1', 'm2', 'hipHop', 'm1', 'f3', 'f2']) balancedInside.push(id);
    assert.deepEqual([...balancedQueue.filter(id => balancedInside.includes(id))], [], 'a balanced queue shows someone who is also inside');
});

function streetCrowdHarness() {
    const BABYLON = makeBabylonStub();
    BABYLON.Vector3 = class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } };
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    window.CityLayout = loadClassic('js/cityDistrict.js').window.CityLayout;
    const Crowd = window.VRClubAudioCrowd;
    const requested = [], spawned = [], lit = [];
    const club = Object.assign(Object.create(Crowd.prototype), {
        tierSettings: { queueSize: 2 }, npcAvatars: [], _disposed: false, _cityVisible: true,
        _crowdSourceContainers: new Array(Crowd.AVATAR_SOURCES.length), _crowdSourcePending: {},
        _streetDoorLight: { name: 'door' }, _cityFillLight: { name: 'fill' },
        _loadAvatarSource(url) { requested.push(url.split('/').pop()); return Promise.resolve({ url }); },
        _extendAccentLight(light, meshes) { lit.push([light.name, meshes.length]); },
        _refreshContactShadows() {}
    });
    club._spawnAvatar = function (source, name, position, yaw) {
        const state = { enabled: true, colliderEnabled: true, paused: false };
        // Babylon's AnimationGroup: isPlaying, pause(), restart() (there is no isPaused).
        const group = { get isPlaying() { return !state.paused; }, pause() { state.paused = true; }, restart() { state.paused = false; } };
        const npc = {
            name, state, meshes: [{}], animations: [group],
            root: { position, rotation: { y: yaw }, isEnabled: () => state.enabled, setEnabled: v => { state.enabled = v; } },
            collider: { setEnabled: v => { state.colliderEnabled = v; } }
        };
        spawned.push([name, source.url.split('/').pop()]);
        this.npcAvatars.push(npc);
        return {};
    };
    return { club, requested, spawned, lit };
}

test('the street people wait for the street, load their files once in the background, then hide and show with it', async () => {
    const { club, requested, spawned, lit } = streetCrowdHarness();
    club._applyStreetPeople();
    assert.deepEqual(requested, [], 'nothing outside before the street has loaded');
    club._cityRoot = {};
    club._applyStreetPeople();
    club._applyStreetPeople();
    await club._streetTopUp;
    assert.deepEqual(requested.sort(), ['club-crowd-bouncer.glb', 'club-crowd-f8.glb', 'club-crowd-m8.glb'], 'each file is fetched once');
    assert.deepEqual(spawned.map(item => item[0]), ['bouncer', 'queue0', 'queue1']);
    assert.ok(lit.length === 6 && lit.every(([, count]) => count === 1), 'everyone outside takes the door lamp and the street fill');
    assert.equal(club._bouncer.name, 'bouncer');

    // Deep in the club the street is hidden: so are they, with their animations paused and their colliders off.
    club._showStreetPeople(false);
    assert.ok(club.npcAvatars.every(npc => !npc.state.enabled && !npc.state.colliderEnabled && npc.state.paused));
    club._showStreetPeople(true);
    assert.ok(club.npcAvatars.every(npc => npc.state.enabled && npc.state.colliderEnabled && !npc.state.paused));

    // A higher tier lengthens the queue (loading only the new person); a lower one shortens it again.
    club.tierSettings.queueSize = 3;
    club._applyStreetPeople();
    await club._streetTopUp;
    assert.deepEqual(spawned.map(item => item[0]), ['bouncer', 'queue0', 'queue1', 'queue2']);
    assert.equal(requested.length, 4);
    club.tierSettings.queueSize = 1;
    club._showStreetPeople(true);
    assert.deepEqual(club.npcAvatars.filter(npc => npc.state.enabled).map(npc => npc.name), ['bouncer', 'queue0']);
});

test('the bouncer watches whoever comes close, never turning his back on the street, and looks away again', () => {
    const { club } = streetCrowdHarness();
    const root = { position: { x: 2.25, y: 2.8, z: 6.85 }, rotation: { y: 0.35 }, isEnabled: () => true };
    club._bouncer = { root, streetYaw: 0.35 };
    const player = { x: 0, y: 4.5, z: 12 };
    club._playerCamera = () => ({ globalPosition: player });
    const settle = () => { for (let i = 0; i < 240; i++) club._updateBouncer(1 / 60); return root.rotation.y; };
    // In front of him, toward the road: he looks straight at them.
    const toward = Math.atan2(player.x - 2.25, player.z - 6.85);
    assert.ok(Math.abs(settle() - toward) < 0.02, 'he does not look at someone in front of him');
    // Right behind him, in the doorway: he turns as far as he can, but no further.
    player.x = 2.3; player.z = 5.2;
    const turned = settle();
    assert.ok(Math.abs(Math.abs(turned - 0.35) - 1.3) < 0.02, `he turned ${(turned - 0.35).toFixed(2)} rad`);
    // Far away, or in the club below: he goes back to watching the street.
    player.x = 0; player.z = -12; player.y = 1.7;
    assert.ok(Math.abs(settle() - 0.35) < 0.02);
    // Gradually: one frame is a small step, at any refresh rate.
    player.x = 6; player.z = 8; player.y = 4.5;
    root.rotation.y = 0.35;
    club._updateBouncer(1 / 60);
    assert.ok(Math.abs(root.rotation.y - 0.35) < 0.1, 'he snapped round');
});

test('a character hidden and shown again dances again: clips pause and restart through AnimationGroup.isPlaying', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const proto = window.VRClubAudioCrowd.prototype;
    // A Babylon 9 AnimationGroup: `isPlaying`, and no `isPaused` at all.
    const group = () => {
        const g = { _paused: false, get isPlaying() { return !this._paused; }, pause() { this._paused = true; }, restart() { this._paused = false; } };
        return g;
    };
    const npc = name => ({ name, animations: [group()], root: { setEnabled() {} }, collider: { setEnabled() {} } });
    const npcs = [npc('dancer0'), npc('dancer1')];
    const club = { npcAvatars: npcs, tierSettings: { crowdSize: 1, guestSize: 0 }, _spawnCrowdTo() {}, _spawnGuestsTo() {}, _refreshContactShadows() {}, _topUpCrowdSources() {}, isPeopleVisible: proto.isPeopleVisible };
    proto._applyCrowdSize.call(club);
    assert.equal(npcs[1].animations[0].isPlaying, false, 'a hidden dancer keeps animating');
    club.tierSettings.crowdSize = 2;
    proto._applyCrowdSize.call(club);
    assert.equal(npcs[1].animations[0].isPlaying, true, 'a dancer shown again stays frozen');
    assert.equal(npcs[0].animations[0].isPlaying, true);
});

test('enabled crowd clips never pause off-screen or slow below their authored speed', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const Crowd = window.VRClubAudioCrowd;
    const group = {
        speedRatio: 0,
        pauses: 0,
        restarts: 0,
        pause() { this.pauses++; },
        restart() { this.restarts++; }
    };
    const npc = {
        animations: [group],
        baseSpeed: 0.9,
        reactsToBeat: true,
        root: {
            position: { x: 100, z: 100 },
            rotation: { y: 0 },
            isEnabled: () => true
        },
        homeYaw: 0,
        avoidYaw: 0
    };
    const club = Object.assign(Object.create(Crowd.prototype), {
        npcAvatars: [npc],
        _npcBeatBoost: 0.45,
        _crowdBeatPresent: false,
        frameCounter: 4,
        scene: {
            activeCamera: {
                globalPosition: { x: 0, z: 0 },
                isInFrustum() { throw new Error('animated hierarchy frustum bounds must not control playback'); }
            }
        }
    });

    club.updateDancingNPCs(0, { hasAudio: false, bass: 0 });
    assert.equal(group.speedRatio, npc.baseSpeed, 'a missing kick slows an authored dance clip');
    assert.equal(group.pauses, 0, 'an enabled distant dancer was paused');
    assert.equal(group.restarts, 0, 'an enabled dancer was needlessly restarted');

    club.updateDancingNPCs(0, { hasAudio: true, bass: 0.8 });
    assert.ok(group.speedRatio > npc.baseSpeed, 'the low-end lift no longer reaches authored dance clips');
    club.updateDancingNPCs(0, { hasAudio: false, bass: 0 });
    assert.equal(group.speedRatio, npc.baseSpeed, 'an authored clip did not return to its normal pace');
});

test('a late character load puts back the light budgets the glTF loader raised, and touches nothing else', () => {
    const BABYLON = makeBabylonStub();
    BABYLON.Material = { ...BABYLON.Material, LightDirtyFlag: 2 };
    const { window } = loadClassic('js/club/11-audio-crowd.js', { BABYLON, VRClubUI: class {} });
    const proto = window.VRClubAudioCrowd.prototype;
    const material = (name, lights, extra = {}) => ({ name, maxSimultaneousLights: lights, dirty: 0, isFrozen: false, markAsDirty() { this.dirty++; }, unfreeze() { this.isFrozen = false; }, ...extra });
    // The loader set every material to the scene's light count (14) as its last step.
    const raised = material('brick', 14), frozen = material('truss', 14, { isFrozen: true }), fine = material('floor', 3);
    const unlit = material('sky', 14, { disableLighting: true });
    const scene = { materials: [raised, frozen, fine, unlit], blockMaterialDirtyMechanism: true };
    proto._restoreLightBudgets.call({ scene, maxLights: 3 });
    assert.equal(raised.maxSimultaneousLights, 3);
    assert.equal(frozen.maxSimultaneousLights, 3);
    assert.equal(frozen.isFrozen, false, 'a frozen lit material would keep its stale shader');
    assert.equal(raised.dirty, 1);
    assert.equal(fine.dirty, 0, 'an untouched material must not be recompiled');
    assert.equal(unlit.maxSimultaneousLights, 14, 'unlit materials have no light budget to fix');
    assert.equal(scene.blockMaterialDirtyMechanism, true, 'the dirty mechanism is restored as it was');
});

// ---------------------------------------------------------------------------
// The crowd's choreographer (js/crowdDance.js)
// ---------------------------------------------------------------------------

function loadCrowdDance(seed = 11) {
    const { window } = loadClassic('js/crowdDance.js');
    let s = seed;
    const rng = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    return { CrowdDance: window.CrowdDance, choreographer: new window.CrowdDance({ rng }), rng };
}
const ALL_MOVES = ['Dance_Loop', 'Groove_Bounce', 'Groove_SideTap', 'Groove_Clap', 'Groove_Pump', 'Groove_Twist', 'Groove_HandsUp', 'Groove_Sway'];

/**
 * Play a dancer like the club does: the clip advances at the speed the choreographer asks for (a loop is beats x 0.5 s at
 * speed 1), the music advances at `bpm`. `each(music, t)` may change the music. Returns per-frame records.
 */
function playDancer(CrowdDance, choreographer, dancer, { seconds = 20, bpm = 124, music: base = {}, each = null, fps = 72 } = {}) {
    const music = { beatPresent: true, beat: 0, bpm, energy: 0.6, build: false, drop: false, ...base };
    let frac = null, move = null;
    const out = {}, frames = [];
    for (let t = 0; t < seconds; t += 1 / fps) {
        music.beat = t * music.bpm / 60;
        music.drop = false;
        if (each) each(music, t);
        const d = choreographer.step(dancer, music, frac, out);
        if (d.switched || d.snap || move !== d.move) { frac = d.frac; move = d.move; }
        frames.push({ t, beat: music.beat, move, frac, half: dancer.half, switched: d.switched, present: music.beatPresent });
        const beats = CrowdDance.MOVES[move].beats;
        frac = (frac + (1 / fps) * d.speed / (beats * 0.5)) % 1;
    }
    return frames;
}

test('every move the choreographer knows is in the dancers\' files, as long as it says', () => {
    const { CrowdDance } = loadCrowdDance();
    assert.deepEqual(Object.keys(CrowdDance.MOVES).sort(), [...ALL_MOVES].sort());
    for (const file of ['club-crowd-f1.glb', 'club-crowd-m7.glb']) {
        const json = readGlbJson(`js/models/avatars/${file}`);
        for (const [name, meta] of Object.entries(CrowdDance.MOVES)) {
            const animation = json.animations.find(a => a.name === name);
            assert.ok(animation, `${file} has no ${name}`);
            const duration = Math.max(...animation.channels.map(c => json.accessors[animation.samplers[c.sampler].input].max[0]));
            assert.ok(Math.abs(duration - meta.beats * 60 / CrowdDance.CLIP_BPM) < 0.02, `${file} ${name}: ${duration} s is not ${meta.beats} beats`);
        }
    }
});

test('dancers lock onto the beat: claps land on it, at any tempo, from any starting point', () => {
    for (const bpm of [96, 124, 140]) {
        const { CrowdDance, choreographer } = loadCrowdDance(bpm);
        const dancer = choreographer.createDancer(ALL_MOVES);
        dancer.move = 'Groove_Clap'; dancer.hadBeat = true; dancer.barsLeft = 999; dancer.lastBar = 0; dancer.half = false;
        // Start a third of a beat off.
        const frames = playDancer(CrowdDance, choreographer, dancer, { seconds: 8, bpm, each: (m, t) => { if (t === 0) m.beat = 0; } });
        const late = frames.filter(f => f.beat > 4);
        for (const f of late) {
            // The clap loop is 2 beats with a clap at 0 and 0.5 of it: where the clip is should match the beat.
            const want = (f.beat % 2) / 2;
            const err = Math.abs(CrowdDance.wrapHalf(f.frac - want)) * 2;
            assert.ok(err < 0.04, `${bpm} BPM: the clap is ${err.toFixed(3)} beats off at beat ${f.beat.toFixed(2)}`);
        }
    }
    // Pulled off the grid (a stall), it comes back within two beats without a jump.
    const { CrowdDance, choreographer } = loadCrowdDance(3);
    const dancer = choreographer.createDancer(ALL_MOVES);
    const out = {};
    dancer.move = 'Groove_Bounce'; dancer.hadBeat = true; dancer.barsLeft = 999; dancer.lastBar = 0;
    const d = choreographer.step(dancer, { beatPresent: true, beat: 10, bpm: 120, energy: 0.5 }, CrowdDance.wrap01(10 / 2 + 0.2), out);
    assert.equal(d.snap, false);
    assert.ok(d.speed < 1, 'ahead of the beat it slows down');
    const far = choreographer.step(dancer, { beatPresent: true, beat: 10, bpm: 120, energy: 0.5 }, CrowdDance.wrap01(10 / 2 + 0.45), out);
    assert.equal(far.snap, true, 'nearly a beat off it jumps rather than drifting for bars');
});

test('Dance_Loop dips on the beat, and a half-time clap lands on 2 and 4', () => {
    const { CrowdDance, choreographer } = loadCrowdDance(5);
    const out = {};
    const dancer = choreographer.createDancer(ALL_MOVES);
    dancer.move = 'Dance_Loop'; dancer.hadBeat = true; dancer.barsLeft = 999; dancer.lastBar = 0; dancer.half = false;
    for (const beat of [8, 9, 10, 11]) {
        const d = choreographer.step(dancer, { beatPresent: true, beat, bpm: 120, energy: 0.5 }, null, out);
        // Its dips are at 0.25 and 0.75 of the loop.
        assert.ok(Math.abs(CrowdDance.wrapHalf(d.frac * 2 - 0.5)) < 1e-9, `beat ${beat}: not on a dip (${d.frac})`);
    }
    dancer.move = 'Groove_Clap'; dancer.half = true;
    const clapAt = beat => {
        const d = choreographer.step(dancer, { beatPresent: true, beat, bpm: 120, energy: 0.5 }, null, out);
        return Math.abs(CrowdDance.wrapHalf(d.frac * 2)) < 1e-9;   // a clap at 0 and 0.5 of the loop
    };
    assert.deepEqual([4, 5, 6, 7].map(clapAt), [false, true, false, true], 'half-time claps belong on the backbeat');
});

test('dancers change moves only on bar lines, and the floor is varied', () => {
    const { CrowdDance, choreographer } = loadCrowdDance(17);
    const dancers = Array.from({ length: 14 }, () => choreographer.createDancer(ALL_MOVES));
    const timelines = dancers.map(dancer => playDancer(CrowdDance, choreographer, dancer, { seconds: 90 }));
    for (const frames of timelines) {
        assert.ok(frames.every(f => !CrowdDance.MOVES[f.move].free),
            'a dancer chose the idle sway while a beat was present');
        for (let i = 1; i < frames.length; i++) {
            if (frames[i].move === frames[i - 1].move) continue;
            assert.notEqual(Math.floor(frames[i].beat / 4), Math.floor(frames[i - 1].beat / 4), `changed move mid-bar at beat ${frames[i].beat.toFixed(2)}`);
        }
    }
    // At any moment several different moves are on the floor, and over the minute every dancer does several.
    let distinct = 0, samples = 0;
    for (let i = 600; i < timelines[0].length; i += 300) {
        distinct += new Set(timelines.map(frames => frames[i].move)).size;
        samples++;
    }
    assert.ok(distinct / samples >= 4, `only ${(distinct / samples).toFixed(1)} different moves on the floor at a time`);
    for (const frames of timelines) assert.ok(new Set(frames.map(f => f.move)).size >= 3, 'a dancer does the same thing all night');
    assert.ok(timelines.some(frames => frames.some(f => f.move === 'Groove_Clap')), 'nobody ever claps');
    assert.ok(timelines.some(frames => frames.some(f => f.half)), 'nobody ever takes a move at half time');
});

test('when the kick goes every dancer keeps swaying off the grid, and dances again when it comes back', () => {
    const { CrowdDance, choreographer } = loadCrowdDance(23);
    const dancers = Array.from({ length: 200 }, () => choreographer.createDancer(ALL_MOVES));
    const gone = (m, t) => { m.beatPresent = !(t >= 20 && t < 35); };
    const timelines = dancers.map(dancer => playDancer(CrowdDance, choreographer, dancer, { seconds: 45, each: gone, fps: 30 }));
    for (const frames of timelines) {
        const quiet = frames.filter(f => !f.present);
        assert.ok(quiet.every(f => f.move === 'Groove_Sway'), 'a dancer stopped moving or kept dancing to a beat that is gone');
        assert.ok(frames.filter(f => f.present && f.t > 36).every(f => !CrowdDance.MOVES[f.move].free),
            'the kick came back and they kept standing about');
    }
    // Off the grid: the free pace is slow, and not the track's tempo.
    const out = {};
    const d = choreographer.step(dancers[0], { beatPresent: false, beat: 100, bpm: 128, energy: 0.2 }, 0.3, out);
    assert.equal(d.speed, CrowdDance.FREE_SPEED);
});

test('the crowd keeps a trusted beat through sparse audio frames and isolated missed kicks', () => {
    let clock = 10000;
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', {
        BABYLON, VRClubUI: class {}, performance: { now: () => clock },
        log: { info() {}, warn() {}, error() {} }
    });
    const club = Object.assign(Object.create(window.VRClubAudioCrowd.prototype), {
        barPhase: 0,
        vjDirector: {
            bpm: 120, beatNumber: 16, realOnsetCount: 2,
            lastRealOnsetAt: clock, onsetStreak: 2
        },
        showDirector: null
    });

    assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.5 }).beatPresent, true,
        'two fresh kicks establish the beat');
    clock += 100;
    assert.equal(club._crowdMusic({ hasAudio: false, energy: 0 }).beatPresent, true,
        'one sparse analyser frame dropped the whole floor to sway');
    clock = 13000; // six beats after the last real onset
    assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.5 }).beatPresent, true,
        'one or two missed kicks ended the dance before the show recognized a breakdown');
    clock = 13600; // beyond the seven-beat breakdown threshold
    assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.5 }).beatPresent, false,
        'a real kick-less passage never released the dancers from the grid');

    club.vjDirector.lastRealOnsetAt = clock;
    club.vjDirector.onsetStreak = 1;
    assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.5 }).beatPresent, false,
        'one stray kick was trusted as a returning beat');
    club.vjDirector.onsetStreak = 2;
    assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.5 }).beatPresent, true,
        'two returning kicks did not restart the dancing');
});

test('a build brings out the claps, and a drop puts the hands up', () => {
    const { choreographer } = loadCrowdDance(29);
    const share = (music, moves, drop = false) => {
        let hits = 0, n = 0;
        for (let i = 0; i < 400; i++) {
            const dancer = choreographer.createDancer(ALL_MOVES);
            dancer.move = 'Groove_Bounce'; dancer.hadBeat = true; dancer.lastBar = 0; dancer.barsLeft = 1;
            const d = choreographer.step(dancer, { beatPresent: true, beat: drop ? 1 : 4, bpm: 124, energy: 0.6, build: false, drop, ...music }, 0, {});
            if (moves.includes(d.move)) hits++;
            n++;
        }
        return hits / n;
    };
    const normalClaps = share({}, ['Groove_Clap']);
    assert.ok(share({ build: true }, ['Groove_Clap']) > 2 * normalClaps, 'a build does not bring claps');
    assert.ok(share({}, ['Groove_HandsUp', 'Groove_Pump'], true) > 0.5, 'a drop does not put the hands up');
    // A quiet track: little hands-up, but still a beat-driven dance rather than the free sway.
    assert.ok(share({ energy: 0.1 }, ['Groove_HandsUp']) < share({ energy: 0.9 }, ['Groove_HandsUp']));
    assert.equal(share({ energy: 0.1 }, ['Groove_Sway']), 0);
});
