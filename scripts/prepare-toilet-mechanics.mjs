import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { fileURLToPath } from 'node:url';
import { prepareToiletMechanics } from './lib/toilet-mechanics.mjs';

const file = fileURLToPath(new URL('../js/models/restroom/source/toilet.glb', import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(file);
prepareToiletMechanics(document);
await io.write(file, document);
console.log('Prepared toilet body, hinged seat and lid');
