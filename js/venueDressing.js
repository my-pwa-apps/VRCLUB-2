'use strict';
// Venue dressing: the entrance vestibule and the bar. Mixed into VRClub.prototype by club_hyperrealistic.js,
// so `this` is the club. Nothing here runs per frame.
//
// Everything is static and merged by material: each group below is one draw call. Lighting is emissive strips
// plus two scoped point lights (one for the vestibule, one for the bar) that reach only their own meshes and
// take the first material slot through `renderPriority`, exactly like the DJ console and PA accents, so no
// light budget changes. Wood is Poly Haven "Dark Wood" (CC0); the stools are Poly Haven "Metal Stool 03" (CC0);
// the bottles are procedural (js/barProps.js); the bartender is the Quaternius female guest (createDancingNPCs).

const VENUE_BAR = {
    // The counter faces the dance floor along the right wall; the bartender works the gap behind it.
    counter: { xFront: 9.7, xBack: 10.5, z0: -13.6, z1: -6.2, top: 1.1 },
    backBar: { xFront: 11.55, xWall: 12.25, z0: -13.8, z1: -6.0, shelves: [1.42, 1.86, 2.30] },
    stoolX: 9.2,
    stoolZ: [-12.9, -11.6, -10.3, -9.0, -7.7],
    bartender: { x: 11.0, z: -9.9 }
};

const VENUE_VESTIBULE = {
    halfWidth: 3.85,
    wallZ: 0.25,     // outer face of the front wall
    farZ: 6.0,       // inner face of the street wall
    height: 3.7,
    doorHalfWidth: 1.66, // the street door's opening, outer edge of its frame
    doorHeight: 3.06
};

const VenueDressing = {
    /** One mesh builder: boxes and cylinders collected per material, merged into one draw each. */
    _dressingBuilder(prefix) {
        const scene = this.scene;
        const groups = new Map();
        const group = (key, material) => {
            if (!groups.has(key)) groups.set(key, { key: `${prefix}${key}`, material, meshes: [] });
            return groups.get(key);
        };
        return {
            box(g, w, h, d, x, y, z, prepare) {
                const mesh = BABYLON.MeshBuilder.CreateBox(`${g.key}_part`, { width: w, height: h, depth: d }, scene);
                if (prepare) prepare(mesh);
                mesh.position.set(x, y, z);
                g.meshes.push(mesh);
                return mesh;
            },
            // axis 'z' lays the cylinder along z (a rail), 'x' along x; anything else leaves it upright.
            cylinder(g, diameter, length, x, y, z, axis = 'y', tessellation = 12) {
                const mesh = BABYLON.MeshBuilder.CreateCylinder(`${g.key}_part`, { diameter, height: length, tessellation }, scene);
                if (axis === 'z') mesh.rotation.x = Math.PI / 2;
                if (axis === 'x') mesh.rotation.z = Math.PI / 2;
                mesh.position.set(x, y, z);
                g.meshes.push(mesh);
                return mesh;
            },
            add(g, mesh) { g.meshes.push(mesh); return mesh; },
            group,
            /** Merge every group and return the merged meshes by key. */
            finish({ collide = [] } = {}) {
                const out = {};
                for (const g of groups.values()) {
                    if (g.meshes.length === 0) continue;
                    const merged = g.meshes.length === 1 && !g.meshes[0].parent
                        ? g.meshes[0]
                        : BABYLON.Mesh.MergeMeshes(g.meshes, true, true, undefined, false, false);
                    if (!merged) continue;
                    merged.name = g.key;
                    merged.material = g.material;
                    merged.isPickable = false;
                    merged.receiveShadows = false;
                    merged.checkCollisions = collide.includes(g.key.slice(prefix.length));
                    merged.freezeWorldMatrix();
                    merged.doNotSyncBoundingInfo = true;
                    out[g.key.slice(prefix.length)] = merged;
                }
                return out;
            }
        };
    },

    /** The dark-wood surface: Poly Haven maps when they loaded, a plain dark finish when they did not. */
    _barWoodMaterial() {
        const mat = this.materialFactory.createPBRMaterial('barWoodMat', {
            baseColor: [1, 1, 1], metallic: 1, roughness: 1, mutable: true
        });
        const textures = this.concreteTextures && this.concreteTextures.barWood;
        if (textures && this.textureLoader) {
            this.textureLoader.applyTexturesToMaterial(mat, textures);
            // Metallic comes from the packed map's blue channel, which is ~0 for wood; the scalars only
            // scale the map, so the finish stays what Poly Haven authored.
        } else {
            mat.baseColor = new BABYLON.Color3(0.09, 0.055, 0.035);
            mat.metallic = 0.05;
            mat.roughness = 0.45;
        }
        return mat;
    },

    _emissive(name, color) {
        return this.materialFactory.createStandardMaterial(name, {
            emissiveColor: color, diffuseColor: [0, 0, 0], disableLighting: true
        });
    },

    /** A point light that touches only `meshes` and takes their first material slot. */
    _createScopedAccent(name, position, { intensity, range, diffuse, group }, meshes) {
        const light = this.lightFactory.createPointLight(name, position, { intensity, range, diffuse, group });
        light.renderPriority = 1;
        this._extendAccentLight(light, meshes);
        return light;
    },

    /** Add meshes to a scoped accent light (priority sorts scene.lights, not cached per-mesh light lists). */
    _extendAccentLight(light, meshes) {
        if (!light || !meshes || meshes.length === 0) return;
        const current = light.includedOnlyMeshes ? light.includedOnlyMeshes.slice() : [];
        light.includedOnlyMeshes = current.concat(meshes.filter(mesh => !current.includes(mesh)));
        meshes.forEach(mesh => mesh._resyncLightSources && mesh._resyncLightSources());
    },

    /** Solid blocks for the bass bins hung under the PA, so a desktop camera that flies up cannot pass through them. */
    _blockBassBins() {
        const models = this.modelLoader && this.modelLoader.loadedModels;
        if (!models) return;
        for (const key of ['bass_bin_left', 'bass_bin_right']) {
            const record = models[key];
            if (!record || !record.placed) continue;
            const { min, max, center } = record.placed;
            this._collisionBlock(`${key}Block`, max.x - min.x, max.y - min.y, max.z - min.z, center.x, center.y, center.z);
        }
    },
    _collisionBlock(name, w, h, d, x, y, z) {
        const block = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        block.position.set(x, y, z);
        block.isVisible = false;
        block.isPickable = false;
        block.checkCollisions = true;
        block.freezeWorldMatrix();
        block.doNotSyncBoundingInfo = true;
        return block;
    },

    // ------------------------------------------------------------------------------------------
    // ENTRANCE: a door in the front wall, a short lit vestibule with a red carpet, a queue rope line,
    // a ticket desk, a coat check and the street door at the far end.
    // ------------------------------------------------------------------------------------------
    createEntranceArea() {
        log.info('🚪 Creating entrance vestibule...');
        const { halfWidth: VW, wallZ: ZN, farZ: ZF, height: H } = VENUE_VESTIBULE;
        const factory = this.materialFactory;
        const b = this._dressingBuilder('vestibule');
        const length = ZF + 0.3 - ZN;
        const midZ = ZN + length / 2;

        const wallMat = factory.getPreset('wall');
        const wallScale = this.textureLoader && this.textureLoader.textureConfigs.walls.scale || { u: 1, v: 1 };
        const ceilingScale = this.textureLoader && this.textureLoader.textureConfigs.ceiling.scale || { u: 1, v: 1 };
        const brick = mesh => this._applyWorldUVs(mesh, 1.5, wallScale);
        const walls = b.group('Walls', wallMat);
        b.box(walls, 0.3, H, length, -(VW + 0.15), H / 2, midZ, brick);
        b.box(walls, 0.3, H, length, VW + 0.15, H / 2, midZ, brick);
        // The street wall has a doorway (the width of the street door's frame) so the club has a way out to the
        // city: a pier either side and a lintel over the top.
        const { doorHalfWidth: DW, doorHeight: DH } = VENUE_VESTIBULE;
        const pier = VW + 0.3 - DW;
        b.box(walls, pier, H, 0.3, -(DW + pier / 2), H / 2, ZF + 0.15, brick);
        b.box(walls, pier, H, 0.3, DW + pier / 2, H / 2, ZF + 0.15, brick);
        b.box(walls, 2 * DW, H - DH, 0.3, 0, DH + (H - DH) / 2, ZF + 0.15, brick);

        const ceiling = b.group('Ceiling', factory.getPreset('ceiling'));
        b.box(ceiling, 2 * (VW + 0.3), 0.12, length, 0, H + 0.06, midZ, mesh => this._applyWorldUVs(mesh, 3, ceilingScale));

        const floorMat = factory.createPBRMaterial('vestibuleFloorMat', {
            baseColor: [0.035, 0.035, 0.04], metallic: 0.15, roughness: 0.35, mutable: true
        });
        b.box(b.group('Floor', floorMat), 2 * VW, 0.02, ZF - ZN, 0, 0.01, ZN + (ZF - ZN) / 2);

        // The red carpet runs from the street door, through the doorway and into the club.
        const carpetMat = factory.createPBRMaterial('entranceCarpetMat', {
            baseColor: [0.42, 0.025, 0.045], metallic: 0, roughness: 0.95, mutable: true
        });
        b.box(b.group('Carpet', carpetMat), 2.2, 0.02, ZF - 0.1 + 3.6, 0, 0.03, (ZF - 0.1 - 3.6) / 2);

        // Door frame in the front wall; both leaves stand open against the club side.
        const steelMat = factory.createPBRMaterial('entranceArchMat', {
            baseColor: [0.02, 0.02, 0.02], metallic: 0.95, roughness: 0.2
        }, true);
        const frame = b.group('Frame', steelMat);
        b.box(frame, 0.14, 3.4, 0.56, -1.93, 1.7, 0);
        b.box(frame, 0.14, 3.4, 0.56, 1.93, 1.7, 0);
        b.box(frame, 4.0, 0.14, 0.56, 0, 3.33, 0);
        b.box(frame, 0.07, 3.2, 0.95, -1.82, 1.62, -0.725);
        b.box(frame, 0.07, 3.2, 0.95, 1.82, 1.62, -0.725);
        // Street door at the far end: a black frame around the opening. Two lit glass leaves close it until the street
        // outside has loaded (see CityDistrict._openStreetDoor); without the street there is nothing to walk out to.
        b.box(frame, 0.12, 3.0, 0.1, -1.6, 1.5, ZF - 0.05);
        b.box(frame, 0.12, 3.0, 0.1, 1.6, 1.5, ZF - 0.05);
        b.box(frame, 3.32, 0.12, 0.1, 0, 3.0, ZF - 0.05);
        const street = b.group('StreetGlass', this._emissive('vestibuleStreetMat', [0.2, 0.3, 0.55]));
        b.box(street, 1.5, 2.88, 0.02, -0.78, 1.44, ZF - 0.02);
        b.box(street, 1.5, 2.88, 0.02, 0.78, 1.44, ZF - 0.02);
        const doorMullion = b.group('StreetDoorMullion', steelMat);
        b.box(doorMullion, 0.06, 3.0, 0.1, 0, 1.5, ZF - 0.05);

        const brass = factory.getPreset('stanchionPost');
        const metal = b.group('Brass', brass);
        // Push bars on the street door's leaves.
        const doorBars = b.group('StreetDoorBars', brass);
        b.cylinder(doorBars, 0.035, 1.0, -0.8, 1.05, ZF - 0.14, 'x');
        b.cylinder(doorBars, 0.035, 1.0, 0.8, 1.05, ZF - 0.14, 'x');
        // Queue rope line along the carpet: brass posts, weighted bases, velvet rope.
        const baseMat = factory.getPreset('stanchionBase');
        const ropeMat = factory.getPreset('velvetRope');
        const bases = b.group('PostBases', baseMat);
        const ropes = b.group('Ropes', ropeMat);
        const postZ = [1.2, 2.6, 4.0, 5.4];
        for (const x of [-1.45, 1.45]) {
            postZ.forEach((z, i) => {
                b.cylinder(bases, 0.4, 0.08, x, 0.04, z, 'y', 20);
                b.cylinder(metal, 0.05, 1.0, x, 0.58, z, 'y', 14);
                b.add(metal, BABYLON.MeshBuilder.CreateSphere('vestibuleKnob', { diameter: 0.12, segments: 10 }, this.scene))
                    .position.set(x, 1.14, z);
                if (i > 0) {
                    const span = z - postZ[i - 1];
                    const mid = (z + postZ[i - 1]) / 2;
                    b.cylinder(ropes, 0.045, span, x, 0.95, mid, 'z');
                    b.cylinder(ropes, 0.048, span * 0.3, x, 0.92, mid, 'z', 10);
                }
            });
        }

        // Ticket desk (left) and coat check (right), both against the walls.
        const wood = this._barWoodMaterial();
        const joinery = b.group('Joinery', wood);
        const joinerySize = (mesh) => this._applyWorldUVs(mesh, 1, { u: 1, v: 1 });
        b.box(joinery, 0.7, 1.0, 1.9, -(VW - 0.35), 0.5, 2.1, joinerySize);
        b.box(joinery, 0.95, 0.05, 2.0, -(VW - 0.47), 1.025, 2.1, joinerySize);
        b.box(joinery, 0.7, 1.0, 1.9, VW - 0.35, 0.5, 2.1, joinerySize);
        b.box(joinery, 0.95, 0.05, 2.0, VW - 0.47, 1.025, 2.1, joinerySize);
        const screens = b.group('DeskScreens', this._emissive('vestibuleScreenMat', [0.45, 0.75, 1.0]));
        const screen = b.box(screens, 0.34, 0.24, 0.02, -(VW - 0.5), 1.2, 2.1);
        screen.rotation.y = Math.PI / 2;
        screen.rotation.z = 0.28;
        // Coat rail with a row of coats.
        b.cylinder(metal, 0.03, 1.9, VW - 0.25, 1.95, 4.15, 'z');
        const coatMat = factory.createPBRMaterial('coatMat', {
            baseColor: [0.045, 0.045, 0.055], metallic: 0, roughness: 0.92
        }, true);
        const coats = b.group('Coats', coatMat);
        for (let i = 0; i < 7; i++) {
            b.box(coats, 0.08, 1.15 - (i % 3) * 0.06, 0.22, VW - 0.25, 1.35, 3.3 + i * 0.28);
        }

        // Light: warm sconces on both walls, magenta and cyan coves under the soffit, door-threshold strips.
        const warm = b.group('Sconces', this._emissive('vestibuleWarmMat', [1.0, 0.62, 0.26]));
        for (const x of [-(VW - 0.02), VW - 0.02]) {
            for (const z of [1.5, 3.0, 4.5]) b.box(warm, 0.03, 0.8, 0.07, x, 2.1, z);
        }
        const magenta = b.group('CoveMagenta', this._emissive('vestibuleMagentaMat', [1.0, 0.1, 0.55]));
        const cyan = b.group('CoveCyan', this._emissive('vestibuleCyanMat', [0.1, 0.7, 1.0]));
        b.box(magenta, 0.05, 0.04, ZF - ZN - 0.2, -(VW - 0.03), H - 0.1, ZN + (ZF - ZN) / 2);
        b.box(cyan, 0.05, 0.04, ZF - ZN - 0.2, VW - 0.03, H - 0.1, ZN + (ZF - ZN) / 2);
        b.box(cyan, 3.8, 0.015, 0.08, 0, 0.045, 0.45);
        b.box(magenta, 3.8, 0.015, 0.08, 0, 0.045, -0.7);

        const built = b.finish({ collide: ['Walls', 'Ceiling', 'Frame', 'Joinery'] });
        const scoped = Object.values(built);
        // The front wall's vestibule-side faces take the same light; their club sides face away from it.
        ['frontWall', 'frontWallRight', 'frontWallLintel'].forEach(name => {
            const wall = this.scene.getMeshByName(name);
            if (wall) scoped.push(wall);
        });
        this._entranceLight = this._createScopedAccent('entranceLight', new BABYLON.Vector3(0, 3.0, 3.1),
            { intensity: 1.3, range: 7.5, diffuse: [1, 0.86, 0.7], group: 'entrance' }, scoped);

        // The street door is shut (glass leaves plus an invisible block) until the street outside has loaded.
        // The vestibule's own walls, ceiling and this block seal the club in the meantime.
        this._vestibuleFloor = built.Floor || null;
        this._streetDoor = {
            open: false,
            meshes: [built.StreetGlass, built.StreetDoorMullion, built.StreetDoorBars],
            block: this._collisionBlock('streetDoorBlock', 2 * DW, 3.4, 0.5, 0, 1.7, ZF + 0.15)
        };
        if (this._cityRoot) this._openStreetDoor(); // the street finished loading before the vestibule was built
        log.info('✅ Entrance vestibule created');
    },

    // ------------------------------------------------------------------------------------------
    // BAR: counter, back bar with backlit shelves, a stocked bottle set, pendant lamps, stools.
    // ------------------------------------------------------------------------------------------
    createBar() {
        log.info('🍹 Creating bar...');
        const { counter: C, backBar: K } = VENUE_BAR;
        const factory = this.materialFactory;
        const b = this._dressingBuilder('bar');
        const wood = this._barWoodMaterial();
        const woodUV = mesh => this._applyWorldUVs(mesh, 1, { u: 1, v: 1 });
        const joinery = b.group('Joinery', wood);
        const lengthZ = C.z1 - C.z0;
        const midZ = (C.z0 + C.z1) / 2;

        // Counter: slab with an overhang, a fluted front panel over a plinth, a closed service side.
        b.box(joinery, C.xBack - C.xFront + 0.08, 0.06, lengthZ, (C.xFront - 0.08 + C.xBack) / 2, C.top - 0.03, midZ, woodUV);
        b.box(joinery, 0.08, 0.98, lengthZ, C.xFront + 0.04, 0.57, midZ, woodUV);
        b.box(joinery, 0.1, 0.08, lengthZ, C.xFront + 0.05, 0.04, midZ, woodUV);
        b.box(joinery, 0.08, 1.0, lengthZ, C.xBack - 0.04, 0.5, midZ, woodUV);
        b.box(joinery, C.xBack - C.xFront, 1.0, 0.08, (C.xFront + C.xBack) / 2, 0.5, C.z1 - 0.04, woodUV);
        for (let z = C.z0 + 0.15; z < C.z1 - 0.1; z += 0.3) {
            b.box(joinery, 0.04, 0.9, 0.07, C.xFront - 0.01, 0.55, z, woodUV);
        }

        // Back bar: cabinet, worktop, shelf boards and uprights, cornice.
        const bayMid = (K.z0 + K.z1) / 2, bayLength = K.z1 - K.z0;
        b.box(joinery, K.xWall - K.xFront, 0.92, bayLength, (K.xFront + K.xWall) / 2, 0.46, bayMid, woodUV);
        b.box(joinery, K.xWall - K.xFront + 0.05, 0.04, bayLength, (K.xFront - 0.05 + K.xWall) / 2, 0.94, bayMid, woodUV);
        for (let z = K.z0 + 0.6; z < K.z1 - 0.3; z += 0.65) b.box(joinery, 0.02, 0.84, 0.03, K.xFront - 0.005, 0.46, z, woodUV);
        const shelfX0 = K.xWall - 0.32;
        for (const y of K.shelves) {
            b.box(joinery, 0.3, 0.035, bayLength - 0.2, shelfX0 + 0.15, y, bayMid, woodUV);
        }
        for (const z of [K.z0 + 0.1, (K.z0 + K.z1) / 2, K.z1 - 0.1]) {
            b.box(joinery, 0.3, 1.8, 0.035, shelfX0 + 0.15, 1.85, z, woodUV);
        }
        b.box(joinery, 0.42, 0.26, bayLength, K.xWall - 0.21, 2.82, bayMid, woodUV);

        // Footrail and its brackets.
        const brass = b.group('Brass', factory.getPreset('stanchionPost'));
        b.cylinder(brass, 0.055, lengthZ - 0.3, C.xFront - 0.22, 0.22, midZ, 'z', 14);
        for (let z = C.z0 + 0.6; z < C.z1; z += 1.8) b.cylinder(brass, 0.025, 0.22, C.xFront - 0.11, 0.22, z, 'x', 8);
        b.box(brass, 0.02, 0.02, lengthZ - 0.2, C.xFront - 0.085, C.top - 0.01, midZ);

        // Light: warm strips under each shelf and the cornice, a pink strip under the counter lip, cyan toe light.
        const warm = b.group('GlowWarm', this._emissive('barWarmMat', [1.0, 0.7, 0.36]));
        for (const y of K.shelves) b.box(warm, 0.02, 0.018, bayLength - 0.3, shelfX0 + 0.012, y - 0.03, bayMid);
        b.box(warm, 0.02, 0.018, bayLength - 0.3, K.xWall - 0.40, 2.68, bayMid);
        const pink = b.group('GlowPink', this._emissive('barPinkMat', [1.0, 0.18, 0.5]));
        b.box(pink, 0.03, 0.014, lengthZ - 0.2, C.xFront - 0.06, C.top - 0.07, midZ);
        const cyan = b.group('GlowCyan', this._emissive('barCyanMat', [0.1, 0.6, 1.0]));
        b.box(cyan, 0.03, 0.014, lengthZ - 0.2, C.xFront - 0.02, 0.1, midZ);

        // Backlit amber panel behind the bottles: dark at the edges, bright at the middle of each bay.
        const glowTexture = new BABYLON.DynamicTexture('barBacklight', { width: 4, height: 128 }, this.scene, false);
        const gctx = glowTexture.getContext();
        const gradient = gctx.createLinearGradient(0, 0, 0, 128);
        for (const [stop, level] of [[0, 0.25], [0.35, 0.95], [0.7, 0.9], [1, 0.4]]) gradient.addColorStop(stop, `rgb(${Math.round(255 * level)},${Math.round(150 * level)},${Math.round(45 * level)})`);
        gctx.fillStyle = gradient;
        gctx.fillRect(0, 0, 4, 128);
        glowTexture.update();
        const panelMat = this.materialFactory.createStandardMaterial('barBacklightMat', {
            emissiveTexture: glowTexture, diffuseColor: [0, 0, 0], disableLighting: true
        });
        const panel = BABYLON.MeshBuilder.CreateBox('barBacklight', { width: 0.02, height: 1.74, depth: bayLength - 0.2 }, this.scene);
        panel.position.set(K.xWall - 0.01, 1.84, bayMid);
        panel.material = panelMat;
        panel.isPickable = false;
        panel.freezeWorldMatrix();
        panel.doNotSyncBoundingInfo = true;

        // Pendant lamps over the counter: black shade, warm bulb, a long cable to the roof.
        const shadeMat = factory.createPBRMaterial('barShadeMat', { baseColor: [0.03, 0.03, 0.035], metallic: 0.8, roughness: 0.35 }, true);
        const shades = b.group('Shades', shadeMat);
        const cables = b.group('Cables', shadeMat);
        const bulbs = b.group('Bulbs', this._emissive('barBulbMat', [1.0, 0.82, 0.5]));
        for (const z of [-12.2, -10.6, -9.0, -7.4]) {
            const x = (C.xFront + C.xBack) / 2;
            const shade = BABYLON.MeshBuilder.CreateCylinder('barShade_part', { diameterTop: 0.1, diameterBottom: 0.38, height: 0.22, tessellation: 18 }, this.scene);
            shade.position.set(x, 2.45, z);
            b.add(shades, shade);
            const bulb = BABYLON.MeshBuilder.CreateSphere('barBulb_part', { diameter: 0.11, segments: 8 }, this.scene);
            bulb.position.set(x, 2.36, z);
            b.add(bulbs, bulb);
            b.cylinder(cables, 0.012, 7.4, x, 6.25, z, 'y', 6);
        }

        const built = b.finish({ collide: ['Joinery'] });
        const meshes = Object.values(built);
        meshes.push(panel);

        // Bottles: one mesh. Spirits on the shelves by rank, the well on the worktop, beer and champagne on the counter.
        const bottles = this._createBarBottles();
        meshes.push(bottles);

        this._barLight = this._createScopedAccent('barLight', new BABYLON.Vector3(10.5, 2.75, midZ),
            { intensity: 1.6, range: 8.5, diffuse: [1, 0.78, 0.5], group: 'bar' }, meshes);
        this._barMeshes = meshes;

        this.modelLoadPromise.then(() => { if (!this._disposed) this._furnishBarStools(); });
        log.info('🍹 Bar created');
    },

    _createBarBottles() {
        const { backBar: K, counter: C } = VENUE_BAR;
        const face = -Math.PI / 2; // bottle fronts look toward -x, at the room
        const shelfX = K.xWall - 0.19;
        const shelves = [
            ['curacao', 'aperitivo', 'bitter', 'tequila', 'lager', 'wine'],
            ['whisky', 'bourbon', 'rum', 'gin', 'whisky', 'bourbon'],
            ['vodka', 'gin', 'champagne', 'vodka', 'champagne', 'rum']
        ];
        const placements = [];
        const uprights = [K.z0 + 0.1, (K.z0 + K.z1) / 2, K.z1 - 0.1].map(z => ({ z, half: 0.0175 + 0.012 }));
        K.shelves.forEach((y, i) => {
            placements.push(...window.BarProps.stockShelf({
                x: shelfX, y: y + 0.0175, z0: K.z0 + 0.25, z1: K.z1 - 0.25, styles: shelves[i], yaw: face, seed: 7 + i * 13, avoid: uprights
            }));
        });
        // The speed rail on the worktop: the bottles a bartender reaches for without turning.
        ['vodka', 'gin', 'rum', 'whisky', 'tequila', 'bourbon'].forEach((style, i) => {
            placements.push({ style, x: K.xFront + 0.18, y: 0.96, z: -12.4 + i * 0.55, yaw: face, scale: 1 });
        });
        // Customers' side of the counter.
        [['lager', -11.2], ['lager', -11.05], ['wine', -9.4], ['champagne', -8.2]].forEach(([style, z], i) => {
            placements.push({ style, x: C.xFront + 0.28 + (i % 2) * 0.05, y: C.top, z, yaw: Math.PI / 2 + i * 0.7, scale: 1 });
        });

        const data = window.BarProps.mergePlacements(placements);
        const mesh = new BABYLON.Mesh('barBottles', this.scene);
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = data.positions;
        vertexData.normals = data.normals;
        vertexData.uvs = data.uvs;
        vertexData.colors = data.colors;
        vertexData.indices = data.indices;
        vertexData.applyToMesh(mesh);

        const size = window.BarProps.ATLAS;
        const albedo = new BABYLON.DynamicTexture('barBottleAtlas', { width: size, height: size }, this.scene, true);
        const orm = new BABYLON.DynamicTexture('barBottleOrm', { width: size, height: size }, this.scene, true);
        window.BarProps.paintAtlas(albedo.getContext(), orm.getContext());
        albedo.update();
        orm.update();
        orm.gammaSpace = false;
        albedo.anisotropicFilteringLevel = this.tierSettings ? this.tierSettings.anisotropy : 4;

        const mat = this.materialFactory.createPBRMaterial('barBottleMat', {
            baseColor: [1, 1, 1], metallic: 1, roughness: 1, mutable: true
        });
        mat.baseTexture = albedo;
        mat.metallicRoughnessTexture = orm;
        mat.occlusionTexture = orm;
        mat._useAmbientInGrayScale = true;
        // Backlit shelves keep the glass readable even when the show is dark.
        mat.emissiveColor = new BABYLON.Color3(0.05, 0.045, 0.04);
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
        mesh.bottleCount = placements.length;
        return mesh;
    },

    /** Stand the Poly Haven stool at every seat along the counter (the first is placed by ModelLoader). */
    _furnishBarStools() {
        const record = this.modelLoader && this.modelLoader.loadedModels && this.modelLoader.loadedModels.bar_stool;
        if (!record || !record.rootMesh) return;
        const { container, rootMesh } = record;
        const meshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        const home = VENUE_BAR.stoolZ[0];
        const placed = [...meshes];
        VENUE_BAR.stoolZ.forEach((z, index) => {
            if (index > 0) {
                const entry = container.instantiateModelsToScene(name => `barStool${index}_${name}`, false, { doNotInstantiate: false });
                const root = entry.rootNodes[0];
                if (!root) return;
                root.position.x = rootMesh.position.x;
                root.position.z = rootMesh.position.z + (z - home);
                root.rotation.y = rootMesh.rotation.y + ((index * 37) % 11 - 5) * 0.05;
                root.computeWorldMatrix(true);
                root.getChildMeshes().forEach(mesh => { mesh.isPickable = false; placed.push(mesh); });
            }
            this._collisionBlock(`barStoolBlock${index}`, 0.46, 1.1, 0.46, VENUE_BAR.stoolX, 0.55, z);
        });
        placed.forEach(mesh => { mesh.isPickable = false; });
        // ModelLoader gives every import a 0.12 emissive floor and 0.2 ambient; on dark rusted steel that reads
        // as pale grey paint, so the stool keeps only a small floor against show blackouts.
        const stoolMaterial = meshes[0] && meshes[0].material;
        if (stoolMaterial) {
            if (stoolMaterial.emissiveColor) stoolMaterial.emissiveColor.set(0.025, 0.025, 0.03);
            if (stoolMaterial.ambientColor) stoolMaterial.ambientColor.set(0.04, 0.04, 0.04);
        }
        this._extendAccentLight(this._barLight, placed);
        this._barStools = placed;
    }
};
window.VenueLayout = { bar: VENUE_BAR, vestibule: VENUE_VESTIBULE };
window.VenueDressing = VenueDressing;
