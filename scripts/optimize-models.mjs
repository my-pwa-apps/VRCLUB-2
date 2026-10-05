#!/usr/bin/env node
// Shrink the two big models and their loose textures, in place and idempotently.
//
// Why: a cold start used to download ~68 MB and the scene held ~1,450 MB of GPU texture
// memory, 94% of it sixteen 4096x4096 textures (measured in the headset build). This brings the
// textures to a size a headset can show at the distances they are seen from, and drops
// textures nothing draws. Re-running changes nothing: a texture already small enough (and, in a
// GLB, already WebP) is skipped, so there is no generation loss.
//
//   DJ console GLB    4096 PNG  -> 2048 WebP (base colour and roughness lossy, normal and
//                                  emissive lossless)
//   PA speaker GLB    its embedded textures are removed: ModelLoader.applyPASpeakerTextures()
//                     replaces every mesh's material with one built from the loose files
//                     below, so the embedded set was downloaded, decoded and uploaded unused
//   bass bin GLB      4.7 MB source: its 1024 px maps become 512 px WebP, and its 12 meshes are flattened,
//                     de-duplicated and joined to 6 (one per material), so a bin costs 6 draws instead of 12
//   speaker textures  original GLB images: albedo 2048, normal 2048, packed ORM 1024
//   dead files        js/models/djgear/textures (unreferenced copies of what the GLB embeds)
//                     and small_speaker_1_1001_metallic.jpg (never read)
//
// Geometry is left alone, on purpose: Draco, meshopt and KTX2 all need a decoder that Babylon
// fetches from a CDN by default, and the project keeps its critical path same-origin.
//
// Usage: node scripts/optimize-models.mjs            (npm run optimize:models)
//        node scripts/optimize-models.mjs --check    exits 1 if anything would change

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrimitives } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const DJ_GLB = 'js/models/djgear/source/pioneer_DJ_console.glb';
const SPEAKER_GLB = 'js/models/paspeakers/source/stage_speaker___black.glb';
const BASS_BIN_GLB = 'js/models/bassbin/source/bass_bin_3.glb';
const SPEAKER_TEXTURES = 'js/models/paspeakers/source/authored/textures/small_speaker_1_1001_';
const OLD_SPEAKER_TEXTURES = 'js/models/paspeakers/source/textures/small_speaker_1_1001_';

/** Per-slot encoding for the DJ console's embedded textures. */
const DJ_TEXTURE_MAX = 2048;
const DJ_SLOT_ENCODING = {
    baseColorTexture: { quality: 90 },
    metallicRoughnessTexture: { quality: 92 },
    normalTexture: { lossless: true },
    emissiveTexture: { lossless: true },
    occlusionTexture: { quality: 92 }
};

/** The bass bin's carpet is fine speckle seen from a few metres: 512 px is plenty. */
const BIN_TEXTURE_MAX = 512;
const BIN_SLOT_ENCODING = {
    baseColorTexture: { quality: 88 },
    metallicRoughnessTexture: { quality: 90 },
    normalTexture: { lossless: true },
    occlusionTexture: { quality: 90 }
};

const LOOSE_TEXTURES = [
    { file: `${SPEAKER_TEXTURES}albedo.jpg`, max: 2048, format: 'jpeg' },
    { file: `${SPEAKER_TEXTURES}normal.png`, max: 2048, format: 'png' },
    { file: `${SPEAKER_TEXTURES}orm.jpg`, max: 1024, format: 'jpeg', quality: 90, chromaSubsampling: '4:4:4' }
];

const DEAD_PATHS = [
    'js/models/djgear/textures',
    ...['albedo.jpg', 'normal.png', 'roughness.jpg', 'AO.jpg', 'metallic.jpg']
        .map(file => `${OLD_SPEAKER_TEXTURES}${file}`)
];

const abs = relative => join(ROOT, relative);
const mb = bytes => (bytes / 1048576).toFixed(2).padStart(6);
// Every known extension is registered, or writing a GLB silently drops the ones it uses
// (the DJ console uses KHR_materials_specular).
const newIo = () => new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sizeOf = path => (statSync(path).isDirectory()
    ? readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0)
    : statSync(path).size);
const changes = [];
const note = (what, before, after) => changes.push({ what, before, after });

function encodeTexture(input, { max, format, quality = 88, chromaSubsampling = '4:2:0' }) {
    const pipeline = sharp(input).resize(max, max, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true });
    return (format === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.jpeg({ quality, chromaSubsampling, mozjpeg: true })).toBuffer();
}

async function optimizeLooseTexture(target) {
    const { file, max } = target;
    const path = abs(file);
    if (!existsSync(path)) return;
    const input = readFileSync(path);
    const meta = await sharp(input).metadata();
    if (Math.max(meta.width, meta.height) <= max) return;
    const output = await encodeTexture(input, target);
    note(`${file} ${meta.width}px -> ${max}px`, input.length, output.length);
    if (!CHECK_ONLY) writeFileSync(path, output);
}

async function optimizeGlbTextures(glb, max, encodings, { joinMeshes = false } = {}) {
    const path = abs(glb);
    if (!existsSync(path)) return;
    const io = newIo();
    const document = await io.read(path);
    const root = document.getRoot();
    let touched = false;
    for (const texture of root.listTextures()) {
        const slots = document.getGraph().listParentEdges(texture).map(edge => edge.getName());
        const slot = slots.find(name => DJ_SLOT_ENCODING[name]);
        const [width, height] = texture.getSize() || [0, 0];
        const isWebP = texture.getMimeType() === 'image/webp';
        if (isWebP && Math.max(width, height) <= max) continue;
        const input = Buffer.from(texture.getImage());
        const encoding = encodings[slot] || { quality: 90 };
        const output = await sharp(input)
            .resize(max, max, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
            .webp(encoding)
            .toBuffer();
        note(`${glb} ${slot || 'texture'} ${width}px ${texture.getMimeType().replace('image/', '')} -> webp`, input.length, output.length);
        texture.setImage(new Uint8Array(output)).setMimeType('image/webp');
        touched = true;
    }
    if (!touched) return;
    if (joinMeshes) await document.transform(flatten(), dedup(), joinPrimitives());
    if (!root.listExtensionsUsed().some(extension => extension.extensionName === 'EXT_texture_webp')) {
        document.createExtension(EXTTextureWebP).setRequired(true);
    }
    if (!CHECK_ONLY) await io.write(path, document);
}

async function stripSpeakerEmbeddedTextures() {
    const path = abs(SPEAKER_GLB);
    if (!existsSync(path)) return;
    const io = newIo();
    const document = await io.read(path);
    const textures = document.getRoot().listTextures();
    if (textures.length === 0) return;
    const material = document.getRoot().listMaterials().find(mat => mat.getName() === 'small_speaker_1_1001');
    if (!material || !material.getBaseColorTexture() || !material.getNormalTexture()
        || !material.getMetallicRoughnessTexture()
        || material.getOcclusionTexture() !== material.getMetallicRoughnessTexture()) {
        throw new Error('Expected Sousinho speaker with albedo, normal and shared packed ORM; refusing to discard its images.');
    }
    const sourceTextures = [
        material.getBaseColorTexture(), material.getNormalTexture(), material.getMetallicRoughnessTexture()
    ];
    for (let i = 0; i < sourceTextures.length; i++) {
        const target = LOOSE_TEXTURES[i];
        const output = await encodeTexture(Buffer.from(sourceTextures[i].getImage()), target);
        const targetPath = abs(target.file);
        if (existsSync(targetPath) && readFileSync(targetPath).equals(output)) continue;
        note(`${target.file} recovered from original GLB`, existsSync(targetPath) ? statSync(targetPath).size : 0, output.length);
        if (!CHECK_ONLY) {
            mkdirSync(dirname(targetPath), { recursive: true });
            writeFileSync(targetPath, output);
        }
    }
    const before = statSync(path).size;
    textures.forEach(texture => texture.dispose());
    if (!CHECK_ONLY) {
        await io.write(path, document);
        note(`${SPEAKER_GLB} embedded textures removed (${textures.length})`, before, statSync(path).size);
    } else {
        note(`${SPEAKER_GLB} embedded textures removed (${textures.length})`, before, 0);
    }
}

await stripSpeakerEmbeddedTextures();
for (const target of LOOSE_TEXTURES) await optimizeLooseTexture(target);
await optimizeGlbTextures(DJ_GLB, DJ_TEXTURE_MAX, DJ_SLOT_ENCODING);
await optimizeGlbTextures(BASS_BIN_GLB, BIN_TEXTURE_MAX, BIN_SLOT_ENCODING, { joinMeshes: true });
for (const dead of DEAD_PATHS) {
    if (!existsSync(abs(dead))) continue;
    note(`${dead} removed (not referenced by any code)`, sizeOf(abs(dead)), 0);
    if (!CHECK_ONLY) rmSync(abs(dead), { recursive: true, force: true });
}

if (changes.length === 0) {
    console.log('Models already optimised: nothing to do.');
} else {
    for (const change of changes) console.log(`${mb(change.before)} MB -> ${mb(change.after)} MB  ${change.what}`);
    if (CHECK_ONLY) {
        console.error(`\n${changes.length} asset(s) would change; run: npm run optimize:models`);
        process.exit(1);
    }
}
