// Dependency-free contract tests for the VRCLUB static app.
//
// Development sources are classic scripts whose load ORDER is a hard contract,
// and the UI is wired by string IDs looked up at runtime. The production builder
// preserves that order in one bundle. A renamed element id or reordered script
// renamed element id or a reordered <script> tag fails silently in the browser.
// These tests close that gap without adding a single dependency.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** Every first-party script tag in index.html, in document order. */
const scriptSrcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
    .map(m => m[1])
    .filter(src => !/^https?:/.test(src));

/** Path portion of a script src, minus the ?v= cache-busting token. */
const srcPath = (src) => src.split('?')[0];

// Paths are normalised to POSIX separators throughout. A `join('js','club') + '\\'`
// filter previously matched on Windows and matched NOTHING on the Linux CI runner,
// which made the dispose()-listener guarantee simultaneously a no-op locally and a
// hard failure in CI.
const toPosix = (p) => p.split(sep).join('/');
const collectJs = (dir, relative = '') => readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
        if (entry.name === 'vendor') return [];
        const childRelative = join(relative, entry.name);
        return entry.isDirectory()
            ? collectJs(join(dir, entry.name), childRelative)
            : (entry.name.endsWith('.js') ? [toPosix(join('js', childRelative))] : []);
    });
const jsFiles = collectJs(join(ROOT, 'js'));

const collectFilesWithExtension = (dir, extension, relative = '') => readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => {
        const childRelative = join(relative, entry.name);
        return entry.isDirectory()
            ? collectFilesWithExtension(join(dir, entry.name), extension, childRelative)
            : (entry.name.toLowerCase().endsWith(extension) ? [toPosix(childRelative)] : []);
    });

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
    assert.ok(idx('js/audioUtils.js') > -1 && idx('js/audioUtils.js') < idx('js/club_hyperrealistic.js'),
        'audioUtils must load before club_hyperrealistic.js');

    const clubLayers = Array.from({ length: 11 }, (_, index) =>
        `js/club/${String(index + 1).padStart(2, '0')}-${[
            'core', 'lifecycle', 'rendering', 'environment', 'fixtures', 'effects',
            'animation-core', 'animation-fixtures', 'animation-finish', 'ui', 'audio-crowd'
        ][index]}.js`);
    for (let index = 0; index < clubLayers.length; index++) {
        assert.ok(idx(clubLayers[index]) > -1, `${clubLayers[index]} is not loaded`);
        if (index > 0) assert.ok(idx(clubLayers[index - 1]) < idx(clubLayers[index]), 'VRClub layers are out of order');
    }
    assert.ok(idx(clubLayers.at(-1)) < idx('js/club_hyperrealistic.js'), 'VRClub layers must precede the public class');

    // The main app constructs the factories, the loaders and the VJ director.
    const main = idx('js/club_hyperrealistic.js');
    for (const dep of ['js/textureLoader.js', 'js/modelLoader.js', 'js/materialFactory.js', 'js/lightFactory.js', 'js/vjDirector.js', 'js/showDirector.js', 'js/ledPatterns.js']) {
        assert.ok(idx(dep) > -1 && idx(dep) < main, `${dep} must load before club_hyperrealistic.js`);
    }
    // ShowDirector reads the beat grid VJDirector publishes.
    assert.ok(idx('js/vjDirector.js') < idx('js/showDirector.js'), 'vjDirector must precede showDirector');
    // ui-init drives the splash screen and instantiates VRClub.
    assert.ok(idx('js/ui-init.js') > main, 'ui-init.js must load after club_hyperrealistic.js');
});

test('every class used across files is exported onto window', () => {
    const required = {
        'js/assetCache.js': ['IndexedDBAssetCache', 'InFlightRegistry'],
        'js/audioUtils.js': ['AudioUtils'],
        'js/textureLoader.js': ['TextureLoader'],
        'js/modelLoader.js': ['ModelLoader'],
        'js/materialFactory.js': ['MaterialFactory'],
        'js/lightFactory.js': ['LightFactory'],
        'js/showDirector.js': ['ShowDirector'],
        'js/ledPatterns.js': ['LEDPatterns']
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
        'vrAudioFileInput', 'audioPlayBtn', 'audioCancelBtn', 'fpsCounter',
        'swUpdatePrompt'
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

test('every shipped GLB is documented in ASSETS.md', () => {
    const manifest = readFileSync(join(ROOT, 'ASSETS.md'), 'utf8');
    const models = collectFilesWithExtension(join(ROOT, 'js/models'), '.glb', 'js/models');

    assert.ok(models.length > 0, 'no GLB assets found under js/models');
    for (const model of models) {
        assert.ok(manifest.includes(`\`${model}\``), `${model} is missing from ASSETS.md`);
    }
});

test('cache-busting tokens are consistent across index.html', () => {
    const tokens = new Set([...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map(m => m[1]));
    assert.equal(tokens.size, 1, `index.html mixes cache-busting tokens: ${[...tokens].join(', ')}`);
});

test('the Babylon runtime is vendored, not fetched from a third-party CDN', () => {
    // A CDN outage was observed live (HTTP 502 on the loaders bundle) and it silently
    // removed every .glb from the scene. The runtime is now same-origin; the manifest
    // keeps provenance and integrity hashes auditable.
    const cdnTags = [...html.matchAll(/<script[^>]*\ssrc="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(cdnTags, [], `index.html still loads scripts from a third-party origin: ${cdnTags.join(', ')}`);

    const manifest = JSON.parse(readFileSync(join(ROOT, 'scripts/vendor.manifest.json'), 'utf8'));
    assert.ok(manifest.files.length > 0, 'vendor manifest lists no files');

    for (const entry of manifest.files) {
        const p = join(ROOT, 'js/vendor', entry.file);
        assert.ok(existsSync(p), `vendored bundle missing - run npm run vendor:babylon: ${entry.file}`);
        assert.match(entry.integrity, /^sha(256|384|512)-[A-Za-z0-9+/=]+$/, `bad integrity for ${entry.file}`);

        const [algo, expected] = entry.integrity.split('-');
        const actual = createHash(algo).update(readFileSync(p)).digest('base64');
        assert.equal(actual, expected, `js/vendor/${entry.file} does not match its recorded ${algo} hash`);

        // Non-script assets (the PBR environment .env) are loaded by JS, not by a
        // <script> tag, and upstream does not version-pin their URL.
        if (entry.kind === 'asset') continue;
        assert.match(entry.url, /\/v\d+\.\d+\.\d+\//, `vendor source is not version-pinned: ${entry.url}`);
        assert.ok(html.includes(`js/vendor/${entry.file}`), `index.html does not load js/vendor/${entry.file}`);
    }
});

test('no first-party code fetches from a third-party origin', () => {
    // A CDN 502 was observed live and silently stripped every .glb from the scene.
    // The Babylon runtime was vendored in response - but the PBR environment texture
    // was still fetched from assets.babylonjs.com, so the same outage would still
    // have removed every reflection in the club. Keep the critical path same-origin.
    const offenders = [];
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        source.split('\n').forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
            const m = /["'`](https?:\/\/[^"'`\s]+)["'`]/.exec(line);
            // Documentation links inside object literals (attribution strings) are fine;
            // only assignments that look like a resource load are flagged.
            if (m && /(src|url|Url|URL|CreateFromPrefilteredData|fetch|import)/.test(line)) {
                offenders.push(`${file}:${i + 1}  ${m[1]}`);
            }
        });
    }
    // The default radio stream is inherently third-party and user-replaceable.
    const filtered = offenders.filter(o => !o.includes('stream.sunshine-live.de'));
    assert.deepEqual(filtered, [],
        `vendor these instead of loading them from a third-party origin:\n${filtered.join('\n')}`);
});

test('the CSP does not grant script-src to any third-party origin', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s)?.[1];
    assert.ok(csp, 'no meta CSP found');
    const scriptSrc = csp.match(/script-src([^;]*);/)?.[1] ?? '';
    assert.ok(!/https?:\/\//.test(scriptSrc), `script-src allows a remote origin: ${scriptSrc.trim()}`);
    assert.ok(!/unsafe-inline|unsafe-eval/.test(scriptSrc), `script-src is not strict: ${scriptSrc.trim()}`);
    assert.ok(!/frame-ancestors/.test(csp), 'frame-ancestors is ignored in a meta CSP - send it as an HTTP header');
});

test('no first-party JS file leaves debug logging switched on', () => {
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        // matchAll, not match: the non-global version only ever checked the FIRST
        // debug flag in a file, so a second `const TEX_DEBUG = true` sailed through.
        for (const m of source.matchAll(/const\s+(\w*DEBUG\w*)\s*=\s*(true|false)/g)) {
            assert.equal(m[2], 'false', `${file}: ${m[1]} is left enabled`);
        }
    }
});

test('every version identifier agrees', () => {
    // Five identifiers used to drift freely (they had, in fact, already drifted).
    // A stale service-worker VERSION means `activate` never evicts the previous
    // cache, so a deploy silently keeps serving the old bundle.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const token = pkg.cacheToken;
    assert.ok(token, 'package.json has no cacheToken');

    const htmlTokens = new Set([...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map(m => m[1]));
    assert.deepEqual([...htmlTokens], [token], 'index.html tokens disagree with package.json cacheToken');

    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    const swVersion = sw.match(/const VERSION = '([^']+)';/)?.[1];
    assert.equal(swVersion, `vrclub-v${token}`, 'sw.js VERSION disagrees with the cache token');

    const swToken = sw.match(/const CACHE_TOKEN = '([^']+)';/)?.[1];
    assert.equal(swToken, token, 'sw.js CACHE_TOKEN disagrees with the cache token');

    const alias = readFileSync(join(ROOT, 'serviceworker.js'), 'utf8');
    assert.ok(alias.includes(swVersion), 'serviceworker.js version comment is stale');
});

test('the service worker precaches the versioned URLs the page actually requests', () => {
    // caches.match() compares the FULL url including the query string unless
    // ignoreSearch is set. An unversioned precache entry can therefore never satisfy
    // a `?v=`-suffixed request, which silently made the whole precache dead weight
    // AND downloaded every core asset twice on a cold load.
    const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
    assert.match(sw, /\$\{path\}\?v=\$\{CACHE_TOKEN\}/,
        'sw.js must append the cache token to every precached app-shell URL');

    // Binary assets are owned by IndexedDBAssetCache; caching them in the SW too
    // doubles ~100 MB of storage and exhausts the origin quota on a Quest.
    assert.match(sw, /IDB_OWNED/, 'sw.js must exclude IndexedDB-owned binary assets');
    assert.ok(!/skipWaiting\(\)\s*\)/.test(sw.split('addEventListener(\'install\'')[1]?.split('addEventListener(\'message\'')[0] ?? ''),
        'install must not call skipWaiting() unconditionally');
});

test('the production build bundles exactly the scripts index.html loads', () => {
    // build.mjs used to keep a second hand-maintained copy of the load order. A file
    // added to index.html but missed there was stripped from dist/index.html and
    // simply absent from production, with a green test suite.
    const build = readFileSync(join(ROOT, 'scripts/build.mjs'), 'utf8');
    assert.match(build, /indexHtml\.matchAll\(/,
        'build.mjs must derive its source list from index.html, not duplicate it');
    assert.match(build, /still references un-bundled scripts/,
        'build.mjs must assert that no first-party script tag survives into dist/index.html');
    assert.match(build, /const VERSION = '\[\^'\]\+';/,
        'build.mjs must rewrite the service worker VERSION for the dist build');
});

test('no blocking native dialogs are used for user feedback', () => {
    // alert()/confirm()/prompt() block the render loop, cannot be styled, and in a
    // headset render as a flat 2D browser panel floating over the scene - which is
    // both jarring and, on some runtimes, un-dismissable without leaving VR.
    // The app has its own toast (showErrorMessage); everything must route through it.
    const offenders = [];
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        source.split('\n').forEach((line, i) => {
            if (line.trim().startsWith('*') || line.trim().startsWith('//')) return;
            if (/(?<![.\w])(alert|confirm|prompt)\s*\(/.test(line)) {
                offenders.push(`${file}:${i + 1}  ${line.trim()}`);
            }
        });
    }
    assert.deepEqual(offenders, [], `use showErrorMessage() instead of a native dialog:\n${offenders.join('\n')}`);
});

test('global event listeners are registered with removable handler references', () => {
    // A listener added to `window`/`document` with an inline function literal can
    // never be removed, and its closure pins the whole VRClub instance - and with it
    // the Babylon scene graph, the WebGL context and every loaded GLB - in memory
    // for the lifetime of the document. dispose() then silently does nothing.
    // Requiring a stored reference (`this._onFoo` / a named const) keeps teardown possible.
    const pattern = /(?:window|document)\.addEventListener\(\s*(['"][^'"]+['"])\s*,\s*(.{0,24})/g;
    const offenders = [];
    for (const file of jsFiles) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        for (const m of source.matchAll(pattern)) {
            const handler = m[2].trim();
            const isReference = /^(this\.[_A-Za-z]|[A-Za-z_$][\w$]*\s*[,)])/.test(handler);
            if (!isReference) {
                const line = source.slice(0, m.index).split('\n').length;
                offenders.push(`${file}:${line}  addEventListener(${m[1]}, ${handler}...`);
            }
        }
    }
    assert.deepEqual(offenders, [],
        `global listeners must use a stored handler reference so they can be removed:\n${offenders.join('\n')}`);
});

test('every long-lived listener stored on the instance is removed in dispose()', () => {
    const source = jsFiles
        .filter(file => file.startsWith('js/club/') || file.endsWith('club_hyperrealistic.js'))
        .map(file => readFileSync(join(ROOT, file), 'utf8'))
        .join('\n');
    const added = new Set(
        [...source.matchAll(/(?:window|document)\.addEventListener\(\s*['"][^'"]+['"]\s*,\s*(this\.\w+)/g)]
            .map(m => m[1])
    );
    assert.ok(added.size > 0, 'expected VRClub to register global listeners');

    const disposeStart = source.indexOf('    dispose() {');
    assert.ok(disposeStart > -1, 'dispose() not found');
    const disposeBody = source.slice(disposeStart, disposeStart + 6000);

    const leaked = [...added].filter(ref => !disposeBody.includes(`removeEventListener`) || !disposeBody.includes(ref));
    assert.deepEqual(leaked, [], `dispose() never removes: ${leaked.join(', ')}`);
});

test('README documents every first-party script', () => {
    // The load order in index.html is a hard contract; a file that exists but is
    // undocumented is a file the next contributor will not know to keep in order.
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const undocumented = jsFiles
        .map(f => f.replace(/\\/g, '/'))
        .filter(f => !readme.includes(f));
    assert.deepEqual(undocumented, [], `README.md does not mention: ${undocumented.join(', ')}`);
});
