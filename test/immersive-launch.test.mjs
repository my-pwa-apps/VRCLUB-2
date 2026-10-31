import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(ROOT, 'js', 'immersiveLaunch.js'), 'utf8');
const WebXRState = { NOT_IN_XR: 0, ENTERING_XR: 1, IN_XR: 2 };

function observable() {
    const handlers = [];
    return { handlers, add(fn) { handlers.push(fn); return fn; }, remove(fn) { handlers.splice(handlers.indexOf(fn), 1); },
        fire(value) { [...handlers].forEach(fn => fn(value)); } };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(condition, message) {
    for (let i = 0; i < 200; i++) {
        if (condition()) return;
        await settle();
    }
    assert.fail(`Timed out waiting for ${message}`);
}

const launches = [];
// A pairing loop that is still polling would keep the test process alive.
afterEach(() => { launches.splice(0).forEach(launch => launch.dispose()); });

/** The launch against a stub club, stub payment gate and manual timers; the real class runs unmodified. */
function setup({ stored = '1', prepare = { state: 'ready' }, enter, polls = [], upgrade, music = async () => ({ items: null }), skipped = 0 } = {}) {
    const calls = { enter: [], toast: [], page: [], toggles: [], linkStart: 0, polled: 0, upgrade: 0, preview: [], gesture: 0, music: 0, replaced: [] };
    const timers = [];
    const stateChanged = observable();
    const pointer = observable();
    const xrCamera = { layerMask: 0x0FFFFFFF };
    const sceneCamera = { layerMask: 0x0FFFFFFF };
    const menu = { enabled: false, isEnabled() { return this.enabled; }, setEnabled(on) { this.enabled = on; } };
    const audioElement = { muted: false, paused: true };
    const club = {
        initPromise: Promise.resolve(),
        _vrEntryReady: Promise.resolve(true),
        vrHelper: { baseExperience: {
            camera: xrCamera, onStateChangedObservable: stateChanged,
            async enterXRAsync(...args) { calls.enter.push(args); if (enter) await enter(); stateChanged.fire(WebXRState.IN_XR); },
            async exitXRAsync() { calls.exited = true; stateChanged.fire(WebXRState.NOT_IN_XR); }
        } },
        scene: { activeCamera: sceneCamera, onPointerObservable: pointer },
        audioElement, audioContext: { state: 'suspended', resume() { calls.resumed = true; } },
        _vrQuickMenuRoot: menu, _vrQuickMenuPage: 'home',
        safeMode: null, safeModeCalls: [],
        setPhotosensitiveSafeMode(value, options) { this.safeModeCalls.push({ value, options }); this.safeMode = value; },
        showErrorMessage(message) { calls.toast.push(message); },
        toggleVRQuickMenu(force) {
            calls.toggles.push(force);
            if (force === false && window.ImmersiveLaunch && club._immersive?.menuLocked()) return true;
            menu.enabled = !!force;
            return menu.enabled;
        },
        _showVRQuickMenuPage(page) { calls.page.push(page); club._vrQuickMenuPage = page; },
        _ensureAudioContext() { calls.audio = true; },
        musicLibrary: { replaceAll(items) { calls.replaced.push(items); return { count: items.length - skipped, skipped, changed: true }; } }
    };
    const pending = [...polls];
    const payment = {
        async autoPrepare() { return prepare; },
        setPreview(on) { calls.preview.push(on); },
        async linkStart() { calls.linkStart++; return { linkId: `l${calls.linkStart}`, secret: 's', code: '12345678', expiresInMs: 600000, intervalMs: 3000 }; },
        async linkPoll() { calls.polled++; const next = pending.length ? pending.shift() : 'pending'; if (next instanceof Error) throw next; return next; },
        async upgradeToMember() { calls.upgrade++; if (upgrade) return upgrade(calls.upgrade); return true; },
        async fetchMusic() { calls.music++; return music(); }
    };
    const window = { location: { search: '?immersive=1', host: 'nocturne.mitwee.nl' }, close() { calls.closed = true; } };
    const context = vm.createContext({
        window, BABYLON: { WebXRState, PointerEventTypes: { POINTERDOWN: 1 } }, URLSearchParams, console, performance,
        localStorage: { getItem: () => stored, setItem() {} }
    });
    vm.runInContext(source, context);
    const ImmersiveLaunch = window.ImmersiveLaunch;
    const launch = new ImmersiveLaunch(club, {
        payment, host: 'nocturne.mitwee.nl', sleep: () => settle(),
        setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.push(timer); return timer; },
        clearTimeout: timer => { if (timer) timer.cleared = true; },
        onFirstGesture: () => { calls.gesture++; }
    });
    club._immersive = launch;
    launches.push(launch);
    return { launch, club, calls, timers, stateChanged, pointer, xrCamera, sceneCamera, menu, audioElement, ImmersiveLaunch, window };
}

test('an immersive launch is requested only by ?immersive=1 (or true) on the start URL', () => {
    const { ImmersiveLaunch } = setup();
    assert.equal(ImmersiveLaunch.requested('?immersive=1'), true);
    assert.equal(ImmersiveLaunch.requested('?a=b&immersive=true'), true);
    assert.equal(ImmersiveLaunch.requested(''), false);
    assert.equal(ImmersiveLaunch.requested('?immersive=0'), false);
    assert.equal(ImmersiveLaunch.requested('?immersive'), false);
});

test('the veil hides the world and keeps the menu: the menu layer mask carries both bits', () => {
    const { ImmersiveLaunch } = setup();
    const menu = Number(/MENU_LAYER_MASK\(\)\s*\{\s*return\s*(0x[0-9A-Fa-f]+)/.exec(readFileSync(join(ROOT, 'js', 'club', '10-ui.js'), 'utf8'))[1]);
    assert.notEqual(menu & ImmersiveLaunch.WORLD_LAYER_MASK, 0);
    assert.notEqual(menu & ImmersiveLaunch.VEIL_LAYER_MASK, 0);
    assert.equal(ImmersiveLaunch.WORLD_LAYER_MASK & ImmersiveLaunch.VEIL_LAYER_MASK, 0);
    assert.equal(ImmersiveLaunch.WORLD_LAYER_MASK, 0x0FFFFFFF, 'the default Babylon layer mask');
});

test('a registered, entitled headset takes the lease and enters VR with no preview and no veil', async () => {
    const t = setup();
    await t.launch.start();
    assert.deepEqual(t.calls.enter, [['immersive-vr', 'local-floor']]);
    assert.equal(t.launch.mode, 'member');
    assert.equal(t.launch.needsAccess(), false);
    assert.equal(t.launch.menuLocked(), false);
    assert.deepEqual(t.calls.preview, []);
    assert.equal(t.calls.linkStart, 0);
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF);
    assert.equal(t.timers.length, 0);
});

test('a guest who never chose is held in Safe Mode, temporarily, and asked before anything else', async () => {
    const t = setup({ stored: null });
    assert.deepEqual(JSON.parse(JSON.stringify(t.club.safeModeCalls)), [{ value: true, options: { persist: false } }]);
    assert.equal(t.launch.menuLocked(), true);
    await t.launch.start();
    assert.deepEqual(t.calls.page, ['welcome']);
    assert.equal(t.menu.enabled, true);
    t.club.toggleVRQuickMenu(false);
    assert.equal(t.menu.enabled, true, 'the choice cannot be waved away');

    t.launch.handleMenuAction('welcomeFull');
    assert.deepEqual(t.club.safeModeCalls.at(-1), { value: false, options: undefined }, 'saved like the splash toggle');
    assert.equal(t.launch.menuLocked(), false);
    assert.equal(t.menu.enabled, false);
    assert.equal(t.club._vrQuickMenuPage, 'home', 'the next Y/B press opens HOME, not the finished welcome page');
    t.launch.handleMenuAction('welcomeSafe');
    assert.equal(t.club.safeModeCalls.length, 2, 'a second press does nothing');
});

test('a guest who already chose is never asked, and their choice is not overridden', async () => {
    const t = setup({ stored: '0' });
    await t.launch.start();
    assert.deepEqual(t.club.safeModeCalls, []);
    assert.deepEqual(t.calls.page, []);
    assert.equal(t.launch.menuLocked(), false);
});

test('without access the headset gets a free preview, then a veiled pairing code; approval lifts it', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, polls: ['pending', 'approved'] });
    t.audioElement.muted = false;
    await t.launch.start();
    assert.equal(t.launch.mode, 'preview');
    assert.deepEqual(t.calls.preview, [true]);
    assert.equal(t.launch.needsAccess(), true);
    assert.equal(t.launch.menuLocked(), false);
    assert.equal(t.timers.length, 2, 'the lock and its 30-second warning');
    assert.equal(t.timers[0].ms, t.ImmersiveLaunch.PREVIEW_MS);
    assert.equal(t.timers[1].ms, t.ImmersiveLaunch.PREVIEW_MS - t.ImmersiveLaunch.PREVIEW_WARNING_MS);
    assert.match(t.calls.toast.at(-1), /Free 2-minute preview.*Press B, then ACCESS, to buy or link/);
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF, 'the preview shows the club');
    await until(() => t.calls.polled >= 1, 'the first poll');

    t.timers[1].fn();
    assert.match(t.calls.toast.at(-1), /Preview ends in 30 seconds.*buy or link/, 'a warning before the screen goes dark');
    t.timers[0].fn();
    assert.equal(t.launch.mode, 'locked');
    assert.equal(t.launch.menuLocked(), true);
    assert.equal(t.xrCamera.layerMask, t.ImmersiveLaunch.VEIL_LAYER_MASK);
    assert.equal(t.sceneCamera.layerMask, t.ImmersiveLaunch.VEIL_LAYER_MASK);
    assert.equal(t.audioElement.muted, true, 'no free music behind the veil');
    assert.equal(t.calls.page.at(-1), 'access');
    t.club.toggleVRQuickMenu(false);
    assert.equal(t.menu.enabled, true, 'a locked code cannot be dismissed');

    await until(() => t.launch.mode === 'member', 'the upgrade to member');
    assert.equal(t.calls.upgrade, 1);
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF);
    assert.equal(t.audioElement.muted, false, 'the guest\u2019s own mute state comes back');
    assert.equal(t.menu.enabled, false);
    assert.equal(t.club._vrQuickMenuPage, 'home', 'after linking, the menu opens on HOME and not on the pairing page');
    assert.match(t.calls.toast.at(-1), /Linked/);
    assert.equal(t.launch.link, null);
});

test('pairing during the preview upgrades at once, so the preview timer never locks a member', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, polls: ['approved'] });
    await t.launch.start();
    await until(() => t.launch.mode === 'member', 'member');
    assert.equal(t.timers[0].cleared, true);
    assert.equal(t.timers[1].cleared, true, 'and so does the warning');
    t.timers[1].fn();
    assert.ok(!/Preview ends/.test(t.calls.toast.join('|')), 'a stale warning never frightens a member');
    t.timers[0].fn();
    assert.equal(t.launch.mode, 'member', 'a stale timer cannot lock a member');
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF);
});

test('the preview does not start until the photosensitivity choice is made', async () => {
    const t = setup({ stored: null, prepare: { state: 'needs-access' } });
    await t.launch.start();
    assert.equal(t.timers.length, 0);
    assert.equal(t.calls.linkStart, 0);
    t.launch.handleMenuAction('welcomeSafe');
    assert.equal(t.timers.length, 2);
    await until(() => t.calls.linkStart === 1, 'a pairing code');
});

test('the pairing page shows the code in two groups and says it is where to buy or link', async () => {
    const t = setup({ prepare: { state: 'needs-access' } });
    assert.equal(t.launch.pageText('access').title, 'GETTING A CODE');
    await t.launch.start();
    await until(() => t.launch.link, 'a code');
    const text = t.launch.pageText('access');
    assert.equal(text.title, '1234 5678');
    assert.equal(text.subtitle, 'BUY OR LINK AT NOCTURNE.MITWEE.NL/LINK');
    assert.ok(text.subtitle.length < 52, 'it must fit one menu line at a readable size');
    assert.match(t.launch.pageText('welcome').subtitle, /SAFE MODE/);
    t.launch.dispose();
});

test('an expired code is replaced by itself, and NEW CODE asks for another on request', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, polls: ['expired'] });
    await t.launch.start();
    await until(() => t.calls.linkStart >= 2, 'a replacement code');
    const before = t.calls.linkStart;
    t.launch.handleMenuAction('accessNewCode');
    await until(() => t.calls.linkStart > before, 'a code on request');
    t.launch.dispose();
});

test('the music status names the headset\u2019s account, masked, so the owner knows which email the phone must use', async () => {
    const empty = setup({ music: async () => ({ items: null, email: 'bart@outlook.com' }) });
    await empty.launch.start();
    await until(() => empty.launch.musicStatus === 'NOTHING SAVED FOR B***@OUTLOOK.COM', 'the account in the status');
    empty.launch.handleMenuAction('musicSync');
    await until(() => /SAME email/.test(empty.calls.toast.at(-1) || ''), 'the message');
    assert.match(empty.calls.toast.at(-1), /b\*\*\*@outlook\.com/);
    assert.ok(!JSON.stringify(empty.calls.toast).includes('bart@outlook.com'), 'the full address is never shown');

    const loaded = setup({ music: async () => ({ items: [{ url: 'https://audio.example/a.mp3' }], email: 'bart@outlook.com' }) });
    await loaded.launch.start();
    await until(() => loaded.launch.musicStatus === '1 LINK LOADED FOR B***@OUTLOOK.COM', 'the loaded status');

    const { ImmersiveLaunch } = setup();
    assert.equal(ImmersiveLaunch.maskEmail('anna.smith@example.org'), 'a***@example.org');
    for (const bad of ['', 'nope', null, undefined, '@x.com', 'a@']) assert.equal(ImmersiveLaunch.maskEmail(bad), '', String(bad));
});

test('a server error shows a plain message and keeps trying instead of freezing the screen', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, polls: [new Error('down'), 'approved'] });
    await t.launch.start();
    await until(() => t.launch.linkError !== '' || t.launch.mode === 'member', 'an error or recovery');
    await until(() => t.launch.mode === 'member', 'recovery');
    assert.equal(t.launch.linkError, '');
});

test('approved but the lease is busy: the screen says so and the upgrade is retried', async () => {
    const busy = Object.assign(new Error('busy'), { body: { error: 'vr_in_use' } });
    const t = setup({ prepare: { state: 'needs-access' }, polls: ['approved'],
        upgrade: n => { if (n < 3) throw busy; return true; } });
    await t.launch.start();
    await until(() => t.launch.approved && t.launch.linkError, 'the busy message');
    assert.match(t.launch.linkError, /ANOTHER DEVICE/);
    assert.equal(t.launch.pageText('access').title, 'LINKED');
    await until(() => t.launch.mode === 'member', 'the retry to succeed');
    assert.equal(t.calls.upgrade, 3);
});

test('another device holding the lease, or an unreachable service, leaves the normal 2D flow in charge', async () => {
    for (const state of [{ state: 'in-use', message: 'VR is open elsewhere.' }, { state: 'error', message: 'Offline.' }]) {
        const t = setup({ prepare: state });
        await t.launch.start();
        assert.equal(t.launch.mode, 'manual');
        assert.deepEqual(t.calls.enter, []);
        assert.equal(t.calls.toast.at(-1), state.message);
        assert.equal(t.launch.menuLocked(), false);
    }
});

test('if the browser refuses the automatic session, the guest is handed the Enter VR button', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, enter: async () => { throw new Error('needs a click'); } });
    await t.launch.start();
    assert.equal(t.launch.mode, 'manual');
    assert.deepEqual(t.calls.preview, [true, false], 'the preview allowance is withdrawn');
    assert.match(t.calls.toast.at(-1), /Enter VR/);
});

test('no VR on this device, or no payment gate, is a quiet hand-over', async () => {
    const t = setup();
    t.club._vrEntryReady = Promise.resolve(false);
    await t.launch.start();
    assert.equal(t.launch.mode, 'manual');
    assert.deepEqual(t.calls.enter, []);
});

test('leaving VR from the pairing screen unveils the club, closes the locked menu and stops polling', async () => {
    const t = setup({ prepare: { state: 'needs-access' } });
    await t.launch.start();
    t.timers[0].fn();
    await until(() => t.calls.polled >= 1, 'polling');
    t.stateChanged.fire(WebXRState.NOT_IN_XR);
    assert.equal(t.launch.mode, 'manual');
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF);
    assert.equal(t.audioElement.muted, false);
    assert.equal(t.menu.enabled, false);
    assert.deepEqual(t.calls.preview.at(-1), false);
    const polled = t.calls.polled;
    await settle(); await settle();
    assert.equal(t.calls.polled, polled);
});

test('EXIT VR on the pairing screen leaves the session and closes the app window', async () => {
    const t = setup({ prepare: { state: 'needs-access' } });
    await t.launch.start();
    t.timers[0].fn();
    t.launch.handleMenuAction('accessExit');
    await until(() => t.window.close && t.calls.closed, 'the window to close');
    assert.equal(t.calls.exited, true);
    t.launch.dispose();
});

test('the first controller press resumes audio and the saved set, once, only when nothing is playing', async () => {
    const t = setup();
    await t.launch.start();
    assert.equal(t.pointer.handlers.length, 1);
    t.pointer.fire({ type: 0 });
    assert.equal(t.calls.gesture, 0, 'a move is not a press');
    t.pointer.fire({ type: 1 });
    assert.equal(t.calls.gesture, 1);
    assert.equal(t.calls.resumed, true);
    assert.equal(t.pointer.handlers.length, 0);

    const playing = setup();
    playing.audioElement.paused = false;
    await playing.launch.start();
    playing.pointer.fire({ type: 1 });
    assert.equal(playing.calls.gesture, 0, 'music that already started is left alone');
});

test('a member headset loads the phone\u2019s music list when VR starts, and the page says how many', async () => {
    const list = [{ url: 'https://audio.example/a.mp3', name: 'A' }, { url: 'https://audio.example/b.mp3' }];
    const t = setup({ music: async () => ({ items: list }) });
    await t.launch.start();
    await until(() => t.calls.replaced.length === 1, 'the sync');
    assert.deepEqual(JSON.parse(JSON.stringify(t.calls.replaced[0])), list);
    assert.equal(t.launch.musicStatus, '2 LINKS LOADED');
    assert.match(t.calls.toast.at(-1), /Loaded 2 music links from your phone/);
});

test('a headset still in its preview does not ask for music; an account with no saved list leaves the local sets alone', async () => {
    const preview = setup({ prepare: { state: 'needs-access' }, music: async () => { throw new Error('must not be called'); } });
    await preview.launch.start();
    assert.equal(preview.calls.music, 0);

    const none = setup({ music: async () => ({ items: null }) });
    await none.launch.start();
    await until(() => none.calls.music === 1, 'the sync');
    await settle();
    assert.deepEqual(none.calls.replaced, [], 'null means never saved: nothing is replaced');
    assert.equal(none.launch.musicStatus, 'NOTHING SAVED YET');
    none.launch.handleMenuAction('musicSync');
    await until(() => none.calls.music === 2, 'the manual sync');
    await until(() => /Nothing saved yet/.test(none.calls.toast.at(-1) || ''), 'its message');
});

test('SYNC NOW answers every time; an unlinked headset is told to link first and a server error is plain', async () => {
    const unlinked = setup({ music: async () => ({ items: null, signedIn: false }) });
    await unlinked.launch.start();
    unlinked.launch.handleMenuAction('musicSync');
    await until(() => /Link this headset/.test(unlinked.calls.toast.at(-1) || ''), 'the link message');
    assert.equal(unlinked.launch.musicStatus, 'LINK THIS HEADSET FIRST');

    const down = setup({ music: async () => { throw new Error('offline'); } });
    await down.launch.start();
    down.launch.handleMenuAction('musicSync');
    await until(() => /Could not reach/.test(down.calls.toast.at(-1) || ''), 'the error');
    assert.equal(down.launch.musicStatus, 'CANNOT REACH THE SERVER');

    const same = setup({ music: async () => ({ items: [{ url: 'https://audio.example/a.mp3' }] }) });
    await same.launch.start();
    await until(() => same.calls.replaced.length === 1, 'the first sync');
    same.launch.handleMenuAction('musicSync');
    await until(() => same.calls.replaced.length === 2, 'the manual sync');
});

test('links that cannot be used are reported instead of silently dropped', async () => {
    const t = setup({ skipped: 1, music: async () => ({ items: [{ url: 'https://audio.example/a.mp3' }, { url: 'https://bad' }] }) });
    await t.launch.start();
    await until(() => /could not be used/.test(t.calls.toast.at(-1) || ''), 'the warning');
    assert.equal(t.launch.musicStatus, '1 LINK LOADED');
});

test('phone sync reports local saved-set failures instead of blaming the server', async () => {
    const t = setup({ music: async () => ({ items: [] }) });
    t.club.musicLibrary.readError = 'unreadable';
    t.club.musicLibrary.replaceAll = () => { throw new Error('Saved sets cannot be changed until you retry or reset them in Music.'); };
    await t.launch.syncMusic(true);
    assert.equal(t.launch.musicStatus, 'SAVED SETS NEED RECOVERY');
    assert.equal(t.calls.music, 0);
    assert.match(t.calls.toast.at(-1), /retry or reset/);
    t.club.musicLibrary.readError = null;
    await t.launch.syncMusic(true);
    assert.equal(t.launch.musicStatus, 'SAVED SETS COULD NOT BE UPDATED');
    assert.match(t.calls.toast.at(-1), /retry or reset/);
});

test('linking during the session loads the music too, and the music page has its own words', async () => {
    const t = setup({ prepare: { state: 'needs-access' }, polls: ['approved'], music: async () => ({ items: [{ url: 'https://audio.example/a.mp3' }] }) });
    await t.launch.start();
    await until(() => t.launch.mode === 'member', 'member');
    await until(() => t.calls.replaced.length === 1, 'the sync after linking');
    const text = t.launch.pageText('musicPhone');
    assert.equal(text.title, 'MUSIC FROM YOUR PHONE');
    assert.equal(text.subtitle, 'OPEN NOCTURNE.MITWEE.NL/LINK/?MUSIC=1 ON YOUR PHONE');
    assert.ok(text.subtitle.length < 60, 'it must fit one menu line');
});

test('dispose lifts the veil and releases every observer', async () => {
    const t = setup({ prepare: { state: 'needs-access' } });
    await t.launch.start();
    t.timers[0].fn();
    t.launch.dispose();
    assert.equal(t.xrCamera.layerMask, 0x0FFFFFFF);
    assert.equal(t.stateChanged.handlers.length, 0);
    assert.equal(t.pointer.handlers.length, 0);
});

test('the launch is wired in: script order, club hooks and the splash bypass', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const order = [...html.matchAll(/<script src="([^"?]+)/g)].map(match => match[1]);
    assert.ok(order.indexOf('js/immersiveLaunch.js') > order.indexOf('js/paymentGate.js'));
    assert.ok(order.indexOf('js/immersiveLaunch.js') < order.indexOf('js/ui-init.js'));
    const ui = readFileSync(join(ROOT, 'js', 'ui-init.js'), 'utf8');
    assert.match(ui, /ImmersiveLaunch\.requested\(\)\) enterClubBtn\.click\(\)/);
    assert.match(ui, /_immersive = new ImmersiveLaunch/);
    const club = readFileSync(join(ROOT, 'js', 'club', '10-ui.js'), 'utf8');
    for (const member of ['needsAccess', 'menuLocked', 'pageText', 'handleMenuAction']) {
        assert.ok(source.includes(`${member}(`), `ImmersiveLaunch.${member} must exist`);
        assert.ok(club.includes(`_immersive.${member}(`) || club.includes(`_immersive && this._immersive.${member}(`), `10-ui.js uses ${member}`);
    }
    assert.match(readFileSync(join(ROOT, 'js', 'club', '02-lifecycle.js'), 'utf8'), /_immersive\?\.dispose\(\)/);
});
