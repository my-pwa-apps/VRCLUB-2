import { test, expect } from '@playwright/test';
import { browserFailures, enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('later lighting groups respect opaque depth without hiding foreground beams', async ({ page }) => {
    await enterClub(page);
    const results = await page.evaluate(async () => {
        const club = window.vrClub;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const engine = new BABYLON.Engine(canvas, false, { preserveDrawingBuffer: true });
        const scene = new BABYLON.Scene(engine);
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        new BABYLON.FreeCamera('occlusionCamera', new BABYLON.Vector3(0, 0, -5), scene);
        const occluder = BABYLON.MeshBuilder.CreatePlane('opaqueSurface', { size: 2 }, scene);
        const opaque = new BABYLON.StandardMaterial('opaqueMaterial', scene);
        opaque.disableLighting = true;
        occluder.material = opaque;
        const beam = BABYLON.MeshBuilder.CreatePlane('testBeam', { size: 2 }, scene);
        const emission = new BABYLON.StandardMaterial('beamMaterial', scene);
        emission.disableLighting = true;
        emission.emissiveColor.set(1, 0, 0);
        emission.alpha = 0.8;
        emission.disableDepthWrite = true;
        beam.material = emission;
        try {
            await scene.whenReadyAsync();
            const sample = () => {
                scene.render();
                const pixel = new Uint8Array(4);
                engine._gl.readPixels(32, 32, 1, 1, engine._gl.RGBA, engine._gl.UNSIGNED_BYTE, pixel);
                return pixel[0];
            };
            return [1, 2].map(group => {
                beam.renderingGroupId = group;
                beam.position.z = 1;
                scene.setRenderingAutoClearDepthStencil(group, true);
                const withoutDepth = sample();
                const setup = club.scene.getAutoClearDepthStencilSetup(group);
                scene.setRenderingAutoClearDepthStencil(group, setup.autoClear, setup.depth, setup.stencil);
                const behind = sample();
                beam.position.z = -1;
                const front = sample();
                return { group, withoutDepth, behind, front };
            });
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
    for (const result of results) {
        expect(result.withoutDepth).toBeGreaterThan(100);
        expect(result.behind).toBeLessThan(5);
        expect(result.front).toBeGreaterThan(100);
    }
});

test('mirror-only cues do not turn the foreground into a white layer', async ({ page }) => {
    await enterClub(page);
    const foreground = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.showDirector._applyCue({ look: 'deepBlue', bars: 1024 });
        return new Promise(resolve => {
            let frames = 0;
            const observer = club.scene.onAfterRenderObservable.add(() => {
                if (++frames < 60) return;
                club.scene.onAfterRenderObservable.remove(observer);
                const gl = club.engine._gl;
                const previous = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
                const pixel = new Uint8Array(4);
                let brightness = 0;
                let samples = 0;
                for (let row = 1; row <= 4; row++) {
                    for (let column = 2; column <= 8; column++) {
                        gl.readPixels(Math.floor(gl.drawingBufferWidth * column / 10),
                            Math.floor(gl.drawingBufferHeight * row / 12),
                            1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
                        brightness += (pixel[0] + pixel[1] + pixel[2]) / 3;
                        samples++;
                    }
                }
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous);
                resolve({
                    meanBrightness: brightness / samples,
                    specularPath: club.scene.getMeshByName('floor').subMeshes[0]
                        .materialDefines.toString().includes('#define SPECULARTERM')
                });
            });
        });
    });
    expect(foreground.specularPath).toBe(true);
    expect(foreground.meanBrightness).toBeLessThan(60);
    await expectHealthyRuntime(page);
});

test('production build initializes a rendered club without browser errors', async ({ page }) => {
    page.on('console', message => {
        if (message.text().includes('uniform buffer that is too small')) {
            browserFailures.get(page).push(`webgl: ${message.text()}`);
        }
    });
    await enterClub(page);

    const lightingState = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        // The NOCTURNE opener ("eclipse") deliberately runs with every spotlight dark,
        // so pin a lit look before asserting that the floor can receive spotlights.
        club.showDirector._applyCue({ look: 'firstLight', bars: 1024 });
        for (let frame = 0; frame < 3; frame++) {
            await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        }
        const floor = club.scene.getMeshByName('floor');
        const equipmentLights = club.scene.lights.filter(light =>
            /^(djConsoleLight|speakerLight_)/.test(light.name));
        return {
            responsiveMaterials: !club.scene.blockMaterialDirtyMechanism && !floor.material.isFrozen,
            floorHasSpotlights: floor.lightSources.some(light => light.name.startsWith('spot')),
            equipmentCount: equipmentLights.length,
            equipmentIsLocal: equipmentLights.every(light => light.includedOnlyMeshes.length > 0 &&
                !light.canAffectMesh(floor))
        };
    });
    expect(lightingState).toEqual({
        responsiveMaterials: true,
        floorHasSpotlights: true,
        equipmentCount: 3,
        equipmentIsLocal: true
    });

    const renderState = await page.evaluate(() => ({
        ready: window.vrClub.ready,
        canvasWidth: window.vrClub.canvas.width,
        canvasHeight: window.vrClub.canvas.height,
        activeCamera: window.vrClub.scene.activeCamera?.name,
        engineDisposed: window.vrClub.engine.isDisposed,
        cameraArtifactsDisabled: !window.vrClub.renderPipeline.grainEnabled &&
            !window.vrClub.renderPipeline.chromaticAberrationEnabled,
        floorFogRemoved: !window.vrClub.scene.particleSystems.some(system => system.name === 'floorFog'),
        configuredGlow: window.vrClub.glowLayer.intensity === window.vrClub.vrSettings.desktop.glowIntensity,
        blindersRemoved: !('blindersActive' in window.vrClub) &&
            !window.vrClub.scene.meshes.some(mesh => /blinder/i.test(mesh.name)) &&
            !document.querySelector('[data-control="blindersActive"]')
    }));
    expect(renderState).toMatchObject({
        ready: true,
        activeCamera: 'camera',
        engineDisposed: false,
        cameraArtifactsDisabled: true,
        floorFogRemoved: true,
        configuredGlow: true,
        blindersRemoved: true
    });
    expect(renderState.canvasWidth).toBeGreaterThan(0);
    expect(renderState.canvasHeight).toBeGreaterThan(0);

    // Each notification makes every material walk every mesh (~100 ms at this scene
    // size); per-frame exposure changes must bypass it or the club renders at <10 fps.
    const exposureNotifications = await page.evaluate(async () => {
        const club = window.vrClub;
        const config = club.renderPipeline.imageProcessing.imageProcessingConfiguration;
        let count = 0;
        const observer = config.onUpdateParameters.add(() => { count++; });
        for (let frame = 0; frame < 20; frame++) {
            await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        }
        config.onUpdateParameters.remove(observer);
        return count;
    });
    expect(exposureNotifications).toBe(0);

    // The visible shell and roof must contain the free desktop camera: the invisible
    // collision band is 4 m tall and open at the entrance.
    const escape = await page.evaluate(() => {
        const camera = window.vrClub.camera;
        const start = camera.position.clone();
        const push = (from, step, count) => {
            camera.position.copyFrom(from);
            for (let i = 0; i < count; i++) camera._collideWithWorld(step);
            return camera.position.clone();
        };
        const outEntrance = push(new BABYLON.Vector3(0, 1.7, -3), new BABYLON.Vector3(0, 0, 0.25), 80);
        const throughSideWall = push(new BABYLON.Vector3(0, 6, -12), new BABYLON.Vector3(-0.25, 0, 0), 80);
        const throughRoof = push(new BABYLON.Vector3(0, 1.7, -12), new BABYLON.Vector3(0, 0.25, 0), 80);
        camera.position.copyFrom(start);
        const bounds = name => window.vrClub.scene.getMeshByName(name).getBoundingInfo().boundingBox;
        const vestibule = window.VenueLayout.vestibule;
        return {
            z: outEntrance.z, vestibuleFar: vestibule.farZ, doorwayWalked: outEntrance.z > vestibule.wallZ,
            x: throughSideWall.x, leftWallInner: bounds('leftWall').maximumWorld.x,
            y: throughRoof.y, roofUnderside: bounds('ceiling').minimumWorld.y
        };
    });
    // The front wall has a doorway and so does the vestibule's street wall: the visitor walks out onto the avenue and
    // is stopped by the far row of buildings. The side wall and the roof still contain the free camera.
    expect(escape.doorwayWalked).toBe(true);
    expect(escape.z).toBeGreaterThan(escape.vestibuleFar);
    expect(escape.z).toBeLessThan(24);
    expect(escape.x).toBeGreaterThan(escape.leftWallInner);
    expect(escape.y).toBeLessThanOrEqual(escape.roofUnderside);

    const showState = await page.evaluate(() => {
        const club = window.vrClub;
        const director = club.showDirector;

        director._applyLook(director.looks.liquidPlane, 1);
        const laserSheet = {
            exists: Boolean(club.laserSheet),
            hazeLayerExists: Boolean(club.laserSheetHaze),
            smokeScatterExists: Boolean(club.laserSheetSmokeScatter),
            hazeUsesIndependentNoise: club.laserSheetHaze?.material.opacityTexture !==
                club.laserSheet.material.opacityTexture,
            // The procedural noise writes alpha 1: unless its brightness is the opacity, no smoke shows.
            smokeNoiseIsOpacity: club.laserSheet.material.opacityTexture.getAlphaFromRGB === true &&
                club.laserSheetHaze.material.opacityTexture.getAlphaFromRGB === true,
            active: club.laserSheetActive,
            alpha: club.laserSheet.material.alpha,
            depthWriteDisabled: club.laserSheet.material.disableDepthWrite,
            minimumPitch: club._laserSheetBasePitch - club._laserSheetPitchRange,
            exclusive: !club.lightsActive && !club.lasersActive && !club.mirrorBallActive &&
                !club.ledWallActive && !club.strobesActive
        };

        const sampleSheetVariant = lookName => {
            director._applyLook(director.looks[lookName], 1);
            club.updateLaserSheet({ time: 0, dtScale: 1, audio: { average: 0 } });
            const start = { pitch: club.laserSheetSource.rotation.x, yaw: club.laserSheetSource.rotation.y };
            // The phase integrates elapsed frames now, not the absolute clock: run ten real seconds at 60 Hz.
            for (let frame = 1; frame <= 600; frame++) {
                club.updateLaserSheet({ time: frame / 60, dtScale: 1, audio: { average: 0 } });
            }
            return {
                origin: club.laserSheetOrigin,
                motion: club.laserSheetMotion,
                position: club.laserSheetSource.position.asArray(),
                emitter: club.laserSheet.parent.name,
                hazeEmitter: club.laserSheetHaze.parent.name,
                fanB: {
                    visible: club._laserSheetFanB.sheet.isVisible,
                    hazeVisible: club._laserSheetFanB.haze.isVisible,
                    emitter: club._laserSheetFanB.sheet.parent.name,
                    rightYaw: club._laserSheetMounts.ceilingRight.housing.rotation.y,
                    leftYaw: club._laserSheetMounts.ceilingLeft.housing.rotation.y,
                    rightSlitLit: club._laserSheetMounts.ceilingRight.aperture.material.emissiveColor.g > 0
                },
                projectors: ['laserSheetSource', 'laserSheetSourceRight'].map(name => {
                    const mesh = club.scene.getMeshByName(name);
                    return mesh ? { position: mesh.position.asArray(), visible: mesh.isVisible } : null;
                }),
                smokeScatterEmitRate: club.laserSheetSmokeScatter?.emitRate || 0,
                start,
                afterTenSeconds: {
                    pitch: club.laserSheetSource.rotation.x,
                    yaw: club.laserSheetSource.rotation.y
                }
            };
        };
        const sheetVariants = {
            left: sampleSheetVariant('ceilingSidewash'),
            right: sampleSheetVariant('ceilingDip')
        };

        club.photosensitiveSafeMode = false;
        director._applyLook(director.looks.whiteChase, 1);
        // These blocks force bursts through the free-running scheduler; the beat-locked
        // path is covered by unit tests against a stubbed beat grid.
        club.strobeSync = 'free';
        club._strobeChaseStep = 0;
        const chase = [];
        for (let step = 0; step < 4; step++) {
            club.strobes.forEach(strobe => {
                strobe.flashDuration = 0;
                strobe._burstOn = false;
            });
            club._nextStrobeBurstTime = 0;
            club.updateStrobes({ time: step + 1, dt: 0.001, audio: { bass: 0 } });
            chase.push(club.strobes
                .map((strobe, index) => strobe.material.emissiveColor.r > 0.1 ? index : -1)
                .filter(index => index >= 0));
        }
        const chaseExclusive = !club.lightsActive && !club.lasersActive &&
            !club.laserSheetActive && !club.mirrorBallActive && !club.ledWallActive;

        club.photosensitiveSafeMode = true;
        director._applyLook(director.looks.whiteChase, 1);
        const safeMode = { strobes: club.strobesActive };

        club.photosensitiveSafeMode = false;
        director._applyLook(director.looks.chromaticRoom, 1);
        director._applyContinuous(club.vjDirector, {});
        const colorLock = {
            active: club.colorLockActive,
            master: club.currentSpotColor.asArray(),
            mirror: club.mirrorBallSpotlightColor.asArray(),
            led: club.ledShowColor.asArray()
        };

        const ambient = club.scene.getLightByName('ambient');
        const preBounceState = {
            masterIntensity: club.masterIntensity,
            lightsActive: club.lightsActive,
            ledWallActive: club.ledWallActive,
            lasersActive: club.lasersActive,
            laserSheetActive: club.laserSheetActive,
            mirrorBallActive: club.mirrorBallActive,
            ambientIntensity: ambient.intensity,
            ambientDiffuse: ambient.diffuse.clone()
        };
        club.masterIntensity = 1;
        club.lightsActive = true;
        club.ledWallActive = true;
        club.lasersActive = true;
        club.laserSheetActive = true;
        club.mirrorBallActive = true;
        for (let frame = 0; frame < 360; frame++) club.updateRoomBounce({ dtScale: 1 });
        const activeRoomBounce = ambient.intensity;
        club.masterIntensity = 0;
        for (let frame = 0; frame < 360; frame++) club.updateRoomBounce({ dtScale: 1 });
        const blackoutRoomBounce = ambient.intensity;
        club.masterIntensity = preBounceState.masterIntensity;
        club.lightsActive = preBounceState.lightsActive;
        club.ledWallActive = preBounceState.ledWallActive;
        club.lasersActive = preBounceState.lasersActive;
        club.laserSheetActive = preBounceState.laserSheetActive;
        club.mirrorBallActive = preBounceState.mirrorBallActive;
        ambient.intensity = preBounceState.ambientIntensity;
        ambient.diffuse.copyFrom(preBounceState.ambientDiffuse);

        return {
            laserSheet, sheetVariants, chase, chaseExclusive, safeMode, colorLock,
            roomBounce: {
                active: activeRoomBounce,
                blackout: blackoutRoomBounce,
                baseAmbient: club.vrSettings.desktop.ambientIntensity
            }
        };
    });
    expect(showState).toMatchObject({
        laserSheet: {
            exists: true,
            hazeLayerExists: true,
            smokeScatterExists: false,
            hazeUsesIndependentNoise: true,
            smokeNoiseIsOpacity: true,
            active: true,
            alpha: 0.1,
            depthWriteDisabled: true,
            exclusive: true
        },
        chaseExclusive: true,
        safeMode: { strobes: false },
        colorLock: {
            active: true,
            master: showState.colorLock.master,
            mirror: showState.colorLock.master,
            led: showState.colorLock.master
        }
    });
    expect(showState.chase.every(burst => burst.length === 1)).toBe(true);
    expect(showState.chase.every((burst, index) => index === 0 || burst[0] !== showState.chase[index - 1][0])).toBe(true);
    expect(showState.laserSheet.minimumPitch).toBeGreaterThan(0);
    expect(showState.sheetVariants.left).toMatchObject({
        origin: 'both',
        motion: 'lateral',
        position: [-6, 7.55, -16],
        emitter: 'laserSheetSource',
        hazeEmitter: 'laserSheetSource'
    });
    // One projector hangs on each side of the truss, and every sheet look fires both.
    for (const variant of [showState.sheetVariants.left, showState.sheetVariants.right]) {
        expect(variant.projectors).toEqual([
            { position: [-6, 7.55, -16], visible: true },
            { position: [6, 7.55, -16], visible: true }
        ]);
        expect(variant.fanB).toMatchObject({ visible: true, hazeVisible: true, emitter: 'laserSheetSourceRight', rightSlitLit: true });
        expect(variant.fanB.rightYaw).toBeCloseTo(-variant.fanB.leftYaw, 6);
    }
    expect(Math.abs(showState.sheetVariants.left.afterTenSeconds.pitch - showState.sheetVariants.left.start.pitch))
        .toBeGreaterThan(0.005);
    expect(showState.sheetVariants.left.smokeScatterEmitRate).toBe(0);
    expect(Math.abs(showState.sheetVariants.left.afterTenSeconds.yaw - showState.sheetVariants.left.start.yaw))
        .toBeGreaterThan(0.015);
    expect(showState.sheetVariants.right).toMatchObject({
        origin: 'both',
        motion: 'vertical',
        position: [-6, 7.55, -16],
        emitter: 'laserSheetSource',
        hazeEmitter: 'laserSheetSource'
    });
    expect(Math.abs(showState.sheetVariants.right.afterTenSeconds.yaw - showState.sheetVariants.right.start.yaw))
        .toBeGreaterThan(0.005);
    expect(showState.sheetVariants.right.smokeScatterEmitRate).toBe(0);
    expect(Math.abs(showState.sheetVariants.right.afterTenSeconds.pitch - showState.sheetVariants.right.start.pitch))
        .toBeGreaterThan(0.015);
    // Bounce lifts the ambient fill while fixtures run, stays under the desktop cap
    // (0.28 in updateRoomBounce) and settles back to the configured base on blackout.
    // Asserted against the live config so a deliberate retune does not break the test.
    expect(showState.roomBounce.active).toBeGreaterThan(showState.roomBounce.baseAmbient + 0.1);
    expect(showState.roomBounce.active).toBeLessThanOrEqual(0.2801);
    expect(showState.roomBounce.blackout).toBeCloseTo(showState.roomBounce.baseAmbient, 3);

    // Pin the cue (as the spotlight check above does) and wait on rendered frames, not
    // wall-clock time: on a slow software renderer 2 s is a handful of frames, and the
    // running show could move to a haze-free cue before the shafts were ever updated.
    await page.evaluate(async () => {
        const club = window.vrClub;
        club.showDirector._applyCue({ look: 'deepBlue', bars: 1024 });
        for (let frame = 0; frame < 12; frame++) {
            await new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
        }
    });
    const mirrorCueState = await page.evaluate(() => {
        const club = window.vrClub;
        const active = new Set(club.scene.getActiveMeshes().data);
        const categoryIsActive = pattern => club.scene.meshes
            .filter(mesh => pattern.test(mesh.name) && mesh.getTotalVertices() > 0 &&
                mesh.isEnabled() && mesh.isVisible)
            .every(mesh => active.has(mesh));
        return {
            mirrorActive: club.mirrorBallActive,
            realMirrorLightExists: Boolean(club.scene.getLightByName('mirrorBallSpotlight0')),
            hemisphereCoverage: [32, 52, 64].map(count => {
                const directions = club.mirrorReflectionBatch.directions;
                let up = 0, down = 0;
                for (let i = 0; i < count; i++) {
                    if (Math.cos(directions[i * 2 + 1]) > 0) up++;
                    else down++;
                }
                return [up, down];
            }),
            outgoingRays: club.mirrorReflectionBatch.rays.thinInstanceCount,
            expectedOutgoingRays: club.tierSettings.mirrorRays,
            reflectionSpots: club.mirrorReflectionBatch.spots.thinInstanceCount,
            expectedReflectionSpots: club.tierSettings.mirrorSpots,
            reflectionDrawMeshes: ['mirrorReflectionSpots', 'mirrorOutgoingRays']
                .filter(name => club.scene.getMeshByName(name)?.isEnabled()).length,
            avatarsActive: categoryIsActive(/dancer/i),
            trussActive: categoryIsActive(/truss/i),
            djActive: categoryIsActive(/djPlatform|djTable|leftCDJ|rightCDJ|mixer/i)
        };
    });
    expect(mirrorCueState).toEqual({
        mirrorActive: true,
        realMirrorLightExists: false,
        hemisphereCoverage: [[16, 16], [26, 26], [32, 32]],
        outgoingRays: mirrorCueState.expectedOutgoingRays,
        expectedOutgoingRays: mirrorCueState.expectedOutgoingRays,
        reflectionSpots: mirrorCueState.expectedReflectionSpots,
        expectedReflectionSpots: mirrorCueState.expectedReflectionSpots,
        reflectionDrawMeshes: 2,
        avatarsActive: true,
        trussActive: true,
        djActive: true
    });
    await expectHealthyRuntime(page);
});

test('Quest 3 emulation enters WebXR, registers controllers, and restores desktop', async ({ page }) => {
    await enterClub(page);

    const vrButton = page.locator('#vrButton');
    const capability = await page.evaluate(async () => ({
        hasEmulator: Boolean(window.__iwerDevice),
        hasXRSystem: Boolean(navigator.xr),
        supported: await navigator.xr?.isSessionSupported('immersive-vr'),
        hasHelper: Boolean(window.vrClub.vrHelper?.baseExperience),
        xrDiagnostics: window.vrClub.getDiagnostics().recentLogs.filter(entry => entry.category === 'xr')
    }));
    expect(capability, browserFailures.get(page).join('\n')).toMatchObject({
        hasEmulator: true,
        hasXRSystem: true,
        supported: true,
        hasHelper: true,
        xrDiagnostics: []
    });
    // Entry waits for the background GLB load and shader compile (30 s ceiling).
    await expect(vrButton).toBeEnabled({ timeout: 60_000 });
    await expect(vrButton).toContainText('Enter VR');
    await vrButton.click();

    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
    const xrState = await page.evaluate(() => ({
        inVR: window.vrClub.isInVRMode,
        diagnosticsInVR: window.vrClub.getDiagnostics().isInVR,
        controllerCount: window.vrClub._xrControllers.length,
        movementFeatureActive: Boolean(window.vrClub.movementFeature),
        comfortEnabled: window.vrClub.vrComfortMode,
        teleportEnabled: window.vrClub.vrHelper.teleportation?.teleportationEnabled === true,
        locomotionFailures: window.vrClub.getDiagnostics().recentLogs.filter(entry => entry.category === 'xr'),
        renderScale: window.vrClub.engine.getHardwareScalingLevel(),
        xrFramebufferScale: window.vrClub.vrSettings.vr.framebufferScaleFactor,
        fxaaEnabled: window.vrClub.renderPipeline.fxaaEnabled,
        // applyVRSettings() must push the VR config into the live pipeline. Compared
        // with the config (not literals) so tuning vrSettings does not break the test.
        vrBrightnessApplied: {
            bloomWeight: window.vrClub.renderPipeline.bloomWeight === window.vrClub.vrSettings.vr.bloomWeight,
            bloomThreshold: window.vrClub.renderPipeline.bloomThreshold === window.vrClub.vrSettings.vr.bloomThreshold,
            glowIntensity: window.vrClub.glowLayer.intensity === window.vrClub.vrSettings.vr.glowIntensity,
            vrDiffersFromDesktop: window.vrClub.vrSettings.vr.exposure !== window.vrClub.vrSettings.desktop.exposure
        },
        vrSmoke: {
            hazeRate: window.vrClub.haze.emitRate,
            hazeAlpha1: window.vrClub.haze.color1.a,
            hazeAlpha2: window.vrClub.haze.color2.a,
            floorFogRemoved: !window.vrClub.scene.particleSystems.some(system => system.name === 'floorFog')
        },
        spotlightBeamDepthBias: window.vrClub.spotlights[0].beamMat.zOffset,
        mirrorBeamUsesAlpha: window.vrClub._mirrorBeamGradientTexture.hasAlpha,
        mirrorBeamState: window.vrClub.mirrorBallBeams.map(beam => ({
            enabled: beam.mesh.isEnabled(),
            alpha: beam.material.alpha,
            emissiveIntensity: beam.material.emissiveIntensity
        })),
        mirrorRealLightCount: window.vrClub.mirrorBallSpotlights.filter(Boolean).length,
        djFacing: window.vrClub.npcAvatars.find(npc => npc.name === 'djPerformer')?.root.rotation.y,
        djFacingUsesEuler: window.vrClub.npcAvatars.find(npc => npc.name === 'djPerformer')
            ?.root.rotationQuaternion === null
    }));
    expect(xrState).toMatchObject({
        inVR: true,
        diagnosticsInVR: true,
        controllerCount: 2,
        movementFeatureActive: false,
        comfortEnabled: true,
        teleportEnabled: true,
        locomotionFailures: [],
        renderScale: 1,
        xrFramebufferScale: 1.2,
        fxaaEnabled: true,
        vrBrightnessApplied: {
            bloomWeight: true,
            bloomThreshold: true,
            glowIntensity: true,
            vrDiffersFromDesktop: true
        },
        vrSmoke: {
            hazeRate: 65,
            hazeAlpha1: 0.035,
            hazeAlpha2: 0.025,
            floorFogRemoved: true
        },
        spotlightBeamDepthBias: 0,
        mirrorBeamUsesAlpha: true,
        mirrorBeamState: Array.from({ length: 4 }, () => ({
            enabled: true,
            alpha: 0.12,
            emissiveIntensity: 2.4
        })),
        mirrorRealLightCount: 0
    });
    expect(xrState.djFacing).toBeCloseTo(0, 5);
    expect(xrState.djFacingUsesEuler).toBe(true);

    const opticsState = await page.evaluate(() => {
        const club = window.vrClub;
        const frame = {
            time: 4,
            dt: 1 / 72,
            dtScale: 60 / 72,
            audio: { hasAudio: false, average: 0.5, bass: 0.5, mid: 0.5, high: 0.5 }
        };

        // This block pins the VR *base* optics at full master. The kick pulse is a separate, additive
        // layer, so zero it (the render loop may have left it mid-hit), and every look re-derives the master
        // from its own intensity, which now scales the fixtures, so it is pinned to 1 after each one.
        club.kickPulse = 0;
        club.showDirector._applyLook(club.showDirector.looks.firstLight, 1);
        club.masterIntensity = 1;
        club.spotlightPattern = 1;
        club.spotlightMode = 3;
        club.updateSpotlights(frame);
        const spot = club.spotlights[0];

        club.showDirector._applyLook(club.showDirector.looks.beamsOnly, 1);
        club.masterIntensity = 1;
        club.updateLasers(frame);
        const laser = club.lasers[0].beams[0];

        club.photosensitiveSafeMode = false;
        club.showDirector._applyLook(club.showDirector.looks.whiteChase, 1);
        club.masterIntensity = 1;
        club.strobeSync = 'free';
        const preStrobe = {
            ambientIntensity: club.scene.getLightByName('ambient').intensity,
            retinalAlpha: club.strobeRetinalFlash.color.a,
            bloomWeight: club.renderPipeline.bloomWeight,
            exposure: club.renderPipeline.imageProcessing.exposure
        };
        club._nextStrobeBurstTime = 0;
        club.strobes.forEach(strobe => { strobe.flashDuration = 0; });
        club.updateStrobes(frame);
        const strobe = {
            duration: Math.max(...club.strobes.map(item => item.flashDuration)),
            glareAlpha: Math.max(...club.strobes.map(item => item.glareMaterial.alpha)),
            lightIntensity: club.strobeFlashLight.intensity,
            bloomWeight: club.renderPipeline.bloomWeight,
            exposure: club.renderPipeline.imageProcessing.exposure,
            ambientIntensity: club.scene.getLightByName('ambient').intensity,
            retinalAlpha: club.strobeRetinalFlash.color.a
        };

        club.photosensitiveSafeMode = true;
        club.updateStrobes({ ...frame, time: frame.time + frame.dt });
        const safeModeRestoration = {
            ambientIntensity: club.scene.getLightByName('ambient').intensity,
            retinalAlpha: club.strobeRetinalFlash.color.a,
            bloomWeight: club.renderPipeline.bloomWeight,
            exposure: club.renderPipeline.imageProcessing.exposure
        };

        return {
            spot: {
                colorPeak: Math.max(...club.currentSpotColor.asArray()),
                lensPeak: Math.max(...spot.lens.material.emissiveColor.asArray()),
                diffusePeak: Math.max(...spot.light.diffuse.asArray()),
                beamPeak: Math.max(...spot.beamMat.emissiveColor.asArray()),
                poolPeak: Math.max(...spot.poolMat.emissiveColor.asArray()),
                intensity: spot.light.intensity,
                enabled: spot.light.isEnabled(),
                lensGlowIncluded: club.glowLayer.hasMesh(spot.lens)
            },
            laser: {
                emissivePeak: Math.max(...laser.material.emissiveColor.asArray()),
                glowIncluded: club.glowLayer.hasMesh(laser.mesh)
            },
            strobe,
            strobeImpulse: club.vrSettings.vr.strobeImpulse,
            preStrobe,
            safeModeRestoration
        };
    });
    expect(opticsState.spot.lensPeak / opticsState.spot.colorPeak).toBeCloseTo(1.6, 2);
    expect(opticsState.spot.diffusePeak / opticsState.spot.colorPeak).toBeCloseTo(0.45, 2);
    expect(opticsState.spot.beamPeak / opticsState.spot.colorPeak).toBeCloseTo(1, 2);
    expect(opticsState.spot.poolPeak / opticsState.spot.colorPeak).toBeGreaterThan(2.5);
    expect(opticsState.spot.intensity).toBeGreaterThan(40);
    expect(opticsState.spot.enabled).toBe(true);
    expect(opticsState.spot.lensGlowIncluded).toBe(true);
    // The beam material carries the pure diode colour; brightness lives in the batch's vertex alpha.
    expect(opticsState.laser.emissivePeak).toBeCloseTo(1, 2);
    expect(opticsState.laser.glowIncluded).toBe(true);
    expect(opticsState.strobe.duration).toBeLessThanOrEqual(0.09);
    expect(opticsState.strobe.glareAlpha).toBe(0.95);
    expect(opticsState.strobe.lightIntensity).toBeGreaterThan(900);
    expect(opticsState.strobe.bloomWeight).toBe(1);
    expect(opticsState.strobe.exposure).toBe(opticsState.strobeImpulse.exposure);
    expect(opticsState.strobe.ambientIntensity).toBe(opticsState.strobeImpulse.ambient);
    expect(opticsState.strobe.retinalAlpha).toBe(opticsState.strobeImpulse.retinal);
    expect(opticsState.safeModeRestoration.ambientIntensity)
        .toBeCloseTo(opticsState.preStrobe.ambientIntensity, 6);
    expect(opticsState.safeModeRestoration.retinalAlpha).toBe(0);
    expect(opticsState.safeModeRestoration.bloomWeight)
        .toBeCloseTo(opticsState.preStrobe.bloomWeight, 6);
    expect(opticsState.safeModeRestoration.exposure)
        .toBeCloseTo(opticsState.preStrobe.exposure, 6);

    await page.waitForTimeout(2000);
    const sustainedVisibility = await page.evaluate(() => {
        const club = window.vrClub;
        for (let frame = 0; frame < 240; frame++) {
            club.frameCounter = frame;
            club.updateDancingNPCs(600 + frame / 72, {
                hasAudio: false,
                bass: 0,
                average: 0
            });
        }

        const enabledNpcs = club.npcAvatars.filter(npc => npc.root.isEnabled());
        const npcMeshes = enabledNpcs.flatMap(npc => npc.meshes || []);
        const trussRoots = [
            ...(club.horizontalTrusses || []),
            ...Object.values(club.sideTrusses || {})
        ];
        const trussMeshes = trussRoots
            .flatMap(root => root.getChildMeshes())
            .filter(mesh => mesh.name.toLowerCase().includes('truss'));
        const activeMeshes = new Set(club.scene.getActiveMeshes().data);
        const trussMaterials = [...new Set(trussMeshes.map(mesh => mesh.material).filter(Boolean))];
        const emissiveFloor = material => material.emissiveColor
            ? Math.min(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b)
            : 0;

        return {
            enabledNpcCount: enabledNpcs.length,
            npcMeshCount: npcMeshes.length,
            npcMeshesAlwaysActive: npcMeshes.every(mesh => mesh.alwaysSelectAsActiveMesh),
            npcMeshesActive: npcMeshes.every(mesh => activeMeshes.has(mesh)),
            // Avatars keep their authored (zero) emission; in aerial-only cues the
            // hemispheric ambient floor is what keeps silhouettes above display black.
            vrAmbientFloor: club.scene.getLightByName('ambient').intensity -
                club.vrSettings.vr.ambientIntensity,
            nearbyAnimationsRunning: enabledNpcs.every(npc => !npc._animPaused),
            trussMeshCount: trussMeshes.length,
            trussMeshesAlwaysActive: trussMeshes.every(mesh => mesh.alwaysSelectAsActiveMesh),
            trussMeshesEnabled: trussMeshes.every(mesh => mesh.isEnabled()),
            trussMeshesActive: trussMeshes.every(mesh => activeMeshes.has(mesh)),
            trussEmissiveFloor: Math.min(...trussMaterials.map(emissiveFloor))
        };
    });
    expect(sustainedVisibility.enabledNpcCount).toBeGreaterThanOrEqual(7);
    expect(sustainedVisibility.npcMeshCount).toBeGreaterThan(0);
    expect(sustainedVisibility.npcMeshesAlwaysActive).toBe(true);
    expect(sustainedVisibility.npcMeshesActive).toBe(true);
    expect(sustainedVisibility.vrAmbientFloor).toBeGreaterThanOrEqual(-0.005);
    expect(sustainedVisibility.nearbyAnimationsRunning).toBe(true);
    expect(sustainedVisibility.trussMeshCount).toBeGreaterThanOrEqual(20);
    expect(sustainedVisibility.trussMeshesAlwaysActive).toBe(true);
    expect(sustainedVisibility.trussMeshesEnabled).toBe(true);
    expect(sustainedVisibility.trussMeshesActive).toBe(true);
    expect(sustainedVisibility.trussEmissiveFloor).toBeGreaterThanOrEqual(0.018);
    await expect(vrButton).toContainText('Exit VR');

    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('y-button', 1));
    await page.waitForFunction(() => window.vrClub?._vrQuickMenuRoot?.isEnabled() === true);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('y-button', 0));

    const menuState = await page.evaluate(async () => {
        const club = window.vrClub;
        club._showVRQuickMenuPage('effects');
        const smokeButton = club._vrQuickMenuButtons.find(button => button.control === 'smokeActive');
        const smokeBefore = club.smokeActive;
        club.scene.onPointerDown({}, { hit: true, pickedMesh: smokeButton.mesh });
        return {
            enabled: club._vrQuickMenuRoot.isEnabled(),
            buttonCount: club._vrQuickMenuButtons.length,
            textureOnlyEmission: club._vrQuickMenuButtons.every(button =>
                button.material.emissiveTexture === button.texture &&
                button.material.emissiveColor.equalsFloats(0, 0, 0)),
            worldLocked: club._vrQuickMenuRoot.parent === null,
            stillAfterHeadTurn: await (async () => {
                const root = club._vrQuickMenuRoot;
                const before = root.getAbsolutePosition().clone();
                const device = window.__iwerDevice;
                const q = device.quaternion;
                const saved = [q.x, q.y, q.z, q.w];
                device.quaternion.set(0, Math.sin(0.35), 0, Math.cos(0.35)); // turn the head ~40 degrees
                for (let i = 0; i < 6; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
                const moved = root.getAbsolutePosition().subtract(before).length();
                device.quaternion.set(...saved);
                for (let i = 0; i < 3; i++) await new Promise(r => club.scene.onAfterRenderObservable.addOnce(r));
                return moved < 1e-4;
            })(),
            smokeChanged: club.smokeActive !== smokeBefore,
            manualMode: club.vjManualMode
        };
    });
    expect(menuState).toEqual({
        enabled: true,
        buttonCount: 12,
        textureOnlyEmission: true,
        worldLocked: true,
        stillAfterHeadTurn: true,
        smokeChanged: true,
        manualMode: true
    });

    // Comfort off swaps teleportation for smooth locomotion in-session (Babylon
    // forbids both at once), and comfort on swaps back - without re-entering XR.
    const locomotionSwap = await page.evaluate(() => {
        const club = window.vrClub;
        const snapshot = () => ({
            movement: Boolean(club.movementFeature?.movementEnabled && club.movementFeature?.rotationEnabled),
            teleport: club.vrHelper.teleportation?.teleportationEnabled === true,
            gravity: club.vrHelper.baseExperience.camera.applyGravity
        });
        club.setVRComfortMode(false);
        const smooth = snapshot();
        club.setVRComfortMode(true);
        const comfort = snapshot();
        return {
            smooth, comfort,
            failures: club.getDiagnostics().recentLogs.filter(entry => entry.category === 'xr')
        };
    });
    expect(locomotionSwap).toEqual({
        smooth: { movement: true, teleport: false, gravity: false },
        comfort: { movement: false, teleport: true, gravity: false },
        failures: []
    });

    await page.evaluate(() => document.getElementById('vrButton').click());
    await page.waitForFunction(() => window.vrClub?.isInVRMode === false);
    await expect(vrButton).toContainText('Enter VR');
    expect(await page.evaluate(() => window.vrClub.movementFeature)).toBeNull();
    expect(await page.evaluate(() => ({
        hazeRate: window.vrClub.haze.emitRate,
        hazeAlpha1: window.vrClub.haze.color1.a,
        hazeAlpha2: window.vrClub.haze.color2.a,
        floorFogRemoved: !window.vrClub.scene.particleSystems.some(system => system.name === 'floorFog'),
        mirrorBeamAlpha: window.vrClub.mirrorBallBeams[0].material.alpha,
        mirrorBeamEmission: window.vrClub.mirrorBallBeams[0].material.emissiveIntensity
    }))).toEqual({
        hazeRate: 80,
        hazeAlpha1: 0.04,
        hazeAlpha2: 0.03,
        floorFogRemoved: true,
        mirrorBeamAlpha: 0.07,
        mirrorBeamEmission: 1.35
    });
    await expectHealthyRuntime(page);
});