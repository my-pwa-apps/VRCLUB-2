class VRClubAnimationFinish extends VRClubAnimationFixtures {
    updateStrobes(ctx) {
        const { time, dt, audio: audioData } = ctx;

        // Update strobes - respects strobesActive control
        // Strobe lights animation (with speed multiplier)
        // === PROFESSIONAL VJ STROBE SYSTEM ===
        // Synchronized with drops, builds, and bass for maximum impact
        const strobeSpeedMultiplier = this.strobeSpeed || 1.0;
        if (this.strobes && this.strobes.length > 0) {
            // Photosensitive Safe Mode hard-disables strobes regardless of VJ state
            if (this.strobesActive && !this.photosensitiveSafeMode) {
                // Get audio data for reactive strobing
                const bass = audioData.bass || 0;
                const treble = audioData.treble || 0;
                
                // VJ AUTO-MODE: Enhanced strobing during drops
                const inDropMode = this.vjDropActive;
                const inBuildMode = this.vjBuildIntensity > 0.7;
                
                this.strobes.forEach((strobe, i) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        strobe.flashDuration -= dt * strobeSpeedMultiplier;
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    // BOOST during drops for maximum crowd impact
                    let intensityVariation = strobe.currentIntensity || 80;
                    if (inDropMode) {
                        intensityVariation *= 1.5; // 50% brighter during drops
                    }
                    // VJ Director master fader (1.0 = full, 0 = blackout). Cheap multiply.
                    intensityVariation *= (this.masterIntensity != null ? this.masterIntensity : 1.0);
                    
                    // Burst phase is computed exactly once per strobe per frame and
                    // cached on the fixture: the shared flash-light pass below needs
                    // the same value, and recomputing it there let the two passes
                    // disagree whenever flashDuration changed between them.
                    const burstOn = Math.floor(strobe.flashDuration * 40 * strobeSpeedMultiplier) % 2 === 0;
                    strobe._burstOn = burstOn;
                    const intensity = burstOn ? intensityVariation : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity * 1.5);
                    // Strobe lights disabled for performance - visual effect only via emissive material
                    if (strobe.light) {
                        strobe.light.intensity = intensity * 200;
                        strobe.light.range = 80 + (intensityVariation * 0.8);
                        strobe.light.setEnabled(intensity > 0);
                    }
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        if (strobe.light) {
                            strobe.light.intensity = 0;
                            strobe.light.setEnabled(false);
                        }
                        
                        // VJ AUTO-MODE: Faster strobing during drops and builds
                        let flashInterval;
                        if (inDropMode) {
                            // RAPID FIRE during drops (0.05-0.15s)
                            flashInterval = (0.05 + Math.random() * 0.1) / strobeSpeedMultiplier;
                        } else if (inBuildMode) {
                            // Increasing frequency during build (0.1-0.3s)
                            const buildFactor = 1 - (this.vjBuildIntensity - 0.7) / 0.3;
                            flashInterval = (0.1 + Math.random() * 0.2 * buildFactor) / strobeSpeedMultiplier;
                        } else {
                            // Normal operation (0.1-1.0s)
                            flashInterval = (0.1 + Math.random() * 0.9) / strobeSpeedMultiplier;
                        }
                        strobe.nextFlashTime = time + flashInterval;
                    }
                } else {
                    // Check if it's time for next flash
                    if (time >= strobe.nextFlashTime) {
                        // VJ AUTO-MODE: Brighter strobes during drops
                        let intensityBase = Math.random() > 0.6 ? 
                            (60 + Math.random() * 20) : 
                            (80 + Math.random() * 20);
                        
                        // BASS REACTIVE: Boost on bass hits
                        if (bass > 0.6) {
                            intensityBase *= 1 + (bass - 0.6) * 0.5;
                        }
                        
                        // DROP BOOST: Maximum power during drops
                        if (inDropMode) {
                            intensityBase = 100; // Full power
                        }
                        
                        strobe.currentIntensity = Math.min(100, intensityBase);
                        
                        // Flash duration varies with mode
                        let flashDuration;
                        if (inDropMode) {
                            flashDuration = (0.08 + Math.random() * 0.12) / strobeSpeedMultiplier;
                        } else {
                            flashDuration = (0.15 + Math.random() * 0.2) / strobeSpeedMultiplier;
                        }
                        strobe.flashDuration = flashDuration;
                        // Seed the cached burst phase for the shared flash light below,
                        // which runs in the same frame the flash is scheduled.
                        strobe._burstOn = Math.floor(flashDuration * 40 * strobeSpeedMultiplier) % 2 === 0;
                    }
                }
                });
                
                // Drive shared strobe flash light from max strobe intensity
                if (this.strobeFlashLight) {
                    let maxIntensity = 0;
                    this.strobes.forEach(s => {
                        if (s.flashDuration > 0) {
                            if (s._burstOn && s.currentIntensity > maxIntensity) {
                                maxIntensity = s.currentIntensity;
                            }
                        }
                    });
                    if (maxIntensity > 0) {
                        this.strobeFlashLight.intensity = maxIntensity * 3;
                        this.strobeFlashLight.setEnabled(true);
                        // Brief bloom spike for blinding strobe effect
                        if (this.renderPipeline && this.renderPipeline.bloomEnabled) {
                            this._preStrobeBloom = this._preStrobeBloom || this.renderPipeline.bloomWeight;
                            this.renderPipeline.bloomWeight = Math.min(1.0, this._preStrobeBloom + maxIntensity * 0.008);
                        }
                    } else {
                        this.strobeFlashLight.intensity = 0;
                        this.strobeFlashLight.setEnabled(false);
                        // Restore bloom
                        if (this._preStrobeBloom !== undefined && this.renderPipeline) {
                            this.renderPipeline.bloomWeight = this._preStrobeBloom;
                        }
                    }
                }
            } else {
                // Turn off strobes when disabled
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
        }
        
        // Blinders removed - strobes provide sufficient impact lighting
    }

    /** Sub-grille excursion driven by the bass band. */
    updateSpeakerCones(ctx) {
        const { audio: audioData } = ctx;

        // === BASS-REACTIVE SPEAKER CONE PUSH ===
        // Subwoofer grilles visually pulse with bass for tactile audio feedback
        if (audioData.bass > 0.1) {
            const bassExcursion = audioData.bass * 0.015; // Subtle Z-axis push
            // QC O2: cache grill mesh refs once instead of two getMeshByName()
            // calls every audio-active frame. Resolved on first use.
            if (!this._subGrillRefs) {
                this._subGrillRefs = [
                    this.scene.getMeshByName('subGrill-7'),
                    this.scene.getMeshByName('subGrill7')
                ];
            }
            for (let g = 0; g < this._subGrillRefs.length; g++) {
                const grill = this._subGrillRefs[g];
                if (!grill) continue;
                if (grill._basePosZ === undefined) {
                    grill._basePosZ = grill.position.z; // Store original position
                    if (grill.isWorldMatrixFrozen) {
                        grill.unfreezeWorldMatrix();
                    }
                }
                grill.position.z = grill._basePosZ + bassExcursion;
            }
        }
    }

    /**
     * Simplified LED Wall animation - reliable patterns that always show
     */
    updateLEDWallSimple(time) {
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 10;
        
        // Use performance.now() directly to ensure time is always fresh
        const t = performance.now() / 1000;
        
        // Simple animated rainbow wave - always moving
        this.ledPanels.forEach(panel => {
            const col = panel.col;
            const row = panel.row;
            
            // Rainbow wave that definitely moves
            const hue = (col / cols * 0.5 + row / rows * 0.3 + t * 0.3) % 1.0;
            const h = hue * 6;
            const x = 1 - Math.abs(h % 2 - 1);
            let r, g, b;
            if (h < 1) { r = 1; g = x; b = 0; }
            else if (h < 2) { r = x; g = 1; b = 0; }
            else if (h < 3) { r = 0; g = 1; b = x; }
            else if (h < 4) { r = 0; g = x; b = 1; }
            else if (h < 5) { r = x; g = 0; b = 1; }
            else { r = 1; g = 0; b = x; }
            
            panel.material.emissiveColor.r = r;
            panel.material.emissiveColor.g = g;
            panel.material.emissiveColor.b = b;
        });
    }

    updateLEDWall(time, audioData) {
        // Debug: Log first few calls to verify update is running
        if (this.ledUpdateCount === undefined) this.ledUpdateCount = 0;
        this.ledUpdateCount++;
        if (this.ledUpdateCount <= 3) {
            log.info(`🎨 LED Wall update #${this.ledUpdateCount}, pattern=${this.ledPattern}, panels=${this.ledPanels?.length}`);
        }
        
        const patterns = this._ledPatternPlaylist || (this._ledPatternPlaylist = [
            // === CURATED IMMERSIVE LED WALL SHOW ===
            // Removed short utility effects such as strobes, scanners, EQ bars,
            // confetti, fire, and simple geometric flashes. The remaining set
            // keeps variation through vortex, expansion, organic flow, symmetry,
            // and slow breathing motion while staying hypnotic and continuous.
            this.patternHypnoticSpiral,     // [0] Counter-rotating rainbow vortex
            this.patternConcentricRings,    // [1] Endless rings rippling outward
            this.patternNestedSquares,      // [2] Square outlines blooming from center
            this.patternMandalaBloom,       // [3] Geometric flower opening over and over
            this.patternRippleRain,         // [4] Multiple ripples on a virtual pond
            this.patternBreathing,          // Slow inhale/exhale glow
            this.patternShockwave,          // Concentric rings expanding
            this.patternPulseStar,          // Star shape pulsing outward
            this.patternRadialPulse,        // Radial rays pulsing from center
            this.patternWaveCollide,        // Waves colliding at center
            this.patternCellularPulse,      // Organic cell-like pulsation
            this.patternTunnel,             // Tunnel/vortex effect
            this.patternKaleidoscope,       // Rotating kaleidoscope
            this.patternDNAHelix,           // Double helix spinning
            this.patternInfinityLoop,       // Flowing infinity symbol
            this.patternPlasma,             // Organic plasma flow
            this.patternAurora,             // Northern lights effect
            this.patternRainbowRave         // Full spectrum rave
        ]);
        
        // Palette. In monochrome looks the patterns are handed neutral whites so
        // anything that respects the colour it is given renders as pure light and
        // shade — see the desaturation backstop after the pattern call for the
        // ones that synthesise their own hues.
        const monochromeColors = this._ledMonochromePalette || (this._ledMonochromePalette = [
            this.cachedColors.ledMonoWhite,
            this.cachedColors.ledMonoCool,
            this.cachedColors.ledMonoWhite,
            this.cachedColors.ledMonoWarm
        ]);
        const colorColors = this._ledColorPalette || (this._ledColorPalette = [
            this.cachedColors.red,
            this.cachedColors.green,
            this.cachedColors.blue,
            this.cachedColors.magenta,
            this.cachedColors.yellow,
            this.cachedColors.cyan
        ]);
        const colors = this.ledMonochrome ? monochromeColors : colorColors;
        
        // BEAT DETECTION: Auto-detect BPM from music or use 130 BPM fallback
        let beatDetected = false;
        
        // If music playing: detect beats from bass peaks
        if (audioData.hasAudio && audioData.bass > this.beatThreshold && audioData.bass > this.lastBassLevel * 1.3) {
            // Bass spike detected = beat!
            if (time - this.lastBeat > 0.2) { // Prevent double-triggering (max 300 BPM)
                beatDetected = true;
                this.lastBeat = time;
                
                // Track beat time for BPM calculation
                this.beatHistory.push(time);
                if (this.beatHistory.length > this.maxBeatHistory) {
                    this.beatHistory.shift(); // Keep only recent beats
                }
                
                // Calculate BPM from beat intervals (every 2 seconds)
                if (this.beatHistory.length >= 4 && time - this.lastBPMUpdate > 2) {
                    let intervalSum = 0;
                    for (let i = 1; i < this.beatHistory.length; i++) {
                        intervalSum += this.beatHistory[i] - this.beatHistory[i - 1];
                    }
                    const avgInterval = intervalSum / (this.beatHistory.length - 1);
                    this.detectedBPM = Math.round(60 / avgInterval);
                    
                    // Clamp to realistic range (60-200 BPM)
                    this.detectedBPM = Math.max(60, Math.min(200, this.detectedBPM));
                    this.bpm = this.detectedBPM;
                    this.beatInterval = 60 / this.bpm;
                    this.lastBPMUpdate = time;
                    
                    log.info(`🎵 Detected BPM: ${this.bpm}`);
                }
            }
        }
        
        // Fallback: If no audio or no beats detected, sync to current BPM timing
        if (!beatDetected && time - this.lastBeat > this.beatInterval) {
            beatDetected = true;
            this.lastBeat = time;
            
            // If no audio, reset to 130 BPM
            if (!audioData.hasAudio && this.bpm !== 130) {
                this.bpm = 130;
                this.beatInterval = 60 / 130;
                this.beatHistory = [];
                log.info('🎵 No audio - using default 130 BPM');
            }
        }
        
        this.lastBassLevel = audioData.bass;
        
        // Pattern dwell time. The active playlist is now all immersive and
        // continuous, so even the higher-energy visuals need enough time to
        // settle into a trance instead of flashing by like one-shot effects.
        const HYPNOTIC_PATTERN_COUNT = 5; // indices 0..4
        const isHypnotic = this.ledPattern < HYPNOTIC_PATTERN_COUNT;
        const beatsPerPattern = isHypnotic
            ? 32       // ~14.7s @ 130 BPM — long enough to lock the eye in
            : 16;      // varied but still immersive
        const fallbackSeconds = isHypnotic ? 16.0 : 8.0;
        const patternChangeTime = audioData.hasAudio
            ? this.beatInterval * beatsPerPattern
            : fallbackSeconds;
        
        // The Show Director picks the LED pattern as part of a composed look, so
        // this private timer must not also advance it — otherwise the wall drifts
        // off whatever the current cue chose a few beats after every change.
        const showOwnsPattern = !!(this.showDirector && this.showDirector.isDriving());
        if (!showOwnsPattern && time - this.ledPatternSwitchTime > patternChangeTime) {
            this.ledPattern = (this.ledPattern + 1) % patterns.length;
            this.ledPatternSwitchTime = time;
        }
        
        // Change color more frequently too
        // With audio: every 8 beats (~3.7s), Without audio: every 4 seconds
        const beatsPerColor = audioData.hasAudio ? 8 : 8; // Reduced from 16 to 8
        const colorChangeTime = audioData.hasAudio 
            ? this.beatInterval * beatsPerColor 
            : 4.0; // 4-second color changes without audio
        
        if (time - this.lastColorChange > colorChangeTime || this.lastColorChange === -1) {
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.lastColorChange = time;
        }
        
        // Execute current pattern with error handling
        const currentPattern = patterns[this.ledPattern];
        const activeColor = colors[this.ledColorIndex % colors.length];
        if (currentPattern && typeof currentPattern === 'function') {
            try {
                currentPattern.call(this, activeColor, time, audioData);
            } catch (err) {
                log.warn('LED pattern error:', err);
                // Fallback: simple color pulse
                const brightness = 0.5 + Math.sin(time * 3) * 0.5;
                this.ledPanels.forEach(panel => {
                    this.updateLEDPanel(panel, activeColor, brightness);
                });
            }
        } else {
            // Pattern not found - use simple rainbow wave fallback
            log.warn(`LED pattern ${this.ledPattern} not found, using fallback`);
            this.ledPanels.forEach(panel => {
                const wave = Math.sin(time * 2 + panel.col * 0.3);
                this.updateLEDPanel(panel, activeColor, 0.5 + wave * 0.5);
            });
        }

        // === MONOCHROME BACKSTOP ===
        // Several patterns (spiral, plasma, aurora, kaleidoscope, rainbow rave)
        // synthesise their own hues and ignore the colour they are handed, so
        // feeding them white is not enough on its own.
        //
        // Collapses on the channel MEAN, which is the only one of the three
        // obvious choices that actually keeps the picture:
        //   · max(r,g,b) returns ~1.0 for every saturated hue, so a rainbow
        //     spiral desaturates to a flat white wall with no shape left.
        //   · Rec.709 luminance renders pure blue at 0.07 and erases anything
        //     built on blue entirely.
        //   · the mean maps each hue to a distinct grey (red 0.33, yellow 0.67,
        //     white 1.0), so hue-carried structure survives as tonal contrast —
        //     which is the whole point of a black-and-white look.
        if (this.ledMonochrome) {
            for (let i = 0; i < this.ledPanels.length; i++) {
                const panel = this.ledPanels[i];
                const c = panel.material.emissiveColor;
                const v = (c.r + c.g + c.b) / 3;
                const m = panel.colorBuffer;
                m.r = v; m.g = v; m.b = v;
                panel.material.emissiveColor = m;
            }
        }
    }

}
window.VRClubAnimationFinish = VRClubAnimationFinish;
