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
            this.currentSpotColor = spotColors[0];
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
        this.currentSpotColor = spotColors[0];
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
            beamGrad.addColorStop(0.0,  'rgb(77,77,77)');    // V=1.0: 30% - soft fade at floor
            beamGrad.addColorStop(0.08, 'rgb(128,128,128)'); // V=0.92: 50% - quickening
            beamGrad.addColorStop(0.25, 'rgb(230,230,230)'); // V=0.75: 90% - entering mid zone
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
            
            // CRITICAL: Beam must respect depth buffer to NOT render through NPCs
            // ALPHA_COMBINE properly discards fragments behind opaque geometry
            beamMat.disableDepthWrite = true; // Don't write to depth (transparent object)
            beamMat.separateCullingPass = false;
            beamMat.needDepthPrePass = false;
            beamMat.zOffset = -2; // Ensure beam renders slightly behind at equal depth
            
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