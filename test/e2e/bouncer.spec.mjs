import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('the bouncer has readable face and clothing contrast in both character styles', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.camera.position.set(2.8, window.CityLayout.groundY + 1.65, 9.8);
        club.camera.setTarget(new window.BABYLON.Vector3(2.25, window.CityLayout.groundY + 1.2, 6.85));
        club._walkLevel = window.CityLayout.groundY;
    });
    await page.waitForFunction(() => !!window.vrClub._bouncer);
    const measurements = [];
    for (const style of ['quaternius', 'diverse', 'quaternius']) {
        expect(await page.evaluate(style => window.vrClub.setCharacterStyle(style), style)).toBe(true);
        await page.waitForFunction(() => {
            const club = window.vrClub;
            return club._bouncer?.root.isEnabled() && club._bouncer.meshes.every(mesh =>
                !mesh.getTotalVertices() || mesh.isReady(true));
        });
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
            const club = window.vrClub, root = club._bouncer.root;
            // Compare the same face pose, not two different moments of the idle or attention scan.
            club.scene.animationsEnabled = false;
            club._updateBouncer = () => {};
            root.rotation.y = Math.atan2(club.camera.position.x - root.position.x, club.camera.position.z - root.position.z);
        });
        const shippedLight = await page.evaluate(() => {
            const light = window.vrClub._streetDoorLight;
            return { intensity: light.intensity, position: light.position.asArray(),
                oldPosition: [2, window.CityLayout.groundY + 3.2, window.CityLayout.doorZ + 1.3] };
        });
        for (const intensity of [2.4, shippedLight.intensity]) {
            const state = await page.evaluate(async ({ intensity, position }) => {
                const club = window.vrClub, B = window.BABYLON;
                club._streetDoorLight.intensity = intensity;
                club._streetDoorLight.position.copyFromFloats(...position);
                for (let i = 0; i < 5; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
                const npc = club._bouncer;
                const bounds = npc.root.getHierarchyBoundingVectors(true);
                // The standing bounds include the tall hair silhouette; the face sits below it.
                const faceY = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.83;
                const point = B.Vector3.Project(new B.Vector3(npc.root.position.x, faceY, npc.root.position.z),
                    B.Matrix.Identity(), club.scene.getTransformMatrix(), club.camera.viewport.toGlobal(club.engine.getRenderWidth(), club.engine.getRenderHeight()));
                const hit = club.scene.pick(point.x, point.y, mesh => npc.meshes.includes(mesh));
                return { x: point.x, y: point.y, faceHit: !!hit?.hit, budget: club.maxLights, lights: npc.meshes.filter(mesh => mesh.getTotalVertices()).map(mesh =>
                    mesh.lightSources.slice(0, mesh.material.maxSimultaneousLights).map(light => light.name)),
                materials: npc.meshes.filter(mesh => mesh.material).map(mesh => ({
                    emission: mesh.material.emissiveColor.asArray(), maxLights: mesh.material.maxSimultaneousLights
                })) };
            }, { intensity, position: intensity === 2.4 ? shippedLight.oldPosition : shippedLight.position });
            const shot = await page.screenshot({ path: `test-results/bouncer-${style}-${intensity}.png` });
            const meta = await sharp(shot).metadata();
            const left = Math.max(0, Math.round(state.x - 10)), top = Math.max(0, Math.round(state.y - 10));
            const pixels = await sharp(shot).extract({ left, top, width: Math.min(20, meta.width - left), height: Math.min(20, meta.height - top) })
                .removeAlpha().raw().toBuffer();
            const levels = [];
            for (let i = 0; i < pixels.length; i += 3) levels.push((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
            levels.sort((a, b) => a - b);
            measurements.push({ style, intensity, mean: levels.reduce((a, b) => a + b) / levels.length,
                p90: levels[Math.floor(levels.length * 0.9)], ...state });
        }
    }
    console.log('BOUNCER_VISIBILITY', JSON.stringify(measurements));
    for (const measurement of measurements) {
        expect(measurement.faceHit, 'the sampled face region must actually hit the bouncer').toBe(true);
        expect(measurement.lights.every(names => names.includes('streetDoorLight'))).toBe(true);
        expect(measurement.lights.every(names => names.includes('cityFill'))).toBe(true);
        expect(measurement.materials.every(material => material.maxLights === measurement.budget &&
            material.emission.every(value => value === 0))).toBe(true);
    }
    for (let i = 0; i < measurements.length; i += 2) {
        const before = measurements[i], after = measurements[i + 1];
        expect(after.intensity).toBe(24);
        expect(after.mean, `${after.style}: the face is readable without changing skin`).toBeGreaterThan(25);
        expect(after.mean / before.mean, `${after.style}: entrance light must improve the actual face, not just the background`).toBeGreaterThan(1.1);
        expect(after.p90, 'facial highlights must not blow out').toBeLessThan(180);
    }
    await expectHealthyRuntime(page);
});
