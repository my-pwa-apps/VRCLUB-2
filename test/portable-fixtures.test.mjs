import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

class Color3 {
    constructor(r = 0, g = 0, b = 0) { this.set(r, g, b); }
    set(r, g, b) { Object.assign(this, { r, g, b }); return this; }
    copyFrom(value) { return this.set(value.r, value.g, value.b); }
}
function classic(file, globals = {}) {
    const window = {}, context = vm.createContext({ window, console, performance, Math, Date,
        BABYLON: { Color3 }, ...globals });
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
    return window;
}

test('portable wall trim preserves cues, removes boosts in Safe Mode and immediately honors blackout', () => {
    const apply = classic('js/club/09-animation-finish.js', { VRClubAnimationFixtures: class {} })
        .VRClubAnimationFinish.prototype._applyLedLevel;
    const panel = { colorBuffer: new Color3(), material: { emissiveColor: new Color3() } };
    const club = { ledPanels: [panel], ledWallLevel: 0.5, ledWallBrightness: 2, masterIntensity: 1 };
    let time = 0;
    const step = () => {
        panel.material.emissiveColor.set(0.4, 0.2, 0.1);
        apply.call(club, time += 1 / 60);
        return panel.material.emissiveColor.r;
    };
    for (let i = 0; i < 600; i++) step();
    assert.ok(Math.abs(step() - 0.4) < 0.001);
    assert.equal(club.ledWallLevel, 0.5);
    club.photosensitiveSafeMode = true;
    assert.ok(step() <= 0.201);
    assert.equal(club.ledWallBrightness, 2);
    club.masterIntensity = 0;
    assert.equal(step(), 0);
    club.masterIntensity = 1; club.ledWallBrightness = 0;
    assert.equal(step(), 0);
});

test('portable sequence flywheel advances through a missed beat with governed cadence and gradual Safe Mode', () => {
    const Type = classic('js/club/08-animation-fixtures.js', { VRClubAnimationCore: class {} }).VRClubAnimationFixtures;
    const club = Object.assign(Object.create(Type.prototype), {
        spotSequence: 1, spotSequenceRate: 1, vjBPM: 180,
        vjDirector: { beatNumber: 0 }, barPhase: 0,
        currentSpotColor: new Color3(1, 0, 0), spotColorList: []
    });
    let previous = -1, changedAt = -1;
    for (let frame = 0; frame < 90; frame++) {
        const time = frame / 90, step = club._spotSequenceStep(time, 180, 2, 0, 1);
        if (step !== previous) {
            if (changedAt >= 0) assert.ok(time - changedAt >= 0.4);
            changedAt = time; previous = step;
        }
    }
    assert.ok(previous >= 1, 'the rendered chase froze with the detector');
    assert.ok(club.spotSequenceBeat(1) > 2.9, 'shared phase must describe the rendered flywheel, not the missed detector beat');
    for (const hz of [45, 60, 72, 90, 120]) {
        club._spotSequenceClock = null;
        club.photosensitiveSafeMode = true;
        const spot = { _rigLevel: 0 };
        for (let frame = 0; frame < hz * 4; frame++) {
            const previousLevel = spot._rigLevel;
            club._updateSpotRig(spot, 0, frame / hz, 60 / hz);
            assert.ok(spot._rigLevel <= 0.45);
            assert.ok(Math.abs(spot._rigLevel - previousLevel) <= 0.91 / hz);
        }
    }
    const lit = (sequence, step) => Array.from({ length: 6 }, (_, head) => head)
        .filter(head => Type.spotSequenceTarget(sequence, head, step));
    assert.equal(lit(1, 0).length, 1);
    assert.equal(lit(2, 0).length, 2);
    assert.equal(lit(3, 0).length, 3);
    assert.equal(lit(4, 3).length, 0);
    assert.equal(lit(5, 2).length, 0);
    assert.equal(lit(6, 6).length, 0);
});

test('portable Maximum room fill restarts emitters, synchronizes both bursts and ends a manual burst', () => {
    const Type = classic('js/club/07-animation-core.js', { VRClubEffects: class {} }).VRClubAnimationCore;
    const machines = Array.from({ length: 2 }, () => ({
        emitter: { running: false, isStarted() { return this.running; }, start() { this.running = true; } },
        ledMat: {}
    }));
    const club = Object.assign(Object.create(Type.prototype), {
        scene: { fogDensity: 0 }, fogMachines: machines, fogIntensity: 2, vjManualMode: true,
        smokeActive: true, fogBurstMode: 'auto', cachedColors: {}, vjBPM: 120,
        vrSettings: { desktop: { fogDensity: 0.01 } }
    });
    club.updateFogMachines({ time: 0, dt: 1 / 60 });
    assert.ok(machines.every(machine => machine.emitter.running && machine.isBursting));
    assert.equal(machines[0].emitter.emitRate, 600);
    assert.equal(machines[0].emitter.emitRate, machines[1].emitter.emitRate);
    assert.equal(club.scene.fogDensity, 0.03);
    club.updateFogMachines({ time: 2, dt: 1 / 60 });
    assert.ok(machines.every(machine => !machine.isBursting && machine.emitter.emitRate === 176));
    club.fogBurstMode = 'burst';
    for (const machine of machines) { machine.isBursting = true; machine.burstTimer = 0.1; }
    for (let i = 0; i < 12; i++) club.updateFogMachines({ time: 2 + i / 60, dt: 1 / 60 });
    assert.ok(machines.every(machine => !machine.isBursting && machine.emitter.emitRate === 0));
});
