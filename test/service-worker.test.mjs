import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const token = source.match(/const CACHE_TOKEN = '([^']+)';/)[1];

function harness(code = source) {
    const scope = 'https://club.example/app/', listeners = new Map(), stores = new Map(), fetched = [];
    let offline = false;
    const key = request => new URL(request.url || request, scope).href;
    const caches = {
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                async match(request) { return store.get(key(request))?.clone(); },
                async put(request, response) { store.set(key(request), response.clone()); },
                async keys() { return [...store.keys()].map(url => ({ url })); },
                async delete(request) { return store.delete(key(request)); }
            };
        },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); },
        async match(request) {
            for (const name of stores.keys()) {
                const match = await (await caches.open(name)).match(request);
                if (match) return match;
            }
        }
    };
    const response = body => ({
        status: 200, ok: true, type: 'basic', body,
        clone() { return response(body); }
    });
    const context = vm.createContext({
        URL, Response, console, caches,
        fetch: async request => {
            fetched.push(key(request));
            if (offline) throw new Error('offline');
            return response(key(request).includes('vendor') ? 'vendor' : 'club shell');
        },
        self: { registration: { scope }, location: { origin: new URL(scope).origin },
            clients: { claim() {} }, addEventListener: (name, handler) => listeners.set(name, handler) }
    });
    vm.runInContext(code, context);
    async function dispatch(name, request) {
        const pending = [];
        let result;
        listeners.get(name)({
            request, waitUntil: promise => pending.push(promise),
            respondWith: promise => { result = promise; }
        });
        const delivered = await result;
        await Promise.all(pending);
        return { delivered, lifetimeTasks: pending.length };
    }
    return { dispatch, stores, fetched, offline: () => { offline = true; }, scope };
}

for (const production of [false, true]) {
    test(`${production ? 'production' : 'development'} activation warms the exact vendor keys for the first offline reload`, async () => {
        const h = harness(production ? source.replace(/const VENDOR_QUERY = [^;]+;/, "const VENDOR_QUERY = '';") : source);
        await h.dispatch('activate');
        assert.equal(h.fetched.length, 3);
        h.offline();
        for (const url of h.fetched.slice()) {
            assert.equal(new URL(url).search, production ? '' : `?v=${token}`);
            const { delivered } = await h.dispatch('fetch', { url, method: 'GET', destination: 'script' });
            assert.equal(delivered.body, 'vendor');
        }
        assert.equal(h.fetched.length, 3, 'offline scripts should be served without another fetch');
    });
}

test('activation removes obsolete vendor query keys without growing the three-entry cache', async () => {
    const h = harness(source.replace(/const VENDOR_QUERY = [^;]+;/, "const VENDOR_QUERY = '';"));
    h.stores.set(`vrclub-vendor-${token}`, new Map([
        [`${h.scope}js/vendor/babylon.js?v=${token}`, {}]
    ]));
    await h.dispatch('activate');
    const entries = h.stores.get(`vrclub-vendor-${token}`);
    assert.equal(entries.size, 3);
    assert.ok([...entries.keys()].every(url => !new URL(url).search));
});

test('only club navigations update the canonical shell and keep cache writes alive', async () => {
    const h = harness();
    const request = path => ({ url: new URL(path, h.scope).href, method: 'GET', mode: 'navigate' });
    const first = await h.dispatch('fetch', request('./?room=test'));
    assert.equal(first.lifetimeTasks, 1, 'navigation cache write must be owned by the fetch event');
    for (const path of ['broadcast', 'broadcast/', 'broadcast/index.html', 'link/', 'other.html']) {
        assert.equal((await h.dispatch('fetch', request(path))).delivered, undefined, `${path} must bypass the shell`);
    }
    assert.equal(h.fetched.length, 1);
    h.offline();
    assert.equal((await h.dispatch('fetch', request('index.html'))).delivered.body, first.delivered.body);
    assert.equal((await h.dispatch('fetch', request('broadcast/'))).delivered, undefined);
});
