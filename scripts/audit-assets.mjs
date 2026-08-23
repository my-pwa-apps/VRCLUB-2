#!/usr/bin/env node

import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOTS = ['js/models', 'textures'];
const LARGE_ASSET_BYTES = 5 * 1024 * 1024;

function collectFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? collectFiles(path) : [path];
    });
}

const assets = ASSET_ROOTS
    .flatMap(directory => collectFiles(join(ROOT, directory)))
    .map(path => ({
        path: relative(ROOT, path).replaceAll('\\', '/'),
        bytes: statSync(path).size,
        type: extname(path).slice(1).toLowerCase() || '(none)'
    }))
    .sort((left, right) => right.bytes - left.bytes);

const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
const byType = new Map();
for (const asset of assets) {
    byType.set(asset.type, (byType.get(asset.type) || 0) + asset.bytes);
}

const toMiB = bytes => (bytes / 1024 / 1024).toFixed(2);

console.log(`Asset payload: ${toMiB(totalBytes)} MiB across ${assets.length} files`);
console.log('\nLargest assets:');
for (const asset of assets.slice(0, 10)) {
    const marker = asset.bytes >= LARGE_ASSET_BYTES ? ' !' : '';
    console.log(`${toMiB(asset.bytes).padStart(8)} MiB  ${asset.path}${marker}`);
}

console.log('\nPayload by type:');
for (const [type, bytes] of [...byType].sort((left, right) => right[1] - left[1])) {
    console.log(`${toMiB(bytes).padStart(8)} MiB  .${type}`);
}

const budgetMiB = Number(process.env.ASSET_BUDGET_MB);
if (Number.isFinite(budgetMiB) && budgetMiB > 0 && totalBytes > budgetMiB * 1024 * 1024) {
    console.error(`\nAsset payload exceeds ASSET_BUDGET_MB=${budgetMiB}.`);
    process.exitCode = 1;
}