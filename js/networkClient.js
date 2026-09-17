/**
 * Realtime presence, voice and shared-music client for a VR Club session.
 *
 * Talks to a Cloudflare Worker (Durable Object) that relays small JSON messages
 * over one WebSocket per room - see worker/src/index.js for the exact protocol
 * and the server side of every message type used below. Voice audio is never
 * sent through the Worker: once two peers are in the same room this class
 * negotiates a direct WebRTC connection between their browsers (mesh - every
 * mic-enabled guest connects to every other one) and the Worker only relays
 * the SDP/ICE signaling needed to set that connection up.
 *
 * Deliberately has no Babylon.js dependency: `js/avatarManager.js` (and
 * `js/club/07-animation-core.js`) turn these events into scene visuals and
 * spatialised audio, but this class itself only deals with the network.
 */
class NetworkClient {
    static ICE_SERVERS = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ];

    constructor({ serverUrl, room = 'lobby', name = 'Guest' } = {}) {
        this.serverUrl = serverUrl;
        this.room = String(room || 'lobby').slice(0, 64);
        this.name = String(name || 'Guest').slice(0, 32);

        this.selfId = null;
        this.hostId = null;
        this.status = 'idle'; // idle | connecting | connected | disconnected | error
        /** @type {Map<string, {name:string, state:object|null, pc:RTCPeerConnection|null}>} */
        this.peers = new Map();

        this.micStream = null;
        this.micEnabled = false;

        this.ws = null;
        this._closedByUser = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;

        // Assigned by the caller (AvatarManager / ui-init.js). Defaulted to no-ops
        // so every internal call site doesn't need an existence guard.
        this.onStatusChange = () => {};
        this.onPeerJoin = () => {};
        this.onPeerState = () => {};
        this.onPeerLeave = () => {};
        this.onEmoji = () => {};
        this.onMusic = () => {};
        this.onHostChange = () => {};
        this.onRemoteStream = () => {};
        this.onError = () => {};
    }

    get connected() { return this.status === 'connected'; }
    get peerCount() { return this.peers.size; }
    isHost() { return !!this.selfId && this.selfId === this.hostId; }

    connect() {
        if (this.ws) return;
        this._closedByUser = false;
        this._setStatus('connecting');
        this._open();
    }

    disconnect() {
        this._closedByUser = true;
        clearTimeout(this._reconnectTimer);
        this.disableVoice();
        for (const id of [...this.peers.keys()]) this._teardownPeerConnection(id);
        this.peers.clear();
        this.selfId = null;
        this.hostId = null;
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }
        this._setStatus('disconnected');
    }

    dispose() { this.disconnect(); }

    _open() {
        let url;
        try {
            url = new URL(this.serverUrl);
        } catch {
            this._setStatus('error');
            this.onError(new Error('Invalid multiplayer server URL'));
            return;
        }
        url.searchParams.set('room', this.room);
        url.searchParams.set('name', this.name);

        let ws;
        try {
            ws = new WebSocket(url.toString());
        } catch (err) {
            this._setStatus('error');
            this.onError(err);
            return;
        }
        this.ws = ws;

        ws.addEventListener('open', () => {
            this._reconnectAttempts = 0;
        });
        ws.addEventListener('message', (evt) => this._onMessage(evt));
        ws.addEventListener('close', () => this._onSocketClosed());
        ws.addEventListener('error', () => { /* the close event follows and handles cleanup */ });
    }

    _onSocketClosed() {
        this.ws = null;
        for (const id of [...this.peers.keys()]) this._teardownPeerConnection(id, false);
        this.peers.clear();

        if (this._closedByUser) {
            this._setStatus('disconnected');
            return;
        }
        this._setStatus('disconnected');
        const delay = Math.min(10000, 1000 * (2 ** this._reconnectAttempts++));
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
            if (!this._closedByUser) this._open();
        }, delay);
    }

    _setStatus(status) {
        this.status = status;
        this.onStatusChange(status);
    }

    _send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
        }
    }

    _onMessage(evt) {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;

        switch (msg.type) {
            case 'welcome':
                this.selfId = msg.id;
                this.hostId = msg.hostId;
                this._setStatus('connected');
                for (const peer of msg.peers || []) {
                    this.peers.set(peer.id, { name: peer.name, state: peer.state, pc: null });
                    this.onPeerJoin(peer.id, peer.name);
                    if (peer.state) this.onPeerState(peer.id, peer.state);
                    this._maybeInitiateVoice(peer.id);
                }
                if (msg.music) this.onMusic(msg.music);
                this.onHostChange(this.hostId);
                break;

            case 'join':
                this.peers.set(msg.id, { name: msg.name, state: null, pc: null });
                this.onPeerJoin(msg.id, msg.name);
                this._maybeInitiateVoice(msg.id);
                break;

            case 'leave':
                this._teardownPeerConnection(msg.id, false);
                this.peers.delete(msg.id);
                this.onPeerLeave(msg.id);
                break;

            case 'state': {
                const peer = this.peers.get(msg.id);
                if (peer) peer.state = msg.state;
                this.onPeerState(msg.id, msg.state);
                break;
            }

            case 'emoji':
                this.onEmoji(msg.id, msg.emoji);
                break;

            case 'music':
                this.onMusic(msg);
                break;

            case 'host':
                this.hostId = msg.id;
                this.onHostChange(this.hostId);
                break;

            case 'rtc-signal':
                this._onSignal(msg.from, msg.signal);
                break;

            default:
                break;
        }
    }

    sendState(state) { this._send({ type: 'state', state }); }
    sendEmoji(emoji) { this._send({ type: 'emoji', emoji }); }
    sendMusic(music) { if (this.isHost()) this._send({ type: 'music', ...music }); }

    // ---- WebRTC voice mesh ----

    async enableVoice() {
        if (this.micEnabled) return;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is not available in this browser');
        }
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        this.micEnabled = true;
        for (const id of this.peers.keys()) this._maybeInitiateVoice(id);
    }

    disableVoice() {
        this.micEnabled = false;
        if (this.micStream) {
            for (const track of this.micStream.getTracks()) track.stop();
            this.micStream = null;
        }
        for (const id of this.peers.keys()) this._teardownPeerConnection(id, true);
    }

    /** Only the lexicographically-lower id offers, so both sides never race a glare. */
    _maybeInitiateVoice(peerId) {
        if (!this.micEnabled || !this.selfId || !peerId) return;
        const peer = this.peers.get(peerId);
        if (!peer || peer.pc) return;
        if (this.selfId < peerId) this._createPeerConnection(peerId, true);
    }

    _createPeerConnection(peerId, isOfferer) {
        const peer = this.peers.get(peerId);
        if (!peer || typeof RTCPeerConnection === 'undefined') return null;

        const pc = new RTCPeerConnection({ iceServers: NetworkClient.ICE_SERVERS });
        peer.pc = pc;

        if (this.micStream) {
            for (const track of this.micStream.getTracks()) pc.addTrack(track, this.micStream);
        }

        pc.addEventListener('icecandidate', (e) => {
            if (e.candidate) {
                this._send({ type: 'rtc-signal', target: peerId, signal: { kind: 'ice', candidate: e.candidate } });
            }
        });
        pc.addEventListener('track', (e) => {
            const [stream] = e.streams;
            if (stream) this.onRemoteStream(peerId, stream);
        });
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed') this._teardownPeerConnection(peerId, true);
        });

        if (isOfferer) {
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => {
                    this._send({ type: 'rtc-signal', target: peerId, signal: { kind: 'offer', sdp: pc.localDescription } });
                })
                .catch(() => this._teardownPeerConnection(peerId, true));
        }
        return pc;
    }

    async _onSignal(fromId, signal) {
        const peer = this.peers.get(fromId);
        if (!peer || !signal) return;
        let pc = peer.pc;
        try {
            if (signal.kind === 'offer') {
                if (!pc) pc = this._createPeerConnection(fromId, false);
                await pc.setRemoteDescription(signal.sdp);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this._send({ type: 'rtc-signal', target: fromId, signal: { kind: 'answer', sdp: pc.localDescription } });
            } else if (signal.kind === 'answer') {
                if (pc) await pc.setRemoteDescription(signal.sdp);
            } else if (signal.kind === 'ice') {
                if (pc && signal.candidate) await pc.addIceCandidate(signal.candidate);
            }
        } catch {
            // A stale or racing signal for a connection that already moved on - drop it.
        }
    }

    /** @param {boolean} keepEntry - true while voice is merely being disabled/renegotiated. */
    _teardownPeerConnection(peerId, keepEntry) {
        const peer = this.peers.get(peerId);
        if (peer && peer.pc) {
            try { peer.pc.close(); } catch { /* ignore */ }
            peer.pc = null;
        }
        if (!keepEntry) this.peers.delete(peerId);
    }
}

window.NetworkClient = NetworkClient;
