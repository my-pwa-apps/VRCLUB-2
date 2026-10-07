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
 *     { type: 'gesture', gesture: 'wave'|'nod'|'dance'|'stop' } - body language (allow-listed; 'dance' runs until 'stop')
 *     { type: 'chat', text }                          - a typed message (at most 200 characters, control characters removed)
 *     { type: 'avatar', pool? }                       - ask for a different random avatar, optionally from 'women', 'men' or 'any'
 *     { type: 'music', url, playing, position, podcast?, title? } - host only; shared track state (http(s) only)
 *     { type: 'show', m, mv, cue, ... }               - host only; the light show (see sanitizeShow)
 *     { type: 'rtc-signal', target, signal }          - relayed 1:1 to `target`
 *     { type: 'blocklist', pids: [...] }              - replace this guest's block list (on connect; at most 64)
 *     { type: 'block', pid } / { type: 'unblock', pid } - two-way invisibility: neither sees, hears or signals the other
 *     { type: 'kick', target } / { type: 'ban', target } - host only; `target` is a session id
 *     { type: 'lock', locked: true|false }            - host only; a locked room refuses new guests
 *     { type: 'ping' }                                - a heartbeat every 10 s; a client that has pinged and then goes silent for 30 s is closed (4013), so a vanished host is replaced promptly
 *   server -> client
 *     { type: 'welcome', id, pid, avatar, hostId, locked, serverTime, peers:[{id,pid,name,avatar,state}], music, show }
 *     { type: 'join', id, pid, name, avatar }
 *     { type: 'leave', id }
 *     { type: 'state', id, state }
 *     { type: 'emoji', id, emoji }
 *     { type: 'gesture', id, gesture }
 *     { type: 'chat', id, text }
 *     { type: 'avatar', id, avatar }
 *     { type: 'music', url, playing, position, updatedAt, podcast, title }
 *     { type: 'show', ... }
 *     { type: 'host', id }
 *     { type: 'room', locked }
 *     { type: 'rtc-signal', from, signal }
 *
 * Identity and safety. The client sends a secret random `uid` in the query string; the relay never repeats it, it
 * shows other guests only `pid`, a hash of it. Blocks and bans are keyed by `pid`, so they survive a reconnect (the
 * session id changes every time) and nobody can be banned or blocked by someone who merely copied their `pid`.
 * Close codes: 4003 room full, 4008 flooding, 4010 removed by the host, 4011 banned, 4012 room locked.
 * Bans and the lock last while anyone is in the room: once it is empty it starts over (see _onClose).
 *
 * Every guest is handed a random avatar from AVATARS that no one else in the room has (a room holds at most 8 guests
 * and the pool has 17), and may ask for another. The pool must match the crowd people in js/club/11-audio-crowd.js.
 * Eight is deliberate: voice is a full mesh (every guest sends audio to every other), and eight is also how many
 * guests the client draws as people.
 *
 * The host owns the room's music and lights. `music` carries the track and where it is; `show` carries the light show
 * (which cue the Show Director is on, the master colour, or, under manual control, the fixture settings). The relay
 * keeps the latest of each so a guest who joins mid-set is brought to the same place, and checks only their shape;
 * what a key may do is the client's allow-list. Only the host's frames are accepted.
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
 *
 * Besides the socket, the same Origin rule guards two plain HTTP routes for Miss Melera's
 * podcast (see ./podcast.js): /podcast/colourizon/feed.xml and /podcast/colourizon/stream/<name>.
 */

import { handlePodcast } from './podcast.js';

export const MAX_NAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 64;
export const MAX_ROOM_SIZE = 8;
export const MAX_FRAME_BYTES = 16 * 1024;
export const MAX_URL_LENGTH = 2048;
export const MAX_COORDINATE = 500;
export const MAX_DROPPED_BEFORE_CLOSE = 200;

// WebSocket close codes in the application range (4000-4999), surfaced by the client.
export const CLOSE_ROOM_FULL = 4003;
export const CLOSE_FLOODING = 4008;
export const CLOSE_KICKED = 4010;
export const CLOSE_BANNED = 4011;
export const CLOSE_LOCKED = 4012;
/** Not terminal for the client: a heartbeat the relay did not see is a connection to retry. */
export const CLOSE_IDLE = 4013;
export const IDLE_CLOSE_MS = 30000;
export const SWEEP_INTERVAL_MS = 10000;

export const ALLOWED_EMOJI = Object.freeze(['🎉', '🔥', '❤️', '😂', '👋', '🙌', '💃', '🕺']);
export const ALLOWED_GESTURES = Object.freeze(['wave', 'nod', 'dance', 'stop']);
// The people a guest can be: the 17 crowd characters (Quaternius Modular Women and Men). A test keeps this in step
// with AVATAR_SOURCES in js/club/11-audio-crowd.js.
export const AVATARS = Object.freeze(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
/** Which of the 17 people a guest may be given: the one they chose (`?avatars=` on connect, `pool` when rerolling). */
export const AVATAR_POOLS = Object.freeze({
    any: AVATARS,
    women: Object.freeze(AVATARS.filter(id => id.startsWith('f'))),
    men: Object.freeze(AVATARS.filter(id => id.startsWith('m')))
});
export function sanitizePool(value) {
    return value === 'women' || value === 'men' ? value : 'any';
}
export const MAX_CHAT_LENGTH = 200;
/**
 * A typed message: control, format and separator characters removed (no bidi overrides, no zero-width tricks, no line
 * breaks), whitespace collapsed, at most MAX_CHAT_LENGTH code points. Empty after that means nothing is sent.
 */
export function sanitizeChat(value) {
    if (typeof value !== 'string') return '';
    const cleaned = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(cleaned).slice(0, MAX_CHAT_LENGTH).join('');
}
export const MAX_BLOCKED = 64;
export const MAX_BANNED = 256;
export const PID_PATTERN = /^[0-9a-f]{16}$/;
export const UID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
    'https://my-pwa-apps.github.io'
]);

// Sustained rate / burst per connection. `rtc-signal` bursts during ICE gathering.
export const RATE_LIMITS = Object.freeze({
    state: { rate: 20, burst: 30 },
    emoji: { rate: 2, burst: 4 },
    gesture: { rate: 1, burst: 3 },
    avatar: { rate: 0.5, burst: 2 },
    music: { rate: 2, burst: 4 },
    show: { rate: 5, burst: 10 },
    'rtc-signal': { rate: 50, burst: 120 },
    blocklist: { rate: 0.5, burst: 3 },
    block: { rate: 2, burst: 8 },
    unblock: { rate: 2, burst: 8 },
    kick: { rate: 1, burst: 3 },
    ban: { rate: 1, burst: 3 },
    lock: { rate: 1, burst: 3 },
    chat: { rate: 0.5, burst: 4 },
    ping: { rate: 1, burst: 3 }
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

/** An episode title for the "now playing" line: no control characters, at most 120 code points. */
export function sanitizeTitle(value) {
    if (typeof value !== 'string') return '';
    return Array.from(value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 120).join('');
}

const SHOW_MODES = new Set(['show', 'manual', 'off']);
const SHOW_WORD = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
export const MAX_SHOW_FIXTURES = 96;

/**
 * The shape of the host's light-show frame. Everything is optional and clamped; unknown fields are dropped. `fx` is a
 * flat map of fixture settings (booleans, numbers, short words): the relay checks it is flat and bounded, the CLIENT
 * decides which names it will ever apply.
 *   m    'show' (the Show Director is driving), 'manual' (the host's console) or 'off' (the legacy auto cycler)
 *   mv, cue, cb   movement name, cue index and bars elapsed in the cue
 *   sp, spt, spb  set-piece name, the movement it hands on to, and the bar it is on
 *   bib  beat in the bar (0..3)
 *   hue, hl, pal, lh, mbi   master hue, whether a look pins it, palette mode, LED harmony, mirror-ball colour index
 */
export function sanitizeShow(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (!SHOW_MODES.has(value.m)) return null;
    const num = (v, lo, hi, digits = 4) => {
        const n = Number(v);
        return Number.isFinite(n) ? Number(Math.min(hi, Math.max(lo, n)).toFixed(digits)) : null;
    };
    const word = (v) => (typeof v === 'string' && SHOW_WORD.test(v) ? v : null);
    const out = { m: value.m };
    for (const [key, v] of [['mv', word(value.mv)], ['sp', word(value.sp)], ['spt', word(value.spt)], ['pal', word(value.pal)], ['lh', word(value.lh)]]) {
        if (v) out[key] = v;
    }
    for (const [key, v] of [['cue', num(value.cue, 0, 63, 0)], ['cb', num(value.cb, 0, 4096, 3)], ['spb', num(value.spb, 0, 4096, 0)],
        ['bib', num(value.bib, 0, 3, 0)], ['hue', num(value.hue, 0, 1)], ['mbi', num(value.mbi, 0, 63, 0)], ['bpm', num(value.bpm, 40, 220, 1)]]) {
        if (v !== null) out[key] = v;
    }
    if (typeof value.hl === 'boolean') out.hl = value.hl;
    if (value.fx && typeof value.fx === 'object' && !Array.isArray(value.fx)) {
        const fx = {};
        let count = 0;
        for (const key of Object.keys(value.fx)) {
            if (count >= MAX_SHOW_FIXTURES) break;
            const v = value.fx[key];
            if (!SHOW_WORD.test(key)) continue;
            if (typeof v === 'boolean') fx[key] = v;
            else if (typeof v === 'number' && Number.isFinite(v)) fx[key] = Number(Math.min(1e6, Math.max(-1e6, v)).toFixed(4));
            else if (typeof v === 'string' && v.length <= 24 && !/[\p{Cc}]/u.test(v)) fx[key] = v;
            else continue;
            count++;
        }
        out.fx = fx;
    }
    return out;
}

/** The public id of a guest: a hash of their secret `uid`, so others can block or ban them without learning it. */
export async function derivePid(uid) {
    const bytes = new TextEncoder().encode(`vrclub-pid-v1:${uid}`);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest.subarray(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class ClubRoom {
    constructor(state) {
        this.state = state;
        /** @type {Map<WebSocket, {id: string, pid: string, name: string, avatar: string, avatarPool: string, blocked: Set<string>, lastState: object|null, buckets: object, dropped: number}>} */
        this.sessions = new Map();
        this.hostId = null;
        this.musicState = null; // { url, playing, position, updatedAt, podcast, title }
        this.showState = null;  // the host's latest light-show frame (sanitizeShow)
        this.locked = false;
        this.banned = new Set();
        this._sweeper = null;
    }

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426 });
        }

        const url = new URL(request.url);
        const name = sanitizeName(url.searchParams.get('name'));
        // A secret per browser, kept in its localStorage. Without one (an old client) the guest is simply anonymous
        // for this connection: it can neither be blocked nor banned across reconnects.
        const uid = url.searchParams.get('uid');
        const pid = await derivePid(UID_PATTERN.test(uid || '') ? uid : crypto.randomUUID());

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this._acceptSession(server, name, pid, sanitizePool(url.searchParams.get('avatars')));
        return new Response(null, { status: 101, webSocket: client });
    }

    /**
     * A random avatar no other guest has, from the guest's chosen pool (women, men or any); `except` is a session to
     * leave out. If everyone in that pool is taken the guest gets any free person rather than a double.
     */
    _pickAvatar(except = null, which = 'any') {
        const used = new Set();
        for (const other of this.sessions.values()) if (other !== except) used.add(other.avatar);
        if (except && except.avatar) used.add(except.avatar);
        const wanted = AVATAR_POOLS[which] || AVATARS;
        let free = wanted.filter(avatar => !used.has(avatar));
        if (!free.length) free = AVATARS.filter(avatar => !used.has(avatar));
        const pool = free.length ? free : wanted;
        const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
        return pool[Math.floor(random * pool.length)];
    }

    /** Two guests see, hear and signal each other only while neither has blocked the other. */
    _visible(a, b) {
        return !a.blocked.has(b.pid) && !b.blocked.has(a.pid);
    }

    /** Send `obj` from `from` to everyone who can see them (optionally leaving one socket out). */
    _relay(from, obj, except = null) {
        const data = JSON.stringify(obj);
        for (const [ws, other] of this.sessions) {
            if (ws === except || other === from || !this._visible(from, other)) continue;
            try { ws.send(data); } catch { /* the close event cleans up */ }
        }
    }

    _acceptSession(ws, name, pid = null, avatarPool = 'any') {
        ws.accept();
        pid = PID_PATTERN.test(pid || '') ? pid : Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
        if (this.banned.has(pid)) {
            try { ws.close(CLOSE_BANNED, 'banned from this room'); } catch { /* already closed */ }
            return null;
        }
        if (this.sessions.size >= MAX_ROOM_SIZE) {
            try { ws.close(CLOSE_ROOM_FULL, 'room full'); } catch { /* already closed */ }
            return null;
        }
        if (this.locked) {
            try { ws.close(CLOSE_LOCKED, 'room locked'); } catch { /* already closed */ }
            return null;
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        const buckets = {};
        for (const [type, limit] of Object.entries(RATE_LIMITS)) buckets[type] = new TokenBucket(limit, now);
        const session = { id, pid, name, avatar: this._pickAvatar(null, avatarPool), avatarPool, blocked: new Set(), lastState: null, buckets, dropped: 0, lastSeen: now, pinger: false };
        this._startSweeper();
        this.sessions.set(ws, session);
        if (!this.hostId) this.hostId = id;

        // Blocks arrive after the socket opens (`blocklist`), so a guest who blocked someone sees them briefly: the
        // relay hides them again the moment the list lands, with a `leave`.
        const peers = [];
        for (const other of this.sessions.values()) {
            if (other.id === id || other.blocked.has(pid)) continue;
            peers.push({ id: other.id, pid: other.pid, name: other.name, avatar: other.avatar, state: other.lastState });
        }

        this._send(ws, {
            type: 'welcome',
            id,
            pid,
            avatar: session.avatar,
            hostId: this.hostId,
            locked: this.locked,
            serverTime: now,
            peers,
            music: this.musicState,
            show: this.showState
        });
        this._relay(session, { type: 'join', id, pid, name, avatar: session.avatar }, ws);

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
        session.lastSeen = Date.now();
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
                this._relay(session, { type: 'state', id: session.id, state }, ws);
                break;
            }

            case 'emoji':
                if (ALLOWED_EMOJI.includes(msg.emoji)) {
                    this._relay(session, { type: 'emoji', id: session.id, emoji: msg.emoji }, ws);
                }
                break;

            case 'gesture':
                if (ALLOWED_GESTURES.includes(msg.gesture)) {
                    this._relay(session, { type: 'gesture', id: session.id, gesture: msg.gesture }, ws);
                }
                break;

            case 'chat': {
                // Typed messages for guests who would rather not talk. Only to people who can see the sender (block
                // is two-way), never stored, and the relay names the sender: a client cannot claim to be someone else.
                const text = sanitizeChat(msg.text);
                if (text) this._relay(session, { type: 'chat', id: session.id, text }, ws);
                break;
            }

            case 'avatar': {
                // A different random one: the pick excludes everyone else's and this guest's current.
                if (msg.pool !== undefined) session.avatarPool = sanitizePool(msg.pool);
                session.avatar = this._pickAvatar(session, session.avatarPool);
                const note = { type: 'avatar', id: session.id, avatar: session.avatar };
                this._send(ws, note);
                this._relay(session, note, ws);
                break;
            }

            case 'music': {
                // Only the room's current host may drive the shared "now playing" state,
                // otherwise any guest could hijack everyone else's audio.
                if (session.id !== this.hostId) return;
                const position = Number(msg.position);
                const podcast = typeof msg.podcast === 'string' && /^[a-z]{1,16}$/.test(msg.podcast) ? msg.podcast : null;
                this.musicState = {
                    url: sanitizeMusicUrl(msg.url),
                    playing: !!msg.playing,
                    position: Number.isFinite(position) && position > 0 ? position : 0,
                    updatedAt: Date.now(),
                    podcast,
                    title: sanitizeTitle(msg.title)
                };
                this._relay(session, { type: 'music', ...this.musicState }, ws);
                break;
            }

            case 'show': {
                if (session.id !== this.hostId) return;
                const show = sanitizeShow(msg);
                if (!show) return;
                this.showState = show;
                this._relay(session, { type: 'show', ...show }, ws);
                break;
            }

            case 'rtc-signal': {
                if (typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                const target = targetWs && this.sessions.get(targetWs);
                if (target && this._visible(session, target) && msg.signal && typeof msg.signal === 'object') {
                    this._send(targetWs, { type: 'rtc-signal', from: session.id, signal: msg.signal });
                }
                break;
            }

            case 'blocklist': {
                const pids = Array.isArray(msg.pids) ? msg.pids.filter(pid => PID_PATTERN.test(pid) && pid !== session.pid) : [];
                const next = new Set(pids.slice(0, MAX_BLOCKED));
                const before = new Set(session.blocked);
                session.blocked = next;
                this._applyBlockChanges(session, before);
                break;
            }

            case 'block':
            case 'unblock': {
                if (!PID_PATTERN.test(msg.pid) || msg.pid === session.pid) return;
                const before = new Set(session.blocked);
                if (msg.type === 'block') {
                    if (session.blocked.size >= MAX_BLOCKED && !session.blocked.has(msg.pid)) return;
                    session.blocked.add(msg.pid);
                } else {
                    session.blocked.delete(msg.pid);
                }
                this._applyBlockChanges(session, before);
                break;
            }

            // Moderation: the room's host only. A guest cannot remove the host or themselves.
            case 'kick':
            case 'ban': {
                if (session.id !== this.hostId || typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                const target = targetWs && this.sessions.get(targetWs);
                if (!target) return;
                if (msg.type === 'ban') {
                    if (this.banned.size >= MAX_BANNED) return;
                    this.banned.add(target.pid);
                }
                try { targetWs.close(msg.type === 'ban' ? CLOSE_BANNED : CLOSE_KICKED, msg.type === 'ban' ? 'banned by the host' : 'removed by the host'); } catch { /* already closing */ }
                this._onClose(targetWs, target);
                break;
            }

            case 'ping':
                // A client that pings is held to it: see _sweep. One that never has (an older build) is left alone.
                session.pinger = true;
                break;

            case 'lock':
                if (session.id !== this.hostId) return;
                this.locked = !!msg.locked;
                this._broadcast({ type: 'room', locked: this.locked });
                break;

            default:
                break;
        }
    }

    /** After `session`'s block list changed: tell both sides whoever became invisible has left, and whoever reappeared has joined. */
    _applyBlockChanges(session, before) {
        const sessionWs = this._findSocketById(session.id);
        for (const [ws, other] of this.sessions) {
            if (other === session) continue;
            const wasVisible = !before.has(other.pid) && !other.blocked.has(session.pid);
            const isVisible = this._visible(session, other);
            if (wasVisible === isVisible) continue;
            if (isVisible) {
                this._send(ws, { type: 'join', id: session.id, pid: session.pid, name: session.name, avatar: session.avatar });
                if (session.lastState) this._send(ws, { type: 'state', id: session.id, state: session.lastState });
                if (sessionWs) {
                    this._send(sessionWs, { type: 'join', id: other.id, pid: other.pid, name: other.name, avatar: other.avatar });
                    if (other.lastState) this._send(sessionWs, { type: 'state', id: other.id, state: other.lastState });
                }
            } else {
                this._send(ws, { type: 'leave', id: session.id });
                if (sessionWs) this._send(sessionWs, { type: 'leave', id: other.id });
            }
        }
    }

    /**
     * A socket whose peer vanished (tab crash, Wi-Fi lost) is only noticed when the network gives up on it, which can
     * take minutes, and until then the room's host would be a ghost nobody can follow. A client that has pinged must
     * keep talking: after IDLE_CLOSE_MS of silence it is closed, so the next guest becomes host promptly.
     */
    _sweep(now = Date.now()) {
        for (const [ws, session] of [...this.sessions]) {
            if (!session.pinger || now - session.lastSeen <= IDLE_CLOSE_MS) continue;
            try { ws.close(CLOSE_IDLE, 'no heartbeat'); } catch { /* already closed */ }
            this._onClose(ws, session);
        }
        if (!this.sessions.size && this._sweeper) { clearInterval(this._sweeper); this._sweeper = null; }
    }

    _startSweeper() {
        if (this._sweeper) return;
        this._sweeper = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
        if (this._sweeper && typeof this._sweeper.unref === 'function') this._sweeper.unref();
    }

    _onClose(ws, session) {
        if (!this.sessions.has(ws)) return;
        this.sessions.delete(ws);

        if (this.hostId === session.id) {
            const next = this.sessions.values().next();
            this.hostId = next.done ? null : next.value.id;
            if (this.hostId) this._broadcast({ type: 'host', id: this.hostId });
        }
        // An empty room starts over. The lock in particular must go: with nobody left to unlock it, every newcomer
        // (the host who locked it included, reconnecting after a dropped connection) would be refused with 4012 until
        // the Durable Object happened to be evicted, and each refused attempt keeps it alive.
        if (!this.sessions.size) {
            this.hostId = null;
            this.musicState = null;
            this.showState = null;
            this.locked = false;
            this.banned.clear();
        }
        this._relay(session, { type: 'leave', id: session.id });
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
        const origin = request.headers.get('Origin');
        if (!isAllowedOrigin(origin, allowed)) {
            return new Response('origin not allowed', { status: 403 });
        }

        // The podcast routes (feed and episode stream) answer the same allow-listed origins.
        const podcast = await handlePodcast(request, url, new URL(origin).origin);
        if (podcast) return podcast;

        const room = (url.searchParams.get('room') || 'lobby').slice(0, MAX_ROOM_NAME_LENGTH);
        const id = env.CLUB_ROOM.idFromName(room);
        const stub = env.CLUB_ROOM.get(id);
        return stub.fetch(request);
    }
};
