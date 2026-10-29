#!/usr/bin/env node
// Rebuild the restroom's small realistic props from their CC0 Poly Haven sources.
//
//   js/models/restroom/source/wet_floor_sign.glb   Poly Haven "Wet Floor Sign 01" (Fran Calvente), geometry untouched.
//   js/models/restroom/source/metal_trash_can.glb  Poly Haven "Metal Trash Can" (GurJas Studios), simplified.
//   js/models/restroom/source/plunger.glb          Poly Haven "Plunger" (James Ray Cock), simplified.
//
// Each keeps its PBR maps as 512 px WebP, is joined to one draw per material and stays within a few hundred KiB; the club
// hosts everything itself, so no decoder (Draco, meshopt, KTX2) is used. Alpha-masked foliage is not used: the club
// renders every imported surface opaque. `npm run optimize:models` is not needed afterwards.
// Usage: node scripts/build-restroom-props.mjs [--force]

import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrimitives, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const API = 'https://api.polyhaven.com/files';
const TEXTURE = 512;

const PROPS = [
    { id: 'WetFloorSign_01', out: 'wet_floor_sign.glb', ratio: 1 },
    // The asset holds a clean can, a rusty one and two lids side by side: keep the clean open can with its handles.
    { id: 'metal_trash_can', out: 'metal_trash_can.glb', ratio: 0.2, dropNodes: /rust|_lid$/ },
    { id: 'plunger', out: 'plunger.glb', ratio: 0.35 }
];

const getJson = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return response.json();
};
const getBuffer = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

await MeshoptSimplifier.ready;

async function build(prop) {
    const out = join(ROOT, 'js', 'models', 'restroom', 'source', prop.out);
    if (!FORCE && existsSync(out)) return console.log(`${prop.out}: present`);
    const files = await getJson(`${API}/${prop.id}`);
    const gltf = files.gltf['1k'].gltf;
    const work = mkdtempSync(join(tmpdir(), 'vrclub-prop-'));
    try {
        writeFileSync(join(work, 'model.gltf'), await getBuffer(gltf.url));
        for (const [relative, info] of Object.entries(gltf.include)) {
            const target = join(work, relative);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, await getBuffer(info.url));
        }
        const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
        const document = await io.read(join(work, 'model.gltf'));
        const root = document.getRoot();
        if (prop.dropNodes) for (const node of root.listNodes()) if (prop.dropNodes.test(node.getName())) node.dispose();
        // Transmission would make a second, blended pass; the club renders every imported surface opaque.
        for (const extension of root.listExtensionsUsed()) {
            if (extension instanceof KHRMaterialsTransmission) extension.dispose();
        }
        const transforms = [dedup(), flatten(), joinPrimitives(), prune()];
        if (prop.ratio < 1) transforms.unshift(weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio: prop.ratio, error: 0.01 }));
        await document.transform(...transforms, prune());
        const slotNames = new Map();
        for (const material of root.listMaterials()) {
            slotNames.set(material.getBaseColorTexture(), 'baseColor');
            slotNames.set(material.getNormalTexture(), 'normal');
            slotNames.set(material.getMetallicRoughnessTexture(), 'orm');
        }
        for (const texture of root.listTextures()) {
            const slot = slotNames.get(texture) || 'baseColor';
            const image = await sharp(Buffer.from(texture.getImage()))
                .resize(TEXTURE, TEXTURE, { fit: 'inside', kernel: 'lanczos3' })
                .webp(slot === 'normal' ? { quality: 95 } : { quality: 86 })
                .toBuffer();
            texture.setImage(new Uint8Array(image)).setMimeType('image/webp');
        }
        if (root.listTextures().length && !root.listExtensionsUsed().some(extension => extension.extensionName === 'EXT_texture_webp')) {
            document.createExtension(EXTTextureWebP).setRequired(true);
        }
        mkdirSync(dirname(out), { recursive: true });
        await io.write(out, document);
        let triangles = 0, draws = 0;
        for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
            draws++;
            triangles += primitive.getIndices().getCount() / 3;
        }
        console.log(`${prop.out}: ${triangles} triangles, ${draws} draws`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

for (const prop of PROPS) await build(prop);
