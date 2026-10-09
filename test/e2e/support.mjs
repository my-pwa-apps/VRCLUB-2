import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const iwerEntry = require.resolve('iwer');
const iwerBundle = readFileSync(join(dirname(iwerEntry), '..', 'build', 'iwer.min.js'), 'utf8');
// IWER 2.3.0 to 2.5.0 (re-checked 2026-10-03) store the XRRigidTransform object itself as the offset matrix in
// getOffsetReferenceSpace(), so every origin offset is silently ignored. Babylon's
// teleport, snap turn and `xrCamera.position` writes all go through that call, so none
// of them would move the emulated user. Real browsers implement it correctly; this
// shim makes the emulator match them.
const installQuestRuntime = `${iwerBundle}\n;(() => {
    const device = new globalThis.IWER.XRDevice(globalThis.IWER.metaQuest3);
    device.installRuntime({ forceInstall: true });
    globalThis.__iwerDevice = device;
    const proto = globalThis.XRReferenceSpace.prototype;
    const original = proto.getOffsetReferenceSpace;
    proto.getOffsetReferenceSpace = function (originOffset) {
        const space = original.call(this, originOffset);
        for (const symbol of Object.getOwnPropertySymbols(space)) {
            const state = space[symbol];
            if (state && state.offsetMatrix) state.offsetMatrix = Float32Array.from(originOffset.matrix);
        }
        return space;
    };
})();`;

const silentWav = Buffer.from(
    'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
    'base64'
);

export const browserFailures = new WeakMap();

/** Registers the per-test Quest 3 emulation, failure capture and local silent stream. */
export function useQuestHarness({ comfort = true, music = false } = {}) {
    test.beforeEach(async ({ page }) => {
        const failures = [];
        browserFailures.set(page, failures);
        page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
        page.on('console', message => {
            if (message.type() === 'error') failures.push(`console.error: ${message.text()}`);
        });

        await page.addInitScript({ content: installQuestRuntime });
        await page.addInitScript(({ comfort }) => {
            localStorage.setItem('vrclub.graphicsTier', 'balanced');
            localStorage.setItem('vrclub.safeMode', '1');
            // Existing teleport regressions explicitly choose comfort mode; the fresh default is smooth.
            if (comfort) localStorage.setItem('vrclub.vrComfort', '1');
            else localStorage.removeItem('vrclub.vrComfort');
        }, { comfort });
        await routeSavedMusic(page, silentWav, music);
    });
}

/** Intercept a synthetic user audio URL; only audio-specific tests preselect a saved set. */
export async function routeSavedMusic(page, episodeBody, saved = true) {
    if (saved) await page.addInitScript(() => localStorage.setItem('vrclub.questMusic', JSON.stringify({
        items: [{ url: 'https://audio.example/e2e/set.mp3', name: 'My test set' }], selected: 0
    })));
    await page.route('https://audio.example/**', route => route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: episodeBody
    }));
}

export async function enterClub(page) {
    await page.goto('/');
    await expect(page.locator('#enterClubBtn')).toBeVisible();
    await page.locator('#enterClubBtn').click();
    await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180_000 });
    await expect(page.locator('#splashScreen')).toBeHidden();
}

export async function expectHealthyRuntime(page) {
    const diagnostics = await page.evaluate(() => window.vrClub.getDiagnostics());
    expect(diagnostics.tier).toBe('balanced');
    expect(diagnostics.meshes).toBeGreaterThan(100);
    expect(diagnostics.materials).toBeGreaterThan(25);
    expect(diagnostics.recentLogs.filter(entry => entry.category === 'error')).toEqual([]);
    expect(browserFailures.get(page)).toEqual([]);
}

/** Enters the emulated immersive session and waits for both controllers. */
export async function enterVR(page) {
    const vrButton = page.locator('#vrButton');
    // Entry waits for the background GLB load and shader compile (30 s ceiling).
    await expect(vrButton).toBeEnabled({ timeout: 60_000 });
    await vrButton.click();
    await page.waitForFunction(() => window.vrClub?.isInVRMode === true);
    await page.waitForFunction(() => window.vrClub?._xrControllers?.length === 2);
}

export async function exitVR(page) {
    await page.evaluate(() => document.getElementById('vrButton').click());
    await page.waitForFunction(() => window.vrClub?.isInVRMode === false);
}
