import { RoomMedia, mediaTransport } from './sfu.js';

export const LIVE_EVENT_LIMITS = Object.freeze({
    rooms: 8, lifetimeMs: 12 * 60 * 60 * 1000, reservationMs: 15000,
    membershipMs: 45000, authMs: 10000, idleMs: 45000, maxConnections: 257
});
export const LIVE_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECRET = /^[0-9a-f]{64}$/;
const PID = /^[0-9a-f]{16}$/;
const secret = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
export function opusDescription(value) {
    if (value?.type !== 'offer' || typeof value.sdp !== 'string' || value.sdp.length > 60 * 1024 ||
        (value.sdp.match(/^m=audio\s/gm) || []).length !== 1 || /^m=(?!audio\s)/m.test(value.sdp)) return null;
    const payload = /^a=rtpmap:(\d+) opus\/48000(?:\/2)?\r?$/mi.exec(value.sdp)?.[1];
    if (!payload) return null;
    const lines = value.sdp.split(/\r?\n/);
    const audio = lines.find(line => line.startsWith('m=audio ')).split(/\s+/);
    if (!audio.slice(3).includes(payload)) return null;
    return { type: 'offer', sdp: lines.filter(line => {
        const mapped = /^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)\b/.exec(line);
        return !mapped || mapped[1] === payload;
    }).map(line => line.startsWith('m=audio ') ? [...audio.slice(0, 3), payload].join(' ') : line).join('\r\n') };
}
export async function liveTokenHash(kind, value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nocturne-live-${kind}-v1:${value}`));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function liveEventsEnabled(env) {
    return !!env.DB && !!env.LIVE_AUDIO_EVENT && mediaTransport(env) === 'sfu';
}
export function liveEventStub(env, id) {
    return env.LIVE_AUDIO_EVENT.get(env.LIVE_AUDIO_EVENT.idFromName(id));
}
export async function consumeLiveRate(env, scope, subject, limit, windowMs) {
    if (!env.DB) throw new Error('Live events require a D1 DB binding for durable usage limits.');
    const now = Date.now();
    const key = `live:${scope}:${await liveTokenHash('rate', subject)}`;
    const result = await env.DB.prepare(`INSERT INTO access_rate_limits (key, count, expires_at) VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN expires_at <= ? THEN 1 ELSE MIN(count + 1, ?) END,
        expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
        RETURNING count`).bind(key, now + windowMs, now, limit + 1, now).first();
    if (scope.endsWith('-global') && result?.count === 1) {
        await env.DB.prepare(`DELETE FROM access_rate_limits WHERE key IN
            (SELECT key FROM access_rate_limits WHERE key LIKE 'live:%' AND expires_at < ? LIMIT 128)`).bind(now).run();
    }
    return !!result && result.count <= limit;
}
export async function liveEventCall(env, id, action, body = {}) {
    const response = await liveEventStub(env, id).fetch(new Request(`https://event.internal/${action}`, {
        method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
    }));
    const result = await response.json();
    if (!response.ok) {
        const error = new Error(result.error || 'Live event unavailable.');
        error.status = response.status;
        throw error;
    }
    return result;
}

/** One SQLite-backed coordinator per event; storage KV uses the SQLite DO backend. */
export class LiveAudioEvent {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.event = null;
        this.sessions = new Map();
        this.hostId = null;
        this.mediaRequestDeadlineMs = 15000;
        this.queue = Promise.resolve();
        this.ready = state.storage.get('event').then(async value => {
            this.event = value || null;
            if (this.event?.live) {
                this.event.live = false;
                await this._save();
                this._notify();
            }
        });
        this.media = new RoomMedia(this, env);
    }

    _send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch { /* close handler owns cleanup */ } }
    _findSocketById(id) { return [...this.sessions].find(([, member]) => member.id === id)?.[0]; }
    _visible(a, b) {
        const publisher = a.role === 'publisher' ? a : b;
        const listener = a.role === 'listener' ? a : b;
        const ticket = this.event?.members[listener.member];
        return publisher.role === 'publisher' && listener.role === 'listener' &&
            !!ticket && ticket.expires > Date.now() && !ticket.blocked.includes(this.event.owner) &&
            !this.event.ownerBlocks.includes(ticket.pid) && !this.event.denied.includes(ticket.pid) &&
            !this.event.ended && this.hostId === publisher.id;
    }
    _summary() {
        return { id: this.event.id, title: this.event.title, live: !!this.event.live, ended: !!this.event.ended };
    }
    _mediaChanged() {
        if (!this.event) return;
        const publisher = this.media.members.get(this.hostId);
        const live = !this.event.ended && !!publisher?.slots.musicPub?.ready &&
            publisher.music?.available === true && publisher.music?.playing === true;
        if (live !== this.event.live) {
            this.event.live = live;
            this.state.waitUntil(this._run(async () => { await this._save(); this._notify(); }));
        }
    }
    async _authorizeMedia(session) {
        if (!this.sessions.has(this._findSocketById(session.id)) || this.event.ended || this.event.expires <= Date.now()) throw new Error('Media revoked');
        if (session.role === 'publisher') {
            if (session.id !== this.hostId) throw new Error('Publisher revoked');
            return;
        }
        const ticket = this.event.members[session.member];
        if (!ticket || ticket.expires <= Date.now()) throw new Error('Listener revoked');
        const result = await this._room(ticket.room).fetch(new Request('https://room.internal/live-member', {
            method: 'POST', body: JSON.stringify({ event: this.event.id, member: session.member, pid: ticket.pid }),
            signal: AbortSignal.timeout(5000)
        }));
        if (!result.ok) throw new Error('Listener departed');
    }
    _info(pid, room, token) {
        return { ...this._summary(), roomIndex: this.event.rooms.indexOf(room),
            canManage: pid === this.event.owner, ...(token ? { listenerToken: token } : {}) };
    }
    async _save() { await this.state.storage.put('event', this.event); }
    _run(task) {
        const result = this.queue.then(task);
        this.queue = result.catch(() => {});
        return result;
    }
    _room(room) { return this.env.CLUB_ROOM.get(this.env.CLUB_ROOM.idFromName(room)); }
    _notify() {
        const event = this._summary();
        for (const [ws] of this.sessions) this._send(ws, { type: 'event-status', event });
        for (const room of this.event.rooms) {
            this.state.waitUntil(this._room(room).fetch(new Request('https://room.internal/live-state', {
                method: 'POST', body: JSON.stringify({ event }), signal: AbortSignal.timeout(5000)
            })).catch(() => {}));
        }
    }
    async _ticket(member, pid, room, blocked = []) {
        if (!PID.test(pid) || typeof member !== 'string' || member.length > 64) throw new Error('Invalid event member.');
        const token = secret();
        this.event.members[member] = { pid, room, hash: await liveTokenHash('listener', token),
            blocked: blocked.slice(0, 64), expires: Date.now() + LIVE_EVENT_LIMITS.membershipMs };
        return { member, event: this._info(pid, room, token) };
    }
    _revoke(member) {
        delete this.event.members[member];
        for (const [ws, session] of [...this.sessions]) {
            if (session.member === member) this._close(ws, 4010, 'Event membership ended');
        }
    }
    _close(ws, code = 1000, reason = 'Event media ended') {
        const session = this.sessions.get(ws);
        this.sessions.delete(ws);
        clearTimeout(session?.authTimer);
        if (session) this.media.remove(session);
        try { ws.close(code, reason); } catch { /* already closed */ }
        if (session?.role === 'publisher') {
            this.hostId = null;
            if (this.event?.live) {
                this.event.live = false;
                this.state.waitUntil(this._run(async () => { await this._save(); this._notify(); }));
            }
        }
    }
    async _end() {
        this.event.ended = true;
        this.event.live = false;
        this.event.publisherHash = null;
        this.event.reservations = {};
        await this._save();
        this._notify();
        for (const [ws] of [...this.sessions]) this._close(ws);
    }
    async _prune() {
        const now = Date.now();
        for (const [id, reservation] of Object.entries(this.event.reservations)) {
            if (reservation.expires <= now) delete this.event.reservations[id];
        }
        for (const [id, member] of Object.entries(this.event.members)) {
            if (member.expires <= now) this._revoke(id);
        }
        if (!this.event.ended && this.event.expires <= now) await this._end();
    }
    async fetch(request) {
        await this.ready;
        const path = new URL(request.url).pathname;
        if (path.endsWith('/media')) return this._upgrade(request);
        if (request.method !== 'POST') return Response.json({ error: 'Not found.' }, { status: 404 });
        return this._run(async () => {
            try {
                const body = await request.json();
                if (this.event) await this._prune();
                const result = await this._action(path.slice(1), body);
                return Response.json(result, { headers: { 'cache-control': 'no-store' } });
            } catch (error) {
                return Response.json({ error: error.message }, { status: error.status || 403 });
            }
        });
    }
    async _action(action, body) {
        if (action === 'create') {
            if (this.event || !LIVE_EVENT_ID.test(body.id) || !PID.test(body.owner) ||
                typeof body.room !== 'string' || body.room.length > 64) throw new Error('Cannot create event.');
            const token = secret();
            const now = Date.now();
            this.event = { id: body.id, title: typeof body.title === 'string'
                ? body.title.replace(/[\p{C}]/gu, '').trim().slice(0, 120) || 'Live DJ set' : 'Live DJ set',
                owner: body.owner, ownerBlocks: body.ownerBlocks || [], rooms: [body.room],
                capacity: Math.min(32, Math.max(1, Number(body.capacity) || 32)),
                publisherHash: await liveTokenHash('publisher', token), expires: now + LIVE_EVENT_LIMITS.lifetimeMs,
                live: false, ended: false, locked: !!body.locked, denied: (body.banned || []).slice(0, 512),
                reservations: {}, members: {} };
            const tickets = [];
            for (const member of (body.members || []).slice(0, 32)) {
                tickets.push(await this._ticket(member.id, member.pid, body.room, member.blocked));
            }
            await this._save();
            await this.state.storage.setAlarm(now + 10000);
            return { event: this._info(body.owner, body.room), publisherToken: token, tickets };
        }
        if (!this.event) throw new Error('Unknown live event.');
        if (action === 'info') return { event: this._info(body.pid, body.room) };
        if (action === 'rotate' || action === 'end') {
            if (body.pid !== this.event.owner) throw new Error('Only the event creator can manage it.');
            if (this.event.ended) throw new Error('This event has ended.');
            if (action === 'end') { await this._end(); return { event: this._info(body.pid, body.room) }; }
            const token = secret();
            this.event.publisherHash = await liveTokenHash('publisher', token);
            for (const [ws, member] of [...this.sessions]) if (member.role === 'publisher') this._close(ws, 4010, 'Publisher invitation rotated');
            this.event.live = false;
            await this._save();
            this._notify();
            return { event: this._info(body.pid, body.room), publisherToken: token };
        }
        if (action === 'leave') {
            this._revoke(body.member);
            await this._save();
            return {};
        }
        if (action === 'heartbeat') {
            for (const member of (body.members || []).slice(0, 32)) {
                const ticket = this.event.members[member.id];
                if (!ticket || ticket.room !== body.room || ticket.pid !== member.pid) continue;
                ticket.expires = Date.now() + LIVE_EVENT_LIMITS.membershipMs;
                ticket.blocked = member.blocked.slice(0, 64);
                if (ticket.pid === this.event.owner) this.event.ownerBlocks = ticket.blocked;
            }
            this.media.refresh();
            this.media.reconcile();
            await this._save();
            return {};
        }
        if (action === 'policy') {
            if (!this.event.rooms.includes(body.room)) throw new Error('Unknown event room.');
            if (typeof body.locked === 'boolean') this.event.locked = body.locked;
            if (PID.test(body.denied) && !this.event.denied.includes(body.denied)) {
                if (this.event.denied.length >= 512) {
                    // Never evict an earlier ban or let overflow bypass a full policy ledger.
                    await this._end();
                    return {};
                }
                this.event.denied.push(body.denied);
                for (const [id, member] of Object.entries(this.event.members)) if (member.pid === body.denied) this._revoke(id);
                for (const room of this.event.rooms) this.state.waitUntil(this._room(room).fetch(new Request('https://room.internal/live-deny', {
                    method: 'POST', body: JSON.stringify({ event: this.event.id, pid: body.denied }), signal: AbortSignal.timeout(5000)
                })).catch(() => {}));
            }
            await this._save();
            return {};
        }
        if (this.event.ended) { const error = new Error('This event has ended.'); error.status = 410; throw error; }
        if (this.event.locked || this.event.denied.includes(body.pid)) throw new Error('Event admission denied.');
        if (!PID.test(body.pid)) throw new Error('Invalid event identity.');
        if (action === 'reserve') {
            const access = await this._room(this.event.rooms[0]).fetch(new Request('https://room.internal/live-access', {
                method: 'POST', body: JSON.stringify({ pid: body.pid }), signal: AbortSignal.timeout(5000)
            }));
            if (!access.ok) throw new Error('Original room is unavailable.');
            const policy = await access.json();
            if (policy.locked || policy.banned) throw new Error('Original room admission denied.');
            const rooms = body.room ? [body.room] : this.event.rooms;
            let room = rooms.find(name => this.event.rooms.includes(name) && !(body.exclude || []).includes(name) &&
                Object.values(this.event.members).filter(m => m.room === name).length +
                Object.values(this.event.reservations).filter(r => r.room === name).length < this.event.capacity);
            if (!room && !body.room && this.event.rooms.length < LIVE_EVENT_LIMITS.rooms) {
                room = `private-live-${this.event.id}-${this.event.rooms.length}`;
                this.event.rooms.push(room);
            }
            if (!room) { const error = new Error('All event rooms are full.'); error.status = 409; throw error; }
            const reservation = crypto.randomUUID();
            this.event.reservations[reservation] = { pid: body.pid, room, expires: Date.now() + LIVE_EVENT_LIMITS.reservationMs };
            await this._save();
            return { room, reservation, event: this._summary(),
                ownerOnlyRoot: this.event.rooms[0] === 'private-000032' };
        }
        if (action === 'cancel') {
            delete this.event.reservations[body.reservation];
            await this._save();
            return {};
        }
        if (action === 'admit') {
            const reservation = this.event.reservations[body.reservation];
            if (!reservation || reservation.pid !== body.pid || reservation.room !== body.room) throw new Error('Admission reservation expired.');
            delete this.event.reservations[body.reservation];
            const result = await this._ticket(body.member, body.pid, body.room);
            await this._save();
            return result;
        }
        throw new Error('Unknown event action.');
    }
    async _upgrade(request) {
        if (!this.event || this.event.ended || this.event.expires <= Date.now()) return new Response('Event ended', { status: 410 });
        if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
        if (this.sessions.size >= LIVE_EVENT_LIMITS.maxConnections) return new Response('Event media full', { status: 429 });
        const [client, server] = Object.values(new WebSocketPair());
        this._acceptMedia(server);
        return new Response(null, { status: 101, webSocket: client });
    }
    _acceptMedia(ws) {
        ws.accept();
        const session = { id: crypto.randomUUID(), role: null, at: Date.now(), rateAt: Date.now(), frames: 0, busy: false };
        this.sessions.set(ws, session);
        const timer = setTimeout(() => { if (!session.role) this._close(ws, 4008, 'Event authentication required'); }, LIVE_EVENT_LIMITS.authMs);
        session.authTimer = timer;
        timer.unref?.();
        ws.addEventListener('message', event => {
            void this._onMedia(ws, session, event).catch(() => this._close(ws, 4003, 'Event media denied'));
        });
        const close = () => { clearTimeout(timer); this._close(ws); };
        ws.addEventListener('close', close);
        ws.addEventListener('error', close);
        return session;
    }
    async _onMedia(ws, session, frame) {
        if (!this.sessions.has(ws) || typeof frame.data !== 'string' || frame.data.length > 64 * 1024) return this._close(ws, 4008);
        const now = Date.now();
        if (now - session.rateAt > 1000) { session.rateAt = now; session.frames = 0; }
        if (++session.frames > 12) return this._close(ws, 4008, 'Event media rate exceeded');
        session.at = now;
        let msg;
        try { msg = JSON.parse(frame.data); } catch { return this._close(ws, 4003); }
        if (!session.role) {
            if (session.busy || msg?.type !== 'event-auth' || !['publisher', 'listener'].includes(msg.role) || !SECRET.test(msg.token || '')) return this._close(ws, 4003);
            session.busy = true;
            const hash = await liveTokenHash(msg.role, msg.token);
            try { await this._run(async () => {
                await this._prune();
                if (!this.sessions.has(ws) || this.event.ended) throw new Error('Event ended');
                if (msg.role === 'publisher') {
                    if (hash !== this.event.publisherHash || this.hostId) throw new Error('Publisher denied');
                    session.role = 'publisher';
                    session.pid = this.event.owner;
                    this.hostId = session.id;
                } else {
                    const entry = Object.entries(this.event.members).find(([, ticket]) => ticket.hash === hash);
                    if (!entry || [...this.sessions.values()].some(other => other.member === entry[0])) throw new Error('Listener denied');
                    const [member, ticket] = entry;
                    // The social room is authoritative even if its departure notification is in flight.
                    const response = await this._room(ticket.room).fetch(new Request('https://room.internal/live-member', {
                        method: 'POST', body: JSON.stringify({ event: this.event.id, member, pid: ticket.pid }),
                        signal: AbortSignal.timeout(5000)
                    }));
                    if (!response.ok) throw new Error('Listener has departed');
                    session.role = 'listener';
                    session.member = member;
                    session.pid = ticket.pid;
                }
                this._send(ws, { type: 'live-welcome', id: session.id, role: session.role, event: this._summary() });
                clearTimeout(session.authTimer);
                this.media.add(session);
            }); } catch (error) {
                this._send(ws, { type: 'event-auth-error', error: 'Event authorization failed or invitation revoked.' });
                this._close(ws, 4003, 'Event authorization failed');
                throw error;
            }
            return;
        }
        if (this.event.ended || now >= this.event.expires) return this._close(ws);
        if (session.role === 'listener' && !this.event.members[session.member]) return this._close(ws, 4010);
        if (msg.type === 'ping') {
            this._send(ws, { type: 'pong', ...(Number.isFinite(msg.time) ? { time: msg.time } : {}), serverTime: now });
            return;
        }
        if (msg.type === 'media-control') {
            this.media.control(session, session.role === 'publisher' ? { music: msg.music } : { listen: msg.listen });
        } else if (msg.type === 'sfu') {
            const slot = session.role === 'publisher' ? 'musicPub' : 'musicRx';
            const description = msg.action === 'publish' ? opusDescription(msg.description) : null;
            if (msg.slot !== slot || (msg.action === 'publish' && !description)) {
                this._send(ws, { type: 'sfu-result', request: msg.request, error: 'Only event Opus audio is allowed.' });
                return;
            }
            this.media.request(session, description ? { ...msg, description } : msg);
        }
    }
    async alarm() {
        await this.ready;
        await this._run(async () => {
            if (!this.event) return;
            await this._prune();
            for (const [ws, session] of [...this.sessions]) if (Date.now() - session.at > LIVE_EVENT_LIMITS.idleMs) this._close(ws, 4013, 'No media heartbeat');
            await this._save();
            if (!this.event.ended || this.media.cleanup.size) await this.state.storage.setAlarm(Date.now() + 10000);
        });
        await this.media._enqueue(() => this.media.retryCleanup());
    }
}
