// Laser System - Modular laser effects for VR Club
// Handles laser creation, animation, and color management

class LaserSystem {
    constructor(scene, materialFactory, options = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = options.logger || console;
        
        // Laser state
        this.lasers = [];
        this.lasersActive = false;
        this.laserSheetActive = false;
        this.laserSpeed = 1.0;
        this.currentColorIndex = 0;
        
        // Color palette for lasers
        this.laserColors = [
            new BABYLON.Color3(1, 0, 0),      // Red
            new BABYLON.Color3(0, 1, 0),      // Green
            new BABYLON.Color3(0, 0, 1),      // Blue
            new BABYLON.Color3(1, 0, 1),      // Magenta
            new BABYLON.Color3(0, 1, 1),      // Cyan
            new BABYLON.Color3(1, 1, 0),      // Yellow
            new BABYLON.Color3(1, 1, 1)       // White
        ];
        
        // Laser sheet references
        this.laserSheet = null;
        this.laserSheetSource = null;
        this.laserAperture = null;
        this.laserLight = null;
        
        // Parent truss references (set from main club)
        this.sideTrusses = null;
        this.horizontalTrusses = null;
        
        // Cached scratch objects to avoid per-frame allocations
        this._scratchDirection = new BABYLON.Vector3(0, 0, 0);
        this._scratchRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Down(), 15);
        this._cachedBlack = new BABYLON.Color3(0, 0, 0);
        this._cachedAudioColors = [
            new BABYLON.Color3(0, 1, 0),
            new BABYLON.Color3(1, 0, 0),
            new BABYLON.Color3(0, 0, 1)
        ];
    }

    /**
     * Set parent truss references for laser mounting
     */
    setTrussReferences(sideTrusses, horizontalTrusses) {
        this.sideTrusses = sideTrusses;
        this.horizontalTrusses = horizontalTrusses;
    }

    /**
     * Create all laser units mounted on trusses
     */
    createLasers() {
        this.lasers = [];
        
        // Lasers mounted UNDER the truss (hanging down)
        // ALL LASERS ARE MULTI-BEAM TYPE (5 rotating beams each)
        const laserPositions = [
            { x: -8, z: -14, trussY: 3.55, type: 'multi' },
            { x: 0, z: -12, trussY: 3.55, type: 'multi' },
            { x: 8, z: -14, trussY: 3.55, type: 'multi' }
        ];
        
        laserPositions.forEach((pos, i) => {
            const laser = this._createLaserUnit(pos, i);
            this.lasers.push(laser);
        });
        
        // Initialize laser state (removed unused lightingMode/modeSwitchTime/colorSwitchTime vars)
        this.log.info?.('✅ Laser system created with ' + this.lasers.length + ' units');
    }

    /**
     * Create a single laser unit with housing, clamp, and beams
     */
    _createLaserUnit(pos, index) {
        // Determine parent truss
        let parentTruss = null;
        let localX = pos.x;
        let localZ = pos.z;
        
        if (pos.x < -3 && this.sideTrusses && this.sideTrusses[-8]) {
            parentTruss = this.sideTrusses[-8];
            localX = 0;
            localZ = pos.z - (-12);
        } else if (pos.x > 3 && this.sideTrusses && this.sideTrusses[8]) {
            parentTruss = this.sideTrusses[8];
            localX = 0;
            localZ = pos.z - (-12);
        } else if (Math.abs(pos.x) <= 3 && this.horizontalTrusses && this.horizontalTrusses.length > 1) {
            parentTruss = this.horizontalTrusses[1];
            localX = 0;
            localZ = pos.z - (-12);
        }
        
        // Mounting clamp
        const clamp = BABYLON.MeshBuilder.CreateBox("laserClamp" + index, {
            width: 0.3, height: 0.15, depth: 0.3
        }, this.scene);
        
        if (parentTruss) {
            clamp.position = new BABYLON.Vector3(localX, -0.2, localZ);
            clamp.parent = parentTruss;
        } else {
            clamp.position = new BABYLON.Vector3(pos.x, pos.trussY + 0.25, pos.z);
        }
        
        const clampMat = this.materialFactory.createPBRMaterial("laserClampMat" + index, {
            baseColor: [0.3, 0.3, 0.3],
            metallic: 1.0,
            roughness: 0.4
        });
        clamp.material = clampMat;
        
        // Laser housing
        const housing = BABYLON.MeshBuilder.CreateBox("laserHousing" + index, {
            width: 0.25, height: 0.2, depth: 0.35
        }, this.scene);
        
        if (parentTruss) {
            housing.position = new BABYLON.Vector3(localX, -0.45, localZ);
            housing.parent = parentTruss;
        } else {
            housing.position = new BABYLON.Vector3(pos.x, pos.trussY, pos.z);
        }
        housing.isPickable = false;
        
        const housingMat = this.materialFactory.createPBRMaterial("laserHousingMat" + index, {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.8,
            roughness: 0.3,
            emissiveColor: [0.05, 0, 0]
        });
        housing.material = housingMat;
        
        // Laser emitter (bright source)
        const emitter = BABYLON.MeshBuilder.CreateCylinder("laserEmitter" + index, {
            diameter: 0.12, height: 0.03, tessellation: 16
        }, this.scene);
        
        if (parentTruss) {
            emitter.position = new BABYLON.Vector3(localX, -0.45, localZ + 0.18);
            emitter.parent = parentTruss;
        } else {
            emitter.position = new BABYLON.Vector3(pos.x, pos.trussY, pos.z + 0.18);
        }
        emitter.rotation.x = Math.PI / 2;
        emitter.isPickable = false;
        
        const emitterMat = this.materialFactory.createStandardMaterial("laserEmitterMat" + index, {
            emissiveColor: [1, 0, 0],
            disableLighting: true
        });
        emitterMat.backFaceCulling = false;
        emitter.material = emitterMat;
        emitter.renderingGroupId = 2;
        
        // Create beams
        const beams = [];
        const lights = [];
        
        for (let j = 0; j < 5; j++) {
            const beam = this._createLaserBeam(index, j, pos);
            beams.push(beam);
            
            const angle = (j / 5) * Math.PI * 2;
            const light = new BABYLON.SpotLight("laserLight" + index + "_" + j,
                new BABYLON.Vector3(pos.x, pos.trussY, pos.z),
                new BABYLON.Vector3(Math.sin(angle) * 0.3, -1, Math.cos(angle) * 0.3).normalize(),
                Math.PI / 12, 5, this.scene
            );
            light.diffuse = new BABYLON.Color3(1, 0, 0);
            light.intensity = 2;
            light.range = 20;
            light.setEnabled(false);
            lights.push(light);
        }
        
        // Calculate world position for beam origin
        let actualWorldPos;
        if (parentTruss) {
            actualWorldPos = housing.getAbsolutePosition().clone();
        } else {
            actualWorldPos = new BABYLON.Vector3(pos.x, pos.trussY, pos.z);
        }
        
        return {
            beams: beams,
            housing: housing,
            clamp: clamp,
            housingMat: housingMat,
            emitter: emitter,
            emitterMat: emitterMat,
            lights: lights,
            rotation: 0,
            rotationSpeed: 0.01,
            tiltPhase: 0,
            originPos: actualWorldPos,
            parentTruss: parentTruss,
            localPos: new BABYLON.Vector3(localX, -0.45, localZ),
            type: pos.type,
            colorIndex: 0
        };
    }

    /**
     * Create a single laser beam with glow effect
     */
    _createLaserBeam(laserIndex, beamIndex, pos) {
        // Core beam - ultra thin
        const beam = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_beam" + beamIndex, {
            diameter: 0.008,
            height: 1,
            tessellation: 8
        }, this.scene);
        beam.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        
        const beamMat = this.materialFactory.createPBRMaterial("laserBeamMat" + laserIndex + "_" + beamIndex, {
            baseColor: [0, 0, 0],
            metallic: 0,
            roughness: 1,
            emissiveColor: [1, 0, 0],
            emissiveIntensity: 8.0,
            alpha: 1.0,
            transparencyMode: BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND,
            backFaceCulling: false,
            disableLighting: true,
            unlit: true
        });
        beam.material = beamMat;
        beam.renderingGroupId = 1;
        
        // Volumetric glow
        const beamGlow = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_glow" + beamIndex, {
            diameter: 0.12,
            height: 1,
            tessellation: 8
        }, this.scene);
        beamGlow.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        beamGlow.isPickable = false;
        beamGlow.rotationQuaternion = BABYLON.Quaternion.Identity();
        
        const beamGlowMat = this.materialFactory.createPBRMaterial("laserGlowMat" + laserIndex + "_" + beamIndex, {
            baseColor: [0, 0, 0],
            metallic: 0,
            roughness: 1,
            emissiveColor: [1, 0, 0],
            emissiveIntensity: 2.0,
            alpha: 0.2,
            transparencyMode: BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND,
            backFaceCulling: false,
            disableLighting: true,
            unlit: true
        });
        beamGlow.material = beamGlowMat;
        beamGlow.renderingGroupId = 1;
        
        // Floor hit spot
        const hitSpot = BABYLON.MeshBuilder.CreateDisc("laserHit" + laserIndex + "_" + beamIndex, {
            radius: 0.04,
            tessellation: 16
        }, this.scene);
        hitSpot.rotation.x = Math.PI / 2;
        hitSpot.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
        hitSpot.isPickable = false;
        
        const hitSpotMat = new BABYLON.StandardMaterial("laserHitMat" + laserIndex + "_" + beamIndex, this.scene);
        
        hitSpotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        hitSpotMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        hitSpotMat.alpha = 0.9;
        hitSpotMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        hitSpotMat.disableLighting = true;
        hitSpot.material = hitSpotMat;
        hitSpot.renderingGroupId = 1;
        
        return { 
            mesh: beam, 
            material: beamMat, 
            beamGlow: beamGlow,
            glowMat: beamGlowMat,
            hitSpot: hitSpot,
            hitSpotMat: hitSpotMat,
            beamIndex: beamIndex 
        };
    }

    /**
     * Create laser sheet (fan) effect
     */
    createLaserSheet() {
        const sourcePos = new BABYLON.Vector3(0, 5.5, -25.8);
        
        // Source housing
        this.laserSheetSource = BABYLON.MeshBuilder.CreateBox("laserSheetSource", {
            width: 0.5, height: 0.2, depth: 0.4
        }, this.scene);
        this.laserSheetSource.position = sourcePos;
        this.laserSheetSource.material = this.materialFactory.getPreset('cdjBody');
        
        // Aperture (glowing slit)
        this.laserAperture = BABYLON.MeshBuilder.CreateBox("laserSheetAperture", {
            width: 0.4, height: 0.05, depth: 0.02
        }, this.scene);
        this.laserAperture.parent = this.laserSheetSource;
        this.laserAperture.position.z = 0.21;
        
        const apertureMat = new BABYLON.StandardMaterial("apertureMat", this.scene);
        
        apertureMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
        apertureMat.disableLighting = true;
        this.laserAperture.material = apertureMat;
        
        // Sheet geometry (triangle fan)
        const sheet = new BABYLON.Mesh("laserSheet", this.scene);
        const length = 45;
        const widthEnd = 35;
        
        const positions = [
            0, 0, 0,
            -widthEnd/2, 0, length,
            widthEnd/2, 0, length
        ];
        const indices = [0, 1, 2, 0, 2, 1];
        const uvs = [0.5, 0, 0, 1, 1, 1];
        const normals = [];
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.uvs = uvs;
        vertexData.normals = normals;
        vertexData.applyToMesh(sheet);
        
        sheet.parent = this.laserSheetSource;
        sheet.position = new BABYLON.Vector3(0, 0, 0.25);
        
        // Sheet material with noise texture
        const sheetMat = new BABYLON.StandardMaterial("laserSheetMat", this.scene);
        
        sheetMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.specularColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
        sheetMat.disableLighting = true;
        sheetMat.alpha = 0.6;
        sheetMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        sheetMat.backFaceCulling = false;
        
        const noiseTexture = new BABYLON.NoiseProceduralTexture("laserSheetNoise", 512, this.scene);
        noiseTexture.octaves = 4;
        noiseTexture.persistence = 0.8;
        noiseTexture.animationSpeedFactor = 0.5;
        noiseTexture.brightness = 0.5;
        noiseTexture.contrast = 2.0;
        
        sheetMat.opacityTexture = noiseTexture;
        sheetMat.emissiveTexture = noiseTexture;
        sheet.material = sheetMat;
        this.laserSheet = sheet;
        
        // Spot light for floor illumination
        this.laserLight = new BABYLON.SpotLight("laserSheetLight",
            sourcePos,
            new BABYLON.Vector3(0, -0.5, 1),
            Math.PI / 2,
            2,
            this.scene
        );
        this.laserLight.diffuse = new BABYLON.Color3(0, 1, 0);
        this.laserLight.intensity = 0;
        this.laserLight.parent = this.laserSheetSource;
        
        this.log.info?.('✅ Laser sheet effect created');
    }

    /**
     * Update laser animations each frame
     */
    update(time, audioData = null) {
        const speedMultiplier = this.laserSpeed || 1.0;
        
        // Update laser sheet
        this._updateLaserSheet(time, speedMultiplier, audioData);
        
        // Update individual lasers
        if (this.lasersActive) {
            this._updateLasers(time, speedMultiplier);
        } else {
            this._disableLasers();
        }
    }

    /**
     * Update laser sheet animation
     */
    _updateLaserSheet(time, speedMultiplier, audioData) {
        if (this.laserSheet && this.laserSheetActive) {
            // Scanning motion
            const scanSpeed = 0.2 * speedMultiplier;
            const scanAngle = 0.15 + Math.sin(time * scanSpeed) * 0.25;
            
            if (this.laserSheetSource) {
                this.laserSheetSource.rotation.x = scanAngle;
            }
            
            // Animate smoke texture
            if (this.laserSheet.material && this.laserSheet.material.opacityTexture) {
                this.laserSheet.material.opacityTexture.vOffset -= 0.002 * speedMultiplier;
            }
            
            // Audio reactivity
            if (audioData && audioData.bass > 0.6) {
                const sheetColor = this._getAudioReactiveColor(time);
                this.laserSheet.material.emissiveColor = sheetColor;
                this.laserAperture.material.emissiveColor = sheetColor;
                
                const pulse = 0.5 + audioData.bass * 0.5;
                if (this.laserLight) {
                    this.laserLight.diffuse = sheetColor;
                    this.laserLight.intensity = 2.0 * pulse;
                }
            }
            
            this.laserSheet.isVisible = true;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = true;
        } else if (this.laserSheet) {
            this.laserSheet.isVisible = false;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = false;
            if (this.laserLight) this.laserLight.intensity = 0;
        }
    }

    /**
     * Get audio-reactive laser color
     */
    _getAudioReactiveColor(time) {
        const colorCycle = Math.floor(time * 0.5) % 3;
        return this._cachedAudioColors[colorCycle];
    }

    /**
     * Update individual laser units
     */
    _updateLasers(time, speedMultiplier) {
        const currentColor = this.laserColors[this.currentColorIndex];
        
        this.lasers.forEach((laser, i) => {
            // Update rotation
            laser.rotation += laser.rotationSpeed * speedMultiplier;
            laser.tiltPhase += 0.015 * speedMultiplier;
            
            // Update emitter and housing color to match beam
            laser.emitterMat.emissiveColor = currentColor;
            if (laser.housingMat) {
                laser.housingMat.emissiveColor = currentColor.scale(0.5);
            }
            
            // Get origin position
            let originPos;
            if (laser.parentTruss) {
                originPos = laser.housing.getAbsolutePosition();
            } else {
                originPos = laser.originPos;
            }
            
            // Update beams
            laser.beams.forEach((beam, j) => {
                const baseAngle = (j / laser.beams.length) * Math.PI * 2;
                const rotatedAngle = baseAngle + laser.rotation;
                
                // Calculate direction with tilt
                const tiltAmount = 0.3 + Math.sin(laser.tiltPhase + j * 0.5) * 0.2;
                const dirX = Math.sin(rotatedAngle) * tiltAmount;
                const dirZ = Math.cos(rotatedAngle) * tiltAmount;
                this._scratchDirection.set(dirX, -1, dirZ);
                this._scratchDirection.normalize();
                const direction = this._scratchDirection;
                
                // Raycast to find floor intersection
                this._scratchRay.origin.copyFrom(originPos);
                this._scratchRay.direction.copyFrom(direction);
                this._scratchRay.length = 15;
                const hit = this.scene.pickWithRay(this._scratchRay, (mesh) => {
                    return mesh.name.includes('floor') || mesh.name.includes('Floor');
                });
                
                let beamLength = 10;
                let hitPoint = originPos.add(direction.scale(beamLength));
                
                if (hit && hit.hit && hit.pickedPoint) {
                    hitPoint = hit.pickedPoint;
                    beamLength = hit.distance;
                }
                
                // Update beam position and rotation
                const midPoint = BABYLON.Vector3.Center(originPos, hitPoint);
                beam.mesh.position = midPoint;
                beam.mesh.scaling.y = beamLength;
                beam.mesh.lookAt(hitPoint);
                beam.mesh.rotation.x += Math.PI / 2;
                
                // Update glow
                if (beam.beamGlow) {
                    beam.beamGlow.position = midPoint;
                    beam.beamGlow.scaling.y = beamLength;
                    beam.beamGlow.lookAt(hitPoint);
                    beam.beamGlow.rotation.x += Math.PI / 2;
                }
                
                // Update hit spot
                if (beam.hitSpot) {
                    beam.hitSpot.position = hitPoint.clone();
                    beam.hitSpot.position.y = 0.02;
                }
                
                // Update colors
                beam.material.emissiveColor = currentColor;
                if (beam.glowMat) beam.glowMat.emissiveColor = currentColor;
                if (beam.hitSpotMat) beam.hitSpotMat.emissiveColor = currentColor;
                
                // Enable meshes
                beam.mesh.setEnabled(true);
                if (beam.beamGlow) beam.beamGlow.setEnabled(true);
                if (beam.hitSpot) beam.hitSpot.setEnabled(true);
            });
            
            // Enable lights
            laser.lights.forEach(light => light.setEnabled(true));
        });
    }

    /**
     * Disable all laser visuals
     */
    _disableLasers() {
        this.lasers.forEach(laser => {
            laser.beams.forEach(beam => {
                beam.mesh.setEnabled(false);
                if (beam.beamGlow) beam.beamGlow.setEnabled(false);
                if (beam.hitSpot) beam.hitSpot.setEnabled(false);
            });
            laser.lights.forEach(light => light.setEnabled(false));
            
            // Turn off emitter when lasers are disabled
            if (laser.emitterMat) {
                laser.emitterMat.emissiveColor.copyFrom(this._cachedBlack);
            }
            if (laser.housingMat) {
                laser.housingMat.emissiveColor.copyFrom(this._cachedBlack);
            }
        });
    }

    /**
     * Set laser active state
     */
    setActive(active) {
        this.lasersActive = active;
    }

    /**
     * Set laser sheet active state
     */
    setSheetActive(active) {
        this.laserSheetActive = active;
    }

    /**
     * Set laser speed multiplier
     */
    setSpeed(speed) {
        this.laserSpeed = speed;
    }

    /**
     * Cycle to next laser color
     */
    nextColor() {
        this.currentColorIndex = (this.currentColorIndex + 1) % this.laserColors.length;
    }

    /**
     * Set specific laser color index
     */
    setColorIndex(index) {
        this.currentColorIndex = index % this.laserColors.length;
    }

    /**
     * Get current color
     */
    getCurrentColor() {
        return this.laserColors[this.currentColorIndex];
    }

    /**
     * Dispose all laser resources
     */
    dispose() {
        this.lasers.forEach(laser => {
            laser.beams.forEach(beam => {
                beam.mesh.dispose();
                if (beam.beamGlow) beam.beamGlow.dispose();
                if (beam.hitSpot) beam.hitSpot.dispose();
            });
            laser.housing.dispose();
            laser.clamp.dispose();
            laser.emitter.dispose();
            laser.lights.forEach(light => light.dispose());
        });
        
        if (this.laserSheet) this.laserSheet.dispose();
        if (this.laserSheetSource) this.laserSheetSource.dispose();
        if (this.laserAperture) this.laserAperture.dispose();
        if (this.laserLight) this.laserLight.dispose();
        
        this.lasers = [];
        this.log.info?.('🗑️ Laser system disposed');
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LaserSystem;
}
