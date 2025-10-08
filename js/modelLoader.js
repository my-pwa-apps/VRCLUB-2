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
    constructor(scene) {
        this.scene = scene;
        this.cache = new ModelCache();
        this.modelConfigs = this.getModelConfigs();
        this.loadedModels = {}; // Store loaded model containers
    }

    getModelConfigs() {
        // Real 3D models from Sketchfab (CC BY license - attribution required)
        // Pioneer DJ Console by TwoPixels.studio: https://sketchfab.com/twopixels.studio
        // PA Speakers: https://sketchfab.com (to be credited)
        
        return {
            dj_console: {
                name: 'Pioneer DJ Console',
                url: './js/models/djgear/source/pioneer_DJ_console.glb',
                position: new BABYLON.Vector3(0, 1.2, -21.5), // Moved forward to avoid VJ controls
                rotation: new BABYLON.Vector3(0, Math.PI, 0), // Rotate 180° to face away from LED wall
                scale: new BABYLON.Vector3(0.05, 0.05, 0.05), // Smaller - 5% scale
                useProcedural: false, // Use real 3D model
                attribution: 'Pioneer DJ Console by TwoPixels.studio (CC BY 4.0)'
            },
            pa_speaker_left: {
                name: 'PA Speaker (Left)',
                url: './js/models/paspeakers/source/PA_Speakers.glb',
                position: new BABYLON.Vector3(-7, 1.0, -25),
                rotation: new BABYLON.Vector3(0, Math.PI / 6, 0), // Angled toward center
                scale: new BABYLON.Vector3(0.1, 0.1, 0.1), // 10% scale - reasonable size
                useProcedural: true, // Use procedural model instead of 3D file
                attribution: 'PA Speakers (CC BY 4.0)'
            },
            pa_speaker_right: {
                name: 'PA Speaker (Right)',
                url: './js/models/paspeakers/source/PA_Speakers.glb',
                position: new BABYLON.Vector3(7, 1.0, -25),
                rotation: new BABYLON.Vector3(0, -Math.PI / 6, 0), // Angled toward center
                scale: new BABYLON.Vector3(0.1, 0.1, 0.1), // 10% scale - reasonable size
                useProcedural: true, // Use procedural model instead of 3D file
                attribution: 'PA Speakers (CC BY 4.0)'
            }
        };
    }

    async init() {
        console.log('🎸 Initializing model loader...');
        await this.cache.init();
    }

    async downloadModel(url) {
        console.log(`⬇️ Downloading model: ${url}`);
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
            console.log(`✅ Downloaded: ${url.split('/').pop()} (${sizeMB} MB)`);
            return arrayBuffer;
        } catch (error) {
            console.error(`❌ Failed to download ${url}:`, error);
            throw error;
        }
    }

    async loadOrDownloadModel(url) {
        // Check cache first
        const cached = await this.cache.getModel(url);
        
        if (cached) {
            console.log(`💾 Using cached model: ${url.split('/').pop()}`);
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

        console.log(`🎸 Loading ${config.name}...`);

        try {
            // If configured for procedural, create enhanced model
            if (config.useProcedural) {
                console.log(`📦 Creating enhanced procedural ${config.name}`);
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
            }
            
            // CRITICAL: Limit lights on all materials to prevent shader errors
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    // Limit to 4 lights (safe for PBR materials)
                    mesh.material.maxSimultaneousLights = 4;
                    console.log(`   🔧 Limited lights on ${mesh.name} to 4`);
                    
                    // Add ambient brightness to make model more visible in dark club
                    if (mesh.material.emissiveColor) {
                        mesh.material.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Subtle glow
                    }
                }
            });
            
            // Add a dedicated point light above the DJ console for visibility
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
                djLight.intensity = 0.8;
                djLight.range = 4;
                djLight.diffuse = new BABYLON.Color3(1, 1, 1);
                console.log(`   💡 Added dedicated light above DJ console`);
            }
            
            this.loadedModels[modelKey] = {
                container: result,
                rootMesh: rootMesh,
                config: config
            };
            
            console.log(`✅ ${config.name} loaded successfully`);
            
            // Log attribution for CC BY licensed models
            if (config.attribution) {
                console.log(`   📜 ${config.attribution}`);
            }
            
            return result;
            
        } catch (error) {
            console.warn(`⚠️ Failed to load ${config.name}, using enhanced procedural:`, error);
            
            // Create enhanced procedural model
            return this.createEnhancedProceduralModel(modelKey, config);
        }
    }

    createEnhancedProceduralModel(modelKey, config) {
        console.log(`📦 Creating enhanced procedural model for ${config.name}`);
        
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
        
        const bodyMat = new BABYLON.StandardMaterial(name + '_body_mat', this.scene);
        bodyMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
        bodyMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        bodyMat.roughness = 0.6;
        body.material = bodyMat;
        meshes.push(body);
        
        // Jog wheel (platter)
        const platter = BABYLON.MeshBuilder.CreateCylinder(name + '_platter', {
            diameter: 0.2, height: 0.02
        }, this.scene);
        platter.parent = parent;
        platter.position.set(0, 0.09, 0.05);
        
        const platterMat = new BABYLON.StandardMaterial(name + '_platter_mat', this.scene);
        platterMat.diffuseColor = new BABYLON.Color3(0.02, 0.02, 0.02);
        platterMat.emissiveColor = new BABYLON.Color3(0, 0.15, 0.3); // Blue glow
        platterMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
        platter.material = platterMat;
        meshes.push(platter);
        
        // Display screen
        const screen = BABYLON.MeshBuilder.CreatePlane(name + '_screen', {
            width: 0.25, height: 0.04
        }, this.scene);
        screen.parent = parent;
        screen.position.set(0, 0.085, -0.1);
        screen.rotation.x = Math.PI / 2;
        
        const screenMat = new BABYLON.StandardMaterial(name + '_screen_mat', this.scene);
        screenMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        screenMat.emissiveColor = new BABYLON.Color3(0, 0.4, 0.6); // Cyan glow
        screen.material = screenMat;
        meshes.push(screen);
        
        // Control buttons (grid of small boxes)
        for (let i = 0; i < 8; i++) {
            const button = BABYLON.MeshBuilder.CreateBox(name + '_btn' + i, {
                width: 0.025, height: 0.01, depth: 0.025
            }, this.scene);
            button.parent = parent;
            button.position.set(-0.15 + (i * 0.04), 0.085, 0.12);
            
            const btnMat = new BABYLON.StandardMaterial(name + '_btn' + i + '_mat', this.scene);
            btnMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            btnMat.emissiveColor = i % 2 === 0 ? 
                new BABYLON.Color3(0.3, 0, 0) : // Red
                new BABYLON.Color3(0, 0.3, 0);   // Green
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
        
        const bodyMat = new BABYLON.StandardMaterial(name + '_body_mat', this.scene);
        bodyMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        bodyMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        bodyMat.roughness = 0.7;
        body.material = bodyMat;
        meshes.push(body);
        
        // Channel faders (3 channels)
        for (let i = 0; i < 3; i++) {
            const fader = BABYLON.MeshBuilder.CreateBox(name + '_fader' + i, {
                width: 0.03, height: 0.015, depth: 0.12
            }, this.scene);
            fader.parent = parent;
            fader.position.set(-0.2 + (i * 0.2), 0.108, -0.05);
            
            const faderMat = new BABYLON.StandardMaterial(name + '_fader' + i + '_mat', this.scene);
            faderMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8);
            faderMat.specularColor = new BABYLON.Color3(1, 1, 1);
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
                
                const knobMat = new BABYLON.StandardMaterial(name + '_knob_mat', this.scene);
                knobMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                knobMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
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
        
        const vuMat = new BABYLON.StandardMaterial(name + '_vu_mat', this.scene);
        vuMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        vuMat.emissiveColor = new BABYLON.Color3(0.8, 0, 0); // Red VU meter
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
        
        const cabinetMat = new BABYLON.StandardMaterial(name + '_cabinet_mat', this.scene);
        cabinetMat.diffuseColor = new BABYLON.Color3(0.12, 0.12, 0.12);
        cabinetMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        cabinetMat.roughness = 0.9;
        cabinet.material = cabinetMat;
        meshes.push(cabinet);
        
        // Woofer (large speaker cone)
        const woofer = BABYLON.MeshBuilder.CreateCylinder(name + '_woofer', {
            diameter: 0.5, height: 0.1
        }, this.scene);
        woofer.parent = parent;
        woofer.position.set(0, -0.3, 0.36);
        woofer.rotation.x = Math.PI / 2;
        
        const wooferMat = new BABYLON.StandardMaterial(name + '_woofer_mat', this.scene);
        wooferMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        wooferMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        woofer.material = wooferMat;
        meshes.push(woofer);
        
        // Mid-range speaker
        const midRange = BABYLON.MeshBuilder.CreateCylinder(name + '_mid', {
            diameter: 0.25, height: 0.08
        }, this.scene);
        midRange.parent = parent;
        midRange.position.set(0, 0.3, 0.36);
        midRange.rotation.x = Math.PI / 2;
        
        const midMat = new BABYLON.StandardMaterial(name + '_mid_mat', this.scene);
        midMat.diffuseColor = new BABYLON.Color3(0.08, 0.08, 0.08);
        midMat.specularColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        midRange.material = midMat;
        meshes.push(midRange);
        
        // Tweeter (horn)
        const tweeter = BABYLON.MeshBuilder.CreateCylinder(name + '_tweeter', {
            diameterTop: 0.12, diameterBottom: 0.06, height: 0.15
        }, this.scene);
        tweeter.parent = parent;
        tweeter.position.set(0, 0.65, 0.38);
        tweeter.rotation.x = Math.PI / 2;
        
        const tweeterMat = new BABYLON.StandardMaterial(name + '_tweeter_mat', this.scene);
        tweeterMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
        tweeterMat.specularColor = new BABYLON.Color3(1, 1, 1);
        tweeterMat.metallic = 0.8;
        tweeter.material = tweeterMat;
        meshes.push(tweeter);
        
        // Grille mesh effect (multiple bars)
        for (let i = 0; i < 10; i++) {
            const bar = BABYLON.MeshBuilder.CreateBox(name + '_bar' + i, {
                width: 0.7, height: 0.01, depth: 0.01
            }, this.scene);
            bar.parent = parent;
            bar.position.set(0, -0.8 + (i * 0.18), 0.355);
            
            const barMat = new BABYLON.StandardMaterial(name + '_bar_mat', this.scene);
            barMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
            barMat.alpha = 0.8;
            bar.material = barMat;
            meshes.push(bar);
        }
        
        return meshes;
    }

    async loadAllModels() {
        console.log('🎸 Starting model download and caching...');
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
            console.log(`✅ All models loaded in ${loadTime}s`);
            console.log('📜 Model Attributions:');
            
            // Display all attributions
            for (const key of modelKeys) {
                const config = this.modelConfigs[key];
                if (config.attribution) {
                    console.log(`   • ${config.attribution}`);
                }
            }
            
            return this.loadedModels;
        } catch (error) {
            console.error('❌ Model loading failed:', error);
            throw error;
        }
    }

    async clearAllCaches() {
        await this.cache.clearCache();
    }
}

// Export for use in main club script
window.ModelLoader = ModelLoader;
