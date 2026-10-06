'use strict';
class VRClubEffects extends VRClubFixtures {
    createLights() {
        
        // Ambient light - brighter for better visibility in VR and desktop
        this.lightFactory.getPreset('ambient', 'ambient');
        
        // Skip inline spotlight creation if using modular system
        if (this.useModularSystems && this.systems.spotlight) {
            log.info('⏭️ Skipping inline spotlight creation (using modular SpotlightSystem)');
            
            // Initialize color tracking (still needed for VJ controls)
            const spotColors = [
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
            this.currentSpotColor.copyFrom(spotColors[0]);
            this.previousSpotColor.copyFrom(spotColors[0]);
            this.targetSpotColor = spotColors[0];
            this.spotColorIndex = 0;
            this.lastColorChange = 0;
            this.spotColorList = spotColors;
            
            // LED wall backlight
            const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
            ledLight.diffuse = new BABYLON.Color3(0.8, 0.8, 1.0);
            ledLight.intensity = 10;
            ledLight.range = 25;
            ledLight.setEnabled(false);
            
            return; // Skip rest of inline spotlight creation
        }
        
        // === LEGACY INLINE SPOTLIGHT CREATION (when modular systems disabled) ===
        // Spotlights mounted on truss (moving heads)
        this.spotlights = [];
        // 6 spotlights: 3 on left side, 3 on right side - POSITIONED ON ACTUAL TRUSSES
        // Main trusses at Z=-8, -12, -16; spotlights at X=±8 (where trusses intersect side beams)
        const spotPositions = [
            { x: -8, z: -8 },   // Left on truss1 (front)
            { x: -8, z: -12 },  // Left on truss2 (middle)
            { x: -8, z: -16 },  // Left on truss3 (back)
            { x: 8, z: -8 },    // Right on truss1 (front)
            { x: 8, z: -12 },   // Right on truss2 (middle)
            { x: 8, z: -16 }    // Right on truss3 (back)
        ];
        
        const spotColors = [
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
        
        // Track current color for all lights (changes periodically)
        this.currentSpotColor.copyFrom(spotColors[0]);
        this.previousSpotColor.copyFrom(spotColors[0]);
        this.targetSpotColor = spotColors[0];
        this.spotColorIndex = 0;
        this.lastColorChange = 0;
        
        // Shared source-to-surface opacity falloff for a clean shaft through haze.
        if (!this._beamGradientTexture) {
            const gradH = 256;
            const gradCanvas = document.createElement('canvas');
            gradCanvas.width = 64;
            gradCanvas.height = gradH;
            const gCtx = gradCanvas.getContext('2d');
            
            const beamGrad = gCtx.createLinearGradient(0, 0, 0, gradH);
            beamGrad.addColorStop(0.0, 'rgba(255,255,255,0)');
            beamGrad.addColorStop(0.18, 'rgba(255,255,255,0.08)');
            beamGrad.addColorStop(0.55, 'rgba(255,255,255,0.42)');
            beamGrad.addColorStop(1.0, 'rgba(255,255,255,1)');
            
            gCtx.fillStyle = beamGrad;
            gCtx.fillRect(0, 0, gradCanvas.width, gradH);
            
            this._beamGradientTexture = new BABYLON.DynamicTexture("beamGradient", gradCanvas, this.scene, false);
            this._beamGradientTexture.hasAlpha = true;
            this._beamGradientTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._beamGradientTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._beamGradientTexture.update();
        }
        
        spotPositions.forEach((pos, i) => {
            // Get fixture data if available
            const fixtureData = this.trussLights ? this.trussLights[i] : null;
            const head = fixtureData ? fixtureData.head : null;
            const yoke = fixtureData ? fixtureData.yoke : null;

            // Spotlight from truss position - MATCH FIXTURE POSITION (y: 7.3)
            const spot = new BABYLON.SpotLight("spot" + i,
                new BABYLON.Vector3(pos.x, 7.3, pos.z),  // Match fixture lens position
                new BABYLON.Vector3(0, -1, 0),           // Initial direction
                Math.PI / 6,                              // Narrower cone for focused beams
                5,                                        // Sharper falloff
                this.scene
            );
            // Keep enough chroma in the real light to illuminate materials, not only the
            // additive beam mesh. Intensity remains the photometric dimmer.
            spot.diffuse = this.currentSpotColor.scale(0.40);
            spot.specular = this.currentSpotColor; // Specular for floor reflections
            spot.intensity = 30;
            spot.range = 25;

            // No shadow generator. With maxSimultaneousLights = 3 (4 on Quest), every lit
            // material takes ambient + spot0 + spot1 from `scene.lights` order, so the
            // shadow maps this file used to give spot2/spot5 were rendered every frame
            // (1024², ~134 casters each) and sampled by no material at all.
            
            // UPGRADE: SpotLight.projectionTexture support (physically correct gobo projection)
            // Near/far define the frustum for texture projection (like shadow mapping)
            spot.projectionTextureLightNear = 0.5;
            spot.projectionTextureLightFar = 25;
            
            // Enabled for life and dimmed by intensity. Enabling or disabling a light
            // changes the light slots of every lit material: each cue change recompiled
            // 17-20 shader variants (measured 0.4-1.1 s freezes), and each toggle walked
            // the scene. The animation loop drives intensity to 0 when a spot is off.
            spot.intensity = 0;
            
            // SPOTLIGHT BEAM - Cone that extends FROM fixture DOWN to floor/wall
            // When cylinder points DOWN, its +Y local axis points toward surface
            // So: diameterTop (at +Y local) should be WIDE (at surface hit)
            //     diameterBottom (at -Y local) should be NARROW (at fixture)
            // Higher tessellation creates smoother cone edges for hyperrealistic look
            const beam = BABYLON.MeshBuilder.CreateCylinder("spotBeam" + i, {
                diameterTop: 2.0,      // Wide end at surface - 2.0m diameter
                diameterBottom: 0.12,  // Narrower lens opening for tighter source point
                height: 1,             // Will be scaled to actual beam length
                tessellation: 12,      // Higher tessellation for smoother cone (was 8)
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // HYPERREALISTIC: Beam positioned in WORLD SPACE (not parented to head)
            // This ensures beam visually connects from fixture lens to floor pool
            // Position will be set dynamically in animation loop
            beam.position = new BABYLON.Vector3(pos.x, 4, pos.z); // Initial position (will be updated)
            beam.rotationQuaternion = BABYLON.Quaternion.Identity(); // Use quaternion for proper world-space rotation
            
            beam.isPickable = false;
            
            // HYPERREALISTIC VOLUMETRIC BEAM - Animated smoke/dust particles in light cone
            // Real light beams show visible particles drifting through the beam
            const beamMat = new BABYLON.StandardMaterial("spotBeamMat" + i, this.scene);
            beamMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            beamMat.specularColor = new BABYLON.Color3(0, 0, 0);
            beamMat.emissiveColor = this.currentSpotColor.clone(); // Will be updated in animation loop
            
            if (this._beamGradientTexture) {
                beamMat.opacityTexture = this._beamGradientTexture;
            }
            
            beamMat.alpha = 0.18; // Base alpha (will be dynamically adjusted in render loop)
            beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            beamMat.backFaceCulling = false; // Visible from all angles
            beamMat.disableLighting = true; // Self-illuminated
            beamMat.useAlphaFromDiffuseTexture = false;
            beamMat.emissiveFresnelParameters = new BABYLON.FresnelParameters();
            beamMat.emissiveFresnelParameters.leftColor = BABYLON.Color3.Black();
            beamMat.emissiveFresnelParameters.rightColor = BABYLON.Color3.White();
            beamMat.emissiveFresnelParameters.bias = 0;
            beamMat.emissiveFresnelParameters.power = 2;
            
            // CRITICAL: Beam must respect depth buffer to NOT render through NPCs
            // ALPHA_COMBINE properly discards fragments behind opaque geometry
            beamMat.disableDepthWrite = true; // Don't write to depth (transparent object)
            beamMat.separateCullingPass = false;
            beamMat.needDepthPrePass = false;
            beamMat.zOffset = 0; // Preserve physically correct stereo depth and occlusion
            
            // HYPERREALISTIC: Clip plane to hide beam below floor level (y < 0)
            // This allows beam to extend past floor for tilted angles while hiding the portion below
            // Babylon.js clips fragments where dot(normal, pos) + d < 0
            // To clip y < 0 (keep y >= 0): normal = (0, -1, 0), d = 0 → clips where -y < 0 (y > 0)? NO
            // Actually: normal = (0, 1, 0), d = 0 clips where y + 0 < 0, i.e. y < 0 ✓
            // But StandardMaterial uses clipPlane differently - it clips where result > 0
            // So we need normal (0, -1, 0), d = 0 to clip where -y + 0 > 0, i.e. y < 0 ✓
            beamMat.clipPlane4 = new BABYLON.Plane(0, -1, 0, 0.01); // Clip below floor level
            
            beam.material = beamMat;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1; // Render after opaque objects
            
            // PERFORMANCE: Removed beamGlow (outer glow cylinder) - caused doubled beam effect
            const beamGlow = null;
            const beamGlowMat = null;

            
            // HYPERREALISTIC LIGHT POOL - Physics-accurate spotlight floor projection
            // Based on real optics: inverse-square falloff, Lambert's cosine law, Fresnel scattering
            
            // Create physics-accurate radial gradient texture (reuse across all pools)
            if (!this._poolGradientTexture) {
                const gradientSize = 512; // High resolution for smooth physics-based falloff
                const gradientCanvas = document.createElement('canvas');
                gradientCanvas.width = gradientSize;
                gradientCanvas.height = gradientSize;
                const ctx = gradientCanvas.getContext('2d');
                
                // PHYSICS-ACCURATE GRADIENT using inverse-square law with Gaussian hot spot
                // Real spotlight beam profiles have:
                // 1. Bright central hot spot (Gaussian distribution)
                // 2. Field angle region (inverse-square falloff)
                // 3. Soft penumbra edge (Fresnel scattering)
                const gradient = ctx.createRadialGradient(
                    gradientSize/2, gradientSize/2, 0,
                    gradientSize/2, gradientSize/2, gradientSize/2
                );
                
                // Physics model: I(r) = I₀ * exp(-r²/σ²) for hot spot + 1/r² falloff
                // Hot spot (beam angle) typically 10-15% of total, field (flood angle) 50-60%
                // σ = 0.15 for tight hot spot, with inverse-square beyond
                const hotSpotSize = 0.12; // 12% of radius is hot spot
                const fieldSize = 0.55;   // 55% is field angle
                
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');      // Center peak
                gradient.addColorStop(hotSpotSize * 0.5, 'rgba(255, 255, 255, 0.98)'); // Gaussian plateau
                gradient.addColorStop(hotSpotSize, 'rgba(255, 255, 255, 0.85)');  // Hot spot edge
                gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');  // Field region (1/r² starts)
                gradient.addColorStop(fieldSize, 'rgba(255, 255, 255, 0.22)');  // Field edge
                gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.08)');  // Penumbra (soft scatter)
                gradient.addColorStop(0.90, 'rgba(255, 255, 255, 0.02)');  // Fresnel edge scatter
                gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');    // Full transparency
                
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, gradientSize, gradientSize);
                
                this._poolGradientTexture = new BABYLON.DynamicTexture("poolGradient", gradientCanvas, this.scene, false);
                this._poolGradientTexture.hasAlpha = true;
                this._poolGradientTexture.update();
            }
            
            // Main light pool with soft gradient
            const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + i, {
                radius: 1.0, // Larger base radius for better visibility
                tessellation: 32
            }, this.scene);
            lightPool.rotation.x = Math.PI / 2;
            // HYPERREALISTIC: Position pool at floor level (y=0.01, just above to prevent z-fighting)
            // The pool should look like it's ON the floor, not floating
            lightPool.position = new BABYLON.Vector3(pos.x, 0.01, pos.z - 5);
            lightPool.isPickable = false;
            
            // Material with radial gradient for soft edges
            const poolMat = new BABYLON.StandardMaterial("poolMat" + i, this.scene);
            poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolMat.specularColor = new BABYLON.Color3(0, 0, 0);
            poolMat.emissiveColor = this.currentSpotColor.clone();
            poolMat.opacityTexture = this._poolGradientTexture; // Use gradient for soft edges
            poolMat.alpha = 0.9; // High alpha for visible pool
            poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light effect
            poolMat.disableLighting = true;
            poolMat.backFaceCulling = false;
            // Transparent mesh settings
            poolMat.disableDepthWrite = true;
            poolMat.depthFunction = BABYLON.Constants.LEQUAL;
            lightPool.material = poolMat;
            // Use default rendering group (0) so pool renders with floor
            lightPool.renderingGroupId = 0;
            
            // Store reference for gobo texture (null - not using procedural texture anymore)
            const goboTexture = null;
            
            // HYPERREALISTIC SOFT OUTER GLOW - Very soft ambient light spread
            // Creates the "light spill" effect around the main pool
            const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + i, {
                radius: 1.5, // Larger glow radius
                tessellation: 32
            }, this.scene);
            lightPoolGlow.rotation.x = Math.PI / 2;
            lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.005, pos.z - 5); // Just below main pool
            lightPoolGlow.isPickable = false;
            lightPoolGlow.renderingGroupId = 0; // Same group as floor
            
            // Very soft glow with same gradient texture
            const poolGlowMat = new BABYLON.StandardMaterial("poolGlowMat" + i, this.scene);
            poolGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.5);
            poolGlowMat.opacityTexture = this._poolGradientTexture; // Same soft gradient
            poolGlowMat.alpha = 0.25; // Very subtle ambient glow
            poolGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            poolGlowMat.disableLighting = true;
            poolGlowMat.backFaceCulling = false;
            lightPoolGlow.material = poolGlowMat;
            lightPoolGlow.renderingGroupId = 1;
            
            // Core layer removed for performance - using main pool + glow ring only
            const lightPoolCore = null;
            const poolCoreMat = null;
            
            // === GOBO PROJECTION DISC ===
            // Creates pattern shapes on floor when gobo is enabled
            const goboProjection = BABYLON.MeshBuilder.CreateDisc("goboProjection" + i, {
                radius: 1.0,
                tessellation: 64
            }, this.scene);
            goboProjection.rotation.x = Math.PI / 2;
            goboProjection.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
            goboProjection.isPickable = false;
            
            const goboMat = new BABYLON.StandardMaterial("goboMat" + i, this.scene);
            goboMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            goboMat.specularColor = new BABYLON.Color3(0, 0, 0);
            goboMat.emissiveColor = this.currentSpotColor.clone();
            goboMat.alpha = 0.9;
            goboMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            goboMat.disableLighting = true;
            goboMat.backFaceCulling = false;
            goboMat.disableDepthWrite = true;
            goboProjection.material = goboMat;
            goboProjection.renderingGroupId = 1;
            goboProjection.setEnabled(false); // Hidden by default
            
            // === HYPERREALISTIC POOL LIGHT ===
            // DISABLED: Pool lights (PointLights) caused shader uniform buffer overflow
            // With 6 spotlights + 6 pool lights + ambient + LED = 14+ lights
            // WebGL2 only supports ~12 uniform buffers for PBR materials
            // The visual pool meshes still create the light pool effect on the floor
            // Real illumination comes from the SpotLights which are more efficient
            const poolLight = null; // Disabled for performance - was causing shader compilation errors
            
            // PERFORMANCE: Shadows and pool lights disabled for better FPS
            
            this.spotlights.push({
                light: spot,
                beam: beam,
                beamMat: beamMat,
                beamGlow: beamGlow,
                beamGlowMat: beamGlowMat,
                lightPool: lightPool,
                poolMat: poolMat,
                poolLight: poolLight, // NEW: Actual light for surface illumination
                lightPoolCore: lightPoolCore,
                poolCoreMat: poolCoreMat,
                lightPoolGlow: lightPoolGlow,
                poolGlowMat: poolGlowMat,
                goboTexture: goboTexture, // Store for animation updates
                goboProjection: goboProjection,
                goboMat: goboMat,
                goboLocalRotation: i * (Math.PI / 3), // Offset each spotlight's gobo rotation
                fixture: fixtureData ? fixtureData.fixture : null,
                head: head,
                yoke: yoke,
                lens: fixtureData ? fixtureData.lens : null,
                bezel: fixtureData ? fixtureData.bezel : null,
                lensMat: fixtureData ? fixtureData.lensMat : null,
                basePos: new BABYLON.Vector3(pos.x, 7.3, pos.z), // Match fixture position
                phase: i * (Math.PI * 2 / spotPositions.length),
                speed: 0.8,
                color: this.currentSpotColor,
                index: i
            });
        });
        
        this.spotColorList = spotColors;
        
        // LED wall backlight
        const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
        ledLight.diffuse = new BABYLON.Color3(0.8, 0.8, 1.0);
        ledLight.intensity = 10;
        ledLight.range = 25;
        ledLight.setEnabled(false); // Start disabled - LED wall light controlled by ledWallActive
        
    }


    createLaserSheet() {
        // === LASER SHEET EFFECT ===
        // Two projectors hang from the rear truss, one each side. By default BOTH emit
        // a fan together (see configureLaserSheetVariant()); a look may select one.
        // Hyperrealistic implementation: Triangle fan geometry with smoke texture
        
        // 1. Create the projector housings. The left mesh keeps its historical name.
        const createMount = (housingName, apertureName, x) => {
            const housing = BABYLON.MeshBuilder.CreateBox(housingName, {
                width: 0.5, height: 0.2, depth: 0.4
            }, this.scene);
            housing.position.set(x, 7.55, -16);
            housing.material = this.materialFactory.getPreset('cdjBody'); // Dark metal

            // Aperture (glowing slit), dark while this projector is idle
            const aperture = BABYLON.MeshBuilder.CreateBox(apertureName, {
                width: 0.4, height: 0.05, depth: 0.02
            }, this.scene);
            aperture.parent = housing;
            aperture.position.z = 0.21; // Front face

            const apertureMat = new BABYLON.StandardMaterial(`${apertureName}Mat`, this.scene);
            apertureMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            apertureMat.disableLighting = true;
            aperture.material = apertureMat;
            return { housing, aperture };
        };
        this._laserSheetMounts = {
            ceilingLeft: createMount('laserSheetSource', 'laserSheetAperture', -6),
            ceilingRight: createMount('laserSheetSourceRight', 'laserSheetApertureRight', 6)
        };
        this._laserApertureOff = new BABYLON.Color3(0, 0, 0);
        this.laserSheetSource = this._laserSheetMounts.ceilingLeft.housing;
        this.laserAperture = this._laserSheetMounts.ceilingLeft.aperture;
        
        // 2. Create the Laser Sheet Geometry (Triangle Fan)
        // We create a custom mesh for the fan shape
        const sheet = new BABYLON.Mesh("laserSheet", this.scene);
        
        // Fan dimensions
        const length = 24; // Rear wall to entrance, without extending outside the room
        const widthEnd = 22; // Covers the dance floor at the entrance
        this._laserSheetLength = length;
        this._laserSheetWidthEnd = widthEnd;
        
        const positions = [
            0, 0, 0,              // 0: Source (Tip)
            -widthEnd/2, 0, length, // 1: Far Left
            widthEnd/2, 0, length   // 2: Far Right
        ];
        
        const indices = [0, 1, 2, 0, 2, 1]; // Double sided
        
        const uvs = [
            0.5, 0,  // Source
            0, 1,    // Left
            1, 1     // Right
        ];
        
        const normals = [];
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.uvs = uvs;
        vertexData.normals = normals;
        vertexData.applyToMesh(sheet);
        
        // Parent to source for easy rotation/scanning
        sheet.parent = this.laserSheetSource;
        sheet.position = new BABYLON.Vector3(0, 0, 0.25); // Start at aperture
        
        // 3. Material & Texture (Hyperrealistic Smoke)
        const sheetMat = new BABYLON.StandardMaterial("laserSheetMat", this.scene);
        sheetMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.specularColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.emissiveColor = new BABYLON.Color3(0, 1, 0); // Default green
        sheetMat.disableLighting = true;
        sheetMat.alpha = 0.025;
        sheetMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        sheetMat.backFaceCulling = false;
        sheetMat.disableDepthWrite = true;
        
        // Procedural noise for smoke movement
        const noiseTexture = new BABYLON.NoiseProceduralTexture("laserSheetNoise", 256, this.scene); // OPTIMIZED: Reduced from 512
        noiseTexture.octaves = 4;
        noiseTexture.persistence = 0.5;
        noiseTexture.animationSpeedFactor = 0.5;
        noiseTexture.brightness = 0.62;
        noiseTexture.contrast = 0.85;
        
        sheetMat.opacityTexture = noiseTexture;
        
        sheet.material = sheetMat;
        this.laserSheet = sheet;

        // A second, slightly offset scatter layer gives the plane visible depth where
        // it intersects uneven haze instead of reading as one uniformly transparent
        // triangle. It reuses the same geometry and adds only one draw call.
        const hazeSheet = sheet.clone("laserSheetHaze");
        hazeSheet.parent = this.laserSheetSource;
        hazeSheet.position.set(0, 0.035, 0.25);
        hazeSheet.scaling.set(0.985, 1, 0.985);

        const hazeMat = sheetMat.clone("laserSheetHazeMat");
        const hazeNoise = new BABYLON.NoiseProceduralTexture("laserSheetHazeNoise", 128, this.scene);
        hazeNoise.octaves = 6;
        hazeNoise.persistence = 0.48;
        hazeNoise.animationSpeedFactor = 0.16;
        hazeNoise.brightness = 0.56;
        hazeNoise.contrast = 1.15;
        hazeMat.opacityTexture = hazeNoise;
        hazeMat.emissiveTexture = null;
        hazeMat.alpha = 0.012;
        hazeSheet.material = hazeMat;
        this.laserSheetHaze = hazeSheet;

        // The second truss projector's fan. Same geometry and, deliberately, the same
        // materials: colour, alpha and smoke flow stay in lockstep with the first fan and
        // the pair costs two more draw calls, not two more noise textures.
        const sheetB = sheet.clone("laserSheetRight");
        sheetB.parent = this._laserSheetMounts.ceilingRight.housing;
        sheetB.position.set(0, 0, 0.25);
        const hazeB = hazeSheet.clone("laserSheetHazeRight");
        hazeB.parent = this._laserSheetMounts.ceilingRight.housing;
        hazeB.position.set(0, 0.035, 0.25);
        hazeB.scaling.set(0.985, 1, 0.985);
        sheetB.isVisible = false;
        hazeB.isVisible = false;
        this._laserSheetFanB = { sheet: sheetB, haze: hazeB };
        
        // 4. Light Source (Actual light projection) - DISABLED for performance
        // DISABLED: Laser sheet SpotLight adds to uniform buffer count
        // Visual effect from emissive laser sheet mesh is sufficient
        this.laserLight = null; // Disabled - visual sheet provides the effect
        
        // Remove old fan if it exists (cleanup)
        this.laserFan = null;
        
        // Add to glow layer for bloom effect
        if (this.glowLayer) {
            this.glowLayer.addIncludedOnlyMesh(this.laserSheet);
            this.glowLayer.addIncludedOnlyMesh(this.laserSheetHaze);
            this.glowLayer.addIncludedOnlyMesh(sheetB);
            this.glowLayer.addIncludedOnlyMesh(hazeB);
            for (const mount of Object.values(this._laserSheetMounts)) {
                this.glowLayer.addIncludedOnlyMesh(mount.aperture);
            }
        }

        this.configureLaserSheetVariant();
        
        log.info('✨ Laser sheet effect created with hyperrealistic source');
    }

    /**
     * Which truss projectors emit, per `laserSheetOrigin`:
     *   'both' (default) - the left fan leads and the right fan mirrors it, together;
     *   'ceilingLeft' / 'ceilingRight' - that projector alone, the other stays dark.
     * `laserSheetSource` / `laserSheet` always describe the LEAD projector;
     * `_laserSheetFollower` is the second one in 'both' and null otherwise.
     */
    configureLaserSheetVariant() {
        if (!this.laserSheetSource) return;

        const origin = this.laserSheetOrigin;
        const both = origin !== 'ceilingLeft' && origin !== 'ceilingRight';
        const leadSide = origin === 'ceilingRight' ? 'ceilingRight' : 'ceilingLeft';
        // Geometry tuned against the two planes' CROSSING, which is what the eye follows.
        // Each plane only turns ~2 deg/s, but where two near-parallel planes meet the
        // crossing line runs far faster (measured median 1.6 m/s, 7.5 m/s peak, 3-5 m over
        // the floor with the old 0.10 rad inward aim and 0.9 rad trail). A wider inward aim
        // and a smaller phase trail make the crossing a slow drift (~0.4 m/s, under 1 m/s)
        // that stays just above head height (2.0-3.6 m at mid-room). test/sheet.test.mjs
        // measures it on the real Babylon maths; retune against that, not by eye.
        const restYaw = mountSide => (mountSide === 'ceilingRight' ? -0.20 : 0.20);
        this._laserSheetBasePitch = 0.53;
        this._laserSheetBaseYaw = restYaw(leadSide);
        this._laserSheetPitchRange = 0.06;
        this._laserSheetYawRange = 0.12;
        this._laserSheetTrail = 0.5;

        const mounts = this._laserSheetMounts;
        this._laserSheetFollower = null;
        if (mounts && mounts[leadSide]) {
            const lead = mounts[leadSide];
            this.laserSheetSource = lead.housing;
            this.laserAperture = lead.aperture;
            if (this.laserSheet) this.laserSheet.parent = lead.housing;
            if (this.laserSheetHaze) this.laserSheetHaze.parent = lead.housing;

            const fanB = this._laserSheetFanB;
            const followerSide = both ? 'ceilingRight' : null;
            if (followerSide) this._laserSheetFollower = { mount: mounts[followerSide], fan: fanB };
            if (fanB && !both) { fanB.sheet.isVisible = false; fanB.haze.isVisible = false; }

            // A projector that is not emitting parks at its rest aim with a dark slit.
            for (const [mountSide, mount] of Object.entries(mounts)) {
                if (mountSide === leadSide || mountSide === followerSide) continue;
                mount.housing.rotation.x = this._laserSheetBasePitch;
                mount.housing.rotation.y = restYaw(mountSide);
                mount.aperture.material.emissiveColor = this._laserApertureOff;
            }
            if (followerSide) {
                mounts[followerSide].housing.rotation.x = this._laserSheetBasePitch;
                mounts[followerSide].housing.rotation.y = restYaw(followerSide);
            }
        }

        this.laserSheetSource.rotation.x = this._laserSheetBasePitch;
        this.laserSheetSource.rotation.y = this._laserSheetBaseYaw;
    }

    createMirrorBall() {
        // === DRAMATIC MIRROR/DISCO BALL EFFECT ===
        // Professional mirror ball suspended from center truss with dedicated spotlight
        
        // Position: Center of middle truss (x:0, y:8, z:-12)
        const ballPosition = new BABYLON.Vector3(0, 6.5, -12); // Hanging 1.5m below truss
        
        // === MIRROR BALL SPHERE ===
        const mirrorBall = BABYLON.MeshBuilder.CreateSphere("mirrorBall", {
            diameter: 1.2, // Professional club-size mirror ball
            segments: 32   // High detail for reflections
        }, this.scene);
        mirrorBall.position = ballPosition;
        
        // Highly reflective material with FACETED appearance (like real disco balls)
        const mirrorBallMat = new BABYLON.PBRMetallicRoughnessMaterial("mirrorBallMat", this.scene);
        mirrorBallMat.baseColor = new BABYLON.Color3(0.95, 0.95, 0.95); // Bright silver
        mirrorBallMat.metallic = 1.0;  // Fully metallic
        mirrorBallMat.roughness = 0.15; // Increased roughness for faceted mirror appearance (was 0.05)
        mirrorBallMat.reflectivityColor = new BABYLON.Color3(1, 1, 1);
        mirrorBallMat.maxSimultaneousLights = this.maxLights;

        // VR FIX: a pure-metallic surface only renders via environment reflection,
        // and VR drops scene.environmentIntensity to 0.15 (vs 0.5 desktop), making
        // the ball nearly invisible. We give it a faint silver emissive floor so
        // the geometry always has presence, plus we boost the material-level env
        // intensity to compensate for the dimmer scene-level multiplier.
        mirrorBallMat.emissiveColor = new BABYLON.Color3(0.12, 0.12, 0.14);
        mirrorBallMat.environmentIntensity = 6.0; // was 1.8 — compensates for VR's dim scene env

        // Use environment reflection for realistic mirror effect
        if (this.scene.environmentTexture) {
            // (intensity already set above; kept for clarity if env texture loads later)
            mirrorBallMat.environmentIntensity = 6.0;
        }
        
        // Add bump map for faceted appearance (using vertex normals)
        // This makes it look like many small square mirrors instead of one smooth sphere
        mirrorBall.convertToFlatShadedMesh(); // Creates hard edges between faces = disco ball facets!
        
        mirrorBall.material = mirrorBallMat;
        mirrorBall.isPickable = false;
        
        // === HANGING CABLE/CHAIN ===
        const cable = BABYLON.MeshBuilder.CreateCylinder("mirrorBallCable", {
            diameter: 0.02,
            height: 1.5, // Distance from truss to ball
            tessellation: 8
        }, this.scene);
        cable.position = new BABYLON.Vector3(0, 7.25, -12); // Midpoint between truss and ball
        
        const cableMat = this.materialFactory.createPBRMaterial("cableMat", {
            baseColor: [0.1, 0.1, 0.1],
            metallic: 0.7,
            roughness: 0.4
        });
        cable.material = cableMat;
        cable.isPickable = false;
        // UPGRADE: Freeze static cable
        cable.freezeWorldMatrix();
        cable.doNotSyncBoundingInfo = true;
        
        // === MULTIPLE VISUAL SPOTLIGHTS FOR MIRROR BALL ===
        // These remain emissive optics only. Enabling a real SpotLight when the cue starts
        // changes the light UBO layout after static PBR materials have been frozen, which
        // invalidates unrelated avatar, DJ and truss draws on WebGL. Surface spots and the
        // fixture-driven ambient bounce provide the reflected illumination instead.
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        
        // UPGRADE: Create shared gradient texture for all mirror ball beams (was 4 separate 512px textures)
        if (!this._mirrorBeamGradientTexture) {
            const mbGradTex = new BABYLON.DynamicTexture("sharedMirrorBeamGradient", { width: 256, height: 256 }, this.scene);
            const mbCtx = mbGradTex.getContext();
            const mbGrad = mbCtx.createRadialGradient(128, 128, 25, 128, 128, 128);
            mbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            mbGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
            mbGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
            mbGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.1)');
            mbGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            mbCtx.fillStyle = mbGrad;
            mbCtx.fillRect(0, 0, 256, 256);
            mbGradTex.update();
            mbGradTex.hasAlpha = true;
            this._mirrorBeamGradientTexture = mbGradTex;
        }
        
        // UPGRADE: Share housing materials across all 4 mirror ball fixtures
        const sharedMirrorHousingMat = new BABYLON.PBRMetallicRoughnessMaterial("sharedMirrorHousingMat", this.scene);
        sharedMirrorHousingMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        sharedMirrorHousingMat.metallic = 0.85;
        sharedMirrorHousingMat.roughness = 0.3;
        sharedMirrorHousingMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        sharedMirrorHousingMat.maxSimultaneousLights = this.maxLights;
        
        const sharedMirrorBezelMat = new BABYLON.PBRMetallicRoughnessMaterial("sharedMirrorBezelMat", this.scene);
        sharedMirrorBezelMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        sharedMirrorBezelMat.metallic = 0.95;
        sharedMirrorBezelMat.roughness = 0.15;
        sharedMirrorBezelMat.maxSimultaneousLights = this.maxLights;
        
        const spotlightConfigs = [
            { pos: new BABYLON.Vector3(4, 7.5, -8), name: "Front-Right" },
            { pos: new BABYLON.Vector3(-4, 7.5, -8), name: "Front-Left" },
            { pos: new BABYLON.Vector3(4, 7.5, -16), name: "Back-Right" },
            { pos: new BABYLON.Vector3(-4, 7.5, -16), name: "Back-Left" }
        ];
        
        spotlightConfigs.forEach((config, index) => {
            const direction = ballPosition.subtract(config.pos).normalize();
            
            this.mirrorBallSpotlights.push(null);
            
            // === HYPERREALISTIC MOVING HEAD FIXTURE (Professional Stage Light) ===
            const housingDirection = ballPosition.subtract(config.pos).normalize();
            const targetQuat = BABYLON.Quaternion.FromLookDirectionLH(housingDirection, BABYLON.Vector3.Up());
            
            // Base/Yoke mount (connects to truss) - Professional design
            const base = BABYLON.MeshBuilder.CreateBox(`mirrorFixtureBase${index}`, {
                width: 0.5,
                height: 0.2,
                depth: 0.4
            }, this.scene);
            base.position = config.pos.clone();
            base.rotationQuaternion = targetQuat;
            
            const baseMat = this.materialFactory.getPreset('lightFixture');
            base.material = baseMat;
            base.isPickable = false;
            
            // Main fixture body (cylindrical housing) - Professional moving head
            const housing = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotHousing${index}`, {
                diameter: 0.5,
                height: 0.7,
                tessellation: 24
            }, this.scene);
            housing.position = config.pos.add(housingDirection.scale(0.1)); // Slight offset forward
            housing.rotationQuaternion = targetQuat;
            
            // UPGRADE: Use shared housing material instead of per-fixture instances
            housing.material = sharedMirrorHousingMat;
            housing.isPickable = false;
            
            // Front bezel/rim (chrome ring around lens)
            const bezel = BABYLON.MeshBuilder.CreateTorus(`mirrorBezel${index}`, {
                diameter: 0.45,
                thickness: 0.05,
                tessellation: 32
            }, this.scene);
            bezel.position = config.pos.add(housingDirection.scale(0.4));
            bezel.rotationQuaternion = targetQuat;
            
            // UPGRADE: Use shared bezel material
            bezel.material = sharedMirrorBezelMat;
            bezel.isPickable = false;
            
            // Lens (glass front element) - Cylindrical lens shape
            const lens = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotLens${index}`, {
                diameter: 0.4,
                height: 0.1,
                tessellation: 32
            }, this.scene);
            lens.position = config.pos.add(housingDirection.scale(0.38)); // Inside bezel
            lens.rotationQuaternion = targetQuat;
            
            const lensMat = new BABYLON.StandardMaterial(`mirrorLensMat${index}`, this.scene);
            lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow with color when active
            lensMat.disableLighting = true;
            lensMat.backFaceCulling = false;
            lens.material = lensMat;
            lens.renderingGroupId = 2;
            lens.isPickable = false;
            
            // Bright light source (visible bulb/LED)
            const lightSource = BABYLON.MeshBuilder.CreateSphere(`mirrorLightSource${index}`, {
                diameter: 0.35,
                segments: 16
            }, this.scene);
            lightSource.position = config.pos.add(housingDirection.scale(0.38));
            
            const sourceMat = new BABYLON.StandardMaterial(`mirrorSourceMat${index}`, this.scene);
            sourceMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow bright when active
            sourceMat.disableLighting = true;
            sourceMat.backFaceCulling = false;
            lightSource.material = sourceMat;
            lightSource.renderingGroupId = 2;
            lightSource.isPickable = false;
            
            // Lens flare (glass reflection effect)
            const flare = BABYLON.MeshBuilder.CreateDisc(`mirrorFlare${index}`, {
                radius: 0.25,
                tessellation: 32
            }, this.scene);
            flare.position = config.pos.add(housingDirection.scale(0.42)); // Slightly in front
            flare.rotationQuaternion = targetQuat;
            
            const flareMat = new BABYLON.StandardMaterial(`mirrorFlareMat${index}`, this.scene);
            flareMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow when active
            flareMat.alpha = 0.4;
            flareMat.disableLighting = true;
            flareMat.backFaceCulling = false;
            flare.material = flareMat;
            flare.renderingGroupId = 2;
            flare.isPickable = false;

            if (this.glowLayer) {
                this.glowLayer.addIncludedOnlyMesh(lens);
                this.glowLayer.addIncludedOnlyMesh(lightSource);
                this.glowLayer.addIncludedOnlyMesh(flare);
            }
            
            this.mirrorBallHousings.push({ 
                mesh: housing, 
                material: sharedMirrorHousingMat,
                base: base,
                bezel: bezel,
                lens: lens,
                lensMaterial: lensMat,
                lightSource: lightSource,
                sourceMaterial: sourceMat,
                flare: flare,
                flareMaterial: flareMat
            });
            
            // Visible volumetric beam from all positions (dramatic effect with HIGH-QUALITY rendering)
            const beamLength = BABYLON.Vector3.Distance(config.pos, ballPosition);
            const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotBeam${index}`, {
                diameterTop: 1.1,
                diameterBottom: 0.18,
                height: beamLength,
                tessellation: 16,
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // Position and rotate beam
            const beamMidpoint = BABYLON.Vector3.Center(config.pos, ballPosition);
            beam.position = beamMidpoint;
            
            const beamRotationAxis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), direction);
            const beamRotationAngle = Math.acos(BABYLON.Vector3.Dot(BABYLON.Vector3.Up(), direction));
            beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(beamRotationAxis, beamRotationAngle);
            
            // === ULTRA-REALISTIC VOLUMETRIC BEAM (same quality as truss spotlights) ===
            // UPGRADE: Use shared gradient texture (was 4 separate 512px DynamicTextures)
            const beamTexture = this._mirrorBeamGradientTexture;
            
            // Use PBR material with gradient texture for professional quality
            const beamMat = new BABYLON.PBRMaterial("mirrorSpotBeamMat" + index, this.scene);
            
            // No base color - pure emission and transparency
            beamMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamMat.metallic = 0;
            beamMat.roughness = 1;
            
            // Apply gradient texture to emissive channel
            beamMat.emissiveTexture = beamTexture;
            beamMat.emissiveColor = this.mirrorBallSpotlightColor.scale(0.6);
            // All four fixtures emit visible incident shafts. Only the first owns a
            // GPU SpotLight; dimming the other beam meshes made three fixtures look off.
            beamMat.emissiveIntensity = 1.35;
            
            // Use gradient as alpha mask for realistic edge softness
            beamMat.opacityTexture = beamTexture;
            beamMat.alpha = 0.07;
            beamMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
            
            // Fresnel effect - more visible from the side
            beamMat.opacityFresnel = new BABYLON.FresnelParameters();
            beamMat.opacityFresnel.leftColor = new BABYLON.Color3(0.15, 0.15, 0.15);
            beamMat.opacityFresnel.rightColor = new BABYLON.Color3(0, 0, 0);
            beamMat.opacityFresnel.bias = 0.2;
            beamMat.opacityFresnel.power = 2;
            
            // Important settings for realism
            beamMat.backFaceCulling = false;
            beamMat.disableLighting = true;
            beamMat.unlit = true;
            
            beam.material = beamMat;
            beam.isPickable = false;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1;
            beam.setEnabled(false);
            
            this.mirrorBallBeams.push({
                mesh: beam,
                material: beamMat,
                texture: beamTexture,
                isIncidentLight: config.isRealLight
            });
            
            // UPGRADE: Freeze static fixture hardware (housing, base, bezel don't animate)
            base.freezeWorldMatrix();
            base.doNotSyncBoundingInfo = true;
            housing.freezeWorldMatrix();
            housing.doNotSyncBoundingInfo = true;
            bezel.freezeWorldMatrix();
            bezel.doNotSyncBoundingInfo = true;
        });
        
        const maxSpots = this.qualityTiers.ultra.mirrorSpots;
        const maxRays = this.qualityTiers.ultra.mirrorRays;

        const spotTexture = new BABYLON.DynamicTexture(
            'mirrorSpotFalloff',
            { width: 64, height: 64 },
            this.scene,
            false
        );
        const spotContext = spotTexture.getContext();
        const spotGradient = spotContext.createRadialGradient(32, 32, 0, 32, 32, 32);
        spotGradient.addColorStop(0, 'rgba(255,255,255,1)');
        spotGradient.addColorStop(0.35, 'rgba(255,255,255,0.9)');
        spotGradient.addColorStop(0.75, 'rgba(255,255,255,0.25)');
        spotGradient.addColorStop(1, 'rgba(255,255,255,0)');
        spotContext.fillStyle = spotGradient;
        spotContext.fillRect(0, 0, 64, 64);
        spotTexture.hasAlpha = true;
        spotTexture.update();
        this._mirrorSpotFalloffTexture = spotTexture;

        const spotMat = new BABYLON.StandardMaterial('sharedMirrorSpotMat', this.scene);
        spotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        spotMat.specularColor = new BABYLON.Color3(0, 0, 0);
        spotMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
        spotMat.alpha = 0.9;
        spotMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        spotMat.opacityTexture = spotTexture;
        spotMat.disableLighting = true;
        spotMat.backFaceCulling = false;
        const spots = BABYLON.MeshBuilder.CreatePlane('mirrorReflectionSpots', { size: 1 }, this.scene);
        spots.material = spotMat;
        spots.isPickable = false;
        spots.alwaysSelectAsActiveMesh = true;
        spots.setEnabled(false);
        const spotMatrices = new Float32Array(maxSpots * 16);
        spots.thinInstanceSetBuffer('matrix', spotMatrices, 16, false);

        const rayMat = new BABYLON.StandardMaterial('sharedMirrorRayMat', this.scene);
        rayMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        rayMat.specularColor = new BABYLON.Color3(0, 0, 0);
        rayMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
        rayMat.alpha = 0.18;
        rayMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        rayMat.opacityTexture = this._mirrorBeamGradientTexture;
        rayMat.disableLighting = true;
        rayMat.backFaceCulling = false;
        const rays = BABYLON.MeshBuilder.CreateCylinder('mirrorOutgoingRays', {
            diameterTop: 0.03,
            diameterBottom: 0.25,
            height: 1,
            tessellation: 4,
            cap: BABYLON.Mesh.NO_CAP
        }, this.scene);
        rays.material = rayMat;
        rays.isPickable = false;
        rays.alwaysSelectAsActiveMesh = true;
        rays.setEnabled(false);
        const rayMatrices = new Float32Array(maxRays * 16);
        rays.thinInstanceSetBuffer('matrix', rayMatrices, 16, false);

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const directions = new Float32Array(maxSpots * 2);
        for (let i = 0; i < maxSpots; i++) {
            directions[i * 2] = goldenAngle * i;
            let latitude = 0.5 / maxSpots;
            let weight = 0.5;
            for (let index = i; index > 0; index = Math.floor(index / 2)) {
                latitude += (index % 2) * weight;
                weight *= 0.5;
            }
            directions[i * 2 + 1] = Math.acos(1 - 2 * latitude);
        }
        this.mirrorReflectionBatch = {
            spots,
            spotMat,
            spotMatrices,
            rays,
            rayMat,
            rayMatrices,
            directions,
            hit: { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
        };
        
        // Store references for animation and color updates
        this.mirrorBall = mirrorBall;
        this.mirrorBallRotation = 0; // Track rotation for animation
        log.info(`✨ Mirror ball reflections batched into two draws (${maxSpots} spots, ${maxRays} rays)`);
    }

    _intersectMirrorRoom(ox, oy, oz, dx, dy, dz, out) {
        const inset = 0.02;
        let t = Infinity;
        let nx = 0, ny = 0, nz = 0;
        const minX = ROOM_BOUNDS.x.min + inset;
        const maxX = ROOM_BOUNDS.x.max - inset;
        const minY = ROOM_BOUNDS.y.min + inset;
        const maxY = ROOM_BOUNDS.y.max - inset;
        const minZ = ROOM_BOUNDS.z.min + inset;
        const maxZ = ROOM_BOUNDS.z.max - inset;
        if (dx > 1e-6) { const k = (maxX - ox) / dx; if (k < t) { t = k; nx = -1; ny = 0; nz = 0; } }
        else if (dx < -1e-6) { const k = (minX - ox) / dx; if (k < t) { t = k; nx = 1; ny = 0; nz = 0; } }
        if (dy > 1e-6) { const k = (maxY - oy) / dy; if (k < t) { t = k; nx = 0; ny = -1; nz = 0; } }
        else if (dy < -1e-6) { const k = (minY - oy) / dy; if (k < t) { t = k; nx = 0; ny = 1; nz = 0; } }
        if (dz > 1e-6) { const k = (maxZ - oz) / dz; if (k < t) { t = k; nx = 0; ny = 0; nz = -1; } }
        else if (dz < -1e-6) { const k = (minZ - oz) / dz; if (k < t) { t = k; nx = 0; ny = 0; nz = 1; } }
        out.t = Number.isFinite(t) && t > 0 ? t : 0;
        out.px = ox + dx * out.t;
        out.py = oy + dy * out.t;
        out.pz = oz + dz * out.t;
        out.nx = nx; out.ny = ny; out.nz = nz;
        return out;
    }

    _writeMirrorSpotMatrix(buf, o, hit, dx, dy, dz, size) {
        const nx = hit.nx, ny = hit.ny, nz = hit.nz;
        const dn = dx * nx + dy * ny + dz * nz;
        let ux = dx - dn * nx, uy = dy - dn * ny, uz = dz - dn * nz;
        let ul = Math.hypot(ux, uy, uz);
        if (ul < 1e-4) {
            ux = Math.abs(ny) > 0.9 ? 1 : 0;
            uy = Math.abs(ny) > 0.9 ? 0 : 1;
            uz = 0;
            ul = 1;
        }
        ux /= ul; uy /= ul; uz /= ul;
        const vx = ny * uz - nz * uy;
        const vy = nz * ux - nx * uz;
        const vz = nx * uy - ny * ux;
        const incidence = Math.abs(dx * nx + dy * ny + dz * nz);
        const stretch = Math.min(2.5, 1 / Math.max(0.4, incidence));
        buf[o] = ux * size * stretch; buf[o + 1] = uy * size * stretch; buf[o + 2] = uz * size * stretch; buf[o + 3] = 0;
        buf[o + 4] = vx * size; buf[o + 5] = vy * size; buf[o + 6] = vz * size; buf[o + 7] = 0;
        buf[o + 8] = -nx; buf[o + 9] = -ny; buf[o + 10] = -nz; buf[o + 11] = 0;
        buf[o + 12] = hit.px + nx * 0.015; buf[o + 13] = hit.py + ny * 0.015; buf[o + 14] = hit.pz + nz * 0.015; buf[o + 15] = 1;
    }

    _writeMirrorRayMatrix(buf, o, ax, ay, az, dx, dy, dz, length) {
        let tx = 0, ty = 1, tz = 0;
        if (Math.abs(dy) >= 0.9) { tx = 1; ty = 0; tz = 0; }
        let xx = ty * dz - tz * dy;
        let xy = tz * dx - tx * dz;
        let xz = tx * dy - ty * dx;
        const xl = Math.hypot(xx, xy, xz) || 1;
        xx /= xl; xy /= xl; xz /= xl;
        const zx = xy * dz - xz * dy;
        const zy = xz * dx - xx * dz;
        const zz = xx * dy - xy * dx;
        buf[o] = xx; buf[o + 1] = xy; buf[o + 2] = xz; buf[o + 3] = 0;
        buf[o + 4] = dx * length; buf[o + 5] = dy * length; buf[o + 6] = dz * length; buf[o + 7] = 0;
        buf[o + 8] = zx; buf[o + 9] = zy; buf[o + 10] = zz; buf[o + 11] = 0;
        buf[o + 12] = ax + dx * length * 0.5; buf[o + 13] = ay + dy * length * 0.5; buf[o + 14] = az + dz * length * 0.5; buf[o + 15] = 1;
    }

    _updateMirrorReflectionBatch() {
        const batch = this.mirrorReflectionBatch;
        if (!batch || !this.mirrorBall) return;
        const spotCount = this.tierSettings.mirrorSpots;
        const rayCount = this.tierSettings.mirrorRays;
        const ox = this.mirrorBall.position.x;
        const oy = this.mirrorBall.position.y;
        const oz = this.mirrorBall.position.z;
        for (let i = 0; i < spotCount; i++) {
            const theta = batch.directions[i * 2] - this.mirrorBallRotation;
            const phi = batch.directions[i * 2 + 1];
            const sinPhi = Math.sin(phi);
            const dx = sinPhi * Math.cos(theta);
            const dy = Math.cos(phi);
            const dz = sinPhi * Math.sin(theta);
            const hit = this._intersectMirrorRoom(ox, oy, oz, dx, dy, dz, batch.hit);
            this._writeMirrorSpotMatrix(batch.spotMatrices, i * 16, hit, dx, dy, dz, 0.24 + (i % 7) * 0.025);
            if (i < rayCount) {
                this._writeMirrorRayMatrix(batch.rayMatrices, i * 16, ox, oy, oz, dx, dy, dz, hit.t);
            }
        }
        batch.spots.thinInstanceCount = spotCount;
        batch.rays.thinInstanceCount = rayCount;
        batch.spots.thinInstanceBufferUpdated('matrix');
        batch.rays.thinInstanceBufferUpdated('matrix');
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));
        this.mirrorBallSpotlightColor.scaleToRef(1.2 * master * (1 + (this.kickPulse || 0) * 0.35), batch.spotMat.emissiveColor);
        this.mirrorBallSpotlightColor.scaleToRef(master, batch.rayMat.emissiveColor);
        const haze = this.smokeActive ? Math.min(1, (this.fogIntensity || 0) / 1.5) : 0;
        batch.rayMat.alpha = 0.06 + 0.18 * haze;
    }
    
    /**
     * Per-frame entry point. Deliberately a thin orchestrator: each fixture
     * family owns its own update method and receives the same frame context,
     * so a change to one system can no longer perturb another by accident.
     */
}
window.VRClubEffects = VRClubEffects;
