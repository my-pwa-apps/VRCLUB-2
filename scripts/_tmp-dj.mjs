import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const web = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8154' } });
await new Promise(r => setTimeout(r, 1500));
try {
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  await page.addInitScript(() => { localStorage.setItem('vrclub.radioOnEntry', '0'); localStorage.setItem('vrclub.graphicsTier', 'balanced'); });
  await page.goto('http://localhost:8154/');
  await page.locator('#enterClubBtn').click({ timeout: 180000 });
  await page.waitForFunction(() => window.vrClub && window.vrClub.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => {
    const c = window.vrClub, s = c.scene;
    const box = (meshes) => {
      let min = new BABYLON.Vector3(1e9, 1e9, 1e9), max = new BABYLON.Vector3(-1e9, -1e9, -1e9);
      for (const m of meshes) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; min = BABYLON.Vector3.Minimize(min, b.minimumWorld); max = BABYLON.Vector3.Maximize(max, b.maximumWorld); }
      return { min: min.asArray().map(v => +v.toFixed(3)), max: max.asArray().map(v => +v.toFixed(3)) };
    };
    const near = s.meshes.filter(m => { if (!m.isEnabled() || !m.getTotalVertices()) return false; m.computeWorldMatrix(true); const c = m.getBoundingInfo().boundingBox.centerWorld; return Math.abs(c.x) < 1.6 && c.z > -19.2 && c.z < -17 && c.y > 0.6 && c.y < 1.8; });
    const nearList = near.map(m => { const b = m.getBoundingInfo().boundingBox; return `${m.name} y ${b.minimumWorld.y.toFixed(2)}..${b.maximumWorld.y.toFixed(2)} x ${b.minimumWorld.x.toFixed(2)}..${b.maximumWorld.x.toFixed(2)} z ${b.minimumWorld.z.toFixed(2)}..${b.maximumWorld.z.toFixed(2)}`; }).slice(0, 40);
    const consoleMeshes = s.meshes.filter(m => /dj_?console|pioneer|djgear|cdj|mixer/i.test(m.name) && m.isEnabled() && m.getTotalVertices() > 0);
    const names = [...new Set(consoleMeshes.map(m => m.name.split('_').slice(0, 3).join('_')))].slice(0, 30);
    const tableMeshes = s.meshes.filter(m => /djTable|djBooth|booth|table|riser|platform/i.test(m.name) && m.isEnabled());
    const dj = c.npcAvatars.find(n => n.name === 'djPerformer');
    const bones = {};
    if (dj) dj.root.getChildTransformNodes(false).forEach(n => { const k = n.name.replace(/^djPerformer_/, ''); if (/^(Head|hand_l|hand_r|upperarm_l|upperarm_r|pelvis)$/.test(k)) bones[k] = n.getAbsolutePosition().asArray().map(v => +v.toFixed(3)); });
    return {
      consoleNames: names, near: nearList, console: consoleMeshes.length ? box(consoleMeshes) : null,
      tables: tableMeshes.map(m => `${m.name}`).slice(0, 12), tableBox: tableMeshes.length ? box(tableMeshes) : null,
      djRoot: dj && dj.root.position.asArray(), djBones: bones, positions: window.CLUB_POSITIONS && window.CLUB_POSITIONS.djBooth
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.evaluate(() => { const c = window.vrClub; c.camera.position.set(1.6, 2.4, -16.2); c.camera.setTarget(new BABYLON.Vector3(0, 1.4, -19)); });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'C:/Users/bartm/AppData/Local/Temp/dj-probe.png' });
  await browser.close();
} catch (e) { console.log('ERR', e); } finally { web.kill(); }
