import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePayments } from '../worker/src/payments.js';
import { cleanMusicItems } from '../worker/src/musicSync.js';

const ORIGIN = 'https://nocturne.mitwee.nl';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

async function setup(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    for (const file of ['0001_payments', '0002_vr_invitations', '0003_invitation_admin', '0004_payment_modes', '0005_access_recovery', '0007_device_links', '0008_account_music']) {
        sqlite.exec(await readFile(new URL(`../worker/migrations/${file}.sql`, import.meta.url), 'utf8'));
    }
    const DB = {
        prepare(sql) {
            return { bind(...args) {
                return {
                    sql, args,
                    async first() { return sqlite.prepare(sql).get(...args) || null; },
                    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
                    async run() { return sqlite.prepare(sql).run(...args); }
                };
            } };
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = statements.map(({ sql, args }) => {
                    const statement = sqlite.prepare(sql);
                    return { results: /RETURNING|^\s*SELECT/i.test(sql) ? statement.all(...args) : (statement.run(...args), []) };
                });
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        }
    };
    const emails = [];
    const env = {
        DB, SESSION_SECRET: 'music-fixture', ACCESS_RECOVERY_ENABLED: '1', STRIPE_MODE: 'live',
        APP_ORIGIN: ORIGIN, RECOVERY_FROM: 'access@mitwee.nl',
        EMAIL: { async send(message) { emails.push(message); return { messageId: 'fixture-id' }; } }
    };
    const call = (path, body, cookie = '', extra = {}) => handlePayments(new Request('https://api.mitwee.nl/payments/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: ORIGIN, Cookie: cookie, 'CF-Connecting-IP': '203.0.113.20', ...extra },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
    }), env, ORIGIN);
    const verify = async (email = 'owner@example.com') => {
        const start = await call('recovery/start', { email, intent: 'restore' });
        const challenge = (await start.json()).challenge;
        const code = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
        const result = await call('recovery/verify', { challenge, code });
        assert.equal(result.status, 200, await result.clone().text());
        return result.headers.get('set-cookie').split(';')[0];
    };
    return { env, sqlite, call, verify };
}

test('saved music needs a verified session and is empty until first saved', { skip: !DatabaseSync }, async t => {
    const { call, verify } = await setup(t);
    assert.equal((await call('music')).status, 401);
    assert.equal((await call('music/save', { items: [] })).status, 401);
    const cookie = await verify();
    const first = await (await call('music', undefined, cookie)).json();
    assert.deepEqual(first, { items: null, updatedAt: 0 }, 'never saved means null, so a headset keeps its local list');
});

test('the owner saves a list on the phone and the headset reads the same list back, per account', { skip: !DatabaseSync }, async t => {
    const { call, verify, sqlite } = await setup(t);
    const phone = await verify('owner@example.com');
    const saved = await call('music/save', { items: [
        { url: 'https://audio.example/set.mp3', name: '  Friday set  ' },
        { url: 'https://soundcloud.com/missmelera/colourizon-100' }
    ] }, phone);
    assert.equal(saved.status, 200, await saved.clone().text());
    const result = await saved.json();
    assert.deepEqual(result.items, [
        { url: 'https://audio.example/set.mp3', name: 'Friday set' },
        { url: 'https://soundcloud.com/missmelera/colourizon-100' }
    ]);
    assert.ok(result.updatedAt > 0);
    const read = await (await call('music', undefined, phone)).json();
    assert.deepEqual(read.items, result.items);

    // Saving again replaces the list (removing a link is a save without it) and an empty list is a real answer, not null.
    await call('music/save', { items: [result.items[1]] }, phone);
    assert.equal((await (await call('music', undefined, phone)).json()).items.length, 1);
    await call('music/save', { items: [] }, phone);
    assert.deepEqual((await (await call('music', undefined, phone)).json()).items, []);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_music').get().n, 1, 'one row per account');

    // Another account never sees it.
    const other = await verify('someone-else@example.com');
    assert.equal((await (await call('music', undefined, other)).json()).items, null);
});

test('hostile or malformed lists are refused and nothing is stored', { skip: !DatabaseSync }, async t => {
    const { call, verify, sqlite } = await setup(t);
    const cookie = await verify();
    const tooMany = Array.from({ length: 9 }, (_, i) => ({ url: `https://audio.example/${i}.mp3` }));
    for (const items of [
        'nope', [{ url: 'http://audio.example/a.mp3' }], [{ url: 'javascript:alert(1)' }], [{ url: 'https://user:pw@audio.example/a.mp3' }],
        [{ url: 'https://www.youtube.com/watch?v=x' }], [{ url: 'https://open.spotify.com/track/x' }], [{ url: 'not a url' }],
        [{ url: `https://audio.example/${'a'.repeat(500)}` }], [{}], [null], tooMany,
        [{ url: 'https://audio.example/a.mp3' }, { url: 'https://audio.example/a.mp3' }]
    ]) {
        const response = await call('music/save', { items }, cookie);
        assert.equal(response.status, 400, JSON.stringify(items).slice(0, 80));
    }
    assert.equal((await call('music/save', '{broken', cookie)).status, 400);
    assert.equal((await call('music/save', JSON.stringify({ items: [{ url: `https://a.example/${'x'.repeat(9000)}` }] }), cookie)).status, 400, 'an oversized body is refused');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM account_music').get().n, 0);
});

test('only the right method works on each route, and another origin is refused', { skip: !DatabaseSync }, async t => {
    const { call, verify, env } = await setup(t);
    const cookie = await verify();
    assert.equal((await call('music', { items: [] }, cookie)).status, 405, 'POST to the read route');
    const get = await handlePayments(new Request('https://api.mitwee.nl/payments/music/save', { headers: { Origin: ORIGIN, Cookie: cookie } }), env, ORIGIN);
    assert.equal(get.status, 405, 'GET to the save route');
    const stranger = await handlePayments(new Request('https://api.mitwee.nl/payments/music', { headers: { Origin: 'https://evil.example', Cookie: cookie } }), env, ORIGIN);
    assert.equal(stranger.status, 403);
});

test('saving is rate limited per account', { skip: !DatabaseSync }, async t => {
    const { call, verify } = await setup(t);
    const cookie = await verify();
    let last;
    for (let i = 0; i < 61; i++) last = await call('music/save', { items: [] }, cookie);
    assert.equal(last.status, 429);
});

test('cleanMusicItems keeps only url and a trimmed name', () => {
    assert.deepEqual(cleanMusicItems([{ url: ' https://audio.example/a.mp3 ', name: ` ${'n'.repeat(80)} `, extra: 'x' }]),
        [{ url: 'https://audio.example/a.mp3', name: 'n'.repeat(60) }]);
    assert.deepEqual(cleanMusicItems([]), []);
});
