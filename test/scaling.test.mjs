import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { roomCapacity, roomStatus } from '../worker/src/roomDirectory.js';

function loadAvatars(logger = console) {
    const context = vm.createContext({ window: {}, console: logger, performance });
    vm.runInContext(readFileSync(new URL('../js/avatarManager.js', import.meta.url), 'utf8'), context);
    return context.window.AvatarManager;
}

test('room capacity is bounded, with an unchanged eight-person unconfigured default', () => {
    assert.equal(roomCapacity(), 8);
    assert.equal(roomCapacity({ ROOM_CAPACITY: '32' }), 32);
    for (const value of ['33', '7', 'NaN', '16.5', '']) {
        assert.throws(() => roomCapacity({ ROOM_CAPACITY: value }), /ROOM_CAPACITY/);
    }
    assert.equal(roomStatus('dev', 24, false, 32).capacity, 32);
});

test('every remote keeps its Quaternius body across distance and graphics tiers', async () => {
    const AvatarManager = loadAvatars();
    const manager = Object.create(AvatarManager.prototype);
    Object.assign(manager, {
        club: { networkManager: { capacity: 32 }, graphicsTier: 'balanced' },
        scene: { activeCamera: { position: { x: 0, y: 1.7, z: 0 } } },
        _poseTime: 1, _buildingPerson: false, remotes: new Map()
    });
    for (let i = 0; i < 31; i++) {
        const peer = { id: String(i), hasState: true, hidden: false, eyeHeight: 1.7, avatarId: 'f1', person: null, detailRetryAt: 0,
            root: { position: { x: i + 1, y: 0, z: 0 } } };
        manager.remotes.set(peer.id, peer);
    }
    let builds = 0;
    manager._buildPerson = async peer => { builds++; peer.person = { mocked: true }; return true; };
    for (let i = 0; i < 31; i++) {
        manager._updatePeople();
        manager._updatePeople();
        assert.equal(builds, i + 1, 'only one body build starts in a render frame');
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(manager._peopleCount(), 31);
    assert.equal(manager.getDiagnostics().fallbackAvatars, 0);
    assert.equal(manager.getDiagnostics().loadingAvatars, 0);
    const originals = [...manager.remotes.values()].map(peer => peer.person);
    for (const tier of ['balanced', 'high', 'ultra']) {
        manager.club.graphicsTier = tier;
        manager.scene.activeCamera.position.x += 100;
        manager._updatePeople();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual([...manager.remotes.values()].map(peer => peer.person), originals, 'no body replacement or animation reset');
    }
    assert.equal(builds, 31);
    manager.club.networkManager.capacity = 8;
    manager._updatePeople();
    assert.equal(manager._peopleCount(), 31, 'capacity metadata does not change an existing appearance');
});

test('failed appearances report and retry without blocking other guests or retrying every frame', async () => {
    const errors = [], notices = [];
    const AvatarManager = loadAvatars({ error: (...args) => errors.push(args) });
    const manager = Object.assign(Object.create(AvatarManager.prototype), {
        club: { showErrorMessage: message => notices.push(message) },
        _poseTime: 0, _buildingPerson: false, remotes: new Map()
    });
    for (const id of ['first', 'second']) {
        manager.remotes.set(id, { id, avatarId: 'f1', detailRetryAt: 0, detailLoading: false, person: null });
    }
    const attempts = [];
    manager._buildPerson = async peer => {
        attempts.push(peer.id);
        if (attempts.length === 1) return false;
        peer.person = { mocked: true };
        return true;
    };
    manager._updatePeople();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(errors.length, 1);
    assert.equal(notices.length, 1);
    manager._updatePeople();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(attempts, ['first', 'second']);
    manager._updatePeople();
    assert.equal(attempts.length, 2, 'failed source is not requested on every render');
    manager._poseTime = 5;
    manager._updatePeople();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(attempts, ['first', 'second', 'first']);
    assert.equal(manager._peopleCount(), 2);
    assert.equal(manager._buildingPerson, false);
});

test('shared scaling rollout retains the real access gate, without a development bypass', () => {
    const source = readFileSync(new URL('../js/paymentGate.js', import.meta.url), 'utf8');
    assert.ok(source.includes('https://api.mitwee.nl'));
    assert.ok(!source.includes('Development site: VR access is free'));
    const config = readFileSync(new URL('../worker/wrangler.toml', import.meta.url), 'utf8');
    assert.match(config, /ROOM_CAPACITY = "32"/);
    assert.match(config, /MEDIA_TRANSPORT = "sfu"/);
    assert.doesNotMatch(config, /^\s*SFU_APP_SECRET\s*=/m);
});

test('scaled rooms coalesce stationary poses but send hand motion and a heartbeat', () => {
    const context = vm.createContext({ window: {}, VRClubEffects: class {} });
    vm.runInContext(readFileSync(new URL('../js/club/07-animation-core.js', import.meta.url), 'utf8'), context);
    const club = Object.create(context.window.VRClubAnimationCore.prototype);
    const sent = [];
    Object.assign(club, {
        networkManager: { connected: true, capacity: 32, sendState: state => sent.push(JSON.parse(JSON.stringify(state))) },
        isInVRMode: true,
        _bodyEyeHeight: () => 1.7,
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
    let before = sent.length;
    club._activeSeat = { x: club.camera.position.x, z: club.camera.position.z, facing: 0, floorY: 0, seatY: 0.45 };
    club.updateNetworkPresence({ time: 1.3, dt: 0.1 });
    assert.equal(sent.length, before + 1, 'a stationary seat change sends immediately');
    assert.equal(sent.at(-1).seated, true);
    before = sent.length;
    club._bodyEyeHeight = () => 1.8;
    club.updateNetworkPresence({ time: 1.4, dt: 0.1 });
    assert.equal(sent.length, before + 1, 'height changes are not suppressed as stationary');
    assert.equal(sent.at(-1).eh, 1.8);
    const legacyStart = sent.length;
    club.networkManager.capacity = 8;
    for (let i = 1; i <= 10; i++) club.updateNetworkPresence({ time: 2 + i / 10, dt: 0.1 });
    assert.equal(sent.length, legacyStart + 10, 'legacy network cadence remains unchanged');
});
