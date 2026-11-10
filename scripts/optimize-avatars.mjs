#!/usr/bin/env node
// Rebuild checked-in avatar GLBs with 512 px WebP textures, packed Uint8 vertex attributes
// (COLOR_0, WEIGHTS_0, JOINTS_0), welded vertices and resampled animations.

import { readdirSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { textureCompress, resample, dedup, prune, weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDir = join(ROOT, 'js', 'models', 'avatars');
// With arguments, only those files (names inside js/models/avatars/) are rebuilt.
const named = process.argv.slice(2);
const files = named.length ? named : readdirSync(avatarDir).filter(file => /^club-.*\.glb$/.test(file));
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMeshQuantization]);
await MeshoptSimplifier.ready;

/**
 * Pack skin weights, bone indices and vertex colours into 8-bit accessors so each character's
 * vertex buffer does not store 32-bit floats for 0..1 colour/weight channels or 16-bit joint indices
 * on a 62-bone skeleton.
 */
function packVertexAttributes(document) {
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            for (const semantic of ['COLOR_0', 'WEIGHTS_0']) {
                const accessor = primitive.getAttribute(semantic);
                if (!accessor || accessor.getComponentType() === 5121) continue;
                const src = accessor.getArray();
                const out = new Uint8Array(src.length);
                if (semantic === 'WEIGHTS_0') {
                    const stride = accessor.getElementSize();
                    for (let i = 0; i < src.length; i += stride) {
                        let sum = 0;
                        let maxIndex = 0;
                        let maxVal = -1;
                        for (let k = 0; k < stride; k++) {
                            const v = Math.max(0, Math.min(255, Math.round(src[i + k] * 255)));
                            out[i + k] = v;
                            sum += v;
                            if (v > maxVal) {
                                maxVal = v;
                                maxIndex = k;
                            }
                        }
                        if (sum > 0 && sum !== 255) {
                            out[i + maxIndex] = Math.max(0, Math.min(255, out[i + maxIndex] + (255 - sum)));
                        }
                    }
                } else {
                    for (let i = 0; i < src.length; i++) {
                        out[i] = Math.max(0, Math.min(255, Math.round(src[i] * 255)));
                    }
                }
                accessor.setArray(out).setNormalized(true);
            }
            const joints = primitive.getAttribute('JOINTS_0');
            if (joints && joints.getComponentType() !== 5121) {
                const src = joints.getArray();
                let maxJoint = 0;
                for (let i = 0; i < src.length; i++) {
                    if (src[i] > maxJoint) maxJoint = src[i];
                }
                if (maxJoint < 256) {
                    joints.setArray(new Uint8Array(src));
                }
            }
            // Modular crowd characters are flat-shaded (each triangle has its own face-normal vertices) and
            // purely vertex-coloured (no UVs). Welding vertices that share identical position, joints, weights
            // and colour while averaging their normals cuts ~74% of duplicate vertices without changing triangles.
            if (!primitive.getAttribute('TEXCOORD_0')) {
                const pos = primitive.getAttribute('POSITION');
                const norm = primitive.getAttribute('NORMAL');
                const jAcc = primitive.getAttribute('JOINTS_0');
                const wAcc = primitive.getAttribute('WEIGHTS_0');
                const cAcc = primitive.getAttribute('COLOR_0');
                const ind = primitive.getIndices();
                if (pos && norm && jAcc && wAcc && cAcc && ind) {
                    const n = pos.getCount();
                    const map = new Map();
                    const remap = new Uint32Array(n);
                    const keep = [];
                    const nSum = [];
                    const pv = [0, 0, 0], nv = [0, 0, 0], jv = [0, 0, 0, 0], wv = [0, 0, 0, 0], cv = [0, 0, 0];
                    for (let i = 0; i < n; i++) {
                        pos.getElement(i, pv);
                        norm.getElement(i, nv);
                        jAcc.getElement(i, jv);
                        wAcc.getElement(i, wv);
                        cAcc.getElement(i, cv);
                        const k = `${pv[0].toFixed(4)},${pv[1].toFixed(4)},${pv[2].toFixed(4)}|${jv.join(',')}|${wv[0].toFixed(3)},${wv[1].toFixed(3)},${wv[2].toFixed(3)},${wv[3].toFixed(3)}|${cv[0].toFixed(3)},${cv[1].toFixed(3)},${cv[2].toFixed(3)}`;
                        let idx = map.get(k);
                        if (idx === undefined) {
                            idx = keep.length;
                            map.set(k, idx);
                            keep.push(i);
                            nSum.push([nv[0], nv[1], nv[2]]);
                        } else {
                            nSum[idx][0] += nv[0];
                            nSum[idx][1] += nv[1];
                            nSum[idx][2] += nv[2];
                        }
                        remap[i] = idx;
                    }
                    const mCount = keep.length;
                    if (mCount < n) {
                        for (const sem of primitive.listSemantics()) {
                            const acc = primitive.getAttribute(sem);
                            const stride = acc.getElementSize();
                            const Ctor = acc.getArray().constructor;
                            const next = new Ctor(mCount * stride);
                            if (sem === 'NORMAL') {
                                for (let i = 0; i < mCount; i++) {
                                    const [nx, ny, nz] = nSum[i];
                                    const len = Math.hypot(nx, ny, nz) || 1;
                                    next[i * 3] = nx / len;
                                    next[i * 3 + 1] = ny / len;
                                    next[i * 3 + 2] = nz / len;
                                }
                            } else {
                                const src = acc.getArray();
                                for (let i = 0; i < mCount; i++) {
                                    const old = keep[i] * stride;
                                    for (let s = 0; s < stride; s++) next[i * stride + s] = src[old + s];
                                }
                            }
                            acc.setArray(next);
                        }
                        const oldInd = ind.getArray();
                        const newInd = mCount > 65535 ? new Uint32Array(oldInd.length) : new Uint16Array(oldInd.length);
                        for (let i = 0; i < oldInd.length; i++) newInd[i] = remap[oldInd[i]];
                        ind.setArray(newInd);
                    }
                }
            }
        }
    }
}

/**
 * Merge skinned primitives that share a skin, a material and a parent into one primitive.
 * glTF Transform's join() skips skinned meshes, and these characters are modular: a dozen parts per
 * character, one skin and four or five materials, which is a dozen draw calls per dancer. The skin,
 * joints, weights and animations are untouched; only the vertex buffers are concatenated.
 */
function mergeSkinnedPrimitives(document) {
    const root = document.getRoot();
    const buffer = root.listBuffers()[0];
    const groups = new Map();
    for (const node of root.listNodes()) {
        const mesh = node.getMesh();
        const skin = node.getSkin();
        if (!mesh || !skin) continue;
        for (const primitive of mesh.listPrimitives()) {
            if (primitive.listTargets().length) continue;
            const key = [root.listSkins().indexOf(skin), root.listMaterials().indexOf(primitive.getMaterial()),
                node.getParentNode() ? root.listNodes().indexOf(node.getParentNode()) : -1,
                node.getMatrix().join(',')].join('|');
            if (!groups.has(key)) groups.set(key, { node, primitives: [] });
            groups.get(key).primitives.push({ node, primitive });
        }
    }

    for (const { node: first, primitives } of groups.values()) {
        if (primitives.length < 2) continue;
        const semantics = primitives[0].primitive.listSemantics()
            .filter(semantic => primitives.every(({ primitive }) => primitive.getAttribute(semantic)));
        const merged = document.createPrimitive().setMaterial(primitives[0].primitive.getMaterial());
        const vertexCounts = primitives.map(({ primitive }) => primitive.getAttribute('POSITION').getCount());
        const totalVertices = vertexCounts.reduce((sum, count) => sum + count, 0);

        for (const semantic of semantics) {
            const sources = primitives.map(({ primitive }) => primitive.getAttribute(semantic));
            const size = sources[0].getElementSize();
            const Type = semantic.startsWith('JOINTS') ? Uint16Array
                : sources.every(source => source.getArray().constructor === sources[0].getArray().constructor)
                    ? sources[0].getArray().constructor : Float32Array;
            const array = new Type(totalVertices * size);
            let offset = 0;
            for (const source of sources) {
                array.set(source.getArray(), offset);
                offset += source.getCount() * size;
            }
            merged.setAttribute(semantic, document.createAccessor(semantic.toLowerCase())
                .setType(sources[0].getType()).setArray(array)
                .setNormalized(Type === Float32Array ? false : sources[0].getNormalized()).setBuffer(buffer));
        }

        const indexArray = totalVertices > 65535 ? new Uint32Array(primitives.reduce((n, { primitive }) =>
            n + (primitive.getIndices() ? primitive.getIndices().getCount() : primitive.getAttribute('POSITION').getCount()), 0))
            : new Uint16Array(primitives.reduce((n, { primitive }) =>
                n + (primitive.getIndices() ? primitive.getIndices().getCount() : primitive.getAttribute('POSITION').getCount()), 0));
        let writeAt = 0, base = 0;
        primitives.forEach(({ primitive }, index) => {
            const indices = primitive.getIndices();
            const count = indices ? indices.getCount() : vertexCounts[index];
            for (let i = 0; i < count; i++) indexArray[writeAt++] = base + (indices ? indices.getScalar(i) : i);
            base += vertexCounts[index];
        });
        merged.setIndices(document.createAccessor('indices').setType('SCALAR').setArray(indexArray).setBuffer(buffer));

        const name = first.getName();
        const node = document.createNode(name).setSkin(first.getSkin()).setMatrix(first.getMatrix())
            .setMesh(document.createMesh(name).addPrimitive(merged));
        (first.getParentNode() || root.listScenes()[0]).addChild(node);
        for (const { node: owner, primitive } of primitives) owner.getMesh().removePrimitive(primitive);
    }
    for (const node of root.listNodes()) {
        if (node.getMesh() && node.getMesh().listPrimitives().length === 0) node.dispose();
    }
}
for (const file of files) {
    const source = join(avatarDir, file);
    const output = join(avatarDir, `${basename(file, '.glb')}.optimized.glb`);
    const document = await io.read(source);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const pos = primitive.getAttribute('POSITION');
            const v = [0, 0, 0];
            const indices = primitive.getIndices();
            const count = indices ? indices.getCount() : pos.getCount();
            for (let i = 0; i < count; i++) {
                pos.getElement(indices ? indices.getScalar(i) : i, v);
                if (v[1] < minY) minY = v[1];
                if (v[1] > maxY) maxY = v[1];
            }
        }
    }
    await document.transform(textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [512, 512]
    }),
    resample({ tolerance: 0.002 }),
    dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL] }));
    mergeSkinnedPrimitives(document);
    packVertexAttributes(document);
    const keepExactTriangles = /^club-(?:dj|guest)-/.test(basename(file));
    // Idempotent: a character already at its target size is left alone. Halving every run quartered the crowd's faces and
    // thickened their limbs when the avatars were rebuilt twice.
    const trianglesNow = document.getRoot().listMeshes()
        .reduce((sum, mesh) => sum + mesh.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() / 3 : 0), 0), 0);
    const simplifyAbove = /^club-crowd-/.test(basename(file)) ? 4500 : 9000;
    const simplifyNow = !keepExactTriangles && trianglesNow > simplifyAbove;
    await document.transform(
        weld({ tolerance: 0.0001 }),
        ...(simplifyNow ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.01, lockBorder: true })] : []),
        prune({ keepLeaves: true })
    );
    // Preserve exact vertical extrema so AvatarRig._measure(eyeHeight) computes identical stature/ankle offsets.
    let minAfter = Infinity;
    let maxAfter = -Infinity;
    let minIdx = -1;
    let maxIdx = -1;
    let minPos = null;
    let maxPos = null;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const pos = primitive.getAttribute('POSITION');
            const v = [0, 0, 0];
            const indices = primitive.getIndices();
            const count = indices ? indices.getCount() : pos.getCount();
            for (let i = 0; i < count; i++) {
                const index = indices ? indices.getScalar(i) : i;
                pos.getElement(index, v);
                if (v[1] < minAfter) { minAfter = v[1]; minIdx = index; minPos = pos; }
                if (v[1] > maxAfter) { maxAfter = v[1]; maxIdx = index; maxPos = pos; }
            }
        }
    }
    if (minPos && minIdx >= 0) {
        const v = [0, 0, 0];
        minPos.getElement(minIdx, v);
        v[1] = minY;
        minPos.setElement(minIdx, v);
    }
    if (maxPos && maxIdx >= 0) {
        const v = [0, 0, 0];
        maxPos.getElement(maxIdx, v);
        v[1] = maxY;
        maxPos.setElement(maxIdx, v);
    }
    await io.write(output, document);
    renameSync(output, source);
}

console.log(`Optimized ${files.length} avatar GLB(s).`);
