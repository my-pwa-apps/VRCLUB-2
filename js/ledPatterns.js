'use strict';

// Underground sequence: scene lengths in bars and the phosphor persistence (seconds)
// each scene wants. Named here, not inline, so the playlist reads as a storyboard.
const UNDERGROUND_SCENES = [
    { bars: 8, tau: 0.10 },   // DESCENT  - POV down a service tunnel toward the club
    { bars: 6, tau: 0.30 },   // SIGNAL   - oscilloscope trace on a CRT graticule
    { bars: 6, tau: 0.80 },   // CONCRETE - brutalist tiles igniting on the beat
    { bars: 4, tau: 0.12 },   // HAZARD   - converging warning chevrons behind a shutter
    { bars: 6, tau: 0.35 },   // DATAFALL - terminal columns dripping down the wall
    { bars: 8, tau: 0.45 }    // SUB      - a slow liquid-light surface carried by the bass
];
const UNDERGROUND_TOTAL_BARS = 38;

// Warehouse shapes: which programs the wall may pick at each energy band. Indices into the
// program chain in patternWarehouse(). Low energy keeps to slow, large moves; high energy
// brings in the programs that hit on every beat.
const WAREHOUSE_PROGRAMS = {
    low:  [0, 5, 2, 7],        // bars, scan, rings, radar
    mid:  [0, 1, 2, 3, 4, 6],  // + blocks, slats, diamonds, checker
    high: [1, 3, 4, 6, 0, 7]   // blocks, slats, diamonds, checker, bars, radar
};
// A flash is a rise and fall of the wall's light. Photosensitivity guidance caps these at
// three per second; the governor refuses any closer than this, whatever the music does.
const WAREHOUSE_MIN_FLASH_GAP = 0.40;

class LEDPatternMethods {
    /**
     * Helper method to update LED panel emissive colors
     * Reduces code duplication across pattern methods
     * PERFORMANCE: Uses direct color assignment when possible, avoids scale() for common values
     */
    updateLEDPanel(panel, color, brightness) {
        const c = panel.colorBuffer;
        // Per-frame kick/hi-hat lift, set once by updateLEDWall(). Emissive may exceed 1
        // on purpose: the wall's bloom turns the overshoot into the kick flash.
        const lift = this._ledLift || 1;
        if (brightness === 0) {
            c.r = 0; c.g = 0; c.b = 0;
        } else if (brightness >= 0.99 && lift === 1) {
            c.r = color.r; c.g = color.g; c.b = color.b;
        } else {
            const k = brightness * lift;
            c.r = color.r * k;
            c.g = color.g * k;
            c.b = color.b * k;
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
    
    patternBreathing(color, time, _audioData) {
        // Slow inhale/exhale - meditative pulsing glow
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        // Very slow breathing cycle (4 seconds per breath)
        const breathCycle = Math.sin(time * 0.5) * 0.5 + 0.5; // 0 to 1
        
        // Inhale is slower than exhale (realistic breathing)
        const breath = Math.pow(breathCycle, 0.7); // Ease in the exhale
        
        // The colour is the show's (so a harmony or colour lock reaches the wall): dim on
        // the exhale, full on the inhale, with a little white at the top of the breath.
        // It used to paint its own blue-to-red and ignore the colour it was handed.
        const tone = this._ledColor2;
        const lift = 0.55 + breath * 0.45;
        const white = breath * breath * 0.18;
        tone.r = color.r * lift + white;
        tone.g = color.g * lift + white;
        tone.b = color.b * lift + white;
        
        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            // Gentle radial gradient that expands/contracts with breath
            const centerX = cols / 2;
            const centerY = rows / 2;
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
            
            // Brightness peaks at center and expands outward with breath
            const expandRadius = breath * maxDist * 1.5;
            const brightness = Math.max(0, 1.0 - Math.abs(dist - expandRadius * 0.3) / (3 + breath * 5));
            
            this.updateLEDPanel(panel, tone, brightness * 0.8 + 0.2);
        }
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

    // ──────────────────────────────────────────────────────────────────────
    // UNDERGROUND SEQUENCE
    //
    // A 38-bar "film" for a basement club rather than a screensaver: restrained,
    // industrial, mostly dark, and told in scenes that change on real bar lines
    // (VJDirector's beat grid) instead of a wall-clock timer. It always opens on
    // DESCENT when the cue begins, so a look that holds the wall gets the whole arc.
    //
    // Design rules, all deliberate:
    //  - Every scene writes into a shared "fresh" buffer; a single persistence pass
    //    then gives the wall a phosphor tail. Light fades, it does not cut.
    //  - Scenes dip through black over ~0.3 bar. Nothing flashes; the biggest lit
    //    area at any instant is a few tiles, a chevron field or a trace.
    //  - Palette is the show colour plus one hot accent. Amber (sodium/warning) is
    //    used only where it carries meaning (tunnel lamps, hazard) and only when the
    //    look is in colour; monochrome looks stay monochrome.
    //  - 210 panels, no allocation after the first call.
    // ──────────────────────────────────────────────────────────────────────
    _ugHash(n) {
        const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
        return s - Math.floor(s);
    }

    _ugSmooth(x) {
        return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    }

    patternUndergroundSequence(color, time, audioData) {
        const panels = this.ledPanels;
        if (!panels || panels.length === 0) return;
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const cells = cols * rows;
        const hasAudio = !!(audioData && audioData.hasAudio);
        const bass = hasAudio ? (audioData.bass || 0) : 0;
        const mid = hasAudio ? (audioData.mid || 0) : 0;
        const treble = hasAudio ? (audioData.treble || 0) : 0;

        let ug = this._ug;
        if (!ug || ug.cells !== cells) {
            const modCols = Math.ceil(cols / 3);
            const modRows = Math.ceil(rows / 2);
            ug = this._ug = {
                cells, modCols, modRows,
                level: new Float32Array(cells),
                warm: new Float32Array(cells),
                fresh: new Float32Array(cells),
                freshWarm: new Float32Array(cells),
                trace: new Float32Array(cols),
                traceLo: new Float32Array(cols),
                traceHi: new Float32Array(cols),
                mod: new Float32Array(modCols * modRows),
                traceAcc: 0, sub: 0.2, lastT: -1e9, lastFrame: -1e9, b0: 0,
                scratch: new BABYLON.Color3(),
                accent: new BABYLON.Color3(),
                amber: new BABYLON.Color3(1, 0.52, 0.1)
            };
        }

        // --- Music clock: the director's beat grid, else the BPM estimate --------
        const bpm = this.bpm || 130;
        const beatLen = 60 / bpm;
        const vj = this.vjDirector;
        const beats = (vj && Number.isFinite(vj.beatNumber))
            ? vj.beatNumber + (this.barPhase || 0) * 4 - Math.floor((this.barPhase || 0) * 4)
            : time / beatLen;
        const dtRaw = time - ug.lastT;
        // "Another pattern had the wall" is detected from the frame counter skipping,
        // not from elapsed time: a slow frame or a headset hitch must not restart the film.
        const frameId = (this.scene && typeof this.scene.getFrameId === 'function') ? this.scene.getFrameId() : null;
        const wasAway = frameId !== null ? (frameId - ug.lastFrame > 3) : dtRaw > 0.5;
        if (wasAway || beats < ug.b0) {
            // First frame, or another pattern held the wall: start again at a bar line.
            ug.b0 = Math.floor(beats / 4) * 4;
            ug.level.fill(0); ug.warm.fill(0); ug.trace.fill(0);
            ug.traceAcc = 0;
        }
        if (frameId !== null) ug.lastFrame = frameId;
        const dt = Math.min(0.1, Math.max(0, dtRaw));
        ug.lastT = time;

        // --- Which scene, and how far into it ---------------------------------------
        const loopBars = ((((beats - ug.b0) / 4) % UNDERGROUND_TOTAL_BARS) + UNDERGROUND_TOTAL_BARS) % UNDERGROUND_TOTAL_BARS;
        let scene = 0, start = 0;
        while (scene < UNDERGROUND_SCENES.length - 1 && loopBars >= start + UNDERGROUND_SCENES[scene].bars) {
            start += UNDERGROUND_SCENES[scene].bars;
            scene++;
        }
        const sceneBars = UNDERGROUND_SCENES[scene].bars;
        const local = loopBars - start;                       // bars into the scene
        const env = this._ugSmooth(local / 0.3) * this._ugSmooth((sceneBars - local) / 0.3);

        const fresh = ug.fresh, fw = ug.freshWarm;
        fresh.fill(0); fw.fill(0);
        const cx = (cols - 1) / 2, cy = (rows - 1) / 2;

        if (scene === 0) {
            // DESCENT. A rectangular service tunnel; depth is 1/max(|x|,|y|) so lamps
            // bunch toward the vanishing point exactly like a real perspective.
            const travel = time * (1.5 + bass * 1.3);
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const x = (panel.col - cx) / cx;
                const y = (panel.row - cy) / cy;
                const ax = Math.abs(x) * 0.62, ay = Math.abs(y);
                const m = Math.max(ax, ay, 0.07);
                const ph = (1 / m) * 0.85 - travel;
                const f = ph - Math.floor(ph);
                const lamp = f < 0.2 ? 1 - f / 0.2 : 0;
                const near = Math.min(1, m * 1.25);        // far end of the tunnel is dark
                let v = 0, w = 0;
                if (ay >= ax) {
                    if (y > 0) { v = lamp * (0.3 + 0.7 * near); w = 1; }              // ceiling strips
                    else if (Math.abs(x) < 0.14) {                                    // floor centre line
                        const d = (ph * 2) - Math.floor(ph * 2);
                        v = d < 0.5 ? 0.3 * near : 0; w = 1;
                    } else { v = lamp * 0.14 * near; w = 1; }                          // wet-floor reflection
                } else {
                    v = (((Math.floor(ph) & 1) === 0) ? lamp * 0.5 : 0) * near + 0.04 * near;  // wall sconces
                    w = 1;
                }
                // The club, a long way ahead: a soft glow that leans on the bass.
                const g = Math.exp(-(x * x * 0.9 + y * y * 2.2) * 9) * (0.26 + bass * 0.5);
                if (g > v) { v = g; w = 0; }
                fresh[idx] = v; fw[idx] = w;
            }
        } else if (scene === 1) {
            // SIGNAL. Samples enter on the right and scroll left like a scope; the
            // graticule is barely there, the newest columns run hot.
            ug.traceAcc += dt * 16;
            while (ug.traceAcc >= 1) {
                ug.traceAcc -= 1;
                const tr = ug.trace;
                for (let c = 0; c < cols - 1; c++) tr[c] = tr[c + 1];
                const jitter = (this._ugHash(Math.floor(time * 30)) - 0.5) * 0.06;
                // Slow components only: a trace sweeping a panel faster than ~3 Hz
                // reads as a flash, and a photosensitive guest cannot opt out of it
                // by looking away from a 21 m wall.
                const s = hasAudio
                    ? (0.12 + bass * 0.95) * Math.sin(time * 6.0) + mid * 0.4 * Math.sin(time * 10.0 + 1.7) + treble * 0.25 * Math.sin(time * 15.0)
                    : 0.35 * Math.sin(time * 2.3) + 0.15 * Math.sin(time * 5.9);
                tr[cols - 1] = Math.max(-1, Math.min(1, s + jitter));
            }
            for (let c = 0; c < cols; c++) {
                const a = ug.trace[c], b = ug.trace[c > 0 ? c - 1 : 0];
                ug.traceLo[c] = (Math.min(a, b) + 1) * 0.5 * (rows - 1);
                ug.traceHi[c] = (Math.max(a, b) + 1) * 0.5 * (rows - 1);
            }
            const midRow = Math.round(cy);
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const lo = ug.traceLo[panel.col], hi = ug.traceHi[panel.col];
                const d = panel.row < lo ? lo - panel.row : (panel.row > hi ? panel.row - hi : 0);
                let v = Math.max(0, 1 - d * 1.1);
                if (panel.row === midRow) v = Math.max(v, 0.12);
                else if (panel.col % 3 === 1) v = Math.max(v, 0.05);
                fresh[idx] = v;
                fw[idx] = this._ugSmooth((panel.col - (cols - 5)) / 4);
            }
        } else if (scene === 2) {
            // CONCRETE. 3x2-cell tiles; each beat ignites three of them, chosen by a
            // hash of the beat number so the same bar never repeats a pattern exactly.
            const mod = ug.mod;
            mod.fill(0);
            const beatIdx = Math.floor(beats);
            for (let b = beatIdx; b >= beatIdx - 1; b--) {
                const age = (beats - b) * beatLen;
                if (age > beatLen * 0.5) continue;
                const lvl = age < 0.12 ? age / 0.12 : 1;
                for (let k = 0; k < 3; k++) {
                    const mi = Math.floor(this._ugHash(b * 7.31 + k * 13.7 + 0.5) * mod.length);
                    if (lvl > mod[mi]) mod[mi] = lvl;
                }
            }
            const subTile = Math.floor(ug.modCols / 2);     // the bass slab, bottom centre
            mod[subTile] = Math.max(mod[subTile], bass * 0.9);
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const mi = Math.floor(panel.col / 3) + Math.floor(panel.row / 2) * ug.modCols;
                const inC = panel.col % 3, inR = panel.row % 2;
                const shade = (inC === 1 ? 1 : 0.72) * (inR === 1 ? 1 : 0.84);
                fresh[idx] = Math.max(mod[mi] * shade, 0.025);
                fw[idx] = (inC === 1 && inR === 1) ? 1 : 0;
            }
        } else if (scene === 3) {
            // HAZARD. Chevrons march toward the centre line one cell per beat behind a
            // shutter that opens, holds and closes; the shutter edges stay lit.
            const open = this._ugSmooth(local / 1.2) * this._ugSmooth((sceneBars - local) / 1.2);
            const half = 0.12 + 0.9 * open;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const y = Math.abs((panel.row - cy) / cy);
                // Feathered shutter: a row fades in over ~one row height instead of
                // popping on the frame its centre crosses the edge.
                const inside = this._ugSmooth((half - y) / 0.25 + 0.1);
                const edge = Math.max(0, 1 - Math.abs(y - (half + 0.08)) / 0.2) * 0.55;
                let v = 0;
                if (inside > 0) {
                    const u = (Math.abs(panel.col - cx) + panel.row) * 0.25 - beats * 0.25;
                    const band = 0.5 + 0.5 * Math.sin(u * 6.2831853);
                    v = Math.max(0, Math.min(1, (band - 0.45) * 4)) * (0.8 + bass * 0.2) * inside;
                }
                v = Math.max(v, edge);
                fresh[idx] = v; fw[idx] = 1;
            }
        } else if (scene === 4) {
            // DATAFALL. Per-column drops with a long tail and a hot head; roughly a
            // third of the columns are dormant so it reads as a terminal, not rain.
            const fall = 1 + bass * 0.5;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const c = panel.col;
                if (this._ugHash(c * 3.1) < 0.33) continue;
                const speed = (2.0 + this._ugHash(c + 7.7) * 3.2) * (bpm / 130) * fall;
                const tail = 4 + this._ugHash(c + 41.3) * 4;
                const period = rows + tail + 2;
                const head = ((time * speed + this._ugHash(c + 99.9) * period * 2) % period) - 1;
                const k = head - (rows - 1 - panel.row);       // rows behind the head
                if (k < 0 || k > tail) continue;
                const idx = panel.row * cols + c;
                const t = 1 - k / tail;
                fresh[idx] = t * t * (k < 1 ? 1 : 0.8);
                fw[idx] = k < 1 ? 1 : 0;
            }
        } else {
            // SUB. One slow surface that rises with the low end like a cone settling;
            // scanlines keep it a screen, and the surface line is the only hot part.
            const target = hasAudio ? bass : 0.3 + 0.3 * (this.beatEnvelope || 0);
            ug.sub += (target - ug.sub) * (1 - Math.exp(-dt * (target > ug.sub ? 14 : 3)));
            const base = 1.6 + ug.sub * 5.2;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const hgt = base + 0.55 * Math.sin(time * 0.9 + panel.col * 0.35) + 0.4 * Math.sin(time * 0.55 - panel.col * 0.18);
                const depth = hgt - panel.row;
                const line = Math.max(0, 1 - Math.abs(depth) * 1.1);
                const fill = depth > 0 ? (0.14 + 0.3 * Math.min(1, depth / Math.max(1, hgt))) : 0;
                const scan = (panel.row & 1) ? 1 : 0.78;
                fresh[idx] = Math.max(fill * scan, line);
                fw[idx] = line > fill ? line : 0;
            }
        }

        // --- Persistence, then one write per panel ---------------------------------
        const decay = Math.exp(-dt / UNDERGROUND_SCENES[scene].tau);
        const level = ug.level, warm = ug.warm;
        for (let i = 0; i < cells; i++) {
            const f = fresh[i] * env;
            const held = level[i] * decay;
            if (f >= held) { level[i] = f; warm[i] = fw[i]; } else { level[i] = held; }
        }

        // Accent: amber only where it means something and only in a colour look.
        const accent = ug.accent;
        const amber = !this.ledMonochrome && (scene === 0 || scene === 3);
        if (amber) accent.copyFrom(ug.amber);
        else accent.set(color.r + (1 - color.r) * 0.65, color.g + (1 - color.g) * 0.65, color.b + (1 - color.b) * 0.65);

        const out = ug.scratch;
        for (let p = 0; p < panels.length; p++) {
            const panel = panels[p];
            const idx = panel.row * cols + panel.col;
            const v = level[idx];
            if (v < 0.02) { this.updateLEDPanel(panel, color, 0); continue; }
            const w = warm[idx];
            out.set(
                color.r + (accent.r - color.r) * w,
                color.g + (accent.g - color.g) * w,
                color.b + (accent.b - color.b) * w
            );
            this.updateLEDPanel(panel, out, Math.min(1, v) * (1.1 - 0.1 * v));
        }
    }


    // ──────────────────────────────────────────────────────────────────────
    // WAREHOUSE SHAPES
    //
    // The wall as a club screen: bars, tiles, rings, slats, diamonds, a scan, a checker and
    // a radar, cut hard on the beat. Every bar-aligned program change is chosen from the
    // music's energy (the Show Director's slow EMA blended with the live bass), so a quiet
    // groove gets big slow moves and a peak gets every-beat flashing shapes.
    //
    // Colour comes from the look: black and white (the monochrome backstop), one colour
    // (the wall colour with white-hot flashes) or several (`ledMulti`: the wall colour, its
    // complement and white).
    //
    // Photosensitivity is part of the design, not an afterthought:
    //  - ONE flash governor. Beat edges propose a flash; none is accepted closer than
    //    WAREHOUSE_MIN_FLASH_GAP, so no panel can flash more than ~3 times a second however
    //    fast the tempo. Shapes MOVE on every beat; they only FLASH on accepted ones.
    //  - Photosensitive Safe Mode keeps the movement and removes the flash: a slower attack,
    //    a lower peak and a lifted floor, so the wall pulses instead of strobing.
    //  - Coverage is bounded (no program lights more than about half the wall) and program
    //    changes dip through black over ~0.25 s instead of cutting.
    // ──────────────────────────────────────────────────────────────────────
    patternWarehouse(color, time, audioData) {
        const panels = this.ledPanels;
        if (!panels || panels.length === 0) return;
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const cells = cols * rows;
        const hasAudio = !!(audioData && audioData.hasAudio);
        const bass = hasAudio ? (audioData.bass || 0) : 0;
        const safe = !!this.photosensitiveSafeMode;

        let wh = this._wh;
        if (!wh || wh.cells !== cells) {
            wh = this._wh = {
                cells,
                modCols: Math.ceil(cols / 3), modRows: Math.ceil(rows / 2),
                level: new Float32Array(cells), tone: new Uint8Array(cells),
                fresh: new Float32Array(cells), freshTone: new Uint8Array(cells),
                mod: new Float32Array(Math.ceil(cols / 3) * Math.ceil(rows / 2)),
                energy: 0.4, flashAt: -1e9, flashLevel: 0, lastBeat: -1, flashBeat: -1,
                program: 0, programBar: -1, lastFrame: -1e9, lastT: -1e9, stabLine: 0, stabHorizontal: false,
                scratch: new BABYLON.Color3(), hot: new BABYLON.Color3()
            };
        }

        // --- clock: the director's beat grid, else the BPM estimate -------------------
        const bpm = this.bpm || 130;
        const beatLen = 60 / bpm;
        const vj = this.vjDirector;
        const beats = (vj && Number.isFinite(vj.beatNumber))
            ? vj.beatNumber + ((this.barPhase || 0) * 4 - Math.floor((this.barPhase || 0) * 4))
            : time / beatLen;
        const frameId = (this.scene && typeof this.scene.getFrameId === 'function') ? this.scene.getFrameId() : null;
        const away = frameId !== null ? (frameId - wh.lastFrame > 3) : (time - wh.lastT > 0.5);
        if (away) {
            wh.level.fill(0); wh.tone.fill(0); wh.lastBeat = -1; wh.programBar = -1; wh.flashAt = -1e9;
        }
        if (frameId !== null) wh.lastFrame = frameId;
        const dt = Math.min(0.1, Math.max(0, time - wh.lastT));
        wh.lastT = time;
        const bi = Math.floor(beats);
        const bar = Math.floor(beats / 4);
        const beatInBar = bi - bar * 4;
        // Above ~2.5 beats a second (150 BPM) the shapes step every other beat: a program
        // that changes on every beat of a fast track would flicker faster than the flash limit.
        const stride = beatLen < WAREHOUSE_MIN_FLASH_GAP ? 2 : 1;
        const sb = Math.floor(beats / stride);                        // the beat the SHAPES step on
        wh.stride = stride;

        // --- energy, 0..1 --------------------------------------------------------------
        const sd = this.showDirector;
        const slow = (sd && Number.isFinite(sd._energy))
            ? Math.min(1, sd._energy / 0.4)
            : Math.min(1, (this.masterIntensity == null ? 0.7 : this.masterIntensity) * 0.8);
        const target = Math.min(1, 0.65 * slow + 0.35 * Math.min(1, bass * 1.3));
        wh.energy += (target - wh.energy) * (1 - Math.exp(-dt * 1.5));
        const en = wh.energy;

        // --- program: chosen on a bar line from the energy band, never the same twice --
        const barsPerProgram = en > 0.6 ? 1 : 2;
        const slot = Math.floor(bar / barsPerProgram);
        if (wh.programBar !== slot) {
            wh.programBar = slot;
            const band = en < 0.3 ? WAREHOUSE_PROGRAMS.low : (en < 0.6 ? WAREHOUSE_PROGRAMS.mid : WAREHOUSE_PROGRAMS.high);
            let pick = band[Math.floor(this._ugHash(slot * 3.7 + 1.3) * band.length)];
            if (pick === wh.program) pick = band[(band.indexOf(pick) + 1) % band.length];
            wh.program = pick;
        }
        const local = (beats - slot * barsPerProgram * 4) / 4;          // bars into the program
        const env = this._ugSmooth(local / 0.12) * this._ugSmooth((barsPerProgram - local) / 0.12);

        // --- flash governor ---------------------------------------------------------------
        // Beat edges propose; the energy decides how many beats flash; the gap rule disposes.
        if (bi !== wh.lastBeat) {
            wh.lastBeat = bi;
            const every = en < 0.3 ? 4 : (en < 0.6 ? 2 : 1);
            if (bi % stride === 0 && beatInBar % every === 0 && time - wh.flashAt >= WAREHOUSE_MIN_FLASH_GAP) {
                wh.flashAt = time;
                wh.flashBeat = bi;
                wh.stabLine = Math.floor(this._ugHash(bi * 5.1 + 2.2) * 100);
                wh.stabHorizontal = this._ugHash(bi * 1.9 + 7.7) > 0.5;
            }
        }
        const since = Math.max(0, time - wh.flashAt);
        const decay = safe ? 0.38 : 0.20 - 0.09 * en;
        let fl = Math.exp(-since / decay);
        if (safe) fl *= this._ugSmooth(since / 0.14);      // a slow attack: a swell, not a hit
        wh.flashLevel = fl;
        const lo = safe ? 0.42 : 0.26;                     // resting level of a lit shape
        const hi = safe ? 0.72 : 1.0;                      // level at the top of a flash
        const lit = lo + (hi - lo) * fl;
        const hot = !safe && fl > 0.72;                    // white-hot only at the top of a real flash

        const multi = !!this.ledMulti && !this.ledMonochrome;
        const fresh = wh.fresh, ft = wh.freshTone;
        fresh.fill(0); ft.fill(0);
        const cx = (cols - 1) / 2, cy = (rows - 1) / 2;
        const ASPECT = 1.2;                                // panels are 1.2 m wide, 1.0 m tall
        const flip = (bar & 1) ? -1 : 1;
        // Tone 2 = white-hot, 1 = the accent colour, 0 = the wall colour. At the top of a flash only
        // the even shapes go white-hot, so the wall colour (and the accent) stays visible on the rest.
        const tn = (parity) => (hot && (parity & 1) === 0 ? 2 : (multi ? (parity & 1) : 0));
        const prog = wh.program;

        if (prog === 0) {
            // BARS: vertical bars march sideways a column a beat; alternate bars take the flash.
            const spacing = en > 0.6 ? 4 : 5;                      // never more than 40% of the columns
            const width = en > 0.5 ? 2 : 1;
            const pos = beats * flip;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const u = panel.col - pos;
                const m = ((u % spacing) + spacing) % spacing;
                if (m >= width) continue;
                const id = Math.floor(u / spacing);
                const on = ((id & 1) === (sb & 1));
                fresh[panel.row * cols + panel.col] = on ? lit : lo;
                ft[panel.row * cols + panel.col] = tn(id);
            }
        } else if (prog === 1) {
            // BLOCKS: 3x2 tiles; each beat lights a handful, more as the energy climbs.
            const mod = wh.mod;
            mod.fill(0);
            const count = 2 + Math.floor(en * 5);
            for (let b = sb; b >= sb - 1; b--) {
                for (let k = 0; k < count; k++) {
                    const mi = Math.floor(this._ugHash(b * 7.31 + k * 13.7 + 0.5) * mod.length);
                    const level = b === sb ? lit : lo * 0.9;
                    if (level > mod[mi]) mod[mi] = level;
                }
            }
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const mi = Math.floor(panel.col / 3) + Math.floor(panel.row / 2) * wh.modCols;
                const idx = panel.row * cols + panel.col;
                fresh[idx] = mod[mi];
                ft[idx] = tn(mi);
            }
        } else if (prog === 2 || prog === 4) {
            // RINGS (2) expand from the centre and DIAMONDS (4) collapse into it, one per beat.
            const diamond = prog === 4;
            const maxR = Math.hypot(cx * ASPECT, cy) + 1;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const dx = (panel.col - cx) * ASPECT, dy = panel.row - cy;
                const d = diamond ? Math.abs(dx) + Math.abs(dy) * 1.2 : Math.hypot(dx, dy);
                let best = 0, bestTone = 0;
                for (let k = 0; k < 3; k++) {
                    const age = (beats / stride - (sb - k));       // stepped beats since this ring was born
                    const r = diamond ? maxR * 1.3 * (1 - age / 3) : age * (maxR / 3);
                    const thick = 1.0 + 0.5 * en;
                    const off = Math.abs(d - r);
                    if (off >= thick) continue;
                    const v = (1 - off / thick) * (k === 0 ? lit : lo * (1 - k * 0.3));
                    if (v > best) { best = v; bestTone = tn(sb - k); }
                }
                if (best > 0) { fresh[panel.row * cols + panel.col] = best; ft[panel.row * cols + panel.col] = bestTone; }
            }
        } else if (prog === 3) {
            // SLATS: horizontal bars that slide up and down; alternate bars take the flash.
            const spacing = 3;
            const pos = beats * 0.75 * flip;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const u = panel.row - pos;
                const m = ((u % spacing) + spacing) % spacing;
                if (m >= 1) continue;
                const id = Math.floor(u / spacing);
                const idx = panel.row * cols + panel.col;
                fresh[idx] = ((id & 1) === (sb & 1)) ? lit : lo;
                ft[idx] = tn(id);
            }
        } else if (prog === 5) {
            // SCAN: a vertical line crosses the wall once a bar (the direction alternates),
            // and at higher energy a horizontal one crosses every two bars.
            const sweep = (beats / 4 - bar);                      // 0..1 across the bar
            const x = (flip > 0 ? sweep : 1 - sweep) * (cols - 1);
            const y = ((beats / 8) % 1) * (rows - 1);
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const idx = panel.row * cols + panel.col;
                const vx = Math.max(0, 1 - Math.abs(panel.col - x) / 1.1);
                const vy = en > 0.35 ? Math.max(0, 1 - Math.abs(panel.row - y) / 0.9) : 0;
                const v = Math.max(vx, vy * 0.85);
                if (v > 0) { fresh[idx] = v * lit; ft[idx] = tn(vx >= vy ? 0 : 1); }
            }
        } else if (prog === 6) {
            // CHECKER: 2x2 blocks that invert every beat. Half the wall is always lit, so
            // the total light holds steady while every panel changes at only half the beat rate.
            // The new half ramps in over the first fifth of the beat while the old half decays, so
            // an inversion is a cross-fade at constant coverage, not a frame of full wall.
            const ramp = this._ugSmooth((beats / stride - sb) / 0.2);
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const parity = (Math.floor(panel.col / 2) + Math.floor(panel.row / 2) + sb) & 1;
                if (parity) continue;
                const idx = panel.row * cols + panel.col;
                fresh[idx] = lit * 0.9 * ramp;
                ft[idx] = tn(sb);
            }
        } else {
            // RADAR: one or two wedges sweeping round the centre, a turn every two bars.
            const wedges = en > 0.5 ? 2 : 1;
            const theta = (beats / 8) * Math.PI * 2 * flip;
            const width = 0.42 + 0.25 * fl;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                const ang = Math.atan2(panel.row - cy, (panel.col - cx) * ASPECT);
                let best = 0, tone = 0;
                for (let w = 0; w < wedges; w++) {
                    let d = Math.abs(ang - (theta + w * Math.PI));
                    d = Math.min(d % (Math.PI * 2), Math.PI * 2 - (d % (Math.PI * 2)));
                    const v = Math.max(0, 1 - d / width);
                    if (v > best) { best = v; tone = w; }
                }
                if (best > 0) { const idx = panel.row * cols + panel.col; fresh[idx] = best * lit; ft[idx] = tn(tone); }
            }
        }

        // STAB: at higher energy each accepted flash also throws one full row or column
        // of white across the wall, the kind of single bar an LED strobe-line gives.
        if (en > 0.5 && !safe && fl > 0.3) {
            const row = wh.stabHorizontal;
            const line = row ? wh.stabLine % rows : wh.stabLine % cols;
            for (let p = 0; p < panels.length; p++) {
                const panel = panels[p];
                if ((row ? panel.row : panel.col) !== line) continue;
                const idx = panel.row * cols + panel.col;
                if (fl * 0.9 > fresh[idx]) { fresh[idx] = fl * 0.9; ft[idx] = 2; }
            }
        }

        // --- persistence, then one write per panel ----------------------------------------
        // The checker inverts every beat, so a long tail would light both halves at once and
        // turn a 50% pattern into a 100% wall; it gets a short tail.
        const tau = Math.max(0.07, 0.22 - 0.12 * en) * (safe ? 1.6 : 1) * (prog === 6 ? 0.45 : 1);
        const keep = Math.exp(-dt / tau);
        const level = wh.level, tone = wh.tone;
        for (let i = 0; i < cells; i++) {
            const f = fresh[i] * env;
            const held = level[i] * keep;
            if (f >= held) { level[i] = f; tone[i] = ft[i]; } else { level[i] = held; }
        }

        const accent = this.ledAccentColor || color;
        const hotColor = wh.hot;
        hotColor.set(color.r + (1 - color.r) * 0.7, color.g + (1 - color.g) * 0.7, color.b + (1 - color.b) * 0.7);
        const out = wh.scratch;
        for (let p = 0; p < panels.length; p++) {
            const panel = panels[p];
            const idx = panel.row * cols + panel.col;
            const v = level[idx];
            if (v < 0.02) { this.updateLEDPanel(panel, color, 0); continue; }
            const t = tone[idx];
            const src = t === 2 ? hotColor : (t === 1 && multi ? accent : color);
            out.set(src.r, src.g, src.b);
            this.updateLEDPanel(panel, out, Math.min(1, v));
        }
    }
}

window.LEDPatterns = {};
for (const name of Object.getOwnPropertyNames(LEDPatternMethods.prototype)) {
    if (name !== 'constructor') window.LEDPatterns[name] = LEDPatternMethods.prototype[name];
}
