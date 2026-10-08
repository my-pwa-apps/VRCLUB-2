import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

/**
 * The crowd's choreography in the real club, on the real Babylon animation system. Under SwiftShader a frame takes
 * hundreds of milliseconds, so the clock is stepped by hand: 16 ms a step (scene.useConstantAnimationDeltaTime), the
 * club's update and Babylon's animate() per step, and a steady 124 BPM grid fed in where the choreographer reads the
 * music (with the kick gone for ten seconds in the middle).
 */
test('the crowd dances varied moves locked to the beat, and sways or stands when the kick is gone', async ({ page }) => {
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
    expect(setup.repertoire).toBe(9);
    expect(setup.playing.every(count => count === 1), 'one clip plays per dancer').toBe(true);
    // No music in the harness: nobody dances to a beat that is not there.
    expect(setup.moves.every(move => move === 'Groove_Sway' || move === 'Groove_Still')).toBe(true);

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
        const stats = { worst: 0, sum: 0, n: 0, moves: new Set(), quietMoves: new Set(), moved: 0 };
        const pose = () => dancers().map(npc => npc.root.getChildTransformNodes(false).filter(n => n.rotationQuaternion).slice(0, 10)
            .map(n => n.rotationQuaternion.asArray().join(',')).join('|'));
        let before = null;
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
            for (const npc of dancers()) (quiet(clock - 1000) && quiet(clock) ? stats.quietMoves : stats.moves).add(npc.dance.state.move);
            if (i === 1000) before = pose();
            if (i === 1010) stats.moved = pose().filter((p, index) => p !== before[index]).length;
        }
        scene.useConstantAnimationDeltaTime = false;
        club._crowdMusic = original;
        club.engine.runRenderLoop(() => scene.render());
        return {
            worst: stats.worst, mean: stats.sum / stats.n, samples: stats.n, dancers: dancers().length,
            moves: [...stats.moves], quietMoves: [...stats.quietMoves], moved: stats.moved
        };
    });
    console.log('CROWD_DANCE', JSON.stringify(run));
    expect(run.samples).toBeGreaterThan(1000);
    // On the beat: the mean phase error is a fraction of a frame, the worst well under a tenth of a beat.
    expect(run.mean).toBeLessThan(0.01);
    expect(run.worst).toBeLessThan(0.08);
    // Varied: over half a minute the floor does many different moves, claps included or not by chance, but not one dance.
    expect(run.moves.filter(move => move !== 'Groove_Sway' && move !== 'Groove_Still').length).toBeGreaterThanOrEqual(4);
    // With the kick gone they sway or stand; nobody dances on.
    expect(run.quietMoves.length).toBeGreaterThan(0);
    expect(run.quietMoves.every(move => move === 'Groove_Sway' || move === 'Groove_Still')).toBe(true);
    expect(run.moved, 'every dancer is moving').toBe(run.dancers);
    await expectHealthyRuntime(page);
});
