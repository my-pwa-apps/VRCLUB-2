import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
    devRoomAccess, issueDevOwnerSession, devOwnerTokenHash,
    DEV_OWNER_COOKIE, DEV_OWNER_SIGN_IN, DEV_OWNER_SESSION_TTL
} from '../worker/src/devRoomAccess.js';
import development from '../worker/src/dev-index.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch (error) { if (error.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') throw error; }

function createIsolatedDevOwnerDb({ initialized = true } = {}) {
    let tableReady = initialized;
    const rows = new Map();
    return {
        rows,
        prepare(sql) {
            if (/\b(users|purchases|vr_invitations|access_sessions|access_devices|access_vr_leases)\b/i.test(sql)) {
                throw new Error('Development owner authentication must not query production entitlements or sessions');
            }
            return {
                bind(...args) {
                    return {
                        sql, args,
                        async run() {
                            if (/CREATE TABLE IF NOT EXISTS dev_owner_sessions/i.test(sql)) {
                                tableReady = true;
                                return {};
                            }
                            if (/CREATE INDEX IF NOT EXISTS dev_owner_sessions_expiry/i.test(sql)) {
                                if (!tableReady) throw new Error('no such table: dev_owner_sessions');
                                return {};
                            }
                            throw new Error(`Unexpected direct run SQL: ${sql}`);
                        },
                        async first() {
                            if (!tableReady) throw new Error('no such table: dev_owner_sessions');
                            const [tokenHash, now] = args;
                            const row = rows.get(tokenHash);
                            if (!row || row.revoked_at !== null || !(row.expires_at > now)) return null;
                            return { email: row.email };
                        }
                    };
                }
            };
        },
        async batch(statements) {
            if (!tableReady) throw new Error('no such table: dev_owner_sessions');
            for (const { sql, args } of statements) {
                if (/DELETE FROM dev_owner_sessions WHERE expires_at <= \?/i.test(sql)) {
                    for (const [key, row] of rows) if (row.expires_at <= args[0]) rows.delete(key);
                } else if (/INSERT INTO dev_owner_sessions/i.test(sql)) {
                    const [token_hash, email, created_at, expires_at] = args;
                    rows.set(token_hash, { token_hash, email, created_at, expires_at, revoked_at: null });
                } else {
                    throw new Error(`Unexpected batch SQL: ${sql}`);
                }
            }
            return [];
        }
    };
}

function makeEnv(overrides = {}) {
    return {
        DEV_ROOM_ENABLED: '1', MEDIA_TRANSPORT: 'sfu', DEV_ROOM_OWNERS: 'owner@example.com',
        DEV_OWNER_ACCESS: '1', DEV_OWNER_ORIGIN: 'https://api.mitwee.nl',
        DEV_ACCESS_TEAM_DOMAIN: 'https://dev-team.cloudflareaccess.com', DEV_ACCESS_AUD: 'owner-audience',
        ALLOWED_ORIGINS: 'https://nocturnedev.mitwee.nl,https://nocturne-dev.pages.dev',
        DB: createIsolatedDevOwnerDb(),
        ...overrides
    };
}
const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'dev-owner', alg: 'RS256', use: 'sig' };
async function token(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    const baseEnv = makeEnv();
    return new SignJWT({
        type: 'app', email: 'owner@example.com', sub: 'owner', iat: now, exp: now + 3600,
        iss: baseEnv.DEV_ACCESS_TEAM_DOMAIN, aud: [baseEnv.DEV_ACCESS_AUD], ...overrides
    }).setProtectedHeader({ alg: 'RS256', kid: 'dev-owner' }).sign(keys.privateKey);
}
function mockKeys(t, teamDomain = 'https://dev-team.cloudflareaccess.com') {
    const fetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = fetch; });
    globalThis.fetch = async url => {
        assert.equal(String(url), `${teamDomain}/cdn-cgi/access/certs`);
        return Response.json({ keys: [jwk] });
    };
}
function request(path = '/dev-owner/check', sessionCookie, headers = {}, origin = 'https://api.mitwee.nl') {
    return new Request(`${origin}${path}`, { headers: {
        Origin: 'https://nocturnedev.mitwee.nl', ...(sessionCookie ? { Cookie: `${DEV_OWNER_COOKIE}=${sessionCookie}` } : {}), ...headers
    } });
}
function parseOwnerCookie(setCookie) {
    const match = new RegExp(`^${DEV_OWNER_COOKIE}=(dvo_[a-f0-9]{64});\\s*(.+)$`).exec(setCookie || '');
    assert.ok(match, `expected persistent dvo_ cookie, got ${setCookie}`);
    return { value: match[1], attributes: match[2] };
}

test('development owner authentication verifies hashed long-lived sessions, outlives the 6h Access JWT and rejects forged credentials', async t => {
    mockKeys(t);
    const env = makeEnv();
    const issuedAt = Date.now();
    const { denied, cookie } = await issueDevOwnerSession(
        request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': await token() }),
        env,
        issuedAt
    );
    assert.equal(denied, null);
    const { value: sessionToken, attributes } = parseOwnerCookie(cookie);
    assert.equal(attributes, `Path=/dev-owner/; Secure; HttpOnly; SameSite=None; Max-Age=${DEV_OWNER_SESSION_TTL / 1000}`);
    assert.equal(env.DB.rows.has(sessionToken), false, 'raw session token must never be stored');
    const storedHash = await devOwnerTokenHash(sessionToken);
    assert.equal(env.DB.rows.has(storedHash), true);

    // Works immediately and 30 days later (long after the 1h/6h Access JWT expired), until 365 days.
    assert.equal(await devRoomAccess(request(undefined, sessionToken), env, issuedAt), null);
    assert.equal(await devRoomAccess(request(undefined, sessionToken), env, issuedAt + 30 * 86400_000), null);
    assert.equal((await devRoomAccess(request(undefined, sessionToken), env, issuedAt + DEV_OWNER_SESSION_TTL)).status, 401);

    // Allow-list removal and explicit session revocation take effect immediately on preflight and reconnect.
    assert.equal((await devRoomAccess(request(undefined, sessionToken), { ...env, DEV_ROOM_OWNERS: 'other@example.com' }, issuedAt)).status, 401);
    env.DB.rows.get(storedHash).revoked_at = issuedAt + 1000;
    assert.equal((await devRoomAccess(request(undefined, sessionToken), env, issuedAt + 2000)).status, 401);

    // Raw JWTs, headers, wrong cookies and forged tokens never authorize /dev-owner/*.
    const jwt = await token();
    assert.equal((await devRoomAccess(request(undefined, jwt), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, 'dvo_' + 'a'.repeat(64)), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, 'invalid'), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, {
        'Cf-Access-Jwt-Assertion': jwt, 'Cf-Access-Authenticated-User-Email': 'owner@example.com'
    }), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, { Cookie: `CF_Authorization=${jwt}` }), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, {
        Cookie: `${DEV_OWNER_COOKIE}=${sessionToken}; ${DEV_OWNER_COOKIE}=${sessionToken}`
    }), env)).status, 401);
    assert.equal((await devRoomAccess(new Request('https://vrclub-network-dev.garfieldapp.workers.dev/?room=private-000032',
        { headers: { Cookie: `CF_Authorization=${jwt}` } }), env)).status, 403);
    assert.equal((await devRoomAccess(request(undefined, sessionToken), { ...env, DEV_ROOM_ENABLED: '0' })).status, 503);
    assert.equal((await devRoomAccess(request(undefined, sessionToken), { ...env, DEV_ACCESS_AUD: '' })).status, 503);
});

test('protected sign-in verifies the RS256 Access assertion and sets a persistent 1-year scoped HttpOnly cookie', async t => {
    mockKeys(t);
    const env = makeEnv({ DB: createIsolatedDevOwnerDb({ initialized: false }) });
    assert.equal((await development.fetch(request(undefined, 'dvo_' + 'b'.repeat(64)), env, {})).status, 401,
        'missing dev_owner_sessions table before first sign-in cleanly asks for sign-in');
    const jwt = await token();
    const result = await development.fetch(request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': jwt }), env, {});
    assert.equal(result.status, 200);
    const { value: sessionToken, attributes } = parseOwnerCookie(result.headers.get('set-cookie'));
    assert.equal(attributes, 'Path=/dev-owner/; Secure; HttpOnly; SameSite=None; Max-Age=31536000');
    const html = await result.text();
    assert.match(html, /Return to your club tab/);
    assert.match(html, /one year across restarts/);
    assert.ok(!html.includes(jwt) && !html.includes(sessionToken), 'no credential in page content');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal((await development.fetch(request(DEV_OWNER_SIGN_IN, sessionToken), env, {})).status, 401,
        'sign-in requires verified assertion, not an existing session cookie');
    const forgedKeys = await generateKeyPair('RS256');
    const forged = await new SignJWT({
        type: 'app', email: 'owner@example.com', sub: 'owner',
        iss: env.DEV_ACCESS_TEAM_DOMAIN, aud: [env.DEV_ACCESS_AUD],
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600
    }).setProtectedHeader({ alg: 'RS256', kid: 'dev-owner' }).sign(forgedKeys.privateKey);
    for (const assertion of [
        'forged', forged, await token({ email: 'other@example.com' }), await token({ aud: ['other-audience'] }),
        await token({ iss: 'https://attacker.example' }), await token({ exp: 1 }),
        await token({ type: 'service' }), await token({ sub: undefined }), await token({ iat: undefined })
    ]) {
        const denied = await development.fetch(request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': assertion }), env, {});
        assert.equal(denied.status, 401);
        assert.equal(denied.headers.get('set-cookie'), null);
    }
    assert.equal((await development.fetch(new Request(`https://vrclub-network-dev.garfieldapp.workers.dev${DEV_OWNER_SIGN_IN}`, {
        headers: { 'Cf-Access-Jwt-Assertion': jwt }
    }), env, {})).status, 403);
    assert.equal((await development.fetch(request(`${DEV_OWNER_SIGN_IN}?return=https://attacker.example`, null,
        { 'Cf-Access-Jwt-Assertion': jwt }), env, {})).headers.get('location'), null);
});

test('development owner preflight is exact-origin, credentialed, uncached and keeps payments/admin disabled', async t => {
    mockKeys(t);
    const env = makeEnv();
    const { cookie } = await issueDevOwnerSession(
        request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': await token() }), env
    );
    const { value: sessionToken } = parseOwnerCookie(cookie);
    const result = await development.fetch(request(undefined, sessionToken), env, {});
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ready: true });
    assert.equal(result.headers.get('access-control-allow-origin'), 'https://nocturnedev.mitwee.nl');
    assert.equal(result.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal((await development.fetch(request(), env, {})).status, 401);
    assert.equal((await development.fetch(request(undefined, null, { Origin: 'https://attacker.example' }), env, {})).status, 403);
    for (const path of ['/payments/entitlement', '/admin/invitations']) {
        assert.equal((await development.fetch(request(path), env, {})).status, 404);
    }
    assert.equal((await development.fetch(request('/dev-owner/missing'), env, {})).status, 404);
    assert.equal((await development.fetch(new Request(`${env.DEV_OWNER_ORIGIN}/dev-owner/check`, {
        method: 'POST', headers: { Origin: 'https://nocturnedev.mitwee.nl' }
    }), env, {})).status, 405);
});

test('development owner socket cannot select another room and strips cookies and forged internal owner headers', async t => {
    mockKeys(t);
    const env = makeEnv();
    const { cookie } = await issueDevOwnerSession(
        request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': await token() }), env
    );
    const { value: sessionToken } = parseOwnerCookie(cookie);
    const forwarded = [];
    const roomEnv = { ...env, CLUB_ROOM: {
        idFromName(name) { assert.equal(name, 'private-000032'); return name; },
        get() { return { fetch(req) { forwarded.push(req); return Response.json({ accepted: true }); } }; }
    } };
    const req = request('/dev-owner/socket?room=lobby', sessionToken, { Upgrade: 'websocket', 'X-Nocturne-Dev-Owner': 'fake' });
    assert.equal((await development.fetch(req, roomEnv, {})).status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(new URL(forwarded[0].url).searchParams.get('room'), 'private-000032');
    assert.equal(forwarded[0].headers.get('Cookie'), null);
    assert.equal(forwarded[0].headers.get('X-Nocturne-Dev-Owner'), 'verified');
    assert.equal((await development.fetch(request('/dev-owner/socket', null, {
        Upgrade: 'websocket', 'X-Nocturne-Dev-Owner': 'verified'
    }), roomEnv, {})).status, 401);
    assert.equal(forwarded.length, 1);
});

test('real SQLite dev-migrations schema persists hashed 1-year owner sessions, prunes expired rows and honors revocation', { skip: !DatabaseSync }, async t => {
    mockKeys(t);
    const sqlite = new DatabaseSync(':memory:');
    t.after(() => sqlite.close());
    sqlite.exec(readFileSync(new URL('../worker/dev-migrations/0001_dev_owner_sessions.sql', import.meta.url), 'utf8'));
    const DB = {
        prepare(sql) {
            return {
                bind(...args) {
                    return {
                        sql, args,
                        async first() { return sqlite.prepare(sql).get(...args) || null; },
                        async run() { return sqlite.prepare(sql).run(...args); }
                    };
                }
            };
        },
        async batch(statements) {
            sqlite.exec('BEGIN');
            try {
                for (const { sql, args } of statements) sqlite.prepare(sql).run(...args);
                sqlite.exec('COMMIT');
                return [];
            } catch (error) {
                sqlite.exec('ROLLBACK');
                throw error;
            }
        }
    };
    const env = makeEnv({ DB });
    sqlite.prepare('INSERT INTO dev_owner_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .run('0'.repeat(64), 'owner@example.com', 100, 500);
    const now = 1_000_000;
    const { cookie } = await issueDevOwnerSession(
        request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': await token() }), env, now
    );
    const { value: sessionToken } = parseOwnerCookie(cookie);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM dev_owner_sessions WHERE token_hash = ?').get('0'.repeat(64)).n, 0,
        'expired sessions are pruned on sign-in');
    assert.equal(await devRoomAccess(request(undefined, sessionToken), env, now + 180 * 86400_000), null);
    sqlite.prepare('UPDATE dev_owner_sessions SET revoked_at = ? WHERE email = ?').run(now + 1000, 'owner@example.com');
    assert.equal((await devRoomAccess(request(undefined, sessionToken), env, now + 2000)).status, 401);
});

test('free development VR supports owner preflight without any payments request or credential in the socket URL', async () => {
    const calls = [];
    const window = { location: { hostname: 'nocturnedev.mitwee.nl' }, AbortSignal };
    const context = vm.createContext({ window, URL, fetch: async (url, options) => {
        calls.push({ url, options });
        return Response.json({ ready: true });
    } });
    vm.runInContext(readFileSync(new URL('../js/paymentGate.js', import.meta.url), 'utf8'), context);
    const gate = window.VRPayment;
    assert.equal(gate.canEnterVR(), true);
    assert.equal(await gate.prepareDevRoom('wss://vrclub-network-dev.garfieldapp.workers.dev'), 'wss://api.mitwee.nl/dev-owner/socket');
    assert.equal(calls[0].url, 'https://api.mitwee.nl/dev-owner/check');
    assert.equal(calls[0].options.credentials, 'include');
    await assert.rejects(gate.prepareDevRoom('wss://vrclub-network.garfieldapp.workers.dev'), /development relay/);
    context.fetch = async () => Response.json({ message: 'Owner sign-in required' }, { status: 401 });
    await assert.rejects(gate.prepareDevRoom('wss://vrclub-network-dev.garfieldapp.workers.dev'), /Owner sign-in/);
});

test('a headset already authenticated on nocturnedev or mitwee.nl works on Gashouder with zero extra steps', async t => {
    mockKeys(t);
    const env = makeEnv({
        ALLOWED_ORIGINS: 'https://nocturnedev.mitwee.nl,https://nocturne-dev.pages.dev,https://gashouder.mitwee.nl,https://gashouder-vr.pages.dev'
    });
    const { cookie } = await issueDevOwnerSession(
        request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': await token() }), env
    );
    const { value: sessionToken } = parseOwnerCookie(cookie);

    for (const origin of ['https://gashouder.mitwee.nl', 'https://gashouder-vr.pages.dev', 'https://preview.gashouder-vr.pages.dev']) {
        const check = await development.fetch(request('/dev-owner/check', sessionToken, { Origin: origin }), env, {});
        assert.equal(check.status, 200, `${origin} accepts the shared owner cookie`);
        assert.deepEqual(await check.json(), { ready: true });
        assert.equal(check.headers.get('access-control-allow-origin'), origin);
        assert.equal(check.headers.get('access-control-allow-credentials'), 'true');
    }

    // Also verify fallback to an existing mitwee.nl nocturne_vr_session owner cookie via ENTITLEMENTS_DB
    const rawVrToken = 'v2_' + 'a'.repeat(64);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawVrToken));
    const vrHash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    const envWithEntitlements = {
        ...env,
        ENTITLEMENTS_DB: {
            prepare() {
                return {
                    bind(hashArg, nowArg) {
                        return {
                            async first() {
                                return hashArg === vrHash && nowArg > 0
                                    ? { token_hash: vrHash, user_id: 1, device_id: 'dev-1', expires_at: nowArg + 86400_000, email: 'owner@example.com' }
                                    : null;
                            }
                        };
                    }
                };
            }
        }
    };
    const vrCheck = await development.fetch(new Request('https://api.mitwee.nl/dev-owner/check', {
        headers: {
            Origin: 'https://gashouder.mitwee.nl',
            Cookie: `nocturne_vr_session=${rawVrToken}`
        }
    }), envWithEntitlements, {});
    assert.equal(vrCheck.status, 200, 'existing nocturne_vr_session owner cookie authorizes seamlessly without re-signing in');
    assert.deepEqual(await vrCheck.json(), { ready: true });
});
