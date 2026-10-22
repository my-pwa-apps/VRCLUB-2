import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('the entrance vestibule and the bar are built, lit by their own accents and walkable', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const state = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        const scene = club.scene;
        const byName = name => scene.getMeshByName(name);
        const slots = mesh => mesh.lightSources.slice(0, club.maxLights).map(light => light.name);
        const stool = scene.meshes.find(mesh => /^barStool1_.*metal_stool/.test(mesh.name));
        const bartender = club.npcAvatars.find(npc => npc.name === 'bartender');
        const bottles = byName('barBottles');
        const layout = window.VenueLayout;

        // The bartender is posed by an AvatarRig every frame (washing, serving), not by an animation group, so
        // "animating" means her hands actually move between rendered frames.
        const hands = bartender.root.getChildTransformNodes(false).filter(node => /hand_[lr]$/.test(node.name));
        const handPositions = () => hands.map(node => node.computeWorldMatrix(true).getTranslation());
        const handsBefore = handPositions();
        let handTravel = 0;
        for (let i = 0; i < 12; i++) {
            await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
            handPositions().forEach((p, h) => { handTravel = Math.max(handTravel, BABYLON.Vector3.Distance(p, handsBefore[h])); });
        }

        // Walk the real collision system: through the doorway, and into the counter from the floor. The walking-surface
        // follow runs between steps (it lowers the eye going down; the risers lift it going up).
        const camera = club.camera;
        const start = camera.position.clone();
        const startLevel = club._walkLevel;
        const push = (from, step, count) => {
            camera.position.copyFrom(from);
            club._walkLevel = 0;
            for (let i = 0; i < count; i++) {
                camera._collideWithWorld(step);
                scene.onBeforeRenderObservable.notifyObservers(scene);
            }
            return camera.position.clone();
        };
        // Up the entrance stair from the club and out of the street door.
        const throughDoor = push(new BABYLON.Vector3(0, 1.7, -3), new BABYLON.Vector3(0, 0, 0.12), 220);
        // The stools stop a walker well short of the counter, so the counter's own collision is checked directly.
        const counter = byName('barJoinery');
        const throughStools = push(new BABYLON.Vector3(6, 1.7, -9.9), new BABYLON.Vector3(0.25, 0, 0), 60);
        const intoRestroom = push(new BABYLON.Vector3(-11.2, 1.7, -3.2), new BABYLON.Vector3(-0.2, 0, 0), 30);
        camera.position.copyFrom(start);
        club._walkLevel = startLevel;

        const monitors = (club._djMonitors || []).map(mesh => {
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            return { min: box.minimumWorld.asArray(), max: box.maximumWorld.asArray(), slots: slots(mesh) };
        });
        const restroomFixtures = (club._restroomFixtures || []);
        const toiletSeats = restroomFixtures.flatMap(mesh => (mesh.metadata && mesh.metadata.vrclubSeats) || []).map(seat => seat.id);

        // Stand inside the restroom facing the vanity mirror and verify the planar mirror activates and includes
        // the player's body + restroom in its renderList, while exteriorAmount stays 0 (indoors).
        camera.position.set(-13.8, 1.7, -5.2);
        camera.setTarget(new BABYLON.Vector3(-12.75, 1.5, -5.2));
        for (let i = 0; i < 4; i++) {
            await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
        }
        const mirrorTex = club.restroomMirrorTexture;
        const mirrorRenderNames = (mirrorTex && mirrorTex.renderList || []).map(m => m.name);
        const mirrorActiveInRestroom = !!(mirrorTex && mirrorTex.refreshRate === 1 && !scene.customRenderTargets.includes(mirrorTex));
        const mirrorReflectsLocalPlayer = !!(club._localRig && club._localRig.meshes.some(m => mirrorRenderNames.includes(m.name)));
        const restroomExterior = window.CityLayout.exteriorAmount(-14.2, -3.2);
        camera.position.copyFrom(start);
        club._walkLevel = startLevel;
        for (let i = 0; i < 2; i++) {
            await new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
        }
        const mirrorIdleOnDanceFloor = !!(mirrorTex && mirrorTex.refreshRate === 0);

        return {
            counterCollides: counter.checkCollisions && counter.getBoundingInfo().boundingBox.minimumWorld.x < layout.bar.counter.xFront,
            stoolBlocks: scene.meshes.filter(mesh => /^barStoolBlock/.test(mesh.name) && mesh.checkCollisions).length,
            built: ['barJoinery', 'barBottles', 'barBacklight', 'vestibuleWalls', 'vestibuleCarpet', 'vestibuleFrame', 'frontWallLintel',
                'restroomWalls', 'restroomPartitions', 'restroomMirrors', 'restroomFloor']
                .filter(name => !byName(name)),
            monitors,
            restroomFixtureCount: restroomFixtures.length,
            restroomSlots: slots(byName('restroomWalls')),
            toiletSeats,
            intoRestroomX: intoRestroom.x,
            mirrorActiveInRestroom,
            mirrorReflectsLocalPlayer,
            mirrorIdleOnDanceFloor,
            restroomExterior,
            bottleCount: bottles.bottleCount,
            bottleTriangles: bottles.getTotalIndices() / 3,
            bottleOpaque: !bottles.material.needAlphaBlending() && bottles.material.alpha === 1,
            bottleColoured: bottles.isVerticesDataPresent(BABYLON.VertexBuffer.ColorKind),
            stools: club._barStools.filter(mesh => /metal_stool/.test(mesh.name) || mesh.sourceMesh).length,
            stoolReady: stool.material.getActiveTextures().every(texture => texture.isReady()),
            barSlots: slots(byName('barJoinery')),
            bottleSlots: slots(bottles),
            stoolSlots: slots(stool),
            bartenderSlots: slots(bartender.meshes[0]),
            vestibuleSlots: slots(byName('vestibuleWalls')),
            roomSlots: slots(byName('leftWall')),
            bartender: {
                x: bartender.root.position.x, z: bartender.root.position.z, enabled: bartender.root.isEnabled(),
                rigged: !!(bartender.rig && bartender.rig.ok), hands: hands.length, handTravel,
                reacts: bartender.reactsToBeat
            },
            layout: { counterBack: layout.bar.counter.xBack, backBar: layout.bar.backBar.xFront },
            doorwayZ: throughDoor.z,
            doorwayY: throughDoor.y,
            streetLevel: layout.vestibule.streetLevel,
            doorwayFar: layout.vestibule.farZ,
            counterX: throughStools.x,
            counterFront: layout.bar.counter.xFront,
            maxLights: club.maxLights
        };
    });
    expect(state.built).toEqual([]);
    expect(state.bottleCount).toBeGreaterThanOrEqual(100);
    expect(state.bottleTriangles).toBeLessThan(60_000);
    expect(state.bottleOpaque).toBe(true);
    expect(state.bottleColoured).toBe(true);
    expect(state.stools).toBeGreaterThanOrEqual(5);
    expect(state.stoolReady).toBe(true);
    // Every bar piece takes the bar light in its first slot; the room keeps its own order.
    for (const slots of [state.barSlots, state.bottleSlots, state.stoolSlots, state.bartenderSlots]) {
        expect(slots[0]).toBe('barLight');
    }
    expect(state.vestibuleSlots[0]).toBe('entranceLight');
    expect(state.restroomSlots[0]).toBe('restroomLight');
    expect(state.roomSlots[0]).toBe('ambient');
    expect(state.monitors.length).toBe(2);
    expect(state.monitors[0].min[1]).toBeCloseTo(1.42, 2);
    expect(state.monitors[1].min[1]).toBeCloseTo(1.42, 2);
    expect(state.monitors[0].slots[0]).toBe('djConsoleLight');
    expect(state.monitors[1].slots[0]).toBe('djConsoleLight');
    expect(state.restroomFixtureCount).toBe(7);
    expect(state.toiletSeats).toEqual(['toilet-0', 'toilet-1']);
    expect(state.intoRestroomX).toBeLessThan(-13.2);
    expect(state.intoRestroomX).toBeGreaterThan(-16.5);
    expect(state.mirrorActiveInRestroom).toBe(true);
    expect(state.mirrorReflectsLocalPlayer).toBe(true);
    expect(state.mirrorIdleOnDanceFloor).toBe(true);
    expect(state.restroomExterior).toBe(0);
    expect(state.bartender.enabled).toBe(true);
    expect(state.bartender.rigged, 'the bartender is posed by her AvatarRig').toBe(true);
    expect(state.bartender.hands).toBe(2);
    expect(state.bartender.handTravel, 'her hands must move between frames (washing or serving)').toBeGreaterThan(0.01);
    expect(state.bartender.reacts).toBe(false);
    expect(state.bartender.x).toBeGreaterThan(state.layout.counterBack);
    expect(state.bartender.x).toBeLessThan(state.layout.backBar);
    // The doorway and the street door are open (the street has loaded by now): a walker climbs the entrance stair,
    // passes the street door at street level and is stopped by the far row of buildings; the counter and the stools
    // stop a walker on the dance-floor side.
    expect(state.doorwayZ).toBeGreaterThan(state.doorwayFar);
    expect(state.doorwayZ).toBeLessThan(24);
    expect(state.doorwayY, 'the walker must be at street level outside').toBeGreaterThan(state.streetLevel + 1.4);
    expect(state.doorwayY).toBeLessThan(state.streetLevel + 2.1);
    expect(state.counterCollides).toBe(true);
    expect(state.stoolBlocks).toBe(5);
    expect(state.counterX).toBeLessThan(state.counterFront);

    // Online, the mirror shows the character the relay assigned this guest, not the default first-person body.
    const online = await page.evaluate(async () => {
        const club = window.vrClub, mp = club.multiplayer;
        const client = new window.NetworkClient({ serverUrl: 'wss://relay.example' });
        client.status = 'connected';
        mp.client = client;
        mp.selfAvatar = 'm3';
        club.camera.position.set(-14.4, 1.7, -1.72);
        club.camera.setTarget(new BABYLON.Vector3(-12.77, 1.45, -1.72));
        const deadline = performance.now() + 20000;
        while (!club._mirrorDouble && performance.now() < deadline) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        for (let i = 0; i < 6; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        const double = club._mirrorDouble, tex = club.restroomMirrorTexture;
        const result = {
            built: !!double, avatar: double && double.avatarId,
            listed: !!double && double.meshes.every(mesh => tex.renderList.includes(mesh)),
            visibleInView: !!double && double.meshes.every(mesh => mesh.isVisible),
            playing: double && double.current,
            lit: !!double && double.meshes[0].lightSources.some(light => light.name === 'restroomLight')
        };
        mp.client = null; mp.selfAvatar = null;
        club.camera.position.set(-5, 1.7, -8);
        for (let i = 0; i < 4; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
        result.goneAfterLeaving = !club._mirrorDouble;
        return result;
    });
    expect(online.built, 'the relay-assigned character must be built for the mirror').toBe(true);
    expect(online.avatar).toBe('m3');
    expect(online.listed, 'the mirror must draw it').toBe(true);
    expect(online.visibleInView, 'it is also the player\'s own body, drawn in their view').toBe(true);
    expect(online.playing).toBe('Idle');
    expect(online.lit, 'it takes the restroom light like everyone else in there').toBe(true);
    expect(online.goneAfterLeaving, 'it is released again when the guest leaves the room').toBe(true);

    // The mirror draws once a frame (it used to draw twice), the walls carry the art, and a stall door shuts around a guest
    // sitting on its toilet and opens again when they stand.
    const dressed = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        const frames = async n => { for (let i = 0; i < n; i++) await new Promise(r => scene.onAfterRenderObservable.addOnce(r)); };
        const until = async (test, ms = 90000) => { const end = performance.now() + ms; while (!test() && performance.now() < end) await frames(1); return test(); };
        club.camera.position.set(-14.4, 1.7, -1.72);
        club.camera.setTarget(new BABYLON.Vector3(-12.77, 1.45, -1.72));
        await frames(6);
        const tex = club.restroomMirrorTexture;
        let renders = 0;
        const observer = tex.onAfterRenderObservable.add(() => { renders++; });
        await frames(10);
        tex.onAfterRenderObservable.remove(observer);
        const result = { mirrorRendersPerFrame: renders / 10, mirrorSamples: tex.samples, mirrorSize: tex.getSize().width };
        const meshes = ['restroomPosters', 'restroomLightbox', 'restroomDoorArt0', 'restroomDoorArt1'].map(name => scene.getMeshByName(name));
        result.art = meshes.map(mesh => !!mesh && mesh.getTotalVertices() >= 4);
        result.atlas = club._restroomArtAtlas && club._restroomArtAtlas.getSize();
        result.litByBack = club._restroomFixtures.every(mesh => mesh.lightSources.some(light => light.name === 'restroomBackLight'));
        const seat = club._restroomFixtures.map(mesh => mesh.metadata && mesh.metadata.vrclubSeats).find(Boolean)[0];
        const doors = club._restroomDoors;
        result.ajar = doors.map(door => door.open);
        club.sitAtSeat(seat);
        result.shut = await until(() => doors[0].open === 0);
        result.otherStillAjar = doors[1].open === 1;
        result.lampBusy = doors[0].lamp.material === doors[0].busy;
        club.standFromSeat(false);
        result.reopened = await until(() => doors[0].open === 1);
        // A remote guest sitting on the second toilet (through the real AvatarManager, as a state frame would deliver it)
        // shuts that door here too, and it opens when they stand.
        const manager = club.avatarManager = new window.AvatarManager(club);
        const frame = seated => ({ x: seat.x, y: seated ? 0 : 1.7, z: -2.0, rotY: Math.PI / 2, seated, floorY: 0 });
        manager.updatePeerState('guest-b', 'Guest B', frame(true));
        result.remoteShut = await until(() => doors[1].open === 0);
        result.firstUntouched = doors[0].open === 1;
        manager.updatePeerState('guest-b', 'Guest B', frame(false));
        result.remoteReopened = await until(() => doors[1].open === 1);
        manager.updatePeerState('guest-b', 'Guest B', {
            x: seat.x, y: 1.1, z: seat.z, rotY: Math.PI / 2, seated: true, floorY: 0
        });
        result.occupiedShut = await until(() => doors[0].open === 0);
        const door = doors[0];
        club.camera.position.set(door.frontX + 0.9, 1.7, (door.opening[0] + door.opening[1]) / 2);
        const step = new BABYLON.Vector3(-0.08, 0, 0);
        for (let i = 0; i < 32; i++) {
            club.camera.getViewMatrix(true);
            club._updateRestroomDoors(1 / 60);
            club.camera._collideWithWorld(step);
        }
        result.lockedDoorStop = club.camera.position.x - door.frontX;
        result.lockedDoorRadius = club.camera.ellipsoid.x;
        club._pressStallDoor({ pickedMesh: door.leaf });
        result.lockedAfterPress = door.remote && !club._doorsByHand[0] && door.leaf.checkCollisions;
        manager.updatePeerState('guest-b', 'Guest B', frame(false));
        await until(() => door.open === 1);
        manager.dispose();
        club.avatarManager = null;
        // By hand, through the real pointer path: a ray at the door's leaf from the hall reaches it, a press pushes it shut
        // (solid), and a second press opens it again.
        club.camera.position.set(-12.9, 1.4, -5.6);
        const leaf = scene.getMeshByName('restroomStallDoor0');
        leaf.computeWorldMatrix(true);
        const target = leaf.getBoundingInfo().boundingBox.centerWorld.clone();
        const origin = club.camera.position.clone();
        const pick = scene.pickWithRay(new BABYLON.Ray(origin, target.subtract(origin).normalize(), 6));
        result.pickedDoor = !!pick.hit && pick.pickedMesh && pick.pickedMesh.metadata && pick.pickedMesh.metadata.vrclubDoor;
        scene.onPointerDown({}, pick);
        result.pushedShut = await until(() => doors[0].open === 0);
        result.solidWhenShut = leaf.checkCollisions;
        scene.onPointerDown({}, pick);
        result.pushedAjar = await until(() => doors[0].open === 1);
        result.softWhenAjar = !leaf.checkCollisions;
        return result;
    });
    expect(dressed.mirrorRendersPerFrame, 'the mirror renders once per frame').toBeLessThanOrEqual(1.05);
    expect(dressed.mirrorRendersPerFrame).toBeGreaterThanOrEqual(0.9);
    expect(dressed.mirrorSize).toBeGreaterThanOrEqual(512);
    expect(dressed.occupiedShut).toBe(true);
    expect(dressed.lockedDoorStop, 'walking stops at the torso radius outside the door').toBeGreaterThan(dressed.lockedDoorRadius);
    expect(dressed.lockedDoorStop, 'the actual leaf, not some other obstacle, stops the camera').toBeLessThan(dressed.lockedDoorRadius + 0.05);
    expect(dressed.lockedAfterPress).toBe(true);
    expect(dressed.art, 'posters, light box and both doors carry art').toEqual([true, true, true, true]);
    expect(dressed.atlas).toEqual({ width: 2048, height: 1024 });
    expect(dressed.litByBack, 'every fixture takes the back light as well').toBe(true);
    expect(dressed.ajar).toEqual([1, 1]);
    expect(dressed.shut, 'the door shuts when the guest sits on its toilet').toBe(true);
    expect(dressed.otherStillAjar).toBe(true);
    expect(dressed.lampBusy).toBe(true);
    expect(dressed.reopened, 'and opens when they stand').toBe(true);
    expect(dressed.remoteShut, 'a remote guest on the other toilet shuts that door for everyone').toBe(true);
    expect(dressed.firstUntouched).toBe(true);
    expect(dressed.remoteReopened, 'and it opens when they stand').toBe(true);
    expect(dressed.pickedDoor, 'a ray at a door hits it').toBe(0);
    expect(dressed.pushedShut, 'a press pushes it shut').toBe(true);
    expect(dressed.solidWhenShut, 'a shut door is solid').toBe(true);
    expect(dressed.pushedAjar, 'and a second press opens it').toBe(true);
    expect(dressed.softWhenAjar).toBe(true);
    await expectHealthyRuntime(page);
});
