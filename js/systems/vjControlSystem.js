// VJ Control System - Centralized lighting coordination for VR Club
// Manages all lighting subsystems and provides unified control interface

class VJControlSystem {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.log = options.logger || console;
        
        // Subsystem references (injected after construction)
        this.laserSystem = null;
        this.spotlightSystem = null;
        this.mirrorBallSystem = null;
        this.ledWallSystem = null;
        this.strobeSystem = null;
        this.hazeSystem = null;
        
        // Global state
        this.masterIntensity = 1.0;
        this.autoMode = true;
        this.bpm = 128;
        this.beatPhase = 0;
        
        // Manual control tracking
        this.manualOverride = false;
        
        // Preset system
        this.presets = this._initPresets();
        this.currentPreset = 'clubbing';
        
        // Animation timing
        this.lastBeatTime = 0;
        this.beatInterval = 60 / this.bpm;
        
        // Auto-mode cycling timers
        this.lastGoboCycleTime = 0;
        this.goboCycleInterval = 16;  // Cycle gobo pattern every 16 seconds
        this.lastColorCycleTime = 0;
        this.colorCycleInterval = 8;  // Cycle colors every 8 seconds
        this.lastSpeedChangeTime = 0;
        this.speedChangeInterval = 24; // Change rotation speed every 24 seconds
        
        // 3D UI button references
        this.controlButtons = [];
    }

    /**
     * Register a subsystem
     */
    registerSystem(name, system) {
        switch(name) {
            case 'laser': this.laserSystem = system; break;
            case 'spotlight': this.spotlightSystem = system; break;
            case 'mirrorball': this.mirrorBallSystem = system; break;
            case 'ledwall': this.ledWallSystem = system; break;
            case 'strobe': this.strobeSystem = system; break;
            case 'haze': this.hazeSystem = system; break;
            default:
                this.log.warn?.('Unknown system: ' + name);
        }
    }

    /**
     * Initialize preset configurations
     * Note: Mutual exclusivity - lasers (ceiling) cannot be active with mirrorBall or laserSheet
     */
    _initPresets() {
        return {
            'clubbing': {
                lasers: false,          // Ceiling lasers OFF (using laser sheet instead)
                laserSheet: true,       // Laser sheet ON
                spotlights: true,
                mirrorBall: false,
                ledWall: true,
                strobes: true,
                blinders: false,
                haze: true,
                ledPattern: 'vuMeter',
                gobo: true,             // Gobo filters ON
                goboPattern: 'star',    // Star pattern
                goboSpeed: 1.0          // Normal rotation speed
            },
            'disco': {
                lasers: false,          // Ceiling lasers OFF (mirror ball is on)
                laserSheet: false,      // Laser sheet OFF (mirror ball is on)
                spotlights: true,
                mirrorBall: true,       // Mirror ball ON (exclusive)
                ledWall: true,
                strobes: false,
                blinders: false,
                haze: true,
                ledPattern: 'rainbow',
                gobo: true,             // Gobo filters ON
                goboPattern: 'flower',  // Flower pattern for disco vibe
                goboSpeed: 0.5          // Slower rotation
            },
            'rave': {
                lasers: false,          // Ceiling lasers OFF (using laser sheet)
                laserSheet: true,       // Laser sheet ON
                spotlights: true,
                mirrorBall: false,
                ledWall: true,
                strobes: true,
                blinders: true,
                haze: true,
                ledPattern: 'strobe',
                gobo: true,             // Gobo filters ON
                goboPattern: 'spiral',  // Spiral for intense rave effect
                goboSpeed: 2.0          // Fast rotation
            },
            'chill': {
                lasers: true,           // Ceiling lasers ON (slow atmospheric)
                laserSheet: false,      // Laser sheet OFF
                spotlights: true,
                mirrorBall: false,
                ledWall: true,
                strobes: false,
                blinders: false,
                haze: true,
                ledPattern: 'colorWash',
                gobo: true,             // Gobo filters ON
                goboPattern: 'rings',   // Soft rings pattern
                goboSpeed: 0.3          // Very slow rotation
            },
            'blackout': {
                lasers: false,
                laserSheet: false,
                spotlights: false,
                mirrorBall: false,
                ledWall: false,
                strobes: false,
                blinders: false,
                haze: false,
                ledPattern: null,
                gobo: false,
                goboPattern: 'circle',
                goboSpeed: 0
            }
        };
    }

    /**
     * Apply a preset
     */
    applyPreset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            this.log.warn?.('Unknown preset: ' + presetName);
            return;
        }
        
        this.currentPreset = presetName;
        
        // Apply to subsystems (respecting mutual exclusivity)
        if (this.laserSystem) {
            this.laserSystem.setActive(preset.lasers);
            if (this.laserSystem.setSheetActive) {
                this.laserSystem.setSheetActive(preset.laserSheet || false);
            }
        }
        
        if (this.spotlightSystem) {
            this.spotlightSystem.setActive(preset.spotlights);
            // Apply gobo settings
            if (preset.gobo !== undefined) {
                this.spotlightSystem.setGoboEnabled(preset.gobo);
            }
            if (preset.goboPattern) {
                this.spotlightSystem.setGoboPattern(preset.goboPattern);
            }
            if (preset.goboSpeed !== undefined) {
                this.spotlightSystem.setGoboRotationSpeed(preset.goboSpeed);
            }
        }
        
        if (this.mirrorBallSystem) {
            this.mirrorBallSystem.setActive(preset.mirrorBall);
        }
        
        if (this.ledWallSystem) {
            this.ledWallSystem.setActive(preset.ledWall);
            if (preset.ledPattern) {
                this.ledWallSystem.setPattern(preset.ledPattern);
            }
        }
        
        if (this.strobeSystem) {
            this.strobeSystem.setStrobesActive(preset.strobes);
            this.strobeSystem.setBlindersActive(preset.blinders);
        }
        
        if (this.hazeSystem) {
            this.hazeSystem.setActive(preset.haze);
        }
        
        this.log.info?.('🎛️ Applied VJ preset: ' + presetName);
    }

    /**
     * Update all subsystems
     */
    update(time, audioData = null) {
        // Beat tracking
        this._updateBeat(time);
        
        // Scale intensity by master
        const scaledAudio = audioData ? {
            bass: audioData.bass * this.masterIntensity,
            mid: audioData.mid * this.masterIntensity,
            high: audioData.high * this.masterIntensity
        } : null;
        
        // Update subsystems
        if (this.laserSystem) {
            this.laserSystem.update(time, scaledAudio);
        }
        
        if (this.spotlightSystem) {
            this.spotlightSystem.update(time, scaledAudio);
        }
        
        if (this.mirrorBallSystem) {
            this.mirrorBallSystem.update(time, scaledAudio);
        }
        
        if (this.ledWallSystem) {
            this.ledWallSystem.update(time, scaledAudio);
        }
        
        if (this.strobeSystem) {
            this.strobeSystem.update(time, scaledAudio);
        }
        
        if (this.hazeSystem) {
            this.hazeSystem.update(time, scaledAudio);
        }
        
        // Auto-mode preset cycling
        if (this.autoMode && !this.manualOverride) {
            this._autoModeLogic(time, scaledAudio);
        }
    }

    /**
     * Beat tracking logic
     */
    _updateBeat(time) {
        if (time - this.lastBeatTime >= this.beatInterval) {
            this.lastBeatTime = time;
            this.beatPhase = (this.beatPhase + 1) % 4; // 4/4 time
            
            // Trigger on-beat effects
            this._onBeat();
        }
    }

    /**
     * Called on each beat
     */
    _onBeat() {
        // Flash strobes on certain beats
        if (this.strobeSystem && this.strobeSystem.strobesActive) {
            if (this.beatPhase === 0 || this.beatPhase === 2) {
                this.strobeSystem.flash();
            }
        }
    }

    /**
     * Auto-mode logic for dynamic show
     */
    _autoModeLogic(time, audioData) {
        // ========== GOBO PATTERN CYCLING ==========
        if (this.spotlightSystem && this.spotlightSystem.goboEnabled) {
            // Cycle gobo patterns periodically
            if (time - this.lastGoboCycleTime >= this.goboCycleInterval) {
                this.lastGoboCycleTime = time;
                this.spotlightSystem.nextGoboPattern();
            }
            
            // Vary rotation speed based on audio energy or time
            if (time - this.lastSpeedChangeTime >= this.speedChangeInterval) {
                this.lastSpeedChangeTime = time;
                // Random speed variation: 0.3 to 2.5, with occasional reverse
                const speeds = [0.3, 0.5, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, -0.5, -1.0];
                const newSpeed = speeds[Math.floor(Math.random() * speeds.length)];
                this.spotlightSystem.setGoboRotationSpeed(newSpeed);
            }
        }
        
        // ========== COLOR CYCLING ==========
        if (time - this.lastColorCycleTime >= this.colorCycleInterval) {
            this.lastColorCycleTime = time;
            // Cycle spotlight colors
            if (this.spotlightSystem) {
                this.spotlightSystem.nextColor();
            }
            // Cycle laser colors
            if (this.laserSystem) {
                this.laserSystem.nextColor();
            }
        }
        
        // ========== ENERGY-BASED ADJUSTMENTS ==========
        if (audioData) {
            const energy = (audioData.bass + audioData.mid + audioData.high) / 3;
            
            // Adjust gobo rotation speed based on audio energy
            if (this.spotlightSystem && this.spotlightSystem.goboEnabled) {
                // Higher energy = faster rotation (0.5 to 3.0 range)
                const dynamicSpeed = 0.5 + (energy * 2.5);
                // Only apply if not recently changed by timer
                if (time - this.lastSpeedChangeTime < this.speedChangeInterval * 0.5) {
                    // Blend current speed with energy-based speed
                    const currentSpeed = this.spotlightSystem.goboRotationSpeed;
                    const blendedSpeed = currentSpeed * 0.7 + dynamicSpeed * 0.3;
                    this.spotlightSystem.setGoboRotationSpeed(blendedSpeed);
                }
            }
            
            // High energy -> faster gobo cycling
            if (energy > 0.7) {
                this.goboCycleInterval = 8; // Faster pattern changes
            } else if (energy < 0.3) {
                this.goboCycleInterval = 24; // Slower, more chill
            } else {
                this.goboCycleInterval = 16; // Normal
            }
        }
    }

    /**
     * Set master intensity (0-1)
     */
    setMasterIntensity(intensity) {
        this.masterIntensity = Math.max(0, Math.min(1, intensity));
    }

    /**
     * Set BPM for beat sync
     */
    setBPM(bpm) {
        this.bpm = Math.max(60, Math.min(200, bpm));
        this.beatInterval = 60 / this.bpm;
    }

    /**
     * Toggle auto mode
     */
    setAutoMode(enabled) {
        this.autoMode = enabled;
        this.manualOverride = !enabled;
    }

    /**
     * Toggle individual effect with mutual exclusivity rules
     * Rule: Laser sheet and mirror ball cannot be active with ceiling lasers
     */
    toggleEffect(effectName, active = null) {
        this.manualOverride = true;
        
        switch(effectName) {
            case 'lasers':
                if (this.laserSystem) {
                    const newState = active !== null ? active : !this.laserSystem.lasersActive;
                    this.laserSystem.setActive(newState);
                    // MUTUAL EXCLUSIVITY: If lasers turn ON, turn off mirror ball and laser sheet
                    if (newState) {
                        if (this.mirrorBallSystem) this.mirrorBallSystem.setActive(false);
                        // Note: laser sheet is in laserSystem
                        if (this.laserSystem.setSheetActive) {
                            this.laserSystem.setSheetActive(false);
                        }
                    }
                }
                break;
            case 'lasersheet':
                if (this.laserSystem && this.laserSystem.setSheetActive) {
                    const newState = active !== null ? active : !this.laserSystem.laserSheetActive;
                    this.laserSystem.setSheetActive(newState);
                    // MUTUAL EXCLUSIVITY: If laser sheet turns ON, turn off ceiling lasers and mirror ball
                    if (newState) {
                        this.laserSystem.setActive(false);
                        if (this.mirrorBallSystem) this.mirrorBallSystem.setActive(false);
                    }
                }
                break;
            case 'spotlights':
                if (this.spotlightSystem) {
                    const newState = active !== null ? active : !this.spotlightSystem.lightsActive;
                    this.spotlightSystem.setActive(newState);
                }
                break;
            case 'mirrorball':
                if (this.mirrorBallSystem) {
                    const newState = active !== null ? active : !this.mirrorBallSystem.mirrorBallActive;
                    this.mirrorBallSystem.setActive(newState);
                    // MUTUAL EXCLUSIVITY: If mirror ball turns ON, turn off lasers and laser sheet
                    if (newState) {
                        if (this.laserSystem) {
                            this.laserSystem.setActive(false);
                            if (this.laserSystem.setSheetActive) {
                                this.laserSystem.setSheetActive(false);
                            }
                        }
                    }
                }
                break;
            case 'ledwall':
                if (this.ledWallSystem) {
                    const newState = active !== null ? active : !this.ledWallSystem.ledWallActive;
                    this.ledWallSystem.setActive(newState);
                }
                break;
            case 'strobes':
                if (this.strobeSystem) {
                    const newState = active !== null ? active : !this.strobeSystem.strobesActive;
                    this.strobeSystem.setStrobesActive(newState);
                }
                break;
            case 'blinders':
                if (this.strobeSystem) {
                    const newState = active !== null ? active : !this.strobeSystem.blindersActive;
                    this.strobeSystem.setBlindersActive(newState);
                }
                break;
            case 'haze':
                if (this.hazeSystem) {
                    const newState = active !== null ? active : !this.hazeSystem.hazeActive;
                    this.hazeSystem.setActive(newState);
                }
                break;
        }
    }

    /**
     * Cycle laser colors
     */
    cycleLaserColor() {
        if (this.laserSystem) {
            this.laserSystem.nextColor();
        }
    }

    /**
     * Cycle LED wall patterns
     */
    cycleLEDPattern() {
        if (this.ledWallSystem) {
            this.ledWallSystem.nextPattern();
        }
    }

    /**
     * Cycle spotlight modes
     */
    cycleSpotlightMode() {
        if (this.spotlightSystem) {
            this.spotlightSystem.nextMode();
        }
    }

    // ========== GOBO FILTER CONTROLS ==========

    /**
     * Toggle gobo filters on/off
     */
    toggleGobo() {
        if (this.spotlightSystem) {
            return this.spotlightSystem.toggleGobo();
        }
        return false;
    }

    /**
     * Enable/disable gobo filters
     */
    setGoboEnabled(enabled) {
        if (this.spotlightSystem) {
            this.spotlightSystem.setGoboEnabled(enabled);
        }
    }

    /**
     * Cycle to next gobo pattern
     */
    cycleGoboPattern() {
        if (this.spotlightSystem) {
            return this.spotlightSystem.nextGoboPattern();
        }
        return null;
    }

    /**
     * Set gobo rotation speed (positive = clockwise, negative = counter-clockwise)
     */
    setGoboRotationSpeed(speed) {
        if (this.spotlightSystem) {
            this.spotlightSystem.setGoboRotationSpeed(speed);
        }
    }

    /**
     * Get current gobo pattern name
     */
    getGoboPattern() {
        if (this.spotlightSystem) {
            return this.spotlightSystem.getGoboPattern();
        }
        return null;
    }

    /**
     * Get current state for UI
     */
    getState() {
        return {
            masterIntensity: this.masterIntensity,
            autoMode: this.autoMode,
            bpm: this.bpm,
            currentPreset: this.currentPreset,
            effects: {
                lasers: this.laserSystem?.lasersActive || false,
                spotlights: this.spotlightSystem?.lightsActive || false,
                mirrorBall: this.mirrorBallSystem?.mirrorBallActive || false,
                ledWall: this.ledWallSystem?.ledWallActive || false,
                strobes: this.strobeSystem?.strobesActive || false,
                blinders: this.strobeSystem?.blindersActive || false,
                haze: this.hazeSystem?.hazeActive || false,
                gobo: this.spotlightSystem?.goboEnabled || false,
                goboPattern: this.spotlightSystem?.getGoboPattern() || 'circle'
            }
        };
    }

    /**
     * Create 3D VJ control panel in scene
     */
    createControlPanel(position) {
        const panelRoot = new BABYLON.TransformNode("vjControlPanel", this.scene);
        panelRoot.position = position;
        
        // Panel background
        const panel = BABYLON.MeshBuilder.CreateBox("vjPanel", {
            width: 1.2,
            height: 0.8,
            depth: 0.05
        }, this.scene);
        panel.parent = panelRoot;
        
        const panelMat = new BABYLON.StandardMaterial("vjPanelMat", this.scene);
        panelMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        panelMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        panel.material = panelMat;
        
        // Create toggle buttons
        const buttons = [
            { label: 'LASERS', effect: 'lasers', x: -0.4, y: 0.25 },
            { label: 'SPOTS', effect: 'spotlights', x: 0, y: 0.25 },
            { label: 'DISCO', effect: 'mirrorball', x: 0.4, y: 0.25 },
            { label: 'LED', effect: 'ledwall', x: -0.4, y: 0 },
            { label: 'STROBE', effect: 'strobes', x: 0, y: 0 },
            { label: 'HAZE', effect: 'haze', x: 0.4, y: 0 }
        ];
        
        buttons.forEach(btn => {
            const button = this._createButton(btn.label, btn.effect);
            button.parent = panelRoot;
            button.position = new BABYLON.Vector3(btn.x, btn.y, -0.03);
            this.controlButtons.push({ mesh: button, effect: btn.effect });
        });
        
        return panelRoot;
    }

    /**
     * Create a single control button
     */
    _createButton(label, effectName) {
        const button = BABYLON.MeshBuilder.CreateBox("vjBtn_" + effectName, {
            width: 0.25,
            height: 0.2,
            depth: 0.02
        }, this.scene);
        
        const btnMat = new BABYLON.StandardMaterial("vjBtnMat_" + effectName, this.scene);
        btnMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        btnMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        button.material = btnMat;
        
        // Make interactive
        button.actionManager = new BABYLON.ActionManager(this.scene);
        button.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                BABYLON.ActionManager.OnPickTrigger,
                () => {
                    this.toggleEffect(effectName);
                    this._updateButtonVisuals();
                }
            )
        );
        
        // Hover effect
        button.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                BABYLON.ActionManager.OnPointerOverTrigger,
                () => {
                    btnMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
                }
            )
        );
        button.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                BABYLON.ActionManager.OnPointerOutTrigger,
                () => {
                    this._updateButtonVisuals();
                }
            )
        );
        
        return button;
    }

    /**
     * Update button colors based on effect state
     */
    _updateButtonVisuals() {
        const state = this.getState();
        
        this.controlButtons.forEach(btn => {
            const isActive = state.effects[btn.effect];
            const mat = btn.mesh.material;
            
            if (isActive) {
                mat.emissiveColor = new BABYLON.Color3(0, 0.8, 0); // Green glow
            } else {
                mat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            }
        });
    }

    /**
     * Dispose all resources
     */
    dispose() {
        this.controlButtons.forEach(btn => {
            btn.mesh.dispose();
        });
        this.controlButtons = [];
        
        // Note: Subsystems dispose themselves
        this.log.info?.('🗑️ VJ Control system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VJControlSystem;
}
