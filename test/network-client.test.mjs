import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setInterval } from 'node:timers';

function harness(globals = {}) {
    const context = vm.createContext({
        window: {}, console: { warn() {}, error() {} },
        setInterval, clearInterval, performance: { now: () => 10 },
        WebSocket: { OPEN: 1 }, ...globals
    });
    vm.runInContext(readFileSync(new URL('../js/networkClient.js', import.meta.url), 'utf8'), context);
    return { NetworkClient: context.window.NetworkClient, context };
}

function fakeVoiceContext() {
    const nodes = [];
    let amplitude = 0;
    const context = {
        state: 'running', closed: false,
        createMediaStreamSource() {
            const node = { connect(target) { node.target = target; }, disconnect() { node.disconnected = true; } };
            nodes.push(node);
            return node;
        },
        createAnalyser() {
            const analyser = {
                fftSize: 0,
                getFloatTimeDomainData(samples) { samples.fill(amplitude); },
                disconnect() { analyser.disconnected = true; }
            };
            nodes.push(analyser);
            return analyser;
        },
        close() { context.closed = true; context.state = 'closed'; }
    };
    return { context, nodes, setAmplitude(value) { amplitude = value; } };
}

function fakeStream() {
    const listeners = new Set();
    const track = {
        readyState: 'live', stopped: false,
        stop() { this.stopped = true; this.readyState = 'ended'; },
        addEventListener(type, listener) { if (type === 'ended') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'ended') listeners.delete(listener); },
        end() { this.readyState = 'ended'; for (const listener of [...listeners]) listener(); }
    };
    return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

test('local mic RMS exposes transitions and releases sampling on disable', async () => {
    const intervals = new Map();
    let nextTimer = 0;
    const audio = fakeVoiceContext();
    const stream = fakeStream();
    const { NetworkClient } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        setInterval(callback) { const id = ++nextTimer; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', voiceActivityContext: audio.context });
    const changes = [];
    client.onLocalSpeakingChange = (speaking, level) => changes.push([speaking, level]);

    await client.enableVoice();
    assert.equal(client.micEnabled, true);
    assert.equal(client.localSpeaking, false);
    assert.equal(intervals.size, 1);
    audio.setAmplitude(0.04);
    [...intervals.values()][0]();
    assert.equal(client.localSpeaking, true);
    assert.ok(Math.abs(client.localVoiceActivity - 0.4) < 0.001);
    audio.setAmplitude(0.005);
    [...intervals.values()][0]();
    assert.equal(client.localSpeaking, false);
    assert.deepEqual(changes.map(change => change[0]), [true, false]);

    client.disableVoice();
    assert.equal(client.localSpeaking, false);
    assert.equal(client.localVoiceActivity, 0);
    assert.equal(intervals.size, 0);
    assert.equal(stream.track.stopped, true);
    assert.equal(audio.context.closed, false, 'a shared context remains owned by the club');
    assert.ok(audio.nodes.every(node => node.disconnected));
});

test('a failed SFU voice publication stops capture and resets local speech state', async () => {
    const intervals = new Map();
    let nextTimer = 0;
    const audio = fakeVoiceContext();
    const stream = fakeStream();
    const { NetworkClient } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        setInterval(callback) { const id = ++nextTimer; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', voiceActivityContext: audio.context });
    client.sfu = { publish: async () => { throw new Error('publication rejected'); }, closeSlot: () => Promise.resolve() };
    await assert.rejects(client.enableVoice(), /publication rejected/);
    assert.equal(client.micEnabled, false);
    assert.equal(client.micStream, null);
    assert.equal(client.localSpeaking, false);
    assert.equal(client.localVoiceActivity, 0);
    assert.equal(intervals.size, 0);
    assert.equal(stream.track.stopped, true);
});

test('the temporary activity AudioContext is closed with microphone capture', async () => {
    const audio = fakeVoiceContext();
    const stream = fakeStream();
    const { NetworkClient } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        AudioContext: class { constructor() { return audio.context; } }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    await client.enableVoice();
    client.disableVoice();
    assert.equal(audio.context.closed, true);
});

test('silent microphone ending reports state even if the optional meter is unavailable', async () => {
    const stream = fakeStream();
    const { NetworkClient } = harness({ navigator: { mediaDevices: { getUserMedia: async () => stream } } });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const errors = [], changes = [];
    client.onError = error => errors.push(error.message);
    client.onLocalSpeakingChange = value => changes.push(value);
    await client.enableVoice();
    stream.track.end();
    assert.equal(client.micEnabled, false);
    assert.equal(client.micStream, null);
    assert.equal(stream.track.stopped, true);
    assert.match(errors[0], /capture ended/);
    assert.deepEqual(changes, []);
});

test('byte analyser reuses its buffer and reports a sampling failure only once', async () => {
    let callback;
    const warnings = [], buffers = [];
    const audio = fakeVoiceContext();
    audio.context.createAnalyser = () => ({
        fftSize: 0,
        getByteTimeDomainData(buffer) {
            buffers.push(buffer);
            if (buffers.length === 3) throw new Error('analyser failure');
            buffer.fill(132);
        },
        disconnect() {}
    });
    const stream = fakeStream();
    const { NetworkClient } = harness({
        console: { warn: (...args) => warnings.push(args), error() {} },
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        setInterval(fn) { callback = fn; return 1; },
        clearInterval() {}
    });
    const client = new NetworkClient({ voiceActivityContext: audio.context });
    await client.enableVoice();
    callback(); callback(); callback(); callback();
    assert.equal(buffers.length, 3);
    assert.equal(buffers[0], buffers[1]);
    assert.equal(buffers[1], buffers[2]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0][0], /sampling failed/);
    assert.equal(client.micEnabled, true);
    client.disableVoice();
});

test('meter creation, resume, analyser setup and close failures are logged', async () => {
    const warnings = [];
    const console = { warn: (...args) => warnings.push(args), error() {} };
    const stream = fakeStream();
    const { NetworkClient } = harness({
        console, navigator: { mediaDevices: { getUserMedia: async () => stream } },
        AudioContext: class { constructor() { throw new Error('constructor failure'); } }
    });
    const client = new NetworkClient({});
    await client.enableVoice();
    assert.match(warnings.shift()[0], /creation failed/);
    client.disableVoice();

    const next = fakeStream();
    const broken = fakeVoiceContext();
    broken.context.state = 'suspended';
    broken.context.resume = () => Promise.reject(new Error('resume failure'));
    broken.context.createAnalyser = () => { throw new Error('analyser failure'); };
    client.setVoiceActivityContext(broken.context);
    client._closedByUser = false;
    client.micStream = next;
    client.micEnabled = true;
    client._startVoiceActivityMeter(next);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(warnings.some(entry => /resume failed/.test(entry[0])));
    assert.ok(warnings.some(entry => /initialization failed/.test(entry[0])));
    client.disableVoice();

    const owned = fakeVoiceContext();
    owned.context.close = () => Promise.reject(new Error('close failure'));
    client._voiceActivityContext = owned.context;
    client._voiceActivityContextOwned = true;
    client._stopVoiceActivityMeter();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(warnings.some(entry => /close failed/.test(entry[0])));
});

test('actual SFUClient slot construction failure releases the captured microphone', async () => {
    const stream = fakeStream(), audio = fakeVoiceContext();
    const { NetworkClient, context } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        RTCPeerConnection: class { constructor() { throw new Error('peer connection failed'); } }
    });
    vm.runInContext(readFileSync(new URL('../js/sfuClient.js', import.meta.url), 'utf8'), context);
    const client = new NetworkClient({ voiceActivityContext: audio.context });
    const errors = [];
    client.onError = error => errors.push(error.message);
    client.status = 'connected';
    client.sfu = new context.window.SFUClient(client);
    await assert.rejects(client.enableVoice(), /could not be published/);
    assert.equal(client.micEnabled, false);
    assert.equal(stream.track.stopped, true);
    assert.ok(errors.some(message => /peer connection failed/.test(message)));
});

test('actual SFUClient negotiation failure reports and releases capture despite swallowed rejection', async () => {
    const stream = fakeStream(), audio = fakeVoiceContext();
    const { NetworkClient, context } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        RTCPeerConnection: class {
            addEventListener() {}
            addTransceiver() { return { sender: {} }; }
            async createOffer() { throw new Error('offer failed'); }
            close() {}
        }
    });
    vm.runInContext(readFileSync(new URL('../js/sfuClient.js', import.meta.url), 'utf8'), context);
    const client = new NetworkClient({ voiceActivityContext: audio.context });
    const errors = [];
    client.onError = error => errors.push(error.message);
    client.status = 'connected';
    client.sfu = new context.window.SFUClient(client);
    client.sfu.request = async () => ({});
    await client.enableVoice();
    assert.equal(client.micEnabled, false);
    assert.equal(stream.track.stopped, true);
    assert.ok(errors.some(message => /offer failed/.test(message)));
});

test('actual SFUClient successful publication keeps the microphone active', async () => {
    const stream = fakeStream(), audio = fakeVoiceContext();
    const { NetworkClient, context } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } },
        RTCPeerConnection: class {
            constructor() { this.iceGatheringState = 'complete'; this.connectionState = 'connected'; }
            addEventListener() {}
            addTransceiver() { return { mid: '0', sender: {} }; }
            async createOffer() { return { type: 'offer', sdp: 'v=0' }; }
            async setLocalDescription(description) { this.localDescription = description; }
            async setRemoteDescription() {}
            close() {}
        }
    });
    vm.runInContext(readFileSync(new URL('../js/sfuClient.js', import.meta.url), 'utf8'), context);
    const client = new NetworkClient({ voiceActivityContext: audio.context });
    client.status = 'connected';
    client.sfu = new context.window.SFUClient(client);
    client.sfu.request = async () => ({ sessionDescription: { type: 'answer', sdp: 'v=0' } });
    await client.enableVoice();
    assert.equal(client.micEnabled, true);
    assert.equal(client.sfu.slots.get('voicePub').published, true);
    assert.equal(stream.track.stopped, false);
    client.disableVoice();
});

test('sendState reports socket acceptance and legacy no-PID reports fail with feedback', () => {
    const { NetworkClient } = harness();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const sent = [];
    client.ws = { readyState: 1, send: value => sent.push(JSON.parse(value)) };
    assert.equal(client.sendState({ x: 1 }), true);
    assert.equal(sent[0].type, 'state');
    client.ws.readyState = 0;
    assert.equal(client.sendState({ x: 2 }), false);

    client.status = 'connected';
    client.peers.set('legacy-peer', { pid: null });
    const errors = [];
    client.onError = error => errors.push(error.message);
    assert.equal(client.sendReport('legacy-peer', 'harassment'), false);
    assert.match(errors[0], /stable guest ID/);
});

test('mesh music negotiation ignores listening offers from anyone but the host', async () => {
    const { NetworkClient } = harness();
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    client.selfId = 'local';
    client.hostId = 'host';
    client.musicListening = true;
    client.peers.set('host', {});
    client.peers.set('other', {});
    let created = 0;
    client._createMusicConnection = () => { created++; };
    await client._onMusicSignal('other', { kind: 'offer', sdp: { type: 'offer' } });
    assert.equal(created, 0);
    await client._onMusicSignal('host', { kind: 'offer', sdp: { type: 'offer' } });
    assert.equal(created, 1);
});
