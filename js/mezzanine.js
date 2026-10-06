'use strict';
// The mezzanine: a steel balcony along the left wall above the dance floor, reached by a steel stair that
// climbs along the same wall. Mixed into VRClub.prototype by club_hyperrealistic.js (it borrows the merge
// builder and accent-light helpers from js/venueDressing.js). Nothing here runs per frame except the cheap
// walking-surface follow below.
//
// Built from Poly Haven "Metal Plate" (tread plate) and "Metal Plate 02" (worn panels), both CC0, plus the
// project's own `steelGirder` preset for rails and braces; the two stools and the table are the bar's stool
// model and procedural geometry. Boxes are merged per material: the whole structure is five draw calls.

const MEZZANINE = {
    deck: { x0: -12.2, x1: -9.5, z0: -19.0, z1: -10.4, top: 3.0, thickness: 0.08 },
    // Fifteen treads and a sixteenth riser up to the deck: 0.1875 m rise, 0.28 m run.
    stairs: { x0: -12.1, x1: -10.7, zBottom: -6.2, zTop: -10.4, steps: 16 },
    railHeight: 1.08,
    columnZ: [-18.8, -14.7, -10.6],
    table: { x: -11.3, z: -16.6 },
    stools: [{ x: -11.3, z: -17.55, face: -Math.PI / 2 }, { x: -11.3, z: -15.65, face: Math.PI / 2 }],
    guest: { x: -10.1, z: -13.9 },

    /**
     * Height of the surface a walker stands on at (x, z), given the surface they stood on a frame ago.
     * Walkers follow the stairs and the deck but are never snapped onto them from the floor beneath: under the
     * deck and under the stair the level stays 0, because the candidate surface is more than a step away.
     */
    walkLevel(x, z, level) {
        const S = this.stairs, D = this.deck;
        const margin = 0.04;
        const onStairs = x >= S.x0 - margin && x <= S.x1 + margin && z <= S.zBottom && z >= S.zTop;
        if (onStairs) {
            const rise = D.top * (S.zBottom - z) / (S.zBottom - S.zTop);
            if (Math.abs(rise - level) <= 0.5) return rise;
        }
        const onDeck = x >= D.x0 && x <= D.x1 + margin && z >= D.z0 - margin && z <= D.z1 + margin;
        if (onDeck && level >= D.top - 0.5) return D.top;
        // Not on anything that can carry this height (stepped off the edge, or walking beneath): the floor.
        return 0;
    }
};
window.MezzanineLayout = MEZZANINE;

// The DJ riser's walkable top (djPlatform in createDJBooth: 6 x 4 m centred on z -18, 0.5 m high).
const DJ_RISER = { x0: -3, x1: 3, z0: -20, z1: -16, top: 0.5 };

const Mezzanine = {
    _steelMaterial(name, textures, fallback) {
        const mat = this.materialFactory.createPBRMaterial(name, {
            baseColor: [1, 1, 1], metallic: 1, roughness: 1, mutable: true
        });
        if (textures && this.textureLoader) {
            this.textureLoader.applyTexturesToMaterial(mat, textures);
        } else {
            mat.baseColor = new BABYLON.Color3(...fallback);
            mat.metallic = 0.85;
            mat.roughness = 0.5;
        }
        return mat;
    },

    createMezzanine() {
        log.info('🪜 Creating mezzanine...');
        const { deck: D, stairs: S, railHeight: RH } = MEZZANINE;
        const scene = this.scene;
        const b = this._dressingBuilder('mezz');
        const textures = this.concreteTextures || {};
        const deckGroup = b.group('Deck', this._steelMaterial('mezzDeckMat', textures.steelDeck, [0.14, 0.15, 0.15]));
        const panel = b.group('Panel', this._steelMaterial('mezzPanelMat', textures.steelPanel, [0.12, 0.1, 0.09]));
        const steel = b.group('Rails', this.materialFactory.getPreset('steelGirder'));
        const cyan = b.group('GlowCyan', this._emissive('mezzCyanMat', [0.1, 0.65, 1.0]));

        const scaleOf = key => (this.textureLoader && this.textureLoader.textureConfigs[key].scale) || { u: 1, v: 1 };
        const deckUV = mesh => this._applyWorldUVs(mesh, 1.0, scaleOf('steelDeck'));
        const panelUV = mesh => this._applyWorldUVs(mesh, 1.5, scaleOf('steelPanel'));

        // A box from point `a` to point `to`, `w` wide and `h` thick. Its long axis is local z, aimed at `to` with lookAt.
        const beam = (group, a, to, w, h, prepare) => {
            const length = Math.hypot(to[0] - a[0], to[1] - a[1], to[2] - a[2]);
            const mesh = BABYLON.MeshBuilder.CreateBox(`${group.key}_beam`, { width: w, height: h, depth: length }, scene);
            if (prepare) prepare(mesh);
            mesh.position.set((a[0] + to[0]) / 2, (a[1] + to[1]) / 2, (a[2] + to[2]) / 2);
            mesh.lookAt(new BABYLON.Vector3(to[0], to[1], to[2]));
            group.meshes.push(mesh);
            return mesh;
        };

        const deckLength = D.z1 - D.z0;
        const deckWidth = D.x1 - D.x0;
        const midZ = (D.z0 + D.z1) / 2;

        // Deck plate, edge beams and joists underneath.
        b.box(deckGroup, deckWidth, D.thickness, deckLength, (D.x0 + D.x1) / 2, D.top - D.thickness / 2, midZ, deckUV);
        const beamY = D.top - D.thickness - 0.11;
        b.box(panel, 0.1, 0.22, deckLength, D.x1 - 0.05, beamY, midZ, panelUV);
        b.box(panel, deckWidth, 0.22, 0.1, (D.x0 + D.x1) / 2, beamY, D.z0 + 0.05, panelUV);
        b.box(panel, S.x1 - D.x0 + 0.05, 0.22, 0.1, (D.x0 + S.x1) / 2, beamY, D.z1 - 0.05, panelUV);
        for (let z = D.z0 + 0.8; z < D.z1 - 0.3; z += 1.05) b.box(panel, deckWidth - 0.2, 0.16, 0.06, (D.x0 + D.x1) / 2, beamY + 0.03, z, panelUV);

        // Columns on the dance-floor edge, with base plates and an X of bracing between each pair.
        const columnX = D.x1 - 0.06;
        const columnTop = beamY - 0.11;
        for (const z of MEZZANINE.columnZ) {
            b.box(panel, 0.14, columnTop, 0.14, columnX, columnTop / 2, z, panelUV);
            b.box(panel, 0.34, 0.025, 0.34, columnX, 0.0125, z, panelUV);
        }
        // The X-bracing is visual only: a walker under the deck passes between the columns without the diagonals
        // sliding the camera up.
        const braces = b.group('Braces', this.materialFactory.getPreset('steelGirder'));
        for (let i = 0; i < MEZZANINE.columnZ.length - 1; i++) {
            const za = MEZZANINE.columnZ[i], zb = MEZZANINE.columnZ[i + 1];
            beam(braces, [columnX, 0.25, za], [columnX, columnTop - 0.1, zb], 0.05, 0.05);
            beam(braces, [columnX, 0.25, zb], [columnX, columnTop - 0.1, za], 0.05, 0.05);
        }

        // Stairs: two stringers, open risers, tread plates with a cyan nosing strip on each.
        const run = S.zBottom - S.zTop;
        const riser = D.top / S.steps;
        const tread = run / (S.steps - 1);
        const yNose = z => riser + (S.zBottom - z) * (riser / tread);
        const stairCentre = (S.x0 + S.x1) / 2;
        const stairWidth = S.x1 - S.x0;
        for (const x of [S.x0 + 0.02, S.x1 - 0.02]) {
            beam(panel, [x, yNose(S.zBottom + 0.12) - 0.24, S.zBottom + 0.12], [x, yNose(S.zTop) - 0.24, S.zTop], 0.05, 0.3, panelUV);
        }
        const treadCentres = [];
        for (let i = 1; i < S.steps; i++) {
            const zFront = S.zBottom - (i - 1) * tread;
            const zc = zFront - tread / 2;
            treadCentres.push({ z: zc, y: i * riser });
            b.box(deckGroup, stairWidth, 0.05, tread, stairCentre, i * riser - 0.025, zc, deckUV);
            b.box(cyan, stairWidth - 0.04, 0.012, 0.02, stairCentre, i * riser + 0.006, zFront - 0.014);
        }

        // Rails: deck edge, deck ends, and both sides of the stair. Posts, a top rail and two lower rails.
        const post = (x, y0, z, height = RH) => b.box(steel, 0.05, height, 0.05, x, y0 + height / 2, z);
        const rails = (from, to, yOf) => {
            [RH, RH * 2 / 3, RH / 3].forEach((lift, k) => {
                beam(steel, [from[0], yOf(from) + lift, from[1]], [to[0], yOf(to) + lift, to[1]], k === 0 ? 0.06 : 0.03, k === 0 ? 0.05 : 0.03);
            });
        };
        const flat = () => D.top;
        const edgeX = D.x1 - 0.04;
        const edgePosts = 9;
        for (let i = 0; i < edgePosts; i++) post(edgeX, D.top, D.z0 + 0.05 + (deckLength - 0.1) * i / (edgePosts - 1));
        rails([edgeX, D.z0 + 0.05], [edgeX, D.z1 - 0.05], flat);
        b.box(panel, 0.02, 0.16, deckLength - 0.1, edgeX, D.top + 0.08, midZ, panelUV);
        for (const x of [D.x0 + 0.05, (D.x0 + D.x1) / 2, edgeX]) post(x, D.top, D.z0 + 0.05);
        rails([D.x0 + 0.05, D.z0 + 0.05], [edgeX, D.z0 + 0.05], flat);
        for (const x of [S.x1 + 0.02, (S.x1 + edgeX) / 2, edgeX]) post(x, D.top, D.z1 - 0.05);
        rails([S.x1 + 0.02, D.z1 - 0.05], [edgeX, D.z1 - 0.05], flat);
        for (const x of [S.x0 + 0.02, S.x1 - 0.02]) {
            for (const index of [0, 3, 6, 9, 12, 14]) {
                const c = treadCentres[index];
                post(x, c.y, c.z, RH + (yNose(c.z) - c.y));
            }
            rails([x, S.zBottom + 0.1], [x, S.zTop], point => yNose(point[1]));
        }

        // Tread-plate collision matters only for the deck and the rails; the LED strip under the deck edge.
        b.box(cyan, 0.03, 0.015, deckLength - 0.3, D.x1 - 0.015, beamY - 0.125, midZ);

        // A high table with two stools on the deck.
        const table = MEZZANINE.table;
        const tableY = D.top;
        b.cylinder(panel, 0.78, 0.04, table.x, tableY + 1.05, table.z, 'y', 24);
        b.cylinder(panel, 0.09, 1.03, table.x, tableY + 0.53, table.z, 'y', 12);
        b.cylinder(panel, 0.5, 0.03, table.x, tableY + 0.015, table.z, 'y', 20);

        const built = b.finish({ collide: ['Deck', 'Panel', 'Rails'] });
        this._mezzMeshes = Object.values(built);
        // Deck plate and every stair tread, in one mesh: the VR teleport accepts it as a floor (see
        // VRClubUI._teleportFloorMeshes), so the balcony and the stair can be reached from the headset.
        this._mezzDeck = built.Deck || null;
        this._mezzLight = this._createScopedAccent('balconyLight', new BABYLON.Vector3(-10.9, 4.7, -14.7),
            { intensity: 1.2, range: 8, diffuse: [1, 0.92, 0.8], group: 'mezzanine' }, this._mezzMeshes);

        // Walkers follow the stair and the deck, on the desktop and in the headset alike.
        this._walkLevel = this._walkLevel || 0;
        this._walkSurfaceObserver = scene.onBeforeRenderObservable.add(() => this._updateWalkSurface());

        // Furniture and guest-side blockers.
        this._collisionBlock('mezzTableBlock', 0.8, 1.1, 0.8, table.x, D.top + 0.55, table.z);
        for (const [i, stool] of MEZZANINE.stools.entries()) this._collisionBlock(`mezzStoolBlock${i}`, 0.46, 1.1, 0.46, stool.x, D.top + 0.55, stool.z);
        if (this.modelLoadPromise) this.modelLoadPromise.then(() => { if (!this._disposed) this._furnishMezzanine(); });
        log.info('🪜 Mezzanine created');
    },

    /** Stand the bar's stool model on the deck (instances of the same GLB: no extra draw calls or downloads). */
    _furnishMezzanine() {
        const record = this.modelLoader && this.modelLoader.loadedModels && this.modelLoader.loadedModels.bar_stool;
        if (!record || !record.rootMesh) return;
        const { container, rootMesh } = record;
        const placed = [];
        MEZZANINE.stools.forEach((stool, index) => {
            const entry = container.instantiateModelsToScene(name => `mezzStool${index}_${name}`, false, { doNotInstantiate: false });
            const root = entry.rootNodes[0];
            if (!root) return;
            root.position.x = stool.x;
            root.position.y = rootMesh.position.y + MEZZANINE.deck.top;
            root.position.z = stool.z;
            root.rotation.y = rootMesh.rotation.y + stool.face;
            root.computeWorldMatrix(true);
            root.getChildMeshes().forEach(mesh => { mesh.isPickable = false; placed.push(mesh); });
        });
        this._extendAccentLight(this._mezzLight, placed);
        this._mezzStools = placed;
    },

    _updateWalkSurface() {
        const camera = this.isInVRMode && this.vrHelper && this.vrHelper.baseExperience
            ? this.vrHelper.baseExperience.camera : this.camera;
        if (!camera) return;
        if (this.isInVRMode) {
            this._updateVRWalkSurface(camera);
            return;
        }
        const level = this._walkLevel || 0;
        const next = MEZZANINE.walkLevel(camera.position.x, camera.position.z, level);
        if (next === level) return;
        // Desktop has no gravity. Climbing, the collision system already slides the camera up the stair, so only the
        // level is recorded; descending, nothing pulls the eye down, so it follows the surface.
        if (next < level) camera.position.y += next - level;
        else if (camera.position.y < next + 1.0) camera.position.y = next + 1.7;
        this._walkLevel = next;
    },

    /**
     * The headset stands on whatever is under its feet. Nothing else carries an XR camera up a stair or holds it on
     * a deck (its collision ellipsoid hangs from the eye and the teleport only knows the surface it landed on), so
     * this owns the height: smooth locomotion climbs the stair tread by tread, a teleport onto the deck or the stair
     * is kept there, and walking off the edge drops the headset to the floor.
     *
     * The surface is looked up from where the FEET are now (eye minus tracked eye height), not stepped from the
     * last recorded level, because a teleport moves the feet a whole storey in one frame. Crouching lowers the eye
     * and the tracked height together, so it leaves the feet, and this, alone. A jump owns the height in flight.
     */
    _updateVRWalkSurface(camera) {
        if (this.jumpState && this.jumpState.active) return;
        const eye = this._xrHeadHeight();
        const feet = camera.position.y - eye;
        const x = camera.position.x, z = camera.position.z;
        let next = MEZZANINE.walkLevel(x, z, feet);
        // The DJ riser (djPlatform: 6 x 4 m, top 0.5) is the other raised floor a headset can stand on: the DJ Booth
        // destination puts it there.
        const R = DJ_RISER;
        if (next === 0 && x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1 && Math.abs(feet - R.top) < 0.3) next = R.top;
        if (Math.abs(feet - next) > 0.02) camera.position.y = next + eye;
        this._walkLevel = next;
    },

    /**
     * The headset's height above the physical floor. WebXRCamera.realWorldHeight reads the XR frame and throws
     * (InvalidStateError) when read outside the frame callback, which a scene observer can be: it threw on every
     * frame and the balcony follow never ran. Sample it inside the XR frame instead and keep the last value.
     */
    _xrHeadHeight() {
        const sessionManager = this.vrHelper && this.vrHelper.baseExperience && this.vrHelper.baseExperience.sessionManager;
        if (sessionManager && this._xrHeightSource !== sessionManager) {
            this._xrHeightSource = sessionManager;
            sessionManager.onXRFrameObservable.add(frame => {
                try {
                    const pose = frame.getViewerPose(sessionManager.baseReferenceSpace);
                    if (pose) this._xrEyeHeight = pose.transform.position.y * (sessionManager.worldScalingFactor || 1);
                } catch (_) { /* a frame without a pose keeps the last height */ }
            });
        }
        return this._xrEyeHeight > 0.3 ? this._xrEyeHeight : 1.6;
    }
};
window.Mezzanine = Mezzanine;
