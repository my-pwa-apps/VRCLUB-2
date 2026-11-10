import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';
import { snapshotResourceBudget } from './xr-measure.mjs';

useQuestHarness();

test('pinspot hardware and grounding shadows remain batched on desktop and in XR', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    for (const immersive of [false, true]) {
        if (immersive) await enterVR(page, { floorPosition: [0, 0, -12] });
        const state = await page.evaluate(() => {
            const club = window.vrClub;
            club.takeLightControl();
            club.mirrorBallActive = true;
            club.masterIntensity = 1;
            const frame = { time: 4, dt: 1 / 72, dtScale: 60 / 72 };
            club.updateMirrorBall(frame);
            const hardware = ['mirrorSpotTrussClamps', 'mirrorSpotRiggingMounts', 'mirrorSpotBezelMerged']
                .map(name => club.scene.getMeshByName(name));
            const facet = club.mirrorBall.material.emissiveColor;
            const lit = facet.r + facet.g + facet.b;
            club.masterIntensity = 0;
            club.updateMirrorBall(frame);
            const dark = [facet.r, facet.g, facet.b];
            club.masterIntensity = 1;
            club.updateMirrorBall(frame);
            return {
                hardware: hardware.map(mesh => ({ present: !!mesh, draws: mesh?.subMeshes.length })),
                standaloneHardware: club.scene.meshes.filter(mesh => /^mirror(?:Bezel|FixtureBase)\d/.test(mesh.name)).length,
                venueDraws: club._venueContactShadows.mesh.subMeshes.length,
                characterDraws: club._contactShadows.mesh.subMeshes.length,
                venueCount: club._venueContactShadows.mesh.thinInstanceCount,
                characterCount: club._contactShadows.mesh.thinInstanceCount,
                lit, dark, restored: facet.r + facet.g + facet.b,
                mutableFacets: !club.mirrorBall.material.isFrozen,
                realPinspotLights: club.mirrorBallSpotlights.filter(Boolean).length,
                shadowMaps: club.scene.lights.filter(light => light.getShadowGenerator()).length
            };
        });
        expect(state.hardware).toEqual(Array.from({ length: 3 }, () => ({ present: true, draws: 1 })));
        expect(state.standaloneHardware).toBe(0);
        expect(state.venueDraws).toBe(1);
        expect(state.characterDraws).toBe(1);
        expect(state.venueCount).toBeGreaterThanOrEqual(25);
        expect(state.characterCount).toBeGreaterThan(0);
        expect(state.lit).toBeGreaterThan(0);
        expect(state.dark).toEqual([0, 0, 0]);
        expect(state.restored).toBeGreaterThan(0);
        expect(state.mutableFacets).toBe(true);
        expect(state.realPinspotLights).toBe(0);
        expect(state.shadowMaps).toBe(0);
    }
});

/** Holds the cue and palette still so the resource snapshot does not drift under NOCTURNE. */
const pinBudgetCue = page => page.evaluate(() => {
    const club = window.vrClub;
    const look = club.showDirector.looks.firstLight;
    look.hue = 0.1;
    look.colorLock = true;
    club.showDirector._applyCue({ look: 'firstLight', bars: 1024 });
});

test('the club stays inside its render-submission and texture-budget ceilings', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await pinBudgetCue(page);
    const desktopBudget = await snapshotResourceBudget(page, 20);
    console.log('BUDGET_DESKTOP', JSON.stringify(desktopBudget));

    // The 210 physical tiles share one mesh and one uniform-colour texel each.
    expect(desktopBudget.ledPanels).toBe(210);
    expect(desktopBudget.ledWallMeshes).toBe(1);
    // Signs are two merged meshes sharing one atlas; every enabled character has a contact shadow.
    expect(desktopBudget.signage).toEqual([true, true, true]);
    expect(desktopBudget.oldSignMeshes).toBe(0);
    expect(desktopBudget.contactShadows).toBe(desktopBudget.enabledCharacters);
    // The balanced tier seats two guests (the talking pair); each GLB character is merged to a handful of meshes.
    expect(desktopBudget.guests).toBe(2);
    // Six draws per character; the DJ's headphones are a seventh (one mesh, one 512 px texture).
    expect(desktopBudget.mostDrawsPerCharacter).toBeLessThanOrEqual(7);
    // No 4096 ordinary 2D textures: a Quest shares ~6 GB with the OS and every texture carries a mip chain.
    expect(desktopBudget.ordinaryTexturesAtLeast4096).toBe(0);
    expect(desktopBudget.ordinaryTexturesAtLeast2048).toBeLessThanOrEqual(8);
    expect(desktopBudget.ordinaryRgbaTextureEstimateMB).toBeLessThanOrEqual(400);
    expect(desktopBudget.cubeAndRenderTargetRgbaEstimateMB).toBeGreaterThan(0);
    // Active submeshes are a conservative geometry inventory: the engine can cull some of them, while probes and
    // post-process passes can add submissions. Keep independent ceilings rather than assuming either count is larger.
    expect(desktopBudget.activeSubmeshProxyDraws).toBeLessThanOrEqual(400);
    expect(desktopBudget.engineSceneSubmissionsPerFrame).not.toBeNull();
    expect(desktopBudget.engineSceneSubmissionsPerFrame).toBeGreaterThan(0);
    expect(desktopBudget.engineSceneSubmissionsPerFrame).toBeLessThanOrEqual(400);
    expect(Object.values(desktopBudget.drawsBySubsystem).reduce((sum, draws) => sum + draws, 0))
        .toBe(desktopBudget.activeSubmeshProxyDraws);
    expect(desktopBudget.renderStateInventory.activeMaterials).toBeGreaterThan(0);
    expect(desktopBudget.renderStateInventory.activeTextures).toBeGreaterThan(0);
    expect(desktopBudget.topMeshesByProxyDraws.length).toBeGreaterThan(0);
    expect(desktopBudget.topMaterialsByProxyDraws.length).toBeGreaterThan(0);
    expect(desktopBudget.shadowMaps).toEqual([]);
    expect(desktopBudget.reflectionProbe.refreshRate).toBe(0);

    await enterVR(page, { floorPosition: [0, 0, -12] });
    await pinBudgetCue(page);
    const xrBudget = await snapshotResourceBudget(page, 20);
    console.log('BUDGET_XR', JSON.stringify(xrBudget));

    expect(xrBudget.mode).toBe('xr');
    expect(xrBudget.ledPanels).toBe(210);
    expect(xrBudget.ledWallMeshes).toBe(1);
    expect(xrBudget.signage).toEqual([true, true, true]);
    expect(xrBudget.oldSignMeshes).toBe(0);
    expect(xrBudget.contactShadows).toBe(xrBudget.enabledCharacters);
    expect(xrBudget.guests).toBe(2);
    expect(xrBudget.mostDrawsPerCharacter).toBeLessThanOrEqual(7);
    expect(xrBudget.ordinaryTexturesAtLeast4096).toBe(0);
    expect(xrBudget.ordinaryTexturesAtLeast2048).toBeLessThanOrEqual(8);
    expect(xrBudget.ordinaryRgbaTextureEstimateMB).toBeLessThanOrEqual(400);
    expect(xrBudget.cubeAndRenderTargetRgbaEstimateMB).toBeGreaterThan(desktopBudget.cubeAndRenderTargetRgbaEstimateMB);
    expect(xrBudget.renderTargetTextureCount).toBeGreaterThan(desktopBudget.renderTargetTextureCount);
    expect(xrBudget.engineSceneSubmissionsPerFrame).not.toBeNull();
    expect(xrBudget.engineSceneSubmissionsPerFrame).toBeGreaterThan(0);
    expect(Object.values(xrBudget.drawsBySubsystem).reduce((sum, draws) => sum + draws, 0))
        .toBe(xrBudget.activeSubmeshProxyDraws);
    expect(xrBudget.shadowMaps).toEqual([]);
    expect(xrBudget.reflectionProbe.refreshRate).toBe(0);
});
