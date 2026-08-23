class VRClubAnimationFixtures extends VRClubAnimationCore {
    updateLEDWallPass(ctx) {
        const { time, audio: audioData } = ctx;

        // Update LED wall animations
        // CRITICAL FIX: Handle both modular and legacy systems
        if (this.useModularSystems && this.systems.ledWall) {
            this.systems.ledWall.setActive(this.ledWallActive);
            this.systems.ledWall.update(time, audioData);
        } else if (this.ledWallActive && (this.masterIntensity == null || this.masterIntensity > 0.02)) {
            // Legacy update method (skipped during VJ Director BLACKOUT)
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && this.ledPanels.length > 0 &&
                   (!this.ledWallActive || (this.masterIntensity != null && this.masterIntensity <= 0.02))) {
            // LED Wall is OFF — drive every panel to true black, not just paused.
            // Written through each panel's own buffer rather than a shared cached
            // black, so a pattern that mutates emissiveColor in place on a later
            // frame cannot poison the one object the whole wall depends on.
            for (let i = 0; i < this.ledPanels.length; i++) {
                const panel = this.ledPanels[i];
                const c = panel.colorBuffer;
                c.r = 0; c.g = 0; c.b = 0;
                panel.material.emissiveColor = c;
            }
        }
    }

    /** Perimeter dance-floor LED strip, coloured per lighting phase. */
    updateDanceFloorLEDs(ctx) {
        const { time, audio: audioData } = ctx;

        // === IMMERSIVE DANCE FLOOR EDGE LED ANIMATION ===
        // Creates a "breathing" floor that responds to the music and phase
        if (this.danceFloorLEDs && this.danceFloorLEDs.length > 0) {
            // getAudioData() already returns 0..1 (see the /255 in its band sums).
            // Dividing again yielded <=0.004, which pinned every audio-driven term to
            // its floor - the perimeter strip was completely non-reactive, and was
            // BRIGHTER with no audio than with it because the fallback is 0.5.
            const bassLevel = audioData ? audioData.bass : 0.5;
            const midLevel = audioData ? audioData.mid : 0.5;
            const phase = this.lightingPhase;
            
            this.danceFloorLEDs.forEach((led, i) => {
                let r, g, b, intensity;
                
                // Phase-specific floor colors for immersion
                if (phase === 'darkness') {
                    // Minimal glow during blackout - just enough to see
                    r = 0.1; g = 0.1; b = 0.2;
                    intensity = 0.2 + Math.sin(time * 0.5) * 0.1;
                } else if (phase === 'strobe_attack') {
                    // White strobe sync with floor
                    const strobe = Math.sin(time * 20) > 0 ? 1 : 0;
                    r = g = b = strobe;
                    intensity = 1.0;
                } else if (phase === 'euphoria') {
                    // Warm golden pulse
                    const warmPhase = time * 1.2 + i * 0.5;
                    r = 1.0;
                    g = 0.7 + Math.sin(warmPhase) * 0.2;
                    b = 0.3;
                    intensity = 0.7 + bassLevel * 0.3;
                } else if (phase === 'laser_tunnel') {
                    // Match laser colors (cycling RGB)
                    const laserPhase = time * 0.5;
                    r = Math.sin(laserPhase) * 0.5 + 0.5;
                    g = Math.sin(laserPhase + 2.1) * 0.5 + 0.5;
                    b = Math.sin(laserPhase + 4.2) * 0.5 + 0.5;
                    intensity = 0.5 + midLevel * 0.5;
                } else if (phase === 'breakdown') {
                    // Soft purple/pink for romantic moment
                    r = 0.8; g = 0.3; b = 0.9;
                    intensity = 0.4 + Math.sin(time * 0.4) * 0.2;
                } else {
                    // Default: Color cycling with phase offset
                    const colorPhase = time * 0.8 + i * Math.PI / 2;
                    r = Math.sin(colorPhase) * 0.5 + 0.5;
                    g = Math.sin(colorPhase + Math.PI * 2 / 3) * 0.5 + 0.5;
                    b = Math.sin(colorPhase + Math.PI * 4 / 3) * 0.5 + 0.5;
                    intensity = 0.5 + bassLevel * 0.5;
                }
                
                led.material.emissiveColor.set(r * intensity, g * intensity, b * intensity);
            });
        }
    }

    /** Ceiling laser projectors: beam aiming, floor intersection and colouring. */
    updateLasers(ctx) {
        const { time, dtScale } = ctx;

        // ALWAYS SYNCHRONIZED MODE - no random mode
        // Spotlights always move together in coordinated patterns
        this.lightingMode = 'synchronized';
        
        // LASER COLOR SWITCHING: Only change automatically in AUTOMATED mode
        // In MANUAL mode: colors only change via VJ control button.
        // The 8-12 s threshold is drawn ONCE per interval. Re-drawing it every frame
        // meant ~240 samples raced the elapsed time inside the window, so the switch
        // collapsed to ~8.02 s with essentially zero variance - the randomness was
        // entirely illusory.
        if (this._laserColorInterval === undefined) this._laserColorInterval = 8 + Math.random() * 4;
        if (!this.vjManualMode && time - this.colorSwitchTime > this._laserColorInterval) {
            this.currentColorIndex = (this.currentColorIndex + 1) % 3; // RGB cycle
            this.colorSwitchTime = time;
            this._laserColorInterval = 8 + Math.random() * 4;
        }
        
        // Update lasers with raycasting and dynamic positioning
        if (this.lasers && this.lasersActive) {
            this.lasers.forEach((laser, i) => {
                // Update origin position for ALL lasers (parented and non-parented).
                // Parented lasers track the truss every frame; unparented lasers keep
                // whatever origin creation gave them. Either way we write into a
                // laser-owned vector - `.clone()` here allocated one Vector3 per laser
                // per frame purely to hold a value overwritten on the next frame.
                if (laser.parentTruss) {
                    if (!laser.originPos) laser.originPos = new BABYLON.Vector3(0, 0, 0);
                    laser.originPos.copyFrom(laser.housing.getAbsolutePosition());
                } else if (!laser.originPos) {
                    // Fallback if originPos wasn't set during creation
                    laser.originPos = laser.housing.getAbsolutePosition().clone();
                }
                
                // Movement depends on mode (apply laser speed multiplier)
                const speedMultiplier = (this.laserSpeed || 1.0) * dtScale;
                if (this.lightingMode === 'synchronized') {
                    laser.rotation += 0.015 * speedMultiplier;
                    laser.tiltPhase += 0.02 * speedMultiplier;
                } else {
                    laser.rotation += laser.rotationSpeed * speedMultiplier;
                    laser.tiltPhase += (0.015 + Math.sin(time + i) * 0.01) * speedMultiplier;
                }
                // Mark laser as spinning
                laser.isSpinning = true;
                
                // === LASER HOUSING STAYS STATIC ===
                // The housing/emitter fixture stays fixed - only the beam meshes animate
                // This prevents the visible "spinning box" effect
                // Real laser projectors have stationary housings with internal galvo mirrors
                
                // Clamp is static - housing stays fixed, beams animate independently
                
                // Update each beam in the laser
                laser.beams.forEach((beam) => {
                    // Shared scratch: `new BABYLON.Vector3(...)` per beam per frame
                    // was ~900 allocations/sec on its own.
                    const direction = this.vecPool.laserDir;

                    if (laser.type === 'single') {
                        // Single beam pointing down with movement
                        const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.3;
                        const dirX = Math.sin(laser.rotation) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(laser.rotation) * Math.sin(tilt);
                        direction.set(dirX, dirY, dirZ);
                        
                    } else if (laser.type === 'spread') {
                        // Spread laser (3 beams fanning out)
                        const spreadAngle = (beam.beamIndex - 1) * 0.4; // -0.4, 0, 0.4
                        const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.2;
                        const dirX = Math.sin(laser.rotation + spreadAngle) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(laser.rotation + spreadAngle) * Math.sin(tilt);
                        direction.set(dirX, dirY, dirZ);
                        
                    } else if (laser.type === 'multi') {
                        // Multi-beam (5 beams rotating in circle)
                        const baseAngle = (beam.beamIndex / 5) * Math.PI * 2;
                        const rotatingAngle = baseAngle + laser.rotation * 2;
                        const tilt = Math.PI / 5;
                        const dirX = Math.sin(rotatingAngle) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(rotatingAngle) * Math.sin(tilt);
                        direction.set(dirX, dirY, dirZ);
                    } else {
                        // Unknown fixture type - point straight down rather than
                        // leaving last frame's direction in the shared scratch.
                        direction.set(0, -1, 0);
                    }
                    
                    // SIMPLIFIED: Always calculate floor intersection directly
                    // This is more reliable than raycasting, especially in VR
                    // Raycasting can fail due to timing issues between eyes
                    
                    let beamLength = 50; // Default max length
                    
                    // Calculate floor intersection mathematically (always works, VR-safe)
                    if (direction.y < -0.01) {
                        // Laser pointing downward - calculate floor intersection
                        const distanceToFloor = laser.originPos.y / Math.abs(direction.y);
                        beamLength = Math.min(distanceToFloor, 50); // Cap at 50
                    }
                    
                    // Update beam geometry. copyFrom + addInPlace: the previous
                    // `originPos.add(direction.scale(...))` allocated two Vector3
                    // per beam per frame and replaced mesh.position wholesale,
                    // which also defeats Babylon's dirty tracking.
                    beam.mesh.scaling.y = beamLength;
                    direction.scaleToRef(beamLength * 0.5, this.vecPool.laserTmp);
                    beam.mesh.position.copyFrom(laser.originPos).addInPlace(this.vecPool.laserTmp);
                    
                    // Orient beam — QC O5: pool quaternion on the beam object so
                    // we don't allocate (3 lasers × 5 beams × 60 fps ≈ 900/sec).
                    this.vecPool.up.set(0, 1, 0);
                    BABYLON.Vector3.CrossToRef(this.vecPool.up, direction, this.vecPool.laserAxis);
                    // Clamp before acos. float32 normalisation routinely yields a dot of
                    // ±1.0000000000000002, whose acos is NaN - and because the quaternion
                    // is POOLED on the beam, one NaN poisons the world matrix permanently
                    // and the beam disappears until reload. Also note `direction` is NOT
                    // re-normalised here: it was already consumed above to place the beam.
                    const dot = Math.min(1, Math.max(-1, BABYLON.Vector3.Dot(this.vecPool.up, direction)));
                    const angle = Math.acos(dot);

                    if (!beam._rotQuat) beam._rotQuat = new BABYLON.Quaternion();
                    if (this.vecPool.laserAxis.length() > 0.001) {
                        this.vecPool.laserAxis.normalize();
                        BABYLON.Quaternion.RotationAxisToRef(this.vecPool.laserAxis, angle, beam._rotQuat);
                        beam.mesh.rotationQuaternion = beam._rotQuat;
                    } else {
                        // Straight up or straight down — use shared static quaternions
                        beam.mesh.rotationQuaternion =
                            (BABYLON.Vector3.Dot(this.vecPool.up, direction) > 0)
                                ? this._quatIdentity
                                : this._quatFlipX;
                    }
                    
                    // UPDATE GLOW BEAMS - Same position/rotation/scale as core
                    // QC O5: pool each glow mesh's quaternion + copyFrom (no allocation per frame).
                    if (beam.innerGlow) {
                        beam.innerGlow.scaling.y = beamLength;
                        beam.innerGlow.position.copyFrom(beam.mesh.position);
                        if (!beam._innerGlowQuat) beam._innerGlowQuat = new BABYLON.Quaternion();
                        beam._innerGlowQuat.copyFrom(beam.mesh.rotationQuaternion);
                        beam.innerGlow.rotationQuaternion = beam._innerGlowQuat;
                    }
                    if (beam.beamGlow) {
                        beam.beamGlow.scaling.y = beamLength;
                        beam.beamGlow.position.copyFrom(beam.mesh.position);
                        if (!beam._beamGlowQuat) beam._beamGlowQuat = new BABYLON.Quaternion();
                        beam._beamGlowQuat.copyFrom(beam.mesh.rotationQuaternion);
                        beam.beamGlow.rotationQuaternion = beam._beamGlowQuat;
                    }
                    
                    // Hit spots removed - no floor reflections needed
                    
                    // Color all beam elements with current color - HYPERREALISTIC color grading
                    let currentColor, innerGlowColor, outerGlowColor;
                    if (this.colorLockActive) {
                        currentColor = this.currentSpotColor;
                        innerGlowColor = this.currentSpotColor;
                        outerGlowColor = this.currentSpotColor;
                    } else if (this.currentColorIndex === 0) {
                        currentColor = this.cachedColors.red;
                        innerGlowColor = this.cachedLaserGlowColors.redInner;
                        outerGlowColor = this.cachedLaserGlowColors.redOuter;
                    } else if (this.currentColorIndex === 1) {
                        currentColor = this.cachedColors.green;
                        innerGlowColor = this.cachedLaserGlowColors.greenInner;
                        outerGlowColor = this.cachedLaserGlowColors.greenOuter;
                    } else {
                        currentColor = this.cachedColors.blue;
                        innerGlowColor = this.cachedLaserGlowColors.blueInner;
                        outerGlowColor = this.cachedLaserGlowColors.blueOuter;
                    }
                    
                    // Apply color to core beam - pure saturated color
                    if (!beam._emissiveBuf) beam._emissiveBuf = new BABYLON.Color3(0, 0, 0);
                    currentColor.scaleToRef(this.isInVRMode ? 5.0 : 2.5, beam._emissiveBuf);
                    beam.material.emissiveColor = beam._emissiveBuf;
                    beam.mesh.visibility = 1.0;
                    
                    // Apply inner glow color (tight halo)
                    if (beam.innerGlowMat) {
                        beam.innerGlowMat.emissiveColor = innerGlowColor;
                    }
                    if (beam.innerGlow) {
                        beam.innerGlow.visibility = 1.0;
                    }
                    
                    // Apply outer glow color (atmospheric scatter)
                    if (beam.glowMat) {
                        beam.glowMat.emissiveColor = outerGlowColor;
                    }
                    if (beam.beamGlow) {
                        beam.beamGlow.visibility = 1.0;
                    }
                    
                    // Hit spot materials no longer updated (spots are hidden)
                });
                
                // Update lights and emitter color - Now updates every frame for sync with beams
                // Get current color based on color index
                let currentLaserColor, currentEmissiveColor, currentBrightColor;
                if (this.colorLockActive) {
                    currentLaserColor = this.currentSpotColor;
                    currentEmissiveColor = this.currentSpotColor;
                    currentBrightColor = this.currentSpotColor;
                } else if (this.currentColorIndex === 0) {
                    currentLaserColor = this.cachedColors.red;
                    currentEmissiveColor = this.cachedLaserGlowColors.redEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.redBright;
                } else if (this.currentColorIndex === 1) {
                    currentLaserColor = this.cachedColors.green;
                    currentEmissiveColor = this.cachedLaserGlowColors.greenEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.greenBright;
                } else {
                    currentLaserColor = this.cachedColors.blue;
                    currentEmissiveColor = this.cachedLaserGlowColors.blueEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.blueBright;
                }
                
                // Update light diffuse color (if lights exist - disabled for performance)
                laser.lights.forEach((light) => {
                    if (light) {
                        light.diffuse = currentLaserColor;
                        light.intensity = this.lasersActive ? 5 : 0;
                    }
                });
                
                // Update housing glow with current color
                if (laser.housingMat) {
                    laser.housingMat.emissiveColor = this.lasersActive ? currentEmissiveColor : this.cachedColors.black;
                }
                
                // Update emitter to match beam color - this is the visible light source
                if (laser.emitterMat) {
                    laser.emitterMat.emissiveColor = this.lasersActive ? currentBrightColor : this.cachedColors.black;
                }
            });
        } else if (this.lasers) {
            // Turn off lasers when not active (e.g., when laser sheet is on)
            this.lasers.forEach(laser => {
                laser.lights.forEach(light => {
                    if (light) light.intensity = 0;
                });
                laser.beams.forEach(beam => {
                    beam.mesh.visibility = 0;
                    beam.material.alpha = 0;
                    if (beam.innerGlow) beam.innerGlow.visibility = 0;
                    if (beam.beamGlow) beam.beamGlow.visibility = 0;
                    if (beam.hitSpot) beam.hitSpot.visibility = 0;
                    if (beam.hitGlow) beam.hitGlow.visibility = 0;
                });
                // Also turn off emitter when lasers are off
                if (laser.emitterMat) {
                    laser.emitterMat.emissiveColor = this.cachedColors.black;
                }
                if (laser.housingMat) {
                    laser.housingMat.emissiveColor = this.cachedColors.black;
                }
            });
        }
        
        // Make laser beams visible only when spinning AND lasers are active
        if (this.lasers) {
            this.lasers.forEach(laser => {
                laser.beams.forEach(beam => {
                    // Only show beams if laser is actively spinning AND lasersActive is true
                    if (laser.isSpinning && this.lasersActive) {
                        beam.mesh.visibility = 1;
                        beam.material.alpha = 0.6;
                        if (beam.innerGlow) beam.innerGlow.visibility = 1;
                        if (beam.beamGlow) beam.beamGlow.visibility = 1;
                    } else {
                        // Turn off ALL beam components when not spinning or lasers disabled
                        beam.mesh.visibility = 0;
                        beam.material.alpha = 0;
                        if (beam.innerGlow) beam.innerGlow.visibility = 0;
                        if (beam.beamGlow) beam.beamGlow.visibility = 0;
                        if (beam.hitSpot) beam.hitSpot.visibility = 0;
                        if (beam.hitGlow) beam.hitGlow.visibility = 0;
                    }
                });
                // Reset spinning flag for next frame
                laser.isSpinning = false;
            });
        }
    }

    /** Spotlight palette: pick the next colour and ease between palette entries. */
    updateSpotColorCycle(ctx) {
        const { time, dt } = ctx;

        // Update spotlights with synchronized movement patterns (AUDIO REACTIVE)
        // ONLY auto-change color when NOT in VJ manual mode
        // Manual mode allows VJ to lock in their chosen color
        // HYPERREALISTIC: Color change interval varies with energy level
        // High energy (drops) = rapid color changes (2-4s)
        // Low energy (ambient) = slow color changes (8-12s)
        const colorChangeInterval = this.vjDropActive ? 2 : (12 - (this.energyLevel * 8));
        if (!this.vjManualMode && time - this.lastColorChange > colorChangeInterval) {
            this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
            
            // SMOOTH COLOR TRANSITION: Store previous color for interpolation.
            // copyFrom into our own buffer - cloning allocated a Color3 per switch and
            // assigning would alias the shared palette.
            this.previousSpotColor.copyFrom(this.currentSpotColor);
            this.targetSpotColor = this.spotColorList[this.spotColorIndex];
            this.colorTransitionProgress = 0; // Start transition
            this.lastColorChange = time;
            
            // Update ALL lights to new color target
            if (this.spotlights) {
                this.spotlights.forEach((spot) => {
                    // Update color reference - fixture materials updated in animation loop
                    spot.color = this.targetSpotColor;
                });
            }
        }
        
        // SMOOTH COLOR INTERPOLATION: Fade between colors over 0.42-0.83 seconds
        // This creates the smooth, professional color transitions seen in real clubs
        if (this.colorTransitionProgress !== undefined && this.colorTransitionProgress < 1) {
            // Progress per SECOND, not per frame. The old bare increment made the
            // documented "0.5-1.0 s" fade take 0.42 s at 120 Hz and 1.67 s at 30 Hz.
            const transitionPerSecond = this.vjDropActive ? 2.4 : 1.2;
            this.colorTransitionProgress = Math.min(1, this.colorTransitionProgress + transitionPerSecond * dt);
            
            // Smooth easing for natural feel
            const t = this.colorTransitionProgress;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
            
            // Interpolate RGB channels in place - this runs every frame for the whole
            // duration of a fade, so allocating here cost ~60 Color3/sec of GC churn.
            if (this.previousSpotColor && this.targetSpotColor) {
                const p = this.previousSpotColor;
                const q = this.targetSpotColor;
                this.currentSpotColor.copyFromFloats(
                    p.r + (q.r - p.r) * eased,
                    p.g + (q.g - p.g) * eased,
                    p.b + (q.b - p.b) * eased
                );
            }
        }
        
        // Check if VJ manual mode should expire (60 seconds of no interaction)
        if (this.vjManualMode && (time - this.lastVJInteraction) > this.VJ_TIMEOUT) {
            this.vjManualMode = false;
            this.spotlightPattern = 0; // Switch to automated pattern
            log.info("🤖 Automated patterns resumed - no VJ interaction for 60 seconds");
        }
    }

    /** Moving-head spotlights: pan/tilt, beams, floor pools, gobos and fixtures. */
    updateSpotlights(ctx) {
        const { time, dtScale, audio: audioData } = ctx;

        // === MODULAR SPOTLIGHT SYSTEM UPDATE ===
        // When useModularSystems is enabled, delegate to SpotlightSystem module
        if (this.useModularSystems && this.systems.spotlight) {
            // Sync state from VJ controls to modular system
            this.systems.spotlight.lightsActive = this.lightsActive;
            this.systems.spotlight.spotlightSpeed = this.spotlightSpeed || 1.0;
            this.systems.spotlight.spotlightMode = this.spotlightMode;
            this.systems.spotlight.spotlightPattern = this.spotlightPattern;
            this.systems.spotlight.spotStrobeActive = this.spotStrobeActive;
            
            // Sync color changes
            if (this.currentSpotColor) {
                this.systems.spotlight.currentSpotColor = this.currentSpotColor;
            }
            
            // Update modular system
            this.systems.spotlight.update(time, audioData);
            
            // Sync spotlights reference back for compatibility
            this.spotlights = this.systems.spotlight.spotlights;
        } else {
            // === LEGACY INLINE SPOTLIGHT ANIMATION ===
            // Calculate global phase for spotlight patterns (used in multiple places)
            // Phase ALWAYS advances when lights are active (for sweep animations)
            // VJ manual mode only affects Pattern 0's auto-cycling between sub-patterns
            if (this.lightsActive) {
                this.lastActivePhase = time * 0.8; // Always update when lights on
            }
            const globalPhase = this.lastActivePhase || 0;
        
        // Audio speed multiplier: only apply when actual audio is playing
        // When no audio: use default 1.0x speed for consistent automated patterns
        const audioSpeedMultiplier = audioData.hasAudio 
            ? 1.0 + (audioData.average * 0.5) // 1.0x to 1.5x based on audio energy
            : 1.0; // No audio = consistent timing
        
        if (this.spotlights && this.lightsActive) {
            
            // SYNCHRONIZED SWEEPING - recreate iconic club vibe
            // All lights move together, sweeping their beams across the dance floor
            
            this.spotlights.forEach((spot, i) => {
                let dirX, dirZ;
                
                // VJ PATTERN CONTROL - spotlightPattern: 0=random, 1=static down, 2=mirror sweep, 3=crossed beams
                // Apply speed multiplier to all animated patterns
                const speedMultiplier = this.spotlightSpeed || 1.0;
                
                if (this.spotlightPattern === 1) {
                    // PATTERN 1: STATIC DOWN - All lights point straight down
                    dirX = 0;
                    dirZ = 0;
                    
                } else if (this.spotlightPattern === 2) {
                    // PATTERN 2: MIRROR SWEEP - Left and right sides sweep toward/away from each other
                    // Creates synchronized converging (toward center) and diverging (away from center) motion
                    const sweepPhase = globalPhase * speedMultiplier;
                    const sweepValue = Math.sin(sweepPhase * 0.5) * 0.7; // Slower, wider sweep
                    
                    // Layout: Left side (i=0,1,2) at x=-8, Right side (i=3,4,5) at x=8
                    // When sweepValue > 0: both sides point INWARD (converging toward center)
                    // When sweepValue < 0: both sides point OUTWARD (diverging from center)
                    const isLeftSide = (i < 3);
                    // Left side: positive sweepValue = point right (+X toward center)
                    // Right side: negative sweepValue = point left (-X toward center)
                    dirX = isLeftSide ? sweepValue : -sweepValue;
                    
                    // Also add slight Z oscillation so beams sweep front-to-back together
                    const zSweep = Math.sin(sweepPhase * 0.3) * 0.25;
                    dirZ = zSweep;
                    
                } else if (this.spotlightPattern === 3) {
                    // PATTERN 3: CROSSED BEAMS - Outer gobos cross over middle gobo
                    // Each side has 3 lights: front (0,3), middle (1,4), back (2,5)
                    // The front and back gobos sweep across, crossing over the middle one
                    const sweepPhase = globalPhase * speedMultiplier;
                    const crossSweep = Math.sin(sweepPhase * 0.4) * 0.8; // Wide crossing motion
                    
                    const isLeftSide = (i < 3);
                    const positionInGroup = i % 3; // 0=front, 1=middle, 2=back
                    
                    if (positionInGroup === 1) {
                        // MIDDLE gobo: Points straight down/slightly forward - stationary anchor
                        dirX = 0;
                        dirZ = -0.2; // Slight forward angle toward dance floor
                    } else if (positionInGroup === 0) {
                        // FRONT gobo: Sweeps from outside to inside and back
                        // When crossing, it goes PAST the middle gobo position
                        dirX = isLeftSide ? crossSweep : -crossSweep;
                        dirZ = -0.35 + Math.abs(crossSweep) * 0.2; // More forward when at extremes
                    } else {
                        // BACK gobo: Sweeps opposite to front (counter-phase)
                        // This creates an X pattern when viewed from above
                        dirX = isLeftSide ? -crossSweep : crossSweep; // Opposite of front
                        dirZ = 0.1 - Math.abs(crossSweep) * 0.15; // Slightly back, less when crossing
                    }
                    
                } else {
                    // PATTERN 0: RANDOM/AUTOMATED (default) - Complex pattern cycling
                    
                    // SPOTLIGHT MODE CONTROL
                    // Mode 0: strobe+sweep, Mode 1: sweep only, Mode 2: strobe static, Mode 3: static
                    const isSweepMode = (this.spotlightMode === 0 || this.spotlightMode === 1);
                    
                    // SYNCHRONIZED SWEEPING: All lights sweep together continuously
                    // SMOOTH pattern transitions - patterns blend into each other naturally
                    const sweepPhase = globalPhase * audioSpeedMultiplier * speedMultiplier;
                    
                    // Slow pattern selector that cycles through patterns smoothly
                    // Each pattern lasts ~10 seconds with smooth transitions
                    const patternCycle = (sweepPhase / 10) % 7; // 0-7, smoothly increasing
                    const currentPattern = Math.floor(patternCycle);
                    const nextPattern = (currentPattern + 1) % 7;
                    const blendFactor = patternCycle - currentPattern; // 0-1 smooth blend
                    
                    // MAX 45 DEGREES = tan(45°) ≈ 1.0, so dirX and dirZ should be ≤ 0.6 for smooth angles
                    // Calculate current and next pattern positions, then blend
                    
                    let dirX1 = 0, dirZ1 = 0; // Current pattern
                    let dirX2 = 0, dirZ2 = 0; // Next pattern
                    
                    if (!isSweepMode) {
                        // Static mode: use fixed positions based on spotlight index
                        const staticPos = this._spotStaticPositions[i % this._spotStaticPositions.length];
                        dirX = staticPos.x;
                        dirZ = staticPos.z;
                    } else {
                        // Sweep mode: calculate animated pattern positions
                        // Calculate CURRENT pattern position - SLOWER for IMMERSIVE feel
                        if (currentPattern === 0) {
                        // Linear sweep left to right - SMOOTH
                        dirX1 = Math.sin(sweepPhase * 0.6) * 0.6; // Slower (1.6 → 0.6)
                        dirZ1 = -0.3;
                } else if (currentPattern === 1) {
                    // Circular sweep - ELEGANT
                    dirX1 = Math.sin(sweepPhase * 0.5) * 0.5; // Slower (1.2 → 0.5)
                    dirZ1 = Math.cos(sweepPhase * 0.5) * 0.5;
                } else if (currentPattern === 2) {
                    // Fan sweep - GENTLE
                    const fanPhase = Math.sin(sweepPhase * 0.4); // Slower (1.0 → 0.4)
                    dirX1 = fanPhase * 0.6;
                    dirZ1 = -0.2;
                } else if (currentPattern === 3) {
                    // Cross sweep - FLOWING
                    dirX1 = Math.sin(sweepPhase * 0.6) * 0.5; // Slower (1.4 → 0.6)
                    dirZ1 = Math.cos(sweepPhase * 0.6) * 0.5;
                } else if (currentPattern === 4) {
                    // Figure-8 sweep - HYPNOTIC
                    dirX1 = Math.sin(sweepPhase * 0.4) * 0.6; // Slower (1.0 → 0.4)
                    dirZ1 = Math.sin(sweepPhase * 0.8) * 0.4; // Slower (2.0 → 0.8)
                } else if (currentPattern === 5) {
                    // Pulse sweep - BREATHING
                    const pulsePhase = Math.sin(sweepPhase * 0.3); // Slower (0.8 → 0.3)
                    const angle = sweepPhase * 0.2; // Slower (0.6 → 0.2)
                    dirX1 = pulsePhase * Math.cos(angle) * 0.6;
                    dirZ1 = pulsePhase * Math.sin(angle) * 0.6;
                } else {
                    // STROBE FLASHING - static center position
                    dirX1 = 0;
                    dirZ1 = 0;
                }
                
                // Calculate NEXT pattern position - SLOWER for IMMERSIVE feel
                if (nextPattern === 0) {
                    dirX2 = Math.sin(sweepPhase * 0.6) * 0.6; // Slower
                    dirZ2 = -0.3;
                } else if (nextPattern === 1) {
                    dirX2 = Math.sin(sweepPhase * 0.5) * 0.5; // Slower
                    dirZ2 = Math.cos(sweepPhase * 0.5) * 0.5;
                } else if (nextPattern === 2) {
                    const fanPhase = Math.sin(sweepPhase * 0.4); // Slower
                    dirX2 = fanPhase * 0.6;
                    dirZ2 = -0.2;
                } else if (nextPattern === 3) {
                    dirX2 = Math.sin(sweepPhase * 0.6) * 0.5; // Slower
                    dirZ2 = Math.cos(sweepPhase * 0.6) * 0.5;
                } else if (nextPattern === 4) {
                    dirX2 = Math.sin(sweepPhase * 0.4) * 0.6; // Slower
                    dirZ2 = Math.sin(sweepPhase * 0.8) * 0.4; // Slower
                } else if (nextPattern === 5) {
                    const pulsePhase = Math.sin(sweepPhase * 0.3); // Slower
                    const angle = sweepPhase * 0.2; // Slower
                    dirX2 = pulsePhase * Math.cos(angle) * 0.6;
                    dirZ2 = pulsePhase * Math.sin(angle) * 0.6;
                } else {
                    dirX2 = 0;
                    dirZ2 = 0;
                }
                
                        // SMOOTH BLEND between patterns - no jumps!
                        dirX = dirX1 * (1 - blendFactor) + dirX2 * blendFactor;
                        dirZ = dirZ1 * (1 - blendFactor) + dirZ2 * blendFactor;
                    } // End sweep mode else block
                } // End pattern 0 (random/automated) else block
                
                // Set direction (pointing from truss DOWN to dance floor)
                // Direction should always have strong downward component (negative Y)
                // PERFORMANCE: Reuse Vector3 from pool instead of creating new one
                this.vecPool.direction.set(dirX, -1.5, dirZ).normalize();
                spot.light.direction.copyFrom(this.vecPool.direction);
                
                // Local reference for moving head animation (avoid repeated property access)
                const direction = this.vecPool.direction;
                
                // Dynamic beam angle (simulates zoom adjustment) - subtle variation
                const baseAngle = Math.PI / 6; // 30 degrees base
                const angleVariation = Math.sin(time * 0.3 + i * 0.5) * 0.1; // ±6 degrees
                spot.light.angle = baseAngle + angleVariation;
                
                // === HYPERREALISTIC MOVING HEAD ANIMATION ===
                // Professional moving heads have pan (Y-axis) and tilt (X/Z-axis) motors
                // We rotate the Yoke (Pan) and Head (Tilt) separately for mechanical realism
                // Using smooth interpolation to simulate realistic servo motor movement
                
                if (spot.yoke && spot.head) {
                    // 1. PAN (Yoke Rotation around Y)
                    // Calculate target angle on XZ plane. atan2(x, z) gives angle from Z axis.
                    const targetPanAngle = Math.atan2(direction.x, direction.z);
                    
                    // SMOOTH INTERPOLATION: Simulate realistic servo motor speed (~60°/s)
                    // This prevents jarring instant movements and adds mechanical realism.
                    // FRAME-RATE INDEPENDENCE: a bare `+= diff * 0.15` converges 2x faster
                    // at 120 Hz than at 60 Hz, so the heads visibly snapped on a Quest and
                    // lagged under thermal throttling. Compounding the per-60fps-frame
                    // retention rate over dtScale frames keeps the settling time constant.
                    const panLerpSpeed = 1 - Math.pow(1 - 0.15, dtScale);
                    
                    // Handle angle wrapping for smooth pan rotation
                    let panDiff = targetPanAngle - spot.yoke.rotation.y;
                    if (panDiff > Math.PI) panDiff -= Math.PI * 2;
                    if (panDiff < -Math.PI) panDiff += Math.PI * 2;
                    
                    spot.yoke.rotation.y += panDiff * panLerpSpeed;

                    // 2. TILT (Head Rotation around X)
                    // Calculate target angle from vertical (down).
                    // acos(-direction.y) gives 0 when pointing down (-1), PI/2 when horizontal (0).
                    // We use negative angle because positive rotation moves -Y to -Z (Back),
                    // but we want to move -Y to +Z (Forward) relative to the Yoke.
                    const targetTiltAngle = -Math.acos(-direction.y);
                    
                    // SMOOTH INTERPOLATION for tilt (same realistic servo simulation),
                    // likewise compounded over dtScale so tilt speed is device-independent.
                    const tiltLerpSpeed = 1 - Math.pow(1 - 0.12, dtScale);
                    spot.head.rotation.x += (targetTiltAngle - spot.head.rotation.x) * tiltLerpSpeed;
                    
                    // Note: Lens/bezel/flare/beam are children of the head and move automatically!
                    
                    // === HYPERREALISTIC FLARE RESPONSE ===
                    // Update flare intensity based on viewing angle AND movement speed
                    // Moving heads create more light scatter/flare when sweeping quickly
                    const viewCamera = this.isInVRMode ? this.scene.activeCamera : this.camera;
                    if (spot.flareMat && viewCamera) {
                        const viewPosition = viewCamera.globalPosition || viewCamera.position;
                        viewPosition.subtractToRef(spot.basePos, this.vecPool.temp1);
                        const cameraDir = this.vecPool.temp1.normalize();
                        const dot = BABYLON.Vector3.Dot(cameraDir, direction);
                        const viewBrightness = Math.pow(Math.max(0, dot), 8);
                        
                        // Calculate movement speed for dynamic flare (brighter when moving)
                        // Store previous direction for speed calculation
                        if (!spot.prevDirection) spot.prevDirection = direction.clone();
                        const movementSpeed = BABYLON.Vector3.Distance(direction, spot.prevDirection);
                        spot.prevDirection.copyFrom(direction);
                        
                        // Dynamic flare: base visibility + viewing angle + movement boost
                        const movementBoost = Math.min(0.08, movementSpeed); // Cap subtle servo scatter
                        spot.flareMat.alpha = this.lightsActive
                            ? 0.04 + viewBrightness * (this.isInVRMode ? 0.96 : 0.72) + movementBoost
                            : 0;
                        
                        // Movement glow boost is now handled in main fixture update loop
                        // Store movement speed for fixture update to use
                        spot.movementSpeed = movementSpeed;
                    }
                } else if (spot.fixture) {
                    // Fallback for legacy fixtures (if any)
                    if (!spot._targetPoint) spot._targetPoint = new BABYLON.Vector3();
                    direction.scaleToRef(8, spot._targetPoint);
                    spot.basePos.addToRef(spot._targetPoint, spot._targetPoint);
                    spot.fixture.lookAt(spot._targetPoint);
                }
                
                // PROFESSIONAL VOLUMETRIC BEAM - Hyperrealistic light cone
                // The beam must VISUALLY CONNECT to the floor light pool for realism
                if (spot.beam) {
                    // Get the actual world position of the light emission point (lens position)
                    // This correctly accounts for head tilt and rotation
                    if (!spot._emissionPoint) {
                        spot._emissionPoint = new BABYLON.Vector3();
                        spot._lensOffset = new BABYLON.Vector3(0, -0.28, 0);
                        spot._transformedLensOffset = new BABYLON.Vector3();
                        spot._surfaceIntersection = new BABYLON.Vector3();
                        spot._scaledDirection = new BABYLON.Vector3();
                        spot._beamMidpoint = new BABYLON.Vector3();
                    }
                    const emissionPoint = spot._emissionPoint;
                    if (spot.lens) {
                        // Use lens mesh's actual world position (correct for any tilt angle)
                        emissionPoint.copyFrom(spot.lens.getAbsolutePosition());
                    } else if (spot.head) {
                        // Fallback: Get head's world position and transform lens offset by rotation
                        const headPos = spot.head.getAbsolutePosition();
                        // Transform offset by head's world rotation matrix
                        const headWorldMatrix = spot.head.getWorldMatrix();
                        BABYLON.Vector3.TransformNormalToRef(
                            spot._lensOffset,
                            headWorldMatrix,
                            spot._transformedLensOffset
                        );
                        headPos.addToRef(spot._transformedLensOffset, emissionPoint);
                    } else {
                        emissionPoint.copyFrom(spot.basePos);
                    }
                    
                    // Calculate where beam centerline intersects surfaces (floor and walls)
                    // Use closest intersection for pool positioning
                    let centerDistanceToSurface;
                    const surfaceIntersection = spot._surfaceIntersection;
                    let hitSurface = 'floor'; // 'floor', 'backWall', 'leftWall', 'rightWall'
                    
                    // Club boundaries. Sourced from ROOM_BOUNDS (01-core.js) rather than
                    // re-derived: the previous literals (-25.8 / ±10) disagreed with the
                    // geometry actually built, so beams terminated 2.5 m short of the side
                    // walls and 4.8 m behind the back wall.
                    const BACK_WALL_Z = ROOM_BOUNDS.z.min;
                    const LEFT_WALL_X = ROOM_BOUNDS.x.min;
                    const RIGHT_WALL_X = ROOM_BOUNDS.x.max;
                    
                    // Calculate distances to each surface (only if beam is heading toward it)
                    let distToFloor = Infinity;
                    let distToBackWall = Infinity;
                    let distToLeftWall = Infinity;
                    let distToRightWall = Infinity;
                    
                    // Floor intersection (beam pointing down)
                    if (direction.y < -0.01) {
                        distToFloor = emissionPoint.y / Math.abs(direction.y);
                    }
                    
                    // Back wall intersection (beam pointing back/negative Z)
                    if (direction.z < -0.01) {
                        distToBackWall = (emissionPoint.z - BACK_WALL_Z) / Math.abs(direction.z);
                    }
                    
                    // Left wall intersection (beam pointing left/negative X)
                    if (direction.x < -0.01) {
                        distToLeftWall = (emissionPoint.x - LEFT_WALL_X) / Math.abs(direction.x);
                    }
                    
                    // Right wall intersection (beam pointing right/positive X)
                    if (direction.x > 0.01) {
                        distToRightWall = (RIGHT_WALL_X - emissionPoint.x) / direction.x;
                    }
                    
                    // Find closest surface hit
                    centerDistanceToSurface = distToFloor;
                    hitSurface = 'floor';
                    
                    if (distToBackWall < centerDistanceToSurface && distToBackWall > 0) {
                        centerDistanceToSurface = distToBackWall;
                        hitSurface = 'backWall';
                    }
                    if (distToLeftWall < centerDistanceToSurface && distToLeftWall > 0) {
                        centerDistanceToSurface = distToLeftWall;
                        hitSurface = 'leftWall';
                    }
                    if (distToRightWall < centerDistanceToSurface && distToRightWall > 0) {
                        centerDistanceToSurface = distToRightWall;
                        hitSurface = 'rightWall';
                    }
                    
                    // Cap at reasonable maximum
                    if (centerDistanceToSurface === Infinity || centerDistanceToSurface > 20) {
                        centerDistanceToSurface = 15;
                    }
                    
                    // Calculate intersection point
                    direction.scaleToRef(centerDistanceToSurface, spot._scaledDirection);
                    emissionPoint.addToRef(spot._scaledDirection, surfaceIntersection);
                    
                    // HYPERREALISTIC BEAM: Extend beam PAST floor so cone edges touch floor
                    // 
                    // When a cone is tilted, the "uphill" edge of the cone needs to travel
                    // further to reach the floor. We extend the beam past the floor intersection
                    // so ALL edges of the cone touch the floor.
                    //
                    // HYPERREALISTIC BEAM: Extend past floor so cone edges touch, then clip
                    // When a cone hits floor at angle, the "uphill" edge needs to travel further
                    //
                    // Base beam length from emission to surface intersection (centerline)
                    const centerBeamLength = centerDistanceToSurface;
                    
                    // Calculate tilt angle (used for extension and pool ellipse)
                    const cosTheta = Math.abs(direction.y);
                    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                    const tanTheta = cosTheta > 0.1 ? sinTheta / cosTheta : 0;
                    
                    // Cone radius at surface end (from mesh: diameterTop=1.5, so radius=0.75)
                    const coneRadius = 0.75;
                    
                    // Extension needed for uphill edge to reach surface: r * tan(θ)
                    // For floor: extends cone past floor so edges touch
                    // For walls: extend slightly so beam visually connects to wall surface
                    let uphillExtension;
                    if (hitSurface === 'floor') {
                        uphillExtension = coneRadius * tanTheta;
                    } else {
                        // Wall hits: extend beam slightly past wall for visual connection
                        // Use perpendicular angle to the wall for extension calc
                        let wallCos;
                        if (hitSurface === 'backWall') wallCos = Math.abs(direction.z);
                        else wallCos = Math.abs(direction.x); // left/right walls
                        const wallTan = wallCos > 0.1 ? Math.sqrt(1 - wallCos * wallCos) / wallCos : 0;
                        uphillExtension = coneRadius * wallTan * 0.5; // Half extension for walls
                    }
                    
                    // BEAM LENGTH: Extend past surface so cone edges visually touch
                    const beamLength = Math.min(18, Math.max(2, centerBeamLength + uphillExtension));
                    
                    // Store beamLength on spot for pool calculations
                    spot.currentBeamLength = beamLength;
                    
                    // Position beam: Cylinder is centered at its origin
                    // After rotation, one end will be at emission point, other past floor
                    // 
                    // BABYLON cylinder: local +Y is "top" (diameterTop), local -Y is "bottom" (diameterBottom)
                    // We created: diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // We want: wide end toward/past floor, narrow end at fixture (emission point)
                    // So: local +Y should point TOWARD FLOOR (same as direction)
                    //
                    // Cylinder extends from center: -height/2 to +height/2 in local Y
                    // After scaling.y = beamLength: from -beamLength/2 to +beamLength/2
                    // After rotation (local +Y = direction):
                    //   - Local +Y end (wide) is at: center + direction * beamLength/2 
                    //   - Local -Y end (narrow) is at: center - direction * beamLength/2 (should be at emission)
                    //
                    // So center should be at: emissionPoint + direction * beamLength/2
                    const beamMidpoint = spot._beamMidpoint;
                    beamMidpoint.set(
                        emissionPoint.x + direction.x * (beamLength * 0.5),
                        emissionPoint.y + direction.y * (beamLength * 0.5),
                        emissionPoint.z + direction.z * (beamLength * 0.5)
                    );
                    
                    // Position beam at calculated midpoint
                    spot.beam.position.copyFrom(beamMidpoint);
                    
                    // Orient beam to point from emission toward floor
                    // The cylinder's local +Y points "up". We rotate it so +Y aligns with our direction.
                    // But we want narrow end (diameterBottom) at emission, wide end (diameterTop) at floor.
                    // Cylinder is created with diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // Default: +Y is top (wide). We need +Y to point TOWARD floor (where wide end should be).
                    // direction points FROM emission TOWARD floor - that's exactly what we want for +Y!
                    
                    // Use lookAt toward floor intersection, then rotate 90° to align cylinder axis
                    // Actually, easier: compute rotation directly from direction vector
                    // Cylinder: diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // We want WIDE end at FLOOR, NARROW end at fixture
                    // So cylinder +Y (diameterTop) should point TOWARD floor (same as direction)
                    // QC O5: pool the rotation axis + per-spot rotation quaternion so we
                    // don't allocate ~480 objects/sec across the 6 spotlights.
                    this.vecPool.up.set(0, 1, 0);
                    // Clamped: see the matching note on the laser beam path. An unclamped
                    // acos of a float32 dot product returns NaN, which permanently
                    // poisons this spot's POOLED quaternion and deletes the beam.
                    const spotDot = Math.min(1, Math.max(-1, BABYLON.Vector3.Dot(direction, this.vecPool.up)));
                    const angle = Math.acos(spotDot);
                    BABYLON.Vector3.CrossToRef(this.vecPool.up, direction, this.vecPool.spotAxis);
                    const axisLen = this.vecPool.spotAxis.length();

                    if (axisLen > 0.001) {
                        this.vecPool.spotAxis.scaleInPlace(1 / axisLen); // normalize in place
                        if (!spot._rotQuat) spot._rotQuat = new BABYLON.Quaternion();
                        BABYLON.Quaternion.RotationAxisToRef(this.vecPool.spotAxis, angle, spot._rotQuat);
                        spot.beam.rotationQuaternion = spot._rotQuat;
                    } else if (direction.y > 0) {
                        // Pointing up (away from floor) - no flip needed (narrow end up is correct)
                        spot.beam.rotationQuaternion = this._quatIdentity;
                    } else {
                        // Pointing straight down - FLIP 180° so wide end (diameterTop) goes to floor
                        spot.beam.rotationQuaternion = this._quatFlipX;
                    }
                    
                    // UPDATE BEAM LENGTH
                    spot.beam.scaling.y = beamLength;
                    
                    // HYPERREALISTIC: Update clip plane based on hit surface
                    // This hides any part of the beam that extends past the surface.
                    //
                    // Convention (StandardMaterial clipPlane4): a fragment is DISCARDED where
                    //   N·worldPos + d > 0
                    // So for each surface we pick (N, d) such that the half-space we want to
                    // hide (the side past the surface) evaluates positive.
                    //
                    // BUG HISTORY: previous version used `-WALL + 0.01` for d which only
                    // produces a sane plane when WALL is positive (right wall). For walls
                    // at negative coordinates (left wall, back wall) the sign flipped and
                    // the entire beam got clipped — visible as left-side beams disappearing
                    // when aimed at the side wall.
                    if (spot.beamMat) {
                        const EPS = 0.01;
                        // Lazy-init per-spot cached planes (one allocation total instead of one per frame)
                        if (!spot._clipPlanes) {
                            spot._clipPlanes = {
                                floor:     new BABYLON.Plane(0, -1, 0, EPS),
                                backWall:  new BABYLON.Plane(0, 0, -1, BACK_WALL_Z - EPS),
                                leftWall:  new BABYLON.Plane(-1, 0, 0, LEFT_WALL_X - EPS),
                                rightWall: new BABYLON.Plane(1, 0, 0, -RIGHT_WALL_X - EPS)
                            };
                        }
                        spot.beamMat.clipPlane4 = spot._clipPlanes[hitSurface] || spot._clipPlanes.floor;
                    }
                    
                    // ANIMATE SMOKE TEXTURE (Hyperrealism)
                    if (spot.beamMat && spot.beamMat.emissiveTexture) {
                        // Much slower animation for realistic drifting haze (was 0.02)
                        spot.beamMat.emissiveTexture.vOffset -= 0.002 * speedMultiplier * dtScale;
                        // Slight horizontal drift for turbulence
                        spot.beamMat.emissiveTexture.uOffset += 0.0005 * Math.sin(time * 0.5 + i) * dtScale;
                    }

                    // ANIMATE GOBO ROTATION (Hyperrealism)
                    if (spot.lightPool) {
                        spot.lightPool.rotation.z += 0.01 * speedMultiplier * dtScale;
                    }
                    
                    // REMOVED: Old local positioning code (now using world space)
                    // Beam is positioned at beamMidpoint with quaternion rotation above
                    
                    // HYPERREALISTIC: Stretch beam cone when hitting floor at angle
                    // The cone's base (diameterTop) expands into an ellipse on the floor
                    // We approximate this by scaling the cylinder wider in the tilt direction
                    // Note: cosTheta already calculated above for beam extension
                    const tiltStretch = 1.0 / Math.max(0.4, cosTheta); // How much to stretch due to angle
                    
                    // Scale beam: X/Z control diameter, Y controls length
                    // When tilted, the cone appears wider in the tilt direction
                    const baseScale = 1.0;
                    spot.beam.scaling.x = baseScale;
                    spot.beam.scaling.z = baseScale * Math.min(1.3, tiltStretch); // Subtle stretch in Z (forward/back)
                    
                    // UPDATE GLOW BEAM - Match main beam positioning (unparent and world space)
                    // Beam visibility and color - HYPERREALISTIC with subtle variation + FLASHING
                    // Strobe is controlled by both toggle button AND spotlight mode
                    const sweepPhase = globalPhase * audioSpeedMultiplier;
                    
                    // Strobe is active when: button is on AND mode includes strobe (0 or 2)
                    const isStrobeMode = (this.spotlightMode === 0 || this.spotlightMode === 2);
                    const isStrobeEnabled = !this.photosensitiveSafeMode && this.spotStrobeActive && isStrobeMode;
                    
                    let beamVisible = this.lightsActive;
                    if (isStrobeEnabled) {
                        // STROBE: Rapid on/off flashing at 8Hz (8 flashes per second)
                        const flashPhase = sweepPhase * 2.5;
                        const flashOn = Math.floor(flashPhase * 8) % 2 === 0;
                        beamVisible = beamVisible && flashOn;
                    }
                    
                    // Store beamVisible on spot for fixture sync
                    spot.beamVisible = beamVisible;

                    // Physics-based surface brightness (Lambert x inverse-square). Declared
                    // here rather than inside the light-pool block because the gobo block
                    // below is a sibling scope and also needs it. Defaults to 1.0 for the
                    // frames where the beam misses a surface and the value is never computed.
                    let physicsIntensity = 1.0;

                    spot.beam.visibility = beamVisible ? 1.0 : 0;
                    
                    // Update beamGlow - Match main beam world-space positioning
                    if (spot.beamGlow) {
                        // Unparent if needed
                        if (spot.beamGlow.parent) {
                            spot.beamGlow.setParent(null);
                        }
                        // Match main beam position and rotation exactly
                        spot.beamGlow.position.copyFrom(beamMidpoint);
                        // QC O5: pooled quat + copyFrom instead of clone() per frame
                        if (!spot._beamGlowQuat) spot._beamGlowQuat = new BABYLON.Quaternion();
                        spot._beamGlowQuat.copyFrom(spot.beam.rotationQuaternion);
                        spot.beamGlow.rotationQuaternion = spot._beamGlowQuat;
                        spot.beamGlow.scaling.y = beamLength;
                        spot.beamGlow.scaling.x = baseScale;
                        spot.beamGlow.scaling.z = baseScale * Math.min(1.3, tiltStretch);
                        
                        // CRITICAL: Sync glow visibility with strobe/beam visibility
                        spot.beamGlow.visibility = beamVisible ? 1.0 : 0;
                        // Use global color for perfect sync
                        if (!spot._beamGlowEmisBuf) spot._beamGlowEmisBuf = new BABYLON.Color3();
                        this.currentSpotColor.scaleToRef(0.15, spot._beamGlowEmisBuf);
                        spot.beamGlowMat.emissiveColor = spot._beamGlowEmisBuf;
                    }
                    // Remember whether the beam is currently lit. The authoritative
                    // `spot.light.intensity` write happens ~350 lines below; assigning it
                    // here was dead in every case, which is why the strobe modes flashed
                    // the beam mesh and the pool while the SpotLight stayed pinned at ~18
                    // and the floor never actually went dark between flashes.
                    spot.beamVisible = beamVisible;
                    
                    // Subtle atmospheric variation - simulates particles moving through beam
                    const atmosphericNoise = Math.sin(time * 3 + i * 0.5) * 0.1; // Subtle flicker
                    
                    // Update emissive color with variation (audio disabled)
                    // CRITICAL: Use this.currentSpotColor (global) as single source of truth
                    // This ensures beam, fixture, and all effects use the EXACT same color
                    const spotColor = this.currentSpotColor;
                    const baseIntensity = 1.8 + atmosphericNoise;
                    if (!spot._beamEmisBuf) spot._beamEmisBuf = new BABYLON.Color3(0, 0, 0);
                    spotColor.scaleToRef(baseIntensity, spot._beamEmisBuf);
                    spot.beamMat.emissiveColor = spot._beamEmisBuf;
                    
                    // CRITICAL: Store the actual beam color for fixture sync (BASE color, not scaled)
                    // This ensures fixture uses EXACT same color as beam
                    spot.currentBeamColor = spotColor;
                    
                    // HYPERREALISTIC: Alpha varies with beam angle and atmospheric density
                    // Beams become more visible at shallower angles (more particles in path)
                    // Also factor in distance - longer beams have more particles
                    const beamPathLength = spot.currentBeamLength || 7.3;
                    const pathDensity = Math.min(1.0, beamPathLength / 10.0); // Longer = denser
                    const angleVis = 1.0 + (1.0 - cosTheta) * 0.5; // More visible at steeper tilt
                    const scatterBase = this.isInVRMode ? 0.10 : 0.065;
                    const scatterVariation = this.isInVRMode ? 0.05 : 0.035;
                    spot.beamMat.alpha = (scatterBase + Math.abs(atmosphericNoise) * scatterVariation) * pathDensity * angleVis;
                    
                    // Update HYPERREALISTIC floor light pool - Physics-accurate projection
                    if (spot.lightPool) {
                        if (this.lightsActive && beamVisible) {
                            // === PHYSICS-ACCURATE ELLIPTICAL PROJECTION ===
                            // The beam mesh is a cone with:
                            //   - diameterTop = 1.5m (at floor end, after scaling)
                            //   - diameterBottom = 0.2m (at fixture lens)
                            //   - height = beamLength (scaled dynamically)
                            // The pool should match the beam's floor intersection exactly
                            
                            // Beam half-angle from mesh geometry: atan((0.75 - 0.1) / beamLength)
                            // For typical 7.3m beam: atan(0.65/7.3) ≈ 5.1°
                            // But the mesh scales, so floor diameter is always proportional to length
                            // diameterAtFloor = diameterBottom + (diameterTop - diameterBottom) * 1.0
                            //                 = 0.2 + (1.5 - 0.2) = 1.5m for unit height
                            // When scaled by beamLength, the cone expands proportionally
                            
                            // For consistent visuals: use fixed ratio based on mesh geometry
                            // The beam scales uniformly in Y, so floor diameter scales with length
                            const meshFloorDiameter = 0.2 + (1.5 - 0.2) * 1.0; // 1.5m at unit height
                            const beamDiameterAtFloor = meshFloorDiameter; // Fixed for mesh consistency
                            
                            // === ELLIPSE GEOMETRY ===
                            // When beam hits floor at angle θ from vertical:
                            // Minor axis = beam diameter (perpendicular to tilt)
                            // Major axis = beam diameter / cos(θ) (along tilt direction)
                            const cosIncident = Math.abs(direction.y);
                            const ellipseStretch = 1.0 / Math.max(0.15, cosIncident);
                            
                            // Clamp stretch to prevent extreme ellipses at very shallow angles
                            const clampedStretch = Math.min(5.0, ellipseStretch);
                            
                            // Pool radii: add 15% for soft penumbra edges
                            const minorRadius = (beamDiameterAtFloor * 0.5) * 1.15;
                            const majorRadius = minorRadius * clampedStretch;
                            
                            // Tilt direction on XZ plane
                            const tiltDirX = direction.x;
                            const tiltDirZ = direction.z;
                            const tiltMagnitude = Math.sqrt(tiltDirX * tiltDirX + tiltDirZ * tiltDirZ);
                            
                            // === LAMBERT'S COSINE LAW ===
                            // Irradiance on surface = I₀ * cos(θ)
                            // Light spreads over larger area at steeper angles → dimmer
                            const lambertFactor = Math.max(0.2, cosIncident);
                            
                            // === INVERSE SQUARE FALLOFF ===
                            // I = I₀ / d², normalized to reference distance
                            const refDist = 7.3; // Fixture height in meters
                            const invSqFalloff = Math.pow(refDist / Math.max(2, centerBeamLength), 2);
                            const clampedInvSq = Math.min(2.0, Math.max(0.25, invSqFalloff));
                            
                            // Combined physics-based intensity
                            physicsIntensity = lambertFactor * clampedInvSq;
                            
                            // Subtle atmospheric shimmer (dust particles in beam)
                            const shimmer = 1.0 + Math.sin(time * 1.8 + i * 0.9) * 0.05;
                            
                            // === POSITION POOL AT ACTUAL SURFACE INTERSECTION ===
                            // The pool appears where the beam hits the surface (floor or wall)
                            // Position and orientation depend on which surface was hit
                            
                            // Store hit surface for reference
                            spot.hitSurface = hitSurface;
                            
                            if (hitSurface === 'floor') {
                                // Floor hit - pool lies flat on floor
                                spot.lightPool.position.set(
                                    surfaceIntersection.x,
                                    0.004, // Just above floor (prevent z-fighting)
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = Math.PI / 2; // Flat on floor
                                spot.lightPool.rotation.z = 0;
                                
                                // Ellipse orientation for tilted beams on floor
                                if (tiltMagnitude > 0.03) {
                                    const poolRotation = Math.atan2(tiltDirX, tiltDirZ);
                                    spot.lightPool.rotation.y = poolRotation;
                                    spot.lightPool.scaling.set(minorRadius, majorRadius, 1);
                                } else {
                                    spot.lightPool.rotation.y = 0;
                                    spot.lightPool.scaling.set(minorRadius, minorRadius, 1);
                                }
                            } else if (hitSurface === 'backWall') {
                                // Back wall hit - pool is vertical facing forward (+Z)
                                spot.lightPool.position.set(
                                    surfaceIntersection.x,
                                    surfaceIntersection.y,
                                    BACK_WALL_Z + 0.01 // Just in front of wall
                                );
                                spot.lightPool.rotation.x = 0; // Vertical
                                spot.lightPool.rotation.y = 0; // Facing forward
                                spot.lightPool.rotation.z = 0;
                                
                                // Ellipse stretches vertically when hitting wall at angle
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.z));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            } else if (hitSurface === 'leftWall') {
                                // Left wall hit - pool is vertical facing right (+X)
                                spot.lightPool.position.set(
                                    LEFT_WALL_X + 0.01, // Just in front of wall
                                    surfaceIntersection.y,
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = 0;
                                spot.lightPool.rotation.y = Math.PI / 2; // Facing right
                                spot.lightPool.rotation.z = 0;
                                
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.x));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            } else if (hitSurface === 'rightWall') {
                                // Right wall hit - pool is vertical facing left (-X)
                                spot.lightPool.position.set(
                                    RIGHT_WALL_X - 0.01, // Just in front of wall
                                    surfaceIntersection.y,
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = 0;
                                spot.lightPool.rotation.y = -Math.PI / 2; // Facing left
                                spot.lightPool.rotation.z = 0;
                                
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.x));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            }
                            spot.lightPool.visibility = 1.0;
                            
                            // === POOL MATERIAL - Physics-based brightness ===
                            // Make pool clearly visible on the surface
                            // Wall hits get boosted brightness since wall materials are darker
                            const surfaceBrightnessBoost = (hitSurface === 'floor') ? 1.0 : 1.6;
                            const poolBrightness = 2.5 * physicsIntensity * shimmer * surfaceBrightnessBoost;
                            if (spot.poolMat) {
                                if (!spot._poolEmisBuf) spot._poolEmisBuf = new BABYLON.Color3(0, 0, 0);
                                spotColor.scaleToRef(poolBrightness, spot._poolEmisBuf);
                                spot.poolMat.emissiveColor = spot._poolEmisBuf;
                                // Higher alpha on walls for better visibility against dark surfaces
                                const basePoolAlpha = (hitSurface === 'floor') ? 0.8 : 0.95;
                                spot.poolMat.alpha = basePoolAlpha * Math.min(1.0, physicsIntensity);
                            }
                            
                            // === POOL LIGHT (if enabled) ===
                            if (spot.poolLight) {
                                // Position based on hit surface
                                if (hitSurface === 'floor') {
                                    spot.poolLight.position.set(
                                        surfaceIntersection.x,
                                        0.4,
                                        surfaceIntersection.z
                                    );
                                } else {
                                    // For walls, offset light slightly in front of surface
                                    spot.poolLight.position.copyFrom(surfaceIntersection);
                                    if (hitSurface === 'backWall') spot.poolLight.position.z += 0.5;
                                    else if (hitSurface === 'leftWall') spot.poolLight.position.x += 0.5;
                                    else if (hitSurface === 'rightWall') spot.poolLight.position.x -= 0.5;
                                }
                                // Scale into per-spot buffers. `.clone()` + `.scale()` here
                                // allocated two Color3 per spotlight per frame (~720/sec).
                                if (!spot._poolDiffuseBuf) {
                                    spot._poolDiffuseBuf = new BABYLON.Color3(0, 0, 0);
                                    spot._poolSpecBuf = new BABYLON.Color3(0, 0, 0);
                                }
                                spot._poolDiffuseBuf.copyFrom(spotColor);
                                spotColor.scaleToRef(0.25, spot._poolSpecBuf);
                                spot.poolLight.diffuse = spot._poolDiffuseBuf;
                                spot.poolLight.specular = spot._poolSpecBuf;
                                spot.poolLight.intensity = 3.5 * physicsIntensity * shimmer;
                                spot.poolLight.range = majorRadius * 2.0;
                                spot.poolLight.setEnabled(true);
                            }
                            
                            // === OUTER GLOW (penumbra scatter) ===
                            // HYPERREALISTIC: Wall hits produce larger scatter halos (rough surface diffusion)
                            if (spot.lightPoolGlow) {
                                // Wall surfaces scatter light more widely (rough brick/concrete)
                                const scatterMultiplier = (hitSurface === 'floor') ? 2.2 : 3.0;
                                const glowMinor = minorRadius * scatterMultiplier;
                                const glowMajor = majorRadius * scatterMultiplier;
                                
                                // Match pool position for glow
                                spot.lightPoolGlow.position.copyFrom(spot.lightPool.position);
                                // Offset slightly toward viewer to prevent z-fighting
                                if (hitSurface === 'floor') {
                                    spot.lightPoolGlow.position.y = 0.002;
                                } else if (hitSurface === 'backWall') {
                                    spot.lightPoolGlow.position.z += 0.008;
                                } else if (hitSurface === 'leftWall') {
                                    spot.lightPoolGlow.position.x += 0.008;
                                } else if (hitSurface === 'rightWall') {
                                    spot.lightPoolGlow.position.x -= 0.008;
                                }
                                
                                // Copy rotation from pool
                                spot.lightPoolGlow.rotation.copyFrom(spot.lightPool.rotation);
                                
                                // Elliptical glow on all surfaces when beam is tilted
                                if (tiltMagnitude > 0.03) {
                                    spot.lightPoolGlow.scaling.set(glowMinor, glowMajor, 1);
                                } else {
                                    spot.lightPoolGlow.scaling.set(glowMinor, glowMinor, 1);
                                }
                                spot.lightPoolGlow.visibility = 1.0;
                                
                                if (spot.poolGlowMat) {
                                    // HYPERREALISTIC: Wall scatter is warmer/brighter (Lambertian diffuse scatter)
                                    const wallScatterBoost = (hitSurface === 'floor') ? 1.0 : 1.4;
                                    const glowBrightness = 0.7 * physicsIntensity * shimmer * wallScatterBoost;
                                    if (!spot._poolGlowEmisBuf) spot._poolGlowEmisBuf = new BABYLON.Color3(0, 0, 0);
                                    spotColor.scaleToRef(glowBrightness, spot._poolGlowEmisBuf);
                                    spot.poolGlowMat.emissiveColor = spot._poolGlowEmisBuf;
                                    const baseGlowAlpha = (hitSurface === 'floor') ? 0.35 : 0.5;
                                    spot.poolGlowMat.alpha = baseGlowAlpha * Math.min(1.0, physicsIntensity);
                                }
                            }
                            
                        } else {
                            // CRITICAL: Hide floor pools immediately when lights turn off or flashing off
                            spot.lightPool.visibility = 0;
                            if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                            // Disable pool light when beam is off
                            if (spot.poolLight) spot.poolLight.setEnabled(false);
                        }
                    }
                    
                    // === GOBO PROJECTION UPDATE ===
                    if (spot.goboProjection) {
                        const showGobo = this.lightsActive && this.goboEnabled && beamVisible;
                        spot.goboProjection.setEnabled(showGobo);
                        spot.goboProjection.visibility = showGobo ? 1.0 : 0;
                        
                        if (showGobo) {
                            // === SURFACE-AWARE GOBO POSITIONING ===
                            // Gobo must match the lightPool's position and orientation on any surface
                            const goboLocalOffset = spot.goboLocalRotation || 0;
                            const goboRotAngle = this.goboRotation + goboLocalOffset;
                            
                            if (hitSurface === 'floor') {
                                // Floor: flat disc on XZ plane
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x,
                                    0.025, // Just above floor
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = Math.PI / 2;
                                spot.goboProjection.rotation.y = spot.lightPool.rotation.y;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'backWall') {
                                // Back wall: vertical disc facing +Z
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z + 0.015
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = 0;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'leftWall') {
                                // Left wall: vertical disc facing +X
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x + 0.015,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = Math.PI / 2;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'rightWall') {
                                // Right wall: vertical disc facing -X
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x - 0.015,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = -Math.PI / 2;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            }
                            
                            // Sync scale with light pool (gobo slightly larger for soft edges)
                            spot.goboProjection.scaling.x = spot.lightPool.scaling.x * 1.1;
                            spot.goboProjection.scaling.y = spot.lightPool.scaling.y * 1.1;
                            
                            // Update color to match spotlight with physics-based brightness
                            if (spot.goboMat) {
                                const goboBrightness = 1.8 * physicsIntensity;
                                if (!spot._goboEmisBuf) spot._goboEmisBuf = new BABYLON.Color3(0, 0, 0);
                                spotColor.scaleToRef(goboBrightness, spot._goboEmisBuf);
                                spot.goboMat.emissiveColor = spot._goboEmisBuf;
                            }
                            
                            // Hide regular pool when gobo is on (gobo replaces it)
                            spot.lightPool.visibility = 0;
                        } else {
                            // Gobo is off - ensure regular pool is visible (if lights are on)
                            if (this.lightsActive && beamVisible && spot.lightPool) {
                                spot.lightPool.visibility = 1.0;
                            }
                        }
                    }
                }
                
                // CRITICAL: Hide beams when lights are off (no beams without light source!)
                if (!this.lightsActive) {
                    spot.beamVisible = false; // CRITICAL: Update beamVisible for fixture sync
                    if (spot.beam) spot.beam.visibility = 0;
                    if (spot.beamGlow) spot.beamGlow.visibility = 0;
                    if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                    if (spot.poolLight) spot.poolLight.setEnabled(false);
                    if (spot.goboProjection) {
                        spot.goboProjection.setEnabled(false);
                        spot.goboProjection.visibility = 0;
                    }
                }
                
                // PROFESSIONAL CONSTANT INTENSITY (audio disabled)
                const baseIntensity = this.isInVRMode ? 42 : 18;
                const smoothPulse = Math.sin(time * 2.5) * (this.isInVRMode ? 5 : 3);
                
                // UPGRADE: Keep diffuse in sync with specular color for projectionTexture.
                // `specular` may safely alias currentSpotColor (we own it and never let
                // anyone else mutate it). `diffuse` needs a scaled copy, so scale into a
                // per-spot buffer rather than allocating a Color3 per spotlight per frame.
                spot.light.specular = this.currentSpotColor;
                if (!spot._diffuseBuf) spot._diffuseBuf = new BABYLON.Color3(0, 0, 0);
                this.currentSpotColor.scaleToRef(this.isInVRMode ? 0.32 : 0.15, spot._diffuseBuf);
                spot.light.diffuse = spot._diffuseBuf;
                
                const lightEnabled = this.lightsActive && spot.beamVisible !== false;
                spot.light.intensity = lightEnabled ? (baseIntensity + smoothPulse) : 0;
                spot.light.setEnabled(lightEnabled);
            });
        } else if (this.spotlights) {
            // Turn off spotlights completely when not active
            this.spotlights.forEach(spot => {
                spot.light.intensity = 0;
                spot.light.setEnabled(false);
                if (spot.beam) spot.beam.visibility = 0;
                if (spot.beamGlow) spot.beamGlow.visibility = 0;
                if (spot.lightPoolCore) spot.lightPoolCore.visibility = 0;
                if (spot.lightPool) spot.lightPool.visibility = 0;
                if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                if (spot.poolLight) spot.poolLight.setEnabled(false);
                if (spot.goboProjection) {
                    spot.goboProjection.setEnabled(false);
                    spot.goboProjection.visibility = 0;
                }
            });
        }
        
        // Laser curtain show removed (was broken)

        // Update truss-mounted light fixtures so they EXACTLY match their beams
        // Rule: fixture stays lit with current color when lightsActive=true (beam strobe doesn't affect fixture)
        if (this.spotlights && this.spotlights.length > 0) {
            // Use the GLOBAL currentSpotColor for ALL fixtures - they must all match
            const targetColor = this.currentSpotColor;
            const lensIntensity = this.isInVRMode ? 6.0 : 1.8;
            const sourceIntensity = this.isInVRMode ? 12.0 : 3.0;
            const flareColorIntensity = this.isInVRMode ? 18.0 : 7.0;
            const flareWhiteCore = this.isInVRMode ? 6.0 : 1.5;
            
            for (let i = 0; i < this.spotlights.length; i++) {
                const spot = this.spotlights[i];
                if (!spot) continue;

                // Fixture should be lit when lights are active
                const fixtureVisible = this.lightsActive;

                // QC O2: use cached refs on the spot object instead of two
                // scene.getMeshByName() calls per spot per frame (~720 hash
                // lookups/sec for 6 spotlights). The references were captured
                // at fixture-creation time in createTrussMountedLights().
                const lens = spot.lens;
                const lightSource = spot.lightSource;

                // Update lens color
                if (lens && lens.material) {
                    const mat = lens.material;
                    // QC: only unfreeze on the first frame. Calling unfreeze() every
                    // frame re-runs Material.markDirty(), which walks every mesh in
                    // the scene (~720 full-scene scans/sec for 6 fixtures at 60 fps).
                    if (mat.isFrozen) mat.unfreeze();
                    if (!mat.emissiveColor) {
                        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    }
                    if (fixtureVisible) {
                        mat.emissiveColor.copyFromFloats(
                            targetColor.r * lensIntensity,
                            targetColor.g * lensIntensity,
                            targetColor.b * lensIntensity
                        );
                    } else {
                        mat.emissiveColor.copyFromFloats(0, 0, 0);
                    }
                }

                // Update light source (inner bulb) color
                if (lightSource && lightSource.material) {
                    const mat = lightSource.material;
                    // QC: only unfreeze on the first frame — see note above.
                    if (mat.isFrozen) mat.unfreeze();
                    if (!mat.emissiveColor) {
                        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    }
                    if (fixtureVisible) {
                        mat.emissiveColor.copyFromFloats(
                            targetColor.r * sourceIntensity,
                            targetColor.g * sourceIntensity,
                            targetColor.b * sourceIntensity
                        );
                    } else {
                        mat.emissiveColor.copyFromFloats(0, 0, 0);
                    }
                }

                if (spot.flareMat) {
                    if (fixtureVisible) {
                        spot.flareMat.emissiveColor.copyFromFloats(
                            flareWhiteCore + targetColor.r * flareColorIntensity,
                            flareWhiteCore + targetColor.g * flareColorIntensity,
                            flareWhiteCore + targetColor.b * flareColorIntensity
                        );
                    } else {
                        spot.flareMat.emissiveColor.copyFromFloats(0, 0, 0);
                        spot.flareMat.alpha = 0;
                    }
                }
            }
        }
        } // End of legacy inline spotlight animation else block
    }

    /**
     * Strobe bank. Hard-disabled by photosensitiveSafeMode regardless of VJ state.
     *
     * NOTE: `this.ledTime` is advanced exactly ONCE per frame, in _beginFrame(),
     * using `ledWallSpeed`. A second accumulator used to live here that advanced
     * it again using `spotlightSpeed` — LED patterns therefore ran at roughly
     * double speed and were coupled to the spotlight slider. Removed (QC review).
     */
}
window.VRClubAnimationFixtures = VRClubAnimationFixtures;
