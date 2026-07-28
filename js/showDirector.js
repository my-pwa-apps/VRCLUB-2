/**
 * ShowDirector — "NOCTURNE"
 * =========================
 * A beat-locked, phrase-aware cue engine that conducts the club's rig the way a
 * lighting designer programmes a festival console: composed LOOKS, arranged into
 * MOVEMENTS, punctuated by choreographed SET-PIECES, with every change landing on
 * a musical boundary.
 *
 *
 * WHY THIS EXISTS
 * ---------------
 * The rig was already excellent — 6 moving heads, 3 multi-beam lasers, 4 strobes,
 * a 210-panel LED wall, a 150-spot mirror ball, haze. What was missing was a SHOW.
 * Three independent processes were each writing the same state variables:
 *
 *   1. The legacy 12-phase cycler (club_hyperrealistic.js) — a WALL-CLOCK timer
 *      firing every 4–20 randomised seconds.
 *   2. VJDirector's scene machine — an audio-ENERGY threshold crossing.
 *   3. updateLEDWall()'s own pattern advance — its own private beat counter.
 *
 * They overwrote each other, and none of them was locked to musical structure.
 * The result reads as busy but arbitrary. An audience perceives a light show as
 * *designed* for exactly two reasons: changes land on musical boundaries, and the
 * show sets up expectation before it pays it off. Neither was possible before.
 *
 * ShowDirector becomes the single source of truth for the rig and supplies both.
 *
 *
 * DESIGN PRINCIPLES
 * -----------------
 * 1. MUSICAL TIME ONLY. Cues advance on bars (4 beats) and phrases (16 beats),
 *    never on wall-clock seconds. The beat grid comes from VJDirector's existing
 *    spectral-flux tracker — one beat authority, no competing clocks.
 *
 * 2. CONTRAST IS THE CURRENCY. Darkness is a designed element, not an absence of
 *    one. Several looks here are deliberately near-empty; they exist so the look
 *    that follows can land. A rig at 100% for six minutes reads as flat.
 *
 * 3. ANTICIPATION, THEN RELEASE. The show knows what is coming, so it can build
 *    into it. THE COUNTDOWN set-piece exists purely to make the drop land.
 *
 * 4. EVOLVE WITHIN A CUE. Static states feel like slideshows. Cues can ramp a
 *    parameter across their whole span (`spotSpeed: [0.5, 2.0]`), so the room is
 *    always subtly accelerating or relaxing.
 *
 * 5. ONE IDEA AT A TIME. The original code carried a good instinct in a comment —
 *    "never gobos + lasers together". Honoured here and enforced at load time by
 *    _validateLooks(): aerial beam work and floor texture compete for the eye.
 *
 *
 * WHAT IT WRITES
 * --------------
 * Only pre-existing state vars on the VRClub instance (the same ones the VJ
 * buttons drive), so no subsystem needs to know this file exists:
 *   lightsActive, lasersActive, strobesActive, blindersActive, mirrorBallActive,
 *   smokeActive, ledWallActive, spotlightPattern, spotlightMode, spotlightSpeed,
 *   goboEnabled, goboPatternIndex, goboRotationSpeed, laserSpeed, ledPattern,
 *   ledWallSpeed, mirrorBallSpeed, strobeSpeed, blinderSpeed, fogIntensity,
 *   masterIntensity
 * plus vjDirector.paletteMode, so the director's HSV palette engine stays in
 * charge of actual hue selection — this class only tells it which harmony to use.
 *
 * No new GPU lights (Quest sits near the PBR uniform-buffer ceiling) and no
 * per-frame allocation: every look is a frozen literal built once at construction.
 */
class ShowDirector {

    // Musical grid constants.
    static BEATS_PER_BAR = 4;
    static BARS_PER_PHRASE = 4;   // 16 beats

    /** Look keys that describe the cue itself and must never be written onto the club. */
    static META_KEYS = new Set(['intensity', 'palette', 'punch']);

    constructor(club) {
        this.club = club;

        /** Master switch. When false the legacy cycler regains control. */
        this.enabled = true;

        // --- Beat grid tracking (derived from VJDirector, never independently timed)
        this._lastBeatNumber = -1;
        this._barCounter = 0;          // Monotonic bar index
        this._beatInBar = 0;           // 0..3

        // --- Cue sequencing
        this._movement = null;         // Active movement object
        this._movementName = '';
        this._cueIndex = 0;
        this._cue = null;
        this._cueStartBar = 0;
        this._cueBarsElapsed = 0;

        // --- Set-piece state (choreography that overrides the cue list)
        this._setPiece = null;
        this._setPieceBar = 0;
        this._setPieceStartBar = 0;

        // --- Energy tracking, used only to choose the next MOVEMENT (never to
        //     change look mid-phrase; that is what made the old system twitchy).
        this._energy = 0;
        this._barsSinceMovement = 0;

        // --- Continuous modulation
        this._blackoutBeats = 0;       // Counts down in beats
        this._flashHold = 0;           // Frames of white-out remaining
        this._intensity = 1.0;         // Smoothed master level

        this.looks = ShowDirector._buildLooks();
        this.movements = ShowDirector._buildMovements();
        this.setPieces = ShowDirector._buildSetPieces();

        this._validateLooks();

        // Open on ARRIVAL so the room reveals itself rather than starting at peak.
        this._enterMovement('arrival');

        if (typeof log !== 'undefined') {
            log.info('🎭 Show Director online — "NOCTURNE" (beat-locked cue engine)');
        }
    }

    /**
     * True while this class owns the rig. The legacy 12-phase cycler and
     * VJDirector's auto-scene picker both check this and stand down, so there is
     * exactly one writer for the fixture state at any moment.
     */
    isDriving() {
        return this.enabled && !this.club.vjManualMode;
    }

    // =========================================================================
    // PER-FRAME UPDATE. Called from updateAnimations() AFTER vjDirector.update()
    // so the beat grid for this frame is already resolved.
    // =========================================================================
    update(timeSec, audioData) {
        if (!this.isDriving()) return;

        const vj = this.club.vjDirector;
        if (!vj) return;

        // --- Track perceived energy (slow EMA; movements are a long-form decision)
        const inst = audioData && audioData.hasAudio
            ? (audioData.bass * 0.6 + audioData.mid * 0.3 + audioData.treble * 0.1)
            : 0.24;   // No audio: sit in the groove band so the room still performs.
        this._energy += (inst - this._energy) * 0.02;

        // --- Advance the musical grid on beat edges only
        const beat = vj.beatNumber;
        if (beat !== this._lastBeatNumber) {
            const beatsAdvanced = Math.max(1, beat - this._lastBeatNumber);
            this._lastBeatNumber = beat;
            for (let i = 0; i < beatsAdvanced && i < 8; i++) this._onBeat();
        }

        // --- Continuous (per-frame) modulation on top of the discrete cue state
        this._applyContinuous(vj, audioData);
    }

    // =========================================================================
    // MUSICAL GRID
    // =========================================================================

    _onBeat() {
        if (this._blackoutBeats > 0) this._blackoutBeats--;

        this._beatInBar = (this._beatInBar + 1) % ShowDirector.BEATS_PER_BAR;

        // Downbeat = start of a new bar. All structural decisions happen here,
        // which is what makes changes feel intentional rather than incidental.
        if (this._beatInBar === 0) {
            this._barCounter++;
            this._onBar();
        }
    }

    _onBar() {
        this._cueBarsElapsed = this._barCounter - this._cueStartBar;
        this._barsSinceMovement++;

        // A set-piece owns the rig until it finishes; nothing interrupts it.
        if (this._setPiece) {
            this._setPieceBar = this._barCounter - this._setPieceStartBar;
            if (this._setPieceBar >= this._setPiece.bars) {
                // _endSetPiece enters a fresh movement and resets the cue clock.
                // Falling through to the advance check below would compare that
                // new cue against the STALE _cueBarsElapsed computed above and
                // skip cue 0 of every movement a set-piece hands over to.
                this._endSetPiece();
                return;
            }
            this._setPiece.onBar(this, this._setPieceBar);
            return;
        }

        // Cue exhausted? Advance. On the last bar of a movement, consider moving on.
        if (this._cueBarsElapsed >= this._cue.bars) {
            this._advanceCue();
        }
    }

    _advanceCue() {
        const atMovementEnd = this._cueIndex + 1 >= this._movement.cues.length;

        if (atMovementEnd) {
            const next = this._pickMovement();
            if (next !== this._movementName) {
                // A set-piece can be used as the JOIN between movements — this is
                // where a designer earns their fee. Escalating into the drop gets
                // the countdown; collapsing out of it gets the cut to black.
                const bridge = this._bridgeFor(this._movementName, next);
                if (bridge) {
                    this._beginSetPiece(bridge, next);
                    return;
                }
                this._enterMovement(next);
                return;
            }
            // Same movement selected again — loop it, but restart from cue 0 so
            // its internal arc replays rather than freezing on the final look.
            this._cueIndex = 0;
        } else {
            this._cueIndex++;
        }

        this._applyCue(this._movement.cues[this._cueIndex]);
    }

    // =========================================================================
    // MOVEMENT SELECTION
    // =========================================================================

    /**
     * Movements are chosen from smoothed energy, but only ever at the end of a
     * movement — never mid-phrase. Hysteresis (a movement must run its minimum
     * length) prevents the flapping that made the old energy-threshold system
     * feel random.
     *
     * Bands are calibrated against the same weighted mix VJDirector uses
     * (bass 0.6 / mid 0.3 / treble 0.1), whose practical ceiling on a loud
     * master is ~0.45 — thresholds above that would strand the show in the
     * lower movements and IGNITION would never fire.
     */
    _pickMovement() {
        const e = this._energy;
        if (this._barsSinceMovement < this._movement.minBars) return this._movementName;

        if (e < 0.08) return 'afterglow';
        if (e < 0.16) return 'arrival';
        if (e < 0.25) return 'pulse';
        if (e < 0.34) return 'ascent';
        return 'ignition';
    }

    _enterMovement(name) {
        const movement = this.movements[name];
        if (!movement) return;

        this._movement = movement;
        this._movementName = name;
        this._cueIndex = 0;
        this._barsSinceMovement = 0;
        this._applyCue(movement.cues[0]);

        if (typeof log !== 'undefined') {
            log.info(`🎭 Movement → ${movement.title}  (energy=${this._energy.toFixed(2)})`);
        }
    }

    /** Which set-piece, if any, should bridge one movement into another. */
    _bridgeFor(from, to) {
        if (to === 'ignition' && from !== 'ignition') return 'countdown';
        if (from === 'ignition' && (to === 'afterglow' || to === 'arrival')) return 'cutToBlack';
        return null;
    }

    // =========================================================================
    // CUES
    // =========================================================================

    _applyCue(cue) {
        this._cue = cue;
        this._cueStartBar = this._barCounter;
        this._cueBarsElapsed = 0;

        const look = this.looks[cue.look];
        if (!look) return;
        this._applyLook(look);

        // A one-beat blackout immediately before a new look makes the change
        // read as a decision. Used sparingly — only where the cue asks for it.
        if (cue.punchIn) this._blackoutBeats = 1;
    }

    /**
     * Write a look onto the rig. Only assigns keys that already exist on the
     * VRClub instance (verified once at construction by _validateLooks), so a
     * typo can never silently create a dead property that nothing reads.
     */
    _applyLook(look) {
        const club = this.club;
        const safe = club.photosensitiveSafeMode;

        for (const key in look) {
            if (ShowDirector.META_KEYS.has(key)) continue;
            let value = look[key];

            // Ramped parameters are stored as [from, to] and resolved per-frame
            // in _applyContinuous; seed them with the start value here.
            if (Array.isArray(value)) value = value[0];

            // Photosensitive safe mode is a medical setting, not a preference.
            // It overrides the designer at the point of application.
            if (safe && (key === 'strobesActive' || key === 'blindersActive')) value = false;

            club[key] = value;
        }

        if (look.palette && club.vjDirector) club.vjDirector.paletteMode = look.palette;
    }

    // =========================================================================
    // CONTINUOUS MODULATION
    //
    // Everything above is discrete and lands on musical boundaries. This is the
    // layer that keeps the room breathing between those boundaries.
    // =========================================================================

    _applyContinuous(vj, audioData) {
        const club = this.club;
        const look = this.looks[this._cue.look];
        if (!look) return;

        // --- 1. Resolve ramped parameters across the cue's span.
        const span = Math.max(1, this._cue.bars);
        const barsIn = this._barCounter - this._cueStartBar;
        const beatFrac = this._beatInBar / ShowDirector.BEATS_PER_BAR;
        const t = Math.min(1, Math.max(0, (barsIn + beatFrac) / span));
        for (const key in look) {
            if (ShowDirector.META_KEYS.has(key)) continue;   // never write meta onto the club
            const v = look[key];
            if (Array.isArray(v)) club[key] = v[0] + (v[1] - v[0]) * t;
        }

        // --- 2. Master intensity: look level, kick punch, blackout gate.
        //     `intensity` may itself be a ramp, so resolve it the same way rather
        //     than reading the raw array (which silently poisons the whole chain
        //     with NaN and blacks the rig out).
        const rawIntensity = look.intensity;
        let target = rawIntensity === undefined
            ? 1.0
            : (Array.isArray(rawIntensity)
                ? rawIntensity[0] + (rawIntensity[1] - rawIntensity[0]) * t
                : rawIntensity);

        // Kick punch — the rig breathes with the track. `punch` is how much of the
        // level is surrendered to the beat envelope (0 = steady, 1 = fully gated).
        const punch = look.punch !== undefined ? look.punch : 0.25;
        const env = vj.beatEnvelope || 0;
        target *= (1 - punch) + punch * env;

        // Set-piece per-frame hook (strobe ramps, sweeps, white-outs).
        if (this._setPiece && this._setPiece.onFrame) {
            target = this._setPiece.onFrame(this, target, vj);
        }

        // Blackout gate — hard zero, no fade. A soft blackout is just a dim.
        if (this._blackoutBeats > 0) target = 0;
        if (vj.blackoutUntil > performance.now()) target = 0;

        // --- 3. Smooth, then publish. Snap on the way down (a blackout that
        //        fades is just a dim), fast attack on the way up so the kick
        //        punch reads as a hit and peak looks can actually reach full.
        const rate = target < this._intensity ? 0.5 : 0.30;
        this._intensity += (target - this._intensity) * rate;
        club.masterIntensity = this._intensity;
    }

    // =========================================================================
    // SET-PIECES
    // =========================================================================

    _beginSetPiece(name, thenMovement) {
        const piece = this.setPieces[name];
        if (!piece) { this._enterMovement(thenMovement); return; }

        this._setPiece = piece;
        this._setPieceStartBar = this._barCounter;
        this._setPieceBar = 0;
        this._setPieceThen = thenMovement;

        if (piece.onStart) piece.onStart(this);
        piece.onBar(this, 0);

        if (typeof log !== 'undefined') log.info(`🎬 Set-piece → ${piece.title}`);
    }

    _endSetPiece() {
        const then = this._setPieceThen;
        this._setPiece = null;
        this._setPieceThen = null;
        this._enterMovement(then || 'pulse');
    }

    // =========================================================================
    // PUBLIC MACROS (wired to VJ buttons)
    // =========================================================================

    /** Jump straight to the ignition movement via the full countdown build. */
    triggerShowDrop() {
        this._beginSetPiece('countdown', 'ignition');
    }

    /** Force a named movement immediately. */
    forceMovement(name) {
        if (!this.movements[name]) return false;
        this._setPiece = null;
        this._enterMovement(name);
        return true;
    }

    /** Cycle to the next movement in the show's running order. */
    nextMovement() {
        const names = Object.keys(this.movements);
        const i = names.indexOf(this._movementName);
        const next = names[(i + 1) % names.length];
        this.forceMovement(next);
        return this.movements[next].title;
    }

    /** Hand the rig back to the legacy cycler / manual VJ control. */
    setEnabled(on) {
        this.enabled = !!on;
        if (this.enabled) {
            this._enterMovement(this._pickMovement());
        }
        return this.enabled;
    }

    /** Human-readable state for the UI. */
    getStatus() {
        return {
            movement: this._movement ? this._movement.title : '—',
            cue: this._cue ? this._cue.look : '—',
            setPiece: this._setPiece ? this._setPiece.title : null,
            bar: this._barCounter,
            energy: this._energy
        };
    }

    // =========================================================================
    // VALIDATION — runs once. Catches look typos loudly at startup instead of
    // letting them become properties nothing ever reads.
    // =========================================================================
    _validateLooks() {
        const club = this.club;
        const unknown = new Set();
        const conflicts = [];

        for (const name in this.looks) {
            const look = this.looks[name];
            for (const key in look) {
                if (ShowDirector.META_KEYS.has(key)) continue;
                if (!(key in club)) unknown.add(`${name}.${key}`);
            }
            // Design rule: aerial beam work and projected floor texture compete
            // for attention. One or the other, never both.
            if (look.lasersActive === true && look.goboEnabled === true) {
                conflicts.push(name);
            }
        }

        if (typeof log !== 'undefined') {
            if (unknown.size) {
                log.warn(`🎭 Show Director: unknown look keys (typo?) → ${[...unknown].join(', ')}`);
            }
            if (conflicts.length) {
                log.warn(`🎭 Show Director: looks break the gobo/laser rule → ${conflicts.join(', ')}`);
            }
        }
    }

    // =========================================================================
    // ═══════════════ THE SHOW ═══════════════
    //
    // LOOKS — each is one composed state of the whole rig. Named for what the
    // audience sees, not for what the code does.
    //
    // Fixture-state key reference:
    //   spotlightPattern  0 WAVE · 1 LOCK (heads down at floor centre)
    //                     2 PINWHEEL (mirror sweep) · 3 BUTTERFLY (crossed beams)
    //   spotlightMode     0 strobe+sweep · 1 sweep · 2 strobe+static · 3 static
    //   ledPattern        0 spiral · 1 rings · 2 squares · 3 mandala · 4 ripple
    //                     5 breathing · 6 shockwave · 7 pulse star · 8 radial
    //                     9 wave collide · 10 cellular · 11 tunnel · 12 kaleidoscope
    //                     13 DNA · 14 infinity · 15 plasma · 16 aurora · 17 rainbow
    //   ledMonochrome     true = wall renders the same shapes in black & white.
    //                     Set it EXPLICITLY on every look — looks only write the
    //                     keys they declare, so an omission silently inherits the
    //                     previous cue's colour state.
    //   ledWallActive     false = wall completely dark. Deliberately used as a
    //                     composition tool, not just an off switch: the wall is
    //                     the brightest object in the room, so killing it is the
    //                     only way beams, haze and mirror ball become the subject.
    //   goboPatternIndex  0 circle · 1 star · 2 triangles · 3 squares · 4 rings
    //                     5 spiral · 6 dots · 7 slats · 8 cross · 9 flower
    //   [a, b]            ramps linearly across the cue's whole bar span
    // =========================================================================
    static _buildLooks() {
        return {

            // ---------------------------------------------------------------
            // I. ARRIVAL — the room before it commits. Almost nothing on.
            // ---------------------------------------------------------------

            // Pure negative space. One rotating mirror ball in heavy haze and a
            // slow breathing wall, held in black and white so the room has form
            // but no colour to commit to yet. This look is the reason everything
            // after it has impact; an audience cannot perceive brightness without
            // a floor — nor colour without an absence of it.
            deepBlue: {
                intensity: 0.42, punch: 0.10, palette: 'analogous',
                lightsActive: false, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: true, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 5, ledWallSpeed: 0.35,
                mirrorBallSpeed: 0.30, fogIntensity: 1.5,
                goboEnabled: false
            },

            // First statement of intent: heads lock down onto the floor and hold.
            // Static beams in haze — pure architecture, no movement to distract,
            // and a white tunnel behind them so the wall reads as structure
            // rather than as a second light source competing with the beams.
            firstLight: {
                intensity: 0.60, punch: 0.18, palette: 'analogous',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: true, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 11, ledWallSpeed: 0.5,
                spotlightPattern: 1, spotlightMode: 3, spotlightSpeed: 0.35,
                goboEnabled: true, goboPatternIndex: 4, goboRotationSpeed: 0.18,
                mirrorBallSpeed: 0.4, fogIntensity: 1.3
            },

            // Wall killed outright. Mirror ball and one slow gobo pool in deep
            // haze, with nothing lit behind them. Dropped into ARRIVAL and again
            // into AFTERGLOW as a reset — after a few bars of true darkness the
            // wall's return reads as an event rather than as wallpaper.
            eclipse: {
                intensity: 0.38, punch: 0.12, palette: 'analogous',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: true, smokeActive: true,
                ledWallActive: false, ledMonochrome: false,
                spotlightPattern: 1, spotlightMode: 3, spotlightSpeed: 0.25,
                goboEnabled: true, goboPatternIndex: 0, goboRotationSpeed: 0.10,
                mirrorBallSpeed: 0.45, fogIntensity: 1.7
            },

            // ---------------------------------------------------------------
            // II. PULSE — the groove. Sustained, hypnotic, never peaking.
            // ---------------------------------------------------------------

            // The workhorse. Slow wave chase with a spiral gobo turning against
            // the sweep direction, so the floor texture and the beams disagree —
            // that counter-motion is what stops a wave chase looking mechanical.
            theWave: {
                intensity: 0.82, punch: 0.22, palette: 'analogous',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 0, ledWallSpeed: 0.8,
                spotlightPattern: 0, spotlightMode: 1, spotlightSpeed: [0.55, 0.85],
                goboEnabled: true, goboPatternIndex: 5, goboRotationSpeed: -0.35,
                fogIntensity: 1.0
            },

            // Lasers take the room. Gobos off (the rule) and heads drop to a slow
            // lock so the aerial beam work is the only thing moving. The wall goes
            // black and white here on purpose: coloured lasers over a coloured
            // wall is two hues fighting for the same eye, and both lose.
            crossfire: {
                intensity: 0.88, punch: 0.30, palette: 'complementary',
                lightsActive: true, lasersActive: true, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 13, ledWallSpeed: 1.0,
                spotlightPattern: 1, spotlightMode: 3, spotlightSpeed: 0.4,
                goboEnabled: false, laserSpeed: [0.6, 1.1],
                fogIntensity: 1.2
            },

            // Symmetry cue: heads mirror-sweep against a kaleidoscope wall. The
            // two symmetries reinforce, which reads as deliberate composition.
            sideways: {
                intensity: 0.85, punch: 0.25, palette: 'analogous',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 12, ledWallSpeed: 1.0,
                spotlightPattern: 2, spotlightMode: 1, spotlightSpeed: [0.7, 1.0],
                goboEnabled: true, goboPatternIndex: 2, goboRotationSpeed: 0.5,
                fogIntensity: 1.0
            },

            // Aerial only. Wall dark, gobos off, lasers alone in the heaviest haze
            // in the show. With no lit surface anywhere the room stops being a
            // room and becomes pure volumetric geometry — and the cue that
            // follows gets the whole wall back as a hit.
            beamsOnly: {
                intensity: 0.90, punch: 0.38, palette: 'complementary',
                lightsActive: true, lasersActive: true, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: false, ledMonochrome: false,
                spotlightPattern: 3, spotlightMode: 1, spotlightSpeed: [0.7, 1.3],
                goboEnabled: false, laserSpeed: [0.9, 1.6],
                fogIntensity: 1.8
            },

            // ---------------------------------------------------------------
            // III. ASCENT — everything accelerates. Nothing here is static.
            // ---------------------------------------------------------------

            // The climb. Pinwheel with speed nearly tripling across the cue, a
            // shockwave wall accelerating with it, and the star gobo opening out.
            // The audience should feel the room winding up without being told.
            theClimb: {
                intensity: [0.80, 1.0], punch: 0.35, palette: 'complementary',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 6, ledWallSpeed: [0.9, 1.9],
                spotlightPattern: 2, spotlightMode: 1, spotlightSpeed: [0.8, 2.0],
                goboEnabled: true, goboPatternIndex: 1, goboRotationSpeed: [0.4, 1.6],
                fogIntensity: 1.4
            },

            // Tension plateau. Heads slam to centre and stop dead while the wall
            // keeps accelerating — motion removed from the beams and pushed onto
            // the surface behind them. Stillness reads as held breath, and the
            // wall drops to black and white so the colour that returns at the
            // drop lands as a change rather than as more of the same.
            heldBreath: {
                intensity: [0.70, 0.95], punch: 0.45, palette: 'complementary',
                lightsActive: true, lasersActive: true, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 9, ledWallSpeed: [1.2, 2.0],
                spotlightPattern: 1, spotlightMode: 3, spotlightSpeed: 0.25,
                goboEnabled: false, laserSpeed: [1.0, 1.8],
                fogIntensity: 1.6
            },

            // ---------------------------------------------------------------
            // IV. IGNITION — peak. Everything, all at once, but still composed.
            // ---------------------------------------------------------------

            // The payoff. Crossed beams, strobes, lasers, triad palette. Deep
            // punch (0.55) so the whole rig is gated hard by the kick — at peak
            // the room should pump visibly rather than sit at flat maximum.
            detonation: {
                intensity: 1.0, punch: 0.55, palette: 'triad',
                lightsActive: true, lasersActive: true, strobesActive: true,
                blindersActive: true, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 17, ledWallSpeed: 2.0,
                spotlightPattern: 3, spotlightMode: 0, spotlightSpeed: 1.8,
                goboEnabled: false, laserSpeed: 1.8,
                strobeSpeed: 2.2, blinderSpeed: 1.8, fogIntensity: 1.5
            },

            // Sustain, not repeat. Strobes drop out, lasers take over alone at
            // full speed. Removing an element at peak is what buys headroom for
            // the next hit — a second detonation identical to the first is a
            // wasted one.
            laserStorm: {
                intensity: 0.96, punch: 0.40, palette: 'triad',
                lightsActive: true, lasersActive: true, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 15, ledWallSpeed: 1.8,
                spotlightPattern: 2, spotlightMode: 1, spotlightSpeed: 1.5,
                goboEnabled: false, laserSpeed: 2.0, fogIntensity: 1.5
            },

            // Second-wind hit: back to butterfly with the wall on plasma tunnel.
            afterburn: {
                intensity: 1.0, punch: 0.50, palette: 'triad',
                lightsActive: true, lasersActive: true, strobesActive: true,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 11, ledWallSpeed: 2.0,
                spotlightPattern: 3, spotlightMode: 0, spotlightSpeed: 2.0,
                goboEnabled: false, laserSpeed: 1.6,
                strobeSpeed: 1.6, fogIntensity: 1.4
            },

            // ---------------------------------------------------------------
            // V. AFTERGLOW — the comedown. Earns the next build.
            // ---------------------------------------------------------------

            // Near-total collapse. Mirror ball alone in deep haze, and the wall
            // stripped to a slow greyscale aurora. Everything the peak had —
            // beams, lasers, strobes and colour itself — is taken away at once.
            theVoid: {
                intensity: 0.30, punch: 0.08, palette: 'analogous',
                lightsActive: false, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: true, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 16, ledWallSpeed: 0.4,
                mirrorBallSpeed: 0.25, fogIntensity: 1.6, goboEnabled: false
            },

            // Slow reassembly — heads fade back in on a drifting wave, flower
            // gobo turning slowly. Sets up ARRIVAL to begin the cycle again.
            driftAway: {
                intensity: [0.35, 0.62], punch: 0.15, palette: 'analogous',
                lightsActive: true, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: true, smokeActive: true,
                ledWallActive: true, ledMonochrome: false, ledPattern: 4, ledWallSpeed: [0.4, 0.7],
                spotlightPattern: 0, spotlightMode: 1, spotlightSpeed: [0.25, 0.5],
                goboEnabled: true, goboPatternIndex: 9, goboRotationSpeed: 0.15,
                mirrorBallSpeed: 0.35, fogIntensity: 1.4
            },

            // ---------------------------------------------------------------
            // SET-PIECE LOOKS — driven bar-by-bar by the choreography below.
            // ---------------------------------------------------------------

            // Base state for THE COUNTDOWN. The set-piece escalates strobeSpeed
            // and intensity on top of this every bar. Black and white throughout:
            // a build is about escalating urgency, and stripping the colour out
            // makes the wall read as clinical countdown rather than as party.
            countdownBase: {
                intensity: 0.85, punch: 0.30, palette: 'complementary',
                lightsActive: true, lasersActive: false, strobesActive: true,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: true, ledMonochrome: true, ledPattern: 6, ledWallSpeed: 1.4,
                spotlightPattern: 1, spotlightMode: 2, spotlightSpeed: 0.3,
                goboEnabled: false, strobeSpeed: 0.6, fogIntensity: 1.7
            },

            // Total kill for CUT TO BLACK. Only the haze remains, so the room
            // keeps its volume while carrying no light at all.
            silence: {
                intensity: 0.0, punch: 0.0, palette: 'analogous',
                lightsActive: false, lasersActive: false, strobesActive: false,
                blindersActive: false, mirrorBallActive: false, smokeActive: true,
                ledWallActive: false, ledMonochrome: false, goboEnabled: false, fogIntensity: 1.8
            }
        };
    }

    // =========================================================================
    // MOVEMENTS — ordered cue lists. `bars` is musical length, so every cue's
    // duration scales automatically with the track's tempo.
    //
    // minBars stops the energy picker from abandoning a movement before its
    // internal arc has had time to read.
    //
    // Every movement except IGNITION carries at least one dark-wall cue
    // (`eclipse` / `beamsOnly`). The LED wall is the brightest thing in the room
    // and the eye goes straight to it, so a wall that is lit for the entire show
    // flattens everything else into background. The dark windows are short and
    // sit immediately before a punchIn, which turns the wall's return into a hit.
    // =========================================================================
    static _buildMovements() {
        return {
            arrival: {
                title: 'I · ARRIVAL',
                minBars: 16,
                cues: [
                    { look: 'eclipse',    bars: 4 },
                    { look: 'deepBlue',   bars: 8 },
                    { look: 'firstLight', bars: 8, punchIn: true },
                    { look: 'eclipse',    bars: 4 },
                    { look: 'firstLight', bars: 8 }
                ]
            },

            pulse: {
                title: 'II · PULSE',
                minBars: 24,
                cues: [
                    { look: 'theWave',   bars: 8 },
                    { look: 'sideways',  bars: 8, punchIn: true },
                    { look: 'theWave',   bars: 8 },
                    { look: 'crossfire', bars: 8, punchIn: true },
                    { look: 'beamsOnly', bars: 8 },
                    { look: 'sideways',  bars: 8, punchIn: true }
                ]
            },

            ascent: {
                title: 'III · ASCENT',
                minBars: 16,
                cues: [
                    { look: 'theClimb',   bars: 8 },
                    { look: 'heldBreath', bars: 8 },
                    { look: 'beamsOnly',  bars: 4 },
                    { look: 'theClimb',   bars: 8, punchIn: true }
                ]
            },

            ignition: {
                title: 'IV · IGNITION',
                minBars: 16,
                cues: [
                    { look: 'detonation', bars: 8 },
                    { look: 'laserStorm', bars: 8, punchIn: true },
                    { look: 'afterburn',  bars: 8, punchIn: true },
                    { look: 'laserStorm', bars: 8 }
                ]
            },

            afterglow: {
                title: 'V · AFTERGLOW',
                minBars: 12,
                cues: [
                    { look: 'theVoid',   bars: 8 },
                    { look: 'eclipse',   bars: 4 },
                    { look: 'driftAway', bars: 12 }
                ]
            }
        };
    }

    // =========================================================================
    // SET-PIECES — bar-counted choreography. These are the moments an audience
    // actually remembers, and the only places the show overrides its own cues.
    // =========================================================================
    static _buildSetPieces() {
        return {

            /**
             * THE COUNTDOWN — 4 bars of escalation into 1 beat of nothing.
             *
             * The oldest and most reliable move in the book. The strobe rate
             * doubles every bar (0.6 → 1.2 → 2.4 → 4.8), the heads sit locked on
             * the crowd, the shockwave wall accelerates, and master intensity
             * climbs the whole way. Then, on the very last beat, EVERYTHING cuts
             * to black for a single beat.
             *
             * That one beat of silence is the entire trick. The drop that follows
             * is no brighter than the bar before it — it only feels enormous
             * because the eye was given nothing to hold immediately beforehand.
             *
             * Under photosensitive safe mode the strobe ladder is suppressed and
             * the same shape is carried by intensity and speed alone.
             */
            countdown: {
                title: 'THE COUNTDOWN',
                bars: 4,
                onStart(show) {
                    show._applyLook(show.looks.countdownBase);
                    show._cue = { look: 'countdownBase', bars: 4 };
                    show._cueStartBar = show._barCounter;
                },
                onBar(show, bar) {
                    const club = show.club;
                    // Strobe rate doubles each bar — the audible "ticking clock".
                    if (!club.photosensitiveSafeMode) {
                        club.strobesActive = true;
                        club.strobeSpeed = 0.6 * Math.pow(2, bar);
                    }
                    // The wall winds up alongside it.
                    club.ledWallSpeed = 1.4 + bar * 0.4;
                    club.spotlightSpeed = 0.3 + bar * 0.25;
                    club.fogIntensity = Math.min(2.0, 1.7 + bar * 0.1);

                    // Final bar: bring the lasers in so the drop has somewhere
                    // left to go, and arm the blackout for the last beat.
                    if (bar === show.setPieces.countdown.bars - 1) {
                        club.lasersActive = true;
                        club.laserSpeed = 2.0;
                    }
                },
                onFrame(show, target) {
                    const bar = show._setPieceBar;
                    const beat = show._beatInBar;
                    const bars = show.setPieces.countdown.bars;

                    // Rising floor across the whole piece.
                    target *= 0.80 + 0.20 * (bar / Math.max(1, bars - 1));

                    // THE CUT: last beat of the last bar — total darkness.
                    if (bar === bars - 1 && beat === ShowDirector.BEATS_PER_BAR - 1) {
                        return 0;
                    }
                    return target;
                }
            },

            /**
             * CUT TO BLACK — 2 bars of near-nothing on the way down from peak.
             *
             * Coming out of IGNITION straight into a soft look wastes the peak.
             * Killing the rig outright for two bars, leaving only haze hanging in
             * the air, punctuates the end of the section and resets the eye so the
             * comedown reads as a deliberate choice rather than fatigue.
             */
            cutToBlack: {
                title: 'CUT TO BLACK',
                bars: 2,
                onStart(show) {
                    show._applyLook(show.looks.silence);
                    show._cue = { look: 'silence', bars: 2 };
                    show._cueStartBar = show._barCounter;
                    show._blackoutBeats = 4;   // One full bar of hard zero.
                },
                onBar(show, bar) {
                    // Second bar: let the mirror ball creep back in, alone, so the
                    // room re-forms out of the dark rather than snapping back.
                    if (bar === 1) {
                        show.club.mirrorBallActive = true;
                        show.club.mirrorBallSpeed = 0.22;
                        show.club.ledWallActive = true;
                        show.club.ledPattern = 16;   // aurora
                        show.club.ledWallSpeed = 0.3;
                    }
                },
                onFrame(show, target) {
                    // Slow bloom back up through the second bar only.
                    return show._setPieceBar === 0 ? 0 : target * 0.35;
                }
            }
        };
    }
}

// Classic script: no module system in this project, so publish onto window.
window.ShowDirector = ShowDirector;
