#!/usr/bin/env node
// Generate the PWA icons.
//
// The manifest previously declared a single `data:image/svg+xml` icon. Chromium's
// installability criteria require at least one RASTER icon of 192x192 or larger,
// and `data:` icon URLs are not treated as installable resources - so the app was
// not actually installable despite shipping a manifest and a service worker.
//
// Deliberately dependency-free: a full image library for four flat icons would be
// a heavier devDependency than the icons themselves.
//
//   node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');

const crcTable = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} size square edge in px
 * @param {boolean} maskable true = full-bleed art (Android safe-zone aware)
 */
function renderPng(size, maskable) {
    // RGBA scanlines with a per-row filter byte (0 = None).
    const raw = Buffer.alloc(size * (size * 4 + 1));
    const cx = size / 2;
    const cy = size / 2;
    // A maskable icon is cropped to a circle inscribed in the safe zone, so the art
    // must stay well inside it; the "any" variant can use the full square.
    const discR = maskable ? size * 0.30 : size * 0.38;
    const ringR = discR * 0.62;

    for (let y = 0; y < size; y++) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0;
        for (let x = 0; x < size; x++) {
            const i = rowStart + 1 + x * 4;
            // Background: the club's near-black with a subtle vertical gradient.
            const t = y / size;
            let r = Math.round(3 + t * 14);
            let g = Math.round(3 + t * 8);
            let b = Math.round(8 + t * 34);

            const dx = x - cx;
            const dy = y - cy;
            const d = Math.hypot(dx, dy);

            // Cyan -> magenta record/disc, matching the splash gradient.
            if (d <= discR) {
                const mix = (dx / discR + 1) / 2;
                r = Math.round(0 + mix * 255);
                g = Math.round(255 - mix * 255);
                b = 255;
            }
            // Punch the centre hole out so it reads as a record at small sizes.
            if (d <= ringR * 0.32) {
                r = 3; g = 3; b = 8;
            } else if (d > ringR * 0.32 && d <= ringR * 0.40) {
                r = 255; g = 255; b = 255;
            }

            raw[i] = r;
            raw[i + 1] = g;
            raw[i + 2] = b;
            raw[i + 3] = 255;
        }
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    ihdr[10] = 0;  // deflate
    ihdr[11] = 0;  // adaptive filtering
    ihdr[12] = 0;  // no interlace

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

mkdirSync(OUT, { recursive: true });
const written = [];
for (const [name, size, maskable] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-maskable-512.png', 512, true]
]) {
    writeFileSync(join(OUT, name), renderPng(size, maskable));
    written.push(name);
}
console.log(`Wrote ${written.length} icon(s) to icons/: ${written.join(', ')}`);
