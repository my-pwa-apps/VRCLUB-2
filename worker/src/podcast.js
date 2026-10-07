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
 *
 * Both answer only allow-listed browser Origins (the same rule as the WebSocket relay) and reach exactly one
 * upstream host with a validated path: this is not an open proxy.
 */

export const COLOURIZON_FEED_URL = 'https://feeds.soundcloud.com/users/soundcloud:users:252951/sounds.rss';
export const COLOURIZON_STREAM_BASE = 'https://feeds.soundcloud.com/stream/';
export const PODCAST_FEED_PATH = '/podcast/colourizon/feed.xml';
export const PODCAST_STREAM_PREFIX = '/podcast/colourizon/stream/';
export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export const FEED_CACHE_SECONDS = 600;

/** `<track id>-missmelera-<slug>.mp3`: only Miss Melera's own uploads. */
const STREAM_NAME = /^\d{6,20}-missmelera-[a-z0-9-]{1,200}\.mp3$/;
/** A single byte range, open-ended or closed. Multi-range requests are refused (the CDN would answer multipart). */
const RANGE = /^bytes=(?:\d{1,12}-\d{0,12}|-\d{1,12})$/;

export function isStreamName(name) {
    return typeof name === 'string' && STREAM_NAME.test(name);
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

/**
 * Handles the two routes. Returns null for any other path so the caller can carry on.
 * @param {Request} request
 * @param {string} origin  the already-validated browser origin
 */
export async function handlePodcast(request, url, origin) {
    const isFeed = url.pathname === PODCAST_FEED_PATH;
    const isStream = url.pathname.startsWith(PODCAST_STREAM_PREFIX);
    if (!isFeed && !isStream) return null;
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'method not allowed', cors);

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
    const range = request.headers.get('Range');
    if (range && !RANGE.test(range)) return text(416, 'one byte range at a time', cors);
    try {
        // `follow` crosses the 302 to the CDN. The signed URL is fetched here, per request, so it never goes stale
        // under a long set: every seek the browser makes asks this route again and gets a fresh signature.
        const upstream = await fetch(`${COLOURIZON_STREAM_BASE}${name}`, {
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
