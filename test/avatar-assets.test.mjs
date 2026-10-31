import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Blob } from 'node:buffer';
import { ClubRoom } from '../worker/src/relay.js';
import relay from '../worker/src/relay.js';
import { sanitizeUploadedAppearance, validateAvatarGlb, AVATAR_ASSET_MAX_BYTES } from '../worker/src/avatarAssets.js';

const appearance = { v: 1, outfit: 'casual', top: '#385e80', bottom: '#263448', glasses: 'round', hat: 'none' };
const bytes = () => {
    const source = readFileSync(process.env.VRCLUB_TEST_PERSONAL_AVATAR || new URL('../js/models/avatars/club-crowd-m1.glb', import.meta.url));
    return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
};
class Socket {
    sent = [];
    accept() {}
    send(data) { this.sent.push(JSON.parse(data)); }
    addEventListener() {}
    close() {}
}
function harness(t) {
    const objects = new Map(), pending = [];
    const bucket = {
        async put(key, data) { objects.set(key, data.slice(0)); return { key }; },
        async get(key) {
            const value = objects.get(key);
            return value ? { size: value.byteLength, body: new Blob([value]).stream() } : null;
        },
        async delete(key) { objects.delete(key); }
    };
    const room = new ClubRoom({ id: 'test-room', waitUntil: work => pending.push(work) }, { AVATAR_ASSETS: bucket });
    room._roomName = 'private-test';
    const join = () => { const ws = new Socket(); return { ws, member: room._acceptSession(ws, 'Guest') }; };
    const owner = join(), guest = join();
    t.after(async () => {
        for (const [ws, member] of [...room.sessions]) room._onClose(ws, member);
        await Promise.all(pending);
    });
    const request = (member, method, body = null, query = '') => {
        member.avatarAssetMutationAt = 0;
        const headers = { Authorization: `Bearer ${member.avatarAssetToken}`, 'Content-Type': method === 'PUT' ? 'model/gltf-binary' : 'application/json',
            'X-Avatar-Appearance': JSON.stringify(appearance) };
        return room.fetch(new Request(`https://relay.example/avatars?room=private-test${query}`, { method, headers, body }));
    };
    return { room, bucket, objects, owner, guest, join, request };
}

test('shared GLB validation enforces self-contained bounded geometry and complete clothing descriptors', () => {
    assert.deepEqual(sanitizeUploadedAppearance(appearance), appearance);
    assert.throws(() => sanitizeUploadedAppearance({ ...appearance, uri: 'https://elsewhere.invalid/' }));
    assert.throws(() => sanitizeUploadedAppearance({ ...appearance, top: 'red' }));
    assert.ok(validateAvatarGlb(bytes()));
    assert.throws(() => validateAvatarGlb(new ArrayBuffer(AVATAR_ASSET_MAX_BYTES + 1)));
    const corrupt = bytes();
    new DataView(corrupt).setUint32(8, 10, true);
    assert.throws(() => validateAvatarGlb(corrupt));
    const source = bytes(), view = new DataView(source), jsonLength = view.getUint32(12, true);
    const original = JSON.parse(new TextDecoder().decode(new Uint8Array(source, 20, jsonLength)));
    const mutate = change => {
        const json = structuredClone(original); change(json);
        const text = new TextEncoder().encode(JSON.stringify(json));
        const padded = Math.ceil(text.length / 4) * 4;
        const bin = new Uint8Array(source, 20 + jsonLength);
        const result = new Uint8Array(20 + padded + bin.length);
        result.set(new Uint8Array(source, 0, 20));
        result.fill(32, 20, 20 + padded); result.set(text, 20); result.set(bin, 20 + padded);
        const header = new DataView(result.buffer); header.setUint32(8, result.length, true); header.setUint32(12, padded, true);
        return result.buffer;
    };
    assert.throws(() => validateAvatarGlb(mutate(json => { json.buffers[0].uri = 'https://attacker.invalid/private'; })), /external|unsupported|limits/);
    assert.throws(() => validateAvatarGlb(mutate(json => { json.nodes[0].extensions = { malicious: {} }; })), /extensions/);
    assert.throws(() => validateAvatarGlb(mutate(json => { json.accessors[0].count = 200000000; })), /accessor/);
});

test('uploaded avatars are acknowledged, retained for late joiners, block-aware and deleted on departure', async t => {
    const { room, objects, owner, guest, join, request } = harness(t);
    assert.ok(owner.ws.sent[0].avatarAssetToken);
    assert.ok(!guest.ws.sent[0].peers.some(peer => Object.hasOwn(peer, 'avatarAssetToken')));
    const put = await request(owner.member, 'PUT', bytes());
    assert.equal(put.status, 200);
    const { model } = await put.json();
    assert.deepEqual(model.appearance, appearance);
    assert.equal(objects.size, 1);
    assert.deepEqual(guest.ws.sent.at(-1).model, model);
    const late = join();
    assert.deepEqual(late.ws.sent[0].peers.find(peer => peer.id === owner.member.id).uploadedAvatar, model);
    const query = `&id=${owner.member.id}&hash=${model.hash}`;
    const downloaded = await request(guest.member, 'GET', null, query);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), new Uint8Array(bytes()));
    owner.member.blocked.add(guest.member.pid);
    assert.equal((await request(guest.member, 'GET', null, query)).status, 404);
    owner.member.blocked.clear();
    const next = { ...appearance, outfit: 'smart', top: '#aabbcc' };
    assert.equal((await request(owner.member, 'POST', JSON.stringify(next))).status, 200);
    assert.deepEqual(owner.member.uploadedAvatar.appearance, next);
    room._onClose(owner.ws, owner.member);
    assert.equal((await request(guest.member, 'GET', null, query)).status, 404);
    assert.equal(objects.size, 0);
    assert.equal((await request(owner.member, 'GET', null, query)).status, 403);
});

test('sharing rejects outsiders, oversized input and departed uploads without retaining an object', async t => {
    const { room, objects, owner, bucket, request } = harness(t);
    assert.equal((await room.fetch(new Request('https://relay.example/avatars'))).status, 403);
    assert.equal((await request(owner.member, 'PUT', new Uint8Array(AVATAR_ASSET_MAX_BYTES + 1))).status, 400);
    owner.member.avatarAssetUploadAt = 0;
    const put = bucket.put;
    bucket.put = async (key, data) => { await put(key, data); room._onClose(owner.ws, owner.member); };
    assert.equal((await request(owner.member, 'PUT', bytes())).status, 503);
    assert.equal(objects.size, 0);
});

test('public avatar routes require allowed Origin and membership tokens never go in URLs', async t => {
    const { room } = harness(t);
    const env = { AVATAR_ASSETS: {}, ALLOWED_ORIGINS: 'https://club.example',
        CLUB_ROOM: { idFromName: name => name, get: () => room } };
    assert.equal((await relay.fetch(new Request('https://relay.example/avatars?room=private-test'), env)).status, 403);
    const preflight = await relay.fetch(new Request('https://relay.example/avatars?room=private-test', {
        method: 'OPTIONS', headers: { Origin: 'https://club.example' }
    }), env);
    assert.equal(preflight.status, 204);
    const denied = await relay.fetch(new Request('https://relay.example/avatars?room=private-test', { headers: { Origin: 'https://club.example' } }), env);
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), 'https://club.example');
});
