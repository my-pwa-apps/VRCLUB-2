import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// In the headset the player reaches the character picker through COMFORT -> ME -> MY CHARACTER and chooses on either page.
test('the VR menu reaches the character picker from Comfort and Me, and a pick on each page is saved', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await enterVR(page);
    const result = await page.evaluate(() => {
        const club = window.vrClub;
        const press = label => {
            const button = club._vrQuickMenuButtons.find(b => b.mesh.isEnabled() && (b.label === label || b.label.endsWith(label)));
            if (!button) throw new Error(`no enabled button "${label}" on ${club._vrQuickMenuPage}`);
            club._activateVRQuickMenuButton(button);
        };
        const visible = () => club._vrQuickMenuButtons.filter(b => b.mesh.isEnabled()).map(b => b.label);
        const out = {};
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage('home');
        press('COMFORT');
        out.comfort = visible();
        press('ME');
        out.me = visible();
        press('MY CHARACTER');
        out.page0 = visible();
        const women = club._vrQuickMenuButtons.find(b => b.mesh.isEnabled() && b.character === 'f3');
        club._activateVRQuickMenuButton(women);
        out.afterWoman = { saved: localStorage.getItem('vrclub.myCharacter'), page: club._vrQuickMenuPage };
        const toMen = club._vrQuickMenuButtons.find(b => b.mesh.isEnabled() && b.action === 'characterPage');
        club._activateVRQuickMenuButton(toMen);
        out.page1 = visible();
        const man = club._vrQuickMenuButtons.find(b => b.mesh.isEnabled() && b.character === 'm4');
        club._activateVRQuickMenuButton(man);
        out.afterMan = { saved: localStorage.getItem('vrclub.myCharacter'), style: localStorage.getItem('vrclub.avatarStyle') };
        press('BACK');
        out.backTo = club._vrQuickMenuPage;
        return out;
    });
    expect(result.comfort).toContain('ME');
    expect(result.me).toEqual(expect.arrayContaining(['MEASURE HEIGHT', 'SEATED MODE']));
    expect(result.page0.length, 'DEFAULT, eight women, the page toggle, BACK and CLOSE').toBe(12);
    expect(result.afterWoman.saved).toBe('f3');
    expect(result.page1.length, 'nine men, the page toggle, BACK and CLOSE').toBe(12);
    expect(result.afterMan.saved).toBe('m4');
    expect(result.afterMan.style).toBe('male');
    expect(result.backTo).toBe('me');
    await expectHealthyRuntime(page);
});
