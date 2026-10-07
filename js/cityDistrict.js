'use strict';
// The street outside the club. Mixed into VRClub.prototype by club_hyperrealistic.js, so `this` is the club.
//
// The district is ONE baked GLB (js/models/city/downtown.glb, made by scripts/build-city-assets.mjs from the CC0
// Quaternius "Downtown City MegaKit"): an avenue with a row of buildings on either side, in club coordinates. This file
// loads it, makes it fit the club's rendering rules, lights it for night, adds a sky and a distant skyline, fences it, and
// opens the vestibule's street door once it is there. If the GLB cannot be loaded the door simply stays shut.
//
// Rules that carry over from the rest of the club:
//   * Every material is opaque (VR rejects blending); only the road paint is alpha-tested.
//   * Lit materials are never frozen, and every one is held to the device's light budget. The two night lights are
//     scoped to the city's own meshes (like the DJ and PA accents), so no club material gains a light slot.
//   * The district costs nothing indoors: its root is disabled until the guest is near the entrance.
//   * Nothing here allocates per frame.

const CITY_LAYOUT = Object.freeze({
    url: './js/models/city/downtown.glb',
    // Mirrors CITY in scripts/build-city-assets.mjs (a contract test keeps the two equal).
    halfLength: 48,
    forecourtFrom: 0.25,
    sidewalkNear: 6.25,
    roadFrom: 9.25,
    roadTo: 21.25,
    farFront: 24.25,
    // The forecourt's paving stops this far either side of the club's centre line, over the entrance stair (the stair
    // hall's own floors close the gap inside the vestibule).
    forecourtOpening: 3,
    // The street stands this high above the club floor: the club is a basement (VenueLayout.vestibule.streetLevel).
    // The GLB is baked at y = 0; the district's root lifts it.
    groundY: 2.8,
    // The vestibule's street door (VenueLayout.vestibule.farZ + the wall's thickness).
    doorZ: 6.3,
    doorHalfWidth: 1.66,
    doorHeight: 3.06,
    // The street is drawn only while a guest is near the front: from the dance floor's front edge forward.
    showFromZ: -8,
    hideBelowZ: -10,
    // Invisible fence at each end of the avenue, inside the bollards.
    fenceX: 45.5,
    fenceZ: [0.3, 23.9]
});

const CityLayout = {
    ...CITY_LAYOUT,

    /**
     * How far outdoors a position is: 0 inside the club or its vestibule, 1 on the street, easing across the
     * street door. Pure, so audio, fog and the visibility manager agree.
     */
    exteriorAmount(x, z) {
        if (z < 0.25 && Math.abs(x) < 13) return 0;
        if (z < 7.4 && Math.abs(x) < 4.2) {
            const t = Math.min(1, Math.max(0, (z - 5.0) / 2.4));
            return t * t * (3 - 2 * t);
        }
        return 1;
    },

    /** Distance from a point on the street to the street door's threshold, in the horizontal plane. */
    doorDistance(x, z) {
        return Math.hypot(x, Math.max(0, z - CITY_LAYOUT.doorZ));
    }
};
window.CityLayout = CityLayout;

const CityDistrict = {
    /** Start loading the district once. Resolves true when it is in the scene and the door is open. */
    createCityDistrict() {
        if (!this._cityPromise) {
            this._cityPromise = this._loadCityDistrict().catch(error => {
                log.warn('🏙️ The street could not be built; the street door stays shut:', error);
                return false;
            });
        }
        return this._cityPromise;
    },

    async _loadCityDistrict() {
        const loader = this.modelLoader;
        if (!loader || loader.gltfPluginAvailable === false) return false;
        const bytes = await loader.loadOrDownloadModel(CityLayout.url);
        if (this._disposed) return false;

        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
        let container;
        try {
            container = await BABYLON.SceneLoader.LoadAssetContainerAsync('', blobUrl, this.scene, null, '.glb');
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
        if (this._disposed) { container.dispose(); return false; }

        try {
            this._installCityDistrict(container);
        } catch (error) {
            try { container.removeAllFromScene(); } catch (_) { /* ignore */ }
            try { container.dispose(); } catch (_) { /* ignore */ }
            this._cityContainer = null;
            throw error;
        }
        return true;
    },

    _installCityDistrict(container) {
        container.addAllToScene();
        // The glTF loader raises maxSimultaneousLights on every material in the scene as its last step.
        if (this.modelLoader._enforceSceneLightBudget) this.modelLoader._enforceSceneLightBudget();
        this._cityContainer = container;

        const root = new BABYLON.TransformNode('cityDistrict', this.scene);
        root.position.y = CityLayout.groundY;
        container.rootNodes.forEach(node => { node.parent = root; });
        this._cityRoot = root;

        const meshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        this._cityMeshes = meshes;
        root.computeWorldMatrix(true);
        for (const mesh of meshes) {
            mesh.isPickable = false; // the teleport feature picks its own floor list by predicate
            mesh.receiveShadows = false;
            mesh.computeWorldMatrix(true);
            mesh.freezeWorldMatrix();
            mesh.doNotSyncBoundingInfo = true;
        }
        // Babylon makes one mesh per glTF primitive (`far3_primitive0`...), so the street is a set of meshes.
        this._cityGround = meshes.filter(mesh => this._cityNodeName(mesh) === 'street');

        this._styleCityMaterials(container.materials);
        this._createCityLights(meshes);
        this._createCitySky();
        this._createCitySkyline();
        this._createCityColliders(meshes);

        // Keep it all enabled until every material has compiled (the VR button waits on whenReady), then let the
        // per-frame manager hide it whenever the guest is deep inside the club.
        this._cityWarm = true;
        this._cityVisible = true;
        const settle = this.scene.whenReadyAsync ? this.scene.whenReadyAsync() : Promise.resolve();
        Promise.resolve(settle).catch(() => {}).then(() => { this._cityWarm = false; });

        this._applyAnisotropicFiltering();
        this._openStreetDoor();
        // Teleport floors and blockers are gathered when locomotion is applied; refresh them now the street exists.
        if (this.vrHelper) this._applyXRLocomotionMode();
        log.info(`🏙️ Street built: ${meshes.length} meshes`);
    },

    /** Opaque, budgeted, unfrozen. Only the road paint is alpha-tested (it is a cut-out, not a blend). */
    _styleCityMaterials(materials) {
        for (const material of materials) {
            material.maxSimultaneousLights = this.maxLights;
            material.environmentIntensity = 0.35;
            // Lit rooms glow: strong enough to bloom and to read as light, not as painted pictures.
            if (material.name === 'windows') material.emissiveIntensity = 1.7;
            if (material.name === 'decals') {
                material.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
                material.alphaCutOff = 0.5;
            } else {
                material.alpha = 1;
                material.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
                material.needAlphaBlending = () => false;
                material.disableDepthWrite = false;
            }
            if (material.markAsDirty) material.markAsDirty(BABYLON.Material.AllDirtyFlag);
        }
    },

    /**
     * Cool moonlight from the club's side (it lights the far row's faces) plus a hemispheric fill so the near row,
     * which faces the other way, is not a silhouette. Both reach only the city. The values are large because the club's
     * grade (ACES, contrast 1.2, vignette) crushes a dim scene: tuned in the real pipeline, not against a bare viewer.
     */
    _createCityLights(meshes) {
        const moon = this.lightFactory.createDirectionalLight('cityMoon', new BABYLON.Vector3(0.25, -0.55, 0.8), {
            intensity: 5.5, diffuse: [0.55, 0.64, 1.0], specular: [0.3, 0.4, 0.75], group: 'city'
        });
        const fill = this.lightFactory.createHemisphericLight('cityFill', new BABYLON.Vector3(0, 1, 0), {
            intensity: 3.8, diffuse: [0.36, 0.44, 0.78], specular: [0, 0, 0], groundColor: [0.17, 0.12, 0.16], group: 'city'
        });
        for (const light of [moon, fill]) {
            light.renderPriority = 1;
            this._extendAccentLight(light, meshes);
        }
    },

    /** A dark dome with a faint city glow on the horizon and a few stars. It follows the camera. */
    _createCitySky() {
        const width = 1024, height = 512;
        const texture = new BABYLON.DynamicTexture('citySkyTexture', { width, height }, this.scene, false);
        const ctx = texture.getContext();
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        // Symmetric about the horizon, so the sphere's v direction does not matter.
        gradient.addColorStop(0.00, '#03050d');
        gradient.addColorStop(0.30, '#070b1f');
        gradient.addColorStop(0.44, '#1b1634');
        gradient.addColorStop(0.50, '#4a2c44');
        gradient.addColorStop(0.56, '#1b1634');
        gradient.addColorStop(0.70, '#070b1f');
        gradient.addColorStop(1.00, '#03050d');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        let seed = 7;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        for (let i = 0; i < 90; i++) {
            const v = rand();
            if (Math.abs(v - 0.5) < 0.12) continue; // none in the glow
            ctx.fillStyle = `rgba(210,220,255,${(0.25 + rand() * 0.45).toFixed(2)})`;
            ctx.fillRect(Math.floor(rand() * width), Math.floor(v * height), 1, 1);
        }
        texture.update();

        const material = this.materialFactory.createStandardMaterial('citySkyMat', {
            emissiveColor: [0, 0, 0], diffuseColor: [0, 0, 0], disableLighting: true, mutable: true
        });
        material.emissiveTexture = texture;
        material.backFaceCulling = false;
        material.fogEnabled = false;
        material.disableDepthWrite = true;

        // Inside the camera's far plane (100 m), outside every building.
        const dome = BABYLON.MeshBuilder.CreateSphere('citySky', { diameter: 180, segments: 24, sideOrientation: BABYLON.Mesh.BACKSIDE }, this.scene);
        dome.material = material;
        dome.infiniteDistance = true;
        dome.isPickable = false;
        dome.alwaysSelectAsActiveMesh = true;
        dome.parent = this._cityRoot;
        this._citySky = { dome, texture, material };
    },

    /**
     * Distant towers behind the far row and a tall block closing each end of the avenue: one merged mesh, a window
     * grid drawn on a canvas. Unlit, so only fog shades them.
     */
    _createCitySkyline() {
        const size = 512;
        const texture = new BABYLON.DynamicTexture('citySkylineTexture', { width: size, height: size }, this.scene, true);
        const ctx = texture.getContext();
        ctx.fillStyle = '#070a14';
        ctx.fillRect(0, 0, size, size);
        let seed = 11;
        const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        const columns = 16, rows = 12;
        const cellW = size / columns, cellH = size / rows;
        const lit = ['#ffd9a0', '#ffe9c4', '#bcd4ff', '#ffb98a'];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < columns; col++) {
                const roll = rand();
                ctx.fillStyle = roll < 0.34 ? lit[Math.floor(rand() * lit.length)] : (roll < 0.5 ? '#161c30' : '#0b0f1d');
                ctx.fillRect(col * cellW + cellW * 0.22, row * cellH + cellH * 0.2, cellW * 0.56, cellH * 0.58);
            }
        }
        texture.update();
        texture.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

        const material = this.materialFactory.createStandardMaterial('citySkylineMat', {
            emissiveColor: [0, 0, 0], diffuseColor: [0, 0, 0], disableLighting: true, mutable: true
        });
        material.emissiveTexture = texture;
        texture.level = 0.7; // behind the real buildings, not brighter than them
        material.backFaceCulling = true;

        const builder = this._dressingBuilder('city');
        const group = builder.group('Skyline', material);
        const tile = 40; // metres per window texture: 16 columns of 2.5 m windows, 12 floors of 3.3 m
        const uv = mesh => this._applyWorldUVs(mesh, tile, { u: 1, v: 1 });
        const tower = (w, h, d, x, z) => builder.box(group, w, h, d, x, h / 2, z, uv);

        // Towers behind the far row (x -75..75), staggered in depth and height.
        let towerSeed = 3;
        const next = () => { towerSeed = (towerSeed * 16807) % 2147483647; return towerSeed / 2147483647; };
        for (let x = -72; x <= 72; x += 18) {
            const width = 12 + next() * 8;
            tower(width, 44 + next() * 56, 14 + next() * 8, x + (next() - 0.5) * 6, 54 + next() * 26);
        }
        // A second, lower rank filling the gaps closer in (the far row is 28 m at most).
        for (let x = -63; x <= 63; x += 18) {
            tower(10 + next() * 6, 34 + next() * 22, 12, x + (next() - 0.5) * 4, 44 + next() * 6);
        }
        // Tall blocks closing both ends of the avenue.
        for (const sign of [-1, 1]) {
            builder.box(group, 10, 70, 46, sign * (CityLayout.halfLength + 5), 35, 22, uv);
        }
        const built = builder.finish();
        const mesh = built.Skyline;
        if (mesh) {
            // Built in club space and frozen by the builder: re-freeze it once it rides on the raised root.
            mesh.unfreezeWorldMatrix();
            mesh.parent = this._cityRoot;
            mesh.computeWorldMatrix(true);
            mesh.freezeWorldMatrix();
            mesh.alwaysSelectAsActiveMesh = true; // one big mesh: its bounds always intersect the street's view anyway
        }
        this._citySkyline = { mesh, texture, material };
    },

    /** The glTF node a mesh came from: `far3_primitive2` -> `far3`. */
    _cityNodeName(mesh) {
        return mesh.name.replace(/_primitive\d+$/, '');
    },

    /** Invisible blockers: one box per building, and a fence across each end of the avenue. */
    _createCityColliders(meshes) {
        const colliders = [];
        const box = (name, minX, maxX, minY, maxY, minZ, maxZ) => {
            const mesh = this._collisionBlock(name, maxX - minX, maxY - minY, maxZ - minZ,
                (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
            colliders.push(mesh);
        };
        // A building's primitives share one footprint: take the union of their world bounds.
        const footprints = new Map();
        for (const mesh of meshes) {
            const node = this._cityNodeName(mesh);
            if (node === 'street') continue;
            const bounds = mesh.getBoundingInfo().boundingBox;
            const lo = bounds.minimumWorld, hi = bounds.maximumWorld;
            const known = footprints.get(node);
            if (!known) footprints.set(node, { lo: lo.clone(), hi: hi.clone() });
            else {
                known.lo.minimizeInPlace(lo);
                known.hi.maximizeInPlace(hi);
            }
        }
        for (const [node, { lo, hi }] of footprints) {
            box(`cityCollider_${node}`, lo.x, hi.x, lo.y, Math.max(hi.y, lo.y + 6), lo.z, hi.z);
        }
        const [z0, z1] = CityLayout.fenceZ;
        for (const sign of [-1, 1]) {
            box(`cityFence_${sign}`, sign * CityLayout.fenceX - 0.5, sign * CityLayout.fenceX + 0.5, CityLayout.groundY, CityLayout.groundY + 6, z0, z1);
        }
        this._cityColliders = colliders;
    },

    /** The street is there: take the glass leaves off the vestibule door and let people through. */
    _openStreetDoor() {
        const door = this._streetDoor;
        if (!door) return;
        for (const mesh of door.meshes) if (mesh) mesh.setEnabled(false);
        if (door.block) { door.block.checkCollisions = false; door.block.dispose(); }
        door.block = null;
        door.open = true;
    },

    /**
     * Per frame: ease the guest's "outdoors" amount (fog and sky key off it) and show the street only while the guest
     * is near the entrance. The street costs nothing while it is hidden.
     */
    updateCityDistrict(dt) {
        const root = this._cityRoot;
        if (!root) return;
        const camera = this._playerCamera();
        const pos = camera && (camera.globalPosition || camera.position);
        if (!pos) return;

        const target = CityLayout.exteriorAmount(pos.x, pos.z);
        const k = 1 - Math.exp(-(dt > 0 ? dt : 1 / 60) / 0.4);
        this._exterior = (this._exterior || 0) + (target - (this._exterior || 0)) * k;

        if (this._cityWarm) return;
        const visible = this._cityVisible ? pos.z > CityLayout.hideBelowZ : pos.z > CityLayout.showFromZ;
        if (visible !== this._cityVisible) {
            this._cityVisible = visible;
            root.setEnabled(visible);
        }
    },

    _disposeCityDistrict() {
        for (const mesh of this._cityColliders || []) { try { mesh.dispose(); } catch (_) { /* ignore */ } }
        this._cityColliders = null;
        for (const part of [this._citySky, this._citySkyline]) {
            if (!part) continue;
            for (const key of ['mesh', 'dome']) if (part[key]) { try { part[key].dispose(); } catch (_) { /* ignore */ } }
            if (part.texture) { try { part.texture.dispose(); } catch (_) { /* ignore */ } }
        }
        this._citySky = this._citySkyline = null;
        if (this._cityContainer) {
            try { this._cityContainer.removeAllFromScene(); } catch (_) { /* ignore */ }
            try { this._cityContainer.dispose(); } catch (_) { /* ignore */ }
            this._cityContainer = null;
        }
        if (this._cityRoot) { try { this._cityRoot.dispose(); } catch (_) { /* ignore */ } this._cityRoot = null; }
        this._cityMeshes = this._cityGround = null;
    }
};
window.CityDistrict = CityDistrict;
