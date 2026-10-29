import { test, expect } from '@playwright/test';
import { enterClub, enterVR, exitVR, useQuestHarness } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness({ comfort: false });

test('right stick opens and drives the social wheel without turning; left click still sprints', async ({ page }) => {
    test.setTimeout(600000);
    await enterClub(page);
    await enterVR(page);
    await page.evaluate(() => {
        const mp = window.vrClub.multiplayer;
        mp.client = new window.NetworkClient();
        mp.client.status = 'connected';
        mp.client.selfId = 'local';
        mp.client.hostId = 'local';
        mp.client.targetedChat = true;
        mp.client.peers.set('alex', { name: 'Alex', pid: '1111111111111111', avatar: 'f1' });
        mp.client.peers.set('sam', { name: 'Sam', pid: '2222222222222222', avatar: 'm1' });
        window.wheelActions = [];
        mp.client._send = frame => window.wheelActions.push(frame);
        mp.client.setVoiceAudience = targets => window.wheelActions.push({ type: 'voice-audience', targets });
        mp.toggleMic = async () => { window.wheelMicSelected = true; return true; };
        mp._emit();
    });
    const click = async side => {
        await page.evaluate(side => window.__iwerDevice.controllers[side].updateButtonValue('thumbstick', 1), side);
        await renderFrames(page, 1);
        await page.evaluate(side => window.__iwerDevice.controllers[side].updateButtonValue('thumbstick', 0), side);
        await renderFrames(page, 1);
    };
    const tilt = async (x, y) => {
        await page.evaluate(([x, y]) => {
            window.__iwerDevice.controllers.right.updateAxes('thumbstick', x, y);
        }, [x, y]);
        await renderFrames(page, 2);
    };
    const choose = async condition => {
        const axes = await page.evaluate(condition => {
            const club = window.vrClub;
            const items = club._socialWheelItems();
            const index = items.findIndex(item => Object.entries(condition).every(([key, value]) => item[key] === value));
            if (index < 0) throw new Error(`Social-wheel item not found: ${JSON.stringify(condition)}`);
            const angle = index * Math.PI * 2 / items.length;
            return [Math.sin(angle), -Math.cos(angle)];
        }, condition);
        await tilt(...axes);
        await click('right');
        await tilt(0, 0);
        await renderFrames(page, 1);
    };

    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('thumbstick', 1));
    await renderFrames(page, 1);
    expect(await page.evaluate(() => window.vrClub.movementFeature.movementSpeed)).toBe(3);
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel?.open || false)).toBe(false);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('thumbstick', 0));
    await renderFrames(page, 1);
    expect(await page.evaluate(() => window.vrClub.movementFeature.movementSpeed)).toBe(1.5);

    await click('right');
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel.open)).toBe(true);
    expect(await page.evaluate(() => window.vrClub.movementFeature.rotationEnabled)).toBe(false);

    const forwardBefore = await page.evaluate(() => {
        const direction = window.vrClub.vrHelper.baseExperience.camera.getDirection(window.BABYLON.Axis.Z);
        return [direction.x, direction.z];
    });
    await tilt(1, 0);
    const turnProbe = await page.evaluate(() => {
        const club = window.vrClub;
        const direction = club.vrHelper.baseExperience.camera.getDirection(window.BABYLON.Axis.Z);
        return {
            forward: [direction.x, direction.z],
            state: { ...club.movementFeature._movementState },
            rotationEnabled: club.movementFeature.rotationEnabled,
            wheel: { open: club._vrSocialWheel.open, selected: club._vrSocialWheel.selected },
            handlers: club.movementFeature._currentRegistrationConfigurations.map(item =>
                ({ hand: item.forceHandedness, socialGate: String(item.axisChangedHandler).includes('_vrSocialWheel') }))
        };
    });
    const beforeLength = Math.hypot(...forwardBefore);
    const afterLength = Math.hypot(...turnProbe.forward);
    const turnAngle = Math.acos(Math.min(1, Math.max(-1,
        (forwardBefore[0] * turnProbe.forward[0] + forwardBefore[1] * turnProbe.forward[1]) /
        (beforeLength * afterLength))));
    expect(turnAngle, JSON.stringify(turnProbe)).toBeLessThan(0.01);
    await tilt(0, 0);

    await choose({ target: 'chat' });
    await choose({ target: 'chatAudience' });
    await choose({ peer: 'alex' });
    expect(await page.evaluate(() => window.vrClub.multiplayer.chatAudience)).toEqual(['alex']);
    await choose({ target: 'chat' });
    await choose({ op: 'phrase' });
    expect(await page.evaluate(() => window.wheelActions.some(frame =>
        frame.type === 'chat' && frame.targets?.length === 1 && frame.targets[0] === 'alex'))).toBe(true);
    await choose({ target: 'home' });
    await choose({ target: 'gestures' });
    await choose({ gesture: 'wave' });
    expect(await page.evaluate(() => window.wheelActions.some(frame =>
        frame.type === 'gesture' && frame.gesture === 'wave'))).toBe(true);
    await choose({ target: 'home' });
    await choose({ target: 'voiceAudience' });
    await choose({ peer: 'sam' });
    expect(await page.evaluate(() => window.vrClub.multiplayer.voiceAudience)).toEqual(['sam']);
    await choose({ op: 'mic' });
    expect(await page.evaluate(() => window.wheelMicSelected)).toBe(true);

    await page.evaluate(() => {
        window.vrClub.multiplayer.client.status = 'idle';
        window.vrClub.multiplayer._emit();
    });
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel.open)).toBe(false);
    expect(await page.evaluate(() => window.vrClub.movementFeature.rotationEnabled)).toBe(true);

    await page.evaluate(() => {
        window.vrClub.multiplayer.client.status = 'connected';
        window.vrClub.multiplayer._emit();
    });
    await click('right');
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel.open)).toBe(true);
    await exitVR(page);
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel.open)).toBe(false);
    await enterVR(page);
    await click('right');
    expect(await page.evaluate(() => window.vrClub._vrSocialWheel.open)).toBe(true);
});
