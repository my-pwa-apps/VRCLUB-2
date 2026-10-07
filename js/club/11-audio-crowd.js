'use strict';
class VRClubAudioCrowd extends VRClubUI {
    _ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);

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

                // Reverb return folds back into the mastering bus.
                this.roomConvolver.connect(this.reverbReturn);
                this.reverbSend.connect(this.roomConvolver);
                this.reverbReturn.connect(this.audioCompressor);

                // Connect mastering output to destination
                this.audioCompressor.connect(this.audioMasterGain);
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
        // reflection stay inside it: on the street neither is heard.
        if (this.reverbSend && this.reverbSend.gain) {
            const wet = Math.max(0.08, Math.min(0.62, distToStage / 30)) * (1 - exterior);
            this.reverbSend.gain.setTargetAtTime(wet, now, 0.12);
        }
        if (this.roomDelayGain && this.roomDelayGain.gain) {
            this.roomDelayGain.gain.setTargetAtTime(0.18 * (1 - exterior), now, 0.12);
        }

        // Occlusion: the club room spans z -21..-5. Walking out toward the entrance
        // (z -> 0) puts a wall between the listener and the PA, so the top end goes
        // and the level drops - the "stepping into the corridor" moment. Past the street door
        // the whole building is between the listener and the music: only the low bass comes through,
        // a little more of it right at the door than down the street.
        if (this.occlusionFilter && this.occlusionFilter.frequency) {
            const outsideBy = Math.max(0, pos.z - ROOM_BOUNDS.z.max);
            const occluded = outsideBy > 0;
            const corridorCutoff = occluded ? Math.max(700, 20000 - outsideBy * 3800) : 20000;
            const leak = Math.max(0, 1 - doorDistance / 14);
            const streetCutoff = 90 + 90 * leak * leak;
            // Interpolate in log-frequency so the sweep is even to the ear.
            const lerpLog = (from, to) => Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * exterior);
            this.occlusionFilter.frequency.setTargetAtTime(lerpLog(corridorCutoff, streetCutoff), now, 0.08);
            if (this.occlusionFilter2 && this.occlusionFilter2.frequency) {
                this.occlusionFilter2.frequency.setTargetAtTime(lerpLog(22050, streetCutoff), now, 0.08);
            }
            if (this.audioMasterGain && this.audioMasterGain.gain) {
                const indoorGain = occluded ? 0.72 : 1.15;
                this.audioMasterGain.gain.setTargetAtTime(indoorGain + (1.25 - indoorGain) * exterior, now, 0.15);
            }
        }

        // Crowd bed ducks under a loud PA and comes up in the gaps between tracks. Nobody is chattering on the street.
        if (this.crowdAmbienceGain && this.crowdAmbienceGain.gain) {
            const energy = this._audioFrameData ? this._audioFrameData.average : 0;
            const level = Math.max(0.012, 0.085 - energy * 0.14) * (1 - exterior);
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
        return frame;
    }

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
     * @param {boolean} [options.reactsToBeat]   false for guests who do not dance (default true)
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
        if (groups.length > 1) {
            const prefix = `${name}_`;
            const clipOf = group => (group.name.startsWith(prefix) ? group.name.slice(prefix.length) : group.name);
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

    /**
     * The people who can stand at the decks, one per podcast (js/podcasts.js `dj`). Both are Quaternius characters
     * (CC0) derived from the guest files by scripts/build-dj-glbs.mjs, with one clip (`Idle_Loop`). The pale strand
     * texture takes its colour from `hair`; `garment` turns the jacket into the plain tee each artist is photographed in.
     * Hernan Cattaneo: half-long dark brown wavy hair, no beard, dark grey tee. Miss Melera: long straight light
     * blond hair, mid-grey tee (and her headphones, which are not modelled).
     */
    static get DJ_LOOKS() {
        if (!this._djLooks) {
            this._djLooks = Object.freeze({
                hernan: Object.freeze({
                    url: './js/models/avatars/club-dj-hernan.glb', height: 1.78,
                    garment: new BABYLON.Color3(0.10, 0.10, 0.12), hair: new BABYLON.Color3(0.20, 0.12, 0.07)
                }),
                melera: Object.freeze({
                    url: './js/models/avatars/club-dj-melera.glb', height: 1.68,
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
     *  - hipHop/house/rumba: the Mixamo dancers, kept for their distinct authored choreography.
     *  - bartender: the Quaternius female guest, in a black work outfit through a tint.
     *  - f1..f8, m1..m9: the Modular Women / Modular Men cast built by scripts/build-crowd-glbs.mjs (club-crowd-*.glb):
     *    one draw each, vertex-coloured, the club's own dance and idle clips retargeted onto them.
     */
    static get AVATAR_SOURCES() {
        if (!this._avatarSources) {
            // Full literal paths on purpose: scripts/build.mjs ships only the model paths it finds written out in the
            // source, so a path assembled from parts would silently be missing from the production build.
            this._avatarSources = Object.freeze([
                { id: 'dancerF', url: './js/models/avatars/club-dancer-female.glb', garmentColor: new BABYLON.Color3(0.45, 0.82, 1.0) },
                { id: 'dancerM', url: './js/models/avatars/club-dancer-male.glb', garmentColor: new BABYLON.Color3(1.0, 0.42, 0.68) },
                { id: 'hipHop', url: './js/models/avatars/Hip Hop Dancing.glb' },
                { id: 'house', url: './js/models/avatars/house.glb' },
                { id: 'rumba', url: './js/models/avatars/rumba_dancing_female_character.glb' },
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
                { id: 'm9', url: './js/models/avatars/club-crowd-m9.glb' }
            ].map(source => Object.freeze(source)));
        }
        return this._avatarSources;
    }

    /** Index of a source in AVATAR_SOURCES by id, or -1. */
    static sourceIndex(id) {
        return VRClubAudioCrowd.AVATAR_SOURCES.findIndex(source => source.id === id);
    }

    /** The DJ for the club's first frame: the chosen podcast's, 'hernan' when nothing is chosen. */
    _initialDJId() {
        try {
            const podcasts = window.Podcasts;
            if (podcasts) return podcasts.get(podcasts.selectedId(localStorage)).dj;
        } catch (_) { /* storage blocked */ }
        return 'hernan';
    }

    /** Load one avatar GLB into a container with its materials normalised. Null when it cannot be loaded. */
    async _loadAvatarSource(url, garmentColor = null, hairColor = null) {
        try {
            const container = await BABYLON.SceneLoader.LoadAssetContainerAsync("", url, this.scene);
            this._prepareAvatarMaterials(container.materials, garmentColor, hairColor);
            this._avatarContainers.push(container);
            return container;
        } catch (error) {
            log.warn(`  ❌ Failed to load avatar source ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * Put the DJ for `id` ('hernan' | 'melera') behind the decks. Swaps are queued, so a quick double switch
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
        // The entry music can ask for a DJ while the club is still being built: wait for init (it places the DJ itself).
        this._djQueue = (this._djQueue || Promise.resolve(this.initPromise).catch(() => {}))
            .then(() => (this._disposed ? false : this._applyDJ(id)))
            .catch(() => false);
        return this._djQueue;
    }

    async _applyDJ(id) {
        const look = VRClubAudioCrowd.djLook(id);
        if (!look || this._djId === id) return this._djId === id;
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
        this._djEntry = this._spawnAvatar(
            container, 'djPerformer', new BABYLON.Vector3(0, 0.5, -19.4), 0, look.height, 0.55, { clip: 'Idle_Loop' });
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
        // they read as working the decks rather than raving in the crowd. Who stands there follows the podcast
        // that is chosen (Hernan Cattaneo or Miss Melera): see DJ_LOOKS and setDJ().
        await this._applyDJ(this._initialDJId());

        // === THE BARTENDER ===
        // Behind the counter, facing the stools and chatting: the talking clip of the female guest file. She is
        // not a guest slot (no tier removes her) and she takes the bar's accent light like the stools do.
        const barCrew = containers[at('bartender')];
        if (barCrew) {
            const spot = window.VenueLayout.bar.bartender;
            this._spawnAvatar(barCrew, 'bartender', new BABYLON.Vector3(spot.x, 0, spot.z), -Math.PI / 2, 1.70, 0.95,
                { clip: 'Idle_Talking_Loop', reactsToBeat: false });
            const bartender = this.npcAvatars.find(npc => npc.name === 'bartender');
            if (bartender) this._extendAccentLight(this._barLight, bartender.meshes);
        }

        this._spawnLocalPlayerBody();
        this._applyCrowdSize();
        this._refreshShadowCasters();

        log.info(`✅ Crowd ready: ${this.npcAvatars.length} animated characters (incl. the DJ)`);
    }

    /**
     * Guests who are not on the dance floor: a pair talking by the right wall, someone on a call, someone watching
     * with folded arms, one nodding along to the music. Clubs are not only dancers, and the side walls were empty.
     * Same hand-placed ordering rule as the crowd: the first N are already spread around the room, so a lower tier
     * still looks populated (and its first two are the talking pair). Yaw 0 faces +z (the entrance side), PI faces
     * the DJ, +PI/2 faces +x. Every slot is well clear of the side walls, the truss legs and the DJ riser.
     */
    _guestSlots() {
        const towardDJ = (x, z) => Math.atan2(-x, -18 - z);
        const at = id => VRClubAudioCrowd.sourceIndex(id);
        return [
            // The talking pair stands off the counter (x 9.7 is its front, the stools are at x 9.2).
            { src: at('m4'), clip: 'Idle_Talking_Loop', x: 7.9, z: -9.1, yaw: 0.35, height: 1.80 },
            { src: at('f6'), clip: 'Idle_Talking_Loop', x: 7.9, z: -8.1, yaw: Math.PI + 0.35, height: 1.66 },
            { src: at('m6'), clip: 'Idle_FoldArms_Loop', x: -8.2, z: -10.8, yaw: Math.PI / 2 - 0.2, height: 1.84 },
            // Leaning on the mezzanine rail, watching the floor (y is the deck the guest stands on).
            { src: at('f7'), clip: 'Idle_FoldArms_Loop', x: -10.1, y: 3.0, z: -13.9, yaw: Math.PI / 2, height: 1.66 },
            { src: at('f8'), clip: 'Idle_TalkingPhone_Loop', x: -8.4, z: -6.5, yaw: Math.PI / 2 + 0.6, height: 1.68 },
            { src: at('m8'), clip: 'Yes', x: 7.7, z: -12.6, yaw: towardDJ(7.7, -12.6), height: 1.77 },
            { src: at('f6'), clip: 'Idle_Loop', x: -8.4, z: -14.4, yaw: towardDJ(-8.4, -14.4), height: 1.63 },
            { src: at('m4'), clip: 'Idle_TalkingPhone_Loop', x: 9.4, z: -15.8, yaw: towardDJ(9.4, -15.8) + 0.4, height: 1.70 }
        ];
    }

    /** Source indices the active tier shows: the player's body, the bartender, the first N dancers and the first N guests. */
    _requiredCrowdSources(crowdSize = this.tierSettings.crowdSize, guestSize = this.tierSettings.guestSize) {
        const need = new Set([VRClubAudioCrowd.sourceIndex('dancerF'), VRClubAudioCrowd.sourceIndex('dancerM'),
            VRClubAudioCrowd.sourceIndex('bartender')]);
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
                0.9 + (index % 3) * 0.06, { clip: slot.clip, reactsToBeat: false });
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
                0.85 + (index % 5) * 0.07
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
            shadows = this._contactShadows = { mesh, buffer: new Float32Array(32 * 16) };
        }

        let count = 0;
        const scale = new BABYLON.Vector3(1, 1, 1);
        const translation = new BABYLON.Vector3();
        const matrix = new BABYLON.Matrix();
        for (const npc of this.npcAvatars) {
            if (!npc.root || !npc.root.isEnabled() || (count + 1) * 16 > shadows.buffer.length) continue;
            const diameter = npc.name === 'djPerformer' ? 1.0 : 1.15;
            scale.set(diameter, 1, diameter);
            translation.set(npc.root.position.x, npc.root.position.y + 0.02, npc.root.position.z);
            BABYLON.Matrix.ComposeToRef(scale, BABYLON.Quaternion.Identity(), translation, matrix);
            matrix.copyToArray(shadows.buffer, count * 16);
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
        const target = Math.max(0, this.tierSettings.crowdSize | 0);
        const guestTarget = Math.max(0, this.tierSettings.guestSize | 0);
        this._topUpCrowdSources();
        this._spawnCrowdTo(target);
        this._spawnGuestsTo(guestTarget);
        this.npcAvatars.forEach(npc => {
            const isGuest = npc.name.startsWith('guest');
            if (!isGuest && !npc.name.startsWith('dancer')) return;
            const index = Number(npc.name.slice(isGuest ? 'guest'.length : 'dancer'.length));
            const enabled = Number.isFinite(index) && index < (isGuest ? guestTarget : target);
            npc.root.setEnabled(enabled);
            // The occupant box is its own mesh: left enabled, a hidden dancer stays solid.
            if (npc.collider) npc.collider.setEnabled(enabled);
            npc.animations.forEach(group => {
                if (enabled) {
                    if (group.isPaused && group.restart) group.restart();
                } else if (!group.isPaused && group.pause) {
                    group.pause();
                }
            });
        });
        this._refreshContactShadows();
    }
    
    /**
     * @param {number} time
     * @param {object} [audioData] Analyser output for THIS frame, supplied by
     *   updateAnimations.
     */
    updateDancingNPCs(time, audioData) {
        // GLB avatars animate themselves via their animation groups; this only
        // nudges playback rate so the floor visibly reacts to the low end.
        if (!this.npcAvatars || this.npcAvatars.length === 0) return;

        if (!audioData) audioData = this.getAudioData();
        const beatBoost = (audioData.hasAudio && audioData.bass > 0.3)
            ? 1.0 + (audioData.bass - 0.3) * 0.3
            : 1.0;

        const tempoChanged = Math.abs(beatBoost - this._npcBeatBoost) >= 0.01;
        if (tempoChanged) {
            this._npcBeatBoost = beatBoost;
        }

        // === DYNAMIC FRUSTUM CULLING & ANIMATION LOD ===
        // Standalone Quest 3S evaluating vertex skinning for multiple 60-joint
        // skeletons burns noticeable GPU/CPU time.
        // Pause only very distant dancers. TransformNode/skinned-hierarchy frustum
        // bounds become unreliable as animation advances, especially for stereo XR.
        const cam = this.scene ? this.scene.activeCamera : null;
        const checkDistance = cam && (this.frameCounter % 4 === 0);
        const camPos = cam ? (cam.globalPosition || cam.position) : null;

        for (let i = 0; i < this.npcAvatars.length; i++) {
            const npc = this.npcAvatars[i];
            if (!npc.animations || !npc.root || !npc.root.isEnabled()) continue;

            if (tempoChanged && npc.reactsToBeat !== false) {
                for (let a = 0; a < npc.animations.length; a++) {
                    npc.animations[a].speedRatio = npc.baseSpeed * beatBoost;
                }
            }

            if (checkDistance && camPos) {
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

                if (distSq > 784) {
                    if (!npc._animPaused) {
                        npc.animations.forEach(g => { if (g.pause) g.pause(); });
                        npc._animPaused = true;
                    }
                } else {
                    if (npc._animPaused) {
                        npc.animations.forEach(g => { if (g.restart) g.restart(); else if (g.play) g.play(); });
                        npc._animPaused = false;
                    }
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
