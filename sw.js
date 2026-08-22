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
const VERSION = 'vrclub-v20260822-1';
const CACHE_TOKEN = '20260822-1';
const CACHE_NAME = `vrclub-cache-${VERSION}`;

/** Canonical key for the navigation/app-shell document. */
const SHELL_URL = './index.html';

const APP_SHELL_SOURCES = [
    './css/styles.css',
    './js/vendor/babylon.js',
    './js/vendor/babylonjs.proceduralTextures.min.js',
    './js/vendor/babylonjs.loaders.min.js',
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
            return undefined;
        }));
        await self.clients.claim();
    })());
});

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

    // App shell: always answer navigations from the cached shell when offline.
    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
        return;
    }

    event.respondWith(handleAsset(event, request));
});

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
