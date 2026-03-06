const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.env': 'application/octet-stream',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Health check endpoint for deployment platforms
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    // Sanitize URL - prevent path traversal
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath.includes('..') || urlPath.includes('\0')) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
    }

    // Default to index.html
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(ROOT, urlPath);

    // Ensure the resolved path is within ROOT
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(ROOT))) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error');
            }
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`VR Club server running on http://localhost:${PORT}`);
});
