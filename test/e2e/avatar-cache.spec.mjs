import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { AUDIO_CROWD_LAYERS } from '../club-sources.mjs';

test.use({ serviceWorkers: 'block' });

test('visited avatar binaries survive cold HTTP cache offline, and concurrent source loads download once', async ({ page, context }) => {
    await page.route('**/avatar-cache-test', route => route.fulfill({
        contentType: 'text/html', body: '<p>Avatar source cache regression</p>'
    }));
    await page.goto('/avatar-cache-test');
    await page.evaluate(() => {
        window.VRClubUI = class {};
        window.log = console;
    });

    for (const path of ['../../js/vendor/babylon.js', '../../js/vendor/babylonjs.loaders.min.js',
        '../../js/assetCache.js', '../../js/modelLoader.js',
        ...AUDIO_CROWD_LAYERS.map(name => `../../js/club/${name}`)]) {
        await page.addScriptTag({ path: fileURLToPath(new URL(path, import.meta.url)) });
    }
    await page.evaluate(() => {
        // This source-only harness has no venue/equipment configuration.
        window.ModelLoader.prototype.getModelConfigs = () => ({});
    });
    const avatarUrl = './js/models/avatars/club-crowd-f1.glb';
    const requests = [];
    page.on('request', request => {
        if (request.url().endsWith('/club-crowd-f1.glb')) requests.push(request.method());
    });
    const warm = await page.evaluate(async url => {
        const engine = new BABYLON.NullEngine();
        const scene = new BABYLON.Scene(engine);
        const loader = new window.ModelLoader(scene);
        await loader.init();
        const club = {
            scene, modelLoader: loader, _avatarContainers: [],
            _prepareAvatarMaterials() {}, _restoreLightBudgets() {},
            _loadAvatarSource: window.VRClubAudioCrowd.prototype._loadAvatarSource
        };
        const containers = await Promise.all([club._loadAvatarSource(url), club._loadAvatarSource(url)]);
        if (containers.some(container => !container)) throw new Error('Avatar did not load.');
        const record = await loader.cache.getRecord(url);
        const result = {
            bytes: record.payload.byteLength, fingerprint: record.meta.fingerprint,
            vertices: containers[0].meshes.reduce((n, mesh) => n + mesh.getTotalVertices(), 0),
            distinct: containers[0] !== containers[1],
            animating: containers.some(container => container.animationGroups.some(group => group.isPlaying))
        };
        containers.forEach(container => container.dispose());
        loader.dispose();
        scene.dispose();
        engine.dispose();
        return result;
    }, avatarUrl);
    expect(requests.filter(method => method === 'GET')).toHaveLength(1);
    expect(warm.bytes).toBeGreaterThan(100_000);
    expect(warm.fingerprint).toBeTruthy();
    expect(warm.vertices).toBeGreaterThan(0);
    expect(warm.distinct).toBe(true);
    expect(warm.animating).toBe(false);

    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await context.setOffline(true);
    try {
        const offline = await page.evaluate(async url => {
            // All decoded containers and their loader were destroyed: this must reopen IndexedDB.
            const engine = new BABYLON.NullEngine();
            const scene = new BABYLON.Scene(engine);
            const loader = new window.ModelLoader(scene);
            await loader.init();
            const club = { scene, modelLoader: loader, _avatarContainers: [],
                _prepareAvatarMaterials() {}, _restoreLightBudgets() {},
                _loadAvatarSource: window.VRClubAudioCrowd.prototype._loadAvatarSource };
            const container = await club._loadAvatarSource(url);
            if (!container) throw new Error('Offline avatar did not load from IndexedDB.');
            const vertices = container.meshes.reduce((n, mesh) => n + mesh.getTotalVertices(), 0);
            container.dispose();
            loader.dispose();
            scene.dispose();
            engine.dispose();
            return vertices;
        }, avatarUrl);
        expect(offline).toBe(warm.vertices);
        expect(requests.filter(method => method === 'GET')).toHaveLength(1);
    } finally {
        await context.setOffline(false);
        await cdp.detach();
    }
});

test('consolidated ceiling services reduce real submissions with equivalent left/right-eye views', async ({ page }) => {
    await page.route('**/ceiling-merge-test', route => route.fulfill({
        contentType: 'text/html', body: '<canvas id="view" width="640" height="360"></canvas>'
    }));
    await page.goto('/ceiling-merge-test');
    await page.addScriptTag({ path: fileURLToPath(new URL('../../js/vendor/babylon.js', import.meta.url)) });
    await page.evaluate(() => { window.VRClubRendering = class {}; window.log = console; });
    await page.addScriptTag({ path: fileURLToPath(new URL('../../js/club/04-environment.js', import.meta.url)) });
    await page.evaluate(() => {
        const B = BABYLON;
        const engine = new B.Engine(document.querySelector('canvas'), false, { preserveDrawingBuffer: true });
        const scene = new B.Scene(engine);
        scene.clearColor = new B.Color4(0.02, 0.02, 0.02, 1);
        const camera = new B.FreeCamera('view', new B.Vector3(0, 7, 5), scene);
        camera.setTarget(new B.Vector3(0, 9, -12));
        const light = new B.HemisphericLight('light', new B.Vector3(0, -1, 0), scene);
        light.intensity = 3;
        light.groundColor.set(0.5, 0.5, 0.5);
        const materials = new Map();
        const originalMerge = B.Mesh.MergeMeshes;
        let originals;
        B.Mesh.MergeMeshes = (parts, ...args) => {
            originals = parts;
            args[0] = false;
            return originalMerge.call(B.Mesh, parts, ...args);
        };
        try {
            const club = { scene, materialFactory: { getPreset(name) {
                if (!materials.has(name)) {
                    const material = new B.PBRMaterial(name, scene);
                    material.albedoColor.set(0.3, 0.3, 0.3);
                    material.metallic = 0;
                    material.roughness = 0.8;
                    materials.set(name, material);
                }
                return materials.get(name);
            } }, _applyWorldUVs() {}, createRoofGirders() {}, createLightingTruss() {} };
            window.VRClubEnvironment.prototype.createCeiling.call(club);
        } finally {
            B.Mesh.MergeMeshes = originalMerge;
        }
        const merged = scene.getMeshByName('ceilingServicePipes');
        window.pipeReady = scene.whenReadyAsync();
        window.renderPipeVersion = (merge, eye) => {
            originals.forEach(mesh => mesh.setEnabled(!merge));
            merged.setEnabled(merge);
            camera.position.x = eye;
            engine.beginFrame();
            const beforeDraws = engine._drawCalls.current;
            scene.render();
            engine.endFrame();
            return { draws: engine._drawCalls.current - beforeDraws, triangles: scene.getActiveIndices() / 3 };
        };
    });
    await page.evaluate(() => window.pipeReady);
    for (const eye of [-0.032, 0.032]) {
        await page.evaluate(eye => window.renderPipeVersion(false, eye), eye);
        const before = await page.locator('canvas').screenshot();
        const baseline = await page.evaluate(eye => window.renderPipeVersion(false, eye), eye);
        await page.evaluate(eye => window.renderPipeVersion(true, eye), eye);
        const after = await page.locator('canvas').screenshot();
        const consolidated = await page.evaluate(eye => window.renderPipeVersion(true, eye), eye);
        expect(consolidated.draws).toBe(baseline.draws - 2);
        expect(consolidated.triangles).toBe(baseline.triangles);
        const a = await sharp(before).removeAlpha().raw().toBuffer();
        const b = await sharp(after).removeAlpha().raw().toBuffer();
        let delta = 0;
        let lit = 0;
        for (let index = 0; index < a.length; index++) {
            delta += Math.abs(a[index] - b[index]);
            if (a[index] > 30) lit++;
        }
        expect(lit).toBeGreaterThan(100);
        expect(delta / a.length).toBeLessThan(0.1);
    }
});
