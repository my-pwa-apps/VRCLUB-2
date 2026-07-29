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
