#!/usr/bin/env node
// Verify the vendored Babylon.js bundles against their recorded SRI hashes, and
// (unless --offline) confirm the upstream CDN still serves byte-identical files.
//
// Two distinct failure modes are covered:
//   1. A vendored file in js/vendor/ was modified or truncated in the repository.
//   2. The pinned upstream URL drifted, meaning the manifest provenance is a lie.
//
// Run with: npm run check:sri  [-- --offline]

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'vendor.manifest.json'), 'utf8'));
const offline = process.argv.includes('--offline');

const digest = (algo, bytes) => createHash(algo).update(bytes).digest('base64');

let failed = 0;

for (const entry of manifest.files) {
    const [algo, expected] = entry.integrity.split('-');
    const local = join(ROOT, 'js', 'vendor', entry.file);

    if (!existsSync(local)) {
        console.error(`FAIL  js/vendor/${entry.file}\n      missing - run: npm run vendor:babylon`);
        failed++;
        continue;
    }

    const localHash = digest(algo, readFileSync(local));
    if (localHash !== expected) {
        console.error(`FAIL  js/vendor/${entry.file}\n      expected ${algo}-${expected}\n      actual   ${algo}-${localHash}`);
        failed++;
        continue;
    }
    console.log(`ok    js/vendor/${entry.file}  (local integrity)`);

    if (offline) continue;

    try {
        const res = await fetch(entry.url, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const upstream = digest(algo, Buffer.from(await res.arrayBuffer()));
        if (upstream !== expected) {
            console.error(`FAIL  ${entry.url}\n      upstream drifted from the pinned hash (${algo}-${upstream})`);
            failed++;
        } else {
            console.log(`ok    ${entry.url}  (upstream matches)`);
        }
    } catch (err) {
        console.error(`WARN  ${entry.url}\n      upstream unreachable: ${err.message}`);
    }
}

if (failed > 0) {
    console.error(`\n${failed} integrity check(s) failed.`);
    process.exit(1);
}
console.log('\nAll vendored bundles match their pinned hashes.');
