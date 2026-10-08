import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * The crowd's choreography in the real club, on the real Babylon animation system. Under SwiftShader a frame takes
 * hundreds of milliseconds, so the clock is stepped by hand: 16 ms a step (scene.useConstantAnimationDeltaTime), the
 * club's update and Babylon's animate() per step, and a steady 124 BPM grid fed in where the choreographer reads the
 * music (with the kick gone for ten seconds in the middle).
 */
test('the crowd dances varied moves locked to the beat, and keeps swaying when the kick is gone', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    await page.waitForFunction(() => window.vrClub.npcAvatars.filter(npc => npc.dance).length >= 4, null, { timeout: 300_000 });

    const setup = await page.evaluate(() => {
        const dancers = window.vrClub.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled());
        return {
            dancers: dancers.length,
            repertoire: Math.min(...dancers.map(npc => npc.dance.groups.size)),
            playing: dancers.map(npc => [...npc.dance.groups.values()].filter(group => group.isPlaying).length),
            moves: dancers.map(npc => npc.dance.state && npc.dance.state.move)
        };
    });
    expect(setup.dancers).toBeGreaterThanOrEqual(4);
    expect(setup.repertoire).toBe(8);
    expect(setup.playing.every(count => count === 1), 'one clip plays per dancer').toBe(true);
    // No music in the harness: nobody dances to a beat that is not there.
    expect(setup.moves.every(move => move === 'Groove_Sway')).toBe(true);

    const run = await page.evaluate(() => {
        const club = window.vrClub, scene = club.scene;
        const { CrowdDance, VRClubAudioCrowd } = window;
        club.engine.stopRenderLoop();
        scene.useConstantAnimationDeltaTime = true;
        let clock = 0;
        const bpm = 124, beatAt = ms => ms / 1000 * bpm / 60;
        const quiet = ms => ms > 30000 && ms < 40000;
        const original = club._crowdMusic.bind(club);
        club._crowdMusic = audio => {
            const music = original(audio);
            music.beatPresent = !quiet(clock); music.bpm = bpm; music.beat = beatAt(clock); music.energy = 0.65;
            return music;
        };
        const dancers = () => club.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled() && npc.dance.state && npc.dance.state.move);
        const stats = {
            worst: 0, sum: 0, n: 0,
            moves: new Set(), presentMoves: new Set(), quietMoves: new Set(), moved: 0
        };
        const pose = () => dancers().map(npc => npc.root.getChildTransformNodes(false).filter(n => n.rotationQuaternion).slice(0, 10)
            .map(n => n.rotationQuaternion.asArray().join(',')).join('|'));
        let before = null, cameraYaw = null;
        for (let i = 0; i < 3000; i++) {
            clock += 16;
            if (i > 300 && !quiet(clock) && clock < 29000) {
                for (const npc of dancers()) {
                    const state = npc.dance.state, meta = CrowdDance.MOVES[state.move];
                    if (meta.free) continue;
                    const k = state.half ? 0.5 : 1;
                    const anchor = state.half && meta.halfAnchor !== undefined ? meta.halfAnchor : meta.anchor;
                    const target = CrowdDance.wrap01((beatAt(clock) * k + anchor) / meta.beats);
                    const frac = VRClubAudioCrowd._loopFraction(npc.dance.current);
                    const error = frac === null ? 99 : Math.abs(CrowdDance.wrapHalf(target - frac)) * meta.beats / k;
                    stats.worst = Math.max(stats.worst, error); stats.sum += error; stats.n++;
                }
            }
            club.updateAnimations();
            scene.animate();
            for (const npc of dancers()) {
                const move = npc.dance.state.move;
                if (!quiet(clock)) stats.presentMoves.add(move);
                (quiet(clock - 1000) && quiet(clock) ? stats.quietMoves : stats.moves).add(move);
            }
            if (i === 1000) {
                const camera = scene.activeCamera;
                cameraYaw = camera.rotation.y;
                camera.rotation.y += Math.PI;
                before = pose();
            }
            if (i === 1010) {
                stats.moved = pose().filter((p, index) => p !== before[index]).length;
                scene.activeCamera.rotation.y = cameraYaw;
            }
        }
        scene.useConstantAnimationDeltaTime = false;
        club._crowdMusic = original;
        club.engine.runRenderLoop(() => scene.render());
        return {
            worst: stats.worst, mean: stats.sum / stats.n, samples: stats.n, dancers: dancers().length,
            moves: [...stats.moves], presentMoves: [...stats.presentMoves],
            quietMoves: [...stats.quietMoves], moved: stats.moved
        };
    });
    console.log('CROWD_DANCE', JSON.stringify(run));
    expect(run.samples).toBeGreaterThan(1000);
    // On the beat: the mean phase error is a fraction of a frame, the worst well under a tenth of a beat.
    expect(run.mean).toBeLessThan(0.01);
    expect(run.worst).toBeLessThan(0.08);
    // Varied: over half a minute the floor does many different moves, claps included or not by chance, but not one dance.
    expect(run.moves.filter(move => move !== 'Groove_Sway').length).toBeGreaterThanOrEqual(4);
    expect(run.presentMoves, 'a dancer chose the free sway while the kick was present').not.toContain('Groove_Sway');
    // With the kick gone they all keep swaying; nobody freezes or dances on.
    expect(run.quietMoves.length).toBeGreaterThan(0);
    expect(run.quietMoves.every(move => move === 'Groove_Sway')).toBe(true);
    expect(run.moved, 'every dancer keeps moving while behind the camera').toBe(run.dancers);
    await expectHealthyRuntime(page);
});

/**
 * The one guest who walks the room, in the real club: he leaves his spot, walks a clear path, stops with somebody and
 * they both talk, he gets a drink from the bartender, and his collider and contact shadow come with him.
 */
test('a side guest walks the room and stops to talk to the people standing in it', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    // The harness runs `balanced`, which shows two guests; the walking guest is the third.
    await page.evaluate(() => window.vrClub.setGraphicsTier('ultra'));
    await page.waitForFunction(() => window.vrClub._mingler && window.vrClub._mingler.root
        && window.vrClub._mingler.root.isEnabled(), null, { timeout: 300_000 });

    const run = await page.evaluate(() => {
        const club = window.vrClub, scene = club.scene;
        club.engine.stopRenderLoop();
        scene.useConstantAnimationDeltaTime = true;
        const npc = club._mingler;
        // Everybody standing on the floor (the mezzanine guest is up at y 3 and cannot be walked into).
        const others = club.npcAvatars.filter(a => a !== npc && a.root && a.root.isEnabled() && a.root.position.y < 1);
        const playing = person => {
            const groups = person.poses ? [...person.poses.groups.values()] : (person.animations || []);
            const live = groups.filter(group => group.isPlaying);
            return { count: live.length, name: live.length ? live[0].name : null };
        };
        // Babylon prefixes an instantiated group's name with the container's root name.
        const is = (name, clip) => !!name && (name === clip || name.endsWith(`_${clip}`));
        const out = {
            start: { x: npc.root.position.x, z: npc.root.position.z }, walked: 0, maxFromStart: 0,
            clips: new Set(), talkedWith: new Set(), bothTalking: 0, drankAtBar: 0, cupVisible: false,
            drinkStages: new Set(), servedOnCounter: false, pickedUp: false, returnedToCounter: false, clearedByBartender: false,
            washingAfterClear: false, glassLeftAHand: false,
            serverCounterGap: 99, pickupCounterGap: 99, returnCounterGap: 99, mouthGap: 99,
            soloActivities: new Set(), smokeVisible: false, watchFacingFloor: false, balconyFacingFloor: false,
            maxY: npc.root.position.y, maxZ: npc.root.position.z,
            soloClip: true, closest: 99, others: others.length, colliderOff: 0, shadowOff: 0
        };
        let last = { x: npc.root.position.x, z: npc.root.position.z };
        const shadows = club._contactShadows;
        // Every dwell at the middle of its range, so a whole round (about five minutes) fits the run.
        const random = Math.random;
        Math.random = () => 0.5;
        out.smoke = { lips: 99, glow: 0, exhale: false, wisp: false, burnt: 1 };
        out.rail = { frames: 0, worst: 0, talkedHere: false, partnerTalks: false };
        out.steps = 0;
        for (let i = 0; i < 21000; i++) {   // ~5.6 simulated minutes: the whole round, from his home spot to the balcony
            club.updateAnimations();
            scene.animate();
            out.steps++;
            const pos = npc.root.position;
            out.walked += Math.hypot(pos.x - last.x, pos.z - last.z);
            last = { x: pos.x, z: pos.z };
            out.maxFromStart = Math.max(out.maxFromStart, Math.hypot(pos.x - out.start.x, pos.z - out.start.z));
            out.maxY = Math.max(out.maxY, pos.y);
            out.maxZ = Math.max(out.maxZ, pos.z);
            const mine = playing(npc);
            if (mine.name) out.clips.add(mine.name);
            if (mine.count !== 1) out.soloClip = false;
            if (is(mine.name, 'Walk')) out.walkFrames = (out.walkFrames || 0) + 1;
            for (const other of others) {
                out.closest = Math.min(out.closest, Math.hypot(pos.x - other.root.position.x, pos.z - other.root.position.z));
            }
            const partner = npc.mingle.partner;
            if (npc.mingle.phase === 'dwell' && ['watch', 'smoke', 'balcony'].includes(npc.mingle.activity)) {
                out.soloActivities.add(npc.mingle.activity);
                const targetYaw = Math.atan2(-pos.x, -12 - pos.z);
                const off = Math.abs(Math.atan2(Math.sin(targetYaw - npc.root.rotation.y), Math.cos(targetYaw - npc.root.rotation.y)));
                if (npc.mingle.activity === 'watch') out.watchFacingFloor ||= off < 0.2;
                if (npc.mingle.activity === 'balcony') out.balconyFacingFloor ||= off < 0.2;
                if (npc.mingle.activity === 'smoke') {
                    out.smokeVisible ||= !!(npc.smokeProp && npc.smokeProp.isEnabled());
                    const s = npc.smoke;
                    if (s && s.visible) {
                        out.smoke.lips = Math.min(out.smoke.lips, BABYLON.Vector3.Distance(s.filter, s.mouthPos));
                        out.smoke.glow = Math.max(out.smoke.glow, s.glow);
                        out.smoke.exhale ||= !!(s.exhale && s.exhale.emitRate > 0);
                        out.smoke.wisp ||= !!(s.wisp && s.wisp.isStarted() && s.wisp.emitRate > 0);
                        out.smoke.burnt = Math.min(out.smoke.burnt, s.cigarette.scaling.y / s.baseScaleY);
                    }
                }
                if (npc.mingle.activity === 'balcony') {
                    // Both hands on the deck rail (x -9.54, top 3 + 1.08), once he has turned to it and settled in.
                    const dt = Math.min(4, Math.max(0.25, club.engine.getDeltaTime() / 16.667)) / 60;
                    out.rail.seconds = (out.rail.seconds || 0) + dt;
                    out.rail.frames++;
                    if (npc.mingle.duration - npc.mingle.timer > 2.5) {
                        for (const side of ['Wrist.L', 'Wrist.R']) {
                            const wrist = npc.root.getChildTransformNodes(false).find(node => node.name.endsWith(side));
                            const p = wrist.computeWorldMatrix(true).getTranslation();
                            out.rail.worst = Math.max(out.rail.worst, Math.abs(p.x + 9.54), Math.abs(p.y - 4.08));
                        }
                    }
                }
            }
            if (partner && npc.mingle.phase === 'dwell' && partner.root.position.y > 2.5) {
                out.rail.talkedHere = true;
                out.rail.partnerTalks ||= is(playing(partner).name, 'Idle_Talking_Loop') && is(mine.name, 'Idle_Talking_Loop');
            }
            if (partner && npc.mingle.phase === 'dwell') {
                out.talkedWith.add(partner.name);
                if (is(mine.name, 'Idle_Talking_Loop') && is(playing(partner).name, 'Idle_Talking_Loop')) out.bothTalking++;
                if (partner.name === 'bartender' && is(mine.name, 'Drink_Loop')) {
                    out.drankAtBar++;
                    out.cupVisible ||= !!(npc.drinkCup && npc.drinkCup.isEnabled());
                }
                if (partner.name === 'bartender') {
                    out.drinkStages.add(npc.mingle.activity);
                    const cup = npc.drinkCup, counter = npc.drinkCounter;
                    const glass = club._barGlass;
                    if (cup && counter && npc.drinkMode === 'counter') {
                        const onCounter = Math.hypot(cup.position.x - counter.x, cup.position.y - counter.y, cup.position.z - counter.z) < 0.01;
                        if (npc.mingle.activity === 'served') out.servedOnCounter ||= onCounter;
                        if (npc.mingle.activity === 'returned') out.returnedToCounter ||= onCounter;
                    }
                    out.pickedUp ||= npc.drinkMode === 'hand';
                    out.clearedByBartender ||= npc.drinkMode === 'clear';
                    if (cup && glass) {
                        const atServer = Math.hypot(cup.position.x - glass.serverPosition.x,
                            cup.position.y - glass.serverPosition.y, cup.position.z - glass.serverPosition.z);
                        const atCounter = Math.hypot(cup.position.x - counter.x,
                            cup.position.y - counter.y, cup.position.z - counter.z);
                        const atMingler = Math.hypot(cup.position.x - glass.handPosition.x,
                            cup.position.y - glass.handPosition.y, cup.position.z - glass.handPosition.z);
                        out.glassLeftAHand ||= Math.min(atServer, atCounter, atMingler) > 0.01;
                        if (npc.mingle.activity === 'serve' || npc.mingle.activity === 'clear') {
                            const gap = Math.hypot(glass.serverPosition.x - counter.x,
                                glass.serverPosition.y - counter.y, glass.serverPosition.z - counter.z);
                            out.serverCounterGap = Math.min(out.serverCounterGap, gap);
                        }
                        if (npc.mingle.activity === 'pickup' && atMingler + atCounter < out.pickupCounterGap) {
                            out.pickupCounterGap = atMingler + atCounter;
                        }
                        if (npc.mingle.activity === 'return' && atMingler + atCounter < out.returnCounterGap) {
                            out.returnCounterGap = atMingler + atCounter;
                        }
                        if (npc.mingle.activity === 'drink') {
                            const head = npc.root.getChildTransformNodes(false).find(node => /Head$/.test(node.name));
                            if (head) {
                                head.computeWorldMatrix(true);
                                const hp = head.absolutePosition;
                                const gap = Math.hypot(cup.position.x - hp.x, cup.position.y - hp.y, cup.position.z - hp.z);
                                out.mouthGap = Math.min(out.mouthGap, gap);
                            }
                        }
                    }
                }
            }
            if (out.clearedByBartender && !partner && npc.drinkMode === 'wash') {
                const glass = club._barGlass;
                out.washingAfterClear ||= !!(glass && glass.mesh.isEnabled()
                    && Math.hypot(glass.mesh.position.x - glass.serverPosition.x,
                        glass.mesh.position.y - glass.serverPosition.y,
                        glass.mesh.position.z - glass.serverPosition.z) < 0.01
                    && glass.bartender.rig && glass.bartender.rig.ok);
            }
            if (npc.collider) {
                out.colliderOff = Math.max(out.colliderOff,
                    Math.hypot(npc.collider.position.x - pos.x, npc.collider.position.y - (pos.y + 0.85),
                        npc.collider.position.z - pos.z));
            }
            if (shadows && npc._shadowIndex >= 0) {
                const base = npc._shadowIndex * 16;
                out.shadowOff = Math.max(out.shadowOff,
                    Math.hypot(shadows.buffer[base + 12] - pos.x, shadows.buffer[base + 13] - (pos.y + 0.02),
                        shadows.buffer[base + 14] - pos.z));
            }
        }
        scene.useConstantAnimationDeltaTime = false;
        Math.random = random;
        club.engine.runRenderLoop(() => scene.render());
        return {
            ...out,
            clips: [...out.clips],
            talkedWith: [...out.talkedWith],
            drinkStages: [...out.drinkStages],
            soloActivities: [...out.soloActivities]
        };
    });
    console.log('MINGLER', JSON.stringify(run));
    expect(run.walked, 'he never left his spot').toBeGreaterThan(5);
    expect(run.maxFromStart).toBeGreaterThan(2);
    expect(run.walkFrames, 'he never played the walk clip').toBeGreaterThan(0);
    expect(run.soloClip, 'only one clip plays on him at a time').toBe(true);
    expect(run.talkedWith.length, 'he never stopped to talk to anybody').toBeGreaterThan(0);
    expect(run.bothTalking, 'he and the person he stopped at never both talked').toBeGreaterThan(0);
    expect(run.talkedWith, 'he never interacted with the bartender').toContain('bartender');
    expect(run.drankAtBar, 'he never played his drink animation at the bar').toBeGreaterThan(0);
    expect(run.cupVisible, 'his cup was not visible while he drank').toBe(true);
    expect(run.drinkStages).toEqual(['order', 'serve', 'served', 'pickup', 'drink', 'return', 'returned', 'clear']);
    expect(run.servedOnCounter, 'the bartender never placed the glass on the counter').toBe(true);
    expect(run.pickedUp, 'he never picked the glass up from the counter').toBe(true);
    expect(run.returnedToCounter, 'he never returned the glass to the counter').toBe(true);
    expect(run.clearedByBartender, 'the bartender never removed the returned glass').toBe(true);
    expect(run.washingAfterClear, 'the bartender did not resume washing the glass after clearing it').toBe(true);
    expect(run.glassLeftAHand, 'the glass flew independently instead of staying in a hand or on the counter').toBe(false);
    expect(run.serverCounterGap, 'the bartender never brought her hand to the counter').toBeLessThan(0.12);
    expect(run.pickupCounterGap, 'his hand never reached the glass before pickup').toBeLessThan(0.12);
    expect(run.mouthGap, 'he never brought the glass to his mouth').toBeLessThan(0.12);
    expect(run.returnCounterGap, 'his hand never returned the glass to the counter').toBeLessThan(0.12);
    expect(run.soloActivities).toEqual(['watch', 'smoke', 'balcony']);
    expect(run.watchFacingFloor, 'his indoor idle faces away from the dance floor').toBe(true);
    expect(run.smokeVisible, 'his cigarette was not visible while he smoked outside').toBe(true);
    expect(run.smoke.lips, 'the filter never reached his lips').toBeLessThan(0.03);
    expect(run.smoke.glow, 'the tip never glowed on a drag').toBeGreaterThan(0.8);
    expect(run.smoke.exhale, 'he never blew out smoke after a drag').toBe(true);
    expect(run.smoke.wisp, 'no smoke rose from the tip').toBe(true);
    expect(run.smoke.burnt, 'the cigarette never burned down').toBeLessThan(0.75);
    expect(run.rail.seconds, 'he never leaned on the balcony rail').toBeGreaterThan(20);
    expect(run.rail.worst, 'his hands were not on the balcony rail').toBeLessThan(0.08);
    expect(run.rail.talkedHere && run.rail.partnerTalks, 'he never talked with the woman at the rail').toBe(true);
    // He lingers: more of the round is spent with people than walking between them.
    expect(run.walkFrames / run.steps, 'he spends most of his time walking').toBeLessThan(0.45);
    expect(run.balconyFacingFloor, 'his balcony idle faces away from the dance floor').toBe(true);
    expect(run.maxZ, 'he never walked outside').toBeGreaterThan(7);
    expect(run.maxY, 'he never climbed to street or balcony level').toBeGreaterThan(2.9);
    expect(run.others, 'nobody else was on the floor to measure against').toBeGreaterThan(10);
    // He walks between people, never through them.
    expect(run.closest).toBeGreaterThan(0.5);
    // His collider and contact shadow come with him; a left-behind collider is an invisible wall.
    expect(run.colliderOff).toBeLessThan(0.01);
    expect(run.shadowOff).toBeLessThan(0.01);
    await page.evaluate(() => window.vrClub.setGraphicsTier('balanced'));
    await expectHealthyRuntime(page);
});
