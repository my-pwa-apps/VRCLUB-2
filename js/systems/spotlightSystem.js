// Spotlight System (Gobos/Moving Heads) - Modular lighting for VR Club
// Handles spotlight creation, gobo projections, and beam animations

class SpotlightSystem {
    constructor(scene, materialFactory, options = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = options.logger || console;
        this.maxLights = options.maxLights || 4;
        
        // Spotlight state
        this.spotlights = [];
        this.lightsActive = false;
        this.spotlightSpeed = 1.0;
        this.spotlightMode = 0; // 0=strobe+sweep, 1=sweep, 2=strobe static, 3=static
        this.spotlightPattern = 0;
        this.spotStrobeActive = true;
        
        // Color management
        this.spotColorIndex = 0;
        this.currentSpotColor = new BABYLON.Color3(1, 0, 0);
        this.spotColorList = [
            new BABYLON.Color3(1, 0, 0),      // Red
            new BABYLON.Color3(0, 0, 1),      // Blue
            new BABYLON.Color3(0, 1, 0),      // Green
            new BABYLON.Color3(1, 0, 1),      // Magenta
            new BABYLON.Color3(1, 1, 0),      // Yellow
            new BABYLON.Color3(0, 1, 1),      // Cyan
            new BABYLON.Color3(1, 0.5, 0),    // Orange
            new BABYLON.Color3(0.5, 0, 1),    // Purple
            new BABYLON.Color3(1, 1, 1)       // White
        ];
        
        // Truss-mounted light references
        this.trussLights = null;
        
        // Animation state
        this.lastActivePhase = 0;
        this.frameCounter = 0;
    }

    /**
     * Set truss light fixture references (from TrussMountedLights)
     */
    setTrussLights(trussLights) {
        this.trussLights = trussLights;
    }

    /**
     * Create all spotlights on trusses
     */
    createSpotlights() {
        this.spotlights = [];
        
        // 6 spotlights: 3 left, 3 right - on actual trusses
        const spotPositions = [
            { x: -8, z: -8 },
            { x: -8, z: -12 },
            { x: -8, z: -16 },
            { x: 8, z: -8 },
            { x: 8, z: -12 },
            { x: 8, z: -16 }
        ];
        
        this.currentSpotColor = this.spotColorList[0];
        
        spotPositions.forEach((pos, i) => {
            const spotlight = this._createSpotlight(pos, i);
            this.spotlights.push(spotlight);
        });
        
        this.log.info?.('✅ Spotlight system created with ' + this.spotlights.length + ' units');
    }

    /**
     * Create a single spotlight with beam and floor pool
     */
    _createSpotlight(pos, index) {
        // Get fixture data if available
        const fixtureData = this.trussLights ? this.trussLights[index] : null;
        const head = fixtureData ? fixtureData.head : null;
        const yoke = fixtureData ? fixtureData.yoke : null;
        
        // SpotLight
        const spot = new BABYLON.SpotLight("spot" + index,
            new BABYLON.Vector3(pos.x, 7.3, pos.z),
            new BABYLON.Vector3(0, -1, 0),
            Math.PI / 6,
            5,
            this.scene
        );
        spot.diffuse = new BABYLON.Color3(0, 0, 0);
        spot.specular = this.currentSpotColor;
        spot.intensity = 12;
        spot.range = 25;
        spot.setEnabled(false);
        
        // Volumetric beam cone
        const beam = BABYLON.MeshBuilder.CreateCylinder("spotBeam" + index, {
            diameterTop: 1.5,
            diameterBottom: 0.2,
            height: 1,
            tessellation: 16,
            cap: BABYLON.Mesh.NO_CAP
        }, this.scene);
        
        if (head) {
            beam.parent = head;
            beam.rotation.x = Math.PI;
            beam.position = new BABYLON.Vector3(0, -0.5, 0);
        } else {
            beam.position = new BABYLON.Vector3(pos.x, 7.3, pos.z);
        }
        beam.isPickable = false;
        
        // Simple beam material (no animated texture)
        const beamMat = new BABYLON.StandardMaterial("spotBeamMat" + index, this.scene);
        beamMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        beamMat.specularColor = new BABYLON.Color3(0, 0, 0);
        beamMat.emissiveColor = this.currentSpotColor.clone();
        beamMat.alpha = 0.08;
        beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        beamMat.backFaceCulling = false;
        beamMat.disableLighting = true;
        beam.material = beamMat;
        beam.visibility = 1.0;
        beam.renderingGroupId = 1;
        
        // Light pool on floor
        const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + index, {
            radius: 0.5,
            tessellation: 32
        }, this.scene);
        lightPool.rotation.x = Math.PI / 2;
        lightPool.position = new BABYLON.Vector3(pos.x, 0.03, pos.z - 5);
        lightPool.isPickable = false;
        
        const poolMat = new BABYLON.StandardMaterial("poolMat" + index, this.scene);
        poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        poolMat.specularColor = new BABYLON.Color3(0, 0, 0);
        poolMat.emissiveColor = this.currentSpotColor.clone();
        poolMat.alpha = 0.7;
        poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        poolMat.disableLighting = true;
        lightPool.material = poolMat;
        lightPool.renderingGroupId = 1;
        
        // Soft edge glow
        const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + index, {
            radius: 0.5,
            tessellation: 32
        }, this.scene);
        lightPoolGlow.rotation.x = Math.PI / 2;
        lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
        lightPoolGlow.isPickable = false;
        
        const poolGlowMat = new BABYLON.StandardMaterial("poolGlowMat" + index, this.scene);
        poolGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.8);
        poolGlowMat.alpha = 0.4;
        poolGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        poolGlowMat.disableLighting = true;
        lightPoolGlow.material = poolGlowMat;
        lightPoolGlow.renderingGroupId = 1;
        
        return {
            light: spot,
            beam: beam,
            beamMat: beamMat,
            lightPool: lightPool,
            poolMat: poolMat,
            lightPoolGlow: lightPoolGlow,
            poolGlowMat: poolGlowMat,
            fixture: fixtureData ? fixtureData.fixture : null,
            head: head,
            yoke: yoke,
            lens: fixtureData ? fixtureData.lens : null,
            lightSource: fixtureData ? fixtureData.lightSource : null,
            bezel: fixtureData ? fixtureData.bezel : null,
            flare: fixtureData ? fixtureData.flare : null,
            lensMat: fixtureData ? fixtureData.lensMat : null,
            sourceMat: fixtureData ? fixtureData.sourceMat : null,
            flareMat: fixtureData ? fixtureData.flareMat : null,
            basePos: new BABYLON.Vector3(pos.x, 7.3, pos.z),
            phase: index * (Math.PI * 2 / 6),
            speed: 0.8,
            color: this.currentSpotColor,
            index: index
        };
    }

    /**
     * Update spotlight animations each frame
     */
    update(time, audioData = null) {
        this.frameCounter++;
        const speedMultiplier = this.spotlightSpeed || 1.0;
        
        if (!this.lightsActive) {
            this._disableSpotlights();
            return;
        }
        
        // Update based on mode
        switch (this.spotlightMode) {
            case 0: // Strobe + Sweep
                this._updateSweepAnimation(time, speedMultiplier, true);
                break;
            case 1: // Sweep only
                this._updateSweepAnimation(time, speedMultiplier, false);
                break;
            case 2: // Strobe static
                this._updateStaticWithStrobe(time, speedMultiplier);
                break;
            case 3: // Static
                this._updateStatic();
                break;
        }
        
        // Update colors
        this._updateColors();
    }

    /**
     * Update sweep animation pattern
     */
    _updateSweepAnimation(time, speedMultiplier, withStrobe) {
        const pattern = this.spotlightPattern;
        
        this.spotlights.forEach((spotlight, i) => {
            // Enable light and beam
            spotlight.light.setEnabled(true);
            spotlight.beam.setEnabled(true);
            spotlight.lightPool.setEnabled(true);
            spotlight.lightPoolGlow.setEnabled(true);
            
            // Calculate sweep angles based on pattern
            let panAngle, tiltAngle;
            
            switch (pattern) {
                case 0: // Random/Fast
                    panAngle = Math.sin(time * 0.7 * speedMultiplier + spotlight.phase) * 0.5;
                    tiltAngle = 0.3 + Math.cos(time * 0.5 * speedMultiplier + spotlight.phase * 2) * 0.2;
                    break;
                case 1: // Figure-8
                    panAngle = Math.sin(time * 0.3 * speedMultiplier + spotlight.phase) * 0.6;
                    tiltAngle = 0.3 + Math.sin(time * 0.6 * speedMultiplier + spotlight.phase) * 0.15;
                    break;
                case 2: // Mirror Sweep
                    const mirrorMod = i < 3 ? 1 : -1;
                    panAngle = Math.sin(time * 0.4 * speedMultiplier) * 0.5 * mirrorMod;
                    tiltAngle = 0.35 + Math.cos(time * 0.3 * speedMultiplier) * 0.15;
                    break;
                case 3: // Circle
                    panAngle = Math.sin(time * 0.5 * speedMultiplier + spotlight.phase) * 0.4;
                    tiltAngle = 0.3 + Math.cos(time * 0.5 * speedMultiplier + spotlight.phase) * 0.2;
                    break;
                default:
                    panAngle = 0;
                    tiltAngle = 0.3;
            }
            
            // Apply strobe effect - binary on/off for clean flashing
            let intensity = 1.0;
            let beamVisible = true;
            if (withStrobe && this.spotStrobeActive) {
                const strobeSpeed = 8 * speedMultiplier;
                beamVisible = Math.sin(time * strobeSpeed + i * 0.5) > 0.7;
                intensity = beamVisible ? 1.0 : 0.0;
            }
            
            // Update fixture rotation
            if (spotlight.yoke) {
                spotlight.yoke.rotation.y = panAngle;
            }
            if (spotlight.head) {
                spotlight.head.rotation.x = tiltAngle;
            }
            
            // Update light direction
            const direction = new BABYLON.Vector3(
                Math.sin(panAngle) * Math.sin(tiltAngle),
                -Math.cos(tiltAngle),
                Math.cos(panAngle) * Math.sin(tiltAngle)
            );
            spotlight.light.direction = direction;
            
            // Update beam
            this._updateBeam(spotlight, direction, intensity);
            
            // Update floor pool position
            this._updateFloorPool(spotlight, direction);
            
            // Update fixture glow
            this._updateFixtureGlow(spotlight, intensity);
        });
    }

    /**
     * Update static spotlight position
     */
    _updateStatic() {
        this.spotlights.forEach(spotlight => {
            spotlight.light.setEnabled(true);
            spotlight.beam.setEnabled(true);
            spotlight.lightPool.setEnabled(true);
            spotlight.lightPoolGlow.setEnabled(true);
            
            const direction = new BABYLON.Vector3(0, -1, 0);
            spotlight.light.direction = direction;
            
            this._updateBeam(spotlight, direction, 1.0);
            this._updateFloorPool(spotlight, direction);
            this._updateFixtureGlow(spotlight, 1.0);
        });
    }

    /**
     * Update static with strobe effect
     */
    _updateStaticWithStrobe(time, speedMultiplier) {
        const strobeSpeed = 8 * speedMultiplier;
        
        this.spotlights.forEach((spotlight, i) => {
            const intensity = Math.sin(time * strobeSpeed + i * 0.5) > 0.7 ? 1.0 : 0.3;
            
            spotlight.light.setEnabled(true);
            spotlight.beam.setEnabled(true);
            spotlight.lightPool.setEnabled(true);
            spotlight.lightPoolGlow.setEnabled(true);
            
            const direction = new BABYLON.Vector3(0, -1, 0);
            spotlight.light.direction = direction;
            
            this._updateBeam(spotlight, direction, intensity);
            this._updateFloorPool(spotlight, direction);
            this._updateFixtureGlow(spotlight, intensity);
        });
    }

    /**
     * Update beam visual
     */
    _updateBeam(spotlight, direction, intensity) {
        const beamLength = 7.3; // Height to floor
        
        if (!spotlight.head) {
            // Non-parented beam - position manually
            const midY = spotlight.basePos.y - beamLength / 2;
            spotlight.beam.position.y = midY;
            spotlight.beam.scaling.y = beamLength;
            
            // Rotate beam to match direction
            spotlight.beam.lookAt(spotlight.beam.position.add(direction.scale(10)));
            spotlight.beam.rotation.x += Math.PI / 2;
        } else {
            // Parented beam - just scale
            spotlight.beam.scaling.y = beamLength;
        }
        
        // Update beam visibility based on intensity (binary on/off for strobe)
        const beamVisible = intensity > 0.5;
        spotlight.beam.visibility = beamVisible ? 1.0 : 0;
        spotlight.beamMat.alpha = beamVisible ? 0.08 : 0;
        
        // Also update floor pool visibility
        spotlight.lightPool.visibility = beamVisible ? 1.0 : 0;
        spotlight.lightPoolGlow.visibility = beamVisible ? 0.8 : 0;
    }

    /**
     * Update floor light pool position
     */
    _updateFloorPool(spotlight, direction) {
        // Calculate where beam hits floor
        const originY = spotlight.basePos.y;
        const t = originY / Math.abs(direction.y);
        
        const hitX = spotlight.basePos.x + direction.x * t;
        const hitZ = spotlight.basePos.z + direction.z * t;
        
        spotlight.lightPool.position.x = hitX;
        spotlight.lightPool.position.z = hitZ;
        spotlight.lightPoolGlow.position.x = hitX;
        spotlight.lightPoolGlow.position.z = hitZ;
        
        // Scale pool based on beam spread at floor
        const beamAngle = Math.PI / 6; // Match spotlight cone
        const poolRadius = Math.tan(beamAngle / 2) * t;
        const scale = Math.max(1, poolRadius * 2);
        
        spotlight.lightPool.scaling.x = scale;
        spotlight.lightPool.scaling.y = scale;
        spotlight.lightPoolGlow.scaling.x = scale * 1.3;
        spotlight.lightPoolGlow.scaling.y = scale * 1.3;
    }

    /**
     * Update fixture glow (lens, source, flare) - Synced with beam intensity and color
     */
    _updateFixtureGlow(spotlight, intensity) {
        // Use per-spotlight color if available, otherwise global color
        const spotColor = spotlight.color || this.currentSpotColor;
        
        if (spotlight.lensMat) {
            if (intensity > 0.5) {
                spotlight.lensMat.emissiveColor = spotColor.scale(3.0 + intensity);
            } else {
                // Turn off when strobe is off
                spotlight.lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            }
        }
        if (spotlight.sourceMat) {
            if (intensity > 0.5) {
                spotlight.sourceMat.emissiveColor = spotColor.scale(5.0 + intensity * 2);
            } else {
                spotlight.sourceMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            }
        }
        if (spotlight.flareMat) {
            if (intensity > 0.5) {
                spotlight.flareMat.emissiveColor = spotColor.scale(2.0);
                spotlight.flareMat.alpha = 0.3 * intensity;
            } else {
                spotlight.flareMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                spotlight.flareMat.alpha = 0;
            }
        }
    }

    /**
     * Update all spotlight colors
     */
    _updateColors() {
        this.spotlights.forEach(spotlight => {
            // Update per-spotlight color for fixture glow sync
            spotlight.color = this.currentSpotColor;
            
            spotlight.beamMat.emissiveColor = this.currentSpotColor;
            spotlight.poolMat.emissiveColor = this.currentSpotColor;
            spotlight.poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.8);
            spotlight.light.specular = this.currentSpotColor;
        });
    }

    /**
     * Disable all spotlights
     */
    _disableSpotlights() {
        this.spotlights.forEach(spotlight => {
            spotlight.light.setEnabled(false);
            spotlight.beam.setEnabled(false);
            spotlight.lightPool.setEnabled(false);
            spotlight.lightPoolGlow.setEnabled(false);
            
            if (spotlight.lensMat) spotlight.lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            if (spotlight.sourceMat) spotlight.sourceMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            if (spotlight.flareMat) spotlight.flareMat.alpha = 0;
        });
    }

    /**
     * Set spotlight active state
     */
    setActive(active) {
        this.lightsActive = active;
    }

    /**
     * Set spotlight speed
     */
    setSpeed(speed) {
        this.spotlightSpeed = speed;
    }

    /**
     * Set spotlight mode
     */
    setMode(mode) {
        this.spotlightMode = mode;
    }

    /**
     * Set spotlight pattern
     */
    setPattern(pattern) {
        this.spotlightPattern = pattern;
    }

    /**
     * Cycle to next color
     */
    nextColor() {
        this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
        this.currentSpotColor = this.spotColorList[this.spotColorIndex];
    }

    /**
     * Set specific color index
     */
    setColorIndex(index) {
        this.spotColorIndex = index % this.spotColorList.length;
        this.currentSpotColor = this.spotColorList[this.spotColorIndex];
    }

    /**
     * Get current color
     */
    getCurrentColor() {
        return this.currentSpotColor;
    }

    /**
     * Dispose all spotlight resources
     */
    dispose() {
        this.spotlights.forEach(spotlight => {
            spotlight.light.dispose();
            spotlight.beam.dispose();
            spotlight.lightPool.dispose();
            spotlight.lightPoolGlow.dispose();
        });
        
        this.spotlights = [];
        this.log.info?.('🗑️ Spotlight system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpotlightSystem;
}
