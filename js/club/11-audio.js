'use strict';

/** Log-frequency blend. `amount` 0 returns `open`; 1 returns `closed`. No allocation. */
function _logMix(open, closed, amount) {
    const t = amount > 0 ? (amount < 1 ? amount : 1) : 0;
    if (t === 0 || !(open > 0) || !(closed > 0)) return open;
    return Math.exp(Math.log(open) + (Math.log(closed) - Math.log(open)) * t);
}

const _paZoneScratch = { cover: 0, onDeck: 0, shelf: 0 };

/**
 * Height acoustics for one ear. Missing layouts (unit stubs, an old page) leave every term at 0,
 * which is exactly the old x/z listener. The scratch object is reused every frame.
 */
function _paListenerZones(x, y, z) {
    _paZoneScratch.cover = 0;
    _paZoneScratch.onDeck = 0;
    _paZoneScratch.shelf = 0;
    const mezz = typeof window !== 'undefined' ? window.MezzanineLayout : null;
    if (mezz && mezz.paZones) mezz.paZones(x, y, z, _paZoneScratch);
    const bar = typeof window !== 'undefined' && window.VenueLayout && window.VenueLayout.bar;
    if (bar && bar.listenerShelf) _paZoneScratch.shelf = bar.listenerShelf(x, y, z);
    const restroom = typeof window !== 'undefined' && window.VenueLayout && window.VenueLayout.restroom;
    if (restroom && restroom.enclosure) {
        _paZoneScratch.cover = Math.max(_paZoneScratch.cover, restroom.enclosure(x, z));
    }
    return _paZoneScratch;
}


class VRClubAudio extends VRClubUI {

    _ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);

            // The kick band: everything under ~120 Hz, read as a waveform (RMS of ~11 ms windows) rather than as FFT
            // bins. The main analyser's 0..2.2 kHz "bass" average also carries pads, vocals and snare, and its default
            // 0.8 smoothing smears each kick over ~100 ms, which is why kicks were missed and bass notes were taken for
            // kicks. Pre-spatial, like the main analyser, so walking away from the PA does not calm the show.
            // The buffer holds ~170 ms, so every frame can read back over everything played since the last one
            // (see _readKickBand): the detector then sees the same 60 steps a second at any frame rate.
            try {
                this.kickFilter = this.audioContext.createBiquadFilter();
                this.kickFilter.type = 'lowpass';
                this.kickFilter.frequency.value = 120;
                this.kickFilter.Q.value = 0.7;
                this.kickAnalyser = this.audioContext.createAnalyser();
                this.kickAnalyser.fftSize = 8192;
                this.kickSamples = new Float32Array(this.kickAnalyser.fftSize);
                this.kickFilter.connect(this.kickAnalyser);
            } catch (err) {
                this.kickFilter = null;
                this.kickAnalyser = null;
            }

            // The rest of the rhythm: everything above the kick and the bass (snare, claps, hats, synth stabs and
            // arpeggios), read the same way, so the crowd still has a pulse when the kick drops out (VJDirector
            // ._detectRhythm). Another dead end nothing hears.
            try {
                this.rhythmFilter = this.audioContext.createBiquadFilter();
                this.rhythmFilter.type = 'highpass';
                this.rhythmFilter.frequency.value = 200;
                this.rhythmFilter.Q.value = 0.7;
                this.rhythmAnalyser = this.audioContext.createAnalyser();
                this.rhythmAnalyser.fftSize = 8192;
                this.rhythmSamples = new Float32Array(this.rhythmAnalyser.fftSize);
                this.rhythmFilter.connect(this.rhythmAnalyser);
            } catch (err) {
                this.rhythmFilter = null;
                this.rhythmAnalyser = null;
            }

            // === 3D SPATIAL AUDIO & CLUB ACOUSTICS CHAIN ===
            // Real club acoustics feature high-power directional main PA arrays
            // flown from the truss, coupled with physical sub-bass in the room
            // and distance-dependent air absorption.
            try {
                // 1. Left Flown PA Speaker Panner
                this.pannerLeft = this.audioContext.createPanner();
                this.pannerLeft.panningModel = 'HRTF';
                this.pannerLeft.distanceModel = 'inverse';
                this.pannerLeft.refDistance = 4;
                this.pannerLeft.maxDistance = 45;
                this.pannerLeft.rolloffFactor = 0.65;
                this.pannerLeft.coneInnerAngle = 120;
                this.pannerLeft.coneOuterAngle = 240;
                this.pannerLeft.coneOuterGain = 0.35;
                AudioUtils.setPannerPosition(this.pannerLeft, CLUB_POSITIONS.paSpeakers.left.x, CLUB_POSITIONS.paSpeakers.left.y, CLUB_POSITIONS.paSpeakers.left.z);
                AudioUtils.setPannerOrientation(this.pannerLeft, 0.2, -0.5, 1.0);

                // 2. Right Flown PA Speaker Panner
                this.pannerRight = this.audioContext.createPanner();
                this.pannerRight.panningModel = 'HRTF';
                this.pannerRight.distanceModel = 'inverse';
                this.pannerRight.refDistance = 4;
                this.pannerRight.maxDistance = 45;
                this.pannerRight.rolloffFactor = 0.65;
                this.pannerRight.coneInnerAngle = 120;
                this.pannerRight.coneOuterAngle = 240;
                this.pannerRight.coneOuterGain = 0.35;
                AudioUtils.setPannerPosition(this.pannerRight, CLUB_POSITIONS.paSpeakers.right.x, CLUB_POSITIONS.paSpeakers.right.y, CLUB_POSITIONS.paSpeakers.right.z);
                AudioUtils.setPannerOrientation(this.pannerRight, -0.2, -0.5, 1.0);

                // 2b. Nearfield DJ Booth Studio Monitors (Yamaha HS8 pair behind the mixer, aimed at the DJ)
                // The main PA arrays sit at z = -16 aimed out at the dance floor (+z), so a DJ at z = -19.2 is behind
                // their cones. Nearfield monitors at (-0.62, 1.62, -18.22) and (+0.62, 1.62, -18.22) aimed at the
                // booth operator (-z, inward) provide tight, crisp direct sound on the riser and roll off outside it.
                const monLayout = (typeof window !== 'undefined' && window.VenueLayout && window.VenueLayout.monitors) || {
                    tableY: 1.42, height: 0.3,
                    left: { x: -0.72, z: -18.22, yaw: Math.PI - 0.6 },
                    right: { x: 0.72, z: -18.22, yaw: Math.PI + 0.6 }
                };
                const monAcousticY = monLayout.tableY + monLayout.height * 0.55;
                const makeMonitorPanner = side => {
                    const p = this.audioContext.createPanner();
                    p.panningModel = 'HRTF';
                    p.distanceModel = 'inverse';
                    p.refDistance = 0.85;
                    p.maxDistance = 8;
                    p.rolloffFactor = 2.2;
                    p.coneInnerAngle = 75;
                    p.coneOuterAngle = 150;
                    p.coneOuterGain = 0.18;
                    AudioUtils.setPannerPosition(p, side.x, monAcousticY, side.z);
                    // The model faces (sin yaw, 0, cos yaw): the woofer baffle points back at the DJ behind the decks.
                    AudioUtils.setPannerOrientation(p, Math.sin(side.yaw), 0.08, Math.cos(side.yaw));
                    return p;
                };
                this.monitorPannerLeft = makeMonitorPanner(monLayout.left);
                this.monitorPannerRight = makeMonitorPanner(monLayout.right);
                this.monitorGain = this.audioContext.createGain();
                this.monitorGain.gain.value = 0.0;

                // 3. Omni-directional Sub-bass Channel (club subs hit physical low end)
                this.subFilter = this.audioContext.createBiquadFilter();
                this.subFilter.type = 'lowpass';
                this.subFilter.frequency.value = 100;
                this.subGain = this.audioContext.createGain();
                this.subGain.gain.value = 0.95;

                // 4. Warehouse Air Absorption / High Frequency Damping Filter
                // Downmix to mono before the PA/sub/room-reflection paths so a track's stereo mix
                // cannot skew the room reflections relative to the HRTF speaker panners.
                this.paMonoInput = this.audioContext.createGain();
                this.paMonoInput.channelCount = 1;
                this.paMonoInput.channelCountMode = 'explicit';
                this.airAbsorptionFilter = this.audioContext.createBiquadFilter();
                this.airAbsorptionFilter.type = 'lowpass';
                this.airAbsorptionFilter.frequency.value = 16000;

                // 5. Room Acoustics Delay / Ambience
                this.roomDelay = this.audioContext.createDelay();
                this.roomDelay.delayTime.value = 0.038; // ~38ms early reflection in 25x16m room
                this.roomDelayGain = this.audioContext.createGain();
                this.roomDelayGain.gain.value = 0.18;

                // 6. Convolution reverb — the actual room tail.
                // A delay tap gives one echo; a real hall gives a dense decaying cloud.
                // The IR is synthesised (see _createRoomImpulseResponse) so no asset fetch.
                this.roomConvolver = this.audioContext.createConvolver();
                this.roomConvolver.buffer = this._createRoomImpulseResponse();
                // Reverb send is driven per-frame by listener distance in
                // updateSpatialAudioListener(): dry at the speakers, wet at the back.
                this.reverbSend = this.audioContext.createGain();
                this.reverbSend.gain.value = 0.12;
                this.reverbReturn = this.audioContext.createGain();
                this.reverbReturn.gain.value = 0.9;

                // 7. Occlusion filter — walking out of the room muffles the PA. Two stages in series: indoors only
                // the first works (the corridor's single pole); on the street both close to a bass-only 24 dB/oct.
                this.occlusionFilter = this.audioContext.createBiquadFilter();
                this.occlusionFilter.type = 'lowpass';
                this.occlusionFilter.frequency.value = 22050;
                this.occlusionFilter2 = this.audioContext.createBiquadFilter();
                this.occlusionFilter2.type = 'lowpass';
                this.occlusionFilter2.frequency.value = 22050;

                // === CLUB MASTERING CHAIN ===
                // Real club PAs run a hard limiter + master gain so the room stays loud
                // without painful peaks. Routing through a DynamicsCompressor
                // gives that "wall of sound" feel and protects the user's hearing.
                this.audioCompressor = this.audioContext.createDynamicsCompressor();
                this.audioCompressor.threshold.value = -18;   // dB
                this.audioCompressor.knee.value = 24;
                this.audioCompressor.ratio.value = 6;         // Glue, not crush
                this.audioCompressor.attack.value = 0.003;
                this.audioCompressor.release.value = 0.18;

                this.audioMasterGain = this.audioContext.createGain();
                this.audioMasterGain.gain.value = 1.15;       // Slight push for "loud"

                // Voice ducking: the music dips while people talk (see setVoiceDuck). Its own node, after the
                // compressor (which would otherwise make up the lost level) and apart from the master gain (which the
                // room-acoustics model rewrites every frame). The analyser tap is upstream, so the show still hears
                // the full track and the lights do not calm down while you chat.
                this.voiceDuckGain = this.audioContext.createGain();
                this.voiceDuckGain.gain.value = this._voiceDucked ? VRClubAudioCrowd.VOICE_DUCK_LEVEL : 1;
                this._createDJEffects();

                // Reverb return folds back into the mastering bus.
                this.roomConvolver.connect(this.reverbReturn);
                this.reverbSend.connect(this.roomConvolver);
                this.reverbReturn.connect(this.audioCompressor);

                // Connect mastering output to destination
                this.audioCompressor.connect(this.voiceDuckGain);
                this.voiceDuckGain.connect(this.audioMasterGain);
                this.audioMasterGain.connect(this.audioContext.destination);
            } catch (err) {
                // Graceful fallback if spatial nodes or compressor are unavailable
                log.warn('🎚️ Spatial acoustics chain unavailable, using direct routing:', err);
                this.audioAnalyser.connect(this.audioContext.destination);
            }

            log.info('🎚️ Audio context initialized (with 3D spatial acoustics & mastering chain)');
            if (this.recordDiagnostic) {
                this.recordDiagnostic('audio', 'AudioContext initialized with 3D spatialization');
            }
            this._startCrowdAmbience();
        }
        // Resume if suspended (browser autoplay policy). Awaited via .catch() so
        // we surface failures instead of silently leaving the context suspended.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => log.warn('🎚️ AudioContext resume failed:', err));
        }
        return this.audioContext;
    }

    /**
     * Synthesise a concrete-warehouse impulse response.
     *
     * Shipping a real IR .wav would be another ~200 KB download on the critical path,
     * and the room is a simple box, so the response is generated instead: a set of
     * discrete early reflections (parallel walls at 25 m x 16 m x 10 m) layered over an
     * exponentially decaying noise tail with the high end rolled off, which is what
     * makes a real room sound like concrete rather than like a plate.
     */
    _createRoomImpulseResponse() {
        const ctx = this.audioContext;
        const rate = ctx.sampleRate;
        const seconds = 1.9;                 // RT60 of a hard-surfaced small warehouse
        const length = Math.floor(rate * seconds);
        const ir = ctx.createBuffer(2, length, rate);
        const SPEED_OF_SOUND = 343;          // m/s

        // First-order reflection path lengths from the dance floor, in metres.
        const earlyPaths = [8.5, 11.2, 14.6, 17.0, 21.4, 26.8];

        for (let channel = 0; channel < 2; channel++) {
            const data = ir.getChannelData(channel);
            let lowpassState = 0;

            for (let i = 0; i < length; i++) {
                const t = i / length;
                // Concrete absorbs slowly, so the tail is long and only gently curved.
                const decay = Math.pow(1 - t, 2.4);
                const noise = Math.random() * 2 - 1;
                // One-pole lowpass: high frequencies die first in a real room.
                lowpassState += (noise - lowpassState) * 0.32;
                data[i] = lowpassState * decay * 0.55;
            }

            // Stamp the early reflections on top; a small per-channel offset keeps the
            // stereo image wide instead of collapsing to the centre.
            for (let p = 0; p < earlyPaths.length; p++) {
                const skew = channel === 0 ? 1 : 1.04;
                const index = Math.floor((earlyPaths[p] * skew / SPEED_OF_SOUND) * rate);
                if (index >= length) continue;
                data[index] += (0.62 - p * 0.08) * (channel === 0 ? 1 : -1);
            }
        }

        return ir;
    }

    static DJ_EFFECT_DEFAULTS = Object.freeze({
        lowpass: 0, highpass: 0, echo: 0, flanger: 0, reverb: 0,
        phaser: 0, sweep: 0, gater: 0,
        channel: 1
    });

    _djEffectsState() {
        return this._djEffects || (this._djEffects = { ...VRClubAudioCrowd.DJ_EFFECT_DEFAULTS });
    }

    djEffectsSnapshot() {
        return { ...this._djEffectsState() };
    }

    _applySharedDJEffects(effects) {
        if (!effects || typeof effects !== 'object' || Array.isArray(effects)) return;
        const state = this._djEffectsState();
        let changed = false;
        for (const name of Object.keys(VRClubAudioCrowd.DJ_EFFECT_DEFAULTS)) {
            const value = effects[name];
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;
            const next = Math.min(1, Math.max(0, value));
            if (state[name] === next) continue;
            state[name] = next;
            changed = true;
        }
        if (changed) this._writeDJEffects();
    }

    _createDJEffects() {
        const ctx = this.audioContext;
        try {
            const input = ctx.createGain();
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = 'lowpass';
            lowpass.Q.value = 0.7;
            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.Q.value = 0.7;
            // The gater sits in series after the filters: it chops the signal every other send listens to.
            const gate = ctx.createGain();
            const mix = ctx.createGain();
            const echoDelay = ctx.createDelay(1);
            echoDelay.delayTime.value = 0.375;
            const echoFeedback = ctx.createGain();
            const echoWet = ctx.createGain();
            const flangerDelay = ctx.createDelay(0.02);
            flangerDelay.delayTime.value = 0.003;
            const flangerWet = ctx.createGain();
            const flangerLfo = ctx.createOscillator();
            flangerLfo.type = 'sine';
            flangerLfo.frequency.value = 0.25;
            const flangerDepth = ctx.createGain();
            flangerDepth.gain.value = 0.002;
            const channel = ctx.createGain();
            const output = ctx.createGain();
            const reverb = ctx.createGain();

            input.connect(lowpass);
            lowpass.connect(highpass);
            highpass.connect(gate);
            gate.connect(mix);
            gate.connect(echoDelay);
            echoDelay.connect(echoWet);
            echoWet.connect(mix);
            echoDelay.connect(echoFeedback);
            echoFeedback.connect(echoDelay);
            gate.connect(flangerDelay);
            flangerDelay.connect(flangerWet);
            flangerWet.connect(mix);
            flangerLfo.connect(flangerDepth);
            flangerDepth.connect(flangerDelay.delayTime);
            mix.connect(channel);
            channel.connect(output);
            if (this.roomConvolver) {
                output.connect(reverb);
                reverb.connect(this.roomConvolver);
            }
            flangerLfo.start();

            this.djFxInput = input;
            this.djFxOutput = output;
            this.djFxLowpass = lowpass;
            this.djFxHighpass = highpass;
            this.djFxEchoFeedback = echoFeedback;
            this.djFxEchoWet = echoWet;
            this.djFxFlangerWet = flangerWet;
            this.djFxFlangerLfo = flangerLfo;
            this.djFxChannel = channel;
            this.djFxReverb = reverb;
            this.djFxExtra = this._createDJExtraEffects(ctx, gate, mix);
            this.djFxGate = gate;
            this._writeDJEffects(0);
        } catch (error) {
            this.djFxInput = null;
            this.djFxOutput = null;
            log.warn('🎚️ DJ effects unavailable:', error);
        }
    }

    /**
     * Phaser, noise sweep and gater. The phaser and the sweep are parallel wet sends into the mix (the gater is the
     * series gain stage), so an amount of 0 is silent and costs nothing audible. A failure here leaves the original
     * five effects working.
     */
    _createDJExtraEffects(ctx, gate, mix) {
        const sources = [];
        try {
            const lfo = (type, hz) => {
                const osc = ctx.createOscillator();
                osc.type = type;
                osc.frequency.value = hz;
                sources.push(osc);
                return osc;
            };
            const send = (...chain) => {
                gate.connect(chain[0]);
                for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
                chain[chain.length - 1].connect(mix);
            };

            // Gater: a square LFO (smoothed so the edges do not click) moves the gate between 1 and 1 - depth.
            const gaterLfo = lfo('square', 4);
            const gaterEdge = ctx.createBiquadFilter();
            gaterEdge.type = 'lowpass';
            gaterEdge.frequency.value = 220;
            const gaterDepth = ctx.createGain();
            gaterDepth.gain.value = 0;
            gaterLfo.connect(gaterEdge);
            gaterEdge.connect(gaterDepth);
            gaterDepth.connect(gate.gain);

            // Phaser: four all-pass stages swept together by a slow LFO, mixed with the dry signal for the notches.
            const phaserLfo = lfo('sine', 0.35);
            const phaserDepth = ctx.createGain();
            phaserDepth.gain.value = 1500;
            phaserLfo.connect(phaserDepth);
            const stages = [350, 700, 1400, 2800].map(hz => {
                const stage = ctx.createBiquadFilter();
                stage.type = 'allpass';
                stage.frequency.value = hz;
                stage.Q.value = 0.7;
                phaserDepth.connect(stage.detune);
                return stage;
            });
            const phaserWet = ctx.createGain();
            send(...stages, phaserWet);

            // Noise sweep: looped white noise through a band that rises with the knob, louder as it climbs.
            const noiseLength = Math.max(1, Math.floor(ctx.sampleRate * 2));
            const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
            const noiseData = noiseBuffer.getChannelData(0);
            for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.loop = true;
            sources.push(noise);
            const sweepFilter = ctx.createBiquadFilter();
            sweepFilter.type = 'bandpass';
            sweepFilter.Q.value = 1.4;
            const sweepWet = ctx.createGain();
            noise.connect(sweepFilter);
            sweepFilter.connect(sweepWet);
            sweepWet.connect(mix);

            sources.forEach(source => source.start());
            return { sources, gaterLfo, gaterDepth, phaserWet, sweepFilter, sweepWet, gaterHz: 0 };
        } catch (error) {
            sources.forEach(source => { try { source.stop(); } catch (_) { /* never started */ } });
            log.warn('🎚️ Extra DJ effects unavailable:', error);
            return null;
        }
    }

    /** The gater chops in eighth notes of the track's tempo (one square cycle per eighth: a sixteenth on, a sixteenth off). */
    _syncGaterRate(timeConstant = 0.05) {
        const extra = this.djFxExtra;
        if (!extra) return;
        const hz = Math.min(12, Math.max(1, (Number(this.vjBPM) || 124) / 60 * 2));
        if (Math.abs(hz - extra.gaterHz) < 0.05) return;
        extra.gaterHz = hz;
        this._setDJAudioParam(extra.gaterLfo.frequency, hz, timeConstant);
    }

    _setDJAudioParam(param, value, timeConstant) {
        if (!param || !this.audioContext) return;
        const now = this.audioContext.currentTime;
        if (param.cancelScheduledValues) param.cancelScheduledValues(now);
        if (timeConstant > 0 && param.setTargetAtTime) param.setTargetAtTime(value, now, timeConstant);
        else if (param.setValueAtTime) param.setValueAtTime(value, now);
        else param.value = value;
    }

    _writeDJEffects(timeConstant = 0.025) {
        // A file broadcast already contains the host's effects. Keep its knob readout, not a second wet pass.
        const state = this._networkMusic ? VRClubAudioCrowd.DJ_EFFECT_DEFAULTS : this._djEffectsState();
        const lowpassHz = 20000 * Math.pow(250 / 20000, state.lowpass);
        const highpassHz = 20 * Math.pow(4000 / 20, state.highpass);
        this._setDJAudioParam(this.djFxLowpass?.frequency, lowpassHz, timeConstant);
        this._setDJAudioParam(this.djFxHighpass?.frequency, highpassHz, timeConstant);
        this._setDJAudioParam(this.djFxEchoWet?.gain, state.echo * 0.65, timeConstant);
        this._setDJAudioParam(this.djFxEchoFeedback?.gain, state.echo > 0 ? 0.2 + state.echo * 0.45 : 0, timeConstant);
        this._setDJAudioParam(this.djFxFlangerWet?.gain, state.flanger * 0.7, timeConstant);
        this._setDJAudioParam(this.djFxReverb?.gain, state.reverb * 0.7, timeConstant);
        // An audio taper: a straight line in gain sounds like nothing happens until the fader is nearly at the end.
        this._setDJAudioParam(this.djFxChannel?.gain, state.channel * state.channel, timeConstant);
        this._writeDJExtraEffects(state, timeConstant);
    }

    _writeDJExtraEffects(state, timeConstant) {
        const extra = this.djFxExtra;
        if (!extra) return;
        const level = name => Math.min(1, Math.max(0, Number(state[name]) || 0));
        const gater = level('gater'), phaser = level('phaser'), sweep = level('sweep');
        // The gate rests at 1 - depth / 2 and the LFO swings it by depth / 2 either way: between 1 - depth and 1.
        this._setDJAudioParam(this.djFxGate?.gain, 1 - gater * 0.5, timeConstant);
        this._setDJAudioParam(extra.gaterDepth.gain, gater * 0.5, timeConstant);
        if (gater > 0.001) this._syncGaterRate();
        this._setDJAudioParam(extra.phaserWet.gain, phaser * 0.9, timeConstant);
        this._setDJAudioParam(extra.sweepFilter.frequency, 250 * Math.pow(40, sweep), timeConstant);
        this._setDJAudioParam(extra.sweepWet.gain, sweep * sweep * 0.45, timeConstant);
    }

    setDJEffect(name, value) {
        if (!this.guardHostControl('music')) return false;
        const state = this._djEffectsState();
        if (!Object.hasOwn(state, name)) throw new Error(`Unknown DJ effect: ${name}`);
        state[name] = Math.min(1, Math.max(0, Number(value) || 0));
        this._writeDJEffects();
        return true;
    }

    resetDJEffects() {
        Object.assign(this._djEffectsState(), VRClubAudioCrowd.DJ_EFFECT_DEFAULTS);
        this._writeDJEffects(0.08);
    }

    /**
     * Continuous crowd bed — the sound a room full of people makes.
     *
     * Silence between tracks is the single most obvious "this is a simulation" tell.
     * Filtered noise through a slow LFO reads as a murmuring crowd, spatialised at the
     * dance floor so it sits behind you when you walk to the booth. Ducked against the
     * music so it never competes with the PA.
     */
    _startCrowdAmbience() {
        if (this.crowdAmbienceSource || !this.audioContext) return;
        try {
            const ctx = this.audioContext;
            const rate = ctx.sampleRate;
            const buffer = ctx.createBuffer(1, rate * 4, rate);
            const data = buffer.getChannelData(0);

            // Brown-ish noise: far closer to the spectrum of massed voices than white.
            let last = 0;
            for (let i = 0; i < data.length; i++) {
                const white = Math.random() * 2 - 1;
                last = (last + 0.019 * white) / 1.019;
                data[i] = last * 3.2;
            }

            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.loop = true;

            // Voices live in the 300 Hz - 3 kHz band.
            const voiceBand = ctx.createBiquadFilter();
            voiceBand.type = 'bandpass';
            voiceBand.frequency.value = 900;
            voiceBand.Q.value = 0.7;

            this.crowdAmbienceGain = ctx.createGain();
            this.crowdAmbienceGain.gain.value = 0.05;
            // User-owned ambience level, distinct from the per-frame ducking above.
            this.crowdAmbienceUserGain = ctx.createGain();
            this.crowdAmbienceUserGain.gain.value = this.getCrowdAmbienceLevel();

            const panner = ctx.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 6;
            panner.maxDistance = 40;
            panner.rolloffFactor = 0.8;
            const floor = CLUB_POSITIONS.danceFloor;
            AudioUtils.setPannerPosition(panner, floor.x, 1.6, floor.z);

            source.connect(voiceBand);
            voiceBand.connect(this.crowdAmbienceGain);
            this.crowdAmbienceGain.connect(this.crowdAmbienceUserGain);
            this.crowdAmbienceUserGain.connect(panner);
            panner.connect(this.audioCompressor || ctx.destination);
            source.start(0);

            this.crowdAmbienceSource = source;
            this.crowdAmbiencePanner = panner;
            log.info('🗣️ Crowd ambience bed started');
        } catch (err) {
            log.warn('🗣️ Crowd ambience unavailable:', err);
        }
    }

    /**
     * Validate that a user-supplied audio URL is safe to hand to <audio src>.
     *
     * Rejects:
     *  - non-http(s)/blob schemes (javascript:, data:, file:, ws:, …)
     *  - URLs carrying embedded credentials (https://user:pass@host/…) which leak
     *    into network logs, referrers and error strings
     *  - plain http:// while the page itself is served over https, because the
     *    browser silently blocks the request as mixed content and the user is
     *    left with a stream that "just doesn't play"
     */
    _isSafeAudioUrl(url) {
        return AudioUtils.isSafeAudioUrl(url, window.location.href);
    }

    /**
     * Connect the (single) audio element to the analyser and spatial chain ONCE.
     * createMediaElementSource throws InvalidStateError if called twice for the
     * same element, so this guard is the source of truth for all audio entry points.
     */
    _connectAudioSourceOnce() {
        if (!this.audioElement || !window.AudioContext) return;
        // Every play request is a user gesture: resume a context the browser has
        // suspended since (interruption, backgrounding). Returning before this once
        // the source existed made "Press Play again" unable to ever restore sound.
        this._ensureAudioContext();
        if (this.audioSource) return;
        try {
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Pre-spatial analyser tap ensures lighting and VJ reactivity remain 100% full-bandwidth
            if (this.pannerLeft && this.pannerRight && this.airAbsorptionFilter && this.audioCompressor) {
                if (this.paMonoInput) {
                    this.paMonoInput.connect(this.airAbsorptionFilter);
                    if (this.monitorPannerLeft && this.monitorPannerRight) {
                        this.paMonoInput.connect(this.monitorPannerLeft);
                        this.paMonoInput.connect(this.monitorPannerRight);
                    }
                    if (this.subFilter && this.subGain) {
                        this.paMonoInput.connect(this.subFilter);
                    }
                }
                // Directional Mains
                this.airAbsorptionFilter.connect(this.pannerLeft);
                this.airAbsorptionFilter.connect(this.pannerRight);

                // Occlusion sits between the panners and the bus so leaving the room
                // muffles the PA without touching the reverb tail or the sub channel.
                const busIn = this.occlusionFilter || this.audioCompressor;
                this.pannerLeft.connect(busIn);
                this.pannerRight.connect(busIn);
                if (this.monitorPannerLeft && this.monitorPannerRight && this.monitorGain) {
                    this.monitorPannerLeft.connect(this.monitorGain);
                    this.monitorPannerRight.connect(this.monitorGain);
                    this.monitorGain.connect(busIn);
                }
                if (this.occlusionFilter) {
                    // The second stage (street) sits after the first; either alone reaches the bus.
                    this.occlusionFilter.connect(this.occlusionFilter2 || this.audioCompressor);
                    if (this.occlusionFilter2) this.occlusionFilter2.connect(this.audioCompressor);
                }

                // Sub-bass Channel
                if (this.subFilter && this.subGain) {
                    this.subFilter.connect(this.subGain);
                    this.subGain.connect(this.audioCompressor);
                }

                // Warehouse Room Ambience
                if (this.roomDelay && this.roomDelayGain) {
                    this.airAbsorptionFilter.connect(this.roomDelay);
                    this.roomDelay.connect(this.roomDelayGain);
                    this.roomDelayGain.connect(this.audioCompressor);
                }

                // Convolution reverb send
                if (this.reverbSend) {
                    this.airAbsorptionFilter.connect(this.reverbSend);
                }
            }
            this._connectMusicInput(this.audioSource);
            log.info('🎚️ Audio analyser and 3D spatial acoustics connected');
        } catch (err) {
            log.warn('🎚️ Could not connect audio source:', err);
        }
    }

    _connectMusicInput(source, monitor = null) {
        source.connect(this.audioAnalyser);
        if (this.kickFilter) source.connect(this.kickFilter);
        if (this.rhythmFilter) source.connect(this.rhythmFilter);
        let audible = monitor || source;
        if (monitor) source.connect(monitor);
        if (this.djFxInput && this.djFxOutput) {
            audible.connect(this.djFxInput);
            audible = this.djFxOutput;
        }
        if (this.pannerLeft && this.pannerRight && this.airAbsorptionFilter && this.audioCompressor) {
            if (this.paMonoInput) {
                audible.connect(this.paMonoInput);
            } else {
                audible.connect(this.airAbsorptionFilter);
                if (this.monitorPannerLeft && this.monitorPannerRight) {
                    audible.connect(this.monitorPannerLeft);
                    audible.connect(this.monitorPannerRight);
                }
                if (this.subFilter && this.subGain) audible.connect(this.subFilter);
            }
        } else if (this.audioCompressor) {
            audible.connect(this.audioCompressor);
        }
    }

    /** Remote music drives the same PA, room acoustics and detectors as a local track. */
    startNetworkMusic(stream, state) {
        this._ensureAudioElement();
        this._connectAudioSourceOnce();
        if (!this.audioSource || !this.audioContext) throw new Error('The club audio graph is unavailable.');
        this.audioElement.pause();
        this._stopSoundCloudPlayer();
        const source = this.audioContext.createMediaStreamSource(stream);
        const gain = this.audioContext.createGain();
        gain.gain.value = state?.localInput ? 1 : state?.playing ? (this._audioVolume ?? 1) : 0;
        const monitor = state?.localInput ? this.audioContext.createGain() : null;
        if (monitor) monitor.gain.value = 0;
        const element = document.createElement('audio');
        element.muted = true;
        element.srcObject = stream;
        source.connect(gain);
        this._connectMusicInput(gain, monitor);
        const remote = { source, gain, monitor, element, previousKind: this._audioKind, previousTitle: this.nowPlayingLabel };
        this._networkMusic = remote;
        this._writeDJEffects();
        this._audioKind = 'network';
        this.nowPlayingLabel = state?.title || 'Host broadcast';
        if (typeof this.syncDJFromSet === 'function') this.syncDJFromSet({ label: this.nowPlayingLabel });
        element.play().catch(error => {
            if (this._networkMusic === remote) this.showErrorMessage(`Broadcast playback was blocked: ${error.message}. Press Listen along again.`);
        });
        return remote;
    }

    stopNetworkMusic(remote) {
        remote.source.disconnect();
        remote.gain.disconnect();
        remote.monitor?.disconnect();
        remote.element.pause();
        remote.element.srcObject = null;
        if (this._networkMusic === remote) {
            this._networkMusic = null;
            if (this._audioKind === 'network') {
                this._audioKind = remote.previousKind;
                this.nowPlayingLabel = remote.previousTitle;
            }
            this._writeDJEffects();
        }
    }

    /**
     * The head's up vector. `camera.upVector` is a static +Y, so a tilted head left the
     * HRTF field upright; this transforms +Y by the same world matrix getForwardRay() uses.
     * Reuses two vectors, so it allocates nothing per frame.
     */
    _listenerUp(cam) {
        const fallback = cam.upVector || BABYLON.Vector3.Up();
        if (!cam.getWorldMatrix || !BABYLON.Vector3.TransformNormalToRef || !BABYLON.Vector3.Zero) return fallback;
        if (!this._listenerUpScratch) {
            this._listenerUpScratch = { local: BABYLON.Vector3.Up(), world: BABYLON.Vector3.Zero() };
        }
        const { local, world } = this._listenerUpScratch;
        BABYLON.Vector3.TransformNormalToRef(local, cam.getWorldMatrix(), world);
        return world.lengthSquared() > 1e-6 ? world.normalize() : fallback;
    }

    /**
     * Update Web Audio listener position, orientation, and acoustic attenuation based on camera.
     */
    updateSpatialAudioListener() {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const cam = this.scene ? this.scene.activeCamera : null;
        if (!cam) return;

        const pos = cam.globalPosition || cam.position;
        const now = this.audioContext.currentTime;
        const listener = this.audioContext.listener;

        // Update listener position. Every coordinate goes through AudioUtils.audioX because
        // Web Audio is right-handed and Babylon is left-handed (see AudioUtils.audioX).
        if (listener.positionX && listener.positionX.setTargetAtTime) {
            listener.positionX.setTargetAtTime(AudioUtils.audioX(pos.x), now, 0.03);
            listener.positionY.setTargetAtTime(pos.y, now, 0.03);
            listener.positionZ.setTargetAtTime(pos.z, now, 0.03);
        } else if (listener.setPosition) {
            listener.setPosition(AudioUtils.audioX(pos.x), pos.y, pos.z);
        }

        // Update listener orientation
        if (cam.getForwardRay) {
            const ray = cam.getForwardRay();
            const fwd = ray.direction;
            const up = this._listenerUp(cam);
            if (listener.forwardX && listener.forwardX.setTargetAtTime) {
                listener.forwardX.setTargetAtTime(AudioUtils.audioX(fwd.x), now, 0.08);
                listener.forwardY.setTargetAtTime(fwd.y, now, 0.08);
                listener.forwardZ.setTargetAtTime(fwd.z, now, 0.08);
                listener.upX.setTargetAtTime(AudioUtils.audioX(up.x), now, 0.08);
                listener.upY.setTargetAtTime(up.y, now, 0.08);
                listener.upZ.setTargetAtTime(up.z, now, 0.08);
            } else if (listener.setOrientation) {
                listener.setOrientation(AudioUtils.audioX(fwd.x), fwd.y, fwd.z, AudioUtils.audioX(up.x), up.y, up.z);
            }
        }

        // Real-world acoustic zone attenuation:
        // Dance floor center is at (0, 0, -12); PA speakers flown at z = -16; entrance is at z = 0.
        const distToStage = Math.sqrt(pos.x * pos.x + Math.pow(pos.z - (-14), 2));
        // Height is a second acoustic, not a change to the floor's 2D distance (the stair sweep and the
        // sub channel depend on that). The balcony ear is near the flown boxes; the deck soffit is not.
        const zones = _paListenerZones(pos.x, pos.y, pos.z);

        // How far outdoors the listener is (0 in the club and vestibule, 1 on the street) and how far from the door.
        const city = typeof window !== 'undefined' ? window.CityLayout : null;
        const exterior = city ? city.exteriorAmount(pos.x, pos.z) : 0;
        const doorDistance = city ? city.doorDistance(pos.x, pos.z) : 0;
        // How enclosed in the room the listener is: 1 on the dance floor, easing to 0 at the top of the entrance
        // stair. Everything the room itself produces — the direct PA, its tail, its early reflection and the chatter
        // — follows this one curve, so walking down the stair opens the club up gradually instead of all at once.
        const venue = typeof window !== 'undefined' ? window.VenueLayout : null;
        const enclosure = venue && venue.vestibule ? venue.vestibule.enclosure(pos.z) : 1;

        // Listener-local PA presence for character performance only. Beat/BPM/show analysis remains on the
        // unattenuated analyser tap; this scalar merely lets the crowd and DJ calm as this guest leaves the room.
        const distancePresence = Math.max(0.65, Math.min(1, 1 - Math.max(0, distToStage - 4) / 34));
        const heightPresence = (1 + 0.18 * zones.onDeck) * (1 - 0.35 * zones.cover) * (1 - 0.08 * zones.shelf);
        this._localPaPresence = distancePresence * enclosure * (1 - exterior) * heightPresence;
        
        // Nearfield DJ booth studio monitors: crisp direct sound in the booth behind the main PA line,
        // fading smoothly to zero out on the dance floor so they never compete with the flown PA arrays.
        if (this.monitorGain && this.monitorGain.gain) {
            const boothDist = Math.hypot(pos.x / 2.2, pos.z - (-18.9));
            const boothProximity = Math.max(0, Math.min(1, 1 - Math.max(0, boothDist - 0.6) / 3.2));
            const monLevel = 0.58 * boothProximity * boothProximity * (3 - 2 * boothProximity) * enclosure * (1 - exterior);
            this.monitorGain.gain.setTargetAtTime(monLevel, now, 0.05);
        }

        // Sub-bass intensity: peak punch on dance floor (0-8m from stage), rolling off gently near entrance
        if (this.subGain && this.subGain.gain) {
            let subLevel = Math.max(0.45, Math.min(1.15, 1.15 - (distToStage / 22) * 0.55));
            // Through the wall the sub is what carries: the thump stays present at the door and fades down the street.
            if (exterior > 0) subLevel += (Math.max(0.5, 0.95 - doorDistance * 0.018) - subLevel) * exterior;
            this.subGain.gain.setTargetAtTime(subLevel, now, 0.05);
        }

        // Air absorption: high frequency roll-off with distance
        if (this.airAbsorptionFilter && this.airAbsorptionFilter.frequency) {
            const open = Math.max(5000, Math.min(18000, 18000 - distToStage * 650));
            const cutoff = _logMix(open * (1 + 0.12 * zones.onDeck), 3200, zones.cover);
            this.airAbsorptionFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
        }

        // Reverb send rises with distance. Standing in front of the PA you hear the
        // box; at the back of the room you mostly hear the room. The room's tail and its early
        // reflection stay inside it: they fade out across the doorway and the stair, and on the
        // street neither is heard. Without that fade the stairwell got the room's full-band tail at
        // its loudest, which is most of why the club used to sound wide open from up there.
        if (this.reverbSend && this.reverbSend.gain) {
            const wet = Math.max(0.08, Math.min(0.62, distToStage / 30)) * enclosure * (1 - exterior)
                * (1 - 0.4 * zones.onDeck) * (1 + 0.35 * zones.cover) * (1 + 0.25 * zones.shelf);
            this.reverbSend.gain.setTargetAtTime(wet, now, 0.12);
        }
        if (this.roomDelayGain && this.roomDelayGain.gain) {
            this.roomDelayGain.gain.setTargetAtTime(0.18 * enclosure * (1 - exterior), now, 0.12);
        }

        // Occlusion: the club room spans z -21..-5. Walking out toward the entrance and up the stair hall puts the
        // doorway and then the stair's turn between the listener and the PA, so the top end goes and the level drops.
        // It is ONE continuous sweep over that whole walk (VenueLayout.vestibule.enclosure), not a step at the
        // doorway: coming down the stair the muffling lifts gradually, and only opens right out at the dance floor.
        // Past the street door the whole building is between the listener and the music: only the low bass comes
        // through, a little more of it right at the door than down the street.
        if (this.occlusionFilter && this.occlusionFilter.frequency) {
            // Top of the stair, where only the street door is left, through to the open room.
            const STAIR_HZ = 520;
            const OPEN_HZ = 20000;
            const corridorCutoff = Math.exp(Math.log(STAIR_HZ) + (Math.log(OPEN_HZ) - Math.log(STAIR_HZ)) * enclosure);
            // Under the deck or in the bar alcove the top end closes toward a warm shelf. The stair
            // walk (x = 0) has no cover, so its 10 cm sweep is unchanged.
            const coveredCutoff = _logMix(_logMix(corridorCutoff, 780, zones.cover), 2400, zones.shelf);
            const leak = Math.max(0, 1 - doorDistance / 14);
            const streetCutoff = 90 + 90 * leak * leak;
            // Interpolate in log-frequency so the sweep is even to the ear.
            const lerpLog = (from, to) => Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * exterior);
            this.occlusionFilter.frequency.setTargetAtTime(lerpLog(coveredCutoff, streetCutoff), now, 0.08);
            if (this.occlusionFilter2 && this.occlusionFilter2.frequency) {
                this.occlusionFilter2.frequency.setTargetAtTime(lerpLog(22050, streetCutoff), now, 0.08);
            }
            if (this.audioMasterGain && this.audioMasterGain.gain) {
                const indoorGain = (0.72 + (1.15 - 0.72) * enclosure) * (1 + 0.08 * zones.onDeck) * (1 - 0.12 * zones.cover);
                // Outdoors the make-up gain keeps the thump present at the door, and the level then falls with distance
                // from it (the sound comes up the entrance stair and out of the door): -6 dB 8 m out, -10 dB on the far
                // pavement, -18 dB at the end of the block.
                const streetGain = 1.25 / (1 + Math.max(0, doorDistance - 2) / 6);
                this.audioMasterGain.gain.setTargetAtTime(indoorGain + (streetGain - indoorGain) * exterior, now, 0.15);
            }
        }

        // Crowd bed ducks under a loud PA and comes up in the gaps between tracks. The chatter is in the room, so it
        // fades out across the doorway and the stair with everything else; nobody is chattering on the street.
        if (this.crowdAmbienceGain && this.crowdAmbienceGain.gain) {
            const energy = this._audioFrameData ? this._audioFrameData.average : 0;
            const level = Math.max(0.012, 0.085 - energy * 0.14) * enclosure * (1 - exterior);
            this.crowdAmbienceGain.gain.setTargetAtTime(level, now, 0.4);
        }
    }

    /**
     * Swap the audio element src safely, revoking any previous blob URL to
     * avoid unbounded memory growth across file selections.
     */
    _setAudioSrc(newSrc) {
        if (!this.audioElement) return;
        const prev = this.audioElement.src;
        if (prev && prev.startsWith('blob:')) {
            try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
        }
        this.audioElement.src = newSrc;
    }
    
    getAudioData() {
        const frame = this._audioFrameData;
        if (!this.audioAnalyser || !this.audioDataArray ||
            !this.audioContext || this.audioContext.state !== 'running') {
            frame.bass = 0;
            frame.mid = 0;
            frame.treble = 0;
            frame.average = 0;
            frame.hasAudio = false;
            frame.low = this.kickAnalyser ? 0 : null;
            frame.lowRms = 0;
            frame.energy = this.kickAnalyser ? 0 : null;
            if (frame.kickSteps) frame.kickSteps.count = 0;
            return frame;
        }
        
        this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
        
        // Split frequency data into bass, mid, treble
        const bassEnd = Math.floor(this.audioDataArray.length * 0.1);
        const midEnd = Math.floor(this.audioDataArray.length * 0.5);
        
        let bassSum = 0, midSum = 0, trebleSum = 0;
        
        for (let i = 0; i < bassEnd; i++) {
            bassSum += this.audioDataArray[i];
        }
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += this.audioDataArray[i];
        }
        for (let i = midEnd; i < this.audioDataArray.length; i++) {
            trebleSum += this.audioDataArray[i];
        }
        
        const bass = bassSum / bassEnd / 255;
        const mid = midSum / (midEnd - bassEnd) / 255;
        const treble = trebleSum / (this.audioDataArray.length - midEnd) / 255;
        const average = (bass + mid + treble) / 3;
        
        // Check if audio is actually playing
        const hasAudio = average > 0.01;
        const audioEl = this.audioElement;
        const muted = !!(audioEl && (audioEl.muted || audioEl.volume === 0));
        const nowMs = typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
            ? performance.now()
            : 0;

        // === SILENT-ANALYSER HEURISTIC ===
        // A cross-origin stream WITHOUT `Access-Control-Allow-Origin` still plays
        // through <audio>, but the Web Audio graph receives a tainted (silent)
        // source, so every FFT bin reads 0 forever. Previously this looked exactly
        // like "the club just isn't reacting to the music" with nothing in the
        // console. Detect it and tell the user once, but describe it as a
        // heuristic: a legitimately silent stream intro can look the same.
        if (average > 0) {
            this._analyserHadNonZero = true;
            this._silentAnalyserSinceMs = null;
        } else if (!this._corsWarningShown && audioEl &&
            !audioEl.paused && !audioEl.ended && !muted && audioEl.currentTime > 2) {
            if (average === 0) {
                if (this._silentAnalyserSinceMs == null) this._silentAnalyserSinceMs = nowMs;
                const windowMs = this._analyserHadNonZero ? 6000 : 3000;
                if (nowMs - this._silentAnalyserSinceMs >= windowMs) {
                    this._corsWarningShown = true;
                    log.warn('🎚️ Analyser has been silent so far while audio is playing — the stream may be blocked from analysis by CORS.');
                    this.showErrorMessage(
                        'Audio is playing but the analyser has been silent so far; ' +
                        'one possible cause is a stream server CORS restriction. ' +
                        'If the visuals never react, try another station or a stream ' +
                        'that sends Access-Control-Allow-Origin.'
                    );
                }
            }
        } else {
            this._silentAnalyserSinceMs = null;
        }
        
        frame.bass = bass;
        frame.mid = mid;
        frame.treble = treble;
        frame.average = average;
        frame.hasAudio = hasAudio;
        if (this.djFxExtra && this._djEffects && this._djEffects.gater > 0.001) this._syncGaterRate();
        this._readKickBand(frame, nowMs);
        return frame;
    }

    /**
     * The kick band and the music's dynamics, into `frame.low` / `frame.lowRms` / `frame.energy` (see 01-core), plus
     * `frame.kickSteps`: the band as the kick detector must see it.
     *  - low: RMS under ~120 Hz against a peak that decays with an 8 s half-life, so it reads the same at any volume.
     *  - energy: short-term (0.5 s) against long-term (20 s) loudness of that band, mapped so a steady groove sits
     *    near 0.6, a kick-less breakdown falls toward 0.2 and the first bars of a drop push toward 1.
     *  - kickSteps: one ~11 ms RMS window every 1/60 s of AUDIO time since the last read, each stamped with when it
     *    played. Reading only the newest window once per rendered frame made the detector depend on the frame rate:
     *    measured on a real set, the beat was present 99% of the time at 60 fps, 23% at 30 fps and never at 12 fps,
     *    so the crowd stopped dancing whenever the room got heavy to draw. At 60 fps this is still one window a frame.
     * No allocation: the sample buffer, the step arrays and the running levels are kept.
     */
    _readKickBand(frame, nowMs) {
        const analyser = this.kickAnalyser;
        const steps = frame.kickSteps || (frame.kickSteps = {
            count: 0,
            times: new Float64Array(VRClubAudioCrowd.KICK_MAX_STEPS),
            lows: new Float32Array(VRClubAudioCrowd.KICK_MAX_STEPS),
            raws: new Float32Array(VRClubAudioCrowd.KICK_MAX_STEPS)
        });
        steps.count = 0;
        if (!analyser || !this.kickSamples || !frame.hasAudio) {
            frame.low = analyser ? 0 : null;
            frame.lowRms = 0;
            frame.energy = analyser ? 0 : null;
            return;
        }
        analyser.getFloatTimeDomainData(this.kickSamples);
        const samples = this.kickSamples;
        const length = samples.length;
        const win = Math.min(length, VRClubAudioCrowd.KICK_WINDOW);
        // The rhythm band, read at exactly the same windows (both analysers follow the same source on the same clock).
        let rhythm = null;
        if (this.rhythmAnalyser && this.rhythmSamples && this.rhythmSamples.length === length) {
            this.rhythmAnalyser.getFloatTimeDomainData(this.rhythmSamples);
            rhythm = this.rhythmSamples;
        }
        steps.rhythm = rhythm ? (steps.rhythmLevels || (steps.rhythmLevels = new Float32Array(steps.times.length))) : null;
        const k = this._kickBand || (this._kickBand = {
            peak: 1e-3, short: 0, long: 0, at: nowMs, started: false, quietSince: 0, clock: null, carry: 0
        });

        // How much audio has played since the last read, on the audio clock (which is what the buffer follows).
        const ctx = this.audioContext;
        const rate = ctx && ctx.sampleRate > 0 ? ctx.sampleRate : 0;
        const clock = ctx && Number.isFinite(ctx.currentTime) ? ctx.currentTime : null;
        if (rate && clock !== null && k.clock !== null && length > win) {
            const stride = rate / VRClubAudioCrowd.KICK_STEP_HZ;
            const fresh = Math.max(0, Math.min(length - win, (clock - k.clock) * rate));
            const due = k.carry + fresh;
            let n = Math.floor(due / stride);
            const rem = due - n * stride;
            // A frame longer than the buffer: only the steps still in it can be read.
            n = Math.min(n, Math.floor((length - win - rem) / stride) + 1, VRClubAudioCrowd.KICK_MAX_STEPS);
            k.carry = rem;
            for (let j = n - 1; j >= 0; j--) {
                const back = rem + j * stride;           // samples between this step and the newest one
                const end = length - Math.round(back);
                this._bandStep(k, samples, rhythm, end - win, end, nowMs - back / rate * 1000, steps);
            }
        } else {
            // First read, or no audio clock (an old browser, a test stub): the newest window, now.
            this._bandStep(k, samples, rhythm, length - win, length, nowMs, steps);
        }
        k.clock = clock;

        const rms = VRClubAudioCrowd._windowRms(samples, length - win, length);
        frame.low = Math.min(1, rms / k.peak);
        frame.lowRms = rms;
        const ratio = k.long > 1e-5 ? k.short / k.long : 1;
        frame.energy = Math.max(0, Math.min(1, (ratio - 0.3) / 1.0));
    }

    /** One window of both bands: the rhythm band's level beside it, then the kick band's step. */
    _bandStep(k, kick, rhythm, from, to, tMs, steps) {
        if (rhythm && steps.count < steps.rhythm.length) steps.rhythm[steps.count] = VRClubAudioCrowd._windowRms(rhythm, from, to);
        this._kickBandStep(k, VRClubAudioCrowd._windowRms(kick, from, to), tMs, steps);
    }

    /** One step of the kick band: track its levels and record it for the detector. */
    _kickBandStep(k, rms, tMs, steps) {
        const dt = Math.min(0.25, Math.max(0, (tMs - k.at) / 1000));
        k.at = tMs;
        // A new track (or the same one after a pause) starts its levels over, rather than reading as a huge drop.
        if (!k.started || rms < 1e-5) {
            if (rms < 1e-5) { k.quietSince = k.quietSince || tMs; if (tMs - k.quietSince > 2000) k.started = false; }
            if (!k.started && rms >= 1e-5) { k.short = k.long = rms; k.peak = Math.max(rms, 1e-4); k.started = true; k.quietSince = 0; k.startedAt = tMs; }
        } else {
            k.quietSince = 0;
        }
        k.peak = Math.max(rms, k.peak * Math.pow(0.5, dt / 8), 1e-4);
        k.short += (rms - k.short) * (1 - Math.exp(-dt / 0.5));
        // The long average starts quick and slows to 20 s: seeded from the first frame alone it could start on a
        // kick's peak (five times the track's average) and read the next 40 seconds as a breakdown.
        const tauLong = Math.min(20, 1 + (tMs - (k.startedAt || tMs)) / 1000);
        k.long += (rms - k.long) * (1 - Math.exp(-dt / tauLong));
        const i = steps.count;
        if (i >= steps.times.length) return;
        steps.times[i] = tMs;
        steps.lows[i] = rms / k.peak;
        steps.raws[i] = rms;
        steps.count = i + 1;
    }

    static _windowRms(samples, from, to) {
        let sum = 0;
        for (let i = Math.max(0, from); i < to; i++) sum += samples[i] * samples[i];
        return Math.sqrt(sum / Math.max(1, to - Math.max(0, from)));
    }

    /** The kick detector's rate: one ~11 ms window every 1/60 s of audio, whatever the display does. */
    static get KICK_STEP_HZ() { return 60; }
    /** Samples per window: what the detector was tuned on (~11 ms at 48 kHz). */
    static get KICK_WINDOW() { return 512; }
    /** At most this many steps a frame: ~270 ms of audio, more than the kick analyser's buffer holds. */
    static get KICK_MAX_STEPS() { return 16; }

    /**
     * Toggle photosensitive Safe Mode. Disables strobes and bloom flashes
     * for users with photosensitive epilepsy or migraine sensitivity.
     * Persists across sessions.
     */
    setPhotosensitiveSafeMode(enabled, { persist = true } = {}) {
        this.photosensitiveSafeMode = !!enabled;
        if (this.flashGovernor && this.photosensitiveSafeMode) {
            this.flashGovernor.lastSource = null;
        }
        // `persist: false` is a temporary hold (immersive launch, until the guest has chosen): it must not become their saved choice.
        if (persist) {
            try { localStorage.setItem('vrclub.safeMode', this.photosensitiveSafeMode ? '1' : '0'); } catch (_) {}
        }
        // Immediately quiet any in-flight strobe state
        if (this.photosensitiveSafeMode && this.strobes) {
            this.strobes.forEach((strobe) => {
                strobe.material.emissiveColor = this.cachedColors.black;
                if (strobe.light) strobe.light.intensity = 0;
                strobe.flashDuration = 0;
            });
            if (this.strobeFlashLight) this.strobeFlashLight.intensity = 0;
        }
        if (this.showDirector && typeof this.showDirector.onPhotosensitiveModeChanged === 'function') {
            this.showDirector.onPhotosensitiveModeChanged();
        }
        log.info(`♿ Photosensitive Safe Mode: ${this.photosensitiveSafeMode ? 'ON (strobes disabled)' : 'OFF'}`);
        return this.photosensitiveSafeMode;
    }

    /**
     * Set music playback volume (0..1).
     *
     * Written to the <audio> element rather than `audioMasterGain`, because the
     * gain node is driven every frame by the room-acoustics occlusion model
     * (see updateRoomAcoustics) and any value written here would be overwritten
     * within one frame. The element's own volume composes with that cleanly.
     * @param {number} value 0..1
     */
    setAudioVolume(value) {
        const v = Math.min(1, Math.max(0, Number(value)));
        if (!Number.isFinite(v)) return this._audioVolume ?? 1;
        this._audioVolume = v;
        if (this.audioElement) this.audioElement.volume = v;
        if (this.liveInput?.monitoring) this.liveInput.setMonitoring(true);
        if (this._networkMusic && !this._networkMusic.monitor && this.multiplayer?._broadcastState?.playing) this._networkMusic.gain.gain.value = v;
        return v;
    }

    /** How far the music dips while people talk: about -12 dB, enough to hear a voice over a loud PA. */
    static get VOICE_DUCK_LEVEL() { return 0.25; }

    /**
     * Dip the music under conversation (true) or bring it back (false). Called on changes only, by ClubMultiplayer.
     * A quick fade down so the first word is heard, and a slower one back up so the music does not pump between
     * sentences. The user's own music volume is untouched: the two multiply.
     * @returns {boolean} whether the music is now ducked
     */
    setVoiceDuck(active) {
        active = !!active;
        if (this._voiceDucked === active) return active;
        this._voiceDucked = active;
        const node = this.voiceDuckGain;
        if (!node || !node.gain) return active;
        const level = active ? VRClubAudioCrowd.VOICE_DUCK_LEVEL : 1;
        const ctx = this.audioContext;
        if (ctx && ctx.currentTime != null && node.gain.setTargetAtTime) {
            node.gain.cancelScheduledValues(ctx.currentTime);
            node.gain.setTargetAtTime(level, ctx.currentTime, active ? 0.08 : 0.5);
        } else {
            node.gain.value = level;
        }
        return active;
    }

    /**
     * User-owned crowd-bed level (0..1), persisted separately from the PA/music volume.
     */
    getCrowdAmbienceLevel() {
        if (Number.isFinite(this.crowdAmbienceLevel)) return this.crowdAmbienceLevel;
        let stored = null;
        try { stored = localStorage.getItem('vrclub.crowdAmbience'); } catch (_) { /* private browsing */ }
        const parsed = Number(stored);
        this.crowdAmbienceLevel = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
        return this.crowdAmbienceLevel;
    }

    setCrowdAmbienceLevel(value) {
        const level = Math.min(1, Math.max(0, Number(value)));
        if (!Number.isFinite(level)) return this.getCrowdAmbienceLevel();
        this.crowdAmbienceLevel = level;
        try { localStorage.setItem('vrclub.crowdAmbience', String(level)); } catch (_) { /* private browsing */ }
        if (this.crowdAmbienceUserGain && this.crowdAmbienceUserGain.gain) {
            if (this.audioContext && this.audioContext.currentTime != null && this.crowdAmbienceUserGain.gain.setTargetAtTime) {
                this.crowdAmbienceUserGain.gain.setTargetAtTime(level, this.audioContext.currentTime, 0.05);
            } else {
                this.crowdAmbienceUserGain.gain.value = level;
            }
        }
        return level;
    }
}
window.VRClubAudio = VRClubAudio;
