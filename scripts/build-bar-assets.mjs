#!/usr/bin/env node
// Rebuild the bar's third-party assets from their CC0 Poly Haven sources.
//
//   textures/barWood/{diff,normal,orm}.jpg   Poly Haven "Dark Wood" (Rob Tuytel), 1K. The normal is the
//                                            DirectX variant like every other surface set, and Poly Haven's
//                                            `arm` map is already R = occlusion, G = roughness, B = metallic.
//   js/models/barstool/source/bar_stool.glb  Poly Haven "Metal Stool 03", geometry untouched (about 6.6k
//                                            triangles), 1K textures re-encoded as 512 px WebP. Five stand at the bar.
//
// `npm run optimize:models` is not needed afterwards: this script already writes budget-sized files.
// Usage: node scripts/build-bar-assets.mjs [--force]

import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsTransmission } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORCE = process.argv.includes('--force');
const API = 'https://api.polyhaven.com/files';
const STOOL_TEXTURE = 512;

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

async function buildWoodTextures() {
    const dir = join(ROOT, 'textures', 'barWood');
    const targets = ['diff.jpg', 'normal.jpg', 'orm.jpg'];
    if (!FORCE && targets.every(name => existsSync(join(dir, name)))) return console.log('barWood textures: present');
    const files = await getJson(`${API}/dark_wood`);
    mkdirSync(dir, { recursive: true });
    const sources = { 'diff.jpg': files.Diffuse['1k'].jpg.url, 'normal.jpg': files.nor_dx['1k'].jpg.url, 'orm.jpg': files.arm['1k'].jpg.url };
    for (const [name, url] of Object.entries(sources)) {
        const input = await getBuffer(url);
        // Full-resolution chroma for the packed map: its channels are data, not colour.
        const output = name === 'orm.jpg'
            ? await sharp(input).jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
            : await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        writeFileSync(join(dir, name), output);
        console.log(`textures/barWood/${name}: ${(output.length / 1024).toFixed(0)} KiB`);
    }
}

async function buildStool() {
    const out = join(ROOT, 'js', 'models', 'barstool', 'source', 'bar_stool.glb');
    if (!FORCE && existsSync(out)) return console.log('bar stool: present');
    const files = await getJson(`${API}/metal_stool_03`);
    const gltf = files.gltf['1k'].gltf;
    const work = mkdtempSync(join(tmpdir(), 'vrclub-stool-'));
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
        // Transmission would make the chair a second, blended pass; the club renders every imported surface opaque.
        for (const extension of root.listExtensionsUsed()) {
            if (extension instanceof KHRMaterialsTransmission) extension.dispose();
        }
        await document.transform(dedup(), prune());
        const slotNames = new Map();
        for (const material of root.listMaterials()) {
            slotNames.set(material.getBaseColorTexture(), 'baseColor');
            slotNames.set(material.getNormalTexture(), 'normal');
            slotNames.set(material.getMetallicRoughnessTexture(), 'orm');
        }
        for (const texture of root.listTextures()) {
            const slot = slotNames.get(texture) || 'baseColor';
            const image = await sharp(Buffer.from(texture.getImage()))
                .resize(STOOL_TEXTURE, STOOL_TEXTURE, { fit: 'inside', kernel: 'lanczos3' })
                .webp(slot === 'normal' ? { lossless: true } : { quality: 88 })
                .toBuffer();
            texture.setImage(new Uint8Array(image)).setMimeType('image/webp');
        }
        if (!root.listExtensionsUsed().some(extension => extension.extensionName === 'EXT_texture_webp')) {
            document.createExtension(EXTTextureWebP).setRequired(true);
        }
        mkdirSync(dirname(out), { recursive: true });
        await io.write(out, document);
        let triangles = 0;
        for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) triangles += primitive.getIndices().getCount() / 3;
        console.log(`bar stool: ${triangles} triangles, ${readdirSync(dirname(out)).join(', ')}`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

await buildWoodTextures();
await buildStool();
