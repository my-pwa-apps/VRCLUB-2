'use strict';

/**
 * The NOCTURNE wordmark — the club's own logotype, as geometry rather than as a font.
 *
 * The letterforms are NOT a typeface: the O is a ring cut at nine and three o'clock, the R has
 * no left stem (a top bar runs into a bowl on the right, back along an inset middle bar, then a
 * diagonal leg), and the E is three detached bars. No installed font draws those, and a headset
 * has no web fonts to fall back on, so the word is authored here as neon tubing: centrelines of
 * a constant-width tube, traced from the reference artwork.
 *
 * ONE definition feeds every surface:
 *   - the splash screen, as the `d` of an inline <svg> in index.html (static so the logo is in
 *     the very first paint; a unit test fails if it drifts from `NocturneLogo.path()`),
 *   - the neon over the dance floor and the sign over the street entrance, through a Path2D in
 *     `_drawNocturneNeon()` (js/club/04-environment.js).
 *
 * Coordinates: the cap height is 100 units, y = 0 is the cap line and y = 100 the baseline, so
 * a glyph's ink is its centreline path grown by STROKE / 2. The round O deliberately overshoots
 * both lines, exactly as the reference does. Every tube end is a flat (butt) cut.
 */
const NOCTURNE_CAP = 100;
const NOCTURNE_STROKE = 8.8;

/** Path data must be byte-identical between this file and index.html, so no float noise. */
const n = (v) => String(Math.round(v * 100) / 100);

/**
 * One N: two full-height stems and a diagonal drawn as a single mitred stroke, so the tube
 * comes to a sharp point at the top left and the bottom right instead of crossing the stems.
 */
const nocturneN = (x) => `M${n(x + 4.4)} 100V0L${n(x + 85.3)} 100V0`;

/**
 * The word, in order. `x` is the left edge of the glyph's ink (the reference's own tracking,
 * measured letter by letter), `w` its ink width, and `d(x)` its centrelines as SVG path data.
 */
const NOCTURNE_GLYPHS = [
    { ch: 'N', x: 0, w: 89.7, d: nocturneN },
    // A ring cut through at nine and three o'clock: an upper and a lower half, each flat-ended.
    {
        ch: 'O', x: 134.3, w: 111.8,
        d: x => `M${n(x + 4.5)} 48A51.5 48.6 0 0 1 ${n(x + 107.3)} 48M${n(x + 4.5)} 54A51.5 48.6 0 0 0 ${n(x + 107.3)} 54`
    },
    // A half ring opening to the right, closed off by two horizontal terminals.
    {
        ch: 'C', x: 283.3, w: 76.5,
        d: x => `M${n(x + 72.1)} 4.4H${n(x + 50)}A45.6 45.6 0 0 0 ${n(x + 50)} 95.6H${n(x + 72.1)}`
    },
    { ch: 'T', x: 405.9, w: 86.3, d: x => `M${n(x)} 4.4H${n(x + 86.3)}M${n(x + 43.15)} 0V100` },
    { ch: 'U', x: 536.3, w: 91.2, d: x => `M${n(x + 4.4)} 0V54.4A41.2 41.2 0 0 0 ${n(x + 86.8)} 54.4V0` },
    // No left stem: the top bar runs into the bowl, the bowl returns along a middle bar that is
    // inset from the left, and the leg falls away from it to the baseline.
    {
        ch: 'R', x: 677.5, w: 78.4,
        d: x => `M${n(x)} 4.4H${n(x + 49.5)}A20.6 23.05 0 0 1 ${n(x + 49.5)} 50.5H${n(x + 16.7)}`
            + `M${n(x + 27.9)} 50.5L${n(x + 71.9)} 100`
    },
    { ch: 'N', x: 802.9, w: 89.7, d: nocturneN },
    // Three detached bars, the middle one shorter. There is no vertical stem at all.
    {
        ch: 'E', x: 943.1, w: 73.5,
        d: x => `M${n(x)} 4.4H${n(x + 73.5)}M${n(x)} 50.5H${n(x + 61.8)}M${n(x)} 95.6H${n(x + 73.5)}`
    }
];

const NOCTURNE_WIDTH = NOCTURNE_GLYPHS.at(-1).x + NOCTURNE_GLYPHS.at(-1).w;

const NocturneLogo = {
    CAP: NOCTURNE_CAP,
    STROKE: NOCTURNE_STROKE,
    /** Ink width and height of the word, before the tube's own half-width is added. */
    WIDTH: NOCTURNE_WIDTH,
    HEIGHT: NOCTURNE_CAP,
    /** Room for the tube, the O's overshoot and the N's pointed corners. */
    VIEW_BOX: `-6 -9 ${NOCTURNE_WIDTH + 12} ${NOCTURNE_CAP + 18}`,
    GLYPHS: NOCTURNE_GLYPHS,
    /** The whole word as one SVG path: tube centrelines, ready for Path2D or an <svg>. */
    path() {
        return NOCTURNE_GLYPHS.map(g => g.d(g.x)).join('');
    }
};

window.NocturneLogo = NocturneLogo;
