import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handlePayments } from '../worker/src/payments.js';

const ORIGIN = 'https://nocturne.mitwee.nl';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

async function setup(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    for (const file of ['0001_payments', '0002_vr_invitations', '0003_invitation_admin', '0004_payment_modes', '0005_access_recovery', '0007_device_links']) {
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
        DB, SESSION_SECRET: 'link-fixture', ACCESS_RECOVERY_ENABLED: '1', STRIPE_MODE: 'live',
        APP_ORIGIN: ORIGIN, RECOVERY_FROM: 'access@mitwee.nl',
        EMAIL: { async send(message) { emails.push(message); return { messageId: 'fixture-id' }; } }
    };
    const call = (path, body, cookie = '', extra = {}) => handlePayments(new Request('https://api.mitwee.nl/payments/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: ORIGIN, Cookie: cookie, 'CF-Connecting-IP': '203.0.113.10', ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env, ORIGIN);
    const verify = async (email = 'owner@example.com') => {
        const start = await call('recovery/start', { email, intent: 'restore' });
        const challenge = (await start.json()).challenge;
        const code = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
        const result = await call('recovery/verify', { challenge, code });
        assert.equal(result.status, 200, await result.clone().text());
        return { cookie: result.headers.get('set-cookie').split(';')[0], info: await result.json() };
    };
    const paid = (email = 'owner@example.com') => {
        sqlite.prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)').run(email, 'fixture');
        const user = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email);
        sqlite.prepare(`INSERT INTO purchases (checkout_session_id, user_id, amount, currency, status, updated_at, livemode)
            VALUES (?, ?, 199, 'eur', 'paid', 'fixture', 1)`).run(crypto.randomUUID(), user.id);
        return user.id;
    };
    const start = async (ip = '203.0.113.10') => {
        const response = await call('link/start', {}, '', { 'CF-Connecting-IP': ip });
        return { status: response.status, ...await response.json() };
    };
    const poll = async link => {
        const response = await call('link/poll', { linkId: link.linkId, secret: link.secret });
        return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
    };
    return { env, sqlite, emails, call, verify, paid, start, poll };
}

test('a headset pairs through a phone: start, approve by a verified entitled owner, then collect its own device session', { skip: !DatabaseSync }, async t => {
    const { call, verify, paid, start, poll, sqlite } = await setup(t);
    paid();
    const link = await start();
    assert.equal(link.status, 200);
    assert.match(link.code, /^\d{8}$/);
    assert.match(link.secret, /^[a-f0-9]{64}$/);
    assert.equal(link.expiresInSeconds, 600);

    // Nothing is stored in the clear.
    const stored = JSON.stringify(sqlite.prepare('SELECT * FROM access_device_links').all());
    assert.ok(!stored.includes(link.code) && !stored.includes(link.secret), 'the code or secret is stored in the clear');

    assert.deepEqual((await poll(link)).body, { status: 'pending' });
    const phone = await verify();
    const approved = await call('link/approve', { code: link.code, name: 'Quest 3' }, phone.cookie);
    assert.equal(approved.status, 200, await approved.clone().text());
    const approval = await approved.json();
    assert.equal(approval.linked, true);
    assert.equal(approval.devices.length, 1);
    assert.equal(approval.devices[0].name, 'Quest 3');

    const collected = await poll(link);
    assert.equal(collected.status, 200);
    assert.equal(collected.body.status, 'approved');
    assert.equal(collected.body.entitled, true);
    assert.equal(collected.body.deviceRegistered, true);
    assert.match(collected.cookie, /nocturne_vr_session=v2_[a-f0-9]{64}.*HttpOnly.*Secure.*SameSite=Lax/);
    const headsetCookie = collected.cookie.split(';')[0];

    // The headset's own session is a registered device: it can take the VR lease.
    const acquired = await call('vr/acquire', { tab: crypto.randomUUID() }, headsetCookie);
    assert.equal(acquired.status, 200, await acquired.clone().text());
    assert.equal((await acquired.json()).active, true);

    // A code works once, and the secret is shown once.
    const again = await poll(link);
    assert.equal(again.status, 410);
    assert.equal(again.cookie, null);
    assert.equal((await call('link/approve', { code: link.code, name: 'Another' }, phone.cookie)).status, 404);
    assert.deepEqual(sqlite.prepare('SELECT action FROM access_audit ORDER BY id').all().map(row => row.action),
        ['email_verified', 'device_linked', 'device_session_created']);
});

test('only a verified, entitled owner can approve, and only a live code', { skip: !DatabaseSync }, async t => {
    const { call, verify, paid, start, sqlite } = await setup(t);
    const link = await start();
    assert.equal((await call('link/approve', { code: link.code, name: 'Quest' })).status, 401, 'an unverified phone must not approve');
    const phone = await verify();
    const unpaid = await call('link/approve', { code: link.code, name: 'Quest' }, phone.cookie);
    assert.equal(unpaid.status, 403);
    assert.equal((await unpaid.json()).error, 'not_entitled');
    assert.equal(sqlite.prepare("SELECT status FROM access_device_links").get().status, 'pending');
    paid();
    assert.equal((await call('link/approve', { code: '00000000', name: 'Quest' }, phone.cookie)).status, 404);
    assert.equal((await call('link/approve', { code: '123', name: 'Quest' }, phone.cookie)).status, 400);
    assert.equal((await call('link/approve', { code: link.code, name: '' }, phone.cookie)).status, 400);
    sqlite.prepare('UPDATE access_device_links SET expires_at = ?').run(Date.now() - 1000);
    assert.equal((await call('link/approve', { code: link.code, name: 'Quest' }, phone.cookie)).status, 404, 'an expired code was approved');
});

test('polling needs the headset secret and reports expiry', { skip: !DatabaseSync }, async t => {
    const { call, start, poll, sqlite } = await setup(t);
    const link = await start();
    assert.equal((await call('link/poll', { linkId: link.linkId, secret: 'a'.repeat(64) })).status, 404);
    assert.equal((await call('link/poll', { linkId: link.linkId, secret: 'short' })).status, 400);
    assert.equal((await call('link/poll', { linkId: crypto.randomUUID(), secret: link.secret })).status, 404);
    sqlite.prepare('UPDATE access_device_links SET expires_at = ?').run(Date.now() - 1000);
    const expired = await poll(link);
    assert.equal(expired.status, 410);
    assert.equal(expired.body.status, 'expired');
});

test('a full account must replace a device explicitly, and the replaced device loses its session', { skip: !DatabaseSync }, async t => {
    const { call, verify, paid, start, poll, sqlite } = await setup(t);
    paid();
    const phone = await verify();
    const cookies = [];
    for (const name of ['Quest A', 'Quest B']) {
        const link = await start();
        assert.equal((await call('link/approve', { code: link.code, name }, phone.cookie)).status, 200);
        cookies.push((await poll(link)).cookie.split(';')[0]);
    }
    assert.equal((await (await call('entitlement', undefined, cookies[0])).json()).deviceRegistered, true);

    const third = await start();
    const refused = await call('link/approve', { code: third.code, name: 'Quest C' }, phone.cookie);
    assert.equal(refused.status, 409);
    const limit = await refused.json();
    assert.equal(limit.error, 'device_limit');
    assert.equal(limit.devices.length, 2);
    assert.equal(sqlite.prepare("SELECT status FROM access_device_links WHERE id = ?").get(third.linkId).status, 'pending');
    assert.equal((await call('link/approve', { code: third.code, name: 'Quest C', replaceDevice: crypto.randomUUID() }, phone.cookie)).status, 409);

    const replaced = await call('link/approve', { code: third.code, name: 'Quest C', replaceDevice: limit.devices[0].id }, phone.cookie);
    assert.equal(replaced.status, 200, await replaced.clone().text());
    assert.deepEqual((await replaced.json()).devices.map(device => device.name).sort(), ['Quest B', 'Quest C']);
    const newest = await poll(third);
    assert.equal(newest.body.status, 'approved');
    assert.equal((await (await call('entitlement', undefined, cookies[0])).json()).deviceRegistered, false, 'the replaced device kept its access');
    assert.equal((await (await call('entitlement', undefined, cookies[1])).json()).deviceRegistered, true);
});

test('two headsets polling the same approved code cannot both get a session', { skip: !DatabaseSync }, async t => {
    const { call, verify, paid, start, poll, sqlite } = await setup(t);
    paid();
    const phone = await verify();
    const link = await start();
    await call('link/approve', { code: link.code, name: 'Quest' }, phone.cookie);
    const results = await Promise.all([poll(link), poll(link), poll(link)]);
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 410).length, 2);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM access_sessions WHERE device_id IS NOT NULL').get().n, 1);
});

test('pairing is rate limited for anonymous callers and for guessing on the phone side', { skip: !DatabaseSync }, async t => {
    const { call, verify, paid, start } = await setup(t);
    for (let i = 0; i < 10; i++) assert.equal((await start('198.51.100.7')).status, 200);
    assert.equal((await start('198.51.100.7')).status, 429);
    assert.equal((await start('198.51.100.8')).status, 200, 'the limit is per IP');
    paid();
    const phone = await verify();
    for (let i = 0; i < 10; i++) {
        assert.equal((await call('link/approve', { code: '00000000', name: 'Quest' }, phone.cookie, { 'CF-Connecting-IP': `192.0.2.${i}` })).status, 404);
    }
    assert.equal((await call('link/approve', { code: '00000000', name: 'Quest' }, phone.cookie, { 'CF-Connecting-IP': '192.0.2.99' })).status, 429);
});

test('pairing needs access recovery switched on and only answers POST from the app origin', { skip: !DatabaseSync }, async t => {
    const { env, call } = await setup(t);
    assert.equal((await call('link/start')).status, 405);
    const foreign = await handlePayments(new Request('https://api.mitwee.nl/payments/link/start', {
        method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}'
    }), env, ORIGIN);
    assert.equal(foreign.status, 403);
    env.ACCESS_RECOVERY_ENABLED = '0';
    assert.equal((await call('link/start', {})).status, 503);
});
