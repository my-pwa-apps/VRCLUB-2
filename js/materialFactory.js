// Material Factory - Centralized material creation and reuse
// Eliminates code duplication and ensures consistent material settings

class MaterialFactory {
    constructor(scene, maxLights, logger = null) {
        this.scene = scene;
        this.maxLights = maxLights;
        this.log = logger || console; // Use provided logger or fallback to console
        
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
            unlit = false,
            emissiveTexture = null,
            opacityTexture = null
        } = config;

        // Generate cache key for shared materials (includes all config to prevent collisions)
        const cacheKey = shared ? JSON.stringify({baseColor, metallic, roughness, emissiveColor, alpha, transparencyMode, backFaceCulling, disableLighting, unlit}) : null;
        
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
        } else if (transparencyMode) {
             mat.transparencyMode = transparencyMode;
        }

        mat.backFaceCulling = backFaceCulling;
        
        if (disableLighting) {
            mat.disableLighting = true;
        }
        
        if (unlit) {
            mat.unlit = true;
        }

        if (emissiveTexture) mat.emissiveTexture = emissiveTexture;
        if (opacityTexture) mat.opacityTexture = opacityTexture;

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
            disableLighting = false,
            alpha = 1.0,
            diffuseTexture = null,
            emissiveTexture = null,
            opacityTexture = null
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

        if (alpha < 1.0) {
            mat.alpha = alpha;
        }

        if (diffuseTexture) mat.diffuseTexture = diffuseTexture;
        if (emissiveTexture) mat.emissiveTexture = emissiveTexture;
        if (opacityTexture) mat.opacityTexture = opacityTexture;

        // Freeze material to prevent shader recompilation
        // CRITICAL: Don't freeze LED or strobe materials - they need dynamic emissive color updates
        const nameLower = name.toLowerCase();
        if (!nameLower.includes('led') && !nameLower.includes('strobe')) {
            mat.freeze();
        }

        return mat;
    }

    /**
     * Create full PBRMaterial with advanced features (clearCoat, sheen, anisotropy)
     * Use for key surfaces that benefit from multi-layer PBR (polished floors, lacquered surfaces)
     * @param {string} name - Material name
     * @param {Object} config - Material configuration including clearCoat/sheen options
     * @param {boolean} shared - If true, reuses existing material with same config
     */
    createFullPBRMaterial(name, config = {}, shared = false) {
        const {
            albedoColor = [0.1, 0.1, 0.1],
            metallic = 0.5,
            roughness = 0.5,
            emissiveColor = null,
            emissiveIntensity = 1.0,
            alpha = 1.0,
            backFaceCulling = true,
            clearCoat = null,        // { intensity, roughness, tintColor? }
            sheen = null,            // { intensity, color?, roughness? }
            environmentIntensity = null,
            directIntensity = null,
            specularIntensity = null
        } = config;

        // Generate cache key for shared materials
        const cacheKey = shared ? JSON.stringify({albedoColor, metallic, roughness, emissiveColor, alpha, clearCoat, sheen}) : null;

        // Return cached material if available
        if (shared && cacheKey && this.sharedMaterials[cacheKey]) {
            return this.sharedMaterials[cacheKey];
        }

        const mat = new BABYLON.PBRMaterial(name, this.scene);
        mat.albedoColor = new BABYLON.Color3(...albedoColor);
        mat.metallic = metallic;
        mat.roughness = roughness;
        mat.maxSimultaneousLights = this.maxLights;

        if (emissiveColor) {
            mat.emissiveColor = Array.isArray(emissiveColor)
                ? new BABYLON.Color3(...emissiveColor)
                : emissiveColor;
            mat.emissiveIntensity = emissiveIntensity;
        }

        if (alpha < 1.0) mat.alpha = alpha;
        mat.backFaceCulling = backFaceCulling;

        // ClearCoat layer - adds polished/lacquered/wet look on top of base material
        if (clearCoat) {
            mat.clearCoat.isEnabled = true;
            mat.clearCoat.intensity = clearCoat.intensity !== undefined ? clearCoat.intensity : 0.5;
            mat.clearCoat.roughness = clearCoat.roughness !== undefined ? clearCoat.roughness : 0.1;
            if (clearCoat.tintColor) {
                mat.clearCoat.isTintEnabled = true;
                mat.clearCoat.tintColor = new BABYLON.Color3(...clearCoat.tintColor);
            }
        }

        // Sheen layer - adds soft fabric-like sheen (velvet, leather, cloth)
        if (sheen) {
            mat.sheen.isEnabled = true;
            mat.sheen.intensity = sheen.intensity !== undefined ? sheen.intensity : 0.5;
            if (sheen.roughness !== undefined) mat.sheen.roughness = sheen.roughness;
            if (sheen.color) {
                mat.sheen.color = new BABYLON.Color3(...sheen.color);
            }
        }

        // Per-material lighting intensity overrides
        if (environmentIntensity !== null) mat.environmentIntensity = environmentIntensity;
        if (directIntensity !== null) mat.directIntensity = directIntensity;
        if (specularIntensity !== null) mat.specularIntensity = specularIntensity;

        // Cache if shared
        if (shared && cacheKey) {
            this.sharedMaterials[cacheKey] = mat;
        }

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

        // Structural - Underground club: black steel with anti-slip finish
        platform: () => this.createPBRMaterial('platformMat', {
            baseColor: [0.015, 0.015, 0.02],
            metallic: 0.7,
            roughness: 0.4
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
        // UNDERGROUND CLUB: Raw poured concrete floor — cold, industrial, slightly damp
        floor: () => this.createPBRMaterial('floorMat', {
            baseColor: [0.08, 0.08, 0.09], // Dark raw concrete
            metallic: 0.0,
            roughness: 0.85 // Rough poured concrete
        }),

        // Underground club floor: raw concrete with moisture sheen
        // Condensation from body heat + fog machine creates a subtle wet layer
        floorPolished: () => this.createFullPBRMaterial('floorPolishedMat', {
            albedoColor: [0.06, 0.06, 0.07], // Near-black concrete — years of boot prints
            metallic: 0.02, // Concrete is not metallic
            roughness: 0.65, // Slightly smoothed by moisture/traffic
            clearCoat: {
                intensity: 0.25, // Subtle moisture sheen, not polished
                roughness: 0.4  // Diffuse wet reflection, not mirror-sharp
            },
            environmentIntensity: 0.2, // Faint reflection of overhead lights
            directIntensity: 0.8,
            specularIntensity: 0.3 // Minimal specular — concrete absorbs light
        }),

        // UNDERGROUND: Raw bunker concrete walls — stained, cold, brutal
        wall: () => this.createPBRMaterial('wallMat', {
            baseColor: [0.04, 0.04, 0.045], // Near-black concrete with cold grey undertone
            metallic: 0.0, // Concrete has zero metallic response
            roughness: 0.95 // Extremely rough — raw poured concrete
        }),

        // UNDERGROUND: Exposed raw concrete ceiling at low height (4.5m)
        // Dark, oppressive, industrial — you should feel the weight above you
        ceiling: () => this.createPBRMaterial('ceilingMat', {
            baseColor: [0.03, 0.03, 0.035], // Almost black — disappears into darkness
            metallic: 0.0,
            roughness: 0.95 // Raw concrete
        }),

        // Lighting/Truss — UNDERGROUND: Matte black painted truss
        // Real underground clubs paint ALL rigging matte black so it disappears
        // The rig should be invisible — only the light matters
        truss: () => this.createPBRMaterial('trussMat', {
            baseColor: [0.02, 0.02, 0.02], // Near-black matte paint
            metallic: 0.3, // Some metallic under the paint
            roughness: 0.85 // Matte powder coat finish
        }, true),

        // Truss connector plates (painted black)
        trussConnector: () => this.createPBRMaterial('trussConnectorMat', {
            baseColor: [0.03, 0.03, 0.03],
            metallic: 0.4,
            roughness: 0.75
        }, true),

        // Weld material (slightly visible under black paint)
        trussWeld: () => this.createPBRMaterial('trussWeldMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.5,
            roughness: 0.6
        }, true),

        // Chain hoist material (black anodized steel)
        chainHoist: () => this.createPBRMaterial('chainHoistMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.7,
            roughness: 0.5
        }, true),

        brace: () => this.createPBRMaterial('braceMat', {
            baseColor: [0.03, 0.03, 0.04], // Black painted brace
            metallic: 0.4,
            roughness: 0.8
        }, true),

        lightFixture: () => this.createPBRMaterial('lightFixtureMat', {
            baseColor: [0.02, 0.02, 0.02], // Black housing
            metallic: 0.6,
            roughness: 0.3
        }, true),

        // Speakers - Enhanced realism with clear visual differentiation
        speakerBody: () => this.createPBRMaterial('speakerBodyMat', {
            baseColor: [0.03, 0.03, 0.03], // Near-black cabinet (tolex/vinyl covering)
            metallic: 0.05, // Matte finish (vinyl wrap)
            roughness: 0.85, // Textured tolex surface
            emissiveColor: [0.02, 0.02, 0.02] // Slight visibility in dark
        }, true),

        speakerGrill: () => this.createPBRMaterial('speakerGrillMat', {
            baseColor: [0.25, 0.25, 0.28], // Lighter metallic grey - much more visible
            metallic: 0.95, // Highly metallic perforated steel
            roughness: 0.15, // Polished metal grill
            emissiveColor: [0.04, 0.04, 0.05] // Visible grill catching light
        }, true),

        speakerHorn: () => this.createPBRMaterial('speakerHornMat', {
            baseColor: [0.08, 0.08, 0.08], // Dark but glossy plastic/fiberglass
            metallic: 0.3, // Hard composite material
            roughness: 0.08, // Very glossy horn flare
            emissiveColor: [0.03, 0.03, 0.03] // Slight reflection visibility
        }, true),

        speakerWoofer: () => this.createPBRMaterial('speakerWooferMat', {
            baseColor: [0.12, 0.12, 0.12], // Dark grey cone material
            metallic: 0.0, // Paper/kevlar/fabric cone - no metal
            roughness: 0.95, // Matte cone surface
            emissiveColor: [0.02, 0.02, 0.02]
        }, true),

        speakerDustCap: () => this.createPBRMaterial('speakerDustCapMat', {
            baseColor: [0.05, 0.05, 0.05], // Black dust cap
            metallic: 0.1,
            roughness: 0.6, // Semi-matte plastic/foam
            emissiveColor: [0.01, 0.01, 0.01]
        }, true),

        speakerSurround: () => this.createPBRMaterial('speakerSurroundMat', {
            baseColor: [0.06, 0.06, 0.06], // Black rubber surround
            metallic: 0.0,
            roughness: 0.7, // Rubber texture
            emissiveColor: [0.015, 0.015, 0.015]
        }, true),

        // Industrial Details — Dark, stained concrete brick
        brick: () => this.createPBRMaterial('brickMat', {
            baseColor: [0.12, 0.06, 0.04], // Dark, smoke-stained brick
            metallic: 0,
            roughness: 1
        }, true),

        pillar: () => this.createPBRMaterial('pillarMat', {
            baseColor: [0.06, 0.06, 0.065], // Dark raw concrete pillars
            metallic: 0.0,
            roughness: 0.9
        }, true),

        // Pipe material — black painted industrial pipes
        pipe: () => this.createPBRMaterial('pipeMat', {
            baseColor: [0.04, 0.04, 0.045],
            metallic: 0.5,
            roughness: 0.7
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
        this.log.warn(`Material preset "${presetName}" not found`);
        return this.createPBRMaterial('fallbackMat', {});
    }

    /**
     * Clear all cached materials (properly disposes them first)
     */
    clearCache() {
        Object.values(this.sharedMaterials).forEach(mat => {
            if (mat && mat.dispose) mat.dispose();
        });
        this.sharedMaterials = {};
    }
}
