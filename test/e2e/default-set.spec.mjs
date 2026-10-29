import { test, expect } from '@playwright/test';
import { useQuestHarness, enterClub, expectHealthyRuntime } from './support.mjs';

useQuestHarness({ music: false });

// A fresh profile has no saved music. The club must not be silent, and the set it plays must be one the light show can follow.
test('a guest with no music hears the club\u2019s own set, and the beat tracker locks onto its 124 BPM kick', async ({ page }) => {
    test.setTimeout(900_000);
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await enterClub(page);

    // It is the club's own file, served from this origin: no third-party music host is contacted.
    await page.waitForFunction(() => window.vrClub.audioElement && !window.vrClub.audioElement.paused && window.vrClub.audioElement.currentTime > 2, null, { timeout: 60_000 });
    const state = await page.evaluate(() => ({
        src: window.vrClub.audioElement.src, label: window.vrClub.nowPlayingLabel, saved: window.vrClub.musicLibrary.items.length,
        loop: window.vrClub.audioElement.loop, defaultPlaying: window.vrClub.musicLibrary.isDefaultPlaying()
    }));
    expect(state.src).toBe(`${new URL(page.url()).origin}/audio/nocturne-house.mp3`);
    expect(state).toMatchObject({ label: 'NOCTURNE House (club set)', saved: 0, loop: true, defaultPlaying: true });
    expect(requests.some(url => /podbean|soundcloud|hernancattaneo|workers\.dev\/(podcast|soundcloud)/.test(url))).toBe(false);
    expect(requests.some(url => url.includes('/audio/nocturne-house.mp3'))).toBe(true);

    // The analyser hears it and the tracker finds the tempo. The set has a deliberate kick-less breakdown, and this test
    // browser renders at about 1 frame a second (the detector works per frame), so assert the tempo estimate rather than
    // whether the kick happens to be present at one instant.
    await page.waitForFunction(() => window.vrClub.vjDirector.realOnsetCount >= 12, null, { timeout: 240_000 });
    const beat = await page.evaluate(() => ({
        bpm: window.vrClub.vjDirector.bpm, onsets: window.vrClub.vjDirector.realOnsetCount, audible: window.vrClub.getAudioData().bass > 0.05
    }));
    expect(beat.bpm).toBeGreaterThan(118);
    expect(beat.bpm).toBeLessThan(130);
    expect(beat.audible).toBe(true);
    await expectHealthyRuntime(page);
});

test('a saved set wins: the club\u2019s own set never starts over it', async ({ page }) => {
    test.setTimeout(900_000);
    await page.addInitScript(() => localStorage.setItem('vrclub.questMusic', JSON.stringify({
        items: [{ url: 'https://audio.example/e2e/set.mp3', name: 'My set' }], selected: 0
    })));
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await enterClub(page);
    await page.waitForFunction(() => window.vrClub.audioElement?.src?.includes('audio.example'), null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.vrClub.musicLibrary.isDefaultPlaying())).toBe(false);
    expect(requests.some(url => url.includes('/audio/nocturne-house.mp3'))).toBe(false);
});
