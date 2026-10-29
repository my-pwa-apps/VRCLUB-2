import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

// Street people animate only while they could matter: held when clearly behind the viewer, resumed from the same frame long
// before they come into view, and never held while inside the camera's real frustum. Their raw `Idle` clip also loses its
// finger channels (108 -> 40).
test('street people are held behind you, never frozen in view, and resume without a jump', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const result = await page.evaluate(async () => {
        const club = window.vrClub, scene = club.scene, camera = club.camera;
        await club.modelLoadPromise;
        const frame = () => new Promise(resolve => scene.onAfterRenderObservable.addOnce(resolve));
        const street = () => club.npcAvatars.filter(npc => npc.street);
        const deadline = performance.now() + 120000;
        while (street().length < 5 && performance.now() < deadline) await frame();
        const people = street();
        const out = { count: people.length, names: people.map(n => n.name) };
        out.idleChannels = people.filter(n => n.name === 'queue2' || n.name === 'queue3')
            .map(n => n.animations[0].targetedAnimations.length);

        // Standing in the club, forward of the street's show line, with the street behind.
        camera.position.set(0, 1.7, -4);
        camera.rotation.set(0, Math.PI, 0);
        for (let i = 0; i < 20; i++) await frame();
        out.enabledBehind = people.map(n => n.root.isEnabled());
        out.playingBehind = people.map(n => n.animations.some(g => g.isPlaying));

        const playing = n => n.animations.some(g => g.isPlaying);
        const masterOf = n => { const a = n.animations[0]._animatables && n.animations[0]._animatables[0]; return a ? a.masterFrame : null; };
        const planes = [0, 1, 2, 3, 4, 5].map(() => new BABYLON.Plane(0, 0, 0, 0));
        const inView = n => {
            BABYLON.Frustum.GetPlanesToRef(scene.getTransformMatrix(), planes);
            const p = n.root.position;
            return [0.1, 0.9, 1.7].some(h => BABYLON.Frustum.IsPointInFrustum(new BABYLON.Vector3(p.x, p.y + h, p.z), planes));
        };
        // Turn through a full circle quickly (12 degrees a frame), checking after every render.
        const frozenInView = [];
        const jumps = [];
        const last = new Map();
        const history = new Map();
        const pausedFrameMs = new Map();
        let resumes = 0;
        for (let step = 0; step < 90; step++) {
            camera.rotation.y = Math.PI + step * (12 * Math.PI / 180);
            await frame();
            for (const n of people) {
                const now = { playing: playing(n), master: masterOf(n), at: performance.now() };
                if (inView(n) && !now.playing) frozenInView.push({ name: n.name, step });
                const before = last.get(n.name);
                if (before && before.playing && !now.playing) pausedFrameMs.set(n.name, now.at - before.at);
                if (before && !before.playing && now.playing) {
                    resumes++;
                    if (before.master !== null && now.master !== null) {
                        const group = n.animations[0];
                        const span = group.to - group.from || 1;
                        const fps = group.targetedAnimations[0].animation.framePerSecond;
                        // Allow what the wall clock advanced over the resume frame, plus Babylon's own one-frame bookkeeping
                        // slack: a clip resumes as if it had run through the frame in which it was paused. That frame is ~14 ms on a
                        // headset (under one animation frame) but 0.5-1.5 s on this software-GL emulator, hence measuring it.
                        // A restart that jumped, or lost the held frame, would still show up as the excess.
                        const allowed = ((now.at - before.at) + (pausedFrameMs.get(n.name) || 0)) / 1000 * fps * group.speedRatio + 2;
                        let delta = Math.abs(now.master - before.master);
                        delta = Math.min(delta, span - delta);   // the clip loops
                        const excess = delta - allowed;
                        jumps.push(excess);
                        if (!out.worst || excess > out.worst.excess) {
                            out.worst = { name: n.name, excess, before: before.master, after: now.master, ms: now.at - before.at, fps, speed: group.speedRatio, span,
                                history: (history.get(n.name) || []).slice(-5) };
                        }
                    }
                }
                last.set(n.name, now);
                const h = history.get(n.name) || [];
                h.push([step, now.playing, Math.round(now.master * 10) / 10, Math.round(now.at)]);
                history.set(n.name, h);
            }
        }
        out.frozenInView = frozenInView;
        out.resumes = resumes;
        out.maxJump = jumps.length ? Math.max(...jumps) : null;

        // Facing the street, everyone is playing; right beside them, nobody is ever held.
        camera.rotation.y = 0;
        for (let i = 0; i < 10; i++) await frame();
        out.playingFacing = people.map(playing);
        camera.position.set(3.5, 1.7, 5.5);
        camera.rotation.y = Math.PI;
        for (let i = 0; i < 10; i++) await frame();
        out.playingBeside = people.map(playing);
        return out;
    });
    expect(result.count).toBe(5);
    expect(result.idleChannels.length).toBe(2);
    for (const channels of result.idleChannels) {
        expect(channels, 'the raw Idle clip lost its finger channels').toBeLessThanOrEqual(40);
        expect(channels).toBeGreaterThan(20);
    }
    expect(result.enabledBehind, 'held people are still there, only not animating').toEqual([true, true, true, true, true]);
    expect(result.playingBehind, 'behind the viewer and far away they are held').toEqual([false, false, false, false, false]);
    expect(result.frozenInView, 'nobody inside the camera frustum may be frozen').toEqual([]);
    expect(result.resumes, 'they did resume as the viewer turned').toBeGreaterThan(0);
    expect(result.maxJump, `resuming continues from the frame it stopped on (excess over the wall-clock advance): ${JSON.stringify(result.worst)}`).toBeLessThan(1);
    expect(result.playingFacing).toEqual([true, true, true, true, true]);
    expect(result.playingBeside, 'close people always animate').toEqual([true, true, true, true, true]);
    await expectHealthyRuntime(page);
});
