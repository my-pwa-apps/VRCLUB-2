// 3D Model Loader with CDN Download and IndexedDB Caching
// Downloads DJ equipment and speaker models from CDN on first run

class ModelCache {
    constructor() {
        this.dbName = 'VRClubModelCache';
        this.dbVersion = 1;
        this.storeName = 'models';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Model cache database initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'url' });
                    console.log('📦 Created model cache store');
                }
            };
        });
    }

    async getModel(url) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveModel(url, arrayBuffer) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ 
                url, 
                data: arrayBuffer,
                timestamp: Date.now() 
            });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearCache() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('🗑️ Model cache cleared');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

class ModelLoader {
    constructor(scene, materialFactory = null, logger = null) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.log = logger || console; // Use provided logger or fallback to console
        this.cache = new ModelCache();
        this.modelConfigs = this.getModelConfigs();
        this.loadedModels = {}; // Store loaded model containers
        this.instancePool = new Map(); // Pool of master meshes for instancing
        this.instanceCounts = new Map(); // Track instance counts
    }

    getModelConfigs() {
        // Real 3D models from Sketchfab (CC BY license - attribution required)
        // Pioneer DJ Console by TwoPixels.studio: https://sketchfab.com/twopixels.studio
        // PA Speakers: https://sketchfab.com (to be credited)
        
        return {
            dj_console: {
                name: 'Pioneer DJ Console',
                url: './js/models/djgear/source/pioneer_DJ_console.glb',
                position: new BABYLON.Vector3(-1.0, 0.95, -23.4), // Left side, slightly higher, away from VJ controls
                rotation: new BABYLON.Vector3(0, Math.PI, 0), // Rotated 180° to face DJ (was mirrored in original model)
                scale: new BABYLON.Vector3(-0.025, 0.025, 0.025), // NEGATIVE X to unmirror, reduced size
                useProcedural: false, // Use real 3D model
                attribution: 'Pioneer DJ Console by TwoPixels.studio (CC BY 4.0)'
            },
            pa_speaker_left: {
                name: 'PA Speaker (Left)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                position: new BABYLON.Vector3(-11, 0, -22), // Moved forward from -25 to -22, wider to -11
                rotation: new BABYLON.Vector3(0, Math.PI / 6, 0), // Tilted 30 degrees inward
                scale: new BABYLON.Vector3(1, 1, 1), // Will be auto-scaled to 5.5m height
                useProcedural: false, // USE the 3D model
                attribution: 'Stage Speaker (CC BY 4.0)'
            },
            pa_speaker_right: {
                name: 'PA Speaker (Right)',
                url: './js/models/paspeakers/source/stage_speaker___black.glb',
                position: new BABYLON.Vector3(11, 0, -22), // Moved forward from -25 to -22, wider to 11
                rotation: new BABYLON.Vector3(0, -Math.PI / 6, 0), // Tilted 30 degrees inward
                scale: new BABYLON.Vector3(1, 1, 1), // Will be auto-scaled to 5.5m height
                useProcedural: false, // USE the 3D model
                attribution: 'Stage Speaker (CC BY 4.0)'
            }
        };
    }

    async init() {
        this.log.info('🎸 Initializing model loader...');
        await this.cache.init();
    }

    async downloadModel(url) {
        this.log.info(`⬇️ Downloading model: ${url}`);
        try {
            const response = await fetch(url, {
                mode: 'cors',
                cache: 'default'
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

    async loadOrDownloadModel(url) {
        // Check cache first
        const cached = await this.cache.getModel(url);
        
        if (cached) {
            this.log.info(`💾 Using cached model: ${url.split('/').pop()}`);
            return cached.data;
        }
        
        // Download and cache
        const arrayBuffer = await this.downloadModel(url);
        await this.cache.saveModel(url, arrayBuffer);
        return arrayBuffer;
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
            
            // Create blob URL for Babylon.js
            const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
            const blobUrl = URL.createObjectURL(blob);
            
            // Load model with Babylon.js
            const result = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                '',
                blobUrl,
                this.scene,
                null,
                '.glb'
            );
            
            // Clean up blob URL
            URL.revokeObjectURL(blobUrl);
            
            // Add to scene
            result.addAllToScene();
            
            // Get root mesh
            const rootMesh = result.meshes[0];
            if (rootMesh) {
                rootMesh.position = config.position.clone();
                rootMesh.rotation = config.rotation.clone();
                rootMesh.scaling = config.scale.clone();
                
                // Auto-scale PA speakers to desired height (5.5m tall like procedural ones)
                if (modelKey.startsWith('pa_speaker')) {
                    // Compute bounding box to get actual model height
                    rootMesh.refreshBoundingInfo(true);
                    const boundingInfo = rootMesh.getHierarchyBoundingVectors(true);
                    const modelHeight = boundingInfo.max.y - boundingInfo.min.y;
                    const desiredHeight = 5.5; // Match procedural speaker stack height
                    
                    if (modelHeight > 0) {
                        const autoScale = desiredHeight / modelHeight;
                        rootMesh.scaling = new BABYLON.Vector3(autoScale, autoScale, autoScale);
                        this.log.info(`   📏 Auto-scaled PA speaker from ${modelHeight.toFixed(2)}m to ${desiredHeight}m (scale: ${autoScale.toFixed(4)})`);
                        
                        // Adjust Y position so bottom sits on floor
                        const scaledMinY = boundingInfo.min.y * autoScale;
                        rootMesh.position.y = -scaledMinY;
                    }
                }
            }
            
            // CRITICAL: Configure all meshes for optimal VR and desktop visibility
            result.meshes.forEach(mesh => {
                // Ensure mesh is visible and pickable
                mesh.isVisible = true;
                mesh.visibility = 1.0;
                mesh.renderingGroupId = 0; // Default rendering group
                
                // Apply custom black material if requested (e.g., for PA speakers)
                if (config.makeBlack && this.materialFactory) {
                    const meshName = mesh.name.toLowerCase();
                    // Intelligent material assignment based on mesh name
                    // PA Speaker specific mapping
                    if (modelKey.startsWith('pa_speaker')) {
                        if (meshName.includes('grill') || meshName.includes('front') || meshName.includes('mesh') || meshName.includes('bar')) {
                            mesh.material = this.materialFactory.getPreset('speakerGrill');
                        } else if (meshName.includes('horn') || meshName.includes('tweeter') || meshName.includes('mid')) {
                            mesh.material = this.materialFactory.getPreset('speakerHorn');
                        } else if (meshName.includes('woofer') || meshName.includes('cone')) {
                            mesh.material = this.materialFactory.getPreset('speakerHorn'); // Glossy cone
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
                    // Limit to 4 lights (safe for PBR materials)
                    mesh.material.maxSimultaneousLights = 4;
                    this.log.info(`   🔧 Limited lights on ${mesh.name} to 4`);
                    
                    // Add subtle ambient brightness - reduced to avoid washed-out VR appearance
                    if (mesh.material.emissiveColor !== undefined) {
                        mesh.material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Minimal glow
                    }
                    // Moderate ambient for visibility without washing out
                    if (mesh.material.ambientColor !== undefined) {
                        mesh.material.ambientColor = new BABYLON.Color3(0.2, 0.2, 0.2); // Reduced
                    }
                    
                    // CRITICAL: Ensure materials are fully opaque in VR
                    if (mesh.material.alpha !== undefined) {
                        mesh.material.alpha = 1.0; // Fully opaque
                    }
                    if (mesh.material.transparencyMode !== undefined) {
                        mesh.material.transparencyMode = null; // Disable transparency
                    }
                    
                    // Ensure proper rendering in VR and prevent see-through
                    mesh.material.backFaceCulling = true;
                    mesh.material.needDepthPrePass = false; // Disable depth pre-pass that can cause transparency issues
                    mesh.material.disableDepthWrite = false; // CRITICAL: Enable depth write to prevent see-through
                    
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
                        config.position.x,
                        config.position.y + 1.5,
                        config.position.z
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
                const speakerLight = new BABYLON.PointLight(
                    'speakerLight_' + modelKey,
                    new BABYLON.Vector3(
                        config.position.x,
                        config.position.y + 2,
                        config.position.z
                    ),
                    this.scene
                );
                speakerLight.intensity = 1.2;
                speakerLight.range = 6;
                speakerLight.diffuse = new BABYLON.Color3(1, 1, 1);
                this.log.info(`   💡 Added light for ${config.name}`);
                
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

    createEnhancedProceduralModel(modelKey, config) {
        this.log.info(`📦 Creating enhanced procedural model for ${config.name}`);
        
        const parent = new BABYLON.TransformNode(modelKey, this.scene);
        parent.position = config.position.clone();
        parent.rotation = config.rotation.clone();
        parent.scaling = config.scale.clone();
        
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
        await this.cache.clearCache();
    }
}

// Export for use in main club script
window.ModelLoader = ModelLoader;
