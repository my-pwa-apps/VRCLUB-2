import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

const EPISODE_SECONDS = 180;

/** An 8 kHz 8-bit mono silent wav, served with Range support so the element can really seek. */
const wav = seconds => {
    const rate = 8000, samples = Math.round(seconds * rate);
    const buffer = Buffer.alloc(44 + samples, 128);
    buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples, 4); buffer.write('WAVE', 8);
    buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate, 28); buffer.writeUInt16LE(1, 32);
    buffer.writeUInt16LE(8, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples, 40);
    return buffer;
};

const serveRanged = (route, body) => {
    const range = /^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range || '');
    const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes' };
    if (!range) return route.fulfill({ status: 200, contentType: 'audio/wav', headers, body });
    const start = Number(range[1] || 0);
    const end = Math.min(body.length - 1, range[2] ? Number(range[2]) : body.length - 1);
    return route.fulfill({
        status: 206,
        contentType: 'audio/wav',
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}` },
        body: body.subarray(start, end + 1)
    });
};

/** Range-capable synthetic audio, explicitly chosen by the test user. */
async function routeUserMusic(page) {
    const episode = wav(EPISODE_SECONDS);
    await page.route('https://audio.example/**', route => serveRanged(route, episode));
    await page.addInitScript(() => localStorage.setItem('vrclub.questMusic', JSON.stringify({
        items: [{ url: 'https://audio.example/e2e/set.mp3', name: 'My own set' }], selected: 0
    })));
}

// The DJ choice lives in the Show panel's Club tab, which is closed while Music is open.
const chooseDJ = (page, id) => page.locator('#djStyle').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
}, id);

const playing = (page, needle) => page.waitForFunction(text => {
    const audio = window.vrClub?.audioElement;
    return audio && !audio.paused && audio.src.includes(text) && audio.duration > 100;
}, needle, { timeout: 120_000 });

test('the Audio menu seeks the episode: slider, and the 30 second skips', async ({ page }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await routeUserMusic(page);
    await enterClub(page);
    await playing(page, 'set.mp3');

    await page.locator('#audioToggle').click();
    await expect(page.locator('#audioSeekSection')).toBeVisible();
    await expect(page.locator('#audioSeekTotal')).toHaveText('3:00');
    await page.locator('#audioPlaybackToggle').click();
    await page.waitForFunction(() => window.vrClub.audioElement.paused);

    await page.locator('#audioSeek').evaluate(input => {
        input.value = '500';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 90) < 4);

    await page.locator('#audioSeekForward').click();
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 120) < 4);
    await page.locator('#audioSeekBack').click();
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 90) < 1);
    await page.locator('#audioSeekBack').click();
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 60) < 4);
    await page.locator('#audioPlaybackToggle').click();
    await page.waitForFunction(() => !window.vrClub.audioElement.paused && window.vrClub.audioElement.currentTime >= 60);
    await expectHealthyRuntime(page);
});

test('the VJ desk set player slider seeks a playing set and the headset keeps rendering', async ({ page }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await routeUserMusic(page);
    await enterClub(page);
    await playing(page, 'set.mp3');
    const result = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        if (club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
        const panel = club._vjDesk.panels.find(item => item.id === 'transport');
        const seek = window.VJDeskLayout.buttons.transport.find(button => button.id === 'seek');
        const track = window.VJDeskLayout.seekTrack(seek.rect);
        // A pick on the slider's track, built from canvas pixels like a controller ray's hit point.
        const pickAt = fraction => {
            const x = track.left + (track.right - track.left) * fraction;
            const local = new BABYLON.Vector3((x / panel.canvas.width - 0.5) * panel.width, (0.5 - track.y / panel.canvas.height) * panel.depth, 0);
            return { hit: true, pickedMesh: panel.mesh, pickedPoint: BABYLON.Vector3.TransformCoordinates(local, panel.mesh.getWorldMatrix()) };
        };
        const errors = [];
        const framesBefore = club.engine.frameId;
        try {
            club.scene.onPointerDown(null, pickAt(0.25));
            club.scene.onPointerMove(null, pickAt(0.5));
            club.scene.onPointerUp();
        } catch (error) { errors.push(error.message); }
        await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        return { errors, advanced: club.engine.frameId > framesBefore, time: club.audioElement.currentTime, duration: club.audioElement.duration };
    });
    expect(result.errors).toEqual([]);
    expect(result.advanced, 'the display stopped rendering after the seek').toBe(true);
    expect(Math.abs(result.time - result.duration / 2), 'the slider did not seek the set').toBeLessThan(5);
    await expectHealthyRuntime(page);
});

test('pasting a second link while a set plays offers Play now and Save to my sets, and neither disturbs the other', async ({ page }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await routeUserMusic(page);
    await enterClub(page);
    await playing(page, 'set.mp3');
    await page.locator('#audioToggle').click();

    // The set that is playing says so and is not a Pause button.
    await expect(page.locator('#playStreamBtn')).toHaveText('Playing now');
    await expect(page.locator('#playStreamBtn')).toBeDisabled();
    await expect(page.locator('#saveStreamBtn')).toBeDisabled();

    // A new link: both choices appear with a plain-language note.
    await page.locator('#streamUrl').fill('https://audio.example/e2e/later.mp3');
    await expect(page.locator('#playStreamBtn')).toHaveText('Play now');
    await expect(page.locator('#playStreamBtn')).toBeEnabled();
    await expect(page.locator('#saveStreamBtn')).toHaveText('Save to my sets');
    await expect(page.locator('#saveStreamBtn')).toBeEnabled();
    await expect(page.locator('#audioLinkNote')).toContainText('keeps the current set playing');

    // Saving keeps the current set playing and adds the link to the list.
    await page.locator('#setName').fill('For later');
    await page.locator('#saveStreamBtn').click();
    await expect(page.locator('#savedSets option')).toHaveCount(2);
    expect(await page.evaluate(() => window.vrClub.audioElement.src)).toContain('set.mp3');
    expect(await page.evaluate(() => window.vrClub.audioElement.paused)).toBe(false);
    await expect(page.locator('#saveStreamBtn')).toHaveText('Saved in my sets');
    await expect(page.locator('#playStreamBtn')).toHaveText('Play this set');

    // Starting it is one press.
    await page.locator('#playStreamBtn').click();
    await playing(page, 'later.mp3');
    await expect(page.locator('#playStreamBtn')).toHaveText('Playing now');
    await expectHealthyRuntime(page);
});

test('user links save and restore; generic DJ selection is independent of the music', async ({ page }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await routeUserMusic(page);
    // A historical preference must never restore an artist catalogue.
    await page.addInitScript(() => localStorage.setItem('vrclub.podcast', 'colourizon'));
    await enterClub(page);
    await playing(page, 'set.mp3');
    await page.waitForFunction(() => window.vrClub._djId === 'male', null, { timeout: 120_000 });

    await page.locator('#audioToggle').click();
    await page.locator('#streamUrl').fill('https://audio.example/e2e/second.mp3');
    await page.locator('#setName').fill('Second set');
    await page.locator('#playStreamBtn').click();
    await playing(page, 'second.mp3');
    await expect(page.locator('#savedSets option')).toHaveCount(2);
    await chooseDJ(page, 'female');
    await page.waitForFunction(() => window.vrClub._djId === 'female', null, { timeout: 120_000 });
    expect(await page.evaluate(() => localStorage.getItem('vrclub.questDJ'))).toBe('female');
    await chooseDJ(page, 'male');
    await page.waitForFunction(() => window.vrClub._djId === 'male', null, { timeout: 120_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vrclub.questMusic')).items[1].name)).toBe('Second set');
    expect(await page.evaluate(() => window.vrClub.audioElement.src)).toContain('second.mp3');
    await expectHealthyRuntime(page);
});

/** Quaternion [x, y, z, w] that turns the controller's pointing axis (-z) onto `direction`. */
const aimQuaternion = direction => {
    const length = Math.hypot(...direction);
    const [dx, dy, dz] = direction.map(v => v / length);
    const q = [dy, -dx, 0, 1 - dz];
    const norm = Math.hypot(...q) || 1;
    return q.map(v => v / norm);
};

test('the VR Music page seeks by clicking the bar with the controller ray', async ({ page }) => {
    test.setTimeout(240_000);
    page.setDefaultTimeout(30_000);
    await routeUserMusic(page);
    await enterClub(page);
    await playing(page, 'set.mp3');
    await page.evaluate(() => window.vrClub.toggleAudioPlayback());
    await enterVR(page);
    await page.evaluate(() => window.vrClub.toggleVRQuickMenu(true));
    await page.evaluate(() => window.vrClub._showVRQuickMenuPage('music'));
    await renderFrames(page, 8);

    const hand = await page.evaluate(() => {
        const club = window.vrClub;
        const id = club.vrHelper.pointerSelection._attachedController;
        return club._xrControllers.find(controller => controller.uniqueId === id).inputSource.handedness;
    });
    const aim = await page.evaluate(({ side, fraction }) => {
        const club = window.vrClub;
        const { left, right, width } = window.VRClubUI.VR_SEEK_BAR_PX;
        const seek = club._vrSeek;
        const localX = (((left + fraction * (right - left)) / width) - 0.5) * seek.width;
        seek.mesh.computeWorldMatrix(true);
        const world = BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(localX, 0, 0), seek.mesh.getWorldMatrix());
        const p = window.__iwerDevice.controllers[side].position;
        // XR local-floor space is mirrored in x and offset in z against the world, as in vr-session.spec.
        return { target: [-world.x, world.y, world.z + 12], origin: [p.x, p.y, p.z] };
    }, { side: hand, fraction: 0.25 });
    const direction = aim.target.map((value, axis) => value - aim.origin[axis]);
    await page.evaluate(([side, q]) => window.__iwerDevice.controllers[side].quaternion.set(...q), [hand, aimQuaternion(direction)]);
    await renderFrames(page, 6);
    await page.evaluate(side => window.__iwerDevice.controllers[side].updateButtonValue('trigger', 1), hand);
    await renderFrames(page, 4);
    await page.evaluate(side => window.__iwerDevice.controllers[side].updateButtonValue('trigger', 0), hand);
    await renderFrames(page, 6);

    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 45) < 5);
    await expectHealthyRuntime(page);
});
