import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness(globals = {}) {
    const context = vm.createContext({
        window: {}, console: { warn() {} }, performance: { now: () => 10 },
        localStorage: { getItem: () => null, setItem() {} }, ...globals
    });
    vm.runInContext(readFileSync(new URL('../js/guestExperience.js', import.meta.url), 'utf8'), context);
    return context.window.GuestExperience;
}

test('nearby conversation clarity respects visibility, muting and personal distance', () => {
    const experience = harness();
    const peer = { hasState: true, root: { position: { x: 1.1, z: 0 } }, eyeY: 1.7, speaking: true };
    const club = { _playerCamera: () => ({ position: { x: 0, y: 1.7, z: 0 } }),
        multiplayer: { micEnabled: false }, avatarManager: { remotes: new Map([['peer', peer]]) } };
    assert.ok(experience.nearbyVoiceActivity.call(club) > 0.99);
    peer.root.position.x = 1.8;
    assert.equal(experience.nearbyVoiceActivity.call(club), 0);
    peer.root.position.x = 1.1;
    for (const flag of ['hidden', 'culled', 'muted', 'simulated']) {
        peer[flag] = true;
        assert.equal(experience.nearbyVoiceActivity.call(club), 0, flag);
        peer[flag] = false;
    }
    peer.speaking = false;
    assert.equal(experience.nearbyVoiceActivity.call(club), 0);
    club.multiplayer.micEnabled = true;
    assert.ok(experience.nearbyVoiceActivity.call(club) > 0.99);
});

test('show mood and blackout never bypass lighting authority', () => {
    const experience = harness();
    const calls = [];
    const club = { guardHostControl: () => false,
        showDirector: { setProgram: value => calls.push(value) },
        vjDirector: { setMasterIntensity: value => calls.push(value) },
        resumeAutoShow: () => calls.push('resume'), showErrorMessage() {} };
    assert.equal(experience.setShowMood.call(club, 'aesthetic'), false);
    assert.equal(experience.blackOutShow.call(club), false);
    assert.deepEqual(calls, []);
    club.guardHostControl = () => true;
    assert.equal(experience.setShowMood.call(club, 'aesthetic'), true);
    assert.deepEqual(calls, ['aesthetic', 1, 'resume']);
    assert.equal(experience.blackOutShow.call(club), true);
    assert.equal(club.masterIntensity, 0);
});

test('paged VR credits retain attribution and complete source links', () => {
    const text = Array.from({ length: 60 }, (_, i) => `Creator${i} licence attribution`).join('\n');
    const link = 'https://example.test/attribution/' + 'a'.repeat(100);
    const experience = harness({ document: { querySelector: () => ({
        textContent: text, querySelectorAll: () => [{ textContent: 'Source', href: link }]
    }) } });
    const club = {};
    const output = [];
    for (let page = 0; ; page++) {
        club._vrCreditsPage = page;
        const definitions = experience._vrCreditsDefinitions.call(club, { back: {}, close: {} });
        assert.equal(definitions.length, 12);
        output.push(...definitions.filter(item => item?.action === 'creditText').flatMap(item => [item.label, item.detail]));
        if (page * 16 + 16 >= club._vrCreditsLines.length) break;
    }
    const compact = output.join('').replace(/\s/g, '');
    assert.ok(compact.includes(text.replace(/\s/g, '')));
    assert.ok(compact.includes(link));
});

test('failed postcard restores menu and labels and releases temporary camera', async () => {
    let disposed = false;
    const mesh = () => ({ enabled: true, isEnabled() { return this.enabled; },
        setEnabled(value) { this.enabled = value; }, isDisposed: () => false });
    const menu = mesh(), label = mesh();
    const experience = harness({ BABYLON: {
        FreeCamera: class { dispose() { disposed = true; } },
        Tools: { CreateScreenshotUsingRenderTargetAsync: async () => { throw new Error('test capture failure'); } }
    } });
    const notices = [];
    const club = { _playerCamera: () => ({ position: { clone: () => ({}) }, rotationQuaternion: { clone: () => ({}) } }),
        _vrQuickMenuRoot: menu, avatarManager: { remotes: new Map([['p', { nameplate: label }]]) },
        showErrorMessage: text => notices.push(text) };
    assert.equal(await experience.capturePostcard.call(club), false);
    assert.equal(menu.enabled, true);
    assert.equal(label.enabled, true);
    assert.equal(club._postcardCapturing, false);
    assert.equal(disposed, true);
    assert.match(notices[0], /test capture failure/);
});

test('phone presets require a second explicit replacement and leaving the page cancels pairing', async () => {
    const experience = harness();
    const calls = [];
    const store = { stagePhoneImport: async () => { calls.push('stage'); return { count: 2 }; },
        confirmPhoneImport: () => calls.push('replace') };
    const club = { _lightingPresetStore: () => store, showErrorMessage() {}, _refreshVRQuickMenu() {} };
    await experience.transferPhoneCompanion.call(club, 'import');
    assert.deepEqual(calls, ['stage']);
    await experience.transferPhoneCompanion.call(club, 'import');
    assert.deepEqual(calls, ['stage', 'replace']);
    club._phonePairing = { cancel: () => calls.push('cancel') };
    club._phonePairCode = '12345678';
    experience.syncPhoneCompanion.call(club, 'home', true);
    assert.equal(calls.at(-1), 'cancel');
    assert.equal(club._phonePairCode, null);
    assert.equal(club._phoneConfirm, null);
});

test('unavailable QuestDev pairing explains isolation without calling an account API', () => {
    let called = false;
    const experience = harness({ window: { VRPayment: {
        phoneCompanionAvailable: false, startPhonePairing() { called = true; }
    } } });
    const notices = [];
    experience.startPhoneCompanionPairing.call({ showErrorMessage: text => notices.push(text) });
    assert.equal(called, false);
    assert.match(notices[0], /unavailable.*development site/);
});
