import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('every filtered beam starts across its lens and follows the physical head', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, B = window.BABYLON;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotPrismActive = true;
        club.spotlightMode = 1;
        club.masterIntensity = 1;
        let time = 20, worstOrigin = 0, worstAngle = 0, worstRay = 0, smallestOuterRing = Infinity, worstCentroid = 0, worstCase;
        const face = new B.Vector3(), normal = new B.Vector3(), vertex = new B.Vector3(), centroid = new B.Vector3();
        for (const pattern of [1, 0, 4, 2, 3, 5, 6, 7, 1]) {
            club.spotlightPattern = pattern;
            for (let frame = 0; frame < 60; frame++) {
                time += 1 / 60;
                club.updateSpotlights({ time, dtScale: 1, audio: { hasAudio: true, energy: frame < 30 ? 0.1 : 0.9 } });
                for (const spot of club.spotlights) {
                    const lens = spot.lens.computeWorldMatrix(true);
                    B.Vector3.TransformCoordinatesFromFloatsToRef(0, -0.01, 0, lens, face);
                    B.Vector3.TransformNormalToRef(B.Axis.Y.scale(-1), lens, normal);
                    normal.normalize();
                    worstOrigin = Math.max(worstOrigin, B.Vector3.Distance(face, spot._emissionPoint));
                    worstAngle = Math.max(worstAngle, Math.acos(Math.max(-1, Math.min(1, B.Vector3.Dot(normal, spot._photoDir)))));
                    const p = spot.prism.getVerticesData(B.VertexBuffer.PositionKind);
                    const matrix = spot.prism.computeWorldMatrix(true);
                    let outerRing = Infinity;
                    centroid.set(0, 0, 0);
                    for (let ray = 0; ray < 13; ray++) {
                        const index = ray * 8 * 3;
                        B.Vector3.TransformCoordinatesFromFloatsToRef(p[index], p[index + 1], p[index + 2], matrix, vertex);
                        worstRay = Math.max(worstRay, B.Vector3.Distance(vertex, face));
                        centroid.addInPlace(vertex);
                        const next = index + 3;
                        B.Vector3.TransformCoordinatesFromFloatsToRef(p[next], p[next + 1], p[next + 2], matrix, vertex);
                        worstRay = Math.max(worstRay, B.Vector3.Distance(vertex, face));
                        centroid.addInPlace(vertex);
                        if (ray >= 5) outerRing = Math.min(outerRing, B.Vector3.Distance(vertex, face));
                    }
                    centroid.scaleInPlace(1 / 26);
                    const centroidError = B.Vector3.Distance(centroid, face);
                    if (centroidError > worstCentroid) {
                        worstCentroid = centroidError;
                        worstCase = { pattern, frame, index: spot.index, visible: spot.prism.isVisible,
                            delta: centroid.subtract(face).asArray(), normal: normal.asArray(), direction: spot._photoDir.asArray() };
                    }
                    smallestOuterRing = Math.min(smallestOuterRing, outerRing);
                }
            }
        }
        const gradient = club._beamGradientTexture.getContext().getImageData(32, 0, 1, 1).data[3];
        return { worstOrigin, worstAngle, worstRay, smallestOuterRing, worstCentroid, worstCase, gradient };
    });
    expect(result.worstOrigin, JSON.stringify(result)).toBeLessThan(0.002);
    expect(result.worstAngle, JSON.stringify(result)).toBeLessThan(0.01);
    expect(result.worstRay, JSON.stringify(result)).toBeLessThan(0.17);
    expect(result.smallestOuterRing, JSON.stringify(result)).toBeGreaterThan(0.095);
    expect(result.worstCentroid, JSON.stringify(result)).toBeLessThan(0.002);
    expect(result.gradient, JSON.stringify(result)).toBeGreaterThanOrEqual(85);
    await expectHealthyRuntime(page);
});

test('spotlight emission is visible immediately in front of the lens', async ({ page }) => {
    test.setTimeout(300_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, B = window.BABYLON, scene = club.scene;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotStrobeActive = false;
        club.spotlightMode = 3;
        club.spotlightPattern = 1;
        club.spotPrismActive = true;
        club.masterIntensity = 1;
        for (let frame = 0; frame < 120; frame++) {
            club.updateSpotlights({ time: 10, dtScale: 1, audio: { hasAudio: false, average: 0 } });
        }
        const spot = club.spotlights[0], face = spot._emissionPoint.clone();
        const side = B.Vector3.Cross(spot._photoDir, B.Axis.Y);
        if (side.lengthSquared() < 0.001) side.copyFrom(B.Axis.X);
        side.normalize();
        const camera = new B.FreeCamera('apertureTestCamera', face.add(side.scale(1)).add(spot._photoDir.scale(0.35)), scene);
        camera.setTarget(face.add(spot._photoDir.scale(0.1)));
        camera.minZ = 0.01;
        const target = new B.RenderTargetTexture('apertureTestTarget', { width: 512, height: 512 }, scene, false);
        target.activeCamera = camera;
        target.clearColor = new B.Color4(0, 0, 0, 1);
        target.renderList = [spot.lens, spot.beam, spot.prism];
        await scene.whenReadyAsync();
        const capture = async active => {
            spot.beam.visibility = active ? 0.25 : 0;
            spot.prism.visibility = active ? 1 : 0;
            scene.incrementRenderId();
            target.render(true);
            return (await target.readPixels()).slice();
        };
        const dark = await capture(false);
        const lit = await capture(true);
        let changed = 0;
        for (let y = 176; y < 336; y++) for (let x = 176; x < 336; x++) {
            const i = (y * 512 + x) * 4;
            if (lit[i] + lit[i + 1] + lit[i + 2] > dark[i] + dark[i + 1] + dark[i + 2] + 6) changed++;
        }
        target.dispose();
        camera.dispose();
        return { changed };
    });
    expect(result.changed, JSON.stringify(result)).toBeGreaterThan(50);
    await expectHealthyRuntime(page);
});

test('spotlight prism layers clipped, synchronized rays over a dim cone', async ({ page }) => {
    await enterClub(page);
    const result = await page.evaluate(() => {
        const club = window.vrClub;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.lightsActive = true;
        club.spotStrobeActive = false;
        club.spotlightMode = 3;
        club.masterIntensity = 1;
        const update = () => club.updateSpotlights({
            time: 10, dtScale: 1, audio: { hasAudio: false, average: 0 }
        });

        const first = club.spotlights[0];
        club.spotPrismActive = false;
        update();
        const normal = { cone: first.beam.visibility, prism: first.prism.isVisible, alpha: first.beamMat.alpha };
        club.spotPrismActive = true;
        update();
        const split = {
            cone: first.beam.visibility,
            prism: first.prism.isVisible,
            visibility: first.prism.visibility,
            coneAlpha: first.beamMat.alpha,
            rayAlpha: first.prismMat.alpha,
            coneColor: first.beamMat.emissiveColor.asArray(),
            rayColor: first.prismMat.emissiveColor.asArray(),
            separateMaterial: first.prism.material !== first.beam.material,
            sameTexture: first.prism.material.opacityTexture === first.beam.material.opacityTexture,
            vertices: first.prism.getTotalVertices(),
            indices: first.prism.getIndices().length,
            position: first.prism.position.equalsWithEpsilon(first.beam.position),
            rotation: first.prism.rotationQuaternion.equals(first.beam.rotationQuaternion),
            scale: first.prism.scaling.equalsWithEpsilon(first.beam.scaling),
            clip: !!first.prism.material.clipPlane4
                && first.prism.material.clipPlane4 === first.beam.material.clipPlane4,
            allSix: club.spotlights.every(spot => spot.prism.isVisible)
        };
        club.masterIntensity = 0;
        update();
        const blackout = club.spotlights.every(spot => spot.beam.visibility === 0 && spot.prism.visibility === 0);
        club.masterIntensity = 1;
        club.lightsActive = false;
        update();
        const dark = club.spotlights.every(spot => spot.beam.visibility === 0 && spot.prism.visibility === 0);
        club.lightsActive = true;
        club.spotPrismActive = false;
        update();
        const restored = { cone: first.beam.visibility, prism: first.prism.isVisible };
        club.vjManualMode = false;
        club.showDirector.enabled = true;
        club.photosensitiveSafeMode = true;
        club.showDirector._applyLook(club.showDirector.looks.liquidPlane);
        document.getElementById('vjDropBtn').click();
        const peak = { look: club.showDirector._cue.look, sheet: club.laserSheetActive, strobes: club.strobesActive };
        const slider = document.getElementById('vjMasterSlider');
        slider.value = '0';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        club.showDirector._applyContinuous(club.vjDirector, { hasAudio: false });
        const muted = club.masterIntensity;
        slider.value = '1';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        club.showDirector._applyContinuous(club.vjDirector, { hasAudio: false });
        const dustSize = { min: club.dustMotes.minSize, max: club.dustMotes.maxSize };
        return { normal, split, blackout, dark, restored, peak, muted, dustSize, restoredMaster: club.masterIntensity };
    });
    expect(result.normal.cone).toBe(1);
    expect(result.normal.prism).toBe(false);
    const { coneAlpha, rayAlpha, coneColor, rayColor, ...split } = result.split;
    expect(split).toEqual({
        cone: 0.25, prism: true, visibility: 1, separateMaterial: true, sameTexture: true,
        vertices: 364, indices: 780, position: true, rotation: true, scale: true, clip: true, allSix: true
    });
    expect(coneAlpha).toBeCloseTo(result.normal.alpha, 6);
    expect(rayAlpha).toBeGreaterThan(coneAlpha);
    for (let i = 0; i < 3; i++) expect(rayColor[i]).toBeCloseTo(coneColor[i] * 2, 6);
    expect(result.blackout).toBe(true);
    expect(result.dark).toBe(true);
    expect(result.restored).toEqual({ cone: 1, prism: false });
    expect(result.peak).toEqual({ look: 'releaseHit', sheet: false, strobes: false });
    expect(result.muted).toBe(0);
    expect(result.dustSize).toEqual({ min: 0.003, max: 0.012 });
    expect(result.restoredMaster).toBeGreaterThan(0);
    await expectHealthyRuntime(page);
});

test('filtered spotlight feathers individual rays into their gaps', async ({ page }) => {
    test.setTimeout(300_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, B = window.BABYLON, scene = club.scene;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotStrobeActive = false;
        club.spotlightMode = 3;
        club.spotlightPattern = 1;
        club.spotPrismActive = true;
        club.masterIntensity = 1;
        for (let frame = 0; frame < 120; frame++) {
            club.updateSpotlights({ time: 10, dtScale: 1, audio: { hasAudio: false, average: 0 } });
        }
        const spot = club.spotlights[0];
        const midpoint = spot.beam.position.clone();
        const side = B.Vector3.Cross(spot._photoDir, B.Axis.Y);
        if (side.lengthSquared() < 0.001) side.copyFrom(B.Axis.X);
        side.normalize();
        const camera = new B.FreeCamera('prismTestCamera', midpoint.add(side.scale(4)), scene);
        camera.setTarget(midpoint);
        camera.minZ = 0.05;
        const target = new B.RenderTargetTexture('prismTestTarget', { width: 256, height: 256 }, scene, false);
        target.activeCamera = camera;
        target.clearColor = new B.Color4(0, 0, 0, 1);
        target.renderList = [spot.beam, spot.prism];
        const colors = spot.prism.getVerticesData(B.VertexBuffer.ColorKind).slice();
        const withoutHalos = colors.slice();
        for (let i = 104 * 4 + 3; i < withoutHalos.length; i += 4) withoutHalos[i] = 0;
        spot.prism.setVerticesData(B.VertexBuffer.ColorKind, withoutHalos, true);
        await scene.whenReadyAsync();
        const sample = async (cone, rays) => {
            spot.beam.visibility = cone;
            spot.prism.visibility = rays;
            scene.incrementRenderId();
            target.render(true);
            return (await target.readPixels()).slice();
        };
        const rays = await sample(0, 1);
        spot.prism.updateVerticesData(B.VertexBuffer.ColorKind, colors);
        const feathered = await sample(0, 1);
        const cone = await sample(0.25, 0);
        const combined = await sample(0.25, 1);
        let gaps = 0, haloGaps = 0, haloBrighter = 0, rayPixels = 0, brighter = 0, maxRay = 0, maxCone = 0;
        for (let i = 0; i < rays.length; i += 4) {
            const r = rays[i] + rays[i + 1] + rays[i + 2];
            const c = cone[i] + cone[i + 1] + cone[i + 2];
            const f = feathered[i] + feathered[i + 1] + feathered[i + 2];
            const both = combined[i] + combined[i + 1] + combined[i + 2];
            maxRay = Math.max(maxRay, r);
            maxCone = Math.max(maxCone, c);
            if (r <= 3 && c >= 6 && both >= 6) gaps++;
            if (r <= 3 && f >= 9) haloGaps++;
            if (f > r + 3) haloBrighter++;
            if (r >= 12) rayPixels++;
            if (both > r + 3) brighter++;
        }
        target.dispose();
        camera.dispose();
        return { gaps, haloGaps, haloBrighter, rayPixels, brighter, direction: spot._photoDir.asArray(),
            alpha: spot.beamMat.alpha, rayAlpha: spot.prismMat.alpha, color: spot.beamMat.emissiveColor.asArray(),
            maxRay, maxCone, vertexAlpha: spot.prism.subMeshes[0].effect?.defines.includes('#define VERTEXALPHA') };
    });
    expect(result.gaps, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.haloGaps, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.haloBrighter, JSON.stringify(result)).toBeGreaterThan(1000);
    expect(result.rayPixels, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.brighter, JSON.stringify(result)).toBeGreaterThan(100);
    expect(result.maxCone, JSON.stringify(result)).toBeLessThan(result.maxRay);
    expect(result.vertexAlpha).toBe(true);
    await expectHealthyRuntime(page);
});

test('feathered rays remain visible through the club rendering pipeline', async ({ page }) => {
    test.setTimeout(300_000);
    await enterClub(page);
    await page.evaluate(async () => {
        const club = window.vrClub, B = window.BABYLON;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotStrobeActive = false;
        club.spotlightMode = 3;
        club.spotlightPattern = 1;
        club.spotPrismActive = true;
        club.masterIntensity = 1;
        for (let frame = 0; frame < 120; frame++) {
            club.updateSpotlights({ time: 10, dtScale: 1, audio: { hasAudio: false, average: 0 } });
        }
        for (const other of club.spotlights.slice(1)) {
            other.beam.visibility = 0;
            other.prism.visibility = 0;
        }
        const spot = club.spotlights[0];
        spot.prismMat.emissiveColor.set(1, 0, 1);
        spot.beamMat.emissiveColor.set(0.5, 0, 0.5);
        const colors = spot.prism.getVerticesData(B.VertexBuffer.ColorKind).slice();
        const withoutHalos = colors.slice();
        for (let i = 104 * 4 + 3; i < withoutHalos.length; i += 4) withoutHalos[i] = 0;
        spot.prism.setVerticesData(B.VertexBuffer.ColorKind, withoutHalos, true);
        window.__prismColors = colors;
        const target = spot.beam.position.clone();
        club.camera.position.copyFrom(target.add(new B.Vector3(4, 0, 0)));
        club.camera.setTarget(target);
        await club.scene.whenReadyAsync();
        for (let i = 0; i < 3; i++) club.scene.render();
    });
    const before = await page.screenshot({ path: test.info().outputPath('prism-before.png') });
    await page.evaluate(() => {
        const club = window.vrClub;
        club.spotlights[0].prism.updateVerticesData(window.BABYLON.VertexBuffer.ColorKind, window.__prismColors);
        for (let i = 0; i < 3; i++) club.scene.render();
    });
    const after = await page.screenshot({ path: test.info().outputPath('prism-feathered.png') });
    const { default: sharp } = await import('sharp');
    const { width, height } = await sharp(after).metadata();
    const baseline = await sharp(before).removeAlpha().raw().toBuffer();
    const softened = await sharp(after).removeAlpha().raw().toBuffer();
    let visibleGlow = 0, dimGaps = 0, brightCores = 0;
    for (let i = 0; i < softened.length; i += 3) {
        const pixel = i / 3, x = pixel % width, y = Math.floor(pixel / width);
        if (x < width * 0.4 || x > width * 0.6 || y < height * 0.08 || y > height * 0.7) continue;
        if (softened[i] > baseline[i] + 8 && softened[i + 2] > baseline[i + 2] + 8) {
            visibleGlow++;
            if (baseline[i] < 60 && baseline[i + 2] < 60) dimGaps++;
        }
        if (softened[i] > 120 && softened[i + 2] > 120) brightCores++;
    }
    console.log('PRISM_PIPELINE_PIXELS', JSON.stringify({ visibleGlow, dimGaps, brightCores }));
    expect(visibleGlow).toBeGreaterThan(5000);
    expect(dimGaps).toBeGreaterThan(1000);
    expect(brightCores).toBeGreaterThan(100);
    await expectHealthyRuntime(page);
});

test('filter preserves the source and aim of each enabled head on both trusses', async ({ page }) => {
    await enterClub(page);
    const result = await page.evaluate(() => {
        const club = window.vrClub;
        club.engine.stopRenderLoop();
        club.takeLightControl();
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotStrobeActive = false;
        club.spotlightMode = 3;
        club.spotlightPattern = 1;
        club.masterIntensity = 1;
        const sample = prism => {
            club.spotPrismActive = prism;
            for (let i = 0; i < 300; i++) club.updateSpotlights({
                time: 10, dtScale: 1, audio: { hasAudio: false, average: 0 }
            });
            return club.spotlights.map(spot => ({
                source: spot._emissionPoint.asArray(),
                direction: spot._photoDir.asArray(),
                visible: prism ? spot.prism.isVisible && spot.prism.visibility > 0
                    : spot.beam.isVisible && spot.beam.visibility > 0,
                aligned: spot.prism.position.equalsWithEpsilon(spot.beam.position)
                    && spot.prism.rotationQuaternion.equals(spot.beam.rotationQuaternion)
                    && spot.prism.scaling.equalsWithEpsilon(spot.beam.scaling)
            }));
        };
        const allNormal = sample(false), allFiltered = sample(true);
        club.spotHead1Enabled = false;
        club.spotHead4Enabled = false;
        const partialNormal = sample(false), partialFiltered = sample(true);
        club.resetSpotRig();
        club.spotSequence = 5;
        club.spotSequenceRate = 4;
        club.spotRigBeat = () => 0;
        const columnNormal = sample(false), columnFiltered = sample(true);
        return { allNormal, allFiltered, partialNormal, partialFiltered, columnNormal, columnFiltered };
    });
    for (const [normal, filtered] of [
        [result.allNormal, result.allFiltered], [result.partialNormal, result.partialFiltered],
        [result.columnNormal, result.columnFiltered]
    ]) {
        for (let i = 0; i < 6; i++) {
            expect(filtered[i].visible).toBe(normal[i].visible);
            expect(filtered[i].aligned).toBe(true);
            expect(filtered[i].source[0] * (i < 3 ? -1 : 1)).toBeGreaterThan(7);
            for (let axis = 0; axis < 3; axis++) {
                expect(filtered[i].source[axis]).toBeCloseTo(normal[i].source[axis], 4);
                expect(filtered[i].direction[axis]).toBeCloseTo(normal[i].direction[axis], 4);
            }
        }
    }
    expect(result.allFiltered.every(head => head.visible)).toBe(true);
    expect(result.partialFiltered.map(head => head.visible)).toEqual([true, false, true, true, false, true]);
    expect(result.columnFiltered.map(head => head.visible)).toEqual([true, true, true, false, false, false]);
    await expectHealthyRuntime(page);
});
