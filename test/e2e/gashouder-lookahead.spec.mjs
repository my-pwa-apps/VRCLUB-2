import { test, expect } from '@playwright/test';
import { expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness({ music: false });

test('Gashouder ahead analysis is opt-in and reads a future window from the playing set', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/?venue=gashouder');
    await expect(page.locator('#enterClubBtn')).toBeVisible();
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.waitForFunction(() => {
        const audio = window.vrClub?.audioElement;
        return audio && !audio.paused && Number.isFinite(audio.duration) && audio.duration > 100 && audio.currentTime > 1;
    }, null, { timeout: 60_000 });

    await page.locator('#vjToggle').click();
    await page.locator('#vjTabShow').click();
    const option = page.locator('#gashouderLookaheadButton');
    await expect(option).toBeVisible();
    await expect(option).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => window.vrClub.isGashouderLookaheadEnabled())).toBe(false);

    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gashouderLookaheadStatus')).toContainText('READY', { timeout: 60_000 });
    await page.locator('#vjMenu [data-open-panel="audioMenu"]').click();
    await expect(page.locator('#audioLookaheadStatus')).toContainText('READY');
    const result = await page.evaluate(() => ({
        program: window.vrClub.showDirector.program,
        enabled: window.vrClub.isGashouderLookaheadEnabled(),
        energy: window.vrClub.getGashouderLookaheadEnergy(),
        status: window.vrClub.getGashouderLookaheadStatus()
    }));
    expect(result).toMatchObject({ program: 'gashouder', enabled: true });
    expect(result.energy).toBeGreaterThanOrEqual(0);
    expect(result.energy).toBeLessThanOrEqual(1);
    expect(result.status).toContain('60 s ahead');
    await page.evaluate(() => window.vrClub.audioElement.pause());
    await expect(page.locator('#audioLookaheadStatus')).toContainText('WAITING FOR PLAYBACK');
    await expectHealthyRuntime(page);
});
