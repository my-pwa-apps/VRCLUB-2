#!/usr/bin/env node
// Rebuild the checked-in avatar GLBs with standard glTF quantization and WebP
// textures. Meshopt/Draco are deliberately avoided: both require a runtime decoder,
// while these extensions are decoded natively by Babylon.js/browser image support.

import { readdirSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDir = join(ROOT, 'js', 'models', 'avatars');
const files = readdirSync(avatarDir).filter(file => file.endsWith('.glb'));

for (const file of files) {
    const source = join(avatarDir, file);
    const output = join(avatarDir, `${basename(file, '.glb')}.optimized.glb`);
    const result = spawnSync(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        [
            '--no-install', 'gltf-transform', 'optimize', source, output,
            '--compress', 'quantize',
            '--texture-compress', 'webp',
            '--texture-size', '1024',
            '--simplify', 'false'
        ],
        { stdio: 'inherit' }
    );
    if (result.status !== 0) process.exit(result.status || 1);
    renameSync(output, source);
}

console.log(`Optimized ${files.length} avatar GLB(s).`);
