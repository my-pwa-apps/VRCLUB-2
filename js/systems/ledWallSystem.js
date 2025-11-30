// LED Wall System - Video wall with patterns for VR Club
// Handles LED panel creation and pattern animation

class LEDWallSystem {
    constructor(scene, materialFactory, options = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = options.logger || console;
        
        // LED wall state
        this.ledWallActive = true;
        this.ledWallSpeed = 1.0;
        this.ledPattern = 0;
        this.ledColorIndex = 0;
        this.ledTime = 0;
        
        // LED panel storage
        this.ledPanels = [];
        this.ledColors = [
            new BABYLON.Color3(1, 0, 0),      // Red
            new BABYLON.Color3(0, 0, 1),      // Blue
            new BABYLON.Color3(0, 1, 0),      // Green
            new BABYLON.Color3(1, 0, 1),      // Magenta
            new BABYLON.Color3(0, 1, 1),      // Cyan
            new BABYLON.Color3(1, 1, 0),      // Yellow
            new BABYLON.Color3(1, 0.5, 0),    // Orange
            new BABYLON.Color3(1, 1, 1)       // White
        ];
        
        // Wall dimensions
        this.wallWidth = 14;
        this.wallHeight = 5;
        this.panelsX = 28;
        this.panelsY = 10;
        
        // Pattern names for UI - 24 immersive patterns
        this.patternNames = [
            // Energy & Bass (0-5)
            'Bass Explosion',
            'Energy Wave',
            'Shockwave',
            'Pulse Ring',
            'Heart Beat',
            'Bass Tunnel',
            // Hypnotic (6-11)
            'Spiral Vortex',
            'Tunnel Zoom',
            'Kaleidoscope',
            'DNA Helix',
            'Infinity Loop',
            'Hypno Spiral',
            // Club Classics (12-17)
            'VU Meter',
            'Equalizer Bars',
            'Beat Grid',
            'Pixel Rain',
            'Scanner Beam',
            'Laser Grid',
            // Flowing (18-23)
            'Rainbow Wave',
            'Plasma Flow',
            'Aurora Borealis',
            'Fire Rising',
            'Ocean Waves',
            'Neon Pulse'
        ];
        
        // Cached colors for performance
        this._cachedBlack = new BABYLON.Color3(0, 0, 0);
        this._cachedWhite = new BABYLON.Color3(1, 1, 1);
        this._cachedMatrix = new BABYLON.Color3(0, 1, 0.3);
        
        // Frame counter for animation
        this.frameCounter = 0;
        
        // Pattern auto-switching
        this.patternSwitchInterval = 15; // seconds
        this.lastPatternSwitch = 0;
        this.autoSwitch = true;
    }

    /**
     * Create LED wall behind DJ booth
     */
    createLEDWall() {
        this.ledPanels = [];
        
        // Match legacy dimensions exactly
        const panelWidth = 1.2;
        const panelHeight = 1.0;
        const cols = 28;
        const rows = 10;
        const wallWidth = cols * panelWidth;
        const wallHeight = rows * panelHeight;
        const wallZ = -26; // Match legacy position
        
        // Store grid dimensions for patterns
        this.ledCols = cols;
        this.ledRows = rows;
        
        // Create LED panels
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const panel = BABYLON.MeshBuilder.CreatePlane("ledPanel_" + row + "_" + col, {
                    width: panelWidth - 0.05,
                    height: panelHeight - 0.05,
                    sideOrientation: BABYLON.Mesh.DOUBLESIDE
                }, this.scene);
                
                const x = (col * panelWidth) - (wallWidth / 2) + (panelWidth / 2);
                const y = (row * panelHeight) + (panelHeight / 2) + 0.05;
                
                panel.position = new BABYLON.Vector3(x, y, wallZ);
                
                // Create material with slight initial glow
                const panelMat = new BABYLON.StandardMaterial("ledMat_" + row + "_" + col, this.scene);
                panelMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
                panelMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                panelMat.specularColor = new BABYLON.Color3(0, 0, 0);
                panelMat.disableLighting = true;
                panelMat.backFaceCulling = false;
                panel.material = panelMat;
                
                // Performance optimizations
                panel.freezeWorldMatrix();
                panel.doNotSyncBoundingInfo = true;
                panel.isPickable = false;
                
                // Store with structure matching legacy code
                this.ledPanels.push({
                    mesh: panel,
                    material: panelMat,
                    row: row,
                    col: col,
                    centerX: col - (cols / 2) + 0.5,
                    centerY: row - (rows / 2) + 0.5,
                    // Also include normalized coords for new patterns
                    normalizedX: col / cols,
                    normalizedY: row / rows
                });
            }
        }
        
        this.log.info?.('✅ LED wall created with ' + this.ledPanels.length + ' panels at z=' + wallZ);
    }

    /**
     * Update LED wall animation each frame
     */
    update(time, audioData = null) {
        if (!this.ledPanels || this.ledPanels.length === 0) return;
        
        this.frameCounter++;
        
        if (!this.ledWallActive) {
            this._disableLEDWall();
            return;
        }
        
        // Use performance.now() directly for reliable animation timing
        const t = performance.now() / 1000;
        
        // Auto-switch patterns periodically
        if (this.autoSwitch && t - this.lastPatternSwitch > this.patternSwitchInterval) {
            this.nextPattern();
            this.lastPatternSwitch = t;
        }
        
        // Get current color
        const baseColor = this.ledColors[this.ledColorIndex];
        
        // Check if we have audio data
        const hasAudio = audioData && (audioData.bass > 0.01 || audioData.mid > 0.01 || audioData.high > 0.01);
        
        // Extract audio levels (normalized 0-1)
        const bass = hasAudio ? Math.min(1, audioData.bass) : 0.5 + Math.sin(t * 2) * 0.3;
        const mid = hasAudio ? Math.min(1, audioData.mid) : 0.5 + Math.sin(t * 2.5) * 0.3;
        const high = hasAudio ? Math.min(1, audioData.high) : 0.4 + Math.sin(t * 3) * 0.3;
        
        // Run pattern using real time (t)
        switch (this.ledPattern) {
            // Energy & Bass patterns (0-5)
            case 0: this._patternBassExplosion(t, bass, mid, high, baseColor); break;
            case 1: this._patternEnergyWave(t, bass, mid, high, baseColor); break;
            case 2: this._patternShockwave(t, bass, mid, high, baseColor); break;
            case 3: this._patternPulseRing(t, bass, mid, high, baseColor); break;
            case 4: this._patternHeartBeat(t, bass, mid, high, baseColor); break;
            case 5: this._patternBassTunnel(t, bass, mid, high, baseColor); break;
            // Hypnotic patterns (6-11)
            case 6: this._patternSpiralVortex(t, bass, mid, high, baseColor); break;
            case 7: this._patternTunnelZoom(t, bass, mid, high, baseColor); break;
            case 8: this._patternKaleidoscope(t, bass, mid, high, baseColor); break;
            case 9: this._patternDNAHelix(t, bass, mid, high, baseColor); break;
            case 10: this._patternInfinityLoop(t, bass, mid, high, baseColor); break;
            case 11: this._patternHypnoSpiral(t, bass, mid, high, baseColor); break;
            // Club Classics (12-17)
            case 12: this._patternVUMeter(t, bass, mid, high, baseColor); break;
            case 13: this._patternEqualizerBars(t, bass, mid, high, baseColor); break;
            case 14: this._patternBeatGrid(t, bass, mid, high, baseColor); break;
            case 15: this._patternPixelRain(t, bass, mid, high, baseColor); break;
            case 16: this._patternScannerBeam(t, bass, mid, high, baseColor); break;
            case 17: this._patternLaserGrid(t, bass, mid, high, baseColor); break;
            // Flowing patterns (18-23)
            case 18: this._patternRainbowWave(t, bass, mid, high, baseColor); break;
            case 19: this._patternPlasmaFlow(t, bass, mid, high, baseColor); break;
            case 20: this._patternAuroraBorealis(t, bass, mid, high, baseColor); break;
            case 21: this._patternFireRising(t, bass, mid, high, baseColor); break;
            case 22: this._patternOceanWaves(t, bass, mid, high, baseColor); break;
            case 23: this._patternNeonPulse(t, bass, mid, high, baseColor); break;
            default: this._patternRainbowWave(t, bass, mid, high, baseColor);
        }
    }

    // ============================================================
    // ENERGY & BASS PATTERNS (0-5)
    // ============================================================

    /** Pattern 0: Bass Explosion - Circular pulse from center */
    _patternBassExplosion(t, bass, mid, high, baseColor) {
        const pulseRadius = (t * 0.8) % 1.5;
        const intensity = 0.4 + bass * 0.6;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy) * 2;
            
            const ringWidth = 0.2 + bass * 0.15;
            const ringBrightness = Math.exp(-Math.pow((dist - pulseRadius) / ringWidth, 2));
            
            const hue = (dist * 0.3 + t * 0.2) % 1;
            const color = this._hsvToRgb(hue, 0.9, 1);
            this._updatePanel(panel, color, ringBrightness * intensity);
        });
    }

    /** Pattern 1: Energy Wave - Powerful horizontal sweep */
    _patternEnergyWave(t, bass, mid, high, baseColor) {
        const wavePos = (t * 0.6) % 1.4 - 0.2;
        const waveWidth = 0.15 + bass * 0.2;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.abs(panel.normalizedX - wavePos);
            const waveBrightness = Math.exp(-dist * dist / (waveWidth * waveWidth));
            
            // Trailing colors
            const trail = panel.normalizedX < wavePos ? 
                Math.exp(-(wavePos - panel.normalizedX) / 0.3) * 0.5 : 0;
            
            const brightness = Math.max(waveBrightness, trail) * (0.5 + bass * 0.5);
            const hue = (panel.normalizedY * 0.3 + t * 0.1) % 1;
            const color = this._hsvToRgb(hue, 1, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 2: Shockwave - Multiple expanding rings */
    _patternShockwave(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Multiple rings at different phases
            let brightness = 0;
            for (let i = 0; i < 3; i++) {
                const ringRadius = ((t * 0.5 + i * 0.33) % 1.0) * 0.8;
                const ringDist = Math.abs(dist - ringRadius);
                brightness += Math.exp(-ringDist * ringDist / 0.01) * (1 - i * 0.2);
            }
            
            brightness = Math.min(1, brightness) * (0.5 + bass * 0.5);
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /** Pattern 3: Pulse Ring - Breathing concentric rings */
    _patternPulseRing(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const numRings = 5;
            const ringSpacing = 0.15;
            const pulse = Math.sin(t * 3) * 0.5 + 0.5;
            
            let brightness = 0;
            for (let i = 0; i < numRings; i++) {
                const ringDist = (i * ringSpacing + pulse * 0.1) % 0.8;
                const d = Math.abs(dist - ringDist);
                brightness += Math.exp(-d * d / 0.003) * (0.7 + bass * 0.3);
            }
            
            const hue = (dist + t * 0.1) % 1;
            const color = this._hsvToRgb(hue, 0.8, 1);
            this._updatePanel(panel, color, Math.min(1, brightness));
        });
    }

    /** Pattern 4: Heart Beat - Pulsing with bass */
    _patternHeartBeat(t, bass, mid, high, baseColor) {
        // Double-pulse like heartbeat
        const beatPhase = (t * 2) % 1;
        let pulse;
        if (beatPhase < 0.1) pulse = beatPhase / 0.1;
        else if (beatPhase < 0.2) pulse = 1 - (beatPhase - 0.1) / 0.1;
        else if (beatPhase < 0.3) pulse = (beatPhase - 0.2) / 0.1 * 0.7;
        else if (beatPhase < 0.4) pulse = 0.7 - (beatPhase - 0.3) / 0.1 * 0.7;
        else pulse = 0;
        
        pulse = pulse * (0.5 + bass * 0.5);
        
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const brightness = pulse * Math.exp(-dist * dist / 0.2);
            const color = new BABYLON.Color3(1, 0.1, 0.2); // Heart red
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 5: Bass Tunnel - Zooming tunnel effect */
    _patternBassTunnel(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Tunnel rings zooming outward
            const tunnelPhase = (dist * 5 - t * 2) % 1;
            const ring = Math.sin(tunnelPhase * Math.PI * 2) * 0.5 + 0.5;
            
            // Segments around the tunnel
            const segments = 8;
            const segmentPhase = ((angle / Math.PI + 1) * segments / 2 + t * 0.5) % 1;
            const segment = Math.sin(segmentPhase * Math.PI * 2) * 0.3 + 0.7;
            
            const brightness = ring * segment * (0.4 + bass * 0.6);
            const hue = (angle / Math.PI / 2 + 0.5 + t * 0.1) % 1;
            const color = this._hsvToRgb(hue, 0.9, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    // ============================================================
    // HYPNOTIC PATTERNS (6-11)
    // ============================================================

    /** Pattern 6: Spiral Vortex - Rotating spiral */
    _patternSpiralVortex(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Spiral arms
            const spiralAngle = angle + dist * 10 - t * 3;
            const spiral = Math.sin(spiralAngle * 3) * 0.5 + 0.5;
            
            const brightness = spiral * (0.4 + bass * 0.6) * (1 - dist * 0.5);
            const hue = (spiralAngle / Math.PI / 6 + t * 0.1) % 1;
            const color = this._hsvToRgb(hue, 1, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 7: Tunnel Zoom - Infinite tunnel illusion */
    _patternTunnelZoom(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.max(0.01, Math.sqrt(dx * dx + dy * dy));
            
            // Zoom effect - perspective lines converging to center
            const zoomPhase = (1 / dist - t * 3) % 1;
            const zoom = Math.abs(Math.sin(zoomPhase * Math.PI));
            
            // Edge glow
            const edge = Math.sin(Math.atan2(dy, dx) * 8 + t) * 0.3 + 0.7;
            
            const brightness = zoom * edge * (0.3 + bass * 0.7);
            const hue = (zoomPhase + t * 0.05) % 1;
            const color = this._hsvToRgb(hue, 0.8, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 8: Kaleidoscope - Rotating symmetrical patterns */
    _patternKaleidoscope(t, bass, mid, high, baseColor) {
        const segments = 6;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let angle = Math.atan2(dy, dx) + t * 0.5;
            
            // Mirror into segments
            angle = Math.abs(((angle / Math.PI + 1) * segments) % 2 - 1);
            
            // Pattern within each segment
            const pattern1 = Math.sin(angle * 5 + dist * 10 + t * 2);
            const pattern2 = Math.cos(dist * 8 - t * 1.5);
            const combined = (pattern1 + pattern2) * 0.25 + 0.5;
            
            const brightness = combined * (0.5 + bass * 0.5);
            const hue = (dist + angle * 0.2 + t * 0.1) % 1;
            const color = this._hsvToRgb(hue, 1, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 9: DNA Helix - Double helix spinning */
    _patternDNAHelix(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX;
            const y = panel.normalizedY;
            
            // Two helixes offset by PI
            const helix1Y = 0.5 + Math.sin(x * Math.PI * 4 + t * 3) * 0.35;
            const helix2Y = 0.5 + Math.sin(x * Math.PI * 4 + t * 3 + Math.PI) * 0.35;
            
            const dist1 = Math.abs(y - helix1Y);
            const dist2 = Math.abs(y - helix2Y);
            
            const brightness1 = Math.exp(-dist1 * dist1 / 0.01);
            const brightness2 = Math.exp(-dist2 * dist2 / 0.01);
            
            // Connecting rungs
            const rungPhase = (x * 8 + t * 2) % 1;
            const isRung = rungPhase < 0.1 && y > Math.min(helix1Y, helix2Y) && y < Math.max(helix1Y, helix2Y);
            const rungBrightness = isRung ? 0.5 : 0;
            
            const brightness = Math.max(brightness1, brightness2, rungBrightness) * (0.5 + bass * 0.5);
            const color = brightness1 > brightness2 ? 
                new BABYLON.Color3(0, 0.8, 1) : new BABYLON.Color3(1, 0.3, 0.8);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 10: Infinity Loop - Figure-8 pattern */
    _patternInfinityLoop(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX - 0.5;
            const y = panel.normalizedY - 0.5;
            
            // Parametric infinity/figure-8 curve
            let minDist = 1;
            for (let i = 0; i < 50; i++) {
                const param = i / 50 * Math.PI * 2;
                const curveX = Math.sin(param) * 0.4;
                const curveY = Math.sin(param * 2) * 0.2;
                const dx = x - curveX;
                const dy = y - curveY;
                minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
            }
            
            // Moving glow along the curve
            const glowPhase = (t * 0.5) % 1;
            const glowParam = glowPhase * Math.PI * 2;
            const glowX = Math.sin(glowParam) * 0.4;
            const glowY = Math.sin(glowParam * 2) * 0.2;
            const glowDist = Math.sqrt((x - glowX) ** 2 + (y - glowY) ** 2);
            const glow = Math.exp(-glowDist * glowDist / 0.02);
            
            const lineBrightness = Math.exp(-minDist * minDist / 0.002);
            const brightness = Math.max(lineBrightness * 0.5, glow) * (0.4 + bass * 0.6);
            
            const hue = (glowPhase + panel.normalizedX * 0.5) % 1;
            const color = this._hsvToRgb(hue, 1, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 11: Hypno Spiral - Classic hypnosis spiral */
    _patternHypnoSpiral(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - 0.5;
            const dy = panel.normalizedY - 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Archimedes spiral
            const spiralPhase = (angle / Math.PI / 2 + dist * 4 - t * 0.5) % 1;
            const spiral = spiralPhase < 0.5 ? 1 : 0;
            
            const brightness = spiral * (0.4 + bass * 0.6) * (1 - dist * 0.3);
            this._updatePanel(panel, this._cachedWhite, brightness);
        });
    }

    // ============================================================
    // CLUB CLASSICS (12-17)
    // ============================================================

    /** Pattern 12: VU Meter - Classic audio level bars */
    _patternVUMeter(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            let level;
            if (panel.normalizedX < 0.33) level = bass;
            else if (panel.normalizedX < 0.66) level = mid;
            else level = high;
            
            const brightness = panel.normalizedY < level ? 1.0 : 0.05;
            
            // Color gradient from green to red
            let color;
            if (panel.normalizedY < 0.5) {
                color = new BABYLON.Color3(0, 1, 0);
            } else if (panel.normalizedY < 0.75) {
                const t = (panel.normalizedY - 0.5) / 0.25;
                color = new BABYLON.Color3(t, 1, 0);
            } else {
                const t = (panel.normalizedY - 0.75) / 0.25;
                color = new BABYLON.Color3(1, 1 - t, 0);
            }
            
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 13: Equalizer Bars - Multiple frequency columns */
    _patternEqualizerBars(t, bass, mid, high, baseColor) {
        const numBars = 14;
        
        this.ledPanels.forEach(panel => {
            const barIndex = Math.floor(panel.normalizedX * numBars);
            
            // Simulate different frequency bands
            const freq = barIndex / numBars;
            let height;
            if (freq < 0.3) height = bass * (0.8 + Math.sin(t * 3 + barIndex) * 0.2);
            else if (freq < 0.6) height = mid * (0.7 + Math.sin(t * 4 + barIndex) * 0.3);
            else height = high * (0.6 + Math.sin(t * 5 + barIndex) * 0.4);
            
            height = Math.min(1, height * 1.2);
            
            const brightness = panel.normalizedY < height ? 0.9 : 0.02;
            const hue = freq;
            const color = this._hsvToRgb(hue, 1, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 14: Beat Grid - Pulsing checkerboard */
    _patternBeatGrid(t, bass, mid, high, baseColor) {
        const gridSize = 4;
        const pulse = bass;
        
        this.ledPanels.forEach(panel => {
            const gridX = Math.floor(panel.normalizedX * gridSize * 2);
            const gridY = Math.floor(panel.normalizedY * gridSize);
            const isOn = (gridX + gridY + Math.floor(t * 4)) % 2 === 0;
            
            const brightness = isOn ? 0.2 + pulse * 0.8 : 0.02;
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /** Pattern 15: Pixel Rain - Digital rain effect */
    _patternPixelRain(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const columnSpeed = 0.8 + (panel.col % 7) * 0.15;
            const columnOffset = panel.col * 0.37; // Pseudo-random offset
            
            const drop = ((t * columnSpeed + columnOffset) % 1.5);
            const dropY = 1 - drop;
            
            const dist = Math.abs(panel.normalizedY - dropY);
            const trailLength = 0.3 + bass * 0.2;
            
            let brightness;
            if (dist < 0.05) brightness = 1; // Head
            else if (panel.normalizedY > dropY && panel.normalizedY < dropY + trailLength) {
                brightness = (1 - (panel.normalizedY - dropY) / trailLength) * 0.7;
            } else brightness = 0.02;
            
            this._updatePanel(panel, this._cachedMatrix, brightness);
        });
    }

    /** Pattern 16: Scanner Beam - Horizontal scanning line */
    _patternScannerBeam(t, bass, mid, high, baseColor) {
        const scanPos = (Math.sin(t * 2) * 0.5 + 0.5);
        const scanWidth = 0.1 + bass * 0.1;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.abs(panel.normalizedY - scanPos);
            const scanBrightness = Math.exp(-dist * dist / (scanWidth * scanWidth));
            
            // Afterglow trail
            const trail = Math.exp(-dist / 0.2) * 0.3;
            
            const brightness = Math.max(scanBrightness, trail) * (0.5 + bass * 0.5);
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /** Pattern 17: Laser Grid - Crossing laser lines */
    _patternLaserGrid(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            // Horizontal lines
            const hLinePos = (t * 0.3) % 0.25;
            const hDist = Math.abs((panel.normalizedY % 0.25) - hLinePos);
            const hLine = Math.exp(-hDist * hDist / 0.001);
            
            // Vertical lines moving opposite
            const vLinePos = 0.25 - (t * 0.3) % 0.25;
            const vDist = Math.abs((panel.normalizedX % 0.25) - vLinePos);
            const vLine = Math.exp(-vDist * vDist / 0.001);
            
            // Intersection glow
            const intersection = hLine * vLine * 2;
            
            const brightness = Math.min(1, (hLine + vLine + intersection)) * (0.4 + bass * 0.6);
            const color = intersection > 0.5 ? this._cachedWhite : baseColor;
            this._updatePanel(panel, color, brightness);
        });
    }

    // ============================================================
    // FLOWING PATTERNS (18-23)
    // ============================================================

    /** Pattern 18: Rainbow Wave - Flowing horizontal rainbow */
    _patternRainbowWave(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const hue = (panel.normalizedX * 2 + panel.normalizedY * 0.5 + t * 0.3) % 1.0;
            const wave = 0.6 + Math.sin(panel.normalizedX * Math.PI * 6 - t * 4) * 0.3;
            const pulse = 0.7 + bass * 0.3;
            
            const color = this._hsvToRgb(hue, 1.0, 1.0);
            this._updatePanel(panel, color, wave * pulse);
        });
    }

    /** Pattern 19: Plasma Flow - Organic plasma movement */
    _patternPlasmaFlow(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX * 4;
            const y = panel.normalizedY * 4;
            
            // Multiple sine waves create plasma effect
            const v1 = Math.sin(x + t);
            const v2 = Math.sin(y + t * 0.7);
            const v3 = Math.sin(x + y + t * 0.5);
            const v4 = Math.sin(Math.sqrt(x * x + y * y) + t * 1.2);
            
            const plasma = (v1 + v2 + v3 + v4) / 4;
            const hue = (plasma * 0.5 + 0.5 + t * 0.05) % 1;
            const brightness = 0.5 + plasma * 0.3 + bass * 0.2;
            
            const color = this._hsvToRgb(hue, 0.9, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 20: Aurora Borealis - Northern lights effect */
    _patternAuroraBorealis(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX;
            const y = panel.normalizedY;
            
            // Flowing curtains
            const curtain1 = Math.sin(x * 3 + t * 0.8) * Math.sin(y * 2 + t * 0.3);
            const curtain2 = Math.sin(x * 5 - t * 0.5) * Math.sin(y * 3 - t * 0.4);
            const curtain3 = Math.sin(x * 2 + y * 4 + t * 0.6);
            
            const aurora = (curtain1 + curtain2 * 0.5 + curtain3 * 0.3) / 1.8;
            
            // Aurora colors - greens and purples
            const hue = 0.3 + aurora * 0.2 + y * 0.15; // Green to cyan to purple
            const saturation = 0.7 + aurora * 0.3;
            const brightness = Math.max(0, aurora * 0.5 + 0.4) * (0.6 + bass * 0.4);
            
            const color = this._hsvToRgb(hue % 1, saturation, 1);
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 21: Fire Rising - Flames rising from bottom */
    _patternFireRising(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX;
            const y = panel.normalizedY;
            
            // Turbulent rising flames
            const turbulence = Math.sin(x * 10 + t * 3) * 0.1 + 
                              Math.sin(x * 20 - t * 5) * 0.05;
            
            const flameHeight = 0.3 + bass * 0.4 + turbulence + 
                               Math.sin(x * 5 + t * 2) * 0.15;
            
            const flame = Math.max(0, 1 - y / flameHeight);
            const flicker = 0.8 + Math.sin(t * 15 + x * 30) * 0.2;
            
            // Fire colors - yellow at bottom, orange, red at top
            let color;
            if (flame > 0.7) {
                color = new BABYLON.Color3(1, 1, 0.3); // Yellow
            } else if (flame > 0.3) {
                color = new BABYLON.Color3(1, 0.5, 0); // Orange
            } else {
                color = new BABYLON.Color3(1, 0.1, 0); // Red
            }
            
            const brightness = flame * flicker;
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 22: Ocean Waves - Rolling water waves */
    _patternOceanWaves(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX;
            const y = panel.normalizedY;
            
            // Multiple wave layers
            const wave1 = Math.sin(x * 6 + t * 2) * 0.1;
            const wave2 = Math.sin(x * 4 - t * 1.5 + 1) * 0.08;
            const wave3 = Math.sin(x * 10 + t * 3) * 0.05;
            
            const waveHeight = 0.5 + wave1 + wave2 + wave3 + bass * 0.2;
            const isWater = y < waveHeight;
            
            // Foam at wave crest
            const foam = Math.abs(y - waveHeight) < 0.05 ? 1 : 0;
            
            // Deep blue gradient
            const depth = isWater ? (1 - y / waveHeight) : 0;
            const blue = isWater ? 0.3 + depth * 0.7 : 0;
            const green = isWater ? 0.1 + depth * 0.3 : 0;
            
            const color = foam ? this._cachedWhite : new BABYLON.Color3(0, green, blue);
            const brightness = isWater ? 0.5 + depth * 0.5 : 0.02;
            this._updatePanel(panel, color, brightness);
        });
    }

    /** Pattern 23: Neon Pulse - Pulsing neon tubes */
    _patternNeonPulse(t, bass, mid, high, baseColor) {
        this.ledPanels.forEach(panel => {
            const x = panel.normalizedX;
            const y = panel.normalizedY;
            
            // Horizontal neon tubes
            const tube1 = Math.exp(-Math.pow((y - 0.2) / 0.03, 2));
            const tube2 = Math.exp(-Math.pow((y - 0.5) / 0.03, 2));
            const tube3 = Math.exp(-Math.pow((y - 0.8) / 0.03, 2));
            
            // Pulsing with different phases
            const pulse1 = 0.5 + Math.sin(t * 4) * 0.5;
            const pulse2 = 0.5 + Math.sin(t * 4 + 2) * 0.5;
            const pulse3 = 0.5 + Math.sin(t * 4 + 4) * 0.5;
            
            // Different neon colors
            const color1 = new BABYLON.Color3(1, 0, 0.5); // Pink
            const color2 = new BABYLON.Color3(0, 1, 1);   // Cyan
            const color3 = new BABYLON.Color3(1, 1, 0);   // Yellow
            
            const b1 = tube1 * pulse1 * (0.6 + bass * 0.4);
            const b2 = tube2 * pulse2 * (0.6 + mid * 0.4);
            const b3 = tube3 * pulse3 * (0.6 + high * 0.4);
            
            // Blend colors
            const r = color1.r * b1 + color2.r * b2 + color3.r * b3;
            const g = color1.g * b1 + color2.g * b2 + color3.g * b3;
            const b = color1.b * b1 + color2.b * b2 + color3.b * b3;
            
            const brightness = Math.min(1, b1 + b2 + b3);
            const color = new BABYLON.Color3(
                Math.min(1, r / Math.max(0.01, brightness)),
                Math.min(1, g / Math.max(0.01, brightness)),
                Math.min(1, b / Math.max(0.01, brightness))
            );
            this._updatePanel(panel, color, brightness);
        });
    }

    // ============================================================
    // UTILITY METHODS
    // ============================================================

    // ============================================================
    // UTILITY METHODS
    // ============================================================

    /** Update single panel color and brightness */
    _updatePanel(panel, color, brightness) {
        const b = Math.max(0, Math.min(1, brightness));
        panel.material.emissiveColor.r = color.r * b;
        panel.material.emissiveColor.g = color.g * b;
        panel.material.emissiveColor.b = color.b * b;
    }

    /** Convert HSV to RGB (cached for performance) */
    _hsvToRgb(h, s, v) {
        let r, g, b;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        return new BABYLON.Color3(r, g, b);
    }

    /** Disable LED wall (all panels off) */
    _disableLEDWall() {
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor.r = 0;
            panel.material.emissiveColor.g = 0;
            panel.material.emissiveColor.b = 0;
        });
    }

    /** Set LED wall active state */
    setActive(active) {
        this.ledWallActive = active;
        if (!active) {
            this._disableLEDWall();
        }
    }

    /** Set animation speed */
    setSpeed(speed) {
        this.ledWallSpeed = speed;
    }

    /** Set pattern index */
    setPattern(pattern) {
        this.ledPattern = pattern % this.patternNames.length;
        this.log.info?.(`🎨 LED pattern: ${this.patternNames[this.ledPattern]}`);
    }

    /** Get current pattern name */
    getPatternName() {
        return this.patternNames[this.ledPattern];
    }

    /** Get total number of patterns */
    getPatternCount() {
        return this.patternNames.length;
    }

    /** Cycle to next pattern */
    nextPattern() {
        this.ledPattern = (this.ledPattern + 1) % this.patternNames.length;
        this.log.info?.(`🎨 LED pattern: ${this.patternNames[this.ledPattern]}`);
    }

    /** Cycle to previous pattern */
    prevPattern() {
        this.ledPattern = (this.ledPattern - 1 + this.patternNames.length) % this.patternNames.length;
        this.log.info?.(`🎨 LED pattern: ${this.patternNames[this.ledPattern]}`);
    }

    /** Set color index */
    setColorIndex(index) {
        this.ledColorIndex = index % this.ledColors.length;
    }

    /** Cycle to next color */
    nextColor() {
        this.ledColorIndex = (this.ledColorIndex + 1) % this.ledColors.length;
    }

    /** Enable/disable auto pattern switching */
    setAutoSwitch(enabled) {
        this.autoSwitch = enabled;
    }

    /** Set auto-switch interval in seconds */
    setAutoSwitchInterval(seconds) {
        this.patternSwitchInterval = seconds;
    }

    /** Dispose all LED wall resources */
    dispose() {
        this.ledPanels.forEach(panel => {
            panel.material.dispose();
            panel.mesh.dispose();
        });
        
        this.ledPanels = [];
        this.log.info?.('🗑️ LED wall system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LEDWallSystem;
}
