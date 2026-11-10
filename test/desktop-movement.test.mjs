import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BABYLON = require('../js/vendor/babylon.js');

function load() {
    const window = {};
    const context = vm.createContext({ window, BABYLON });
    for (const file of ['venueDressing', 'mezzanine']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
    }
    return { mixin: window.Mezzanine, window };
}

test('real Babylon keyboard movement stays horizontal and retains speed while looking up or down', () => {
    const { mixin } = load();
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const camera = new BABYLON.FreeCamera('walker', new BABYLON.Vector3(0, 1.7, -5), scene);
    try {
        camera.keysUpward = [];
        camera.keysDownward = [];
        camera.keysUp = [87, 38];
        camera._computeLocalCameraSpeed = () => 1;
        camera._checkInputs();
        mixin._guardDesktopCameraSteps(camera);
        const keyboard = camera.inputs.attached.keyboard;
        keyboard.attachControl(true);
        for (const pitch of [-1.3, 0, 1.3]) {
            camera.position.set(0, 1.7, -5);
            camera._deferredPositionUpdate.copyFrom(camera.position);
            camera.cameraDirection.set(0, 0, 0);
            camera.rotation.set(pitch, 0.7, 0);
            keyboard._keys = [87];
            keyboard.checkInputs();
            camera._updatePosition();
            assert.ok(Math.abs(camera.position.y - 1.7) < 1e-8);
            assert.ok(Math.abs(Math.hypot(camera.position.x, camera.position.z + 5) - 1) < 1e-6,
                `pitch ${pitch}: position ${camera.position}, direction ${camera.cameraDirection}`);
        }
        for (const key of [69, 81]) {
            camera.cameraDirection.set(0, 0, 0);
            keyboard._keys = [key];
            keyboard.checkInputs();
            assert.equal(camera.cameraDirection.y, 0);
        }
    } finally { engine.dispose(); }
});

test('desktop surface follow removes lingering flight height and keeps jumps bounded and frame-rate independent', () => {
    const { mixin } = load();
    for (const fps of [45, 60, 90, 120]) {
        const club = Object.assign({
            ready: true, camera: { position: new BABYLON.Vector3(0, 7, -5) },
            engine: { getDeltaTime: () => 1000 / fps }, _walkLevel: 0
        }, mixin);
        club._updateWalkSurface();
        assert.equal(club.camera.position.y, 1.7);
        assert.equal(club.jumpDesktop(), true);
        assert.equal(club.jumpDesktop(), false, 'holding jump cannot launch again in midair');
        let peak = 0, frames = 0;
        while (club._desktopJump.active && frames < fps * 2) {
            club._updateWalkSurface();
            peak = Math.max(peak, club.camera.position.y - 1.7);
            frames++;
        }
        assert.ok(peak > 0.44 && peak < 0.46, `apex=${peak} at ${fps} fps`);
        assert.ok(frames / fps > 0.59 && frames / fps < 0.63);
        assert.equal(club.camera.position.y, 1.7);
        club.isInVRMode = true;
        assert.equal(club.jumpDesktop(), false, 'keyboard jump must not move the desktop camera during XR');
    }
});

test('desktop feet follow the entrance stair, balcony and DJ riser rather than floating', () => {
    const { mixin, window } = load();
    const club = Object.assign({
        ready: true, camera: { position: new BABYLON.Vector3(0, 1.7, 0.65) },
        engine: { getDeltaTime: () => 16.667 }, _walkLevel: 0
    }, mixin);
    for (let z = 0.65; z <= 7; z += 0.05) {
        club.camera.position.z = z;
        club._updateWalkSurface();
        assert.ok(Math.abs(club.camera.position.y - 1.7 - window.VenueLayout.vestibule.walkLevel(0, z)) < 1e-8);
    }
    club.camera.position.set(-11.4, 1.7, -6.2);
    club._walkLevel = 0;
    for (let z = -6.2; z >= -10.8; z -= 0.02) {
        club.camera.position.z = z;
        club._updateWalkSurface();
    }
    assert.equal(club._walkLevel, 3);
    assert.equal(club.camera.position.y, 4.7);
    club.camera.position.set(0, 1.7, -18);
    club._walkLevel = 0;
    club._updateWalkSurface();
    assert.equal(club._walkLevel, 0.5);
    assert.equal(club.camera.position.y, 2.2);
});

test('real desktop collisions climb and descend solid stair treads while the surface follower grounds the eye', () => {
    const { mixin, window } = load();
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    scene.collisionsEnabled = true;
    const camera = new BABYLON.FreeCamera('walker', new BABYLON.Vector3(0, 1.7, -2.5), scene);
    camera.checkCollisions = true;
    camera.ellipsoid.set(0.5, 0.5, 0.5);
    camera.ellipsoidOffset.y = -0.4;
    const club = Object.assign({ camera, engine, _walkLevel: 0 }, mixin);
    try {
        const { stair, streetLevel } = window.VenueLayout.vestibule;
        const tread = (stair.zTop - stair.zBottom) / (stair.steps - 1);
        for (let i = 0; i < stair.steps; i++) {
            const height = streetLevel * (i + 1) / stair.steps;
            const step = BABYLON.MeshBuilder.CreateBox(`tread${i}`, { width: stair.halfWidth * 2, height, depth: tread }, scene);
            step.position.set(0, height / 2, stair.zBottom + (i + 0.5) * tread);
            step.checkCollisions = true;
            step.computeWorldMatrix(true);
        }
        const direction = new BABYLON.Vector3(0, 0, 0.12);
        for (let i = 0; i < 100; i++) {
            camera._collideWithWorld(direction);
            club._updateWalkSurface();
        }
        assert.ok(camera.position.z > 8, `stopped on ascent at ${camera.position}`);
        assert.equal(camera.position.y, streetLevel + 1.7);
        direction.z = -0.12;
        for (let i = 0; i < 100; i++) {
            camera._collideWithWorld(direction);
            club._updateWalkSurface();
        }
        assert.ok(camera.position.z < -1, `stopped on descent at ${camera.position}`);
        assert.equal(camera.position.y, 1.7);
    } finally { engine.dispose(); }
});
