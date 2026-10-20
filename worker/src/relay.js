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
 *     { type: 'state', state: {x,y,z,rotY,seated?,floorY?,seatH?,eh?,hands?} } - eye position/facing, intentional seat state (seatH = seat height above floorY), floorY = the walking surface (kept for standing guests too)
 *       and the sender's standing eye height (1.1-2.1 m);
 *       hands are eye-relative positions and world forward/up vectors
 *     { type: 'emoji', emoji: '🎉' }                  - one-shot reaction (allow-listed)
 *     { type: 'gesture', gesture: 'wave'|'nod'|'dance'|'stop' } - body language (allow-listed; 'dance' runs until 'stop')
 *     { type: 'chat', text, targets? }                - typed message; targets are private-room-only recipient IDs (empty/invalid never broadcasts)
 *     { type: 'avatar', pool? }                       - ask for a different random avatar, optionally from 'women', 'men' or 'any'
 *     { type: 'music', url, playing, position, podcast?, title? } - host only; shared track state (http(s) only)
 *     { type: 'show', m, mv, cue, ... }               - host only; the light show (see sanitizeShow)
 *     { type: 'door', door: 0|1, shut: bool }         - any guest; push a restroom stall door shut or ajar by hand (shared room state)
 *     { type: 'rtc-signal', target, signal }          - relayed 1:1 to `target`
 *     { type: 'media-control', voice:null|[ids], listen?, music? } - SFU audience/consent, music state host-only
 *     { type: 'sfu', request, slot, action, ... }     - room-authorized SFU operation (see sfu.js)
 *     { type: 'blocklist', pids: [...] }              - replace this guest's block list (on connect; at most 64)
 *     { type: 'block', pid } / { type: 'unblock', pid } - two-way invisibility: neither sees, hears or signals the other
 *     { type: 'report', target, reason }          - report a visible guest to the host (not broadcast)
 *     { type: 'kick', target } / { type: 'ban', target } - host only; `target` is a session id
 *     { type: 'lock', locked: true|false }            - host only; a locked room refuses new guests
 *     { type: 'host-transfer', target }              - host only; give another visible guest control without disconnecting
 *     { type: 'ping', time? }                         - heartbeat every 10 s; optional monotonic timestamp for clock compensation; silence for 30 s closes a pinger (4013)
 *   server -> client
 *     { type: 'welcome', id, pid, avatar, hostId, locked, serverTime, world:{v:1,startedAt,seed}, targetedChat:true, hostTransfer:true, capacity, mediaTransport, poseBatch:true, peers:[{id,pid,name,avatar,state}], music, show, doors:[bool,bool] }
 *     { type: 'pong', time, serverTime }              - a timestamped ping reply to its sender only
 *     { type: 'join', id, pid, name, avatar }
 *     { type: 'leave', id }
 *     { type: 'state', id, state }
 *     { type: 'states', states:[{id,state}] }        - coalesced, distance-tiered poses for capable clients
 *     { type: 'media-catalog', tracks:[{owner,kind,version}], music }
 *     { type: 'sfu-result', request, result?|error? }
 *     { type: 'media-reset', slot, error? }          - retired SFU connection, rebuild allowed subscriptions
 *     { type: 'emoji', id, emoji }
 *     { type: 'gesture', id, gesture }
 *     { type: 'chat', id, text, restricted? }
 *     { type: 'avatar', id, avatar }
 *     { type: 'music', url, playing, position, updatedAt, podcast, title }
 *     { type: 'show', ... }
 *     { type: 'door', id, door, shut }
 *     { type: 'host', id }
 *     { type: 'room', locked }
 *     { type: 'rtc-signal', from, signal }
 *     { type: 'moderation-report', reporter, target, reason } - host-only moderation notification
 *
 * Identity and safety. The client sends a secret random `uid` in the query string; the relay never repeats it, it
 * shows other guests only `pid`, a hash of it. Blocks and bans are keyed by `pid`, so they survive a reconnect (the
 * session id changes every time) and nobody can be banned or blocked by someone who merely copied their `pid`.
 * Close codes: 4003 room full, 4008 flooding, 4010 removed by the host, 4011 banned, 4012 room locked.
 * Bans and the lock last while anyone is in the room: once it is empty it starts over (see _onClose).
 *
 * Every guest is handed a random avatar from AVATARS, unique while the pool has unused people, and may ask for
 * another. The pool must match js/club/11-audio-crowd.js. Baseline mesh rooms hold eight guests; explicitly configured
 * SFU rooms may admit up to 32. Admission does not claim that a headset can render 32 full characters.
 *
 * The host owns the room's music and lights. `music` carries the track and where it is; `show` carries the light show
 * (which cue the Show Director is on, the master colour, or, under manual control, the fixture settings). The relay
 * keeps the latest of each so a guest who joins mid-set is brought to the same place, and checks only their shape;
 * what a key may do is the client's allow-list. Only the host's frames are accepted.
 *
 * Audio never travels through this Worker. Baseline `rtc-signal` relays direct mesh
 * SDP/ICE. SFU mode uses room-authorized signaling through sfu.js and the dedicated
 * Cloudflare audio transport; mesh signaling is disabled in those rooms.
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
import { handleRoomDirectory, publishRoom, privateRoomName, ROOM_DIRECTORY_REFRESH, roomCapacity, roomStatus } from './roomDirectory.js';
import { RoomMedia, mediaTransport } from './sfu.js';
import { DEV_ROOM, DEV_OWNER_HEADER, devRoomAccess } from './devRoomAccess.js';
import { DevAttendees } from './devAttendees.js';

export const MAX_NAME_LENGTH = 32;
export const MAX_ROOM_NAME_LENGTH = 64;
export const MAX_ROOM_SIZE = 8;
/** The restroom's two stall doors: the only shared, hand-operated pieces of the room so far. */
export const MAX_DOORS = 2;
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
    door: { rate: 2, burst: 6 },
    'dev-seat': { rate: 0.5, burst: 2 },
    'rtc-signal': { rate: 50, burst: 120 },
    // A 31-source receiver may need 31 offer/answer pairs during simultaneous
    // joins. RoomMedia separately bounds queued operations and session creation.
    sfu: { rate: 20, burst: 80 },
    'media-control': { rate: 4, burst: 12 },
    blocklist: { rate: 0.5, burst: 3 },
    block: { rate: 2, burst: 8 },
    unblock: { rate: 2, burst: 8 },
    report: { rate: 0.05, burst: 2 },
    kick: { rate: 1, burst: 3 },
    ban: { rate: 1, burst: 3 },
    lock: { rate: 1, burst: 3 },
    'host-transfer': { rate: 0.5, burst: 2 },
    chat: { rate: 0.5, burst: 4 },
    ping: { rate: 1, burst: 3 }
});

export const REPORT_REASONS = Object.freeze([
    'harassment',
    'grooming',
    'sexual-content',
    'hate',
    'unwanted-contact',
    'impersonation',
    'other'
]);

export function sanitizeReportReason(value) {
    if (typeof value !== 'string' || !REPORT_REASONS.includes(value)) return null;
    return value;
}

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
    const result = {
        x: coord(state.x),
        y: coord(state.y),
        z: coord(state.z),
        // Normalised to (-PI, PI] so every receiver interpolates along the short arc.
        rotY: Number.isFinite(rot) ? Math.atan2(Math.sin(rot), Math.cos(rot)) : 0
    };
    if (state.seated === true) {
        result.seated = true;
        result.floorY = coord(state.floorY);
        // How high the seat is above that floor (a couch or toilet ~0.4, a stool ~0.76), so receivers pick the right posture.
        const seatH = Number(state.seatH);
        if (state.seatH != null && Number.isFinite(seatH) && seatH >= 0.1 && seatH <= 1.2) result.seatH = Math.round(seatH * 100) / 100;
    } else if (state.floorY != null && Number.isFinite(Number(state.floorY))) {
        // A standing guest's floor too, so a crouching or seated headset never sinks their person below it.
        result.floorY = coord(state.floorY);
    }
    // The sender's standing eye height, so others see a person of that height. Out of range means "not sent".
    const eh = Number(state.eh);
    if (state.eh != null && Number.isFinite(eh) && eh >= 1.1 && eh <= 2.1) result.eh = Math.round(eh * 100) / 100;
    if (state.hands && typeof state.hands === 'object') {
        result.hands = { left: sanitizeHand(state.hands.left), right: sanitizeHand(state.hands.right) };
    }
    return result;
}

function sanitizeHand(hand) {
    if (!hand || typeof hand !== 'object') return null;
    const keys = ['x', 'y', 'z', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz'];
    if (keys.some(key => typeof hand[key] !== 'number' || !Number.isFinite(hand[key]))) return null;
    if (Math.hypot(hand.x, hand.y, hand.z) > 1.5) return null;
    const f = Math.hypot(hand.fx, hand.fy, hand.fz), u = Math.hypot(hand.ux, hand.uy, hand.uz);
    if (f < 0.5 || f > 1.5 || u < 0.5 || u > 1.5) return null;
    const dot = (hand.fx * hand.ux + hand.fy * hand.uy + hand.fz * hand.uz) / (f * u);
    if (Math.abs(dot) > 0.2) return null;
    return { x: hand.x, y: hand.y, z: hand.z,
        fx: hand.fx / f, fy: hand.fy / f, fz: hand.fz / f,
        ux: hand.ux / u, uy: hand.uy / u, uz: hand.uz / u };
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
 *   dj   room DJ presence (a guest's personal hide preference still wins)
 *   audioFx   bounded host audio controls; file broadcasts already contain these effects
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
    if (typeof value.dj === 'boolean') out.dj = value.dj;
    if (value.audioFx && typeof value.audioFx === 'object' && !Array.isArray(value.audioFx)) {
        const effects = {};
        for (const name of ['lowpass', 'highpass', 'echo', 'flanger', 'reverb', 'phaser', 'sweep', 'gater', 'channel']) {
            const v = value.audioFx[name];
            if (typeof v === 'number' && Number.isFinite(v)) effects[name] = num(v, 0, 1);
        }
        out.audioFx = effects;
    }
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
    constructor(state, env = {}) {
        this.state = state;
        this.env = env;
        this.capacity = roomCapacity(env);
        this.mediaTransport = mediaTransport(env);
        if (this.capacity > MAX_ROOM_SIZE && this.mediaTransport !== 'sfu') {
            throw new Error('Rooms above eight guests require MEDIA_TRANSPORT=sfu.');
        }
        this.media = this.mediaTransport === 'sfu' ? new RoomMedia(this, env) : null;
        this._poseTimer = null;
        this._roomName = null;
        this._directoryWrite = Promise.resolve();
        this._directoryUpdatedAt = 0;
        /** @type {Map<WebSocket, {id: string, pid: string, name: string, avatar: string, avatarPool: string, blocked: Set<string>, lastState: object|null, buckets: object, dropped: number}>} */
        this.sessions = new Map();
        this.hostId = null;
        this.musicState = null; // { url, playing, position, updatedAt, podcast, title }
        this.showState = null;  // the host's latest light-show frame (sanitizeShow)
        this.doors = new Array(MAX_DOORS).fill(false); // stall doors pushed shut by hand (any guest may)
        this.world = null;
        this.locked = false;
        this.banned = new Set();
        this._sweeper = null;
        this._simulation = null;
        this._simulatedPids = new Map();
        this._removedSimulated = new Set();
    }

    async alarm() {
        if (this.media) await this.media._enqueue(() => this.media.retryCleanup());
    }

    async fetch(request) {
        if (new URL(request.url).pathname === '/directory-status') {
            return Response.json(this.capacity === 8 ? { people: this.sessions.size, locked: this.locked } :
                roomStatus(this._roomName, this.sessions.size, this.locked, this.capacity));
        }
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('expected a websocket upgrade', { status: 426 });
        }

        const url = new URL(request.url);
        if (this.media && url.searchParams.get('sfu') !== '1') {
            return new Response('Update the club app to join an SFU room.', { status: 426 });
        }
        this._roomName = (url.searchParams.get('room') || 'lobby').slice(0, MAX_ROOM_NAME_LENGTH);
        if (this._roomName === DEV_ROOM &&
            (this.env.DEV_ROOM_ENABLED !== '1' || request.headers.get(DEV_OWNER_HEADER) !== 'verified')) {
            return new Response('owner authorization required', { status: 403 });
        }
        const name = sanitizeName(url.searchParams.get('name'));
        // A secret per browser, kept in its localStorage. Without one (an old client) the guest is simply anonymous
        // for this connection: it can neither be blocked nor banned across reconnects.
        const uid = url.searchParams.get('uid');
        const pid = await derivePid(UID_PATTERN.test(uid || '') ? uid : crypto.randomUUID());

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this._acceptSession(server, name, pid, sanitizePool(url.searchParams.get('avatars')), url.searchParams.get('poseBatch') === '1');
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
            if (ws === except || other.simulated || other === from || !this._visible(from, other)) continue;
            try { ws.send(data); } catch { /* the close event cleans up */ }
        }
    }

    _peerInfo(session) {
        return { id: session.id, pid: session.pid, name: session.name, avatar: session.avatar,
            ...(session.simulated ? { simulated: true } : {}) };
    }

    _acceptSession(ws, name, pid = null, avatarPool = 'any', poseBatch = false, simulation = null) {
        const simulated = simulation !== null;
        if (!simulated) ws.accept();
        pid = PID_PATTERN.test(pid || '') ? pid : Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
        if (this.banned.has(pid)) {
            try { ws.close(CLOSE_BANNED, 'banned from this room'); } catch { /* already closed */ }
            return null;
        }
        if (!simulated && this._roomName === DEV_ROOM && !this.locked && this.sessions.size >= this.capacity) {
            const spare = [...this.sessions].reverse().find(([, other]) => other.simulated);
            if (spare) this._onClose(...spare);
        }
        if (this.sessions.size >= this.capacity) {
            try { ws.close(CLOSE_ROOM_FULL, 'room full'); } catch { /* already closed */ }
            return null;
        }
        if (this.locked) {
            try { ws.close(CLOSE_LOCKED, 'room locked'); } catch { /* already closed */ }
            return null;
        }

        const id = crypto.randomUUID();
        const now = Date.now();
        if (!this.sessions.size) {
            this.world = { v: 1, startedAt: now, seed: crypto.getRandomValues(new Uint32Array(1))[0] };
        }
        const buckets = {};
        for (const [type, limit] of Object.entries(RATE_LIMITS)) buckets[type] = new TokenBucket(limit, now);
        const session = { id, pid, name, avatar: this._pickAvatar(null, avatarPool), avatarPool, blocked: new Set(), lastState: null, buckets, dropped: 0, lastSeen: now, pinger: false,
            poseBatch, poseSent: new Map() };
        if (simulated) {
            session.simulated = true;
            session.simulatedIndex = simulation.index;
            session.lastState = simulation.state;
        } else if (this._roomName === DEV_ROOM) session.pinger = true;
        this._startSweeper();
        this.sessions.set(ws, session);
        if (!this.hostId && !simulated) this.hostId = id;
        if (simulated) {
            this._relay(session, { type: 'join', ...this._peerInfo(session), state: session.lastState });
            return session;
        }

        // Blocks arrive after the socket opens (`blocklist`), so a guest who blocked someone sees them briefly: the
        // relay hides them again the moment the list lands, with a `leave`.
        const peers = [];
        for (const other of this.sessions.values()) {
            if (other.id === id || other.blocked.has(pid)) continue;
            peers.push({ ...this._peerInfo(other), state: other.lastState });
        }

        this._send(ws, {
            type: 'welcome',
            id,
            pid,
            avatar: session.avatar,
            hostId: this.hostId,
            locked: this.locked,
            serverTime: now,
            world: this.world,
            targetedChat: true,
            hostTransfer: true,
            capacity: this.capacity,
            poseBatch: true,
            mediaTransport: this.mediaTransport,
            peers,
            music: this.musicState,
            show: this.showState,
            doors: this.doors
        });
        this._relay(session, { type: 'join', id, pid, name, avatar: session.avatar }, ws);
        if (this.media) this.media.add(session);
        if ((poseBatch || this._roomName === DEV_ROOM) && !this._poseTimer) {
            this._poseTimer = setInterval(() => this._flushPoses(), 50);
            this._poseTimer.unref?.();
        }
        this._publishDirectory();

        ws.addEventListener('message', (evt) => this._onMessage(ws, session, evt));
        const onClose = () => this._onClose(ws, session);
        ws.addEventListener('close', onClose);
        ws.addEventListener('error', onClose);
        this._fillSimulation();
        return session;
    }

    _simulationPeople() {
        return [...this.sessions.values()].filter(session => !session.simulated && session.lastState)
            .map(session => ({ ...session.lastState, floorY: session.lastState.floorY ?? session.lastState.y - 1.7 }));
    }

    _fillSimulation() {
        if (this._roomName !== DEV_ROOM || this.env.DEV_ROOM_ENABLED !== '1') return;
        if (![...this.sessions.values()].some(session => !session.simulated)) return;
        this._simulation ||= new DevAttendees(this.world.seed);
        for (let index = 0; index < this.capacity - 1 && this.sessions.size < this.capacity; index++) {
            if (this._removedSimulated.has(index) || this._simulation.guests.has(index)) continue;
            if (!this._simulatedPids.has(index)) this._simulatedPids.set(index, crypto.randomUUID().replace(/-/g, '').slice(0, 16));
            const bot = this._simulation.add(index, this._simulationPeople());
            this._acceptSession({ simulated: true }, bot.name,
                this._simulatedPids.get(index), 'any', false, bot);
        }
    }

    _tickSimulation(now) {
        if (!this._simulation) return;
        this._simulation.step(now, this._simulationPeople(), this.doors);
        for (const session of this.sessions.values()) {
            if (!session.simulated) continue;
            const bot = this._simulation.guests.get(session.simulatedIndex);
            session.lastState = bot.state;
            if (bot.gesture) this._relay(session, { type: 'gesture', id: session.id, gesture: bot.gesture });
            if (bot.emoji) this._relay(session, { type: 'emoji', id: session.id, emoji: bot.emoji });
            if (bot.chat) this._relay(session, { type: 'chat', id: session.id, text: bot.chat });
            for (const [ws, other] of this.sessions) {
                if (!other.simulated && !other.poseBatch && this._visible(session, other)) {
                    this._send(ws, { type: 'state', id: session.id, state: session.lastState });
                }
            }
        }
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
        if (typeof evt.data !== 'string' || evt.data.length > 64 * 1024) return;
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string' || !RATE_LIMITS[msg.type]) return;
        if (evt.data.length > MAX_FRAME_BYTES && (msg.type !== 'sfu' || !this.media)) return;
        if (this._throttle(ws, session, msg.type)) return;

        switch (msg.type) {
            case 'state': {
                const state = sanitizeState(msg.state);
                if (!state) return;
                session.lastState = state;
                for (const [targetWs, target] of this.sessions) {
                    if (target !== session && !target.poseBatch && this._visible(session, target)) {
                        this._send(targetWs, { type: 'state', id: session.id, state });
                    }
                }
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

            case 'dev-seat':
                if (this._roomName !== DEV_ROOM || !this._simulation || session.simulated ||
                    typeof msg.seat !== 'string' || !this._simulation.yieldSeat(msg.seat)) return;
                if (/^toilet-[01]$/.test(msg.seat)) {
                    const door = Number(msg.seat.at(-1));
                    this.doors[door] = false;
                    this._broadcast({ type: 'door', door, shut: false });
                }
                break;

            case 'chat': {
                // Typed messages for guests who would rather not talk. Only to people who can see the sender (block
                // is two-way), never stored, and the relay names the sender: a client cannot claim to be someone else.
                const text = sanitizeChat(msg.text);
                if (!text) return;
                if (msg.targets === undefined) {
                    this._relay(session, { type: 'chat', id: session.id, text }, ws);
                } else {
                    // Public-room messages remain visible to the room and its host. Selected-recipient chat is for
                    // unlisted private rooms only, reducing covert harassment and pressure in stranger spaces.
                    if (!privateRoomName(this._roomName)) return;
                    // Explicit but invalid/empty audiences must never fall back to a room broadcast.
                    if (!Array.isArray(msg.targets) || msg.targets.length > this.capacity ||
                        msg.targets.some(id => typeof id !== 'string' || id.length > 64)) return;
                    for (const id of new Set(msg.targets)) {
                        const targetWs = this._findSocketById(id);
                        const target = targetWs && this.sessions.get(targetWs);
                        if (target && target !== session && this._visible(session, target)) {
                            this._send(targetWs, { type: 'chat', id: session.id, text, restricted: true });
                        }
                    }
                }
                break;
            }

            case 'report': {
                const reason = sanitizeReportReason(msg.reason);
                if (!reason || typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                const target = targetWs && this.sessions.get(targetWs);
                const hostWs = this._findSocketById(this.hostId);
                const host = hostWs && this.sessions.get(hostWs);
                if (!target || !host || target === session || !this._visible(session, target)) return;
                this._send(hostWs, {
                    type: 'moderation-report',
                    reporter: { id: session.id, name: session.name, pid: session.pid },
                    target: { id: target.id, name: target.name, pid: target.pid },
                    reason
                });
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

            case 'door': {
                // A door is part of the room, not of a person: any guest may push it, the relay keeps the latest state for
                // late joiners, and only the index and one boolean survive. (Block is about people: a blocked guest's
                // frames are simply not relayed to the guest who blocked them.)
                if (!Number.isInteger(msg.door) || msg.door < 0 || msg.door >= MAX_DOORS) return;
                const shut = msg.shut === true;
                this.doors[msg.door] = shut;
                this._relay(session, { type: 'door', id: session.id, door: msg.door, shut }, ws);
                break;
            }

            case 'rtc-signal': {
                if (this.media) return;
                if (typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                const target = targetWs && this.sessions.get(targetWs);
                if (target && this._visible(session, target) && msg.signal && typeof msg.signal === 'object') {
                    this._send(targetWs, { type: 'rtc-signal', from: session.id, signal: msg.signal });
                }
                break;
            }

            case 'sfu':
                if (this.media) this.media.request(session, msg);
                break;

            case 'media-control':
                if (this.media) {
                    if (msg.voice !== undefined && msg.voice !== null && !privateRoomName(this._roomName)) return;
                    this.media.control(session, msg);
                }
                break;

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
                if (target.simulated) this._removedSimulated.add(target.simulatedIndex);
                else try { targetWs.close(msg.type === 'ban' ? CLOSE_BANNED : CLOSE_KICKED, msg.type === 'ban' ? 'banned by the host' : 'removed by the host'); } catch { /* already closing */ }
                this._onClose(targetWs, target);
                break;
            }

            case 'ping':
                // A client that pings is held to it: see _sweep. One that never has (an older build) is left alone.
                session.pinger = true;
                if (Number.isFinite(msg.time) && msg.time >= 0 && msg.time <= Number.MAX_SAFE_INTEGER) {
                    this._send(ws, { type: 'pong', time: msg.time, serverTime: Date.now() });
                }
                break;

            case 'host-transfer': {
                if (session.id !== this.hostId || typeof msg.target !== 'string' || msg.target === session.id) return;
                const targetWs = this._findSocketById(msg.target);
                const target = targetWs && this.sessions.get(targetWs);
                if (!target || target.simulated || !this._visible(session, target)) return;
                this.hostId = target.id;
                if (this.media) {
                    for (const member of this.media.members.values()) member.listen = false;
                    this.media.reconcile();
                }
                this._broadcast({ type: 'host', id: target.id });
                break;
            }

            case 'lock':
                if (session.id !== this.hostId) return;
                this.locked = !!msg.locked;
                this._broadcast({ type: 'room', locked: this.locked });
                this._publishDirectory();
                break;

            default:
                break;
        }
    }

    /** After `session`'s block list changed: tell both sides whoever became invisible has left, and whoever reappeared has joined. */
    _applyBlockChanges(session, before) {
        if (this.media) { this.media.refresh(); this.media.reconcile(); }
        const sessionWs = this._findSocketById(session.id);
        for (const [ws, other] of this.sessions) {
            if (other === session) continue;
            const wasVisible = !before.has(other.pid) && !other.blocked.has(session.pid);
            const isVisible = this._visible(session, other);
            if (wasVisible === isVisible) continue;
            if (isVisible) {
                this._send(ws, { type: 'join', ...this._peerInfo(session) });
                if (session.lastState) this._send(ws, { type: 'state', id: session.id, state: session.lastState });
                if (sessionWs) {
                    this._send(sessionWs, { type: 'join', ...this._peerInfo(other) });
                    if (other.lastState) this._send(sessionWs, { type: 'state', id: other.id, state: other.lastState });
                }
            } else {
                session.poseSent.delete(other.id);
                other.poseSent.delete(session.id);
                this._send(ws, { type: 'leave', id: session.id });
                if (sessionWs) this._send(sessionWs, { type: 'leave', id: other.id });
            }
        }

    }

    /** Latest-state coalescing at 20 Hz, independent of distance or the viewer's floor. */
    _flushPoses(now = Date.now()) {
        this._tickSimulation(now);
        for (const [ws, target] of this.sessions) {
            if (!target.poseBatch) continue;
            const states = [];
            for (const source of this.sessions.values()) {
                if (source === target || !source.lastState || !this._visible(source, target)) continue;
                const pose = source.lastState;
                const previous = target.poseSent.get(source.id);
                if (previous && (previous.state === pose || now - previous.at < 50)) continue;
                states.push({ id: source.id, state: pose });
                target.poseSent.set(source.id, { state: pose, at: now });
            }
            if (states.length) this._send(ws, { type: 'states', states });
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
        if (this.sessions.size && now - this._directoryUpdatedAt >= ROOM_DIRECTORY_REFRESH) this._publishDirectory();
    }

    _startSweeper() {
        if (this._sweeper) return;
        this._sweeper = setInterval(() => this._sweep(), SWEEP_INTERVAL_MS);
        if (this._sweeper && typeof this._sweeper.unref === 'function') this._sweeper.unref();
    }

    _onClose(ws, session) {
        if (!this.sessions.has(ws)) return;
        this.sessions.delete(ws);
        if (session.simulated) this._simulation?.remove(session.simulatedIndex);
        else if (this.media) this.media.remove(session);
        for (const other of this.sessions.values()) other.poseSent.delete(session.id);

        if (!session.simulated && ![...this.sessions.values()].some(other => !other.simulated)) {
            this._simulation = null;
            for (const [actor, other] of [...this.sessions]) this._onClose(actor, other);
        }
        if (this.hostId === session.id) {
            const next = [...this.sessions.values()].find(other => !other.simulated);
            this.hostId = next?.id || null;
            if (this.media) {
                for (const member of this.media.members.values()) member.listen = false;
                this.media.reconcile();
            }
            if (this.hostId) this._broadcast({ type: 'host', id: this.hostId });
        }
        // An empty room starts over. The lock in particular must go: with nobody left to unlock it, every newcomer
        // (the host who locked it included, reconnecting after a dropped connection) would be refused with 4012 until
        // the Durable Object happened to be evicted, and each refused attempt keeps it alive.
        if (!this.sessions.size) {
            if (this._poseTimer) clearInterval(this._poseTimer);
            this._poseTimer = null;
            if (this._sweeper) clearInterval(this._sweeper);
            this._sweeper = null;
            this.hostId = null;
            this.musicState = null;
            this.showState = null;
            this.doors.fill(false);
            this.world = null;
            this.locked = false;
            this.banned.clear();
            this._simulation = null;
            this._simulatedPids.clear();
            this._removedSimulated.clear();
        }
        this._relay(session, { type: 'leave', id: session.id });
        this._publishDirectory();
        if (!session.simulated) this._fillSimulation();
    }

    _publishDirectory() {
        if (!this.env.DB || !this._roomName || privateRoomName(this._roomName)) return;
        const room = this._roomName, people = this.sessions.size, locked = this.locked;
        this._directoryUpdatedAt = Date.now();
        this._directoryWrite = this._directoryWrite.then(() => publishRoom(this.env.DB, room, people, locked))
            .catch(error => { console.error('[Rooms] Presence update failed', { name: error.name }); });
        this.state.waitUntil(this._directoryWrite);
    }

    _findSocketById(id) {
        if (!id) return null;
        for (const [ws, session] of this.sessions) {
            if (session.id === id) return ws;
        }
        return null;
    }

    _send(ws, obj) {
        if (ws.simulated) return;
        try { ws.send(JSON.stringify(obj)); } catch { /* socket already closing */ }
    }

    _broadcast(obj, exclude) {
        const data = JSON.stringify(obj);
        for (const ws of this.sessions.keys()) {
            if (ws === exclude || ws.simulated) continue;
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
        if (url.pathname === '/directory-status') return new Response('not found', { status: 404 });
        const directory = await handleRoomDirectory(request, env, new URL(origin).origin);
        if (directory) return directory;
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket upgrade', { status: 426 });

        const room = (url.searchParams.get('room') || 'lobby').slice(0, MAX_ROOM_NAME_LENGTH);
        const forwarded = new Request(request);
        const headers = forwarded.headers;
        headers.delete(DEV_OWNER_HEADER);
        if (room === DEV_ROOM) {
            const denied = await devRoomAccess(request, env);
            if (denied) return Response.json(denied, { status: denied.status, headers: { 'cache-control': 'no-store' } });
            headers.set(DEV_OWNER_HEADER, 'verified');
        }
        headers.delete('Cookie');
        const id = env.CLUB_ROOM.idFromName(room);
        const stub = env.CLUB_ROOM.get(id);
        return stub.fetch(forwarded);
    }
};
