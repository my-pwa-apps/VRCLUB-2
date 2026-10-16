import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// The DJ stage is a 0.5 m riser (x -3..3, z -20..-16). Invisible 2 m blocks used to stand either side of it and forced
// guests round by set routes; in a headset a walker went straight into the stage at floor level and was inside it until
// a jump landed on top. It is now stepped onto, from any side, on foot.
test('desktop: the stage can be walked onto from the front and from both flanks, and off again', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, cam = club.camera, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const blockers = scene.meshes.filter(mesh => mesh.checkCollisions && mesh.isEnabled() && !mesh.isVisible && /^collisionWall/.test(mesh.name)
            && mesh.getBoundingInfo().boundingBox.minimumWorld.y < 2 && Math.abs(mesh.getBoundingInfo().boundingBox.centerWorld.x) < 5.5
            && mesh.getBoundingInfo().boundingBox.maximumWorld.y < 3).map(mesh => mesh.name);
        const rows = {};
        const attempt = async (label, from, dir, frames) => {
            cam.position.set(from[0], 1.7, from[1]);
            club._walkLevel = 0;
            for (let i = 0; i < 3; i++) await next();
            let onStage = false, peakStep = 0, last = 0;
            for (let i = 0; i < frames; i++) {
                cam.cameraDirection.set(dir[0] * 0.15, 0, dir[1] * 0.15);
                await next();
                peakStep = Math.max(peakStep, Math.abs(club._walkLevel - last));
                last = club._walkLevel;
                if (club._walkLevel === 0.5) { onStage = true; if (i > frames - 6) break; }
            }
            rows[label] = { onStage, level: club._walkLevel, x: +cam.position.x.toFixed(2), z: +cam.position.z.toFixed(2), peakStep: +peakStep.toFixed(3), y: +cam.position.y.toFixed(2) };
        };
        await attempt('front', [0, -14], [0, -1], 30);
        await attempt('flank left, mid', [-6.5, -17], [1, 0], 40);
        await attempt('flank right, mid', [6.5, -17], [-1, 0], 40);
        await attempt('flank left, front corner', [-6.5, -16.4], [1, 0], 40);
        await attempt('flank right, front corner', [6.5, -16.4], [-1, 0], 40);
        await attempt('off the front', [0, -17], [0, 1], 30);
        return { rows, blockers };
    });
    expect(result.blockers, 'no invisible block is left either side of the stage').toEqual([]);
    for (const label of ['front', 'flank left, mid', 'flank right, mid', 'flank left, front corner', 'flank right, front corner']) {
        expect(result.rows[label].onStage, `${label}: ${JSON.stringify(result.rows[label])}`).toBe(true);
        expect(result.rows[label].peakStep, `${label}: the step up is time-eased (at most 3 m/s over a clamped 0.1 s frame)`).toBeLessThan(0.32);
        expect(result.rows[label].y).toBeCloseTo(2.2, 1);
    }
    expect(result.rows['off the front'].level, 'walking off the front ends on the floor').toBe(0);
    expect(result.rows['off the front'].y).toBeCloseTo(1.7, 1);
    await expectHealthyRuntime(page);
});

test('in VR a headset walking at the stage steps onto it instead of walking into it', async ({ page }) => {
    test.setTimeout(1_200_000);
    await enterClub(page);
    await enterVR(page);
    await page.evaluate(() => window.vrClub.setVRComfortMode(false));
    const result = await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const left = window.__iwerDevice.controllers.left;
        window.__iwerDevice.position.set(0, 1.6, 0);
        for (let i = 0; i < 6; i++) await next();
        cam.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI, 0);
        cam.position.set(0, 1.6, -15);
        club._walkLevel = 0;
        for (let i = 0; i < 6; i++) await next();
        const trace = [];
        left.updateAxes('thumbstick', 0, -1);
        for (let i = 0; i < 160; i++) {
            await next();
            trace.push({ z: cam.position.z, feet: cam.position.y - club._xrHeadHeight(), level: club._walkLevel });
            if (cam.position.z < -17.3) break;
        }
        left.updateAxes('thumbstick', 0, 0);
        let peak = 0;
        for (let i = 1; i < trace.length; i++) peak = Math.max(peak, trace[i].feet - trace[i - 1].feet);
        return { end: trace.at(-1), peak, frames: trace.length };
    });
    expect(result.end.feet, `walked to z ${result.end.z.toFixed(2)} at feet ${result.end.feet.toFixed(2)}`).toBeCloseTo(0.5, 1);
    expect(result.end.level).toBeCloseTo(0.5, 2);
    expect(result.peak, 'the climb is rate-limited (3 m/s over a frame the emulator slows to 0.1 s), not a 0.5 m lurch').toBeLessThan(0.32);
    await expectHealthyRuntime(page);
});
