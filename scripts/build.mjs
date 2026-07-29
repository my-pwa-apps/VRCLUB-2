import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const sources = [
    'js/assetCache.js',
    'js/audioUtils.js',
    'js/textureLoader.js',
    'js/modelLoader.js',
    'js/materialFactory.js',
    'js/lightFactory.js',
    'js/vjDirector.js',
    'js/showDirector.js',
    'js/ledPatterns.js',
    'js/club/01-core.js',
    'js/club/02-lifecycle.js',
    'js/club/03-rendering.js',
    'js/club/04-environment.js',
    'js/club/05-fixtures.js',
    'js/club/06-effects.js',
    'js/club/07-animation-core.js',
    'js/club/08-animation-fixtures.js',
    'js/club/09-animation-finish.js',
    'js/club/10-ui.js',
    'js/club/11-audio-crowd.js',
    'js/club_hyperrealistic.js',
    'js/ui-init.js'
];

const digest = content => createHash('sha256').update(content).digest('hex').slice(0, 12);

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

const combined = (await Promise.all(sources.map(async source => {
    const code = await readFile(path.join(root, source), 'utf8');
    return `\n/* ${source} */\n${code}`;
}))).join('\n');

const result = await transform(combined, {
    loader: 'js',
    format: 'iife',
    minify: true,
    sourcemap: true,
    sourcefile: 'vrclub.js',
    target: ['es2020'],
});
const jsName = `app-${digest(result.code)}.js`;
await writeFile(path.join(dist, 'assets', jsName), result.code);
await writeFile(path.join(dist, 'assets', `${jsName}.map`), result.map);

const css = await readFile(path.join(root, 'css/styles.css'));
const cssName = `styles-${digest(css)}.css`;
await writeFile(path.join(dist, 'assets', cssName), css);

let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html
    .replace(/<link rel="stylesheet" href="css\/styles\.css\?v=[^"]+">/, `<link rel="stylesheet" href="assets/${cssName}">`)
    .replace(/(js\/vendor\/[^"?]+)\?v=[^"]+/g, '$1')
    .replace(/^\s*<script src="js\/(?!vendor\/)[^"]+"><\/script>\s*$/gm, '')
    .replace('</body>', `    <script src="assets/${jsName}"></script>\n</body>`);
await writeFile(path.join(dist, 'index.html'), html);

await Promise.all([
    cp(path.join(root, 'js/vendor'), path.join(dist, 'js/vendor'), { recursive: true }),
    cp(path.join(root, 'js/models'), path.join(dist, 'js/models'), { recursive: true }),
    cp(path.join(root, 'textures'), path.join(dist, 'textures'), { recursive: true })
]);

console.log(`Built dist/ with assets/${jsName} and assets/${cssName}`);
