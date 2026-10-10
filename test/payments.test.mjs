import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePayments, paymentInternals } from '../worker/src/payments.js';
import { createHmac } from 'node:crypto';

test('payment email validation accepts normalized addresses and rejects malformed input', () => {
    assert.equal(paymentInternals.normalizeEmail('  User@Example.COM '), 'user@example.com');
    assert.equal(paymentInternals.normalizeEmail('not-an-email'), null);
    assert.equal(paymentInternals.normalizeEmail('a@b.c'), null);
});

test('session cookies are parsed without treating cookie values as names', () => {
    const request = new Request('https://nocturne-vr.pages.dev', {
        headers: { Cookie: 'a=1; nocturne_vr_session=token%2Evalue; empty=' }
    });
    assert.deepEqual(paymentInternals.parseCookies(request), {
        a: '1',
        nocturne_vr_session: 'token.value',
        empty: ''
    });
});

test('signed sessions reject tampering and expire', async () => {
    const secret = 'test-secret';
    const valid = await (async () => {
        const payload = '42.' + (Math.floor(Date.now() / 1000) + 60);
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
        const encode = value => Buffer.from(value).toString('base64url');
        return `${encode(payload)}.${Buffer.from(signature).toString('base64url')}`;
    })();
    assert.deepEqual((await paymentInternals.verifySession(valid, secret)).userId, '42');
    const parts = valid.split('.');
    parts[0] = Buffer.from('43.' + (Math.floor(Date.now() / 1000) + 60)).toString('base64url');
    assert.equal(await paymentInternals.verifySession(parts.join('.'), secret), null);
});

test('Stripe webhook signatures require a fresh timestamp and matching HMAC', async () => {
    const body = '{"id":"evt_test"}';
    const secret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    const digest = Buffer.from(bytes).toString('hex');
    assert.equal(await paymentInternals.stripeSignatureValid(body, `t=${timestamp},v1=${digest}`, secret, timestamp), true);
    assert.equal(await paymentInternals.stripeSignatureValid(body, `t=${timestamp - 301},v1=${digest}`, secret, timestamp), false);
});

test('an unpaid checkout completion webhook never grants a purchase', async () => {
    const body = JSON.stringify({
        type: 'checkout.session.completed',
        livemode: false,
        data: { object: { id: 'cs_unpaid', payment_status: 'unpaid' } }
    });
    const secret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`)));
    const signature = `t=${timestamp},v1=${Buffer.from(bytes).toString('hex')}`;
    let databaseQueries = 0;
    const response = await handlePayments(new Request('https://api.mitwee.nl/payments/webhook', {
        method: 'POST',
        headers: { 'Stripe-Signature': signature },
        body
    }), {
        DB: { prepare() { databaseQueries++; throw new Error('unpaid checkout must not write'); } },
        STRIPE_WEBHOOK_SECRET: secret
    }, 'https://nocturne.mitwee.nl');

    assert.equal(response.status, 200);
    assert.equal(databaseQueries, 0);
});

test('Checkout uses dashboard-managed methods and rejects a mismatched Stripe mode', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let params, livemode = true;
    globalThis.fetch = async (url, options) => {
        params = new URLSearchParams(options.body);
        return Response.json({ url: 'https://checkout.stripe.com/example', livemode });
    };
    const checkout = () => handlePayments(new Request('https://api.mitwee.nl/payments/checkout', {
        method: 'POST', headers: { Origin: 'https://nocturne.mitwee.nl' },
        body: JSON.stringify({ email: 'buyer@example.com' })
    }), { DB: {}, STRIPE_PRICE_ID: 'price_live', STRIPE_LIVE_SECRET_KEY: 'test-fixture', STRIPE_MODE: 'live' },
    'https://nocturne.mitwee.nl');
    assert.equal((await checkout()).status, 200);
    assert.equal(params.get('payment_method_types[0]'), null);
    assert.equal(params.get('mode'), 'payment');
    assert.equal(params.get('line_items[0][price]'), 'price_live');
    livemode = false;
    assert.equal((await checkout()).status, 502);
});

test('live claim and webhook reject test payments without querying the database', async t => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let queries = 0;
    const env = {
        DB: { prepare() { queries++; throw new Error('must not query'); } },
        STRIPE_MODE: 'live', STRIPE_LIVE_SECRET_KEY: 'fixture', SESSION_SECRET: 'fixture',
        STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_fixture'
    };
    globalThis.fetch = async () => Response.json({
        id: 'cs_test_fixture', livemode: false, payment_status: 'paid',
        metadata: { product: 'nocturne_vr_access' }
    });
    const response = await handlePayments(new Request('https://api.mitwee.nl/payments/claim', {
        method: 'POST', headers: { Origin: 'https://nocturne.mitwee.nl' },
        body: JSON.stringify({ session_id: 'cs_test_fixture' })
    }), env, 'https://nocturne.mitwee.nl');
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'payment_mode_mismatch');
    const raw = JSON.stringify({
        livemode: false, type: 'checkout.session.completed',
        data: { object: { payment_status: 'paid' } }
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', env.STRIPE_LIVE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
    const webhook = await handlePayments(new Request('https://api.mitwee.nl/payments/webhook', {
        method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` }, body: raw
    }), env, 'https://nocturne.mitwee.nl');
    assert.equal(webhook.status, 400);
    assert.equal(queries, 0);
});
