import { test, expect } from '@playwright/test';
import { enterClub, enterVR, exitVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

/** Spawn is the dance-floor centre, turned to face the stage (Babylon copies the desktop camera's yaw). */
const SPAWN = { x: 0, y: 1.6, z: -12 };

/** XR local-floor space (right-handed, -z forward) -> Babylon world while the user faces -z from SPAWN. */
const xrToWorld = ([x, y, z]) => [-x, y, z + SPAWN.z];
const worldToXr = ([x, y, z]) => [-x, y, z - SPAWN.z];

const headPose = page => page.evaluate(() => {
    const camera = window.vrClub.vrHelper.baseExperience.camera;
    const forward = camera.getForwardRay(1).direction;
    return {
        position: camera.globalPosition.asArray(),
        yawDegrees: Math.atan2(forward.x, forward.z) * 180 / Math.PI
    };
});

const controllerWorldPosition = (page, hand) => page.evaluate(side => {
    const controller = window.vrClub._xrControllers.find(c => c.inputSource.handedness === side);
    controller.pointer.computeWorldMatrix(true);
    return controller.pointer.getAbsolutePosition().asArray();
}, hand);

const controllerXrPosition = (page, hand) => page.evaluate(side => {
    const p = window.__iwerDevice.controllers[side].position;
    return [p.x, p.y, p.z];
}, hand);

/** Quaternion [x, y, z, w] that turns the controller's pointing axis (-z) onto `direction`. */
const aimQuaternion = direction => {
    const length = Math.hypot(...direction);
    const [dx, dy, dz] = direction.map(v => v / length);
    const q = [dy, -dx, 0, 1 - dz];
    const norm = Math.hypot(...q) || 1;
    return q.map(v => v / norm);
};

const pitchDownQuaternion = degrees => {
    const half = degrees * Math.PI / 360;
    return [-Math.sin(half), 0, 0, Math.cos(half)];
};

const setController = (page, hand, { position, quaternion }) => page.evaluate(([side, p, q]) => {
    const controller = window.__iwerDevice.controllers[side];
    if (p) controller.position.set(...p);
    if (q) controller.quaternion.set(...q);
}, [hand, position, quaternion]);

const setHeadset = (page, { position, quaternion }) => page.evaluate(([p, q]) => {
    const device = window.__iwerDevice;
    if (p) device.position.set(...p);
    if (q) device.quaternion.set(...q);
}, [position, quaternion]);

const setStick = (page, hand, x, y) => page.evaluate(([side, sx, sy]) => {
    window.__iwerDevice.controllers[side].updateAxes('thumbstick', sx, sy);
}, [hand, x, y]);

const press = (page, hand, button, value) => page.evaluate(([side, id, v]) => {
    window.__iwerDevice.controllers[side].updateButtonValue(id, v);
}, [hand, button, value]);

/** The hand whose laser Babylon currently routes clicks through; the other hand's first pull only switches to it. */
const activePointerHand = page => page.evaluate(() => {
    const club = window.vrClub;
    const id = club.vrHelper.pointerSelection._attachedController;
    return club._xrControllers.find(controller => controller.uniqueId === id).inputSource.handedness;
});

const angleDelta = (to, from) => ((to - from + 540) % 360) - 180;

test('Quest session: headset, controllers, snap turn, teleport and the lighting menu', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await enterVR(page);
    await renderFrames(page, 10);

    await test.step('the user spawns on the dance floor facing the stage', async () => {
        const pose = await headPose(page);
        expect(pose.position[0]).toBeCloseTo(SPAWN.x, 1);
        expect(pose.position[1]).toBeCloseTo(SPAWN.y, 1);
        expect(pose.position[2]).toBeCloseTo(SPAWN.z, 1);
        // -z is the DJ booth; a user turned the other way would face a dark wall.
        expect(Math.abs(Math.abs(pose.yawDegrees) - 180)).toBeLessThan(2);
    });

    await test.step('headset movement and turning move the camera', async () => {
        await setHeadset(page, { position: [0.3, 1.6, -0.5] });
        await renderFrames(page, 5);
        const moved = await headPose(page);
        const expected = xrToWorld([0.3, 1.6, -0.5]);
        for (let axis = 0; axis < 3; axis++) expect(moved.position[axis]).toBeCloseTo(expected[axis], 1);

        const half = Math.PI / 4; // 90 degrees about +y
        await setHeadset(page, { quaternion: [0, Math.sin(half), 0, Math.cos(half)] });
        await renderFrames(page, 5);
        const turned = await headPose(page);
        expect(Math.abs(Math.abs(angleDelta(turned.yawDegrees, moved.yawDegrees)) - 90)).toBeLessThan(3);

        await setHeadset(page, { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] });
        await renderFrames(page, 5);
        const home = await headPose(page);
        expect(home.position[0]).toBeCloseTo(SPAWN.x, 1);
        expect(home.position[2]).toBeCloseTo(SPAWN.z, 1);
    });

    await test.step('both controllers are tracked where the emulator puts them', async () => {
        for (const hand of ['left', 'right']) {
            const expected = xrToWorld(await controllerXrPosition(page, hand));
            const actual = await controllerWorldPosition(page, hand);
            for (let axis = 0; axis < 3; axis++) expect(actual[axis], `${hand} controller axis ${axis}`).toBeCloseTo(expected[axis], 1);
        }
        await setController(page, 'right', { position: [0.4, 1.2, -0.3] });
        await renderFrames(page, 5);
        const moved = await controllerWorldPosition(page, 'right');
        const expected = xrToWorld([0.4, 1.2, -0.3]);
        for (let axis = 0; axis < 3; axis++) expect(moved[axis], `moved right controller axis ${axis}`).toBeCloseTo(expected[axis], 1);
        await setController(page, 'right', { position: [0.25, 1.5, -0.4] });
    });

    await test.step('pointing at a menu button and pulling the trigger operates it', async () => {
        await press(page, 'left', 'y-button', 1);
        await page.waitForFunction(() => window.vrClub._vrQuickMenuRoot?.isEnabled() === true);
        await press(page, 'left', 'y-button', 0);
        await renderFrames(page, 5);

        const hand = await activePointerHand(page);
        const target = await page.evaluate(() => {
            const club = window.vrClub;
            club._showVRQuickMenuPage('effects');
            const button = club._vrQuickMenuButtons.find(item => item.control === 'smokeActive');
            button.mesh.computeWorldMatrix(true);
            return { world: button.mesh.getAbsolutePosition().asArray(), before: club.smokeActive };
        });
        const origin = await controllerXrPosition(page, hand);
        const direction = worldToXr(target.world).map((value, axis) => value - origin[axis]);
        await setController(page, hand, { quaternion: aimQuaternion(direction) });
        await renderFrames(page, 6);
        await press(page, hand, 'trigger', 1);
        await renderFrames(page, 4);
        await press(page, hand, 'trigger', 0);
        await renderFrames(page, 6);
        expect(await page.evaluate(() => window.vrClub.smokeActive), 'haze toggled by a ray select').toBe(!target.before);
        expect(await page.evaluate(() => window.vrClub.vjManualMode), 'a menu click hands the show to the user').toBe(true);

        await setController(page, hand, { quaternion: [0, 0, 0, 1] });
        await page.evaluate(() => window.vrClub.toggleVRQuickMenu(false));
        await renderFrames(page, 3);
    });

    await test.step('the thumbstick snap-turns by 30 degrees in comfort mode', async () => {
        const start = (await headPose(page)).yawDegrees;
        await setStick(page, 'right', 1, 0);
        await renderFrames(page, 8);
        await setStick(page, 'right', 0, 0);
        await renderFrames(page, 8);
        const right = (await headPose(page)).yawDegrees;
        expect(Math.abs(angleDelta(right, start))).toBeCloseTo(30, 0);

        await setStick(page, 'right', -1, 0);
        await renderFrames(page, 8);
        await setStick(page, 'right', 0, 0);
        await renderFrames(page, 8);
        const back = (await headPose(page)).yawDegrees;
        expect(angleDelta(back, right)).toBeCloseTo(-angleDelta(right, start), 0);
        // Snap turning rotates in place: a comfort turn must never translate the user.
        const position = (await headPose(page)).position;
        expect(Math.hypot(position[0] - SPAWN.x, position[2] - SPAWN.z)).toBeLessThan(0.05);
    });

    await test.step('teleporting lands on the floor, inside the club, further along the aimed direction', async () => {
        await setController(page, 'right', { quaternion: pitchDownQuaternion(35) });
        await renderFrames(page, 4);
        const before = (await headPose(page)).position;
        await setStick(page, 'right', 0, -1);
        await renderFrames(page, 12);
        await setStick(page, 'right', 0, 0);
        await renderFrames(page, 12);
        const after = (await headPose(page)).position;
        const travelled = Math.hypot(after[0] - before[0], after[2] - before[2]);
        expect(travelled).toBeGreaterThan(1);
        expect(travelled).toBeLessThan(8);
        expect(after[2], 'the arc was aimed toward the stage').toBeLessThan(before[2]);
        expect(after[1], 'eye height is kept').toBeCloseTo(SPAWN.y, 0);
        const bounds = await page.evaluate(() => window.ROOM_BOUNDS);
        expect(after[0]).toBeGreaterThan(bounds.x.min);
        expect(after[0]).toBeLessThan(bounds.x.max);
        expect(after[2]).toBeGreaterThan(bounds.z.min);
        expect(after[2]).toBeLessThan(bounds.z.max);
    });

    await test.step('a long throw toward the stage cannot land on the DJ platform or leave the room', async () => {
        const platform = await page.evaluate(() => {
            const mesh = window.vrClub.scene.getMeshByName('djPlatform');
            mesh.computeWorldMatrix(true);
            const { minimumWorld, maximumWorld } = mesh.getBoundingInfo().boundingBox;
            return { min: [minimumWorld.x, minimumWorld.z], max: [maximumWorld.x, maximumWorld.z] };
        });
        for (const pitch of [26, 22, 18, 14]) {
            await setController(page, 'right', { quaternion: pitchDownQuaternion(pitch) });
            await renderFrames(page, 4);
            await setStick(page, 'right', 0, -1);
            await renderFrames(page, 10);
            await setStick(page, 'right', 0, 0);
            await renderFrames(page, 10);
            const [x, , z] = (await headPose(page)).position;
            const onPlatform = x > platform.min[0] && x < platform.max[0] && z > platform.min[1] && z < platform.max[1];
            expect(onPlatform, `pitch ${pitch} landed at (${x.toFixed(2)}, ${z.toFixed(2)}) on the platform`).toBe(false);
            const bounds = await page.evaluate(() => window.ROOM_BOUNDS);
            expect(z).toBeGreaterThan(bounds.z.min);
        }
    });

    await exitVR(page);
    await expectHealthyRuntime(page);
});