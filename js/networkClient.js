'use strict';
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

    // Application close codes sent by worker/src/index.js.
    static CLOSE_ROOM_FULL = 4003;
    static CLOSE_FLOODING = 4008;
    static CLOSE_KICKED = 4010;
    static CLOSE_BANNED = 4011;
    static CLOSE_LOCKED = 4012;

    /** What the user is told when the relay ends the session for a reason that retrying would not fix. */
    static CLOSE_MESSAGES = Object.freeze({
        4003: 'That room is full (8 guests at most). Try another room code.',
        4008: 'Disconnected by the relay for sending too many messages.',
        4010: 'The host removed you from the room. You can join again.',
        4011: 'The host banned you from this room.',
        4012: 'That room is locked by its host.'
    });

    /** Only network-reachable URLs may be shared; a host's blob:/data: URL is meaningless to guests. */
    static isShareableMusicUrl(url) {
        if (typeof url !== 'string') return false;
        try {
            const parsed = new URL(url);
            return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password;
        } catch {
            return false;
        }
    }

    static AVATAR_POOLS = Object.freeze(['any', 'women', 'men']);
    static GESTURES = Object.freeze(['wave', 'nod', 'dance', 'stop']);
    static PID = /^[0-9a-f]{16}$/;
    static MAX_BLOCKED = 64;

    /**
     * @param {object} options
     * @param {string} options.serverUrl  wss:// relay
     * @param {string} [options.room]
     * @param {string} [options.name]
     * @param {string} [options.uid]      this browser's secret id (the relay hashes it into the public `pid`)
     * @param {'any'|'women'|'men'} [options.avatarPool] which of the random people this guest may be
     * @param {string[]} [options.blocked] public ids to keep invisible, from the user's saved block list
     */
    constructor({ serverUrl, room = 'lobby', name = 'Guest', uid = null, blocked = [], avatarPool = 'any' } = {}) {
        this.serverUrl = serverUrl;
        this.room = String(room || 'lobby').slice(0, 64);
        this.name = String(name || 'Guest').slice(0, 32);
        /** Which people this guest may be handed: 'any', 'women' or 'men'. */
        this.avatarPool = NetworkClient.AVATAR_POOLS.includes(avatarPool) ? avatarPool : 'any';
        this.uid = typeof uid === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(uid) ? uid : null;
        /** @type {Set<string>} */
        this.blockedPids = new Set((blocked || []).filter(pid => NetworkClient.PID.test(pid)).slice(0, NetworkClient.MAX_BLOCKED));

        this.selfId = null;
        this.selfPid = null;
        this.avatar = null;
        this.locked = false;
        this.hostId = null;
        /** Relay clock minus this browser's clock (ms), from the welcome: shared timestamps are read through it. */
        this.serverOffset = 0;
        /** Set by ClubMultiplayer: adds what only it knows (the podcast, the title) to every shared track state. */
        this.musicDecorator = null;
        this.status = 'idle'; // idle | connecting | connected | disconnected | error
        /** @type {Map<string, {name:string, pid:string|null, avatar:string|null, state:object|null, pc:RTCPeerConnection|null}>} */
        this.peers = new Map();

        this.micStream = null;
        this.micEnabled = false;
        this._micPending = null;
        this._voiceEpoch = 0;

        this.ws = null;
        this._closedByUser = false;
        this._reconnectAttempts = 0;
        this._reconnectTimer = null;
        this._hasConnected = false;

        // Assigned by the caller (AvatarManager / ui-init.js). Defaulted to no-ops
        // so every internal call site doesn't need an existence guard.
        this.onStatusChange = () => {};
        this.onPeerJoin = () => {};
        this.onPeerState = () => {};
        this.onPeerLeave = () => {};
        this.onPeerAvatar = () => {};
        this.onSelfAvatar = () => {};
        this.onEmoji = () => {};
        this.onGesture = () => {};
        this.onMusic = () => {};
        this.onHostChange = () => {};
        this.onRoom = () => {};
        this.onShow = () => {};
        this.onRemoteStream = () => {};
        this.onError = () => {};
    }

    get connected() { return this.status === 'connected'; }
    get peerCount() { return this.peers.size; }
    isHost() { return !!this.selfId && this.selfId === this.hostId; }

    connect() {
        if (this.ws || this._reconnectTimer !== null) return;
        this._closedByUser = false;
        this._reconnectAttempts = 0;
        this._hasConnected = false;
        this._setStatus('connecting');
        this._open();
    }

    disconnect() {
        this._closedByUser = true;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
        this.disableVoice();
        this._dropAllPeers();
        this.selfId = null;
        this.selfPid = null;
        this.avatar = null;
        this.locked = false;
        this.hostId = null;
        if (this.ws) {
            const socket = this.ws;
            this.ws = null;
            try { socket.close(); } catch { /* ignore */ }
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
        if (this.uid) url.searchParams.set('uid', this.uid);
        if (this.avatarPool !== 'any') url.searchParams.set('avatars', this.avatarPool);

        let ws;
        try {
            ws = new WebSocket(url.toString());
        } catch (err) {
            this._setStatus('error');
            this.onError(err);
            return;
        }
        this.ws = ws;

        ws.addEventListener('message', (evt) => {
            if (this.ws === ws) this._onMessage(evt);
        });
        ws.addEventListener('close', (evt) => {
            if (this.ws === ws) this._onSocketClosed(evt);
        });
        ws.addEventListener('error', () => { /* the close event follows and handles cleanup */ });
    }

    /** Tells listeners every known peer is gone (their ids die with this socket). */
    _dropAllPeers() {
        for (const id of [...this.peers.keys()]) {
            this._teardownPeerConnection(id, false);
            this.onPeerLeave(id);
        }
        this.peers.clear();
    }

    _onSocketClosed(evt) {
        this.ws = null;
        // The relay assigns a fresh id per connection, so peers from this socket can
        // never be matched again after a reconnect - without this their avatars and
        // voice nodes stayed in the scene as frozen duplicates.
        this._dropAllPeers();

        if (this._closedByUser) {
            this._setStatus('disconnected');
            return;
        }
        const code = evt && evt.code;
        if (NetworkClient.CLOSE_MESSAGES[code]) {
            // Terminal: release the microphone. The panel shows the mic as off and
            // disables the button, so a live capture here could never be stopped.
            this.disableVoice();
            this._setStatus('error');
            const error = new Error(NetworkClient.CLOSE_MESSAGES[code]);
            error.code = code;
            this.onError(error);
            return;
        }
        if (!this._hasConnected || this._reconnectAttempts >= 3) {
            this.disableVoice();
            this._setStatus('error');
            this.onError(new Error('Cannot reach multiplayer relay. Start the relay or check its URL, then click Connect to retry.'));
            return;
        }
        this._setStatus('connecting');
        const delay = Math.min(10000, 1000 * (2 ** this._reconnectAttempts++));
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
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
                this._hasConnected = true;
                this._reconnectAttempts = 0;
                this.selfId = msg.id;
                this.selfPid = NetworkClient.PID.test(msg.pid) ? msg.pid : null;
                this.avatar = typeof msg.avatar === 'string' ? msg.avatar : null;
                this.hostId = msg.hostId;
                this.locked = !!msg.locked;
                const skew = Number(msg.serverTime) - Date.now();
                this.serverOffset = Number.isFinite(skew) ? skew : 0;
                this._setStatus('connected');
                // Tell the relay who to keep invisible before anything else happens; it hides them again with a `leave`.
                if (this.blockedPids.size) this._send({ type: 'blocklist', pids: [...this.blockedPids] });
                if (this.avatar) this.onSelfAvatar(this.avatar);
                for (const peer of msg.peers || []) this._addPeer(peer);
                if (msg.music) this.onMusic(msg.music);
                if (msg.show) this.onShow(msg.show);
                this.onHostChange(this.hostId);
                this.onRoom(this.locked);
                break;

            case 'join':
                this._addPeer(msg);
                break;

            case 'leave':
                if (!this.peers.has(msg.id)) break;
                this._teardownPeerConnection(msg.id, false);
                this.peers.delete(msg.id);
                this.onPeerLeave(msg.id);
                break;

            case 'state': {
                // Only peers announced by welcome/join. A stray frame from a session the
                // relay already dropped would otherwise create an avatar that no later
                // `leave`, disconnect or reconnect ever removes.
                const peer = this.peers.get(msg.id);
                if (!peer) break;
                peer.state = msg.state;
                this.onPeerState(msg.id, msg.state);
                break;
            }

            case 'emoji':
                if (this.peers.has(msg.id)) this.onEmoji(msg.id, msg.emoji);
                break;

            case 'gesture':
                if (this.peers.has(msg.id) && NetworkClient.GESTURES.includes(msg.gesture)) this.onGesture(msg.id, msg.gesture);
                break;

            case 'avatar':
                if (typeof msg.avatar !== 'string') break;
                if (msg.id === this.selfId) {
                    this.avatar = msg.avatar;
                    this.onSelfAvatar(msg.avatar);
                } else if (this.peers.has(msg.id)) {
                    this.peers.get(msg.id).avatar = msg.avatar;
                    this.onPeerAvatar(msg.id, msg.avatar);
                }
                break;

            case 'music':
                this.onMusic(msg);
                break;

            case 'show':
                this.onShow(msg);
                break;

            case 'host':
                this.hostId = msg.id;
                this.onHostChange(this.hostId);
                break;

            case 'room':
                this.locked = !!msg.locked;
                this.onRoom(this.locked);
                break;

            case 'rtc-signal':
                this._onSignal(msg.from, msg.signal);
                break;

            default:
                break;
        }
    }

    /** A guest announced by welcome or join. One the user has blocked is not shown, heard or connected to, whatever the relay sends. */
    _addPeer(peer) {
        if (!peer || typeof peer.id !== 'string') return;
        const pid = NetworkClient.PID.test(peer.pid) ? peer.pid : null;
        if (pid && this.blockedPids.has(pid)) return;
        this.peers.set(peer.id, { name: peer.name, pid, avatar: typeof peer.avatar === 'string' ? peer.avatar : null, state: peer.state || null, pc: null });
        this.onPeerJoin(peer.id, peer.name, { pid, avatar: this.peers.get(peer.id).avatar });
        if (peer.state) this.onPeerState(peer.id, peer.state);
        this._maybeInitiateVoice(peer.id);
    }

    /** A heartbeat: the relay closes a client that has pinged and then goes silent, so a vanished host is replaced. */
    sendPing() { this._send({ type: 'ping' }); }

    sendState(state) { this._send({ type: 'state', state }); }
    sendEmoji(emoji) { this._send({ type: 'emoji', emoji }); }
    sendGesture(gesture) {
        if (NetworkClient.GESTURES.includes(gesture)) this._send({ type: 'gesture', gesture });
    }
    /** Ask the relay for a different random avatar; the answer arrives as `avatar` for this guest's own id. */
    requestAvatar(pool) {
        if (NetworkClient.AVATAR_POOLS.includes(pool)) this.avatarPool = pool;
        this._send({ type: 'avatar', pool: this.avatarPool });
    }

    /** Make a guest invisible and inaudible to this one, and this one to them. Idempotent. */
    blockPeer(pid) {
        if (!NetworkClient.PID.test(pid) || pid === this.selfPid) return false;
        if (this.blockedPids.size >= NetworkClient.MAX_BLOCKED && !this.blockedPids.has(pid)) return false;
        this.blockedPids.add(pid);
        this._send({ type: 'block', pid });
        for (const [id, peer] of [...this.peers]) {
            if (peer.pid !== pid) continue;
            this._teardownPeerConnection(id, false);
            this.peers.delete(id);
            this.onPeerLeave(id);
        }
        return true;
    }

    unblockPeer(pid) {
        if (!this.blockedPids.delete(pid)) return false;
        this._send({ type: 'unblock', pid });
        return true;
    }

    // Host-only: the relay ignores these from anyone else.
    kickPeer(id) { this._send({ type: 'kick', target: id }); }
    banPeer(id) { this._send({ type: 'ban', target: id }); }
    setRoomLocked(locked) { this._send({ type: 'lock', locked: !!locked }); }

    /** Host-only. Returns false when nothing was sent (not host, or a local blob:/data: URL). */
    sendMusic(music) {
        if (!this.isHost() || !music || !NetworkClient.isShareableMusicUrl(music.url)) return false;
        this._send({ type: 'music', ...(this.musicDecorator ? this.musicDecorator(music) : music) });
        return true;
    }

    /** The relay's clock now, in ms. */
    serverNow() { return Date.now() + this.serverOffset; }

    /** Host-only: the light show's current frame. The relay ignores it from anyone else. */
    sendShow(show) {
        if (!this.isHost() || !show || typeof show !== 'object') return false;
        this._send({ ...show, type: 'show' });
        return true;
    }

    // ---- WebRTC voice mesh ----
    //
    // "Perfect negotiation": whichever side changes its tracks (re)negotiates through
    // `negotiationneeded`. On glare the POLITE peer (higher id) accepts the remote offer
    // and the impolite one ignores it. Previously only the lower id ever offered, so a
    // higher-id guest who enabled the mic first was never heard, and a mic enabled after
    // a receive-only connection existed was never renegotiated. The wire format
    // ({kind:'offer'|'answer', sdp} and {kind:'ice', candidate}) is unchanged, so guests
    // still running the previous build interoperate.

    async enableVoice() {
        if (this.micEnabled) return;
        if (this._micPending) return this._micPending;
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is not available in this browser');
        }
        // One permission request at a time. A second click during the prompt used to
        // start a second capture whose tracks were never stopped by disableVoice().
        const epoch = this._voiceEpoch;
        this._micPending = navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then((stream) => {
                // Muted, disconnected or disposed while the prompt was open.
                if (epoch !== this._voiceEpoch || this._closedByUser) {
                    for (const track of stream.getTracks()) track.stop();
                    return;
                }
                this.micStream = stream;
                this.micEnabled = true;
                for (const id of this.peers.keys()) this._attachLocalTracks(id);
            })
            .finally(() => { this._micPending = null; });
        return this._micPending;
    }

    /** Stops sending; connections stay up so this guest keeps hearing everyone else. */
    disableVoice() {
        this._voiceEpoch++;
        this.micEnabled = false;
        const stream = this.micStream;
        this.micStream = null;
        for (const peer of this.peers.values()) {
            if (!peer.pc) continue;
            for (const sender of peer.pc.getSenders()) {
                if (sender.track) {
                    try { peer.pc.removeTrack(sender); } catch { /* connection already closed */ }
                }
            }
        }
        if (stream) for (const track of stream.getTracks()) track.stop();
    }

    /** Called for every known peer on welcome/join: connect only if there is something to send. */
    _maybeInitiateVoice(peerId) {
        if (this.micEnabled) this._attachLocalTracks(peerId);
    }

    _attachLocalTracks(peerId) {
        if (!this.micStream || !this.selfId || !peerId) return;
        const peer = this.peers.get(peerId);
        if (!peer) return;
        const pc = peer.pc || this._createPeerConnection(peerId);
        if (!pc) return;
        const sending = new Set(pc.getSenders().map(sender => sender.track).filter(Boolean));
        for (const track of this.micStream.getTracks()) {
            if (!sending.has(track)) pc.addTrack(track, this.micStream);
        }
    }

    _isPolite(peerId) { return !!this.selfId && this.selfId > peerId; }

    _createPeerConnection(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer || typeof RTCPeerConnection === 'undefined') return null;

        const pc = new RTCPeerConnection({ iceServers: NetworkClient.ICE_SERVERS });
        peer.pc = pc;
        peer.makingOffer = false;
        peer.ignoreOffer = false;

        pc.addEventListener('negotiationneeded', async () => {
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                const description = pc.localDescription;
                this._send({ type: 'rtc-signal', target: peerId, signal: { kind: description.type, sdp: description } });
            } catch {
                // Superseded by a newer negotiation or a closed connection.
            } finally {
                peer.makingOffer = false;
            }
        });
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
            if (pc.connectionState !== 'failed') return;
            if (typeof pc.restartIce === 'function') pc.restartIce();
            else this._teardownPeerConnection(peerId, true);
        });
        return pc;
    }

    async _onSignal(fromId, signal) {
        const peer = this.peers.get(fromId);
        if (!peer || !signal || typeof signal !== 'object') return;
        try {
            if (signal.kind === 'offer' || signal.kind === 'answer') {
                const description = signal.sdp;
                if (!description || description.type !== signal.kind) return;
                const pc = peer.pc || (description.type === 'offer' ? this._createPeerConnection(fromId) : null);
                if (!pc) return;

                const collision = description.type === 'offer'
                    && (peer.makingOffer || pc.signalingState !== 'stable');
                peer.ignoreOffer = !this._isPolite(fromId) && collision;
                if (peer.ignoreOffer) return;

                // On the polite side this implicitly rolls back a colliding local offer.
                await pc.setRemoteDescription(description);
                if (description.type === 'offer') {
                    await pc.setLocalDescription();
                    this._send({ type: 'rtc-signal', target: fromId, signal: { kind: 'answer', sdp: pc.localDescription } });
                }
            } else if (signal.kind === 'ice' && peer.pc && signal.candidate) {
                try {
                    await peer.pc.addIceCandidate(signal.candidate);
                } catch (err) {
                    if (!peer.ignoreOffer) throw err;
                }
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