// Material Factory - Centralized material creation and reuse
// Eliminates code duplication and ensures consistent material settings

class MaterialFactory {
    constructor(scene, maxLights) {
        this.scene = scene;
        this.maxLights = maxLights;
        
        // Cache of shared materials (keyed by material type)
        this.sharedMaterials = {};
    }

    /**
     * Create or reuse a PBR metallic roughness material
     * @param {string} name - Material name
     * @param {Object} config - Material configuration
     * @param {boolean} shared - If true, reuses existing material with same config
     */
    createPBRMaterial(name, config = {}, shared = false) {
        const {
            baseColor = [0.1, 0.1, 0.1],
            metallic = 0.5,
            roughness = 0.5,
            emissiveColor = null,
            emissiveIntensity = 1.0,
            alpha = 1.0,
            transparencyMode = null,
            backFaceCulling = true,
            disableLighting = false,
            unlit = false
        } = config;

        // Generate cache key for shared materials
        const cacheKey = shared ? JSON.stringify({baseColor, metallic, roughness, emissiveColor}) : null;
        
        // Return cached material if available
        if (shared && cacheKey && this.sharedMaterials[cacheKey]) {
            return this.sharedMaterials[cacheKey];
        }

        const mat = new BABYLON.PBRMetallicRoughnessMaterial(name, this.scene);
        mat.baseColor = new BABYLON.Color3(...baseColor);
        mat.metallic = metallic;
        mat.roughness = roughness;
        mat.maxSimultaneousLights = this.maxLights;

        if (emissiveColor) {
            mat.emissiveColor = Array.isArray(emissiveColor) 
                ? new BABYLON.Color3(...emissiveColor)
                : emissiveColor;
            mat.emissiveIntensity = emissiveIntensity;
        }

        if (alpha < 1.0) {
            mat.alpha = alpha;
            if (transparencyMode) {
                mat.transparencyMode = transparencyMode;
            }
        }

        mat.backFaceCulling = backFaceCulling;
        
        if (disableLighting) {
            mat.disableLighting = true;
        }
        
        if (unlit) {
            mat.unlit = true;
        }

        // Cache if shared
        if (shared && cacheKey) {
            this.sharedMaterials[cacheKey] = mat;
        }

        return mat;
    }

    /**
     * Create standard material (for emissive/unlit objects)
     */
    createStandardMaterial(name, config = {}) {
        const {
            diffuseColor = null,
            emissiveColor = null,
            specularColor = null,
            disableLighting = false
        } = config;

        const mat = new BABYLON.StandardMaterial(name, this.scene);

        if (diffuseColor) {
            mat.diffuseColor = Array.isArray(diffuseColor)
                ? new BABYLON.Color3(...diffuseColor)
                : diffuseColor;
        }

        if (emissiveColor) {
            mat.emissiveColor = Array.isArray(emissiveColor)
                ? new BABYLON.Color3(...emissiveColor)
                : emissiveColor;
        }

        if (specularColor) {
            mat.specularColor = Array.isArray(specularColor)
                ? new BABYLON.Color3(...specularColor)
                : specularColor;
        }

        if (disableLighting) {
            mat.disableLighting = true;
        }

        return mat;
    }

    /**
     * Preset materials for common club objects
     */
    presets = {
        // DJ Equipment
        cdjBody: () => this.createPBRMaterial('cdjBodyMat', {
            baseColor: [0.1, 0.1, 0.12],
            metallic: 0.85,
            roughness: 0.3
        }, true),

        jogWheel: () => this.createStandardMaterial('jogWheelMat', {
            emissiveColor: [0, 0.6, 0.3],
            disableLighting: true
        }),

        mixer: () => this.createPBRMaterial('mixerMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.9,
            roughness: 0.2
        }, true),

        // Structural
        platform: () => this.createPBRMaterial('platformMat', {
            baseColor: [0.02, 0.02, 0.03],
            metallic: 0.95,
            roughness: 0.15
        }, true),

        platformTop: () => this.createPBRMaterial('platformTopMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.1,
            roughness: 0.95
        }, true),

        rail: () => this.createPBRMaterial('railMat', {
            baseColor: [0.7, 0.7, 0.75],
            metallic: 1.0,
            roughness: 0.3
        }, true),

        table: () => this.createPBRMaterial('tableMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.9,
            roughness: 0.2
        }, true),

        // Walls and Floors
        floor: () => this.createPBRMaterial('floorMat', {
            baseColor: [0.25, 0.25, 0.27],
            metallic: 0.0,
            roughness: 0.9
        }),

        wall: () => this.createPBRMaterial('wallMat', {
            baseColor: [0.05, 0.05, 0.08],
            metallic: 0.1,
            roughness: 0.9
        }),

        ceiling: () => this.createPBRMaterial('ceilingMat', {
            baseColor: [0.15, 0.15, 0.17],
            metallic: 0.2,
            roughness: 0.8
        }),

        // Lighting/Truss
        truss: () => this.createPBRMaterial('trussMat', {
            baseColor: [0.6, 0.6, 0.65],
            metallic: 1.0,
            roughness: 0.3
        }, true),

        brace: () => this.createPBRMaterial('braceMat', {
            baseColor: [0.5, 0.5, 0.55],
            metallic: 1.0,
            roughness: 0.4
        }, true),

        lightFixture: () => this.createPBRMaterial('lightFixtureMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.9,
            roughness: 0.2
        }, true),

        // Speakers
        speakerBody: () => this.createPBRMaterial('speakerBodyMat', {
            baseColor: [0.08, 0.08, 0.08],
            metallic: 0.2,
            roughness: 0.7,
            emissiveColor: [0.01, 0.01, 0.01]
        }, true),

        speakerGrill: () => this.createPBRMaterial('speakerGrillMat', {
            baseColor: [0.3, 0.3, 0.3],
            metallic: 0.6,
            roughness: 0.4,
            emissiveColor: [0.05, 0.05, 0.05]
        }, true),

        speakerHorn: () => this.createPBRMaterial('speakerHornMat', {
            baseColor: [0.7, 0.7, 0.7],
            metallic: 0.9,
            roughness: 0.2,
            emissiveColor: [0.05, 0.05, 0.05]
        }, true),

        // Industrial Details
        brick: () => this.createPBRMaterial('brickMat', {
            baseColor: [0.4, 0.15, 0.1],
            metallic: 0,
            roughness: 1
        }, true),

        pillar: () => this.createPBRMaterial('pillarMat', {
            baseColor: [0.3, 0.3, 0.32],
            metallic: 0,
            roughness: 0.95
        }, true),

        pipe: () => this.createPBRMaterial('pipeMat', {
            baseColor: [0.2, 0.2, 0.22],
            metallic: 0.8,
            roughness: 0.6
        }, true),

        // Laser/Effects
        laserHousing: () => this.createPBRMaterial('laserHousingMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.8,
            roughness: 0.3,
            emissiveColor: [0.05, 0, 0]
        }),

        laserEmitter: () => this.createStandardMaterial('laserEmitterMat', {
            emissiveColor: [2, 0, 0],
            disableLighting: true
        })
    };

    /**
     * Get a preset material by name
     */
    getPreset(presetName) {
        if (this.presets[presetName]) {
            return this.presets[presetName]();
        }
        console.warn(`Material preset "${presetName}" not found`);
        return this.createPBRMaterial('fallbackMat', {});
    }

    /**
     * Clear all cached materials
     */
    clearCache() {
        this.sharedMaterials = {};
    }
}
