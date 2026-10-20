import { test, expect } from '@playwright/test';
import { enterClub, enterVR, exitVR, useQuestHarness } from './support.mjs';

useQuestHarness();

test('desktop wardrobe previews, saves and cancels without leaking its scene', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabClub').click();

    const trigger = page.locator('#editPersonalAvatar');
    await expect(trigger).toBeVisible();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Personal wardrobe' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('canvas')).toHaveAttribute('aria-label', /Rotating 3D preview/);
    await expect(dialog.getByLabel('Base character')).toBeVisible();
    await expect(dialog.locator('select[name="hair"]')).toBeVisible();
    await expect(dialog.locator('select[name="outfit"]')).toBeVisible();
    await expect(dialog.getByLabel('Top color')).toBeVisible();
    await expect(dialog).toContainText('does not upload a photo');
    await page.waitForFunction(() => !!window.vrClub.avatarEditor?.preview);

    await dialog.getByLabel('Base character').selectOption('m1');
    await page.waitForFunction(() => window.vrClub.avatarEditor.previewBase === 'm1');
    await dialog.locator('select[name="hair"]').selectOption('short');
    await dialog.locator('select[name="outfit"]').selectOption('smart');
    await dialog.getByLabel('Top color').evaluate(input => {
        input.value = '#4d7ec2';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.screenshot({ path: 'test-results/personal-wardrobe-desktop.png' });
    await dialog.getByRole('button', { name: 'Save appearance' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vrclub.personalAppearance')));
    expect(saved).toMatchObject({ v: 1, base: 'm1', hair: 'short', outfit: 'smart', top: '#4d7ec2' });
    expect(await page.evaluate(() => {
        const editor = window.vrClub.avatarEditor;
        return !editor.scene && !editor.engine && !editor.preview;
    })).toBe(true);

    await trigger.click();
    const reopened = page.getByRole('dialog', { name: 'Personal wardrobe' });
    await expect(reopened.getByLabel('Base character')).toHaveValue('m1');
    await reopened.getByLabel('Top color').evaluate(input => {
        input.value = '#c5465b';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(reopened).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.personalAppearance'))).toBe(JSON.stringify(saved));
    await trigger.click();
    const resetDialog = page.getByRole('dialog', { name: 'Personal wardrobe' });
    await resetDialog.getByRole('button', { name: 'Reset personal appearance' }).click();
    await expect(resetDialog).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.personalAppearance'))).toBeNull();
});

test('in-headset wardrobe offers paged choices and disposes its preview on cancel', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await enterVR(page);
    await page.evaluate(() => {
        const club = window.vrClub;
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage('me');
        const edit = club._vrQuickMenuPageDefinitions('me').find(item => item.target === 'appearanceEditor');
        club._activateVRQuickMenuButton(edit);
    });
    await page.waitForFunction(() => !!window.vrClub.avatarEditor?.vrPreview);
    const previewState = await page.evaluate(() => {
        const editor = window.vrClub.avatarEditor;
        return {
            page: window.vrClub._vrQuickMenuPage,
            parentIsMenu: editor.vrAnchor.parent === window.vrClub._vrQuickMenuRoot,
            layerMask: editor.vrPreview.root.layerMask,
            expectedMask: window.VRClubUI.MENU_LAYER_MASK,
            lightIsScoped: !!editor.vrPreviewLight?.includedOnlyMeshes?.length,
            swatchesFit: editor.getVRDefinitions('appearanceSkin').length <= 12
        };
    });
    expect(previewState).toMatchObject({
        page: 'appearanceEditor',
        parentIsMenu: true,
        expectedMask: previewState.layerMask,
        lightIsScoped: true,
        swatchesFit: true
    });

    await page.evaluate(() => {
        const club = window.vrClub;
        const editor = club.avatarEditor;
        editor.vrColorPage.skin = 2;
        club._showVRQuickMenuPage('appearanceSkin');
        const swatch = editor.getVRDefinitions('appearanceSkin').find(item =>
            item.action === 'appearanceSet' && item.value === '#79533d');
        club._activateVRQuickMenuButton(swatch);
    });
    await expect.poll(() => page.evaluate(() => window.vrClub.avatarEditor.vrDraft.skin)).toBe('#79533d');
    await page.evaluate(() => {
        const club = window.vrClub;
        const back = club.avatarEditor.getVRDefinitions('appearanceSkin').find(item => item.action === 'back');
        club._activateVRQuickMenuButton(back);
    });
    expect(await page.evaluate(() => ({
        page: window.vrClub._vrQuickMenuPage, skin: window.vrClub.avatarEditor.vrDraft.skin
    }))).toEqual({ page: 'appearanceEditor', skin: '#79533d' });
    await page.screenshot({ path: 'test-results/personal-wardrobe-vr.png' });
    await page.evaluate(() => window.vrClub._activateVRQuickMenuButton({ action: 'appearanceCancel' }));
    await expect.poll(() => page.evaluate(() => window.vrClub.avatarEditor.vrPreview === null &&
        window.vrClub.avatarEditor.vrAnchor === null)).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('vrclub.personalAppearance'))).toBeNull();

    await page.evaluate(() => {
        const club = window.vrClub;
        const edit = club._vrQuickMenuPageDefinitions('me').find(item => item.target === 'appearanceEditor');
        club._activateVRQuickMenuButton(edit);
    });
    await page.waitForFunction(() => !!window.vrClub.avatarEditor?.vrPreview);
    await page.evaluate(() => {
        const club = window.vrClub;
        const editor = club.avatarEditor;
        editor.vrBasePage = 1;
        club._showVRQuickMenuPage('appearanceBase');
        const base = editor.getVRDefinitions('appearanceBase').find(item =>
            item.action === 'appearanceSet' && item.value === 'm1');
        club._activateVRQuickMenuButton(base);
    });
    await page.waitForFunction(() => window.vrClub.avatarEditor.vrPreviewBase === 'm1');
    await page.evaluate(() => window.vrClub._activateVRQuickMenuButton({ action: 'appearanceSave' }));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('vrclub.personalAppearance') || 'null')?.base === 'm1');
    expect(await page.evaluate(() => window.vrClub.avatarEditor.vrPreview === null &&
        window.vrClub.avatarEditor.vrAnchor === null)).toBe(true);
    await page.evaluate(() => {
        const club = window.vrClub;
        club._activateVRQuickMenuButton(club._vrQuickMenuPageDefinitions('me').find(item => item.target === 'appearanceEditor'));
    });
    await page.waitForFunction(() => !!window.vrClub.avatarEditor?.vrPreview);
    await exitVR(page);
    expect(await page.evaluate(() => {
        const club = window.vrClub;
        return !club.avatarEditor.vrPreview && !club.avatarEditor.vrAnchor && !club.avatarEditor.vrPreviewLight &&
            club.scene.materials.every(material => material.maxSimultaneousLights === undefined ||
                material.disableLighting || material.maxSimultaneousLights <= club.maxLights);
    })).toBe(true);
});

test('phone wardrobe keeps close and save reachable, traps focus and explains storage failures without losing the draft', async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await enterClub(page);
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabClub').click();
    await page.locator('#editPersonalAvatar').click();
    const dialog = page.getByRole('dialog', { name: 'Personal wardrobe' });
    await page.waitForFunction(() => !!window.vrClub.avatarEditor?.preview);
    await dialog.getByLabel('Bottom color').evaluate(input => {
        input.value = '#4e9c76';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const close = dialog.getByRole('button', { name: 'Close wardrobe' });
    const save = dialog.getByRole('button', { name: 'Save appearance' });
    await expect(close).toBeInViewport();
    await expect(save).toBeInViewport();
    const panel = await dialog.locator('.avatar-editor__panel').boundingBox();
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(375);
    await save.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.evaluate(() => {
        window.__wardrobeSetItem = window.Storage.prototype.setItem;
        window.Storage.prototype.setItem = function(key, value) {
            if (key === 'vrclub.personalAppearance') throw new Error('Phone storage is blocked');
            return window.__wardrobeSetItem.call(this, key, value);
        };
    });
    await save.click();
    await expect(dialog.getByRole('alert')).toContainText('Phone storage is blocked');
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => window.vrClub.avatarEditor.draft.bottom)).toBe('#4e9c76');
    await page.screenshot({ path: 'test-results/personal-wardrobe-phone.png' });
    await page.evaluate(() => { window.Storage.prototype.setItem = window.__wardrobeSetItem; delete window.__wardrobeSetItem; });
    await save.click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vrclub.personalAppearance')).bottom)).toBe('#4e9c76');
});
