// Headset pairing. A headset has no keyboard, so it cannot verify an email or take a payment. Instead it asks for a short
// code (start), the owner enters that code on a phone where they are verified and entitled (approve), and the headset
// then collects its own registered-device session (poll). The shape is OAuth's device authorization grant.
//
//   POST /payments/link/start    headset, anonymous      -> { linkId, secret, code, expiresInSeconds, intervalSeconds }
//   POST /payments/link/approve  phone, verified session -> { linked, devices }     (registers the headset as a device)
//   POST /payments/link/poll     headset, with its secret -> { status: 'pending' | 'approved' + access info + cookie }
//
// Only hashes of the code and the secret are stored. Approval is the one trust decision: whoever approves hands their
// account's access to the device that holds the code, which is why the phone page makes the owner confirm it and why the
// attempt limits below are tight.
import {
    accessInfo, accessSession, accountEntitled, deviceName, generateNumericCode, hash, limit, listDevices, randomToken,
    sessionCookieHeader, SESSION_TTL
} from './accessRecovery.js';

export const LINK_TTL = 10 * 60 * 1000;
export const LINK_POLL_SECONDS = 3;

async function codeHash(code, secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`nocturne-link-v1:${code}`));
    return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function handleDeviceLink(request, env, headers, helpers) {
    const path = new URL(request.url).pathname;
    if (!/^\/payments\/link\/(?:start|approve|poll)$/.test(path)) return null;
    const { json, readBody } = helpers;
    const respond = (body, status = 200, extra = {}) => json(body, status, { ...headers, ...extra });
    if (request.method !== 'POST') return respond({ message: 'Method not allowed.' }, 405);
    if (!env.DB || !env.SESSION_SECRET || env.ACCESS_RECOVERY_ENABLED !== '1') {
        return respond({ error: 'link_unavailable', message: 'Headset pairing is not configured.' }, 503);
    }
    try {
        const body = await readBody(request);
        if (!body || typeof body !== 'object') return respond({ message: 'Invalid request.' }, 400);
        const ip = await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
        const now = Date.now();

        if (path === '/payments/link/start') {
            if (!await limit(env, 'link-start-ip:' + ip, 10, 600000) || !await limit(env, 'link-start-all', 300, 3600000)) {
                return respond({ error: 'link_rate_limit', message: 'Too many pairing codes. Please wait a few minutes.' }, 429, { 'retry-after': '600' });
            }
            const id = crypto.randomUUID(), secret = randomToken();
            for (let attempt = 0; attempt < 5; attempt++) {
                const code = generateNumericCode();
                try {
                    await env.DB.batch([
                        env.DB.prepare('DELETE FROM access_device_links WHERE expires_at < ?').bind(now - 86400000),
                        env.DB.prepare(`INSERT INTO access_device_links (id, code_hash, secret_hash, created_at, expires_at)
                            VALUES (?, ?, ?, ?, ?)`).bind(id, await codeHash(code, env.SESSION_SECRET), await hash(secret), now, now + LINK_TTL)
                    ]);
                    return respond({ linkId: id, secret, code, expiresInSeconds: LINK_TTL / 1000, intervalSeconds: LINK_POLL_SECONDS });
                } catch (error) {
                    // A collision with another live code is the only expected failure: draw again.
                    if (!/UNIQUE|constraint/i.test(String(error && error.message))) throw error;
                }
            }
            return respond({ error: 'link_unavailable', message: 'Could not create a pairing code. Please retry.' }, 503);
        }

        if (path === '/payments/link/approve') {
            const session = await accessSession(request, env);
            if (!session) return respond({ error: 'verification_required', message: 'Verify your email first.' }, 401);
            if (typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) return respond({ message: 'Enter the eight-digit code shown in your headset.' }, 400);
            const name = deviceName(body.name);
            if (!name || (body.replaceDevice !== undefined && typeof body.replaceDevice !== 'string')) {
                return respond({ message: 'Give the headset a name (1–60 characters).' }, 400);
            }
            if (!await limit(env, 'link-approve-ip:' + ip, 30, 600000) ||
                !await limit(env, `link-approve-user:${session.user_id}`, 10, 600000)) {
                return respond({ error: 'link_rate_limit', message: 'Too many attempts. Please wait 10 minutes and try again.' }, 429, { 'retry-after': '600' });
            }
            if (!await accountEntitled(env, session.user_id)) {
                return respond({ error: 'not_entitled', message: 'This account does not have VR access yet. Redeem an invitation or buy access first.' }, 403);
            }
            const link = await env.DB.prepare(`SELECT id FROM access_device_links
                WHERE code_hash = ? AND status = 'pending' AND expires_at > ?`)
                .bind(await codeHash(body.code, env.SESSION_SECRET), now).first();
            if (!link) return respond({ error: 'link_not_found', message: 'That code is not valid any more. Ask the headset for a new one.' }, 404);

            const current = await listDevices(env, session);
            if (body.replaceDevice && !current.some(device => device.id === body.replaceDevice)) {
                return respond({ message: 'That device is no longer registered.' }, 409);
            }
            if (current.length >= 2 && !body.replaceDevice) {
                return respond({ error: 'device_limit', message: 'Two devices are already registered. Choose one to replace; its access will be revoked.', devices: current }, 409);
            }
            const deviceId = crypto.randomUUID();
            const pending = `EXISTS (SELECT 1 FROM access_device_links WHERE id = ? AND status = 'pending' AND expires_at > ?)`;
            const statements = [];
            if (body.replaceDevice) {
                statements.push(
                    env.DB.prepare(`UPDATE access_sessions SET revoked_at = ? WHERE device_id = ? AND user_id = ? AND ${pending}`)
                        .bind(now, body.replaceDevice, session.user_id, link.id, now),
                    env.DB.prepare(`DELETE FROM access_vr_leases WHERE user_id = ? AND token_hash IN
                        (SELECT token_hash FROM access_sessions WHERE device_id = ?) AND ${pending}`)
                        .bind(session.user_id, body.replaceDevice, link.id, now),
                    env.DB.prepare(`UPDATE access_devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND ${pending}`)
                        .bind(now, body.replaceDevice, session.user_id, link.id, now)
                );
            }
            statements.push(
                env.DB.prepare(`INSERT INTO access_devices (id, user_id, slot, name, created_at)
                    SELECT ?, ?, slot, ?, ? FROM (SELECT 1 AS slot UNION ALL SELECT 2) AS slot_candidate
                    WHERE NOT EXISTS (SELECT 1 FROM access_devices WHERE user_id = ? AND slot = slot_candidate.slot AND revoked_at IS NULL)
                      AND ${pending} LIMIT 1`)
                    .bind(deviceId, session.user_id, name, now, session.user_id, link.id, now),
                env.DB.prepare(`UPDATE access_device_links SET status = 'approved', user_id = ?, device_id = ?
                    WHERE id = ? AND status = 'pending' AND expires_at > ?
                      AND EXISTS (SELECT 1 FROM access_devices WHERE id = ?) RETURNING id`)
                    .bind(session.user_id, deviceId, link.id, now, deviceId),
                env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, device_id, created_at)
                    SELECT ?, 'device_linked', ?, ?, ? WHERE EXISTS (SELECT 1 FROM access_device_links WHERE id = ? AND device_id = ?)`)
                    .bind(session.user_id, session.email, deviceId, now, link.id, deviceId)
            );
            const results = await env.DB.batch(statements);
            if (!results.at(-2).results.length) {
                return respond({ error: 'device_limit', message: 'Registration changed in another request. Refresh and try again.', devices: await listDevices(env, session) }, 409);
            }
            return respond({ linked: true, email: session.email, devices: await listDevices(env, session) });
        }

        // poll
        if (typeof body.linkId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.linkId) ||
            typeof body.secret !== 'string' || !/^[a-f0-9]{64}$/.test(body.secret)) {
            return respond({ message: 'Invalid pairing request.' }, 400);
        }
        if (!await limit(env, 'link-poll-ip:' + ip, 400, 600000)) {
            return respond({ error: 'link_rate_limit', message: 'Polling too often.' }, 429, { 'retry-after': '30' });
        }
        const row = await env.DB.prepare(`SELECT status, user_id, device_id, expires_at, secret_hash FROM access_device_links WHERE id = ?`)
            .bind(body.linkId).first();
        if (!row || row.secret_hash !== await hash(body.secret)) return respond({ status: 'unknown', message: 'This pairing code is not valid.' }, 404);
        if (row.status === 'consumed') return respond({ status: 'used', message: 'This pairing code was already used.' }, 410);
        if (row.expires_at <= now) return respond({ status: 'expired', message: 'The pairing code expired. Ask for a new one.' }, 410);
        if (row.status === 'pending') return respond({ status: 'pending' });

        const token = 'v2_' + randomToken(), tokenHash = await hash(token), expiresAt = now + SESSION_TTL;
        const results = await env.DB.batch([
            env.DB.prepare(`UPDATE access_device_links SET status = 'consumed', session_hash = ?
                WHERE id = ? AND status = 'approved' AND expires_at > ? RETURNING id`).bind(tokenHash, body.linkId, now),
            // Only the poll whose hash won the update above may create the session: a concurrent poll finds a different hash.
            env.DB.prepare(`INSERT INTO access_sessions (token_hash, user_id, device_id, expires_at)
                SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM access_device_links WHERE id = ? AND session_hash = ?)
                  AND EXISTS (SELECT 1 FROM access_devices WHERE id = ? AND user_id = ? AND revoked_at IS NULL)`)
                .bind(tokenHash, row.user_id, row.device_id, expiresAt, body.linkId, tokenHash, row.device_id, row.user_id),
            env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, device_id, created_at)
                SELECT ?, 'device_session_created', 'headset', ?, ? WHERE EXISTS (SELECT 1 FROM access_sessions WHERE token_hash = ?)`)
                .bind(row.user_id, row.device_id, now, tokenHash)
        ]);
        if (!results[0].results.length) return respond({ status: 'used', message: 'This pairing code was already used.' }, 410);
        const user = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(row.user_id).first();
        const verified = { user_id: row.user_id, email: user && user.email, device_id: row.device_id, expires_at: expiresAt };
        return respond({ status: 'approved', ...await accessInfo(env, verified), recoveryRequired: false },
            200, { 'set-cookie': sessionCookieHeader(token, SESSION_TTL) });
    } catch (error) {
        console.error('[Access] Device link failed', { name: error.name });
        return respond({ message: 'Pairing is unavailable. Please retry.' }, 503);
    }
}
