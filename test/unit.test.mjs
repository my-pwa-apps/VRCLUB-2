import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function loadClassic(relativePath, globals = {}) {
    const window = {};
    const context = vm.createContext({
        window,
        console,
        URL,
        Map,
        Set,
        Promise,
        performance: { now: () => 0 },
        ...globals
    });
    window.window = window;
    window.location = { href: 'https://vrclub.example/', protocol: 'https:' };
    vm.runInContext(readFileSync(join(ROOT, relativePath), 'utf8'), context, { filename: relativePath });
    return { window, context };
}

test('audio URL policy accepts supported sources and rejects unsafe inputs', () => {
    const AudioUtils = require('../js/audioUtils.js');
    const httpsPage = 'https://vrclub.example/';
    const cases = [
        ['https://radio.example/live.mp3', true],
        ['blob:https://vrclub.example/01234567-89ab-cdef-0123-456789abcdef', true],
        ['http://localhost:8000/live.mp3', true],
        ['http://127.0.0.1:8000/live.mp3', true],
        ['http://radio.example/live.mp3', false],
        ['https://user:pass@radio.example/live.mp3', false],
        ['javascript:alert(1)', false],
        ['data:audio/mp3;base64,AAAA', false],
        ['', false],
        [null, false]
    ];

    for (const [url, expected] of cases) {
        assert.equal(AudioUtils.isSafeAudioUrl(url, httpsPage), expected, String(url));
    }
    assert.equal(AudioUtils.isSafeAudioUrl('http://radio.example/live.mp3', 'http://localhost:8000/'), true);
});

test('default techno stream starts inside the Enter Club user gesture', () => {
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const clickHandler = source.slice(
        source.indexOf("enterClubBtn.addEventListener('click'"),
        source.indexOf('function hideSplashWhenReady()')
    );

    assert.match(source, /https:\/\/stream\.sunshine-live\.de\/techno\/mp3-192\//);
    assert.ok(clickHandler.indexOf('startAudioStream(DEFAULT_AUDIO_STREAM.url)') >= 0);
    assert.ok(
        clickHandler.indexOf('startAudioStream(DEFAULT_AUDIO_STREAM.url)') < clickHandler.indexOf('setTimeout('),
        'default audio must start before deferred work loses user activation'
    );
});

test('camera toolbar exposes only the curated immersive presets', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const source = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    const buttons = [...html.matchAll(/data-camera-preset="([^"]+)"/g)].map(match => match[1]);
    const expected = ['arrival', 'danceFloor', 'djBooth', 'lightingGallery'];

    assert.deepEqual(buttons, expected);
    for (const preset of expected) {
        assert.match(source, new RegExp(`\\n\\s*${preset}: \\{ label:`));
    }
    assert.match(html, /id="cameraPresetToggle"[^>]+aria-expanded="false"/);
    assert.match(html, /id="cameraPresetGrid" hidden/);
    assert.match(source, /setCameraPresetsOpen\(false\)/);
});

test('desktop and DJ-table VJ controls match implemented fixture capabilities', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const tableSource = readFileSync(join(ROOT, 'js/club/05-fixtures.js'), 'utf8');
    const desktopSource = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    const renderSource = readFileSync(join(ROOT, 'js/club/08-animation-fixtures.js'), 'utf8');
    const tableBlock = tableSource.slice(
        tableSource.indexOf('const toggleButtons = ['),
        tableSource.indexOf('toggleButtons.forEach')
    );
    const tableControls = [...tableBlock.matchAll(/control: "([^"]+)"/g)].map(match => match[1]);
    const expected = [
        'lightsActive', 'lasersActive', 'ledWallActive', 'strobesActive',
        'mirrorBallActive', 'ledMonochrome', 'changeColor', 'cycleSpotMode',
        'smokeActive', 'laserSheetActive', 'cyclePattern', 'blindersActive'
    ];

    assert.deepEqual(tableControls, expected);
    for (const control of expected) {
        assert.match(html, new RegExp(`data-control="${control}"`));
    }
    assert.match(html, /data-control="spotStrobeActive"[^>]*>SPOT FLASH<\/button>/);
    assert.match(desktopSource, /spotlightPattern \+ 1\) % 4/);
    assert.match(desktopSource, /"CROSSED BEAMS"/);
    assert.match(renderSource, /!this\.photosensitiveSafeMode && this\.spotStrobeActive/);
});

test('PA speakers and collision volumes share the rear-truss coordinates', () => {
    const loaderSource = readFileSync(join(ROOT, 'js/modelLoader.js'), 'utf8');
    const environmentSource = readFileSync(join(ROOT, 'js/club/04-environment.js'), 'utf8');

    assert.match(loaderSource, /centerX: CLUB_POSITIONS\.paSpeakers\.left\.x/);
    assert.match(loaderSource, /centerZ: CLUB_POSITIONS\.paSpeakers\.right\.z/);
    assert.match(loaderSource, /hangFromTruss: true/);
    assert.doesNotMatch(loaderSource, /hangFromCeiling/);
    assert.match(environmentSource, /CLUB_POSITIONS\.paSpeakers\.left\.z/);
    assert.match(environmentSource, /CLUB_POSITIONS\.paSpeakers\.right\.z/);
});

test('VR transition preserves scene content and attaches visual effects to the XR camera', () => {
    const coreSource = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    const animationSource = readFileSync(join(ROOT, 'js/club/07-animation-core.js'), 'utf8');
    const materialSource = readFileSync(join(ROOT, 'js/materialFactory.js'), 'utf8');
    const lifecycleSource = readFileSync(join(ROOT, 'js/club/02-lifecycle.js'), 'utf8');
    const vrBlock = coreSource.slice(
        coreSource.indexOf('applyVRSettings(xrCamera)'),
        coreSource.indexOf('applyDesktopSettings()')
    );

    assert.match(vrBlock, /new BABYLON\.DefaultRenderingPipeline\([\s\S]*\[xrCamera\]/);
    assert.match(coreSource, /this\.renderPipeline = this\._desktopRenderPipeline;/);
    assert.match(coreSource, /vrPipeline\.dispose\(\)/);
    assert.doesNotMatch(vrBlock, /this\.scene\.materials\.forEach/);
    assert.match(vrBlock, /this\.scene\.fogDensity = vr\.fogDensity;/);
    assert.doesNotMatch(vrBlock, /vr\.fogDensity\s*\*/);
    assert.match(animationSource, /const activeSpotCount = this\.tierSettings\.mirrorSpots;/);
    assert.doesNotMatch(animationSource, /qualityTiers\.balanced\.mirrorSpots/);
    for (const tag of ["'toggle'", "'audiobtn'", "'sliderhandle'"]) {
        assert.match(materialSource, new RegExp(tag, 'g'));
    }
    assert.match(materialSource, /mat\.maxSimultaneousLights = this\.maxLights;/);
    assert.match(lifecycleSource, /this\._clampMaterialLightBudgets\(\);/);
});

test('InFlightRegistry de-duplicates concurrent work and clears completed entries', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true })
    });
    const registry = new window.InFlightRegistry();
    let calls = 0;
    let resolveWork;
    const work = new Promise(resolve => { resolveWork = resolve; });
    const factory = () => { calls++; return work; };

    const first = registry.run('model.glb', factory);
    const second = registry.run('model.glb', factory);
    assert.equal(first, second);
    assert.equal(calls, 1);

    resolveWork('done');
    assert.equal(await first, 'done');
    await Promise.resolve();

    assert.equal(await registry.run('model.glb', async () => { calls++; return 'again'; }), 'again');
    assert.equal(calls, 2);
});

test('IndexedDBAssetCache settles aborted transactions and disables itself on quota failure', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController,
        setTimeout,
        clearTimeout,
        fetch: async () => ({ ok: true })
    });
    const warnings = [];
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test',
        storeName: 'assets',
        logger: { info() {}, warn: (...args) => warnings.push(args), error() {} }
    });
    const quotaError = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    cache.db = {
        transaction() {
            const tx = {
                error: quotaError,
                objectStore: () => ({ put: () => ({}) })
            };
            queueMicrotask(() => tx.onabort());
            return tx;
        }
    };

    assert.equal(await cache.put('asset.glb', new Uint8Array([1])), false);
    assert.equal(cache.disabled, true);
    assert.equal(warnings.length, 1);
});

test('MaterialFactory cache keys normalize colors and object key order', () => {
    class Color3 {
        constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
    }
    const { window } = loadClassic('js/materialFactory.js', { BABYLON: { Color3 } });
    const factory = new window.MaterialFactory(null, 4, console);

    const arrayKey = factory._cacheKey('pbr', {
        roughness: 0.3,
        baseColor: [1, 0, 0],
        clearCoat: { intensity: 1, roughness: 0.2 }
    });
    const colorKey = factory._cacheKey('pbr', {
        clearCoat: { roughness: 0.2, intensity: 1 },
        baseColor: new Color3(1, 0, 0),
        roughness: 0.3
    });

    assert.equal(arrayKey, colorKey);
});

test('ShowDirector resolves ramps and selects every calibrated energy band', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' }
    };
    const director = new window.ShowDirector(club);

    director._cue = { look: 'theWave', bars: 4 };
    director._cueStartBar = 0;
    director._barCounter = 2;
    director._beatInBar = 0;
    director._intensity = 1;
    director._applyContinuous({ beatEnvelope: 1, blackoutUntil: 0 }, { hasAudio: false });
    assert.equal(club.spotlightSpeed, 0.7);
    assert.ok(Number.isFinite(club.masterIntensity));
    assert.equal('intensity' in club, false);
    assert.equal('palette' in club, false);
    assert.equal('punch' in club, false);

    director._barsSinceMovement = Number.MAX_SAFE_INTEGER;
    const bands = [
        [0.02, 'afterglow'],
        [0.10, 'arrival'],
        [0.20, 'pulse'],
        [0.30, 'ascent'],
        [0.40, 'ignition']
    ];
    for (const [energy, expected] of bands) {
        director._energy = energy;
        assert.equal(director._pickMovement(), expected);
    }
});

test('VJDirector converges on BPM from synthetic onset intervals', () => {
    class Color3 {
        constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
    }
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: { Color3 } });
    const club = { vjBPM: 128 };
    const director = new window.VJDirector(club);

    for (let beat = 0; beat < 14; beat++) {
        director._registerBeat(1000 + beat * 500, false);
    }

    assert.ok(Math.abs(director.bpm - 120) < 1, `expected about 120 BPM, got ${director.bpm}`);
    assert.equal(director.beatNumber, 14);
});
