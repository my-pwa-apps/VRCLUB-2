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
