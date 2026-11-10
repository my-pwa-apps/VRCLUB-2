import { test, expect } from '@playwright/test';
import sharp from 'sharp';
import { useQuestHarness } from './support.mjs';

useQuestHarness();

test('clothing graphics, fitted shoes and sheer tights render visibly within the shared accessory draw budget', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.AvatarDetails?.PRINTS);
    await page.evaluate(() => {
        const B = window.BABYLON;
        const canvas = document.createElement('canvas');
        canvas.id = 'fashionCanvas';
        canvas.width = 800; canvas.height = 700;
        canvas.style.cssText = 'width:800px;height:700px;display:block';
        document.body.replaceChildren(canvas);
        const engine = new B.Engine(canvas, true), scene = new B.Scene(engine);
        scene.clearColor = new B.Color4(0.035, 0.045, 0.06, 1);
        const camera = new B.ArcRotateCamera('fashionCamera', -Math.PI / 2, 1.38, 1.05, new B.Vector3(0, 1.25, 0), scene);
        camera.minZ = 0.01;
        scene.animationsEnabled = false;
        const lights = new window.LightFactory(scene, null, 3);
        lights.getPreset('ambient', new B.Vector3(0, 1, -1), 'fashionLight').intensity = 1.5;
        window.__fashion = { engine, scene, lights };
        engine.runRenderLoop(() => scene.render());
    });
    for (const [base, kind] of [['m2', 'sound'], ['m7', 'light'], ['m3', 'orbit'], ['f8', 'signal']]) {
        const state = await page.evaluate(async ({ base }) => {
            const f = window.__fashion, A = window.AvatarAppearance;
            f.preview?.dispose();
            f.preview = await A.loadPreview(f.scene, { ...A.defaults(base), outfit: base === 'f8' ? 'casual' : 'original', v: 2, hair: 'bald',
                glasses: 'none', facialHair: 'none', hat: 'none' });
            await f.scene.whenReadyAsync();
            const meshes = f.preview.root.getChildMeshes().filter(mesh => mesh.isEnabled() && mesh.getTotalVertices());
            f.print = meshes.find(mesh => mesh.metadata?.vrclubPrint);
            return { print: f.print?.metadata.vrclubPrint, draws: meshes.length,
                texture: !!f.print?.material.albedoTexture };
        }, { base });
        expect(state).toMatchObject({ print: kind, texture: false });
        expect(state.draws).toBeLessThanOrEqual(6);
        await page.evaluate(() => { window.__fashion.print.setEnabled(false); window.__fashion.scene.render(); });
        const plain = await page.locator('#fashionCanvas').screenshot();
        await page.evaluate(() => window.__fashion.scene.render());
        expect(plain.equals(await page.locator('#fashionCanvas').screenshot()), 'the comparison must not count animation as ink').toBe(true);
        await page.evaluate(() => { window.__fashion.print.setEnabled(true); window.__fashion.scene.render(); });
        const printed = await page.locator('#fashionCanvas').screenshot({ path: `test-results/clothing-print-${kind}.png` });
        const [a, b] = await Promise.all([plain, printed].map(image => sharp(image).removeAlpha().raw().toBuffer()));
        const ink = [];
        for (let i = 0; i < a.length; i += 3) {
            if (Math.max(...[0, 1, 2].map(channel => Math.abs(a[i + channel] - b[i + channel]))) > 20) {
                ink.push([i / 3 % 800, Math.floor(i / 3 / 800)]);
            }
        }
        expect(ink.length, `${kind}: the print must actually draw, not merely exist`).toBeGreaterThan(200);
        expect(ink.length).toBeLessThan(800 * 700 * 0.08);
        if (kind === 'light') {
            const xs = ink.map(point => point[0]), ys = ink.map(point => point[1]);
            const middle = (Math.min(...xs) + Math.max(...xs)) / 2;
            const floor = Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.8;
            const left = ink.filter(([x, y]) => y > floor && x < middle).length;
            const right = ink.filter(([x, y]) => y > floor && x > middle).length;
            expect(right, 'the bent right leg of the Japanese character must not read backwards').toBeGreaterThan(left * 1.3);
        }
    }
    await page.evaluate(async () => {
        const f = window.__fashion, A = window.AvatarAppearance;
        f.preview.dispose();
        f.look = { ...A.defaults('f6'), v: 3, hair: 'bald', glasses: 'none', facialHair: 'none',
            hat: 'none', shoes: 'pumps', legwear: 'bare' };
        f.preview = await A.loadPreview(f.scene, f.look);
        const camera = f.scene.activeCamera;
        camera.target.set(0, 0.2, 0);
        camera.radius = 0.85;
        camera.beta = 1.3;
        await f.scene.whenReadyAsync();
    });
    const footwearImages = [];
    for (const shoes of ['loafers', 'pumps', 'heels']) {
        const state = await page.evaluate(shoes => {
            const f = window.__fashion;
            f.look.shoes = shoes;
            f.preview.update(f.look);
            f.scene.render();
            const active = f.preview.root.getChildMeshes().filter(mesh => mesh.isEnabled() && mesh.getTotalVertices());
            return { shoes: active.filter(mesh => /wardrobe_shoes_/.test(mesh.name)).map(mesh => mesh.name), draws: active.length };
        }, shoes);
        expect(state.shoes).toHaveLength(1);
        expect(state.shoes[0]).toContain(`wardrobe_shoes_${shoes}`);
        expect(state.draws).toBeLessThanOrEqual(6);
        footwearImages.push(await page.locator('#fashionCanvas').screenshot({ path: `test-results/footwear-${shoes}.png` }));
        await page.evaluate(() => {
            const f = window.__fashion;
            f.scene.activeCamera.alpha = -0.7;
            f.scene.render();
        });
        await page.locator('#fashionCanvas').screenshot({ path: `test-results/footwear-${shoes}-side.png` });
        await page.evaluate(() => {
            const f = window.__fashion;
            f.scene.activeCamera.alpha = -Math.PI / 2;
            f.scene.render();
        });
    }
    for (let index = 1; index < footwearImages.length; index++) {
        const [a, b] = await Promise.all([footwearImages[index - 1], footwearImages[index]]
            .map(image => sharp(image).removeAlpha().raw().toBuffer()));
        let changed = 0;
        for (let pixel = 0; pixel < a.length; pixel += 3) {
            if ([0, 1, 2].some(channel => Math.abs(a[pixel + channel] - b[pixel + channel]) > 20)) changed++;
        }
        expect(changed, 'each shoe choice must visibly change the real fitted footwear').toBeGreaterThan(300);
    }
    const legwearImages = [];
    for (const legwear of ['bare', 'sheer-black', 'sheer-nude']) {
        await page.evaluate(legwear => {
            const f = window.__fashion;
            f.look.shoes = 'pumps'; f.look.legwear = legwear;
            f.preview.update(f.look);
            f.scene.activeCamera.target.set(0, 0.55, 0);
            f.scene.activeCamera.radius = 1.1;
            f.scene.render();
        }, legwear);
        legwearImages.push(await page.locator('#fashionCanvas').screenshot({ path: `test-results/legwear-${legwear}.png` }));
    }
    for (let index = 1; index < legwearImages.length; index++) {
        const [a, b] = await Promise.all([legwearImages[0], legwearImages[index]]
            .map(image => sharp(image).removeAlpha().raw().toBuffer()));
        let changed = 0;
        for (let pixel = 0; pixel < a.length; pixel += 3) {
            if ([0, 1, 2].some(channel => Math.abs(a[pixel + channel] - b[pixel + channel]) > 5)) changed++;
        }
        expect(changed, 'sheer tights must actually render on the legs').toBeGreaterThan(300);
    }
    for (const base of ['f2', 'f4', 'f8']) {
        const look = await page.evaluate(async base => {
            const f = window.__fashion, A = window.AvatarAppearance;
            f.preview.dispose();
            f.preview = await A.loadPreview(f.scene, A.defaults(base));
            const camera = f.scene.activeCamera;
            camera.target.set(0, 0.9, 0); camera.radius = 2.7;
            camera.alpha = -Math.PI / 2; camera.beta = 1.42;
            await f.scene.whenReadyAsync();
            f.scene.render();
            const meshes = f.preview.root.getChildMeshes().filter(mesh => mesh.isEnabled() && mesh.getTotalVertices());
            return { draws: meshes.length, prints: meshes.filter(mesh => mesh.metadata?.vrclubPrint).length,
                hair: meshes.filter(mesh => /wardrobe_hair_/.test(mesh.name)).length,
                alphaBlended: meshes.some(mesh => mesh.material.needAlphaBlending()) };
        }, base);
        expect(look).toMatchObject({ prints: 0, hair: 1, alphaBlended: false });
        expect(look.draws).toBeLessThanOrEqual(6);
        await page.locator('#fashionCanvas').screenshot({ path: `test-results/night-out-${base}-front.png` });
        await page.evaluate(() => { window.__fashion.scene.activeCamera.alpha = -0.7; window.__fashion.scene.render(); });
        await page.locator('#fashionCanvas').screenshot({ path: `test-results/night-out-${base}-side.png` });
    }
    await page.evaluate(() => {
        const f = window.__fashion;
        f.engine.stopRenderLoop(); f.preview.dispose(); f.lights.dispose(); f.scene.dispose(); f.engine.dispose();
        delete window.__fashion;
    });
});
