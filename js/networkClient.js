'use strict';
/**
 * Realtime presence, voice and shared-music client for a VR Club session.
 *
 * Talks to a Cloudflare Worker (Durable Object) that relays small JSON messages
 * over one WebSocket per room - see worker/src/index.js for the exact protocol
 * and the server side of every message type used below. Voice audio is never
 * sent through the Worker: once two peers are in the same room this class
 * negotiates a direct WebRTC connection between their browsers (mesh - every
 * mic-enabled guest connects to their selected recipients) and the Worker only relays
 * the SDP/ICE signaling needed to set that connection up.
 * Explicit SFU welcomes instead delegate media to SFUClient: a single upstream
 * per source and aggregated, individually mapped receiving tracks. Failure in that
 * mode never starts mesh connections.
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
        4003: 'That room is full. Try another room code.',
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

    static MAX_CHAT_LENGTH = 200;
    static AVATAR_POOLS = Object.freeze(['any', 'women', 'men']);
    /** What the relay will keep of a message (it applies the same rule): no control characters, at most 200 code points. */
    static cleanChat(value) {
        if (typeof value !== 'string') return '';
        const cleaned = value.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
        return Array.from(cleaned).slice(0, NetworkClient.MAX_CHAT_LENGTH).join('');
    }

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
        this.worldClock = null;
        this._pingSentAt = null;
        /** Set by ClubMultiplayer: adds what only it knows (the podcast, the title) to every shared track state. */
        this.musicDecorator = null;
        this.status = 'idle'; // idle | connecting | connected | disconnected | error
        /** @type {Map<string, {name:string, pid:string|null, avatar:string|null, state:object|null, pc:RTCPeerConnection|null}>} */
        this.peers = new Map();

        this.micStream = null;
        this.micEnabled = false;
        this._micPending = null;
        this._voiceEpoch = 0;
        this.voiceAudience = null;
        this.targetedChat = false;
        this.hostTransferSupported = false;
        this.musicStream = null;
        this.musicState = null;
        this.musicListening = false;
        this.mediaTransport = 'mesh';
        this.sfu = null;
        this.capacity = 8;

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
        this.onChat = () => {};
        this.onRemoteStream = () => {};
        this.onMusicBroadcast = () => {};
        this.onRemoteMusic = () => {};
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
        if (this.sfu) this.sfu.dispose();
        this.sfu = null;
        this.disableVoice();
        this.resetMusic();
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
        url.searchParams.set('poseBatch', '1');
        url.searchParams.set('sfu', '1');

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
        if (this.sfu) this.sfu.dispose();
        this.sfu = null;
        this.resetMusic();
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
                this.capacity = Number.isInteger(msg.capacity) && msg.capacity >= 8 && msg.capacity <= 32 ? msg.capacity : 8;
                this.mediaTransport = msg.mediaTransport === 'sfu' ? 'sfu' : 'mesh';
                if (this.mediaTransport === 'sfu') {
                    if (typeof window.SFUClient !== 'function') {
                        this.disconnect();
                        this.onError(new Error('This room requires the SFU media client. Reload the app.'));
                        break;
                    }
                    this.sfu = new window.SFUClient(this);
                }
                this.targetedChat = msg.targetedChat === true;
                this.hostTransferSupported = msg.hostTransfer === true;
                this.locked = !!msg.locked;
                const skew = Number(msg.serverTime) - Date.now();
                this.serverOffset = Number.isFinite(skew) ? skew : 0;
                const world = msg.world;
                this.worldClock = world && world.v === 1 && Number.isInteger(world.seed) &&
                    world.seed >= 0 && world.seed <= 0xffffffff && Number.isFinite(world.startedAt) &&
                    world.startedAt > 0 && world.startedAt <= msg.serverTime && Number.isFinite(msg.serverTime)
                    ? { startedAt: world.startedAt, seed: world.seed, at: performance.now(),
                        elapsed: (msg.serverTime - world.startedAt) / 1000 } : null;
                this._setStatus('connected');
                // Tell the relay who to keep invisible before anything else happens; it hides them again with a `leave`.
                if (this.blockedPids.size) this._send({ type: 'blocklist', pids: [...this.blockedPids] });
                if (this.avatar) this.onSelfAvatar(this.avatar);
                for (const peer of msg.peers || []) this._addPeer(peer);
                if (msg.music) this.onMusic(msg.music);
                if (msg.show) this.onShow(msg.show);
                this.onHostChange(this.hostId);
                this.onRoom(this.locked);
                if (this.sfu) {
                    this.sfu.control();
                    if (this.micEnabled) void this.sfu.publish('voice', this.micStream);
                }
                break;

            case 'pong': {
                const now = performance.now(), rtt = now - msg.time;
                if (this.worldClock && msg.time === this._pingSentAt && rtt >= 0 && rtt < 10000 &&
                    Number.isFinite(msg.serverTime) && msg.serverTime >= this.worldClock.startedAt) {
                    this.worldClock.elapsed = (msg.serverTime - this.worldClock.startedAt + rtt / 2) / 1000;
                    this.worldClock.at = now;
                    this._pingSentAt = null;
                }
                break;
            }

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

            case 'states':
                if (Array.isArray(msg.states) && msg.states.length <= 32) {
                    for (const entry of msg.states) {
                        const peer = this.peers.get(entry.id);
                        if (!peer || !entry.state) continue;
                        peer.state = entry.state;
                        this.onPeerState(entry.id, entry.state);
                    }
                }
                break;

            case 'sfu-result':
            case 'media-catalog':
            case 'media-reset':
                if (this.sfu) this.sfu.message(msg);
                break;

            case 'emoji':
                if (this.peers.has(msg.id)) this.onEmoji(msg.id, msg.emoji);
                break;

            case 'chat':
                if (this.peers.has(msg.id) && typeof msg.text === 'string' && msg.text) this.onChat(msg.id, msg.text.slice(0, NetworkClient.MAX_CHAT_LENGTH), msg.restricted === true);
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
                this.resetMusic();
                this.hostId = msg.id;
                this.onHostChange(this.hostId);
                break;

            case 'room':
                this.locked = !!msg.locked;
                this.onRoom(this.locked);
                break;

            case 'rtc-signal':
                if (this.mediaTransport === 'mesh') this._onSignal(msg.from, msg.signal);
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
        if (this.sfu) this.sfu.sync();
    }

    /** A heartbeat: the relay closes a client that has pinged and then goes silent, so a vanished host is replaced. */
    sendPing() {
        this._pingSentAt = performance.now();
        this._send({ type: 'ping', time: this._pingSentAt });
    }

    worldTime() {
        return this.status === 'connected' && this.worldClock
            ? this.worldClock.elapsed + (performance.now() - this.worldClock.at) / 1000 : null;
    }

    sendState(state) { this._send({ type: 'state', state }); }
    sendEmoji(emoji) { this._send({ type: 'emoji', emoji }); }
    /** A typed message. Returns false when there was nothing to send. */
    sendChat(text, targets = null) {
        const clean = NetworkClient.cleanChat(text);
        if (!clean || !this.connected) return false;
        if (targets !== null && (!this.targetedChat || !Array.isArray(targets))) return false;
        const selected = targets === null ? null : [...new Set(targets)].filter(id => this.peers.has(id));
        if (selected && !selected.length) return false;
        this._send({ type: 'chat', text: clean, ...(selected ? { targets: selected } : {}) });
        return true;
    }
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

    transferHost(id) {
        if (!this.connected || !this.isHost() || !this.hostTransferSupported || !this.peers.has(id)) return false;
        this._send({ type: 'host-transfer', target: id });
        return true;
    }

    /** Host-only. Returns false when nothing was sent (not host, or a local blob:/data: URL). */
    sendMusic(music) {
        if (!this.isHost() || !music || !NetworkClient.isShareableMusicUrl(music.url)) return false;
        this._send({ type: 'music', ...(this.musicDecorator ? this.musicDecorator(music) : music) });
        return true;
    }

    /** Music uses its own connection, never a voice sender or the relay's URL-only music frame. */
    setLocalMusic(stream, state) {
        if (!this.connected || !this.isHost()) return;
        this.musicStream = stream;
        this.musicState = { available: !!stream, playing: !!stream && !!state.playing,
            title: String(state.title || '').slice(0, 200) };
        if (this.sfu) {
            void this.sfu.publish('music', stream);
            return;
        }
        for (const [id, peer] of this.peers) {
            this._sendMusicSignal(id, { kind: 'state', ...this.musicState });
            if (!stream) this._closeMusic(id);
            else if (peer.musicListening && !peer.musicPc) this._createMusicConnection(id);
        }
    }

    setMusicListening(enabled) {
        this.musicListening = !!enabled;
        if (this.sfu) {
            this.sfu.control();
            this.sfu.sync();
            return;
        }
        if (this.isHost() || !this.peers.has(this.hostId)) return;
        this._sendMusicSignal(this.hostId, { kind: 'listen', enabled: this.musicListening });
        if (!enabled) this._closeMusic(this.hostId);
    }

    resetMusic() {
        for (const id of this.peers.keys()) {
            this._closeMusic(id);
            this.peers.get(id).musicListening = false;
        }
        this.musicStream = null;
        this.musicState = null;
        this.musicListening = false;
        if (this.sfu) this.sfu.resetMusic();
    }

    _sendMusicSignal(id, signal) {
        this._send({ type: 'rtc-signal', target: id, signal: { ...signal, channel: 'music' } });
    }

    _closeMusic(id) {
        const peer = this.peers.get(id);
        if (!peer) return;
        const pc = peer.musicPc;
        peer.musicPc = null;
        peer.musicIce = [];
        if (pc) pc.close();
        if (id === this.hostId) this.onRemoteMusic(id, null);
    }

    _createMusicConnection(id) {
        const peer = this.peers.get(id);
        if (!peer || peer.musicPc) return peer && peer.musicPc;
        if (typeof RTCPeerConnection === 'undefined') {
            this.onError(new Error('WebRTC music is unavailable in this browser.'));
            return null;
        }
        const pc = new RTCPeerConnection({ iceServers: NetworkClient.ICE_SERVERS });
        peer.musicPc = pc;
        peer.musicIce = [];
        pc.addEventListener('icecandidate', event => {
            if (peer.musicPc === pc && event.candidate) this._sendMusicSignal(id, { kind: 'ice', candidate: event.candidate });
        });
        pc.addEventListener('track', event => {
            if (peer.musicPc !== pc || id !== this.hostId || !this.musicListening) return;
            const [stream] = event.streams;
            if (stream) {
                this.onRemoteMusic(id, stream);
                event.track.addEventListener('ended', () => {
                    if (peer.musicPc === pc) this._closeMusic(id);
                });
            }
        });
        pc.addEventListener('connectionstatechange', () => {
            if (peer.musicPc === pc && pc.connectionState === 'failed') {
                this._closeMusic(id);
                this.onError(new Error('The music broadcast connection failed. Direct WebRTC may be blocked by your network.'));
            }
        });
        if (this.isHost() && this.musicStream && peer.musicListening) {
            for (const track of this.musicStream.getAudioTracks()) pc.addTrack(track, this.musicStream);
            pc.addEventListener('negotiationneeded', async () => {
                try {
                    await pc.setLocalDescription();
                    if (peer.musicPc === pc) this._sendMusicSignal(id, { kind: 'offer', sdp: pc.localDescription });
                } catch (error) {
                    if (peer.musicPc === pc) this.onError(new Error(`Could not broadcast music: ${error.message}`));
                }
            });
        }
        return pc;
    }

    async _onMusicSignal(id, signal) {
        const peer = this.peers.get(id);
        if (!peer) return;
        if (signal.kind === 'state') {
            if (id !== this.hostId || this.isHost() || typeof signal.available !== 'boolean') return;
            const state = { available: signal.available, playing: signal.playing === true,
                title: typeof signal.title === 'string' ? signal.title.slice(0, 200) : '' };
            if (!state.available) this._closeMusic(id);
            this.onMusicBroadcast(state);
            if (state.available && this.musicListening && !peer.musicPc) this.setMusicListening(true);
            return;
        }
        if (signal.kind === 'listen') {
            if (!this.isHost() || typeof signal.enabled !== 'boolean') return;
            peer.musicListening = signal.enabled;
            if (!signal.enabled) this._closeMusic(id);
            else if (this.musicStream) this._createMusicConnection(id);
            return;
        }
        if (!(this.isHost() ? peer.musicListening && this.musicStream : id === this.hostId && this.musicListening)) return;
        try {
            if (signal.kind === 'offer' || signal.kind === 'answer') {
                if ((signal.kind === 'offer') === this.isHost() || signal.sdp?.type !== signal.kind) return;
                const pc = peer.musicPc || this._createMusicConnection(id);
                if (!pc) return;
                await pc.setRemoteDescription(signal.sdp);
                if (peer.musicPc !== pc) return;
                for (const candidate of peer.musicIce.splice(0)) await pc.addIceCandidate(candidate);
                if (!this.isHost()) {
                    await pc.setLocalDescription();
                    if (peer.musicPc === pc) this._sendMusicSignal(id, { kind: 'answer', sdp: pc.localDescription });
                }
            } else if (signal.kind === 'ice' && signal.candidate) {
                const pc = peer.musicPc || (!this.isHost() && this._createMusicConnection(id));
                if (!pc) return;
                if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
                else if (peer.musicIce.length < 64) peer.musicIce.push(signal.candidate);
            }
        } catch (error) {
            if (peer.musicPc) this.onError(new Error(`Music connection error: ${error.message}`));
        }
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
                if (this.sfu) return this.sfu.publish('voice', stream);
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
        if (this.sfu) void this.sfu.closeSlot('voicePub');
        for (const [id, peer] of this.peers) {
            if (!peer.pc) continue;
            for (const sender of peer.pc.getSenders()) {
                if (sender.track) this._replaceVoiceTrack(id, sender, null);
            }
        }
        if (stream) for (const track of stream.getTracks()) track.stop();
    }

    /** Called for every known peer on welcome/join: connect only if there is something to send. */
    _maybeInitiateVoice(peerId) {
        if (this.mediaTransport === 'sfu') return;
        if (this.micEnabled) this._attachLocalTracks(peerId);
    }

    _attachLocalTracks(peerId) {
        if (this.mediaTransport === 'sfu') return;
        if (!this.micStream || !this.selfId || !peerId) return;
        if (this.voiceAudience !== null && !this.voiceAudience.has(peerId)) return;
        const peer = this.peers.get(peerId);
        if (!peer) return;
        const pc = peer.pc || this._createPeerConnection(peerId);
        if (!pc) return;
        this.micStream.getTracks().forEach((track, index) => {
            const sender = peer.micSenders[index];
            if (!sender) peer.micSenders[index] = pc.addTrack(track, this.micStream);
            else if (sender.track !== track) this._replaceVoiceTrack(peerId, sender, track);
        });
    }

    _replaceVoiceTrack(peerId, sender, track) {
        const pc = this.peers.get(peerId)?.pc;
        sender.replaceTrack(track).catch(error => {
            if (this.peers.get(peerId)?.pc !== pc) return;
            // If stopping a sender fails, close it rather than risk sending to an excluded guest.
            this._teardownPeerConnection(peerId, true);
            this.onError(new Error(`Could not update microphone recipients: ${error.message}`));
        });
    }

    _isPolite(peerId) { return !!this.selfId && this.selfId > peerId; }

    _createPeerConnection(peerId) {
        const peer = this.peers.get(peerId);
        if (!peer || typeof RTCPeerConnection === 'undefined') return null;

        const pc = new RTCPeerConnection({ iceServers: NetworkClient.ICE_SERVERS });
        peer.pc = pc;
        peer.micSenders = [];
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
        if (signal.channel === 'music') {
            peer.musicQueue = (peer.musicQueue || Promise.resolve()).then(() => this._onMusicSignal(fromId, signal));
            await peer.musicQueue;
            return;
        }
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
        if (!keepEntry) this._closeMusic(peerId);
        if (peer && peer.pc) {
            try { peer.pc.close(); } catch { /* ignore */ }
            peer.pc = null;
        }
        if (!keepEntry) this.peers.delete(peerId);
        if (!keepEntry && this.sfu) this.sfu.removePeer(peerId);
    }

    /** null sends to everyone; an empty set sends nowhere while keeping incoming streams. */
    setVoiceAudience(ids) {
        this.voiceAudience = ids === null ? null : new Set(ids.filter(id => this.peers.has(id)));
        if (this.sfu) {
            this.sfu.control();
            return;
        }
        for (const [id, peer] of this.peers) {
            if (this.voiceAudience === null || this.voiceAudience.has(id)) {
                if (this.micEnabled) this._attachLocalTracks(id);
            } else if (peer.pc) {
                for (const sender of peer.pc.getSenders()) {
                    if (sender.track) this._replaceVoiceTrack(id, sender, null);
                }
            }
        }
    }
}

window.NetworkClient = NetworkClient;
