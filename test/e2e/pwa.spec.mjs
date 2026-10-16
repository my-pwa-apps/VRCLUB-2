import { test, expect } from '@playwright/test';
import { enterClub } from './support.mjs';

/**
 * The production build against Chrome's own installability checks, a service worker that controls the page, the
 * in-app install button and a start with no network. No Quest harness: it blocks service workers, and this is what a
 * first visitor gets.
 */
test('the production build is installable, works offline and offers an install button', async ({ page, context }) => {
    test.setTimeout(300_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await page.goto('/');
    await page.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return !!(registration && registration.active && registration.active.state === 'activated');
    }, null, { timeout: 60_000 });
    // The worker claims the page on activation; wait until it controls it so the next load can be answered offline.
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 });

    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors, 'the manifest has warnings or errors').toEqual([]);
    expect(manifest.url).toMatch(/\/manifest\.json$/);
    const installability = await cdp.send('Page.getInstallabilityErrors');
    expect(installability.installabilityErrors, 'Chrome would not offer to install the app').toEqual([]);

    const served = await page.evaluate(async () => {
        const manifestResponse = await fetch('manifest.json');
        const parsed = await manifestResponse.json();
        const imageStatuses = await Promise.all([...parsed.icons, ...parsed.screenshots].map(async image => (await fetch(image.src)).status));
        return { type: manifestResponse.headers.get('content-type'), cache: manifestResponse.headers.get('cache-control'), imageStatuses };
    });
    expect(served.type).toContain('application/manifest+json');
    expect(served.cache).toBe('no-cache');
    expect(served.imageStatuses.every(status => status === 200), 'a manifest image 404s').toBe(true);

    // No install affordance until the browser offers one...
    await expect(page.locator('#installApp')).toBeHidden();
    // The About panel sits behind the splash until the guest enters (which reloads the page).
    await enterClub(page);
    await expect(page.locator('#installApp')).toBeHidden();
    await page.evaluate(() => {
        window.__installPrompts = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { window.__installPrompts++; };
        event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
        window.__installEventPrevented = !window.dispatchEvent(event);
    });
    // ...then it is a button in the About panel, spent after one use.
    expect(await page.evaluate(() => window.__installEventPrevented), 'the prompt must be deferred, not shown by the browser').toBe(true);
    await page.locator('#modelCredits summary').click();
    await expect(page.locator('#installApp')).toBeVisible();
    await page.locator('#installAppBtn').click();
    await expect.poll(() => page.evaluate(() => window.__installPrompts)).toBe(1);
    await expect(page.locator('#installApp')).toBeHidden();

    // Offline: the shell is answered by the service worker.
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    const response = await page.reload();
    expect(response && response.status()).toBe(200);
    await expect(page.locator('#enterClubBtn')).toBeVisible();
    await expect(page).toHaveTitle(/NOCTURNE/);
    await context.setOffline(false);
});
