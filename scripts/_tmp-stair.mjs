import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const web = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8156' } });
await new Promise(r => setTimeout(r, 1500));
try {
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.addInitScript(() => { localStorage.setItem('vrclub.radioOnEntry', '0'); localStorage.setItem('vrclub.graphicsTier', 'balanced'); });
  await page.goto('http://localhost:8156/');
  await page.locator('#enterClubBtn').click({ timeout: 180000 });
  await page.waitForFunction(() => window.vrClub && window.vrClub.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.waitForFunction(() => window.vrClub._streetDoor && window.vrClub._streetDoor.open, null, { timeout: 180000 });
  await page.waitForFunction(() => window.vrClub._cityWarm === false, null, { timeout: 180000 });
  const outside = await page.evaluate(() => {
    const c = window.vrClub, out = [];
    const cityMeshes = new Set(c._cityMeshes || []);
    for (const m of c.scene.meshes) {
      if (!m.isEnabled() || !m.isVisible || !m.getTotalVertices || !m.getTotalVertices() || cityMeshes.has(m)) continue;
      if (/^vestibule|^city|contactShadow/.test(m.name)) continue;
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox, lo = b.minimumWorld, hi = b.maximumWorld;
      if (hi.z > 0.6 || hi.x > 12.9 || lo.x < -12.9) out.push(`${m.name} x ${lo.x.toFixed(1)}..${hi.x.toFixed(1)} y ${lo.y.toFixed(1)}..${hi.y.toFixed(1)} z ${lo.z.toFixed(1)}..${hi.z.toFixed(1)}`);
    }
    return out;
  });
  console.log(outside.join('\n'));
  const views = {
    bottom: [[0, 1.7, -1.6], [0, 3.6, 6]],
    streetFar: [[14, 4.5, 18], [0, 4, 3]]
  };
  for (const [name, [p, t]] of Object.entries(views)) {
    await page.evaluate(([p, t]) => {
      const c = window.vrClub; c._walkLevel = c._walkSurfaceLevel(p[0], p[2], 0);
      c.camera.position.set(...p); c.camera.setTarget(new BABYLON.Vector3(...t));
    }, [p, t]);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `C:/Users/bartm/AppData/Local/Temp/stair-${name}.png`, timeout: 180000 });
  }  await browser.close();
} catch (e) { console.log('ERR', e); } finally { web.kill(); }
