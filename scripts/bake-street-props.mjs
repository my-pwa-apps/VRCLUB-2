#!/usr/bin/env node
// Add the small CC0 Quaternius street props to the already-baked city GLB. The source packs stay outside the
// repository; their flat colours (including the cars' 4 px palette textures) are baked into vertex colour.
//
//   node scripts/bake-street-props.mjs --cars "<Car Pack>/OBJ" --house "<Ultimate House Interior Pack>/OBJ"
//
// Re-running is safe: nodes from the previous prop bake are replaced in place.

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CITY = join(ROOT, 'js/models/city/downtown.glb');
const argument = name => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : null;
};
const CAR_DIR = argument('--cars') || process.env.QUATERNIUS_CARS;
const HOUSE_DIR = argument('--house') || process.env.QUATERNIUS_HOUSE;
if (!CAR_DIR || !HOUSE_DIR) {
    console.error('usage: node scripts/bake-street-props.mjs --cars "<Car Pack>/OBJ" --house "<House Pack>/OBJ"');
    process.exit(1);
}

const PLACEMENTS = [
    // Cars sit just inside the two kerbs, parallel to the avenue and clear of all three crosswalks.
    { name: 'parkedCarWest', kind: 'parkedCar', dir: CAR_DIR, source: 'BasicCar', palette: '../Blends/CarTexture.png', x: -16, z: 10.35, yaw: Math.PI / 2 },
    { name: 'parkedCarEast', kind: 'parkedCar', dir: CAR_DIR, source: 'SimpleCarShort', palette: '../Blends/CarTexture.png', x: 17, z: 20.15, yaw: -Math.PI / 2 },
    { name: 'parkedTaxi', kind: 'parkedCar', dir: CAR_DIR, source: 'Taxi', palette: '../Blends/TaxiTexture.png', x: 29.5, z: 10.35, yaw: Math.PI / 2 },
    // One bin at either end of the entrance/queue frontage. Both remain reachable without narrowing the doorway.
    { name: 'streetBinEntrance', kind: 'streetBin', dir: HOUSE_DIR, source: 'Trashcan_Small1', x: -4.1, z: 7.55, yaw: 0 },
    { name: 'streetBinQueue', kind: 'streetBin', dir: HOUSE_DIR, source: 'Trashcan_Small2', x: 10.8, z: 7.55, yaw: 0.25 },
    // A single small potted plant under the entrance light, outside the door swing and the stair opening.
    { name: 'entrancePlant', kind: 'entrancePlant', dir: HOUSE_DIR, source: 'Houseplant_4', x: -2.35, z: 6.85, yaw: -0.35 }
];
const NODE_PREFIX = /^(parkedCar|parkedTaxi|streetBin|entrancePlant)/;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(CITY);
const root = document.getRoot();
for (const node of root.listNodes()) {
    if (NODE_PREFIX.test(node.getName())) node.dispose();
}
await document.transform(prune());

const buffer = root.listBuffers()[0] || document.createBuffer();
let material = root.listMaterials().find(item => item.getName() === 'streetProps');
if (!material) {
    material = document.createMaterial('streetProps')
        .setBaseColorFactor([1, 1, 1, 1])
        .setMetallicFactor(0.18)
        .setRoughnessFactor(0.58);
}
const scene = root.getDefaultScene() || root.listScenes()[0] || document.createScene('city');

const parseMtl = file => {
    const materials = new Map();
    let current = null;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('newmtl ')) {
            current = line.slice(7).trim();
            materials.set(current, [190, 190, 190, 255]);
        } else if (current && line.startsWith('Kd ')) {
            const rgb = line.slice(3).trim().split(/\s+/).map(Number);
            materials.set(current, rgb.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255)).concat(255));
        }
    }
    return materials;
};

async function readPalette(file) {
    if (!file) return null;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

function samplePalette(palette, uv) {
    if (!palette || !uv) return null;
    const u = Math.max(0, Math.min(1, uv[0]));
    const v = Math.max(0, Math.min(1, uv[1]));
    const x = Math.round(u * (palette.width - 1));
    const y = Math.round((1 - v) * (palette.height - 1));
    const offset = (y * palette.width + x) * 4;
    return Array.from(palette.data.subarray(offset, offset + 4));
}

async function parseObj(entry) {
    const positions = [[0, 0, 0]];
    const normals = [[0, 1, 0]];
    const uvs = [[0, 0]];
    const faces = [];
    let currentMaterial = '';
    const source = readFileSync(join(entry.dir, `${entry.source}.obj`), 'utf8');
    for (const raw of source.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('v ')) positions.push(line.slice(2).trim().split(/\s+/).map(Number));
        else if (line.startsWith('vn ')) normals.push(line.slice(3).trim().split(/\s+/).map(Number));
        else if (line.startsWith('vt ')) uvs.push(line.slice(3).trim().split(/\s+/).map(Number));
        else if (line.startsWith('usemtl ')) currentMaterial = line.slice(7).trim();
        else if (line.startsWith('f ')) {
            const corners = line.slice(2).trim().split(/\s+/).map(token => {
                const [v, vt, vn] = token.split('/').map(value => value ? Number(value) : 0);
                return { v, vt, vn };
            });
            for (let i = 1; i + 1 < corners.length; i++) faces.push({ corners: [corners[0], corners[i], corners[i + 1]], material: currentMaterial });
        }
    }

    const colors = parseMtl(join(entry.dir, `${entry.source}.mtl`));
    const palette = await readPalette(entry.palette ? join(entry.dir, entry.palette) : null);
    const bottom = Math.min(...positions.slice(1).map(position => position[1]));
    const cos = Math.cos(entry.yaw), sin = Math.sin(entry.yaw);
    const out = { position: [], normal: [], color: [], indices: [], bounds: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] } };

    for (const face of faces) {
        const points = face.corners.map(corner => positions[corner.v]);
        const edgeA = points[1].map((value, axis) => value - points[0][axis]);
        const edgeB = points[2].map((value, axis) => value - points[0][axis]);
        const cross = [
            edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1],
            edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2],
            edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0]
        ];
        const length = Math.hypot(...cross) || 1;
        const faceNormal = cross.map(value => value / length);
        for (const corner of face.corners) {
            const point = positions[corner.v];
            const normal = corner.vn ? normals[corner.vn] : faceNormal;
            const worldX = point[0] * cos + point[2] * sin + entry.x;
            const worldY = point[1] - bottom;
            const worldZ = -point[0] * sin + point[2] * cos + entry.z;
            const worldNX = normal[0] * cos + normal[2] * sin;
            const worldNZ = -normal[0] * sin + normal[2] * cos;
            // The city GLB is right-handed. Babylon mirrors its X back into the club's left-handed coordinates.
            out.position.push(-worldX, worldY, worldZ);
            out.normal.push(-worldNX, normal[1], worldNZ);
            out.color.push(...(samplePalette(palette, corner.vt ? uvs[corner.vt] : null) || colors.get(face.material) || [190, 190, 190, 255]));
            const index = out.position.length / 3 - 1;
            out.indices.push(index);
            const clubPoint = [worldX, worldY, worldZ];
            for (let axis = 0; axis < 3; axis++) {
                out.bounds.min[axis] = Math.min(out.bounds.min[axis], clubPoint[axis]);
                out.bounds.max[axis] = Math.max(out.bounds.max[axis], clubPoint[axis]);
            }
        }
    }
    return out;
}

const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const reports = [];
for (const entry of PLACEMENTS) {
    const data = await parseObj(entry);
    const mesh = document.createMesh(entry.name);
    const primitive = document.createPrimitive()
        .setAttribute('POSITION', accessor('VEC3', new Float32Array(data.position)))
        .setAttribute('NORMAL', accessor('VEC3', new Float32Array(data.normal)))
        .setAttribute('COLOR_0', accessor('VEC4', new Uint8Array(data.color)).setNormalized(true))
        .setIndices(accessor('SCALAR', data.position.length / 3 > 65535 ? new Uint32Array(data.indices) : new Uint16Array(data.indices)))
        .setMaterial(material);
    mesh.addPrimitive(primitive);
    const rounded = values => values.map(value => +value.toFixed(2));
    scene.addChild(document.createNode(entry.name).setMesh(mesh).setExtras({
        kind: entry.kind,
        min: rounded(data.bounds.min),
        max: rounded(data.bounds.max)
    }));
    reports.push(`${entry.name.padEnd(18)} ${String(data.indices.length / 3).padStart(5)} tris  x ${data.bounds.min[0].toFixed(1)}..${data.bounds.max[0].toFixed(1)}  z ${data.bounds.min[2].toFixed(1)}..${data.bounds.max[2].toFixed(1)}  h ${data.bounds.max[1].toFixed(1)}`);
}

const glb = await io.writeBinary(document);
writeFileSync(CITY, glb);
console.log(reports.join('\n'));
console.log(`wrote ${CITY.replace(ROOT, '').replace(/\\/g, '/')}  ${(statSync(CITY).size / 1048576).toFixed(2)} MB`);
