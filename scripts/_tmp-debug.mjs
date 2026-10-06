import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';

const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8125' } });
await new Promise(r => setTimeout(r, 1500));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => { localStorage.setItem('vrclub.graphicsTier', 'balanced'); localStorage.setItem('vrclub.radioOnEntry', '0'); });
  await page.goto('http://localhost:8125/');
  await page.locator('#enterClubBtn').click();
  await page.waitForFunction(() => window.vrClub?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const c = window.vrClub;
    const names = c._cityMeshes.map(m => m.name + '<' + (m.parent && m.parent.name)); const mesh = c._cityMeshes.find(m => m.name.startsWith('far3'));
    const mat = mesh.subMeshes.map(s => s.getMaterial());
    return {
      maxLights: c.maxLights,
      lightSources: mesh.lightSources.map(l => `${l.name}:${l.getClassName()}:${l.intensity}:${l.isEnabled()}:prio${l.renderPriority}`),
      requireSorting: c.scene.requireLightSorting,
      sceneLights: c.scene.lights.map(l => `${l.name}:${l.renderPriority}`),
      mats: mat.map(m => m && `${m.name}:${m.getClassName()}:maxL${m.maxSimultaneousLights}:env${m.environmentIntensity}:frozen${m.isFrozen}:vc${m.useVertexColors ?? 'na'}`),
      exposure: c.renderPipeline?.imageProcessing?.exposure, adapted: c._adaptedExposure, envInt: c.scene.environmentIntensity,
      ipCfg: c.scene.imageProcessingConfiguration.exposure
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally {
  await browser.close();
  server.kill();
}
