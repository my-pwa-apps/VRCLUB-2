import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { devRoomAccess, DEV_OWNER_COOKIE, DEV_OWNER_SIGN_IN } from '../worker/src/devRoomAccess.js';
import development from '../worker/src/dev-index.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const env = {
    DEV_ROOM_ENABLED: '1', MEDIA_TRANSPORT: 'sfu', DEV_ROOM_OWNERS: 'owner@example.com',
    DEV_OWNER_ACCESS: '1', DEV_OWNER_ORIGIN: 'https://api.mitwee.nl',
    DEV_ACCESS_TEAM_DOMAIN: 'https://dev-team.cloudflareaccess.com', DEV_ACCESS_AUD: 'owner-audience',
    ALLOWED_ORIGINS: 'https://nocturnedev.mitwee.nl,https://nocturne-dev.pages.dev',
    DB: { prepare() { throw new Error('Access owner authentication must not query production entitlements'); } }
};
const keys = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(keys.publicKey), kid: 'dev-owner', alg: 'RS256', use: 'sig' };
async function token(overrides = {}) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
        type: 'app', email: 'owner@example.com', sub: 'owner', iat: now, exp: now + 3600,
        iss: env.DEV_ACCESS_TEAM_DOMAIN, aud: [env.DEV_ACCESS_AUD], ...overrides
    }).setProtectedHeader({ alg: 'RS256', kid: 'dev-owner' }).sign(keys.privateKey);
}
function mockKeys(t) {
    const fetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = fetch; });
    globalThis.fetch = async url => {
        assert.equal(String(url), `${env.DEV_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
        return Response.json({ keys: [jwk] });
    };
}
function request(path = '/dev-owner/check', jwt, headers = {}) {
    return new Request(`${env.DEV_OWNER_ORIGIN}${path}`, { headers: {
        Origin: 'https://nocturnedev.mitwee.nl', ...(jwt ? { Cookie: `${DEV_OWNER_COOKIE}=${jwt}` } : {}), ...headers
    } });
}

test('development owner authentication verifies the signed Access cookie, not email headers or production grants', async t => {
    mockKeys(t);
    assert.equal(await devRoomAccess(request(undefined, await token()), env), null);
    for (const claims of [
        { email: 'guest@example.com' }, { aud: ['other-audience'] }, { iss: 'https://attacker.example' },
        { exp: 1 }, { type: 'service' }, { sub: undefined }, { iat: undefined }
    ]) assert.equal((await devRoomAccess(request(undefined, await token(claims)), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, 'invalid'), env)).status, 401);
    const forgedKeys = await generateKeyPair('RS256');
    const forged = await new SignJWT({
        type: 'app', email: 'owner@example.com', sub: 'owner',
        iss: env.DEV_ACCESS_TEAM_DOMAIN, aud: [env.DEV_ACCESS_AUD],
        iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600
    }).setProtectedHeader({ alg: 'RS256', kid: 'dev-owner' }).sign(forgedKeys.privateKey);
    assert.equal((await devRoomAccess(request(undefined, forged), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, {
        'Cf-Access-Jwt-Assertion': await token(), 'Cf-Access-Authenticated-User-Email': 'owner@example.com'
    }), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, { Cookie: `CF_Authorization=${await token()}` }), env)).status, 401);
    assert.equal((await devRoomAccess(request(undefined, null, {
        Cookie: `${DEV_OWNER_COOKIE}=${await token()}; ${DEV_OWNER_COOKIE}=invalid`
    }), env)).status, 401);
    assert.equal((await devRoomAccess(new Request('https://vrclub-network-dev.garfieldapp.workers.dev/?room=private-000032',
        { headers: { Cookie: `CF_Authorization=${await token()}` } }), env)).status, 403);
    assert.equal((await devRoomAccess(request(undefined, await token()), { ...env, DEV_ROOM_ENABLED: '0' })).status, 503);
    assert.equal((await devRoomAccess(request(undefined, await token()), { ...env, DEV_ACCESS_AUD: '' })).status, 503);
});

test('protected sign-in hands verified Access identity to a scoped HttpOnly cookie without relying on the Access cookie path', async t => {
    mockKeys(t);
    const jwt = await token();
    const result = await development.fetch(request(DEV_OWNER_SIGN_IN, null, { 'Cf-Access-Jwt-Assertion': jwt }), env, {});
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('set-cookie'), `${DEV_OWNER_COOKIE}=${jwt}; Path=/dev-owner/; Secure; HttpOnly; SameSite=None`);
    const html = await result.text();
    assert.match(html, /Return to your club tab/);
    assert.ok(!html.includes(jwt), 'no credential in page content');
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.match(result.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal((await development.fetch(request(DEV_OWNER_SIGN_IN, jwt), env, {})).status, 401,
        'sign-in requires verified assertion, not an old cookie');
    for (const assertion of ['forged', await token({ email: 'other@example.com' }), await token({ exp: 1 })]) {
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
    const result = await development.fetch(request(undefined, await token()), env, {});
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
    const forwarded = [];
    const roomEnv = { ...env, CLUB_ROOM: {
        idFromName(name) { assert.equal(name, 'private-000032'); return name; },
        get() { return { fetch(req) { forwarded.push(req); return Response.json({ accepted: true }); } }; }
    } };
    const jwt = await token();
    const req = request('/dev-owner/socket?room=lobby', jwt, { Upgrade: 'websocket', 'X-Nocturne-Dev-Owner': 'fake' });
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

test('production frontend does not install the free development VR gate or development owner socket', () => {
    const source = readFileSync(new URL('../js/paymentGate.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /Development site: VR access is free|dev-owner\/socket/);
    assert.match(source, /post\('\/dev-room'/);
});
