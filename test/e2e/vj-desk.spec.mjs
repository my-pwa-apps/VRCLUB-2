import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * The VJ desk at the DJ table, in the real club: from where the person who replaces the DJ stands, a ray at the middle
 * of every button lands on that button (the panel's geometry, its orientation and the pick-to-pixel mapping agree),
 * pressing works through the same path a mouse click or a controller trigger takes, and the panels redraw.
 */
test('the VJ desk: every button is where it is drawn, and presses hand the lights over and back', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        await club.modelLoadPromise;
        const { buttons, config } = window.VJDeskLayout;
        const eye = new BABYLON.Vector3(0, 2.2, -19.4);   // the DJ Booth viewpoint
        const pickAt = (panelId, button) => {
            const panel = club._vjDesk.panels.find(item => item.id === panelId);
            const local = new BABYLON.Vector3(
                ((button.rect.x + button.rect.w / 2) / config.canvas.width - 0.5) * config.width,
                (0.5 - (button.rect.y + button.rect.h / 2) / config.canvas.height) * config.depth,
                0);
            const target = BABYLON.Vector3.TransformCoordinates(local, panel.mesh.getWorldMatrix());
            const ray = new BABYLON.Ray(eye, target.subtract(eye).normalize(), 5);
            return scene.pickWithRay(ray, mesh => mesh.isPickable && mesh.isEnabled() && mesh.isVisible);
        };
        const misses = [];
        for (const panelId of ['show', 'lights']) {
            for (const button of buttons[panelId]) {
                const pick = pickAt(panelId, button);
                const hit = club._vjDeskHit(pick);
                if (!hit || !hit.button || hit.button.id !== button.id) {
                    misses.push(`${button.id} -> ${pick && pick.pickedMesh ? pick.pickedMesh.name : 'nothing'} ${hit && hit.button ? hit.button.id : ''}`);
                }
            }
        }
        // The panel faces the person at the desk (its front, readable side), tilted up from the table.
        const panel = club._vjDesk.panels[0].mesh;
        const facing = panel.getDirection(new BABYLON.Vector3(0, 0, -1));
        const toEye = eye.subtract(panel.getAbsolutePosition()).normalize();

        const press = id => {
            const [panelId, button] = ['show', 'lights'].map(p => [p, buttons[p].find(b => b.id === id)]).find(([, b]) => b);
            return club.pressVJDesk(pickAt(panelId, button));
        };
        const lightsBefore = club.lightsActive;
        press('spots');
        const afterSpots = { lights: club.lightsActive, manual: club.vjManualMode, title: club._vjDeskStatus().title };
        const signatureBefore = club._vjDesk.panels[1].signature;
        club.updateVJDesk({ dt: 1 });
        const redrawn = club._vjDesk.panels[1].signature !== signatureBefore;
        press('auto');
        const afterAuto = { manual: club.vjManualMode, title: club._vjDeskStatus().title };
        const djBefore = club.isPeopleVisible('dj');
        press('dj');
        const djAfter = club.isPeopleVisible('dj');
        press('dj');
        return {
            misses, facingDot: BABYLON.Vector3.Dot(facing, toEye), up: facing.y,
            lightsBefore, afterSpots, redrawn, afterAuto, djBefore, djAfter, djBack: club.isPeopleVisible('dj'),
            meshes: scene.meshes.filter(mesh => /^vjDesk/.test(mesh.name)).map(mesh => mesh.name),
            oldDesk: scene.meshes.filter(mesh => /^toggleBtn_|speedSlider|audioStreamBtn|vjConsole$/.test(mesh.name)).length
        };
    });
    console.log('VJ_DESK', JSON.stringify(result));
    expect(result.misses, 'a ray at a button lands somewhere else').toEqual([]);
    expect(result.facingDot, 'the panel must face the person at the desk').toBeGreaterThan(0.5);
    expect(result.up, 'the panel lies on the table, facing up').toBeGreaterThan(0.6);
    expect(result.afterSpots.lights).toBe(!result.lightsBefore);
    expect(result.afterSpots.manual).toBe(true);
    expect(result.afterSpots.title).toBe('YOU ARE THE VJ');
    expect(result.redrawn, 'the LIGHTS panel did not redraw after a change').toBe(true);
    expect(result.afterAuto).toEqual({ manual: false, title: 'AUTOMATIC SHOW' });
    expect(result.djBefore).toBe(true);
    expect(result.djAfter, 'the RESIDENT DJ button must send the DJ home').toBe(false);
    expect(result.djBack).toBe(true);
    expect(result.meshes.sort()).toEqual(['vjDeskHousing', 'vjDesk_lights', 'vjDesk_show']);
    expect(result.oldDesk, 'the old unlabelled buttons are still in the scene').toBe(0);

    // What the person who replaced the DJ sees, one panel at a time (kept with the test results for review).
    for (const [name, eyeX, lookX] of [['vj-desk-show', -0.75, -1.28], ['vj-desk-lights', 0.75, 1.28]]) {
        await page.evaluate(({ eyeX, lookX }) => {
            const club = window.vrClub;
            if (club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
            club.camera.position.set(eyeX, 2.25, -19.75);
            club.camera.setTarget(new BABYLON.Vector3(lookX, 1.6, -18.65));
            club._vjDesk.dirty = true;
        }, { eyeX, lookX });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
    }
    await page.evaluate(() => { if (!window.vrClub.isPeopleVisible('dj')) window.vrClub.togglePeopleVisible('dj'); });
    await expectHealthyRuntime(page);
});
