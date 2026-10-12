import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('the lounge couch faces the DJ from the entrance wall and two people can sit on it', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    const state = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        for (let i = 0; i < 6; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        const layout = window.VenueLayout.lounge;
        const meshes = club._loungeCouch || [];
        const mesh = meshes[0];
        mesh.computeWorldMatrix(true);
        const box = mesh.getHierarchyBoundingVectors(true);
        const wm = mesh.getWorldMatrix(), p = mesh.getVerticesData('position');
        const v = new BABYLON.Vector3(), o = new BABYLON.Vector3();
        const backs = [], seats = [];
        for (let i = 0; i < p.length; i += 3) {
            v.set(p[i], p[i + 1], p[i + 2]);
            BABYLON.Vector3.TransformCoordinatesToRef(v, wm, o);
            if (o.y > 0.62) backs.push(o.z);
            else if (o.y > 0.3 && o.y < 0.45) seats.push(o.z);
        }
        const mean = a => a.reduce((s, n) => s + n, 0) / a.length;
        const seatsTagged = mesh.metadata.vrclubSeats;
        const sit = club.sitAtSeat(seatsTagged[1]);
        for (let i = 0; i < 20; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        const blocker = club.scene.getMeshByName('loungeCouchBlock');
        const result = {
            min: box.min.asArray(), max: box.max.asArray(), draws: meshes.length,
            backsZ: mean(backs), seatsZ: mean(seats),
            seatsTagged: seatsTagged.map(s => s.id), sit, active: club._activeSeat && club._activeSeat.id,
            blocker: !!blocker && blocker.checkCollisions, ready: mesh.material.getActiveTextures().every(t => t.isReady()),
            lights: mesh.lightSources.map(l => l.name),
            emissive: mesh.material.emissiveColor && mesh.material.emissiveColor.asArray(),
            layout
        };
        club.standFromSeat(false);
        return result;
    });
    console.log('LOUNGE', JSON.stringify(state));
    expect(state.draws).toBe(1);
    expect(state.max[2]).toBeLessThanOrEqual(-0.25);
    expect(state.min[0]).toBeGreaterThan(3.5);
    expect(state.max[0]).toBeLessThan(10.75);
    expect(state.backsZ, 'the backrest must be against the wall, behind the cushions').toBeGreaterThan(state.seatsZ + 0.15);
    expect(state.seatsTagged).toEqual(['lounge-0', 'lounge-1']);
    expect(state.sit).toBe(true);
    expect(state.active).toBe('lounge-1');
    expect(state.blocker).toBe(true);
    expect(state.ready).toBe(true);
    expect(state.lights).not.toContain('loungeLight');
    expect(state.emissive).toEqual([0, 0, 0]);
    await page.evaluate(() => {
        const club = window.vrClub, cam = club.camera;
        club._walkLevel = 0;
        cam.position.set(7.1, 1.65, -4.0);
        cam.setTarget(new BABYLON.Vector3(7.1, 0.7, -0.7));
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/lounge-couch.png' });
    await expectHealthyRuntime(page);
});
