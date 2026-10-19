import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness, expectHealthyRuntime, browserFailures } from './support.mjs';

useQuestHarness();

test('a 32-person room keeps only the nearest tier-budgeted skeletons in the real club', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => {
        const club = window.vrClub;
        const client = club.networkManager = new window.NetworkClient();
        client.capacity = 32;
        client.status = 'connected';
        client._send = () => {};
        const manager = club.avatarManager = new window.AvatarManager(club);
        manager.setPersonalSpace(false);
        club.camera.position.set(-8, 1.7, -8);
        for (let i = 0; i < 31; i++) {
            const x = i < 8 ? -8 : i < 20 ? 8 : 30;
            manager.updatePeerState(`load${i}`, `Guest ${i + 1}`,
                { x, y: 1.7, z: -8 - (i % 4) * 0.4, rotY: 0 }, { avatar: i % 2 ? 'm1' : 'f1' });
        }
    });
    const details = () => page.evaluate(() => window.vrClub.avatarManager.getDiagnostics());
    try {
        await expect.poll(async () => (await details()).detailedAvatars, { timeout: 60_000 }).toBe(6);
    } catch (error) {
        console.log('SCALING_FAILURE', JSON.stringify({
            errors: browserFailures.get(page)?.slice(-10),
            scene: await page.evaluate(() => ({
                capacity: window.vrClub.networkManager?.capacity,
                poseTime: window.vrClub.avatarManager._poseTime,
                detailAt: window.vrClub.avatarManager._detailAt,
                camera: window.vrClub.camera.position.asArray()
            }))
        }));
        throw error;
    }
    expect((await details()).participants).toBe(32);
    expect((await details()).fallbackAvatars).toBe(25);
    const left = await page.evaluate(() => [...window.vrClub.avatarManager.remotes.values()]
        .filter(peer => peer.person).map(peer => peer.id));
    await page.evaluate(() => window.vrClub.camera.position.x = 8);
    await expect.poll(() => page.evaluate(() => [...window.vrClub.avatarManager.remotes.values()]
        .filter(peer => peer.person && Number(peer.id.slice(4)) < 8).length), { timeout: 60_000 }).toBe(0);
    await expect.poll(async () => (await details()).detailedAvatars, { timeout: 60_000 }).toBe(6);
    const right = await page.evaluate(() => [...window.vrClub.avatarManager.remotes.values()]
        .filter(peer => peer.person).map(peer => peer.id));
    expect(right.some(id => left.includes(id))).toBe(false);
    await enterVR(page);
    await page.evaluate(() => {
        const club = window.vrClub;
        club.vrHelper.baseExperience.camera.position.set(8, 1.7, -8);
        club.graphicsTier = 'high';
    });
    await expect.poll(async () => (await details()).detailedAvatars, { timeout: 60_000 }).toBe(10);
    expect((await details()).participants).toBe(32);
    console.log('SCALING_XR', JSON.stringify(await details()));
    await page.evaluate(() => window.vrClub.graphicsTier = 'balanced');
    await expect.poll(async () => (await details()).detailedAvatars).toBe(6);
    await expectHealthyRuntime(page);
});
