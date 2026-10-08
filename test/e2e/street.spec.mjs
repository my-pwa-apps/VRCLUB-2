import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

/** 60 s of mono white noise: broadband, so any low-pass shows up as a change in where its energy sits. */
function noiseWav(seconds = 60, sampleRate = 22050) {
    const samples = seconds * sampleRate;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples * 2, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round((Math.random() * 2 - 1) * 9000), 44 + i * 2);
    return buffer;
}

const waitForStreet = page => page.waitForFunction(() => window.vrClub?._streetDoor?.open === true, null, { timeout: 180_000 });

/** Puts the desktop camera somewhere (standing on whatever surface is there) and gives the club a few frames to react. */
const stand = async (page, x, z, yawDegrees = 0, frames = 6) => {
    await page.evaluate(([px, pz, yaw]) => {
        const club = window.vrClub;
        const level = club._walkSurfaceLevel(px, pz, 0);
        club._walkLevel = level;
        club.camera.position.set(px, level + 1.7, pz);
        const r = yaw * Math.PI / 180;
        club.camera.setTarget(new BABYLON.Vector3(px + Math.sin(r), level + 1.7, pz + Math.cos(r)));
    }, [x, z, yawDegrees]);
    await renderFrames(page, frames);
};

/** Walks the real FreeCamera, collisions and all, by feeding its per-frame displacement. */
const walk = (page, [dx, dz], frames) => page.evaluate(async ([direction, count]) => {
    const club = window.vrClub;
    for (let i = 0; i < count; i++) {
        club.camera.cameraDirection.x += direction[0];
        club.camera.cameraDirection.z += direction[1];
        await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
    }
    for (let i = 0; i < 4; i++) await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
    const p = club.camera.position;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) };
}, [[dx, dz], frames]);

/**
 * The same walk without rendering (a rendered frame with the street in view takes seconds on SwiftShader): the camera's
 * own collision step, then the walking-surface follow, which is what a frame does to the desktop camera.
 */
const stride = (page, [dx, dz], steps) => page.evaluate(([direction, count]) => {
    const club = window.vrClub, camera = club.camera;
    const step = new BABYLON.Vector3(direction[0], 0, direction[1]);
    for (let i = 0; i < count; i++) {
        camera._collideWithWorld(step);
        club.scene.onBeforeRenderObservable.notifyObservers(club.scene);
    }
    const p = camera.position;
    return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), level: club._walkLevel };
}, [[dx, dz], steps]);

test('the club has a way out: through the street door onto the avenue, stopped by the buildings and the fence', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await waitForStreet(page);

    await test.step('the street is built, lit by its own two lights and sits inside the rendering rules', async () => {
        const city = await page.evaluate(() => {
            const club = window.vrClub;
            const lights = ['cityMoon', 'cityFill'].map(name => club.scene.getLightByName(name));
            return {
                meshes: club._cityMeshes.length,
                materials: club._cityContainer.materials.length,
                lightsScoped: lights.every(light => light && club._cityMeshes.every(mesh => light.includedOnlyMeshes.includes(mesh))
                    && light.includedOnlyMeshes.every(mesh => club._cityMeshes.includes(mesh)
                        || club.npcAvatars.some(npc => (npc.name === 'bouncer' || /^queue/.test(npc.name)) && npc.meshes.includes(mesh)))),
                lightsPrioritised: lights.every(light => light.renderPriority === 1),
                maxLights: club._cityContainer.materials.every(material => material.maxSimultaneousLights === club.maxLights),
                noneFrozen: club._cityContainer.materials.every(material => !material.isFrozen),
                noBlend: club._cityContainer.materials.every(material => material.name === 'decals' || material.transparencyMode === 0),
                doorShut: club.scene.getMeshByName('streetDoorBlock'),
                glassHidden: club._streetDoor.meshes.every(mesh => !mesh.isEnabled()),
                sky: club._citySky.dome.infiniteDistance === true,
                teleportFloors: club._teleportFloorMeshes().length
            };
        });
        expect(city.meshes).toBeGreaterThan(40);
        expect(city.lightsScoped, 'the night lights must reach only the street and the people outside').toBe(true);
        expect(city.lightsPrioritised).toBe(true);
        expect(city.maxLights, 'every street material must obey the device light budget').toBe(true);
        expect(city.noneFrozen).toBe(true);
        expect(city.noBlend, 'VR rejects blended materials').toBe(true);
        expect(city.doorShut, 'the invisible door block must be gone').toBeNull();
        expect(city.glassHidden).toBe(true);
        expect(city.sky).toBe(true);
        expect(city.teleportFloors, 'club floor, balcony deck, vestibule and the street').toBeGreaterThanOrEqual(5);
    });

    await test.step('up the entrance stair and out of the door, under real collisions', async () => {
        const S = await page.evaluate(() => window.VenueLayout.vestibule.streetLevel);
        await stand(page, 0, -2.5, 0, 2);
        const outside = await stride(page, [0, 0.12], 110);
        expect(outside.z, 'the guest never made it up the stair and through the street door').toBeGreaterThan(8);
        expect(Math.abs(outside.x), 'the door should be passed straight').toBeLessThan(1.7);
        expect(outside.level).toBe(S);
        expect(outside.y, 'outside, the guest stands at street level').toBeGreaterThan(S + 1.4);
        expect(outside.y).toBeLessThan(S + 2.1);
        const stopped = await stride(page, [0, 0.3], 60);
        expect(stopped.z, 'the far row of buildings must stop the guest on the far sidewalk').toBeGreaterThan(20);
        expect(stopped.z).toBeLessThan(24.0);
        expect(stopped.y).toBeGreaterThan(S + 1.4);
        // And back: in through the door, down the stair, into the club at floor height.
        await stand(page, 0, 8.5, 180, 2);
        const back = await stride(page, [0, -0.12], 110);
        expect(back.z, 'the guest never made it back down into the club').toBeLessThan(-1);
        expect(back.level).toBe(0);
        expect(back.y, 'back in the club, the eye is at standing height over the floor').toBeLessThan(2.1);
        expect(back.y).toBeGreaterThan(1.3);
    });

    await test.step('the velvet rope keeps a walker out of the queue, and the door stays clear', async () => {
        const S = await page.evaluate(() => window.VenueLayout.vestibule.streetLevel);
        const rope = await page.evaluate(() => window.CityLayout.ropeZ);
        await stand(page, 6, 9.0, 180, 2);
        const intoQueue = await stride(page, [0, -0.12], 30);
        expect(intoQueue.z, 'walked through the rope into the queue').toBeGreaterThan(rope);
        expect(intoQueue.y).toBeGreaterThan(S + 1.4);
        // Nobody stands in the street door: straight in from the pavement is open.
        await stand(page, 0, 9.0, 180, 2);
        const inside = await stride(page, [0, -0.12], 40);
        expect(inside.z).toBeLessThan(5.5);
    });

    await test.step('the avenue is fenced at both ends', async () => {
        await stand(page, 0, 8.7, 270);
        const west = await walk(page, [-0.9, 0], 70);
        expect(west.x).toBeLessThan(-30);
        expect(west.x, 'the end fence must stop the guest inside the bollards').toBeGreaterThan(-45.2);
        // Along the kerb side of the pavement, past the rope line of the queue.
        await stand(page, 0, 8.7, 90);
        const east = await walk(page, [0.9, 0], 70);
        expect(east.x).toBeGreaterThan(30);
        expect(east.x).toBeLessThan(45.2);
    });

    await expectHealthyRuntime(page);
});

test('the street is drawn only while the guest is near the entrance, and the air changes outdoors', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await waitForStreet(page);
    await page.waitForFunction(() => window.vrClub._cityWarm === false, null, { timeout: 120_000 });

    const state = () => page.evaluate(() => {
        const club = window.vrClub;
        const outside = club.npcAvatars.filter(npc => npc.name === 'bouncer' || /^queue\d+$/.test(npc.name));
        return {
            visible: club._cityRoot.isEnabled(),
            active: club.scene.getActiveMeshes().length,
            fog: club.scene.fogDensity,
            exterior: club._exterior,
            people: outside.filter(npc => npc.root.isEnabled()).length,
            peopleAnimating: outside.filter(npc => npc.animations.some(group => group.isPlaying)).length
        };
    });
    // The bouncer and the queue arrive with the street (their files load in the background).
    await page.waitForFunction(() => window.vrClub.npcAvatars.some(npc => npc.name === 'bouncer'), null, { timeout: 180_000 });

    await stand(page, 0, -14, 180, 8);
    const deep = await state();
    expect(deep.visible, 'the street costs nothing deep in the club').toBe(false);
    expect(deep.people, 'nor do the people outside').toBe(0);
    expect(deep.peopleAnimating).toBe(0);

    await stand(page, 0, -5, 0, 8);
    const nearDoor = await state();
    expect(nearDoor.visible, 'the street shows through the doorway near the entrance').toBe(true);
    expect(nearDoor.active).toBeGreaterThan(deep.active);
    expect(nearDoor.people, 'the bouncer and a queue of at least three').toBeGreaterThanOrEqual(4);
    expect(nearDoor.peopleAnimating).toBe(nearDoor.people);

    await stand(page, 0, 9, 0, 80);
    const street = await state();
    expect(street.visible).toBe(true);
    expect(street.exterior).toBeGreaterThan(0.9);
    expect(street.fog, 'the street air is thinner than the club\'s haze').toBeLessThan(deep.fog * 0.8);

    await stand(page, 0, -14, 180, 80);
    const back = await state();
    expect(back.visible).toBe(false);
    expect(back.exterior).toBeLessThan(0.05);
});

test('outside the street door only the low bass of the music is heard', async ({ page }) => {
    test.setTimeout(600_000);
    await page.unroute('https://mcdn.podbean.com/**');
    await page.route('https://mcdn.podbean.com/**', route => route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: noiseWav()
    }));
    await enterClub(page);
    await waitForStreet(page);
    await page.waitForFunction(() => {
        const club = window.vrClub;
        return club.audioContext && club.audioContext.state === 'running' && club.audioSource && !club.audioElement.paused;
    }, null, { timeout: 120_000 });

    await page.evaluate(() => {
        const club = window.vrClub;
        const ctx = club.audioContext;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0;
        club.audioMasterGain.connect(analyser);
        window.__spectrum = { analyser, data: new Float32Array(analyser.frequencyBinCount) };
    });

    /** Where the energy at the master bus sits: its share below 250 Hz, and the overall power. */
    const listen = async (x, z, yaw) => {
        await stand(page, x, z, yaw, 20);
        await page.waitForTimeout(1500); // the filters ease in over ~0.3 s
        return page.evaluate(async () => {
            const { analyser, data } = window.__spectrum;
            const binHz = analyser.context.sampleRate / analyser.fftSize;
            let low = 0, high = 0;
            for (let read = 0; read < 16; read++) {
                await new Promise(resolve => setTimeout(resolve, 50));
                analyser.getFloatFrequencyData(data);
                for (let bin = 1; bin < data.length; bin++) {
                    const power = Math.pow(10, data[bin] / 10);
                    const hz = bin * binHz;
                    if (hz < 250) low += power;
                    else if (hz >= 400) high += power;
                }
            }
            return { lowShare: low / (low + high), power: low + high };
        });
    };

    const room = await listen(0, -12, 180);
    const door = await listen(0, 8.5, 0);
    const avenue = await listen(30, 15, 0);
    console.log(`room ${JSON.stringify(room)} door ${JSON.stringify(door)} avenue ${JSON.stringify(avenue)}`);

    expect(room.power, 'nothing is playing').toBeGreaterThan(0);
    expect(room.lowShare, 'the room hears the whole spectrum').toBeLessThan(0.4);
    expect(door.lowShare, 'on the street the highs must be gone').toBeGreaterThan(0.9);
    expect(avenue.lowShare).toBeGreaterThan(0.9);
    expect(door.power, 'the bass must still be audible at the door').toBeGreaterThan(0);
    expect(avenue.power, 'the bass fades down the avenue').toBeLessThan(door.power);
});

/** Walk with the left stick inside the page (no frame lost to a round trip) until the walker passes `limit` along z. */
const walkWithLeftStick = (page, stickY, limit) => page.evaluate(async ([y, stop]) => {
    const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
    const left = window.__iwerDevice.controllers.left;
    const trace = [];
    left.updateAxes('thumbstick', 0, y);
    for (let i = 0; i < 900; i++) {
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        trace.push({ x: cam.position.x, y: cam.position.y, z: cam.position.z, level: club._walkLevel, eye: club._xrHeadHeight() });
        if (y < 0 ? cam.position.z < stop : cam.position.z > stop) break;
    }
    left.updateAxes('thumbstick', 0, 0);
    return trace;
}, [stickY, limit]);

test('in VR the entrance stair is walked up to the street and back down into the club with the thumbstick', async ({ page }) => {
    test.setTimeout(1_500_000);
    await enterClub(page);
    await waitForStreet(page);
    const vrButton = page.locator('#vrButton');
    await expect(vrButton).toBeEnabled({ timeout: 60_000 });
    await vrButton.click();
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
    await page.evaluate(() => window.vrClub.setVRComfortMode(false));
    const S = await page.evaluate(() => window.VenueLayout.vestibule.streetLevel);

    // In the club in front of the doorway, facing the stage (-z) as the headset does: the stick pulled back walks +z.
    await page.evaluate(async () => {
        const club = window.vrClub, cam = club.vrHelper.baseExperience.camera;
        for (let i = 0; i < 4; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        cam.position.x = 0; cam.position.z = -1.5;
        await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
    });
    const up = await walkWithLeftStick(page, 1, 8.5);
    const top = up[up.length - 1];
    expect(top.z, `walked up to z ${top.z.toFixed(2)} only`).toBeGreaterThan(8.5);
    expect(top.level).toBeCloseTo(S, 3);
    expect(top.y - top.eye, 'out on the pavement the feet are at street level').toBeCloseTo(S, 1);
    // Climbing, the feet rise tread by tread: never a jump of more than a riser or two in one frame.
    for (let i = 1; i < up.length; i++) expect(up[i].y - up[i - 1].y).toBeLessThan(0.4);

    const down = await walkWithLeftStick(page, -1, -1.5);
    const bottom = down[down.length - 1];
    expect(bottom.z, `walked back down to z ${bottom.z.toFixed(2)} only`).toBeLessThan(-1.5);
    expect(bottom.level).toBe(0);
    expect(bottom.y - bottom.eye).toBeCloseTo(0, 1);
    await expectHealthyRuntime(page);
});
