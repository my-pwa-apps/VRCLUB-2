// Light Factory - Centralized light creation and management
// Reduces code duplication and provides consistent light configuration

class LightFactory {
    constructor(scene, logger = null, maxLights = null) {
        this.scene = scene;
        this.log = logger || console; // Use provided logger or fallback to console
        this.lights = new Map(); // name -> light instance
        this.lightGroups = new Map(); // group name -> array of lights
        /**
         * Device PER-MATERIAL simultaneous-light limit, for reference by callers.
         *
         * Note this is NOT a scene-wide cap: a scene may hold many more lights than
         * this as long as each material's `maxSimultaneousLights` stays within it and
         * lights are scoped with includedOnlyMeshes / excludedMeshes. The club runs
         * ~11 lights against a per-material budget of 3.
         */
        this.maxLights = maxLights;
    }

    /**
     * Register a newly created light, warning on a name collision (which would
     * otherwise make the previous light unreachable through the registry while it
     * kept rendering and consuming a slot on every material that sees it).
     */
    _register(name, light) {
        if (this.lights.has(name)) {
            this.log.warn(`Light "${name}" already exists - disposing the previous instance`);
            this.disposeLight(name);
        }
        this.lights.set(name, light);
    }

    /** Count lights that consume a per-material light slot (hemispheric ambient does not). */
    countBudgetedLights() {
        let n = 0;
        this.scene.lights.forEach(light => {
            if (!light.isEnabled || !light.isEnabled()) return;
            if (light.getClassName && light.getClassName() === 'HemisphericLight') return;
            n++;
        });
        return n;
    }

    /**
     * Create a point light with common defaults
     * @param {string} name - Light name
     * @param {BABYLON.Vector3} position - Light position
     * @param {Object} config - Light configuration
     */
    createPointLight(name, position, config = {}) {
        const {
            intensity = 1.0,
            range = 10,
            diffuse = [1, 1, 1],
            specular = [1, 1, 1],
            excludedMeshes = [],
            includedMeshes = null,
            group = null
        } = config;

        const light = new BABYLON.PointLight(name, position, this.scene);
        light.intensity = intensity;
        light.range = range;
        light.diffuse = Array.isArray(diffuse) 
            ? new BABYLON.Color3(...diffuse)
            : diffuse;
        light.specular = Array.isArray(specular)
            ? new BABYLON.Color3(...specular)
            : specular;

        // Exclude/include specific meshes
        if (excludedMeshes.length > 0) {
            light.excludedMeshes = excludedMeshes;
        }
        if (includedMeshes) {
            light.includedOnlyMeshes = includedMeshes;
        }

        // Add to registry
        this._register(name, light);
        
        // Add to group if specified
        if (group) {
            this.addToGroup(group, light);
        }

        return light;
    }

    /**
     * Create a spot light with common defaults
     * @param {string} name - Light name
     * @param {BABYLON.Vector3} position - Light position
     * @param {BABYLON.Vector3} direction - Light direction
     * @param {Object} config - Light configuration
     */
    createSpotLight(name, position, direction, config = {}) {
        const {
            angle = Math.PI / 4,
            exponent = 2,
            intensity = 1.0,
            range = 20,
            diffuse = [1, 1, 1],
            specular = [1, 1, 1],
            shadowGenerator = false,
            excludedMeshes = [],
            includedMeshes = null,
            group = null
        } = config;

        const light = new BABYLON.SpotLight(name, position, direction, angle, exponent, this.scene);
        light.intensity = intensity;
        light.range = range;
        light.diffuse = Array.isArray(diffuse)
            ? new BABYLON.Color3(...diffuse)
            : diffuse;
        light.specular = Array.isArray(specular)
            ? new BABYLON.Color3(...specular)
            : specular;

        // Exclude/include specific meshes
        if (excludedMeshes.length > 0) {
            light.excludedMeshes = excludedMeshes;
        }
        if (includedMeshes) {
            light.includedOnlyMeshes = includedMeshes;
        }

        // Create shadow generator if requested.
        // The ShadowGenerator constructor registers itself on the light; the retrieval
        // API is light.getShadowGenerator(). A `light.shadowGenerator = ...` assignment
        // creates a dead own-property that implies a coupling which does not exist.
        if (shadowGenerator) {
            const shadowGen = new BABYLON.ShadowGenerator(1024, light);
            shadowGen.useBlurExponentialShadowMap = true;
            shadowGen.blurKernel = 32;
        }

        // Add to registry
        this._register(name, light);
        
        // Add to group if specified
        if (group) {
            this.addToGroup(group, light);
        }

        return light;
    }

    /**
     * Create a hemispheric light (ambient/fill light)
     * @param {string} name - Light name
     * @param {BABYLON.Vector3} direction - Light direction (usually up)
     * @param {Object} config - Light configuration
     */
    createHemisphericLight(name, direction, config = {}) {
        const {
            intensity = 0.5,
            diffuse = [1, 1, 1],
            specular = [0, 0, 0],
            groundColor = [0, 0, 0],
            group = null
        } = config;

        const light = new BABYLON.HemisphericLight(name, direction, this.scene);
        light.intensity = intensity;
        light.diffuse = Array.isArray(diffuse)
            ? new BABYLON.Color3(...diffuse)
            : diffuse;
        light.specular = Array.isArray(specular)
            ? new BABYLON.Color3(...specular)
            : specular;
        light.groundColor = Array.isArray(groundColor)
            ? new BABYLON.Color3(...groundColor)
            : groundColor;

        // Add to registry
        this._register(name, light);
        
        // Add to group if specified
        if (group) {
            this.addToGroup(group, light);
        }

        return light;
    }

    /**
     * Create a directional light
     * @param {string} name - Light name
     * @param {BABYLON.Vector3} direction - Light direction
     * @param {Object} config - Light configuration
     */
    createDirectionalLight(name, direction, config = {}) {
        const {
            intensity = 1.0,
            diffuse = [1, 1, 1],
            specular = [1, 1, 1],
            shadowGenerator = false,
            excludedMeshes = [],
            includedMeshes = null,
            group = null
        } = config;

        const light = new BABYLON.DirectionalLight(name, direction, this.scene);
        light.intensity = intensity;
        light.diffuse = Array.isArray(diffuse)
            ? new BABYLON.Color3(...diffuse)
            : diffuse;
        light.specular = Array.isArray(specular)
            ? new BABYLON.Color3(...specular)
            : specular;

        // Exclude/include specific meshes
        if (excludedMeshes.length > 0) {
            light.excludedMeshes = excludedMeshes;
        }
        if (includedMeshes) {
            light.includedOnlyMeshes = includedMeshes;
        }

        // Create shadow generator if requested. See the note on createPointLight.
        if (shadowGenerator) {
            const shadowGen = new BABYLON.ShadowGenerator(2048, light);
            shadowGen.useBlurExponentialShadowMap = true;
            shadowGen.blurKernel = 64;
        }

        // Add to registry
        this._register(name, light);
        
        // Add to group if specified
        if (group) {
            this.addToGroup(group, light);
        }

        return light;
    }

    /**
     * Add a light to a named group for batch operations
     */
    addToGroup(groupName, light) {
        if (!this.lightGroups.has(groupName)) {
            this.lightGroups.set(groupName, []);
        }
        const group = this.lightGroups.get(groupName);
        // Duplicates would make setGroupIntensity write twice and leave a dangling
        // reference to a disposed light (disposeLight only splices the first match).
        if (!group.includes(light)) group.push(light);
    }

    /**
     * Get a light by name
     */
    getLight(name) {
        return this.lights.get(name);
    }

    /**
     * Get all lights in a group
     */
    getGroup(groupName) {
        return this.lightGroups.get(groupName) || [];
    }

    /**
     * Set intensity for all lights in a group
     */
    setGroupIntensity(groupName, intensity) {
        const lights = this.getGroup(groupName);
        lights.forEach(light => {
            light.intensity = intensity;
        });
    }

    /**
     * Set color for all lights in a group
     */
    setGroupColor(groupName, color) {
        const lights = this.getGroup(groupName);
        const colorObj = Array.isArray(color) ? new BABYLON.Color3(...color) : color;
        lights.forEach(light => {
            light.diffuse = colorObj.clone();
        });
    }

    /**
     * Toggle lights in a group on/off
     */
    toggleGroup(groupName, enabled) {
        const lights = this.getGroup(groupName);
        lights.forEach(light => {
            light.setEnabled(enabled);
        });
    }

    /**
     * Dispose a single light
     */
    disposeLight(name) {
        const light = this.lights.get(name);
        if (light) {
            // A ShadowGenerator owns a RenderTargetTexture and is NOT disposed by
            // light.dispose(); leaking it keeps a full shadow map alive on the GPU.
            if (light.getShadowGenerator && light.getShadowGenerator()) {
                light.getShadowGenerator().dispose();
            }
            light.dispose();
            this.lights.delete(name);
            
            // Remove from all groups
            this.lightGroups.forEach((lights) => {
                const index = lights.indexOf(light);
                if (index > -1) {
                    lights.splice(index, 1);
                }
            });
        }
    }

    /**
     * Dispose all lights in a group.
     *
     * The group array is COPIED first: disposeLight() splices the light out of every
     * group it belongs to, and Array.prototype.forEach does not re-index - so
     * iterating the live array skipped every other light, and the subsequent
     * `lightGroups.delete()` destroyed the only handle to the survivors.
     */
    disposeGroup(groupName) {
        const lights = [...this.getGroup(groupName)];
        const byLight = new Map(Array.from(this.lights.entries()).map(([n, l]) => [l, n]));
        lights.forEach(light => {
            const name = byLight.get(light);
            if (name) this.disposeLight(name);
        });
        this.lightGroups.delete(groupName);
    }

    /**
     * Dispose all lights
     */
    disposeAll() {
        for (const name of [...this.lights.keys()]) this.disposeLight(name);
        this.lights.clear();
        this.lightGroups.clear();
    }

    /** Alias so every factory in the app exposes the same teardown entry point. */
    dispose() { this.disposeAll(); }

    /**
     * Get statistics about lights
     */
    getStats() {
        return {
            totalLights: this.lights.size,
            groups: this.lightGroups.size,
            groupBreakdown: Array.from(this.lightGroups.entries()).map(([name, lights]) => ({
                name,
                count: lights.length
            }))
        };
    }

    /**
     * Preset light configurations for common club scenarios
     */
    presets = {
        // Ambient fill light
        ambient: (name = 'ambient') => this.createHemisphericLight(
            name,
            new BABYLON.Vector3(0, 1, 0),
            {
                intensity: 0.04,
                diffuse: [0.9, 0.9, 1.0],
                specular: [0, 0, 0],
                groundColor: [0.03, 0.01, 0.06]
            }
        ),

        // DJ booth spotlight
        djLight: (position, name = 'djLight') => this.createPointLight(
            name,
            position,
            {
                intensity: 2.0,
                range: 8,
                diffuse: [1, 1, 1],
                group: 'dj'
            }
        ),

        // Speaker accent light
        speakerLight: (position, name) => this.createPointLight(
            name,
            position,
            {
                intensity: 1.2,
                range: 6,
                diffuse: [1, 1, 1],
                group: 'speakers'
            }
        ),

        // Truss-mounted spotlight
        spotlight: (position, direction, name, color = [1, 1, 1]) => this.createSpotLight(
            name,
            position,
            direction,
            {
                angle: Math.PI / 4,
                exponent: 2,
                intensity: 8,
                range: 40,
                diffuse: color,
                specular: [1, 1, 1],
                group: 'spotlights'
            }
        ),

        // Laser emitter light
        laserLight: (position, name, color = [1, 0, 0]) => this.createPointLight(
            name,
            position,
            {
                intensity: 0.5,
                range: 3,
                diffuse: color,
                specular: [0, 0, 0],
                group: 'lasers'
            }
        )
    };

    /**
     * Get a preset light by name.
     *
     * Returns a disabled HemisphericLight rather than null for an unknown preset:
     * every call site immediately writes properties on the result, so `null` turned
     * a typo into a TypeError instead of a degraded-but-running scene. That is the
     * opposite of the graceful-degradation philosophy applied everywhere else here
     * (compare MaterialFactory.getPreset, which returns a fallback material).
     */
    getPreset(presetName, ...args) {
        if (this.presets[presetName]) {
            return this.presets[presetName](...args);
        }
        this.log.warn(`Light preset "${presetName}" not found`);
        const fallback = new BABYLON.HemisphericLight(
            `missingPreset_${presetName}`, new BABYLON.Vector3(0, 1, 0), this.scene
        );
        fallback.intensity = 0;
        fallback.setEnabled(false);
        return fallback;
    }
}

// Export for use in main club script
window.LightFactory = LightFactory;
