#!/usr/bin/env node
// Rewrite every ?v= cache-busting token in index.html to a single fresh value.
//
// The token is repeated on every first-party <script> and <link> tag and must be
// bumped in lockstep - a partial bump ships a mix of cached and fresh files, which
// is the hardest class of bug to reproduce because it depends on the visitor's
// cache state. `npm test` asserts the tokens are consistent; this script produces
// a consistent set in one step.
//
//   npm run version:bump              -> token derived from today's date, e.g. 20260729-1
//   npm run version:bump -- 20260729a -> explicit token
//
// Also mirrors the token into package.json `cacheToken` so the deployed build is
// identifiable from the manifest alone.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = join(ROOT, 'index.html');
const pkgPath = join(ROOT, 'package.json');

const TOKEN_RE = /\?v=([A-Za-z0-9._-]+)/g;

function nextToken(existing) {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    // Must exceed every token already issued today, not merely differ from the one
    // in the file - reusing a lower number re-serves whatever a visitor cached under it.
    let highest = 0;
    for (const token of existing) {
        const m = /^(\d{8})-(\d+)$/.exec(token);
        if (m && m[1] === stamp) highest = Math.max(highest, Number(m[2]));
    }
    return `${stamp}-${highest + 1}`;
}

const html = readFileSync(indexPath, 'utf8');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const current = new Set([...html.matchAll(TOKEN_RE)].map(m => m[1]));

const explicit = process.argv[2];
if (explicit && !/^[A-Za-z0-9._-]+$/.test(explicit)) {
    console.error(`Invalid token "${explicit}". Allowed characters: A-Z a-z 0-9 . _ -`);
    process.exit(1);
}
// pkg.cacheToken records the last token shipped, so it seeds the high-water mark too.
const token = explicit || nextToken(new Set([...current, pkg.cacheToken].filter(Boolean)));

let count = 0;
const updated = html.replace(TOKEN_RE, () => { count++; return `?v=${token}`; });

if (count === 0) {
    console.error('No ?v= tokens found in index.html - nothing to bump.');
    process.exit(1);
}

writeFileSync(indexPath, updated);

pkg.cacheToken = token;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Bumped ${count} cache token(s): ${[...current].join(', ') || '(none)'} -> ${token}`);
