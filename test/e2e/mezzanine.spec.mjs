import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

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
            climbed, edge, beneath, top: layout.deck.top, edgeX: layout.deck.x1,
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
    await expectHealthyRuntime(page);
});
