import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness({ comfort: false });

// Seated mode keeps the avatar standing while the headset sits low; standing mode sizes the body to the player.
// The emulated Quest reports whatever height the test sets on its device, so a 1.1 m headset is a seated player.
test('in VR, Seated mode lifts a sitter to standing height and a measured height sizes the body', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await enterVR(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const until = async (test, ms = 120000) => {
            const end = performance.now() + ms;
            while (!test() && performance.now() < end) await next();
            return test();
        };
        const device = window.__iwerDevice;
        const out = {};
        club.setSeatedMode(false);
        club.playerEyeHeight = null;
        cam.position.set(0, 1.1, -9);
        device.position.set(0, 1.1, 0);
        for (let i = 0; i < 30; i++) await next();
        out.sittingStandardEye = club._xrHeadHeight();
        out.sittingStandardCamY = cam.position.y;

        club.setSeatedMode(true);
        out.liftReached = await until(() => Math.abs(club._xrHeadHeight() - 1.7) < 0.02);
        for (let i = 0; i < 20; i++) await next();
        out.seatedEye = club._xrHeadHeight();
        out.seatedCamY = cam.position.y;
        out.seatedFeet = cam.position.y - club._xrHeadHeight();
        out.bodyEyeSeated = club._localRig ? club._localRig.standEye : null;

        // Standing up in Seated mode lets the lift fall away on its own.
        device.position.set(0, 1.7, 0);
        out.liftGone = await until(() => club._seatLift.lift < 0.005, 180000);

        // A measured height: stand at 1.84 m, press MEASURE HEIGHT, and the body and the network height follow.
        club.setSeatedMode(false);
        device.position.set(0, 1.84, 0);
        for (let i = 0; i < 20; i++) await next();
        club.startHeightMeasure();
        out.measured = await until(() => club.playerEyeHeight !== null, 60000);
        out.playerEyeHeight = club.playerEyeHeight;
        out.stored = localStorage.getItem('vrclub.playerEyeHeight');
        out.bodyRefit = await until(() => club._localRig && Math.abs(club._localRig.standEye - 1.84) < 0.05, 60000);
        out.networkEye = club._bodyEyeHeight();
        return out;
    });
    expect(result.sittingStandardEye).toBeCloseTo(1.1, 2);
    expect(result.liftReached, 'the lift must reach standing eye height').toBe(true);
    expect(result.seatedEye).toBeCloseTo(1.7, 1);
    expect(result.seatedFeet, 'the lift raises the view, not the virtual floor').toBeCloseTo(0, 1);
    expect(result.bodyEyeSeated).toBeCloseTo(1.7, 2);
    expect(result.liftGone).toBe(true);
    expect(result.measured).toBe(true);
    expect(result.playerEyeHeight).toBeCloseTo(1.84, 1);
    expect(Number(result.stored)).toBeCloseTo(1.84, 1);
    expect(result.bodyRefit, 'the local body is refitted to the measured height').toBe(true);
    expect(result.networkEye).toBeCloseTo(1.84, 1);
    await expectHealthyRuntime(page);
});
