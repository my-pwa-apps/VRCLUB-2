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
                if (this.pannerLeft.positionX) {
                    this.pannerLeft.positionX.value = CLUB_POSITIONS.paSpeakers.left.x;
                    this.pannerLeft.positionY.value = CLUB_POSITIONS.paSpeakers.left.y;
                    this.pannerLeft.positionZ.value = CLUB_POSITIONS.paSpeakers.left.z;
                    this.pannerLeft.orientationX.value = 0.2;
                    this.pannerLeft.orientationY.value = -0.5;
                    this.pannerLeft.orientationZ.value = 1.0;
                } else if (this.pannerLeft.setPosition) {
                    this.pannerLeft.setPosition(CLUB_POSITIONS.paSpeakers.left.x, CLUB_POSITIONS.paSpeakers.left.y, CLUB_POSITIONS.paSpeakers.left.z);
                    this.pannerLeft.setOrientation(0.2, -0.5, 1.0);
                }

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
                if (this.pannerRight.positionX) {
                    this.pannerRight.positionX.value = CLUB_POSITIONS.paSpeakers.right.x;
                    this.pannerRight.positionY.value = CLUB_POSITIONS.paSpeakers.right.y;
                    this.pannerRight.positionZ.value = CLUB_POSITIONS.paSpeakers.right.z;
                    this.pannerRight.orientationX.value = -0.2;
                    this.pannerRight.orientationY.value = -0.5;
                    this.pannerRight.orientationZ.value = 1.0;
                } else if (this.pannerRight.setPosition) {
                    this.pannerRight.setPosition(CLUB_POSITIONS.paSpeakers.right.x, CLUB_POSITIONS.paSpeakers.right.y, CLUB_POSITIONS.paSpeakers.right.z);
                    this.pannerRight.setOrientation(-0.2, -0.5, 1.0);
                }

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

                // 7. Occlusion filter — walking out of the room muffles the PA.
                this.occlusionFilter = this.audioContext.createBiquadFilter();
                this.occlusionFilter.type = 'lowpass';
                this.occlusionFilter.frequency.value = 22050;

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

            const panner = ctx.createPanner();
            panner.panningModel = 'HRTF';
            panner.distanceModel = 'inverse';
            panner.refDistance = 6;
            panner.maxDistance = 40;
            panner.rolloffFactor = 0.8;
            const floor = CLUB_POSITIONS.danceFloor;
            if (panner.positionX) {
                panner.positionX.value = floor.x;
                panner.positionY.value = 1.6;
                panner.positionZ.value = floor.z;
            } else if (panner.setPosition) {
                panner.setPosition(floor.x, 1.6, floor.z);
            }

            source.connect(voiceBand);
            voiceBand.connect(this.crowdAmbienceGain);
            this.crowdAmbienceGain.connect(panner);
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
        if (this.audioSource || !this.audioElement || !window.AudioContext) return;
        this._ensureAudioContext();
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
                if (this.occlusionFilter) this.occlusionFilter.connect(this.audioCompressor);

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
     * Update Web Audio listener position, orientation, and acoustic attenuation based on camera.
     */
    updateSpatialAudioListener() {
        if (!this.audioContext || this.audioContext.state !== 'running') return;
        const cam = this.scene ? this.scene.activeCamera : null;
        if (!cam) return;

        const pos = cam.globalPosition || cam.position;
        const now = this.audioContext.currentTime;
        const listener = this.audioContext.listener;

        // Update listener position
        if (listener.positionX && listener.positionX.setTargetAtTime) {
            listener.positionX.setTargetAtTime(pos.x, now, 0.03);
            listener.positionY.setTargetAtTime(pos.y, now, 0.03);
            listener.positionZ.setTargetAtTime(pos.z, now, 0.03);
        } else if (listener.setPosition) {
            listener.setPosition(pos.x, pos.y, pos.z);
        }

        // Update listener orientation
        if (cam.getForwardRay) {
            const ray = cam.getForwardRay();
            const fwd = ray.direction;
            const up = cam.upVector || BABYLON.Vector3.Up();
            if (listener.forwardX && listener.forwardX.setTargetAtTime) {
                listener.forwardX.setTargetAtTime(fwd.x, now, 0.03);
                listener.forwardY.setTargetAtTime(fwd.y, now, 0.03);
                listener.forwardZ.setTargetAtTime(fwd.z, now, 0.03);
                listener.upX.setTargetAtTime(up.x, now, 0.03);
                listener.upY.setTargetAtTime(up.y, now, 0.03);
                listener.upZ.setTargetAtTime(up.z, now, 0.03);
            } else if (listener.setOrientation) {
                listener.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
            }
        }

        // Real-world acoustic zone attenuation:
        // Dance floor center is at (0, 0, -12); PA speakers flown at z = -16; entrance is at z = 0.
        const distToStage = Math.sqrt(pos.x * pos.x + Math.pow(pos.z - (-14), 2));
        
        // Sub-bass intensity: peak punch on dance floor (0-8m from stage), rolling off gently near entrance
        if (this.subGain && this.subGain.gain) {
            const subLevel = Math.max(0.45, Math.min(1.15, 1.15 - (distToStage / 22) * 0.55));
            this.subGain.gain.setTargetAtTime(subLevel, now, 0.05);
        }

        // Air absorption: high frequency roll-off with distance
        if (this.airAbsorptionFilter && this.airAbsorptionFilter.frequency) {
            const cutoff = Math.max(5000, Math.min(18000, 18000 - distToStage * 650));
            this.airAbsorptionFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
        }

        // Reverb send rises with distance. Standing in front of the PA you hear the
        // box; at the back of the room you mostly hear the room.
        if (this.reverbSend && this.reverbSend.gain) {
            const wet = Math.max(0.08, Math.min(0.62, distToStage / 30));
            this.reverbSend.gain.setTargetAtTime(wet, now, 0.12);
        }

        // Occlusion: the club room spans z -21..-5. Walking out toward the entrance
        // (z -> 0) puts a wall between the listener and the PA, so the top end goes
        // and the level drops - the "stepping into the corridor" moment.
        if (this.occlusionFilter && this.occlusionFilter.frequency) {
            const outsideBy = Math.max(0, pos.z - ROOM_BOUNDS.z.max);
            const occluded = outsideBy > 0;
            const cutoff = occluded ? Math.max(700, 20000 - outsideBy * 3800) : 20000;
            this.occlusionFilter.frequency.setTargetAtTime(cutoff, now, 0.08);
            if (this.audioMasterGain && this.audioMasterGain.gain) {
                this.audioMasterGain.gain.setTargetAtTime(occluded ? 0.72 : 1.15, now, 0.15);
            }
        }

        // Crowd bed ducks under a loud PA and comes up in the gaps between tracks.
        if (this.crowdAmbienceGain && this.crowdAmbienceGain.gain) {
            const energy = this._audioFrameData ? this._audioFrameData.average : 0;
            const level = Math.max(0.012, 0.085 - energy * 0.14);
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

        // === CORS-TAINTED STREAM DETECTION ===
        // A cross-origin stream WITHOUT `Access-Control-Allow-Origin` still plays
        // through <audio>, but the Web Audio graph receives a tainted (silent)
        // source, so every FFT bin reads 0 forever. Previously this looked exactly
        // like "the club just isn't reacting to the music" with nothing in the
        // console. Detect it and tell the user once.
        if (!this._corsWarningShown && this.audioElement &&
            !this.audioElement.paused && this.audioElement.currentTime > 2) {
            if (average === 0) {
                this._silentAnalyserFrames = (this._silentAnalyserFrames || 0) + 1;
                if (this._silentAnalyserFrames > 180) { // ~3 s of audible-but-silent analysis
                    this._corsWarningShown = true;
                    log.warn('🎚️ Analyser is receiving silence while audio is playing — the stream is likely blocked by CORS.');
                    this.showErrorMessage(
                        'Audio is playing but the visuals cannot react to it. ' +
                        'The stream server does not send an Access-Control-Allow-Origin header.'
                    );
                }
            } else {
                this._silentAnalyserFrames = 0;
            }
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
        try { localStorage.setItem('vrclub.safeMode', this.photosensitiveSafeMode ? '1' : '0'); } catch (_) {}
        // Immediately quiet any in-flight strobe state
        if (this.photosensitiveSafeMode && this.strobes) {
            this.strobes.forEach((strobe) => {
                strobe.material.emissiveColor = this.cachedColors.black;
                if (strobe.light) {
                    strobe.light.intensity = 0;
                    strobe.light.setEnabled(false);
                }
                strobe.flashDuration = 0;
            });
            if (this.strobeFlashLight) {
                this.strobeFlashLight.intensity = 0;
                this.strobeFlashLight.setEnabled(false);
            }
        }
        log.info(`♿ Photosensitive Safe Mode: ${this.photosensitiveSafeMode ? 'ON (strobes disabled)' : 'OFF'}`);
        return this.photosensitiveSafeMode;
    }

    /**
     * Set playback volume (0..1).
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
    _prepareAvatarMaterials(materials) {
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

            [mat.albedoTexture, mat.diffuseTexture].forEach(tex => {
                if (!tex) return;
                tex.hasAlpha = false;
                tex.anisotropicFilteringLevel = aniso;
            });

            // Frozen once, here. Never inside the render loop - Material.freeze()
            // calls markDirty(), which walks every mesh in the scene.
            mat.freeze();
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
     */
    _spawnAvatar(container, name, position, facing, height, speedRatio) {
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

        entry.rootNodes.forEach(node => {
            node.getChildMeshes().forEach(mesh => {
                // Group 0 = opaque. Beams live in group 1 with additive blending and
                // are depth-tested against whatever group 0 already wrote.
                mesh.renderingGroupId = 0;
                mesh.isPickable = false;
            });
        });

        entry.animationGroups.forEach(group => {
            group.start(true);
            group.speedRatio = speedRatio;
            // Offset the phase, otherwise every clone of the same clip hits the same
            // pose on the same frame and the crowd looks like a chorus line.
            const span = group.to - group.from;
            if (span > 0) group.goToFrame(group.from + Math.random() * span);
        });

        this.npcAvatars.push({
            name,
            root,
            animations: entry.animationGroups,
            baseSpeed: speedRatio
        });

        return entry;
    }

    async createDancingNPCs() {
        // === CROWD + DJ ===
        // Only three animated avatar GLBs exist, and two of them are ~60 MB, so the
        // crowd is built by loading each file ONCE into an AssetContainer and then
        // instantiating it per dancer. That gives every dancer its own skeleton and
        // animation group (so nobody moves in lockstep) off a single download and a
        // single set of geometry buffers and materials.
        const crowdSize = Math.max(0, this.tierSettings.crowdSize | 0);

        const avatarSources = [
            './js/models/avatars/Hip Hop Dancing.glb',
            './js/models/avatars/house.glb',
            './js/models/avatars/rumba_dancing_female_character.glb'
        ];

        log.info(`🕺 Loading ${avatarSources.length} avatar sources for a crowd of ${crowdSize}...`);

        const containers = [];
        for (const url of avatarSources) {
            try {
                const container = await BABYLON.SceneLoader.LoadAssetContainerAsync("", url, this.scene);
                this._prepareAvatarMaterials(container.materials);
                this._avatarContainers.push(container);
                containers.push(container);
            } catch (error) {
                log.warn(`  ❌ Failed to load avatar source ${url}: ${error.message}`);
                containers.push(null);
            }
        }

        const available = containers.filter(Boolean);
        if (available.length === 0) {
            log.warn('⚠️ No avatar sources loaded — the club will be empty');
            return;
        }
        // Fall back to whatever did load so a single missing file does not leave
        // holes in the crowd.
        const pick = index => containers[index] || available[index % available.length];
        this._crowdSourceContainers = containers;
        this._availableCrowdSources = available;

        // Hand-placed rather than randomised: the list is ordered so that the first
        // N slots are already well spread, which means a `balanced` tier still gets
        // an even crowd instead of everyone bunched in one corner.
        // `facing` is an offset from "square on to the DJ booth".
        // None of these fall inside the DJ platform footprint (x -3..3, z -20..-16).
        const crowdSlots = [
            { x: -3.4, z: -13.4, src: 0, height: 1.84, facing:  0.10 },
            { x:  3.2, z: -13.0, src: 2, height: 1.66, facing: -0.12 },
            { x:  0.4, z: -10.8, src: 1, height: 1.74, facing:  0.04 },
            { x: -6.0, z: -11.6, src: 1, height: 1.79, facing:  0.28 },
            { x:  5.6, z: -11.0, src: 0, height: 1.71, facing: -0.26 },
            { x: -1.4, z:  -8.6, src: 2, height: 1.62, facing:  0.08 },
            { x:  2.6, z: -15.0, src: 1, height: 1.88, facing: -0.06 },
            { x: -4.6, z: -15.2, src: 2, height: 1.69, facing:  0.16 },
            { x:  6.6, z:  -8.4, src: 1, height: 1.77, facing: -0.34 },
            { x: -6.8, z:  -8.0, src: 0, height: 1.81, facing:  0.36 },
            { x:  1.6, z:  -7.4, src: 2, height: 1.60, facing: -0.10 },
            { x: -7.4, z: -13.8, src: 2, height: 1.73, facing:  0.42 },
            { x:  7.2, z: -13.6, src: 0, height: 1.86, facing: -0.40 },
            { x: -0.6, z:  -6.4, src: 1, height: 1.68, facing:  0.02 }
        ];
        this._crowdSlots = crowdSlots;

        // Do not instantiate hidden upper-tier dancers on the startup critical path.
        // Their source containers stay resident, so raising quality can add them
        // synchronously later without another download or parse.
        this._spawnCrowdTo(crowdSize);

        // === THE DJ ===
        // Stands on the 0.5 m riser in the 1 m gap between the LED wall (z=-20) and
        // the deck plinth (z=-19), facing the floor. Playback is dialled well down so
        // they read as working the decks rather than raving in the crowd.
        const djSource = pick(1);
        if (djSource) {
            this._spawnAvatar(
                djSource,
                'djPerformer',
                new BABYLON.Vector3(0, 0.5, -19.4),
                Math.PI,       // source avatar's forward axis points toward the dance floor at +z
                1.78,
                0.55
            );
        }

        this._applyCrowdSize();
        this._refreshShadowCasters();

        log.info(`✅ Crowd ready: ${this.npcAvatars.length} animated characters (incl. the DJ)`);
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
            const source = this._crowdSourceContainers[slot.src]
                || this._availableCrowdSources[index % this._availableCrowdSources.length];
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

    _applyCrowdSize() {
        if (!this.npcAvatars) return;
        const target = Math.max(0, this.tierSettings.crowdSize | 0);
        this._spawnCrowdTo(target);
        this.npcAvatars.forEach(npc => {
            if (!npc.name.startsWith('dancer')) return;
            const index = Number(npc.name.slice('dancer'.length));
            const enabled = Number.isFinite(index) && index < target;
            npc.root.setEnabled(enabled);
            npc.animations.forEach(group => {
                if (enabled) {
                    if (group.isPaused && group.restart) group.restart();
                } else if (!group.isPaused && group.pause) {
                    group.pause();
                }
            });
        });
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
        // If a dancer is outside the active camera's view frustum or behind the player,
        // we pause its skeletal animation evaluation and restart it on re-entering.
        const cam = this.scene ? this.scene.activeCamera : null;
        const checkFrustum = cam && (this.frameCounter % 4 === 0);
        const camPos = cam ? (cam.globalPosition || cam.position) : null;

        for (let i = 0; i < this.npcAvatars.length; i++) {
            const npc = this.npcAvatars[i];
            if (!npc.animations || !npc.root || !npc.root.isEnabled()) continue;

            if (tempoChanged) {
                for (let a = 0; a < npc.animations.length; a++) {
                    npc.animations[a].speedRatio = npc.baseSpeed * beatBoost;
                }
            }

            if (checkFrustum && camPos) {
                const rootPos = npc.root.position;
                const dx = rootPos.x - camPos.x;
                const dz = rootPos.z - camPos.z;
                const distSq = dx * dx + dz * dz;

                let inFrustum = true;
                if (cam.isInFrustum) {
                    inFrustum = cam.isInFrustum(npc.root);
                }

                // If outside view frustum or very distant (>28m), pause skeleton evaluation
                if (!inFrustum || distSq > 784) {
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
