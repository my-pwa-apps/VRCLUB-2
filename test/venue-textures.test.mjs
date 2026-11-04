import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

test('venue maps retain verified CC0 provenance, packed-map resolution and bounded download size', async () => {
    let bytes = 0;
    for (const [folder, size, id] of [
        ['restroomTiles', 1024, 'long_white_tiles'],
        ['restroomPlaster', 512, 'plastered_wall_04'],
        ['brushedCeiling', 1024, 'brushed_concrete'],
        ['stageRust', 512, 'rusty_metal_04']
    ]) {
        const dir = new URL(`../textures/${folder}/`, import.meta.url);
        const provenance = JSON.parse(await readFile(new URL('provenance.json', dir), 'utf8'));
        assert.equal(provenance.id, id);
        assert.equal(provenance.license, 'CC0-1.0');
        assert.ok(Object.keys(provenance.authors).length);
        assert.equal(provenance.size, size);
        for (const name of ['diff.jpg', 'normal.jpg', 'orm.jpg']) {
            const image = await readFile(new URL(name, dir));
            const metadata = await sharp(image).metadata();
            assert.equal(metadata.width, size);
            assert.equal(metadata.height, size);
            assert.equal(metadata.chromaSubsampling, '4:4:4');
            assert.equal(createHash('sha256').update(image).digest('hex'), provenance.maps[name].outputSha256);
            assert.match(provenance.maps[name].sourceSha256, /^[a-f0-9]{64}$/);
            assert.equal(new URL(provenance.maps[name].url).hostname, 'dl.polyhaven.org');
            bytes += image.length;
        }
    }
    assert.ok(bytes < 2.1 * 1024 * 1024, `${bytes} bytes exceeds the four-set download ceiling`);
});
