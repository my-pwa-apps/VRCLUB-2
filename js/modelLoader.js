'use strict';
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
    constructor(scene, materialFactory = null, logger = null, maxLights = null, { lightFactory = null, textureLoader = null } = {}) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        // Optional shared factories. With them, the accent lights are registered (so
        // LightFactory.disposeAll()/getStats() see them) and PA speaker textures get the
        // IndexedDB cache, download deadline and in-flight de-duplication.
        this.lightFactory = lightFactory;
        this.textureLoader = textureLoader;
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
        this.abortController = new AbortController();
        this.modelConfigs = this.getModelConfigs();
        this.loadedModels = {}; // Store loaded model containers
    }

    /**
     * Fallback light budget for the standalone case (no VRClub instance to ask).
     * MUST agree with VRClub.detectMaxLights() in js/club/01-core.js - exceeding the
     * device budget produces GL_INVALID_OPERATION / "uniform buffer too small", and
     * this is the single most safety-critical constant in the renderer.
     */
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
                // No sign flip: _fitAndPlace() now preserves the glTF loader's handedness
                // conversion, which is what the former scale.x = -1 "unmirror" replaced.
                scale: new BABYLON.Vector3(1, 1, 1),
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
                attribution: 'Pioneer DJ Console by TwoPixels.studio (CC BY 4.0)'
            },
            pa_speaker_left: {
                name: 'PA Speaker (Left)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                // Face the floor with a 30° down-tilt/inward toe, keeping the horn on top.
                rotation: new BABYLON.Vector3(-Math.PI / 6, Math.PI + Math.PI / 6, 0),
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
                makeBlack: false, // Disable black override to use textures
                applyExternalTextures: true, // Enable external textures
                textureBasePath: './js/models/paspeakers/source/authored/textures/',
                hangFromTruss: true,
                attribution: 'Stage Speaker - black by Sousinho (CC BY 4.0; optimized textures)'
            },
            pa_speaker_right: {
                name: 'PA Speaker (Right)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                rotation: new BABYLON.Vector3(-Math.PI / 6, Math.PI - Math.PI / 6, 0),
                scale: new BABYLON.Vector3(1, 1, 1),
                placement: {
                    fitAxis: 'y',
                    fitSize: 1.45,
                    centerX: CLUB_POSITIONS.paSpeakers.right.x,
                    centerZ: CLUB_POSITIONS.paSpeakers.right.z,
                    topY: CLUB_POSITIONS.paSpeakers.right.y
                },
                rigging: { anchorY: 8.0, yaw: -Math.PI / 6 },
                makeBlack: false, // Disable black override to use textures
                applyExternalTextures: true, // Enable external textures
                textureBasePath: './js/models/paspeakers/source/authored/textures/',
                hangFromTruss: true,
                attribution: 'Stage Speaker - black by Sousinho (CC BY 4.0; optimized textures)'
            },
            // Bass Bin 3 by darksoundlab (CC BY 4.0), one under each flown PA. Placed from the speaker's real underside
            // (_resolveHangPlacement); its mouth faces the way the speaker does.
            bass_bin_left: {
                name: 'Bass Bin (Left)',
                url: './js/models/bassbin/source/bass_bin_3.glb',
                hangFrom: 'pa_speaker_left',
                hangGap: 0.42,
                rotation: new BABYLON.Vector3(0, 0, 0),
                scale: new BABYLON.Vector3(1, 1, 1),
                // A real folded-horn bass bin is about 1.2 m wide; the model is 12.6 x 6.2 x 8.1 units.
                placement: { fitAxis: 'x', fitSize: 1.2 },
                emissiveFloor: 0.03,
                albedoTint: 0.55,
                attribution: 'Bass Bin 3 - Subwoofer by darksoundlab (CC BY 4.0; optimized textures)'
            },
            bass_bin_right: {
                name: 'Bass Bin (Right)',
                url: './js/models/bassbin/source/bass_bin_3.glb',
                hangFrom: 'pa_speaker_right',
                hangGap: 0.42,
                rotation: new BABYLON.Vector3(0, 0, 0),
                scale: new BABYLON.Vector3(1, 1, 1),
                placement: { fitAxis: 'x', fitSize: 1.2 },
                emissiveFloor: 0.03,
                albedoTint: 0.55,
                attribution: 'Bass Bin 3 - Subwoofer by darksoundlab (CC BY 4.0; optimized textures)'
            },
            // Bar stool: Poly Haven "Metal Stool 03" (CC0, Flo Tasser). Only the first stool is placed here; the
            // club instantiates the rest along the counter (VRClubEnvironment._furnishBarStools).
            bar_stool: {
                name: 'Bar Stool',
                url: './js/models/barstool/source/bar_stool.glb',
                rotation: new BABYLON.Vector3(0, 0, 0),
                scale: new BABYLON.Vector3(1, 1, 1),
                placement: { fitAxis: 'y', fitSize: 1.12, centerX: 9.2, centerZ: -12.9, bottomY: 0 },
                attribution: 'Metal Stool 03 by Flo Tasser, Poly Haven (CC0)'
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
    /**
     * Per-axis signs of the loader-authored root transform. Babylon's conversion is
     * an axis-aligned sign flip (rotation of 0 or 180° about Y combined with a ±1
     * scale), so it is representable as signs on the fit scale. Anything else is left
     * alone with a warning rather than guessed at.
     */
    static _rootHandedness(rootMesh) {
        const identity = { x: 1, y: 1, z: 1 };
        if (!rootMesh || typeof rootMesh.computeWorldMatrix !== 'function' || rootMesh.parent) return identity;
        const m = rootMesh.computeWorldMatrix(true).m;
        const offDiagonal = [m[1], m[2], m[4], m[6], m[8], m[9]];
        const unitDiagonal = [m[0], m[5], m[10]].every(v => Math.abs(Math.abs(v) - 1) < 1e-4);
        if (!unitDiagonal || offDiagonal.some(v => Math.abs(v) > 1e-4)) return identity;
        return { x: Math.sign(m[0]), y: Math.sign(m[5]), z: Math.sign(m[10]) };
    }

    _fitAndPlace(rootMesh, config, label) {
        const p = config.placement;
        if (!p) return null;

        // Babylon's glTF loader converts right-handed glTF into this left-handed scene
        // on __root__ (a 180° Y rotation plus scaling.z = -1, i.e. a net X mirror).
        // Step 1 below resets that transform to measure the model, so its axis signs
        // are captured first and folded back in. Discarding them used to mirror every
        // model; the DJ console papered over it with a hand-written scale.x = -1 while
        // the PA speakers rendered mirrored.
        const handedness = ModelLoader._rootHandedness(rootMesh);

        const sign = v => (v < 0 ? -1 : 1);
        const sx = (config.scale ? sign(config.scale.x) : 1) * handedness.x;
        const sy = (config.scale ? sign(config.scale.y) : 1) * handedness.y;
        const sz = (config.scale ? sign(config.scale.z) : 1) * handedness.z;

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

        // Middle of the model's underside (its lowest face in its own frame), in world space: where a flown
        // cabinet is hung from, even when it is tilted.
        rootMesh.computeWorldMatrix(true);
        const bottomCentre = BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3((local.min.x + local.max.x) / 2, local.min.y, (local.min.z + local.max.z) / 2),
            rootMesh.getWorldMatrix());

        return { min: box.min, max: box.max, center: BABYLON.Vector3.Center(box.min, box.max), bottomCentre };
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
            // fetchBufferWithTimeout keeps the deadline alive across the BODY read.
            // With plain fetchWithTimeout the timer was cleared as soon as headers
            // arrived, so a server that answered 200 and then stalled mid-transfer
            // hung startup forever. The largest local GLB is roughly 60 MB, and a
            // software-rendered Quest test can contend heavily with the body read.
            const arrayBuffer = await fetchBufferWithTimeout(url, {
                cache: 'default',
                signal: this.abortController.signal,
                timeoutMs: 120000
            });
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

        // Idempotent. Without this a second call re-parsed the GLB, re-added every
        // mesh, created a duplicate PointLight and overwrote loadedModels[modelKey],
        // orphaning the first AssetContainer with no handle left to dispose it.
        // (InFlightRegistry dedupes the DOWNLOAD, not the parse.)
        if (this.loadedModels[modelKey]) return this.loadedModels[modelKey].container;

        return this.inFlight.run(`model:${modelKey}`, () => this._loadModelOnce(modelKey, config));
    }

    async _loadModelOnce(modelKey, config) {
        this.log.info(`🎸 Loading ${config.name}...`);

        // PHASE 1 - fetch and parse. A failure here has added nothing to the scene.
        let result;
        try {
            const arrayBuffer = await this.loadOrDownloadModel(config.url);

            if (this.gltfPluginAvailable === false) {
                throw new Error('glTF loader plugin is unavailable - cannot parse .glb');
            }

            // Create blob URL for Babylon.js
            const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
            const blobUrl = URL.createObjectURL(blob);
            
            // The blob URL MUST be revoked even when the loader throws (corrupt GLB,
            // missing loaders plugin) - otherwise every failed load permanently pins
            // the whole file in memory.
            try {
                result = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                    '', blobUrl, this.scene, null, '.glb'
                );
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
        } catch (error) {
            this.log.warn(`⚠️ Failed to fetch/parse ${config.name}:`, error);
            return this._modelUnavailable(modelKey, config);
        }

        // PHASE 2 - configure and place. addAllToScene() happens INSIDE this try, so
        // a throw anywhere in the ~200 lines of post-load configuration must roll the
        // geometry back out. Previously a failure here left un-scaled, un-opacified,
        // over-lit GLB meshes sitting at the origin.
        try {
            return await this._configureLoadedModel(modelKey, config, result);
        } catch (error) {
            this.log.warn(`⚠️ Failed to configure ${config.name}:`, error);
            try { result.removeAllFromScene(); } catch (_) { /* ignore */ }
            try { result.dispose(); } catch (_) { /* ignore */ }
            return this._modelUnavailable(modelKey, config);
        }
    }

    /**
     * A model that hangs from another (a bass bin under a flown PA): derive its placement from where the host
     * really ended up, and face it the way the host faces. The bin's mouth is local +z.
     */
    _resolveHangPlacement(modelKey, config) {
        const host = this.loadedModels[config.hangFrom];
        if (!host || !host.placed || !host.placed.bottomCentre || !host.rootMesh) {
            throw new Error(`${modelKey} hangs from ${config.hangFrom}, which is not loaded`);
        }
        const hang = host.placed.bottomCentre;
        const front = BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0, 0, -1), host.rootMesh.getWorldMatrix());
        const yaw = Math.atan2(front.x, front.z);
        return {
            ...config,
            rotation: new BABYLON.Vector3(0, yaw, 0),
            placement: { ...config.placement, centerX: hang.x, centerZ: hang.z, topY: hang.y - config.hangGap },
            hang: { point: hang.clone(), yaw }
        };
    }

    async _configureLoadedModel(modelKey, config, result) {
        if (config.hangFrom) config = this._resolveHangPlacement(modelKey, config);
        {
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
                if (config.hang && placedBox) {
                    this.createBassBinHangingHardware(modelKey, { hangPoint: config.hang.point, topY: placedBox.max.y, yaw: config.hang.yaw, width: config.placement.fitSize });
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
                            const glow = Math.min(0.1, config.emissiveFloor ?? 0.1);
                            mesh.material.emissiveColor = new BABYLON.Color3(glow, glow, glow); // Minimal glow
                        }
                        // Moderate ambient for visibility without washing out
                        if (mesh.material.ambientColor !== undefined) {
                            mesh.material.ambientColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Reduced
                        }
                    }

                    // Show cues deliberately extinguish the moving fixtures for several
                    // bars. Keep imported subjects above the headset display's black level
                    // so a lighting blackout does not read as unloaded geometry.
                    if (!mesh.material._isExternallyTextured && mesh.material.emissiveColor !== undefined) {
                        // Black carpet and plastic turn pale grey under the generic floor, so a model can lower it.
                        const visibilityFloor = config.emissiveFloor ?? 0.12;
                        mesh.material.emissiveColor.r = Math.max(mesh.material.emissiveColor.r, visibilityFloor);
                        mesh.material.emissiveColor.g = Math.max(mesh.material.emissiveColor.g, visibilityFloor);
                        mesh.material.emissiveColor.b = Math.max(mesh.material.emissiveColor.b, visibilityFloor);
                    }
                    
                    // A model can darken its own albedo (the bass bin's carpet is a mid grey, the PA above it is near black).
                    if (config.albedoTint !== undefined && mesh.material.albedoColor && !mesh.material._vrclubTinted) {
                        mesh.material.albedoColor.scaleInPlace(config.albedoTint);
                        mesh.material._vrclubTinted = true;
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
                const djLight = this._createAccentLight('djConsoleLight', new BABYLON.Vector3(
                    focusPoint.x,
                    focusPoint.y + 1.5,
                    focusPoint.z
                ), { intensity: 2.0, range: 8, group: 'dj' }); // Increased for better VR visibility
                djLight.renderPriority = 1;
                djLight.includedOnlyMeshes = result.meshes.slice();
                result.meshes.forEach(mesh => mesh._resyncLightSources());
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
                const speakerLight = this._createAccentLight('speakerLight_' + modelKey, new BABYLON.Vector3(
                    focusPoint.x,
                    focusPoint.y + (config.hangFromTruss ? 0 : 2),
                    focusPoint.z + (config.hangFromTruss ? 1.5 : 0) // In front when flown
                ), { intensity: 0.8, range: 8, group: 'speakers' });
                speakerLight.renderPriority = 1;
                speakerLight.includedOnlyMeshes = result.meshes.slice();
                // Priority sorts scene.lights, not existing meshes' cached light lists.
                result.meshes.forEach(mesh => mesh._resyncLightSources());
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
            
            // A hung model joins its host's accent light, so it takes the same first material slot.
            if (config.hangFrom && rootMesh) {
                const light = this.scene.getLightByName('speakerLight_' + config.hangFrom);
                if (light) {
                    const current = light.includedOnlyMeshes ? light.includedOnlyMeshes.slice() : [];
                    light.includedOnlyMeshes = current.concat(result.meshes.filter(mesh => !current.includes(mesh)));
                    result.meshes.forEach(mesh => mesh._resyncLightSources && mesh._resyncLightSources());
                }
            }

            this.loadedModels[modelKey] = {
                container: result,
                rootMesh: rootMesh,
                placed: placedBox,
                config: config
            };
            
            this.log.info(`✅ ${config.name} loaded successfully`);
            
            // Log attribution for CC BY licensed models
            if (config.attribution) {
                this.log.info(`   📜 ${config.attribution}`);
            }
            
            return result;
            
        }
    }

    _createAccentLight(name, position, { intensity, range, group }) {
        if (this.lightFactory && typeof this.lightFactory.createPointLight === 'function') {
            return this.lightFactory.createPointLight(name, position, { intensity, range, diffuse: [1, 1, 1], group });
        }
        const light = new BABYLON.PointLight(name, position, this.scene);
        light.intensity = intensity;
        light.range = range;
        light.diffuse = new BABYLON.Color3(1, 1, 1);
        return light;
    }

    _enforceSceneLightBudget() {
        if (!this.scene) return;
        const wasBlocked = this.scene.blockMaterialDirtyMechanism;
        this.scene.blockMaterialDirtyMechanism = false;

        let clamped = 0;
        for (const mat of this.scene.materials) {
            if (mat.maxSimultaneousLights === undefined || mat.disableLighting) continue;
            if (mat.isFrozen) mat.unfreeze();
            mat.maxSimultaneousLights = this.maxLights;
            if (mat.markAsDirty) mat.markAsDirty(BABYLON.Material.LightDirtyFlag);
            clamped++;
        }

        this.scene.blockMaterialDirtyMechanism = wasBlocked;
        if (clamped > 0) {
            this.log.info(`   🔧 Re-clamped ${clamped} material(s) to ${this.maxLights} light(s)`);
        }
    }

    /**
     * Release loader-owned resources. The IndexedDB connection and the in-flight
     * registry are NOT reclaimed by scene.dispose().
     */
    dispose() {
        if (this.abortController) this.abortController.abort();
        if (this.inFlight && this.inFlight.clear) this.inFlight.clear();
        if (this.cache && this.cache.close) this.cache.close();

        for (const record of Object.values(this.loadedModels)) {
            if (record.container) {
                try { record.container.removeAllFromScene(); } catch (_) { /* ignore */ }
                try { record.container.dispose(); } catch (_) { /* ignore */ }
            } else if (record.rootMesh && record.rootMesh.dispose) {
                // Procedural children are parented to the root, so recursive disposal
                // releases the hierarchy without disposing shared factory materials.
                try { record.rootMesh.dispose(false, false); } catch (_) { /* ignore */ }
            }
        }
        this.loadedModels = {};
        this._paSpeakerMatCache = null;
    }

    /**
     * A GLB could not be fetched, parsed or configured. The club's own procedural
     * DJ booth and speaker stacks (createDJBooth / createPASpeakers) are only hidden
     * when a real model loads, so they remain the visible fallback. The loader used to
     * carry ~480 lines of alternative procedural builders that no config could reach.
     */
    _modelUnavailable(modelKey, config) {
        this.log.warn(`⚠️ ${config.name} unavailable - keeping the club's built-in geometry for ${modelKey}`);
        return null;
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
     * Rig a bass bin under its speaker: a master link on the speaker's underside, two chains down to lifting eyes
     * on the bin's top, one merged mesh. The chains are straight lines, so they read as taut under the bin's weight.
     *
     * @param {string} modelKey
     * @param {{hangPoint: BABYLON.Vector3, topY: number, yaw: number, width: number}} rig
     *        hangPoint is the speaker's underside; topY the bin's top face; yaw its facing; width its width in metres.
     */
    createBassBinHangingHardware(modelKey, { hangPoint, topY, yaw, width }) {
        const scene = this.scene;
        const mat = this.materialFactory
            ? this.materialFactory.createPBRMaterial('rigMat_' + modelKey, { baseColor: [0.08, 0.08, 0.08], metallic: 0.9, roughness: 0.35 }, true)
            : new BABYLON.StandardMaterial('rigMat_' + modelKey, scene);
        const right = new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // the bin's own x axis
        const parts = [];
        const add = mesh => { mesh.material = mat; parts.push(mesh); return mesh; };

        const top = new BABYLON.Vector3(hangPoint.x, hangPoint.y - 0.02, hangPoint.z);
        const master = add(BABYLON.MeshBuilder.CreateTorus(`binMaster_${modelKey}`, { diameter: 0.09, thickness: 0.014, tessellation: 14 }, scene));
        master.position.copyFrom(top);
        master.rotation.y = yaw;
        master.rotation.x = Math.PI / 2;
        // Where the chains meet the speaker: a small steel plate flush with the underside.
        const plate = add(BABYLON.MeshBuilder.CreateBox(`binPlate_${modelKey}`, { width: 0.2, height: 0.02, depth: 0.12 }, scene));
        plate.position.set(hangPoint.x, hangPoint.y + 0.005, hangPoint.z);
        plate.rotation.y = yaw;

        for (const side of [-1, 1]) {
            const eye = new BABYLON.Vector3(
                hangPoint.x + right.x * side * width * 0.32, topY + 0.03, hangPoint.z + right.z * side * width * 0.32);
            const eyeBolt = add(BABYLON.MeshBuilder.CreateTorus(`binEye_${modelKey}_${side}`, { diameter: 0.05, thickness: 0.009, tessellation: 10 }, scene));
            eyeBolt.position.copyFrom(eye);
            eyeBolt.rotation.y = yaw;
            eyeBolt.rotation.x = Math.PI / 2;

            const direction = top.subtract(eye);
            const length = direction.length();
            const links = Math.max(3, Math.round(length / 0.055));
            direction.normalize();
            for (let i = 1; i < links; i++) {
                const link = add(BABYLON.MeshBuilder.CreateTorus(`binLink_${modelKey}_${side}_${i}`, { diameter: 0.04, thickness: 0.008, tessellation: 8 }, scene));
                link.position.copyFrom(eye).addInPlace(direction.scale(length * i / links));
                // The ring lies in its local xz plane, which contains local z: aim z along the chain, then roll alternate links.
                link.rotationQuaternion = BABYLON.Quaternion.FromLookDirectionLH(direction, BABYLON.Vector3.Up());
                if (i % 2) link.rotate(BABYLON.Axis.Z, Math.PI / 2, BABYLON.Space.LOCAL);
            }
        }

        const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
        if (merged) {
            merged.name = `binRig_${modelKey}`;
            merged.material = mat;
            merged.isPickable = false;
            merged.freezeWorldMatrix();
            merged.doNotSyncBoundingInfo = true;
        }
        this.log.info(`   ⛓️ Rigged ${modelKey}: ${(hangPoint.y - topY).toFixed(2)} m of chain under its speaker`);
    }
    /**
     * Apply external PBR textures to PA speaker meshes.
     * One material and three maps are shared by both speakers. Images retain the
     * original GLB's UV orientation; ORM is R=AO, G=roughness, B=metallic.
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
            const ormPath       = textureBasePath + 'small_speaker_1_1001_orm.jpg';

            // Use PBRMetallicRoughnessMaterial: roughness map plugs in directly without
            // the inverted-smoothness pitfall of the legacy PBRMaterial.microSurfaceTexture.
            mat = this.materialFactory
                ? this.materialFactory.createPBRMaterial('paSpeakerSharedMat', {
                    baseColor: [1, 1, 1], metallic: 1, roughness: 1, mutable: true
                })
                : new BABYLON.PBRMetallicRoughnessMaterial('paSpeakerSharedMat', this.scene);
            mat.baseColor = new BABYLON.Color3(1, 1, 1);
            mat.metallic = 1;
            mat.roughness = 1;
            mat.invertNormalMapX = !this.scene.useRightHandedSystem;
            mat.invertNormalMapY = !!this.scene.useRightHandedSystem;

            const sampling = BABYLON.Texture.TRILINEAR_SAMPLINGMODE;
            let warned = false;
            // Through TextureLoader when available (IndexedDB cache, body deadline,
            // in-flight de-duplication); a bare Texture only in the standalone case.
            // invertY=false for GLTF UVs.
            const loadInto = (slot, path, onFail) => {
                const fail = (message) => {
                    this.log.warn(`   ⚠️ Failed to load ${slot}: ${path} - ${message}`);
                    if (onFail) onFail();
                    if (!warned) {
                        warned = true;
                        this.log.warn('   ⚠️ PA speakers are using an untextured fallback finish');
                    }
                };
                const create = (url) => {
                    const texture = new BABYLON.Texture(url, this.scene, false, false, sampling,
                        () => this.log.info(`   ✅ Loaded ${slot}: ${path}`),
                        (m) => fail(m));
                    if (slot === 'albedo') texture.hasAlpha = false;
                    texture.gammaSpace = slot === 'albedo';
                    mat[slot === 'albedo' ? 'baseTexture'
                        : slot === 'normal' ? 'normalTexture'
                            : 'metallicRoughnessTexture'] = texture;
                    if (slot === 'ORM') mat.occlusionTexture = texture;
                };
                if (this.textureLoader && typeof this.textureLoader.loadOrDownloadTexture === 'function') {
                    this.textureLoader.loadOrDownloadTexture(path).then(create, (error) => fail(error && error.message));
                } else {
                    create(path);
                }
            };
            // A missing albedo falls back to the speakers' own near-black finish, never
            // the magenta debug colour that used to reach users on any texture 404.
            const darkFinish = () => { mat.baseColor = new BABYLON.Color3(0.02, 0.02, 0.022); };
            loadInto('albedo', albedoPath, darkFinish);
            loadInto('normal', normalPath);
            loadInto('ORM', ormPath);

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

            // Bass bins hang from the speakers' real undersides, so they load once those have been placed.
            await Promise.allSettled(modelKeys.filter(k => k.startsWith('bass_bin')).map(key => this.loadModel(key)));

            // Set dressing (bar stools) is last: nothing waits on it
            await Promise.allSettled(modelKeys.filter(k => k.startsWith('bar_')).map(key => this.loadModel(key)));
            
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
