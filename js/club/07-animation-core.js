class VRClubAnimationCore extends VRClubEffects {
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
        this.updateStrobes(ctx);
        this.updateSpeakerCones(ctx);
        this.updateCameraPresence(ctx);
        this.updateEyeAdaptation(ctx);
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
        if (this.ledWallActive) brightness += 0.28 * master;
        if (this.strobesActive && !this.photosensitiveSafeMode) brightness += 0.12 * master;
        if (this.blindersActive) brightness += 0.26;
        brightness += (ctx.beat || 0) * 0.10;

        // Stopping down is capped harder than opening up so a blackout never blows out.
        const target = base * Math.max(0.78, Math.min(1.22, 1.22 - brightness * 0.42));
        // Fast constrict, slow dilate - the real asymmetry of the pupil reflex.
        const rate = target < this._adaptedExposure ? 0.10 : 0.012;
        this._adaptedExposure += (target - this._adaptedExposure) * Math.min(1, rate * ctx.dtScale);
        ip.exposure = this._adaptedExposure;
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

        // Bass-driven controller rumble for VR users (no-op outside XR / when disabled)
        this._updateBassHaptics(audioData);

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
        const { time, dt } = ctx;

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
                            emitter.emitRate = 150 * this.fogIntensity;
                            
                            // Update LED to red (active) — cached, no allocation
                            ledMat.emissiveColor = this.cachedColors.fogActive;
                            
                            if (i === 0) this.lastFogBurst = currentTime;
                        }
                        
                        if (machine.isBursting) {
                            machine.burstTimer -= dt; // frame-rate independent
                            
                            // Fade out burst over last 0.5 seconds
                            if (machine.burstTimer < 0.5) {
                                emitter.emitRate = 150 * this.fogIntensity * (machine.burstTimer / 0.5);
                            }
                            
                            if (machine.burstTimer <= 0) {
                                machine.isBursting = false;
                                emitter.emitRate = 0;
                                ledMat.emissiveColor = this.cachedColors.fogReady; // Green (ready)
                            }
                        }
                        
                    } else if (this.fogBurstMode === 'continuous') {
                        // Continuous low output
                        emitter.emitRate = 80 * this.fogIntensity;
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
                // Smoke disabled - stop all fog machines
                this.fogMachines.forEach(machine => {
                    machine.emitter.emitRate = 0;
                    machine.isBursting = false;
                    machine.ledMat.emissiveColor = this.cachedColors.fogOff; // Gray (off)
                });
                
                if (this.haze && this.haze.isStarted()) this.haze.stop();
            }
        }
    }

    /** Scanning laser sheet: tilt sweep, smoke UV flow, audio-pulsed intensity. */
    updateLaserSheet(ctx) {
        const { time, dtScale, audio: audioData } = ctx;
        const speedMultiplierLaser = this.laserSpeed || 1.0;

        // ANIMATE LASER SHEET (Hyperrealism)
        if (this.laserSheet && this.laserSheetActive) {
            // The material is optional on this mesh; hoist it once instead of guarding
            // in one place and dereferencing unguarded three lines later.
            const sheetMat = this.laserSheet.material;
            if (!sheetMat) return;

            // SCANNING MOTION (Tilt up and down)
            // Source is at y=5.5. Target z range is 0 to 40.
            // Angle 0 = Horizontal. Angle + = Down.
            
            const scanSpeed = 0.2 * speedMultiplierLaser;
            // Scan range: -0.1 (slightly up) to +0.4 (down to floor)
            const scanAngle = 0.15 + Math.sin(time * scanSpeed) * 0.25; 
            
            // Rotate the SOURCE (parent), sheet follows
            if (this.laserSheetSource) {
                this.laserSheetSource.rotation.x = scanAngle;
            }
            
            // Animate smoke texture flowing OUTWARD from source
            if (sheetMat.opacityTexture) {
                // Move V offset to flow from 0 (source) to 1 (end)
                sheetMat.opacityTexture.vOffset -= 0.008 * speedMultiplierLaser * dtScale;
                // Slight side drift
                sheetMat.opacityTexture.uOffset += 0.001 * Math.sin(time * 0.5) * dtScale;
            }
            
            // Pulse intensity with audio
            const pulse = 0.5 + (audioData.average || 0) * 0.5;
            sheetMat.alpha = 0.5 * pulse;
            
            // Color sync
            if (this.laserEmissiveColors) {
                let sheetColor;
                if (this.currentColorIndex === 0) sheetColor = this.cachedColors.red;
                else if (this.currentColorIndex === 1) sheetColor = this.cachedColors.green;
                else sheetColor = this.cachedColors.blue;
                
                sheetMat.emissiveColor = sheetColor;
                if (this.laserAperture && this.laserAperture.material) {
                    this.laserAperture.material.emissiveColor = sheetColor;
                }
                if (this.laserLight) {
                    this.laserLight.diffuse = sheetColor;
                    this.laserLight.intensity = 2.0 * pulse;
                }
            }
            
            this.laserSheet.isVisible = true;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = true;
        } else if (this.laserSheet) {
            this.laserSheet.isVisible = false;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = false;
            if (this.laserLight) this.laserLight.intensity = 0;
        }
    }

    /** Crowd avatars. */
    updateDancers(ctx) {
        const { time, audio: audioData } = ctx;
        if (this.npcAvatars && this.npcAvatars.length > 0) {
            this.updateDancingNPCs(time, audioData);
        }
    }

    /** Mirror ball: rotation, fixture glow, outgoing rays and reflection spots. */
    updateMirrorBall(ctx) {
        const { time, dtScale } = ctx;

        // === MIRROR BALL EFFECT ===
        if (this.mirrorBallActive) {
            const showDriving = !!(this.showDirector && this.showDirector.isDriving());
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
                this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(beam.isIncidentLight));
            }
            if (this._mirrorAppliedColorSource !== this.mirrorBallSpotlightColor) {
                this._mirrorAppliedColorSource = this.mirrorBallSpotlightColor;
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
                // PERFORMANCE: Cache scaled colors for mirror ball housings (avoid creating Color3 objects every frame)
                if (!this.mirrorBallCachedColors || this.mirrorBallCachedColorSource !== this.mirrorBallSpotlightColor) {
                    this.mirrorBallCachedColors = {
                        housingGlow: this.mirrorBallSpotlightColor.scale(0.2),
                        lensBright: this.mirrorBallSpotlightColor.scale(5.0),
                        sourceVeryBright: this.mirrorBallSpotlightColor.scale(8.0),
                        flareMedium: this.mirrorBallSpotlightColor.scale(3.0)
                    };
                    this.mirrorBallCachedColorSource = this.mirrorBallSpotlightColor;
                }
                
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
                this.mirrorBallRotation -= 0.003 * speedMultiplier * dtScale; // Negative rotation - spots now move in same visual direction
                this.mirrorBall.rotation.y = this.mirrorBallRotation;
                
                // AUTOMATIC COLOR CYCLING for Mirror Ball (if not manually set).
                // Wall clock, not `frameCounter % 180`: the frame-counter version fired
                // every 1.5 s at 120 Hz and every 6 s at 30 Hz, so the ball kept a
                // different musical tempo on every device.
                if (!this.vjManualMode && !showDriving && time - (this._mirrorColorSwitchTime || 0) > 3) {
                    this._mirrorColorSwitchTime = time;
                    this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
                    this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
                    
                    // Update spotlight diffuse colors (the actual lights pointing at the ball)
                    if (this.mirrorBallSpotlights) {
                        this.mirrorBallSpotlights.forEach(light => {
                            if (light) light.diffuse = this.mirrorBallSpotlightColor.clone();
                        });
                    }
                    
                    // Update beam colors (visual beams from fixtures to ball)
                    if (this.mirrorBallBeams) {
                        this.mirrorBallBeams.forEach(beam => {
                            beam.material.emissiveColor = this.mirrorBallSpotlightColor.clone();
                        });
                    }
                    
                    // Update housing colors immediately
                    if (this.mirrorBallHousings) {
                        // Update cached colors
                        this.mirrorBallCachedColors = {
                            housingGlow: this.mirrorBallSpotlightColor.scale(0.2),
                            lensBright: this.mirrorBallSpotlightColor.scale(5.0),
                            sourceVeryBright: this.mirrorBallSpotlightColor.scale(8.0),
                            flareMedium: this.mirrorBallSpotlightColor.scale(3.0)
                        };
                        
                        this.mirrorBallHousings.forEach(housing => {
                            housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                            housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
                            housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
                            housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
                        });
                    }
                }
            }
            
            // === ANIMATE OUTGOING RAYS FROM MIRROR BALL ===
            // These rays rotate WITH the ball and raycast to surfaces for realistic termination
            if (this.mirrorBallOutgoingRays && this.mirrorBallOutgoingRays.length > 0) {
                const ballPos = this.mirrorBall.position;
                
                // Reuse ray object for performance
                if (!this.mirrorOutgoingRay) {
                    this.mirrorOutgoingRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), 40);
                    this.mirrorOutgoingRayPredicate = this.mirrorBallRayPredicate;
                }
                
                // Only update ray lengths every 6th frame on desktop (expensive raycasts)
                // In VR update every 2nd frame for better sync
                const shouldUpdateRayLengths = this.isInVRMode ? 
                    (this.frameCounter % 2 === 0) : 
                    (this.frameCounter % 6 === 0);
                
                this.mirrorBallOutgoingRays.forEach((ray, i) => {
                    ray.mesh.setEnabled(true);
                    
                    // Rotate ray direction with the mirror ball (around Y axis)
                    // Babylon's left-handed Y rotation maps this spherical basis
                    // (x=cos(theta), z=sin(theta)) to theta - rotation.
                    const rotatedTheta = ray.theta - this.mirrorBallRotation;
                    
                    // Calculate new direction based on rotated angle.
                    // Written into shared scratch - this loop runs 40x per frame, so a
                    // `new Vector3` here alone was ~2,400 allocations/sec.
                    const sinPhi = Math.sin(ray.phi);
                    const dir = this.vecPool.mirrorDir;
                    dir.set(sinPhi * Math.cos(rotatedTheta), Math.cos(ray.phi), sinPhi * Math.sin(rotatedTheta));
                    
                    // Raycast to find actual surface hit (staggered for performance)
                    let actualLength = ray.length; // Default to stored length
                    if (shouldUpdateRayLengths && (i % 8 === this.frameCounter % 8)) {
                        // Raycast from ball surface outward
                        dir.scaleToRef(0.6, this.vecPool.mirrorTmp);
                        this.mirrorOutgoingRay.origin.copyFrom(ballPos).addInPlace(this.vecPool.mirrorTmp);
                        this.mirrorOutgoingRay.direction.copyFrom(dir);
                        
                        const hit = this.scene.pickWithRay(this.mirrorOutgoingRay, this.mirrorOutgoingRayPredicate);
                        if (hit && hit.hit && hit.pickedPoint) {
                            actualLength = hit.distance;
                            ray.currentLength = actualLength; // Cache for smooth interpolation
                        }
                    }
                    
                    // Use cached length with smooth interpolation.
                    // The retention rate is compounded over dtScale so the smoothing
                    // TIME CONSTANT is the same at 30, 60, 72, 90 and 120 Hz.
                    const targetLength = ray.currentLength || ray.length;
                    ray.displayLength = ray.displayLength || ray.length;
                    ray.displayLength += (targetLength - ray.displayLength) * (1 - Math.pow(0.9, dtScale));
                    
                    // Update mesh scale to match actual ray length
                    const scaleRatio = ray.displayLength / ray.length;
                    ray.mesh.scaling.y = scaleRatio;
                    
                    // Position ray starting from ball surface. copyFrom, not assignment:
                    // replacing mesh.position with a fresh Vector3 every frame churns GC
                    // and defeats Babylon's internal dirty tracking.
                    dir.scaleToRef(ray.displayLength / 2 + 0.6, this.vecPool.mirrorTmp);
                    ray.mesh.position.copyFrom(ballPos).addInPlace(this.vecPool.mirrorTmp);
                    
                    // Rotate ray to point along direction
                    const up = this.vecPool.up;
                    up.set(0, 1, 0);
                    const angle = Math.acos(Math.min(1, Math.max(-1, BABYLON.Vector3.Dot(up, dir))));
                    BABYLON.Vector3.CrossToRef(up, dir, this.vecPool.mirrorAxis);
                    if (this.vecPool.mirrorAxis.length() > 0.001) {
                        this.vecPool.mirrorAxis.normalize();
                        // Own the quaternion per ray, then write into it in place.
                        if (!ray.mesh.rotationQuaternion) {
                            ray.mesh.rotationQuaternion = BABYLON.Quaternion.Identity();
                        }
                        BABYLON.Quaternion.RotationAxisToRef(this.vecPool.mirrorAxis, angle, ray.mesh.rotationQuaternion);
                    }
                    
                    // Twinkling effect - subtle visibility variation (shared material, per-mesh visibility)
                    const twinkle = 0.8 + 0.2 * Math.sin(time * 5 + i * 0.7);
                    const rayBaseVisibility = this.isInVRMode ? 0.18 : 0.12;
                    ray.mesh.visibility = (rayBaseVisibility + (i % 5) * 0.02) * twinkle;
                });
                
                // UPGRADE: Update shared ray material color once (not 40× per frame)
                // QC: this material is written EVERY frame, so it must stay permanently
                // unfrozen. The old freeze()/unfreeze() pair called Material.markDirty()
                // twice per frame, and markDirty() walks every mesh in the scene.
                if (this._sharedMirrorRayMat) {
                    if (this._sharedMirrorRayMat.isFrozen) this._sharedMirrorRayMat.unfreeze();
                    this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor;
                }
            }
            
            // Animate reflection spots around the room (150 spots covering all surfaces)
            // SYNCHRONIZED FRAME-SKIP OPTIMIZATION: Update ALL spots every 3 frames
            // This eliminates "catch-up" effect while maintaining 60fps performance
            if (this.mirrorReflectionSpots && this.mirrorReflectionSpots.length > 0) {
                const ballPos = this.mirrorBall.position; // Ball at (0, 6.5, -12)
                // Graphics tier controls visual density independently of camera mode.
                // Entering XR must not remove reflections from the current scene.
                const activeSpotCount = this.tierSettings.mirrorSpots;
                
                // UPDATE-RATE STRATEGY.
                //
                // This loop is the single most expensive thing in the frame: one
                // scene.pickWithRay() per spot, against every pickable mesh in the room.
                // With 100 spots that is 100 full scene raycasts per update.
                //
                // It previously ran EVERY frame in VR, on the justification that
                // "frame-skipping in VR causes different states per eye = epileptic
                // effect". That reasoning is incorrect: Babylon renders both eyes from a
                // single scene state within one render() call, so an update skipped for a
                // frame is skipped for BOTH eyes and the two views can never disagree.
                // The net effect was 3x the raycast cost on the one platform least able
                // to absorb it (7,200 raycasts/sec at 72 Hz).
                //
                // VR now updates every 2nd frame (36-45 Hz effective) and desktop every
                // 3rd. Spot motion is smoothed by the lerp below, so neither is visible.
                this.spotUpdateFrameCounter = (this.spotUpdateFrameCounter || 0) + 1;
                const shouldUpdate = this.isInVRMode
                    ? (this.spotUpdateFrameCounter % 2 === 0)
                    : (this.spotUpdateFrameCounter % 3 === 0);
                
                if (shouldUpdate) {
                    // Update ALL spots synchronously
                    for (let i = 0; i < this.mirrorReflectionSpots.length; i++) {
                    const spot = this.mirrorReflectionSpots[i];
                    if (i >= activeSpotCount) {
                        spot.visual.setEnabled(false);
                        if (spot.beam) spot.beam.setEnabled(false);
                        spot.isVisible = false;
                        continue;
                    }
                    // Enable visual spot (no actual light - just emissive mesh)
                    spot.visual.setEnabled(true);
                    
                    // REALISTIC RAY CASTING: Calculate direction from mirror ball based on rotation
                    // Each spot represents a mirror facet at a specific angle (theta, phi)
                    // As ball rotates, the facet direction rotates with it in a realistic manner
                    // The ball rotates on Y-axis, so horizontal angle (theta) changes, vertical (phi) stays fixed
                    const rotatedTheta = spot.theta - this.mirrorBallRotation;
                    
                    // OPTIMIZED: Cache cos/sin calculations for reuse
                    const cosTheta = Math.cos(rotatedTheta);
                    const sinTheta = Math.sin(rotatedTheta);
                    
                    // Calculate ray direction from ball in spherical coordinates (standard physics)
                    const sinPhi = Math.sin(spot.phi);
                    const dirX = sinPhi * cosTheta;
                    const dirY = Math.cos(spot.phi);
                    const dirZ = sinPhi * sinTheta;
                    
                    // Ray cast from ball position to find which surface it hits
                    // ULTRA-OPTIMIZED: Reuse cached Ray object instead of creating new ones (massive allocation savings)
                    this.mirrorBallRay.origin.copyFrom(ballPos);
                    this.mirrorBallRay.direction.set(dirX, dirY, dirZ);
                    this.mirrorBallRay.length = 30; // Max 30m range
                    
                    // Pick meshes using cached predicate and cached ray (MAXIMUM PERFORMANCE)
                    const pickResult = this.scene.pickWithRay(this.mirrorBallRay, this.mirrorBallRayPredicate);
                    
                    let hitPos = null;
                    let hitNormal = null;
                    let hitDistance = Infinity;
                    let hitMesh = null;
                    
                    if (pickResult.hit && pickResult.pickedPoint) {
                        hitPos = pickResult.pickedPoint;
                        hitNormal = pickResult.getNormal(true); // Get normalized surface normal
                        hitDistance = pickResult.distance;
                        hitMesh = pickResult.pickedMesh;
                        
                        // Offset slightly from surface to prevent z-fighting.
                        // In place: `hitPos.add(hitNormal.scale(0.02))` allocated two
                        // Vector3 per spot per update (~200 per update, 4k/sec).
                        if (hitNormal) {
                            hitNormal.scaleToRef(0.02, this.vecPool.mirrorTmp);
                            hitPos.addInPlace(this.vecPool.mirrorTmp);
                        } else {
                            // Fallback if normal calculation fails - use reverse ray direction
                            this.mirrorBallRay.direction.scaleToRef(-1, this.vecPool.mirrorAxis);
                            hitNormal = this.vecPool.mirrorAxis;
                        }
                    }
                    
                    // Position spot at ray intersection point with REALISTIC SMOOTH INTERPOLATION
                    if (hitPos) {
                        // IMPROVED: Calculate realistic movement based on ball rotation speed
                        const distanceMoved = BABYLON.Vector3.Distance(spot.visual.position, hitPos);
                        const isSameMesh = (spot.previousHitMesh === hitMesh);
                        
                        // REALISTIC interpolation: mirror ball reflections move based on physics
                        // Real disco balls create smooth, continuous movement patterns.
                        // Each rate is a per-60fps-frame retention that is compounded over
                        // the real frame time below, so the smoothing time constant no
                        // longer varies by ~4x across the supported refresh-rate range.
                        let lerpFactor;
                        
                        if (!isSameMesh && distanceMoved > 5.0) {
                            // Surface transition (e.g., wall to floor) - instant snap for realism
                            // Real disco ball reflections jump between surfaces, not slide
                            lerpFactor = 1.0;
                        } else if (distanceMoved > 1.5) {
                            // Significant movement - moderate tracking speed
                            // Prevents unrealistic sliding while maintaining smooth motion
                            lerpFactor = 0.7;
                        } else if (distanceMoved < 0.1) {
                            // Micro-movements - very smooth to eliminate jitter
                            // Stabilizes spots that are nearly stationary
                            lerpFactor = 0.9;
                        } else {
                            // Normal movement - balanced tracking
                            // Natural speed that matches ball rotation
                            lerpFactor = 0.75;
                        }
                        if (lerpFactor < 1.0) lerpFactor = 1 - Math.pow(1 - lerpFactor, dtScale);
                        
                        // Smoothly interpolate position (prevents jarring jumps)
                        spot.visual.position.x += (hitPos.x - spot.visual.position.x) * lerpFactor;
                        spot.visual.position.y += (hitPos.y - spot.visual.position.y) * lerpFactor;
                        spot.visual.position.z += (hitPos.z - spot.visual.position.z) * lerpFactor;
                        
                        // Orient perpendicular to surface
                        // Orient the spot to lie flat against the surface it landed on.
                        // `position.add(hitNormal)` allocated a Vector3 per spot per update.
                        this.vecPool.mirrorLook.copyFrom(spot.visual.position).addInPlace(hitNormal);
                        spot.visual.lookAt(this.vecPool.mirrorLook);
                        
                        // Update tracking for next frame
                        spot.previousPosition.copyFrom(spot.visual.position);
                        spot.previousHitMesh = hitMesh;
                        
                        // Distance fade and twinkling - REDUCED BRIGHTNESS
                        const distanceFade = Math.max(0.3, 1 - (hitDistance / 30)); // Dimmer with distance
                        const twinkle = 0.7 + 0.3 * Math.sin(time * spot.twinkleSpeed + spot.twinklePhase); // Gentle twinkling
                        const brightness = spot.baseIntensity * distanceFade * twinkle * 0.6; // 40% dimmer overall
                        
                        // DIMMER emissive color
                        this.mirrorBallSpotlightColor.scaleToRef(
                            Math.max(0.5, brightness),
                            spot.material.emissiveColor
                        );
                        spot.material.alpha = 0.9; // More visible spot

                        // Position the Y-axis cylinder between the ball and hit point.
                        // Mesh.lookAt() aligns Z-forward and made these shafts visibly
                        // diverge from their spots because cylinders are Y-forward.
                        if (spot.beam) {
                            const beamDir = this.vecPool.mirrorDir;
                            beamDir.copyFrom(spot.visual.position).subtractInPlace(ballPos);
                            const beamDist = beamDir.length();
                            beamDir.scaleInPlace(1 / Math.max(beamDist, 0.001));
                            beamDir.scaleToRef(beamDist * 0.5, this.vecPool.mirrorTmp);
                            spot.beam.position.copyFrom(ballPos).addInPlace(this.vecPool.mirrorTmp);
                            spot.beam.scaling.y = beamDist;

                            const up = this.vecPool.up;
                            up.set(0, 1, 0);
                            const angle = Math.acos(Math.min(1, Math.max(-1, BABYLON.Vector3.Dot(up, beamDir))));
                            BABYLON.Vector3.CrossToRef(up, beamDir, this.vecPool.mirrorAxis);
                            if (this.vecPool.mirrorAxis.length() > 0.001) {
                                this.vecPool.mirrorAxis.normalize();
                                if (!spot.beam.rotationQuaternion) {
                                    spot.beam.rotationQuaternion = BABYLON.Quaternion.Identity();
                                }
                                BABYLON.Quaternion.RotationAxisToRef(
                                    this.vecPool.mirrorAxis,
                                    angle,
                                    spot.beam.rotationQuaternion
                                );
                            }

                            // Real reflected shafts are sparse and only legible in haze;
                            // the bright surface spots carry the effect, not 100 solid tubes.
                            const haze = this.smokeActive
                                ? Math.min(1, (this.fogIntensity || 0) / 1.5)
                                : 0;
                            spot.beamVisible = haze > 0 && i % 4 === 0;
                            spot.beam.visibility = (this.isInVRMode ? 0.07 : 0.05) * distanceFade * twinkle * haze;
                            spot.beam.setEnabled(spot.beamVisible);
                        }
                        
                        // Mark as visible for this frame
                        spot.isVisible = true;

                    } else {
                        // Ray didn't hit any surface - HIDE IMMEDIATELY
                        // Spots shouldn't float in mid-air
                        spot.visual.setEnabled(false);
                        if (spot.beam) spot.beam.setEnabled(false);
                        spot.beamVisible = false;
                        spot.isVisible = false;
                        spot.previousHitMesh = null;
                    }
                }
                
                // Update visibility based on tracking state.
                // Inside the gate: `spot.isVisible` and `activeSpotCount` only change
                // in the block above, so running this every frame issued up to 300
                // setEnabled() calls per frame (each walking the mesh's descendant
                // hierarchy) on state that provably had not changed.
                this.mirrorReflectionSpots.forEach((spot, index) => {
                    // Only enable if it was marked visible during the last update
                    // AND if the mirror ball is active
                    if (index < activeSpotCount && spot.isVisible) {
                        spot.visual.setEnabled(true);
                        if (spot.beam && spot.beamVisible && spot.material.alpha > 0.01) {
                            spot.beam.setEnabled(true);
                        }
                    } else {
                        spot.visual.setEnabled(false);
                        if (spot.beam) spot.beam.setEnabled(false);
                    }
                });
                } // Close if (shouldUpdate)
                
                // UPGRADE: Update shared beam material color once per frame (not 100×)
                // QC: permanently unfrozen — see note on _sharedMirrorRayMat above.
                if (this._sharedMirrorBeamMat) {
                    if (this._sharedMirrorBeamMat.isFrozen) this._sharedMirrorBeamMat.unfreeze();
                    if (!this._mirrorBeamEmissive) this._mirrorBeamEmissive = new BABYLON.Color3(0, 0, 0);
                    this._mirrorBeamEmissive.copyFromFloats(
                        this.mirrorBallSpotlightColor.r * 0.8,
                        this.mirrorBallSpotlightColor.g * 0.8,
                        this.mirrorBallSpotlightColor.b * 0.8
                    );
                    this._sharedMirrorBeamMat.emissiveColor = this._mirrorBeamEmissive;
                }
            } // Close if (this.mirrorReflectionSpots...)
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
            if (this.mirrorBallOutgoingRays) {
                this.mirrorBallOutgoingRays.forEach(ray => ray.mesh.setEnabled(false));
            }
            if (this.mirrorBallHousings) {
                // PERFORMANCE: Use cached black color instead of creating new Color3 objects
                this.mirrorBallHousings.forEach(housing => {
                    housing.material.emissiveColor = this.cachedColors.black;
                    housing.lensMaterial.emissiveColor = this.cachedColors.black;
                });
            }
            if (this.mirrorReflectionSpots) {
                this.mirrorReflectionSpots.forEach(spot => {
                    spot.visual.setEnabled(false);
                    if (spot.beam) spot.beam.setEnabled(false);
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
                        this.blindersActive = false;
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
                        this.blindersActive = true; // Blinders start pulsing
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 3; // CROSSED BEAMS - dramatic X patterns build tension
                        this.spotlightMode = 0; // Strobe + sweep
                        this.spotlightSpeed = 1.4; // Faster as tension builds
                        this.laserSpeed = 1.0;
                        this.ledWallSpeed = 1.2;
                        this.blinderSpeed = 0.8;
                        
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
                        
                        // MAXIMUM CHAOS - Laser sheet + strobes + blinders
                        this.lightsActive = false; // Gobos off for laser sheet
                        this.lasersActive = false; // Ceiling lasers off
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // STROBES FIRE
                        this.blindersActive = true; // BLINDERS FIRE
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
                        this.blinderSpeed = 2.0; // Blinders punching
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
                        this.blindersActive = true; // Keep blinders
                        this.smokeActive = true;
                        
                        this.spotlightSpeed = 1.8;
                        this.laserSpeed = 1.5;
                        this.ledWallSpeed = 1.8;
                        this.strobeSpeed = 1.5;
                        this.blinderSpeed = 1.2;
                        
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                        
                        // STROBES + BLINDERS - sensory overload
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // FULL STROBES
                        this.blindersActive = true; // BLINDERS PUNCH
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
                        this.blinderSpeed = 2.5;
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
                        this.blindersActive = false;
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
                        this.blindersActive = false;
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
                
                // Update VJ control button visuals to reflect state
                if (this.vjControlButtons) {
                    this.vjControlButtons.forEach(btn => {
                        if (btn.control === 'lightsActive' || btn.control === 'lasersActive' || 
                            btn.control === 'mirrorBallActive' || btn.control === 'strobesActive' || 
                            btn.control === 'ledWallActive' ||
                            btn.control === 'smokeActive') {
                            btn.material.emissiveColor = this[btn.control] ? btn.onColor : btn.offColor;
                        }
                    });
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
