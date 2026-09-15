#!/usr/bin/env node
// Rebuild checked-in avatar GLBs with 512 px WebP textures. Geometry transforms
// are deliberately avoided because they can duplicate skins in modular animated models.

import { readdirSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDir = join(ROOT, 'js', 'models', 'avatars');
const files = readdirSync(avatarDir).filter(file => file.endsWith('.glb'));
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMeshQuantization]);

for (const file of files) {
    const source = join(avatarDir, file);
    const output = join(avatarDir, `${basename(file, '.glb')}.optimized.glb`);
    const document = await io.read(source);
    await document.transform(textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [512, 512]
    }));
    await io.write(output, document);
    renameSync(output, source);
}

console.log(`Optimized ${files.length} avatar GLB(s).`);
