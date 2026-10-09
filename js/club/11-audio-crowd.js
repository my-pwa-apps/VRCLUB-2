'use strict';
class VRClubAudioCrowd extends VRClubUI {
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

                // 3. Omni-directional Sub-bass Channel (club subs hit physical low end)
                this.subFilter = this.audioContext.createBiquadFilter();
                this.subFilter.type = 'lowpass';
                this.subFilter.frequency.value = 100;
                this.subGain = this.audioContext.createGain();
                this.subGain.gain.value = 0.95;

                // 4. Warehouse Air Absorption / High Frequency Damping Filter
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
            this.audioSource.connect(this.audioAnalyser);
            if (this.kickFilter) this.audioSource.connect(this.kickFilter);
            if (this.rhythmFilter) this.audioSource.connect(this.rhythmFilter);

            if (this.pannerLeft && this.pannerRight && this.airAbsorptionFilter && this.audioCompressor) {
                // Directional Mains
                this.audioSource.connect(this.airAbsorptionFilter);
                this.airAbsorptionFilter.connect(this.pannerLeft);
                this.airAbsorptionFilter.connect(this.pannerRight);

                // Occlusion sits between the panners and the bus so leaving the room
                // muffles the PA without touching the reverb tail or the sub channel.
                const busIn = this.occlusionFilter || this.audioCompressor;
                this.pannerLeft.connect(busIn);
                this.pannerRight.connect(busIn);
                if (this.occlusionFilter) {
                    // The second stage (street) sits after the first; either alone reaches the bus.
                    this.occlusionFilter.connect(this.occlusionFilter2 || this.audioCompressor);
                    if (this.occlusionFilter2) this.occlusionFilter2.connect(this.audioCompressor);
                }

                // Sub-bass Channel
                if (this.subFilter && this.subGain) {
                    this.audioSource.connect(this.subFilter);
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
            } else if (this.audioCompressor) {
                this.audioAnalyser.connect(this.audioCompressor);
            }
            log.info('🎚️ Audio analyser and 3D spatial acoustics connected');
        } catch (err) {
            log.warn('🎚️ Could not connect audio source:', err);
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
                listener.forwardX.setTargetAtTime(AudioUtils.audioX(fwd.x), now, 0.03);
                listener.forwardY.setTargetAtTime(fwd.y, now, 0.03);
                listener.forwardZ.setTargetAtTime(fwd.z, now, 0.03);
                listener.upX.setTargetAtTime(AudioUtils.audioX(up.x), now, 0.03);
                listener.upY.setTargetAtTime(up.y, now, 0.03);
                listener.upZ.setTargetAtTime(up.z, now, 0.03);
            } else if (listener.setOrientation) {
                listener.setOrientation(AudioUtils.audioX(fwd.x), fwd.y, fwd.z, AudioUtils.audioX(up.x), up.y, up.z);
            }
        }

        // Real-world acoustic zone attenuation:
        // Dance floor center is at (0, 0, -12); PA speakers flown at z = -16; entrance is at z = 0.
        const distToStage = Math.sqrt(pos.x * pos.x + Math.pow(pos.z - (-14), 2));

        // How far outdoors the listener is (0 in the club and vestibule, 1 on the street) and how far from the door.
        const city = typeof window !== 'undefined' ? window.CityLayout : null;
        const exterior = city ? city.exteriorAmount(pos.x, pos.z) : 0;
        const doorDistance = city ? city.doorDistance(pos.x, pos.z) : 0;
        // How enclosed in the room the listener is: 1 on the dance floor, easing to 0 at the top of the entrance
        // stair. Everything the room itself produces — the direct PA, its tail, its early reflection and the chatter
        // — follows this one curve, so walking down the stair opens the club up gradually instead of all at once.
        const venue = typeof window !== 'undefined' ? window.VenueLayout : null;
        const enclosure = venue && venue.vestibule ? venue.vestibule.enclosure(pos.z) : 1;
        
        // Sub-bass intensity: peak punch on dance floor (0-8m from stage), rolling off gently near entrance
        if (this.subGain && this.subGain.gain) {
            let subLevel = Math.max(0.45, Math.min(1.15, 1.15 - (distToStage / 22) * 0.55));
            // Through the wall the sub is what carries: the thump stays present at the door and fades down the street.
            if (exterior > 0) subLevel += (Math.max(0.5, 0.95 - doorDistance * 0.018) - subLevel) * exterior;
            this.subGain.gain.setTargetAtTime(subLevel, now, 0.05);
        }

        // Air absorption: high frequency roll-off with distance
        if (this.airAbsorptionFilter && this.airAbsorptionFilter.frequency) {
            const cutoff = Math.max(5000, Math.min(18000, 18000 - distToStage * 650));
            this.airAbsorptionFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
        }

        // Reverb send rises with distance. Standing in front of the PA you hear the
        // box; at the back of the room you mostly hear the room. The room's tail and its early
        // reflection stay inside it: they fade out across the doorway and the stair, and on the
        // street neither is heard. Without that fade the stairwell got the room's full-band tail at
        // its loudest, which is most of why the club used to sound wide open from up there.
        if (this.reverbSend && this.reverbSend.gain) {
            const wet = Math.max(0.08, Math.min(0.62, distToStage / 30)) * enclosure * (1 - exterior);
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
            const leak = Math.max(0, 1 - doorDistance / 14);
            const streetCutoff = 90 + 90 * leak * leak;
            // Interpolate in log-frequency so the sweep is even to the ear.
            const lerpLog = (from, to) => Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * exterior);
            this.occlusionFilter.frequency.setTargetAtTime(lerpLog(corridorCutoff, streetCutoff), now, 0.08);
            if (this.occlusionFilter2 && this.occlusionFilter2.frequency) {
                this.occlusionFilter2.frequency.setTargetAtTime(lerpLog(22050, streetCutoff), now, 0.08);
            }
            if (this.audioMasterGain && this.audioMasterGain.gain) {
                const indoorGain = 0.72 + (1.15 - 0.72) * enclosure;
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
     * Pulse VR controllers in time with bass hits.
     * Massive immersion gain — gives the user a physical "thump" on each kick drum,
     * substituting for the chest-rattling sub-bass of a real club PA.
     *
     * Throttled so we don't spam the haptic bus (which causes the actuator to
     * desync from audio). Honors `bassHapticsEnabled` so the user can opt out.
     */
    _updateBassHaptics(audioData) {
        if (!this.bassHapticsEnabled) return;
        if (!this._xrControllers || this._xrControllers.length === 0) return;
        if (!audioData || !audioData.hasAudio) return;

        const bass = audioData.bass || 0;
        if (bass < 0.55) return; // Only fire on real kicks, not ambient rumble

        const now = performance.now();
        // 4 Hz cap — matches typical kick-drum cadence (~140 BPM eighths)
        if (now - this._lastHapticPulseAt < 140) return;
        this._lastHapticPulseAt = now;

        const intensity = Math.min(1.0, (bass - 0.55) * 2.2); // 0..1
        const duration = 60 + Math.floor(intensity * 80);     // 60..140 ms

        for (let i = 0; i < this._xrControllers.length; i++) {
            const ctrl = this._xrControllers[i];
            try {
                const inputSource = ctrl && ctrl.inputSource;
                const gp = inputSource && inputSource.gamepad;
                if (!gp) continue;
                // Standards-compliant path (Quest browser supports this on WebXR gamepads)
                if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
                    gp.hapticActuators[0].pulse(intensity, duration);
                } else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
                    gp.vibrationActuator.playEffect('dual-rumble', {
                        duration: duration,
                        strongMagnitude: intensity,
                        weakMagnitude: intensity * 0.6
                    });
                }
            } catch (_) { /* Per-controller failures must never break the audio loop */ }
        }
    }

    /**
     * Toggle photosensitive Safe Mode. Disables strobes and bloom flashes
     * for users with photosensitive epilepsy or migraine sensitivity.
     * Persists across sessions.
     */
    setPhotosensitiveSafeMode(enabled) {
        this.photosensitiveSafeMode = !!enabled;
        if (this.flashGovernor && this.photosensitiveSafeMode) {
            this.flashGovernor.lastSource = null;
        }
        try { localStorage.setItem('vrclub.safeMode', this.photosensitiveSafeMode ? '1' : '0'); } catch (_) {}
        // Immediately quiet any in-flight strobe state
        if (this.photosensitiveSafeMode && this.strobes) {
            this.strobes.forEach((strobe) => {
                strobe.material.emissiveColor = this.cachedColors.black;
                if (strobe.light) strobe.light.intensity = 0;
                strobe.flashDuration = 0;
            });
            if (this.strobeFlashLight) this.strobeFlashLight.intensity = 0;
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

    /**
     * Toggle bass-driven controller haptics. Persists across sessions.
     */
    setBassHapticsEnabled(enabled) {
        this.bassHapticsEnabled = !!enabled;
        try { localStorage.setItem('vrclub.bassHaptics', this.bassHapticsEnabled ? '1' : '0'); } catch (_) {}
        log.info(`📳 Bass haptics: ${this.bassHapticsEnabled ? 'ON' : 'OFF'}`);
        return this.bassHapticsEnabled;
    }

    /**
     * Normalise the materials that arrive inside an avatar GLB.
     *
     * Runs ONCE per source file, not once per dancer: every clone shares these
     * materials, so a single pass covers the whole crowd.
     */
    _prepareAvatarMaterials(materials, garmentColor = null, hairColor = null) {
        const aniso = this.tierSettings.anisotropy;

        materials.forEach(mat => {
            // Exceeding the device light budget produces "Too many lights" and a
            // black character, so this applies to imported materials too.
            mat.maxSimultaneousLights = this.maxLights;

            // VR stereo rendering is hypersensitive to transparency and these GLBs
            // ship alpha channels they do not actually use - without this the crowd
            // renders see-through in the headset.
            mat.alpha = 1.0;
            mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
            if (mat.needAlphaBlending) mat.needAlphaBlending = () => false;
            if (mat.needAlphaTesting) mat.needAlphaTesting = () => false;

            // Depth write is what makes the crowd OCCLUDE the additive light beams
            // in rendering group 1 instead of letting them shine straight through.
            mat.disableDepthWrite = false;
            mat.forceDepthWrite = true;
            mat.backFaceCulling = true;

            if (garmentColor && (mat.name === 'MI_Peasant' || mat.name === 'MI_Ranger') && mat.albedoColor) {
                mat.albedoColor.copyFrom(garmentColor);
            }
            // The hair texture is a pale grey strand map; the material colour makes it silver, brunette or anything else.
            if (hairColor && /^MI_Hair/.test(mat.name) && mat.albedoColor) {
                mat.albedoColor.copyFrom(hairColor);
            }

            [mat.albedoTexture, mat.diffuseTexture].forEach(tex => {
                if (!tex) return;
                tex.hasAlpha = false;
                tex.anisotropicFilteringLevel = aniso;
            });

        });
    }

    /**
     * Clone one dancer out of a loaded AssetContainer and drop it into the club.
     *
     * @param {BABYLON.AssetContainer} container source GLB
     * @param {string} name                      unique node name
     * @param {BABYLON.Vector3} position         x/z placement; y is the floor to stand on
     * @param {number} facing                    world Y rotation, radians
     * @param {number} height                    real-world height in metres
     * @param {number} speedRatio                animation playback rate
     * @param {object} [options]
     * @param {string} [options.clip]            which clip to play when the GLB carries several
     *                                           (default 'Dance_Loop'); the rest are discarded
     * @param {string[]} [options.clips]         keep these clips instead of only `clip`, for a guest who changes
     *                                           pose at runtime (the mingling guest walks and talks). Only one
     *                                           plays at a time; VRClubAudioCrowd._playClip switches between them.
     * @param {boolean} [options.reactsToBeat]   false for guests who do not dance (default true)
     * @param {object} [options.ambient]          subtle yaw and idle-speed variation for a fixed bystander
     */
    _spawnAvatar(container, name, position, facing, height, speedRatio, options = {}) {
        // doNotInstantiate: these are skinned meshes, so each dancer needs its own
        // skeleton and animation group to move independently. cloneMaterials stays
        // false so the whole crowd still shares one set of materials and textures.
        const entry = container.instantiateModelsToScene(
            nodeName => `${name}_${nodeName}`,
            false,
            { doNotInstantiate: true }
        );

        const root = entry.rootNodes[0];
        if (!root) {
            log.warn(`  ❌ ${name}: container produced no root node`);
            return null;
        }

        root.name = name;
        root.position.copyFrom(position);
        root.rotationQuaternion = null;
        root.rotation.y = facing;
        root.scaling.setAll(1);
        root.computeWorldMatrix(true);

        // The three source GLBs are authored in wildly different units (one is
        // ~100x the others), so normalise on real-world height rather than
        // trusting the file's own scale.
        let bounds = root.getHierarchyBoundingVectors(true);
        const rawHeight = bounds.max.y - bounds.min.y;
        if (rawHeight > 1e-6) root.scaling.setAll(height / rawHeight);
        root.computeWorldMatrix(true);

        // Plant the feet on the requested surface. getHierarchyBoundingVectors()
        // already returns WORLD space, so this correction must not be re-scaled.
        bounds = root.getHierarchyBoundingVectors(true);
        root.position.y += position.y - bounds.min.y;
        root.computeWorldMatrix(true);

        const meshes = [];
        entry.rootNodes.forEach(node => {
            node.getChildMeshes().forEach(mesh => {
                // Group 0 = opaque. Beams live in group 1 with additive blending and
                // are depth-tested against whatever group 0 already wrote.
                mesh.renderingGroupId = 0;
                mesh.isPickable = false;
                // Skinned GLB bounds are authored from the bind pose and are not
                // reliable for stereo frustum culling after animation advances.
                // The balanced VR tier has only seven characters, so keeping these
                // meshes active is cheaper than characters disappearing per eye.
                mesh.alwaysSelectAsActiveMesh = true;
                meshes.push(mesh);
            });
        });

        // A multi-clip GLB (the leather-jacket guests) carries every pose it can strike. Keep the one this guest plays and drop
        // the others, so no hidden animation group keeps evaluating 60 joints.
        let groups = entry.animationGroups;
        const prefix = `${name}_`;
        const clipOf = group => (group.name.startsWith(prefix) ? group.name.slice(prefix.length) : group.name);
        let dance = null;
        let poses = null;
        if (options.repertoire && groups.some(group => clipOf(group) === 'Groove_Bounce')) {
            // A dancer who can do every move (the Quaternius people): keep the moves, start one, the choreographer
            // (CrowdDance, _updateCrowdDance) switches between them on the beat. Only one group plays at a time.
            const moves = new Map();
            groups.forEach(group => {
                if (options.repertoire.includes(clipOf(group))) moves.set(clipOf(group), group);
                else group.dispose();
            });
            const first = moves.get(options.clip || 'Dance_Loop') || moves.values().next().value;
            moves.forEach(group => { group.enableBlending = true; group.blendingSpeed = 0.08; });
            dance = { groups: moves, current: first, state: null };
            groups = [first];
        } else if (options.clips && groups.length > 1) {
            // A guest who changes pose at runtime: keep the poses it can strike, drop the rest. Only the started
            // group evaluates; _playClip() swaps them, blending out of whatever the previous one left.
            const kept = new Map();
            groups.forEach(group => {
                if (options.clips.includes(clipOf(group))) kept.set(clipOf(group), group);
                else group.dispose();
            });
            const first = kept.get(options.clip) || kept.values().next().value;
            kept.forEach(group => { group.enableBlending = true; group.blendingSpeed = 0.06; });
            if (first) {
                poses = { groups: kept, current: first };
                groups = [first];
            } else {
                groups = [];
            }
        } else if (groups.length > 1) {
            const wanted = options.clip || 'Dance_Loop';
            const chosen = groups.find(group => clipOf(group) === wanted) || groups[0];
            groups.forEach(group => { if (group !== chosen) group.dispose(); });
            groups = [chosen];
        }

        groups.forEach(group => {
            group.start(true);
            group.speedRatio = speedRatio;
            // Offset the phase, otherwise every clone of the same clip hits the same
            // pose on the same frame and the crowd looks like a chorus line.
            const span = group.to - group.from;
            if (span > 0) group.goToFrame(group.from + Math.random() * span);
        });

        const npc = {
            name,
            root,
            meshes,
            animations: groups,
            baseSpeed: speedRatio,
            // Guests who are not dancing keep their pose and their facing: no beat-driven tempo, no turning away.
            reactsToBeat: options.reactsToBeat !== false,
            homeYaw: options.reactsToBeat === false ? null : facing,
            avoidYaw: 0
        };
        if (dance) npc.dance = dance;
        if (poses) npc.poses = poses;
        if (options.ambient) {
            npc.ambient = {
                baseYaw: facing,
                yawRange: Math.max(0, options.ambient.yawRange || 0),
                speedVariation: Math.max(0, options.ambient.speedVariation || 0),
                period: Math.max(8, options.ambient.period || 18),
                phase: options.ambient.phase || 0
            };
        }
        npc.collider = this._attachOccupantCollider(root, name);
        this.npcAvatars.push(npc);

        return entry;
    }

    /**
     * Solid occupancy without a physics world. A static box at the feet is
     * enough: dancers do not translate, and the camera already carries an ellipsoid.
     */
    _attachOccupantCollider(root, name) {
        if (!root || !this.scene || !BABYLON.MeshBuilder) return null;
        const box = BABYLON.MeshBuilder.CreateBox(`${name}_occupant`, {
            width: 0.46,
            height: 1.7,
            depth: 0.46
        }, this.scene);
        box.position.set(root.position.x, root.position.y + 0.85, root.position.z);
        box.isVisible = false;
        box.isPickable = false;
        box.checkCollisions = true;
        return box;
    }

    // ───────────────────────── the player's own body ─────────────────────────
    //
    // A guest is not a crowd NPC: there is no walk or reach clip to play, and they must
    // move freely. AvatarRig poses the same dancer skeleton from where the player is and
    // where they look (and, in VR, where their hands are), so the body walks, turns,
    // crouches and reaches instead of replaying a dance.

    /** 'female' or 'male': the two UE-skeleton dancer sources the rig can wear. */
    getLocalAvatarStyle() {
        try { return localStorage.getItem('vrclub.avatarStyle') === 'male' ? 'male' : 'female'; }
        catch (_) { return 'female'; }
    }

    setLocalAvatarStyle(style) {
        const next = style === 'male' ? 'male' : 'female';
        try { localStorage.setItem('vrclub.avatarStyle', next); } catch (_) { /* private browsing */ }
        if (this._localRig) { this._localRig.dispose(); this._localRig = null; }
        this._spawnLocalPlayerBody();
        return next;
    }

    /** Two fictional CC0 DJs, derived from the guest files, with rigged CC0 headphones. */
    static get DJ_LOOKS() {
        if (!this._djLooks) {
            this._djLooks = Object.freeze({
                male: Object.freeze({
                    url: './js/models/avatars/club-dj-male.glb', height: 1.78,
                    garment: new BABYLON.Color3(0.10, 0.10, 0.12), hair: new BABYLON.Color3(0.20, 0.12, 0.07)
                }),
                female: Object.freeze({
                    url: './js/models/avatars/club-dj-female.glb', height: 1.68,
                    garment: new BABYLON.Color3(0.42, 0.42, 0.45), hair: new BABYLON.Color3(1.0, 0.88, 0.62)
                })
            });
        }
        return this._djLooks;
    }

    /**
     * Every character file the room can show, by index; the crowd and guest slots point at these through
     * `sourceIndex(id)`. Files load on demand per quality tier (see `_requiredCrowdSources`).
     *  - dancerF/dancerM: the UE-rig peasant dancers. Only the player's own body wears them now (AvatarRig).
     *  - hipHop/house/rumba: legacy slot ids, now CC0 Modular Men/Women replacements; no Mixamo files ship.
     *  - bartender: the Quaternius female guest, in a black work outfit through a tint.
     *  - f1..f8, m1..m9: the Modular Women / Modular Men cast built by scripts/build-crowd-glbs.mjs (club-crowd-*.glb):
     *    one draw each, vertex-coloured, the club's own dance and idle clips retargeted onto them.
     *  - bouncer: the same build, a man in a black suit, at the street door (see _streetSlots).
     */
    static get AVATAR_SOURCES() {
        if (!this._avatarSources) {
            // Full literal paths on purpose: scripts/build.mjs ships only the model paths it finds written out in the
            // source, so a path assembled from parts would silently be missing from the production build.
            this._avatarSources = Object.freeze([
                { id: 'dancerF', url: './js/models/avatars/club-dancer-female.glb', garmentColor: new BABYLON.Color3(0.45, 0.82, 1.0) },
                { id: 'dancerM', url: './js/models/avatars/club-dancer-male.glb', garmentColor: new BABYLON.Color3(1.0, 0.42, 0.68) },
                { id: 'hipHop', url: './js/models/avatars/club-crowd-m1.glb' },
                { id: 'house', url: './js/models/avatars/club-crowd-m9.glb' },
                { id: 'rumba', url: './js/models/avatars/club-crowd-f4.glb' },
                // The bartender: the female guest file as its own container, so it can carry a black work outfit
                // without recolouring anyone else.
                { id: 'bartender', url: './js/models/avatars/club-guest-female.glb', garmentColor: new BABYLON.Color3(0.16, 0.16, 0.19) },
                { id: 'f1', url: './js/models/avatars/club-crowd-f1.glb' },
                { id: 'f2', url: './js/models/avatars/club-crowd-f2.glb' },
                { id: 'f3', url: './js/models/avatars/club-crowd-f3.glb' },
                { id: 'f4', url: './js/models/avatars/club-crowd-f4.glb' },
                { id: 'f5', url: './js/models/avatars/club-crowd-f5.glb' },
                { id: 'f6', url: './js/models/avatars/club-crowd-f6.glb' },
                { id: 'f7', url: './js/models/avatars/club-crowd-f7.glb' },
                { id: 'f8', url: './js/models/avatars/club-crowd-f8.glb' },
                { id: 'm1', url: './js/models/avatars/club-crowd-m1.glb' },
                { id: 'm2', url: './js/models/avatars/club-crowd-m2.glb' },
                { id: 'm3', url: './js/models/avatars/club-crowd-m3.glb' },
                { id: 'm4', url: './js/models/avatars/club-crowd-m4.glb' },
                { id: 'm5', url: './js/models/avatars/club-crowd-m5.glb' },
                { id: 'm6', url: './js/models/avatars/club-crowd-m6.glb' },
                { id: 'm7', url: './js/models/avatars/club-crowd-m7.glb' },
                { id: 'm8', url: './js/models/avatars/club-crowd-m8.glb' },
                { id: 'm9', url: './js/models/avatars/club-crowd-m9.glb' },
                // The bouncer at the street door (black suit; carries the guest idle clips). Never a player avatar.
                { id: 'bouncer', url: './js/models/avatars/club-crowd-bouncer.glb' }
            ].map(source => Object.freeze(source)));
        }
        return this._avatarSources;
    }

    /** Index of a source in AVATAR_SOURCES by id, or -1. */
    static sourceIndex(id) {
        return VRClubAudioCrowd.AVATAR_SOURCES.findIndex(source => source.id === id);
    }

    /** Local DJ preference, independent of music and the room host. */
    _initialDJId() {
        try {
            if (localStorage.getItem('vrclub.questDJ') === 'female') return 'female';
        } catch (_) { /* storage blocked */ }
        return 'male';
    }

    async chooseDJ(id) {
        if (!VRClubAudioCrowd.djLook(id)) throw new Error('Choose Male DJ or Female DJ.');
        if (!await this.setDJ(id) && this.isPeopleVisible('dj')) throw new Error('The DJ could not load. Try again later.');
        this._djWanted = id;
        try { localStorage.setItem('vrclub.questDJ', id); }
        catch (error) {
            log.warn(`DJ preference could not be saved: ${error.message}`);
            this.showErrorMessage('The DJ changed, but this device could not save your choice.');
        }
        return true;
    }

    /** Load one avatar GLB into a container with its materials normalised. Null when it cannot be loaded. */
    async _loadAvatarSource(url, garmentColor = null, hairColor = null) {
        try {
            const container = await BABYLON.SceneLoader.LoadAssetContainerAsync("", url, this.scene);
            this._prepareAvatarMaterials(container.materials, garmentColor, hairColor);
            this._restoreLightBudgets();
            this._avatarContainers.push(container);
            return container;
        } catch (error) {
            log.warn(`  ❌ Failed to load avatar source ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * The glTF loader raises EVERY material in the scene to the scene's light count when a file lands (even into a
     * container), so a load after start-up (a DJ swap, a tier top-up, the people outside the street door) left the club's
     * and the street's lit materials asking for more lights than the device binds. Put back only the ones it changed, so
     * nothing else recompiles.
     */
    _restoreLightBudgets() {
        const scene = this.scene;
        if (!scene || !scene.materials || !Number.isFinite(this.maxLights)) return;
        const blocked = scene.blockMaterialDirtyMechanism;
        scene.blockMaterialDirtyMechanism = false;
        for (const material of scene.materials) {
            if (material.maxSimultaneousLights === undefined || material.disableLighting) continue;
            if (material.maxSimultaneousLights === this.maxLights) continue;
            if (material.isFrozen) material.unfreeze();
            material.maxSimultaneousLights = this.maxLights;
            if (material.markAsDirty) material.markAsDirty(BABYLON.Material.LightDirtyFlag);
        }
        scene.blockMaterialDirtyMechanism = blocked;
    }

    /**
     * Put the DJ for `id` ('male' | 'female') behind the decks. Swaps are queued, so a quick double switch
     * ends on the last one, and the first call loads the file (each DJ is loaded once and kept).
     * @returns {Promise<boolean>} true when the requested DJ is at the decks
     */
    /** The look for a DJ id, or null (an own key only: `__proto__` and `constructor` are not DJs). */
    static djLook(id) {
        const looks = VRClubAudioCrowd.DJ_LOOKS;
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(looks, id) ? looks[id] : null;
    }

    setDJ(id) {
        if (!VRClubAudioCrowd.djLook(id)) return Promise.resolve(false);
        // A selection during startup waits for init, which places the initial DJ itself.
        this._djQueue = (this._djQueue || Promise.resolve(this.initPromise).catch(() => {}))
            .then(() => (this._disposed ? false : this._applyDJ(id)))
            .catch(() => false);
        return this._djQueue;
    }

    async _applyDJ(id) {
        const look = VRClubAudioCrowd.djLook(id);
        if (!look) return false;
        // Sent home: remember the local choice and fetch nothing until the DJ is asked back.
        if (!this.isPeopleVisible('dj')) { this._djWanted = id; return false; }
        if (this._djId === id) return true;
        this._djContainers = this._djContainers || {};
        if (!this._djContainers[id]) this._djContainers[id] = await this._loadAvatarSource(look.url, look.garment, look.hair);
        const container = this._djContainers[id];
        if (!container || this._disposed) return false;

        // The previous DJ leaves: skeleton, clip, collider and all.
        const previous = this.npcAvatars.findIndex(npc => npc.name === 'djPerformer');
        if (previous >= 0) {
            const npc = this.npcAvatars[previous];
            if (npc.collider) { try { npc.collider.dispose(); } catch (_) { /* ignore */ } }
            if (this._djEntry) { try { this._djEntry.dispose(); } catch (_) { /* ignore */ } }
            this.npcAvatars.splice(previous, 1);
        }
        this._djRig = null;
        this._djPerformer = null;
        this._djEntry = this._spawnPerformingDJ(container, look)
            || this._spawnAvatar(container, 'djPerformer', new BABYLON.Vector3(0, 0.5, -19.4), 0, look.height, 0.55, { clip: 'Idle_Loop' });
        this._djId = id;
        if (this._refreshContactShadows) this._refreshContactShadows();
        if (this._refreshShadowCasters) this._refreshShadowCasters();
        return true;
    }

    _avatarContainerFor(style) {
        const list = this._crowdSourceContainers;
        if (!list) return null;
        return (style === 'male' ? list[1] : list[0]) || list[0] || list[1] || null;
    }

    // ───────────────────────── the DJ, performing ─────────────────────────
    //
    // The DJ files carry one idle clip. A performing DJ is an AvatarRig (the player-body driver) whose pose comes from
    // DJPerformer every frame: mixing, cueing in the headphones, looking at the crowd, hands up on a drop, waving at a
    // visitor, nodding and bouncing on the beat. If the rig cannot drive the file, the idle clip stays (the caller).

    /** The controller on the DJ table, measured from the scene, with the numbers it had when this was written as fallback. */
    _djDesk() {
        const mesh = this.scene && this.scene.getMeshByName && this.scene.getMeshByName('console_final');
        if (mesh && mesh.isEnabled()) {
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            return {
                cx: (box.minimumWorld.x + box.maximumWorld.x) / 2,
                near: box.minimumWorld.z, far: box.maximumWorld.z,
                top: box.maximumWorld.y, halfWidth: (box.maximumWorld.x - box.minimumWorld.x) / 2
            };
        }
        return { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    }

    /** @returns {{dispose: function}|null} the DJ, or null when the rig cannot drive this file */
    _spawnPerformingDJ(container, look) {
        if (typeof AvatarRig === 'undefined' || typeof DJPerformer === 'undefined') return null;
        // Eyes ~93% of the standing height (the height includes hair and headphones).
        const eyeHeight = look.height * 0.93;
        const rig = new AvatarRig(this, container, { eyeHeight });
        if (!rig.ok) { rig.dispose(); return null; }
        rig.root.name = 'djPerformer';
        const desk = this._djDesk();
        // Close behind the table: the arms (~0.49 m shoulder to wrist) reach the controller's near half only when the
        // eyes are ~0.18 m behind its edge and the DJ leans in; the hips then stay behind the table (z -19). The old
        // idle DJ stood 0.5 m further back, out of reach. The riser's top is 0.5 m.
        const performer = new DJPerformer({ x: desk.cx, z: desk.near - 0.18, groundY: 0.5, eyeHeight, desk });
        rig.update(1 / 60, performer.update(1 / 60, { hasAudio: false }, null));
        const npc = {
            name: 'djPerformer', root: rig.root, meshes: rig.meshes, animations: [], baseSpeed: 1,
            reactsToBeat: false, homeYaw: null, avoidYaw: 0
        };
        npc.collider = this._attachOccupantCollider(rig.root, 'djPerformer');
        if (npc.collider) npc.collider.position.set(desk.cx, 0.5 + 0.85, desk.near - 0.45);
        this.npcAvatars.push(npc);
        this._djRig = rig;
        this._djPerformer = performer;
        this._djMusic = { hasAudio: false, beatPhase: 0, bar: 0, energy: 0, drop: false, bpm: 120 };
        this._djVisitors = [];
        this._djLastSetPiece = null;
        this._djLastMovement = null;
        return { dispose: () => { rig.dispose(); if (this._djRig === rig) { this._djRig = null; this._djPerformer = null; } } };
    }

    /** Per frame: tell the DJ where the music is and who is near, then pose the rig. */
    _updateDJ(dt, audioData) {
        const rig = this._djRig, performer = this._djPerformer;
        if (!rig || !rig.ok || !performer || !rig.root || !rig.root.isEnabled()) return;
        const music = this._djMusic;
        const vj = this.vjDirector, show = this.showDirector;
        music.hasAudio = !!(audioData && audioData.hasAudio);
        music.bpm = (vj && vj.bpm) || 120;
        // Beat phase inside the beat, from the bar phase (0..1 over four beats).
        const barPhase = Number.isFinite(this.barPhase) ? this.barPhase : 0;
        music.beatPhase = (barPhase * 4) % 1;
        music.bar = vj ? Math.floor(vj.beatNumber / 4) : 0;
        music.energy = audioData && typeof audioData.energy === 'number' ? audioData.energy
            : (show && Number.isFinite(show._energy) ? Math.min(1, show._energy / 0.45) : 0.5);
        // A drop: the show's release set-piece starting, or it entering IGNITION.
        let drop = false;
        if (show) {
            const piece = show._setPiece ? show._setPiece.title : null;
            if (piece !== this._djLastSetPiece) {
                if (show._setPiece === show.setPieces.release) drop = true;
                this._djLastSetPiece = piece;
            }
            if (show._movementName !== this._djLastMovement) {
                if (show._movementName === 'ignition' && this._djLastMovement !== null) drop = true;
                this._djLastMovement = show._movementName;
            }
        }
        music.drop = drop;
        // Who might walk up to the booth: this guest, and the other people in the room.
        const visitors = this._djVisitors;
        visitors.length = 0;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        if (pos) {
            const me = this._djMe || (this._djMe = { x: 0, z: 0, id: 'me' });
            me.x = pos.x; me.z = pos.z;
            visitors.push(me);
        }
        if (this.avatarManager && this.avatarManager.remotes) {
            for (const peer of this.avatarManager.remotes.values()) {
                if (!peer.root || peer.hidden) continue;
                const v = peer._djVisitor || (peer._djVisitor = { x: 0, z: 0, id: peer.id });
                v.x = peer.root.position.x; v.z = peer.root.position.z;
                visitors.push(v);
            }
        }
        rig.update(dt, performer.update(dt, music, visitors));
    }

    _playerCamera() {
        return (this.isInVRMode && this.vrHelper && this.vrHelper.baseExperience && this.vrHelper.baseExperience.camera)
            || this.camera
            || (this.scene && this.scene.activeCamera);
    }

    _spawnLocalPlayerBody() {
        if (this._localRig || typeof AvatarRig === 'undefined') return;
        const container = this._avatarContainerFor(this.getLocalAvatarStyle());
        if (!container) return;
        const cam = this._playerCamera();
        const pos = cam ? (cam.globalPosition || cam.position) : null;
        // Desktop guests stand at the club's fixed eye height: the camera may not have been
        // placed yet when the crowd finishes loading, and a stale height would make the body
        // small and float it. In VR the measured head height is the player's own.
        const eye = this.isInVRMode && pos && Number.isFinite(pos.y) ? Math.min(2.0, Math.max(1.2, pos.y)) : 1.7;
        const rig = new AvatarRig(this, container, { eyeHeight: eye, hideHead: true });
        this._localRig = rig.ok ? rig : null;
    }

    /** One controller's hand pose into a reusable object, or null when untracked. */
    _handPose(side, head) {
        const hand = side === 'left' ? (this._handL || (this._handL = {})) : (this._handR || (this._handR = {}));
        const ctrls = this._xrControllers;
        for (let i = 0; i < ctrls.length; i++) {
            const c = ctrls[i];
            if (!c || !c.inputSource || c.inputSource.handedness !== side) continue;
            const grip = c.grip || c.pointer, aim = c.pointer || c.grip;
            if (!grip || !aim) return null;
            const p = grip.getAbsolutePosition();
            // An untracked controller sits at the origin or far from the head; reaching
            // for it would drag the arm across the room.
            const dx = p.x - head.x, dy = p.y - head.y, dz = p.z - head.z;
            if ((p.x === 0 && p.y === 0 && p.z === 0) || dx * dx + dy * dy + dz * dz > 2.25) return null;
            const dir = this._handDir || (this._handDir = new BABYLON.Vector3());
            hand.x = p.x; hand.y = p.y; hand.z = p.z;
            aim.getDirectionToRef(BABYLON.Axis.Z, dir);
            hand.fx = dir.x; hand.fy = dir.y; hand.fz = dir.z;
            aim.getDirectionToRef(BABYLON.Axis.Y, dir);
            hand.ux = dir.x; hand.uy = dir.y; hand.uz = dir.z;
            return hand;
        }
        return null;
    }

    _updateLocalPlayerBody(dt) {
        const rig = this._localRig;
        if (!rig || !rig.ok) return;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        if (!pos) return;
        const pose = this._localPose || (this._localPose = {
            x: 0, z: 0, groundY: 0, eyeY: 1.7, headYaw: 0, headPitch: 0, left: null, right: null
        });
        const dir = this._localDir || (this._localDir = new BABYLON.Vector3());
        cam.getDirectionToRef(BABYLON.Axis.Z, dir);
        pose.headYaw = Math.atan2(dir.x, dir.z);
        pose.headPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        pose.x = pos.x; pose.z = pos.z; pose.eyeY = pos.y;
        pose.groundY = (pos.x > -3 && pos.x < 3 && pos.z < -16 && pos.z > -20.5) ? 0.5 : (this._walkLevel || 0);
        if (this.isInVRMode) {
            if (!this._rigInVR) { this._rigInVR = true; rig.setEyeHeight(Math.min(2.0, Math.max(1.0, pos.y - pose.groundY))); }
            pose.left = this._handPose('left', pos);
            pose.right = this._handPose('right', pos);
        } else {
            if (this._rigInVR) rig.setEyeHeight(1.7);
            this._rigInVR = false;
            pose.left = null; pose.right = null;
        }
        rig.update(dt, pose);
    }
    async createDancingNPCs() {
        // === CROWD + DJ ===
        // The crowd is built by loading each source file ONCE into an AssetContainer and then
        // instantiating it per dancer. That gives every dancer its own skeleton and
        // animation group (so nobody moves in lockstep) off a single download and a
        // single set of geometry buffers and materials.
        const crowdSize = Math.max(0, this.tierSettings.crowdSize | 0);
        const at = id => VRClubAudioCrowd.sourceIndex(id);

        // Hand-placed rather than randomised: the list is ordered so that the first
        // N slots are already well spread AND varied (men and women, every skin tone, silver heads, the punks), which
        // means a `balanced` tier still gets a diverse, even crowd instead of everyone bunched in one corner.
        // `facing` is an offset from "square on to the DJ booth".
        // None of these fall inside the DJ platform footprint (x -3..3, z -20..-16).
        const crowdSlots = [
            { x: -3.4, z: -13.4, src: at('f1'), height: 1.70, facing:  0.10 },
            { x:  3.2, z: -13.0, src: at('m2'), height: 1.80, facing: -0.12 },
            { x:  0.4, z: -10.8, src: at('hipHop'), height: 1.74, facing:  0.04 },
            { x: -6.0, z: -11.6, src: at('m1'), height: 1.86, facing:  0.28 },
            { x:  5.6, z: -11.0, src: at('f3'), height: 1.66, facing: -0.26 },
            { x: -1.4, z:  -8.6, src: at('f2'), height: 1.64, facing:  0.08 },
            { x:  2.6, z: -15.0, src: at('m3'), height: 1.78, facing: -0.06 },
            { x: -4.6, z: -15.2, src: at('f4'), height: 1.72, facing:  0.16 },
            { x:  6.6, z:  -8.4, src: at('rumba'), height: 1.77, facing: -0.34 },
            { x: -6.8, z:  -8.0, src: at('m7'), height: 1.84, facing:  0.36 },
            { x:  1.6, z:  -7.4, src: at('f5'), height: 1.68, facing: -0.10 },
            { x: -7.4, z: -13.8, src: at('house'), height: 1.73, facing:  0.42 },
            { x:  7.2, z: -13.6, src: at('m5'), height: 1.82, facing: -0.40 },
            { x: -0.6, z:  -6.4, src: at('m9'), height: 1.76, facing:  0.02 }
        ];
        this._crowdSlots = crowdSlots;

        // Only the files the active tier shows are fetched and parsed: a balanced headset needs six dancers, not
        // seventeen characters. `undefined` in this list means "not requested yet", `null` means "failed to load".
        this._crowdSourceContainers = new Array(VRClubAudioCrowd.AVATAR_SOURCES.length);
        this._crowdSourcePending = {};
        const required = this._requiredCrowdSources();
        log.info(`🕺 Loading ${required.length} of ${VRClubAudioCrowd.AVATAR_SOURCES.length} avatar sources for a crowd of ${crowdSize}...`);
        await this._loadCrowdSources(required);
        if (this._disposed) return;
        const containers = this._crowdSourceContainers;
        if (!this._availableCrowdSources || this._availableCrowdSources.length === 0) {
            log.warn('⚠️ No avatar sources loaded — the club will be empty');
            return;
        }

        // Do not instantiate hidden upper-tier dancers on the startup critical path. Raising the quality tier later
        // fetches the extra characters (see _applyCrowdSize) and adds them without a reload.
        this._spawnCrowdTo(crowdSize);

        // === THE DJ ===
        // Stands on the 0.5 m riser in the 1 m gap between the LED wall (z=-20) and
        // the deck plinth (z=-19), facing the floor. Playback is dialled well down so
        // they read as working the decks rather than raving in the crowd. The local generic choice owns the look.
        await this._applyDJ(this._initialDJId());

        // === THE BARTENDER ===
        // Behind the counter, washing the persistent service glass through AvatarRig so her hands can actually reach
        // the counter. She is not a guest slot (no tier removes her) and takes the bar's accent light like the stools.
        const barCrew = containers[at('bartender')];
        if (barCrew) {
            let bartender = this._spawnWorkingBartender(barCrew);
            if (!bartender) {
                const spot = window.VenueLayout.bar.bartender;
                this._spawnAvatar(barCrew, 'bartender', new BABYLON.Vector3(spot.x, 0, spot.z), -Math.PI / 2, 1.70, 0.95,
                    { clip: 'Idle_Talking_Loop', reactsToBeat: false });
                bartender = this.npcAvatars.find(npc => npc.name === 'bartender');
            }
            if (bartender) {
                bartender.slotYaw = -Math.PI / 2;
                bartender.slotClip = 'Idle_Talking_Loop';
                this._extendAccentLight(this._barLight, bartender.meshes);
                this._createBartenderGlass(bartender);
            }
        }

        this._spawnLocalPlayerBody();
        this._applyCrowdSize();
        this._refreshShadowCasters();

        log.info(`✅ Crowd ready: ${this.npcAvatars.length} animated characters (incl. the DJ)`);
    }

    _spawnWorkingBartender(container) {
        if (typeof AvatarRig === 'undefined') return null;
        const rig = new AvatarRig(this, container, { eyeHeight: 1.58 });
        if (!rig.ok) { rig.dispose(); return null; }
        const spot = window.VenueLayout.bar.bartender;
        rig.root.name = 'bartender';
        const hand = () => ({ x: 0, y: 0, z: 0, fx: -1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0 });
        const pose = {
            x: spot.x, z: spot.z, groundY: 0, eyeY: 1.58, headYaw: -Math.PI / 2, headPitch: 0, lean: 0.18,
            left: hand(), right: hand()
        };
        const npc = {
            name: 'bartender',
            root: rig.root,
            meshes: rig.meshes,
            animations: [],
            baseSpeed: 1,
            reactsToBeat: false,
            homeYaw: null,
            avoidYaw: 0,
            rig
        };
        npc.collider = this._attachOccupantCollider(rig.root, 'bartender');
        this.npcAvatars.push(npc);
        this._bartenderRig = rig;
        this._bartenderNpc = npc;
        this._bartenderPose = pose;
        this._bartenderWashTime = 0;
        this._updateBartender(1 / 60, null);
        return npc;
    }

    _updateBartender(dt, service) {
        const rig = this._bartenderRig;
        const pose = this._bartenderPose;
        if (!rig || !pose || !rig.root.isEnabled()) return;
        this._bartenderWashTime += dt;
        const bar = window.VenueLayout.bar;
        const counter = this._barGlass ? this._barGlass.counter : null;
        const washX = bar.bartender.x - 0.42;
        const wave = Math.sin(this._bartenderWashTime * 4.2);
        let rightX = washX, rightY = 1.23 + wave * 0.025, rightZ = bar.bartender.z - 0.04;
        let reach = 0;
        if (counter && service) {
            const raw = service.duration > 0 ? Math.min(1, Math.max(0, 1 - service.timer / service.duration)) : 1;
            if (service.activity === 'serve') reach = raw;
            else if (service.activity === 'served') reach = 1 - raw;
            else if (service.activity === 'clear') reach = raw < 0.5 ? raw * 2 : (1 - raw) * 2;
            reach = reach * reach * (3 - 2 * reach);
            rightX += (counter.x - rightX) * reach;
            rightY += (counter.y - rightY) * reach;
            rightZ += (counter.z - rightZ) * reach;
        }
        pose.lean = 0.12 + reach * 0.42;
        pose.x = bar.bartender.x - reach * 0.48;
        pose.z = bar.bartender.z + reach * 0.45;
        pose.right.x = rightX;
        pose.right.y = rightY;
        pose.right.z = rightZ;
        let leftX = washX + 0.02, leftY = 1.20 - wave * 0.02, leftZ = bar.bartender.z + 0.08;
        if (counter) {
            leftX += (counter.x - leftX) * reach;
            leftY += (counter.y - leftY) * reach;
            leftZ += (counter.z - leftZ) * reach;
        }
        pose.left.x = leftX;
        pose.left.y = leftY;
        pose.left.z = leftZ;
        pose.headYaw = Math.atan2(rightX - bar.bartender.x, rightZ - bar.bartender.z);
        rig.bodyYaw = pose.headYaw;
        rig.turning = false;
        rig.update(dt, pose);
        const collider = this._bartenderNpc && this._bartenderNpc.collider;
        if (collider) {
            collider.position.set(rig.root.position.x, rig.root.position.y + 0.85, rig.root.position.z);
        }
    }

    /**
     * Guests who are not on the dance floor: a pair talking by the right wall, relaxed watchers, someone nodding
     * along to the music, and a balcony guest resting both hands on the rail. Clubs are not only dancers, and the side
     * walls were empty. Phone calls stay outside, away from the PA; the bouncer's folded arms suit his job rather than
     * being repeated on the side-wall guests.
     * Same hand-placed ordering rule as the crowd: the first N are already spread around the room, so a lower tier
     * still looks populated (and its first two are the talking pair). Yaw 0 faces +z (the entrance side), PI faces
     * the DJ, +PI/2 faces +x. Every slot is well clear of the side walls, the truss legs and the DJ riser.
     */
    _guestSlots() {
        const towardDJ = (x, z) => Math.atan2(-x, -18 - z);
        const at = id => VRClubAudioCrowd.sourceIndex(id);
        // The poses a guest can change into at runtime. Only the mingling guest walks; the people he stops at turn
        // to him and talk back, so they keep their own pose plus the talking one.
        const talks = clip => (clip === 'Idle_Talking_Loop' ? undefined : [clip, 'Idle_Talking_Loop']);
        return [
            // The talking pair stands off the counter (x 9.7 is its front, the stools are at x 9.2).
            { src: at('m4'), clip: 'Idle_Talking_Loop', x: 7.9, z: -9.1, yaw: 0.35, height: 1.80,
                ambient: { speedVariation: 0.035, period: 19, phase: 0.4 } },
            { src: at('f6'), clip: 'Idle_Talking_Loop', x: 7.9, z: -8.1, yaw: Math.PI + 0.35, height: 1.66,
                ambient: { speedVariation: 0.04, period: 23, phase: 2.1 } },
            // The one guest who does not stay put: he walks the room and joins the others' conversations
            // (_minglerRoute, _updateMingler), which is why he carries the walk and both idles.
            { src: at('m6'), clip: 'Idle_Loop', x: -8.2, z: -10.8, yaw: Math.PI / 2 - 0.2, height: 1.84,
                mingles: true, clips: ['Walk', 'Idle_Loop', 'Idle_Talking_Loop', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop'] },
            // Facing the mezzanine rail, both hands planted on it while her head slowly scans the dance floor. The
            // walking guest stops beside her at the rail and, after a look at the floor, turns to talk with her.
            { src: at('f7'), clip: 'Idle_Railing_Loop', x: -10.02, y: 3.0, z: -13.9, yaw: Math.PI / 2, height: 1.66,
                clips: talks('Idle_Railing_Loop'), ambient: { speedVariation: 0.025, period: 27, phase: 1.2 } },
            { src: at('f8'), clip: 'Idle_Loop', x: -8.4, z: -6.5, yaw: Math.PI / 2 + 0.6, height: 1.68,
                clips: talks('Idle_Loop'), ambient: { yawRange: 0.16, speedVariation: 0.045, period: 21, phase: 2.8 } },
            { src: at('m8'), clip: 'Yes', x: 7.7, z: -12.6, yaw: towardDJ(7.7, -12.6), height: 1.77,
                ambient: { yawRange: 0.1, speedVariation: 0.03, period: 25, phase: 4.1 } },
            { src: at('f6'), clip: 'Idle_Loop', x: -8.4, z: -14.4, yaw: towardDJ(-8.4, -14.4), height: 1.63,
                clips: talks('Idle_Loop'), ambient: { yawRange: 0.14, speedVariation: 0.05, period: 18, phase: 5.3 } },
            { src: at('m4'), clip: 'Idle_Loop', x: 9.4, z: -15.8, yaw: towardDJ(9.4, -15.8) + 0.4, height: 1.70,
                ambient: { yawRange: 0.12, speedVariation: 0.04, period: 24, phase: 0.9 } }
        ];
    }

    /**
     * Source indices the active tier shows: the player's body, the bartender, the first N dancers and the first N
     * guests. A group the visitor has sent home is not fetched at all (see isPeopleVisible); turning it back on
     * tops up the missing files in the background.
     */
    _requiredCrowdSources(crowdSize = this.isPeopleVisible('dancers') ? this.tierSettings.crowdSize : 0,
        guestSize = this.isPeopleVisible('bystanders') ? this.tierSettings.guestSize : 0) {
        const need = new Set([VRClubAudioCrowd.sourceIndex('dancerF'), VRClubAudioCrowd.sourceIndex('dancerM')]);
        if (this.isPeopleVisible('bystanders')) need.add(VRClubAudioCrowd.sourceIndex('bartender'));
        (this._crowdSlots || []).slice(0, Math.max(0, crowdSize | 0)).forEach(slot => need.add(slot.src));
        this._guestSlots().slice(0, Math.max(0, guestSize | 0)).forEach(slot => need.add(slot.src));
        return [...need].filter(index => index >= 0);
    }

    /** Fetch one source once, however many callers ask. Resolves to its container, or null when it cannot load. */
    _loadCrowdSource(index) {
        const pending = this._crowdSourcePending || (this._crowdSourcePending = {});
        if (!pending[index]) {
            const source = VRClubAudioCrowd.AVATAR_SOURCES[index];
            pending[index] = this._loadAvatarSource(source.url, source.garmentColor).then(container => {
                if (this._crowdSourceContainers) this._crowdSourceContainers[index] = container;
                return container;
            });
        }
        return pending[index];
    }

    async _loadCrowdSources(indices) {
        for (const index of indices) {
            if (this._disposed) return;
            await this._loadCrowdSource(index);
        }
        this._availableCrowdSources = (this._crowdSourceContainers || []).filter(Boolean);
    }
    _spawnGuestsTo(target) {
        if (!this._crowdSourceContainers) return;
        const existing = new Set(this.npcAvatars.filter(npc => npc.name.startsWith('guest')).map(npc => npc.name));
        const slots = this._guestSlots();
        slots.slice(0, Math.min(Math.max(0, target | 0), slots.length)).forEach((slot, index) => {
            const name = `guest${index}`;
            const source = this._crowdSourceContainers[slot.src];
            // Only the multi-clip guest files carry these poses; without them there is nothing sensible to play.
            if (existing.has(name) || !source) return;
            this._spawnAvatar(source, name, new BABYLON.Vector3(slot.x, slot.y || 0, slot.z), slot.yaw, slot.height,
                0.9 + (index % 3) * 0.06,
                { clip: slot.clip, clips: slot.clips, reactsToBeat: false, ambient: slot.ambient });
            const npc = this.npcAvatars[this.npcAvatars.length - 1];
            if (!npc || npc.name !== name) return;
            // Where this guest stands and what it does when nobody is talking to it: the mingler returns
            // everyone it visited to exactly this.
            npc.slotYaw = slot.yaw;
            npc.slotClip = slot.clip;
            if (slot.mingles) this._startMingling(npc, slot);
        });
    }

    _spawnCrowdTo(target) {
        if (!this._crowdSlots || !this._crowdSourceContainers || !this._availableCrowdSources?.length) return;
        const existing = new Set(this.npcAvatars
            .filter(npc => npc.name.startsWith('dancer'))
            .map(npc => npc.name));
        const limit = Math.min(Math.max(0, target | 0), this._crowdSlots.length);

        this._crowdSlots.slice(0, limit).forEach((slot, index) => {
            const name = `dancer${index}`;
            if (existing.has(name)) return;
            // `undefined` = this tier's top-up is still fetching the file (it spawns afterwards); `null` = it failed,
            // so any loaded character stands in rather than leaving a hole.
            const own = this._crowdSourceContainers[slot.src];
            if (own === undefined) return;
            const source = own || this._availableCrowdSources[index % this._availableCrowdSources.length];
            if (!source) return;
            this._spawnAvatar(
                source,
                name,
                new BABYLON.Vector3(slot.x, 0, slot.z),
                Math.PI + slot.facing,
                slot.height,
                0.85 + (index % 5) * 0.07,
                // All floor dancers use the CC0 repertoire.
                { repertoire: VRClubAudioCrowd.DANCE_MOVES }
            );
        });
    }

    /**
     * Grounding: every character gets a soft dark blob on the floor beneath it. The club is lit from above by a
     * few narrow beams and nothing else casts a shadow on the floor, so without this people hover (the shadow
     * generators cover only the DJ gear). One quad with a thin instance per enabled character: one draw call,
     * no light, no per-frame work. Characters do not translate, so it is rebuilt only when the set of enabled
     * ones changes (_applyCrowdSize).
     */
    _refreshContactShadows() {
        if (!this.scene || !this.npcAvatars || typeof BABYLON.MeshBuilder === 'undefined') return;
        let shadows = this._contactShadows;
        if (!shadows) {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            // A soft Gaussian-ish falloff: dense under the feet, gone at the edge.
            for (const [stop, alpha] of [[0, 0.9], [0.2, 0.78], [0.4, 0.5], [0.6, 0.22], [0.8, 0.06], [1, 0]]) {
                gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
            }
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
            const texture = new BABYLON.DynamicTexture('contactShadowGradient', canvas, this.scene, false);
            texture.hasAlpha = true;
            texture.update();

            const material = new BABYLON.StandardMaterial('contactShadowMat', this.scene);
            material.diffuseColor = new BABYLON.Color3(0, 0, 0);
            material.specularColor = new BABYLON.Color3(0, 0, 0);
            material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            material.opacityTexture = texture;
            material.alpha = 0.8;
            material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
            material.disableLighting = true;
            material.backFaceCulling = false;
            material.disableDepthWrite = true;
            material.depthFunction = BABYLON.Constants.LEQUAL;
            material.freeze();

            const mesh = BABYLON.MeshBuilder.CreateGround('contactShadows', { width: 1, height: 1 }, this.scene);
            mesh.material = material;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true; // instances live far from the base mesh's bounds
            mesh.renderingGroupId = 0;
            shadows = this._contactShadows = { mesh, buffer: new Float32Array(48 * 16) };
        }

        let count = 0;
        const scale = new BABYLON.Vector3(1, 1, 1);
        const translation = new BABYLON.Vector3();
        const matrix = new BABYLON.Matrix();
        for (const npc of this.npcAvatars) {
            npc._shadowIndex = -1;
            if (!npc.root || !npc.root.isEnabled() || (count + 1) * 16 > shadows.buffer.length) continue;
            const diameter = npc.name === 'djPerformer' ? 1.0 : 1.15;
            scale.set(diameter, 1, diameter);
            translation.set(npc.root.position.x, npc.root.position.y + 0.02, npc.root.position.z);
            BABYLON.Matrix.ComposeToRef(scale, BABYLON.Quaternion.Identity(), translation, matrix);
            matrix.copyToArray(shadows.buffer, count * 16);
            // A character that walks (the mingling guest) rewrites this slot's translation as it moves.
            npc._shadowIndex = count;
            count++;
        }
        shadows.mesh.thinInstanceSetBuffer('matrix', shadows.buffer, 16, false);
        shadows.mesh.thinInstanceCount = count;
        shadows.mesh.setEnabled(count > 0);
    }

    /** A higher tier needs characters nobody fetched yet: load them in the background, then place them. */
    _topUpCrowdSources() {
        if (!this._crowdSourceContainers || !this._crowdSlots || this._crowdTopUp || this._disposed) return;
        const missing = this._requiredCrowdSources().filter(index => this._crowdSourceContainers[index] === undefined);
        if (missing.length === 0) return;
        this._crowdTopUp = this._loadCrowdSources(missing).catch(() => {}).then(() => {
            this._crowdTopUp = null;
            if (!this._disposed) this._applyCrowdSize();
        });
    }

    _applyCrowdSize() {
        if (!this.npcAvatars) return;
        // A hidden group is simply a target of zero, so the tier's own sizes are untouched and turning the group
        // back on restores exactly the crowd this tier would have had.
        const dancersOn = this.isPeopleVisible('dancers');
        const bystandersOn = this.isPeopleVisible('bystanders');
        const target = dancersOn ? Math.max(0, this.tierSettings.crowdSize | 0) : 0;
        const guestTarget = bystandersOn ? Math.max(0, this.tierSettings.guestSize | 0) : 0;
        this._topUpCrowdSources();
        this._spawnCrowdTo(target);
        this._spawnGuestsTo(guestTarget);
        this.npcAvatars.forEach(npc => {
            const isGuest = npc.name.startsWith('guest');
            const isDancer = npc.name.startsWith('dancer');
            let enabled;
            if (isGuest || isDancer) {
                const index = Number(npc.name.slice(isGuest ? 'guest'.length : 'dancer'.length));
                enabled = Number.isFinite(index) && index < (isGuest ? guestTarget : target);
            } else if (npc.name === 'bartender') {
                // She is not a guest slot (no tier removes her), but she is a bystander.
                enabled = bystandersOn;
            } else {
                return;
            }
            npc.root.setEnabled(enabled);
            // The occupant box is its own mesh: left enabled, a hidden dancer stays solid.
            if (npc.collider) npc.collider.setEnabled(enabled);
            VRClubAudioCrowd._setAnimating(npc, enabled);
        });
        if (typeof this._applyStreetPeople === 'function') this._applyStreetPeople();
        this._refreshContactShadows();
    }

    // ───────────────────────── who is in the club ─────────────────────────
    //
    // Three groups of characters, each of which a visitor can send home: the dancers on the dance floor, the
    // bystanders (the side guests, the mingler, the bartender, and the bouncer and the queue on the pavement) and
    // the DJ. The preference lives on the instance (VRClubCore.resolvePeopleVisibility), _applyCrowdSize and
    // _showStreetPeople are the only places that act on it, and both run again after a tier change or a DJ swap.

    /** Is this group of characters in the club? An unknown name is never hidden. */
    isPeopleVisible(category) {
        const visibility = this.peopleVisibility;
        if (!visibility || !Object.prototype.hasOwnProperty.call(visibility, category)) return true;
        return visibility[category] !== false;
    }

    /**
     * Send a group of characters home, or bring it back. This is a personal, local preference — not a light or a
     * music control — so it is never gated on the host.
     * @param {string|null} category 'dancers', 'bystanders', 'dj', or 'all' for every group at once
     * @returns {boolean} whether the group is now visible
     */
    setPeopleVisible(category, visible) {
        const on = !!visible;
        const visibility = this.peopleVisibility || (this.peopleVisibility = VRClubCore.resolvePeopleVisibility());
        let changed = false;
        for (const name of VRClubCore.peopleCategories(category)) {
            if (visibility[name] === on) continue;
            visibility[name] = on;
            changed = true;
        }
        if (changed) {
            this._persistPeopleVisibility();
            this.applyPeopleVisibility();
        }
        return on;
    }

    /** Flip a group. 'all' comes back only when every group is away, so one press empties the club. */
    togglePeopleVisible(category) {
        const names = VRClubCore.peopleCategories(category);
        if (names.length === 0) return true;
        return this.setPeopleVisible(category, !names.some(name => this.isPeopleVisible(name)));
    }

    _persistPeopleVisibility() {
        const hidden = VRClubCore.PEOPLE_CATEGORIES.filter(name => !this.isPeopleVisible(name));
        try {
            if (hidden.length > 0) localStorage.setItem('vrclub.hiddenPeople', hidden.join(','));
            else localStorage.removeItem('vrclub.hiddenPeople');
        } catch (_) { /* private browsing */ }
    }

    /** Put all three groups where the preference says, now. */
    applyPeopleVisibility() {
        this._applyCrowdSize();          // the dancers, the side guests, the bartender, then the street people
        this._applyDJVisibility();
    }

    /** The DJ is not a crowd slot: an AvatarRig posed by DJPerformer, replaced on local selection. */
    _applyDJVisibility() {
        const enabled = this.isPeopleVisible('dj');
        if (enabled && this._djWanted && this._djWanted !== this._djId) {
            this.setDJ(this._djWanted).then(applied => {
                if (!applied) this.showErrorMessage('The selected DJ could not load. Try again later.');
            }).catch(error => this.showErrorMessage(`The selected DJ could not load: ${error.message}`));
        }
        const npc = this.npcAvatars && this.npcAvatars.find(item => item.name === 'djPerformer');
        if (!npc || !npc.root) {
            return;
        }
        if (npc.root.isEnabled() === enabled) return;
        npc.root.setEnabled(enabled);
        if (npc.collider) npc.collider.setEnabled(enabled);
        VRClubAudioCrowd._setAnimating(npc, enabled);
        this._refreshContactShadows();
    }

    // ───────────────────────── the street door: a bouncer and a queue ─────────────────────────
    //
    // Outside the street door, on the pavement at street level, a bouncer in a black suit stands beside the door and a
    // line of people waits along the club's front behind a velvet rope (CityDistrict._createStreetDoorDressing). They
    // exist only once the street has loaded (there is no pavement for them otherwise), their files load in the
    // background, they are drawn only while the street is (updateCityDistrict -> _showStreetPeople), and they take the
    // door lamp as their first light. The queue is as long as the tier allows (`queueSize`).

    /**
     * The bouncer and the queue, in world coordinates (`y` is the pavement). Yaw 0 faces +z (the road), +PI/2 faces +x;
     * the door is to the -x side of everyone in the queue. Ordered so a short queue is already varied (a talking pair, a
     * man and a woman on their own) and, on the lower tiers, holds nobody who is also dancing inside.
     */
    _streetSlots() {
        const ground = (typeof window !== 'undefined' && window.CityLayout && window.CityLayout.groundY) || 0;
        const at = id => VRClubAudioCrowd.sourceIndex(id);
        const door = -Math.PI / 2;
        const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
        const queue = [
            { src: at('m8'), clip: 'Idle_Talking_Loop', x: 3.15, z: 7.1, yaw: face(3.15, 7.1, 3.9, 6.9), height: 1.78,
                ambient: { speedVariation: 0.04, period: 19, phase: 0.3 } },
            { src: at('f8'), clip: 'Idle_Talking_Loop', x: 3.9, z: 6.9, yaw: face(3.9, 6.9, 3.15, 7.1), height: 1.67,
                ambient: { speedVariation: 0.035, period: 23, phase: 2.2 } },
            { src: at('m5'), clip: 'Idle', x: 4.85, z: 7.0, yaw: door + 0.12, height: 1.82,
                ambient: { yawRange: 0.18, speedVariation: 0.045, period: 21, phase: 1.1 } },
            { src: at('f5'), clip: 'Idle', x: 5.7, z: 6.95, yaw: door - 0.18, height: 1.66,
                ambient: { yawRange: 0.13, speedVariation: 0.05, period: 26, phase: 3.7 } },
            { src: at('m9'), clip: 'Idle', x: 6.6, z: 7.05, yaw: door + 0.25, height: 1.76,
                ambient: { yawRange: 0.2, speedVariation: 0.04, period: 18, phase: 5.1 } },
            { src: at('f7'), clip: 'Idle_TalkingPhone_Loop', x: 7.45, z: 6.9, yaw: door + 0.7, height: 1.70,
                ambient: { yawRange: 0.07, speedVariation: 0.035, period: 24, phase: 4.2 } },
            { src: at('m3'), clip: 'Idle', x: 8.35, z: 7.05, yaw: door - 0.1, height: 1.80,
                ambient: { yawRange: 0.15, speedVariation: 0.045, period: 22, phase: 2.6 } },
            { src: at('f4'), clip: 'Idle', x: 9.15, z: 6.95, yaw: door + 0.3, height: 1.69,
                ambient: { yawRange: 0.17, speedVariation: 0.04, period: 27, phase: 0.8 } }
        ].map(slot => ({ ...slot, y: ground }));
        return {
            // Beside the door, outside its opening, watching the street and the head of the queue.
            bouncer: { src: at('bouncer'), clip: 'Idle_Loop', x: 2.25, y: ground, z: 6.85, yaw: 0.35, height: 1.96 },
            queue
        };
    }

    /** The street people the active tier shows, spawned once their files have loaded; then shown with the street. */
    _applyStreetPeople() {
        if (!this._cityRoot || !this._crowdSourceContainers || !this.npcAvatars || this._disposed) return;
        // Sent home: hide whoever is already out there and fetch nobody new.
        if (!this.isPeopleVisible('bystanders')) { this._showStreetPeople(false); return; }
        const { bouncer, queue } = this._streetSlots();
        const target = Math.min(queue.length, Math.max(0, (this.tierSettings && this.tierSettings.queueSize) | 0));
        const wanted = [bouncer, ...queue.slice(0, target)];
        const missing = [...new Set(wanted.map(slot => slot.src))]
            .filter(index => index >= 0 && this._crowdSourceContainers[index] === undefined);
        if (missing.length > 0) {
            // In the background, off everything else's path: then come back and place them.
            if (!this._streetTopUp) {
                this._streetTopUp = this._loadCrowdSources(missing).catch(() => {}).then(() => {
                    this._streetTopUp = null;
                    if (!this._disposed) this._applyStreetPeople();
                });
            }
            return;
        }
        const placed = [];
        const spawn = (slot, name, index) => {
            if (this.npcAvatars.some(npc => npc.name === name)) return;
            const source = this._crowdSourceContainers[slot.src];
            if (!source) return;   // the file failed to load: nobody stands in that spot
            const entry = this._spawnAvatar(source, name, new BABYLON.Vector3(slot.x, slot.y, slot.z), slot.yaw, slot.height,
                0.85 + (index % 4) * 0.06,
                { clip: slot.clip, reactsToBeat: false, ambient: slot.ambient });
            const npc = entry && this.npcAvatars[this.npcAvatars.length - 1];
            if (npc && npc.name === name) {
                npc.homeYaw = null;
                npc.streetYaw = slot.yaw;
                if (name === 'bouncer') npc.ambient = null;
                placed.push(npc);
            }
        };
        spawn(bouncer, 'bouncer', 0);
        queue.slice(0, target).forEach((slot, index) => spawn(slot, `queue${index}`, index + 1));
        const lights = [this._streetDoorLight, this._cityFillLight].filter(Boolean);
        for (const npc of placed) for (const light of lights) this._extendAccentLight(light, npc.meshes);
        this._bouncer = this.npcAvatars.find(npc => npc.name === 'bouncer') || null;
        this._showStreetPeople(this._cityVisible !== false, placed.length > 0);
    }

    /**
     * Show (and animate) the street people while the street is drawn, up to the tier's queue length; hide them otherwise.
     * `placed`: someone new arrived, so the contact shadows are rebuilt even if nobody's visibility changed.
     */
    _showStreetPeople(visible, placed = false) {
        if (!this.npcAvatars) return;
        const target = Math.max(0, (this.tierSettings && this.tierSettings.queueSize) | 0);
        const here = !!visible && this.isPeopleVisible('bystanders');
        let changed = placed;
        for (const npc of this.npcAvatars) {
            const isQueue = /^queue\d+$/.test(npc.name);
            if (!isQueue && npc.name !== 'bouncer') continue;
            const enabled = here && (!isQueue || Number(npc.name.slice(5)) < target);
            if (npc.root.isEnabled() !== enabled) changed = true;
            npc.root.setEnabled(enabled);
            if (npc.collider) npc.collider.setEnabled(enabled);
            VRClubAudioCrowd._setAnimating(npc, enabled);
        }
        if (changed) this._refreshContactShadows();
    }

    /** Play or pause a character's clips when its tier or district visibility changes. */
    static _setAnimating(npc, on) {
        for (const group of npc.animations || []) {
            if (on) {
                if (!group.isPlaying && group.restart) group.restart();
            } else if (group.isPlaying && group.pause) {
                group.pause();
            }
        }
    }

    /**
     * Switch a character kept with several poses (_spawnAvatar's `clips`) to one of them. Only one group ever
     * plays — it blends out of whatever the last one left — and `animations` follows, so _setAnimating still
     * pauses and restarts the right clip when a tier hides the character.
     */
    static _playClip(npc, clip, speedRatio, loop = true) {
        const poses = npc && npc.poses;
        const next = poses && poses.groups.get(clip);
        if (!next) return false;
        if (next !== poses.current || !next.isPlaying) {
            next.start(loop, speedRatio, next.from, next.to);
            if (poses.current && poses.current !== next) poses.current.stop();
            poses.current = next;
            npc.animations = [next];
        }
        next.speedRatio = speedRatio;
        return true;
    }

    /** Turn a character toward a world yaw at a rate, frame-rate independently. True once it has arrived. */
    static _easeYaw(node, goal, dt, rate) {
        let diff = goal - node.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        node.rotation.y += diff * (1 - Math.exp(-Math.max(0, dt) * rate));
        return Math.abs(diff) < 0.01;
    }

    // ───────────────────────── the guest who works the room ─────────────────────────
    //
    // Everyone else at the sides stands where they were placed. One guest (the slot with `mingles`) walks a fixed
    // round of the venue: conversations, a bar visit, watching the floor, a smoke outside and the balcony. The round
    // is a CHAIN walked up and back down, not a loop, so every leg is hand-measured around people and furniture.
    // A stop whose guest the tier does not show is simply walked through, so he still has somewhere to go.

    /**
     * The round, in world coordinates. `guest` and `bartender` mark social stops; `activity` marks an intentional
     * solo stop; a node without any of them is navigation only. Surface height comes from VenueLayout/MezzanineLayout.
     */
    _minglerRoute() {
        return {
            speed: 1.05,            // a relaxed walk
            walkClipSpeed: 1.4,     // metres a second the packs' Walk clip is authored for (AvatarManager uses the same)
            // He lingers: a conversation lasts half a minute or so, then he moves on. (It was 9-17 s, and he spent most
            // of his time walking.)
            dwell: { min: 22, max: 38 },
            home: 1,
            nodes: [
                { x: -9.0, z: -13.6, guest: 6 },
                { x: -8.2, z: -10.8, yaw: 1.716, activity: 'watch', clip: 'Idle_Loop', dwell: { min: 25, max: 40 } },
                { x: -7.5, z: -6.1, guest: 4 },
                { x: -7.5, z: -5.5 },   // the lane along the front of the dance floor, the only way across the room
                { x: 7.9, z: -5.5 },
                { x: 7.9, z: -7.1, guest: 1 },  // joining the pair who stand talking by the bar
                { x: 5.1, z: -7.1 },
                { x: 5.1, z: -9.9 },
                { x: 8.5, z: -9.9 },
                // Customer side of the counter, between stools: the bartender turns to him while he has a drink.
                // The dwell is set by the service itself (two sips, see _advanceMinglerDrink).
                { x: 9.55, z: -9.65, bartender: true, drink: true },
                // Out through the centre of both doors and up the vestibule stair; the queue is on the +x side.
                { x: 8.5, z: -5.5 },
                { x: 0, z: -5.5 },
                { x: 0, z: 0.65 },
                { x: 0, z: 5.0 },
                { x: 0, z: 6.6 },
                // A whole cigarette: a drag every twelve seconds (the Smoke_Loop), for a minute and a half or so.
                { x: -2.5, z: 7.1, yaw: Math.PI / 2, activity: 'smoke', clip: 'Smoke_Loop', dwell: { min: 75, max: 105 } },
                // Back down, then along the front lane to the mezzanine stair and up onto the deck.
                { x: 0, z: 6.6 },
                { x: 0, z: 5.0 },
                { x: 0, z: 0.65 },
                { x: 0, z: -5.5 },
                { x: -9.8, z: -5.5 },
                { x: -11.4, z: -6.2 },
                { x: -11.4, z: -8.3 },
                { x: -11.4, z: -10.4 },
                // At the balcony rail beside the woman already there (guest 3): hands on the rail, watching the floor,
                // then he turns to her and they talk (`talk`). The rail is at x -9.54; his Idle_Railing_Loop puts his
                // wrists 0.394 m ahead of his feet, so he stands at x -9.93, a metre along the rail from her.
                { x: -9.93, z: -12.95, yaw: Math.PI / 2, activity: 'balcony', clip: 'Idle_Railing_Loop', guest: 3,
                    dwell: { min: 25, max: 40 }, talk: { min: 25, max: 40 } }
            ]
        };
    }

    _startMingling(npc, _slot) {
        const route = this._mingleRoute || (this._mingleRoute = this._minglerRoute());
        npc.mingle = {
            phase: 'dwell', timer: 5, duration: 5, node: route.home | 0, dir: 1,
            yaw: route.nodes[route.home].yaw, baseYaw: route.nodes[route.home].yaw,
            attentionTime: 0, partner: null, returning: null, activity: 'watch'
        };
        this._mingler = npc;
        this._createMinglerDrink(npc);
        this._createMinglerSmoke(npc);
    }

    /** The guest standing in slot `index`, if this tier shows them. */
    _mingleGuest(index) {
        const name = `guest${index}`;
        const avatars = this.npcAvatars || [];
        for (let i = 0; i < avatars.length; i++) {
            if (avatars[i].name !== name) continue;
            return avatars[i].root && avatars[i].root.isEnabled() ? avatars[i] : null;
        }
        return null;
    }

    _mingleNamed(name) {
        const avatars = this.npcAvatars || [];
        for (let i = 0; i < avatars.length; i++) {
            const npc = avatars[i];
            if (npc.name === name && npc.root && npc.root.isEnabled()) return npc;
        }
        return null;
    }

    _createBartenderGlass(bartender) {
        if (this._barGlass || !bartender || !this.scene || !this.materialFactory || !BABYLON.MeshBuilder) return;
        const wrist = bartender.root.getChildTransformNodes(false).find(node => /hand_r$/.test(node.name));
        if (!wrist) return;
        const cup = BABYLON.MeshBuilder.CreateCylinder('minglerDrink', {
            diameterTop: 0.075, diameterBottom: 0.055, height: 0.12, tessellation: 12
        }, this.scene);
        cup.material = this.materialFactory.createPBRMaterial('minglerDrinkMat', {
            baseColor: [0.15, 0.18, 0.2], metallic: 0.65, roughness: 0.25
        }, true);
        cup.isPickable = false;
        cup.renderingGroupId = 0;
        cup.setEnabled(false);
        const bar = window.VenueLayout && window.VenueLayout.bar;
        if (!bar) { cup.dispose(); return; }
        this._barGlass = {
            mesh: cup,
            bartender,
            serverWrist: wrist,
            minglerWrist: null,
            counter: new BABYLON.Vector3(bar.counter.xFront + 0.29, bar.counter.top + 0.06, bar.bartender.z + 0.515),
            handPosition: new BABYLON.Vector3(),
            serverPosition: new BABYLON.Vector3(),
            visible: false,
            mode: 'hidden'
        };
        this._updateMinglerDrink(null, 'wash');
    }

    _createMinglerDrink(npc) {
        const glass = this._barGlass;
        if (!npc || !glass || npc.drinkCup) return;
        glass.minglerWrist = npc.root.getChildTransformNodes(false).find(node => /Middle1\.R$/.test(node.name)) || null;
        npc.drinkCup = glass.mesh;
        npc.drinkCounter = glass.counter;
        npc.drinkMode = glass.mode;
    }

    /**
     * His cigarette: one small mesh (white paper, tan filter, vertex-coloured, unlit so it reads at night), a glowing
     * tip, and two small particle systems sharing the club's smoke texture (a thin wisp from the tip, and the exhale
     * from his mouth after each drag). Nothing exists to draw until he lights up outside.
     */
    _createMinglerSmoke(npc) {
        if (!npc || npc.smoke || !this.scene || !this.materialFactory || !BABYLON.MeshBuilder) return;
        const nodes = npc.root.getChildTransformNodes(false);
        const bone = suffix => nodes.find(node => node.name.endsWith(suffix)) || null;
        const bones = {
            index3: bone('Index3.R'), index4: bone('Index4.R'), middle3: bone('Middle3.R'), middle4: bone('Middle4.R'),
            middle2: bone('Middle2.R'), head: bone('_Head') || bone('Head')
        };
        if (Object.values(bones).some(node => !node)) return;

        // Pivot at the filter end, the burning end up its +y axis: 2.2 cm of filter and 6.3 cm of paper.
        const part = (name, height, y, colour) => {
            const mesh = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.0085, height, tessellation: 8 }, this.scene);
            mesh.position.y = y;
            const count = mesh.getTotalVertices();
            const colours = new Float32Array(count * 4);
            for (let i = 0; i < count; i++) colours.set(colour, i * 4);
            mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colours);
            return mesh;
        };
        const cigarette = BABYLON.Mesh.MergeMeshes([
            part('minglerCigaretteFilter', 0.022, 0.011, [0.78, 0.52, 0.28, 1]),
            part('minglerCigarettePaper', 0.063, 0.022 + 0.0315, [0.93, 0.92, 0.88, 1])
        ], true);
        if (!cigarette) return;
        cigarette.name = 'minglerCigarette';
        // Unlit: only the emissive colour reaches the screen (multiplied by the vertex colours), so a lit-looking
        // diffuse colour here would render the paper black at night.
        cigarette.material = this.materialFactory.createStandardMaterial('minglerCigaretteMat', {
            emissiveColor: [0.72, 0.72, 0.72], disableLighting: true
        });
        cigarette.isPickable = false;
        cigarette.rotationQuaternion = new BABYLON.Quaternion();
        const ember = BABYLON.MeshBuilder.CreateSphere('minglerCigaretteEmber', { diameter: 0.0095, segments: 6 }, this.scene);
        ember.material = this.materialFactory.createStandardMaterial('minglerCigaretteEmberMat', {
            emissiveColor: [1, 0.32, 0.06], disableLighting: true, mutable: true
        });
        ember.parent = cigarette;
        ember.position.y = 0.085;
        ember.isPickable = false;
        cigarette.setEnabled(false);

        const texture = this._fogParticleTexture;
        const smoke = (name, capacity) => {
            if (!texture || !BABYLON.ParticleSystem) return null;
            const ps = new BABYLON.ParticleSystem(name, capacity, this.scene);
            ps.particleTexture = texture;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.minEmitPower = 1;
            ps.maxEmitPower = 1;
            ps.colorDead = new BABYLON.Color4(0.6, 0.6, 0.64, 0);
            ps.direction1 = new BABYLON.Vector3();
            ps.direction2 = new BABYLON.Vector3();
            ps.minEmitBox = new BABYLON.Vector3(-0.004, 0, -0.004);
            ps.maxEmitBox = new BABYLON.Vector3(0.004, 0.004, 0.004);
            ps.emitter = new BABYLON.Vector3();
            ps.emitRate = 0;
            return ps;
        };
        // The wisp: a thin grey thread curling up from the tip.
        const wisp = smoke('minglerSmokeWisp', 60);
        if (wisp) {
            wisp.color1 = new BABYLON.Color4(0.9, 0.9, 0.94, 0.7);
            wisp.color2 = new BABYLON.Color4(0.82, 0.82, 0.88, 0.5);
            wisp.minSize = 0.018; wisp.maxSize = 0.03;
            // Size gradients are absolute sizes in metres (not factors of minSize/maxSize): 2-3 cm out of the tip,
            // a 10-14 cm curl by the time it fades.
            wisp.addSizeGradient(0, 0.018, 0.03); wisp.addSizeGradient(1, 0.1, 0.14);
            wisp.minLifeTime = 2.0; wisp.maxLifeTime = 3.4;
            wisp.direction1.set(-0.025, 0.07, -0.025);
            wisp.direction2.set(0.025, 0.13, 0.025);
            wisp.gravity = new BABYLON.Vector3(0.01, 0.015, 0);
        }
        // The exhale: a soft cloud pushed out of the mouth, slowing and spreading as it rises.
        const exhale = smoke('minglerSmokeExhale', 60);
        if (exhale) {
            exhale.color1 = new BABYLON.Color4(0.92, 0.92, 0.96, 0.6);
            exhale.color2 = new BABYLON.Color4(0.84, 0.84, 0.9, 0.42);
            exhale.minSize = 0.035; exhale.maxSize = 0.06;
            // Absolute metres, like the wisp: a mouthful at the lips that spreads to a 30-45 cm cloud.
            exhale.addSizeGradient(0, 0.04, 0.07); exhale.addSizeGradient(1, 0.3, 0.45);
            exhale.minLifeTime = 1.4; exhale.maxLifeTime = 2.4;
            if (exhale.addLimitVelocityGradient) { exhale.addLimitVelocityGradient(0, 0.5); exhale.addLimitVelocityGradient(1, 0.04); exhale.limitVelocityDamping = 0.9; }
            exhale.gravity = new BABYLON.Vector3(0, 0.06, 0);
        }

        npc.smokeProp = cigarette;
        npc.smoke = {
            bones, cigarette, ember, wisp, exhale,
            mouth: null, breath: null,
            baseScaleY: 1, visible: false, glow: 0.35, wasNear: false, exhaleIn: 0, exhaleLeft: 0, smoked: 0,
            filter: new BABYLON.Vector3(), mouthPos: new BABYLON.Vector3(), breathPos: new BABYLON.Vector3(),
            direction: new BABYLON.Vector3()
        };
    }

    /**
     * Put the cigarette between his index and middle fingers, pinched near the fingertips, through the palm: the filter
     * on the palm side (his lips when the hand is up) and the burning end out past the back of the hand. Measured in
     * the body's own (glTF) frame, because a spawned person is mirrored in the world (the root's handedness flip is
     * replaced by a plain yaw), which would turn a world-space cross product inside out. Also marks his mouth on the
     * Head bone. Once per smoke stop: the fingers' current curl is what it holds. Parented to the middle finger's
     * outer segment, so it moves with the fingers.
     */
    _attachCigarette(npc) {
        const s = npc.smoke;
        const root = npc.root.computeWorldMatrix(true);
        const toBody = root.clone().invert();
        const local = node => BABYLON.Vector3.TransformCoordinates(node.computeWorldMatrix(true).getTranslation(), toBody);
        const i3 = local(s.bones.index3), i4 = local(s.bones.index4), m3 = local(s.bones.middle3), m4 = local(s.bones.middle4);
        const hold = i3.add(i4).add(m3).add(m4).scaleInPlace(0.25);
        const fingers = m4.subtract(m3).normalize();
        const palm = BABYLON.Vector3.Cross(i3.subtract(m3), fingers).normalize();
        const holdWorld = BABYLON.Vector3.TransformCoordinates(hold, root);
        const palmWorld = BABYLON.Vector3.TransformNormal(palm, root).normalize();
        const filter = holdWorld.add(palmWorld.scale(0.045));
        const along = BABYLON.Quaternion.Identity();
        BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.Up(), palmWorld.negate(), along);
        const world = BABYLON.Matrix.Compose(BABYLON.Vector3.One(), along, filter);
        const parentWorld = s.bones.middle3.computeWorldMatrix(true);
        const cigarette = s.cigarette;
        cigarette.parent = s.bones.middle3;
        world.multiply(parentWorld.clone().invert()).decompose(cigarette.scaling, cigarette.rotationQuaternion, cigarette.position);
        s.baseScaleY = cigarette.scaling.y;

        // His lips, 0.115 m in front of and 6 mm above the Head joint (measured on m6's face), and where he blows:
        // up and off to his right (the Smoke_Loop also lifts and turns his chin), not into the face of whoever stands
        // in front of him.
        if (!s.mouth) {
            s.mouth = new BABYLON.TransformNode('minglerMouth', this.scene);
            s.breath = new BABYLON.TransformNode('minglerBreath', this.scene);
        }
        const head = s.bones.head.computeWorldMatrix(true);
        const toHead = head.clone().invert();
        const scale = npc.root.scaling.x || 1;
        const yaw = npc.root.rotation.y;
        const forward = new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        // Characters are mirrored in the world (see above), so "his right" is found from the smoking hand, not assumed.
        const handSide = Math.sign(BABYLON.Vector3.Dot(s.bones.middle2.getAbsolutePosition().subtract(npc.root.position), right)) || 1;
        const lips = head.getTranslation().add(forward.scale(0.115 * scale)).addInPlaceFromFloats(0, 0.006 * scale, 0);
        const blow = lips.add(forward.scale(0.14)).addInPlace(right.scale(0.12 * handSide)).addInPlaceFromFloats(0, 0.22, 0);
        for (const [node, at] of [[s.mouth, lips], [s.breath, blow]]) {
            node.parent = s.bones.head;
            node.position.copyFrom(BABYLON.Vector3.TransformCoordinates(at, toHead));
        }
    }

    _updateMinglerSmoke(npc, visible, dt = 0, total = 0) {
        const s = npc && npc.smoke;
        if (!s) return;
        visible = !!visible;
        if (s.visible !== visible) {
            s.visible = visible;
            if (visible) {
                this._attachCigarette(npc);
                s.smoked = 0; s.glow = 0.35; s.wasNear = false; s.exhaleIn = 0; s.exhaleLeft = 0;
                if (s.wisp) s.wisp.start();
                if (s.exhale) s.exhale.start();
            } else {
                if (s.wisp) s.wisp.stop();
                if (s.exhale) s.exhale.stop();
            }
            s.cigarette.setEnabled(visible);
        }
        if (!visible) return;
        const step = Math.max(0, dt || 0);
        s.smoked += step;
        // It burns down over the stop, to a stub.
        const burn = 1 - 0.45 * Math.min(1, s.smoked / Math.max(1, total));
        s.cigarette.scaling.y = s.baseScaleY * burn;
        s.ember.scaling.y = 1 / burn;

        s.cigarette.computeWorldMatrix(true).getTranslationToRef(s.filter);
        s.mouth.computeWorldMatrix(true).getTranslationToRef(s.mouthPos);
        s.breath.computeWorldMatrix(true).getTranslationToRef(s.breathPos);
        // A drag is whenever the filter is at his lips; the exhale follows once the hand has come down.
        const near = BABYLON.Vector3.Distance(s.filter, s.mouthPos) < 0.05;
        if (!near && s.wasNear) s.exhaleIn = 0.45;
        s.wasNear = near;
        if (s.exhaleIn > 0) { s.exhaleIn -= step; if (s.exhaleIn <= 0) s.exhaleLeft = 1.5; }
        const k = 1 - Math.exp(-step * 8);
        s.glow += ((near ? 1 : 0.32) - s.glow) * k;
        s.ember.material.emissiveColor.set(s.glow, 0.32 * s.glow * s.glow + 0.04, 0.06 * s.glow);
        s.ember.scaling.x = s.ember.scaling.z = 0.85 + 0.35 * s.glow;

        if (s.wisp) {
            s.ember.computeWorldMatrix(true).getTranslationToRef(s.wisp.emitter);
            s.wisp.emitRate = near ? 3 : 10;
        }
        if (s.exhale) {
            s.exhale.emitter.copyFrom(s.mouthPos);
            if (s.exhaleLeft > 0) {
                s.exhaleLeft -= step;
                s.direction.copyFrom(s.breathPos).subtractInPlace(s.mouthPos);
                s.exhale.direction1.copyFrom(s.direction).scaleInPlace(0.8).addInPlaceFromFloats(-0.06, -0.03, -0.06);
                s.exhale.direction2.copyFrom(s.direction).scaleInPlace(1.25).addInPlaceFromFloats(0.06, 0.05, 0.06);
                // Strongest at the start of the breath, trailing off.
                s.exhale.emitRate = 34 * Math.min(1, s.exhaleLeft / 1.5 + 0.2);
            } else {
                s.exhale.emitRate = 0;
            }
        }
    }

    _minglerSurfaceLevel(x, z, current) {
        const venue = window.VenueLayout && window.VenueLayout.vestibule;
        const entrance = venue && venue.walkLevel(x, z);
        if (Number.isFinite(entrance)) return entrance;
        const mezz = window.MezzanineLayout;
        return mezz && mezz.walkLevel ? mezz.walkLevel(x, z, current) : 0;
    }

    _updateMinglerDrink(npc, mode, progress) {
        const glass = this._barGlass;
        if (!glass) return;
        const cup = glass.mesh;
        const visible = mode !== 'hidden' && glass.bartender.root.isEnabled();
        if (glass.visible !== visible) {
            cup.setEnabled(visible);
            glass.visible = visible;
        }
        glass.mode = mode;
        if (npc) npc.drinkMode = mode;
        if (!visible) return;
        progress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
        glass.serverWrist.computeWorldMatrix(true).getTranslationToRef(glass.serverPosition);
        glass.serverPosition.y += 0.055;
        if (mode === 'wash' || mode === 'serve') {
            cup.position.copyFrom(glass.serverPosition);
            return;
        }
        if (glass.minglerWrist) {
            glass.minglerWrist.computeWorldMatrix(true).getTranslationToRef(glass.handPosition);
            glass.handPosition.y += 0.055;
        }
        if (mode === 'hand') {
            cup.position.copyFrom(glass.handPosition);
            return;
        }
        if (mode === 'counter' || mode === 'pickup' || (mode === 'clear' && progress < 0.5)) {
            cup.position.copyFrom(glass.counter);
        } else if (mode === 'clear') {
            cup.position.copyFrom(glass.serverPosition);
        } else if (mode === 'return') {
            cup.position.copyFrom(glass.handPosition);
        }
    }

    _advanceMinglerDrink(npc, route) {
        const state = npc.mingle;
        if (state.activity === 'order') {
            state.activity = 'serve'; state.duration = state.timer = 1.2;
        } else if (state.activity === 'serve') {
            state.activity = 'served'; state.duration = state.timer = 1.8;
        } else if (state.activity === 'served') {
            state.activity = 'pickup'; state.duration = state.timer = 0.8;
            VRClubAudioCrowd._playClip(npc, 'Drink_Loop', 1, false);
        } else if (state.activity === 'pickup') {
            state.activity = 'drink'; state.duration = state.timer = 1.9;
            state.sips = (state.sips || 0) + 1;
        } else if (state.activity === 'drink') {
            state.activity = 'return'; state.duration = state.timer = 0.9;
        } else if (state.activity === 'return') {
            // The glass goes back on the counter and he talks with the bartender a while before the next sip.
            state.activity = 'returned'; state.duration = state.timer = 7;
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
        } else if (state.activity === 'returned' && (state.sips || 0) < 2) {
            state.activity = 'pickup'; state.duration = state.timer = 0.8;
            VRClubAudioCrowd._playClip(npc, 'Drink_Loop', 1, false);
        } else if (state.activity === 'returned') {
            state.activity = 'clear'; state.duration = state.timer = 1.2;
        } else {
            this._minglerDepart(npc, route);
        }
    }

    _syncMinglerDrinkPose(npc) {
        const state = npc.mingle;
        const group = npc.poses && npc.poses.groups.get('Drink_Loop');
        if (!group) return;
        let start, end;
        if (state.activity === 'pickup') { start = 0; end = 0.2; }
        else if (state.activity === 'drink') { start = 0.2; end = 0.68; }
        else if (state.activity === 'return') { start = 0.68; end = 0.9; }
        else return;
        const progress = state.duration > 0 ? Math.min(1, Math.max(0, 1 - state.timer / state.duration)) : 1;
        group.goToFrame(group.from + (start + (end - start) * progress) * (group.to - group.from));
    }

    /** Per frame: walk the round, hold the conversations, and carry the collider and the contact shadow along. */
    _updateMingler(dt) {
        const step = Math.min(0.1, Math.max(0, dt || 0));
        const npc = this._mingler;
        const state = npc && npc.mingle;
        if (!state || !npc.root) {
            this._updateBartender(step, null);
            this._updateMinglerDrink(null, 'wash');
            return;
        }
        if (!npc.root.isEnabled()) {
            this._updateBartender(step, null);
            this._updateMinglerDrink(npc, 'wash');
            this._updateMinglerSmoke(npc, false);
            return;
        }
        const route = this._mingleRoute || (this._mingleRoute = this._minglerRoute());
        const pos = npc.root.position;

        if (state.phase === 'walk') {
            const node = route.nodes[state.node];
            const dx = node.x - pos.x, dz = node.z - pos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const travel = route.speed * step;
            if (distance <= Math.max(travel, 0.02)) {
                pos.x = node.x;
                pos.z = node.z;
                pos.y = this._minglerSurfaceLevel(pos.x, pos.z, pos.y);
                this._minglerArrive(npc, route, node);
            } else {
                pos.x += (dx / distance) * travel;
                pos.z += (dz / distance) * travel;
                pos.y = this._minglerSurfaceLevel(pos.x, pos.z, pos.y);
                state.yaw = Math.atan2(dx, dz);
            }
        } else {
            state.timer -= step;
            state.attentionTime = (state.attentionTime || 0) + step;
            if (state.partner && !state.partner.root.isEnabled()) {
                this._minglerDepart(npc, route);   // a lower tier took them away
                return;
            }
            if (state.partner && state.partner.root && !state.partner.rig) {
                const px = state.partner.root.position;
                state.yaw = Math.atan2(px.x - pos.x, px.z - pos.z);
            } else if ((state.activity === 'watch' || state.activity === 'smoke') && Number.isFinite(state.baseYaw)) {
                const amount = state.activity === 'smoke' ? 0.22 : 0.13;
                state.yaw = state.baseYaw + amount * (
                    0.72 * Math.sin(state.attentionTime * 0.29)
                    + 0.28 * Math.sin(state.attentionTime * 0.11 + 1.4)
                );
            }
            if (state.timer <= 0) {
                if (state.drinkStop) this._advanceMinglerDrink(npc, route);
                else if (state.talkGuest != null) this._minglerTurnToTalk(npc, route);
                else this._minglerDepart(npc, route);
            }
        }

        this._updateBartender(step, state.partner && state.partner.name === 'bartender' ? state : null);
        this._syncMinglerDrinkPose(npc);
        VRClubAudioCrowd._easeYaw(npc.root, state.yaw, step, 4.0);
        // The people he stops at look at him while he is there, and go back to the way they were placed afterwards.
        if (state.partner && state.partner.root) {
            const px = state.partner.root.position;
            VRClubAudioCrowd._easeYaw(state.partner.root, Math.atan2(pos.x - px.x, pos.z - px.z), step, 2.2);
        }
        if (state.returning && state.returning.root) {
            if (VRClubAudioCrowd._easeYaw(state.returning.root, state.returning.slotYaw || 0, step, 2.0)) {
                state.returning = null;
            }
        }
        const progress = state.duration > 0 ? 1 - state.timer / state.duration : 1;
        const drinkMode = state.activity === 'serve' ? 'serve'
            : state.activity === 'served' || state.activity === 'returned' ? 'counter'
                : state.activity === 'pickup' ? 'pickup'
                    : state.activity === 'drink' ? 'hand'
                        : state.activity === 'return' ? 'return'
                            : state.activity === 'clear' ? 'clear' : 'wash';
        this._updateMinglerDrink(npc, drinkMode, progress);
        this._updateMinglerSmoke(npc, state.activity === 'smoke', step, state.duration);
        if (npc.collider) npc.collider.position.set(pos.x, pos.y + 0.85, pos.z);
        this._moveContactShadow(npc);
    }

    _minglerArrive(npc, route, node) {
        const state = npc.mingle;
        if (node.activity) {
            const dwell = node.dwell || route.dwell;
            state.phase = 'dwell';
            state.duration = state.timer = dwell.min + Math.random() * (dwell.max - dwell.min);
            state.partner = null;
            state.drinkStop = false;
            // A solo stop next to somebody (the balcony rail) turns into a conversation once he has had his look.
            state.talkGuest = node.guest != null ? node.guest : null;
            state.activity = node.activity;
            state.attentionTime = 0;
            if (Number.isFinite(node.yaw)) state.yaw = state.baseYaw = node.yaw;
            VRClubAudioCrowd._playClip(npc, node.clip || 'Idle_Loop', npc.baseSpeed);
            return;
        }
        if (node.guest == null && !node.bartender) {
            this._minglerDepart(npc, route);
            return;
        }
        const partner = node.bartender ? this._mingleNamed('bartender')
            : node.guest == null ? null : this._mingleGuest(node.guest);
        if (!partner && (node.guest != null || node.bartender)) {
            this._minglerDepart(npc, route);   // nobody stands here on this tier: walk straight on
            return;
        }
        state.phase = 'dwell';
        const dwell = node.dwell || route.dwell;
        state.timer = dwell.min + Math.random() * (dwell.max - dwell.min);
        state.duration = state.timer;
        state.partner = partner;
        state.drinkStop = !!node.drink;
        state.talkGuest = null;
        state.sips = 0;
        state.activity = node.drink ? 'order' : partner ? 'talk' : 'idle';
        state.attentionTime = 0;
        state.baseYaw = state.yaw;
        if (node.drink) {
            state.duration = state.timer = 2.5;
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
            VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
            this._updateMinglerDrink(npc, 'wash');
        } else if (partner) {
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
            VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
        }
    }

    /** At the rail: he lets go, turns to the person beside him and they talk; she lets go of the rail too. */
    _minglerTurnToTalk(npc, route) {
        const state = npc.mingle;
        const node = route.nodes[state.node];
        const partner = this._mingleGuest(state.talkGuest);
        state.talkGuest = null;
        if (!partner) { this._minglerDepart(npc, route); return; }
        const talk = node.talk || route.dwell;
        state.activity = 'talk';
        state.partner = partner;
        state.attentionTime = 0;
        state.duration = state.timer = talk.min + Math.random() * (talk.max - talk.min);
        VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
        VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
    }

    _minglerDepart(npc, route) {
        const state = npc.mingle;
        this._updateMinglerDrink(npc, 'wash');
        state.activity = 'walk';
        state.attentionTime = 0;
        state.drinkStop = false;
        state.talkGuest = null;
        if (state.partner) {
            VRClubAudioCrowd._playClip(state.partner, state.partner.slotClip, state.partner.baseSpeed);
            // Only one person eases back at a time; anyone still turning is simply put back where they stood.
            if (state.returning && state.returning.root) {
                state.returning.root.rotation.y = state.returning.slotYaw || 0;
            }
            state.returning = state.partner;
            state.partner = null;
        }
        state.node += state.dir;
        if (state.node >= route.nodes.length) { state.node = route.nodes.length - 2; state.dir = -1; }
        else if (state.node < 0) { state.node = 1; state.dir = 1; }
        state.phase = 'walk';
        VRClubAudioCrowd._playClip(npc, 'Walk', route.speed / route.walkClipSpeed);
    }

    /**
     * Keep a walking character's blob under its feet. The contact shadows are one thin-instance buffer rebuilt only
     * when the set of enabled characters changes, so a character that moves rewrites its own translation in place.
     */
    _moveContactShadow(npc) {
        const shadows = this._contactShadows;
        const index = npc._shadowIndex;
        if (!shadows || !(index >= 0) || typeof shadows.mesh.thinInstanceBufferUpdated !== 'function') return;
        const base = index * 16;
        if (base + 16 > shadows.buffer.length) return;
        shadows.buffer[base + 12] = npc.root.position.x;
        shadows.buffer[base + 13] = npc.root.position.y + 0.02;
        shadows.buffer[base + 14] = npc.root.position.z;
        shadows.mesh.thinInstanceBufferUpdated('matrix');
    }

    /** The bouncer scans the pavement until somebody comes close, then turns toward them (never more than ~75 degrees). */
    _updateBouncer(dt) {
        const npc = this._bouncer;
        if (!npc || !npc.root || !npc.root.isEnabled()) return;
        const step = Math.max(0, dt || 0);
        npc.watchTime = (npc.watchTime || 0) + step;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        const home = npc.streetYaw || 0;
        let goal = home + 0.12 * (
            0.7 * Math.sin(npc.watchTime * 0.23 + 0.8)
            + 0.3 * Math.sin(npc.watchTime * 0.09 + 2.1)
        );
        if (pos) {
            const dx = pos.x - npc.root.position.x, dz = pos.z - npc.root.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < 49 && d2 > 0.04 && Math.abs(pos.y - npc.root.position.y) < 3) {
                let off = Math.atan2(dx, dz) - home;
                off = Math.atan2(Math.sin(off), Math.cos(off));
                goal = home + Math.max(-1.3, Math.min(1.3, off));
            }
        }
        const k = 1 - Math.exp(-step * 2.5);
        npc.root.rotation.y += (goal - npc.root.rotation.y) * k;
    }

    /**
     * Fixed bystanders already have authored breathing and hand motion. This adds slow attention changes without
     * disturbing a planted rail grip or fighting a conversation that the mingler currently owns.
     */
    _updateAmbientNPC(npc, time, dt) {
        const ambient = npc && npc.ambient;
        if (!ambient || !npc.root || !npc.root.isEnabled() || npc.dance || npc.mingle || npc.rig) return;
        const mingle = this._mingler && this._mingler.mingle;
        if (mingle && (mingle.partner === npc || mingle.returning === npc)) return;
        const period = ambient.period || 18;
        const phase = ambient.phase || 0;
        const wave = (
            Math.sin(time * (Math.PI * 2 / period) + phase)
            + 0.35 * Math.sin(time * (Math.PI * 2 / (period * 2.3)) + phase * 1.7)
        ) / 1.35;
        if (ambient.yawRange > 0) {
            const goal = ambient.baseYaw + ambient.yawRange * wave;
            VRClubAudioCrowd._easeYaw(npc.root, goal, dt, 1.4);
        }
        if (ambient.speedVariation > 0) {
            const speed = npc.baseSpeed * (1 + ambient.speedVariation * wave);
            for (let i = 0; i < npc.animations.length; i++) npc.animations[i].speedRatio = speed;
        }
    }
    
    // ───────────────────────── the crowd dances on the beat ─────────────────────────
    //
    // The Quaternius dancers each keep several moves (Dance_Loop and the grooves built by scripts/build-crowd-glbs.mjs)
    // and CrowdDance (js/crowdDance.js) decides who does what, on the club's beat grid. Here: the music it needs, once a
    // frame, and its decisions applied to the animation groups (one plays at a time; a new move blends in).

    /** The clips a Quaternius dancer keeps (the rest of its file is disposed at spawn). */
    static get DANCE_MOVES() {
        return typeof CrowdDance !== 'undefined' ? Object.keys(CrowdDance.MOVES) : ['Dance_Loop'];
    }

    /** The music as the choreographer sees it, in one reused object. */
    _crowdMusic(audioData) {
        const m = this._crowdMusicState || (this._crowdMusicState = { beatPresent: false, rhythm: false, beat: 0, bpm: 120, energy: 0.5, build: false, drop: false });
        const vj = this.vjDirector, show = this.showDirector;
        m.bpm = (vj && vj.bpm) || 120;
        const now = performance.now();
        const beatMs = 60000 / m.bpm;
        const hasAudioNow = !!(audioData && audioData.hasAudio);
        // A single quiet analyser frame must not make the whole floor drop into its free sway. Hold audible state
        // for two beats; genuine silence still wins quickly, while a render hitch or a sparse frame does not.
        if (hasAudioNow) this._crowdAudioUntil = now + Math.max(1000, 2 * beatMs);
        const hasAudio = hasAudioNow || now < (this._crowdAudioUntil || 0);
        if (vj) {
            // The continuous beat position: the counter plus how far into this beat the bar phase is.
            const inBar = vj.beatNumber % 4;
            const barPhase = Number.isFinite(this.barPhase) ? this.barPhase : 0;
            m.beat = vj.beatNumber + Math.max(0, Math.min(1, barPhase * 4 - inBar));
        }
        // The kick is here until the show would call the gap a breakdown. It is back after two kicks in a row (one
        // stray hit is not a beat). The old 2.5-beat window made frame stalls and an occasional missed onset send
        // everybody to the idle-looking sway while the track and the VJ flywheel were plainly still on the beat.
        const recent = !!vj && vj.realOnsetCount > 0 &&
            now - vj.lastRealOnsetAt < Math.max(1600, 7 * beatMs);
        m.beatPresent = hasAudio && recent && (m.beatPresent || (vj.onsetStreak || 0) >= 2);
        // No kick, but hats, a snare or a synth still keep time: the crowd keeps dancing on the grid (CrowdDance).
        m.rhythm = !m.beatPresent && hasAudio && !!vj && vj.rhythmPresent === true;
        m.energy = audioData && typeof audioData.energy === 'number' ? audioData.energy
            : (show && Number.isFinite(show._energy) ? Math.min(1, show._energy / 0.45) : 0.5);
        // A build (the countdown, or the ascent movement) and the frame a drop lands (the release, or ignition starting).
        m.build = false;
        m.drop = false;
        if (show) {
            const piece = show._setPiece || null;
            m.build = (!!show.setPieces && piece === show.setPieces.countdown) || show._movementName === 'ascent';
            if (piece !== this._crowdLastPiece) {
                if (piece && show.setPieces && piece === show.setPieces.release) m.drop = true;
                this._crowdLastPiece = piece;
            }
            if (show._movementName !== this._crowdLastMovement) {
                if (show._movementName === 'ignition' && this._crowdLastMovement != null) m.drop = true;
                this._crowdLastMovement = show._movementName;
            }
        }
        return m;
    }

    /** Where a playing group is in its loop (0..1), or null. */
    static _loopFraction(group) {
        const animatable = group && group.isPlaying && group.animatables && group.animatables[0];
        const span = group ? group.to - group.from : 0;
        if (!animatable || !(span > 0)) return null;
        const f = (animatable.masterFrame - group.from) / span;
        return f - Math.floor(f);
    }

    /** Per frame: every Quaternius dancer on the floor does its move, on the beat. */
    _updateCrowdDance(dt, audioData) {
        if (!this.npcAvatars || typeof CrowdDance === 'undefined') return;
        const choreographer = this._crowdDance || (this._crowdDance = new CrowdDance());
        const music = this._crowdMusic(audioData);
        this._crowdBeatPresent = music.beatPresent;
        const decision = this._crowdDecision || (this._crowdDecision = {});
        for (const npc of this.npcAvatars) {
            const dance = npc.dance;
            if (!dance || !npc.root.isEnabled()) continue;
            if (!dance.state) dance.state = choreographer.createDancer([...dance.groups.keys()]);
            choreographer.step(dance.state, music, VRClubAudioCrowd._loopFraction(dance.current), decision);
            let group = dance.current;
            if (decision.switched || decision.snap) {
                const next = dance.groups.get(decision.move);
                if (next && next !== group) {
                    // Start the new move first: it blends from the pose the old one leaves (enableBlending), then the
                    // old one stops where it is.
                    next.start(true, decision.speed, next.from, next.to);
                    group.stop();
                    dance.current = group = next;
                    npc.animations = [next];
                }
                group.goToFrame(group.from + decision.frac * (group.to - group.from));
            }
            group.speedRatio = decision.speed;
        }
    }

    /**
     * @param {number} time
     * @param {object} [audioData] Analyser output for THIS frame, supplied by
     *   updateAnimations.
     */
    updateDancingNPCs(time, audioData, dt = 1 / 60) {
        // GLB avatars animate themselves via their animation groups; this only
        // nudges playback rate so the floor visibly reacts to the low end.
        if (!this.npcAvatars || this.npcAvatars.length === 0) return;

        if (!audioData) audioData = this.getAudioData();
        // The three Mixamo dancers have one authored clip each. Keep its intended pace when the kick drops out;
        // slowing it to 45% reads as broken slow motion rather than the deliberate free grooves used by CrowdDance.
        const beatBoost = (audioData.hasAudio && audioData.bass > 0.3)
            ? 1.0 + (audioData.bass - 0.3) * 0.3
            : 1.0;

        const tempoChanged = Math.abs(beatBoost - this._npcBeatBoost) >= 0.01;
        if (tempoChanged) {
            this._npcBeatBoost = beatBoost;
        }

        // TransformNode/skinned-hierarchy frustum bounds are unreliable as animation advances, especially in stereo
        // XR. Every enabled character therefore keeps animating; tier and district visibility own explicit pausing.
        const cam = this.scene ? this.scene.activeCamera : null;
        const checkProximity = cam && (this.frameCounter % 4 === 0);
        const camPos = cam ? (cam.globalPosition || cam.position) : null;

        for (let i = 0; i < this.npcAvatars.length; i++) {
            const npc = this.npcAvatars[i];
            if (!npc.animations || !npc.root || !npc.root.isEnabled()) continue;
            this._updateAmbientNPC(npc, time, dt);

            // A dancer with a repertoire takes its tempo from the choreographer, on the beat.
            if (tempoChanged && npc.reactsToBeat !== false && !npc.dance) {
                for (let a = 0; a < npc.animations.length; a++) {
                    npc.animations[a].speedRatio = npc.baseSpeed * beatBoost;
                }
            }

            if (checkProximity && camPos) {
                const rootPos = npc.root.position;
                const dx = rootPos.x - camPos.x;
                const dz = rootPos.z - camPos.z;
                const distSq = dx * dx + dz * dz;

                if (npc.homeYaw != null) {
                    if (distSq < 2.56) {
                        const step = dx >= 0 ? 0.08 : -0.08;
                        npc.avoidYaw = Math.max(-0.5, Math.min(0.5, (npc.avoidYaw || 0) + step));
                    } else if (npc.avoidYaw) {
                        npc.avoidYaw *= 0.75;
                        if (Math.abs(npc.avoidYaw) < 0.01) npc.avoidYaw = 0;
                    }
                    npc.root.rotation.y = npc.homeYaw + (npc.avoidYaw || 0);
                }
            }
        }
    }

    setupPerformanceMonitor() {
        // index.html has never contained an #fpsCounter element, so this lookup
        // always returned null and the whole FPS/debug overlay (including the
        // toggle wired in setupUI) was silently dead. Create the overlay here
        // instead of depending on markup that does not exist.
        this.fpsElement = document.getElementById('fpsCounter');
        if (!this.fpsElement) {
            const el = document.createElement('div');
            el.id = 'fpsCounter';
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = [
                'position:fixed', 'top:10px', 'left:10px', 'z-index:9998',
                'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                'color:#0f0', 'background:rgba(0,0,0,0.55)', 'padding:6px 10px',
                'border-radius:6px', 'white-space:pre', 'pointer-events:none',
                'display:none'
            ].join(';');
            document.body.appendChild(el);
            this.fpsElement = el;
        }
        this.lastTime = performance.now();
        this.frames = 0;
        this.fps = 0;
        this.drawCallsPerFrame = 0;
        this._lastDrawCallCount = this.engine && this.engine._drawCalls
            ? this.engine._drawCalls.current
            : 0;
        this.debugMode = false;
    }

    updatePerformanceMonitor() {
        this.frames++;
        const now = performance.now();
        
        if (now >= this.lastTime + 1000) {
            const sampledFrames = this.frames;
            this.fps = Math.round((sampledFrames * 1000) / (now - this.lastTime));
            if (this.engine && this.engine._drawCalls && sampledFrames > 0) {
                const currentDrawCalls = this.engine._drawCalls.current;
                this.drawCallsPerFrame = Math.round(
                    (currentDrawCalls - this._lastDrawCallCount) / sampledFrames
                );
                this._lastDrawCallCount = currentDrawCalls;
            }
            this.frames = 0;
            this.lastTime = now;
            
            // Only update if element exists
            if (this.fpsElement) {
                this.fpsElement.style.display = this.debugMode ? 'block' : 'none';
                if (!this.debugMode) return;
                const color = this.fps >= 60 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
                let text = `FPS: ${this.fps}`;
                
                if (this.debugMode) {
                    const pos = this.camera.position;
                    text += `\nX: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
                    text += `\nDraws: ${this.drawCallsPerFrame}`;
                    text += `\nMeshes: ${this.scene.getActiveMeshes().length}/${this.scene.meshes.length}`;
                    text += `\nMaterials: ${this.scene.materials.length}`;
                }
                
                this.fpsElement.textContent = text;
                this.fpsElement.style.color = color;
            }
        }
    }

}
window.VRClubAudioCrowd = VRClubAudioCrowd;
