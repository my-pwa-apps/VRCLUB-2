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
    bartender: { x: 10.85, z: -9.9 },
    /**
     * 0..1 when the ear is in the bar alcove (stools and the gap in front of the counter).
     * A partial shelf, not a wall: the back bar and bottles take the top end off and add a little room.
     */
    listenerShelf(x, y, z) {
        const c = this.counter;
        const edge = (outer, inner, value) => {
            const t = Math.min(1, Math.max(0, (value - outer) / (inner - outer)));
            return t * t * (3 - 2 * t);
        };
        const inZ = edge(c.z0 - 0.5, c.z0 + 0.4, z) * edge(c.z1 + 0.5, c.z1 - 0.4, z);
        const inX = edge(8.2, 9.4, x) * edge(11.3, 10.2, x);
        const head = edge(0.5, 1.3, y) * edge(2.5, 1.7, y);
        return 0.55 * inZ * inX * head;
    }
};

// A two-seat sofa against the front wall, centred between the entrance and the bar-side wall, facing the DJ (-z).
// `z` is the centre of its 0.9 m depth, `width` runs along x, `seats` are the two cushion centres along x, and
// `seatZ` is where a sitter's head column goes (pelvis on the cushion, 6 cm behind it).
const VENUE_LOUNGE = {
    x: 7.1, z: -0.72, width: 2.1, depth: 0.9, seatY: 0.4, facing: Math.PI,
    seatZ: -0.89, seats: [-0.42, 0.42]
};

// Nearfield DJ booth monitor speakers on the DJ table (y 1.42), either side of the console and behind it (crowd side),
// aimed back at the DJ. The Yamaha HS8 GLB's woofer baffle is local +z and Babylon's glTF root only mirrors X, so
// yaw 0 faces the dance floor (+z): yaw PI faces the DJ (-z), and +-0.6 rad toes each cabinet in toward x = 0.
// A model faces (sin yaw, cos yaw).
const VENUE_MONITORS = {
    tableY: 1.42,
    height: 0.3,
    left: { x: -0.72, z: -18.22, yaw: Math.PI - 0.6 },
    right: { x: 0.72, z: -18.22, yaw: Math.PI + 0.6 }
};

// The club restroom off the front-left corner of the hall (x -12.5..-16.6, z -6.2..-1.2), entered through a 1.8 m
// doorway in the left wall (z -4.1..-2.3). Two toilet stalls along the far wall (-x) and two washbasins with a
// backlit mirror along the inner wall (+x).
const VENUE_RESTROOM = {
    wallX: -12.75,   // inner face of the club's 0.5 m left wall (centred on x -12.5)
    farX: -16.4,     // inner face of the restroom's back wall
    z0: -6.2,        // stage-side inner face
    z1: -1.2,        // entrance-side inner face
    height: 3.2,
    door: { z0: -4.1, z1: -2.3, height: 2.8 },
    stallFrontX: -14.45,
    stallPier: 0.16,
    toiletX: -15.72,
    toiletSeatX: -15.62,
    toiletSeatY: 0.42,
    toiletZ: [-5.4, -2.0],
    // The two 1.28 m cubicle openings in the stall front (z ranges between the piers), and how the doors move:
    // ajar about 57 degrees on the hall side (clear of the basins), shut in doorSeconds while the guest sits.
    stallOpenings: [[-6.04, -4.76], [-2.64, -1.36]],
    doorAjar: 1.0,
    doorSeconds: 0.6,
    // Where the three Poly Haven props stand (a unit test keeps ModelLoader's placements in step with these).
    props: { bin: { x: -13.0, z: -4.8 }, wetSign: { x: -13.95, z: -4.1 }, plunger: { x: -16.1, z: -4.84 } },
    sinkX: -13.10,
    // Both basins stand on bare wall. The club's concrete pillar at z -5.3..-4.7 pokes 5 cm through the wall into the
    // restroom, so the first basin sits in the strip between it and the stage-side wall, and the second in the strip
    // between the doorway frame and the entrance-side wall.
    pillarZ: [-5.3, -4.7],
    sinkZ: [-5.78, -1.72],

    /** Acoustic muffling inside the restroom: 0 in the main hall, easing to 0.42 inside the tiled room. */
    enclosure(x, z) {
        if (x >= -12.1 || z < this.z0 - 0.3 || z > this.z1 + 0.3) return 0;
        const t = Math.min(1, Math.max(0, (-12.1 - x) / 1.5));
        return 0.42 * t * t * (3 - 2 * t);
    }
};

const VENUE_VESTIBULE = {
    halfWidth: 3.85,
    wallZ: 0.25,     // outer face of the front wall
    farZ: 6.0,       // inner face of the street wall
    // The club is a basement. The street, and the vestibule's floor at the street door, stand this far above the
    // dance floor (CityLayout.groundY is the same number; a unit test keeps them equal).
    streetLevel: 2.8,
    height: 3.7,     // headroom over the street-level floor
    doorHalfWidth: 1.66, // the street door's opening, outer edge of its frame
    doorHeight: 3.06,
    // From the street door: a landing, then sixteen risers of 0.175 m and fifteen treads of 0.277 m down to a short
    // landing at the club's front doorway. Either side of the stairwell a gallery at street level carries the ticket
    // desk and the coat check.
    stair: { halfWidth: 1.8, zBottom: 0.85, zTop: 5.0, steps: 16 },
    // The mouth of the room: the dance floor's front edge (ROOM_BOUNDS.z.max; a unit test keeps them equal). From
    // here outward the doorway and then the stair hall progressively shut the PA away.
    roomMouthZ: -5,

    /**
     * How enclosed in the club's room a listener is: 1 on the dance floor, easing to 0 at the top of the stair, where
     * only the street door is left. ONE smooth ramp across the whole walk (floor, doorway, stair), so the muffling
     * lifts gradually as a guest comes down the stair instead of stepping open at a single z. Past the top of the
     * stair CityLayout.exteriorAmount takes over. Pure, so the occlusion, the room's tail and the make-up gain agree.
     */
    enclosure(z) {
        const top = this.stair.zTop;
        if (!(z > this.roomMouthZ)) return 1;
        if (z >= top) return 0;
        const t = (z - this.roomMouthZ) / (top - this.roomMouthZ);
        return 1 - t * t * (3 - 2 * t);
    },

    /**
     * Height of the surface a walker stands on at (x, z) from the club's front wall outward, or null inside the club
     * (where the mezzanine and the floor decide). The stair is solid, so anywhere over it the walker stands on it; the
     * galleries, the landing at the street door and the whole street are at street level.
     */
    walkLevel(x, z) {
        if (z < this.wallZ) return null;
        const S = this.stair, top = this.streetLevel;
        if (Math.abs(x) >= this.halfWidth + 0.05 || z >= this.farZ) return top;   // the street and its doorway
        if (z < S.zBottom) return 0;                                               // the landing at the club's door
        if (Math.abs(x) <= S.halfWidth && z <= S.zTop) {
            return top * (z - S.zBottom) / (S.zTop - S.zBottom);
        }
        return top;                                                                // galleries and the top landing
    }
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

    _seat(label, id, x, z, floorY, seatY, facing, viewX, viewZ) {
        return Object.freeze({ label, id, x, z, floorY, seatY, facing, viewX, viewZ });
    },

    _tagSeatMeshes(meshes, seats) {
        const list = Array.isArray(meshes) ? meshes : [meshes];
        for (const mesh of list) {
            if (!mesh) continue;
            mesh.isPickable = true;
            mesh.metadata = { ...(mesh.metadata || {}), vrclubSeats: seats };
        }
    },

    // ------------------------------------------------------------------------------------------
    // ENTRANCE: the club is a basement. The street door opens onto a landing at street level; a stair goes down
    // between two galleries (ticket desk on the left, coat check on the right) to a short landing at the club's
    // front doorway. A red carpet runs from the street door, down every tread and riser, into the club.
    // ------------------------------------------------------------------------------------------
    createEntranceArea() {
        log.info('🚪 Creating the entrance stair...');
        const V = VENUE_VESTIBULE;
        const { halfWidth: VW, wallZ: ZN, farZ: ZF, streetLevel: S, height: HV, doorHalfWidth: DW, doorHeight: DH } = V;
        const { halfWidth: SW, zBottom: ZB, zTop: ZT, steps } = V.stair;
        const H = S + HV;                       // the ceiling, above the club floor
        const rise = S / steps;
        const tread = (ZT - ZB) / (steps - 1);
        const factory = this.materialFactory;
        const scene = this.scene;
        const b = this._dressingBuilder('vestibule');
        const length = ZF + 0.3 - ZN;
        const midZ = ZN + length / 2;
        const galleryW = VW - SW, galleryD = ZF - ZB;

        const wallMat = factory.getPreset('wall');
        const wallScale = this.textureLoader && this.textureLoader.textureConfigs.walls.scale || { u: 1, v: 1 };
        const ceilingScale = this.textureLoader && this.textureLoader.textureConfigs.ceiling.scale || { u: 1, v: 1 };
        const brick = mesh => this._applyWorldUVs(mesh, 1.5, wallScale);
        const walls = b.group('Walls', wallMat);
        b.box(walls, 0.3, H, length, -(VW + 0.15), H / 2, midZ, brick);
        b.box(walls, 0.3, H, length, VW + 0.15, H / 2, midZ, brick);
        // The street wall: solid below the street, a doorway at street level (the width of the street door's frame),
        // a pier either side and a lintel over the top.
        const pier = VW + 0.3 - DW;
        b.box(walls, pier, H, 0.3, -(DW + pier / 2), H / 2, ZF + 0.15, brick);
        b.box(walls, pier, H, 0.3, DW + pier / 2, H / 2, ZF + 0.15, brick);
        b.box(walls, 2 * DW, S, 0.3, 0, S / 2, ZF + 0.15, brick);
        b.box(walls, 2 * DW, HV - DH, 0.3, 0, S + DH + (HV - DH) / 2, ZF + 0.15, brick);
        // The galleries either side of the stairwell: solid up to the street-level floor. Their inner faces are the
        // stair's side walls.
        for (const side of [-1, 1]) b.box(walls, galleryW, S, galleryD, side * (SW + galleryW / 2), S / 2, ZB + galleryD / 2, brick);

        const ceiling = b.group('Ceiling', factory.getPreset('ceiling'));
        b.box(ceiling, 2 * (VW + 0.3), 0.12, length, 0, H + 0.06, midZ, mesh => this._applyWorldUVs(mesh, 3, ceilingScale));

        // Floors: the landing at the club's doorway, the two galleries, the landing at the street door and the sill
        // under the street door. The street's paving stops at the stairwell (CityLayout.forecourtOpening); these slabs
        // sit 3 cm over it where they overlap, so the two never fight.
        const floorMat = factory.createPBRMaterial('vestibuleFloorMat', {
            baseColor: [0.035, 0.035, 0.04], metallic: 0.15, roughness: 0.35, mutable: true
        });
        const floor = b.group('Floor', floorMat);
        b.box(floor, 2 * VW, 0.02, ZB - ZN, 0, 0.01, ZN + (ZB - ZN) / 2);
        for (const side of [-1, 1]) b.box(floor, galleryW, 0.03, galleryD, side * (SW + galleryW / 2), S + 0.015, ZB + galleryD / 2);
        b.box(floor, 2 * SW, 0.03, ZF - ZT, 0, S + 0.015, ZT + (ZF - ZT) / 2);
        b.box(floor, 2 * DW, 0.03, 0.3, 0, S + 0.015, ZF + 0.15);

        // The stair: solid steps (nothing to walk under) and the mass under the top landing.
        const stoneMat = factory.createPBRMaterial('entranceStairMat', {
            baseColor: [0.055, 0.052, 0.05], metallic: 0.05, roughness: 0.6
        }, true);
        const stair = b.group('Stair', stoneMat);
        for (let i = 1; i < steps; i++) b.box(stair, 2 * SW, i * rise, tread, 0, i * rise / 2, ZB + (i - 0.5) * tread);
        b.box(stair, 2 * SW, S, ZF - ZT, 0, S / 2, ZT + (ZF - ZT) / 2);

        // The red carpet: into the club, across the bottom landing, up every riser and tread, over the top landing.
        const carpetMat = factory.createPBRMaterial('entranceCarpetMat', {
            baseColor: [0.42, 0.025, 0.045], metallic: 0, roughness: 0.95, mutable: true
        });
        const carpet = b.group('Carpet', carpetMat);
        const runner = 2.2;
        b.box(carpet, runner, 0.02, ZB + 3.6, 0, 0.03, (ZB - 3.6) / 2);
        for (let i = 1; i <= steps; i++) {
            const z0 = ZB + (i - 1) * tread;
            b.box(carpet, runner, rise, 0.012, 0, (i - 0.5) * rise, z0 - 0.006);
            if (i < steps) b.box(carpet, runner, 0.012, tread, 0, i * rise + 0.006, z0 + tread / 2);
        }
        b.box(carpet, runner, 0.012, ZF - 0.1 - ZT, 0, S + 0.036, ZT + (ZF - 0.1 - ZT) / 2);

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
        // Street door at the top: a black frame around the opening. Two lit glass leaves close it until the street
        // outside has loaded (see CityDistrict._openStreetDoor); without the street there is nothing to walk out to.
        b.box(frame, 0.12, 3.0, 0.1, -1.6, S + 1.5, ZF - 0.05);
        b.box(frame, 0.12, 3.0, 0.1, 1.6, S + 1.5, ZF - 0.05);
        b.box(frame, 3.32, 0.12, 0.1, 0, S + 3.0, ZF - 0.05);
        const street = b.group('StreetGlass', this._emissive('vestibuleStreetMat', [0.2, 0.3, 0.55]));
        b.box(street, 1.5, 2.88, 0.02, -0.78, S + 1.44, ZF - 0.02);
        b.box(street, 1.5, 2.88, 0.02, 0.78, S + 1.44, ZF - 0.02);
        const doorMullion = b.group('StreetDoorMullion', steelMat);
        b.box(doorMullion, 0.06, 3.0, 0.1, 0, S + 1.5, ZF - 0.05);

        const brass = factory.getPreset('stanchionPost');
        const metal = b.group('Brass', brass);
        // Push bars on the street door's leaves.
        const doorBars = b.group('StreetDoorBars', brass);
        b.cylinder(doorBars, 0.035, 1.0, -0.8, S + 1.05, ZF - 0.14, 'x');
        b.cylinder(doorBars, 0.035, 1.0, 0.8, S + 1.05, ZF - 0.14, 'x');
        // Brass stair rods at the foot of every riser.
        for (let i = 1; i <= steps; i++) b.cylinder(metal, 0.022, runner + 0.08, 0, (i - 1) * rise + 0.02, ZB + (i - 1) * tread - 0.025, 'x', 8);

        // A box from point `a` to point `to` (its long axis is local z, aimed with lookAt).
        const beam = (group, a, to, w, h) => {
            const span = Math.hypot(to[0] - a[0], to[1] - a[1], to[2] - a[2]);
            const mesh = BABYLON.MeshBuilder.CreateBox(`${group.key}_beam`, { width: w, height: h, depth: span }, scene);
            mesh.position.set((a[0] + to[0]) / 2, (a[1] + to[1]) / 2, (a[2] + to[2]) / 2);
            mesh.lookAt(new BABYLON.Vector3(to[0], to[1], to[2]));
            group.meshes.push(mesh);
            return mesh;
        };
        // Handrails on both stair walls, 0.9 m over the nosings, on brackets; railings round the galleries' open edges.
        const rails = b.group('Rails', steelMat);
        const nosing = z => rise + (z - ZB) * (rise / tread);
        for (const side of [-1, 1]) {
            const x = side * (SW - 0.07);
            beam(rails, [x, nosing(ZB) + 0.9 - rise, ZB - 0.3], [x, S + 0.9, ZT + 0.3], 0.05, 0.05);
            for (const z of [ZB + 0.3, ZB + 1.6, ZB + 2.9, ZT - 0.1]) b.box(rails, 0.07, 0.03, 0.03, side * (SW - 0.035), nosing(z) + 0.87, z);
        }
        const RH = 1.08;
        const fence = (from, to) => {
            [RH, RH * 2 / 3, RH / 3].forEach((lift, k) => beam(rails, [from[0], S + lift, from[1]], [to[0], S + lift, to[1]], k === 0 ? 0.06 : 0.03, k === 0 ? 0.05 : 0.03));
            const n = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / 1.0) + 1);
            for (let i = 0; i < n; i++) {
                const t = i / (n - 1);
                b.box(rails, 0.05, RH, 0.05, from[0] + (to[0] - from[0]) * t, S + RH / 2, from[1] + (to[1] - from[1]) * t);
            }
        };
        for (const side of [-1, 1]) {
            const edgeX = side * (SW + 0.04);
            fence([edgeX, ZT], [edgeX, ZB + 0.04]);
            fence([edgeX, ZB + 0.04], [side * (VW - 0.03), ZB + 0.04]);
            // The railings stop a walker (desktop or headset) from stepping off a gallery into the stairwell.
            this._collisionBlock(`vestibuleGalleryRail${side}`, 0.1, 1.1, ZT - ZB, edgeX, S + 0.55, ZB + (ZT - ZB) / 2);
            this._collisionBlock(`vestibuleGalleryFront${side}`, galleryW, 1.1, 0.1, side * (SW + galleryW / 2), S + 0.55, ZB + 0.04);
        }

        // Ticket desk (left gallery) and coat check (right gallery), both against the walls.
        const wood = this._barWoodMaterial();
        const joinery = b.group('Joinery', wood);
        const joinerySize = (mesh) => this._applyWorldUVs(mesh, 1, { u: 1, v: 1 });
        b.box(joinery, 0.7, 1.0, 1.9, -(VW - 0.35), S + 0.5, 2.1, joinerySize);
        b.box(joinery, 0.95, 0.05, 2.0, -(VW - 0.47), S + 1.025, 2.1, joinerySize);
        b.box(joinery, 0.7, 1.0, 1.9, VW - 0.35, S + 0.5, 2.1, joinerySize);
        b.box(joinery, 0.95, 0.05, 2.0, VW - 0.47, S + 1.025, 2.1, joinerySize);
        const screens = b.group('DeskScreens', this._emissive('vestibuleScreenMat', [0.45, 0.75, 1.0]));
        const screen = b.box(screens, 0.34, 0.24, 0.02, -(VW - 0.5), S + 1.2, 2.1);
        screen.rotation.y = Math.PI / 2;
        screen.rotation.z = 0.28;
        // Coat rail. Garments hang from it (shoulders, sleeves, a hem) with a gap and two empty hooks.
        const railX = VW - 0.25, railY = S + 1.95, railZ = 4.15;
        b.cylinder(metal, 0.03, 1.9, railX, railY, railZ, 'z');
        for (const z of [4.18, 4.34]) b.cylinder(metal, 0.012, 0.07, railX, railY - 0.04, z);
        const coatMat = factory.createPBRMaterial('coatMat', {
            baseColor: [0.045, 0.045, 0.055], metallic: 0, roughness: 0.92
        }, true);
        const coats = b.group('Coats', coatMat);
        const coatRun = [
            { z: 3.38, scale: 1.0 }, { z: 3.68, scale: 0.9 }, { z: 3.96, scale: 1.06 },
            { z: 4.62, scale: 0.94 }, { z: 4.9, scale: 1.02 }, { z: 5.16, scale: 0.86 }
        ];
        for (const coat of coatRun) {
            for (const part of coatSilhouetteParts(railX, railY, coat.z, coat.scale)) {
                b.box(coats, part.w, part.h, part.d, part.x, part.y, part.z, part.tilt
                    ? (mesh => { mesh.rotation.x = part.tilt; }) : undefined);
            }
        }

        // Light: warm sconces over the galleries, step lights in the stair walls, magenta and cyan coves under the
        // ceiling, cyan nosings either side of the runner, and the door-threshold strips at the club's doorway.
        const warm = b.group('Sconces', this._emissive('vestibuleWarmMat', [1.0, 0.62, 0.26]));
        for (const x of [-(VW - 0.02), VW - 0.02]) {
            for (const z of [1.5, 3.0, 4.5]) b.box(warm, 0.03, 0.8, 0.07, x, S + 2.1, z);
        }
        for (const side of [-1, 1]) {
            for (let i = 2; i < steps; i += 3) b.box(warm, 0.02, 0.06, 0.16, side * (SW - 0.01), i * rise + 0.3, ZB + (i - 0.5) * tread);
        }
        const magenta = b.group('CoveMagenta', this._emissive('vestibuleMagentaMat', [1.0, 0.1, 0.55]));
        const cyan = b.group('CoveCyan', this._emissive('vestibuleCyanMat', [0.1, 0.7, 1.0]));
        b.box(magenta, 0.05, 0.04, ZF - ZN - 0.2, -(VW - 0.03), H - 0.1, ZN + (ZF - ZN) / 2);
        b.box(cyan, 0.05, 0.04, ZF - ZN - 0.2, VW - 0.03, H - 0.1, ZN + (ZF - ZN) / 2);
        b.box(cyan, 3.8, 0.015, 0.08, 0, 0.045, 0.45);
        b.box(magenta, 3.8, 0.015, 0.08, 0, 0.045, -0.7);
        const stone = SW - runner / 2 - 0.08;
        for (let i = 1; i < steps; i++) {
            for (const side of [-1, 1]) b.box(cyan, stone, 0.008, 0.025, side * (runner / 2 + 0.04 + stone / 2), i * rise + 0.004, ZB + (i - 1) * tread + 0.02);
        }

        const built = b.finish({ collide: ['Walls', 'Ceiling', 'Frame', 'Joinery', 'Stair'] });
        const scoped = Object.values(built);
        // The front wall's vestibule-side faces take the same light; their club sides face away from it.
        ['frontWall', 'frontWallRight', 'frontWallLintel'].forEach(name => {
            const wall = this.scene.getMeshByName(name);
            if (wall) scoped.push(wall);
        });
        this._entranceLight = this._createScopedAccent('entranceLight', new BABYLON.Vector3(0, S + 2.3, 2.8),
            { intensity: 1.6, range: 9.5, diffuse: [1, 0.86, 0.7], group: 'entrance' }, scoped);

        // The floors, and the stair's treads (one mesh), are VR teleport floors. Like the balcony's, the stair is in
        // collision group 2: the desktop camera slides up its risers, the headset follows its height instead.
        this._vestibuleFloor = built.Floor || null;
        this._vestibuleStair = built.Stair || null;
        if (this._vestibuleStair) this._vestibuleStair.collisionGroup = 2;
        // The street door is shut (glass leaves plus an invisible block) until the street outside has loaded.
        // The vestibule's own walls, ceiling and this block seal the club in the meantime.
        this._streetDoor = {
            open: false,
            meshes: [built.StreetGlass, built.StreetDoorMullion, built.StreetDoorBars],
            block: this._collisionBlock('streetDoorBlock', 2 * DW, 3.4, 0.5, 0, S + 1.7, ZF + 0.15)
        };
        if (this._cityRoot) this._openStreetDoor(); // the street finished loading before the vestibule was built
        log.info('✅ Entrance stair created');
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
            let seatMeshes = meshes;
            if (index > 0) {
                const entry = container.instantiateModelsToScene(name => `barStool${index}_${name}`, false, { doNotInstantiate: false });
                const root = entry.rootNodes[0];
                if (!root) return;
                root.position.x = rootMesh.position.x;
                root.position.z = rootMesh.position.z + (z - home);
                root.rotation.y = rootMesh.rotation.y + ((index * 37) % 11 - 5) * 0.05;
                root.computeWorldMatrix(true);
                seatMeshes = root.getChildMeshes();
                seatMeshes.forEach(mesh => placed.push(mesh));
            }
            // f6 is the resident at index 1; the other stools are available to the player.
            if (index !== 1) {
                const seat = this._seat('a bar stool', `bar-${index}`, VENUE_BAR.stoolX, z, 0, 0.76,
                    Math.PI / 2, VENUE_BAR.stoolX - 0.45, z);
                this._tagSeatMeshes(seatMeshes, [seat]);
            } else {
                seatMeshes.forEach(mesh => { mesh.isPickable = false; });
            }
            this._collisionBlock(`barStoolBlock${index}`, 0.46, 1.1, 0.46, VENUE_BAR.stoolX, 0.55, z);
        });
        // ModelLoader gives every import a 0.12 emissive floor and 0.2 ambient; on dark rusted steel that reads
        // as pale grey paint, so the stool keeps only a small floor against show blackouts.
        const stoolMaterial = meshes[0] && meshes[0].material;
        if (stoolMaterial) {
            if (stoolMaterial.emissiveColor) stoolMaterial.emissiveColor.set(0.025, 0.025, 0.03);
            if (stoolMaterial.ambientColor) stoolMaterial.ambientColor.set(0.04, 0.04, 0.04);
        }
        this._extendAccentLight(this._barLight, placed);
        this._barStools = placed;
    },

    createLoungeCouch() {
        this.modelLoadPromise.then(() => { if (!this._disposed) this._furnishLoungeCouch(); });
    },

    _furnishLoungeCouch() {
        const record = this.modelLoader?.loadedModels?.lounge_couch;
        if (!record?.rootMesh || !record.placed) return;
        const L = VENUE_LOUNGE;
        const meshes = record.container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        // The camera stands just in front of the collider (as for the stools), so the desktop collision ellipsoid
        // does not trap a sitter inside the couch.
        const viewZ = L.z - L.depth / 2 - 0.12;
        const seats = L.seats.map((offset, index) => this._seat('the lounge couch', `lounge-${index}`,
            L.x + offset, L.seatZ, 0, L.seatY, L.facing, L.x + offset, viewZ));
        this._tagSeatMeshes(meshes, seats);

        const { min, max, center } = record.placed;
        this._collisionBlock('loungeCouchBlock', max.x - min.x, max.y - min.y, max.z - min.z,
            center.x, center.y, center.z);
        this._loungeCouch = meshes;
        // The couch has no emission (that read as a glowing sofa in a headset), so it needs real light of its own or it is
        // a dark shape against the wall: a warm accent from above and in front that reaches only the couch.
        this._loungeLight = this._createScopedAccent('loungeLight', new BABYLON.Vector3(L.x, 2.3, L.z - 1.8),
            { intensity: 12, range: 7, diffuse: [1, 0.84, 0.7], group: 'lounge' }, meshes);
    },

    // ------------------------------------------------------------------------------------------
    // DJ MONITOR SPEAKERS: nearfield studio monitors on the left and right ends of the DJ table.
    // ------------------------------------------------------------------------------------------
    createDJMonitors() {
        this.modelLoadPromise.then(() => { if (!this._disposed) this._furnishDJMonitors(); });
    },

    _furnishDJMonitors() {
        const record = this.modelLoader?.loadedModels?.dj_monitor;
        if (!record?.rootMesh || !record.placed) return;
        const M = VENUE_MONITORS;
        const { container, rootMesh } = record;
        const leftMeshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
        leftMeshes.forEach(mesh => { mesh.isPickable = false; });

        const entry = container.instantiateModelsToScene(name => `djMonitorRight_${name}`, false, { doNotInstantiate: false });
        const rightRoot = entry.rootNodes[0];
        const rightMeshes = [];
        if (rightRoot) {
            rightRoot.rotationQuaternion = null;
            rightRoot.scaling.copyFrom(rootMesh.scaling);
            rightRoot.rotation.set(0, M.right.yaw, 0);
            rightRoot.position.set(0, 0, 0);
            const world = rightRoot.getHierarchyBoundingVectors(true);
            rightRoot.position.set(
                M.right.x - (world.min.x + world.max.x) / 2,
                M.tableY - world.min.y,
                M.right.z - (world.min.z + world.max.z) / 2
            );
            rightRoot.computeWorldMatrix(true);
            rightRoot.getChildMeshes().forEach(mesh => {
                if (!mesh.getTotalVertices || mesh.getTotalVertices() <= 0) return;
                mesh.isPickable = false;
                rightMeshes.push(mesh);
            });
        }

        const allMeshes = [...leftMeshes, ...rightMeshes];
        const cables = this._createDJMonitorCables();
        if (cables) allMeshes.push(cables);
        const djLight = this.scene && this.scene.getLightByName('djConsoleLight');
        if (djLight) this._extendAccentLight(djLight, allMeshes);
        this._djMonitors = allMeshes.filter(mesh => mesh !== cables);
        this._djMonitorCables = cables;
    },

    /**
     * Two balanced signal cables, one merged mesh: each runs from the rear connector panel of a monitor, down onto the
     * table and across it to the console's rear output jacks. Ends are small plugs. The route is derived from the
     * monitor layout and the console's measured bounds, so it follows either if they move.
     */
    _createDJMonitorCables() {
        if (!this.scene || !BABYLON.Curve3 || !BABYLON.MeshBuilder) return null;
        const M = VENUE_MONITORS;
        const console_ = this.scene.getMeshByName('console_final');
        let bounds = { minY: M.tableY, maxZ: -18.35, halfX: 0.51 };
        if (console_) {
            console_.computeWorldMatrix(true);
            const box = console_.getHierarchyBoundingVectors(true);
            bounds = { minY: box.min.y, maxZ: box.max.z, halfX: Math.min(-box.min.x, box.max.x) };
        }
        const jackY = bounds.minY + 0.07;
        const onTable = M.tableY + 0.008;
        const radius = 0.0055;
        const pieces = [];
        const plug = (name, x, y, z, yaw) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: 0.022, height: 0.022, depth: 0.04 }, this.scene);
            mesh.position.set(x, y, z);
            mesh.rotation.y = yaw;
            return mesh;
        };
        for (const [name, side] of [['Left', M.left], ['Right', M.right]]) {
            const sign = side.x < 0 ? -1 : 1;
            // The monitor faces (sin yaw, cos yaw); its connector panel is on the opposite face.
            const bx = -Math.sin(side.yaw), bz = -Math.cos(side.yaw);
            const reach = M.height * 0.42;
            const rear = { x: side.x + bx * reach, y: M.tableY + M.height * 0.28, z: side.z + bz * reach };
            const jack = { x: sign * Math.min(0.24, bounds.halfX * 0.5), y: jackY, z: bounds.maxZ };
            const points = [
                new BABYLON.Vector3(rear.x, rear.y, rear.z),
                new BABYLON.Vector3(rear.x + bx * 0.05, rear.y - 0.05, rear.z + bz * 0.05),
                new BABYLON.Vector3(rear.x + bx * 0.07 + (jack.x - rear.x) * 0.2, onTable, rear.z + bz * 0.07 + 0.02),
                new BABYLON.Vector3((rear.x + jack.x) / 2, onTable, (rear.z + jack.z + 0.09) / 2),
                new BABYLON.Vector3(jack.x + (rear.x - jack.x) * 0.15, onTable + 0.004, jack.z + 0.09),
                new BABYLON.Vector3(jack.x, jack.y - 0.04, jack.z + 0.07),
                new BABYLON.Vector3(jack.x, jack.y, jack.z + 0.045)
            ];
            const path = BABYLON.Curve3.CreateCatmullRomSpline(points, 8, false).getPoints();
            const tube = BABYLON.MeshBuilder.CreateTube(`djMonitorCable${name}`, { path, radius, tessellation: 6, cap: BABYLON.Mesh.CAP_ALL }, this.scene);
            pieces.push(tube,
                plug(`djMonitorPlugRear${name}`, rear.x, rear.y, rear.z, Math.atan2(bx, bz)),
                plug(`djMonitorPlugJack${name}`, jack.x, jack.y, jack.z + 0.03, 0));
        }
        const merged = BABYLON.Mesh.MergeMeshes(pieces, true, true);
        if (!merged) return null;
        merged.name = 'djMonitorCables';
        merged.material = this.materialFactory.createPBRMaterial('djMonitorCableMat', {
            baseColor: [0.018, 0.018, 0.022], metallic: 0.1, roughness: 0.62
        }, true);
        merged.isPickable = false;
        merged.freezeWorldMatrix();
        merged.doNotSyncBoundingInfo = true;
        return merged;
    },

    // ------------------------------------------------------------------------------------------
    // RESTROOM (WC): a tiled underground club restroom off the front-left corner of the main hall,
    // with two toilet stalls, two washbasins, backlit vanity mirrors and neon cove lighting.
    // ------------------------------------------------------------------------------------------
    createRestroom() {
        log.info('🚻 Creating club restroom...');
        const R = VENUE_RESTROOM;
        const { wallX: XN, farX: XF, z0: Z0, z1: Z1, height: H, door: D, stallFrontX: SX } = R;
        const factory = this.materialFactory;
        const b = this._dressingBuilder('restroom');
        const widthX = XN - XF + 0.3;
        const lengthZ = Z1 - Z0 + 0.3;
        const midX = (XF - 0.3 + XN) / 2;
        const midZ = (Z0 + Z1) / 2;

        const wallMat = factory.getPreset('wall');
        const wallScale = (this.textureLoader && this.textureLoader.textureConfigs.walls.scale) || { u: 1, v: 1 };
        const ceilingScale = (this.textureLoader && this.textureLoader.textureConfigs.ceiling.scale) || { u: 1, v: 1 };
        const brick = mesh => this._applyWorldUVs(mesh, 1.5, wallScale);

        const walls = b.group('Walls', wallMat);
        b.box(walls, 0.3, H, lengthZ, XF - 0.15, H / 2, midZ, brick);
        b.box(walls, widthX, H, 0.3, midX, H / 2, Z0 - 0.15, brick);
        b.box(walls, widthX, H, 0.3, midX, H / 2, Z1 + 0.15, brick);

        const ceiling = b.group('Ceiling', factory.getPreset('ceiling'));
        b.box(ceiling, widthX + 0.5, 0.14, lengthZ, (XF - 0.3 + XN + 0.5) / 2, H + 0.07, midZ,
            mesh => this._applyWorldUVs(mesh, 3, ceilingScale));

        const floorMat = factory.createPBRMaterial('restroomFloorMat', {
            baseColor: [0.04, 0.042, 0.048], metallic: 0.18, roughness: 0.32, mutable: true
        });
        const floor = b.group('Floor', floorMat);
        b.box(floor, XN - XF + 0.55, 0.02, Z1 - Z0, (XF + XN + 0.55) / 2, 0.01, midZ);

        // Door frame around the left-wall opening (x -12.5, z -4.1..-2.3) and two dark cubicle partitions.
        const partitionMat = factory.createPBRMaterial('restroomPartitionMat', {
            baseColor: [0.055, 0.058, 0.068], metallic: 0.45, roughness: 0.38
        }, true);
        const partitions = b.group('Partitions', partitionMat);
        const doorSpan = D.z1 - D.z0;
        b.box(partitions, 0.56, D.height, 0.12, -12.5, D.height / 2, D.z0 + 0.06);
        b.box(partitions, 0.56, D.height, 0.12, -12.5, D.height / 2, D.z1 - 0.06);
        b.box(partitions, 0.56, 0.12, doorSpan, -12.5, D.height - 0.06, (D.z0 + D.z1) / 2);

        const stallH = 2.15, stallBottom = 0.12, panelH = stallH - stallBottom, panelY = stallBottom + panelH / 2;
        const stallDepth = SX - XF;
        for (const z of [-4.6, -2.8]) {
            b.box(partitions, stallDepth, panelH, 0.05, XF + stallDepth / 2, panelY, z);
        }
        // Stall front pilaster piers either side of the two 1.28 m cubicle doorways (wide enough for the desktop
        // collision body, which is 1 m across).
        const pier = R.stallPier;
        for (const z of [Z0 + pier / 2, -4.6 - pier / 2, -2.8 + pier / 2, Z1 - pier / 2]) {
            b.box(partitions, 0.05, stallH, pier, SX, stallH / 2, z);
        }
        // Steel housing of the backlit NOCTURNE poster at the end of the aisle (js/restroomArt.js places the picture on it).
        const housing = b.group('LightboxHousing', partitionMat);
        b.box(housing, 0.05, 1.26 + 0.08, 0.9 + 0.08, XF + 0.025, 1.6, -3.7);
        // Header rails across the two cubicle fronts. The doors are separate hinged leaves (see _createStallDoors): they
        // stand ajar on the hall side of the front, hinged on the outer wall side so they never cross the opening, and
        // swing shut when the guest sits on that toilet.
        for (const [zA, zB] of [[Z0, -4.6], [-2.8, Z1]]) {
            b.box(partitions, 0.05, 0.10, Math.abs(zB - zA), SX, stallH - 0.05, (zA + zB) / 2);
        }

        // Planar vanity mirrors above both washbasins, plus chrome plumbing, soap dispensers, paper rolls and hand dryer.
        const mirrorFaceX = XN - 0.04;
        const mirrorMat = this._createRestroomMirrorMaterial(mirrorFaceX);
        const mirrors = b.group('Mirrors', mirrorMat);
        const fixtures = b.group('Fixtures', factory.createPBRMaterial('restroomChromeMat', {
            baseColor: [0.74, 0.76, 0.8], metallic: 0.92, roughness: 0.26
        }, true));
        const plastic = b.group('Dispensers', factory.createPBRMaterial('restroomPlasticMat', {
            baseColor: [0.78, 0.8, 0.83], metallic: 0, roughness: 0.38
        }, true));
        const paper = b.group('PaperRolls', factory.createPBRMaterial('restroomPaperMat', {
            baseColor: [0.84, 0.82, 0.76], metallic: 0, roughness: 0.92
        }, true));
        for (const sz of R.sinkZ) {
            b.box(mirrors, 0.02, 0.92, 0.72, XN - 0.03, 1.48, sz);
            // Soap dispenser beside the basin: a plastic body with a chrome pump.
            b.box(plastic, 0.08, 0.18, 0.10, XN - 0.06, 1.16, sz + 0.44);
            b.cylinder(fixtures, 0.025, 0.05, XN - 0.14, 1.19, sz + 0.44, 'x', 10);
        }
        // A toilet roll on a holder against each cubicle's divider, beside the toilet.
        for (const rz of [-4.675, -2.725]) {
            b.cylinder(paper, 0.12, 0.10, -15.55, 0.72, rz, 'z', 14);
            b.box(fixtures, 0.02, 0.02, 0.016, -15.55, 0.72, rz + (rz < -3.5 ? 0.058 : -0.058));
        }
        // Stainless hand dryer between the doorway and the stage-side basin, with its downward nozzle.
        b.box(fixtures, 0.16, 0.28, 0.24, XN - 0.09, 1.2, -4.42);
        b.cylinder(fixtures, 0.07, 0.06, XN - 0.1, 1.03, -4.42, 'y', 12);

        // Neon coves and warm backlit mirror halos.
        const magenta = b.group('CoveMagenta', this._emissive('restroomMagentaMat', [1.0, 0.14, 0.55]));
        const cyan = b.group('CoveCyan', this._emissive('restroomCyanMat', [0.1, 0.72, 1.0]));
        const warm = b.group('MirrorGlow', this._emissive('restroomWarmMat', [1.0, 0.78, 0.48]));
        b.box(magenta, 0.04, 0.035, Z1 - Z0 - 0.3, XF + 0.04, H - 0.12, midZ);
        b.box(cyan, 0.04, 0.035, Z1 - Z0 - 0.3, XN - 0.04, H - 0.12, midZ);
        for (const sz of R.sinkZ) {
            b.box(warm, 0.012, 0.98, 0.78, XN - 0.015, 1.48, sz);
        }

        const built = b.finish({ collide: ['Walls', 'Ceiling', 'Partitions'] });
        const scoped = Object.values(built);
        this._createStallDoors(partitionMat, scoped);
        this._createRestroomArt(scoped);
        ['leftWallFront', 'leftWallLintel'].forEach(name => {
            const wall = this.scene.getMeshByName(name);
            if (wall) scoped.push(wall);
        });
        this._restroomLight = this._createScopedAccent('restroomLight', new BABYLON.Vector3(-14.1, 2.75, midZ),
            { intensity: 1.55, range: 7.5, diffuse: [1, 0.84, 0.72], group: 'restroom' }, scoped);
        // A dim magenta light behind the stalls' fronts (the glow of the NOCTURNE box): the light above the hall cannot
        // reach the faces that look back toward the back wall, such as the inside of a shut stall door.
        this._restroomBackLight = this._createScopedAccent('restroomBackLight', new BABYLON.Vector3(-15.55, 2.5, midZ),
            { intensity: 0.85, range: 4.4, diffuse: [1, 0.72, 0.92], group: 'restroom' }, scoped);
        this._restroomFloor = built.Floor || null;
        this._restroomMeshes = scoped;

        this.modelLoadPromise.then(() => { if (!this._disposed) this._furnishRestroom(); });
        log.info('✅ Club restroom created');
    },

    /** Flat vertex data for a list of wall quads: {centre, right, normal, w, h, uv}. Pure: no scene needed. */
    _artGeometry(quads) {
        const positions = [], normals = [], uvs = [], indices = [];
        for (const quad of quads) {
            const { centre: c, right: r, normal: n, w, h, uv } = quad;
            const base = positions.length / 3;
            for (const [sx, sy, u, v] of [
                [-1, -1, uv.u0, uv.vBottom], [1, -1, uv.u1, uv.vBottom], [1, 1, uv.u1, uv.vTop], [-1, 1, uv.u0, uv.vTop]
            ]) {
                positions.push(c[0] + r[0] * w / 2 * sx, c[1] + sy * h / 2, c[2] + r[2] * w / 2 * sx);
                normals.push(n[0], n[1], n[2]);
                uvs.push(u, v);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        return { positions, normals, uvs, indices };
    },

    _artMesh(name, quads, material, parent) {
        const mesh = new BABYLON.Mesh(name, this.scene);
        const data = new BABYLON.VertexData();
        Object.assign(data, this._artGeometry(quads));
        data.applyToMesh(mesh);
        mesh.material = material;
        mesh.isPickable = false;
        if (parent) mesh.parent = parent;
        else { mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true; }
        return mesh;
    },

    /**
     * Posters, decals and the backlit NOCTURNE box on the restroom walls and stall doors (js/restroomArt.js paints one
     * atlas). The lit quads (posters, stickers, marker tags) are ONE alpha-tested mesh; the light box is its own
     * emissive one, so the whole wall treatment costs two draws plus one per door. A failure to paint only leaves the
     * walls bare.
     */
    _createRestroomArt(scoped) {
        const Art = window.RestroomArt;
        if (!Art) return;
        let atlas;
        try {
            atlas = new BABYLON.DynamicTexture('restroomArtAtlas', { width: Art.ATLAS.width, height: Art.ATLAS.height }, this.scene, true);
            Art.paint(atlas.getContext());
        } catch (err) {
            log.warn('Restroom art could not be painted:', err);
            if (atlas) atlas.dispose();
            return;
        }
        atlas.hasAlpha = true;
        atlas.anisotropicFilteringLevel = this.tierSettings ? this.tierSettings.anisotropy : 4;
        atlas.update();
        const factory = this.materialFactory;
        const posterMat = factory.createStandardMaterial('restroomPosterMat', {
            diffuseTexture: atlas, specularColor: [0.04, 0.04, 0.04], emissiveColor: [0.03, 0.03, 0.03], mutable: true
        });
        posterMat.useAlphaFromDiffuseTexture = true;
        posterMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
        posterMat.alphaCutOff = 0.5;
        posterMat.backFaceCulling = false;
        posterMat.freeze();
        const boxMat = factory.createStandardMaterial('restroomLightboxMat', {
            emissiveTexture: atlas, diffuseColor: [0, 0, 0], disableLighting: true, mutable: true
        });
        boxMat.backFaceCulling = false;
        boxMat.freeze();

        const lit = [], box = [];
        for (const placement of Art.PLAN) {
            const quad = { ...Art.frame(placement), w: placement.w, h: placement.h, uv: Art.uv(placement.cell) };
            (placement.kind === 'lightbox' ? box : lit).push(quad);
        }
        const made = [this._artMesh('restroomPosters', lit, posterMat), this._artMesh('restroomLightbox', box, boxMat)];

        // The art on each stall door moves with its hinge: the face toward the hall (+x) and the face toward the toilet (-x).
        const T = 0.035;
        for (const door of this._restroomDoors || []) {
            const quads = Art.DOORS.map(item => {
                const out = item.side === 'out';
                return {
                    centre: [(out ? 1 : -1) * (T / 2 + 0.003), item.y, door.leafSign * item.along],
                    right: [0, 0, out ? 1 : -1], normal: [out ? 1 : -1, 0, 0], w: item.w, h: item.h, uv: Art.uv(item.cell)
                };
            });
            made.push(this._artMesh(`restroomDoorArt${door.index}`, quads, posterMat, door.hinge));
        }
        made.forEach(mesh => scoped.push(mesh));
        this._restroomArtAtlas = atlas;
    },

    /**
     * The two cubicle doors: hinged leaves in the front plane of the stalls. Each hangs from the end of its opening that
     * is next to a side wall and stands ajar on the hall side (folded toward that wall, clear of the opening and of the
     * washbasins), swings shut while somebody sits on its toilet, and can be pushed shut or ajar by hand (a click or a
     * controller ray on it), a state the whole room shares (see setSharedDoor). A shut door is solid; somebody overlapping
     * it as it closes gets clearance only until they first step clear. A small lamp on the outer face is the lock: red only while
     * somebody is sitting inside, green otherwise, even when the door has been pushed shut by hand over a vacant toilet.
     */
    _createStallDoors(material, scoped) {
        const R = VENUE_RESTROOM;
        const T = 0.035, gap = 0.02, bottom = 0.16, top = 2.11;
        const frontX = R.stallFrontX + 0.025 + T / 2 + 0.004;
        const chrome = this.materialFactory.getPreset('stanchionPost');
        const free = this._emissive('restroomDoorFreeMat', [0.1, 0.9, 0.3]);
        const busy = this._emissive('restroomDoorBusyMat', [1.0, 0.12, 0.1]);
        const makeBox = (name, parent, w, h, d, x, y, z, mat, index) => {
            const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
            mesh.parent = parent;
            mesh.position.set(x, y, z);
            mesh.material = mat;
            mesh.isPickable = true;
            mesh.metadata = { vrclubDoor: index };
            scoped.push(mesh);
            return mesh;
        };
        this._doorsByHand = this._doorsByHand || R.stallOpenings.map(() => false);
        this._restroomDoors = R.stallOpenings.map(([from, to], index) => {
            const leafSign = index === 0 ? 1 : -1;               // leaf runs +z from the hinge in stall 0, -z in stall 1
            const width = to - from - 2 * gap;
            const hinge = new BABYLON.TransformNode(`restroomStallHinge${index}`, this.scene);
            hinge.position.set(frontX, 0, leafSign > 0 ? from + gap : to - gap);
            const leaf = makeBox(`restroomStallDoor${index}`, hinge, T, top - bottom, width, 0, (top + bottom) / 2, leafSign * width / 2, material, index);
            makeBox(`restroomStallHandle${index}`, hinge, 0.02, 0.12, 0.035, T / 2 + 0.01, 1.0, leafSign * (width - 0.1), chrome, index);
            const lamp = makeBox(`restroomStallLamp${index}`, hinge, 0.008, 0.05, 0.05, T / 2 + 0.004, 1.12, leafSign * (width - 0.1), free, index);
            const door = { index, seatId: `toilet-${index}`, hinge, leaf, lamp, free, busy, leafSign, frontX, opening: [from, to], t: 1, open: 1, remote: false, occupied: false, clearancePending: false };
            this._poseStallDoor(door);
            this._paintDoorLamp(door);
            return door;
        });
    },

    _poseStallDoor(door) {
        const t = door.t;
        door.open = t * t * (3 - 2 * t);
        door.hinge.rotation.y = door.leafSign * VENUE_RESTROOM.doorAjar * door.open;
    },

    /** The lamp is a lock indicator, not a door-position one: red only while somebody is inside, green when it is vacant (shut or not). */
    _paintDoorLamp(door) {
        const material = door.occupied ? door.busy : door.free;
        if (door.lamp.material !== material) door.lamp.material = material;
    },

    /** The room's doors as set by hand: one change (or the whole list, on joining) from the relay. Pure state, no animation. */
    setSharedDoor(index, shut) {
        const byHand = this._doorsByHand || (this._doorsByHand = VENUE_RESTROOM.stallOpenings.map(() => false));
        if (Number.isInteger(index) && index >= 0 && index < byHand.length) byHand[index] = shut === true;
    },

    setSharedDoors(list) {
        const count = VENUE_RESTROOM.stallOpenings.length;
        for (let i = 0; i < count; i++) this.setSharedDoor(i, Array.isArray(list) && list[i] === true);
    },

    /** Push a door shut or ajar by hand, for everybody in the room. An occupied door does not give (its red lamp says so). */
    pushStallDoor(index) {
        const door = this._restroomDoors && this._restroomDoors[index];
        if (!door) return false;
        this._scanRemoteToilets();
        if (door.remote && !(this._activeSeat && this._activeSeat.id === door.seatId)) {
            this.showErrorMessage('This toilet is occupied');
            return false;
        }
        const shut = !this._doorsByHand[index];
        this.setSharedDoor(index, shut);
        const mp = this.multiplayer;
        if (mp && mp.connected && mp.client && typeof mp.client.sendDoor === 'function') mp.client.sendDoor(index, shut);
        return true;
    },

    /**
     * A click or controller ray on a door: the guest sitting behind it stands up (which opens it), anyone else pushes it. It
     * takes the press before the seat does, because a shut door is in front of the toilet it hides.
     */
    _pressStallDoor(pickResult) {
        const index = pickResult && pickResult.pickedMesh && pickResult.pickedMesh.metadata && pickResult.pickedMesh.metadata.vrclubDoor;
        if (!Number.isInteger(index) || !this._restroomDoors || !this._restroomDoors[index]) return false;
        const door = this._restroomDoors[index];
        if (this._activeSeat && this._activeSeat.id === door.seatId) {
            this.standFromSeat(true);
            return true;
        }
        this.pushStallDoor(index);
        return true;
    },

    /**
     * A door is shut while anybody sits on its toilet: this guest (their seat) or any guest in the room. Remote guests need no
     * new message: their ordinary state frames already carry `seated` and their position, which is the toilet's seat, so every
     * guest derives the same door from the same people and can talk about what they all see. A guest the relay hides from you
     * (a block) sends you no state, so their door stays open for you as they stay invisible.
     */
    _scanRemoteToilets() {
        const doors = this._restroomDoors;
        for (let i = 0; i < doors.length; i++) doors[i].remote = false;
        const manager = this.avatarManager;
        if (!manager || !manager.remotes || manager.remotes.size === 0) return;
        const R = VENUE_RESTROOM;
        for (const peer of manager.remotes.values()) {
            const target = peer.target;
            if (!target || target.seated !== true) continue;
            for (let i = 0; i < doors.length; i++) {
                if (Math.hypot(target.x - R.toiletSeatX, target.z - R.toiletZ[doors[i].index]) < 0.5) doors[i].remote = true;
            }
        }
    },

    /** Shut the door of an occupied toilet (or one pushed shut by hand) and reopen it when released. Nothing changes without a cause. */
    _updateRestroomDoors(dt) {
        const doors = this._restroomDoors;
        if (!doors || !(dt > 0)) return;
        this._doorScanTimer = (this._doorScanTimer || 0) - dt;
        if (this._doorScanTimer <= 0) {
            this._doorScanTimer = 0.2;
            this._scanRemoteToilets();
        }
        const seatId = this._activeSeat ? this._activeSeat.id : null;
        const byHand = this._doorsByHand;
        let camera = null, pos = null;
        for (let i = 0; i < doors.length; i++) {
            const door = doors[i];
            // Locked means occupied: somebody (this guest, or one the room shows) is sitting on its toilet. A door pushed shut by
            // hand over a vacant toilet is merely closed: its lamp stays green and anyone may push it open.
            door.occupied = seatId === door.seatId || door.remote;
            this._paintDoorLamp(door);
            const target = door.occupied || (byHand && byHand[i]) ? 0 : 1;
            const wasShut = door.t === 0;
            if (door.t !== target) {
                const step = dt / VENUE_RESTROOM.doorSeconds;
                door.t = target > door.t ? Math.min(1, door.t + step) : Math.max(0, door.t - step);
                this._poseStallDoor(door);
            }
            let solid = false;
            if (door.t === 0) {
                if (!camera) {
                    camera = this._playerCamera ? this._playerCamera() : this.camera;
                    pos = camera && (camera.globalPosition || camera.position) || null;
                }
                const radiusX = camera?.ellipsoid?.x ?? 0.25, radiusZ = camera?.ellipsoid?.z ?? 0.25;
                const overlapping = !!pos && Math.abs(pos.x - door.frontX) < radiusX + 0.04 &&
                    pos.z > door.opening[0] - radiusZ && pos.z < door.opening[1] + radiusZ;
                if (!wasShut) door.clearancePending = overlapping;
                else if (!overlapping) door.clearancePending = false;
                solid = !door.clearancePending;
            } else {
                door.clearancePending = false;
            }
            if (door.leaf.checkCollisions !== solid) {
                door.leaf.checkCollisions = solid;
                const teleport = this.vrHelper?.teleportation;
                if (teleport?.addBlockerMesh && teleport?.removeBlockerMesh) {
                    teleport.removeBlockerMesh(door.leaf);
                    if (solid) teleport.addBlockerMesh(door.leaf);
                }
                const blockers = this._xrTeleportBlockers;
                if (blockers) {
                    const index = blockers.indexOf(door.leaf);
                    if (solid && index < 0) blockers.push(door.leaf);
                    else if (!solid && index >= 0) blockers.splice(index, 1);
                }
            }
        }
    },

    /** Place the second toilet and second washbasin, tag the toilets as seats, and add collision blocks. */
    _furnishRestroom() {
        const models = this.modelLoader && this.modelLoader.loadedModels;
        if (!models) return;
        const R = VENUE_RESTROOM;
        const placed = [];

        const toiletRecord = models.restroom_toilet;
        if (toiletRecord && toiletRecord.rootMesh) {
            const { container, rootMesh } = toiletRecord;
            const firstMeshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
            const homeZ = R.toiletZ[0];
            R.toiletZ.forEach((z, index) => {
                let seatMeshes = firstMeshes;
                if (index > 0) {
                    const entry = container.instantiateModelsToScene(name => `restroomToilet${index}_${name}`, false, { doNotInstantiate: false });
                    const root = entry.rootNodes[0];
                    if (!root) return;
                    root.position.x = rootMesh.position.x;
                    root.position.y = rootMesh.position.y;
                    root.position.z = rootMesh.position.z + (z - homeZ);
                    root.rotation.copyFrom(rootMesh.rotation);
                    root.scaling.copyFrom(rootMesh.scaling);
                    root.computeWorldMatrix(true);
                    seatMeshes = root.getChildMeshes().filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
                }
                seatMeshes.forEach(mesh => placed.push(mesh));
                const seat = this._seat('a toilet', `toilet-${index}`, R.toiletSeatX, z, 0, R.toiletSeatY,
                    Math.PI / 2, R.toiletSeatX + 0.42, z);
                this._tagSeatMeshes(seatMeshes, [seat]);
                this._collisionBlock(`restroomToiletBlock${index}`, 0.56, 0.85, 0.52, R.toiletX, 0.425, z);
            });
        }

        const sinkRecord = models.restroom_sink;
        if (sinkRecord && sinkRecord.rootMesh) {
            const { container, rootMesh } = sinkRecord;
            const firstMeshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
            const homeZ = R.sinkZ[0];
            R.sinkZ.forEach((z, index) => {
                let sinkMeshes = firstMeshes;
                if (index > 0) {
                    const entry = container.instantiateModelsToScene(name => `restroomSink${index}_${name}`, false, { doNotInstantiate: false });
                    const root = entry.rootNodes[0];
                    if (!root) return;
                    root.position.x = rootMesh.position.x;
                    root.position.y = rootMesh.position.y;
                    root.position.z = rootMesh.position.z + (z - homeZ);
                    root.rotation.copyFrom(rootMesh.rotation);
                    root.scaling.copyFrom(rootMesh.scaling);
                    root.computeWorldMatrix(true);
                    sinkMeshes = root.getChildMeshes().filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
                }
                sinkMeshes.forEach(mesh => {
                    mesh.isPickable = false;
                    placed.push(mesh);
                });
                this._collisionBlock(`restroomSinkBlock${index}`, 0.48, 0.9, 0.62, R.sinkX, 0.45, z);
            });
        }

        // Poly Haven props: the waste bin under the hand dryer, a wet floor sign in the aisle, a plunger in the first stall.
        for (const key of ['restroom_bin', 'restroom_wetsign', 'restroom_plunger']) {
            const record = models[key];
            if (!record || !record.container) continue;
            record.container.meshes
                .filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0)
                .forEach(mesh => { mesh.isPickable = false; placed.push(mesh); });
        }
        if (models.restroom_bin) this._collisionBlock('restroomBinBlock', 0.4, 0.62, 0.4, R.props.bin.x, 0.31, R.props.bin.z);

        this._extendAccentLight(this._restroomLight, placed);
        this._extendAccentLight(this._restroomBackLight, placed);
        this._restroomFixtures = placed;
        this._syncRestroomMirrorRenderList();
    },

    /**
     * Build the vanity mirror material backed by a real planar `MirrorTexture` when available.
     * Both mirrors lie on the same `x = mirrorX` plane facing `-x`, so one texture serves both panes.
     */
    _createRestroomMirrorMaterial(mirrorX) {
        const factory = this.materialFactory;
        if (!BABYLON.MirrorTexture || !BABYLON.Plane) {
            return factory.createPBRMaterial('restroomMirrorMat', {
                baseColor: [0.82, 0.86, 0.90], metallic: 0.98, roughness: 0.04
            }, true);
        }
        const mat = factory.createStandardMaterial('restroomMirrorMat', {
            diffuseColor: [0.06, 0.07, 0.08],
            specularColor: [0, 0, 0],
            emissiveColor: [0.02, 0.025, 0.03],
            mutable: true
        });
        try {
            const mirrorTex = new BABYLON.MirrorTexture('restroomMirrorTex', 512, this.scene, true);
            // Babylon's mirror plane faces AWAY from the viewer (a floor mirror uses a downward normal): the pane's
            // face looks toward -x, into the restroom, so the plane's normal is +x. The opposite sign clips the room
            // and leaves the reflection black.
            mirrorTex.mirrorPlane = BABYLON.Plane.FromPositionAndNormal(
                new BABYLON.Vector3(mirrorX, 0, 0), new BABYLON.Vector3(1, 0, 0));
            mirrorTex.level = 0.92;
            mirrorTex.refreshRate = 0;
            mirrorTex._revealed = [];
            // Everything that is hidden in the normal view but belongs in the reflection: the player's own head (hidden
            // so it cannot fill the camera) and the double of the character the relay gave this guest.
            mirrorTex.onBeforeRenderObservable.add(() => {
                const shown = mirrorTex._revealed;
                shown.length = 0;
                const reveal = this._mirrorReveal;
                if (!reveal) return;
                for (let i = 0; i < reveal.length; i++) {
                    const mesh = reveal[i];
                    if (mesh && !mesh.isVisible && !mesh.isDisposed()) {
                        mesh.isVisible = true;
                        shown.push(mesh);
                    }
                }
                // A hidden mesh is skipped by the scene's own pass, so its skeleton was not advanced this frame.
                const double = this._mirrorDouble;
                if (double && double.skeletons) for (let i = 0; i < double.skeletons.length; i++) double.skeletons[i].prepare(true);
                // The reflection shows the whole person, head included; the player's own view does not.
                if (double) this._setSelfHead(double, true);
                else if (this._localRig && typeof this._localRig.setHeadVisible === 'function') {
                    this._localRig._mirrorRestoreHead = !this._localRig._headVisible;
                    if (this._localRig._mirrorRestoreHead) this._localRig.setHeadVisible(true);
                }
            });
            mirrorTex.onAfterRenderObservable.add(() => {
                const shown = mirrorTex._revealed;
                for (let i = 0; i < shown.length; i++) if (!shown[i].isDisposed()) shown[i].isVisible = false;
                shown.length = 0;
                if (this._mirrorDouble) this._setSelfHead(this._mirrorDouble, !!this._mirrorDouble.headWanted);
                else if (this._localRig && this._localRig._mirrorRestoreHead) {
                    this._localRig._mirrorRestoreHead = false;
                    this._localRig.setHeadVisible(false);
                }
            });
            mat.reflectionTexture = mirrorTex;
            this.restroomMirrorTexture = mirrorTex;
        } catch (err) {
            log.warn('⚠️ Failed to create restroom MirrorTexture, using metallic fallback:', err);
        }
        return mat;
    },

    /**
     * What the mirror draws: the restroom, the people in it, and the player. Online, the player is the character the relay
     * assigned them (the one everybody else sees), built as a hidden double that only the mirror renders; offline it is
     * the first-person body for their chosen style, with its head shown for the reflection.
     */
    _syncRestroomMirrorRenderList() {
        const tex = this.restroomMirrorTexture;
        if (!tex || !tex.renderList) return;
        const list = tex.renderList;
        list.length = 0;
        const reveal = this._mirrorReveal || (this._mirrorReveal = []);
        reveal.length = 0;
        const seen = new Set();
        const add = mesh => {
            if (!mesh || seen.has(mesh) || mesh.name === 'restroomMirrors') return;
            seen.add(mesh);
            list.push(mesh);
        };
        if (this._restroomMeshes) this._restroomMeshes.forEach(add);
        if (this._restroomFixtures) this._restroomFixtures.forEach(add);
        const double = this._mirrorDouble;
        if (double) {
            double.meshes.forEach(mesh => { add(mesh); reveal.push(mesh); });
        } else if (this._localRig && this._localRig.meshes) {
            this._localRig.meshes.forEach(mesh => {
                add(mesh);
                if (typeof AvatarRig !== 'undefined' && AvatarRig.HEAD_MESH.test(mesh.name)) reveal.push(mesh);
            });
        }
        const manager = this.avatarManager;
        if (manager && manager.remotes) {
            manager.remotes.forEach(peer => {
                if (peer.person && peer.person.meshes) peer.person.meshes.forEach(add);
                else if (peer.body) { add(peer.body); add(peer.head); }
            });
        }
    },

    /** Who the mirror shows: the relay's assignment in a room, otherwise the character the player chose (null = their own body). */
    _mirrorAvatarId() {
        if (typeof this.hasCustomAvatarGlb === 'function' && this.hasCustomAvatarGlb()) return null;
        const mp = this.multiplayer;
        if (mp && mp.connected) return mp.selfAvatar || null;
        const selected = typeof this.getLocalCharacter === 'function' ? this.getLocalCharacter() : null;
        return selected || ((this.performingAsDJ || (this.getCharacterStyle && this.getCharacterStyle() === 'diverse'))
            ? this.getLocalAvatarStyle() === 'male' ? 'm1' : 'f1' : null);
    },

    /** Follow the relay's assignment in a room, or the player's own choice offline. */
    _syncMirrorDouble() {
        const avatarId = this._mirrorAvatarId();
        const appearance = this._ownAppearance?.() || null;
        const appearanceKey = appearance ? window.AvatarAppearance.key(appearance) : '';
        const style = this.getCharacterStyle ? this.getCharacterStyle() : 'quaternius';
        const key = `${style}:${this._characterStyles?.generation || 0}:${avatarId}:${appearanceKey}`;
        const double = this._mirrorDouble;
        if (double && double.avatarId === avatarId && (double.characterStyle || 'quaternius') === style &&
            (double.appearanceKey || '') === appearanceKey) return;
        if (double) this._disposeMirrorDouble();
        if (!avatarId || this._mirrorDoubleLoading === key) return;
        this._mirrorDoubleLoading = key;
        this._buildMirrorDouble(avatarId)
            .catch(err => log.warn('Could not build the mirror reflection of your character:', err))
            .finally(() => { if (this._mirrorDoubleLoading === key) this._mirrorDoubleLoading = null; });
    },

    async _buildMirrorDouble(avatarId) {
        const Crowd = window.VRClubAudioCrowd;
        const index = Crowd ? Crowd.sourceIndex(avatarId) : -1;
        if (index < 0 || typeof this._loadCrowdSource !== 'function' || !this._crowdSourceContainers) return;
        const characterStyle = this.getCharacterStyle ? this.getCharacterStyle() : 'quaternius';
        const generation = this._characterStyles?.generation || 0;
        const appearance = this._ownAppearance?.() || null;
        const appearanceKey = appearance ? window.AvatarAppearance.key(appearance) : '';
        const container = this._loadPlayerSource ? await this._loadPlayerSource(avatarId, characterStyle, appearance) : await this._loadCrowdSource(index);
        if (!container || this._disposed || !this.scene || this._mirrorDouble || this._mirrorAvatarId() !== avatarId) return;
        if ((this._characterStyles?.generation || 0) !== generation) return;
        if (appearanceKey !== (this._ownAppearance?.() ? window.AvatarAppearance.key(this._ownAppearance()) : '')) return;

        const prefix = 'mirrorSelf_';
        const entry = this._instantiatePlayer ? this._instantiatePlayer(container, prefix, appearance) :
            container.instantiateModelsToScene(name => `${prefix}${name}`, false, { doNotInstantiate: true });
        const node = entry.rootNodes[0];
        if (!node) { entry.dispose(); return; }
        const root = new BABYLON.TransformNode('mirrorSelfRoot', this.scene);
        node.parent = root;
        node.rotationQuaternion = null;
        node.rotation.set(0, 0, 0);
        node.scaling.setAll(1);
        node.position.set(0, 0, 0);
        node.computeWorldMatrix(true);
        // The first-person body is this same instance, so it is sized from the EYES: scaled so the character's eyes are at
        // the player's eye height (read from its eye-coloured vertices; 93.5% of its height when it has none) with its feet
        // on the floor. The camera then sits in its head, and looking down shows exactly the person in the mirror.
        node.computeWorldMatrix(true);
        const bounds = node.getHierarchyBoundingVectors(true, mesh => !mesh.metadata?.vrclubAdornment);
        const minY = bounds.min.y, raw = bounds.max.y - bounds.min.y;
        const eyeBind = container.character ? BABYLON.Vector3.FromArray(container.character.eye) : this._characterEyePoint(node, minY);
        const eyeRaw = eyeBind ? eyeBind.y - minY : raw * 0.935;
        if (!(raw > 1e-6) || !(eyeRaw > 0.3)) { entry.dispose(); root.dispose(); return; }
        const scale = this._shownBodyEye() / eyeRaw;
        node.scaling.setAll(scale);
        node.position.y = -minY * scale;
        node.computeWorldMatrix(true);
        // The eye point, remembered in the neck's own frame (the neck is never scaled, the head is): each frame the body is placed
        // so this point is at the camera, wherever the clip has swayed the head, with the eyes a little forward of the neck.
        const neck = node.getChildTransformNodes(false).find(item => item.name === `${prefix}Neck`) || null;
        let eyeLocal = null;
        const neckChain = [];
        if (neck && eyeBind) {
            for (let n = neck; n && n !== root; n = n.parent) neckChain.unshift(n);
            neckChain.forEach(n => n.computeWorldMatrix(true));
            const world = new BABYLON.Vector3(eyeBind.x * scale, eyeBind.y * scale + node.position.y, eyeBind.z * scale);
            eyeLocal = BABYLON.Vector3.TransformCoordinates(world, neck.getWorldMatrix().clone().invert());
        }

        const meshes = node.getChildMeshes();
        // Hidden until it has been placed under the player (one frame), so it never flashes at the origin.
        root.setEnabled(false);
        meshes.forEach(mesh => {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
        });
        const wanted = new Set(['Idle', 'Walk', 'Run', 'Seated_Loop', 'Seated_Low_Loop']);
        const groups = {};
        for (const group of entry.animationGroups) {
            const clip = group.name.startsWith(prefix) ? group.name.slice(prefix.length) : group.name;
            if (!wanted.has(clip)) { group.dispose(); continue; }
            group.enableBlending = true;
            group.blendingSpeed = 0.06;
            groups[clip] = group;
        }
        if (!groups.Idle) { entry.dispose(); root.dispose(); return; }
        const arms = typeof AvatarRig !== 'undefined' ? AvatarRig.createTrackedArms(node, prefix) : null;
        const double = {
            avatarId, characterStyle, appearanceKey, entry, root, node, meshes, groups, arms, current: null, speed: 0,
            eyeRaw, minY, active: true, shown: false, neck, neckChain, eyeLocal, eyeNow: new BABYLON.Vector3(), serial: (this._mirrorDoubleSerial = (this._mirrorDoubleSerial || 0) + 1),
            skeletons: Array.from(new Set(meshes.map(mesh => mesh.skeleton).filter(Boolean))),
            hands: { left: null, right: null }, handBuffers: { left: {}, right: {} },
            prevX: NaN, prevZ: NaN, observer: null,
            x: 0, z: 0, yaw: 0, placed: false, gait: 'idle', seatKey: null
        };
        // Live controller arms go in after the clips have been evaluated, or the clip would erase them.
        double.observer = this.scene.onAfterAnimationsObservable.add(() => {
            if (!double.active || !double.arms || !(double.hands.left || double.hands.right)) return;
            double.arms.updateTrackedArms(double.hands, double.root.rotation.y, this._activeSeat ? 1.2 : this._shownBodyEye());
        });
        this._mirrorDouble = double;
        // The head is part of the one mesh, so it is hidden by collapsing its bone: the camera sits where it was. The mirror
        // brings it back while it renders (see _createRestroomMirrorMaterial).
        double.head = node.getChildTransformNodes(false).find(item => item.name === `${prefix}Head`) || null;
        this._setSelfHead(double, false);
        this._extendAccentLight(this._restroomLight, meshes);
        this._extendAccentLight(this._restroomBackLight, meshes);
        this._playMirrorDouble(double, 'Idle', 1);
        this._mirrorSignature = -1;
    },

    /**
     * Where the character's eyes are, in world space at its bind pose (the node unscaled, at the origin): the mean of its
     * eye-coloured vertices (the cast's shared dark-brown eye colour, only in the top 15%), or null when none are found.
     */
    _characterEyePoint(node, minY) {
        const EYE = [0.0307, 0.0185, 0.0116];   // '#31251c' in linear light, what the build script paints the eyes with
        const meshes = node.getChildMeshes();
        let top = -Infinity;
        for (const mesh of meshes) {
            const box = mesh.getBoundingInfo && mesh.getBoundingInfo().boundingBox;
            if (box) top = Math.max(top, box.maximumWorld.y);
        }
        if (!Number.isFinite(top)) return null;
        let x = 0, y = 0, z = 0, count = 0;
        const point = new BABYLON.Vector3();
        for (const mesh of meshes) {
            const colours = mesh.getVerticesData && mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
            const positions = mesh.getVerticesData && mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            if (!colours || !positions) continue;
            const stride = colours.length / (positions.length / 3);
            const world = mesh.computeWorldMatrix(true);
            for (let i = 0; i < positions.length / 3; i++) {
                const c = i * stride;
                if (Math.abs(colours[c] - EYE[0]) > 0.006 || Math.abs(colours[c + 1] - EYE[1]) > 0.006 || Math.abs(colours[c + 2] - EYE[2]) > 0.006) continue;
                BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2], world, point);
                if (point.y > top - 0.15 * (top - minY)) { x += point.x; y += point.y; z += point.z; count++; }
            }
        }
        return count >= 4 ? new BABYLON.Vector3(x / count, y / count, z / count) : null;
    },

    /** Show or collapse the character's head (a bone scale), and re-skin so the change is drawn by the next pass. */
    _setSelfHead(double, shown) {
        if (!double || !double.head || double.headShown === shown) return;
        double.headShown = shown;
        double.head.scaling.setAll(shown ? 1 : 0.0001);
        if (double.skeletons) for (let i = 0; i < double.skeletons.length; i++) double.skeletons[i].prepare(true);
    },

    _playMirrorDouble(double, clip, speedRatio) {
        const group = double.groups[clip];
        if (!group) return;
        if (double.current === clip) { group.speedRatio = speedRatio; return; }
        const previous = double.groups[double.current];
        if (previous) previous.stop();
        group.start(true, speedRatio);
        group.speedRatio = speedRatio;
        double.current = clip;
    },

    _disposeMirrorDouble() {
        const double = this._mirrorDouble;
        if (!double) return;
        this._mirrorDouble = null;
        if (this.scene && double.observer) this.scene.onAfterAnimationsObservable.remove(double.observer);
        try { double.entry.dispose(); } catch (_) { /* already gone */ }
        try { double.root.dispose(); } catch (_) { /* already gone */ }
        this._mirrorSignature = -1;
    },

    /** Put the double where the player stands, facing where they look, walking when they walk. */
    _updateMirrorDouble(dt) {
        const double = this._mirrorDouble;
        if (!double || !(dt > 0)) return;
        const cam = this._playerCamera ? this._playerCamera() : this.camera;
        const pos = cam && (cam.globalPosition || cam.position);
        if (!pos) return;
        // The body is the player's own size: its eyes at the eye height the body is drawn at (eased, see _easedBodyEyeHeight).
        if (double.node && double.eyeRaw) {
            const wanted = this._shownBodyEye() / double.eyeRaw;
            const applied = double.node.scaling.x;
            if (Math.abs(wanted / applied - 1) >= 0.005) {
                double.node.scaling.setAll(wanted);
                double.node.position.y = -double.minY * wanted;
                if (double.arms) double.arms.invalidateLimbs();
            }
        }
        if (!double.shown && double.root.setEnabled) {
            const rig = this._localRig;
            if (rig && !rig._standsDown) {
                rig._standsDown = true;
                rig.meshes.forEach(mesh => mesh.setEnabled(false));
            }
            double.shown = true;
            double.root.setEnabled(true);
        }
        if (this.performingAsDJ && this._selfDJPose) {
            const djPose = this._selfDJPose;
            const eyeH = this._shownBodyEye();
            double.x = djPose.x;
            double.z = djPose.z;
            double.yaw = (djPose.headYaw || 0) * 0.35;
            const bounceY = (djPose.eyeY || (djPose.groundY + eyeH)) - (djPose.groundY + eyeH);
            double.root.position.set(djPose.x, djPose.groundY + Math.max(-0.08, Math.min(0.04, bounceY)), djPose.z);
            double.root.rotation.y = double.yaw;
            double.placed = true;
            double.prevX = NaN;
            double.speed = 0;
            double.gait = 'idle';
            this._playMirrorDouble(double, 'Idle', 1);
            if (!double._djLightAdded && this.scene) {
                const djLight = this.scene.getLightByName && this.scene.getLightByName('djConsoleLight');
                if (djLight) {
                    this._extendAccentLight(djLight, double.meshes);
                    double._djLightAdded = true;
                }
            }
            for (const side of ['left', 'right']) {
                const tracked = (this.isInVRMode && this._handPose ? this._handPose(side, pos) : null) || djPose[side];
                if (!tracked) { double.hands[side] = null; continue; }
                const hand = double.handBuffers[side];
                hand.x = tracked.x - double.x;
                hand.y = tracked.y - (djPose.groundY + eyeH);
                hand.z = tracked.z - double.z;
                hand.fx = tracked.fx; hand.fy = tracked.fy; hand.fz = tracked.fz;
                hand.ux = tracked.ux; hand.uy = tracked.uy; hand.uz = tracked.uz;
                double.hands[side] = hand;
            }
            if (double.head) {
                const away = Math.hypot(djPose.x - pos.x, (djPose.eyeY || (djPose.groundY + eyeH)) - pos.y, djPose.z - pos.z);
                double.headWanted = away > 0.34;
                this._setSelfHead(double, double.headWanted);
            }
            return;
        }
        const seat = this._activeSeat;
        const dir = this._mirrorDir || (this._mirrorDir = new BABYLON.Vector3());
        cam.getDirectionToRef(BABYLON.Axis.Z, dir);
        // Looking straight up or down makes the heading meaningless: keep the last one rather than spin the body.
        const hasHeading = Math.hypot(dir.x, dir.z) > 0.2;
        const targetX = seat ? seat.x : pos.x, targetZ = seat ? seat.z : pos.z;
        const targetYaw = seat ? seat.facing : (hasHeading ? Math.atan2(dir.x, dir.z) : double.yaw);
        // A headset's tracking carries a few millimetres and a fraction of a degree of tremor at 10 Hz and up; a rigid copy
        // of that made the whole reflection buzz. Low-pass the body (the head, in the clip, is part of it): about 50 ms for
        // position and 100 ms for heading, frame-rate independent, and snapping on a teleport or a change of seat.
        const seatKey = seat ? seat.id : null;
        if (!double.placed || double.seatKey !== seatKey || Math.hypot(targetX - double.x, targetZ - double.z) > 1.5) {
            double.x = targetX; double.z = targetZ; double.yaw = targetYaw;
            double.prevX = NaN; double.speed = 0; double.gait = 'idle';
            double.placed = true; double.seatKey = seatKey;
        } else {
            const kp = 1 - Math.exp(-dt / 0.03);
            const ky = 1 - Math.exp(-dt / 0.10);
            double.x += (targetX - double.x) * kp;
            double.z += (targetZ - double.z) * kp;
            let delta = targetYaw - double.yaw;
            delta -= Math.PI * 2 * Math.round(delta / (Math.PI * 2));
            double.yaw += delta * ky;
        }
        double.root.position.set(double.x, seat ? seat.floorY : (this._walkLevel || 0), double.z);
        double.root.rotation.y = double.yaw;
        // Standing, the character's EYES are put at the camera, whatever the clip has done to its head (a walk sways it a few
        // centimetres) and with the eyes a little forward of the neck: the camera is then in its head, not inside its chest.
        // Seated, the body stays on the seat and the camera is where the seat put it.
        double.eyeAligned = false;
        if (double.neck && double.eyeLocal) {
            double.root.computeWorldMatrix(true);
            for (let i = 0; i < double.neckChain.length; i++) double.neckChain[i].computeWorldMatrix(true);
            BABYLON.Vector3.TransformCoordinatesToRef(double.eyeLocal, double.neck.getWorldMatrix(), double.eyeNow);
            if (!seat) {
                const shiftX = double.eyeNow.x - double.x, shiftZ = double.eyeNow.z - double.z;
                double.root.position.x -= shiftX;
                double.root.position.z -= shiftZ;
                double.eyeNow.x -= shiftX;
                double.eyeNow.z -= shiftZ;
                double.eyeAligned = true;
            }
        }
        // Looking down puts the neck right under the camera: back the body off a hand's breadth as the head tips forward
        // (less in a headset, where the arms must still reach the controllers).
        const lookDown = Math.min(1, Math.max(0, (-dir.y - 0.7) / 0.3));
        if (lookDown > 0) {
            const back = (this.isInVRMode ? 0.04 : 0.18) * lookDown * lookDown * (3 - 2 * lookDown);
            double.root.position.x -= Math.sin(double.yaw) * back;
            double.root.position.z -= Math.cos(double.yaw) * back;
        }
        if (Number.isFinite(double.prevX)) {
            const instant = Math.hypot(double.x - double.prevX, double.z - double.prevZ) / dt;
            double.speed += (Math.min(instant, 8) - double.speed) * (1 - Math.exp(-dt / 0.2));
        }
        double.prevX = double.x; double.prevZ = double.z;
        // Hysteresis: a swaying head must not flip the clip between idle and walk.
        const speed = double.speed;
        let gait = double.gait;
        // A low seat (the couch, a toilet) has its own posture; the stool clip would leave the sitter squatting above it.
        const lowSeat = !!seat && (seat.seatY - seat.floorY) < 0.6 && !!double.groups.Seated_Low_Loop;
        if (seat && (double.groups.Seated_Loop || lowSeat)) gait = 'seated';
        else {
            if (gait === 'seated') gait = 'idle';
            if (gait === 'run') {
                if (speed < 2.2) gait = speed > 0.2 ? 'walk' : 'idle';
            } else if (gait === 'walk') {
                if (speed > 2.8) gait = 'run';
                else if (speed < 0.2) gait = 'idle';
            } else if (speed > 2.8) gait = 'run';
            else if (speed > 0.45) gait = 'walk';
        }
        double.gait = gait;
        if (gait === 'seated') this._playMirrorDouble(double, lowSeat ? 'Seated_Low_Loop' : 'Seated_Loop', 1);
        else if (gait === 'run' && double.groups.Run) this._playMirrorDouble(double, 'Run', Math.min(1.5, speed / 4));
        else if (gait !== 'idle' && double.groups.Walk) this._playMirrorDouble(double, 'Walk', Math.min(1.7, Math.max(0.6, speed / 1.4)));
        else this._playMirrorDouble(double, 'Idle', 1);
        // In a headset the controllers move the double's arms, as they do for everyone else's view of this guest.
        for (const side of ['left', 'right']) {
            const tracked = this.isInVRMode && this._handPose ? this._handPose(side, pos) : null;
            if (!tracked) { double.hands[side] = null; continue; }
            const hand = double.handBuffers[side];
            hand.x = tracked.x - pos.x; hand.y = tracked.y - pos.y; hand.z = tracked.z - pos.z;
            hand.fx = tracked.fx; hand.fy = tracked.fy; hand.fz = tracked.fz;
            hand.ux = tracked.ux; hand.uy = tracked.uy; hand.uz = tracked.uz;
            double.hands[side] = hand;
        }
        // The head is hidden only while the camera is inside it. Seated, the camera stands in front of the body (so it cannot
        // be trapped by the furniture) and a headless sitter would be looking back at you: show it whenever the camera is outside.
        if (double.head) {
            // How far the camera is from the character's eyes (its head bone when the eyes could not be located).
            const eye = double.eyeLocal ? double.eyeNow : double.head.getAbsolutePosition();
            const away = Math.hypot(eye.x - pos.x, eye.y - pos.y, eye.z - pos.z);
            if (double.headWanted === undefined) double.headWanted = away > 0.3;
            else if (double.headWanted && away < 0.22) double.headWanted = false;
            else if (!double.headWanted && away > 0.34) double.headWanted = true;
            this._setSelfHead(double, double.headWanted);
        }
    },

    /**
     * How sharp the mirror is: its size and MSAA samples per graphics tier, on the desktop or in a headset. A 512 px
     * texture without MSAA drew a 0.7 m pane with crawling edges whenever the guest moved.
     */
    _restroomMirrorQuality() {
        const table = this.isInVRMode
            ? { ultra: [1024, 2], high: [512, 2], balanced: [384, 1] }
            : { ultra: [1024, 4], high: [1024, 2], balanced: [512, 1] };
        const [size, samples] = table[this.graphicsTier] || table.high;
        return { size, samples };
    },

    /**
     * Draw the planar mirror only while a guest is in or at the doorway of the restroom. It renders through the mirror
     * material's own render-target hook, once per eye and only while the mirror is in view: also listing it as a custom
     * render target drew it a second time every frame, and a headset's every-other-frame rate showed the reflection of
     * one eye to both and lagged it behind the head.
     */
    updateRestroomMirror(ctx) {
        this._updateRestroomDoors(ctx && ctx.dt);
        if (!this.scene) return;
        // The character is the player's own body everywhere in the club, not only in front of the mirror: it is built
        // (and follows the player) whenever a character is known, and dropped when there is none.
        this._syncMirrorDouble();
        this._updateMirrorDouble(ctx && ctx.dt);
        const tex = this.restroomMirrorTexture;
        if (!tex) return;
        const cam = (this.isInVRMode && this.vrHelper?.baseExperience?.camera) || this.camera;
        const pos = cam && (cam.globalPosition || cam.position);
        const R = VENUE_RESTROOM;
        const nearRestroom = !!pos && pos.x < -10.0 && pos.z > R.z0 - 1.2 && pos.z < R.z1 + 1.2;
        if (!nearRestroom) {
            if (tex.refreshRate !== 0) tex.refreshRate = 0;
            return;
        }
        // Rebuild the list when who is in the mirror changes: the double or the body, and every guest's character.
        const manager = this.avatarManager;
        let people = 0;
        if (manager && manager.remotes) manager.remotes.forEach(peer => { people += peer.person ? 2 : 1; });
        const signature = (this._mirrorDouble ? 1 : 0) + 2 * ((this._localRig && this._localRig.meshes) ? this._localRig.meshes.length : 0) + 1000 * people
            + 100000 * (this._mirrorDouble ? this._mirrorDouble.serial : 0);
        if (this._mirrorSignature !== signature) {
            this._mirrorSignature = signature;
            this._syncRestroomMirrorRenderList();
        }
        const quality = this._restroomMirrorQuality();
        if (this._mirrorQualityKey !== `${quality.size}/${quality.samples}`) {
            this._mirrorQualityKey = `${quality.size}/${quality.samples}`;
            try {
                if (tex.getSize().width !== quality.size) tex.resize(quality.size);
                tex.samples = quality.samples;
            } catch (err) {
                log.warn('Could not resize the restroom mirror:', err);
            }
        }
        if (tex.refreshRate !== 1) tex.refreshRate = 1;
    }
};

window.VenueLayout = {
    bar: VENUE_BAR,
    lounge: VENUE_LOUNGE,
    monitors: VENUE_MONITORS,
    restroom: VENUE_RESTROOM,
    vestibule: VENUE_VESTIBULE
};
/**
 * Boxes for one coat hung from a rail. Shoulders are wider than the cloth is thick, sleeves
 * tilt out, and the hem is below the shoulders. `scale` only changes length and shoulder width.
 */
function coatSilhouetteParts(railX, railY, z, scale) {
    const s = scale || 1;
    const x = railX + 0.03;
    const top = railY - 0.07;
    const length = 0.9 * s;
    return [
        { w: 0.02, h: 0.06, d: 0.02, x, y: railY - 0.03, z },
        { w: 0.07, h: 0.07, d: 0.13, x, y: top, z },
        { w: 0.09, h: 0.1, d: 0.4 * s, x, y: top - 0.06, z },
        { w: 0.06, h: length * 0.52, d: 0.28 * s, x, y: top - 0.08 - length * 0.3, z },
        { w: 0.07, h: length * 0.2, d: 0.34 * s, x, y: top - 0.08 - length * 0.68, z },
        { w: 0.05, h: 0.38 * s, d: 0.06, x, y: top - 0.24, z: z - 0.15 * s, tilt: 0.22 },
        { w: 0.05, h: 0.38 * s, d: 0.06, x, y: top - 0.24, z: z + 0.15 * s, tilt: -0.22 }
    ];
}
window.coatSilhouetteParts = coatSilhouetteParts;

window.VenueDressing = VenueDressing;
