import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterClub } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';
import { useQuestHarness } from './support.mjs';

useQuestHarness();

const LABEL = process.env.SHOT_LABEL || 'bar';

test(`shot: the bar (${LABEL})`, async ({ page }) => {
    test.setTimeout(900_000);
    mkdirSync('tmp-shots/bar', { recursive: true });
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.showDirector.enabled = false;
        club.vjManualMode = true;
        // The bar is lit warmly only by its own props; give the capture some ambient so the guests read.
        club.scene.environmentIntensity = 4;
        club.scene.imageProcessingConfiguration.exposure = 3;
    });
    await page.evaluate(() => window.vrClub.setGraphicsTier('ultra'));
    const info = await page.evaluate(() => {
        const club = window.vrClub;
        return club.npcAvatars.filter(npc => /guest|dancer[5-9]/.test(npc.name)).map(npc => ({
            name: npc.name, enabled: npc.root.isEnabled(), anim: npc.animations.map(g => g.name),
            meshes: npc.meshes.length,
            pos: [npc.root.position.x, npc.root.position.y, npc.root.position.z].map(v => +v.toFixed(2))
        }));
    });
    console.log('CREW', JSON.stringify(info));
    const views = {
        rightPair: { pos: [5.6, 1.7, -8.0], target: [9.6, 1.2, -7.9] },
        rightWide: { pos: [3.0, 2.2, -4.0], target: [9.6, 1.0, -9.0] },
        leftWall: { pos: [-5.5, 1.7, -8.5], target: [-9.7, 1.2, -8.5] },
        nod: { pos: [4.0, 1.7, -9.0], target: [8.6, 1.2, -12.8] },
        phone: { pos: [-5.5, 1.7, -4.8], target: [-9.8, 1.2, -6.4] },
        floorGuests: { pos: [-2.0, 2.0, -8.0], target: [-8.5, 1.2, -13.0] },
        dancer: { pos: [-1.0, 1.7, -9.0], target: [-1.4, 1.2, -13.0] }
    };    for (const [name, view] of Object.entries(views)) {
        await page.evaluate(v => {
            const club = window.vrClub;
            club.camera.position.set(...v.pos);
            club.camera.setTarget(new BABYLON.Vector3(...v.target));
            club.camera.fov = 0.9;
        }, view);
        await renderFrames(page, 40);
        writeFileSync(`tmp-shots/bar/${LABEL}-${name}.png`, await page.locator('canvas#canvas').screenshot());
    }
    console.log('DRAWS', await page.evaluate(() => {
        const scene = window.vrClub.scene;
        const active = scene.getActiveMeshes();
        let n = 0;
        for (let i = 0; i < active.length; i++) n += active.data[i].subMeshes ? active.data[i].subMeshes.length : 1;
        return n;
    }));
});
