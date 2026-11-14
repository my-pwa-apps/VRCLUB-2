import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function harness() {
    let now = 1000;
    const stats = { planes: 0, textures: 0, materials: 0, fills: [], updates: 0, disposed: 0 };
    class DynamicTexture {
        constructor() {
            stats.textures++;
            this.context = {
                clearRect() {},
                fillText(text) { stats.fills.push(text); }
            };
        }
        getContext() { return this.context; }
        getSize() { return { width: 128, height: 128 }; }
        update() { stats.updates++; }
        dispose() { stats.disposed++; }
    }
    class StandardMaterial {
        constructor() { stats.materials++; }
        dispose() { stats.disposed++; }
    }
    const BABYLON = {
        Mesh: { BILLBOARDMODE_ALL: 7 },
        MeshBuilder: {
            CreatePlane() {
                stats.planes++;
                return {
                    position: {},
                    setEnabled(value) { this.enabled = value; },
                    dispose() { stats.disposed++; }
                };
            }
        },
        DynamicTexture,
        StandardMaterial,
        Color3: class Color3 {}
    };
    const context = vm.createContext({ window: {}, BABYLON, performance: { now: () => now } });
    vm.runInContext(readFileSync(new URL('../js/avatarManager.js', import.meta.url), 'utf8'), context);
    return {
        AvatarManager: context.window.AvatarManager,
        stats,
        advance(ms) { now += ms; }
    };
}

test('accepted reactions reuse one per-peer plane, material and texture until peer teardown', () => {
    const { AvatarManager, stats, advance } = harness();
    const manager = Object.create(AvatarManager.prototype);
    manager.scene = {};
    const peer = { id: 'guest', root: {}, emojiPlane: null, emojiTexture: null, emojiTimer: 0, lastEmojiAt: -Infinity };
    manager.remotes = new Map([['guest', peer]]);

    manager.showEmoji('guest', '🎉');
    const plane = peer.emojiPlane, texture = peer.emojiTexture, material = plane.material;
    assert.equal(plane.enabled, true);
    advance(600);
    manager.showEmoji('guest', '🔥');
    assert.equal(peer.emojiPlane, plane);
    assert.equal(peer.emojiTexture, texture);
    assert.equal(plane.material, material);
    assert.deepEqual(stats, { planes: 1, textures: 1, materials: 1, fills: ['🎉', '🔥'], updates: 2, disposed: 0 });

    manager._clearEmoji(peer);
    assert.equal(plane.enabled, false);
    assert.equal(peer.emojiPlane, plane);
    assert.equal(stats.disposed, 0);
    advance(600);
    manager.showEmoji('guest', '❤️');
    assert.equal(peer.emojiPlane, plane);
    assert.equal(stats.planes, 1);
    assert.equal(stats.textures, 1);

    manager._disposeEmoji(peer);
    assert.equal(peer.emojiPlane, null);
    assert.equal(peer.emojiTexture, null);
    assert.equal(stats.disposed, 3);
});
