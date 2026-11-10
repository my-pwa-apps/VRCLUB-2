'use strict';
// The crowd's choreographer: which move each dancer does, and keeping it on the beat. Pure (no Babylon): the club feeds
// it the music and the clip's current position, and applies what it returns to the dancer's animation groups
// (VRClubAudioCrowd._updateCrowdDance).
//
// The moves are the Quaternius people's clips: `Dance_Loop` (retargeted) and the procedural grooves authored by
// scripts/build-crowd-glbs.mjs. Every one is a loop of a whole number of beats at 120 BPM, so playing it at bpm / 120
// keeps one beat of the clip to one beat of the music, and a small speed correction holds its phase on the club's beat
// grid (VJDirector's beat counter), so knees bend and hands clap ON the beat, whatever the tempo.
//
// Choosing: each dancer has their own taste (some love the twist, some never clap), changes move only on bar lines
// after 4-8 bars, follows the energy of the music, claps more through a build, throws their hands up on a drop, and
// now and then takes a move at half time. When the kick goes but the rest of the rhythm carries on (hats, a snare or
// clap, a synth arpeggio: VJDirector._detectRhythm), they stay on the beat with the lighter moves, the sway among them.
// Only when there is no pulse at all (silence, a pad that only swells) do they leave the grid and sway freely until
// it returns. Nobody on the dance floor becomes a motionless background prop.

class CrowdDance {
    /**
     * beats: loop length; anchor: where in the clip (in beats) a beat lands; weight: how often it is picked;
     * energy: the music energy it suits (it is picked less below that); build/drop: extra weight in a build / on a drop.
     * `free` moves are what dancers do without a beat: they run at their own slow pace, not on a grid.
     */
    static MOVES = Object.freeze({
        Dance_Loop: Object.freeze({ beats: 2, anchor: 0.5, weight: 1.6, energy: 0.35 }),
        Groove_Bounce: Object.freeze({ beats: 8, anchor: 0, weight: 2.0, energy: 0.15 }),
        Groove_SideTap: Object.freeze({ beats: 8, anchor: 0, weight: 1.4, energy: 0.3 }),
        Groove_Clap: Object.freeze({ beats: 2, anchor: 0, halfAnchor: -0.5, weight: 0.8, energy: 0.35, build: 5, drop: 0.5 }),
        // The same clap held above the head.
        Groove_ClapUp: Object.freeze({ beats: 2, anchor: 0, halfAnchor: -0.5, weight: 0.45, energy: 0.45, build: 4, drop: 0.7 }),
        Groove_Pump: Object.freeze({ beats: 8, anchor: 0, weight: 0.7, energy: 0.6, build: 1.5, drop: 4 }),
        Groove_Twist: Object.freeze({ beats: 4, anchor: 0, weight: 1.0, energy: 0.4 }),
        Groove_HandsUp: Object.freeze({ beats: 4, anchor: 0, weight: 0.35, energy: 0.75, build: 1.5, drop: 6 }),
        Groove_Sway: Object.freeze({ beats: 4, anchor: 0, weight: 0.5, energy: 0, quiet: 4, free: true, rhythm: 2.5 }),
        // What dancers do when there is no beat at all: a slow sway for most, arms spread wide or up high for a few.
        // They run at their own slow pace (`freeSpeed`) and are never picked while there is a pulse.
        Groove_ArmsWide: Object.freeze({ beats: 8, anchor: 0, weight: 0, energy: 0, free: true, freeWeight: 1.0, freeSpeed: 0.45 }),
        Groove_ArmsUp: Object.freeze({ beats: 8, anchor: 0, weight: 0, energy: 0, free: true, freeWeight: 0.8, freeSpeed: 0.45 })
    });

    /**
     * What the dancers do when the kick is gone but the music still has a pulse (hats, a snare, an arpeggio): stay on the
     * beat with the lighter moves. The sway joins them, on the grid rather than free; the peak moves sit it out.
     */
    static get RHYTHM_WEIGHTS() {
        return this._rhythmWeights || (this._rhythmWeights = Object.freeze({
            Groove_Sway: 2.5, Groove_Bounce: 1.4, Groove_SideTap: 1.4, Groove_Clap: 1.3, Groove_ClapUp: 0.4, Groove_Twist: 1.0,
            Dance_Loop: 0.7, Groove_Pump: 0.15, Groove_HandsUp: 0, Groove_ArmsWide: 0, Groove_ArmsUp: 0
        }));
    }

    /** The tempo the clips are authored at. */
    static CLIP_BPM = 120;
    /** Free-running pace of the quiet sway (about one sway every four seconds). */
    static FREE_SPEED = 0.5;
    /** The plain sway's share among the free moves: most people just sway; a few open their arms or reach up. */
    static FREE_SWAY_WEIGHT = 3;
    /** How long somebody keeps a free move before they may choose another (seconds). */
    static FREE_HOLD = Object.freeze([18, 40]);

    constructor({ rng = Math.random } = {}) {
        this.rng = rng;
    }

    /** A new dancer who can do the moves in `available` (clip names). */
    createDancer(available) {
        const moves = Object.keys(CrowdDance.MOVES).filter(name => available.includes(name));
        const taste = {};
        for (const name of moves) taste[name] = 0.4 + 1.4 * this.rng();
        return {
            moves, taste,
            move: null, half: false, barsLeft: 0, lastBar: null,
            hadBeat: null, dropSeen: false,
            // Stable personality knobs: authored moves still own the body, but not
            // everybody answers a beat or a drop with the same size reaction.
            response: this.rng(),
            dropResponse: this.rng(),
            // Nobody is exactly on the grid: each person sits a hair ahead of or behind it (-0.02 to +0.06 of a beat, up to
            // about 30 ms at 120 BPM, mostly behind, like people following a kick they have to hear first).
            lag: -0.02 + 0.08 * this.rng(),
            // Which whole beat of its phrase the current move starts on, so a floor doing the same eight-beat move is not
            // all stepping the same way at the same moment (the beat itself stays on the beat).
            phaseOffset: 0,
            // How long this person takes to follow a change in the pulse (seconds): some pick it up straight away.
            reactDelay: 0.1 + 0.9 * this.rng()
        };
    }

    /**
     * Per frame. `music`: { beatPresent (the kick), rhythm (no kick, but the rest of the rhythm has a pulse), beat
     * (continuous beat position on the club's grid), bpm, energy 0..1, build, drop (true on the frame a drop lands),
     * fallback (confirmed unanalysable playback, using an independent animation clock rather than detected beats) }.
     * `frac`: where the dancer's clip is now (0..1 of its loop), or null when it is not playing. Returns a reused
     * decision: { move, switched, speed, frac (the target, set when switched or when the clip must jump), snap }.
     */
    step(dancer, music, frac, out = {}) {
        out.switched = false;
        out.snap = false;
        out.target = undefined;
        const bar = Math.floor(music.beat / 4);
        // Keep confirmed unanalysable playback distinct from a detected musical pulse.
        let pulse = music.beatPresent ? true : music.rhythm ? 'rhythm' : music.fallback ? 'fallback' : false;
        // When the pulse changes (the kick drops out, or comes back) nobody on the floor notices on the same frame: each
        // person takes their own moment (`reactDelay`) to follow, carrying on as they were until then. A whole crowd
        // changing move at once read as a reset, and started a dozen clips in one frame.
        if (music.time !== undefined && dancer.hadBeat !== null && dancer.move !== null) {
            if (pulse === dancer.hadBeat) {
                dancer.shiftTo = undefined;
            } else {
                if (dancer.shiftTo !== pulse) {
                    dancer.shiftTo = pulse;
                    dancer.shiftAt = music.time + (dancer.reactDelay || 0);
                }
                if (music.time < dancer.shiftAt && !music.drop) pulse = dancer.hadBeat;
                else dancer.shiftTo = undefined;
            }
        }

        if (!pulse) {
            // No beat at all: nobody is on the grid. Most just sway, a few open their arms wide or reach up high, and
            // everybody may change their mind after a long while (`music.time`, in seconds, when the club supplies it).
            const entering = dancer.hadBeat !== false;
            const current = dancer.move && CrowdDance.MOVES[dancer.move];
            const due = music.time !== undefined && dancer.freeUntil !== undefined && music.time >= dancer.freeUntil;
            if (entering || due || !current || !current.free) {
                const move = this._pickFree(dancer);
                if (music.time !== undefined) {
                    const [lo, hi] = CrowdDance.FREE_HOLD;
                    dancer.freeUntil = music.time + lo + (hi - lo) * this.rng();
                }
                if (dancer.move !== move || entering) {
                    dancer.move = move;
                    dancer.half = false;
                    out.switched = true;
                    out.frac = this.rng();
                }
            }
            dancer.hadBeat = false;
            dancer.lastBar = bar;
            out.move = dancer.move;
            out.speed = CrowdDance.MOVES[dancer.move].freeSpeed || CrowdDance.FREE_SPEED;
            return out;
        }

        // A pulse is here. When it changes (the kick goes and the hats carry on, or it comes back), or on a drop:
        // change now (the phase lock lands it on the beat). Otherwise only on a bar line, once this move has had its bars.
        let pick = null;
        if (dancer.hadBeat !== pulse || dancer.move === null) pick = 'any';
        if (music.drop) pick = 'drop';
        if (dancer.lastBar !== null && bar !== dancer.lastBar) {
            dancer.barsLeft -= bar - dancer.lastBar;
            if (dancer.barsLeft <= 0 && !pick) pick = 'any';
        }
        dancer.lastBar = bar;
        dancer.hadBeat = pulse;
        if (pick) {
            const move = this._pick(dancer, music, pick === 'drop', pulse === 'rhythm');
            const meta = CrowdDance.MOVES[move];
            const halfChance = pulse === 'rhythm' ? 0.4
                : music.energy < 0.3 ? 0.28 + 0.14 * (1 - dancer.response)
                    : 0.08 + 0.14 * (1 - dancer.response);
            dancer.half = (pulse === 'rhythm' || move !== 'Groove_Sway') && this.rng() < halfChance && meta.beats <= 8;
            dancer.barsLeft = 4 + Math.floor(this.rng() * 5);
            out.switched = move !== dancer.move || pick === 'drop';
            if (out.switched) dancer.phaseOffset = Math.floor(this.rng() * meta.beats);
            dancer.move = move;
        }

        const meta = CrowdDance.MOVES[dancer.move];
        const k = dancer.half ? 0.5 : 1;
        const base = Math.max(40, music.bpm || 120) / CrowdDance.CLIP_BPM * k;
        // At half time a clap lands on the backbeat (2 and 4), not on 1 and 3.
        const anchor = dancer.half && meta.halfAnchor !== undefined ? meta.halfAnchor : meta.anchor;
        const target = CrowdDance.wrap01(((music.beat - (dancer.lag || 0)) * k + anchor + (dancer.phaseOffset || 0)) / meta.beats);
        out.move = dancer.move;
        out.target = target;
        if (out.switched || frac === null || frac === undefined) {
            out.frac = target;
            out.speed = base;
            return out;
        }
        // Phase lock: the error in beats of the music, closed over about a beat. A bigger one (a tempo jump) is caught up
        // faster still, and only nearly a full beat out is a jump, because a jump is a visible pop in the pose.
        const errorBeats = CrowdDance.wrapHalf(target - frac) * meta.beats / k;
        if (Math.abs(errorBeats) > 0.9) {
            out.snap = true;
            out.frac = target;
            out.speed = base;
            return out;
        }
        out.speed = base * (1 + Math.max(-0.6, Math.min(0.6, errorBeats * 0.8)));
        return out;
    }

    /**
     * A move for a stretch with no beat: the plain sway for most, arms wide or up high for others. Each dancer has stable
     * leanings (`taste`), so the same people tend to be the ones who reach up.
     */
    _pickFree(dancer) {
        const sway = dancer.moves.includes('Groove_Sway') ? 'Groove_Sway' : null;
        const table = this._freeTable || (this._freeTable = []);
        table.length = 0;
        let total = 0;
        for (const name of dancer.moves) {
            const meta = CrowdDance.MOVES[name];
            if (!meta.free) continue;
            let w = name === 'Groove_Sway' ? CrowdDance.FREE_SWAY_WEIGHT : (meta.freeWeight || 0);
            if (w <= 0) continue;
            w *= dancer.taste[name] == null ? 1 : dancer.taste[name];
            if (name === dancer.move) w *= 0.35;       // prefer a change when it is time for one
            total += w;
            table.push(name, w);
        }
        if (total <= 0) return sway || dancer.moves[0];
        let r = this.rng() * total;
        for (let i = 0; i < table.length; i += 2) {
            r -= table[i + 1];
            if (r <= 0) return table[i];
        }
        return table[table.length - 2];
    }

    _pick(dancer, music, drop, rhythm = false) {
        const energy = Math.max(0, Math.min(1, music.energy == null ? 0.5 : music.energy));
        const table = this._table || (this._table = []);
        table.length = 0;
        let total = 0;
        for (const name of dancer.moves) {
            const meta = CrowdDance.MOVES[name];
            // Free grooves belong only to a genuinely kick-less passage. Once the beat is trusted, every pick must
            // visibly dance on that grid; otherwise a dancer can spend another 4-8 bars looking idle beside people
            // who heard the same kick. With only the rest of the rhythm, the sway is one of the on-the-beat moves.
            if (meta.free && !rhythm) continue;
            let w = meta.weight * dancer.taste[name];
            if (rhythm) w *= CrowdDance.RHYTHM_WEIGHTS[name] ?? 1;
            if (!rhythm) {
                const response = dancer.response == null ? 0.5 : dancer.response;
                if (name === 'Groove_Bounce' || name === 'Groove_SideTap') w *= 1.35 - 0.55 * response;
                if (name === 'Groove_Pump' || name === 'Groove_Twist') w *= 0.65 + 0.9 * response;
            }
            // Below the energy a move suits it is picked less; a quiet track favours the sway.
            w *= Math.max(0.1, 1 - 2.5 * Math.max(0, meta.energy - energy));
            if (meta.quiet && !rhythm) w *= energy < 0.3 ? meta.quiet : 0.3;
            if (music.build && meta.build) w *= meta.build;
            if (drop) {
                const response = dancer.dropResponse == null ? 0.5 : dancer.dropResponse;
                w *= meta.drop || 0.3;
                if (name === 'Groove_HandsUp') w *= 0.25 + 3.5 * response;
                else if (name === 'Groove_Pump') w *= 1.8 - 0.8 * response;
                else if (name === 'Groove_Clap' || name === 'Groove_Bounce') w *= 1.7 - response;
            }
            if (name === dancer.move) w *= 0.3;       // prefer a change
            if (w <= 0) continue;
            total += w;
            table.push(name, w);
        }
        if (total <= 0) return dancer.moves.find(name => !CrowdDance.MOVES[name].free) || dancer.moves[0];
        let r = this.rng() * total;
        for (let i = 0; i < table.length; i += 2) {
            r -= table[i + 1];
            if (r <= 0) return table[i];
        }
        return table[table.length - 2];
    }

    static wrap01(x) { return x - Math.floor(x); }
    static wrapHalf(x) { return x - Math.round(x); }
}

window.CrowdDance = CrowdDance;
