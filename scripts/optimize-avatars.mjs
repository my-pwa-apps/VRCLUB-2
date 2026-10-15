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
                            const value = Math.max(0, Math.min(255, Math.round(src[i + k] * 255)));
                            out[i + k] = value;
                            sum += value;
                            if (value > maxVal) {
                                maxVal = value;
                                maxIndex = k;
                            }
                        }
                        if (sum > 0 && sum !== 255) {
                            out[i + maxIndex] = Math.max(0, Math.min(255, out[i + maxIndex] + 255 - sum));
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
                for (let i = 0; i < src.length; i++) maxJoint = Math.max(maxJoint, src[i]);
                if (maxJoint < 256) joints.setArray(new Uint8Array(src));
            }

            if (!primitive.getAttribute('TEXCOORD_0')) {
                const pos = primitive.getAttribute('POSITION');
                const normal = primitive.getAttribute('NORMAL');
                const jointAccessor = primitive.getAttribute('JOINTS_0');
                const weightAccessor = primitive.getAttribute('WEIGHTS_0');
                const colorAccessor = primitive.getAttribute('COLOR_0');
                const indices = primitive.getIndices();
                if (!pos || !normal || !jointAccessor || !weightAccessor || !colorAccessor || !indices) continue;

                const count = pos.getCount();
                const map = new Map();
                const remap = new Uint32Array(count);
                const keep = [];
                const normalSums = [];
                const pv = [0, 0, 0];
                const nv = [0, 0, 0];
                const jv = [0, 0, 0, 0];
                const wv = [0, 0, 0, 0];
                const cv = [0, 0, 0];
                for (let i = 0; i < count; i++) {
                    pos.getElement(i, pv);
                    normal.getElement(i, nv);
                    jointAccessor.getElement(i, jv);
                    weightAccessor.getElement(i, wv);
                    colorAccessor.getElement(i, cv);
                    const key = `${pv[0].toFixed(4)},${pv[1].toFixed(4)},${pv[2].toFixed(4)}|${jv.join(',')}|${wv[0].toFixed(3)},${wv[1].toFixed(3)},${wv[2].toFixed(3)},${wv[3].toFixed(3)}|${cv[0].toFixed(3)},${cv[1].toFixed(3)},${cv[2].toFixed(3)}`;
                    let nextIndex = map.get(key);
                    if (nextIndex === undefined) {
                        nextIndex = keep.length;
                        map.set(key, nextIndex);
                        keep.push(i);
                        normalSums.push([nv[0], nv[1], nv[2]]);
                    } else {
                        normalSums[nextIndex][0] += nv[0];
                        normalSums[nextIndex][1] += nv[1];
                        normalSums[nextIndex][2] += nv[2];
                    }
                    remap[i] = nextIndex;
                }

                const mergedCount = keep.length;
                if (mergedCount >= count) continue;
                for (const semantic of primitive.listSemantics()) {
                    const accessor = primitive.getAttribute(semantic);
                    const stride = accessor.getElementSize();
                    const ArrayType = accessor.getArray().constructor;
                    const next = new ArrayType(mergedCount * stride);
                    if (semantic === 'NORMAL') {
                        for (let i = 0; i < mergedCount; i++) {
                            const [nx, ny, nz] = normalSums[i];
                            const length = Math.hypot(nx, ny, nz) || 1;
                            next[i * 3] = nx / length;
                            next[i * 3 + 1] = ny / length;
                            next[i * 3 + 2] = nz / length;
                        }
                    } else {
                        const src = accessor.getArray();
                        for (let i = 0; i < mergedCount; i++) {
                            const old = keep[i] * stride;
                            for (let component = 0; component < stride; component++) {
                                next[i * stride + component] = src[old + component];
                            }
                        }
                    }
                    accessor.setArray(next);
                }

                const oldIndices = indices.getArray();
                const ArrayType = mergedCount > 65535 ? Uint32Array : Uint16Array;
                const nextIndices = new ArrayType(oldIndices.length);
                for (let i = 0; i < oldIndices.length; i++) nextIndices[i] = remap[oldIndices[i]];
                indices.setArray(nextIndices);
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
            const value = [0, 0, 0];
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, value);
                minY = Math.min(minY, value[1]);
                maxY = Math.max(maxY, value[1]);
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
    await document.transform(
        weld({ tolerance: 0.0001 }),
        ...(keepExactTriangles ? [] : [simplify({
            simplifier: MeshoptSimplifier,
            ratio: 0.5,
            error: 0.01,
            lockBorder: true
        })]),
        prune({ keepLeaves: true })
    );

    let minAfter = Infinity;
    let maxAfter = -Infinity;
    let minIndex = -1;
    let maxIndex = -1;
    let minPosition = null;
    let maxPosition = null;
    for (const mesh of document.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
            const pos = primitive.getAttribute('POSITION');
            const value = [0, 0, 0];
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, value);
                if (value[1] < minAfter) {
                    minAfter = value[1];
                    minIndex = i;
                    minPosition = pos;
                }
                if (value[1] > maxAfter) {
                    maxAfter = value[1];
                    maxIndex = i;
                    maxPosition = pos;
                }
            }
        }
    }
    if (minPosition && minIndex >= 0) {
        const value = [0, 0, 0];
        minPosition.getElement(minIndex, value);
        value[1] = minY;
        minPosition.setElement(minIndex, value);
    }
    if (maxPosition && maxIndex >= 0) {
        const value = [0, 0, 0];
        maxPosition.getElement(maxIndex, value);
        value[1] = maxY;
        maxPosition.setElement(maxIndex, value);
    }
    await io.write(output, document);
    renameSync(output, source);
}

console.log(`Optimized ${files.length} avatar GLB(s).`);
