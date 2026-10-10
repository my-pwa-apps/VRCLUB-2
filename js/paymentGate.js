'use strict';

// All access credentials stay in HttpOnly cookies; only this tab's lease id lives in memory.
(function installPaymentGate() {
    const development = ['nocturnedev.mitwee.nl', 'nocturne-dev.pages.dev'].includes(window.location.hostname);
    if (development) {
        window.VRPayment = Object.freeze({
            apiOrigin: null, hasEntitlement: () => true, canEnterVR: () => true,
            refreshEntitlement: async () => ({ entitled: true }),
            showGate: () => window.vrClub?.showErrorMessage?.('Development site: VR access is free. Purchases and production access are disabled.'),
            onXRStateChange() {}, setXRHandlers() {}, releaseLease: async () => {}, dispose() {}
        });
        return;
    }
    const apiOrigin = (window.NOCTURNE_PAYMENT_API || 'https://api.mitwee.nl').replace(/\/$/, '');
    const tab = crypto.randomUUID();
    let access = { entitled: false, verified: false, deviceRegistered: false, devices: [] };
    let dialog, content, status, close, opener, checkPromise, checkError, challenge, nextFocus;
    let accessRevision = 0, recoveryEmail = '', recoveryCode = '';
    let invitationCode = '', invitationStep = null;
    let busy = false, inXR = false, leaseExpires = 0, leaseGeneration = 0;
    let renewTimer, expiryTimer, exiting = false;
    let exitXR = () => window.vrClub?.vrHelper?.baseExperience?.exitXRAsync();
    let notify = message => window.vrClub?.showErrorMessage?.(message);

    async function api(path, options = {}) {
        const response = await fetch(`${apiOrigin}/payments${path}`, {
            credentials: 'include', ...options,
            headers: { 'content-type': 'application/json', ...(options.headers || {}) }
        });
        const body = await response.json();
        if (!response.ok) {
            const error = new Error(body.message || body.error || `Access service error (${response.status})`);
            error.status = response.status;
            error.body = body;
            throw error;
        }
        return body;
    }
    const post = (path, body, options) => api(path, { method: 'POST', body: JSON.stringify(body), ...options });
    function setStatus(message, error = false) {
        if (!status) return;
        status.textContent = message;
        status.className = `payment-status${error ? ' error' : ''}`;
    }
    function update(result) {
        access = { ...access, ...result };
        if (!access.verified || !access.deviceRegistered || !access.entitled || access.recoveryRequired) {
            if (leaseExpires) {
                void endXR('VR access changed. Verify your email and registered device before preparing VR again.');
                void releaseLease();
            }
        }
    }
    function ready() {
        return access.entitled && access.verified && !access.recoveryRequired && access.deviceRegistered;
    }
    function message() {
        if (!access.verified || access.recoveryRequired) return access.entitled
            ? 'Your access is saved. Verify your email to keep it and manage devices; do not pay again.'
            : 'Use an invitation code, buy VR access, or restore access with your email.';
        if (!access.entitled) return `Email verified: ${access.email || ''}. Redeem an invitation or buy access.`;
        if (!access.deviceRegistered) return 'Access restored. Register this browser as one of your two devices.';
        if (window.vrClub?._vrAvailable === false) return 'Your access is saved. Open NOCTURNE on a VR-compatible device to enter VR.';
        return leaseExpires > performance.now()
            ? 'VR prepared. Close this dialog, then press Enter VR before the preparation expires.'
            : 'Access ready. Prepare VR here, then close and press Enter VR. Only one immersive session can run per account.';
    }
    function element(tag, text, className) {
        const el = document.createElement(tag);
        if (text) el.textContent = text;
        if (className) el.className = className;
        return el;
    }
    function input(label, type = 'text') {
        const wrapper = element('label', label);
        const field = element('input', '', 'audio-input');
        field.type = type;
        field.setAttribute('aria-label', label);
        wrapper.append(field);
        content.append(wrapper);
        return field;
    }
    function validEmail(field) {
        field.disabled = false;
        const valid = !!field.value.trim() && field.reportValidity();
        field.disabled = busy;
        return valid;
    }
    function button(label, action, parent = content) {
        const el = element('button', label, 'audio-button');
        el.type = 'button';
        parent.append(el);
        el.addEventListener('click', () => run(action));
        return el;
    }
    function primaryButton(label, action) {
        const control = button(label, action);
        control.className += ' payment-primary';
        return control;
    }
    function numericInput(label, value, save) {
        const field = input(label);
        field.inputMode = 'numeric';
        field.readOnly = true;
        field.maxLength = 8;
        field.pattern = '[0-9]{8}';
        field.value = value;
        const pad = element('div', '', 'payment-keypad');
        pad.setAttribute('role', 'group');
        pad.setAttribute('aria-label', `${label} keypad`);
        const write = next => {
            if (busy || checkPromise) return;
            field.value = next.slice(0, 8);
            save(field.value);
        };
        for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Backspace']) {
            const control = element('button', key, 'audio-button');
            control.type = 'button';
            control.addEventListener('click', () => write(key === 'Clear' ? ''
                : key === 'Backspace' ? field.value.slice(0, -1) : field.value + key));
            pad.append(control);
        }
        const edit = event => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (/^[0-9]$/.test(event.key)) { event.preventDefault(); write(field.value + event.key); }
            else if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                write(event.key === 'Delete' ? '' : field.value.slice(0, -1));
            } else if (event.key.length === 1) event.preventDefault();
        };
        field.addEventListener('keydown', edit);
        pad.addEventListener('keydown', edit);
        field.addEventListener('paste', event => {
            event.preventDefault();
            const text = (event.clipboardData?.getData('text') || '').replace(/[\s-]/g, '');
            if (!/^[0-9]{1,8}$/.test(text)) { setStatus('Paste numbers only, at most eight digits.', true); return; }
            write(text);
        });
        content.append(pad);
        return field;
    }
    async function registerAvailableDevice() {
        if (access.deviceRegistered || (access.devices || []).length >= 2) return;
        setStatus('Access saved. Registering this browser…');
        const result = await post('/devices/register', { name: 'My VR browser' });
        if (result.deviceRegistered !== true) throw new Error('Your access is saved, but device registration was not confirmed. Register this device to continue.');
        update(result);
    }
    async function activateInvitation(code) {
        invitationCode = code;
        const result = await post('/redeem', { code });
        if (result.entitled !== true) throw new Error('Invitation access was not confirmed.');
        update(result);
        invitationCode = '';
        invitationStep = null;
        render();
        await registerAvailableDevice();
        render();
        setStatus(ready() && window.vrClub?._vrAvailable !== false
            ? 'Invitation activated. Next: press Prepare VR below.' : message());
        const prepare = [...content.querySelectorAll('button')].find(control => control.textContent === 'Prepare VR');
        nextFocus = prepare;
    }
    function invitationEntry() {
        content.append(element('p', 'Step 1 of 3: enter your invitation.'));
        const field = numericInput('One-use VR invitation code', invitationCode, value => { invitationCode = value; });
        field.autocomplete = 'off';
        content.append(element('p', 'Activation verifies your email for recovery and registers this browser if a device slot is free. The code is used only after verification succeeds.'));
        primaryButton(access.verified && !access.recoveryRequired ? 'Redeem invitation — no payment' : 'Continue with invitation', async () => {
            const code = field.value.replace(/[\s-]/g, '').toUpperCase();
            if (!/^[0-9]{8}$/.test(code)) {
                throw new Error('Enter your invitation code: all eight digits.');
            }
            invitationCode = code;
            if (access.verified && !access.recoveryRequired) await activateInvitation(code);
            else {
                invitationStep = 'email';
                render();
                setStatus('Invitation saved for this flow. Verify your email to activate it; it has not been used yet.');
            }
        });
        button('Cancel invitation', () => { invitationStep = null; invitationCode = ''; render(); setStatus(message()); });
    }
    function syncControls() {
        if (!content) return;
        for (const control of content.querySelectorAll('button, input')) {
            control.disabled = busy || !!checkPromise || (control.textContent === 'Verify email' && !challenge);
        }
    }
    async function run(action) {
        if (busy || checkPromise) return;
        busy = true;
        accessRevision++;
        dialog?.setAttribute('aria-busy', 'true');
        for (const control of content.querySelectorAll('button, input')) control.disabled = true;
        try { await action(); }
        catch (error) {
            if (error.body?.error === 'verification_required') {
                update({ verified: false, deviceRegistered: false });
                challenge = null;
                invitationStep = 'email';
                render();
            } else if (Array.isArray(error.body?.devices)) {
                access.devices = error.body.devices;
                render();
            } else if (invitationStep === 'code') render();
            setStatus(error.message, true);
        } finally {
            busy = false;
            dialog?.setAttribute('aria-busy', 'false');
            syncControls();
            if (nextFocus) {
                nextFocus.focus();
                nextFocus.scrollIntoView?.({ block: 'nearest' });
                nextFocus = null;
            }
        }
    }
    function confirmAction(text, action) {
        content.replaceChildren(element('p', text));
        button('Confirm', action);
        button('Cancel', () => { render(); setStatus(message()); });
    }
    function render() {
        content.replaceChildren();
        content.scrollTop = 0;
        if (!access.entitled && invitationStep === 'code') {
            invitationEntry();
            syncControls();
            return;
        }
        if (!access.entitled && !invitationStep && (!access.verified || access.recoveryRequired)) {
            button('Use invitation code', () => { invitationStep = 'code'; render(); setStatus('Enter your eight-digit invitation using the keypad.'); });
        }
        if (!access.verified || access.recoveryRequired) {
            const guided = invitationStep === 'email';
            content.append(element('p', invitationStep === 'email'
                ? challenge
                    ? `Step 3 of 3: check ${recoveryEmail.trim()} for your email code. Enter it below, then press Verify email. Check spam if you cannot find it.`
                    : 'Step 2 of 3: enter your email, then press Send verification code. This email will let you recover your access later.'
                : 'Use the email from your purchase to link paid access. To activate an invitation, choose Use invitation code above. Recovery emails do not guarantee access.'));
            const email = input('Email for access recovery', 'email');
            email.autocomplete = 'email';
            email.required = true;
            email.value = recoveryEmail;
            email.addEventListener('input', () => {
                if (challenge && email.value !== recoveryEmail) {
                    challenge = null;
                    recoveryCode = '';
                    code.value = '';
                    syncControls();
                    setStatus('Email changed. Request a new verification code.');
                }
                recoveryEmail = email.value;
            });
            const send = primaryButton('Send verification code', async () => {
                if (!validEmail(email)) return;
                recoveryEmail = email.value;
                challenge = null;
                setStatus('Requesting your email verification code…');
                const result = await post('/recovery/start', {
                    email: email.value.trim(), intent: access.entitled || access.recoveryRequired ? 'bind' : 'restore'
                });
                challenge = result.challenge;
                if (!challenge) throw new Error('No verification challenge returned. Please try again.');
                if (guided) {
                    render();
                    setStatus(`Email sent. Check ${recoveryEmail.trim()} and enter the code below.`);
                    nextFocus = [...content.querySelectorAll('input')].find(field => field.autocomplete === 'one-time-code');
                    return;
                }
                setStatus(result.message || 'If eligible, a verification email has been sent. Check your inbox.');
                code.focus();
            });
            if (guided && challenge) {
                email.parentElement.hidden = true;
                send.hidden = true;
                button('Change email or resend code', () => {
                    challenge = null; recoveryCode = ''; render();
                    setStatus('Enter your email and send a new verification code.');
                });
            }
            const code = numericInput('Eight-digit email verification code', recoveryCode, value => { recoveryCode = value; });
            code.autocomplete = 'one-time-code';
            const codeHelp = element('p', 'The email code expires after 10 minutes. Enter it with the keypad above.');
            content.append(codeHelp);
            const verify = primaryButton('Verify email', async () => {
                if (!challenge || !/^\d{8}$/.test(code.value.trim())) throw new Error('Request a code, then enter all eight digits.');
                const result = await post('/recovery/verify', { challenge, code: code.value.trim() });
                if (result.verified !== true) throw new Error('Email verification was not confirmed.');
                update({ ...result, recoveryRequired: false });
                challenge = null;
                recoveryCode = '';
                if (invitationStep === 'email' && invitationCode) {
                    if (access.entitled) {
                        invitationCode = '';
                        invitationStep = null;
                        render();
                        await registerAvailableDevice();
                        render();
                        setStatus(`Your email already has access. Your invitation was not used. ${message()}`);
                    } else {
                        invitationStep = 'code';
                        await activateInvitation(invitationCode);
                    }
                } else { render(); setStatus(message()); }
            });
            if (guided && !challenge) {
                code.parentElement.hidden = true;
                code.parentElement.nextSibling.hidden = true;
                codeHelp.hidden = true;
                verify.hidden = true;
            }
            if (invitationStep === 'email') button('Change invitation code', () => {
                invitationStep = 'code'; render(); setStatus('Your invitation has not been used yet.');
            });
        } else {
            content.append(element('p', `Verified email: ${access.email || 'verified'}`));
            if (!access.entitled) {
                invitationEntry();
            }
            if (access.entitled) {
                content.append(element('p', 'Maximum two registered devices and one active immersive session. A device is this browser; clearing its cookies may require registering again.'));
                const list = element('ul', '', 'payment-devices');
                for (const device of access.devices || []) {
                    const row = element('li');
                    row.append(element('span', `${device.name || 'Browser'}${device.current ? ' (this device)' : ''}`));
                    if (device.created_at) {
                        row.append(element('small', `Registered: ${device.created_at}`));
                    }
                    button(`Remove ${device.name || 'device'}`, () => confirmAction(
                        `Remove ${device.name || 'this device'}${device.current ? ' (this browser)' : ''}? Its active VR session will end and it must register again.`,
                        async () => {
                            const result = await post('/devices/remove', { id: device.id });
                            const currentRemoved = device.current || result.currentRemoved;
                            if (currentRemoved) {
                                void releaseLease();
                                await endXR('This device was removed. Register it again before entering VR.');
                            }
                            update({ ...result, ...(currentRemoved ? { deviceRegistered: false } : {}) });
                            render(); setStatus(message());
                        }), row);
                    list.append(row);
                }
                content.append(list);
                button('Refresh devices', async () => {
                    update(await api('/devices'));
                    render(); setStatus(message());
                });
                if (!access.deviceRegistered) {
                    const name = input('Name for this device');
                    name.maxLength = 80;
                    name.value = 'My VR browser';
                    const register = async replaceDevice => {
                        const result = await post('/devices/register', { name: name.value.trim() || 'My VR browser', ...(replaceDevice ? { replaceDevice } : {}) });
                        if (result.deviceRegistered !== true) throw new Error('Device registration was not confirmed.');
                        update(result); render(); setStatus(message());
                    };
                    if ((access.devices || []).length < 2) button('Register this device', () => register());
                    else {
                        content.append(element('p', 'Both device slots are used. Explicitly replace one to use this browser; its sessions will be invalidated.'));
                        for (const device of access.devices) button(`Replace ${device.name || 'device'}`, () => confirmAction(
                            `Replace ${device.name || 'this device'} with this browser? The old device loses access and any active VR session ends.`,
                            () => register(device.id)));
                    }
                } else if (window.vrClub?._vrAvailable === false) {
                    content.append(element('p', 'Your access is saved. To use VR, open NOCTURNE in your headset browser or on a VR-compatible device.'));
                } else primaryButton('Prepare VR', async () => {
                    const generation = leaseGeneration;
                    const startedAt = performance.now();
                    let result;
                    try { result = await post('/vr/acquire', { tab }); }
                    catch (error) {
                        if (error.status === 403 || error.status === 409) void releaseLease();
                        throw error;
                    }
                    if (generation !== leaseGeneration) {
                        void post('/vr/release', { tab }, { keepalive: true }).catch(() => {});
                        return;
                    }
                    const deadline = leaseDeadline(result, startedAt);
                    if (result.active !== true || deadline <= performance.now()) {
                        throw new Error('VR preparation was not confirmed. Try again.');
                    }
                    leaseExpires = deadline;
                    scheduleExpiry();
                    setStatus(message());
                    content.replaceChildren(element('h3', 'You are ready for VR'),
                        element('p', '1. Press Close at the top right.'),
                        element('p', '2. Press Enter VR in the club.'));
                    close.focus();
                });
            }
        }
        if (!access.entitled && !invitationStep) {
            content.append(element('p', 'Desktop mode is free. Immersive VR costs €1.99 once, or use an invitation after email verification.'));
            const email = input('Email for your receipt', 'email');
            email.required = true;
            email.autocomplete = 'email';
            button('Buy VR access — €1.99', async () => {
                if (!validEmail(email)) return;
                const result = await post('/checkout', { email: email.value.trim() });
                if (!result.url) throw new Error('Checkout did not return a secure payment URL.');
                window.location.assign(result.url);
            });
        }
        syncControls();
    }
    function hideGate() {
        dialog.hidden = true;
        opener?.focus();
    }
    function ensureDialog() {
        if (dialog) return;
        dialog = element('div', '', 'payment-dialog');
        dialog.hidden = true;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'paymentDialogTitle');
        const card = element('div', '', 'payment-card');
        const header = element('div', '', 'payment-header');
        const title = element('h2', 'Access');
        title.id = 'paymentDialogTitle';
        close = element('button', 'Close', 'payment-close');
        close.type = 'button';
        close.addEventListener('click', hideGate);
        header.append(title, close);
        content = element('div', '', 'payment-content');
        status = element('p', '', 'payment-status');
        status.setAttribute('role', 'status');
        card.append(header, status, content);
        dialog.append(card);
        document.body.append(dialog);
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); hideGate(); }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button, input')].filter(el => !el.disabled && !el.hidden && !el.closest('[hidden]'));
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
    }
    function showGate() {
        ensureDialog();
        opener = document.activeElement;
        dialog.hidden = false;
        if (busy) { close.focus(); return; }
        render();
        setStatus(checkError?.message || (checkPromise ? 'Checking your access…' : message()), !!checkError);
        close.focus();
        if (!checkPromise) void refreshEntitlement();
    }
    async function checkEntitlement(revision) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('payment') === 'success' && params.get('session_id')) {
            const result = await post('/claim', { session_id: params.get('session_id') });
            if (revision !== accessRevision) return;
            update(result);
            window.history.replaceState({}, '', window.location.pathname + window.location.hash);
            showGate();
            return;
        }
        const result = await api('/entitlement');
        if (revision !== accessRevision) return;
        update({ ...result, recoveryRequired: result.recoveryRequired === true });
        if (access.configured === false) throw new Error('Payment access is not configured yet.');
        if (params.get('payment') === 'cancelled') window.history.replaceState({}, '', window.location.pathname + window.location.hash);
    }
    function refreshEntitlement() {
        if (checkPromise) return checkPromise;
        if (busy) return Promise.resolve();
        const revision = accessRevision;
        checkError = null;
        checkPromise = checkEntitlement(revision).catch(error => {
            if (revision !== accessRevision) return;
            checkError = error;
            update({ entitled: false, verified: false, deviceRegistered: false });
        }).finally(() => {
            checkPromise = null;
            if (dialog && !dialog.hidden && !busy) {
                render(); setStatus(checkError?.message || message(), !!checkError);
            }
            syncControls();
        });
        syncControls();
        return checkPromise;
    }
    function stopTimers() {
        clearInterval(renewTimer);
        clearTimeout(expiryTimer);
        renewTimer = expiryTimer = null;
    }
    async function releaseLease(keepalive = false) {
        const held = leaseExpires > 0;
        leaseExpires = 0;
        leaseGeneration++;
        stopTimers();
        if (held) await post('/vr/release', { tab }, { keepalive }).catch(() => {});
    }
    async function endXR(reason) {
        setStatus(reason, true);
        notify(reason);
        if (!inXR || exiting) return;
        exiting = true;
        try { await exitXR(); }
        catch { notify('Access ended. Please exit VR using the headset menu.'); }
        finally {
            exiting = false;
            ensureDialog();
            dialog.hidden = false;
            render();
            setStatus(reason, true);
            close.focus();
        }
    }
    function scheduleExpiry() {
        clearTimeout(expiryTimer);
        expiryTimer = setTimeout(() => {
            if (leaseExpires > performance.now()) { scheduleExpiry(); return; }
            void endXR('VR preparation expired. Open Access and prepare VR again.');
            void releaseLease();
        }, Math.max(0, leaseExpires - performance.now()));
    }
    function leaseDeadline(result, startedAt) {
        // Subtract the whole request round trip, conservatively ignoring server clock skew.
        if (!Number.isFinite(result.expiresInMs) || result.expiresInMs <= 0 || result.expiresInMs > 90000) return 0;
        return startedAt + result.expiresInMs;
    }
    async function renewLease() {
        const generation = leaseGeneration;
        const startedAt = performance.now();
        try {
            const result = await post('/vr/renew', { tab });
            if (generation !== leaseGeneration || !inXR) return;
            const deadline = leaseDeadline(result, startedAt);
            if (deadline <= performance.now()) throw new Error('VR session expired.');
            leaseExpires = deadline;
            scheduleExpiry();
        } catch (error) {
            if (generation !== leaseGeneration) return;
            if (error.status === 403 || error.status === 409 || leaseExpires <= performance.now()) {
                void endXR(error.message);
                void releaseLease();
            } else {
                setStatus('Cannot renew VR access. Reconnecting; VR will end when its lease expires.', true);
                notify('Cannot renew VR access. VR will end if the connection is not restored.');
            }
        }
    }
    function onXRStateChange(active) {
        if (active === inXR) return;
        inXR = active;
        if (!active) { void releaseLease(); return; }
        if (!ready() || leaseExpires <= performance.now()) {
            void endXR('VR access is not prepared. Open Access to prepare it.');
            void releaseLease();
            return;
        }
        renewTimer = setInterval(() => { void renewLease(); }, 20000);
        scheduleExpiry();
    }
    function dispose() {
        window.removeEventListener('pagehide', onPageHide);
        inXR = false;
        void releaseLease(true);
        exitXR = () => {};
        notify = () => {};
        dialog?.remove();
        toggle.remove();
    }
    const onPageHide = () => {
        inXR = false;
        void releaseLease(true);
    };
    window.VRPayment = Object.freeze({
        apiOrigin, hasEntitlement: () => access.entitled,
        canEnterVR: () => !!ready() && leaseExpires > performance.now(),
        refreshEntitlement, showGate, onXRStateChange,
        setXRHandlers(exit, showReason) { exitXR = exit; notify = showReason; },
        releaseLease, dispose
    });
    const toggle = element('button', 'Access', 'payment-toggle');
    toggle.type = 'button';
    toggle.addEventListener('click', showGate);
    document.body.append(toggle);
    window.addEventListener('pagehide', onPageHide);
    void refreshEntitlement();
})();
