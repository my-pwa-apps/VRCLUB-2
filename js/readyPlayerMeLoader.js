/**
 * ReadyPlayerMeLoader - Loads random Ready Player Me avatars
 * Provides fallback to procedural avatars if RPM unavailable
 */
class ReadyPlayerMeLoader {
    constructor(scene) {
        this.scene = scene;
        this.cache = new Map(); // Cache loaded avatars by URL
        
        // Curated list of diverse Ready Player Me avatar URLs
        // Using publicly available demo/test avatars
        // To create your own: visit https://readyplayer.me/avatar
        this.avatarLibrary = [
            // Example format - replace with your own created avatars:
            // 'https://models.readyplayer.me/YOUR_AVATAR_ID_HERE.glb',
            
            // For now, using procedural fallback until real avatars are added
            // Uncomment and add real RPM URLs here once created
        ];
        
        // Temporary: Force procedural mode until real RPM avatars are configured
        this.useReadyPlayerMe = false; // Set to true once you add real avatar URLs above
        
        this.useReadyPlayerMe = true; // Toggle to disable RPM and use procedural
        this.fallbackMode = false; // Set to true if RPM fails
        
        console.log('🎭 ReadyPlayerMeLoader initialized');
    }
    
    /**
     * Load a random Ready Player Me avatar
     * @returns {Promise<BABYLON.AbstractMesh[]>} - Array of meshes
     */
    async loadRandomAvatar(playerId) {
        if (!this.useReadyPlayerMe || this.fallbackMode) {
            console.log(`⚠️ Using procedural avatar for ${playerId} (RPM disabled)`);
            return null; // Signal to use procedural fallback
        }
        
        // Select random avatar from library
        const avatarUrl = this.avatarLibrary[Math.floor(Math.random() * this.avatarLibrary.length)];
        
        try {
            console.log(`🔄 Loading RPM avatar for ${playerId} from ${avatarUrl}`);
            
            // Check cache first
            if (this.cache.has(avatarUrl)) {
                console.log(`✅ Using cached RPM avatar`);
                const cachedMeshes = this.cache.get(avatarUrl);
                return this.cloneAvatarMeshes(cachedMeshes, playerId);
            }
            
            // Load from Ready Player Me
            const result = await BABYLON.SceneLoader.ImportMeshAsync(
                '',
                '',
                avatarUrl,
                this.scene
            );
            
            if (!result.meshes || result.meshes.length === 0) {
                throw new Error('No meshes loaded from RPM');
            }
            
            console.log(`✅ Loaded RPM avatar with ${result.meshes.length} meshes`);
            
            // Cache the loaded meshes
            this.cache.set(avatarUrl, result.meshes);
            
            // Scale to appropriate size (RPM avatars are usually 1.8m tall)
            const root = result.meshes[0];
            root.scaling = new BABYLON.Vector3(1, 1, 1);
            
            // Apply light limits to all materials
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.maxSimultaneousLights = 6;
                }
            });
            
            return result.meshes;
            
        } catch (error) {
            console.warn(`⚠️ Failed to load RPM avatar: ${error.message}`);
            console.log(`🔄 Switching to procedural fallback mode`);
            this.fallbackMode = true;
            return null; // Signal to use procedural fallback
        }
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
     * Enable/disable Ready Player Me
     */
    setEnabled(enabled) {
        this.useReadyPlayerMe = enabled;
        this.fallbackMode = !enabled;
        console.log(`🎭 Ready Player Me ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Check if RPM is available and working
     */
    async testConnection() {
        try {
            const testUrl = this.avatarLibrary[0];
            const response = await fetch(testUrl, { method: 'HEAD' });
            const available = response.ok;
            
            if (!available) {
                console.warn('⚠️ Ready Player Me not accessible, using fallback');
                this.fallbackMode = true;
            }
            
            return available;
        } catch (error) {
            console.warn('⚠️ Ready Player Me connection test failed');
            this.fallbackMode = true;
            return false;
        }
    }
}
