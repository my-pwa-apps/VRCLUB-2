import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('desktop and phone panels retain consistent state, keyboard navigation and dialog boundaries', async ({ page }) => {
    page.setDefaultTimeout(20_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.engine.stopRenderLoop());
    for (const viewport of [{ width: 1280, height: 720 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(viewport);
        const hint = page.locator('#firstRunHint');
        await expect(hint).toBeVisible();
        const hintBounds = await hint.boundingBox();
        expect(hintBounds.x).toBeGreaterThanOrEqual(0);
        expect(hintBounds.x + hintBounds.width).toBeLessThanOrEqual(viewport.width);
        const musicBounds = await page.locator('#audioToggle').boundingBox();
        expect(hintBounds.y + hintBounds.height).toBeLessThanOrEqual(musicBounds.y);
        for (const [prefix, label] of [['vj', 'Show and Lights'], ['audio', 'Music'], ['network', 'Online']]) {
            await page.locator(`#${prefix}Toggle`).click();
            const panel = page.locator(`#${prefix}Menu`);
            const minimize = page.locator(`#${prefix}Minimize`);
            await expect(panel).toBeVisible();
            await expect(hint).toBeHidden();
            await minimize.click();
            await expect(minimize).toHaveAttribute('aria-expanded', 'false');
            await expect(minimize).toHaveAccessibleName(`Expand ${label} panel`);
            await page.locator(`#${prefix}Close`).click();
            await page.locator(`#${prefix}Toggle`).click();
            await expect(minimize).toHaveAttribute('aria-expanded', 'true');
            await expect(minimize).toHaveAccessibleName(`Minimize ${label} panel`);
            await expect(minimize).toHaveAttribute('title', 'Minimize');
            await expect(minimize.locator('span')).toHaveText('\u2212');
            const bounds = await panel.boundingBox();
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
            await page.keyboard.press('Escape');
            await expect(panel).toBeHidden();
            await expect(page.locator(`#${prefix}Toggle`)).toBeFocused();
        }
    }

    await page.locator('#vjToggle').click();
    await page.locator('#vjTabShow').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#vjTabClub')).toBeFocused();
    await expect(page.locator('#vjTabClub')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#vjTabShow')).toBeFocused();
    await page.locator('#vjMenu [data-open-panel="audioMenu"]').click();
    await expect(page.locator('#vjMenu')).toBeHidden();
    await page.locator('#audioSourceTabLink').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#audioSourceTabLive')).toBeFocused();
    await expect(page.locator('#audioSourceLive')).toBeVisible();
    await expect(page.locator('#liveInputUploadGlb')).toHaveText('Upload custom .GLB avatar');
    const announcements = await page.evaluate(async () => {
        const input = window.vrClub.liveInput;
        const previous = { status: input.status, signal: input.signal };
        const nodes = ['Status', 'Signal', 'Format', 'Monitor', 'PerformDJ', 'Go']
            .map(key => document.getElementById(`liveInput${key}`));
        const mutations = [];
        const observer = new window.MutationObserver(records => mutations.push(...records.map(record => record.target.id)));
        for (const node of nodes) observer.observe(node, { childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
        input._changed(); input._changed();
        await Promise.resolve();
        const unchanged = [...mutations];
        mutations.length = 0;
        input.status = 'Audio input status changed.';
        input.signal = 'Audio signal changed.';
        input._changed(); input._changed();
        await Promise.resolve();
        const changed = [...mutations];
        observer.disconnect();
        input.status = previous.status;
        input.signal = previous.signal;
        input._changed();
        return { unchanged, changed };
    });
    expect(announcements.unchanged).toEqual([]);
    expect(announcements.changed).toEqual(['liveInputStatus', 'liveInputSignal']);
    await page.keyboard.press('Home');
    await expect(page.locator('#audioSourceTabLink')).toBeFocused();
    await page.locator('#streamUrl').focus();
    const outline = await page.locator('#streamUrl').evaluate(input => ({
        width: getComputedStyle(input).outlineWidth,
        style: getComputedStyle(input).outlineStyle
    }));
    expect(outline).toEqual({ width: '3px', style: 'solid' });

    await page.evaluate(() => {
        const club = window.vrClub;
        const jump = club.jumpDesktop;
        window.__polishRestoreJump = () => { club.jumpDesktop = jump; };
        window.__polishJumps = 0;
        club.jumpDesktop = () => { window.__polishJumps++; };
        window.VRPayment.showGate();
    });
    await expect(page.locator('.payment-dialog')).toBeVisible();
    await page.keyboard.press('e');
    expect(await page.evaluate(() => window.__polishJumps)).toBe(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.payment-dialog')).toBeHidden();
    await expect(page.locator('#audioMenu')).toBeVisible();
    await page.evaluate(() => { window.__polishRestoreJump(); delete window.__polishRestoreJump; delete window.__polishJumps; });
    await expectHealthyRuntime(page);
});
