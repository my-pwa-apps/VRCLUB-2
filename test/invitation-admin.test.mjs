import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { handleInvitationAdmin, verifyAdmin } from '../worker/src/invitationAdmin.js';
import { handlePayments, invitationCodeHash, normalizeInvitationCode } from '../worker/src/payments.js';
import { dashboardScript } from '../worker/src/invitationDashboard.js';
import vm from 'node:vm';

const ORIGIN = 'https://api.mitwee.nl';
const ENV = {
    INVITATION_ADMIN_ORIGIN: ORIGIN,
    INVITATION_ADMINS: 'garfieldapp@outlook.com',
    ACCESS_TEAM_DOMAIN: 'https://test-team.cloudflareaccess.com',
    ACCESS_AUD: 'admin-audience',
    SESSION_SECRET: 'test-session'
};
const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

async function token(overrides = {}, key = keys.privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ type: 'app', email: ENV.INVITATION_ADMINS, sub: 'test-admin', iat: now, exp: now + 3600,
        iss: ENV.ACCESS_TEAM_DOMAIN, aud: [ENV.ACCESS_AUD], ...overrides })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
}

function mockKeys(t) {
    const original = globalThis.fetch;
    t.after(() => { globalThis.fetch = original; });
    globalThis.fetch = async url => {
        assert.equal(String(url), ENV.ACCESS_TEAM_DOMAIN + '/cdn-cgi/access/certs');
        return Response.json({ keys: [jwk] });
    };
}

function request(path, jwt, body, overrides = {}) {
    return new Request(ORIGIN + '/admin/invitations' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
            ...(body === undefined ? {} : { Origin: ORIGIN, 'Content-Type': 'application/json' }), ...overrides },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
}

async function db(t) {
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    for (const name of ['0001_payments.sql', '0002_vr_invitations.sql', '0003_invitation_admin.sql', '0004_payment_modes.sql', '0005_access_recovery.sql']) {
        sqlite.exec(await readFile(new URL('../worker/migrations/' + name, import.meta.url), 'utf8'));
    }
    const DB = {
        prepare(sql) {
            return { bind(...args) {
                return { sql, args,
                    async first() { return sqlite.prepare(sql).get(...args) || null; },
                    async all() { return { results: sqlite.prepare(sql).all(...args) }; }
                };
            } };
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                const results = statements.map(({ sql, args }) => {
                    const stmt = sqlite.prepare(sql);
                    return { results: /RETURNING|^\s*SELECT/i.test(sql) ? stmt.all(...args) : (stmt.run(...args), []) };
                });
                sqlite.exec('COMMIT');
                return results;
            } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
        }
    };
    return { sqlite, env: { ...ENV, DB } };
}

test('admin JWT requires trusted signature, issuer, audience, identity, expiry and token type', async t => {
    mockKeys(t);
    assert.equal(await verifyAdmin(request('', await token()), ENV), ENV.INVITATION_ADMINS);
    const alternate = await generateKeyPair('RS256');
    assert.equal(await verifyAdmin(request('', await token({}, alternate.privateKey)), ENV), null);
    for (const claims of [
        { email: 'guest@example.com' }, { email: undefined }, { aud: ['other-app'] }, { iss: 'https://attacker.example' },
        { exp: 1 }, { exp: undefined }, { iat: undefined }, { iat: Math.floor(Date.now() / 1000) + 600 },
        { sub: undefined }, { type: 'service' }
    ]) assert.equal(await verifyAdmin(request('', await token(claims)), ENV), null, JSON.stringify(claims));
    assert.equal(await verifyAdmin(request('', null), ENV), null);
    assert.equal(await verifyAdmin(request('', 'not-a-jwt'), ENV), null);
});

test('every admin route denies missing or forged identity, including script, and alternate hosts', async t => {
    mockKeys(t);
    for (const path of ['', '/script.js', '/data', '/issue', '/revoke']) {
        const response = await handleInvitationAdmin(request(path, null, path === '/issue' ? { count: 1, label: '' } : undefined), ENV);
        assert.equal(response.status, 403);
    }
    const forged = request('/issue', 'forged', { count: 1, label: '' }, { 'Cf-Access-Authenticated-User-Email': ENV.INVITATION_ADMINS });
    assert.equal((await handleInvitationAdmin(forged, ENV)).status, 403);
    const otherHost = new Request('https://vrclub-network.garfieldapp.workers.dev/admin/invitations/issue', {
        method: 'POST', headers: { 'Cf-Access-Jwt-Assertion': await token() }, body: '{}'
    });
    assert.equal((await handleInvitationAdmin(otherHost, ENV)).status, 403);
    assert.equal(await handleInvitationAdmin(new Request(ORIGIN + '/payments/entitlement'), ENV), null);
});

test('admin dashboard fails closed on missing configuration and unavailable signing keys', async t => {
    mockKeys(t);
    const jwt = await token();
    assert.equal((await handleInvitationAdmin(request('', jwt), { ...ENV, ACCESS_AUD: '' })).status, 503);
    globalThis.fetch = async () => { throw new Error('keys unreachable'); };
    assert.equal((await handleInvitationAdmin(request('', jwt), ENV)).status, 503);
    await assert.rejects(verifyAdmin(request('', jwt), { ...ENV, ACCESS_TEAM_DOMAIN: 'https://attacker.example' }));
});

test('dashboard issues hash-only grants with audit, paginates, redeems and revokes access atomically', { skip: !DatabaseSync }, async t => {
    mockKeys(t);
    const { sqlite, env } = await db(t);
    const jwt = await token();
    const page = await handleInvitationAdmin(request('', jwt), env);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.ok(!(await page.text()).includes('NONCE_PLACEHOLDER'));
    const issue = await handleInvitationAdmin(request('/issue', jwt, { count: 2, label: '<b>Friends</b>' }), env);
    assert.equal(issue.status, 201);
    const { invitations } = await issue.json();
    assert.equal(invitations.length, 2);
    for (const item of invitations) {
        assert.match(item.code, /^[0-9]{8}$/);
        assert.equal(await invitationCodeHash(normalizeInvitationCode(item.code)), item.hash);
        assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM vr_invitations').all()).includes(item.code));
    }
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM invitation_audit').get().n, 2);
    let list = await (await handleInvitationAdmin(request('/data', jwt), env)).json();
    assert.equal(list.actor, ENV.INVITATION_ADMINS);
    assert.equal(list.items.length, 2);
    assert.equal(list.items[0].label, '<b>Friends</b>');
    assert.ok(!JSON.stringify(list).includes(invitations[0].code));
    const grant = await handlePayments(new Request(ORIGIN + '/payments/redeem', {
        method: 'POST', headers: { Origin: 'https://nocturne.mitwee.nl' }, body: JSON.stringify({ code: invitations[0].code })
    }), env, 'https://nocturne.mitwee.nl');
    assert.equal(grant.status, 200);
    const cookie = grant.headers.get('set-cookie');
    const entitlement = () => handlePayments(new Request(ORIGIN + '/payments/entitlement', {
        headers: { Origin: 'https://nocturne.mitwee.nl', Cookie: cookie }
    }), env, 'https://nocturne.mitwee.nl');
    assert.equal((await (await entitlement()).json()).entitled, true);
    assert.equal((await handleInvitationAdmin(request('/revoke', jwt, { hash: invitations[0].hash }), env)).status, 200);
    assert.equal((await (await entitlement()).json()).entitled, false);
    assert.equal((await handleInvitationAdmin(request('/revoke', jwt, { hash: invitations[0].hash }), env)).status, 409);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM invitation_audit WHERE action = 'revoked'").get().n, 1);
    for (let i = 0; i < 3; i++) await handleInvitationAdmin(request('/issue', jwt, { count: 20, label: 'paging' }), env);
    list = await (await handleInvitationAdmin(request('/data', jwt), env)).json();
    assert.equal(list.items.length, 50);
    assert.ok(list.next);
    const next = await (await handleInvitationAdmin(request('/data?before=' + list.next, jwt), env)).json();
    assert.equal(next.items.length, 12);
    assert.equal(next.next, null);
    assert.equal(new Set([...list.items, ...next.items].map(item => item.code_hash)).size, 62);
});

test('numeric issuance retries used identifiers and duplicates within the batch without reissuing old grants', { skip: !DatabaseSync }, async t => {
    mockKeys(t);
    const { sqlite, env } = await db(t);
    const jwt = await token();
    const used = await invitationCodeHash('00000011');
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at, redeemed_by, redeemed_at) VALUES (?, ?, ?, ?)')
        .run(used, 'fixture', 'invite:already-used', 'fixture');
    const numbers = [11, 22, 22, 33];
    t.mock.method(crypto, 'getRandomValues', array => { array[0] = numbers.shift(); return array; });
    const response = await handleInvitationAdmin(request('/issue', jwt, { count: 2, label: 'Collision fixture' }), env);
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).invitations.map(item => item.code), ['00000022', '00000033']);
    assert.equal(numbers.length, 0);
    assert.equal(sqlite.prepare('SELECT redeemed_by FROM vr_invitations WHERE code_hash = ?').get(used).redeemed_by,
        'invite:already-used');
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM invitation_audit').get().n, 2);
});

test('mutations reject foreign origins, malformed inputs and audit failures without partial writes', { skip: !DatabaseSync }, async t => {
    mockKeys(t);
    const { sqlite, env } = await db(t);
    const jwt = await token();
    assert.equal((await handleInvitationAdmin(request('/issue', jwt, { count: 1, label: '' }, { Origin: 'https://foreign.example' }), env)).status, 403);
    assert.equal((await handleInvitationAdmin(request('/issue', jwt, { count: 1, label: '' }, { 'Content-Type': 'text/plain' }), env)).status, 403);
    for (const body of [null, {}, { count: 21, label: '' }, { count: 1.5, label: '' }, { count: 1, label: '\n' }, { count: 1, label: 'x'.repeat(1025) }]) {
        assert.equal((await handleInvitationAdmin(request('/issue', jwt, body), env)).status, 400);
    }
    assert.equal((await handleInvitationAdmin(request('/revoke', jwt, { hash: 'invalid' }), env)).status, 400);
    assert.equal((await handleInvitationAdmin(request('/data?before=bad', jwt), env)).status, 400);
    sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON invitation_audit BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    assert.equal((await handleInvitationAdmin(request('/issue', jwt, { count: 1, label: '' }), env)).status, 503);
    assert.equal(sqlite.prepare('SELECT count(*) AS n FROM vr_invitations').get().n, 0);
    sqlite.exec('DROP TRIGGER fail_audit');
    const issued = await (await handleInvitationAdmin(request('/issue', jwt, { count: 1, label: '' }), env)).json();
    sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON invitation_audit BEGIN SELECT RAISE(ABORT, 'test audit failure'); END");
    assert.equal((await handleInvitationAdmin(request('/revoke', jwt, { hash: issued.invitations[0].hash }), env)).status, 503);
    assert.equal(sqlite.prepare('SELECT revoked_at FROM vr_invitations').get().revoked_at, null);
});

test('the served dashboard script parses as browser JavaScript', () => {
    assert.doesNotThrow(() => new vm.Script(dashboardScript));
});

test('support links only a redeemed legacy invitation to an already verified account and audits the transition once', { skip: !DatabaseSync }, async t => {
    mockKeys(t);
    const { env, sqlite } = await db(t);
    const jwt = await token(), hash = 'd'.repeat(64);
    sqlite.prepare('INSERT INTO users (email, created_at) VALUES (?, ?)').run('recipient@example.com', 'fixture');
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at, redeemed_by, redeemed_at) VALUES (?, ?, ?, ?)')
        .run(hash, 'fixture', 'invite:legacy-fixture', 'fixture');
    const body = { hash, email: 'recipient@example.com' };
    assert.equal((await handleInvitationAdmin(request('/link-legacy', jwt, body), env)).status, 409);
    sqlite.prepare('UPDATE users SET email_verified_at = ?').run(Date.now());
    const linked = await handleInvitationAdmin(request('/link-legacy', jwt, body), env);
    assert.equal(linked.status, 200);
    assert.equal(sqlite.prepare('SELECT user_id FROM vr_invitations').get().user_id, 1);
    assert.equal((await handleInvitationAdmin(request('/link-legacy', jwt, body), env)).status, 409);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM access_audit WHERE action = 'admin_legacy_linked'").get().n, 1);
    const history = await handleInvitationAdmin(request('/recovery-data?email=recipient%40example.com', jwt), env);
    assert.equal(history.status, 200);
    assert.equal((await history.json()).audit[0].actor, ENV.INVITATION_ADMINS);
    assert.equal((await handleInvitationAdmin(request('/link-legacy', null, body), env)).status, 403);
    const secondHash = 'e'.repeat(64);
    sqlite.prepare('INSERT INTO vr_invitations (code_hash, created_at, redeemed_by, redeemed_at) VALUES (?, ?, ?, ?)')
        .run(secondHash, 'fixture', 'invite:second-legacy', 'fixture');
    sqlite.exec(`CREATE TRIGGER refuse_support_audit BEFORE INSERT ON access_audit
        WHEN NEW.action = 'admin_legacy_linked' BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END`);
    assert.equal((await handleInvitationAdmin(request('/link-legacy', jwt, { ...body, hash: secondHash }), env)).status, 503);
    assert.equal(sqlite.prepare('SELECT user_id FROM vr_invitations WHERE code_hash = ?').get(secondHash).user_id, null);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM access_audit WHERE action = 'admin_legacy_linked'").get().n, 1);
});
