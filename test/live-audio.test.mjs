import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const id = '842bc212-b941-48a1-bcf8-17172a7d47e5';
const token = 'test-only-live-capability';
const event = { id, title: 'A live set', live: false, ended: false, roomIndex: 2, canManage: true, listenerToken: token };
const source = name => readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8');
const { Event, EventTarget } = globalThis;

function harness(t) {
    const timers = new Map(), sockets = [], errors = [], states = [], streams = [];
    let timerId = 0;
    const schedule = (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; };
    class Socket extends EventTarget {
        readyState = 0;
        sent = [];
        constructor(url) { super(); this.url = url; sockets.push(this); }
        open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
        send(value) { this.sent.push(JSON.parse(value)); }
        receive(value) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(value) })); }
        close(code = 1000, reason = '') {
            this.readyState = 3;
            this.dispatchEvent(Object.assign(new Event('close'), { code, reason }));
        }
    }
    class SFU {
        slots = new Map();
        messages = [];
        constructor(client) { this.client = client; }
        control() { this.client._send({ type: 'media-control', listen: this.client.musicListening, music: this.client.musicState }); }
        message(message) { this.messages.push(message); }
        async publish(kind, stream) { this.slots.set(`${kind}Pub`, { published: true, stream }); }
        dispose() { this.disposed = true; }
    }
    const window = { SFUClient: SFU, location: { href: 'https://club.example/', search: '' } };
    const context = vm.createContext({ window, URL, URLSearchParams, console, performance,
        setTimeout: schedule, setInterval: schedule, clearTimeout: value => timers.delete(value),
        clearInterval: value => timers.delete(value), WebSocket: Socket });
    vm.runInContext(source('liveAudioClient'), context);
    const clients = [];
    const create = (options = {}) => {
        const client = new window.LiveAudioClient({ serverUrl: 'wss://relay.example/?uid=must-not-leak',
            eventId: id, token, onError: error => errors.push(error.message), onState: state => states.push(state),
            onStream: stream => streams.push(stream), ...options });
        clients.push(client);
        return client;
    };
    const welcome = (client, socket = sockets.at(-1)) => {
        socket.open();
        socket.receive({ type: 'live-welcome', id: client.role === 'publisher' ? 'publisher' : 'listener', role: client.role, event });
    };
    t.after(() => { for (const client of clients) client.close(); });
    return { create, welcome, window, context, sockets, errors, states, streams, timers,
        fire(delay) {
            const [key, timer] = [...timers].find(([, value]) => value.delay === delay) || [];
            assert.ok(timer, `expected a ${delay}ms timer`);
            timers.delete(key);
            timer.callback();
        } };
}

test('event media authenticates in the first frame, never in the URL, and only subscribes to event music', async t => {
    const h = harness(t), client = h.create(), connected = client.connect();
    assert.equal(h.sockets[0].url, `wss://relay.example/live/${id}/media`);
    h.welcome(client);
    await connected;
    assert.deepEqual(h.sockets[0].sent[0], { type: 'event-auth', role: 'listener', token });
    assert.equal(h.sockets[0].sent[1].listen, true);
    h.sockets[0].receive({ type: 'media-catalog', tracks: [
        { owner: 'event-publisher', kind: 'music', version: 1 },
        { owner: 'social-stranger', kind: 'voice', version: 1 }
    ] });
    assert.equal(client.facade.hostId, 'event-publisher');
    assert.equal(client.facade.peers.has('event-publisher'), true, 'event publication is not a social avatar requirement');
    assert.equal(client.facade.peers.has('social-stranger'), false);
    assert.equal(client.sfu.messages.at(-1).tracks.length, 1);
    client.close();
    assert.equal(h.timers.size, 0);
});

test('live publisher verifies publication instead of presenting a swallowed SFU failure as success', async t => {
    const h = harness(t), client = h.create({ role: 'publisher' }), connected = client.connect();
    h.welcome(client);
    await connected;
    const stream = { getAudioTracks: () => [{ readyState: 'live' }] };
    await client.publish(stream);
    assert.equal(client.sfu.slots.get('musicPub').stream, stream);
    client.sfu.publish = async () => { client.sfu.slots.clear(); };
    await assert.rejects(client.publish(stream), /did not connect/);
    await assert.rejects(client.publish({ getAudioTracks: () => [] }), /active audio input/);
});

test('live reconnects are bounded and permission revocation is terminal', async t => {
    const h = harness(t), client = h.create(), connected = client.connect();
    h.welcome(client);
    await connected;
    for (const delay of [1000, 2000, 4000]) {
        h.sockets.at(-1).close(1006);
        h.fire(delay);
        h.welcome(client);
    }
    h.sockets.at(-1).close(1006);
    assert.equal(client.closed, true);
    assert.equal(h.errors.length, 1);
    assert.equal(h.sockets.length, 4);
    assert.equal(h.timers.size, 0);

    const denied = h.create(), opening = denied.connect();
    h.sockets.at(-1).close(4003, 'Invitation revoked');
    await assert.rejects(opening, /Invitation revoked/);
    assert.equal(denied.closed, true);
    assert.equal(h.timers.size, 0);
});

test('event end and malformed authorization clean up timers, sockets and media', async t => {
    const h = harness(t), client = h.create(), connected = client.connect();
    h.welcome(client);
    await connected;
    const sfu = client.sfu;
    h.sockets.at(-1).receive({ type: 'event-status', event: { ...event, ended: true } });
    assert.equal(client.closed, true);
    assert.equal(sfu.disposed, true);
    assert.equal(h.timers.size, 0);
    assert.equal(h.states.at(-1).ended, true);
    const wrong = h.create(), opening = wrong.connect();
    h.sockets.at(-1).receive({ type: 'live-welcome', id: 'bad', role: 'publisher', event });
    await assert.rejects(opening, /invalid invitation/);
    assert.equal(wrong.closed, true);
});

test('music SDP preserves existing parameters, requests stereo and bitrate without changing the original description', () => {
    const window = {};
    vm.runInNewContext(source('sfuClient'), { window });
    const description = { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111 0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;stereo=0\r\n' };
    const result = window.SFUClient.musicDescription(description);
    assert.match(result.sdp, /minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=192000/);
    assert.match(description.sdp, /stereo=0/);
    assert.equal(window.SFUClient.musicDescription(result).sdp, result.sdp, 'idempotent codec configuration');
    const inserted = window.SFUClient.musicDescription({ type: 'offer',
        sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=sendonly\r\n' }).sdp;
    assert.doesNotMatch(inserted, /\r\r/, 'inserting fmtp must not corrupt CRLF');
    assert.match(inserted, /opus\/48000\/2\r\na=fmtp:111 [^\r]+\r\na=sendonly\r\n/);
    assert.throws(() => window.SFUClient.musicDescription({ type: 'offer', sdp: 'v=0' }), /Opus/);
});

test('social event commands correlate replies, route event joins and reject pending requests on disconnect', async t => {
    const h = harness(t);
    vm.runInContext(source('networkClient'), h.context);
    const client = new h.window.NetworkClient({ serverUrl: 'wss://relay.example/', eventId: id });
    client.status = 'connected';
    client.liveEventsSupported = true;
    const messages = [];
    client._send = message => messages.push(message);
    const pending = client.eventCommand('create', 'A live set');
    assert.equal(messages[0].action, 'create');
    const seen = [];
    client.onLiveEvent = value => seen.push(value);
    client._onMessage({ data: JSON.stringify({ type: 'event-result', request: messages[0].request, event, publisherToken: token }) });
    assert.equal((await pending).publisherToken, token);
    assert.equal(seen[0].id, id);
    const cancelled = client.eventCommand('end');
    client._cancelEventRequests();
    await assert.rejects(cancelled, /disconnected/);
    assert.equal(h.timers.size, 0);
    client._open();
    assert.equal(new URL(h.sockets.at(-1).url).searchParams.get('event'), id);
    assert.equal(new URL(h.sockets.at(-1).url).searchParams.has('room'), false);
    client.disconnect();
});

test('event-owned audio survives a social host change, suppresses ordinary room music and ends on departure', t => {
    const h = harness(t);
    class EventMedia {
        static isEventId = h.window.LiveAudioClient.isEventId;
        constructor(options) { this.options = options; }
        connect() { return Promise.resolve(); }
        close() { this.closed = true; }
    }
    h.window.LiveAudioClient = EventMedia;
    for (const file of ['networkClient', 'multiplayer']) vm.runInContext(source(file), h.context);
    const stopped = [], errors = [];
    const club = { audioElement: { pause() {} }, showErrorMessage: message => errors.push(message),
        startNetworkMusic: (stream, state) => ({ stream, state }), stopNetworkMusic: state => stopped.push(state) };
    const mp = new h.window.ClubMultiplayer(club, { storage: null });
    const client = mp.client = new h.window.NetworkClient({ serverUrl: 'wss://relay.example/' });
    client.status = 'connected';
    client.selfId = client.hostId = 'me';
    mp._setLiveEvent(event);
    const media = mp._liveAudio;
    const stream = { live: true };
    media.options.onStream(stream);
    const playback = mp._eventAudio;
    client.hostId = 'new-host';
    mp._syncRole();
    assert.equal(mp._eventAudio, playback);
    assert.equal(media.closed, undefined);
    mp._applyMusic({ url: 'https://example.com/other.mp3', playing: true });
    mp._applyMusicBroadcast({ available: false });
    assert.equal(mp._eventAudio, playback);
    assert.equal(stopped.length, 0);
    mp._publisherToken = token;
    assert.equal(new URL(mp.publisherInviteUrl()).hash, `#${token}`);
    assert.equal(new URL(mp.inviteUrl()).searchParams.get('event'), id);
    mp._setLiveEvent({ ...event, ended: true });
    assert.equal(media.closed, true);
    assert.deepEqual(stopped, [playback]);
    assert.equal(mp._publisherToken, null);
    assert.equal(errors.length, 0);
});

test('pending local stream resolution and recovery cannot replace an announced live event', async t => {
    const h = harness(t);
    h.window.VRClubAnimationFinish = class {};
    vm.runInContext('var VRClubAnimationFinish = window.VRClubAnimationFinish;', h.context);
    vm.runInContext(readFileSync(new URL('../js/club/10-ui.js', import.meta.url), 'utf8'), h.context);
    const club = new h.window.VRClubUI();
    club.multiplayer = { hasLiveEvent: true };
    const before = club.nowPlayingLabel = 'A live set';
    await assert.rejects(club.startAudioStream('https://example.com/old-set.mp3'), /live event DJ/);
    await assert.rejects(club.startAudioFromFile({ name: 'old-set.wav', type: 'audio/wav' }), /live event DJ/);
    await assert.rejects(club.startSoundCloud('https://soundcloud.com/test/set'), /live event DJ/);
    club._recoverAudioStream('error');
    assert.equal(club.nowPlayingLabel, before);
    assert.equal(h.timers.size, 0);
});
