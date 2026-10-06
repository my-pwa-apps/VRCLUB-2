'use strict';
// Graffiti atlas cells in pixels (x, y, w, h; y down) of textures/graffiti/atlas.webp. Mirrors CELLS in
// scripts/build-graffiti-atlas.mjs; change both together.
const GRAFFITI_ATLAS_SIZE = 2048;
const GRAFFITI_CELLS = {
    character: [0, 0, 1024, 1024],    // the girl with the spray can
    tagWall: [1024, 0, 1024, 1024],   // sticker-and-tag column
    tagCluster: [0, 1024, 1024, 1024],
    vaps: [1024, 1024, 1024, 512],    // full-colour burner
    klw: [1024, 1536, 1024, 512]      // teal burner with side tags
};
// Where each piece is painted. `along` is x on the front wall and z on the side walls; `y` is the centre
// height; `width` is the cell's width in metres (the height follows the cell's aspect). Every spot is
// clear of the pillars (z -5, -15), the brick fins (z -20), the bar (right wall, z -13.8..-6), the
// mezzanine and its stair (left wall, z -19..-6.2), the doorway, EXIT and the NOCTURNE sign.
const GRAFFITI_PIECES = [
    { cell: 'character', wall: 'front', along: 7.7, y: 1.95, width: 2.7 },
    { cell: 'vaps', wall: 'front', along: -7.6, y: 1.9, width: 4.4 },
    { cell: 'tagCluster', wall: 'right', along: -17.5, y: 1.7, width: 3.2 },
    { cell: 'klw', wall: 'right', along: -2.6, y: 1.55, width: 3.8 },
    { cell: 'tagWall', wall: 'left', along: -2.7, y: 1.5, width: 2.6 }
];
class VRClubRendering extends VRClubLifecycle {
    addPostProcessing() {
        const desktop = this.vrSettings.desktop;
        const tier = this.tierSettings;

        // Guard ONLY the DefaultRenderingPipeline. Keying the whole method on
        // `this.renderPipeline` meant that once applyVRSettings() swapped in a VR
        // pipeline, a later call returned immediately and never rebuilt SSAO, SSR or
        // motion blur. The helpers below carry their own idempotency guards.
        if (!this.renderPipeline) {
            this._createDefaultPipeline(desktop, tier);
        }

        // SSAO 2 Pipeline (Screen Space Ambient Occlusion) - Adds realistic contact shadows
        // ONLY for desktop mode (too expensive for standalone VR)
        // Adds depth to corners and contact points for hyperrealism
        // Note: Pass camera in constructor - don't call attachCamerasToRenderPipeline again (causes reuse warnings)
        if (!this.ssaoPipeline) {
            this.ssaoPipeline = new BABYLON.SSAO2RenderingPipeline("ssao", this.scene, 0.75, this.camera ? [this.camera] : []);
            this.ssaoPipeline.radius = 3.5;
            this.ssaoPipeline.totalStrength = 1.2;
            this.ssaoPipeline.expensiveBlur = tier.ssaoExpensiveBlur;
            this.ssaoPipeline.samples = tier.ssaoSamples;
            // Matched to the camera's far plane (02-lifecycle.js sets camera.maxZ = 100).
            // A larger maxZ than the camera can see only spreads depth precision thinner.
            this.ssaoPipeline.maxZ = this.camera ? this.camera.maxZ : 100;
        }

        // Heavy tier-gated effects.
        this._createScreenSpaceReflections();
        this._createMotionBlur();
        
        log.info(`✨ Post-processing initialized (hyperrealistic mode, tier: ${this.graphicsTier})`);
    }

    /** Build the primary HDR pipeline. Split out so addPostProcessing() can be re-run. */
    _createDefaultPipeline(desktop, tier) {
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

            // Blur the reflection by surface roughness so brushed and cast metal
            // smear rather than reading as glass.
            ssr.blurDispersionStrength = 0.035;
            ssr.blurDownsample = highQuality ? 0 : 1;
            ssr.ssrDownsample = highQuality ? 0 : 1;
            ssr.roughnessFactor = 0.18;

            // useFresnel makes grazing angles more reflective than head-on ones. The
            // threshold sits above a dielectric's F0 (~0.04), so only metals (truss,
            // rails, DJ gear, mirror ball) trace rays. The matte concrete floor and the
            // brick would otherwise mirror the room at grazing angles like a wet floor.
            ssr.useFresnel = true;
            ssr.reflectivityThreshold = 0.06;

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

    _clampMaterialLightBudgets() {
        const wasBlocked = this.scene.blockMaterialDirtyMechanism;
        this.scene.blockMaterialDirtyMechanism = false;

        let count = 0;
        this.scene.materials.forEach(material => {
            if (material.maxSimultaneousLights === undefined || material.disableLighting) return;
            if (material.isFrozen) material.unfreeze();
            material.maxSimultaneousLights = this.maxLights;
            if (material.markAsDirty) material.markAsDirty(BABYLON.Material.LightDirtyFlag);
            count++;
        });

        this.scene.blockMaterialDirtyMechanism = wasBlocked;
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
        
        // Old factory hall: worn, patched, oil-stained concrete. Matte by design; the
        // preset carries no clear coat and the roughness map is used at full strength.
        const floorMat = this.materialFactory.getPreset('floorConcrete');
        
        if (this.concreteTextures && this.concreteTextures.floor) {
            log.info('🎨 Applying factory concrete floor textures (Poly Haven - Concrete Floor Damaged 01)');
            this.textureLoader.applyTexturesToMaterial(floorMat, this.concreteTextures.floor);
        } else {
            log.info('🎨 Using procedural concrete floor texture (fallback)');
            const noiseTexture = new BABYLON.NoiseProceduralTexture("floorNoise", 512, this.scene); // OPTIMIZED: Reduced from 1024
            noiseTexture.octaves = 6; // More detail layers
            noiseTexture.persistence = 0.9; // Stronger detail retention
            noiseTexture.animationSpeedFactor = 0; // Static texture
            floorMat.bumpTexture = noiseTexture;
            floorMat.bumpTexture.level = 0.4;
            floorMat.roughness = 0.85; // No roughness map to modulate it
            floorMat.albedoColor = new BABYLON.Color3(0.3, 0.29, 0.27); // Untextured concrete
        }
        
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
     * Create a frozen ReflectionProbe for SSR fallback reflections.
     * Captures the club environment (trusses, ceiling, walls) into a cube map used
     * when a screen-space ray misses. The concrete itself uses the warehouse environment.
     * Uses REFRESHRATE_RENDER_ONCE so it's captured once and never re-rendered (free at runtime).
     * Call this AFTER all geometry is created so the probe captures everything.
     */
    createFloorReflectionProbe() {
        if (!this.floorMesh || !this.floorMesh.material) {
            log.warn('⚠️ Cannot create floor reflection probe - floor mesh not found');
            return;
        }
        
        // Cube map probe at dance floor level. Resolution scales with the graphics tier
        // because it supplies the fallback colour for rays that SSR fails to resolve.
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
            if (n.includes('ledpanel')) return; // animated wall cannot live in a render-once probe
            // Include structural and decorative elements (skip floor itself, beams, pools, gobos)
            if (n.includes('wall') || n.includes('ceiling') || n.includes('truss') ||
                n.includes('brace') || n.includes('pillar') || n.includes('speaker') ||
                n.includes('djtable') || n.includes('platform') || n.includes('rail') ||
                n.includes('pipe') || n.includes('led') || n.includes('brick') ||
                n.includes('mirrorball') || n.includes('fixture') || n.includes('sign')) {
                renderList.push(mesh);
            }
        });
        
        // Match the floor response to the warehouse environment. The frozen probe is
        // retained as SSR's missed-ray fallback, but must not replace the environment
        // on the concrete itself or its reflections diverge from the rest of the room.
        // Freeze state is SAVED and restored: unfreezing conditionally but freezing
        // unconditionally left an intentionally-hot material frozen, and
        // _rebuildFloorReflectionProbe() re-runs this on every graphics-tier change.
        const floorMat = this.floorMesh.material;
        const wasFrozen = floorMat.isFrozen;
        if (wasFrozen && floorMat.unfreeze) floorMat.unfreeze();
        
        floorMat.reflectionTexture = this.scene.environmentTexture;
        floorMat.environmentIntensity = 0.35;
        
        if (wasFrozen && floorMat.freeze) floorMat.freeze();
        
        this.floorReflectionProbe = probe;
        log.info(`🪞 SSR fallback probe created (${this.tierSettings.probeResolution}px cube, ${renderList.length} meshes, frozen)`);
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

    /**
     * Make a box's tiling texture repeat at a real-world size, upright. CreateBox gives every face the
     * whole texture once (0..1) however big the face is, and which axis U follows differs by face (on the
     * side faces U runs UP the wall), so a 45 x 10 m wall came out stretched and the brick courses ran
     * the wrong way. This rebuilds the UVs from the vertex positions: U along the horizontal axis, V up
     * (or along z on a roof), so one tile covers `tileMeters` square on every surface.
     *
     * @param {BABYLON.Mesh} mesh      a box that is not rotated (its local axes are the world axes)
     * @param {number} tileMeters      side of one texture tile in metres
     * @param {{u:number,v:number}} textureScale the uScale/vScale the texture set already carries; they
     *                                 multiply the UVs again, so they are divided out here
     */
    _applyWorldUVs(mesh, tileMeters, textureScale) {
        const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        if (!positions || !normals) return;
        const perMeterU = 1 / (tileMeters * (textureScale.u || 1));
        const perMeterV = 1 / (tileMeters * (textureScale.v || 1));
        const uvs = new Float32Array((positions.length / 3) * 2);
        for (let i = 0; i < positions.length / 3; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            const ax = Math.abs(normals[i * 3]), ay = Math.abs(normals[i * 3 + 1]), az = Math.abs(normals[i * 3 + 2]);
            let across, up;
            if (ax >= ay && ax >= az) { across = z; up = y; }      // side faces run along z
            else if (az >= ay) { across = x; up = y; }             // front and back faces run along x
            else { across = x; up = z; }                           // top and bottom: x by z
            uvs[i * 2] = across * perMeterU;
            uvs[i * 2 + 1] = up * perMeterV;
        }
        mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs);
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
        
        // One tile of the brick texture is 1.5 m square on every wall (see _applyWorldUVs).
        const wallTile = 1.5;
        const wallScale = this.textureLoader && this.textureLoader.textureConfigs.walls.scale || { u: 1, v: 1 };

        // Back wall
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 25,
            height: 10,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 5, -21);
        this._applyWorldUVs(backWall, wallTile, wallScale);
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
        this._applyWorldUVs(leftWall, wallTile, wallScale);
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
        this._applyWorldUVs(rightWall, wallTile, wallScale);
        rightWall.material = wallMat;
        rightWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        rightWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        rightWall.doNotSyncBoundingInfo = true;
        
        // Front wall: a 4 m doorway (x -2..2, 3.4 m high) leads to the entrance vestibule (see
        // VenueDressing.createEntranceArea). The first piece keeps the name `frontWall`.
        const doorHalf = 2.0, doorHeight = 3.4;
        const frontPieces = [
            { name: 'frontWall', width: 12.5 - doorHalf, height: 10, x: -(12.5 + doorHalf) / 2, y: 5 },
            { name: 'frontWallRight', width: 12.5 - doorHalf, height: 10, x: (12.5 + doorHalf) / 2, y: 5 },
            { name: 'frontWallLintel', width: 2 * doorHalf, height: 10 - doorHeight, x: 0, y: (10 + doorHeight) / 2 }
        ].map(piece => {
            const mesh = BABYLON.MeshBuilder.CreateBox(piece.name, {
                width: piece.width, height: piece.height, depth: 0.5
            }, this.scene);
            mesh.position = new BABYLON.Vector3(piece.x, piece.y, 0);
            this._applyWorldUVs(mesh, wallTile, wallScale);
            mesh.material = wallMat;
            mesh.receiveShadows = false; // Optimization: disable shadows on walls
            mesh.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
            mesh.doNotSyncBoundingInfo = true;
            return mesh;
        });

        // The visible shell is the venue boundary. The invisible collisionWall band is
        // only 4 m tall and open at the entrance, so without this a desktop visitor
        // walked out through the front wall or flew over the band and through a side wall.
        for (const wall of [backWall, leftWall, rightWall, ...frontPieces]) wall.checkCollisions = true;
        
        // Add industrial wall details
        this.createIndustrialWallDetails();
        this.createGraffiti();
    }

    /**
     * Spray-painted pieces on the brick (GRAFFITI_PIECES), one alpha-tested mesh and one draw call.
     *
     * Paint sits IN the wall, not on a sticker: UV channel 0 carries the wall's own world-space brick
     * coordinates, so the decal samples the wall's normal map (the paint follows every brick and joint)
     * and its packed ORM occlusion (it darkens into the mortar), with no extra texture memory. UV channel 1
     * carries the atlas. Alpha-tested rather than blended, so it draws in the opaque pass with depth writes
     * (VR stereo and the additive beams both need that).
     */
    createGraffiti() {
        const set = this.concreteTextures && this.concreteTextures.graffiti;
        const atlas = set && set.diffuse;
        if (!atlas) return; // no atlas, no paint: the bare brick is a valid wall
        const walls = this.concreteTextures.walls || {};
        const brickScale = (this.textureLoader && this.textureLoader.textureConfigs.walls.scale) || { u: 1, v: 1 };
        const perU = 1 / (1.5 * (brickScale.u || 1)), perV = 1 / (1.5 * (brickScale.v || 1));
        // Inner faces of the shell; `right` is the reader's right-hand side looking at the wall.
        const WALLS = {
            front: { point: z => [z, 0, -0.25 - 0.004], normal: [0, 0, -1], right: [1, 0, 0], acrossIsX: true },
            left: { point: z => [-12.25 + 0.004, 0, z], normal: [1, 0, 0], right: [0, 0, 1], acrossIsX: false },
            right: { point: z => [12.25 - 0.004, 0, z], normal: [-1, 0, 0], right: [0, 0, -1], acrossIsX: false }
        };
        const S = GRAFFITI_ATLAS_SIZE;
        const positions = [], normals = [], brickUV = [], atlasUV = [], indices = [];
        for (const piece of GRAFFITI_PIECES) {
            const wall = WALLS[piece.wall];
            const [cx, cy, cw, ch] = GRAFFITI_CELLS[piece.cell];
            const hw = piece.width / 2, hh = (piece.width * ch / cw) / 2;
            const base = wall.point(piece.along);
            const first = positions.length / 3;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                const x = base[0] + wall.right[0] * hw * sx;
                const y = piece.y + hh * sy;
                const z = base[2] + wall.right[2] * hw * sx;
                positions.push(x, y, z);
                normals.push(...wall.normal);
                brickUV.push((wall.acrossIsX ? x : z) * perU, y * perV);
                // Babylon samples with invertY: v = 1 is the atlas's top row.
                atlasUV.push((cx + (sx > 0 ? cw : 0)) / S, 1 - (cy + (sy > 0 ? 0 : ch)) / S);
            }
            indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
        }

        const mesh = new BABYLON.Mesh('graffitiDecals', this.scene);
        const data = new BABYLON.VertexData();
        data.positions = positions;
        data.normals = normals;
        data.uvs = brickUV;
        data.uvs2 = atlasUV;
        data.indices = indices;
        data.applyToMesh(mesh);

        const mat = this.materialFactory.createFullPBRMaterial('graffitiPaintMat', {
            albedoColor: [1, 1, 1],
            metallic: 0,
            roughness: 0.86, // dry spray paint: matte, a touch smoother than raw brick
            environmentIntensity: 0.25,
            backFaceCulling: false, // winding-proof; the back faces are inside the wall
            mutable: true // lit materials stay unfrozen (see _clampMaterialLightBudgets)
        });
        atlas.hasAlpha = true;
        atlas.coordinatesIndex = 1;
        atlas.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        atlas.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        mat.albedoTexture = atlas;
        mat.useAlphaFromAlbedoTexture = true;
        mat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
        mat.alphaCutOff = 0.45;
        if (walls.normal) {
            mat.bumpTexture = walls.normal;
            mat.invertNormalMapX = false;
            mat.invertNormalMapY = false;
        }
        if (walls.orm) {
            mat.ambientTexture = walls.orm; // R = occlusion
            mat.useAmbientInGrayScale = true;
        }
        mat.zOffset = -2; // 4 mm off the brick; this settles any remaining depth fight at grazing angles
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        log.info(`🎨 Painted ${GRAFFITI_PIECES.length} graffiti pieces (one draw call)`);
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
            this._applyWorldUVs(pillar, 3, this.textureLoader && this.textureLoader.textureConfigs.ceiling.scale || { u: 1, v: 1 });
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
        const brickScale = this.textureLoader && this.textureLoader.textureConfigs.walls.scale || { u: 1, v: 1 };
        const brickSections = [
            // No fins at x=±12, z=-10: the bar's back bar and the mezzanine stair stand against those walls.
            { x: -12.0, z: -20, width: 1, height: 3 },
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
            this._applyWorldUVs(brick, 1.5, brickScale);
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
