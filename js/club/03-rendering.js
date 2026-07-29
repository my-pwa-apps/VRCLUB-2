class VRClubRendering extends VRClubLifecycle {
    addPostProcessing() {
        // Prevent duplicate pipelines
        if (this.renderPipeline) {
            return;
        }

        const desktop = this.vrSettings.desktop;
        const tier = this.tierSettings;

        // Create ENHANCED rendering pipeline for hyperrealistic cinematic effects
        // Pass cameras array in constructor to avoid "reuse" warnings from addCamera()
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true, // HDR enabled for better color range
            this.scene,
            this.camera ? [this.camera] : [] // Pass camera array directly
        );
        
        // FXAA anti-aliasing for smooth edges (essential for immersion)
        pipeline.fxaaEnabled = desktop.fxaaEnabled;

        // MSAA on the pipeline render target. FXAA alone leaves crawling edges on the
        // thin truss/pipe geometry that fills the ceiling; MSAA resolves the geometric
        // edges and FXAA then cleans up the shader aliasing on emissive surfaces.
        pipeline.samples = tier.pipelineSamples;
        
        // ENHANCED Bloom for dramatic glowing lights - key to club atmosphere
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = desktop.bloomThreshold;
        pipeline.bloomWeight = desktop.bloomWeight;
        pipeline.bloomKernel = tier.bloomKernel; // Wide kernel = smooth cinematic halos
        pipeline.bloomScale = desktop.bloomScale;
        
        // Chromatic aberration for realistic camera lens simulation (desktop only)
        pipeline.chromaticAberrationEnabled = desktop.chromaticAberrationEnabled;
        if (pipeline.chromaticAberration) {
            pipeline.chromaticAberration.aberrationAmount = 8;     // Subtle color fringing at edges
            pipeline.chromaticAberration.radialIntensity = 0.6;    // Concentrated at edges (lens-like)
        }
        
        // Film grain for cinematic texture (desktop only)
        pipeline.grainEnabled = desktop.grainEnabled;
        if (pipeline.grain) {
            pipeline.grain.intensity = 3;         // Very subtle grain
            pipeline.grain.animated = true;       // Animated for film-like feel
        }
        
        // Sharpen for crystal-clear details
        pipeline.sharpenEnabled = true;
        pipeline.sharpen.edgeAmount = 0.35; // Crisp edge definition
        pipeline.sharpen.colorAmount = desktop.sharpenAmount;
        
        // ENHANCED Image processing for cinematic depth
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.contrast = desktop.contrast;
        pipeline.imageProcessing.exposure = desktop.exposure;
        pipeline.imageProcessing.toneMappingEnabled = desktop.toneMappingEnabled;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;

        // DITHERING — the single highest-value fix for a dark scene.
        // This club is almost entirely smooth gradients falling off into near-black.
        // In 8-bit output those gradients quantise into visible concentric "contour"
        // bands around every light pool, which instantly reads as computer graphics.
        // Dithering adds sub-LSB noise that breaks the banding up completely.
        if ('ditheringEnabled' in pipeline.imageProcessing) {
            pipeline.imageProcessing.ditheringEnabled = true;
            pipeline.imageProcessing.ditheringIntensity = 1.0 / 255.0;
        }
        
        // Cinematic vignette - darkens edges for immersive club atmosphere
        pipeline.imageProcessing.vignetteEnabled = true;
        pipeline.imageProcessing.vignetteWeight = 2.2;          // Stronger edge darkening for club feel
        pipeline.imageProcessing.vignetteStretch = 0.4;         // Tighter vignette
        pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0.02, 0); // Subtle blue-black edge
        pipeline.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
        
        // Optional: Depth of Field for camera focus effect (disabled by default for VR compatibility)
        pipeline.depthOfFieldEnabled = false;
        
        // Store pipeline for VR/desktop switching
        this.renderPipeline = pipeline;

        // SSAO 2 Pipeline (Screen Space Ambient Occlusion) - Adds realistic contact shadows
        // ONLY for desktop mode (too expensive for standalone VR)
        // Adds depth to corners and contact points for hyperrealism
        // Note: Pass camera in constructor - don't call attachCamerasToRenderPipeline again (causes reuse warnings)
        this.ssaoPipeline = new BABYLON.SSAO2RenderingPipeline("ssao", this.scene, 0.75, this.camera ? [this.camera] : []);
        this.ssaoPipeline.radius = 3.5;
        this.ssaoPipeline.totalStrength = 1.2;
        this.ssaoPipeline.expensiveBlur = tier.ssaoExpensiveBlur;
        this.ssaoPipeline.samples = tier.ssaoSamples;
        this.ssaoPipeline.maxZ = 250;

        // Heavy tier-gated effects.
        this._createScreenSpaceReflections();
        this._createMotionBlur();
        
        log.info(`✨ Post-processing initialized (hyperrealistic mode, tier: ${this.graphicsTier})`);
    }

    /**
     * Re-apply the current tier's values to an already-built pipeline.
     * Used by setGraphicsTier() so the tier can change without a page reload.
     */
    _applyTierToPipeline() {
        const tier = this.tierSettings;
        if (this.renderPipeline) {
            this.renderPipeline.samples = tier.pipelineSamples;
            this.renderPipeline.bloomKernel = tier.bloomKernel;
        }
        if (this.ssaoPipeline) {
            this.ssaoPipeline.samples = tier.ssaoSamples;
            this.ssaoPipeline.expensiveBlur = tier.ssaoExpensiveBlur;
        }
    }

    /**
     * Screen-space reflections.
     *
     * This is the biggest single realism upgrade available to this scene. A real
     * nightclub floor is polished and slightly damp, and almost everything you read as
     * "expensive lighting" in a club photograph is actually the *reflection* of that
     * lighting in the floor. A static reflection probe (which is what the floor used
     * before) can only capture the room geometry once — it cannot reflect the moving
     * spotlight pools, the sweeping lasers, the strobes or the animated LED wall,
     * which is precisely the content that matters here.
     *
     * SSR reflects the live rendered frame, so every moving light shows up in the floor.
     * Desktop only, and only above the 'balanced' tier — it requires WebGL2 and costs
     * real milliseconds.
     */
    _createScreenSpaceReflections() {
        if (this.ssrPipeline) return;
        if (!this.tierSettings.ssr) return;
        if (!BABYLON.SSRRenderingPipeline) {
            log.warn('⚠️ SSRRenderingPipeline unavailable in this Babylon build - skipping reflections');
            return;
        }
        if (this.engine.webGLVersion < 2) {
            log.warn('⚠️ SSR requires WebGL2 - skipping reflections');
            return;
        }

        try {
            // forceGeometryBuffer = false → use the pre-pass renderer (cheaper and more
            // accurate reflectivity). Per Babylon docs, pre-pass + MSAA can produce
            // artifacts, so anti-aliasing on the SSR path relies on FXAA, which is
            // already enabled in the default pipeline.
            const ssr = new BABYLON.SSRRenderingPipeline(
                'ssr',
                this.scene,
                this.camera ? [this.camera] : [],
                false,
                BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE
            );

            const highQuality = this.tierSettings.ssrQuality === 'high';

            // Room is ~35 x 45 x 8 m, so rays never need to travel far. Keeping
            // maxDistance tight is the cheapest possible optimisation.
            ssr.maxDistance = 28;
            ssr.maxSteps = highQuality ? 900 : 500;
            ssr.step = highQuality ? 2 : 4;
            ssr.enableSmoothReflections = true;   // Required once step > 1 or reflections stair-step
            ssr.thickness = 0.4;
            ssr.selfCollisionNumSkip = 2;         // Avoids the floor reflecting itself as noise
            ssr.clipToFrustum = true;

            // Blur the reflection by surface roughness. The floor is roughness 0.25 —
            // polished but not a mirror — so reflections should smear slightly.
            // Without this the floor looks like glass, which reads as fake.
            ssr.blurDispersionStrength = 0.035;
            ssr.blurDownsample = highQuality ? 0 : 1;
            ssr.ssrDownsample = highQuality ? 0 : 1;
            ssr.roughnessFactor = 0.18;

            // useFresnel makes grazing angles far more reflective than head-on ones,
            // which is exactly how a real wet floor behaves: the far end of the room
            // mirrors brightly while the floor at your feet stays matte.
            ssr.useFresnel = true;
            ssr.reflectivityThreshold = 0.02; // Below the floor's 0.08 metallic so it qualifies

            // Soften the inherent SSR failure cases rather than letting them pop.
            ssr.attenuateScreenBorders = true;
            ssr.attenuateIntersectionDistance = true;
            ssr.attenuateIntersectionIterations = true;
            ssr.attenuateFacingCamera = true;
            ssr.attenuateBackfaceReflection = true;

            // Where a ray finds nothing, fall back to the floor probe's cube map instead
            // of the pixel's own colour — otherwise missed rays leave flat bright patches.
            if (this.floorReflectionProbe) {
                ssr.environmentTexture = this.floorReflectionProbe.cubeTexture;
                ssr.environmentTextureIsProbe = true;
            } else if (this.scene.environmentTexture) {
                ssr.environmentTexture = this.scene.environmentTexture;
            }

            ssr.isEnabled = !this.isInVRMode;
            this.ssrPipeline = ssr;
            log.info(`🪩 Screen-space reflections enabled (${this.tierSettings.ssrQuality} quality)`);
        } catch (err) {
            log.warn('⚠️ Failed to create SSR pipeline, continuing without reflections:', err);
            this.ssrPipeline = null;
        }
    }

    /**
     * Object-based motion blur.
     *
     * Moving heads, the mirror ball and the sweeping laser fans all move fast enough to
     * strobe against the frame rate. A short blur trail is what a real camera (and,
     * loosely, the eye) produces, and it is the difference between "3D objects moving"
     * and "a light show being filmed". Ultra tier only — it needs a velocity buffer.
     */
    _createMotionBlur() {
        if (this.motionBlur) return;
        if (!this.tierSettings.motionBlur) return;
        if (!BABYLON.MotionBlurPostProcess || !this.camera) return;

        try {
            const mb = new BABYLON.MotionBlurPostProcess(
                'motionBlur',
                this.scene,
                1.0,
                this.camera
            );
            // Deliberately restrained. Anything stronger smears the laser beams into
            // mush and makes the LED wall unreadable.
            mb.motionStrength = 0.35;
            mb.motionBlurSamples = this.tierSettings.motionBlurSamples;
            if ('isObjectBased' in mb) mb.isObjectBased = true;
            this.motionBlur = mb;
            log.info('🎞️ Object-based motion blur enabled');
        } catch (err) {
            log.warn('⚠️ Failed to create motion blur, continuing without it:', err);
            this.motionBlur = null;
        }
    }

    /**
     * Zero the specular colour on self-illuminated `StandardMaterial`s.
     *
     * `StandardMaterial` defaults `specularColor` to pure white, and the SSR pre-pass
     * reads `specularColor` as the surface's reflectivity. Left at the default, every
     * emissive surface in the club — the LED wall tiles, laser beams, light pools,
     * gobos, strobes, neon — is treated by SSR as a perfect mirror, so its colour is
     * replaced by a screen-space reflection that resolves to near-black. The visible
     * symptom is an LED wall where only the panel outlines glow (that is the bloom halo
     * surviving) while the panel faces go dark.
     *
     * A specular highlight on a pure emitter is physically meaningless anyway, so this
     * is the correct value independent of SSR. Materials built through
     * `MaterialFactory.createStandardMaterial({ disableLighting: true })` already get
     * this; the sweep catches the ~20 materials constructed directly in this file.
     */
    _suppressUnlitSpecular() {
        const black = new BABYLON.Color3(0, 0, 0);
        let fixed = 0;

        this.scene.materials.forEach(mat => {
            if (!(mat instanceof BABYLON.StandardMaterial)) return;
            if (!mat.specularColor) return;
            if (mat.specularColor.r === 0 && mat.specularColor.g === 0 && mat.specularColor.b === 0) return;

            const isUnlit = mat.disableLighting === true;
            const isAdditive = mat.alphaMode === BABYLON.Engine.ALPHA_ADD;
            const e = mat.emissiveColor;
            const isSelfLit = !!e && (e.r + e.g + e.b) > 0.5;
            if (!isUnlit && !isAdditive && !isSelfLit) return;

            // Frozen materials skip uniform re-evaluation, so unfreeze around the write.
            const wasFrozen = mat.isFrozen;
            if (wasFrozen && mat.unfreeze) mat.unfreeze();
            mat.specularColor = black.clone();
            if (wasFrozen && mat.freeze) mat.freeze();
            fixed++;
        });

        if (fixed) log.info(`💡 Zeroed specular on ${fixed} self-illuminated materials (SSR reflectivity fix)`);
    }

    /**
     * Apply anisotropic filtering to every texture in the scene.
     *
     * The floor is a 35x45 m plane viewed at a very shallow angle from eye height. With
     * the default trilinear filtering its tiles blur into grey mush a few metres out,
     * which is the most obvious "this is a game" tell in the whole room. Anisotropic
     * filtering keeps the tile grid sharp all the way to the far wall and costs almost
     * nothing on desktop.
     */
    _applyAnisotropicFiltering() {
        const caps = this.engine.getCaps();
        const max = caps.maxAnisotropy || 1;
        const target = Math.min(this.tierSettings.anisotropy, max);
        if (target <= 1) return;

        let count = 0;
        this.scene.textures.forEach(tex => {
            // Cube maps and render targets have no meaningful anisotropy.
            if (!tex || tex.isCube || tex.isRenderTarget) return;
            if (tex.anisotropicFilteringLevel !== target) {
                tex.anisotropicFilteringLevel = target;
                count++;
            }
        });
        log.info(`🔍 Anisotropic filtering set to ${target}x on ${count} textures`);
    }

    /** Clamp all lit materials after scene construction to avoid WebGL UBO overflow. */
    _clampMaterialLightBudgets() {
        let count = 0;
        this.scene.materials.forEach(material => {
            if (material.maxSimultaneousLights === undefined ||
                material.maxSimultaneousLights === this.maxLights) return;
            material.maxSimultaneousLights = this.maxLights;
            count++;
        });
        log.info(`💡 Clamped ${count} materials to ${this.maxLights} simultaneous lights`);
    }

    /**
     * Upgrade shadow filtering to contact-hardening (PCSS) on capable tiers.
     *
     * A club is lit by physically small sources at close range, so its shadows are
     * sharp where an object touches the floor and rapidly soften with distance. A
     * uniform-blur shadow map cannot express that, and uniformly-soft shadows are what
     * make CG interiors look like they are floating.
     */
    _applyShadowQuality() {
        const tier = this.tierSettings;
        const shadowsEnabled = !this.isInVRMode && tier.contactHardeningShadows;
        const qualityMap = {
            high: BABYLON.ShadowGenerator.QUALITY_HIGH,
            medium: BABYLON.ShadowGenerator.QUALITY_MEDIUM,
            low: BABYLON.ShadowGenerator.QUALITY_LOW
        };

        this.scene.lights.forEach(light => {
            const gen = light.getShadowGenerator && light.getShadowGenerator();
            if (!gen) return;

            light.shadowEnabled = shadowsEnabled;
            const shadowMap = gen.getShadowMap && gen.getShadowMap();
            if (shadowMap) {
                shadowMap.refreshRate = shadowsEnabled
                    ? BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME
                    : BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
            }

            if (tier.contactHardeningShadows && 'useContactHardeningShadow' in gen) {
                gen.useContactHardeningShadow = true;
                gen.contactHardeningLightSizeUVRatio = 0.08; // Small source = tight contact shadow
            } else {
                if ('useContactHardeningShadow' in gen) gen.useContactHardeningShadow = false;
                gen.usePercentageCloserFiltering = true;
            }
            gen.filteringQuality = qualityMap[tier.shadowQuality] || BABYLON.ShadowGenerator.QUALITY_MEDIUM;

            // Pull the shadow map's depth range in to the actual room size. A default
            // far plane wastes most of the depth precision on empty space and is the
            // usual cause of shadow acne and peter-panning.
            if (light.shadowMinZ === undefined || light.shadowMinZ === 0) light.shadowMinZ = 0.5;
            if (!light.shadowMaxZ || light.shadowMaxZ > 60) light.shadowMaxZ = 45;
        });
    }

    _refreshShadowCasters() {
        if (!this.scene) return;
        const generators = this.scene.lights
            .map(light => light.getShadowGenerator && light.getShadowGenerator())
            .filter(Boolean);
        if (generators.length === 0) return;

        const isCaster = mesh => {
            const name = (mesh.name || '').toLowerCase();
            return name.includes('dj') || name.includes('console') ||
                name.includes('speaker') || name.includes('sub') ||
                name.includes('dancer') || name.includes('performer');
        };

        generators.forEach(generator => {
            const shadowMap = generator.getShadowMap();
            const renderList = shadowMap.renderList || (shadowMap.renderList = []);
            const known = new Set(renderList);
            this.scene.meshes.forEach(mesh => {
                if (isCaster(mesh) && !known.has(mesh)) {
                    generator.addShadowCaster(mesh, false);
                    known.add(mesh);
                }
            });
        });
    }

    createFloor() {
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: 35,
            height: 45,
            subdivisions: 20
        }, this.scene);
        floor.position.z = -10;
        
        // CRITICAL: Ensure floor is pickable for laser/spotlight raycasts
        floor.isPickable = true;
        floor.checkCollisions = true; // Enable collisions for gravity/walking
        
        // Store floor mesh for VR teleportation
        this.floorMesh = floor;
        
        // ENHANCED Wooden floor panels with PBR - hyperrealistic nightclub aesthetic
        // Uses full PBRMaterial with clearcoat for polished/wet nightclub floor look
        const floorMat = this.materialFactory.getPreset('floorPolished');
        
        // Apply downloaded wood textures if available
        if (this.concreteTextures && this.concreteTextures.floor) {
            log.info('🎨 Applying ENHANCED floor textures (Polyhaven - Large Floor Tiles) with clearcoat');
            this.textureLoader.applyTexturesToMaterial(floorMat, this.concreteTextures.floor);
            // Dark polished tiles for modern nightclub aesthetic
            floorMat.albedoColor = new BABYLON.Color3(0.12, 0.12, 0.15); 
            
            // Override roughness for polished look (wet floor effect)
            floorMat.roughness = 0.25; 
            floorMat.metallic = 0.08;
            
            // Reduce roughness map influence to keep polished look
            if (floorMat.metallicTexture) {
                floorMat.metallicTexture.level = 0.4; // Reduce roughness map strength for shinier surface
            }
        } else {
            // Enhanced fallback to procedural noise texture
            log.info('🎨 Using ENHANCED procedural floor texture (fallback)');
            const noiseTexture = new BABYLON.NoiseProceduralTexture("floorNoise", 512, this.scene); // OPTIMIZED: Reduced from 1024
            noiseTexture.octaves = 6; // More detail layers
            noiseTexture.persistence = 0.9; // Stronger detail retention
            noiseTexture.animationSpeedFactor = 0; // Static texture
            floorMat.bumpTexture = noiseTexture;
            floorMat.bumpTexture.level = 0.4; // Enhanced bump for realistic surface
            floorMat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.18); // Dark polished concrete
        }
        
        // ENHANCED PBR properties for hyperrealistic polished floor
        // (environmentIntensity, directIntensity, specularIntensity set via preset)
        
        floor.material = floorMat;
        // Floor shadow reception is the strongest single cue that objects are actually
        // standing ON the floor rather than hovering over a painted texture. It is also
        // expensive (every shadow map is sampled across the full 35x45 m plane), so only
        // the top tier pays for it.
        floor.receiveShadows = !!this.tierSettings.floorShadows;
        floor.freezeWorldMatrix(); // OPTIMIZATION: Freeze static floor mesh
        floor.doNotSyncBoundingInfo = true; // Skip bounding info updates
    }

    /**
     * UPGRADE: Create a frozen ReflectionProbe for realistic floor reflections
     * Captures the club environment (trusses, LED wall, ceiling, walls) into a cube map
     * and applies it to the polished floor PBR material.
     * Uses REFRESHRATE_RENDER_ONCE so it's captured once and never re-rendered (free at runtime).
     * Call this AFTER all geometry is created so the probe captures everything.
     */
    createFloorReflectionProbe() {
        if (!this.floorMesh || !this.floorMesh.material) {
            log.warn('⚠️ Cannot create floor reflection probe - floor mesh not found');
            return;
        }
        
        // Cube map probe at dance floor level. Resolution scales with the graphics tier:
        // the probe supplies the floor's ambient reflection AND the fallback colour for
        // rays that SSR fails to resolve, so a sharper probe visibly improves both.
        const probe = new BABYLON.ReflectionProbe("floorReflectionProbe", this.tierSettings.probeResolution, this.scene);
        probe.position = new BABYLON.Vector3(0, 0.5, -12); // Dance floor center, slightly above floor
        
        // CRITICAL: Render only ONCE (frozen probe) - zero runtime cost after first frame
        probe.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        
        // Add key static meshes to the probe's render list
        // These are the objects that should appear reflected in the floor
        const renderList = probe.renderList;
        this.scene.meshes.forEach(mesh => {
            if (!mesh.name) return;
            const n = mesh.name.toLowerCase();
            // Include structural and decorative elements (skip floor itself, beams, pools, gobos)
            if (n.includes('wall') || n.includes('ceiling') || n.includes('truss') ||
                n.includes('brace') || n.includes('pillar') || n.includes('speaker') ||
                n.includes('djtable') || n.includes('platform') || n.includes('rail') ||
                n.includes('pipe') || n.includes('led') || n.includes('brick') ||
                n.includes('mirrorball') || n.includes('fixture') || n.includes('sign')) {
                renderList.push(mesh);
            }
        });
        
        // Apply the probe's cube texture to the floor PBR material
        const floorMat = this.floorMesh.material;
        
        // Unfreeze material if needed to apply reflection
        if (floorMat.unfreeze) floorMat.unfreeze();
        
        floorMat.reflectionTexture = probe.cubeTexture;
        floorMat.reflectionTexture.coordinatesMode = BABYLON.Texture.CUBIC_REFLECTION_MODE;
        
        // Moderate reflection level - polished but not mirror-like
        // The floor already has roughness 0.25 which naturally blurs the reflection
        floorMat.environmentIntensity = 0.6; // Subtle ambient reflections
        
        // Re-freeze material after applying reflection
        floorMat.freeze();
        
        this.floorReflectionProbe = probe;
        log.info(`🪞 Floor reflection probe created (${this.tierSettings.probeResolution}px cube, ${renderList.length} meshes, frozen)`);
    }

    _rebuildFloorReflectionProbe() {
        if (!this.floorMesh || !this.scene) return;
        if (this.floorReflectionProbe) {
            this.floorReflectionProbe.dispose();
            this.floorReflectionProbe = null;
        }
        this.createFloorReflectionProbe();
        if (this.ssrPipeline && this.floorReflectionProbe) {
            this.ssrPipeline.environmentTexture = this.floorReflectionProbe.cubeTexture;
            this.ssrPipeline.environmentTextureIsProbe = true;
        }
    }

    createWalls() {
        // PBR material for walls
        const wallMat = this.materialFactory.getPreset('wall');
        
        // Apply downloaded concrete wall textures if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            log.info('🎨 Applying wall textures (Polyhaven - Red Brick)');
            this.textureLoader.applyTexturesToMaterial(wallMat, this.concreteTextures.walls);
            wallMat.baseColor = new BABYLON.Color3(0.7, 0.6, 0.55); // Warm tint to let natural brick color show
            wallMat.roughness = 0.78; // Slightly polished brick (club condensation/moisture)
            wallMat.environmentIntensity = 0.25; // Subtle reflections for moist brick surface
        }
        
        // Back wall
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 25,
            height: 10,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 5, -21);
        backWall.material = wallMat;
        backWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        backWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        backWall.doNotSyncBoundingInfo = true;
        
        // Left wall
        const leftWall = BABYLON.MeshBuilder.CreateBox("leftWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-12.5, 5, -10);
        leftWall.material = wallMat;
        leftWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        leftWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        leftWall.doNotSyncBoundingInfo = true;
        
        // Right wall
        const rightWall = BABYLON.MeshBuilder.CreateBox("rightWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        rightWall.position = new BABYLON.Vector3(12.5, 5, -10);
        rightWall.material = wallMat;
        rightWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        rightWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        rightWall.doNotSyncBoundingInfo = true;
        
        // Front wall
        const frontWall = BABYLON.MeshBuilder.CreateBox("frontWall", {
            width: 25,
            height: 10,
            depth: 0.5
        }, this.scene);
        frontWall.position = new BABYLON.Vector3(0, 5, 0);
        frontWall.material = wallMat;
        frontWall.receiveShadows = false; // Optimization: disable shadows on walls
        frontWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        frontWall.doNotSyncBoundingInfo = true;
        
        // Add industrial wall details
        this.createIndustrialWallDetails();
    }

    createIndustrialWallDetails() {
        // Create exposed brick sections, pipes, conduits, and graffiti for authentic warehouse feel
        
        // Exposed brick material - old red brick
        const brickMat = this.materialFactory.getPreset('brick');
        
        // Apply texture to these details too if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            this.textureLoader.applyTexturesToMaterial(brickMat, this.concreteTextures.walls);
            // Make these sections slightly darker/dirtier
            brickMat.baseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
        }
        
        // Concrete pillar material
        const pillarMat = this.materialFactory.getPreset('pillar');
        
        // Apply concrete texture to pillars if available (using ceiling texture for concrete look)
        if (this.concreteTextures && this.concreteTextures.ceiling) {
            this.textureLoader.applyTexturesToMaterial(pillarMat, this.concreteTextures.ceiling);
            pillarMat.roughness = 0.7;
        }
        
        // Metal pipe material
        const pipeMat = this.materialFactory.getPreset('pipe');
        
        // Add concrete support pillars along walls
        const pillarPositions = [
            { x: -12.5, z: -5 }, { x: -12.5, z: -15 }, { x: -12.5, z: -21 },
            { x: 12.5, z: -5 }, { x: 12.5, z: -15 }, { x: 12.5, z: -21 }
        ];
        
        // OPTIMIZATION: Create pillars array for merging
        const pillarsToMerge = [];
        pillarPositions.forEach((pos, i) => {
            const pillar = BABYLON.MeshBuilder.CreateBox("pillar" + i, {
                width: 0.6,
                height: 10,
                depth: 0.6
            }, this.scene);
            pillar.position = new BABYLON.Vector3(pos.x, 5, pos.z);
            pillar.material = pillarMat;
            pillar.receiveShadows = false;
            pillarsToMerge.push(pillar);
        });
        
        // OPTIMIZATION: Merge all pillars into single mesh (6 draw calls → 1)
        const mergedPillars = BABYLON.Mesh.MergeMeshes(
            pillarsToMerge, 
            true, // dispose source meshes
            true, // allow multi-materials
            undefined, 
            false, 
            true // use material indices
        );
        if (mergedPillars) {
            mergedPillars.name = "mergedPillars";
            mergedPillars.freezeWorldMatrix();
            mergedPillars.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 6 pillars into single mesh");
        }
        
        // Add exposed brick sections between pillars
        const brickSections = [
            { x: -12.0, z: -10, width: 1, height: 4 },
            { x: -12.0, z: -20, width: 1, height: 3 },
            { x: 12.0, z: -10, width: 1, height: 4 },
            { x: 12.0, z: -20, width: 1, height: 3 }
        ];
        
        // OPTIMIZATION: Create bricks array for merging
        const bricksToMerge = [];
        brickSections.forEach((section, i) => {
            const brick = BABYLON.MeshBuilder.CreateBox("brick" + i, {
                width: section.width,
                height: section.height,
                depth: 0.3
            }, this.scene);
            brick.position = new BABYLON.Vector3(section.x, 2 + section.height/2, section.z);
            brick.material = brickMat;
            brick.receiveShadows = false;
            bricksToMerge.push(brick);
        });
        
        // OPTIMIZATION: Merge all bricks into single mesh (4 draw calls → 1)
        const mergedBricks = BABYLON.Mesh.MergeMeshes(
            bricksToMerge,
            true, // dispose source meshes
            true, // allow multi-materials
            undefined,
            false,
            true // use material indices
        );
        if (mergedBricks) {
            mergedBricks.name = "mergedBricks";
            mergedBricks.freezeWorldMatrix();
            mergedBricks.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 4 brick sections into single mesh");
        }
        
        // Add industrial pipes running along ceiling (near walls)
        const pipeRuns = [
            { start: { x: -11.5, z: -21 }, end: { x: -11.5, z: 5 } },  // Left wall
            { start: { x: 11.5, z: -21 }, end: { x: 11.5, z: 5 } }     // Right wall
        ];
        
        // OPTIMIZATION: Create pipes/conduits array for merging
        const pipesToMerge = [];
        pipeRuns.forEach((run, i) => {
            const pipeLength = Math.abs(run.end.z - run.start.z);
            const pipe = BABYLON.MeshBuilder.CreateCylinder("pipe" + i, {
                diameter: 0.15,
                height: pipeLength,
                tessellation: 12
            }, this.scene);
            pipe.position = new BABYLON.Vector3(run.start.x, 9.5, (run.start.z + run.end.z) / 2);
            pipe.rotation.x = Math.PI / 2;
            pipe.material = pipeMat;
            pipesToMerge.push(pipe);
            
            // Add smaller conduit pipes next to main pipe
            const conduit = BABYLON.MeshBuilder.CreateCylinder("conduit" + i, {
                diameter: 0.08,
                height: pipeLength,
                tessellation: 8
            }, this.scene);
            conduit.position = new BABYLON.Vector3(run.start.x - 0.25, 9.3, (run.start.z + run.end.z) / 2);
            conduit.rotation.x = Math.PI / 2;
            conduit.material = pipeMat;
            pipesToMerge.push(conduit);
        });
        
        // OPTIMIZATION: Merge all pipes/conduits into single mesh (4 draw calls → 1)
        const mergedPipes = BABYLON.Mesh.MergeMeshes(
            pipesToMerge,
            true, // dispose source meshes
            true, // allow multi-materials
            undefined,
            false,
            true // use material indices
        );
        if (mergedPipes) {
            mergedPipes.name = "mergedPipes";
            mergedPipes.freezeWorldMatrix();
            mergedPipes.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 4 pipes/conduits into single mesh");
        }
        
        log.info("✅ Created industrial wall details");
    }

    // === HYPERREALISTIC ENTRANCE AREA ===
}
window.VRClubRendering = VRClubRendering;
