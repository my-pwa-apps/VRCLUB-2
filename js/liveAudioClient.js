'use strict';

/** Event audio has its own authorization, independent of the social room host. */
class LiveAudioClient {
    static isEventId(value) {
        return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    }

    static mediaUrl(serverUrl, eventId) {
        if (!LiveAudioClient.isEventId(eventId)) throw new Error('Invalid live event link.');
        const url = new URL(serverUrl);
        if (!['https:', 'http:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password) {
            throw new Error('Invalid live audio server.');
        }
        url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
        url.pathname = `/live/${eventId.toLowerCase()}/media`;
        url.search = '';
        url.hash = '';
        return url.href;
    }

    constructor({ serverUrl, eventId, token, role = 'listener', onStream = () => {}, onState = () => {}, onError = () => {} }) {
        if (!['publisher', 'listener'].includes(role) || typeof token !== 'string' || !token || token.length > 512) {
            throw new Error('A valid live audio invitation is required.');
        }
        this.url = LiveAudioClient.mediaUrl(serverUrl, eventId);
        this.token = token;
        this.role = role;
        this.onStream = onStream;
        this.onState = onState;
        this.onError = onError;
        this.event = { id: eventId.toLowerCase(), title: 'Live DJ set', live: false, ended: false };
        this.connected = false;
        this.socket = null;
        this.sfu = null;
        this.facade = null;
        this.stream = null;
        this.closed = false;
        this.attempts = 0;
        this.timer = null;
        this.heartbeat = null;
        this.retry = null;
        this.pending = null;
    }

    connect() {
        if (this.closed) return Promise.reject(new Error('The live connection has been closed.'));
        if (this.connected) return Promise.resolve(this.event);
        if (this.pending) return this.pending.promise;
        let resolve, reject;
        const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
        this.pending = { promise, resolve, reject };
        this._open();
        return promise;
    }

    _send(message) {
        if (!this.socket || this.socket.readyState !== 1) throw new Error('The live audio connection is not ready.');
        this.socket.send(JSON.stringify(message));
    }

    _open() {
        if (this.closed) return;
        this.onState({ ...this.event, connection: this.attempts ? 'reconnecting' : 'connecting' });
        let socket;
        try { socket = new WebSocket(this.url); }
        catch (error) { this._failed(error); return; }
        this.socket = socket;
        this.timer = setTimeout(() => {
            if (this.socket === socket) socket.close(4000, 'Live audio handshake timed out');
        }, 15000);
        socket.addEventListener('open', () => {
            if (this.socket === socket) this._send({ type: 'event-auth', role: this.role, token: this.token });
        });
        socket.addEventListener('message', event => {
            if (this.socket !== socket) return;
            try {
                if (typeof event.data !== 'string' || event.data.length > 128 * 1024) throw new Error('Invalid live audio response.');
                this._message(JSON.parse(event.data));
            } catch (error) { this._failed(error); }
        });
        socket.addEventListener('error', () => {});
        socket.addEventListener('close', event => {
            if (this.socket !== socket || this.closed) return;
            this._drop();
            if (![1008, 4001, 4003, 4010, 4011, 4012].includes(event.code) && !this.event.ended && this.attempts < 3) {
                const delay = 1000 * 2 ** this.attempts++;
                this.onState({ ...this.event, connection: 'reconnecting' });
                this.retry = setTimeout(() => { this.retry = null; this._open(); }, delay);
            } else {
                this._failed(new Error(event.reason || 'Live audio disconnected. Use Listen again or reopen your DJ invitation.'));
            }
        });
    }

    _message(message) {
        if (message.type === 'live-welcome') {
            if (message.role !== this.role || message.event?.id !== this.event.id || typeof message.id !== 'string') {
                throw new Error('The live audio server returned an invalid invitation.');
            }
            clearTimeout(this.timer);
            this.timer = null;
            this.connected = true;
            const client = this.facade = {
                connected: true, peers: new Map(), hostId: message.id, selfId: message.id,
                musicListening: this.role === 'listener', voiceAudience: null,
                musicState: { available: this.role === 'publisher', playing: true, title: message.event.title },
                isHost: () => this.role === 'publisher',
                _send: value => this._send(value),
                onMusicBroadcast: () => {},
                onRemoteMusic: (_id, stream) => { if (stream) this.attempts = 0; this.onStream(stream); },
                onRemoteStream: () => {},
                disableVoice: () => {},
                onError: error => {
                    if (!this.closed) {
                        this.onState({ ...this.event, connection: 'reconnecting', error: error.message });
                        this.socket?.close(1011, 'Live media negotiation failed');
                    }
                }
            };
            this.sfu = new window.SFUClient(client);
            this._status(message.event);
            if (this.closed) return;
            this.sfu.control();
            this.heartbeat = setInterval(() => {
                if (this.connected && this.socket?.readyState === 1) this._send({ type: 'ping', time: Date.now() });
            }, 10000);
            this.pending?.resolve(this.event);
            this.pending = null;
            if (this.stream) void this.publish(this.stream).catch(error => this._failed(error));
        } else if (message.type === 'media-catalog') {
            if (!this.sfu || !Array.isArray(message.tracks)) throw new Error('Invalid live media catalogue.');
            const tracks = message.tracks.filter(track => track.kind === 'music');
            this.facade.peers = new Map(tracks.map(track => [track.owner, {}]));
            if (this.role === 'listener') this.facade.hostId = tracks[0]?.owner || null;
            this.sfu.message({ ...message, tracks });
        } else if (message.type === 'sfu-result' || message.type === 'media-reset') {
            this.sfu?.message(message);
        } else if (message.type === 'event-status') {
            this._status(message.event);
        } else if (message.type === 'live-error') {
            this._failed(new Error(message.error || 'Live audio authorization failed.'));
        }
    }

    _status(value) {
        if (!value || value.id !== this.event.id) throw new Error('Invalid live event status.');
        this.event = {
            id: value.id, title: typeof value.title === 'string' ? value.title.slice(0, 120) : this.event.title,
            live: value.live === true, ended: value.ended === true
        };
        this.onState({ ...this.event, connection: this.connected ? 'connected' : 'disconnected' });
        if (this.event.ended) this.close();
    }

    async publish(stream) {
        if (this.role !== 'publisher' || !this.connected || !this.sfu || !stream?.getAudioTracks().some(track => track.readyState === 'live')) {
            throw new Error('Connect an active audio input before broadcasting.');
        }
        this.stream = stream;
        const sfu = this.sfu;
        await sfu.publish('music', stream);
        if (this.sfu !== sfu || !sfu.slots.get('musicPub')?.published) throw new Error('The live audio publication did not connect.');
        this.attempts = 0;
    }

    _drop() {
        clearTimeout(this.timer);
        clearInterval(this.heartbeat);
        this.timer = null;
        this.heartbeat = null;
        this.connected = false;
        this.socket = null;
        if (this.facade) this.facade.connected = false;
        this.sfu?.dispose();
        this.sfu = null;
        this.facade = null;
        this.onStream(null);
    }

    _failed(error) {
        const pending = this.pending;
        this.pending = null;
        this.close();
        pending?.reject(error);
        this.onError(error);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.retry);
        this.retry = null;
        const socket = this.socket;
        this._drop();
        this.stream = null;
        socket?.close();
        this.pending?.reject(new Error('Live audio connection cancelled.'));
        this.pending = null;
    }
}
window.LiveAudioClient = LiveAudioClient;
