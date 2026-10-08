import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';
import { snapshotResourceBudget } from './xr-measure.mjs';

useQuestHarness();

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

    // The wall is one mesh fed by a 21x10 texture, not one plane per panel.
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
    // Active submeshes are the geometry-only proxy; engine submissions include glow, probes and post-process passes.
    expect(desktopBudget.activeSubmeshProxyDraws).toBeLessThanOrEqual(400);
    expect(desktopBudget.engineSceneSubmissionsPerFrame).not.toBeNull();
    expect(desktopBudget.engineSceneSubmissionsPerFrame).toBeGreaterThanOrEqual(desktopBudget.activeSubmeshProxyDraws);
    expect(desktopBudget.engineSceneSubmissionsPerFrame).toBeLessThanOrEqual(400);
    expect(Object.values(desktopBudget.drawsBySubsystem).reduce((sum, draws) => sum + draws, 0))
        .toBe(desktopBudget.activeSubmeshProxyDraws);
    expect(desktopBudget.renderStateInventory.activeMaterials).toBeGreaterThan(0);
    expect(desktopBudget.renderStateInventory.activeTextures).toBeGreaterThan(0);
    expect(desktopBudget.topMeshesByProxyDraws.length).toBeGreaterThan(0);
    expect(desktopBudget.topMaterialsByProxyDraws.length).toBeGreaterThan(0);
    expect(desktopBudget.shadowMaps).toEqual([]);
    expect(desktopBudget.reflectionProbe.refreshRate).toBe(0);

    await enterVR(page);
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
    expect(xrBudget.engineSceneSubmissionsPerFrame).toBeGreaterThanOrEqual(xrBudget.activeSubmeshProxyDraws);
    expect(Object.values(xrBudget.drawsBySubsystem).reduce((sum, draws) => sum + draws, 0))
        .toBe(xrBudget.activeSubmeshProxyDraws);
    expect(xrBudget.shadowMaps).toEqual([]);
    expect(xrBudget.reflectionProbe.refreshRate).toBe(0);
});
