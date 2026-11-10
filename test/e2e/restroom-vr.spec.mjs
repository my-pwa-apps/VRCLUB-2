import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// In a headset the restroom mirror used to refresh every other frame (one eye's reflection shown to both, trailing the
// head) and was also drawn a second time as a custom render target. It now renders through the mirror material, every
// frame, per eye, at headset size.
test('in VR the restroom mirror refreshes every frame at a headset-sized texture and is drawn once per eye', async ({ page }) => {
    test.setTimeout(1_200_000);
    await enterClub(page);
    await enterVR(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene, cam = club.vrHelper.baseExperience.camera;
        await club.modelLoadPromise;
        club.setGraphicsTier('ultra', { persist: false });
        const frames = async n => { for (let i = 0; i < n; i++) await new Promise(r => scene.onAfterRenderObservable.addOnce(r)); };
        await frames(4);
        cam.position.x = -14.4; cam.position.z = -1.72;
        cam.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
        await frames(12);
        const tex = club.restroomMirrorTexture;
        let renders = 0;
        const observer = tex.onAfterRenderObservable.add(() => { renders++; });
        await frames(12);
        tex.onAfterRenderObservable.remove(observer);
        return {
            vr: club.isInVRMode, refreshRate: tex.refreshRate, size: tex.getSize().width, samples: tex.samples,
            rendersPerFrame: renders / 12, custom: scene.customRenderTargets.includes(tex), tier: club.graphicsTier,
            facing: cam.getDirection(BABYLON.Axis.Z).x
        };
    });
    expect(result.vr).toBe(true);
    expect(result.custom, 'the mirror is not also a custom render target').toBe(false);
    expect(result.refreshRate, 'every frame, so the reflection never trails the head').toBe(1);
    expect(result.tier).toBe('ultra');
    expect(result.size).toBe(1024);
    expect(result.samples).toBe(2);
    expect(result.rendersPerFrame, `drawn ${result.rendersPerFrame} times a frame`).toBeLessThanOrEqual(2.2);
    expect(result.rendersPerFrame).toBeGreaterThanOrEqual(0.8);
    const doors = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene, cam = club.vrHelper.baseExperience.camera;
        club.setGraphicsTier('balanced', { persist: false });
        const next = () => new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
        const frames = async n => { for (let i = 0; i < n; i++) await next(); };
        const previous = club.avatarManager;
        const manager = club.avatarManager = new window.AvatarManager(club);
        const door = club._restroomDoors[0], R = window.VenueLayout.restroom;
        const pose = seated => ({ x: R.toiletSeatX, y: 1.1, z: R.toiletZ[0], seated, floorY: 0, rotY: Math.PI / 2 });
        const left = window.__iwerDevice.controllers.left;
        try {
            window.__iwerDevice.position.set(0, 1.6, 0);
            manager.updatePeerState('stall-guest', 'Occupied', pose(true));
            for (let i = 0; i < 40 && door.open !== 0; i++) await next();
            const teleport = club.vrHelper.teleportation;
            const blockers = teleport._options.pickBlockerMeshes;
            const ray = new BABYLON.Ray(
                new BABYLON.Vector3(door.frontX + 0.9, 0.9, (door.opening[0] + door.opening[1]) / 2),
                new BABYLON.Vector3(-1, 0, 0), 2);
            const hit = scene.pickWithRay(ray, mesh => blockers.includes(mesh));
            const blockedRay = !!hit.hit && hit.pickedMesh === door.leaf;
            club._pressStallDoor({ pickedMesh: door.leaf });
            const stayedLocked = door.remote && !club._doorsByHand[0] && door.leaf.checkCollisions;
            club.setVRComfortMode(false);
            cam.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, -Math.PI / 2, 0);
            cam.position.set(door.frontX + 0.9, 1.6, (door.opening[0] + door.opening[1]) / 2);
            if (cam._deferOnly && cam._deferredUpdated) cam._deferredPositionUpdate.copyFrom(cam.position);
            club._walkLevel = 0;
            await frames(6);
            left.updateAxes('thumbstick', 0, -1);
            await frames(40);
            left.updateAxes('thumbstick', 0, 0);
            const closedStop = cam.position.x - door.frontX;
            manager.updatePeerState('stall-guest', 'Occupied', pose(false));
            for (let i = 0; i < 40 && door.open !== 1; i++) await next();
            const removedBlocker = !club._xrTeleportBlockers.includes(door.leaf);
            left.updateAxes('thumbstick', 0, -1);
            for (let i = 0; i < 60 && cam.position.x > door.frontX - 0.4; i++) await next();
            left.updateAxes('thumbstick', 0, 0);
            const openCrossing = cam.position.x - door.frontX;
            const balancedSize = club.restroomMirrorTexture.getSize().width;
            cam.position.set(0, 1.6, -12);
            if (cam._deferOnly && cam._deferredUpdated) cam._deferredPositionUpdate.copyFrom(cam.position);
            await frames(4);
            return { blockedRay, stayedLocked, closedStop, openCrossing, removedBlocker, balancedSize,
                outsideRefresh: club.restroomMirrorTexture.refreshRate };
        } finally {
            left.updateAxes('thumbstick', 0, 0);
            manager.dispose();
            club.avatarManager = previous;
        }
    });
    expect(doors.blockedRay, 'a newly closed door blocks the already enabled teleport feature').toBe(true);
    expect(doors.stayedLocked, 'pressing an occupied door cannot open it').toBe(true);
    expect(doors.closedStop, 'real thumbstick movement stops outside the locked door').toBeGreaterThan(0.23);
    expect(doors.closedStop).toBeLessThan(0.4);
    expect(doors.removedBlocker, 'opening removes the teleport blocker bookkeeping').toBe(true);
    expect(doors.openCrossing, 'the same thumbstick movement passes through after the occupant leaves').toBeLessThan(-0.35);
    expect(doors.balancedSize).toBe(384);
    expect(doors.outsideRefresh, 'leaving the restroom stops mirror rendering').toBe(0);
    await expectHealthyRuntime(page);
});
