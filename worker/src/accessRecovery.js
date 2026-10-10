const COOKIE = 'nocturne_vr_session';
const CODE_TTL = 10 * 60 * 1000;
const SESSION_TTL = 365 * 24 * 60 * 60 * 1000;
const LEASE_TTL = 90 * 1000;

async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
    return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function codeHash(id, code, secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`nocturne-recovery-v1:${id}:${code}`));
    return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function accessSession(request, env) {
    const token = /(?:^|;\s*)nocturne_vr_session=(v2_[a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
    if (!token || !env.DB) return null;
    return env.DB.prepare(`
        SELECT s.token_hash, s.user_id, s.device_id, s.expires_at, u.email
        FROM access_sessions s JOIN users u ON u.id = s.user_id
        LEFT JOIN access_devices d ON d.id = s.device_id
        WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
          AND (s.device_id IS NULL OR (d.revoked_at IS NULL AND d.id IS NOT NULL))
    `).bind(await hash(token), Date.now()).first();
}

export async function accountEntitled(env, userId) {
    const row = await env.DB.prepare(`
        SELECT 1 FROM purchases WHERE user_id = ? AND status = 'paid' AND livemode = ?
        UNION ALL SELECT 1 FROM vr_invitations WHERE user_id = ? AND revoked_at IS NULL LIMIT 1
    `).bind(userId, env.STRIPE_MODE === 'live' ? 1 : 0, userId).first();
    return !!row;
}

async function devices(env, session) {
    const rows = await env.DB.prepare(`
        SELECT id, name, created_at FROM access_devices
        WHERE user_id = ? AND revoked_at IS NULL ORDER BY slot
    `).bind(session.user_id).all();
    return rows.results.map(row => ({ ...row, current: row.id === session.device_id }));
}

export async function accessInfo(env, session) {
    return {
        verified: true, email: session.email,
        entitled: await accountEntitled(env, session.user_id),
        configured: true, deviceRegistered: !!session.device_id,
        sessionExpiresAt: session.expires_at,
        devices: await devices(env, session)
    };
}

function cookie(token, ttl = CODE_TTL) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}`;
}

export async function limit(env, key, max, span) {
    const now = Date.now();
    const window = Math.floor(now / span);
    const row = await env.DB.prepare(`
        INSERT INTO access_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ?
        RETURNING count
    `).bind(`${key}:${window}`, (window + 1) * span, max).first();
    return !!row;
}

export function generateNumericCode() {
    // Reject the tail of uint32 so each eight-digit value is equally likely.
    let number;
    do { number = crypto.getRandomValues(new Uint32Array(1))[0]; } while (number >= 4200000000);
    return String(number % 100000000).padStart(8, '0');
}

function deviceName(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 60 &&
        !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

// The caller enforces app origin and parses bounded JSON. All state is in D1, not Worker memory.
export async function handleRecovery(request, env, headers, helpers) {
    const path = new URL(request.url).pathname;
    if (!/^\/payments\/(?:recovery\/|devices(?:\/|$)|vr\/)/.test(path)) return null;
    const { json, readBody, normalizeEmail, legacyAccess } = helpers;
    const respond = (body, status = 200, extra = {}) => json(body, status, { ...headers, ...extra });
    if (!env.DB || !env.SESSION_SECRET) return respond({ message: 'Access recovery is not configured.' }, 503);
    if (!['GET', 'POST'].includes(request.method)) return respond({ message: 'Method not allowed.' }, 405);
    try {
        const session = await accessSession(request, env);
        if (request.method === 'GET' && path === '/payments/devices') {
            return session ? respond(await accessInfo(env, session)) : respond({ message: 'Verify your email first.' }, 401);
        }
        if (request.method !== 'POST') return respond({ message: 'Access route not found.' }, 404);
        const body = await readBody(request);
        if (!body || typeof body !== 'object') return respond({ message: 'Invalid request.' }, 400);
        const ip = await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
        if (path === '/payments/recovery/start') {
            if (!env.EMAIL || !env.RECOVERY_FROM) return respond({ message: 'Recovery email delivery is unavailable. Contact support.' }, 503);
            const email = normalizeEmail(body.email);
            if (!email || !['restore', 'bind'].includes(body.intent)) return respond({ message: 'Enter your email and choose restore or link access.' }, 400);
            const allowed = await limit(env, 'email:' + await hash(email), 5, 3600000) &&
                await limit(env, 'ip:' + ip, 20, 3600000) && await limit(env, 'all-emails', 500, 3600000);
            if (!allowed) return respond({ message: 'Too many verification emails. Please try again later.' }, 429);
            let legacy = null;
            if (body.intent === 'bind') {
                legacy = await legacyAccess(request, env);
                if (!legacy) return respond({ message: 'Your old access cookie is missing or invalid. Use restore access or contact support.' }, 403);
                if (legacy.email && legacy.email !== email) return respond({ message: 'Use the email from your purchase receipt.' }, 403);
            }
            const id = crypto.randomUUID();
            const code = generateNumericCode();
            const now = Date.now();
            await env.DB.batch([
                env.DB.prepare('DELETE FROM access_challenges WHERE expires_at < ?').bind(now - 86400000),
                env.DB.prepare('DELETE FROM access_rate_limits WHERE expires_at < ?').bind(now - 86400000),
                env.DB.prepare('DELETE FROM access_sessions WHERE expires_at < ?').bind(now - 86400000),
                env.DB.prepare(`INSERT INTO access_challenges (id, email, code_hash, legacy_subject, expires_at)
                    VALUES (?, ?, ?, ?, ?)`).bind(id, email, await codeHash(id, code, env.SESSION_SECRET), legacy?.subject || null, now + CODE_TTL)
            ]);
            try {
                const delivery = await env.EMAIL.send({
                    to: email, from: { email: env.RECOVERY_FROM, name: 'NOCTURNE' },
                    subject: 'Your NOCTURNE access verification code',
                    text: `Your NOCTURNE verification code is ${code}.\nIt expires in 10 minutes and works once. Enter it only at ${env.APP_ORIGIN}.\nNever give this code to another person. If you did not request it, ignore this email.\nVerifying email does not create a purchase or guarantee VR access.`,
                    html: `<p>Your NOCTURNE verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes and works once. Enter it only on the NOCTURNE website. Never give this code to another person.</p><p>If you did not request it, ignore this email. Verifying email does not create a purchase or guarantee VR access.</p>`
                });
                if (!delivery?.messageId) throw new Error('Email delivery was not accepted');
            } catch (error) {
                await env.DB.prepare('DELETE FROM access_challenges WHERE id = ?').bind(id).run();
                console.error('[Access] Email delivery failed', { name: error.name, code: error.code });
                return respond({ message: 'Could not send the verification email. Please retry or contact support.' }, 503);
            }
            return respond({ challenge: id, message: 'Check your email for an eight-digit verification code. Access will be checked after verification.' });
        }
        if (path === '/payments/recovery/verify') {
            if (typeof body.challenge !== 'string' || !/^[a-f0-9-]{36}$/.test(body.challenge) ||
                typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) return respond({ message: 'Enter the eight-digit email code.' }, 400);
            if (!await limit(env, 'verify:' + ip, 50, 3600000)) return respond({ message: 'Too many verification attempts. Please try later.' }, 429);
            const now = Date.now();
            const challenge = await env.DB.prepare(`
                UPDATE access_challenges SET attempts = attempts + 1
                WHERE id = ? AND expires_at > ? AND attempts < 5 AND consumed_session IS NULL
                RETURNING email, code_hash, legacy_subject
            `).bind(body.challenge, now).first();
            if (!challenge || challenge.code_hash !== await codeHash(body.challenge, body.code, env.SESSION_SECRET)) {
                return respond({ message: 'The code is invalid, expired or used. Request another email if needed.' }, 400);
            }
            let legacy = null;
            if (challenge.legacy_subject) {
                legacy = await legacyAccess(request, env);
                if (!legacy || legacy.subject !== challenge.legacy_subject ||
                    (legacy.email && legacy.email !== challenge.email)) {
                    return respond({ message: 'The old access is no longer valid. Contact support.' }, 403);
                }
            }
            await env.DB.prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)')
                .bind(challenge.email, new Date(now).toISOString()).run();
            const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(challenge.email).first();
            const token = 'v2_' + randomToken(), tokenHash = await hash(token);
            const statements = [
                env.DB.prepare(`UPDATE access_challenges SET consumed_session = ?
                    WHERE id = ? AND consumed_session IS NULL AND expires_at > ? RETURNING id`).bind(tokenHash, body.challenge, now),
                env.DB.prepare(`INSERT INTO access_sessions (token_hash, user_id, expires_at)
                    SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM access_challenges WHERE id = ? AND consumed_session = ?)`)
                    .bind(tokenHash, user.id, now + CODE_TTL, body.challenge, tokenHash)
            ];
            statements.push(env.DB.prepare(`UPDATE users SET email_verified_at = ?
                WHERE id = ? AND EXISTS (SELECT 1 FROM access_challenges WHERE id = ? AND consumed_session = ?)`)
                .bind(now, user.id, body.challenge, tokenHash));
            if (legacy?.subject.startsWith('invite:')) {
                statements.push(env.DB.prepare(`UPDATE vr_invitations SET user_id = ?
                    WHERE redeemed_by = ? AND user_id IS NULL AND revoked_at IS NULL
                      AND EXISTS (SELECT 1 FROM access_challenges WHERE id = ? AND consumed_session = ?)`)
                    .bind(user.id, legacy.subject, body.challenge, tokenHash));
            }
            statements.push(env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, created_at)
                SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM access_challenges WHERE id = ? AND consumed_session = ?)`)
                .bind(user.id, legacy ? 'legacy_linked' : 'email_verified', challenge.email, now, body.challenge, tokenHash));
            const results = await env.DB.batch(statements);
            if (!results[0].results.length) return respond({ message: 'This code was already used. Request a new one.' }, 409);
            const verified = { user_id: user.id, email: challenge.email, device_id: null, expires_at: now + CODE_TTL };
            return respond(await accessInfo(env, verified), 200, { 'set-cookie': cookie(token) });
        }
        if (!session) return respond({ message: 'Verify your email first.', error: 'verification_required' }, 401);
        if (path === '/payments/devices/register') {
            const name = deviceName(body.name);
            if (!name || (body.replaceDevice !== undefined && typeof body.replaceDevice !== 'string')) {
                return respond({ message: 'Give this device a name (1–60 characters).' }, 400);
            }
            if (session.device_id) return respond({ ...await accessInfo(env, session), registered: true });
            const current = await devices(env, session);
            if (body.replaceDevice && !current.some(device => device.id === body.replaceDevice)) return respond({ message: 'That device is no longer registered.' }, 409);
            if (current.length >= 2 && !body.replaceDevice) return respond({
                error: 'device_limit', message: 'Two devices are already registered. Choose one to replace; its access will be revoked.', devices: current
            }, 409);
            const now = Date.now(), id = crypto.randomUUID();
            const pending = 'EXISTS (SELECT 1 FROM access_sessions WHERE token_hash = ? AND device_id IS NULL AND revoked_at IS NULL AND expires_at > ?)';
            const statements = [];
            if (body.replaceDevice) {
                statements.push(env.DB.prepare(`UPDATE access_sessions SET revoked_at = ?
                    WHERE device_id = ? AND user_id = ? AND ${pending}`).bind(now, body.replaceDevice, session.user_id, session.token_hash, now));
                statements.push(env.DB.prepare(`DELETE FROM access_vr_leases WHERE user_id = ? AND token_hash IN
                    (SELECT token_hash FROM access_sessions WHERE device_id = ?) AND ${pending}`)
                    .bind(session.user_id, body.replaceDevice, session.token_hash, now));
                statements.push(env.DB.prepare(`UPDATE access_devices SET revoked_at = ?
                    WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND ${pending}`)
                    .bind(now, body.replaceDevice, session.user_id, session.token_hash, now));
            }
            statements.push(env.DB.prepare(`
                INSERT INTO access_devices (id, user_id, slot, name, created_at)
                SELECT ?, ?, slot, ?, ? FROM (SELECT 1 AS slot UNION ALL SELECT 2) AS slot_candidate
                WHERE NOT EXISTS (SELECT 1 FROM access_devices WHERE user_id = ? AND slot = slot_candidate.slot AND revoked_at IS NULL)
                  AND ${pending} LIMIT 1
            `)
                .bind(id, session.user_id, name, now, session.user_id, session.token_hash, now));
            statements.push(env.DB.prepare(`UPDATE access_sessions SET device_id = ?, expires_at = ?
                WHERE token_hash = ? AND device_id IS NULL AND revoked_at IS NULL AND expires_at > ?
                  AND EXISTS (SELECT 1 FROM access_devices WHERE id = ?) RETURNING token_hash`)
                .bind(id, now + SESSION_TTL, session.token_hash, now, id));
            statements.push(env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, device_id, created_at)
                SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM access_devices WHERE id = ?)`)
                .bind(session.user_id, body.replaceDevice ? 'device_replaced' : 'device_registered', session.email, id, now, id));
            const results = await env.DB.batch(statements);
            if (!results.at(-2).results.length) return respond({ message: 'Registration changed in another request. Refresh your device list.', error: 'device_limit', devices: await devices(env, session) }, 409);
            const token = /(?:^|;\s*)nocturne_vr_session=(v2_[a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie'))[1];
            return respond({ ...await accessInfo(env, { ...session, device_id: id, expires_at: now + SESSION_TTL }), registered: true },
                200, { 'set-cookie': cookie(token, SESSION_TTL) });
        }
        if (path === '/payments/devices/remove') {
            if (typeof body.id !== 'string') return respond({ message: 'Choose a device.' }, 400);
            const now = Date.now();
            const results = await env.DB.batch([
                env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, device_id, created_at)
                    SELECT ?, 'device_removed', ?, id, ? FROM access_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL`)
                    .bind(session.user_id, session.email, now, body.id, session.user_id),
                env.DB.prepare('UPDATE access_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL RETURNING id')
                    .bind(now, body.id, session.user_id),
                env.DB.prepare('UPDATE access_sessions SET revoked_at = ? WHERE device_id = ? AND user_id = ?')
                    .bind(now, body.id, session.user_id),
                env.DB.prepare(`DELETE FROM access_vr_leases WHERE user_id = ? AND token_hash IN
                    (SELECT token_hash FROM access_sessions WHERE device_id = ?)`).bind(session.user_id, body.id)
            ]);
            if (!results[1].results.length) return respond({ message: 'Device not found.' }, 404);
            return respond({ removed: true, devices: await devices(env, session), currentRemoved: body.id === session.device_id });
        }
        if (path.startsWith('/payments/vr/')) {
            if (typeof body.tab !== 'string' || !/^[a-f0-9-]{36}$/.test(body.tab)) return respond({ message: 'Invalid VR session identifier.' }, 400);
            if (path === '/payments/vr/release') {
                await env.DB.prepare('DELETE FROM access_vr_leases WHERE user_id = ? AND token_hash = ? AND tab = ?')
                    .bind(session.user_id, session.token_hash, body.tab).run();
                return respond({ released: true });
            }
            if (!session.device_id || !await accountEntitled(env, session.user_id)) return respond({ message: 'VR access is unavailable or revoked. Verify your access and device.', error: 'access_revoked' }, 403);
            const now = Date.now();
            let row;
            if (path === '/payments/vr/acquire') {
                row = await env.DB.prepare(`
                    INSERT INTO access_vr_leases (user_id, token_hash, tab, expires_at) VALUES (?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, tab = excluded.tab, expires_at = excluded.expires_at
                    WHERE expires_at <= ? OR (token_hash = excluded.token_hash AND tab = excluded.tab)
                    RETURNING expires_at
                `).bind(session.user_id, session.token_hash, body.tab, now + LEASE_TTL, now).first();
            } else if (path === '/payments/vr/renew') {
                row = await env.DB.prepare(`UPDATE access_vr_leases SET expires_at = ?
                    WHERE user_id = ? AND token_hash = ? AND tab = ? AND expires_at > ? RETURNING expires_at`)
                    .bind(now + LEASE_TTL, session.user_id, session.token_hash, body.tab, now).first();
            } else return respond({ message: 'VR route not found.' }, 404);
            if (!row) return respond({ message: 'VR is already active on another device or tab. Exit VR there, or wait up to 90 seconds after it disconnects.', error: 'vr_in_use' }, 409);
            return respond({ active: true, expiresAt: row.expires_at, expiresInMs: Math.max(0, row.expires_at - Date.now()) });
        }
        return respond({ message: 'Access route not found.' }, 404);
    } catch (error) {
        console.error('[Access] Request failed', { name: error.name });
        return respond({ message: 'Access service is unavailable. Please retry or contact support.' }, 503);
    }
}
