import { test, expect } from '@playwright/test';
import { useQuestHarness, enterClub, enterVR, expectHealthyRuntime } from './support.mjs';

useQuestHarness();

test('fresh Quest entry contacts no music provider and ignores historical stream preferences', async ({ page }) => {
    test.setTimeout(900_000);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.addInitScript(() => {
        localStorage.setItem('vrclub.podcast', 'colourizon');
        localStorage.setItem('vrclub.lastStreamUrl', 'https://old-music.example/stream.mp3');
    });
    await enterClub(page);
    expect(requests.some(url => /podbean|soundcloud|hernancattaneo|old-music\.example/.test(url))).toBe(false);
    expect(await page.evaluate(() => window.vrClub.musicLibrary.items.length)).toBe(0);
    expect(await page.evaluate(() => window.vrClub.audioElement?.src || '')).toBe('');
    await page.locator('#audioToggle').click();
    await expect(page.locator('#savedSets')).toContainText('No saved sets yet');
    await expect(page.locator('#splashRadioOnEntry')).toHaveCount(0);
    await expectHealthyRuntime(page);
});

test('VR setup and licences return to the panel and allow re-entry', async ({ page }) => {
    test.setTimeout(240_000);
    await test.step('launch setup panel', () => enterClub(page));
    await test.step('first XR entry', () => enterVR(page));
    await page.evaluate(() => { window.vrClub._openQuestPanel('music'); });
    await page.waitForFunction(() => !window.vrClub.isInVRMode, null, { timeout: 30_000 });
    await expect(page.locator('#audioMenu')).toBeVisible();
    await expect(page.locator('#streamUrl')).toBeFocused();
    await page.locator('#audioClose').click();
    await enterVR(page);
    await page.evaluate(() => { window.vrClub._openQuestPanel('credits'); });
    await page.waitForFunction(() => !window.vrClub.isInVRMode, null, { timeout: 30_000 });
    await expect(page.locator('#modelCredits')).toHaveAttribute('open', '');
    await expect(page.locator('#modelCredits')).toContainText('TwoPixels.studio');
    await expect(page.locator('#modelCredits')).toContainText('No music, podcasts or third-party sound recordings');
    await page.locator('#modelCredits summary').click();
    await enterVR(page);
    await expectHealthyRuntime(page);
});

test('VR Comfort is a press-to-enable toggle on the splash and is remembered', async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto('/');
    const comfort = page.locator('#splashVRComfortBtn');
    await expect(comfort).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#splashVRComfortState')).toHaveText('ON');
    await comfort.click();
    await expect(comfort).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#splashVRComfortState')).toHaveText('OFF');
    expect(await page.evaluate(() => localStorage.getItem('vrclub.vrComfort'))).toBe('0');
    await comfort.click();
    await expect(comfort).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => localStorage.getItem('vrclub.vrComfort'))).toBe('1');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    expect(await page.evaluate(() => window.vrClub.vrComfortMode)).toBe(true);
});
