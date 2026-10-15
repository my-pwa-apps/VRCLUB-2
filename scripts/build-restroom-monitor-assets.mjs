#!/usr/bin/env node
// Rebuild the club restroom and DJ monitor speaker GLBs from their CC0 Poly Pizza / Quaternius / iPoly3D sources.
//
//   js/models/monitors/source/monitor_speaker.glb  iPoly3D "Speaker" (CC0, poly.pizza/m/zOQOThSpuo). Flat materials
//                                                  baked into normalized 8-bit COLOR_0 vertex colours and merged into
//                                                  one mesh / one PBR material (1 draw, 794 triangles).
//   js/models/restroom/source/toilet.glb           Quaternius "Toilet" (CC0, poly.pizza/m/WAu50yGFVt). Porcelain
//                                                  colour baked into COLOR_0 and flattened into 1 draw (402 triangles).
//   js/models/restroom/source/bathroom_sink.glb    Quaternius "Bathroom Sink" (CC0, poly.pizza/m/OMCJDgMUui).
//                                                  Porcelain basin and brushed-steel tap/trap baked into COLOR_0 and
//                                                  merged into 1 draw (350 triangles).
//
// Usage: node scripts/build-restroom-monitor-assets.mjs [--force]

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrimitives, prune } from '@gltf-transform/functions';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const ASSETS = [
    {
        label: 'DJ monitor speaker',
        url: 'https://static.poly.pizza/202d1d68-2821-4482-a349-d86983b02df7.glb',
        out: 'js/models/monitors/source/monitor_speaker.glb',
        materialName: 'monitorSpeakerMat',
        metallic: 0.22,
        roughness: 0.52,
        palette: {
            'Material.013': [0.05, 0.05, 0.06, 1], // Matte black studio cabinet
            'Material.001': [0.16, 0.17, 0.19, 1], // Dark steel isolation base
            'BlackStruss': [0.09, 0.09, 0.11, 1],  // Front acoustic baffle & ports
            'Material.014': [0.82, 0.64, 0.18, 1]  // Studio monitor woofer & tweeter cones
        }
    },
    {
        label: 'Restroom toilet',
        url: 'https://static.poly.pizza/e3c404e8-3149-49ca-92dc-a81d972b71b8.glb',
        out: 'js/models/restroom/source/toilet.glb',
        materialName: 'toiletPorcelainMat',
        metallic: 0.08,
        roughness: 0.22,
        palette: {
            'White': [0.88, 0.89, 0.91, 1]
        }
    },
    {
        label: 'Restroom washbasin',
        url: 'https://static.poly.pizza/fe1011fc-a48c-4fab-8c96-a97a819a68cf.glb',
        out: 'js/models/restroom/source/bathroom_sink.glb',
        materialName: 'sinkPorcelainMat',
        metallic: 0.18,
        roughness: 0.25,
        palette: {
            'White': [0.88, 0.89, 0.91, 1],
            'Grey': [0.58, 0.61, 0.65, 1]
        }
    }
];

async function buildAsset(spec) {
    const outPath = join(ROOT, spec.out);
    if (!FORCE && existsSync(outPath)) {
        console.log(`${spec.label}: present (${spec.out})`);
        return;
    }
    const response = await fetch(spec.url);
    if (!response.ok) throw new Error(`${spec.url} -> HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const document = await io.readBinary(bytes);
    const root = document.getRoot();
    const buffer = root.listBuffers()[0] || document.createBuffer();

    const material = document.createMaterial(spec.materialName)
        .setBaseColorFactor([1, 1, 1, 1])
        .setMetallicFactor(spec.metallic)
        .setRoughnessFactor(spec.roughness);

    for (const mesh of root.listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute('POSITION');
            const count = pos.getCount();
            const oldMat = prim.getMaterial();
            const oldName = oldMat ? oldMat.getName() : '';
            const rgba = spec.palette[oldName] || (oldMat ? oldMat.getBaseColorFactor() : [0.5, 0.5, 0.5, 1]);
            const colors = new Uint8Array(count * 4);
            const r = Math.round(rgba[0] * 255);
            const g = Math.round(rgba[1] * 255);
            const b = Math.round(rgba[2] * 255);
            for (let i = 0; i < count; i++) {
                colors[i * 4] = r;
                colors[i * 4 + 1] = g;
                colors[i * 4 + 2] = b;
                colors[i * 4 + 3] = 255;
            }
            const colorAcc = document.createAccessor('COLOR_0')
                .setBuffer(buffer)
                .setType('VEC4')
                .setArray(colors)
                .setNormalized(true);
            prim.setAttribute('COLOR_0', colorAcc);
            prim.setMaterial(material);
        }
    }
    for (const m of root.listMaterials()) {
        if (m !== material) m.dispose();
    }
    await document.transform(flatten(), dedup(), joinPrimitives(), prune());
    mkdirSync(dirname(outPath), { recursive: true });
    await io.write(outPath, document);
    const triangles = root.listMeshes().reduce(
        (sum, m) => sum + m.listPrimitives().reduce((ps, p) => ps + p.getIndices().getCount() / 3, 0), 0);
    console.log(`${spec.label}: ${triangles} triangles -> ${spec.out}`);
}

for (const spec of ASSETS) {
    await buildAsset(spec);
}
