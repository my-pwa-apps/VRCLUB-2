#!/usr/bin/env node
// Builds the app icons from design/icon-source.png (the neon N, 768 px square on near-black).
//
//   icons/icon-512.png           512  the "any" icon (Chromium installability needs a raster icon of 192 px or more)
//   icons/icon-192.png           192
//   icons/icon-180.png           180  apple-touch-icon (iOS ignores the manifest icons and wants an opaque square)
//   icons/icon-maskable-512.png  512  the same artwork at 80% inside the maskable safe zone (a circle of 40% radius), so
//                                     a launcher's round or squircle mask never clips the letter
//
// Run after replacing the source: npm run icons
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKGROUND = '#020202'; // the artwork's own background, sampled from its edges
const source = `data:image/png;base64,${(await readFile(path.join(ROOT, 'design', 'icon-source.png'))).toString('base64')}`;

const icons = [
    { file: 'icon-512.png', size: 512, scale: 1 },
    { file: 'icon-192.png', size: 192, scale: 1 },
    { file: 'icon-180.png', size: 180, scale: 1 },
    { file: 'icon-maskable-512.png', size: 512, scale: 0.8 }
];

const browser = await chromium.launch();
try {
    for (const { file, size, scale } of icons) {
        const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
        const inner = Math.round(size * scale);
        await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;background:${BACKGROUND};display:grid;place-items:center">
            <img src="${source}" style="width:${inner}px;height:${inner}px;image-rendering:auto"></body>`, { waitUntil: 'load' });
        await page.screenshot({ path: path.join(ROOT, 'icons', file) });
        await page.close();
        console.log(`Wrote icons/${file} (${size}x${size}${scale < 1 ? `, artwork at ${scale * 100}%` : ''})`);
    }
} finally {
    await browser.close();
}
