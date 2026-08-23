#!/usr/bin/env node
// Minimal dependency-free static file server for production/PaaS deploys.
//
// Used for local development and production/PaaS deploys. It honours process.env.PORT
// and binds 0.0.0.0 by default, so it works both locally and in a container.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip, constants as zlibConstants } from 'node:zlib';
import { pipeline } from 'node:stream';

const PROJECT_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const IS_DIST = process.argv.includes('--dist');
const ROOT = IS_DIST ? join(PROJECT_ROOT, 'dist') : PROJECT_ROOT;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.env': 'application/octet-stream',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav'
};

/**
 * Paths that must never be served, regardless of ROOT.
 *
 * Without `--dist` this server's ROOT is the repository itself, so a forgotten
 * flag would otherwise expose `.git/config` (remote URLs, sometimes credentials),
 * `.env`, `node_modules/` and the whole source tree.
 */
const DENY = /(^|[\\/])(\.git|\.env|\.github|node_modules|scripts|test|package(-lock)?\.json|backup_aframe)([\\/]|$)/i;

/** Content types worth compressing. Images, GLB and audio are already compressed. */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml)|image\/svg)/;

/**
 * Resolve a request path to an on-disk path, refusing anything that escapes ROOT.
 * This is the path-traversal guard (OWASP A01) - `GET /../../etc/passwd` and
 * percent-encoded variants must not be servable.
 */
function resolveSafe(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath.split('?')[0]);
    } catch {
        return null; // malformed percent-encoding
    }
    if (decoded.includes('\0')) return null;
    if (DENY.test(decoded)) return null;
    if (decoded === '/' || decoded === '') decoded = '/index.html';
    const resolved = normalize(join(ROOT, decoded));
    if (!isInsideRoot(resolved)) return null;
    return resolved;
}

function isInsideRoot(p) {
    return p === ROOT || p.startsWith(ROOT + sep);
}

const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Allow': 'GET, HEAD' }).end('Method Not Allowed');
        return;
    }

    const filePath = resolveSafe(req.url || '/');
    if (!filePath) {
        res.writeHead(400).end('Bad Request');
        return;
    }

    try {
        // normalize() alone cannot see through a symlink whose target lives outside
        // ROOT, so re-assert the prefix against the fully resolved real path.
        const realPath = await realpath(filePath);
        if (!isInsideRoot(realPath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
            return;
        }

        const info = await stat(realPath);
        if (info.isDirectory()) {
            res.writeHead(403).end('Forbidden');
            return;
        }
        const ext = extname(realPath).toLowerCase();
        // Long-lived caching is safe in --dist mode because every asset filename is
        // content-hashed. In DEV mode it is actively harmful: an edited source file
        // keeps being served from the browser cache for a year, which looks exactly
        // like "my change did nothing".
        //
        // Service worker scripts are always no-cache. ServiceWorkerRegistration
        // .updateViaCache defaults to 'imports', so a worker pulled in via
        // importScripts() is served FROM the HTTP cache - `immutable, max-age=1y`
        // would pin it for a year and make worker updates impossible to ship.
        const isWorker = /(^|[\\/])(sw|serviceworker)\.js$/i.test(realPath);
        const cacheControl = (ext === '.html' || isWorker || !IS_DIST)
            ? 'no-cache'
            : 'public, max-age=31536000, immutable';

        const contentType = MIME[ext] || 'application/octet-stream';
        const headers = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            // frame-ancestors is header-only per spec - browsers ignore it in the <meta>
            // CSP in index.html. X-Frame-Options is the legacy equivalent.
            'Content-Security-Policy': "frame-ancestors 'none'",
            'X-Frame-Options': 'DENY'
        };

        // WebXR is only exposed to secure contexts, so any real deployment of this app
        // is HTTPS-only. Pin that with HSTS so a first-visit downgrade cannot strip it.
        // Only sent when the request actually arrived over TLS: emitting HSTS over plain
        // HTTP is ignored by browsers per RFC 6797, and sending it during local
        // `http://localhost` development would poison the developer's browser into
        // refusing plain HTTP on that host.
        //
        // Deliberately NOT set: Cross-Origin-Embedder-Policy: require-corp. It buys
        // nothing here - this build uses no SharedArrayBuffer and no threaded WASM -
        // and it would break any future cross-origin resource that omits CORP.
        const forwardedProto = req.headers['x-forwarded-proto'];
        const isHttps = req.socket.encrypted === true ||
            (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https');
        if (isHttps) {
            headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }

        // Compression. The vendored Babylon runtime alone is 7.4 MB; this server
        // previously sent every byte of it uncompressed, including on the Procfile
        // production path.
        const accept = String(req.headers['accept-encoding'] || '');
        let encoder = null;
        if (COMPRESSIBLE.test(contentType) && info.size > 1024) {
            if (/\bbr\b/.test(accept)) {
                encoder = createBrotliCompress({
                    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 }
                });
                headers['Content-Encoding'] = 'br';
            } else if (/\bgzip\b/.test(accept)) {
                encoder = createGzip({ level: 6 });
                headers['Content-Encoding'] = 'gzip';
            }
        }
        if (encoder) headers['Vary'] = 'Accept-Encoding';
        else headers['Content-Length'] = info.size;

        res.writeHead(200, headers);
        if (req.method === 'HEAD') { res.end(); return; }

        const source = createReadStream(realPath);
        if (encoder) {
            pipeline(source, encoder, res, () => { /* client disconnects are normal */ });
        } else {
            pipeline(source, res, () => { /* client disconnects are normal */ });
        }
    } catch {
        if (res.headersSent) {
            res.destroy();
            return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`VRCLUB static server listening on http://${HOST}:${PORT}`);
});
