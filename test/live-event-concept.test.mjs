import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/liveEventConcept.js', import.meta.url), 'utf8');

function harness() {
    const revoked = [], draws = [], textures = [];
    const document = { documentElement: { dataset: {} } };
    let decode = () => Promise.resolve();
    const context = vm.createContext({
        document, window: { location: { search: '' } }, clearInterval, URLSearchParams,
        fetchBlobWithTimeout: async () => ({}),
        URL: { createObjectURL: () => 'blob:ade-logo', revokeObjectURL: url => revoked.push(url) },
        Image: class {
            naturalWidth = 512;
            naturalHeight = 343;
            decode() { return decode(); }
        },
        BABYLON: {
            DynamicTexture: class {
                constructor() { textures.push(this); }
                getContext() { return { fillRect() {}, drawImage: (...args) => draws.push(args) }; }
                update() {}
                dispose() { this.disposed = true; }
            }
        }
    });
    vm.runInContext(source, context);
    const Concept = context.window.LiveEventConcept;
    const club = { multiplayer: { connected: false } };
    const concept = new Concept(club);
    concept.status = {};
    return { Concept, concept, club, document, revoked, draws, textures, setDecode: fn => { decode = fn; } };
}

test('ADE dressing requires the exact opt-in or the dedicated site build marker', () => {
    const { Concept, document } = harness();
    for (const search of ['', '?liveEvent=live', '?liveEvent=1', '?demo=1']) {
        assert.equal(Concept.requested(search), false);
    }
    assert.equal(Concept.requested('?liveEvent=demo'), true);
    document.documentElement.dataset.liveEvent = 'ade';
    assert.equal(Concept.requested(''), true);
    assert.doesNotMatch(source, /VideoTexture|createElement\('video'\)|keyvisual-black|setMode/);
});

test('information panel closes without removing dressing and keeps its toggle in sync', () => {
    const { concept } = harness();
    const attributes = {};
    concept.panel = {};
    concept.toggle = { setAttribute: (key, value) => { attributes[key] = value; } };
    concept.setPanelOpen(false);
    assert.equal(concept.panel.hidden, true);
    assert.equal(attributes['aria-expanded'], 'false');
    assert.equal(concept._disposed, false);
    concept.setPanelOpen(true);
    assert.equal(concept.panel.hidden, false);
    assert.equal(attributes['aria-expanded'], 'true');
});

test('fascia and flag artwork preserve the official mark proportions', () => {
    const { concept, draws } = harness();
    const image = { naturalWidth: 512, naturalHeight: 343 };
    for (const [width, height, repeat] of [[1536, 307, 3], [512, 640, 1]]) {
        draws.length = 0;
        concept._artwork('testArtwork', width, height, image, repeat);
        assert.equal(draws.length, repeat);
        for (const [, x, y, w, h] of draws) {
            assert.ok(Math.abs(w / h - image.naturalWidth / image.naturalHeight) < 1e-10);
            assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
        }
    }
});

test('the supplied logo remains bounded and its decoding URL is always released', async () => {
    const { default: sharp } = await import('sharp');
    const bytes = readFileSync(new URL('../concept-assets/ade/ade26-30y-black.png', import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 512);
    assert.equal(metadata.hasAlpha, true);
    assert.ok(bytes.length < 32 * 1024);
    const { concept, revoked, setDecode } = harness();
    await concept._loadBrandArtwork();
    assert.ok(concept._brandLogo);
    assert.deepEqual(revoked, ['blob:ade-logo']);
    setDecode(() => Promise.reject(new Error('invalid image')));
    await assert.rejects(concept._loadBrandArtwork(), /artwork is unavailable/);
    assert.equal(revoked.length, 2);
});

test('ADE dressing remains visible while offline, joining and connected to a room', () => {
    const { concept, club } = harness();
    concept.root = { enabled: true, setEnabled(on) { this.enabled = on; } };
    concept.panel = { hidden: false };
    concept.toggle = {};
    for (const [connecting, connected] of [[false, false], [true, false], [false, true], [false, false]]) {
        club.multiplayer.connecting = connecting;
        club.multiplayer.connected = connected;
        concept._syncAvailability();
        assert.equal(concept.root.enabled, true);
        assert.equal(concept.panel.hidden, false);
        assert.equal(concept.toggle.hidden, false);
    }
});

test('entering VR hides the DOM panel but keeps online ADE dressing visible', () => {
    const { concept, club } = harness();
    concept.root = { enabled: true, setEnabled(on) { this.enabled = on; } };
    concept.panel = { hidden: false };
    concept.toggle = { setAttribute() {} };
    club.multiplayer.connected = true;
    club.isInVRMode = true;
    concept._syncAvailability();
    assert.equal(concept.root.enabled, true);
    assert.equal(concept.panel.hidden, true);
    assert.equal(concept.toggle.hidden, true);
});

test('disposal releases owned resources and listeners exactly once', () => {
    const { concept, textures } = harness();
    const releases = [];
    concept._artwork('testArtwork', 512, 640, { naturalWidth: 512, naturalHeight: 343 });
    concept._listeners.push([{ removeEventListener: () => releases.push('listener') }, 'click', () => {}]);
    concept._meshes.push({ dispose: () => releases.push('mesh') });
    concept._materials.push({ dispose: () => releases.push('material') });
    concept.root = { dispose: () => releases.push('root') };
    concept.dispose();
    concept.dispose();
    assert.deepEqual(releases, ['listener', 'mesh', 'material', 'root']);
    assert.equal(textures[0].disposed, true);
});
