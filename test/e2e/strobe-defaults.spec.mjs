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

const fixtureState = page => page.evaluate(() => {
    const club = window.vrClub;
    return {
        fixtures: club.strobes.map(strobe => {
            const direction = new BABYLON.Vector3(0, 1.7, -12).subtract(strobe.mesh.position).normalize();
            strobe.mesh.computeWorldMatrix(true);
            return {
                position: strobe.mesh.position.asArray(),
                aim: BABYLON.Vector3.Dot(strobe.mesh.getDirection(BABYLON.Axis.Z).normalize(), direction),
                casing: strobe.mesh.material.name,
                separateEmitter: strobe.mesh.material !== strobe.material,
                tubeVisible: strobe.tube.isVisible && strobe.tube.isEnabled(),
                reflectorVisible: strobe.reflector.isVisible && strobe.reflector.isEnabled(),
                casingEmission: strobe.mesh.material.emissiveColor.asArray(),
                light: strobe.light
            };
        }),
        flashLightEnabled: club.strobeFlashLight.isEnabled(),
        goboMeshes: club.scene.meshes.filter(mesh => /gobo/i.test(mesh.name)).length,
        goboControls: document.querySelectorAll('[data-control*="gobo"], [id*="Gobo"]').length,
        goboState: typeof club.goboEnabled
    };
});

test('Unity fixtures retain web strobe defaults, bar-locked cues and Safe Mode in desktop and VR', async ({ page }, testInfo) => {
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
    const desktopFixtures = await fixtureState(page);
    expect(desktopFixtures).toMatchObject({ flashLightEnabled: false, goboMeshes: 0, goboControls: 0, goboState: 'undefined' });
    expect(desktopFixtures.fixtures.map(fixture => fixture.position)).toEqual([
        [-7.6, 7.6, -9.2], [7.6, 7.6, -9.2], [-7.6, 7.6, -14.8], [7.6, 7.6, -14.8]
    ]);
    for (const fixture of desktopFixtures.fixtures) {
        expect(fixture).toMatchObject({
            separateEmitter: true, tubeVisible: true, reflectorVisible: true, casingEmission: [0, 0, 0], light: null
        });
        expect(fixture.aim).toBeGreaterThan(0.999999);
    }
    await page.evaluate(() => {
        const club = window.vrClub;
        club.camera.position.set(3, 1.7, -4);
        club.camera.setTarget(new BABYLON.Vector3(7.6, 7.6, -9.2));
    });
    await renderFrames(page, 4);
    await page.screenshot({ path: testInfo.outputPath('unity-strobe-off.png') });

    await enterVR(page);
    await pin('sideways');
    await renderFrames(page, 10);
    expect(await strobeState(page)).toMatchObject({ safe: false, active: true, sync: 'bar', gridLocked: true, inVR: true });
    expect(await fixtureState(page)).toEqual(desktopFixtures);

    // Opting in silences every strobe, in VR too, and is remembered.
    await page.evaluate(() => window.vrClub.setPhotosensitiveSafeMode(true));
    await pin('sideways');
    await renderFrames(page, 10);
    expect(await strobeState(page)).toMatchObject({ safe: true, active: false });
    expect(await page.evaluate(() => localStorage.getItem('vrclub.safeMode'))).toBe('1');
});
