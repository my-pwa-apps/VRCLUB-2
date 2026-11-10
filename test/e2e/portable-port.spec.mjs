import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();
test.use({ video: 'off' });

test('portable fixture presets, static finishes and shared restroom mechanics render in desktop and XR', async ({ page }) => {
    test.setTimeout(900000);
    await page.addInitScript(() => localStorage.setItem('vrclub.hiddenPeople', 'dancers,bystanders,dj'));
    await enterClub(page);
    const initial = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        await club.scene.whenReadyAsync();
        const f = club.restroomInteractions;
        club.toggleLightControl('cycleSpotBrightness');
        club.toggleLightControl('cycleLaserBrightness');
        club.toggleLightControl('cycleLedBrightness');
        club.toggleLightControl('cycleSheetBrightness');
        club._runVJDeskPreset({ kind: 'presetSave' });
        const saved = club.lightingPresets.slots[0];
        club.spotBrightness = 0;
        club._runVJDeskPreset({ kind: 'presetRecall' });
        f.action('lid', 0, false);
        f.action('tap', 0, true);
        f.action('flush', 0);
        for (let i = 0; i < 90; i++) f.update(1 / 60);
        return {
            saved: !!saved, restored: club.spotBrightness,
            pipes: !!club.scene.getMeshByName('ceilingServicePipes'),
            toilets: f.toilets.length, sinks: f.sinks.length,
            lid: f.state.lids[0], water: f.sinks[0].water.isEnabled(),
            handles: club.scene.meshes.filter(m => /^restroomHandle/.test(m.name) && m.getTotalVertices?.()).length,
            dom: !!document.querySelector('[data-control="cycleSheetBrightness"]'),
            desk: club._vjDesk.panels.find(p => p.id === 'lights').buttons.some(b => b.control === 'cycleSpotBrightness')
        };
    });
    expect(initial.saved).toBe(true);
    expect(initial.restored).toBe(1.5);
    expect(initial.pipes).toBe(true);
    expect(initial.toilets).toBe(2);
    expect(initial.sinks).toBe(2);
    expect(initial.lid).toBe(false);
    expect(initial.water).toBe(true);
    expect(initial.handles).toBe(4);
    expect(initial.dom && initial.desk).toBe(true);
    await enterVR(page);
    const xr = await page.evaluate(() => {
        const c = window.vrClub, camera = c.vrHelper.baseExperience.camera;
        camera.position.z = -30;
        camera._deferOnly = true; camera._deferredUpdated = true;
        camera._deferredPositionUpdate.z = -30;
        c._containLEDWall(camera);
        c.toggleVRQuickMenu(true);
        c._showVRQuickMenuPage('fixtureDetails');
        const first = camera.position.z, queued = camera._deferredPositionUpdate.z;
        camera._deferredUpdated = false;
        const f = c.restroomInteractions, outlet = f.sinks[0];
        f.action('tap', 0, true);
        const old = c._xrControllers;
        c._xrControllers = [{ grip: { absolutePosition: new BABYLON.Vector3(outlet.position.x, (outlet.position.y + outlet.bottom) / 2, outlet.position.z) } }];
        f.update(1 / 72);
        const rinsing = outlet.rinsing;
        c._xrControllers = old;
        return { first, queued, rinsing };
    });
    expect(xr.first).toBeGreaterThan(-21);
    expect(xr.queued).toBe(xr.first);
    expect(xr.rinsing).toBe(true);
    await expectHealthyRuntime(page);
});
