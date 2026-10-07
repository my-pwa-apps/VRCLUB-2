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

/** Puts the desktop camera somewhere and gives the club a few frames to react (visibility, fog, audio). */
const stand = async (page, x, z, yawDegrees = 0, frames = 6) => {
    await page.evaluate(([px, pz, yaw]) => {
        const club = window.vrClub;
        club.camera.position.set(px, 1.7, pz);
        const r = yaw * Math.PI / 180;
        club.camera.setTarget(new BABYLON.Vector3(px + Math.sin(r), 1.7, pz + Math.cos(r)));
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
                lightsScoped: lights.every(light => light && light.includedOnlyMeshes.length === club._cityMeshes.length),
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
        expect(city.lightsScoped, 'the night lights must reach only the street').toBe(true);
        expect(city.lightsPrioritised).toBe(true);
        expect(city.maxLights, 'every street material must obey the device light budget').toBe(true);
        expect(city.noneFrozen).toBe(true);
        expect(city.noBlend, 'VR rejects blended materials').toBe(true);
        expect(city.doorShut, 'the invisible door block must be gone').toBeNull();
        expect(city.glassHidden).toBe(true);
        expect(city.sky).toBe(true);
        expect(city.teleportFloors, 'club floor, balcony deck, vestibule and the street').toBeGreaterThanOrEqual(5);
    });

    await test.step('walking out of the door under real collisions', async () => {
        await stand(page, 0, 2.5, 0);
        const outside = await walk(page, [0, 0.5], 24);
        expect(outside.z, 'the guest never made it through the street door').toBeGreaterThan(9);
        expect(Math.abs(outside.x), 'the door should be passed straight').toBeLessThan(1.7);
        const stopped = await walk(page, [0, 0.9], 40);
        expect(stopped.z, 'the far row of buildings must stop the guest on the far sidewalk').toBeGreaterThan(20);
        expect(stopped.z).toBeLessThan(24.0);
    });

    await test.step('the avenue is fenced at both ends', async () => {
        await stand(page, 0, 8, 270);
        const west = await walk(page, [-0.9, 0], 70);
        expect(west.x).toBeLessThan(-30);
        expect(west.x, 'the end fence must stop the guest inside the bollards').toBeGreaterThan(-45.2);
        await stand(page, 0, 8, 90);
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
        return {
            visible: club._cityRoot.isEnabled(),
            active: club.scene.getActiveMeshes().length,
            fog: club.scene.fogDensity,
            exterior: club._exterior
        };
    });

    await stand(page, 0, -14, 180, 8);
    const deep = await state();
    expect(deep.visible, 'the street costs nothing deep in the club').toBe(false);

    await stand(page, 0, -5, 0, 8);
    const nearDoor = await state();
    expect(nearDoor.visible, 'the street shows through the doorway near the entrance').toBe(true);
    expect(nearDoor.active).toBeGreaterThan(deep.active);

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
