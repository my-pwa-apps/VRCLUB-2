// Strobe & Blinder System - High-intensity flash effects for VR Club
// Handles strobe lights and audience blinders

class StrobeSystem {
    constructor(scene, materialFactory, options = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = options.logger || console;
        
        // Strobe state
        this.strobesActive = false;
        this.strobeSpeed = 1.0;
        
        // Blinder state
        this.blindersActive = false;
        
        // Mesh references
        this.strobeLights = [];
        this.blinders = [];
        
        // Animation
        this.frameCounter = 0;
        this.disposed = false;
        
        // Cached colors to avoid per-frame allocations
        this._cachedBlack = new BABYLON.Color3(0, 0, 0);
        this._cachedWhite = new BABYLON.Color3(1, 1, 1);
        this._scratchColor = new BABYLON.Color3(0, 0, 0);
    }

    /**
     * Create strobe lights on trusses
     */
    createStrobeLights() {
        this.strobeLights = [];
        
        // Strobe positions - distributed on trusses
        const strobePositions = [
            { x: -6, y: 7.8, z: -8 },
            { x: 6, y: 7.8, z: -8 },
            { x: -6, y: 7.8, z: -16 },
            { x: 6, y: 7.8, z: -16 },
            { x: 0, y: 7.8, z: -12 }
        ];
        
        strobePositions.forEach((pos, i) => {
            const strobe = this._createStrobeUnit(pos, i);
            this.strobeLights.push(strobe);
        });
        
        this.log.info?.('✅ Strobe system created with ' + this.strobeLights.length + ' units');
    }

    /**
     * Create a single strobe unit
     */
    _createStrobeUnit(pos, index) {
        // Fixture housing
        const housing = BABYLON.MeshBuilder.CreateBox("strobeHousing" + index, {
            width: 0.3,
            height: 0.15,
            depth: 0.2
        }, this.scene);
        housing.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
        
        const housingMat = this.materialFactory.createPBRMaterial("strobeHousingMat" + index, {
            baseColor: [0.1, 0.1, 0.1],
            metallic: 0.9,
            roughness: 0.3
        });
        housing.material = housingMat;
        
        // Light emitter face
        const emitter = BABYLON.MeshBuilder.CreatePlane("strobeEmitter" + index, {
            width: 0.25,
            height: 0.1
        }, this.scene);
        emitter.position = new BABYLON.Vector3(pos.x, pos.y - 0.08, pos.z);
        emitter.rotation.x = Math.PI / 2;
        
        const emitterMat = new BABYLON.StandardMaterial("strobeEmitterMat" + index, this.scene);
        emitterMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        emitterMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        emitterMat.disableLighting = true;
        emitter.material = emitterMat;
        
        // Actual point light
        const light = new BABYLON.PointLight("strobeLight" + index,
            new BABYLON.Vector3(pos.x, pos.y - 0.1, pos.z),
            this.scene
        );
        light.diffuse = new BABYLON.Color3(1, 1, 1);
        light.intensity = 0;
        light.range = 15;
        
        return {
            housing: housing,
            emitter: emitter,
            emitterMat: emitterMat,
            light: light,
            intensity: 0
        };
    }

    /**
     * Create audience blinders
     */
    createBlinders() {
        this.blinders = [];
        
        const blinderPositions = [
            { x: -6, y: 7.5, z: -8 },
            { x: -2, y: 7.5, z: -8 },
            { x: 2, y: 7.5, z: -8 },
            { x: 6, y: 7.5, z: -8 }
        ];
        
        blinderPositions.forEach((pos, i) => {
            const blinder = this._createBlinderUnit(pos, i);
            this.blinders.push(blinder);
        });
        
        this.log.info?.('✅ Blinder system created with ' + this.blinders.length + ' units');
    }

    /**
     * Create a single blinder unit
     */
    _createBlinderUnit(pos, index) {
        // Fixture body (square 4-cell style)
        const fixture = BABYLON.MeshBuilder.CreateBox("blinder" + index, {
            width: 0.8,
            height: 0.8,
            depth: 0.2
        }, this.scene);
        fixture.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
        fixture.rotation.x = Math.PI / 6; // Angled down
        
        const fixtureMat = this.materialFactory.getPreset('lightFixture');
        fixture.material = fixtureMat;
        
        // Light emitter face
        const emitter = BABYLON.MeshBuilder.CreatePlane("blinderEmitter" + index, {
            size: 0.7
        }, this.scene);
        emitter.parent = fixture;
        emitter.position.z = -0.11;
        emitter.rotation.y = Math.PI;
        
        const emitterMat = new BABYLON.PBRMaterial("blinderEmitterMat" + index, this.scene);
        emitterMat.albedoColor = new BABYLON.Color3(0, 0, 0);
        emitterMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.7); // Warm white
        emitterMat.emissiveIntensity = 0;
        emitterMat.disableLighting = true;
        emitter.material = emitterMat;
        
        // Lens flare
        const flare = BABYLON.MeshBuilder.CreatePlane("blinderFlare" + index, {
            size: 4.0
        }, this.scene);
        flare.parent = fixture;
        flare.position.z = -0.2;
        flare.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        
        const flareMat = new BABYLON.StandardMaterial("blinderFlareMat" + index, this.scene);
        flareMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        flareMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.7);
        flareMat.alpha = 0;
        flareMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        flareMat.disableLighting = true;
        flare.material = flareMat;
        
        return {
            fixture: fixture,
            emitter: emitter,
            emitterMat: emitterMat,
            flare: flare,
            flareMat: flareMat,
            intensity: 0
        };
    }

    /**
     * Update strobe and blinder animations
     */
    update(time, audioData = null) {
        this.frameCounter++;
        const speedMultiplier = this.strobeSpeed || 1.0;
        
        // Update strobes
        if (this.strobesActive) {
            this._updateStrobes(time, speedMultiplier, audioData);
        } else {
            this._disableStrobes();
        }
        
        // Update blinders
        if (this.blindersActive) {
            this._updateBlinders(time, speedMultiplier, audioData);
        } else {
            this._disableBlinders();
        }
    }

    /**
     * Update strobe light animation
     */
    _updateStrobes(time, speedMultiplier, audioData) {
        const strobeFreq = 10 * speedMultiplier;
        const strobeOn = Math.sin(time * strobeFreq) > 0.9;
        
        // Audio reactivity - flash on bass hits
        let audioTrigger = false;
        if (audioData && audioData.bass > 0.8) {
            audioTrigger = true;
        }
        
        const intensity = (strobeOn || audioTrigger) ? 1.0 : 0.0;
        
        this.strobeLights.forEach(strobe => {
            this._scratchColor.r = intensity;
            this._scratchColor.g = intensity;
            this._scratchColor.b = intensity;
            strobe.emitterMat.emissiveColor.copyFrom(this._scratchColor);
            strobe.light.intensity = intensity * 20;
        });
    }

    /**
     * Disable strobe lights
     */
    _disableStrobes() {
        this.strobeLights.forEach(strobe => {
            strobe.emitterMat.emissiveColor.copyFrom(this._cachedBlack);
            strobe.light.intensity = 0;
        });
    }

    /**
     * Update blinder animation
     */
    _updateBlinders(time, speedMultiplier, audioData) {
        // Blinders pulse slowly or on audio drops
        const pulse = 0.5 + Math.sin(time * 2 * speedMultiplier) * 0.5;
        
        let intensity = pulse;
        if (audioData && audioData.bass > 0.9) {
            intensity = 1.0; // Full blast on big hits
        }
        
        this.blinders.forEach(blinder => {
            blinder.emitterMat.emissiveIntensity = intensity * 5;
            blinder.flareMat.alpha = intensity * 0.5;
        });
    }

    /**
     * Disable blinders
     */
    _disableBlinders() {
        this.blinders.forEach(blinder => {
            blinder.emitterMat.emissiveIntensity = 0;
            blinder.flareMat.alpha = 0;
        });
    }

    /**
     * Set strobe active state
     */
    setStrobesActive(active) {
        this.strobesActive = active;
    }

    /**
     * Set blinders active state
     */
    setBlindersActive(active) {
        this.blindersActive = active;
    }

    /**
     * Set strobe speed
     */
    setSpeed(speed) {
        this.strobeSpeed = speed;
    }

    /**
     * Trigger a single strobe flash
     */
    flash() {
        this.strobeLights.forEach(strobe => {
            strobe.emitterMat.emissiveColor.copyFrom(this._cachedWhite);
            strobe.light.intensity = 30;
        });
        
        // Auto-reset after brief delay (guarded against disposal)
        setTimeout(() => {
            if (!this.disposed && !this.strobesActive) {
                this._disableStrobes();
            }
        }, 50);
    }

    /**
     * Trigger blinder flash
     */
    blinderFlash() {
        this.blinders.forEach(blinder => {
            blinder.emitterMat.emissiveIntensity = 10;
            blinder.flareMat.alpha = 0.8;
        });
        
        setTimeout(() => {
            if (!this.disposed && !this.blindersActive) {
                this._disableBlinders();
            }
        }, 100);
    }

    /**
     * Dispose all strobe/blinder resources
     */
    dispose() {
        this.disposed = true;
        
        this.strobeLights.forEach(strobe => {
            strobe.housing.dispose();
            strobe.emitter.dispose();
            strobe.emitterMat.dispose();
            strobe.light.dispose();
        });
        
        this.blinders.forEach(blinder => {
            blinder.fixture.dispose();
            blinder.emitter.dispose();
            blinder.emitterMat.dispose();
            blinder.flare.dispose();
            blinder.flareMat.dispose();
        });
        
        this.strobeLights = [];
        this.blinders = [];
        
        this.log.info?.('🗑️ Strobe/Blinder system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StrobeSystem;
}
