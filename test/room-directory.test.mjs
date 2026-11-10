import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleRoomDirectory, publishRoom, ROOM_DIRECTORY_TTL } from '../worker/src/roomDirectory.js';
import relay, { ClubRoom } from '../worker/src/relay.js';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

async function setup(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(await readFile(new URL('../worker/migrations/0006_room_directory.sql', import.meta.url), 'utf8'));
    const DB = {
        prepare(sql) {
            return { bind(...args) { return {
                async run() { return sqlite.prepare(sql).run(...args); },
                async all() { return { results: sqlite.prepare(sql).all(...args) }; },
                sql, args
            }; } };
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const result = statements.map(({ sql, args }) => ({
                    results: /RETURNING/.test(sql) ? sqlite.prepare(sql).all(...args) : (sqlite.prepare(sql).run(...args), [])
                }));
                sqlite.exec('COMMIT');
                return result;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        }
    };
    const lookedUp = [];
    const env = { DB, ALLOWED_ORIGINS: 'https://club.example', CLUB_ROOM: {
        idFromName: room => room,
        get: room => ({ async fetch(request) {
            assert.equal(new URL(request.url).pathname, '/directory-status');
            lookedUp.push(room);
            return Response.json({ people: room === 'private-123456' ? 3 : 0, locked: false });
        } })
    } };
    const request = (path = '/rooms', body, extra = {}) => new Request('https://relay.example' + path, {
        method: body === undefined ? 'GET' : 'POST', headers: {
            Origin: 'https://club.example', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...extra
        }, ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { sqlite, DB, env, lookedUp, request };
}

test('public directory excludes every private prefix, expired and empty room, and paginates without personal data', { skip: !DatabaseSync }, async t => {
    const { DB, sqlite, env, request } = await setup(t);
    for (let i = 0; i < 55; i++) await publishRoom(DB, 'public-' + String(i).padStart(2, '0'), 2, i === 2);
    for (const name of ['private-123456', 'Private-654321', 'private-custom']) await publishRoom(DB, name, 3, false);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM public_rooms WHERE room LIKE 'private-%'").get().n, 0);
    sqlite.prepare('INSERT INTO public_rooms VALUES (?, ?, ?, ?)').run('private-forged', 4, 0, Date.now() + ROOM_DIRECTORY_TTL);
    await publishRoom(DB, 'expired', 1, false);
    sqlite.prepare('UPDATE public_rooms SET expires_at = 0 WHERE room = ?').run('expired');
    await publishRoom(DB, 'empty', 0, false);
    const response = await relay.fetch(request(), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const first = await response.json();
    assert.equal(first.rooms.length, 50);
    assert.equal(first.next, 'public-49');
    assert.deepEqual(Object.keys(first.rooms[0]).sort(), ['active', 'capacity', 'locked', 'people', 'room']);
    assert.equal(first.rooms[2].locked, true);
    const second = await (await relay.fetch(request('/rooms?after=' + first.next), env)).json();
    assert.equal(second.rooms.length, 5);
    assert.equal(second.next, null);
    assert.equal(new Set([...first.rooms, ...second.rooms].map(item => item.room)).size, 55);
    assert.equal((await relay.fetch(request('/rooms', undefined, { Origin: 'https://evil.example' }), env)).status, 403);
    for (const headers of [{}, { Upgrade: 'websocket' }]) {
        assert.equal((await relay.fetch(request('/directory-status?room=private-123456', undefined, headers), env)).status, 404);
    }
});

test('private availability only probes explicit bounded room names; no stored or discovered private directory', { skip: !DatabaseSync }, async t => {
    const { env, lookedUp, request, sqlite } = await setup(t);
    const response = await relay.fetch(request('/rooms/status', { rooms: ['private-123456', 'private-123456', 'private-654321'] }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(lookedUp, ['private-123456', 'private-654321']);
    const data = await response.json();
    assert.equal(data.rooms[0].people, 3);
    assert.equal(data.rooms[1].active, false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM public_rooms').get().n, 0);
    for (const rooms of [null, Array(13).fill('private-123456'), ['bad\nname'], [''], ['x'.repeat(65)]]) {
        assert.equal((await relay.fetch(request('/rooms/status', { rooms }), env)).status, 400);
    }
    assert.equal((await relay.fetch(request('/rooms/status'), env)).status, 405);
    assert.equal((await relay.fetch(request('/rooms/status', { rooms: [] }, { 'Content-Type': 'text/plain' }), env)).status, 400);
});

test('room lookups are rate limited persistently and database errors are explicit', { skip: !DatabaseSync }, async t => {
    const { env, request } = await setup(t);
    for (let i = 0; i < 30; i++) assert.equal((await handleRoomDirectory(request(), env, 'https://club.example')).status, 200);
    assert.equal((await handleRoomDirectory(request(), env, 'https://club.example')).status, 429);
    assert.equal((await handleRoomDirectory(request(), {}, 'https://club.example')).status, 503);
    env.DB = { batch() { throw new Error('fixture outage'); }, prepare() { return {}; } };
    assert.equal((await handleRoomDirectory(request(), env, 'https://club.example')).status, 503);
});

test('live room snapshots follow joins, lock, heartbeat and departure; private rooms never publish', { skip: !DatabaseSync }, async t => {
    const { env, sqlite } = await setup(t);
    const pending = [];
    const room = new ClubRoom({ waitUntil: promise => pending.push(promise) }, env);
    room._roomName = 'lobby';
    class Socket {
        accept() {}
        send() {}
        addEventListener() {}
    }
    const ws = new Socket(), host = room._acceptSession(ws, 'Guest');
    t.after(() => clearInterval(room._sweeper));
    await Promise.all(pending);
    assert.equal(sqlite.prepare('SELECT people FROM public_rooms').get().people, 1);
    room._onMessage(ws, host, { data: JSON.stringify({ type: 'lock', locked: true }) });
    await room._directoryWrite;
    assert.equal(sqlite.prepare('SELECT locked FROM public_rooms').get().locked, 1);
    sqlite.prepare('UPDATE public_rooms SET expires_at = 1').run();
    room._directoryUpdatedAt = 0;
    room._sweep();
    await room._directoryWrite;
    assert.ok(sqlite.prepare('SELECT expires_at FROM public_rooms').get().expires_at > Date.now());
    room._onClose(ws, host);
    await room._directoryWrite;
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM public_rooms').get().n, 0);
    room._roomName = 'private-123456';
    room._acceptSession(new Socket(), 'Private guest');
    await room._directoryWrite;
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM public_rooms').get().n, 0);
    const response = await room.fetch(new Request('https://room.internal/directory-status'));
    assert.deepEqual(await response.json(), { people: 1, locked: false });
});
