import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';
import { fileURLToPath } from 'node:url';

useQuestHarness();

test('an exact character replaces the online body, reaches other guests and persists across reconnects', async ({ page, context }) => {
    test.setTimeout(900_000);
    const room = new ClubRoom({});
    await context.routeWebSocket(/vrclub-network\.garfieldapp\.workers\.dev/, route => {
        const params = new URL(route.url()).searchParams;
        const socket = {
            accept() {}, addEventListener() {},
            send: data => route.send(data), close: (code, reason) => route.close({ code, reason })
        };
        const session = room._acceptSession(socket, params.get('name'), null, params.get('avatars') || 'any',
            params.get('poseBatch') === '1', null, params.get('avatar'));
        route.onMessage(data => room._onMessage(socket, session, { data }));
        route.onClose(() => room._onClose(socket, session));
    });
    const observer = await context.newPage();
    try {
        await observer.route('**/character-observer-test', route => route.fulfill({
            contentType: 'text/html', body: '<p>Appearance observer</p>'
        }));
        await observer.goto('/character-observer-test');
        await observer.addScriptTag({ path: fileURLToPath(new URL('../../js/networkClient.js', import.meta.url)) });
        await observer.evaluate(() => {
            window.characterObserver = new window.NetworkClient({
                serverUrl: 'wss://vrclub-network.garfieldapp.workers.dev', room: 'private-appearance', name: 'Observer', avatar: 'm9'
            });
            window.characterObserver.connect();
        });
        await observer.waitForFunction(() => window.characterObserver.connected);
        await enterClub(page);
        await page.evaluate(() => window.vrClub.modelLoadPromise);
        await page.locator('#vjToggle').click();
        await page.locator('#vjTabClub').click();
        await page.locator('#myCharacter').selectOption('f3');
        await page.evaluate(() => window.vrClub.multiplayer.connect({ room: 'private-appearance', name: 'Chooser' }));
        const bodyIs = id => page.waitForFunction(id => {
            const club = window.vrClub;
            return club.multiplayer.selfAvatar === id && club._mirrorDouble?.avatarId === id && club._mirrorDouble.shown;
        }, id, { timeout: 180_000 });
        const observerSees = id => observer.waitForFunction(id =>
            [...window.characterObserver.peers.values()].some(peer => peer.name === 'Chooser' && peer.avatar === id), id);
        await bodyIs('f3');
        await observerSees('f3');
        await page.locator('#myCharacter').selectOption('m7');
        await bodyIs('m7');
        await observerSees('m7');
        expect(await page.evaluate(() => localStorage.getItem('vrclub.myCharacter'))).toBe('m7');

        // The receiver replaces a real remote body too, not only its protocol record.
        await observer.evaluate(() => window.characterObserver.requestAvatar('any', 'f2'));
        await page.waitForFunction(() => [...window.vrClub.multiplayer.manager.remotes.values()]
            .some(peer => peer.name === 'Observer' && peer.avatarId === 'f2' && peer.person), null, { timeout: 180_000 });
        expect(await page.evaluate(() => window.vrClub._localRig.meshes.every(mesh => !mesh.isEnabled()))).toBe(true);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await page.evaluate(() => window.vrClub.multiplayer.connect({ room: 'private-appearance', name: 'Chooser' }));
        await bodyIs('m7');
        await observerSees('m7');
        // New page startup reads the persisted selection, not the previous club instance.
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await enterClub(page);
        await page.evaluate(() => window.vrClub.multiplayer.connect({ room: 'private-appearance', name: 'Chooser' }));
        await bodyIs('m7');
        await observerSees('m7');
        await page.evaluate(() => window.vrClub.multiplayer.rerollAvatar());
        await page.waitForFunction(() => {
            const club = window.vrClub;
            return club.multiplayer.selfAvatar !== 'm7' && club._mirrorDouble?.avatarId === club.multiplayer.selfAvatar;
        }, null, { timeout: 180_000 });
        expect(await page.evaluate(() => localStorage.getItem('vrclub.myCharacter'))).toBeNull();
        await expectHealthyRuntime(page);
    } finally {
        await page.evaluate(() => window.vrClub?.multiplayer?.disconnect());
        await observer.close();
        clearInterval(room._sweeper);
    }
});

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
            // The root stands a little behind the camera (the eyes are forward of the body); the EYES are at the camera.
            atCamera: [d.root.position.x - club.camera.position.x, d.root.position.z - club.camera.position.z].map(Math.abs),
            eyesAtCamera: [d.eyeNow.x - club.camera.position.x, d.eyeNow.z - club.camera.position.z].map(Math.abs),
            eyeAligned: d.eyeAligned
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
        const eyeAt = () => Math.hypot(club._mirrorDouble.eyeNow.x - 4, club._mirrorDouble.eyeNow.z + 9);
        await until(() => eyeAt() < 0.05, 30000);
        out.followed = eyeAt() < 0.05;

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
    expect(result.body.eyeAligned, 'standing, the eyes are locked to the camera').toBe(true);
    expect(result.body.eyesAtCamera[0]).toBeLessThan(0.03);
    expect(result.body.eyesAtCamera[1]).toBeLessThan(0.03);
    expect(result.body.atCamera[0]).toBeLessThan(0.3);
    expect(result.body.atCamera[1]).toBeLessThan(0.3);
    expect(result.head.own, 'your own view has no head round the camera').toBeLessThan(0.01);
    expect(result.head.reflection, 'the mirror pass draws the whole person').toBeGreaterThan(0.5);
    expect(result.head.after, 'and hands the head back to hidden').toBeLessThan(0.01);
    expect(result.followed).toBe(true);
    expect(result.tall.eyes).toBeCloseTo(1.9, 1);
    expect(result.noneAfter).toEqual({ double: false, rigShown: true });
    await expectHealthyRuntime(page);
});
