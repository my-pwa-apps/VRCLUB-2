import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { ReadableStream } from 'node:stream/web';

function fixture(fetch) {
    const store = new Map(), errors = [], events = [];
    const context = vm.createContext({
        URL, AbortController, CustomEvent: class { constructor(type) { this.type = type; } },
        setTimeout, clearTimeout, console, fetch, crypto: webcrypto,
        localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }
    });
    context.window = { dispatchEvent: event => events.push(event.type), CustomAvatarAppearance: { key: JSON.stringify } };
    vm.runInContext(readFileSync(new URL('../js/uploadedAvatarSharing.js', import.meta.url), 'utf8'), context);
    const appearance = { v: 1, outfit: 'casual', top: '#536781', bottom: '#292e38', glasses: 'none', hat: 'none' };
    const club = { _customAvatarBytes: new Uint8Array([1, 2, 3]).buffer,
        isCustomAvatarSelected: () => true, getCustomAvatarAppearance: () => appearance,
        showErrorMessage: message => errors.push(message) };
    const sharing = new context.window.UploadedAvatarSharing(club);
    const client = { status: 'connected', serverUrl: 'wss://relay.example', room: 'private-test',
        avatarAssetToken: 'private-membership-token', uploadedAvatarsSupported: true };
    return { sharing, club, client, errors, events, appearance };
}

test('sharing is opt-in, sends membership only as authorization, and coalesces wardrobe updates without another upload', async () => {
    const calls = [];
    const f = fixture(async (url, init) => {
        calls.push({ url, ...init });
        return Response.json({ model: { hash: 'a'.repeat(64) } });
    });
    f.sharing.connect(f.client);
    await f.sharing._queue;
    assert.equal(calls.length, 0);
    f.sharing.setEnabled(true);
    await f.sharing._queue;
    assert.equal(calls[0].method, 'PUT');
    assert.equal(new URL(calls[0].url).searchParams.get('room'), 'private-test');
    assert.equal(calls[0].headers.Authorization, 'Bearer private-membership-token');
    assert.ok(!String(calls[0].url).includes('private-membership-token'));
    f.sharing._mutationAt = 0;
    f.appearance.top = '#abcdef';
    f.sharing.sync(); f.appearance.outfit = 'smart';
    await f.sharing.sync();
    assert.deepEqual(calls.map(call => call.method), ['PUT', 'POST']);
    assert.equal(JSON.parse(calls[1].body).outfit, 'smart');
    f.sharing._mutationAt = 0;
    f.sharing.setEnabled(false);
    await f.sharing._queue;
    assert.equal(calls.at(-1).method, 'DELETE');
    assert.equal(f.sharing._publishedHash, null);
    assert.equal(f.errors.length, 0);
});

test('turning sharing off during upload queues removal rather than leaving the model published', async () => {
    let release;
    const uploaded = new Promise(resolve => { release = resolve; });
    const calls = [];
    const f = fixture(async (url, init) => {
        calls.push(init.method);
        if (init.method === 'PUT') await uploaded;
        return Response.json({ model: { hash: 'b'.repeat(64) } });
    });
    f.sharing.connect(f.client); f.sharing.setEnabled(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(calls, ['PUT']);
    f.sharing.setEnabled(false);
    f.sharing._mutationAt = 0;
    release();
    await f.sharing._queue;
    assert.deepEqual(calls, ['PUT', 'DELETE']);
});

test('unsupported relays report failure, disconnect clears publication, and downloads enforce size and integrity', async () => {
    const data = new Uint8Array([11, 12, 13]);
    let response = () => new Response(data);
    const f = fixture(async () => response());
    f.client.uploadedAvatarsSupported = false;
    f.sharing.connect(f.client); f.sharing.setEnabled(true);
    await f.sharing._queue;
    assert.match(f.errors.at(-1), /relay needs an update/i);
    f.client.uploadedAvatarsSupported = true;
    const digest = Buffer.from(await webcrypto.subtle.digest('SHA-256', data)).toString('hex');
    const model = { hash: digest, bytes: 3 };
    assert.deepEqual(new Uint8Array(await f.sharing.download('peer', model)), data);
    await assert.rejects(f.sharing.download('peer', { ...model, hash: '0'.repeat(64) }), /integrity/);
    await assert.rejects(f.sharing.download('peer', { ...model, bytes: 4 }), /invalid size/);
    response = () => new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); controller.close(); }
    }));
    await assert.rejects(f.sharing.download('peer', model), /8 MiB/);
    f.sharing._publishedHash = digest;
    f.sharing.connect(null);
    await f.sharing._queue;
    assert.equal(f.sharing._publishedHash, null);
    assert.equal(f.sharing.client, null);
    f.sharing.dispose();
});
