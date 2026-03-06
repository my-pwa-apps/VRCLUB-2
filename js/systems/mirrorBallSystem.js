// Mirror Ball System - Disco ball with reflection spots for VR Club
// Handles mirror ball creation, rotation, and reflection spot raycasting

class MirrorBallSystem {
    constructor(scene, materialFactory, options = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = options.logger || console;
        this.maxLights = options.maxLights || 4;
        
        // Mirror ball state
        this.mirrorBallActive = false;
        this.mirrorBallSpeed = 1.0;
        this.mirrorBallRotation = 0;
        
        // Mirror ball meshes
        this.mirrorBall = null;
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        this.mirrorReflectionSpots = [];
        
        // Color management
        this.mirrorBallColorIndex = 0;
        this.mirrorBallSpotlightColor = new BABYLON.Color3(1, 0, 1); // Start magenta
        this.mirrorBallColors = [
            new BABYLON.Color3(1, 0.3, 1),      // Magenta
            new BABYLON.Color3(0.3, 1, 1),      // Cyan
            new BABYLON.Color3(1, 1, 0.3),      // Yellow
            new BABYLON.Color3(1, 0.3, 0.3),    // Red
            new BABYLON.Color3(0.3, 0.3, 1),    // Blue
            new BABYLON.Color3(0.3, 1, 0.3),    // Green
            new BABYLON.Color3(1, 0.6, 0.3),    // Orange
            new BABYLON.Color3(0.7, 0.3, 1),    // Purple
            new BABYLON.Color3(1, 1, 1)         // White
        ];
        
        // Cached colors for performance
        this.cachedColors = {
            black: new BABYLON.Color3(0, 0, 0)
        };
        this.mirrorBallCachedColors = null;
        
        // Raycast optimization
        this.mirrorBallRay = null;
        this.mirrorBallRayPredicate = null;
        this.spotUpdateFrameCounter = 0;
        
        // Animation
        this.frameCounter = 0;
        this.vjManualMode = false;
        
        // Glow layer reference
        this.glowLayer = null;
    }

    /**
     * Set glow layer reference for bloom effects
     */
    setGlowLayer(glowLayer) {
        this.glowLayer = glowLayer;
    }

    /**
     * Create the mirror ball with spotlights and reflection spots
     */
    createMirrorBall() {
        const ballPosition = new BABYLON.Vector3(0, 3.5, -12);
        const trussPosition = new BABYLON.Vector3(0, 8, -12);
        
        // Mirror ball sphere
        this.mirrorBall = BABYLON.MeshBuilder.CreateSphere("mirrorBall", {
            diameter: 1.2,
            segments: 32
        }, this.scene);
        this.mirrorBall.position = ballPosition;
        
        // Mirror ball material
        const mirrorBallMat = this.materialFactory.createPBRMaterial("mirrorBallMat", {
            baseColor: [0.9, 0.9, 0.9],
            metallic: 1.0,
            roughness: 0.05,
            emissiveColor: [0.3, 0.3, 0.3]
        });
        this.mirrorBall.material = mirrorBallMat;
        
        // Suspension chain
        const chain = BABYLON.MeshBuilder.CreateCylinder("mirrorBallChain", {
            diameter: 0.03,
            height: 1.5,
            tessellation: 8
        }, this.scene);
        chain.position = BABYLON.Vector3.Center(ballPosition, trussPosition);
        chain.material = this.materialFactory.createPBRMaterial("chainMat", {
            baseColor: [0.3, 0.3, 0.3],
            metallic: 1.0,
            roughness: 0.4
        });
        
        // Motor housing
        const motorHousing = BABYLON.MeshBuilder.CreateCylinder("motorHousing", {
            diameter: 0.25,
            height: 0.15,
            tessellation: 16
        }, this.scene);
        motorHousing.position = new BABYLON.Vector3(0, 4.2, -12);
        motorHousing.material = chain.material;
        
        // Create spotlights pointing at ball
        this._createMirrorBallSpotlights(ballPosition);
        
        // Create reflection spots
        this._createReflectionSpots(ballPosition);
        
        // Setup raycast predicate and ray
        this._setupRaycasting(ballPosition);
        
        this.log.info?.('✅ Mirror ball created with ' + this.mirrorReflectionSpots.length + ' reflection spots');
    }

    /**
     * Create spotlights that illuminate the mirror ball
     */
    _createMirrorBallSpotlights(ballPosition) {
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        
        const spotlightConfigs = [
            { pos: new BABYLON.Vector3(-4, 3.5, -8), name: "mirrorSpot1" },
            { pos: new BABYLON.Vector3(4, 3.5, -8), name: "mirrorSpot2" },
            { pos: new BABYLON.Vector3(0, 3.5, -16), name: "mirrorSpot3" }
        ];
        
        spotlightConfigs.forEach((config, index) => {
            // Create housing fixture
            const housing = this._createSpotlightFixture(config, index, ballPosition);
            this.mirrorBallHousings.push(housing);
            
            // Create volumetric beam
            const beam = this._createVolumetricBeam(config, index, ballPosition);
            this.mirrorBallBeams.push(beam);
            
            // No actual spotlight - using emissive meshes only
            this.mirrorBallSpotlights.push(null);
        });
    }

    /**
     * Create spotlight fixture housing
     */
    _createSpotlightFixture(config, index, ballPosition) {
        // Fixture body
        const fixture = BABYLON.MeshBuilder.CreateBox("mirrorSpotFixture" + index, {
            width: 0.2, height: 0.15, depth: 0.25
        }, this.scene);
        fixture.position = config.pos;
        fixture.lookAt(ballPosition);
        
        const fixtureMat = this.materialFactory.createPBRMaterial("mirrorFixtureMat" + index, {
            baseColor: [0.1, 0.1, 0.1],
            metallic: 0.9,
            roughness: 0.3
        });
        fixture.material = fixtureMat;
        
        // Lens
        const direction = ballPosition.subtract(config.pos).normalize();
        const lens = BABYLON.MeshBuilder.CreateCylinder("mirrorSpotLens" + index, {
            diameter: 0.12,
            height: 0.05,
            tessellation: 16
        }, this.scene);
        lens.position = config.pos.add(direction.scale(0.13));
        lens.lookAt(ballPosition);
        lens.rotation.x += Math.PI / 2;
        
        const lensMat = new BABYLON.StandardMaterial("mirrorLensMat" + index, this.scene);
        
        lensMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        lensMat.emissiveColor = this.mirrorBallSpotlightColor.scale(5.0);
        lensMat.alpha = 0.9;
        lensMat.disableLighting = true;
        lens.material = lensMat;
        
        // Light source (bright center)
        const lightSource = BABYLON.MeshBuilder.CreateDisc("mirrorSpotSource" + index, {
            radius: 0.04,
            tessellation: 16
        }, this.scene);
        lightSource.position = lens.position.add(direction.scale(0.02));
        lightSource.lookAt(ballPosition);
        
        const sourceMat = new BABYLON.StandardMaterial("mirrorSourceMat" + index, this.scene);
        
        sourceMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        sourceMat.emissiveColor = this.mirrorBallSpotlightColor.scale(8.0);
        sourceMat.disableLighting = true;
        lightSource.material = sourceMat;
        
        // Lens flare
        const flare = BABYLON.MeshBuilder.CreatePlane("mirrorSpotFlare" + index, {
            size: 0.5
        }, this.scene);
        flare.position = lens.position.add(direction.scale(0.05));
        flare.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        
        const flareMat = new BABYLON.StandardMaterial("mirrorFlareMat" + index, this.scene);
        
        flareMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        flareMat.emissiveColor = this.mirrorBallSpotlightColor.scale(3.0);
        flareMat.alpha = 0.4;
        flareMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        flareMat.disableLighting = true;
        flare.material = flareMat;
        
        if (this.glowLayer) {
            this.glowLayer.addIncludedOnlyMesh(lens);
            this.glowLayer.addIncludedOnlyMesh(lightSource);
            this.glowLayer.addIncludedOnlyMesh(flare);
        }
        
        return {
            fixture: fixture,
            material: fixtureMat,
            lens: lens,
            lensMaterial: lensMat,
            lightSource: lightSource,
            sourceMaterial: sourceMat,
            flare: flare,
            flareMaterial: flareMat
        };
    }

    /**
     * Create volumetric beam from spotlight to ball
     */
    _createVolumetricBeam(config, index, ballPosition) {
        const direction = ballPosition.subtract(config.pos).normalize();
        const distance = BABYLON.Vector3.Distance(config.pos, ballPosition);
        
        const beam = BABYLON.MeshBuilder.CreateCylinder("mirrorSpotBeam" + index, {
            diameterTop: 0.8,
            diameterBottom: 0.15,
            height: distance,
            tessellation: 16,
            cap: BABYLON.Mesh.NO_CAP
        }, this.scene);
        
        const beamMidpoint = BABYLON.Vector3.Center(config.pos, ballPosition);
        beam.position = beamMidpoint;
        
        const beamRotationAxis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), direction);
        const beamRotationAngle = Math.acos(BABYLON.Vector3.Dot(BABYLON.Vector3.Up(), direction));
        beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(beamRotationAxis, beamRotationAngle);
        
        const beamMat = new BABYLON.StandardMaterial("mirrorBeamMat" + index, this.scene);
        
        beamMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        beamMat.emissiveColor = this.mirrorBallSpotlightColor.scale(0.6);
        beamMat.alpha = 0.15;
        beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        beamMat.backFaceCulling = false;
        beamMat.disableLighting = true;
        
        beam.material = beamMat;
        beam.isPickable = false;
        beam.visibility = 1.0;
        beam.renderingGroupId = 1;
        beam.setEnabled(false);
        
        return { mesh: beam, material: beamMat };
    }

    /**
     * Create reflection spots distributed across room surfaces
     */
    _createReflectionSpots(ballPosition) {
        this.mirrorReflectionSpots = [];
        const numSpots = 250;
        const spotsPerSurface = Math.floor(numSpots / 6);
        let spotIndex = 0;
        
        const surfaces = [
            { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02 },
            { name: 'ceiling', axis: 'xz', fixed: 'y', value: 4.33 },
            { name: 'leftWall', axis: 'yz', fixed: 'x', value: -16.73 },
            { name: 'rightWall', axis: 'yz', fixed: 'x', value: 16.73 },
            { name: 'backWall', axis: 'xy', fixed: 'z', value: -26.73 },
            { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.77 }
        ];
        
        surfaces.forEach(surface => {
            for (let i = 0; i < spotsPerSurface && spotIndex < numSpots; i++, spotIndex++) {
                const spot = this._createReflectionSpot(spotIndex, surface, ballPosition);
                this.mirrorReflectionSpots.push(spot);
            }
        });
    }

    /**
     * Create a single reflection spot
     */
    _createReflectionSpot(index, surface, ballPos) {
        // Visual disc
        const visual = BABYLON.MeshBuilder.CreateDisc(`mirrorSpot${index}`, {
            radius: 0.15 + Math.random() * 0.1,
            tessellation: 8
        }, this.scene);
        
        const spotMat = new BABYLON.StandardMaterial(`mirrorSpotMat${index}`, this.scene);
        
        spotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        spotMat.specularColor = new BABYLON.Color3(0, 0, 0);
        spotMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
        spotMat.alpha = 0.85;
        spotMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        spotMat.disableLighting = true;
        spotMat.backFaceCulling = false;
        visual.material = spotMat;
        visual.isPickable = false;
        visual.setEnabled(false);
        
        // Volumetric beam
        const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorBeam${index}`, {
            diameterTop: 0.02,
            diameterBottom: 0.2,
            height: 1.0,
            tessellation: 4
        }, this.scene);
        beam.setPivotPoint(new BABYLON.Vector3(0, 0.5, 0));
        
        const beamMat = new BABYLON.StandardMaterial(`mirrorBeamMat${index}`, this.scene);
        
        beamMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
        beamMat.alpha = 0.15;
        beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        beamMat.disableLighting = true;
        beamMat.backFaceCulling = false;
        beam.material = beamMat;
        beam.isPickable = false;
        beam.setEnabled(false);
        
        // Generate target position on surface
        let targetPos, normal;
        
        if (surface.axis === 'xz') {
            targetPos = new BABYLON.Vector3(
                -17 + Math.random() * 34,
                surface.value,
                -27 + Math.random() * 29
            );
            normal = surface.name === 'floor' ? 
                new BABYLON.Vector3(0, 1, 0) : 
                new BABYLON.Vector3(0, -1, 0);
        } else if (surface.axis === 'yz') {
            targetPos = new BABYLON.Vector3(
                surface.value,
                0.2 + Math.random() * 4.1,
                -27 + Math.random() * 29
            );
            normal = surface.name === 'leftWall' ? 
                new BABYLON.Vector3(1, 0, 0) : 
                new BABYLON.Vector3(-1, 0, 0);
        } else {
            targetPos = new BABYLON.Vector3(
                -17 + Math.random() * 34,
                0.2 + Math.random() * 4.1,
                surface.value
            );
            normal = surface.name === 'backWall' ? 
                new BABYLON.Vector3(0, 0, 1) : 
                new BABYLON.Vector3(0, 0, -1);
        }
        
        visual.position = targetPos;
        
        // Calculate spherical coordinates for rotation
        const directionFromBall = targetPos.subtract(ballPos).normalize();
        const distance = BABYLON.Vector3.Distance(targetPos, ballPos);
        const theta = Math.atan2(directionFromBall.z, directionFromBall.x);
        const phi = Math.acos(directionFromBall.y);
        
        return {
            visual: visual,
            beam: beam,
            material: spotMat,
            beamMaterial: beamMat,
            surface: surface.name,
            surfaceNormal: normal,
            targetPosition: targetPos.clone(),
            theta: theta,
            phi: phi,
            distance: distance,
            baseIntensity: 0.5 + Math.random() * 0.7,
            twinkleSpeed: 2 + Math.random() * 4,
            twinklePhase: Math.random() * Math.PI * 2,
            previousPosition: targetPos.clone(),
            previousHitMesh: null,
            isVisible: false
        };
    }

    /**
     * Setup raycast predicate and cached ray
     */
    _setupRaycasting(ballPosition) {
        this.mirrorBallRayPredicate = (mesh) => {
            if (!mesh.isPickable || !mesh.isEnabled()) return false;
            if (mesh.name.includes('mirrorBall')) return false;
            if (mesh.name.includes('spot') || mesh.name.includes('Spot')) return false;
            if (mesh.name.includes('housing') || mesh.name.includes('lens')) return false;
            if (mesh.name.includes('beam') || mesh.name.includes('Beam')) return false;
            if (mesh.name.includes('collision') || mesh.name.includes('Collision')) return false;
            if (mesh.name.includes('trigger') || mesh.name.includes('Trigger')) return false;
            return true;
        };
        
        this.mirrorBallRay = new BABYLON.Ray(ballPosition, new BABYLON.Vector3(0, 0, 1), 30);
    }

    /**
     * Update mirror ball animations each frame
     */
    update(time) {
        this.frameCounter++;
        
        if (!this.mirrorBallActive) {
            this._disableMirrorBall();
            return;
        }
        
        // Enable spotlights and beams
        this._enableFixtures();
        
        // Rotate mirror ball
        const speedMultiplier = this.mirrorBallSpeed || 1.0;
        this.mirrorBallRotation -= 0.003 * speedMultiplier;
        this.mirrorBall.rotation.y = this.mirrorBallRotation;
        
        // Color cycling (every 3 seconds)
        if (!this.vjManualMode && this.frameCounter % 180 === 0) {
            this.nextColor();
        }
        
        // Update reflection spots (every 3rd frame for performance)
        this.spotUpdateFrameCounter++;
        if (this.spotUpdateFrameCounter % 3 === 0) {
            this._updateReflectionSpots(time);
        }
        
        // Update spot visibility
        this._updateSpotVisibility();
    }

    /**
     * Enable mirror ball fixtures
     */
    _enableFixtures() {
        // Update cached colors
        if (!this.mirrorBallCachedColors) {
            this._updateCachedColors();
        }
        
        this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(true));
        
        this.mirrorBallHousings.forEach(housing => {
            housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
            housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
            housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
            housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
        });
    }

    /**
     * Update cached color values
     */
    _updateCachedColors() {
        this.mirrorBallCachedColors = {
            housingGlow: this.mirrorBallSpotlightColor.scale(0.2),
            lensBright: this.mirrorBallSpotlightColor.scale(5.0),
            sourceVeryBright: this.mirrorBallSpotlightColor.scale(8.0),
            flareMedium: this.mirrorBallSpotlightColor.scale(3.0)
        };
    }

    /**
     * Update reflection spot positions via raycasting
     */
    _updateReflectionSpots(time) {
        const ballPos = this.mirrorBall.position;
        
        for (let i = 0; i < this.mirrorReflectionSpots.length; i++) {
            const spot = this.mirrorReflectionSpots[i];
            spot.visual.setEnabled(true);
            
            // Calculate ray direction based on ball rotation
            const rotatedTheta = spot.theta - this.mirrorBallRotation;
            const cosTheta = Math.cos(rotatedTheta);
            const sinTheta = Math.sin(rotatedTheta);
            const sinPhi = Math.sin(spot.phi);
            
            const dirX = sinPhi * cosTheta;
            const dirY = Math.cos(spot.phi);
            const dirZ = sinPhi * sinTheta;
            
            // Raycast
            this.mirrorBallRay.origin.copyFrom(ballPos);
            this.mirrorBallRay.direction.set(dirX, dirY, dirZ);
            this.mirrorBallRay.length = 30;
            
            const pickResult = this.scene.pickWithRay(this.mirrorBallRay, this.mirrorBallRayPredicate);
            
            if (pickResult.hit && pickResult.pickedPoint) {
                let hitPos = pickResult.pickedPoint;
                let hitNormal = pickResult.getNormal(true);
                const hitDistance = pickResult.distance;
                const hitMesh = pickResult.pickedMesh;
                
                if (hitNormal) {
                    hitPos = hitPos.add(hitNormal.scale(0.02));
                } else {
                    hitNormal = this.mirrorBallRay.direction.scale(-1);
                }
                
                // Smooth interpolation
                const distanceMoved = BABYLON.Vector3.Distance(spot.visual.position, hitPos);
                const isSameMesh = (spot.previousHitMesh === hitMesh);
                
                let lerpFactor;
                if (!isSameMesh && distanceMoved > 5.0) {
                    lerpFactor = 1.0;
                } else if (distanceMoved > 1.5) {
                    lerpFactor = 0.7;
                } else if (distanceMoved < 0.1) {
                    lerpFactor = 0.9;
                } else {
                    lerpFactor = 0.75;
                }
                
                spot.visual.position.x += (hitPos.x - spot.visual.position.x) * lerpFactor;
                spot.visual.position.y += (hitPos.y - spot.visual.position.y) * lerpFactor;
                spot.visual.position.z += (hitPos.z - spot.visual.position.z) * lerpFactor;
                
                spot.visual.lookAt(spot.visual.position.add(hitNormal));
                
                spot.previousPosition.copyFrom(spot.visual.position);
                spot.previousHitMesh = hitMesh;
                
                // Distance fade and twinkling
                const distanceFade = Math.max(0.3, 1 - (hitDistance / 30));
                const twinkle = 0.7 + 0.3 * Math.sin(time * spot.twinkleSpeed + spot.twinklePhase);
                const brightness = spot.baseIntensity * distanceFade * twinkle * 0.6;
                
                // Update colors
                spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(Math.max(0.4, brightness));
                spot.material.alpha = 0.85;
                
                // Update beam
                if (spot.beam) {
                    spot.beam.setEnabled(true);
                    // CRITICAL: Position beam at the mirror ball
                    spot.beam.position.copyFrom(ballPos);
                    // Point beam at spot position
                    spot.beam.lookAt(spot.visual.position);
                    const beamDist = BABYLON.Vector3.Distance(ballPos, spot.visual.position);
                    spot.beam.scaling.y = beamDist;
                    spot.beamMaterial.alpha = 0.08 * distanceFade;
                    spot.beamMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(0.6);
                }
                
                spot.isVisible = true;
            } else {
                spot.visual.setEnabled(false);
                if (spot.beam) spot.beam.setEnabled(false);
                spot.isVisible = false;
                spot.previousHitMesh = null;
            }
        }
    }

    /**
     * Update visibility of all spots
     */
    _updateSpotVisibility() {
        this.mirrorReflectionSpots.forEach(spot => {
            if (spot.isVisible) {
                spot.visual.setEnabled(true);
                if (spot.beam && spot.material.alpha > 0.01) {
                    spot.beam.setEnabled(true);
                }
            } else {
                spot.visual.setEnabled(false);
                if (spot.beam) spot.beam.setEnabled(false);
            }
        });
    }

    /**
     * Disable all mirror ball elements
     */
    _disableMirrorBall() {
        this.mirrorBallSpotlights.forEach(light => {
            if (light) light.setEnabled(false);
        });
        
        this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(false));
        
        this.mirrorBallHousings.forEach(housing => {
            housing.material.emissiveColor = this.cachedColors.black;
            housing.lensMaterial.emissiveColor = this.cachedColors.black;
        });
        
        this.mirrorReflectionSpots.forEach(spot => {
            spot.visual.setEnabled(false);
            if (spot.beam) spot.beam.setEnabled(false);
        });
    }

    /**
     * Set mirror ball active state
     */
    setActive(active) {
        this.mirrorBallActive = active;
    }

    /**
     * Set rotation speed
     */
    setSpeed(speed) {
        this.mirrorBallSpeed = speed;
    }

    /**
     * Cycle to next color
     */
    nextColor() {
        this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
        this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
        this._updateCachedColors();
        
        // Update housing colors
        if (this.mirrorBallHousings) {
            this.mirrorBallHousings.forEach(housing => {
                housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
                housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
                housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
            });
        }
    }

    /**
     * Set specific color index
     */
    setColorIndex(index) {
        this.mirrorBallColorIndex = index % this.mirrorBallColors.length;
        this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
        this._updateCachedColors();
    }

    /**
     * Get current color
     */
    getCurrentColor() {
        return this.mirrorBallSpotlightColor;
    }

    /**
     * Set VJ manual mode
     */
    setManualMode(manual) {
        this.vjManualMode = manual;
    }

    /**
     * Dispose all mirror ball resources
     */
    dispose() {
        if (this.mirrorBall) this.mirrorBall.dispose();
        
        this.mirrorBallSpotlights.forEach(light => {
            if (light) light.dispose();
        });
        
        this.mirrorBallBeams.forEach(beam => beam.mesh.dispose());
        
        this.mirrorBallHousings.forEach(housing => {
            housing.fixture.dispose();
            housing.lens.dispose();
            housing.lightSource.dispose();
            housing.flare.dispose();
        });
        
        this.mirrorReflectionSpots.forEach(spot => {
            spot.visual.dispose();
            if (spot.beam) spot.beam.dispose();
        });
        
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        this.mirrorReflectionSpots = [];
        
        this.log.info?.('🗑️ Mirror ball system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MirrorBallSystem;
}
