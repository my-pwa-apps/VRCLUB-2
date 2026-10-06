#!/usr/bin/env node
// Bake the street outside the club from the Quaternius "Downtown City MegaKit" (Standard, CC0) into ONE
// runtime-ready GLB: js/models/city/downtown.glb.
//
// The kit is a modular set of 153 pieces (3 whole buildings, street and sidewalk tiles, decals, props) with 78 MB of
// PNG textures. A headset cannot afford that, so this script does the work offline:
//
//   * lays the pieces out (PLAN below) in club coordinates: x east, z toward the street, y up;
//   * drops what is never seen (the interior floor and its lobby), and turns the transparent glass into an opaque
//     dark pane (the project forces every loaded material opaque in VR);
//   * lifts each "fake interior" room card a few centimetres in front of the glass, so lit rooms show;
//   * simplifies every building by its distance from the player (LOD_BY_DISTANCE) with meshoptimizer;
//   * merges geometry per building and per material, so a building costs about 8 draws and the whole
//     street one mesh per material;
//   * re-encodes the textures: base colour 1024 px, packed ORM and normals 512 px, room cards 512 px, all WebP.
//
// It reads the kit from disk (it is not in the repo): unzip "Downtown City MegaKit[Standard].zip" and point
// --kit at its "Exports/glTF (Godot)" folder.
//
//   node scripts/build-city-assets.mjs --kit "C:/path/to/Exports/glTF (Godot)"
//
// Kit geometry is authored right-handed. Babylon's glTF loader mirrors X (root scaling (1,1,-1) + a 180 degree turn
// about Y), so a piece placed at club position (wx, wz) is written at kit x = -wx, and a piece "facing +z" in the club
// is the kit's own +z. Everything below is written in club coordinates; toKit() does the conversion.

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { quantize, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'js/models/city/downtown.glb');

const argIndex = process.argv.indexOf('--kit');
const KIT = argIndex > 0 ? process.argv[argIndex + 1] : process.env.CITY_KIT;
if (!KIT) {
    console.error('usage: node scripts/build-city-assets.mjs --kit "<kit>/Exports/glTF (Godot)"');
    process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Layout, in club metres. The club's front wall is at z = 0.25; the vestibule's street door is at z = 6.3.
// ---------------------------------------------------------------------------------------------------------------
const CITY = {
    halfLength: 48,          // the avenue runs x -48..48
    forecourtFrom: 0.25,     // paved forecourt in front of the club facade
    sidewalkNear: 6.25,      // near curb strip begins (the vestibule's street door opens onto it)
    roadFrom: 9.25,          // 12 m of road, four lanes
    roadTo: 21.25,
    farFront: 24.25,         // front plane of the far row of buildings
    clubGap: 13.5            // the near row starts this far either side of the club's centre line
};
const ROAD_CENTRE_Z = (CITY.roadFrom + CITY.roadTo) / 2;

// Local x extent and depth of the three whole buildings, in kit space (front plane z = 0, body toward -z).
const BUILDINGS = {
    Building_Large_2: { x: [-9, 11], depth: 16 },
    Building_Medium_2_001: { x: [-7, 7], depth: 12 },
    Building_Small_1: { x: [-7, 5], depth: 12 }
};
// 92 m of far row (x -46..46); 34 and 32 m of near row either side of the club.
const FAR_ROW = ['Building_Large_2', 'Building_Medium_2_001', 'Building_Small_1', 'Building_Large_2', 'Building_Small_1', 'Building_Medium_2_001'];
const NEAR_ROW_RIGHT = ['Building_Medium_2_001', 'Building_Large_2'];
const NEAR_ROW_LEFT = ['Building_Small_1', 'Building_Large_2'];

// Simplification by distance from the club's door at x = 0. The facades are thousands of separate window-frame
// islands, so the topological simplifier stops near 50%; beyond ~22 m the frames also go through the sloppy one.
// A visitor stands within about thirty metres of the near buildings and sees the far ones as a skyline.
const LOD_BY_DISTANCE = [[22, { ratio: 0.6 }], [Infinity, { ratio: 0.4, sloppy: 0.3 }]];
const lodFor = centreX => LOD_BY_DISTANCE.find(([limit]) => Math.abs(centreX) < limit)[1];

// ---------------------------------------------------------------------------------------------------------------
// Surfaces. Kit materials that share one texture and differ only by an instance tint the glTF does not carry
// are baked into vertex colour, so each family below is ONE runtime material (one draw per building).
// ---------------------------------------------------------------------------------------------------------------
const FAMILIES = {
    brick: { base: 'T_RedBrick_BaseColor', normal: 'T_RedBrick_Normal', orm: 'T_RedBrick_ORM' },
    trim: { base: 'T_Trim_BaseColor', normal: 'T_Trim_Normal', orm: 'T_Trim_ORM' },
    metal: { base: 'T_MetalConcrete_BaseColor', normal: 'T_MetalConcrete_Normal', orm: 'T_MetalConcrete_ORM' },
    concrete: { base: 'T_Concrete_BaseColor', normal: 'T_Concrete_Normal', orm: 'T_Concrete_ORM' },
    asphalt: { base: 'T_Concrete_Asphalt_BaseColor', normal: 'T_Concrete_Normal', orm: 'T_Concrete_ORM' },
    decals: { base: 'T_Street_Decals', mask: true },
    // Lit rooms, dark rooms and glass share one atlas: see ROOM_TILES.
    windows: {}
};

// Atlas tiles (2 x 2, 512 px each): the kit's three room pictures and one black tile for plain glass.
const ROOM_TILES = {
    roomLitA: { file: 'T_lit_interior_1', col: 0, row: 0 },
    roomLitB: { file: 'T_lit_interior_2', col: 1, row: 0 },
    roomDark: { file: 'T_dark_interior', col: 0, row: 1 },
    glass: { file: null, col: 1, row: 1 }
};

// Kit material -> family, vertex-colour tint and (for the window atlas) the tile. null = never seen, dropped.
const KIT_MATERIALS = {
    MI_RedBrick: { family: 'brick', tint: [0.85, 0.82, 0.8] },
    MI_RedBrick_Pale: { family: 'brick', tint: [1.0, 0.92, 0.8] },
    MI_InteriorWall: { family: 'brick', tint: [0.85, 0.82, 0.8] },
    MI_Trim: { family: 'trim', tint: [0.9, 0.9, 0.9] },
    MI_Trim_Dark: { family: 'trim', tint: [0.16, 0.15, 0.17] },
    MI_Trim_Green: { family: 'trim', tint: [0.13, 0.3, 0.22] },
    MI_Trim_MetalConcrete: { family: 'metal', tint: [0.8, 0.8, 0.82] },
    MI_Concrete: { family: 'concrete', tint: [0.85, 0.85, 0.85] },
    MI_Asphalt: { family: 'asphalt', tint: [0.9, 0.9, 0.92] },
    MI_Dirt: { family: 'asphalt', tint: [0.5, 0.45, 0.4] },
    MI_StreetDecals: { family: 'decals', tint: [1, 1, 1] },
    MI_Glass: { family: 'windows', tile: 'glass' },
    MI_FakeInterior_1: { family: 'windows', tile: 'roomLitA' },
    MI_FakeInterior_3: { family: 'windows', tile: 'roomLitA' },
    MI_FakeInterior_2: { family: 'windows', tile: 'roomLitB' },
    MI_FakeInterior_4: { family: 'windows', tile: 'roomDark' },
    MI_InteriorFloor: null // a lobby floor behind opaque glass: never seen
};
const ROOM_CARD_LIFT = 0.16; // metres along the card's own normal, so it sits in front of the glass

const TEXTURE_PX = { base: 1024, normal: 512, orm: 512, room: 512 };


// ---------------------------------------------------------------------------------------------------------------
// Placement list. Every entry is in club coordinates; `face` is the world direction the piece's front looks.
// ---------------------------------------------------------------------------------------------------------------
const plan = [];
const add = (piece, x, z, extra = {}) => plan.push({ piece, x, z, y: 0, face: '+z', ...extra });

function buildPlan() {
    const L = CITY.halfLength;
    // Pavement: the avenue's 6 m tiles, and 3 m forecourt tiles in front of the club and its neighbours.
    for (let x = -L + 3; x < L; x += 6) add('Street_4Lane', x, ROAD_CENTRE_Z, { group: 'street' });
    for (let x = -L + 1.5; x < L; x += 3) {
        add('Sidewalk_NoCurb_3m', x, 1.75, { group: 'street' });
        add('Sidewalk_NoCurb_3m', x, 4.75, { group: 'street' });
    }
    // Crosswalks: one in front of the club's door, one at each end of the block.
    for (const x of [0, -36, 36]) add('Decal_Crosswalk_Wide', x, ROAD_CENTRE_Z, { group: 'street' });
    // Street furniture on the far kerb and bollards that close the avenue.
    for (const x of [-44, -30, -14, 14, 30, 44]) add('Prop_Planter_Single', x, CITY.roadTo + 1.5, { group: 'street' });
    for (let z = CITY.roadFrom + 0.6; z < CITY.roadTo; z += 1.6) {
        add('Prop_Bollard', -L + 4, z, { group: 'street' });
        add('Prop_Bollard', L - 4, z, { group: 'street' });
    }

    // Far row: facing the club, along x -60..60.
    let cursor = -L;
    FAR_ROW.forEach((piece, i) => {
        const { x: [a, b] } = BUILDINGS[piece];
        add(piece, cursor - a, CITY.farFront, { face: '-z', group: `far${i}`, building: true, centre: cursor + (b - a) / 2 });
        cursor += b - a;
    });
    // Near row: either side of the club, facing the street, flush with the club's front wall.
    let right = CITY.clubGap;
    NEAR_ROW_RIGHT.forEach((piece, i) => {
        const { x: [a, b] } = BUILDINGS[piece];
        add(piece, right + b, CITY.forecourtFrom, { face: '+z', group: `nearR${i}`, building: true, centre: right + (b - a) / 2 });
        right += b - a;
    });
    let left = -CITY.clubGap;
    NEAR_ROW_LEFT.forEach((piece, i) => {
        const { x: [a, b] } = BUILDINGS[piece];
        add(piece, left + a, CITY.forecourtFrom, { face: '+z', group: `nearL${i}`, building: true, centre: left - (b - a) / 2 });
        left -= b - a;
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Transform helpers (kit space is right-handed; see the header).
// ---------------------------------------------------------------------------------------------------------------
const FACING = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };
function placementMatrix({ x, y, z, face }) {
    const [fx, fz] = FACING[face];
    const theta = Math.atan2(-fx, fz); // club facing -> kit facing is (-fx, fz); the kit front is +z
    return { cos: Math.cos(theta), sin: Math.sin(theta), tx: -x, ty: y, tz: z };
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await MeshoptSimplifier.ready;

const pieceCache = new Map();

/** Drop vertices no triangle uses (simplification leaves them behind) and renumber. */
function compact(prim) {
    const remap = new Int32Array(prim.position.length / 3).fill(-1);
    let used = 0;
    for (const index of prim.indices) if (remap[index] < 0) remap[index] = used++;
    const take = (source, size) => {
        const out = new Float32Array(used * size);
        for (let i = 0; i < remap.length; i++) {
            if (remap[i] < 0) continue;
            for (let k = 0; k < size; k++) out[remap[i] * size + k] = source[i * size + k];
        }
        return out;
    };
    prim.position = take(prim.position, 3);
    prim.normal = take(prim.normal, 3);
    prim.uv = take(prim.uv, 2);
    prim.indices = Uint32Array.from(prim.indices, index => remap[index]);
}

async function loadPiece(name, lod) {
    const key = `${name}@${lod.ratio}@${lod.sloppy || 0}`;
    if (pieceCache.has(key)) return pieceCache.get(key);
    const document = await io.read(join(KIT, `${name}.gltf`));
    if (lod.ratio < 1) {
        await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: lod.ratio, error: 0.01 }));
    }
    const prims = [];
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const kitName = primitive.getMaterial().getName();
            const spec = KIT_MATERIALS[kitName];
            if (spec === undefined) throw new Error(`${name}: unmapped kit material ${kitName}`);
            if (!spec) continue;
            const position = primitive.getAttribute('POSITION');
            const normal = primitive.getAttribute('NORMAL');
            const uv = primitive.getAttribute('TEXCOORD_0');
            const indices = primitive.getIndices();
            const count = position.getCount();
            const prim = {
                spec,
                position: Float32Array.from(position.getArray()),
                normal: Float32Array.from(normal.getArray()),
                uv: Float32Array.from(uv.getArray()),
                indices: indices ? Uint32Array.from(indices.getArray()) : Uint32Array.from({ length: count }, (_, i) => i)
            };
            // The window-frame material is most of a facade. Where nobody stands close enough to see
            // individual mullions, let the sloppy (vertex-clustering) simplifier take it the rest of the way.
            if (lod.sloppy && spec.family === 'metal') {
                const target = Math.floor(prim.indices.length * lod.sloppy / 3) * 3;
                [prim.indices] = MeshoptSimplifier.simplifySloppy(prim.indices, prim.position, 3, null, target, 0.08);
            }
            compact(prim);
            prims.push(prim);
        }
    }
    pieceCache.set(key, prims);
    return prims;
}

// ---------------------------------------------------------------------------------------------------------------
// Accumulate: group -> family -> merged arrays.
// ---------------------------------------------------------------------------------------------------------------
const groups = new Map();
const bounds = new Map();
const uvRange = new Map();
function accumulate(entry, prims) {
    const m = placementMatrix(entry);
    const group = groups.get(entry.group) || groups.set(entry.group, new Map()).get(entry.group);
    const box = bounds.get(entry.group) || bounds.set(entry.group, { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }).get(entry.group);
    for (const prim of prims) {
        const { family, tint, tile } = prim.spec;
        const bucket = group.get(family) || group.set(family, { position: [], normal: [], uv: [], color: [], indices: [], vertices: 0 }).get(family);
        const isCard = tile && tile !== 'glass';
        const lift = isCard ? ROOM_CARD_LIFT : 0;
        const vertexCount = prim.position.length / 3;
        const tileInfo = tile ? ROOM_TILES[tile] : null;
        for (let i = 0; i < vertexCount; i++) {
            let px = prim.position[i * 3], py = prim.position[i * 3 + 1], pz = prim.position[i * 3 + 2];
            const nx = prim.normal[i * 3], ny = prim.normal[i * 3 + 1], nz = prim.normal[i * 3 + 2];
            if (lift) { px += nx * lift; py += ny * lift; pz += nz * lift; }
            const rx = px * m.cos + pz * m.sin + m.tx;
            const rz = -px * m.sin + pz * m.cos + m.tz;
            const ry = py + m.ty;
            bucket.position.push(rx, ry, rz);
            bucket.normal.push(nx * m.cos + nz * m.sin, ny, -nx * m.sin + nz * m.cos);
            let u = prim.uv[i * 2], v = prim.uv[i * 2 + 1];
            if (tileInfo) {
                if (tile === 'glass') { u = 0.5; v = 0.5; } // the whole pane samples the black tile's centre
                else {
                    const range = uvRange.get(tile) || uvRange.set(tile, { min: [1e9, 1e9], max: [-1e9, -1e9] }).get(tile);
                    range.min[0] = Math.min(range.min[0], u); range.max[0] = Math.max(range.max[0], u);
                    range.min[1] = Math.min(range.min[1], v); range.max[1] = Math.max(range.max[1], v);
                    u = Math.min(1, Math.max(0, u)); v = Math.min(1, Math.max(0, v));
                }
                u = (tileInfo.col + u) / 2;
                v = (tileInfo.row + v) / 2;
            }
            bucket.uv.push(u, v);
            if (tint) bucket.color.push(Math.round(tint[0] * 255), Math.round(tint[1] * 255), Math.round(tint[2] * 255), 255);
            // Track the footprint in CLUB x (kit x is mirrored) for collision and reporting.
            const worldX = -rx;
            if (worldX < box.min[0]) box.min[0] = worldX;
            if (worldX > box.max[0]) box.max[0] = worldX;
            if (ry < box.min[1]) box.min[1] = ry;
            if (ry > box.max[1]) box.max[1] = ry;
            if (rz < box.min[2]) box.min[2] = rz;
            if (rz > box.max[2]) box.max[2] = rz;
        }
        for (let i = 0; i < prim.indices.length; i++) bucket.indices.push(prim.indices[i] + bucket.vertices);
        bucket.vertices += vertexCount;
    }
}

buildPlan();
for (const entry of plan) {
    const lod = entry.building ? lodFor(entry.centre) : { ratio: 1 };
    accumulate(entry, await loadPiece(entry.piece, lod));
}
for (const [tile, range] of uvRange) {
    console.log(`room card UV ${tile}: u ${range.min[0].toFixed(2)}..${range.max[0].toFixed(2)}  v ${range.min[1].toFixed(2)}..${range.max[1].toFixed(2)}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Textures and materials.
// ---------------------------------------------------------------------------------------------------------------
const output = new Document();
const buffer = output.createBuffer();
output.createExtension(EXTTextureWebP).setRequired(true);
const textureCache = new Map();
async function texture(file, kind) {
    const key = `${file}:${kind}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const max = TEXTURE_PX[kind];
    const source = readFileSync(join(KIT, `${file}.png`));
    const lossless = kind === 'normal';
    const image = await sharp(source)
        .resize(max, max, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
        .webp(lossless ? { lossless: true } : { quality: kind === 'base' ? 86 : 90, alphaQuality: 90 })
        .toBuffer();
    const made = output.createTexture(file).setImage(image).setMimeType('image/webp');
    textureCache.set(key, made);
    return made;
}

/** The 1024 px window atlas: three room pictures and a black tile for plain glass. */
async function windowAtlas() {
    const size = TEXTURE_PX.room;
    const layers = [];
    for (const tile of Object.values(ROOM_TILES)) {
        if (!tile.file) continue;
        const picture = await sharp(readFileSync(join(KIT, `${tile.file}.png`)))
            .resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        layers.push({ input: picture.data, raw: { width: size, height: size, channels: 3 }, left: tile.col * size, top: tile.row * size });
    }
    const image = await sharp({ create: { width: size * 2, height: size * 2, channels: 3, background: '#000000' } })
        .composite(layers).webp({ quality: 88 }).toBuffer();
    return output.createTexture('windows').setImage(image).setMimeType('image/webp');
}

const materialCache = new Map();
async function material(familyId) {
    if (materialCache.has(familyId)) return materialCache.get(familyId);
    const family = FAMILIES[familyId];
    const made = output.createMaterial(familyId).setDoubleSided(familyId === 'windows' || Boolean(family.mask));
    if (familyId === 'windows') {
        // Each room's own picture is its light: near-black base, emissive atlas, a little gloss on the pane.
        made.setBaseColorFactor([0.02, 0.022, 0.03, 1]).setMetallicFactor(0).setRoughnessFactor(0.12)
            .setEmissiveTexture(await windowAtlas()).setEmissiveFactor([1.0, 0.95, 0.85]);
    } else {
        made.setBaseColorTexture(await texture(family.base, 'base')).setBaseColorFactor([1, 1, 1, 1]);
        if (family.mask) {
            made.setAlphaMode('MASK').setAlphaCutoff(0.5).setMetallicFactor(0).setRoughnessFactor(0.85);
        } else {
            made.setMetallicFactor(1).setRoughnessFactor(1)
                .setNormalTexture(await texture(family.normal, 'normal'));
            const orm = await texture(family.orm, 'orm');
            made.setOcclusionTexture(orm).setMetallicRoughnessTexture(orm);
        }
    }
    materialCache.set(familyId, made);
    return made;
}

// ---------------------------------------------------------------------------------------------------------------
// Assemble: one node + mesh per group, one primitive per family.
// ---------------------------------------------------------------------------------------------------------------
const scene = output.createScene('city');
let triangles = 0;
const report = [];
for (const [groupName, families] of groups) {
    const mesh = output.createMesh(groupName);
    let groupTriangles = 0;
    for (const [familyId, data] of families) {
        const primitive = output.createPrimitive();
        const accessor = (type, array) => output.createAccessor().setType(type).setArray(array).setBuffer(buffer);
        primitive.setAttribute('POSITION', accessor('VEC3', new Float32Array(data.position)))
            .setAttribute('NORMAL', accessor('VEC3', new Float32Array(data.normal)))
            .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(data.uv)))
            .setIndices(accessor('SCALAR', data.vertices > 65535 ? new Uint32Array(data.indices) : new Uint16Array(data.indices)))
            .setMaterial(await material(familyId));
        if (data.color.length) {
            primitive.setAttribute('COLOR_0', accessor('VEC4', new Uint8Array(data.color)).setNormalized(true));
        }
        mesh.addPrimitive(primitive);
        groupTriangles += data.indices.length / 3;
    }
    const box = bounds.get(groupName);
    const node = output.createNode(groupName).setMesh(mesh).setExtras({
        kind: groupName === 'street' ? 'street' : 'building',
        // Club-space footprint, for the collision boxes the runtime derives.
        min: box.min.map(v => +v.toFixed(2)), max: box.max.map(v => +v.toFixed(2))
    });
    scene.addChild(node);
    triangles += groupTriangles;
    report.push(`${groupName.padEnd(8)} ${String(Math.round(groupTriangles)).padStart(7)} tris  ${families.size} materials  x ${box.min[0].toFixed(1)}..${box.max[0].toFixed(1)}  z ${box.min[2].toFixed(1)}..${box.max[2].toFixed(1)}  h ${box.max[1].toFixed(1)}`);
}

mkdirSync(dirname(OUT), { recursive: true });
// Positions (14 bit, relative to each node's own extent) and normals (8 bit) are stored as integers: about a third
// less geometry. UVs stay float because the kit tiles textures well beyond 0..1.
await output.transform(quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 8 }));
const glb = await io.writeBinary(output);
writeFileSync(OUT, glb);
console.log(report.join('\n'));
console.log(`\n${Math.round(triangles)} triangles, ${materialCache.size} materials, ${textureCache.size + 1} textures`);
const imageBytes = output.getRoot().listTextures().reduce((sum, t) => sum + t.getImage().byteLength, 0);
console.log(`textures ${(imageBytes / 1048576).toFixed(2)} MB, geometry ${((glb.byteLength - imageBytes) / 1048576).toFixed(2)} MB`);
console.log(`wrote ${OUT.replace(ROOT, '').replace(/\\/g, '/')}  ${(statSync(OUT).size / 1048576).toFixed(2)} MB`);
