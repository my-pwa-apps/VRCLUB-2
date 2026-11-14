import { accessSession } from './accessRecovery.js';
import { verifyAdmin } from './invitationAdmin.js';

export const DEV_ROOM = 'private-000032';
export const DEV_OWNER_HEADER = 'X-Nocturne-Dev-Owner';
export const DEV_OWNER_COOKIE = '__Secure-NocturneDevOwner';
export const DEV_OWNER_SIGN_IN = '/admin/dev-owner/sign-in';
export const DEV_OWNER_SESSION_TTL = 365 * 24 * 60 * 60 * 1000;

const DEV_OWNER_TOKEN = /^dvo_[a-f0-9]{64}$/;
const SIGN_IN_MESSAGE = 'Sign in as the development owner using Owner sign-in, then return here and join room 000032 again.';
const DEV_OWNER_SCHEMA = [
    `CREATE TABLE IF NOT EXISTS dev_owner_sessions (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER
    )`,
    'CREATE INDEX IF NOT EXISTS dev_owner_sessions_expiry ON dev_owner_sessions(expires_at)'
];

export async function devOwnerTokenHash(token) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nocturne-dev-owner-v1:${token}`));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomDevOwnerToken() {
    return 'dvo_' + [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function devOwnerCookieHeader(token, ttlMs = DEV_OWNER_SESSION_TTL) {
    return `${DEV_OWNER_COOKIE}=${token}; Path=/dev-owner/; Secure; HttpOnly; SameSite=None; Max-Age=${Math.floor(ttlMs / 1000)}`;
}

function devOwnerConfigError(request, env, owners) {
    if (env.DEV_ROOM_ENABLED !== '1' || !env.DB || !owners.length || env.MEDIA_TRANSPORT !== 'sfu') {
        return { status: 503, error: 'dev_room_disabled', message: 'The developer room is not enabled on this relay.' };
    }
    if (env.DEV_OWNER_ACCESS === '1') {
        if (!env.DEV_OWNER_ORIGIN || !env.DEV_ACCESS_TEAM_DOMAIN || !env.DEV_ACCESS_AUD) {
            return { status: 503, error: 'dev_room_owner_config', message: 'Development owner verification is not configured.' };
        }
        const url = new URL(request.url);
        if (url.origin !== env.DEV_OWNER_ORIGIN || ![DEV_OWNER_SIGN_IN, '/dev-owner/check', '/dev-owner/socket'].includes(url.pathname)) {
            return { status: 403, error: 'dev_room_owner_origin', message: 'Use the development owner connection to join room 000032.' };
        }
    }
    return null;
}

async function verifyDevOwnerAssertion(request, env) {
    const headers = new Headers();
    const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
    if (assertion && assertion.length <= 3800) headers.set('Cf-Access-Jwt-Assertion', assertion);
    return verifyAdmin(new Request(request.url, { headers }), {
        ACCESS_TEAM_DOMAIN: env.DEV_ACCESS_TEAM_DOMAIN,
        ACCESS_AUD: env.DEV_ACCESS_AUD,
        INVITATION_ADMINS: env.DEV_ROOM_OWNERS
    });
}

export async function issueDevOwnerSession(request, env, now = Date.now()) {
    const owners = (env.DEV_ROOM_OWNERS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    const configError = devOwnerConfigError(request, env, owners);
    if (configError) return { denied: configError };
    if (env.DEV_OWNER_ACCESS !== '1' || new URL(request.url).pathname !== DEV_OWNER_SIGN_IN) {
        return { denied: { status: 403, error: 'dev_room_owner_origin', message: 'Use the development owner connection to join room 000032.' } };
    }
    const owner = await verifyDevOwnerAssertion(request, env);
    if (!owner) return { denied: { status: 401, error: 'dev_room_sign_in', message: SIGN_IN_MESSAGE } };
    const token = randomDevOwnerToken();
    const tokenHash = await devOwnerTokenHash(token);
    const expiresAt = now + DEV_OWNER_SESSION_TTL;
    const writeSession = () => env.DB.batch([
        env.DB.prepare('DELETE FROM dev_owner_sessions WHERE expires_at <= ?').bind(now),
        env.DB.prepare('INSERT INTO dev_owner_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)')
            .bind(tokenHash, owner, now, expiresAt)
    ]);
    try {
        await writeSession();
    } catch (error) {
        if (!/no such table:\s*dev_owner_sessions/i.test(String(error?.message || ''))) throw error;
        for (const ddl of DEV_OWNER_SCHEMA) await env.DB.prepare(ddl).bind().run();
        await writeSession();
    }
    return { denied: null, cookie: devOwnerCookieHeader(token), email: owner, expiresAt };
}

export async function devRoomAccess(request, env, now = Date.now()) {
    const owners = (env.DEV_ROOM_OWNERS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
    const configError = devOwnerConfigError(request, env, owners);
    if (configError) return configError;
    if (env.DEV_OWNER_ACCESS === '1') {
        const url = new URL(request.url);
        if (url.pathname === DEV_OWNER_SIGN_IN) {
            const owner = await verifyDevOwnerAssertion(request, env);
            return owner ? null : { status: 401, error: 'dev_room_sign_in', message: SIGN_IN_MESSAGE };
        }
        const cookies = (request.headers.get('Cookie') || '').split(';').map(value => value.trim());
        const ownerCookies = cookies.filter(value => value.startsWith(`${DEV_OWNER_COOKIE}=`));
        const token = ownerCookies.length === 1 ? ownerCookies[0].slice(DEV_OWNER_COOKIE.length + 1) : null;
        if (token && DEV_OWNER_TOKEN.test(token)) {
            let session = null;
            try {
                session = await env.DB.prepare(`
                    SELECT email FROM dev_owner_sessions
                    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
                `).bind(await devOwnerTokenHash(token), now).first();
            } catch (error) {
                if (!/no such table:\s*dev_owner_sessions/i.test(String(error?.message || ''))) throw error;
            }
            const email = typeof session?.email === 'string' ? session.email.trim().toLowerCase() : '';
            if (email && owners.includes(email)) return null;
        }
        // Also accept a verified first-party mitwee.nl owner session (`nocturne_vr_session`) if present on the same headset
        if (env.ENTITLEMENTS_DB) {
            const existing = await accessSession(request, { DB: env.ENTITLEMENTS_DB });
            const existingEmail = typeof existing?.email === 'string' ? existing.email.trim().toLowerCase() : '';
            if (existingEmail && owners.includes(existingEmail)) return null;
        }
        return { status: 401, error: 'dev_room_sign_in', message: SIGN_IN_MESSAGE };
    }
    const session = await accessSession(request, env);
    if (!session) {
        return { status: 401, error: 'dev_room_sign_in', message: 'Verify the owner account through Access on this device before joining DEV room 000032.' };
    }
    if (!owners.includes(session.email.toLowerCase())) {
        return { status: 403, error: 'dev_room_owner_only', message: 'DEV room 000032 is restricted to verified owner accounts.' };
    }
    return null;
}
