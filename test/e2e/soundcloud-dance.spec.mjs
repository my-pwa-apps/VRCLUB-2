import { test, expect } from '@playwright/test';
import { enterClub, expectHealthyRuntime, useQuestHarness } from './support.mjs';

useQuestHarness();

test('official-player playback events drive real crowd and DJ skeletons, but selection and pause do not', async ({ page }) => {
    test.setTimeout(600_000);
    const requests = [];
    page.on('request', request => {
        if (request.url().startsWith('https://w.soundcloud.com/')) requests.push(request.url());
    });
    // Exercise the official API boundary without depending on a third-party set's availability or adverts.
    await page.route('https://w.soundcloud.com/player/api.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: `window.SC = { Widget: function (frame) {
            const handlers = new Map();
            const listener = event => {
                if (event.origin === 'https://w.soundcloud.com' && event.source === frame.contentWindow)
                    handlers.get(event.data)?.();
            };
            addEventListener('message', listener);
            return {
                bind: (name, callback) => handlers.set(name, callback),
                unbind: name => { handlers.delete(name); if (!handlers.size) removeEventListener('message', listener); },
                isPaused: callback => callback(true)
            };
        }};
        SC.Widget.Events = Object.fromEntries(['READY','PLAY','PLAY_PROGRESS','PAUSE','FINISH','ERROR'].map(name => [name,name]));`
    }));
    await page.route('https://w.soundcloud.com/player/?**', route => route.fulfill({
        contentType: 'text/html',
        body: `<button onclick="parent.postMessage('PLAY', '*')">Play</button>
            <button onclick="parent.postMessage('PAUSE', '*')">Pause</button>
            <button onclick="parent.postMessage('FINISH', '*')">Finish</button>`
    }));
    await enterClub(page);
    expect(requests).toEqual([]);
    await page.waitForFunction(() => window.vrClub._djRig?.ok &&
        window.vrClub.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled()).length >= 4,
    null, { timeout: 300_000 });
    await page.evaluate(() => window.vrClub.startSoundCloud('https://soundcloud.com/example/set'));
    expect(requests.filter(url => url.endsWith('/api.js'))).toHaveLength(1);
    expect(await page.evaluate(() => window.vrClub.getPlaybackInfo().playing)).toBe(false);
    expect(await page.evaluate(() => window.vrClub._unanalysedDanceMusic())).toBeNull();
    // The official player remains in Music, even when that panel is closed.
    await page.frameLocator('#soundCloudPlayer iframe').getByRole('button', { name: 'Play', exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => window.vrClub._soundCloudPlaying);

    const result = await page.evaluate(() => {
        const club = window.vrClub, scene = club.scene;
        club.engine.stopRenderLoop();
        scene.useConstantAnimationDeltaTime = true;
        const originalNow = performance.now.bind(performance);
        let clock = originalNow();
        performance.now = () => clock;
        const dancers = club.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled());
        const pose = root => root.getChildTransformNodes(false).filter(node => node.rotationQuaternion)
            .map(node => node.rotationQuaternion.asArray().join(',')).join('|');
        const before = dancers.map(npc => pose(npc.root));
        const djBefore = pose(club._djRig.root);
        const moves = new Set();
        const oldKicks = club.vjDirector.realOnsetCount;
        try {
            for (let frame = 0; frame < 1800; frame++) {
                clock += 1000 / 60;
                club._updateCrowdDance(1 / 60, { hasAudio: false });
                club._updateDJ(1 / 60, { hasAudio: false });
                scene.animate();
                for (const npc of dancers) moves.add(npc.dance.state.move);
            }
            return {
                moves: [...moves],
                moved: dancers.filter((npc, index) => pose(npc.root) !== before[index]).length,
                djMoved: pose(club._djRig.root) !== djBefore,
                djAudio: club._djMusic.hasAudio,
                djEnergy: club._djMusic.energy,
                fabricatedKicks: club.vjDirector.realOnsetCount - oldKicks,
                playingGroups: dancers.map(npc => [...npc.dance.groups.values()].filter(group => group.isPlaying).length)
            };
        } finally {
            performance.now = originalNow;
            scene.useConstantAnimationDeltaTime = false;
            club.engine.runRenderLoop(() => scene.render());
        }
    });
    expect(result.moves.length).toBeGreaterThanOrEqual(3);
    expect(result.moves).not.toContain('Groove_Sway');
    expect(result.moved).toBeGreaterThanOrEqual(4);
    expect(result.djMoved).toBe(true);
    expect(result.djAudio).toBe(true);
    expect(result.djEnergy).toBe(0.55);
    expect(result.fabricatedKicks).toBe(0);
    expect(result.playingGroups.every(count => count === 1)).toBe(true);

    await page.frameLocator('#soundCloudPlayer iframe').getByRole('button', { name: 'Pause' }).evaluate(button => button.click());
    await page.waitForFunction(() => !window.vrClub._soundCloudPlaying);
    const paused = await page.evaluate(() => {
        const club = window.vrClub;
        club._updateCrowdDance(1 / 60, { hasAudio: false });
        club._updateDJ(1 / 60, { hasAudio: false });
        return {
            fallback: club._unanalysedDanceMusic(),
            moves: club.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled()).map(npc => npc.dance.state.move),
            djAudio: club._djMusic.hasAudio
        };
    });
    expect(paused.fallback).toBeNull();
    expect(paused.moves.every(move => move === 'Groove_Sway')).toBe(true);
    expect(paused.djAudio).toBe(false);
    await page.frameLocator('#soundCloudPlayer iframe').getByRole('button', { name: 'Play', exact: true }).evaluate(button => button.click());
    await page.waitForFunction(() => window.vrClub._soundCloudPlaying);
    await page.frameLocator('#soundCloudPlayer iframe').getByRole('button', { name: 'Finish' }).evaluate(button => button.click());
    await page.waitForFunction(() => !window.vrClub._soundCloudPlaying);
    await page.evaluate(() => window.vrClub._stopSoundCloudPlayer());
    await expect(page.locator('#soundCloudPlayer iframe')).toHaveCount(0);
    await expectHealthyRuntime(page);
});
