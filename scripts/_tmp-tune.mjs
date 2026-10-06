import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.env.TEMP, 'club-tune');
mkdirSync(out, { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8126' } });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.addInitScript(() => { localStorage.setItem('vrclub.graphicsTier', 'balanced'); localStorage.setItem('vrclub.radioOnEntry', '0'); });
  await page.goto('http://localhost:8126/');
  await page.locator('#enterClubBtn').click();
  await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.waitForTimeout(2000);
  const settings = JSON.parse(process.argv[2]);
  const views = { street: { pos: [0, 1.7, 8.2], target: [0, 8, 30] }, wide: { pos: [-20, 1.7, 12], target: [10, 9, 28] } };
  await page.evaluate(() => { document.querySelectorAll('#cameraControls, #vjMenu, #audioMenu, #vrButton, button').forEach(e => { e.style.visibility = 'hidden'; }); });
  for (const s of settings) {
    await page.evaluate(({ moon, fill, emissive }) => {
      const c = window.vrClub;
      c.lightFactory.getLight('cityMoon').intensity = moon;
      c.lightFactory.getLight('cityFill').intensity = fill;
      for (const m of c._cityContainer.materials) if (m.name === 'windows') m.emissiveIntensity = emissive;
    }, s);
    for (const [vn, v] of Object.entries(views)) {
      await page.evaluate(({ pos, target }) => { const c = window.vrClub; c.camera.position.set(...pos); c.camera.setTarget(new BABYLON.Vector3(...target)); }, v);
      await page.waitForTimeout(2200);
      await page.screenshot({ path: join(out, `${s.name}_${vn}.png`), timeout: 180000 });
    }
    console.log('shot', s.name);
  }
} finally {
  await browser.close();
  server.kill();
}
