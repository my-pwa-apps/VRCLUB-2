'use strict';
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

        // Kick bookkeeping, used by the Show Director to read musical structure.
        // A flywheel (below) keeps the bar grid counting through kick-less passages,
        // so these - not beatNumber - say whether the kick is actually present.
        this.lastRealOnsetAt = performance.now();
        this.onsetStreak = 0;           // Consecutive kicks no more than ~1.5 beats apart
        this.realOnsetCount = 0;        // Monotonic count of detected kicks

        // The rest of the rhythm (everything above the bass: snare, claps, hats, synth stabs and arps). When the kick
        // drops out these say whether the music still has a pulse, and nudge the flywheel's phase. See _detectRhythm.
        this.rhythmPresent = false;
        this.rhythmStrength = 0;        // 0..1, how strongly the band repeats with the beat
        this.rhythmBpm = 0;             // the band's own tempo, used only when no kick has given one
        this.lastRhythmOnsetAt = 0;

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
        this.hueLocked = false;           // A look that owns its colour pins the hue
        // A guest in someone else's room: the host chooses the colour and the scene, this browser only draws them.
        this.remoteDriven = false;
        // How the LED wall's colour relates to the beams. 'match' is the original
        // behaviour (wall = beam colour); see VJDirector.LED_HARMONIES.
        this.ledHarmony = 'match';

        // Reusable Color3 buffers so we never allocate per frame
        this._tmpColorA = new BABYLON.Color3(1, 0, 0);
        this._tmpColorB = new BABYLON.Color3(0, 1, 0);
        this._tmpColorC = new BABYLON.Color3(0, 0, 1);
        this._ledColor = new BABYLON.Color3(1, 0, 0);
        this._ledAccent = new BABYLON.Color3(0, 1, 1);

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
            this._flywheel(now);
        } else {
            // No audio: gentle pulse on a fixed BPM clock so the lights still
            // move (otherwise the room feels frozen between songs).
            const beatDur = 60000 / this.bpm;
            if (now - this.lastBeatAt >= beatDur) {
                this._registerBeat(now, /*synthetic*/true);
            }
        }

        // 2. Decay beat envelope (kick punch). ~120 ms half-life, in real time:
        //    a bare per-frame step decayed twice as fast at 120 Hz as at 60 Hz.
        const dtScale = this.club.dtScale || 1;
        this.beatEnvelope = Math.max(0, this.beatEnvelope - 0.06 * dtScale);

        // 3. Phase tracking (within bar, within phrase)
        const beatDur = 60000 / this.bpm;
        const sinceBeat = now - this.lastBeatAt;
        const beatFraction = Math.min(1, sinceBeat / beatDur);
        this.barPhase = ((this.beatNumber % 4) + beatFraction) / 4;

        // 4. Master intensity smoothing + blackout enforcement
        if (now < this.blackoutUntil) {
            this.masterIntensity = 0;
        } else {
            // Lerp toward target (~150 ms time constant at any refresh rate)
            const follow = 1 - Math.pow(1 - 0.12, dtScale);
            this.masterIntensity += (this.targetMasterIntensity - this.masterIntensity) * follow;
        }

        // 5. Auto-scene selection (suppressed during manual macros, and whenever
        //    the Show Director is driving — it composes looks on musical
        //    boundaries, whereas this picker fires the moment an energy threshold
        //    is crossed. Two writers is what produced the incoherent show. Beat
        //    tracking, BPM and the palette engine below all keep running; only
        //    the LOOK decision is handed over.)
        const showDriving = !!(this.club.showDirector && this.club.showDirector.isDriving());
        if (now > this.manualSceneUntil && !showDriving && !this.remoteDriven) {
            this._updateAutoScene(audioData);
        }

        // 6. Apply master palette (writes to existing color state vars on phrase boundary; held lights keep theirs)
        this._updatePalette(now);

        // 7. Publish to VRClub instance for consumption by render code
        this.club.beatEnvelope = this.beatEnvelope;
        this.club.masterIntensity = this.masterIntensity;
        this.club.barPhase = this.barPhase;
        this.club.vjBPM = this.bpm;
    }

    /**
     * FLYWHEEL. Progressive sets drop the kick for 16-64 bars at a time. Beats came only from detected kicks, so the
     * bar grid stopped dead for the whole breakdown and every cue froze mid-phrase. Once a beat and a half has passed
     * without a kick, keep counting at the tracked BPM (soft pulses); the next real kick re-syncs the phase, and in
     * between the rest of the rhythm nudges it (_nudgeFlywheel).
     *
     * Each synthetic beat lands exactly one beat after the last, not on the frame that noticed it was due: stamping it
     * with the frame time made every beat up to a frame late, which over a long breakdown walked the grid off the music
     * by itself (about 8 ms a beat at 60 fps, more at lower rates: half a beat in 30 s at 30 fps).
     */
    _flywheel(now) {
        const beat = 60000 / this.bpm;
        if (now - this.lastRealOnsetAt <= beat * 1.5 || now - this.lastBeatAt < beat) return;
        const due = this.lastBeatAt + beat;
        this._registerBeat(now - due < beat ? due : now, /*synthetic*/true);
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
        // The dedicated kick band, when the audio graph provides it (see VRClub._readKickBand): every step of audio
        // since the last frame, each at the time it played, so the detector runs at the same rate at any frame rate.
        const steps = audioData.kickSteps;
        if (typeof audioData.low === 'number' && steps) {
            for (let i = 0; i < steps.count; i++) {
                this._detectKick(steps.lows[i], steps.raws[i], steps.times[i]);
                this._pushKickEnvelope();
                if (steps.rhythm) this._detectRhythm(steps.rhythm[i], steps.times[i]);
            }
            return;
        }
        if (typeof audioData.low === 'number') { this._detectKick(audioData.low, audioData.lowRms || 0, now); return; }

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
        // Median is robust to occasional spikes (better than mean). Sorted in a
        // reused scratch array: this runs every audio frame.
        const sorted = this._fluxSorted || (this._fluxSorted = []);
        sorted.length = 0;
        for (let i = 0; i < this._fluxHistory.length; i++) sorted.push(this._fluxHistory[i]);
        sorted.sort(VJDirector._ascending);
        const median = sorted[Math.floor(sorted.length / 2)];
        const threshold = Math.max(0.04, median * 2.4);

        if (flux > threshold && bass > 0.25) {
            this._registerBeat(now, /*synthetic*/false);
            // Refractory: real kicks are at least ~150 ms apart even at 200 BPM
            this._refractoryUntil = now + 140;
        }
    }

    /**
     * Kick detection on the kick band: `low` is its level against a slowly decaying peak (loudness-independent),
     * `raw` its RMS.
     *
     * A kick is a sudden rise: the level now against the lowest it was in the last 60 ms. The club feeds this one
     * step every 1/60 s of audio whatever the frame rate (VRClub._readKickBand), so that window always holds
     * several steps. It counts when
     *   - the normalised rise is well above the usual frame-to-frame movement (2.5 x the median of the last ~second),
     *   - the RAW rise is at least KICK_REF_SHARE of the kicks already accepted. A bass note or a tom is a fraction
     *     of a kick (measured: bass plucks rise at most a quarter of a kick), so a rolling bassline is not taken for a
     *     four-on-the-floor. Raw, because the normalising peak itself decays through a kick-less breakdown and would
     *     let the bassline through within seconds. The reference relaxes with a 60 s half-life when no kick comes,
     *     so a track whose kick changes is followed,
     *   - and once the tempo is known, more than ~55% of a beat after the last kick (no eighth-note doubles).
     * Measured on a 124 BPM test track with a plucked eighth-note bassline, hats and a kick-less breakdown:
     * see BACKLOG (the old bass-band flux took 323 onsets for 128 kicks and read 144 BPM).
     */
    _detectKick(low, raw, now) {
        const k = this._kick || (this._kick = {
            times: new Float64Array(16), levels: new Float32Array(16), raws: new Float32Array(16), head: 0, count: 0,
            history: [], sorted: [], ref: 0, at: now
        });
        const dt = Math.min(0.25, Math.max(0, (now - k.at) / 1000));
        k.at = now;
        // The reference relaxes when no kick has been accepted for a while.
        k.ref *= Math.pow(0.5, dt / 60);

        // Lowest level in the last 60 ms (not counting this frame), normalised and raw.
        let floor = low, rawFloor = raw;
        for (let i = 0; i < k.count; i++) {
            if (now - k.times[i] > 60) continue;
            if (k.levels[i] < floor) floor = k.levels[i];
            if (k.raws[i] < rawFloor) rawFloor = k.raws[i];
        }
        k.times[k.head] = now; k.levels[k.head] = low; k.raws[k.head] = raw;
        k.head = (k.head + 1) % k.times.length;
        k.count = Math.min(k.count + 1, k.times.length);
        const rise = Math.max(0, low - floor);
        const rawRise = Math.max(0, raw - rawFloor);
        k.lastRise = rise;

        k.history.push(rise);
        if (k.history.length > 60) k.history.shift();
        if (k.history.length < 12 || now < this._refractoryUntil) return;
        const sorted = k.sorted;
        sorted.length = 0;
        for (let i = 0; i < k.history.length; i++) sorted.push(k.history[i]);
        sorted.sort(VJDirector._ascending);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (rise <= Math.max(0.12, median * 2.5) || low < 0.35) return;
        if (rawRise < k.ref * VJDirector.KICK_REF_SHARE) return;

        // Once the tempo is known and the kick is running, a hit well off the beat (a syncopated bass note, an
        // extra kick on the "and") is not itself the beat: counting it shortened the tempo and added a beat to the
        // bar. Measuring against the LAST ACCEPTED kick's own time is not robust: if that one kick happened to be
        // the syncopated hit (it only has to be close enough to the grid once), every real kick after it sits
        // off-grid from it instead, and gets rejected in its place forever, because the syncopation recurs on its
        // own fixed offset from the beat. A vote over several recent candidates — accepted or not — picks the
        // phase the MAJORITY sit on (a circular median, immune to a minority of outliers) instead of trusting any
        // one of them, so an unlucky first accept cannot lock the grid onto the wrong beat. The same vote also
        // recovers a kick that has really moved (a mix landing late): once most recent candidates sit at the new
        // offset, the median follows them.
        const beat = 60000 / this.bpm;
        const phase = (now / beat) % 1;
        const buf = k.phaseBuf || (k.phaseBuf = new Float64Array(VJDirector.RHYTHM.phaseHistory));
        const filled = Math.min(k.phaseCount || 0, buf.length);
        if (this._tempoTrusted(now) && filled >= VJDirector.RHYTHM.phaseVotes) {
            const gridPhase = VJDirector._circularMedianPhase(buf, filled);
            if (VJDirector._circularDist(phase, gridPhase) > VJDirector.RHYTHM.offGridShare) {
                buf[k.phaseHead || 0] = phase;
                k.phaseHead = ((k.phaseHead || 0) + 1) % buf.length;
                k.phaseCount = (k.phaseCount || 0) + 1;
                this._refractoryUntil = now + 0.25 * beat;
                return;
            }
        }
        buf[k.phaseHead || 0] = phase;
        k.phaseHead = ((k.phaseHead || 0) + 1) % buf.length;
        k.phaseCount = (k.phaseCount || 0) + 1;

        k.ref = k.ref > 0 ? k.ref + (rawRise - k.ref) * 0.2 : rawRise;
        this._registerBeat(now, false);
        // With the tempo known, the next kick cannot come before ~55% of a beat (no doubles on the bassline's
        // eighths); before that, any two kicks are at least 180 ms apart.
        const confident = this._tempoTrusted(now) || this._iois.length >= 6;
        this._refractoryUntil = now + (confident ? Math.max(180, 0.55 * 60000 / this.bpm) : 180);
    }

    /** A rise has to reach this share of the accepted kicks' to be a kick. */
    static get KICK_REF_SHARE() { return 0.45; }

    // -------------------------------------------------------------------------
    // WHAT REPEATS: onset envelopes of the kick band and of the rest of the rhythm (everything above the bass: snare,
    // claps, hats, synth stabs and arpeggios), one value per 1/60 s of audio, and their autocorrelation.
    //
    //  - TEMPO comes from what repeats, not from the gaps between detected kicks. The old median of kick-to-kick
    //    intervals read a 124 BPM progressive set as 140-167 BPM for minutes at a time whenever a syncopated bass note
    //    or an extra kick slipped through (measured on Resident 801), and the crowd danced visibly too fast. The
    //    envelopes' beat period (70-180 BPM, with its double and half, and a gentle preference for ~122 BPM to settle
    //    half/double time) is stable; the kicks still set the PHASE.
    //  - THE REST OF THE RHYTHM answers what the kick cannot: when the kick is gone (a breakdown, an intro), does the
    //    music still have a pulse - hats on the eighths, a snare or clap on 2 and 4, an arpeggio - or is it a pad that
    //    only swells? Onset strength there is the rise in dB over the last 60 ms (a hat counts as clearly as a loud
    //    snare), and every envelope is measured against its own half-second mean, so a slow swell is not a series of
    //    onsets. A pulse is a strong repeat at the grid's beat (or its half or double: eighth-note hats, a backbeat
    //    snare), with hysteresis, and at least one real onset every other beat.
    //  - While the kick is away, a rhythm onset within 15% of a beat pulls the flywheel a quarter of the way onto it,
    //    so the grid the crowd dances on stays with the snare and the hats. Offbeats are left alone.
    // No allocation: fixed rings, scratch arrays and plain loops.
    // -------------------------------------------------------------------------

    static _envelope() {
        const R = VJDirector.RHYTHM;
        return { ring: new Float32Array(R.window), raw: new Float32Array(R.window), head: 0, filled: 0, sum: 0, acf: new Float32Array(R.maxLag + 2) };
    }

    /** Add one onset-strength value, measured against the envelope's own running half-second mean. */
    static _pushEnvelope(e, value) {
        const R = VJDirector.RHYTHM, W = R.window;
        e.raw[e.head] = value;
        e.sum += value;
        if (e.filled >= R.meanSteps) e.sum -= e.raw[(e.head - R.meanSteps + W) % W];
        e.ring[e.head] = value - e.sum / Math.min(R.meanSteps, e.filled + 1);
        e.head = (e.head + 1) % W;
        e.filled = Math.min(e.filled + 1, W);
    }

    /** Normalised autocorrelation into e.acf. Returns false when the envelope is too short or flat to say anything. */
    static _autocorrelate(e) {
        const R = VJDirector.RHYTHM, W = R.window, n = e.filled, ring = e.ring;
        e.acf.fill(0);
        if (n < R.minFill) return false;
        const start = (e.head - n + W) % W;
        let energy = 0;
        for (let i = 0; i < n; i++) { const v = ring[(start + i) % W]; energy += v * v; }
        if (energy < 1e-9) return false;
        for (let lag = R.minLag; lag <= R.maxLag; lag++) {
            let s = 0;
            for (let i = 0; i + lag < n; i++) s += ring[(start + i) % W] * ring[(start + i + lag) % W];
            e.acf[lag] = (s / energy) * (n / (n - lag));
        }
        return true;
    }

    /** The autocorrelation at a fractional lag (0 outside the computed range). */
    static _acfAt(e, lag) {
        const R = VJDirector.RHYTHM;
        if (lag < R.minLag || lag > R.maxLag) return 0;
        const lo = Math.floor(lag), f = lag - lo;
        return e.acf[lo] * (1 - f) + e.acf[Math.min(lo + 1, R.maxLag)] * f;
    }

    /** How strongly an envelope repeats with a beat of `lag` steps: the beat, two beats, or its eighths. */
    static _pulseAt(e, lag) {
        return Math.max(VJDirector._acfAt(e, lag), VJDirector._acfAt(e, lag * 2), VJDirector._acfAt(e, lag / 2));
    }

    /** An envelope's evidence for a beat of `lag` steps: the beat, two beats, and (less) its eighths. */
    static _harmonic(e, lag) {
        const at = VJDirector._acfAt;
        return at(e, lag) + 0.5 * at(e, lag * 2) + 0.25 * at(e, lag / 2);
    }

    /** Tempo evidence at a beat of `lag` steps across both envelopes, weighted. */
    _tempoScore(lag, kickWeight) {
        return kickWeight * VJDirector._harmonic(this._kickEnv, lag) + (1 - kickWeight) * VJDirector._harmonic(this._rhythmEnv, lag);
    }

    static _tempoPrior(bpm) {
        const octaves = Math.log2(bpm / VJDirector.RHYTHM.preferredBpm);
        return Math.exp(-0.5 * (octaves / 0.45) * (octaves / 0.45));
    }

    /** One step of the kick band's onset strength (called from _detectOnset, after _detectKick). */
    _pushKickEnvelope() {
        const env = this._kickEnv || (this._kickEnv = VJDirector._envelope());
        VJDirector._pushEnvelope(env, this._kick ? this._kick.lastRise : 0);
    }

    /** One step of the rest of the rhythm: `rms` is the band's level (VRClub._readKickBand reads it beside the kick). */
    _detectRhythm(rms, t) {
        const R = VJDirector.RHYTHM;
        const r = this._rhythm || (this._rhythm = {
            recent: new Float32Array(4), recentTimes: new Float64Array(4), rh: 0,
            history: new Float32Array(60), hh: 0, hn: 0, sorted: [],
            onsets: new Float64Array(64), oh: 0, on: 0, refractoryUntil: 0, steps: 0, stable: 0
        });
        const env = this._rhythmEnv || (this._rhythmEnv = VJDirector._envelope());
        const level = 20 * Math.log10(Math.max(rms || 0, 1e-5));
        let floor = level;
        for (let i = 0; i < r.recent.length; i++) if (t - r.recentTimes[i] <= 60 && r.recent[i] < floor) floor = r.recent[i];
        r.recent[r.rh] = level; r.recentTimes[r.rh] = t; r.rh = (r.rh + 1) % r.recent.length;
        const rise = rms > R.silence ? Math.min(30, Math.max(0, level - floor)) : 0;
        VJDirector._pushEnvelope(env, rise);

        // Discrete onsets: well above the usual movement of the band, at most one every 90 ms.
        r.history[r.hh] = rise; r.hh = (r.hh + 1) % r.history.length; r.hn = Math.min(r.hn + 1, r.history.length);
        const sorted = r.sorted;
        sorted.length = 0;
        for (let i = 0; i < r.hn; i++) sorted.push(r.history[i]);
        sorted.sort(VJDirector._ascending);
        const median = sorted.length ? sorted[sorted.length >> 1] : 0;
        if (rise > Math.max(R.onsetDb, median * 2.2) && t >= r.refractoryUntil) {
            r.refractoryUntil = t + 90;
            r.onsets[r.oh] = t; r.oh = (r.oh + 1) % r.onsets.length; r.on = Math.min(r.on + 1, r.onsets.length);
            this.lastRhythmOnsetAt = t;
            this._nudgeFlywheel(t);
        }

        r.steps++;
        if (r.steps % R.every === 0) this._evaluateRhythm(t);
    }

    /**
     * Several times a second: the tempo (from both envelopes) and whether the rest of the rhythm has a pulse.
     * Writes bpm (while the kick is here), rhythmPresent / rhythmStrength and rhythmBpm.
     */
    _evaluateRhythm(t) {
        const R = VJDirector.RHYTHM, S = VJDirector;
        const r = this._rhythm;
        const kickEnv = this._kickEnv || (this._kickEnv = S._envelope());
        const kickOk = S._autocorrelate(kickEnv);
        const rhythmOk = S._autocorrelate(this._rhythmEnv);
        const kickHere = kickOk && this.realOnsetCount > 0 && t - this.lastRealOnsetAt < 2000;

        // The tempo both envelopes agree on, refined between whole steps.
        const kickWeight = kickHere ? (rhythmOk ? 0.65 : 1) : 0;
        let bestLag = 0, best = -Infinity;
        if (kickHere || rhythmOk) {
            for (let lag = R.beatLagMin; lag <= R.beatLagMax; lag++) {
                const s = this._tempoScore(lag, kickWeight) * S._tempoPrior(60 * R.stepsPerSecond / lag);
                if (s > best) { best = s; bestLag = lag; }
            }
            if (bestLag > R.beatLagMin && bestLag < R.beatLagMax) {
                const a = this._tempoScore(bestLag - 1, kickWeight) * S._tempoPrior(60 * R.stepsPerSecond / (bestLag - 1));
                const c = this._tempoScore(bestLag + 1, kickWeight) * S._tempoPrior(60 * R.stepsPerSecond / (bestLag + 1));
                const d = a - 2 * best + c;
                if (d < 0) bestLag += Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / d));
            }
        }
        const tempo = bestLag > 0 ? 60 * R.stepsPerSecond / bestLag : 0;
        const confidence = bestLag > 0 ? this._tempoScore(bestLag, kickWeight) : 0;
        if (kickHere && confidence > R.tempoConfidence) {
            // The kick is here and the music agrees on a beat: that is the tempo, followed smoothly.
            this.bpm += (tempo - this.bpm) * 0.25;
            this._tempoTrustedAt = t;
        }

        // The rest of the rhythm: judged on the club's grid when the tempo is known, else on its own best period.
        let onsets = 0;
        for (let i = 0; i < r.on; i++) if (t - r.onsets[i] <= 4000) onsets++;
        const known = this._tempoTrustedAt !== undefined && t - this._tempoTrustedAt < R.kickTempoMemoryMs;
        const ownTempo = !kickHere && rhythmOk ? tempo : 0;
        const lag = known ? 60 * R.stepsPerSecond / this.bpm : bestLag;
        // Measured against the envelope's own noise floor (the median repeat over every beat period): a real pulse
        // stands out at its beat and harmonics; random hits repeat a little at every period and nowhere in particular.
        // Then the onsets must keep time: hats, snares and arpeggios land on a sixteenth (or triplet) grid of that beat.
        let strength = rhythmOk && lag > 0 ? S._pulseAt(this._rhythmEnv, lag) - this._acfFloor(this._rhythmEnv) : 0;
        if (strength > 0) strength *= Math.min(1, Math.max(0, (this._onsetCoherence(r, t, lag * 1000 / R.stepsPerSecond) - R.coherenceFrom) / R.coherenceSpan));
        const enough = onsets >= 4 * ((known ? this.bpm : ownTempo || this.bpm) / 60) * R.minOnsetsPerBeat;
        this._setRhythm(enough ? strength : 0);
        if (!known && this.rhythmPresent && ownTempo >= 70 && ownTempo <= 180) {
            // No kick has said what the tempo is: a steady pulse in the band does, once it has held for a few seconds.
            r.stable = Math.abs(ownTempo - this.rhythmBpm) < 3 ? r.stable + 1 : 0;
            this.rhythmBpm = ownTempo;
            if (r.stable >= 10) this.bpm += (ownTempo - this.bpm) * 0.1;
        } else if (known) {
            this.rhythmBpm = this.bpm;
        }
    }

    /** Is the tempo known well enough to judge whether a kick is on the beat? */
    _tempoTrusted(now) {
        return this._tempoTrustedAt !== undefined && now - this._tempoTrustedAt < 4000;
    }

    /** The median absolute repeat over every beat period: how much an envelope repeats at periods that mean nothing. */
    _acfFloor(e) {
        const R = VJDirector.RHYTHM;
        const scratch = this._acfScratch || (this._acfScratch = []);
        scratch.length = 0;
        for (let lag = R.beatLagMin; lag <= R.beatLagMax; lag++) scratch.push(Math.abs(e.acf[lag]));
        scratch.sort(VJDirector._ascending);
        return scratch[scratch.length >> 1];
    }

    /**
     * How well the last 4 s of rhythm onsets keep time with a beat of `beatMs`: the phase coherence (0 = none, 1 =
     * every onset on the grid) on its sixteenths or its triplets, whichever fits better.
     */
    _onsetCoherence(r, t, beatMs) {
        let best = 0;
        for (let d = 3; d <= 4; d++) {
            const period = beatMs / d;
            let c = 0, s = 0, n = 0;
            for (let i = 0; i < r.on; i++) {
                const at = r.onsets[i];
                if (t - at > 4000) continue;
                const phase = 2 * Math.PI * (at % period) / period;
                c += Math.cos(phase); s += Math.sin(phase); n++;
            }
            if (n > 0) best = Math.max(best, Math.sqrt(c * c + s * s) / n);
        }
        return best;
    }

    _setRhythm(strength) {
        const R = VJDirector.RHYTHM;
        // Smoothed, with hysteresis: a pulse that comes and goes from one evaluation to the next is not a pulse.
        this.rhythmStrength += (Math.max(0, Math.min(1, strength)) - this.rhythmStrength) * 0.35;
        if (this.rhythmPresent) this.rhythmPresent = this.rhythmStrength > R.off;
        else this.rhythmPresent = this.rhythmStrength > R.on;
    }

    /** While the kick is away, let a rhythm onset near a beat pull the flywheel toward it. */
    _nudgeFlywheel(t) {
        if (!this.rhythmPresent) return;
        const beat = 60000 / this.bpm;
        if (t - this.lastRealOnsetAt < 2 * beat) return;   // the kick owns the phase
        const k = Math.round((t - this.lastBeatAt) / beat);
        const error = t - (this.lastBeatAt + k * beat);
        if (Math.abs(error) < VJDirector.RHYTHM.nudgeWindow * beat) this.lastBeatAt += VJDirector.RHYTHM.nudgeGain * error;
    }

    static get RHYTHM() {
        return this._rhythmConfig || (this._rhythmConfig = Object.freeze({
            stepsPerSecond: 60,
            window: 384,          // ~6.4 s of envelope
            minFill: 240,         // 4 s before any verdict
            meanSteps: 30,        // the half-second mean each envelope is measured against
            every: 12,            // evaluate five times a second
            minLag: 7,            // a sixteenth at ~128 BPM
            maxLag: 104,          // a half note at ~70 BPM (double the slowest beat)
            beatLagMin: 20,       // 180 BPM
            beatLagMax: 51,       // ~70 BPM
            preferredBpm: 122,    // where half/double time is settled toward
            tempoConfidence: 0.3, // how strongly the envelopes must repeat before the kick tempo follows them
            onsetDb: 4,           // a rise this many dB above the last 60 ms is an onset
            coherenceFrom: 0.6,   // onsets this phase-coherent on the beat's sixteenths or triplets start to count (random: 0.3-0.68 over 4 s)
            coherenceSpan: 0.25,  // and from 0.85 fully (hats, snares, an arpeggio: 0.96-0.98)
            silence: 1e-4,
            minOnsetsPerBeat: 0.6,
            on: 0.3, off: 0.18,   // pulse strength hysteresis
            kickTempoMemoryMs: 120000,
            nudgeWindow: 0.15, nudgeGain: 0.25,
            offGridShare: 0.25,   // with the tempo known and the kick running, a kick further than this from the grid is not the beat
            phaseHistory: 7,      // recent kick candidates (accepted or not) a grid vote is taken over
            phaseVotes: 4         // votes needed before the gate trusts the grid over a lone accepted kick
        }));
    }
    /** At most one punch of the beat envelope every 400 ms (2.5 a second), whatever the tempo. */
    static get MIN_PUNCH_GAP_MS() { return 400; }

    _registerBeat(now, synthetic) {
        this.lastBeatAt = now;
        this.beatNumber++;

        // Punch the envelope (synthetic beats hit lighter). Never more than one punch every MIN_PUNCH_GAP_MS: the
        // whole rig dips and rises with it, and above ~150 BPM every beat would be over the 3-a-second flash limit,
        // so a fast track punches on alternate beats instead.
        if (!(now - (this._lastPunchAt ?? -Infinity) < VJDirector.MIN_PUNCH_GAP_MS)) {
            this.beatEnvelope = synthetic ? 0.35 : 1.0;
            this._lastPunchAt = now;
        }

        if (!synthetic) {
            const beatDur = 60000 / this.bpm;
            this.onsetStreak = (now - this.lastRealOnsetAt < beatDur * 1.5) ? this.onsetStreak + 1 : 1;
            this.lastRealOnsetAt = now;
            this.realOnsetCount++;
        }

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
                // While the onset envelopes know the tempo they own it; the interval median is the fallback for an
                // analyser without the stepped kick band (an old browser, a stub).
                if (!this._tempoTrusted(now)) this._recomputeBPM();
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
        // collisions and gives pleasing distribution over time. A look that pins
        // its hue (see setMasterHue) keeps it for the whole cue.
        if (!this.hueLocked && !this.remoteDriven) this.masterHue = (this.masterHue + 0.381966) % 1.0;

        this._writePalette();
    }

    /**
     * The palette's one writer per frame. While a guest holds the lights by hand the colours are theirs: the phrase
     * rotation above used to overwrite a colour they had just picked within seconds, whatever the hand-back timer said.
     * Held lights keep their colours (modes 'resume' and 'keep'), or take a new coherent random palette every few
     * seconds in mode 'shuffle'. A follower in someone else's room never rotates anything itself.
     */
    _updatePalette(now) {
        const club = this.club;
        if (!club.vjManualMode || this.remoteDriven) {
            this._shuffleAt = 0;
            this._applyPalette();
            return;
        }
        // The phrase clock keeps running, so the hand-back does not fire a stale rotation at once.
        if (this.beatNumber - this.lastPhraseBeat >= 16) this.lastPhraseBeat = this.beatNumber;
        const hold = club.lightHold;
        if (!hold || hold.mode !== 'shuffle') { this._shuffleAt = 0; return; }
        if (!this._shuffleAt) this._shuffleAt = now + hold.shuffle * 1000;
        if (now >= this._shuffleAt) {
            this._shuffleAt = now + hold.shuffle * 1000;
            this.shufflePalette();
        }
    }

    /** A new, different master hue (a third to two thirds of the wheel away), written to every colour consumer at once. */
    shufflePalette() {
        this.masterHue = (this.masterHue + 0.2 + Math.random() * 0.6) % 1.0;
        this.lastPhraseBeat = this.beatNumber;
        this._writePalette();
        return this.masterHue;
    }

    /** Write the current master hue to the beams, the wall, the lasers and the mirror ball. */
    _writePalette() {
        const club = this.club;
        const A = this._hsvToColor(this.masterHue, 1.0, 1.0, this._tmpColorA);

        // Spot color: primary palette color
        if (club.spotColorList && club.cachedColors) {
            club.currentSpotColor = A.clone();
            // The wall is not always the beams' colour: see ledHarmony.
            this.refreshLedColor();
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
        if (!this.remoteDriven && club.mirrorBallColors && club.mirrorBallColorIndex !== undefined) {
            club.mirrorBallColorIndex = (club.mirrorBallColorIndex + 1) % club.mirrorBallColors.length;
            club.mirrorBallSpotlightColor = club.mirrorBallColors[club.mirrorBallColorIndex];
        }
    }

    /**
     * Pin the whole rig to one hue (0..1) until unlockHue(). Used by looks that
     * carry a colour idea - a dawn amber, a breakdown blue - instead of leaving
     * it to the golden-angle rotation. Applied on the next frame, not the next phrase.
     */
    setMasterHue(hue) {
        const h = hue % 1;
        this.masterHue = h < 0 ? h + 1 : h;
        this.hueLocked = true;
        this.lastPhraseBeat = this.beatNumber - 16;
    }

    unlockHue() {
        this.hueLocked = false;
    }

    /** What the host's frame carries about colour, read at the host. */
    colourSnapshot() {
        const club = this.club;
        return {
            hue: this.masterHue,
            hl: this.hueLocked,
            pal: this.paletteMode,
            lh: this.ledHarmony || 'match',
            mbi: club.mirrorBallColorIndex || 0
        };
    }

    /** Adopt the host's colour. Applied on the next frame, not the next phrase, like setMasterHue. */
    applyRemoteColour(frame) {
        if (!frame) return;
        let changed = false;
        if (typeof frame.hue === 'number' && Math.abs(frame.hue - this.masterHue) > 0.002) { this.masterHue = frame.hue; changed = true; }
        if (typeof frame.hl === 'boolean') this.hueLocked = frame.hl;
        if (typeof frame.pal === 'string' && frame.pal !== this.paletteMode && ['analogous', 'complementary', 'triad'].includes(frame.pal)) {
            this.paletteMode = frame.pal;
            changed = true;
        }
        if (typeof frame.lh === 'string' && frame.lh !== (this.ledHarmony || 'match') && typeof this.setLedHarmony === 'function') {
            this.setLedHarmony(frame.lh);
            changed = true;
        }
        if (changed) this.lastPhraseBeat = this.beatNumber - 16;
        const club = this.club;
        const count = club.mirrorBallColors ? club.mirrorBallColors.length : 0;
        if (count && Number.isInteger(frame.mbi) && frame.mbi >= 0 && frame.mbi < count && frame.mbi !== club.mirrorBallColorIndex
            && typeof club.cycleMirrorBallColor === 'function') {
            club.mirrorBallColorIndex = (frame.mbi - 1 + count) % count;
            club.cycleMirrorBallColor();
        }
    }

    /**
     * Hue offsets (0..1 of the colour wheel) the wall can sit from the beams.
     *   match       wall = beams (the original behaviour, and the default)
     *   analogous   a neighbour, +30 degrees: same family, a different note
     *   complement  the opposite, +180 degrees: beams and wall pull against each other
     *   triad       +120 degrees
     *   follow      whatever partner hue the look's palette gives the lasers, so wall
     *               and lasers read as one second colour against the heads
     */
    static LED_HARMONIES = { match: 0, analogous: 0.083, complement: 0.5, triad: 0.333 };

    _ledHueOffset() {
        if (this.ledHarmony === 'follow') {
            return this.paletteMode === 'complementary' ? 0.5 : (this.paletteMode === 'triad' ? 0.333 : 0.083);
        }
        return VJDirector.LED_HARMONIES[this.ledHarmony] || 0;
    }

    /** Recompute the wall's colour from the master hue and the current harmony. No allocation. */
    refreshLedColor() {
        const club = this.club;
        const offset = this._ledHueOffset();
        const wallHue = (this.masterHue + offset) % 1.0;
        if (offset === 0) {
            if (club.currentSpotColor) club.ledShowColor = club.currentSpotColor;
        } else {
            club.ledShowColor = this._hsvToColor(wallHue, 1.0, 1.0, this._ledColor);
        }
        // A second colour for multi-colour wall looks: always the wall colour's opposite.
        club.ledAccentColor = this._hsvToColor((wallHue + 0.5) % 1.0, 1.0, 1.0, this._ledAccent);
    }

    setLedHarmony(harmony) {
        this.ledHarmony = harmony in VJDirector.LED_HARMONIES || harmony === 'follow' ? harmony : 'match';
        this.refreshLedColor();
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

VJDirector._ascending = (a, b) => a - b;

/** Circular distance between two phases in [0, 1), result in [0, 0.5]. */
VJDirector._circularDist = (a, b) => {
    const d = Math.abs(a - b) % 1;
    return d > 0.5 ? 1 - d : d;
};

/**
 * The phase (in beats, [0, 1)) that the recent kick candidates agree on, found as the candidate with the least
 * total circular distance to the rest of the window (a circular median): robust to a minority of syncopated hits
 * without needing to trust any single accepted kick as the anchor, which could itself have been one of them.
 */
VJDirector._circularMedianPhase = (buf, count) => {
    let bestIdx = 0, bestSum = Infinity;
    for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let j = 0; j < count; j++) {
            if (i !== j) sum += VJDirector._circularDist(buf[i], buf[j]);
        }
        if (sum < bestSum) { bestSum = sum; bestIdx = i; }
    }
    return buf[bestIdx];
};

// Expose globally — the script tag in index.html loads before club_hyperrealistic.js
window.VJDirector = VJDirector;
