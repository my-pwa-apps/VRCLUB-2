import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness, expectHealthyRuntime } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';
import { fileURLToPath } from 'node:url';

useQuestHarness();

test('host DJ presence and audio effects reach the real club, survive late join and never process a broadcast twice', async ({ page, context }) => {
    test.setTimeout(900_000);
    const room = new ClubRoom({});
    await context.routeWebSocket(/vrclub-network\.garfieldapp\.workers\.dev/, route => {
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
    const host = await context.newPage();
    try {
        await host.route('**/performance-host-test', route => route.fulfill({
            contentType: 'text/html', body: '<p>Room performance host</p>'
        }));
        await host.goto('/performance-host-test');
        await host.addScriptTag({ path: fileURLToPath(new URL('../../js/networkClient.js', import.meta.url)) });
        await host.evaluate(() => {
            window.performanceHost = new window.NetworkClient({
                serverUrl: 'wss://vrclub-network.garfieldapp.workers.dev', room: 'private-performance', name: 'Host'
            });
            window.performanceHost.connect();
        });
        await host.waitForFunction(() => window.performanceHost.isHost());
        await enterClub(page);
        await page.evaluate(async () => {
            const club = window.vrClub;
            await club.modelLoadPromise;
            club.multiplayer.connect({ room: 'private-performance', name: 'Listener' });
        });
        await page.waitForFunction(() => window.vrClub.multiplayer.following);
        await expect.poll(() => page.evaluate(() => !!window.vrClub.npcAvatars.find(npc => npc.name === 'djPerformer'))).toBe(true);
        const effects = { lowpass: 0.7, highpass: 0.2, echo: 0.3, flanger: 0.4, reverb: 0.5,
            phaser: 0.6, sweep: 0.7, gater: 0.8, channel: 0.4 };
        await host.evaluate(audioFx => window.performanceHost.sendShow({ m: 'show', mv: 'pulse', cue: 0, dj: false, audioFx }), effects);
        const state = () => page.evaluate(() => {
            const club = window.vrClub;
            return {
                dj: club.npcAvatars.find(npc => npc.name === 'djPerformer').root.isEnabled(),
                player: club._vjDesk.playerVisible,
                effects: club.djEffectsSnapshot(),
                lowpass: club.djFxLowpass.frequency.value,
                channel: club.djFxChannel.gain.value,
                preference: localStorage.getItem('vrclub.hiddenPeople')
            };
        });
        await expect.poll(async () => (await state()).dj).toBe(false);
        await expect.poll(async () => (await state()).effects).toEqual(effects);
        await expect.poll(async () => (await state()).channel).toBeCloseTo(0.16, 3);
        await expect.poll(async () => (await state()).lowpass).toBeCloseTo(20000 * Math.pow(250 / 20000, 0.7), 1);
        expect((await state()).player).toBe(true);
        expect((await state()).preference).toBeNull();
        expect(await page.evaluate(() => window.vrClub.setDJEffect('channel', 0))).toBe(false);

        await enterVR(page);
        const vr = await page.evaluate(() => {
            const club = window.vrClub;
            club.toggleVRQuickMenu(true);
            club._showVRQuickMenuPage('crowd');
            const button = club._vrQuickMenuButtons.find(item => item.people === 'dj');
            return { enabled: button.mesh.isEnabled(), value: club._vrQuickMenuButtonValue(button, false),
                desk: club._vjDeskButtonState(window.VJDeskLayout.buttons.show.find(item => item.kind === 'dj')).value };
        });
        expect(vr).toEqual({ enabled: true, value: 'HOST SENT DJ HOME', desk: 'HOST SENT HOME' });

        // A personal hide survives the host bringing the room DJ back; unhiding cannot clear the host effects.
        await page.evaluate(() => window.vrClub.setPeopleVisible('dj', false));
        await host.evaluate(audioFx => window.performanceHost.sendShow({ m: 'manual', dj: true, audioFx }), effects);
        await page.waitForFunction(() => window.vrClub._roomDJVisible === true);
        expect((await state()).dj).toBe(false);
        await page.evaluate(() => window.vrClub.setPeopleVisible('dj', true));
        await expect.poll(async () => (await state()).dj).toBe(true);
        expect((await state()).effects).toEqual(effects);
        await expect.poll(async () => (await state()).channel).toBeCloseTo(0.16, 3);

        const broadcast = await page.evaluate(async () => {
            const club = window.vrClub;
            const destination = club.audioContext.createMediaStreamDestination();
            const oscillator = club.audioContext.createOscillator();
            oscillator.connect(destination);
            oscillator.start();
            const remote = club.startNetworkMusic(destination.stream, { playing: true, title: 'Processed file test' });
            await new Promise(resolve => setTimeout(resolve, 400));
            const values = {
                lowpass: club.djFxLowpass.frequency.value, channel: club.djFxChannel.gain.value,
                echo: club.djFxEchoWet.gain.value, sweep: club.djFxExtra.sweepWet.gain.value,
                gater: club.djFxExtra.gaterDepth.gain.value, readout: club.djEffectsSnapshot()
            };
            club.stopNetworkMusic(remote);
            oscillator.stop();
            oscillator.disconnect();
            for (const track of destination.stream.getTracks()) track.stop();
            destination.disconnect();
            return values;
        });
        expect(broadcast.lowpass).toBeCloseTo(20000, 0);
        expect(broadcast.channel).toBeCloseTo(1, 3);
        expect(broadcast.echo).toBeCloseTo(0, 3);
        expect(broadcast.sweep).toBeCloseTo(0, 3);
        expect(broadcast.gater).toBeCloseTo(0, 3);
        expect(broadcast.readout).toEqual(effects);

        await host.evaluate(audioFx => window.performanceHost.sendShow({ m: 'show', mv: 'pulse', cue: 0, dj: false, audioFx }), effects);
        await expect.poll(async () => (await state()).dj).toBe(false);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await expect.poll(async () => (await state()).dj).toBe(true);
        expect((await state()).effects).toEqual({ lowpass: 0, highpass: 0, echo: 0, flanger: 0, reverb: 0,
            phaser: 0, sweep: 0, gater: 0, channel: 1 });
        await page.evaluate(() => window.vrClub.multiplayer.connect({ room: 'private-performance', name: 'Late listener' }));
        await page.waitForFunction(() => window.vrClub.multiplayer.following);
        await expect.poll(async () => (await state()).dj).toBe(false);
        expect((await state()).effects).toEqual(effects);
        expect((await state()).preference).toBeNull();
        await expectHealthyRuntime(page);
    } finally {
        await page.evaluate(() => window.vrClub?.multiplayer?.disconnect());
        await host.close();
        clearInterval(room._sweeper);
    }
});

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
    await expect(page.locator('#networkSafetyGate')).toBeVisible();
    await expect(page.locator('#networkRoomBrowser')).toBeHidden();
    await page.locator('#networkSafetyContinue').click();
    expect(await page.evaluate(() => localStorage.getItem('vrclub.onlineSafety'))).toBe('1');
    await expect(page.locator('#networkSafetyGate')).toBeHidden();
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
    await page.locator('#networkClose').click();
    await page.locator('#networkToggle').click();
    await expect(page.locator('#networkSafetyGate')).toBeHidden();
    await page.locator('#networkClose').click();
    await enterVR(page);
    const safety = await page.evaluate(async () => {
        const club = window.vrClub;
        const mp = club.multiplayer;
        localStorage.removeItem('vrclub.onlineSafety');
        mp._onlineSafetyAccepted = false;
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage('online');
        const guide = club._vrQuickMenuPage;
        const accept = club._vrQuickMenuButtons.find(button => button.op === 'safetyAccept');
        await club._runVRNetworkAction(accept);
        return { guide, after: club._vrQuickMenuPage, accepted: mp.hasAcceptedOnlineSafety() };
    });
    expect(safety).toEqual({ guide: 'onlineSafety', after: 'online', accepted: true });
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
        localStorage.setItem('vrclub.onlineSafety', '1');
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
        await page.getByRole('button', { name: 'Report Guest to the room host and immediately block contact both ways', exact: true }).click();
        await page.getByRole('combobox', { name: 'Reason for reporting Guest', exact: true }).selectOption('unwanted-contact');
        await page.getByRole('button', { name: 'Report and block Guest', exact: true }).click();
        await expect(page.locator('#networkModerationReports')).toContainText('Host reported Guest: Repeated unwanted contact');
        await guest.waitForFunction(() => window.transferGuest.peerCount === 0);
        expect(await page.evaluate(() => window.vrClub.multiplayer.blockedList().length)).toBe(1);
        await page.evaluate(() => {
            const mp = window.vrClub.multiplayer;
            mp.unblock(mp.blockedList()[0].pid);
        });
        await expect(page.locator('#networkPeopleList')).toContainText('Guest');
        await page.locator('#networkModerationReports').getByRole('button', { name: 'Dismiss this safety report' }).click();
        await expect(page.locator('#networkModerationReports')).toContainText('No safety reports.');
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
        await page.locator('#networkClose').click();
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
