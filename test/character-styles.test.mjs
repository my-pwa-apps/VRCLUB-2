import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { NodeIO } from '@gltf-transform/core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function fixture(saved = {}) {
    const storage = new Map(Object.entries(saved)), warnings = [], messages = [], changed = [];
    const window = { dispatchEvent() {}, ClubMultiplayer: { AVATAR_LABELS: { f5: 'Original woman' } } };
    const context = vm.createContext({
        window, CustomEvent: class {}, log: { warn: (...args) => warnings.push(args) },
        performance,
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }
    });
    for (const file of ['js/characterCatalog.js', 'js/characterStyles.js']) vm.runInContext(readFileSync(join(root, file), 'utf8'), context);
    const club = Object.assign({}, window.CharacterStyles, {
        initPromise: Promise.resolve(), isFollowingHost: () => false,
        showErrorMessage: message => messages.push(message),
        _replaceCharacterStyle: async style => { changed.push(style); club._characterStyles.applied = style; }
    });
    return { club, window, context, storage, warnings, messages, changed };
}

test('Quaternius is the default; only explicit saved values enable the detailed cast', () => {
    assert.equal(fixture().club.getCharacterStyle(), 'quaternius');
    assert.equal(fixture({ 'vrclub.characterStyle': 'diverse' }).club.getCharacterStyle(), 'diverse');
    assert.equal(fixture({ 'vrclub.characterStyle': '__proto__' }).club.getCharacterStyle(), 'quaternius');
    assert.equal(fixture({ 'vrclub.characterStyle': 'diverse', 'vrclub.lightweightCharacters': '1' }).club.getCharacterStyle(), 'quaternius');
});

test('The host choice and personal performance override stay independent across room changes', async () => {
    const { club, storage, changed } = fixture();
    club.isFollowingHost = () => true;
    assert.equal(await club.setCharacterStyle('diverse'), false);
    assert.equal(changed.length, 0);
    assert.equal(club.setRoomCharacterStyle('diverse'), true);
    await club._characterStyles.queue;
    assert.equal(club.getCharacterStyle(), 'diverse');
    assert.equal(storage.has('vrclub.characterStyle'), false, 'a host must not overwrite the guest preference');
    await club.setLightweightCharacters(true);
    assert.equal(club.getCharacterStyle(), 'quaternius');
    assert.equal(club.getRoomCharacterStyle(), 'diverse');
    club.setRoomCharacterStyle(null);
    await club._characterStyles.queue;
    assert.equal(club.getCharacterStyle(), 'quaternius');
    assert.throws(() => club.setCharacterStyle('constructor'), /Unknown/);
    assert.equal(club.setRoomCharacterStyle('constructor'), false);
});

test('A host using the performance override still announces the detailed room style', async () => {
    const { club } = fixture();
    club.multiplayer = { connected: true, _show: { dirty: false } };
    await club.setLightweightCharacters(true);
    await club.setCharacterStyle('diverse');
    assert.equal(club.getRoomCharacterStyle(), 'diverse');
    assert.equal(club.getCharacterStyle(), 'quaternius');
    assert.equal(club.multiplayer._show.dirty, true);
});

test('A failed replacement is explicit, preserves the active cast and can be retried', async () => {
    const { club, messages, warnings } = fixture();
    club.getCharacterStyle();
    club._replaceCharacterStyle = async () => { throw new Error('Missing Malik'); };
    assert.equal(await club.setCharacterStyle('diverse'), false);
    assert.equal(club.getCharacterStyle(), 'quaternius');
    assert.match(club.characterStyleStatus().error, /Missing Malik/);
    assert.match(messages[0], /could not be changed/);
    assert.equal(warnings.length, 1);
    club._replaceCharacterStyle = async style => { club._characterStyles.applied = style; };
    assert.equal(await club.retryCharacterStyle(), true);
    assert.equal(club.getCharacterStyle(), 'diverse');
    assert.equal(club.characterStyleStatus().error, null);
});

test('Returning to the active lightweight cast clears a failed detailed-style request', async () => {
    const { club } = fixture();
    club.getCharacterStyle();
    club._replaceCharacterStyle = async () => { throw new Error('Offline'); };
    assert.equal(await club.setCharacterStyle('diverse'), false);
    assert.equal(await club.setLightweightCharacters(true), true);
    assert.equal(club.getCharacterStyle(), 'quaternius');
    assert.equal(club.getRoomCharacterStyle(), 'diverse');
    assert.equal(club.characterStyleStatus().error, null);
});

test('Shared appearance is sent in automatic, manual and legacy-off frames without becoming a manual fixture', async () => {
    const { club, context, window } = fixture();
    vm.runInContext(readFileSync(join(root, 'js', 'multiplayer.js'), 'utf8'), context);
    const controller = Object.create(window.ClubMultiplayer.prototype);
    controller.club = club;
    club.vjDirector = { colourSnapshot: () => ({ hue: 0.2 }) };
    club.showDirector = { isDriving: () => true, snapshot: () => ({ mv: 'pulse', cue: 0, cb: 1, bib: 0, bar: 4 }) };
    await club.setLightweightCharacters(true);
    await club.setCharacterStyle('diverse');
    for (const mode of ['show', 'manual', 'off']) {
        club.showDirector.isDriving = () => mode === 'show';
        club.vjManualMode = mode === 'manual';
        const frame = controller._buildShowFrame();
        assert.equal(frame.m, mode);
        assert.equal(frame.fx.characterStyle, 'diverse');
        assert.equal(club.getCharacterStyle(), 'quaternius');
    }
    controller._applyFixtures({ characterStyle: 'diverse' });
    assert.equal(Object.hasOwn(club, 'characterStyle'), false, 'appearance metadata must never become an arbitrary property assignment');
});

test('Host promotion keeps room appearance; disconnection or losing the host restores the saved local style', async () => {
    const { club, context, window } = fixture();
    vm.runInContext(readFileSync(join(root, 'js', 'multiplayer.js'), 'utf8'), context);
    const controller = Object.create(window.ClubMultiplayer.prototype);
    let following = true, host = false;
    Object.defineProperty(controller, 'following', { get: () => following });
    Object.assign(controller, {
        club, client: { connected: true, hostId: 'host', musicListening: true },
        _musicHostId: 'host', _show: {}, isHost: () => host,
        _stopRemoteMusic() {}, _stopMusicBroadcast() {}
    });
    club.showDirector = { setFollower() {} };
    club.vjDirector = {};
    controller._syncRole();
    club.setRoomCharacterStyle('diverse');
    await club._characterStyles.queue;
    assert.equal(club.getCharacterStyle(), 'diverse');
    following = false; host = true;
    controller._syncRole();
    assert.equal(club.getRoomCharacterStyle(), 'diverse');
    controller.client.connected = false; host = false;
    controller._syncRole();
    await club._characterStyles.queue;
    assert.equal(club.getCharacterStyle(), 'quaternius');
    controller.client.connected = true; following = true;
    controller._syncRole();
    club.setRoomCharacterStyle('diverse');
    await club._characterStyles.queue;
    following = false;
    controller._syncRole();
    await club._characterStyles.queue;
    assert.equal(club.getCharacterStyle(), 'quaternius');
});

test('An old-style source completing late cannot populate the new crowd source array', async () => {
    const { club, context, window } = fixture();
    context.VRClubUI = class {};
    context.BABYLON = { Color3: class {} };
    vm.runInContext(readFileSync(join(root, 'js', 'club', '11-audio-crowd.js'), 'utf8'), context);
    let finish;
    club._loadAvatarSource = () => new Promise(resolve => { finish = resolve; });
    club._loadCrowdSource = window.VRClubAudioCrowd.prototype._loadCrowdSource;
    const oldArray = club._crowdSourceContainers = [];
    const pending = club._loadCrowdSource(window.VRClubAudioCrowd.sourceIndex('f1'));
    club._characterStyles.applied = 'diverse';
    club._crowdSourceContainers = [];
    const container = {};
    finish(container);
    await pending;
    assert.equal(oldArray[3], container);
    assert.equal(club._crowdSourceContainers[3], undefined);
});

test('The fictional DJ recipes retain reference-inspired hair and plain dark clothing, without replacing any player identity', () => {
    const { window } = fixture(), catalog = window.CharacterCatalog;
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const male = recipes.find(recipe => recipe.id === catalog.npcs['dj-male']);
    const female = recipes.find(recipe => recipe.id === catalog.npcs['dj-female']);
    assert.equal(male.id, 'jin'); assert.equal(female.id, 'zara');
    assert.equal(male.hair, 'short03'); assert.equal(female.hair, 'long01');
    assert.ok(male.hairTint.every(value => value < 0.1));
    assert.ok(female.hairTint[0] > female.hairTint[1] && female.hairTint[1] > female.hairTint[2]);
    for (const recipe of [male, female]) {
        assert.equal(recipe.clothes, 'male_casualsuit06', 'a plain crew-neck tee, not copied printed artwork');
        assert.ok(recipe.clothingTint.every(value => value < 0.1));
        assert.equal(recipe.license, 'CC0-1.0');
        assert.ok(!Object.values(catalog.players).includes(recipe.id), 'DJ restyling never changes a chosen player look');
    }
});

test('All 34 distinct CC0 adults have bounded geometry, measured eyes and complete role/player clips', async () => {
    const { window } = fixture(), catalog = window.CharacterCatalog;
    const recipes = JSON.parse(readFileSync(join(root, 'design', 'characters', 'recipes.json')));
    const io = new NodeIO();
    assert.equal(Object.keys(catalog.people).length, 34);
    assert.equal(new Set(Object.values(catalog.npcs)).size, 34);
    assert.equal(Object.keys(catalog.players).length, 17);
    assert.equal(catalog.players.f5, 'leila', 'the women pool must not inherit the unrelated Felix NPC slot');
    assert.equal(catalog.players.m5, 'felix');
    const playerIds = new Set(Object.values(catalog.players));
    for (const [id, person] of Object.entries(catalog.people)) {
        const recipe = recipes.find(p => p.id === id);
        assert.equal(recipe.license, 'CC0-1.0');
        assert.ok(recipe.age >= 0.5);
        assert.ok(person.eye[1] > person.height * 0.85 && person.eye[1] < person.height);
        const bytes = readFileSync(join(root, person.url));
        assert.ok(bytes.length < 3_000_000, `${id}: download budget`);
        const doc = await io.readBinary(bytes);
        const joints = doc.getRoot().listSkins()[0].listJoints();
        assert.equal(joints.length, 53, `${id}: weighted skeleton budget`);
        const primitives = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
        assert.ok(primitives.length <= (id === 'jin' || id === 'zara' ? 4 : 2), `${id}: draw budget`);
        const triangles = primitives.reduce((n, p) => n + p.getIndices().getCount() / 3, 0);
        assert.ok(triangles < (id === 'jin' || id === 'zara' ? 13_000 : 10_000), `${id}: triangle budget`);
        for (const texture of doc.getRoot().listTextures()) assert.equal(texture.getMimeType(), 'image/webp');
        const names = new Set(doc.getRoot().listAnimations().map(a => a.getName()));
        if (playerIds.has(id)) {
            for (const clip of ['Idle', 'Walk', 'Run', 'Wave', 'Yes', 'Dance_Loop', 'Seated_Loop', 'Seated_Low_Loop', 'Idle_Talking_Loop']) {
                assert.ok(names.has(clip), `${id}: missing player ${clip}`);
            }
            for (const suffix of ['L', 'R']) for (const bone of ['UpperArm', 'LowerArm', 'Wrist', 'Index1', 'Pinky1']) {
                assert.ok(doc.getRoot().listNodes().some(node => node.getName() === `${bone}.${suffix}`), `${id}: missing tracked-arm ${bone}.${suffix}`);
            }
        }
        const required = {
            malik: ['Walk', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop'],
            mei: ['Idle_Railing_Loop'], amara: ['Seated_Bar_Idle_Loop', 'Seated_Bar_Drink_Loop'],
            vera: ['Idle_TalkingPhone_Loop']
        }[id] || [];
        for (const clip of required) assert.ok(names.has(clip), `${id}: missing role ${clip}`);
    }
});
