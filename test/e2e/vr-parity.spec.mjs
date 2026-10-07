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
    ['pipeline.samples', 'VR runs MSAA on its own pipeline (vrSettings.vr.msaaSamples); desktop balanced does not'],
    ['pipeline.bloomWeight', 'vrSettings.vr'],
    ['pipeline.bloomThreshold', 'vrSettings.vr'],
    ['pipeline.bloomKernel', 'smaller blur kernel in VR'],
    ['pipeline.bloomScale', 'vrSettings.vr'],
    ['pipeline.sharpenEdge', 'vrSettings.vr.edgeSharpness'],
    ['pipeline.sharpenGain', 'desktop runs a 0.5 gain (BACKLOG: halves the desktop image); VR must be 1.0'],
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

/**
 * Holds the colour, the cue, every character and the air still, so two captures of the same scene are comparable.
 * The haze, fog and dust are the largest moving thing in this dark room: two desktop captures of the same pose
 * correlated at only 0.91-0.94 while they drifted, and the VR comparison swung between 0.60 and 0.74 run to run with
 * no code change (bisected: identical builds both passed and failed). With them frozen the same pose matches 1.000, so
 * the score measures how the two modes render, not where the smoke happened to be.
 */
const pinShow = page => page.evaluate(() => {
    const club = window.vrClub;
    const look = club.showDirector.looks.firstLight;
    look.hue = 0.1;
    look.colorLock = true;
    club.showDirector._applyCue({ look: 'firstLight', bars: 1024 });
    for (const group of club.scene.animationGroups) {
        group.goToFrame(group.from);
        group.pause();
    }
    for (const system of club.scene.particleSystems) system.updateSpeed = 0;
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

/**
 * The image comparison is about how the two modes render the same room. In the headset the player's own hands, the
 * controller models and the pointer ray fill the lower third of the frame, and the desktop camera has none of them,
 * so they are hidden while the images are captured (they are already an intended difference, see
 * INTENTIONAL_DIFFERENCES). With them in view the correlation sat on the threshold: 0.62 to 0.69 over five runs.
 */
const showOwnBody = (page, visible) => page.evaluate(on => {
    const club = window.vrClub;
    if (club._localRig && typeof club._localRig.setVisible === 'function') club._localRig.setVisible(on);
    for (const controller of club._xrControllers || []) {
        for (const node of [controller.grip, controller.pointer, controller.motionController && controller.motionController.rootMesh]) {
            if (!node) continue;
            if (typeof node.setEnabled === 'function' && node.getChildMeshes) for (const mesh of node.getChildMeshes(false)) mesh.isVisible = on;
            if ('isVisible' in node) node.isVisible = on;
        }
    }
    const selection = club.vrHelper && club.vrHelper.pointerSelection;
    if (selection) {
        selection.displayLaserPointer = on;
        selection.displaySelectionMesh = on;
    }
}, visible);

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
    await showOwnBody(page, false);
    const desktopImages = await sampleImages(page);
    await showOwnBody(page, true);

    await enterVR(page);
    await pinShow(page);
    await renderFrames(page, 20);
    const vrState = await snapshotRenderState(page);
    await showOwnBody(page, false);
    const vrImages = await sampleImages(page);
    await showOwnBody(page, true);
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
        // MSAA is on in the headset (the XR layer's own antialias does not reach this pipeline's
        // offscreen target), up to what the GPU supports.
        const maxMsaa = await page.evaluate(() => window.vrClub.engine.getCaps().maxMSAASamples);
        expect(vrState.pipeline.samples).toBe(Math.min(4, maxMsaa || 1));
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
        // The VR image must be at least as bright as the desktop one, with at least its peaks.
        // It was x0.30-0.51 with peaks capped at about a tenth, because the sharpen stage's colour
        // amount (a brightness gain) was 0.1. Measured now at about x1.8 (exposure 0.6); the
        // ceiling stops a regression the other way, into a washed-out headset.
        expect(vrState.pipeline.sharpenGain, 'sharpen colour amount is a brightness gain: keep it 1.0').toBe(1);
        expect(luma).toBeGreaterThan(1.0);
        expect(luma).toBeLessThan(3.5);
        expect(average(vrImages, 'p99') / average(desktopImages, 'p99'), 'VR peak whites are capped').toBeGreaterThan(1.0);
        // Lower than a pure render comparison would allow: the headset is deliberately lit by the show alone (base
        // fill 0.015 vs the desktop's 0.08), so the dark room's walls contribute less structure. Measured r=0.74.
        expect(structure).toBeGreaterThan(0.7);
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