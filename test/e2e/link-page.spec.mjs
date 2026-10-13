import { test, expect } from '@playwright/test';

const API = 'https://api.mitwee.nl/payments';
const cors = { 'access-control-allow-origin': 'http://localhost:4173', 'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

/** A small stateful stand-in for the access API, so the page's whole decision flow runs in a real browser. */
async function fakeApi(page, { verified = false, entitled = true, devices = [], music = null } = {}) {
    const state = { verified, entitled, devices: [...devices], calls: [], approved: null, music };
    const reply = (route, body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route(`${API}/**`, async route => {
        const request = route.request();
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        const path = new URL(request.url()).pathname.replace('/payments', '');
        const body = request.postData() ? JSON.parse(request.postData()) : {};
        state.calls.push([path, body]);
        const info = () => ({ verified: state.verified, email: 'owner@example.com', entitled: state.entitled, devices: state.devices });
        if (path === '/devices') return state.verified ? reply(route, info()) : reply(route, { message: 'Verify your email first.' }, 401);
        if (path === '/recovery/start') return reply(route, { challenge: '11111111-1111-1111-1111-111111111111' });
        if (path === '/recovery/verify') {
            if (body.code !== '12345678') return reply(route, { message: 'The code is invalid, expired or used.' }, 400);
            state.verified = true;
            return reply(route, info());
        }
        if (path === '/redeem') {
            if (body.code !== '87654321') return reply(route, { message: 'This invitation code is invalid, already used or revoked.' }, 409);
            state.entitled = true;
            return reply(route, info());
        }
        if (path === '/link/approve') {
            if (state.devices.length >= 2 && !body.replaceDevice) {
                return reply(route, { error: 'device_limit', message: 'Two devices are already registered.', devices: state.devices }, 409);
            }
            state.approved = body;
            return reply(route, { linked: true, email: 'owner@example.com', devices: state.devices });
        }
        if (path === '/music') return state.verified ? reply(route, { items: state.music, updatedAt: state.music ? 1 : 0 }) : reply(route, { message: 'Verify your email first.' }, 401);
        if (path === '/music/save') {
            if (!state.verified) return reply(route, { message: 'Verify your email first.' }, 401);
            const bad = (body.items || []).find(item => !/^https:\/\//.test(item.url));
            if (bad) return reply(route, { error: 'invalid_music', message: 'Use a direct HTTPS link without a username or password.' }, 400);
            state.music = body.items.map(item => ({ url: item.url, ...(item.name ? { name: item.name } : {}) }));
            return reply(route, { items: state.music, updatedAt: 2 });
        }
        return reply(route, { message: 'not found' }, 404);
    });
    return state;
}

test('an unverified owner pairs a headset: code, email, email code, confirm', async ({ page }) => {
    const state = await fakeApi(page, { verified: false, entitled: true });
    await page.goto('/link/?code=12345678');
    // The code in the URL is taken once and removed from the address bar.
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    expect(new URL(page.url()).search).toBe('');
    await page.getByRole('textbox', { name: 'Your email' }).fill('owner@example.com');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('heading', { name: 'Enter the email code' })).toBeVisible();
    await page.getByLabel('Email code').fill('0000 0000');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('status')).toContainText('invalid');
    await page.getByLabel('Email code').fill('1234 5678');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm the link' })).toBeVisible();
    await expect(page.locator('#step')).toContainText('1234 5678');
    await expect(page.locator('#step')).toContainText('owner@example.com');
    await page.getByLabel('Name for this headset').fill('Living room Quest');
    await page.getByRole('button', { name: 'Link this headset' }).click();
    await expect(page.getByRole('heading', { name: 'Headset linked' })).toBeVisible();
    expect(state.approved).toEqual({ code: '12345678', name: 'Living room Quest' });
    // Done means the pairing code is forgotten.
    expect(await page.evaluate(() => sessionStorage.getItem('nocturne.linkCode'))).toBeNull();
});

test('a verified owner without access redeems an invitation before linking', async ({ page }) => {
    const state = await fakeApi(page, { verified: true, entitled: false });
    await page.goto('/link/');
    await page.getByLabel('Code shown in your headset').fill('1234 567');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('status')).toContainText('all eight digits');
    await page.getByLabel('Code shown in your headset').fill('1234 5678');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Get VR access' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buy VR access/ })).toBeVisible();
    await page.getByLabel('Invitation code').fill('0000 0000');
    await page.getByRole('button', { name: 'Redeem invitation' }).click();
    await expect(page.getByRole('status')).toContainText('invalid');
    await page.getByLabel('Invitation code').fill('8765 4321');
    await page.getByRole('button', { name: 'Redeem invitation' }).click();
    await expect(page.getByRole('heading', { name: 'Confirm the link' })).toBeVisible();
    await page.getByRole('button', { name: 'Link this headset' }).click();
    await expect(page.getByRole('heading', { name: 'Headset linked' })).toBeVisible();
    expect(state.approved.name).toBe('Meta Quest');
});

test('a full account must choose a device to replace', async ({ page }) => {
    const state = await fakeApi(page, { verified: true, entitled: true, devices: [
        { id: 'a-device', name: 'Old Quest' }, { id: 'b-device', name: 'Other Quest' }] });
    await page.goto('/link/?code=11112222');
    await expect(page.getByRole('heading', { name: 'Confirm the link' })).toBeVisible();
    await page.getByRole('button', { name: 'Link this headset' }).click();
    await expect(page.getByRole('status')).toContainText('Two devices');
    await expect(page.getByText('Choose one to replace')).toBeVisible();
    await page.getByRole('button', { name: 'Replace Old Quest' }).click();
    await expect(page.getByRole('heading', { name: 'Headset linked' })).toBeVisible();
    expect(state.approved).toEqual({ code: '11112222', name: 'Meta Quest', replaceDevice: 'a-device' });
});

test('the owner manages the headset\u2019s music list from the phone: add, reject a bad link, remove', async ({ page }) => {
    const state = await fakeApi(page, { verified: true, music: [{ url: 'https://audio.example/one.mp3', name: 'One' }] });
    await page.goto('/link/?music=1');
    await expect(page.getByRole('heading', { name: 'Your headset music' })).toBeVisible();
    await expect(page.locator('.music-list li')).toHaveCount(1);
    await expect(page.locator('#step')).toContainText('owner@example.com');
    // No pairing code is asked for in this mode.
    await expect(page.getByLabel('Code shown in your headset')).toHaveCount(0);

    await page.getByLabel('Music link').fill('not a link');
    await page.getByRole('button', { name: 'Add link' }).click();
    await expect(page.getByRole('status')).toContainText('https://');
    await page.getByLabel('Music link').fill('http://insecure.example/a.mp3');
    await page.getByRole('button', { name: 'Add link' }).click();
    await expect(page.getByRole('status')).toContainText('Only HTTPS');
    expect(state.music).toHaveLength(1);

    await page.getByLabel('Music link').fill('https://audio.example/two.mp3');
    await page.getByLabel('Name (optional)').fill('Friday set');
    await page.getByRole('button', { name: 'Add link' }).click();
    await expect(page.locator('.music-list li')).toHaveCount(2);
    await expect(page.getByRole('status')).toContainText('Sync now');
    expect(state.music).toEqual([{ url: 'https://audio.example/one.mp3', name: 'One' }, { url: 'https://audio.example/two.mp3', name: 'Friday set' }]);

    await page.getByRole('button', { name: 'Remove One' }).click();
    await expect(page.locator('.music-list li')).toHaveCount(1);
    expect(state.music).toEqual([{ url: 'https://audio.example/two.mp3', name: 'Friday set' }]);
    await page.getByRole('button', { name: 'Remove Friday set' }).click();
    await expect(page.getByText('No music saved yet.')).toBeVisible();
    expect(state.music).toEqual([]);
});

test('an unverified owner verifies their email and lands on the music list, not the pairing flow', async ({ page }) => {
    await fakeApi(page, { verified: false });
    await page.goto('/link/?music=1');
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use a different code' })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Your email' }).fill('owner@example.com');
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('Email code').fill('1234 5678');
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('heading', { name: 'Your headset music' })).toBeVisible();
    await expect(page.getByText('No music saved yet.')).toBeVisible();
});

test('a linked headset points the owner at the music list, and a full list stops accepting links', async ({ page }) => {
    await fakeApi(page, { verified: true, entitled: true });
    await page.goto('/link/?code=12345678');
    await page.getByRole('button', { name: 'Link this headset' }).click();
    await expect(page.getByRole('heading', { name: 'Headset linked' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add music for your headset' })).toHaveAttribute('href', '?music=1');

    const eight = Array.from({ length: 8 }, (_, i) => ({ url: `https://audio.example/${'long-path-segment-'.repeat(4)}${i}.mp3`, name: `Set ${i + 1}` }));
    const full = await page.context().newPage();
    await fakeApi(full, { verified: true, music: eight });
    await full.setViewportSize({ width: 360, height: 640 });
    await full.goto('/link/?music=1');
    await expect(full.locator('.music-list li')).toHaveCount(8);
    await expect(full.getByText('the most the headset keeps')).toBeVisible();
    await expect(full.getByRole('button', { name: 'Add link' })).toHaveCount(0);
    expect(await full.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('the page works on a phone-sized screen without horizontal scrolling and with labelled fields', async ({ page }) => {
    await fakeApi(page, { verified: false });
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/link/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByLabel('Code shown in your headset')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
