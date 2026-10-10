/**
 * Podcast helper routes for the club (Miss Melera's "Colourizon").
 *
 * Why this exists: Colourizon is published through SoundCloud, whose RSS feed only answers a single
 * allow-listed origin and whose `feeds.soundcloud.com/stream/...` links redirect (302) to a signed,
 * short-lived CDN URL WITHOUT CORS headers. A browser audio element in `crossOrigin="anonymous"` mode
 * (which the club needs: the analyser drives the light show) refuses such a redirect, and the signature
 * lasts about five minutes, which is shorter than a set. So the relay does the two things the browser cannot:
 *
 *   GET /podcast/colourizon/feed.xml         the feed, with every enclosure rewritten to the stream route below
 *   GET /podcast/colourizon/stream/<name>    the episode, with HTTP Range support, followed through the redirect
 *   GET /soundcloud/resolve?url=<page>       a soundcloud.com/<user>/<track> page -> a stream, but ONLY when SoundCloud
 *                                            serves that track to podcast players (oEmbed gives the id, the podcast
 *                                            stream endpoint must answer for it); otherwise 404 "not-published"
 *   GET /soundcloud/stream/<name>            that stream, same Range/redirect handling
 *
 * Both answer only allow-listed browser Origins (the same rule as the WebSocket relay) and reach exactly two upstream
 * hosts (soundcloud.com's oEmbed and feeds.soundcloud.com/stream/) with validated paths: this is not an open proxy,
 * and it never reads or unlocks audio SoundCloud does not hand to podcast apps.
 */

export const COLOURIZON_FEED_URL = 'https://feeds.soundcloud.com/users/soundcloud:users:252951/sounds.rss';
export const COLOURIZON_STREAM_BASE = 'https://feeds.soundcloud.com/stream/';
export const SOUNDCLOUD_STREAM_BASE = COLOURIZON_STREAM_BASE;
export const PODCAST_FEED_PATH = '/podcast/colourizon/feed.xml';
export const PODCAST_STREAM_PREFIX = '/podcast/colourizon/stream/';
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export const FEED_CACHE_SECONDS = 600;

/** `<track id>-missmelera-<slug>.mp3`: only Miss Melera's own uploads. */
const STREAM_NAME = /^\d{6,20}-missmelera-[a-z0-9-]{1,200}\.mp3$/;
/** A single byte range, open-ended or closed. Multi-range requests are refused (the CDN would answer multipart). */
const RANGE = /^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/;

export const SOUNDCLOUD_RESOLVE_PATH = '/soundcloud/resolve';
export const SOUNDCLOUD_STREAM_PREFIX = '/soundcloud/stream/';
export const SOUNDCLOUD_OEMBED = 'https://soundcloud.com/oembed';
export const MAX_OEMBED_BYTES = 64 * 1024;

/** `<track id>-<user>-<slug>.mp3`: the name SoundCloud gives a track its creator publishes in a podcast RSS feed. */
const SOUNDCLOUD_STREAM_NAME = /^\d{1,20}-[a-z0-9][a-z0-9_-]{0,100}\.mp3$/;
const PERMALINK = /^[a-z0-9][a-z0-9_-]{0,100}$/;
/** First path segments of soundcloud.com that are site pages, not people. */
const SOUNDCLOUD_SITE_PAGES = new Set(['discover', 'stream', 'upload', 'you', 'search', 'pages', 'charts', 'mobile', 'people',
    'tags', 'settings', 'messages', 'notifications', 'jobs', 'imprint', 'terms-of-use', 'feed', 'popular', 'trending']);
/** Second segments that are a profile's tabs or a playlist, not one track. */
const SOUNDCLOUD_PROFILE_TABS = new Set(['sets', 'tracks', 'albums', 'reposts', 'likes', 'following', 'followers', 'popular-tracks', 'comments']);

export function isStreamName(name) {
    return typeof name === 'string' && STREAM_NAME.test(name);
}

export function isSoundCloudStreamName(name) {
    return typeof name === 'string' && SOUNDCLOUD_STREAM_NAME.test(name) && !name.includes('..');
}

/** A soundcloud.com/<user>/<track> page URL, reduced to its two permalinks; null for anything else. */
export function parseSoundCloudTrackUrl(raw) {
    let url;
    try { url = new URL(String(raw)); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (!/^(www\.|m\.)?soundcloud\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean).map(part => part.toLowerCase());
    if (parts.length !== 2 || !PERMALINK.test(parts[0]) || !PERMALINK.test(parts[1])) return null;
    if (SOUNDCLOUD_SITE_PAGES.has(parts[0]) || SOUNDCLOUD_PROFILE_TABS.has(parts[1])) return null;
    return { user: parts[0], slug: parts[1], href: `https://soundcloud.com/${parts[0]}/${parts[1]}` };
}

/** The numeric track id inside SoundCloud's oEmbed player markup, or null (a playlist has none). */
export function trackIdFromOembed(oembed) {
    const html = oembed && typeof oembed.html === 'string' ? oembed.html : '';
    const match = /api\.soundcloud\.com(?:%2F|\/)tracks(?:%2F|\/)(\d{1,20})/i.exec(html);
    return match ? match[1] : null;
}

/**
 * The feed with every Miss Melera enclosure pointed at this relay, and every other item dropped (the stream route
 * would refuse it). Plain string work, like the client's parser: the feed is large and its markup is regular.
 * @param {string} xml     upstream feed
 * @param {string} origin  this relay's origin, e.g. https://vrclub-network.example.workers.dev
 */
export function rewriteFeed(xml, origin) {
    if (typeof xml !== 'string') return '';
    const base = `${origin}${PODCAST_STREAM_PREFIX}`;
    const items = [];
    for (const [item] of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
        const enclosure = /<enclosure\b[^>]*>/.exec(item);
        const url = enclosure && /\burl\s*=\s*["']([^"']+)["']/.exec(enclosure[0]);
        if (!url || !url[1].startsWith(COLOURIZON_STREAM_BASE)) continue;
        const name = url[1].slice(COLOURIZON_STREAM_BASE.length).split('?')[0];
        if (!isStreamName(name)) continue;
        // Keep only what the client reads: the title and the enclosure.
        const title = /<title>[\s\S]*?<\/title>/.exec(item);
        const duration = /<itunes:duration>[\s\S]*?<\/itunes:duration>/.exec(item);
        items.push(`<item>${title ? title[0] : '<title>Episode</title>'}`
            + `<enclosure url="${base}${name}" type="audio/mpeg"/>${duration ? duration[0] : ''}</item>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Colourizon</title>${items.join('')}</channel></rss>`;
}

/** CORS for a validated browser origin. The responses carry no credentials and no secrets. */
function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

const text = (status, body, headers) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });

async function readCapped(response, limit) {
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error('feed too large'); }
        chunks.push(value);
    }
    return new TextDecoder().decode(concatBytes(chunks, size));
}

function concatBytes(chunks, size) {
    const out = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
    return out;
}

const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

/**
 * Turns a soundcloud.com/<user>/<track> page into a playable relay stream, but ONLY when SoundCloud itself serves that
 * track to podcast players: the track's id comes from SoundCloud's public oEmbed, and the stream is offered only if the
 * podcast feed endpoint answers for it (it answers 404 for a track its creator has not published that way). Nothing
 * here reads, scrapes or unlocks audio SoundCloud does not hand to podcast apps.
 */
async function resolveSoundCloud(url, cors) {
    const track = parseSoundCloudTrackUrl(url.searchParams.get('url'));
    if (!track) return json(400, { error: 'not-a-track' }, cors);
    try {
        const oembed = await fetch(`${SOUNDCLOUD_OEMBED}?format=json&url=${encodeURIComponent(track.href)}`,
            { cf: { cacheTtl: 3600, cacheEverything: true } });
        if (!oembed.ok) return json(404, { error: 'not-found' }, cors);
        const info = JSON.parse(await readCapped(oembed, MAX_OEMBED_BYTES));
        const id = trackIdFromOembed(info);
        if (!id) return json(404, { error: 'not-a-track' }, cors);
        const name = `${id}-${track.user}-${track.slug}.mp3`;
        if (!isSoundCloudStreamName(name)) return json(404, { error: 'not-a-track' }, cors);
        const probe = await fetch(`${SOUNDCLOUD_STREAM_BASE}${name}`, { redirect: 'follow', headers: { Range: 'bytes=0-0' } });
        try { await probe.body?.cancel(); } catch { /* ignore */ }
        if (probe.status !== 200 && probe.status !== 206) return json(404, { error: 'not-published' }, cors);
        // eslint-disable-next-line no-control-regex
        const title = String(info.title || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        return json(200, { name, title, path: `${SOUNDCLOUD_STREAM_PREFIX}${name}` }, cors);
    } catch {
        return json(502, { error: 'unavailable' }, cors);
    }
}

/**
 * Handles the podcast and SoundCloud routes. Returns null for any other path so the caller can carry on.
 * @param {Request} request
 * @param {string} origin  the already-validated browser origin
 */
export async function handlePodcast(request, url, origin) {
    const isFeed = url.pathname === PODCAST_FEED_PATH;
    const isStream = url.pathname.startsWith(PODCAST_STREAM_PREFIX);
    const isResolve = url.pathname === SOUNDCLOUD_RESOLVE_PATH;
    const isScStream = url.pathname.startsWith(SOUNDCLOUD_STREAM_PREFIX);
    if (!isFeed && !isStream && !isResolve && !isScStream) return null;
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'method not allowed', cors);

    if (isResolve) return resolveSoundCloud(url, cors);
    if (isScStream) {
        let name;
        try { name = decodeURIComponent(url.pathname.slice(SOUNDCLOUD_STREAM_PREFIX.length)); } catch { return text(404, 'not found', cors); }
        return isSoundCloudStreamName(name) ? streamEpisode(request, SOUNDCLOUD_STREAM_BASE, name, cors) : text(404, 'not found', cors);
    }

    if (isFeed) {
        let upstream;
        try {
            upstream = await fetch(COLOURIZON_FEED_URL, { cf: { cacheTtl: FEED_CACHE_SECONDS, cacheEverything: true } });
            if (!upstream.ok) return text(502, 'the podcast feed is unavailable', cors);
            const xml = await readCapped(upstream, MAX_FEED_BYTES);
            return new Response(request.method === 'HEAD' ? null : rewriteFeed(xml, url.origin), {
                status: 200,
                headers: {
                    'Content-Type': 'application/rss+xml; charset=utf-8',
                    'Cache-Control': `public, max-age=${FEED_CACHE_SECONDS}`,
                    ...cors
                }
            });
        } catch {
            return text(502, 'the podcast feed is unavailable', cors);
        }
    }

    const name = decodeURIComponent(url.pathname.slice(PODCAST_STREAM_PREFIX.length));
    if (!isStreamName(name)) return text(404, 'not found', cors);
    return streamEpisode(request, COLOURIZON_STREAM_BASE, name, cors);
}

/**
 * One episode, with HTTP Range support, followed through the 302 to the CDN. `base` is a fixed upstream and `name`
 * has already been validated against that route's pattern: this is not an open proxy.
 */
async function streamEpisode(request, base, name, cors) {
    const range = request.headers.get('Range');
    if (range && !RANGE.test(range)) return text(416, 'one byte range at a time', cors);
    try {
        // `follow` crosses the 302 to the CDN. The signed URL is fetched here, per request, so it never goes stale
        // under a long set: every seek the browser makes asks this route again and gets a fresh signature.
        const upstream = await fetch(`${base}${name}`, {
            method: request.method,
            redirect: 'follow',
            headers: range ? { Range: range } : {}
        });
        if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 416) {
            return text(502, 'the episode is unavailable', cors);
        }
        const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', ...cors };
        for (const key of ['Content-Length', 'Content-Range']) {
            const value = upstream.headers.get(key);
            if (value) headers[key] = value;
        }
        return new Response(upstream.body, { status: upstream.status, headers });
    } catch {
        return text(502, 'the episode is unavailable', cors);
    }
}
