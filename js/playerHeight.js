'use strict';
// Player eye height and how far a seated player's view must rise to stand at that eye height.
// Pure maths (no Babylon, no DOM) so it is checked without an engine.
//
// Two ideas, both about the headset's tracked height above the physical floor (the "eye" height):
//
//  * STANDING mode estimates the player's standing eye height from what the headset reports over time. Crouching,
//    leaning and sitting only ever lower it, and a jump raises it briefly, so a high percentile of a long window is
//    the standing height. The avatar is then sized to it, and other guests are told (they see a person your height).
//
//  * SEATED mode keeps the avatar standing while the player sits. It measures the seated head height once and lifts
//    the view by the difference to the standing eye height, so the eyes are where a standing person's would be.
//
// Neither estimator measures crown-to-floor stature or corrects a headset's incorrectly configured physical floor.

const PlayerHeight = (() => {
    /** Eye height of the default 1.7 m body, and the plausible range of a real player's standing eye height (m). */
    const DEFAULT_EYE = 1.7;
    const MIN_EYE = 1.1;
    const MAX_EYE = 2.1;
    /**
     * An automatic estimate below this is taken for sitting (or a headset resting low) and ignored, so a player who
     * sits without Seated mode keeps the standard body instead of shrinking everyone's view of them. The explicit
     * MEASURE HEIGHT button accepts anything down to MIN_EYE.
     */
    const AUTO_MIN_EYE = 1.35;
    /** The eyes sit about 6.4% of a person's height below the crown. */
    const EYE_TO_BODY = 0.936;

    const clampEye = value => Math.min(MAX_EYE, Math.max(MIN_EYE, value));
    /** Standing body height for a standing eye height. */
    const bodyHeightFor = eye => eye / EYE_TO_BODY;

    const percentile = (sorted, p) => {
        if (!sorted.length) return NaN;
        const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
        return sorted[index];
    };

    /**
     * Standing eye height from a stream of headset heights. A sample every SAMPLE_GAP seconds goes into a window of
     * WINDOW seconds; the estimate is the 80th percentile once there are enough samples (a few seconds), so ordinary
     * crouching, stooping or a seated stretch does not drag it down and one jump does not push it up.
     */
    class HeightEstimator {
        constructor({ window = 90, gap = 0.2, minSamples = 15, quantile = 0.8 } = {}) {
            this.window = window;
            this.gap = gap;
            this.minSamples = minSamples;
            this.quantile = quantile;
            this.reset();
        }

        reset() {
            this.samples = [];
            this._lastAt = -Infinity;
        }

        /** @param {number} height tracked eye height (m) @param {number} now seconds, any monotonic clock */
        add(height, now) {
            if (!Number.isFinite(height) || !Number.isFinite(now) || height < MIN_EYE || height > MAX_EYE + 0.4) return;
            if (now - this._lastAt < this.gap) return;
            this._lastAt = now;
            this.samples.push({ height, at: now });
            const oldest = now - this.window;
            while (this.samples.length && this.samples[0].at < oldest) this.samples.shift();
        }

        /** The standing eye height, or null until there is enough to say. */
        estimate() {
            if (this.samples.length < this.minSamples) return null;
            const sorted = this.samples.map(s => s.height).sort((a, b) => a - b);
            return clampEye(percentile(sorted, this.quantile));
        }
    }

    /** The median of some heights, or null when there are none. */
    const median = values => {
        const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
        return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    };

    /**
     * How far to raise a seated player's view so their eyes are at `standEye`: the gap between the two, never negative
     * (somebody already as high is left alone) and never more than a metre (a headset on the floor is not a seat).
     */
    const seatedLift = (seatedEye, standEye = DEFAULT_EYE) => {
        if (!Number.isFinite(seatedEye) || !Number.isFinite(standEye)) return 0;
        return Math.min(1, Math.max(0, standEye - seatedEye));
    };

    /** Ease `current` toward `target` at most `rate` m/s over `dt` seconds, so a lift never lurches the view. */
    const easeLift = (current, target, dt, rate = 0.8) => {
        const step = rate * Math.min(0.1, Math.max(0, dt));
        return current + Math.max(-step, Math.min(step, target - current));
    };

    /**
     * The seated-mode lift over time. It follows a slow average of the real head height (a couple of seconds), so
     * sitting still gives a steady view, standing up lets the lift fall away by itself, and a lean or a nod never
     * moves it; a change under DEADBAND is ignored and the lift itself moves at most `rate` m/s. `snap` (sitting on a
     * piece of the club's furniture, which has its own seated pose) drops it to zero at once.
     */
    class SeatedLift {
        constructor({ smooth = 2, rate = 0.5, deadband = 0.04 } = {}) {
            this.smooth = smooth;
            this.rate = rate;
            this.deadband = deadband;
            this.reset();
        }

        reset() {
            this.real = null;
            this.target = 0;
            this.lift = 0;
        }

        /** @returns {number} the lift to add to the tracked head height this frame */
        update(real, dt, enabled, standEye = DEFAULT_EYE, snap = false) {
            if (snap) { this.real = null; this.target = 0; this.lift = 0; return 0; }
            if (!Number.isFinite(real)) return this.lift;
            const step = Math.min(0.1, Math.max(0, dt));
            this.real = this.real === null ? real : this.real + (real - this.real) * (1 - Math.exp(-step / this.smooth));
            const wanted = enabled ? seatedLift(this.real, standEye) : 0;
            // Under the deadband there is nothing to lift (a standing player in Seated mode), and a change that small is
            // noise; once the lift has arrived, it still trims the last centimetres so a sitter ends at the true height.
            const settled = Math.abs(this.lift - this.target) < 0.002;
            if (wanted < this.deadband) this.target = 0;
            else if (Math.abs(wanted - this.target) >= (settled ? 0.012 : this.deadband)) this.target = wanted;
            this.lift = easeLift(this.lift, this.target, step, this.rate);
            return this.lift;
        }
    }

    return { DEFAULT_EYE, MIN_EYE, MAX_EYE, AUTO_MIN_EYE, EYE_TO_BODY, clampEye, bodyHeightFor, HeightEstimator, SeatedLift, median, seatedLift, easeLift };
})();

window.PlayerHeight = PlayerHeight;
