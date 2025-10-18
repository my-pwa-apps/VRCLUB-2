/**
 * ReadyPlayerMeLoader - Loads 3D avatars from multiple sources
 * Supports: VRoid Studio, Ready Player Me, Mixamo, custom GLB files
 * Provides fallback to procedural avatars if loading fails
 */
class ReadyPlayerMeLoader {
    constructor(scene) {
        this.scene = scene;
        this.cache = new Map(); // Cache loaded avatars by URL
        
        // Avatar library - supports multiple sources:
        // 1. VRoid Studio avatars (local GLB files)
        // 2. Ready Player Me avatars (URLs or local files)
        // 3. Mixamo characters (local GLB files)
        // 4. Any other GLB format avatars
        
        this.avatarLibrary = [
            // VRoid Studio avatars (recommended - free, unlimited):
            // './js/models/avatars/vroid_01.glb',
            // './js/models/avatars/vroid_02.glb',
            // './js/models/avatars/vroid_03.glb',
            // './js/models/avatars/vroid_04.glb',
            // './js/models/avatars/vroid_05.glb',
            // './js/models/avatars/vroid_06.glb',
            // './js/models/avatars/vroid_07.glb',
            // './js/models/avatars/vroid_08.glb',
            
            // Ready Player Me avatars (URLs):
            'https://models.readyplayer.me/68f3d2c50e54a41a64979fcc.glb',
            'https://models.readyplayer.me/68f3d5b9c8049dcd18a36de2.glb',
            'https://models.readyplayer.me/68f3d52ac8049dcd18a35de8.glb',
            'https://models.readyplayer.me/68f3d687992c9fb50cad6e59.glb',
            'https://models.readyplayer.me/68f3d5b9c8049dcd18a36de2.glb'
            
            // Mixamo characters (local files):
            // './js/models/avatars/mixamo_character_01.glb',
            
            // Instructions:
            // 1. Create avatars using VRoid Studio (see docs/VROID_INTEGRATION_GUIDE_2025-10-18.md)
            // 2. Export as VRM, convert to GLB
            // 3. Copy GLB files to js/models/avatars/
            // 4. Uncomment paths above or add your own
            // 5. Set useAvatarLibrary = true below
        ];
        
        // Enable/disable 3D avatar loading
        // Set to true once you've added avatar files to the library above
        this.useAvatarLibrary = true; // Change to true when avatars are ready
        
        this.fallbackMode = false; // Set to true if avatar loading fails
        
        console.log('🎭 Avatar Loader initialized (supports VRoid, RPM, Mixamo, custom GLB)');
    }
    
    /**
     * Load a random 3D avatar from the library
     * Supports VRoid Studio, Ready Player Me, Mixamo, and custom GLB files
     * @returns {Promise<BABYLON.AbstractMesh[]>} - Array of meshes, or null for procedural fallback
     */
    async loadRandomAvatar(playerId) {
        if (!this.useAvatarLibrary || this.fallbackMode || this.avatarLibrary.length === 0) {
            console.log(`⚠️ Using procedural avatar for ${playerId} (3D avatars disabled or unavailable)`);
            return null; // Signal to use procedural fallback
        }
        
        // Select random avatar from library
        const avatarUrl = this.avatarLibrary[Math.floor(Math.random() * this.avatarLibrary.length)];
        
        // Detect avatar type from URL/path
        const avatarType = this.detectAvatarType(avatarUrl);
        
        try {
            console.log(`🔄 Loading ${avatarType} avatar for ${playerId} from ${avatarUrl}`);
            
            // Check cache first
            if (this.cache.has(avatarUrl)) {
                console.log(`✅ Using cached ${avatarType} avatar`);
                const cachedMeshes = this.cache.get(avatarUrl);
                return this.cloneAvatarMeshes(cachedMeshes, playerId);
            }
            
            // Load GLB avatar
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                '',
                avatarUrl,
                this.scene
            );
            
            if (!result.meshes || result.meshes.length === 0) {
                throw new Error(`No meshes loaded from ${avatarType} avatar`);
            }
            
            console.log(`✅ Loaded ${avatarType} avatar with ${result.meshes.length} meshes`);
            
            // Cache the loaded meshes
            this.cache.set(avatarUrl, result.meshes);
            
            // Scale to appropriate size
            // VRoid/RPM avatars are usually 1.6-1.8m tall (realistic human height)
            const root = result.meshes[0];
            const scale = this.getAvatarScale(avatarType);
            root.scaling = new BABYLON.Vector3(scale, scale, scale);
            
            // Apply light limits to all materials (VR compatibility)
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.maxSimultaneousLights = 6; // Quest VR limit
                    
                    // VRoid-specific: Handle transparency properly
                    if (avatarType === 'VRoid' && mesh.material.needAlphaBlending) {
                        // VRoid hair uses alpha blending - ensure it renders correctly
                        mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                        mesh.renderingGroupId = 1; // Render hair after opaque meshes
                    }
                }
            });
            
            return result.meshes;
            
        } catch (error) {
            console.warn(`⚠️ Failed to load ${avatarType} avatar: ${error.message}`);
            console.log(`🔄 Switching to procedural fallback mode`);
            this.fallbackMode = true;
            return null; // Signal to use procedural fallback
        }
    }
    
    /**
     * Detect avatar type from URL/path
     */
    detectAvatarType(url) {
        if (url.includes('vroid')) return 'VRoid';
        if (url.includes('readyplayer') || url.includes('rpm')) return 'Ready Player Me';
        if (url.includes('mixamo')) return 'Mixamo';
        if (url.includes('sketchfab')) return 'Sketchfab';
        return 'Custom';
    }
    
    /**
     * Get appropriate scale for avatar type
     */
    getAvatarScale(avatarType) {
        const scales = {
            'VRoid': 1.0,           // VRoid exports at correct scale
            'Ready Player Me': 1.0, // RPM also correct scale
            'Mixamo': 0.01,         // Mixamo exports at 100x scale
            'Sketchfab': 1.0,       // Usually correct, varies
            'Custom': 1.0           // Assume correct scale
        };
        return scales[avatarType] || 1.0;
    }
    
    /**
     * Clone cached avatar meshes for instancing
     */
    cloneAvatarMeshes(meshes, playerId) {
        const clones = [];
        
        meshes.forEach((mesh, index) => {
            if (index === 0) {
                // Root transform node - don't clone, create new
                const root = new BABYLON.TransformNode(`rpmAvatar_${playerId}`, this.scene);
                clones.push(root);
            } else {
                const clone = mesh.clone(`${mesh.name}_${playerId}`, clones[0]);
                if (clone) {
                    clone.setEnabled(true);
                    clones.push(clone);
                }
            }
        });
        
        return clones;
    }
    
    /**
     * Load avatar with specific customization
     * For future: allow users to create their own RPM avatar
     */
    async loadCustomAvatar(avatarUrl, playerId) {
        try {
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                '',
                avatarUrl,
                this.scene
            );
            
            if (!result.meshes || result.meshes.length === 0) {
                throw new Error('No meshes loaded');
            }
            
            // Apply light limits
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.maxSimultaneousLights = 6;
                }
            });
            
            return result.meshes;
            
        } catch (error) {
            console.error(`Failed to load custom avatar: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Generate random RPM avatar URL
     * For future: integrate with RPM API to generate new avatars
     */
    generateRandomAvatarUrl() {
        // This would call RPM API to generate a truly random avatar
        // For now, we use pre-selected avatars
        return this.avatarLibrary[Math.floor(Math.random() * this.avatarLibrary.length)];
    }
    
    /**
     * Clear cache to free memory
     */
    clearCache() {
        this.cache.forEach((meshes, url) => {
            meshes.forEach(mesh => {
                if (mesh.dispose) {
                    mesh.dispose();
                }
            });
        });
        this.cache.clear();
        console.log('🗑️ RPM avatar cache cleared');
    }
    
    /**
     * Enable/disable 3D avatar library
     */
    setEnabled(enabled) {
        this.useAvatarLibrary = enabled;
        this.fallbackMode = !enabled;
        console.log(`🎭 3D Avatar Library ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Check if avatar library is available and working
     * Tests first avatar in library
     */
    async testConnection() {
        // Skip test if avatar library is disabled or empty
        if (!this.useAvatarLibrary || this.avatarLibrary.length === 0) {
            console.log('⚠️ 3D Avatar Library disabled or no avatars configured, using procedural avatars');
            this.fallbackMode = true;
            return false;
        }
        
        try {
            const testUrl = this.avatarLibrary[0];
            const avatarType = this.detectAvatarType(testUrl);
            
            console.log(`🔍 Testing ${avatarType} avatar availability...`);
            
            // For local files, check if they exist (different from remote URLs)
            if (testUrl.startsWith('./') || testUrl.startsWith('/')) {
                // Local file - try to fetch it
                const response = await fetch(testUrl, { method: 'HEAD' });
                const available = response.ok;
                
                if (!available) {
                    console.warn(`⚠️ Local avatar file not found: ${testUrl}`);
                    console.log('💡 Tip: Copy avatar GLB files to js/models/avatars/ directory');
                    this.fallbackMode = true;
                }
                
                return available;
            } else {
                // Remote URL (Ready Player Me, etc.)
                const response = await fetch(testUrl, { method: 'HEAD' });
                const available = response.ok;
                
                if (!available) {
                    console.warn(`⚠️ Remote avatar not accessible: ${testUrl}`);
                    this.fallbackMode = true;
                }
                
                return available;
            }
        } catch (error) {
            console.warn(`⚠️ Avatar library connection test failed: ${error.message}`);
            console.log('🔄 Using procedural avatar fallback');
            this.fallbackMode = true;
            return false;
        }
    }
    
    /**
     * Get avatar library statistics
     */
    getStats() {
        const stats = {
            totalAvatars: this.avatarLibrary.length,
            cachedAvatars: this.cache.size,
            enabled: this.useAvatarLibrary,
            fallbackMode: this.fallbackMode,
            types: {}
        };
        
        // Count avatar types
        this.avatarLibrary.forEach(url => {
            const type = this.detectAvatarType(url);
            stats.types[type] = (stats.types[type] || 0) + 1;
        });
        
        return stats;
    }
    
    /**
     * Log avatar library status
     */
    logStatus() {
        const stats = this.getStats();
        console.log('📊 Avatar Library Status:');
        console.log(`  - Total Avatars: ${stats.totalAvatars}`);
        console.log(`  - Cached: ${stats.cachedAvatars}`);
        console.log(`  - Enabled: ${stats.enabled}`);
        console.log(`  - Fallback Mode: ${stats.fallbackMode}`);
        console.log(`  - Avatar Types:`, stats.types);
    }
}
