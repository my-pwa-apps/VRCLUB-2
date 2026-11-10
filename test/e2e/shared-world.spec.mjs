import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('desktop keys stay grounded and shared mingler poses survive missing partners and late visibility', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.setGraphicsTier('ultra'));
    await page.waitForFunction(() => window.vrClub._mingler?.poses &&
        window.vrClub._mingler.root.isEnabled() && !window.vrClub._crowdTopUp, null, { timeout: 180_000 });
    await page.evaluate(() => {
        const club = window.vrClub;
        club.engine.stopRenderLoop(club._renderLoop);
        club.engine.getDeltaTime = () => 16.667;
        club.camera._computeLocalCameraSpeed = () => 0.03;
    });
    for (const pitch of [-1.2, 1.2]) {
        await page.evaluate(p => {
            const club = window.vrClub;
            club._walkLevel = 0;
            club.camera.position.set(0, 1.7, -5);
            club.camera.cameraDirection.setAll(0);
            club.camera.rotation.set(p, Math.PI, 0);
        }, pitch);
        await page.keyboard.down('w');
        const walk = await page.evaluate(() => {
            const club = window.vrClub;
            for (let i = 0; i < 30; i++) { club.camera._checkInputs(); club._updateWalkSurface(); }
            return { y: club.camera.position.y, z: club.camera.position.z };
        });
        await page.keyboard.up('w');
        expect(walk.y).toBeCloseTo(1.7, 5);
        expect(walk.z).toBeLessThan(-5.5);
    }
    await page.keyboard.press('e');
    const jump = await page.evaluate(() => {
        const club = window.vrClub;
        let apex = 0;
        for (let i = 0; i < 60; i++) {
            club._updateWalkSurface();
            apex = Math.max(apex, club.camera.position.y - 1.7);
        }
        return { apex, landed: club.camera.position.y, active: club._desktopJump?.active };
    });
    expect(jump.apex).toBeGreaterThan(0.43);
    expect(jump.apex).toBeLessThan(0.46);
    expect(jump.landed).toBeCloseTo(1.7, 5);
    expect(jump.active).toBe(false);
    const shared = await page.evaluate(() => {
        const club = window.vrClub, npc = club._mingler;
        const client = new window.NetworkClient({ serverUrl: 'wss://relay.example' });
        client.status = 'connected';
        client.worldClock = { seed: 44, startedAt: 10000 };
        let seconds = 0;
        client.worldTime = () => seconds;
        club.multiplayer.client = client;
        club._updateMingler(1 / 60);
        const clock = club._sharedMingleClock;
        const positions = [], heights = [], activities = new Set(), visible = new Map();
        for (const person of club.npcAvatars) visible.set(person, person.root.isEnabled());
        const capture = () => ({
            x: npc.root.position.x, y: npc.root.position.y, z: npc.root.position.z,
            yaw: npc.root.rotation.y, phase: npc.mingle.phase, activity: npc.mingle.activity,
            colliderY: npc.collider.position.y, shadowIndex: npc._shadowIndex
        });
        for (const segment of clock.segments) {
            seconds = 5 + segment.start + segment.duration / 2;
            club._updateMingler(1 / 60);
            const before = capture();
            for (const person of club.npcAvatars) if (person !== npc) person.root.setEnabled(false);
            npc.root.setEnabled(false);
            club._updateMingler(1 / 12);
            npc.root.setEnabled(true);
            club._updateMingler(1 / 120);
            const after = capture();
            positions.push(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z));
            heights.push(Math.abs(after.colliderY - (after.y + 0.85)));
            activities.add(after.activity);
            for (const [person, enabled] of visible) person.root.setEnabled(enabled);
        }
        club.multiplayer.client = null;
        return { worstPosition: Math.max(...positions), worstCollider: Math.max(...heights),
            activities: [...activities], period: clock.period, shadowIndex: npc._shadowIndex };
    });
    expect(shared.worstPosition).toBeLessThan(1e-8);
    expect(shared.worstCollider).toBeLessThan(1e-8);
    expect(shared.activities).toEqual(expect.arrayContaining(['walk', 'smoke', 'balcony', 'talk', 'pickup', 'drink', 'return', 'clear']));
    expect(shared.shadowIndex).toBeGreaterThanOrEqual(0);
    await page.evaluate(() => window.vrClub.setGraphicsTier('balanced'));
    await expectHealthyRuntime(page);
});
