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
     * Newest episode of an RSS podcast feed: the first <item> with an https audio
     * enclosure. Regex, not DOMParser, on purpose: callers fetch only the head of
     * the feed (a byte range), which is not well-formed XML.
     * @returns {{ title: string, url: string } | null}
     */
    parseLatestPodcastEpisode(xmlText) {
        if (typeof xmlText !== 'string') return null;
        for (const [, item] of xmlText.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)) {
            const enclosure = /<enclosure\b[^>]*>/.exec(item);
            const url = enclosure && /\burl\s*=\s*["']([^"']+)["']/.exec(enclosure[0]);
            const type = enclosure && /\btype\s*=\s*["']([^"']+)["']/.exec(enclosure[0]);
            if (!url || (type && !type[1].startsWith('audio/'))) continue;
            const href = decodeXmlText(url[1]);
            if (!/^https:\/\//i.test(href) || !AudioUtils.isSafeAudioUrl(href)) continue;
            const title = /<title>([\s\S]*?)<\/title>/.exec(item);
            return { title: title ? decodeXmlText(title[1]) : 'Latest episode', url: href };
        }
        return null;
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
