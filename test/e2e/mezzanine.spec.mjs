import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * Walk with the left stick, inside the page so no frame is lost to a round trip, until the walker passes `limit`
 * in the walking direction or the frames run out.
 */
const walkWithLeftStick = (page, stickY, limit) => page.evaluate(async ([y, stop]) => {
    const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
    const left = window.__iwerDevice.controllers.left;
    const trace = [];
    left.updateAxes('thumbstick', 0, y);
    for (let i = 0; i < 600; i++) {
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        trace.push({ x: cam.position.x, y: cam.position.y, z: cam.position.z, level: club._walkLevel, eye: club._xrHeadHeight() });
        if (y < 0 ? cam.position.z < stop : cam.position.z > stop) break;
    }
    left.updateAxes('thumbstick', 0, 0);
    return trace;
}, [stickY, limit]);

async function enterVRWalking(page) {
    await enterClub(page);
    const vrButton = page.locator('#vrButton');
    await expect(vrButton).toBeEnabled({ timeout: 60_000 });
    await vrButton.click();
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
    await page.evaluate(() => window.vrClub.setVRComfortMode(false));
}

test('a short or seated headset walks the floor and the stair: nothing invisible blocks it', async ({ page }) => {
    test.setTimeout(1_500_000);
    await enterVRWalking(page);
    const HEAD = 1.25;
    await page.evaluate(h => window.__iwerDevice.position.set(0, h, 0), HEAD);
    await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
        for (let i = 0; i < 4; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        cam.position.x = 6; cam.position.z = -4;
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
    });
    const across = await walkWithLeftStick(page, -1, -7);
    const end = across[across.length - 1];
    expect(end.eye).toBeCloseTo(HEAD, 2);
    expect(end.z, `a ${HEAD} m headset stopped at z ${end.z.toFixed(2)} on open floor`).toBeLessThan(-7);

    await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
        cam.position.x = -11.4; cam.position.z = -5.6;
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
    });
    const up = await walkWithLeftStick(page, -1, -12.5);
    const top = up[up.length - 1];
    expect(top.level, `walked to z ${top.z.toFixed(2)} but stood at ${top.level}`).toBe(3);
    expect(top.y - top.eye).toBeCloseTo(3, 1);
    await expectHealthyRuntime(page);
});

test('the steel mezzanine is built, lit by its own accent, climbable and fenced', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const state = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        const scene = club.scene;
        const layout = window.MezzanineLayout;
        const byName = name => scene.getMeshByName(name);
        const slots = mesh => mesh.lightSources.slice(0, club.maxLights).map(light => light.name);
        const camera = club.camera;
        const start = camera.position.clone();
        const startLevel = club._walkLevel;
        const walk = (from, step, count) => {
            camera.position.copyFrom(from);
            for (let i = 0; i < count; i++) {
                camera._collideWithWorld(step);
                scene.onBeforeRenderObservable.notifyObservers(scene);
            }
            return { y: camera.position.y, z: camera.position.z, x: camera.position.x, level: club._walkLevel };
        };

        club._walkLevel = 0;
        const climbed = walk(new BABYLON.Vector3(-11.4, 1.7, -5.6), new BABYLON.Vector3(0, 0, -0.12), 160);
        // From the deck, push at the open edge and at the stair-side rail: the fence must hold.
        club._walkLevel = layout.deck.top;
        const edge = walk(new BABYLON.Vector3(-10.6, 4.8, -14.0), new BABYLON.Vector3(0.12, 0, 0), 80);
        club._walkLevel = 0;
        const beneath = walk(new BABYLON.Vector3(-8, 1.7, -14), new BABYLON.Vector3(-0.12, 0, 0), 80);
        const entranceRoutes = [-6, 6].map(x => walk(new BABYLON.Vector3(x, 1.7, -4), new BABYLON.Vector3(0, 0, -0.1), 30));
        camera.position.copyFrom(start);
        club._walkLevel = startLevel;

        const deck = byName('mezzDeck');
        return {
            built: ['mezzDeck', 'mezzPanel', 'mezzRails', 'mezzBraces', 'mezzGlowCyan'].filter(name => !byName(name)),
            drawsAdded: ['mezzDeck', 'mezzPanel', 'mezzRails', 'mezzBraces', 'mezzGlowCyan'].length,
            deckOpaque: !deck.material.needAlphaBlending() && deck.material.alpha === 1,
            deckTextured: deck.material.getActiveTextures().length >= 2 && deck.material.getActiveTextures().every(texture => texture.isReady()),
            deckSlots: slots(deck),
            roomSlots: slots(byName('leftWall')),
            stools: (club._mezzStools || []).length,
            guest: club.npcAvatars.find(npc => npc.name === 'guest3')?.root.position.y ?? null,
            climbed, edge, beneath, entranceRoutes, top: layout.deck.top, edgeX: layout.deck.x1,
            maxLights: club.maxLights
        };
    });
    expect(state.built).toEqual([]);
    expect(state.deckOpaque).toBe(true);
    expect(state.deckTextured).toBe(true);
    expect(state.deckSlots[0]).toBe('balconyLight');
    expect(state.roomSlots[0]).toBe('ambient');
    expect(state.stools).toBeGreaterThanOrEqual(2);
    // Climbing from the floor carries the eye to the deck, level, and the level is recorded for the body.
    expect(state.climbed.level).toBe(state.top);
    expect(state.climbed.y).toBeGreaterThan(state.top + 1.5);
    expect(state.climbed.y).toBeLessThan(state.top + 2.2);
    // The rail stops a walker at the open edge; the deck is not a way to step into the room.
    expect(state.edge.x).toBeLessThan(state.edgeX);
    expect(state.edge.level).toBe(state.top);
    // Walking beneath the deck stays on the floor.
    expect(state.beneath.level).toBe(0);
    expect(state.beneath.y).toBeLessThan(2);
    for (const route of state.entranceRoutes) expect(route.z).toBeLessThan(-6.5);
    await expectHealthyRuntime(page);
});

/** Quaternion [x, y, z, w] that turns the controller's pointing axis (-z) onto an XR-space direction. */
const aimQuaternion = ([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    const q = [y / l, -x / l, 0, 1 - z / l];
    const n = Math.hypot(...q) || 1;
    return q.map(v => v / n);
};

test('in VR the balcony and its stair can be reached by teleport, stood on, and left', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const vrButton = page.locator('#vrButton');
    await expect(vrButton).toBeEnabled({ timeout: 60_000 });
    await vrButton.click();
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
    const frames = n => page.evaluate(async count => {
        const scene = window.vrClub.scene;
        for (let i = 0; i < count; i++) await new Promise(r => scene.onAfterRenderObservable.addOnce(r));
    }, n);

    const teleportTo = async target => {
        const hand = await page.evaluate(() => {
            const c = window.vrClub._xrControllers.find(ctrl => ctrl.inputSource.handedness === 'right');
            c.pointer.computeWorldMatrix(true);
            return c.pointer.getAbsolutePosition().asArray();
        });
        // The headset faces -z (the stage) and Babylon mirrors x between XR space and the world.
        const d = [target[0] - hand[0], target[1] - hand[1], target[2] - hand[2]];
        await page.evaluate(q => window.__iwerDevice.controllers.right.quaternion.set(...q), aimQuaternion([-d[0], d[1], d[2]]));
        await frames(4);
        await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0, -1));
        await frames(12);
        await page.evaluate(() => window.__iwerDevice.controllers.right.updateAxes('thumbstick', 0, 0));
        await frames(12);
        return page.evaluate(() => new Promise(resolve => {
            const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
            club.scene.onBeforeRenderObservable.addOnce(() => resolve({
                x: cam.position.x, y: cam.position.y, z: cam.position.z, level: club._walkLevel,
                eye: club._xrHeadHeight(), floors: (club.vrHelper.teleportation._floorMeshes || []).map(m => m.name)
            }));
        }));
    };

    // Stand on the dance floor beside the balcony and aim at its deck.
    await page.evaluate(() => {
        const cam = window.vrClub.vrHelper.baseExperience.camera;
        cam.position.x = -7.4; cam.position.z = -14.7;
    });
    await frames(4);
    const onDeck = await teleportTo([-10.8, 3.0, -14.7]);
    expect(onDeck.floors).toContain('mezzDeck');
    expect(onDeck.level, 'the teleport landed on the balcony deck').toBe(3);
    expect(onDeck.y - onDeck.eye).toBeCloseTo(3, 1);
    expect(onDeck.x).toBeLessThan(-9.5);

    // Raise the hand to clear the newly respected solid rail, rather than aim through it.
    await page.evaluate(() => window.__iwerDevice.controllers.right.position.set(0.25, 2.1, 0));
    await frames(4);
    const back = await teleportTo([-3.0, 0, -14.7]);
    expect(back.level).toBe(0);
    expect(back.y - back.eye).toBeCloseTo(0, 1);

    // A tread halfway up the stair is a floor too.
    await page.evaluate(() => {
        const cam = window.vrClub.vrHelper.baseExperience.camera;
        cam.position.x = -11.4; cam.position.z = -5.8;
        window.__iwerDevice.controllers.right.position.set(0.25, 1.25, 0);
    });
    await frames(4);
    const onStair = await teleportTo([-11.4, 1.5, -8.3]);
    expect(onStair.level, 'the teleport landed on the stair').toBeGreaterThan(0.8);
    expect(onStair.level).toBeLessThan(3);
    await expectHealthyRuntime(page);
});

test('in VR with comfort off the stair can be walked up onto the balcony and back down with the thumbstick', async ({ page }) => {
    test.setTimeout(1_500_000);
    await enterVRWalking(page);
    const walk = (stickY, stopZ) => walkWithLeftStick(page, stickY, stopZ);
    // Stand on the floor at the foot of the stair, facing up it (-z, the way the headset faces).
    await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
        cam.position.x = -11.4; cam.position.z = -5.6;
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
    });

    const up = await walk(-1, -12.5);
    const top = up[up.length - 1];
    expect(top.level, `walked to z ${top.z.toFixed(2)} but stood at ${top.level}`).toBe(3);
    expect(top.y - top.eye).toBeCloseTo(3, 1);
    // Every frame of the climb is a step at most, never a jump.
    for (let i = 1; i < up.length; i++) {
        expect(up[i].level - up[i - 1].level).toBeLessThan(0.21);
        expect(up[i].level).toBeGreaterThanOrEqual(up[i - 1].level - 1e-6);
    }

    const down = await walk(1, -5.4);
    await test.info().attach('stair-walk.json', { body: JSON.stringify({ up, down }), contentType: 'application/json' });
    const bottom = down[down.length - 1];
    expect(bottom.level, `walked back to z ${bottom.z.toFixed(2)} but stood at ${bottom.level}`).toBe(0);
    expect(bottom.y - bottom.eye).toBeCloseTo(0, 1);
    for (let i = 1; i < down.length; i++) {
        expect(down[i - 1].level - down[i].level).toBeLessThan(0.21);
        expect(down[i].level).toBeLessThanOrEqual(down[i - 1].level + 1e-6);
    }
    await expectHealthyRuntime(page);
});
