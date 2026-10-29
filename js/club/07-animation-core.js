'use strict';
class VRClubAnimationCore extends VRClubEffects {
    static NETWORK_HAND_KEYS = Object.freeze(['x', 'y', 'z', 'fx', 'fy', 'fz', 'ux', 'uy', 'uz']);
    updateAnimations() {
        const ctx = this._beginFrame();

        this.updateFogMachines(ctx);
        this.updateLaserSheet(ctx);
        this.updateDancers(ctx);
        this.updateMirrorBall(ctx);
        this.updateVJPhasing(ctx);
        this.updateLEDWallPass(ctx);
        this.updateDanceFloorLEDs(ctx);
        this.updateLasers(ctx);
        this.updateSpotColorCycle(ctx);
        this.updateSpotlights(ctx);
        this.updateRoomBounce(ctx);
        this.updateStrobes(ctx);
        this.updateSpeakerCones(ctx);
        this.updateCameraPresence(ctx);
        this.updateEyeAdaptation(ctx);
        this.updateNetworkPresence(ctx);
        if (typeof this.updateVJDesk === 'function') this.updateVJDesk(ctx);
        if (typeof this.updateRestroomMirror === 'function') this.updateRestroomMirror(ctx);
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

        const interval = this.isInVRMode ? 0.05 : 0.1;
        if (ctx.time - (this._lastNetworkSendTime || 0) < interval) return;
        this._lastNetworkSendTime = ctx.time;

        const cam = (this.isInVRMode && this.vrHelper?.baseExperience?.camera) || this.camera;
        if (!cam) return;
        const rotY = cam.rotationQuaternion ? cam.rotationQuaternion.toEulerAngles().y : (cam.rotation ? cam.rotation.y : 0);
        const position = cam.globalPosition || cam.position;
        const state = this._networkPose || (this._networkPose = {
            x: 0, y: 0, z: 0, rotY: 0, hands: null, seated: false, floorY: 0, eh: 1.7
        });
        const seat = this._activeSeat;
        state.eh = Math.round(this._bodyEyeHeight() * 100) / 100;
        state.x = seat ? seat.x : position.x;
        state.y = position.y;
        state.z = seat ? seat.z : position.z;
        state.rotY = seat ? seat.facing : rotY;
        state.seated = !!seat;
        state.floorY = seat ? seat.floorY : (this._walkLevel || 0);
        state.seatH = seat ? Math.round((seat.seatY - seat.floorY) * 100) / 100 : 0;
        state.hands = null;
        if (this.isInVRMode) {
            const hands = this._networkHands || (this._networkHands = { left: null, right: null });
            for (let i = 0; i < 2; i++) {
                const side = i === 0 ? 'left' : 'right';
                const tracked = this._handPose(side, position);
                if (!tracked) { hands[side] = null; continue; }
                const key = side === 'left' ? '_networkHandL' : '_networkHandR';
                const hand = this[key] || (this[key] = {});
                hand.x = tracked.x - position.x; hand.y = tracked.y - position.y; hand.z = tracked.z - position.z;
                hand.fx = tracked.fx; hand.fy = tracked.fy; hand.fz = tracked.fz;
                hand.ux = tracked.ux; hand.uy = tracked.uy; hand.uz = tracked.uz;
                hands[side] = hand;
            }
            state.hands = hands;
        }
        if (net.capacity > 8) {
            const previous = this._lastNetworkPose;
            let changed = !previous || Math.hypot(state.x - previous.x, state.y - previous.y, state.z - previous.z) > 0.01 ||
                Math.abs(state.rotY - previous.rotY) > 0.01 || state.seated !== previous.seated ||
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
        net.sendState(state);
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
        if (this.strobesActive && !this.photosensitiveSafeMode) brightness += 0.12 * master;
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
        let reflectedEnergy = 0;
        if (this.lightsActive) reflectedEnergy += 0.120;
        if (this.ledWallActive) reflectedEnergy += 0.060;
        if (this.lasersActive) reflectedEnergy += 0.070;
        if (this.laserSheetActive) reflectedEnergy += 0.090;
        if (this.mirrorBallActive) reflectedEnergy += 0.080;
        reflectedEnergy *= master * (this.isInVRMode ? 0.6 : 1);

        // The headset gets less bounce, not more: flat fill is what kills contrast at life size.
        const maxBounce = this.isInVRMode ? 0.15 : 0.28;
        const targetIntensity = Math.min(maxBounce, settings.ambientIntensity + reflectedEnergy);
        const retention = 1 - Math.pow(1 - 0.045, ctx.dtScale);
        ambient.intensity += (targetIntensity - ambient.intensity) * retention;

        const hue = this.currentSpotColor || this.cachedColors.white;
        const targetR = 0.62 + hue.r * 0.30;
        const targetG = 0.62 + hue.g * 0.30;
        const targetB = 0.66 + hue.b * 0.30;
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
        
        // === GOBO ROTATION UPDATE ===
        // Continuous 360° rotation for gobo patterns
        if (this.goboEnabled) {
            this.goboRotation += 0.02 * dtScale * (this.goboRotationSpeed || 1.0);
            if (this.goboRotation > Math.PI * 2) {
                this.goboRotation -= Math.PI * 2;
            } else if (this.goboRotation < -Math.PI * 2) {
                this.goboRotation += Math.PI * 2;
            }
        }
        
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
        this._tintClubAir(dt);
        const tierScale = this.isInVRMode ? (this.tierSettings?.vrFogOutputScale || 1) : 1;
        const outputScale = tierScale * VRClubAnimationCore.prototype._effectLoadScale.call(this);
        const burstRate = 150 * outputScale;
        const continuousRate = 80 * outputScale;

        // === FOG MACHINE SYSTEM CONTROL ===
        if (this.fogMachines && this.fogMachines.length > 0) {
            const currentTime = time;
            
            if (this.smokeActive) {
                // Ensure haze is running for beam visibility
                if (this.haze && !this.haze.isStarted()) this.haze.start();
                
                // Update each fog machine
                this.fogMachines.forEach((machine, i) => {
                    const emitter = machine.emitter;
                    const ledMat = machine.ledMat;
                    
                    // === FOG BURST LOGIC ===
                    if (this.fogBurstMode === 'auto') {
                        // Automatic bursts synced to music/phase
                        const timeSinceLastBurst = currentTime - this.lastFogBurst;
                        const burstInterval = this.fogBurstInterval / this.fogIntensity;
                        
                        if (!machine.isBursting && timeSinceLastBurst > burstInterval) {
                            // Start a burst
                            machine.isBursting = true;
                            machine.burstTimer = 2.5; // 2.5 second burst
                            emitter.emitRate = burstRate * this.fogIntensity;
                            
                            // Update LED to red (active) — cached, no allocation
                            ledMat.emissiveColor = this.cachedColors.fogActive;
                            
                            if (i === 0) this.lastFogBurst = currentTime;
                        }
                        
                        if (machine.isBursting) {
                            machine.burstTimer -= dt; // frame-rate independent
                            
                            // Fade out burst over last 0.5 seconds
                            if (machine.burstTimer < 0.5) {
                                emitter.emitRate = burstRate * this.fogIntensity * (machine.burstTimer / 0.5);
                            } else {
                                // A cue may add or remove several transparent effects during this burst.
                                emitter.emitRate = burstRate * this.fogIntensity;
                            }
                            
                            if (machine.burstTimer <= 0) {
                                machine.isBursting = false;
                                emitter.emitRate = continuousRate * 0.55 * this.fogIntensity;
                                ledMat.emissiveColor = this.cachedColors.fogReady; // Green (ready)
                            }
                        } else {
                            // Keep a steady plume streaming from the nozzles between peak bursts while SMOKE is on
                            emitter.emitRate = continuousRate * 0.55 * this.fogIntensity;
                        }
                        
                    } else if (this.fogBurstMode === 'continuous') {
                        // Continuous low output
                        emitter.emitRate = continuousRate * this.fogIntensity;
                        ledMat.emissiveColor = this.cachedColors.fogContinuous; // Orange (continuous)
                        machine.isBursting = false;
                        
                    } else if (this.fogBurstMode === 'burst') {
                        // Manual burst mode - awaiting trigger
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
    _tintClubAir(dt) {
        const scene = this.scene;
        if (!scene) return;
        scene.fogEnabled = true;
        const step60 = dt > 0 ? dt : 1 / 60;
        const goal = this.smokeActive === false ? 0 : 1;
        if (!Number.isFinite(this._smokeLevel)) this._smokeLevel = goal;
        this._smokeLevel += (goal - this._smokeLevel) * (1 - Math.exp(-step60 / 1.6));
        if (Math.abs(goal - this._smokeLevel) < 0.002) this._smokeLevel = goal;
        const smoke = this._smokeLevel;
        const settings = this.isInVRMode ? this.vrSettings?.vr : this.vrSettings?.desktop;
        const designed = settings && settings.fogDensity;
        // Outdoors the air is thin: the club's haze is a room effect, and the street needs to see down the block.
        const outdoors = this._exterior || 0;
        if (typeof designed === 'number') {
            const target = designed * (0.1 + 0.9 * smoke) * (1 - 0.62 * outdoors);
            const current = scene.fogDensity;
            if (!(current > 0)) {
                scene.fogDensity = target;
            } else if (current !== target) {
                // Ease: a cue's smoke toggle must not snap the whole room's air.
                const step = 1 - Math.exp(-(dt > 0 ? dt : 1 / 60) * 0.9);
                scene.fogDensity = Math.abs(target - current) < 1e-5 ? target : current + (target - current) * step;
            }
        }
        const fog = scene.fogColor;
        const spot = this.currentSpotColor;
        const mix = (this.lightsActive && spot) ? 0.07 * (this.masterIntensity == null ? 1 : this.masterIntensity) : 0;
        if (fog) {
            // The club tints its air with the show; the street's is a cool night blue.
            const indoors = 1 - outdoors;
            fog.r = (0.015 + (spot ? spot.r * mix : 0)) * indoors + 0.024 * outdoors;
            fog.g = (0.012 + (spot ? spot.g * mix : 0)) * indoors + 0.032 * outdoors;
            fog.b = (0.018 + (spot ? spot.b * mix : 0)) * indoors + 0.07 * outdoors;
        }
        const haze = this.haze;
        if (!haze || !haze.color1) return;
        const dim = this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity));
        const anyLit = !!(this.lightsActive || this.lasersActive || this.laserSheetActive || this.mirrorBallActive || this.ledWallActive);
        const lightScale = anyLit ? dim : 0.08;
        const activeColor = (this.lightsActive && spot) ? spot
            : (this.mirrorBallActive && this.mirrorBallSpotlightColor) ? this.mirrorBallSpotlightColor
            : ((this.lasersActive || this.laserSheetActive) && typeof this._laserColor === 'function') ? this._laserColor()
            : (this.ledWallActive && this.ledShowColor) ? this.ledShowColor : spot;
        if (activeColor && anyLit) {
            haze.color1.r = (0.42 + activeColor.r * 0.22) * lightScale;
            haze.color1.g = (0.40 + activeColor.g * 0.22) * lightScale;
            haze.color1.b = (0.46 + activeColor.b * 0.22) * lightScale;
            if (haze.color2) {
                haze.color2.r = (0.48 + activeColor.r * 0.18) * lightScale;
                haze.color2.g = (0.46 + activeColor.g * 0.18) * lightScale;
                haze.color2.b = (0.52 + activeColor.b * 0.18) * lightScale;
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

    /** Snapshot of the lit cones for this frame, shared by the haze and dust passes. */
    _gatherAirBeams() {
        const frame = this.scene.getFrameId();
        if (this._airBeamFrame === frame) return this._airBeams;
        this._airBeamFrame = frame;
        const beams = this._airBeams || (this._airBeams = []);
        let n = 0;
        const spots = this.spotlights;
        const dim = this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity));
        const kickBoost = 1 + (this.kickPulse || 0) * 0.35;
        if (this.lightsActive && spots) {
            for (let i = 0; i < spots.length; i++) {
                const spot = spots[i];
                const hit = spot._surfaceHit;
                const gain = ((spot._photoIntensity ?? 40) / 40) * dim * kickBoost;
                if (gain <= 0.02) continue;
                const pos = spot._photoPos || spot.basePos || spot.position;
                if (!pos) continue;
                const dir = spot._photoDir || spot.direction || { x: 0, y: -1, z: 0 };
                const b = beams[n] || (beams[n] = {});
                b.spot = spot;
                b.color = spot._renderColor || this.currentSpotColor;
                b.ox = pos.x; b.oy = pos.y; b.oz = pos.z;
                b.dx = dir.x; b.dy = dir.y; b.dz = dir.z;
                b.tan = Math.tan((spot._photoAngle || 0.52) * 0.5);
                b.len = hit ? hit.centerDistanceToSurface : 14;
                b.gain = Math.min(1.8, gain);
                b.acc = 0;
                n++;
            }
        }
        // Mirror-ball incident beams (from (±4, 7.5, -8/-16) to (0, 6.5, -12)) also illuminate smoke plumes crossing them
        if (this.mirrorBallActive && this.mirrorBallSpotlightColor && dim > 0.02) {
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
                b.tan = 0.22;
                b.len = len + 1.5;
                b.gain = 0.95 * dim;
                b.acc = 0;
                n++;
            }
        }
        // Rotating ceiling laser beams (3 projectors × 5 beams) cut moving coloured streaks through the smoke
        if (this.lasersActive && this.lasers && dim > 0.02 && typeof this._aimLaserBeam === 'function') {
            const lCol = typeof this._laserColor === 'function' ? this._laserColor() : this.currentSpotColor;
            const scratch = this._airLaserDir || (this._airLaserDir = { x: 0, y: -1, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
            for (let li = 0; li < this.lasers.length; li++) {
                const laser = this.lasers[li];
                const o = laser && laser.originPos;
                if (!o || !laser.beams) continue;
                for (let bi = 0; bi < laser.beams.length; bi++) {
                    const beam = laser.beams[bi];
                    this._aimLaserBeam(laser, beam, li, scratch);
                    const b = beams[n] || (beams[n] = {});
                    b.spot = null;
                    b.color = lCol;
                    b.ox = o.x; b.oy = o.y; b.oz = o.z;
                    b.dx = scratch.x; b.dy = scratch.y; b.dz = scratch.z;
                    b.tan = 0.055;
                    b.len = beam.length || 14;
                    b.gain = 1.15 * dim;
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
        const frame = this.scene ? this.scene.getFrameId() : 0;
        if (this._airLedFrame === frame) return this._airLedActive;
        this._airLedFrame = frame;
        const dim = (this.masterIntensity == null ? 1 : Math.max(0, Math.min(1, this.masterIntensity))) *
            (this.ledWallLevel == null ? 1 : Math.max(0, Math.min(1, this.ledWallLevel)));
        if (!this.ledWallActive || dim <= 0.01) {
            this._airLedActive = false;
            return false;
        }
        const grid = this._airLedGrid || (this._airLedGrid = new Float32Array(7 * 3 * 3));
        const panels = this.ledPanels;
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        if (panels && panels.length >= cols * rows) {
            let any = false;
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
                                sr += ec.r; sg += ec.g; sb += ec.b;
                                cnt++;
                            }
                        }
                    }
                    const inv = cnt > 0 ? dim / cnt : 0;
                    const idx = (gy * 7 + gx) * 3;
                    grid[idx] = sr * inv;
                    grid[idx + 1] = sg * inv;
                    grid[idx + 2] = sb * inv;
                    if (grid[idx] + grid[idx + 1] + grid[idx + 2] > 0.005) any = true;
                }
            }
            this._airLedActive = any;
            return any;
        }
        const fallback = this.ledShowColor || this.currentSpotColor;
        if (!fallback) {
            this._airLedActive = false;
            return false;
        }
        for (let i = 0; i < 21; i++) {
            const idx = i * 3;
            grid[idx] = fallback.r * dim;
            grid[idx + 1] = fallback.g * dim;
            grid[idx + 2] = fallback.b * dim;
        }
        this._airLedActive = true;
        return true;
    }

    /** Sample the 7×3 spatial LED-wall grid at a 3D particle position `pos` (writes `out.r/g/b/lit`). */
    _sampleAirLedWall(pos, out) {
        const grid = this._airLedGrid;
        const dz = Math.max(0.6, pos.z - (-20));
        if (dz > 18) { out.r = out.g = out.b = out.lit = 0; return; }
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
        const atten = 0.58 / (1 + dz * 0.10 + dz * dz * 0.006);
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
            const addSource = (housing) => {
                if (!housing || !housing.position || !housing.rotation) return;
                const pitch = housing.rotation.x || 0;
                const yaw = housing.rotation.y || 0;
                const cp = Math.cos(pitch), sp = Math.sin(pitch);
                const cy = Math.cos(yaw), sy = Math.sin(yaw);
                const s = sheets[n] || (sheets[n] = {});
                s.ox = housing.position.x; s.oy = housing.position.y; s.oz = housing.position.z;
                // Forward axis (local +Z) and plane normal (local +Y) under Euler YXZ(yaw, pitch, 0)
                s.fx = sy * cp; s.fy = -sp; s.fz = cy * cp;
                s.nx = sy * sp; s.ny = cp; s.nz = cy * sp;
                n++;
            };
            addSource(this.laserSheetSource);
            if (this._laserSheetFollower && this._laserSheetFollower.mount) {
                addSource(this._laserSheetFollower.mount.housing);
            }
        }
        this._airSheetCount = n;
        return sheets;
    }

    _lightAirParticles(particles, mode) {
        if (!this.scene || !particles) return;
        const isPlume = mode === 'plume';
        if (this.isInVRMode && !isPlume) {
            // Desktop only for the 2,200-particle room haze/dust: ~0.3 ms per pass on a desktop CPU.
            // The 2 fog-machine nozzle plumes (~150 particles) run in both desktop and VR so they never self-glow.
            if (this.spotlights && this._airBeamCount) {
                for (const spot of this.spotlights) spot._mediumDensity = null;
                this._airBeamCount = 0;
            }
            return;
        }
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

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const pos = p.position;
            let lit = 0;
            let sheetLit = 0;
            let beamR = 0, beamG = 0, beamB = 0;
            for (let k = 0; k < nBeams; k++) {
                const b = beams[k];
                const vx = pos.x - b.ox, vy = pos.y - b.oy, vz = pos.z - b.oz;
                const t = vx * b.dx + vy * b.dy + vz * b.dz;
                if (t < 0.25 || t > b.len) continue;
                const rad = t * b.tan + p.size * 0.35;
                const q = (vx * vx + vy * vy + vz * vz - t * t) / (rad * rad);
                if (q >= maxQ) continue;
                let w;
                if (q < 1) {
                    const edge = 1 - q;
                    w = edge * edge * (3 - 2 * edge) * b.gain;
                    if (!isDust && b.spot) b.acc += w;
                } else {
                    // Anisotropic Mie aureole around the moving beam so sweeping beams visibly travel across adjacent puffs
                    const halo = (maxQ - q) / (maxQ - 1);
                    w = 0.34 * halo * halo * b.gain / (1 + t * 0.05);
                }
                let phase = 0.5;
                if (cp) {
                    const cx = cp.x - pos.x, cy = cp.y - pos.y, cz = cp.z - pos.z;
                    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
                    const cosT = (cx * b.dx + cy * b.dy + cz * b.dz) / cl;
                    // Henyey-Greenstein g = 0.5, normalised to 1 at cosT = 1
                    phase = Math.min(1, 0.35 / Math.pow(1.25 - cosT, 1.5));
                }
                const contrib = w * (0.35 + 0.65 * phase);
                lit += contrib;
                const bc = b.color || tint;
                if (bc) {
                    beamR += bc.r * contrib;
                    beamG += bc.g * contrib;
                    beamB += bc.b * contrib;
                }
            }
            for (let s = 0; s < nSheets; s++) {
                const sh = sheets[s];
                const vx = pos.x - sh.ox, vy = pos.y - sh.oy, vz = pos.z - sh.oz;
                const along = vx * sh.fx + vy * sh.fy + vz * sh.fz;
                if (along < 0.4 || along > 22) continue;
                const dist = Math.abs(vx * sh.nx + vy * sh.ny + vz * sh.nz);
                const halfThick = (isPlume ? 0.45 : 0.22) + (p.size || 1) * 0.25;
                if (dist >= halfThick) continue;
                const slice = 1 - dist / halfThick;
                sheetLit += slice * slice * (3 - 2 * slice) * dim;
            }
            let localR = 0, localG = 0, localB = 0, localLit = 0;
            if (ledActive && !isDust) {
                this._sampleAirLedWall(pos, ledSample);
                localR += ledSample.r;
                localG += ledSample.g;
                localB += ledSample.b;
                localLit += ledSample.lit;
            }
            if (!isDust && dim > 0.01) {
                // Revolving facet waves from the spinning mirror ball at (0, 6.5, -12)
                if (this.mirrorBallActive && this.mirrorBallSpotlightColor) {
                    const mc = this.mirrorBallSpotlightColor;
                    const mx = pos.x, my = pos.y - 6.5, mz = pos.z + 12;
                    const mDistSq = mx * mx + my * my + mz * mz;
                    const angle = Math.atan2(mx, mz);
                    const spin = this.mirrorBallRotation || 0;
                    const sparkle = 0.25 + 0.75 * Math.max(0, Math.sin(angle * 6 - spin * 8) * Math.cos(my * 1.4 + spin * 5));
                    const mw = (0.55 * dim * sparkle) / (1 + mDistSq * 0.04);
                    localR += mc.r * mw; localG += mc.g * mw; localB += mc.b * mw; localLit += mw;
                }
                // 3D per-corner strobe flashes so chase/circle patterns leap from corner to corner through the smoke
                if (this.strobesActive && !this.photosensitiveSafeMode && this.strobes) {
                    for (let si = 0; si < this.strobes.length; si++) {
                        const st = this.strobes[si];
                        if (!st || !(st.flashDuration > 0)) continue;
                        const sp = st.mesh && st.mesh.position;
                        const sx = sp ? pos.x - sp.x : 0;
                        const sy = sp ? pos.y - (sp.y || 7.8) : 0;
                        const sz = sp ? pos.z - (sp.z || -8) : 0;
                        const sw = (1.65 * dim) / (1 + (sx * sx + sy * sy + sz * sz) * 0.035);
                        localR += sw; localG += sw; localB += sw; localLit += sw;
                    }
                }
            }
            const c = p.color;
            if (isPlume) {
                const totalLit = localLit + lit + sheetLit * 1.35;
                if (totalLit <= 0.001) {
                    // No light reaching this particle's 3D position: smoke stays dark unlit fog
                    c.r = 0.02;
                    c.g = 0.022;
                    c.b = 0.03;
                    c.a *= 0.08;
                } else {
                    const sCol = laserColor || tint;
                    const rSum = localR + beamR + (sCol ? sCol.r * sheetLit * 1.35 : 0);
                    const gSum = localG + beamG + (sCol ? sCol.g * sheetLit * 1.35 : 0);
                    const bSum = localB + beamB + (sCol ? sCol.b * sheetLit * 1.35 : 0);
                    const inv = 1 / totalLit;
                    const gain = Math.min(1.3, 0.32 + totalLit * 0.95);
                    c.r = Math.min(1.2, rSum * inv * gain);
                    c.g = Math.min(1.2, gSum * inv * gain);
                    c.b = Math.min(1.2, bSum * inv * gain);
                    c.a = Math.min(0.44, c.a * (0.18 + Math.min(1.6, totalLit) * 2.7));
                }
                continue;
            }
            const totalLit = lit + sheetLit * 1.35 + localLit;
            if (isDust) {
                // Dust is only seen where light catches it.
                c.a = Math.min(0.9, c.a * (0.2 + Math.min(1.5, totalLit) * 1.7));
            } else if (totalLit > 0) {
                c.a *= 1 + Math.min(1.2, totalLit) * 2.2;
            }
            if ((lit + localLit) > 0 && (tint || localLit > 0)) {
                const weight = lit + localLit;
                const m = Math.min(0.78, weight * 0.65);
                const inv = 1 / weight;
                const tr = (beamR + localR) * inv;
                const tg = (beamG + localG) * inv;
                const tb = (beamB + localB) * inv;
                c.r += (tr * 1.1 - c.r) * m;
                c.g += (tg * 1.1 - c.g) * m;
                c.b += (tb * 1.1 - c.b) * m;
            }
            if (sheetLit > 0 && laserColor) {
                const sm = Math.min(0.88, sheetLit * 0.85);
                c.r += (laserColor.r * 1.25 - c.r) * sm;
                c.g += (laserColor.g * 1.25 - c.g) * sm;
                c.b += (laserColor.b * 1.25 - c.b) * sm;
            }
        }

        if (!isDust && !this.isInVRMode) {
            // The beam mesh reads how much medium actually sits in its cone, and how much smoke there is to scatter it.
            const ref = Math.max(6, particles.length * 0.02);
            const smoke = 0.15 + 0.85 * (Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1));
            for (let k = 0; k < nBeams; k++) {
                const spot = beams[k].spot;
                if (!spot) continue;
                const target = Math.min(1, beams[k].acc / ref) * smoke;
                const cur = spot._mediumDensity == null ? target : spot._mediumDensity;
                spot._mediumDensity = cur + (target - cur) * 0.06;
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
        const speed = Math.min(1.4, Math.max(0.2, this.laserSpeed || 1.0));
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
            follower.mount.housing.rotation.x = this._laserSheetBasePitch + trailPitch * this._laserSheetPitchRange;
            follower.mount.housing.rotation.y = -(this._laserSheetBaseYaw + yawPhase * this._laserSheetYawRange);
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
        const h = this.engine && typeof this.engine.getRenderHeight === 'function' ? this.engine.getRenderHeight() : 1080;
        view.pixelAngle = ((cam && cam.fov) || 0.8) / Math.min(2400, Math.max(600, h || 1080));
        return view;
    }

    /** Scanning laser sheet: tilt sweep, smoke UV flow, audio-pulsed intensity. */
    updateLaserSheet(ctx) {
        const { time, audio: audioData } = ctx;
        const speedMultiplierLaser = this.laserSpeed || 1.0;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));

        // ANIMATE LASER SHEET (Hyperrealism)
        if (this.laserSheet && this.laserSheetActive) {
            // The material is optional on this mesh; hoist it once instead of guarding
            // in one place and dereferencing unguarded three lines later.
            const sheetMat = this.laserSheet.material;
            if (!sheetMat) return;

            // Compound, slightly asymmetric motion avoids the mechanical pendulum
            // look of a single sine while keeping the fan inside its calibrated aim.
            this._poseLaserSheet(time);
            // Animate smoke texture flowing OUTWARD from source (matching VRCLUB-UNITY's _NoiseScroll)
            if (sheetMat.opacityTexture) {
                sheetMat.opacityTexture.vOffset = -time * 0.06 * speedMultiplierLaser;
                sheetMat.opacityTexture.uOffset = 0.01 * time * speedMultiplierLaser +
                    0.045 * Math.sin(time * 0.19) + 0.015 * Math.sin(time * 0.47);
            }
            
            // Scanned sheets read through the haze: thin air shows a faint veil, a full haze a solid plane.
            // The projector's output is steady; the music only nudges it (a real fan is not a strobe).
            const smokeNow = Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1);
            const haze = Math.min(1, Math.max(0.25, (this.fogIntensity == null ? 1 : this.fogIntensity) / 1.5)) *
                (0.2 + 0.8 * smokeNow);
            const pulse = 0.75 + (audioData.average || 0) * 0.25 + (this.kickPulse || 0) * 0.35;
            const level = Math.min(1, 0.75 * pulse * (0.35 + 0.65 * haze)) * master;
            sheetMat.alpha = level;
            if (this.laserSheetHaze && this.laserSheetHaze.material) {
                const hazeMat = this.laserSheetHaze.material;
                hazeMat.alpha = 0.58 * level;
                if (hazeMat.opacityTexture) {
                    hazeMat.opacityTexture.vOffset = -time * 0.025 * speedMultiplierLaser;
                    hazeMat.opacityTexture.uOffset = -0.008 * time * speedMultiplierLaser -
                        0.055 * Math.sin(time * 0.13) + 0.018 * Math.sin(time * 0.31 + 0.8);
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
                sheetColor.scaleToRef(master, this._laserSheetApertureEmissiveBuf);
                this.laserAperture.material.emissiveColor = this._laserSheetApertureEmissiveBuf;
            }
            const follower = this._laserSheetFollower;
            if (follower) {
                if (!this._laserSheetFollowerApertureEmissiveBuf) this._laserSheetFollowerApertureEmissiveBuf = new BABYLON.Color3(0, 0, 0);
                sheetColor.scaleToRef(master, this._laserSheetFollowerApertureEmissiveBuf);
                follower.mount.aperture.material.emissiveColor = this._laserSheetFollowerApertureEmissiveBuf;
            }
            if (this.laserLight) {
                this.laserLight.diffuse = sheetColor;
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
            
            // Enable all mirror ball spotlights and beams
            if (this.mirrorBallSpotlights) {
                this.mirrorBallSpotlights.forEach(light => {
                    if (light) light.setEnabled(true); // Only enable real lights (not nulls)
                });
            }
            if (this.mirrorBallBeams) {
                this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(true));
            }
            const color = this.mirrorBallSpotlightColor;
            // Palette fades can mutate the same Color3; identity alone leaves incident beams on the old hue.
            const colorChanged = this._mirrorAppliedColorSource !== color ||
                this._mirrorAppliedR !== color?.r || this._mirrorAppliedG !== color?.g || this._mirrorAppliedB !== color?.b;
            if (colorChanged) {
                this._mirrorAppliedColorSource = color;
                this._mirrorAppliedR = color.r;
                this._mirrorAppliedG = color.g;
                this._mirrorAppliedB = color.b;
                if (this.mirrorBallSpotlights) {
                    this.mirrorBallSpotlights.forEach(light => {
                        if (light) light.diffuse.copyFrom(this.mirrorBallSpotlightColor);
                    });
                }
                if (this.mirrorBallBeams) {
                    this.mirrorBallBeams.forEach(beam => {
                        beam.material.emissiveColor.copyFrom(this.mirrorBallSpotlightColor);
                    });
                }
            }
            if (this.mirrorBallHousings) {
                this._refreshMirrorBallColorCache();
                
                this.mirrorBallHousings.forEach(housing => {
                    // Make all fixture components glow with current color (professional moving head)
                    housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                    housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
                    housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
                    housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
                });
            };
            
            // Rotate mirror ball faster so you can see it spinning (classic disco ball rotation)
            // Apply speed multiplier for VJ control
            if (this.mirrorBall) {
                const speedMultiplier = this.mirrorBallSpeed || 1.0;
                this.mirrorBallRotation -= 0.003 * speedMultiplier * dtScale * (1 + (this.kickPulse || 0) * 1.2); // the ball lurches on the kick
                this.mirrorBall.rotation.y = this.mirrorBallRotation;
            }
            
            if (this.mirrorReflectionBatch) {
                this.mirrorReflectionBatch.spots.setEnabled(true);
                this.mirrorReflectionBatch.rays.setEnabled(this.mirrorBallRaysActive !== false);
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
        } else {
            // Mirror ball inactive - disable all mirror ball elements
            if (this.mirrorBallSpotlights) {
                this.mirrorBallSpotlights.forEach(light => {
                    if (light) light.setEnabled(false); // Check for null (fake lights)
                });
            }
            if (this.mirrorBallBeams) {
                this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(false));
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
                    housing.material.emissiveColor = this.cachedColors.black;
                    housing.lensMaterial.emissiveColor = this.cachedColors.black;
                });
            }
        }
    }

    /**
     * Legacy wall-clock 12-phase cycler plus the per-frame micro-dynamics.
     * Gated off entirely whenever the Show Director is driving - see the
     * "three places hand control over" table in the agent instructions.
     */
    updateVJPhasing(ctx) {
        const { time, dtScale } = ctx;

        // PROFESSIONAL VJ AUTOMATIC PATTERN SYSTEM
        // Designed by a world-class VJ with experience at Berghain, Fabric, Amnesia, and Output
        // Philosophy: Build tension → Release → Create moments → Repeat
        // Each phase tells a story with the lights
        //
        // QC O1: VJ Director macros (DROP / BLACKOUT / LOCK / forceScene) write the
        // SAME state vars this legacy cycler writes (lightingPhase, vjDropActive,
        // spotlightPattern, vjBuildIntensity). When a user fires a macro the
        // director sets `manualSceneUntil` to a future timestamp; while that
        // hold is active we MUST NOT let the legacy cycler trample those
        // decisions, or the macro flickers back to whatever phase the timer
        // happened to be in. Single source of truth during a manual hold.
        const directorHoldingMacro = !!(this.vjDirector &&
            this.vjDirector.manualSceneUntil > performance.now());
        // The Show Director owns the rig when it is driving. Its cues land on
        // musical bars; this legacy cycler fires on a randomised wall-clock timer.
        // Running both means whichever wrote last wins, which is exactly why the
        // old show read as arbitrary. Exactly one writer at a time.
        const showDriving = !!(this.showDirector && this.showDirector.isDriving());
        if (!this.vjManualMode && !directorHoldingMacro && !showDriving) {
            const currentPhaseDuration = this.phaseDurations[this.lightingPhase];
            
            // Smoothly interpolate energy level toward target.
            // energyLevel drives spotlight intensity, laser rotation speed and the
            // colour-change interval, so an unscaled per-frame increment made the
            // whole show's ramp rate device-dependent.
            const energySpeed = 1 - Math.pow(1 - 0.005, dtScale);
            this.energyLevel += (this.targetEnergy - this.energyLevel) * energySpeed;
            
            // === IMMERSIVE BEAT-SYNCED MICRO-DYNAMICS ===
            // Real VJ: constant subtle adjustments, never static
            const bpm = this.bpm || 128;
            const beatTime = 60 / bpm;
            this.syncedBeatPhase = (time % beatTime) / beatTime; // 0-1 per beat
            
            // Breathing effect synced to 4-beat bars
            const barPhase = (time % (beatTime * 4)) / (beatTime * 4);
            const microPulse = Math.sin(barPhase * Math.PI * 2) * 0.15;
            
            // Sharp beat pulse (peaks on each beat)
            const beatPulse = Math.pow(1 - this.syncedBeatPhase, 3) * 0.2;
            
            // Crowd focus: spotlights occasionally converge on dance floor center
            this.crowdFocusIntensity = Math.sin(time * 0.1) * 0.5 + 0.5;
            
            if (time - this.lightModeSwitchTime > currentPhaseDuration) {
                // === IMMERSIVE 12-PHASE SHOW CYCLE ===
                // Professional animation sequence designed for maximum crowd immersion
                switch(this.lightingPhase) {
                    case 'intro':
                        // INTRO → BUILD: Tease the crowd, slow reveal
                        this.lightingPhase = 'build';
                        this.targetEnergy = 0.5;
                        
                        // Moving heads sweep slowly, creating anticipation
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true; // Haze for beam visibility
                        
                        // === FOG MACHINES: Auto mode with moderate output ===
                        this.fogIntensity = 0.8;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 12; // Occasional bursts
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1; // Sweep only (no strobe)
                        this.spotlightSpeed = 0.6; // Slow, hypnotic
                        this.laserSpeed = 0.5;
                        this.ledWallSpeed = 0.7;
                        this.currentShowMode = 'spotlights';
                        log.info('🎭 BUILD: Tension rising - Slow sweeping beams');
                        break;
                        
                    case 'build':
                        // BUILD → TENSION: Increase intensity with gobos only
                        this.lightingPhase = 'tension';
                        this.targetEnergy = 0.75;
                        
                        // GOBOS ONLY - fast sweeping, no lasers yet (save for later)
                        this.lightsActive = true;  // Gobos featured
                        this.lasersActive = false; // Lasers OFF - save for their moment
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 3; // CROSSED BEAMS - dramatic X patterns build tension
                        this.spotlightMode = 0; // Strobe + sweep
                        this.spotlightSpeed = 1.4; // Faster as tension builds
                        this.laserSpeed = 1.0;
                        this.ledWallSpeed = 1.2;
                        
                        // === FOG: Building intensity ===
                        this.fogIntensity = 1.2;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 6;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('⚡ TENSION: Gobos intensify - Crossed beams building');
                        break;
                        
                    case 'tension':
                        // TENSION → DROP: THE BIG MOMENT - Everything explodes!
                        this.lightingPhase = 'drop';
                        this.targetEnergy = 1.0;
                        this.vjDropActive = true; // Trigger drop effects
                        this.vjDropTimer = time;
                        
                        // MAXIMUM CHAOS - Laser sheet + strobes
                        this.lightsActive = false; // Gobos off for laser sheet
                        this.lasersActive = false; // Ceiling lasers off
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // STROBES FIRE
                        this.smokeActive = true; // Maximum haze
                        
                        // === FOG MACHINE BURST ON DROP ===
                        this.fogIntensity = 2.0; // Maximum fog output
                        this.fogBurstInterval = 3; // Rapid bursts
                        // Trigger immediate burst
                        if (this.fogMachines) {
                            this.fogMachines.forEach(machine => {
                                machine.isBursting = true;
                                machine.burstTimer = 4.0; // Long burst on drop
                                machine.emitter.emitRate = 250;
                            });
                        }
                        
                        this.spotlightSpeed = 2.5; // FAST
                        this.laserSpeed = 2.0;
                        this.ledWallSpeed = 2.5; // LED wall goes crazy
                        this.strobeSpeed = 2.0; // Rapid strobes
                        this.currentShowMode = 'laserSheet';
                        log.info('💥 DROP: MAXIMUM IMPACT - Fog machines blast!');
                        break;
                        
                    case 'drop':
                        // DROP → PEAK: Sustain the energy, controlled chaos
                        this.lightingPhase = 'peak';
                        this.targetEnergy = 0.95;
                        this.vjDropActive = false;
                        
                        // High energy but slightly more controlled
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // Keep strobes
                        this.smokeActive = true;
                        
                        this.spotlightSpeed = 1.8;
                        this.laserSpeed = 1.5;
                        this.ledWallSpeed = 1.8;
                        this.strobeSpeed = 1.5;
                        
                        // === FOG: Sustained high output ===
                        this.fogIntensity = 1.5;
                        this.fogBurstMode = 'continuous';
                        
                        this.currentShowMode = 'laserSheet';
                        log.info('🔥 PEAK: Riding the wave - Sustained high energy');
                        break;
                        
                    case 'peak':
                        // PEAK → BREAKDOWN: Sudden cut - create contrast
                        this.lightingPhase = 'breakdown';
                        this.targetEnergy = 0.2; // DRAMATIC DROP in energy
                        
                        // EVERYTHING OFF except mirror ball - disco moment!
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = true; // THE DISCO BALL MOMENT
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = false; // Clear air for reflections
                        
                        // === FOG MACHINE OFF for clean mirror ball reflections ===
                        this.fogIntensity = 0.0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(machine => {
                                machine.isBursting = false;
                                machine.emitter.emitRate = 0;
                            });
                        }
                        
                        this.mirrorBallSpeed = 0.4; // Slow, romantic
                        this.ledWallSpeed = 0.3; // LED wall very slow
                        this.currentShowMode = 'mirror';
                        log.info('🪩 BREAKDOWN: Disco moment - Clear air for reflections');
                        break;
                        
                    case 'breakdown':
                        // BREAKDOWN → ATMOSPHERIC: Slow gobos only - dreamy
                        this.lightingPhase = 'atmospheric';
                        this.targetEnergy = 0.35;
                        
                        // GOBOS ONLY - ethereal slow movement after disco moment
                        this.lightsActive = true;   // Slow ethereal gobos
                        this.lasersActive = false;  // No lasers
                        this.mirrorBallActive = false; // Mirror ball had its moment
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true; // Light haze for beam visibility
                        
                        this.spotlightPattern = 2; // MIRROR SWEEP - converging/diverging ethereal
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.3; // Very slow, dreamlike
                        this.mirrorBallSpeed = 0.5;
                        this.ledWallSpeed = 0.4;
                        
                        // === FOG: Light haze for ethereal beams ===
                        this.fogIntensity = 0.6;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 20;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('✨ ATMOSPHERIC: Ethereal gobos - Dreamlike sweeps');
                        break;
                        
                    case 'atmospheric':
                        // ATMOSPHERIC → LASER TUNNEL: Immersive laser experience
                        this.lightingPhase = 'laser_tunnel';
                        this.targetEnergy = 0.7;
                        
                        // ALL lasers converge toward dance floor - tunnel effect
                        this.lightsActive = false;
                        this.lasersActive = true;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.smokeActive = true; // Maximum haze for beam visibility
                        
                        // === FOG MACHINES: Heavy continuous output for laser tunnel ===
                        this.fogIntensity = 1.5;
                        this.fogBurstMode = 'continuous';
                        
                        this.laserSpeed = 0.3; // Very slow rotation
                        this.laserFanAngle = 0.2; // Narrow fan - beams converge
                        this.ledWallSpeed = 0.5;
                        this.currentShowMode = 'lasers';
                        log.info('🌀 LASER TUNNEL: Fog machines continuous for beam visibility');
                        break;
                        
                    case 'laser_tunnel':
                        // LASER TUNNEL → GROOVE: Transition to gobos-only hypnotic groove
                        this.lightingPhase = 'groove';
                        this.targetEnergy = 0.6;
                        
                        // GOBOS ONLY for groove - lasers had their moment
                        this.lightsActive = true;   // Gobos take over
                        this.lasersActive = false;  // Lasers OFF - contrast after laser tunnel
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 2; // MIRROR SWEEP - hypnotic synchronized movement
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.6; // Medium speed for groove
                        this.laserSpeed = 0.6;
                        this.laserFanAngle = 0.5; // Normal spread
                        this.ledWallSpeed = 0.8;
                        
                        // === FOG: Light haze for groove ===
                        this.fogIntensity = 0.7;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 15;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('🎵 GROOVE: Gobos-only hypnosis after laser intensity');
                        break;
                        
                    case 'groove':
                        // GROOVE → EUPHORIA: Mirror ball moment - disco glory
                        this.lightingPhase = 'euphoria';
                        this.targetEnergy = 0.85;
                        
                        // MIRROR BALL FEATURED - solo star with subtle gobos
                        // This is THE disco moment - mirror ball deserves focus
                        this.lightsActive = true;   // Slow gobos complement
                        this.lasersActive = false;  // Lasers OFF - would overpower reflections
                        this.mirrorBallActive = true; // THE STAR
                        this.strobesActive = false; // No strobes - pure vibes
                        this.laserSheetActive = false;
                        this.smokeActive = false;   // Clear air for crisp reflections
                        
                        this.spotlightPattern = 1; // STATIC DOWN - let mirror ball shine
                        this.spotlightMode = 1; // Sweep only - elegant
                        this.spotlightSpeed = 0.3; // Very slow - don't compete
                        this.mirrorBallSpeed = 0.6;
                        this.ledWallSpeed = 0.4; // Subdued LED wall
                        
                        // === FOG OFF - clear air for mirror ball reflections ===
                        this.fogIntensity = 0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => { m.isBursting = false; m.emitter.emitRate = 0; });
                        }
                        
                        this.currentShowMode = 'mirror';
                        log.info('💫 EUPHORIA: Mirror ball glory - Disco moment');
                        break;
                        
                    case 'euphoria':
                        // EUPHORIA → DARKNESS: Dramatic blackout for contrast
                        this.lightingPhase = 'darkness';
                        this.targetEnergy = 0.05; // Near-blackout
                        
                        // EVERYTHING OFF - total darkness except minimal LED
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = false;
                        
                        // === FOG OFF - pure darkness ===
                        this.fogIntensity = 0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => { m.isBursting = false; m.emitter.emitRate = 0; });
                        }
                        
                        this.ledWallSpeed = 0.1; // LED wall very dim, slow pulse
                        this.currentShowMode = 'darkness';
                        log.info('🌑 DARKNESS: Dramatic blackout - fog cleared');
                        break;
                        
                    case 'darkness':
                        // DARKNESS → STROBE ATTACK: Explosive return!
                        this.lightingPhase = 'strobe_attack';
                        this.targetEnergy = 1.0; // MAXIMUM
                        
                        // STROBES - sensory overload
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // FULL STROBES
                        this.smokeActive = true;
                        
                        // === FOG BURST on strobe attack ===
                        this.fogIntensity = 1.8;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 4;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => {
                                m.isBursting = true;
                                m.burstTimer = 3.0;
                                m.emitter.emitRate = 180;
                            });
                        }
                        
                        this.strobeSpeed = 3.0; // VERY FAST
                        this.ledWallSpeed = 3.0; // LED goes crazy
                        this.currentShowMode = 'strobe_attack';
                        log.info('⚡ STROBE ATTACK: Fog blast with strobes!');
                        break;
                        
                    case 'strobe_attack':
                        // STROBE ATTACK → BUILD: Reset cycle with high energy start
                        this.lightingPhase = 'build';
                        this.targetEnergy = 0.55;
                        
                        // Transition back to building phase
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        // === FOG: moderate auto mode for new cycle ===
                        this.fogIntensity = 1.0;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 10;
                        
                        this.spotlightPattern = 0;
                        this.spotlightMode = 1;
                        this.spotlightSpeed = 0.7;
                        this.ledWallSpeed = 0.8;
                        this.currentShowMode = 'spotlights';
                        log.info('🔄 BUILD: New cycle begins - The journey continues');
                        break;
                        
                    default:
                        // STARTUP: Begin with intro
                        this.lightingPhase = 'intro';
                        this.targetEnergy = 0.3;
                        
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1;
                        this.spotlightSpeed = 0.4;
                        this.ledWallSpeed = 0.5;
                        this.currentShowMode = 'spotlights';
                        log.info('🌅 INTRO: Show begins - Setting the mood');
                        break;
                }
                
                this.lightModeSwitchTime = time;
                
                // DYNAMIC PHASE DURATIONS - Randomized for natural feel
                const phaseName = this.lightingPhase;
                if (phaseName === 'intro') {
                    this.phaseDurations.intro = 12 + Math.random() * 8;
                } else if (phaseName === 'build') {
                    this.phaseDurations.build = 20 + Math.random() * 12;
                } else if (phaseName === 'tension') {
                    this.phaseDurations.tension = 12 + Math.random() * 8;
                } else if (phaseName === 'drop') {
                    this.phaseDurations.drop = 6 + Math.random() * 6; // SHORT for impact!
                } else if (phaseName === 'peak') {
                    this.phaseDurations.peak = 16 + Math.random() * 12;
                } else if (phaseName === 'breakdown') {
                    this.phaseDurations.breakdown = 10 + Math.random() * 6;
                } else if (phaseName === 'atmospheric') {
                    this.phaseDurations.atmospheric = 14 + Math.random() * 10;
                } else if (phaseName === 'groove') {
                    this.phaseDurations.groove = 20 + Math.random() * 12;
                } else if (phaseName === 'euphoria') {
                    this.phaseDurations.euphoria = 8 + Math.random() * 6;
                } else if (phaseName === 'darkness') {
                    this.phaseDurations.darkness = 4 + Math.random() * 4; // Very short!
                } else if (phaseName === 'strobe_attack') {
                    this.phaseDurations.strobe_attack = 5 + Math.random() * 3;
                } else if (phaseName === 'laser_tunnel') {
                    this.phaseDurations.laser_tunnel = 12 + Math.random() * 8;
                }
            }
            
            // === IMMERSIVE MICRO-DYNAMICS: Real-time crowd-focused animations ===
            // Professional VJ technique: constant subtle adjustments create "living" show
            
            // Speed variations based on energy (things accelerate as energy rises)
            const energySpeedBoost = 0.7 + this.energyLevel * 0.6; // 0.7x to 1.3x
            
            // === SPOTLIGHT CROWD FOCUS ===
            // Occasionally converge spotlights on dance floor center for dramatic effect
            if (this.lightsActive && this.spotlights) {
                this.spotlights.forEach((spot) => {
                    if (spot.light) {
                        // Intensity breathes with energy + beat sync
                        const baseIntensity = 8 + this.energyLevel * 15; // 8-23
                        const beatBoost = beatPulse * 2; // Punch on beats
                        spot.light.intensity = baseIntensity * (1 + microPulse + beatBoost);

                        // NOTE: there used to be a "colour temperature shifts with phase"
                        // block here that did `spot.light.diffuse.r += 0.1` (clamped to 1)
                        // every frame during the 'euphoria' and 'tension' phases.
                        // It was dead AND wrong:
                        //   - dead, because the spotlight pass later in this same frame
                        //     unconditionally reassigns `spot.light.diffuse` from
                        //     `this.currentSpotColor`, discarding the accumulation;
                        //   - wrong, because it mutated a Color3 in place with no code
                        //     anywhere to restore it, so had it survived, a few seconds of
                        //     'euphoria' would have saturated every spotlight to white
                        //     permanently. Phase colour is the palette's job (VJDirector /
                        //     ShowDirector), not a per-frame additive nudge.
                    }
                });
            }
            
            // === LASER DYNAMICS ===
            // Lasers respond to energy and create immersive patterns
            if (this.lasersActive && this.lasers) {
                const fanAngle = this.laserFanAngle || 0.5;
                
                this.lasers.forEach((laser) => {
                    // Rotation speed tied to energy
                    laser.rotationSpeed = (0.008 + this.energyLevel * 0.03) * energySpeedBoost;
                    
                    // During laser_tunnel phase, lasers converge
                    if (this.lightingPhase === 'laser_tunnel') {
                        laser.convergenceTarget = this.beamConvergencePoint;
                        laser.fanSpread = fanAngle; // Narrow spread
                    } else {
                        laser.convergenceTarget = null;
                        laser.fanSpread = 0.5; // Normal spread
                    }
                });
            }
            
            // === MIRROR BALL IMMERSIVE DYNAMICS ===
            // OPTIMIZATION: Skip mirror ball updates in VR if performance is critical
            if (this.mirrorBallActive && this.mirrorBall && (!this.isInVRMode || this.frameCounter % 2 === 0)) {
                if (this.lightingPhase === 'breakdown') {
                    // Romantic slow rotation with breathing
                    const romancePulse = Math.sin(time * 0.3) * 0.15;
                    this.mirrorBallSpeed = 0.35 + romancePulse;
                } else if (this.lightingPhase === 'euphoria') {
                    // Faster, joyful rotation
                    this.mirrorBallSpeed = 0.6 + Math.sin(time * 0.5) * 0.1;
                } else {
                    // Normal rotation
                    this.mirrorBallSpeed = 0.5;
                }
            }
            
            // === STROBE INTENSITY CONTROL ===
            if (this.strobesActive && this.lightingPhase === 'strobe_attack') {
                // Maximum intensity during strobe attack
                this.strobeSpeed = 2.5 + Math.random() * 0.5; // Vary speed slightly
            }
            
        } else {
            // In manual mode: update lightModeSwitchTime to prevent immediate cycling when mode expires
            this.lightModeSwitchTime = time;
        }
    }

    /** Drive the LED wall (modular system, legacy pattern player, or forced black). */
}
window.VRClubAnimationCore = VRClubAnimationCore;
