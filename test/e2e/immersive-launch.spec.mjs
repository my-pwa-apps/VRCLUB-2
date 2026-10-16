import { test, expect } from '@playwright/test';
import { useQuestHarness, browserFailures } from './support.mjs';

useQuestHarness({ access: false });

const none = { configured: true, entitled: false, verified: false, recoveryRequired: false, deviceRegistered: false, devices: [] };
const member = { configured: true, entitled: true, verified: true, recoveryRequired: false, deviceRegistered: true,
    email: 'owner@example.com', devices: [] };

/** A stand-in access API whose pairing code is approved on demand, like the owner's phone would. */
async function fakeAccess(page, { registered = false, music = null } = {}) {
    const state = { approved: false, started: 0, acquired: 0, music, musicCalls: 0 };
    await page.route('**/payments/**', async route => {
        const path = new URL(route.request().url()).pathname.replace('/payments', '');
        const json = body => route.fulfill({ json: body });
        if (path === '/entitlement') return json(registered || state.approved ? member : none);
        if (path === '/music') { state.musicCalls++; return json({ items: state.music, updatedAt: state.music ? 1 : 0 }); }
        if (path === '/link/start') {
            state.started++;
            return json({ linkId: `link${state.started}`, secret: 'secret', code: `1234567${state.started}`, expiresInSeconds: 600, intervalSeconds: 1 });
        }
        if (path === '/link/poll') return json(state.approved ? { status: 'approved', ...member } : { status: 'pending' });
        if (path === '/vr/acquire') { state.acquired++; return json({ active: true, expiresAt: Date.now() + 90_000, expiresInMs: 90_000 }); }
        if (path === '/vr/renew') return json({ active: true, expiresAt: Date.now() + 90_000, expiresInMs: 90_000 });
        if (path === '/vr/release') return json({ released: true });
        return route.fallback();
    });
    return state;
}

const pressMenu = (page, action) => page.evaluate(action => {
    const club = window.vrClub;
    club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.mesh.isEnabled() && button.action === action));
}, action);

test('a registered headset opens straight into VR: no click, no menu, the world drawn', async ({ page }) => {
    const state = await fakeAccess(page, { registered: true });
    await page.goto('/?immersive=1');
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true, null, { timeout: 240_000 });
    const result = await page.evaluate(() => ({
        mode: window.vrClub._immersive.mode, menu: !!window.vrClub._vrQuickMenuRoot?.isEnabled(),
        mask: window.vrClub.vrHelper.baseExperience.camera.layerMask, lease: window.VRPayment.canEnterVR()
    }));
    expect(result).toEqual({ mode: 'member', menu: false, mask: 0x0FFFFFFF, lease: true });
    expect(state.acquired).toBe(1);
    expect(browserFailures.get(page)).toEqual([]);
});

test('a member headset loads the phone\u2019s music and never sends the guest out of VR to add it', async ({ page }) => {
    const state = await fakeAccess(page, { registered: true, music: [{ url: 'https://audio.example/e2e/set.mp3', name: 'Phone set' }] });
    await page.goto('/?immersive=1');
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true, null, { timeout: 240_000 });
    // Loaded at start, with no button pressed.
    await page.waitForFunction(() => window.vrClub.musicLibrary?.items?.length === 1);
    expect(await page.evaluate(() => window.vrClub.musicLibrary.current().name)).toBe('Phone set');

    const labels = () => page.evaluate(() => window.vrClub._vrQuickMenuButtons.filter(button => button.mesh.isEnabled()).map(button => button.label));
    await page.evaluate(() => { window.vrClub.toggleVRQuickMenu(true); window.vrClub._showVRQuickMenuPage('musicSources'); });
    const sources = await labels();
    expect(sources).toContain('ADD FROM PHONE');
    expect(sources).not.toContain('ADD URL / FILE / FOLDER');

    await pressMenu(page, 'page');
    // The first enabled "page" button on that page is ADD FROM PHONE, the only one there.
    expect(await page.evaluate(() => window.vrClub._vrQuickMenuPage)).toBe('musicPhone');
    expect(await labels()).toContain('SYNC NOW');
    const header = await page.evaluate(() => window.vrClub._immersive.pageText('musicPhone'));
    expect(header.subtitle).toMatch(/\/LINK\/\?MUSIC=1 ON YOUR PHONE$/);

    // The owner adds a second link on the phone; SYNC NOW brings it in without leaving VR.
    state.music = [...state.music, { url: 'https://audio.example/e2e/second.mp3', name: 'Second' }];
    await pressMenu(page, 'musicSync');
    await page.waitForFunction(() => window.vrClub.musicLibrary.items.length === 2);
    expect(await page.evaluate(() => window.vrClub.musicLibrary.items.map(item => item.name))).toEqual(['Phone set', 'Second']);
    expect(await page.evaluate(() => window.vrClub._immersive.musicStatus)).toBe('2 LINKS LOADED');

    // The panels that need a keyboard or a window explain themselves instead of leaving the headset.
    await page.evaluate(() => window.vrClub._openQuestPanel('music'));
    await page.evaluate(() => window.vrClub._openQuestPanel('credits'));
    expect(await page.evaluate(() => window.vrClub.isInVRMode)).toBe(true);
    expect(state.musicCalls).toBeGreaterThanOrEqual(2);
    expect(browserFailures.get(page)).toEqual([]);
});

test('an unpaired headset previews, then shows only a pairing code until the phone approves it', async ({ page }) => {
    const state = await fakeAccess(page);
    // First run: no saved photosensitivity choice.
    await page.addInitScript(() => localStorage.removeItem('vrclub.safeMode'));
    await page.goto('/?immersive=1');
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true, null, { timeout: 240_000 });

    // The WELCOME choice comes first, with strobes held off until it is made and nothing saved.
    await page.waitForFunction(() => window.vrClub._vrQuickMenuPage === 'welcome' && window.vrClub._vrQuickMenuRoot.isEnabled());
    expect(await page.evaluate(() => ({ safe: window.vrClub.photosensitiveSafeMode, saved: localStorage.getItem('vrclub.safeMode') })))
        .toEqual({ safe: true, saved: null });
    expect(await page.evaluate(() => window.vrClub.toggleVRQuickMenu(false))).toBe(true);
    await pressMenu(page, 'welcomeSafe');
    expect(await page.evaluate(() => ({ menu: window.vrClub._vrQuickMenuRoot.isEnabled(), saved: localStorage.getItem('vrclub.safeMode') })))
        .toEqual({ menu: false, saved: '1' });
    // The next Y/B press opens the real menu: it used to reopen the finished welcome page.
    expect(await page.evaluate(() => window.vrClub._vrQuickMenuPage)).toBe('home');
    await page.evaluate(() => window.vrClub.toggleVRQuickMenu(true));
    expect(await page.evaluate(() => window.vrClub._vrQuickMenuButtons.filter(button => button.mesh.isEnabled()).map(button => button.label)))
        .toContain('MUSIC');
    await page.evaluate(() => window.vrClub.toggleVRQuickMenu(false));

    // The free preview: the club is drawn, a pairing code is already being fetched.
    await expect.poll(() => state.started, { timeout: 30_000 }).toBeGreaterThan(0);
    const worldMeshes = await page.evaluate(() => window.vrClub.scene.getActiveMeshes().length);
    expect(worldMeshes).toBeGreaterThan(60);

    // Time up: the veil goes up and the page shows the code.
    await page.evaluate(() => window.vrClub._immersive._lock());
    await page.waitForFunction(() => window.vrClub._vrQuickMenuPage === 'access');
    await expect.poll(() => page.evaluate(() => window.vrClub._immersive.pageText('access').title)).toBe('1234 5671');
    const veiled = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const club = window.vrClub;
        return { mask: club.vrHelper.baseExperience.camera.layerMask, active: club.scene.getActiveMeshes().length,
            menu: club._vrQuickMenuRoot.isEnabled(), closed: club.toggleVRQuickMenu(false) };
    });
    expect(veiled.mask).toBe(0x10000000);
    expect(veiled.menu).toBe(true);
    expect(veiled.closed).toBe(true);
    expect(veiled.active).toBeLessThan(40);
    // Draw it with the real production host name (the longest line it ever shows) before the screenshot.
    await page.evaluate(() => { window.vrClub._immersive.host = 'sidequest-nocturne.mitwee.nl'; window.vrClub._showVRQuickMenuPage('access'); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: test.info().outputPath('veil.png') });

    // The owner approves on the phone: the headset collects its session and the world comes back.
    state.approved = true;
    await page.waitForFunction(() => window.vrClub._immersive.mode === 'member', null, { timeout: 30_000 });
    const lifted = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const club = window.vrClub;
        return { mask: club.vrHelper.baseExperience.camera.layerMask, menu: club._vrQuickMenuRoot.isEnabled(),
            active: club.scene.getActiveMeshes().length, lease: window.VRPayment.canEnterVR() };
    });
    expect(lifted.mask).toBe(0x0FFFFFFF);
    expect(lifted.menu).toBe(false);
    expect(lifted.active).toBeGreaterThan(60);
    expect(lifted.lease).toBe(true);
    expect(state.acquired).toBeGreaterThan(0);
    expect(browserFailures.get(page)).toEqual([]);
});
