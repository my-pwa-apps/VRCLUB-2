// Music links that follow the account. An immersive-only headset app cannot type a link (no keyboard, no 2D page), so the
// owner manages the list on a phone (link/?music=1) and the headset reads it.
//
//   GET  /payments/music       any verified session (phone or registered headset) -> { items: [...] | null, updatedAt }
//   POST /payments/music/save  any verified session, { items: [{ url, name }] }    -> { items, updatedAt }
//
// `items: null` means the account has never saved a list, so a headset keeps whatever it has locally. Validation here only
// keeps junk and non-HTTPS links out of the table; the headset's MusicLibrary applies the full playback rules again.
import { accessSession, limit } from './accessRecovery.js';

export const MAX_MUSIC_SETS = 8;
const MAX_URL = 500;
const MAX_NAME = 60;
const MAX_BODY = 8192;

/** Returns the cleaned list, or throws an Error whose message is safe to show to the owner. */
export function cleanMusicItems(value) {
    if (!Array.isArray(value)) throw new Error('Send a list of music links.');
    if (value.length > MAX_MUSIC_SETS) throw new Error(`Save at most ${MAX_MUSIC_SETS} music links.`);
    const seen = new Set();
    return value.map(entry => {
        if (!entry || typeof entry !== 'object' || typeof entry.url !== 'string') throw new Error('Each music link needs a web address.');
        const text = entry.url.trim();
        let url;
        try { url = new URL(text); } catch (_) { throw new Error('That is not a web address.'); }
        if (text.length > MAX_URL) throw new Error('That web address is too long.');
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use a direct HTTPS link without a username or password.');
        if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/.test(url.hostname)) {
            throw new Error('That is a music website, not a direct audio link. Use an HTTPS MP3, M4A, OGG or stream link, or a SoundCloud track.');
        }
        if (seen.has(url.href)) throw new Error('That link is already in the list.');
        seen.add(url.href);
        const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME) : '';
        return { url: url.href, ...(name ? { name } : {}) };
    });
}

async function readBounded(request) {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let text = '', length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_BODY) { await reader.cancel(); return null; }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } finally {
        reader.releaseLock();
    }
    try { return JSON.parse(text); } catch (_) { return null; }
}

export async function handleMusicSync(request, env, headers, helpers) {
    const path = new URL(request.url).pathname;
    if (path !== '/payments/music' && path !== '/payments/music/save') return null;
    const { json } = helpers;
    const respond = (body, status = 200) => json(body, status, headers);
    if ((path === '/payments/music') !== (request.method === 'GET')) return respond({ message: 'Method not allowed.' }, 405);
    if (!env.DB || !env.SESSION_SECRET || env.ACCESS_RECOVERY_ENABLED !== '1') {
        return respond({ error: 'music_unavailable', message: 'Saving music is not configured.' }, 503);
    }
    try {
        const session = await accessSession(request, env);
        if (!session) return respond({ error: 'verification_required', message: 'Verify your email first.' }, 401);

        if (request.method === 'GET') {
            const row = await env.DB.prepare('SELECT items, updated_at FROM account_music WHERE user_id = ?').bind(session.user_id).first();
            if (!row) return respond({ items: null, updatedAt: 0 });
            let items;
            try { items = JSON.parse(row.items); } catch (_) { items = []; }
            return respond({ items: Array.isArray(items) ? items : [], updatedAt: row.updated_at });
        }

        const body = await readBounded(request);
        if (!body || typeof body !== 'object') return respond({ message: 'Invalid request.' }, 400);
        let items;
        try { items = cleanMusicItems(body.items); } catch (error) { return respond({ error: 'invalid_music', message: error.message }, 400); }
        if (!await limit(env, `music-save:${session.user_id}`, 60, 3600000)) {
            return respond({ error: 'music_rate_limit', message: 'Too many changes. Please try again in a while.' }, 429);
        }
        const now = Date.now();
        await env.DB.prepare(`
            INSERT INTO account_music (user_id, items, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at
        `).bind(session.user_id, JSON.stringify(items), now).run();
        return respond({ items, updatedAt: now });
    } catch (error) {
        console.error('music sync failed', error && error.message);
        return respond({ error: 'music_failed', message: 'Could not reach your saved music. Please retry.' }, 503);
    }
}
