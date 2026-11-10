import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const recipes = [
    { id: 'plastered_wall_04', folder: 'restroomPlaster', size: 512, hash: '6d3a95313563598622a45bdfe02137a3e590cc30' },
    { id: 'brushed_concrete', folder: 'brushedCeiling', size: 1024, hash: '2274ffd02c42d765d335c85e9067398253d6b45e' },
    { id: 'long_white_tiles', folder: 'restroomTiles', size: 1024, hash: 'c26e8672a94d97e12b4eb15f3eab2ce954430313' },
    { id: 'rusty_metal_04', folder: 'stageRust', size: 512, hash: '1c144f4e2b09d58f75430ae32d992b5d8aae53eb' }
];
const fetchResponse = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
};

for (const recipe of recipes) {
    const info = await (await fetchResponse(`https://api.polyhaven.com/info/${recipe.id}`)).json();
    if (info.files_hash !== recipe.hash) throw new Error(`Review changed source revision before importing ${recipe.id}.`);
    const files = await (await fetchResponse(`https://api.polyhaven.com/files/${recipe.id}`)).json();
    const dir = join(root, 'textures', recipe.folder);
    await mkdir(dir, { recursive: true });
    const maps = { 'diff.jpg': 'Diffuse', 'normal.jpg': 'nor_dx', 'orm.jpg': 'arm' };
    const provenance = { id: recipe.id, source: `https://polyhaven.com/a/${recipe.id}`,
        license: 'CC0-1.0', licenseUrl: 'https://polyhaven.com/license',
        authors: info.authors, filesHash: recipe.hash, size: recipe.size, maps: {} };
    for (const [filename, kind] of Object.entries(maps)) {
        const url = files[kind]['1k'].jpg.url;
        if (new URL(url).hostname !== 'dl.polyhaven.org') throw new Error('Unexpected texture download host.');
        const input = Buffer.from(await (await fetchResponse(url)).arrayBuffer());
        const output = await sharp(input).resize(recipe.size, recipe.size)
            .jpeg({ quality: filename === 'diff.jpg' ? 88 : 92, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
        await writeFile(join(dir, filename), output);
        provenance.maps[filename] = { url, sourceSha256: createHash('sha256').update(input).digest('hex'),
            outputSha256: createHash('sha256').update(output).digest('hex'), bytes: output.length };
        console.log(`${recipe.folder}\\${filename}: ${recipe.size}px, ${output.length} bytes`);
    }
    await writeFile(join(dir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
}
