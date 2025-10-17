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
        
        // Texture pooling - reuse loaded textures across materials
        this.texturePool = new Map(); // url -> BABYLON.Texture
        this.blobUrlPool = new Map(); // url -> blob URL
        this.textureUsageCount = new Map(); // url -> usage count
    }

    getTextureConfigs() {
        // High-quality textures from Polyhaven CDN
        // Using 2K resolution for good quality without excessive loading times
        const baseUrl = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k';
        
        return {
            floor: {
                name: 'Industrial Concrete Floor',
                // Raw industrial concrete - perfect for nightclub floor (reuse wall texture with different scale)
                baseUrl: `${baseUrl}/concrete_wall_001`,
                maps: {
                    diffuse: 'concrete_wall_001_diff_2k.jpg',
                    normal: 'concrete_wall_001_nor_gl_2k.jpg',
                    roughness: 'concrete_wall_001_rough_2k.jpg',
                    ao: 'concrete_wall_001_ao_2k.jpg'
                },
                scale: { u: 8, v: 8 } // Repeat 8x for large floor with finer detail
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
        // Check texture pool first (in-memory cache)
        if (this.blobUrlPool.has(url)) {
            console.log(`♻️ Reusing pooled texture: ${url.split('/').pop()}`);
            this.textureUsageCount.set(url, (this.textureUsageCount.get(url) || 0) + 1);
            return this.blobUrlPool.get(url);
        }
        
        // Check IndexedDB cache
        const cached = await this.cache.getTexture(url);
        
        if (cached) {
            console.log(`💾 Using cached: ${url.split('/').pop()}`);
            const blobUrl = URL.createObjectURL(cached.blob);
            this.blobUrlPool.set(url, blobUrl);
            this.textureUsageCount.set(url, 1);
            return blobUrl;
        }
        
        // Download and cache
        const blob = await this.downloadTexture(url);
        await this.cache.saveTexture(url, blob);
        const blobUrl = URL.createObjectURL(blob);
        this.blobUrlPool.set(url, blobUrl);
        this.textureUsageCount.set(url, 1);
        return blobUrl;
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
            const poolKey = `${url}_${config.scale.u}_${config.scale.v}`;
            
            // Check if texture already exists in pool with same scale
            if (this.texturePool.has(poolKey)) {
                console.log(`  ♻️ Reusing pooled ${mapType}: ${filename}`);
                textures[mapType] = this.texturePool.get(poolKey);
                this.textureUsageCount.set(poolKey, (this.textureUsageCount.get(poolKey) || 0) + 1);
                continue;
            }
            
            loadPromises.push(
                this.loadOrDownloadTexture(url).then(blobUrl => {
                    const texture = new BABYLON.Texture(blobUrl, this.scene);
                    texture.uScale = config.scale.u;
                    texture.vScale = config.scale.v;
                    
                    // Add to pool for reuse
                    this.texturePool.set(poolKey, texture);
                    this.textureUsageCount.set(poolKey, 1);
                    
                    textures[mapType] = texture;
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

    /**
     * Get texture pool statistics for debugging and monitoring
     */
    getPoolStats() {
        return {
            pooledTextures: this.texturePool.size,
            blobUrls: this.blobUrlPool.size,
            totalUsages: Array.from(this.textureUsageCount.values()).reduce((a, b) => a + b, 0),
            avgUsagePerTexture: this.texturePool.size > 0 
                ? (Array.from(this.textureUsageCount.values()).reduce((a, b) => a + b, 0) / this.texturePool.size).toFixed(2)
                : 0
        };
    }

    /**
     * Dispose of textures that are no longer needed
     * Call this when textures are removed from materials
     */
    releaseTexture(url, scale = { u: 1, v: 1 }) {
        const poolKey = `${url}_${scale.u}_${scale.v}`;
        
        if (this.textureUsageCount.has(poolKey)) {
            const currentCount = this.textureUsageCount.get(poolKey);
            if (currentCount <= 1) {
                // Last reference - dispose texture
                const texture = this.texturePool.get(poolKey);
                if (texture) {
                    texture.dispose();
                    console.log(`🗑️ Disposed texture: ${url.split('/').pop()}`);
                }
                this.texturePool.delete(poolKey);
                this.textureUsageCount.delete(poolKey);
            } else {
                // Decrement usage count
                this.textureUsageCount.set(poolKey, currentCount - 1);
            }
        }
    }

    /**
     * Clear all pooled textures and blob URLs
     * Useful for memory cleanup or scene resets
     */
    clearTexturePool() {
        console.log('🗑️ Clearing texture pool...');
        
        // Dispose all textures
        this.texturePool.forEach((texture, key) => {
            texture.dispose();
        });
        
        // Revoke all blob URLs to free memory
        this.blobUrlPool.forEach((blobUrl, url) => {
            URL.revokeObjectURL(blobUrl);
        });
        
        this.texturePool.clear();
        this.blobUrlPool.clear();
        this.textureUsageCount.clear();
        
        console.log('✅ Texture pool cleared');
    }

    async clearAllCaches() {
        this.clearTexturePool();
        await this.cache.clearCache();
    }
}

// Export for use in main club script
window.TextureLoader = TextureLoader;
