'use strict';
// Pure audio URL policy shared by UI and playback code.
// Kept free of DOM/Babylon dependencies so the security boundary is runtime-testable.
//
// SCOPE: this is a SCHEME and MIXED-CONTENT policy. It deliberately says nothing
// about whether the stream will send Access-Control-Allow-Origin - which is this
// project's actual recurring audio failure (a CORS-less stream yields an all-zero
// analyser). getAudioData() detects that separately.

/** Refuse absurd input before handing it to the URL parser (synchronous O(n) work
 *  on the UI thread, reachable straight from a paste into a text input). */
const MAX_AUDIO_URL_LENGTH = 2048;

/** Decode the XML entities an RSS text node can carry. */
function decodeXmlText(text) {
    return text
        .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

const AudioUtils = Object.freeze({
    /**
     * Babylon, and this scene, are LEFT-handed; Web Audio is RIGHT-handed. Handing Babylon
     * coordinates straight to a PannerNode or the AudioListener mirrors the whole room: the
     * left PA is heard in the right ear, and turning your head right moves the stage to your
     * right ear. Reflecting X converts positions and direction vectors consistently, so every
     * Web Audio coordinate must go through this (or the setters below).
     */
    audioX(x) { return -x; },

    /** Places a PannerNode at a Babylon-space point. */
    setPannerPosition(panner, x, y, z) {
        if (panner.positionX) {
            panner.positionX.value = -x;
            panner.positionY.value = y;
            panner.positionZ.value = z;
        } else if (panner.setPosition) {
            panner.setPosition(-x, y, z);
        }
    },

    /** Aims a PannerNode along a Babylon-space direction. */
    setPannerOrientation(panner, x, y, z) {
        if (panner.orientationX) {
            panner.orientationX.value = -x;
            panner.orientationY.value = y;
            panner.orientationZ.value = z;
        } else if (panner.setOrientation) {
            panner.setOrientation(-x, y, z);
        }
    },

    /**
     * Every playable episode of an RSS podcast feed, newest first: each <item> with an https
     * audio enclosure. Regex, not DOMParser, on purpose: callers fetch only the head of the
     * feed (a byte range), which is not well-formed XML; an item cut off by the range has no
     * closing tag and is simply not listed. Duplicate URLs are listed once.
     * @returns {Array<{ title: string, url: string }>}
     */
    parsePodcastEpisodes(xmlText) {
        const episodes = [];
        if (typeof xmlText !== 'string') return episodes;
        const seen = new Set();
        for (const [, item] of xmlText.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
            const enclosure = /<enclosure\b[^>]*>/.exec(item);
            const url = enclosure && /\burl\s*=\s*["']([^"']+)["']/.exec(enclosure[0]);
            const type = enclosure && /\btype\s*=\s*["']([^"']+)["']/.exec(enclosure[0]);
            if (!url || (type && !type[1].startsWith('audio/'))) continue;
            const href = decodeXmlText(url[1]);
            if (!/^https:\/\//i.test(href) || !AudioUtils.isSafeAudioUrl(href) || seen.has(href)) continue;
            seen.add(href);
            const title = /<title>([\s\S]*?)<\/title>/.exec(item);
            episodes.push({ title: title ? decodeXmlText(title[1]) : 'Episode', url: href });
        }
        return episodes;
    },

    /**
     * Newest episode of an RSS podcast feed.
     * @returns {{ title: string, url: string } | null}
     */
    parseLatestPodcastEpisode(xmlText) {
        return AudioUtils.parsePodcastEpisodes(xmlText)[0] || null;
    },

    /**
     * Music on entry is ON unless the guest has explicitly turned it off (stored '0'). It
     * is the product default; the splash names the servers contacted and keeps the opt-out.
     */
    shouldPlayOnEntry(stored) {
        return stored !== '0';
    },

    /**
     * Resident episodes live on Podbean. They are resolved fresh from the feed each time, so
     * one is never remembered as "the last stream": that would pin the default to an old episode.
     */
    isResidentEpisodeUrl(url) {
        try {
            const host = new URL(url).hostname;
            return host === 'podbean.com' || host.endsWith('.podbean.com')
                // Colourizon episodes come through the relay: `<relay>/podcast/colourizon/stream/...`.
                || new URL(url).pathname.startsWith('/podcast/colourizon/stream/');
        } catch (_) {
            return false;
        }
    },

    /** `3725` -> `1:02:05`, `65` -> `1:05`; anything not a finite non-negative number reads `0:00`. */
    formatClock(seconds) {
        const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        const pad = n => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    },

    isSafeAudioUrl(url, pageHref) {
        if (typeof url !== 'string' || !url.trim()) return false;
        if (url.length > MAX_AUDIO_URL_LENGTH) return false;
        try {
            const base = pageHref || (typeof window !== 'undefined' ? window.location.href : 'https://localhost/');
            const parsed = new URL(url, base);
            if (parsed.username || parsed.password) return false;
            // blob: URLs are origin-bound and unforgeable - this is what makes local
            // file drag-and-drop work. Do not remove it as "hardening".
            if (parsed.protocol === 'blob:' || parsed.protocol === 'https:') return true;
            if (parsed.protocol !== 'http:') return false;

            const page = new URL(base);
            const host = parsed.hostname;
            // Whole 127.0.0.0/8, the RFC 6761 *.localhost special-use TLD, and the
            // IPv6 literal (URL.hostname keeps the brackets).
            const isLoopback = host === 'localhost'
                || host.endsWith('.localhost')
                || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
                || host === '[::1]';
            return page.protocol !== 'https:' || isLoopback;
        } catch (_) {
            return false;
        }
    }
});

if (typeof window !== 'undefined') window.AudioUtils = AudioUtils;
