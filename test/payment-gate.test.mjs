import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPaymentGate(handler, search = '') {
    const elements = [], requests = [], timers = new Map(), events = {};
    let now = 100000, wallNow = 100000, timerId = 0;
    const document = {
        body: { append(el) { elements.push(el); } },
        createElement(tag) {
            return {
                tagName: tag.toUpperCase(), children: [], listeners: {}, attributes: {}, value: '', disabled: false,
                append(...children) {
                    this.children.push(...children);
                    for (const child of children) child.parentElement = this;
                    this.children.forEach((child, index) => { child.nextSibling = this.children[index + 1]; });
                },
                replaceChildren(...children) { this.children = children; },
                setAttribute(name, value) { this.attributes[name] = value; },
                addEventListener(type, fn) { this.listeners[type] = fn; },
                querySelectorAll(selector) {
                    const tags = selector.split(',').map(s => s.trim().toUpperCase());
                    return this.children.flatMap(child => [
                        ...(tags.includes(child.tagName) ? [child] : []),
                        ...child.querySelectorAll(selector)
                    ]);
                },
                focus() { document.activeElement = this; },
                remove() { this.removed = true; },
                reportValidity() { return true; }
            };
        }
    };
    const window = {
        location: { origin: 'https://club.example', search, pathname: '/', hash: '', assign(url) { this.assigned = url; } },
        history: { replaceState() { this.replaced = true; } },
        addEventListener(type, fn) { events[type] = fn; },
        removeEventListener(type, fn) { if (events[type] === fn) delete events[type]; }
    };
    const context = vm.createContext({
        window, document, URLSearchParams, console,
        Date: { now: () => wallNow }, performance: { now: () => now }, crypto: { randomUUID: () => 'tab-uuid' },
        setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay, interval: false }); return timerId; },
        setInterval: (fn, delay) => { timers.set(++timerId, { fn, delay, interval: true }); return timerId; },
        clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
        fetch: async (url, options) => {
            const path = url.split('/payments')[1];
            const body = options.body ? JSON.parse(options.body) : undefined;
            requests.push({ url, options, path, body });
            const result = await handler(path, body, requests.length);
            return { ok: !result.status || result.status < 400, status: result.status || 200, json: async () => result.body || result };
        }
    });
    vm.runInContext(readFileSync(join(ROOT, 'js', 'paymentGate.js'), 'utf8'), context);
    const dialog = () => elements.find(el => el.attributes.role === 'dialog');
    const all = () => dialog().querySelectorAll('button, input, p');
    const button = text => all().find(el => el.tagName === 'BUTTON' && el.textContent === text);
    const input = label => all().find(el => el.attributes['aria-label'] === label);
    const status = () => all().find(el => el.attributes.role === 'status').textContent;
    return {
        window, elements, requests, timers, events, dialog, button, input, status,
        async open() { await window.VRPayment.refreshEntitlement(); window.VRPayment.showGate(); await window.VRPayment.refreshEntitlement(); },
        async click(text) { assert.ok(button(text), `Missing ${text}`); await button(text).listeners.click(); },
        async verify() {
            input('Email for access recovery').value = 'guest@example.com';
            await this.click('Send verification code');
            input('Eight-digit email verification code').value = '12345678';
            await this.click('Verify email');
        },
        setNow(value) { now = value; },
        setWallNow(value) { wallNow = value; },
        async tick(interval) {
            const timer = [...timers.values()].find(t => t.interval === interval);
            assert.ok(timer);
            timer.fn();
            await new Promise(resolve => setImmediate(resolve));
        }
    };
}
const fresh = { entitled: false, configured: true, verified: false, deviceRegistered: false, devices: [] };
const registered = { entitled: true, configured: true, verified: true, deviceRegistered: true, devices: [] };

test('access dialog has an explicit header Close button that dismisses without entering VR', async () => {
    const gate = loadPaymentGate(() => fresh);
    await gate.open();
    const close = gate.button('Close');
    assert.equal(close.className, 'payment-close');
    assert.ok(gate.dialog().children[0].children[0].children.includes(close));
    await gate.click('Close');
    assert.equal(gate.dialog().hidden, true);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
});

test('incompatible devices retain Access management without a Prepare VR action', async () => {
    const gate = loadPaymentGate(() => registered);
    gate.window.vrClub = { _vrAvailable: false };
    await gate.open();
    assert.equal(gate.button('Prepare VR'), undefined);
    assert.ok(gate.button('Refresh devices'));
    assert.equal(gate.dialog().children[0].children[0].children[0].textContent, 'Access');
});

test('checkout return keeps old access, prompts binding, and never asks the buyer to pay again', async () => {
    const gate = loadPaymentGate(path => path === '/claim'
        ? { entitled: true, recoveryRequired: true }
        : fresh, '?payment=success&session_id=cs_test_123');
    await gate.window.VRPayment.refreshEntitlement();
    assert.equal(gate.window.VRPayment.hasEntitlement(), true);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    assert.equal(gate.requests[0].url, 'https://api.mitwee.nl/payments/claim');
    assert.deepEqual(gate.requests[0].body, { session_id: 'cs_test_123' });
    assert.equal(gate.requests[0].options.credentials, 'include');
    assert.equal(gate.window.history.replaced, true);
    assert.match(gate.status(), /do not pay again/);
    assert.equal(gate.button('Buy VR access — €1.99'), undefined);
});

test('verify email, redeem, register, prepare: each server-confirmed step is required', async () => {
    const gate = loadPaymentGate(path => ({
        '/entitlement': fresh,
        '/recovery/start': { challenge: 'challenge', message: 'Check your inbox.' },
        '/recovery/verify': { verified: true, email: 'guest@example.com', entitled: false, deviceRegistered: false, devices: [] },
        '/redeem': { verified: true, entitled: true, deviceRegistered: false },
        '/devices/register': { entitled: true, deviceRegistered: true, devices: [{ id: 'new', name: 'Quest', current: true }] },
        '/vr/acquire': { active: true, expiresAt: 160000, expiresInMs: 60000 }
    })[path]);
    await gate.open();
    assert.equal(gate.button('Redeem invitation — no payment'), undefined);
    await gate.click('Verify email');
    assert.match(gate.status(), /Request a code/);
    await gate.verify();
    assert.deepEqual(gate.requests.find(r => r.path === '/recovery/start').body, { email: 'guest@example.com', intent: 'restore' });
    await gate.click('Redeem invitation — no payment');
    assert.match(gate.status(), /Enter your invitation/);
    gate.input('One-use VR invitation code').value = '00123456';
    await gate.click('Redeem invitation — no payment');
    assert.equal(gate.window.VRPayment.hasEntitlement(), true);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    assert.deepEqual(gate.requests.find(r => r.path === '/devices/register').body, { name: 'My VR browser' });
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    await gate.click('Prepare VR');
    assert.equal(gate.window.VRPayment.canEnterVR(), true);
    assert.equal(gate.window.location.assigned, undefined);
    assert.deepEqual(gate.requests.find(r => r.path === '/vr/acquire').body, { tab: 'tab-uuid' });
    gate.setNow(160001);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    await gate.tick(false);
    assert.match(gate.status(), /expired/);
});

test('restore with two occupied slots requires explicit replacement; removal also confirms', async () => {
    const devices = [{ id: 'one', name: 'Old Quest' }, { id: 'two', name: 'Desktop' }];
    const gate = loadPaymentGate(path => ({
        '/entitlement': fresh,
        '/recovery/start': { challenge: 'challenge' },
        '/recovery/verify': { verified: true, email: 'guest@example.com', entitled: true, deviceRegistered: false, devices },
        '/devices/register': { entitled: true, deviceRegistered: true, devices: [{ id: 'new', name: 'Quest', current: true }] },
        '/devices/remove': { removed: true, devices: [] }
    })[path]);
    await gate.open(); await gate.verify();
    assert.equal(gate.button('Register this device'), undefined);
    await gate.click('Replace Old Quest');
    assert.equal(gate.requests.filter(r => r.path === '/devices/register').length, 0);
    await gate.click('Cancel');
    gate.input('Name for this device').value = 'Quest';
    await gate.click('Replace Old Quest'); await gate.click('Confirm');
    assert.deepEqual(gate.requests.find(r => r.path === '/devices/register').body, { name: 'Quest', replaceDevice: 'one' });
    await gate.click('Remove Quest');
    assert.equal(gate.requests.filter(r => r.path === '/devices/remove').length, 0);
    await gate.click('Confirm');
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    assert.ok(gate.button('Register this device'));
});

test('HTTP device-limit body is preserved, enabling explicit replacement after a racing registration', async () => {
    const gate = loadPaymentGate(path => path === '/entitlement'
        ? { ...registered, deviceRegistered: false }
        : { status: 409, body: { error: 'device_limit', message: 'Both slots are used.', devices: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] } });
    await gate.open(); await gate.click('Register this device');
    assert.match(gate.status(), /Both slots/);
    assert.ok(gate.button('Replace One'));
    assert.equal(gate.button('Register this device'), undefined);
});

test('invalid invitation stays retryable and does not unlock access', async () => {
    for (const failure of [{ status: 409, body: { message: 'Code already used.' } }, {}]) {
        const gate = loadPaymentGate(path => path === '/entitlement'
            ? { ...fresh, verified: true } : failure);
        await gate.open();
        gate.input('One-use VR invitation code').value = '87654321';
        await gate.click('Redeem invitation — no payment');
        assert.equal(gate.window.VRPayment.hasEntitlement(), false);
        assert.equal(gate.button('Redeem invitation — no payment').disabled, false);
        assert.match(gate.status(), /Code already used|not confirmed/);
    }
});

test('numeric keypads preserve zeros, support correction and reject non-numeric paste without a headset keyboard', async () => {
    const gate = loadPaymentGate(() => fresh);
    await gate.open();
    await gate.click('Use invitation code');
    assert.equal(gate.button('Use an older letter-and-number invitation'), undefined);
    assert.equal(gate.button('Use a new numeric invitation'), undefined);
    const field = gate.input('One-use VR invitation code');
    assert.equal(field.readOnly, true);
    assert.equal(field.inputMode, 'numeric');
    assert.equal(field.maxLength, 8);
    for (const digit of ['0', '0', '1', '2']) await gate.click(digit);
    assert.equal(field.value, '0012');
    await gate.click('Backspace');
    assert.equal(field.value, '001');
    let prevented = 0;
    field.listeners.paste({ preventDefault() { prevented++; }, clipboardData: { getData: () => '12AB' } });
    assert.equal(field.value, '001');
    assert.match(gate.status(), /numbers only/);
    field.listeners.paste({ preventDefault() { prevented++; }, clipboardData: { getData: () => '0000-1234' } });
    assert.equal(field.value, '00001234');
    assert.equal(prevented, 2);
    await gate.click('Clear');
    assert.equal(field.value, '');
    await gate.click('Continue with invitation');
    assert.match(gate.status(), /all eight digits/);
    assert.equal(gate.requests.filter(request => request.path !== '/entitlement').length, 0);
});

test('guided invitation activation retains the code through email verification and registers only after redemption', async () => {
    const gate = loadPaymentGate(path => ({
        '/entitlement': fresh,
        '/recovery/start': { challenge: 'invite-challenge' },
        '/recovery/verify': { verified: true, email: 'guest@example.com', entitled: false, deviceRegistered: false },
        '/redeem': { verified: true, entitled: true, deviceRegistered: false },
        '/devices/register': { entitled: true, deviceRegistered: true }
    })[path]);
    await gate.open();
    await gate.click('Use invitation code');
    for (const digit of '00123456') await gate.click(digit);
    await gate.click('Continue with invitation');
    assert.equal(gate.input('Eight-digit email verification code').parentElement.hidden, true,
        'the email step must not show the next step keypad');
    assert.equal(gate.button('Verify email').hidden, true);
    assert.equal(gate.input('One-use VR invitation code'), undefined);
    assert.equal(gate.requests.some(request => request.path === '/redeem'), false);
    await gate.verify();
    assert.deepEqual(gate.requests.find(request => request.path === '/redeem').body, { code: '00123456' });
    const mutations = gate.requests.filter(request => request.path !== '/entitlement');
    assert.deepEqual(mutations.map(request => request.path),
        ['/recovery/start', '/recovery/verify', '/redeem', '/devices/register']);
    assert.equal(gate.window.VRPayment.hasEntitlement(), true);
    assert.match(gate.status(), /Next: press Prepare VR/);
    assert.equal(gate.window.VRPayment.canEnterVR(), false, 'preparation and a new XR-entry click remain mandatory');
    assert.ok(gate.button('Prepare VR'));
    assert.equal(gate.input('One-use VR invitation code'), undefined);
});

test('an invalid guided invitation stays editable after verification without repeating the email step', async () => {
    const gate = loadPaymentGate(path => ({
        '/entitlement': fresh,
        '/recovery/start': { challenge: 'challenge' },
        '/recovery/verify': { verified: true, email: 'guest@example.com', entitled: false },
        '/redeem': { status: 409, body: { message: 'Code already used.' } }
    })[path]);
    await gate.open();
    await gate.click('Use invitation code');
    for (const digit of '00123456') await gate.click(digit);
    await gate.click('Continue with invitation');
    await gate.verify();
    assert.equal(gate.input('One-use VR invitation code').value, '00123456');
    assert.ok(gate.button('Redeem invitation — no payment'));
    assert.equal(gate.button('Send verification code'), undefined);
    assert.match(gate.status(), /already used/);
    assert.equal(gate.window.VRPayment.hasEntitlement(), false);
});

test('restoring an already entitled email does not consume the staged invitation', async () => {
    const gate = loadPaymentGate(path => ({
        '/entitlement': fresh,
        '/recovery/start': { challenge: 'challenge' },
        '/recovery/verify': { ...registered, email: 'guest@example.com' }
    })[path]);
    await gate.open();
    await gate.click('Use invitation code');
    for (const digit of '00123456') await gate.click(digit);
    await gate.click('Continue with invitation');
    await gate.verify();
    assert.equal(gate.requests.some(request => request.path === '/redeem'), false);
    assert.match(gate.status(), /invitation was not used/);
});

test('checkout preserves €1.99 and excludes duplicate or concurrent submissions', async () => {
    let release;
    const gate = loadPaymentGate(async path => path === '/checkout'
        ? new Promise(resolve => { release = () => resolve({ url: 'https://checkout.stripe.com/test' }); }) : fresh);
    await gate.open();
    gate.input('Email for your receipt').value = 'user@example.com';
    const pending = gate.click('Buy VR access — €1.99');
    assert.equal(gate.button('Send verification code').disabled, true);
    await gate.click('Buy VR access — €1.99');
    assert.equal(gate.requests.filter(r => r.path === '/checkout').length, 1);
    release(); await pending;
    assert.equal(gate.window.location.assigned, 'https://checkout.stripe.com/test');
});

test('occupied lease denial does not enter VR; revocation exits and releases on the 20-second renew', async () => {
    let denied = true, exits = 0;
    const reasons = [];
    const gate = loadPaymentGate(path => {
        if (path === '/entitlement') return registered;
        if (path === '/vr/acquire') return denied
            ? { status: 409, body: { message: 'Another device is in VR.' } }
            : { active: true, expiresAt: 160000, expiresInMs: 60000 };
        if (path === '/vr/renew') return { status: 403, body: { message: 'Device revoked.' } };
        return {};
    });
    await gate.open();
    assert.equal(gate.requests.some(r => r.path === '/vr/acquire'), false);
    await gate.click('Prepare VR');
    assert.match(gate.status(), /Another device/);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    denied = false; await gate.click('Prepare VR');
    gate.window.VRPayment.setXRHandlers(async () => { exits++; }, reason => reasons.push(reason));
    gate.window.VRPayment.onXRStateChange(true);
    assert.equal([...gate.timers.values()].find(t => t.interval).delay, 20000);
    await gate.tick(true);
    assert.equal(exits, 1);
    assert.ok(reasons.includes('Device revoked.'));
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    assert.equal(gate.timers.size, 0);
    assert.ok(gate.requests.some(r => r.path === '/vr/release'));
});

test('network errors cannot continue past expiry; XR exit and pagehide release with scoped timer cleanup', async () => {
    for (const exit of ['expiry', 'state', 'pagehide']) {
        let exits = 0;
        const gate = loadPaymentGate(path => {
            if (path === '/entitlement') return registered;
            if (path === '/vr/acquire') return { active: true, expiresAt: 160000, expiresInMs: 60000 };
            if (path === '/vr/renew') throw new Error('offline');
            return {};
        });
        await gate.open(); await gate.click('Prepare VR');
        gate.window.VRPayment.setXRHandlers(async () => { exits++; }, () => {});
        gate.window.VRPayment.onXRStateChange(true);
        if (exit === 'expiry') {
            await gate.tick(true);
            assert.equal(exits, 0);
            gate.setNow(160001);
            await gate.tick(false);
            assert.equal(exits, 1);
        } else if (exit === 'state') gate.window.VRPayment.onXRStateChange(false);
        else gate.events.pagehide();
        assert.equal(gate.window.VRPayment.canEnterVR(), false);
        assert.equal(gate.timers.size, 0);
        const release = gate.requests.find(r => r.path === '/vr/release');
        assert.ok(release);
        assert.equal(release.options.keepalive, exit === 'pagehide');
    }
});

test('an entitlement refresh revoking the device exits XR instead of only stopping renewals', async () => {
    let deviceRegistered = true, exits = 0;
    const gate = loadPaymentGate(path => path === '/entitlement'
        ? { ...registered, deviceRegistered }
        : path === '/vr/acquire' ? { active: true, expiresAt: 160000, expiresInMs: 60000 } : {});
    await gate.open(); await gate.click('Prepare VR');
    gate.window.VRPayment.setXRHandlers(async () => { exits++; }, () => {});
    gate.window.VRPayment.onXRStateChange(true);
    deviceRegistered = false;
    await gate.window.VRPayment.refreshEntitlement();
    assert.equal(exits, 1);
    assert.equal(gate.window.VRPayment.canEnterVR(), false);
    assert.equal(gate.timers.size, 0);
});

test('disposal removes its stored global handler, UI, lease and timers', async () => {
    const gate = loadPaymentGate(path => path === '/entitlement'
        ? registered : path === '/vr/acquire' ? { active: true, expiresAt: 160000, expiresInMs: 60000 } : {});
    await gate.open(); await gate.click('Prepare VR');
    gate.window.VRPayment.onXRStateChange(true);
    gate.window.VRPayment.dispose();
    assert.equal(gate.events.pagehide, undefined);
    assert.equal(gate.timers.size, 0);
    assert.equal(gate.elements.every(element => element.removed), true);
    assert.equal(gate.requests.find(r => r.path === '/vr/release').options.keepalive, true);
});

test('lease deadlines ignore forward/backward wall-clock skew and failed renewals never extend them', async () => {
    for (const wallClock of [1, 9000000000000]) {
        let exits = 0;
        const gate = loadPaymentGate(path => {
            if (path === '/entitlement') return registered;
            if (path === '/vr/acquire') {
                gate.setNow(110000);
                return { active: true, expiresAt: wallClock + 90000, expiresInMs: 90000 };
            }
            if (path === '/vr/renew') throw new Error('Network unavailable');
            return {};
        });
        gate.setWallNow(wallClock);
        await gate.open(); await gate.click('Prepare VR');
        assert.equal(gate.window.VRPayment.canEnterVR(), true);
        assert.equal([...gate.timers.values()].find(timer => !timer.interval).delay, 80000, 'request elapsed time is subtracted');
        gate.window.VRPayment.setXRHandlers(async () => { exits++; }, () => {});
        gate.window.VRPayment.onXRStateChange(true);
        gate.setWallNow(wallClock === 1 ? 9000000000000 : 1);
        gate.setNow(180000);
        await gate.tick(true);
        assert.equal(gate.window.VRPayment.canEnterVR(), true);
        gate.setNow(190001);
        assert.equal(gate.window.VRPayment.canEnterVR(), false);
        await gate.tick(false);
        assert.equal(exits, 1);
        assert.equal(gate.timers.size, 0);
    }
});

test('missing, invalid or exhausted lease duration is rejected without relying on expiresAt', async () => {
    for (const expiresInMs of [undefined, -1, 90001, '90000', 1000]) {
        const gate = loadPaymentGate(path => {
            if (path === '/entitlement') return registered;
            if (path === '/vr/acquire') {
                gate.setNow(102000);
                return { active: true, expiresAt: 9000000000000, expiresInMs };
            }
            return {};
        });
        await gate.open(); await gate.click('Prepare VR');
        assert.equal(gate.window.VRPayment.canEnterVR(), false);
        assert.match(gate.status(), /not confirmed/);
    }
});

test('dialog preflight locks controls and preserves email; delayed challenge and reopen cannot race verification', async () => {
    let finishCheck, finishChallenge, checks = 0;
    const gate = loadPaymentGate(path => {
        if (path === '/entitlement') {
            checks++;
            return new Promise(resolve => { finishCheck = () => resolve(fresh); });
        }
        if (path === '/recovery/start') return new Promise(resolve => {
            finishChallenge = () => resolve({ challenge: 'slow-challenge', message: 'Check your inbox.' });
        });
        if (path === '/recovery/verify') return { verified: true, email: 'guest@example.com', entitled: false, deviceRegistered: false };
        return {};
    });
    gate.window.VRPayment.showGate();
    assert.equal(gate.button('Send verification code').disabled, true);
    await gate.click('Send verification code');
    assert.equal(gate.requests.filter(request => request.path === '/recovery/start').length, 0);
    finishCheck(); await gate.window.VRPayment.refreshEntitlement();
    assert.equal(gate.button('Send verification code').disabled, false);
    const email = gate.input('Email for access recovery');
    email.value = 'guest@example.com';
    email.listeners.input();
    const pendingRefresh = gate.window.VRPayment.refreshEntitlement();
    finishCheck(); await pendingRefresh;
    assert.equal(gate.input('Email for access recovery').value, 'guest@example.com');
    const sending = gate.click('Send verification code');
    assert.equal(gate.button('Verify email').disabled, true);
    gate.window.VRPayment.showGate();
    await gate.window.VRPayment.refreshEntitlement();
    assert.equal(checks, 2, 'reopening during a mutation must not launch a competing preflight');
    finishChallenge(); await sending;
    assert.equal(gate.button('Verify email').disabled, false);
    gate.input('Eight-digit email verification code').value = '12345678';
    await gate.click('Verify email');
    assert.deepEqual(gate.requests.find(request => request.path === '/recovery/verify').body,
        { challenge: 'slow-challenge', code: '12345678' });
    assert.ok(gate.input('One-use VR invitation code'));
});

test('VR entry checks the prepared lease synchronously and keeps enterXRAsync in the original click', async () => {
    for (const modern of [false, true]) {
        const calls = [];
        let allowed = false, observer;
        const window = { VRPayment: {
            hasEntitlement: () => modern || allowed, ...(modern ? { canEnterVR: () => allowed } : {}),
            showGate: () => calls.push('gate'), onXRStateChange: value => calls.push(value)
        } };
        const button = { listeners: {}, classList: { toggle() {} }, addEventListener(type, fn) { this.listeners[type] = fn; } };
        const baseExperience = {
            onStateChangedObservable: { add(fn) { observer = fn; } },
            enterXRAsync() { calls.push('enterXR'); return Promise.resolve(); }
        };
        const context = vm.createContext({
            window, document: { getElementById: () => button },
            navigator: { xr: { isSessionSupported: () => Promise.resolve(true) } },
            VRClubAnimationFinish: class {},
            setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {},
            Promise, BABYLON: { WebXRState: { IN_XR: 2, NOT_IN_XR: 0 } }
        });
        vm.runInContext(readFileSync(join(ROOT, 'js', 'club', '10-ui.js'), 'utf8'), context);
        const club = { isInVRMode: false, modelLoadPromise: Promise.resolve(), scene: { whenReadyAsync: () => Promise.resolve() } };
        window.VRClubUI.prototype._setupVRButton.call(club, { baseExperience });
        await button.listeners.click();
        assert.deepEqual(calls, ['gate']);
        allowed = true;
        const pending = button.listeners.click();
        assert.deepEqual(calls, ['gate', 'enterXR']);
        await pending;
        observer(2); observer(0);
        assert.deepEqual(calls.slice(-2), [true, false]);
    }
});
