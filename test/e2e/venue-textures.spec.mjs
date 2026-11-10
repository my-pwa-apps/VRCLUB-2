import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('venue textures are opaque, budget-sized and preserve restroom entry and DJ contact surfaces', async ({ page }, testInfo) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    const state = await page.evaluate(async () => {
        const club = window.vrClub;
        const scene = club.scene;
        await scene.whenReadyAsync();
        const mesh = name => scene.getMeshByName(name);
        const surfaces = ['restroomWallTiles', 'restroomWalls', 'djPlatform', 'djWoodWorktop', 'ceiling'];
        const results = surfaces.map(name => {
            const item = mesh(name), mat = item.material;
            const textures = mat.getActiveTextures();
            return {
                name, material: mat.name, alpha: mat.alpha, blend: mat.needAlphaBlending(),
                ready: textures.every(texture => texture.isReady()),
                sizes: textures.map(texture => texture.getSize().width),
                collisions: item.checkCollisions,
                lightBudget: mat.maxSimultaneousLights,
                normal: (mat.normalTexture || mat.bumpTexture)?.level,
                min: item.getBoundingInfo().boundingBox.minimumWorld.asArray(),
                max: item.getBoundingInfo().boundingBox.maximumWorld.asArray()
            };
        });
        const wood = mesh('djWoodWorktop').material;
        const bar = mesh('barJoinery').material;
        const woodShared = wood.baseTexture === bar.baseTexture && wood.normalTexture === bar.normalTexture;
        const doorway = scene.pickWithRay(new BABYLON.Ray(
            new BABYLON.Vector3(-11.5, 1.2, -3.2), new BABYLON.Vector3(-1, 0, 0), 6
        ), item => item.checkCollisions && item.isEnabled());
        return { results, maxLights: club.maxLights, woodShared,
            doorwayX: doorway.pickedPoint.x, tableTop: mesh('djTable').getBoundingInfo().boundingBox.maximumWorld.y,
            platformTop: mesh('djPlatformTop').getBoundingInfo().boundingBox.maximumWorld.y };
    });
    expect(state.woodShared).toBe(true);
    expect(state.doorwayX).toBeCloseTo(-16.4, 2);
    expect(state.tableTop).toBeCloseTo(1.42, 3);
    expect(state.platformTop).toBeCloseTo(0.52, 3);
    for (const surface of state.results) {
        expect(surface.alpha).toBe(1);
        expect(surface.blend).toBe(false);
        expect(surface.ready).toBe(true);
        expect(surface.sizes.length).toBeGreaterThanOrEqual(3);
        expect(Math.max(...surface.sizes)).toBeLessThanOrEqual(1024);
        expect(surface.lightBudget).toBe(state.maxLights);
    }
    expect(state.results[0].max[1]).toBe(1.5);
    expect(state.results[0].collisions).toBe(false);
    expect(state.results[3].max[1]).toBeCloseTo(1.422, 3);
    expect(state.results[4].normal).toBeCloseTo(0.3);

    for (const pose of [
        { name: 'restroom', position: [-13.6, 1.7, -3.5], target: [-16.4, 1.55, -3.7] },
        { name: 'dj-surfaces', position: [3.8, 2.3, -17.3], target: [0, 1, -18.5] },
        { name: 'ceiling', position: [0, 1.7, -9], target: [0, 9.8, -14] }
    ]) {
        await page.evaluate(async pose => {
            const club = window.vrClub;
            club.camera.position.set(...pose.position);
            club.camera.setTarget(new BABYLON.Vector3(...pose.target));
            for (let i = 0; i < 3; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        }, pose);
        await page.locator('#canvas').screenshot({ path: testInfo.outputPath(`${pose.name}.png`) });
    }
    await expectHealthyRuntime(page);
});
