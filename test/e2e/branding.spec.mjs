import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('the built branding variant mounts only its local artwork without changing the venue controls', async ({ page }) => {
    const ade = process.env.VRCLUB_BRANDING === 'ade';
    const artworkRequests = [];
    page.on('request', request => {
        if (request.url().includes('/branding/')) artworkRequests.push(request.url());
    });
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        const branding = club._venueBranding;
        return {
            selected: document.documentElement.dataset.branding ?? 'nocturne',
            count: branding?._meshes.length ?? 0,
            textures: branding?._textures.map(texture => texture.getSize()) ?? [],
            materials: branding?._materials.map(material => ({
                unlit: material.disableLighting, alpha: material.alpha
            })) ?? [],
            collisions: branding?._meshes.some(mesh => mesh.checkCollisions || mesh.isPickable) ?? false,
            layers: branding?._meshes.map(mesh => mesh.layerMask) ?? [],
            program: club.showDirector.program,
            connected: club.multiplayer?.connected ?? false,
            safe: club.photosensitiveSafeMode,
            baseSign: !!club.scene.getMeshByName('signageGlow'),
            flags: branding?._meshes.some(mesh => mesh.name.includes('EntranceFlag')) ?? false
        };
    });
    expect(result.selected).toBe(ade ? 'ade' : 'nocturne');
    expect(result.count).toBe(ade ? 4 : 0);
    expect(result.collisions).toBe(false);
    expect(result.connected).toBe(false);
    expect(result.baseSign).toBe(true);
    expect(result.program).toBe('nocturne');
    expect(result.flags).toBe(ade);
    if (ade) {
        expect(result.layers).toEqual(Array(4).fill(0x0fffffff));
        expect(result.materials).toEqual(Array(3).fill({ unlit: true, alpha: 1 }));
        expect(result.textures).toHaveLength(3);
        expect(artworkRequests).toHaveLength(1);
        expect(new URL(artworkRequests[0]).origin).toBe(new URL(page.url()).origin);
        const response = await page.request.get('/branding/ade/notice.txt');
        expect(response.ok()).toBe(true);
        expect(await response.text()).toContain('Obtain written permission');
    } else {
        expect(artworkRequests).toEqual([]);
        expect((await page.request.get('/branding/ade/ade26-30y-black.png')).status()).toBe(404);
    }
    await expectHealthyRuntime(page);
    const remaining = await page.evaluate(() => {
        const club = window.vrClub;
        const scene = club.scene;
        club._venueBranding?.dispose();
        return scene.meshes.filter(mesh => mesh.name.startsWith('venueBranding')).length;
    });
    expect(remaining).toBe(0);
});
