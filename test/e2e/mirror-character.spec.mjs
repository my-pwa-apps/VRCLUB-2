import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// Offline, the restroom mirror shows the character the player chose for themselves, and it is saved.
test('offline, the chosen character is what the restroom mirror shows, and it survives a reload', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub;
        const frame = () => new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        const until = async test => { const end = performance.now() + 60000; while (!test() && performance.now() < end) await frame(); return test(); };
        club.camera.position.set(-14.4, 1.7, -1.72);
        club.camera.setTarget(new BABYLON.Vector3(-12.77, 1.45, -1.72));
        club.setLocalCharacter('m3');
        const first = await until(() => club._mirrorDouble && club._mirrorDouble.avatarId === 'm3');
        club.setLocalCharacter('f3');
        const second = await until(() => club._mirrorDouble && club._mirrorDouble.avatarId === 'f3');
        for (let i = 0; i < 6; i++) await frame();
        const double = club._mirrorDouble, tex = club.restroomMirrorTexture;
        return {
            first, second, saved: localStorage.getItem('vrclub.myCharacter'), style: localStorage.getItem('vrclub.avatarStyle'),
            listed: !!double && double.meshes.every(mesh => tex.renderList.includes(mesh))
        };
    });
    expect(result.first, 'the first choice is built').toBe(true);
    expect(result.second, 'a new choice replaces it').toBe(true);
    expect(result.saved).toBe('f3');
    expect(result.style).toBe('female');
    expect(result.listed).toBe(true);
    await page.reload();
    await enterClub(page);
    expect(await page.evaluate(() => window.vrClub.getLocalCharacter())).toBe('f3');
    await expectHealthyRuntime(page);
});
