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
        spotlightBeamDepthBias: window.vrClub.spotlights[0].beamMat.zOffset,
        mirrorBeamUsesAlpha: window.vrClub._mirrorBeamGradientTexture.hasAlpha,
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
        spotlightBeamDepthBias: 0,
        mirrorBeamUsesAlpha: true
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
    await expectHealthyRuntime(page);
});