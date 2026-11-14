'use strict';
function easeAirLightSample(state, r, g, b, lit, dt, attack, release) {
    if (!Number.isFinite(state.r) || !Number.isFinite(state.g) || !Number.isFinite(state.b) || !Number.isFinite(state.lit)) {
        state.r = state.g = state.b = state.lit = 0;
    }
    const safeR = Number.isFinite(r) ? Math.max(0, r) : 0;
    const safeG = Number.isFinite(g) ? Math.max(0, g) : 0;
    const safeB = Number.isFinite(b) ? Math.max(0, b) : 0;
    const safeLit = Number.isFinite(lit) ? Math.max(0, lit) : 0;
    const timeConstant = safeLit >= state.lit ? attack : release;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
    const amount = 1 - Math.exp(-step / Math.max(1e-3, timeConstant));
    state.r = Math.max(0, state.r + (safeR - state.r) * amount);
    state.g = Math.max(0, state.g + (safeG - state.g) * amount);
    state.b = Math.max(0, state.b + (safeB - state.b) * amount);
    state.lit = Math.max(0, state.lit + (safeLit - state.lit) * amount);
}

class VRClubAnimationCore extends VRClubEffects {
    static NETWORK_HAND_KEYS = Object.freeze(['x', 'y', 'z', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz']);
    updateAnimations() {
        const ctx = this._beginFrame();

        this.updateFogMachines(ctx);
        this.updateLaserSheet(ctx);
        this.updateDancers(ctx);
        this.updateMirrorBall(ctx);
        this.updateSpotColorCycle(ctx);
        this.updateRoomBounce(ctx);
        this.updateStrobes(ctx);
        this.updateLEDWallPass(ctx);
        this.updateDanceFloorLEDs(ctx);
        this.updateLasers(ctx);
        this.updateSpotlights(ctx);
        if (typeof this._updateProjectedCharacterShadows === 'function') this._updateProjectedCharacterShadows();
        this.updateSpeakerCones(ctx);
        this.updateCameraPresence(ctx);
        this.updateEyeAdaptation(ctx);
        this.updateNetworkPresence(ctx);
        if (typeof this.updateVJDesk === 'function') this.updateVJDesk(ctx);
        if (typeof this.updateRestroomMirror === 'function') this.updateRestroomMirror(ctx);
        this.updateSessionExperience?.(ctx.dt);
    }

    /**
     * Keep peak cues from multiplying every transparent effect to full cost in XR. Geometry and fixture state stay
     * identical; only fog-particle output is reduced because the scene fog already provides the beam medium.
     */
    _effectLoadScale() {
        if (!this.isInVRMode) return 1;
        let active = 0;
        if (this.lightsActive) active++;
        if (this.lasersActive) active++;
        if (this.laserSheetActive) active++;
        if (this.mirrorBallActive) active++;
        if (this.ledWallActive) active++;
        if (this.strobesActive && !this.photosensitiveSafeMode) active++;
        const load = Math.min(1, Math.max(0, (active - 2) / 3));
        const floor = Math.min(1, Math.max(0.4, this.tierSettings?.vrPeakEffectFloor || 0.7));
        return 1 - load * (1 - floor);
    }

    /**
     * Multiplayer: advance remote-avatar interpolation/spatial-audio positions
     * and throttle-broadcast this guest's own position/facing. Both halves are
     * no-ops until a guest connects from the Multiplayer panel (ui-init.js).
     */
    updateNetworkPresence(ctx) {
        if (this.avatarManager) this.avatarManager.update(ctx.dt);
        if (this.multiplayer) this.multiplayer.update(ctx);

        const net = this.networkManager;
        if (!net || !net.connected) return;

        const interval = (this.isInVRMode || this.performingAsDJ) ? 0.05 : 0.1;
        if (ctx.time - (this._lastNetworkSendTime || 0) < interval) return;
        this._lastNetworkSendTime = ctx.time;

        const cam = (this.isInVRMode && this.vrHelper?.baseExperience?.camera) || this.camera;
        if (!cam) return;
        let rotY = cam.rotation ? cam.rotation.y : 0;
        if (cam.rotationQuaternion) {
            const q = cam.rotationQuaternion;
            // The yaw twist stays continuous across a vertical gaze, unlike Euler's pitch branch.
            if (q.w * q.w + q.y * q.y > 1e-8) {
                const twist = 2 * Math.atan2(q.y, q.w);
                rotY = Math.atan2(Math.sin(twist), Math.cos(twist));
                this._networkHeading = rotY;
            } else rotY = this._networkHeading || 0;
        }
        const position = cam.globalPosition || cam.position;
        const state = this._networkPose || (this._networkPose = {
            x: 0, y: 0, z: 0, rotY: 0, hands: null, seated: false, floorY: 0, eh: 1.7
        });
        const djPose = (this.performingAsDJ && !this.isInVRMode) ? this._selfDJPose : null;
        const seat = djPose ? null : this._activeSeat;
        state.eh = Math.round(this._bodyEyeHeight() * 100) / 100;
        state.x = djPose ? djPose.x : (seat ? seat.x : position.x);
        state.y = djPose ? (djPose.groundY + state.eh) : position.y;
        state.z = djPose ? djPose.z : (seat ? seat.z : position.z);
        state.rotY = djPose ? ((djPose.headYaw || 0) * 0.35) : (seat ? seat.facing : rotY);
        state.seated = !!seat;
        state.floorY = djPose ? djPose.groundY : (seat ? seat.floorY : (this._walkLevel || 0));
        state.seatH = seat ? Math.round((seat.seatY - seat.floorY) * 100) / 100 : 0;
        state.hands = null;
        if (this.isInVRMode || djPose) {
            const hands = this._networkHands || (this._networkHands = { left: null, right: null });
            const refX = djPose ? state.x : position.x;
            const refY = djPose ? state.y : position.y;
            const refZ = djPose ? state.z : position.z;
            for (let i = 0; i < 2; i++) {
                const side = i === 0 ? 'left' : 'right';
                const tracked = this.isInVRMode ? this._handPose(side, position) : djPose?.[side];
                if (!tracked) { hands[side] = null; continue; }
                const key = side === 'left' ? '_networkHandL' : '_networkHandR';
                const hand = this[key] || (this[key] = {});
                hand.x = tracked.x - refX; hand.y = tracked.y - refY; hand.z = tracked.z - refZ;
                hand.fx = tracked.fx; hand.fy = tracked.fy; hand.fz = tracked.fz;
                hand.ux = tracked.ux; hand.uy = tracked.uy; hand.uz = tracked.uz;
                hands[side] = hand;
            }
            state.hands = hands;
        }
        {
            const previous = this._lastNetworkPoseClient === net ? this._lastNetworkPose : null;
            let changed = !previous || Math.hypot(state.x - previous.x, state.y - previous.y, state.z - previous.z) > 0.01 ||
                Math.abs(Math.atan2(Math.sin(state.rotY - previous.rotY), Math.cos(state.rotY - previous.rotY))) > 0.01 || state.seated !== previous.seated ||
                state.seatH !== previous.seatH || state.floorY !== previous.floorY || state.eh !== previous.eh;
            if (!changed) {
                for (let i = 0; i < 2; i++) {
                    const side = i === 0 ? 'left' : 'right';
                    const hand = state.hands?.[side], old = previous.hands?.[side];
                    if (!!hand !== !!old) { changed = true; break; }
                    if (hand) for (const key of VRClubAnimationCore.NETWORK_HAND_KEYS) {
                        if (Math.abs(hand[key] - old[key]) > 0.01) { changed = true; break; }
                    }
                }
            }
            if (!changed && ctx.time - (this._lastNetworkPoseAt || 0) < 0.5) return;
            if (net.sendState(state) === false) return;
            this._lastNetworkPoseClient = net;
            const saved = previous || (this._lastNetworkPose = {
                x: 0, y: 0, z: 0, rotY: 0, hands: { left: null, right: null },
                left: {}, right: {}
            });
            saved.x = state.x; saved.y = state.y; saved.z = state.z; saved.rotY = state.rotY;
            saved.seated = state.seated; saved.seatH = state.seatH; saved.floorY = state.floorY; saved.eh = state.eh;
            for (let i = 0; i < 2; i++) {
                const side = i === 0 ? 'left' : 'right';
                const hand = state.hands?.[side];
                saved.hands[side] = hand ? Object.assign(saved[side], hand) : null;
            }
            this._lastNetworkPoseAt = ctx.time;
        }
    }

    /**
     * Walking head-bob for the desktop camera.
     *
     * The previous applied offset is removed before measuring locomotion, otherwise the
     * bob feeds back into its own speed estimate and oscillates.
     */
    updateCameraPresence(ctx) {
        const cam = this.camera;
        if (!cam || this.isInVRMode || !this.headBobEnabled) return;

        cam.position.y -= this._headBobOffset;
        cam.rotation.z -= this._headBobRoll;

        const { dt, dtScale } = ctx;
        if (this._lastCameraX === null) {
            this._lastCameraX = cam.position.x;
            this._lastCameraZ = cam.position.z;
        }
        const dx = cam.position.x - this._lastCameraX;
        const dz = cam.position.z - this._lastCameraZ;
        this._lastCameraX = cam.position.x;
        this._lastCameraZ = cam.position.z;

        const speed = Math.min(6, Math.sqrt(dx * dx + dz * dz) / Math.max(dt, 0.001));
        const walking = speed > 0.15;

        // ~1.9 steps/sec at a normal walk; the bob is two vertical cycles per stride.
        if (walking) this._headBobPhase += speed * 1.35 * dt * Math.PI;
        const target = walking ? Math.min(1, speed / 3) : 0;
        this._headBobAmount += (target - this._headBobAmount) * Math.min(1, 0.08 * dtScale);

        this._headBobOffset = Math.sin(this._headBobPhase * 2) * 0.035 * this._headBobAmount;
        this._headBobRoll = Math.sin(this._headBobPhase) * 0.011 * this._headBobAmount;

        cam.position.y += this._headBobOffset;
        cam.rotation.z += this._headBobRoll;
    }

    /**
     * Iris adaptation on the pipeline exposure.
     *
     * Brightness is estimated from rig state rather than read back from the framebuffer:
     * a GPU readback would stall the pipeline every frame, and the rig already knows
     * exactly how much light it is producing.
     */
    updateEyeAdaptation(ctx) {
        const pipeline = this.renderPipeline;
        const ip = pipeline && pipeline.imageProcessing;
        if (!ip) return;

        const settings = this.isInVRMode ? this.vrSettings.vr : this.vrSettings.desktop;
        const base = settings.exposure;
        if (this._adaptedExposure === null) this._adaptedExposure = base;

        const master = this.masterIntensity != null ? this.masterIntensity : 1;
        let brightness = 0.12;
        if (this.lightsActive) brightness += 0.32 * master;
        if (this.ledWallActive) brightness += 0.28 * master * Math.min(1, Math.max(0, this.ledWallLevel ?? 1));
        if (this.lasersActive) brightness += 0.10 * master;
        if (this.laserSheetActive) brightness += 0.12 * master;
        if (this.mirrorBallActive) brightness += 0.08 * master;
        if (this.photosensitiveSafeMode) {
            this._strobeAdaptation = 0;
        } else if (this._strobeAdaptation > 0) {
            brightness += this._strobeAdaptation;
            this._strobeAdaptation *= Math.exp(-ctx.dt / 1.2);
            if (this._strobeAdaptation < 0.001) this._strobeAdaptation = 0;
        }
        brightness += (ctx.beat || 0) * 0.10;

        // Stopping down is capped harder than opening up so a blackout never blows out. In the headset the
        // iris never opens past the base exposure: a dark room must stay dark until the show lights it.
        const open = this.isInVRMode ? 1.0 : 1.22;
        const target = base * Math.max(0.78, Math.min(open, 1.22 - brightness * 0.42));
        // Fast constrict, slow dilate - the real asymmetry of the pupil reflex.
        const rate60 = target < this._adaptedExposure ? 0.10 : 0.012;
        const rate = 1 - Math.pow(1 - rate60, ctx.dtScale);
        this._adaptedExposure += (target - this._adaptedExposure) * rate;
        // A strobe burst owns exposure for its flash frame; overwriting it here
        // (this runs after updateStrobes) silently cancelled the designed spike.
        if (this._preStrobeExposure !== undefined) return;
        this._writeExposure(this._adaptedExposure);
    }

    /**
     * Per-frame exposure write that does not dirty every material.
     *
     * The public `exposure` setter notifies the scene's ImageProcessingConfiguration,
     * and every material observes it and walks every mesh to mark its submeshes dirty:
     * ~550 materials x ~1,100 meshes measured 104-130 ms PER WRITE, which pinned the
     * whole app below 10 fps. Exposure is a uniform that `bind()` re-reads from
     * `_exposure` every frame, so only a change that toggles the EXPOSURE define
     * (a value of exactly 1) needs the notifying setter.
     */
    _writeExposure(value) {
        const ip = this.renderPipeline && this.renderPipeline.imageProcessing;
        if (!ip) return;
        const cfg = ip.imageProcessingConfiguration;
        if (cfg && typeof cfg._exposure === 'number' && cfg._exposure !== 1 && value !== 1) {
            cfg._exposure = value;
        } else {
            ip.exposure = value;
        }
    }

    /** Low-energy indirect fill from active fixtures; one existing light, no extra shadow pass. */
    updateRoomBounce(ctx) {
        const ambient = this.scene && this.scene.getLightByName('ambient');
        if (!ambient) return;

        const settings = this.isInVRMode ? this.vrSettings.vr : this.vrSettings.desktop;
        const master = Math.max(0, this.masterIntensity != null ? this.masterIntensity : 1);
        const wallLevel = this.ledWallLevel == null ? 1 : Math.max(0, Math.min(1, this.ledWallLevel));
        const wallBright = Number.isFinite(this.ledWallBrightness)
            ? Math.min(this.photosensitiveSafeMode ? 1 : 2, Math.max(0, this.ledWallBrightness)) : 1;
        const wallDrive = wallLevel * wallBright;
        const wallOut = (this.ledPanels && this._airLedHasMean)
            ? Math.min(1.5, this._airLedMeanLit || 0)
            : wallDrive * (0.20 + 0.80 * Math.min(1, wallDrive));
        let reflectedEnergy = 0;
        if (this.lightsActive) reflectedEnergy += 0.120;
        if (this.ledWallActive) reflectedEnergy += 0.060 * wallOut;
        if (this.lasersActive) reflectedEnergy += 0.070;
        if (this.laserSheetActive) reflectedEnergy += 0.090;
        if (this.mirrorBallActive) reflectedEnergy += 0.080;
        reflectedEnergy *= master * (this.isInVRMode ? 0.6 : 1);

        // The headset gets less bounce, not more: flat fill is what kills contrast at life size.
        const maxBounce = this.isInVRMode ? 0.15 : 0.28;
        const targetIntensity = Math.min(maxBounce, settings.ambientIntensity + reflectedEnergy);
        const retention = 1 - Math.pow(1 - 0.045, ctx.dtScale);
        ambient.intensity += (targetIntensity - ambient.intensity) * retention;

        let r = 0, g = 0, b = 0, weight = 0;
        let color = this.lightsActive && this.currentSpotColor;
        if (color) { r += color.r * 0.120; g += color.g * 0.120; b += color.b * 0.120; weight += 0.120; }
        if (this.ledWallActive && wallOut > 0.001) {
            if (this.ledPanels && this._airLedHasMean && (this._airLedMeanLit || 0) > 0.001) {
                const invMean = 1 / this._airLedMeanLit;
                const w = 0.060 * wallOut;
                r += (this._airLedMeanR * invMean) * w;
                g += (this._airLedMeanG * invMean) * w;
                b += (this._airLedMeanB * invMean) * w;
                weight += w;
            } else {
                color = this.ledShowColor || this.currentSpotColor;
                if (color) {
                    const w = 0.060 * wallOut;
                    r += color.r * w; g += color.g * w; b += color.b * w; weight += w;
                }
            }
        }
        color = (this.lasersActive || this.laserSheetActive) && typeof this._laserColor === 'function'
            ? this._laserColor() : null;
        if (color) {
            const laserWeight = (this.lasersActive ? 0.070 : 0) + (this.laserSheetActive ? 0.090 : 0);
            r += color.r * laserWeight; g += color.g * laserWeight; b += color.b * laserWeight; weight += laserWeight;
        }
        color = this.mirrorBallActive && this.mirrorBallSpotlightColor;
        if (color) { r += color.r * 0.080; g += color.g * 0.080; b += color.b * 0.080; weight += 0.080; }
        const targetR = 0.62 + (weight ? r / weight : 1) * 0.30;
        const targetG = 0.62 + (weight ? g / weight : 1) * 0.30;
        const targetB = 0.66 + (weight ? b / weight : 1) * 0.30;
        ambient.diffuse.r += (targetR - ambient.diffuse.r) * retention;
        ambient.diffuse.g += (targetG - ambient.diffuse.g) * retention;
        ambient.diffuse.b += (targetB - ambient.diffuse.b) * retention;
    }

    /**
     * Advance the shared clocks, sample the analyser, tick both directors and
     * return the frame context consumed by every update* method below.
     *
     * The context object is allocated once and mutated in place - this runs at
     * up to 120 Hz and a fresh object literal per frame is pure GC churn.
     */
    _beginFrame() {
        const time = performance.now() / 1000;

        // === FRAME-RATE INDEPENDENCE ===
        // Quest headsets run at 72/90/120 Hz, desktop at 60/144 Hz, and thermal
        // throttling can drop any of them to 30 Hz. Every time-accumulator below
        // used to add a hardcoded 0.016 s ("assume 60 fps"), which made the whole
        // light show run at a different musical speed per device.
        // `dtScale` is the ratio of the real frame time to a 60 fps frame, clamped
        // so a single long frame (tab restore, GC pause, shader compile) cannot
        // teleport animation state.
        const frameMs = (this.engine && this.engine.getDeltaTime) ? this.engine.getDeltaTime() : 16.667;
        const dtScale = Math.min(4, Math.max(0.25, frameMs / 16.667));
        // Real elapsed seconds for the SAME clamped frame. Deriving this as
        // `0.016 * dtScale` made it 0.016/0.016667 = 0.96x true time, so every
        // dt-driven timer in the app ran ~4% slow at every refresh rate.
        const dt = dtScale / 60;
        this.dtScale = dtScale;

        this.ledTime += dt * (this.ledWallSpeed || 1.0);
        this.frameCounter++;
        
        // Get audio data for reactive lighting (needed for laser sheet pulse)
        const audioData = this.getAudioData();

        // === VJ DIRECTOR per-frame tick ===
        // Drives master palette, beat envelope, BPM tracking, scene transitions.
        // Writes back to this.beatEnvelope / this.masterIntensity / this.barPhase
        // which downstream render code multiplies into intensities.
        if (this.vjDirector) {
            this.vjDirector.update(time, audioData);
        }

        // === SHOW DIRECTOR per-frame tick ===
        // Runs immediately AFTER the VJ director so this frame's beat grid
        // (beatNumber / beatEnvelope / bpm) is already resolved. Advances the
        // cue list on bar boundaries and owns masterIntensity while driving.
        if (this.showDirector) {
            this.showDirector.update(time, audioData);
        }

        // Kick punch for the fixtures. Halved under Photosensitive Safe Mode: the
        // lift tracks the kick (~2 Hz) and Safe Mode exists to keep luminance steady.
        const kickDepth = (this.showDirector && this.showDirector.isDriving()) ? this.kickDepth : 0.3;
        this.kickPulse = (this.beatEnvelope || 0) * kickDepth * (this.photosensitiveSafeMode ? 0.5 : 1);

        // The street outside: show it only near the entrance and ease the guest's "outdoors" amount (fog keys off it).
        if (this.updateCityDistrict) this.updateCityDistrict(dt);

        // Update 3D spatial audio listener position & room acoustics attenuation
        if (this.updateSpatialAudioListener) {
            this.updateSpatialAudioListener();
        }

        if (!this._frameCtx) {
            this._frameCtx = { time: 0, dt: 0, dtScale: 1, audio: null, beat: 0 };
        }
        const ctx = this._frameCtx;
        ctx.time = time;
        ctx.dt = dt;
        ctx.dtScale = dtScale;
        ctx.audio = audioData;
        ctx.beat = this.beatEnvelope || 0;
        return ctx;
    }

    /** Fog machine bursts, haze start/stop and the fixture status LEDs. */
    updateFogMachines(ctx) {
        if (this.atmosphereTestDisabled) {
            this.scene.fogEnabled = false;
            if (!this._atmosphereTestCleared) {
                if (this.haze) {
                    this.haze.stop();
                    this.haze.reset();
                }
                if (this.dustMotes) {
                    this.dustMotes.stop();
                    this.dustMotes.reset();
                }
                for (const machine of this.fogMachines || []) {
                    machine.isBursting = false;
                    machine.burstTimer = 0;
                    if (machine.emitter) {
                        machine.emitter.stop();
                        machine.emitter.reset();
                    }
                }
                this._atmosphereTestCleared = true;
            }
            return;
        }

        const { time, dt } = ctx;
        const tierScale = this.isInVRMode ? (this.tierSettings?.vrFogOutputScale || 1) : 1;
        const outputScale = tierScale * VRClubAnimationCore.prototype._effectLoadScale.call(this);
        const intensity = Number.isFinite(this.fogIntensity) ? Math.min(2, Math.max(0, this.fogIntensity)) : 1;
        const fill = !this.reducedShowSmoke &&
            ((this.vjManualMode && intensity === 2) || this.fogImmersion > 0) ? 1 : 0;
        const burstRate = 150 * outputScale * (1 + fill);
        const continuousRate = 80 * outputScale * (1 + fill);
        const beat = typeof this.spotRigBeat === 'function' ? this.spotRigBeat(time) : time * (this.vjBPM || 120) / 60;
        const burstPhase = ((beat % 16) + 16) % 16;
        const bursting = this.fogBurstMode === 'auto' && burstPhase < 3;
        const burstFade = bursting ? Math.min(1, (3 - burstPhase) / 0.75) : 0;
        this._tintClubAir(dt, burstFade);

        // === FOG MACHINE SYSTEM CONTROL ===
        if (this.fogMachines && this.fogMachines.length > 0) {
            if (this.smokeActive) {
                // Ensure haze is running for beam visibility
                if (this.haze && !this.haze.isStarted()) this.haze.start();
                
                // Update each fog machine
                this.fogMachines.forEach(machine => {
                    const emitter = machine.emitter;
                    const ledMat = machine.ledMat;
                    if (typeof emitter.isStarted === 'function' && !emitter.isStarted()) emitter.start();
                    
                    // === FOG BURST LOGIC ===
                    if (this.fogBurstMode === 'auto') {
                        machine.isBursting = bursting;
                        emitter.emitRate = intensity * (continuousRate * 0.55 + (burstRate - continuousRate * 0.55) * burstFade);
                        ledMat.emissiveColor = bursting ? this.cachedColors.fogActive : this.cachedColors.fogReady;
                        
                    } else if (this.fogBurstMode === 'continuous') {
                        // Continuous low output
                        emitter.emitRate = continuousRate * intensity;
                        ledMat.emissiveColor = this.cachedColors.fogContinuous; // Orange (continuous)
                        machine.isBursting = false;
                        
                    } else if (this.fogBurstMode === 'burst') {
                        // Manual burst mode - awaiting trigger
                        if (this._fogPreviousMode !== 'burst') machine.isBursting = false;
                        if (!machine.isBursting) {
                            emitter.emitRate = 0;
                            ledMat.emissiveColor = this.cachedColors.fogStandby; // Blue (standby)
                        }
                    }
                });
                
            } else {
                // Smoke cue off: the fog MACHINES stop. The ambient hazer keeps running
                // (real clubs hold a thin haze all night); stopping it drained the room
                // over ~30 s and it re-materialised from nothing on the next cue.
                this.fogMachines.forEach(machine => {
                    machine.emitter.emitRate = 0;
                    machine.isBursting = false;
                    machine.ledMat.emissiveColor = this.cachedColors.fogOff; // Gray (off)
                });
                
                if (this.haze && !this.haze.isStarted()) this.haze.start();
            }
        }
        this._fogPreviousMode = this.fogBurstMode;
    }

    /**
     * Residual club air. Beams are scatter, so EXP2 fog stays on even when the
     * machines are idle. RGB is nudged toward the current look in place; the
     * asserted haze alphas are left alone.
     *
     * The SMOKE control is an eased `_smokeLevel` (0 clear air .. 1 full haze, about 1.6 s to fill or clear): it scales the
     * fog density, the haze particles' alpha, the lasers' and the sheet's scatter and the beams' visibility. Smoke off
     * used to trim the fog to 45% and keep the ambient hazer and the beam scatter running, so nothing seemed to change.
     */
    _tintClubAir(dt, burst = 0) {
        const scene = this.scene;
        if (!scene) return;
        scene.fogEnabled = true;
        const step60 = dt > 0 ? dt : 1 / 60;
        const intensity = Number.isFinite(this.fogIntensity) ? Math.min(2, Math.max(0, this.fogIntensity)) : 2;
        const base = intensity / 2;
        const goal = this.smokeActive === false ? 0 : base + (1 - base) * burst * 0.25;
        if (!Number.isFinite(this._smokeLevel)) this._smokeLevel = goal;
        this._smokeLevel += (goal - this._smokeLevel) * (1 - Math.exp(-step60 / 1.6));
        if (Math.abs(goal - this._smokeLevel) < 0.002) this._smokeLevel = goal;
        const smoke = this._smokeLevel;
        const settings = this.isInVRMode ? this.vrSettings?.vr : this.vrSettings?.desktop;
        const designed = settings && settings.fogDensity;
        // Outdoors the air is thin: the club's haze is a room effect, and the street needs to see down the block.
        const outdoors = this._exterior || 0;
        // The extra room fill follows actual machine bursts, then lingers after the cue.
        const source = this.smokeActive !== false && !this.reducedShowSmoke
            ? Math.min(1, Math.max(0, this.fogImmersion || 0)) * burst : 0;
        if (!Number.isFinite(this._smokeImmersion)) this._smokeImmersion = 0;
        const retention = source > this._smokeImmersion ? 1.6 : 18;
        this._smokeImmersion += (source - this._smokeImmersion) * (1 - Math.exp(-step60 / retention));
        if (this.reducedShowSmoke || this.smokeActive === false) this._smokeImmersion = 0;
        const activeImmersion = (this.reducedShowSmoke || this.smokeActive === false) ? 0 : Math.max(
            this._smokeImmersion, this.vjManualMode && intensity === 2 ? smoke : 0);
        if (typeof designed === 'number') {
            const target = designed * (0.1 + 0.9 * smoke) * (1 + 2 * activeImmersion * (1 - outdoors)) * (1 - 0.62 * outdoors);
            const current = scene.fogDensity;
            if (!(current > 0)) {
                scene.fogDensity = target;
            } else if (current !== target) {
                // Ease: a cue's smoke toggle must not snap the whole room's air.
                const step = 1 - Math.exp(-(dt > 0 ? dt : 1 / 60) * 0.9);
                scene.fogDensity = Math.abs(target - current) < 1e-5 ? target : current + (target - current) * step;
            }
        }
        const dim = this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity));
        const fog = scene.fogColor;
        const safeBrightnessMax = this.photosensitiveSafeMode ? 1 : 3;
        const laserLevel = Number.isFinite(this.laserBrightness)
            ? Math.min(this.photosensitiveSafeMode ? 1 : 2, Math.max(0, this.laserBrightness)) : 1;
        const sheetLevel = Number.isFinite(this.laserSheetBrightness)
            ? Math.min(safeBrightnessMax, Math.max(0, this.laserSheetBrightness)) : 1;
        const wallLevel = this.ledWallLevel == null ? 1 : Math.max(0, Math.min(1, this.ledWallLevel));
        let tintR = 0, tintG = 0, tintB = 0, tintWeight = 0;
        if (this.lightsActive && this.spotlights && dim > 0 && this.spotBrightness !== 0) {
            const reference = (this.isInVRMode ? 48 : 30) * dim * (1 + (this.kickPulse || 0) * 0.9);
            for (const head of this.spotlights) {
                if (head.beamVisible === false || head._rigLevel === 0) continue;
                const color = head._renderColor || head._rigColor;
                const output = Math.max(0, head._photoIntensity || 0);
                if (!color || output === 0) continue;
                const weight = 0.07 * Math.min(2, output / reference) / this.spotlights.length;
                tintR += color.r * weight;
                tintG += color.g * weight;
                tintB += color.b * weight;
                tintWeight += weight;
            }
        }
        if (this.mirrorBallActive && this.mirrorBallSpotlightColor) {
            const color = this.mirrorBallSpotlightColor, weight = 0.018;
            tintR += color.r * weight;
            tintG += color.g * weight;
            tintB += color.b * weight;
            tintWeight += weight;
        }
        if ((this.lasersActive || this.laserSheetActive) && typeof this._laserColor === 'function') {
            const level = Math.max(this.lasersActive ? laserLevel : 0, this.laserSheetActive ? sheetLevel : 0);
            if (level > 0) {
                const color = this._laserColor(), weight = Math.min(0.03, level * 0.012);
                tintR += color.r * weight;
                tintG += color.g * weight;
                tintB += color.b * weight;
                tintWeight += weight;
            }
        }
        if (this.ledWallActive && wallLevel > 0) {
            (this._gatherAirLedWall || VRClubAnimationCore.prototype._gatherAirLedWall).call(this);
            const wallBright = Number.isFinite(this.ledWallBrightness)
                ? Math.min(this.photosensitiveSafeMode ? 1 : 2, Math.max(0, this.ledWallBrightness)) : 1;
            if (this.ledPanels && this._airLedHasMean) {
                const meanLit = Math.min(1.5, this._airLedMeanLit || 0);
                if (meanLit > 0.001) {
                    const weight = Math.min(0.024, meanLit * 0.014);
                    const invMean = 1 / meanLit;
                    tintR += (this._airLedMeanR * invMean) * weight;
                    tintG += (this._airLedMeanG * invMean) * weight;
                    tintB += (this._airLedMeanB * invMean) * weight;
                    tintWeight += weight;
                }
            } else if (this.ledShowColor && wallBright > 0) {
                const wallDrive = wallLevel * wallBright;
                const wallRadiant = wallDrive * (0.20 + 0.80 * Math.min(1, wallDrive));
                const color = this.ledShowColor, weight = Math.min(0.024, wallRadiant * 0.014);
                tintR += color.r * weight;
                tintG += color.g * weight;
                tintB += color.b * weight;
                tintWeight += weight;
            }
        }
        const airR = tintWeight > 0 ? tintR / tintWeight : 0;
        const airG = tintWeight > 0 ? tintG / tintWeight : 0;
        const airB = tintWeight > 0 ? tintB / tintWeight : 0;
        // Both automatic fogImmersion and manual Maximum scatter active club light as glowing misty haze rather than darkening the room.
        const scatter = activeImmersion * 0.16 * Math.min(1, tintWeight / 0.07);
        const mistNeutral = (tintWeight > 0 ? Math.min(1, tintWeight / 0.04) : 0) * activeImmersion * 0.036 * dim;
        const mix = Math.min(0.08, tintWeight) * dim;
        if (fog) {
            // The club tints its air with the show; the street's is a cool night blue.
            const indoors = 1 - outdoors;
            fog.r = (0.015 + mistNeutral + airR * (mix + scatter * dim)) * indoors + 0.024 * outdoors;
            fog.g = (0.012 + mistNeutral + airG * (mix + scatter * dim)) * indoors + 0.032 * outdoors;
            fog.b = (0.018 + mistNeutral * 1.08 + airB * (mix + scatter * dim)) * indoors + 0.07 * outdoors;
        }
        // Store indirect room bounce so 3D nozzle smoke plumes remain visibly lit across the dance floor
        // whenever club fixtures are active, while still going completely dark on blackout.
        const roomFlux = Math.min(1, (tintWeight / 0.055) * dim);
        this._airBounceLit = roomFlux * 0.34;
        this._airBounceR = (0.38 + airR * 0.62) * this._airBounceLit;
        this._airBounceG = (0.38 + airG * 0.62) * this._airBounceLit;
        this._airBounceB = (0.42 + airB * 0.62) * this._airBounceLit;
        const haze = this.haze;
        if (!haze || !haze.color1) return;
        if (roomFlux > 0.001) {
            const darkMix = 1 - roomFlux;
            haze.color1.r = 0.04 * darkMix + (0.18 + airR * 0.14) * roomFlux;
            haze.color1.g = 0.04 * darkMix + (0.17 + airG * 0.14) * roomFlux;
            haze.color1.b = 0.055 * darkMix + (0.21 + airB * 0.14) * roomFlux;
            if (haze.color2) {
                haze.color2.r = 0.045 * darkMix + (0.22 + airR * 0.12) * roomFlux;
                haze.color2.g = 0.045 * darkMix + (0.21 + airG * 0.12) * roomFlux;
                haze.color2.b = 0.06 * darkMix + (0.25 + airB * 0.12) * roomFlux;
            }
        } else {
            haze.color1.r = 0.04;
            haze.color1.g = 0.04;
            haze.color1.b = 0.055;
            if (haze.color2) {
                haze.color2.r = 0.045;
                haze.color2.g = 0.045;
                haze.color2.b = 0.06;
            }
        }
        // The live particles read the gradient stops, not color1/color2, so push the
        // tint and the peak alpha through them, scaled by each stop's fade weight and by how much smoke there is.
        const stops = this._hazeGradients;
        const fade = this._hazeFade;
        if (stops && fade && haze.color2) {
            const amount = 0.04 + 0.96 * smoke;
            for (let k = 0; k < stops.length && k < fade.length; k++) {
                const f = fade[k] * amount;
                const stop = stops[k];
                stop.color1.set(haze.color1.r, haze.color1.g, haze.color1.b, haze.color1.a * f);
                if (stop.color2) stop.color2.set(haze.color2.r, haze.color2.g, haze.color2.b, haze.color2.a * f);
            }
        }
    }

    /**
     * Light the air. Sprite particles are unlit in Babylon, so smoke would be the same
     * brightness in a beam and in the dark. After each particle update, puffs and dust
     * motes inside a moving-head cone are brightened and tinted, weighted by a
     * Henyey-Greenstein phase term (smoke glows when the light travels toward the
     * viewer). The pass only edits this frame's colour: the gradient recomputes it on
     * the next update, so nothing accumulates. No lights, no shaders, no allocation.
     */
    _installAirLighting() {
        const wrap = (system, mode) => {
            if (!system || system._airLit || typeof system.updateFunction !== 'function') return;
            const base = system.updateFunction;
            system._airLit = true;
            system.updateFunction = (particles) => {
                base.call(system, particles);
                if (mode !== 'dust') this._driftAirParticles(particles, mode);
                this._lightAirParticles(particles, mode);
            };
        };
        wrap(this.haze, 'haze');
        wrap(this.dustMotes, 'dust');
        if (this.fogMachines) {
            for (const machine of this.fogMachines) {
                wrap(machine && machine.emitter, 'plume');
            }
        }
    }

    /** Add a bounded elapsed-time wind offset after the particle system's normal motion. */
    _driftAirParticles(particles, mode) {
        if (!particles || particles.length === 0) return;
        const frameMs = this.engine && typeof this.engine.getDeltaTime === 'function'
            ? this.engine.getDeltaTime() : 0;
        const dt = Number.isFinite(frameMs) && frameMs > 0
            ? Math.min(4 / 60, frameMs / 1000) : 1 / 60;
        const plume = mode === 'plume';
        const kick = this.photosensitiveSafeMode ? 0 : Math.min(1, Math.max(0, (this.kickPulse || 0) * 0.4));
        const amplitude = (plume ? 0.08 : 0.045) * (1 + kick * 0.12);
        const frequency = (plume ? 0.55 : 0.34) * (1 + kick * 0.12);
        const tau = Math.PI * 2;

        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            const pos = particle.position;
            if (!pos) continue;
            if (!Number.isFinite(particle._airDriftSeed)) {
                const hash = Math.sin(pos.x * 12.9898 + pos.y * 78.233 + pos.z * 37.719) * 43758.5453;
                const seed = hash - Math.floor(hash);
                const angle = seed * tau;
                particle._airDriftSeed = seed;
                particle._airDriftPhase = 0;
                particle._airDriftAge = Number.isFinite(particle.age) ? particle.age : null;
                particle._airDriftBaseX = Math.sin(angle);
                particle._airDriftBaseY = Math.sin(angle * 1.7);
                particle._airDriftBaseZ = Math.cos(angle * 1.37);
                particle._airDriftX = 0;
                particle._airDriftY = 0;
                particle._airDriftZ = 0;
            } else if (Number.isFinite(particle.age) && Number.isFinite(particle._airDriftAge) &&
                particle.age < particle._airDriftAge) {
                particle._airDriftPhase = 0;
                particle._airDriftX = particle._airDriftY = particle._airDriftZ = 0;
            }

            const phase = particle._airDriftPhase + dt * frequency;
            const angle = particle._airDriftSeed * tau;
            const x = amplitude * (Math.sin(phase + angle) - particle._airDriftBaseX);
            const y = amplitude * 0.22 * (Math.sin(phase * 0.71 + angle * 1.7) - particle._airDriftBaseY);
            const z = amplitude * 0.75 * (Math.cos(phase * 0.83 + angle * 1.37) - particle._airDriftBaseZ);
            pos.x += x - particle._airDriftX;
            pos.y += y - particle._airDriftY;
            pos.z += z - particle._airDriftZ;
            if (plume) {
                let surfaceY = 0;
                const stage = Math.abs(pos.x) <= 3 && pos.z >= -20 && pos.z <= -16 ? 0.5 : -Infinity;
                const mezz = window.MezzanineLayout && window.MezzanineLayout.deck;
                const deck = mezz && pos.x >= mezz.x0 && pos.x <= mezz.x1 && pos.z >= mezz.z0 && pos.z <= mezz.z1
                    ? mezz.top : -Infinity;
                const counter = window.VenueLayout && window.VenueLayout.bar && window.VenueLayout.bar.counter;
                const bar = counter && pos.x >= counter.xFront && pos.x <= counter.xBack &&
                    pos.z >= counter.z0 && pos.z <= counter.z1 ? counter.top : -Infinity;
                surfaceY = Math.max(surfaceY, stage, deck, bar);
                if (pos.y < surfaceY + 0.12) {
                    pos.y = surfaceY + 0.12;
                    if (particle.direction && particle.direction.y < 0) {
                        const impinge = -particle.direction.y;
                        particle.direction.y *= 0.18;
                        // Cooled fog impinging on the dance floor or stage spreads forward toward the DJ booth and outward
                        const hasHorizontal = Math.abs(particle.direction.x) > 1e-4 || Math.abs(particle.direction.z) > 1e-4;
                        if (hasHorizontal) {
                            const redirect = impinge * 0.48;
                            particle.direction.z -= redirect * 0.80;
                            const spreadSign = Math.abs(particle.direction.x) > 1e-4
                                ? Math.sign(particle.direction.x) : (pos.x < 0 ? 1 : (pos.x > 0 ? -1 : 0));
                            particle.direction.x += spreadSign * redirect * 0.28;
                        }
                    }
                }
                if (pos.z < -19.65) {
                    pos.z = -19.65;
                    if (particle.direction && particle.direction.z < 0) {
                        particle.direction.z *= -0.15;
                    }
                }
                if (particle.direction && particle.direction.y > 0) {
                    particle.direction.y = Math.min(particle.direction.y, 0.5);
                }
            }
            particle._airDriftPhase = phase;
            particle._airDriftAge = Number.isFinite(particle.age) ? particle.age : null;
            particle._airDriftX = x;
            particle._airDriftY = y;
            particle._airDriftZ = z;
        }
    }

    /** Snapshot of the lit cones for this frame, shared by the haze and dust passes. */
    _gatherAirBeams() {
        const frame = this.scene.getFrameId();
        if (this._airBeamFrame === frame) return this._airBeams;
        this._airBeamFrame = frame;
        const beams = this._airBeams || (this._airBeams = []);
        let n = 0;
        const spots = this.spotlights;
        const dim = this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity));
        if (this.lightsActive && spots && dim > 0.01 && this.spotBrightness !== 0) {
            for (let i = 0; i < spots.length; i++) {
                const spot = spots[i];
                if (spot.beamVisible === false || spot._rigLevel === 0) continue;
                const hit = spot._surfaceHit;
                const kickGain = 1 + (this.kickPulse || 0) * 0.9;
                const unpulsedIntensity = (spot._photoIntensity || 0) / kickGain;
                const gain = unpulsedIntensity / 40;
                if (gain <= 0.02) continue;
                const pos = spot._photoPos || spot.basePos || spot.position;
                if (!pos) continue;
                const dir = spot._photoDir || spot.direction || { x: 0, y: -1, z: 0 };
                const dirLen = Math.hypot(dir.x, dir.y, dir.z) || 1;
                const b = beams[n] || (beams[n] = {});
                b.spot = spot;
                b.color = spot._renderColor || this.currentSpotColor;
                b.ox = pos.x; b.oy = pos.y; b.oz = pos.z;
                b.dx = dir.x / dirLen; b.dy = dir.y / dirLen; b.dz = dir.z / dirLen;
                b.tan = Math.tan((spot._photoAngle || 0.52) * 0.5);
                b.len = hit ? hit.centerDistanceToSurface : 14;
                b.gain = Math.min(1.8, gain);
                b.acc = 0;
                n++;
            }
        }
        // Mirror-ball incident beams (from (±4, 7.5, -8/-16) lens apertures to (0, 6.5, -12)) also illuminate smoke plumes crossing them
        if (this.mirrorBallActive && this.mirrorBallSpotlightColor && dim > 0.02) {
            const mbBeams = this.mirrorBallBeams;
            if (mbBeams && mbBeams.length > 0 && mbBeams[0].origin && mbBeams[0].direction) {
                for (let m = 0; m < mbBeams.length; m++) {
                    const mb = mbBeams[m];
                    const dLen = Math.hypot(mb.direction.x, mb.direction.y, mb.direction.z) || 1;
                    const b = beams[n] || (beams[n] = {});
                    b.spot = null;
                    b.color = this.mirrorBallSpotlightColor;
                    b.ox = mb.origin.x; b.oy = mb.origin.y; b.oz = mb.origin.z;
                    b.dx = mb.direction.x / dLen; b.dy = mb.direction.y / dLen; b.dz = mb.direction.z / dLen;
                    b.tan = 0.145;
                    b.len = (mb.length || 5.3) + 1.0;
                    b.gain = 0.95 * dim;
                    b.acc = 0;
                    n++;
                }
            } else {
                const mbSources = this._mbAirSources || (this._mbAirSources = [
                    { ox: 4, oy: 7.5, oz: -8 }, { ox: -4, oy: 7.5, oz: -8 },
                    { ox: 4, oy: 7.5, oz: -16 }, { ox: -4, oy: 7.5, oz: -16 }
                ]);
                for (let m = 0; m < mbSources.length; m++) {
                    const src = mbSources[m];
                    const vx = 0 - src.ox, vy = 6.5 - src.oy, vz = -12 - src.oz;
                    const len = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
                    const b = beams[n] || (beams[n] = {});
                    b.spot = null;
                    b.color = this.mirrorBallSpotlightColor;
                    b.ox = src.ox; b.oy = src.oy; b.oz = src.oz;
                    b.dx = vx / len; b.dy = vy / len; b.dz = vz / len;
                    b.tan = 0.145;
                    b.len = len + 1.5;
                    b.gain = 0.95 * dim;
                    b.acc = 0;
                    n++;
                }
            }
        }
        // Rotating ceiling laser beams (3 projectors × 5 beams) cut moving coloured streaks through the smoke
        if (this.lasersActive && this.lasers && dim > 0.02 && typeof this._aimLaserBeam === 'function') {
            const brightness = Number.isFinite(this.laserBrightness)
                ? Math.min(this.photosensitiveSafeMode ? 1 : 2, Math.max(0, this.laserBrightness)) : 1;
            const lCol = typeof this._laserColor === 'function' ? this._laserColor() : this.currentSpotColor;
            const scratch = this._airLaserDir || (this._airLaserDir = { x: 0, y: -1, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
            for (let li = 0; li < this.lasers.length; li++) {
                const laser = this.lasers[li];
                const o = laser && laser.originPos;
                if (!o || !laser.beams) continue;
                for (let bi = 0; bi < laser.beams.length; bi++) {
                    const beam = laser.beams[bi];
                    this._aimLaserBeam(laser, beam, li, scratch);
                    const sLen = Math.hypot(scratch.x, scratch.y, scratch.z) || 1;
                    const b = beams[n] || (beams[n] = {});
                    b.spot = null;
                    b.mediumBeam = beam;
                    b.color = lCol;
                    b.ox = o.x; b.oy = o.y; b.oz = o.z;
                    b.dx = scratch.x / sLen; b.dy = scratch.y / sLen; b.dz = scratch.z / sLen;
                    b.tan = 0.008;
                    b.len = beam.length || 14;
                    b.gain = 1.15 * dim * brightness;
                    b.acc = 0;
                    n++;
                }
            }
        }
        this._airBeamCount = n;
        return beams;
    }

    /**
     * Downsample the live 21×10 LED wall (`this.ledPanels`) into a 7×3 spatial emitter grid once per frame.
     * Each cell stores [R, G, B] so multi-colour patterns and moving waves on the wall naturally travel
     * across the smoke particles in 3D space. Allocates nothing per frame.
     */
    _gatherAirLedWall() {
        const frame = typeof this.scene?.getFrameId === 'function' ? this.scene.getFrameId() : 0;
        if (this._airLedFrame === frame) return this._airLedActive;
        this._airLedFrame = frame;
        const master = this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity));
        const wallLevel = this.ledWallLevel == null ? 1 : Math.max(0, Math.min(1, this.ledWallLevel));
        const brightness = Number.isFinite(this.ledWallBrightness)
            ? Math.min(this.photosensitiveSafeMode ? 1 : 2, Math.max(0, this.ledWallBrightness)) : 1;
        const dim = master * wallLevel * brightness;
        if (!this.ledWallActive || dim <= 0.002) {
            this._airLedMeanR = this._airLedMeanG = this._airLedMeanB = this._airLedMeanLit = 0;
            this._airLedHasMean = true;
            this._airLedActive = false;
            return false;
        }
        const grid = this._airLedGrid || (this._airLedGrid = new Float32Array(7 * 3 * 3));
        const panels = this.ledPanels;
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        if (panels && panels.length >= cols * rows) {
            // Cadence-held panels still carry the last applied master/level/brightness.
            const panelScale = Number.isFinite(this._ledAppliedLevel) ? 1 : dim;
            let any = false;
            let totalR = 0, totalG = 0, totalB = 0, totalCnt = 0;
            for (let gy = 0; gy < 3; gy++) {
                const r0 = gy === 0 ? 0 : (gy === 1 ? 3 : 7);
                const r1 = gy === 0 ? 3 : (gy === 1 ? 7 : rows);
                for (let gx = 0; gx < 7; gx++) {
                    const c0 = gx * 3;
                    const c1 = Math.min(cols, c0 + 3);
                    let sr = 0, sg = 0, sb = 0, cnt = 0;
                    for (let r = r0; r < r1; r++) {
                        const rowOff = r * cols;
                        for (let c = c0; c < c1; c++) {
                            const ec = panels[rowOff + c]?.material?.emissiveColor;
                            if (ec) {
                                const pr = Math.max(0, ec.r * panelScale);
                                const pg = Math.max(0, ec.g * panelScale);
                                const pb = Math.max(0, ec.b * panelScale);
                                // Display-space panel emission to linear radiometric flux: dim accompaniment
                                // patterns emit far less light into the room than full-drive panels.
                                const peak = Math.max(pr, pg, pb);
                                const transfer = 0.12 + 0.88 * Math.min(1, peak);
                                sr += pr * transfer;
                                sg += pg * transfer;
                                sb += pb * transfer;
                                cnt++;
                            }
                        }
                    }
                    const inv = cnt > 0 ? 1 / cnt : 0;
                    const idx = (gy * 7 + gx) * 3;
                    const cr = sr * inv, cg = sg * inv, cb = sb * inv;
                    grid[idx] = cr;
                    grid[idx + 1] = cg;
                    grid[idx + 2] = cb;
                    totalR += sr;
                    totalG += sg;
                    totalB += sb;
                    totalCnt += cnt;
                    if (cr + cg + cb > 0.003) any = true;
                }
            }
            const invTotal = totalCnt > 0 ? 1 / totalCnt : 0;
            this._airLedMeanR = totalR * invTotal;
            this._airLedMeanG = totalG * invTotal;
            this._airLedMeanB = totalB * invTotal;
            this._airLedMeanLit = Math.max(this._airLedMeanR, this._airLedMeanG, this._airLedMeanB);
            this._airLedHasMean = true;
            this._airLedActive = any;
            return any;
        }
        const fallback = this.ledShowColor;
        if (!fallback) {
            this._airLedMeanR = this._airLedMeanG = this._airLedMeanB = this._airLedMeanLit = 0;
            this._airLedHasMean = false;
            this._airLedActive = false;
            return false;
        }
        const fPeak = Math.max(0, fallback.r, fallback.g, fallback.b) * dim;
        const fScale = dim * (0.12 + 0.88 * Math.min(1, fPeak));
        const fr = Math.max(0, fallback.r * fScale);
        const fg = Math.max(0, fallback.g * fScale);
        const fb = Math.max(0, fallback.b * fScale);
        for (let i = 0; i < 21; i++) {
            const idx = i * 3;
            grid[idx] = fr;
            grid[idx + 1] = fg;
            grid[idx + 2] = fb;
        }
        this._airLedMeanR = fr;
        this._airLedMeanG = fg;
        this._airLedMeanB = fb;
        this._airLedMeanLit = Math.max(fr, fg, fb);
        this._airLedHasMean = true;
        this._airLedActive = fr + fg + fb > 0.003;
        return this._airLedActive;
    }

    /** Sample the 7×3 spatial LED-wall grid at a 3D particle position `pos` (writes `out.r/g/b/lit`). */
    _sampleAirLedWall(pos, out, cp) {
        const grid = this._airLedGrid;
        const dz = Math.max(0.6, pos.z - (-20));
        if (!grid || dz > 18) { out.r = out.g = out.b = out.lit = 0; return; }
        const u = Math.max(0, Math.min(5.999, ((pos.x + 12) / 24) * 6));
        const v = Math.max(0, Math.min(1.999, ((pos.y - 0.5) / 9) * 2));
        const ix = u | 0, iy = v | 0;
        const fx = u - ix, fy = v - iy;
        const i00 = (iy * 7 + ix) * 3;
        const i10 = i00 + 3;
        const i01 = i00 + 21;
        const i11 = i01 + 3;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        let r = grid[i00] * w00 + grid[i10] * w10 + grid[i01] * w01 + grid[i11] * w11;
        let g = grid[i00 + 1] * w00 + grid[i10 + 1] * w10 + grid[i01 + 1] * w01 + grid[i11 + 1] * w11;
        let b = grid[i00 + 2] * w00 + grid[i10 + 2] * w10 + grid[i01 + 2] * w01 + grid[i11 + 2] * w11;
        // Area-light angular spread with distance from the wall while preserving left/centre/right colour separation
        const spread = Math.min(0.35, dz * 0.02);
        if (spread > 0.01) {
            const leftIdx = (iy * 7 + Math.max(0, ix - 1)) * 3;
            const rightIdx = (iy * 7 + Math.min(6, ix + 2)) * 3;
            r = r * (1 - spread) + (grid[leftIdx] + grid[rightIdx]) * 0.5 * spread;
            g = g * (1 - spread) + (grid[leftIdx + 1] + grid[rightIdx + 1]) * 0.5 * spread;
            b = b * (1 - spread) + (grid[leftIdx + 2] + grid[rightIdx + 2]) * 0.5 * spread;
        }
        // Finite-aperture Lambertian emitter falloff + lateral cosine obliquity + Mie forward scatter
        const offX = Math.max(0, Math.abs(pos.x) - 10.5);
        const offY = Math.max(0, Math.abs(pos.y - 5.0) - 4.5);
        const obliquity = 1 / Math.sqrt(1 + (offX * offX + offY * offY) / (dz * dz + 12));
        let phase = 1.0;
        if (cp) {
            const cx = cp.x - pos.x, cy = cp.y - pos.y, cz = cp.z - pos.z;
            const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
            const cosView = Math.max(-1, Math.min(1, cz / cl));
            phase = 0.85 + 0.30 * Math.max(0, cosView);
        }
        const atten = (0.62 * obliquity * phase) / (1 + dz * 0.26 + dz * dz * 0.042);
        out.r = r * atten;
        out.g = g * atten;
        out.b = b * atten;
        out.lit = Math.max(out.r, out.g, out.b);
    }

    /** Snapshot of the active scanning laser-sheet planes for this frame so smoke puffs touching a sheet light up. */
    _gatherAirSheets() {
        const frame = this.scene ? this.scene.getFrameId() : 0;
        if (this._airSheetFrame === frame) return this._airSheets;
        this._airSheetFrame = frame;
        const sheets = this._airSheets || (this._airSheets = []);
        let n = 0;
        if (this.laserSheetActive && this.laserSheetSource && (this.masterIntensity == null || this.masterIntensity > 0.02)) {
            const addSource = (scanner) => {
                if (!scanner || !scanner.position || !scanner.rotation) return;
                const matrix = scanner.computeWorldMatrix ? scanner.computeWorldMatrix(true).m : null;
                const pitch = scanner.rotation.x || 0;
                const yaw = scanner.rotation.y || 0;
                const cp = Math.cos(pitch), sp = Math.sin(pitch);
                const cy = Math.cos(yaw), sy = Math.sin(yaw);
                const s = sheets[n] || (sheets[n] = {});
                s.ox = matrix ? matrix[12] : scanner.position.x;
                s.oy = matrix ? matrix[13] : scanner.position.y;
                s.oz = matrix ? matrix[14] : scanner.position.z;
                // Orthonormal basis of the projector under Euler YXZ(yaw, pitch, 0):
                // forward (local +Z), plane normal (local +Y), and lateral fan axis (local +X)
                s.fx = sy * cp; s.fy = -sp; s.fz = cy * cp;
                s.nx = sy * sp; s.ny = cp; s.nz = cy * sp;
                s.rx = cy; s.ry = 0; s.rz = -sy;
                s.acc = 0;
                n++;
            };
            addSource(this.laserSheetSource);
            if (this._laserSheetFollower && this._laserSheetFollower.mount) {
                addSource(this._laserSheetFollower.mount.scanner || this._laserSheetFollower.mount.housing);
            }
        }
        this._airSheetCount = n;
        this._airSheetTime = this._laserSheetLastPoseTime || 0;
        return sheets;
    }

    /**
     * Evaluate how strongly a smoke puff at `pos` is sliced by the active scanning laser sheets:
     * includes lateral fan bounds, galvo turnaround edge brightening, 1/r radial falloff,
     * razor-thin planar cross-section, forward Mie scatter, and scrolling wisp modulation.
     */
    _sampleAirSheets(pos, size, isPlume, dim, cp, sheets, nSheets) {
        let sheetLit = 0;
        const brightness = Number.isFinite(this.laserSheetBrightness)
            ? Math.min(this.photosensitiveSafeMode ? 1 : 3, Math.max(0, this.laserSheetBrightness)) : 1;
        const t = this._airSheetTime || 0;
        for (let s = 0; s < nSheets; s++) {
            const sh = sheets[s];
            const vx = pos.x - sh.ox, vy = pos.y - sh.oy, vz = pos.z - sh.oz;
            const along = vx * sh.fx + vy * sh.fy + vz * sh.fz;
            if (along < 0.3 || along > 24) continue;
            const fanHalfW = along * (11 / 24);
            const across = vx * sh.rx + vy * sh.ry + vz * sh.rz;
            if (Math.abs(across) > fanHalfW + size * 0.35) continue;
            const dist = Math.abs(vx * sh.nx + vy * sh.ny + vz * sh.nz);
            const halfThick = (isPlume ? 0.52 : 0.32) + size * 0.24;
            if (dist >= halfThick) continue;
            const veil = 1 - dist / halfThick;
            const core = Math.exp(-(dist * dist) / 0.024);
            const uNorm = Math.min(1, Math.abs(across) / Math.max(0.1, fanHalfW));
            const edgeBoost = 0.78 + 0.35 * Math.pow(uNorm, 6);
            const falloff = Math.min(1, Math.pow(3.5 / Math.max(along, 1.5), 0.42)) * Math.exp(-0.014 * along);
            const wisp = 0.72 + 0.28 * Math.sin(along * 0.9 - t * 3.0) * Math.cos(across * 1.15 + t * 1.6);
            let phase = 0.75;
            if (cp) {
                const cx = cp.x - pos.x, cy = cp.y - pos.y, cz = cp.z - pos.z;
                const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
                const cosT = Math.max(-1, Math.min(1, (cx * sh.fx + cy * sh.fy + cz * sh.fz) / cl));
                phase = 0.65 + Math.min(0.65, 0.24 / Math.pow(1.25 - cosT * 0.75, 1.5));
            }
            // Subtle, delicate sheet slice: the laser sheet is a thin low-alpha veil, not a spotlight
            const contrib = (0.22 * veil * veil + 0.38 * core) * edgeBoost * falloff * wisp * phase * dim * brightness;
            sheetLit += contrib;
            sh.acc += contrib;
        }
        return sheetLit;
    }

    /**
     * Evaluate directional parabolic flood + forward Mie silver-lining scatter from firing corner strobes
     * at a 3D smoke particle position `pos` (writes `out.r/g/b/lit`).
     */
    _sampleAirStrobes(pos, dim, cp, out) {
        out.r = out.g = out.b = out.lit = 0;
        if (!this.strobesActive || this.photosensitiveSafeMode || !this.strobes) return;
        for (let si = 0; si < this.strobes.length; si++) {
            const st = this.strobes[si];
            if (!st || !(st.flashDuration > 0)) continue;
            const sp = st.mesh && st.mesh.position;
            const sx = sp ? sp.x : 0, sy = sp ? (sp.y || 7.6) : 7.6, sz = sp ? (sp.z || -8) : -8;
            const vx = pos.x - sx, vy = pos.y - sy, vz = pos.z - sz;
            const distSq = vx * vx + vy * vy + vz * vz;
            const d = Math.sqrt(distSq) || 1;
            // Parabolic reflector floods inward and downward toward the dance floor centre (0, 2.0, -12)
            const aimX = -sx, aimY = 2.0 - sy, aimZ = -12 - sz;
            const aimLen = Math.sqrt(aimX * aimX + aimY * aimY + aimZ * aimZ) || 1;
            const cosFlood = (vx * aimX + vy * aimY + vz * aimZ) / (d * aimLen);
            const flood = Math.max(0.18, Math.min(1, (cosFlood + 0.25) / 0.95));
            // Forward Mie silver-lining scatter when looking through smoke toward the firing strobe
            let phase = 0.55;
            if (cp) {
                const cx = cp.x - pos.x, cy = cp.y - pos.y, cz = cp.z - pos.z;
                const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
                const cosView = Math.max(-1, Math.min(1, (cx * vx + cy * vy + cz * vz) / (cl * d)));
                phase = 0.45 + Math.min(1.4, 0.28 / Math.pow(1.38 - cosView * 0.85, 1.5));
            }
            const pulse = Math.min(1.2, Math.max(0.45, st.flashDuration / 0.032)) * ((st.currentIntensity || 80) / 80);
            const sw = (2.1 * dim * pulse * flood * phase) / (1 + distSq * 0.032);
            // Crisp xenon strobe colour temperature (cool blue-white)
            out.r += sw * 0.95;
            out.g += sw * 0.98;
            out.b += sw * 1.00;
            out.lit += sw;
        }
    }

    _sampleAirMirrorRays(pos, size, cp, dim, isDust, out) {
        out.r = out.g = out.b = out.lit = 0;
        const batch = this.mirrorReflectionBatch;
        const color = this.mirrorBallSpotlightColor;
        if (!this.mirrorBallActive || this.mirrorBallRaysActive === false || !batch ||
            !batch.rayCount || !batch.rayOrigins || !color) return;

        const smoke = typeof this._mirrorSmokeAmount === 'function' ? this._mirrorSmokeAmount() :
            (this.smokeActive === false ? 0 : 1);
        const medium = isDust ? 0.25 + 0.75 * smoke : smoke;
        if (medium <= 0.001) return;
        const count = Math.min(8, batch.rayCount);
        const stride = Math.max(1, Math.ceil(batch.rayCount / count));
        for (let i = 0; i < batch.rayCount; i += stride) {
            const length = batch.rayLengths[i];
            const strength = batch.rayStrengths[i];
            if (!(length > 0) || !(strength > 0)) continue;
            const o = i * 3;
            const dx = batch.rayDirections[o], dy = batch.rayDirections[o + 1], dz = batch.rayDirections[o + 2];
            const vx = pos.x - batch.rayOrigins[o];
            const vy = pos.y - batch.rayOrigins[o + 1];
            const vz = pos.z - batch.rayOrigins[o + 2];
            const t = vx * dx + vy * dy + vz * dz;
            if (t <= 0 || t >= length) continue;
            const radialSq = Math.max(0, vx * vx + vy * vy + vz * vz - t * t);
            const width = Math.min(0.42, 0.18 + length * 0.012) / 0.24;
            const radius = (0.025 + 0.095 * t / length) * width + (size || 0) * 0.1;
            const q = radialSq / (radius * radius);
            if (q >= 2.5) continue;
            const radial = q < 1 ? (1 - q) * (1 - q) : 0.08 * (2.5 - q) / 1.5;
            let phase = 0.65;
            if (cp) {
                const cx = cp.x - pos.x, cy = cp.y - pos.y, cz = cp.z - pos.z;
                const cameraLength = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
                const cosine = Math.max(-1, Math.min(1, (dx * cx + dy * cy + dz * cz) / cameraLength));
                phase = Math.min(1.8, 0.65 + 0.35 / Math.pow(1.2025 - 0.9 * cosine, 1.5));
            }
            const contribution = strength * medium * dim * 1.8 * radial * phase / (1 + t * 0.035);
            out.r += color.r * contribution;
            out.g += color.g * contribution;
            out.b += color.b * contribution;
            out.lit += contribution;
        }
    }

    _lightAirParticles(particles, mode) {
        if (!this.scene || !particles) return;
        const isPlume = mode === 'plume';
        const frameId = typeof this.scene.getFrameId === 'function' ? this.scene.getFrameId() : 0;
        const frameMs = this.engine && typeof this.engine.getDeltaTime === 'function' ? this.engine.getDeltaTime() : 0;
        const dt = Number.isFinite(frameMs) && frameMs > 0 ? Math.min(4 / 60, frameMs / 1000) : 1 / 60;
        const stride = this.isInVRMode ? 3 : 1;
        const start = stride > 1 ? (frameId + (isPlume ? 2 : (mode === 'dust' ? 1 : 0))) % stride : 0;
        const beams = this._gatherAirBeams();
        const nBeams = this._airBeamCount || 0;
        const sheets = this._gatherAirSheets ? this._gatherAirSheets() : null;
        const nSheets = this._airSheetCount || 0;
        const ledActive = this._gatherAirLedWall ? this._gatherAirLedWall() : false;
        const ledSample = this._airLedSample || (this._airLedSample = { r: 0, g: 0, b: 0, lit: 0 });
        const laserColor = ((nSheets > 0 || this.lasersActive) && typeof this._laserColor === 'function') ? this._laserColor() : null;
        const cam = this.scene.activeCamera;
        const cp = cam ? (cam.globalPosition || cam.position) : null;
        const tint = this.currentSpotColor;
        const isDust = mode === 'dust';
        const dim = Number.isFinite(this.masterIntensity) ? Math.max(0, Math.min(1, this.masterIntensity)) : 1;
        const maxQ = isPlume ? 5.5 : 1.0;
        let strobeFiring = false;
        if (dim > 0.01 && this.strobesActive && !this.photosensitiveSafeMode && this.strobes) {
            for (let i = 0; i < this.strobes.length; i++) {
                if (this.strobes[i] && this.strobes[i].flashDuration > 0) {
                    strobeFiring = true;
                    break;
                }
            }
        }

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const pos = p.position;
            if (!pos || !p.color) continue;
            const sampled = stride === 1 || i % stride === start;
            let airState = p._airLightState;
            if (!sampled && !airState) continue;
            if (!airState) {
                airState = p._airLightState = {
                    beam: { r: 0, g: 0, b: 0, lit: 0 },
                    sheet: { r: 0, g: 0, b: 0, lit: 0 },
                    local: { r: 0, g: 0, b: 0, lit: 0 }
                };
            }
            const hasBeamCamera = !!(cp && nBeams);
            const cx = hasBeamCamera ? cp.x - pos.x : 0;
            const cy = hasBeamCamera ? cp.y - pos.y : 0;
            const cz = hasBeamCamera ? cp.z - pos.z : 0;
            const cameraDistance = hasBeamCamera ? (Math.sqrt(cx * cx + cy * cy + cz * cz) || 1) : 1;
            let lit = 0;
            let beamR = 0, beamG = 0, beamB = 0;
            let rawSheetLit = 0;
            let localR = 0, localG = 0, localB = 0, localLit = 0;
            if (sampled) {
                for (let k = 0; k < nBeams; k++) {
                    const b = beams[k];
                    const vx = pos.x - b.ox, vy = pos.y - b.oy, vz = pos.z - b.oz;
                    const t = vx * b.dx + vy * b.dy + vz * b.dz;
                    if (t < 0.25 || t > b.len) continue;
                    const rad = Math.max(1e-3, t * b.tan + (p.size || 0) * 0.35);
                    const radialSq = Math.max(0, vx * vx + vy * vy + vz * vz - t * t);
                    const q = radialSq / (rad * rad);
                    if (q >= maxQ && (!isPlume || radialSq >= 51.84)) continue;
                    let w = 0;
                    if (q < 1) {
                        const edge = 1 - q;
                        w = edge * edge * (3 - 2 * edge) * b.gain;
                        if (!isDust && (b.spot || b.mediumBeam)) b.acc += w * stride;
                    } else if (q < maxQ) {
                        const halo = (maxQ - q) / (maxQ - 1);
                        w = 0.36 * halo * halo * b.gain / (1 + t * 0.05);
                    }
                    // Wide forward-scattered room wash (< 7.2 m) so nozzle smoke plumes rolling across the
                    // dance floor remain visibly lit between the narrow 12° spotlight cores.
                    if (isPlume && radialSq < 51.84) {
                        const washFade = 1 - Math.sqrt(radialSq) / 7.2;
                        w += 0.28 * washFade * washFade * b.gain / (1 + t * 0.05);
                    }
                    let phase = 0.5;
                    if (cp) {
                        const cosT = Math.max(-1, Math.min(1, (cx * b.dx + cy * b.dy + cz * b.dz) / cameraDistance));
                        phase = Math.min(1, 0.35 / Math.pow(1.25 - cosT, 1.5));
                    }
                    const contrib = w * (0.35 + 0.65 * phase);
                    lit += contrib;
                    const bc = b.color || tint;
                    if (bc) {
                        beamR += Math.max(0, bc.r) * contrib;
                        beamG += Math.max(0, bc.g) * contrib;
                        beamB += Math.max(0, bc.b) * contrib;
                    }
                }
                const sampleDt = Math.min(0.1, dt * stride);
                if (dim <= 0.01) {
                    airState.beam.r = airState.beam.g = airState.beam.b = airState.beam.lit = 0;
                    airState.sheet.r = airState.sheet.g = airState.sheet.b = airState.sheet.lit = 0;
                    airState.local.r = airState.local.g = airState.local.b = airState.local.lit = 0;
                } else {
                    easeAirLightSample(airState.beam, beamR, beamG, beamB, lit, sampleDt, 0.12, 0.32);
                }
                rawSheetLit = nSheets > 0
                    ? (this._sampleAirSheets || VRClubAnimationCore.prototype._sampleAirSheets).call(this, pos, p.size || 1, isPlume, dim, cp, sheets, nSheets)
                    : 0;
                const sheetColor = laserColor || tint;
                if (dim > 0.01) {
                    easeAirLightSample(airState.sheet,
                        sheetColor ? sheetColor.r * rawSheetLit : 0,
                        sheetColor ? sheetColor.g * rawSheetLit : 0,
                        sheetColor ? sheetColor.b * rawSheetLit : 0,
                        rawSheetLit, sampleDt, 0.18, 0.42);
                }
                if (ledActive) {
                    (this._sampleAirLedWall || VRClubAnimationCore.prototype._sampleAirLedWall).call(this, pos, ledSample, cp);
                    localR += ledSample.r;
                    localG += ledSample.g;
                    localB += ledSample.b;
                    localLit += ledSample.lit;
                }
                if (dim > 0.01) {
                    if (this.mirrorBallActive && this.mirrorBallSpotlightColor) {
                        const mirrorSample = this._airMirrorSample || (this._airMirrorSample = { r: 0, g: 0, b: 0, lit: 0 });
                        (this._sampleAirMirrorRays || VRClubAnimationCore.prototype._sampleAirMirrorRays)
                            .call(this, pos, p.size || 0, cp, dim, isDust, mirrorSample);
                        localR += mirrorSample.r;
                        localG += mirrorSample.g;
                        localB += mirrorSample.b;
                        localLit += mirrorSample.lit;
                    }
                    if (strobeFiring) {
                        const strobeSample = this._airStrobeSample || (this._airStrobeSample = { r: 0, g: 0, b: 0, lit: 0 });
                        (this._sampleAirStrobes || VRClubAnimationCore.prototype._sampleAirStrobes).call(this, pos, dim, cp, strobeSample);
                        localR += strobeSample.r;
                        localG += strobeSample.g;
                        localB += strobeSample.b;
                        localLit += strobeSample.lit;
                    }
                }
                if (isDust) {
                    localR *= 0.4;
                    localG *= 0.4;
                    localB *= 0.4;
                    localLit *= 0.4;
                }
                airState.local.r = Math.max(0, localR);
                airState.local.g = Math.max(0, localG);
                airState.local.b = Math.max(0, localB);
                airState.local.lit = Math.max(0, localLit);
            }
            lit = dim > 0.01 ? airState.beam.lit : 0;
            beamR = dim > 0.01 ? airState.beam.r : 0;
            beamG = dim > 0.01 ? airState.beam.g : 0;
            beamB = dim > 0.01 ? airState.beam.b : 0;
            const sheetLit = dim > 0.01 ? airState.sheet.lit : 0;
            localR = dim > 0.01 ? airState.local.r : 0;
            localG = dim > 0.01 ? airState.local.g : 0;
            localB = dim > 0.01 ? airState.local.b : 0;
            localLit = dim > 0.01 ? airState.local.lit : 0;
            const c = p.color;
            const cameraDistanceForFade = cp
                ? Math.sqrt((cp.x - pos.x) ** 2 + (cp.y - pos.y) ** 2 + (cp.z - pos.z) ** 2)
                : Infinity;
            const nearFade = Math.max(0, Math.min(1, (cameraDistanceForFade - 0.35) / 0.65));
            const nearFadeSmooth = nearFade * nearFade * (3 - 2 * nearFade);
            if (isPlume) {
                const bounceLit = dim > 0.01 && Number.isFinite(this._airBounceLit) ? this._airBounceLit : 0;
                const bounceR = bounceLit > 0 ? (this._airBounceR || 0) : 0;
                const bounceG = bounceLit > 0 ? (this._airBounceG || 0) : 0;
                const bounceB = bounceLit > 0 ? (this._airBounceB || 0) : 0;
                const sheetWeight = sheetLit * 1.15;
                const directLit = localLit + lit + sheetWeight;
                const totalLit = directLit + bounceLit;
                if (totalLit <= 0.001) {
                    // No light reaching this particle's 3D position: smoke stays dark unlit fog
                    c.r = 0.02;
                    c.g = 0.022;
                    c.b = 0.03;
                    c.a *= 0.08;
                } else {
                    const sheetScale = sheetLit > 0 ? sheetWeight / sheetLit : 0;
                    const rSum = bounceR + localR + beamR + airState.sheet.r * sheetScale;
                    const gSum = bounceG + localG + beamG + airState.sheet.g * sheetScale;
                    const bSum = bounceB + localB + beamB + airState.sheet.b * sheetScale;
                    // Radiative scatter is proportional to incident irradiance (no floor that turns dim wall light bright).
                    const shoulder = 1.95 / (1 + totalLit * 0.65);
                    const baseMix = Math.max(0, 1 - totalLit * 1.4);
                    // Subtle neutral droplet scattering keeps lit smoke reading as misty white-tinted vapour, not dark soot
                    const mistBody = Math.min(0.065, totalLit * 0.10);
                    c.r = Math.min(1.15, 0.025 * baseMix + mistBody + rSum * shoulder);
                    c.g = Math.min(1.15, 0.028 * baseMix + mistBody + gSum * shoulder);
                    c.b = Math.min(1.15, 0.035 * baseMix + mistBody * 1.05 + bSum * shoulder);
                    c.a = Math.min(0.32, c.a * (0.28 + Math.min(1.6, bounceLit * 1.1 + localLit + lit + sheetWeight * 0.70) * 2.45));
                }
                c.a *= nearFadeSmooth;
                c.r = Number.isFinite(c.r) ? Math.min(4, Math.max(0, c.r)) : 0;
                c.g = Number.isFinite(c.g) ? Math.min(4, Math.max(0, c.g)) : 0;
                c.b = Number.isFinite(c.b) ? Math.min(4, Math.max(0, c.b)) : 0;
                c.a = Number.isFinite(c.a) ? Math.min(1, Math.max(0, c.a)) : 0;
                continue;
            }
            const totalLit = lit + sheetLit * 0.55 + localLit;
            if (isDust) {
                // Dust is only seen where light catches it.
                c.a = Math.min(0.9, c.a * (0.2 + Math.min(1.5, totalLit) * 1.7));
            } else if (totalLit > 0) {
                c.a = Math.min(0.14, c.a * (1 + Math.min(1.0, totalLit) * 1.15));
            }
            c.a *= nearFadeSmooth;
            if ((lit + localLit) > 0.001 && (tint || localLit > 0)) {
                const weight = lit + localLit;
                const m = Math.min(0.78, weight * 0.65);
                const inv = 1 / weight;
                const lumScale = isDust ? 1.1 : Math.min(1.1, 0.22 + weight * 0.95);
                const tr = (beamR + localR) * inv;
                const tg = (beamG + localG) * inv;
                const tb = (beamB + localB) * inv;
                c.r += (tr * lumScale - c.r) * m;
                c.g += (tg * lumScale - c.g) * m;
                c.b += (tb * lumScale - c.b) * m;
            }
            if (sheetLit > 0 && laserColor) {
                const sm = Math.min(0.52, sheetLit * 0.48);
                c.r += (laserColor.r * 0.95 - c.r) * sm;
                c.g += (laserColor.g * 0.95 - c.g) * sm;
                c.b += (laserColor.b * 0.95 - c.b) * sm;
            }
            c.r = Number.isFinite(c.r) ? Math.min(4, Math.max(0, c.r)) : 0;
            c.g = Number.isFinite(c.g) ? Math.min(4, Math.max(0, c.g)) : 0;
            c.b = Number.isFinite(c.b) ? Math.min(4, Math.max(0, c.b)) : 0;
            c.a = Number.isFinite(c.a) ? Math.min(1, Math.max(0, c.a)) : 0;
        }

        if (isPlume && nSheets > 0) {
            let sheetAcc = 0;
            for (let s = 0; s < nSheets; s++) sheetAcc += sheets[s].acc || 0;
            const target = Math.min(1.14, 1.0 + (sheetAcc / Math.max(4, particles.length * 0.08)) * 0.16);
            const cur = this._laserSheetSmokeBoost == null ? target : this._laserSheetSmokeBoost;
            const tau = target > cur ? 0.9 : 1.8;
            this._laserSheetSmokeBoost = cur + (target - cur) * (1 - Math.exp(-dt / tau));
        }
        if (!isDust && particles.length > 0) {
            // The beam mesh reads how much medium actually sits in its cone, and how much smoke there is to scatter it.
            const ref = Math.max(4, particles.length * 0.015);
            const smoke = 0.15 + 0.85 * (Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1));
            for (let k = 0; k < nBeams; k++) {
                const spot = beams[k].spot;
                const target = Math.min(1, beams[k].acc / ref) * smoke;
                if (spot) {
                    const cur = spot._mediumDensity == null ? target : spot._mediumDensity;
                    spot._mediumDensity = cur + (target - cur) * 0.06;
                }
                const mediumBeam = beams[k].mediumBeam;
                if (mediumBeam) {
                    const cur = mediumBeam.mediumDensity == null ? target : mediumBeam.mediumDensity;
                    mediumBeam.mediumDensity = cur + (target - cur) * 0.08;
                }
            }
        }
    }

    /**
     * Aim the lead projector, and the follower when both fire. Pure pose maths (no
     * materials, no scene), so it can be measured on the real geometry.
     */
    _poseLaserSheet(time) {
        if (!this.laserSheetSource) return;
        // The laser speed slider scales the sweep, capped: above ~1.4 the crossing of the
        // two planes outruns the eye, and a legacy phase sets 2.0.
        const speed = Math.min(1.4, Math.max(0.2, (this.laserSpeed || 1.0) * (this.laserSheetSpeed || 1)));
        const phaseRate = 0.32 * Math.sqrt(speed);
        const lastTime = this._laserSheetLastPoseTime;
        if (!Number.isFinite(this._laserSheetScanTime) || !Number.isFinite(lastTime) || time < lastTime) {
            this._laserSheetScanTime = time * phaseRate;
        } else {
            const dt = Math.min(0.1, Math.max(0, time - lastTime));
            this._laserSheetScanTime += dt * phaseRate;
        }
        this._laserSheetLastPoseTime = time;
        const scanTime = this._laserSheetScanTime;
        const sweep = t => Math.sin(t + 0.24 * Math.sin(t * 0.37));
        const primaryPhase = sweep(scanTime);
        const crossPhase = 0.32 * Math.sin(scanTime * 1.71 + 1.1) +
            0.12 * Math.sin(scanTime * 0.63);
        const lateral = this.laserSheetMotion === 'lateral';
        const pitchPhase = lateral ? crossPhase : primaryPhase;
        const yawPhase = lateral ? primaryPhase : crossPhase;
        this.laserSheetSource.rotation.x = this._laserSheetBasePitch + pitchPhase * this._laserSheetPitchRange;
        this.laserSheetSource.rotation.y = this._laserSheetBaseYaw + yawPhase * this._laserSheetYawRange;

        // The second projector mirrors the first across the room and trails it in phase,
        // so the two planes scissor and cross instead of moving as one.
        const follower = this._laserSheetFollower;
        if (follower) {
            const trail = sweep(scanTime + (this._laserSheetTrail || 0.5));
            const trailPitch = lateral ? crossPhase : trail;
            const scanner = follower.mount.scanner || follower.mount.housing;
            scanner.rotation.x = this._laserSheetBasePitch + trailPitch * this._laserSheetPitchRange;
            scanner.rotation.y = -(this._laserSheetBaseYaw + yawPhase * this._laserSheetYawRange);
        }
    }

    /** The colour every show laser emits now: the locked look colour, else the diode in rotation. */
    _laserColor() {
        if (this.colorLockActive && this.currentSpotColor) return this.currentSpotColor;
        const palette = this.cachedLaserColors || this.cachedColors;
        if (this.currentColorIndex === 0) return palette.red;
        if (this.currentColorIndex === 1) return palette.green;
        return palette.blue;
    }

    /**
     * Viewer position and the angle one pixel subtends, for drawing laser lines no thinner than a few
     * pixels. Reuses one scratch object (no per-frame allocation); `cam` is null without a camera.
     */
    _laserView() {
        const view = this._laserViewScratch || (this._laserViewScratch = { cam: null, pixelAngle: 0.8 / 1080 });
        const cam = this.scene && this.scene.activeCamera;
        view.cam = cam ? (cam.globalPosition || cam.position) : null;
        const eye = cam && cam.rigCameras && cam.rigCameras.length ? cam.rigCameras[0] : cam;
        const projection = eye && typeof eye.getProjectionMatrix === 'function' ? eye.getProjectionMatrix().m : null;
        const fov = projection && projection[5] > 0
            ? 2 * Math.atan(1 / projection[5])
            : ((eye && eye.fov) || 0.8);
        const renderHeight = this.engine && typeof this.engine.getRenderHeight === 'function'
            ? this.engine.getRenderHeight() : 1080;
        const viewportHeight = eye && eye.viewport ? eye.viewport.height : 1;
        const pixels = Math.min(2400, Math.max(600, renderHeight * viewportHeight || 1080));
        view.pixelAngle = fov / pixels;
        return view;
    }

    /** Subtle, view-dependent source glare; safe mode keeps it near its steady output. */
    _laserApertureOutput(scanner, color, master, out) {
        let gain = 1;
        const camera = this.scene && this.scene.activeCamera;
        const cam = camera && (camera.globalPosition || camera.position);
        if (scanner && cam && scanner.computeWorldMatrix) {
            const m = scanner.computeWorldMatrix(true).m;
            const dx = cam.x - m[12], dy = cam.y - m[13], dz = cam.z - m[14];
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            const facing = Math.max(0, (m[8] * dx + m[9] * dy + m[10] * dz) / distance);
            const t = Math.max(0, Math.min(1, (facing - 0.72) / 0.24));
            const smooth = t * t * (3 - 2 * t);
            gain += smooth * Math.max(0, 1 - distance / 12) *
                (this.photosensitiveSafeMode ? 0.15 : 0.7);
        }
        color.scaleToRef(master * gain, out);
    }

    /** Scanning laser sheet: continuous tilt sweep and slow smoke UV flow. */
    updateLaserSheet(ctx) {
        const { time, audio: audioData } = ctx;
        const master = (this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity))) *
            (Number.isFinite(this.laserSheetBrightness) ? Math.min(this.photosensitiveSafeMode ? 1 : 3, Math.max(0, this.laserSheetBrightness)) : 1);

        // ANIMATE LASER SHEET (Hyperrealism)
        if (this.laserSheet && this.laserSheetActive) {
            // The material is optional on this mesh; hoist it once instead of guarding
            // in one place and dereferencing unguarded three lines later.
            const sheetMat = this.laserSheet.material;
            if (!sheetMat) return;

            // Compound, slightly asymmetric motion avoids the mechanical pendulum
            // look of a single sine while keeping the fan inside its calibrated aim.
            this._poseLaserSheet(time);
            // Let the haze drift independently of galvo speed instead of painting it onto the scanner.
            if (sheetMat.opacityTexture) {
                sheetMat.opacityTexture.vOffset = -time * 0.004;
                sheetMat.opacityTexture.uOffset = 0.015 * Math.sin(time * 0.07);
            }
            
            // Scanned sheets read through the haze: thin air shows a faint veil, a full haze a solid plane.
            // The projector's output is steady; the music only nudges it (a real fan is not a strobe).
            const smokeNow = Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1);
            const haze = Math.min(1, Math.max(0.25, (this.fogIntensity == null ? 1 : this.fogIntensity) / 1.5)) *
                (0.2 + 0.8 * smokeNow);
            const plumeBoost = Number.isFinite(this._laserSheetSmokeBoost) ? this._laserSheetSmokeBoost : 1;
            const level = Math.min(1, 0.75 * plumeBoost * (0.35 + 0.65 * haze)) * master;
            sheetMat.alpha = Math.min(1, level);
            if (this.laserSheetHaze && this.laserSheetHaze.material) {
                const hazeMat = this.laserSheetHaze.material;
                hazeMat.alpha = Math.min(1, 0.58 * level);
                if (hazeMat.opacityTexture) {
                    hazeMat.opacityTexture.vOffset = time * 0.0025;
                    hazeMat.opacityTexture.uOffset = 0.022 * Math.sin(time * 0.043 + 1.1);
                }
            }
            
            const sheetColor = this._laserColor();

            if (!this._laserSheetEmissiveBuf) this._laserSheetEmissiveBuf = new BABYLON.Color3(0, 0, 0);
            sheetColor.scaleToRef(master, this._laserSheetEmissiveBuf);
            sheetMat.emissiveColor = this._laserSheetEmissiveBuf;
            if (this.laserSheetHaze && this.laserSheetHaze.material) {
                if (!this._laserSheetHazeEmissiveBuf) this._laserSheetHazeEmissiveBuf = new BABYLON.Color3(0, 0, 0);
                sheetColor.scaleToRef(master, this._laserSheetHazeEmissiveBuf);
                this.laserSheetHaze.material.emissiveColor = this._laserSheetHazeEmissiveBuf;
            }
            if (this.laserAperture && this.laserAperture.material) {
                if (!this._laserSheetApertureEmissiveBuf) this._laserSheetApertureEmissiveBuf = new BABYLON.Color3(0, 0, 0);
                this._laserApertureOutput(
                    this.laserSheetSource, sheetColor, master, this._laserSheetApertureEmissiveBuf);
                this.laserAperture.material.emissiveColor = this._laserSheetApertureEmissiveBuf;
            }
            const follower = this._laserSheetFollower;
            if (follower) {
                if (!this._laserSheetFollowerApertureEmissiveBuf) this._laserSheetFollowerApertureEmissiveBuf = new BABYLON.Color3(0, 0, 0);
                this._laserApertureOutput(
                    follower.mount.scanner || follower.mount.housing,
                    sheetColor, master, this._laserSheetFollowerApertureEmissiveBuf);
                follower.mount.aperture.material.emissiveColor = this._laserSheetFollowerApertureEmissiveBuf;
            }
            if (this.laserLight) {
                this.laserLight.diffuse = sheetColor;
                const pulse = 0.75 + (audioData.average || 0) * 0.25 + (this.kickPulse || 0) * 0.35;
                this.laserLight.intensity = 2.0 * pulse * master;
            }
            
            this.laserSheet.isVisible = true;
            if (this.laserSheetHaze) this.laserSheetHaze.isVisible = true;
            const fanB = this._laserSheetFanB;
            if (fanB) {
                fanB.sheet.isVisible = !!follower;
                fanB.haze.isVisible = !!follower;
            }
        } else if (this.laserSheet) {
            // Both projectors stay hung on the truss; only the beams and slits go dark.
            this.laserSheet.isVisible = false;
            if (this.laserSheetHaze) this.laserSheetHaze.isVisible = false;
            const fanB = this._laserSheetFanB;
            if (fanB) { fanB.sheet.isVisible = false; fanB.haze.isVisible = false; }
            if (this._laserApertureOff) {
                if (this.laserAperture && this.laserAperture.material) {
                    this.laserAperture.material.emissiveColor = this._laserApertureOff;
                }
                const follower = this._laserSheetFollower;
                if (follower) follower.mount.aperture.material.emissiveColor = this._laserApertureOff;
            }
            if (this.laserLight) this.laserLight.intensity = 0;
        }
    }

    /** Crowd avatars. */
    updateDancers(ctx) {
        const { time, audio: audioData } = ctx;
        if (typeof this._updateCrowdDance === 'function') this._updateCrowdDance(ctx.dt, audioData);
        if (this.npcAvatars && this.npcAvatars.length > 0) {
            this.updateDancingNPCs(time, audioData, ctx.dt);
        }
        if (typeof this._updateLocalPlayerBody === 'function') this._updateLocalPlayerBody(ctx.dt);
        if (typeof this._updateDJ === 'function') this._updateDJ(ctx.dt, audioData);
        if (typeof this._updateBouncer === 'function') this._updateBouncer(ctx.dt);
        if (typeof this._updateStreetPeopleActivity === 'function') this._updateStreetPeopleActivity();
        if (typeof this._updateMingler === 'function') this._updateMingler(ctx.dt);
    }

    /** Refresh preallocated mirror-fixture colour buffers after the source colour changes. */
    _refreshMirrorBallColorCache() {
        const source = this.mirrorBallSpotlightColor;
        const cache = this.mirrorBallCachedColors;
        if (!source || !cache || (this.mirrorBallCachedColorSource === source &&
            this._mirrorCachedR === source.r && this._mirrorCachedG === source.g && this._mirrorCachedB === source.b)) return;
        cache.housingGlow.set(0, 0, 0);
        source.scaleToRef(8, cache.lensBright);
        source.scaleToRef(16, cache.sourceVeryBright);
        cache.flareMedium.set(3 + source.r * 10, 3 + source.g * 10, 3 + source.b * 10);
        this.mirrorBallCachedColorSource = source;
        this._mirrorCachedR = source.r;
        this._mirrorCachedG = source.g;
        this._mirrorCachedB = source.b;
    }

    /** Mirror ball: rotation, fixture glow, outgoing rays and reflection spots. */
    updateMirrorBall(ctx) {
        const { time, dtScale } = ctx;

        // === MIRROR BALL EFFECT ===
        if (this.mirrorBallActive) {
            const showDriving = !!(this.showDirector && this.showDirector.isDriving());
            if (this.mirrorBall && !this.vjManualMode && !showDriving && time - (this._mirrorColorSwitchTime || 0) > 3) {
                this._mirrorColorSwitchTime = time;
                this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
                this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
            }
            // Mirror ball is now INDEPENDENT - doesn't disable other lights
            // All lights (spotlights, lasers, LED wall, strobes) can run simultaneously
            // VJ has full control to enable any combination
            
            // Enable all mirror ball spotlights and beams (stay dark on full blackout)
            const opticsLit = (this.masterIntensity ?? 1) > 0.001;
            if (this.mirrorBallSpotlights) {
                for (const light of this.mirrorBallSpotlights) {
                    if (light) light.setEnabled(opticsLit); // Only enable real lights (not nulls)
                }
            }
            if (this.mirrorBallBeams) {
                const smoke = typeof this._mirrorSmokeAmount === 'function' ? this._mirrorSmokeAmount() : 0;
                for (const beam of this.mirrorBallBeams) {
                    beam.mesh.setEnabled(opticsLit);
                    beam.material.alpha = 0.015 + smoke * 0.085;
                    beam.material.emissiveIntensity = 0.8 + smoke * 0.55;
                }
            }
            const color = this.mirrorBallSpotlightColor;
            // Palette fades can mutate the same Color3; identity alone leaves incident beams on the old hue.
            const colorChanged = this._mirrorAppliedColorSource !== color ||
                this._mirrorAppliedR !== color?.r || this._mirrorAppliedG !== color?.g || this._mirrorAppliedB !== color?.b;
            const master = Math.max(0, Math.min(1, this.masterIntensity ?? 1));
            const beamLevelChanged = this._mirrorAppliedBeamMaster !== master;
            if (colorChanged) {
                this._mirrorAppliedColorSource = color;
                this._mirrorAppliedR = color.r;
                this._mirrorAppliedG = color.g;
                this._mirrorAppliedB = color.b;
                if (this.mirrorBallSpotlights) {
                    for (const light of this.mirrorBallSpotlights) {
                        if (light) light.diffuse.copyFrom(this.mirrorBallSpotlightColor);
                    }
                }
            }
            if ((colorChanged || beamLevelChanged) && this.mirrorBallBeams) {
                for (const beam of this.mirrorBallBeams) {
                    color.scaleToRef(master, beam.material.emissiveColor);
                }
            }
            this._mirrorAppliedBeamMaster = master;
            if (this.mirrorBallHousings) {
                this._refreshMirrorBallColorCache();
                for (const housing of this.mirrorBallHousings) {
                    housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                    if (opticsLit) {
                        this.mirrorBallCachedColors.lensBright.scaleToRef(master, housing.lensMaterial.emissiveColor);
                        this.mirrorBallCachedColors.sourceVeryBright.scaleToRef(master, housing.sourceMaterial.emissiveColor);
                        this.mirrorBallCachedColors.flareMedium.scaleToRef(master, housing.flareMaterial.emissiveColor);
                    } else {
                        housing.lensMaterial.emissiveColor.set(0, 0, 0);
                        housing.sourceMaterial.emissiveColor.set(0, 0, 0);
                        housing.flareMaterial.emissiveColor.set(0, 0, 0);
                    }
                    if (housing.flare) housing.flare.isVisible = opticsLit;
                }
            }
            
            if (this.mirrorBall) {
                const speed = Number.isFinite(this.mirrorBallSpeed)
                    ? Math.max(0, Math.min(10, this.mirrorBallSpeed))
                    : 1;
                const targetAngularSpeed = 0.18 * speed;
                const motorDt = ctx.dt || dtScale / 60 || 1 / 60;
                const motorEase = 1 - Math.exp(-motorDt / 1.5);
                this._mirrorMotorAngularSpeed = (this._mirrorMotorAngularSpeed || 0) +
                    (targetAngularSpeed - (this._mirrorMotorAngularSpeed || 0)) * motorEase;
                this.mirrorBallRotation -= this._mirrorMotorAngularSpeed * motorDt;
                this.mirrorBall.rotation.y = this.mirrorBallRotation;
                const ballMat = this.mirrorBall.material;
                if (ballMat && ballMat.emissiveColor && color) {
                    const m = master * 0.28;
                    ballMat.emissiveColor.set(
                        0.08 * master + color.r * m,
                        0.08 * master + color.g * m,
                        0.10 * master + color.b * m
                    );
                }
            }
            
            if (this.mirrorReflectionBatch) {
                this.mirrorReflectionBatch.spots.setEnabled(true);
                this.mirrorReflectionBatch.rays.setEnabled(opticsLit && this.mirrorBallRaysActive !== false);
                const hz = this.isInVRMode ? (this.tierSettings?.vrMirrorUpdateHz || 0) : 0;
                const black = (this.masterIntensity ?? 1) <= 0.001;
                const blackChanged = this._mirrorCadenceBlack !== black;
                this._mirrorCadenceBlack = black;
                this._mirrorReflectionClock = (this._mirrorReflectionClock || 0) + (ctx.dt || ctx.dtScale / 60 || 1 / 60);
                if (blackChanged || !this._mirrorReflectionReady || hz <= 0 || this._mirrorReflectionClock >= 1 / hz) {
                    if (hz > 0) this._mirrorReflectionClock %= 1 / hz;
                    else this._mirrorReflectionClock = 0;
                    this._updateMirrorReflectionBatch();
                    this._mirrorReflectionReady = true;
                } else if (colorChanged) {
                    this._updateMirrorReflectionColors();
                }
            }
            this._mirrorWasActive = true;
        } else if (this._mirrorWasActive !== false) {
            this._mirrorWasActive = false;
            // Mirror ball inactive - disable all mirror ball elements once
            if (this.mirrorBall && this.mirrorBall.material && this.mirrorBall.material.emissiveColor) {
                this.mirrorBall.material.emissiveColor.set(0.12, 0.12, 0.14);
            }
            if (this.mirrorBallSpotlights) {
                for (const light of this.mirrorBallSpotlights) {
                    if (light) light.setEnabled(false); // Check for null (fake lights)
                }
            }
            if (this.mirrorBallBeams) {
                for (const beam of this.mirrorBallBeams) beam.mesh.setEnabled(false);
            }
            if (this.mirrorReflectionBatch) {
                this.mirrorReflectionBatch.spots.setEnabled(false);
                this.mirrorReflectionBatch.rays.setEnabled(false);
            }
            this._mirrorReflectionReady = false;
            this._mirrorReflectionClock = 0;
            this._mirrorCadenceBlack = false;
            if (this.mirrorBallHousings) {
                // PERFORMANCE: Use cached black color instead of creating new Color3 objects
                this.mirrorBallHousings.forEach(housing => {
                    housing.material.emissiveColor.set(0, 0, 0);
                    housing.lensMaterial.emissiveColor.set(0, 0, 0);
                    if (housing.sourceMaterial) housing.sourceMaterial.emissiveColor.set(0, 0, 0);
                    if (housing.flareMaterial) housing.flareMaterial.emissiveColor.set(0, 0, 0);
                    if (housing.flare) housing.flare.isVisible = false;
                });
            }
        }
    }

}
window.VRClubAnimationCore = VRClubAnimationCore;
