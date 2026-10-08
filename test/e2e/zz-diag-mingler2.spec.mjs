import { test } from '@playwright/test';
import { enterClub, useQuestHarness } from './support.mjs';

useQuestHarness();

/** Fixed 60 Hz simulation (club, animations and particles), so slow software frames do not distort it. */
const fixClock = page => page.evaluate(() => {
    const club = window.vrClub, scene = club.scene;
    club.engine.getDeltaTime = () => 16.667;
    scene.getAnimationRatio = () => 1;
    scene.useConstantAnimationDeltaTime = true;
    Math.random = () => 0.5;
});

const stepUntil = (page, predicate, max = 40000) => page.evaluate(({ src, max }) => {
    const club = window.vrClub, scene = club.scene;
    const until = new Function('club', 'npc', `return (${src});`);
    club.engine.stopRenderLoop();
    let i = 0;
    for (; i < max && !until(club, club._mingler); i++) {
        club.updateAnimations();
        scene.animate();
        for (const ps of scene.particleSystems) if (ps.name.startsWith('mingler') && ps.isStarted()) ps.animate();
    }
    club.engine.runRenderLoop(club._renderLoop);
    return i;
}, { src: predicate, max });

const shoot = async (page, name, eye, target) => {
    await page.evaluate(({ eye, target }) => {
        const club = window.vrClub, cam = club.camera;
        club.engine.stopRenderLoop();
        cam.position.set(...eye);
        cam.setTarget(new BABYLON.Vector3(...target));
        club._walkLevel = eye[1] - 1.7;
        club.engine.runRenderLoop(club._renderLoop);
    }, { eye, target });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.vrClub.engine.stopRenderLoop());
    await page.screenshot({ path: `test-results/${name}.png` });
    await page.evaluate(() => window.vrClub.engine.runRenderLoop(window.vrClub._renderLoop));
};

test('diag mingler visuals', async ({ page }) => {
    test.setTimeout(1_800_000);
    await enterClub(page);
    await page.evaluate(() => window.vrClub.setGraphicsTier('ultra'));
    await page.waitForFunction(() => window.vrClub._mingler && window.vrClub._mingler.root.isEnabled(), null, { timeout: 300_000 });
    await fixClock(page);
    console.log('steps to smoke', await stepUntil(page, "npc.mingle.activity === 'smoke' && npc.mingle.duration - npc.mingle.timer > 3"));
    const p = await page.evaluate(() => { const r = window.vrClub._mingler.root; return [r.position.x, r.position.y, r.position.z]; });
    // He faces +x; stand 1.3 m in front of him, a little to one side.
    const eye = [p[0] + 1.25, p[1] + 1.65, p[2] - 0.45], target = [p[0], p[1] + 1.45, p[2]];
    console.log('steps to drag', await stepUntil(page, 'npc.smoke.wasNear && npc.smoke.glow > 0.85'));
    await shoot(page, 'diag-smoke-drag', eye, target);
    console.log('steps to exhale', await stepUntil(page, 'npc.smoke.exhaleLeft > 0 && npc.smoke.exhaleLeft < 0.6'));
    console.log('particles', await page.evaluate(() => {
        const s = window.vrClub._mingler.smoke;
        const info = ps => ({
            name: ps.name, active: ps.getActiveCount(), started: ps.isStarted(), ready: ps.isReady(), rate: ps.emitRate,
            emitter: ps.emitter.asArray().map(v => +v.toFixed(2)), layerMask: ps.layerMask, group: ps.renderingGroupId,
            sample: (ps.particles || []).slice(0, 3).map(p => ({ pos: p.position.asArray().map(v => +v.toFixed(2)), size: +p.size.toFixed(3), a: +p.color.a.toFixed(3), age: +p.age.toFixed(2) }))
        });
        return JSON.stringify({ mouth: s.mouthPos.asArray().map(v => +v.toFixed(2)), wisp: info(s.wisp), exhale: info(s.exhale), fogTex: !!window.vrClub._fogParticleTexture && window.vrClub._fogParticleTexture.isReady() });
    }));
    await shoot(page, 'diag-smoke-exhale', eye, target);
    await shoot(page, 'diag-smoke-exhale-side', [p[0] + 0.4, p[1] + 1.7, p[2] + 1.4], [p[0], p[1] + 1.6, p[2]]);
    console.log('steps to rest', await stepUntil(page, '!npc.smoke.wasNear && npc.smoke.exhaleLeft <= 0 && npc.smoke.exhaleIn <= 0 && npc.smoke.glow < 0.4'));
    await shoot(page, 'diag-smoke-rest', eye, target);
    console.log('steps to rail', await stepUntil(page, "npc.mingle.activity === 'balcony' && npc.mingle.duration - npc.mingle.timer > 4"));
    const q = await page.evaluate(() => { const r = window.vrClub._mingler.root; return [r.position.x, r.position.y, r.position.z]; });
    await shoot(page, 'diag-rail', [q[0] - 0.5, q[1] + 1.65, q[2] + 1.9], [q[0] + 0.3, q[1] + 1.1, q[2] - 0.5]);
    console.log('steps to talk', await stepUntil(page, "npc.mingle.activity === 'talk' && npc.mingle.partner && npc.mingle.duration - npc.mingle.timer > 4"));
    await shoot(page, 'diag-talk', [q[0] - 0.35, q[1] + 1.65, q[2] + 1.9], [q[0], q[1] + 1.45, q[2] - 0.5]);
});
