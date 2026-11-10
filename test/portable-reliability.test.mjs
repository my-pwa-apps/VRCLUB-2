import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';

function classic(file, additions = {}) {
    const box = { console: { warn() {}, log() {} }, URL, Blob, AbortController, performance, ...additions };
    box.window = box;
    vm.createContext(box);
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), box);
    return box;
}
function storage(entries = {}) {
    const map = new Map(Object.entries(entries));
    return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map };
}

test('normal and immersive VR recovery pages fit twelve slots and retry/confirmed reset preserve unreadable data', () => {
    const { MusicLibrary } = classic('js/musicLibrary.js');
    const { VRClubUI } = classic('js/club/10-ui.js', { VRClubAnimationFinish: class {} });
    for (const immersive of [false, true]) {
        const store = storage({ [MusicLibrary.KEY]: '{broken' }), messages = [];
        const club = Object.assign(Object.create(VRClubUI.prototype), {
            _immersive: immersive ? { mode: 'preview', needsAccess: () => false } : null,
            _vrQuickMenuPage: immersive ? 'musicPhone' : 'musicSources',
            showErrorMessage: text => messages.push(text),
            _showVRQuickMenuPage() {}, isFollowingHost: () => true
        });
        let library = club.musicLibrary = new MusicLibrary(club, store);
        for (const page of ['musicSources', 'musicPhone']) {
            const buttons = club._vrQuickMenuPageDefinitions(page);
            assert.ok(buttons.length <= 12);
            for (const action of ['retrySavedSets', 'resetSavedSets']) {
                const button = buttons.find(item => item?.action === action);
                assert.ok(button, `${page} lacks ${action}`);
                assert.equal(club._isHostOwnedVRButton(button), false);
            }
        }
        const press = action => club._activateVRQuickMenuButton({ action });
        press('retrySavedSets');
        assert.equal(store.getItem(MusicLibrary.KEY), '{broken');
        assert.equal(library.readError, 'unreadable');
        press('resetSavedSets');
        assert.equal(store.getItem(MusicLibrary.KEY), '{broken', 'first reset press must not write');
        club._vrArmed.until = Date.now() - 1;
        press('resetSavedSets');
        assert.equal(store.getItem(MusicLibrary.KEY), '{broken', 'expired confirmation must not write');
        const replacement = JSON.stringify({ items: [{ url: 'https://example.com/new.mp3', name: 'Other tab' }], selected: 0 });
        store.setItem(MusicLibrary.KEY, replacement);
        press('resetSavedSets');
        assert.equal(store.getItem(MusicLibrary.KEY), replacement, 'a stale tab must not erase a repaired library');
        assert.match(messages.at(-1), /another tab/);
        press('retrySavedSets');
        assert.equal(library.current().name, 'Other tab');
        assert.ok(!club._vrQuickMenuPageDefinitions('musicSources').some(item => item?.action === 'resetSavedSets'));
        store.setItem(MusicLibrary.KEY, '{broken again');
        library = club.musicLibrary = new MusicLibrary(club, store);
        press('resetSavedSets');
        press('retrySavedSets');
        press('resetSavedSets');
        assert.equal(store.getItem(MusicLibrary.KEY), '{broken again', 'retry cancels the previous confirmation');
        press('resetSavedSets');
        assert.equal(library.readError, null);
        assert.deepEqual(JSON.parse(store.getItem(MusicLibrary.KEY)).items, []);
        assert.ok(JSON.parse(store.getItem(MusicLibrary.KEY)).playbackGeneration);
    }
});

test('complete legacy brightness presets migrate only missing trims to neutral without changing existing settings', () => {
    const { ClubMultiplayer } = classic('js/multiplayer.js');
    const { LightingPresets } = classic('js/lightingPresets.js', { ClubMultiplayer });
    const fx = {};
    for (const [key, spec] of Object.entries(ClubMultiplayer.MANUAL_FIXTURES)) {
        fx[key] = spec === 'b' ? false : typeof spec[0] === 'string' ? spec[0] : spec[0];
    }
    fx.spotSequenceRate = 2;
    fx.laserSheetBrightness = 2.5;
    fx.spotHead2Color = 2;
    const original = JSON.stringify(fx);
    for (const key of ['spotBrightness', 'laserBrightness', 'ledWallBrightness']) delete fx[key];
    const slots = Array(12).fill(null);
    slots[0] = { name: 'Legacy', fx, colour: { hue: 0.4, hl: false, pal: 'triad', lh: 'match', mbi: 0 } };
    const legacy = JSON.stringify({ version: 1, slots });
    const migrated = LightingPresets.parse(legacy).slots[0].fx;
    for (const key of ['spotBrightness', 'laserBrightness', 'ledWallBrightness']) assert.equal(migrated[key], 1);
    for (const [key, value] of Object.entries(JSON.parse(original))) {
        if (!['spotBrightness', 'laserBrightness', 'ledWallBrightness'].includes(key)) assert.equal(migrated[key], value);
    }
    const store = storage({ [LightingPresets.KEY]: legacy });
    const presets = new LightingPresets({ showErrorMessage() {} }, store);
    assert.equal(presets.slots[0].fx.spotBrightness, 1);
    assert.equal(store.getItem(LightingPresets.KEY), legacy, 'migration must not write without a save');
    delete slots[0].fx.laserSheetBrightness;
    assert.throws(() => LightingPresets.parse(JSON.stringify({ version: 1, slots })), /Incomplete/);
});

test('corrupt saved links block house playback and writes; retry/reset cannot overwrite another tab', async () => {
    const { MusicLibrary } = classic('js/musicLibrary.js'), messages = [];
    const store = storage({ [MusicLibrary.KEY]: '{broken' });
    const club = { showErrorMessage: message => messages.push(message), isFollowingHost: () => false };
    const library = new MusicLibrary(club, store);
    assert.equal(library.readError, 'unreadable');
    assert.equal(await library.playDefault(), false);
    assert.equal(store.getItem(MusicLibrary.KEY), '{broken');
    assert.throws(() => library.replaceAll([]), /retry or reset/);
    store.setItem(MusicLibrary.KEY, JSON.stringify({ items: [], selected: 0 }));
    assert.throws(() => library.resetUnreadableSets(), /another tab/);
    assert.equal(library.retrySavedSets(), true);
    const corrupt = new MusicLibrary(club, storage({ [MusicLibrary.KEY]: 'bad' }));
    corrupt.resetUnreadableSets();
    assert.equal(corrupt.readError, null);
    assert.ok(JSON.parse(corrupt.storage.getItem(MusicLibrary.KEY)).playbackGeneration);
    assert.ok(messages.length);
});

test('corrupt playback data does not discard valid saved music', () => {
    const { MusicLibrary } = classic('js/musicLibrary.js');
    const saved = JSON.stringify({ items: [{ url: 'https://example.com/set.mp3', name: 'My set' }], selected: 0 });
    const store = storage({ [MusicLibrary.KEY]: saved, [MusicLibrary.PLAYBACK_KEY]: '{broken' });
    const library = new MusicLibrary({ showErrorMessage() {} }, store);
    assert.equal(library.readError, null);
    assert.equal(library.current().name, 'My set');
    assert.equal(library.playback, null);
    assert.equal(store.getItem(MusicLibrary.KEY), saved);
});

test('cached container parsing revokes blob URLs on success, failure and cancellation', async () => {
    const revoked = [], container = { dispose() { this.disposed = true; } };
    let rejectParse = false;
    const { ModelLoader } = classic('js/modelLoader.js', {
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) },
        BABYLON: { SceneLoader: { LoadAssetContainerAsync: async () => {
            if (rejectParse) throw new Error('parse failed');
            return container;
        } } }
    });
    const loader = {
        scene: { isDisposed: false }, abortController: new AbortController(),
        loadOrDownloadModel: async () => new Uint8Array([1, 2, 3])
    };
    assert.equal(await ModelLoader.prototype.loadAssetContainer.call(loader, './avatar.glb'), container);
    rejectParse = true;
    await assert.rejects(ModelLoader.prototype.loadAssetContainer.call(loader, './avatar.glb'), /parse failed/);
    assert.deepEqual(revoked, ['blob:test', 'blob:test']);
    loader.abortController.abort();
    await assert.rejects(ModelLoader.prototype.loadAssetContainer.call(loader, './avatar.glb'), /cancelled/);
    assert.equal(revoked.length, 2);
});
