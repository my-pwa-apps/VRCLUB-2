#!/usr/bin/env node
// Build textures/graffiti/atlas.webp from karlwirbelwind's "Decal - Graffiti Textures" packs on Sketchfab
// (CC BY 4.0). Sketchfab downloads need an account, so pass the downloaded GLBs (or a folder holding them):
//
//   node scripts/build-graffiti-atlas.mjs <glb or folder> [...]
//
// Each pack is one quad carrying one RGBA image. Packs are recognised by the Sketchfab URL in the GLB's
// asset.extras, never by file name. Every image is stored upside down relative to how it is meant to be
// read (its quad maps the image's last row to the top), so it is flipped upright, trimmed to its painted
// area and fitted into its atlas cell. The cell layout below is mirrored by GRAFFITI_CELLS in
// js/club/03-rendering.js; change both together.

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIZE = 2048;
const PAD = 12;
// Atlas cells in pixels (x, y, w, h; y down), keyed by Sketchfab model id.
const CELLS = {
    '37d78e03040041bdb9158c7ce4aa7cd8': { name: 'character', rect: [0, 0, 1024, 1024] },
    '4b3bc244cccf4acb8d402372d8ce1db0': { name: 'tagWall', rect: [1024, 0, 1024, 1024] },
    '69a07e3d256e4b0490ac49e99ac57896': { name: 'tagCluster', rect: [0, 1024, 1024, 1024] },
    '19b3096fbd9a424484f78b58368a9b8a': { name: 'vaps', rect: [1024, 1024, 1024, 512] },
    '86d7a89828364880b5397081350455a7': { name: 'klw', rect: [1024, 1536, 1024, 512] }
};

const inputs = process.argv.slice(2).flatMap(arg => (statSync(arg).isDirectory()
    ? readdirSync(arg).filter(name => name.endsWith('.glb')).map(name => join(arg, name))
    : [arg]));
if (!inputs.length) {
    console.error('usage: node scripts/build-graffiti-atlas.mjs <glb or folder> [...]');
    process.exit(1);
}

const found = new Map();
for (const file of inputs) {
    const buf = readFileSync(file);
    if (buf.readUInt32LE(0) !== 0x46546c67) continue; // not binary glTF
    const jsonLength = buf.readUInt32LE(12);
    const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
    const source = gltf.asset && gltf.asset.extras && gltf.asset.extras.source || '';
    const id = Object.keys(CELLS).find(key => source.endsWith(key));
    if (!id || found.has(id)) continue;
    if (!/CC-BY-4\.0/.test(gltf.asset.extras.license || '')) throw new Error(`${file}: unexpected licence ${gltf.asset.extras.license}`);
    const binStart = 20 + jsonLength + 8;
    const view = gltf.bufferViews[gltf.images[0].bufferView];
    const start = binStart + (view.byteOffset || 0);
    found.set(id, buf.subarray(start, start + view.byteLength));
}
const missing = Object.keys(CELLS).filter(id => !found.has(id));
if (missing.length) throw new Error(`missing packs: ${missing.map(id => `${CELLS[id].name} (${id})`).join(', ')}`);

const layers = [];
for (const [id, png] of found) {
    const [x, y, w, h] = CELLS[id].rect;
    const upright = await sharp(png).flip().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = upright.info;
    // Painted bounds: every pixel the alpha test would keep, plus the soft overspray around it.
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            if (upright.data[(py * width + px) * 4 + 3] > 8) {
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
            }
        }
    }
    const trimmed = await sharp(upright.data, { raw: upright.info })
        .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
        .resize(w - 2 * PAD, h - 2 * PAD, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
        .png()
        .toBuffer();
    layers.push({ input: trimmed, left: x + PAD, top: y + PAD });
    console.log(`${CELLS[id].name.padEnd(10)} ${width}x${height} -> painted ${maxX - minX + 1}x${maxY - minY + 1} -> cell ${w}x${h}`);
}

const outDir = join(ROOT, 'textures', 'graffiti');
mkdirSync(outDir, { recursive: true });
const atlas = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
writeFileSync(join(outDir, 'atlas.webp'), atlas);
console.log(`textures/graffiti/atlas.webp: ${SIZE}px ${(atlas.length / 1024).toFixed(0)} KiB`);
