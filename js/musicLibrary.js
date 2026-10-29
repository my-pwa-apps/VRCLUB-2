'use strict';

class MusicLibrary {
    static KEY = 'vrclub.questMusic';
    static PLAYBACK_KEY = 'vrclub.questMusicPlayback';
    static MAX_SETS = 8;
    /** The club's own generated set, served from this site (so it is first-party and the audio analyser can read it). */
    static DEFAULT_SET = Object.freeze({ path: 'audio/nocturne-house.mp3', name: 'NOCTURNE House (club set)' });
    static COLOURIZON_FEED_PATH = '/podcast/colourizon/feed.xml';
    static SOUNDCLOUD_RESOLVE_PATH = '/soundcloud/resolve';
    static DEFAULT_NAMES = new Set(['SoundCloud set', 'Resident by Hernan Cattaneo']);
    static RESIDENT_FEED = 'https://podcast.hernancattaneo.com/feed.xml';
    static EPISODE_TTL_MS = 10 * 60 * 1000;
    static MAX_EPISODES = 2000;
    static SOUNDCLOUD_RESERVED = new Set(['sets', 'tracks', 'albums', 'reposts', 'likes', 'following', 'followers', 'popular-tracks', 'comments']);

    constructor(club, storage, options = {}) {
        this.club = club;
        this.storage = storage;
        this.fetchBuffer = options.fetchBuffer || window.fetchBufferWithTimeout;
        this.getRelay = options.getRelay || (() => {
            const configured = this.club.multiplayer && this.club.multiplayer.serverUrl;
            if (configured) return configured;
            if (typeof ClubMultiplayer !== 'undefined') {
                return ClubMultiplayer.defaultServerUrl(this.storage);
            }
            return null;
        });
        this.items = [];
        this.selected = 0;
        this.resolvedUrls = new Map();
        this._episodeLists = new Map();
        this.playback = null;
        this._startupResumePending = true;
        this.onChange = null;
        try {
            this.storage = storage || window.localStorage;
            const raw = this.storage.getItem(MusicLibrary.KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.items) || data.items.length > MusicLibrary.MAX_SETS) {
                throw new Error('Invalid saved music library');
            }
            this.items = data.items.map(item => this._item(item.url, item.name, item.episode));
            this.selected = Number.isInteger(data.selected) && data.selected >= 0 && data.selected < this.items.length
                ? data.selected : 0;
            const playbackRaw = this.storage.getItem(MusicLibrary.PLAYBACK_KEY);
            if (playbackRaw) {
                const playback = JSON.parse(playbackRaw);
                if (playback && typeof playback.savedUrl === 'string' && Number.isFinite(playback.position)
                    && playback.position >= 0 && Number.isFinite(playback.updatedAt)) {
                    this.playback = playback;
                }
            }
        } catch (error) {
            this.items = [];
            console.warn('[Music] Could not read saved sets:', error);
            club.showErrorMessage('Saved sets could not be read. Add your music links again.');
        }
    }

    static normalizeSoundCloudUrl(url) {
        if (typeof url !== 'string') return url;
        const trimmed = url.trim();
        if (!trimmed) return trimmed;
        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return trimmed;
            if (!/^(?:www\.|m\.)?soundcloud\.com$/i.test(parsed.hostname)) return trimmed;
            const parts = parsed.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
            if (parts.length !== 2 || !parts[0] || !parts[1]) return trimmed;
            if (MusicLibrary.SOUNDCLOUD_RESERVED.has(parts[0].toLowerCase()) || MusicLibrary.SOUNDCLOUD_RESERVED.has(parts[1].toLowerCase())) {
                return trimmed;
            }
            for (const key of ['si', 'in', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
                parsed.searchParams.delete(key);
            }
            parsed.hostname = 'soundcloud.com';
            parsed.protocol = 'https:';
            parsed.hash = '';
            return `https://soundcloud.com/${parts[0]}/${parts[1]}`;
        } catch (_) {
            return trimmed;
        }
    }

    _item(url, name, episode) {
        const normalisedUrl = MusicLibrary.normalizeSoundCloudUrl(String(url).trim());
        const parsed = new URL(normalisedUrl);
        // These two hosts serve the same files over HTTPS, so a pasted http:// link is upgraded instead of refused.
        if (parsed.protocol === 'http:' && /(^|\.)(hernancattaneo\.com|podbean\.com)$/.test(parsed.hostname)) {
            parsed.protocol = 'https:';
        }
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
            throw new Error('Use a direct HTTPS audio link without a username or password.');
        }
        const soundcloud = /(^|\.)soundcloud\.com$/.test(parsed.hostname);
        if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/.test(parsed.hostname)) {
            throw new Error('That is a music website, not a direct audio link. Use an HTTPS MP3, M4A, OGG or stream URL.');
        }
        if (soundcloud) {
            for (const key of ['si', 'utm_source', 'utm_medium', 'utm_campaign']) parsed.searchParams.delete(key);
        }
        const feed = !soundcloud && MusicLibrary.isFeedUrl(parsed);
        const fallbackName = feed && MusicLibrary.isResidentUrl(parsed) ? 'Resident by Hernan Cattaneo'
            : (soundcloud ? 'SoundCloud set' : parsed.hostname);
        const item = {
            url: parsed.href,
            name: String(name || fallbackName).trim().slice(0, 60) || parsed.hostname,
            kind: feed ? 'feed' : (soundcloud ? 'soundcloud' : 'direct')
        };
        const choice = feed ? MusicLibrary._episodeChoice(episode) : null;
        if (choice) item.episode = choice;
        return item;
    }

    /** A saved episode choice: `{ random: true }` or one episode `{ url, title }`; anything else means "newest". */
    static _episodeChoice(episode) {
        if (!episode || typeof episode !== 'object') return null;
        if (episode.random === true) return { random: true };
        try {
            const url = new URL(String(episode.url));
            if (url.protocol !== 'https:' || url.username || url.password) return null;
            return { url: url.href, title: String(episode.title || 'Episode').slice(0, 120) };
        } catch (_) {
            return null;
        }
    }

    /** A Miss Melera upload page: soundcloud.com/missmelera/<track>. Playable through the club relay when its feed lists it. */
    static isMeleraUrl(url) {
        if (!url || !/(^|\.)soundcloud\.com$/.test(url.hostname)) return false;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'missmelera') return false;
        return !MusicLibrary.SOUNDCLOUD_RESERVED.has(parts[1].toLowerCase());
    }

    static isResidentUrl(url) {
        return !!url && url.hostname.toLowerCase() === 'podcast.hernancattaneo.com';
    }

    /**
     * Hernan Cattaneo's podcast site (anything that is not an audio file): its RSS feed is the playable source. Only
     * this host is supported because the page's CSP lists exactly the hosts the browser may read.
     */
    static isFeedUrl(url) {
        return !!url && MusicLibrary.isResidentUrl(url) && !/\.(mp3|m4a|ogg|opus|wav|aac)$/i.test(url.pathname);
    }

    _meleraSlug(url) {
        if (!MusicLibrary.isMeleraUrl(url)) return null;
        return url.pathname.split('/').filter(Boolean)[1].toLowerCase();
    }

    /**
     * The playable episodes of a feed (newest first). Hernan's feed is ~2.6 MB, so unless `all` is asked for (the
     * episode list, a random pick) only its head is read: that is enough for the newest episode.
     */
    async _feedEpisodes(item, { all = false } = {}) {
        if (typeof this.fetchBuffer !== 'function' || !window.AudioUtils) throw new Error('The feed reader is unavailable.');
        const parsed = new URL(item.url);
        const resident = MusicLibrary.isResidentUrl(parsed);
        const url = resident ? MusicLibrary.RESIDENT_FEED : parsed.href;
        const cached = this._episodeLists.get(url);
        if (cached && Date.now() - cached.at < MusicLibrary.EPISODE_TTL_MS) return cached.episodes;
        const decode = buffer => new TextDecoder('utf-8').decode(buffer);
        let episodes = [];
        if (resident && !all) {
            try {
                episodes = window.AudioUtils.parsePodcastEpisodes(decode(await this.fetchBuffer(url, {
                    timeoutMs: 15000, cache: 'no-cache', headers: { Range: 'bytes=0-65535' }
                })));
            } catch (_) { /* fall through to the whole feed */ }
        }
        if (!episodes.length) {
            episodes = window.AudioUtils.parsePodcastEpisodes(decode(await this.fetchBuffer(url, {
                timeoutMs: 30000, cache: 'no-cache'
            })));
        }
        if (!episodes.length) throw new Error('No playable episode was found in that feed. Feeds need to allow CORS.');
        // Only a whole-feed read is the catalogue; a head read is just the newest few.
        if (all || !resident) this._episodeLists.set(url, { at: Date.now(), episodes });
        return episodes;
    }

    /** Every episode of the selected feed set, newest first (for the episode picker). */
    async listEpisodes() {
        const item = this.current();
        if (!item || item.kind !== 'feed') return [];
        return (await this._feedEpisodes(item, { all: true })).slice(0, MusicLibrary.MAX_EPISODES);
    }

    /** Remember which episode the selected feed set plays: null = newest, 'random', or `{ url, title }`. */
    setEpisode(choice) {
        const item = this.current();
        if (!item || item.kind !== 'feed') throw new Error('Choose a podcast feed first.');
        const next = Object.assign({}, item);
        delete next.episode;
        const episode = choice === 'random' ? { random: true } : MusicLibrary._episodeChoice(choice);
        if (episode) next.episode = episode;
        const items = this.items.slice();
        items[this.selected] = next;
        this._persist(items, this.selected);
        return next;
    }

    _relayBase() {
        const configured = this.getRelay();
        if (!configured) throw new Error('The club relay is unavailable, so this Colourizon set cannot be resolved.');
        const relay = new URL(configured);
        if (relay.protocol === 'wss:') relay.protocol = 'https:';
        else if (relay.protocol === 'ws:') relay.protocol = 'http:';
        else if (relay.protocol !== 'https:' && relay.protocol !== 'http:') {
            throw new Error('The club relay address is invalid.');
        }
        relay.pathname = '';
        relay.search = '';
        relay.hash = '';
        return relay.href.replace(/\/$/, '');
    }

    /** The relay feed's episode for a Miss Melera page, or null when the feed does not list it. */
    async _resolveMelera(item) {
        const slug = this._meleraSlug(new URL(item.url));
        if (!slug) return null;
        if (typeof this.fetchBuffer !== 'function' || !window.AudioUtils) return null;
        const feedUrl = `${this._relayBase()}${MusicLibrary.COLOURIZON_FEED_PATH}`;
        const xml = new TextDecoder('utf-8').decode(await this.fetchBuffer(feedUrl, {
            timeoutMs: 30000,
            cache: 'no-cache'
        }));
        // The feed's files are `<id>-missmelera-<permalink>.mp3`. A page may use the full permalink or just
        // `colourizon-168`, so the Colourizon number is also accepted.
        const number = /colourizon-(\d+)/.exec(slug);
        const wanted = [`-${slug}.mp3`];
        if (number) wanted.push(`-colourizon-${number[1]}.mp3`);
        return window.AudioUtils.parsePodcastEpisodes(xml).find(candidate => {
            try {
                const file = decodeURIComponent(new URL(candidate.url).pathname).split('/').pop().toLowerCase();
                return wanted.some(suffix => file.endsWith(suffix));
            } catch (_) {
                return false;
            }
        }) || null;
    }

    current() { return this.items[this.selected] || null; }

    matchesPlaybackUrl(savedUrl, playbackUrl) {
        try {
            const saved = new URL(savedUrl).href;
            const playing = new URL(playbackUrl).href;
            return saved === playing || this.resolvedUrls.get(saved) === playing;
        } catch (_) {
            return false;
        }
    }

    /**
     * What the Link tab's two buttons say for the link in its field, given what is playing right now.
     * `active` is `{ url, playing }`: the address being played (if any) and whether anything is playing.
     * Pure: the panel only draws the answer. "Play now" saves AND plays; "Save to my sets" only saves.
     */
    linkAction(url, active = {}) {
        const text = String(url || '').trim();
        let normalised = null;
        try { if (text) normalised = this._item(text).url; } catch (_) { normalised = null; }
        const saved = !!normalised && this.items.some(item => item.url === normalised);
        const isActive = !!(text && active.url && this.matchesPlaybackUrl(normalised || text, active.url));
        const full = this.items.length >= MusicLibrary.MAX_SETS;
        const play = !text ? { label: 'Play now', disabled: false }
            : isActive ? (active.playing ? { label: 'Playing now', disabled: true } : { label: 'Resume', disabled: false })
                : { label: saved ? 'Play this set' : 'Play now', disabled: false };
        const save = !text ? { label: 'Save to my sets', disabled: true }
            : saved ? { label: 'Saved in my sets', disabled: true }
                : full ? { label: 'Sets full (8)', disabled: true } : { label: 'Save to my sets', disabled: false };
        let note = '';
        if (text && !isActive && active.playing) {
            note = saved
                ? 'Another set is playing. Play this set switches to it.'
                : 'Another set is playing. Play now switches to this link. Save to my sets adds it and keeps the current set playing.';
        } else if (text && !saved && !isActive) {
            note = 'Play now saves this link and plays it. Save to my sets only saves it.';
        } else if (text && saved && !isActive) {
            note = 'This link is already in your saved sets.';
        }
        return { play, save, note, saved, active: isActive };
    }

    _resumePosition(item, playbackUrl) {
            if (!this._startupResumePending) return 0;
            this._startupResumePending = false;
            const saved = this.playback;
            if (!saved || !item || saved.savedUrl !== item.url || saved.position < 1) return 0;
            try {
                if (saved.playbackUrl && new URL(saved.playbackUrl).href !== new URL(playbackUrl).href
                    && item.kind === 'direct') return 0;
            } catch (_) {
                return 0;
            }
            return saved.position;
        }

        /** Persist a finite on-demand set's current clock so a reload of the same saved source resumes it. */
    capturePlayback() {
            const item = this.current();
            const info = this.club && typeof this.club.getPlaybackInfo === 'function' ? this.club.getPlaybackInfo() : null;
            const playbackUrl = this.club && this.club._audioStreamUrl;
            if (!item || !info || !info.seekable || !playbackUrl || !this.matchesPlaybackUrl(item.url, playbackUrl)) return false;
            const playback = {
                savedUrl: item.url,
                playbackUrl,
                position: Math.min(Math.max(0, info.position), Math.max(0, info.duration - 1)),
                updatedAt: Date.now()
            };
            try {
                this.storage.setItem(MusicLibrary.PLAYBACK_KEY, JSON.stringify(playback));
                this.playback = playback;
                return true;
            } catch (error) {
                console.warn('[Music] Could not save playback position:', error);
                return false;
        }
    }

    _persist(items, selected) {
        try {
            this.storage.setItem(MusicLibrary.KEY, JSON.stringify({ items, selected }));
        } catch (error) {
            throw new Error(`Could not save sets on this device: ${error.message}`);
        }
        this.items = items;
        this.selected = selected;
        if (this.onChange) this.onChange();
    }

    save(url, name) {
        const item = this._item(url, name);
        const items = this.items.slice();
        let index = items.findIndex(saved => saved.url === item.url);
        if (index < 0) {
            if (items.length >= MusicLibrary.MAX_SETS) throw new Error('Eight sets are saved. Remove one before adding another.');
            index = items.length;
            items.push(item);
        } else {
            // Saving the same feed again must not forget which episode the guest picked.
            if (item.kind === 'feed' && items[index].episode) item.episode = items[index].episode;
            items[index] = item;
        }
        this._persist(items, index);
        return item;
    }

    /**
     * Makes the saved sets exactly `entries` (the list kept on the owner's phone). Entries that cannot be played are
     * skipped, the selection stays on its link when that link is still listed, and a feed's episode choice and a name the
     * player learned survive. Resolves to { count, skipped, changed }; storage is only written when something differs.
     */
    replaceAll(entries) {
        const next = [];
        let skipped = 0;
        for (const entry of Array.isArray(entries) ? entries.slice(0, 64) : []) {
            if (next.length >= MusicLibrary.MAX_SETS) break;
            try {
                const item = this._item(entry && entry.url, entry && entry.name);
                if (next.some(saved => saved.url === item.url)) continue;
                const old = this.items.find(saved => saved.url === item.url);
                if (old) {
                    if (item.kind === 'feed' && old.episode) item.episode = old.episode;
                    if (!(entry && typeof entry.name === 'string' && entry.name.trim())) item.name = old.name;
                }
                next.push(item);
            } catch (_) {
                skipped++;
            }
        }
        const currentUrl = this.current() && this.current().url;
        const selected = Math.max(0, next.findIndex(item => item.url === currentUrl));
        const changed = JSON.stringify(next) !== JSON.stringify(this.items);
        if (changed) this._persist(next, selected);
        return { count: next.length, skipped, changed };
    }

    /** The club's own set (scripts/build-default-set.mjs): an absolute URL on the page's own origin, never saved to the list. */
    defaultItem() {
        return {
            url: new URL(MusicLibrary.DEFAULT_SET.path, window.location.href).href,
            name: MusicLibrary.DEFAULT_SET.name, kind: 'direct', builtin: true
        };
    }

    /** True while the club's own set is what is playing (nothing of the guest's is). */
    isDefaultPlaying() {
        return !!this._defaultUrl && this.club._audioStreamUrl === this._defaultUrl;
    }

    /**
     * Plays the club's own original set so nobody stands in a silent club. It only ever fills silence: it does nothing when
     * the guest has saved sets (that is what plays), in someone else's room (the host owns the music), or when something
     * is already playing. It is not saved, so it never appears in, or overwrites, the guest's list, and it loops.
     */
    async playDefault() {
        const club = this.club;
        if (this.items.length || (club.isFollowingHost && club.isFollowingHost())) return false;
        const info = club.getPlaybackInfo ? club.getPlaybackInfo() : null;
        const item = this.defaultItem();
        // Something else is loaded (a local file, SoundCloud's player, another stream): leave it. The club's own set loaded
        // but held back by the browser's autoplay rules is fine to retry on the next gesture.
        const other = club._audioKind && !(club._audioKind === 'stream' && club._audioStreamUrl === item.url);
        if ((info && info.playing) || other) return false;
        this.lastMode = 'analysed';
        this._defaultUrl = item.url;
        await club.startAudioStream(item.url, { quietBlock: true });
        club.nowPlayingLabel = item.name;
        if (this.onChange) this.onChange(item);
        return true;
    }

    select(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.items.length) {
            throw new Error('Choose a saved set first.');
        }
        this._persist(this.items, index);
        return this.current();
    }

    step(delta) {
        if (delta !== -1 && delta !== 1) throw new Error('Choose the previous or next saved set.');
        if (!this.items.length) throw new Error('No saved sets. Use ADD LINKS to save your music.');
        return this.select((this.selected + delta + this.items.length) % this.items.length);
    }

    remove() {
        if (!this.current()) throw new Error('No saved set to remove.');
        const items = this.items.filter((_, index) => index !== this.selected);
        this._persist(items, Math.min(this.selected, Math.max(0, items.length - 1)));
    }

    /** A short-lived signed Podbean storage link (`s123.podbean.com/pb/<token>/...mp3?pbss=`). */
    static isSignedPodbeanUrl(url) {
        try {
            const parsed = new URL(url);
            return /^s\d+\.podbean\.com$/.test(parsed.hostname) && parsed.pathname.startsWith('/pb/') && parsed.searchParams.has('pbss');
        } catch (_) {
            return false;
        }
    }

    /** The Resident feed's own link for the episode a signed Podbean link names, or null when it is not a Resident episode. */
    async _stablePodbeanUrl(url) {
        if (!MusicLibrary.isSignedPodbeanUrl(url)) return null;
        try {
            const file = new URL(url).pathname.split('/').pop();
            const episodes = await this._feedEpisodes({ url: MusicLibrary.RESIDENT_FEED }, { all: true });
            const match = episodes.find(episode => new URL(episode.url).pathname.split('/').pop() === file);
            return match ? match.url : null;
        } catch (_) {
            return null;
        }
    }

    async play() {
        try {
            return await this._playSelected();
        } catch (error) {
            // The guest's own set cannot play: the club's own set fills the silence instead (their saved list is untouched).
            if (this.current()) await this.fallBackToDefault(error);
            throw error;
        }
    }

    /**
     * Plays the club's own set because the guest's set (or the stream they were listening to) failed. Unlike
     * `playDefault()` it runs even when sets are saved, but never in someone else's room (the host owns the music), never
     * when the club's own set is already playing, and never for an autoplay block, which is retried on the next gesture.
     * Returns whether the club's set started. It never throws: this is the safety net.
     */
    async fallBackToDefault(error) {
        if (error && error.name === 'NotAllowedError') return false;
        const club = this.club;
        try {
            if (club.isFollowingHost && club.isFollowingHost()) return false;
            const item = this.defaultItem();
            const audio = club.audioElement;
            if (this.isDefaultPlaying() && audio && !audio.paused) return false;
            this.lastMode = 'analysed';
            this._defaultUrl = item.url;
            await club.startAudioStream(item.url, { quietBlock: true });
            club.nowPlayingLabel = item.name;
            club.showErrorMessage('That music could not be played, so the club\u2019s own set is playing instead. Anything you saved is still in Music.', 'info');
            if (this.onChange) this.onChange(item);
            return true;
        } catch (fallbackError) {
            this._defaultUrl = null;
            console.warn('[Music] The club\u2019s own set could not start either:', fallbackError);
            return false;
        }
    }

    async _playSelected() {
        if (!this.club.guardHostControl('music')) return false;
        const item = this.current();
        if (!item) throw new Error('No saved sets. Add a music link in Music first.');
        // How the set plays: always 'analysed' (the audio graph drives the lights and dancers) except when the guest
        // explicitly chose SoundCloud's own player (see playInSoundCloudPlayer).
        this.lastMode = 'analysed';
        let label = item.name;
        if (item.kind === 'soundcloud') {
            const episode = await this._resolveSoundCloud(item);
            this.resolvedUrls.set(item.url, episode.url);
            await this.club.startAudioStream(episode.url, {
                onDemand: true, resumeAt: this._resumePosition(item, episode.url)
            });
            if (episode.title) label = episode.title;
            this._adoptTitle(item, episode.title);
        } else if (item.kind === 'feed') {
            let episode;
            if (item.episode && item.episode.url) {
                episode = item.episode;
            } else if (item.episode && item.episode.random) {
                const all = await this._feedEpisodes(item, { all: true });
                episode = all[Math.floor(Math.random() * all.length)];
            } else {
                episode = (await this._feedEpisodes(item))[0];
            }
            this.resolvedUrls.set(item.url, episode.url);
            await this.club.startAudioStream(episode.url, {
                onDemand: true, resumeAt: this._resumePosition(item, episode.url)
            });
            label = episode.title || item.name;
        } else {
            // A Podbean storage link copied from a browser carries a signature that lapses within hours, and the expired
            // link is refused without CORS headers: play the same episode through the feed's stable link instead.
            let url = item.url;
            const fresh = await this._stablePodbeanUrl(url);
            if (fresh) {
                url = fresh;
                this.resolvedUrls.set(item.url, fresh);
            }
            await this.club.startAudioStream(url, {
                onDemand: true, resumeAt: this._resumePosition(item, url)
            });
        }
        this.club.nowPlayingLabel = label;
        if (typeof this.club.syncDJFromSet === 'function') {
            this.club.syncDJFromSet({ label, savedName: item.name, url: item.url });
        }
        if (this.onChange) this.onChange(item);
        return true;
    }

    /** The guest's explicit choice, after an analysed play was refused: SoundCloud's own player (no beat analysis). */
    async playInSoundCloudPlayer() {
        if (!this.club.guardHostControl('music')) return false;
        const item = this.current();
        if (!item || item.kind !== 'soundcloud') throw new Error('Choose a SoundCloud set first.');
        await this.club.startSoundCloud(item.url, item.name);
        this.lastMode = 'player';
        this.club.nowPlayingLabel = item.name;
        if (typeof this.club.syncDJFromSet === 'function') {
            this.club.syncDJFromSet({ label: item.name, savedName: item.name, url: item.url });
        }
        if (this.onChange) this.onChange(item);
        return true;
    }

    /** A set saved without a name takes the track's own title the first time it resolves. */
    _adoptTitle(item, title) {
        if (!title || !MusicLibrary.DEFAULT_NAMES.has(item.name)) return;
        const index = this.items.indexOf(item);
        if (index < 0) return;
        const items = this.items.slice();
        items[index] = Object.assign({}, item, { name: title.slice(0, 60) });
        try { this._persist(items, this.selected); } catch (_) { /* keep the old name */ }
    }

    /**
     * A playable relay stream for a SoundCloud page. SoundCloud only hands raw audio to podcast players, and only for
     * tracks whose creator publishes them that way; the relay checks that (see worker/src/podcast.js) and this refuses
     * anything else instead of reaching for SoundCloud's embedded player behind the guest's back.
     */
    async _resolveSoundCloud(item) {
        const parsed = new URL(item.url);
        if (MusicLibrary.isMeleraUrl(parsed)) {
            // Miss Melera's own feed is already served by the relay (as on main); no extra lookup needed.
            try {
                const episode = await this._resolveMelera(item);
                if (episode) return episode;
            } catch (error) { console.warn('[Music] Miss Melera feed unavailable:', error); }
        }
        if (typeof this.fetchBuffer !== 'function') throw MusicLibrary._scError('relay');
        const relay = this._relayBase();
        let info;
        try {
            const body = await this.fetchBuffer(`${relay}${MusicLibrary.SOUNDCLOUD_RESOLVE_PATH}?url=${encodeURIComponent(item.url)}`,
                { timeoutMs: 20000, cache: 'no-cache' });
            info = JSON.parse(new TextDecoder('utf-8').decode(body));
        } catch (error) {
            const status = /HTTP (\d{3})/.exec(String(error && error.message));
            if (status && (status[1] === '404' || status[1] === '400')) {
                throw MusicLibrary._scError(status[1] === '400' ? 'not-a-track' : 'not-published');
            }
            console.warn('[Music] SoundCloud resolver unavailable:', error);
            throw MusicLibrary._scError('relay');
        }
        if (!info || typeof info.path !== 'string' || !info.path.startsWith('/soundcloud/stream/')) throw MusicLibrary._scError('relay');
        return { url: `${relay}${info.path}`, title: typeof info.title === 'string' ? info.title : '' };
    }

    static _scError(reason) {
        const messages = {
            'not-published': 'SoundCloud does not share this track as audio the club can analyse (its creator has not published it to podcast players), so the lights and dancers cannot follow it. You can open it in the SoundCloud player instead.',
            'not-a-track': 'Use a link to one SoundCloud track, like soundcloud.com/artist/track-name (playlists are not supported).',
            'relay': 'Could not reach the club relay to resolve this SoundCloud link. Check your connection and try again.'
        };
        const error = new Error(messages[reason]);
        error.code = `soundcloud-${reason}`;
        return error;
    }
}

if (typeof window !== 'undefined') window.MusicLibrary = MusicLibrary;
