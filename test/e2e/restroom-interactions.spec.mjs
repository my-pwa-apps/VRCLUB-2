import { test, expect } from '@playwright/test';
import { enterClub, enterVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { ClubRoom } from '../../worker/src/relay.js';

useQuestHarness({ music: true });
test.use({ video: 'off' });

test('restroom controls work by mouse and XR pointer, seats move, water rinses tracked hands and audio is bounded', async ({ page }, testInfo) => {
    test.setTimeout(900000);
    page.setDefaultTimeout(60000);
    await page.addInitScript(() => { localStorage.setItem('vrclub.hiddenPeople', 'dancers,bystanders,dj'); });
    await page.setViewportSize({ width: 800, height: 600 });
    const room = new ClubRoom({}, {});
    room._roomName = 'private-restroom-test';
    const hostFrames = [];
    const hostSocket = { accept() {}, addEventListener() {}, send: data => hostFrames.push(JSON.parse(data)), close() {} };
    const host = room._acceptSession(hostSocket, 'Fixture host', null, 'any');
    await page.routeWebSocket(/.*/, route => {
        const socket = { accept() {}, addEventListener() {}, send: data => route.send(data),
            close: (code, reason) => route.close({ code, reason }) };
        const guest = room._acceptSession(socket, 'Fixture guest', null, 'any');
        route.onMessage(data => room._onMessage(socket, guest, { data }));
        route.onClose(() => room._onClose(socket, guest));
    });
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        await club.scene.whenReadyAsync();
        club.camera.position.set(-15.1, 1.7, -5.4);
        club.camera.setTarget(new BABYLON.Vector3(-15.72, 0.5, -5.4));
    });
    const initial = await page.evaluate(() => {
        const club = window.vrClub, fixtures = club.restroomInteractions;
        return {
            toilets: fixtures.toilets.length, sinks: fixtures.sinks.length,
            wood: club.scene.getMeshByName('restroomStallDoor0').material.name,
            seatHeight: fixtures.toilets[0].seat.getBoundingInfo().boundingBox.maximumWorld.y,
            controls: fixtures.meshes.filter(mesh => mesh.metadata?.vrclubRestroom).length,
            handles: club.scene.meshes.filter(mesh => /^restroomHandle[01]_-?1_DoorHandle3$/.test(mesh.name))
                .map(mesh => {
                    mesh.computeWorldMatrix(true);
                    const mount = mesh.parent.parent;
                    const hinge = mount.parent;
                    const inverse = BABYLON.Matrix.Invert(hinge.computeWorldMatrix(true));
                    const corners = mesh.getBoundingInfo().boundingBox.vectorsWorld
                        .map(point => BABYLON.Vector3.TransformCoordinates(point, inverse));
                    return { triangles: mesh.getTotalIndices() / 3, door: mesh.metadata.vrclubDoor,
                        side: Math.sign(mount.position.x), minX: Math.min(...corners.map(point => point.x)),
                        maxX: Math.max(...corners.map(point => point.x)),
                        lit: club._restroomLight.includedOnlyMeshes.includes(mesh),
                        mirrored: club.restroomMirrorTexture.renderList.includes(mesh) };
                })
        };
    });
    expect(initial.toilets).toBe(2);
    expect(initial.sinks).toBe(2);
    expect(initial.wood).toBe('barWoodMat');
    expect(initial.seatHeight).toBeCloseTo(0.42, 1);
    expect(initial.controls).toBe(16);
    expect(initial.handles).toHaveLength(4);
    for (const handle of initial.handles) {
        expect(handle.triangles).toBe(766);
        expect(handle.lit && handle.mirrored).toBe(true);
        if (handle.side > 0) expect(handle.minX).toBeGreaterThan(0.017);
        else expect(handle.maxX).toBeLessThan(-0.017);
    }

    const press = async name => page.evaluate(name => {
        const club = window.vrClub, mesh = club.scene.getMeshByName(name);
        const point = mesh.getAbsolutePosition();
        club.scene.onPointerDown({ button: 0, pointerId: 1 }, { hit: true, pickedMesh: mesh, pickedPoint: point });
    }, name);
    await press('restroomseat0');
    await page.waitForFunction(() => window.vrClub.restroomInteractions.toilets[0].seatAngle > 1.5);
    expect(await page.evaluate(() => window.vrClub.restroomInteractions.state.seats[0])).toBe(true);
    await press('restroomlid0');
    await page.waitForFunction(() => window.vrClub.restroomInteractions.toilets[0].lidAngle < 0.1);
    expect(await page.evaluate(() => window.vrClub.restroomInteractions.state.seats[0])).toBe(false);
    const cannotSit = await page.evaluate(() => {
        const club = window.vrClub;
        const seat = club.scene.getMeshByName('Bathroom_Toilet').metadata.vrclubSeats[0];
        return club.sitAtSeat(seat);
    });
    expect(cannotSit).toBe(false);
    await press('restroomlid0');
    await page.waitForFunction(() => window.vrClub.restroomInteractions.toilets[0].lidAngle > 1.6);
    const flush = await page.evaluate(() => {
        const club = window.vrClub, fixtures = club.restroomInteractions;
        const cap = club.scene.getMeshByName('restroomflush0');
        club.scene.onPointerDown({ button: 0, pointerId: 1 },
            { hit: true, pickedMesh: cap, pickedPoint: cap.getAbsolutePosition() });
        fixtures.update(1 / 60);
        const sound = fixtures.sounds.get('flush0');
        if (!sound) throw new Error(`Flush audio did not start (${club.audioContext?.state})`);
        const before = fixtures.state.flushes[0];
        const retry = fixtures.action('flush', 0);
        return { retry, unchanged: before === fixtures.state.flushes[0], pannerX: sound.panner.positionX.value,
            worldX: fixtures.toilets[0].position.x };
    });
    expect(flush.retry).toBe(false);
    expect(flush.unchanged).toBe(true);
    expect(flush.pannerX).toBeCloseTo(-flush.worldX, 5);

    await page.evaluate(() => {
        const club = window.vrClub;
        club.camera.position.set(-14.4, 1.7, -5.0);
        club.camera.setTarget(new BABYLON.Vector3(-12.78, 0.8, -5.78));
    });
    await press('restroomTap0');
    await page.waitForFunction(() => window.vrClub.restroomInteractions.sounds.has('tap0'));
    await page.evaluate(async () => {
        for (let i = 0; i < 3; i++) await new Promise(resolve => window.vrClub.scene.onAfterRenderObservable.addOnce(resolve));
    });
    await page.locator('#canvas').screenshot({ path: testInfo.outputPath('tap-and-wood-doors.png') });
    await enterVR(page, { floorPosition: [-13.5, 0, -5.78] });
    await page.evaluate(() => {
        const club = window.vrClub, fixtures = club.restroomInteractions;
        // Use the same scene pointer path as a controller ray, with its own pointer id.
        const cap = club.scene.getMeshByName('restroomTap0');
        fixtures.state.taps[0] = 0;
        club.scene.onPointerDown({ button: 0, pointerId: 2 },
            { hit: true, pickedMesh: cap, pickedPoint: cap.getAbsolutePosition() });
        const device = window.__iwerDevice;
        const hand = fixtures.sinks[0].position.clone(); hand.y -= 0.08;
        const camera = club.vrHelper.baseExperience.camera;
        const local = BABYLON.Vector3.TransformCoordinates(hand, BABYLON.Matrix.Invert(camera.computeWorldMatrix(true)));
        device.controllers.right.position.set(device.position.x + local.x, device.position.y + local.y, device.position.z - local.z);
    });
    await page.waitForFunction(() => window.vrClub.restroomInteractions.sinks[0].rinsing);
    expect(await page.evaluate(() => window.vrClub.restroomInteractions.sinks[0].splash.isEnabled())).toBe(true);
    await page.evaluate(() => {
        const fixtures = window.vrClub.restroomInteractions;
        fixtures.state.taps[0] = fixtures.now() - 1;
        fixtures.state.flushes[0] = fixtures.now() - 1;
    });
    await page.waitForFunction(() => !window.vrClub.restroomInteractions.sinks[0].water.isEnabled() &&
        !window.vrClub.restroomInteractions.sounds.size && !window.vrClub.restroomInteractions.retiringSounds.size);

    // The transport bridge exercises ClubRoom, NetworkClient and ClubMultiplayer without an external relay.
    try {
        expect(await page.evaluate(() => {
            const mp = window.vrClub.multiplayer;
            mp.acceptOnlineSafety();
            if (mp.connected || mp.connecting) mp.disconnect();
            return mp.connect({ serverUrl: `ws://${window.location.host}`, room: 'private-restroom-test' });
        })).toBe(true);
        await page.waitForFunction(() => window.vrClub.multiplayer.connected && window.vrClub.multiplayer.following);
        expect(await page.evaluate(() => window.vrClub.restroomInteractions.action('lid', 0, false))).toBe(true);
        await page.waitForFunction(() => window.vrClub.restroomInteractions.toilets[0].lidAngle < 0.1);
        expect(hostFrames.some(frame => frame.type === 'restroom' && frame.state.lids[0] === false)).toBe(true);
        room._onMessage(hostSocket, host, { data: JSON.stringify({ type: 'restroom', action: 'seat', fixture: 0, on: true }) });
        await page.waitForFunction(() => window.vrClub.restroomInteractions.toilets[0].seatAngle > 1.5);
        await page.evaluate(() => window.vrClub.multiplayer.disconnect());
        await page.waitForFunction(() => !window.vrClub.multiplayer.connected &&
            !window.vrClub.restroomInteractions.state.seats[0] && window.vrClub.restroomInteractions.state.lids[0]);
    } finally {
        for (const [socket, session] of [...room.sessions]) room._onClose(socket, session);
    }
    await expectHealthyRuntime(page);
    expect(await page.evaluate(() => {
        const fixtures = window.vrClub.restroomInteractions;
        fixtures.dispose();
        return fixtures.meshes.length === 0 && fixtures.sounds.size === 0 && fixtures.retiringSounds.size === 0;
    })).toBe(true);
});
