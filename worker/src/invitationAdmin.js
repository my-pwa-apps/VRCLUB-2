import { createRemoteJWKSet, jwtVerify, errors } from 'jose';
import { generateInvitationCode, invitationCodeHash, readInvitationBody } from './payments.js';
import { dashboardHtml, dashboardScript } from './invitationDashboard.js';

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff'
        }
    });
}

export async function verifyAdmin(request, env) {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.INVITATION_ADMINS) {
        throw new Error('Invitation administration Access configuration is missing');
    }
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) {
        throw new Error('Invalid Access team domain configuration');
    }
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 16384) return null;
    try {
        const keys = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
        const { payload } = await jwtVerify(token, keys, {
            issuer: env.ACCESS_TEAM_DOMAIN,
            audience: env.ACCESS_AUD,
            algorithms: ['RS256'],
            requiredClaims: ['exp', 'iat', 'sub', 'email'],
            maxTokenAge: '24h'
        });
        const admins = env.INVITATION_ADMINS.split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
        if (payload.type !== 'app' || typeof payload.sub !== 'string' || !payload.sub ||
            typeof payload.email !== 'string' || !admins.includes(payload.email.toLowerCase())) return null;
        return payload.email.toLowerCase();
    } catch (error) {
        if (error instanceof errors.JWTExpired || error instanceof errors.JWTClaimValidationFailed ||
            error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid ||
            error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JOSEAlgNotAllowed ||
            error instanceof errors.JWKSNoMatchingKey) return null;
        throw error;
    }
}

export async function handleInvitationAdmin(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return null;
    // The default Worker domain must not provide an alternative admin origin.
    if (url.origin !== env.INVITATION_ADMIN_ORIGIN) return json({ message: 'Invitation administration is unavailable on this hostname.' }, 403);
    try {
        const actor = await verifyAdmin(request, env);
        if (!actor) return json({ message: 'An authorised Cloudflare Access administrator login is required.' }, 403);
        if (!env.DB) throw new Error('Invitation database binding is missing');
        if (request.method !== 'GET' && request.method !== 'POST') return json({ message: 'Method not allowed.' }, 405);
        if (request.method === 'POST' &&
            (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json'))) {
            return json({ message: 'Use the same-origin invitation dashboard to make changes.' }, 403);
        }
        if (request.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
            return Response.redirect(`${url.origin}/admin/invitations`, 302);
        }
        if (request.method === 'GET' && url.pathname === '/admin/invitations') {
            const nonce = crypto.randomUUID();
            return new Response(dashboardHtml.replaceAll('NONCE_PLACEHOLDER', nonce), {
                headers: {
                    'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
                    'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
                    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'
                }
            });
        }
        if (request.method === 'GET' && url.pathname === '/admin/invitations/script.js') {
            return new Response(dashboardScript, { headers: {
                'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
            } });
        }
        if (request.method === 'GET' && url.pathname === '/admin/invitations/data') {
            const before = url.searchParams.get('before');
            if (before !== null && !/^[a-f0-9]{64}$/.test(before)) return json({ message: 'Invalid page cursor.' }, 400);
            const records = await env.DB.prepare(`
                SELECT code_hash, created_at, issued_by, label, redeemed_at, revoked_at, revoked_by
                FROM vr_invitations WHERE (? IS NULL OR code_hash < ?) ORDER BY code_hash DESC LIMIT 51
            `).bind(before, before).all();
            const items = records.results.slice(0, 50);
            return json({ actor, items, next: records.results.length > 50 ? items.at(-1).code_hash : null });
        }
        if (request.method === 'GET' && url.pathname === '/admin/invitations/recovery-data') {
            const email = url.searchParams.get('email')?.trim().toLowerCase();
            if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ message: 'Enter the verified customer email.' }, 400);
            const user = await env.DB.prepare('SELECT id, email, email_verified_at FROM users WHERE email = ?').bind(email).first();
            if (!user) return json({ user: null, devices: [], audit: [] });
            const devices = await env.DB.prepare('SELECT id, name, created_at, revoked_at FROM access_devices WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(user.id).all();
            const audit = await env.DB.prepare('SELECT action, actor, device_id, created_at FROM access_audit WHERE user_id = ? ORDER BY id DESC LIMIT 50').bind(user.id).all();
            return json({ user, devices: devices.results, audit: audit.results });
        }
        if (request.method === 'POST' && url.pathname === '/admin/invitations/link-legacy') {
            const body = await readInvitationBody(request);
            const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
            if (typeof body?.hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.hash) || !email || email.length > 254) return json({ message: 'Enter the invitation identifier and verified recipient email.' }, 400);
            const user = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND email_verified_at IS NOT NULL').bind(email).first();
            if (!user) return json({ message: 'The recipient must first verify this email using Restore access. No grant has been changed.' }, 409);
            // Only a redeemed, unlinked legacy grant may be transferred by support.
            const results = await env.DB.batch([
                env.DB.prepare(`INSERT INTO access_audit (user_id, action, actor, created_at)
                    SELECT ?, 'admin_legacy_linked', ?, ? FROM vr_invitations
                    WHERE code_hash = ? AND redeemed_by IS NOT NULL AND user_id IS NULL AND revoked_at IS NULL`)
                    .bind(user.id, actor, Date.now(), body.hash),
                env.DB.prepare(`UPDATE vr_invitations SET user_id = ? WHERE code_hash = ?
                    AND redeemed_by IS NOT NULL AND user_id IS NULL AND revoked_at IS NULL RETURNING code_hash`).bind(user.id, body.hash)
            ]);
            if (!results[1].results.length) return json({ message: 'This grant is not a redeemed, unlinked legacy invitation. No change was made.' }, 409);
            return json({ linked: true });
        }
        if (request.method === 'POST' && url.pathname === '/admin/invitations/issue') {
            const body = await readInvitationBody(request);
            if (!body || !Number.isSafeInteger(body.count) || body.count < 1 || body.count > 20 ||
                typeof body.label !== 'string' || body.label.length > 100 || /[\u0000-\u001f\u007f]/.test(body.label)) {
                return json({ message: 'Choose 1–20 invitations and a label of at most 100 characters.' }, 400);
            }
            const createdAt = new Date().toISOString();
            const invitations = [], statements = [];
            const hashes = new Set();
            for (let i = 0; i < body.count; i++) {
                let code, hash;
                for (let attempt = 0; attempt < 10; attempt++) {
                    code = generateInvitationCode();
                    hash = await invitationCodeHash(code);
                    if (!hashes.has(hash) && !await env.DB.prepare('SELECT code_hash FROM vr_invitations WHERE code_hash = ?').bind(hash).first()) break;
                    hash = null;
                }
                if (!hash) throw new Error('Could not generate an unused invitation identifier');
                hashes.add(hash);
                invitations.push({ code, hash });
                statements.push(env.DB.prepare('INSERT INTO vr_invitations (code_hash, created_at, issued_by, label) VALUES (?, ?, ?, ?)')
                    .bind(hash, createdAt, actor, body.label.trim()));
                statements.push(env.DB.prepare("INSERT INTO invitation_audit (code_hash, action, actor, created_at) VALUES (?, 'issued', ?, ?)")
                    .bind(hash, actor, createdAt));
            }
            await env.DB.batch(statements);
            return json({ invitations }, 201);
        }
        if (request.method === 'POST' && url.pathname === '/admin/invitations/revoke') {
            const body = await readInvitationBody(request);
            if (!body || typeof body.hash !== 'string' || !/^[a-f0-9]{64}$/.test(body.hash)) return json({ message: 'Invalid invitation identifier.' }, 400);
            const now = new Date().toISOString();
            // Audit only the transition; both writes commit or roll back together.
            const results = await env.DB.batch([
                env.DB.prepare(`INSERT INTO invitation_audit (code_hash, action, actor, created_at)
                    SELECT code_hash, 'revoked', ?, ? FROM vr_invitations WHERE code_hash = ? AND revoked_at IS NULL`).bind(actor, now, body.hash),
                env.DB.prepare(`UPDATE vr_invitations SET revoked_at = ?, revoked_by = ?
                    WHERE code_hash = ? AND revoked_at IS NULL RETURNING code_hash`).bind(now, actor, body.hash)
            ]);
            if (results[1].results.length === 0) return json({ message: 'Invitation not found or already revoked.' }, 409);
            return json({ revoked: true });
        }
        return json({ message: 'Admin route not found.' }, 404);
    } catch (error) {
        console.error('[InvitationAdmin] Request failed', { name: error.name });
        return json({ message: 'Invitation administration is unavailable. Check Access configuration or retry.' }, 503);
    }
}
