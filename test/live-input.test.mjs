import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const { Event, EventTarget } = globalThis;

function setup(t, capture) {
    const listeners = new Set(), timers = new Map(), requests = [], publications = [];
    const track = new EventTarget();
    track.stop = () => { track.stopped = true; };
    track.getSettings = () => ({ channelCount: 2, sampleRate: 48000 });
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const node = () => ({ connect() {}, disconnect() { this.disconnected = true; },
        gain: { value: 0, setTargetAtTime(value) { this.value = value; } } });
    const mp = {
        connected: false, connecting: false, following: false, hasLiveEvent: false,
        accepted: true, listeners, client: { serverUrl: 'wss://relay.example', liveEventsSupported: true },
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        emit() { for (const fn of [...listeners]) fn(); },
        hasAcceptedOnlineSafety() { return this.accepted; },
        isHost() { return true; },
        _stopMusicBroadcast() { this.previousBroadcastDisconnected = true; },
        joinNewPrivateRoom() { this.connected = true; this.emit(); return true; },
        async manageLiveEvent() {
            this.liveEvent = { id: '842bc212-b941-48a1-bcf8-17172a7d47e5', canManage: true, live: false };
            this.hasLiveEvent = true;
            this.emit();
        },
        publisherInviteUrl() { return 'https://club.example/broadcast/#test-only-private-token'; }
    };
    const club = { multiplayer: mp, _audioVolume: 0.4,
        audioContext: { currentTime: 1, resume: async () => {}, createChannelSplitter: node,
            createAnalyser: () => ({ ...node(), getFloatTimeDomainData(buffer) { buffer.fill(0.25); } }) },
        isFollowingHost: () => mp.following, _ensureAudioContext() {},
        startNetworkMusic(input, state) {
            assert.equal(mp.previousBroadcastDisconnected, true, 'withdraw the previous file broadcast before wiring a private input');
            this.input = input; this.state = state;
            return this.remote = { source: node(), monitor: node() };
        },
        stopNetworkMusic(remote) { remote.stopped = true; }
    };
    class Publisher {
        constructor(options) { this.options = options; publications.push(this); }
        async connect() { this.connected = true; }
        async publish(input) { this.stream = input; }
        close() { this.closed = true; }
    }
    const window = new EventTarget();
    window.LiveAudioClient = Publisher;
    const context = vm.createContext({ window, URL, console, navigator: { mediaDevices: {
        async getUserMedia(options) { requests.push(options); return capture ? capture(stream) : stream; }
    } }, setInterval(fn) { timers.set(1, fn); return 1; }, clearInterval(id) { timers.delete(id); },
    setTimeout, clearTimeout });
    vm.runInContext(readFileSync(new URL('../js/liveInput.js', import.meta.url), 'utf8'), context);
    const input = club.liveInput = new window.LiveInput(club);
    t.after(() => input.dispose());
    return { input, club, mp, track, stream, requests, publications, timers, window, context };
}

test('local test analyses a real input without opening a room or publishing and monitoring starts muted', async t => {
    const h = setup(t);
    await h.input.start('mixer-device');
    assert.equal(h.requests[0].video, false);
    assert.equal(h.requests[0].audio.deviceId.exact, 'mixer-device');
    assert.equal(h.requests[0].audio.autoGainControl, false);
    assert.equal(h.mp.connected, false);
    assert.equal(h.publications.length, 0);
    assert.equal(h.club.state.localInput, true);
    assert.equal(h.input.remote.monitor.gain.value, 0);
    h.timers.get(1)();
    assert.equal(h.input.levels[0], 0.25);
    assert.match(h.input.status, /Only you/);
    h.input.setMonitoring(true);
    assert.equal(h.input.remote.monitor.gain.value, 0.4);
    h.input.setMonitoring(false);
    assert.equal(h.input.remote.monitor.gain.value, 0);
});

test('Go live explicitly creates a private session and publishes the already tested input once', async t => {
    const h = setup(t);
    await h.input.start();
    await h.input.goLive('My set');
    assert.equal(h.mp.connected, true);
    assert.equal(h.input.live, true);
    assert.equal(h.publications.length, 1);
    assert.equal(h.publications[0].stream, h.stream);
    assert.equal(h.requests.length, 1);
    assert.equal(h.input.retainsInputFor(h.mp.liveEvent), true);
    h.input.stopBroadcast();
    assert.equal(h.publications[0].closed, true);
    assert.equal(h.track.stopped, undefined);
    assert.equal(h.input.stream, h.stream);
});

test('private testing withdraws an existing room music publication before connecting the mixer', async t => {
    const h = setup(t);
    h.mp.connected = true;
    h.mp.client.musicStream = {};
    let withdrawn = false;
    h.mp.client.setLocalMusic = (stream, state) => {
        assert.equal(stream, null);
        assert.equal(state.playing, false);
        assert.equal(h.club.input, undefined);
        withdrawn = true;
    };
    await h.input.start();
    assert.equal(withdrawn, true);
    assert.equal(h.input.live, false);
    assert.equal(h.publications.length, 0);
});

test('the Online safety guide cannot be bypassed by Go live', async t => {
    const h = setup(t);
    await h.input.start();
    h.mp.accepted = false;
    await assert.rejects(h.input.goLive(), error => error.code === 'online-safety');
    assert.equal(h.mp.connected, false);
    assert.equal(h.publications.length, 0);
    assert.equal(h.input.stream, h.stream);
    assert.equal(h.input.goingLive, false);
});

test('stop while a permission prompt is pending releases the late track without creating an audio path', async t => {
    let permission;
    const h = setup(t, stream => new Promise(resolve => { permission = () => resolve(stream); }));
    const pending = h.input.start();
    await new Promise(resolve => setTimeout(resolve, 0));
    h.input.stop();
    permission();
    await pending;
    assert.equal(h.track.stopped, true);
    assert.equal(h.club.input, undefined);
    assert.equal(h.input.active, false);
});

test('permission failures have useful guidance and never claim to be testing or live', async t => {
    const h = setup(t, () => { const error = new Error('Denied'); error.name = 'NotAllowedError'; throw error; });
    await assert.rejects(h.input.start(), /Denied/);
    assert.match(h.input.status, /Allow microphone access/);
    assert.equal(h.input.active, false);
    assert.equal(h.input.live, false);
    assert.equal(h.publications.length, 0);
});

test('room loss stops publication but keeps a private test; joining somebody else stops the input', async t => {
    const h = setup(t);
    await h.input.start();
    await h.input.goLive();
    h.mp.connected = false; h.mp.hasLiveEvent = false; h.mp.liveEvent = null; h.mp.emit();
    assert.equal(h.input.publisher, null);
    assert.equal(h.input.stream, h.stream);
    assert.equal(h.track.stopped, undefined);
    h.mp.following = true; h.mp.emit();
    assert.equal(h.track.stopped, true);
    assert.equal(h.input.stream, null);
});

test('physical input loss and page exit clean up capture, meters, monitoring and publication', async t => {
    const h = setup(t);
    await h.input.start();
    await h.input.goLive();
    const remote = h.input.remote;
    h.track.dispatchEvent(new Event('ended'));
    assert.equal(remote.stopped, true);
    assert.equal(h.input.stream, null);
    assert.equal(h.input.publisher, null);
    assert.equal(h.timers.size, 0);
    assert.equal(h.input.signal, '');
    assert.equal(h.input.format, '');
    assert.match(h.input.status, /disconnected/);
    await h.input.start();
    h.window.dispatchEvent(new Event('pagehide'));
    assert.equal(h.input.active, false);
});

test('music transport cannot restart an old track over the mixer and VR can stop its own input in an event', t => {
    const h = setup(t);
    h.window.VRClubAnimationFinish = class {};
    vm.runInContext('var VRClubAnimationFinish = window.VRClubAnimationFinish;', h.context);
    vm.runInContext(readFileSync(new URL('../js/club/10-ui.js', import.meta.url), 'utf8'), h.context);
    const surface = new h.window.VRClubUI();
    let stopped = false, played = false;
    surface.multiplayer = { hasLiveEvent: true };
    surface.liveInput = { active: true, stop() { stopped = true; } };
    surface.audioElement = { src: 'https://example.com/old.mp3', play() { played = true; } };
    surface.showErrorMessage = () => {};
    assert.equal(surface.setAudioPlayback(true), false);
    assert.equal(played, false);
    assert.equal(surface._isVRButtonDisabled({ action: 'stop' }), false);
    assert.equal(surface._isVRButtonDisabled({ action: 'playPause' }), true);
    assert.equal(surface._vrQuickMenuButtonValue({ action: 'stop' }), 'STOP INPUT');
    assert.equal(surface.stopAudioPlayback(), true);
    assert.equal(stopped, true);
});

test('Live input Perform as DJ mode hides the NPC DJ, drives the player avatar with DJPerformer, and broadcasts booth hands to guests', async t => {
    const h = setup(t);
    const djTransitions = [];
    h.club.setPerformingAsDJ = (on, opts) => { djTransitions.push([on, !!opts?.moveCamera]); };
    await h.input.start();
    assert.deepEqual(djTransitions, [[true, true]], 'starting Live input puts the player avatar in the DJ booth by default');
    h.input.setPerformAsDJ(false);
    assert.deepEqual(djTransitions.at(-1), [false, false]);
    h.input.setPerformAsDJ(true);
    assert.deepEqual(djTransitions.at(-1), [true, true]);
    h.input.stop();
    assert.deepEqual(djTransitions.at(-1), [false, false], 'stopping Live input restores normal player mode');

    // Verify VRClub.setPerformingAsDJ + _updateDJ + updateNetworkPresence broadcast the DJPerformer pose and hands
    const ctx = vm.createContext({
        window: {}, console, Math, Number, Boolean, String, Object, Array, Map, Set, Float32Array, Float64Array, Uint8Array,
        BABYLON: { Vector3: class { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } } },
        VRClubEffects: class {},
        VRClubUI: class {}
    });
    ctx.window = ctx;
    vm.runInContext(readFileSync(new URL('../js/djPerformer.js', import.meta.url), 'utf8'), ctx);
    vm.runInContext(readFileSync(new URL('../js/club/07-animation-core.js', import.meta.url), 'utf8'), ctx);
    vm.runInContext(readFileSync(new URL('../js/club/11-audio-crowd.js', import.meta.url), 'utf8'), ctx);
    const sent = [];
    const npcRoot = { enabled: true, isEnabled() { return this.enabled; }, setEnabled(v) { this.enabled = v; } };
    const club = Object.assign(Object.create(ctx.window.VRClubAudioCrowd.prototype), {
        updateNetworkPresence: ctx.window.VRClubAnimationCore.prototype.updateNetworkPresence,
        isInVRMode: false,
        camera: { position: new ctx.BABYLON.Vector3(0, 1.7, -5), rotation: { y: 0 }, setTarget(t) { this.target = t; } },
        networkManager: { connected: true, capacity: 32, sendState: s => sent.push(JSON.parse(JSON.stringify(s))) },
        npcAvatars: [{ name: 'djPerformer', root: npcRoot, animations: [] }],
        isPeopleVisible: () => true,
        _refreshContactShadows() {},
        _unanalysedDanceMusic: () => null,
        _playerCamera() { return this.camera; },
        _bodyEyeHeight: () => 1.7,
        _shownBodyEye: () => 1.7
    });
    club.setPerformingAsDJ(true);
    assert.equal(club.performingAsDJ, true);
    assert.equal(npcRoot.enabled, false, 'resident NPC DJ is hidden while the player performs at the decks');
    assert.equal(club.camera.position.z, -14.8, 'desktop camera moves in front of the booth to watch the performance');
    club._updateDJ(1 / 60, { hasAudio: true, energy: 0.75 });
    assert.ok(club._selfDJPose && club._selfDJPose.left && club._selfDJPose.right, 'DJPerformer generates booth hand targets');
    club.updateNetworkPresence({ time: 1, dt: 1 / 60 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].floorY, 0.5, 'network presence places the DJ on the 0.5 m booth riser');
    assert.ok(sent[0].z < -18.5, 'network presence places the DJ behind the Pioneer console');
    assert.ok(sent[0].hands && sent[0].hands.left && sent[0].hands.right, 'network presence broadcasts live DJPerformer hands to guests');
    club.setPerformingAsDJ(false);
    assert.equal(npcRoot.enabled, true, 'resident NPC DJ returns when Perform as DJ is turned off');
});

test('AvatarRig resolves Ready Player Me / Tribe XR / Mixamo full-body and half-body skeletons', () => {
    const window = {};
    const Vector3 = class {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
        set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
        setAll(v) { this.x = v; this.y = v; this.z = v; return this; }
        copyFrom(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
        clone() { return new Vector3(this.x, this.y, this.z); }
        subtract(o) { return new Vector3(this.x - o.x, this.y - o.y, this.z - o.z); }
        lengthSquared() { return this.x * this.x + this.y * this.y + this.z * this.z; }
        normalize() {
            const l = Math.hypot(this.x, this.y, this.z) || 1;
            this.x /= l; this.y /= l; this.z /= l;
            return this;
        }
        static Distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
        static TransformCoordinates(p) { return p.clone(); }
    };
    const Quaternion = class {
        static Identity() { return { x: 0, y: 0, z: 0, w: 1, clone() { return { ...this }; } }; }
    };
    const TransformNode = class {
        constructor(name) {
            this.name = name;
            this.position = new Vector3();
            this.scaling = new Vector3(1, 1, 1);
            this.rotationQuaternion = Quaternion.Identity();
            this.parent = null;
        }
        computeWorldMatrix() {}
        getWorldMatrix() { return { clone: () => ({ invert: () => ({}) }) }; }
        getAbsolutePosition() { return this.position; }
        getScene() { return null; }
    };
    const context = vm.createContext({
        window,
        BABYLON: { Vector3, Quaternion, TransformNode }
    });
    vm.runInContext(readFileSync(new URL('../js/avatarRig.js', import.meta.url), 'utf8'), context);
    const { AvatarRig } = window;

    // 1. Ready Player Me / Mixamo full-body skeleton
    const rootFull = new TransformNode('rig0_Armature');
    const rpmFullNames = [
        'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
        'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1', 'LeftHandPinky1',
        'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'RightHandPinky1',
        'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
        'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'
    ];
    const fullHierarchy = rpmFullNames.map(n => {
        const node = new TransformNode(`rig0_${n}`);
        node.parent = rootFull;
        return node;
    });
    const resolvedFull = AvatarRig._resolveBoneNodes(rootFull, 'rig0_', fullHierarchy, true);
    assert.ok(resolvedFull, 'Ready Player Me full-body skeleton resolves');
    assert.equal(resolvedFull.rigMode, 'full');
    for (const bone of AvatarRig.BONES) {
        assert.ok(resolvedFull.nodes[bone], `Ready Player Me full-body resolves ${bone}`);
    }

    // 2. Ready Player Me / Tribe XR half-body VR skeleton (no leg or toe bones)
    const rootHalf = new TransformNode('rig1_Armature');
    const rpmHalfNames = [
        'Hips', 'Spine', 'Head',
        'LeftArm', 'LeftForeArm', 'LeftHand',
        'RightArm', 'RightForeArm', 'RightHand'
    ];
    const halfHierarchy = rpmHalfNames.map(n => {
        const node = new TransformNode(`rig1_${n}`);
        node.parent = rootHalf;
        if (n === 'Head') node.position.set(0, 1.6, 0);
        if (n === 'Hips') node.position.set(0, 1.0, 0);
        if (n === 'LeftArm') node.position.set(0.18, 1.4, 0);
        if (n === 'RightArm') node.position.set(-0.18, 1.4, 0);
        return node;
    });
    const resolvedHalf = AvatarRig._resolveBoneNodes(rootHalf, 'rig1_', halfHierarchy, true);
    assert.ok(resolvedHalf, 'Ready Player Me half-body VR skeleton resolves');
    assert.equal(resolvedHalf.rigMode, 'upper-body');
    for (const bone of AvatarRig.BONES) {
        assert.ok(resolvedHalf.nodes[bone], `Ready Player Me half-body resolves or synthesizes ${bone}`);
    }
});


