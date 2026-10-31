import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('aesthetic show and independent sheet controls use shared desktop, VR and desk actions', async ({ page }) => {
    test.setTimeout(600_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        const out = {};
        out.default = club.showDirector.program;
        document.querySelector('[data-control="cycleShowProgram"]').click();
        out.program = club.showDirector.program;
        out.manual = club.vjManualMode;
        out.pages = {
            show: club._vrQuickMenuPageDefinitions('show').some(b => b.control === 'cycleShowProgram'),
            sheet: club._vrQuickMenuPageDefinitions('sheetSettings').map(b => b.control).filter(Boolean)
        };
        club.showDirector.forceMovement('pulse');
        out.row = { sequence: club.spotSequence, rate: club.spotSequenceRate, locked: club.colorLockActive };
        club.showDirector._applyCue({ look: 'aestheticSheet', bars: 16 });
        for (let i = 0; i < 1200; i++) club._tintClubAir(1 / 60);
        out.dense = club.scene.fogDensity;
        club.toggleLightControl('toggleReducedShowSmoke');
        for (let i = 0; i < 1200; i++) club._tintClubAir(1 / 60);
        out.reduced = club.scene.fogDensity;
        const sheetSpeed = club.laserSheetSpeed;
        const sourceSpeed = club.laserSpeed;
        club.toggleLightControl('cycleSheetSpeed');
        out.sheetSpeed = { before: sheetSpeed, after: club.laserSheetSpeed, sourceBefore: sourceSpeed, sourceAfter: club.laserSpeed };
        club.toggleLightControl('cycleSheetBrightness');
        club.updateLaserSheet({ time: 1, audio: { average: 0.5 } });
        out.darkSheet = club.laserSheet.material.alpha;
        const buttons = window.VJDeskLayout.buttons;
        out.desk = {
            program: club._vjDeskButtonState(buttons.show.find(b => b.id === 'program')).value,
            speed: club._vjDeskButtonState(buttons.lights.find(b => b.id === 'sheetSpeed')).value,
            brightness: club._vjDeskButtonState(buttons.lights.find(b => b.id === 'sheetBrightness')).value
        };
        club.photosensitiveSafeMode = true;
        club.showDirector._applyLook(club.showDirector.looks.aestheticPeak);
        out.safeStrobes = club.strobesActive;
        club.engine.stopRenderLoop();
        club.photosensitiveSafeMode = false;
        club.resumeAutoShow();
        const show = club.showDirector;
        show._applyCue({ look: 'aestheticSweepRows', bars: 16 });
        club.masterIntensity = 1;
        club.kickPulse = 0;
        let time = 100;
        const sample = (beat) => {
            show._cueBarsElapsed = Math.floor(beat / 4);
            show._beatInBar = beat % 4;
            club.vjDirector.beatNumber = beat;
            club.barPhase = 0;
            for (let frame = 0; frame < 120; frame++) {
                time += 1 / 60;
                club.updateSpotlights({ time, dtScale: 1, audio: { hasAudio: false, bass: 0, treble: 0 } });
                club.updateLEDWall(time, { hasAudio: false, bass: 0, treble: 0 });
            }
            club._flushLedWall();
            club.scene.render();
            return {
                directions: club.spotlights.map(spot => {
                    const horizontal = -Math.sin(spot.head.rotation.x);
                    return { x: Math.sin(spot.yoke.rotation.y) * horizontal,
                        y: -Math.cos(spot.head.rotation.x), z: Math.cos(spot.yoke.rotation.y) * horizontal };
                }),
                prism: club.spotlights.some(spot => spot.prism?.isEnabled() && spot.prism.visibility > 0),
                wall: club.ledPanels.map(panel => panel.material.emissiveColor.asArray())
            };
        };
        out.choreography = { down: sample(0), inward: sample(16), returned: sample(32), color: club.ledShowColor.asArray() };
        return out;
    });
    expect(result.default).toBe('nocturne');
    expect(result.program).toBe('aesthetic');
    expect(result.manual).toBe(false);
    expect(result.pages.show).toBe(true);
    expect(result.pages.sheet).toEqual(['cycleSheetSpeed', 'cycleSheetBrightness']);
    expect(result.row).toEqual({ sequence: 2, rate: 1, locked: true });
    expect(result.dense / result.reduced).toBeCloseTo(3, 1);
    expect(Math.exp(-Math.pow(result.dense * 20, 2)), 'dense EXP2 fog suppresses distant surface detail').toBeLessThan(0.1);
    expect(result.sheetSpeed.after).toBeGreaterThan(result.sheetSpeed.before);
    expect(result.sheetSpeed.sourceAfter).toBe(result.sheetSpeed.sourceBefore);
    expect(result.darkSheet).toBe(0);
    expect(result.desk).toEqual({ program: 'AESTHETIC', speed: '150%', brightness: '0%' });
    expect(result.safeStrobes).toBe(false);
    for (const sample of [result.choreography.down, result.choreography.returned]) {
        expect(sample.directions.every(direction => direction.y < -0.999 && Math.abs(direction.x) < 0.02), JSON.stringify(sample.directions)).toBe(true);
    }
    expect(result.choreography.inward.directions.every(direction => Math.abs(direction.x) > 0.4 && Math.abs(direction.z) < 0.02)).toBe(true);
    expect(result.choreography.inward.prism).toBe(true);
    expect(result.choreography.inward.wall.some(color => Math.max(...color) > 0.01)).toBe(true);
    expect(result.choreography.down.wall).not.toEqual(result.choreography.inward.wall);
    for (const color of result.choreography.inward.wall) {
        for (let channel = 1; channel < 3; channel++) {
            expect(Math.abs(color[channel] * result.choreography.color[0] - color[0] * result.choreography.color[channel])).toBeLessThan(0.0001);
        }
    }
    await expectHealthyRuntime(page);
});

/**
 * The VJ desk at the DJ table, in the real club: from where the person who replaces the DJ stands, a ray at the middle
 * of every button lands on that button (the panel's geometry, its orientation and the pick-to-pixel mapping agree),
 * pressing works through the same path a mouse click or a controller trigger takes, and the panels redraw.
 */
test('the VJ desk: every button is where it is drawn, and presses hand the lights over and back', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene;
        await club.modelLoadPromise;
        const { buttons } = window.VJDeskLayout;
        const eye = new BABYLON.Vector3(0, 2.2, -19.4);   // the DJ Booth viewpoint
        const pickAt = (panelId, button, point) => {
            const panel = club._vjDesk.panels.find(item => item.id === panelId);
            const px = point ? point.x : button.rect.x + button.rect.w / 2;
            const py = point ? point.y : button.rect.y + button.rect.h / 2;
            const local = new BABYLON.Vector3(
                (px / panel.canvas.width - 0.5) * panel.width,
                (0.5 - py / panel.canvas.height) * panel.depth,
                0);
            const target = BABYLON.Vector3.TransformCoordinates(local, panel.mesh.getWorldMatrix());
            const ray = new BABYLON.Ray(eye, target.subtract(eye).normalize(), 5);
            return scene.pickWithRay(ray, mesh => mesh.isPickable && mesh.isEnabled() && mesh.isVisible);
        };
        const misses = [];
        const transportPanel = club._vjDesk.panels.find(item => item.id === 'transport');
        const playerHiddenWithDJ = !transportPanel.mesh.isEnabled();
        const djBefore = club.isPeopleVisible('dj');
        club.togglePeopleVisible('dj');
        for (const panelId of ['show', 'lights']) {
            for (const button of buttons[panelId]) {
                if (panelId === 'lights') club._vjDeskLightsPage = button.page || 'fixtures';
                const pick = pickAt(panelId, button);
                const hit = club._vjDeskHit(pick);
                if (!hit || !hit.button || hit.button.id !== button.id) {
                    misses.push(`${button.id} -> ${pick && pick.pickedMesh ? pick.pickedMesh.name : 'nothing'} ${hit && hit.button ? hit.button.id : ''}`);
                }
            }
            club._vjDeskLightsPage = 'fixtures';
        }
        for (const pageName of ['player', 'fx']) {
            club._vjDeskPlayerPage = pageName;
            for (const button of buttons.transport.filter(item => !item.page || item.page === pageName)) {
                const pick = pickAt('transport', button);
                const hit = club._vjDeskHit(pick);
                if (!hit || !hit.button || hit.button.id !== button.id) {
                    misses.push(`${pageName}:${button.id} -> ${pick && pick.pickedMesh ? pick.pickedMesh.name : 'nothing'} ${hit && hit.button ? hit.button.id : ''}`);
                }
            }
        }
        club._vjDeskPlayerPage = 'player';
        // The panel faces the person at the desk (its front, readable side), tilted up from the table.
        const panel = club._vjDesk.panels[0].mesh;
        const facing = panel.getDirection(new BABYLON.Vector3(0, 0, -1));
        const toEye = eye.subtract(panel.getAbsolutePosition()).normalize();

        const press = id => {
            const [panelId, button] = ['show', 'lights', 'transport'].map(p => [p, buttons[p].find(b => b.id === id)]).find(([, b]) => b);
            return club.pressVJDesk(pickAt(panelId, button));
        };
        const lightsBefore = club.lightsActive;
        press('spots');
        const afterSpots = { lights: club.lightsActive, manual: club.vjManualMode, title: club._vjDeskStatus().title };
        club.spotPrismActive = false;
        press('prism');
        const filterOn = club.spotPrismActive;
        const filterOnLabel = club._vjDeskButtonState(buttons.lights.find(b => b.id === 'prism')).value;
        press('prism');
        const filterOff = !club.spotPrismActive;
        const filterOffLabel = club._vjDeskButtonState(buttons.lights.find(b => b.id === 'prism')).value;
        const signatureBefore = club._vjDesk.panels[1].signature;
        club.updateVJDesk({ dt: 1 });
        const redrawn = club._vjDesk.panels[1].signature !== signatureBefore;
        press('auto');
        const afterAuto = { manual: club.vjManualMode, title: club._vjDeskStatus().title };
        club.showDirector.forceMovement('pulse');
        club.showDirector._advanceCue();
        press('auto');
        const autoOff = club.vjManualMode;
        press('auto');
        const autoOn = !club.vjManualMode;
        const djAfter = club.isPeopleVisible('dj');
        press('playerPage');
        const fxPage = club._vjDeskPlayerPage;
        // Turn the ECHO knob the way a mouse would: grab its rim at 7:30, swing a quarter turn clockwise, let go.
        const echoButton = buttons.transport.find(b => b.id === 'echo');
        const knob = window.VJDeskLayout.knob(echoButton.rect);
        const onRim = degrees => ({ x: knob.x + 30 * Math.cos(degrees * Math.PI / 180), y: knob.y + 30 * Math.sin(degrees * Math.PI / 180) });
        club.pressVJDesk(pickAt('transport', echoButton, onRim(-135)));
        const echoOnGrab = club._djEffectsState().echo;
        for (let degrees = -135; degrees <= -45; degrees += 15) club.dragVJDesk(pickAt('transport', echoButton, onRim(degrees)));
        club.releaseVJDesk();
        const echoTurned = club._djEffectsState().echo;
        club.setDJEffect('echo', 0);

        // And the way a hand does: a real controller node aimed at the knob, trigger down, then the wrist twisted
        // 120 degrees clockwise (its top turns toward its right) in ten degree steps, one frame each.
        const hand = new BABYLON.TransformNode('testHand', scene);
        hand.position.copyFrom(eye);
        hand.rotationQuaternion = null;
        const aim = BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(((knob.x / club._vjDesk.panels.find(p => p.id === 'transport').canvas.width) - 0.5) * 1,
                (0.5 - (knob.y / club._vjDesk.panels.find(p => p.id === 'transport').canvas.height)) * 0.27, 0),
            transportPanel.mesh.getWorldMatrix());
        hand.lookAt(aim);
        hand.computeWorldMatrix(true);
        club._xrControllers = [{ pointer: hand, motionController: null }];
        club.pressVJDesk(pickAt('transport', echoButton, knob));
        const heldBy = !!(club._vjDeskDrag && club._vjDeskDrag.controller);
        const wristOnGrab = club._djEffectsState().echo;
        // Which way is clockwise for this node? The way its up vector moves toward its own right vector.
        const upBefore = hand.getDirection(BABYLON.Axis.Y), right = hand.getDirection(BABYLON.Axis.X);
        hand.rotate(BABYLON.Axis.Z, 0.1, BABYLON.Space.LOCAL);
        const clockwise = BABYLON.Vector3.Dot(hand.getDirection(BABYLON.Axis.Y), right) > BABYLON.Vector3.Dot(upBefore, right) ? 1 : -1;
        hand.rotate(BABYLON.Axis.Z, -0.1, BABYLON.Space.LOCAL);
        club.updateVJDesk({ dt: 0.016 });
        for (let i = 0; i < 12; i++) {
            hand.rotate(BABYLON.Axis.Z, clockwise * 10 * Math.PI / 180, BABYLON.Space.LOCAL);
            club.updateVJDesk({ dt: 0.016 });
        }
        const wristTurned = club._djEffectsState().echo;
        club.releaseVJDesk();
        club._xrControllers = [];
        hand.dispose();
        club.setDJEffect('echo', 0);

        // XFADE: a quick slide from full to cut and back, the way a DJ would, then a half-way rest.
        const xfade = buttons.transport.find(b => b.id === 'crossfader');
        const xTrack = window.VJDeskLayout.crossfaderTrack(xfade.rect);
        const xAt = f => ({ x: xTrack.left + f * (xTrack.right - xTrack.left), y: xTrack.y });
        club.pressVJDesk(pickAt('transport', xfade, xAt(1)));
        const xfadeFull = club._djEffectsState().channel;
        for (const f of [0.75, 0.5, 0.25, 0]) club.dragVJDesk(pickAt('transport', xfade, xAt(f)));
        const mutedAfterFirst = club._djEffectsState().channel;
        club.releaseVJDesk();
        club.pressVJDesk(pickAt('transport', xfade, xAt(0)));
        for (const f of [0.3, 0.6, 1]) club.dragVJDesk(pickAt('transport', xfade, xAt(f)));
        const unmutedAfterSecond = club._djEffectsState().channel;
        club.releaseVJDesk();
        club.pressVJDesk(pickAt('transport', xfade, xAt(0.5)));
        const halfWay = club._djEffectsState().channel;
        club.releaseVJDesk();
        const effectsChanged = { ...club._djEffectsState(), echoOnGrab, echoTurned, heldBy, wristOnGrab, wristTurned, mutedAfterFirst, unmutedAfterSecond, xfadeFull, halfWay };
        press('dj');
        const playerHiddenOnReturn = !transportPanel.mesh.isEnabled();
        const pageOnReturn = club._vjDeskPlayerPage;
        const effectsOnReturn = { ...club._djEffectsState() };
        const mirrorRaysBefore = club.mirrorBallRaysActive;
        press('mirrorRays');
        const mirrorRaysAfter = club.mirrorBallRaysActive;
        press('mirrorRays');
        const transport = club._vjDesk.panels.find(item => item.id === 'transport').mesh.getBoundingInfo().boundingBox;
        const show = club._vjDesk.panels.find(item => item.id === 'show').mesh.getBoundingInfo().boundingBox;
        const lights = club._vjDesk.panels.find(item => item.id === 'lights').mesh.getBoundingInfo().boundingBox;
        const mixer = scene.getMeshByName('console_final').getBoundingInfo().boundingBox;
        const tableMesh = scene.getMeshByName('djTable');
        const table = tableMesh.getBoundingInfo().boundingBox;
        const platform = scene.getMeshByName('djPlatform').getBoundingInfo().boundingBox;
        const ledWall = scene.getMeshByName('ledPanel_wall');
        const ledCollider = scene.getMeshByName('ledWallCollider');
        const ledColliderBox = ledCollider.getBoundingInfo().boundingBox;
        const broadFrontBarriers = scene.meshes.filter(mesh => {
            if (!mesh.checkCollisions || !/^collisionWall/.test(mesh.name)) return false;
            const box = mesh.getBoundingInfo().boundingBox;
            return box.minimumWorld.x < -3 && box.maximumWorld.x > 3 &&
                box.minimumWorld.z < -17.5 && box.maximumWorld.z > -18.1;
        }).map(mesh => mesh.name);
        const couchMeshes = club.modelLoader.loadedModels.lounge_couch.container.meshes
            .filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        const couchGlow = couchMeshes.reduce((result, mesh) => {
            const material = mesh.material;
            const emissive = material && material.emissiveColor;
            const ambient = material && material.ambientColor;
            result.emissive = Math.max(result.emissive, emissive ? emissive.r : 0, emissive ? emissive.g : 0, emissive ? emissive.b : 0);
            result.ambient = Math.max(result.ambient, ambient ? ambient.r : 0, ambient ? ambient.g : 0, ambient ? ambient.b : 0);
            result.metallic = Math.max(result.metallic, Number(material && material.metallic) || 0);
            result.normalMap ||= !!(material && material.bumpTexture);
            result.texture ||= !!(material && material.emissiveTexture);
            return result;
        }, { emissive: 0, ambient: 0, metallic: 0, normalMap: false, texture: false });
        return {
            misses, facingDot: BABYLON.Vector3.Dot(facing, toEye), up: facing.y,
            lightsBefore, afterSpots, filterOn, filterOff, filterOnLabel, filterOffLabel, redrawn, afterAuto, djBefore, djAfter, djBack: club.isPeopleVisible('dj'),
            playerHiddenWithDJ, playerHiddenOnReturn, fxPage, pageOnReturn, effectsChanged, effectsOnReturn,
            mirrorRaysBefore, mirrorRaysAfter, mirrorRaysBack: club.mirrorBallRaysActive,             autoOff, autoOn,
            clearance: {
                left: transport.minimumWorld.x - show.maximumWorld.x,
                right: lights.minimumWorld.x - transport.maximumWorld.x,
                mixer: mixer.minimumWorld.z - transport.maximumWorld.z
            },
            boothCollision: {
                table: tableMesh.checkCollisions,
                leftAccess: table.minimumWorld.x - platform.minimumWorld.x,
                rightAccess: platform.maximumWorld.x - table.maximumWorld.x,
                broadFrontBarriers,
                ledWall: ledWall.checkCollisions,
                ledBacking: ledCollider.checkCollisions,
                ledFrontZ: ledColliderBox.maximumWorld.z
            },
            couchGlow,
            meshes: scene.meshes.filter(mesh => /^vjDesk/.test(mesh.name) && !/^vjDesk(Knob|Fader)/.test(mesh.name)).map(mesh => mesh.name),
            oldDesk: scene.meshes.filter(mesh => /^toggleBtn_|speedSlider|audioStreamBtn|vjConsole$/.test(mesh.name)).length
        };
    });

    async function verifyLightingPresets() {
        await enterClub(page);
        const initial = await page.evaluate(async () => {
            const c = window.vrClub;
            await c.modelLoadPromise;
            c.takeLightControl();
            c.vjDirector.setMasterIntensity(0.52);
            c.lightsActive = true;
            c.lasersActive = false;
            c.laserSheetActive = true;
            c.laserSheetOrigin = 'ceilingRight';
            c.laserSheetMotion = 'lateral';
            c.spotHead1Motion = 6;
            c.spotHead4Enabled = false;
            c.spotHead0Color = 5;
            c.spotSequence = 4;
            c.spotSequenceRate = 4;
            c.spotlightSpeed = 0.45;
            c.laserSpeed = 0.65;
            c.ledWallLevel = 0.38;
            c.ledPattern = 7;
            c.currentSpotColor = new BABYLON.Color3(0.23, 0.48, 0.91);
            c._setMirrorBallColor(new BABYLON.Color3(0.75, 0.25, 0.8));
            const buttons = window.VJDeskLayout.buttons.show;
            const press = id => c._runVJDeskButton(buttons.find(button => button.id === id));
            press('presetSave');
            const store = c._lightingPresetStore();
            const saved = JSON.parse(store.export());
            c.spotHead1Motion = 0;
            c.spotHead4Enabled = true;
            c.spotSequence = 0;
            c.ledPattern = 1;
            c.ledWallLevel = 1;
            c.currentSpotColor.set(1, 0, 0);
            c.vjDirector.setMasterIntensity(1);
            const dj = c.isPeopleVisible('dj'), safe = c.photosensitiveSafeMode;
            press('presetRecall');
            const after = c.multiplayer._captureFixtures();
            const expected = saved.slots[0].fx;
            if (safe) {
                expected.strobesActive = false;
                expected.spotStrobeActive = false;
            }
            const mismatches = Object.keys(expected).filter(key => Math.abs(after[key] - expected[key]) > 1e-7
                || (typeof expected[key] !== 'number' && after[key] !== expected[key]));
            await store.openManager();
            return { saved: !!saved.slots[0], mismatches, dj: c.isPeopleVisible('dj') === dj,
                safe: c.photosensitiveSafeMode === safe, manual: c.vjManualMode };
        });
        expect(initial).toEqual({ saved: true, mismatches: [], dj: true, safe: true, manual: true });
        const dialog = page.locator('#lightingPresetDialog');
        await expect(dialog).toBeVisible();
        await dialog.locator('[data-preset-name]').fill('Violet rows');
        await dialog.locator('[data-preset-rename]').click();
        await expect(dialog.locator('[data-preset-slots] option:checked')).toHaveText('1. Violet rows');
        const backup = await page.evaluate(() => window.vrClub.lightingPresets.export());
        const downloadEvent = page.waitForEvent('download');
        await dialog.locator('[data-preset-export]').click();
        const download = await downloadEvent;
        expect(download.suggestedFilename()).toBe('nocturne-lighting-presets.json');
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        expect(Buffer.concat(chunks).toString('utf8')).toBe(backup);
        await dialog.locator('[data-preset-close]').click();
        await enterClub(page);
        await page.evaluate(() => window.vrClub._lightingPresetStore().openManager());
        await expect(dialog.locator('[data-preset-name]')).toHaveValue('Violet rows');
        const file = dialog.locator('[data-preset-file]');
        await file.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
        await expect(dialog.locator('[data-preset-status]')).toContainText('Could not import presets');
        await expect(dialog.locator('[data-preset-import]')).toBeDisabled();
        expect(await page.evaluate(() => window.vrClub.lightingPresets.export())).toBe(backup);
        const imported = JSON.parse(backup);
        imported.slots[0].name = 'Imported look';
        await file.setInputFiles({ name: 'presets.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
        await expect(dialog.locator('[data-preset-import]')).toBeEnabled();
        await expect(dialog.locator('[data-preset-name]')).toHaveValue('Violet rows');
        await dialog.locator('[data-preset-import]').click();
        await expect(dialog.locator('[data-preset-name]')).toHaveValue('Imported look');
        await expect(dialog.locator('[data-preset-status]')).toContainText('All 12 preset slots replaced');
        await dialog.locator('[data-preset-close]').click();
        await expectHealthyRuntime(page);
    }
    console.log('VJ_DESK', JSON.stringify(result));
    expect(result.misses, 'a ray at a button lands somewhere else').toEqual([]);
    expect(result.facingDot, 'the panel must face the person at the desk').toBeGreaterThan(0.5);
    expect(result.up, 'the panel lies on the table, facing up').toBeGreaterThan(0.6);
    expect(result.afterSpots.lights).toBe(!result.lightsBefore);
    expect(result.afterSpots.manual).toBe(true);
    expect(result.afterSpots.title).toBe('YOU ARE THE VJ');
    expect(result.filterOn).toBe(true);
    expect(result.filterOff).toBe(true);
    expect(result.filterOnLabel).toBe('ON');
    expect(result.filterOffLabel).toBe('OFF');
    expect(result.redrawn, 'the LIGHTS panel did not redraw after a change').toBe(true);
    expect(result.afterAuto).toEqual({ manual: false, title: 'AUTOMATIC SHOW' });
    expect(result.autoOff).toBe(true);
    expect(result.autoOn).toBe(true);
    expect(result.djBefore).toBe(true);
    expect(result.djAfter, 'the RESIDENT DJ button must send the DJ home').toBe(false);
    expect(result.djBack).toBe(true);
    expect(result.playerHiddenWithDJ, 'the resident DJ must hide the replacement player').toBe(true);
    expect(result.fxPage).toBe('fx');
    expect(result.effectsChanged.echoOnGrab, 'grabbing a knob must not move it').toBe(0);
    expect(result.effectsChanged.echoTurned, 'a quarter turn of 90 degrees out of 270').toBeCloseTo(1 / 3, 1);
    expect(result.effectsChanged.heldBy, 'the controller aimed at the knob did not take hold of it').toBe(true);
    expect(result.effectsChanged.wristOnGrab, 'the trigger alone must not move the knob').toBe(0);
    expect(result.effectsChanged.wristTurned, 'a 120 degree wrist twist turns the dial by 1.5 x 120 of 270 degrees').toBeCloseTo(1.5 * 120 / 270, 1);
    expect(result.effectsChanged.xfadeFull, 'pressing the right end is full level').toBe(1);
    expect(result.effectsChanged.mutedAfterFirst, 'sliding the XFADE to the left end cuts the music').toBe(0);
    expect(result.effectsChanged.unmutedAfterSecond, 'sliding it back to the right end brings it back').toBe(1);
    expect(result.effectsChanged.halfWay, 'it rests where it is put').toBeCloseTo(0.5, 1);
    expect(result.playerHiddenOnReturn, 'returning the DJ must hide the replacement player').toBe(true);
    expect(result.pageOnReturn).toBe('player');
    expect(result.effectsOnReturn).toEqual({
        lowpass: 0, highpass: 0, echo: 0, flanger: 0, reverb: 0, phaser: 0, sweep: 0, gater: 0, channel: 1
    });
    expect(result.mirrorRaysAfter).toBe(!result.mirrorRaysBefore);
    expect(result.mirrorRaysBack).toBe(result.mirrorRaysBefore);
    expect(result.clearance.left, 'the player overlaps the SHOW panel').toBeGreaterThan(0.02);
    expect(result.clearance.right, 'the player overlaps the LIGHTS panel').toBeGreaterThan(0.02);
    expect(result.clearance.mixer, 'the player extends under the mixer').toBeGreaterThan(0.02);
    expect(result.boothCollision.table, 'the visible DJ table should block walking through the decks').toBe(true);
    expect(result.boothCollision.leftAccess, 'the left side route into the DJ spot is blocked').toBeGreaterThanOrEqual(0.9);
    expect(result.boothCollision.rightAccess, 'the right side route into the DJ spot is blocked').toBeGreaterThanOrEqual(0.9);
    expect(result.boothCollision.broadFrontBarriers, 'an oversized invisible wall still seals the booth front').toEqual([]);
    expect(result.boothCollision.ledWall, 'the LED wall itself is not collidable').toBe(true);
    expect(result.boothCollision.ledBacking, 'the LED tile seams have no continuous collision backing').toBe(true);
    expect(result.boothCollision.ledFrontZ).toBeCloseTo(-20, 2);
    expect(result.couchGlow).toEqual({ emissive: 0, ambient: 0, metallic: 0, normalMap: false, texture: false });
    expect(result.meshes.sort()).toEqual(['vjDeskHousing', 'vjDeskTransportHousing', 'vjDesk_lights', 'vjDesk_show', 'vjDesk_transport']);
    expect(result.oldDesk, 'the old unlabelled buttons are still in the scene').toBe(0);

    // What the person who replaced the DJ sees, one panel at a time (kept with the test results for review).
    for (const [name, eyeX, lookX, fx, lightsPage] of [
        ['vj-desk-show', -0.75, -1.28],
        ['vj-desk-player', 0, 0],
        ['vj-desk-fx', 0, 0, 'fx'],
        ['vj-desk-lights', 0.75, 1.28],
        ['vj-desk-spot-rig', 0.75, 1.28, undefined, 'rig'],
        ['vj-desk-light-settings', 0.75, 1.28, undefined, 'settings']
    ]) {
        await page.evaluate(({ eyeX, lookX, fx, lightsPage }) => {
            const club = window.vrClub;
            if (club.isPeopleVisible('dj')) club.togglePeopleVisible('dj');
            club.camera.position.set(eyeX, 2.25, -19.75);
            club.camera.setTarget(new BABYLON.Vector3(lookX, 1.6, -18.65));
            club._vjDeskPlayerPage = fx || 'player';
            club._vjDeskLightsPage = lightsPage || 'fixtures';
            if (fx === 'fx') for (const [effect, value] of [['lowpass', 0.55], ['echo', 0.3], ['reverb', 0.8], ['phaser', 0.4], ['sweep', 0.75], ['gater', 0.5], ['channel', 0.7]]) club.setDJEffect(effect, value);
            club._vjDesk.dirty = true;
        }, { eyeX, lookX, fx, lightsPage });
        await page.waitForTimeout(3000);
        await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
    }
    await page.evaluate(() => { window.vrClub.resetDJEffects(); window.vrClub._vjDeskPlayerPage = 'player'; });
    await page.evaluate(() => { if (!window.vrClub.isPeopleVisible('dj')) window.vrClub.togglePeopleVisible('dj'); });
    await page.evaluate(() => {
        const club = window.vrClub;
        club.resumeAutoShow();
        club.showDirector.forceMovement('pulse');
        club.showDirector._advanceCue();
    });
    await page.locator('#vjToggle').click();
    await page.locator('#vjTabShow').click();
    const holdButton = page.locator('#vjHoldLookBtn');
    await expect(holdButton).toBeEnabled();
    await holdButton.click();
    await expect(holdButton).toHaveAttribute('aria-pressed', 'true');
    await expect(holdButton).toHaveText('RELEASE THIS LOOK');
    await expect.poll(() => page.evaluate(() => window.vrClub.showDirector.isHeld())).toBe(true);
    await page.locator('#vjAutoShowBtn').click();
    await expect(holdButton).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => window.vrClub.showDirector.isHeld())).toBe(false);
    await expectHealthyRuntime(page);
    await verifyLightingPresets();
});
