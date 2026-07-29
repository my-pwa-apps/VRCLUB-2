#!/usr/bin/env node
// Minimal dependency-free static file server for production/PaaS deploys.
//
// `npm start` runs `http-server -p 8000`, which HARD-CODES port 8000 and therefore
// fails health checks on any platform that injects $PORT (Heroku, Render, Fly,
// Railway, Azure App Service). This server honours process.env.PORT and binds
// 0.0.0.0 so it works both locally and in a container.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const ROOT = process.argv.includes('--dist') ? join(PROJECT_ROOT, 'dist') : PROJECT_ROOT;
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
        // Long-lived caching is safe because index.html references every asset with
        // an explicit ?v= cache-busting token.
        const cacheControl = ext === '.html'
            ? 'no-cache'
            : 'public, max-age=31536000, immutable';

        const headers = {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Content-Length': info.size,
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
        // Deliberately NOT set: Cross-Origin-Embedder-Policy: require-corp. It would
        // block the pinned Babylon.js CDN bundles (cdn.babylonjs.com does not send
        // Cross-Origin-Resource-Policy), breaking the app entirely. It buys nothing
        // here either - this build uses no SharedArrayBuffer and no threaded WASM.
        const forwardedProto = req.headers['x-forwarded-proto'];
        const isHttps = req.socket.encrypted === true ||
            (typeof forwardedProto === 'string' && forwardedProto.split(',')[0].trim() === 'https');
        if (isHttps) {
            headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
        }

        res.writeHead(200, headers);
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(realPath).pipe(res);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`VRCLUB static server listening on http://${HOST}:${PORT}`);
});
