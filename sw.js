// VR Club Service Worker - Offline Shell & Fast Startup
//
// Scope note: this worker owns the APP SHELL only (HTML, CSS, JS, manifest).
// Models, textures and .env files are downloaded and persisted by
// js/assetCache.js in IndexedDB; caching them here too would store ~100 MB twice
// and exhaust the origin quota on a Quest, which then makes IndexedDB's graceful
// QuotaExceededError path fire constantly.
//
// VERSION / CACHE_TOKEN / PRECACHE are rewritten by scripts/build.mjs for the
// dist/ build, where the app bundle and stylesheet carry content hashes. In
// development the entries below carry the same ?v= token as index.html -
// `caches.match()` compares the FULL URL including the query string, so an
// unversioned precache entry could never satisfy a versioned request and the
// whole precache was previously dead weight (every asset downloaded twice).
const VERSION = 'vrclub-v20261009-1';
const CACHE_TOKEN = '20261009-1';
const CACHE_NAME = `vrclub-cache-${VERSION}`;
// Vendor URLs change with CACHE_TOKEN, not with every first-party bundle hash. Keep
// the 9.5 MB runtime cache across ordinary app deploys and rotate it on a version bump.
const VENDOR_CACHE_NAME = `vrclub-vendor-${CACHE_TOKEN}`;

/** Canonical key for the navigation/app-shell document. */
const SHELL_URL = './index.html';

const APP_SHELL_SOURCES = [
    './css/styles.css',
    './js/assetCache.js',
    './js/audioUtils.js',
    './js/textureLoader.js',
    './js/modelLoader.js',
    './js/materialFactory.js',
    './js/lightFactory.js',
    './js/vjDirector.js',
    './js/showDirector.js',
    './js/ledPatterns.js',
    './js/club/01-core.js',
    './js/club/02-lifecycle.js',
    './js/club/03-rendering.js',
    './js/club/04-environment.js',
    './js/club/05-fixtures.js',
    './js/club/06-effects.js',
    './js/club/07-animation-core.js',
    './js/club/08-animation-fixtures.js',
    './js/club/09-animation-finish.js',
    './js/club/10-ui.js',
    './js/club/11-audio-crowd.js',
    './js/club_hyperrealistic.js',
    './js/ui-init.js'
];

const PRECACHE = [
    './',
    SHELL_URL,
    './manifest.json',
    ...APP_SHELL_SOURCES.map(path => `${path}?v=${CACHE_TOKEN}`)
];

/** Binary assets owned by IndexedDBAssetCache - the SW must not duplicate them. */
const IDB_OWNED = /\.(glb|gltf|bin|env|jpe?g|png|webp|ktx2?|basis)$/i;
const VENDOR_SCRIPTS = new Set([
    './js/vendor/babylon.js',
    './js/vendor/babylonjs.proceduralTextures.min.js',
    './js/vendor/babylonjs.loaders.min.js'
].map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Per-entry, not cache.addAll(): addAll is ATOMIC, so a single missing or
        // renamed asset silently voided the entire precache and left the app with
        // no offline shell at all - which is exactly what happened in production,
        // where the dev-time paths below do not exist.
        const results = await Promise.allSettled(PRECACHE.map(url => cache.add(url)));
        const failed = PRECACHE.filter((_, i) => results[i].status === 'rejected');
        if (failed.length) {
            console.warn('[SW] Precache incomplete; these assets failed:', failed);
        }
        // Deliberately NOT skipWaiting() here. Hot-swapping the controller under a
        // page built from the previous bundle is the classic "stale chunk 404 after
        // deploy" failure. The page asks for it explicitly once the user accepts.
    })());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => {
            if (key.startsWith('vrclub-cache-') && key !== CACHE_NAME) return caches.delete(key);
            if (key.startsWith('vrclub-vendor-') && key !== VENDOR_CACHE_NAME) return caches.delete(key);
            return undefined;
        }));
        // Registration happens after the first page load, so a newly installed worker
        // never observed that page's vendor requests. Warm from the browser HTTP cache
        // during activation to make the next offline start complete without putting the
        // 9.5 MB payload back on the install-critical path.
        await warmVendorCache();
        await self.clients.claim();
    })());
});

async function warmVendorCache() {
    const cache = await caches.open(VENDOR_CACHE_NAME);
    await Promise.all([...VENDOR_SCRIPTS].map(async pathname => {
        const url = new URL(pathname, self.registration.scope);
        url.searchParams.set('v', CACHE_TOKEN);
        if (await cache.match(url.href)) return;
        try {
            const response = await fetch(url.href);
            if (response && response.status === 200 && response.type === 'basic') {
                await cache.put(url.href, response);
            }
        } catch (_) { /* offline activation degrades to the normal network fallback */ }
    }));
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    let url;
    try { url = new URL(request.url); } catch (_) { return; }

    // Cross-origin (radio streams, anything else) is never our business. This also
    // covers the audio stream by ORIGIN rather than by the previous substring test
    // on `request.url.includes('stream')`, which matched any deploy path or query
    // string containing that word and silently disabled the SW for it.
    if (url.origin !== self.location.origin) return;
    if (request.destination === 'audio' || request.destination === 'media') return;
    if (IDB_OWNED.test(url.pathname)) return;

    // Babylon is ~9.5 MB. Do not make installation download it a second time or
    // fail the offline shell on a constrained connection. Cache these three pinned
    // same-origin scripts on first successful use, then serve them cache-first.
    if (VENDOR_SCRIPTS.has(url.pathname)) {
        event.respondWith(handleVendor(event, request));
        return;
    }

    // App shell: always answer navigations from the cached shell when offline.
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    event.respondWith(handleAsset(event, request));
});

async function handleVendor(event, request) {
    const cache = await caches.open(VENDOR_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil((async () => {
                await cache.put(request, copy);
                // The allow-list is the bound: no other URL can enter this cache.
                const keys = await cache.keys();
                if (keys.length > VENDOR_SCRIPTS.size) {
                    await Promise.all(keys.slice(0, keys.length - VENDOR_SCRIPTS.size).map(key => cache.delete(key)));
                }
            })());
        }
        return response;
    } catch (_) {
        return cached || Response.error();
    }
}

async function handleNavigation(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const copy = response.clone();
            // Store under the canonical shell key so the offline fallback below can
            // always find it, regardless of which URL the user navigated to. The
            // previous version cached navigations under the request key ('/') and
            // then looked them up as './index.html', so the fallback never hit.
            caches.open(CACHE_NAME).then(cache => cache.put(SHELL_URL, copy));
        }
        return response;
    } catch (_) {
        const cached = await caches.match(SHELL_URL) || await caches.match('./');
        // Returning undefined from respondWith produces a NetworkError (the browser's
        // offline page), which is precisely what a PWA exists to avoid.
        return cached || Response.error();
    }
}

async function handleAsset(event, request) {
    const cached = await caches.match(request);
    if (cached) {
        // Stale-while-revalidate. waitUntil keeps the worker alive for the write:
        // without it the UA may terminate the worker as soon as respondWith settles,
        // killing the refresh mid-flight so the cache silently never updates.
        event.waitUntil(revalidate(request));
        return cached;
    }

    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
    } catch (_) {
        return Response.error();
    }
}

async function revalidate(request) {
    try {
        // `cache: 'no-cache'` forces a conditional request. Without it the HTTP cache
        // answers (assets are served `immutable, max-age=1y`) and we rewrite a
        // byte-identical body into Cache Storage on every single request.
        const fresh = await fetch(request, { cache: 'no-cache' });
        if (fresh && fresh.status === 200 && fresh.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, fresh);
        }
    } catch (_) { /* offline - the cached copy stands */ }
}
