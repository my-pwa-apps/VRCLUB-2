import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * Sitting as your character: on the couch the pelvis is on the cushion (not 48 cm above it, which is what the stool posture
 * did), the head is drawn while the camera is outside it, and standing up and switching character leave a visible body that
 * the mirror still lists.
 */
test('the character sits on the couch, stands up again, and is still there after switching', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const until = async (test, ms = 240000) => { const end = performance.now() + ms; while (!test() && performance.now() < end) await next(); return test(); };
        club.setLocalCharacter('f3');
        await until(() => club._mirrorDouble && club._mirrorDouble.shown);
        const seats = scene.meshes.flatMap(m => (m.metadata && m.metadata.vrclubSeats) || []);
        const couch = seats.find(s => s.id === 'lounge-0'), stool = seats.find(s => /^bar-/.test(s.id) && s.id !== 'bar-1');
        const bone = (d, re) => d.skeletons[0].bones.find(b => re.test(b.name));
        const sit = async seat => {
            club.sitAtSeat(seat);
            for (let i = 0; i < 90; i++) await next();
            const d = club._mirrorDouble;
            return {
                clip: d.current, pelvisAboveSeat: bone(d, /Body$/).getAbsolutePosition().y - (seat.seatY - seat.floorY),
                headShown: d.headShown, rootY: d.root.position.y
            };
        };
        const out = { couch: await sit(couch) };
        club.standFromSeat(false);
        for (let i = 0; i < 60; i++) await next();
        out.stood = { shown: club._mirrorDouble.shown, visible: club._mirrorDouble.meshes.every(m => m.isVisible && m.isEnabled()), clip: club._mirrorDouble.current };
        out.stool = await sit(stool);
        club.standFromSeat(false);

        // Next to the mirror, switch character: the new one is drawn in the main view and listed in the mirror.
        club.camera.position.set(-14.4, 1.7, -1.72);
        club.camera.setTarget(new BABYLON.Vector3(-12.77, 1.45, -1.72));
        for (let i = 0; i < 40; i++) await next();
        club.setLocalCharacter('m4');
        await until(() => club._mirrorDouble && club._mirrorDouble.avatarId === 'm4' && club._mirrorDouble.shown);
        for (let i = 0; i < 40; i++) await next();
        const tex = club.restroomMirrorTexture, d = club._mirrorDouble;
        out.switched = {
            id: d.avatarId, visible: d.meshes.every(m => m.isVisible && m.isEnabled()), listed: d.meshes.every(m => tex.renderList.includes(m)),
            rigHidden: club._localRig.meshes.every(m => !m.isEnabled())
        };
        club.setLocalCharacter(null);
        return out;
    });
    expect(result.couch.clip).toBe('Seated_Low_Loop');
    expect(result.couch.pelvisAboveSeat, 'the pelvis rests on the cushion').toBeGreaterThan(0.04);
    expect(result.couch.pelvisAboveSeat).toBeLessThan(0.2);
    expect(result.couch.headShown, 'the camera sits in front of the sitter, so the head is drawn').toBe(true);
    expect(result.stood).toEqual({ shown: true, visible: true, clip: 'Idle' });
    expect(result.stool.clip, 'a bar stool keeps the stool posture').toBe('Seated_Loop');
    expect(result.switched).toEqual({ id: 'm4', visible: true, listed: true, rigHidden: true });
    await expectHealthyRuntime(page);
});
