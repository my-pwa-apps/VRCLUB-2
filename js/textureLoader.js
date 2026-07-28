// Texture Loader with CDN Download and IndexedDB Caching
// Downloads industrial concrete textures from Polyhaven CDN on first run
//
// Requires js/assetCache.js to be loaded first (IndexedDBAssetCache, InFlightRegistry,
// fetchWithTimeout). The hand-rolled TextureCache class that used to live here was
// removed: it silently hung on IndexedDB transaction errors and quota exhaustion.

// Debug mode - set false for production
const TEX_DEBUG = false;

class TextureLoader {
    constructor(scene, logger = null) {
        this.scene = scene;
        this.log = logger || console; // Use provided logger or fallback to console
        this.cache = new IndexedDBAssetCache({
            dbName: 'VRClubTextureCache',
            storeName: 'textures',
            logger: this.log
        });
        this.inFlight = new InFlightRegistry();
        this.textureConfigs = this.getTextureConfigs();
        
        // Texture pooling - reuse loaded textures across materials
        this.texturePool = new Map(); // poolKey -> BABYLON.Texture
        this.blobUrlPool = new Map(); // url -> blob URL
        this.textureUsageCount = new Map(); // poolKey -> usage count
    }

    getTextureConfigs() {
        // Local textures downloaded from Polyhaven (1K resolution)
        // Stored in /textures folder for reliable loading from webserver
        const baseUrl = './textures';
        
        return {
            floor: {
                name: 'Large Floor Tiles',
                baseUrl: `${baseUrl}/floor`,
                maps: {
                    diffuse: 'diff.jpg',
                    normal: 'normal.jpg',
                    roughness: 'roughness.jpg',
                    ao: 'ao.jpg'
                },
                scale: { u: 6, v: 6 }
            },
            walls: {
                name: 'Red Brick Wall',
                baseUrl: `${baseUrl}/walls`,
                maps: {
                    diffuse: 'diff.jpg',
                    normal: 'normal.jpg',
                    roughness: 'roughness.jpg',
                    ao: 'ao.jpg'
                },
                scale: { u: 4, v: 2 }
            },
            ceiling: {
                name: 'Raw Concrete Ceiling',
                baseUrl: `${baseUrl}/ceiling`,
                maps: {
                    diffuse: 'diff.jpg',
                    normal: 'normal.jpg',
                    roughness: 'roughness.jpg',
                    ao: 'ao.jpg'
                },
                scale: { u: 3, v: 3 }
            }
        };
    }

    async init() {
        this.log.info('🎨 Initializing texture loader...');
        await this.cache.init();
    }

    async downloadTexture(url) {
        this.log.info(`⬇️ Downloading: ${url}`);
        try {
            const response = await fetchWithTimeout(url, {
                mode: 'cors',
                cache: 'default',
                timeoutMs: 30000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            this.log.info(`✅ Downloaded: ${url.split('/').pop()} (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
            return blob;
        } catch (error) {
            this.log.error(`❌ Failed to download ${url}:`, error);
            throw error;
        }
    }

    /**
     * Resolve a texture URL to an object URL, using (in order) the in-memory blob
     * pool, IndexedDB, then the network. Concurrent callers for the same URL share
     * a single download via the in-flight registry.
     */
    async loadOrDownloadTexture(url) {
        // Check texture pool first (in-memory cache)
        if (this.blobUrlPool.has(url)) {
            this.log.info(`♻️ Reusing pooled texture: ${url.split('/').pop()}`);
            return this.blobUrlPool.get(url);
        }

        return this.inFlight.run(url, async () => {
            // Re-check: another caller may have populated the pool while we queued.
            if (this.blobUrlPool.has(url)) return this.blobUrlPool.get(url);

            const cached = await this.cache.get(url);
            if (cached) {
                this.log.info(`💾 Using cached: ${url.split('/').pop()}`);
                const blobUrl = URL.createObjectURL(cached);
                this.blobUrlPool.set(url, blobUrl);
                return blobUrl;
            }

            // Download, then persist. A failed persist (quota) is non-fatal.
            const blob = await this.downloadTexture(url);
            await this.cache.put(url, blob);
            const blobUrl = URL.createObjectURL(blob);
            this.blobUrlPool.set(url, blobUrl);
            return blobUrl;
        });
    }

    async loadTextureSet(type) {
        const config = this.textureConfigs[type];
        if (!config) {
            throw new Error(`Unknown texture type: ${type}`);
        }

        this.log.info(`🎨 Loading ${config.name}...`);
        
        const textures = {};
        const loadPromises = [];

        // Load all texture maps in parallel
        for (const [mapType, filename] of Object.entries(config.maps)) {
            const url = `${config.baseUrl}/${filename}`;
            const poolKey = `${url}_${config.scale.u}_${config.scale.v}`;
            
            // Check if texture already exists in pool with same scale
            if (this.texturePool.has(poolKey)) {
                this.log.info(`  ♻️ Reusing pooled ${mapType}: ${filename}`);
                textures[mapType] = this.texturePool.get(poolKey);
                this.textureUsageCount.set(poolKey, (this.textureUsageCount.get(poolKey) || 0) + 1);
                continue;
            }
            
            loadPromises.push(
                this.loadOrDownloadTexture(url).then(blobUrl => {
                    const texture = new BABYLON.Texture(blobUrl, this.scene);
                    texture.uScale = config.scale.u;
                    texture.vScale = config.scale.v;

                    // Anisotropic filtering. These are large tiling surfaces (floor,
                    // walls, ceiling) viewed at extremely shallow angles from eye
                    // height, which is the exact case default trilinear filtering
                    // handles worst - the tiling blurs to grey a few metres out.
                    // VRClub re-sweeps this per graphics tier, but seeding it here
                    // means the very first frame is already correct.
                    const caps = this.scene.getEngine().getCaps();
                    texture.anisotropicFilteringLevel = Math.min(16, caps.maxAnisotropy || 1);

                    // Revoke the blob URL once Babylon has uploaded the bitmap to GPU.
                    // The pool keeps blob URLs alive forever otherwise (one per cached
                    // texture per page load), and we never need to re-create the
                    // BABYLON.Texture from the same blob.
                    const revoke = () => {
                        if (this.blobUrlPool.has(url)) {
                            try { URL.revokeObjectURL(this.blobUrlPool.get(url)); } catch (_) { /* ignore */ }
                            this.blobUrlPool.delete(url);
                        }
                    };
                    if (texture.onLoadObservable) {
                        texture.onLoadObservable.addOnce(revoke);
                    } else {
                        // Fallback: revoke on next tick
                        setTimeout(revoke, 0);
                    }
                    
                    // Add to pool for reuse
                    this.texturePool.set(poolKey, texture);
                    this.textureUsageCount.set(poolKey, 1);
                    
                    textures[mapType] = texture;
                    this.log.info(`  ✅ ${mapType}: ${filename}`);
                })
            );
        }

        await Promise.all(loadPromises);
        this.log.info(`✅ ${config.name} loaded successfully`);
        
        return textures;
    }

    async loadAllTextures() {
        this.log.info('🎨 Starting texture download and caching...');
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
                    this.log.error(`❌ Failed to load ${type} textures:`, result.reason);
                }
            });

            const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
            this.log.info(`✅ All textures loaded in ${loadTime}s`);
            
            return textures;
        } catch (error) {
            this.log.error('❌ Texture loading failed:', error);
            throw error;
        }
    }

    applyTexturesToMaterial(material, textures) {
        if (!textures) return;
        
        // Unfreeze material if frozen (materialFactory freezes materials for performance)
        if (material.isFrozen) {
            material.unfreeze();
        }

        // Apply PBR textures - support both PBRMaterial and PBRMetallicRoughnessMaterial
        // PBRMetallicRoughnessMaterial is created by materialFactory.createPBRMaterial()
        const isMetallicRoughness = material.getClassName() === 'PBRMetallicRoughnessMaterial';
        
        if (textures.diffuse) {
            if (isMetallicRoughness) {
                material.baseTexture = textures.diffuse;
            } else {
                material.albedoTexture = textures.diffuse;
            }
        }
        if (textures.normal) {
            if (isMetallicRoughness) {
                material.normalTexture = textures.normal;
            } else {
                material.bumpTexture = textures.normal;
            }
            material.invertNormalMapX = false;
            material.invertNormalMapY = false;
        }
        if (textures.roughness) {
            if (isMetallicRoughness) {
                material.metallicRoughnessTexture = textures.roughness;
            } else {
                material.metallicTexture = textures.roughness;
                material.useRoughnessFromMetallicTextureAlpha = false;
                material.useRoughnessFromMetallicTextureGreen = true;
            }
        }
        if (textures.ao) {
            if (isMetallicRoughness) {
                material.occlusionTexture = textures.ao;
            } else {
                material.ambientTexture = textures.ao;
                material.useAmbientInGrayScale = true;
            }
        }
        
        // Re-freeze material for performance
        material.freeze();
        
        this.log.info(`✅ Applied textures to material: ${material.name} (${material.getClassName()})`);
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
     * Release one reference to a pooled texture, disposing it when the last
     * reference goes away.
     *
     * NOTE: the previous signature was `releaseTexture(url, scale = {u:1,v:1})`.
     * That was unusable — the pool is keyed by `${url}_${scale.u}_${scale.v}`
     * using the scale from the texture CONFIG (e.g. 6/6 for the floor), so the
     * `{u:1,v:1}` default could never match a real entry and the method silently
     * did nothing for every caller. It now takes the texture instance, which is
     * what callers actually hold.
     *
     * @param {BABYLON.Texture} texture A texture previously returned by loadTextureSet().
     * @returns {boolean} true if a pooled reference was released
     */
    releaseTexture(texture) {
        if (!texture) return false;

        let poolKey = null;
        for (const [key, pooled] of this.texturePool) {
            if (pooled === texture) { poolKey = key; break; }
        }
        if (poolKey === null) {
            this.log.warn('⚠️ releaseTexture called with a texture that is not pooled');
            return false;
        }

        const currentCount = this.textureUsageCount.get(poolKey) || 1;
        if (currentCount > 1) {
            this.textureUsageCount.set(poolKey, currentCount - 1);
            return true;
        }

        // Last reference — dispose. Blob URLs are revoked at upload time in
        // loadTextureSet(), so there is nothing to revoke here.
        texture.dispose();
        this.texturePool.delete(poolKey);
        this.textureUsageCount.delete(poolKey);
        this.log.info(`🗑️ Disposed texture: ${poolKey.split('/').pop()}`);
        return true;
    }

    /**
     * Clear all pooled textures and blob URLs
     * Useful for memory cleanup or scene resets
     */
    clearTexturePool() {
        this.log.info('🗑️ Clearing texture pool...');
        
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
        
        this.log.info('✅ Texture pool cleared');
    }

    async clearAllCaches() {
        this.clearTexturePool();
        await this.cache.clear();
    }
}

// Export for use in main club script
window.TextureLoader = TextureLoader;
