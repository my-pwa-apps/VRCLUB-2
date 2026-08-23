import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const iwerEntry = require.resolve('iwer');
const iwerBundle = readFileSync(join(dirname(iwerEntry), '..', 'build', 'iwer.min.js'), 'utf8');
const installQuestRuntime = `${iwerBundle}\n;(() => {
    const device = new globalThis.IWER.XRDevice(globalThis.IWER.metaQuest3);
    device.installRuntime({ forceInstall: true });
    globalThis.__iwerDevice = device;
})();`;

const silentWav = Buffer.from(
    'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    'base64'
);

const browserFailures = new WeakMap();

test.beforeEach(async ({ page }) => {
    const failures = [];
    browserFailures.set(page, failures);
    page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
    });

    await page.addInitScript({ content: installQuestRuntime });
    await page.addInitScript(() => {
        localStorage.setItem('vrclub.graphicsTier', 'balanced');
        localStorage.setItem('vrclub.safeMode', '1');
    });
    await page.route('https://stream.sunshine-live.de/**', route => route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: silentWav
    }));
});

async function enterClub(page) {
    await page.goto('/');
    await expect(page.locator('#enterClubBtn')).toBeVisible();
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await expect(page.locator('#splashScreen')).toBeHidden();
}

async function expectHealthyRuntime(page) {
    const diagnostics = await page.evaluate(() => window.vrClub.getDiagnostics());
    expect(diagnostics.tier).toBe('balanced');
    expect(diagnostics.meshes).toBeGreaterThan(100);
    expect(diagnostics.materials).toBeGreaterThan(25);
    expect(diagnostics.recentLogs.filter(entry => entry.category === 'error')).toEqual([]);
    expect(browserFailures.get(page)).toEqual([]);
}

test('production build initializes a rendered club without browser errors', async ({ page }) => {
    await enterClub(page);

    const renderState = await page.evaluate(() => ({
        ready: window.vrClub.ready,
        canvasWidth: window.vrClub.canvas.width,
        canvasHeight: window.vrClub.canvas.height,
        activeCamera: window.vrClub.scene.activeCamera?.name,
        engineDisposed: window.vrClub.engine.isDisposed
    }));
    expect(renderState).toMatchObject({
        ready: true,
        activeCamera: 'camera',
        engineDisposed: false
    });
    expect(renderState.canvasWidth).toBeGreaterThan(0);
    expect(renderState.canvasHeight).toBeGreaterThan(0);

    const showState = await page.evaluate(() => {
        const club = window.vrClub;
        const director = club.showDirector;

        director._applyLook(director.looks.liquidPlane, 1);
        const laserSheet = {
            exists: Boolean(club.laserSheet),
            hazeLayerExists: Boolean(club.laserSheetHaze),
            smokeScatterExists: Boolean(club.laserSheetSmokeScatter),
            smokeScatterCapacity: club.laserSheetSmokeScatter?.getCapacity(),
            hazeUsesIndependentNoise: club.laserSheetHaze?.material.opacityTexture !==
                club.laserSheet.material.opacityTexture,
            active: club.laserSheetActive,
            alpha: club.laserSheet.material.alpha,
            depthWriteDisabled: club.laserSheet.material.disableDepthWrite,
            minimumPitch: club._laserSheetBasePitch - club._laserSheetPitchRange,
            exclusive: !club.lightsActive && !club.lasersActive && !club.mirrorBallActive &&
                !club.ledWallActive && !club.strobesActive && !club.blindersActive
        };

        const sampleSheetVariant = lookName => {
            director._applyLook(director.looks[lookName], 1);
            club.updateLaserSheet({ time: 0, dtScale: 1, audio: { average: 0 } });
            const start = { pitch: club.laserSheetSource.rotation.x, yaw: club.laserSheetSource.rotation.y };
            club.updateLaserSheet({ time: 10, dtScale: 1, audio: { average: 0 } });
            return {
                origin: club.laserSheetOrigin,
                motion: club.laserSheetMotion,
                position: club.laserSheetSource.position.asArray(),
                smokeScatterEmitRate: club.laserSheetSmokeScatter.emitRate,
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
        const safeMode = { strobes: club.strobesActive, blinders: club.blindersActive };

        club.photosensitiveSafeMode = false;
        director._applyLook(director.looks.chromaticRoom, 1);
        director._applyContinuous(club.vjDirector, {});
        const colorLock = {
            active: club.colorLockActive,
            master: club.currentSpotColor.asArray(),
            mirror: club.mirrorBallSpotlightColor.asArray(),
            led: club.ledShowColor.asArray()
        };

        return { laserSheet, sheetVariants, chase, chaseExclusive, safeMode, colorLock };
    });
    expect(showState).toMatchObject({
        laserSheet: {
            exists: true,
            hazeLayerExists: true,
            smokeScatterExists: true,
            hazeUsesIndependentNoise: true,
            active: true,
            alpha: 0.10,
            depthWriteDisabled: true,
            exclusive: true
        },
        chase: [[0], [1], [3], [2]],
        chaseExclusive: true,
        safeMode: { strobes: false, blinders: false },
        colorLock: {
            active: true,
            master: showState.colorLock.master,
            mirror: showState.colorLock.master,
            led: showState.colorLock.master
        }
    });
    expect(showState.laserSheet.smokeScatterCapacity).toBeGreaterThanOrEqual(220);
    expect(showState.laserSheet.smokeScatterCapacity).toBeLessThanOrEqual(420);
    expect(showState.laserSheet.minimumPitch).toBeGreaterThan(0);
    expect(showState.sheetVariants.left).toMatchObject({
        origin: 'ceilingLeft',
        motion: 'lateral',
        position: [-6, 7.55, -16]
    });
    expect(showState.sheetVariants.left.afterTenSeconds.pitch)
        .toBeCloseTo(showState.sheetVariants.left.start.pitch, 6);
    expect(showState.sheetVariants.left.smokeScatterEmitRate).toBeGreaterThan(0);
    expect(Math.abs(showState.sheetVariants.left.afterTenSeconds.yaw - showState.sheetVariants.left.start.yaw))
        .toBeGreaterThan(0.015);
    expect(showState.sheetVariants.right).toMatchObject({
        origin: 'ceilingRight',
        motion: 'vertical',
        position: [6, 7.55, -16]
    });
    expect(showState.sheetVariants.right.afterTenSeconds.yaw)
        .toBeCloseTo(showState.sheetVariants.right.start.yaw, 6);
    expect(showState.sheetVariants.right.smokeScatterEmitRate).toBeGreaterThan(0);
    expect(Math.abs(showState.sheetVariants.right.afterTenSeconds.pitch - showState.sheetVariants.right.start.pitch))
        .toBeGreaterThan(0.015);
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
    await expect(vrButton).toBeEnabled();
    await expect(vrButton).toContainText('Enter VR');
    await vrButton.click();

    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
    const xrState = await page.evaluate(() => ({
        inVR: window.vrClub.isInVRMode,
        diagnosticsInVR: window.vrClub.getDiagnostics().isInVR,
        controllerCount: window.vrClub._xrControllers.length,
        movementEnabled: Boolean(window.vrClub.movementFeature),
        renderScale: window.vrClub.engine.getHardwareScalingLevel(),
        xrFramebufferScale: window.vrClub.vrSettings.vr.framebufferScaleFactor,
        fxaaEnabled: window.vrClub.renderPipeline.fxaaEnabled,
        vrBrightness: {
            exposure: window.vrClub.vrSettings.vr.exposure,
            bloomWeight: window.vrClub.renderPipeline.bloomWeight,
            bloomThreshold: window.vrClub.renderPipeline.bloomThreshold,
            glowIntensity: window.vrClub.glowLayer.intensity
        },
        vrSmoke: {
            hazeRate: window.vrClub.haze.emitRate,
            hazeAlpha1: window.vrClub.haze.color1.a,
            hazeAlpha2: window.vrClub.haze.color2.a,
            floorFogRate: window.vrClub.floorFog.emitRate
        },
        spotlightBeamDepthBias: window.vrClub.spotlights[0].beamMat.zOffset,
        mirrorBeamUsesAlpha: window.vrClub._mirrorBeamGradientTexture.hasAlpha,
        mirrorBeamState: window.vrClub.mirrorBallBeams.map(beam => ({
            enabled: beam.mesh.isEnabled(),
            alpha: beam.material.alpha,
            emissiveIntensity: beam.material.emissiveIntensity
        })),
        mirrorRealLightCount: window.vrClub.mirrorBallSpotlights.filter(Boolean).length,
        djFacing: window.vrClub.npcAvatars.find(npc => npc.name === 'djPerformer')?.root.rotation.y
    }));
    expect(xrState).toMatchObject({
        inVR: true,
        diagnosticsInVR: true,
        controllerCount: 2,
        movementEnabled: true,
        renderScale: 1,
        xrFramebufferScale: 1.2,
        fxaaEnabled: true,
        vrBrightness: {
            exposure: 1.22,
            bloomWeight: 0.45,
            bloomThreshold: 0.55,
            glowIntensity: 1.25
        },
        vrSmoke: {
            hazeRate: 65,
            hazeAlpha1: 0.16,
            hazeAlpha2: 0.13,
            floorFogRate: 30
        },
        spotlightBeamDepthBias: 0,
        mirrorBeamUsesAlpha: true,
        mirrorBeamState: Array.from({ length: 4 }, () => ({
            enabled: true,
            alpha: 0.12,
            emissiveIntensity: 2.4
        })),
        mirrorRealLightCount: 1
    });
    expect(xrState.djFacing).toBeCloseTo(0, 5);

    const opticsState = await page.evaluate(() => {
        const club = window.vrClub;
        const frame = {
            time: 4,
            dt: 1 / 72,
            dtScale: 60 / 72,
            audio: { hasAudio: false, average: 0.5, bass: 0.5, mid: 0.5, high: 0.5 }
        };

        club.showDirector._applyLook(club.showDirector.looks.firstLight, 1);
        club.spotlightPattern = 1;
        club.spotlightMode = 3;
        club.updateSpotlights(frame);
        const spot = club.spotlights[0];

        club.showDirector._applyLook(club.showDirector.looks.beamsOnly, 1);
        club.updateLasers(frame);
        const laser = club.lasers[0].beams[0];

        club.photosensitiveSafeMode = false;
        club.showDirector._applyLook(club.showDirector.looks.whiteChase, 1);
        club._nextStrobeBurstTime = 0;
        club.strobes.forEach(strobe => { strobe.flashDuration = 0; });
        club.updateStrobes(frame);
        const strobe = {
            duration: Math.max(...club.strobes.map(item => item.flashDuration)),
            glareAlpha: Math.max(...club.strobes.map(item => item.glareMaterial.alpha)),
            lightIntensity: club.strobeFlashLight.intensity,
            bloomWeight: club.renderPipeline.bloomWeight,
            exposure: club.renderPipeline.imageProcessing.exposure
        };

        return {
            spot: {
                colorPeak: Math.max(...club.currentSpotColor.asArray()),
                lensPeak: Math.max(...spot.lens.material.emissiveColor.asArray()),
                sourcePeak: Math.max(...spot.lightSource.material.emissiveColor.asArray()),
                flareWhiteFloor: Math.min(...spot.flareMat.emissiveColor.asArray()),
                intensity: spot.light.intensity,
                enabled: spot.light.isEnabled(),
                flareGlowIncluded: club.glowLayer.hasMesh(spot.flare)
            },
            laser: {
                emissivePeak: Math.max(...laser.material.emissiveColor.asArray()),
                glowIncluded: club.glowLayer.hasMesh(laser.mesh)
            },
            strobe
        };
    });
    expect(opticsState.spot.lensPeak / opticsState.spot.colorPeak).toBeCloseTo(6, 2);
    expect(opticsState.spot.sourcePeak / opticsState.spot.colorPeak).toBeCloseTo(12, 2);
    expect(opticsState.spot.flareWhiteFloor).toBeGreaterThanOrEqual(6);
    expect(opticsState.spot.intensity).toBeGreaterThan(35);
    expect(opticsState.spot.enabled).toBe(true);
    expect(opticsState.spot.flareGlowIncluded).toBe(true);
    expect(opticsState.laser.emissivePeak).toBeCloseTo(5, 2);
    expect(opticsState.laser.glowIncluded).toBe(true);
    expect(opticsState.strobe.duration).toBeLessThanOrEqual(0.09);
    expect(opticsState.strobe.glareAlpha).toBe(0.95);
    expect(opticsState.strobe.lightIntensity).toBeGreaterThan(900);
    expect(opticsState.strobe.bloomWeight).toBe(1);
    expect(opticsState.strobe.exposure).toBe(2.6);

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

        return {
            enabledNpcCount: enabledNpcs.length,
            npcMeshCount: npcMeshes.length,
            npcMeshesAlwaysActive: npcMeshes.every(mesh => mesh.alwaysSelectAsActiveMesh),
            nearbyAnimationsRunning: enabledNpcs.every(npc => !npc._animPaused),
            trussMeshCount: trussMeshes.length,
            trussMeshesAlwaysActive: trussMeshes.every(mesh => mesh.alwaysSelectAsActiveMesh),
            trussMeshesEnabled: trussMeshes.every(mesh => mesh.isEnabled())
        };
    });
    expect(sustainedVisibility.enabledNpcCount).toBeGreaterThanOrEqual(7);
    expect(sustainedVisibility.npcMeshCount).toBeGreaterThan(0);
    expect(sustainedVisibility.npcMeshesAlwaysActive).toBe(true);
    expect(sustainedVisibility.nearbyAnimationsRunning).toBe(true);
    expect(sustainedVisibility.trussMeshCount).toBeGreaterThanOrEqual(20);
    expect(sustainedVisibility.trussMeshesAlwaysActive).toBe(true);
    expect(sustainedVisibility.trussMeshesEnabled).toBe(true);
    await expect(vrButton).toContainText('Exit VR');

    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('y-button', 1));
    await page.waitForFunction(() => window.vrClub?._vrQuickMenuRoot?.isEnabled() === true);
    await page.evaluate(() => window.__iwerDevice.controllers.left.updateButtonValue('y-button', 0));

    const menuState = await page.evaluate(() => {
        const club = window.vrClub;
        const smokeButton = club._vrQuickMenuButtons.find(button => button.control === 'smokeActive');
        const smokeBefore = club.smokeActive;
        club.scene.onPointerDown({}, { hit: true, pickedMesh: smokeButton.mesh });
        return {
            enabled: club._vrQuickMenuRoot.isEnabled(),
            buttonCount: club._vrQuickMenuButtons.length,
            parentIsXRCamera: club._vrQuickMenuRoot.parent === club.vrHelper.baseExperience.camera,
            smokeChanged: club.smokeActive !== smokeBefore,
            manualMode: club.vjManualMode
        };
    });
    expect(menuState).toEqual({
        enabled: true,
        buttonCount: 9,
        parentIsXRCamera: true,
        smokeChanged: true,
        manualMode: true
    });

    await page.evaluate(() => document.getElementById('vrButton').click());
    await page.waitForFunction(() => window.vrClub?.isInVRMode === false);
    await expect(vrButton).toContainText('Enter VR');
    expect(await page.evaluate(() => window.vrClub.movementFeature)).toBeNull();
    expect(await page.evaluate(() => ({
        hazeRate: window.vrClub.haze.emitRate,
        hazeAlpha1: window.vrClub.haze.color1.a,
        hazeAlpha2: window.vrClub.haze.color2.a,
        floorFogRate: window.vrClub.floorFog.emitRate,
        mirrorBeamAlpha: window.vrClub.mirrorBallBeams[0].material.alpha,
        mirrorBeamEmission: window.vrClub.mirrorBallBeams[0].material.emissiveIntensity
    }))).toEqual({
        hazeRate: 80,
        hazeAlpha1: 0.12,
        hazeAlpha2: 0.10,
        floorFogRate: 40,
        mirrorBeamAlpha: 0.07,
        mirrorBeamEmission: 1.35
    });
    await expectHealthyRuntime(page);
});