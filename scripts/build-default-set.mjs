#!/usr/bin/env node
// Generates audio/nocturne-house.mp3: the club's own, original house set (about 21 minutes, 124 BPM).
//
// Why it exists: a guest who has not added any music used to enter a silent club. This set is written entirely by this
// script (drums, bass, pads and a lead are synthesised from maths, with no samples and no third-party material), so there is
// no licence to honour or credit: it is original work of this project, released under the repository's MIT licence.
//
// It is also shaped for the light show: a steady four-on-the-floor kick, bar-aligned 16-bar phrases, builds with risers and
// snare rolls, a kick-less breakdown and a drop, so the beat tracker, the Show Director's movements and the crowd's choreography
// all have something real to follow.
//
//   node scripts/build-default-set.mjs          (needs ffmpeg with libmp3lame on PATH; ~1-3 minutes)
//
// Deterministic: the same script produces the same audio (no random numbers from the system, no timestamps in the file).

import { spawn } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'audio', 'nocturne-house.mp3');

const SR = 44100;
const BPM = 124;
const BEAT = 60 / BPM;
const BAR = 4 * BEAT;
const STEP = BEAT / 4;
const TAIL = Math.round(1.6 * SR);
const CYCLES = 3;
const CYCLE_BARS = 160;
const TOTAL_BARS = CYCLES * CYCLE_BARS;
const TWO_PI = Math.PI * 2;

/** Stateless white noise in -1..1 from an integer: the same input always gives the same sample. */
function noise(i) {
    i = Math.imul(i ^ (i >>> 16), 0x45d9f3b);
    i = Math.imul(i ^ (i >>> 16), 0x45d9f3b);
    i ^= i >>> 16;
    return (i >>> 0) / 4294967295 * 2 - 1;
}

function prng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Musical material. Each 160-bar cycle changes key and chord progression; the grid and the structure stay the same.
// ---------------------------------------------------------------------------------------------------------------------------
const KEYS = [0, 5, 10, 0];                       // A, D, G, A (semitones above A)
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DEGREES = { i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], VI: [8, 12, 15], III: [3, 7, 10], VII: [10, 14, 17] };
const PROGRESSIONS = [
    ['i', 'VI', 'III', 'VII'],
    ['i', 'iv', 'VI', 'VII'],
    ['i', 'VII', 'VI', 'v'],
    ['i', 'VI', 'iv', 'VII']
];
const BASS_PATTERNS = [
    [2, 6, 10, 14],
    [2, 3, 6, 10, 11, 14],
    [2, 6, 7, 10, 14, 15],
    [1, 2, 6, 9, 10, 14]
];
const midiFreq = semisFromA => 220 * Math.pow(2, semisFromA / 12);

function buildMotifs() {
    const motifs = [];
    for (let cycle = 0; cycle < CYCLES; cycle++) {
        const list = [];
        for (let variant = 0; variant < 4; variant++) {
            const random = prng(9000 + cycle * 100 + variant);
            const steps = new Array(16).fill(-1);
            let last = 4;
            for (let s = 0; s < 16; s++) {
                const strong = s % 4 === 0;
                const chance = strong ? 0.55 : (s % 2 === 0 ? 0.62 : 0.34);
                if (random() < chance) {
                    const move = Math.floor(random() * 5) - 2;
                    last = Math.max(0, Math.min(9, last + move));
                    steps[s] = last;
                }
            }
            if (steps.every(note => note < 0)) steps[0] = 4;
            list.push(steps);
        }
        motifs.push(list);
    }
    return motifs;
}
const MOTIFS = buildMotifs();

/** What plays in bar `k` (0-based over the whole set). */
function plan(k) {
    const cycle = Math.min(CYCLES - 1, Math.floor(k / CYCLE_BARS));
    const b = k % CYCLE_BARS;
    const p = {
        k, cycle, b, kick: true, hats: 'full', bass: false, clap: false, pad: false, lead: 0, riser: 0, roll: 0, crash: false,
        padLevel: 1, padCut: 1400, phase: 'groove', fade: 1
    };
    if (b < 8) { p.hats = 'light'; p.phase = 'intro'; }
    else if (b < 24) { p.hats = 'light'; p.bass = true; p.phase = 'intro'; }
    else if (b < 48) { p.bass = true; p.clap = true; p.pad = true; p.padLevel = 0.7; p.padCut = 1100 + (b - 24) * 30; p.phase = 'groove'; }
    else if (b < 56) {
        p.bass = b < 54; p.clap = true; p.pad = true; p.phase = 'build'; p.riser = (b - 48 + 1) / 8; p.padLevel = 0.7; p.padCut = 1800;
        if (b >= 52) p.roll = b === 55 ? 3 : (b === 54 ? 2 : 1);
        if (b === 55) { p.kick = false; p.bass = false; }
    } else if (b < 88) { p.bass = true; p.clap = true; p.pad = true; p.lead = b < 72 ? 0.8 : 1; p.crash = b === 56; p.phase = 'drop'; p.padCut = 2400; p.padLevel = 0.8; }
    else if (b < 104) { p.kick = false; p.hats = 'none'; p.pad = true; p.lead = 0.35; p.padLevel = 1.25; p.padCut = 900 + (b - 88) * 70; p.phase = 'breakdown'; }
    else if (b < 112) {
        p.kick = b >= 110; p.hats = b >= 108 ? 'light' : 'none'; p.pad = true; p.lead = 0.35; p.phase = 'build2'; p.riser = (b - 104 + 1) / 8; p.padLevel = 1.1; p.padCut = 1600;
        p.clap = b >= 110; if (b >= 108) p.roll = b === 111 ? 3 : (b === 110 ? 2 : 1);
        if (b === 111) p.kick = false;
    } else if (b < 144) { p.bass = true; p.clap = true; p.pad = true; p.lead = 1; p.crash = b === 112; p.phase = 'drop'; p.padCut = 2600; p.padLevel = 0.8; }
    else if (b < 152) { p.bass = true; p.pad = true; p.clap = false; p.hats = 'light'; p.padLevel = 0.9; p.padCut = 1200; p.phase = 'outro'; }
    else { p.hats = 'light'; p.phase = 'outro'; }
    // The very end fades out over the last four bars.
    if (k >= TOTAL_BARS - 4) p.fade = Math.max(0, (TOTAL_BARS - k) / 4);
    return p;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Voices. Each renders straight into the bar's buffers; `t0` is an absolute time in seconds.
// ---------------------------------------------------------------------------------------------------------------------------
function makeBar(k) {
    const s0 = Math.floor(k * BAR * SR);
    const s1 = Math.floor((k + 1) * BAR * SR);
    const length = s1 - s0 + TAIL;
    const group = () => ({ L: new Float32Array(length), R: new Float32Array(length) });
    return { k, s0, s1, length, drums: group(), music: group(), fx: group(), local: t => Math.round(t * SR) - s0 };
}

function put(g, i, l, r) {
    if (i < 0 || i >= g.L.length) return;
    g.L[i] += l;
    g.R[i] += r;
}

function kick(bar, t0, vel) {
    const i0 = bar.local(t0);
    const n = Math.round(0.5 * SR);
    let phase = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        phase += TWO_PI * (46 + 112 * Math.exp(-t / 0.028)) / SR;
        const amp = Math.exp(-t / 0.18) * (1 - Math.exp(-t / 0.0012));
        let s = Math.sin(phase) * amp;
        if (t < 0.004) s += noise(i0 * 3 + i) * 0.22 * (1 - t / 0.004);
        s = Math.tanh(s * 1.7) * 0.95 * vel;
        put(bar.drums, i0 + i, s, s);
    }
}

function hat(bar, t0, vel, open, pan) {
    const i0 = bar.local(t0);
    const n = Math.round((open ? 0.26 : 0.06) * SR);
    let low = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const x = noise(i0 * 5 + i + 77);
        low += 0.3 * (x - low);
        const s = (x - low) * Math.exp(-t / (open ? 0.075 : 0.012)) * vel;
        put(bar.drums, i0 + i, s * (1 - pan * 0.5), s * (1 + pan * 0.5));
    }
}

function clap(bar, t0, vel) {
    const i0 = bar.local(t0);
    const n = Math.round(0.34 * SR);
    let hp = 0, bp = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const x = noise(i0 * 7 + i + 191);
        hp += 0.12 * (x - hp);
        const hi = x - hp;
        bp += 0.45 * (hi - bp);
        let env = 0;
        for (const burst of [0, 0.011, 0.022]) if (t >= burst) env += Math.exp(-(t - burst) / 0.006) * 0.6;
        env += Math.exp(-t / 0.09) * 0.5 * (t > 0.032 ? 1 : 0);
        const s = bp * env * vel * 1.3;
        put(bar.drums, i0 + i, s, s);
    }
}

function snare(bar, t0, vel) {
    const i0 = bar.local(t0);
    const n = Math.round(0.22 * SR);
    let low = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const x = noise(i0 * 11 + i + 313);
        low += 0.4 * (x - low);
        const tone = Math.sin(TWO_PI * 190 * t) * Math.exp(-t / 0.045) * 0.5;
        const s = ((x - low) * Math.exp(-t / 0.07) + tone) * vel * 0.55;
        put(bar.fx, i0 + i, s, s);
    }
}

function crash(bar, t0, vel) {
    const i0 = bar.local(t0);
    const n = Math.round(2.6 * SR);
    let low = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const x = noise(i0 * 13 + i + 557);
        low += 0.25 * (x - low);
        const s = (x - low) * Math.exp(-t / 0.7) * 0.3 * vel;
        put(bar.fx, i0 + i, s * 0.9, s * 1.1);
    }
}

function riser(bar, t0, seconds, from, to) {
    const i0 = bar.local(t0);
    const n = Math.round(seconds * SR);
    let y = 0;
    for (let i = 0; i < n; i++) {
        const u = i / n;
        const fc = 250 + 9000 * u * u;
        const a = 1 - Math.exp(-TWO_PI * fc / SR);
        y += a * (noise(i0 * 17 + i + 911) - y);
        const sweep = Math.sin(TWO_PI * (200 + 1800 * u * u) * (i / SR)) * 0.05;
        const amp = (from + (to - from) * u) * 0.34;
        put(bar.fx, i0 + i, (y * 0.8 + sweep) * amp, (y * 0.8 - sweep) * amp);
    }
}

function bass(bar, t0, dur, freq, vel) {
    const i0 = bar.local(t0);
    const n = Math.round((dur + 0.1) * SR);
    let y1 = 0, y2 = 0, ph = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.min(1, t / 0.004) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.035));
        const fc = 120 + 1500 * Math.exp(-t / 0.08) * vel;
        const a = 1 - Math.exp(-TWO_PI * fc / SR);
        ph += freq / SR;
        const frac = ph % 1;
        const x = 0.62 * (2 * frac - 1) + 0.38 * (frac < 0.5 ? 1 : -1);
        y1 += a * (x - y1);
        y2 += a * (y1 - y2);
        const s = (y2 * 0.75 + Math.sin(TWO_PI * ph) * 0.55) * env * vel * 0.46;
        put(bar.music, i0 + i, s, s);
    }
}

function pad(bar, t0, freqs, dur, level, cutoff) {
    const i0 = bar.local(t0);
    const n = Math.round((dur + 0.7) * SR);
    const voices = [];
    for (const f of freqs) for (const detune of [0.994, 1.0, 1.006]) voices.push({ f: f * detune, ph: ((f * 13.7) % 1) });
    let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
    const att = Math.min(0.55, dur * 0.35);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.min(1, t / att) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.28));
        const abs = t0 + t;
        const fc = cutoff * (0.78 + 0.22 * Math.sin(TWO_PI * 0.083 * abs));
        const a = 1 - Math.exp(-TWO_PI * fc / SR);
        let sl = 0, sr = 0;
        for (let v = 0; v < voices.length; v++) {
            const voice = voices[v];
            voice.ph += voice.f / SR;
            const saw = 2 * (voice.ph % 1) - 1;
            if (v % 3 === 0) sl += saw; else if (v % 3 === 2) sr += saw; else { sl += saw * 0.6; sr += saw * 0.6; }
        }
        l1 += a * (sl - l1); l2 += a * (l1 - l2);
        r1 += a * (sr - r1); r2 += a * (r1 - r2);
        const gain = env * level * 0.05;
        put(bar.music, i0 + i, l2 * gain, r2 * gain);
    }
}

function pluck(bar, t0, freq, vel, pan, cutoffScale) {
    const i0 = bar.local(t0);
    const n = Math.round(0.42 * SR);
    let y1 = 0, y2 = 0, p1 = 0, p2 = 0;
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        const env = Math.exp(-t / 0.13) * Math.min(1, t / 0.002);
        const fc = (700 + 5200 * Math.exp(-t / 0.05)) * cutoffScale;
        const a = 1 - Math.exp(-TWO_PI * fc / SR);
        p1 += freq / SR; p2 += freq * 1.007 / SR;
        const x = (2 * (p1 % 1) - 1) * 0.55 + ((p2 % 1) < 0.5 ? 0.45 : -0.45);
        y1 += a * (x - y1); y2 += a * (y1 - y2);
        const s = y2 * env * vel * 0.2;
        put(bar.music, i0 + i, s * (1 - pan * 0.6), s * (1 + pan * 0.6));
    }
}

// ---------------------------------------------------------------------------------------------------------------------------
// One bar of music.
// ---------------------------------------------------------------------------------------------------------------------------
function renderBar(k, carry) {
    const p = plan(k);
    const bar = makeBar(k);
    const t0 = k * BAR;
    const progression = PROGRESSIONS[p.cycle];
    const chord = DEGREES[progression[p.b % 4]];
    const key = KEYS[p.cycle];

    if (p.kick) for (let beat = 0; beat < 4; beat++) kick(bar, t0 + beat * BEAT, 1);

    if (p.clap) {
        const lastBar = p.phase === 'build' || p.phase === 'build2';
        if (!lastBar || p.roll === 0) { clap(bar, t0 + BEAT, 0.8); clap(bar, t0 + 3 * BEAT, 0.8); }
    }

    if (p.hats !== 'none') {
        for (let step = 0; step < 16; step++) {
            const t = t0 + step * STEP;
            const offbeat = step % 4 === 2;
            if (p.hats === 'light') {
                if (offbeat) hat(bar, t, 0.5, false, step % 8 === 2 ? -0.3 : 0.3);
            } else {
                if (offbeat) hat(bar, t, 0.6, true, step % 8 === 2 ? -0.35 : 0.35);
                else if (step % 2 === 1) hat(bar, t, 0.22, false, step % 4 === 1 ? 0.5 : -0.5);
                else if (step % 4 === 0) hat(bar, t, 0.16, false, 0);
            }
        }
    }

    if (p.bass) {
        const pattern = BASS_PATTERNS[(p.cycle + Math.floor(p.b / 16)) % BASS_PATTERNS.length];
        const root = ((key + chord[0] + 5) % 12) - 5;
        for (const step of pattern) {
            const accent = step % 4 === 2;
            const octave = step % 4 === 3 ? 12 : 0;
            const semis = step % 8 === 6 && chord[2] % 2 ? chord[2] - chord[0] : 0;
            bass(bar, t0 + step * STEP, STEP * (accent ? 2.2 : 1.3), 55 * Math.pow(2, (root + octave + semis) / 12), accent ? 1 : 0.8);
        }
    }

    if (p.pad) {
        const freqs = chord.map(interval => midiFreq(key + (interval > 14 ? interval - 12 : interval)));
        pad(bar, t0, freqs, BAR * 0.98, p.padLevel, p.padCut);
    }

    if (p.lead > 0) {
        const motif = MOTIFS[p.cycle][Math.floor(p.b / 8) % 4];
        for (let step = 0; step < 16; step++) {
            const degree = motif[step];
            if (degree < 0) continue;
            const freq = 440 * Math.pow(2, (key + MINOR[degree % 7] + 12 * Math.floor(degree / 7)) / 12);
            const t = t0 + step * STEP;
            const pan = step % 2 ? 0.35 : -0.35;
            const cut = p.phase === 'breakdown' || p.phase === 'build2' ? 0.55 : 1;
            pluck(bar, t, freq, p.lead, pan, cut);
            pluck(bar, t + 3 * STEP, freq, p.lead * 0.34, -pan, cut * 0.8);
            pluck(bar, t + 6 * STEP, freq, p.lead * 0.13, pan, cut * 0.6);
        }
    }

    if (p.riser > 0) riser(bar, t0, BAR, Math.max(0.05, p.riser - 1 / 8), p.riser);
    if (p.crash) crash(bar, t0, 1);
    if (p.roll > 0) {
        const hitsPerBeat = p.roll === 3 ? 8 : (p.roll === 2 ? 4 : 2);
        for (let i = 0; i < 4 * hitsPerBeat; i++) snare(bar, t0 + i * BEAT / hitsPerBeat, 0.35 + 0.65 * (i / (4 * hitsPerBeat)));
    }

    // Mix: the harmonic parts duck to the kick (the pumping every house track has), then the groups are summed.
    const duck = p.kick;
    const L = new Float32Array(bar.length), R = new Float32Array(bar.length);
    for (let i = 0; i < bar.length; i++) {
        let g = 1;
        if (duck) {
            const phase = ((bar.s0 + i) / SR) % BEAT;
            g = 1 - 0.86 * Math.exp(-phase / 0.115);
        }
        L[i] = bar.drums.L[i] * 0.82 + bar.music.L[i] * g * 1.3 + bar.fx.L[i];
        R[i] = bar.drums.R[i] * 0.82 + bar.music.R[i] * g * 1.3 + bar.fx.R[i];
    }
    for (let i = 0; i < TAIL && i < L.length; i++) { L[i] += carry.L[i]; R[i] += carry.R[i]; }
    const body = bar.s1 - bar.s0;
    return {
        L: L.subarray(0, body), R: R.subarray(0, body),
        carry: { L: L.slice(body, body + TAIL), R: R.slice(body, body + TAIL) }, fade: p.fade, bars: body
    };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Pass 1 measures the peak; pass 2 applies one fixed gain, a soft limiter, and streams 16-bit PCM into ffmpeg.
// ---------------------------------------------------------------------------------------------------------------------------
function* render() {
    let carry = { L: new Float32Array(TAIL), R: new Float32Array(TAIL) };
    for (let k = 0; k < TOTAL_BARS; k++) {
        const bar = renderBar(k, carry);
        carry = bar.carry;
        yield bar;
    }
}

function measure() {
    let peak = 0, sum = 0, count = 0;
    for (const bar of render()) {
        for (let i = 0; i < bar.bars; i++) {
            const m = Math.max(Math.abs(bar.L[i]), Math.abs(bar.R[i]));
            if (m > peak) peak = m;
            sum += bar.L[i] * bar.L[i] + bar.R[i] * bar.R[i];
            count += 2;
        }
    }
    return { peak, rms: Math.sqrt(sum / count) };
}

async function main() {
    mkdirSync(path.dirname(OUT), { recursive: true });
    console.log(`Rendering ${TOTAL_BARS} bars at ${BPM} BPM (${Math.round(TOTAL_BARS * BAR / 60 * 10) / 10} minutes)...`);
    const stats = measure();
    // Keep the limiter gentle (a hard-driven one flattened every section to the same level) and leave about 1.5 dB of headroom
    // below the encoder: MP3 overshoots its input peak slightly.
    const peakIn = 0.85;
    const gain = peakIn / stats.peak;
    const trim = 0.84 / Math.tanh(peakIn);
    console.log(`Pass 1: raw peak ${stats.peak.toFixed(2)}, RMS ${stats.rms.toFixed(3)}; gain ${gain.toFixed(2)}`);

    const ffmpeg = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', String(SR), '-ac', '2', '-i', 'pipe:0',
        '-c:a', 'libmp3lame', '-b:a', '112k', '-joint_stereo', '1', '-fflags', '+bitexact', '-flags:a', '+bitexact',
        '-id3v2_version', '3', '-metadata', 'title=NOCTURNE House', '-metadata', 'artist=NOCTURNE', '-metadata', 'album=NOCTURNE club set',
        '-metadata', 'comment=Original generated music, MIT licence', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => {
        ffmpeg.on('error', error => reject(new Error(`Could not run ffmpeg: ${error.message}`)));
        ffmpeg.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
    });
    let outPeak = 0;
    let written = 0;
    for (const bar of render()) {
        const pcm = new Int16Array(bar.bars * 2);
        for (let i = 0; i < bar.bars; i++) {
            const l = Math.tanh(bar.L[i] * gain) * trim * bar.fade;
            const r = Math.tanh(bar.R[i] * gain) * trim * bar.fade;
            outPeak = Math.max(outPeak, Math.abs(l), Math.abs(r));
            pcm[i * 2] = Math.round(Math.max(-1, Math.min(1, l)) * 32767);
            pcm[i * 2 + 1] = Math.round(Math.max(-1, Math.min(1, r)) * 32767);
        }
        if (!ffmpeg.stdin.write(Buffer.from(pcm.buffer))) await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
        written++;
        if (written % 80 === 0) console.log(`  ${written}/${TOTAL_BARS} bars`);
    }
    ffmpeg.stdin.end();
    await done;
    const size = statSync(OUT).size;
    console.log(`Wrote audio/nocturne-house.mp3: ${(size / 1048576).toFixed(1)} MiB, output peak ${outPeak.toFixed(3)}`);
    if (size > 25 * 1048576) throw new Error('The file is over the 25 MiB Cloudflare Pages limit: lower CYCLES or the bit rate.');
}

main().catch(error => {
    console.error(`Default set failed: ${error.message}`);
    process.exitCode = 1;
});
