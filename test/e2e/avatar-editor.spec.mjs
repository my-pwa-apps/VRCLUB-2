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
    await dialog.locator('select[name="hair"]').selectOption('bald');
    await dialog.locator('select[name="outfit"]').selectOption('casual');
    expect(await page.evaluate(() => window.vrClub.avatarEditor.preview.root.getChildMeshes()
        .some(mesh => mesh.isEnabled() && mesh.metadata?.vrclubPrint))).toBe(true);
    await dialog.locator('select[name="outfit"]').selectOption('smart');
    expect(await page.evaluate(() => window.vrClub.avatarEditor.preview.root.getChildMeshes()
        .some(mesh => mesh.isEnabled() && mesh.metadata?.vrclubPrint))).toBe(false);
    await dialog.getByRole('combobox', { name: 'Glasses', exact: true }).selectOption('star');
    await dialog.getByRole('combobox', { name: 'Facial hair', exact: true }).selectOption('beard');
    await dialog.getByRole('combobox', { name: 'Headwear', exact: true }).selectOption('fedora');
    await expect(dialog.getByRole('combobox', { name: 'Shoes', exact: true })).toHaveValue('original');
    await expect(dialog.getByRole('combobox', { name: 'Legwear', exact: true })).toHaveValue('bare');
    await dialog.getByRole('combobox', { name: 'Shoes', exact: true }).selectOption({ label: 'Pumps' });
    await dialog.getByRole('combobox', { name: 'Legwear', exact: true }).selectOption({ label: 'Sheer nude tights' });
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
    expect(saved).toMatchObject({ v: 3, base: 'm1', hair: 'bald', outfit: 'smart', top: '#4d7ec2',
        glasses: 'star', facialHair: 'beard', hat: 'fedora', shoes: 'pumps', legwear: 'sheer-nude' });
    expect(await page.evaluate(() => {
        const editor = window.vrClub.avatarEditor;
        return !editor.scene && !editor.engine && !editor.preview;
    })).toBe(true);

    await trigger.click();
    const reopened = page.getByRole('dialog', { name: 'Personal wardrobe' });
    await expect(reopened.getByLabel('Base character')).toHaveValue('m1');
    await expect(reopened.getByRole('combobox', { name: 'Glasses', exact: true })).toHaveValue('star');
    await expect(reopened.getByRole('combobox', { name: 'Facial hair', exact: true })).toHaveValue('beard');
    await expect(reopened.getByRole('combobox', { name: 'Headwear', exact: true })).toHaveValue('fedora');
    await expect(reopened.getByRole('combobox', { name: 'Shoes', exact: true })).toHaveValue('pumps');
    await expect(reopened.getByRole('combobox', { name: 'Legwear', exact: true })).toHaveValue('sheer-nude');
    await reopened.getByRole('combobox', { name: 'Shoes', exact: true }).selectOption({ label: 'Heeled ankle boots' });
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
    const accessories = await page.evaluate(() => {
        const club = window.vrClub, editor = club.avatarEditor;
        const pages = ['appearanceEditor', 'appearanceAccessories', 'appearanceGlasses', 'appearanceFacialHair',
            'appearanceHat', 'appearanceHair', 'appearanceOutfit', 'appearanceFootwear', 'appearanceShoes', 'appearanceLegwear'];
        const lengths = pages.map(page => editor.getVRDefinitions(page).length);
        const facialHairOptions = editor.getVRDefinitions('appearanceFacialHair')
            .filter(item => item.action === 'appearanceSet').map(item => item.value);
        const headwearOptions = editor.getVRDefinitions('appearanceHat')
            .filter(item => item.action === 'appearanceSet').map(item => item.value);
        for (const [page, value] of [['appearanceOutfit', 'casual'], ['appearanceHair', 'bald'], ['appearanceGlasses', 'heart'],
            ['appearanceFacialHair', 'beard'], ['appearanceHat', 'bucket']]) {
            club._showVRQuickMenuPage(page);
            club._activateVRQuickMenuButton(editor.getVRDefinitions(page).find(item => item.value === value));
        }
        return { lengths, facialHairOptions, headwearOptions, draft: editor.vrDraft,
            print: editor.vrPreview.root.getChildMeshes().find(mesh => mesh.metadata?.vrclubPrint)?.metadata.vrclubPrint,
            visible: editor.vrPreview.root.getChildMeshes()
            .filter(mesh => mesh.isEnabled() && mesh.getTotalVertices()).length };
    });
    expect(accessories.lengths.every(length => length <= 12)).toBe(true);
    expect(accessories.facialHairOptions).toEqual(['none', 'stubble', 'beard']);
    expect(accessories.headwearOptions).toEqual(['none', 'cap', 'beanie', 'fedora', 'bucket']);
    expect(accessories.visible).toBeLessThanOrEqual(6);
    expect(accessories.draft).toMatchObject({ outfit: 'casual', hair: 'bald', glasses: 'heart', facialHair: 'beard', hat: 'bucket' });
    expect(['sound', 'light', 'orbit', 'signal']).toContain(accessories.print);
    const footwear = await page.evaluate(() => {
        const club = window.vrClub, editor = club.avatarEditor;
        club._showVRQuickMenuPage('appearanceAccessories');
        club._activateVRQuickMenuButton(editor.getVRDefinitions('appearanceAccessories')
            .find(button => button.target === 'appearanceFootwear'));
        const heading = club._vrQuickMenuPage;
        for (const [target, value] of [['appearanceShoes', 'heels'], ['appearanceLegwear', 'sheer-black']]) {
            club._activateVRQuickMenuButton(editor.getVRDefinitions('appearanceFootwear').find(button => button.target === target));
            club._activateVRQuickMenuButton(editor.getVRDefinitions(target).find(button => button.value === value));
            club._activateVRQuickMenuButton(editor.getVRDefinitions(target).find(button => button.action === 'back'));
            if (club._vrQuickMenuPage !== 'appearanceFootwear') throw new Error('Footwear choice must return to shoes and tights');
        }
        club._activateVRQuickMenuButton(editor.getVRDefinitions('appearanceFootwear').find(button => button.action === 'back'));
        return { heading, back: club._vrQuickMenuPage, draft: editor.vrDraft };
    });
    expect(footwear).toMatchObject({ heading: 'appearanceFootwear', back: 'appearanceAccessories',
        draft: { v: 3, shoes: 'heels', legwear: 'sheer-black' } });

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
    await page.evaluate(() => {
        const club = window.vrClub, editor = club.avatarEditor;
        for (const [page, value] of [['appearanceShoes', 'loafers'], ['appearanceLegwear', 'sheer-black']]) {
            club._showVRQuickMenuPage(page);
            club._activateVRQuickMenuButton(editor.getVRDefinitions(page).find(button => button.value === value));
        }
    });
    await page.evaluate(() => window.vrClub._activateVRQuickMenuButton({ action: 'appearanceSave' }));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('vrclub.personalAppearance') || 'null')?.base === 'm1');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vrclub.personalAppearance'))))
        .toMatchObject({ v: 3, shoes: 'loafers', legwear: 'sheer-black' });
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
