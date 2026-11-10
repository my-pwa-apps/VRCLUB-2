// Separate the authored closed lid and add an original open seat ring, retaining the toilet's fit bounds.
export function prepareToiletMechanics(document) {
    const root = document.getRoot();
    if (root.getExtras().restroomMechanics === 2) return;
    if (root.getExtras().restroomMechanics) throw new Error('Rebuild the original toilet with build-restroom-monitor-assets.mjs --force');
    const node = root.listNodes().find(item => item.getName() === 'Bathroom_Toilet');
    if (!node?.getMesh()) throw new Error('Expected the Quaternius Bathroom_Toilet source');
    const primitive = node.getMesh().listPrimitives()[0];
    const positions = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices().getArray();
    const buffer = root.listBuffers()[0];
    const body = [], lid = [];
    const point = [];
    const parents = Array.from({ length: positions.getCount() }, (_, i) => i);
    const parent = i => parents[i] === i ? i : (parents[i] = parent(parents[i]));
    const union = (a, b) => { parents[parent(a)] = parent(b); };
    const welded = new Map();
    for (let i = 0; i < positions.getCount(); i++) {
        positions.getElement(i, point);
        const key = point.map(value => value.toFixed(6)).join(',');
        if (welded.has(key)) union(i, welded.get(key));
        else welded.set(key, i);
    }
    for (let i = 0; i < indices.length; i += 3) {
        union(indices[i], indices[i + 1]);
        union(indices[i], indices[i + 2]);
    }
    const extents = new Map();
    for (let i = 0; i < positions.getCount(); i++) {
        const id = parent(i);
        positions.getElement(i, point);
        const range = extents.get(id) || [Infinity, -Infinity];
        range[0] = Math.min(range[0], point[2]);
        range[1] = Math.max(range[1], point[2]);
        extents.set(id, range);
    }
    for (let i = 0; i < indices.length; i += 3) {
        const [min, max] = extents.get(parent(indices[i]));
        (min > 0.00892 && max < 0.00995 ? lid : body).push(indices[i], indices[i + 1], indices[i + 2]);
    }
    if (lid.length !== 68 * 3) throw new Error(`Toilet source changed: expected 68 lid triangles, found ${lid.length / 3}`);
    const indexAccessor = (name, array) => document.createAccessor(name).setBuffer(buffer)
        .setType('SCALAR').setArray(new Uint16Array(array));
    primitive.setIndices(indexAccessor('toiletBodyIndices', body));
    const pivot = [0, 0.0067, 0.00955];
    const used = [...new Set(lid)], remap = new Map(used.map((index, i) => [index, i]));
    const lidPrimitive = document.createPrimitive().setMaterial(primitive.getMaterial())
        .setIndices(indexAccessor('toiletLidIndices', lid.map(index => remap.get(index))));
    for (const semantic of primitive.listSemantics()) {
        const old = primitive.getAttribute(semantic), size = old.getElementSize(), raw = old.getArray();
        const values = new raw.constructor(used.length * size);
        used.forEach((index, i) => {
            for (let j = 0; j < size; j++) values[i * size + j] = raw[index * size + j];
            if (semantic === 'POSITION') {
                for (let axis = 0; axis < 3; axis++) values[i * size + axis] -= pivot[axis];
                values[i * size + 2] += 0.0006;
            }
        });
        lidPrimitive.setAttribute(semantic, document.createAccessor(`lid${semantic}`).setBuffer(buffer)
            .setType(old.getType()).setNormalized(old.getNormalized()).setArray(values));
    }
    node.addChild(document.createNode('toiletLid').setTranslation(pivot)
        .setMesh(document.createMesh('toiletLidMesh').addPrimitive(lidPrimitive)));
    const pos = [], normals = [], colors = [], triangles = [];
    const segments = 32, centreY = -0.00024;
    for (let i = 0; i < segments; i++) {
        const a = 2 * Math.PI * i / segments, ca = Math.cos(a), sa = Math.sin(a);
        for (const [rx, ry, z, nz] of [
            [0.00505, 0.007, 0.01005, 1], [0.00355, 0.00515, 0.01005, 1],
            [0.00505, 0.007, 0.00965, -1], [0.00355, 0.00515, 0.00965, -1]
        ]) {
            pos.push(rx * ca, centreY + ry * sa - pivot[1], z - pivot[2]);
            normals.push(0, 0, nz);
            colors.push(224, 227, 232, 255);
        }
    }
    for (let i = 0; i < segments; i++) {
        const a = i * 4, b = ((i + 1) % segments) * 4;
        triangles.push(a, b, a + 1, a + 1, b, b + 1,
            a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
            a, a + 2, b, b, a + 2, b + 2,
            a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
    }
    const accessor = (name, type, array) => document.createAccessor(name).setBuffer(buffer).setType(type).setArray(array);
    const seatPrimitive = document.createPrimitive().setMaterial(primitive.getMaterial())
        .setAttribute('POSITION', accessor('seatPosition', 'VEC3', new Float32Array(pos)))
        .setAttribute('NORMAL', accessor('seatNormal', 'VEC3', new Float32Array(normals)))
        .setAttribute('COLOR_0', accessor('seatColor', 'VEC4', new Uint8Array(colors)).setNormalized(true))
        .setIndices(indexAccessor('seatIndices', triangles));
    node.addChild(document.createNode('toiletSeat').setTranslation(pivot)
        .setMesh(document.createMesh('toiletSeatMesh').addPrimitive(seatPrimitive)));
    root.setExtras({ ...root.getExtras(), restroomMechanics: 2 });
}
