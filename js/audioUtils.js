// Pure audio URL policy shared by UI and playback code.
// Kept free of DOM/Babylon dependencies so the security boundary is runtime-testable.

const AudioUtils = Object.freeze({
    isSafeAudioUrl(url, pageHref) {
        if (typeof url !== 'string' || !url.trim()) return false;
        try {
            const base = pageHref || (typeof window !== 'undefined' ? window.location.href : 'https://localhost/');
            const parsed = new URL(url, base);
            if (parsed.username || parsed.password) return false;
            if (parsed.protocol === 'blob:' || parsed.protocol === 'https:') return true;
            if (parsed.protocol !== 'http:') return false;

            const page = new URL(base);
            const host = parsed.hostname;
            const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
            return page.protocol !== 'https:' || isLoopback;
        } catch (_) {
            return false;
        }
    }
});

if (typeof window !== 'undefined') window.AudioUtils = AudioUtils;
if (typeof module !== 'undefined' && module.exports) module.exports = AudioUtils;
