// Measures how the light show follows a track whose every kick is known.
// Usage: node scripts/_tmp-audio.mjs [label]   (writes %TEMP%/audio-<label>.json and prints a summary)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const label = process.argv[2] || 'run';
const SR = 44100, BPM = 124, BEAT = 60 / BPM, BAR = BEAT * 4;
// Sections in bars: groove (kick), breakdown (no kick), drop (kick, louder).
const SECTIONS = [['groove', 16, true, 0.8], ['breakdown', 8, false, 0.8], ['drop', 16, true, 1.0]];
const totalBars = SECTIONS.reduce((s, x) => s + x[1], 0);
const N = Math.ceil((totalBars * BAR + 1) * SR);
const buf = new Float32Array(N);
const kicks = [];
let rng = 12345; const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
let bar0 = 0;
for (const [name, bars, kick, level] of SECTIONS) {
  const t0 = bar0 * BAR;
  for (let b = 0; b < bars * 4; b++) {
    const tb = t0 + b * BEAT;
    if (kick) {
      kicks.push(+tb.toFixed(4));
      // Kick: a pitch-dropping sine, 150 -> 50 Hz.
      let phase = 0;
      for (let i = 0; i < 0.35 * SR; i++) {
        const t = i / SR, f = 50 + 100 * Math.exp(-t / 0.04);
        phase += 2 * Math.PI * f / SR;
        const idx = Math.floor(tb * SR) + i; if (idx >= N) break;
        buf[idx] += 0.85 * level * Math.sin(phase) * Math.exp(-t / 0.12);
      }
    }
    // Off-beat hat: a short noise burst.
    const th = tb + BEAT / 2;
    for (let i = 0; i < 0.04 * SR; i++) { const idx = Math.floor(th * SR) + i; if (idx >= N) break; buf[idx] += 0.12 * level * rand() * Math.exp(-i / (0.012 * SR)); }
  }
  // A rolling bassline (eighths, 55/65 Hz saw) and a pad (three sines), present in every section, as in real tracks.
  for (let i = Math.floor(t0 * SR); i < Math.floor((t0 + bars * BAR) * SR) && i < N; i++) {
    const t = i / SR, eighth = Math.floor((t - t0) / (BEAT / 2));
    const f = eighth % 4 === 3 ? 65.4 : 55;
    const env = Math.exp(-(((t - t0) % (BEAT / 2))) / 0.15);
    buf[i] += 0.28 * level * env * (2 * ((t * f) % 1) - 1);
    buf[i] += 0.07 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t));
    // A "vocal" in the breakdown: 300-900 Hz, slowly gliding.
    if (name === 'breakdown') buf[i] += 0.12 * Math.sin(2 * Math.PI * (440 + 200 * Math.sin(t * 0.7)) * t);
  }
  bar0 += bars;
}
let peak = 0; for (const v of buf) peak = Math.max(peak, Math.abs(v));
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(buf[i] / peak * 0.9 * 32767))), i * 2);
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28);
header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
const wav = Buffer.concat([header, pcm]);
const audioServer = http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Content-Type': 'audio/wav' };
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) { const s = +m[1], e = m[2] ? +m[2] : wav.length - 1; res.writeHead(206, { ...h, 'Content-Range': `bytes ${s}-${e}/${wav.length}`, 'Content-Length': e - s + 1 }); res.end(wav.subarray(s, e + 1)); }
  else { res.writeHead(200, { ...h, 'Content-Length': wav.length }); res.end(wav); }
}).listen(8161, '127.0.0.1');

const web = spawn('node', ['scripts/serve.mjs'], { stdio: 'ignore', env: { ...process.env, PORT: '8155' } });
await new Promise(r => setTimeout(r, 1500));
try {
  const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 420, height: 260 } });
  await page.addInitScript(() => { localStorage.setItem('vrclub.radioOnEntry', '0'); localStorage.setItem('vrclub.graphicsTier', 'balanced'); });
  await page.goto('http://localhost:8155/');
  await page.locator('#enterClubBtn').click({ timeout: 180000 });
  await page.waitForFunction(() => window.vrClub && window.vrClub.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.vrClub.modelLoadPromise);
  await page.evaluate(async () => {
    const c = window.vrClub;
    window.__log = [];
    // The software renderer draws ~5 frames a second, which says nothing about a real browser. Stop drawing and run the
    // club's own per-frame update at 60 Hz instead: the same audio -> director -> fixtures path, minus the GPU.
    c.engine.stopRenderLoop();
    c.engine.getDeltaTime = () => 1000 / 60;
    const tick = () => {
      c.updateAnimations();
      const a = c.audioElement; if (!a || a.paused) return;
      const vj = c.vjDirector, sd = c.showDirector, s0 = c.spotlights && c.spotlights[0];
      window.__log.push([a.currentTime, vj.beatNumber, vj.realOnsetCount, +(c.beatEnvelope || 0).toFixed(3), +(c.kickPulse || 0).toFixed(3),
        +(c.masterIntensity || 0).toFixed(3), s0 ? +s0.light.intensity.toFixed(2) : 0, +(c._ledLift || 0).toFixed(3), sd._movementName,
        sd._setPiece ? sd._setPieceName() : '', +(sd._energy || 0).toFixed(3), +(vj.bpm || 0).toFixed(1), +((c._audioFrameData.lowRms) || 0).toFixed(4), +((c._audioFrameData.energy) ?? -1).toFixed(3), s0 ? +Math.hypot(s0.light.direction.x, s0.light.direction.z).toFixed(4) : 0]);
    };
    window.__tick = setInterval(tick, 1000 / 60);
  });
  await page.evaluate(url => window.vrClub.startAudioStream(url, { onDemand: true }), 'http://127.0.0.1:8161/track.wav');
  const dur = totalBars * BAR;
  await page.waitForFunction(d => window.vrClub.audioElement && window.vrClub.audioElement.currentTime > d - 0.5, dur, { timeout: (dur + 120) * 1000, polling: 1000 });
  const log = await page.evaluate(() => window.__log);
  await browser.close();
  writeFileSync(`${process.env.TEMP}/audio-${label}.json`, JSON.stringify({ kicks, log, BEAT, BAR, SECTIONS }));

  // ---- summary ----
  const fps = log.length / (log.at(-1)[0] - log[0][0]);
  // Detected kicks: frames where realOnsetCount went up; their audio time vs the nearest true kick.
  const onsets = [];
  for (let i = 1; i < log.length; i++) if (log[i][2] > log[i - 1][2]) onsets.push(log[i][0]);
  const near = t => kicks.reduce((b, k) => Math.abs(k - t) < Math.abs(b - t) ? k : b, Infinity);
  const tol = Math.max(0.09, 1.5 / fps);
  const hits = onsets.filter(t => Math.abs(near(t) - t) <= tol);
  const breakdownStart = 16 * BAR, breakdownEnd = 24 * BAR;
  const falseInBreak = onsets.filter(t => t > breakdownStart + 0.5 && t < breakdownEnd).length;
  const kicksPlayed = kicks.filter(k => k < log.at(-1)[0]);
  const caught = kicksPlayed.filter(k => onsets.some(t => Math.abs(t - k) <= tol)).length;
  const lag = hits.map(t => t - near(t)).sort((a, b) => a - b);
  // How much the rig breathes with the kick: per beat, (max - min) / max of the spot intensity and the master.
  const depth = (col, from, to) => {
    const out = [];
    for (let t = from; t + BEAT < to; t += BEAT) {
      const w = log.filter(r => r[0] >= t && r[0] < t + BEAT).map(r => r[col]);
      if (w.length < 3) continue;
      const mx = Math.max(...w), mn = Math.min(...w);
      if (mx > 0) out.push((mx - mn) / mx);
    }
    out.sort((a, b) => a - b);
    return out.length ? +out[Math.floor(out.length / 2)].toFixed(3) : null;
  };
  const sect = (name) => { let b = 0; for (const s of SECTIONS) { if (s[0] === name) return [b * BAR, (b + s[1]) * BAR]; b += s[1]; } };
  const [g0, g1] = sect('groove'), [d0, d1] = sect('drop');
  const movements = [...new Set(log.map(r => r[8] + (r[9] ? `/${r[9]}` : '')))];
  const mean = (col, a, b) => { const w = log.filter(r => r[0] >= a && r[0] < b); return +(w.reduce((s, r) => s + r[col], 0) / w.length).toFixed(3); };
  console.log(JSON.stringify({
    label, fps: +fps.toFixed(1), kicksPlayed: kicksPlayed.length, caught, recall: +(caught / kicksPlayed.length).toFixed(3),
    detected: onsets.length, precision: +(hits.length / Math.max(1, onsets.length)).toFixed(3), falseInBreakdown: falseInBreak,
    medianLagMs: lag.length ? Math.round(lag[Math.floor(lag.length / 2)] * 1000) : null,
    bpm: log.at(-1)[11],
    depthSpotGroove: depth(6, g0 + 4 * BAR, g1), depthSpotDrop: depth(6, d0 + 2 * BAR, d1),
    depthMasterGroove: depth(5, g0 + 4 * BAR, g1), depthMasterDrop: depth(5, d0 + 2 * BAR, d1),
    depthLedGroove: depth(7, g0 + 4 * BAR, g1), depthTiltGroove: depth(14, g0 + 4 * BAR, g1),
    energy: { groove: mean(10, g0 + 4 * BAR, g1), breakdown: mean(10, breakdownStart, breakdownEnd), drop: mean(10, d0, d1) },
    meanMaster: { groove: mean(5, g0, g1), breakdown: mean(5, breakdownStart, breakdownEnd), drop: mean(5, d0, d1) },
    movements
  }, null, 1));
} catch (e) { console.log('ERR', e); } finally { web.kill(); audioServer.close(); }
