#!/usr/bin/env node
// Pack each surface set's separate ao.jpg and roughness.jpg into one orm.jpg:
//   R = ambient occlusion, G = roughness, B = metallic (0: these are dielectrics).
// One texture instead of two, and the metallic channel is a real zero instead of a copy of the
// roughness map (the old greyscale roughness map was sampled for metallic too, which only
// worked because every consumer's metallic scalar was tiny).
//
// Run once per set after downloading new sources (Poly Haven names them `ao` and `rough`);
// it consumes ao.jpg and roughness.jpg and leaves orm.jpg. With neither present it does nothing.
//
//   node scripts/pack-orm.mjs [textures/factoryFloor ...]   (default: every set under textures/)

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const textures = join(ROOT, 'textures');
const dirs = process.argv.length > 2
    ? process.argv.slice(2).map(arg => resolve(arg))
    : readdirSync(textures, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && entry.name !== 'environment')
        .map(entry => join(textures, entry.name));

let packed = 0;
for (const dir of dirs) {
    const aoPath = join(dir, 'ao.jpg');
    const roughPath = join(dir, 'roughness.jpg');
    if (!existsSync(aoPath) || !existsSync(roughPath)) continue;

    const ao = sharp(aoPath);
    const { width, height } = await ao.metadata();
    const channel = async path => sharp(path).resize(width, height).extractChannel(0).raw().toBuffer();
    const [r, g] = await Promise.all([channel(aoPath), channel(roughPath)]);
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
        rgb[i * 3] = r[i];
        rgb[i * 3 + 1] = g[i];
        rgb[i * 3 + 2] = 0;
    }
    // Full-resolution chroma: the channels are unrelated data, not colour, so the usual 4:2:0
    // subsampling would smear roughness into occlusion.
    await sharp(rgb, { raw: { width, height, channels: 3 } })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toFile(join(dir, 'orm.jpg'));
    rmSync(aoPath);
    rmSync(roughPath);
    packed++;
    console.log(`packed ${dir.slice(ROOT.length + 1)}/orm.jpg (${width}x${height})`);
}
console.log(packed ? `Packed ${packed} set(s).` : 'Nothing to pack.');
