// Dependency-free contract tests for the VRCLUB static app.
//
// This project has no build step and no module system: every JS file is a classic
// script whose load ORDER is a hard contract, and the UI is wired by string IDs
// looked up at runtime. Nothing in the toolchain verifies either of those, so a
// renamed element id or a reordered <script> tag fails silently in the browser.
// These tests close that gap without adding a single dependency.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Every first-party script tag in index.html, in document order. */
const scriptSrcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map(m => m[1])
    .filter(src => !/^https?:/.test(src));

/** Path portion of a script src, minus the ?v= cache-busting token. */
const srcPath = (src) => src.split('?')[0];

const jsFiles = readdirSync(join(ROOT, 'js'))
    .filter(f => f.endsWith('.js'))
    .map(f => join('js', f));

test('every first-party JS file parses', () => {
    for (const file of jsFiles) {
        assert.doesNotThrow(
            () => execFileSync(process.execPath, ['--check', join(ROOT, file)]),
            `${file} has a syntax error`
        );
    }
});

test('every script referenced by index.html exists on disk', () => {
    for (const src of scriptSrcs) {
        const p = join(ROOT, srcPath(src));
        assert.ok(existsSync(p), `index.html references missing script: ${src}`);
    }
});

test('every stylesheet referenced by index.html exists on disk', () => {
    const hrefs = [...html.matchAll(/<link[^>]*\shref="([^"]+)"/g)]
        .map(m => m[1])
        .filter(h => !/^(https?:|data:|mailto:)/.test(h));
    for (const href of hrefs) {
        assert.ok(existsSync(join(ROOT, srcPath(href))), `missing stylesheet: ${href}`);
    }
});

test('script load order honours the dependency contract', () => {
    const order = scriptSrcs.map(srcPath);
    const idx = (f) => order.indexOf(f);

    // assetCache defines IndexedDBAssetCache / InFlightRegistry / fetchWithTimeout,
    // which both loaders reference at construction time.
    assert.ok(idx('js/assetCache.js') > -1, 'js/assetCache.js is not loaded');
    assert.ok(idx('js/assetCache.js') < idx('js/textureLoader.js'), 'assetCache must precede textureLoader');
    assert.ok(idx('js/assetCache.js') < idx('js/modelLoader.js'), 'assetCache must precede modelLoader');

    // The main app constructs the factories, the loaders and the VJ director.
    const main = idx('js/club_hyperrealistic.js');
    for (const dep of ['js/textureLoader.js', 'js/modelLoader.js', 'js/materialFactory.js', 'js/lightFactory.js', 'js/vjDirector.js']) {
        assert.ok(idx(dep) > -1 && idx(dep) < main, `${dep} must load before club_hyperrealistic.js`);
    }
    // ui-init drives the splash screen and instantiates VRClub.
    assert.ok(idx('js/ui-init.js') > main, 'ui-init.js must load after club_hyperrealistic.js');
});

test('every class used across files is exported onto window', () => {
    const required = {
        'js/assetCache.js': ['IndexedDBAssetCache', 'InFlightRegistry'],
        'js/textureLoader.js': ['TextureLoader'],
        'js/modelLoader.js': ['ModelLoader'],
        'js/materialFactory.js': ['MaterialFactory'],
        'js/lightFactory.js': ['LightFactory']
    };
    for (const [file, names] of Object.entries(required)) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        for (const name of names) {
            assert.match(
                source,
                new RegExp(`window\\.${name}\\s*=`),
                `${file} must expose ${name} on window (classic scripts share no scope otherwise)`
            );
        }
    }
});

test('every element id looked up in JS exists in index.html', () => {
    const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

    // Ids created dynamically at runtime rather than authored in index.html.
    // Each one must be produced by an `id = '...'` / `id="..."` assignment in JS,
    // which the loop below verifies - so a typo is still caught.
    const runtimeIds = new Set([
        'vrclubToasts', 'vrAudioInput', 'audioUrlInput', 'audioFileBrowseBtn',
        'vrAudioFileInput', 'audioPlayBtn', 'audioCancelBtn', 'fpsCounter'
    ]);
    const allJsSource = jsFiles.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');

    const missing = [];
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        const ids = [
            ...[...source.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]),
            ...[...source.matchAll(/querySelector\(\s*['"]#([A-Za-z0-9_-]+)['"]\s*\)/g)].map(m => m[1])
        ];
        for (const id of ids) {
            if (htmlIds.has(id)) continue;
            if (runtimeIds.has(id)) {
                // Verify the element really is created somewhere in JS.
                const created = new RegExp(`id\\s*=\\s*['"]${id}['"]|id=\\\\?["']${id}`).test(allJsSource);
                assert.ok(created, `#${id} is declared as a runtime id but nothing creates it`);
                continue;
            }
            missing.push(`${file} -> #${id}`);
        }
    }
    assert.deepEqual(missing, [], `JS looks up element ids that do not exist in index.html:\n${missing.join('\n')}`);
});

test('every data-control in index.html is handled somewhere in JS', () => {
    const controls = new Set([...html.matchAll(/data-control="([^"]+)"/g)].map(m => m[1]));
    const allJs = jsFiles.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n');
    const unhandled = [...controls].filter(c => !allJs.includes(c));
    assert.deepEqual(unhandled, [], `VJ controls exist in the DOM but nothing handles them: ${unhandled.join(', ')}`);
});

test('local texture assets referenced by textureLoader exist', () => {
    const source = readFileSync(join(ROOT, 'js/textureLoader.js'), 'utf8');
    const baseUrl = source.match(/const baseUrl = '([^']+)'/)?.[1];
    assert.ok(baseUrl, 'could not determine texture baseUrl');

    const folders = [...source.matchAll(/baseUrl:\s*`\$\{baseUrl\}\/(\w+)`/g)].map(m => m[1]);
    const files = new Set([...source.matchAll(/'(\w+\.jpg)'/g)].map(m => m[1]));
    assert.ok(folders.length > 0 && files.size > 0, 'expected textureLoader to reference local textures');

    for (const folder of folders) {
        for (const file of files) {
            const p = join(ROOT, baseUrl, folder, file);
            assert.ok(existsSync(p), `missing texture asset: ${baseUrl}/${folder}/${file}`);
        }
    }
});

test('local model assets referenced by modelLoader exist', () => {
    const source = readFileSync(join(ROOT, 'js/modelLoader.js'), 'utf8');
    const paths = [...source.matchAll(/url:\s*'(\.\/js\/models\/[^']+)'/g)].map(m => m[1]);
    for (const p of paths) {
        assert.ok(existsSync(join(ROOT, p)), `missing model asset: ${p}`);
    }
});

test('cache-busting tokens are consistent across index.html', () => {
    const tokens = new Set([...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map(m => m[1]));
    assert.equal(tokens.size, 1, `index.html mixes cache-busting tokens: ${[...tokens].join(', ')}`);
});

test('pinned CDN scripts carry SRI integrity attributes', () => {
    const cdnTags = [...html.matchAll(/<script[^>]*\ssrc="(https:\/\/[^"]+)"[^>]*>/g)];
    assert.ok(cdnTags.length > 0, 'expected pinned CDN script tags');
    for (const [tag, src] of cdnTags) {
        assert.match(tag, /integrity="sha\d{3}-/, `CDN script lacks SRI integrity: ${src}`);
        assert.match(tag, /crossorigin="anonymous"/, `CDN script lacks crossorigin=anonymous: ${src}`);
        assert.match(src, /\/v\d+\.\d+\.\d+\//, `CDN script is not version-pinned: ${src}`);
    }
});

test('no first-party JS file leaves debug logging switched on', () => {
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        const m = source.match(/const\s+(\w*DEBUG\w*)\s*=\s*(true|false)/);
        if (m) assert.equal(m[2], 'false', `${file}: ${m[1]} is left enabled`);
    }
});

test('repository contains no empty tracked directories that imply dead features', () => {
    const serverDir = join(ROOT, 'server');
    if (existsSync(serverDir) && statSync(serverDir).isDirectory()) {
        assert.ok(
            readdirSync(serverDir).length > 0,
            'server/ is empty - remove it or restore the multiplayer backend it implies'
        );
    }
});
