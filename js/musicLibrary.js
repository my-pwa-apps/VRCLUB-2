'use strict';

class MusicLibrary {
    static KEY = 'vrclub.questMusic';
    static MAX_SETS = 8;
    static COLOURIZON_FEED_PATH = '/podcast/colourizon/feed.xml';
    static RESIDENT_FEED = 'https://podcast.hernancattaneo.com/feed.xml';
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
        this.onChange = null;
        try {
            this.storage = storage || window.localStorage;
            const raw = this.storage.getItem(MusicLibrary.KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.items) || data.items.length > MusicLibrary.MAX_SETS) {
                throw new Error('Invalid saved music library');
            }
            this.items = data.items.map(item => this._item(item.url, item.name));
            this.selected = Number.isInteger(data.selected) && data.selected >= 0 && data.selected < this.items.length
                ? data.selected : 0;
        } catch (error) {
            this.items = [];
            console.warn('[Music] Could not read saved sets:', error);
            club.showErrorMessage('Saved sets could not be read. Add your music links again.');
        }
    }

    _item(url, name) {
        const parsed = new URL(String(url).trim());
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
        const melera = MusicLibrary.isMeleraUrl(parsed);
        const feed = !soundcloud && MusicLibrary.isFeedUrl(parsed);
        const fallbackName = melera ? 'Miss Melera set'
            : (feed && MusicLibrary.isResidentUrl(parsed) ? 'Resident by Hernan Cattaneo'
                : (soundcloud ? 'SoundCloud set' : parsed.hostname));
        return {
            url: parsed.href,
            name: String(name || fallbackName).trim().slice(0, 60) || parsed.hostname,
            kind: melera ? 'melera' : (feed ? 'feed' : (soundcloud ? 'soundcloud' : 'direct'))
        };
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

    /** An RSS feed (or Hernan Cattaneo's podcast site, whose feed is the playable source): its newest episode plays. */
    static isFeedUrl(url) {
        if (!url) return false;
        if (MusicLibrary.isResidentUrl(url)) return !/\.(mp3|m4a|ogg|opus|wav|aac)$/i.test(url.pathname);
        return /(\.(rss|xml)|\/feed\/?)$/i.test(url.pathname);
    }

    _meleraSlug(url) {
        if (!MusicLibrary.isMeleraUrl(url)) return null;
        return url.pathname.split('/').filter(Boolean)[1].toLowerCase();
    }

    /** The playable episodes of a feed (newest first). Hernan's feed is ~2.6 MB, so only its head is read first. */
    async _feedEpisodes(item) {
        if (typeof this.fetchBuffer !== 'function' || !window.AudioUtils) throw new Error('The feed reader is unavailable.');
        const parsed = new URL(item.url);
        const resident = MusicLibrary.isResidentUrl(parsed);
        const url = resident ? MusicLibrary.RESIDENT_FEED : parsed.href;
        const decode = buffer => new TextDecoder('utf-8').decode(buffer);
        let episodes = [];
        if (resident) {
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
        return episodes;
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
            items[index] = item;
        }
        this._persist(items, index);
        return item;
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

    async play() {
        if (!this.club.guardHostControl('music')) return false;
        const item = this.current();
        if (!item) throw new Error('No saved sets. Add a music link in Music first.');
        // How the set actually plays: 'analysed' (the audio graph drives the lights), 'player' (SoundCloud's own player).
        this.lastMode = 'analysed';
        let label = item.name;
        if (item.kind === 'melera') {
            let episode = null;
            try { episode = await this._resolveMelera(item); }
            catch (error) { console.warn('[Music] Miss Melera feed unavailable:', error); }
            if (episode) {
                this.resolvedUrls.set(item.url, episode.url);
                await this.club.startAudioStream(episode.url, { onDemand: true });
            } else {
                this.lastMode = 'player';
                await this.club.startSoundCloud(item.url, item.name);
            }
        } else if (item.kind === 'feed') {
            const episode = (await this._feedEpisodes(item))[0];
            this.resolvedUrls.set(item.url, episode.url);
            await this.club.startAudioStream(episode.url, { onDemand: true });
            label = episode.title || item.name;
        } else if (item.kind === 'soundcloud') {
            this.lastMode = 'player';
            await this.club.startSoundCloud(item.url, item.name);
        } else {
            await this.club.startAudioStream(item.url, { onDemand: true });
        }
        this.club.nowPlayingLabel = label;
        if (this.onChange) this.onChange(item);
        return true;
    }
}

if (typeof window !== 'undefined') window.MusicLibrary = MusicLibrary;
