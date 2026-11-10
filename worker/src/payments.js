import { accessSession, accessInfo, accountEntitled, handleRecovery, limit } from './accessRecovery.js';
export { generateNumericCode as generateInvitationCode } from './accessRecovery.js';

const SESSION_COOKIE = 'nocturne_vr_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;
const CHECKOUT_LIMIT_MS = 10_000;

function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
    });
}

function corsHeaders(origin, allowedOrigin) {
    return origin && origin === allowedOrigin
        ? { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'Origin' }
        : {};
}

function normalizeEmail(value) {
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

export function normalizeInvitationCode(value) {
    if (typeof value !== 'string' || value.length > 64) return null;
    const code = value.replace(/[\s-]/g, '').toUpperCase();
    return /^(?:[0-9]{8}|[A-F0-9]{32})$/.test(code) ? code : null;
}

export async function invitationCodeHash(code) {
    const digest = await crypto.subtle.digest('SHA-256', utf8(`nocturne-vr-invite-v1:${code}`));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function readInvitationBody(request) {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let text = '', length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > 1024) { await reader.cancel(); return null; }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } finally {
        reader.releaseLock();
    }
    try { return JSON.parse(text); } catch { return null; }
}

function parseCookies(request) {
    const cookies = {};
    for (const part of (request.headers.get('Cookie') || '').split(';')) {
        const index = part.indexOf('=');
        if (index < 0) continue;
        const value = part.slice(index + 1).trim();
        try {
            cookies[part.slice(0, index).trim()] = decodeURIComponent(value);
        } catch {
            cookies[part.slice(0, index).trim()] = value;
        }
    }
    return cookies;
}

function base64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8(value) {
    return new TextEncoder().encode(value);
}

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
}

async function hmac(secret, value) {
    const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(value)));
}

async function signSession(userId, expiresAt, secret) {
    const payload = `${userId}.${expiresAt}`;
    return `${base64Url(utf8(payload))}.${base64Url(await hmac(secret, payload))}`;
}

async function verifySession(token, secret) {
    if (!token || !secret) return null;
    const [encoded, encodedSignature] = token.split('.');
    if (!encoded || !encodedSignature) return null;
    let payload;
    try {
        payload = new TextDecoder().decode(Uint8Array.from(decodeBase64Url(encoded), c => c.charCodeAt(0)));
    } catch {
        return null;
    }
    const [userId, expiresAtText] = payload.split('.');
    const expiresAt = Number(expiresAtText);
    if (!userId || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const expected = await hmac(secret, payload);
    let actual;
    try {
        actual = Uint8Array.from(decodeBase64Url(encodedSignature), c => c.charCodeAt(0));
    } catch {
        return null;
    }
    if (actual.length !== expected.length) return null;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected[i] ^ actual[i];
    return mismatch === 0 ? { userId, expiresAt } : null;
}

function stripeSignatureValid(rawBody, signature, secret, timestamp = Math.floor(Date.now() / 1000)) {
    if (!signature || !secret) return Promise.resolve(false);
    const parts = Object.fromEntries(signature.split(',').map(part => {
        const [key, value] = part.split('=');
        return [key, value];
    }));
    const signed = `${parts.t}.${rawBody}`;
    return hmac(secret, signed).then(bytes => {
        const expected = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const candidates = (parts.v1 || '').split(' ');
        return Number.isFinite(Number(parts.t)) &&
            Math.abs(timestamp - Number(parts.t)) <= 300 &&
            candidates.includes(expected);
    });
}

async function stripeRequest(path, params, env) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECKOUT_LIMIT_MS);
    try {
        const response = await fetch(`https://api.stripe.com/v1/${path}`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(params),
            signal: controller.signal
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || `Stripe request failed (${response.status})`);
        return body;
    } finally {
        clearTimeout(timer);
    }
}

async function stripeGet(path, env) {
    if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
        headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || `Stripe request failed (${response.status})`);
    return body;
}

async function userIdForEmail(db, email) {
    await db.prepare('INSERT OR IGNORE INTO users (email, created_at) VALUES (?, ?)')
        .bind(email, new Date().toISOString()).run();
    const row = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    return row?.id || null;
}

async function grantPurchase(db, session, status = 'paid') {
    const email = normalizeEmail(session.customer_details?.email || session.customer_email);
    if (!email || !session.id) throw new Error('Stripe session has no customer email');
    const userId = await userIdForEmail(db, email);
    await db.prepare(`
        INSERT INTO purchases (checkout_session_id, payment_intent_id, user_id, amount, currency, status, updated_at, livemode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(checkout_session_id) DO UPDATE SET
            payment_intent_id = excluded.payment_intent_id,
            amount = excluded.amount,
            currency = excluded.currency,
            status = CASE WHEN purchases.status = 'revoked' THEN 'revoked' ELSE excluded.status END,
            updated_at = excluded.updated_at,
            livemode = excluded.livemode
    `).bind(
        session.id,
        session.payment_intent || null,
        userId,
        Number(session.amount_total || 0),
        session.currency || 'eur',
        status,
        new Date().toISOString(),
        session.livemode ? 1 : 0
    ).run();
    const purchase = await db.prepare('SELECT status FROM purchases WHERE checkout_session_id = ?').bind(session.id).first();
    return { userId, email, status: purchase.status };
}

async function sessionCookie(userId, env) {
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const token = await signSession(userId, expiresAt, env.SESSION_SECRET);
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

async function entitlement(request, env) {
    if (!env.DB || !env.SESSION_SECRET) return { entitled: false, configured: false };
    if (env.ACCESS_RECOVERY_ENABLED === '1') {
        const registered = await accessSession(request, env);
        if (registered) return accessInfo(env, registered);
        const legacy = await legacyAccess(request, env);
        return {
            entitled: !!legacy, recoveryRequired: !!legacy, verified: false, deviceRegistered: false,
            configured: true
        };
    }
    const session = await verifySession(parseCookies(request)[SESSION_COOKIE], env.SESSION_SECRET);
    if (!session) return { entitled: false, configured: true };
    if (session.userId.startsWith('invite:')) {
        const invitation = await env.DB.prepare(`
            SELECT 1 FROM vr_invitations
            WHERE redeemed_by = ? AND revoked_at IS NULL
            LIMIT 1
        `).bind(session.userId).first();
        return { entitled: !!invitation, configured: true };
    }
    const row = await env.DB.prepare(`
        SELECT 1 FROM purchases
        WHERE user_id = ? AND status = 'paid' AND livemode = ?
        LIMIT 1
    `).bind(session.userId, env.STRIPE_MODE === 'live' ? 1 : 0).first();
    return { entitled: !!row, configured: true };
}

async function legacyAccess(request, env) {
    const session = await verifySession(parseCookies(request)[SESSION_COOKIE], env.SESSION_SECRET);
    if (!session) return null;
    if (session.userId.startsWith('invite:')) {
        const invitation = await env.DB.prepare(`SELECT 1 FROM vr_invitations
            WHERE redeemed_by = ? AND revoked_at IS NULL AND user_id IS NULL LIMIT 1`).bind(session.userId).first();
        return invitation ? { subject: session.userId } : null;
    }
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(session.userId).first();
    if (!user || !await accountEntitled(env, user.id)) return null;
    return { subject: session.userId, email: user.email };
}

export async function handlePayments(request, env, appOrigin) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/payments/')) return null;
    if (env.STRIPE_MODE === 'live') {
        env = {
            ...env,
            STRIPE_SECRET_KEY: env.STRIPE_LIVE_SECRET_KEY,
            STRIPE_WEBHOOK_SECRET: env.STRIPE_LIVE_WEBHOOK_SECRET
        };
    }
    const headers = corsHeaders(request.headers.get('Origin'), appOrigin);
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: { ...headers, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' }
        });
    }
    const isWebhook = url.pathname === '/payments/webhook';
    if (!isWebhook && request.headers.get('Origin') !== appOrigin) return json({ error: 'origin_not_allowed' }, 403, headers);
    const recovery = await handleRecovery(request, env, headers, {
        json, readBody: readInvitationBody, normalizeEmail, legacyAccess
    });
    if (recovery) return recovery;

    if (url.pathname === '/payments/entitlement' && request.method === 'GET') {
        return json(await entitlement(request, env), 200, headers);
    }
    if (url.pathname === '/payments/redeem' && request.method === 'POST') {
        if (!env.DB || !env.SESSION_SECRET) {
            return json({ error: 'access_not_configured', message: 'VR invitation access is not configured yet.' }, 503, headers);
        }
        try {
            const body = await readInvitationBody(request);
            const code = normalizeInvitationCode(body?.code);
            if (!code) return json({ error: 'invalid_invitation', message: 'Enter the complete invitation code.' }, 400, headers);
            if (/^[0-9]{8}$/.test(code)) {
                const ipHash = await invitationCodeHash(request.headers.get('CF-Connecting-IP') || 'unknown');
                if (!await limit(env, `invite-ip:${ipHash}`, 30, 600000)) {
                    return json({ error: 'invitation_rate_limit', message: 'Too many invitation attempts. Please try again later.' },
                        429, { ...headers, 'retry-after': '600' });
                }
                if (!await limit(env, 'invite-global', 300, 3600000)) {
                    return json({ error: 'invitation_rate_limit', message: 'Invitation activation is temporarily rate-limited. Please try again later.' },
                        429, { ...headers, 'retry-after': '3600' });
                }
            }
            if (env.ACCESS_RECOVERY_ENABLED === '1') {
                const verified = await accessSession(request, env);
                if (!verified) return json({ error: 'verification_required', message: 'Verify your email before redeeming an invitation. The code has not been used.' }, 401, headers);
                if (/^[0-9]{8}$/.test(code) && !await limit(env, `invite-user:${verified.user_id}`, 10, 600000)) {
                    return json({ error: 'invitation_rate_limit', message: 'Too many invitation attempts. Please wait 10 minutes before trying again.' },
                        429, { ...headers, 'retry-after': '600' });
                }
                const subject = `invite:${crypto.randomUUID()}`, now = new Date().toISOString();
                const results = await env.DB.batch([
                    env.DB.prepare(`UPDATE vr_invitations SET redeemed_by = ?, redeemed_at = ?, user_id = ?
                        WHERE code_hash = ? AND redeemed_by IS NULL AND revoked_at IS NULL RETURNING code_hash`)
                        .bind(subject, now, verified.user_id, await invitationCodeHash(code)),
                    env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, created_at)
                        SELECT ?, 'invitation_redeemed', ?, ? FROM vr_invitations WHERE redeemed_by = ?`)
                        .bind(verified.user_id, verified.email, Date.now(), subject)
                ]);
                if (!results[0].results.length) return json({ error: 'invitation_unavailable', message: 'This invitation code is invalid, already used or revoked.' }, 409, headers);
                return json(await accessInfo(env, verified), 200, headers);
            }
            const subject = `invite:${crypto.randomUUID()}`;
            // Sign first: a signing failure must not consume a redeemable code.
            const cookie = await sessionCookie(subject, env);
            const redeemed = await env.DB.prepare(`
                UPDATE vr_invitations SET redeemed_by = ?, redeemed_at = ?
                WHERE code_hash = ? AND redeemed_by IS NULL AND revoked_at IS NULL
                RETURNING redeemed_by
            `).bind(subject, new Date().toISOString(), await invitationCodeHash(code)).first();
            if (!redeemed) {
                return json({ error: 'invitation_unavailable', message: 'This invitation code is invalid, already used or revoked.' }, 409, headers);
            }
            return json({ entitled: true }, 200, { ...headers, 'set-cookie': cookie });
        } catch (error) {
            console.error('[Payments] Invitation redemption failed', { name: error.name });
            return json({ error: 'redemption_failed', message: 'Could not redeem the invitation. Please retry or contact the person who sent it.' }, 503, headers);
        }
    }
    if (url.pathname === '/payments/checkout' && request.method === 'POST') {
        if (!env.DB || !env.STRIPE_PRICE_ID || !env.STRIPE_SECRET_KEY) {
            return json({ error: 'payments_not_configured' }, 503, headers);
        }
        const body = await request.json().catch(() => null);
        const email = normalizeEmail(body?.email);
        if (!email) return json({ error: 'valid_email_required' }, 400, headers);
        try {
            const session = await stripeRequest('checkout/sessions', {
                mode: 'payment',
                'line_items[0][price]': env.STRIPE_PRICE_ID,
                'line_items[0][quantity]': '1',
                customer_email: email,
                success_url: `${appOrigin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${appOrigin}/?payment=cancelled`,
                'metadata[product]': 'nocturne_vr_access'
            }, env);
            if (session.livemode !== (env.STRIPE_MODE === 'live')) throw new Error('Stripe checkout mode does not match the configured payment mode');
            return json({ url: session.url }, 200, headers);
        } catch (error) {
            return json({ error: 'checkout_failed', message: error.message }, 502, headers);
        }
    }
    if (url.pathname === '/payments/claim' && request.method === 'POST') {
        if (!env.DB || !env.STRIPE_SECRET_KEY || !env.SESSION_SECRET) return json({ error: 'payments_not_configured' }, 503, headers);
        const body = await request.json().catch(() => null);
        if (typeof body?.session_id !== 'string' || !/^cs_[A-Za-z0-9_]+$/.test(body.session_id)) {
            return json({ error: 'invalid_checkout_session' }, 400, headers);
        }
        try {
            const stripeSession = await stripeGet(`checkout/sessions/${encodeURIComponent(body.session_id)}?expand[]=customer_details`, env);
            if (stripeSession.livemode !== (env.STRIPE_MODE === 'live')) {
                return json({ error: 'payment_mode_mismatch' }, 400, headers);
            }
            if (stripeSession.payment_status !== 'paid' || stripeSession.metadata?.product !== 'nocturne_vr_access') {
                return json({ error: 'payment_not_confirmed' }, 402, headers);
            }
            const { userId, status } = await grantPurchase(env.DB, stripeSession);
            if (status !== 'paid') return json({ error: 'access_revoked', message: 'This purchase no longer grants VR access. Contact support.' }, 403, headers);
            if (env.ACCESS_RECOVERY_ENABLED === '1') {
                const verified = await accessSession(request, env);
                if (verified && String(verified.user_id) === String(userId)) return json(await accessInfo(env, verified), 200, headers);
                return json({ entitled: true, recoveryRequired: true, verified: false, deviceRegistered: false },
                    200, { ...headers, 'set-cookie': await sessionCookie(userId, env) });
            }
            return json({ entitled: true }, 200, { ...headers, 'set-cookie': await sessionCookie(userId, env) });
        } catch (error) {
            return json({ error: 'claim_failed', message: error.message }, 502, headers);
        }
    }
    if (isWebhook && request.method === 'POST') {
        const rawBody = await request.text();
        if (!await stripeSignatureValid(rawBody, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET)) {
            return json({ error: 'invalid_signature' }, 400);
        }
        if (!env.DB) return json({ error: 'payments_not_configured' }, 503);
        const event = JSON.parse(rawBody);
        if (event.livemode !== (env.STRIPE_MODE === 'live')) {
            return json({ error: 'payment_mode_mismatch' }, 400);
        }
        if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
            if (event.data.object.payment_status === 'paid' &&
                event.data.object.metadata?.product === 'nocturne_vr_access' &&
                event.data.object.livemode === event.livemode) {
                await grantPurchase(env.DB, event.data.object);
            }
        } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
            const charge = event.data.object;
            await env.DB.prepare(`
                UPDATE purchases SET status = 'revoked', updated_at = ? WHERE payment_intent_id = ?
            `).bind(new Date().toISOString(), charge.payment_intent || null).run();
        }
        return json({ received: true });
    }
    return json({ error: 'not_found' }, 404, headers);
}

export const paymentInternals = Object.freeze({
    normalizeEmail,
    parseCookies,
    stripeSignatureValid,
    verifySession
});
