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
     * Build a deterministic cache key from a material config.
     *
     * JSON.stringify() was used here previously, which produced different keys for
     * values that are semantically identical: a colour passed as [1, 0, 0] and the
     * same colour passed as a BABYLON.Color3 serialise as `[1,0,0]` vs
     * `{"r":1,"g":0,"b":0}`. That caused silent cache misses and duplicate GPU
     * materials. Key order was also dependent on the destructuring order.
     *
     * @param {string} kind Material class discriminator
     * @param {Object} config Plain config object
     * @returns {string} Stable key
     */
    _cacheKey(kind, config) {
        const norm = (v) => {
            if (v === null || v === undefined) return '~';
            if (Array.isArray(v)) return `[${v.map(norm).join(',')}]`;
            if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
            if (typeof v !== 'object') return String(v);
            // BABYLON.Color3 / Color4 and nested option objects (clearCoat, sheen)
            if (typeof v.r === 'number' && typeof v.g === 'number' && typeof v.b === 'number') {
                return `[${norm(v.r)},${norm(v.g)},${norm(v.b)}${typeof v.a === 'number' ? ',' + norm(v.a) : ''}]`;
            }
            return `{${Object.keys(v).sort().map(k => `${k}:${norm(v[k])}`).join(',')}}`;
        };
        return `${kind}|${Object.keys(config).sort().map(k => `${k}:${norm(config[k])}`).join('|')}`;
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

        // Generate cache key for shared materials (includes all config to prevent collisions).
        // Textures are NOT part of the key and cannot be reliably compared, so a material
        // carrying one is never shared - otherwise two fixtures with identical colours but
        // different emissive maps would silently receive the same material.
        const shareable = shared && !emissiveTexture && !opacityTexture;
        const cacheKey = shareable ? this._cacheKey('pbrmr', {
            baseColor, metallic, roughness, emissiveColor, emissiveIntensity,
            alpha, transparencyMode, backFaceCulling, disableLighting, unlit
        }) : null;
        
        // Return cached material if available
        if (cacheKey && this.sharedMaterials[cacheKey]) {
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
            if (transparencyMode != null) {
                mat.transparencyMode = transparencyMode;
            }
        } else if (transparencyMode != null) {
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
        if (cacheKey) {
            this.sharedMaterials[cacheKey] = mat;
        }

        // Freeze material to prevent shader recompilation.
        // Skip freeze for materials whose emissiveColor / albedoColor is mutated
        // at runtime (lens, source, flare, beam, gobo, strobe, LED, blinder, ...);
        // freezing those would silently no-op the mutations.
        const nameLower = name.toLowerCase();
        const HOT_MUTATED = ['lens', 'source', 'flare', 'beam', 'gobo', 'strobe',
                             'led', 'blinder', 'pool', 'glow', 'laser', 'mirror'];
        if (!HOT_MUTATED.some(tag => nameLower.includes(tag))) {
            mat.freeze();
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

            // An unlit material is a pure emitter (LED panels, strobes, laser beams,
            // signage). A specular highlight on it is physically meaningless, but
            // StandardMaterial defaults specularColor to white - and the SSR pre-pass
            // reads specularColor as reflectivity. Left at the default, every emissive
            // surface is treated as a mirror and gets its colour replaced by a
            // screen-space reflection that resolves to near-black, which blanks the LED
            // wall and leaves only the bloom halo around each panel's edge.
            if (!specularColor) {
                mat.specularColor = new BABYLON.Color3(0, 0, 0);
            }
        }

        if (alpha < 1.0) {
            mat.alpha = alpha;
        }

        if (diffuseTexture) mat.diffuseTexture = diffuseTexture;
        if (emissiveTexture) mat.emissiveTexture = emissiveTexture;
        if (opacityTexture) mat.opacityTexture = opacityTexture;

        // Freeze material to prevent shader recompilation.
        // Skip freeze for materials mutated at runtime (emissiveColor / diffuseColor swaps).
        const nameLower = name.toLowerCase();
        const HOT_MUTATED = ['lens', 'source', 'flare', 'beam', 'gobo', 'strobe',
                             'led', 'blinder', 'pool', 'glow', 'laser', 'mirror'];
        if (!HOT_MUTATED.some(tag => nameLower.includes(tag))) {
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
        const cacheKey = shared ? this._cacheKey('pbr', {
            albedoColor, metallic, roughness, emissiveColor, emissiveIntensity, alpha,
            backFaceCulling, clearCoat, sheen, environmentIntensity, directIntensity,
            specularIntensity
        }) : null;

        // Return cached material if available
        if (cacheKey && this.sharedMaterials[cacheKey]) {
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
        if (cacheKey) {
            this.sharedMaterials[cacheKey] = mat;
        }

        // Freeze (skip for runtime-mutated materials)
        const nameLower = name.toLowerCase();
        const HOT_MUTATED = ['lens', 'source', 'flare', 'beam', 'gobo', 'strobe',
                             'led', 'blinder', 'pool', 'glow', 'laser', 'mirror'];
        if (!HOT_MUTATED.some(tag => nameLower.includes(tag))) {
            mat.freeze();
        }
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

        // Polished nightclub floor with clearcoat layer (wet/lacquered look)
        // Uses full PBRMaterial for advanced multi-layer rendering
        floorPolished: () => this.createFullPBRMaterial('floorPolishedMat', {
            albedoColor: [0.12, 0.12, 0.15],  // Dark polished tiles
            metallic: 0.08,
            roughness: 0.25,                    // Smooth polished surface
            clearCoat: {
                intensity: 0.6,                 // Strong clear lacquer/wet layer
                roughness: 0.12                 // Very smooth clearcoat for sharp reflections
            },
            environmentIntensity: 0.65,         // Strong environment reflections off polished surface
            directIntensity: 1.1,               // Enhanced direct light response
            specularIntensity: 0.9              // Strong specular highlights
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

// Export for use in main club script (classic script, no module system).
// Kept consistent with textureLoader.js / modelLoader.js / lightFactory.js.
window.MaterialFactory = MaterialFactory;
