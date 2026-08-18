class VRClubAnimationFinish extends VRClubAnimationFixtures {
    updateStrobes(ctx) {
        const { time, dt, audio: audioData } = ctx;

        // Update strobes - respects strobesActive control
        // Strobe lights animation (with speed multiplier)
        // === PROFESSIONAL VJ STROBE SYSTEM ===
        // Synchronized with drops, builds, and bass for maximum impact
        const strobeSpeedMultiplier = this.strobeSpeed || 1.0;
        // Restore any bloom spike from a previous frame UNCONDITIONALLY, before any
        // branch. Restoration used to live only in the `maxIntensity === 0` else, so
        // flipping strobesActive off - or, far worse, enabling photosensitive safe
        // mode - mid-flash left the whole screen permanently brighter than it was
        // found. A photosensitivity control must never fail in that direction.
        if (this._preStrobeBloom !== undefined && this.renderPipeline) {
            this.renderPipeline.bloomWeight = this._preStrobeBloom;
            this._preStrobeBloom = undefined;
        }
        if (this.strobes && this.strobes.length > 0) {
            // Photosensitive Safe Mode hard-disables strobes regardless of VJ state
            if (this.strobesActive && !this.photosensitiveSafeMode) {
                // Get audio data for reactive strobing
                const bass = audioData.bass || 0;
                
                // VJ AUTO-MODE: Enhanced strobing during drops
                const inDropMode = this.vjDropActive;
                const inBuildMode = this.vjBuildIntensity > 0.7;
                
                this.strobes.forEach((strobe) => {
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
                    
                    // scaleToRef into a per-strobe buffer: Color3.scale() allocates,
                    // and this runs once per strobe per frame for the whole flash.
                    if (!strobe._emisBuf) strobe._emisBuf = new BABYLON.Color3(0, 0, 0);
                    this.cachedColors.white.scaleToRef(intensity * 1.5, strobe._emisBuf);
                    strobe.material.emissiveColor = strobe._emisBuf;
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
                        // Brief bloom spike for blinding strobe effect. Captured per
                        // burst (cleared at the top of this function), so a pipeline swap
                        // on VR entry cannot leak a stale desktop bloomWeight into the
                        // freshly created VR pipeline.
                        if (this.renderPipeline && this.renderPipeline.bloomEnabled) {
                            this._preStrobeBloom = this.renderPipeline.bloomWeight;
                            this.renderPipeline.bloomWeight = Math.min(1.0, this._preStrobeBloom + maxIntensity * 0.008);
                        }
                    } else {
                        this.strobeFlashLight.intensity = 0;
                        this.strobeFlashLight.setEnabled(false);
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
        // Subwoofer grilles visually pulse with bass for tactile audio feedback.
        // The excursion is written EVERY frame, not only above the threshold: with an
        // early return the grille froze at its last excursion on every breakdown,
        // pause and track change and never returned to rest.
        const bassExcursion = audioData.bass > 0.1 ? audioData.bass * 0.015 : 0;

        // QC O2: cache grill mesh refs once instead of two getMeshByName()
        // calls every frame. Invalidated when the PA .glb finishes loading
        // (see modelLoadPromise in 02-lifecycle.js) so we never drive a mesh the
        // loader has since replaced or disabled.
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

    updateLEDWall(time, audioData) {
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
        
        // BEAT GRID.
        //
        // VJDirector is the single authority for beat/BPM (spectral flux + adaptive
        // median threshold) and it runs earlier in the same frame. This function used
        // to run a SECOND, cruder detector (naive bass-peak ratio) that wrote to the
        // same `this.bpm` / `this.beatInterval` - two detectors, one output variable.
        // Now it consumes the director's estimate and only keeps its own beat EDGE,
        // which is all the pattern/colour timers need.
        const directorBpm = (this.vjDirector && this.vjDirector.bpm) ? this.vjDirector.bpm : null;
        if (audioData.hasAudio && directorBpm) {
            this.bpm = Math.max(60, Math.min(200, Math.round(directorBpm)));
        } else if (!audioData.hasAudio && this.bpm !== 130) {
            this.bpm = 130;
        }
        this.beatInterval = 60 / this.bpm;

        if (time - this.lastBeat > this.beatInterval) {
            this.lastBeat = time;
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
        
        // Change colour on its own clock.
        //
        // This used to share `this.lastColorChange` with the SPOTLIGHT palette cycler
        // in 08-animation-fixtures.js. Two writers, one property, two different
        // intervals (2-12 s vs 4 s / 8 beats): whichever fired first reset the other's
        // clock, so neither ever honoured its configured interval and the spotlight
        // cycler was starved outright whenever the LED interval was shorter.
        const beatsPerColor = 8;
        const colorChangeTime = audioData.hasAudio 
            ? this.beatInterval * beatsPerColor 
            : 4.0; // 4-second color changes without audio
        
        if (this.ledLastColorChange === undefined) this.ledLastColorChange = -1;
        if (this.ledLastColorChange === -1 || time - this.ledLastColorChange > colorChangeTime) {
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.ledLastColorChange = time;
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
