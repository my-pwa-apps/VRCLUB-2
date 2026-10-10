'use strict';
const SPOT_FLASH_BASE_S = 0.040;
const SPOT_FLASH_MIN_S = 0.022;
const SPOT_FLASH_MIN_INTERVAL_S = 0.34;
// Corner offsets (x, y) of a laser surface-dot quad, in the batch's vertex order.
const LASER_DOT_CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
class VRClubAnimationFixtures extends VRClubAnimationCore {
    updateLEDWallPass(ctx) {
        const { time, audio: audioData } = ctx;

        // Update LED wall animations
        // CRITICAL FIX: Handle both modular and legacy systems
        if (this.useModularSystems && this.systems.ledWall) {
            this.systems.ledWall.setActive(this.ledWallActive);
            this.systems.ledWall.update(time, audioData);
        } else if (this.ledWallActive) {
            // Legacy update method; final brightness is applied in _applyLedLevel().
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && this.ledPanels.length > 0 && !this.ledWallActive) {
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
        this._flushLedWall();
    }

    /** Copy each panel's colour into the wall texture (one texel per panel); the wall is a single draw. */
    _flushLedWall() {
        const wall = this._ledWall;
        if (!wall || !this.ledPanels) return;
        const data = wall.buffer;
        const panels = this.ledPanels;
        for (let i = 0; i < panels.length; i++) {
            const panel = panels[i];
            const c = panel.material.emissiveColor;
            const o = (panel.row * wall.cols + panel.col) * 4;
            if (wall.useFloat) {
                data[o] = c.r; data[o + 1] = c.g; data[o + 2] = c.b;
            } else {
                data[o] = Math.min(255, Math.max(0, c.r * 255));
                data[o + 1] = Math.min(255, Math.max(0, c.g * 255));
                data[o + 2] = Math.min(255, Math.max(0, c.b * 255));
            }
            data[o + 3] = wall.useFloat ? 1 : 255;
        }
        wall.texture.update(data);
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
                } else if (phase === 'strobe_attack' && !this.photosensitiveSafeMode) {
                    // White strobe sync with floor (~3 Hz full on/off). Safe Mode falls
                    // through to the slow colour cycle: the legacy cycler still reaches
                    // this phase whenever the Show Director is switched off.
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

    /**
     * Ceiling laser projectors. Every beam is aimed, clipped against the room's interior faces and written
     * into the shared ribbon batch (see _createLaserBeamBatch) together with the dot it throws on that face.
     *
     * The look follows how a show beam is actually seen in haze:
     *  - it is only visible through scatter, so its brightness follows the haze, never the fog colour;
     *  - haze scatters forward (Henyey-Greenstein, g 0.45): a beam running toward the viewer glows several
     *    times brighter than one seen side-on, and one running away is fainter;
     *  - the ribbon is never narrower than a few pixels, and its brightness is divided by that widening,
     *    so a distant beam stays a fine line instead of aliasing into dashes or swelling into a bar;
     *  - it diverges ~1.5 mrad and loses a little power to scatter along its length (Beer-Lambert);
     *  - it ends on whatever face it reaches, with a dot whose brightness follows its angle of incidence.
     */
    updateLasers(ctx) {
        const { time, dtScale } = ctx;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));

        // ALWAYS SYNCHRONIZED MODE - no random mode
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

        const batch = this.laserBeamBatch;
        if (!this.lasers || !batch) return;
        const color = this._laserColor();

        if (!this.lasersActive || master <= 0.001) {
            if (batch.mesh.isEnabled()) batch.mesh.setEnabled(false);
            if (batch.hitMesh.isEnabled()) batch.hitMesh.setEnabled(false);
            for (const laser of this.lasers) {
                if (laser.emitterMat) laser.emitterMat.emissiveColor = this.cachedColors.black;
            }
            return;
        }

        const view = this._laserView();
        const camPos = view.cam;
        const pixelAngle = view.pixelAngle;
        // The ambient hazer always holds a thin haze; the machines thicken it. With smoke off the air is clear.
        const smokeNow = Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1);
        const haze = Math.min(1, Math.max(0.25, (this.fogIntensity == null ? 1 : this.fogIntensity) / 1.5)) *
            (0.2 + 0.8 * smokeNow);
        const kick = this.kickPulse || 0;
        const scatter = 0.35 + 0.65 * haze;
        const base = 0.6 * scatter * master * (1 + kick * 0.5) * (this.isInVRMode ? 1.15 : 1);
        const dotBase = 0.95 * master * (1 + kick * 0.3);

        const dir = this.vecPool.laserDir;
        const hit = batch.hit;
        let slot = 0;
        for (let i = 0; i < this.lasers.length; i++) {
            const laser = this.lasers[i];
            if (laser.emitter) {
                if (!laser.originPos) laser.originPos = new BABYLON.Vector3(0, 0, 0);
                laser.originPos.copyFrom(laser.emitter.getAbsolutePosition());
            }
            const speed = (this.laserSpeed || 1.0) * dtScale;
            laser.rotation += 0.00375 * speed;
            laser.tiltPhase += 0.005 * speed;
            const o = laser.originPos;

            for (const beam of laser.beams) {
                this._aimLaserBeam(laser, beam, i, dir);
                this._intersectRoomInterior(o.x, o.y, o.z, dir.x, dir.y, dir.z, hit);
                beam.length = hit.t;
                const index = Number.isInteger(beam.slot) ? beam.slot : slot;
                this._writeLaserBeamQuad(batch, index, o, dir, hit, camPos, pixelAngle, base, dotBase);
                slot++;
            }

            if (laser.emitterMat) {
                if (!laser._emitterEmissiveBuf) laser._emitterEmissiveBuf = new BABYLON.Color3(0, 0, 0);
                color.scaleToRef(3 * master, laser._emitterEmissiveBuf);
                laser.emitterMat.emissiveColor = laser._emitterEmissiveBuf;
            }
        }

        batch.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, batch.positions);
        batch.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, batch.colors);
        batch.hitMesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, batch.hitPositions);
        batch.hitMesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, batch.hitColors);
        batch.material.emissiveColor.copyFrom(color);
        batch.hitMaterial.emissiveColor.copyFrom(color);
        if (!batch.mesh.isEnabled()) batch.mesh.setEnabled(true);
        if (!batch.hitMesh.isEnabled()) batch.hitMesh.setEnabled(true);
    }

    /** Beam direction for one beam of a projector (writes `out`). */
    _aimLaserBeam(laser, beam, laserIndex, out) {
        if (laser.type === 'multi') {
            // A grating splits the beam into a ring; the galvo spins the ring and breathes its cone,
            // so the dots on the floor circle and slowly open and close.
            const a = (beam.beamIndex / laser.beams.length) * Math.PI * 2 + laser.rotation * 2;
            const tilt = Math.PI / 5 + 0.09 * Math.sin(laser.tiltPhase + laserIndex * 2.1);
            out.set(Math.sin(a) * Math.sin(tilt), -Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
        } else if (laser.type === 'spread') {
            const a = laser.rotation + (beam.beamIndex - 1) * 0.4;
            const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.2;
            out.set(Math.sin(a) * Math.sin(tilt), -Math.cos(tilt), Math.cos(a) * Math.sin(tilt));
        } else if (laser.type === 'single') {
            const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.3;
            out.set(Math.sin(laser.rotation) * Math.sin(tilt), -Math.cos(tilt), Math.cos(laser.rotation) * Math.sin(tilt));
        } else {
            out.set(0, -1, 0);
        }
        return out;
    }

    /** Relative brightness of haze scatter toward the viewer (Henyey-Greenstein, 1 when seen side-on). */
    _laserScatterGain(cosToViewer) {
        const g = 0.45, g2 = g * g;
        const phase = Math.pow(1 + g2, 1.5) / Math.pow(1 + g2 - 2 * g * cosToViewer, 1.5);
        return Math.min(2.4, Math.max(0.6, 0.45 + 0.55 * phase));
    }

    /** Write one beam ribbon and its surface dot into the batch buffers. Allocates nothing. */
    _writeLaserBeamQuad(batch, slot, o, d, hit, cam, pixelAngle, base, dotBase) {
        const L = hit.t;
        const ex = o.x + d.x * L, ey = o.y + d.y * L, ez = o.z + d.z * L;
        const P = batch.positions, C = batch.colors;
        const p = slot * 12, c = slot * 16;
        // Physical width: ~4 mm at the aperture, ~1.5 mrad divergence.
        const core0 = 0.004 * 8, core1 = (0.004 + 0.0015 * L) * 8;
        this._writeLaserBeamEnd(P, C, p, c, 0, 1, o.x, o.y, o.z, d, core0, base, cam, pixelAngle);
        this._writeLaserBeamEnd(P, C, p, c, 3, 2, ex, ey, ez, d, core1, base * Math.exp(-0.02 * L), cam, pixelAngle);

        // The dot on the surface the beam reaches.
        const HP = batch.hitPositions, HC = batch.hitColors;
        const nx = hit.nx, ny = hit.ny, nz = hit.nz;
        if (L <= 0 || (nx === 0 && ny === 0 && nz === 0)) {
            for (let k = 0; k < 4; k++) HC[c + k * 4 + 3] = 0;
            return;
        }
        const t1x = Math.abs(ny) > 0.9 ? 1 : 0, t1y = Math.abs(ny) > 0.9 ? 0 : 1, t1z = 0;
        const t2x = ny * t1z - nz * t1y, t2y = nz * t1x - nx * t1z, t2z = nx * t1y - ny * t1x;
        const footprint = 0.045 + 0.0015 * L;
        let size = footprint, dotAlpha = dotBase * (0.4 + 0.6 * Math.abs(d.x * nx + d.y * ny + d.z * nz));
        if (cam) {
            const dist = Math.max(0.05, Math.hypot(hit.px - cam.x, hit.py - cam.y, hit.pz - cam.z));
            size = Math.max(footprint, dist * pixelAngle * 5);
            dotAlpha *= Math.sqrt(Math.max(0.15, footprint / size));
        }
        const cx = hit.px + nx * 0.012, cy = hit.py + ny * 0.012, cz = hit.pz + nz * 0.012;
        for (let k = 0; k < 4; k++) {
            const a1 = LASER_DOT_CORNERS[k * 2] * size, a2 = LASER_DOT_CORNERS[k * 2 + 1] * size;
            HP[p + k * 3] = cx + t1x * a1 + t2x * a2;
            HP[p + k * 3 + 1] = cy + t1y * a1 + t2y * a2;
            HP[p + k * 3 + 2] = cz + t1z * a1 + t2z * a2;
            HC[c + k * 4 + 3] = Math.min(1, dotAlpha);
        }
    }

    /**
     * One end of a beam ribbon: two vertices either side of the axis, turned to face the viewer, at least
     * a few pixels wide, with alpha for the widening and for forward scatter toward the viewer.
     */
    _writeLaserBeamEnd(P, C, p, c, vi0, vi1, x, y, z, d, core, alphaIn, cam, pixelAngle) {
        let width = core, alpha = alphaIn;
        let sx, sy, sz;
        if (cam) {
            const rx = x - cam.x, ry = y - cam.y, rz = z - cam.z;
            const dist = Math.max(0.05, Math.hypot(rx, ry, rz));
            width = Math.max(core, dist * pixelAngle * 7);
            alpha *= Math.sqrt(Math.max(0.12, core / width));
            alpha *= this._laserScatterGain(-(d.x * rx + d.y * ry + d.z * rz) / dist);
            sx = d.y * rz - d.z * ry; sy = d.z * rx - d.x * rz; sz = d.x * ry - d.y * rx;
        } else {
            sx = d.z; sy = 0; sz = -d.x;
        }
        let sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-6) { sx = 1; sy = 0; sz = 0; sl = 1; }
        const k = (width * 0.5) / sl;
        P[p + vi0 * 3] = x - sx * k; P[p + vi0 * 3 + 1] = y - sy * k; P[p + vi0 * 3 + 2] = z - sz * k;
        P[p + vi1 * 3] = x + sx * k; P[p + vi1 * 3 + 1] = y + sy * k; P[p + vi1 * 3 + 2] = z + sz * k;
        const a = Math.min(1, alpha);
        C[c + vi0 * 4 + 3] = a;
        C[c + vi1 * 4 + 3] = a;
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
        // The Show Director owns colour while it drives: the director publishes
        // currentSpotColor itself (one hue per phrase, or a look's pinned hue). This
        // cycler used to keep swapping the heads to the next palette entry every few
        // seconds anyway, so a look's colour idea was overwritten with whatever came
        // next in the list. It stands down exactly like the other legacy cyclers.
        const showDriving = !!(this.showDirector && this.showDirector.isDriving());
        if (showDriving) {
            this.colorTransitionProgress = 1;
            this.lastColorChange = time;
        }
        const colorChangeInterval = this.vjDropActive ? 2 : (12 - (this.energyLevel * 8));
        if (!this.vjManualMode && !showDriving && time - this.lastColorChange > colorChangeInterval) {
            this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
            this._beginSpotColorTransition(time);
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
        
        // The automatic show returns once nobody has touched the lights for the guest's chosen time. Not at all when
        // they chose to keep their lights or to shuffle the colours: those end with AUTO SHOW.
        if (this.vjManualMode && (time - this.lastVJInteraction) > this.lightHandBackSeconds()) {
            this.vjManualMode = false;
            this.spotlightPattern = 0; // Switch to automated pattern
            if (this.showDirector && typeof this.showDirector.releaseHold === 'function') this.showDirector.releaseHold();
            log.info('🤖 Automated patterns resumed - no VJ interaction for the chosen time');
        }
    }

    /**
     * Fade the heads to `spotColorList[spotColorIndex]`. copyFrom into our own buffer: cloning allocated a Color3 per
     * switch and assigning would alias the shared palette.
     */
    _beginSpotColorTransition(time) {
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

    /** Seconds of no touch after which the automatic show takes the lights back; Infinity when the guest keeps them. */
    lightHandBackSeconds() {
        const hold = this.lightHold;
        if (hold && hold.mode !== 'resume') return Infinity;
        return (hold && hold.delay) || this.VJ_TIMEOUT || 60;
    }

    /** Moving-head spotlights: pan/tilt, beams, floor pools, gobos and fixtures. */
    updateSpotlights(ctx) {
        const { time, dtScale, audio: audioData } = ctx;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));

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
        // When no audio: use default 1.0x speed for consistent automated patterns.
        // With the kick band the heads follow the music's dynamics (calmer in a breakdown, faster when a drop lands);
        // the old band average hardly moved between the two.
        const audioSpeedMultiplier = !audioData.hasAudio ? 1.0
            : (typeof audioData.energy === 'number'
                ? 0.75 + audioData.energy * 0.6       // ~1.1x in a groove, ~0.9x in a breakdown, 1.35x on a drop
                : 1.0 + (audioData.average * 0.5));   // 1.0x to 1.5x based on audio energy
        // The beams dip toward the floor on each kick and swing back out between them: the heads move WITH the beat,
        // not only on a smooth sweep. Motion, not light, so it carries no flash.
        const kickTilt = 1 - Math.min(0.2, (this.kickPulse || 0) * 0.22);
        
        if (this.spotlights && this.lightsActive) {
            
            // SYNCHRONIZED SWEEPING - recreate iconic club vibe
            // All lights move together, sweeping their beams across the dance floor
            
            this.spotlights.forEach((spot, i) => {
                // VJ PATTERN CONTROL - spotlightPattern: 0=random, 1=static down, 2=mirror sweep, 3=crossed beams
                // Apply speed multiplier to all animated patterns
                const speedMultiplier = this.spotlightSpeed || 1.0;
                
                const dirOut = this._solveSpotDirection(i, globalPhase, audioSpeedMultiplier, speedMultiplier,
                    spot._dirOut || (spot._dirOut = { x: 0, z: 0 }));
                const dirX = dirOut.x * kickTilt;
                const dirZ = dirOut.z * kickTilt;
                
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
                
                this._animateMovingHead(spot, direction, dtScale);
                
                // PROFESSIONAL VOLUMETRIC BEAM - Hyperrealistic light cone
                // The beam must VISUALLY CONNECT to the floor light pool for realism
                if (spot.beam) {
                    const g = this._updateSpotBeamGeometry(spot, i, direction, time, dtScale, speedMultiplier);
                    const st = this._updateSpotBeamAppearance(spot, i, time, globalPhase, audioSpeedMultiplier, g);
                    this._updateSpotLightPool(spot, i, direction, time, g, st);
                    this._updateSpotGoboProjection(spot, g, st);
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
                const baseIntensity = this.isInVRMode ? 48 : 30;
                const smoothPulse = Math.sin(time * 2.5) * (this.isInVRMode ? 5 : 3);
                
                // UPGRADE: Keep diffuse in sync with specular color for projectionTexture.
                // `specular` may safely alias currentSpotColor (we own it and never let
                // anyone else mutate it). `diffuse` needs a scaled copy, so scale into a
                // per-spot buffer rather than allocating a Color3 per spotlight per frame.
                spot.light.specular = this.currentSpotColor;
                if (!spot._diffuseBuf) spot._diffuseBuf = new BABYLON.Color3(0, 0, 0);
                this.currentSpotColor.scaleToRef(this.isInVRMode ? 0.45 : 0.40, spot._diffuseBuf);
                spot.light.diffuse = spot._diffuseBuf;
                
                const lightEnabled = this.lightsActive && spot.beamVisible !== false;
                // Intensity only: toggling enabled state reshuffles every material's
                // light slots (shader recompiles on cue changes, a scene walk per
                // spot-strobe flash). See the note where the spots are created.
                spot.light.intensity = lightEnabled
                    ? (baseIntensity + smoothPulse) * (1 + (this.kickPulse || 0) * 0.9) * master
                    : 0;

                // Photometric origin is the lens, not the yoke. Snapshot before the
                // slot bind, which overwrites the first maxLights-1 lights.
                const hit = spot._surfaceHit;
                if (hit && hit.emissionPoint && spot.light.position) {
                    spot.light.position.copyFrom(hit.emissionPoint);
                }
                if (!spot._photoPos) {
                    spot._photoPos = new BABYLON.Vector3();
                    spot._photoDir = new BABYLON.Vector3();
                }
                spot._photoPos.copyFrom(spot.light.position);
                spot._photoDir.copyFrom(spot.light.direction);
                spot._photoIntensity = spot.light.intensity;
                spot._photoAngle = spot.light.angle;
                spot._photoRange = spot.light.range;
                spot._photoExponent = spot.light.exponent;
                const floorHit = hit && hit.hitSurface === 'floor';
                spot._shadeScore = (spot.light.intensity || 0) * (floorHit ? 1.2 : 1);
            });
            this._bindPhotometricSlots();
        } else if (this.spotlights) {
            // Turn off spotlights completely when not active
            this.spotlights.forEach(spot => {
                spot.light.intensity = 0;
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
            const lensIntensity = 1.6;
            
            for (let i = 0; i < this.spotlights.length; i++) {
                const spot = this.spotlights[i];
                if (!spot) continue;

                // Fixture should be lit when lights are active
                const fixtureVisible = this.lightsActive && master > 0.001;

                // QC O2: use cached refs on the spot object instead of two
                // scene.getMeshByName() calls per spot per frame (~720 hash
                // lookups/sec for 6 spotlights). The references were captured
                // at fixture-creation time in createTrussMountedLights().
                const lens = spot.lens;

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
                            targetColor.r * lensIntensity * master,
                            targetColor.g * lensIntensity * master,
                            targetColor.b * lensIntensity * master
                        );
                    } else {
                        mat.emissiveColor.copyFromFloats(0, 0, 0);
                    }
                }

            }
        }
        } // End of legacy inline spotlight animation else block
    }

    _sampleSpotFlash(time, audioSpeedMultiplier) {
        const maxRateHz = 1 / SPOT_FLASH_MIN_INTERVAL_S;
        const requestedHz = Math.min(maxRateHz, Math.max(1.6, audioSpeedMultiplier * 2.0));
        const interval = Math.max(SPOT_FLASH_MIN_INTERVAL_S, 1 / requestedHz);
        const duration = Math.max(
            SPOT_FLASH_MIN_S,
            SPOT_FLASH_BASE_S / Math.sqrt(Math.max(1, requestedHz / 2.0))
        );
        let state = this._spotFlashState;
        if (!state || time < state.lastTime) {
            state = this._spotFlashState = {
                lastTime: time,
                nextBurstAt: time,
                onUntil: -1,
                sampleTime: NaN,
                visible: false
            };
        }
        if (state.sampleTime !== time) {
            state.lastTime = time;
            while (time >= state.nextBurstAt) {
                const burstAt = state.nextBurstAt;
                const granted = typeof this._tryClubFlash !== 'function' ||
                    this._tryClubFlash(burstAt, 'moving-head', SPOT_FLASH_MIN_INTERVAL_S);
                if (granted) state.onUntil = burstAt + duration;
                state.nextBurstAt += interval;
            }
            state.sampleTime = time;
            state.visible = time < state.onUntil;
        }
        return state.visible;
    }

    /** Pan/tilt target for one spotlight from the active VJ pattern (writes out.x / out.z). */
    _solveSpotDirection(i, globalPhase, audioSpeedMultiplier, speedMultiplier, out) {
        out.x = undefined;
        out.z = undefined;
        if (this.spotlightPattern === 1) {
            // PATTERN 1: STATIC DOWN - All lights point straight down
            out.x = 0;
            out.z = 0;
            
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
            out.x = isLeftSide ? sweepValue : -sweepValue;
            
            // Also add slight Z oscillation so beams sweep front-to-back together
            const zSweep = Math.sin(sweepPhase * 0.3) * 0.25;
            out.z = zSweep;
            
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
                out.x = 0;
                out.z = -0.2; // Slight forward angle toward dance floor
            } else if (positionInGroup === 0) {
                // FRONT gobo: Sweeps from outside to inside and back
                // When crossing, it goes PAST the middle gobo position
                out.x = isLeftSide ? crossSweep : -crossSweep;
                out.z = -0.35 + Math.abs(crossSweep) * 0.2; // More forward when at extremes
            } else {
                // BACK gobo: Sweeps opposite to front (counter-phase)
                // This creates an X pattern when viewed from above
                out.x = isLeftSide ? -crossSweep : crossSweep; // Opposite of front
                out.z = 0.1 - Math.abs(crossSweep) * 0.15; // Slightly back, less when crossing
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
            
            // MAX 45 DEGREES = tan(45°) ≈ 1.0, so out.x and out.z should be ≤ 0.6 for smooth angles
            // Calculate current and next pattern positions, then blend
            
            let dirX1 = 0, dirZ1 = 0; // Current pattern
            let dirX2 = 0, dirZ2 = 0; // Next pattern
            
            if (!isSweepMode) {
                // Static mode: use fixed positions based on spotlight index
                const staticPos = this._spotStaticPositions[i % this._spotStaticPositions.length];
                out.x = staticPos.x;
                out.z = staticPos.z;
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
                out.x = dirX1 * (1 - blendFactor) + dirX2 * blendFactor;
                out.z = dirZ1 * (1 - blendFactor) + dirZ2 * blendFactor;
            } // End sweep mode else block
        } // End pattern 0 (random/automated) else block
        return out;
    }

    /** Servo-smoothed yoke (pan) and head (tilt) motion toward the beam direction. */
    _animateMovingHead(spot, direction, dtScale) {
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
            
            // Lens and bezel are children of the head and move automatically.
        } else if (spot.fixture) {
            // Fallback for legacy fixtures (if any)
            if (!spot._targetPoint) spot._targetPoint = new BABYLON.Vector3();
            direction.scaleToRef(8, spot._targetPoint);
            spot.basePos.addToRef(spot._targetPoint, spot._targetPoint);
            spot.fixture.lookAt(spot._targetPoint);
        }
    }

    /**
     * Materials only shade ambient + the first maxLights-1 spots. Copy the
     * strongest surface-hitting heads into those slots from the per-frame
     * snapshot so a bright beam on spot4 still lights the floor it hits.
     * Never enables or disables a light.
     */
    _bindPhotometricSlots() {
        const spots = this.spotlights;
        if (!spots || spots.length < 2) return;
        const slots = Math.max(1, (this.maxLights || 3) - 1);
        if (!this._photometricOrder || this._photometricOrder.length < spots.length) {
            this._photometricOrder = new Array(spots.length);
        }
        const order = this._photometricOrder;
        const n = spots.length;
        for (let i = 0; i < n; i++) order[i] = i;
        for (let i = 1; i < n; i++) {
            const key = order[i];
            const keyScore = spots[key]._shadeScore || 0;
            let j = i - 1;
            while (j >= 0 && (spots[order[j]]._shadeScore || 0) < keyScore) {
                order[j + 1] = order[j];
                j--;
            }
            order[j + 1] = key;
        }
        for (let s = 0; s < slots && s < n; s++) {
            const src = spots[order[s]];
            const dst = spots[s].light;
            if (!src || !src._photoPos || !dst || !dst.position || !dst.direction) continue;
            dst.position.copyFrom(src._photoPos);
            dst.direction.copyFrom(src._photoDir);
            dst.intensity = src._photoIntensity || 0;
            if (src._photoAngle != null) dst.angle = src._photoAngle;
            if (src._photoRange != null) dst.range = src._photoRange;
            if (src._photoExponent != null) dst.exponent = src._photoExponent;
        }
    }

    /** Emission point and the first surface (floor or wall) the beam centreline hits. */
    _resolveSpotSurfaceHit(spot, direction) {
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
        
        const hit = spot._surfaceHit || (spot._surfaceHit = {});
        hit.centerDistanceToSurface = centerDistanceToSurface;
        hit.hitSurface = hitSurface;
        hit.emissionPoint = emissionPoint;
        hit.surfaceIntersection = surfaceIntersection;
        return hit;
    }

    /**
     * Beam geometry: emission point, first surface hit, length/extension, transform,
     * clip plane and texture scroll. Returns the per-spot geometry record the
     * appearance, light-pool and gobo passes read.
     */
    _updateSpotBeamGeometry(spot, i, direction, time, dtScale, speedMultiplier) {
        const { centerDistanceToSurface, hitSurface, emissionPoint, surfaceIntersection } = this._resolveSpotSurfaceHit(spot, direction);
        const BACK_WALL_Z = ROOM_BOUNDS.z.min;
        const LEFT_WALL_X = ROOM_BOUNDS.x.min;
        const RIGHT_WALL_X = ROOM_BOUNDS.x.max;

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
        
        const g = spot._beamGeom || (spot._beamGeom = {});
        g.cosTheta = cosTheta;
        g.beamMidpoint = beamMidpoint;
        g.beamLength = beamLength;
        g.baseScale = baseScale;
        g.tiltStretch = tiltStretch;
        g.centerBeamLength = centerBeamLength;
        g.hitSurface = hitSurface;
        g.surfaceIntersection = surfaceIntersection;
        return g;
    }

    /** Beam visibility (strobe), glow beam and emissive colour/alpha. Returns the per-spot beam state. */
    _updateSpotBeamAppearance(spot, i, time, globalPhase, audioSpeedMultiplier, g) {
        const { beamMidpoint, beamLength, baseScale, tiltStretch } = g;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));
        // UPDATE GLOW BEAM - Match main beam positioning (unparent and world space)
        // Beam visibility and color - HYPERREALISTIC with subtle variation + FLASHING
        // Strobe is controlled by both toggle button AND spotlight mode
        // Strobe is active when: button is on AND mode includes strobe (0 or 2)
        const isStrobeMode = (this.spotlightMode === 0 || this.spotlightMode === 2);
        const isStrobeEnabled = !this.photosensitiveSafeMode && this.spotStrobeActive && isStrobeMode;
        
        let beamVisible = this.lightsActive && master > 0.001;
        if (isStrobeEnabled) {
            beamVisible = beamVisible && this._sampleSpotFlash(time, audioSpeedMultiplier);
        }
        
        // Store beamVisible on spot for fixture sync
        spot.beamVisible = beamVisible;

        // Physics-based surface brightness (Lambert x inverse-square). Starts at 1.0
        // here and is refined by _updateSpotLightPool() (st.physicsIntensity), which
        // the gobo pass reads. Stays 1.0 on frames where the beam misses a surface.
        const physicsIntensity = 1.0;

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
            this.currentSpotColor.scaleToRef(0.15 * master, spot._beamGlowEmisBuf);
            spot.beamGlowMat.emissiveColor = spot._beamGlowEmisBuf;
        }
        // Remember whether the beam is currently lit. The authoritative
        // `spot.light.intensity` write happens ~350 lines below; assigning it
        // here was dead in every case, which is why the strobe modes flashed
        // the beam mesh and the pool while the SpotLight stayed pinned at ~18
        // and the floor never actually went dark between flashes.
        spot.beamVisible = beamVisible;
        
        // The additive cone carries the palette colour directly; visibility belongs
        // in alpha so its core stays defined instead of washing into a soft glow.
        const spotColor = this.currentSpotColor;
        if (!spot._beamEmisBuf) spot._beamEmisBuf = new BABYLON.Color3(0, 0, 0);
        spotColor.scaleToRef(master, spot._beamEmisBuf);
        spot.beamMat.emissiveColor = spot._beamEmisBuf;
        
        // CRITICAL: Store the actual beam color for fixture sync (BASE color, not scaled)
        // This ensures fixture uses EXACT same color as beam
        spot.currentBeamColor = spotColor;
        
        const smokeNow = Number.isFinite(this._smokeLevel) ? this._smokeLevel : (this.smokeActive === false ? 0 : 1);
        const medium = Math.min(1, Math.max(0,
            spot._mediumDensity == null ? 0.5 * (0.2 + 0.8 * smokeNow) : spot._mediumDensity));
        const hazeVisibility = 0.35 + 0.65 * medium;
        const coneAngle = spot.light && Number.isFinite(spot.light.angle)
            ? spot.light.angle
            : Math.PI / 6;
        const narrowGain = Math.min(1.5, Math.max(0.75, 1.6 - coneAngle * 1.6));
        spot.beamMat.alpha = beamVisible
            ? Math.min(0.99, hazeVisibility * 0.55 * narrowGain * (1 + (this.kickPulse || 0) * 0.25))
            : 0;
        
        const st = spot._beamState || (spot._beamState = {});
        st.beamVisible = beamVisible;
        st.physicsIntensity = physicsIntensity;
        st.spotColor = spotColor;
        st.master = master;
        return st;
    }

    /** Floor/wall light pool projected where the beam lands; updates st.physicsIntensity. */
    _updateSpotLightPool(spot, i, direction, time, g, st) {
        const { centerBeamLength, hitSurface, surfaceIntersection } = g;
        const { beamVisible, spotColor } = st;
        const master = st.master == null ? 1 : st.master;
        let { physicsIntensity } = st;
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
                physicsIntensity = lambertFactor * clampedInvSq * master;
                
                // Subtle atmospheric shimmer (dust particles in beam)
                const shimmer = 1.0 + Math.sin(time * 1.8 + i * 0.9) * 0.05;
                
                // === POSITION POOL AT ACTUAL SURFACE INTERSECTION ===
                // The pool appears where the beam hits the surface (floor or wall)
                // Position and orientation depend on which surface was hit
                
                // Store hit surface for reference
                spot.hitSurface = hitSurface;
                
                this._placeSpotPool(spot, direction, hitSurface, surfaceIntersection, minorRadius, majorRadius, tiltDirX, tiltDirZ, tiltMagnitude);
                spot.lightPool.visibility = 1.0;
                
                // === POOL MATERIAL - Physics-based brightness ===
                // Make pool clearly visible on the surface
                // Wall hits get boosted brightness since wall materials are darker
                const surfaceBrightnessBoost = (hitSurface === 'floor') ? 1.0 : 1.6;
                const poolBrightness = 3.4 * physicsIntensity * shimmer * surfaceBrightnessBoost;
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
                this._updateSpotPoolGlow(spot, hitSurface, minorRadius, majorRadius, tiltMagnitude, physicsIntensity, shimmer, spotColor);
                
            } else {
                // CRITICAL: Hide floor pools immediately when lights turn off or flashing off
                spot.lightPool.visibility = 0;
                if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                // Disable pool light when beam is off
                if (spot.poolLight) spot.poolLight.setEnabled(false);
            }
        }
        
        st.physicsIntensity = physicsIntensity;
    }

    /** Position and orient the light pool on the floor or wall the beam hits. */
    _placeSpotPool(spot, direction, hitSurface, surfaceIntersection, minorRadius, majorRadius, tiltDirX, tiltDirZ, tiltMagnitude) {
        const BACK_WALL_Z = ROOM_BOUNDS.z.min;
        const LEFT_WALL_X = ROOM_BOUNDS.x.min;
        const RIGHT_WALL_X = ROOM_BOUNDS.x.max;
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
    }

    /** Penumbra scatter halo around the light pool (larger on rough walls). */
    _updateSpotPoolGlow(spot, hitSurface, minorRadius, majorRadius, tiltMagnitude, physicsIntensity, shimmer, spotColor) {
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
                const glowBrightness = 0.95 * physicsIntensity * shimmer * wallScatterBoost;
                if (!spot._poolGlowEmisBuf) spot._poolGlowEmisBuf = new BABYLON.Color3(0, 0, 0);
                spotColor.scaleToRef(glowBrightness, spot._poolGlowEmisBuf);
                spot.poolGlowMat.emissiveColor = spot._poolGlowEmisBuf;
                const baseGlowAlpha = (hitSurface === 'floor') ? 0.35 : 0.5;
                spot.poolGlowMat.alpha = baseGlowAlpha * Math.min(1.0, physicsIntensity);
            }
        }
    }

    /** Gobo pattern projection on the surface the beam hits. */
    _updateSpotGoboProjection(spot, g, st) {
        const { hitSurface } = g;
        const { beamVisible, physicsIntensity, spotColor } = st;
        // === GOBO PROJECTION UPDATE ===
        if (spot.goboProjection) {
            // An untextured gobo disc is a hard flat circle; only a real pattern may replace the soft pool.
            const hasPattern = !!(spot.goboMat && spot.goboMat.emissiveTexture);
            const showGobo = this.lightsActive && this.goboEnabled && beamVisible && hasPattern;
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
