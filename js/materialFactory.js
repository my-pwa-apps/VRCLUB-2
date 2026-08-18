// Material Factory - Centralized material creation and reuse
// Eliminates code duplication and ensures consistent material settings

class MaterialFactory {
    /**
     * Material names whose emissiveColor / albedoColor are written at runtime.
     * Freezing these would silently no-op every mutation.
     *
     * Substring matching on names is fragile (a future `enabledMat` matches 'led'),
     * but it is the current contract across ~200 call sites. Declared once here
     * rather than copy-pasted into each creator.
     */
    static HOT_MUTATED = Object.freeze([
        'lens', 'source', 'flare', 'beam', 'gobo', 'strobe',
        'led', 'blinder', 'pool', 'glow', 'laser', 'mirror',
        'toggle', 'audiobtn', 'sliderhandle'
    ]);

    static isHotMutated(name) {
        const lower = String(name).toLowerCase();
        return MaterialFactory.HOT_MUTATED.some(tag => lower.includes(tag));
    }

    constructor(scene, maxLights = 4, logger = null) {
        this.scene = scene;
        this.maxLights = maxLights;
        this.log = logger || console; // Use provided logger or fallback to console
        
        // Cache of shared materials (keyed by material type).
        // Object.create(null): keys are derived from config VALUES, so a key of
        // 'constructor' or '__proto__' would otherwise produce a false cache hit or a
        // broken assignment against Object.prototype.
        this.sharedMaterials = Object.create(null);

        // Cache of procedurally generated surface-detail map sets, keyed by kind.
        // See _getDetailMaps().
        this.detailMaps = Object.create(null);

        // Presets take no arguments, so their results are memoised by name.
        this._presetCache = Object.create(null);
    }

    /**
     * Deterministic PRNG. Math.random() would give a different club on every reload,
     * which makes visual regressions impossible to eyeball.
     * @param {number} seed
     * @returns {() => number} generator in [0, 1)
     */
    _seededRandom(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    /**
     * Build (once, then cache) a normal + metallicRoughness map pair for a class of
     * surface finish.
     *
     * Every prop in the club that is not the floor, walls or ceiling was shaded with a
     * single flat baseColour and a single scalar roughness. A perfectly uniform roughness
     * is the strongest "this is CG" cue there is: real metal and real road-cased plastic
     * have directional machining marks, scuffs and grime, so their specular highlight
     * breaks up as it travels across the surface. These maps reintroduce that break-up
     * without any download, any licence attribution, or any extra draw call - they are
     * shared by every material of the same finish.
     *
     * Maps are generated tileable: the anisotropic kinds vary per-row and span the full
     * width, and the isotropic kind is wrapped noise.
     *
     * Cached per (kind, scale) pair. DynamicTexture.clone() deliberately does not copy
     * canvas contents, so a differently-tiled variant has to be regenerated rather than
     * cloned - at 256x256 that is a sub-millisecond cost paid once per variant.
     *
     * @param {'brushedMetal'|'castMetal'|'plastic'} kind
     * @param {number} scale UV repeats
     * @returns {{normal: BABYLON.Texture, metallicRoughness: BABYLON.Texture}|null}
     */
    _getDetailMaps(kind, scale) {
        const cacheKey = `${kind}@${scale}`;
        if (cacheKey in this.detailMaps) return this.detailMaps[cacheKey];
        if (typeof document === 'undefined' || !BABYLON.DynamicTexture) return null;

        const SIZE = 256;
        let maps = null;

        try {
            const makeTexture = (name) => {
                const tex = new BABYLON.DynamicTexture(name, { width: SIZE, height: SIZE },
                    this.scene, true);
                // Normal and metallicRoughness maps carry data, not colour. Decoding them
                // from sRGB would skew every value.
                tex.gammaSpace = false;
                tex.hasAlpha = false;
                tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
                tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
                tex.uScale = scale;
                tex.vScale = scale;
                return tex;
            };

            const normalTex = makeTexture(`${kind}NormalDetail_${scale}`);
            const mrTex = makeTexture(`${kind}MRDetail_${scale}`);
            const nCtx = normalTex.getContext();
            const mCtx = mrTex.getContext();

            // Distinct seed per kind so the three finishes do not share a pattern.
            const seedBase = kind === 'brushedMetal' ? 0x5f356495
                : kind === 'castMetal' ? 0x27d4eb2f : 0x165667b1;
            const rand = this._seededRandom(seedBase);

            // A tileable 1D value-noise band used for the anisotropic finishes: one value
            // per row, smoothed so streaks have believable width instead of reading as
            // per-pixel static.
            const smoothBand = (octaves) => {
                const out = new Float32Array(SIZE);
                let amplitude = 1;
                let total = 0;
                for (let o = 0; o < octaves; o++) {
                    const period = SIZE >> o;
                    const controlCount = Math.max(2, Math.floor(SIZE / period * 8) || 2);
                    const control = new Float32Array(controlCount);
                    for (let c = 0; c < controlCount; c++) control[c] = rand();
                    for (let i = 0; i < SIZE; i++) {
                        const t = (i / SIZE) * controlCount;
                        const i0 = Math.floor(t) % controlCount;
                        const i1 = (i0 + 1) % controlCount;
                        const f = t - Math.floor(t);
                        // Smoothstep between control points keeps the band C1-continuous
                        // and, because i1 wraps, seamless top-to-bottom.
                        const s = f * f * (3 - 2 * f);
                        out[i] += (control[i0] * (1 - s) + control[i1] * s) * amplitude;
                    }
                    total += amplitude;
                    amplitude *= 0.5;
                }
                for (let i = 0; i < SIZE; i++) out[i] /= total;
                return out;
            };

            if (kind === 'plastic') {
                // Isotropic fine grain: textured ABS, road-case vinyl, powder coat.
                const nImg = nCtx.createImageData(SIZE, SIZE);
                const mImg = mCtx.createImageData(SIZE, SIZE);
                // Height field first, so normals can be taken as real gradients rather
                // than uncorrelated per-channel noise (which reads as coloured fizz).
                const height = new Float32Array(SIZE * SIZE);
                for (let i = 0; i < height.length; i++) height[i] = rand();
                const at = (x, y) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
                for (let y = 0; y < SIZE; y++) {
                    for (let x = 0; x < SIZE; x++) {
                        const idx = (y * SIZE + x) * 4;
                        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5;
                        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.5;
                        // Shallow bump: a grain this fine should perturb the highlight,
                        // not visibly deform the silhouette shading.
                        nImg.data[idx] = Math.max(0, Math.min(255, 128 - dx * 70));
                        nImg.data[idx + 1] = Math.max(0, Math.min(255, 128 - dy * 70));
                        nImg.data[idx + 2] = 255;
                        nImg.data[idx + 3] = 255;

                        // Broad blotches of wear on top of the grain.
                        const blotch = at(x >> 4 << 4, y >> 4 << 4);
                        const rough = 0.78 + blotch * 0.18 + at(x, y) * 0.04;
                        mImg.data[idx] = 0;
                        mImg.data[idx + 1] = Math.round(Math.min(1, rough) * 255); // roughness
                        mImg.data[idx + 2] = 255;                                  // metallic
                        mImg.data[idx + 3] = 255;
                    }
                }
                nCtx.putImageData(nImg, 0, 0);
                mCtx.putImageData(mImg, 0, 0);
            } else {
                // Anisotropic linear finish. brushedMetal = tight directional grain
                // (extruded aluminium truss tube); castMetal = coarser, plus pitting.
                const tight = kind === 'brushedMetal';
                const grain = smoothBand(tight ? 5 : 3);
                const roughBand = smoothBand(3);

                const nImg = nCtx.createImageData(SIZE, SIZE);
                const mImg = mCtx.createImageData(SIZE, SIZE);

                for (let y = 0; y < SIZE; y++) {
                    // Gradient of the band across V. Streaks run along U, so all of the
                    // normal deviation lands in the green channel; drawing full-width
                    // rows is what keeps the map tileable in U.
                    const prev = grain[(y - 1 + SIZE) % SIZE];
                    const next = grain[(y + 1) % SIZE];
                    const slope = (next - prev) * 0.5;
                    const g = Math.max(0, Math.min(255,
                        Math.round(128 - slope * (tight ? 900 : 500))));
                    const rough = tight
                        ? 0.72 + roughBand[y] * 0.24
                        : 0.62 + roughBand[y] * 0.30;

                    for (let x = 0; x < SIZE; x++) {
                        const idx = (y * SIZE + x) * 4;
                        nImg.data[idx] = 128;
                        nImg.data[idx + 1] = g;
                        nImg.data[idx + 2] = 255;
                        nImg.data[idx + 3] = 255;

                        let r = rough;
                        if (!tight) {
                            // Casting pits: sparse, much rougher, and they must wrap.
                            const pit = rand();
                            if (pit > 0.994) r = Math.min(1, r + 0.35);
                        }
                        mImg.data[idx] = 0;
                        mImg.data[idx + 1] = Math.round(Math.min(1, r) * 255);
                        mImg.data[idx + 2] = 255;
                        mImg.data[idx + 3] = 255;
                    }
                }
                nCtx.putImageData(nImg, 0, 0);
                mCtx.putImageData(mImg, 0, 0);
            }

            // invertY=false: the maps are direction-agnostic noise, and skipping the
            // flip keeps the generated gradients consistent with the array we wrote.
            normalTex.update(false);
            mrTex.update(false);

            maps = { normal: normalTex, metallicRoughness: mrTex };
            this.detailMaps[cacheKey] = maps;
        } catch (err) {
            // No build step and no browser test covers this path - a failure here must
            // degrade to the previous flat-shaded look, never break scene construction.
            this.log.warn(`Could not generate "${kind}" detail maps: ${err.message}`);
            this.detailMaps[cacheKey] = null;
        }

        return this.detailMaps[cacheKey];
    }

    /**
     * Attach a cached detail map set to a material.
     * @param {BABYLON.PBRMetallicRoughnessMaterial} mat
     * @param {string} kind
     * @param {number} scale UV repeats
     */
    _applyDetail(mat, kind, scale) {
        const maps = this._getDetailMaps(kind, scale);
        if (!maps) return;
        mat.normalTexture = maps.normal;
        mat.metallicRoughnessTexture = maps.metallicRoughness;
        mat.invertNormalMapX = false;
        mat.invertNormalMapY = false;
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
            opacityTexture = null,
            // Procedural surface-detail finish: 'brushedMetal' | 'castMetal' | 'plastic'.
            // Adds a shared normal + metallicRoughness map pair. See _getDetailMaps().
            detail = null,
            detailScale = 4
        } = config;

        // Generate cache key for shared materials (includes all config to prevent collisions).
        // Textures are NOT part of the key and cannot be reliably compared, so a material
        // carrying one is never shared - otherwise two fixtures with identical colours but
        // different emissive maps would silently receive the same material.
        // `detail` is exempt: it is a string naming a texture set the factory owns and
        // caches itself, so two materials with the same detail key provably share pixels.
        const shareable = shared && !emissiveTexture && !opacityTexture;
        const cacheKey = shareable ? this._cacheKey('pbrmr', {
            baseColor, metallic, roughness, emissiveColor, emissiveIntensity,
            alpha, transparencyMode, backFaceCulling, disableLighting, unlit,
            detail, detailScale
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

        // Detail maps go on before the freeze below - freezing locks the shader.
        if (detail) this._applyDetail(mat, detail, detailScale);

        // Cache if shared
        if (cacheKey) {
            this.sharedMaterials[cacheKey] = mat;
            mat._vrclubShared = true;
        }

        // Freeze material to prevent shader recompilation.
        // Skip freeze for materials whose emissiveColor / albedoColor is mutated
        // at runtime (lens, source, flare, beam, gobo, strobe, LED, blinder, ...);
        // freezing those would silently no-op the mutations.
        if (!MaterialFactory.isHotMutated(name)) {
            mat.freeze();
        }

        return mat;
    }

    /**
     * Create standard material (for emissive/unlit objects).
     *
     * NOTE: unlike its two siblings this creator has no cache path, so it takes no
     * `shared` argument. Call sites that pass a third argument expecting sharing are
     * silently getting a fresh material and a fresh GPU program each time - the
     * warning below makes that visible instead of invisible.
     */
    createStandardMaterial(name, config = {}, shared) {
        if (shared !== undefined) {
            this.log.warn(`createStandardMaterial('${name}') does not support sharing; the third argument is ignored.`);
        }
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
        mat.maxSimultaneousLights = this.maxLights;

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
        if (!MaterialFactory.isHotMutated(name)) {
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
            mat._vrclubShared = true;
        }

        // Freeze (skip for runtime-mutated materials)
        if (!MaterialFactory.isHotMutated(name)) {
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
            roughness: 0.30, // Brushed alloy top plate
            detail: 'brushedMetal',
            detailScale: 3
        }, true),

        jogWheel: () => this.createStandardMaterial('jogWheelMat', {
            emissiveColor: [0, 0.8, 0.4], // Boosted from [0, 0.6, 0.3]
            disableLighting: true
        }),

        mixer: () => this.createPBRMaterial('mixerMat', {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.95, // Increased from 0.9
            roughness: 0.18,
            detail: 'brushedMetal',
            detailScale: 3
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
            roughness: 1.0, // Anti-slip stage tread
            detail: 'plastic',
            detailScale: 10
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
        // Roughness scalars on every `detail`-bearing preset below are pre-divided by the
        // mean of that finish's roughness map (brushedMetal ~0.84, castMetal ~0.77,
        // plastic ~0.89) because metallicRoughnessTexture multiplies the scalar. The
        // average look is therefore unchanged; only the variation is new.
        truss: () => this.createPBRMaterial('trussMat', {
            baseColor: [0.72, 0.72, 0.75], // Brighter aluminum
            metallic: 1.0,
            roughness: 0.21, // Brushed finish (0.18 pre-compensated for the detail map)
            emissiveColor: [0.04, 0.04, 0.045],
            detail: 'brushedMetal',
            detailScale: 6
        }, true),

        // Truss connector plates (galvanized steel)
        trussConnector: () => this.createPBRMaterial('trussConnectorMat', {
            baseColor: [0.5, 0.5, 0.52],
            metallic: 0.95,
            roughness: 0.39,
            emissiveColor: [0.025, 0.025, 0.028],
            detail: 'castMetal',
            detailScale: 3
        }, true),

        // Weld material (darker at joints)
        trussWeld: () => this.createPBRMaterial('trussWeldMat', {
            baseColor: [0.35, 0.35, 0.38],
            metallic: 0.85,
            roughness: 0.65,
            emissiveColor: [0.018, 0.018, 0.022],
            detail: 'castMetal',
            detailScale: 4
        }, true),

        // Chain hoist material (steel chain)
        chainHoist: () => this.createPBRMaterial('chainHoistMat', {
            baseColor: [0.25, 0.25, 0.28],
            metallic: 0.9,
            roughness: 0.52,
            detail: 'castMetal',
            detailScale: 4
        }, true),

        brace: () => this.createPBRMaterial('braceMat', {
            baseColor: [0.5, 0.5, 0.55],
            metallic: 1.0,
            roughness: 0.42,
            emissiveColor: [0.025, 0.025, 0.03],
            detail: 'brushedMetal',
            detailScale: 6
        }, true),

        lightFixture: () => this.createPBRMaterial('lightFixtureMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.95,
            roughness: 0.20,
            detail: 'castMetal',
            detailScale: 5
        }, true),

        // Speakers - Enhanced realism with clear visual differentiation
        speakerBody: () => this.createPBRMaterial('speakerBodyMat', {
            baseColor: [0.03, 0.03, 0.03], // Near-black cabinet (tolex/vinyl covering)
            metallic: 0.05, // Matte finish (vinyl wrap)
            roughness: 0.95, // Textured tolex surface
            emissiveColor: [0.02, 0.02, 0.02], // Slight visibility in dark
            detail: 'plastic',
            detailScale: 8
        }, true),

        speakerGrill: () => this.createPBRMaterial('speakerGrillMat', {
            baseColor: [0.25, 0.25, 0.28], // Lighter metallic grey - much more visible
            metallic: 0.95, // Highly metallic perforated steel
            roughness: 0.18, // Polished metal grill
            emissiveColor: [0.04, 0.04, 0.05], // Visible grill catching light
            detail: 'brushedMetal',
            detailScale: 6
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
            roughness: 0.78,
            detail: 'castMetal',
            detailScale: 3
        }, true),

        // Laser/Effects - Enhanced emissive
        laserHousing: () => this.createPBRMaterial('laserHousingMat', {
            baseColor: [0.05, 0.05, 0.05],
            metallic: 0.9, // Increased from 0.8
            roughness: 0.33,
            emissiveColor: [0.08, 0, 0], // Boosted from [0.05, 0, 0]
            detail: 'castMetal',
            detailScale: 5
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
     * Get a preset material by name.
     *
     * Memoised: several presets do NOT pass `shared: true`, so each call built a
     * brand-new material and a brand-new GPU program. Presets take no arguments, so
     * caching by name is trivially safe and removes the in-a-loop foot-gun the name
     * `getPreset` invites.
     */
    getPreset(presetName) {
        if (this._presetCache[presetName]) return this._presetCache[presetName];
        if (this.presets[presetName]) {
            const mat = this.presets[presetName]();
            this._presetCache[presetName] = mat;
            return mat;
        }
        this.log.warn(`Material preset "${presetName}" not found`);
        return this.createPBRMaterial('fallbackMat', {});
    }

    /**
     * Release factory-owned resources that scene.dispose() does not reclaim, and
     * drop references to objects it does (so a reused factory cannot hand out a
     * disposed material).
     */
    dispose() {
        Object.values(this.detailMaps).forEach(pair => {
            if (!pair) return;
            for (const tex of Object.values(pair)) {
                if (tex && tex.dispose) { try { tex.dispose(); } catch (_) { /* ignore */ } }
            }
        });
        this.detailMaps = Object.create(null);
        this.sharedMaterials = Object.create(null);
        this._presetCache = Object.create(null);
    }
}

// Export for use in main club script (classic script, no module system).
// Kept consistent with textureLoader.js / modelLoader.js / lightFactory.js.
window.MaterialFactory = MaterialFactory;
