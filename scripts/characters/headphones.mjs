import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export async function addRoleHeadphones(doc, repo) {
    const require = createRequire(join(repo, 'package.json'));
    const { NodeIO } = require('@gltf-transform/core');
    const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
    const source = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
        .read(join(repo, 'js', 'models', 'avatars', 'club-dj-female.glb'));
    const headBounds = document => {
        const skin = document.getRoot().listSkins()[0];
        const head = skin.listJoints().findIndex(node => /^(Head|head)$/.test(node.getName()));
        assert.ok(head >= 0);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const mesh of document.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
            if (mesh.getName() === 'Headphones' || /hair/i.test(p.getMaterial()?.getName() || '')) continue;
            const positions = p.getAttribute('POSITION').getArray(), joints = p.getAttribute('JOINTS_0').getArray();
            const weights = p.getAttribute('WEIGHTS_0').getArray();
            const normal = p.getAttribute('WEIGHTS_0').getNormalized()
                ? (weights instanceof Uint8Array ? 255 : 65535) : 1;
            for (let i = 0; i < positions.length / 3; i++) {
                let weight = 0;
                for (let j = 0; j < 4; j++) if (joints[i * 4 + j] === head) weight += weights[i * 4 + j] / normal;
                if (weight < 0.8) continue;
                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], positions[i * 3 + k]); max[k] = Math.max(max[k], positions[i * 3 + k]);
                }
            }
        }
        assert.ok(min.every(Number.isFinite));
        return { min, max, centre: min.map((v, i) => (v + max[i]) / 2) };
    };
    const a = headBounds(source), b = headBounds(doc);
    const scale = a.min.map((v, i) => (b.max[i] - b.min[i]) / (a.max[i] - v));
    const original = source.getRoot().listMeshes().find(m => m.getName() === 'Headphones').listPrimitives()[0];
    const buffer = doc.getRoot().listBuffers()[0];
    const accessor = old => doc.createAccessor().setType(old.getType()).setNormalized(old.getNormalized())
        .setArray(old.getArray().slice()).setBuffer(buffer);
    const primitive = doc.createPrimitive().setIndices(accessor(original.getIndices()));
    for (const semantic of original.listSemantics()) {
        if (semantic === 'JOINTS_0' || semantic === 'WEIGHTS_0') continue;
        const attribute = accessor(original.getAttribute(semantic));
        const values = attribute.getArray();
        if (semantic === 'POSITION') {
            for (let i = 0; i < values.length; i++) values[i] = b.centre[i % 3] + (values[i] - a.centre[i % 3]) * scale[i % 3];
        }
        if (semantic === 'NORMAL') {
            for (let i = 0; i < values.length; i += 3) {
                const n = [values[i] / scale[0], values[i + 1] / scale[1], values[i + 2] / scale[2]];
                const length = Math.hypot(...n);
                n.forEach((v, k) => { values[i + k] = v / length; });
            }
        }
        primitive.setAttribute(semantic, attribute);
    }
    const skin = doc.getRoot().listSkins()[0], count = primitive.getAttribute('POSITION').getCount();
    const head = skin.listJoints().findIndex(n => /^(Head|head)$/.test(n.getName()));
    const joints = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { joints[i * 4] = head; weights[i * 4] = 1; }
    primitive.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));
    primitive.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
    const material = original.getMaterial(), texture = material.getBaseColorTexture();
    const copied = doc.createMaterial('Headphones').setBaseColorFactor(material.getBaseColorFactor())
        .setMetallicFactor(material.getMetallicFactor()).setRoughnessFactor(material.getRoughnessFactor());
    if (texture) copied.setBaseColorTexture(doc.createTexture('headphonesColour').setImage(texture.getImage().slice())
        .setMimeType(texture.getMimeType()));
    primitive.setMaterial(copied);
    const body = doc.getRoot().listNodes().find(n => n.getMesh() && n.getSkin() === skin);
    const node = doc.createNode('Headphones').setMesh(doc.createMesh('Headphones').addPrimitive(primitive)).setSkin(skin);
    if (body.getParentNode()) body.getParentNode().addChild(node);
    else doc.getRoot().listScenes()[0].addChild(node);
    return { scale, vertices: count, sourceHeadBounds: a, targetHeadBounds: b };
}
