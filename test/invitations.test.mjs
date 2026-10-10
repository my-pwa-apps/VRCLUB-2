import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { generateInvitations, writeInvitations } from '../scripts/generate-vr-invitations.mjs';
import { generateInvitationCode, handlePayments, invitationCodeHash, normalizeInvitationCode, paymentInternals } from '../worker/src/payments.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ORIGIN = 'https://nocturne.mitwee.nl';
let DatabaseSync;
try {
    ({ DatabaseSync } = await import('node:sqlite'));
} catch (error) {
    // Node 20 has no built-in SQLite. CI's Node 24 job runs the real SQL tests.
    if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error;
}

function database(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    return readFile(path.join(ROOT, 'worker', 'migrations', '0001_payments.sql'), 'utf8').then(async schema => {
        sqlite.exec(schema);
        sqlite.exec(await readFile(path.join(ROOT, 'worker', 'migrations', '0002_vr_invitations.sql'), 'utf8'));
        sqlite.exec(await readFile(path.join(ROOT, 'worker', 'migrations', '0004_payment_modes.sql'), 'utf8'));
        sqlite.exec(await readFile(path.join(ROOT, 'worker', 'migrations', '0005_access_recovery.sql'), 'utf8'));
        const DB = {
            prepare(sql) {
                const statement = sqlite.prepare(sql);
                return {
                    bind(...params) {
                        return {
                            async first() { return statement.get(...params) || null; },
                            async run() { return statement.run(...params); }
                        };
                    }
                };
            }
        };
        return { sqlite, env: { DB, SESSION_SECRET: 'invitation-test-secret' } };
    });
}

function redeem(env, code, options = {}) {
    return handlePayments(new Request('https://api.mitwee.nl/payments/redeem', {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...options.headers },
        body: options.body ?? JSON.stringify({ code })
    }), env, ORIGIN);
}

function access(env, cookie = '') {
    return handlePayments(new Request('https://api.mitwee.nl/payments/entitlement', {
        headers: { Origin: ORIGIN, Cookie: cookie }
    }), env, ORIGIN);
}

function cookieFor(subject, secret) {
    const payload = `${subject}.${Math.floor(Date.now() / 1000) + 60}`;
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    return `nocturne_vr_session=${Buffer.from(payload).toString('base64url')}.${signature}`;
}

test('invitation generation uses unique eight-digit numeric codes and stores only canonical hashes in SQL', async () => {
    const { invitations, sql } = await generateInvitations(100);
    assert.equal(new Set(invitations.map(item => item.code)).size, 100);
    assert.equal(new Set(invitations.map(item => item.hash)).size, 100);
    for (const { code, hash } of invitations) {
        assert.match(code, /^[0-9]{8}$/);
        const normalized = normalizeInvitationCode(` ${code.toLowerCase()} `);
        assert.equal(hash, createHash('sha256').update(`nocturne-vr-invite-v1:${normalized}`).digest('hex'));
        assert.ok(sql.includes(hash));
        assert.ok(!sql.includes(code));
        assert.ok(!sql.includes(normalized));
    }
    for (const count of [0, 101, 1.5, NaN, '1']) await assert.rejects(generateInvitations(count));
    for (const code of [null, {}, '', '123', 'G'.repeat(32), 'A'.repeat(65)]) assert.equal(normalizeInvitationCode(code), null);
});

test('numeric generation retains leading zeros and rejects biased samples; old invitation hashes remain valid', async t => {
    const numbers = [0xffffffff, 4200000000, 7];
    t.mock.method(crypto, 'getRandomValues', array => { array[0] = numbers.shift(); return array; });
    assert.equal(generateInvitationCode(), '00000007');
    assert.equal(numbers.length, 0);
    assert.equal(normalizeInvitationCode(' 0000-1234 '), '00001234');
    const old = 'abcdef01-23456789-abcdef01-23456789';
    assert.equal(normalizeInvitationCode(old), 'ABCDEF0123456789ABCDEF0123456789');
    assert.equal(await invitationCodeHash(normalizeInvitationCode(old)),
        createHash('sha256').update('nocturne-vr-invite-v1:ABCDEF0123456789ABCDEF0123456789').digest('hex'));
    for (const invalid of ['1234567', '123456789', '1234ABCD', '12.34567', '１２３４５６７８']) {
        assert.equal(normalizeInvitationCode(invalid), null);
    }
});

test('short-code guesses are rate-limited persistently without consuming a valid invitation', { skip: !DatabaseSync }, async t => {
    const { sqlite, env } = await database(t);
    const hash = await invitationCodeHash('31415926');
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at) VALUES (?, ?)').run(hash, new Date().toISOString());
    for (let i = 0; i < 30; i++) assert.equal((await redeem(env, '00000000')).status, 409);
    const blocked = await redeem(env, '31415926');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '600');
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
    const now = Date.now();
    t.mock.method(Date, 'now', () => now + 600001);
    assert.equal((await redeem(env, '31415926')).status, 200);
});

test('issuance writes privately outside the web tree, rejects symlink aliases, and never overwrites', async t => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'nocturne-invitation-test-'));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const out = path.join(temp, 'new-codes');
    await writeInvitations(out, 2);
    const records = JSON.parse(await readFile(path.join(out, 'invitations.json'), 'utf8'));
    assert.equal(records.length, 2);
    const before = await readFile(path.join(out, 'invitations.sql'), 'utf8');
    await assert.rejects(writeInvitations(out, 2), { code: 'EEXIST' });
    assert.equal(await readFile(path.join(out, 'invitations.sql'), 'utf8'), before);
    await assert.rejects(writeInvitations(path.join(ROOT, 'private-codes'), 1), /outside/);
    await assert.rejects(writeInvitations('relative-folder', 1), /absolute/);
    const cliOut = path.join(temp, 'cli-codes');
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [
        path.join(ROOT, 'scripts', 'generate-vr-invitations.mjs'), '--count', '2', '--out', cliOut
    ]);
    assert.equal(stderr, '');
    assert.match(stdout, /No codes were printed or activated/);
    const cliRecords = JSON.parse(await readFile(path.join(cliOut, 'invitations.json'), 'utf8'));
    for (const { code, hash } of cliRecords) {
        assert.ok(!stdout.includes(code));
        assert.ok(!stdout.includes(hash));
    }
    const alias = path.join(temp, 'repo-alias');
    await symlink(ROOT, alias, process.platform === 'win32' ? 'junction' : 'dir');
    try { await assert.rejects(writeInvitations(path.join(alias, 'private-codes'), 1), /outside/); }
    finally { await unlink(alias); }
});

test('redemption rejects missing configuration and foreign origins without database access', async () => {
    assert.equal((await redeem({}, 'A'.repeat(32))).status, 503);
    const env = { SESSION_SECRET: 'test', DB: { prepare() { throw new Error('must not access DB'); } } };
    assert.equal((await redeem(env, 'A'.repeat(32), { headers: { Origin: 'https://foreign.example' } })).status, 403);
    for (const body of ['{', 'null', JSON.stringify({ code: 'x' }), JSON.stringify({ code: 'A'.repeat(32), padding: 'x'.repeat(1100) })]) {
        assert.equal((await redeem(env, null, { body })).status, 400);
    }
});

test('exactly one simultaneous redemption grants persistent access; reimport cannot reactivate a used code', { skip: !DatabaseSync }, async t => {
    const { sqlite, env } = await database(t);
    const { invitations, sql } = await generateInvitations(1);
    sqlite.exec(sql);
    const results = await Promise.all(Array.from({ length: 12 }, () => redeem(env, invitations[0].code)));
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 11);
    const winner = results.find(result => result.status === 200);
    assert.deepEqual(await winner.json(), { entitled: true });
    const cookie = winner.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await (await access(env, cookie)).json()).entitled, true);
    assert.equal((await (await access(env)).json()).entitled, false);
    assert.equal((await (await access(env, cookieFor('invite:unknown', env.SESSION_SECRET))).json()).entitled, false);
    assert.equal((await (await access(env, cookie.replace('nocturne_vr_session=', 'nocturne_vr_session=x'))).json()).entitled, false);
    const token = paymentInternals.parseCookies(new Request(ORIGIN, { headers: { Cookie: cookie } })).nocturne_vr_session;
    const { userId } = await paymentInternals.verifySession(token, env.SESSION_SECRET);
    assert.match(userId, /^invite:/);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM users').get().n, 0, 'invitations must not impersonate an email account');
    const row = sqlite.prepare('SELECT * FROM vr_invitations').get();
    assert.equal(row.redeemed_by, userId);
    assert.ok(row.redeemed_at);
    assert.throws(() => sqlite.exec(sql), /UNIQUE/, 'reimport must fail rather than silently distribute a colliding numeric code');
    assert.equal((await redeem(env, invitations[0].code)).status, 409);
    sqlite.prepare('UPDATE vr_invitations SET revoked_at = ?').run(new Date().toISOString());
    assert.equal((await (await access(env, cookie)).json()).entitled, false);
});

test('invalid, unknown and pre-revoked codes never consume an invitation', { skip: !DatabaseSync }, async t => {
    const { sqlite, env } = await database(t);
    const { invitations, sql } = await generateInvitations(2);
    sqlite.exec(sql);
    sqlite.prepare('UPDATE vr_invitations SET revoked_at = ? WHERE code_hash = ?').run(new Date().toISOString(), invitations[0].hash);
    const revoked = await redeem(env, invitations[0].code);
    const unknown = await redeem(env, '0'.repeat(32));
    assert.equal(revoked.status, 409);
    assert.equal(unknown.status, 409);
    assert.deepEqual(await revoked.json(), await unknown.json());
    assert.equal(revoked.headers.get('set-cookie'), null);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM vr_invitations WHERE redeemed_by IS NOT NULL').get().n, 0);
    const response = await redeem(env, invitations[1].code.toLowerCase().replaceAll('-', ' '));
    assert.equal(response.status, 200);
    assert.equal(await invitationCodeHash(normalizeInvitationCode(invitations[1].code)), invitations[1].hash);
});

test('database and signer failures report errors without consuming the invitation', { skip: !DatabaseSync }, async t => {
    const { sqlite, env } = await database(t);
    const { invitations, sql } = await generateInvitations(1);
    sqlite.exec(sql);
    const brokenSigner = { ...env, SESSION_SECRET: { toString() { throw new Error('signer failed'); } } };
    assert.equal((await redeem(brokenSigner, invitations[0].code)).status, 503);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations').get().redeemed_by, null);
    const brokenDB = { ...env, DB: { prepare() { throw new Error('DB unavailable'); } } };
    const failure = await redeem(brokenDB, invitations[0].code);
    assert.equal(failure.status, 503);
    assert.equal(failure.headers.get('set-cookie'), null);
    assert.equal((await redeem(env, invitations[0].code)).status, 200);
});

test('paid access and refund revocation remain independent of invitation grants', { skip: !DatabaseSync }, async t => {
    const { sqlite, env } = await database(t);
    sqlite.exec(`
        INSERT INTO users (id, email, created_at) VALUES (42, 'paid@example.com', '2026-01-01');
        INSERT INTO purchases VALUES ('cs_test', 'pi_test', 42, 199, 'eur', 'paid', '2026-01-01', 0);
    `);
    const paidCookie = cookieFor('42', env.SESSION_SECRET);
    assert.equal((await (await access(env, paidCookie)).json()).entitled, true);
    assert.equal((await (await access({ ...env, STRIPE_MODE: 'live' }, paidCookie)).json()).entitled, false,
        'test purchases must not grant live access');
    const { invitations, sql } = await generateInvitations(1);
    sqlite.exec(sql);
    const inviteCookie = (await redeem(env, invitations[0].code)).headers.get('set-cookie');
    assert.equal((await (await access({ ...env, STRIPE_MODE: 'live' }, inviteCookie)).json()).entitled, true,
        'invitation access survives the live-mode switch');
    const body = JSON.stringify({ type: 'charge.refunded', livemode: false, data: { object: { payment_intent: 'pi_test' } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = 'whsec_test';
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const response = await handlePayments(new Request('https://api.mitwee.nl/payments/webhook', {
        method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body
    }), { ...env, STRIPE_WEBHOOK_SECRET: secret }, ORIGIN);
    assert.equal(response.status, 200);
    assert.equal((await (await access(env, paidCookie)).json()).entitled, false);
    assert.equal((await (await access(env, inviteCookie)).json()).entitled, true);
});
