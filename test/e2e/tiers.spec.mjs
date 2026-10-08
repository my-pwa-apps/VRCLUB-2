import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * Every enabled character whose bones did not move over a run of rendered frames. A character hidden by a lower tier and
 * shown again once stayed frozen mid-pose: its clips were paused and never restarted.
 */
const frozenCharacters = page => page.evaluate(async () => {
    const club = window.vrClub;
    const people = club.npcAvatars.filter(npc => npc.root.isEnabled() && npc.animations.length > 0);
    const pose = () => people.map(npc => npc.root.getChildTransformNodes(false)
        .filter(node => node.rotationQuaternion).slice(0, 12)
        .map(node => node.rotationQuaternion.asArray().join(',')).join('|'));
    const before = pose();
    for (let i = 0; i < 20; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(() => resolve()));
    const after = pose();
    return { enabled: people.length, frozen: people.filter((npc, i) => before[i] === after[i]).map(npc => npc.name) };
});

test('lowering and raising the graphics tier brings every character back moving', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(() => { window.vrClub.setGraphicsTier('ultra'); });
    await page.waitForFunction(() => window.vrClub.npcAvatars.filter(npc => /^(dancer|guest)/.test(npc.name) && npc.root.isEnabled()).length >= 22,
        null, { timeout: 300_000 });
    const ultra = await frozenCharacters(page);
    expect(ultra.frozen).toEqual([]);

    await page.evaluate(() => { window.vrClub.setGraphicsTier('balanced'); });
    const balanced = await frozenCharacters(page);
    expect(balanced.enabled).toBeLessThan(ultra.enabled);
    expect(balanced.frozen).toEqual([]);

    await page.evaluate(() => { window.vrClub.setGraphicsTier('ultra'); });
    const again = await frozenCharacters(page);
    expect(again.enabled).toBe(ultra.enabled);
    expect(again.frozen, 'characters shown again by the higher tier must not stand frozen').toEqual([]);
    // Back to the harness's tier (the health check expects it), still with everyone moving.
    await page.evaluate(() => { window.vrClub.setGraphicsTier('balanced'); });
    expect((await frozenCharacters(page)).frozen).toEqual([]);
    await expectHealthyRuntime(page);
});
