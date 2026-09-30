// Protocol and abuse-control tests for the multiplayer relay (worker/src/index.js).
// The Durable Object is exercised directly with fake sockets; no Cloudflare runtime
// is needed because the relay only touches WebSocket-like objects, URL and crypto.

import test from 'node:test';
import assert from 'node:assert/strict';

const relay = await import('../worker/src/index.js');
const {
    ClubRoom, TokenBucket, isAllowedOrigin, sanitizeName, sanitizeState, sanitizeMusicUrl,
    MAX_ROOM_SIZE, MAX_FRAME_BYTES, CLOSE_ROOM_FULL, CLOSE_FLOODING, ALLOWED_EMOJI
} = relay;

class FakeSocket {
    constructor() {
        this.sent = [];
        this.listeners = {};
        this.closed = null;
    }
    accept() {}
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code, reason) { this.closed = { code, reason }; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type, data) { for (const fn of this.listeners[type] || []) fn({ data }); }
    message(obj) { this.emit('message', typeof obj === 'string' ? obj : JSON.stringify(obj)); }
    last(type) { return this.sent.filter(m => m.type === type).at(-1); }
}

function join(room, name = 'Guest') {
    const ws = new FakeSocket();
    const session = room._acceptSession(ws, name);
    return { ws, session };
}

test('relay welcomes, announces joins, and hands host to the next guest on leave', () => {
    const room = new ClubRoom({});
    const a = join(room, 'A');
    const b = join(room, 'B');
    assert.equal(a.ws.sent[0].type, 'welcome');
    assert.equal(a.ws.sent[0].hostId, a.session.id);
    assert.deepEqual(b.ws.sent[0].peers.map(p => p.name), ['A']);
    assert.equal(a.ws.last('join').name, 'B');

    a.ws.emit('close');
    assert.equal(room.hostId, b.session.id);
    assert.equal(b.ws.last('host').id, b.session.id);
    assert.equal(b.ws.last('leave').id, a.session.id);
});

test('only the host may publish music, and only http(s) URLs survive', () => {
    const room = new ClubRoom({});
    const host = join(room);
    const guest = join(room);

    guest.ws.message({ type: 'music', url: 'https://evil.example/a.mp3', playing: true });
    assert.equal(room.musicState, null);

    host.ws.message({ type: 'music', url: 'blob:https://club.example/123', playing: true, position: 12 });
    assert.equal(guest.ws.last('music').url, null);

    host.ws.message({ type: 'music', url: 'https://radio.example/live', playing: true, position: 3 });
    assert.equal(guest.ws.last('music').url, 'https://radio.example/live');
    assert.equal(guest.ws.last('music').position, 3);
});

test('rooms are capped and the overflow socket is closed with a room-full code', () => {
    const room = new ClubRoom({});
    for (let i = 0; i < MAX_ROOM_SIZE; i++) join(room);
    const overflow = join(room);
    assert.equal(overflow.session, null);
    assert.equal(overflow.ws.closed.code, CLOSE_ROOM_FULL);
    assert.equal(room.sessions.size, MAX_ROOM_SIZE);
});

test('oversize frames, unknown types and non-allow-listed emoji are dropped', () => {
    const room = new ClubRoom({});
    const a = join(room);
    const b = join(room);
    const before = b.ws.sent.length;

    a.ws.message({ type: 'emoji', emoji: 'x'.repeat(8) });
    a.ws.message({ type: 'shout', text: 'hi' });
    a.ws.message(JSON.stringify({ type: 'state', state: { x: 1 }, pad: 'x'.repeat(MAX_FRAME_BYTES) }));
    assert.equal(b.ws.sent.length, before);

    a.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[0] });
    assert.equal(b.ws.last('emoji').emoji, ALLOWED_EMOJI[0]);
});

test('per-connection rate limits throttle floods and close persistent flooders', () => {
    const room = new ClubRoom({});
    const a = join(room);
    const b = join(room);
    for (let i = 0; i < 50; i++) a.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[0] });
    const delivered = b.ws.sent.filter(m => m.type === 'emoji').length;
    assert.ok(delivered <= 5, `expected the emoji burst to be throttled, delivered ${delivered}`);

    for (let i = 0; i < 400; i++) a.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[0] });
    assert.equal(a.ws.closed.code, CLOSE_FLOODING);
    assert.equal(room.sessions.has(a.ws), false);
    assert.equal(b.ws.last('leave').id, a.session.id);
});

test('state samples are finite, bounded and carry a normalised yaw', () => {
    const sample = sanitizeState({ x: 'Infinity', y: NaN, z: 1e9, rotY: 3 * Math.PI });
    assert.deepEqual({ x: sample.x, y: sample.y, z: sample.z }, { x: 0, y: 0, z: 500 });
    assert.ok(Math.abs(Math.abs(sample.rotY) - Math.PI) < 1e-9);
    assert.ok(Math.abs(sanitizeState({ rotY: -7 }).rotY) <= Math.PI);
    assert.equal(sanitizeState(null), null);
});

test('rtc-signal is relayed only to a different, existing peer', () => {
    const room = new ClubRoom({});
    const a = join(room);
    const b = join(room);
    a.ws.message({ type: 'rtc-signal', target: b.session.id, signal: { kind: 'offer', sdp: {} } });
    assert.equal(b.ws.last('rtc-signal').from, a.session.id);
    const count = a.ws.sent.length;
    a.ws.message({ type: 'rtc-signal', target: a.session.id, signal: { kind: 'offer' } });
    a.ws.message({ type: 'rtc-signal', target: 'nobody', signal: { kind: 'offer' } });
    assert.equal(a.ws.sent.length, count);
});

test('names are stripped of control characters and truncated by code point', () => {
    assert.equal(sanitizeName('\u0000Bad\u202EName\n'), 'BadName');
    assert.equal(sanitizeName(''), 'Guest');
    const emojiName = '🎉'.repeat(40);
    const clean = sanitizeName(emojiName);
    assert.equal(Array.from(clean).length, 32);
    assert.ok(!/[\uD800-\uDBFF]$/.test(clean), 'must not end on a lone high surrogate');
});

test('origins: production and private-network pages are allowed, other sites are refused', async () => {
    assert.equal(isAllowedOrigin('https://my-pwa-apps.github.io'), true);
    assert.equal(isAllowedOrigin('http://localhost:8000'), true);
    assert.equal(isAllowedOrigin('http://192.168.1.20:8000'), true);
    assert.equal(isAllowedOrigin('https://evil.example'), false);
    assert.equal(isAllowedOrigin(null), false);
    assert.equal(isAllowedOrigin('https://my-pwa-apps.github.io.evil.example'), false);

    let forwarded = 0;
    const env = {
        CLUB_ROOM: {
            idFromName: name => name,
            get: () => ({ fetch: () => { forwarded++; return new Response(null, { status: 200 }); } })
        }
    };
    const refused = await relay.default.fetch(new Request('https://relay.example/?room=x', {
        headers: { Origin: 'https://evil.example', Upgrade: 'websocket' }
    }), env);
    assert.equal(refused.status, 403);
    assert.equal(forwarded, 0);

    await relay.default.fetch(new Request('https://relay.example/?room=x', {
        headers: { Origin: 'https://my-pwa-apps.github.io', Upgrade: 'websocket' }
    }), env);
    assert.equal(forwarded, 1);

    const custom = { ...env, ALLOWED_ORIGINS: 'https://club.example' };
    const res = await relay.default.fetch(new Request('https://relay.example/', {
        headers: { Origin: 'https://club.example' }
    }), custom);
    assert.equal(res.status, 200);
});

test('token bucket refills at its configured rate', () => {
    const bucket = new TokenBucket({ rate: 2, burst: 2 }, 0);
    assert.equal(bucket.take(0), true);
    assert.equal(bucket.take(0), true);
    assert.equal(bucket.take(0), false);
    assert.equal(bucket.take(500), true);
    assert.equal(bucket.take(500), false);
});

test('music URL sanitiser rejects local, data and credentialed URLs', () => {
    assert.equal(sanitizeMusicUrl('blob:https://x/1'), null);
    assert.equal(sanitizeMusicUrl('data:audio/wav;base64,AA'), null);
    assert.equal(sanitizeMusicUrl('https://u:p@x.example/a'), null);
    assert.equal(sanitizeMusicUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeMusicUrl('https://x.example/a'), 'https://x.example/a');
});
