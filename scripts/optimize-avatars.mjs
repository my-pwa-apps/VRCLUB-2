#!/usr/bin/env node
// Rebuild checked-in avatar GLBs with 512 px WebP textures. Geometry transforms
// are deliberately avoided because they can duplicate skins in modular animated models.

import { readdirSync, renameSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMeshQuantization } from '@gltf-transform/extensions';
import { textureCompress, resample, dedup, prune } from '@gltf-transform/functions';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const avatarDir = join(ROOT, 'js', 'models', 'avatars');
// With arguments, only those files (names inside js/models/avatars/) are rebuilt.
const named = process.argv.slice(2);
const files = named.length ? named : readdirSync(avatarDir).filter(file => file.endsWith('.glb'));
const io = new NodeIO().registerExtensions([EXTTextureWebP, KHRMeshQuantization]);

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
    await document.transform(textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [512, 512]
    }),
    // Animation-only and exact-duplicate cleanup: keyframes within tolerance are dropped, and the repeated
    // hair material/textures are merged. Geometry is not touched.
    resample({ tolerance: 0.0005 }),
    dedup({ propertyTypes: [PropertyType.TEXTURE, PropertyType.MATERIAL] }));
    mergeSkinnedPrimitives(document);
    await document.transform(prune({ keepLeaves: true }));
    await io.write(output, document);
    renameSync(output, source);
}

console.log(`Optimized ${files.length} avatar GLB(s).`);
