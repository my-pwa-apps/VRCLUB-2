import { test, expect } from '@playwright/test';
import { enterClub, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

/** The per-frame cost drivers: draw calls, texture memory, and oversize textures. */
const snapshotBudget = page => page.evaluate(() => {
    const club = window.vrClub;
    const scene = club.scene;
    let draws = 0;
    for (const mesh of scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length)) {
        draws += mesh.subMeshes ? mesh.subMeshes.length : 1;
    }
    let bytes = 0, oversize = 0, huge = 0;
    for (const texture of scene.textures) {
        if (!texture.getSize || !texture.isReady() || texture.isCube || texture.isRenderTarget) continue;
        const { width, height } = texture.getSize();
        bytes += width * height * 4 * (texture.noMipmap ? 1 : 4 / 3);
        if (width >= 2048) oversize++;
        if (width >= 4096) huge++;
    }
    return {
        draws,
        ledWallMeshes: scene.meshes.filter(mesh => /^ledPanel_/.test(mesh.name)).length,
        ledPanels: club.ledPanels.length,
        signage: ['signageGlow', 'signagePlates', 'stepLights'].map(name => !!scene.getMeshByName(name)),
        oldSignMeshes: scene.meshes.filter(mesh => /^(neonSign|exitSign|exitHousing)\d|^stepLight_/.test(mesh.name)).length,
        contactShadows: club._contactShadows ? club._contactShadows.mesh.thinInstanceCount : 0,
        enabledCharacters: club.npcAvatars.filter(npc => npc.root.isEnabled()).length,
        guests: club.npcAvatars.filter(npc => npc.name.startsWith('guest') && npc.root.isEnabled()).length,
        // Every enabled character: a skinned mesh per primitive, so this is its draw-call cost.
        mostDrawsPerCharacter: Math.max(...club.npcAvatars.filter(npc => npc.root.isEnabled()).map(npc => npc.meshes.length)),
        gpuTextureMB: Math.round(bytes / 1048576),
        texturesAtLeast2048: oversize,
        texturesAtLeast4096: huge
    };
});

test('the club stays inside its draw-call and texture-memory budget', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await renderFrames(page, 20);
    const budget = await snapshotBudget(page);
    console.log('BUDGET', JSON.stringify(budget));

    // The wall is one mesh fed by a 21x10 texture, not one plane per panel.
    expect(budget.ledPanels).toBe(210);
    expect(budget.ledWallMeshes).toBe(1);
    // Signs are two merged meshes sharing one atlas; every enabled character has a contact shadow (one draw).
    expect(budget.signage).toEqual([true, true, true]);
    expect(budget.oldSignMeshes).toBe(0);
    expect(budget.contactShadows).toBe(budget.enabledCharacters);
    // The balanced tier seats two guests (the talking pair); each GLB character is merged to a handful of meshes.
    expect(budget.guests).toBe(2);
    expect(budget.mostDrawsPerCharacter).toBeLessThanOrEqual(6);
    // No 4096 textures: a Quest shares ~6 GB with the OS and every texture carries a mip chain.
    expect(budget.texturesAtLeast4096).toBe(0);
    expect(budget.texturesAtLeast2048).toBeLessThanOrEqual(8);
    expect(budget.gpuTextureMB).toBeLessThanOrEqual(400);
    // 564 draws when the wall was 210 planes; 355 with it merged; 347 now with the characters merged and two guests added (entrance view).
    expect(budget.draws).toBeLessThanOrEqual(400);
});
