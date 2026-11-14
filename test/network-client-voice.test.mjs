import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(globals = {}) {
    const intervals = new Map();
    let nextTimer = 0;
    const context = vm.createContext({
        window: {}, console: { warn() {}, error() {} },
        performance: { now: () => 10 },
        setInterval(callback) { const id = ++nextTimer; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        WebSocket: { OPEN: 1 }, ...globals
    });
    vm.runInContext(readFileSync(new URL('../js/networkClient.js', import.meta.url), 'utf8'), context);
    return { NetworkClient: context.window.NetworkClient, intervals };
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
        readyState: 'live',
        stop() { this.readyState = 'ended'; },
        addEventListener(type, listener) { if (type === 'ended') listeners.add(listener); },
        removeEventListener(type, listener) { if (type === 'ended') listeners.delete(listener); },
        end() { this.readyState = 'ended'; for (const listener of [...listeners]) listener(); }
    };
    return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

test('local mic RMS detects speech and releases its meter without closing the shared audio context', async () => {
    const audio = fakeVoiceContext();
    const stream = fakeStream();
    const { NetworkClient, intervals } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', voiceActivityContext: audio.context });
    const changes = [];
    client.onLocalSpeakingChange = (speaking, level) => changes.push([speaking, level]);

    await client.enableVoice();
    assert.equal(client.localVoiceActivityAvailable, true);
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
    assert.equal(client.localVoiceActivity, 0);
    assert.equal(client.localVoiceActivityAvailable, false);
    assert.equal(intervals.size, 0);
    assert.equal(stream.track.readyState, 'ended');
    assert.equal(audio.context.closed, false);
    assert.ok(audio.nodes.every(node => node.disconnected));
});

test('ended microphone tracks disable capture and notify even if the optional meter is unavailable', async () => {
    const stream = fakeStream();
    const { NetworkClient } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example' });
    const errors = [];
    client.onError = error => errors.push(error.message);

    await client.enableVoice();
    stream.track.end();

    assert.equal(client.micEnabled, false);
    assert.equal(client.micStream, null);
    assert.match(errors[0], /Microphone capture ended/);
});

test('failed SFU voice publication releases capture and resets local speech state', async () => {
    const audio = fakeVoiceContext();
    const stream = fakeStream();
    const { NetworkClient, intervals } = harness({
        navigator: { mediaDevices: { getUserMedia: async () => stream } }
    });
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', voiceActivityContext: audio.context });
    client.sfu = { publish: async () => { throw new Error('publication rejected'); }, closeSlot: () => Promise.resolve() };

    await assert.rejects(client.enableVoice(), /publication rejected/);
    assert.equal(client.micEnabled, false);
    assert.equal(client.micStream, null);
    assert.equal(client.localSpeaking, false);
    assert.equal(intervals.size, 0);
    assert.equal(stream.track.readyState, 'ended');
});

test('temporary voice-activity context is closed when microphone capture ends', async () => {
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
