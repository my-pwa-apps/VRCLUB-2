// Protocol and abuse-control tests for the multiplayer relay (worker/src/relay.js).
// The Durable Object is exercised directly with fake sockets; no Cloudflare runtime
// is needed because the relay only touches WebSocket-like objects, URL and crypto.

import test from 'node:test';
import assert from 'node:assert/strict';

const relay = await import('../worker/src/relay.js');
const {
    ClubRoom, TokenBucket, isAllowedOrigin, sanitizeName, sanitizeState, sanitizeMusicUrl, sanitizeShow, sanitizeTitle, sanitizePool, AVATAR_POOLS, sanitizeChat, MAX_CHAT_LENGTH, IDLE_CLOSE_MS, CLOSE_IDLE,
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

test('frames still queued on a flood-closed socket are never relayed for the departed id', () => {
    const room = new ClubRoom({});
    const a = join(room);
    const b = join(room);
    for (let i = 0; i < 450; i++) a.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[0] });
    assert.equal(a.ws.closed.code, CLOSE_FLOODING);
    const before = b.ws.sent.length;
    // Buckets refill with time; a late frame must still be ignored.
    const realNow = Date.now;
    Date.now = () => realNow() + 60_000;
    try {
        a.ws.message({ type: 'state', state: { x: 1, y: 1.6, z: 1, rotY: 0 } });
    } finally {
        Date.now = realNow;
    }
    assert.equal(b.ws.sent.length, before, 'a departed session was relayed as a ghost');
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

// ---------------------------------------------------------------------------
// Podcast routes (worker/src/podcast.js)
// ---------------------------------------------------------------------------

const podcast = await import('../worker/src/podcast.js');
const ORIGIN = 'https://my-pwa-apps.github.io';
const RELAY = 'https://relay.example.workers.dev';

const feedXml = `<?xml version="1.0"?><rss><channel><title>COLOURIZON</title>
<item><title>Miss Melera ° Colourizon 168 ° Sept 2026</title><itunes:duration>00:57:49</itunes:duration>
<enclosure type="audio/mpeg" url="https://feeds.soundcloud.com/stream/2407530030-missmelera-miss-melera-colourizon-168.mp3" length="1"/></item>
<item><title>A guest set</title><enclosure type="audio/mpeg" url="https://feeds.soundcloud.com/stream/2407530031-otherartist-set.mp3" length="1"/></item>
<item><title>Elsewhere</title><enclosure type="audio/mpeg" url="https://evil.example/stream/2407530032-missmelera-x.mp3" length="1"/></item>
<item><title>No audio</title><description>text only</description></item>
<item><title>Colourizon 167</title><enclosure type="audio/mpeg" url="https://feeds.soundcloud.com/stream/2388547833-missmelera-miss-melera-colourizon-167.mp3?x=1" length="1"/></item>
</channel></rss>`;

async function withFetch(fake, run) {
    const original = globalThis.fetch;
    globalThis.fetch = fake;
    try { return await run(); } finally { globalThis.fetch = original; }
}
const call = (path, { method = 'GET', headers = {}, origin = ORIGIN } = {}) => relay.default.fetch(
    new Request(`${RELAY}${path}`, { method, headers: { ...(origin ? { Origin: origin } : {}), ...headers } }), {});

test('podcast stream names accept only Miss Melera uploads', () => {
    for (const ok of ['2407530030-missmelera-miss-melera-colourizon-168.mp3', '65252781-missmelera-miss-melera-colourizon-oct.mp3']) {
        assert.equal(podcast.isStreamName(ok), true, ok);
    }
    for (const bad of ['', '1-missmelera-x.mp3', '2407530030-otherartist-x.mp3', '../2407530030-missmelera-x.mp3',
        '2407530030-missmelera-x.mp3/../../y', '2407530030-missmelera-x.wav', '2407530030-missmelera-X.mp3',
        `2407530030-missmelera-${'a'.repeat(300)}.mp3`, null, undefined, 42]) {
        assert.equal(podcast.isStreamName(bad), false, String(bad).slice(0, 50));
    }
});

test('the feed is rewritten to this relay, and anything the stream route would refuse is dropped', () => {
    const rewritten = podcast.rewriteFeed(feedXml, RELAY);
    const urls = [...rewritten.matchAll(/<enclosure url="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(urls, [
        `${RELAY}/podcast/colourizon/stream/2407530030-missmelera-miss-melera-colourizon-168.mp3`,
        `${RELAY}/podcast/colourizon/stream/2388547833-missmelera-miss-melera-colourizon-167.mp3`
    ]);
    assert.ok(!/soundcloud|evil\.example|otherartist/.test(rewritten), 'an upstream address leaked into the rewritten feed');
    assert.match(rewritten, /<itunes:duration>00:57:49<\/itunes:duration>/);
    assert.equal(podcast.rewriteFeed(null, RELAY), '');
});

test('the podcast routes answer only allow-listed origins, with CORS for exactly that origin', async () => {
    await withFetch(async () => { throw new Error('upstream must not be reached'); }, async () => {
        assert.equal((await call(podcast.PODCAST_FEED_PATH, { origin: null })).status, 403, 'no Origin');
        assert.equal((await call(podcast.PODCAST_FEED_PATH, { origin: 'https://evil.example' })).status, 403);
        assert.equal((await call(`${podcast.PODCAST_STREAM_PREFIX}2407530030-missmelera-x.mp3`, { origin: 'https://evil.example' })).status, 403);
    });
    const preflight = await call(podcast.PODCAST_FEED_PATH, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Range/);
    // A LAN origin (the Quest-over-LAN workflow) is accepted like it is for the socket.
    await withFetch(async () => new Response(feedXml), async () => {
        const lan = await call(podcast.PODCAST_FEED_PATH, { origin: 'http://192.168.1.20:8000' });
        assert.equal(lan.status, 200);
        assert.equal(lan.headers.get('Access-Control-Allow-Origin'), 'http://192.168.1.20:8000');
    });
});

test('the feed route fetches one fixed upstream, rewrites it and caps its size', async () => {
    const requested = [];
    await withFetch(async (url) => { requested.push(String(url)); return new Response(feedXml); }, async () => {
        const response = await call(podcast.PODCAST_FEED_PATH);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('Content-Type'), /rss\+xml/);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
        assert.equal(response.headers.get('Vary'), 'Origin');
        const body = await response.text();
        assert.ok(body.includes(`${RELAY}/podcast/colourizon/stream/2407530030-missmelera-`));
        assert.equal((await call(`${podcast.PODCAST_FEED_PATH}?url=https://evil.example`)).status, 200, 'a query string cannot redirect the upstream');
    });
    assert.deepEqual([...new Set(requested)], [podcast.COLOURIZON_FEED_URL]);

    await withFetch(async () => new Response('x'.repeat(podcast.MAX_FEED_BYTES + 10)), async () => {
        assert.equal((await call(podcast.PODCAST_FEED_PATH)).status, 502, 'an oversized feed must not be buffered');
    });
    await withFetch(async () => new Response('nope', { status: 500 }), async () => {
        assert.equal((await call(podcast.PODCAST_FEED_PATH)).status, 502);
    });
    await withFetch(async () => { throw new Error('offline'); }, async () => {
        assert.equal((await call(podcast.PODCAST_FEED_PATH)).status, 502);
    });
});

test('the stream route follows the CDN redirect per request and passes a single byte range through', async () => {
    const calls = [];
    const audio = new Uint8Array([1, 2, 3, 4, 5]);
    await withFetch(async (url, init) => {
        calls.push({ url: String(url), redirect: init.redirect, range: init.headers.Range, method: init.method });
        return new Response(init.headers.Range ? audio.slice(1, 4) : audio, {
            status: init.headers.Range ? 206 : 200,
            headers: init.headers.Range ? { 'Content-Range': 'bytes 1-3/5', 'Content-Length': '3' } : { 'Content-Length': '5' }
        });
    }, async () => {
        const name = '2407530030-missmelera-miss-melera-colourizon-168.mp3';
        const full = await call(`${podcast.PODCAST_STREAM_PREFIX}${name}`);
        assert.equal(full.status, 200);
        assert.equal(full.headers.get('Content-Type'), 'audio/mpeg');
        assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
        assert.equal(full.headers.get('Access-Control-Allow-Origin'), ORIGIN);
        assert.match(full.headers.get('Access-Control-Expose-Headers'), /Content-Range/);
        assert.deepEqual([...new Uint8Array(await full.arrayBuffer())], [1, 2, 3, 4, 5]);

        const part = await call(`${podcast.PODCAST_STREAM_PREFIX}${name}`, { headers: { Range: 'bytes=1-3' } });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('Content-Range'), 'bytes 1-3/5');
        assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [2, 3, 4]);
    });
    assert.equal(calls.length, 2, 'a fresh upstream request (and signature) per browser request');
    assert.ok(calls.every(c => c.url === `${podcast.COLOURIZON_STREAM_BASE}2407530030-missmelera-miss-melera-colourizon-168.mp3` && c.redirect === 'follow'));
    assert.equal(calls[1].range, 'bytes=1-3');
});

test('the stream route refuses anything but one Miss Melera mp3 and one simple range', async () => {
    await withFetch(async () => { throw new Error('upstream must not be reached'); }, async () => {
        for (const path of ['', '..%2F..%2Fx', '2407530030-otherartist-x.mp3', 'https%3A%2F%2Fevil.example%2Fx.mp3', '2407530030-missmelera-x.mp3%2F..%2Fy']) {
            assert.equal((await call(`${podcast.PODCAST_STREAM_PREFIX}${path}`)).status, 404, path);
        }
        const name = '2407530030-missmelera-x.mp3';
        for (const range of ['bytes=0-1,5-9', 'items=0-5', 'bytes=-', 'bytes=a-b', 'bytes=0-1;x']) {
            assert.equal((await call(`${podcast.PODCAST_STREAM_PREFIX}${name}`, { headers: { Range: range } })).status, 416, range);
        }
        assert.equal((await call(`${podcast.PODCAST_STREAM_PREFIX}${name}`, { method: 'POST' })).status, 405);
    });
    await withFetch(async () => new Response('gone', { status: 404 }), async () => {
        assert.equal((await call(`${podcast.PODCAST_STREAM_PREFIX}2407530030-missmelera-x.mp3`)).status, 502);
    });
});

test('the socket relay is unchanged: paths outside /podcast still need the room route', async () => {
    const env = { CLUB_ROOM: { idFromName: name => name, get: id => ({ fetch: async () => new Response(`room:${id}`) }) } };
    const response = await relay.default.fetch(new Request(`${RELAY}/?room=abc`, { headers: { Origin: ORIGIN } }), env);
    assert.equal(await response.text(), 'room:abc');
    assert.equal((await relay.default.fetch(new Request(`${RELAY}/health`), env)).status, 200);
});

// ---- avatars, gestures, blocking and moderation -------------------------------------------------------------

const pidOf = n => n.toString(16).padStart(16, '0');
function joinAs(room, name, n) {
    const ws = new FakeSocket();
    const session = room._acceptSession(ws, name, pidOf(n));
    return { ws, session };
}

test('every guest is handed a different random avatar from the pool, and may ask for another', () => {
    const { AVATARS } = relay;
    assert.equal(AVATARS.length, 17);
    const room = new ClubRoom({});
    const guests = Array.from({ length: MAX_ROOM_SIZE }, (_, i) => joinAs(room, `G${i}`, i + 1));
    const avatars = guests.map(guest => guest.ws.sent[0].avatar);
    assert.ok(avatars.every(avatar => AVATARS.includes(avatar)));
    assert.equal(new Set(avatars).size, MAX_ROOM_SIZE, 'a full room still has no duplicate avatar');
    // The newcomer is told everyone's avatar, the others are told theirs.
    assert.deepEqual(guests.at(-1).ws.sent[0].peers.map(peer => peer.avatar).sort(), avatars.slice(0, -1).sort());
    assert.equal(guests[0].ws.last('join').avatar, avatars.at(-1));

    const a = guests[0];
    a.ws.message({ type: 'avatar' });
    const note = a.ws.last('avatar');
    assert.equal(note.id, a.session.id);
    assert.ok(AVATARS.includes(note.avatar) && note.avatar !== avatars[0] && !avatars.slice(1).includes(note.avatar));
    assert.equal(guests[1].ws.last('avatar').avatar, note.avatar, 'the others see the change');
});

test('the relay\'s avatar pool is exactly the crowd people the client can draw', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../js/club/11-audio-crowd.js', import.meta.url), 'utf8');
    const ids = [...source.matchAll(/\{ id: '([fm]\d)', url: '\.\/js\/models\/avatars\/club-crowd-\1\.glb' \}/g)].map(match => match[1]);
    assert.deepEqual([...relay.AVATARS], ids);
});

test('gestures are allow-listed and relayed to everyone else', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 1), b = joinAs(room, 'B', 2);
    a.ws.message({ type: 'gesture', gesture: 'wave' });
    assert.deepEqual({ ...b.ws.last('gesture') }, { type: 'gesture', id: a.session.id, gesture: 'wave' });
    const before = b.ws.sent.length;
    a.ws.message({ type: 'gesture', gesture: 'backflip' });
    a.ws.message({ type: 'gesture', gesture: { toString: () => 'wave' } });
    assert.equal(b.ws.sent.length, before);
    assert.equal(a.ws.sent.filter(m => m.type === 'gesture').length, 0, 'the sender is not echoed');
});

test('a block hides two guests from each other, in both directions, until it is lifted', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 1), b = joinAs(room, 'B', 2), c = joinAs(room, 'C', 3);
    a.ws.message({ type: 'block', pid: pidOf(2) });
    // Each side is told the other has gone.
    assert.equal(a.ws.last('leave').id, b.session.id);
    assert.equal(b.ws.last('leave').id, a.session.id);
    assert.equal(c.ws.sent.filter(m => m.type === 'leave').length, 0, 'a third guest is untouched');

    const aBefore = a.ws.sent.length, bBefore = b.ws.sent.length;
    b.ws.message({ type: 'state', state: { x: 1, y: 1.6, z: 1, rotY: 0 } });
    b.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[0] });
    b.ws.message({ type: 'gesture', gesture: 'wave' });
    b.ws.message({ type: 'rtc-signal', target: a.session.id, signal: { kind: 'ice' } });
    a.ws.message({ type: 'state', state: { x: 2, y: 1.6, z: 2, rotY: 0 } });
    a.ws.message({ type: 'rtc-signal', target: b.session.id, signal: { kind: 'ice' } });
    assert.equal(a.ws.sent.length, aBefore, 'the blocker still received something from the blocked guest');
    assert.equal(b.ws.sent.length, bBefore, 'the blocked guest still received something from the blocker');
    assert.equal(c.ws.last('state').id, a.session.id, 'everyone else still sees both');

    a.ws.message({ type: 'unblock', pid: pidOf(2) });
    assert.equal(a.ws.last('join').id, b.session.id);
    assert.equal(b.ws.last('join').id, a.session.id);
    b.ws.message({ type: 'emoji', emoji: ALLOWED_EMOJI[1] });
    assert.equal(a.ws.last('emoji').emoji, ALLOWED_EMOJI[1]);
});

test('a block list can be sent in one go, is bounded, and cannot name the sender', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 1), b = joinAs(room, 'B', 2);
    a.ws.message({ type: 'blocklist', pids: [pidOf(2), pidOf(1), 'not-a-pid', 7] });
    assert.deepEqual([...a.session.blocked], [pidOf(2)]);
    assert.equal(b.ws.last('leave').id, a.session.id);
    const many = Array.from({ length: relay.MAX_BLOCKED + 40 }, (_, i) => pidOf(1000 + i));
    a.ws.message({ type: 'blocklist', pids: many });
    assert.equal(a.session.blocked.size, relay.MAX_BLOCKED);
    assert.equal(b.ws.last('join').id, a.session.id, 'B is visible again once the list no longer holds them');
});

test('a blocker never receives the blocked guest in a welcome or a join', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 1);
    const b = joinAs(room, 'B', 2);
    a.ws.message({ type: 'blocklist', pids: [pidOf(2)] });
    const c = joinAs(room, 'C', 3);
    assert.equal(a.ws.last('join').id, c.session.id);
    assert.ok(!a.ws.sent.some(m => m.type === 'join' && m.id === b.session.id && a.ws.sent.indexOf(m) > a.ws.sent.findIndex(x => x.type === 'leave')),
        'the blocked guest was announced again after the block');
    assert.deepEqual(c.ws.sent[0].peers.map(peer => peer.name).sort(), ['A', 'B']);
});

test('a guest the host already blocked reconnects without seeing, or being seen by, the blocker', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 1);
    const b = joinAs(room, 'B', 2);
    a.ws.message({ type: 'blocklist', pids: [pidOf(2)] });
    room._onClose(b.ws, b.session);
    const again = joinAs(room, 'B', 2);
    assert.deepEqual(again.ws.sent[0].peers, [], 'the reconnecting guest was handed the person who blocked them');
    assert.ok(!a.ws.sent.some(m => m.type === 'join' && m.id === again.session.id), 'the blocker was told about the returning guest');
});

test('only the host can kick, ban or lock; a kick can come back, a ban cannot', () => {
    const room = new ClubRoom({});
    const host = joinAs(room, 'Host', 1), a = joinAs(room, 'A', 2), b = joinAs(room, 'B', 3);

    // A guest has no powers over the host or anyone else.
    a.ws.message({ type: 'kick', target: b.session.id });
    a.ws.message({ type: 'ban', target: host.session.id });
    a.ws.message({ type: 'lock', locked: true });
    assert.equal(room.sessions.size, 3);
    assert.equal(room.locked, false);

    // The host cannot remove themselves.
    host.ws.message({ type: 'kick', target: host.session.id });
    assert.equal(room.sessions.size, 3);

    host.ws.message({ type: 'kick', target: a.session.id });
    assert.equal(a.ws.closed.code, relay.CLOSE_KICKED);
    assert.equal(room.sessions.size, 2);
    assert.equal(b.ws.last('leave').id, a.session.id);
    const back = joinAs(room, 'A again', 2);
    assert.ok(back.session, 'a kicked guest may return');

    host.ws.message({ type: 'ban', target: back.session.id });
    assert.equal(back.ws.closed.code, relay.CLOSE_BANNED);
    const again = joinAs(room, 'A', 2);
    assert.equal(again.session, null);
    assert.equal(again.ws.closed.code, relay.CLOSE_BANNED);
    assert.ok(joinAs(room, 'C', 4).session, 'someone else can still join');
});

test('a locked room refuses new guests and tells the others', () => {
    const room = new ClubRoom({});
    const host = joinAs(room, 'Host', 1), a = joinAs(room, 'A', 2);
    host.ws.message({ type: 'lock', locked: true });
    assert.deepEqual({ ...a.ws.last('room') }, { type: 'room', locked: true });
    const late = joinAs(room, 'Late', 3);
    assert.equal(late.session, null);
    assert.equal(late.ws.closed.code, relay.CLOSE_LOCKED);
    host.ws.message({ type: 'lock', locked: false });
    assert.ok(joinAs(room, 'Later', 4).session);
});

test('moderation passes to the next host when the host leaves, and the lock and bans stay', () => {
    const room = new ClubRoom({});
    const host = joinAs(room, 'Host', 1), a = joinAs(room, 'A', 2), b = joinAs(room, 'B', 3);
    host.ws.message({ type: 'lock', locked: true });
    host.ws.message({ type: 'ban', target: b.session.id });
    host.ws.emit('close');
    assert.equal(room.hostId, a.session.id);
    assert.equal(room.locked, true);
    assert.equal(joinAs(room, 'B', 3).session, null);
    const c = joinAs(room, 'C', 4);
    assert.equal(c.session, null, 'still locked');
    a.ws.message({ type: 'lock', locked: false });
    assert.ok(joinAs(room, 'C', 4).session);
});

test('the secret uid never leaves the relay: others see a hash that cannot be guessed from the public id', async () => {
    const { derivePid, UID_PATTERN, PID_PATTERN } = relay;
    const uid = 'abcdefghijklmnopqrstuvwxyz012345';
    assert.ok(UID_PATTERN.test(uid) && !UID_PATTERN.test('short') && !UID_PATTERN.test('has spaces in it, so no!!'));
    const pid = await derivePid(uid);
    assert.match(pid, PID_PATTERN);
    assert.equal(await derivePid(uid), pid, 'stable across reconnects');
    assert.notEqual(await derivePid(`${uid}x`), pid);
    assert.ok(!pid.includes(uid.slice(0, 8)));

    // End to end through fetch(): the welcome carries the pid, never the uid.
    const sockets = [];
    globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = new FakeSocket(); sockets.push(this[1]); } };
    const OriginalResponse = globalThis.Response;
    try {
        const room = new ClubRoom({});
        const request = { headers: new Map([['Upgrade', 'websocket']]), url: `https://relay.example/?room=r&name=Z&uid=${uid}` };
        request.headers.get = key => (key === 'Upgrade' ? 'websocket' : null);
        // Response with status 101 is not constructible in Node; the relay's own object is what matters here.
        globalThis.Response = class { constructor(body, init) { this.status = init && init.status; } };
        await room.fetch(request);
        const welcome = sockets[0].sent[0];
        assert.equal(welcome.pid, pid);
        assert.ok(!JSON.stringify(welcome).includes(uid));
    } finally {
        globalThis.Response = OriginalResponse;
        delete globalThis.WebSocketPair;
    }
});

// ---- the host owns the music and the lights -------------------------------------------------------------------

test('a room holds eight guests: voice is a full mesh and eight is how many are drawn as people', () => {
    assert.equal(MAX_ROOM_SIZE, 8);
});

test('the track carries its podcast and a clean title, so every guest shows the same now-playing line', () => {
    const room = new ClubRoom({});
    const host = join(room);
    const guest = join(room);
    host.ws.message({ type: 'music', url: 'https://radio.example/a.mp3', playing: true, position: 5, podcast: 'colourizon', title: 'Colourizon\u0007 168\n  night' });
    const note = guest.ws.last('music');
    assert.equal(note.podcast, 'colourizon');
    assert.equal(note.title, 'Colourizon 168 night');
    assert.equal(typeof note.updatedAt, 'number');
    host.ws.message({ type: 'music', url: 'https://radio.example/a.mp3', playing: true, podcast: '../etc', title: 'x'.repeat(500) });
    assert.equal(guest.ws.last('music').podcast, null);
    assert.equal(guest.ws.last('music').title.length, 120);
    assert.equal(sanitizeTitle(42), '');
});

test('only the host can drive the lights, guests receive the frame, and a late joiner is handed the latest one', () => {
    const room = new ClubRoom({});
    const host = join(room);
    const guest = join(room);
    guest.ws.message({ type: 'show', m: 'show', mv: 'ignition', cue: 1 });
    assert.equal(room.showState, null, 'a guest cannot set the lights');
    assert.equal(host.ws.last('show'), undefined);

    host.ws.message({ type: 'show', m: 'show', mv: 'ignition', cue: 2, cb: 1.5, bib: 3, hue: 0.25, hl: true, pal: 'triad', mbi: 4 });
    assert.deepEqual({ ...guest.ws.last('show'), type: undefined }, { type: undefined, m: 'show', mv: 'ignition', cue: 2, cb: 1.5, bib: 3, hue: 0.25, hl: true, pal: 'triad', mbi: 4 });
    const late = join(room);
    assert.equal(late.ws.sent[0].show.mv, 'ignition');
    assert.equal(late.ws.sent[0].show.cue, 2);
});

test('the light-show frame is shaped, clamped and bounded; hostile fields never get through', () => {
    assert.equal(sanitizeShow(null), null);
    assert.equal(sanitizeShow([]), null);
    assert.equal(sanitizeShow({ m: 'evil' }), null);
    const out = sanitizeShow({
        m: 'manual', mv: 'pulse; drop', cue: 9999, cb: -3, bib: 7, hue: 4, bpm: 9, spb: 'x', __proto__: { polluted: true }, constructor: 'x',
        fx: { lightsActive: true, laserSpeed: 1.23456789, spotlightMode: 'sweep', '__proto__': 1, 'bad key': 1, nested: { a: 1 }, nan: NaN, long: 'x'.repeat(40), list: [1] }
    });
    assert.equal(out.m, 'manual');
    assert.ok(!('mv' in out), 'a movement name with punctuation is dropped');
    assert.equal(out.cue, 63);
    assert.equal(out.cb, 0);
    assert.equal(out.bib, 3);
    assert.equal(out.hue, 1);
    assert.equal(out.bpm, 40);
    assert.ok(!('spb' in out));
    assert.deepEqual(Object.keys(out.fx).sort(), ['laserSpeed', 'lightsActive', 'spotlightMode']);
    assert.equal(out.fx.laserSpeed, 1.2346);
    assert.equal({}.polluted, undefined);

    const many = {};
    for (let i = 0; i < 300; i++) many[`k${i}`] = i;
    assert.equal(Object.keys(sanitizeShow({ m: 'off', fx: many }).fx).length, relay.MAX_SHOW_FIXTURES);
});

test('the lights and the music are forgotten once the room is empty, and survive a host handover', () => {
    const room = new ClubRoom({});
    const a = join(room);
    const b = join(room);
    a.ws.message({ type: 'show', m: 'show', mv: 'pulse', cue: 0 });
    a.ws.message({ type: 'music', url: 'https://radio.example/a.mp3', playing: true });
    a.ws.emit('close');
    assert.equal(room.hostId, b.session.id);
    assert.equal(room.showState.mv, 'pulse');
    assert.equal(room.musicState.url, 'https://radio.example/a.mp3');
    b.ws.emit('close');
    assert.equal(room.showState, null);
    assert.equal(room.musicState, null);
});
test('a guest can ask for women or men only: on joining, and when rerolling, and the choice sticks', () => {
    const room = new ClubRoom({});
    assert.equal(sanitizePool('women'), 'women');
    assert.equal(sanitizePool('men'), 'men');
    assert.equal(sanitizePool('robots'), 'any');
    assert.equal(sanitizePool(undefined), 'any');
    assert.equal(AVATAR_POOLS.women.length + AVATAR_POOLS.men.length, AVATAR_POOLS.any.length);
    for (let round = 0; round < 12; round++) {
        const w = new FakeSocket();
        const woman = room._acceptSession(w, 'W', pidOf(100 + round), 'women');
        assert.match(woman.avatar, /^f/);
        const m = new FakeSocket();
        const man = room._acceptSession(m, 'M', pidOf(200 + round), 'men');
        assert.match(man.avatar, /^m/);
        for (let i = 0; i < 6; i++) {
            m.message({ type: 'avatar' });
            assert.match(man.avatar, /^m/, 'a reroll stays in the chosen pool');
        }
        w.message({ type: 'avatar', pool: 'men' });
        assert.match(woman.avatar, /^m/, 'switching pool on a reroll takes effect at once');
        assert.equal(woman.avatarPool, 'men');
        w.emit('close'); m.emit('close');
    }
});

test('a pool that is full gives a free person from the other pool rather than a double', () => {
    const room = new ClubRoom({});
    // Joined straight into the pool: a join excludes only the others' looks, so eight women-seekers get the eight women.
    // (A reroll also excludes the guest's own look, so rerolling into a full pool may rightly hand out a man.)
    for (let i = 0; i < 8; i++) {
        const session = room._acceptSession(new FakeSocket(), `W${i}`, pidOf(300 + i), 'women');
        assert.match(session.avatar, /^f/);
    }
    assert.equal(new Set([...room.sessions.values()].map(s => s.avatar)).size, 8, 'eight different women');
    assert.match(room._pickAvatar(null, 'women'), /^m/, 'all eight women are taken, so a ninth woman-seeker gets a free man');
});
test('a host that pinged and then vanished is closed and replaced; a client that never pinged is left alone', () => {
    const room = new ClubRoom({});
    const host = joinAs(room, 'Host', 401);
    const guest = joinAs(room, 'Guest', 402);
    const old = joinAs(room, 'Old', 403);
    host.ws.message({ type: 'ping' });
    guest.ws.message({ type: 'ping' });
    const start = Date.now();
    host.session.lastSeen = start - IDLE_CLOSE_MS - 1000;
    guest.session.lastSeen = start;
    old.session.lastSeen = start - 10 * IDLE_CLOSE_MS;
    room._sweep(start);
    assert.equal(host.ws.closed.code, CLOSE_IDLE);
    assert.equal(room.hostId, guest.session.id, 'the next guest took the room');
    assert.equal(guest.ws.last('host').id, guest.session.id);
    assert.equal(old.ws.closed, null, 'an older client that does not ping is never swept');
    assert.equal(guest.ws.closed, null);
    for (const ws of [guest.ws, old.ws]) ws.emit('close');
    room._sweep(start);
    assert.equal(room._sweeper, null, 'the timer stops with the last guest');
});

test('any frame counts as a sign of life, not only the ping', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 411);
    a.ws.message({ type: 'ping' });
    a.session.lastSeen = 1;
    a.ws.message({ type: 'gesture', gesture: 'wave' });
    assert.ok(a.session.lastSeen > 1);
    clearInterval(room._sweeper);
});

test('an empty room starts over: a lock or a ban does not outlive the people in it', () => {
    const room = new ClubRoom({});
    const host = joinAs(room, 'Host', 501);
    const pest = joinAs(room, 'Pest', 502);
    host.ws.message({ type: 'ban', target: pest.session.id });
    host.ws.message({ type: 'lock', locked: true });
    host.ws.message({ type: 'show', m: 'show', mv: 'pulse', cue: 0 });
    assert.equal(room.locked, true);
    host.ws.emit('close');
    assert.equal(room.sessions.size, 0);
    assert.equal(room.locked, false, 'a locked, empty room refused everyone, its own host included');
    assert.equal(room.banned.size, 0);
    assert.equal(room.showState, null);
    const back = joinAs(room, 'Host', 501);
    assert.ok(back.session, 'the host who locked it can come back');
    assert.equal(room.hostId, back.session.id);
    clearInterval(room._sweeper);
});

test('typed chat reaches everyone who can see the sender, named by the relay, cleaned and bounded', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 601);
    const b = joinAs(room, 'B', 602);
    const c = joinAs(room, 'C', 603);
    a.ws.message({ type: 'chat', text: '  hi\u202E there\n\nfriends\u200B ', id: c.session.id });
    const got = b.ws.last('chat');
    assert.equal(got.text, 'hi there friends', 'bidi overrides, zero-width characters and line breaks are removed');
    assert.equal(got.id, a.session.id, 'the relay names the sender, whatever the client claimed');
    assert.equal(a.ws.last('chat'), undefined, 'not echoed to the sender');
    c.ws.message({ type: 'block', pid: pidOf(601) });
    const before = c.ws.sent.filter(m => m.type === 'chat').length;
    a.ws.message({ type: 'chat', text: 'can you see this' });
    assert.equal(c.ws.sent.filter(m => m.type === 'chat').length, before, 'a blocked guest never receives chat');
    assert.equal(b.ws.last('chat').text, 'can you see this');
    assert.equal(sanitizeChat('x'.repeat(500)).length, MAX_CHAT_LENGTH);
    assert.equal(sanitizeChat('\u0000\u0007  '), '');
    assert.equal(sanitizeChat({ toString: () => 'no' }), '');
    assert.equal(Array.from(sanitizeChat('🎉'.repeat(300))).length, MAX_CHAT_LENGTH, 'bounded by code point, never mid-surrogate');
    clearInterval(room._sweeper);
});

test('chat is rate limited: a burst passes, a flood is dropped', () => {
    const room = new ClubRoom({});
    const a = joinAs(room, 'A', 611);
    const b = joinAs(room, 'B', 612);
    for (let i = 0; i < 20; i++) a.ws.message({ type: 'chat', text: `msg ${i}` });
    const received = b.ws.sent.filter(m => m.type === 'chat').length;
    assert.ok(received >= 3 && received <= 5, `a burst of four, then the bucket is empty (got ${received})`);
    clearInterval(room._sweeper);
});
