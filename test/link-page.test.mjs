import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');

test('the phone pairing page is a strict-CSP page with no inline code, no HTML sinks and no tracking of the code beyond sessionStorage', () => {
    const html = read('link/index.html');
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self';/, 'script-src must not allow inline or remote scripts');
    assert.match(csp, /style-src 'self';/, 'style-src must not allow inline styles');
    assert.match(csp, /connect-src 'self' https:\/\/api\.mitwee\.nl;/, 'only the access API may be contacted');
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), 'an inline <script> block');
    assert.ok(!/\son[a-z]+\s*=/i.test(html), 'an inline event handler');
    assert.ok(!/<style[\s>]|style="/i.test(html), 'inline styles are blocked by the CSP');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(html, /<meta name="referrer" content="no-referrer">/);
    for (const asset of ['link/link.js', 'link/link.css', 'icons/icon-192.png', 'icons/icon-180.png']) assert.ok(existsSync(join(ROOT, asset)), `${asset} is missing`);

    const script = read('link/link.js');
    assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(script), 'an HTML or code sink');
    assert.ok(!/localStorage|document\.cookie/.test(script), 'the page must not persist credentials');
    assert.ok(/credentials: 'include'/.test(script), 'the session cookie is HttpOnly and travels with credentials');
    // Every endpoint it calls exists in the worker.
    const worker = read('worker/src/deviceLink.js') + read('worker/src/accessRecovery.js') + read('worker/src/payments.js');
    for (const endpoint of ['/recovery/start', '/recovery/verify', '/devices', '/redeem', '/checkout', '/claim', '/link/approve']) {
        assert.ok(script.includes(`'${endpoint}'`), `link.js no longer calls ${endpoint}`);
        const route = endpoint.replace(/^\/(.*)$/, '$1');
        assert.ok(worker.includes(route), `the worker has no ${endpoint} route`);
    }
});

test('the build ships the pairing page, revalidates it, and the service worker leaves it alone', () => {
    const build = read('scripts/build.mjs');
    assert.match(build, /cp\(path\.join\(root, 'link'\), path\.join\(dist, 'link'\)/);
    assert.match(read('_headers'), /\/link\/\*\s+Cache-Control: no-cache/);
    assert.match(read('scripts/serve.mjs'), /icons\|screenshots\|link/);
    const sw = read('sw.js');
    assert.match(sw, /\.\/link\/.*\)\.pathname\)\) return;/, 'the worker must not treat /link/ as the app shell');
    // Checkout can send the owner back to the pairing page, and only there.
    const payments = read('worker/src/payments.js');
    assert.match(payments, /body\?\.returnTo === 'link' \? '\/link\/' : '\/'/);
});
