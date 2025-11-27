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

        // Freeze material to prevent shader recompilation
        mat.freeze();

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

        // Freeze material to prevent shader recompilation
        mat.freeze();

        return mat;
    }

    /**
     * Preset materials for common club objects
     * Phase 2 Enhanced: Boosted metallic/roughness values for hyperrealism
     */
    presets = {
        // DJ Equipment - Enhanced metallic for realistic reflections
        cdjBody: () => this.createPBRMaterial('cdjBodyMat', {
            baseColor: [0.1, 0.1, 0.12],
            metallic: 0.95, // Increased from 0.85
            roughness: 0.25 // Reduced from 0.3
        }, true),

        jogWheel: () => this.createStandardMaterial('jogWheelMat', {
            emissiveColor: [0, 0.8, 0.4], // Boosted from [0, 0.6, 0.3]
            disableLighting: true
        }),

        mixer: () => this.createPBRMaterial('mixerMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.95, // Increased from 0.9
            roughness: 0.15 // Reduced from 0.2
        }, true),

        // Structural - Enhanced realism
        platform: () => this.createPBRMaterial('platformMat', {
            baseColor: [0.02, 0.02, 0.03],
            metallic: 0.98, // Increased from 0.95
            roughness: 0.1 // Reduced from 0.15
        }, true),

        platformTop: () => this.createPBRMaterial('platformTopMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.15, // Increased from 0.1
            roughness: 0.9 // Reduced from 0.95
        }, true),

        rail: () => this.createPBRMaterial('railMat', {
            baseColor: [0.7, 0.7, 0.75],
            metallic: 1.0,
            roughness: 0.25 // Reduced from 0.3
        }, true),

        table: () => this.createPBRMaterial('tableMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.95, // Increased from 0.9
            roughness: 0.15 // Reduced from 0.2
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

        // Lighting/Truss - Enhanced metallic sheen (brushed aluminum)
        truss: () => this.createPBRMaterial('trussMat', {
            baseColor: [0.72, 0.72, 0.75], // Brighter aluminum
            metallic: 1.0,
            roughness: 0.18 // Brushed finish
        }, true),

        // Truss connector plates (galvanized steel)
        trussConnector: () => this.createPBRMaterial('trussConnectorMat', {
            baseColor: [0.5, 0.5, 0.52],
            metallic: 0.95,
            roughness: 0.3
        }, true),

        // Weld material (darker at joints)
        trussWeld: () => this.createPBRMaterial('trussWeldMat', {
            baseColor: [0.35, 0.35, 0.38],
            metallic: 0.85,
            roughness: 0.5
        }, true),

        // Chain hoist material (steel chain)
        chainHoist: () => this.createPBRMaterial('chainHoistMat', {
            baseColor: [0.25, 0.25, 0.28],
            metallic: 0.9,
            roughness: 0.4
        }, true),

        brace: () => this.createPBRMaterial('braceMat', {
            baseColor: [0.5, 0.5, 0.55],
            metallic: 1.0,
            roughness: 0.35 // Reduced from 0.4
        }, true),

        lightFixture: () => this.createPBRMaterial('lightFixtureMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.95, // Increased from 0.9
            roughness: 0.15 // Reduced from 0.2
        }, true),

        // Speakers - Enhanced realism
        speakerBody: () => this.createPBRMaterial('speakerBodyMat', {
            baseColor: [0.08, 0.08, 0.08],
            metallic: 0.3, // Increased from 0.2
            roughness: 0.65, // Reduced from 0.7
            emissiveColor: [0.02, 0.02, 0.02] // Boosted from [0.01, 0.01, 0.01]
        }, true),

        speakerGrill: () => this.createPBRMaterial('speakerGrillMat', {
            baseColor: [0.3, 0.3, 0.3],
            metallic: 0.7, // Increased from 0.6
            roughness: 0.35, // Reduced from 0.4
            emissiveColor: [0.08, 0.08, 0.08] // Boosted from [0.05, 0.05, 0.05]
        }, true),

        speakerHorn: () => this.createPBRMaterial('speakerHornMat', {
            baseColor: [0.7, 0.7, 0.7],
            metallic: 0.95, // Increased from 0.9
            roughness: 0.15, // Reduced from 0.2
            emissiveColor: [0.08, 0.08, 0.08] // Boosted from [0.05, 0.05, 0.05]
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

        // Laser/Effects - Enhanced emissive
        laserHousing: () => this.createPBRMaterial('laserHousingMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.9, // Increased from 0.8
            roughness: 0.25, // Reduced from 0.3
            emissiveColor: [0.08, 0, 0] // Boosted from [0.05, 0, 0]
        }),

        laserEmitter: () => this.createStandardMaterial('laserEmitterMat', {
            emissiveColor: [3, 0, 0], // Boosted from [2, 0, 0]
            disableLighting: true
        }),

        // === HYPERREALISTIC ENTRANCE & CROWD CONTROL ===
        velvetRope: () => this.createPBRMaterial('velvetRopeMat', {
            baseColor: [0.5, 0.02, 0.05], // Deep burgundy red
            metallic: 0.05,
            roughness: 0.85 // Soft velvet texture
        }, true),

        stanchionPost: () => this.createPBRMaterial('stanchionPostMat', {
            baseColor: [0.83, 0.69, 0.22], // Brushed brass/gold
            metallic: 0.95,
            roughness: 0.15
        }, true),

        stanchionBase: () => this.createPBRMaterial('stanchionBaseMat', {
            baseColor: [0.75, 0.62, 0.18],
            metallic: 0.98,
            roughness: 0.2
        }, true),

        // === DANCE FLOOR EDGE LIGHTING ===
        floorEdgeLED: () => this.createStandardMaterial('floorEdgeLEDMat', {
            emissiveColor: [0, 0.5, 1], // Cyan LED strip
            disableLighting: true
        }),

        floorTileGap: () => this.createPBRMaterial('floorTileGapMat', {
            baseColor: [0.02, 0.02, 0.02],
            metallic: 0.5,
            roughness: 0.8
        }, true),

        // === SAFETY & ATMOSPHERE ===
        exitSign: () => this.createStandardMaterial('exitSignMat', {
            emissiveColor: [0, 1, 0.3], // Green exit glow
            disableLighting: true
        }),

        fireExtinguisher: () => this.createPBRMaterial('fireExtinguisherMat', {
            baseColor: [0.8, 0.05, 0.05], // Fire engine red
            metallic: 0.7,
            roughness: 0.3
        }, true),

        sprinklerHead: () => this.createPBRMaterial('sprinklerHeadMat', {
            baseColor: [0.75, 0.72, 0.7], // Chrome/nickel
            metallic: 0.95,
            roughness: 0.2
        }, true),

        smokeDetector: () => this.createPBRMaterial('smokeDetectorMat', {
            baseColor: [0.9, 0.9, 0.88], // Off-white plastic
            metallic: 0.0,
            roughness: 0.7
        }, true),

        // === NEON SIGNAGE ===
        neonTubeGlass: () => this.createPBRMaterial('neonTubeGlassMat', {
            baseColor: [0.9, 0.9, 0.9],
            metallic: 0.0,
            roughness: 0.1,
            alpha: 0.5
        }),

        // === DJ BOOTH ACCESSORIES ===
        laptopBody: () => this.createPBRMaterial('laptopBodyMat', {
            baseColor: [0.7, 0.7, 0.72], // Silver aluminum
            metallic: 0.95,
            roughness: 0.2
        }, true),

        headphoneBand: () => this.createPBRMaterial('headphoneBandMat', {
            baseColor: [0.08, 0.08, 0.08],
            metallic: 0.85,
            roughness: 0.25
        }, true),

        headphoneCup: () => this.createPBRMaterial('headphoneCupMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.7,
            roughness: 0.4
        }, true),

        cableRubber: () => this.createPBRMaterial('cableRubberMat', {
            baseColor: [0.02, 0.02, 0.02],
            metallic: 0.0,
            roughness: 0.8
        }, true),

        // === FURNITURE ===
        barStool: () => this.createPBRMaterial('barStoolMat', {
            baseColor: [0.1, 0.1, 0.1], // Black metal frame
            metallic: 0.9,
            roughness: 0.3
        }, true),

        stoolCushion: () => this.createPBRMaterial('stoolCushionMat', {
            baseColor: [0.05, 0.05, 0.05], // Black leather
            metallic: 0.2,
            roughness: 0.6
        }, true)
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
