import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join(process.env.TEMP, 'city-shots');
mkdirSync(out, { recursive: true });
const server = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8123' } });
await new Promise(r => setTimeout(r, 1500));
const views = JSON.parse(process.argv[2]);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const [name, query] of Object.entries(views)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${name}] ${m.text().slice(0, 200)}`); });
    await page.goto(`http://localhost:8123/_tmp-view.html?${query}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const info = await page.evaluate(() => ({ tris: Math.round(window.__tris), ms: Math.round(window.__loadMs), meshes: window.__meshes.length }));
    await page.screenshot({ path: join(out, `${name}.png`) });
    console.log(name, JSON.stringify(info));
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
