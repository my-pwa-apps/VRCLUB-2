'use strict';

class LEDPatternMethods {
    /**
     * Helper method to update LED panel emissive colors
     * Reduces code duplication across pattern methods
     * PERFORMANCE: Uses direct color assignment when possible, avoids scale() for common values
     */
    updateLEDPanel(panel, color, brightness) {
        const c = panel.colorBuffer;
        if (brightness === 0) {
            c.r = 0; c.g = 0; c.b = 0;
        } else if (brightness >= 0.99) {
            c.r = color.r; c.g = color.g; c.b = color.b;
        } else {
            c.r = color.r * brightness;
            c.g = color.g * brightness;
            c.b = color.b * brightness;
        }
        panel.material.emissiveColor = c;
    }

    // === IMMERSIVE DANCE CLUB PATTERNS ===

    /**
     * patternHypnoticSpiral — flagship "infinite vortex" visual.
     *
     * Two counter-rotating logarithmic spirals layered with a per-radius hue
     * cycle and a bass-driven breathing zoom. On a 21×10 LED wall this reads
     * as a deep, rainbow tunnel pulling the viewer in on every kick — the
     * classic trance/psy visual that disappears the back wall in VR.
     *
     * Design choices:
     *  - Soft sin-band edges (not on/off) so the effect survives bloom and
     *    the bezel gaps between tiles instead of looking like a strobe grid.
     *  - 3 outer arms + 5 inner arms counter-rotating → parallax / depth.
     *  - Hue precomputed once per frame into a 64-slot palette so we do not
     *    allocate a Color3 per panel per frame (210 panels × 60fps).
     *  - Aspect-corrected radius (cols/rows ratio) so circles read as circles
     *    on the wide grid instead of stretched ellipses.
     */
    patternHypnoticSpiral(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows; // ~2.1 — squash Y so polar = circles, not ovals

        // --- Audio reactivity -------------------------------------------------
        const hasAudio = audioData && audioData.hasAudio;
        const bass = hasAudio ? audioData.bass : 0;
        const mid  = hasAudio ? (audioData.mid || 0) : 0;

        // Smoothed bass envelope → drives the "breathing" zoom of the tunnel.
        // Fast attack, slow release feels musical and avoids jitter.
        if (this._spiralBassEnv === undefined) this._spiralBassEnv = 0;
        const target = bass;
        const k = target > this._spiralBassEnv ? 0.45 : 0.06; // attack / release
        this._spiralBassEnv += (target - this._spiralBassEnv) * k;
        const breath = this._spiralBassEnv; // 0..1

        // Without audio, fake a slow musical breath at ~0.5 Hz so the wall
        // still looks alive in silence.
        const fakeBreath = hasAudio ? 0 : (0.35 + 0.35 * Math.sin(time * Math.PI));
        const zoom = 1.0 + breath * 0.9 + fakeBreath * 0.5; // tunnel pumps in on bass

        // --- Per-frame hue palette (64 entries) -------------------------------
        // Cycle the whole rainbow every ~12s; mids nudge it faster for variety.
        const PALETTE_N = 64;
        if (!this._spiralPalette || this._spiralPalette.length !== PALETTE_N) {
            this._spiralPalette = Array.from({ length: PALETTE_N }, () => new BABYLON.Color3());
        }
        const hueBase = (time * 30 + mid * 60) % 360; // deg/sec
        const hueSpread = 280; // how much of the spectrum is visible at once
        for (let i = 0; i < PALETTE_N; i++) {
            const h = (hueBase + (i / PALETTE_N) * hueSpread) % 360;
            BABYLON.Color3.HSVtoRGBToRef(h, 1.0, 1.0, this._spiralPalette[i]);
        }

        // --- Spiral parameters ------------------------------------------------
        const armsOuter   = 3;          // 3-arm outer spiral
        const armsInner   = 5;          // 5-arm inner spiral, counter-rotating
        const pitchOuter  = 0.9;        // tightness — higher = tighter coil
        const pitchInner  = 1.4;
        const spinOuter   =  0.9 + breath * 1.4;  // rad/sec
        const spinInner   = -1.6 - breath * 2.0;  // opposite direction
        const bandSharp   = 1.6;        // >1 sharpens the bright bands

        // Re-use cached black to clear dark panels without alloc
        const BLACK = this.cachedColors.black;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];

            // Polar coords from center, aspect corrected, then zoomed by bass
            const dx = (panel.col - centerX);
            const dy = (panel.row - centerY) * aspect;
            const r  = Math.sqrt(dx * dx + dy * dy) / zoom;
            const theta = Math.atan2(dy, dx);

            // Two counter-rotating logarithmic spirals.
            // Using log(r) gives the "infinite tunnel" feel — bands stay
            // perceptually evenly spaced as you zoom.
            const logR = Math.log(r + 0.6);
            const phaseOuter = armsOuter * theta + spinOuter * time - logR * pitchOuter * 6;
            const phaseInner = armsInner * theta + spinInner * time - logR * pitchInner * 6;

            // Soft band: sin → [0,1], then sharpen for crisp arms with smooth edges
            const bandO = Math.pow(Math.max(0, Math.sin(phaseOuter) * 0.5 + 0.5), bandSharp);
            const bandI = Math.pow(Math.max(0, Math.sin(phaseInner) * 0.5 + 0.5), bandSharp);

            // Combine layers — outer dominates, inner adds shimmer
            let intensity = bandO * 0.85 + bandI * 0.55;

            // Center hotspot: brighter & whiter near the vortex eye, pulsing on bass
            const eye = Math.exp(-r * 0.55) * (0.6 + breath * 0.8);
            intensity = Math.min(1.0, intensity + eye);

            if (intensity < 0.04) {
                panel.material.emissiveColor = BLACK;
                continue;
            }

            // Hue depends on radius (rainbow rings) + a slow rotation so the
            // colors themselves spiral through the tunnel.
            const hueIdx = ((r * 4 + time * 2) | 0) % PALETTE_N;
            const safeIdx = hueIdx < 0 ? hueIdx + PALETTE_N : hueIdx;
            this.updateLEDPanel(panel, this._spiralPalette[safeIdx], intensity);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Shared helper for the "shapes growing outward" hypnotic family.
    // Maintains a small ring-buffer of expanding "shapes" with staggered
    // birth times so a new one is always being born while older ones are
    // still expanding & fading. Result: an endless, perfectly looping pulse
    // that the eye can lock onto for minutes.
    //
    //   key       — unique string per pattern (separate state per pattern)
    //   time      — current time
    //   spawnRate — seconds between births
    //   maxAge    — seconds a shape lives before it's recycled
    //   slots     — how many concurrent shapes
    //   onSpawn   — optional fn(shape) to assign extra props (e.g. position)
    // Returns the array of {birth, age, life, hue} entries (sorted oldest→newest).
    // ──────────────────────────────────────────────────────────────────────
    _ensureExpandingShapes(key, time, spawnRate, maxAge, slots, onSpawn) {
        if (!this._expandingShapes) this._expandingShapes = {};
        let state = this._expandingShapes[key];
        if (!state) {
            state = { shapes: [], lastSpawn: -spawnRate, hueCursor: 0 };
            // Pre-stagger initial births so we don't start with an empty wall
            for (let i = 0; i < slots; i++) {
                const shape = {
                    birth: time - (i * spawnRate),
                    life: maxAge,
                    hue: (i * (360 / slots)) % 360,
                    x: 0, y: 0
                };
                if (onSpawn) onSpawn(shape, i);
                state.shapes.push(shape);
            }
            state.lastSpawn = time - spawnRate * 0.5;
            this._expandingShapes[key] = state;
        }
        // Spawn new shapes when due, recycling the oldest slot
        while (time - state.lastSpawn >= spawnRate) {
            state.lastSpawn += spawnRate;
            // Find oldest shape (smallest birth)
            let oldestIdx = 0;
            for (let i = 1; i < state.shapes.length; i++) {
                if (state.shapes[i].birth < state.shapes[oldestIdx].birth) oldestIdx = i;
            }
            const shape = state.shapes[oldestIdx];
            shape.birth = state.lastSpawn;
            shape.life = maxAge;
            state.hueCursor = (state.hueCursor + 47) % 360; // pleasant non-repeating hue walk
            shape.hue = state.hueCursor;
            if (onSpawn) onSpawn(shape, oldestIdx);
        }
        // Update ages
        for (let i = 0; i < state.shapes.length; i++) {
            state.shapes[i].age = time - state.shapes[i].birth;
        }
        return state.shapes;
    }

    /**
     * patternConcentricRings — endless rings rippling outward from center.
     * Multiple rings live at once at different radii, spawning at a steady
     * cadence so the wall never goes empty. Each ring has its own hue and
     * fades as it grows, classic pond-ripple hypnosis.
     */
    patternConcentricRings(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        // Bass speeds up the ripple expansion slightly
        const expandSpeed = 4.0 + bass * 3.0; // grid units / sec

        const shapes = this._ensureExpandingShapes('rings', time, 0.55, 3.2, 6);

        const BLACK = this.cachedColors.black;
        const ringWidth = 0.9; // band thickness
        const palette = this._getOrBuildHuePalette('rings', 64);

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * aspect;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > ringWidth) continue;
                // Soft band, fade with age (life remaining)
                const band = Math.pow(1.0 - offset / ringWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                // Reuse a per-panel scratch color to avoid allocs
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternNestedSquares — square outlines blooming outward forever.
     * Same lifecycle as rings but uses Chebyshev distance (max of |dx|, |dy|)
     * so the expanding shape is a square frame instead of a circle.
     */
    patternNestedSquares(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        const expandSpeed = 3.5 + bass * 2.5;

        const shapes = this._ensureExpandingShapes('squares', time, 0.7, 3.5, 5);
        const palette = this._getOrBuildHuePalette('squares', 64);
        const BLACK = this.cachedColors.black;
        const lineWidth = 0.85;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = Math.abs(panel.col - centerX);
            const dy = Math.abs(panel.row - centerY) * aspect;
            const dist = Math.max(dx, dy); // Chebyshev → square iso-contours

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > lineWidth) continue;
                const band = Math.pow(1.0 - offset / lineWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternMandalaBloom — radial petals that grow and fade like a flower
     * opening, then another, then another. Combines an angular sin(N·θ)
     * petal mask with the same expanding-radius lifecycle so each "bloom"
     * literally opens outward from the center.
     */
    patternMandalaBloom(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;

        // Slower spawn — we want each flower fully readable
        const shapes = this._ensureExpandingShapes('mandala', time, 1.6, 4.5, 3, (s, i) => {
            // Vary petal count per bloom: 5, 6, 8 — all visually pleasing
            s.petals = [5, 6, 8][i % 3];
            s.spin = (i % 2 === 0 ? 1 : -1) * (0.3 + Math.random() * 0.4);
        });
        const palette = this._getOrBuildHuePalette('mandala', 64);
        const BLACK = this.cachedColors.black;

        const expandSpeed = 1.6 + bass * 1.2;
        const maxR = Math.sqrt(cols * cols + (rows * aspect) * (rows * aspect)) / 2;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * aspect;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const theta = Math.atan2(dy, dx);

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                if (dist > radius + 0.5) continue; // outside this bloom

                // Petal mask: sin(petals·θ + spin·t) gives N alternating lobes
                const petalRaw = Math.sin(s.petals * theta + s.spin * time);
                const petal = Math.pow(Math.max(0, petalRaw), 2);

                // Radial envelope: bright at the bloom's leading edge, fades inside
                const radialEdge = Math.exp(-Math.abs(dist - radius * 0.7) * 0.6);

                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = petal * radialEdge * lifeFade *
                                  Math.min(1, radius / maxR + 0.3);
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternRippleRain — multiple ripple sources at varied positions across
     * the wall. Each ripple spawns small at a random spot and expands until
     * it dies, while new ones continuously appear elsewhere. Creates a calm
     * but mesmerizing "rain on water" feel that loops indefinitely.
     */
    patternRippleRain(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const aspect = cols / rows;

        const shapes = this._ensureExpandingShapes('rain', time, 0.4, 2.4, 8, (s) => {
            // Random source position anywhere on the wall
            s.x = Math.random() * cols;
            s.y = Math.random() * rows;
        });
        const palette = this._getOrBuildHuePalette('rain', 64);
        const BLACK = this.cachedColors.black;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        const expandSpeed = 5.5 + bass * 3.5;
        const ringWidth = 0.7;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const dx = panel.col - s.x;
                const dy = (panel.row - s.y) * aspect;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > ringWidth) continue;
                const band = Math.pow(1.0 - offset / ringWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    // Slow-cycling hue palette shared by the expanding-shape patterns.
    // Rebuilds every ~150ms (cheap) so the colors drift over time.
    _getOrBuildHuePalette(key, n) {
        if (!this._huePalettes) this._huePalettes = {};
        const entry = this._huePalettes[key] || {
            palette: Array.from({ length: n }, () => new BABYLON.Color3()),
            builtAt: -Infinity
        };
        this._huePalettes[key] = entry;
        const now = performance.now();
        if (now - entry.builtAt > 150) {
            const palette = entry.palette;
            const hueBase = (now * 0.02) % 360; // slow drift
            for (let i = 0; i < n; i++) {
                BABYLON.Color3.HSVtoRGBToRef(
                    (hueBase + (i / n) * 360) % 360,
                    1.0,
                    1.0,
                    palette[i]
                );
            }
            entry.builtAt = now;
            return palette;
        }
        return entry.palette;
    }

    patternBassExplosion(color, time, audioData) {
        // Explosive burst from center on bass
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Trigger explosion on bass OR periodically if no audio
        const hasAudio = audioData && audioData.hasAudio;
        const bassTrigger = hasAudio && audioData.bass > 0.2;
        const autoTrigger = !hasAudio && (time - (this.lastExplosionTime || 0) > 2.0); // Every 2 seconds
        
        if ((bassTrigger || autoTrigger) && time - (this.lastExplosionTime || 0) > 0.5) {
            this.lastExplosionTime = time;
        }
        
        const age = time - (this.lastExplosionTime || 0);
        const radius = age * 30; // Expand speed
        
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            let brightness = 0;
            if (Math.abs(dist - radius) < 3 && age < 1.5) {
                brightness = Math.max(0, 1.0 - (age * 0.8)); // Fade out
            }
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternEnergyWave(color, time, audioData) {
        // Powerful wave sweeping across
        const cols = this.ledCols || 28;
        const speed = 5 + (audioData ? audioData.bass * 5 : 0);
        const wavePos = (time * speed) % (cols + 10) - 5;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.abs(panel.col - wavePos);
            const brightness = Math.max(0, 1.0 - dist / 2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternStrobe(_color, time, _audioData) {
        // Club strobe effect
        const strobeSpeed = 15; // Hz
        const on = Math.sin(time * strobeSpeed * Math.PI * 2) > 0;
        const brightness = on ? 1.0 : 0.0;
        
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor = this.cachedColors.white.scale(brightness);
        });
    }

    patternLaserScan(color, time, _audioData) {
        // Scanning laser lines
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const t = time * 2;
        
        this.ledPanels.forEach(panel => {
            // Horizontal scan
            const hScan = Math.abs(panel.row - (Math.sin(t) * 0.5 + 0.5) * rows) < 0.5;
            // Vertical scan
            const vScan = Math.abs(panel.col - (Math.cos(t * 1.3) * 0.5 + 0.5) * cols) < 0.5;
            
            const brightness = (hScan || vScan) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternTunnel(color, time, _audioData) {
        // Tunnel/vortex effect
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.max(Math.abs(panel.col - centerX), Math.abs(panel.row - centerY) * (cols/rows));
            const wave = Math.sin(dist * 0.5 - time * 4);
            const brightness = wave > 0.5 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternKaleidoscope(color, time, _audioData) {
        // Symmetrical mirroring
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2;
        const centerY = rows / 2;
        
        this.ledPanels.forEach(panel => {
            // Fold coordinates
            const x = Math.abs(panel.col - centerX);
            const y = Math.abs(panel.row - centerY);
            
            // Generate pattern based on folded coords
            const val = Math.sin(x * 0.5 + time) * Math.cos(y * 0.5 + time);
            const brightness = val > 0 ? val : 0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternDNAHelix(color, time, _audioData) {
        // Double helix
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const x = panel.col / cols * Math.PI * 4 + time * 2;
            const y1 = (Math.sin(x) * 0.5 + 0.5) * (rows - 1);
            const y2 = (Math.sin(x + Math.PI) * 0.5 + 0.5) * (rows - 1);
            
            const dist1 = Math.abs(panel.row - y1);
            const dist2 = Math.abs(panel.row - y2);
            
            const brightness = (dist1 < 1.0 || dist2 < 1.0) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternInfinityLoop(color, time, _audioData) {
        // Figure-8 motion
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const t = time * 2;
        
        // Parametric equation for infinity symbol (Lemniscate)
        const scale = Math.min(cols, rows) * 0.4;
        const cx = cols / 2;
        const cy = rows / 2;
        
        // We render the trail
        this.ledPanels.forEach(panel => {
            let minD = 100;
            // Sample points along the curve
            for(let i=0; i<20; i++) {
                const offset = i * 0.1;
                const lt = t - offset;
                const x = (scale * Math.cos(lt)) / (1 + Math.sin(lt)*Math.sin(lt));
                const y = (scale * Math.sin(lt) * Math.cos(lt)) / (1 + Math.sin(lt)*Math.sin(lt));
                
                const d = Math.sqrt(Math.pow(panel.col - (cx + x), 2) + Math.pow(panel.row - (cy + y), 2));
                minD = Math.min(minD, d);
            }
            
            const brightness = Math.max(0, 1.0 - minD);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternVUMeter(color, time, audioData) {
        // Vertical bars rising with volume
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const hasAudio = audioData && audioData.hasAudio;
        
        // Simulate frequency data if not available
        const levels = [];
        for(let i=0; i<cols; i++) {
            // Create a symmetric wave pattern that reacts to audio
            const x = (i - cols/2) / (cols/2);
            const base = Math.exp(-x*x*2); // Bell curve
            
            let audioBoost;
            if (hasAudio) {
                audioBoost = audioData.bass * (1-Math.abs(x)) + audioData.treble * Math.abs(x);
            } else {
                // Auto animation when no audio
                audioBoost = 0.3 + Math.sin(time * 5 + Math.abs(x) * 5) * 0.2;
            }
            
            levels[i] = base * audioBoost * rows * 1.5;
        }
        
        this.ledPanels.forEach(panel => {
            const brightness = panel.row < levels[panel.col] ? 1.0 : 0.0;
            // Color gradient from green to red - reuse _ledColor
            const intensity = panel.row / rows;
            this._ledColor.r = intensity;
            this._ledColor.g = 1.0 - intensity;
            this._ledColor.b = 0;
            
            if (brightness > 0) {
                panel.material.emissiveColor.copyFrom(this._ledColor);
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
            }
        });
    }

    patternEqualizerBars(color, time, audioData) {
        // Bouncing EQ columns
        const rows = this.ledRows || 8;
        const hasAudio = audioData && audioData.hasAudio;
        
        this.ledPanels.forEach(panel => {
            // Randomize height slightly with noise/time
            const noise = Math.sin(panel.col * 0.5 + time * 5) * 0.5 + 0.5;
            
            let height;
            if (hasAudio) {
                height = noise * rows * (audioData.average * 2);
            } else {
                // Auto animation
                height = noise * rows * (0.3 + Math.sin(time * 2) * 0.2);
            }
            
            const brightness = panel.row < height ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternBeatGrid(color, time, audioData) {
        // Pulsing grid on beat
        const hasAudio = audioData && audioData.hasAudio;
        
        let beat = 0.1;
        if (hasAudio) {
            beat = audioData.bass > 0.2 ? 1.0 : 0.1;
        } else {
            // Auto beat (130 BPM approx)
            beat = Math.sin(time * 13) > 0.8 ? 1.0 : 0.1;
        }
        
        this.ledPanels.forEach(panel => {
            const isGrid = panel.col % 4 === 0 || panel.row % 4 === 0;
            const brightness = isGrid ? beat : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternPixelRain(_color, time, _audioData) {
        // Digital rain effect
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const speed = 5 + (panel.col % 3);
            const y = (time * speed + panel.col * 7) % (rows + 5);
            const dist = y - panel.row;
            
            let brightness = 0;
            if (dist > 0 && dist < 4) {
                brightness = 1.0 - dist/4;
            }
            
            // Matrix green or provided color
            const rainColor = this.cachedLEDColors.matrixGreen;
            this.updateLEDPanel(panel, rainColor, brightness);
        });
    }

    patternTriangleWave(color, time, _audioData) {
        // Diagonal lines forming triangles
        this.ledPanels.forEach(panel => {
            const val = (panel.col + panel.row + time * 5) % 8;
            const brightness = val < 2 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternHexagonPulse(color, time, _audioData) {
        // Hexagonal grid approximation (staggered rows)
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2;
        const centerY = rows / 2;
        
        this.ledPanels.forEach(panel => {
            const offset = (panel.row % 2) * 0.5;
            const x = panel.col + offset;
            const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(panel.row - centerY, 2));
            
            const wave = Math.sin(dist - time * 5);
            const brightness = wave > 0.5 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternDiamondSpin(color, time, _audioData) {
        // Rotating diamond shape
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const cx = cols / 2;
        const cy = rows / 2;
        
        const angle = time;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - cx;
            const dy = panel.row - cy;
            
            // Rotate coordinates
            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;
            
            // Diamond distance (Manhattan)
            const d = Math.abs(rx) + Math.abs(ry);
            const brightness = (d < 5 && d > 4) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternCubeRotate(color, time, _audioData) {
        // 3D cube illusion (wireframe projection)
        // Simplified: rotating square projected
        this.patternDiamondSpin(color, time, _audioData); // Reuse for now as it's similar visually in 2D
    }

    patternPlasma(_color, time, _audioData) {
        // Organic plasma flow
        this.ledPanels.forEach(panel => {
            const v1 = Math.sin(panel.col * 0.1 + time);
            const v2 = Math.sin(panel.row * 0.1 + time);
            const v3 = Math.sin((panel.col + panel.row) * 0.1 + time);
            const v4 = Math.sin(Math.sqrt(panel.col*panel.col + panel.row*panel.row) * 0.1 + time);
            
            const val = (v1 + v2 + v3 + v4) / 4;
            
            // Color shift - reuse _ledColor to avoid allocation
            this._ledColor.r = Math.sin(val * Math.PI) * 0.5 + 0.5;
            this._ledColor.g = Math.sin(val * Math.PI + 2) * 0.5 + 0.5;
            this._ledColor.b = Math.sin(val * Math.PI + 4) * 0.5 + 0.5;
            
            panel.material.emissiveColor.copyFrom(this._ledColor);
        });
    }

    patternAurora(_color, time, _audioData) {
        // Wavy vertical bands
        this.ledPanels.forEach(panel => {
            const x = panel.col;
            const y = panel.row;
            
            const wave = Math.sin(x * 0.2 + time) * 2 + Math.sin(x * 0.5 + time * 2);
            const dist = Math.abs(y - (4 + wave));
            
            const brightness = Math.max(0, 1.0 - dist / 2);
            // Aurora colors (Green/Teal) - reuse cached color
            this._ledColor.r = 0;
            this._ledColor.g = Math.max(0, 1.0 - dist / 4);
            this._ledColor.b = 1.0;
            
            this.updateLEDPanel(panel, this._ledColor, brightness);
        });
    }

    patternOceanWave(_color, time, _audioData) {
        // Horizontal sine waves
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const waveHeight = Math.sin(panel.col * 0.3 + time * 2) * 2 + rows/2;
            const brightness = panel.row < waveHeight ? 1.0 : 0.0;
            this.updateLEDPanel(panel, this.cachedLEDColors.oceanBlue, brightness);
        });
    }

    patternFire(_color, time, _audioData) {
        // Rising fire columns
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            // Noise based on column and time
            const noise = Math.sin(panel.col * 543.12 + time * 2) * Math.cos(panel.col * 123.45 + time * 3);
            const height = (noise * 0.5 + 0.5) * rows * 0.8;
            
            const dist = height - panel.row;
            let brightness = 0;
            if (dist > 0) brightness = 1.0;
            if (dist > 0 && dist < 1) brightness = dist; // Fade top
            
            // Fire colors: Red -> Orange -> Yellow - reuse _ledColor
            this._ledColor.r = 1.0;
            this._ledColor.g = panel.row / rows * 0.8;
            this._ledColor.b = 0;
            
            if (brightness > 0) {
                panel.material.emissiveColor.r = this._ledColor.r * brightness;
                panel.material.emissiveColor.g = this._ledColor.g * brightness;
                panel.material.emissiveColor.b = 0;
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
            }
        });
    }

    patternConfetti(_color, time, _audioData) {
        // Random colored pixels sparkling
        this.ledPanels.forEach(panel => {
            // Random flicker based on time and position
            const rand = Math.sin(panel.col * 12.9898 + panel.row * 78.233 + time * 20);
            const on = rand > 0.95;
            
            if (on) {
                // Random color - reuse _ledColor
                this._ledColor.r = Math.sin(rand * 100) * 0.5 + 0.5;
                this._ledColor.g = Math.sin(rand * 200) * 0.5 + 0.5;
                this._ledColor.b = Math.sin(rand * 300) * 0.5 + 0.5;
                panel.material.emissiveColor.copyFrom(this._ledColor);
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
            }
        });
    }

    patternSpotlightSweep(color, time, _audioData) {
        // Moving spotlights
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        const spot1X = (Math.sin(time) * 0.5 + 0.5) * cols;
        const spot1Y = (Math.cos(time * 1.3) * 0.5 + 0.5) * rows;
        
        const spot2X = (Math.sin(time * 1.5 + Math.PI) * 0.5 + 0.5) * cols;
        const spot2Y = (Math.cos(time * 0.7) * 0.5 + 0.5) * rows;
        
        this.ledPanels.forEach(panel => {
            const d1 = Math.sqrt(Math.pow(panel.col - spot1X, 2) + Math.pow(panel.row - spot1Y, 2));
            const d2 = Math.sqrt(Math.pow(panel.col - spot2X, 2) + Math.pow(panel.row - spot2Y, 2));
            
            const b1 = Math.max(0, 1.0 - d1 / 3);
            const b2 = Math.max(0, 1.0 - d2 / 3);
            
            const brightness = Math.min(1.0, b1 + b2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternNeonPulse(color, time, _audioData) {
        // Bright outlines pulsing
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        const pulse = Math.sin(time * 5) * 0.5 + 0.5;
        
        this.ledPanels.forEach(panel => {
            const isBorder = panel.col === 0 || panel.col === cols-1 || panel.row === 0 || panel.row === rows-1;
            const brightness = isBorder ? 1.0 : pulse * 0.2;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternRainbowRave(_color, time, _audioData) {
        // Full RGB cycle
        const cols = this.ledCols || 28;
        
        this.ledPanels.forEach(panel => {
            const hue = (panel.col / cols + panel.row / 10 + time) % 1.0;
            
            // HSV to RGB - reuse _ledColor
            const h = hue * 6;
            const c = 1.0;
            const x = c * (1 - Math.abs(h % 2 - 1));
            if (h < 1) { this._ledColor.r = c; this._ledColor.g = x; this._ledColor.b = 0; }
            else if (h < 2) { this._ledColor.r = x; this._ledColor.g = c; this._ledColor.b = 0; }
            else if (h < 3) { this._ledColor.r = 0; this._ledColor.g = c; this._ledColor.b = x; }
            else if (h < 4) { this._ledColor.r = 0; this._ledColor.g = x; this._ledColor.b = c; }
            else if (h < 5) { this._ledColor.r = x; this._ledColor.g = 0; this._ledColor.b = c; }
            else { this._ledColor.r = c; this._ledColor.g = 0; this._ledColor.b = x; }
            
            panel.material.emissiveColor.copyFrom(this._ledColor);
        });
    }

    // === IMMERSIVE PULSATING PATTERNS ===
    
    patternHeartbeat(_color, time, _audioData) {
        // Rhythmic heartbeat pulse - two quick beats then pause
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Heartbeat timing: beat-beat-pause (~72 BPM heart rate feel)
        const cycle = time * 1.2; // Speed of heartbeat cycle
        const phase = cycle % 1.0;
        
        // Two pulses in quick succession
        let pulse = 0;
        if (phase < 0.15) {
            // First beat (lub)
            pulse = Math.sin(phase / 0.15 * Math.PI);
        } else if (phase > 0.2 && phase < 0.35) {
            // Second beat (dub)
            pulse = Math.sin((phase - 0.2) / 0.15 * Math.PI) * 0.8;
        }
        // Rest of cycle is pause
        
        // Heart shape approximation expanding from center
        const heartRadius = 2 + pulse * 6;
        
        this.ledPanels.forEach(panel => {
            const dx = (panel.col - centerX) / 3;
            const dy = (panel.row - centerY) / 2.5;
            
            // Heart equation: (x^2 + y^2 - 1)^3 - x^2*y^3 < 0
            const heartEq = Math.pow(dx*dx + dy*dy - 1, 3) - dx*dx * Math.pow(dy, 3);
            const inHeart = heartEq < heartRadius * 0.1;
            
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const ringMatch = Math.abs(dist - heartRadius) < 2;
            
            const brightness = (inHeart || ringMatch) ? pulse : pulse * 0.1;
            
            // Deep red/pink for heartbeat - reuse _ledColor
            this._ledColor.r = 1.0;
            this._ledColor.g = 0.1 + pulse * 0.2;
            this._ledColor.b = 0.2 + pulse * 0.1;
            this.updateLEDPanel(panel, this._ledColor, brightness);
        });
    }
    
    patternBreathing(_color, time, _audioData) {
        // Slow inhale/exhale - meditative pulsing glow
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        // Very slow breathing cycle (4 seconds per breath)
        const breathCycle = Math.sin(time * 0.5) * 0.5 + 0.5; // 0 to 1
        
        // Inhale is slower than exhale (realistic breathing)
        const breath = Math.pow(breathCycle, 0.7); // Ease in the exhale
        
        // Color shifts from cool (exhale) to warm (inhale)
        this._ledColor2.r = 0.2 + breath * 0.6;
        this._ledColor2.g = 0.1 + breath * 0.3;
        this._ledColor2.b = 0.8 - breath * 0.5;
        
        this.ledPanels.forEach(panel => {
            // Gentle radial gradient that expands/contracts with breath
            const centerX = cols / 2;
            const centerY = rows / 2;
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
            
            // Brightness peaks at center and expands outward with breath
            const expandRadius = breath * maxDist * 1.5;
            const brightness = Math.max(0, 1.0 - Math.abs(dist - expandRadius * 0.3) / (3 + breath * 5));
            
            const scaleFactor = brightness * 0.8 + 0.2;
            panel.material.emissiveColor.r = this._ledColor2.r * scaleFactor;
            panel.material.emissiveColor.g = this._ledColor2.g * scaleFactor;
            panel.material.emissiveColor.b = this._ledColor2.b * scaleFactor;
        });
    }
    
    patternShockwave(color, time, _audioData) {
        // Concentric rings expanding rapidly from center
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Multiple shockwaves at different phases
        const waveSpeed = 15;
        const waveSpacing = 8; // Distance between waves
        
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow((panel.row - centerY) * 2, 2));
            
            // Multiple expanding rings
            let brightness = 0;
            for (let i = 0; i < 4; i++) {
                const wavePos = ((time * waveSpeed + i * waveSpacing) % 30);
                const ringDist = Math.abs(dist - wavePos);
                if (ringDist < 1.5) {
                    // Intensity decreases as wave expands
                    const fade = Math.max(0, 1.0 - wavePos / 25);
                    brightness = Math.max(brightness, (1.0 - ringDist / 1.5) * fade);
                }
            }
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternPulseStar(color, time, _audioData) {
        // Star shape that pulses and rotates
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        const pulse = Math.sin(time * 4) * 0.5 + 0.5; // Fast pulse
        const rotation = time * 0.5; // Slow rotation
        const numPoints = 5;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2; // Stretch Y
            
            // Convert to polar
            const angle = Math.atan2(dy, dx) + rotation;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Star shape: radius varies with angle
            const starAngle = angle * numPoints;
            const innerRadius = 2 + pulse * 2;
            const outerRadius = 5 + pulse * 4;
            const starRadius = innerRadius + (outerRadius - innerRadius) * Math.pow((Math.cos(starAngle) + 1) / 2, 2);
            
            const brightness = dist < starRadius ? (1.0 - dist / starRadius) * (0.5 + pulse * 0.5) : 0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternCrossBeam(color, time, _audioData) {
        // Crossing beams that pulse in intensity
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Two crossing beams rotating
        const angle1 = time * 0.8;
        const angle2 = time * 0.8 + Math.PI / 2;
        
        // Pulse intensity
        const pulse1 = Math.sin(time * 6) * 0.5 + 0.5;
        const pulse2 = Math.sin(time * 6 + Math.PI) * 0.5 + 0.5;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2;
            
            // Distance to each beam line
            const dist1 = Math.abs(dx * Math.sin(angle1) - dy * Math.cos(angle1));
            const dist2 = Math.abs(dx * Math.sin(angle2) - dy * Math.cos(angle2));
            
            const beamWidth = 1.5;
            const b1 = dist1 < beamWidth ? (1.0 - dist1 / beamWidth) * pulse1 : 0;
            const b2 = dist2 < beamWidth ? (1.0 - dist2 / beamWidth) * pulse2 : 0;
            
            const brightness = Math.min(1.0, b1 + b2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternRadialPulse(color, time, _audioData) {
        // Radial rays pulsing outward from center like a sun
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        const numRays = 12;
        const rayRotation = time * 0.3;
        const rayPulse = time * 8; // Fast pulse along rays
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + rayRotation;
            
            // Check if on a ray
            const rayAngle = (angle * numRays / (2 * Math.PI) + 100) % 1.0;
            const onRay = rayAngle < 0.3 || rayAngle > 0.7;
            
            // Pulse travels outward along rays
            const pulseDist = (rayPulse % 20);
            const pulseMatch = Math.abs(dist - pulseDist) < 2;
            
            let brightness = 0;
            if (onRay) {
                brightness = 0.2; // Base ray visibility
                if (pulseMatch) {
                    brightness = 1.0 - Math.abs(dist - pulseDist) / 2;
                }
            }
            // Center always bright
            if (dist < 2) brightness = 1.0;
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternWaveCollide(color, time, _audioData) {
        // Waves from left and right that collide at center with splash
        const cols = this.ledCols || 28;
        const centerX = cols / 2 - 0.5;
        
        const waveSpeed = 8;
        const cycleDuration = cols / waveSpeed + 1;
        const cycleTime = time % cycleDuration;
        
        // Wave positions (moving toward center)
        const leftWave = cycleTime * waveSpeed;
        const rightWave = cols - cycleTime * waveSpeed;
        
        // Collision detection
        const colliding = Math.abs(leftWave - centerX) < 3 && Math.abs(rightWave - centerX) < 3;
        
        this.ledPanels.forEach(panel => {
            let brightness = 0;
            
            // Left wave
            const distLeft = Math.abs(panel.col - leftWave);
            if (distLeft < 2) {
                brightness = Math.max(brightness, 1.0 - distLeft / 2);
            }
            
            // Right wave  
            const distRight = Math.abs(panel.col - rightWave);
            if (distRight < 2) {
                brightness = Math.max(brightness, 1.0 - distRight / 2);
            }
            
            // Collision splash - vertical burst at center
            if (colliding) {
                const distCenter = Math.abs(panel.col - centerX);
                if (distCenter < 4) {
                    // Vertical splash
                    brightness = 1.0;
                }
            }
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternCellularPulse(color, time, _audioData) {
        // Organic cell-like blobs that pulse and merge
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        // Define 4 cell centers that move slowly
        if (!this._cellularCenters) {
            this._cellularCenters = Array.from({ length: 4 }, () => ({ x: 0, y: 0, pulse: 0 }));
        }
        const cells = this._cellularCenters;
        cells[0].x = cols * 0.25 + Math.sin(time * 0.5) * 3;
        cells[0].y = rows * 0.3 + Math.cos(time * 0.7) * 2;
        cells[1].x = cols * 0.75 + Math.sin(time * 0.6 + 1) * 3;
        cells[1].y = rows * 0.3 + Math.cos(time * 0.5 + 1) * 2;
        cells[2].x = cols * 0.25 + Math.sin(time * 0.4 + 2) * 3;
        cells[2].y = rows * 0.7 + Math.cos(time * 0.8 + 2) * 2;
        cells[3].x = cols * 0.75 + Math.sin(time * 0.7 + 3) * 3;
        cells[3].y = rows * 0.7 + Math.cos(time * 0.6 + 3) * 2;
        for (let i = 0; i < cells.length; i++) {
            cells[i].pulse = Math.sin(time * (3 + i * 0.5)) * 0.5 + 0.5;
        }

        for (let panelIndex = 0; panelIndex < this.ledPanels.length; panelIndex++) {
            const panel = this.ledPanels[panelIndex];
            let totalInfluence = 0;

            // Sum influence from all cells (metaball-like)
            for (let i = 0; i < cells.length; i++) {
                const cell = cells[i];
                const dist = Math.sqrt(Math.pow(panel.col - cell.x, 2) + Math.pow((panel.row - cell.y) * 2, 2));
                const radius = 3 + cell.pulse * 3;
                if (dist < radius) {
                    totalInfluence += (1.0 - dist / radius) * cell.pulse;
                }
            }

            const brightness = Math.min(1.0, totalInfluence);

            // Shift color based on brightness for organic feel
            if (!panel._cellularColor) panel._cellularColor = new BABYLON.Color3();
            panel._cellularColor.set(
                color.r * (0.7 + brightness * 0.3),
                color.g * (0.5 + brightness * 0.5),
                color.b * (0.8 + brightness * 0.2)
            );

            this.updateLEDPanel(panel, panel._cellularColor, brightness);
        }
    }

}

window.LEDPatterns = {};
for (const name of Object.getOwnPropertyNames(LEDPatternMethods.prototype)) {
    if (name !== 'constructor') window.LEDPatterns[name] = LEDPatternMethods.prototype[name];
}
