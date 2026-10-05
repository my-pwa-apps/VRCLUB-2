'use strict';
// Strobe timing, in real seconds. See updateStrobes().
const STROBE_FLASH_S = 0.040;       // one burst at strobeSpeed 1
const STROBE_DROP_FLASH_S = 0.032;  // during a drop
const STROBE_MIN_FLASH_S = 0.022;   // however fast the strobe runs
const STROBE_MIN_INTERVAL_S = 0.34; // free-running timer floor: under three flashes a second

class VRClubAnimationFinish extends VRClubAnimationFixtures {
    updateStrobes(ctx) {
        const { time, dt, audio: audioData } = ctx;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));

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
        if (this._preStrobeExposure !== undefined && this.renderPipeline?.imageProcessing) {
            this._writeExposure(this._preStrobeExposure);
            this._preStrobeExposure = undefined;
        }
        const ambient = this.scene?.getLightByName('ambient');
        if (this._preStrobeAmbientIntensity !== undefined) {
            if (ambient) ambient.intensity = this._preStrobeAmbientIntensity;
            this._preStrobeAmbientIntensity = undefined;
        }
        if (this.strobeRetinalFlash?.color) this.strobeRetinalFlash.color.a = 0;
        if (this.strobes && this.strobes.length > 0) {
            // Photosensitive Safe Mode hard-disables strobes regardless of VJ state
            if (this.strobesActive && !this.photosensitiveSafeMode) {
                // Get audio data for reactive strobing
                const bass = audioData.bass || 0;
                
                // VJ AUTO-MODE: Enhanced strobing during drops
                const inDropMode = this.vjDropActive;
                const inBuildMode = this.vjBuildIntensity > 0.7;

                const burstActive = this.strobes.some(strobe => strobe.flashDuration > 0);
                // Beat-locked when the show drives: a strobe that fires on a random timer
                // never lands on the kick, which is the whole point of one. null = legacy
                // free-running timer (manual VJ, no director, or a 'free' look).
                const syncDue = typeof this._strobeSyncDue === 'function' ? this._strobeSyncDue() : null;
                const due = syncDue === null
                    ? (this._nextStrobeBurstTime === undefined || time >= this._nextStrobeBurstTime)
                    : syncDue;
                if (!burstActive && due) {
                    let intensityBase = inDropMode ? 100 : 72 + Math.random() * 28;
                    if (bass > 0.6) intensityBase *= 1 + (bass - 0.6) * 0.5;
                    // A strobe is a stab of light, not a lamp: about 40 ms (3 frames at 72 Hz), a
                    // little shorter the faster the strobe runs. The countdown below is in REAL
                    // seconds (not scaled by strobeSpeed), so the length does not depend on the
                    // speed twice. It was 90 ms at speed 1 (7 frames), long enough that a
                    // free-running strobe read as the room being lit most of the time.
                    const flashDuration = Math.max(
                        STROBE_MIN_FLASH_S,
                        (inDropMode ? STROBE_DROP_FLASH_S : STROBE_FLASH_S) / Math.sqrt(strobeSpeedMultiplier)
                    );
                    const intensity = Math.min(100, intensityBase);
                    let chaseIndex = -1;
                    if (this.strobePattern === 'chase') {
                        if (this.strobes.length === 1) {
                            chaseIndex = 0;
                        } else if (syncDue !== null) {
                            // On the grid the chase must read as a pattern, not a dice roll.
                            this._strobeChaseStep = ((Number.isInteger(this._strobeChaseStep) ? this._strobeChaseStep : -1) + 1) % this.strobes.length;
                            chaseIndex = this._strobeChaseStep;
                        } else {
                            // Pick any corner except the previous one. This reads as
                            // improvised without allowing one fixture to double-hit.
                            const last = Number.isInteger(this._lastStrobeChaseIndex) &&
                                this._lastStrobeChaseIndex >= 0 &&
                                this._lastStrobeChaseIndex < this.strobes.length
                                ? this._lastStrobeChaseIndex : -1;
                            const candidateCount = this.strobes.length - (last >= 0 ? 1 : 0);
                            chaseIndex = Math.floor(Math.random() * candidateCount);
                            if (last >= 0 && chaseIndex >= last) chaseIndex++;
                        }
                        this._lastStrobeChaseIndex = chaseIndex;
                    }
                    this.strobes.forEach((strobe, index) => {
                        const active = this.strobePattern !== 'chase' || index === chaseIndex;
                        strobe.currentIntensity = active ? intensity : 0;
                        strobe.flashDuration = active ? flashDuration : 0;
                        strobe._burstOn = active;
                        // The burst is shown for the frame it fires on, whatever the frame time.
                        strobe._holdFrame = active;
                        if (!active) {
                            if (!strobe._emisBuf) strobe._emisBuf = new BABYLON.Color3(0, 0, 0);
                            strobe._emisBuf.set(0, 0, 0);
                            strobe.material.emissiveColor = strobe._emisBuf;
                            if (strobe.glareMaterial) {
                                strobe.glareMaterial.emissiveColor.set(0, 0, 0);
                                strobe.glareMaterial.alpha = 0;
                            }
                        }
                    });
                    const baseInterval = inDropMode ? 0.18 : (inBuildMode ? 0.32 : 0.65);
                    const intervalVariation = 0.6 + Math.random() * 1.0;
                    // Never faster than the three-flashes-a-second limit, whatever the speed or
                    // drop state: the free-running timer used to reach 9 a second in a drop.
                    this._nextStrobeBurstTime = time + Math.max(
                        STROBE_MIN_INTERVAL_S,
                        (baseInterval * intervalVariation) / strobeSpeedMultiplier
                    );
                }
                
                this.strobes.forEach((strobe) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        // A burst is 20-90 ms, shorter than one frame on a loaded headset.
                        // Counting down before drawing lit and cleared it in the same pass,
                        // so the flash never reached the screen. The frame a burst fires on
                        // is therefore drawn untouched; the countdown starts on the next.
                        if (strobe._holdFrame) strobe._holdFrame = false;
                        else strobe.flashDuration -= dt;
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    // BOOST during drops for maximum crowd impact
                    let intensityVariation = strobe.currentIntensity || 80;
                    if (inDropMode) {
                        intensityVariation *= 1.5; // 50% brighter during drops
                    }
                    // VJ Director master fader (1.0 = full, 0 = blackout). Cheap multiply.
                    intensityVariation *= (this.masterIntensity != null ? this.masterIntensity : 1.0);
                    
                    // The scheduler already creates discrete 140-200 ms flashes.
                    // Gating that short window again at 40 Hz made a newly triggered
                    // burst begin on an off phase and often disappear entirely.
                    strobe._burstOn = true;
                    
                    // scaleToRef into a per-strobe buffer: Color3.scale() allocates,
                    // and this runs once per strobe per frame for the whole flash.
                    if (!strobe._emisBuf) strobe._emisBuf = new BABYLON.Color3(0, 0, 0);
                    const emitterLevel = Math.min(36, 10 + intensityVariation * 0.30);
                    this.cachedColors.ledMonoWhite.scaleToRef(emitterLevel, strobe._emisBuf);
                    strobe.material.emissiveColor = strobe._emisBuf;
                    if (strobe.glareMaterial) {
                        if (!strobe._glareBuf) strobe._glareBuf = new BABYLON.Color3(0, 0, 0);
                        this.cachedColors.ledMonoWhite.scaleToRef(emitterLevel * 0.75, strobe._glareBuf);
                        strobe.glareMaterial.emissiveColor = strobe._glareBuf;
                        strobe.glareMaterial.alpha = 0.95;
                    }
                    // Per-fixture point lights stay out of the uniform budget. The
                    // emissive lamp is the fixture; the room fill is the ambient impulse.
                    if (strobe.light) {
                        strobe.light.intensity = intensityVariation * 200;
                        strobe.light.range = 80 + (intensityVariation * 0.8);
                    }
                    
                    if (strobe.flashDuration <= 0) {
                        strobe._emisBuf.set(0, 0, 0);
                        if (strobe.glareMaterial) {
                            strobe.glareMaterial.emissiveColor.set(0, 0, 0);
                            strobe.glareMaterial.alpha = 0;
                        }
                        if (strobe.light) strobe.light.intensity = 0;
                    }
                }
                });
                
                // Drive shared strobe flash light from max strobe intensity
                if (this.strobeFlashLight) {
                    let maxIntensity = 0;
                    let brightestStrobe = null;
                    this.strobes.forEach(s => {
                        if (s.flashDuration > 0) {
                            if (s._burstOn && s.currentIntensity > maxIntensity) {
                                maxIntensity = s.currentIntensity;
                                brightestStrobe = s;
                            }
                        }
                    });
                    if (maxIntensity > 0) {
                        const impulse = VRClubAnimationFinish.strobeImpulse(this);
                        if (this.strobePattern === 'chase' && brightestStrobe && this.strobeFlashLight.position) {
                            this.strobeFlashLight.position.copyFrom(brightestStrobe.mesh.position);
                        } else if (this.strobeFlashLight.position) {
                            this.strobeFlashLight.position.set(0, 8, -12);
                        }
                        this.strobeFlashLight.intensity = maxIntensity * 14 * master;
                        // Leave the point light disabled for life. Enabling it takes
                        // slot 0 of every material (it is created before ambient) and
                        // the measured cost was ~19 ms per flash. Frozen room materials
                        // cannot see a mid-frame enable anyway. The hemispheric impulse
                        // below is the room fill.
                        if (ambient) {
                            this._preStrobeAmbientIntensity = ambient.intensity;
                            ambient.intensity = ambient.intensity + (impulse.ambient - ambient.intensity) * master;
                        }
                        if (this.strobeRetinalFlash?.color) {
                            this.strobeRetinalFlash.color.a = impulse.retinal * master;
                        }
                        // Brief bloom spike for blinding strobe effect. Captured per
                        // burst (cleared at the top of this function), so a pipeline swap
                        // on VR entry cannot leak a stale desktop bloomWeight into the
                        // freshly created VR pipeline.
                        if (this.renderPipeline && this.renderPipeline.bloomEnabled) {
                            this._preStrobeBloom = this.renderPipeline.bloomWeight;
                            this.renderPipeline.bloomWeight = this._preStrobeBloom +
                                (1.0 - this._preStrobeBloom) * master;
                            if (this.renderPipeline.imageProcessing) {
                                this._preStrobeExposure = this.renderPipeline.imageProcessing.exposure;
                                this._writeExposure(this._preStrobeExposure +
                                    (impulse.exposure - this._preStrobeExposure) * master);
                            }
                        }
                    } else {
                        this.strobeFlashLight.intensity = 0;
                    }
                }
            } else {
                // Turn off strobes when disabled
                this.strobes.forEach((strobe) => {
                    if (!strobe._emisBuf) strobe._emisBuf = new BABYLON.Color3(0, 0, 0);
                    strobe._emisBuf.set(0, 0, 0);
                    strobe.material.emissiveColor = strobe._emisBuf;
                    if (strobe.glareMaterial) {
                        strobe.glareMaterial.emissiveColor.set(0, 0, 0);
                        strobe.glareMaterial.alpha = 0;
                    }
                    if (strobe.light) strobe.light.intensity = 0;
                    strobe.flashDuration = 0;
                });
                if (this.strobeFlashLight) this.strobeFlashLight.intensity = 0;
                this._nextStrobeBurstTime = undefined;
            }
        }

    }

    /** Room impulse for a strobe burst, from vrSettings (desktop values when the config is absent). */
    static strobeImpulse(club) {
        const settings = club.vrSettings && (club.isInVRMode ? club.vrSettings.vr : club.vrSettings.desktop);
        return (settings && settings.strobeImpulse) || { ambient: 3.2, retinal: 0.18, exposure: 2.1 };
    }

    /**
     * Is a beat-locked strobe burst due this frame? Returns null when the strobes run on
     * their free timer. Must be called every frame while synced: it is what tracks the
     * beat edge, so skipping frames would swallow a kick.
     */
    _strobeSyncDue() {
        const sync = this.strobeSync;
        const show = this.showDirector;
        const vj = this.vjDirector;
        if (!sync || sync === 'free' || !show || !vj || !show.isDriving() ||
            typeof vj.beatNumber !== 'number' || !(vj.bpm > 0)) return null;

        const now = performance.now();
        // After any gap (first use, or the show was on a free-running look) the stored
        // beat is stale: adopt the current one silently, or the first frame would count
        // as a beat edge and fire a flash in the middle of a beat.
        if (!(now - this._strobeSyncSeen <= 250)) {
            this._strobeSyncBeat = vj.beatNumber;
            this._strobeHalfDone = now - vj.lastBeatAt >= 30000 / vj.bpm;
        }
        this._strobeSyncSeen = now;

        const edge = vj.beatNumber !== this._strobeSyncBeat;
        if (edge) {
            this._strobeSyncBeat = vj.beatNumber;
            this._strobeHalfDone = false;
        }
        let offbeat = false;
        if (!this._strobeHalfDone && now - vj.lastBeatAt >= 30000 / vj.bpm) {
            this._strobeHalfDone = true;
            offbeat = true;
        }
        switch (sync) {
            case 'beat': return edge;
            case 'offbeat': return offbeat;
            case 'bar': return edge && show._beatInBar === 0;
            case 'roll': return edge || offbeat;
            default: return null;
        }
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
            this.patternRainbowRave,        // Full spectrum rave
            this.patternUndergroundSequence, // [18] Basement film: tunnel, scope, tiles, hazard, data, sub
            this.patternWarehouse            // [19] Beat-cut bars, tiles, rings, slats, diamonds, scan, checker, radar
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

        // The wall hits on the kick and shimmers with the hi-hats. Safe Mode halves
        // the kick term through kickPulse; the shimmer is small and steady.
        this._ledLift = 1 + (this.kickPulse || 0) * 0.7 + (audioData.hasAudio ? (audioData.treble || 0) * 0.3 : 0);
        
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
        if (!showOwnsPattern && (this.ledLastColorChange === -1 || time - this.ledLastColorChange > colorChangeTime)) {
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.ledLastColorChange = time;
        }
        
        // Execute current pattern with error handling
        const currentPattern = patterns[this.ledPattern];
        const activeColor = showOwnsPattern && !this.ledMonochrome && this.ledShowColor
            ? this.ledShowColor
            : colors[this.ledColorIndex % colors.length];
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
        this._applyLedLevel(time);
    }

    /**
     * ACCOMPANIMENT LEVEL. A look can run the wall quietly (ledWallLevel < 1) so it complements
     * the beams without taking the room. A final pass, so it holds for every pattern, including
     * the ones that write their own colours. A dimmed wall eases in from dark when it is first lit
     * (it must not pop on under a beam cue); a full-strength wall is exactly as it always was,
     * because the hits depend on it landing at once.
     */
    _applyLedLevel(time) {
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));
        const target = (this.ledWallLevel == null ? 1 : this.ledWallLevel) * master;
        if (target >= 0.999) {
            this._ledFade = 1;
        } else {
            const relit = this._ledFadeT === undefined || time - this._ledFadeT > 0.25;
            if (relit) this._ledFade = 0;
            const dtFade = relit ? 0 : Math.min(0.1, Math.max(0, time - this._ledFadeT));
            this._ledFade += (target - this._ledFade) * (1 - Math.exp(-dtFade * 2.5));
        }
        this._ledFadeT = time;
        const level = this._ledFade;
        if (level < 0.999) {
            for (let i = 0; i < this.ledPanels.length; i++) {
                const panel = this.ledPanels[i];
                const c = panel.material.emissiveColor;
                const m = panel.colorBuffer;
                m.r = c.r * level; m.g = c.g * level; m.b = c.b * level;
                panel.material.emissiveColor = m;
            }
        }
    }
}
window.VRClubAnimationFinish = VRClubAnimationFinish;
