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
        
        // Pattern names for UI
        this.patternNames = [
            'Bass Explosion',
            'VU Meter',
            'Equalizer Bars',
            'Beat Grid',
            'Rainbow Wave',
            'Strobe Flash',
            'Color Wash',
            'Matrix Rain'
        ];
        
        // Frame counter for animation
        this.frameCounter = 0;
    }

    /**
     * Create LED wall behind DJ booth
     */
    createLEDWall() {
        this.ledPanels = [];
        
        const panelWidth = this.wallWidth / this.panelsX;
        const panelHeight = this.wallHeight / this.panelsY;
        const startX = -this.wallWidth / 2 + panelWidth / 2;
        const startY = panelHeight / 2;
        const wallZ = -26.4;
        
        // Create backing panel
        const backing = BABYLON.MeshBuilder.CreateBox("ledBacking", {
            width: this.wallWidth + 0.2,
            height: this.wallHeight + 0.2,
            depth: 0.1
        }, this.scene);
        backing.position = new BABYLON.Vector3(0, this.wallHeight / 2 + 0.5, wallZ - 0.1);
        
        const backingMat = this.materialFactory.createPBRMaterial("ledBackingMat", {
            baseColor: [0.02, 0.02, 0.02],
            metallic: 0.8,
            roughness: 0.3
        });
        backing.material = backingMat;
        
        // Create LED panels
        for (let y = 0; y < this.panelsY; y++) {
            for (let x = 0; x < this.panelsX; x++) {
                const panel = BABYLON.MeshBuilder.CreatePlane("ledPanel_" + x + "_" + y, {
                    width: panelWidth * 0.9,
                    height: panelHeight * 0.9
                }, this.scene);
                
                panel.position = new BABYLON.Vector3(
                    startX + x * panelWidth,
                    startY + y * panelHeight + 0.5,
                    wallZ
                );
                
                const panelMat = new BABYLON.StandardMaterial("ledPanelMat_" + x + "_" + y, this.scene);
                panelMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
                panelMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                panelMat.specularColor = new BABYLON.Color3(0, 0, 0);
                panelMat.disableLighting = true;
                panel.material = panelMat;
                
                this.ledPanels.push({
                    mesh: panel,
                    material: panelMat,
                    x: x,
                    y: y,
                    normalizedX: x / this.panelsX,
                    normalizedY: y / this.panelsY
                });
            }
        }
        
        this.log.info?.('✅ LED wall created with ' + this.ledPanels.length + ' panels');
    }

    /**
     * Update LED wall animation each frame
     */
    update(time, audioData = null) {
        this.frameCounter++;
        
        if (!this.ledWallActive) {
            this._disableLEDWall();
            return;
        }
        
        this.ledTime += 0.016 * (this.ledWallSpeed || 1.0);
        
        // Get current color
        const baseColor = this.ledColors[this.ledColorIndex];
        
        // Check if we have audio data
        const hasAudio = audioData && (audioData.bass > 0.01 || audioData.mid > 0.01 || audioData.high > 0.01);
        
        // Run pattern
        switch (this.ledPattern) {
            case 0:
                this._patternBassExplosion(this.ledTime, audioData, hasAudio, baseColor);
                break;
            case 1:
                this._patternVUMeter(this.ledTime, audioData, hasAudio, baseColor);
                break;
            case 2:
                this._patternEqualizerBars(this.ledTime, audioData, hasAudio, baseColor);
                break;
            case 3:
                this._patternBeatGrid(this.ledTime, audioData, hasAudio, baseColor);
                break;
            case 4:
                this._patternRainbowWave(this.ledTime, baseColor);
                break;
            case 5:
                this._patternStrobeFlash(this.ledTime, baseColor);
                break;
            case 6:
                this._patternColorWash(this.ledTime, baseColor);
                break;
            case 7:
                this._patternMatrixRain(this.ledTime, baseColor);
                break;
            default:
                this._patternRainbowWave(this.ledTime, baseColor);
        }
    }

    /**
     * Pattern: Bass Explosion - Circular pulse from center
     */
    _patternBassExplosion(time, audioData, hasAudio, baseColor) {
        const centerX = 0.5;
        const centerY = 0.5;
        
        let bass, intensity;
        if (hasAudio) {
            bass = audioData.bass;
            intensity = 0.3 + bass * 0.7;
        } else {
            // Auto-animate when no audio
            bass = 0.5 + Math.sin(time * 2) * 0.3;
            intensity = 0.5 + Math.sin(time * 3) * 0.3;
        }
        
        const pulseRadius = (time * 0.5) % 1.0;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.normalizedX - centerX;
            const dy = panel.normalizedY - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            const ringWidth = 0.15 + bass * 0.1;
            const ringBrightness = Math.exp(-Math.pow((dist - pulseRadius) / ringWidth, 2));
            
            const brightness = ringBrightness * intensity;
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /**
     * Pattern: VU Meter - Audio level bars
     */
    _patternVUMeter(time, audioData, hasAudio, baseColor) {
        let bass, mid, high;
        if (hasAudio) {
            bass = audioData.bass;
            mid = audioData.mid;
            high = audioData.high;
        } else {
            // Auto-animate
            bass = 0.6 + Math.sin(time * 1.5) * 0.3;
            mid = 0.5 + Math.sin(time * 2.3) * 0.3;
            high = 0.4 + Math.sin(time * 3.7) * 0.3;
        }
        
        this.ledPanels.forEach(panel => {
            let level;
            if (panel.normalizedX < 0.33) {
                level = bass;
            } else if (panel.normalizedX < 0.66) {
                level = mid;
            } else {
                level = high;
            }
            
            const brightness = panel.normalizedY < level ? 1.0 : 0.1;
            
            // Color gradient from green to red
            let color;
            if (panel.normalizedY < 0.6) {
                color = new BABYLON.Color3(0, 1, 0);
            } else if (panel.normalizedY < 0.8) {
                color = new BABYLON.Color3(1, 1, 0);
            } else {
                color = new BABYLON.Color3(1, 0, 0);
            }
            
            this._updatePanel(panel, color, brightness);
        });
    }

    /**
     * Pattern: Equalizer Bars - Vertical frequency bars
     */
    _patternEqualizerBars(time, audioData, hasAudio, baseColor) {
        this.ledPanels.forEach(panel => {
            let barHeight;
            if (hasAudio) {
                // Use audio frequencies
                const freqIndex = Math.floor(panel.normalizedX * 8);
                barHeight = [audioData.bass, audioData.mid, audioData.high, audioData.bass * 0.8,
                            audioData.mid * 0.9, audioData.high * 0.7, audioData.bass * 0.6, audioData.mid * 0.8][freqIndex] || 0.5;
            } else {
                // Auto-animate
                const wave = Math.sin(time * 2 + panel.normalizedX * Math.PI * 4);
                barHeight = 0.3 + wave * 0.3 + Math.sin(time * 3) * 0.2;
            }
            
            const brightness = panel.normalizedY < barHeight ? 0.9 : 0.05;
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /**
     * Pattern: Beat Grid - Pulsing grid
     */
    _patternBeatGrid(time, audioData, hasAudio, baseColor) {
        let pulse;
        if (hasAudio) {
            pulse = audioData.bass;
        } else {
            pulse = 0.5 + Math.sin(time * 4) * 0.5;
        }
        
        this.ledPanels.forEach(panel => {
            const gridX = Math.floor(panel.normalizedX * 7);
            const gridY = Math.floor(panel.normalizedY * 5);
            const isOn = (gridX + gridY + Math.floor(time * 4)) % 2 === 0;
            
            const brightness = isOn ? pulse : 0.1;
            this._updatePanel(panel, baseColor, brightness);
        });
    }

    /**
     * Pattern: Rainbow Wave - Horizontal color wave
     */
    _patternRainbowWave(time, baseColor) {
        this.ledPanels.forEach(panel => {
            const hue = (panel.normalizedX + time * 0.3) % 1.0;
            const color = this._hsvToRgb(hue, 1.0, 1.0);
            const wave = 0.5 + Math.sin(panel.normalizedX * Math.PI * 4 - time * 3) * 0.5;
            
            this._updatePanel(panel, color, wave);
        });
    }

    /**
     * Pattern: Strobe Flash - Full wall strobe
     */
    _patternStrobeFlash(time, baseColor) {
        const strobe = Math.sin(time * 15) > 0.8 ? 1.0 : 0.0;
        
        this.ledPanels.forEach(panel => {
            this._updatePanel(panel, baseColor, strobe);
        });
    }

    /**
     * Pattern: Color Wash - Smooth color transition
     */
    _patternColorWash(time, baseColor) {
        const hue = (time * 0.1) % 1.0;
        const color = this._hsvToRgb(hue, 0.8, 1.0);
        const brightness = 0.7 + Math.sin(time * 2) * 0.3;
        
        this.ledPanels.forEach(panel => {
            this._updatePanel(panel, color, brightness);
        });
    }

    /**
     * Pattern: Matrix Rain - Falling columns
     */
    _patternMatrixRain(time, baseColor) {
        this.ledPanels.forEach(panel => {
            const columnSpeed = 1 + (panel.x % 5) * 0.5;
            const drop = ((time * columnSpeed + panel.x * 0.3) % 1.5);
            const dropY = 1 - drop;
            
            const dist = Math.abs(panel.normalizedY - dropY);
            const brightness = dist < 0.15 ? (0.15 - dist) / 0.15 : 0.02;
            
            const color = new BABYLON.Color3(0, 1, 0.3); // Matrix green
            this._updatePanel(panel, color, brightness);
        });
    }

    /**
     * Update single panel color and brightness
     */
    _updatePanel(panel, color, brightness) {
        panel.material.emissiveColor = color.scale(Math.max(0, Math.min(1, brightness)));
    }

    /**
     * Convert HSV to RGB
     */
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

    /**
     * Disable LED wall (all panels off)
     */
    _disableLEDWall() {
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
        });
    }

    /**
     * Set LED wall active state
     */
    setActive(active) {
        this.ledWallActive = active;
    }

    /**
     * Set animation speed
     */
    setSpeed(speed) {
        this.ledWallSpeed = speed;
    }

    /**
     * Set pattern index
     */
    setPattern(pattern) {
        this.ledPattern = pattern % this.patternNames.length;
    }

    /**
     * Get current pattern name
     */
    getPatternName() {
        return this.patternNames[this.ledPattern];
    }

    /**
     * Cycle to next pattern
     */
    nextPattern() {
        this.ledPattern = (this.ledPattern + 1) % this.patternNames.length;
    }

    /**
     * Set color index
     */
    setColorIndex(index) {
        this.ledColorIndex = index % this.ledColors.length;
    }

    /**
     * Cycle to next color
     */
    nextColor() {
        this.ledColorIndex = (this.ledColorIndex + 1) % this.ledColors.length;
    }

    /**
     * Dispose all LED wall resources
     */
    dispose() {
        this.ledPanels.forEach(panel => {
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
