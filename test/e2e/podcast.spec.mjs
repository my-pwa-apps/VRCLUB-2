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

/** Both podcasts: the Resident feed on its own origin, Colourizon through the relay's /podcast path. */
async function routePodcasts(page) {
    const episode = wav(EPISODE_SECONDS);
    const item = (title, url) => `<item><title>${title}</title><enclosure url="${url}" type="audio/mpeg" length="1"/></item>`;
    const feed = (name, items) => ({
        status: 200,
        contentType: 'application/rss+xml',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `<?xml version="1.0"?><rss><channel><title>${name}</title>${items}</channel></rss>`
    });
    await page.route('https://podcast.hernancattaneo.com/feed.xml', route => route.fulfill(
        feed('Resident', item('Resident Episode', 'https://mcdn.podbean.com/e2e/resident.mp3'))));
    await page.route('https://mcdn.podbean.com/**', route => serveRanged(route, episode));
    await page.route('**/podcast/colourizon/feed.xml', route => route.fulfill(feed('Colourizon', item(
        'Colourizon Episode', 'https://vrclub-network.garfieldapp.workers.dev/podcast/colourizon/stream/123456-missmelera-e2e.mp3'))));
    await page.route('**/podcast/colourizon/stream/**', route => serveRanged(route, episode));
}

const playing = (page, needle) => page.waitForFunction(text => {
    const audio = window.vrClub?.audioElement;
    return audio && !audio.paused && audio.src.includes(text) && audio.duration > 100;
}, needle, { timeout: 120_000 });

test('the Audio menu seeks the episode: slider, and the 30 second skips', async ({ page }) => {
    test.setTimeout(900_000);
    await routePodcasts(page);
    await enterClub(page);
    await playing(page, 'resident.mp3');

    await page.locator('#audioToggle').click();
    await expect(page.locator('#audioSeekSection')).toBeVisible();
    await expect(page.locator('#audioSeekTotal')).toHaveText('3:00');

    await page.locator('#audioSeek').evaluate(input => {
        input.value = '500';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 90) < 4);

    await page.locator('#audioSeekForward').click();
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 120) < 4);
    await page.locator('#audioSeekBack').click();
    await page.locator('#audioSeekBack').click();
    await page.waitForFunction(() => Math.abs(window.vrClub.audioElement.currentTime - 60) < 4);
    await expectHealthyRuntime(page);
});

test('choosing the other podcast swaps the stream and the DJ', async ({ page }) => {
    test.setTimeout(900_000);
    await routePodcasts(page);
    await page.goto('/');
    await page.locator('#splashPodcastColourizon').click();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.podcast'))).toBe('colourizon');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await playing(page, '/podcast/colourizon/stream/');
    await page.waitForFunction(() => window.vrClub._djId === 'melera', null, { timeout: 120_000 });

    await page.locator('#audioToggle').click();
    await page.locator('#podcastResidentBtn').click();
    await playing(page, 'resident.mp3');
    await page.waitForFunction(() => window.vrClub._djId === 'hernan', null, { timeout: 120_000 });
    expect(await page.evaluate(() => localStorage.getItem('vrclub.podcast'))).toBe('resident');
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
    test.setTimeout(900_000);
    await routePodcasts(page);
    await enterClub(page);
    await playing(page, 'resident.mp3');
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
