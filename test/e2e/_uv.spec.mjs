import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterClub, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';
useQuestHarness();
test('wall uv', async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync('tmp-shots/uv', { recursive: true });
    await enterClub(page);
    await page.evaluate(async () => { const c = window.vrClub; await c.modelLoadPromise; c.showDirector.enabled = false; c.vjManualMode = true; c.scene.particleSystems.forEach(s => s.stop()); c.scene.imageProcessingConfiguration.exposure = 5; c.scene.environmentIntensity = 2.5; });
    const views = { side: { pos: [4, 1.7, -8], target: [12.2, 2.5, -8] }, sideWide: { pos: [-6, 2.5, -4], target: [12.2, 4, -22] }, back: { pos: [0, 1.7, -8], target: [-9, 5, -20.7] }, ceil: { pos: [0, 1.7, -10], target: [0, 9.8, -14] } };
    for (const [name, v] of Object.entries(views)) {
        await page.evaluate(view => { const c = window.vrClub; c.camera.position.set(...view.pos); c.camera.setTarget(new BABYLON.Vector3(...view.target)); c.camera.fov = 0.9; }, v);
        await renderFrames(page, 25);
        writeFileSync(`tmp-shots/uv/${name}.png`, await page.locator('canvas#canvas').screenshot());
    }
});
