/**
 * assetCache.js — shared, hardened asset-caching primitives.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `textureLoader.js` and `modelLoader.js` each carried a near-identical, hand-rolled
 * IndexedDB wrapper. Both copies shared the same four defects:
 *
 *   1. Only `request.onerror` was handled. IndexedDB reports quota exhaustion,
 *      aborted transactions and "database is closing" on the TRANSACTION, not the
 *      request — so those failures resolved neither promise. The loader hung
 *      forever and the splash spinner span with no error anywhere.
 *   2. `fetch()` had no timeout. A stalled CDN connection froze startup
 *      indefinitely with no way out but a page reload.
 *   3. No in-flight de-duplication. Two concurrent callers for the same URL
 *      downloaded the same asset twice.
 *   4. `QuotaExceededError` propagated out of the *write* path and aborted the
 *      *read* path, so a full origin quota (very easy to hit on Quest, ~50 MB of
 *      GLB + textures) made the app permanently unable to load anything, even
 *      though the bytes had already been downloaded successfully.
 *
 * Both loaders now share this single, tested implementation.
 *
 * Loaded as a classic script; exposes `window.IndexedDBAssetCache` and
 * `window.fetchWithTimeout`. Must be loaded BEFORE textureLoader.js/modelLoader.js.
 */
'use strict';

/** Default network budget for a single asset download. */
const ASSET_FETCH_TIMEOUT_MS = 45000;

/**
 * `fetch` with a hard deadline.
 *
 * A browser `fetch()` has no default timeout. If a CDN accepts the TCP connection
 * but never sends a response, the promise never settles and every `await` behind
 * it is stuck for the lifetime of the page.
 *
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
    const { timeoutMs = ASSET_FETCH_TIMEOUT_MS, ...init } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
        if (err && err.name === 'AbortError') {
            throw new Error(`Timed out after ${timeoutMs} ms fetching ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Promise-wrapped IndexedDB key/value store for binary assets.
 *
 * Every method degrades to a no-op rather than throwing when IndexedDB is
 * unavailable (Firefox private browsing, blocked third-party storage, quota
 * exhausted). Caching is an OPTIMISATION — losing it must never break the app.
 */
class IndexedDBAssetCache {
    /**
     * @param {object} opts
     * @param {string} opts.dbName     IndexedDB database name.
     * @param {string} opts.storeName  Object store name.
     * @param {number} [opts.version]  Schema version.
     * @param {number} [opts.maxAgeMs] Entries older than this are treated as misses.
     * @param {object} [opts.logger]   `{ info, warn, error }`.
     */
    constructor({ dbName, storeName, version = 1, maxAgeMs = 1000 * 60 * 60 * 24 * 30, logger = console }) {
        this.dbName = dbName;
        this.storeName = storeName;
        this.dbVersion = version;
        this.maxAgeMs = maxAgeMs;
        this.log = logger;
        this.db = null;
        /** Set once we know persistence is unusable, so we stop retrying every asset. */
        this.disabled = false;
    }

    /** Open the database. Never rejects — falls back to memory-only operation. */
    async init() {
        if (this.db || this.disabled) return;
        try {
            this.db = await new Promise((resolve, reject) => {
                if (typeof indexedDB === 'undefined') {
                    reject(new Error('IndexedDB is not available in this context'));
                    return;
                }
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = () => reject(request.error || new Error('indexedDB.open failed'));
                request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'url' });
                    }
                };
            });
            // If the browser evicts or another tab deletes the DB, stop using it.
            this.db.onclose = () => { this.db = null; };
            this.db.onversionchange = () => { try { this.db.close(); } catch (_) { /* ignore */ } this.db = null; };
        } catch (err) {
            this.disabled = true;
            this.log.warn(`⚠️ Persistent cache unavailable (${this.dbName}); running memory-only:`, err);
        }
    }

    /**
     * Run one IndexedDB request inside a transaction, wiring up EVERY failure
     * channel: request error, transaction error, and transaction abort. Missing
     * the latter two is what caused the original hang-forever bug.
     */
    _run(mode, work) {
        return new Promise((resolve, reject) => {
            if (!this.db) { reject(new Error('cache not open')); return; }
            let tx;
            try {
                tx = this.db.transaction([this.storeName], mode);
            } catch (err) {
                reject(err);
                return;
            }
            tx.onerror = () => reject(tx.error || new Error('transaction failed'));
            tx.onabort = () => reject(tx.error || new Error('transaction aborted'));

            let request;
            try {
                request = work(tx.objectStore(this.storeName));
            } catch (err) {
                reject(err);
                return;
            }
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('request failed'));
        });
    }

    /**
     * @returns {Promise<any|null>} The cached payload, or null on miss/expiry/error.
     */
    async get(url) {
        if (this.disabled || !this.db) return null;
        try {
            const record = await this._run('readonly', (store) => store.get(url));
            if (!record) return null;
            if (this.maxAgeMs > 0 && record.timestamp && (Date.now() - record.timestamp) > this.maxAgeMs) {
                this.log.info(`🗑️ Cache entry expired: ${url.split('/').pop()}`);
                this.delete(url);
                return null;
            }
            return record.payload !== undefined ? record.payload : (record.blob || record.data || null);
        } catch (err) {
            this.log.warn(`⚠️ Cache read failed for ${url}:`, err);
            return null;
        }
    }

    /**
     * Persist a payload. Failures are swallowed by design: a full quota must
     * degrade to "download every time", never to "the app cannot start".
     * @returns {Promise<boolean>} whether the write succeeded
     */
    async put(url, payload) {
        if (this.disabled || !this.db) return false;
        try {
            await this._run('readwrite', (store) => store.put({ url, payload, timestamp: Date.now() }));
            return true;
        } catch (err) {
            const name = err && err.name;
            if (name === 'QuotaExceededError' || name === 'NotFoundError') {
                this.log.warn(`⚠️ Storage quota exhausted for ${this.dbName}; disabling persistent cache.`);
                this.disabled = true;
            } else {
                this.log.warn(`⚠️ Cache write failed for ${url}:`, err);
            }
            return false;
        }
    }

    async delete(url) {
        if (this.disabled || !this.db) return;
        try { await this._run('readwrite', (store) => store.delete(url)); } catch (_) { /* best effort */ }
    }

    async clear() {
        if (!this.db) return;
        try {
            await this._run('readwrite', (store) => store.clear());
            this.log.info(`🗑️ Cleared cache: ${this.dbName}`);
        } catch (err) {
            this.log.warn(`⚠️ Failed to clear ${this.dbName}:`, err);
        }
    }

    close() {
        if (this.db) { try { this.db.close(); } catch (_) { /* ignore */ } this.db = null; }
    }
}

/**
 * De-duplicates concurrent async work by key.
 *
 * Without this, two code paths asking for the same 12 MB GLB at the same time
 * both miss the cache and both download it.
 */
class InFlightRegistry {
    constructor() { this.pending = new Map(); }

    /**
     * @param {string} key
     * @param {() => Promise<any>} factory Invoked only if no work is in flight for `key`.
     */
    run(key, factory) {
        const existing = this.pending.get(key);
        if (existing) return existing;
        const promise = (async () => factory())().finally(() => this.pending.delete(key));
        this.pending.set(key, promise);
        return promise;
    }
}

if (typeof window !== 'undefined') {
    window.IndexedDBAssetCache = IndexedDBAssetCache;
    window.InFlightRegistry = InFlightRegistry;
    window.fetchWithTimeout = fetchWithTimeout;
    window.ASSET_FETCH_TIMEOUT_MS = ASSET_FETCH_TIMEOUT_MS;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IndexedDBAssetCache, InFlightRegistry, fetchWithTimeout, ASSET_FETCH_TIMEOUT_MS };
}
