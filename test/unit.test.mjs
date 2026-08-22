// Behavioural unit tests.
//
// These EXECUTE first-party code in a VM with a minimal BABYLON stub. A previous
// version of this file was mostly `assert.match(readFileSync(...), /some regex/)`,
// which is a change detector: it cannot catch an off-by-one or an inverted branch,
// but it does fail whenever someone renames a parameter. Those were removed; what
// remains either runs the code or asserts a genuine cross-file invariant that
// nothing else can enforce.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** Minimal BABYLON surface: enough for the pure logic under test. */
function makeBabylonStub() {
    class Color3 {
        constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
        set(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
        copyFrom(o) { return this.set(o.r, o.g, o.b); }
        copyFromFloats(r, g, b) { return this.set(r, g, b); }
        scale(f) { return new Color3(this.r * f, this.g * f, this.b * f); }
        scaleToRef(f, out) { return out.set(this.r * f, this.g * f, this.b * f); }
        clone() { return new Color3(this.r, this.g, this.b); }
    }
    class Vector3 {
        constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    }
    // Used by the hue-cycling LED patterns.
    Color3.HSVtoRGBToRef = (h, s, v, out) => {
        const c = v * s;
        const hp = (((h % 360) + 360) % 360) / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        const m = v - c;
        const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
            : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
        return out.set(r + m, g + m, b + m);
    };
    return { Color3, Vector3 };
}

function loadClassic(relativePath, globals = {}) {
    const window = {};
    const context = vm.createContext({
        window,
        console,
        URL,
        Map,
        Set,
        Promise,
        Math,
        JSON,
        Object,
        Array,
        Number,
        String,
        performance: { now: () => 0 },
        ...globals
    });
    window.window = window;
    window.location = { href: 'https://vrclub.example/', protocol: 'https:' };
    vm.runInContext(readFileSync(join(ROOT, relativePath), 'utf8'), context, { filename: relativePath });
    return { window, context };
}

// ---------------------------------------------------------------------------
// Security boundary
// ---------------------------------------------------------------------------

test('audio URL policy accepts supported sources and rejects unsafe inputs', () => {
    const AudioUtils = require('../js/audioUtils.js');
    const httpsPage = 'https://vrclub.example/';
    const cases = [
        ['https://radio.example/live.mp3', true],
        ['blob:https://vrclub.example/01234567-89ab-cdef-0123-456789abcdef', true],
        ['http://localhost:8000/live.mp3', true],
        ['http://127.0.0.1:8000/live.mp3', true],
        // Whole 127.0.0.0/8 and the RFC 6761 special-use TLD, not just 127.0.0.1.
        ['http://127.0.0.2:8000/live.mp3', true],
        ['http://api.localhost:8000/live.mp3', true],
        ['http://[::1]:8000/live.mp3', true],
        // localhost.evil.com is NOT loopback.
        ['http://localhost.evil.com/live.mp3', false],
        ['http://radio.example/live.mp3', false],
        ['https://user:pass@radio.example/live.mp3', false],
        ['javascript:alert(1)', false],
        ['data:audio/mp3;base64,AAAA', false],
        ['file:///etc/passwd', false],
        ['', false],
        [null, false],
        // Unbounded input is synchronous O(n) work on the UI thread, straight from a paste.
        [`https://radio.example/${'a'.repeat(4000)}`, false]
    ];

    for (const [url, expected] of cases) {
        assert.equal(AudioUtils.isSafeAudioUrl(url, httpsPage), expected, String(url).slice(0, 60));
    }
    // Mixed content only applies when the PAGE is https.
    assert.equal(AudioUtils.isSafeAudioUrl('http://radio.example/live.mp3', 'http://localhost:8000/'), true);
});

// ---------------------------------------------------------------------------
// Asset caching primitives
// ---------------------------------------------------------------------------

test('InFlightRegistry de-duplicates concurrent work and clears completed entries', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true })
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

    registry.clear();
    assert.equal(registry.pending.size, 0);
});

test('IndexedDBAssetCache settles aborted transactions and disables itself on quota failure', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, queueMicrotask,
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
            const tx = { error: quotaError, objectStore: () => ({ put: () => ({}), getAll: () => ({}) }) };
            queueMicrotask(() => tx.onabort());
            return tx;
        }
    };

    assert.equal(await cache.put('asset.glb', new Uint8Array([1])), false);
    assert.equal(cache.disabled, true, 'a full quota must disable persistence, not throw');
    assert.ok(warnings.length >= 1);
});

test('IndexedDBAssetCache resolves writes on transaction COMMIT, not request success', async () => {
    // Chromium reports QuotaExceededError at commit time for large blobs. Settling on
    // request.onsuccess made put() report success, so the cache never disabled itself
    // and retried a doomed write on every load.
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, queueMicrotask, fetch: async () => ({ ok: true })
    });
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test', storeName: 'assets',
        logger: { info() {}, warn() {}, error() {} }
    });
    let committed = false;
    cache.db = {
        transaction() {
            const request = {};
            const tx = { objectStore: () => ({ put: () => request }) };
            queueMicrotask(() => {
                request.onsuccess();
                // A commit that never arrives must NOT resolve put().
                queueMicrotask(() => { committed = true; tx.oncomplete(); });
            });
            return tx;
        }
    };
    assert.equal(await cache.put('a.glb', new Uint8Array([1])), true);
    assert.equal(committed, true, 'put() resolved before the transaction committed');
});

test('IndexedDBAssetCache.init is concurrency-safe', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true }),
        indexedDB: undefined
    });
    const cache = new window.IndexedDBAssetCache({
        dbName: 'test', storeName: 'assets',
        logger: { info() {}, warn() {}, error() {} }
    });
    let opens = 0;
    cache._open = async function () { opens++; this.disabled = true; };
    await Promise.all([cache.init(), cache.init(), cache.init()]);
    assert.equal(opens, 1, 'concurrent init() calls must share one open');
});

test('body downloads preserve a caller abort signal', async () => {
    let observedSignal;
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout,
        fetch: async (_url, init) => {
            observedSignal = init.signal;
            if (init.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
            return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
        }
    });
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        window.fetchBufferWithTimeout('/model.glb', { signal: controller.signal }),
        error => error.name === 'AbortError'
    );
    assert.equal(observedSignal.aborted, true);
});

test('cache eviction selects timestamp-indexed keys without reading payloads', async () => {
    const { window } = loadClassic('js/assetCache.js', {
        AbortController, setTimeout, clearTimeout, fetch: async () => ({ ok: true })
    });
    const cache = new window.IndexedDBAssetCache({ dbName: 'test', storeName: 'assets' });
    const deleted = [];
    let selectedLimit;
    cache._run = async (mode, work) => work({
        count: () => 8,
        index: name => {
            assert.equal(name, 'timestamp');
            return {
                getAllKeys: (_range, limit) => {
                    selectedLimit = limit;
                    return ['old-a', 'old-b'];
                }
            };
        },
        delete: key => { deleted.push([mode, key]); }
    });

    assert.equal(await cache._evictOldest(0.25), 2);
    assert.equal(selectedLimit, 2);
    assert.deepEqual(deleted, [['readwrite', 'old-a'], ['readwrite', 'old-b']]);
});

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

test('MaterialFactory cache keys normalize colors and object key order', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/materialFactory.js', { BABYLON });
    const factory = new window.MaterialFactory(null, 4, console);

    const arrayKey = factory._cacheKey('pbr', {
        roughness: 0.3,
        baseColor: [1, 0, 0],
        clearCoat: { intensity: 1, roughness: 0.2 }
    });
    const colorKey = factory._cacheKey('pbr', {
        clearCoat: { roughness: 0.2, intensity: 1 },
        baseColor: new BABYLON.Color3(1, 0, 0),
        roughness: 0.3
    });
    assert.equal(arrayKey, colorKey);

    // Different configs must NOT collide.
    const other = factory._cacheKey('pbr', { roughness: 0.4, baseColor: [1, 0, 0] });
    assert.notEqual(arrayKey, other);
});

test('MaterialFactory freeze policy is driven by one shared list', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/materialFactory.js', { BABYLON });
    const F = window.MaterialFactory;

    assert.equal(F.isHotMutated('ledPanelMat'), true);
    assert.equal(F.isHotMutated('laserBeamMat'), true);
    assert.equal(F.isHotMutated('BRICKmat'), false);
    assert.equal(F.isHotMutated('trussMat'), false);
    // The list must exist exactly once; three verbatim copies had drifted before.
    const source = readFileSync(join(ROOT, 'js/materialFactory.js'), 'utf8');
    assert.equal((source.match(/'sliderhandle'/g) || []).length, 1,
        'HOT_MUTATED must be declared once, not copy-pasted per creator');
});

// ---------------------------------------------------------------------------
// Light factory
// ---------------------------------------------------------------------------

test('LightFactory.disposeGroup disposes every light in the group', () => {
    // The group array is spliced by disposeLight() while forEach walks it, and
    // forEach does not re-index - so the live-array version skipped every other
    // light and then deleted the only handle to the survivors.
    const disposed = [];
    const makeLight = (name) => ({ name, dispose() { disposed.push(name); }, getShadowGenerator: () => null });
    const { window } = loadClassic('js/lightFactory.js', { BABYLON: makeBabylonStub() });
    const factory = new window.LightFactory({ lights: [] }, { info() {}, warn() {} });

    for (const name of ['a', 'b', 'c', 'd']) {
        const light = makeLight(name);
        factory.lights.set(name, light);
        factory.addToGroup('dj', light);
    }
    factory.disposeGroup('dj');

    assert.deepEqual(disposed.sort(), ['a', 'b', 'c', 'd']);
    assert.equal(factory.lights.size, 0);
});

test('LightFactory refuses to silently orphan a light on a name collision', () => {
    const warnings = [];
    const { window } = loadClassic('js/lightFactory.js', { BABYLON: makeBabylonStub() });
    const factory = new window.LightFactory({ lights: [] }, { info() {}, warn: m => warnings.push(m) });

    let disposedFirst = false;
    factory._register('spot', { dispose() { disposedFirst = true; }, getShadowGenerator: () => null });
    factory._register('spot', { dispose() {}, getShadowGenerator: () => null });

    assert.equal(disposedFirst, true);
    assert.equal(factory.lights.size, 1);
    assert.ok(warnings.some(w => String(w).includes('already exists')));
});

test('ModelLoader.dispose releases loaded containers and procedural hierarchies', () => {
    const { window } = loadClassic('js/modelLoader.js', {
        BABYLON: makeBabylonStub(),
        navigator: { userAgent: '' },
        IndexedDBAssetCache: class {},
        InFlightRegistry: class {}
    });
    const loader = Object.create(window.ModelLoader.prototype);
    const calls = [];
    loader.inFlight = { clear: () => calls.push('clear') };
    loader.cache = { close: () => calls.push('close') };
    loader.loadedModels = {
        glb: {
            container: {
                removeAllFromScene: () => calls.push('remove-container'),
                dispose: () => calls.push('dispose-container')
            }
        },
        fallback: {
            rootMesh: { dispose: (...args) => calls.push(['dispose-root', ...args]) }
        }
    };
    loader._paSpeakerMatCache = {};

    loader.dispose();

    assert.deepEqual(calls, [
        'clear',
        'close',
        'remove-container',
        'dispose-container',
        ['dispose-root', false, false]
    ]);
    assert.equal(Object.keys(loader.loadedModels).length, 0);
    assert.equal(loader._paSpeakerMatCache, null);
});

// ---------------------------------------------------------------------------
// Show / VJ directors
// ---------------------------------------------------------------------------

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

test('no look writes a ShowDirector meta key onto the club instance', () => {
    // intensity / palette / punch are consumed by the director itself. Leaking one
    // onto the club would create a second, invisible writer for a fixture property.
    const { window } = loadClassic('js/showDirector.js');
    const meta = window.ShowDirector.META_KEYS;
    const baseClub = () => ({ vjManualMode: false, photosensitiveSafeMode: false, vjDirector: { paletteMode: 'analogous' } });
    const director = new window.ShowDirector(baseClub());

    const lookNames = Object.keys(director.looks);
    assert.ok(lookNames.length > 0, 'ShowDirector exposes no looks to validate');

    for (const name of lookNames) {
        const probe = baseClub();
        const d2 = new window.ShowDirector(probe);
        d2._applyLook(d2.looks[name]);
        for (const key of meta) {
            assert.equal(key in probe, false, `look "${name}" leaked meta key "${key}" onto the club`);
        }
    }
});

test('photosensitive safe mode force-clears strobes and blinders in every look', () => {
    const { window } = loadClassic('js/showDirector.js');
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: true,
        strobesActive: true,
        blindersActive: true,
        vjDirector: { paletteMode: 'analogous' }
    };
    const director = new window.ShowDirector(club);
    for (const name of Object.keys(director.looks)) {
        club.strobesActive = true;
        club.blindersActive = true;
        director._applyLook(director.looks[name]);
        assert.equal(club.strobesActive, false, `look "${name}" left strobes on in safe mode`);
        assert.equal(club.blindersActive, false, `look "${name}" left blinders on in safe mode`);
    }
});

test('NOCTURNE includes recurring single-subject lighting looks', () => {
    const { window } = loadClassic('js/showDirector.js');
    const director = new window.ShowDirector({
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' }
    });
    const expectedSolo = {
        deepBlue: 'mirrorBallActive',
        firstLight: 'lightsActive',
        theWave: 'ledWallActive',
        crossfire: 'lasersActive',
        sideways: 'lightsActive',
        beamsOnly: 'lasersActive',
        heldBreath: 'ledWallActive',
        liquidPlane: 'laserSheetActive',
        whiteChase: 'strobesActive',
        laserStorm: 'lasersActive',
        theVoid: 'mirrorBallActive'
    };
    const headlineSystems = [
        'lightsActive', 'lasersActive', 'laserSheetActive',
        'strobesActive', 'mirrorBallActive', 'ledWallActive'
    ];

    for (const [name, expected] of Object.entries(expectedSolo)) {
        const active = headlineSystems.filter(key => director.looks[name][key] === true);
        assert.deepEqual(active, [expected], `look "${name}" is not an exclusive ${expected} moment`);
    }

    const runningOrder = Object.values(director.movements).flatMap(movement => movement.cues.map(cue => cue.look));
    assert.ok(runningOrder.filter(name => name === 'whiteChase').length >= 2, 'strobe chase is not recurring');
    assert.ok(runningOrder.filter(name => name === 'liquidPlane').length >= 2, 'laser sheet is not recurring');
});

test('NOCTURNE color lock aligns the LED wall and mirror ball to the master hue', () => {
    const { window } = loadClassic('js/showDirector.js');
    const masterColor = { r: 0.2, g: 0.7, b: 1 };
    const club = {
        vjManualMode: false,
        photosensitiveSafeMode: false,
        vjDirector: { paletteMode: 'analogous' },
        currentSpotColor: masterColor
    };
    const director = new window.ShowDirector(club);
    director._cue = { look: 'chromaticRoom', bars: 4 };
    director._cueStartBar = 0;
    director._barCounter = 0;
    director._beatInBar = 0;
    director._applyLook(director.looks.chromaticRoom);
    director._applyContinuous({ beatEnvelope: 1, blackoutUntil: 0 }, { hasAudio: false });

    assert.equal(club.colorLockActive, true);
    assert.equal(club.ledShowColor, masterColor);
    assert.equal(club.mirrorBallSpotlightColor, masterColor);
});

test('VJDirector converges on BPM from synthetic onset intervals', () => {
    const { window } = loadClassic('js/vjDirector.js', { BABYLON: makeBabylonStub() });
    const club = { vjBPM: 128 };
    const director = new window.VJDirector(club);

    for (let beat = 0; beat < 14; beat++) {
        director._registerBeat(1000 + beat * 500, false);
    }

    assert.ok(Math.abs(director.bpm - 120) < 1, `expected about 120 BPM, got ${director.bpm}`);
    assert.equal(director.beatNumber, 14);
});

test('VJDirector publishes one phrase palette to the LED wall and mirror ball', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/vjDirector.js', { BABYLON });
    const mirrorColors = [
        new BABYLON.Color3(1, 0, 0),
        new BABYLON.Color3(0, 1, 0)
    ];
    const club = {
        vjBPM: 128,
        cachedColors: {},
        spotColorList: mirrorColors,
        mirrorBallColors: mirrorColors,
        mirrorBallColorIndex: 0
    };
    const director = new window.VJDirector(club);
    director.beatNumber = 16;

    director._applyPalette();

    assert.ok(club.ledShowColor instanceof BABYLON.Color3);
    assert.equal(club.ledShowColor.r, club.currentSpotColor.r);
    assert.equal(club.ledShowColor.g, club.currentSpotColor.g);
    assert.equal(club.ledShowColor.b, club.currentSpotColor.b);
    assert.equal(club.mirrorBallColorIndex, 1);
    assert.equal(club.mirrorBallSpotlightColor, mirrorColors[1]);
});

test('crowd instances expand to the active tier without duplicating dancers', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/11-audio-crowd.js', {
        BABYLON,
        VRClubUI: class {}
    });
    const club = {
        npcAvatars: [],
        _crowdSourceContainers: ['source-a'],
        _availableCrowdSources: ['source-a'],
        _crowdSlots: [
            { x: 0, z: 0, src: 0, height: 1.7, facing: 0 },
            { x: 1, z: 1, src: 0, height: 1.8, facing: 0.1 },
            { x: 2, z: 2, src: 0, height: 1.9, facing: 0.2 }
        ],
        _spawnAvatar(source, name) {
            this.npcAvatars.push({ source, name });
        }
    };

    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 2);
    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 3);
    window.VRClubAudioCrowd.prototype._spawnCrowdTo.call(club, 3);

    assert.deepEqual(club.npcAvatars.map(npc => npc.name), ['dancer0', 'dancer1', 'dancer2']);
});

// ---------------------------------------------------------------------------
// LED wall
// ---------------------------------------------------------------------------

test('every LED wall pattern runs without throwing', () => {
    // 37 pattern functions with zero coverage: a typo in any one of them threw into
    // the render loop's catch and silently blanked the club's flagship element.
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/ledPatterns.js', { BABYLON });
    const patterns = window.LEDPatterns;
    assert.ok(patterns && Object.keys(patterns).length > 0, 'LEDPatterns is empty');

    const cols = 28;
    const rows = 10;
    const panels = [];
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            panels.push({
                col, row,
                // Panels carry a per-panel scratch colour so updateLEDPanel() can write
                // in place rather than allocating one Color3 per panel per frame.
                colorBuffer: new BABYLON.Color3(),
                material: { emissiveColor: new BABYLON.Color3() }
            });
        }
    }
    const colour = new BABYLON.Color3(1, 0.2, 0.4);
    const audio = { bass: 0.5, mid: 0.4, treble: 0.3, average: 0.4, hasAudio: true };

    const club = {
        ledPanels: panels,
        ledCols: cols,
        ledRows: rows,
        ledTime: 3.5,
        ledMonochrome: false,
        bpm: 128,
        beatInterval: 60 / 128,
        beatEnvelope: 0.5,
        barPhase: 0.25,
        _ledColor: new BABYLON.Color3(),
        _ledColor2: new BABYLON.Color3(),
        cachedColors: {
            red: new BABYLON.Color3(1, 0, 0), green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1), white: new BABYLON.Color3(1, 1, 1),
            black: new BABYLON.Color3(0, 0, 0), cyan: new BABYLON.Color3(0, 1, 1),
            magenta: new BABYLON.Color3(1, 0, 1), yellow: new BABYLON.Color3(1, 1, 0),
            orange: new BABYLON.Color3(1, 0.5, 0), purple: new BABYLON.Color3(0.5, 0, 1),
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            ledMonoCool: new BABYLON.Color3(0.86, 0.92, 1),
            ledMonoWarm: new BABYLON.Color3(1, 0.95, 0.86)
        },
        cachedLEDColors: {
            matrixGreen: new BABYLON.Color3(0, 1, 0.2), auroraTeal: new BABYLON.Color3(0, 1, 1),
            oceanBlue: new BABYLON.Color3(0, 0.5, 1), heartRed: new BABYLON.Color3(1, 0.1, 0.2),
            fireOrange: new BABYLON.Color3(1, 0.6, 0)
        }
    };

    const failures = [];
    // The real app mixes LEDPatterns into VRClub.prototype, so the patterns call each
    // other and the shared helpers through `this`. Mirror that here.
    Object.assign(club, patterns);

    for (const [name, fn] of Object.entries(patterns)) {
        if (typeof fn !== 'function' || !name.startsWith('pattern')) continue;
        // Run twice: several patterns lazily allocate state on the first call, so a
        // one-shot smoke test misses bugs on the steady-state path.
        for (let i = 0; i < 2; i++) {
            try {
                fn.call(club, colour, 3.5 + i, audio);
            } catch (err) {
                failures.push(`${name}: ${err.message}`);
                break;
            }
        }
    }
    assert.deepEqual(failures, [], `LED patterns threw:\n${failures.join('\n')}`);

    // Every panel must end with a finite colour; a NaN propagates into the material
    // and renders as black for the rest of the session.
    const bad = panels.filter(p => !Number.isFinite(p.material.emissiveColor.r));
    assert.equal(bad.length, 0, 'a pattern wrote a non-finite colour');
});

test('strobe bursts light immediately and blinder off-state preserves cached black', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const material = { emissiveColor: new BABYLON.Color3() };
    const flashLight = {
        enabled: false,
        intensity: 0,
        setEnabled(value) { this.enabled = value; }
    };
    const club = {
        strobesActive: true,
        photosensitiveSafeMode: false,
        strobeSpeed: 1,
        vjDropActive: false,
        vjBuildIntensity: 0,
        masterIntensity: 1,
        cachedColors: {
            black: new BABYLON.Color3(0, 0, 0),
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7)
        },
        strobes: [{ material, light: null, flashDuration: 0, currentIntensity: 0 }],
        strobeFlashLight: flashLight,
        blinderMaterial: { emissiveColor: new BABYLON.Color3() },
        blindersActive: false,
        updateBlinders: window.VRClubAnimationFinish.prototype.updateBlinders
    };

    window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
        time: 10,
        dt: 1 / 60,
        audio: { bass: 0, hasAudio: false }
    });

    assert.ok(material.emissiveColor.r > 0, 'new strobe burst started on a dark frame');
    assert.equal(flashLight.enabled, true, 'shared strobe flash light did not fire');
    assert.deepEqual(
        [club.cachedColors.black.r, club.cachedColors.black.g, club.cachedColors.black.b],
        [0, 0, 0],
        'blinder off-state mutated the shared cached black color'
    );
});

test('strobe chase advances clockwise with only one corner lit per burst', () => {
    const BABYLON = makeBabylonStub();
    const { window } = loadClassic('js/club/09-animation-finish.js', {
        BABYLON,
        VRClubAnimationFixtures: class {}
    });
    const strobes = Array.from({ length: 4 }, () => ({
        material: { emissiveColor: new BABYLON.Color3() },
        light: null,
        flashDuration: 0,
        currentIntensity: 0
    }));
    const club = {
        strobesActive: true,
        photosensitiveSafeMode: false,
        strobePattern: 'chase',
        strobeSpeed: 1,
        vjDropActive: false,
        vjBuildIntensity: 0,
        masterIntensity: 1,
        cachedColors: {
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7)
        },
        strobes,
        strobeFlashLight: { intensity: 0, setEnabled() {} },
        blinderMaterial: { emissiveColor: new BABYLON.Color3() },
        blindersActive: false,
        updateBlinders: window.VRClubAnimationFinish.prototype.updateBlinders
    };
    const order = [];

    for (let burst = 0; burst < 4; burst++) {
        strobes.forEach(strobe => { strobe.flashDuration = 0; });
        club._nextStrobeBurstTime = undefined;
        window.VRClubAnimationFinish.prototype.updateStrobes.call(club, {
            time: burst + 1,
            dt: 1 / 60,
            audio: { bass: 0, hasAudio: false }
        });
        const lit = strobes.flatMap((strobe, index) => strobe.material.emissiveColor.r > 0 ? [index] : []);
        assert.equal(lit.length, 1, `burst ${burst} lit ${lit.length} corners`);
        order.push(lit[0]);
    }

    assert.deepEqual(order, [0, 1, 3, 2]);
});

// ---------------------------------------------------------------------------
// Cross-file invariants that no other check can enforce
// ---------------------------------------------------------------------------

test('animation code never hard-codes a 60 fps frame step', () => {
    // Frame-rate independence is the project's stated non-negotiable rule, and it had
    // nine violations. `dtScale` / `dt` must carry every per-frame increment.
    const files = readdirSync(join(ROOT, 'js/club'))
        .filter(f => f.includes('animation'))
        .map(f => join('js/club', f));

    const offenders = [];
    for (const file of files) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        source.split('\n').forEach((line, i) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('*') || trimmed.startsWith('//')) return;
            // A literal 0.016 anywhere in the animation tree is the old "assume 60 fps"
            // constant. dt is derived from the measured frame time instead.
            if (/\b0\.0166?7?\b/.test(line)) offenders.push(`${file}:${i + 1}  ${trimmed}`);
            // `frameCounter % N` used as a TIMER (rather than as a work-stagger) makes
            // the interval refresh-rate dependent.
            if (/frameCounter\s*%\s*\d+\s*===?\s*0\s*\)/.test(line) && /\/\/.*second/i.test(line)) {
                offenders.push(`${file}:${i + 1}  ${trimmed}`);
            }
        });
    }
    assert.deepEqual(offenders, [],
        `use ctx.dt / ctx.dtScale instead of a fixed frame step:\n${offenders.join('\n')}`);
});

test('the device light budget is defined consistently everywhere', () => {
    // Exceeding it produces GL_INVALID_OPERATION / "uniform buffer too small" and a
    // black mesh on a headset. Two independent implementations had drifted from the
    // documented values before.
    const core = readFileSync(join(ROOT, 'js/club/01-core.js'), 'utf8');
    const loader = readFileSync(join(ROOT, 'js/modelLoader.js'), 'utf8');

    const coreBlock = core.slice(core.indexOf('detectMaxLights() {'));
    const questCore = /isQuest\)[\s\S]{0,200}?return (\d)/.exec(coreBlock)?.[1];
    const questLoader = /quest[\s\S]{0,120}?return (\d)/i.exec(loader.slice(loader.indexOf('detectDefaultMaxLights')))?.[1];

    assert.ok(questCore, 'could not read the Quest light budget from 01-core.js');
    assert.equal(questLoader, questCore, 'ModelLoader and VRClub disagree on the Quest light budget');
});

test('shared VJ actions exist on VRClub so the DOM and 3D surfaces cannot diverge', () => {
    // The two control surfaces used to implement the same actions twice, and had
    // already drifted (only the 3D path updated the mirror-ball reflection spots and
    // applied fixture exclusivity).
    const ui = readFileSync(join(ROOT, 'js/club/10-ui.js'), 'utf8');
    const domUi = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');

    for (const method of ['cycleSpotColor()', 'cycleMirrorBallColor()', 'applyFixtureExclusivity(', 'resetVJControls()']) {
        assert.ok(ui.includes(method), `VRClubUI is missing shared action ${method}`);
    }
    for (const call of ['cycleSpotColor()', 'cycleMirrorBallColor()', 'applyFixtureExclusivity(']) {
        assert.ok(domUi.includes(call), `ui-init.js must delegate to VRClub.${call}, not reimplement it`);
    }
});

test('VJ panel toggles are allow-listed rather than written by DOM attribute name', () => {
    // `vrClubInstance[el.dataset.control] = !...` is an unrestricted dynamic property
    // write keyed by markup - `__proto__` would reach Object.prototype.
    const source = readFileSync(join(ROOT, 'js/ui-init.js'), 'utf8');
    assert.match(source, /TOGGLE_CONTROLS\.has\(control\)/);

    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const listed = new Set(
        (source.match(/const TOGGLE_CONTROLS = Object\.freeze\(new Set\(\[([\s\S]*?)\]\)\)/)?.[1] ?? '')
            .split(',').map(s => s.trim().replace(/['\s]/g, '')).filter(Boolean)
    );
    // Every boolean toggle in the DOM must appear in the allow-list, or it silently
    // stops working.
    const booleanControls = [...html.matchAll(/aria-pressed="[^"]*"\s+data-control="([^"]+)"/g)].map(m => m[1]);
    const missing = booleanControls.filter(c => !listed.has(c) && c !== 'toggleShow' && c !== 'goboActive');
    assert.deepEqual(missing, [], `data-control toggles missing from TOGGLE_CONTROLS: ${missing.join(', ')}`);
});

test('PWA manifest declares an installable configuration', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, 'VR Club - Virtual Nightclub');
    assert.equal(manifest.display, 'fullscreen');
    // `id` pins app identity so a future start_url change does not create a second
    // installed app; `scope` bounds the SW-controlled navigation surface.
    assert.ok(manifest.id, 'manifest.json must declare an `id`');
    assert.ok(manifest.scope, 'manifest.json must declare a `scope`');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest.json declares no icons');
});
