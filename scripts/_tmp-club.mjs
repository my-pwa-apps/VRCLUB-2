import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.env.TEMP, 'club-shots');
mkdirSync(out, { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8124' } });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const problems = [];
  await page.addInitScript(() => { localStorage.setItem('vrclub.graphicsTier', 'balanced'); localStorage.setItem('vrclub.radioOnEntry', '0'); });
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(`${m.type()}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', e => problems.push(`pageerror: ${String(e).slice(0, 240)}`));
  await page.goto('http://localhost:8124/');
  await page.locator('#enterClubBtn').click();
  await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.waitForTimeout(3000);
  const state = () => page.evaluate(() => {
    const c = window.vrClub;
    const p = c.camera.position;
    if (!c.audioContext) { c._ensureAudioContext(); c.audioContext.resume(); }
    const f = c.audioContext ? {
      occ1: c.occlusionFilter?.frequency.value, occ2: c.occlusionFilter2?.frequency.value,
      sub: c.subGain?.gain.value, reverb: c.reverbSend?.gain.value, crowd: c.crowdAmbienceGain?.gain.value, master: c.audioMasterGain?.gain.value
    } : null;
    return {
      pos: [p.x, p.y, p.z].map(v => +v.toFixed(2)), cityRoot: c._cityRoot ? c._cityRoot.isEnabled() : null, exterior: +(c._exterior || 0).toFixed(2),
      doorOpen: c._streetDoor?.open, fog: +c.scene.fogDensity.toFixed(4), lights: c.scene.lights.length, meshes: c.scene.meshes.length,
      active: c.scene.getActiveMeshes().length, audio: f
    };
  });
  console.log('after load', JSON.stringify(await state()));
  const views = JSON.parse(process.argv[2]);
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate(({ pos, target }) => { const c = window.vrClub; c.camera.position.set(...pos); c.camera.setTarget(new BABYLON.Vector3(...target)); }, v);
    await page.waitForTimeout(v.wait || 2500);
    await page.screenshot({ path: join(out, `${name}.png`), timeout: 180000 });
    console.log(name, JSON.stringify(await state()));
  }
  console.log(problems.slice(0, 12).join('\n') || 'no console problems');
} finally {
  await browser.close();
  server.kill();
}
