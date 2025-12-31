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
        
        // Gobo filter settings
        this.goboEnabled = false;
        this.goboPatternIndex = 0;
        this.goboRotationSpeed = 1.0;  // Rotation speed multiplier
        this.goboRotation = 0;          // Current rotation angle in radians
        this.goboTextures = [];         // Cache for gobo textures
        this.goboPatterns = [
            'circle',      // 0 - Simple spotlight (no pattern)
            'star',        // 1 - 6-pointed star
            'triangles',   // 2 - Triangle breakup
            'squares',     // 3 - Grid/checkerboard
            'rings',       // 4 - Concentric rings
            'spiral',      // 5 - Spiral pattern
            'dots',        // 6 - Dotted pattern
            'slats',       // 7 - Venetian blind slats
            'cross',       // 8 - Cross/plus shape
            'flower'       // 9 - Flower/petal pattern
        ];
        
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
        
        // Create gobo projection disc (pattern on floor)
        const goboProjection = BABYLON.MeshBuilder.CreateDisc("goboProjection" + index, {
            radius: 0.5,
            tessellation: 64
        }, this.scene);
        goboProjection.rotation.x = Math.PI / 2;
        goboProjection.position = new BABYLON.Vector3(pos.x, 0.04, pos.z - 5);
        goboProjection.isPickable = false;
        
        const goboMat = new BABYLON.StandardMaterial("goboMat" + index, this.scene);
        goboMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        goboMat.specularColor = new BABYLON.Color3(0, 0, 0);
        goboMat.emissiveColor = this.currentSpotColor.clone();
        goboMat.alpha = 0.85;
        goboMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        goboMat.disableLighting = true;
        goboMat.backFaceCulling = false;
        goboProjection.material = goboMat;
        goboProjection.renderingGroupId = 1;
        goboProjection.setEnabled(false); // Hidden by default until gobo enabled
        
        return {
            light: spot,
            beam: beam,
            beamMat: beamMat,
            lightPool: lightPool,
            poolMat: poolMat,
            lightPoolGlow: lightPoolGlow,
            poolGlowMat: poolGlowMat,
            goboProjection: goboProjection,
            goboMat: goboMat,
            goboRotation: index * (Math.PI / 3), // Offset each spotlight's gobo rotation
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
        
        // Update gobo rotation (continuous 360° spin)
        if (this.goboEnabled) {
            this.goboRotation += 0.02 * this.goboRotationSpeed;
            if (this.goboRotation > Math.PI * 2) {
                this.goboRotation -= Math.PI * 2;
            }
            this._updateGoboProjections(time);
        }
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
        // Calculate actual beam length to reach floor based on direction angle
        // beamLength = height / cos(angle) where angle is from vertical
        const originY = spotlight.basePos.y;
        const verticalComponent = Math.abs(direction.y);
        
        // Prevent division by zero when beam is horizontal
        // ADDED: Extra length to ensure beam penetrates floor at steep angles
        // The flat end of the cylinder beam needs to extend past the floor plane
        const baseLength = verticalComponent > 0.1 ? originY / verticalComponent : 15;
        const extraLength = 2.0 + (1.0 / (verticalComponent + 0.05)); // Dynamic extension
        const beamLength = baseLength + extraLength;
        
        if (!spotlight.head) {
            // Non-parented beam - position manually
            const midY = originY - beamLength / 2;
            spotlight.beam.position.y = midY;
            spotlight.beam.scaling.y = beamLength;
            
            // Rotate beam to match direction
            spotlight.beam.lookAt(spotlight.beam.position.add(direction.scale(10)));
            spotlight.beam.rotation.x += Math.PI / 2;
        } else {
            // Parented beam - scale to reach floor
            spotlight.beam.scaling.y = beamLength;
            // Position beam center so it extends from lens to floor
            spotlight.beam.position.y = -0.28 - (beamLength * 0.5);
        }
        
        // Update beam visibility based on intensity (binary on/off for strobe)
        const beamVisible = intensity > 0.5;
        spotlight.beam.visibility = beamVisible ? 1.0 : 0;
        spotlight.beamMat.alpha = beamVisible ? 0.08 : 0;
        
        // Also update floor pool visibility
        spotlight.lightPool.visibility = beamVisible ? 1.0 : 0;
        spotlight.lightPoolGlow.visibility = beamVisible ? 0.8 : 0;
        
        // Update beam color to match spotlight color
        const spotColor = spotlight.color || this.currentSpotColor;
        spotlight.beamMat.emissiveColor = spotColor.scale(2.0);
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
            if (spotlight.goboProjection) spotlight.goboProjection.setEnabled(false);
            
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

    // ========== GOBO FILTER METHODS ==========

    /**
     * Enable/disable gobo filters
     */
    setGoboEnabled(enabled) {
        this.goboEnabled = enabled;
        
        this.spotlights.forEach(spotlight => {
            if (enabled) {
                // Hide regular light pool, show gobo projection
                spotlight.lightPool.setEnabled(false);
                spotlight.lightPoolGlow.setEnabled(false);
                spotlight.goboProjection.setEnabled(this.lightsActive);
                this._applyGoboTexture(spotlight);
            } else {
                // Show regular light pool, hide gobo projection
                spotlight.lightPool.setEnabled(this.lightsActive);
                spotlight.lightPoolGlow.setEnabled(this.lightsActive);
                spotlight.goboProjection.setEnabled(false);
            }
        });
        
        this.log.info?.(`🎭 Gobo filters ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Toggle gobo filters on/off
     */
    toggleGobo() {
        this.setGoboEnabled(!this.goboEnabled);
        return this.goboEnabled;
    }

    /**
     * Set gobo rotation speed (can be negative for reverse)
     */
    setGoboRotationSpeed(speed) {
        this.goboRotationSpeed = speed;
    }

    /**
     * Cycle to next gobo pattern
     */
    nextGoboPattern() {
        this.goboPatternIndex = (this.goboPatternIndex + 1) % this.goboPatterns.length;
        this._regenerateGoboTextures();
        this.log.info?.(`🎭 Gobo pattern: ${this.goboPatterns[this.goboPatternIndex]}`);
        return this.goboPatterns[this.goboPatternIndex];
    }

    /**
     * Set specific gobo pattern by index or name
     */
    setGoboPattern(pattern) {
        if (typeof pattern === 'string') {
            const idx = this.goboPatterns.indexOf(pattern);
            if (idx >= 0) {
                this.goboPatternIndex = idx;
            }
        } else {
            this.goboPatternIndex = pattern % this.goboPatterns.length;
        }
        this._regenerateGoboTextures();
    }

    /**
     * Get current gobo pattern name
     */
    getGoboPattern() {
        return this.goboPatterns[this.goboPatternIndex];
    }

    /**
     * Regenerate gobo textures for all spotlights
     */
    _regenerateGoboTextures() {
        this.spotlights.forEach(spotlight => {
            this._applyGoboTexture(spotlight);
        });
    }

    /**
     * Apply gobo texture to a spotlight's projection
     */
    _applyGoboTexture(spotlight) {
        const patternName = this.goboPatterns[this.goboPatternIndex];
        const texture = this._createGoboTexture(patternName, spotlight.index);
        
        if (texture) {
            // Dispose old texture if exists
            if (spotlight.goboMat.emissiveTexture) {
                spotlight.goboMat.emissiveTexture.dispose();
            }
            spotlight.goboMat.emissiveTexture = texture;
            spotlight.goboMat.emissiveColor = spotlight.color || this.currentSpotColor;
        } else {
            // No pattern (solid circle)
            if (spotlight.goboMat.emissiveTexture) {
                spotlight.goboMat.emissiveTexture.dispose();
                spotlight.goboMat.emissiveTexture = null;
            }
        }
    }

    /**
     * Create procedural gobo texture
     */
    _createGoboTexture(patternName, index) {
        if (patternName === 'circle') {
            return null; // No texture needed for plain circle
        }
        
        const size = 256;
        const texture = new BABYLON.DynamicTexture("goboTex" + index + "_" + patternName, size, this.scene, true);
        const ctx = texture.getContext();
        
        // Clear with transparent black
        ctx.clearRect(0, 0, size, size);
        
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 10;
        
        // Draw circular mask first
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw pattern in white (will be tinted by emissive color)
        ctx.fillStyle = 'white';
        
        switch (patternName) {
            case 'star':
                this._drawStar(ctx, cx, cy, radius * 0.9, 6);
                break;
            case 'triangles':
                this._drawTriangles(ctx, cx, cy, radius);
                break;
            case 'squares':
                this._drawSquares(ctx, cx, cy, radius);
                break;
            case 'rings':
                this._drawRings(ctx, cx, cy, radius);
                break;
            case 'spiral':
                this._drawSpiral(ctx, cx, cy, radius);
                break;
            case 'dots':
                this._drawDots(ctx, cx, cy, radius);
                break;
            case 'slats':
                this._drawSlats(ctx, cx, cy, radius);
                break;
            case 'cross':
                this._drawCross(ctx, cx, cy, radius);
                break;
            case 'flower':
                this._drawFlower(ctx, cx, cy, radius);
                break;
        }
        
        ctx.restore();
        texture.update();
        
        texture.hasAlpha = true;
        texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        
        return texture;
    }

    // ========== GOBO PATTERN DRAWING FUNCTIONS ==========

    _drawStar(ctx, cx, cy, radius, points) {
        const innerRadius = radius * 0.4;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? radius : innerRadius;
            const angle = (i * Math.PI / points) - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    _drawTriangles(ctx, cx, cy, radius) {
        // Multiple triangles in a breakup pattern
        const triangleSize = radius * 0.4;
        const positions = [
            [0, -0.5], [-0.4, 0.3], [0.4, 0.3],
            [-0.3, -0.2], [0.3, -0.2], [0, 0.4]
        ];
        
        positions.forEach(([ox, oy]) => {
            const x = cx + ox * radius;
            const y = cy + oy * radius;
            ctx.beginPath();
            ctx.moveTo(x, y - triangleSize * 0.5);
            ctx.lineTo(x - triangleSize * 0.4, y + triangleSize * 0.3);
            ctx.lineTo(x + triangleSize * 0.4, y + triangleSize * 0.3);
            ctx.closePath();
            ctx.fill();
        });
    }

    _drawSquares(ctx, cx, cy, radius) {
        // Checkerboard pattern
        const gridSize = 5;
        const cellSize = (radius * 2) / gridSize;
        const startX = cx - radius;
        const startY = cy - radius;
        
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                if ((row + col) % 2 === 0) {
                    ctx.fillRect(
                        startX + col * cellSize + 2,
                        startY + row * cellSize + 2,
                        cellSize - 4,
                        cellSize - 4
                    );
                }
            }
        }
    }

    _drawRings(ctx, cx, cy, radius) {
        // Concentric rings
        const ringCount = 4;
        const ringWidth = radius / (ringCount * 2);
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = ringWidth;
        
        for (let i = 1; i <= ringCount; i++) {
            ctx.beginPath();
            ctx.arc(cx, cy, i * (radius / ringCount) - ringWidth / 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    _drawSpiral(ctx, cx, cy, radius) {
        // Spiral arms
        const arms = 4;
        const rotations = 1.5;
        
        ctx.strokeStyle = 'white';
        ctx.lineWidth = radius * 0.15;
        ctx.lineCap = 'round';
        
        for (let arm = 0; arm < arms; arm++) {
            const startAngle = (arm * Math.PI * 2) / arms;
            ctx.beginPath();
            for (let t = 0; t <= 1; t += 0.01) {
                const angle = startAngle + t * Math.PI * 2 * rotations;
                const r = t * radius;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }

    _drawDots(ctx, cx, cy, radius) {
        // Scattered dots
        const dotRadius = radius * 0.08;
        const rings = 3;
        
        for (let ring = 1; ring <= rings; ring++) {
            const ringRadius = (ring / rings) * radius * 0.85;
            const dotCount = ring * 6;
            for (let i = 0; i < dotCount; i++) {
                const angle = (i / dotCount) * Math.PI * 2;
                const x = cx + ringRadius * Math.cos(angle);
                const y = cy + ringRadius * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawSlats(ctx, cx, cy, radius) {
        // Venetian blind slats
        const slatCount = 7;
        const slatHeight = radius * 0.12;
        const gap = (radius * 2) / (slatCount + 1);
        const startY = cy - radius;
        
        for (let i = 1; i <= slatCount; i++) {
            const y = startY + i * gap;
            ctx.fillRect(cx - radius, y - slatHeight / 2, radius * 2, slatHeight);
        }
    }

    _drawCross(ctx, cx, cy, radius) {
        // Bold cross/plus shape
        const armWidth = radius * 0.35;
        const armLength = radius * 0.9;
        
        // Vertical bar
        ctx.fillRect(cx - armWidth / 2, cy - armLength, armWidth, armLength * 2);
        // Horizontal bar
        ctx.fillRect(cx - armLength, cy - armWidth / 2, armLength * 2, armWidth);
    }

    _drawFlower(ctx, cx, cy, radius) {
        // Flower/petal pattern
        const petalCount = 8;
        const petalLength = radius * 0.7;
        const petalWidth = radius * 0.35;
        
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            
            ctx.beginPath();
            ctx.ellipse(0, -petalLength / 2, petalWidth / 2, petalLength / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        }
        
        // Center circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Update gobo projections (rotation, position, color)
     */
    _updateGoboProjections(time) {
        this.spotlights.forEach((spotlight, i) => {
            if (!spotlight.goboProjection) return;
            
            const isVisible = this.lightsActive && this.goboEnabled;
            spotlight.goboProjection.setEnabled(isVisible);
            
            if (!isVisible) return;
            
            // Apply 360° rotation - each spotlight has offset phase for variety
            const rotationOffset = spotlight.goboRotation || 0;
            spotlight.goboProjection.rotation.z = this.goboRotation + rotationOffset;
            
            // Sync position with light pool
            spotlight.goboProjection.position.x = spotlight.lightPool.position.x;
            spotlight.goboProjection.position.z = spotlight.lightPool.position.z;
            
            // Sync scale with light pool
            spotlight.goboProjection.scaling.x = spotlight.lightPool.scaling.x * 1.1;
            spotlight.goboProjection.scaling.y = spotlight.lightPool.scaling.y * 1.1;
            
            // Update color to match spotlight
            const spotColor = spotlight.color || this.currentSpotColor;
            spotlight.goboMat.emissiveColor = spotColor;
            
            // Apply strobe visibility if active
            const intensity = spotlight.beam.visibility;
            spotlight.goboProjection.visibility = intensity > 0.5 ? 1.0 : 0;
        });
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
            if (spotlight.goboProjection) {
                if (spotlight.goboMat.emissiveTexture) {
                    spotlight.goboMat.emissiveTexture.dispose();
                }
                spotlight.goboProjection.dispose();
            }
        });
        
        // Dispose cached gobo textures
        this.goboTextures.forEach(tex => tex.dispose());
        this.goboTextures = [];
        
        this.spotlights = [];
        this.log.info?.('🗑️ Spotlight system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SpotlightSystem;
}
