// Temporary measurement harness (deleted after tuning).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { TextDecoder, TextEncoder } from 'node:util';
import { Blob } from 'node:buffer';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const box = { console, setTimeout, clearTimeout, setInterval, clearInterval, performance, URL, TextDecoder, TextEncoder, Blob,
    ArrayBuffer, Uint8Array, Float32Array, DataView, Promise, Map, Set, Math, JSON, Date,
    atob: s => Buffer.from(s, 'base64').toString('binary'), btoa: s => Buffer.from(s, 'binary').toString('base64') };
box.window = box; box.self = box; box.globalThis = box;
box.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };
box.navigator = { userAgent: 'node' };
vm.createContext(box);
for (const file of ['js/vendor/babylon.js', 'js/vendor/babylonjs.loaders.min.js']) vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), box);
const B = box.BABYLON;
B.Logger.LogLevels = B.Logger.ErrorLogLevel;
const scene = new B.Scene(new B.NullEngine());
const file = process.argv[2] || 'club-crowd-m6.glb';
const clip = process.argv[3] || 'Smoke_Loop';
const bytes = readFileSync(join(ROOT, 'js/models/avatars', file));
const container = await B.SceneLoader.LoadAssetContainerAsync('', `data:application/octet-stream;base64,${bytes.toString('base64')}`, scene, null, '.glb');
const entry = container.instantiateModelsToScene(n => n, false, { doNotInstantiate: true });
const root = entry.rootNodes[0];
root.computeWorldMatrix(true);
const node = name => root.getDescendants(false, n => n.name === name)[0];
const at = name => { const n = node(name); n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); };
const group = entry.animationGroups.find(a => a.name.endsWith(clip));
group.start(false); group.pause();
const mesh = root.getChildMeshes().find(m => m.skeleton);
const f = v => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

// Face: skinned vertices of the head in the first frame.
group.goToFrame(group.from);
root.computeWorldMatrix(true);
mesh.skeleton.prepare(true);
const neck = at('Neck'), head = at('Head');
const pts = mesh.getPositionData(true, false);
let top = -1e9, minY = 1e9;
const headPts = [];
const wm = mesh.computeWorldMatrix(true);
for (let i = 0; i < pts.length; i += 3) {
    const p = B.Vector3.TransformCoordinates(new B.Vector3(pts[i], pts[i + 1], pts[i + 2]), wm);
    if (p.y > neck.y + 0.02 && Math.abs(p.x - head.x) < 0.15) { headPts.push(p); top = Math.max(top, p.y); minY = Math.min(minY, p.y); }
}
console.log('neck', f(neck), 'head', f(head), 'head verts y', minY.toFixed(3), top.toFixed(3), 'count', headPts.length);
for (let y = minY; y < top; y += 0.02) {
    const band = headPts.filter(p => p.y >= y && p.y < y + 0.02 && Math.abs(p.x - head.x) < 0.03);
    if (band.length) console.log(` y ${y.toFixed(2)}  front z ${Math.max(...band.map(p => p.z)).toFixed(3)} back z ${Math.min(...band.map(p => p.z)).toFixed(3)}`);
}
const N = 32;
group.goToFrame(group.from); root.computeWorldMatrix(true);
console.log('shoulder', f(at('UpperArm.R')), 'w', f(at('Wrist.R')), 'm1', f(at('Middle1.R')), 'm2', f(at('Middle2.R')), 'm3', f(at('Middle3.R')), 'm4', f(at('Middle4.R')), 'i2', f(at('Index2.R')), 'i3', f(at('Index3.R')), 'p1', f(at('Pinky1.R')), 'i1', f(at('Index1.R')));
// Torso front profile.
for (let y = 1.2; y < 1.52; y += 0.04) {
    const band = [];
    for (let i = 0; i < pts.length; i += 3) {
        const p = B.Vector3.TransformCoordinates(new B.Vector3(pts[i], pts[i + 1], pts[i + 2]), wm);
        if (p.y >= y && p.y < y + 0.04 && Math.abs(p.x) < 0.1) band.push(p.z);
    }
    if (band.length) console.log(` torso y ${y.toFixed(2)} front z ${Math.max(...band).toFixed(3)}`);
}
if (process.argv[4] !== 'all') process.exit(0);
// Mouth, in the Head's frame, from the first frame's face profile (lips at y 1.578, front z 0.172 on m6).
group.goToFrame(group.from); root.computeWorldMatrix(true);
const headNode = node('Head');
const inv = headNode.computeWorldMatrix(true).clone().invert();
const mouthLocal = B.Vector3.TransformCoordinates(new B.Vector3(0, 1.578, 0.172), inv);
const centreLocal = B.Vector3.TransformCoordinates(new B.Vector3(0, 1.66, 0.06), inv);
let best = 1e9;
for (let i = 0; i <= 48; i++) {
    group.goToFrame(group.from + (group.to - group.from) * i / 48);
    root.computeWorldMatrix(true);
    const hw = headNode.computeWorldMatrix(true);
    const mouth = B.Vector3.TransformCoordinates(mouthLocal, hw), centre = B.Vector3.TransformCoordinates(centreLocal, hw);
    const i2 = at('Index2.R'), i3 = at('Index3.R'), m2 = at('Middle2.R'), m3 = at('Middle3.R'), m4 = at('Middle4.R'), i4 = at('Index4.R');
    const hold = i2.add(i3).add(m2).add(m3).scale(0.25);
    const fingers = m3.subtract(m2).normalize();
    const palm = B.Vector3.Cross(fingers, i2.subtract(m2)).normalize();
    const filter = hold.add(palm.scale(0.03)), lit = hold.subtract(palm.scale(0.055));
    const d = B.Vector3.Distance(filter, mouth);
    best = Math.min(best, d);
    console.log(i, 'filter->mouth', d.toFixed(3), 'lit->centre', B.Vector3.Distance(lit, centre).toFixed(3),
        'tips->centre', Math.min(B.Vector3.Distance(m4, centre), B.Vector3.Distance(i4, centre), B.Vector3.Distance(m3, centre)).toFixed(3),
        'thumb->centre', Math.min(B.Vector3.Distance(at('Thumb3.R'), centre), B.Vector3.Distance(at('Thumb2.R'), centre)).toFixed(3),
        'wrist', f(at('Wrist.R')), 'palm', f(palm), 'mouth', f(mouth), 'gap', f(filter.subtract(mouth)));
}
console.log('closest filter to lips', best.toFixed(3));
process.exit(0);
for (let i = 0; i <= N; i++) {
    group.goToFrame(group.from + (group.to - group.from) * i / N);
    root.computeWorldMatrix(true);
    const w = at('Wrist.R'), m1 = at('Middle1.R'), m2 = at('Middle2.R'), i2 = at('Index2.R'), hd = at('Head');
    console.log(i, 'head', f(hd), 'wrist', f(w), 'mid1', f(m1), 'mid2', f(m2), 'idx2', f(i2));
}
