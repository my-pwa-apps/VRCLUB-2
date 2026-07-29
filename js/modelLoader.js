// 3D Model Loader with CDN Download and IndexedDB Caching
// Downloads DJ equipment and speaker models from CDN on first run
//
// Requires js/assetCache.js to be loaded first (IndexedDBAssetCache, InFlightRegistry,
// fetchWithTimeout). The hand-rolled ModelCache class that used to live here was
// removed: it silently hung on IndexedDB transaction errors and quota exhaustion.

class ModelLoader {
    /**
     * @param {BABYLON.Scene} scene
     * @param {MaterialFactory|null} materialFactory
     * @param {object|null} logger
     * @param {number|null} maxLights Device light budget. Falls back to the factory's
     *   value, then to a device-appropriate default - never to a hard-coded number that
     *   would silently under-light loaded models relative to procedural geometry.
     */
    constructor(scene, materialFactory = null, logger = null, maxLights = null) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = logger || console; // Use provided logger or fallback to console
        this.maxLights = maxLights
            ?? (materialFactory ? materialFactory.maxLights : null)
            ?? ModelLoader.detectDefaultMaxLights();
        this.cache = new IndexedDBAssetCache({
            dbName: 'VRClubModelCache',
            storeName: 'models',
            logger: this.log
        });
        this.inFlight = new InFlightRegistry();
        this.modelConfigs = this.getModelConfigs();
        this.loadedModels = {}; // Store loaded model containers
    }

    /** Mirrors VRClub.detectMaxLights() for the standalone case. */
    static detectDefaultMaxLights() {
        const ua = (navigator.userAgent || '').toLowerCase();
        if (ua.includes('quest') || ua.includes('oculus')) return 4;
        return 3;
    }

    getModelConfigs() {
        // Real 3D models from Sketchfab (CC BY license - attribution required)
        // Pioneer DJ Console by TwoPixels.studio: https://sketchfab.com/twopixels.studio
        // PA Speakers: https://sketchfab.com (to be credited)
        //
        // === SIZING / PLACEMENT CONTRACT ===
        // Do NOT hand-tune `scale` and `position` against a rendered frame. Both are
        // derived at load time by _fitAndPlace() from the `placement` block:
        //
        //   fitAxis / fitSize  A real-world dimension (metres) the model is uniformly
        //                      scaled to, measured on the UNROTATED hierarchy. Measuring
        //                      the rotated AABB — what this file used to do — normalises
        //                      a tilted fixture against a box inflated by its own tilt.
        //   centerX / centerZ  Where the resulting world AABB is centred.
        //   bottomY | topY     Which face of the world AABB is pinned, and to what.
        //
        // `scale` therefore carries mirror SIGNS only (a negative axis unmirrors a model
        // exported flipped); its magnitude is ignored.
        return {
            dj_console: {
                name: 'Pioneer DJ Console',
                url: './js/models/djgear/source/pioneer_DJ_console.glb',
                rotation: new BABYLON.Vector3(0, Math.PI, 0), // Rotated 180° to face the DJ
                scale: new BABYLON.Vector3(-1, 1, 1), // Sign only — NEGATIVE X unmirrors the model
                placement: {
                    // 2× CDJ-3000 (329 mm) + DJM-900NXS2 (333 mm) side by side is 991 mm;
                    // 1.02 m leaves a few mm of gap between units. The model's own
                    // proportions (1 : 0.120 : 0.530) match real gear (1 : 0.119 : 0.457)
                    // apart from a slightly deeper mounting plate.
                    fitAxis: 'x',
                    fitSize: 1.02,
                    centerX: 0,      // Centred on the 4 m djTable (x -2 .. +2)
                    // Back half of the deck row (djTable spans z -19 .. -18). This puts the
                    // console within reach of the operator standing in the 1 m zone between
                    // the LED wall (z=-20) and the plinth, instead of inside the wall.
                    centerZ: -18.62,
                    bottomY: 1.42    // djTable top surface: the gear SITS on the plinth
                },
                useProcedural: false, // Use real 3D model
                attribution: 'Pioneer DJ Console by TwoPixels.studio (CC BY 4.0)'
            },
            pa_speaker_left: {
                name: 'PA Speaker (Left)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                // Flipped 180° (the model's geometry sits above its rigging pivot) plus a
                // 30° down-tilt and 30° inward toe — aimed at the far side of the floor.
                rotation: new BABYLON.Vector3(Math.PI + Math.PI / 6, Math.PI / 6, 0),
                scale: new BABYLON.Vector3(1, 1, 1), // Sign only — no mirroring needed
                placement: {
                    // Cabinet height of a large-format flown club main (Funktion-One Res 4
                    // class: 1.42 × 0.68 × 0.57 m). Yields 1.45 × 0.60 × 0.61 m here.
                    fitAxis: 'y',
                    fitSize: 1.45,
                    centerX: CLUB_POSITIONS.paSpeakers.left.x,
                    centerZ: CLUB_POSITIONS.paSpeakers.left.z,
                    topY: CLUB_POSITIONS.paSpeakers.left.y
                },
                // Flown from the rear lighting truss, NOT the ceiling. anchorY is the
                // truss chord centre-line; the chain length is derived from the measured
                // cabinet, so moving the speaker re-rigs it automatically.
                rigging: { anchorY: 8.0, yaw: Math.PI / 6 },
                useProcedural: false, // USE the 3D model
                makeBlack: false, // Disable black override to use textures
                applyExternalTextures: true, // Enable external textures
                textureBasePath: './js/models/paspeakers/source/textures/',
                hangFromTruss: true,
                attribution: 'Stage Speaker (CC BY 4.0)'
            },
            pa_speaker_right: {
                name: 'PA Speaker (Right)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                rotation: new BABYLON.Vector3(Math.PI + Math.PI / 6, -Math.PI / 6, 0),
                scale: new BABYLON.Vector3(1, 1, 1),
                placement: {
                    fitAxis: 'y',
                    fitSize: 1.45,
                    centerX: CLUB_POSITIONS.paSpeakers.right.x,
                    centerZ: CLUB_POSITIONS.paSpeakers.right.z,
                    topY: CLUB_POSITIONS.paSpeakers.right.y
                },
                rigging: { anchorY: 8.0, yaw: -Math.PI / 6 },
                useProcedural: false, // USE the 3D model
                makeBlack: false, // Disable black override to use textures
                applyExternalTextures: true, // Enable external textures
                textureBasePath: './js/models/paspeakers/source/textures/',
                hangFromTruss: true,
                attribution: 'Stage Speaker (CC BY 4.0)'
            }
        };
    }

    /**
     * Size and place a loaded model from real-world dimensions instead of magic numbers.
     *
     * Two bugs this exists to prevent:
     *  1. Scaling against the ROTATED bounding box. A 30°-tilted speaker normalised to a
     *     "3 m" AABB is really a 2.79 m cabinet, and the real size silently changes every
     *     time the tilt is edited. The fit is therefore measured with rotation removed.
     *  2. Treating `position` as if it were the model's centre. glTF pivots are arbitrary
     *     — this model's geometry sits ~0.4 m above its own origin — so placement is
     *     resolved against the world AABB *after* rotation and scale are applied.
     *
     * @returns {{min: BABYLON.Vector3, max: BABYLON.Vector3, center: BABYLON.Vector3}|null}
     */
    _fitAndPlace(rootMesh, config, label) {
        const p = config.placement;
        if (!p) return null;

        const sign = v => (v < 0 ? -1 : 1);
        const sx = config.scale ? sign(config.scale.x) : 1;
        const sy = config.scale ? sign(config.scale.y) : 1;
        const sz = config.scale ? sign(config.scale.z) : 1;

        // --- 1. Measure the model's own dimensions, rotation and scale removed ---
        rootMesh.rotationQuaternion = null; // Euler below would otherwise be ignored
        rootMesh.position.set(0, 0, 0);
        rootMesh.rotation.set(0, 0, 0);
        rootMesh.scaling.set(1, 1, 1);
        const local = rootMesh.getHierarchyBoundingVectors(true);
        const localSpan = {
            x: local.max.x - local.min.x,
            y: local.max.y - local.min.y,
            z: local.max.z - local.min.z
        };
        const measured = localSpan[p.fitAxis];

        let uniform = 1;
        if (Number.isFinite(measured) && measured > 1e-6) {
            uniform = p.fitSize / measured;
        } else {
            this.log.warn(`⚠️ ${label}: cannot measure ${p.fitAxis} extent (got ${measured}) — leaving model at unit scale`);
        }

        // --- 2. Apply the real transform ---
        rootMesh.scaling.set(sx * uniform, sy * uniform, sz * uniform);
        rootMesh.rotation = config.rotation ? config.rotation.clone() : BABYLON.Vector3.Zero();
        rootMesh.position.set(0, 0, 0);

        // --- 3. Offset so the world AABB lands on the requested anchors ---
        const world = rootMesh.getHierarchyBoundingVectors(true);
        const offset = new BABYLON.Vector3(0, 0, 0);
        if (p.centerX !== undefined) offset.x = p.centerX - (world.min.x + world.max.x) / 2;
        if (p.centerZ !== undefined) offset.z = p.centerZ - (world.min.z + world.max.z) / 2;
        if (p.bottomY !== undefined) offset.y = p.bottomY - world.min.y;
        else if (p.topY !== undefined) offset.y = p.topY - world.max.y;
        else if (p.centerY !== undefined) offset.y = p.centerY - (world.min.y + world.max.y) / 2;
        rootMesh.position = offset;

        const box = rootMesh.getHierarchyBoundingVectors(true);
        const f = n => n.toFixed(2);
        this.log.info(
            `   📏 ${label}: ${f(localSpan.x * uniform)}×${f(localSpan.y * uniform)}×${f(localSpan.z * uniform)} m ` +
            `(scale ${uniform.toFixed(5)}) → x[${f(box.min.x)}..${f(box.max.x)}] ` +
            `y[${f(box.min.y)}..${f(box.max.y)}] z[${f(box.min.z)}..${f(box.max.z)}]`
        );

        return { min: box.min, max: box.max, center: BABYLON.Vector3.Center(box.min, box.max) };
    }

    async init() {
        this.log.info('🎸 Initializing model loader...');
        this.gltfPluginAvailable = ModelLoader.isGltfPluginRegistered();
        if (!this.gltfPluginAvailable) {
            // Without the loaders bundle Babylon falls back to the .babylon JSON parser
            // and every .glb produces an "importScene has failed JSON parse" cascade.
            // Surface one actionable message instead of six parser errors.
            this.log.error('❌ glTF loader plugin is not registered - .glb models cannot be loaded. ' +
                'js/vendor/babylonjs.loaders.min.js failed to load; run `npm run vendor:babylon`.');
        }
        await this.cache.init();
    }

    /**
     * True when babylonjs.loaders registered the glTF plugin. Checked once at init
     * so a missing bundle is reported before any model load is attempted.
     */
    static isGltfPluginRegistered() {
        try {
            if (BABYLON.GLTFFileLoader) return true;
            const registry = BABYLON.SceneLoader?._registeredPlugins;
            return !!(registry && (registry['.glb'] || registry['.gltf']));
        } catch (_) {
            return false;
        }
    }

    async downloadModel(url) {
        this.log.info(`⬇️ Downloading model: ${url}`);
        try {
            const response = await fetchWithTimeout(url, {
                mode: 'cors',
                cache: 'default',
                timeoutMs: 60000 // GLBs are large; allow more headroom than textures
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(2);
            this.log.info(`✅ Downloaded: ${url.split('/').pop()} (${sizeMB} MB)`);
            return arrayBuffer;
        } catch (error) {
            this.log.error(`❌ Failed to download ${url}:`, error);
            throw error;
        }
    }

    /**
     * Fetch model bytes from cache or network. Concurrent callers for the same
     * URL share one download — the two PA speakers reference the SAME GLB, so
     * without this the file was downloaded twice on every cold start.
     */
    async loadOrDownloadModel(url) {
        return this.inFlight.run(url, async () => {
            const cached = await this.cache.get(url);
            if (cached) {
                this.log.info(`💾 Using cached model: ${url.split('/').pop()}`);
                return cached;
            }
            const arrayBuffer = await this.downloadModel(url);
            await this.cache.put(url, arrayBuffer);
            return arrayBuffer;
        });
    }

    async loadModel(modelKey) {
        const config = this.modelConfigs[modelKey];
        if (!config) {
            throw new Error(`Unknown model: ${modelKey}`);
        }

        this.log.info(`🎸 Loading ${config.name}...`);

        try {
            // If configured for procedural, create enhanced model
            if (config.useProcedural) {
                this.log.info(`📦 Creating enhanced procedural ${config.name}`);
                return this.createEnhancedProceduralModel(modelKey, config);
            }

            // Try to load model from URL (for future CDN models)
            const arrayBuffer = await this.loadOrDownloadModel(config.url);

            if (this.gltfPluginAvailable === false) {
                throw new Error('glTF loader plugin is unavailable - cannot parse .glb');
            }

            // Create blob URL for Babylon.js
            const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
            const blobUrl = URL.createObjectURL(blob);
            
            // Load model with Babylon.js. The blob URL MUST be revoked even when the
            // loader throws (corrupt GLB, missing loaders plugin) — otherwise every
            // failed load permanently pins the whole file in memory.
            let result;
            try {
                result = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                    '',
                    blobUrl,
                    this.scene,
                    null,
                    '.glb'
                );
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
            
            // Add to scene
            result.addAllToScene();

            // The glTF loader raises maxSimultaneousLights to scene.lights.length on
            // *every* material in the scene as its last step, which blows past the
            // device budget and makes the GPU report "uniform buffer that is too
            // small" on each draw. Put the whole scene back on budget after the load.
            this._enforceSceneLightBudget();

            // Get root mesh
            const rootMesh = result.meshes[0];
            let placedBox = null;
            if (rootMesh) {
                if (config.placement) {
                    // Size from real-world dimensions and anchor against the measured
                    // world AABB — see the sizing/placement contract in getModelConfigs().
                    placedBox = this._fitAndPlace(rootMesh, config, config.name);
                } else {
                    rootMesh.position = config.position.clone();
                    rootMesh.rotation = config.rotation.clone();
                    rootMesh.scaling = config.scale.clone();
                }

                // Rig ceiling/truss-flown speakers off the box we just measured, so the
                // chains always span the real gap instead of a hard-coded guess.
                if (config.rigging && placedBox) {
                    this.createSpeakerHangingHardware(modelKey, {
                        x: config.placement.centerX,
                        z: config.placement.centerZ,
                        topY: placedBox.max.y,
                        anchorY: config.rigging.anchorY,
                        yaw: config.rigging.yaw || 0
                    });
                }
            }
            const focusPoint = placedBox ? placedBox.center : (config.position || BABYLON.Vector3.Zero());
            
            // CRITICAL: Configure all meshes for optimal VR and desktop visibility
            result.meshes.forEach(mesh => {
                // Ensure mesh is visible and pickable
                mesh.isVisible = true;
                mesh.visibility = 1.0;
                mesh.renderingGroupId = 0; // Default rendering group
                
                // Apply external textures for PA speakers (PBR materials with proper textures)
                if (config.applyExternalTextures && modelKey.startsWith('pa_speaker')) {
                    this.applyPASpeakerTextures(mesh, config.textureBasePath);
                }
                // Apply custom black material if requested (e.g., for PA speakers)
                else if (config.makeBlack && this.materialFactory) {
                    const meshName = mesh.name.toLowerCase();
                    // Intelligent material assignment based on mesh name
                    // PA Speaker specific mapping - more granular for visual differentiation
                    if (modelKey.startsWith('pa_speaker')) {
                        if (meshName.includes('grill') || meshName.includes('front') || meshName.includes('mesh') || meshName.includes('bar') || meshName.includes('grille')) {
                            mesh.material = this.materialFactory.getPreset('speakerGrill');
                        } else if (meshName.includes('horn') || meshName.includes('tweeter') || meshName.includes('flare') || meshName.includes('compression')) {
                            mesh.material = this.materialFactory.getPreset('speakerHorn');
                        } else if (meshName.includes('woofer') || meshName.includes('cone') || meshName.includes('diaphragm')) {
                            mesh.material = this.materialFactory.getPreset('speakerWoofer');
                        } else if (meshName.includes('dustcap') || meshName.includes('dust') || meshName.includes('cap') || meshName.includes('dome')) {
                            mesh.material = this.materialFactory.getPreset('speakerDustCap');
                        } else if (meshName.includes('surround') || meshName.includes('suspension') || meshName.includes('rubber')) {
                            mesh.material = this.materialFactory.getPreset('speakerSurround');
                        } else if (meshName.includes('mid') || meshName.includes('driver')) {
                            // Mid-range drivers get horn material (glossy)
                            mesh.material = this.materialFactory.getPreset('speakerHorn');
                        } else {
                            // Default to matte black body for everything else (cabinet, back, sides)
                            mesh.material = this.materialFactory.getPreset('speakerBody');
                        }
                    } else {
                        // Generic fallback for other black models
                        if (meshName.includes('grill') || meshName.includes('front') || meshName.includes('mesh')) {
                            mesh.material = this.materialFactory.getPreset('speakerGrill');
                        } else if (meshName.includes('horn') || meshName.includes('tweeter')) {
                            mesh.material = this.materialFactory.getPreset('speakerHorn');
                        } else {
                            mesh.material = this.materialFactory.getPreset('speakerBody');
                        }
                    }
                    this.log.info(`   🎨 Applied hyperrealistic material to ${mesh.name}`);
                }
                
                if (mesh.material) {
                    // Limit lights based on device capability (from MaterialFactory)
                    const maxLights = this.maxLights;
                    mesh.material.maxSimultaneousLights = maxLights;
                    this.log.info(`   🔧 Limited lights on ${mesh.name} to ${maxLights}`);
                    
                    // Externally-textured PBR materials (e.g. PA speakers) are already
                    // tuned by applyPASpeakerTextures(). Adding a uniform emissive/ambient
                    // here would flatten the texture detail and produce a hazy washed-out
                    // single-color appearance under bloom. Skip the cosmetic override.
                    if (!mesh.material._isExternallyTextured) {
                        // Add subtle ambient brightness - reduced to avoid washed-out VR appearance
                        if (mesh.material.emissiveColor !== undefined) {
                            mesh.material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Minimal glow
                        }
                        // Moderate ambient for visibility without washing out
                        if (mesh.material.ambientColor !== undefined) {
                            mesh.material.ambientColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Reduced
                        }
                    }
                    
                    // CRITICAL: Ensure materials are fully opaque in VR
                    if (mesh.material.alpha !== undefined) {
                        mesh.material.alpha = 1.0; // Fully opaque
                    }
                    if (mesh.material.transparencyMode !== undefined) {
                        // Fix: Set to OPAQUE (0) instead of null
                        mesh.material.transparencyMode = 0; // BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE
                    }
                    
                    // Ensure proper rendering in VR and prevent see-through
                    mesh.material.backFaceCulling = true;
                    mesh.material.needDepthPrePass = false; // Disable depth pre-pass that can cause transparency issues
                    mesh.material.disableDepthWrite = false; // CRITICAL: Enable depth write to prevent see-through
                    mesh.material.separateCullingPass = false; // Disable separate culling pass
                    
                    // Force opaque rendering
                    mesh.material.needAlphaBlending = () => false;
                    mesh.material.needAlphaTesting = () => false;
                    
                    // Set rendering group to ensure DJ gear renders BEFORE beams (renderingGroupId 0 vs 1)
                    mesh.renderingGroupId = 0; // Default group, renders first
                    
                    // Force material to be ready
                    mesh.material.forceCompilation(mesh);
                }
            });
            
            // Add a dedicated point light above the DJ console for visibility (VR and desktop)
            if (modelKey === 'dj_console' && rootMesh) {
                const djLight = new BABYLON.PointLight(
                    'djConsoleLight',
                    new BABYLON.Vector3(
                        focusPoint.x,
                        focusPoint.y + 1.5,
                        focusPoint.z
                    ),
                    this.scene
                );
                djLight.intensity = 2.0; // Increased for better VR visibility
                djLight.range = 8; // Wider range
                djLight.diffuse = new BABYLON.Color3(1, 1, 1);
                this.log.info(`   💡 Added dedicated light above DJ console (intensity: 2.0)`);
                
                // Hide procedural CDJs when real model loads (they conflict)
                const leftCDJ = this.scene.getMeshByName('leftCDJ');
                const rightCDJ = this.scene.getMeshByName('rightCDJ');
                const leftJog = this.scene.getMeshByName('leftJog');
                const rightJog = this.scene.getMeshByName('rightJog');
                const mixer = this.scene.getMeshByName('mixer');
                const mixerDisplay = this.scene.getMeshByName('mixerDisplay');
                
                if (leftCDJ) leftCDJ.setEnabled(false);
                if (rightCDJ) rightCDJ.setEnabled(false);
                if (leftJog) leftJog.setEnabled(false);
                if (rightJog) rightJog.setEnabled(false);
                if (mixer) mixer.setEnabled(false);
                if (mixerDisplay) mixerDisplay.setEnabled(false);
                
                this.log.info(`   🚫 Hidden procedural CDJ/mixer objects to avoid conflicts`);
            }
            
            // Add lights for PA speakers for better visibility
            if ((modelKey === 'pa_speaker_left' || modelKey === 'pa_speaker_right') && rootMesh) {
                // Position light near the speaker (slightly in front for hung speakers)
                const speakerLight = new BABYLON.PointLight(
                    'speakerLight_' + modelKey,
                    new BABYLON.Vector3(
                        focusPoint.x,
                        focusPoint.y + (config.hangFromTruss ? 0 : 2),
                        focusPoint.z + (config.hangFromTruss ? 1.5 : 0) // In front when flown
                    ),
                    this.scene
                );
                speakerLight.intensity = 0.8; // Reduced intensity
                speakerLight.range = 8; // Wider range for hung speakers
                speakerLight.diffuse = new BABYLON.Color3(1, 1, 1);
                this.log.info(`   💡 Added light for ${config.name} (${config.hangFromTruss ? 'truss-flown' : 'floor-standing'})`);
                
                // Ensure PA speakers are fully opaque and render properly
                // Also make them BLACK if configured
                result.meshes.forEach(speakerMesh => {
                    speakerMesh.alphaIndex = 0; // Render first (opaque objects)
                    if (speakerMesh.material) {
                        speakerMesh.material.needAlphaBlending = () => false; // Force opaque
                        speakerMesh.material.needAlphaTesting = () => false; // No alpha testing
                        speakerMesh.material.disableDepthWrite = false; // Enable depth write
                        
                        // Ensure 100% opacity
                        if (speakerMesh.material.alpha !== undefined) {
                            speakerMesh.material.alpha = 1.0;
                        }
                        
                        // Make speakers BLACK if configured
                        if (config.makeBlack) {
                            if (speakerMesh.material.albedoColor !== undefined) {
                                speakerMesh.material.albedoColor = new BABYLON.Color3(0.01, 0.01, 0.01); // Darker black (was 0.05)
                            }
                            if (speakerMesh.material.baseColor !== undefined) {
                                speakerMesh.material.baseColor = new BABYLON.Color3(0.01, 0.01, 0.01);
                            }
                            if (speakerMesh.material.diffuseColor !== undefined) {
                                speakerMesh.material.diffuseColor = new BABYLON.Color3(0.01, 0.01, 0.01);
                            }
                        }
                    }
                });
                this.log.info(`   🔒 Enforced opaque rendering for PA speakers${config.makeBlack ? ' (BLACK)' : ''}`);
            }
            
            this.loadedModels[modelKey] = {
                container: result,
                rootMesh: rootMesh,
                config: config
            };
            
            this.log.info(`✅ ${config.name} loaded successfully`);
            
            // Log attribution for CC BY licensed models
            if (config.attribution) {
                this.log.info(`   📜 ${config.attribution}`);
            }
            
            return result;
            
        } catch (error) {
            this.log.warn(`⚠️ Failed to load ${config.name}, using enhanced procedural:`, error);
            
            // Create enhanced procedural model
            return this.createEnhancedProceduralModel(modelKey, config);
        }
    }

    /** Clamps every material in the scene back to the device light budget. */
    _enforceSceneLightBudget() {
        if (!this.scene) return;
        let clamped = 0;
        for (const mat of this.scene.materials) {
            if (mat.maxSimultaneousLights === undefined) continue;
            if (mat.maxSimultaneousLights === this.maxLights) continue;
            mat.maxSimultaneousLights = this.maxLights;
            clamped++;
        }
        if (clamped > 0) {
            this.log.info(`   🔧 Re-clamped ${clamped} material(s) to ${this.maxLights} light(s)`);
        }
    }

    createEnhancedProceduralModel(modelKey, config) {
        this.log.info(`📦 Creating enhanced procedural model for ${config.name}`);
        
        const parent = new BABYLON.TransformNode(modelKey, this.scene);
        parent.position = (config.position || BABYLON.Vector3.Zero()).clone();
        parent.rotation = (config.rotation || BABYLON.Vector3.Zero()).clone();
        parent.scaling = (config.scale || BABYLON.Vector3.One()).clone();
        
        let meshes = [];
        
        if (config.type === 'cdj') {
            meshes = this.createEnhancedCDJ(modelKey, parent);
        } else if (config.type === 'mixer') {
            meshes = this.createEnhancedMixer(modelKey, parent);
        } else if (config.type === 'pa_speaker') {
            meshes = this.createEnhancedPASpeaker(modelKey, parent);
        }
        
        this.loadedModels[modelKey] = {
            rootMesh: parent,
            meshes: meshes,
            config: config
        };
        
        return { meshes: [parent, ...meshes] };
    }

    createEnhancedCDJ(name, parent) {
        const meshes = [];
        
        // Main body
        const body = BABYLON.MeshBuilder.CreateBox(name + '_body', {
            width: 0.45, height: 0.08, depth: 0.35
        }, this.scene);
        body.parent = parent;
        body.position.y = 0.04;
        
        let bodyMat;
        if (this.materialFactory) {
            bodyMat = this.materialFactory.createStandardMaterial(name + '_body_mat', {
                diffuseColor: [0.08, 0.08, 0.1],
                specularColor: [0.2, 0.2, 0.2],
                roughness: 0.6
            });
        } else {
            bodyMat = new BABYLON.StandardMaterial(name + '_body_mat', this.scene);
            bodyMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
            bodyMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            bodyMat.roughness = 0.6;
        }
        body.material = bodyMat;
        meshes.push(body);
        
        // Jog wheel (platter)
        const platter = BABYLON.MeshBuilder.CreateCylinder(name + '_platter', {
            diameter: 0.2, height: 0.02
        }, this.scene);
        platter.parent = parent;
        platter.position.set(0, 0.09, 0.05);
        
        let platterMat;
        if (this.materialFactory) {
            platterMat = this.materialFactory.createStandardMaterial(name + '_platter_mat', {
                diffuseColor: [0.02, 0.02, 0.02],
                emissiveColor: [0, 0.15, 0.3], // Blue glow
                specularColor: [0.8, 0.8, 0.8]
            });
        } else {
            platterMat = new BABYLON.StandardMaterial(name + '_platter_mat', this.scene);
            platterMat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.02);
            platterMat.emissiveColor = new BABYLON.Color3(0, 0.15, 0.3);
            platterMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        }
        platter.material = platterMat;
        meshes.push(platter);
        
        // Display screen
        const screen = BABYLON.MeshBuilder.CreatePlane(name + '_screen', {
            width: 0.25, height: 0.04
        }, this.scene);
        screen.parent = parent;
        screen.position.set(0, 0.085, -0.1);
        screen.rotation.x = Math.PI / 2;
        
        let screenMat;
        if (this.materialFactory) {
            screenMat = this.materialFactory.createStandardMaterial(name + '_screen_mat', {
                diffuseColor: [0, 0, 0],
                emissiveColor: [0, 0.4, 0.6] // Cyan glow
            });
        } else {
            screenMat = new BABYLON.StandardMaterial(name + '_screen_mat', this.scene);
            screenMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            screenMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0.6);
        }
        screen.material = screenMat;
        meshes.push(screen);
        
        // Control buttons (grid of small boxes)
        for (let i = 0; i < 8; i++) {
            const button = BABYLON.MeshBuilder.CreateBox(name + '_btn' + i, {
                width: 0.025, height: 0.01, depth: 0.025
            }, this.scene);
            button.parent = parent;
            button.position.set(-0.15 + (i * 0.04), 0.085, 0.12);
            
            const emissive = i % 2 === 0 ? [0.3, 0, 0] : [0, 0.3, 0];
            
            let btnMat;
            if (this.materialFactory) {
                btnMat = this.materialFactory.createStandardMaterial(name + '_btn' + i + '_mat', {
                    diffuseColor: [0.1, 0.1, 0.1],
                    emissiveColor: emissive
                });
            } else {
                btnMat = new BABYLON.StandardMaterial(name + '_btn' + i + '_mat', this.scene);
                btnMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                btnMat.emissiveColor = new BABYLON.Color3(emissive[0], emissive[1], emissive[2]);
            }
            button.material = btnMat;
            meshes.push(button);
        }
        
        return meshes;
    }

    createEnhancedMixer(name, parent) {
        const meshes = [];
        
        // Main body
        const body = BABYLON.MeshBuilder.CreateBox(name + '_body', {
            width: 0.65, height: 0.1, depth: 0.4
        }, this.scene);
        body.parent = parent;
        body.position.y = 0.05;
        
        let bodyMat;
        if (this.materialFactory) {
            bodyMat = this.materialFactory.createStandardMaterial(name + '_body_mat', {
                diffuseColor: [0.05, 0.05, 0.06],
                specularColor: [0.15, 0.15, 0.15],
                roughness: 0.7
            });
        } else {
            bodyMat = new BABYLON.StandardMaterial(name + '_body_mat', this.scene);
            bodyMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
            bodyMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
            bodyMat.roughness = 0.7;
        }
        body.material = bodyMat;
        meshes.push(body);
        
        // Channel faders (3 channels)
        for (let i = 0; i < 3; i++) {
            const fader = BABYLON.MeshBuilder.CreateBox(name + '_fader' + i, {
                width: 0.03, height: 0.015, depth: 0.12
            }, this.scene);
            fader.parent = parent;
            fader.position.set(-0.2 + (i * 0.2), 0.108, -0.05);
            
            let faderMat;
            if (this.materialFactory) {
                faderMat = this.materialFactory.createStandardMaterial(name + '_fader' + i + '_mat', {
                    diffuseColor: [0.8, 0.8, 0.8],
                    specularColor: [1, 1, 1]
                });
            } else {
                faderMat = new BABYLON.StandardMaterial(name + '_fader' + i + '_mat', this.scene);
                faderMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
                faderMat.specularColor = new BABYLON.Color3(1, 1, 1);
            }
            fader.material = faderMat;
            meshes.push(fader);
        }
        
        // EQ knobs (3 per channel)
        for (let ch = 0; ch < 3; ch++) {
            for (let eq = 0; eq < 3; eq++) {
                const knob = BABYLON.MeshBuilder.CreateCylinder(name + '_knob_' + ch + '_' + eq, {
                    diameter: 0.025, height: 0.015
                }, this.scene);
                knob.parent = parent;
                knob.position.set(-0.2 + (ch * 0.2), 0.115, 0.08 - (eq * 0.04));
                
                let knobMat;
                if (this.materialFactory) {
                    knobMat = this.materialFactory.createStandardMaterial(name + '_knob_mat', {
                        diffuseColor: [0.1, 0.1, 0.1],
                        specularColor: [0.5, 0.5, 0.5]
                    }, true); // Shared material
                } else {
                    knobMat = new BABYLON.StandardMaterial(name + '_knob_mat', this.scene);
                    knobMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                    knobMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
                }
                knob.material = knobMat;
                meshes.push(knob);
            }
        }
        
        // Master section with VU meters
        const vuMeter = BABYLON.MeshBuilder.CreatePlane(name + '_vu', {
            width: 0.15, height: 0.06
        }, this.scene);
        vuMeter.parent = parent;
        vuMeter.position.set(0, 0.105, 0.15);
        vuMeter.rotation.x = Math.PI / 2;
        
        let vuMat;
        if (this.materialFactory) {
            vuMat = this.materialFactory.createStandardMaterial(name + '_vu_mat', {
                diffuseColor: [0, 0, 0],
                emissiveColor: [0.8, 0, 0] // Red VU meter
            });
        } else {
            vuMat = new BABYLON.StandardMaterial(name + '_vu_mat', this.scene);
            vuMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            vuMat.emissiveColor = new BABYLON.Color3(0.8, 0, 0);
        }
        vuMeter.material = vuMat;
        meshes.push(vuMeter);
        
        return meshes;
    }

    createEnhancedPASpeaker(name, parent) {
        const meshes = [];
        
        // Main speaker cabinet
        const cabinet = BABYLON.MeshBuilder.CreateBox(name + '_cabinet', {
            width: 0.8, height: 1.8, depth: 0.7
        }, this.scene);
        cabinet.parent = parent;
        
        let cabinetMat;
        if (this.materialFactory) {
            cabinetMat = this.materialFactory.createStandardMaterial(name + '_cabinet_mat', {
                diffuseColor: [0.12, 0.12, 0.12],
                specularColor: [0.05, 0.05, 0.05],
                roughness: 0.9
            });
        } else {
            cabinetMat = new BABYLON.StandardMaterial(name + '_cabinet_mat', this.scene);
            cabinetMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.12);
            cabinetMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            cabinetMat.roughness = 0.9;
        }
        cabinet.material = cabinetMat;
        meshes.push(cabinet);
        
        // Woofer (large speaker cone)
        const woofer = BABYLON.MeshBuilder.CreateCylinder(name + '_woofer', {
            diameter: 0.5, height: 0.1
        }, this.scene);
        woofer.parent = parent;
        woofer.position.set(0, -0.3, 0.36);
        woofer.rotation.x = Math.PI / 2;
        
        let wooferMat;
        if (this.materialFactory) {
            wooferMat = this.materialFactory.createStandardMaterial(name + '_woofer_mat', {
                diffuseColor: [0.05, 0.05, 0.05],
                specularColor: [0.1, 0.1, 0.1]
            });
        } else {
            wooferMat = new BABYLON.StandardMaterial(name + '_woofer_mat', this.scene);
            wooferMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            wooferMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        }
        woofer.material = wooferMat;
        meshes.push(woofer);
        
        // Mid-range speaker
        const midRange = BABYLON.MeshBuilder.CreateCylinder(name + '_mid', {
            diameter: 0.25, height: 0.08
        }, this.scene);
        midRange.parent = parent;
        midRange.position.set(0, 0.3, 0.36);
        midRange.rotation.x = Math.PI / 2;
        
        let midMat;
        if (this.materialFactory) {
            midMat = this.materialFactory.createStandardMaterial(name + '_mid_mat', {
                diffuseColor: [0.08, 0.08, 0.08],
                specularColor: [0.15, 0.15, 0.15]
            });
        } else {
            midMat = new BABYLON.StandardMaterial(name + '_mid_mat', this.scene);
            midMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
            midMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        }
        midRange.material = midMat;
        meshes.push(midRange);
        
        // Tweeter (horn)
        const tweeter = BABYLON.MeshBuilder.CreateCylinder(name + '_tweeter', {
            diameterTop: 0.12, diameterBottom: 0.06, height: 0.15
        }, this.scene);
        tweeter.parent = parent;
        tweeter.position.set(0, 0.65, 0.38);
        tweeter.rotation.x = Math.PI / 2;
        
        let tweeterMat;
        if (this.materialFactory) {
            tweeterMat = this.materialFactory.createStandardMaterial(name + '_tweeter_mat', {
                diffuseColor: [0.9, 0.9, 0.9],
                specularColor: [1, 1, 1]
            });
            // StandardMaterial doesn't have metallic property directly, but we can simulate or ignore
        } else {
            tweeterMat = new BABYLON.StandardMaterial(name + '_tweeter_mat', this.scene);
            tweeterMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            tweeterMat.specularColor = new BABYLON.Color3(1, 1, 1);
        }
        tweeter.material = tweeterMat;
        meshes.push(tweeter);
        
        // Grille mesh effect (multiple bars)
        for (let i = 0; i < 10; i++) {
            const bar = BABYLON.MeshBuilder.CreateBox(name + '_bar' + i, {
                width: 0.7, height: 0.01, depth: 0.01
            }, this.scene);
            bar.parent = parent;
            bar.position.set(0, -0.8 + (i * 0.18), 0.355);
            
            let barMat;
            if (this.materialFactory) {
                barMat = this.materialFactory.createStandardMaterial(name + '_bar_mat', {
                    diffuseColor: [0.15, 0.15, 0.15],
                    alpha: 0.8
                });
            } else {
                barMat = new BABYLON.StandardMaterial(name + '_bar_mat', this.scene);
                barMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
                barMat.alpha = 0.8;
            }
            bar.material = barMat;
            meshes.push(bar);
        }
        
        return meshes;
    }

    /**
     * Build the rigging that flies a PA speaker from the lighting truss:
     * truss clamp, drop bracket, two chains, shackles and a flying frame.
     *
     * Every dimension is derived from the anchor and the MEASURED cabinet, so the
     * chain always spans the real gap. The previous version hard-coded a ceiling
     * height of 8.0 m and a fixed link count, which left the chain running 0.7 m
     * past the flying frame into empty air while the bracket floated 1.85 m below
     * the actual ceiling, bolted to nothing.
     *
     * @param {string} modelKey
     * @param {{x: number, z: number, topY: number, anchorY: number, yaw: number}} rig
     *        anchorY is the truss chord centre-line; topY is the highest point of
     *        the flown cabinet; yaw matches the speaker's toe-in so the hardware
     *        lines up with the box.
     */
    createSpeakerHangingHardware(modelKey, rig) {
        const CHORD_RADIUS = 0.17;   // Truss chord half-height (chords span y ±0.17)
        const { x, z, topY, anchorY, yaw } = rig;

        // Local ±offset rotated into world space by the speaker's toe-in angle.
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const offsetX = d => x + d * cos;
        const offsetZ = d => z - d * sin;

        const bracketY = anchorY - CHORD_RADIUS - 0.04; // Hangs directly under the chord
        const flyBarY = topY + 0.05;                    // Sits just clear of the cabinet
        
        // Material for all metal hardware (black steel rigging)
        const rigMat = this.materialFactory ? 
            this.materialFactory.createPBRMaterial('rigMat_' + modelKey, {
                baseColor: [0.08, 0.08, 0.08], // Dark steel
                metallic: 0.9,
                roughness: 0.35
            }, true) :
            new BABYLON.StandardMaterial('rigMat_' + modelKey, this.scene);
        
        // === DROP BRACKET (bolted under the truss chord) ===
        const bracket = BABYLON.MeshBuilder.CreateBox('speakerBracket_' + modelKey, {
            width: 0.4,
            height: 0.08,
            depth: 0.15
        }, this.scene);
        bracket.position = new BABYLON.Vector3(x, bracketY, z);
        bracket.rotation.y = yaw;
        bracket.material = rigMat;
        
        // Truss clamp (U-bolt style) wrapping the chord itself
        const clamp = BABYLON.MeshBuilder.CreateTorus('speakerClamp_' + modelKey, {
            diameter: 0.12,
            thickness: 0.015,
            tessellation: 16,
            arc: 0.75
        }, this.scene);
        clamp.position = new BABYLON.Vector3(x, anchorY, z);
        clamp.rotation.x = Math.PI / 2;
        clamp.material = rigMat;
        
        // === CHAIN LINKS (2 parallel chains for stability) ===
        const chainOffsets = [-0.12, 0.12]; // Two chains, offset from centre
        const chainTop = bracketY - 0.06;
        const chainBottom = flyBarY + 0.08;
        const chainSpan = Math.max(0, chainTop - chainBottom);
        // Fit whole links to the gap rather than flooring against a fixed pitch, so
        // the chain neither falls short of nor overshoots the flying frame.
        const numLinks = Math.max(2, Math.round(chainSpan / 0.075));
        const linkStep = chainSpan / (numLinks - 1);
        
        chainOffsets.forEach((offset, chainIdx) => {
            for (let i = 0; i < numLinks; i++) {
                // Alternate link orientation for chain appearance
                const link = BABYLON.MeshBuilder.CreateTorus('chainLink_' + modelKey + '_' + chainIdx + '_' + i, {
                    diameter: 0.04,
                    thickness: 0.008,
                    tessellation: 8
                }, this.scene);
                
                link.position = new BABYLON.Vector3(
                    offsetX(offset),
                    chainTop - (i * linkStep),
                    offsetZ(offset)
                );
                
                // Alternate rotation for interlocking appearance
                if (i % 2 === 0) {
                    link.rotation.y = Math.PI / 2 + yaw;
                } else {
                    link.rotation.x = Math.PI / 2;
                    link.rotation.y = yaw;
                }
                
                link.material = rigMat;
            }
        });
        
        // === SHACKLES (connect chains to the flying frame) ===
        chainOffsets.forEach((offset, shackleIdx) => {
            // D-shackle at bottom of each chain
            const shackle = BABYLON.MeshBuilder.CreateTorus('shackle_' + modelKey + '_' + shackleIdx, {
                diameter: 0.06,
                thickness: 0.01,
                tessellation: 12,
                arc: 0.7
            }, this.scene);
            shackle.position = new BABYLON.Vector3(
                offsetX(offset),
                flyBarY + 0.045, // Straddles the eye bolt below it
                offsetZ(offset)
            );
            shackle.rotation.z = Math.PI; // Open side up
            shackle.rotation.y = yaw;
            shackle.material = rigMat;
            
            // Shackle pin (bolt)
            const pin = BABYLON.MeshBuilder.CreateCylinder('shacklePin_' + modelKey + '_' + shackleIdx, {
                diameter: 0.015,
                height: 0.08
            }, this.scene);
            pin.position = new BABYLON.Vector3(
                offsetX(offset),
                flyBarY + 0.015,
                offsetZ(offset)
            );
            pin.rotation.z = Math.PI / 2;
            pin.rotation.y = yaw;
            pin.material = rigMat;
        });
        
        // === FLYING FRAME (top mounting point on speaker) ===
        // Steel bar across top of speaker where chains attach
        const flyBar = BABYLON.MeshBuilder.CreateBox('flyBar_' + modelKey, {
            width: 0.5,
            height: 0.04,
            depth: 0.04
        }, this.scene);
        flyBar.position = new BABYLON.Vector3(x, flyBarY, z);
        flyBar.rotation.y = yaw;
        flyBar.material = rigMat;
        
        // Eye bolts on flying frame (where shackles attach)
        chainOffsets.forEach((offset, eyeIdx) => {
            const eyeBolt = BABYLON.MeshBuilder.CreateTorus('eyeBolt_' + modelKey + '_' + eyeIdx, {
                diameter: 0.03,
                thickness: 0.006,
                tessellation: 10
            }, this.scene);
            eyeBolt.position = new BABYLON.Vector3(
                offsetX(offset),
                flyBarY,
                offsetZ(offset)
            );
            eyeBolt.rotation.x = Math.PI / 2;
            eyeBolt.rotation.z = yaw;
            eyeBolt.material = rigMat;
        });
        
        this.log.info(`   ⛓️ Rigged ${modelKey}: ${numLinks}-link chains spanning ${chainSpan.toFixed(2)}m from truss y=${anchorY} to fly bar y=${flyBarY.toFixed(2)}`);
    }

    /**
     * Apply external PBR textures to PA speaker meshes.
     * One shared material is created per (texture-set, model) and reused across
     * every mesh of the speaker — the previous version built an entire PBR
     * material + 5 texture loads PER MESH (~10 meshes × 2 speakers = ~100
     * texture downloads of the same files).
     *
     * Also: we now use PBRMetallicRoughnessMaterial.metallicRoughnessTexture
     * (instead of PBRMaterial.microSurfaceTexture, which expects smoothness =
     * 1 - roughness and was producing inverted glossiness on the speakers).
     */
    applyPASpeakerTextures(mesh, textureBasePath) {
        if (!mesh || mesh.name === '__root__') return;

        // Cache shared material per texture base path so all speaker meshes reuse it.
        this._paSpeakerMatCache = this._paSpeakerMatCache || new Map();
        let mat = this._paSpeakerMatCache.get(textureBasePath);

        if (!mat) {
            this.log.info(`   🎨 Building shared PBR material for PA speakers (${textureBasePath})`);

            const albedoPath    = textureBasePath + 'small_speaker_1_1001_albedo.jpg';
            const normalPath    = textureBasePath + 'small_speaker_1_1001_normal.png';
            // No separate metallic map: the metallic channel lives in the
            // metallicRoughness texture per the glTF convention.
            const roughnessPath = textureBasePath + 'small_speaker_1_1001_roughness.jpg';
            const aoPath        = textureBasePath + 'small_speaker_1_1001_AO.jpg';

            // Use PBRMetallicRoughnessMaterial: roughness map plugs in directly without
            // the inverted-smoothness pitfall of the legacy PBRMaterial.microSurfaceTexture.
            mat = new BABYLON.PBRMetallicRoughnessMaterial('paSpeakerSharedMat', this.scene);
            mat.baseColor = new BABYLON.Color3(1, 1, 1);
            mat.metallic = 0.1;
            mat.roughness = 0.7;

            const sampling = BABYLON.Texture.TRILINEAR_SAMPLINGMODE;
            // invertY=false for GLTF UVs.
            mat.baseTexture = new BABYLON.Texture(albedoPath, this.scene, false, false, sampling,
                () => this.log.info(`   ✅ Loaded albedo: ${albedoPath}`),
                (m) => { this.log.warn(`   ⚠️ Failed to load albedo: ${albedoPath} - ${m}`); mat.baseColor = new BABYLON.Color3(1, 0, 1); }
            );
            mat.baseTexture.hasAlpha = false;

            mat.normalTexture = new BABYLON.Texture(normalPath, this.scene, false, false, sampling,
                () => this.log.info(`   ✅ Loaded normal: ${normalPath}`),
                (m) => this.log.warn(`   ⚠️ Failed to load normal: ${normalPath} - ${m}`)
            );

            // metallicRoughnessTexture: metallic in B, roughness in G (GLTF spec).
            // Texture file in this asset already encodes roughness in G channel.
            mat.metallicRoughnessTexture = new BABYLON.Texture(roughnessPath, this.scene, false, false, sampling,
                () => this.log.info(`   ✅ Loaded metallic/roughness: ${roughnessPath}`),
                (m) => this.log.warn(`   ⚠️ Failed to load metallic/roughness: ${roughnessPath} - ${m}`)
            );

            mat.occlusionTexture = new BABYLON.Texture(aoPath, this.scene, false, false, sampling,
                () => this.log.info(`   ✅ Loaded AO: ${aoPath}`),
                (m) => this.log.warn(`   ⚠️ Failed to load AO: ${aoPath} - ${m}`)
            );

            const maxLights = this.maxLights;
            mat.maxSimultaneousLights = maxLights;
            mat.alpha = 1.0;
            mat.transparencyMode = BABYLON.PBRBaseMaterial.PBRMATERIAL_OPAQUE !== undefined
                ? BABYLON.PBRBaseMaterial.PBRMATERIAL_OPAQUE
                : 0;
            mat.backFaceCulling = true;
            mat.disableDepthWrite = false;
            mat.separateCullingPass = false;

            // Mark this material so the generic per-mesh override loop in loadModel()
            // knows NOT to stomp emissive/ambient on it. Adding a uniform 0.1 emissive
            // to a properly-textured PBR surface flattens all the texture detail and
            // makes edges bloom out — the surface ends up looking like a hazy single
            // color in VR. The textures + scene lighting already provide the look.
            mat._isExternallyTextured = true;

            this._paSpeakerMatCache.set(textureBasePath, mat);
        }

        mesh.material = mat;
    }

    async loadAllModels() {
        this.log.info('🎸 Starting model download and caching...');
        const startTime = performance.now();
        
        // Load models in priority order
        const modelKeys = Object.keys(this.modelConfigs);
        
        try {
            // Load DJ console first (most important)
            if (modelKeys.includes('dj_console')) {
                await this.loadModel('dj_console');
            }
            
            // Then load speakers in parallel
            const speakers = modelKeys.filter(k => k.startsWith('pa_speaker'));
            await Promise.allSettled(speakers.map(key => this.loadModel(key)));
            
            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            this.log.info(`✅ All models loaded in ${loadTime}s`);
            this.log.info('📜 Model Attributions:');
            
            // Display all attributions
            for (const key of modelKeys) {
                const config = this.modelConfigs[key];
                if (config.attribution) {
                    this.log.info(`   • ${config.attribution}`);
                }
            }
            
            return this.loadedModels;
        } catch (error) {
            this.log.error('❌ Model loading failed:', error);
            throw error;
        }
    }

    async clearAllCaches() {
        await this.cache.clear();
    }
}

// Export for use in main club script
window.ModelLoader = ModelLoader;
