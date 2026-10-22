import { test, expect } from '@playwright/test';
import { useQuestHarness } from './support.mjs';

useQuestHarness();

test('real seated people keep relaxed elbows and planted feet in lightweight, detailed and wardrobe bodies', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.AvatarAppearance);
    await page.evaluate(() => {
        const B = window.BABYLON;
        const canvas = document.createElement('canvas');
        canvas.id = 'seatedCanvas';
        canvas.width = 720; canvas.height = 720;
        canvas.style.cssText = 'width:720px;height:720px;display:block';
        document.body.replaceChildren(canvas);
        const engine = new B.Engine(canvas, true), scene = new B.Scene(engine);
        scene.clearColor = new B.Color4(0.035, 0.045, 0.06, 1);
        const camera = new B.ArcRotateCamera('seatCamera', Math.PI / 2, 1.35, 2.4, new B.Vector3(0, 0.9, 0.15), scene);
        camera.minZ = 0.01;
        const lights = new window.LightFactory(scene, null, 3);
        lights.getPreset('ambient', new B.Vector3(0, 1, 1), 'seatLight').intensity = 1.5;
        window.__seated = { engine, scene, lights };
        engine.runRenderLoop(() => scene.render());
    });
    for (const model of ['avatars/club-crowd-m6', 'characters/malik', 'characters/amara', 'wardrobe/f6']) {
        await page.evaluate(async model => {
            const f = window.__seated, B = window.BABYLON;
            f.preview?.dispose();
            f.container?.dispose();
            if (model.startsWith('wardrobe/')) {
                f.container = null;
                f.preview = await window.AvatarAppearance.loadPreview(f.scene, window.AvatarAppearance.defaults('f6'), '');
                f.root = f.preview.root;
                f.groups = f.preview.entry.animationGroups;
            } else {
                f.preview = null;
                f.container = await B.SceneLoader.LoadAssetContainerAsync('', `js/models/${model}.glb`, f.scene);
                for (const group of f.container.animationGroups) group.stop();
                const entry = f.container.instantiateModelsToScene(name => name, false, { doNotInstantiate: true });
                f.root = entry.rootNodes[0];
                f.groups = entry.animationGroups;
                f.preview = { dispose: () => entry.dispose() };
                f.root.rotationQuaternion = null;
                f.root.rotation.setAll(0);
                f.root.computeWorldMatrix(true);
                const bounds = f.root.getHierarchyBoundingVectors(true);
                const scale = 1.75 / (bounds.max.y - bounds.min.y);
                f.root.scaling.setAll(scale);
                f.root.position.y -= bounds.min.y * scale;
            }
            for (const group of f.groups) group.stop();
            f.root.rotation.y = 0;
            f.root.computeWorldMatrix(true);
            await f.scene.whenReadyAsync();
        }, model);
        const clips = ['Seated_Loop', 'Seated_Low_Loop'];
        if (model === 'characters/amara') clips.push('Seated_Bar_Idle_Loop');
        for (const clip of clips) {
            const metrics = await page.evaluate(clip => {
                const f = window.__seated, B = window.BABYLON;
                for (const group of f.groups) group.stop();
                const group = f.groups.find(group => group.name.endsWith(clip));
                if (!group) throw new Error(`Missing ${clip}`);
                group.start(true); group.pause();
                const node = name => f.root.getDescendants(false, node => node.name === name)[0];
                const at = name => {
                    const n = node(name);
                    n.computeWorldMatrix(true);
                    return n.getAbsolutePosition().clone();
                };
                let minElbow = Infinity, maxElbow = 0, footTravel = 0;
                let feet;
                for (let phase = 0; phase <= 12; phase++) {
                    group.goToFrame(group.from + (group.to - group.from) * phase / 12);
                    f.scene.render();
                    const current = ['L', 'R'].map(side => at(`Foot.${side}`));
                    feet ||= current;
                    for (const [index, side] of ['L', 'R'].entries()) {
                        footTravel = Math.max(footTravel, B.Vector3.Distance(current[index], feet[index]));
                        const elbow = at(`LowerArm.${side}`);
                        const upper = at(`UpperArm.${side}`).subtract(elbow).normalize();
                        const lower = at(`Wrist.${side}`).subtract(elbow).normalize();
                        const angle = Math.acos(Math.max(-1, Math.min(1, B.Vector3.Dot(upper, lower)))) * 180 / Math.PI;
                        minElbow = Math.min(minElbow, angle); maxElbow = Math.max(maxElbow, angle);
                    }
                }
                group.goToFrame(group.from);
                f.scene.render();
                return { minElbow, maxElbow, footTravel };
            }, clip);
            expect(metrics.minElbow, `${model}/${clip}: overly folded arms`).toBeGreaterThan(65);
            expect(metrics.maxElbow, `${model}/${clip}: locked elbows`).toBeLessThan(155);
            expect(metrics.footTravel, `${model}/${clip}: sliding feet`).toBeLessThan(0.025);
            for (const [view, alpha] of [['front', Math.PI / 2], ['side', 0.1]]) {
                await page.evaluate(alpha => {
                    window.__seated.scene.activeCamera.alpha = alpha;
                    window.__seated.scene.render();
                }, alpha);
                await page.locator('#seatedCanvas').screenshot({
                    path: `test-results/seated-${model.replaceAll('/', '-')}-${clip}-${view}.png`
                });
            }
        }
    }
    await page.evaluate(() => {
        const f = window.__seated;
        f.engine.stopRenderLoop();
        f.preview.dispose(); f.container?.dispose(); f.lights.dispose(); f.scene.dispose(); f.engine.dispose();
    });
});
