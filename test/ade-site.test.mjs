import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareADESite, ADE_ROBOTS_DIRECTIVE } from '../scripts/ade-site.mjs';

test('ADE site enables the dressing at its root and removes search/social metadata', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const headers = readFileSync(new URL('../_headers', import.meta.url), 'utf8');
    const output = prepareADESite(html, headers);
    assert.match(output.html, /<html lang="en" data-live-event="ade">/);
    assert.match(output.html, /<title>NOCTURNE \/ ADE concept<\/title>/);
    assert.ok(output.html.includes(`name="robots" content="${ADE_ROBOTS_DIRECTIVE}"`));
    assert.ok(output.headers.includes(`X-Robots-Tag: ${ADE_ROBOTS_DIRECTIVE}`));
    assert.doesNotMatch(output.html, /name="description"|twitter:|property="og:|rel="canonical"|rel="sitemap"|itemscope|itemprop|itemtype/);
    assert.doesNotMatch(output.robots, /Sitemap:/i);
    assert.match(output.robots, /Allow: \//, 'crawlers must be allowed to read the noindex response');
    assert.match(output.headers, /frame-ancestors 'none'/);
    assert.match(html, /name="robots" content="index, follow/, 'source/default production metadata stays unchanged');
});

test('ADE site refuses to build without effective noindex response headers', () => {
    assert.throws(() => prepareADESite('<html lang="en"></html>', '/*\n'), /non-indexing directives/);
});
