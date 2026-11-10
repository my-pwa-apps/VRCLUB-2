import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * The FX page's real 3D knobs and crossfader cap, in the real club: they stand on the glass, turn the way a mixer's do
 * (7:30 off, 12 o'clock half, 4:30 full), are not in the way of a ray, reset on A / X or a right-click, tick on the
 * controller that holds them and keep following the controller's ray past the edge of the panel.
 */
test('the FX page has real knobs and a real fader: pointers, resets, ticks and a locked slide', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        await club.modelLoadPromise;
        const next = () => new Promise(r => scene.onAfterRenderObservable.addOnce(r));
        const frames = async n => { for (let i = 0; i < n; i++) { club.updateVJDesk({ dt: 1 / 60 }); await next(); } };
        const { buttons } = window.VJDeskLayout;
        if (club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
        club._vjDeskPlayerPage = 'fx';
        await frames(5);
        const panel = club._vjDesk.panels.find(item => item.id === 'transport');
        const out = {};

        const meshes = scene.meshes.filter(mesh => /^vjDesk(Knob|Fader)/.test(mesh.name));
        out.counts = {
            caps: meshes.filter(mesh => /^vjDeskKnobCap_/.test(mesh.name)).length,
            marks: meshes.filter(mesh => /^vjDeskKnobMark_/.test(mesh.name)).length,
            collars: meshes.filter(mesh => mesh.name === 'vjDeskKnobCollars').length,
            faderCap: meshes.filter(mesh => mesh.name === 'vjDeskFaderCap').length
        };
        out.allEnabled = meshes.every(mesh => mesh.isEnabled());
        out.pickable = meshes.filter(mesh => mesh.isPickable).map(mesh => mesh.name);

        const toWorld = (button, point) => {
            const px = point ? point.x : button.rect.x + button.rect.w / 2, py = point ? point.y : button.rect.y + button.rect.h / 2;
            return BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(
                (px / panel.canvas.width - 0.5) * panel.width, (0.5 - py / panel.canvas.height) * panel.depth, 0), panel.mesh.getWorldMatrix());
        };
        const eye = new BABYLON.Vector3(0, 2.25, -19.6);
        const pickAt = (button, point) => {
            const target = toWorld(button, point);
            return scene.pickWithRay(new BABYLON.Ray(eye, target.subtract(eye).normalize(), 5), mesh => mesh.isPickable && mesh.isEnabled() && mesh.isVisible);
        };
        const echo = buttons.transport.find(b => b.id === 'echo');
        const knob = window.VJDeskLayout.knob(echo.rect);
        out.rayThroughKnob = pickAt(echo, knob).pickedMesh.name;

        // Which way the pointer mark points, in the panel's own frame (x right, y up the panel): off, half, full.
        const inverse = panel.mesh.getWorldMatrix().clone().invert();
        const markAngle = async value => {
            club.setDJEffect('echo', value);
            await frames(90);
            const centre = BABYLON.Vector3.TransformCoordinates(scene.getTransformNodeByName('vjDeskKnob_echo').getAbsolutePosition(), inverse);
            const mark = BABYLON.Vector3.TransformCoordinates(scene.getMeshByName('vjDeskKnobMark_echo').getAbsolutePosition(), inverse);
            return { dx: mark.x - centre.x, dy: mark.y - centre.y };
        };
        out.off = await markAngle(0);
        out.half = await markAngle(0.5);
        out.full = await markAngle(1);

        // The fader cap sits at the level along its slot.
        const faderBtn = buttons.transport.find(b => b.id === 'crossfader');
        const track = window.VJDeskLayout.crossfaderTrack(faderBtn.rect);
        const capLocalX = level => { club.setDJEffect('channel', level); return level; };
        capLocalX(0); await frames(3);
        const capAt = () => BABYLON.Vector3.TransformCoordinates(scene.getMeshByName('vjDeskFaderCap').getAbsolutePosition(), inverse).x;
        out.faderCut = capAt();
        capLocalX(1); await frames(3);
        out.faderFull = capAt();
        out.faderSpan = ((track.right - track.left) / panel.canvas.width) * panel.width;

        // A mouse right-click resets a knob (and the crossfader).
        club.setDJEffect('echo', 0.8);
        club.scene.onPointerDown({ button: 2 }, pickAt(echo, knob));
        out.afterRightClick = club._djEffectsState().echo;
        club.setDJEffect('channel', 0.2);
        club.scene.onPointerDown({ button: 2 }, pickAt(faderBtn));
        out.afterRightClickFader = club._djEffectsState().channel;
        club.scene.onPointerDown({ button: 0 }, pickAt(echo, knob));
        club.releaseVJDesk();

        // A controller: a hand node aimed at a point on the panel, with a motion controller that records its ticks.
        const ticks = [];
        const hand = new BABYLON.TransformNode('testHand', scene);
        const motionController = { pulse: (strength, ms) => { ticks.push([strength, ms]); return Promise.resolve(true); }, getComponent: () => null };
        club._xrControllers = [{ pointer: hand, motionController }];
        const aimAt = world => { hand.position.copyFrom(eye); hand.rotationQuaternion = null; hand.lookAt(world); hand.computeWorldMatrix(true); };
        aimAt(toWorld(echo, knob));
        club.setDJEffect('echo', 0.7);
        out.padResetAimed = club.resetVJDeskFromController(motionController);
        out.afterPadReset = club._djEffectsState().echo;
        out.resetTick = ticks.at(-1);
        aimAt(new BABYLON.Vector3(0, 3, -10));
        out.padResetElsewhere = club.resetVJDeskFromController(motionController);
        club._vjDeskPlayerPage = 'player';
        aimAt(toWorld(echo, knob));
        out.padResetOnPlayerPage = club.resetVJDeskFromController(motionController);
        club._vjDeskPlayerPage = 'fx';

        // Locked slide: grab the crossfader, then sweep the ray far past both edges of the panel.
        ticks.length = 0;
        club.setDJEffect('channel', 0.5);
        const mid = { x: (track.left + track.right) / 2, y: track.y };
        aimAt(toWorld(faderBtn, mid));
        club.pressVJDesk(pickAt(faderBtn, mid));
        out.grabTick = ticks[0];
        out.lockedRay = !!(club._vjDeskDrag && club._vjDeskDrag.ray);
        const farRight = toWorld(faderBtn, { x: track.right + 1500, y: track.y });
        aimAt(farRight); await frames(2);
        out.pastRight = club._djEffectsState().channel;
        const farLeft = toWorld(faderBtn, { x: track.left - 1500, y: track.y });
        aimAt(farLeft); await frames(2);
        out.pastLeft = club._djEffectsState().channel;
        out.stopTicks = ticks.filter(t => t[0] === window.VJDeskLayout.haptic.stop.strength).length;
        club.releaseVJDesk();
        out.releasedDrag = club._vjDeskDrag;
        aimAt(farRight); await frames(2);
        out.afterRelease = club._djEffectsState().channel;
        club._xrControllers = [];
        hand.dispose();

        // Back to the player page: the real controls go away with it.
        club._vjDeskPlayerPage = 'player';
        await frames(3);
        out.hiddenOnPlayer = scene.meshes.filter(mesh => /^vjDesk(Knob|Fader)/.test(mesh.name)).every(mesh => !mesh.isEnabled());
        club.resetDJEffects();
        club._vjDeskPlayerPage = 'fx';
        await frames(3);
        out.backOnFx = scene.getMeshByName('vjDeskFaderCap').isEnabled();
        club._vjDeskPlayerPage = 'player';
        if (!club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
        return out;
    });
    console.log('VJ_DESK_3D', JSON.stringify(result));
    expect(result.counts).toEqual({ caps: 8, marks: 8, collars: 1, faderCap: 1 });
    expect(result.allEnabled).toBe(true);
    expect(result.pickable, 'a ray goes through the knobs and the cap to the panel behind').toEqual([]);
    expect(result.rayThroughKnob).toBe('vjDesk_transport');
    // 7:30 is down and left, 12 o'clock straight up, 4:30 down and right.
    expect(result.off.dx).toBeLessThan(-0.005);
    expect(result.off.dy).toBeLessThan(-0.005);
    expect(Math.abs(result.half.dx)).toBeLessThan(0.002);
    expect(result.half.dy).toBeGreaterThan(0.005);
    expect(result.full.dx).toBeGreaterThan(0.005);
    expect(result.full.dy).toBeLessThan(-0.005);
    expect(result.faderFull - result.faderCut, 'the cap travels the slot').toBeCloseTo(result.faderSpan, 2);
    expect(result.afterRightClick).toBe(0);
    expect(result.afterRightClickFader).toBe(1);
    expect(result.padResetAimed).toBe(true);
    expect(result.afterPadReset).toBe(0);
    expect(result.resetTick).toEqual([0.5, 25]);
    expect(result.padResetElsewhere, 'A / X away from the desk still jumps').toBe(false);
    expect(result.padResetOnPlayerPage, 'A / X on the player page still jumps').toBe(false);
    expect(result.grabTick).toEqual([0.15, 8]);
    expect(result.lockedRay).toBe(true);
    expect(result.pastRight, 'sweeping past the right edge of the glass lands on full').toBe(1);
    expect(result.pastLeft, 'and past the left edge on cut').toBe(0);
    expect(result.stopTicks, 'each end stop was felt').toBeGreaterThanOrEqual(2);
    expect(result.releasedDrag).toBeNull();
    expect(result.afterRelease, 'letting go unlocks it: the ray no longer moves it').toBe(0);
    expect(result.hiddenOnPlayer).toBe(true);
    expect(result.backOnFx).toBe(true);
    await expectHealthyRuntime(page);
});

/** What it looks like from the operator's side (kept with the test results for review). */
test('the FX page picture with the real controls', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        if (club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
        club.camera.position.set(0, 2.75, -19.45);
        club.camera.setTarget(new BABYLON.Vector3(0, 1.55, -18.7));
        // Nobody stands in the picture: the crowd and the player's own default body are put away.
        (club.npcAvatars || []).forEach(npc => npc.root.setEnabled(false));
        if (club._localRig) club._localRig.meshes.forEach(mesh => mesh.setEnabled(false));
        if (club._djPerformer && club._djPerformer.root) club._djPerformer.root.setEnabled(false);
        club._vjDeskPlayerPage = 'fx';
        for (const [effect, value] of [['lowpass', 0.55], ['echo', 0.3], ['reverb', 0.8], ['channel', 0.6]]) club.setDJEffect(effect, value);
        club._vjDesk.dirty = true;
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: test.info().outputPath('vj-desk-fx-3d.png') });
    await page.evaluate(() => { window.vrClub.resetDJEffects(); window.vrClub._vjDeskPlayerPage = 'player'; });
});
