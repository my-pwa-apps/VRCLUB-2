import { test, expect } from '@playwright/test';
import { useQuestHarness } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';
import development from '../../worker/src/dev-index.js';
import { devRoomAccess, DEV_OWNER_COOKIE, DEV_OWNER_SIGN_IN } from '../../worker/src/devRoomAccess.js';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

useQuestHarness({ access: false });

test('development Online offers owner sign-in, retries 000032 and keeps ordinary rooms unauthenticated', async ({ page, context, baseURL }) => {
    test.setTimeout(600_000);
    page.setDefaultTimeout(90_000);
    const rooms = [];
    let checks = 0;
    let payments = 0;
    const keys = await generateKeyPair('RS256');
    const jwk = { ...await exportJWK(keys.publicKey), kid: 'browser-owner', alg: 'RS256', use: 'sig' };
    const sessions = new Map();
    const env = {
        DEV_ROOM_ENABLED: '1', MEDIA_TRANSPORT: 'sfu', DEV_ROOM_OWNERS: 'owner@example.com',
        DEV_OWNER_ACCESS: '1', DEV_OWNER_ORIGIN: 'https://api.mitwee.nl',
        DEV_ACCESS_TEAM_DOMAIN: 'https://browser-team.cloudflareaccess.com', DEV_ACCESS_AUD: 'browser-owner',
        ALLOWED_ORIGINS: 'https://nocturnedev.mitwee.nl',
        DB: {
            prepare(sql) {
                return {
                    bind(...args) {
                        return {
                            sql, args,
                            async run() { return {}; },
                            async first() {
                                const row = sessions.get(args[0]);
                                return row && row.expires_at > args[1] ? { email: row.email } : null;
                            }
                        };
                    }
                };
            },
            async batch(statements) {
                for (const { sql, args } of statements) {
                    if (/INSERT INTO dev_owner_sessions/i.test(sql)) {
                        sessions.set(args[0], { email: args[1], created_at: args[2], expires_at: args[3] });
                    }
                }
                return [];
            }
        }
    };
    const jwt = await new SignJWT({ type: 'app', email: 'owner@example.com' })
        .setProtectedHeader({ alg: 'RS256', kid: 'browser-owner' }).setSubject('owner')
        .setIssuer(env.DEV_ACCESS_TEAM_DOMAIN).setAudience(env.DEV_ACCESS_AUD)
        .setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => String(url) === `${env.DEV_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` ?
        Response.json({ keys: [jwk] }) : originalFetch(url, options);
    await context.route('https://api.mitwee.nl/**', async route => {
        const req = route.request();
        const headers = await req.allHeaders();
        if (new URL(req.url()).pathname === DEV_OWNER_SIGN_IN) headers['Cf-Access-Jwt-Assertion'] = jwt;
        else checks++;
        const response = await development.fetch(new Request(req.url(), { method: req.method(), headers }), env, {});
        await route.fulfill({
            status: response.status, headers: Object.fromEntries(response.headers), body: await response.text()
        });
    });
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/payments')) payments++; });
    await page.route('https://nocturnedev.mitwee.nl/**', async route => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` });
        await route.fulfill({ response });
    });
    await context.routeWebSocket(/.*/, async route => {
        const url = new URL(route.url());
        const owner = url.pathname === '/dev-owner/socket';
        expect(url.hostname).toBe(owner ? 'api.mitwee.nl' : 'vrclub-network-dev.garfieldapp.workers.dev');
        expect(url.searchParams.get('room')).toBe(owner ? 'private-000032' : 'lobby');
        if (owner) {
            const upgradeUrl = new URL(route.url());
            upgradeUrl.protocol = 'https:';
            const cookie = (await context.cookies(upgradeUrl.href)).map(value => `${value.name}=${value.value}`).join('; ');
            expect(await devRoomAccess(new Request(upgradeUrl, { headers: { Cookie: cookie } }), env)).toBeNull();
        }
        const room = new ClubRoom({}, {
            ROOM_CAPACITY: '32', MEDIA_TRANSPORT: 'sfu', DEV_ROOM_ENABLED: '1',
            SFU_APP_ID: 'test', SFU_APP_SECRET: 'fixture'
        });
        room._roomName = url.searchParams.get('room');
        const socket = {
            accept() {}, addEventListener() {}, send: data => route.send(data),
            close: (code, reason) => route.close({ code, reason })
        };
        const member = room._acceptSession(socket, 'Owner test', null, 'any', owner);
        rooms.push({ room, socket, member });
        route.onMessage(data => room._onMessage(socket, member, { data }));
        route.onClose(() => room._onClose(socket, member));
    });
    try {
        await page.goto('https://nocturnedev.mitwee.nl/');
        await page.locator('#enterClubBtn').click();
        await page.waitForFunction(() => window.vrClub?.ready, null, { timeout: 180_000 });
        await expect(page.locator('#splashScreen')).toBeHidden();
        // This tests DOM/network admission, not software-renderer frame timing.
        await page.evaluate(() => window.vrClub.engine.stopRenderLoop());
        await page.locator('#networkToggle').click();
        await page.getByRole('button', { name: 'I understand — show online options' }).click();
        await page.locator('#networkRoom').fill('000032');
        await expect(page.locator('#networkDevOwner')).toBeVisible();
        await expect(page.locator('#networkDevOwnerSignIn')).toHaveAttribute('href', `https://api.mitwee.nl${DEV_OWNER_SIGN_IN}`);
        await page.locator('#networkConnectBtn').click();
        await expect(page.locator('#networkStatus')).toContainText('Owner sign-in');
        expect(checks).toBe(1);
        expect(rooms.length).toBe(0);
        const popupPromise = page.waitForEvent('popup');
        await page.locator('#networkDevOwnerSignIn').click();
        const login = await popupPromise;
        await expect(login.getByRole('heading', { name: 'Development owner signed in' })).toBeVisible();
        const cookie = (await context.cookies('https://api.mitwee.nl/dev-owner/check')).find(value => value.name === DEV_OWNER_COOKIE);
        expect(cookie).toMatchObject({ httpOnly: true, secure: true, path: '/dev-owner/', sameSite: 'None' });
        expect(cookie.value).toMatch(/^dvo_[a-f0-9]{64}$/);
        expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 360 * 86400);
        expect(await login.evaluate(() => document.cookie)).not.toContain(DEV_OWNER_COOKIE);
        await login.close();
        await page.locator('#networkConnectBtn').click();
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.client?.peers.size)).toBe(31);
        expect(checks).toBe(2);
        expect(rooms[0].room.sessions.size).toBe(32);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await page.locator('#networkRoom').fill('lobby');
        await expect(page.locator('#networkDevOwner')).toBeHidden();
        await page.locator('#networkConnectBtn').click();
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.connected)).toBe(true);
        expect(checks).toBe(2);
        expect(rooms[1].room.sessions.size).toBe(1);
        expect(payments).toBe(0);
    } finally {
        globalThis.fetch = originalFetch;
        await page.evaluate(() => window.vrClub?.multiplayer?.disconnect()).catch(() => {});
        for (const { room, socket, member } of rooms) {
            room._onClose(socket, member);
            clearInterval(room._sweepTimer);
            clearInterval(room._poseTimer);
        }
    }
});
