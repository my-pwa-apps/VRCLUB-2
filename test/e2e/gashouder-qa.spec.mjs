import { test, expect } from '@playwright/test';
import { enterVR, exitVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness({ music: true });

test('Gashouder stage has walkable side stairs and an open underside', async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    const result = await page.evaluate(() => {
        const club = window.vrClub, camera = club.camera, scene = club.scene;
        const stage = window.GASHOUDER_VENUE.stage;
        const floors = club._teleportFloorMeshes();
        const teleport = ['Left', 'Right'].map(side =>
            Array.from({ length: stage.stairSteps }, (_, i) =>
                floors.includes(scene.getMeshByName(`gashouderStageStair${side}${i}`))));
        club.engine.stopRenderLoop();
        const walk = (x, z, dx, dz, n, level = 0) => {
            camera.position.set(x, 1.7 + level, z);
            club._walkLevel = level;
            let maxLevel = level;
            for (let i = 0; i < n; i++) {
                camera.cameraDirection.set(dx, 0, dz);
                camera._updatePosition();
                club._updateWalkSurface();
                maxLevel = Math.max(maxLevel, club._walkLevel);
            }
            return { x: camera.position.x, z: camera.position.z, level: club._walkLevel, maxLevel };
        };
        const stairs = [-1, 1].map(side => {
            const up = walk(side * 13, stage.stairZ, -side * 0.1, 0, 45);
            const down = walk(up.x, stage.stairZ, side * 0.1, 0, 45, up.level);
            return { up, down };
        });
        const under = walk(1.5, -14, 0, -0.1, 35);
        const out = walk(under.x, under.z, 0, 0.1, 35, under.level);
        club.engine.runRenderLoop(club._renderLoop);
        return { stairs, under, out, teleport };
    });
    expect(result.teleport.flat().every(Boolean)).toBe(true);
    for (const { up, down } of result.stairs) {
        expect(up.level, JSON.stringify(up)).toBeCloseTo(1.8);
        expect(down.level, JSON.stringify(down)).toBeCloseTo(0);
    }
    expect(result.under.z, JSON.stringify(result.under)).toBeLessThan(-17);
    expect(result.under.maxLevel).toBe(0);
    expect(result.out.z, JSON.stringify(result.out)).toBeGreaterThan(-15);
    await enterVR(page);
    const vr = await page.evaluate(() => {
        const club = window.vrClub, camera = club.vrHelper.baseExperience.camera;
        const stage = window.GASHOUDER_VENUE.stage;
        const eye = club._xrHeadHeight();
        return [-1, 1].map(side => {
            camera.position.set(side * 12.59, eye, stage.stairZ);
            const levels = [];
            for (let i = 0; i < stage.stairSteps; i++) {
                camera.position.x = side * (stage.width / 2 + (stage.stairSteps - i - 0.5) * stage.stairDepth);
                club._updateVRWalkSurface(camera);
                levels.push(camera.position.y - eye);
            }
            return levels;
        });
    });
    for (const levels of vr) {
        expect(levels[0]).toBeCloseTo(0.15);
        expect(levels.at(-1)).toBeCloseTo(1.8);
        expect(levels.every((level, i) => i === 0 || level >= levels[i - 1])).toBe(true);
    }
    await exitVR(page);
    await expectHealthyRuntime(page);
});

test('Gashouder table effect requires consent, stays personal and can be stopped in VR', async ({ page }) => {
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    const selectCard = () => {
        const club = window.vrClub, B = window.BABYLON;
        const table = club.gashouderSeatingLayout()[0];
        const ray = new B.Ray(new B.Vector3(table.x, 2, table.z + 0.19), new B.Vector3(0, -1, 0), 2);
        const pick = club.scene.pickWithRay(ray, mesh => mesh.metadata?.vrclubGashouderExperience);
        return { hit: !!pick?.hit, pressed: club.pressGashouderExperience(pick) };
    };
    expect(await page.evaluate(selectCard)).toEqual({ hit: true, pressed: true });
    await expect(page.locator('#gashouderEffectDialog')).toBeVisible();
    await page.locator('#gashouderEffectCancel').click();
    expect(await page.evaluate(() => !!window.vrClub._gashouderExperience?.active)).toBe(false);
    await page.evaluate(selectCard);
    await page.locator('#gashouderEffectStart').click();
    await page.waitForFunction(() => window.vrClub._gashouderExperience?.pass?.isReady());
    const desktop = await page.evaluate(() => {
        const club = window.vrClub, state = club._gashouderExperience;
        return {
            active: state.active, camera: state.camera === club.camera,
            duration: state.endsAt - Date.now(),
            filter: club._gashouderExperienceFilter?.type,
            gain: club._gashouderExperienceFilter?.gain.value,
            safe: club.photosensitiveSafeMode
        };
    });
    expect(desktop.active && desktop.camera && desktop.safe).toBe(true);
    expect(desktop.duration).toBeGreaterThan(170_000);
    expect(desktop.filter).toBe('lowshelf');
    expect(desktop.gain).toBeLessThan(0);
    await enterVR(page);
    await page.waitForFunction(() => window.vrClub._gashouderExperience?.pass?.isReady());
    expect(await page.evaluate(() => window.vrClub._gashouderExperience.camera ===
        window.vrClub.vrHelper.baseExperience.camera)).toBe(true);
    const stop = await page.evaluate(() => {
        const club = window.vrClub;
        const buttons = club._vrQuickMenuPageDefinitions('comfort');
        return { button: buttons.find(button => button.action === 'stopGashouderExperience'), count: buttons.length };
    });
    expect(stop.button?.label).toBe('STOP SIMULATED EFFECT');
    expect(stop.count).toBeLessThanOrEqual(12);
    await page.evaluate(button => window.vrClub._activateVRQuickMenuButton(button), stop.button);
    expect(await page.evaluate(() => window.vrClub._gashouderExperience.active)).toBe(false);
    await page.waitForFunction(() => Math.abs(window.vrClub._gashouderExperienceFilter.gain.value) < 0.02);
    expect(await page.evaluate(selectCard)).toEqual({ hit: true, pressed: true });
    expect(await page.evaluate(() => window.vrClub._vrQuickMenuPage)).toBe('gashouderExperience');
    await page.evaluate(() => window.vrClub._activateVRQuickMenuButton({ action: 'startGashouderExperience' }));
    await page.waitForFunction(() => window.vrClub._gashouderExperience?.pass?.isReady());
    await page.evaluate(() => {
        window.vrClub._gashouderExperience.endsAt = Date.now() - 1;
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => window.vrClub._gashouderExperience.active)).toBe(false);
    await exitVR(page);
    await expectHealthyRuntime(page);
});

for (const preset of ['techno', 'architectural']) {
    test(`Gashouder ${preset} seating is selectable on desktop and in VR`, async ({ page }) => {
        const failures = [];
        page.on('pageerror', error => failures.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') failures.push(message.text());
        });
        await page.goto('/?venue=gashouder');
        await page.locator('#gashouderPresetSelect').selectOption(preset);
        await page.locator('#enterClubBtn').click();
        await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
        await page.evaluate(() => window.vrClub.modelLoadPromise);
        const checkSeats = () => {
            const club = window.vrClub, B = window.BABYLON;
            const stools = club.gashouderSeatingLayout().flatMap(table => table.stools);
            return stools.map(stool => {
                const ray = new B.Ray(new B.Vector3(stool.x, 2, stool.z), new B.Vector3(0, -1, 0), 2);
                const pick = club.scene.pickWithRay(ray, mesh =>
                    mesh.metadata?.vrclubSeats?.some(seat => seat.id === stool.id));
                const seat = pick?.pickedMesh?.metadata?.vrclubSeats?.[0];
                return { hit: !!pick?.hit, id: seat?.id, x: seat?.x, z: seat?.z };
            });
        };
        const seats = await page.evaluate(checkSeats);
        expect(seats).toHaveLength(6);
        for (const seat of seats) expect(seat.hit, seat.id).toBe(true);
        expect(new Set(seats.map(seat => seat.id)).size).toBe(6);
        expect(await page.evaluate(() => {
            const scene = window.vrClub.scene;
            return !!scene.getMeshByName('gashouderSeatingTables') &&
                Array.from({ length: 3 }, (_, i) => scene.getMeshByName(`gashouderTableBlock${i}`))
                    .every(mesh => mesh?.checkCollisions) &&
                Array.from({ length: 6 }, (_, i) => scene.getMeshByName(`gashouderStoolBlock${i}`))
                    .every(mesh => mesh?.checkCollisions);
        })).toBe(true);
        const sit = () => {
            const club = window.vrClub, B = window.BABYLON;
            const stool = club.gashouderSeatingLayout()[0].stools[0];
            const ray = new B.Ray(new B.Vector3(stool.x, 2, stool.z), new B.Vector3(0, -1, 0), 2);
            const pick = club.scene.pickWithRay(ray, mesh =>
                mesh.metadata?.vrclubSeats?.some(seat => seat.id === stool.id));
            const pressed = club._pressSeat(pick);
            const camera = club._playerCamera();
            return { pressed, id: club._activeSeat?.id, y: camera.position.y, height: club._xrHeadHeight?.() };
        };
        const desktop = await page.evaluate(sit);
        expect(desktop.pressed).toBe(true);
        expect(desktop.id).toBe(seats[0].id);
        expect(desktop.y).toBeCloseTo(1.2);
        await page.evaluate(() => window.vrClub.standFromSeat());
        await enterVR(page);
        const vr = await page.evaluate(sit);
        expect(vr.pressed).toBe(true);
        expect(vr.id).toBe(seats[0].id);
        expect(vr.y).toBeCloseTo(vr.height);
        expect(await page.evaluate(() => window.vrClub.standFromSeat())).toBe(true);
        await exitVR(page);
        if (preset === 'techno') await expectHealthyRuntime(page);
        else expect(await page.evaluate(() => window.vrClub.getDiagnostics().recentLogs
            .filter(entry => entry.category === 'error'))).toEqual([]);
        expect(failures).toEqual([]);
    });
}

test('Gashouder repairs appear in the rendered scene and headset session', async ({ page }) => {
    test.setTimeout(300_000);
    const warnings = [];
    page.on('console', message => {
        if (message.type() === 'warning' && message.text().includes('stageRust')) warnings.push(message.text());
    });
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    const scene = await page.evaluate(() => {
        const club = window.vrClub;
        const mesh = name => club.scene.getMeshByName(name);
        const rings = mesh('gashouderCircularRoofRings').getBoundingInfo().boundingBox;
        const cable = mesh('mirrorBallCable').getBoundingInfo().boundingBox;
        const hub = mesh('gashouderRoofHub').getBoundingInfo().boundingBox;
        const hit = {};
        club._intersectRoomInterior(0, 5, 0, 0, 0, -1, hit);
        const lightHitZ = hit.pz;
        const picker = window.VJDeskLayout.buttons.lights.find(button => button.label === 'ENTRANCE LEFT');
        const deskLabel = club._vjDeskButtonState(picker).label;
        club._runVJDeskButton(picker);
        return {
            rings: [rings.minimumWorld.y, rings.maximumWorld.y],
            cableTop: cable.maximumWorld.y,
            hub: [hub.minimumWorld.y, hub.maximumWorld.y],
            material: mesh('gashouderMainStage').material.name,
            textured: !!mesh('gashouderMainStage').material.baseTexture,
            doors: ['main', 'loading'].map(kind => mesh(`gashouder${kind}Door`).checkCollisions),
            backing: mesh('gashouderLedWallCollider').isVisible,
            labels: Array.from(document.querySelectorAll('#spotRigSelection option'), option => option.textContent),
            lightHitZ, deskLabel, selected: club._spotEditTarget,
            vrLabel: club._vrQuickMenuPageDefinitions('spotHeads')[0].label
        };
    });
    expect(scene.rings[0]).toBeGreaterThan(9.7);
    expect(scene.rings[1]).toBeLessThan(14.5);
    expect(scene.cableTop).toBeGreaterThan(scene.hub[0]);
    expect(scene.cableTop).toBeLessThan(scene.hub[1]);
    expect(scene.material).toBe('steelGirder');
    expect(scene.doors).toEqual([true, true]);
    expect(scene.backing).toBe(true);
    expect(scene.labels[0]).toBe('ALL 24 SPOTS');
    expect(scene.labels[6]).toBe('GROUP 1');
    expect(scene.lightHitZ).toBeCloseTo(-24.9);
    expect(scene.deskLabel).toBe('GROUP 1');
    expect(scene.selected).toBe(6);
    expect(scene.vrLabel).toBe('GROUP 1');
    expect(warnings).toEqual([]);
    const compareRings = async () => {
        const ringComparison = await page.evaluate(() => {
            const B = window.BABYLON;
            const canvas = document.createElement('canvas');
            canvas.width = 1024;
            canvas.height = 768;
            const engine = new B.Engine(canvas, true, { preserveDrawingBuffer: true });
            const scene = new B.Scene(engine);
            scene.clearColor = new B.Color4(0, 0, 0, 1);
            const camera = new B.FreeCamera('roofComparison', B.Vector3.Zero(), scene);
            camera.minZ = 0.1;
            new B.HemisphericLight('roofLight', new B.Vector3(0, -1, 0), scene);
            const material = new B.StandardMaterial('roofMaterial', scene);
            material.diffuseColor = new B.Color3(0.7, 0.7, 0.7);
            const optimized = new B.Mesh('optimizedRings', scene);
            B.VertexData.ExtractFromMesh(window.vrClub.scene.getMeshByName('gashouderCircularRoofRings'))
                .applyToMesh(optimized);
            optimized.material = material;
            const radii = [3.2, 8.5, 14.2, 19.5, 26.4];
            const parts = radii.map((radius, index) => {
                const ring = B.MeshBuilder.CreateTorus('originalRing', {
                    diameter: radius * 2, thickness: index === 4 ? 0.28 : 0.2, tessellation: 128
                }, scene);
                ring.position.y = 14.5 - 4.5 * radius / 26.4;
                return ring;
            });
            const original = B.Mesh.MergeMeshes(parts, true, true);
            original.material = material;
            const copy = document.createElement('canvas');
            copy.width = canvas.width;
            copy.height = canvas.height;
            const context = copy.getContext('2d', { willReadFrequently: true });
            const capture = mesh => {
                original.setEnabled(mesh === original);
                optimized.setEnabled(mesh === optimized);
                scene.render();
                context.drawImage(canvas, 0, 0);
                return context.getImageData(0, 0, canvas.width, canvas.height).data;
            };
            const comparisons = [];
            for (const [position, target] of [
                [[0, 1.7, 0], [0, 14, 0.1]],
                [[0, 3.5, -19], [0, 12, 0]]
            ]) {
                camera.position.set(...position);
                camera.setTarget(new B.Vector3(...target));
                const before = capture(original);
                const after = capture(optimized);
                let visible = 0, changed = 0;
                for (let i = 0; i < before.length; i += 4) {
                    if (Math.max(before[i], before[i + 1], before[i + 2]) > 8) visible++;
                    if (Math.max(Math.abs(before[i] - after[i]), Math.abs(before[i + 1] - after[i + 1]),
                        Math.abs(before[i + 2] - after[i + 2])) > 8) changed++;
                }
                comparisons.push({ visible, changed });
            }
            scene.dispose();
            engine.dispose();
            return comparisons;
        });
        for (const comparison of ringComparison) {
            expect(comparison.visible).toBeGreaterThan(1000);
            expect(comparison.changed / comparison.visible).toBeLessThan(0.05);
        }
    };
    await enterVR(page);
    expect(await page.evaluate(() => window.vrClub.isInVRMode)).toBe(true);
    const pose = await page.evaluate(() => {
        const camera = window.vrClub.vrHelper.baseExperience.camera;
        const forward = camera.getForwardRay(1).direction;
        return { position: camera.globalPosition.asArray(), yawDegrees: Math.atan2(forward.x, forward.z) * 180 / Math.PI };
    });
    const entry = await page.evaluate(() => window.GASHOUDER_VENUE.vrEntry);
    expect(pose.position[0]).toBeCloseTo(entry.x, 1);
    expect(pose.position[2]).toBeCloseTo(entry.z, 1);
    expect(Math.abs(Math.abs(pose.yawDegrees) - 180)).toBeLessThan(2);
    await exitVR(page);
    await expectHealthyRuntime(page);
    await compareRings();
});

test('experimental Gashouder dancer count reaches 200 and can return to auto', async ({ page }) => {
    test.skip(process.env.VRCLUB_CROWD_STRESS !== '1', 'Set VRCLUB_CROWD_STRESS=1 for the 200-dancer stress test.');
    test.setTimeout(900_000);
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.evaluate(() => window.vrClub.modelLoadPromise);
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabClub').click();
    const slider = page.locator('#gashouderCrowdCount');
    await expect(slider).toHaveAttribute('max', '200');
    await expect(page.locator('#gashouderCrowdStatus')).toContainText('experimental');
    await slider.fill('200');
    expect(await page.evaluate(() => localStorage.getItem('vrclub.gashouderCrowdCount'))).toBe('200');
    await page.waitForFunction(() => window.vrClub.npcAvatars.filter(npc =>
        npc.name.startsWith('dancer') && npc.root.isEnabled()).length === 200, null, { timeout: 600_000 });
    const crowd = await page.evaluate(() => {
        const dancers = window.vrClub.npcAvatars.filter(npc => npc.name.startsWith('dancer'));
        return {
            count: dancers.length,
            sources: new Set(dancers.map(npc => npc.characterSourceId)).size,
            notPlaying: dancers.filter(npc => npc.animations.length !== 1 || !npc.animations[0].isPlaying)
                .map(npc => ({ name: npc.name, source: npc.characterSourceId, groups: npc.animations.length })),
            choreographed: dancers.filter(npc => npc.dance).length,
            colliders: dancers.every(npc => npc.collider?.isEnabled())
        };
    });
    expect(crowd.count).toBe(200);
    expect(crowd.sources).toBe(24);
    expect(crowd.notPlaying).toEqual([]);
    expect(crowd.choreographed).toBeGreaterThan(0);
    expect(crowd.colliders).toBe(true);
    const frames = await page.evaluate(() => window.vrClub.npcAvatars.filter(npc =>
        npc.name.startsWith('dancer')).map(npc => npc.animations[0].animatables[0]?.masterFrame));
    await page.waitForTimeout(3000);
    const moved = await page.evaluate(previous => window.vrClub.npcAvatars.filter(npc =>
        npc.name.startsWith('dancer')).filter((npc, index) =>
        npc.animations[0].animatables[0]?.masterFrame !== previous[index]).length, frames);
    expect(moved).toBeGreaterThan(180);
    await page.locator('#gashouderCrowdAuto').click();
    await page.waitForFunction(() => window.vrClub.npcAvatars.filter(npc =>
        npc.name.startsWith('dancer') && npc.root.isEnabled()).length === 6, null, { timeout: 120_000 });
    expect(await page.evaluate(() => window.vrClub.npcAvatars.filter(npc =>
        npc.name.startsWith('dancer')).length)).toBe(24);
    expect(await page.evaluate(() => localStorage.getItem('vrclub.gashouderCrowdCount'))).toBeNull();
    await expectHealthyRuntime(page);
});

test('a saved Gashouder dancer target survives reload', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/?venue=gashouder');
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabClub').click();
    await page.locator('#gashouderCrowdCount').fill('200');
    expect(await page.evaluate(() => localStorage.getItem('vrclub.gashouderCrowdCount'))).toBe('200');
    await page.reload();
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.gashouderCrowdOverride === 200, null, { timeout: 180_000 });
    expect(await page.evaluate(() => window.vrClub.getGashouderCrowdSize())).toBe(200);
});
