import { test, expect } from '@playwright/test';
import { ClubRoom } from '../../worker/src/relay.js';
import { enterClub, useQuestHarness, expectHealthyRuntime } from './support.mjs';

useQuestHarness();

test('real relay membership and same-base wardrobe updates reach self, mirror and remote bodies without recolouring neighbours', async ({ page, context }) => {
    test.setTimeout(600_000);
    const room = new ClubRoom({}, {});
    room._roomName = 'wardrobe-browser-test';
    const appearance = { v: 1, base: 'm2', hair: 'short', outfit: 'casual', skin: '#b68a64',
        hairColor: '#342a20', top: '#2777aa', bottom: '#263448' };
    const messages = [];
    const remoteSocket = { accept() {}, addEventListener() {}, send: data => messages.push(JSON.parse(data)), close() {} };
    const remote = room._acceptSession(remoteSocket, 'Blue shirt', null, 'any', false, null, 'm2', appearance);
    await context.routeWebSocket(/.*/, route => {
        const socket = { accept() {}, addEventListener() {}, send: data => route.send(data),
            close: (code, reason) => route.close({ code, reason }) };
        const url = new URL(route.url());
        const draft = JSON.parse(url.searchParams.get('appearance') || 'null');
        const guest = room._acceptSession(socket, url.searchParams.get('name'), null, 'any', false, null,
            url.searchParams.get('avatar'), draft);
        route.onMessage(data => room._onMessage(socket, guest, { data }));
        route.onClose(() => room._onClose(socket, guest));
    });
    try {
        await enterClub(page);
        expect(await page.evaluate(async () => {
            const club = window.vrClub;
            await club.modelLoadPromise;
            return club.savePersonalAppearance({ ...window.AvatarAppearance.defaults('m2'), hair: 'long',
                outfit: 'smart', top: '#a13366' });
        })).toBe(true);
        await page.waitForFunction(() => !!window.vrClub._mirrorDouble?.appearanceKey);
        await page.evaluate(() => window.vrClub.multiplayer.joinRoom('wardrobe-browser-test'));
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.connected)).toBe(true);
        await expect.poll(() => page.evaluate(id => !!window.vrClub.avatarManager.remotes.get(id)?.person?.character,
            remote.id), { timeout: 90_000 }).toBe(true);
        const before = await page.evaluate(id => {
            const club = window.vrClub, peer = club.avatarManager.remotes.get(id);
            const colour = node => node.getChildMeshes().find(mesh => mesh.material?.name.includes('wardrobe_top_smart'))?.material.baseColor.asArray();
            window.__wardrobeRemoteBefore = peer.person;
            window.__wardrobeSelfColour = colour(club._mirrorDouble.node);
            return { self: club.multiplayer.client.selfAppearance, remote: peer.appearance,
                customSelf: club._mirrorDouble.appearanceKey, remoteStyle: peer.person.character.url };
        }, remote.id);
        expect(before.self.top).toBe('#a13366');
        expect(before.remote).toEqual(appearance);
        expect(before.remoteStyle).toContain('/wardrobe/');
        expect(await page.evaluate(() => window.vrClub._wardrobeSources.get('m2').users)).toBe(2);
        expect(await page.locator('#editPersonalAvatar').isDisabled()).toBe(false);
        expect(messages.some(message => message.type === 'join' && message.appearance?.top === '#a13366')).toBe(true);
        const changed = { ...appearance, hair: 'long', outfit: 'smart', top: '#22aa44' };
        room._onMessage(remoteSocket, remote, { data: JSON.stringify({ type: 'avatar', avatar: 'm2', appearance: changed }) });
        await expect.poll(() => page.evaluate(id => {
            const peer = window.vrClub.avatarManager.remotes.get(id);
            return peer.person && peer.person !== window.__wardrobeRemoteBefore && peer.appearance.top === '#22aa44';
        }, remote.id), { timeout: 90_000 }).toBe(true);
        const rendered = await page.evaluate(id => {
            const club = window.vrClub, peer = club.avatarManager.remotes.get(id);
            const top = node => node.getChildMeshes().find(mesh => mesh.material?.name.includes('wardrobe_top_smart')).material;
            const own = top(club._mirrorDouble.node), other = top(peer.person.node);
            return { own: own.baseColor.asArray(), previous: window.__wardrobeSelfColour,
                other: other.baseColor.asArray(), expected: window.BABYLON.Color3.FromHexString('#22aa44').toLinearSpace().asArray(),
                sharedTexture: own.baseTexture === other.baseTexture, separateMaterials: own !== other,
                active: peer.person.meshes.filter(mesh => mesh.isEnabled()).length,
                sourceClipsStopped: club._avatarContainers.every(container => container.animationGroups.every(group => !group.isPlaying)) };
        }, remote.id);
        expect(rendered.own).toEqual(rendered.previous);
        expect(rendered.other).toEqual(rendered.expected);
        expect(rendered.sharedTexture && rendered.separateMaterials && rendered.sourceClipsStopped).toBe(true);
        expect(rendered.active).toBeLessThanOrEqual(6);
        expect(await page.evaluate(() => window.vrClub.savePersonalAppearance({
            ...window.vrClub.getAppearanceDraft(), skin: '#d4a788', top: '#884422'
        }))).toBe(true);
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.client.selfAppearance.top)).toBe('#884422');
        expect(messages.some(message => message.type === 'avatar' && message.appearance?.top === '#884422')).toBe(true);
        expect(await page.evaluate(() => window.vrClub.resetPersonalAppearance())).toBe(true);
        await page.waitForFunction(() => !window.vrClub._mirrorDouble?.appearanceKey);
        expect(await page.evaluate(() => localStorage.getItem('vrclub.personalAppearance'))).toBeNull();
        expect(await page.evaluate(() => window.vrClub.multiplayer.client.selfAppearance)).toBeNull();
        expect(await page.evaluate(() => window.vrClub._wardrobeSources.get('m2').users)).toBe(1);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await expect.poll(() => page.evaluate(() => window.vrClub._wardrobeSources.size)).toBe(0);
        await expectHealthyRuntime(page);
    } finally {
        for (const [socket, session] of [...room.sessions]) room._onClose(socket, session);
    }
});
