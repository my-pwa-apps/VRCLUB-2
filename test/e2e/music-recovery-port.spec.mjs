import { test, expect } from '@playwright/test';
import { enterClub, useQuestHarness } from './support.mjs';

useQuestHarness();
test.use({ viewport: { width: 800, height: 600 }, video: 'off' });

test('saved-music corruption recovery has DOM and normal/immersive VR parity without unconfirmed writes', async ({ page }) => {
    test.setTimeout(300000);
    await page.addInitScript(() => {
        localStorage.setItem('vrclub.hiddenPeople', 'dancers,bystanders,dj');
        localStorage.setItem('vrclub.welcomeDismissed', '1');
        localStorage.setItem('vrclub.questMusic', '{unreadable');
    });
    await enterClub(page);
    await page.locator('#audioToggle').click();
    await expect(page.locator('#musicRecovery')).toBeVisible();
    await page.locator('#retrySavedSets').click();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.questMusic'))).toBe('{unreadable');
    await page.locator('#resetSavedSets').click();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.questMusic'))).toBe('{unreadable');
    const result = await page.evaluate(() => {
        const club = window.vrClub, states = [];
        club.toggleVRQuickMenu(true);
        const originalImmersive = club._immersive;
        for (const immersive of [false, true]) {
            localStorage.setItem('vrclub.questMusic', '{unreadable');
            club.musicLibrary = new window.MusicLibrary(club, localStorage);
            club._immersive = immersive ? { mode: 'preview', needsAccess: () => false, pageText: () => null } : null;
            const pageName = immersive ? 'musicPhone' : 'musicSources';
            club._showVRQuickMenuPage(pageName);
            const buttons = club._vrQuickMenuPageDefinitions(pageName);
            const retry = buttons.find(button => button?.action === 'retrySavedSets');
            const reset = buttons.find(button => button?.action === 'resetSavedSets');
            club._activateVRQuickMenuButton(retry);
            const afterRetry = localStorage.getItem('vrclub.questMusic');
            club._activateVRQuickMenuButton(reset);
            const first = localStorage.getItem('vrclub.questMusic');
            club._activateVRQuickMenuButton(reset);
            const final = JSON.parse(localStorage.getItem('vrclub.questMusic'));
            states.push({ slots: buttons.length, retry: !!retry, reset: !!reset, afterRetry, first, final });
        }
        club._immersive = originalImmersive;
        club.toggleVRQuickMenu(false);
        return states;
    });
    for (const state of result) {
        expect(state.slots).toBeLessThanOrEqual(12);
        expect(state.retry && state.reset).toBe(true);
        expect(state.afterRetry).toBe('{unreadable');
        expect(state.first).toBe('{unreadable');
        expect(state.final.items).toEqual([]);
        expect(state.final.playbackGeneration).toBeTruthy();
    }
});
