import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/gashouderExperience.js', import.meta.url), 'utf8');

function harness() {
    const window = {};
    vm.runInNewContext(source, { window });
    const connections = new Set(['direct']);
    let created = 0;
    const filter = {
        frequency: {}, gain: {},
        connect() { connections.add('filter-output'); },
        disconnect() { connections.delete('filter-output'); }
    };
    const club = Object.assign({}, window.GashouderExperience, {
        audioContext: { state: 'running', createBiquadFilter() { created++; return filter; } },
        audioMasterGain: {},
        voiceDuckGain: {
            connect() { connections.add('filter-input'); },
            disconnect(target) {
                if (target === filter) connections.delete('filter-input');
                else connections.delete('direct');
            }
        },
        _audioKind: 'stream'
    });
    return { club, connections, filter, created: () => created };
}

test('personal audio filter is connected once and external-player audio reports unavailable', () => {
    const { club, connections, filter, created } = harness();
    assert.equal(club._gashouderExperienceAudio(), filter);
    assert.deepEqual([...connections].sort(), ['filter-input', 'filter-output']);
    assert.equal(club._gashouderExperienceAudio(), filter);
    assert.equal(created(), 1);
    club._audioKind = 'soundcloud';
    assert.equal(club._gashouderExperienceAudio(), null);
    club._audioKind = 'stream';
    assert.equal(club._gashouderExperienceAudio(), filter);
});

test('failed audio graph insertion leaves the original path connected', () => {
    const { club, connections } = harness();
    const disconnect = club.voiceDuckGain.disconnect;
    club.voiceDuckGain.disconnect = function (target) {
        if (target === club.audioMasterGain) throw new Error('insertion failed');
        disconnect.call(this, target);
    };
    assert.throws(() => club._gashouderExperienceAudio(), /insertion failed/);
    assert.deepEqual([...connections], ['direct']);
    assert.equal(club._gashouderExperienceFilter, undefined);
});
