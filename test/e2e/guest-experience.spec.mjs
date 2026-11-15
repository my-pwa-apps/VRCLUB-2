import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';

useQuestHarness();

test('guest menus and mirror wardrobe draft work inside XR without photo controls', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await page.evaluate(() => window.vrClub.setLocalCharacter('m1'));
    await page.waitForFunction(() => !!window.vrClub._mirrorDouble);
    await enterVR(page);
    const menus = await page.evaluate(() => {
        const club = window.vrClub;
        club.toggleVRQuickMenu(true);
        const names = page => club._vrQuickMenuPageDefinitions(page).filter(Boolean).map(button => button.label);
        club._showVRQuickMenuPage('credits');
        return { home: names('home'), comfort: names('comfort'), graphics: names('graphics'),
            credits: club._vrCreditsLines.join('\n'),
            signs: club._guestTouchpoints.map(entry => entry.mesh.name),
            photoButton: !!document.querySelector('.postcard-toggle'),
            photoCapture: typeof club.capturePostcard };
    });
    expect(menus.home).toContain('WARDROBE');
    expect(menus.home).not.toContain('LIGHTS');
    expect(menus.home).not.toContain('CAMERA');
    expect(menus.comfort).not.toContain('CAMERA');
    expect(menus.photoButton).toBe(false);
    expect(menus.photoCapture).toBe('undefined');
    expect(menus.comfort).not.toContain('HIGH PRECISION SHADERS');
    expect(menus.graphics).toContain('HIGH PRECISION SHADERS');
    expect(menus.credits).toContain('https://');
    expect(menus.signs).toEqual(['tonightBoard', 'mirrorWardrobe']);

    await page.evaluate(() => {
        const club = window.vrClub;
        club._getAvatarEditor().openVR({ mirror: true });
        club._showVRQuickMenuPage('appearanceEditor');
    });
    await page.waitForFunction(() => !!window.vrClub._wardrobeMirrorPreview);
    const draft = await page.evaluate(() => {
        const club = window.vrClub, editor = club.avatarEditor;
        const root = editor.vrPreview.root;
        const before = root.scaling.x;
        for (let i = 0; i < 10; i++) club.scene.onAfterAnimationsObservable.notifyObservers(club.scene);
        return { mirror: editor.mirrorEditing, attachedToMenu: root.parent === club._vrQuickMenuRoot,
            accumulatingScale: before !== root.scaling.x,
            hiddenInWorld: club._wardrobeMirrorPreview.meshes.every(mesh => !mesh.isVisible),
            includedInMirror: club._wardrobeMirrorPreview.meshes.every(mesh => club.restroomMirrorTexture.renderList.includes(mesh)),
            saving: localStorage.getItem('vrclub.personalAppearance') };
    });
    expect(draft).toMatchObject({ mirror: true, attachedToMenu: false, accumulatingScale: false,
        hiddenInWorld: true, includedInMirror: true, saving: null });
    await page.evaluate(() => window.vrClub.avatarEditor.cancelVR());
    expect(await page.evaluate(() => window.vrClub._wardrobeMirrorPreview)).toBeNull();
    expect(await page.evaluate(() => window.vrClub.isInVRMode)).toBe(true);
});

test('Gashouder has no in-app photo controls on desktop or in XR', async ({ page }) => {
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await enterVR(page);
    const result = await page.evaluate(() => {
        const club = window.vrClub;
        const labels = page => club._vrQuickMenuPageDefinitions(page).filter(Boolean).map(button => button.label);
        return { venue: club.venueId, home: labels('home'), comfort: labels('comfort'),
            photoButton: !!document.querySelector('.postcard-toggle'), capture: typeof club.capturePostcard };
    });
    expect(result.venue).toBe('gashouder');
    expect(result.home).not.toContain('CAMERA');
    expect(result.comfort).not.toContain('CAMERA');
    expect(result.photoButton).toBe(false);
    expect(result.capture).toBe('undefined');
});
