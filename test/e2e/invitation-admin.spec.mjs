import { test, expect } from '@playwright/test';
import { dashboardHtml, dashboardScript } from '../../worker/src/invitationDashboard.js';

test('invitation dashboard shows codes once, preserves them on refresh failure and confirms revocation', async ({ page }) => {
    let items = [], failList = false, issues = 0, revokes = 0;
    const hash = 'a'.repeat(64);
    await page.route('**/admin/invitations**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/script.js')) return route.fulfill({ contentType: 'text/javascript', body: dashboardScript });
        if (url.pathname === '/admin/invitations') return route.fulfill({ contentType: 'text/html', body: dashboardHtml.replaceAll('NONCE_PLACEHOLDER', 'test-nonce') });
        if (url.pathname.endsWith('/data')) {
            return route.fulfill({ status: failList ? 503 : 200, json: failList ? { message: 'List unavailable' } :
                { actor: 'garfieldapp@outlook.com', items, next: null } });
        }
        if (url.pathname.endsWith('/issue')) {
            issues++;
            items = [{ code_hash: hash, created_at: '2026-10-09', label: route.request().postDataJSON().label,
                issued_by: 'garfieldapp@outlook.com', redeemed_at: null, revoked_at: null }];
            failList = true;
            return route.fulfill({ status: 201, json: { invitations: [{ code: '00123456', hash }] } });
        }
        if (url.pathname.endsWith('/revoke')) {
            revokes++;
            expect(route.request().postDataJSON().hash).toBe(hash);
            items[0].revoked_at = '2026-10-09';
            return route.fulfill({ json: { revoked: true } });
        }
        throw new Error('Unexpected admin request: ' + url.pathname);
    });
    await page.goto('/admin/invitations');
    await expect(page.locator('#identity')).toContainText('garfieldapp@outlook.com');
    await page.locator('#label').fill('<img src=x onerror=alert(1)>');
    await page.getByRole('button', { name: 'Generate invitations' }).click();
    await expect(page.locator('#codes')).toContainText('00123456');
    await expect(page.locator('#status')).toContainText('List refresh failed');
    await page.getByRole('button', { name: 'Generate invitations' }).click();
    expect(issues).toBe(1);
    await expect(page.locator('#status')).toContainText('Save your current codes');
    failList = false;
    await page.getByRole('button', { name: 'Refresh / first page' }).click();
    await expect(page.locator('#rows')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('#rows img')).toHaveCount(0);
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    expect(revokes).toBe(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(revokes).toBe(0);
    await page.getByRole('button', { name: 'Revoke', exact: true }).click();
    await page.getByRole('button', { name: 'Revoke this invitation', exact: true }).click();
    await expect(page.locator('#rows')).toContainText('Revoked');
    expect(revokes).toBe(1);
    await page.getByRole('button', { name: 'Hide and clear codes' }).click();
    await expect(page.locator('#codes')).toBeEmpty();
    await page.reload();
    await expect(page.locator('#newCodes')).toBeHidden();
});

test('expired Access sessions show an explicit login error rather than success', async ({ page }) => {
    await page.route('**/admin/invitations**', route => {
        const path = new URL(route.request().url()).pathname;
        return route.fulfill({ contentType: path.endsWith('/script.js') ? 'text/javascript' : 'text/html',
            body: path.endsWith('/script.js') ? dashboardScript :
                path.endsWith('/data') ? '<html>Access login</html>' : dashboardHtml.replaceAll('NONCE_PLACEHOLDER', 'test-nonce') });
    });

    await page.goto('/admin/invitations');
    await expect(page.locator('#status')).toContainText('sign in to Cloudflare Access');
    await expect(page.getByRole('button', { name: 'Generate invitations' })).toBeEnabled();
});

test('support reviews recovery history and requires confirmation before linking an existing legacy grant', async ({ page }) => {
    const hash = 'b'.repeat(64);
    let links = 0;
    await page.route('**/admin/invitations**', route => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/script.js')) return route.fulfill({ contentType: 'text/javascript', body: dashboardScript });
        if (url.pathname === '/admin/invitations') return route.fulfill({
            contentType: 'text/html', body: dashboardHtml.replaceAll('NONCE_PLACEHOLDER', 'test-nonce')
        });
        if (url.pathname.endsWith('/data')) return route.fulfill({
            json: { actor: 'garfieldapp@outlook.com', items: [], next: null }
        });
        if (url.pathname.endsWith('/recovery-data')) {
            expect(url.searchParams.get('email')).toBe('recipient@example.com');
            return route.fulfill({ json: {
                user: { email: 'recipient@example.com', email_verified_at: 1 },
                devices: [{ name: 'Quest' }], audit: [{ action: 'email_verified' }]
            } });
        }
        if (url.pathname.endsWith('/link-legacy')) {
            expect(route.request().postDataJSON()).toEqual({ hash, email: 'recipient@example.com' });
            links++;
            return route.fulfill({ json: { linked: true } });
        }
        throw new Error('Unexpected admin request: ' + url.pathname);
    });
    await page.goto('/admin/invitations');
    await expect(page.locator('#identity')).toContainText('garfieldapp@outlook.com');
    await page.getByLabel('Customer email').fill('recipient@example.com');
    await page.getByRole('button', { name: 'Show recovery history' }).click();
    await expect(page.locator('#supportResult')).toContainText('email_verified');
    await expect(page.locator('#supportResult')).toContainText('Quest');
    await page.getByLabel('Full invitation identifier (64 characters)').fill(hash);
    await page.getByLabel('Verified recipient email').fill('recipient@example.com');
    await page.getByRole('button', { name: 'Review legacy recovery' }).click();
    await expect(page.locator('#legacyConfirm')).toBeVisible();
    expect(links).toBe(0);
    await page.locator('#legacyCancel').click();
    await expect(page.locator('#legacyConfirm')).toBeHidden();
    expect(links).toBe(0);
    await page.getByRole('button', { name: 'Review legacy recovery' }).click();
    await page.getByRole('button', { name: 'Confirm verified recipient and link grant' }).click();
    await expect(page.locator('#status')).toContainText('Existing grant linked');
    expect(links).toBe(1);
});
