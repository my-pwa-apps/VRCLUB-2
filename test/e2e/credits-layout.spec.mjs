import { test, expect } from '@playwright/test';
import { enterClub, useQuestHarness } from './support.mjs';

useQuestHarness();

// Expanded credits must never cover the camera controls: on a phone-sized screen the 60%-wide plate used to grow up over the
// "Go to" button in the middle of the bottom edge.
for (const [width, height] of [[375, 667], [320, 568], [1280, 720]]) {
    test(`expanded credits stay clear of the Go to control at ${width}x${height}`, async ({ page }) => {
        test.setTimeout(600_000);
        await page.setViewportSize({ width, height });
        await page.addInitScript(() => localStorage.setItem('vrclub.welcomeDismissed', '1'));
        await enterClub(page);
        await page.locator('#modelCredits summary').click();
        await expect(page.locator('#modelCredits')).toHaveAttribute('open', '');
        const result = await page.evaluate(() => {
            const credits = document.getElementById('modelCredits').getBoundingClientRect();
            const controls = document.getElementById('cameraControls').getBoundingClientRect();
            const button = document.querySelector('#cameraControls button[aria-controls="cameraPresetGrid"]');
            const centre = button.getBoundingClientRect();
            const hit = document.elementFromPoint(centre.left + centre.width / 2, centre.top + centre.height / 2);
            return {
                creditsBottom: credits.bottom, controlsTop: controls.top, creditsTop: credits.top, creditsRight: credits.right,
                hitInControls: !!hit && !!hit.closest('#cameraControls'), hitInCredits: !!hit && !!hit.closest('#modelCredits'),
                hit: hit ? `${hit.tagName}#${hit.id}.${hit.className}` : null,
                controlsRect: [controls.left, controls.top, controls.right, controls.bottom].map(Math.round), button: [centre.left, centre.top, centre.width, centre.height].map(Math.round),
                overlap: !(credits.right <= controls.left || credits.left >= controls.right || credits.bottom <= controls.top || credits.top >= controls.bottom),
                width: window.innerWidth
            };
        });
        expect(result.hitInCredits, 'a tap at the centre of Go to must not land on the credits').toBe(false);
        expect(result.hitInControls, JSON.stringify(result)).toBe(true);
        expect(result.overlap, 'the credits plate does not overlap the camera controls').toBe(false);
        expect(result.creditsTop, 'the plate stays on screen').toBeGreaterThanOrEqual(0);
        expect(result.creditsRight).toBeLessThanOrEqual(result.width);
    });
}
