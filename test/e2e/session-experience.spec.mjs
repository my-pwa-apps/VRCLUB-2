import { test, expect } from '@playwright/test';
import { ClubRoom } from '../../worker/src/relay.js';
import { enterClub, useQuestHarness } from './support.mjs';

useQuestHarness();

test('real room snapshots attach held water to both bodies and delegate only lights', async ({ page, context }) => {
    test.setTimeout(600_000);
    await page.addInitScript(() => localStorage.setItem('vrclub.hiddenPeople', 'dancers,bystanders,dj'));
    await page.setViewportSize({ width: 800, height: 600 });
    const room = new ClubRoom({}, {});
    room._roomName = 'session-experience-browser';
    const hostMessages = [];
    const hostSocket = { accept() {}, addEventListener() {}, send: data => hostMessages.push(JSON.parse(data)), close() {} };
    const host = room._acceptSession(hostSocket, 'Host', null, 'any', false, null, 'm2');
    const send = (socket, session, frame) => room._onMessage(socket, session, { data: JSON.stringify(frame) });
    send(hostSocket, host, { type: 'state', state: { x: 9, y: 1.7, z: -7.5, rotY: 0 } });
    send(hostSocket, host, { type: 'water', action: 'order' });
    send(hostSocket, host, { type: 'water', action: 'pickup', hand: 'right' });
    let guestSocket, guest;
    await context.routeWebSocket(/.*/, route => {
        guestSocket = { accept() {}, addEventListener() {}, send: data => route.send(data),
            close: (code, reason) => route.close({ code, reason }) };
        const url = new URL(route.url());
        guest = room._acceptSession(guestSocket, url.searchParams.get('name'), null, 'any', false, null, 'f1');
        route.onMessage(data => room._onMessage(guestSocket, guest, { data }));
        route.onClose(() => room._onClose(guestSocket, guest));
    });
    try {
        await enterClub(page);
        await page.evaluate(async () => {
            const club = window.vrClub;
            await club.modelLoadPromise;
            club.camera.position.set(9, 1.7, -7.5);
            club.multiplayer.joinRoom('session-experience-browser');
        });
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.connected), { timeout: 60_000 }).toBe(true);
        await page.evaluate(() => window.vrClub.avatarManager.setPersonalSpace(false));
        await expect.poll(() => page.evaluate(id => {
            const club = window.vrClub;
            return club._sessionExperience.drinks.some(d => d.id === id && d.held) &&
                !!club.avatarManager.remotes.get(id)?.person?.arms;
        }, host.id), { timeout: 90_000 }).toBe(true);
        await expect.poll(() => page.evaluate(() => !!window.vrClub._mirrorDouble?.shown), { timeout: 90_000 }).toBe(true);
        await expect.poll(() => page.evaluate(id => {
            const state = window.vrClub._sessionExperience;
            const cup = state.cups[state.drinks.find(d => d.id === id).slot];
            return cup.isEnabled() && !!cup._sessionGrip?.wrist;
        }, host.id), { timeout: 90_000 }).toBe(true);
        send(guestSocket, guest, { type: 'state', state: { x: 9, y: 1.7, z: -7.5, rotY: 0 } });
        await page.evaluate(() => window.vrClub.pressSessionExperience({ pickedMesh: window.vrClub._sessionExperience.station.mesh }));
        await expect.poll(() => room.drinks.get(guest.id)?.held).toBe(false);
        await page.evaluate(() => window.vrClub.pressSessionExperience({ pickedMesh: window.vrClub._sessionExperience.station.mesh }));
        await expect.poll(() => room.drinks.get(guest.id)?.held).toBe(true);
        await expect.poll(() => page.evaluate(() => {
            const club = window.vrClub, state = club._sessionExperience;
            const cup = state.cups[state.drinks.find(d => d.id === club.multiplayer.client.selfId).slot];
            return cup.isEnabled() && !!cup._sessionGrip?.wrist;
        }), { timeout: 90_000 }).toBe(true);
        send(hostSocket, host, { type: 'state', state: { x: 9, y: 1.7, z: -7.5, rotY: 0 } });
        send(guestSocket, guest, { type: 'state', state: { x: 9.5, y: 1.7, z: -7.5, rotY: 0 } });
        await page.evaluate(id => {
            const club = window.vrClub, state = club._sessionExperience;
            club.pressSessionExperience({ pickedMesh: state.cups[state.drinks.find(d => d.id === id).slot] });
        }, host.id);
        await expect.poll(() => hostMessages.some(message => message.type === 'water-clink' && message.target === host.id)).toBe(true);
        send(hostSocket, host, { type: 'vj-pass', target: guest.id });
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.canControlLights())).toBe(true);
        expect(await page.evaluate(() => window.vrClub.multiplayer.isHost())).toBe(false);
        expect(await page.evaluate(() => window.vrClub.guardHostControl('music'))).toBe(false);
        expect(await page.evaluate(() => window.vrClub.setCharacterStyle('diverse'))).toBe(false);
        expect(await page.evaluate(() => window.vrClub.setDJEffect('echo', 1))).toBe(false);
        send(hostSocket, host, { type: 'vj-pass', target: null });
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.canControlLights())).toBe(false);
        room._onClose(hostSocket, host);
        await expect.poll(() => page.evaluate(id => !window.vrClub._sessionExperience.drinks.some(d => d.id === id), host.id)).toBe(true);
        await expect.poll(() => page.evaluate(() => !window.vrClub._sessionExperience.cups[0].isEnabled())).toBe(true);
    } finally {
        for (const [socket, session] of [...room.sessions]) room._onClose(socket, session);
    }
});
