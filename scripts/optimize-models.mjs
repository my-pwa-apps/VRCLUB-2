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
//   speaker textures  albedo 2048, normal 2048 (PNG, ~2 MB), roughness and AO 1024
//   dead files        js/models/djgear/textures (unreferenced copies of what the GLB embeds)
//                     and small_speaker_1_1001_metallic.jpg (never read)
//
// Geometry is left alone, on purpose: Draco, meshopt and KTX2 all need a decoder that Babylon
// fetches from a CDN by default, and the project keeps its critical path same-origin.
//
// Usage: node scripts/optimize-models.mjs            (npm run optimize:models)
//        node scripts/optimize-models.mjs --check    exits 1 if anything would change

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_ONLY = process.argv.includes('--check');

const DJ_GLB = 'js/models/djgear/source/pioneer_DJ_console.glb';
const SPEAKER_GLB = 'js/models/paspeakers/source/stage_speaker___black.glb';
const SPEAKER_TEXTURES = 'js/models/paspeakers/source/textures/small_speaker_1_1001_';

/** Per-slot encoding for the DJ console's embedded textures. */
const DJ_TEXTURE_MAX = 2048;
const DJ_SLOT_ENCODING = {
    baseColorTexture: { quality: 90 },
    metallicRoughnessTexture: { quality: 92 },
    normalTexture: { lossless: true },
    emissiveTexture: { lossless: true },
    occlusionTexture: { quality: 92 }
};

const LOOSE_TEXTURES = [
    { file: `${SPEAKER_TEXTURES}albedo.jpg`, max: 2048, format: 'jpeg' },
    { file: `${SPEAKER_TEXTURES}normal.png`, max: 2048, format: 'png' },
    { file: `${SPEAKER_TEXTURES}roughness.jpg`, max: 1024, format: 'jpeg' },
    { file: `${SPEAKER_TEXTURES}AO.jpg`, max: 1024, format: 'jpeg' }
];

const DEAD_PATHS = [
    'js/models/djgear/textures',
    `${SPEAKER_TEXTURES}metallic.jpg`
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

async function optimizeLooseTexture({ file, max, format }) {
    const path = abs(file);
    if (!existsSync(path)) return;
    const input = readFileSync(path);
    const meta = await sharp(input).metadata();
    if (Math.max(meta.width, meta.height) <= max) return;
    let pipeline = sharp(input).resize(max, max, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true });
    pipeline = format === 'png'
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.jpeg({ quality: 88, mozjpeg: true });
    const output = await pipeline.toBuffer();
    note(`${file} ${meta.width}px -> ${max}px`, input.length, output.length);
    if (!CHECK_ONLY) writeFileSync(path, output);
}

async function optimizeDjConsole() {
    const path = abs(DJ_GLB);
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
        if (isWebP && Math.max(width, height) <= DJ_TEXTURE_MAX) continue;
        const input = Buffer.from(texture.getImage());
        const encoding = DJ_SLOT_ENCODING[slot] || { quality: 90 };
        const output = await sharp(input)
            .resize(DJ_TEXTURE_MAX, DJ_TEXTURE_MAX, { fit: 'inside', kernel: 'lanczos3', withoutEnlargement: true })
            .webp(encoding)
            .toBuffer();
        note(`${DJ_GLB} ${slot || 'texture'} ${width}px ${texture.getMimeType().replace('image/', '')} -> webp`, input.length, output.length);
        texture.setImage(new Uint8Array(output)).setMimeType('image/webp');
        touched = true;
    }
    if (!touched) return;
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
    const before = statSync(path).size;
    textures.forEach(texture => texture.dispose());
    if (!CHECK_ONLY) {
        await io.write(path, document);
        note(`${SPEAKER_GLB} embedded textures removed (${textures.length})`, before, statSync(path).size);
    } else {
        note(`${SPEAKER_GLB} embedded textures removed (${textures.length})`, before, 0);
    }
}

for (const target of LOOSE_TEXTURES) await optimizeLooseTexture(target);
await optimizeDjConsole();
await stripSpeakerEmbeddedTextures();
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
