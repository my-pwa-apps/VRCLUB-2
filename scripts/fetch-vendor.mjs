#!/usr/bin/env node
// Download the pinned Babylon.js bundles into js/vendor/ and verify each against
// the SRI hash recorded in scripts/vendor.manifest.json.
//
// index.html loads these vendored copies, not the CDN. A CDN outage was observed
// live (HTTP 502 on loaders/babylonjs.loaders.min.js) and it silently removed every
// .glb from the scene, because that bundle registers the glTF plugin. Self-hosting
// removes the third-party runtime dependency entirely; the manifest keeps the
// provenance and the integrity hashes auditable.
//
//   npm run vendor:babylon            -> fetch any missing or stale file
//   npm run vendor:babylon -- --force -> re-fetch everything

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'js', 'vendor');
const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts', 'vendor.manifest.json'), 'utf8'));
const force = process.argv.includes('--force');

mkdirSync(VENDOR, { recursive: true });

const digest = (algo, bytes) => createHash(algo).update(bytes).digest('base64');

let failed = 0;
for (const entry of manifest.files) {
    const [algo, expected] = entry.integrity.split('-');
    const dest = join(VENDOR, entry.file);

    if (!force && existsSync(dest)) {
        const actual = digest(algo, readFileSync(dest));
        if (actual === expected) {
            console.log(`skip  js/vendor/${entry.file}  (already present, integrity OK)`);
            continue;
        }
        console.log(`stale js/vendor/${entry.file}  (integrity mismatch, re-fetching)`);
    }

    try {
        const res = await fetch(entry.url, { redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        const actual = digest(algo, bytes);
        if (actual !== expected) {
            throw new Error(`integrity mismatch\n      expected ${algo}-${expected}\n      actual   ${algo}-${actual}`);
        }
        writeFileSync(dest, bytes);
        console.log(`ok    js/vendor/${entry.file}  (${(bytes.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
        console.error(`FAIL  ${entry.url}\n      ${err.message}`);
        failed++;
    }
}

if (failed > 0) {
    console.error(`\n${failed} vendor file(s) could not be fetched.`);
    process.exit(1);
}
console.log(`\njs/vendor/ is up to date for Babylon.js ${manifest.babylonVersion}.`);
