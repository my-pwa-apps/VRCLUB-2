import { test, expect } from '@playwright/test';
import { enterClub, enterVR, exitVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness({ comfort: false });

test('fresh VR navigation follows the head with left walking, right turning and no crouch-origin jump', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const settings = await page.evaluate(() => ({
        comfort: window.vrClub.vrComfortMode,
        tiers: Object.values(window.vrClub.qualityTiers).map(tier => [tier.mirrorSpots, tier.mirrorRays])
    }));
    expect(settings.comfort).toBe(false);
    expect(settings.tiers).toEqual([[280, 64], [180, 52], [96, 32]]);
    await enterVR(page);
    await renderFrames(page, 4);
    expect(await page.evaluate(() => !!window.vrClub.movementFeature)).toBe(true);

    for (const height of [0.29, 0.25, 0, 1.6]) {
        await page.evaluate(y => window.__iwerDevice.position.set(0, y, 0), height);
        await renderFrames(page, 4);
        const pose = await page.evaluate(() => ({
            y: window.vrClub.vrHelper.baseExperience.camera.position.y,
            tracked: window.vrClub._xrHeadHeight(),
            level: window.vrClub._walkLevel
        }));
        expect(pose.tracked).toBeCloseTo(height, 3);
        expect(pose.y).toBeCloseTo(height, 2);
        expect(pose.level).toBeCloseTo(0, 3);
    }

    // Traverse the old invisible entrance barrier with the actual left controller.
    await page.evaluate(() => {
        const club = window.vrClub;
        club.vrHelper.baseExperience.camera.position.set(6, 1.6, -4);
        club._walkLevel = 0;
    });
    await renderFrames(page, 3);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateAxes('thumbstick', 0, -1));
    await renderFrames(page, 16);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    await renderFrames(page, 3);
    const walked = await page.evaluate(() => window.vrClub.vrHelper.baseExperience.camera.position.asArray());
    expect(walked[2]).toBeLessThan(-5.5);
    expect(walked[0]).toBeCloseTo(6, 1);
    expect(walked[1]).toBeCloseTo(1.6, 2);

    // Look diagonally down and sideways while the controller still points straight ahead.
    await page.evaluate(() => {
        window.vrClub.vrHelper.baseExperience.camera.position.set(0, 1.6, -12);
        const q = BABYLON.Quaternion.RotationYawPitchRoll(Math.PI / 4, -Math.PI / 6, 0);
        window.__iwerDevice.quaternion.set(q.x, q.y, q.z, q.w);
    });
    await renderFrames(page, 4);
    const before = await page.evaluate(() => {
        const camera = window.vrClub.vrHelper.baseExperience.camera;
        return { position: camera.position.asArray(), forward: camera.getForwardRay().direction.asArray() };
    });
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateAxes('thumbstick', 0, -0.7));
    await renderFrames(page, 6);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateAxes('thumbstick', 0, 0));
    await renderFrames(page, 3);
    const after = await page.evaluate(() => window.vrClub.vrHelper.baseExperience.camera.position.asArray());
    const dx = after[0] - before.position[0], dz = after[2] - before.position[2];
    const alignment = (dx * before.forward[0] + dz * before.forward[2])
        / (Math.hypot(dx, dz) * Math.hypot(before.forward[0], before.forward[2]));
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.1);
    expect(alignment).toBeGreaterThan(0.98);
    expect(after[1]).toBeCloseTo(1.6, 2);

    const yaw = () => page.evaluate(() => window.vrClub.vrHelper.baseExperience.camera.rotationQuaternion.toEulerAngles().y);
    const initialYaw = await yaw();
    await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0.6, 0));
    await renderFrames(page, 2);
    const firstTurn = await yaw();
    await renderFrames(page, 2);
    const nextTurn = await yaw();
    await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0, 0));
    expect(Math.abs(firstTurn - initialYaw)).toBeGreaterThan(0.001);
    expect(Math.abs(nextTurn - firstTurn)).toBeGreaterThan(0.001);
    await renderFrames(page, 3);
    const turned = await page.evaluate(() => window.vrClub.vrHelper.baseExperience.camera.position.asArray());
    expect(Math.hypot(turned[0] - after[0], turned[2] - after[2])).toBeLessThan(0.05);
    await exitVR(page);
    await expectHealthyRuntime(page);
});

test('teleport respects the vestibule walls and the bar after smooth/comfort swaps, and goes out through the open street door', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.waitForFunction(() => window.vrClub?._streetDoor?.open === true, null, { timeout: 120_000 });
    await enterVR(page);
    await renderFrames(page, 4);
    const attempts = [
        // Into the street wall beside the door: still a wall.
        { from: [0, 1.6, 3], target: [-3.5, 0, 8], allowed: false },
        { from: [0, 1.6, 3], target: [6, 0, 3], allowed: false },
        { from: [8, 1.6, -10], target: [10.8, 0, -10], allowed: false },
        // Straight out through the open street door onto the pavement.
        { from: [0, 1.6, 3], target: [0, 0, 8], allowed: true }
    ];
    for (const { from, target, allowed } of attempts) {
        await page.evaluate(position => {
            const club = window.vrClub;
            club.setVRComfortMode(false);
            club.setVRComfortMode(true);
            club.vrHelper.baseExperience.camera.position.set(...position);
        }, from);
        await renderFrames(page, 4);
        await page.evaluate(target => {
            const pointer = window.vrClub._xrControllers.find(c => c.inputSource.handedness === 'right').pointer;
            pointer.computeWorldMatrix(true);
            const hand = pointer.getAbsolutePosition();
            const dx = -(target[0] - hand.x), dy = target[1] - hand.y, dz = target[2] - hand.z;
            const length = Math.hypot(dx, dy, dz);
            const q = [dy / length, -dx / length, 0, 1 - dz / length];
            const norm = Math.hypot(...q);
            window.__iwerDevice.controllers.right.quaternion.set(...q.map(v => v / norm));
        }, target);
        await renderFrames(page, 3);
        await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0, -1));
        await renderFrames(page, 6);
        await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0, 0));
        await renderFrames(page, 6);
        const landed = await page.evaluate(() => window.vrClub.vrHelper.baseExperience.camera.position.asArray());
        const moved = Math.hypot(landed[0] - from[0], landed[2] - from[2]);
        if (allowed) expect(moved, `the throw toward ${target} should go through the open door`).toBeGreaterThan(2);
        else expect(moved, `blocked throw toward ${target}`).toBeLessThan(0.05);
    }
    await exitVR(page);
    await expectHealthyRuntime(page);
});
