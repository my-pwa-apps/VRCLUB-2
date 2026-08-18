#!/usr/bin/env node
// `node --check` every first-party JS file.
//
// This replaces a hand-maintained chain of `node --check js/foo.js && ...` in
// package.json, which silently stopped covering any file added after it was written.

import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const collectJs = (dir, relative = '') => readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
        if (entry.name === 'vendor') return [];
        const childRelative = join(relative, entry.name);
        return entry.isDirectory()
            ? collectJs(join(dir, entry.name), childRelative)
            : (entry.name.endsWith('.js') ? [join('js', childRelative)] : []);
    });

// js/vendor holds pinned third-party bundles; they are not ours to fix.
const files = [
    ...collectJs(join(ROOT, 'js')),
    ...(existsSync(join(ROOT, 'scripts'))
        ? readdirSync(join(ROOT, 'scripts')).filter(f => f.endsWith('.mjs')).map(f => join('scripts', f))
        : []),
    // Root-level worker scripts. These live outside js/ and were therefore covered
    // by no syntax check and no lint config at all.
    ...['sw.js', 'serviceworker.js'].filter(f => existsSync(join(ROOT, f)))
];

let failed = 0;
for (const file of files) {
    try {
        execFileSync(process.execPath, ['--check', join(ROOT, file)], { stdio: 'pipe' });
    } catch (err) {
        failed++;
        console.error(`FAIL  ${file}\n${err.stderr?.toString() ?? err.message}`);
    }
}

if (failed > 0) {
    console.error(`${failed} file(s) failed the syntax check.`);
    process.exit(1);
}
console.log(`Syntax OK: ${files.length} file(s).`);
