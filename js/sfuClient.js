'use strict';

/**
 * Four audio-only SFU sessions: one upstream per source and one aggregated receiver
 * per kind. The room socket owns authorization; browsers never receive API secrets
 * or choose provider session/track locators.
 */
class SFUClient {
    constructor(client) {
        this.client = client;
        this.slots = new Map();
        this.requests = new Map();
        this.nextRequest = 1;
        this.catalog = [];
        this.closed = false;
        this.closing = new Map();
    }

    request(slot, action, fields = {}) {
        if (this.closed || !this.client.connected) return Promise.reject(new Error('SFU is disconnected.'));
        const request = this.nextRequest++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.requests.delete(request);
                reject(new Error('SFU negotiation timed out. Retry media or reconnect.'));
            // Authorization cleanup may serialize several bounded provider calls
            // before this request runs (notably two-way block/host handover).
            }, 45000);
            this.requests.set(request, { resolve, reject, timer });
            this.client._send({ type: 'sfu', request, slot, action, ...fields });
        });
    }

    message(msg) {
        if (this.closed) return;
        if (msg.type === 'sfu-result') {
            const pending = this.requests.get(msg.request);
            if (!pending) return;
            this.requests.delete(msg.request);
            clearTimeout(pending.timer);
            if (msg.error) pending.reject(new Error(msg.error));
            else pending.resolve(msg.result || {});
        } else if (msg.type === 'media-catalog') {
            this.catalog = Array.isArray(msg.tracks) ? msg.tracks : [];
            if (!this.client.isHost()) this.client.onMusicBroadcast(msg.music);
            this.sync();
        } else if (msg.type === 'media-reset') {
            this._drop(msg.slot);
            if (msg.slot === 'voicePub') this.client.disableVoice();
            if (msg.error) this.client.onError(new Error(msg.error));
            this.sync();
        }
    }

    control() {
        this.client._send({ type: 'media-control',
            voice: this.client.voiceAudience === null ? null : [...this.client.voiceAudience],
            listen: this.client.musicListening,
            ...(this.client.isHost() ? { music: this.client.musicState } : {})
        });
    }

    _slot(name) {
        let slot = this.slots.get(name);
        if (slot) return slot;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
        slot = { pc, queue: Promise.resolve(), mids: new Map(), sender: null, stream: null, published: false };
        this.slots.set(name, slot);
        pc.addEventListener('track', event => {
            if (this.slots.get(name) !== slot) return;
            const entry = slot.mids.get(event.transceiver.mid);
            if (!entry || !this._wanted(entry)) return;
            const stream = new globalThis.MediaStream([event.track]);
            if (entry.kind === 'music') this.client.onRemoteMusic(entry.owner, stream);
            else this.client.onRemoteStream(entry.owner, stream);
        });
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed' && this.slots.get(name) === slot) {
                this._fail(name, new Error('SFU media connection failed. Retry media or reconnect.'));
            }
        });
        return slot;
    }

    _wanted(entry) {
        return this.client.peers.has(entry.owner) &&
            (entry.kind !== 'music' || (entry.owner === this.client.hostId && this.client.musicListening)) &&
            this.catalog.some(track => track.owner === entry.owner && track.kind === entry.kind && track.version === entry.version);
    }

    _run(name, task) {
        if (this.closed) return Promise.resolve();
        if (this.closing.has(name)) return this.closing.get(name).then(() => this._run(name, task));
        let slot;
        try { slot = this._slot(name); }
        catch (error) { this.client.onError(error); return Promise.resolve(); }
        const result = slot.queue.then(async () => {
            if (this.slots.get(name) !== slot) return;
            await task(slot);
        });
        slot.queue = result.catch(error => {
            if (this.slots.get(name) === slot) this._fail(name, error);
        });
        return slot.queue;
    }

    async _gather(pc) {
        if (pc.iceGatheringState === 'complete') return;
        try {
            await this._wait(pc, 'icegatheringstatechange', () => pc.iceGatheringState === 'complete', 5000);
        } catch (error) {
            // An unreachable STUN server can leave gathering pending despite usable
            // host candidates. The SFU's public candidates still allow outbound ICE.
            if (!/^a=candidate:/m.test(pc.localDescription?.sdp || '')) throw error;
        }
    }

    _wait(pc, event, ready, timeout) {
        if (ready()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const done = error => {
                clearTimeout(timer);
                pc.removeEventListener(event, check);
                if (error) reject(error); else resolve();
            };
            const check = () => {
                if (pc.connectionState === 'closed' || pc.connectionState === 'failed') done(new Error('SFU connection closed.'));
                else if (ready()) done();
            };
            const timer = setTimeout(() => done(new Error('SFU connection timed out.')), timeout);
            pc.addEventListener(event, check);
            check();
        });
    }

    publish(kind, stream) {
        const name = `${kind}Pub`;
        this.control();
        if (!stream || !stream.getAudioTracks().length) return this.closeSlot(name);
        return this._run(name, async slot => {
            const track = stream.getAudioTracks()[0];
            if (slot.published) {
                await slot.sender.replaceTrack(track);
                slot.stream = stream;
                return;
            }
            const transceiver = slot.pc.addTransceiver(track, { direction: 'sendonly', streams: [stream] });
            slot.sender = transceiver.sender;
            slot.stream = stream;
            await slot.pc.setLocalDescription(await slot.pc.createOffer());
            await this._gather(slot.pc);
            const result = await this.request(name, 'publish', {
                mid: transceiver.mid, description: slot.pc.localDescription
            });
            if (this.slots.get(name) !== slot) return;
            await slot.pc.setRemoteDescription(result.sessionDescription);
            await this._wait(slot.pc, 'connectionstatechange', () => slot.pc.connectionState === 'connected', 30000);
            if (this.slots.get(name) !== slot) return;
            await this.request(name, 'ready');
            slot.published = true;
        });
    }

    sync() {
        for (const kind of ['voice', 'music']) {
            const wanted = this.catalog.filter(entry => entry.kind === kind && this._wanted(entry));
            const name = `${kind}Rx`;
            if (!wanted.length) {
                if (this.slots.has(name)) void this.closeSlot(name);
                continue;
            }
            void this._run(name, async slot => {
                const active = [...slot.mids.values()];
                if (active.some(entry => !this._wanted(entry))) {
                    // Server also force-closes unauthorized tracks; local playback ends
                    // immediately instead of waiting for the network round trip.
                    await this.closeSlot(name);
                    this.sync();
                    return;
                }
                const missing = wanted.filter(entry => this._wanted(entry) &&
                    ![...slot.mids.values()].some(old => old.owner === entry.owner && old.version === entry.version));
                for (let offset = 0; offset < missing.length; offset += 8) {
                    const batch = missing.slice(offset, offset + 8).filter(entry => this._wanted(entry));
                    if (!batch.length || this.slots.get(name) !== slot) continue;
                    const result = await this.request(name, 'subscribe', { owners: batch.map(entry => entry.owner) });
                    if (this.slots.get(name) !== slot) return;
                    for (const track of result.tracks) slot.mids.set(track.mid, track);
                    await slot.pc.setRemoteDescription(result.sessionDescription);
                    await slot.pc.setLocalDescription(await slot.pc.createAnswer());
                    await this._gather(slot.pc);
                    if (this.slots.get(name) !== slot) return;
                    await this.request(name, 'answer', { description: slot.pc.localDescription });
                    await this._wait(slot.pc, 'connectionstatechange', () => slot.pc.connectionState === 'connected', 30000);
                }
            });
        }
    }

    _drop(name) {
        const slot = this.slots.get(name);
        if (!slot) return;
        this.slots.delete(name);
        slot.pc.close();
        for (const entry of slot.mids.values()) {
            if (entry.kind === 'music') this.client.onRemoteMusic(entry.owner, null);
            else this.client.onRemoteStream(entry.owner, null);
        }
    }

    closeSlot(name) {
        if (this.closing.has(name)) return this.closing.get(name);
        const existed = this.slots.has(name);
        this._drop(name);
        if (!existed || this.closed) return Promise.resolve();
        const closing = this.request(name, 'close').catch(error => this.client.onError(error))
            .finally(() => { this.closing.delete(name); });
        this.closing.set(name, closing);
        return closing;
    }

    _fail(name, error) {
        void this.closeSlot(name);
        if (name === 'voicePub') this.client.disableVoice();
        this.client.onError(error);
    }

    removePeer() { this.sync(); }

    resetMusic() {
        void this.closeSlot('musicPub');
        void this.closeSlot('musicRx');
        this.control();
    }

    dispose() {
        this.closed = true;
        for (const name of [...this.slots.keys()]) this._drop(name);
        for (const pending of this.requests.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error('SFU disconnected.'));
        }
        this.requests.clear();
    }
}
window.SFUClient = SFUClient;
