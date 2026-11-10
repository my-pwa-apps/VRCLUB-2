import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';

test.use({ serviceWorkers: 'block' });
useQuestHarness({ access: false });

test('verified invitation access registers a device, prepares VR, and exits on lease revocation', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    await page.addInitScript(() => { window.NOCTURNE_PAYMENT_API = window.location.origin; });
    let entitled = false, verified = false, deviceRegistered = false, redemptions = 0, releases = 0;
    await page.route('**/payments/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let json = { entitled, verified, deviceRegistered, configured: true, devices: [] }, status = 200;
        if (path.endsWith('/recovery/start')) {
            expect(route.request().postDataJSON().intent).toBe('restore');
            json = { challenge: 'challenge', message: 'Check your inbox for the verification code.' };
        } else if (path.endsWith('/recovery/verify')) {
            expect(route.request().postDataJSON()).toEqual({ challenge: 'challenge', code: '12345678' });
            verified = true;
            json = { verified, email: 'guest@example.com', entitled, deviceRegistered: false, devices: [] };
        } else if (path.endsWith('/redeem')) {
            expect(verified).toBe(true);
            redemptions++;
            entitled = route.request().postDataJSON().code === '00123456';
            status = entitled ? 200 : 409;
            json = entitled ? { entitled, verified, deviceRegistered } : { message: 'This invitation code is invalid, already used or revoked.' };
        } else if (path.endsWith('/devices/register')) {
            deviceRegistered = true;
            json = { entitled, deviceRegistered, devices: [{ id: 'quest', name: 'Quest', current: true }] };
        } else if (path.endsWith('/vr/acquire')) {
            expect(route.request().postDataJSON().tab).toMatch(/^[0-9a-f-]{36}$/);
            json = { active: true, expiresAt: Date.now() + 90000, expiresInMs: 90000 };
        } else if (path.endsWith('/vr/renew')) {
            status = 403; json = { message: 'This device was removed from your account.' };
        } else if (path.endsWith('/vr/release')) {
            releases++; json = { released: true };
        }
        await route.fulfill({ status, json });
    });
    await enterClub(page);
    await page.getByRole('button', { name: 'Access', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Redeem invitation — no payment' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Use invitation code', exact: true }).click();
    let keypad = page.getByRole('group', { name: 'One-use VR invitation code keypad', exact: true });
    await expect(keypad.getByRole('button')).toHaveCount(12);
    await expect(page.getByRole('textbox', { name: 'One-use VR invitation code' })).toHaveAttribute('readonly', '');
    for (const digit of '87654321') await keypad.getByRole('button', { name: digit, exact: true }).click();
    await page.getByRole('button', { name: 'Continue with invitation', exact: true }).click();
    expect(redemptions).toBe(0);
    await expect(page.getByRole('textbox', { name: 'Eight-digit email verification code' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeHidden();
    await page.getByRole('textbox', { name: 'Email for access recovery' }).fill('guest@example.com');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.locator('.payment-status')).toContainText('Email sent');
    await expect(page.getByRole('textbox', { name: 'Email for access recovery' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeEnabled();
    const emailKeypad = page.getByRole('group', { name: 'Eight-digit email verification code keypad', exact: true });
    for (const digit of '12345678') await emailKeypad.getByRole('button', { name: digit, exact: true }).click();
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    const redeem = page.getByRole('button', { name: 'Redeem invitation — no payment' });
    await expect(page.locator('.payment-status')).toContainText('already used or revoked');
    await expect(redeem).toBeEnabled();
    keypad = page.getByRole('group', { name: 'One-use VR invitation code keypad', exact: true });
    await keypad.getByRole('button', { name: 'Clear', exact: true }).click();
    for (const digit of '00123456') await keypad.getByRole('button', { name: digit, exact: true }).click();
    await redeem.click();
    expect(redemptions).toBe(2);
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
    await expect(page.getByRole('button', { name: 'Register this device', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Prepare VR', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Prepare VR', exact: true })).toBeFocused();
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
    await page.getByRole('button', { name: 'Prepare VR', exact: true }).click();
    await expect(page.locator('.payment-status')).toContainText('VR prepared');
    await expect(page.getByRole('heading', { name: 'You are ready for VR' })).toBeVisible();
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(true);
    const card = await page.locator('.payment-card').boundingBox();
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(480);
    const close = page.locator('.payment-close');
    await expect(close).toBeFocused(); await close.click();
    await enterVR(page);
    await page.waitForFunction(() => window.vrClub.isInVRMode === false, null, { timeout: 45000 });
    await expect(page.locator('.payment-status')).toContainText('removed from your account');
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
    expect(releases).toBeGreaterThan(0);
    await page.reload();
    await page.waitForFunction(() => window.VRPayment?.hasEntitlement());
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
});
