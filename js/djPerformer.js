'use strict';
/**
 * DJPerformer - what the DJ behind the decks is doing, frame by frame.
 *
 * The DJ characters carry one idle clip, so a clip could only ever make them stand there. Instead the DJ is an
 * AvatarRig (the same procedural skeleton driver as the player's own body) and this class writes its pose: where the
 * hands are, where the head looks, how far the body leans, how the knees bounce. It is pure behaviour, with no Babylon
 * in it, so it is unit-tested on its own.
 *
 * The performance is a set of ACTIVITIES, chosen on bar lines (never mid-bar), each held for a few bars:
 *   mix      leaning over the decks: one hand riding a jog wheel, the other moving between mixer knobs and twisting
 *   cue      one hand holding a headphone cup to the ear, the other on the mixer: listening to the next track
 *   tweak    both hands on the mixer's knobs, twisting harder the more energy the music has (a build)
 *   crowd    looking up and out over the floor, scanning it, hands resting on the console; a fist pumps when it is loud
 *   handsUp  both hands in the air, pumping on the beat: when a drop lands
 *   wave     a hand raised and waving toward a visitor who has just walked up to the booth, head turned to them
 * Throughout, the head nods and the knees bounce on the beat, deeper as the music gets more energetic. Without music
 * it keeps a slow internal tempo and a calm repertoire (no hands up, small nods).
 *
 * Every target is eased (a hand travels between places in a few tenths of a second), so changes read as movement,
 * not as snaps. Nothing is allocated per frame: the pose object, hand objects and scratch numbers are kept.
 */
class DJPerformer {
    /** Bars each activity lasts, and its base weight when one is picked. */
    static ACTIVITIES = Object.freeze({
        mix: { bars: 4, weight: 3 },
        cue: { bars: 4, weight: 2 },
        tweak: { bars: 2, weight: 1 },
        crowd: { bars: 2, weight: 1.5 },
        handsUp: { bars: 2, weight: 0 },
        wave: { bars: 2, weight: 0 }
    });

    /** A visitor is waved at once, then not again for this long (seconds). */
    static WAVE_COOLDOWN = 45;

    /**
     * @param {{x:number, z:number, groundY:number, eyeHeight:number,
     *          desk:{cx:number, near:number, far:number, top:number, halfWidth:number}, rng?:() => number}} options
     *   x/z: where the DJ stands (eye position over the floor); desk: the controller on the table, in world units, with
     *   `near` its edge on the DJ's side and `far` the crowd side (the DJ faces +z, toward the crowd).
     */
    constructor({ x, z, groundY, eyeHeight, desk, rng = Math.random }) {
        this.home = { x, z, groundY };
        this.eye = eyeHeight;
        this.desk = desk;
        this.rng = rng;
        this.activity = 'mix';
        this.barsLeft = DJPerformer.ACTIVITIES.mix.bars;
        this._lastBar = null;
        this.time = 0;
        this._clockBeats = 0;          // the internal tempo when there is no music
        this._knob = { left: 0, right: 0, at: -1 };
        this._waved = new Map();       // visitor id -> time of the last wave
        this._visitor = { x: 0, z: 0, id: null }; // locked target while waving
        this._wasInZone = new Map();
        // Eased state: hand positions (and their facing), head angles, lean, bounce.
        const hand = () => ({ x: 0, y: 0, z: 0, fx: 0, fy: -0.5, fz: 0.86, ux: 1, uy: 0, uz: 0 });
        this.left = hand();
        this.right = hand();
        this._goalL = hand();
        this._goalR = hand();
        this.headYaw = 0;
        this.headPitch = -0.4;
        this.lean = 0.25;
        this._started = false;
        this.pose = { x, z, groundY, eyeY: groundY + eyeHeight, headYaw: 0, headPitch: -0.4, lean: 0.25, left: this.left, right: this.right };
    }

    // ───────────────────────── choosing what to do ─────────────────────────

    _pick(music) {
        const energy = music.hasAudio ? music.energy : 0.3;
        const weights = DJPerformer.ACTIVITIES;
        let total = 0;
        const table = this._table || (this._table = []);
        table.length = 0;
        for (const name of ['mix', 'cue', 'tweak', 'crowd']) {
            let w = weights[name].weight;
            if (name === 'tweak') w *= music.hasAudio ? 0.5 + energy * 1.5 : 0.3;   // builds are knob-twisting time
            if (name === 'crowd') w *= 0.7 + energy;                               // loud: look at the people more
            if (name === this.activity) w *= 0.35;                                 // prefer a change
            total += w;
            table.push(name, w);
        }
        let r = this.rng() * total;
        for (let i = 0; i < table.length; i += 2) {
            r -= table[i + 1];
            if (r <= 0) return table[i];
        }
        return 'mix';
    }

    _begin(name, bars) {
        this.activity = name;
        this.barsLeft = bars || DJPerformer.ACTIVITIES[name].bars;
    }

    _inVisitorZone(v) {
        return Math.abs(v.x - this.home.x) < 5 && v.z > this.home.z + 1.4 && v.z < this.home.z + 8;
    }

    /** Someone has just walked up to the front of the booth: wave at the nearest eligible arrival. */
    _noticeVisitors(visitors) {
        if (!visitors) return null;
        let best = null, bestScore = Infinity;
        for (let i = 0; i < visitors.length; i++) {
            const v = visitors[i];
            const inZone = this._inVisitorZone(v);
            const was = this._wasInZone.get(v.id) || false;
            this._wasInZone.set(v.id, inZone);
            if (!inZone || was) continue;
            const last = this._waved.get(v.id);
            if (last !== undefined && this.time - last < DJPerformer.WAVE_COOLDOWN) continue;
            const dx = v.x - this.home.x, dz = v.z - this.home.z;
            // Distance is primary; the slight centre-line preference breaks near-ties
            // in favour of the person most visibly addressing the booth.
            const score = dx * dx + dz * dz + Math.abs(dx) * 0.15;
            if (score < bestScore) { best = v; bestScore = score; }
        }
        return best;
    }

    /** Keep looking at the chosen visitor for the whole wave instead of flicking to a later arrival. */
    _trackVisitor(visitors) {
        if (!visitors || this._visitor.id === null) return;
        for (let i = 0; i < visitors.length; i++) {
            const v = visitors[i];
            if (v.id !== this._visitor.id) continue;
            this._visitor.x = v.x;
            this._visitor.z = v.z;
            return;
        }
    }

    // ───────────────────────── per frame ─────────────────────────

    /**
     * @param {number} dt seconds
     * @param {{hasAudio:boolean, beatPhase:number, bar:number, energy:number, drop:boolean, bpm:number}} music
     *   beatPhase 0..1 inside the beat (0 = on the beat), bar: a counter that changes on each bar line, energy 0..1,
     *   drop: true on the frame a drop lands.
     * @param {Array<{x:number, z:number, id:string}>} [visitors] people on the floor the DJ could notice
     * @returns {object} the AvatarRig pose (the same object every frame)
     */
    update(dt, music, visitors) {
        dt = Math.min(0.1, Math.max(0, dt || 0));
        this.time += dt;
        const audio = !!music.hasAudio;
        const energy = audio ? Math.max(0, Math.min(1, music.energy || 0)) : 0.3;

        // The beat: the club's grid when there is music, a calm 118 BPM of our own when there is not.
        let beatPhase, bar;
        if (audio && Number.isFinite(music.beatPhase)) {
            beatPhase = music.beatPhase;
            bar = music.bar;
        } else {
            this._clockBeats += dt * 118 / 60;
            beatPhase = this._clockBeats % 1;
            bar = Math.floor(this._clockBeats / 4);
        }
        const beatRate = audio && music.bpm > 40 ? music.bpm / 60 : 118 / 60;

        // Events that cut in: a drop puts the hands up; a new visitor gets a wave.
        if (audio && music.drop) this._begin('handsUp', 2);
        this._trackVisitor(visitors);
        // A wave is attention-locked. New arrivals are still recorded as being in the
        // zone, but cannot steal the DJ's gaze halfway through the gesture.
        const noticed = this._noticeVisitors(visitors);
        const visitor = this.activity !== 'handsUp' && this.activity !== 'wave' ? noticed : null;
        if (visitor) {
            this._visitor.x = visitor.x;
            this._visitor.z = visitor.z;
            this._visitor.id = visitor.id;
            this._waved.set(visitor.id, this.time);
            this._begin('wave', 2);
        }

        // Bar lines: count down, then choose the next activity.
        if (bar !== this._lastBar) {
            if (this._lastBar !== null) this.barsLeft--;
            this._lastBar = bar;
            if (this.barsLeft <= 0) {
                if (this.activity === 'wave') this._visitor.id = null;
                // Very loud music now and then gets a short hands-up of its own.
                if (audio && energy > 0.85 && this.activity !== 'handsUp' && this.rng() < 0.15) this._begin('handsUp', 1);
                else this._begin(this._pick({ hasAudio: audio, energy }));
            }
        }

        this._targets(beatPhase, beatRate, energy, audio);

        // Ease toward the goals: hands travel in a few tenths of a second, the head a little slower.
        const kh = 1 - Math.exp(-dt * (this.activity === 'handsUp' || this.activity === 'wave' ? 9 : 12));
        const ka = 1 - Math.exp(-dt * 7);
        if (!this._started) { this._started = true; DJPerformer._copyHand(this._goalL, this.left); DJPerformer._copyHand(this._goalR, this.right); }
        DJPerformer._easeHand(this.left, this._goalL, kh);
        DJPerformer._easeHand(this.right, this._goalR, kh);
        this.headYaw += (this._goalYaw - this.headYaw) * ka;
        this.headPitch += (this._goalPitch - this.headPitch) * ka;
        this.lean += (this._goalLean - this.lean) * ka;

        // On every beat: a nod (down on the beat) and a knee bounce, both deeper with energy.
        const onBeat = 0.5 + 0.5 * Math.cos(2 * Math.PI * beatPhase);       // 1 on the beat, 0 between
        const nod = (audio ? 0.05 + 0.13 * energy : 0.04) * onBeat;
        const bounce = (audio ? 0.008 + 0.028 * energy : 0.006) * onBeat;

        const p = this.pose;
        p.x = this.home.x;
        p.z = this.home.z;
        p.groundY = this.home.groundY;
        p.eyeY = this.home.groundY + this.eye - bounce;
        p.headYaw = this.headYaw;
        p.headPitch = this.headPitch - nod;
        p.lean = this.lean;
        return p;
    }

    /** Where the hands, head and spine should be for the current activity at this moment of the beat. */
    _targets(beatPhase, beatRate, energy, audio) {
        const d = this.desk, t = this.time, L = this._goalL, R = this._goalR;
        const top = d.top + 0.035;
        const depth = d.far - d.near;
        // Hand positions on the controller (the DJ faces +z, so its left is -x).
        const jogX = d.halfWidth * 0.58, jogZ = d.near + depth * 0.3;
        const mixZ = d.near + depth * 0.3;
        // Mixer knobs: a small grid in the middle; a hand moves to a new one every two beats.
        const beatIndex = Math.floor(t * beatRate / 2);
        if (beatIndex !== this._knob.at) {
            this._knob.at = beatIndex;
            this._knob.left = Math.floor(this.rng() * 6);
            this._knob.right = Math.floor(this.rng() * 6);
        }
        const palmDown = DJPerformer._palmDown;
        const twistAmp = 0.25 + 0.45 * energy;
        const TAU = 2 * Math.PI;

        let yaw = 0, pitch = -0.45, lean = 0.26;
        switch (this.activity) {
            case 'mix': {
                // Left hand rides the jog wheel in small circles, right hand works the mixer.
                const a = t * 2.2;
                L.x = d.cx - jogX + 0.018 * Math.cos(a); L.z = jogZ + 0.018 * Math.sin(a); L.y = top;
                palmDown(L, -1, 0);
                this._knobAt(this._knob.right, 1, R, mixZ, top);
                palmDown(R, 1, twistAmp * Math.sin(TAU * (t * beatRate * 0.5)));
                yaw = 0.08 * Math.sin(t * 0.5);
                pitch = -0.55; lean = 0.45;
                break;
            }
            case 'cue': {
                // Left hand holds the headphone cup to the left ear; right hand on a mixer knob.
                const headY = this.home.groundY + this.eye - 0.02;
                L.x = this.home.x - 0.11; L.y = headY; L.z = this.home.z + 0.06;
                L.fx = 0; L.fy = 1; L.fz = 0.1; L.ux = 0; L.uy = 0; L.uz = 1;
                this._knobAt(this._knob.right, 1, R, mixZ, top);
                palmDown(R, 1, twistAmp * Math.sin(TAU * (t * beatRate * 0.25)));
                yaw = -0.12; pitch = -0.38; lean = 0.36;
                break;
            }
            case 'tweak': {
                this._knobAt(this._knob.left, -1, L, mixZ, top);
                this._knobAt(this._knob.right, 1, R, mixZ, top);
                palmDown(L, -1, twistAmp * Math.sin(TAU * (t * beatRate * 0.5 + 0.25)));
                palmDown(R, 1, twistAmp * Math.sin(TAU * (t * beatRate * 0.5)));
                pitch = -0.6; lean = 0.52;
                break;
            }
            case 'crowd': {
                // Hands rest on the console's near edge; looking out over the floor, scanning it.
                L.x = d.cx - 0.22; L.z = d.near + 0.06; L.y = top;
                palmDown(L, -1, 0);
                if (audio && energy > 0.6) {
                    // A fist pumped on the beat.
                    const pump = 0.5 + 0.5 * Math.cos(2 * Math.PI * beatPhase);
                    R.x = this.home.x + 0.22; R.y = this.home.groundY + this.eye + 0.18 + 0.1 * pump; R.z = this.home.z + 0.3;
                    R.fx = 0; R.fy = 1; R.fz = 0.2; R.ux = -1; R.uy = 0; R.uz = 0;
                } else {
                    R.x = d.cx + 0.22; R.z = d.near + 0.06; R.y = top;
                    palmDown(R, 1, 0);
                }
                yaw = 0.45 * Math.sin(t * 0.35);
                pitch = 0.04; lean = 0.08;
                break;
            }
            case 'handsUp': {
                const pump = 0.5 + 0.5 * Math.cos(2 * Math.PI * beatPhase);
                const y = this.home.groundY + this.eye + 0.32 + 0.08 * pump;
                L.x = this.home.x - 0.32; L.y = y; L.z = this.home.z + 0.18;
                R.x = this.home.x + 0.32; R.y = y; R.z = this.home.z + 0.18;
                L.fx = -0.25; L.fy = 1; L.fz = 0.15; L.ux = 0; L.uy = 0; L.uz = 1;
                R.fx = 0.25; R.fy = 1; R.fz = 0.15; R.ux = 0; R.uy = 0; R.uz = 1;
                pitch = 0.18; lean = 0;
                break;
            }
            case 'wave': {
                // Head and a raised right hand toward the visitor; the hand swings side to side.
                const v = this._visitor;
                const dx = v ? v.x - this.home.x : 0, dz = v ? v.z - this.home.z : 4;
                yaw = Math.max(-0.8, Math.min(0.8, Math.atan2(dx, dz)));
                pitch = Math.max(-0.3, Math.min(0.15, Math.atan2(1.6 - (this.home.groundY + this.eye), Math.hypot(dx, dz))));
                const swing = Math.sin(t * 2 * Math.PI * 1.7);
                R.x = this.home.x + 0.3 + 0.09 * swing; R.y = this.home.groundY + this.eye + 0.22; R.z = this.home.z + 0.28;
                R.fx = 0.25 * swing; R.fy = 1; R.fz = 0.15; R.ux = 0; R.uy = 0; R.uz = 1;
                L.x = d.cx - 0.22; L.z = d.near + 0.06; L.y = top;
                palmDown(L, -1, 0);
                lean = 0.05;
                break;
            }
            default: break;
        }
        this._goalYaw = yaw;
        this._goalPitch = pitch;
        this._goalLean = lean;
    }

    /** Mixer knob `i` (a 3 x 2 grid in the middle of the controller) on the given side, into `out`. */
    _knobAt(i, side, out, mixZ, top) {
        const col = i % 3, row = (i / 3) | 0;
        out.x = this.desk.cx + side * (0.03 + col * 0.045);
        out.z = mixZ + (row - 0.5) * 0.07;
        out.y = top;
    }

    /** Palm down, fingers forward and down, the thumb toward the middle; `twist` rolls the wrist (turning a knob). */
    static _palmDown(h, side, twist) {
        h.fx = 0; h.fy = -0.55; h.fz = 0.84;
        const c = Math.cos(twist), s = Math.sin(twist);
        h.ux = -side * c; h.uy = s; h.uz = 0;
    }

    static _copyHand(from, to) {
        to.x = from.x; to.y = from.y; to.z = from.z;
        to.fx = from.fx; to.fy = from.fy; to.fz = from.fz;
        to.ux = from.ux; to.uy = from.uy; to.uz = from.uz;
    }

    static _easeHand(h, g, k) {
        h.x += (g.x - h.x) * k; h.y += (g.y - h.y) * k; h.z += (g.z - h.z) * k;
        h.fx += (g.fx - h.fx) * k; h.fy += (g.fy - h.fy) * k; h.fz += (g.fz - h.fz) * k;
        h.ux += (g.ux - h.ux) * k; h.uy += (g.uy - h.uy) * k; h.uz += (g.uz - h.uz) * k;
    }
}

window.DJPerformer = DJPerformer;
