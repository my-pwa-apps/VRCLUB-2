/**
 * VR Club multiplayer relay.
 *
 * This Worker does not hold any application state itself - it just looks up the
 * Durable Object for a room name and forwards the WebSocket upgrade to it. All
 * room state (connected sessions, the current host, the shared music position)
 * lives in the `ClubRoom` Durable Object below, one instance per room name.
 *
 * Message protocol (all JSON, one object per frame):
 *   client -> server
 *     { type: 'state', state: {x,y,z,rotY} }        - throttled position/facing sample (y = eye height)
 *     { type: 'emoji', emoji: '🎉' }                  - one-shot reaction (allow-listed)
 *     { type: 'music', url, playing, position }       - host only; shared track state (http(s) only)
 *     { type: 'rtc-signal', target, signal }          - relayed 1:1 to `target`
 *   server -> client
 *     { type: 'welcome', id, hostId, serverTime, peers:[{id,name,state}], music }
 *     { type: 'join', id, name }
 *     { type: 'leave', id }
 *     { type: 'state', id, state }
 *     { type: 'emoji', id, emoji }
 *     { type: 'music', url, playing, position, updatedAt }
 *     { type: 'host', id }
 *     { type: 'rtc-signal', from, signal }
 *
 * Voice and any future media never touch this Worker - `rtc-signal` only carries
 * SDP offers/answers and ICE candidates so two browsers can negotiate a direct
 * peer-to-peer WebRTC audio connection.
 *
 * Abuse controls. The hosted relay URL is public (README), so the relay assumes
 * any client may be hostile:
 *   - browsers must present an allow-listed Origin (ALLOWED_ORIGINS, or the
 *     defaults below; loopback and private-LAN origins are always accepted so
 *     the documented Quest-over-LAN workflow keeps working);
 *   - rooms are capped at MAX_ROOM_SIZE sessions;
 *   - frames above MAX_FRAME_BYTES are dropped;
 *   - every message type has a per-connection token bucket, and a connection
 *     that keeps flooding after being throttled is closed.
 */

export const MAX_NAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 64;
export const MAX_ROOM_SIZE = 16;
export const MAX_FRAME_BYTES = 16 * 1024;
export const MAX_URL_LENGTH = 2048;
export const MAX_COORDINATE = 500;
export const MAX_DROPPED_BEFORE_CLOSE = 200;

// WebSocket close codes in the application range (4000-4999), surfaced by the client.
export const CLOSE_ROOM_FULL = 4003;
export const CLOSE_FLOODING = 4008;

export const ALLOWED_EMOJI = Object.freeze(['🎉', '🔥', '❤️', '😂', '👋', '🙌', '💃', '🕺']);

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
    'https://my-pwa-apps.github.io'
]);

// Sustained rate / burst per connection. `rtc-signal` bursts during ICE gathering.
export const RATE_LIMITS = Object.freeze({
    state: { rate: 20, burst: 30 },
    emoji: { rate: 2, burst: 4 },
    music: { rate: 2, burst: 4 },
    'rtc-signal': { rate: 50, burst: 120 }
});

export class TokenBucket {
    constructor({ rate, burst }, now = Date.now()) {
        this.rate = rate;
        this.burst = burst;
        this.tokens = burst;
        this.updatedAt = now;
    }

    take(now = Date.now()) {
        const elapsed = Math.max(0, now - this.updatedAt) / 1000;
        this.updatedAt = now;
        this.tokens = Math.min(this.burst, this.tokens + elapsed * this.rate);
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
    }
}

const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

export function parseAllowedOrigins(value) {
    if (typeof value !== 'string' || !value.trim()) return [...DEFAULT_ALLOWED_ORIGINS];
    return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin, allowed = DEFAULT_ALLOWED_ORIGINS) {
    if (typeof origin !== 'string' || !origin) return false;
    let url;
    try { url = new URL(origin); } catch { return false; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (PRIVATE_HOST.test(url.hostname)) return true;
    return allowed.includes(url.origin);
}

/** Strips control/format characters and truncates by code point, never mid-surrogate. */
export function sanitizeName(value) {
    const cleaned = String(value || '')
        .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
    const name = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('');
    return name || 'Guest';
}

export function sanitizeState(state) {
    if (!state || typeof state !== 'object') return null;
    const coord = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, n)) : 0;
    };
    const rot = Number(state.rotY);
    return {
        x: coord(state.x),
        y: coord(state.y),
        z: coord(state.z),
        // Normalised to (-PI, PI] so every receiver interpolates along the short arc.
        rotY: Number.isFinite(rot) ? Math.atan2(Math.sin(rot), Math.cos(rot)) : 0
    };
}

export function sanitizeMusicUrl(value) {
    if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
        if (url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

export class ClubRoom {
    constructor(state) {
        this.state = state;
        /** @type {Map<WebSocket, {id: string, name: string, lastState: object|null, buckets: object, dropped: number}>} */
        this.sessions = new Map();
        this.hostId = null;
        this.musicState = null; // { url, playing, position, updatedAt }
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426 });
        }

        const url = new URL(request.url);
        const name = sanitizeName(url.searchParams.get('name'));

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this._acceptSession(server, name);
        return new Response(null, { status: 101, webSocket: client });
    }

    _acceptSession(ws, name) {
        ws.accept();
        if (this.sessions.size >= MAX_ROOM_SIZE) {
            try { ws.close(CLOSE_ROOM_FULL, 'room full'); } catch { /* already closed */ }
            return null;
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const buckets = {};
        for (const [type, limit] of Object.entries(RATE_LIMITS)) buckets[type] = new TokenBucket(limit, now);
        const session = { id, name, lastState: null, buckets, dropped: 0 };
        this.sessions.set(ws, session);
        if (!this.hostId) this.hostId = id;

        const peers = [];
        for (const other of this.sessions.values()) {
            if (other.id === id) continue;
            peers.push({ id: other.id, name: other.name, state: other.lastState });
        }

        this._send(ws, {
            type: 'welcome',
            id,
            hostId: this.hostId,
            serverTime: now,
            peers,
            music: this.musicState
        });
        this._broadcast({ type: 'join', id, name }, ws);

        ws.addEventListener('message', (evt) => this._onMessage(ws, session, evt));
        const onClose = () => this._onClose(ws, session);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onClose);
        return session;
    }

    _throttle(ws, session, type) {
        const bucket = session.buckets[type];
        if (!bucket || bucket.take()) return false;
        if (++session.dropped >= MAX_DROPPED_BEFORE_CLOSE) {
            try { ws.close(CLOSE_FLOODING, 'rate limit exceeded'); } catch { /* ignore */ }
            this._onClose(ws, session);
        }
        return true;
    }

    _onMessage(ws, session, evt) {
        // Flood-close and socket errors end the session immediately, but frames already
        // queued on the socket can still arrive; never relay for a departed id.
        if (!this.sessions.has(ws)) return;
        if (typeof evt.data !== 'string' || evt.data.length > MAX_FRAME_BYTES) return;
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string' || !RATE_LIMITS[msg.type]) return;
        if (this._throttle(ws, session, msg.type)) return;

        switch (msg.type) {
            case 'state': {
                const state = sanitizeState(msg.state);
                if (!state) return;
                session.lastState = state;
                this._broadcast({ type: 'state', id: session.id, state }, ws);
                break;
            }

            case 'emoji':
                if (ALLOWED_EMOJI.includes(msg.emoji)) {
                    this._broadcast({ type: 'emoji', id: session.id, emoji: msg.emoji }, ws);
                }
                break;

            case 'music': {
                // Only the room's current host may drive the shared "now playing" state,
                // otherwise any guest could hijack everyone else's audio.
                if (session.id !== this.hostId) return;
                const position = Number(msg.position);
                this.musicState = {
                    url: sanitizeMusicUrl(msg.url),
                    playing: !!msg.playing,
                    position: Number.isFinite(position) && position > 0 ? position : 0,
                    updatedAt: Date.now()
                };
                this._broadcast({ type: 'music', ...this.musicState }, ws);
                break;
            }

            case 'rtc-signal': {
                if (typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                if (targetWs && msg.signal && typeof msg.signal === 'object') {
                    this._send(targetWs, { type: 'rtc-signal', from: session.id, signal: msg.signal });
                }
                break;
            }

            default:
                break;
        }
    }

    _onClose(ws, session) {
        if (!this.sessions.has(ws)) return;
        this.sessions.delete(ws);

        if (this.hostId === session.id) {
            const next = this.sessions.values().next();
            this.hostId = next.done ? null : next.value.id;
            if (this.hostId) this._broadcast({ type: 'host', id: this.hostId });
            else this.musicState = null;
        }
        this._broadcast({ type: 'leave', id: session.id });
    }

    _findSocketById(id) {
        if (!id) return null;
        for (const [ws, session] of this.sessions) {
            if (session.id === id) return ws;
        }
        return null;
    }

    _send(ws, obj) {
        try { ws.send(JSON.stringify(obj)); } catch { /* socket already closing */ }
    }

    _broadcast(obj, exclude) {
        const data = JSON.stringify(obj);
        for (const ws of this.sessions.keys()) {
            if (ws === exclude) continue;
            try { ws.send(data); } catch { /* drop - close event will clean it up */ }
        }
    }
}

export default {
    async fetch(request, env = {}) {
        const url = new URL(request.url);
        if (url.pathname === '/health') return new Response('ok');

        // Browsers always send Origin on a WebSocket handshake; this stops other web
        // pages from driving the relay from a visitor's browser. Non-browser clients
        // can forge it, which is what the per-connection limits are for.
        const allowed = parseAllowedOrigins(env.ALLOWED_ORIGINS);
        if (!isAllowedOrigin(request.headers.get('Origin'), allowed)) {
            return new Response('origin not allowed', { status: 403 });
        }

        const room = (url.searchParams.get('room') || 'lobby').slice(0, MAX_ROOM_NAME_LENGTH);
        const id = env.CLUB_ROOM.idFromName(room);
        const stub = env.CLUB_ROOM.get(id);
        return stub.fetch(request);
    }
};
