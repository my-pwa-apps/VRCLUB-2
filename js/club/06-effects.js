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
        
        // UPGRADE: Create shared beam gradient texture for volumetric beam brightness falloff
        // Simulates realistic light scatter through atmospheric haze:
        // - Bright mid-section (accumulated haze scattering)
        // - Softer near floor (smooth termination, hides hard clip plane edge)
        // - Moderate near fixture (concentrated but less path length)
        // On cylinder UV: V=0 = bottom (fixture/narrow), V=1 = top (floor/wide)
        // On canvas: Y=0 = top (maps to V=1 = floor), Y=H = bottom (maps to V=0 = fixture)
        if (!this._beamGradientTexture) {
            const gradH = 128;
            const gradCanvas = document.createElement('canvas');
            gradCanvas.width = 4;   // Narrow - uniform around circumference
            gradCanvas.height = gradH;
            const gCtx = gradCanvas.getContext('2d');
            
            const beamGrad = gCtx.createLinearGradient(0, 0, 0, gradH);
            // Canvas Y=0 → V=1 (floor/wide end): soft termination
            beamGrad.addColorStop(0.0,  'rgb(0,0,0)');       // V=1.0: vanish at the receiving surface
            beamGrad.addColorStop(0.10, 'rgb(46,46,46)');    // V=0.90: soft atmospheric emergence
            beamGrad.addColorStop(0.28, 'rgb(204,204,204)'); // V=0.72: accumulated haze scatter
            beamGrad.addColorStop(0.45, 'rgb(255,255,255)'); // V=0.55: 100% - peak brightness
            beamGrad.addColorStop(0.65, 'rgb(255,255,255)'); // V=0.35: 100% - sustained peak
            beamGrad.addColorStop(0.85, 'rgb(217,217,217)'); // V=0.15: 85% - near fixture
            beamGrad.addColorStop(1.0,  'rgb(179,179,179)'); // V=0.0: 70% - at fixture lens
            
            gCtx.fillStyle = beamGrad;
            gCtx.fillRect(0, 0, 4, gradH);
            
            this._beamGradientTexture = new BABYLON.DynamicTexture("beamGradient", gradCanvas, this.scene, false);
            this._beamGradientTexture.hasAlpha = false; // RGB only, no alpha channel needed
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
            // UPGRADE: Enable diffuse for projectionTexture gobo patterns on surfaces
            // Diffuse at 15% intensity provides visible gobo patterns without overwhelming scene
            spot.diffuse = this.currentSpotColor.scale(0.15);
            spot.specular = this.currentSpotColor; // Specular for floor reflections
            spot.intensity = 12; // Increased for visibility
            spot.range = 25;

            // The two rear fixtures give the DJ booth and flown speaker stacks
            // grounding shadows. Other moving heads remain shadow-free to cap the
            // render-target count and draw cost.
            if (i === 2 || i === 5) {
                const shadowGenerator = new BABYLON.ShadowGenerator(1024, spot);
                shadowGenerator.bias = 0.0005;
                shadowGenerator.normalBias = 0.02;
            }
            
            // UPGRADE: SpotLight.projectionTexture support (physically correct gobo projection)
            // Near/far define the frustum for texture projection (like shadow mapping)
            spot.projectionTextureLightNear = 0.5;
            spot.projectionTextureLightFar = 25;
            
            spot.setEnabled(false); // Start disabled - will be enabled by animation loop based on lightsActive state
            
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
            
            // UPGRADE: Beam gradient texture for distance-based brightness falloff
            // On a cylinder, V=0 at bottom (fixture/narrow), V=1 at top (floor/wide)
            // Canvas Y=0 → V=1 (floor), Canvas Y=height → V=0 (fixture)
            // This gives realistic light scatter: brighter mid-beam (haze accumulation),
            // softer at floor (smooth termination instead of hard clip), moderate at fixture
            if (this._beamGradientTexture) {
                beamMat.emissiveTexture = this._beamGradientTexture;
            }
            
            // UPGRADE: Share one noise texture across all spotlight beams (was 6 separate GPU textures)
            if (!this._spotBeamNoiseTexture) {
                this._spotBeamNoiseTexture = new BABYLON.NoiseProceduralTexture("sharedBeamNoise", 128, this.scene);
                this._spotBeamNoiseTexture.animationSpeedFactor = 0.6;
                this._spotBeamNoiseTexture.persistence = 0.35;
                this._spotBeamNoiseTexture.brightness = 0.55;
                this._spotBeamNoiseTexture.octaves = 4;
            }
            beamMat.opacityTexture = this._spotBeamNoiseTexture; // Shared noise for smoke particles
            
            beamMat.alpha = 0.18; // Base alpha (will be dynamically adjusted in render loop)
            beamMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE; // Standard alpha blending respects depth
            beamMat.backFaceCulling = false; // Visible from all angles
            beamMat.disableLighting = true; // Self-illuminated
            beamMat.useAlphaFromDiffuseTexture = false;
            beamMat.opacityFresnelParameters = new BABYLON.FresnelParameters();
            beamMat.opacityFresnelParameters.leftColor = new BABYLON.Color3(0.08, 0.08, 0.08);
            beamMat.opacityFresnelParameters.rightColor = new BABYLON.Color3(0, 0, 0);
            beamMat.opacityFresnelParameters.bias = 0.05;
            beamMat.opacityFresnelParameters.power = 2.5;
            
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
                lightSource: fixtureData ? fixtureData.lightSource : null,
                bezel: fixtureData ? fixtureData.bezel : null,
                flare: fixtureData ? fixtureData.flare : null,
                lensMat: fixtureData ? fixtureData.lensMat : null,
                sourceMat: fixtureData ? fixtureData.sourceMat : null,
                flareMat: fixtureData ? fixtureData.flareMat : null,
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

    // Blinders removed - strobes provide sufficient impact lighting

    createLaserSheet() {
        // === LASER SHEET EFFECT ===
        // Single source fan from LED wall scanning the room
        // Hyperrealistic implementation: Triangle fan geometry with smoke texture
        
        // 1. Create the Source/Projector Housing
        // Positioned high on the room side of the back wall, centered
        // Height 5.5m clears the DJ booth and hits the dancefloor nicely
        const sourcePos = new BABYLON.Vector3(0, 5.5, -20.6);
        
        this.laserSheetSource = BABYLON.MeshBuilder.CreateBox("laserSheetSource", {
            width: 0.5, height: 0.2, depth: 0.4
        }, this.scene);
        this.laserSheetSource.position = sourcePos;
        this.laserSheetSource.material = this.materialFactory.getPreset('cdjBody'); // Dark metal
        
        // Aperture (Glowing slit)
        this.laserAperture = BABYLON.MeshBuilder.CreateBox("laserSheetAperture", {
            width: 0.4, height: 0.05, depth: 0.02
        }, this.scene);
        this.laserAperture.parent = this.laserSheetSource;
        this.laserAperture.position.z = 0.21; // Front face
        
        const apertureMat = new BABYLON.StandardMaterial("apertureMat", this.scene);
        apertureMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
        apertureMat.disableLighting = true;
        this.laserAperture.material = apertureMat;
        
        // 2. Create the Laser Sheet Geometry (Triangle Fan)
        // We create a custom mesh for the fan shape
        const sheet = new BABYLON.Mesh("laserSheet", this.scene);
        
        // Fan dimensions
        const length = 45; // Reach across the room
        const widthEnd = 35; // Wide spread at the end
        
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
        sheetMat.alpha = 0.18;
        sheetMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        sheetMat.backFaceCulling = false;
        sheetMat.disableDepthWrite = true;
        
        // Procedural noise for smoke movement
        const noiseTexture = new BABYLON.NoiseProceduralTexture("laserSheetNoise", 256, this.scene); // OPTIMIZED: Reduced from 512
        noiseTexture.octaves = 4;
        noiseTexture.persistence = 0.8; // Smoky detail
        noiseTexture.animationSpeedFactor = 0.5;
        noiseTexture.brightness = 0.5;
        noiseTexture.contrast = 2.0; // Defined smoke wisps
        
        sheetMat.opacityTexture = noiseTexture;
        sheetMat.emissiveTexture = noiseTexture; // Texture the light itself
        
        sheet.material = sheetMat;
        this.laserSheet = sheet;
        
        // 4. Light Source (Actual light projection) - DISABLED for performance
        // DISABLED: Laser sheet SpotLight adds to uniform buffer count
        // Visual effect from emissive laser sheet mesh is sufficient
        this.laserLight = null; // Disabled - visual sheet provides the effect
        
        // Remove old fan if it exists (cleanup)
        this.laserFan = null;
        
        // Add to glow layer for bloom effect
        if (this.glowLayer) {
            this.glowLayer.addIncludedOnlyMesh(this.laserSheet);
            this.glowLayer.addIncludedOnlyMesh(this.laserAperture);
        }
        
        log.info('✨ Laser sheet effect created with hyperrealistic source');
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
        
        // === MULTIPLE SPOTLIGHTS FOR MIRROR BALL (Professional disco ball setup) ===
        // Strategy: Use 1 main spotlight + visual beams from multiple angles
        // Why: GPU uniform buffer limits prevent multiple real SpotLights with PBR materials
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
            { pos: new BABYLON.Vector3(4, 7.5, -8), name: "Front-Right", isRealLight: true },  // Only this one is a real light
            { pos: new BABYLON.Vector3(-4, 7.5, -8), name: "Front-Left", isRealLight: false }, // Visual only
            { pos: new BABYLON.Vector3(4, 7.5, -16), name: "Back-Right", isRealLight: false }, // Visual only - cross pattern
            { pos: new BABYLON.Vector3(-4, 7.5, -16), name: "Back-Left", isRealLight: false }  // Visual only - cross pattern
        ];
        
        spotlightConfigs.forEach((config, index) => {
            const direction = ballPosition.subtract(config.pos).normalize();
            
            // Create real spotlight only for the main one
            if (config.isRealLight) {
                const spotlight = new BABYLON.SpotLight(
                    `mirrorBallSpotlight${index}`,
                    config.pos,
                    direction,
                    Math.PI / 6,  // Wider beam to cover ball from one angle
                    8,            // Softer falloff
                    this.scene
                );
                spotlight.diffuse = this.mirrorBallSpotlightColor.clone();
                spotlight.intensity = 150; // Very bright since it's the only real light
                spotlight.range = 35;
                spotlight.setEnabled(false);
                this.mirrorBallSpotlights.push(spotlight);
            } else {
                // Fake spotlight (visual only, no actual light)
                this.mirrorBallSpotlights.push(null);
            }
            
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
        
        // === OUTGOING RAYS FROM MIRROR BALL (Hyperrealistic all-direction light rays) ===
        // These are the visible light rays emanating FROM the ball in all directions
        // Real disco balls reflect light to ceiling, walls, floor - creating a sphere of rays
        this.mirrorBallOutgoingRays = [];
        const numRays = 24;
        
        for (let i = 0; i < numRays; i++) {
            // Distribute rays evenly using golden angle spiral on a sphere
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
            const theta = goldenAngle * i;
            const phi = Math.acos(1 - 2 * (i + 0.5) / numRays); // Uniform sphere distribution
            
            // Calculate ray direction in spherical coordinates
            const dirX = Math.sin(phi) * Math.cos(theta);
            const dirY = Math.cos(phi); // Goes up AND down
            const dirZ = Math.sin(phi) * Math.sin(theta);
            
            // Deterministic variation prevents the rig changing on every reload.
            const rayLength = 7 + ((i * 7) % 9);
            
            // Create ray cylinder from ball position
            const ray = BABYLON.MeshBuilder.CreateCylinder(`mirrorOutgoingRay${i}`, {
                diameterTop: 0.008,
                diameterBottom: 0.045,
                height: rayLength,
                tessellation: 4
            }, this.scene);
            
            // Position at ball and orient along direction
            ray.position = ballPosition.clone();
            
            // Calculate rotation to point along direction
            // Cylinder default is Y-up, so we need to rotate it to point along our direction
            const up = new BABYLON.Vector3(0, 1, 0);
            const dir = new BABYLON.Vector3(dirX, dirY, dirZ);
            
            // Create rotation from default up to desired direction
            const angle = Math.acos(BABYLON.Vector3.Dot(up, dir));
            const axis = BABYLON.Vector3.Cross(up, dir);
            if (axis.length() > 0.001) {
                ray.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);
            }
            
            // Offset position so ray starts at ball surface, not center
            ray.position = ballPosition.add(dir.scale(rayLength / 2 + 0.6)); // 0.6m = ball radius
            
            // UPGRADE: Share 1 material for all 40 rays (was 40 unique but identical materials)
            // Per-ray alpha variation handled via mesh.visibility instead of material.alpha
            if (!this._sharedMirrorRayMat) {
                this._sharedMirrorRayMat = new BABYLON.StandardMaterial('sharedMirrorRayMat', this.scene);
                this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                this._sharedMirrorRayMat.alpha = 1.0; // Controlled per-ray via mesh.visibility
                this._sharedMirrorRayMat.opacityTexture = this._mirrorBeamGradientTexture;
                this._sharedMirrorRayMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
                this._sharedMirrorRayMat.disableLighting = true;
                this._sharedMirrorRayMat.backFaceCulling = false;
                this._sharedMirrorRayMat.freeze();
            }
            ray.material = this._sharedMirrorRayMat;
            ray.visibility = 0.04 + (i % 5) * 0.008;
            ray.isPickable = false;
            ray.setEnabled(false); // Starts disabled
            
            this.mirrorBallOutgoingRays.push({
                mesh: ray,
                material: this._sharedMirrorRayMat,
                theta: theta,
                phi: phi,
                length: rayLength,
                direction: dir.clone(),
                rotationSpeed: 0.3 + Math.random() * 0.4 // Individual rotation speeds
            });
        }
        
        log.info(`✨ Created ${numRays} outgoing rays from mirror ball (all directions)`);
        
        // === REFLECTION SPOTS (Simulated light spots from mirror facets) ===
        // VISUAL ONLY - No actual PointLights to stay within GPU uniform buffer limits
        // These are purely emissive meshes that create the illusion of reflections
        this.mirrorReflectionSpots = [];
        const numSpots = 100; // Reduced from 300 for VR performance
        
        // PRE-DISTRIBUTE spots across surfaces for guaranteed even coverage
        // Weight distribution to emphasize walls and ceiling (more visible in VR)
        const floorSpots = Math.floor(numSpots * 0.20);     // 20% on floor
        const ceilingSpots = Math.floor(numSpots * 0.20);   // 20% on ceiling
        const wallSpots = Math.floor(numSpots * 0.15);      // 15% per wall (4 walls = 60%)
        let spotIndex = 0;
        
        // One radial alpha mask gives every reflected facet a soft optical falloff
        // instead of a hard-edged emissive polygon.
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
        
        const surfaces = [
            { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02, count: floorSpots },
            { name: 'ceiling', axis: 'xz', fixed: 'y', value: 9.83, count: ceilingSpots },
            { name: 'leftWall', axis: 'yz', fixed: 'x', value: -16.73, count: wallSpots },
            { name: 'rightWall', axis: 'yz', fixed: 'x', value: 16.73, count: wallSpots },
            { name: 'backWall', axis: 'xy', fixed: 'z', value: -26.73, count: wallSpots },
            { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.77, count: wallSpots }
        ];
        
        surfaces.forEach(surface => {
            for (let i = 0; i < surface.count; i++, spotIndex++) {
                // Visual spot (emissive disc - looks like light reflection)
                const spot = BABYLON.MeshBuilder.CreateDisc(`mirrorSpot${spotIndex}`, {
                    radius: 0.12 + Math.random() * 0.12, // Size: 0.12-0.24m 
                    tessellation: 8
                }, this.scene);
                
                const spotMat = new BABYLON.StandardMaterial(`mirrorSpotMat${spotIndex}`, this.scene);
                spotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
                spotMat.specularColor = new BABYLON.Color3(0, 0, 0);
                spotMat.emissiveColor = this.mirrorBallSpotlightColor.clone(); // Initial color - updated every frame in animation loop
                spotMat.alpha = 0.85; // High visibility
                spotMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light
                spotMat.opacityTexture = spotTexture;
                spotMat.disableLighting = true;
                spotMat.backFaceCulling = false; // Visible from both sides
                spot.material = spotMat;
                spot.isPickable = false;
                spot.setEnabled(false);
                
                // Create VOLUMETRIC BEAM for this spot (light cutting through smoke)
                // Thin cylinder stretching from ball to spot - HYPERREALISTIC light rays
                const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorBeam${spotIndex}`, {
                    diameterTop: 0.03,    // Thin at ball (light source)
                    diameterBottom: 0.25, // Wider at spot (light spread)
                    height: 1.0,          // Initial height (will be scaled)
                    tessellation: 4       // Low poly for performance (hundreds of beams)
                }, this.scene);
                
                // Pivot at top (ball position) so we can scale length easily
                beam.setPivotPoint(new BABYLON.Vector3(0, 0.5, 0)); 
                
                // UPGRADE: Share 1 beam material for all 100 reflection beams (was 100 unique)
                // Per-beam alpha handled via mesh.visibility
                if (!this._sharedMirrorBeamMat) {
                    this._sharedMirrorBeamMat = new BABYLON.StandardMaterial('sharedMirrorBeamMat', this.scene);
                    this._sharedMirrorBeamMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                    this._sharedMirrorBeamMat.alpha = 1.0;
                    this._sharedMirrorBeamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
                    this._sharedMirrorBeamMat.disableLighting = true;
                    this._sharedMirrorBeamMat.backFaceCulling = false;
                    this._sharedMirrorBeamMat.freeze();
                }
                beam.material = this._sharedMirrorBeamMat;
                beam.visibility = 0.2; // Default visibility, updated per-frame
                beam.isPickable = false;
                beam.setEnabled(false);
                
                // Generate random position on this surface
                let targetPos, normal;
                
                if (surface.axis === 'xz') { // Floor or ceiling
                    targetPos = new BABYLON.Vector3(
                        -17 + Math.random() * 34,  // x: -17 to +17 (full room width)
                        surface.value,
                        -27 + Math.random() * 29   // z: -27 to +2 (full room depth)
                    );
                    normal = surface.name === 'floor' ? 
                        new BABYLON.Vector3(0, 1, 0) : 
                        new BABYLON.Vector3(0, -1, 0);
                        
                } else if (surface.axis === 'yz') { // Left or right wall
                    targetPos = new BABYLON.Vector3(
                        surface.value,
                        0.2 + Math.random() * 9.6,  // y: 0.2 to 9.8 (full wall height)
                        -27 + Math.random() * 29    // z: -27 to +2 (full wall depth)
                    );
                    normal = surface.name === 'leftWall' ? 
                        new BABYLON.Vector3(1, 0, 0) : 
                        new BABYLON.Vector3(-1, 0, 0);
                        
                } else { // Back or front wall (xy)
                    targetPos = new BABYLON.Vector3(
                        -17 + Math.random() * 34,  // x: -17 to +17 (full wall width)
                        0.2 + Math.random() * 9.6,  // y: 0.2 to 9.8 (full wall height)
                        surface.value
                    );
                    normal = surface.name === 'backWall' ? 
                        new BABYLON.Vector3(0, 0, 1) : 
                        new BABYLON.Vector3(0, 0, -1);
                }
                
                spot.position = targetPos;
                
                // Calculate direction from ball to spot (for animation)
                const ballPos = new BABYLON.Vector3(0, 6.5, -12);
                const directionFromBall = targetPos.subtract(ballPos).normalize();
                
                // Convert to spherical coordinates for rotation
                const distance = BABYLON.Vector3.Distance(targetPos, ballPos);
                const theta = Math.atan2(directionFromBall.z, directionFromBall.x);
                const phi = Math.acos(directionFromBall.y);
                
                this.mirrorReflectionSpots.push({
                    visual: spot,
                    beam: beam, // Store beam reference
                    material: spotMat,
                    beamMaterial: this._sharedMirrorBeamMat,
                    surface: surface.name,
                    surfaceNormal: normal,
                    targetPosition: targetPos.clone(),
                    theta: theta,
                    phi: phi,
                    distance: distance,
                    thetaSpeed: (Math.random() - 0.5) * 0.8,  // Rotation speed
                    phiSpeed: (Math.random() - 0.5) * 0.5,
                    baseIntensity: 0.5 + Math.random() * 0.7,
                    twinkleSpeed: 2 + Math.random() * 4,
                    twinklePhase: Math.random() * Math.PI * 2,
                    previousPosition: targetPos.clone(), // Track previous position for smooth interpolation
                    previousHitMesh: null // Track which mesh was hit last frame
                });
            }
        });
        
        log.info(`✨ Created ${this.mirrorReflectionSpots.length} reflection spots across 6 surfaces (floor, ceiling, 4 walls)`);
        
        // Store references for animation and color updates
        this.mirrorBall = mirrorBall;
        this.mirrorBallRotation = 0; // Track rotation for animation
        this.spotUpdateFrameCounter = 0; // Frame counter for synchronized updates
        
        // PERFORMANCE: Cache ray picking predicate (avoid creating new function every ray cast)
        // CRITICAL: Only accept REAL ROOM SURFACES - floor, walls, ceiling, pillars, truss
        // Reject everything else to prevent reflection spots floating in mid-air
        this.mirrorBallRayPredicate = (mesh) => {
            // Structural scenery is intentionally non-pickable for controller input,
            // but it must still receive optical ray casts from the mirror ball.
            if (!mesh.isEnabled()) return false;
            if (!mesh.isVisible) return false;
            
            const name = mesh.name.toLowerCase();
            
            // WHITELIST APPROACH: Only accept known room surfaces
            // This prevents spots appearing on invisible/transparent objects
            const validSurfaces = [
                'floor', 'ground', 'dancefloor',
                'wall', 'backwall', 'sidewall', 'frontwall',
                'ceiling',
                'pillar', 'column',
                'truss', 'beam',  // Structural beams, not light beams
                'stage', 'platform', 'booth',
                'bar', 'counter',
                'brick', 'concrete'
            ];
            
            // Check if mesh name contains any valid surface keyword
            for (const surface of validSurfaces) {
                if (name.includes(surface)) {
                    // Double-check it's not a light beam or effect
                    if (name.includes('light') || name.includes('spot') || 
                        name.includes('laser') || name.includes('glow') ||
                        name.includes('led') || name.includes('pool')) {
                        return false;
                    }
                    return true;
                }
            }
            
            // Reject everything else (avatars, NPCs, effects, UI, etc.)
            return false;
        };
        
        // PERFORMANCE: Pre-create reusable Ray object (avoid allocating new Ray every frame)
        // Initialize with mirror ball position (0, 6.5, -12)
        const mirrorBallPos = new BABYLON.Vector3(0, 6.5, -12);
        this.mirrorBallRay = new BABYLON.Ray(mirrorBallPos, new BABYLON.Vector3(0, 0, 1), 30);
        
        log.info('✨ Mirror ball created with 3 dramatic spotlights from multiple angles');
    }
    
    /**
     * Per-frame entry point. Deliberately a thin orchestrator: each fixture
     * family owns its own update method and receives the same frame context,
     * so a change to one system can no longer perturb another by accident.
     */
}
window.VRClubEffects = VRClubEffects;
