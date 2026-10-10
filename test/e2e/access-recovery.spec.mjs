import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => { window.NOCTURNE_PAYMENT_API = window.location.origin; });
});

test('restore recovers the two-slot device list, confirms replacement/removal, and reports lease denial', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 480 });
    let verified = false, registered = false, replacements = 0, removals = 0;
    let devices = [{ id: 'old', name: 'Old Quest', created_at: '2026-10-01' }, { id: 'desktop', name: 'Desktop' }];
    await page.route('**/payments/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let status = 200, json = { entitled: verified, verified, configured: true, deviceRegistered: registered, devices };
        if (path.endsWith('/recovery/start')) json = { challenge: 'restore', message: 'If eligible, a verification email has been sent.' };
        if (path.endsWith('/recovery/verify')) {
            verified = true;
            json = { verified, email: 'owner@example.com', entitled: true, deviceRegistered: false, devices };
        }
        if (path.endsWith('/devices/register')) {
            expect(route.request().postDataJSON().replaceDevice).toBe('old');
            replacements++; registered = true;
            devices = [{ id: 'new', name: 'My VR browser', current: true }, devices[1]];
            json = { deviceRegistered: true, entitled: true, devices };
        }
        if (path.endsWith('/devices/remove')) {
            expect(route.request().postDataJSON().id).toBe('new');
            removals++; registered = false;
            devices = devices.filter(d => d.id !== 'new');
            json = { removed: true, devices };
        }
        if (path.endsWith('/vr/acquire')) { status = 409; json = { message: 'Another device already has an active VR session.' }; }
        await route.fulfill({ status, json });
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.VRPayment);
    await page.evaluate(async () => { await window.VRPayment.refreshEntitlement(); window.VRPayment.showGate(); await window.VRPayment.refreshEntitlement(); });
    await page.getByRole('textbox', { name: 'Email for access recovery' }).fill('owner@example.com');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeEnabled();
    const code = page.getByRole('textbox', { name: 'Eight-digit email verification code' });
    await code.focus();
    await code.pressSequentially('12345678');
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await expect(page.locator('.payment-devices')).toContainText('Old Quest');
    await expect(page.getByRole('button', { name: 'Register this device' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Replace Old Quest' }).click();
    expect(replacements).toBe(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Replace Old Quest' }).click();
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect(replacements).toBe(1);
    await page.getByRole('button', { name: 'Prepare VR', exact: true }).click();
    await expect(page.locator('.payment-status')).toContainText('Another device');
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
    await page.getByRole('button', { name: 'Remove My VR browser' }).click();
    expect(removals).toBe(0);
    await expect(page.locator('.payment-content')).toContainText('(this browser)');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect(removals).toBe(1);
    await expect(page.getByRole('button', { name: 'Register this device' })).toBeVisible();
    await expect(page.locator('.payment-close')).toBeInViewport();
});

test('an existing paid cookie binds email instead of requesting another payment', async ({ page }) => {
    let intent;
    await page.route('**/payments/**', async route => {
        if (route.request().url().endsWith('/recovery/start')) {
            intent = route.request().postDataJSON().intent;
            await route.fulfill({ json: { challenge: 'bind', message: 'Check your email.' } });
        } else await route.fulfill({ json: { entitled: true, configured: true, verified: false, recoveryRequired: true, deviceRegistered: false } });
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.VRPayment);
    await page.evaluate(async () => { await window.VRPayment.refreshEntitlement(); window.VRPayment.showGate(); await window.VRPayment.refreshEntitlement(); });
    await expect(page.locator('.payment-status')).toContainText('do not pay again');
    await expect(page.getByRole('button', { name: 'Buy VR access — €1.99' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Email for access recovery' }).fill('owner@example.com');
    await page.getByRole('button', { name: 'Send verification code' }).click();
    expect(intent).toBe('bind');
    expect(await page.evaluate(() => window.VRPayment.hasEntitlement())).toBe(true);
    expect(await page.evaluate(() => window.VRPayment.canEnterVR())).toBe(false);
});
