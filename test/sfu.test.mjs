import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { ClubRoom } from '../worker/src/relay.js';
import { mediaTransport } from '../worker/src/sfu.js';
import { roomCapacity } from '../worker/src/roomDirectory.js';

const SDP = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const { Event, EventTarget, performance } = globalThis;
const env = { MEDIA_TRANSPORT: 'sfu', SFU_APP_ID: 'development-app', SFU_APP_SECRET: 'test-only-secret', ROOM_CAPACITY: '32' };

class Socket {
    constructor(client = null) { this.sent = []; this.client = client; this.handlers = {}; }
    accept() {}
    send(data) {
        this.sent.push(JSON.parse(data));
        this.client?._onMessage({ data });
    }
    close(code) { this.closed = code; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    last(type) { return this.sent.filter(msg => msg.type === type).at(-1); }
}
function join(room, poseBatch = false) {
    const ws = new Socket();
    return { ws, session: room._acceptSession(ws, 'Guest', null, 'any', poseBatch) };
}
function message(room, guest, msg) { room._onMessage(guest.ws, guest.session, { data: JSON.stringify(msg) }); }
async function settle(room) {
    // A request can enqueue reconciliation or an answer while finishing its own queue.
    for (let i = 0; i < 12; i++) { await room.media?.queue; await new Promise(resolve => setImmediate(resolve)); }
    if (!room.sessions.size && room.media?.retryTimer) {
        clearTimeout(room.media.retryTimer);
        room.media.retryTimer = null;
    }
}
function cleanup(room) { for (const [ws, session] of [...room.sessions]) room._onClose(ws, session); }

function api(t) {
    const previous = globalThis.fetch;
    const calls = [];
    const sessions = new Map();
    let counter = 0;
    let fail = null;
    let partial = false;
    let loseReply = false;
    let hold = null;
    const expired = new Set();
    globalThis.fetch = async (url, init) => {
        const path = url.replace(/^.*\/apps\/development-app\//, '');
        const body = init.body && JSON.parse(init.body);
        calls.push({ path, method: init.method, body, headers: init.headers });
        if (fail?.(path, body)) return Response.json({ errorCode: 'TEST_FAILURE' }, { status: 500 });
        if (path === 'sessions/new') {
            const id = `session-${++counter}`;
            sessions.set(id, []);
            return Response.json({ sessionId: id });
        }
        const [, id, operation] = /^sessions\/([^/]+)\/?(.*)$/.exec(path);
        if (expired.has(id)) return Response.json({ errorCode: 'session_error' }, { status: 410 });
        const tracks = sessions.get(id);
        if (operation === 'tracks/new') {
            if (hold) await hold();
            const created = body.tracks.map(track => ({ ...track, mid: String(tracks.length++) }));
            // Track storage uses explicit values, not sparse array length placeholders.
            for (const track of created) tracks[Number(track.mid)] = track;
            if (partial && created.length > 1) {
                partial = false;
                const failed = created.at(-1);
                tracks[Number(failed.mid)] = null;
                created[created.length - 1] = { errorCode: 'empty_track_error' };
            }
            if (loseReply) { loseReply = false; throw new Error('Simulated lost allocation reply'); }
            return Response.json({ tracks: created,
                requiresImmediateRenegotiation: !body.sessionDescription,
                sessionDescription: { type: body.sessionDescription ? 'answer' : 'offer',
                    sdp: SDP + created.map(track => `a=x-mid:${track.mid}\r\n`).join('') } });
        }
        if (operation === 'tracks/close') {
            for (const track of body.tracks) {
                const index = tracks.findIndex(old => old?.mid === track.mid);
                if (index !== -1) tracks[index] = null;
            }
            return Response.json({ tracks: body.tracks });
        }
        if (operation === 'renegotiate') return Response.json({});
        return Response.json({ tracks: tracks.filter(Boolean) });
    };
    t.after(() => { globalThis.fetch = previous; });
    return { calls, sessions, fail: fn => { fail = fn; }, partial: () => { partial = true; },
        loseReply: () => { loseReply = true; }, expire: id => expired.add(id),
        hold: () => {
            let release;
            const pending = new Promise(resolve => { release = resolve; });
            hold = () => pending;
            return () => { hold = null; release(); };
        } };
}

let request = 1;
async function rpc(room, guest, slot, action, fields = {}) {
    const id = request++;
    message(room, guest, { type: 'sfu', request: id, slot, action, ...fields });
    await settle(room);
    return guest.ws.sent.find(msg => msg.type === 'sfu-result' && msg.request === id);
}
async function publish(room, guest, kind = 'voice') {
    const response = await rpc(room, guest, `${kind}Pub`, 'publish', { mid: '0', description: { type: 'offer', sdp: SDP } });
    assert.equal(response.error, undefined);
    await rpc(room, guest, `${kind}Pub`, 'ready');
}
async function subscribe(room, guest, publisher, kind = 'voice') {
    const response = await rpc(room, guest, `${kind}Rx`, 'subscribe', { owners: [publisher.session.id] });
    if (!response.error) await rpc(room, guest, `${kind}Rx`, 'answer', { description: { type: 'answer', sdp: SDP } });
    return response;
}

test('configuration is explicit, baseline mesh stays eight and SFU secrets never appear in welcome', async t => {
    assert.equal(mediaTransport({}), 'mesh');
    assert.equal(roomCapacity({}), 8);
    for (const value of ['0', '7', '33', '8.5', '', 'no']) assert.throws(() => roomCapacity({ ROOM_CAPACITY: value }));
    assert.throws(() => mediaTransport({ MEDIA_TRANSPORT: 'sfu' }));
    assert.throws(() => mediaTransport({ MEDIA_TRANSPORT: 'unknown' }));
    api(t);
    const room = new ClubRoom({}, env);
    const a = join(room);
    assert.equal(a.ws.last('welcome').mediaTransport, 'sfu');
    assert.equal(a.ws.last('welcome').capacity, 32);
    assert.ok(!JSON.stringify(a.ws.sent).includes(env.SFU_APP_SECRET));
    assert.ok(!JSON.stringify(a.ws.sent).includes(env.SFU_APP_ID));
    cleanup(room);
    await settle(room);
});

test('development room admits 32, rejects the 33rd, status reports capacity, legacy baseline rejects ninth', async () => {
    const room = new ClubRoom({}, { ROOM_CAPACITY: '32' });
    const admitted = Array.from({ length: 32 }, () => join(room));
    assert.ok(admitted.every(guest => guest.session));
    assert.equal(join(room).ws.closed, 4003);
    const status = await (await room.fetch(new Request('https://internal/directory-status'))).json();
    assert.equal(status.capacity, 32);
    assert.equal(status.people, 32);
    cleanup(room);
    const baseline = new ClubRoom({});
    for (let i = 0; i < 8; i++) join(baseline);
    assert.equal(join(baseline).ws.closed, 4003);
    cleanup(baseline);
});

test('SFU authorization chooses locators server-side; voice audience and targeted chat are independent', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room), b = join(room), c = join(room);
    message(room, a, { type: 'media-control', voice: [b.session.id] });
    await publish(room, a);
    assert.ok((await subscribe(room, c, a)).error, 'unselected listener cannot pull publication');
    assert.equal((await subscribe(room, b, a)).error, undefined);
    const remote = provider.calls.find(call => call.body?.tracks?.[0].location === 'remote');
    assert.equal(remote.body.tracks[0].trackName, 'voice');
    assert.equal(remote.body.tracks[0].sessionId, room.media.members.get(a.session.id).slots.voicePub.id);
    message(room, a, { type: 'chat', text: 'chat only', targets: [c.session.id] });
    assert.equal(c.ws.last('chat').text, 'chat only');
    assert.equal(b.ws.last('chat'), undefined);
    message(room, a, { type: 'media-control', voice: [] });
    await settle(room);
    assert.equal(room.media.members.get(b.session.id).slots.voiceRx, undefined);
    assert.ok(provider.calls.some(call => call.path.endsWith('tracks/close') && call.body.force === true));
    assert.equal(b.ws.last('media-reset').slot, 'voiceRx');
    cleanup(room);
    await settle(room);
});

test('two-way blocks and membership close established subscriptions, and unblock permits a new receive session', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room), b = join(room);
    await publish(room, a);
    await publish(room, b);
    await subscribe(room, a, b);
    await subscribe(room, b, a);
    message(room, a, { type: 'block', pid: b.session.pid });
    await settle(room);
    for (const guest of [a, b]) assert.equal(room.media.members.get(guest.session.id).slots.voiceRx, undefined);
    assert.ok((await subscribe(room, b, a)).error);
    message(room, a, { type: 'unblock', pid: b.session.pid });
    await settle(room);
    assert.equal((await subscribe(room, b, a)).error, undefined);
    room._onClose(a.ws, a.session);
    await settle(room);
    assert.equal(room.media.members.get(b.session.id).slots.voiceRx, undefined);
    assert.ok(provider.calls.filter(call => call.path.endsWith('/tracks/close')).length >= 4);
    cleanup(room);
    await settle(room);
});

test('only host publishes music, Listen Along is required and revoked, handover clears old music', async t => {
    api(t);
    const room = new ClubRoom({}, env), host = join(room), guest = join(room);
    message(room, host, { type: 'media-control', music: { available: true, playing: true, title: 'Local set' } });
    await publish(room, host, 'music');
    assert.ok((await rpc(room, guest, 'musicPub', 'publish', { mid: '0', description: { type: 'offer', sdp: SDP } })).error);
    assert.ok((await subscribe(room, guest, host, 'music')).error);
    message(room, guest, { type: 'media-control', listen: true });
    assert.equal((await subscribe(room, guest, host, 'music')).error, undefined);
    message(room, guest, { type: 'media-control', listen: false });
    await settle(room);
    assert.equal(room.media.members.get(guest.session.id).slots.musicRx, undefined);
    message(room, guest, { type: 'media-control', listen: true });
    await subscribe(room, guest, host, 'music');
    message(room, host, { type: 'host-transfer', target: guest.session.id });
    await settle(room);
    assert.equal(room.media.members.get(host.session.id).slots.musicPub, undefined);
    assert.equal(room.media.members.get(guest.session.id).slots.musicRx, undefined);
    assert.equal(room.media.members.get(host.session.id).listen, false);
    cleanup(room);
    await settle(room);
});

test('invalid media operations cannot proxy arbitrary sessions, video, tracks or renegotiations', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room);
    const initial = provider.calls.length;
    assert.ok((await rpc(room, a, 'voiceRx', 'answer', { description: { type: 'answer', sdp: SDP } })).error);
    assert.ok((await rpc(room, a, 'voicePub', 'publish', {
        mid: '0', description: { type: 'offer', sdp: `${SDP}m=video 9 UDP/TLS/RTP/SAVPF 96\r\n` }
    })).error);
    assert.ok((await rpc(room, a, 'voiceRx', 'subscribe', { owners: ['arbitrary-session'], sessionId: 'secret', trackName: 'camera' })).error);
    assert.equal(provider.calls.length, initial);
    cleanup(room);
    await settle(room);
});

test('SFU failures report sanitized errors, clean partial tracks and recover on a new session without mesh', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room);
    provider.fail(path => path.endsWith('tracks/new'));
    const failed = await rpc(room, a, 'voicePub', 'publish', { mid: '0', description: { type: 'offer', sdp: SDP } });
    assert.match(failed.error, /SFU operation failed/);
    assert.ok(!JSON.stringify(failed).includes(env.SFU_APP_SECRET));
    provider.fail(null);
    await publish(room, a);
    assert.ok(provider.calls.filter(call => call.path === 'sessions/new').length >= 2);
    const b = join(room);
    message(room, a, { type: 'rtc-signal', target: b.session.id, signal: { kind: 'offer' } });
    assert.equal(b.ws.last('rtc-signal'), undefined, 'no mesh fallback in SFU rooms');
    cleanup(room);
    await settle(room);
});

test('partial successful allocations are force-closed, never published as a complete subscription', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room), b = join(room), c = join(room);
    await publish(room, a);
    await publish(room, b);
    provider.partial();
    const result = await rpc(room, c, 'voiceRx', 'subscribe', { owners: [a.session.id, b.session.id] });
    assert.ok(result.error);
    assert.equal(room.media.members.get(c.session.id).slots.voiceRx, undefined);
    assert.ok(provider.calls.some(call => call.path.endsWith('tracks/close') && call.body.tracks.length === 1));
    cleanup(room);
    await settle(room);
});

test('revocation close errors withdraw the source, retain cleanup, and retry known mids after recovery', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room), b = join(room);
    await publish(room, a);
    await subscribe(room, b, a);
    const rx = room.media.members.get(b.session.id).slots.voiceRx.id;
    provider.fail(path => path === `sessions/${rx}/tracks/close`);
    message(room, a, { type: 'media-control', voice: [] });
    await settle(room);
    assert.equal(room.media.members.get(a.session.id).slots.voicePub, undefined);
    assert.match(a.ws.last('media-reset').error, /cleanup failed/);
    assert.ok(room.media.cleanup.size);
    provider.fail(null);
    await room.media.retryCleanup();
    assert.equal(room.media.cleanup.size, 0);
    cleanup(room);
    await settle(room);
});

test('owned allocations are persisted; cleanup resumes after a Durable Object restart', async t => {
    const provider = api(t);
    const stored = new Map(), alarms = [];
    const state = { storage: {
        get: async key => structuredClone(stored.get(key)),
        put: async (key, value) => { stored.set(key, structuredClone(value)); },
        setAlarm: async time => { alarms.push(time); }
    } };
    const room = new ClubRoom(state, env), a = join(room), b = join(room);
    await publish(room, a);
    await subscribe(room, b, a);
    const retained = stored.get('sfuCleanup');
    assert.equal(retained.length, 2, 'live owned allocations are persisted for crash cleanup');
    const restarted = new ClubRoom(state, env);
    await settle(restarted);
    assert.equal(stored.get('sfuCleanup').length, 0);
    assert.ok(provider.calls.filter(call => call.path.endsWith('tracks/close')).length >= 2);
    cleanup(room);
    await settle(room);
});

test('a lost allocation reply retains uncertain session cleanup, inspects tracks and closes late allocations', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room);
    provider.loseReply();
    const result = await rpc(room, a, 'voicePub', 'publish', { mid: '0', description: { type: 'offer', sdp: SDP } });
    assert.ok(result.error);
    assert.ok(provider.calls.some(call => call.method === 'GET' && call.path === 'sessions/session-1'));
    assert.ok(provider.calls.some(call => call.path === 'sessions/session-1/tracks/close'));
    assert.equal(room.media.cleanup.size, 1, 'unknown completed request remains retired until session expiration');
    provider.expire('session-1');
    await room.media.retryCleanup();
    assert.equal(room.media.cleanup.size, 0);
    cleanup(room);
    await settle(room);
});

test('audience changes while subscription API is in flight cannot authorize the returned tracks', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), a = join(room), b = join(room);
    await publish(room, a);
    const release = provider.hold();
    const id = request++;
    message(room, b, { type: 'sfu', request: id, slot: 'voiceRx', action: 'subscribe', owners: [a.session.id] });
    await new Promise(resolve => setImmediate(resolve));
    message(room, a, { type: 'media-control', voice: [] });
    release();
    await settle(room);
    assert.ok(b.ws.sent.find(msg => msg.type === 'sfu-result' && msg.request === id).error);
    assert.equal(room.media.members.get(b.session.id).slots.voiceRx, undefined);
    assert.ok(provider.calls.some(call => call.path.endsWith('tracks/close')));
    cleanup(room);
    await settle(room);
});

test('pose batches coalesce latest, near 20Hz/far 2Hz includes vertical distance, blocks cancel stale frames', () => {
    const room = new ClubRoom({}, { ROOM_CAPACITY: '32' }), source = join(room), near = join(room, true), far = join(room, true), legacy = join(room);
    const pose = (x, y = 1.6, hands = undefined) => ({ x, y, z: 0, rotY: 0, ...(hands ? { hands } : {}) });
    message(room, near, { type: 'state', state: pose(1) });
    message(room, far, { type: 'state', state: pose(0, 20) });
    message(room, source, { type: 'state', state: pose(0) });
    message(room, source, { type: 'state', state: pose(2, 1.6, { left: { x: 0, y: 0, z: 0 }, right: null }) });
    assert.equal(legacy.ws.last('state').state.x, 2);
    assert.equal(near.ws.last('state'), undefined);
    room._flushPoses(1000);
    const selected = guest => guest.ws.last('states').states.find(entry => entry.id === source.session.id);
    assert.equal(selected(near).state.x, 2);
    assert.ok(selected(near).state.hands);
    assert.equal(selected(far).state.hands, undefined);
    const farCount = far.ws.sent.filter(msg => msg.type === 'states').length;
    message(room, source, { type: 'state', state: pose(3) });
    room._flushPoses(1050);
    assert.equal(selected(near).state.x, 3);
    assert.equal(far.ws.sent.filter(msg => msg.type === 'states').length, farCount);
    room._flushPoses(1500);
    assert.equal(selected(far).state.x, 3);
    message(room, source, { type: 'state', state: pose(4) });
    message(room, near, { type: 'block', pid: source.session.pid });
    const nearCount = near.ws.sent.filter(msg => msg.type === 'states').length;
    room._flushPoses(1550);
    assert.equal(near.ws.sent.filter(msg => msg.type === 'states').length, nearCount);
    room._onClose(source.ws, source.session);
    assert.equal(near.session.poseSent.has(source.session.id), false);
    cleanup(room);
    assert.equal(room._poseTimer, null);
});

class PC extends EventTarget {
    static created = [];
    constructor() {
        super();
        PC.created.push(this);
        this.iceGatheringState = 'complete';
        this.connectionState = 'new';
        this.transceivers = [];
    }
    addTransceiver(track) {
        const transceiver = { mid: '0', sender: { track, replaceTrack: async replacement => { transceiver.sender.track = replacement; } } };
        this.transceivers.push(transceiver);
        return transceiver;
    }
    createOffer() { return Promise.resolve({ type: 'offer', sdp: SDP }); }
    createAnswer() { return Promise.resolve({ type: 'answer', sdp: SDP }); }
    async setLocalDescription(description) { this.localDescription = description; }
    async setRemoteDescription(description) {
        this.remoteDescription = description;
        this.connectionState = 'connected';
        if (description.type === 'offer') {
            for (const match of description.sdp.matchAll(/a=x-mid:(\d+)/g)) {
                const event = new Event('track');
                event.transceiver = { mid: match[1] };
                event.track = { id: `remote-${match[1]}`, kind: 'audio' };
                this.dispatchEvent(event);
            }
        }
        this.dispatchEvent(new Event('connectionstatechange'));
    }
    close() { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')); }
}
class Stream {
    constructor(tracks) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getAudioTracks() { return this.tracks; }
}
function clientJoin(room) {
    const track = { kind: 'audio', stop() { this.stopped = true; } };
    const window = {};
    const context = vm.createContext({ window, console, setTimeout, clearTimeout, URL, performance,
        RTCPeerConnection: PC, MediaStream: Stream, WebSocket: { OPEN: 1 },
        navigator: { mediaDevices: { getUserMedia: async () => new Stream([track]) } } });
    for (const file of ['sfuClient', 'networkClient']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
    }
    const client = new window.NetworkClient({ serverUrl: 'wss://test.local' });
    const ws = new Socket(client);
    client.ws = { readyState: 1, send: data => {
        const session = room.sessions.get(ws);
        if (session) room._onMessage(ws, session, { data });
    }, close() {} };
    const streams = [], music = [], errors = [];
    client.onRemoteStream = (id, stream) => streams.push({ id, stream });
    client.onRemoteMusic = (id, stream) => music.push({ id, stream });
    client.onError = error => errors.push(error.message);
    const session = room._acceptSession(ws, 'Browser');
    return { client, ws, session, streams, music, errors, track };
}

test('browser transport publishes mic once, receives aggregated spatial voice, music consent and mute stay separate', async t => {
    api(t);
    PC.created = [];
    const room = new ClubRoom({}, env), a = clientJoin(room), b = clientJoin(room), c = clientJoin(room);
    await a.client.enableVoice();
    await settle(room);
    assert.equal(a.client.mediaTransport, 'sfu');
    assert.equal(a.client.peers.get(b.session.id).pc, null);
    assert.ok(b.streams.some(entry => entry.id === a.session.id && entry.stream));
    assert.ok(c.streams.some(entry => entry.id === a.session.id && entry.stream));
    a.client.setVoiceAudience([b.session.id]);
    await settle(room);
    assert.ok(c.streams.some(entry => entry.id === a.session.id && entry.stream === null));
    const musicTrack = { kind: 'audio', stop() { throw new Error('Transport must not own host capture.'); } };
    a.client.setLocalMusic(new Stream([musicTrack]), { playing: true, title: 'Set' });
    await settle(room);
    assert.equal(b.music.length, 0);
    b.client.setMusicListening(true);
    await settle(room);
    assert.ok(b.music.some(entry => entry.id === a.session.id && entry.stream));
    const voiceRx = b.client.sfu.slots.get('voiceRx').pc;
    b.client.setMusicListening(false);
    await settle(room);
    assert.equal(b.music.at(-1).stream, null);
    assert.equal(b.client.sfu.slots.get('voiceRx').pc, voiceRx);
    a.client.disableVoice();
    await settle(room);
    assert.equal(a.track.stopped, true);
    assert.ok(b.streams.some(entry => entry.id === a.session.id && entry.stream === null));
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
    assert.deepEqual(c.errors, []);
    for (const guest of [a, b, c]) guest.client.disconnect();
    cleanup(room);
    await settle(room);
});

test('client consumes batched poses only for known peers and never constructs mesh PCs in SFU mode', async t => {
    api(t);
    const room = new ClubRoom({}, env), a = clientJoin(room), b = clientJoin(room);
    const states = [];
    a.client.onPeerState = (id, state) => states.push({ id, state });
    a.client._onMessage({ data: JSON.stringify({ type: 'states', states: [
        { id: b.session.id, state: { x: 1 } }, { id: 'unknown', state: { x: 2 } }
    ] }) });
    assert.deepEqual(JSON.parse(JSON.stringify(states)), [{ id: b.session.id, state: { x: 1 } }]);
    a.client._onMessage({ data: JSON.stringify({ type: 'rtc-signal', from: b.session.id,
        signal: { kind: 'offer', sdp: { type: 'offer', sdp: SDP } } }) });
    assert.equal(a.client.peers.get(b.session.id).pc, null);
    a.client.disconnect(); b.client.disconnect(); cleanup(room);
    await settle(room);
});

test('standalone NetworkClient sends poses with capacity 32 without welcome, SFU script or media runtime', () => {
    const window = {};
    const context = vm.createContext({ window, console, setTimeout, clearTimeout, URL, performance });
    vm.runInContext(readFileSync(new URL('../js/networkClient.js', import.meta.url), 'utf8'), context);
    const client = new window.NetworkClient();
    client.status = 'connected';
    client.capacity = 32;
    const sent = [];
    client._send = frame => sent.push(frame);
    client.sendState({ x: 0, y: 1.6, z: 0, rotY: 0 });
    client.sendPing();
    assert.equal(sent[0].type, 'state');
    assert.equal(sent[1].type, 'ping');
    assert.equal(client.mediaTransport, 'mesh');
    assert.equal(client.sfu, null);
    assert.equal(window.SFUClient, undefined);
});

test('bounded ICE gathering retains usable candidates when STUN completion stalls, but rejects an empty offer', async () => {
    const window = {};
    vm.runInNewContext(readFileSync(new URL('../js/sfuClient.js', import.meta.url), 'utf8'),
        { window, console, setTimeout, clearTimeout });
    const transport = new window.SFUClient({ connected: true });
    transport._wait = async () => { throw new Error('STUN gathering stalled'); };
    await transport._gather({ iceGatheringState: 'gathering',
        localDescription: { sdp: `${SDP}a=candidate:1 1 UDP 123 192.0.2.1 12345 typ host\r\n` } });
    await assert.rejects(() => transport._gather({ iceGatheringState: 'gathering',
        localDescription: { sdp: SDP } }), /STUN gathering stalled/);
    await transport._gather({ iceGatheringState: 'complete' });
});

test('32-person room aggregates 31 publishers in one browser voice receiver and batches subscriptions', async t => {
    const provider = api(t);
    const room = new ClubRoom({}, env), receiver = clientJoin(room);
    const publishers = Array.from({ length: 31 }, () => join(room));
    for (const publisher of publishers) await publish(room, publisher);
    await settle(room);
    assert.equal(receiver.client.sfu.slots.size, 1);
    assert.equal(receiver.client.sfu.slots.get('voiceRx').mids.size, 31);
    assert.equal(receiver.streams.filter(entry => entry.stream).length, 31);
    const subscriptions = provider.calls.filter(call => call.body?.tracks?.[0]?.location === 'remote');
    assert.ok(subscriptions.every(call => call.body.tracks.length <= 8));
    assert.deepEqual(receiver.errors, []);
    receiver.client.disconnect();
    cleanup(room);
    await settle(room);
});
