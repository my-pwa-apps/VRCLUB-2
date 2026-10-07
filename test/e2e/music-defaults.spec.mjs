import { test, expect } from '@playwright/test';
import { useQuestHarness } from './support.mjs';

useQuestHarness();

// The shared harness only stores graphics tier and Safe Mode; it leaves the music setting untouched,
// so this runs the real defaults from a clean profile.

test('music plays on entry by default: a Resident episode, announced in the audio menu', async ({ page }) => {
    test.setTimeout(900_000);
    const requests = [];
    page.on('request', request => requests.push(request.url()));

    await page.goto('/');
    const toggle = page.locator('#splashRadioOnEntry');
    await expect(toggle).toBeChecked();
    await expect(page.locator('#splashRadioName')).toContainText('Hernan Cattaneo');
    await expect(page.locator('#splashRadioHost')).toContainText('podcast.hernancattaneo.com');

    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.waitForFunction(() => {
        const audio = window.vrClub.audioElement;
        return audio && !audio.paused && audio.src.includes('mcdn.podbean.com');
    }, null, { timeout: 120_000 });

    expect(requests.some(url => url.startsWith('https://podcast.hernancattaneo.com/feed.xml'))).toBe(true);
    expect(requests.some(url => url.includes('stream.sunshine-live.de'))).toBe(false);
    await expect(page.locator('#audioNowPlaying')).toContainText('E2E Episode');
    await expect(page.locator('#playStreamBtnLabel')).toHaveText('Pause');
    // The episode is never remembered as the guest's own stream.
    expect(await page.evaluate(() => localStorage.getItem('vrclub.lastStreamUrl'))).toBeNull();
});

test('when an episode finishes the next older one plays, in a real audio element', async ({ page }) => {
    test.setTimeout(900_000);
    // Entry picks a random episode; zero picks the newest, so the queue order is known.
    await page.addInitScript(() => { Math.random = () => 0; });
    // 0.6 s of silence at 8 kHz, 8-bit mono: ends quickly. The third episode is long enough to stay.
    const wav = (seconds) => {
        const rate = 8000, samples = Math.round(seconds * rate);
        const buffer = Buffer.alloc(44 + samples, 128);
        buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples, 4); buffer.write('WAVE', 8);
        buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
        buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate, 28); buffer.writeUInt16LE(1, 32);
        buffer.writeUInt16LE(8, 34); buffer.write('data', 36); buffer.writeUInt32LE(samples, 40);
        return buffer;
    };
    const item = (title, name) => `<item><title>${title}</title>`
        + `<enclosure url="https://mcdn.podbean.com/e2e/${name}.mp3" type="audio/mpeg" length="1"/></item>`;
    await page.route('https://podcast.hernancattaneo.com/feed.xml', route => route.fulfill({
        status: 200,
        contentType: 'application/rss+xml',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: `<?xml version="1.0"?><rss><channel><title>Resident</title>${item('Newest', 'e3')}${item('Middle', 'e2')}${item('Oldest', 'e1')}</channel></rss>`
    }));
    await page.route('https://mcdn.podbean.com/**', route => route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: route.request().url().includes('/e1.') ? wav(120) : wav(0.6)
    }));
    await page.addInitScript(() => {
        window.__sources = [];
        const proto = window.HTMLMediaElement.prototype;
        const load = proto.load;
        proto.load = function () {
            if (this.src && !window.__sources.includes(this.src)) window.__sources.push(this.src);
            return load.call(this);
        };
    });

    await page.goto('/');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.waitForFunction(() => window.__sources.some(src => src.includes('/e1.mp3')), null, { timeout: 120_000 });

    expect(await page.evaluate(() => window.__sources.filter(src => src.includes('podbean')).map(src => src.split('/').pop())))
        .toEqual(['e3.mp3', 'e2.mp3', 'e1.mp3']);
    await expect(page.locator('#audioNowPlaying')).toContainText('Oldest');
    // The last, long episode is playing once, not looping.
    expect(await page.evaluate(() => window.vrClub.audioElement.loop)).toBe(false);
});

test('turning music off on the splash connects to nothing and is remembered', async ({ page }) => {
    test.setTimeout(900_000);
    const requests = [];
    page.on('request', request => requests.push(request.url()));

    await page.goto('/');
    const toggle = page.locator('#splashRadioOnEntry');
    await toggle.uncheck();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.radioOnEntry'))).toBe('0');

    await page.reload();
    await expect(page.locator('#splashRadioOnEntry')).not.toBeChecked();
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.waitForTimeout(1500);
    expect(requests.filter(url => /hernancattaneo|podbean|sunshine-live/.test(url))).toEqual([]);
    expect(await page.evaluate(() => Boolean(window.vrClub.audioElement && !window.vrClub.audioElement.paused))).toBe(false);
});
