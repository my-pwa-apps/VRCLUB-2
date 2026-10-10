import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { handlePayments, invitationCodeHash } from '../worker/src/payments.js';

const ORIGIN = 'https://nocturne.mitwee.nl';
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

async function setup(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    for (const file of ['0001_payments', '0002_vr_invitations', '0003_invitation_admin', '0004_payment_modes', '0005_access_recovery']) {
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
        DB, SESSION_SECRET: 'recovery-fixture', ACCESS_RECOVERY_ENABLED: '1', STRIPE_MODE: 'live',
        APP_ORIGIN: ORIGIN, RECOVERY_FROM: 'access@mitwee.nl',
        EMAIL: { async send(message) { emails.push(message); return { messageId: 'fixture-id' }; } }
    };
    const call = (path, body, cookie = '', extra = {}) => handlePayments(new Request('https://api.mitwee.nl/payments/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: ORIGIN, Cookie: cookie, 'CF-Connecting-IP': '127.0.0.1', ...extra },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), env, ORIGIN);
    const verify = async (email = 'owner@example.com', oldCookie = '', intent = 'restore') => {
        const start = await call('recovery/start', { email, intent }, oldCookie);
        assert.equal(start.status, 200);
        const challenge = (await start.json()).challenge;
        const code = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
        const result = await call('recovery/verify', { challenge, code }, oldCookie);
        assert.equal(result.status, 200, await result.clone().text());
        return { cookie: result.headers.get('set-cookie').split(';')[0], info: await result.json(), challenge, code };
    };
    const paid = (email = 'owner@example.com', live = 1) => {
        sqlite.prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)').run(email, 'fixture');
        const user = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email);
        sqlite.prepare(`INSERT INTO purchases (checkout_session_id, user_id, amount, currency, status, updated_at, livemode)
            VALUES (?, ?, 199, 'eur', 'paid', 'fixture', ?)`).run(crypto.randomUUID(), user.id, live);
        return user.id;
    };
    return { env, sqlite, emails, call, verify, paid };
}

function oldCookie(subject) {
    const payload = `${subject}.${Math.floor(Date.now() / 1000) + 3600}`;
    return `nocturne_vr_session=${Buffer.from(payload).toString('base64url')}.${createHmac('sha256', 'recovery-fixture').update(payload).digest('base64url')}`;
}

test('numeric invitations require verification and enforce account attempt limits even when IPs change', { skip: !DatabaseSync }, async t => {
    const { sqlite, call, verify } = await setup(t);
    const hash = await invitationCodeHash('00123456');
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at) VALUES (?, ?)').run(hash, 'fixture');
    assert.equal((await call('redeem', { code: '00123456' })).status, 401);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
    const { cookie } = await verify();
    for (let i = 0; i < 10; i++) {
        assert.equal((await call('redeem', { code: '00000000' }, cookie, { 'CF-Connecting-IP': `192.0.2.${i}` })).status, 409);
    }
    assert.equal((await call('redeem', { code: '00123456' }, cookie, { 'CF-Connecting-IP': '192.0.2.200' })).status, 429);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
});

test('a revoked purchase cannot be restored by replaying Checkout claim or completion', { skip: !DatabaseSync }, async t => {
    const { env, paid, call, sqlite, verify } = await setup(t);
    paid();
    const purchase = sqlite.prepare('SELECT checkout_session_id FROM purchases').get();
    const sessionId = 'cs_live_revoked_fixture';
    sqlite.prepare('UPDATE purchases SET checkout_session_id = ?, status = ? WHERE checkout_session_id = ?')
        .run(sessionId, 'revoked', purchase.checkout_session_id);
    env.STRIPE_LIVE_SECRET_KEY = 'fixture';
    env.STRIPE_LIVE_WEBHOOK_SECRET = 'webhook-fixture';
    const session = {
        id: sessionId, payment_status: 'paid', livemode: true,
        customer_details: { email: 'owner@example.com' }, metadata: { product: 'nocturne_vr_access' },
        amount_total: 199, currency: 'eur'
    };
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = async () => Response.json(session);
    assert.equal((await call('claim', { session_id: sessionId })).status, 403);
    const raw = JSON.stringify({ livemode: true, type: 'checkout.session.completed', data: { object: session } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', env.STRIPE_LIVE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
    const webhook = await handlePayments(new Request('https://api.mitwee.nl/payments/webhook', {
        method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw
    }), env, ORIGIN);
    assert.equal(webhook.status, 200);
    assert.equal(sqlite.prepare('SELECT status FROM purchases').get().status, 'revoked');
    assert.equal((await verify()).info.entitled, false);
});

test('verified paid access restores across devices with a two-slot atomic cap and replacement revokes the old session', { skip: !DatabaseSync }, async t => {
    const { verify, paid, call, sqlite } = await setup(t);
    paid();
    const first = await verify();
    assert.equal(first.info.entitled, true);
    assert.equal(first.info.deviceRegistered, false);
    const a = await call('devices/register', { name: 'Quest' }, first.cookie);
    assert.equal(a.status, 200);
    const aInfo = await a.json();
    const firstDevice = aInfo.devices[0].id;
    assert.equal((await (await call('entitlement', undefined, first.cookie)).json()).deviceRegistered, true);
    const second = await verify();
    assert.equal((await call('devices/register', { name: 'Computer' }, second.cookie)).status, 200);
    const third = await verify();
    const attempts = await Promise.all(Array.from({ length: 8 }, () => call('devices/register', { name: 'New Quest' }, third.cookie)));
    assert.ok(attempts.every(response => response.status === 409));
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_devices WHERE revoked_at IS NULL').get().n, 2);
    const replace = await call('devices/register', { name: 'New Quest', replaceDevice: firstDevice }, third.cookie);
    assert.equal(replace.status, 200, await replace.clone().text());
    assert.equal((await (await call('entitlement', undefined, first.cookie)).json()).entitled, false);
    assert.equal((await (await call('entitlement', undefined, third.cookie)).json()).entitled, true);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_devices WHERE revoked_at IS NULL').get().n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM access_audit WHERE action = 'device_replaced'").get().n, 1);
    const thirdId = (await replace.json()).devices.find(device => device.current).id;
    assert.equal((await call('devices/remove', { id: thirdId }, second.cookie)).status, 200);
    assert.equal((await (await call('entitlement', undefined, third.cookie)).json()).verified, false);
});

test('simultaneous device registration on one verified proof creates only one slot', { skip: !DatabaseSync }, async t => {
    const { verify, call, sqlite } = await setup(t);
    const proof = await verify();
    const results = await Promise.all(Array.from({ length: 10 }, () => call('devices/register', { name: 'Quest' }, proof.cookie)));
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_devices WHERE revoked_at IS NULL').get().n, 1);
});

test('a code is bound to its challenge, expires, limits attempts, and is consumed once even with concurrent verification', { skip: !DatabaseSync }, async t => {
    const { call, emails, sqlite } = await setup(t);
    const start = await call('recovery/start', { email: 'person@example.com', intent: 'restore' });
    const challenge = (await start.json()).challenge;
    const code = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
    assert.ok(!sqlite.prepare('SELECT code_hash FROM access_challenges').get().code_hash.includes(code));
    const results = await Promise.all(Array.from({ length: 10 }, () => call('recovery/verify', { challenge, code })));
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_sessions').get().n, 1);
    assert.equal((await call('recovery/verify', { challenge, code })).status, 400);
    for (const mode of ['expiry', 'attempts']) {
        const next = (await (await call('recovery/start', { email: 'next@example.com', intent: 'restore' })).json()).challenge;
        const correct = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
        if (mode === 'expiry') sqlite.prepare('UPDATE access_challenges SET expires_at = 1 WHERE id = ?').run(next);
        else for (let i = 0; i < 5; i++) {
            assert.equal((await call('recovery/verify', { challenge: next, code: correct === '00000000' ? '99999999' : '00000000' })).status, 400);
        }
        assert.equal((await call('recovery/verify', { challenge: next, code: correct })).status, 400);
    }
});

test('email verification alone never grants unpaid or test-mode access and generic replies do not reveal purchases', { skip: !DatabaseSync }, async t => {
    const { verify, paid, call, emails } = await setup(t);
    paid('test@example.com', 0);
    for (const email of ['test@example.com', 'unknown@example.com']) {
        const proof = await verify(email);
        assert.equal(proof.info.entitled, false);
        assert.equal(proof.info.verified, true);
        assert.equal((await call('vr/acquire', { tab: crypto.randomUUID() }, proof.cookie)).status, 403);
        assert.ok(!emails.at(-1).text.includes('paid customer'));
    }
    assert.equal((await call('recovery/start', { email: 'unknown@example.com', intent: 'restore' }, '', { Origin: 'https://foreign.example' })).status, 403);
});

test('one-use invitations require verified email and remain recoverable and revocable without issuing new grants', { skip: !DatabaseSync }, async t => {
    const { verify, call, sqlite } = await setup(t);
    const code = 'A'.repeat(32), hash = await invitationCodeHash(code);
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at) VALUES (?, ?)').run(hash, 'fixture');
    assert.equal((await call('redeem', { code })).status, 401);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
    const first = await verify();
    const redeemed = await Promise.all(Array.from({ length: 10 }, () => call('redeem', { code }, first.cookie)));
    assert.equal(redeemed.filter(result => result.status === 200).length, 1);
    assert.equal((await (await call('entitlement', undefined, first.cookie)).json()).entitled, true);
    const restored = await verify();
    assert.equal(restored.info.entitled, true);
    sqlite.prepare('UPDATE vr_invitations SET revoked_at = ?').run('fixture');
    assert.equal((await (await call('entitlement', undefined, first.cookie)).json()).entitled, false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM vr_invitations').get().n, 1);
});

test('legacy access is retained for migration, but only its verified owner can link it and the old invitation cookie then stops working', { skip: !DatabaseSync }, async t => {
    const { verify, call, paid, sqlite } = await setup(t);
    const userId = paid();
    const paidOld = oldCookie(userId);
    const info = await (await call('entitlement', undefined, paidOld)).json();
    assert.equal(info.entitled, true);
    assert.equal(info.recoveryRequired, true);
    assert.equal((await call('recovery/start', { email: 'thief@example.com', intent: 'bind' }, paidOld)).status, 403);
    const paidRestore = await verify('owner@example.com', paidOld, 'bind');
    assert.equal(paidRestore.info.entitled, true);
    const subject = 'invite:' + crypto.randomUUID();
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at, redeemed_by, redeemed_at) VALUES (?, ?, ?, ?)')
        .run('b'.repeat(64), 'fixture', subject, 'fixture');
    const invitationOld = oldCookie(subject);
    const migrated = await verify('guest@example.com', invitationOld, 'bind');
    assert.equal(migrated.info.entitled, true);
    assert.equal((await (await call('entitlement', undefined, invitationOld)).json()).entitled, false);
    assert.equal((await verify('guest@example.com')).info.entitled, true);
    assert.equal((await call('recovery/start', { email: 'thief@example.com', intent: 'bind' }, invitationOld)).status, 403);
});

test('VR lease acquisition is atomic across devices/tabs, releases safely and expires after crashes; revocation wins on renew', { skip: !DatabaseSync }, async t => {
    const { verify, call, paid, sqlite } = await setup(t);
    paid();
    const first = await verify(), second = await verify();
    await call('devices/register', { name: 'Quest' }, first.cookie);
    await call('devices/register', { name: 'PC' }, second.cookie);
    const tabs = [crypto.randomUUID(), crypto.randomUUID()];
    const results = await Promise.all([
        call('vr/acquire', { tab: tabs[0] }, first.cookie),
        call('vr/acquire', { tab: tabs[1] }, second.cookie)
    ]);
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 1);
    const lease = await results.find(result => result.status === 200).json();
    assert.ok(lease.expiresInMs > 0 && lease.expiresInMs <= 90_000);
    assert.equal(typeof lease.expiresAt, 'number');
    assert.equal((await call('vr/release', { tab: tabs[1] }, second.cookie)).status, 200);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_vr_leases').get().n, 1, 'another session cannot release the lease');
    assert.equal((await call('vr/renew', { tab: tabs[0] }, first.cookie)).status, 200);
    const sameDeviceTab = crypto.randomUUID();
    assert.equal((await call('vr/acquire', { tab: sameDeviceTab }, first.cookie)).status, 409);
    sqlite.prepare('UPDATE access_vr_leases SET expires_at = 1').run();
    assert.equal((await call('vr/acquire', { tab: tabs[1] }, second.cookie)).status, 200);
    sqlite.prepare("UPDATE purchases SET status = 'revoked'").run();
    assert.equal((await call('vr/renew', { tab: tabs[1] }, second.cookie)).status, 403);
});

test('email delivery fails explicitly, deletes unusable challenges and enforces persisted email rate limits', { skip: !DatabaseSync }, async t => {
    const { call, env, sqlite, emails } = await setup(t);
    env.EMAIL.send = async () => { throw new Error('delivery unavailable'); };
    const failure = await call('recovery/start', { email: 'broken@example.com', intent: 'restore' });
    assert.equal(failure.status, 503);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM access_challenges').get().n, 0);
    env.EMAIL.send = async message => { emails.push(message); return { messageId: 'queued' }; };
    for (let i = 0; i < 5; i++) assert.equal((await call('recovery/start', { email: 'limited@example.com', intent: 'restore' })).status, 200);
    assert.equal((await call('recovery/start', { email: 'limited@example.com', intent: 'restore' })).status, 429);
    assert.equal(emails.length, 5);
});

test('audit failure rolls back verification, device replacement and invitation redemption', { skip: !DatabaseSync }, async t => {
    const { verify, call, paid, sqlite, emails } = await setup(t);
    paid();
    const proof = await verify();
    await call('devices/register', { name: 'Quest' }, proof.cookie);
    const device = sqlite.prepare('SELECT id FROM access_devices').get().id;
    const replacement = await verify();
    const pending = await (await call('recovery/start', { email: 'new@example.com', intent: 'restore' })).json();
    const code = /\b\d{8}\b/.exec(emails.at(-1).text)[0];
    const invite = 'C'.repeat(32);
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at) VALUES (?, ?)').run(await invitationCodeHash(invite), 'fixture');
    sqlite.exec("CREATE TRIGGER fail_access_audit BEFORE INSERT ON access_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    assert.equal((await call('recovery/verify', { challenge: pending.challenge, code })).status, 503);
    assert.equal(sqlite.prepare('SELECT consumed_session FROM access_challenges WHERE id = ?').get(pending.challenge).consumed_session, null);
    assert.equal((await call('devices/register', { name: 'New Quest', replaceDevice: device }, replacement.cookie)).status, 503);
    assert.equal(sqlite.prepare('SELECT revoked_at FROM access_devices WHERE id = ?').get(device).revoked_at, null);
    assert.equal((await call('redeem', { code: invite }, replacement.cookie)).status, 503);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
});
