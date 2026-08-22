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
 * NOTE: this covers HEADERS only - `await fetch()` resolves as soon as the response
 * head arrives. For a large asset the realistic stall is mid-BODY, which is what
 * `fetchBufferWithTimeout` / `fetchBlobWithTimeout` below exist for. Prefer those
 * when you are downloading bytes.
 *
 * @param {string} url
 * @param {RequestInit & { timeoutMs?: number }} [options]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
    const { timeoutMs = ASSET_FETCH_TIMEOUT_MS, signal: callerSignal, ...init } = options;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    // A caller-supplied signal used to be silently discarded by the spread, making
    // the download uncancellable. Chain it instead.
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
        // Only relabel OUR abort. Rewriting a caller cancellation as "timed out" sends
        // the next debugger hunting a network stall that never happened.
        if (timedOut && err && err.name === 'AbortError') {
            throw new Error(`Timed out after ${timeoutMs} ms fetching ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
        if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
}

/**
 * Download and fully read a response body under ONE deadline.
 *
 * `fetchWithTimeout` clears its timer once headers arrive, so a server that sends
 * `200 OK` and then stalls mid-body hangs startup forever - the exact failure mode
 * the timeout exists to prevent, and the most likely one for a 15 MB GLB.
 *
 * @param {string} url
 * @param {'arrayBuffer'|'blob'} as
 * @param {RequestInit & { timeoutMs?: number }} [options]
 */
async function fetchBodyWithTimeout(url, as, options = {}) {
    const { timeoutMs = ASSET_FETCH_TIMEOUT_MS, signal: callerSignal, ...init } = options;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
        }
        return await response[as]();
    } catch (err) {
        if (timedOut && err && err.name === 'AbortError') {
            throw new Error(`Timed out after ${timeoutMs} ms downloading ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
        if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
}

const fetchBufferWithTimeout = (url, options) => fetchBodyWithTimeout(url, 'arrayBuffer', options);
const fetchBlobWithTimeout = (url, options) => fetchBodyWithTimeout(url, 'blob', options);

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
    constructor({ dbName, storeName, version = 2, maxAgeMs = 1000 * 60 * 60 * 24 * 30, logger = console }) {
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
        // The `if (this.db)` guard above is checked BEFORE an await, so two concurrent
        // callers both passed it and both opened a connection - the second assignment
        // orphaned the first, which stayed open and kept blocking version upgrades.
        if (!this._initPromise) {
            this._initPromise = this._open().finally(() => { this._initPromise = null; });
        }
        return this._initPromise;
    }

    async _open() {
        try {
            this.db = await new Promise((resolve, reject) => {
                if (typeof indexedDB === 'undefined') {
                    reject(new Error('IndexedDB is not available in this context'));
                    return;
                }
                const request = indexedDB.open(this.dbName, this.dbVersion);
                request.onerror = () => reject(request.error || new Error('indexedDB.open failed'));
                // `blocked` is TRANSIENT - another tab holds an older version and will
                // release it. Treating it as terminal disabled persistence for the whole
                // session. Close any connection that arrives late so it cannot leak.
                request.onblocked = () => {
                    this.log.info(`⏳ IndexedDB upgrade blocked by another tab (${this.dbName}); retrying later.`);
                    request.onsuccess = () => { try { request.result.close(); } catch (_) { /* ignore */ } };
                    reject(Object.assign(new Error('IndexedDB upgrade blocked by another tab'), { transient: true }));
                };
                request.onsuccess = () => resolve(request.result);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    const store = db.objectStoreNames.contains(this.storeName)
                        ? event.target.transaction.objectStore(this.storeName)
                        : db.createObjectStore(this.storeName, { keyPath: 'url' });
                    if (!store.indexNames.contains('timestamp')) {
                        store.createIndex('timestamp', 'timestamp');
                    }
                };
            });
            // If the browser evicts or another tab deletes the DB, stop using it.
            this.db.onclose = () => {
                this.log.warn(`⚠️ Persistent cache connection closed unexpectedly (${this.dbName}); running memory-only.`);
                this.db = null;
            };
            this.db.onversionchange = () => { try { this.db.close(); } catch (_) { /* ignore */ } this.db = null; };
        } catch (err) {
            if (!err || !err.transient) this.disabled = true;
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
            request.onerror = () => reject(request.error || tx.error || new Error('request failed'));
            if (mode === 'readwrite') {
                // Settle on COMMIT, not on request success. Chromium routinely reports
                // QuotaExceededError at commit time for large blobs: request.onsuccess
                // fires, put() returns true, and the later tx.onabort rejects an
                // already-settled promise - so the cache reported success, never
                // disabled itself, and retried a doomed write on every single load.
                let result;
                request.onsuccess = () => { result = request.result; };
                tx.oncomplete = () => resolve(result);
            } else {
                request.onsuccess = () => resolve(request.result);
            }
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
            return record.payload !== undefined ? record.payload : null;
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
                // Evict the oldest entries and retry once before giving up on
                // persistence for the session. On a headset the origin quota is a
                // fraction of free disk, so "disable forever on first full" meant
                // re-downloading ~50 MB on every single launch.
                if (!this._evictedOnce) {
                    this._evictedOnce = true;
                    const freed = await this._evictOldest(0.25);
                    if (freed > 0) {
                        this.log.warn(`⚠️ Storage full for ${this.dbName}; evicted ${freed} old entries and retrying.`);
                        try {
                            await this._run('readwrite', (store) => store.put({ url, payload, timestamp: Date.now() }));
                            return true;
                        } catch (_) { /* fall through to disable */ }
                    }
                }
                this.log.warn(`⚠️ Storage quota exhausted for ${this.dbName}; disabling persistent cache.`);
                this.disabled = true;
            } else {
                this.log.warn(`⚠️ Cache write failed for ${url}:`, err);
            }
            return false;
        }
    }

    /**
     * Delete the oldest `fraction` of entries by timestamp.
     * @returns {Promise<number>} number of entries removed
     */
    async _evictOldest(fraction) {
        try {
            const count = await this._run('readonly', (store) => store.count());
            if (!count) return 0;
            const victimCount = Math.max(1, Math.ceil(count * fraction));
            // Query primary keys through the timestamp index. getAll() duplicated every
            // cached GLB/texture payload into JS heap precisely when storage was full.
            const victims = await this._run('readonly', (store) =>
                store.index('timestamp').getAllKeys(undefined, victimCount));
            for (const url of victims) {
                await this._run('readwrite', (store) => store.delete(url));
            }
            return victims.length;
        } catch (_) {
            return 0;
        }
    }

    /** Drop every entry past its TTL. Cheap, and keeps renamed assets from lingering. */
    async prune() {
        if (this.disabled || !this.db || this.maxAgeMs <= 0) return 0;
        try {
            const cutoff = Date.now() - this.maxAgeMs;
            const expired = await this._run('readonly', (store) =>
                store.index('timestamp').getAllKeys(globalThis.IDBKeyRange.upperBound(cutoff, true)));
            for (const url of expired) {
                await this._run('readwrite', (store) => store.delete(url));
            }
            if (expired.length) this.log.info(`🗑️ Pruned ${expired.length} expired entries from ${this.dbName}`);
            return expired.length;
        } catch (_) {
            return 0;
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

    /**
     * Forget every tracked promise. The work itself cannot be cancelled from here,
     * but dropping the references lets the closures - and the loaders and scene they
     * capture - be collected once they settle.
     */
    clear() { this.pending.clear(); }
}

if (typeof window !== 'undefined') {
    window.IndexedDBAssetCache = IndexedDBAssetCache;
    window.InFlightRegistry = InFlightRegistry;
    window.fetchWithTimeout = fetchWithTimeout;
    window.fetchBufferWithTimeout = fetchBufferWithTimeout;
    window.fetchBlobWithTimeout = fetchBlobWithTimeout;
    window.ASSET_FETCH_TIMEOUT_MS = ASSET_FETCH_TIMEOUT_MS;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        IndexedDBAssetCache, InFlightRegistry, fetchWithTimeout,
        fetchBufferWithTimeout, fetchBlobWithTimeout, ASSET_FETCH_TIMEOUT_MS
    };
}
