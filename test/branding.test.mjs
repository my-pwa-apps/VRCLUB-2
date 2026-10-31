import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Blob } from 'node:buffer';
import { setInterval } from 'node:timers';
import { BRANDINGS, resolveBranding, validateBranding, brandHtml } from '../scripts/branding.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('branding is opt-in, bounded and CLI overrides the environment', () => {
    assert.equal(resolveBranding().id, 'nocturne');
    assert.equal(resolveBranding([], { VRCLUB_BRANDING: 'ade' }).id, 'ade');
    assert.equal(resolveBranding(['--branding=nocturne'], { VRCLUB_BRANDING: 'ade' }).id, 'nocturne');
    for (const args of [['--branding'], ['--branding=other'], ['--branding=ade', '--branding=nocturne']]) {
        assert.throws(() => resolveBranding(args));
    }
    for (const id of ['other', '', '__proto__']) assert.throws(() => resolveBranding([], { VRCLUB_BRANDING: id }));
});

test('ADE preserves the current shell and services; source/default HTML is unchanged', async () => {
    assert.equal(brandHtml(html, BRANDINGS.nocturne), html);
    const page = brandHtml(html, BRANDINGS.ade);
    assert.match(page, /data-branding="ade"/);
    assert.match(page, /Independent ADE-dressed concept/);
    assert.match(page, /No ADE partnership/);
    for (const pattern of [/<script[^>]*>/g, /<meta[^>]*>/g, /<link[^>]*>/g]) {
        assert.deepEqual([...page.matchAll(pattern)].map(m => m[0]), [...html.matchAll(pattern)].map(m => m[0]));
    }
    assert.equal(page.slice(page.indexOf('<div id="splashScreen"'), page.indexOf('<main')),
        html.slice(html.indexOf('<div id="splashScreen"'), html.indexOf('<main')));
    assert.doesNotMatch(page, /liveEventConcept|data-live-event/);
    await validateBranding(BRANDINGS.ade, root);
    await assert.rejects(validateBranding({ ...BRANDINGS.ade, logoHash: 'wrong' }, root), /ADE logo changed/);
    assert.deepEqual(BRANDINGS.nocturne.assets, []);
    for (const asset of BRANDINGS.ade.assets) {
        assert.ok(existsSync(join(root, asset)));
        assert.doesNotMatch(asset, /https?:|keyvisual|\.\./);
    }
});

function runtime() {
    const draws = [], requests = [], revocations = [];
    const context = vm.createContext({
        console, URL, TextDecoder, TextEncoder, Blob, performance,
        setTimeout, clearTimeout, setInterval, clearInterval,
        addEventListener() {}, removeEventListener() {},
        document: { documentElement: { dataset: {} }, addEventListener() {}, removeEventListener() {} },
        navigator: { userAgent: 'node' },
        atob: s => Buffer.from(s, 'base64').toString('binary'),
        btoa: s => Buffer.from(s, 'binary').toString('base64')
    });
    context.window = context; context.self = context;
    vm.runInContext(readFileSync(join(root, 'js', 'vendor', 'babylon.js'), 'utf8'), context);
    context.BABYLON.Logger.LogLevels = 0;
    const B = context.BABYLON;
    const textures = [];
    B.DynamicTexture = class {
        constructor(name, size) { Object.assign(this, { name, size }); textures.push(this); }
        getContext() { return { fillRect() {}, drawImage: (...args) => draws.push(args) }; }
        update() {}
        dispose() { this.disposed = true; }
    };
    context.URL = { createObjectURL: () => 'blob:local-logo', revokeObjectURL: url => revocations.push(url) };
    context.Image = class {
        naturalWidth = 512;
        naturalHeight = 344;
        async decode() {}
    };
    context.fetchBlobWithTimeout = async (url, options) => { requests.push([url, options.timeoutMs]); return {}; };
    for (const file of ['venueDressing', 'cityDistrict', 'venueBranding']) {
        vm.runInContext(readFileSync(join(root, 'js', `${file}.js`), 'utf8'), context);
    }
    context.ROOM_INTERIOR = { x: { min: -12.25, max: 12.25 }, z: { max: -0.25 } };
    const engine = new B.NullEngine(), scene = new B.Scene(engine);
    const table = B.MeshBuilder.CreateBox('djTable', { width: 6, height: 0.8, depth: 1 }, scene);
    table.position.set(0, 1, -18);
    const materials = [];
    const club = {
        scene, ...context.VenueDressing,
        materialFactory: {
            getPreset: () => new B.StandardMaterial('rail', scene),
            createStandardMaterial(name, options) {
                assert.equal(options.disableLighting, true);
                const material = new B.StandardMaterial(name, scene);
                Object.assign(material, options);
                materials.push(material);
                return material;
            }
        }
    };
    const branding = new context.VenueBranding(club);
    return { context, branding, scene, engine, draws, requests, revocations, textures, materials };
}

test('ADE uses real measured venue geometry, shared artwork materials and complete teardown', async () => {
    const h = runtime();
    try {
        assert.equal(h.context.VenueBranding.requested(), false);
        h.context.location = { search: '?branding=ade&liveEvent=demo' };
        assert.equal(h.context.VenueBranding.requested(), false, 'query strings cannot opt in');
        h.context.document.documentElement.dataset.branding = 'ade';
        assert.equal(h.context.VenueBranding.requested(), true);
        await h.branding.mount();
        assert.deepEqual(h.requests, [['branding/ade/ade26-30y-black.png', 10000]]);
        assert.deepEqual(h.revocations, ['blob:local-logo']);
        assert.equal(h.textures.length, 3);
        assert.equal(h.materials.length, 3);
        assert.equal(h.draws.length, 5, 'fascia repeats three marks; signs/flags use one');
        assert.equal(h.branding._meshes.length, 4, 'fascia, shared signs, flags and poles are four draws');
        assert.equal(h.scene.lights.length, 0);
        for (const mesh of h.branding._meshes) {
            assert.equal(mesh.isPickable, false);
            assert.equal(mesh.checkCollisions, false);
            assert.equal(mesh.layerMask, 0x0fffffff, 'immersive access veil still hides all venue artwork');
        }
        const fascia = h.scene.getMeshByName('venueBrandingDJFascia');
        fascia.computeWorldMatrix(true);
        assert.equal(fascia.position.z, -17.475);
        const flags = h.scene.getMeshByName('venueBrandingEntranceFlag-1MaterialBatch');
        flags.computeWorldMatrix(true);
        assert.ok(flags.getBoundingInfo().boundingBox.minimumWorld.y > h.context.VenueLayout.vestibule.streetLevel);
        h.branding.dispose();
        h.branding.dispose();
        assert.ok(h.textures.every(texture => texture.disposed));
        assert.ok(h.materials.every(material => !h.scene.materials.includes(material)));
        assert.equal(h.scene.getTransformNodeByName('venueBrandingRoot'), null);
        assert.deepEqual(Array.from(h.scene.meshes, mesh => mesh.name), ['djTable']);
    } finally { h.scene.dispose(); h.engine.dispose(); }
});

test('late artwork completion and failed decoding release resources without installing dressing', async () => {
    const h = runtime();
    try {
        let complete;
        let started;
        const decoding = new Promise(resolve => { started = resolve; });
        h.context.Image.prototype.decode = () => new Promise(resolve => { complete = resolve; started(); });
        const mounting = h.branding.mount();
        await decoding;
        h.branding.dispose();
        complete();
        await mounting;
        assert.equal(h.textures.length, 0);
        assert.deepEqual(h.revocations, ['blob:local-logo']);
    } finally { h.scene.dispose(); h.engine.dispose(); }
    const failed = runtime();
    try {
        failed.context.Image.prototype.decode = async () => { throw new Error('bad image'); };
        await assert.rejects(failed.branding.mount(), /bad image/);
        assert.equal(failed.textures.length, 0);
        assert.deepEqual(failed.revocations, ['blob:local-logo']);
        failed.branding.dispose();
    } finally { failed.scene.dispose(); failed.engine.dispose(); }
});

test('built variant has local artwork, notices and offline precache only when opted in',
    { skip: !process.env.VRCLUB_TEST_BRANDING_DIST }, () => {
        const id = process.env.VRCLUB_TEST_BRANDING_DIST;
        assert.ok(Object.hasOwn(BRANDINGS, id));
        const dist = join(root, 'dist');
        const page = readFileSync(join(dist, 'index.html'), 'utf8');
        const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
        const ade = id === 'ade';
        assert.equal(page.includes('data-branding="ade"'), ade);
        assert.equal(page.includes('href="branding/ade/notice.txt"'), ade);
        for (const asset of BRANDINGS.ade.assets) {
            assert.equal(existsSync(join(dist, asset)), ade);
            assert.equal(sw.includes(`./${asset}`), ade);
        }
        assert.equal(existsSync(join(dist, 'branding')), ade);
        assert.deepEqual(JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8')),
            JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')));
        assert.equal(readFileSync(join(dist, '_headers'), 'utf8'), readFileSync(join(root, '_headers'), 'utf8'));
        assert.equal(readFileSync(join(dist, 'robots.txt'), 'utf8'), readFileSync(join(root, 'robots.txt'), 'utf8'));
        assert.ok(readdirSync(join(dist, 'assets')).some(name => /^app-.*\.js$/.test(name)));
        assert.ok(!readdirSync(join(dist, 'assets')).some(name => name.endsWith('.map')));
        assert.doesNotMatch(page, /(?:src|href)="https?:[^"]*(?:ade26|brandpack)/i);
    });
