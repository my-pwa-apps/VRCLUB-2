import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function harness() {
    const data = new Map(), notices = [];
    const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    class Color3 {
        constructor(r, g, b) { Object.assign(this, { r, g, b }); }
    }
    const context = vm.createContext({
        window: {}, localStorage: storage, AbortController: globalThis.AbortController,
        BABYLON: { Color3 }, VRClubAnimationFinish: { STROBE_PATTERNS: ['all', 'chase'] },
        performance: { now: () => 1000 }, console
    });
    for (const file of ['multiplayer', 'lightingPresets', 'vjDesk']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
    }
    const { ClubMultiplayer, LightingPresets, VJDesk, VJDeskLayout } = context.window;
    const club = { ...VJDesk };
    for (const [key, spec] of Object.entries(ClubMultiplayer.MANUAL_FIXTURES)) {
        club[key] = spec === 'b' ? true : typeof spec[0] === 'string' ? spec[0] : spec[0];
    }
    let following = false, changes = 0;
    Object.assign(club, {
        lightHold: { mode: 'resume', delay: 60, shuffle: 15 },
        spotSequenceRate: 2, ledPattern: 7, spotlightSpeed: 0.6, laserSpeed: 0.4,
        strobePattern: 'chase', currentSpotColor: new Color3(0.42, 0.15, 0.9),
        mirrorBallSpotlightColor: new Color3(0.8, 0.4, 0.2),
        spotColorList: Array(9), mirrorBallColors: Array(8), goboPatterns: Array(8),
        _ledPatternPlaylist: Array(20), masterIntensity: 0.68, _vjDesk: { dirty: false },
        vjDirector: {
            targetMasterIntensity: 0.75,
            colourSnapshot: () => ({ hue: 0.74, hl: false, pal: 'triad', lh: 'complement', mbi: 3 }),
            applyRemoteColour(c) { this.applied = c; },
            refreshLedColor() {}
        },
        showDirector: { isDriving: () => !club.vjManualMode },
        guardHostControl: () => !following,
        isFollowingHost: () => following,
        showErrorMessage: message => notices.push(message),
        takeLightControl() { changes++; this.vjManualMode = true; this.lastVJInteraction = 1; },
        lightHoldSummary: () => 'AUTO AFTER 1 MIN',
        _setMirrorBallColor(colour) { this.mirrorBallSpotlightColor = colour; },
        configureLaserSheetVariant() { this.sheetReconfigured = true; }
    });
    const multiplayer = Object.create(ClubMultiplayer.prototype);
    multiplayer.club = club;
    multiplayer.client = null;
    club.multiplayer = multiplayer;
    const presets = new LightingPresets(club, storage);
    club.lightingPresets = presets;
    const press = id => club._runVJDeskButton(VJDeskLayout.buttons.show.find(button => button.id === id));
    return { data, storage, notices, club, presets, LightingPresets, ClubMultiplayer, press,
        changes: () => changes, follow: value => { following = value; } };
}

test('lighting presets persist complete lighting only, without taking control or changing music, safety or DJ', () => {
    const { club, presets, data, LightingPresets, changes } = harness();
    presets.save(0, 'Violet rows');
    assert.equal(changes(), 0);
    assert.equal(club.vjManualMode, undefined);
    const saved = JSON.parse(data.get(LightingPresets.KEY));
    assert.equal(saved.version, 1);
    assert.equal(saved.slots.length, 12);
    assert.equal(saved.slots[0].fx.vjMaster, 0.68, 'automatic brightness is captured, not the stale manual fader');
    assert.equal(saved.slots[0].fx.spotRed, 0.42, 'exact colours survive, not just the nearest palette index');
    assert.equal(saved.slots[0].fx.ledPattern, 7);
    assert.ok(Object.keys(saved.slots[0].fx).every(key => !/audio|dj$|safe|room|token|appearance/i.test(key)));
    assert.equal(new LightingPresets(club).slots[0].name, 'Violet rows');
});

test('recall restores independent heads, colours, timing, brightness and sheet settings using the shared room path', () => {
    const { club, presets, changes } = harness();
    club.spotHead2Motion = 5;
    club.spotHead4Enabled = false;
    club.spotSequence = 3;
    club.spotSequenceRate = 4;
    club.laserSheetOrigin = 'ceilingRight';
    club.ledMulti = true;
    club.strobeSync = 'bar';
    presets.save(2);
    club.vjManualMode = true;
    Object.assign(club, { ledPattern: 1, ledMulti: false, spotHead2Motion: 0, spotHead4Enabled: true, strobeSync: 'free' });
    club.currentSpotColor = { r: 1, g: 0, b: 0 };
    assert.equal(presets.recall(2), true);
    assert.equal(changes(), 1);
    assert.equal(club.lastVJInteraction, 1);
    assert.deepEqual(club.lightHold, { mode: 'resume', delay: 60, shuffle: 15 });
    for (const [key, value] of Object.entries({
        ledPattern: 7, ledMulti: true, spotHead2Motion: 5, spotHead4Enabled: false,
        spotSequence: 3, spotSequenceRate: 4, strobeSync: 'bar', laserSheetOrigin: 'ceilingRight'
    })) assert.equal(club[key], value, key);
    assert.equal(club.currentSpotColor.r, 0.42);
    assert.equal(club.mirrorBallSpotlightColor.b, 0.2);
    assert.equal(club.vjDirector.targetMasterIntensity, 0.68);
    assert.equal(club.sheetReconfigured, true);
    const follower = harness();
    follower.club.multiplayer._applyFixtures(club.multiplayer._captureFixtures());
    assert.equal(follower.club.spotHead2Motion, 5);
    assert.equal(follower.club.currentSpotColor.r, 0.42);
    assert.equal(follower.club.strobeSync, 'bar');
});

test('prism presets round-trip and legacy gobo presets load without reviving projected shapes', () => {
    const h = harness();
    h.club.spotPrismActive = true;
    h.presets.save(0);
    h.club.spotPrismActive = false;
    assert.equal(h.presets.recall(0), true);
    assert.equal(h.club.spotPrismActive, true);

    const old = JSON.parse(h.presets.export());
    delete old.slots[0].fx.spotPrismActive;
    delete old.slots[0].fx.fogBurstMode;
    Object.assign(old.slots[0].fx, { goboEnabled: true, goboPatternIndex: 9, goboRotationSpeed: -1 });
    h.presets.import(JSON.stringify(old));
    assert.equal(h.presets.slots[0].fx.spotPrismActive, false);
    assert.equal('goboEnabled' in h.presets.slots[0].fx, false);
    h.club.goboEnabled = false;
    h.club.setGoboEnabled = () => { throw new Error('Legacy gobo must not be enabled'); };
    assert.equal(h.presets.recall(0), true);
    assert.equal(h.club.spotPrismActive, false);
    assert.equal(h.club.goboEnabled, false);
    const invalid = JSON.parse(JSON.stringify(old));
    invalid.slots[0].fx.goboPatternIndex = 99;
    assert.throws(() => h.presets.import(JSON.stringify(invalid)));
});

test('smoke mode is saved and shared, and older presets migrate without losing their other settings', () => {
    const h = harness();
    h.club.fogBurstMode = 'continuous';
    h.club.fogIntensity = 1.5;
    h.presets.save(0);
    h.club.fogBurstMode = 'auto';
    h.club.fogIntensity = 0.5;
    h.presets.recall(0);
    assert.equal(h.club.fogBurstMode, 'continuous');
    assert.equal(h.club.fogIntensity, 1.5);
    const follower = harness();
    follower.club.multiplayer._applyFixtures(h.club.multiplayer._captureFixtures());
    assert.equal(follower.club.fogBurstMode, 'continuous');
    const old = JSON.parse(h.presets.export());
    delete old.slots[0].fx.fogBurstMode;
    h.presets.import(JSON.stringify(old));
    assert.equal(h.presets.slots[0].fx.fogBurstMode, 'auto');
    assert.equal(h.presets.slots[0].fx.fogIntensity, 1.5);
    old.slots[0].fx.fogBurstMode = 'unknown';
    assert.throws(() => h.presets.import(JSON.stringify(old)));
});

test('preset recall preserves personal Safe Mode and host authority; saving a guest view remains personal', () => {
    const { club, presets, follow, changes } = harness();
    presets.save(0);
    follow(true);
    assert.equal(presets.recall(0), false);
    assert.equal(changes(), 0);
    presets.save(1);
    follow(false);
    club.photosensitiveSafeMode = true;
    presets.recall(0);
    assert.equal(club.photosensitiveSafeMode, true);
    assert.equal(club.strobesActive, false);
    assert.equal(club.spotStrobeActive, false);
    assert.equal(presets.slots[0].fx.strobesActive, true, 'the saved look itself is not rewritten');
});

test('presets can be recalled before an inactive LED wall builds its lazy playlist, and stop an unfinished colour fade', () => {
    const h = harness();
    h.presets.save(0);
    delete h.club._ledPatternPlaylist;
    h.club.colorTransitionProgress = 0.2;
    assert.equal(h.presets.recall(0), true);
    assert.equal(h.club.colorTransitionProgress, 1);
    assert.equal(h.club.ledPattern, 7);
});

test('preset backups round-trip all twelve slots, names and exact values without applying imported lighting', () => {
    const a = harness(), b = harness();
    for (let slot = 0; slot < 12; slot++) a.presets.save(slot, `Look ${slot + 1}`);
    a.presets.rename(5, 'Quiet blue');
    b.presets.import(a.presets.export());
    assert.equal(b.presets.export(), a.presets.export());
    assert.equal(b.changes(), 0);
    b.presets.remove(5);
    assert.equal(b.presets.slots[5], null);
    assert.notEqual(a.presets.slots[5], null);
});

test('invalid or incompatible imports fail atomically and cannot write arbitrary club properties', () => {
    const h = harness();
    h.presets.save(0);
    const original = h.presets.export();
    const reject = change => {
        const backup = JSON.parse(original);
        change(backup);
        assert.throws(() => h.presets.import(JSON.stringify(backup)));
        assert.equal(h.presets.export(), original);
    };
    reject(data => { data.version = 2; });
    reject(data => { data.slots.pop(); });
    reject(data => { data.slots[0].fx.audioVolume = 0; });
    reject(data => { delete data.slots[0].fx.lasersActive; });
    reject(data => { data.slots[0].fx.strobeSync = 'unsafe'; });
    reject(data => { data.slots[0].fx.spotSequenceRate = 3; });
    reject(data => { data.slots[0].fx.spotHead0Motion = 2.5; });
    reject(data => { data.slots[0].fx.ledPattern = 63; });
    reject(data => { data.slots[0].fx.vjMaster = null; });
    reject(data => { data.slots[0].colour.hue = 3; });
    reject(data => { data.slots[0].name = '\u0000'; });
    assert.throws(() => h.presets.import(' '.repeat(65537)));
    assert.throws(() => h.presets.save(12));
});

test('storage errors leave the saved library unchanged and corrupted data is never silently overwritten', () => {
    const h = harness();
    h.presets.save(0, 'Keep me');
    const original = h.presets.export(), goodSet = h.storage.setItem;
    h.storage.setItem = () => { throw new Error('Storage is full'); };
    assert.throws(() => h.presets.save(1), /Storage is full/);
    assert.equal(h.presets.export(), original);
    assert.throws(() => h.presets.rename(0, 'Lost'), /Storage is full/);
    assert.equal(h.presets.slots[0].name, 'Keep me');
    h.storage.setItem = goodSet;
    h.data.set(h.LightingPresets.KEY, 'not json');
    const broken = new h.LightingPresets(h.club);
    assert.match(broken.error, /Could not read/);
    assert.match(h.notices.at(-1), /Could not read/);
    assert.throws(() => broken.save(0), /Could not read/);
    assert.equal(h.data.get(h.LightingPresets.KEY), 'not json');
    broken.import(original);
    assert.equal(broken.error, '');
});

test('desk selection never recalls; overwrite and delete require a second matching press', () => {
    const h = harness();
    h.press('presetSave');
    assert.ok(h.presets.slots[0]);
    h.club.spotlightSpeed = 1.8;
    h.press('presetSave');
    assert.equal(h.presets.slots[0].fx.spotlightSpeed, 0.6);
    assert.match(h.club._vjDeskButtonState({ kind: 'presetSave' }).value, /CONFIRM/);
    h.press('presetSave');
    assert.equal(h.presets.slots[0].fx.spotlightSpeed, 1.8);
    h.press('presetNext');
    assert.equal(h.presets.selected, 1);
    assert.equal(h.changes(), 0);
    h.press('presetPrevious');
    h.press('presetRecall');
    assert.equal(h.changes(), 1);
    h.press('presetDelete');
    assert.ok(h.presets.slots[0]);
    h.press('presetDelete');
    assert.equal(h.presets.slots[0], null);
});
