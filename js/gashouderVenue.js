'use strict';

const GASHOUDER_VENUE = Object.freeze({
    id: 'gashouder',
    dimensions: Object.freeze({
        diameter: 53.8,
        radius: 26.9,
        innerRadius: 26.4,
        outerWallHeight: 10,
        centreHeight: 14.5,
        structuralBays: 40
    }),
    vrEntry: Object.freeze({ x: 0, z: 23 }),
    seating: Object.freeze({
        radius: 23.2,
        stoolOffset: 0.95,
        seatHeight: 0.76,
        angles: Object.freeze([-1.4, 1.4, 2.1])
    }),
    stage: Object.freeze({
        x: 0,
        z: -19.5,
        width: 18,
        depth: 9,
        height: 1.8,
        consoleZ: -19.2,
        consoleTop: 2.7,
        stairWidth: 2.4,
        stairDepth: 0.3,
        stairSteps: 12,
        stairZ: -16.8,
        deckThickness: 0.06
    }),
    rig: Object.freeze({
        radius: 15.5,
        centreY: 10.6,
        mountY: 10.3,
        segments: 48,
        stageBridgeZ: -15.2,
        stageBridgeWidth: 20,
        stageBridgeSegments: 16,
        stageBridgeY: 9.8,
        stageMountY: 9.5,
        ringFixtureCount: 18,
        stageFixtureCount: 6,
        fixtureCount: 24,
        fixtureGroups: 6,
        ringStrobeCount: 8,
        stageStrobeCount: 4,
        strobeCount: 12,
        ringLaserCount: 6,
        stageLaserCount: 2,
        laserCount: 8,
        fogMachineCount: 8,
        ceilingRadialSegments: 4,
        ceilingRingCounts: Object.freeze([16, 24, 32, 40]),
        ledWall: Object.freeze({
            cols: 72,
            rows: 16,
            panelWidth: 0.62,
            panelHeight: 9.2 / 16,
            seam: 0.04,
            baseY: 0.6,
            centerZ: -24.9,
            curveRadius: 25.8
        })
    }),
    presetNames: Object.freeze(['architectural', 'soundcheck', 'techno', 'awakenings', 'custom']),
    crowdSources: Object.freeze([
        'f1', 'm2', 'vm1', 'm1', 'f3', 'f2', 'm3', 'f4', 'vf1', 'm7', 'f5', 'vm2', 'm5', 'm9',
        'vf2', 'vf3', 'vf5', 'vf6', 'vf7', 'vm3', 'vm4', 'vm5', 'vm6', 'vm7'
    ]),
    maxDancers: 200
});

const GASHOUDER_PRESETS = Object.freeze({
    architectural: Object.freeze({ stage: false, rig: false, lights: false, lasers: false, haze: false, led: false, crowd: 0, guests: 0 }),
    soundcheck: Object.freeze({ stage: true, rig: true, lights: true, lasers: false, haze: false, led: true, crowd: 2, guests: 0 }),
    techno: Object.freeze({ stage: true, rig: true, lights: true, lasers: true, haze: true, led: true }),
    awakenings: Object.freeze({ stage: true, rig: true, lights: true, lasers: true, haze: true, led: true }),
    custom: Object.freeze({ stage: true, rig: true, lights: true, lasers: true, haze: true, led: true })
});

const CROWD_POINTS = Object.freeze([
    [-7, -12], [-3, -12], [3, -12], [7, -12],
    [-10, -7], [-5, -7], [0, -7], [5, -7], [10, -7],
    [-8, -2], [-3, -2], [3, -2], [8, -2], [0, 5],
    [-15, -16], [15, -16], [-11, -12], [11, -12],
    [-7.5, -7], [-2.5, -7], [2.5, -7], [7.5, -7],
    [-11, -2], [11, -2]
]);

const GUEST_IDS = Object.freeze(['m4', 'f6', 'f7', 'f8', 'm8', 'm6']);
const GUEST_ANGLES = Object.freeze([-2.2, -1.6, -1.0, -0.45, 0.45, 1.0]);

function beamBetween(scene, name, start, end, diameter, tessellation = 8) {
    const delta = end.subtract(start);
    const length = delta.length();
    if (!Number.isFinite(length) || length <= 0.001) return null;
    const beam = BABYLON.MeshBuilder.CreateCylinder(name, {
        height: length,
        diameter,
        tessellation
    }, scene);
    beam.position = start.add(end).scale(0.5);
    const rotation = BABYLON.Quaternion.Identity();
    BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.Up(), delta.scale(1 / length), rotation);
    beam.rotationQuaternion = rotation;
    beam.isPickable = false;
    return beam;
}

function mergeStatic(parts, name, material, collision = false) {
    if (!parts.length) return null;
    const mesh = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
    if (!mesh) throw new Error(`Could not create ${name}.`);
    mesh.name = name;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = collision;
    mesh.receiveShadows = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
}

function roofHeight(radius) {
    const d = GASHOUDER_VENUE.dimensions;
    return d.centreHeight - (d.centreHeight - d.outerWallHeight) * Math.max(0, Math.min(1, radius / d.innerRadius));
}

function createRoofRing(scene, name, radius, thickness) {
    const sweep = 128;
    const section = 32;
    const source = BABYLON.VertexData.CreateTorus({ diameter: radius * 2, thickness, tessellation: sweep });
    const data = new BABYLON.VertexData();
    data.positions = [];
    data.normals = [];
    data.uvs = [];
    data.indices = [];
    for (let i = 0; i <= sweep; i++) {
        for (let j = 0; j <= section; j++) {
            const sourceIndex = i * (sweep + 1) + j * (sweep / section);
            data.positions.push(...source.positions.slice(sourceIndex * 3, sourceIndex * 3 + 3));
            data.normals.push(...source.normals.slice(sourceIndex * 3, sourceIndex * 3 + 3));
            data.uvs.push(...source.uvs.slice(sourceIndex * 2, sourceIndex * 2 + 2));
            if (i < sweep && j < section) {
                const current = i * (section + 1) + j;
                const next = current + section + 1;
                data.indices.push(current, current + 1, next, current + 1, next + 1, next);
            }
        }
    }
    const ring = new BABYLON.Mesh(name, scene);
    data.applyToMesh(ring);
    return ring;
}

function createRoofPanels(scene, material, dimensions) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const radialSteps = 10;
    const step = Math.PI * 2 / dimensions.structuralBays;
    const innerRadius = 1.8;
    const outerRadius = dimensions.innerRadius;
    for (let bay = 0; bay < dimensions.structuralBays; bay++) {
        const start = -Math.PI + bay * step + 0.006;
        const end = -Math.PI + (bay + 1) * step - 0.006;
        const base = positions.length / 3;
        for (let ring = 0; ring <= radialSteps; ring++) {
            const radius = innerRadius + (outerRadius - innerRadius) * ring / radialSteps;
            for (const angle of [start, end]) {
                positions.push(
                    Math.sin(angle) * radius,
                    roofHeight(radius) + 0.34,
                    Math.cos(angle) * radius
                );
                uvs.push(Math.sin(angle) * radius / 8, Math.cos(angle) * radius / 8);
            }
        }
        for (let ring = 0; ring < radialSteps; ring++) {
            const current = base + ring * 2;
            const next = current + 2;
            indices.push(current, next, next + 1, current, next + 1, current + 1);
        }
    }

    const normals = [];
    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
    const panels = new BABYLON.Mesh('gashouderRoofPanels', scene);
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(panels, false);
    panels.material = material;
    panels.isPickable = false;
    panels.checkCollisions = false;
    panels.receiveShadows = false;
    panels.freezeWorldMatrix();
    panels.doNotSyncBoundingInfo = true;
    return panels;
}

const GashouderVenue = {
    getGashouderPreset() {
        return GASHOUDER_PRESETS[this.gashouderPreset] ? this.gashouderPreset : 'techno';
    },

    getGashouderCrowdLimit() {
        const presetLimit = GASHOUDER_PRESETS[this.getGashouderPreset()].crowd;
        return Number.isInteger(presetLimit)
            ? Math.min(GASHOUDER_VENUE.maxDancers, presetLimit)
            : GASHOUDER_VENUE.maxDancers;
    },

    getGashouderCrowdSize(requested = this.tierSettings.crowdSize) {
        const desired = Number.isInteger(this.gashouderCrowdOverride)
            ? this.gashouderCrowdOverride
            : requested;
        return Math.min(this.getGashouderCrowdLimit(), Math.max(0, desired | 0));
    },

    setGashouderCrowdCount(count) {
        if (this.venueId !== 'gashouder') throw new Error('Gashouder crowd settings are only available in Gashouder.');
        if (count !== null && (!Number.isInteger(count) || count < 0 || count > GASHOUDER_VENUE.maxDancers)) {
            this.showErrorMessage?.(`Choose a whole number from 0 to ${GASHOUDER_VENUE.maxDancers}.`);
            return false;
        }

        try {
            if (count === null) localStorage.removeItem('vrclub.gashouderCrowdCount');
            else localStorage.setItem('vrclub.gashouderCrowdCount', String(count));
        } catch (error) {
            console.error('Could not save the Gashouder dancer count.', error);
            this.showErrorMessage?.('Could not save the Gashouder dancer count on this device.');
            return false;
        }

        this.gashouderCrowdOverride = count;
        this._applyCrowdSize();
        if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('gashoudercrowdchange'));
        }
        return true;
    },

    getGashouderGuestSize(requested = this.tierSettings.guestSize) {
        const presetLimit = GASHOUDER_PRESETS[this.getGashouderPreset()].guests;
        if (presetLimit === 0) return 0;
        if (Number.isInteger(presetLimit)) return Math.min(presetLimit, Math.max(0, requested | 0));
        return Math.max(0, requested | 0);
    },

    gashouderCrowdSlots(sourceIndex) {
        const stage = GASHOUDER_VENUE.stage;
        const points = CROWD_POINTS.map(point => [...point]);
        const candidates = [];
        const spacing = 1.65;
        const guests = this.gashouderGuestSlots(id => id);
        for (let row = -12; row <= 12; row++) {
            for (let col = -12; col <= 12; col++) {
                const x = col * spacing + (Math.abs(row) % 2) * spacing / 2;
                const z = row * spacing;
                if (Math.hypot(x, z) > 19.5 || (Math.abs(x) < 1.9 && z > -16 && z < -9)) continue;
                if (Math.abs(x - stage.x) < stage.width / 2 + 0.9 &&
                    Math.abs(z - stage.z) < stage.depth / 2 + 0.9) continue;
                if (Math.abs(x) < stage.width / 2 + stage.stairSteps * stage.stairDepth + 0.9 &&
                    Math.abs(x) > stage.width / 2 - 0.9 &&
                    Math.abs(z - stage.stairZ) < stage.stairWidth / 2 + 0.9) continue;
                let nearest = Infinity;
                for (const [px, pz] of points) nearest = Math.min(nearest, Math.hypot(x - px, z - pz));
                for (const guest of guests) nearest = Math.min(nearest, Math.hypot(x - guest.x, z - guest.z));
                if (nearest >= spacing) candidates.push({ x, z, nearest });
            }
        }
        while (points.length < GASHOUDER_VENUE.maxDancers && candidates.length) {
            let best = 0;
            for (let i = 1; i < candidates.length; i++) {
                if (candidates[i].nearest > candidates[best].nearest) best = i;
            }
            const chosen = candidates.splice(best, 1)[0];
            points.push([chosen.x, chosen.z]);
            for (const candidate of candidates) {
                candidate.nearest = Math.min(candidate.nearest, Math.hypot(candidate.x - chosen.x, candidate.z - chosen.z));
            }
        }
        if (points.length !== GASHOUDER_VENUE.maxDancers) throw new Error('Not enough safe Gashouder dancer positions.');
        return points.map(([x, z], index) => {
            const yaw = Math.atan2(stage.x - x, stage.z - z);
            const source = index < GASHOUDER_VENUE.crowdSources.length ? index : (index * 7) % GASHOUDER_VENUE.crowdSources.length;
            return {
                x, z, src: sourceIndex(GASHOUDER_VENUE.crowdSources[source]),
                height: 1.62 + (index % 5) * 0.055,
                facing: yaw - Math.PI
            };
        });
    },

    gashouderStairHeight(x, z) {
        const stage = GASHOUDER_VENUE.stage;
        const distance = Math.abs(x - stage.x) - stage.width / 2;
        const run = stage.stairSteps * stage.stairDepth;
        if (distance < 0 || distance > run || Math.abs(z - stage.stairZ) > stage.stairWidth / 2) return null;
        const step = Math.min(stage.stairSteps - 1, Math.max(0, Math.floor((run - distance) / stage.stairDepth)));
        return stage.height * (step + 1) / stage.stairSteps;
    },

    gashouderGuestSlots(sourceIndex) {
        const radius = 21.3;
        const stage = GASHOUDER_VENUE.stage;
        return GUEST_IDS.map((id, index) => {
            const angle = GUEST_ANGLES[index];
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;
            return {
                src: sourceIndex(id),
                clip: 'Idle_Loop',
                x, z,
                yaw: Math.atan2(stage.x - x, stage.z - z),
                height: 1.66 + (index % 3) * 0.07,
                ambient: { yawRange: 0.12, speedVariation: 0.035, period: 20 + index * 2, phase: index * 0.7 }
            };
        });
    },

    gashouderSeatingLayout() {
        const { seating, stage } = GASHOUDER_VENUE;
        return seating.angles.map((angle, index) => {
            const x = Math.sin(angle) * seating.radius;
            const z = Math.cos(angle) * seating.radius;
            const stools = [-1, 1].map((side, seatIndex) => {
                const sx = x + side * seating.stoolOffset * Math.cos(angle);
                const sz = z - side * seating.stoolOffset * Math.sin(angle);
                const facing = Math.atan2(stage.x - sx, stage.z - sz);
                return {
                    id: `gashouder-${index}-${seatIndex}`, x: sx, z: sz, facing,
                    viewX: sx - Math.sin(facing) * 0.5,
                    viewZ: sz - Math.cos(facing) * 0.5
                };
            });
            return { x, z, stools };
        });
    },

    configureGashouderCamera() {
        if (!this.camera) return;
        this.camera.position.set(0, 1.65, 7);
        this.camera.setTarget(new BABYLON.Vector3(0, 4.5, GASHOUDER_VENUE.stage.z));
    },

    configureGashouderModelConfigs(configs) {
        const preset = GASHOUDER_PRESETS[this.getGashouderPreset()];
        const keep = ['bar_stool', ...(preset.stage
            ? ['dj_console', 'dj_monitor', 'pa_speaker_left', 'pa_speaker_right', 'bass_bin_left', 'bass_bin_right']
            : [])];
        const selected = Object.fromEntries(keep.filter(key => configs[key]).map(key => [key, {
            ...configs[key],
            placement: configs[key].placement ? { ...configs[key].placement } : undefined,
            rigging: configs[key].rigging ? { ...configs[key].rigging } : undefined
        }]));
        if (selected.bar_stool) {
            const first = this.gashouderSeatingLayout()[0].stools[0];
            selected.bar_stool.placement.centerX = first.x;
            selected.bar_stool.placement.centerZ = first.z;
            selected.bar_stool.rotation = new BABYLON.Vector3(0, first.facing - Math.PI / 2, 0);
        }
        if (!preset.stage) return selected;
        const deck = selected.dj_console;
        if (deck) {
            deck.placement.centerX = 0;
            // Sit in the operator's rear half of the 1.2m deep table (z -19.8..-18.6) so the DJ's hips/legs
            // stand cleanly behind the table face (z = -19.8) with zero leg clipping while arms reach the decks.
            deck.placement.centerZ = GASHOUDER_VENUE.stage.consoleZ - 0.28;
            deck.placement.bottomY = GASHOUDER_VENUE.stage.consoleTop;
        }
        const monitor = selected.dj_monitor;
        if (monitor) {
            monitor.placement.centerX = -0.82;
            monitor.placement.centerZ = GASHOUDER_VENUE.stage.consoleZ + 0.24;
            monitor.placement.bottomY = GASHOUDER_VENUE.stage.consoleTop;
        }
        for (const [key, x] of [['pa_speaker_left', -10], ['pa_speaker_right', 10]]) {
            const speaker = selected[key];
            if (!speaker) continue;
            speaker.placement.centerX = x;
            speaker.placement.centerZ = -11.85; // On the 15.5m circular truss: hypot(10, 11.85) = 15.50m
            speaker.placement.topY = GASHOUDER_VENUE.rig.centreY;
            speaker.rigging.anchorY = GASHOUDER_VENUE.rig.centreY;
        }
        // Rear delay / perimeter PA stacks on the opposite (+Z) side of the 15.5m circular truss,
        // rotated to face INTO the central & rear hall (-Z / inward) rather than into the rear brick wall!
        const vec3 = (x, y, z) => typeof BABYLON !== 'undefined' && BABYLON.Vector3
            ? new BABYLON.Vector3(x, y, z)
            : { x, y, z, clone() { return vec3(this.x, this.y, this.z); } };
        const rearZ = 11.85; // hypot(10, 11.85) = 15.504m — right on the circular event truss!
        for (const [sourceKey, rearKey, binSourceKey, binRearKey, x, toeSign] of [
            ['pa_speaker_left', 'pa_speaker_rear_left', 'bass_bin_left', 'bass_bin_rear_left', -10, -1],
            ['pa_speaker_right', 'pa_speaker_rear_right', 'bass_bin_right', 'bass_bin_rear_right', 10, 1]
        ]) {
            const baseSpeaker = selected[sourceKey];
            const baseBin = selected[binSourceKey];
            if (baseSpeaker) {
                selected[rearKey] = {
                    ...baseSpeaker,
                    name: `PA Speaker (Rear ${x < 0 ? 'Left' : 'Right'})`,
                    // Local -z is the speaker horn/grill; in left-handed Babylon, rotation (-PI/6, toeSign*PI/6, 0)
                    // pitches local -z downward (y = -0.5) and aims inward (-z = -0.75) across the rear & central dancefloor!
                    rotation: vec3(-Math.PI / 6, toeSign * (Math.PI / 6), 0),
                    scale: baseSpeaker.scale ? baseSpeaker.scale.clone() : vec3(1, 1, 1),
                    placement: {
                        ...baseSpeaker.placement,
                        centerX: x,
                        centerZ: rearZ,
                        topY: GASHOUDER_VENUE.rig.centreY
                    },
                    rigging: {
                        anchorY: GASHOUDER_VENUE.rig.centreY,
                        yaw: Math.PI + toeSign * (Math.PI / 6)
                    }
                };
            }
            if (baseBin) {
                selected[binRearKey] = {
                    ...baseBin,
                    name: `Bass Bin (Rear ${x < 0 ? 'Left' : 'Right'})`,
                    hangFrom: rearKey,
                    rotation: baseBin.rotation ? baseBin.rotation.clone() : vec3(0, 0, 0),
                    scale: baseBin.scale ? baseBin.scale.clone() : vec3(1, 1, 1),
                    placement: { ...baseBin.placement }
                };
            }
        }
        return selected;
    },

    createGashouderFloor() {
        const floor = BABYLON.MeshBuilder.CreateCylinder('gashouderFloor', {
            diameter: GASHOUDER_VENUE.dimensions.diameter - 0.25,
            height: 0.12,
            tessellation: 128,
            subdivisions: 1
        }, this.scene);
        floor.position.y = -0.06;
        floor.isPickable = true;
        floor.checkCollisions = true;
        const material = this.materialFactory.getPreset('floorConcrete');
        if (this.concreteTextures?.floor) {
            this.textureLoader.applyTexturesToMaterial(material, this.concreteTextures.floor);
        }
        this._applyWorldUVs(floor, 5, this.textureLoader?.textureConfigs?.floor?.scale || { u: 1, v: 1 });
        floor.material = material;
        floor.receiveShadows = !!this.tierSettings.floorShadows;
        floor.freezeWorldMatrix();
        floor.doNotSyncBoundingInfo = true;
        this.floorMesh = floor;
    },

    createGashouderArchitecture() {
        const { dimensions } = GASHOUDER_VENUE;
        const wallMaterial = this.materialFactory.getPreset('brick');
        if (this.concreteTextures?.walls) {
            this.textureLoader.applyTexturesToMaterial(wallMaterial, this.concreteTextures.walls);
        }

        const wallParts = [];
        const bays = dimensions.structuralBays;
        const step = Math.PI * 2 / bays;
        const wallRadius = dimensions.innerRadius;
        const bayWidth = wallRadius * 2 * Math.tan(step / 2);
        const doorWidth = 3;
        const doorHeight = 4;
        const makePanel = (name, width, height, depth, angle, tangentOffset, y) => {
            const panel = BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
            panel.rotation.y = angle;
            panel.position.set(
                Math.sin(angle) * (wallRadius - depth / 2) + Math.cos(angle) * tangentOffset,
                y,
                Math.cos(angle) * (wallRadius - depth / 2) - Math.sin(angle) * tangentOffset
            );
            this._applyWorldUVs(panel, 1.5, this.textureLoader?.textureConfigs?.walls?.scale || { u: 1, v: 1 });
            wallParts.push(panel);
        };

        for (let bay = 0; bay < bays; bay++) {
            const angle = -Math.PI + bay * step;
            const isDoorBay = bay === 0 || bay === bays / 2;
            if (!isDoorBay) {
                makePanel(`gashouderWallBay${bay}`, bayWidth, dimensions.outerWallHeight, 0.72, angle, 0, dimensions.outerWallHeight / 2);
            } else {
                const jambWidth = (bayWidth - doorWidth) / 2;
                for (const side of [-1, 1]) {
                    makePanel(`gashouderDoorJamb${bay}_${side}`, jambWidth, dimensions.outerWallHeight, 0.72, angle,
                        side * (doorWidth / 2 + jambWidth / 2), dimensions.outerWallHeight / 2);
                }
                makePanel(`gashouderDoorLintel${bay}`, doorWidth, dimensions.outerWallHeight - doorHeight, 0.72, angle, 0,
                    (dimensions.outerWallHeight + doorHeight) / 2);
            }
        }

        for (let bay = 0; bay < bays; bay++) {
            const angle = -Math.PI + (bay + 0.5) * step;
            const pier = BABYLON.MeshBuilder.CreateBox(`gashouderBrickPier${bay}`, {
                width: 0.28, height: dimensions.outerWallHeight, depth: 0.34
            }, this.scene);
            this._applyWorldUVs(pier, 1.5, this.textureLoader?.textureConfigs?.walls?.scale || { u: 1, v: 1 });
            pier.rotation.y = angle;
            pier.position.set(
                Math.sin(angle) * (wallRadius - 0.74),
                dimensions.outerWallHeight / 2,
                Math.cos(angle) * (wallRadius - 0.74)
            );
            wallParts.push(pier);
        }
        const wall = mergeStatic(wallParts, 'gashouderBrickShell', wallMaterial, true);
        wall.receiveShadows = false;

        const steel = this.materialFactory.getPreset('steelGirder');
        const roofParts = [];
        const ringParts = [];
        const ringRadii = [3.2, 8.5, 14.2, 19.5, dimensions.innerRadius];
        ringRadii.forEach((radius, index) => {
            const ring = createRoofRing(this.scene, `gashouderRoofRing${index}`, radius,
                index === ringRadii.length - 1 ? 0.28 : 0.2);
            ring.position.y = roofHeight(radius);
            ringParts.push(ring);
        });

        for (let bay = 0; bay < bays; bay++) {
            const angle = Math.PI * 2 * bay / bays;
            const point = (radius, offset, rise) => new BABYLON.Vector3(
                Math.sin(angle) * radius + Math.cos(angle) * offset,
                roofHeight(radius) + rise,
                Math.cos(angle) * radius - Math.sin(angle) * offset
            );
            for (const tangent of [-0.18, 0.18]) {
                for (const vertical of [-0.18, 0.18]) {
                    const beam = beamBetween(this.scene, `gashouderRadialChord_${bay}_${tangent}_${vertical}`,
                        point(3.2, tangent, vertical), point(dimensions.innerRadius, tangent, vertical), 0.085, 8);
                    if (beam) roofParts.push(beam);
                }
            }
            for (let brace = 0; brace < 4; brace++) {
                const r0 = 3.2 + (dimensions.innerRadius - 3.2) * brace / 4;
                const r1 = 3.2 + (dimensions.innerRadius - 3.2) * (brace + 1) / 4;
                for (const side of [-1, 1]) {
                    const diagonal = beamBetween(this.scene, `gashouderRadialBrace_${bay}_${brace}_${side}`,
                        point(r0, side * 0.18, 0.18), point(r1, -side * 0.18, -0.18), 0.045, 6);
                    if (diagonal) roofParts.push(diagonal);
                }
            }
        }

        mergeStatic(ringParts, 'gashouderCircularRoofRings', steel);
        mergeStatic(roofParts, 'gashouderRadialRoofTrusses', steel);
        createRoofPanels(this.scene, this.materialFactory.getPreset('ceiling'), dimensions);
        const hub = BABYLON.MeshBuilder.CreateCylinder('gashouderRoofHub', {
            diameter: 2.8, height: 0.65, tessellation: 48
        }, this.scene);
        hub.position.y = dimensions.centreHeight - 0.35;
        hub.material = steel;
        hub.isPickable = false;
        hub.freezeWorldMatrix();
        hub.doNotSyncBoundingInfo = true;

        this.createGashouderDoorway(0, 'main');
        this.createGashouderDoorway(Math.PI, 'loading');
    },

    createGashouderDoorway(angle, kind) {
        const { innerRadius } = GASHOUDER_VENUE.dimensions;
        const frameMaterial = this.materialFactory.getPreset('steelGirder');
        const tangent = new BABYLON.Vector3(Math.cos(angle), 0, -Math.sin(angle));
        const centre = new BABYLON.Vector3(Math.sin(angle) * (innerRadius - 0.44), 0, Math.cos(angle) * (innerRadius - 0.44));
        const frameParts = [];
        for (const side of [-1, 1]) {
            const post = BABYLON.MeshBuilder.CreateBox(`gashouder${kind}DoorPost${side}`, {
                width: 0.12, height: 4.1, depth: 0.16
            }, this.scene);
            post.position = centre.add(tangent.scale(side * 1.58)).add(new BABYLON.Vector3(0, 2.05, 0));
            frameParts.push(post);
        }
        const header = BABYLON.MeshBuilder.CreateBox(`gashouder${kind}DoorHeader`, {
            width: 3.25, height: 0.14, depth: 0.2
        }, this.scene);
        header.rotation.y = angle;
        header.position = centre.add(new BABYLON.Vector3(0, 4.12, 0));
        frameParts.push(header);
        mergeStatic(frameParts, `gashouder${kind}DoorFrame`, frameMaterial, false);
        const door = BABYLON.MeshBuilder.CreateBox(`gashouder${kind}Door`, {
            width: 3, height: 4, depth: 0.18
        }, this.scene);
        door.position.set(Math.sin(angle) * (innerRadius - 0.35), 2, Math.cos(angle) * (innerRadius - 0.35));
        door.rotation.y = angle;
        door.material = frameMaterial;
        door.checkCollisions = true;
        door.isPickable = false;
        door.freezeWorldMatrix();
        door.doNotSyncBoundingInfo = true;
    },

    createGashouderStage() {
        const stage = GASHOUDER_VENUE.stage;
        const stageMaterial = this.materialFactory.getPreset('steelGirder');
        const deck = BABYLON.MeshBuilder.CreateBox('gashouderMainStage', {
            width: stage.width, height: stage.deckThickness, depth: stage.depth
        }, this.scene);
        deck.position.set(stage.x, stage.height - stage.deckThickness / 2, stage.z);
        deck.material = stageMaterial;
        this._applyWorldUVs(deck, 2, { u: 1, v: 1 });
        deck.checkCollisions = true;
        deck.receiveShadows = true;
        deck.freezeWorldMatrix();
        deck.doNotSyncBoundingInfo = true;

        const top = BABYLON.MeshBuilder.CreateBox('gashouderStageTop', {
            width: stage.width, height: 0.025, depth: stage.depth
        }, this.scene);
        top.position.set(stage.x, stage.height + 0.0125, stage.z);
        top.material = this.materialFactory.getPreset('platformTop');
        top.checkCollisions = true;
        top.freezeWorldMatrix();
        top.doNotSyncBoundingInfo = true;

        const table = BABYLON.MeshBuilder.CreateBox('gashouderDJTable', {
            width: 4.5, height: 0.9, depth: 1.2
        }, this.scene);
        table.position.set(0, stage.consoleTop - 0.45, stage.consoleZ);
        table.material = this.materialFactory.getPreset('table');
        table.checkCollisions = true;
        table.freezeWorldMatrix();
        table.doNotSyncBoundingInfo = true;

        // Wood worktop + full interactive VJ desk, DJ set player and 8-knob 3D DJ FX panel on the Gashouder DJ booth
        if (typeof this._barWoodMaterial === 'function') {
            const worktop = BABYLON.MeshBuilder.CreatePlane('gashouderDJWoodWorktop', { width: 4.5, height: 1.2 }, this.scene);
            worktop.rotation.x = Math.PI / 2;
            worktop.position.set(0, stage.consoleTop + 0.002, stage.consoleZ);
            worktop.material = this._barWoodMaterial();
            this._applyWorldUVs(worktop, 1, { u: 1, v: 1 });
            worktop.isPickable = false;
            worktop.freezeWorldMatrix();
            worktop.doNotSyncBoundingInfo = true;
        }
        if (typeof this.createVJDesk === 'function') {
            this.createVJDesk({ top: stage.consoleTop, frontZ: stage.consoleZ - 0.6 });
        }

        const structure = [];
        for (const x of [-stage.width / 2 + 0.18, 0, stage.width / 2 - 0.18]) {
            for (const z of [stage.z - stage.depth / 2 + 0.18, stage.z + stage.depth / 2 - 0.18]) {
                const post = BABYLON.MeshBuilder.CreateBox('gashouderStageSupport', {
                    width: 0.18, height: stage.height - stage.deckThickness, depth: 0.18
                }, this.scene);
                post.position.set(x, (stage.height - stage.deckThickness) / 2, z);
                structure.push(post);
            }
            const beam = BABYLON.MeshBuilder.CreateBox('gashouderStageGirder', {
                width: 0.18, height: 0.18, depth: stage.depth - 0.2
            }, this.scene);
            beam.position.set(x, stage.height - stage.deckThickness - 0.09, stage.z);
            structure.push(beam);
        }
        for (const z of [stage.z - stage.depth / 2 + 0.18, stage.z + stage.depth / 2 - 0.18]) {
            const beam = BABYLON.MeshBuilder.CreateBox('gashouderStageCrossGirder', {
                width: stage.width - 0.2, height: 0.18, depth: 0.18
            }, this.scene);
            beam.position.set(0, stage.height - stage.deckThickness - 0.09, z);
            structure.push(beam);
        }
        const support = mergeStatic(structure, 'gashouderStageSupports', stageMaterial, true);
        if (support) support.receiveShadows = true;

        const { stairWidth, stairDepth, stairSteps, stairZ } = stage;
        const rails = [];
        const rail = (a, b, diameter = 0.045) => {
            const mesh = beamBetween(this.scene, 'gashouderStageRailPart',
                new BABYLON.Vector3(...a), new BABYLON.Vector3(...b), diameter, 8);
            if (mesh) rails.push(mesh);
        };
        const frontZ = stage.z + stage.depth / 2 - 0.06;
        rail([-stage.width / 2, stage.height + 1.05, frontZ], [stage.width / 2, stage.height + 1.05, frontZ]);
        rail([-stage.width / 2, stage.height + 0.55, frontZ], [stage.width / 2, stage.height + 0.55, frontZ]);
        for (let x = -stage.width / 2; x <= stage.width / 2; x += 3) {
            rail([x, stage.height, frontZ], [x, stage.height + 1.05, frontZ]);
        }
        for (const side of [-1, 1]) {
            const inner = stage.width / 2;
            const outer = inner + stairSteps * stairDepth;
            for (let i = 0; i < stairSteps; i++) {
                const height = stage.height * (i + 1) / stairSteps;
                const tread = BABYLON.MeshBuilder.CreateBox(`gashouderStageStair${side < 0 ? 'Left' : 'Right'}${i}`, {
                    width: stairDepth + 0.01, height, depth: stairWidth
                }, this.scene);
                tread.position.set(stage.x + side * (outer - (i + 0.5) * stairDepth), height / 2, stairZ);
                tread.material = stageMaterial;
                this._applyWorldUVs(tread, 2, { u: 1, v: 1 });
                tread.checkCollisions = true;
                tread.collisionGroup = 2;
                tread.receiveShadows = true;
                tread.freezeWorldMatrix();
                tread.doNotSyncBoundingInfo = true;
                if (!this._mezzDeck) this._mezzDeck = tread;
            }
            for (const z of [stairZ - stairWidth / 2, stairZ + stairWidth / 2]) {
                const start = [stage.x + side * outer, 1.05, z];
                const end = [stage.x + side * inner, stage.height + 1.05, z];
                rail(start, end);
                rail([start[0], 0.55, z], [end[0], stage.height + 0.55, z]);
                for (let i = 0; i <= stairSteps; i += 3) {
                    const t = i / stairSteps;
                    const x = start[0] + (end[0] - start[0]) * t;
                    const y = stage.height * t;
                    rail([x, y, z], [x, y + 1.05, z]);
                }
            }
        }
        mergeStatic(rails, 'gashouderStageRails', stageMaterial, true);
        if (typeof document !== 'undefined') {
            const texture = new BABYLON.DynamicTexture('gashouderLowClearanceTexture', { width: 512, height: 128 }, this.scene, false);
            const ctx = texture.getContext();
            ctx.fillStyle = '#181b1e'; ctx.fillRect(0, 0, 512, 128);
            ctx.fillStyle = '#fff1aa'; ctx.textAlign = 'center'; ctx.font = 'bold 34px sans-serif';
            ctx.fillText('LOW CLEARANCE', 256, 52);
            ctx.font = '28px sans-serif'; ctx.fillText('MIND YOUR HEAD', 256, 100);
            texture.update(false);
            const material = this.materialFactory.createPBRMaterial('gashouderLowClearance', {
                baseColor: [0, 0, 0], metallic: 0, roughness: 1
            }, false);
            material.unlit = true;
            material.albedoTexture = texture;
            material.emissiveTexture = texture;
            material.emissiveColor.set(0.5, 0.5, 0.5);
            const sign = BABYLON.MeshBuilder.CreatePlane('gashouderLowClearanceSign',
                { width: 0.9, height: 0.225, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
            sign.position.set(1.5, stage.height - 0.15, frontZ + 0.02);
            sign.material = material;
            sign.isPickable = false;
            sign.freezeWorldMatrix();
            this.scene.onDisposeObservable.addOnce(() => texture.dispose());
        }
    },

    createGashouderEventTruss() {
        const { rig } = GASHOUDER_VENUE;
        const material = this.materialFactory.getPreset('truss');
        const braceMaterial = this.materialFactory.getPreset('brace');
        const chords = [];
        const bracing = [];
        const hoistParts = [];
        const angleAt = i => Math.PI * 2 * i / rig.segments;
        const ringPoint = (i, radial, vertical) => {
            const angle = angleAt(i);
            const radius = rig.radius + radial;
            return new BABYLON.Vector3(
                Math.sin(angle) * radius,
                rig.centreY + vertical,
                Math.cos(angle) * radius
            );
        };

        for (let i = 0; i < rig.segments; i++) {
            const next = i + 1;
            for (const radial of [-0.15, 0.15]) {
                for (const vertical of [-0.15, 0.15]) {
                    const beam = beamBetween(this.scene, `gashouderEventChord${i}_${radial}_${vertical}`,
                        ringPoint(i, radial, vertical), ringPoint(next, radial, vertical), 0.048, 8);
                    if (beam) chords.push(beam);
                }
            }
            for (const vertical of [-0.15, 0.15]) {
                const cross = beamBetween(this.scene, `gashouderEventCross${i}_${vertical}`,
                    ringPoint(i, -0.15, vertical), ringPoint(i, 0.15, vertical), 0.038, 6);
                if (cross) chords.push(cross);
            }
            if (i % 2 === 0) {
                const diagonal = beamBetween(this.scene, `gashouderEventBrace${i}`,
                    ringPoint(i, -0.15, 0.15), ringPoint(next, 0.15, -0.15), 0.034, 6);
                if (diagonal) bracing.push(diagonal);
            }
        }

        for (let i = 0; i < 8; i++) {
            const angle = Math.PI * 2 * i / 8;
            const radius = rig.radius;
            const roofPoint = new BABYLON.Vector3(Math.sin(angle) * radius, roofHeight(radius) - 0.25, Math.cos(angle) * radius);
            const trussPoint = new BABYLON.Vector3(Math.sin(angle) * radius, rig.centreY + 0.18, Math.cos(angle) * radius);
            this._addGashouderHoist(i, roofPoint, trussPoint, angle, hoistParts, bracing);
        }

        // Front-of-stage lighting bridge framing the DJ and curved LED backdrop
        const bridgeHalfW = rig.stageBridgeWidth / 2;
        const bridgeZ = rig.stageBridgeZ;
        const bridgeY = rig.stageBridgeY;
        const bridgeSegments = rig.stageBridgeSegments;
        const bridgePoint = (index, depthOff, vertOff) => new BABYLON.Vector3(
            -bridgeHalfW + rig.stageBridgeWidth * index / bridgeSegments,
            bridgeY + vertOff,
            bridgeZ + depthOff
        );
        for (let i = 0; i < bridgeSegments; i++) {
            const next = i + 1;
            for (const depthOff of [-0.15, 0.15]) {
                for (const vertOff of [-0.15, 0.15]) {
                    const beam = beamBetween(this.scene, `gashouderStageChord${i}_${depthOff}_${vertOff}`,
                        bridgePoint(i, depthOff, vertOff), bridgePoint(next, depthOff, vertOff), 0.048, 8);
                    if (beam) chords.push(beam);
                }
            }
            for (const vertOff of [-0.15, 0.15]) {
                const cross = beamBetween(this.scene, `gashouderStageCross${i}_${vertOff}`,
                    bridgePoint(i, -0.15, vertOff), bridgePoint(i, 0.15, vertOff), 0.036, 6);
                if (cross) chords.push(cross);
            }
            if (i % 2 === 0) {
                const diag = beamBetween(this.scene, `gashouderStageBrace${i}`,
                    bridgePoint(i, -0.15, 0.15), bridgePoint(next, 0.15, -0.15), 0.032, 6);
                if (diag) bracing.push(diag);
            }
        }
        for (const vertOff of [-0.15, 0.15]) {
            const cross = beamBetween(this.scene, `gashouderStageCross${bridgeSegments}_${vertOff}`,
                bridgePoint(bridgeSegments, -0.15, vertOff),
                bridgePoint(bridgeSegments, 0.15, vertOff), 0.036, 6);
            if (cross) chords.push(cross);
        }
        for (const x of [-bridgeHalfW + 1.5, -3.2, 3.2, bridgeHalfW - 1.5]) {
            const r = Math.hypot(x, bridgeZ);
            const roofPoint = new BABYLON.Vector3(x, roofHeight(r) - 0.25, bridgeZ);
            const bridgeTop = new BABYLON.Vector3(x, bridgeY + 0.16, bridgeZ);
            this._addGashouderHoist(`stage_${x}`, roofPoint, bridgeTop, 0, hoistParts, bracing);
        }

        mergeStatic(chords, 'gashouderCircularEventTruss', material);
        mergeStatic(bracing, 'gashouderEventTrussBracing', braceMaterial);
        mergeStatic(hoistParts, 'gashouderRigHoistMotors', material);
    },

    _addGashouderHoist(id, roofPoint, loadPoint, angle, motorParts, chainParts) {
        const centre = roofPoint.clone();
        centre.y -= 0.24;
        const housing = BABYLON.MeshBuilder.CreateBox(`gashouderHoistHousing_${id}`, {
            width: 0.46, height: 0.36, depth: 0.38
        }, this.scene);
        housing.rotation.y = angle;
        housing.position.copyFrom(centre);
        motorParts.push(housing);

        const drum = BABYLON.MeshBuilder.CreateCylinder(`gashouderHoistDrum_${id}`, {
            diameter: 0.19, height: 0.5, tessellation: 8
        }, this.scene);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(centre.x, centre.y - 0.06, centre.z);
        motorParts.push(drum);

        const motorTop = centre.clone();
        motorTop.y += 0.18;
        const motorBottom = centre.clone();
        motorBottom.y -= 0.18;
        const hanger = beamBetween(this.scene, `gashouderHoistHanger_${id}`, roofPoint, motorTop, 0.025, 6);
        const chain = beamBetween(this.scene, `gashouderHoistChain_${id}`, motorBottom, loadPoint, 0.025, 6);
        if (hanger) chainParts.push(hanger);
        if (chain) chainParts.push(chain);
    },

    createGashouderLEDInstallation() {
        const scene = this.scene;
        const { dimensions, rig } = GASHOUDER_VENUE;
        const material = this.materialFactory.createStandardMaterial('gashouderLedStripMaterial', {
            mutable: true,
            emissiveColor: [1, 1, 1],
            disableLighting: true
        });
        material.useVertexColors = true;

        // Unit linear LED batten (local Y is length, local X/Z is cross-section), mounted flush under roof steelwork
        const mesh = BABYLON.MeshBuilder.CreateBox('gashouderCeilingLedGrid', {
            width: 0.095, height: 1, depth: 0.055
        }, scene);
        mesh.material = material;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(mesh);

        const entries = [];
        const addSegment = (start, end, meta) => {
            const delta = end.subtract(start);
            const length = delta.length();
            if (!Number.isFinite(length) || length <= 0.05) return;
            const mid = start.add(end).scale(0.5);
            const rot = BABYLON.Quaternion.Identity();
            BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.Up(), delta.scale(1 / length), rot);
            const matrix = BABYLON.Matrix.Compose(new BABYLON.Vector3(1, length, 1), rot, mid);
            entries.push({ matrix, ...meta });
        };

        // 1. Radial truss battens: 40 structural bays × 4 radial segments sloping from central hub to perimeter wall
        const rInner = 3.35;
        const rOuter = dimensions.innerRadius - 0.45;
        const radialSegs = rig.ceilingRadialSegments;
        for (let bay = 0; bay < dimensions.structuralBays; bay++) {
            const angle = Math.PI * 2 * bay / dimensions.structuralBays;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            for (let seg = 0; seg < radialSegs; seg++) {
                const r0 = rInner + (rOuter - rInner) * (seg + 0.04) / radialSegs;
                const r1 = rInner + (rOuter - rInner) * (seg + 0.96) / radialSegs;
                const rMid = (r0 + r1) * 0.5;
                const p0 = new BABYLON.Vector3(sinA * r0, roofHeight(r0) - 0.24, cosA * r0);
                const p1 = new BABYLON.Vector3(sinA * r1, roofHeight(r1) - 0.24, cosA * r1);
                addSegment(p0, p1, {
                    kind: 0, // radial spoke
                    bay,
                    ring: seg,
                    rNorm: (rMid - rInner) / (rOuter - rInner),
                    angle,
                    zNorm: ((cosA * rMid) / dimensions.innerRadius + 1) * 0.5
                });
            }
        }

        // 2. Concentric roof ring battens tucked under the 4 inner steel roof rings
        const ringRadii = [3.2, 8.5, 14.2, 19.5];
        ringRadii.forEach((radius, ringIdx) => {
            const segCount = rig.ceilingRingCounts[ringIdx] || 24;
            const y = roofHeight(radius) - 0.16;
            for (let s = 0; s < segCount; s++) {
                const a0 = Math.PI * 2 * (s + 0.05) / segCount;
                const a1 = Math.PI * 2 * (s + 0.95) / segCount;
                const aMid = (a0 + a1) * 0.5;
                const p0 = new BABYLON.Vector3(Math.sin(a0) * radius, y, Math.cos(a0) * radius);
                const p1 = new BABYLON.Vector3(Math.sin(a1) * radius, y, Math.cos(a1) * radius);
                addSegment(p0, p1, {
                    kind: 1, // concentric ring
                    bay: Math.round(((aMid / (Math.PI * 2)) % 1 + 1) % 1 * dimensions.structuralBays) % dimensions.structuralBays,
                    ring: ringIdx,
                    rNorm: (radius - 3.2) / (rOuter - 3.2),
                    angle: aMid,
                    zNorm: ((Math.cos(aMid) * radius) / dimensions.innerRadius + 1) * 0.5
                });
            }
        });

        const count = entries.length;
        const matrices = new Float32Array(count * 16);
        const colors = new Float32Array(count * 4);
        const meta = new Float32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const e = entries[i];
            matrices.set(e.matrix.m, i * 16);
            colors[i * 4] = 0.08;
            colors[i * 4 + 1] = 0.14;
            colors[i * 4 + 2] = 0.25;
            colors[i * 4 + 3] = 1;
            meta[i * 6] = e.kind;
            meta[i * 6 + 1] = e.bay;
            meta[i * 6 + 2] = e.ring;
            meta[i * 6 + 3] = e.rNorm;
            meta[i * 6 + 4] = e.angle;
            meta[i * 6 + 5] = e.zNorm;
        }
        mesh.thinInstanceSetBuffer('matrix', matrices, 16, true);
        mesh.thinInstanceSetBuffer('color', colors, 4, false);

        this._gashouderLedMesh = mesh;
        this._gashouderLedMaterial = material;
        this._gashouderLedColors = colors;
        this._gashouderLedMeta = meta;
        this._gashouderLedCount = count;
        this._gashouderLedLastUpdate = 0;
        this._gashouderLedPrimary = new BABYLON.Color3(0.18, 0.45, 0.95);
        this._gashouderLedSecondary = new BABYLON.Color3(0.95, 0.25, 0.65);
        this._gashouderLedObserver = scene.onBeforeRenderObservable.add(() => this.updateGashouderLEDInstallation());
    },

    updateGashouderLEDInstallation() {
        const mesh = this._gashouderLedMesh;
        const colors = this._gashouderLedColors;
        const meta = this._gashouderLedMeta;
        if (!mesh || !colors || !meta || this._disposed) return;

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const hz = this.isInVRMode
            ? Math.min(45, Math.max(18, this.tierSettings?.vrLedUpdateHz || 30))
            : 45;
        if (now - this._gashouderLedLastUpdate < 1000 / hz) return;
        this._gashouderLedLastUpdate = now;

        const vj = this.vjDirector;
        const beat = typeof this.spotRigBeat === 'function'
            ? this.spotRigBeat(now / 1000)
            : (vj ? vj.beatNumber + (vj.barPhase || 0) * 4 : now / 500);
        const kick = this.kickPulse || (vj?.beatEnvelope || 0) * 0.35;
        const active = this.ledWallActive !== false;
        const master = Math.max(0, Math.min(1, this.masterIntensity ?? 1));
        const wallLevel = Math.max(0.15, Math.min(1, this.ledWallLevel ?? 1));
        const userBright = Math.max(0, Math.min(2, this.ledWallBrightness ?? 1));
        const safeScale = this.photosensitiveSafeMode ? 0.6 : 1.0;
        const brightness = active ? userBright * wallLevel * master * safeScale : 0;

        const primary = this._gashouderLedPrimary;
        const secondary = this._gashouderLedSecondary;
        if (this.ledMonochrome) {
            primary.set(1, 1, 1);
            secondary.set(0.65, 0.72, 0.85);
        } else if (this.ledShowColor) {
            primary.copyFrom(this.ledShowColor);
            if (this.currentSpotColor && !this.colorLockActive) {
                secondary.copyFrom(this.currentSpotColor);
            } else {
                const hue = Number.isFinite(vj?.masterHue) ? (vj.masterHue + 0.14) % 1 : 0.62;
                BABYLON.Color3.HSVtoRGBToRef(hue * 360, 0.82, 1.0, secondary);
            }
        } else if (Number.isFinite(vj?.masterHue)) {
            BABYLON.Color3.HSVtoRGBToRef(vj.masterHue * 360, 0.85, 1.0, primary);
            BABYLON.Color3.HSVtoRGBToRef(((vj.masterHue + 0.42) % 1) * 360, 0.85, 1.0, secondary);
        } else if (this.currentSpotColor) {
            primary.copyFrom(this.currentSpotColor);
            secondary.set(primary.b, primary.r, primary.g);
        }

        // Select architectural ceiling pattern from ShowDirector or LED wall pattern
        const rawMode = Number.isInteger(this.gashouderCeilingMode) ? this.gashouderCeilingMode : -1;
        const ledPat = this.ledPattern | 0;
        const mode = rawMode >= 0 ? rawMode : (
            ledPat === 5 || ledPat === 16 ? 0 // Architectural warm/cool breath
                : ledPat === 1 || ledPat === 4 || ledPat === 6 ? 1 // Outward hub-to-wall concentric ripple
                    : ledPat === 0 || ledPat === 8 || ledPat === 12 ? 2 // Radial turbine pinwheel
                        : ledPat === 9 || ledPat === 11 || ledPat === 18 ? 3 // Stage-to-entrance axial wave
                            : ledPat === 19 || ledPat === 7 ? 4 // Geometric spoke & ring matrix chase
                                : 1
        );

        const speed = this.photosensitiveSafeMode ? 0.45 : Math.max(0.3, Math.min(2.0, this.ledWallSpeed || 1));
        const phase = beat * speed;
        const count = this._gashouderLedCount;

        for (let i = 0; i < count; i++) {
            const m = i * 6;
            const c = i * 4;
            if (brightness <= 0.001) {
                colors[c] = 0; colors[c + 1] = 0; colors[c + 2] = 0; colors[c + 3] = 1;
                continue;
            }
            const kind = meta[m];
            const bay = meta[m + 1];
            const ring = meta[m + 2];
            const rNorm = meta[m + 3];
            const angle = meta[m + 4];
            const zNorm = meta[m + 5];

            let v = 0;
            let mix = 0;
            if (mode === 0) {
                // Architectural canopy glow: gentle breathing along radial trusses, brighter toward central hub
                const breath = 0.55 + 0.45 * Math.sin(phase * 0.45 - rNorm * 2.2);
                v = (kind === 1 ? 0.65 : 0.42) * breath * (1.05 - rNorm * 0.35);
                mix = rNorm * 0.6;
            } else if (mode === 1) {
                // Outward concentric shockwaves from the 14.5m apex hub to the 10m brick wall
                const wave = Math.sin(phase * 1.6 - rNorm * 6.5);
                const crest = Math.max(0, wave) ** 2.2;
                const ringAccent = kind === 1 ? (0.35 + 0.65 * Math.max(0, Math.sin(phase * 0.8 - ring * 1.1))) : 0;
                v = 0.12 + 0.88 * Math.max(crest, ringAccent * 0.75);
                mix = 1 - crest;
            } else if (mode === 2) {
                // 40-bay radial turbine: 4 sweeping propeller blades across the conical steelwork
                const blades = Math.sin(angle * 4 - phase * 1.1 + rNorm * 2.4);
                const spoke = Math.max(0, blades) ** 2.6;
                const ringCrown = kind === 1 && ring <= 1 ? 0.55 : 0.1;
                v = Math.min(1.2, ringCrown + spoke * 0.95);
                mix = 0.5 + 0.5 * Math.sin(angle * 2 + phase * 0.5);
            } else if (mode === 3) {
                // Stage-to-rear-wall tidal wave sweeping overhead from DJ (zNorm ~ 0) across the arena
                const sweep = Math.sin(phase * 1.4 - zNorm * 5.8);
                const pulse = Math.max(0, sweep) ** 2.0;
                v = 0.10 + 0.95 * pulse;
                mix = zNorm;
            } else {
                // Industrial cathedral matrix: crisp alternating spoke groups & ring steps on the beat grid
                const step = Math.floor(beat);
                const bayGroup = (bay + step * 2) % 8 < 2 ? 1 : 0;
                const ringStep = ((ring + step) % 4 === 0) ? 1 : 0;
                const hit = kind === 0 ? bayGroup : ringStep;
                const decay = this.photosensitiveSafeMode ? 0.75 : (0.35 + 0.65 * Math.max(0, 1 - (beat % 1) * 0.85));
                v = 0.08 + 0.95 * hit * decay;
                mix = kind === 1 ? 0.85 : 0.15;
            }

            const gain = brightness * v * (1 + kick * 0.45) * 1.45;
            const r = primary.r * (1 - mix) + secondary.r * mix;
            const g = primary.g * (1 - mix) + secondary.g * mix;
            const b = primary.b * (1 - mix) + secondary.b * mix;
            colors[c] = r * gain;
            colors[c + 1] = g * gain;
            colors[c + 2] = b * gain;
            colors[c + 3] = 1;
        }
        mesh.thinInstanceBufferUpdated('color');
    },

    createGashouderSeating() {
        const layout = this.gashouderSeatingLayout();
        const builder = this._dressingBuilder('gashouderSeating');
        const table = builder.group('Tables', this.materialFactory.getPreset('steelGirder'));
        layout.forEach((place, index) => {
            builder.cylinder(table, 0.78, 0.04, place.x, 1.05, place.z, 'y', 24);
            builder.cylinder(table, 0.09, 1.03, place.x, 0.53, place.z, 'y', 12);
            builder.cylinder(table, 0.5, 0.03, place.x, 0.015, place.z, 'y', 20);
            this._collisionBlock(`gashouderTableBlock${index}`, 0.8, 1.1, 0.8, place.x, 0.55, place.z);
        });
        builder.finish();
        this.createGashouderExperienceProps?.(layout);
        this.modelLoadPromise = this.modelLoadPromise.then(() => {
            if (this._disposed) return;
            const record = this.modelLoader.loadedModels.bar_stool;
            if (!record?.rootMesh || !record.container) throw new Error('The seating stool model did not load.');
            const { rootMesh, container } = record;
            const meshes = container.meshes.filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
            if (!meshes.length) throw new Error('The seating stool model has no visible meshes.');
            const stools = layout.flatMap(place => place.stools);
            const first = stools[0];
            stools.forEach((stool, index) => {
                let seatMeshes = meshes;
                if (index > 0) {
                    const entry = container.instantiateModelsToScene(name => `gashouderStool${index}_${name}`, false,
                        { doNotInstantiate: false });
                    const root = entry.rootNodes[0];
                    if (!root) throw new Error(`Could not create Gashouder stool ${index + 1}.`);
                    root.position.x = rootMesh.position.x + stool.x - first.x;
                    root.position.z = rootMesh.position.z + stool.z - first.z;
                    root.rotation.y = rootMesh.rotation.y + stool.facing - first.facing;
                    root.computeWorldMatrix(true);
                    seatMeshes = root.getChildMeshes().filter(mesh => mesh.getTotalVertices && mesh.getTotalVertices() > 0);
                    if (!seatMeshes.length) throw new Error(`Gashouder stool ${index + 1} has no visible meshes.`);
                }
                const seat = this._seat('a Gashouder stool', stool.id, stool.x, stool.z, 0,
                    GASHOUDER_VENUE.seating.seatHeight, stool.facing, stool.viewX, stool.viewZ);
                this._tagSeatMeshes(seatMeshes, [seat]);
                this._collisionBlock(`gashouderStoolBlock${index}`, 0.46, 1.1, 0.46, stool.x, 0.55, stool.z);
            });
        }).catch(error => {
            if (this._disposed) return;
            log.warn('Gashouder seating could not be finished:', error);
            this.showToast('Some Gashouder seating could not be loaded.');
        });
    },

    createGashouderVenue() {
        const preset = GASHOUDER_PRESETS[this.getGashouderPreset()];
        this.ledPanels = [];
        this.createGashouderArchitecture();
        this.createGashouderSeating();
        if (preset.stage) this.createGashouderStage();
        if (this.scene?.onBeforeRenderObservable && typeof this._updateWalkSurface === 'function' && !this._walkSurfaceObserver) {
            this._walkLevel = this._walkLevel || 0;
            this._walkSurfaceObserver = this.scene.onBeforeRenderObservable.add(() => this._updateWalkSurface());
        }
        if (!preset.rig) {
            this.trussLights = [];
            this.spotlights = [];
            this.lasers = [];
            this.strobes = [];
            this.lightFactory.getPreset('ambient', 'ambient');
            this.configureGashouderCamera();
            return;
        }

        this.createGashouderEventTruss();
        const { rig } = GASHOUDER_VENUE;

        // 18 moving heads around the 31m circular arena truss (3 heads × 6 control groups)
        const ringFixtures = Array.from({ length: rig.ringFixtureCount }, (_, i) => {
            const group = Math.floor(i / 3) % rig.fixtureGroups;
            const local = (i % 3) - 1;
            const angle = Math.PI * 2 * group / rig.fixtureGroups + local * Math.PI * 2 / rig.segments;
            return {
                x: Math.sin(angle) * rig.radius,
                y: rig.mountY,
                z: Math.cos(angle) * rig.radius,
                role: 'ring',
                angle,
                group
            };
        });
        // 6 moving heads along the front-of-stage bridge framing the DJ and monumental LED wall
        // Keep bridge fixtures on separate nodes of the 1.25 m support grid.
        const bridgeX = segment => -rig.stageBridgeWidth / 2 +
            rig.stageBridgeWidth * segment / rig.stageBridgeSegments;
        const stageXs = [1, 4, 6, 10, 12, 15].map(bridgeX);
        const stageFixtures = stageXs.map((x, idx) => ({
            x,
            y: rig.stageMountY,
            z: rig.stageBridgeZ,
            role: 'stage',
            angle: Math.atan2(x, rig.stageBridgeZ),
            group: idx % rig.fixtureGroups
        }));

        // These 7.5-degree nodes are interleaved with the heads, lasers, and haze units.
        const ringStrobeSteps = [3, 5, 13, 21, 27, 29, 37, 45];
        const ringStrobes = ringStrobeSteps.map(step => {
            const angle = Math.PI * 2 * step / rig.segments;
            return {
                x: Math.sin(angle) * rig.radius,
                y: rig.mountY,
                z: Math.cos(angle) * rig.radius,
                aimZ: 0
            };
        });
        const stageStrobes = [2, 7, 9, 14].map(bridgeX).map(x => ({
            x,
            y: rig.stageMountY,
            z: rig.stageBridgeZ,
            aimZ: -2
        }));

        const ringLasers = Array.from({ length: rig.ringLaserCount }, (_, i) => {
            const angle = Math.PI * 2 * (i + 0.25) / rig.ringLaserCount;
            return {
                x: Math.sin(angle) * rig.radius,
                z: Math.cos(angle) * rig.radius,
                trussY: rig.centreY,
                type: 'multi'
            };
        });
        const stageLasers = [3, 13].map(bridgeX).map(x => ({
            x,
            z: rig.stageBridgeZ,
            trussY: rig.stageBridgeY,
            type: 'multi'
        }));

        const fogMachines = [
            // 6 around the circular overhead truss (offset from moving heads)
            ...Array.from({ length: 6 }, (_, i) => {
                const angle = Math.PI * 2 * (i + 0.5) / 6;
                const directionX = -Math.sin(angle);
                const directionZ = -Math.cos(angle);
                return {
                    x: Math.sin(angle) * rig.radius,
                    y: rig.mountY - 0.08,
                    z: Math.cos(angle) * rig.radius,
                    rotY: Math.atan2(directionX, directionZ),
                    directionX,
                    directionZ
                };
            }),
            // 2 on the front-of-stage bridge jetting downward across the stage front and dancefloor
            ...[5, 11].map(bridgeX).map(x => ({
                x,
                y: rig.stageMountY - 0.08,
                z: rig.stageBridgeZ,
                rotY: 0,
                directionX: x < 0 ? 0.15 : -0.15,
                directionZ: 0.98
            }))
        ];

        this.gashouderLighting = {
            mountY: rig.mountY,
            mirrorPinspotPositions: [6, 14, 30, 38].map(step => {
                const angle = Math.PI * 2 * step / rig.segments;
                return { x: Math.sin(angle) * rig.radius, y: rig.mountY - 0.35, z: Math.cos(angle) * rig.radius };
            }),
            fixturePositions: [...ringFixtures, ...stageFixtures],
            strobePositions: [...ringStrobes, ...stageStrobes],
            laserSheetPositions: [-10, 10].map(x => ({
                x,
                y: rig.stageMountY,
                z: rig.stageBridgeZ,
                yaw: Math.atan2(-x, 15.2)
            })),
            laserPositions: [...ringLasers, ...stageLasers],
            fogMachineCount: fogMachines.length,
            fogMachinePositions: fogMachines
        };
        this.horizontalTrusses = [];
        this.sideTrusses = {};

        if (preset.led) {
            const wall = rig.ledWall;
            this.createLEDWall({
                name: 'gashouderLedWall',
                colliderName: 'gashouderLedWallCollider',
                cols: wall.cols,
                rows: wall.rows,
                panelWidth: wall.panelWidth,
                panelHeight: wall.panelHeight,
                seam: wall.seam,
                baseY: wall.baseY,
                centerZ: wall.centerZ,
                curveRadius: wall.curveRadius
            });
            this.createGashouderLEDInstallation();
        }
        if (preset.lasers) {
            this.createLasers();
            this.createLaserSheet();
        } else {
            this.lasers = [];
        }
        if (preset.lights) {
            this.createTrussMountedLights();
            this.createLights();
            if (preset.haze) this.createHyperrealisticSmoke();
            this.createMirrorBall();
            this.createDJMonitors();
        }
        this.createGuestExperience?.();
        this.createSessionExperience?.();
        this.configureGashouderCamera();
    }
};

window.GASHOUDER_VENUE = GASHOUDER_VENUE;
window.GASHOUDER_PRESETS = GASHOUDER_PRESETS;
window.GashouderVenue = GashouderVenue;
