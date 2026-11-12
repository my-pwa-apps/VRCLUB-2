import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';

useQuestHarness();

test('guest menus, mirror wardrobe draft and private local postcard work inside XR', async ({ page }) => {
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
            signs: club._guestTouchpoints.map(entry => entry.mesh.name) };
    });
    expect(menus.home).toContain('WARDROBE');
    expect(menus.home).not.toContain('LIGHTS');
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
    const photo = await page.evaluate(async () => {
        const club = window.vrClub, notices = [];
        const original = club.showErrorMessage;
        club.showErrorMessage = message => notices.push(message);
        try { return { ok: await club.capturePostcard(), notices }; }
        finally { club.showErrorMessage = original; }
    });
    expect(photo.ok, photo.notices.join('\n')).toBe(true);
    expect(await page.evaluate(() => ({
        xr: window.vrClub.isInVRMode, photo: window.vrClub._postcardUrl?.startsWith('blob:'),
        menuEnabled: window.vrClub._vrQuickMenuRoot.isEnabled()
    }))).toEqual({ xr: true, photo: true, menuEnabled: true });
});
