'use strict';
// Podcasts: the two on-demand DJ sets the club can play, which one is chosen, how an episode is picked, and the queue
// that keeps the music going. One implementation behind two surfaces: the desktop Audio menu and the VR quick menu
// both drive `createPlayer()`, so they cannot drift (the same rule as the lighting controls).
//
//   Resident     by Hernan Cattaneo, Podbean feed; CORS-open, so the browser reads it directly.
//   Colourizon   by Miss Melera, a SoundCloud feed that a browser cannot read (CORS, and a signed stream redirect), so it
//                comes through the club's relay Worker: worker/src/podcast.js.
//
// Loaded after js/audioUtils.js and js/assetCache.js. Nothing here touches the DOM.

const PODCAST_PREF_KEY = 'vrclub.podcast';
const PODCAST_DEFAULT_ID = 'resident';
/** How long a fetched episode list is reused. The feeds change weekly or monthly; the full Resident feed is ~2.6 MB. */
const PODCAST_LIST_TTL_MS = 10 * 60 * 1000;
/** An episode that will not start is skipped; this many in a row is a dead feed, not a dead link. */
const PODCAST_START_ATTEMPTS = 3;

const PODCAST_CATALOG = Object.freeze({
    resident: Object.freeze({
        id: 'resident',
        name: 'Resident by Hernan Cattaneo',
        artist: 'Hernan Cattaneo',
        dj: 'hernan',
        feed: 'https://podcast.hernancattaneo.com/feed.xml',
        // The newest item comes first and is ~4 KB: a byte range finds the latest without the whole feed.
        headBytes: 65535,
        servers: ['podcast.hernancattaneo.com', 'Podbean']
    }),
    colourizon: Object.freeze({
        id: 'colourizon',
        name: 'Colourizon by Miss Melera',
        artist: 'Miss Melera',
        dj: 'melera',
        feedPath: '/podcast/colourizon/feed.xml',
        relay: true,
        servers: ['the club relay', 'SoundCloud']
    })
});

/** An own key of the catalogue (a plain `CATALOG[id]` would also answer for `__proto__` and `constructor`). */
const isPodcastId = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PODCAST_CATALOG, id);

const Podcasts = {
    catalog: PODCAST_CATALOG,
    ids: Object.freeze(Object.keys(PODCAST_CATALOG)),
    defaultId: PODCAST_DEFAULT_ID,
    prefKey: PODCAST_PREF_KEY,

    isPodcastId,

    get(id) { return isPodcastId(id) ? PODCAST_CATALOG[id] : PODCAST_CATALOG[PODCAST_DEFAULT_ID]; },

    /** The guest's choice (unknown or unreadable values fall back to the default). */
    selectedId(storage) {
        try {
            const stored = storage && storage.getItem(PODCAST_PREF_KEY);
            return isPodcastId(stored) ? stored : PODCAST_DEFAULT_ID;
        } catch (_) {
            return PODCAST_DEFAULT_ID;
        }
    },

    saveSelected(id, storage) {
        if (!isPodcastId(id)) return false;
        try { if (storage) storage.setItem(PODCAST_PREF_KEY, id); } catch (_) { /* private browsing */ }
        return true;
    },

    /** A relay's ws(s) address mapped to its https origin: the same host, no path. Null for anything else. */
    relayBase(networkUrl) {
        try {
            const url = new URL(networkUrl);
            if (url.protocol !== 'wss:' && url.protocol !== 'ws:') return null;
            return `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
        } catch (_) {
            return null;
        }
    },

    feedUrl(podcast, relay) {
        if (podcast.feed) return podcast.feed;
        return relay ? `${relay}${podcast.feedPath}` : null;
    },

    /** The servers that see the guest's IP address, for the splash and the menu: "a and b". */
    serversText(podcast, relay) {
        const names = podcast.servers.map(name => {
            if (name !== 'the club relay') return name;
            try { return new URL(relay).host; } catch (_) { return name; }
        });
        return names.join(' and ');
    },

    /** Index of a random episode in a list of `count`, never `avoid` when there is another choice. */
    randomIndex(count, rng = Math.random, avoid = -1) {
        if (!(count > 0)) return -1;
        if (count === 1) return 0;
        let index = Math.min(count - 1, Math.floor(rng() * count));
        if (index === avoid) index = (index + 1 + Math.min(count - 2, Math.floor(rng() * (count - 1)))) % count;
        return index;
    },

    /**
     * Playable episodes, newest first. `headOnly` reads just the first bytes of a feed that allows it (enough for the
     * newest episode); everything else reads the whole feed, which is what a random pick needs.
     */
    async fetchEpisodes(podcast, { relay = null, headOnly = false, fetchBuffer = window.fetchBufferWithTimeout } = {}) {
        const url = Podcasts.feedUrl(podcast, relay);
        if (!url) throw new Error(`${podcast.artist}'s episodes are not reachable from this server`);
        const decode = buffer => new TextDecoder('utf-8').decode(buffer);
        let episodes = [];
        if (headOnly && podcast.headBytes) {
            episodes = window.AudioUtils.parsePodcastEpisodes(decode(await fetchBuffer(url, {
                timeoutMs: 15000, cache: 'no-cache', headers: { Range: `bytes=0-${podcast.headBytes}` }
            })));
        }
        if (!episodes.length) {
            // The first item did not fit in the range, the server ignored it, or the whole feed was asked for.
            episodes = window.AudioUtils.parsePodcastEpisodes(decode(await fetchBuffer(url, { timeoutMs: 30000, cache: 'no-cache' })));
        }
        if (!episodes.length) throw new Error('No playable episode found in the feed');
        return episodes;
    },

    /**
     * The player behind both menus.
     * @param {object} club  the VRClub (startAudioStream, audioElement, networkManager, setDJ)
     * @param {object} [options]
     * @param {() => string|null} [options.getRelay]  the relay's https base, for feeds that need it
     * @param {() => number} [options.rng]            Math.random, injectable for tests
     * @param {Storage} [options.storage]
     */
    createPlayer(club, { getRelay = () => null, rng = Math.random, storage = null, fetchBuffer } = {}) {
        const lists = new Map(); // podcast id -> { at, episodes }
        let advancing = false;

        const player = {
            /** The episodes in play order and the one playing; null while the guest is on anything else. */
            queue: null,
            /** Called after an episode has started: (episode, podcast). The DOM script hooks its labels here. */
            onEpisode: null,

            selectedId: () => Podcasts.selectedId(storage),
            selected: () => Podcasts.get(Podcasts.selectedId(storage)),

            async episodesFor(podcast, { headOnly = false } = {}) {
                const cached = lists.get(podcast.id);
                if (cached && Date.now() - cached.at < PODCAST_LIST_TTL_MS) return cached.episodes;
                const episodes = await Podcasts.fetchEpisodes(podcast, { relay: getRelay(), headOnly, fetchBuffer });
                // A head read is only the newest few: never mistake it for the catalogue.
                if (!headOnly) lists.set(podcast.id, { at: Date.now(), episodes });
                return episodes;
            },

            /** Play a random episode of `podcast` (the chosen one by default). */
            async playRandom(podcast = player.selected()) {
                const episodes = await player.episodesFor(podcast);
                const previous = player.queue && player.queue.podcast === podcast ? player.queue.index : -1;
                return player.playFrom(podcast, episodes, Podcasts.randomIndex(episodes.length, rng, previous));
            },

            async playLatest(podcast = player.selected()) {
                return player.playFrom(podcast, await player.episodesFor(podcast, { headOnly: true }), 0);
            },

            /**
             * Play episodes[index]. If it will not start, try the next older one (a few times), so one dead link does not
             * silence the club. A play() blocked by autoplay policy is rethrown at once: the next episode would be blocked
             * too, and the queue stays on this one for a retry.
             */
            async playFrom(podcast, episodes, index) {
                let lastError = null;
                for (let i = index; i < episodes.length && i < index + PODCAST_START_ATTEMPTS; i++) {
                    player.queue = { podcast, episodes, index: i };
                    try {
                        await club.startAudioStream(episodes[i].url, { onDemand: true });
                    } catch (err) {
                        if (err && err.name === 'NotAllowedError') throw err;
                        lastError = err;
                        continue;
                    }
                    player._watchEnd();
                    club.nowPlayingLabel = episodes[i].title;
                    Podcasts.saveSelected(podcast.id, storage);
                    // The DJ on the decks follows the music.
                    if (typeof club.setDJ === 'function') Promise.resolve(club.setDJ(podcast.dj)).catch(() => {});
                    const net = club.networkManager;
                    if (net && net.connected && net.isHost()) net.sendMusic({ url: episodes[i].url, playing: true, position: 0 });
                    if (typeof player.onEpisode === 'function') player.onEpisode(episodes[i], podcast);
                    return episodes[i];
                }
                player.queue = null;
                throw lastError || new Error('No playable episode');
            },

            /** The guest picked another podcast: remember it and start one of its episodes. */
            async switchTo(id) {
                const podcast = Podcasts.get(id);
                Podcasts.saveSelected(podcast.id, storage);
                return player.playRandom(podcast);
            },

            /** Is `url` the episode the queue is on (so Play should resume the queue rather than loop it)? */
            isQueuedUrl(url) {
                const queued = player.queue && player.queue.episodes[player.queue.index];
                if (!queued) return false;
                try { return new URL(queued.url).href === new URL(url).href; } catch (_) { return false; }
            },

            /** One 'ended' listener per audio element; it only acts while the queue is still on its episode. */
            _watchEnd() {
                const audio = club.audioElement;
                if (!audio || audio._vrclubEpisodeWatch) return;
                audio._vrclubEpisodeWatch = true;
                audio.addEventListener('ended', () => { player.advance(); });
            },

            /** An episode ended: the next older one starts; past the oldest, a random one. */
            async advance() {
                const queue = player.queue;
                // The guest chose something else (a stream, a file) while this played: not ours any more.
                if (advancing || !queue || club._audioStreamUrl !== queue.episodes[queue.index].url) return;
                // Following a host: the host's next episode arrives from the host, this guest does not pick one.
                if (typeof club.isFollowingHost === 'function' && club.isFollowingHost()) return;
                advancing = true;
                try {
                    if (queue.index + 1 < queue.episodes.length) {
                        await player.playFrom(queue.podcast, queue.episodes, queue.index + 1);
                    } else {
                        lists.delete(queue.podcast.id); // look again: a new episode may be out
                        await player.playRandom(queue.podcast);
                    }
                } catch (err) {
                    player.queue = null;
                    if (club.showErrorMessage) club.showErrorMessage('The episode finished and the next one could not start. Open the music menu to pick another.');
                } finally {
                    advancing = false;
                }
            }
        };
        return player;
    }
};

if (typeof window !== 'undefined') window.Podcasts = Podcasts;
