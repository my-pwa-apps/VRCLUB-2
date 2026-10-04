'use strict';
class VRClubEnvironment extends VRClubRendering {
    createEntranceArea() {
        log.info("🚪 Creating hyperrealistic entrance area...");
        
        // Materials
        const stanchionPostMat = this.materialFactory.getPreset('stanchionPost');
        const stanchionBaseMat = this.materialFactory.getPreset('stanchionBase');
        const velvetRopeMat = this.materialFactory.getPreset('velvetRope');
        
        // === ENTRANCE ARCHWAY ===
        const archMat = this.materialFactory.createPBRMaterial('entranceArchMat', {
            baseColor: [0.02, 0.02, 0.02],
            metallic: 0.95,
            roughness: 0.2
        }, true);
        
        // Left arch pillar
        const leftArchPillar = BABYLON.MeshBuilder.CreateBox("leftArchPillar", {
            width: 0.4, height: 3.5, depth: 0.4
        }, this.scene);
        leftArchPillar.position = new BABYLON.Vector3(-3, 1.75, 0);
        leftArchPillar.material = archMat;
        leftArchPillar.checkCollisions = true;
        leftArchPillar.freezeWorldMatrix();
        
        // Right arch pillar
        const rightArchPillar = BABYLON.MeshBuilder.CreateBox("rightArchPillar", {
            width: 0.4, height: 3.5, depth: 0.4
        }, this.scene);
        rightArchPillar.position = new BABYLON.Vector3(3, 1.75, 0);
        rightArchPillar.material = archMat;
        rightArchPillar.checkCollisions = true;
        rightArchPillar.freezeWorldMatrix();
        
        // Arch top beam
        const archTop = BABYLON.MeshBuilder.CreateBox("archTop", {
            width: 6.4, height: 0.3, depth: 0.4
        }, this.scene);
        archTop.position = new BABYLON.Vector3(0, 3.65, 0);
        archTop.material = archMat;
        const mergedArch = BABYLON.Mesh.MergeMeshes(
            [leftArchPillar, rightArchPillar, archTop],
            true,
            true,
            undefined,
            false,
            false
        );
        if (mergedArch) {
            mergedArch.name = 'entranceArch';
            mergedArch.material = archMat;
            mergedArch.checkCollisions = true;
            mergedArch.freezeWorldMatrix();
        }
        
        // === VELVET ROPE QUEUE SYSTEM ===
        const stanchionPositions = [
            // Left queue line
            { x: -5, z: -7.5 }, { x: -5, z: -5.5 }, { x: -5, z: -3.5 },
            // Right queue line  
            { x: -3.5, z: -7.5 }, { x: -3.5, z: -5.5 }, { x: -3.5, z: -3.5 },
            // Entrance guide right side
            { x: 5, z: -7.5 }, { x: 5, z: -5.5 }
        ];
        
        const stanchions = [];
        const stanchionBases = [];
        const stanchionPosts = [];
        const velvetRopes = [];
        stanchionPositions.forEach((pos, i) => {
            // Base (weighted round base)
            const base = BABYLON.MeshBuilder.CreateCylinder(`stanchionBase${i}`, {
                diameter: 0.4, height: 0.08, tessellation: 24
            }, this.scene);
            base.position = new BABYLON.Vector3(pos.x, 0.04, pos.z);
            base.material = stanchionBaseMat;
            
            // Post (polished brass pole)
            const post = BABYLON.MeshBuilder.CreateCylinder(`stanchionPost${i}`, {
                diameter: 0.05, height: 1.0, tessellation: 16
            }, this.scene);
            post.position = new BABYLON.Vector3(pos.x, 0.58, pos.z);
            post.material = stanchionPostMat;
            
            // Decorative top ball
            const topBall = BABYLON.MeshBuilder.CreateSphere(`stanchionTop${i}`, {
                diameter: 0.12, segments: 12
            }, this.scene);
            topBall.position = new BABYLON.Vector3(pos.x, 1.14, pos.z);
            topBall.material = stanchionPostMat;
            
            // Rope hook ring
            const hookRing = BABYLON.MeshBuilder.CreateTorus(`ropeHook${i}`, {
                diameter: 0.08, thickness: 0.015, tessellation: 16
            }, this.scene);
            hookRing.position = new BABYLON.Vector3(pos.x, 0.95, pos.z);
            hookRing.rotation.x = Math.PI / 2;
            hookRing.material = stanchionPostMat;
            
            stanchions.push({ base, post, topBall, hookRing, pos });
            stanchionBases.push(base);
            stanchionPosts.push(post, topBall, hookRing);
        });
        
        // Create velvet ropes between stanchions
        const createVelvetRope = (start, end, name) => {
            const dx = end.x - start.x;
            const dz = end.z - start.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);
            
            // Main rope (thick velvet)
            const rope = BABYLON.MeshBuilder.CreateCylinder(name, {
                diameter: 0.045, height: length, tessellation: 12
            }, this.scene);
            rope.position = new BABYLON.Vector3(
                (start.x + end.x) / 2,
                0.95,
                (start.z + end.z) / 2
            );
            rope.rotation.x = Math.PI / 2;
            rope.rotation.y = angle;
            rope.material = velvetRopeMat;
            
            // Add subtle catenary sag with middle point
            const midRope = BABYLON.MeshBuilder.CreateCylinder(name + "_sag", {
                diameter: 0.048, height: length * 0.3, tessellation: 10
            }, this.scene);
            midRope.position = new BABYLON.Vector3(
                (start.x + end.x) / 2,
                0.92, // Slight sag
                (start.z + end.z) / 2
            );
            midRope.rotation.x = Math.PI / 2;
            midRope.rotation.y = angle;
            midRope.material = velvetRopeMat;
            velvetRopes.push(rope, midRope);
        };
        
        // Connect ropes on left queue line
        createVelvetRope(stanchionPositions[0], stanchionPositions[1], "velvetRope_L1");
        createVelvetRope(stanchionPositions[1], stanchionPositions[2], "velvetRope_L2");
        
        // Connect ropes on right queue line
        createVelvetRope(stanchionPositions[3], stanchionPositions[4], "velvetRope_R1");
        createVelvetRope(stanchionPositions[4], stanchionPositions[5], "velvetRope_R2");
        
        // Cross rope at entrance
        createVelvetRope(stanchionPositions[6], stanchionPositions[7], "velvetRope_entrance");
        
        const mergeStaticGroup = (meshes, name, material) => {
            const merged = BABYLON.Mesh.MergeMeshes(meshes, true, true, undefined, false, false);
            if (!merged) return;
            merged.name = name;
            merged.material = material;
            merged.isPickable = false;
            merged.freezeWorldMatrix();
            merged.doNotSyncBoundingInfo = true;
        };
        mergeStaticGroup(stanchionBases, 'mergedStanchionBases', stanchionBaseMat);
        mergeStaticGroup(stanchionPosts, 'mergedStanchionPosts', stanchionPostMat);
        mergeStaticGroup(velvetRopes, 'mergedVelvetRopes', velvetRopeMat);
        
        // Freeze stanchion materials
        if (stanchionBaseMat.freeze) stanchionBaseMat.freeze();
        if (stanchionPostMat.freeze) stanchionPostMat.freeze();
        if (velvetRopeMat.freeze) velvetRopeMat.freeze();
        
        // === STEP LIGHTING (LED strips) ===
        const stepLightMat = this.materialFactory.getPreset('floorEdgeLED');
        
        const stepLights = [
            { x: -2.5, z: 0, w: 5, c: [0, 0.5, 1] },    // Entrance step cyan
            { x: -2.5, z: -2, w: 5, c: [1, 0, 0.5] },   // Second step magenta
        ];
        
        stepLights.forEach((light, i) => {
            const strip = BABYLON.MeshBuilder.CreateBox(`stepLight${i}`, {
                width: light.w, height: 0.02, depth: 0.1
            }, this.scene);
            strip.position = new BABYLON.Vector3(light.x + light.w/2, 0.01, light.z);
            const mat = stepLightMat.clone(`stepLightMat${i}`);
            mat.emissiveColor = new BABYLON.Color3(...light.c);
            strip.material = mat;
            strip.freezeWorldMatrix(); // Static step lighting
        });
        
        log.info("✅ Created hyperrealistic entrance with velvet ropes and stanchions - frozen for performance");
    }

    // === DANCE FLOOR EDGE LIGHTING ===
    createDanceFloorLighting() {
        log.info("💃 Creating dance floor edge lighting...");
        
        const gapMat = this.materialFactory.getPreset('floorTileGap');
        
        // Dance floor boundary (centered at z=-12)
        const danceFloorBounds = {
            x: { min: -8, max: 8 },
            z: { min: -18, max: -6 },
            center: { x: 0, z: -12 }
        };
        
        // === PERIMETER LED STRIPS ===
        const edgeStrips = [
            // Front edge
            { x: danceFloorBounds.x.min, z: danceFloorBounds.z.max, w: 16, d: 0.08, rotY: 0 },
            // Back edge
            { x: danceFloorBounds.x.min, z: danceFloorBounds.z.min, w: 16, d: 0.08, rotY: 0 },
            // Left edge
            { x: danceFloorBounds.x.min, z: danceFloorBounds.z.min, w: 0.08, d: 12, rotY: 0 },
            // Right edge
            { x: danceFloorBounds.x.max, z: danceFloorBounds.z.min, w: 0.08, d: 12, rotY: 0 }
        ];
        
        this.danceFloorLEDs = []; // Store for animation
        
        edgeStrips.forEach((strip, i) => {
            const led = BABYLON.MeshBuilder.CreateBox(`danceFloorLED${i}`, {
                width: strip.w, height: 0.02, depth: strip.d
            }, this.scene);
            led.position = new BABYLON.Vector3(
                strip.x + strip.w / 2,
                0.01,
                strip.z + strip.d / 2
            );
            const mat = this.materialFactory.createStandardMaterial(`danceFloorLEDMat${i}`, {
                mutable: true, // colour written at runtime
                emissiveColor: [0, 0.5, 1],
                disableLighting: true
            });
            led.material = mat;
            
            this.danceFloorLEDs.push({ mesh: led, material: mat });
        });
        
        // === FLOOR TILE GRID PATTERN ===
        // Create subtle tile gaps for realism
        const tileSize = 2; // 2m x 2m tiles
        const tileGaps = [];
        for (let x = danceFloorBounds.x.min; x <= danceFloorBounds.x.max; x += tileSize) {
            const gapLine = BABYLON.MeshBuilder.CreateBox(`tileGapX_${x}`, {
                width: 0.02, height: 0.005, depth: 12
            }, this.scene);
            gapLine.position = new BABYLON.Vector3(x, 0.002, -12);
            gapLine.material = gapMat;
            tileGaps.push(gapLine);
        }
        
        for (let z = danceFloorBounds.z.min; z <= danceFloorBounds.z.max; z += tileSize) {
            const gapLine = BABYLON.MeshBuilder.CreateBox(`tileGapZ_${z}`, {
                width: 16, height: 0.005, depth: 0.02
            }, this.scene);
            gapLine.position = new BABYLON.Vector3(0, 0.002, z);
            gapLine.material = gapMat;
            tileGaps.push(gapLine);
        }

        const mergedTileGaps = BABYLON.Mesh.MergeMeshes(tileGaps, true, true, undefined, false, false);
        if (mergedTileGaps) {
            mergedTileGaps.name = 'mergedDanceFloorTileGaps';
            mergedTileGaps.material = gapMat;
            mergedTileGaps.isPickable = false;
            mergedTileGaps.freezeWorldMatrix();
            mergedTileGaps.doNotSyncBoundingInfo = true;
        }
        
        log.info("✅ Created dance floor edge lighting and tile pattern");
    }

    // === SAFETY & ATMOSPHERE DETAILS ===
    createSafetyDetails() {
        log.info("🚨 Creating safety and atmosphere details...");
        
        this.createSignage();

        // === PLATFORM STEP LIGHTS ===
        // Small emissive discs along DJ platform edge (safety + atmosphere), merged into one draw.
        const platformEdgeZ = -16; // Front edge of DJ platform
        const stepMat = new BABYLON.StandardMaterial('stepLightMat', this.scene);
        stepMat.emissiveColor = new BABYLON.Color3(0.2, 0.3, 1); // Cool blue
        stepMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        stepMat.specularColor = new BABYLON.Color3(0, 0, 0);
        stepMat.disableLighting = true;
        stepMat.freeze();
        const stepDiscs = [];
        for (let x = -2.5; x <= 2.5; x += 1.0) {
            const stepLight = BABYLON.MeshBuilder.CreateDisc(`stepLight_${x}`, {
                radius: 0.06, tessellation: 8
            }, this.scene);
            stepLight.position = new BABYLON.Vector3(x, 0.52, platformEdgeZ);
            stepLight.rotation.x = -Math.PI / 2; // Face upward
            stepDiscs.push(stepLight);
        }
        const stepLights = BABYLON.Mesh.MergeMeshes(stepDiscs, true);
        if (stepLights) {
            stepLights.name = 'stepLights';
            stepLights.material = stepMat;
            stepLights.isPickable = false;
            stepLights.freezeWorldMatrix();
            stepLights.doNotSyncBoundingInfo = true;
        }

        log.info("✅ Created safety details (signage, step lights) - merged and frozen for performance");    }

    /**
     * Wall signage: the three neon signs and two exit signs, in two draw calls (it was thirteen with the
     * step lights). The words are drawn once into one atlas, every sign is a quad that samples its cell, and a
     * second merged mesh holds the dark backing plates they are mounted on.
     *
     * Everything sits on the INSIDE face of a wall, facing the room. The old signs were placed at the wall's
     * centre line, in the front wall's far side, or facing into the wall, so none could be seen from the room.
     * Positions avoid the brick fins (z -10, -20) and pillars (z -5, -15, -21) of createIndustrialWallDetails.
     * The glow layer's selector gives `signageGlow` a glow (see _createGlowLayer).
     */
    createSignage() {
        const WALL_RIGHT = 12.25, WALL_LEFT = -12.25, WALL_FRONT = -0.25; // inner faces of the shell
        const PLATE = 0.06;
        // yaw: a plane faces (-sin yaw, -cos yaw), so PI/2 faces -x (the right wall looks into the room).
        const signs = [
            { cell: 'club', kind: 'neon', color: [1, 0.1, 0.45], w: 2.0, h: 0.5, wall: WALL_RIGHT, axis: 'x', y: 4.0, along: -7.5, yaw: Math.PI / 2 },
            { cell: 'vr', kind: 'neon', color: [0.1, 0.55, 1], w: 1.2, h: 0.5, wall: WALL_LEFT, axis: 'x', y: 3.5, along: -12.5, yaw: -Math.PI / 2 },
            { cell: 'dance', kind: 'neon', color: [1, 0.25, 1], w: 2.5, h: 0.5, wall: WALL_FRONT, axis: 'z', y: 3.7, along: 0, yaw: 0 },
            { cell: 'exit', kind: 'exit', color: [0.1, 1, 0.35], w: 0.5, h: 0.18, wall: WALL_FRONT, axis: 'z', y: 2.75, along: 0, yaw: 0 },
            { cell: 'exit', kind: 'exit', color: [0.1, 1, 0.35], w: 0.5, h: 0.18, wall: WALL_LEFT, axis: 'x', y: 2.8, along: -17.5, yaw: -Math.PI / 2 }
        ];

        // Atlas cells in pixels: x, y, w, h. Aspect ratios match the signs they feed.
        const W = 1024, H = 512;
        const cells = {
            dance: [0, 0, 800, 160, 'DANCE'],
            club: [0, 176, 640, 160, 'CLUB'],
            vr: [640, 176, 384, 160, 'VR'],
            exit: [0, 352, 444, 160, 'EXIT']
        };
        const atlas = new BABYLON.DynamicTexture('signageAtlas', { width: W, height: H }, this.scene, true);
        atlas.anisotropicFilteringLevel = this.tierSettings ? this.tierSettings.anisotropy : 4;
        const ctx = atlas.getContext();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        const rgb = (c, k = 1) => `rgb(${Math.round(255 * Math.min(1, c[0] * k))},${Math.round(255 * Math.min(1, c[1] * k))},${Math.round(255 * Math.min(1, c[2] * k))})`;
        const drawn = new Set();
        for (const sign of signs) {
            if (drawn.has(sign.cell)) continue;
            drawn.add(sign.cell);
            const [x, y, w, h, text] = cells[sign.cell];
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            let size = h * 0.7;
            ctx.font = `bold ${size}px "Arial Rounded MT Bold", Arial, Helvetica, sans-serif`;
            while (ctx.measureText(text).width > w * 0.86 && size > 12) {
                size -= 4;
                ctx.font = `bold ${size}px "Arial Rounded MT Bold", Arial, Helvetica, sans-serif`;
            }
            const cx = x + w / 2, cy = y + h / 2 + size * 0.04;
            if (sign.kind === 'exit') {
                ctx.fillStyle = rgb(sign.color, 0.18);
                ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
                ctx.shadowColor = rgb(sign.color);
                ctx.shadowBlur = size * 0.12;
                ctx.fillStyle = rgb(sign.color);
                ctx.fillText(text, cx, cy);
            } else {
                // A neon tube follows the outline of each letter: a wide soft halo, the coloured tube, a hot core.
                ctx.shadowColor = rgb(sign.color);
                ctx.strokeStyle = rgb(sign.color, 0.9);
                ctx.lineWidth = size * 0.07;
                ctx.shadowBlur = size * 0.34;
                ctx.strokeText(text, cx, cy);
                ctx.shadowBlur = size * 0.14;
                ctx.strokeText(text, cx, cy);
                ctx.shadowBlur = 0;
                ctx.lineWidth = size * 0.028;
                ctx.strokeStyle = rgb([1, 1, 1], 0.92);
                ctx.strokeText(text, cx, cy);
            }
            ctx.restore();
        }
        atlas.update();

        const positions = [], normals = [], uvs = [], indices = [];
        const plates = [];
        signs.forEach((sign, i) => {
            const [cx0, cy0, cw, ch] = cells[sign.cell];
            const u0 = cx0 / W, u1 = (cx0 + cw) / W, vTop = 1 - cy0 / H, vBottom = 1 - (cy0 + ch) / H;
            const right = [Math.cos(sign.yaw), 0, -Math.sin(sign.yaw)];
            const normal = [-Math.sin(sign.yaw), 0, -Math.cos(sign.yaw)];
            // Face centre: on the wall, in front of the plate.
            const lateral = sign.axis === 'x' ? [0, sign.along] : [sign.along, 0];
            const depth = sign.wall + (sign.axis === 'x' ? normal[0] : normal[2]) * (PLATE + 0.004);
            const centre = sign.axis === 'x'
                ? [depth, sign.y, lateral[1]]
                : [lateral[0], sign.y, depth];
            const hw = sign.w / 2, hh = sign.h / 2;
            const base = positions.length / 3;
            for (const [sx, sy, u, v] of [[-1, -1, u0, vBottom], [1, -1, u1, vBottom], [1, 1, u1, vTop], [-1, 1, u0, vTop]]) {
                positions.push(centre[0] + right[0] * hw * sx, centre[1] + sy * hh, centre[2] + right[2] * hw * sx);
                normals.push(normal[0], 0, normal[2]);
                uvs.push(u, v);
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);

            const plate = BABYLON.MeshBuilder.CreateBox(`signPlate${i}`, {
                width: sign.w + 0.12, height: sign.h + 0.12, depth: PLATE
            }, this.scene);
            plate.rotation.y = sign.yaw;
            plate.position.set(
                centre[0] - normal[0] * (PLATE / 2 + 0.002),
                sign.y,
                centre[2] - normal[2] * (PLATE / 2 + 0.002));
            plates.push(plate);
        });

        const glow = new BABYLON.Mesh('signageGlow', this.scene);
        const data = new BABYLON.VertexData();
        data.positions = positions;
        data.normals = normals;
        data.uvs = uvs;
        data.indices = indices;
        data.applyToMesh(glow);
        const glowMat = this.materialFactory.createStandardMaterial('signageNeonMat', {
            emissiveTexture: atlas,
            diffuseColor: [0, 0, 0],
            disableLighting: true,
            mutable: true // frozen below, once the blend state is set
        });
        // Additive: the black around the lettering adds nothing, so only the light of the tubes shows.
        // Alpha just under 1 is what makes Babylon use blending at all.
        glowMat.alpha = 0.999;
        glowMat.alphaMode = BABYLON.Constants.ALPHA_ADD;
        glowMat.backFaceCulling = false;
        atlas.level = 1.6; // neon should read as a light source in a dark room
        glowMat.freeze();
        glow.material = glowMat;
        glow.isPickable = false;
        glow.freezeWorldMatrix();
        glow.doNotSyncBoundingInfo = true;

        const backing = BABYLON.Mesh.MergeMeshes(plates, true);
        if (backing) {
            backing.name = 'signagePlates';
            backing.material = this.materialFactory.createPBRMaterial('signPlateMat', {
                baseColor: [0.035, 0.035, 0.04], metallic: 0.6, roughness: 0.5
            }, true);
            backing.isPickable = false;
            backing.freezeWorldMatrix();
            backing.doNotSyncBoundingInfo = true;
        }
    }
    createBar() {
        // === NIGHTCLUB BAR (right wall) ===
        // Every real club has a bar area with warm lighting contrast
        log.info('🍹 Creating bar area...');
        
        // Bar counter (long L-shaped counter along right wall)
        const barTop = BABYLON.MeshBuilder.CreateBox("barTop", {
            width: 0.8, height: 0.05, depth: 8
        }, this.scene);
        barTop.position = new BABYLON.Vector3(12, 1.1, -8);
        const barTopMat = this.materialFactory.createPBRMaterial("barTopMat", {
            baseColor: [0.08, 0.06, 0.04],
            metallic: 0.1,
            roughness: 0.15 // Glossy bar top
        });
        barTopMat.clearCoat.isEnabled = true;
        barTopMat.clearCoat.intensity = 0.8;
        barTopMat.clearCoat.roughness = 0.1;
        barTop.material = barTopMat;
        barTop.receiveShadows = true;
        barTop.checkCollisions = true;
        barTop.freezeWorldMatrix();
        barTop.doNotSyncBoundingInfo = true;
        
        // Bar front panel (facing dancefloor)
        const barFront = BABYLON.MeshBuilder.CreateBox("barFront", {
            width: 0.08, height: 1.1, depth: 8
        }, this.scene);
        barFront.position = new BABYLON.Vector3(11.6, 0.55, -8);
        const barFrontMat = this.materialFactory.createPBRMaterial("barFrontMat", {
            baseColor: [0.06, 0.06, 0.08],
            metallic: 0.05,
            roughness: 0.6
        });
        barFront.material = barFrontMat;
        barFront.freezeWorldMatrix();
        barFront.doNotSyncBoundingInfo = true;
        
        // LED strip under bar counter (accent lighting)
        const barLedStrip = BABYLON.MeshBuilder.CreateBox("barLedStrip", {
            width: 0.6, height: 0.02, depth: 7.8
        }, this.scene);
        barLedStrip.position = new BABYLON.Vector3(11.8, 0.05, -8);
        const barLedMat = new BABYLON.StandardMaterial("barLedMat", this.scene);
        barLedMat.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.8); // Cool blue underglow
        barLedMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        barLedMat.disableLighting = true;
        barLedMat.alpha = 0.9;
        barLedStrip.material = barLedMat;
        barLedStrip.freezeWorldMatrix();
        barLedStrip.doNotSyncBoundingInfo = true;
        
        // Bar stools (simple cylinder + disc)
        for (let z = -11; z <= -5; z += 1.5) {
            const stoolLeg = BABYLON.MeshBuilder.CreateCylinder(`barStoolLeg_${z}`, {
                diameter: 0.08, height: 0.75, tessellation: 8
            }, this.scene);
            stoolLeg.position = new BABYLON.Vector3(11.2, 0.375, z);
            stoolLeg.material = barFrontMat;
            stoolLeg.freezeWorldMatrix();
            stoolLeg.doNotSyncBoundingInfo = true;
            
            const stoolSeat = BABYLON.MeshBuilder.CreateCylinder(`barStoolSeat_${z}`, {
                diameter: 0.35, height: 0.06, tessellation: 12
            }, this.scene);
            stoolSeat.position = new BABYLON.Vector3(11.2, 0.78, z);
            stoolSeat.material = barTopMat;
            stoolSeat.freezeWorldMatrix();
            stoolSeat.doNotSyncBoundingInfo = true;
        }
        
        // Bottle shelf (backbar with LED backlight)
        const shelf = BABYLON.MeshBuilder.CreateBox("bottleShelf", {
            width: 0.3, height: 1.5, depth: 6
        }, this.scene);
        shelf.position = new BABYLON.Vector3(12.6, 1.8, -8);
        shelf.material = barFrontMat;
        shelf.freezeWorldMatrix();
        shelf.doNotSyncBoundingInfo = true;
        
        // Backlit shelf glow (warm amber behind bottles)
        const shelfGlow = BABYLON.MeshBuilder.CreatePlane("shelfGlow", {
            width: 6, height: 1.4
        }, this.scene);
        shelfGlow.position = new BABYLON.Vector3(12.75, 1.8, -8);
        shelfGlow.rotation.y = -Math.PI / 2;
        const shelfGlowMat = new BABYLON.StandardMaterial("shelfGlowMat", this.scene);
        shelfGlowMat.emissiveColor = new BABYLON.Color3(1, 0.6, 0.2); // Warm amber
        shelfGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        shelfGlowMat.disableLighting = true;
        shelfGlowMat.alpha = 0.4;
        shelfGlow.material = shelfGlowMat;
        shelfGlow.freezeWorldMatrix();
        shelfGlow.doNotSyncBoundingInfo = true;
        
        // Bottles on shelf (simple colored cylinders)
        const bottleColors = [
            [0.8, 0.2, 0.1], [0.1, 0.6, 0.2], [0.9, 0.7, 0.1],
            [0.3, 0.2, 0.7], [0.1, 0.4, 0.8], [0.8, 0.4, 0.1],
            [0.6, 0.1, 0.3], [0.2, 0.7, 0.6]
        ];
        bottleColors.forEach((col, i) => {
            const bottle = BABYLON.MeshBuilder.CreateCylinder(`bottle_${i}`, {
                diameter: 0.08, height: 0.35, tessellation: 8
            }, this.scene);
            bottle.position = new BABYLON.Vector3(12.55, 1.85 + (i % 2) * 0.5, -10.5 + i * 0.9);
            const bottleMat = new BABYLON.StandardMaterial(`bottleMat_${i}`, this.scene);
            bottleMat.emissiveColor = new BABYLON.Color3(col[0] * 0.3, col[1] * 0.3, col[2] * 0.3);
            bottleMat.diffuseColor = new BABYLON.Color3(col[0], col[1], col[2]);
            bottleMat.alpha = 0.7;
            bottle.material = bottleMat;
            bottle.freezeWorldMatrix();
            bottle.doNotSyncBoundingInfo = true;
        });
        
        // Warm downlights over bar (atmospheric contrast with dark dancefloor)
        // Using emissive disc spotlights instead of PointLights (no light budget impact)
        for (let z = -10.5; z <= -5.5; z += 2.5) {
            const downlight = BABYLON.MeshBuilder.CreateDisc(`barDownlight_${z}`, {
                radius: 0.15, tessellation: 12
            }, this.scene);
            downlight.position = new BABYLON.Vector3(12, 3, z);
            downlight.rotation.x = Math.PI / 2; // Face downward
            const downlightMat = new BABYLON.StandardMaterial(`barDownlightMat_${z}`, this.scene);
            downlightMat.emissiveColor = new BABYLON.Color3(1, 0.8, 0.5); // Warm white
            downlightMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            downlightMat.disableLighting = true;
            downlight.material = downlightMat;
            downlight.isPickable = false;
            downlight.freezeWorldMatrix();
            downlight.doNotSyncBoundingInfo = true;
            
            // Light cone visual (warm pool of light)
            const cone = BABYLON.MeshBuilder.CreateCylinder(`barLightCone_${z}`, {
                diameterTop: 0.1, diameterBottom: 1.2,
                height: 2.5, tessellation: 12
            }, this.scene);
            cone.position = new BABYLON.Vector3(12, 1.75, z);
            const coneMat = new BABYLON.StandardMaterial(`barConeMat_${z}`, this.scene);
            coneMat.emissiveColor = new BABYLON.Color3(1, 0.7, 0.3);
            coneMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            coneMat.disableLighting = true;
            coneMat.alpha = 0.04; // Very subtle light cone
            coneMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            coneMat.backFaceCulling = false;
            cone.material = coneMat;
            cone.isPickable = false;
            cone.freezeWorldMatrix();
            cone.doNotSyncBoundingInfo = true;
        }
        
        log.info('🍹 Bar area created (counter, stools, bottles, lighting)');
    }

    // === ENHANCED DJ BOOTH ACCESSORIES ===
    createDJBoothAccessories() {
        log.info("🎧 Creating DJ booth accessories...");
        
        // === LAPTOP STAND WITH LAPTOP ===
        // Right-hand end of the VJ control inlay on the DJ plinth
        // (inlay top y = 1.45, centred on z = -18.17 - see createDJBooth()).
        // These used to sit at z ~ -17.6, which after the booth re-layout is
        // 0.4 m in front of the plinth: the laptop was floating in mid-air.
        const laptopMat = this.materialFactory.getPreset('laptopBody');
        
        // Stand (adjustable laptop stand)
        const standBase = BABYLON.MeshBuilder.CreateBox("laptopStandBase", {
            width: 0.3, height: 0.02, depth: 0.25
        }, this.scene);
        standBase.position = new BABYLON.Vector3(1.5, 1.45, -18.17);
        standBase.material = this.materialFactory.getPreset('barStool');
        
        const standArm = BABYLON.MeshBuilder.CreateBox("laptopStandArm", {
            width: 0.04, height: 0.15, depth: 0.04
        }, this.scene);
        standArm.position = new BABYLON.Vector3(1.5, 1.53, -18.22);
        standArm.material = this.materialFactory.getPreset('barStool');
        
        // Laptop base
        const laptopBase = BABYLON.MeshBuilder.CreateBox("laptopBase", {
            width: 0.32, height: 0.015, depth: 0.22
        }, this.scene);
        laptopBase.position = new BABYLON.Vector3(1.5, 1.63, -18.12);
        laptopBase.rotation.x = -0.2; // Tilted toward DJ
        laptopBase.material = laptopMat;
        
        // Laptop screen
        const laptopScreen = BABYLON.MeshBuilder.CreateBox("laptopScreen", {
            width: 0.3, height: 0.2, depth: 0.008
        }, this.scene);
        laptopScreen.position = new BABYLON.Vector3(1.5, 1.79, -18.21);
        laptopScreen.rotation.x = -0.5;
        laptopScreen.material = laptopMat;
        
        // Screen display (glowing)
        const screenDisplay = BABYLON.MeshBuilder.CreatePlane("laptopDisplay", {
            width: 0.28, height: 0.18
        }, this.scene);
        screenDisplay.position = new BABYLON.Vector3(1.5, 1.79, -18.205);
        screenDisplay.rotation.x = -0.5;
        const screenMat = this.materialFactory.createStandardMaterial("laptopScreenMat", {
            emissiveColor: [0.2, 0.4, 0.8], // Blue waveform display
            disableLighting: true
        });
        screenDisplay.material = screenMat;
        

        
        // OPTIMIZATION: Freeze static DJ booth accessories (never move)
        standBase.freezeWorldMatrix();
        standArm.freezeWorldMatrix();
        laptopBase.freezeWorldMatrix();
        laptopScreen.freezeWorldMatrix();
        screenDisplay.freezeWorldMatrix();
        
        // Freeze materials too
        [standBase, standArm, laptopBase, laptopScreen].forEach(mesh => {
            if (mesh.material && mesh.material.freeze) mesh.material.freeze();
        });
        
        log.info("✅ Created DJ booth accessories (laptop) - frozen for performance");
    }

    createCollisionBoundaries() {
        // Create invisible collision walls to prevent walking through geometry
        const collisionMat = this.materialFactory.createStandardMaterial("collisionMat", {
            alpha: 0 // Completely invisible
        });
        
        // Room perimeter walls (using ROOM_BOUNDS constants)
        const boundaries = [
            // Left wall
            { width: 0.5, height: 4, depth: ROOM_BOUNDS.z.depth, 
              pos: new BABYLON.Vector3(ROOM_BOUNDS.x.min, 2, (ROOM_BOUNDS.z.min + ROOM_BOUNDS.z.max) / 2) },
            // Right wall
            { width: 0.5, height: 4, depth: ROOM_BOUNDS.z.depth, 
              pos: new BABYLON.Vector3(ROOM_BOUNDS.x.max, 2, (ROOM_BOUNDS.z.min + ROOM_BOUNDS.z.max) / 2) },
            // Back wall
            { width: ROOM_BOUNDS.x.width, height: 4, depth: 0.5, 
              pos: new BABYLON.Vector3(0, 2, ROOM_BOUNDS.z.min) },
            // Front wall (partial - leave entrance open)
            { width: 10.5, height: 4, depth: 0.5, 
              pos: new BABYLON.Vector3(-7.25, 2, ROOM_BOUNDS.z.max) },
            { width: 10.5, height: 4, depth: 0.5, 
              pos: new BABYLON.Vector3(7.25, 2, ROOM_BOUNDS.z.max) },
            
            // DJ Booth protection area (prevent walking through equipment)
            { width: 8, height: 2, depth: 0.5, 
              pos: new BABYLON.Vector3(0, 1, -17.8) }, // Front of DJ booth
            { width: 0.5, height: 2, depth: 2, 
              pos: new BABYLON.Vector3(-4.5, 1, -17) }, // Left side
            { width: 0.5, height: 2, depth: 2, 
              pos: new BABYLON.Vector3(4.5, 1, -17) }, // Right side
            
                        // Flown PA cabinets under the rear truss
                        { width: 2, height: 1.8, depth: 2,
                            pos: new BABYLON.Vector3(CLUB_POSITIONS.paSpeakers.left.x,
                                    CLUB_POSITIONS.paSpeakers.left.y - 0.725, CLUB_POSITIONS.paSpeakers.left.z) },
                        { width: 2, height: 1.8, depth: 2,
                            pos: new BABYLON.Vector3(CLUB_POSITIONS.paSpeakers.right.x,
                                    CLUB_POSITIONS.paSpeakers.right.y - 0.725, CLUB_POSITIONS.paSpeakers.right.z) }
        ];
        
        boundaries.forEach((b, i) => {
            const wall = BABYLON.MeshBuilder.CreateBox(`collisionWall${i}`, {
                width: b.width,
                height: b.height,
                depth: b.depth
            }, this.scene);
            wall.position = b.pos;
            wall.material = collisionMat;
            wall.checkCollisions = true;
            wall.isPickable = false; // Don't interfere with raycasting
            wall.isVisible = false; // Extra insurance for invisibility
        });
        
        log.info("✅ Created invisible collision boundaries around room and DJ booth");
    }

    createCeiling() {
        const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
            width: 35,
            height: 0.3,
            depth: 45
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, 10, -10);
        // Q/E and look-up-and-walk fly the desktop camera; it must stop at the roof.
        ceiling.checkCollisions = true;
        
        // Industrial concrete/metal ceiling
        const ceilingMat = this.materialFactory.getPreset('ceiling');
        
        // Apply downloaded concrete ceiling textures if available
        if (this.concreteTextures && this.concreteTextures.ceiling) {
            log.info('🎨 Applying ceiling textures (Polyhaven - Raw Concrete)');
            this.textureLoader.applyTexturesToMaterial(ceilingMat, this.concreteTextures.ceiling);
            
            // Adjust for darker, more industrial look
            ceilingMat.baseColor = new BABYLON.Color3(0.25, 0.25, 0.28); // Darker industrial concrete
            ceilingMat.roughness = 0.88;
            ceilingMat.environmentIntensity = 0.15; // Subtle light reflections from below
        }
        
        // One 3 m square tile of concrete, not one stretched across 25 x 45 m (see _applyWorldUVs).
        this._applyWorldUVs(ceiling, 3, this.textureLoader && this.textureLoader.textureConfigs.ceiling.scale || { u: 1, v: 1 });
        ceiling.material = ceilingMat;
        ceiling.receiveShadows = false; // Optimization Phase 3: Disable shadows on ceiling
        ceiling.freezeWorldMatrix(); // OPTIMIZATION: Freeze static ceiling
        ceiling.doNotSyncBoundingInfo = true;

        // === INDUSTRIAL CEILING DETAILS (PIPES & VENTS) ===
        // Add some pipes running along the ceiling for hyperrealism
        const pipeMat = this.materialFactory.getPreset('pipe'); // Ensure 'pipe' preset exists or use 'truss'
        
        // Main ventilation duct
        const ventDuct = BABYLON.MeshBuilder.CreateCylinder("ventDuct", {
            diameter: 0.8,
            height: 45,
            tessellation: 16
        }, this.scene);
        ventDuct.rotation.x = Math.PI / 2;
        ventDuct.position = new BABYLON.Vector3(-12, 9.2, -10);
        ventDuct.material = pipeMat;
        ventDuct.freezeWorldMatrix();
        ventDuct.doNotSyncBoundingInfo = true;

        // Smaller water pipes
        const pipe1 = BABYLON.MeshBuilder.CreateCylinder("ceilingPipe1", {
            diameter: 0.15,
            height: 45,
            tessellation: 8
        }, this.scene);
        pipe1.rotation.x = Math.PI / 2;
        pipe1.position = new BABYLON.Vector3(14, 9.5, -10);
        pipe1.material = pipeMat;
        pipe1.freezeWorldMatrix();
        pipe1.doNotSyncBoundingInfo = true;

        const pipe2 = BABYLON.MeshBuilder.CreateCylinder("ceilingPipe2", {
            diameter: 0.15,
            height: 35,
            tessellation: 8
        }, this.scene);
        pipe2.rotation.z = Math.PI / 2;
        pipe2.position = new BABYLON.Vector3(0, 9.6, 5);
        pipe2.material = pipeMat;
        pipe2.freezeWorldMatrix();
        pipe2.doNotSyncBoundingInfo = true;

        this.createRoofGirders();
        
        // Add lighting truss above dance floor
        this.createLightingTruss();
    }

    /**
     * Exposed steel I-beam roof girders spanning the hall, the clearest cue that
     * this is an old factory rather than a fitted-out club. They are 0.3 m deep so
     * the wall pipes and the vent duct read as hung from their bottom flanges.
     * Merged into one static mesh: one draw call for the whole roof structure.
     */
    createRoofGirders() {
        const span = 24.5; // wall to wall, inside the 0.5 m side walls
        const depth = 0.3;
        const flange = { width: 0.28, thickness: 0.035 };
        const web = 0.025;
        const top = 9.85; // underside of the ceiling slab
        const parts = [];

        [-2, -6, -10, -14, -18].forEach((z, i) => {
            const topFlange = BABYLON.MeshBuilder.CreateBox(`roofGirderTop${i}`, {
                width: span, height: flange.thickness, depth: flange.width
            }, this.scene);
            topFlange.position.set(0, top - flange.thickness / 2, z);

            const bottomFlange = BABYLON.MeshBuilder.CreateBox(`roofGirderBottom${i}`, {
                width: span, height: flange.thickness, depth: flange.width
            }, this.scene);
            bottomFlange.position.set(0, top - depth + flange.thickness / 2, z);

            const webPlate = BABYLON.MeshBuilder.CreateBox(`roofGirderWeb${i}`, {
                width: span, height: depth - 2 * flange.thickness, depth: web
            }, this.scene);
            webPlate.position.set(0, top - depth / 2, z);

            parts.push(topFlange, bottomFlange, webPlate);
        });

        const girders = BABYLON.Mesh.MergeMeshes(parts, true, true);
        if (!girders) return;
        girders.name = 'roofGirders';
        girders.material = this.materialFactory.getPreset('steelGirder');
        girders.isPickable = false;
        girders.receiveShadows = false;
        girders.freezeWorldMatrix();
        girders.doNotSyncBoundingInfo = true;
    }

    createLightingTruss() {
        // Professional stage truss material - brushed aluminum
        const trussMat = this.materialFactory.getPreset('truss');
        
        // Darker material for diagonal bracing
        const braceMat = this.materialFactory.getPreset('brace');
        
        // Connector plate material
        const connectorMat = this.materialFactory.getPreset('trussConnector');
        
        // Weld material for joints
        const weldMat = this.materialFactory.getPreset('trussWeld');
        
        // Chain hoist material
        const chainMat = this.materialFactory.getPreset('chainHoist');
        
        // === HYPERREALISTIC BOX TRUSS DIMENSIONS ===
        // Based on industry standard 12" (30cm) box truss
        const tubeSize = 0.048; // 48mm (2") tube diameter - standard truss tube
        const trussSize = 0.3; // 300mm (12") overall width/height
        const braceSpacing = 0.5; // 500mm diagonal brace spacing
        
        // Prototype cache keyed by truss length. The three 24 m trusses are geometrically
        // identical to one another, as are the two 10 m cross beams, so each length is
        // built and merged exactly once and every repeat becomes a GPU instance.
        const trussPrototypes = new Map();

        // Build one truss worth of geometry at the origin and collapse it into four merged
        // meshes, one per material.
        //
        // PERFORMANCE: each 24 m truss previously emitted ~690 individual meshes
        // (4 chords + 196 rungs + 384 braces + 96 welds + end plates and bolts). Across the
        // five trusses that was ~2,650 draw calls of completely static scenery - by far the
        // largest draw-call consumer in the scene. Merging by material takes a prototype to
        // 4 meshes, and instancing the repeats takes the entire rig to 8 draw calls.
        // Triangle count is unchanged, so the rig still looks exactly the same.
        const buildTrussParts = (protoName, length) => {
            const halfSize = trussSize / 2;
            const chordParts = [];   // trussMat     - chords + horizontal/vertical rungs
            const braceParts = [];   // braceMat     - diagonal X-bracing
            const weldParts = [];    // weldMat      - weld beads + flange bolts
            const plateParts = [];   // connectorMat - end flanges

            // === FOUR MAIN CHORD TUBES (corners of box) ===
            const chordPositions = [
                { y: halfSize, z: halfSize },   // Top-front
                { y: halfSize, z: -halfSize },  // Top-back
                { y: -halfSize, z: halfSize },  // Bottom-front
                { y: -halfSize, z: -halfSize }  // Bottom-back
            ];
            
            chordPositions.forEach((pos, idx) => {
                const chord = BABYLON.MeshBuilder.CreateCylinder(protoName + "_chord" + idx, {
                    diameter: tubeSize,
                    height: length,
                    tessellation: 12
                }, this.scene);
                chord.rotation.z = Math.PI / 2;
                chord.position = new BABYLON.Vector3(0, pos.y, pos.z);
                chordParts.push(chord);
            });
            
            // === HORIZONTAL RUNGS (connecting chords at intervals) ===
            const segments = Math.floor(length / braceSpacing);
            for (let i = 0; i <= segments; i++) {
                const xPos = -length / 2 + (i * braceSpacing);
                
                // Top horizontal rung (connecting top chords)
                const topRung = BABYLON.MeshBuilder.CreateCylinder(protoName + "_topRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                topRung.rotation.x = Math.PI / 2;
                topRung.position = new BABYLON.Vector3(xPos, halfSize, 0);
                chordParts.push(topRung);
                
                // Bottom horizontal rung
                const bottomRung = BABYLON.MeshBuilder.CreateCylinder(protoName + "_bottomRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                bottomRung.rotation.x = Math.PI / 2;
                bottomRung.position = new BABYLON.Vector3(xPos, -halfSize, 0);
                chordParts.push(bottomRung);
                
                // Front vertical rung (connecting front chords)
                const frontRung = BABYLON.MeshBuilder.CreateCylinder(protoName + "_frontRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                frontRung.position = new BABYLON.Vector3(xPos, 0, halfSize);
                chordParts.push(frontRung);
                
                // Back vertical rung
                const backRung = BABYLON.MeshBuilder.CreateCylinder(protoName + "_backRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                backRung.position = new BABYLON.Vector3(xPos, 0, -halfSize);
                chordParts.push(backRung);
            }
            
            // === DIAGONAL X-BRACING (on all 4 faces) ===
            for (let i = 0; i < segments; i++) {
                const xStart = -length / 2 + (i * braceSpacing);
                const xMid = xStart + braceSpacing / 2;
                const braceLength = Math.sqrt(braceSpacing * braceSpacing + trussSize * trussSize);
                const braceAngle = Math.atan2(trussSize, braceSpacing);
                
                // === TOP FACE X-BRACING ===
                const topBrace1 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_topBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                topBrace1.rotation.z = Math.PI / 2 - braceAngle;
                topBrace1.rotation.x = Math.PI / 2;
                topBrace1.position = new BABYLON.Vector3(xMid, halfSize, 0);
                braceParts.push(topBrace1);
                
                const topBrace2 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_topBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                topBrace2.rotation.z = Math.PI / 2 + braceAngle;
                topBrace2.rotation.x = Math.PI / 2;
                topBrace2.position = new BABYLON.Vector3(xMid, halfSize, 0);
                braceParts.push(topBrace2);
                
                // === BOTTOM FACE X-BRACING ===
                const bottomBrace1 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_bottomBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                bottomBrace1.rotation.z = Math.PI / 2 - braceAngle;
                bottomBrace1.rotation.x = Math.PI / 2;
                bottomBrace1.position = new BABYLON.Vector3(xMid, -halfSize, 0);
                braceParts.push(bottomBrace1);
                
                const bottomBrace2 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_bottomBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                bottomBrace2.rotation.z = Math.PI / 2 + braceAngle;
                bottomBrace2.rotation.x = Math.PI / 2;
                bottomBrace2.position = new BABYLON.Vector3(xMid, -halfSize, 0);
                braceParts.push(bottomBrace2);
                
                // === FRONT FACE X-BRACING ===
                const frontBrace1 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_frontBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                frontBrace1.rotation.z = Math.PI / 2 - braceAngle;
                frontBrace1.position = new BABYLON.Vector3(xMid, 0, halfSize);
                braceParts.push(frontBrace1);
                
                const frontBrace2 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_frontBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                frontBrace2.rotation.z = Math.PI / 2 + braceAngle;
                frontBrace2.position = new BABYLON.Vector3(xMid, 0, halfSize);
                braceParts.push(frontBrace2);
                
                // === BACK FACE X-BRACING ===
                const backBrace1 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_backBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                backBrace1.rotation.z = Math.PI / 2 - braceAngle;
                backBrace1.position = new BABYLON.Vector3(xMid, 0, -halfSize);
                braceParts.push(backBrace1);
                
                const backBrace2 = BABYLON.MeshBuilder.CreateCylinder(protoName + "_backBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                backBrace2.rotation.z = Math.PI / 2 + braceAngle;
                backBrace2.position = new BABYLON.Vector3(xMid, 0, -halfSize);
                braceParts.push(backBrace2);
                
                // === WELD JOINTS at rung connections (every 2nd segment for performance) ===
                if (i % 2 === 0) {
                    chordPositions.forEach((pos, idx) => {
                        const weld = BABYLON.MeshBuilder.CreateTorus(protoName + "_weld" + i + "_" + idx, {
                            diameter: tubeSize * 1.3,
                            thickness: tubeSize * 0.15,
                            tessellation: 8
                        }, this.scene);
                        weld.rotation.z = Math.PI / 2;
                        weld.position = new BABYLON.Vector3(xStart, pos.y, pos.z);
                        weldParts.push(weld);
                    });
                }
            }
            
            // === END PLATES (connector flanges at truss ends) ===
            const createEndPlate = (xPos, isStart) => {
                const plate = BABYLON.MeshBuilder.CreateBox(protoName + "_endPlate" + (isStart ? "Start" : "End"), {
                    width: 0.02,
                    height: trussSize + 0.04,
                    depth: trussSize + 0.04
                }, this.scene);
                plate.position = new BABYLON.Vector3(xPos, 0, 0);
                plateParts.push(plate);
                
                // Corner bolt holes (visual detail)
                const boltPositions = [
                    { y: halfSize, z: halfSize },
                    { y: halfSize, z: -halfSize },
                    { y: -halfSize, z: halfSize },
                    { y: -halfSize, z: -halfSize }
                ];
                boltPositions.forEach((bPos, bIdx) => {
                    const bolt = BABYLON.MeshBuilder.CreateCylinder(protoName + "_bolt" + (isStart ? "S" : "E") + bIdx, {
                        diameter: tubeSize * 0.6,
                        height: 0.025,
                        tessellation: 8
                    }, this.scene);
                    bolt.rotation.z = Math.PI / 2;
                    bolt.position = new BABYLON.Vector3(xPos + (isStart ? -0.01 : 0.01), bPos.y, bPos.z);
                    weldParts.push(bolt);
                });
            };
            
            createEndPlate(-length / 2, true);
            createEndPlate(length / 2, false);
            
            // Collapse each material group into a single mesh. MergeMeshes bakes each
            // source's world matrix, and every part above was built unparented at the
            // origin, so the merged result is already truss-local.
            //
            // allow32BitsIndices must be true: a merged 24 m truss is far past the 65,535
            // index ceiling and would silently fail to merge otherwise.
            //
            // Names keep the "truss" substring because the VR static-freeze sweep in
            // applyVRSettings() and the reflection probe render list in
            // createFloorReflectionProbe() both select meshes by name.
            const mergeGroup = (parts, suffix, material) => {
                if (!parts.length) return null;
                const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
                if (!merged) {
                    this.log.warn(`Truss merge failed for ${protoName}_${suffix}`);
                    return null;
                }
                merged.name = `${protoName}_truss${suffix}`;
                merged.material = material;
                merged.isPickable = false;
                return merged;
            };
            
            return [
                mergeGroup(chordParts, 'Chords', trussMat),
                mergeGroup(braceParts, 'Braces', braceMat),
                mergeGroup(weldParts, 'Welds', weldMat),
                mergeGroup(plateParts, 'Plates', connectorMat)
            ].filter(Boolean);
        };
        
        // Returns a TransformNode so that fixtures can still be parented to a truss the
        // way createTrussMountedLights() and the laser rig expect.
        const createBoxTruss = (name, length, position) => {
            const parent = new BABYLON.TransformNode(name + "_parent", this.scene);
            
            const proto = trussPrototypes.get(length);
            if (proto) {
                // Instances of an already-merged prototype render inside the prototype's
                // own draw call, so a repeated truss is effectively free.
                proto.forEach((src, idx) => {
                    const inst = src.createInstance(`${name}_trussPart${idx}`);
                    inst.isPickable = false;
                    inst.parent = parent;
                });
            } else {
                const parts = buildTrussParts(name, length);
                parts.forEach(part => { part.parent = parent; });
                trussPrototypes.set(length, parts);
            }
            
            parent.position = position;
            return parent;
        };
        
        // Truss 1 - Front (above dance floor front)
        const truss1 = createBoxTruss("truss1", 24, new BABYLON.Vector3(0, 8, -8));
        
        // Truss 2 - Middle (center of dance floor)
        const truss2 = createBoxTruss("truss2", 24, new BABYLON.Vector3(0, 8, -12));
        
        // Truss 3 - Back (near LED wall)
        const truss3 = createBoxTruss("truss3", 24, new BABYLON.Vector3(0, 8, -16));
        
        // Store horizontal trusses for attachment
        this.horizontalTrusses = [truss1, truss2, truss3];
        
        // Cross beams connecting the trusses at the sides (X = -8 and +8)
        // These run perpendicular to main trusses, connecting them together
        // Length of 10m covers Z=-8 to Z=-18 (connecting trusses 1, 2, and 3)
        this.sideTrusses = {};
        const leftSideBeam = createBoxTruss("crossBeamLeft", 10, new BABYLON.Vector3(-8, 8, -12));
        leftSideBeam.rotation.y = Math.PI / 2;
        this.sideTrusses[-8] = leftSideBeam;
        
        const rightSideBeam = createBoxTruss("crossBeamRight", 10, new BABYLON.Vector3(8, 8, -12));
        rightSideBeam.rotation.y = Math.PI / 2;
        this.sideTrusses[8] = rightSideBeam;
        
        // OPTIMIZATION: freeze all truss geometry (fully static).
        // This has to run after the cross beams have been rotated - freezeWorldMatrix()
        // snapshots the matrix as it stands, so freezing inside createBoxTruss() would
        // have locked in the pre-rotation transform.
        [truss1, truss2, truss3, leftSideBeam, rightSideBeam].forEach(node => {
            node.getChildMeshes().forEach(mesh => {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
                // The merged/instanced rig is long and thin. Per-eye frustum tests
                // occasionally reject its frozen bounds after sustained XR head
                // movement, making the entire ceiling structure disappear.
                mesh.alwaysSelectAsActiveMesh = true;
            });
        });
        
        // === HYPERREALISTIC CHAIN MOTOR HOISTS ===
        // Professional stage rigging with chain hoists at strategic points
        const createChainHoist = (position, name) => {
            const hoistParent = new BABYLON.TransformNode(name + "_hoist", this.scene);
            hoistParent.position = position;
            
            // Motor housing (black box unit)
            const motor = BABYLON.MeshBuilder.CreateBox(name + "_motor", {
                width: 0.4,
                height: 0.35,
                depth: 0.3
            }, this.scene);
            motor.position.y = 1.2;
            motor.parent = hoistParent;
            motor.material = this.materialFactory.createPBRMaterial(name + "_motorMat", {
                baseColor: [0.05, 0.05, 0.05],
                metallic: 0.6,
                roughness: 0.7
            });
            
            // Chain drum (silver cylinder)
            const drum = BABYLON.MeshBuilder.CreateCylinder(name + "_drum", {
                diameter: 0.15,
                height: 0.25,
                tessellation: 16
            }, this.scene);
            drum.rotation.z = Math.PI / 2;
            drum.position = new BABYLON.Vector3(0, 1.0, 0);
            drum.parent = hoistParent;
            drum.material = chainMat;
            
            // Chain links (multiple small tori for realistic chain)
            const chainLength = 1.0; // Distance from drum to truss
            const linkCount = 12;
            for (let i = 0; i < linkCount; i++) {
                const link = BABYLON.MeshBuilder.CreateTorus(name + "_link" + i, {
                    diameter: 0.04,
                    thickness: 0.008,
                    tessellation: 8
                }, this.scene);
                link.rotation.x = (i % 2 === 0) ? 0 : Math.PI / 2;
                link.position.y = 0.95 - (i * (chainLength / linkCount));
                link.parent = hoistParent;
                link.material = chainMat;
            }
            
            // Hook at bottom
            const hook = BABYLON.MeshBuilder.CreateTorus(name + "_hook", {
                diameter: 0.08,
                thickness: 0.015,
                tessellation: 16,
                arc: 0.75
            }, this.scene);
            hook.rotation.z = Math.PI;
            hook.position.y = -0.1;
            hook.parent = hoistParent;
            hook.material = chainMat;
            
            // Safety latch
            const latch = BABYLON.MeshBuilder.CreateBox(name + "_latch", {
                width: 0.01,
                height: 0.04,
                depth: 0.06
            }, this.scene);
            latch.position = new BABYLON.Vector3(0.035, -0.08, 0);
            latch.parent = hoistParent;
            latch.material = chainMat;
            
            // Freeze all components
            hoistParent.getChildMeshes().forEach(mesh => {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
            });
            
            return hoistParent;
        };
        
        // Add chain hoists at key truss intersection points
        const hoistPositions = [
            { x: -10, z: -8 },
            { x: -10, z: -16 },
            { x: 10, z: -8 },
            { x: 10, z: -16 },
            { x: 0, z: -8 },
            { x: 0, z: -16 },
            { x: -6, z: -12 },
            { x: 6, z: -12 }
        ];
        
        hoistPositions.forEach((pos, i) => {
            createChainHoist(new BABYLON.Vector3(pos.x, 9, pos.z), "hoist" + i);
        });
        
        // Diagonal support cables/wires from ceiling to truss (safety redundancy) (safety redundancy)
        const cableMat = this.materialFactory.createPBRMaterial("cableMat", {
            baseColor: [0.15, 0.15, 0.15],
            metallic: 0.85,
            roughness: 0.5
        });
        
        // Turnbuckle material (brighter steel)
        const turnbuckleMat = this.materialFactory.createPBRMaterial("turnbuckleMat", {
            baseColor: [0.5, 0.5, 0.52],
            metallic: 0.95,
            roughness: 0.3
        });
        
        // Support cables with turnbuckles
        const cablePositions = [
            { x: -10, z: -8 },
            { x: -10, z: -16 },
            { x: 10, z: -8 },
            { x: 10, z: -16 },
            { x: 0, z: -8 },
            { x: 0, z: -16 }
        ];
        
        cablePositions.forEach((pos, i) => {
            // Main steel cable
            const cable = BABYLON.MeshBuilder.CreateCylinder("cable" + i, {
                diameter: 0.02, // 20mm steel cable
                height: 2,
                tessellation: 8
            }, this.scene);
            cable.position = new BABYLON.Vector3(pos.x, 9, pos.z);
            cable.material = cableMat;
            cable.isPickable = false;
            
            // Turnbuckle tensioner (middle of cable)
            const turnbuckle = BABYLON.MeshBuilder.CreateCylinder("turnbuckle" + i, {
                diameter: 0.04,
                height: 0.12,
                tessellation: 12
            }, this.scene);
            turnbuckle.position = new BABYLON.Vector3(pos.x, 9, pos.z);
            turnbuckle.material = turnbuckleMat;
            turnbuckle.isPickable = false;
            
            // End eye bolts
            const eyeBolt1 = BABYLON.MeshBuilder.CreateTorus("eyeBolt1_" + i, {
                diameter: 0.03,
                thickness: 0.006,
                tessellation: 12
            }, this.scene);
            eyeBolt1.rotation.z = Math.PI / 2;
            eyeBolt1.position = new BABYLON.Vector3(pos.x, 9.95, pos.z);
            eyeBolt1.material = turnbuckleMat;
            eyeBolt1.isPickable = false;
            
            const eyeBolt2 = BABYLON.MeshBuilder.CreateTorus("eyeBolt2_" + i, {
                diameter: 0.03,
                thickness: 0.006,
                tessellation: 12
            }, this.scene);
            eyeBolt2.rotation.z = Math.PI / 2;
            eyeBolt2.position = new BABYLON.Vector3(pos.x, 8.05, pos.z);
            eyeBolt2.material = turnbuckleMat;
            eyeBolt2.isPickable = false;
            
            // Freeze static geometry
            cable.freezeWorldMatrix();
            cable.doNotSyncBoundingInfo = true;
            turnbuckle.freezeWorldMatrix();
            turnbuckle.doNotSyncBoundingInfo = true;
            eyeBolt1.freezeWorldMatrix();
            eyeBolt1.doNotSyncBoundingInfo = true;
            eyeBolt2.freezeWorldMatrix();
            eyeBolt2.doNotSyncBoundingInfo = true;
        });
    }
    
}
window.VRClubEnvironment = VRClubEnvironment;
