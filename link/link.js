'use strict';

// Pairs a VR headset with an account from a phone: pairing code -> verified email -> access (invitation or purchase) -> approve.
// All credentials stay in HttpOnly cookies on the API host; this page keeps only the pairing code (in sessionStorage, so it
// survives the trip to Stripe and back).
(function linkPage() {
    const API = 'https://api.mitwee.nl/payments';
    const CODE_KEY = 'nocturne.linkCode';
    const title = document.getElementById('stepTitle');
    const step = document.getElementById('step');
    const status = document.getElementById('status');
    let access = null;
    let busy = false;

    const api = async (path, body) => {
        const response = await fetch(API + path, {
            credentials: 'include',
            ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.message || data.error || `The service answered ${response.status}.`);
            error.status = response.status;
            error.body = data;
            throw error;
        }
        return data;
    };
    const savedCode = () => { try { return sessionStorage.getItem(CODE_KEY) || ''; } catch (_) { return ''; } };
    const saveCode = code => { try { sessionStorage.setItem(CODE_KEY, code); } catch (_) { /* private mode */ } };
    const clearCode = () => { try { sessionStorage.removeItem(CODE_KEY); } catch (_) { /* private mode */ } };

    const say = (message, error = false) => {
        status.textContent = message || '';
        status.className = `link-status${error ? ' error' : ''}`;
    };
    const el = (tag, text, className) => {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    };
    const field = (label, type, attributes = {}) => {
        const id = `f${Math.random().toString(36).slice(2, 8)}`;
        const input = el('input');
        input.id = id;
        input.type = type;
        Object.assign(input, attributes);
        const wrapper = document.createDocumentFragment();
        const caption = el('label', label);
        caption.htmlFor = id;
        wrapper.append(caption, input);
        return { wrapper, input };
    };
    const action = (label, handler, secondary = false) => {
        const button = el('button', label, secondary ? 'secondary' : '');
        button.type = 'button';
        button.addEventListener('click', async () => {
            if (busy) return;
            busy = true;
            button.disabled = true;
            say('Working…');
            try { await handler(); }
            catch (error) { say(error.message, true); }
            finally { busy = false; button.disabled = false; }
        });
        return button;
    };
    const show = (heading, ...nodes) => {
        title.textContent = heading;
        step.replaceChildren(...nodes);
        title.focus();
    };
    const digits = value => String(value || '').replace(/\D/g, '');
    const groups = code => `${code.slice(0, 4)} ${code.slice(4)}`;

    function codeStep() {
        const { wrapper, input } = field('Code shown in your headset', 'text', {
            inputMode: 'numeric', autocomplete: 'off', maxLength: 9, placeholder: '0000 0000'
        });
        input.classList.add('code');
        input.value = groups(savedCode());
        show('Link your headset',
            el('p', 'Open NOCTURNE in your headset. It shows an eight-digit code. Enter it here to give that headset access to your account.'),
            wrapper,
            action('Continue', async () => {
                const code = digits(input.value);
                if (code.length !== 8) throw new Error('Enter all eight digits shown in the headset.');
                saveCode(code);
                say('');
                await next();
            }));
        input.focus();
    }

    function emailStep() {
        const { wrapper, input } = field('Your email', 'email', { autocomplete: 'email', placeholder: 'you@example.com' });
        show('Verify your email',
            el('p', 'We send an eight-digit code to confirm the account that owns VR access. Use the email you bought with or were invited under.'),
            wrapper,
            action('Email me a code', async () => {
                const email = input.value.trim();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Enter a valid email address.');
                const { challenge } = await api('/recovery/start', { email, intent: 'restore' });
                verifyStep(challenge, email);
            }),
            action('Use a different code', () => { clearCode(); codeStep(); say(''); }, true));
        input.focus();
    }

    function verifyStep(challenge, email) {
        const { wrapper, input } = field('Email code', 'text', { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 9, placeholder: '0000 0000' });
        input.classList.add('code');
        show('Enter the email code',
            el('p', `We sent an eight-digit code to ${email}. It works once and expires in ten minutes.`),
            wrapper,
            action('Verify', async () => {
                const code = digits(input.value);
                if (code.length !== 8) throw new Error('Enter all eight digits from the email.');
                access = await api('/recovery/verify', { challenge, code });
                say('');
                await next();
            }),
            action('Use a different email', emailStep, true));
        say('Check your email for the code.');
        input.focus();
    }

    function accessStep() {
        const { wrapper, input } = field('Invitation code', 'text', { inputMode: 'numeric', autocomplete: 'off', maxLength: 9, placeholder: '0000 0000' });
        input.classList.add('code');
        show('Get VR access',
            el('p', `${access.email} does not have VR access yet. Redeem an invitation or buy it once; desktop stays free.`),
            wrapper,
            action('Redeem invitation', async () => {
                const code = digits(input.value);
                if (code.length !== 8) throw new Error('Enter the eight-digit invitation code.');
                access = await api('/redeem', { code });
                say('');
                await next();
            }),
            action('Buy VR access (€1.99)', async () => {
                const { url } = await api('/checkout', { email: access.email, returnTo: 'link' });
                if (!url) throw new Error('Checkout did not return a payment page.');
                window.location.assign(url);
            }, true));
    }

    function confirmStep(replaceChoices) {
        const code = savedCode();
        const name = field('Name for this headset', 'text', { maxLength: 60, value: 'Meta Quest' });
        const nodes = [
            el('p', `Link the headset showing ${groups(code)} to ${access.email}?`),
            el('p', 'Only continue if you started this on your own headset a moment ago. Linking gives that headset VR access on your account.', 'link-warning'),
            name.wrapper
        ];
        const link = replaceDevice => action(replaceDevice ? 'Replace it and link this headset' : 'Link this headset', async () => {
            const result = await api('/link/approve', {
                code, name: name.input.value.trim() || 'Meta Quest', ...(replaceDevice ? { replaceDevice } : {})
            }).catch(error => {
                if (error.status === 409 && error.body && error.body.error === 'device_limit' && !replaceDevice) {
                    confirmStep(error.body.devices);
                    say(error.message, true);
                    return null;
                }
                throw error;
            });
            if (!result) return;
            clearCode();
            show('Headset linked', el('p', 'Your headset will enter NOCTURNE by itself in a few seconds. You can close this page.', 'link-done'),
                el('p', `Linked to ${result.email || access.email}. You can remove devices later from the Access menu in the club.`, 'link-note'));
            say('');
        });
        if (replaceChoices && replaceChoices.length) {
            nodes.push(el('p', 'Both device slots are in use. Choose one to replace; it loses access immediately.', 'link-note'));
            for (const device of replaceChoices) {
                const button = link(device.id);
                button.textContent = `Replace ${device.name || 'a device'}`;
                nodes.push(button);
            }
        } else {
            nodes.push(link());
        }
        nodes.push(action('Use a different code', () => { clearCode(); codeStep(); say(''); }, true));
        show('Confirm the link', ...nodes);
    }

    async function claimCheckout() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        if (params.get('payment') === 'success' && sessionId) {
            say('Confirming your payment…');
            access = await api('/claim', { session_id: sessionId });
            window.history.replaceState({}, '', window.location.pathname);
        } else if (params.get('payment') === 'cancelled') {
            window.history.replaceState({}, '', window.location.pathname);
            say('Payment cancelled. You were not charged.');
        }
    }

    // Decides the next step from what is known: a code, a verified email, an entitled account.
    async function next() {
        if (!savedCode()) { codeStep(); return; }
        if (!access || !access.verified) {
            try { access = await api('/devices'); }
            catch (error) { if (error.status !== 401) throw error; access = null; }
        }
        if (!access || !access.verified) { emailStep(); return; }
        if (!access.entitled) { accessStep(); return; }
        confirmStep();
    }

    (async () => {
        try {
            const fromUrl = digits(new URLSearchParams(window.location.search).get('code'));
            if (fromUrl.length === 8) {
                saveCode(fromUrl);
                window.history.replaceState({}, '', window.location.pathname);
            }
            await claimCheckout().catch(error => { say(error.message, true); });
            await next();
        } catch (error) {
            codeStep();
            say(error.message, true);
        }
    })();
}());
