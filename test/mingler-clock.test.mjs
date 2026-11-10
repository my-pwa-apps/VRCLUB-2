import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const BABYLON = createRequire(import.meta.url)('../js/vendor/babylon.js');

function load() {
    const window = {};
    const context = vm.createContext({ window, BABYLON, VRClubUI: class {}, console });
    for (const file of ['venueDressing', 'mezzanine', 'minglerClock', 'club/11-audio-crowd']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
    }
    const club = new window.VRClubAudioCrowd(), route = club._minglerRoute(), slots = club._guestSlots();
    const create = seed => new window.MinglerClock(route, seed,
        (x, z, level) => club._minglerSurfaceLevel(x, z, level),
        node => node.bartender ? window.VenueLayout.bar.bartender : slots[node.guest]);
    return { window, club, route, create };
}

test('a room-time mingler is identical for late joiners, render hitches and all frame rates', () => {
    const { create } = load();
    const reference = create(1234), other = create(1234);
    for (const fps of [12, 30, 60, 90, 120]) {
        for (let seconds = 0; seconds < 1600; seconds += 1 / fps * 41) {
            other.sample(seconds / 2);
            const actual = other.sample(seconds), expected = reference.sample(seconds);
            assert.deepEqual(actual, expected);
            assert.strictEqual(other.sample(seconds), actual, 'one reusable result; no per-frame allocation');
            assert.ok(Number.isFinite(actual.x) && Number.isFinite(actual.z) && Number.isFinite(actual.yaw));
        }
    }
    assert.deepEqual(other.sample(123456), reference.sample(123456));
    assert.notEqual(create(5678).period, reference.period, 'different rooms have independent deterministic dwell times');
});

test('the shared round keeps two physical bar sips, rail before talk and canonical dwell even without partners', () => {
    const { create } = load(), clock = create(55);
    const stages = clock.segments.filter(segment => segment.node === 9 && segment.phase === 'dwell');
    assert.equal(stages.length, 24, 'the bar is visited in both directions');
    assert.deepEqual(Array.from(stages.slice(0, 12), stage => stage.activity),
        ['order', 'serve', 'served', 'pickup', 'drink', 'return', 'returned', 'pickup', 'drink', 'return', 'returned', 'clear']);
    const balcony = clock.segments.filter(segment => segment.node === 24 && segment.phase === 'dwell');
    assert.deepEqual(Array.from(balcony, stage => stage.activity), ['balcony', 'talk']);
    const walking = clock.segments.filter(segment => segment.phase === 'walk').reduce((sum, s) => sum + s.duration, 0);
    assert.ok(walking / clock.period < 0.4);
    for (const segment of clock.segments) {
        const sample = clock.sample(5 + segment.start + segment.duration / 2);
        assert.equal(sample.activity, segment.activity);
        assert.ok(Math.abs(sample.timer - segment.duration / 2) < 1e-9);
    }
});

test('late joins on either stair and the balcony resolve the authoritative surface, not the floor below', () => {
    const { club, create, window } = load(), clock = create(7);
    let balcony = false, street = false, stair = false;
    for (const segment of clock.segments) {
        for (const fraction of [0.1, 0.5, 0.9]) {
            const sample = clock.sample(5 + segment.start + segment.duration * fraction);
            const level = club._minglerSurfaceLevel(sample.x, sample.z, sample.level);
            assert.ok(Number.isFinite(level) && level >= 0 && level <= 3);
            if (sample.node === 24) { assert.equal(level, 3); balcony = true; }
            if (sample.activity === 'smoke') { assert.equal(level, window.VenueLayout.vestibule.streetLevel); street = true; }
            if (sample.node === 22 && sample.phase === 'walk') {
                assert.ok(sample.dir > 0 ? level > 0 && level < 1.5 : level > 1.5 && level < 3);
                stair = true;
            }
        }
    }
    assert.ok(balcony && street && stair);
});
