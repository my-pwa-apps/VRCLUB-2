import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const B = require('../js/vendor/babylon.js');

function fixtureScene(t) {
    const canvas = {
        getContext: () => ({ fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }),
        toDataURL: () => 'data:image/png;base64,'
    };
    const context = vm.createContext({
        console, window: {}, CLUB_POSITIONS: { sideTrussX: 7.6 },
        VRClubEnvironment: class {},
        document: { createElement: () => canvas },
        BABYLON: {
            ...B,
            DynamicTexture: class extends B.Texture {
                constructor(name, size, scene) { super(null, scene); this.name = name; }
                getContext() { return canvas.getContext(); }
                update() {}
            },
            Layer: class {
                constructor(name, url, scene, background, color) { this.color = color; }
            }
        }
    });
    for (const file of ['materialFactory.js', 'club/05-fixtures.js']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8'), context);
    }
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    t.after(() => { scene.dispose(); engine.dispose(); });
    const club = Object.assign(Object.create(context.window.VRClubFixtures.prototype), {
        scene, materialFactory: new context.window.MaterialFactory(scene, 4)
    });
    club.createStrobeLights();
    return { club, scene };
}

function close(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} != ${expected}`);
}

function size(mesh) {
    const b = mesh.getBoundingInfo().boundingBox;
    return b.maximum.subtract(b.minimum).asArray();
}

test('strobes match Unity placement, inward aim, casing, reflector and tube measurements', t => {
    const { club, scene } = fixtureScene(t);
    assert.equal(club.strobes.length, 4);
    const positions = [[-7.6, 7.6, -9.2], [7.6, 7.6, -9.2], [-7.6, 7.6, -14.8], [7.6, 7.6, -14.8]];
    for (const [i, fixture] of club.strobes.entries()) {
        const { mesh, reflector, tube, emitter, glare } = fixture;
        assert.deepEqual(mesh.position.asArray(), positions[i]);
        size(mesh).forEach((value, axis) => close(value, [1.05, 0.36, 0.22][axis], 'casing size'));
        const direction = new B.Vector3(0, 1.7, -12).subtract(mesh.position).normalize();
        mesh.computeWorldMatrix(true);
        const forward = B.Vector3.TransformNormal(B.Axis.Z, mesh.getWorldMatrix()).normalize();
        close(B.Vector3.Dot(forward, direction), 1, 'fixture aims at the dance floor');
        for (const [part, dimensions, depth] of [
            [reflector, [0.94, 0.28], 0.112], [tube, [0.87, 0.055], 0.116],
            [emitter, [0.87, 0.21], 0.12], [glare, [1.8, 0.9], 0.13]
        ]) {
            assert.equal(part.parent, mesh);
            close(part.position.z, depth, 'front depth');
            size(part).slice(0, 2).forEach((value, axis) => close(value, dimensions[axis], 'face size'));
            part.computeWorldMatrix(true);
            const normal = B.Vector3.TransformNormal(new B.Vector3(0, 0, -1), part.getWorldMatrix()).normalize();
            close(B.Vector3.Dot(normal, direction), 1, 'front face follows fixture aim');
            assert.equal(part.isPickable, false);
        }
        assert.notEqual(mesh.material, fixture.material, 'the casing must not flash');
        assert.equal(emitter.material, fixture.material);
        assert.equal(fixture.material.transparencyMode, B.Material.MATERIAL_ALPHABLEND);
        assert.equal(fixture.material.alphaMode, B.Engine.ALPHA_ADD);
        assert.equal(fixture.material.disableDepthWrite, true);
        assert.ok(fixture.material.emissiveColor.asArray().every(value => value === 0));
        assert.equal(fixture.glareMaterial.alpha, 0);
        assert.equal(fixture.light, null);
        for (const [part, colour, metallic, roughness] of [
            [mesh, [0.05, 0.05, 0.055], 0.3, 0.3],
            [reflector, [0.48, 0.5, 0.53], 0.85, 0.7],
            [tube, [0.55, 0.57, 0.6], 0, 0.8]
        ]) {
            part.material.baseColor.asArray().forEach((value, axis) => close(value, colour[axis], 'fixture colour'));
            close(part.material.metallic, metallic, 'fixture metallic');
            close(part.material.roughness, roughness, 'fixture roughness');
            assert.ok(part.material.emissiveColor.asArray().every(value => value === 0));
        }
    }
    const mounts = scene.getMeshByName('strobeMounts').getVerticesData(B.VertexBuffer.PositionKind);
    for (const [x, , z] of positions) {
        for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) for (const y of [7.6, 8]) {
            assert.ok(Array.from({ length: mounts.length / 3 }, (_, i) => i * 3)
                .some(i => Math.abs(mounts[i] - x - dx) < 1e-6 && Math.abs(mounts[i + 1] - y) < 1e-6
                    && Math.abs(mounts[i + 2] - z - dz) < 1e-6), 'mount stays vertical on the side truss');
        }
        let clampRadius = 0;
        for (let i = 0; i < mounts.length; i += 3) {
            if (Math.abs(mounts[i] - x) < 0.1 && Math.abs(mounts[i + 2] - z) < 0.02 && mounts[i + 1] > 8) {
                clampRadius = Math.max(clampRadius, Math.hypot(mounts[i] - x, mounts[i + 1] - 8));
            }
        }
        close(clampRadius, 0.06, 'Unity clamp outer radius');
    }
});

test('static fixture parts share instance draws and do not add enabled flash lights', t => {
    const { club, scene } = fixtureScene(t);
    for (const part of ['mesh', 'reflector', 'tube']) {
        const source = club.strobes[0][part];
        for (const fixture of club.strobes.slice(1)) assert.equal(fixture[part].sourceMesh, source);
    }
    const sources = scene.meshes.filter(mesh => !mesh.isAnInstance && mesh.getTotalVertices() > 0);
    assert.equal(sources.length, 12, 'four static batches plus four independent emitters and four glare quads');
    assert.equal(scene.lights.length, 1);
    assert.equal(club.strobeFlashLight.isEnabled(), false);
    assert.equal(club.strobeFlashLight.intensity, 0);
    assert.ok(club.strobes.every(strobe => strobe.flashDuration === 0));
});
