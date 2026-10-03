import { test, expect } from '@playwright/test';
import { enterVR, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

// The shared harness stores Safe Mode ON so the other specs are deterministic. This spec is about
// the real default, so it removes that and lets the app resolve it from a clean profile.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('vrclub.safeMode'));
});

/** What the strobe system is configured to do right now, from the live club. */
const strobeState = page => page.evaluate(() => {
    const club = window.vrClub;
    return {
        safe: club.photosensitiveSafeMode,
        active: club.strobesActive,
        sync: club.strobeSync,
        pattern: club.strobePattern,
        // null = the free-running timer; anything else = locked to the beat grid
        gridLocked: club._strobeSyncDue() !== null,
        inVR: club.isInVRMode
    };
});

test('Safe Mode is off by default even under reduced motion, and layered cues carry a bar-locked strobe', async ({ page }) => {
    test.setTimeout(900_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#splashSafeModeState')).toHaveText('OFF');
    await expect(page.locator('#splashSafeModeBtn')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    expect(await page.evaluate(() => ({
        safe: window.vrClub.photosensitiveSafeMode,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        stored: localStorage.getItem('vrclub.safeMode')
    }))).toEqual({ safe: false, reduced: true, stored: null });

    const pin = look => page.evaluate(async lk => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.showDirector._applyCue({ look: lk, bars: 1024 });
    }, look);

    // The groove cues that used to be strobe-free now carry a once-a-bar accent.
    for (const look of ['sideways', 'crossfire', 'ceilingSidewash', 'theClimb']) {
        await pin(look);
        expect(await strobeState(page), look).toMatchObject({ safe: false, active: true, sync: 'bar', pattern: 'chase', gridLocked: true });
    }
    // The opening stays clean.
    await pin('firstLight');
    expect(await strobeState(page)).toMatchObject({ active: false });

    await enterVR(page);
    await pin('sideways');
    await renderFrames(page, 10);
    expect(await strobeState(page)).toMatchObject({ safe: false, active: true, sync: 'bar', gridLocked: true, inVR: true });

    // Opting in silences every strobe, in VR too, and is remembered.
    await page.evaluate(() => window.vrClub.setPhotosensitiveSafeMode(true));
    await pin('sideways');
    await renderFrames(page, 10);
    expect(await strobeState(page)).toMatchObject({ safe: true, active: false });
    expect(await page.evaluate(() => localStorage.getItem('vrclub.safeMode'))).toBe('1');
});
