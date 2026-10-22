import test from 'node:test';
import assert from 'node:assert/strict';
import relay, { ClubRoom, derivePid } from '../worker/src/relay.js';
import { privateRoomName } from '../worker/src/roomDirectory.js';
import { LiveAudioEvent, LIVE_EVENT_LIMITS, liveEventCall, liveTokenHash, consumeLiveRate, opusDescription } from '../worker/src/liveEvents.js';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch (error) {
    if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error;
}
const suite = (name, fn) => test(name, { skip: !DatabaseSync && 'Requires Node 24 SQLite' }, fn);
const ORIGIN = 'https://nocturne.mitwee.nl';
const SDP = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
class Socket {
    constructor() { this.sent = []; this.handlers = {}; }
    accept() {}
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code, reason) { this.closed = code; this.reason = reason; }
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
    last(type) { return this.sent.filter(msg => msg.type === type).at(-1); }
}
function fixture(t, capacity = 32) {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE kv (namespace TEXT, key TEXT, value TEXT, PRIMARY KEY(namespace,key));');
    db.exec('CREATE TABLE access_rate_limits (key TEXT PRIMARY KEY, count INTEGER, expires_at INTEGER);');
    db.exec('CREATE TABLE public_rooms (room TEXT PRIMARY KEY, people INTEGER, locked INTEGER, expires_at INTEGER);');
    const pending = [];
    const states = new Map(), rooms = new Map(), events = new Map();
    function state(name) {
        if (states.has(name)) return states.get(name);
        const value = {
            waitUntil(promise) { pending.push(Promise.resolve(promise).catch(() => {})); },
            storage: {
                async get(key) {
                    const row = db.prepare('SELECT value FROM kv WHERE namespace=? AND key=?').get(name, key);
                    return row ? JSON.parse(row.value) : undefined;
                },
                async put(key, data) {
                    db.prepare('INSERT OR REPLACE INTO kv VALUES(?,?,?)').run(name, key, JSON.stringify(data));
                },
                async setAlarm(at) { value.alarmAt = at; }
            }
        };
        states.set(name, value);
        return value;
    }
    const env = { MEDIA_TRANSPORT: 'sfu', SFU_APP_ID: 'event-test', SFU_APP_SECRET: 'test-only',
        ROOM_CAPACITY: String(capacity), ALLOWED_ORIGINS: ORIGIN };
    env.DB = {
        prepare(sql) {
            return { bind(...args) {
                return { sql, args,
                    async first() { return db.prepare(sql).get(...args) || null; },
                    async all() { return { results: db.prepare(sql).all(...args) }; },
                    async run() { return db.prepare(sql).run(...args); }
                };
            } };
        },
        async batch(statements) {
            db.exec('BEGIN');
            try {
                const result = statements.map(({ sql, args }) => ({
                    results: /RETURNING|^\s*SELECT/i.test(sql) ? db.prepare(sql).all(...args) : (db.prepare(sql).run(...args), [])
                }));
                db.exec('COMMIT');
                return result;
            } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
    };
    env.CLUB_ROOM = {
        idFromName: name => name,
        get(name) {
            if (!rooms.has(name)) { const room = new ClubRoom(state(`room:${name}`), env); room._roomName = name; rooms.set(name, room); }
            return { fetch: request => rooms.get(name).fetch(request) };
        }
    };
    env.LIVE_AUDIO_EVENT = {
        idFromName: name => name,
        get(name) {
            if (!events.has(name)) events.set(name, new LiveAudioEvent(state(`event:${name}`), env));
            return { fetch: request => events.get(name).fetch(request) };
        }
    };
    const room = name => { env.CLUB_ROOM.get(name); return rooms.get(name); };
    const join = (name = 'lobby', pid = crypto.randomUUID().replaceAll('-', '').slice(0, 16)) => {
        const target = room(name), ws = new Socket();
        const session = target._acceptSession(ws, 'Guest', pid);
        return { room: target, ws, session };
    };
    async function settle() {
        for (let i = 0; i < 12; i++) {
            await Promise.all([...rooms.values()].flatMap(r => [r._liveQueue, r.media?.queue]));
            await Promise.all([...events.values()].flatMap(e => [e.queue, e.media.queue]));
            await Promise.all(pending.splice(0));
            await new Promise(resolve => setImmediate(resolve));
        }
    }
    async function request(guest, action, extra = {}, number = 1) {
        guest.room._liveRequest(guest.ws, guest.session, { type: 'event', request: number, action, ...extra });
        await settle();
        return guest.ws.last('event-result');
    }
    async function create(guest = join()) {
        const result = await request(guest, 'create', { title: 'Live test set' });
        assert.ok(result.event, JSON.stringify(result));
        return { guest, result, event: events.get(result.event.id), id: result.event.id };
    }
    t.after(async () => {
        for (const r of rooms.values()) for (const [ws, member] of [...r.sessions]) r._onClose(ws, member);
        for (const e of events.values()) for (const [ws] of [...e.sessions]) e._close(ws);
        await settle();
        for (const e of events.values()) if (e.media.retryTimer) clearTimeout(e.media.retryTimer);
        db.close();
    });
    return { env, db, state, rooms, events, room, join, settle, request, create };
}
function provider(t) {
    const original = globalThis.fetch;
    const calls = [];
    let index = 0;
    globalThis.fetch = async (url, init) => {
        const body = init.body && JSON.parse(init.body);
        calls.push({ url, body, method: init.method });
        if (url.endsWith('/sessions/new')) return Response.json({ sessionId: `provider-${++index}` });
        if (url.endsWith('/tracks/new')) return Response.json({
            tracks: body.tracks.map((track, i) => ({ ...track, mid: String(i) })),
            sessionDescription: { type: body.sessionDescription ? 'answer' : 'offer', sdp: SDP }
        });
        if (url.endsWith('/tracks/close')) return Response.json({ tracks: body.tracks });
        return Response.json({});
    };
    t.after(() => { globalThis.fetch = original; });
    return calls;
}
async function authenticate(event, role, token) {
    const ws = new Socket(), session = event._acceptMedia(ws);
    await event._onMedia(ws, session, { data: JSON.stringify({ type: 'event-auth', role, token }) });
    return { ws, session };
}
async function media(event, guest, msg) {
    await event._onMedia(guest.ws, guest.session, { data: JSON.stringify(msg) });
    for (let i = 0; i < 5; i++) { await event.media.queue; await event.queue; }
}
async function admit(f, id, pid = crypto.randomUUID().replaceAll('-', '').slice(0, 16), extra = {}) {
    const reservation = await liveEventCall(f.env, id, 'reserve', { pid, ...extra });
    const target = f.room(reservation.room);
    await target._liveReady;
    target._liveEvent = { id };
    const member = crypto.randomUUID();
    const result = await liveEventCall(f.env, id, 'admit', { pid, member, room: reservation.room, reservation: reservation.reservation });
    const ws = new Socket();
    const session = target._acceptSession(ws, 'Listener', pid, 'any', false, null, null, null, { id: member, event: result.event });
    assert.ok(session);
    return { room: target, ws, session, token: result.event.listenerToken, index: result.event.roomIndex };
}

suite('live events: host-only creation, private ticket notifications, hash-only durable invitation and creator ownership', async t => {
    const f = fixture(t);
    const owner = f.join(), guest = f.join();
    assert.equal(owner.ws.last('welcome').liveEvents, true);
    assert.equal(owner.ws.last('welcome').room, 'lobby');
    assert.match((await f.request(guest, 'create')).error, /host/);
    const { event, id, result } = await f.create(owner);
    assert.equal(result.event.roomIndex, 0);
    assert.equal(result.event.canManage, true);
    assert.match(result.publisherToken, /^[a-f0-9]{64}$/);
    const otherTicket = guest.ws.last('event-state').event;
    assert.equal(otherTicket.canManage, false);
    assert.notEqual(otherTicket.listenerToken, result.event.listenerToken);
    assert.equal(guest.ws.sent.some(msg => 'publisherToken' in msg), false);
    const persisted = await event.state.storage.get('event');
    assert.equal(JSON.stringify(persisted).includes(result.publisherToken), false);
    assert.equal(JSON.stringify(persisted).includes(result.event.listenerToken), false);
    assert.equal(persisted.publisherHash, await liveTokenHash('publisher', result.publisherToken));
    assert.equal((await f.request(owner, 'info')).publisherToken, undefined);
    owner.room.hostId = guest.session.id;
    assert.match((await f.request(guest, 'rotate')).error, /creator/);
    const rotated = await f.request(owner, 'rotate');
    assert.ok(rotated.publisherToken);
    assert.equal(rotated.event.listenerToken, result.event.listenerToken);
    assert.match((await f.request(guest, 'create')).error, /already/);
    assert.equal(event.event.rooms[0], 'lobby');
    assert.equal(id, result.event.id);
});

suite('live events: eight authoritative rooms, 256 occupants, no peer copies or overflow directory leakage', async t => {
    const f = fixture(t);
    const { id, event } = await f.create();
    for (let i = 1; i < 256; i++) {
        const listener = await admit(f, id);
        assert.equal(listener.index, Math.floor(i / 32));
        assert.equal(listener.ws.last('welcome').room, event.event.rooms[Math.floor(i / 32)]);
        assert.equal(listener.ws.last('welcome').liveEvent.id, id);
    }
    assert.equal(event.event.rooms.length, 8);
    assert.equal(Object.keys(event.event.members).length, 256);
    assert.ok(event.event.rooms.slice(1).every(name => name.startsWith('private-')));
    assert.equal([...f.rooms.values()].reduce((sum, room) => sum + room.sessions.size, 0), 256);
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '1234567890123456' }), /full/);
    assert.equal(f.room('lobby').sessions.size, 32);
});

suite('live events: reservations serialize concurrent admissions and expire; coordinator survives restart with policy', async t => {
    const f = fixture(t, 8);
    const { id, event } = await f.create();
    const reservations = await Promise.all(Array.from({ length: 15 }, () =>
        liveEventCall(f.env, id, 'reserve', { pid: '1111111111111111' })));
    assert.equal(reservations.filter(r => r.room === 'lobby').length, 7);
    assert.equal(event.event.rooms.length, 2);
    for (const reservation of Object.values(event.event.reservations)) reservation.expires = Date.now() - 1;
    await event.alarm();
    assert.equal(Object.keys(event.event.reservations).length, 0);
    await liveEventCall(f.env, id, 'policy', { room: 'lobby', denied: '1111111111111111', locked: true });
    const restored = new LiveAudioEvent(event.state, f.env);
    await restored.ready;
    assert.equal(restored.event.locked, true);
    assert.ok(restored.event.denied.includes('1111111111111111'));
    assert.equal(restored.event.rooms.length, 2);
    assert.ok(event.state.alarmAt);
});

suite('live events: bans/kicks and locks prevent overflow bypass and root constraints remain authoritative', async t => {
    const f = fixture(t, 8);
    const { id, event, guest: owner } = await f.create();
    const victim = await admit(f, id);
    owner.room._onMessage(owner.ws, owner.session, { data: JSON.stringify({ type: 'kick', target: victim.session.id }) });
    await f.settle();
    assert.equal(victim.ws.closed, 4010);
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: victim.session.pid }), /denied/);
    owner.room.banned.add('2222222222222222');
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '2222222222222222' }), /Original room/);
    owner.room.locked = true;
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '3333333333333333' }), /Original room/);
    owner.room.locked = false;
    await liveEventCall(f.env, id, 'policy', { room: 'lobby', locked: true });
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '3333333333333333' }), /denied/);
    assert.equal(event.event.rooms.length, 1);
});

suite('live events: one Opus publisher serves direct subscriptions across rooms; voice/video/data and role escalation rejected', async t => {
    const f = fixture(t, 8), calls = provider(t);
    const { id, event, result } = await f.create();
    for (let i = 0; i < 7; i++) await admit(f, id);
    const admitted = await admit(f, id);
    assert.equal(admitted.index, 1);
    const publisher = await authenticate(event, 'publisher', result.publisherToken);
    const listener = await authenticate(event, 'listener', admitted.token);
    assert.equal(publisher.ws.last('live-welcome').role, 'publisher');
    assert.equal(listener.ws.last('live-welcome').event.live, false);
    await media(event, publisher, { type: 'media-control', music: { available: true, playing: true, title: 'Live' } });
    await media(event, listener, { type: 'media-control', listen: true });
    await media(event, publisher, { type: 'sfu', request: 1, slot: 'musicPub', action: 'publish', mid: '0', description: { type: 'offer', sdp: SDP } });
    await media(event, publisher, { type: 'sfu', request: 2, slot: 'musicPub', action: 'ready' });
    await f.settle();
    assert.equal(event.event.live, true);
    assert.equal(admitted.ws.last('event-state').event.live, true);
    const tracks = listener.ws.last('media-catalog').tracks;
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].owner, publisher.session.id);
    await media(event, listener, { type: 'sfu', request: 1, slot: 'musicRx', action: 'subscribe', owners: [publisher.session.id] });
    assert.equal(listener.ws.last('sfu-result').error, undefined);
    const publications = calls.filter(call => call.body?.tracks?.some(track => track.location === 'local'));
    const subscriptions = calls.filter(call => call.body?.tracks?.some(track => track.location === 'remote'));
    assert.equal(publications.length, 1);
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].body.tracks[0].sessionId, 'provider-1');
    assert.equal(JSON.stringify(listener.ws.sent).includes('provider-'), false);
    for (const slot of ['voicePub', 'voiceRx', 'musicPub']) {
        await media(event, listener, { type: 'sfu', request: 3, slot, action: 'publish', mid: '0', description: { type: 'offer', sdp: SDP } });
        assert.match(listener.ws.last('sfu-result').error, /Opus/);
    }
    await media(event, publisher, { type: 'sfu', request: 4, slot: 'musicPub', action: 'publish', mid: '0',
        description: { type: 'offer', sdp: SDP + 'm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' } });
    assert.ok(publisher.ws.last('sfu-result').error);
    assert.equal(calls.filter(call => call.body?.tracks?.some(track => track.location === 'local')).length, 1);
});

suite('live events: rotation revokes old secrets, duplicate publishers/listeners fail, departed tickets cannot reconnect', async t => {
    const f = fixture(t);
    const { id, event, result, guest: owner } = await f.create();
    const publisher = await authenticate(event, 'publisher', result.publisherToken);
    await assert.rejects(authenticate(event, 'publisher', result.publisherToken), /Publisher denied/);
    const admitted = await admit(f, id);
    const listener = await authenticate(event, 'listener', admitted.token);
    await assert.rejects(authenticate(event, 'listener', admitted.token), /Listener denied/);
    await media(event, listener, { type: 'ping', time: 123 });
    assert.equal(listener.ws.last('pong').time, 123);
    event._close(listener.ws);
    const reconnected = await authenticate(event, 'listener', admitted.token);
    assert.equal(reconnected.ws.last('live-welcome').role, 'listener');
    const rotated = await f.request(owner, 'rotate');
    assert.ok(rotated.publisherToken);
    assert.equal(publisher.ws.closed, 4010);
    await assert.rejects(authenticate(event, 'publisher', result.publisherToken), /Publisher denied/);
    assert.equal((await authenticate(event, 'publisher', rotated.publisherToken)).ws.last('live-welcome').role, 'publisher');
    admitted.room._onClose(admitted.ws, admitted.session);
    await f.settle();
    assert.equal(reconnected.ws.closed, 4010);
    await assert.rejects(authenticate(event, 'listener', admitted.token), /Listener denied/);
});

suite('live events: creator blocks revoke subscription visibility, end and lifetime expiry withdraw all media explicitly', async t => {
    const f = fixture(t), calls = provider(t);
    const { id, event, guest: owner, result } = await f.create();
    const admitted = await admit(f, id);
    const publisher = await authenticate(event, 'publisher', result.publisherToken);
    const listener = await authenticate(event, 'listener', admitted.token);
    await media(event, publisher, { type: 'media-control', music: { available: true, playing: true } });
    await media(event, listener, { type: 'media-control', listen: true });
    await media(event, publisher, { type: 'sfu', request: 1, slot: 'musicPub', action: 'publish', mid: '0', description: { type: 'offer', sdp: SDP } });
    await media(event, publisher, { type: 'sfu', request: 2, slot: 'musicPub', action: 'ready' });
    await media(event, listener, { type: 'sfu', request: 1, slot: 'musicRx', action: 'subscribe', owners: [publisher.session.id] });
    owner.session.blocked.add(admitted.session.pid);
    owner.room._liveHeartbeat();
    await f.settle();
    assert.equal(listener.ws.last('media-catalog').tracks.length, 0);
    assert.ok(listener.ws.last('media-reset'));
    assert.ok(calls.some(call => call.url.endsWith('/tracks/close')));
    const ended = await f.request(owner, 'end');
    assert.equal(ended.event.ended, true);
    assert.equal(ended.event.live, false);
    assert.equal(listener.ws.last('event-status').event.ended, true);
    assert.ok(listener.ws.closed);
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '3333333333333333' }), /ended/);
    const stored = await event.state.storage.get('event');
    assert.equal(stored.publisherHash, null);
    assert.equal((await event.state.storage.get('sfuCleanup')).length, 0);
    const other = await f.create(f.join('private-second'));
    other.event.event.expires = Date.now() - 1;
    await other.event.alarm();
    assert.equal(other.event.event.ended, true);
    assert.equal(LIVE_EVENT_LIMITS.lifetimeMs, 43200000);
});

suite('live events: stale members/reservations and idle unauthenticated sockets are bounded', async t => {
    const f = fixture(t);
    const { id, event } = await f.create();
    const admitted = await admit(f, id);
    const listener = await authenticate(event, 'listener', admitted.token);
    event.event.members[admitted.session.id].expires = Date.now() - 1;
    const unauth = new Socket(), pending = event._acceptMedia(unauth);
    pending.at = Date.now() - LIVE_EVENT_LIMITS.idleMs - 1;
    await event.alarm();
    assert.equal(event.event.members[admitted.session.id], undefined);
    assert.equal(listener.ws.closed, 4010);
    assert.equal(unauth.closed, 4013);
    const malformed = new Socket(), connection = event._acceptMedia(malformed);
    await event._onMedia(malformed, connection, { data: JSON.stringify({ type: 'sfu', slot: 'musicPub', action: 'publish' }) });
    assert.equal(malformed.closed, 4003);
});

suite('live events: public route strips forged internal headers, rejects secret URLs/internal paths and validates Origin', async t => {
    const f = fixture(t);
    const { id } = await f.create();
    const call = (path, headers = {}) => relay.fetch(new Request(`https://relay.example${path}`, {
        headers: { Origin: ORIGIN, Upgrade: 'websocket', ...headers }
    }), f.env);
    assert.equal((await call(`/live/${id}/media?token=secret`)).status, 400);
    assert.equal((await call(`/live/${id}/media`, { Origin: 'https://evil.example' })).status, 403);
    for (const path of ['/live-member', '/live-access', '/live-state']) assert.equal((await call(path)).status, 404);
    assert.equal((await call('/?event=not-a-uuid')).status, 400);
    assert.equal((await call(`/?event=${id}`)).status, 400);
    let seen;
    f.env.CLUB_ROOM = { idFromName: name => name, get: () => ({ async fetch(request) { seen = request; return new Response('stub'); } }) };
    await call('/?room=unbound', { 'X-Live-Event': id, 'X-Live-Reservation': 'forged', Cookie: 'private=value' });
    assert.equal(seen.headers.get('X-Live-Event'), null);
    assert.equal(seen.headers.get('X-Live-Reservation'), null);
    assert.equal(seen.headers.get('Cookie'), null);
});

suite('live events: real public invite routing finalizes in room, exposes assigned room, never retries access denial', async t => {
    const f = fixture(t, 8);
    const { id, event } = await f.create();
    for (let i = 0; i < 7; i++) await admit(f, id);
    const originalResponse = globalThis.Response, originalPair = globalThis.WebSocketPair;
    globalThis.Response = class extends originalResponse {
        constructor(body, init) {
            if (init?.status === 101) return { status: 101, webSocket: init.webSocket };
            super(body, init);
        }
    };
    const pairs = [];
    globalThis.WebSocketPair = class {
        constructor() { this[0] = new Socket(); this[1] = new Socket(); pairs.push(this); }
    };
    t.after(() => { globalThis.Response = originalResponse; globalThis.WebSocketPair = originalPair; });
    const url = `https://relay.example/?event=${id}&uid=00000000-0000-4000-8000-000000000001&media=sfu&name=Guest`;
    const response = await relay.fetch(new Request(url, { headers: { Upgrade: 'websocket', Origin: ORIGIN } }), f.env);
    assert.equal(response.status, 101);
    const welcome = pairs[0][1].last('welcome');
    assert.equal(welcome.liveEvent.roomIndex, 1);
    assert.equal(welcome.room, event.event.rooms[1]);
    assert.match(welcome.liveEvent.listenerToken, /^[a-f0-9]{64}$/);
    const pid = await derivePid('00000000-0000-4000-8000-000000000001');
    await liveEventCall(f.env, id, 'policy', { room: 'lobby', denied: pid });
    assert.equal((await relay.fetch(new Request(url, { headers: { Upgrade: 'websocket', Origin: ORIGIN } }), f.env)).status, 403);
    assert.equal(pairs.length, 1);
});

suite('live events: final social-room capacity triggers bounded overflow retry, not failed or displaced admission', async t => {
    const f = fixture(t, 8);
    const { id, event } = await f.create();
    // Simulate coordinator occupancy lag: final admission still belongs to the actual room.
    for (let i = 0; i < 7; i++) f.join('lobby');
    const originalResponse = globalThis.Response, originalPair = globalThis.WebSocketPair;
    globalThis.Response = class extends originalResponse {
        constructor(body, init) {
            if (init?.status === 101) return { status: 101, webSocket: init.webSocket };
            super(body, init);
        }
    };
    const pairs = [];
    globalThis.WebSocketPair = class {
        constructor() { this[0] = new Socket(); this[1] = new Socket(); pairs.push(this); }
    };
    t.after(() => { globalThis.Response = originalResponse; globalThis.WebSocketPair = originalPair; });
    const response = await relay.fetch(new Request(`https://relay.example/?event=${id}&uid=00000000-0000-4000-8000-000000000002&sfu=1`, {
        headers: { Upgrade: 'websocket', Origin: ORIGIN }
    }), f.env);
    assert.equal(response.status, 101);
    assert.equal(pairs[0][1].last('welcome').liveEvent.roomIndex, 1);
    assert.equal(f.room('lobby').sessions.size, 8);
    assert.equal(event.event.rooms.length, 2);
    assert.equal(Object.keys(event.event.reservations).length, 0);
});

suite('live events: failed provider revocation persists cleanup and expiry alarm retries without reopening media', async t => {
    const f = fixture(t);
    const original = globalThis.fetch;
    const calls = provider(t);
    const working = globalThis.fetch;
    let failClose = false;
    globalThis.fetch = async (url, init) => {
        if (failClose && url.endsWith('/tracks/close')) return Response.json({ errorCode: 'unavailable' }, { status: 503 });
        return working(url, init);
    };
    t.after(() => { globalThis.fetch = original; });
    const { event, result, guest: owner } = await f.create();
    const publisher = await authenticate(event, 'publisher', result.publisherToken);
    await media(event, publisher, { type: 'media-control', music: { available: true, playing: true } });
    await media(event, publisher, { type: 'sfu', request: 1, slot: 'musicPub', action: 'publish', mid: '0', description: { type: 'offer', sdp: SDP } });
    await media(event, publisher, { type: 'sfu', request: 2, slot: 'musicPub', action: 'ready' });
    failClose = true;
    await f.request(owner, 'end');
    assert.equal(event.event.live, false);
    assert.equal(event.event.ended, true);
    assert.equal(event.media.members.size, 0);
    assert.equal((await event.state.storage.get('sfuCleanup')).length, 1);
    assert.ok(event.state.alarmAt);
    failClose = false;
    await event.alarm();
    await f.settle();
    assert.equal((await event.state.storage.get('sfuCleanup')).length, 0);
    assert.ok(calls.some(call => call.url.endsWith('/tracks/close')));
});

suite('live events: durable global and per-IP rate limits are atomic and do not store raw identifiers', async t => {
    const f = fixture(t);
    const env = { DB: { prepare(sql) { return { bind(...args) { return { async first() { return f.db.prepare(sql).get(...args); } }; } }; } } };
    const results = await Promise.all(Array.from({ length: 10 }, () => consumeLiveRate(env, 'create-ip', '192.0.2.15', 5, 60000)));
    assert.equal(results.filter(Boolean).length, 5);
    const row = f.db.prepare('SELECT * FROM access_rate_limits').get();
    assert.equal(row.count, 6);
    assert.equal(row.key.includes('192.0.2.15'), false);
    f.db.prepare('UPDATE access_rate_limits SET expires_at=0').run();
    assert.equal(await consumeLiveRate(env, 'create-ip', '192.0.2.15', 5, 60000), true);
});

suite('live events: ordinary rooms without binding retain existing mesh and SFU behavior', async t => {
    const f = fixture(t);
    delete f.env.LIVE_AUDIO_EVENT;
    const guest = f.join('ordinary');
    assert.equal(guest.ws.last('welcome').liveEvents, undefined);
    guest.room._onMessage(guest.ws, guest.session, { data: JSON.stringify({ type: 'music', url: 'https://audio.example/set.mp3', playing: true }) });
    assert.equal(guest.room.musicState.url, 'https://audio.example/set.mp3');
    assert.match((await f.request(guest, 'create')).error, /configured SFU/);
});

suite('live events: missing D1 disables capability and refuses creation explicitly without changing ordinary rooms', async t => {
    const f = fixture(t);
    delete f.env.DB;
    const guest = f.join('ordinary-without-d1');
    assert.equal(guest.ws.last('welcome').liveEvents, undefined);
    const result = await f.request(guest, 'create');
    assert.match(result.error, /D1 DB binding.*durable usage limits/);
    assert.equal(f.events.size, 0);
    assert.equal(guest.room._liveEvent, null);
    guest.room._onMessage(guest.ws, guest.session, { data: JSON.stringify({
        type: 'music', url: 'https://audio.example/ordinary.mp3', playing: true
    }) });
    assert.equal(guest.room.musicState.url, 'https://audio.example/ordinary.mp3');
    await assert.rejects(consumeLiveRate(f.env, 'create-global', 'all', 60, 3600000), /D1 DB binding/);
});

test('live events: browser offers negotiate only Opus; video/data/non-Opus cannot allocate', () => {
    const input = { type: 'offer', sdp: SDP.replace('SAVPF 111', 'SAVPF 111 0 101') +
        'a=rtpmap:0 PCMU/8000\r\na=rtpmap:101 telephone-event/8000\r\na=fmtp:101 0-16\r\n' };
    const description = opusDescription(input);
    assert.ok(description.sdp.includes('SAVPF 111\r\n'));
    assert.equal(/PCMU|telephone-event|fmtp:101/.test(description.sdp), false);
    assert.equal(opusDescription({ type: 'offer', sdp: 'v=0\r\nm=audio 9 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n' }), null);
    for (const media of ['video 9 RTP/AVP 96', 'application 9 UDP/DTLS/SCTP webrtc-datachannel']) {
        assert.equal(opusDescription({ type: 'offer', sdp: SDP + `m=${media}\r\n` }), null);
    }
    assert.equal(opusDescription({ type: 'offer', sdp: SDP.replace('SAVPF 111', 'SAVPF 0') }), null);
});

suite('live events: end notifies before detaching, restores ordinary music in root and overflow, and allows a later event', async t => {
    const f = fixture(t, 8);
    provider(t);
    const { id, guest: owner } = await f.create();
    for (let i = 0; i < 7; i++) await admit(f, id);
    const overflow = await admit(f, id);
    const originalRootMembers = owner.room.sessions.size;
    const ordinaryMusic = guest => guest.room._onMessage(guest.ws, guest.session, {
        data: JSON.stringify({ type: 'music', url: 'https://audio.example/ordinary.mp3', playing: true })
    });
    ordinaryMusic(owner);
    assert.equal(owner.room.musicState, null);
    const ended = await f.request(owner, 'end');
    assert.equal(ended.event.ended, true);
    for (const guest of [owner, overflow]) {
        assert.equal(guest.ws.last('event-state').event.ended, true);
        assert.equal(guest.room._liveEvent, null);
        assert.equal(await guest.room.state.storage.get('liveEvent'), null);
        ordinaryMusic(guest);
        assert.equal(guest.room.musicState.url, 'https://audio.example/ordinary.mp3');
        guest.room._onMessage(guest.ws, guest.session, { data: JSON.stringify({
            type: 'media-control', music: { available: true, playing: true, title: 'Ordinary music' }
        }) });
        assert.equal(guest.room.media.members.get(guest.session.id).music.available, true);
        guest.room._onMessage(guest.ws, guest.session, { data: JSON.stringify({
            type: 'sfu', request: 50, slot: 'musicPub', action: 'publish', mid: '0',
            description: { type: 'offer', sdp: SDP }
        }) });
    }
    await f.settle();
    assert.equal(owner.ws.last('sfu-result').error, undefined);
    assert.equal(overflow.ws.last('sfu-result').error, undefined);
    assert.equal(owner.room.sessions.size, originalRootMembers);
    assert.equal(overflow.room.sessions.size, 1);
    assert.equal(privateRoomName(overflow.room._roomName), true);
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '3333333333333333' }), /ended/);
    assert.match((await f.request(owner, 'create')).error, /one minute/);
    await owner.room.state.storage.put('lastEventCreated', Date.now() - 60001);
    const next = await f.request(owner, 'create');
    assert.ok(next.event);
    assert.notEqual(next.event.id, id);
    assert.ok(next.event.listenerToken);
    assert.equal(next.event.ended, false);
    assert.equal(owner.room._liveEvent.id, next.event.id);
    const restored = new ClubRoom(owner.room.state, f.env);
    await restored._liveReady;
    assert.equal(restored._liveEvent.id, next.event.id);
});

suite('live events: expiry restores ordinary root music while the expired invitation stays closed', async t => {
    const f = fixture(t);
    const { id, event, guest: owner } = await f.create();
    event.event.expires = Date.now() - 1;
    await event.alarm();
    await f.settle();
    assert.equal(owner.ws.last('event-state').event.ended, true);
    assert.equal(owner.room._liveEvent, null);
    const restored = new ClubRoom(owner.room.state, f.env);
    await restored._liveReady;
    assert.equal(restored._liveEvent, null);
    owner.room._onMessage(owner.ws, owner.session, { data: JSON.stringify({
        type: 'music', url: 'https://audio.example/after-expiry.mp3', playing: true
    }) });
    assert.equal(owner.room.musicState.url, 'https://audio.example/after-expiry.mp3');
    await assert.rejects(liveEventCall(f.env, id, 'reserve', { pid: '3333333333333333' }), /ended/);
});
