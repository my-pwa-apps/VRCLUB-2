import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('the entrance vestibule and the bar are built, lit by their own accents and walkable', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const state = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        const scene = club.scene;
        const byName = name => scene.getMeshByName(name);
        const slots = mesh => mesh.lightSources.slice(0, club.maxLights).map(light => light.name);
        const stool = scene.meshes.find(mesh => /^barStool1_.*metal_stool/.test(mesh.name));
        const bartender = club.npcAvatars.find(npc => npc.name === 'bartender');
        const bottles = byName('barBottles');
        const layout = window.VenueLayout;

        // Walk the real collision system: through the doorway, and into the counter from the floor.
        const camera = club.camera;
        const start = camera.position.clone();
        const push = (from, step, count) => {
            camera.position.copyFrom(from);
            for (let i = 0; i < count; i++) camera._collideWithWorld(step);
            return camera.position.clone();
        };
        const throughDoor = push(new BABYLON.Vector3(0, 1.7, -3), new BABYLON.Vector3(0, 0, 0.25), 60);
        // The stools stop a walker well short of the counter, so the counter's own collision is checked directly.
        const counter = byName('barJoinery');
        const throughStools = push(new BABYLON.Vector3(6, 1.7, -9.9), new BABYLON.Vector3(0.25, 0, 0), 60);
        camera.position.copyFrom(start);

        return {
            counterCollides: counter.checkCollisions && counter.getBoundingInfo().boundingBox.minimumWorld.x < layout.bar.counter.xFront,
            stoolBlocks: scene.meshes.filter(mesh => /^barStoolBlock/.test(mesh.name) && mesh.checkCollisions).length,
            built: ['barJoinery', 'barBottles', 'barBacklight', 'vestibuleWalls', 'vestibuleCarpet', 'vestibuleFrame', 'frontWallLintel']
                .filter(name => !byName(name)),
            bottleCount: bottles.bottleCount,
            bottleTriangles: bottles.getTotalIndices() / 3,
            bottleOpaque: !bottles.material.needAlphaBlending() && bottles.material.alpha === 1,
            bottleColoured: bottles.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind),
            stools: club._barStools.filter(mesh => /metal_stool/.test(mesh.name) || mesh.sourceMesh).length,
            stoolReady: stool.material.getActiveTextures().every(texture => texture.isReady()),
            barSlots: slots(byName('barJoinery')),
            bottleSlots: slots(bottles),
            stoolSlots: slots(stool),
            bartenderSlots: slots(bartender.meshes[0]),
            vestibuleSlots: slots(byName('vestibuleWalls')),
            roomSlots: slots(byName('leftWall')),
            bartender: {
                x: bartender.root.position.x, z: bartender.root.position.z, enabled: bartender.root.isEnabled(),
                animating: bartender.animations.length === 1, reacts: bartender.reactsToBeat
            },
            layout: { counterBack: layout.bar.counter.xBack, backBar: layout.bar.backBar.xFront },
            doorwayZ: throughDoor.z,
            doorwayFar: layout.vestibule.farZ,
            counterX: throughStools.x,
            counterFront: layout.bar.counter.xFront,
            maxLights: club.maxLights
        };
    });
    expect(state.built).toEqual([]);
    expect(state.bottleCount).toBeGreaterThanOrEqual(100);
    expect(state.bottleTriangles).toBeLessThan(60_000);
    expect(state.bottleOpaque).toBe(true);
    expect(state.bottleColoured).toBe(true);
    expect(state.stools).toBeGreaterThanOrEqual(5);
    expect(state.stoolReady).toBe(true);
    // Every bar piece takes the bar light in its first slot; the room keeps its own order.
    for (const slots of [state.barSlots, state.bottleSlots, state.stoolSlots, state.bartenderSlots]) {
        expect(slots[0]).toBe('barLight');
    }
    expect(state.vestibuleSlots[0]).toBe('entranceLight');
    expect(state.roomSlots[0]).toBe('ambient');
    expect(state.bartender.enabled).toBe(true);
    expect(state.bartender.animating).toBe(true);
    expect(state.bartender.reacts).toBe(false);
    expect(state.bartender.x).toBeGreaterThan(state.layout.counterBack);
    expect(state.bartender.x).toBeLessThan(state.layout.backBar);
    // The doorway is open to the vestibule; the counter and the stools stop a walker on the dance-floor side.
    expect(state.doorwayZ).toBeGreaterThan(3);
    expect(state.doorwayZ).toBeLessThan(state.doorwayFar);
    expect(state.counterCollides).toBe(true);
    expect(state.stoolBlocks).toBe(5);
    expect(state.counterX).toBeLessThan(state.counterFront);
    await expectHealthyRuntime(page);
});
