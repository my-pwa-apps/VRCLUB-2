'use strict';
// Frame-time statistics: the distribution of frame intervals and of the CPU time the application spends per frame.
// Pure (no Babylon, no DOM) so it is unit-tested. It measures what a browser can honestly measure:
//  - `frame`:  the wall-clock interval between two render-loop calls (what the player experiences, including GPU waits);
//  - `update`: CPU time in updateAnimations() (the club's own simulation);
//  - `submit`: CPU time in scene.render() (draw-call submission and per-frame scene work).
// None of these is GPU time. A GPU-bound frame shows up as a long `frame` with a short `update` + `submit`.

const FrameStats = (() => {
    const CAPACITY = 720;   // 10 s at 72 Hz, 12 s at 60 Hz

    const percentile = (sorted, p) => {
        if (!sorted.length) return null;
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
    };
    const round = value => (value === null ? null : Math.round(value * 100) / 100);

    class Recorder {
        /** @param {number} capacity frames kept  @param {number} stallMs an interval longer than this is a stall, not a frame */
        constructor(capacity = CAPACITY, stallMs = 250) {
            this.capacity = capacity;
            this.stallMs = stallMs;
            this.frame = new Float32Array(capacity);
            this.update = new Float32Array(capacity);
            this.submit = new Float32Array(capacity);
            this.reset();
        }

        reset() {
            this.count = 0;
            this.next = 0;
            this.total = 0;
            this._last = null;
        }

        /**
         * Record one frame. `now` is the render-loop time stamp; the frame interval is its difference to the previous
         * call. A gap over `stallMs` (250 ms by default: a hidden tab, a long stall, an XR transition) is counted as a stall,
         * not a frame.
         */
        add(now, updateMs, submitMs) {
            if (!Number.isFinite(now)) return;
            const last = this._last;
            this._last = now;
            if (last === null) return;
            const interval = now - last;
            if (!(interval > 0)) return;
            if (interval > this.stallMs) { this.stalls = (this.stalls || 0) + 1; return; }
            const i = this.next;
            this.frame[i] = interval;
            this.update[i] = Number.isFinite(updateMs) ? updateMs : 0;
            this.submit[i] = Number.isFinite(submitMs) ? submitMs : 0;
            this.next = (i + 1) % this.capacity;
            if (this.count < this.capacity) this.count++;
            this.total++;
        }

        /**
         * @param {number} budgetMs the frame budget to judge against (13.89 at 72 Hz, 11.11 at 90 Hz, 16.67 at 60 Hz)
         */
        summary(budgetMs = 1000 / 72) {
            const n = this.count;
            if (!n) return { frames: 0, budgetMs: round(budgetMs) };
            const frames = Array.from(this.frame.subarray(0, n)).sort((a, b) => a - b);
            const mean = array => { let sum = 0; for (let i = 0; i < n; i++) sum += array[i]; return sum / n; };
            let over = 0, severe = 0;
            for (let i = 0; i < n; i++) {
                if (this.frame[i] > budgetMs * 1.25) over++;
                if (this.frame[i] > budgetMs * 2.2) severe++;
            }
            const meanFrame = mean(this.frame);
            return {
                frames: n,
                budgetMs: round(budgetMs),
                meanFrameMs: round(meanFrame),
                fps: round(1000 / meanFrame),
                p50: round(percentile(frames, 0.5)),
                p95: round(percentile(frames, 0.95)),
                p99: round(percentile(frames, 0.99)),
                maxFrameMs: round(frames[n - 1]),
                // A frame that took 25% longer than the budget (a visible judder) and one that took over twice (a missed frame).
                overBudgetShare: round(over / n),
                missedShare: round(severe / n),
                updateMeanMs: round(mean(this.update)),
                submitMeanMs: round(mean(this.submit)),
                stalls: this.stalls || 0
            };
        }
    }

    /**
     * Opt-in automatic quality: steps the graphics tier DOWN when frames keep missing the budget. It never steps up
     * (a tier change rebuilds pipelines and recompiles materials, a hitch worth paying only to recover, and a climb back
     * would oscillate with the load that forced the drop); the player raises it by hand. Pure decision logic.
     *
     * Hysteresis: a window counts as struggling when a quarter of its frames ran 25% over budget (or p95 is over 1.5x);
     * it takes `streak` struggling evaluations in a row (15 s at the defaults) to act, never within `holdSeconds` of the
     * last change or of `pause()` (start-up, entering VR), and a healthy window resets the streak.
     */
    class AdaptiveQuality {
        constructor({ evalSeconds = 5, streak = 3, holdSeconds = 45, minFrames = 60, tiers = ['balanced', 'high', 'ultra'] } = {}) {
            this.evalSeconds = evalSeconds;
            this.streak = streak;
            this.holdSeconds = holdSeconds;
            this.minFrames = minFrames;
            this.tiers = tiers;
            this.reset(0);
        }

        /** Forget history and stay quiet until `now + seconds` (a mode change makes the previous window meaningless). */
        reset(now, seconds = 0) {
            this.struggling = 0;
            this.nextEval = now + Math.max(this.evalSeconds, seconds);
            this.quietUntil = now + seconds;
        }

        pause(now, seconds = 20) { this.reset(now, seconds); }

        /**
         * @param {object} summary a Recorder summary for the window
         * @param {number} now seconds
         * @param {string} tier the active tier
         * @returns {null|{tier:string, reason:string}} a tier to switch to, or null
         */
        evaluate(summary, now, tier) {
            if (now < this.nextEval) return null;
            this.nextEval = now + this.evalSeconds;
            if (now < this.quietUntil || !summary || !(summary.frames >= this.minFrames)) return null;
            const struggling = summary.overBudgetShare >= 0.25 || summary.p95 > summary.budgetMs * 1.5;
            this.struggling = struggling ? this.struggling + 1 : 0;
            const index = this.tiers.indexOf(tier);
            if (this.struggling < this.streak || index <= 0) return null;
            this.reset(now, this.holdSeconds);
            return {
                tier: this.tiers[index - 1],
                reason: `${Math.round(summary.overBudgetShare * 100)}% of frames over the ${summary.budgetMs} ms budget (p95 ${summary.p95} ms)`
            };
        }
    }

    return { Recorder, AdaptiveQuality, percentile, CAPACITY };
})();

window.FrameStats = FrameStats;
