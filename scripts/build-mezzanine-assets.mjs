#!/usr/bin/env node
// Rebuild the mezzanine's steel textures from their CC0 Poly Haven sources.
//
//   textures/steelDeck/   Poly Haven "Metal Plate" (diamond tread plate), 1K: deck and stair treads
//   textures/steelPanel/  Poly Haven "Metal Plate 02" (worn riveted panels), 512 px: fascia, columns, stringers
//
// Each folder holds diff.jpg, normal.jpg (the DirectX variant, like every other surface set) and orm.jpg
// (Poly Haven's `arm` map, already R = occlusion, G = roughness, B = metallic).
// Usage: node scripts/build-mezzanine-assets.mjs [--force]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const SETS = [
    { id: 'metal_plate', folder: 'steelDeck', size: 1024 },
    { id: 'metal_plate_02', folder: 'steelPanel', size: 512 }
];

for (const { id, folder, size } of SETS) {
    const dir = join(ROOT, 'textures', folder);
    const targets = ['diff.jpg', 'normal.jpg', 'orm.jpg'];
    if (!FORCE && targets.every(name => existsSync(join(dir, name)))) {
        console.log(`${folder}: present`);
        continue;
    }
    const response = await fetch(`https://api.polyhaven.com/files/${id}`);
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    const files = await response.json();
    mkdirSync(dir, { recursive: true });
    const sources = { 'diff.jpg': files.Diffuse['1k'].jpg.url, 'normal.jpg': files.nor_dx['1k'].jpg.url, 'orm.jpg': files.arm['1k'].jpg.url };
    for (const [name, url] of Object.entries(sources)) {
        const download = await fetch(url);
        if (!download.ok) throw new Error(`${url}: HTTP ${download.status}`);
        const input = Buffer.from(await download.arrayBuffer());
        let pipeline = sharp(input).resize(size, size, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true });
        // Full-resolution chroma for the packed map: its channels are data, not colour.
        pipeline = name === 'orm.jpg'
            ? pipeline.jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
            : pipeline.jpeg({ quality: 88, mozjpeg: true });
        const output = await pipeline.toBuffer();
        writeFileSync(join(dir, name), output);
        console.log(`textures/${folder}/${name}: ${size}px ${(output.length / 1024).toFixed(0)} KiB`);
    }
}
