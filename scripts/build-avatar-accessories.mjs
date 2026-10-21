import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'design', 'characters', 'accessories');
const output = path.join(root, 'js', 'avatarAccessoryAssets.js');
const designs = [
    ['round', 'sagerfrogs-glasses-01'],
    ['square', 'sagerfrogs-glasses-02'],
    ['sunglasses', 'sagerfrogs-glasses-03']
];

const resolveIndex = (index, length) => index < 0 ? length + index : index - 1;
const srgbToLinear = value => {
    value /= 255;
    return Number((value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).toFixed(4));
};

async function readDesign(name) {
    const directory = path.join(sourceRoot, name);
    const files = await readdir(directory);
    const objName = files.find(file => file.toLowerCase().endsWith('.obj'));
    const clothingName = files.find(file => file.toLowerCase().endsWith('.mhclo'));
    const materialName = files.find(file => file.toLowerCase().endsWith('.mhmat'));
    const textureName = files.find(file => file.toLowerCase().endsWith('.png'));
    if (!objName || !clothingName || !materialName || !textureName) {
        throw new Error(`${name}: expected OBJ, MHClothes, material and texture source files.`);
    }
    for (const file of [objName, clothingName, materialName]) {
        const source = await readFile(path.join(directory, file), 'utf8');
        if (!/^\s*#\s*license:\s*CC0\s*$/im.test(source)) {
            throw new Error(`${name}/${file}: source does not explicitly declare CC0.`);
        }
    }

    const positions = [], texCoords = [], faces = [];
    const obj = await readFile(path.join(directory, objName), 'utf8');
    for (const line of obj.split(/\r?\n/)) {
        const values = line.trim().split(/\s+/);
        if (values[0] === 'v') positions.push(values.slice(1, 4).map(Number));
        else if (values[0] === 'vt') texCoords.push(values.slice(1, 3).map(Number));
        else if (values[0] === 'f') faces.push(values.slice(1).map(token => {
            const [position, texture] = token.split('/');
            return [resolveIndex(Number(position), positions.length), resolveIndex(Number(texture), texCoords.length)];
        }));
    }
    if (positions.length < 3 || !texCoords.length || !faces.length ||
        [...positions, ...texCoords].some(values => values.some(value => !Number.isFinite(value)))) {
        throw new Error(`${name}/${objName}: malformed or empty OBJ geometry.`);
    }

    const texture = files.find(file => file.toLowerCase() === textureName.toLowerCase());
    const { data: pixels, info } = await sharp(path.join(directory, texture))
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const vertices = [], colors = [], indices = [], vertexMap = new Map();
    const vertexIndex = ([positionIndex, uvIndex]) => {
        const uv = texCoords[uvIndex];
        if (!uv) throw new Error(`${name}/${objName}: face references a missing texture coordinate.`);
        const x = Math.max(0, Math.min(info.width - 1, Math.floor(uv[0] * info.width)));
        const y = Math.max(0, Math.min(info.height - 1, Math.floor((1 - uv[1]) * info.height)));
        const offset = (y * info.width + x) * info.channels;
        const color = [srgbToLinear(pixels[offset]), srgbToLinear(pixels[offset + 1]),
            srgbToLinear(pixels[offset + 2])];
        const position = positions[positionIndex].map(value => Number(value.toFixed(5)));
        const key = `${position.join(',')}/${color.join(',')}`;
        if (vertexMap.has(key)) return vertexMap.get(key);
        const index = vertices.length / 3;
        vertices.push(...position);
        colors.push(...color);
        vertexMap.set(key, index);
        return index;
    };
    for (const face of faces) {
        if (face.length < 3) throw new Error(`${name}/${objName}: face has fewer than three vertices.`);
        const first = vertexIndex(face[0]);
        for (let i = 1; i < face.length - 1; i++) {
            indices.push(first, vertexIndex(face[i]), vertexIndex(face[i + 1]));
        }
    }
    const bounds = [0, 1, 2].map(axis => {
        let low = Infinity, high = -Infinity;
        for (let i = axis; i < vertices.length; i += 3) {
            low = Math.min(low, vertices[i]);
            high = Math.max(high, vertices[i]);
        }
        return [low, high];
    });
    if (vertices.length / 3 > 65535) throw new Error(`${name}: geometry exceeds the accessory vertex budget.`);
    return { positions: vertices, colors, indices, bounds };
}

const assets = Object.fromEntries(await Promise.all(designs.map(async ([key, directory]) =>
    [key, await readDesign(directory)])));
await writeFile(output, `'use strict';\n\nwindow.AvatarAccessoryAssets = Object.freeze(${JSON.stringify(assets)});\n`);
console.log(`Generated ${Object.keys(assets).length} fitted CC0 eyewear meshes in ${path.relative(root, output)}.`);
