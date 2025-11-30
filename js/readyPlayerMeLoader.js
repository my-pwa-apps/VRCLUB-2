/**
 * ReadyPlayerMeLoader - Loads 3D avatars from multiple sources
 * Supports: VRoid Studio, Ready Player Me, Mixamo, custom GLB files
 * Provides fallback to procedural avatars if loading fails
 */
class ReadyPlayerMeLoader {
    constructor(scene) {
        this.scene = scene;
        this.cache = new Map(); // Cache loaded avatars by URL
        
        // Avatar library - supports VRoid, Ready Player Me, Mixamo, and custom GLB files
        // Add paths to your avatar files here, e.g.:
        // './js/models/avatars/vroid_01.glb',
        // 'https://models.readyplayer.me/YOUR_AVATAR_ID.glb'
        this.avatarLibrary = [];
        
        // Enable/disable 3D avatar loading (set to true when avatars are added)
        this.useAvatarLibrary = true;
        this.fallbackMode = false;
        
        console.info('🎭 Avatar Loader initialized');
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
                const cached = this.cache.get(avatarUrl);
                const clonedMeshes = this.cloneAvatarMeshes(cached.meshes, playerId);
                
                // Clone and setup animations for the cloned avatar
                if (cached.animationGroups && cached.animationGroups.length > 0) {
                    const clonedGroups = this.cloneAnimationGroups(cached.animationGroups, clonedMeshes);
                    this.setupAnimations(clonedMeshes[0], clonedGroups);
                    console.log(`🎬 Cloned ${clonedGroups.length} animations for cached avatar`);
                }
                
                return clonedMeshes;
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
            
            // Cache the loaded meshes AND animation groups
            this.cache.set(avatarUrl, {
                meshes: result.meshes,
                animationGroups: result.animationGroups || []
            });
            
            // Scale to appropriate size
            // VRoid/RPM avatars are usually 1.6-1.8m tall (realistic human height)
            const root = result.meshes[0];
            const scale = this.getAvatarScale(avatarType);
            root.scaling = new BABYLON.Vector3(scale, scale, scale);
            
            console.log(`📏 Avatar scale for ${avatarType}: ${scale} (position: ${root.position.x}, ${root.position.y}, ${root.position.z})`);
            
            // Apply light limits and enforce solid rendering for all materials
            result.meshes.forEach(mesh => {
                if (mesh.material) {
                    mesh.material.maxSimultaneousLights = 6; // Quest VR limit
                    
                    // Detect if this is a hair mesh (VRoid-specific)
                    const isHairMesh = mesh.name && (
                        mesh.name.toLowerCase().includes('hair') ||
                        mesh.name.toLowerCase().includes('bangs') ||
                        mesh.name.toLowerCase().includes('fringe')
                    );
                    
                    // VRoid hair: Handle transparency properly (hair needs alpha blending)
                    if (avatarType === 'VRoid' && isHairMesh && mesh.material.needAlphaBlending) {
                        // VRoid hair uses alpha blending - ensure it renders correctly
                        mesh.material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
                        mesh.renderingGroupId = 1; // Render hair after opaque meshes
                        console.log(`💇 Preserved hair transparency on ${mesh.name}`);
                    } else {
                        // ALL other meshes (including VRoid body/face): Enforce opacity
                        // This prevents light bleed-through in VR stereoscopic rendering
                        mesh.material.alpha = 1.0;
                        mesh.material.transparencyMode = null;
                        
                        // Override alpha blending methods
                        if (mesh.material.needAlphaBlending) {
                            mesh.material.needAlphaBlending = () => false;
                        }
                        if (mesh.material.needAlphaTesting) {
                            mesh.material.needAlphaTesting = () => false;
                        }
                        
                        // Ensure depth writes are enabled
                        mesh.material.disableDepthWrite = false;
                        mesh.material.forceDepthWrite = true;
                        
                        // Disable back-face culling issues
                        mesh.material.backFaceCulling = true;
                        
                        // PBR-specific properties (if using PBRMaterial)
                        if (mesh.material.albedoTexture) {
                            mesh.material.albedoTexture.hasAlpha = false;
                            mesh.material.useAlphaFromAlbedoTexture = false;
                        }
                        if (mesh.material.opacityTexture) {
                            mesh.material.opacityTexture = null; // Remove opacity texture
                        }
                        
                        // Standard material properties
                        if (mesh.material.diffuseTexture) {
                            mesh.material.diffuseTexture.hasAlpha = false;
                        }
                        if (mesh.material.opacityTexture) {
                            mesh.material.opacityTexture = null;
                        }
                        
                        console.log(`🔒 Enforced solid material on ${mesh.name}`);
                    }
                }
            });
            
            // Add physics collider to prevent sinking through floor
            this.addPhysicsCollider(root);
            
            // Setup animations if available
            if (result.animationGroups && result.animationGroups.length > 0) {
                // Normalize animation groups to ensure proper frame ranges
                result.animationGroups.forEach(group => {
                    group.normalize(0, 100);
                });
                
                this.setupAnimations(root, result.animationGroups);
                console.log(`🎬 Loaded ${result.animationGroups.length} animations for ${avatarType} avatar`);
            } else {
                console.log(`⚠️ No animations found in ${avatarType} avatar - you can add Mixamo animations!`);
            }
            
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
        if (url.includes('mixamo') || url.includes('Hip Hop Dancing') || url.includes('house.glb')) return 'Mixamo'; // Mixamo dance animations
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
            'Mixamo': 1.0,          // Mixamo GLB exports are already scaled correctly
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
        let clonedSkeleton = null;
        
        // First pass: find and clone the skeleton if it exists
        meshes.forEach(mesh => {
            if (mesh.skeleton && !clonedSkeleton) {
                clonedSkeleton = mesh.skeleton.clone(`skeleton_${playerId}`);
                console.log(`🦴 Cloned skeleton with ${clonedSkeleton.bones.length} bones for ${playerId}`);
            }
        });
        
        // Clone the entire hierarchy starting from root
        const root = meshes[0];
        const rootClone = root.clone(`rpmAvatar_${playerId}`, null, true); // true = doNotCloneChildren is FALSE, so it DOES clone children
        
        if (rootClone) {
            clones.push(rootClone);
            
            // Collect all cloned meshes from the hierarchy
            const collectMeshes = (node) => {
                if (node !== rootClone && (node.getClassName().includes('Mesh') || node.getClassName().includes('TransformNode'))) {
                    clones.push(node);
                    
                    // Attach cloned skeleton if this is a mesh with skeleton
                    if (node.skeleton && clonedSkeleton) {
                        node.skeleton = clonedSkeleton;
                    }
                    
                    // Re-enforce opacity on cloned meshes
                    if (node.material) {
                        const isHairMesh = node.name && (
                            node.name.toLowerCase().includes('hair') ||
                            node.name.toLowerCase().includes('bangs') ||
                            node.name.toLowerCase().includes('fringe')
                        );
                        
                        if (!isHairMesh) {
                            node.material.alpha = 1.0;
                            node.material.transparencyMode = null;
                            node.material.disableDepthWrite = false;
                            node.material.forceDepthWrite = true;
                            
                            if (node.material.needAlphaBlending) {
                                node.material.needAlphaBlending = () => false;
                            }
                            if (node.material.needAlphaTesting) {
                                node.material.needAlphaTesting = () => false;
                            }
                        }
                    }
                }
                
                // Recursively process children
                if (node.getChildren) {
                    node.getChildren().forEach(collectMeshes);
                }
            };
            
            // Collect all nodes in the cloned hierarchy
            rootClone.getChildren().forEach(collectMeshes);
            
            console.log(`   📦 Cloned ${clones.length} nodes in hierarchy for ${playerId}`);
        } else {
            console.warn(`⚠️ Failed to clone root node for ${playerId}`);
        }
        
        return clones;
    }
    
    /**
     * Clone animation groups for a cloned avatar
     */
    cloneAnimationGroups(animationGroups, targetMeshes) {
        const clonedGroups = [];
        
        console.log(`🔄 Cloning ${animationGroups.length} animation group(s)...`);
        
        // Find the cloned skeleton from target meshes
        let targetSkeleton = null;
        for (const mesh of targetMeshes) {
            if (mesh.skeleton) {
                targetSkeleton = mesh.skeleton;
                break;
            }
        }
        
        if (!targetSkeleton) {
            console.warn(`⚠️ No skeleton found in target meshes - animations will not work!`);
            return clonedGroups;
        }
        
        console.log(`   🦴 Found target skeleton with ${targetSkeleton.bones.length} bones`);
        
        animationGroups.forEach(group => {
            // Create a new animation group with unique name
            const clonedGroup = new BABYLON.AnimationGroup(
                `${group.name}_${targetMeshes[0].name}`,
                this.scene
            );
            
            console.log(`   📋 Cloning group "${group.name}" with ${group.targetedAnimations.length} targeted animations`);
            
            let successCount = 0;
            let boneCount = 0;
            let meshCount = 0;
            let transformNodeCount = 0;
            
            // Clone each animation in the group
            group.targetedAnimations.forEach((targetedAnim, index) => {
                const originalTarget = targetedAnim.target;
                
                // Debug first few targets to understand structure
                if (index < 3) {
                    console.log(`   🔍 Target ${index}: ${originalTarget.name}, type: ${originalTarget.constructor.name}`);
                }
                
                // Find the corresponding target in the cloned skeleton
                let newTarget = null;
                
                // Check if original target is a bone (check constructor name or instanceof)
                const isBone = originalTarget.constructor.name === 'Bone' || 
                              (originalTarget.getClassName && originalTarget.getClassName() === 'Bone');
                
                const isTransformNode = originalTarget.constructor.name === 'TransformNode' || 
                                       originalTarget.constructor.name === 't';
                
                if (isBone) {
                    // Find matching bone in cloned skeleton by name
                    const boneName = originalTarget.name;
                    newTarget = targetSkeleton.bones.find(bone => bone.name === boneName);
                    
                    if (newTarget) {
                        boneCount++;
                    } else if (index < 5) {
                        console.warn(`   ⚠️ Could not find bone: ${boneName} in cloned skeleton`);
                    }
                } else if (isTransformNode) {
                    // TransformNode targets (common in Mixamo rigs)
                    // Search in the cloned meshes' hierarchy
                    const nodeName = originalTarget.name;
                    
                    // Search through all cloned meshes and their children
                    for (const mesh of targetMeshes) {
                        // Check if this mesh has the target name
                        if (mesh.name === nodeName || mesh.name.endsWith('_' + nodeName)) {
                            newTarget = mesh;
                            break;
                        }
                        
                        // Search through children
                        const findInChildren = (node) => {
                            if (node.name === nodeName || node.name.includes(nodeName)) {
                                return node;
                            }
                            if (node.getChildren) {
                                for (const child of node.getChildren()) {
                                    const found = findInChildren(child);
                                    if (found) return found;
                                }
                            }
                            return null;
                        };
                        
                        const found = findInChildren(mesh);
                        if (found) {
                            newTarget = found;
                            break;
                        }
                    }
                    
                    // If still not found, search in scene nodes
                    if (!newTarget) {
                        newTarget = this.scene.getTransformNodeByName(nodeName) || 
                                   this.scene.getTransformNodeByName(`${nodeName}_${targetMeshes[0].name.split('_').pop()}`);
                    }
                    
                    if (newTarget) {
                        transformNodeCount++;
                    } else if (index < 5) {
                        console.warn(`   ⚠️ Could not find TransformNode: ${nodeName}`);
                    }
                } else {
                    // For other targets (meshes), find by name matching
                    const baseName = originalTarget.name.split('_')[0];
                    newTarget = targetMeshes.find(m => m.name.startsWith(baseName));
                    
                    if (!newTarget) {
                        newTarget = targetMeshes.find(m => m.name === originalTarget.name);
                    }
                    
                    if (newTarget) {
                        meshCount++;
                    } else if (index < 5) {
                        console.warn(`   ⚠️ Could not find mesh: ${originalTarget.name}`);
                    }
                }
                
                if (newTarget && targetedAnim.animation) {
                    const clonedAnim = targetedAnim.animation.clone();
                    clonedGroup.addTargetedAnimation(clonedAnim, newTarget);
                    successCount++;
                }
            });
            
            console.log(`   ✅ Cloned ${successCount}/${group.targetedAnimations.length} animations (${boneCount} bones, ${transformNodeCount} nodes, ${meshCount} meshes)`);
            
            // Copy important properties from original group
            clonedGroup.from = group.from;
            clonedGroup.to = group.to;
            clonedGroup.loopAnimation = group.loopAnimation;
            clonedGroup.speedRatio = group.speedRatio || 1.0;
            
            // Normalize to same range as original
            clonedGroup.normalize(0, 100);
            
            // Ensure the cloned group is enabled and ready to play
            clonedGroup.reset();
            clonedGroups.push(clonedGroup);
        });
        
        return clonedGroups;
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
    
    /**
     * Add physics collider to avatar root to prevent sinking through floor
     */
    addPhysicsCollider(root) {
        // Create invisible capsule collider for physics
        const collider = BABYLON.MeshBuilder.CreateCapsule(`${root.name}_collider`, {
            height: 1.7,    // Average human height
            radius: 0.3,    // Avatar width
            tessellation: 8 // Low poly for performance
        }, this.scene);
        
        // Make collider invisible
        collider.isVisible = false;
        collider.parent = root;
        collider.position.y = 0.85; // Center at waist height
        
        // Enable physics impostor
        if (this.scene.getPhysicsEngine()) {
            collider.physicsImpostor = new BABYLON.PhysicsImpostor(
                collider,
                BABYLON.PhysicsImpostor.CapsuleImpostor,
                { 
                    mass: 70,           // Average human mass (kg)
                    restitution: 0.1,   // Low bounce
                    friction: 0.8       // High friction for stability
                },
                this.scene
            );
            console.log(`⚽ Added physics collider to avatar ${root.name}`);
        } else {
            console.warn('⚠️ Physics engine not enabled - avatar may sink through floor');
            console.log('💡 Tip: Enable physics in club_hyperrealistic.js');
        }
        
        return collider;
    }
    
    /**
     * Setup animations for avatar (dancing, idle, etc.)
     */
    setupAnimations(root, animationGroups) {
        // Store animations on root for later access
        root.animationGroups = animationGroups;
        
        // Log available animations for debugging
        if (animationGroups && animationGroups.length > 0) {
            console.log(`🎬 Available animations: ${animationGroups.map(g => g.name).join(', ')}`);
            console.log(`🎬 Animation details:`, animationGroups.map(g => ({
                name: g.name,
                from: g.from,
                to: g.to,
                speedRatio: g.speedRatio,
                isPlaying: g.isPlaying
            })));
        }
        
        // Find and setup dance animations
        const danceAnimations = animationGroups.filter(group => 
            group.name.toLowerCase().includes('dance') ||
            group.name.toLowerCase().includes('dancing') ||
            group.name.toLowerCase().includes('hiphop') ||
            group.name.toLowerCase().includes('hip hop') ||
            group.name.toLowerCase().includes('samba') ||
            group.name.toLowerCase().includes('mixamo.com') // Mixamo's default animation name
        );
        
        if (danceAnimations.length > 0) {
            console.log(`💃 Found ${danceAnimations.length} dance animation(s)`);
            
            // Play random dance animation on loop
            const randomDance = danceAnimations[Math.floor(Math.random() * danceAnimations.length)];
            
            console.log(`🎵 STARTING ANIMATION: ${randomDance.name} (from ${randomDance.from} to ${randomDance.to})`);
            
            // Stop any existing playback first
            if (randomDance.isPlaying) {
                randomDance.stop();
            }
            
            // Reset and configure animation properties explicitly
            randomDance.reset();
            randomDance.loopAnimation = true;
            randomDance.speedRatio = 1.0;
            
            // Start with explicit parameters (loop, speed, from, to, enableBlending)
            randomDance.start(true, 1.0, randomDance.from, randomDance.to, false);
            root.currentAnimation = randomDance;
            
            console.log(`✅ Animation started: ${randomDance.name}`);
            
            // Verify animation is playing after a short delay
            setTimeout(() => {
                const isPlaying = randomDance.isPlaying;
                const isStarted = randomDance.isStarted;
                const hasAnimatables = randomDance._animatables && randomDance._animatables.length > 0;
                const targetedCount = randomDance.targetedAnimations ? randomDance.targetedAnimations.length : 0;
                
                console.log(`🔍 Animation check: ${randomDance.name}`);
                console.log(`   isPlaying=${isPlaying}, isStarted=${isStarted}`);
                console.log(`   hasAnimatables=${hasAnimatables}, targetedAnimations=${targetedCount}`);
                
                // If animatables exist, the animation is actually playing (even if properties say otherwise)
                if (hasAnimatables) {
                    console.log(`✅ Animation confirmed running via internal animatables`);
                } else if (!isPlaying && !isStarted) {
                    console.warn(`⚠️ Animation not playing, forcing restart...`);
                    randomDance.loopAnimation = true;
                    randomDance.play(true);
                }
            }, 1000);
        } else {
            // Find idle animation as fallback
            const idleAnimation = animationGroups.find(group => 
                group.name.toLowerCase().includes('idle') ||
                group.name.toLowerCase().includes('standing')
            );
            
            if (idleAnimation) {
                idleAnimation.start(true, 1.0, idleAnimation.from, idleAnimation.to, false);
                root.currentAnimation = idleAnimation;
                console.log(`🧍 Playing idle animation: ${idleAnimation.name}`);
            } else if (animationGroups.length > 0) {
                // Play first available animation
                const firstAnim = animationGroups[0];
                firstAnim.start(true, 1.0, firstAnim.from, firstAnim.to, false);
                root.currentAnimation = firstAnim;
                console.log(`▶️ Playing animation: ${firstAnim.name}`);
            }
        }
        
        return root.currentAnimation;
    }
    
    /**
     * Change avatar animation
     * @param {BABYLON.TransformNode} root - Avatar root node
     * @param {string} animationName - Animation to play (e.g., 'dance', 'idle', 'wave')
     */
    playAnimation(root, animationName) {
        if (!root.animationGroups || root.animationGroups.length === 0) {
            console.warn(`⚠️ No animations available for ${root.name}`);
            return null;
        }
        
        // Stop current animation
        if (root.currentAnimation) {
            root.currentAnimation.stop();
        }
        
        // Find matching animation
        const animation = root.animationGroups.find(group => 
            group.name.toLowerCase().includes(animationName.toLowerCase())
        );
        
        if (animation) {
            animation.start(true, 1.0, animation.from, animation.to, false);
            root.currentAnimation = animation;
            console.log(`🎬 Playing animation: ${animation.name}`);
            return animation;
        } else {
            console.warn(`⚠️ Animation '${animationName}' not found for ${root.name}`);
            console.log(`Available animations: ${root.animationGroups.map(g => g.name).join(', ')}`);
            return null;
        }
    }
}
