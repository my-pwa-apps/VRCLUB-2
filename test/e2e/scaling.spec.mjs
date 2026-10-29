import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness, expectHealthyRuntime, browserFailures } from './support.mjs';

useQuestHarness();

test('all 31 remote people retain Quaternius bodies and visible dancing from the balcony and in VR', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    await page.evaluate(() => {
        const club = window.vrClub;
        const client = club.networkManager = new window.NetworkClient();
        client.capacity = 32;
        client.status = 'connected';
        client._send = () => {};
        const manager = club.avatarManager = new window.AvatarManager(club);
        manager.setPersonalSpace(false);
        club.moveCameraToPreset('balcony');
        club.camera.position.set(-10.7, 4.7, -13);
        club.camera.setTarget(new BABYLON.Vector3(0, 0.9, -11));
        for (let i = 0; i < 31; i++) {
            const x = -7 + (i % 5) * 3.5;
            manager.updatePeerState(`load${i}`, `Guest ${i + 1}`,
                { x, y: 1.7, z: -6.5 - Math.floor(i / 5) * 1.5, rotY: 0 }, { avatar: ['f1', 'f2', 'm1', 'm2'][i % 4] });
            manager.playGesture(`load${i}`, 'dance');
        }
        window.__blueSeen = false;
        club.scene.onAfterRenderObservable.add(() => {
            if ([...manager.remotes.values()].some(p => p.body.isVisible)) window.__blueSeen = true;
        });
    });
    const details = () => page.evaluate(() => window.vrClub.avatarManager.getDiagnostics());
    try {
        await expect.poll(async () => (await details()).detailedAvatars, { timeout: 120_000 }).toBe(31);
    } catch (error) {
        console.log('SCALING_FAILURE', JSON.stringify({
            errors: browserFailures.get(page)?.slice(-10),
            scene: await page.evaluate(() => ({
                capacity: window.vrClub.networkManager?.capacity,
                poseTime: window.vrClub.avatarManager._poseTime,
                building: window.vrClub.avatarManager._buildingPerson,
                camera: window.vrClub.camera.position.asArray()
            }))
        }));
        throw error;
    }
    expect((await details()).participants).toBe(32);
    expect((await details()).fallbackAvatars).toBe(0);
    const desktop = await page.evaluate(async () => {
        const club = window.vrClub, manager = club.avatarManager, camera = club.camera;
        const frame = () => new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        for (let i = 0; i < 3; i++) await frame();
        window.__remoteNodes = [...manager.remotes.values()].map(peer => peer.person.node);
        const out = { frozen: [], wrongClip: [], visible: 0, distantVisible: 0, held: 0 };
        const planes = Array.from({ length: 6 }, () => new BABYLON.Plane(0, 0, 0, 0));
        const start = camera.rotation.y;
        for (let step = 0; step < 30; step++) {
            camera.rotation.y = start + step * Math.PI / 15;
            await frame();
            BABYLON.Frustum.GetPlanesToRef(club.scene.getTransformMatrix(), planes);
            for (const peer of manager.remotes.values()) {
                const p = peer.root.position;
                const visible = [0.1, 0.9, 1.7].some(h =>
                    BABYLON.Frustum.IsPointInFrustum(new BABYLON.Vector3(p.x, p.y + h, p.z), planes));
                if (peer.animPaused) out.held++;
                if (!visible) continue;
                out.visible++;
                if (BABYLON.Vector3.Distance(p, camera.position) > 15) out.distantVisible++;
                if (!peer.person.groups[peer.person.current].isPlaying) out.frozen.push(peer.id);
                if (peer.person.current !== 'Dance_Loop') out.wrongClip.push(peer.id);
            }
        }
        camera.rotation.y = start;
        return out;
    });
    expect(desktop.visible).toBeGreaterThan(0);
    expect(desktop.distantVisible, 'balcony views retain normal distant dancing').toBeGreaterThan(0);
    expect(desktop.held, 'unseen poses can pause without replacing a body').toBeGreaterThan(0);
    expect(desktop.frozen).toEqual([]);
    expect(desktop.wrongClip).toEqual([]);
    await enterVR(page, { floorPosition: [-10.7, 4.7, -13] });
    await page.evaluate(() => {
        const club = window.vrClub;
        club.graphicsTier = 'high';
    });
    await expect.poll(async () => (await details()).detailedAvatars).toBe(31);
    expect((await details()).participants).toBe(32);
    console.log('SCALING_XR', JSON.stringify(await details()));
    await page.evaluate(() => window.vrClub.graphicsTier = 'balanced');
    const xr = await page.evaluate(async () => {
        const club = window.vrClub;
        const frame = () => new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        let visible = 0;
        const frozen = [];
        for (let step = 0; step < 12; step++) {
            const half = step * Math.PI / 12;
            window.__iwerDevice.quaternion.set(0, Math.sin(half), 0, Math.cos(half));
            await frame();
            const planes = BABYLON.Frustum.GetPlanes(club.scene.getTransformMatrix());
            for (const peer of club.avatarManager.remotes.values()) {
                const p = peer.root.position;
                if (![0.1, 0.9, 1.7].some(h =>
                    BABYLON.Frustum.IsPointInFrustum(new BABYLON.Vector3(p.x, p.y + h, p.z), planes))) continue;
                visible++;
                if (!peer.person.groups[peer.person.current].isPlaying) frozen.push(peer.id);
            }
        }
        return {
            visible, frozen, blue: window.__blueSeen,
            sameNodes: [...club.avatarManager.remotes.values()].every((peer, i) => peer.person.node === window.__remoteNodes[i])
        };
    });
    expect(xr.visible).toBeGreaterThan(0);
    expect(xr.frozen).toEqual([]);
    expect(xr.blue).toBe(false);
    expect(xr.sameNodes, 'camera and tier changes never rebuild a guest or restart their clip').toBe(true);
    await expect.poll(async () => (await details()).detailedAvatars).toBe(31);
    await expectHealthyRuntime(page);
});
