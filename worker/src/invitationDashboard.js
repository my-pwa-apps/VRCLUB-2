export const dashboardHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>NOCTURNE invitation administration</title>
<style nonce="NONCE_PLACEHOLDER">
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#10131b;color:#f4f7ff}
body{max-width:70rem;margin:auto;padding:1.5rem}h1,h2{line-height:1.2}
section{border:1px solid #455065;border-radius:.7rem;padding:1rem;margin:1rem 0}
form{display:flex;gap:1rem;align-items:end;flex-wrap:wrap}label{display:grid;gap:.4rem}
input,button{font:inherit;padding:.6rem;border-radius:.3rem;border:1px solid #66758b}
button{cursor:pointer;background:#1c5362;color:white}button:disabled{opacity:.5;cursor:default}
input{max-width:100%;box-sizing:border-box}p{line-height:1.5}.error{color:#ffaaaa}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.6rem;border-bottom:1px solid #455065;vertical-align:top}
pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:.8rem;background:#202a38;user-select:all}
small{display:block;color:#b5c4d9}#status{min-height:1.5em}[hidden]{display:none!important}
</style><script src="/admin/invitations/script.js" defer></script></head>
<body><h1>NOCTURNE invitations</h1><p id="identity">Checking administrator identity...</p>
<p>Each invitation is eight digits, numbers only. In the club, choose Use invitation code and enter it with the keypad. The guided flow then verifies the recipient's email and activates the code once. Access belongs to that verified email and can be restored on up to two registered devices.</p>
<section><h2>Issue invitations</h2>
<form id="issue"><label>Number (1–20)<input id="count" type="number" min="1" max="20" value="1" required></label>
<label>Private label (optional)<input id="label" maxlength="100" placeholder="Person or occasion"></label>
<button id="issueButton" type="submit">Generate invitations</button></form>
<p>The label is for your records, not an email restriction. Codes can be forwarded before redemption.</p>
<div id="newCodes" hidden><h3>Save these codes now</h3>
<p>Codes are shown only in this response. Copy them privately before leaving or generating another batch. They cannot be recovered from the database.</p>
<pre id="codes"></pre><button id="copyCodes" type="button">Copy codes</button>
<button id="clearCodes" type="button">Hide and clear codes</button></div></section>
<p id="status" role="status" aria-live="polite"></p>
<section><h2>Issued invitations</h2><button id="refresh" type="button">Refresh / first page</button>
<p>Revocation cancels an unused code or its redeemed grant. An active VR session rechecks access every 20 seconds; another valid purchase or grant still permits access.</p>
<div class="table-wrap"><table><thead><tr><th>Identifier / label</th><th>Issued</th><th>State</th><th>Action</th></tr></thead><tbody id="rows"></tbody></table></div>
<p id="empty" hidden>No invitations on this page.</p><button id="next" type="button" hidden>Next page</button></section>
<section id="confirm" hidden><h2>Confirm revocation</h2><p id="confirmText"></p>
<button id="confirmRevoke" type="button">Revoke this invitation</button> <button id="cancelRevoke" type="button">Cancel</button></section>
<section><h2>Recovery support</h2>
<p>Customers restore purchases by verifying their receipt email. Never grant access from a screenshot alone. For an old anonymous invitation whose cookies were lost, establish the recipient independently from your records, then link the existing grant to their verified email. This invalidates its old anonymous cookie and does not create an extra grant.</p>
<form id="supportLookup"><label>Customer email<input id="supportEmail" type="email" maxlength="254" required></label><button type="submit">Show recovery history</button></form>
<pre id="supportResult"></pre>
<form id="linkLegacy"><label>Full invitation identifier (64 characters)<input id="legacyHash" minlength="64" maxlength="64" required></label>
<label>Verified recipient email<input id="legacyEmail" type="email" maxlength="254" required></label><button type="submit">Review legacy recovery</button></form>
<div id="legacyConfirm" hidden><p id="legacyConfirmText"></p><button id="legacyAccept" type="button">Confirm verified recipient and link grant</button><button id="legacyCancel" type="button">Cancel</button></div></section>
<p><a href="/cdn-cgi/access/logout">Sign out of Cloudflare Access</a></p>
</body></html>`;

export const dashboardScript = String.raw`'use strict';
(() => {
    const el = id => document.getElementById(id);
    let next = null, pendingHash = null, busy = false;
    function status(message, error = false) { el('status').textContent = message; el('status').className = error ? 'error' : ''; }
    function lock(value) {
        busy = value;
        for (const button of document.querySelectorAll('button')) button.disabled = value;
    }
    async function api(path, body) {
        const response = await fetch('/admin/invitations/' + path, {
            credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
        });
        const type = response.headers.get('content-type') || '';
        if (!type.includes('application/json')) throw new Error('Administrator session expired. Reload and sign in to Cloudflare Access.');
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Administration request failed (' + response.status + ').');
        return result;
    }
    function cell(row, text) { const td = document.createElement('td'); td.textContent = text; row.append(td); return td; }
    async function load(before = null) {
        const result = await api('data' + (before ? '?before=' + encodeURIComponent(before) : ''));
        el('identity').textContent = 'Administrator: ' + result.actor;
        el('rows').replaceChildren();
        for (const item of result.items) {
            const tr = document.createElement('tr');
            const idCell = cell(tr, item.code_hash.slice(0, 12) + (item.label ? ' — ' + item.label : ''));
            const full = document.createElement('small'); full.textContent = item.code_hash; idCell.append(full);
            cell(tr, item.created_at + '\n' + (item.issued_by || 'Private CLI import'));
            cell(tr, item.revoked_at ? 'Revoked: ' + item.revoked_at + ' by ' + (item.revoked_by || 'owner') :
                item.redeemed_at ? 'Redeemed: ' + item.redeemed_at : 'Unused');
            const action = cell(tr, '');
            if (!item.revoked_at) {
                const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Revoke';
                button.disabled = busy;
                button.addEventListener('click', () => {
                    if (busy) return;
                    pendingHash = item.code_hash;
                    el('confirmText').textContent = 'Revoke ' + (item.label || item.code_hash.slice(0, 12)) + '? This cannot be undone.';
                    el('confirm').hidden = false; el('confirmRevoke').focus();
                });
                action.append(button);
            }
            el('rows').append(tr);
        }
        next = result.next;
        el('next').hidden = !next;
        el('empty').hidden = result.items.length !== 0;
    }
    async function refresh(before) {
        if (busy) return;
        lock(true); status('Loading invitations...');
        try { await load(before); status('Invitations loaded.'); }
        catch (error) { status(error.message, true); }
        finally { lock(false); }
    }
    el('issue').addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        if (!el('newCodes').hidden) { status('Save your current codes, then select Hide and clear codes before issuing another batch.', true); return; }
        lock(true); status('Issuing invitations...');
        try {
            const result = await api('issue', { count: Number(el('count').value), label: el('label').value });
            el('codes').textContent = result.invitations.map(item => item.code).join('\n');
            el('newCodes').hidden = false;
            status('Invitations issued. Save the codes now; they will not be shown again.');
            // Keep the successful codes visible even if the list refresh fails.
            try { await load(); } catch (error) { status('Invitations issued; save the codes. List refresh failed: ' + error.message, true); }
        } catch (error) { status(error.message + ' If the response was lost, check the list before retrying: a batch may already have been issued.', true); }
        finally { lock(false); }
    });
    el('copyCodes').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(el('codes').textContent); status('Codes copied. Send each one privately.'); }
        catch (error) { status('Could not copy: ' + error.message + '. Select and copy the codes manually.', true); }
    });
    el('clearCodes').addEventListener('click', () => { el('codes').textContent = ''; el('newCodes').hidden = true; status('Codes cleared from this page.'); });
    el('refresh').addEventListener('click', () => { void refresh(); });
    el('next').addEventListener('click', () => { void refresh(next); });
    el('cancelRevoke').addEventListener('click', () => { pendingHash = null; el('confirm').hidden = true; });
    el('confirmRevoke').addEventListener('click', async () => {
        if (busy || !pendingHash) return;
        lock(true); status('Revoking invitation...');
        try {
            await api('revoke', { hash: pendingHash });
            pendingHash = null; el('confirm').hidden = true;
            status('Invitation revoked.');
            try { await load(); } catch (error) { status('Invitation revoked. List refresh failed: ' + error.message, true); }
        } catch (error) { status(error.message, true); }
        finally { lock(false); }
    });
    el('supportLookup').addEventListener('submit', async event => {
        event.preventDefault(); if (busy) return;
        lock(true); status('Loading recovery history...');
        try {
            const result = await api('recovery-data?email=' + encodeURIComponent(el('supportEmail').value));
            el('supportResult').textContent = JSON.stringify(result, null, 2);
            status(result.user ? 'Recovery history loaded.' : 'No account with that email.');
        } catch (error) { status(error.message, true); }
        finally { lock(false); }
    });
    let legacyRequest = null;
    el('linkLegacy').addEventListener('submit', event => {
        event.preventDefault(); if (busy) return;
        legacyRequest = { hash: el('legacyHash').value.trim(), email: el('legacyEmail').value.trim() };
        el('legacyConfirmText').textContent = 'Link legacy invitation ' + legacyRequest.hash + ' to ' + legacyRequest.email + '? Only confirm after independently identifying the original recipient. The old anonymous cookie will stop working.';
        el('legacyConfirm').hidden = false; el('legacyAccept').focus();
    });
    el('legacyCancel').addEventListener('click', () => { legacyRequest = null; el('legacyConfirm').hidden = true; });
    el('legacyAccept').addEventListener('click', async () => {
        if (busy || !legacyRequest) return;
        lock(true); status('Linking legacy grant...');
        try {
            await api('link-legacy', legacyRequest);
            legacyRequest = null; el('legacyConfirm').hidden = true;
            status('Existing grant linked. The recipient can restore access with their verified email.');
        } catch (error) { status(error.message, true); }
        finally { lock(false); }
    });
    window.addEventListener('pagehide', () => { el('codes').textContent = ''; el('newCodes').hidden = true; });
    void refresh();
})();`;
