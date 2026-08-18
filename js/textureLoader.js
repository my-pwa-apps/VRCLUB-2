// Texture Loader with CDN Download and IndexedDB Caching
// Downloads industrial concrete textures from Polyhaven CDN on first run
//
// Requires js/assetCache.js to be loaded first (IndexedDBAssetCache, InFlightRegistry,
// fetchWithTimeout). The hand-rolled TextureCache class that used to live here was
// removed: it silently hung on IndexedDB transaction errors and quota exhaustion.

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
        // Drop entries past their TTL so a renamed or replaced asset cannot occupy
        // quota forever - the read path alone only expires what is asked for again.
        this.cache.prune().catch(() => { /* best effort */ });
    }

    async downloadTexture(url) {
        this.log.info(`⬇️ Downloading: ${url}`);
        try {
            // fetchBlobWithTimeout, not fetchWithTimeout: the latter's deadline expires
            // the moment headers arrive, leaving a stalled BODY to hang startup forever.
            const blob = await fetchBlobWithTimeout(url, { cache: 'default', timeoutMs: 30000 });
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
                continue;
            }
            
            loadPromises.push(
                // Deduped by pool key. The synchronous `has()` check above happens
                // before an await while the pool is only populated inside the async
                // continuation, so two concurrent loadTextureSet() calls for the same
                // type both missed, both built a BABYLON.Texture, and the second
                // overwrote (and orphaned) the first.
                this.inFlight.run(poolKey, async () => {
                    const blobUrl = await this.loadOrDownloadTexture(url);
                    const texture = new BABYLON.Texture(blobUrl, this.scene);
                    texture.uScale = config.scale.u;
                    texture.vScale = config.scale.v;
                    // O(1) reverse lookup for releaseTexture().
                    texture._vrclubPoolKey = poolKey;

                    // Anisotropic filtering. These are large tiling surfaces (floor,
                    // walls, ceiling) viewed at extremely shallow angles from eye
                    // height, which is the exact case default trilinear filtering
                    // handles worst - the tiling blurs to grey a few metres out.
                    // VRClub re-sweeps this per graphics tier, but seeding it here
                    // means the very first frame is already correct.
                    const caps = this.scene.getEngine().getCaps();
                    texture.anisotropicFilteringLevel = Math.min(16, caps.maxAnisotropy || 1);

                    // Revoke the blob URL once Babylon has finished with it - on
                    // SUCCESS *or* FAILURE. Wiring only onLoadObservable meant a 404 or
                    // a decode error pinned the Blob in memory for the page lifetime.
                    const revoke = () => {
                        if (this.blobUrlPool.has(url)) {
                            try { URL.revokeObjectURL(this.blobUrlPool.get(url)); } catch (_) { /* ignore */ }
                            this.blobUrlPool.delete(url);
                        }
                    };
                    if (texture.onLoadObservable) texture.onLoadObservable.addOnce(revoke);
                    if (texture.onErrorObservable) texture.onErrorObservable.addOnce(revoke);
                    
                    // Add to pool for reuse. Usage is counted on BINDING
                    // (applyTexturesToMaterial), not here - see the note on releaseTexture.
                    this.texturePool.set(poolKey, texture);
                    if (!this.textureUsageCount.has(poolKey)) this.textureUsageCount.set(poolKey, 0);
                    
                    this.log.info(`  ✅ ${mapType}: ${filename}`);
                    return texture;
                }).then(texture => { textures[mapType] = texture; })
            );
        }

        // allSettled, not all: `all` rejects on the first failure while every sibling
        // map that already resolved has inserted a live BABYLON.Texture into the pool,
        // unreachable and never released. Partial sets are usable - the material
        // factory simply keeps its procedural default for the missing map.
        const outcomes = await Promise.allSettled(loadPromises);
        const failed = outcomes.filter(o => o.status === 'rejected');
        if (failed.length === outcomes.length && outcomes.length > 0) {
            throw failed[0].reason;
        }
        if (failed.length > 0) {
            this.log.warn(`⚠️ ${config.name}: ${failed.length}/${outcomes.length} maps failed; using a partial set.`);
        }
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
        
        // Save and restore the freeze state. Unfreezing here and then freezing
        // unconditionally permanently froze materials the MaterialFactory had
        // deliberately left hot, silently no-op'ing their runtime colour mutations.
        const wasFrozen = material.isFrozen;
        if (wasFrozen) material.unfreeze();

        // Count a reference for every map we BIND. Usage was previously incremented
        // only on a pool hit inside loadTextureSet, which meant the walls set (bound
        // to both wallMat and brickMat) and the ceiling set (pillarMat + ceilingMat)
        // both reported a count of 1 - so a single releaseTexture() disposed a texture
        // two live materials were still sampling.
        for (const texture of Object.values(textures)) {
            const key = texture && texture._vrclubPoolKey;
            if (key) this.textureUsageCount.set(key, (this.textureUsageCount.get(key) || 0) + 1);
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
                // NOTE: PBRMetallicRoughnessMaterial reads roughness from G and metallic
                // from B. These source maps are greyscale (G === B), so the roughness
                // value is also multiplied into metallic. That is only harmless because
                // every consumer's `metallic` scalar is ~0-0.2; pack a real ORM map
                // before raising it.
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
        
        if (wasFrozen) material.freeze();
        
        this.log.info(`✅ Applied textures to material: ${material.name} (${material.getClassName()})`);
    }

    /**
     * Release every reference this material holds on pooled textures.
     * The mirror of applyTexturesToMaterial().
     */
    releaseTexturesFromMaterial(textures) {
        if (!textures) return;
        for (const texture of Object.values(textures)) this.releaseTexture(texture);
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

        // O(1): the pool key is stamped on the texture at pool time.
        const poolKey = texture._vrclubPoolKey;
        if (!poolKey || !this.texturePool.has(poolKey)) {
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
        this.texturePool.forEach((texture) => {
            texture.dispose();
        });
        
        // Revoke all blob URLs to free memory
        this.blobUrlPool.forEach((blobUrl) => {
            URL.revokeObjectURL(blobUrl);
        });
        
        this.texturePool.clear();
        this.blobUrlPool.clear();
        this.textureUsageCount.clear();
        
        this.log.info('✅ Texture pool cleared');
    }

    /**
     * Full teardown: release GPU textures, blob URLs, in-flight work and the
     * IndexedDB connection. An unclosed IDBDatabase per VRClub instance both leaks
     * and blocks any future schema upgrade in another tab.
     */
    dispose() {
        this.clearTexturePool();
        if (this.inFlight && this.inFlight.clear) this.inFlight.clear();
        if (this.cache && this.cache.close) this.cache.close();
    }

    async clearAllCaches() {
        this.clearTexturePool();
        await this.cache.clear();
    }
}

// Export for use in main club script
window.TextureLoader = TextureLoader;
