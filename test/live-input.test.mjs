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
