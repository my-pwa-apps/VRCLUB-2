'use strict';
/**
 * ClubMultiplayer - the one place that owns a guest's multiplayer session.
 *
 * Both surfaces drive it: the DOM Multiplayer panel (js/ui-init.js) and the VR quick menu's ONLINE pages
 * (js/club/10-ui.js). Neither reimplements a connection, a block or a kick; they call these methods and redraw when
 * `onChange` fires. It wires the three lower layers together:
 *
 *   NetworkClient   the socket to the relay (worker/src/index.js) and the WebRTC voice mesh
 *   AvatarManager   the other guests as people in the room: clips, voices, name tags, the personal-space bubble
 *   this class      preferences, the block list, moderation, gestures, shared music and the status the UI shows
 *
 * The room's host owns the music and the lights. The host's browser publishes the track and where it is (music) and the
 * light show (show: the Show Director's cue, the master colour, or the console's fixture settings under manual control);
 * every other guest follows, and cannot change either (the controls say so). A guest's own comfort settings (Safe Mode,
 * volume, quality) stay local, and Safe Mode still removes strobes from the followed show.
 *
 * Networking is opt-in and off until a guest connects. Everything a guest can do to keep themselves comfortable lives
 * here: mute one person or everyone, block (two-way invisibility, remembered across sessions), the personal-space
 * bubble, a mic that is off until switched on, one-tap disconnect; and, for the room's host, kick, ban and lock.
 */
class ClubMultiplayer {
    /** localStorage keys. */
    static PREFS = Object.freeze({
        serverUrl: 'vrclub.networkServerUrl',
        room: 'vrclub.networkRoom',
        name: 'vrclub.networkName',
        uid: 'vrclub.networkUid',
        blocked: 'vrclub.blockedPeers',
        personalSpace: 'vrclub.personalSpace',
        autoNod: 'vrclub.autoNod',
        avatarPool: 'vrclub.avatarPool'
    });

    static HOSTED_RELAY = 'wss://vrclub-network.garfieldapp.workers.dev';
    static EMOJI = Object.freeze(['🎉', '🔥', '❤️', '😂', '👋', '🙌', '💃', '🕺']);
    /** What each random character looks like, for the "you appear as" line (the ids are the relay's AVATARS). */
    static AVATAR_LABELS = Object.freeze({
        f1: 'Woman, black hair, white top', f2: 'Woman, auburn hair, teal top', f3: 'Punk, cyan mohawk',
        f4: 'Woman, burgundy dress', f5: 'Woman, blue dress', f6: 'Woman, silver hair, dark suit',
        f7: 'Woman, red blazer', f8: 'Woman, cream top', m1: 'Man, black tee', m2: 'Man, silver hair',
        m3: 'Man, green hoodie', m4: 'Man, rust hoodie', m5: 'Punk, blue mohawk', m6: 'Man, silver hair, charcoal suit',
        m7: 'Man, burgundy suit', m8: 'Man, cream shirt and shorts', m9: 'Man, purple tee'
    });
    static MAX_BLOCKED = 64;
    /** The host sends the light show at most this often (ms), and at least this often so a late joiner is brought in. */
    static SHOW_MIN_INTERVAL_MS = 250;
    static SHOW_HEARTBEAT_MS = 2000;
    /** Host: how often the track position is re-announced (ms). A guest corrects a drift larger than DRIFT_SEEK_S. */
    static MUSIC_HEARTBEAT_MS = 3000;
    /** The connection heartbeat (ms), see the relay's `ping`. Timer-driven, so it also runs while the tab is hidden. */
    static PING_MS = 10000;
    static DRIFT_SEEK_S = 0.75;
    /** Without a frame from the host for this long, a guest's lights run themselves again until one arrives. */
    static SHOW_STALE_MS = 12000;

    /**
     * What a host's manual console may set on a guest's rig, and its range. Everything else in a frame is ignored,
     * so the relay (which only checks shapes) can never be used to write an arbitrary property.
     * 'b' is a boolean; [min, max] a clamped number.
     */
    static MANUAL_FIXTURES = Object.freeze({
        lightsActive: 'b', lasersActive: 'b', ledWallActive: 'b', ledMonochrome: 'b', strobesActive: 'b',
        mirrorBallActive: 'b', laserSheetActive: 'b', smokeActive: 'b', spotStrobeActive: 'b', goboEnabled: 'b',
        spotlightMode: [0, 7], spotlightPattern: [0, 7], goboPatternIndex: [0, 31], ledPattern: [0, 63], spotColorIndex: [0, 63],
        goboRotationSpeed: [-10, 10], spotlightSpeed: [0, 10], laserSpeed: [0, 10], mirrorBallSpeed: [0, 10],
        ledWallSpeed: [0, 10], strobeSpeed: [0, 10], vjMaster: [0, 1]
    });
    /** A dance ends when the guest walks this far from where it started. */
    static DANCE_BREAK_DISTANCE = 0.6;

    /** The relay URL: the saved one, else the hosted relay (a leftover local-dev URL is migrated away). */
    static defaultServerUrl(storage) {
        try {
            const stored = storage && storage.getItem(ClubMultiplayer.PREFS.serverUrl);
            if (stored) {
                const url = new URL(stored);
                const legacyLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
                    && url.protocol === 'ws:' && url.port === '8787';
                if (!legacyLocal) return stored;
                storage.setItem(ClubMultiplayer.PREFS.serverUrl, ClubMultiplayer.HOSTED_RELAY);
            }
        } catch (_) { /* private browsing */ }
        return ClubMultiplayer.HOSTED_RELAY;
    }

    /** A random token of `length` characters from `alphabet` (crypto when there is some). */
    static randomToken(length, alphabet, rng) {
        let out = '';
        const bytes = new Uint8Array(length);
        if (rng) for (let i = 0; i < length; i++) bytes[i] = Math.floor(rng() * 256);
        else if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
        for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
        return out;
    }

    static newPrivateRoom(rng) {
        // Six digits: a guest in a headset can type them on a keypad. A private room is unlisted, not secret (the
        // host can lock it, and kick or ban anyone).
        return `private-${ClubMultiplayer.randomToken(6, '0123456789', rng)}`;
    }

    /** Digits typed on a keypad (or a whole room name) to the room they open. */
    static roomFromCode(code) {
        const text = String(code || '').trim();
        if (/^\d{6}$/.test(text)) return `private-${text}`;
        return text.slice(0, 64);
    }

    /** @param {object} club the VRClub @param {{storage?: Storage, rng?: () => number}} [options] */
    constructor(club, { storage = (typeof localStorage !== 'undefined' ? localStorage : null), rng = null } = {}) {
        this.club = club;
        this.storage = storage;
        this.rng = rng;
        this.client = null;
        this.manager = null;
        this.listeners = new Set();
        this.lastError = '';
        this.notice = '';
        this.selfAvatar = null;
        this.locked = false;
        this.dancing = false;
        this._danceFrom = null;
        this.muteAll = false;
        this.autoNod = this._read(ClubMultiplayer.PREFS.autoNod) !== '0';
        /** Which random people this guest may appear as: 'any', 'women' or 'men'. */
        this.avatarPool = ClubMultiplayer.cleanPool(this._read(ClubMultiplayer.PREFS.avatarPool));
        this.personalSpace = this._read(ClubMultiplayer.PREFS.personalSpace) !== '0';
        // Shared music: a guest's browser fetches the host's stream only after an explicit "Listen along".
        this.listenAlong = false;
        this.pendingMusic = null;
        this._nod = { baseline: null, down: false, downAt: 0, cooldownUntil: 0 };
        // Shared lights and music (see the header).
        this._show = { key: '', sentAt: 0, dirty: true, mode: null, lastFrameAt: 0, stale: false, force: true };
        this._musicBeatAt = 0;
        this._audioWatched = null;
        this._audioShareListener = null;
        this._shareTimer = null;
        this._roleApplied = null;
        this._pingTimer = null;
        this._disposed = false;
        club.multiplayer = this;
    }

    // ───────────────────────── preferences ─────────────────────────

    _read(key) { try { return this.storage ? this.storage.getItem(key) : null; } catch (_) { return null; } }
    _write(key, value) { try { if (this.storage) this.storage.setItem(key, value); } catch (_) { /* private browsing */ } }

    get serverUrl() { return ClubMultiplayer.defaultServerUrl(this.storage); }

    get room() {
        let params = null;
        try { params = new URLSearchParams(window.location.search); } catch (_) { /* ignore */ }
        return (params && params.get('room')) || this._read(ClubMultiplayer.PREFS.room) || 'lobby';
    }

    /** The saved display name; one is made up and kept the first time, so a guest is never nameless. */
    get name() {
        let name = this._read(ClubMultiplayer.PREFS.name);
        if (!name) {
            name = `Guest${ClubMultiplayer.randomToken(4, '0123456789', this.rng)}`;
            this._write(ClubMultiplayer.PREFS.name, name);
        }
        return name;
    }

    /** This browser's secret id. The relay hashes it into the public id other guests block or ban; it is never shown. */
    get uid() {
        let uid = this._read(ClubMultiplayer.PREFS.uid);
        if (!uid || !/^[A-Za-z0-9_-]{16,64}$/.test(uid)) {
            uid = ClubMultiplayer.randomToken(32, 'abcdefghijklmnopqrstuvwxyz0123456789', this.rng);
            this._write(ClubMultiplayer.PREFS.uid, uid);
        }
        return uid;
    }

    // ───────────────────────── state the surfaces read ─────────────────────────

    get status() { return this.client ? this.client.status : 'idle'; }
    get connected() { return !!this.client && this.client.connected; }
    get connecting() { return !!this.client && this.client.status === 'connecting'; }
    get micEnabled() { return !!this.client && this.client.micEnabled; }
    isHost() { return !!this.client && this.client.isHost(); }
    /** In someone else's room: the host owns the music and the lights, and this guest follows them. */
    get following() { return this.connected && !this.isHost(); }

    /** The room host's display name ('' when nobody is connected). */
    hostName() {
        const client = this.client;
        if (!client || !client.hostId) return '';
        if (client.isHost()) return this.name;
        const peer = client.peers.get(client.hostId);
        return peer ? peer.name : '';
    }

    /** A link that opens this page already in this room. */
    inviteUrl() {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('room', this.currentRoom);
        return url.href;
    }
    get currentRoom() { return this.client ? this.client.room : this.room; }

    statusText() {
        const room = this.currentRoom;
        if (this.connected) {
            const n = this.client.peerCount;
            return `Connected \u2014 room "${room}" \u00B7 ${n} other guest${n === 1 ? '' : 's'}${this.isHost() ? ' \u00B7 you are the host' : (this.hostName() ? ` \u00B7 host: ${this.hostName()}` : '')}${this.locked ? ' \u00B7 locked' : ''}`;
        }
        if (this.connecting) return `Connecting to "${room}"\u2026`;
        if (this.status === 'error') return this.lastError || 'Connection error';
        return this.notice || 'Not connected';
    }

    /** Everyone else in the room, with what the people list needs. */
    people() {
        if (!this.client) return [];
        const shown = new Map((this.manager ? this.manager.list() : []).map(peer => [peer.id, peer]));
        return [...this.client.peers].map(([id, peer]) => {
            const view = shown.get(id) || {};
            return {
                id, name: peer.name, pid: peer.pid, avatar: peer.avatar,
                muted: !!view.muted, speaking: !!view.speaking, isHost: id === this.client.hostId
            };
        });
    }

    /** The people this guest has blocked, newest first. Kept across sessions. */
    blockedList() {
        try {
            const list = JSON.parse(this._read(ClubMultiplayer.PREFS.blocked) || '[]');
            return Array.isArray(list) ? list.filter(item => item && /^[0-9a-f]{16}$/.test(item.pid)).slice(0, ClubMultiplayer.MAX_BLOCKED) : [];
        } catch (_) { return []; }
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _emit() {
        for (const listener of [...this.listeners]) {
            try { listener(this); } catch (_) { /* a broken surface must not break the session */ }
        }
    }

    // ───────────────────────── connecting ─────────────────────────

    /**
     * Join a room. `options` default to the saved settings, so the VR menu (which has no keyboard) can call it bare.
     * @returns {boolean} false when it refused to start (already connecting, or no relay URL)
     */
    connect({ serverUrl, room, name } = {}) {
        if (this._disposed || this.connected || this.connecting) return false;
        serverUrl = (serverUrl || this.serverUrl || '').trim();
        room = (room || this.room || 'lobby').trim() || 'lobby';
        name = (name || this.name).trim() || 'Guest';
        if (!serverUrl) {
            this.lastError = 'Enter a relay URL first (deploy worker/, see its wrangler.toml).';
            this._emit();
            return false;
        }
        this._write(ClubMultiplayer.PREFS.serverUrl, serverUrl);
        this._write(ClubMultiplayer.PREFS.room, room);
        this._write(ClubMultiplayer.PREFS.name, name);

        if (this.client) this.client.dispose();
        this.listenAlong = false;
        this.pendingMusic = null;
        this.lastError = '';
        this.notice = '';
        this.selfAvatar = null;
        this.locked = false;
        this.dancing = false;

        const club = this.club;
        const client = new NetworkClient({ serverUrl, room, name, uid: this.uid, avatarPool: this.avatarPool, blocked: this.blockedList().map(item => item.pid) });
        if (!club.avatarManager) club.avatarManager = new AvatarManager(club);
        this.manager = club.avatarManager;
        this.manager.setPersonalSpace(this.personalSpace);
        this.manager.setMuteAll(this.muteAll);
        this.manager.onSpeakingChange = () => this._emit();
        this.client = client;
        club.networkManager = client;
        this._wire(client);
        client.connect();
        this._startPing();
        this._emit();
        return true;
    }

    _startPing() {
        this._stopPing();
        this._pingTimer = setInterval(() => { if (this.connected) this.client.sendPing(); }, ClubMultiplayer.PING_MS);
    }

    _stopPing() {
        if (this._pingTimer !== null) clearInterval(this._pingTimer);
        this._pingTimer = null;
    }

    disconnect() {
        this._stopPing();
        if (!this.client) return;
        // disconnect() reports every peer through onPeerLeave, which removes their avatars.
        this.client.disconnect();
        this.listenAlong = false;
        this.pendingMusic = null;
        this.dancing = false;
        this._emit();
    }

    toggleConnection() {
        if (this.connected || this.connecting) { this.disconnect(); return false; }
        return this.connect();
    }

    /** A fresh private room: an unguessable code, joined at once. Share the code to bring someone in. */
    joinNewPrivateRoom() {
        if (this.connected || this.connecting) this.disconnect();
        return this.connect({ room: ClubMultiplayer.newPrivateRoom(this.rng) });
    }

    joinLobby() {
        if (this.connected || this.connecting) this.disconnect();
        return this.connect({ room: 'lobby' });
    }

    /** Join an existing room by its name, or by the six digits of a private room's code. */
    joinRoom(code) {
        const room = ClubMultiplayer.roomFromCode(code);
        if (!room) return false;
        if (this.connected || this.connecting) this.disconnect();
        return this.connect({ room });
    }

    _wire(client) {
        const club = this.club;
        const manager = this.manager;
        client.onStatusChange = (status) => {
            club.isMultiplayer = status === 'connected';
            if (status !== 'connected') {
                this.pendingMusic = null;
                this.dancing = false;
                this.locked = false;
            }
            if (status === 'error' || status === 'disconnected') this._stopPing();
            this._syncRole();
            this._emit();
        };
        client.onPeerJoin = (id, peerName, info) => {
            manager.ensurePeer(id, peerName, info);
            manager.setHost(id, id === client.hostId);
            this._show.dirty = true; // a newcomer needs the lights now, not at the next heartbeat
            this._musicBeatAt = 0;
            this._emit();
        };
        client.onPeerState = (id, state) => manager.updatePeerState(id, null, state);
        client.onPeerLeave = (id) => { manager.removePeer(id); this._emit(); };
        client.onPeerAvatar = (id, avatar) => { manager.setAvatar(id, avatar); this._emit(); };
        client.onSelfAvatar = (avatar) => { this.selfAvatar = avatar; this._emit(); };
        client.onEmoji = (id, emoji) => manager.showEmoji(id, emoji);
        client.onGesture = (id, gesture) => manager.playGesture(id, gesture);
        client.onHostChange = (hostId) => {
            for (const id of client.peers.keys()) manager.setHost(id, id === hostId);
            this._show.dirty = true;
            this._musicBeatAt = 0;
            this._syncRole();
            this._emit();
        };
        client.onRoom = (locked) => { this.locked = !!locked; this._emit(); };
        client.onMusic = (music) => this._applyMusic(music);
        client.onShow = (frame) => this._applyShow(frame);
        client.musicDecorator = (music) => this._decorateMusic(music);
        client.onRemoteStream = (id, stream) => manager.attachVoice(id, stream);
        client.onError = (err) => {
            this.lastError = `Error: ${err.message}`;
            if (err.code) this.notice = err.message;
            this._emit();
        };
    }

    // ───────────────────────── voice, emoji, gestures ─────────────────────────

    /** @returns {Promise<boolean>} whether the mic is on afterwards */
    async toggleMic() {
        const client = this.client;
        if (!client || !client.connected) return false;
        if (client.micEnabled) {
            client.disableVoice();
        } else {
            try {
                await client.enableVoice();
            } catch (err) {
                this.lastError = `Mic error: ${err.message}`;
            }
        }
        this._emit();
        return client.micEnabled;
    }

    sendEmoji(emoji) {
        if (!this.connected || !ClubMultiplayer.EMOJI.includes(emoji)) return false;
        this.client.sendEmoji(emoji);
        return true;
    }

    /** 'wave' and 'nod' play once on everyone else's copy of you; 'dance' toggles until you stop or walk away. */
    sendGesture(gesture) {
        if (!this.connected) return false;
        if (gesture === 'dance') {
            this.dancing = !this.dancing;
            this._danceFrom = null;
            this.client.sendGesture(this.dancing ? 'dance' : 'stop');
            this._emit();
            return true;
        }
        if (gesture !== 'wave' && gesture !== 'nod') return false;
        this.client.sendGesture(gesture);
        return true;
    }

    setAutoNod(enabled) {
        this.autoNod = !!enabled;
        this._write(ClubMultiplayer.PREFS.autoNod, this.autoNod ? '1' : '0');
        this._emit();
    }

    /** Ask the relay for a different random character (from the chosen pool). */
    rerollAvatar() {
        if (!this.connected) return false;
        this.client.requestAvatar(this.avatarPool);
        return true;
    }

    static cleanPool(value) {
        return value === 'women' || value === 'men' ? value : 'any';
    }

    /** Does this avatar id (f1..f8 women, m1..m9 men) belong to the pool? */
    static inPool(avatar, pool) {
        if (pool === 'women') return /^f/.test(avatar || '');
        if (pool === 'men') return /^m/.test(avatar || '');
        return true;
    }

    /**
     * Choose whom the relay may hand this guest as a random avatar: 'women', 'men' or 'any'. It is remembered and
     * used at every join. In a room, a current look outside the new pool is replaced at once; one inside it is kept.
     */
    setAvatarPool(pool) {
        this.avatarPool = ClubMultiplayer.cleanPool(pool);
        this._write(ClubMultiplayer.PREFS.avatarPool, this.avatarPool);
        if (this.client) {
            this.client.avatarPool = this.avatarPool;
            if (this.connected && !ClubMultiplayer.inPool(this.selfAvatar, this.avatarPool)) this.client.requestAvatar(this.avatarPool);
        }
        this._emit();
    }

    // ───────────────────────── safety ─────────────────────────

    mutePeer(id, muted) {
        if (!this.manager || !this.client || !this.client.peers.has(id)) return false;
        this.manager.setMuted(id, muted);
        this._emit();
        return true;
    }

    togglePeerMute(id) {
        const peer = this.people().find(item => item.id === id);
        return peer ? this.mutePeer(id, !peer.muted) : false;
    }

    setMuteAll(muted) {
        this.muteAll = !!muted;
        if (this.manager) this.manager.setMuteAll(this.muteAll);
        this._emit();
    }

    setPersonalSpace(enabled) {
        this.personalSpace = !!enabled;
        this._write(ClubMultiplayer.PREFS.personalSpace, this.personalSpace ? '1' : '0');
        if (this.manager) this.manager.setPersonalSpace(this.personalSpace);
        this._emit();
    }

    /** Block a guest in the room: neither of you sees, hears or signals the other, now and in future sessions. */
    blockPeer(id) {
        const client = this.client;
        const peer = client && client.peers.get(id);
        if (!peer || !peer.pid) return false;
        const list = this.blockedList().filter(item => item.pid !== peer.pid);
        list.unshift({ pid: peer.pid, name: peer.name, at: Date.now() });
        this._write(ClubMultiplayer.PREFS.blocked, JSON.stringify(list.slice(0, ClubMultiplayer.MAX_BLOCKED)));
        const done = client.blockPeer(peer.pid);
        this._emit();
        return done;
    }

    unblock(pid) {
        const list = this.blockedList();
        const next = list.filter(item => item.pid !== pid);
        if (next.length === list.length) return false;
        this._write(ClubMultiplayer.PREFS.blocked, JSON.stringify(next));
        if (this.client) this.client.unblockPeer(pid);
        this._emit();
        return true;
    }

    unblockAll() {
        const list = this.blockedList();
        this._write(ClubMultiplayer.PREFS.blocked, '[]');
        if (this.client) for (const item of list) this.client.unblockPeer(item.pid);
        this._emit();
        return list.length;
    }

    // Host-only. The relay enforces it; these refuse early so a guest's UI says why.
    kickPeer(id) {
        if (!this.isHost() || !this.client.peers.has(id)) return false;
        this.client.kickPeer(id);
        return true;
    }

    banPeer(id) {
        if (!this.isHost() || !this.client.peers.has(id)) return false;
        this.client.banPeer(id);
        return true;
    }

    setLocked(locked) {
        if (!this.isHost()) return false;
        this.client.setRoomLocked(locked);
        return true;
    }

    // ───────────────────────── shared music (the host drives it) ─────────────────────────

    /** Where the stream comes from, for the host's "now playing" line: only a podcast knows its name. */
    _decorateMusic(music) {
        const club = this.club;
        const player = club.podcastPlayer;
        const queued = player && player.queue && typeof player.isQueuedUrl === 'function' && player.isQueuedUrl(music.url)
            ? player.queue.podcast.id : null;
        return { ...music, podcast: queued, title: queued ? String(club.nowPlayingLabel || '') : '' };
    }

    /**
     * Is this a source the app already contacts on its own (a Resident episode on Podbean, or the club's own relay)?
     * Listening to one tells that server nothing new about the guest, so it needs no extra consent.
     */
    _isKnownMusicSource(url) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:') return false;
            if (parsed.hostname === 'podbean.com' || parsed.hostname.endsWith('.podbean.com')) return true;
            const relay = new URL(this.serverUrl.replace(/^ws/, 'http'));
            return parsed.origin === relay.origin && parsed.pathname.startsWith('/podcast/');
        } catch (_) {
            return false;
        }
    }

    /**
     * Apply the room host's "now playing": the same track at the same place, and the same DJ. A guest who hosts
     * ignores it (they ARE the source of truth). Podcasts the app already talks to start at once; any other stream
     * needs an explicit Listen along first, because it discloses the guest's IP to that server.
     */
    _applyMusic(music) {
        const client = this.client, club = this.club;
        if (!music || !client || client.isHost()) return;
        if (!music.url || !NetworkClient.isShareableMusicUrl(music.url)) return;
        if (!this.listenAlong && !this._isKnownMusicSource(music.url)) {
            this.pendingMusic = music;
            this._emit();
            return;
        }
        this.pendingMusic = null;
        // The relay stamps the track with its own clock; read it through the offset measured at the welcome.
        const targetTime = () => {
            const elapsed = music.playing && music.updatedAt ? Math.max(0, (client.serverNow() - music.updatedAt) / 1000) : 0;
            return Math.max(0, (Number(music.position) || 0) + elapsed);
        };
        const seekAndPlay = () => {
            const el = club.audioElement;
            if (!el) return;
            // A live stream has no position to correct; an episode is nudged only once it has really drifted.
            if (Number.isFinite(el.duration) && Math.abs(el.currentTime - targetTime()) > ClubMultiplayer.DRIFT_SEEK_S) {
                el.currentTime = Math.min(targetTime(), Math.max(0, el.duration - 1));
            }
            if (music.playing && el.paused) el.play().catch(() => { /* needs a user gesture the first time */ });
            if (!music.playing && !el.paused) el.pause();
        };
        let sameTrack = false;
        try { sameTrack = !!club.audioElement && club.audioElement.src === new URL(music.url).href; } catch (_) { /* not a URL */ }
        // The DJ follows the host's podcast on every update, not only when a new episode starts: a guest already on
        // this track, or one whose host has paused, would otherwise keep the previous DJ behind the decks.
        this._followPodcast(music, sameTrack);
        if (sameTrack) { seekAndPlay(); return; }
        if (!music.playing) { if (club.audioElement && !club.audioElement.paused) club.audioElement.pause(); return; }
        // Following the host: this guest's own episode queue must not carry on once the host's track replaces it.
        if (club.podcastPlayer) club.podcastPlayer.queue = null;
        club.startAudioStream(music.url, { onDemand: !!music.podcast }).then(() => {
            this._followPodcast(music, true);
            seekAndPlay();
        }).catch(() => { /* unreachable for this guest */ });
    }

    /** Put the host's DJ behind the decks (idempotent), and, once the track is the host's, its title on the now-playing line. */
    _followPodcast(music, showTitle) {
        const club = this.club;
        const podcast = music.podcast && window.Podcasts ? window.Podcasts.get(music.podcast) : null;
        if (podcast && podcast.id === music.podcast && typeof club.setDJ === 'function') Promise.resolve(club.setDJ(podcast.dj)).catch(() => {});
        if (showTitle && music.title && club.nowPlayingLabel !== music.title) {
            club.nowPlayingLabel = music.title;
            if (typeof window.announceNowPlaying === 'function') window.announceNowPlaying(music.title);
        }
    }

    /** Host and state of the stream waiting for the guest's consent, or null. */
    pendingMusicInfo() {
        const music = this.pendingMusic;
        if (!music) return null;
        let origin = music.url;
        try { origin = new URL(music.url).host; } catch (_) { /* keep the raw URL */ }
        return { origin, playing: !!music.playing };
    }

    acceptListenAlong() {
        const music = this.pendingMusic;
        this.listenAlong = true;
        this.pendingMusic = null;
        // The click that calls this is also the user gesture autoplay policies require.
        if (music) this._applyMusic(music);
        this._emit();
    }

    // ───────────────────────── shared lights (the host drives them) ─────────────────────────

    /** Follow the host or run alone, as the connection and the host change. */
    _syncRole() {
        const following = this.following;
        if (following === this._roleApplied) return;
        const was = this._roleApplied;
        this._roleApplied = following;
        const club = this.club;
        this._show.lastFrameAt = performance.now();
        this._show.stale = false;
        this._show.force = true;
        this._show.mode = null;
        if (club.showDirector) club.showDirector.setFollower(following);
        if (club.vjDirector) club.vjDirector.remoteDriven = following;
        club.roomFollower = following;
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.classList.toggle('room-guest', following);
        // Leaving a host's show: the rig carries on, and a console left in manual does not expire the instant it is handed back.
        if (was && !following) club.lastVJInteraction = performance.now() / 1000;
        // Promoted because the host left: say so, and ask for music if nothing is playing that guests could follow.
        if (was === true && !following && this.connected && typeof club.showErrorMessage === 'function') {
            const playing = club.audioElement && !club.audioElement.paused && club._audioKind === 'stream';
            club.showErrorMessage(playing ? 'The host left: you are now the host. You control the music and the lights.'
                : 'The host left: you are now the host. Pick some music for the room.');
        }
    }

    /** What the host's console has set, in the relay's flat shape. Only the allow-listed names are ever read. */
    _captureFixtures() {
        const club = this.club;
        const out = {};
        for (const key of Object.keys(ClubMultiplayer.MANUAL_FIXTURES)) {
            const spec = ClubMultiplayer.MANUAL_FIXTURES[key];
            const value = key === 'vjMaster' ? (club.vjDirector && club.vjDirector.targetMasterIntensity) : club[key];
            if (spec === 'b' ? typeof value === 'boolean' : (typeof value === 'number' && Number.isFinite(value))) out[key] = value;
        }
        return out;
    }

    /** The host's frame: the Show Director's cue while it drives, else the console's settings, plus the colour. */
    _buildShowFrame() {
        const club = this.club;
        const director = club.showDirector, vj = club.vjDirector;
        if (!director || !vj) return null;
        const driving = director.isDriving();
        const frame = { m: driving ? 'show' : (club.vjManualMode ? 'manual' : 'off'), ...vj.colourSnapshot() };
        if (driving) {
            const snap = director.snapshot();
            Object.assign(frame, { mv: snap.mv, cue: snap.cue, cb: snap.cb, bib: snap.bib });
            if (snap.sp) Object.assign(frame, { sp: snap.sp, spt: snap.spt, spb: snap.spb });
            frame._bar = snap.bar;
        } else {
            frame.fx = this._captureFixtures();
        }
        return frame;
    }

    /** Host: publish the lights when they change, on every bar line (so guests stay on the beat), and on a heartbeat. */
    _broadcastShow(now) {
        const show = this._show;
        if (now - show.sentAt < ClubMultiplayer.SHOW_MIN_INTERVAL_MS) return;
        const frame = this._buildShowFrame();
        if (!frame) return;
        const bar = frame._bar;
        delete frame._bar;
        const key = JSON.stringify([frame.m, frame.mv, frame.cue, frame.sp, frame.spb, bar, frame.hue === undefined ? 0 : Math.round(frame.hue * 500),
            frame.hl, frame.pal, frame.lh, frame.mbi, frame.fx]);
        if (!show.dirty && key === show.key && now - show.sentAt < ClubMultiplayer.SHOW_HEARTBEAT_MS) return;
        if (this.client.sendShow(frame)) {
            show.key = key;
            show.sentAt = now;
            show.dirty = false;
        }
    }

    /** Guest: put this rig on the host's frame. */
    _applyShow(frame) {
        if (!this.following || !frame || typeof frame.m !== 'string') return;
        const club = this.club;
        const director = club.showDirector, vj = club.vjDirector;
        if (!director || !vj) return;
        const now = performance.now();
        const show = this._show;
        show.lastFrameAt = now;
        if (show.stale) this._setStale(false);

        if (vj.applyRemoteColour) vj.applyRemoteColour(frame);
        if (frame.m === 'show') {
            club.vjManualMode = false;
            director.enabled = true;
            director.applyRemote(frame, show.force);
        } else {
            club.vjManualMode = true;
            club.lastVJInteraction = now / 1000;
            this._applyFixtures(frame.fx);
        }
        show.mode = frame.m;
        show.force = false;
    }

    /** Fall back to this browser's own show while the host is silent, and take the host's again when it speaks. */
    _setStale(stale) {
        const show = this._show;
        show.stale = stale;
        const follow = this.following && !stale;
        if (this.club.showDirector) this.club.showDirector.setFollower(follow);
        if (this.club.vjDirector) this.club.vjDirector.remoteDriven = follow;
        if (!stale) show.force = true;
    }

    /** Apply the host's console settings, each one only if it is a known fixture, of the right type and in range. */
    _applyFixtures(fx) {
        if (!fx || typeof fx !== 'object') return;
        const club = this.club;
        const safe = !!club.photosensitiveSafeMode;
        for (const key of Object.keys(ClubMultiplayer.MANUAL_FIXTURES)) {
            if (!Object.prototype.hasOwnProperty.call(fx, key)) continue;
            const spec = ClubMultiplayer.MANUAL_FIXTURES[key];
            let value = fx[key];
            if (spec === 'b') {
                if (typeof value !== 'boolean') continue;
            } else {
                if (typeof value !== 'number' || !Number.isFinite(value)) continue;
                value = Math.min(spec[1], Math.max(spec[0], value));
                if (/Index$|Mode$|Pattern$/.test(key)) value = Math.round(value);
            }
            // Safe Mode is the guest's own medical setting: a host's console never turns strobes back on.
            if (safe && (key === 'strobesActive' || key === 'spotStrobeActive')) value = false;
            switch (key) {
                case 'goboEnabled':
                    if (club.goboEnabled !== value && typeof club.setGoboEnabled === 'function') club.setGoboEnabled(value);
                    break;
                case 'goboPatternIndex':
                    if (club.goboPatternIndex !== value && Array.isArray(club.goboPatterns) && value < club.goboPatterns.length
                        && typeof club.setGoboPattern === 'function') club.setGoboPattern(value);
                    break;
                case 'spotColorIndex': {
                    const count = club.spotColorList ? club.spotColorList.length : 0;
                    if (count && value < count && value !== club.spotColorIndex && typeof club.cycleSpotColor === 'function') {
                        club.spotColorIndex = (value - 1 + count) % count;
                        club.cycleSpotColor();
                    }
                    break;
                }
                case 'vjMaster':
                    if (club.vjDirector) club.vjDirector.targetMasterIntensity = value;
                    break;
                default:
                    if (key in club) club[key] = value;
            }
        }
    }

    /** A host's player controls change the track through the club; this announces those changes however they were made. */
    _watchAudio() {
        const el = this.club.audioElement;
        if (!el || el === this._audioWatched) return;
        if (this._audioWatched && this._audioShareListener) {
            for (const type of ['play', 'pause', 'seeked']) this._audioWatched.removeEventListener(type, this._audioShareListener);
        }
        this._audioWatched = el;
        this._audioShareListener = () => {
            clearTimeout(this._shareTimer);
            this._shareTimer = setTimeout(() => { if (this.isHost()) this.club._shareAudioPosition(); }, 250);
        };
        for (const type of ['play', 'pause', 'seeked']) el.addEventListener(type, this._audioShareListener);
    }

    /** Per frame, host side: keep the room's music and lights current. Guest side: keep the lights on the host's frame. */
    _syncShared(now) {
        this._watchAudio();
        const show = this._show;
        if (this.isHost()) {
            if (this.client.peerCount > 0) {
                this._broadcastShow(now);
                if (now - this._musicBeatAt >= ClubMultiplayer.MUSIC_HEARTBEAT_MS) {
                    this._musicBeatAt = now;
                    const audio = this.club.audioElement;
                    if (audio && !audio.paused) this.club._shareAudioPosition();
                }
            }
            return;
        }
        if (!this.following) return;
        const stale = now - show.lastFrameAt > ClubMultiplayer.SHOW_STALE_MS;
        if (stale !== show.stale) this._setStale(stale);
        if (stale) return;
        // Whatever a guest's own controls or shortcuts did to the rig, the host's mode wins every frame.
        if (show.mode === 'show') { this.club.vjManualMode = false; if (this.club.showDirector) this.club.showDirector.enabled = true; }
        else if (show.mode) { this.club.vjManualMode = true; this.club.lastVJInteraction = now / 1000; }
    }

    // ───────────────────────── per frame ─────────────────────────

    /**
     * Called every frame from the render loop (updateNetworkPresence). Two small jobs: end a dance when the guest
     * walks away, and turn a real nod of the head (VR) into the nod gesture.
     */
    update(ctx) {
        if (!this.connected) return;
        const club = this.club;
        this._syncShared(performance.now());
        const camera = club.isInVRMode && club.vrHelper && club.vrHelper.baseExperience && club.vrHelper.baseExperience.camera;
        const eye = camera || club.camera;
        if (!eye) return;
        const position = eye.globalPosition || eye.position;

        if (this.dancing) {
            if (!this._danceFrom) this._danceFrom = { x: position.x, z: position.z };
            else if (Math.hypot(position.x - this._danceFrom.x, position.z - this._danceFrom.z) > ClubMultiplayer.DANCE_BREAK_DISTANCE) {
                this.dancing = false;
                this._danceFrom = null;
                this.client.sendGesture('stop');
                this._emit();
            }
        }

        if (camera && this.autoNod && this.client.peerCount > 0) this._watchForNod(camera, ctx.time || 0, ctx.dt || 1 / 60);
    }

    /** A nod is the head pitching down by about 10 degrees and coming back within a second. */
    _watchForNod(camera, time, dt) {
        const nod = this._nod;
        const pitch = Math.asin(Math.max(-1, Math.min(1, camera.getDirection(BABYLON.Axis.Z).y)));
        if (nod.baseline === null) nod.baseline = pitch;
        // Slow average: where the head rests, so looking up at the lasers is not a nod.
        nod.baseline += (pitch - nod.baseline) * (1 - (1 - 0.02) ** (dt * 60));
        const deviation = pitch - nod.baseline;
        if (time < nod.cooldownUntil) { nod.down = false; return; }
        if (!nod.down && deviation < -0.17) { nod.down = true; nod.downAt = time; return; }
        if (nod.down) {
            if (time - nod.downAt > 0.9) nod.down = false;
            else if (deviation > -0.05) {
                nod.down = false;
                nod.cooldownUntil = time + 3;
                this.client.sendGesture('nod');
            }
        }
    }

    dispose() {
        this._disposed = true;
        this._stopPing();
        clearTimeout(this._shareTimer);
        if (this._audioWatched && this._audioShareListener) {
            for (const type of ['play', 'pause', 'seeked']) this._audioWatched.removeEventListener(type, this._audioShareListener);
        }
        this._audioWatched = null;
        if (this.club.showDirector) this.club.showDirector.setFollower(false);
        if (this.club.vjDirector) this.club.vjDirector.remoteDriven = false;
        this.club.roomFollower = false;
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.classList.remove('room-guest');
        this.listeners.clear();
        if (this.client) { try { this.client.dispose(); } catch (_) { /* ignore */ } }
        this.client = null;
        this.manager = null;
        if (this.club && this.club.multiplayer === this) this.club.multiplayer = null;
    }
}

window.ClubMultiplayer = ClubMultiplayer;
