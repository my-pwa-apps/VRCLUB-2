import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// In a headset the restroom mirror used to refresh every other frame (one eye's reflection shown to both, trailing the
// head) and was also drawn a second time as a custom render target. It now renders through the mirror material, every
// frame, per eye, at headset size.
test('in VR the restroom mirror refreshes every frame at a headset-sized texture and is drawn once per eye', async ({ page }) => {
    test.setTimeout(1_200_000);
    await enterClub(page);
    await enterVR(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene, cam = club.vrHelper.baseExperience.camera;
        await club.modelLoadPromise;
        const frames = async n => { for (let i = 0; i < n; i++) await new Promise(r => scene.onAfterRenderObservable.addOnce(r)); };
        await frames(4);
        cam.position.x = -14.4; cam.position.z = -1.72;
        cam.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
        await frames(12);
        const tex = club.restroomMirrorTexture;
        let renders = 0;
        const observer = tex.onAfterRenderObservable.add(() => { renders++; });
        await frames(12);
        tex.onAfterRenderObservable.remove(observer);
        return {
            vr: club.isInVRMode, refreshRate: tex.refreshRate, size: tex.getSize().width, samples: tex.samples,
            rendersPerFrame: renders / 12, custom: scene.customRenderTargets.includes(tex), tier: club.graphicsTier,
            facing: cam.getDirection(BABYLON.Axis.Z).x
        };
    });
    expect(result.vr).toBe(true);
    expect(result.custom, 'the mirror is not also a custom render target').toBe(false);
    expect(result.refreshRate, 'every frame, so the reflection never trails the head').toBe(1);
    expect(result.size).toBeLessThanOrEqual(512);
    expect(result.samples).toBeLessThanOrEqual(2);
    expect(result.rendersPerFrame, `drawn ${result.rendersPerFrame} times a frame`).toBeLessThanOrEqual(2.2);
    expect(result.rendersPerFrame).toBeGreaterThanOrEqual(0.8);
    await expectHealthyRuntime(page);
});
