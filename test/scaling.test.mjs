import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { roomCapacity, roomStatus } from '../worker/src/roomDirectory.js';

function loadAvatars() {
    const context = vm.createContext({ window: {}, console, performance });
    vm.runInContext(readFileSync(new URL('../js/avatarManager.js', import.meta.url), 'utf8'), context);
    return context.window.AvatarManager;
}

test('development room capacity is bounded, with an unchanged eight-person default', () => {
    assert.equal(roomCapacity(), 8);
    assert.equal(roomCapacity({ ROOM_CAPACITY: '32' }), 32);
    for (const value of ['33', '7', 'NaN', '16.5', '']) {
        assert.throws(() => roomCapacity({ ROOM_CAPACITY: value }), /ROOM_CAPACITY/);
    }
    assert.equal(roomStatus('dev', 24, false, 32).capacity, 32);
});

test('larger rooms choose nearest full bodies, obey tiers and retain membership for distant people', async () => {
    const AvatarManager = loadAvatars();
    const manager = Object.create(AvatarManager.prototype);
    Object.assign(manager, {
        club: { networkManager: { capacity: 32 }, graphicsTier: 'balanced' },
        scene: { activeCamera: { position: { x: 0, y: 1.7, z: 0 } } },
        _poseTime: 1, _detailAt: -Infinity, _detailCandidates: [], remotes: new Map()
    });
    for (let i = 0; i < 31; i++) {
        const peer = { id: String(i), hasState: true, hidden: false, avatarId: 'f1', person: null,
            root: { position: { x: i + 1, y: 0, z: 0 } } };
        manager.remotes.set(peer.id, peer);
    }
    manager._buildPerson = async peer => { peer.person = { mocked: true }; };
    manager._disposePerson = peer => { peer.person = null; };
    manager._updateDetailBudget();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager._peopleCount(), 6);
    assert.deepEqual([...manager.remotes.values()].filter(p => p.person).map(p => p.id), ['0', '1', '2', '3', '4', '5']);
    assert.equal(manager.remotes.size, 31, 'LOD never removes a participant');
    assert.equal(manager.getDiagnostics().fallbackAvatars, 25);
    manager.scene.activeCamera.position.x = 25;
    manager._poseTime = 2;
    manager._updateDetailBudget();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager._peopleCount(), 6);
    assert.equal(manager.remotes.get('0').person, null, 'departed full bodies release their skeleton');
    manager.club.graphicsTier = 'high';
    manager._poseTime = 3;
    manager._updateDetailBudget();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(manager._peopleCount(), 10);
    manager.club.networkManager.capacity = 8;
    assert.equal(manager._detailLimit(), 8, 'legacy room retains its old rendering budget');
});

test('development VR access makes no payment requests and never enables it on production', async () => {
    for (const host of ['nocturnedev.mitwee.nl', 'nocturne-dev.pages.dev']) {
        let requests = 0;
        const window = { location: { hostname: host } };
        const context = vm.createContext({ window, fetch() { requests++; throw new Error('No development payments'); } });
        vm.runInContext(readFileSync(new URL('../js/paymentGate.js', import.meta.url), 'utf8'), context);
        assert.equal(window.VRPayment.canEnterVR(), true);
        assert.equal(window.VRPayment.apiOrigin, null);
        await window.VRPayment.refreshEntitlement();
        assert.equal(requests, 0);
    }
});

test('scaled rooms coalesce stationary poses but send hand motion and a heartbeat', () => {
    const context = vm.createContext({ window: {}, VRClubEffects: class {} });
    vm.runInContext(readFileSync(new URL('../js/club/07-animation-core.js', import.meta.url), 'utf8'), context);
    const club = Object.create(context.window.VRClubAnimationCore.prototype);
    const sent = [];
    Object.assign(club, {
        networkManager: { connected: true, capacity: 32, sendState: state => sent.push(JSON.parse(JSON.stringify(state))) },
        isInVRMode: true,
        camera: { position: { x: 0, y: 1.7, z: -10 }, rotation: { y: 0 } },
        _handPose: () => null
    });
    for (let i = 1; i <= 20; i++) club.updateNetworkPresence({ time: i / 20, dt: 0.05 });
    assert.ok(sent.length >= 2 && sent.length <= 3, 'stationary clients send at roughly 2Hz instead of 20Hz');
    club.camera.position.x = 1;
    club.updateNetworkPresence({ time: 1.1, dt: 0.1 });
    assert.equal(sent.at(-1).x, 1);
    const beforeHands = sent.length;
    club._handPose = () => ({ x: 1, y: 1.8, z: -10, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0 });
    club.updateNetworkPresence({ time: 1.2, dt: 0.1 });
    assert.equal(sent.length, beforeHands + 1);
    assert.ok(Math.abs(sent.at(-1).hands.left.y - 0.1) < 1e-9);
    const legacyStart = sent.length;
    club.networkManager.capacity = 8;
    for (let i = 1; i <= 10; i++) club.updateNetworkPresence({ time: 2 + i / 10, dt: 0.1 });
    assert.equal(sent.length, legacyStart + 10, 'legacy network cadence remains unchanged');
});
