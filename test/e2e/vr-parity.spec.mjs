import { test, expect } from '@playwright/test';
import { enterClub, enterVR, exitVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';
import { captureImage, pearson, renderFrames, snapshotRenderState } from './xr-measure.mjs';

useQuestHarness();

/** The headset spawns here, facing the stage; the desktop camera is parked on the same pose. */
const SPAWN = { position: [0, 1.6, -12], target: [0, 1.6, -13], vfov: Math.PI / 2 };

/**
 * Differences between desktop and VR that are deliberate. Anything else that differs
 * between the two modes at the same tier is a quality regression.
 */
const INTENTIONAL_DIFFERENCES = new Map([
    ['pipeline.kind', 'VR builds its own pipeline on the XR camera'],
    ['pipeline.bloomWeight', 'vrSettings.vr'],
    ['pipeline.bloomThreshold', 'vrSettings.vr'],
    ['pipeline.bloomKernel', 'smaller blur kernel in VR'],
    ['pipeline.bloomScale', 'vrSettings.vr'],
    ['pipeline.sharpenEdge', 'vrSettings.vr.edgeSharpness'],
    ['pipeline.exposure', 'vrSettings.vr, eye-adapted'],
    ['pipeline.contrast', 'vrSettings.vr'],
    ['pipeline.vignette', 'a vignette causes discomfort in a headset'],
    ['screenSpace.activeCamera', 'the XR camera renders in VR'],
    ['screenSpace.ssaoCameras', 'SSAO is detached for VR'],
    ['screenSpace.ssaoAttached', 'SSAO is detached for VR'],
    ['glow.intensity', 'vrSettings.vr'],
    ['environment.environmentIntensity', 'vrSettings.vr'],
    ['environment.fogDensity', 'vrSettings.vr'],
    ['atmosphere.hazeRate', 'headset-tuned haze'],
    ['atmosphere.hazeAlpha', 'headset-tuned haze'],
    // The XR session adds its controller and pointer geometry; the club itself is unchanged.
    ['content.enabledMeshes', 'XR controller meshes'],
    ['content.enabledVertices', 'XR controller meshes'],
    ['content.materialCount', 'XR controller materials'],
    ['content.textureCount', 'XR controller textures']
]);

/**
 * Drift that remains on the desktop after a VR visit. Each entry is an open BACKLOG item:
 * when one is fixed this test fails until the entry is removed, so the list can only shrink.
 */
const KNOWN_DESKTOP_RESTORE_DRIFT = [
    'environment.environmentIntensity',
    'screenSpace.ssaoAttached',
    'screenSpace.ssaoCameras'
];

const flatten = (value, path = '') => Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child) ? flatten(child, here) : [[here, child]];
});

const differences = (a, b) => {
    const other = new Map(flatten(b));
    return flatten(a)
        .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(other.get(key)))
        .map(([key]) => key);
};

/** Holds the colour and the cue still so two captures of the same scene are comparable. */
const pinShow = page => page.evaluate(() => {
    const club = window.vrClub;
    const look = club.showDirector.looks.firstLight;
    look.hue = 0.1;
    look.colorLock = true;
    club.showDirector._applyCue({ look: 'firstLight', bars: 1024 });
});

const sampleImages = async (page, count = 3) => {
    const images = [];
    for (let i = 0; i < count; i++) {
        await renderFrames(page, 6);
        images.push(await captureImage(page));
    }
    return images;
};

const average = (images, key) => images.reduce((sum, image) => sum + image[key], 0) / images.length;
const averageGrid = images => images[0].grid.map((_, cell) => average(images.map(image => ({ cell: image.grid[cell] })), 'cell'));

test('VR keeps the desktop rendering features and image structure at the same graphics tier', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.evaluate(async spawn => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.camera.position.set(...spawn.position);
        club.camera.setTarget(new BABYLON.Vector3(...spawn.target));
        club.camera.fov = spawn.vfov;
    }, SPAWN);
    await pinShow(page);
    await renderFrames(page, 20);
    const desktopState = await snapshotRenderState(page);
    const desktopImages = await sampleImages(page);

    await enterVR(page);
    await pinShow(page);
    await renderFrames(page, 20);
    const vrState = await snapshotRenderState(page);
    const vrImages = await sampleImages(page);
    const eyeSize = await page.evaluate(() => {
        const layer = window.vrClub.vrHelper.baseExperience.sessionManager.session.renderState.baseLayer;
        return [layer.framebufferWidth, layer.framebufferHeight];
    });

    await test.step('only the documented settings differ between desktop and VR', async () => {
        const unexpected = differences(desktopState, vrState).filter(key => !INTENTIONAL_DIFFERENCES.has(key));
        expect(unexpected, 'settings that changed without being listed in INTENTIONAL_DIFFERENCES').toEqual([]);
    });

    await test.step('VR keeps the features that make the club look like a club', async () => {
        expect(vrState.pipeline).toMatchObject({
            fxaa: true, bloom: true, imageProcessing: true, toneMapping: true, dithering: true,
            sharpen: true, grain: false, chromaticAberration: false, vignette: false
        });
        expect(vrState.pipeline.toneMappingType).toBe(desktopState.pipeline.toneMappingType);
        expect(vrState.glow.enabled).toBe(true);
        expect(vrState.environment.hasReflections).toBe(true);
        expect(vrState.environment.fogMode).toBe(desktopState.environment.fogMode);
        // The same show, crowd and fixtures are drawn: VR never culls content to save time.
        for (const key of ['dancers', 'spotlights', 'lasers', 'ledPanels', 'strobes', 'pbrMaterialCount',
            'maxAnisotropy', 'transparentModelMeshes']) {
            expect(vrState.content[key], `content.${key}`).toBe(desktopState.content[key]);
        }
        expect(vrState.content.enabledMeshes - desktopState.content.enabledMeshes).toBeGreaterThanOrEqual(0);
        expect(vrState.content.enabledMeshes - desktopState.content.enabledMeshes).toBeLessThanOrEqual(10);
        expect(vrState.content.enabledVertices / desktopState.content.enabledVertices).toBeLessThan(1.05);
        // Never more lights than the device budget allows.
        expect(vrState.lighting.materialsOverBudget).toBe(desktopState.lighting.materialsOverBudget);
        expect(vrState.lighting.enabledLights).toBe(desktopState.lighting.enabledLights);
    });

    await test.step('the effects a headset cannot afford are really off', async () => {
        expect(vrState.screenSpace).toMatchObject({ ssaoAttached: false, ssrActive: false, motionBlur: false });
        expect(vrState.lighting.shadowCasters).toBe(0);
        expect(vrState.environment.probeRefreshRate).toBe(0);
        expect(vrState.pipeline.samples).toBe(1);
        expect(vrState.resolution.hardwareScaling).toBe(1);
    });

    await test.step('the emulated eye buffer is not smaller than the desktop canvas', async () => {
        expect(eyeSize[0]).toBeGreaterThanOrEqual(desktopImages[0].width);
        expect(eyeSize[1]).toBeGreaterThanOrEqual(desktopImages[0].height);
    });

    await test.step('the VR image keeps the desktop image structure and does not get darker', async () => {
        const luma = average(vrImages, 'meanLuma') / average(desktopImages, 'meanLuma');
        const structure = pearson(averageGrid(vrImages), averageGrid(desktopImages));
        const edges = average(vrImages, 'edgeEnergy') / average(desktopImages, 'edgeEnergy');
        test.info().annotations.push({
            type: 'vr-vs-desktop',
            description: `luminance x${luma.toFixed(2)}, structure r=${structure.toFixed(2)}, edge energy x${edges.toFixed(2)}`
        });
        // Measured on the emulator at x0.30-0.51 (parity would be ~1). These floors stop the
        // gap from widening; they are not a claim that the gap is acceptable. See BACKLOG.md.
        expect(luma).toBeGreaterThan(0.2);
        expect(structure).toBeGreaterThan(0.75);
    });

    await exitVR(page);
    await page.evaluate(spawn => {
        window.vrClub.camera.position.set(...spawn.position);
        window.vrClub.camera.setTarget(new BABYLON.Vector3(...spawn.target));
    }, SPAWN);
    await renderFrames(page, 15);
    const restoredState = await snapshotRenderState(page);

    await test.step('desktop returns to its pre-VR look', async () => {
        const drift = differences(desktopState, restoredState)
            // Eye adaptation, XR-created textures and materials stay behind by design.
            .filter(key => !['pipeline.exposure', 'content.materialCount', 'content.textureCount',
                'content.enabledMeshes', 'content.enabledVertices'].includes(key));
        expect(drift.sort(), 'update KNOWN_DESKTOP_RESTORE_DRIFT when a BACKLOG item is fixed')
            .toEqual([...KNOWN_DESKTOP_RESTORE_DRIFT].sort());
    });
    await expectHealthyRuntime(page);
});