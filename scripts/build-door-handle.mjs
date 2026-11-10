import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Document } from '@gltf-transform/core';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/build-door-handle.mjs <downloaded Door Handle 3.glb>');
const bytes = readFileSync(input);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const source = await io.readBinary(new Uint8Array(bytes));
const node = source.getRoot().listNodes().find(item => item.getMesh());
if (!node || source.getRoot().listMeshes().length !== 1) throw new Error('Unexpected Door Handle 3 source');
const primitive = node.getMesh().listPrimitives()[0];
if (primitive.getIndices().getCount() !== 766 * 3) throw new Error('Door Handle 3 topology differs from the verified download');
const matrix = node.getWorldMatrix();
const sourcePositions = primitive.getAttribute('POSITION');
const sourceNormals = primitive.getAttribute('NORMAL');
const positions = [], normals = [], point = [], normal = [];
// The rosette centre lies at local x -1.9912; its rear mounting face is local y +0.9252.
const mountX = (-3.0345091819763184 - 0.9478949308395386) / 2 * matrix[0];
const mountZ = -0.9252030253410339 * matrix[0];
for (let i = 0; i < sourcePositions.getCount(); i++) {
    sourcePositions.getElement(i, point); sourceNormals.getElement(i, normal);
    positions.push(matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] - mountX,
        matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2],
        matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] - mountZ);
    const x = matrix[0] * normal[0] + matrix[4] * normal[1] + matrix[8] * normal[2];
    const y = matrix[1] * normal[0] + matrix[5] * normal[1] + matrix[9] * normal[2];
    const z = matrix[2] * normal[0] + matrix[6] * normal[1] + matrix[10] * normal[2];
    const length = Math.hypot(x, y, z);
    normals.push(x / length, y / length, z / length);
}
const output = new Document(), buffer = output.createBuffer();
const material = output.createMaterial('doorHandleSteel').setBaseColorFactor([0.5, 0.52, 0.55, 1])
    .setMetallicFactor(0.85).setRoughnessFactor(0.28);
const accessor = (name, type, array) => output.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
const mesh = output.createMesh('DoorHandle3').addPrimitive(output.createPrimitive().setMaterial(material)
    .setAttribute('POSITION', accessor('position', 'VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('normal', 'VEC3', new Float32Array(normals)))
    .setIndices(accessor('indices', 'SCALAR', new Uint16Array(primitive.getIndices().getArray()))));
output.createScene('Door Handle 3').addChild(output.createNode('DoorHandle3').setMesh(mesh));
const provenance = {
    title: 'Door Handle 3', author: 'plaggy',
    source: 'https://sketchfab.com/3d-models/cc0-door-handle-3-0f4459df86af469dad41c5d025973d87',
    license: 'CC0-1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    modifications: 'Baked source transforms to metres; recentered at the rosette mounting plane; removed textures and UVs for shared in-app steel.',
    triangles: 766
};
output.getRoot().setExtras({ provenance });
const out = fileURLToPath(new URL('../js/models/restroom/source/door_handle_3.glb', import.meta.url));
await io.write(out, output);
const result = readFileSync(out);
writeFileSync(fileURLToPath(new URL('../js/models/restroom/source/door_handle_3.provenance.json', import.meta.url)),
    JSON.stringify({ ...provenance, outputSha256: createHash('sha256').update(result).digest('hex'), bytes: result.length }, null, 2) + '\n');
console.log(`Door Handle 3: 766 triangles, ${result.length} bytes, no textures`);
