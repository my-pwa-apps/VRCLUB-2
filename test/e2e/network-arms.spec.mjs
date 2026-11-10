import { test, expect } from '@playwright/test';
import { sanitizeState } from '../../worker/src/relay.js';
import { enterClub, enterVR, exitVR, useQuestHarness, expectHealthyRuntime } from './support.mjs';
import { renderFrames } from './xr-measure.mjs';

useQuestHarness();

test('Quest controller movements reach the assigned network avatar through the real pose and render paths', async ({ page }) => {
    test.setTimeout(600_000);
    await page.exposeFunction('relayTrackedPose', state => sanitizeState(state));
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub;
        const manager = club.avatarManager = new window.AvatarManager(club);
        manager.setPersonalSpace(false);
        manager.ensurePeer('tracked', 'Tracked guest');
        await manager.setAvatar('tracked', 'm1');
        const peer = manager.remotes.get('tracked');
        const nodes = peer.person.node.getChildTransformNodes(false);
        const shoulder = suffix => nodes.find(node => node.name === `peertracked_UpperArm.${suffix}`).getAbsolutePosition().x;
        window.trackedPhysicalLeft = shoulder('L') < shoulder('R') ? 'L' : 'R';
        const client = club.networkManager = new window.NetworkClient();
        client.status = 'connected';
        client._send = async message => {
            if (message.type !== 'state') return;
            const state = await window.relayTrackedPose(message.state);
            window.lastTrackedState = state;
            manager.updatePeerState('tracked', null, { ...state, x: state.x + 3 });
        };
    });
    await enterVR(page);
    const move = (leftY, rightY) => page.evaluate(([ly, ry]) => {
        const device = window.__iwerDevice;
        device.controllers.left.position.set(-0.22, ly, -0.27);
        device.controllers.right.position.set(0.22, ry, -0.27);
    }, [leftY, rightY]);
    const snapshot = () => page.evaluate(() => {
        const club = window.vrClub;
        const peer = club.avatarManager.remotes.get('tracked');
        const result = {};
        const left = window.trackedPhysicalLeft, right = left === 'L' ? 'R' : 'L';
        for (const [side, suffix] of [['left', left], ['right', right]]) {
            const hand = peer.hands[side];
            const node = peer.person.node.getChildTransformNodes(false).find(n => n.name === `peertracked_Wrist.${suffix}`);
            node.computeWorldMatrix(true);
            const wrist = node.getAbsolutePosition();
            result[side] = {
                error: hand ? Math.hypot(wrist.x - peer.root.position.x - hand.x,
                    wrist.y - peer.root.position.y - 1.7 - hand.y, wrist.z - peer.root.position.z - hand.z) : 100,
                y: wrist.y,
                tracked: !!window.lastTrackedState?.hands?.[side]
            };
        }
        return result;
    });
    await move(1.55, 1.1);
    await renderFrames(page, 20);
    await expect.poll(async () => {
        const pose = await snapshot();
        return Math.max(pose.left.error, pose.right.error);
    }, { timeout: 30000 }).toBeLessThan(0.08);
    const first = await snapshot();
    expect(first.left.tracked && first.right.tracked).toBe(true);
    expect(first.left.y - first.right.y).toBeGreaterThan(0.25);
    await move(1.1, 1.55);
    await renderFrames(page, 20);
    const second = await snapshot();
    expect(second.right.y - second.left.y).toBeGreaterThan(0.25);
    expect(Math.max(second.left.error, second.right.error)).toBeLessThan(0.08);
    await exitVR(page);
    await expect.poll(() => page.evaluate(() => window.lastTrackedState?.hands ?? null)).toBeNull();
    await expect.poll(() => page.evaluate(() => {
        const peer = window.vrClub.avatarManager.remotes.get('tracked');
        return peer.hands.left === null && peer.hands.right === null;
    })).toBe(true);
    await expectHealthyRuntime(page);
});
