#!/usr/bin/env node
// Minimal dependency-free static file server for production/PaaS deploys.
//
// `npm start` runs `http-server -p 8000`, which HARD-CODES port 8000 and therefore
// fails health checks on any platform that injects $PORT (Heroku, Render, Fly,
// Railway, Azure App Service). This server honours process.env.PORT and binds
// 0.0.0.0 so it works both locally and in a container.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
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
    if (resolved !== ROOT && !resolved.startsWith(ROOT + sep)) return null;
    return resolved;
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
        const info = await stat(filePath);
        if (info.isDirectory()) {
            res.writeHead(403).end('Forbidden');
            return;
        }
        const ext = extname(filePath).toLowerCase();
        // Long-lived caching is safe because index.html references every asset with
        // an explicit ?v= cache-busting token.
        const cacheControl = ext === '.html'
            ? 'no-cache'
            : 'public, max-age=31536000, immutable';

        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Content-Length': info.size,
            'Cache-Control': cacheControl,
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            // frame-ancestors is header-only per spec - browsers ignore it in the <meta>
            // CSP in index.html. X-Frame-Options is the legacy equivalent.
            'Content-Security-Policy': "frame-ancestors 'none'",
            'X-Frame-Options': 'DENY'
        });
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(filePath).pipe(res);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
    }
});

server.listen(PORT, HOST, () => {
    console.log(`VRCLUB static server listening on http://${HOST}:${PORT}`);
});
