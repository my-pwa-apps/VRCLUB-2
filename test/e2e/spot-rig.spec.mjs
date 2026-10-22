import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { enterClub, enterVR, exitVR, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('spot rig: individual colours, dark heads, shading slots, musical rows and blackout agree in the real scene', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.vjManualMode = true;
        club.setPhotosensitiveSafeMode(false);
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotlightMode = 1;
        club.spotStrobeActive = false;
        club.masterIntensity = 1;
        club.setGoboEnabled(true);
        const colour = value => [value.r, value.g, value.b];
        const paletteBefore = club.spotColorList.map(colour);
        let enableCalls = 0;
        for (const spot of club.spotlights) {
            const original = spot.light.setEnabled;
            spot.light.setEnabled = function (...args) { enableCalls++; return original.apply(this, args); };
        }
        let time = 100;
        const update = (frames = 90) => {
            for (let i = 0; i < frames; i++) {
                time += 1 / 60;
                club.updateSpotlights({ time, dt: 1 / 60, dtScale: 1, audio: { hasAudio: false, bass: 0, mid: 0, treble: 0 } });
            }
        };
        const snapshot = () => club.spotlights.map(spot => ({
            level: spot._rigLevel, intensity: spot._photoIntensity, enabled: spot.light.isEnabled(),
            lens: colour(spot.lens.material.emissiveColor),
            beam: colour(spot.beamMat.emissiveColor), beamVisible: spot.beam.visibility,
            poolVisible: spot.lightPool?.visibility || 0,
            glowVisible: spot.beamGlow?.visibility || 0,
            goboVisible: spot.goboProjection?.isEnabled() ? spot.goboProjection.visibility : 0
        }));

        document.querySelector('[data-control="cycleSpotTarget"]').click();
        document.querySelector('[data-control="toggleSpotGroup"]').click();
        const fromDOM = { target: club._spotEditTarget, front: [club.spotHead0Enabled, club.spotHead3Enabled], middle: club.spotHead1Enabled };
        club.resetSpotRig();
        club.setSpotGroup(0, { enabled: false, motion: 2 });
        club.setSpotGroup(10, { enabled: true, color: 1 });
        club.setSpotGroup(11, { enabled: true, color: 2 });
        update();
        club.scene.render();
        const individual = snapshot();
        const slots = club.spotlights.slice(0, club.maxLights - 1).map((spot, i) => {
            const source = club.spotlights[club._photometricOrder[i]];
            return { source: club._photometricOrder[i], actual: colour(spot.light.diffuse), expected: colour(source._photoDiffuse),
                specular: colour(spot.light.specular), expectedSpecular: colour(source._photoSpecular) };
        });
        const paletteAfter = club.spotColorList.map(colour);
        const distinct = { blue: colour(club.spotlights[4]._rigColor), green: colour(club.spotlights[5]._rigColor) };

        club.setSpotGroup(0, { enabled: true, motion: 1 });
        update(1);
        const independent = club.spotlights.map(spot => [spot._photoDir.x, spot._photoDir.z]);
        club.setSpotGroup(0, { motion: 2 });
        club.spotSequence = 2;
        club.spotSequenceRate = 2;
        const rows = [];
        for (let row = 0; row < 3; row++) {
            const beat = row * 2;
            club.vjDirector.beatNumber = beat;
            club.barPhase = (beat % 4) / 4;
            update();
            rows.push(snapshot());
        }
        club.photosensitiveSafeMode = true;
        for (const spot of club.spotlights) spot._rigLevel = 0;
        update(120);
        const safe = snapshot();
        club.masterIntensity = 0;
        update(1);
        const blackout = snapshot();
        return { fromDOM, individual, slots, paletteBefore, paletteAfter, distinct, independent, rows, safe, blackout, enableCalls };
    });
    expect(result.fromDOM).toEqual({ target: 1, front: [false, false], middle: true });
    expect(result.paletteAfter, 'slot remapping mutated a shared palette colour').toEqual(result.paletteBefore);
    expect(result.distinct.blue).not.toEqual(result.distinct.green);
    for (let i = 0; i < 6; i++) {
        const spot = result.individual[i];
        expect(spot.enabled).toBe(true);
        if (i >= 4) {
            expect(spot.level).toBeGreaterThan(0.99);
            expect(spot.intensity).toBeGreaterThan(0);
            expect(Math.max(...spot.lens)).toBeGreaterThan(0);
        } else {
            expect(spot.level).toBe(0);
            expect(spot.intensity).toBe(0);
            expect(spot.lens).toEqual([0, 0, 0]);
            expect(spot.beam).toEqual([0, 0, 0]);
            expect(spot.beamVisible).toBe(0);
            expect(spot.poolVisible).toBe(0);
            expect(spot.glowVisible).toBe(0);
            expect(spot.goboVisible).toBe(0);
        }
    }
    expect(result.slots.slice(0, 2).map(slot => slot.source).sort()).toEqual([4, 5]);
    for (const slot of result.slots) {
        expect(slot.actual).toEqual(slot.expected);
        expect(slot.specular).toEqual(slot.expectedSpecular);
    }
    expect(result.independent[0]).not.toEqual(result.independent[1]);
    expect(result.independent[1]).not.toEqual(result.independent[2]);
    for (let row = 0; row < 3; row++) {
        for (let head = 0; head < 6; head++) {
            if (head % 3 === row) expect(result.rows[row][head].level).toBeGreaterThan(0.99);
            else expect(result.rows[row][head].level).toBe(0);
        }
    }
    for (const spot of result.safe) expect(spot.level).toBeLessThanOrEqual(0.45);
    for (const spot of result.blackout) {
        expect(spot.intensity).toBe(0);
        expect(spot.lens).toEqual([0, 0, 0]);
        expect(spot.beam).toEqual([0, 0, 0]);
        expect(spot.beamVisible).toBe(0);
    }
    expect(result.enableCalls, 'a head setting toggled a real GPU light').toBe(0);
    await expectHealthyRuntime(page);
});

test('spot rig: the in-headset page edits a real row and renders its lights dark without changing other heads', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await enterVR(page);
    const menu = await page.evaluate(() => {
        const club = window.vrClub;
        club.vjManualMode = true;
        club.resetSpotRig();
        club.lightsActive = true;
        club.spotlightMode = 1;
        club.toggleVRQuickMenu(true);
        club._showVRQuickMenuPage('lights');
        club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.target === 'spotRig'));
        const count = club._vrQuickMenuButtons.filter(button => button.mesh.isEnabled()).length;
        club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.control === 'cycleSpotTarget'));
        club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.control === 'toggleSpotGroup'));
        return { count, page: club._vrQuickMenuPage, target: club._spotEditTarget, front: [club.spotHead0Enabled, club.spotHead3Enabled],
            middle: club.spotHead1Enabled, value: club.spotRigControlValue('toggleSpotGroup') };
    });
    expect(menu).toEqual({ count: 11, page: 'spotRig', target: 1, front: [false, false], middle: true, value: 'OFF' });
    await expect.poll(() => page.evaluate(() => {
        const club = window.vrClub;
        return [0, 3].every(i => club.spotlights[i]._rigLevel === 0 &&
            club.spotlights[i].lens.material.emissiveColor.asArray().every(value => value === 0) &&
            club.spotlights[i].light.isEnabled());
    }), { timeout: 90_000 }).toBe(true);
    const hold = await page.evaluate(() => {
        const club = window.vrClub, show = club.showDirector;
        club.resumeAutoShow();
        show.forceMovement('pulse');
        show._advanceCue();
        club._showVRQuickMenuPage('show');
        const count = club._vrQuickMenuButtons.filter(button => button.mesh.isEnabled()).length;
        club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.action === 'holdLook'));
        const held = show.isHeld(), cue = show._cue.look;
        for (let bar = 0; bar < 40; bar++) {
            show._barCounter++;
            show._onBar();
        }
        const kept = show._cue.look === cue;
        const value = club._vrQuickMenuButtonValue({ action: 'holdLook' }, true);
        club._activateVRQuickMenuButton(club._vrQuickMenuButtons.find(button => button.action === 'holdLook'));
        const released = !show.isHeld();
        club.toggleVRQuickMenu(false);
        return { count, held, kept, value, released, manual: club.vjManualMode };
    });
    expect(hold).toEqual({ count: 10, held: true, kept: true, value: 'HELD: PRESS TO RELEASE', released: true, manual: false });
    await exitVR(page);
    await expectHealthyRuntime(page);
});

test('row choreography: the automatic running order renders delayed pairs, a white anchor, fills and Safe Mode', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, show = club.showDirector;
        await club.modelLoadPromise;
        club.engine.stopRenderLoop();
        club.vjManualMode = false;
        club.setPhotosensitiveSafeMode(false);
        club.vjDirector.remoteDriven = false;
        club.vjBPM = 120;
        club.kickPulse = 0;
        club.masterIntensity = 0.75;
        show.enabled = true;
        show.follower = false;
        show._setPiece = null;
        show._hasAudio = false;
        show._energy = 0.20;
        show._beatInBar = 0;
        show._enterMovement('pulse');
        const seen = new Set([show._cue.look]);
        const bars = count => {
            for (let bar = 0; bar < count; bar++) {
                for (let i = 0; i < 4; i++) show._onBeat();
                seen.add(show._cue.look);
            }
        };
        const drawAt = (beat, frames = 90) => {
            club.vjDirector.beatNumber = Math.floor(beat);
            club.barPhase = (beat % 4) / 4;
            for (let frame = 0; frame < frames; frame++) club.updateSpotlights({
                time: 100 + beat / 2, dt: 1 / 60, dtScale: 1,
                audio: { hasAudio: false, bass: 0, mid: 0, treble: 0 }
            });
            return club.spotlights.map(spot => ({
                direction: spot._photoDir.asArray(), level: spot._rigLevel, light: spot._photoIntensity,
                colour: spot._rigColor.asArray(), beam: spot.beamMat.emissiveColor.asArray(),
                lens: spot.lens.material.emissiveColor.asArray(), enabled: spot.light.isEnabled()
            }));
        };
        bars(38);
        const waveCue = show._cue.look;
        const wave = drawAt(0), waveLater = drawAt(4);
        club.scene.render();
        bars(16 + 8 + 4 + 4);
        const conversationCue = show._cue.look;
        const answer = drawAt(4), hold = drawAt(12), rearAnswer = drawAt(20);
        club.scene.render();
        bars(24);
        const chaseCue = show._cue.look, chaseSequence = club.spotSequence;
        show._energy = 0.28;
        show._enterMovement('ascent');
        const buildCue = show._cue.look;
        const fill = [0, 4, 8, 12].map(beat => drawAt(beat));
        club.scene.render();
        club.setPhotosensitiveSafeMode(true);
        for (const spot of club.spotlights) spot._rigLevel = 0;
        const safe = drawAt(8, 120);
        const safeStrobes = club.strobesActive;
        club.masterIntensity = 0;
        const black = drawAt(8, 1);
        return { seen: [...seen], waveCue, wave, waveLater, conversationCue, answer, hold, rearAnswer,
            chaseCue, chaseSequence, buildCue, fill, safe, safeStrobes, black };
    });
    expect(result.waveCue).toBe('rowWave');
    expect(result.conversationCue).toBe('rowConversation');
    expect(result.chaseCue).toBe('sideways');
    expect(result.chaseSequence).toBe(2);
    expect(result.buildCue).toBe('rowBuild');
    expect(result.seen).toContain('theWave');
    expect(result.seen).toContain('deepBlue');
    for (let axis = 0; axis < 3; axis++) expect(result.wave[0].direction[axis]).toBeCloseTo(result.waveLater[1].direction[axis], 7);
    for (let row = 0; row < 3; row++) {
        expect(result.wave[row].direction[0]).toBeCloseTo(-result.wave[row + 3].direction[0], 7);
        expect(result.wave[row].direction[2]).toBeCloseTo(result.wave[row + 3].direction[2], 7);
    }
    for (const head of [1, 4]) {
        expect(result.answer[head].direction).toEqual([0, -1, 0]);
        expect(result.hold[head].direction).toEqual([0, -1, 0]);
        expect(result.rearAnswer[head].direction).toEqual([0, -1, 0]);
        expect(result.answer[head].colour).toEqual([1, 1, 1]);
    }
    expect(result.answer[0].direction).not.toEqual(result.hold[0].direction);
    expect(result.answer[0].direction).toEqual(result.rearAnswer[2].direction);
    for (let step = 0; step < 4; step++) {
        for (let head = 0; head < 6; head++) {
            if (step < 3 && head % 3 <= step) expect(result.fill[step][head].level).toBeGreaterThan(0.99);
            else expect(result.fill[step][head].level).toBe(0);
        }
    }
    expect(result.safeStrobes).toBe(false);
    for (const spot of result.safe) expect(spot.level).toBeLessThanOrEqual(0.45);
    for (const spot of result.black) {
        expect(spot.enabled).toBe(true);
        expect(spot.light).toBe(0);
        expect(spot.lens).toEqual([0, 0, 0]);
        expect(spot.beam).toEqual([0, 0, 0]);
    }
    const previews = await page.evaluate(async () => {
        const club = window.vrClub, show = club.showDirector;
        club.setPhotosensitiveSafeMode(false);
        show.follower = true;
        club.camera.position.set(0, 1.7, -4);
        club.camera.setTarget(new window.BABYLON.Vector3(0, 4.5, -14));
        const images = [];
        for (const name of ['rowWave', 'rowConversation', 'rowBuild']) {
            show._applyCue({ look: name, bars: 16 });
            for (let frame = 0; frame < 24; frame++) {
                club.updateAnimations();
                club.scene.render();
                await new Promise(requestAnimationFrame);
            }
            club.vjDirector.beatNumber = 8;
            club.barPhase = 0;
            for (let frame = 0; frame < 90; frame++) club.updateSpotlights({
                time: 104, dt: 1 / 60, dtScale: 1,
                audio: { hasAudio: false, bass: 0, mid: 0, treble: 0 }
            });
            // SwiftShader can exceed the wall's relight gap; sample its fade at the intended cadence.
            const ledTime = Math.max(performance.now() / 1000, club._ledFadeT || 0);
            for (let frame = 1; frame <= 120; frame++) club.updateLEDWallPass({
                time: ledTime + frame / 60, dt: 1 / 60, dtScale: 1,
                audio: { hasAudio: false, bass: 0, mid: 0, treble: 0 }
            });
            const wallLevel = club.ledPanels.reduce((sum, panel) => {
                const c = panel.material.emissiveColor;
                return sum + c.r + c.g + c.b;
            }, 0) / (club.ledPanels.length * 3);
            club.scene.render();
            images.push({ name, wallLevel, image: club.engine.getRenderingCanvas().toDataURL('image/png').split(',')[1] });
        }
        return images;
    });
    for (const preview of previews) {
        expect(preview.wallLevel).toBeGreaterThan(0.001);
        const path = test.info().outputPath(`${preview.name}.png`);
        await writeFile(path, Buffer.from(preview.image, 'base64'));
        await test.info().attach(preview.name, { path, contentType: 'image/png' });
    }
    await expectHealthyRuntime(page);
});
