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

    return { Recorder, percentile, CAPACITY };
})();

window.FrameStats = FrameStats;
