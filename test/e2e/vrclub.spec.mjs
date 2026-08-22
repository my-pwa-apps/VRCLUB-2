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
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 120_000 });
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
            active: club.laserSheetActive,
            alpha: club.laserSheet.material.alpha,
            depthWriteDisabled: club.laserSheet.material.disableDepthWrite,
            exclusive: !club.lightsActive && !club.lasersActive && !club.mirrorBallActive &&
                !club.ledWallActive && !club.strobesActive && !club.blindersActive
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

        return { laserSheet, chase, chaseExclusive, safeMode, colorLock };
    });
    expect(showState).toEqual({
        laserSheet: {
            exists: true,
            active: true,
            alpha: 0.18,
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
            exposure: 1.15,
            bloomWeight: 0.28,
            bloomThreshold: 0.72,
            glowIntensity: 0.95
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
            alpha: 0.07,
            emissiveIntensity: 1.35
        })),
        mirrorRealLightCount: 1
    });
    expect(xrState.djFacing).toBeCloseTo(Math.PI, 5);
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
        floorFogRate: window.vrClub.floorFog.emitRate
    }))).toEqual({
        hazeRate: 80,
        hazeAlpha1: 0.12,
        hazeAlpha2: 0.10,
        floorFogRate: 40
    });
    await expectHealthyRuntime(page);
});