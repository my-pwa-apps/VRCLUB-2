import { test, expect } from '@playwright/test';
import { enterClub, enterVR, useQuestHarness } from './support.mjs';

useQuestHarness();

// Representative scenarios, measured with the club's own frame recorder (js/frameStats.js).
// These run on the CI browser's software GL (SwiftShader), so the frame times are REGRESSION EVIDENCE for the relative
// cost of a scenario and of a change, not a prediction of desktop-GPU or Quest performance. Run on hardware by pointing
// the same `getPerformanceReport()` at a real headset. The report is printed as PERF_SCENARIOS for before/after comparison.
const TIER = process.env.PERF_TIER || 'balanced';
const SECONDS = Number(process.env.PERF_SECONDS || 8);

const FIXTURES = ['lightsActive', 'lasersActive', 'laserSheetActive', 'mirrorBallActive', 'ledWallActive', 'strobesActive', 'smokeActive'];

const runScenarios = page => page.evaluate(async ({ tier, seconds, fixtures }) => {
    const club = window.vrClub;
    await club.modelLoadPromise;
    club.setGraphicsTier(tier);
    // Software GL renders a frame in 100-500 ms; a real device never gets near this cut-off.
    if (club._frameStats) club._frameStats.stallMs = 3000;
    const frame = () => new Promise(resolve => club.scene.onAfterRenderObservable.addOnce(resolve));
    const measure = async (name, setup) => {
        setup();
        for (let i = 0; i < 90; i++) await frame();          // settle: shaders, ramps, animation blends
        club.resetFrameStats();
        const end = performance.now() + seconds * 1000;
        while (performance.now() < end) await frame();
        return { name, ...club.getPerformanceReport() };
    };
    const fixturesOff = () => { club.takeLightControl(); for (const f of fixtures) if (club[f]) club.toggleLightControl(f); };
    const showOn = () => { club.resumeAutoShow(); for (const f of fixtures) if (!club[f]) club.toggleLightControl(f); club.resumeAutoShow(); };
    const results = [];
    results.push(await measure('1 empty club', () => { club.setPeopleVisible('all', false); fixturesOff(); }));
    results.push(await measure('2 lighting and atmosphere', () => { club.setPeopleVisible('all', false); showOn(); }));
    results.push(await measure('3 crowded floor', () => { club.setPeopleVisible('all', true); fixturesOff(); }));
    results.push(await measure('4 crowded floor, show at its peak', () => {
        club.setPeopleVisible('all', true); showOn();
        if (club.showDirector && club.showDirector.isDriving()) club.showDirector.triggerShowDrop();
    }));
    return results;
}, { tier: TIER, seconds: SECONDS, fixtures: FIXTURES });

const brief = r => ({
    scenario: r.name, mode: r.mode, tier: r.tier, frames: r.time.frames, budgetMs: r.time.budgetMs, meanMs: r.time.meanFrameMs,
    p95: r.time.p95, p99: r.time.p99, missedPct: Math.round(r.time.missedShare * 100), updateMs: r.time.updateMeanMs,
    submitMs: r.time.submitMeanMs, draws: r.drawCalls, tris: r.activeTriangles, bones: r.activeBones, lights: r.enabledLights,
    rts: r.renderTargets, heapMB: r.jsHeapMB
});

test('desktop scenarios: empty club, lighting, crowd, crowd with the show at its peak', async ({ page }) => {
    test.setTimeout(900_000);
    await enterClub(page);
    const results = (await runScenarios(page)).map(brief);
    console.log('PERF_SCENARIOS_DESKTOP', JSON.stringify(results));
    for (const r of results) expect(r.frames, r.scenario).toBeGreaterThan(5);
});

test('VR (Quest emulator) scenarios: the same four', async ({ page }) => {
    test.setTimeout(1_200_000);
    await enterClub(page);
    await enterVR(page);
    const results = (await runScenarios(page)).map(brief);
    console.log('PERF_SCENARIOS_XR', JSON.stringify(results));
    for (const r of results) { expect(r.frames, r.scenario).toBeGreaterThan(5); expect(r.mode).toBe('xr'); }
});
