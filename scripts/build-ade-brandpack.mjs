import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'concept-assets', 'ade');
const sources = [
    {
        file: 'ade26-30y-black.svg',
        sha256: 'ef6ba75e27c3a15bd6b7148c3b5c67e204801d1bf1c116e9e9d7049e57a793f5',
        output: 'ade26-30y-black.png',
        width: 512
    },
    {
        file: 'ade26-keyvisual-black-landscape.png',
        sha256: 'df7a42f4df58190a0f33d817163ce5a1ba4af29d27b4bcb011f562d305b72769',
        output: 'ade26-keyvisual-black-landscape.webp',
        width: 1024
    }
];

await mkdir(output, { recursive: true });
for (const source of sources) {
    const bytes = await readFile(join(root, 'design', 'ade-brandpack', source.file));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
        throw new Error(`ADE brandpack source changed: ${source.file}. Review its provenance before rebuilding.`);
    }
    let image = sharp(bytes).resize({ width: source.width, withoutEnlargement: true });
    image = source.output.endsWith('.png') ? image.png() : image.webp({ quality: 88 });
    await image.toFile(join(output, source.output));
    console.log(`Prepared pitch-only artwork: ${source.output}`);
}
