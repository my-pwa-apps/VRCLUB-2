// Texture Loader with CDN Download and IndexedDB Caching
// Downloads industrial concrete textures from Polyhaven CDN on first run

class TextureCache {
    constructor() {
        this.dbName = 'VRClubTextureCache';
        this.dbVersion = 1;
        this.storeName = 'textures';
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Texture cache database initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'url' });
                    console.log('📦 Created texture cache store');
                }
            };
        });
    }

    async getTexture(url) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async saveTexture(url, blob) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put({ url, blob, timestamp: Date.now() });
            
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
                console.log('🗑️ Texture cache cleared');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

class TextureLoader {
    constructor(scene) {
        this.scene = scene;
        this.cache = new TextureCache();
        this.textureConfigs = this.getTextureConfigs();
    }

    getTextureConfigs() {
        // High-quality industrial concrete textures from Polyhaven CDN
        // Using 2K resolution for good quality without excessive loading times
        const baseUrl = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k';
        
        return {
            floor: {
                name: 'Polished Concrete Floor',
                // Polished concrete with subtle wear marks - perfect for dance floor
                baseUrl: `${baseUrl}/concrete_floor_worn_001`,
                maps: {
                    diffuse: 'concrete_floor_worn_001_diff_2k.jpg',
                    normal: 'concrete_floor_worn_001_nor_gl_2k.jpg',
                    roughness: 'concrete_floor_worn_001_rough_2k.jpg',
                    ao: 'concrete_floor_worn_001_ao_2k.jpg'
                },
                scale: { u: 4, v: 4 } // Repeat 4x for large floor
            },
            walls: {
                name: 'Industrial Concrete Walls',
                // Raw industrial concrete with imperfections
                baseUrl: `${baseUrl}/concrete_wall_001`,
                maps: {
                    diffuse: 'concrete_wall_001_diff_2k.jpg',
                    normal: 'concrete_wall_001_nor_gl_2k.jpg',
                    roughness: 'concrete_wall_001_rough_2k.jpg',
                    ao: 'concrete_wall_001_ao_2k.jpg'
                },
                scale: { u: 3, v: 3 } // Repeat 3x for walls
            },
            ceiling: {
                name: 'Raw Concrete Ceiling',
                // Reuse the wall concrete texture for ceiling (rough industrial look)
                baseUrl: `${baseUrl}/concrete_wall_001`,
                maps: {
                    diffuse: 'concrete_wall_001_diff_2k.jpg',
                    normal: 'concrete_wall_001_nor_gl_2k.jpg',
                    roughness: 'concrete_wall_001_rough_2k.jpg',
                    ao: 'concrete_wall_001_ao_2k.jpg'
                },
                scale: { u: 2, v: 2 } // Repeat 2x for ceiling (different scale than walls for variety)
            }
        };
    }

    async init() {
        console.log('🎨 Initializing texture loader...');
        await this.cache.init();
    }

    async downloadTexture(url) {
        console.log(`⬇️ Downloading: ${url}`);
        try {
            const response = await fetch(url, {
                mode: 'cors',
                cache: 'default'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            console.log(`✅ Downloaded: ${url.split('/').pop()} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
            return blob;
        } catch (error) {
            console.error(`❌ Failed to download ${url}:`, error);
            throw error;
        }
    }

    async loadOrDownloadTexture(url) {
        // Check cache first
        const cached = await this.cache.getTexture(url);
        
        if (cached) {
            console.log(`💾 Using cached: ${url.split('/').pop()}`);
            return URL.createObjectURL(cached.blob);
        }
        
        // Download and cache
        const blob = await this.downloadTexture(url);
        await this.cache.saveTexture(url, blob);
        return URL.createObjectURL(blob);
    }

    async loadTextureSet(type) {
        const config = this.textureConfigs[type];
        if (!config) {
            throw new Error(`Unknown texture type: ${type}`);
        }

        console.log(`🎨 Loading ${config.name}...`);
        
        const textures = {};
        const loadPromises = [];

        // Load all texture maps in parallel
        for (const [mapType, filename] of Object.entries(config.maps)) {
            const url = `${config.baseUrl}/${filename}`;
            loadPromises.push(
                this.loadOrDownloadTexture(url).then(blobUrl => {
                    textures[mapType] = new BABYLON.Texture(blobUrl, this.scene);
                    textures[mapType].uScale = config.scale.u;
                    textures[mapType].vScale = config.scale.v;
                    console.log(`  ✅ ${mapType}: ${filename}`);
                })
            );
        }

        await Promise.all(loadPromises);
        console.log(`✅ ${config.name} loaded successfully`);
        
        return textures;
    }

    async loadAllTextures() {
        console.log('🎨 Starting texture download and caching...');
        const startTime = performance.now();
        
        try {
            const results = await Promise.allSettled([
                this.loadTextureSet('floor'),
                this.loadTextureSet('walls'),
                this.loadTextureSet('ceiling')
            ]);

            const textures = {
                floor: results[0].status === 'fulfilled' ? results[0].value : null,
                walls: results[1].status === 'fulfilled' ? results[1].value : null,
                ceiling: results[2].status === 'fulfilled' ? results[2].value : null
            };

            // Report failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const type = ['floor', 'walls', 'ceiling'][index];
                    console.error(`❌ Failed to load ${type} textures:`, result.reason);
                }
            });

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ All textures loaded in ${loadTime}s`);
            
            return textures;
        } catch (error) {
            console.error('❌ Texture loading failed:', error);
            throw error;
        }
    }

    applyTexturesToMaterial(material, textures) {
        if (!textures) return;

        // Apply PBR textures
        if (textures.diffuse) {
            material.albedoTexture = textures.diffuse;
        }
        if (textures.normal) {
            material.bumpTexture = textures.normal;
            material.invertNormalMapX = false;
            material.invertNormalMapY = false;
        }
        if (textures.roughness) {
            material.metallicTexture = textures.roughness;
            material.useRoughnessFromMetallicTextureAlpha = false;
            material.useRoughnessFromMetallicTextureGreen = true; // Roughness in green channel
        }
        if (textures.ao) {
            material.ambientTexture = textures.ao;
            material.useAmbientInGrayScale = true;
        }
    }

    async clearAllCaches() {
        await this.cache.clearCache();
    }
}

// Export for use in main club script
window.TextureLoader = TextureLoader;
