/**
 * Room-owned SFU authorization. No public session IDs, track locators or API proxy:
 * every operation is bound to an admitted socket and one of four audio-only slots.
 */
export function mediaTransport(env = {}) {
    if (env.MEDIA_TRANSPORT !== undefined && !['mesh', 'sfu'].includes(env.MEDIA_TRANSPORT)) {
        throw new Error('MEDIA_TRANSPORT must be mesh or sfu.');
    }
    if (env.MEDIA_TRANSPORT !== 'sfu') return 'mesh';
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(env.SFU_APP_ID || '') || !env.SFU_APP_SECRET) {
        throw new Error('SFU mode requires SFU_APP_ID and SFU_APP_SECRET.');
    }
    return 'sfu';
}

const SLOTS = ['voicePub', 'musicPub', 'voiceRx', 'musicRx'];
const SDP_LIMIT = 60 * 1024;
function description(value, type) {
    if (!value || value.type !== type || typeof value.sdp !== 'string' || !value.sdp ||
        value.sdp.length > SDP_LIMIT) throw new Error('Invalid audio session description.');
    // Publication is audio only: a hostile client cannot allocate video/data channels.
    if (/^m=(?!audio\s)/m.test(value.sdp)) throw new Error('Only audio media is allowed.');
    return { type, sdp: value.sdp };
}

export class RoomMedia {
    constructor(room, env) {
        this.room = room;
        this.env = env;
        this.members = new Map();
        this.queue = Promise.resolve();
        this.cleanup = new Set();
        this.retryTimer = null;
        this.reconcileQueued = false;
        if (room.state.storage) {
            void this._enqueue(async () => {
                for (const slot of await room.state.storage.get('sfuCleanup') || []) {
                    slot.tracks = slot.tracks.map(track => typeof track === 'string' ? { mid: track } : track);
                    this.cleanup.add(slot);
                }
                await this.retryCleanup();
            });
        }
    }

    add(session) {
        this.members.set(session.id, { session, audience: null, listen: false, music: null, slots: {},
            requests: 0, allocations: [] });
        this.refresh();
    }

    _enqueue(task) {
        const result = this.queue.then(task);
        this.queue = result.catch(() => {});
        if (this.room.state.waitUntil) this.room.state.waitUntil(this.queue);
        return result;
    }

    control(session, msg) {
        const member = this.members.get(session.id);
        if (!member) return;
        if (Object.hasOwn(msg, 'voice')) {
            if (msg.voice !== null && (!Array.isArray(msg.voice) || msg.voice.length > 32 ||
                msg.voice.some(id => typeof id !== 'string' || id.length > 64))) return;
            member.audience = msg.voice === null ? null : new Set(msg.voice);
        }
        if (typeof msg.listen === 'boolean') member.listen = msg.listen;
        if (Object.hasOwn(msg, 'music') && session.id === this.room.hostId) {
            const music = msg.music;
            member.music = music && typeof music === 'object'
                ? { available: music.available === true, playing: music.playing === true,
                    title: typeof music.title === 'string' ? music.title.slice(0, 200) : '' } : null;
        }
        // Policy changes take effect synchronously, before any in-flight allocation finishes.
        this.refresh();
        this.reconcile();
    }

    allowed(receiver, publisher, kind) {
        if (!receiver || !publisher || receiver === publisher ||
            !this.room._visible(receiver.session, publisher.session)) return false;
        if (kind === 'music') return receiver.listen && publisher.session.id === this.room.hostId &&
            publisher.music?.available === true;
        return publisher.audience === null || publisher.audience.has(receiver.session.id);
    }

    refresh() {
        for (const member of this.members.values()) {
            const tracks = [];
            for (const publisher of this.members.values()) {
                for (const kind of ['voice', 'music']) {
                    const slot = publisher.slots[`${kind}Pub`];
                    if (slot?.ready && this.allowed(member, publisher, kind)) {
                        tracks.push({ owner: publisher.session.id, kind, version: slot.version });
                    }
                }
            }
            const host = this.members.get(this.room.hostId);
            const music = host && host !== member && this.room._visible(member.session, host.session)
                ? host.music : null;
            this.send(member.session.id, { type: 'media-catalog', tracks,
                music: music || { available: false, playing: false, title: '' } });
        }
    }

    send(id, message) {
        const ws = this.room._findSocketById(id);
        if (ws) this.room._send(ws, message);
    }

    request(session, msg) {
        if (!Number.isSafeInteger(msg.request) || msg.request < 1 || !SLOTS.includes(msg.slot)) return;
        const queued = this.members.get(session.id);
        if (!queued) return;
        if (queued.requests >= 2) {
            this.send(session.id, { type: 'sfu-result', request: msg.request, error: 'SFU negotiation is busy. Retry media.' });
            return;
        }
        queued.requests++;
        void this._enqueue(async () => {
            const member = this.members.get(session.id);
            if (!member) { queued.requests--; return; }
            try {
                const result = await this._request(member, msg);
                this.send(session.id, { type: 'sfu-result', request: msg.request, result });
            } catch {
                // Neither provider responses nor credential-bearing request URLs escape.
                await this._retire(member, msg.slot);
                this.send(session.id, { type: 'sfu-result', request: msg.request,
                    error: 'SFU operation failed. Retry media or reconnect to the room.' });
            }
            queued.requests--;
            this.refresh();
            this.reconcile();
        });
    }

    async _api(path, method, body) {
        const response = await fetch(`https://rtc.live.cloudflare.com/v1/apps/${this.env.SFU_APP_ID}/${path}`, {
            method,
            headers: { Authorization: `Bearer ${this.env.SFU_APP_SECRET}`, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: globalThis.AbortSignal.timeout(10000)
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let text = '', bytes = 0;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bytes += value.byteLength;
                if (bytes > 256 * 1024) { await reader.cancel(); throw new Error('SFU response too large'); }
                text += decoder.decode(value, { stream: true });
            }
            text += decoder.decode();
        } finally { reader.releaseLock(); }
        const result = JSON.parse(text);
        if (!response.ok || result.errorCode) {
            const error = new Error('SFU API failed');
            error.status = response.status;
            error.code = result.errorCode;
            throw error;
        }
        return result;
    }

    async _slot(member, name) {
        let slot = member.slots[name];
        if (slot) return slot;
        if (this.cleanup.size >= 128) throw new Error('SFU cleanup backlog requires recovery');
        const now = Date.now();
        member.allocations = member.allocations.filter(at => now - at < 1000);
        if (member.allocations.length >= 4) throw new Error('Session allocation rate exceeded');
        member.allocations.push(now);
        const result = await this._api('sessions/new', 'POST');
        if (typeof result.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(result.sessionId)) {
            throw new Error('Invalid SFU session');
        }
        slot = { id: result.sessionId, tracks: [], pending: false, ready: false, version: crypto.randomUUID() };
        member.slots[name] = slot;
        return slot;
    }

    async _request(member, msg) {
        const { slot: name, action } = msg;
        if (action === 'close') {
            await this._retire(member, name);
            return {};
        }
        if (!this.members.has(member.session.id)) throw new Error('Departed member');
        const kind = name.startsWith('voice') ? 'voice' : 'music';
        if (name.endsWith('Pub') && kind === 'music' && member.session.id !== this.room.hostId) {
            throw new Error('Only host publishes music');
        }
        if (!['publish', 'subscribe', 'answer', 'ready'].includes(action)) throw new Error('Unknown operation');
        if (action === 'publish') {
            if (!name.endsWith('Pub') || member.slots[name]) throw new Error('Publication already allocated');
            description(msg.description, 'offer');
            if ((msg.description.sdp.match(/^m=audio\s/gm) || []).length !== 1) throw new Error('Publish one audio track');
            if (typeof msg.mid !== 'string' || !/^\d{1,5}$/.test(msg.mid)) throw new Error('Invalid mid');
        } else if (action === 'subscribe') {
            if (!name.endsWith('Rx') || !Array.isArray(msg.owners) || !msg.owners.length ||
                msg.owners.length > 8 || new Set(msg.owners).size !== msg.owners.length) throw new Error('Invalid subscriptions');
            for (const id of msg.owners) {
                const publisher = this.members.get(id);
                if (!this.allowed(member, publisher, kind) || !publisher.slots[`${kind}Pub`]?.ready) {
                    throw new Error('Subscription denied');
                }
            }
        }
        if ((action === 'answer' || action === 'ready') && !member.slots[name]) throw new Error('No pending session');
        const slot = await this._slot(member, name);
        if (action === 'answer') {
            if (!slot.pending || !name.endsWith('Rx')) throw new Error('No pending offer');
            await this._api(`sessions/${slot.id}/renegotiate`, 'PUT', {
                sessionDescription: description(msg.description, 'answer')
            });
            slot.pending = false;
            return {};
        }
        if (action === 'ready') {
            if (!name.endsWith('Pub') || !slot.pending) throw new Error('No pending publication');
            slot.pending = false;
            slot.ready = true;
            return {};
        }
        if (slot.pending) throw new Error('Negotiation not complete');
        let requested;
        if (action === 'publish') {
            requested = [{ location: 'local', mid: msg.mid, trackName: kind }];
        } else {
            requested = msg.owners.map(id => {
                const publisher = this.members.get(id);
                const pub = publisher.slots[`${kind}Pub`];
                if (slot.tracks.some(track => track.owner === id && track.version === pub.version)) {
                    throw new Error('Duplicate subscription');
                }
                return { location: 'remote', sessionId: pub.id, trackName: kind };
            });
        }
        // If the HTTP reply is lost, the provider may still allocate. Retain this
        // session for inspection/forced cleanup; never replay tracks/new on it.
        slot.uncertain = true;
        slot.attemptedOwners = action === 'subscribe' ? [...msg.owners] : [];
        await this._persistCleanup();
        const result = await this._api(`sessions/${slot.id}/tracks/new`, 'POST', {
            tracks: requested,
            ...(action === 'publish' ? { sessionDescription: description(msg.description, 'offer') } : {})
        });
        // Retain partial allocations before validating errors, so cleanup closes them too.
        for (const [index, track] of (result.tracks || []).entries()) {
            if (typeof track.mid === 'string' && !track.errorCode) {
                const matched = requested.findIndex(item => item.sessionId && item.sessionId === track.sessionId);
                const owner = action === 'publish' ? member.session.id : msg.owners[matched >= 0 ? matched : index];
                slot.tracks.push({ mid: track.mid, owner,
                    version: action === 'publish' ? slot.version : this.members.get(owner)?.slots[`${kind}Pub`]?.version });
            }
        }
        slot.uncertain = false;
        await this._persistCleanup();
        if (!Array.isArray(result.tracks) || result.tracks.length !== requested.length ||
            result.tracks.some(track => track.errorCode || typeof track.mid !== 'string') ||
            !result.sessionDescription || result.sessionDescription.type !== (action === 'publish' ? 'answer' : 'offer')) {
            throw new Error('Allocation failed');
        }
        slot.pending = true;
        // Membership/audience may have changed while fetch was in flight.
        if (!this.members.has(member.session.id) || (kind === 'music' && name.endsWith('Pub') &&
            member.session.id !== this.room.hostId) || (action === 'subscribe' &&
            msg.owners.some(id => !this.allowed(member, this.members.get(id), kind)))) {
            throw new Error('Policy changed');
        }
        return { sessionDescription: result.sessionDescription,
            tracks: slot.tracks.map(({ mid, owner, version }) => ({ mid, owner, kind, version })) };
    }

    reconcile() {
        if (this.reconcileQueued) return;
        this.reconcileQueued = true;
        void this._enqueue(async () => {
            this.reconcileQueued = false;
            for (const member of this.members.values()) {
                if (member.session.id !== this.room.hostId && member.slots.musicPub) {
                    await this._retire(member, 'musicPub');
                    member.music = null;
                }
                for (const kind of ['voice', 'music']) {
                    const name = `${kind}Rx`, slot = member.slots[name];
                    if (!slot) continue;
                    if (slot.tracks.some(track => {
                        const publisher = this.members.get(track.owner);
                        const pub = publisher?.slots[`${kind}Pub`];
                        return !this.allowed(member, publisher, kind) || !pub?.ready || pub.version !== track.version;
                    })) {
                        // Retire the entire receive connection, including pending SDP, rather than
                        // mutating an abandoned negotiation. Allowed tracks are rebuilt on a new one.
                        await this._retire(member, name);
                        this.send(member.session.id, { type: 'media-reset', slot: name });
                    }
                }
            }
            this.refresh();
        });
    }

    async _retire(member, name) {
        const slot = member.slots[name];
        if (!slot) return true;
        delete member.slots[name];
        slot.ready = false;
        if (slot.tracks.length || slot.uncertain) {
            this.cleanup.add(slot);
            await this._persistCleanup();
            const owners = new Set([...slot.tracks.map(track => track.owner), ...(slot.attemptedOwners || [])]);
            const closed = await this._close(slot);
            if (!closed && name.endsWith('Rx')) {
                const kind = name.startsWith('voice') ? 'voice' : 'music';
                // A revoked receiver must not keep a live source during a provider
                // close failure. Withdraw/force-close affected publications too.
                for (const owner of owners) {
                    const publisher = this.members.get(owner);
                    if (!publisher) continue;
                    await this._retire(publisher, `${kind}Pub`);
                    this.send(owner, { type: 'media-reset', slot: `${kind}Pub`,
                        error: 'SFU permission cleanup failed. Media stopped; retry after the service recovers.' });
                }
            }
            return closed;
        }
        return true;
    }

    async _close(slot) {
        try {
            if (slot.uncertain) {
                const snapshot = await this._api(`sessions/${slot.id}`, 'GET');
                for (const track of snapshot.tracks || []) {
                    if (track.status !== 'inactive' && typeof track.mid === 'string' &&
                        !slot.tracks.some(old => old.mid === track.mid)) slot.tracks.push({ mid: track.mid });
                }
            }
            if (!slot.tracks.length) {
                if (slot.uncertain) throw new Error('Uncertain allocation still requires cleanup');
                this.cleanup.delete(slot);
                await this._persistCleanup();
                return true;
            }
            const result = await this._api(`sessions/${slot.id}/tracks/close`, 'PUT', {
                force: true, tracks: slot.tracks.map(track => ({ mid: track.mid }))
            });
            slot.tracks = slot.tracks.filter(track => !(result.tracks || []).some(closed =>
                closed.mid === track.mid && (!closed.errorCode || closed.errorCode === 'close_track_error')));
            if (slot.tracks.length || slot.uncertain) throw new Error('Close still requires cleanup');
            this.cleanup.delete(slot);
            await this._persistCleanup();
            return true;
        } catch (error) {
            if (error.status === 410 && error.code === 'session_error') {
                this.cleanup.delete(slot);
                await this._persistCleanup();
                return true;
            }
            // Fail closed locally and retain unresolved provider cleanup. Retrying known
            // forced-close mids is safe; never reuse this retired session.
            await this._persistCleanup();
            if (this.room.state.storage) {
                try { await this.room.state.storage.setAlarm(Date.now() + 1000); }
                catch (alarmError) { console.error('[SFU] Cleanup alarm failed', { name: alarmError.name }); }
            }
            if (!this.retryTimer) {
                this.retryTimer = setTimeout(() => {
                    this.retryTimer = null;
                    void this._enqueue(() => this.retryCleanup());
                }, 1000);
                this.retryTimer.unref?.();
            }
            return false;
        }
    }

    async _persistCleanup() {
        if (!this.room.state.storage) return;
        const retained = new Set(this.cleanup);
        for (const member of this.members.values()) {
            for (const slot of Object.values(member.slots)) {
                if (slot.tracks.length || slot.uncertain) retained.add(slot);
            }
        }
        const records = [...retained].map(slot => ({ id: slot.id, uncertain: !!slot.uncertain,
            tracks: slot.tracks.map(track => track.mid) }));
        try { await this.room.state.storage.put('sfuCleanup', records); }
        catch (error) { console.error('[SFU] Cleanup persistence failed', { name: error.name }); }
    }

    async retryCleanup() {
        for (const pending of [...this.cleanup]) await this._close(pending);
    }

    remove(session) {
        const member = this.members.get(session.id);
        if (!member) return;
        this.members.delete(session.id);
        void this._enqueue(async () => {
            for (const name of SLOTS) await this._retire(member, name);
        });
        this.refresh();
        this.reconcile();
    }
}
