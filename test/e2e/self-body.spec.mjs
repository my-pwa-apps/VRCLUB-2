import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * Your own body is the character in the mirror: one instance, everywhere in the club, sized from its eyes to your eye
 * height, with its head hidden from your own camera (a collapsed bone) and shown only while the mirror renders.
 */
test('the character you chose is your own body, not only your reflection', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const until = async (test, ms = 240000) => { const end = performance.now() + ms; while (!test() && performance.now() < end) await next(); return test(); };
        const out = {};
        out.noneBefore = { double: !!club._mirrorDouble, rigShown: club._localRig ? club._localRig.meshes.some(m => m.isEnabled()) : null };

        club.setLocalCharacter('f3');
        out.built = await until(() => club._mirrorDouble && club._mirrorDouble.shown && club._mirrorDouble.avatarId === 'f3');
        for (let i = 0; i < 10; i++) await next();
        const d = club._mirrorDouble;
        const body = {
            visible: d.meshes.every(m => m.isVisible && m.isEnabled()),
            rigHidden: club._localRig.meshes.every(m => !m.isEnabled()),
            // The character's eyes at the player's eye: its scale times its eye height above the feet.
            eyes: d.eyeRaw * d.node.scaling.x, eyeShown: club._shownBodyEye(),
            atCamera: [d.root.position.x - club.camera.position.x, d.root.position.z - club.camera.position.z].map(Math.abs)
        };
        out.body = body;

        const headScale = () => {
            const bone = d.skeletons[0].bones.find(b => /Head$/.test(b.name));
            const m = bone.getAbsoluteTransform().m;
            return Math.hypot(m[0], m[1], m[2]);
        };
        const tex = club.restroomMirrorTexture;
        out.head = { own: headScale() };
        tex.onBeforeRenderObservable.notifyObservers(tex);
        out.head.reflection = headScale();
        tex.onAfterRenderObservable.notifyObservers(tex);
        out.head.after = headScale();

        // Walking somewhere else in the club (far from the restroom): the body comes along.
        club.camera.position.set(4, 1.7, -9);
        await until(() => Math.hypot(club._mirrorDouble.root.position.x - 4, club._mirrorDouble.root.position.z + 9) < 0.05, 30000);
        out.followed = Math.hypot(club._mirrorDouble.root.position.x - 4, club._mirrorDouble.root.position.z + 9) < 0.05;

        // A taller player: the body grows with them, over a moment.
        club.playerEyeHeight = 1.9;
        club.isInVRMode = true;
        await until(() => Math.abs(club._shownBodyEye() - 1.9) < 0.005, 60000);
        for (let i = 0; i < 5; i++) await next();
        out.tall = { eyes: d.eyeRaw * d.node.scaling.x, shown: club._shownBodyEye() };
        club.isInVRMode = false;
        club.playerEyeHeight = null;

        // No character: the mannequin is the body again, and the character is gone.
        club.setLocalCharacter(null);
        await until(() => !club._mirrorDouble && club._localRig.meshes.some(m => m.isEnabled()), 60000);
        out.noneAfter = { double: !!club._mirrorDouble, rigShown: club._localRig.meshes.some(m => m.isEnabled()) };
        return out;
    });
    expect(result.noneBefore.double).toBe(false);
    expect(result.noneBefore.rigShown).toBe(true);
    expect(result.built).toBe(true);
    expect(result.body.visible, 'the character is drawn in the main view').toBe(true);
    expect(result.body.rigHidden, 'the mannequin steps aside').toBe(true);
    expect(result.body.eyes).toBeCloseTo(result.body.eyeShown, 2);
    expect(result.body.atCamera[0]).toBeLessThan(0.15);
    expect(result.body.atCamera[1]).toBeLessThan(0.15);
    expect(result.head.own, 'your own view has no head round the camera').toBeLessThan(0.01);
    expect(result.head.reflection, 'the mirror pass draws the whole person').toBeGreaterThan(0.5);
    expect(result.head.after, 'and hands the head back to hidden').toBeLessThan(0.01);
    expect(result.followed).toBe(true);
    expect(result.tall.eyes).toBeCloseTo(1.9, 1);
    expect(result.noneAfter).toEqual({ double: false, rigShown: true });
    await expectHealthyRuntime(page);
});
