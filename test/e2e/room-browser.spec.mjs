import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness, expectHealthyRuntime } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';
import { fileURLToPath } from 'node:url';

useQuestHarness();

test('room browser is opt-in on desktop, remembers only known private codes and fits the real VR menu', async ({ page }) => {
    const calls = [];
    const status = (room, people, locked = false) => ({ room, people, locked, capacity: 8, active: people > 0 });
    await page.addInitScript(() => localStorage.setItem('vrclub.networkServerUrl', 'wss://vrclub-network.garfieldapp.workers.dev'));
    await page.route('https://vrclub-network.garfieldapp.workers.dev/rooms**', async route => {
        const request = route.request();
        calls.push({ url: request.url(), body: request.postDataJSON() });
        await route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: request.method() === 'POST'
            ? { rooms: request.postDataJSON().rooms.map(room => status(room, 2)) }
            : { rooms: [status('lobby', 3), status('full-room', 8), status('locked-room', 1, true)], next: null } });
    });

    await enterClub(page);
    expect(calls).toHaveLength(0);
    await page.locator('#networkToggle').click();
    await expect(page.locator('#networkMoreRooms')).toBeHidden();
    await page.locator('#networkBrowseRooms').click();
    await expect(page.locator('#networkRoomsList')).toContainText('lobby — 3/8 people');
    await expect(page.getByRole('button', { name: 'Join full-room', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Join locked-room', exact: true })).toBeDisabled();
    await page.locator('#networkSavedRoom').fill('123456');
    await page.locator('#networkSaveRoom').click();
    await expect(page.locator('#networkRoomsList')).toContainText('Private: 123456');
    expect(calls.at(-1).body).toEqual({ rooms: ['private-123456'] });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vrclub.privateRooms'))[0].room)).toBe('private-123456');
    await page.getByRole('button', { name: 'Forget private-123456', exact: true }).click();
    await expect(page.locator('#networkRoomsList')).not.toContainText('123456');
    await page.locator('#networkToggle').click();
    await enterVR(page);
    const menu = await page.evaluate(() => {
        const club = window.vrClub;
        const mp = club.multiplayer;
        mp.roomDirectory.publicRooms = Array.from({ length: 51 }, (_, i) => ({
            room: 'room-' + i, people: 1, capacity: 8, active: true, locked: false
        }));
        mp.roomDirectory.next = 'room-50';
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage('rooms');
        const buttons = club._vrQuickMenuButtons.filter(button => button.mesh.isEnabled());
        return { count: buttons.length, labels: buttons.map(button => button.label), actions: buttons.map(button => button.action) };
    });
    expect(menu.count).toBe(12);
    expect(menu.labels).toContain('MORE PUBLIC');
    expect(menu.actions).toContain('back');
    expect(menu.actions).toContain('close');
    await expectHealthyRuntime(page);
});

test('desktop and VR host handover use the real relay without either guest leaving', async ({ page, context }) => {
    test.setTimeout(600_000);
    const room = new ClubRoom({});
    let connections = 0;
    await context.addInitScript(() => {
        localStorage.setItem('vrclub.graphicsTier', 'balanced');
        localStorage.setItem('vrclub.networkServerUrl', 'wss://vrclub-network.garfieldapp.workers.dev');
        window.NOCTURNE_PAYMENT_API = window.location.origin;
    });
    await context.route('**/payments/**', route => route.fulfill({
        json: { entitled: true, verified: true, deviceRegistered: true, configured: true }
    }));
    await context.routeWebSocket(/vrclub-network\.garfieldapp\.workers\.dev/, route => {
        connections++;
        const socket = {
            accept() {},
            addEventListener() {},
            send: message => route.send(message),
            close: (code, reason) => route.close({ code, reason })
        };
        const session = room._acceptSession(socket, new URL(route.url()).searchParams.get('name'));
        route.onMessage(data => room._onMessage(socket, session, { data }));
        route.onClose(() => room._onClose(socket, session));
    });
    const guest = await context.newPage();
    try {
        await enterClub(page);
        await page.locator('#networkToggle').click();
        await page.locator('#networkName').fill('Host');
        await page.locator('#networkConnectBtn').click();
        await page.waitForFunction(() => window.vrClub.multiplayer.isHost());
        await guest.route('**/host-transfer-test', route => route.fulfill({
            contentType: 'text/html', body: '<p>Host transfer guest</p>'
        }));
        await guest.goto('/host-transfer-test');
        await guest.addScriptTag({ path: fileURLToPath(new URL('../../js/networkClient.js', import.meta.url)) });
        await guest.evaluate(() => {
            window.transferGuest = new window.NetworkClient({
                serverUrl: 'wss://vrclub-network.garfieldapp.workers.dev', room: 'lobby', name: 'Guest'
            });
            window.transferGuest.connect();
        });
        await guest.waitForFunction(() => window.transferGuest.connected);
        await expect(page.locator('#networkPeopleList')).toContainText('Guest');
        await page.locator('#networkLockRoom').click();
        await expect.poll(() => room.locked).toBe(true);
        const makeGuestHost = page.getByRole('button', { name: /^Make Guest host:/ });
        await makeGuestHost.click();
        expect(await page.evaluate(() => window.vrClub.multiplayer.isHost())).toBe(true);
        await makeGuestHost.click();
        await guest.waitForFunction(() => window.transferGuest.isHost());
        await page.waitForFunction(() => window.vrClub.multiplayer.following);
        await expect(page.getByRole('button', { name: /^Make .* host:/ })).toHaveCount(0);
        expect(room.sessions.size).toBe(2);
        expect(room.locked).toBe(true);
        expect(await guest.evaluate(() => window.transferGuest.transferHost([...window.transferGuest.peers.keys()][0]))).toBe(true);
        await page.waitForFunction(() => window.vrClub.multiplayer.isHost());
        await page.locator('#networkToggle').click();
        await enterVR(page);
        const transfer = await page.evaluate(async () => {
            const club = window.vrClub;
            club.engine.stopRenderLoop(club._renderLoop);
            club.toggleVRQuickMenu(true);
            club._vrPerson = club.multiplayer.people()[0].id;
            club._showVRQuickMenuPage('person');
            const button = club._vrQuickMenuButtons.find(item => item.op === 'peerHost' && item.mesh.isEnabled());
            await club._runVRNetworkAction(button);
            const stillHostAfterFirstPress = club.multiplayer.isHost();
            const elapsed = Date.now() - (club._vrArmed.until - 4000);
            await club._runVRNetworkAction(button);
            return { stillHostAfterFirstPress, elapsed };
        });
        expect(transfer.stillHostAfterFirstPress).toBe(true);
        expect(transfer.elapsed).toBeLessThan(4000);
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.following), { timeout: 30000 }).toBe(true);
        await expect.poll(() => guest.evaluate(() => window.transferGuest.isHost()), { timeout: 30000 }).toBe(true);
        expect(await page.evaluate(() => window.vrClub.isInVRMode && window.vrClub.multiplayer.connected)).toBe(true);
        expect(room.sessions.size).toBe(2);
        expect(room.locked).toBe(true);
        expect(connections).toBe(2);
        await expectHealthyRuntime(page);
    } finally {
        await guest.close();
        clearInterval(room._sweeper);
    }
});
