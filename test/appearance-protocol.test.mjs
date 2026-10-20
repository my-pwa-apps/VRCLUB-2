import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { ClubRoom, TokenBucket, RATE_LIMITS, sanitizeAppearance, MAX_APPEARANCE_LENGTH } from '../worker/src/relay.js';

const wardrobe = (base = 'f1') => ({
    v: 1, base, hair: 'long', outfit: 'smart',
    skin: '#AaBBcc', hairColor: '#123456', top: '#FEDCBA', bottom: '#000000'
});
const plain = value => JSON.parse(JSON.stringify(value));

class Socket {
    static OPEN = 1;
    static instances = [];
    constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.sent = [];
        this.listeners = {};
        Socket.instances.push(this);
    }
    accept() {}
    addEventListener(type, fn) { this.listeners[type] = fn; }
    send(data) { this.sent.push(JSON.parse(data)); }
    close(code) { this.readyState = 3; this.listeners.close?.({ code }); }
    receive(value) { this.listeners.message?.({ data: JSON.stringify(value) }); }
    last(type) { return this.sent.filter(frame => frame.type === type).at(-1); }
}

function clientClass() {
    const window = {};
    vm.runInNewContext(readFileSync(new URL('../js/networkClient.js', import.meta.url), 'utf8'), {
        window, console, URL, performance, WebSocket: Socket,
        setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}
    });
    return window.NetworkClient;
}

function join(room, base = 'f1', appearance = null) {
    const ws = new Socket();
    const session = room._acceptSession(ws, 'Guest', null, 'any', false, null, base, appearance);
    return { ws, session };
}

function welcome(client, fields = {}) {
    client.connect();
    const ws = Socket.instances.at(-1);
    ws.receive({ type: 'welcome', id: 'self', avatar: 'f1', avatarSelection: true, appearanceSelection: true,
        appearance: null, peers: [], ...fields });
    return ws;
}

test('wardrobe sanitizers require the exact complete allow-listed shape and normalize only hex case', () => {
    const NetworkClient = clientClass();
    for (const sanitize of [sanitizeAppearance, NetworkClient.sanitizeAppearance]) {
        assert.deepEqual(plain(sanitize(wardrobe(), 'f1')), { ...wardrobe(), skin: '#aabbcc', top: '#fedcba' });
        assert.equal(sanitize(null, 'f1'), null);
        for (const base of ['f1', 'f8', 'm1', 'm9']) assert.equal(sanitize(wardrobe(base), base).base, base);
        for (const base of ['f0', 'f9', 'm0', 'm10', 'F1', 'f1\n', '__proto__', null]) {
            assert.equal(sanitize(wardrobe(base), base), undefined);
        }
        assert.equal(sanitize(wardrobe('m9'), 'f1'), undefined, 'an otherwise valid base must match the authority');
        const invalid = [undefined, false, 1, '', [], {}, { ...wardrobe(), extra: true },
            { ...wardrobe(), v: '1' }, { ...wardrobe(), v: 2 }, { ...wardrobe(), hair: 'bald' },
            { ...wardrobe(), outfit: 'formal' }, { ...wardrobe(), hair: 'long'.repeat(1000) }];
        for (const key of Object.keys(wardrobe())) {
            const missing = wardrobe();
            delete missing[key];
            invalid.push(missing);
        }
        for (const key of ['skin', 'hairColor', 'top', 'bottom']) {
            for (const value of ['#abc', '#12345678', '#gggggg', 'red', '#123456\n', '#123456 '.repeat(1000), 123456, null, {}]) {
                invalid.push({ ...wardrobe(), [key]: value });
            }
        }
        for (const value of invalid) assert.equal(sanitize(value, 'f1'), undefined, JSON.stringify(value));
    }
});

test('relay wardrobes use retained join/avatar metadata, acknowledgements, blocks, the avatar rate bucket and clear', t => {
    const room = new ClubRoom({});
    t.after(() => { for (const [ws, session] of [...room.sessions]) room._onClose(ws, session); });
    const observer = join(room, 'm1');
    const chosen = join(room, 'f1', wardrobe());
    const normalized = sanitizeAppearance(wardrobe(), 'f1');
    assert.equal(chosen.ws.last('welcome').appearanceSelection, true);
    assert.deepEqual(chosen.ws.last('welcome').appearance, normalized);
    assert.deepEqual(observer.ws.last('join').appearance, normalized);
    const late = join(room, 'm2');
    assert.deepEqual(late.ws.last('welcome').peers.find(peer => peer.id === chosen.session.id).appearance, normalized);
    chosen.ws.receive({ type: 'avatar', avatar: 'm9', appearance: wardrobe('m9') });
    assert.equal(chosen.session.avatar, 'm9');
    assert.deepEqual(chosen.ws.last('avatar').appearance, sanitizeAppearance(wardrobe('m9'), 'm9'));
    assert.deepEqual(observer.ws.last('avatar'), chosen.ws.last('avatar'));
    observer.ws.receive({ type: 'block', pid: chosen.session.pid });
    const hidden = observer.ws.sent.length;
    chosen.ws.receive({ type: 'avatar', avatar: 'm9', appearance: null });
    assert.equal(chosen.session.avatar, 'm9', 'clearing never rerolls the base');
    assert.equal(chosen.session.appearance, null);
    assert.equal(observer.ws.sent.length, hidden);
    chosen.ws.receive({ type: 'avatar', avatar: 'f1', appearance: wardrobe() });
    assert.deepEqual(chosen.ws.last('avatar-error'), { type: 'avatar-error', reason: 'rate-limit' });
    assert.equal(chosen.session.appearance, null);
    chosen.session.buckets.avatar = new TokenBucket(RATE_LIMITS.avatar);
    chosen.ws.receive({ type: 'avatar', avatar: 'm9', appearance: wardrobe('m9') });
    observer.ws.receive({ type: 'unblock', pid: chosen.session.pid });
    assert.deepEqual(observer.ws.last('join').appearance, chosen.session.appearance, 'unblock restores retained wardrobe');
    const resumed = join(room, 'm9', wardrobe('m9'));
    assert.deepEqual(resumed.ws.last('welcome').appearance, chosen.session.appearance, 'reconnect restores exact base/wardrobe');
    chosen.ws.receive({ type: 'avatar', avatar: 'f2' });
    assert.equal(chosen.session.appearance, null, 'older avatar-only changes clear the wardrobe');
});

test('malformed wardrobe frames are atomic and never change the authoritative base or wardrobe', t => {
    const room = new ClubRoom({});
    t.after(() => { for (const [ws, session] of [...room.sessions]) room._onClose(ws, session); });
    const guest = join(room, 'f1', wardrobe());
    const observer = join(room, 'm1');
    const before = plain(guest.session.appearance), seen = observer.ws.sent.length;
    for (const appearance of [{ ...wardrobe(), extra: true }, wardrobe('m9'), {}, [], 'x'.repeat(17000)]) {
        guest.session.buckets.avatar = new TokenBucket(RATE_LIMITS.avatar);
        guest.ws.receive({ type: 'avatar', avatar: 'f1', appearance });
        assert.equal(guest.session.avatar, 'f1');
        assert.deepEqual(guest.session.appearance, before);
        assert.equal(observer.ws.sent.length, seen);
    }
    guest.ws.receive({ type: 'state', state: { x: 1, y: 1.7, z: 2, rotY: 0, appearance: wardrobe('m9') } });
    assert.deepEqual(guest.session.appearance, before, 'pose frames cannot update appearance');
    assert.equal(guest.session.lastState.appearance, undefined);
});

test('join URL accepts only bounded JSON with a matching exact base, including explicit clear', async t => {
    const OriginalResponse = globalThis.Response, originalPair = globalThis.WebSocketPair;
    const room = new ClubRoom({}), sockets = [];
    globalThis.WebSocketPair = class { constructor() { this[0] = {}; this[1] = new Socket(); sockets.push(this[1]); } };
    globalThis.Response = class { constructor(body, init) { this.status = init.status; } };
    t.after(() => {
        globalThis.Response = OriginalResponse;
        if (originalPair === undefined) delete globalThis.WebSocketPair;
        else globalThis.WebSocketPair = originalPair;
        for (const [ws, session] of [...room.sessions]) room._onClose(ws, session);
    });
    const request = (appearance, avatar = 'f1') => {
        const url = new URL('https://relay.example/');
        if (avatar !== null) url.searchParams.set('avatar', avatar);
        url.searchParams.set('appearance', appearance);
        return room.fetch({ url: url.href, headers: { get: () => 'websocket' } });
    };
    assert.equal((await request(JSON.stringify(wardrobe()))).status, 101);
    assert.deepEqual(sockets.at(-1).last('welcome').appearance, sanitizeAppearance(wardrobe(), 'f1'));
    assert.equal((await request('null')).status, 101);
    assert.equal(sockets.at(-1).last('welcome').appearance, null);
    for (const value of ['{', '{}', '[]', '"bad"', JSON.stringify(wardrobe('m9')),
        ' '.repeat(MAX_APPEARANCE_LENGTH + 1) + 'null', JSON.stringify({ ...wardrobe(), extra: true })]) {
        assert.equal((await request(value)).status, 400);
    }
    assert.equal((await request(JSON.stringify(wardrobe()), null)).status, 400, 'custom join requires an exact base');
});

test('client stores validated preferences, joins/reconnects, emits metadata and changes self only on acknowledgement', () => {
    const NetworkClient = clientClass(), normalized = sanitizeAppearance(wardrobe(), 'f1');
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', appearance: wardrobe() });
    const self = [], peers = [], joins = [];
    client.onSelfAppearance = value => self.push(plain(value));
    client.onPeerAppearance = (id, value) => peers.push([id, plain(value)]);
    client.onPeerJoin = (id, name, info) => joins.push(plain(info));
    const ws = welcome(client, { appearance: normalized,
        peers: [{ id: 'peer', avatar: 'f1', appearance: normalized }] });
    assert.equal(new URL(ws.url).searchParams.get('avatar'), 'f1');
    assert.deepEqual(JSON.parse(new URL(ws.url).searchParams.get('appearance')), normalized);
    assert.equal(ws.last('avatar'), undefined, 'no duplicate appearance publication after accepted join');
    assert.deepEqual(plain(client.selfAppearance), normalized);
    assert.deepEqual(plain(client.peers.get('peer').appearance), normalized);
    assert.deepEqual(joins[0].appearance, normalized);
    assert.equal(client.selectAppearance(wardrobe('m9')), true);
    assert.deepEqual(ws.last('avatar'), { type: 'avatar', avatar: 'm9', appearance: sanitizeAppearance(wardrobe('m9'), 'm9') });
    assert.equal(client.avatar, 'f1');
    assert.deepEqual(plain(client.selfAppearance), normalized);
    const changes = ws.sent.filter(frame => frame.type === 'avatar').length;
    for (let i = 0; i < 10; i++) client.sendState({ x: i, y: 1.7, z: 0, rotY: 0 });
    assert.equal(ws.sent.filter(frame => frame.type === 'avatar').length, changes, 'poses never republish the wardrobe');
    assert.equal(ws.last('state').state.appearance, undefined);
    ws.receive({ type: 'avatar', id: 'self', avatar: 'm9', appearance: wardrobe('m9') });
    assert.equal(client.selfAppearance.base, 'm9');
    assert.equal(self.at(-1).base, 'm9');
    ws.receive({ type: 'avatar', id: 'peer', avatar: 'm9', appearance: wardrobe('m9') });
    assert.equal(client.peers.get('peer').appearance.base, 'm9');
    assert.equal(peers.at(-1)[1].base, 'm9');
    client.disconnect();
    const again = welcome(client, { avatar: 'm9', appearance: wardrobe('m9') });
    assert.equal(new URL(again.url).searchParams.get('avatar'), 'm9');
    assert.equal(JSON.parse(new URL(again.url).searchParams.get('appearance')).base, 'm9');
    assert.equal(client.sendAppearance(null, 'm9'), true);
    assert.deepEqual(again.last('avatar'), { type: 'avatar', avatar: 'm9', appearance: null });
    assert.equal(client.selfAppearance.base, 'm9', 'clear awaits acknowledgement too');
    again.receive({ type: 'avatar', id: 'self', avatar: 'm9', appearance: null });
    assert.equal(client.selfAppearance, null);
    client.disconnect();
});

test('client rejects invalid or unsupported wardrobe updates, and reconciles edits/clear made while connecting', () => {
    const NetworkClient = clientClass();
    for (const next of [wardrobe('m9'), null]) {
        const client = new NetworkClient({ serverUrl: 'wss://relay.example', appearance: wardrobe() });
        client.connect();
        const ws = Socket.instances.at(-1);
        client.preferredAppearance = next;
        ws.receive({ type: 'welcome', id: 'self', avatar: 'f1', avatarSelection: true,
            appearanceSelection: true, appearance: wardrobe(), peers: [] });
        assert.deepEqual(ws.last('avatar'), { type: 'avatar', avatar: next?.base || 'f1',
            appearance: next ? sanitizeAppearance(next, next.base) : null });
        client.disconnect();
    }
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', appearance: wardrobe() }), errors = [];
    client.onError = error => errors.push(error.code);
    const ws = welcome(client, { appearanceSelection: false });
    assert.equal(errors.at(-1), 'appearance-unsupported');
    assert.equal(client.selfAppearance, null);
    assert.equal(client.selectAppearance(wardrobe('m9')), false);
    assert.equal(client.preferredAppearance.base, 'm9', 'keep local save even when the relay is old');
    assert.equal(client.selectAppearance(null, 'm9'), false, 'clear/reset must not silently succeed on old relays');
    assert.equal(ws.last('avatar'), undefined);
    assert.equal(client.setPreferredAppearance({ ...wardrobe(), extra: true }), false);
    assert.equal(errors.at(-1), 'appearance-invalid');
    assert.equal(client.selectAppearance(wardrobe(), 'm9'), false);
    ws.receive({ type: 'avatar-error', reason: 'invalid-appearance' });
    assert.equal(errors.at(-1), 'appearance-invalid');
    client.disconnect();
});

test('client block and malformed incoming wardrobe metadata cannot expose or replace a peer wardrobe', () => {
    const NetworkClient = clientClass(), pid = 'a'.repeat(16);
    const client = new NetworkClient({ serverUrl: 'wss://relay.example', blocked: [pid] });
    const ws = welcome(client, { peers: [{ id: 'hidden', pid, avatar: 'f1', appearance: wardrobe() },
        { id: 'visible', avatar: 'f1', appearance: wardrobe() }] });
    assert.equal(client.peers.has('hidden'), false);
    ws.receive({ type: 'avatar', id: 'hidden', avatar: 'm9', appearance: wardrobe('m9') });
    assert.equal(client.peers.has('hidden'), false);
    ws.receive({ type: 'avatar', id: 'visible', avatar: 'm9', appearance: wardrobe() });
    assert.equal(client.peers.get('visible').avatar, 'f1');
    assert.equal(client.peers.get('visible').appearance.base, 'f1');
    client.disconnect();
});
