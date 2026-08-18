/**
 * VJDirector — beat-locked, palette-aware "VJ brain" that conducts the
 * existing lighting rig the way a touring VJ would conduct a real console.
 *
 * Design intent:
 *   - DO NOT add new GPU lights. Quest already runs near the PBR uniform-buffer
 *     ceiling; this module only writes to existing state vars (spotColorIndex,
 *     spotlightPattern, vjDropActive, etc.) so the existing render code keeps
 *     working without per-frame allocations.
 *   - Replace fragile `bass > 0.3` threshold with **spectral-flux onset
 *     detection** (the technique used by Mixxx / aubio). This gives clean kick
 *     tracking on real EDM sets instead of false-positive thumps.
 *   - Auto-detect BPM from onset history. Expose **TAP TEMPO** for the user.
 *   - Maintain a **master palette** in HSV space so the whole rig moves through
 *     coherent color shifts (analogous → split-complementary → triad) instead
 *     of each fixture cycling independently.
 *   - Provide the macros every VJ has on their console:
 *         masterIntensity   — one fader for the whole rig
 *         DROP              — slam to peak look on the next beat
 *         BLACKOUT          — kill everything for one bar (drama before drop)
 *         LOCK              — snap all moving heads to the dance floor center
 *         PANIC / SAFE      — blackout + safe-mode (re-uses existing safety)
 *   - A **beat envelope** (0..1, decays after each onset) is exposed on the
 *     VRClub instance so spotlights / strobes / LED wall can multiply their
 *     intensity by `(1 - punch) + punch * env` for the kick punch on each hit.
 *
 * The director runs ONCE per frame from updateAnimations(), AFTER getAudioData.
 * It writes:
 *   - club.beatEnvelope        (0..1)        consumed by render code
 *   - club.masterIntensity     (0..1)        consumed by render code
 *   - club.barPhase            (0..1)        within current bar
 *   - club.spotColorIndex      (existing)    advanced on phrase boundary
 *   - club.currentSpotColor    (existing)    written from master palette
 *   - club.currentColorIndex   (existing)    laser color advanced on phrase
 *   - club.mirrorBallColorIndex(existing)    advanced on long phrase
 *   - club.spotlightPattern    (existing)    set per scene (chase pattern)
 *   - club.vjDropActive        (existing)    raised during DROP scene
 *   - club.vjBuildIntensity    (existing)    raised during BUILD scene
 *   - club.vjBPM               (existing)    auto-tracked
 *
 * Subsystems do NOT need to know the director exists.
 */
class VJDirector {
    constructor(club) {
        this.club = club;

        // === BEAT TRACKING (spectral flux onset detection) ===
        this.bpm = club.vjBPM || 128;
        this.lastBeatAt = performance.now();
        this.beatEnvelope = 0;          // 0..1 decay envelope after onset
        this.barPhase = 0;              // 0..1 within current bar
        this.beatNumber = 0;            // Monotonic beat counter (drives phrase boundaries)

        // Spectral flux state
        this._lastBassMag = 0;
        this._lastMidMag = 0;
        this._fluxHistory = [];         // Recent positive flux for adaptive threshold
        this._fluxHistorySize = 43;     // ~700 ms @ 60 fps ≈ rolling threshold window
        this._refractoryUntil = 0;      // After an onset, ignore for ~120 ms

        // BPM autodetect — accumulate inter-onset intervals
        this._iois = [];                // ms intervals between consecutive onsets
        this._lastOnsetForIoi = 0;
        this._maxIois = 24;             // ~10 s of recent kicks at 140 BPM

        // Tap tempo
        this._taps = [];                // recent tap timestamps

        // === MACROS ===
        this.masterIntensity = 1.0;
        this.targetMasterIntensity = 1.0;
        this.blackoutUntil = 0;         // ms timestamp; while > now → masterIntensity hard-zero
        this.manualSceneUntil = 0;      // While > now, auto-scene picker is suppressed

        // === MASTER PALETTE (HSV-based, evolves per phrase) ===
        // The whole rig pulls colors from here. We re-evaluate every 16 beats
        // (one phrase). Three palette modes correspond to common VJ moves:
        //   analogous     — chill / groove (hues within 60°)
        //   complementary — peak / drop  (hue + 180°)
        //   triad         — euphoric     (hue + 120° + 240°)
        this.masterHue = 0.0;             // 0..1
        this.paletteMode = 'analogous';
        this.lastPhraseBeat = 0;

        // Reusable Color3 buffers so we never allocate per frame
        this._tmpColorA = new BABYLON.Color3(1, 0, 0);
        this._tmpColorB = new BABYLON.Color3(0, 1, 0);
        this._tmpColorC = new BABYLON.Color3(0, 0, 1);

        // === SCENE ENGINE ===
        // Higher-level than the existing 12-phase cycle. Maps perceived audio
        // energy to a coordinated lighting LOOK. The director then writes
        // existing state vars (spotlightPattern, vjDropActive, etc.) to realise
        // the look. Subsystems remain ignorant.
        this.scene = 'groove';
        this._sceneStartBeat = 0;
        this._energyEMA = 0;            // Exponentially-smoothed average energy

        // === CHASE PATTERNS (mapped to existing spotlightPattern int) ===
        // The existing render code treats spotlightPattern 0..3 as look IDs;
        // we reuse those slots:
        //   0 = WAVE      (auto-cycle, default)
        //   1 = LOCK      (all heads point straight down at floor center)
        //   2 = PINWHEEL  (mirror-sweep — already implemented as "mirror")
        //   3 = BUTTERFLY (crossed beams — already "crossed beams")
        // Director picks one based on scene + bar phase.

        // Init defaults
        if (this.club.masterIntensity === undefined) this.club.masterIntensity = 1.0;
        if (this.club.beatEnvelope === undefined) this.club.beatEnvelope = 0;
        if (this.club.barPhase === undefined) this.club.barPhase = 0;

        if (typeof log !== 'undefined') {
            log.info('🎚️ VJ Director online — beat-locked palette + macros');
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC: per-frame update. Call from updateAnimations() AFTER getAudioData.
    // -------------------------------------------------------------------------
    update(timeSec, audioData) {
        const now = performance.now();

        // 1. Onset detection on the bass + low-mid bands (kicks live there).
        if (audioData && audioData.hasAudio) {
            this._detectOnset(audioData, now);
        } else {
            // No audio: gentle pulse on a fixed BPM clock so the lights still
            // move (otherwise the room feels frozen between songs).
            const beatDur = 60000 / this.bpm;
            if (now - this.lastBeatAt >= beatDur) {
                this._registerBeat(now, /*synthetic*/true);
            }
        }

        // 2. Decay beat envelope (kick punch). ~120 ms half-life.
        this.beatEnvelope = Math.max(0, this.beatEnvelope - 0.06);

        // 3. Phase tracking (within bar, within phrase)
        const beatDur = 60000 / this.bpm;
        const sinceBeat = now - this.lastBeatAt;
        const beatFraction = Math.min(1, sinceBeat / beatDur);
        this.barPhase = ((this.beatNumber % 4) + beatFraction) / 4;

        // 4. Master intensity smoothing + blackout enforcement
        if (now < this.blackoutUntil) {
            this.masterIntensity = 0;
        } else {
            // Lerp toward target (~150 ms time constant)
            this.masterIntensity += (this.targetMasterIntensity - this.masterIntensity) * 0.12;
        }

        // 5. Auto-scene selection (suppressed during manual macros, and whenever
        //    the Show Director is driving — it composes looks on musical
        //    boundaries, whereas this picker fires the moment an energy threshold
        //    is crossed. Two writers is what produced the incoherent show. Beat
        //    tracking, BPM and the palette engine below all keep running; only
        //    the LOOK decision is handed over.)
        const showDriving = !!(this.club.showDirector && this.club.showDirector.isDriving());
        if (now > this.manualSceneUntil && !showDriving) {
            this._updateAutoScene(audioData);
        }

        // 6. Apply master palette (writes to existing color state vars on phrase boundary)
        this._applyPalette();

        // 7. Publish to VRClub instance for consumption by render code
        this.club.beatEnvelope = this.beatEnvelope;
        this.club.masterIntensity = this.masterIntensity;
        this.club.barPhase = this.barPhase;
        this.club.vjBPM = this.bpm;
    }

    // -------------------------------------------------------------------------
    // ONSET DETECTION — spectral flux on the bass band.
    //
    // Real DJs would scoff at `bass > 0.3` triggering on every hi-hat shimmer.
    // Spectral flux measures the FRAME-TO-FRAME INCREASE in band magnitude;
    // an onset is a sudden jump above an adaptive threshold derived from
    // recent flux history (median × multiplier). This is the same technique
    // used by aubio/Mixxx for kick detection.
    // -------------------------------------------------------------------------
    _detectOnset(audioData, now) {
        // Use bass band primarily; weight low-mid as a secondary cue so
        // snares on 2/4 still register if the kick is sidechained.
        const bass = audioData.bass || 0;
        const mid = audioData.mid || 0;

        // Half-wave rectified spectral flux (only positive changes count)
        const bassFlux = Math.max(0, bass - this._lastBassMag);
        const midFlux  = Math.max(0, mid  - this._lastMidMag);
        const flux = bassFlux * 0.85 + midFlux * 0.15;

        this._lastBassMag = bass;
        this._lastMidMag = mid;

        // Maintain rolling history for adaptive threshold
        this._fluxHistory.push(flux);
        if (this._fluxHistory.length > this._fluxHistorySize) {
            this._fluxHistory.shift();
        }

        // Need a warm-up period before threshold is meaningful
        if (this._fluxHistory.length < 12) return;
        if (now < this._refractoryUntil) return;

        // Adaptive threshold: median × 2.4 plus a small absolute floor.
        // Median is robust to occasional spikes (better than mean).
        const sorted = this._fluxHistory.slice().sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const threshold = Math.max(0.04, median * 2.4);

        if (flux > threshold && bass > 0.25) {
            this._registerBeat(now, /*synthetic*/false);
            // Refractory: real kicks are at least ~150 ms apart even at 200 BPM
            this._refractoryUntil = now + 140;
        }
    }

    _registerBeat(now, synthetic) {
        this.lastBeatAt = now;
        this.beatNumber++;

        // Punch the envelope (synthetic beats hit lighter)
        this.beatEnvelope = synthetic ? 0.35 : 1.0;

        // Update BPM estimate from real onsets only
        if (!synthetic && this._lastOnsetForIoi > 0) {
            const ioi = now - this._lastOnsetForIoi;
            // Reject IOIs that are clearly not a single beat. We accept the
            // range that maps to BPM 70..200; halve/double obvious harmonics.
            if (ioi >= 200 && ioi <= 1200) {
                let normalised = ioi;
                // Snap obvious half/double-time
                if (ioi > 800) normalised = ioi / 2;
                if (ioi < 280) normalised = ioi * 2;
                this._iois.push(normalised);
                if (this._iois.length > this._maxIois) this._iois.shift();
                this._recomputeBPM();
            }
        }
        if (!synthetic) this._lastOnsetForIoi = now;
    }

    _recomputeBPM() {
        if (this._iois.length < 4) return;
        // Median IOI → BPM. Median is robust to misfires.
        const sorted = this._iois.slice().sort((a, b) => a - b);
        const medianIoi = sorted[Math.floor(sorted.length / 2)];
        const newBpm = 60000 / medianIoi;
        if (newBpm >= 70 && newBpm <= 200) {
            // Smooth toward new estimate so the bar phase doesn't snap
            this.bpm += (newBpm - this.bpm) * 0.25;
        }
    }

    // -------------------------------------------------------------------------
    // SCENE ENGINE — picks a coordinated look based on perceived energy.
    // -------------------------------------------------------------------------
    _updateAutoScene(audioData) {
        // Smoothed energy envelope (long time constant — scenes should not flicker)
        const inst = audioData ? (audioData.bass * 0.6 + audioData.mid * 0.3 + audioData.treble * 0.1) : 0;
        this._energyEMA += (inst - this._energyEMA) * 0.02;

        // Don't change scene more often than every 8 beats (avoid epileptic switching)
        const beatsInScene = this.beatNumber - this._sceneStartBeat;
        if (beatsInScene < 8) return;

        let nextScene = this.scene;

        if (this._energyEMA < 0.10) {
            nextScene = 'breakdown';
        } else if (this._energyEMA < 0.22) {
            nextScene = 'groove';
        } else if (this._energyEMA < 0.35) {
            nextScene = 'build';
        } else {
            nextScene = 'drop';
        }

        if (nextScene !== this.scene) this._enterScene(nextScene);
    }

    _enterScene(name) {
        const club = this.club;
        this.scene = name;
        this._sceneStartBeat = this.beatNumber;

        switch (name) {
            case 'breakdown':
                // Atmospheric: lasers + mirror ball, no strobes, slow chase
                club.lightingPhase = 'breakdown';
                club.vjDropActive = false;
                club.vjBuildIntensity = 0;
                club.spotlightPattern = 1;       // LOCK (heads point down)
                club.lasersActive = true;
                club.strobesActive = false;
                this.paletteMode = 'analogous';
                this.targetMasterIntensity = 0.55;
                break;

            case 'groove':
                // Standard club groove: WAVE chase, lasers off, moderate intensity
                club.lightingPhase = 'groove';
                club.vjDropActive = false;
                club.vjBuildIntensity = 0;
                club.spotlightPattern = 0;       // WAVE (auto-cycle)
                club.strobesActive = false;
                this.paletteMode = 'analogous';
                this.targetMasterIntensity = 0.85;
                break;

            case 'build':
                // Tension building: PINWHEEL chase, lasers on, intensity climbs
                club.lightingPhase = 'build';
                club.vjDropActive = false;
                club.vjBuildIntensity = 0.7;
                club.spotlightPattern = 2;       // PINWHEEL (mirror sweep)
                club.lasersActive = true;
                club.strobesActive = false;
                this.paletteMode = 'complementary';
                this.targetMasterIntensity = 1.0;
                break;

            case 'drop':
                // Peak energy: BUTTERFLY (crossed beams), strobes ON
                // (Safe mode at the strobe render gate will still suppress them.)
                club.lightingPhase = 'drop';
                club.vjDropActive = true;
                club.vjBuildIntensity = 1.0;
                club.spotlightPattern = 3;       // BUTTERFLY (crossed beams)
                club.lasersActive = true;
                club.strobesActive = true;
                this.paletteMode = 'triad';
                this.targetMasterIntensity = 1.0;
                break;
        }

        if (typeof log !== 'undefined') {
            log.info(`🎬 Scene → ${name}  (energy=${this._energyEMA.toFixed(2)}, BPM=${this.bpm.toFixed(0)})`);
        }
    }

    // -------------------------------------------------------------------------
    // MASTER PALETTE — write coherent colors to the existing color state vars
    // on phrase boundaries (every 16 beats).
    // -------------------------------------------------------------------------
    _applyPalette() {
        const phraseLen = 16;
        const beatsSinceLast = this.beatNumber - this.lastPhraseBeat;
        if (beatsSinceLast < phraseLen) return;
        this.lastPhraseBeat = this.beatNumber;

        // Advance the master hue. Golden-angle rotation prevents palette
        // collisions and gives pleasing distribution over time.
        this.masterHue = (this.masterHue + 0.381966) % 1.0;

        const club = this.club;
        const A = this._hsvToColor(this.masterHue, 1.0, 1.0, this._tmpColorA);

        // Spot color: primary palette color
        if (club.spotColorList && club.cachedColors) {
            club.currentSpotColor = A.clone();
            // Try to land on the closest palette index so legacy code that
            // reads spotColorIndex (e.g. for sheet color) still works.
            club.spotColorIndex = this._closestPaletteIndex(A, club.spotColorList);
        }

        // Laser color: complementary or triad partner
        let laserHue;
        if (this.paletteMode === 'complementary') {
            laserHue = (this.masterHue + 0.5) % 1.0;
        } else if (this.paletteMode === 'triad') {
            laserHue = (this.masterHue + 0.333) % 1.0;
        } else {
            laserHue = (this.masterHue + 0.083) % 1.0; // analogous
        }
        // Lasers internally only support red/green/blue indices (0/1/2). Snap.
        if (club.currentColorIndex !== undefined) {
            club.currentColorIndex = this._hueToRGBIndex(laserHue);
        }

        // Mirror ball: rotate one slot per phrase for variety
        if (club.mirrorBallColors && club.mirrorBallColorIndex !== undefined) {
            club.mirrorBallColorIndex = (club.mirrorBallColorIndex + 1) % club.mirrorBallColors.length;
        }
    }

    // HSV → Color3 (in-place into `out` to avoid allocation)
    _hsvToColor(h, s, v, out) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        let r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            default:r = v; g = p; b = q; break;
        }
        out.r = r; out.g = g; out.b = b;
        return out;
    }

    _closestPaletteIndex(target, palette) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < palette.length; i++) {
            const c = palette[i];
            if (!c) continue;
            const dr = c.r - target.r, dg = c.g - target.g, db = c.b - target.b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        return bestIdx;
    }

    _hueToRGBIndex(h) {
        // Lasers cycle 0=red, 1=green, 2=blue
        if (h < 0.166 || h >= 0.833) return 0;          // red zone
        if (h >= 0.166 && h < 0.5)   return 1;          // green zone
        return 2;                                       // blue zone
    }

    // -------------------------------------------------------------------------
    // PUBLIC MACROS — call from UI buttons.
    // -------------------------------------------------------------------------

    /** Slam to DROP scene on the next beat, hold for 16 beats. */
    triggerDrop() {
        const now = performance.now();
        this._enterScene('drop', now);
        // Suppress auto-scene picker for ~6 s so the drop sticks
        this.manualSceneUntil = now + 6000;
    }

    /** Kill all lights for `durationMs` (drama before drop). */
    blackout(durationMs = 800) {
        this.blackoutUntil = performance.now() + durationMs;
    }

    /** Snap moving heads to the dance floor center (LOCK pattern). */
    lockToCenter(durationMs = 4000) {
        this.club.spotlightPattern = 1; // LOCK
        this.manualSceneUntil = performance.now() + durationMs;
    }

    /** Tap-tempo: call once per user tap. */
    tapTempo() {
        const now = performance.now();
        this._taps.push(now);
        // Keep last 6 taps; drop any older than 3 s to allow a fresh start.
        this._taps = this._taps.filter(t => now - t < 3000);
        if (this._taps.length < 2) return null;

        const intervals = [];
        for (let i = 1; i < this._taps.length; i++) {
            intervals.push(this._taps[i] - this._taps[i - 1]);
        }
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const newBpm = 60000 / avg;
        if (newBpm >= 60 && newBpm <= 220) {
            this.bpm = newBpm;
            // Snap the beat grid to the most recent tap
            this.lastBeatAt = now;
            this.beatNumber++;
            if (typeof log !== 'undefined') {
                log.info(`👆 TAP TEMPO → ${this.bpm.toFixed(1)} BPM`);
            }
            return this.bpm;
        }
        return null;
    }

    /** 0..1 master fader. */
    setMasterIntensity(v) {
        this.targetMasterIntensity = Math.max(0, Math.min(1, v));
    }

    /** Manual BPM override (e.g. from a numeric input). */
    setBPM(b) {
        if (b >= 60 && b <= 220) this.bpm = b;
    }

    /** Force a specific scene (UI buttons). Holds for 8 s, then auto resumes. */
    forceScene(name) {
        const now = performance.now();
        this._enterScene(name, now);
        this.manualSceneUntil = now + 8000;
    }
}

// Expose globally — the script tag in index.html loads before club_hyperrealistic.js
window.VJDirector = VJDirector;
