import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ClubRoom } from '../../worker/src/relay.js';
import { validateAvatarGlb } from '../../worker/src/avatarAssets.js';
import { enterClub, useQuestHarness } from './support.mjs';

useQuestHarness();

function fixture() {
    if (process.env.VRCLUB_TEST_PERSONAL_AVATAR) return readFileSync(process.env.VRCLUB_TEST_PERSONAL_AVATAR);
    const source = readFileSync(new URL('../../js/models/avatars/club-crowd-m1.glb', import.meta.url));
    const length = source.readUInt32LE(12), json = JSON.parse(source.subarray(20, 20 + length));
    const names = { Body: 'Hips', Hips: 'PelvisAux', Abdomen: 'Spine', Torso: 'Spine1', Chest: 'Spine2' };
    for (const side of ['L', 'R']) {
        const prefix = side === 'L' ? 'Left' : 'Right';
        for (const [from, to] of Object.entries({ Shoulder: 'Shoulder', UpperArm: 'Arm', LowerArm: 'ForeArm',
            Wrist: 'Hand', UpperLeg: 'UpLeg', LowerLeg: 'Leg', Foot: 'Foot', PT: 'ToeBase' })) {
            names[`${from}.${side}`] = `${prefix}${to}`;
        }
    }
    for (const node of json.nodes) node.name = names[node.name] || node.name;
    delete json.animations;
    const text = Buffer.from(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4;
    const result = Buffer.alloc(20 + padded + source.length - 20 - length, 32);
    source.copy(result, 0, 0, 20);
    text.copy(result, 20); source.copy(result, 20 + padded, 20 + length);
    result.writeUInt32LE(result.length, 8); result.writeUInt32LE(padded, 12);
    return result;
}

test('uploaded wardrobe keeps identity, mirrors facing and shares the real customized humanoid with room members', async ({ page, context, browser }) => {
    test.setTimeout(600_000);
    const model = fixture();
    validateAvatarGlb(model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength));
    const objects = new Map(), pending = [];
    const room = new ClubRoom({ id: 'browser-avatar-room', waitUntil: promise => pending.push(promise) }, {
        AVATAR_ASSETS: {
            async put(key, bytes) { objects.set(key, bytes.slice(0)); },
            async get(key) {
                const bytes = objects.get(key);
                return bytes ? { size: bytes.byteLength, body: new Blob([bytes]).stream() } : null;
            },
            async delete(key) { objects.delete(key); }
        }
    });
    room._roomName = 'private-avatars';
    const receiverContext = await browser.newContext({ baseURL: 'http://localhost:4173', serviceWorkers: 'block' });
    const receiver = await receiverContext.newPage();
    const failures = [];
    receiver.on('pageerror', error => failures.push(error.message));
    receiver.on('console', message => {
        if (/avatar/i.test(message.text()) && ['error', 'warning'].includes(message.type())) {
            console.log(`Receiver ${message.type()}: ${message.text()}`);
        }
    });
    await receiver.addInitScript(() => {
        localStorage.setItem('vrclub.graphicsTier', 'balanced');
        localStorage.setItem('vrclub.safeMode', '1');
    });
    let downloads = 0;
    const bridge = async ctx => {
        await ctx.route('**/avatars?*', async route => {
            const request = route.request();
            const response = await room.fetch(new Request(request.url(), { method: request.method(),
                headers: request.headers(), body: request.postDataBuffer() }));
            if (request.method() === 'GET') downloads++;
            await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers),
                body: Buffer.from(await response.arrayBuffer()) });
        });
        await ctx.routeWebSocket(/.*/, route => {
            const socket = { accept() {}, addEventListener() {}, send: data => route.send(data),
                close: (code, reason) => route.close({ code, reason }) };
            const member = room._acceptSession(socket, new URL(route.url()).searchParams.get('name'));
            route.onMessage(data => room._onMessage(socket, member, { data }));
            route.onClose(() => room._onClose(socket, member));
        });
    };
    await bridge(context); await bridge(receiverContext);
    await page.route('**/avatar-test-fixture.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: model }));
    try {
        await enterClub(page);
        await page.evaluate(async () => {
            const club = window.vrClub;
            club.engine.stopRenderLoop();
            await club.modelLoadPromise;
            const bytes = await (await fetch('/avatar-test-fixture.glb')).arrayBuffer();
            await club.loadCustomAvatarGlb(bytes, 'Browser fixture', { persist: false });
            club._getAvatarEditor().open();
        });
        const editor = page.getByRole('dialog', { name: 'Uploaded avatar wardrobe' });
        await expect(editor).toBeVisible();
        await editor.locator('[name=outfit]').selectOption('casual');
        await editor.locator('[name=top]').fill('#b94466');
        await editor.locator('[name=bottom]').fill('#24344a');
        await editor.locator('[name=glasses]').selectOption('round');
        await editor.locator('[name=hat]').selectOption('beanie');
        await editor.getByRole('button', { name: 'Apply and save' }).click();
        await expect(editor.getByRole('status')).toHaveText('Uploaded appearance applied and saved.');
        await editor.getByRole('button', { name: 'Close', exact: true }).click();
        const look = await page.evaluate(() => {
            const club = window.vrClub, rig = club._localRig;
            const clothing = rig.meshes.filter(mesh => mesh.metadata?.vrclubCustomAppearance);
            if (clothing.length !== 4) throw new Error('The uploaded garment/accessory geometry is missing.');
            const skin = clothing.find(mesh => mesh.name.endsWith('_custom_skin'));
            if (skin.material !== rig.meshes.find(mesh => !mesh.metadata?.vrclubCustomAppearance).material) {
                throw new Error('Uploaded face material was replaced.');
            }
            rig.update(1 / 60, { x: 0, z: 0, groundY: 0, eyeY: 1.7, headYaw: Math.PI, bodyYaw: Math.PI, headPitch: 0 });
            rig.setEyeHeight(1.8);
            if (Math.abs(rig.yaw0) > 0.01) throw new Error('Turned refit changed bind-facing.');
            const vr = club._getAvatarEditor();
            if (!vr.openVR()) throw new Error('Uploaded VR editor did not open.');
            const definitions = vr.getVRDefinitions('appearanceEditor');
            vr.closeVR();
            if (!definitions.some(button => button.label === 'APPLY AND SAVE')) throw new Error('Uploaded VR controls missing.');
            if (!club.isCustomAvatarSelected()) throw new Error('Editing switched away from uploaded identity.');
            club.multiplayer.acceptOnlineSafety();
            club.multiplayer.connect({ serverUrl: `ws://${location.host}`, room: 'private-avatars', name: 'Publisher' });
            club.setCustomAvatarSharing(true);
            return club.getCustomAvatarAppearance();
        });
        await expect.poll(() => objects.size, { timeout: 30_000 }).toBe(1);
        await enterClub(receiver);
        await receiver.evaluate(async () => {
            const club = window.vrClub;
            club.engine.stopRenderLoop();
            await club.modelLoadPromise;
            club.multiplayer.acceptOnlineSafety();
            club.multiplayer.connect({ serverUrl: `ws://${location.host}`, room: 'private-avatars', name: 'Receiver' });
        });
        const owner = [...room.sessions.values()].find(member => member.name === 'Publisher');
        const remote = () => receiver.evaluate(id => {
            const manager = window.vrClub.avatarManager;
            manager.update(1 / 60);
            const peer = manager.remotes.get(id);
            if (peer?.loadErrorShown) throw new Error(`Shared avatar failed to build; retry=${peer.detailRetryAt}, metadata=${JSON.stringify(peer.uploadedAvatar)}`);
            return peer?.person?.rig ? {
                appearance: peer.uploadedAvatar.appearance,
                garments: peer.person.meshes.filter(mesh => mesh.metadata?.vrclubCustomAppearance).length,
                visible: peer.person.rig.root.isEnabled()
            } : null;
        }, owner.id);
        await expect.poll(remote, { timeout: 90_000 }).toMatchObject({ appearance: look, garments: 4 });
        expect(downloads).toBe(1);
        await page.evaluate(() => window.vrClub.multiplayer.client.sendState({
            x: 4, y: 1.7, z: -8, rotY: Math.PI, floorY: 0, eh: 1.7,
            hands: { left: { x: -0.3, y: -0.4, z: 0.3, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 } }
        }));
        await expect.poll(() => receiver.evaluate(id => window.vrClub.avatarManager.remotes.get(id)?.hasState, owner.id)).toBe(true);
        const rendered = await receiver.evaluate(id => {
            const club = window.vrClub, manager = club.avatarManager;
            for (let i = 0; i < 29; i++) manager.update(1 / 60);
            club.scene.render();
            const peer = manager.remotes.get(id), person = peer.person;
            return { x: person.pose.x, z: person.pose.z,
                rootError: Math.hypot(person.rig.root.position.x - person.pose.x, person.rig.root.position.z - person.pose.z),
                hand: !!person.pose.left, garmentsVisible: person.meshes.filter(mesh =>
                    mesh.metadata?.vrclubCustomAppearance && mesh.isEnabled()).length };
        }, owner.id);
        expect(rendered.x).toBeCloseTo(4, 1);
        expect(rendered.z).toBeCloseTo(-8, 1);
        expect(rendered.rootError).toBeLessThan(0.2);
        expect(rendered.hand).toBe(true);
        expect(rendered.garmentsVisible).toBe(4);
        await page.evaluate(() => {
            const club = window.vrClub;
            club.setCustomAvatarAppearance({ ...club.getCustomAvatarAppearance(), outfit: 'smart', top: '#668844' });
        });
        await expect.poll(remote, { timeout: 90_000 }).toMatchObject({ appearance: { outfit: 'smart', top: '#668844' }, garments: 4 });
        await page.evaluate(() => window.vrClub.setCustomAvatarSharing(false));
        await expect.poll(() => objects.size).toBe(0);
        await expect.poll(() => receiver.evaluate(id => {
            window.vrClub.avatarManager.update(1 / 60);
            const peer = window.vrClub.avatarManager.remotes.get(id);
            return !!peer?.person && !peer.person.rig && !peer.uploadedAvatar;
        }, owner.id), { timeout: 90_000 }).toBe(true);
        expect(failures).toEqual([]);
    } finally {
        await receiverContext.close();
        for (const [socket, member] of [...room.sessions]) room._onClose(socket, member);
        await Promise.all(pending);
    }
});
