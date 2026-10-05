import { test, expect } from '@playwright/test';
import { browserFailures, enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('authored PA materials render with correct orientation and bounded local lighting', async ({ page }, testInfo) => {
    await page.goto('/');
    for (const budget of [3, 4]) {
        const state = await page.evaluate(async (maxLights) => {
            const canvas = document.createElement('canvas');
            canvas.id = 'speakerTestCanvas';
            canvas.width = canvas.height = 720;
            canvas.style.cssText = 'position:fixed;inset:0;z-index:20000;width:720px;height:720px';
            document.body.append(canvas);
            const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true });
            const scene = new BABYLON.Scene(engine);
            scene.clearColor = new BABYLON.Color4(0.15, 0.15, 0.15, 1);
            scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
                './textures/environment/empty_warehouse_01_256.env', scene);
            const factory = new window.MaterialFactory(scene, console, maxLights);
            const lights = new window.LightFactory(scene, console, maxLights);
            new BABYLON.HemisphericLight('ambient', BABYLON.Vector3.Up(), scene).intensity = 0.2;
            for (let i = 0; i < 6; i++) {
                new BABYLON.SpotLight(`roomSpot${i}`, BABYLON.Vector3.Zero(),
                    BABYLON.Vector3.Down(), 1, 2, scene).intensity = 0;
            }
            const floor = BABYLON.MeshBuilder.CreateGround('floor', { width: 1, height: 1 }, scene);
            floor.material = factory.createPBRMaterial('floor', { mutable: true });
            const loader = new window.ModelLoader(scene, factory, console, maxLights, { lightFactory: lights });
            const models = [];
            for (const key of ['pa_speaker_left', 'pa_speaker_right']) {
                const config = loader.modelConfigs[key];
                const container = await BABYLON.SceneLoader.LoadAssetContainerAsync('', config.url, scene);
                await loader._configureLoadedModel(key, config, container);
                const mesh = container.meshes.find(item => item.getTotalVertices() > 0);
                models.push({ key, root: container.meshes[0], mesh });
            }
            const left = models[0].mesh;
            left.computeWorldMatrix(true);
            const center = left.getBoundingInfo().boundingBox.centerWorld;
            const camera = new BABYLON.ArcRotateCamera('speakerCamera', Math.PI / 2 + 0.35,
                Math.PI / 2 + 0.3, 2.6, center.clone(), scene);
            camera.minZ = 0.01;
            await scene.whenReadyAsync();
            scene.render();
            await scene.whenReadyAsync();
            scene.render();
            window.__speakerTest = { engine, scene, loader, factory, lights, canvas };
            return {
                shared: models[0].mesh.material === models[1].mesh.material,
                roomSlots: floor.lightSources.slice(0, maxLights).map(light => light.name),
                models: models.map(({ key, root, mesh }) => {
                    const mat = mesh.material;
                    const defines = mesh.subMeshes[0].materialDefines.toString();
                    return {
                        key, triangles: mesh.getTotalIndices() / 3,
                        up: BABYLON.Vector3.TransformNormal(BABYLON.Vector3.Up(), root.getWorldMatrix()).normalize().y,
                        front: BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, -1), root.getWorldMatrix()).normalize().asArray(),
                        slots: mesh.lightSources.slice(0, maxLights).map(light => light.name),
                        pointSlot: defines.includes('#define POINTLIGHT0'),
                        budget: mat.maxSimultaneousLights, emissive: mat.emissiveColor.asArray(),
                        metallic: mat.metallic, roughness: mat.roughness,
                        normalX: mat.invertNormalMapX, normalY: mat.invertNormalMapY,
                        packed: mat.occlusionTexture === mat.metallicRoughnessTexture,
                        maps: [mat.baseTexture, mat.normalTexture, mat.metallicRoughnessTexture].map(texture => ({
                            ready: texture.isReady(), invertY: texture.invertY,
                            gamma: texture.gammaSpace, size: texture.getSize().width
                        })),
                        opaque: !mat.needAlphaBlending() && mat.alpha === 1
                            && mat.transparencyMode === 0 && !mat.disableDepthWrite
                    };
                })
            };
        }, budget);
        try {
            expect(state.shared).toBe(true);
            expect(state.roomSlots).toEqual(['ambient', 'roomSpot0', 'roomSpot1', 'roomSpot2'].slice(0, budget));
            for (const model of state.models) {
                expect(model.triangles).toBe(6940);
                expect(model.up).toBeGreaterThan(0.85);
                expect(model.front[1]).toBeCloseTo(-0.5, 3);
                expect(model.front[2]).toBeGreaterThan(0.7);
                expect(model.front[0] * (model.key.endsWith('left') ? 1 : -1)).toBeGreaterThan(0.4);
                expect(model.slots[0]).toBe(`speakerLight_${model.key}`);
                expect(model.pointSlot).toBe(true);
                expect(model.budget).toBe(budget);
                expect(model.emissive).toEqual([0, 0, 0]);
                expect(model.metallic).toBe(1);
                expect(model.roughness).toBe(1);
                expect(model.normalX).toBe(true);
                expect(model.normalY).toBe(false);
                expect(model.packed).toBe(true);
                expect(model.opaque).toBe(true);
                expect(model.maps).toEqual([
                    { ready: true, invertY: false, gamma: true, size: 2048 },
                    { ready: true, invertY: false, gamma: false, size: 2048 },
                    { ready: true, invertY: false, gamma: false, size: 1024 }
                ]);
            }
            await testInfo.attach(`flown-speaker-${budget}-lights`, {
                body: await page.locator('#speakerTestCanvas').screenshot(), contentType: 'image/png'
            });
        } finally {
            await page.evaluate(() => {
                const { loader, factory, lights, scene, engine, canvas } = window.__speakerTest;
                loader.dispose();
                factory.dispose();
                lights.dispose();
                scene.dispose();
                engine.dispose();
                canvas.remove();
                delete window.__speakerTest;
            });
        }
    }
    expect(browserFailures.get(page)).toEqual([]);
});

test('both PA speakers use the authored material in the production club', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const speakers = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        return ['pa_speaker_left', 'pa_speaker_right'].map(key => {
            const container = club.modelLoader.loadedModels[key].container;
            const mesh = container.meshes.find(item => item.getTotalVertices() > 0);
            return {
                key, slots: mesh.lightSources.slice(0, club.maxLights).map(light => light.name),
                ready: mesh.material.getActiveTextures().every(texture => texture.isReady()),
                emissive: mesh.material.emissiveColor.asArray(),
                textureUrl: club.modelLoader.modelConfigs[key].textureBasePath,
                pointSlot: mesh.subMeshes[0].materialDefines.toString().includes('#define POINTLIGHT0')
            };
        });
    });
    for (const speaker of speakers) {
        expect(speaker.slots[0]).toBe(`speakerLight_${speaker.key}`);
        expect(speaker.pointSlot).toBe(true);
        expect(speaker.ready).toBe(true);
        expect(speaker.emissive).toEqual([0, 0, 0]);
        expect(speaker.textureUrl).toContain('/authored/textures/');
    }
    await expectHealthyRuntime(page);
});

test('a bass bin hangs under each PA speaker, rigged, shaded by the speaker light and fenced', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const bins = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        return ['left', 'right'].map(side => {
            const bin = club.modelLoader.loadedModels[`bass_bin_${side}`];
            const speaker = club.modelLoader.loadedModels[`pa_speaker_${side}`];
            const meshes = bin.container.meshes.filter(mesh => mesh.getTotalVertices() > 0);
            const materials = meshes.map(mesh => mesh.material);
            const rig = club.scene.getMeshByName(`binRig_bass_bin_${side}`);
            const block = club.scene.getMeshByName(`bass_bin_${side}Block`);
            return {
                side,
                draws: meshes.length,
                triangles: meshes.reduce((sum, mesh) => sum + mesh.getTotalIndices() / 3, 0),
                width: bin.placed.max.x - bin.placed.min.x,
                topGap: speaker.placed.min.y - bin.placed.max.y,
                bottom: bin.placed.min.y,
                centreOffset: Math.hypot(bin.placed.center.x - speaker.placed.bottomCentre.x, bin.placed.center.z - speaker.placed.bottomCentre.z),
                slot: meshes[0].lightSources.slice(0, club.maxLights).map(light => light.name)[0],
                opaque: materials.every(material => !material.needAlphaBlending() && material.alpha === 1 && !material.disableDepthWrite),
                ready: materials.every(material => material.getActiveTextures().every(texture => texture.isReady())),
                rigged: Boolean(rig) && rig.getTotalIndices() > 0,
                fenced: Boolean(block) && block.checkCollisions
            };
        });
    });
    for (const bin of bins) {
        expect(bin.draws).toBe(6);
        expect(bin.triangles).toBe(20561);
        expect(bin.width).toBeGreaterThan(1.0);
        expect(bin.width).toBeLessThan(1.6);
        // Hung below the speaker with a visible length of chain, and still well above the heads of the crowd.
        expect(bin.topGap).toBeGreaterThan(0.1);
        expect(bin.topGap).toBeLessThan(0.8);
        expect(bin.bottom).toBeGreaterThan(3.9);
        expect(bin.centreOffset).toBeLessThan(0.6);
        expect(bin.slot).toBe(`speakerLight_pa_speaker_${bin.side}`);
        expect(bin.opaque).toBe(true);
        expect(bin.ready).toBe(true);
        expect(bin.rigged).toBe(true);
        expect(bin.fenced).toBe(true);
    }
    await expectHealthyRuntime(page);
});
