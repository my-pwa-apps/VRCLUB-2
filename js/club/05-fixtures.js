'use strict';
class VRClubFixtures extends VRClubEnvironment {
    createDJBooth() {
        // === HYPERREALISTIC INTEGRATED DJ/VJ BOOTH ===
        // Positioned at BACK of club. DJ faces the DANCE FLOOR (toward +z).
        //
        // === BOOTH LAYOUT ANCHORS ===
        // Every piece of gear below is placed relative to these four numbers.
        // The previous hard-coded values had drifted badly:
        //   - the deck row sat at z -20.75..-19.25, i.e. straight THROUGH the LED
        //     wall plane at z = -20, with the mixer display entirely behind it;
        //   - the whole VJ control surface (desk, 12 buttons, speed slider) was
        //     parked at z -26.7..-28.3 - six to eight metres OUTSIDE the building;
        //   - the work surface was only 0.34 m above the riser deck, i.e. knee
        //     height for anyone actually standing in the booth.
        // The result was that there was nowhere for an operator to stand between
        // the wall and the gear, and nothing reachable to operate.
        //
        //   LED wall plane          z = -20.00   (210 emissive panels - keep clear)
        //   operator standing zone  z = -20.00 .. -19.00  (1.0 m, on the riser)
        //   deck row                z = -19.00 .. -18.00
        //   booth front face        z = -18.00 (the table itself is the collider)
        const RISER_TOP_Y = 0.5;    // top face of djPlatform / djPlatformTop
        const DECK_Z = -18.5;       // centre of the deck row
        const DECK_DEPTH = 1.0;     // front edge lands on the booth barrier at z = -18
        const DECK_TOP_Y = 1.42;    // work surface: 0.92 m above the riser deck
        
        log.info("🎛️ Creating integrated DJ/VJ booth...");
        
        // === RAISED PLATFORM (STAGE) ===
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 6,
            height: 0.5,
            depth: 4
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.25, -18);
        
        const platformMat = this._venueSurfaceMaterial('stageRust', 'stageRustMat', [0.55, 0.55, 0.55], 0.4);
        this._applyWorldUVs(platform, 2, { u: 1, v: 1 });
        platform.material = platformMat;
        platform.receiveShadows = true;
        platform.checkCollisions = true; // Enable collisions for walking
        platform.freezeWorldMatrix(); // OPTIMIZATION: Freeze static platform
        platform.doNotSyncBoundingInfo = true;
        
        // Anti-slip surface
        const platformTop = BABYLON.MeshBuilder.CreateBox("djPlatformTop", {
            width: 6,
            height: 0.02,
            depth: 4
        }, this.scene);
        platformTop.position = new BABYLON.Vector3(0, 0.51, -18);
        
        const topMat = this.materialFactory.getPreset('platformTop');
        platformTop.material = topMat;
        platformTop.receiveShadows = true;
        platformTop.checkCollisions = true; // Enable collisions for walking
        platformTop.freezeWorldMatrix(); // OPTIMIZATION: Freeze static platform top
        platformTop.doNotSyncBoundingInfo = true;
        
        // Front safety rail
        const railMat = this.materialFactory.getPreset('rail');
        
        // Front edge nosing on the deck plinth. This used to be a free-floating
        // bar at z = -19, which the re-layout puts inside the standing zone at
        // shin height; as a nosing it instead marks the plinth's front face.
        const frontRail = BABYLON.MeshBuilder.CreateBox("frontRail", {
            width: 4,
            height: 0.08,
            depth: 0.08
        }, this.scene);
        frontRail.position = new BABYLON.Vector3(0, DECK_TOP_Y - 0.04, DECK_Z + DECK_DEPTH / 2 + 0.04);
        frontRail.material = railMat;
        
        // === DJ EQUIPMENT PLINTH (CENTER) ===
        // A solid box from the riser deck up to the work surface rather than a
        // floating slab, so the decks have something underneath them and the
        // booth reads as a real front-of-house fascia from the dance floor.
        const djTable = BABYLON.MeshBuilder.CreateBox("djTable", {
            width: 4,
            height: DECK_TOP_Y - RISER_TOP_Y,
            depth: DECK_DEPTH
        }, this.scene);
        djTable.position = new BABYLON.Vector3(0, (DECK_TOP_Y + RISER_TOP_Y) / 2, DECK_Z);
        
        const tableMat = this.materialFactory.getPreset('table');
        djTable.material = tableMat;
        djTable.checkCollisions = true;

        const worktop = BABYLON.MeshBuilder.CreatePlane('djWoodWorktop', { width: 4, height: DECK_DEPTH }, this.scene);
        worktop.rotation.x = Math.PI / 2;
        worktop.position.set(0, DECK_TOP_Y + 0.002, DECK_Z);
        worktop.material = this._barWoodMaterial();
        this._applyWorldUVs(worktop, 1, { u: 1, v: 1 });
        worktop.isPickable = false;
        worktop.freezeWorldMatrix();
        worktop.doNotSyncBoundingInfo = true;
        
        // === CDJ DECKS ===
        const cdjMat = this.materialFactory.getPreset('cdjBody');
        
        // Left CDJ
        const leftCDJ = BABYLON.MeshBuilder.CreateBox("leftCDJ", {
            width: 1.2,
            height: 0.1,
            depth: 1.0
        }, this.scene);
        leftCDJ.position = new BABYLON.Vector3(-1.5, DECK_TOP_Y + 0.05, DECK_Z);
        leftCDJ.material = cdjMat;
        
        // Left jog wheel (glowing)
        const leftJog = BABYLON.MeshBuilder.CreateCylinder("leftJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        leftJog.position = new BABYLON.Vector3(-1.5, DECK_TOP_Y + 0.12, DECK_Z);
        const jogMat = this.materialFactory.getPreset('jogWheel');
        leftJog.material = jogMat;
        
        // Right CDJ
        const rightCDJ = BABYLON.MeshBuilder.CreateBox("rightCDJ", {
            width: 1.2,
            height: 0.1,
            depth: 1.0
        }, this.scene);
        rightCDJ.position = new BABYLON.Vector3(1.5, DECK_TOP_Y + 0.05, DECK_Z);
        rightCDJ.material = cdjMat;
        
        // Right jog wheel
        const rightJog = BABYLON.MeshBuilder.CreateCylinder("rightJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        rightJog.position = new BABYLON.Vector3(1.5, DECK_TOP_Y + 0.12, DECK_Z);
        rightJog.material = jogMat.clone("rightJogMat");
        
        // === DJ MIXER (CENTER) ===
        const mixer = BABYLON.MeshBuilder.CreateBox("mixer", {
            width: 1.8,
            height: 0.12,
            depth: 0.9
        }, this.scene);
        mixer.position = new BABYLON.Vector3(0, DECK_TOP_Y + 0.05, DECK_Z);
        mixer.material = cdjMat; // Reuse CDJ material for mixer body
        
        // Mixer display (facing DJ, at the back edge of the plinth)
        const mixerDisplay = BABYLON.MeshBuilder.CreatePlane("mixerDisplay", {
            width: 1.2,
            height: 0.2
        }, this.scene);
        mixerDisplay.position = new BABYLON.Vector3(0, DECK_TOP_Y + 0.14, DECK_Z - DECK_DEPTH / 2);
        mixerDisplay.rotation.x = Math.PI / 6;
        const displayMat = this.materialFactory.createStandardMaterial("mixerDisplayMat", {
            emissiveColor: [0, 1, 0.5],
            disableLighting: true
        });
        mixerDisplay.material = displayMat;
        
        // === THE VJ DESK ===
        // Two angled touch panels either side of the DJ controller: the show (auto or by hand, the DJ, the music,
        // macros and two faders) on the left, every light on the right. See js/vjDesk.js.
        this.createVJDesk({ top: DECK_TOP_Y, frontZ: DECK_Z - DECK_DEPTH / 2 });
        log.info("✅ Created hyperrealistic integrated DJ/VJ booth");
    }

    createPASpeakers() {
        // === PA SPEAKER SYSTEM ===
        // 3D models are loaded by ModelLoader - no procedural geometry needed
        // This function is kept for compatibility but does nothing
        
        log.info("🔊 PA speakers will be loaded as 3D models by ModelLoader...");
        
        // Procedural PA speakers REMOVED - 3D models used instead
        // The ModelLoader will load PA_Speakers.glb for both left and right stacks
    }

    // createPAStack REMOVED - 3D models are used instead via ModelLoader

    createLEDWall() {
        // MASSIVE LED WALL - covers entire back wall from FLOOR TO CEILING
        // Back wall is 25m wide × 10m tall at Z=-27
        const panelWidth = 1.2;
        const panelHeight = 1.0; // Slightly smaller for more rows
        const cols = 21;  // 21 × 1.2 = 25.2m (fills 25m wall completely)
        const rows = 10;  // 10 × 1.0 = 10m (floor to ceiling)
        const wallWidth = cols * panelWidth;
        
        this.ledPanels = [];

        // ONE mesh for the whole wall. It used to be 210 separate planes, each with its own material:
        // 210 draw calls, half of everything drawn in a frame, and twice that in a headset (once per
        // eye). Each quad remains one physical tile with its original position and seam. Each panel
        // samples its own texel from the shared texture, so its live pattern colour fills the panel.
        const quadW = (panelWidth - 0.12) / 2;   // Larger physical gap (was -0.05) so VR bloom can't bridge tiles;
        const quadH = (panelHeight - 0.12) / 2;  // real walls have a ~6-10 mm bezel per 60 cm tile, so a clear ~6 cm dark seam
        const count = cols * rows;
        const positions = new Float32Array(count * 12);
        const normals = new Float32Array(count * 12);
        const uvs = new Float32Array(count * 8);
        const indices = new Uint16Array(count * 6);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = (col * panelWidth) - (wallWidth / 2) + (panelWidth / 2);
                const y = (row * panelHeight) + (panelHeight / 2) + 0.05; // Start just above floor
                const z = -20; // Behind DJ booth
                const index = row * cols + col;
                const v = index * 4;

                // Faces -Z, toward the dance floor.
                const corners = [[-quadW, -quadH], [quadW, -quadH], [quadW, quadH], [-quadW, quadH]];
                const uv = [(col + 0.5) / cols, (row + 0.5) / rows];
                for (let k = 0; k < 4; k++) {
                    positions.set([x + corners[k][0], y + corners[k][1], z], (v + k) * 3);
                    normals.set([0, 0, -1], (v + k) * 3);
                    uvs.set(uv, (v + k) * 2);
                }
                indices.set([v, v + 1, v + 2, v, v + 2, v + 3], index * 6);

                // Remove most backlights - only minimal ambient
                if (row === 3 && col === 5) {
                    const backLight = new BABYLON.PointLight("ledBack_" + row + "_" + col,
                        new BABYLON.Vector3(x, y, z - 0.5), this.scene);
                    backLight.diffuse = new BABYLON.Color3(0.5, 0, 0);
                    backLight.intensity = 0.5; // Very subtle
                    backLight.range = 3;
                    backLight.setEnabled(false); // Start disabled
                }
            }
        }

        const wall = new BABYLON.Mesh('ledPanel_wall', this.scene);
        const wallData = new BABYLON.VertexData();
        wallData.positions = positions;
        wallData.normals = normals;
        wallData.uvs = uvs;
        wallData.indices = indices;
        wallData.applyToMesh(wall);

        // One texel per physical panel. Float where the GPU samples it (so a colour above 1.0
        // still drives the glow as it did), else 8-bit, which the on-screen clamp makes identical.
        const caps = this.engine.getCaps();
        const useFloat = !!caps.textureFloat;
        const wallBuffer = useFloat
            ? new Float32Array(cols * rows * 4)
            : new Uint8Array(cols * rows * 4);
        const wallTexture = new BABYLON.RawTexture(
            wallBuffer, cols, rows, BABYLON.Constants.TEXTUREFORMAT_RGBA, this.scene,
            false, false, BABYLON.Constants.TEXTURE_NEAREST_SAMPLINGMODE,
            useFloat ? BABYLON.Constants.TEXTURETYPE_FLOAT : BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE);
        wallTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        wallTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        wallTexture.name = 'ledWallColours';

        // VERY LOW BASE BRIGHTNESS - so blackout patterns are clearly visible. The colour comes
        // entirely from the texture; the material's own emissive colour stays black.
        const wallMat = this.materialFactory.createStandardMaterial('ledWallMat', {
            mutable: true, // the texture is rewritten every frame
            emissiveColor: [0, 0, 0],
            emissiveTexture: wallTexture,
            disableLighting: true
        });
        wallMat.backFaceCulling = false; // Ensure visible from both sides
        wall.material = wallMat;
        wall.checkCollisions = true;

        // The visible wall is tiled geometry with deliberate bezel gaps. A continuous thin backing prevents a
        // camera at the booth from slipping through a seam and falling into the narrow space behind it.
        const wallCollider = BABYLON.MeshBuilder.CreateBox('ledWallCollider', {
            // Overlap the side-wall collision volumes so the camera cannot squeeze
            // around an edge into the space behind the LED wall.
            width: wallWidth + 0.4,
            height: rows * panelHeight,
            depth: 0.3
        }, this.scene);
        wallCollider.position.set(0, rows * panelHeight / 2 + 0.05, -20.15);
        wallCollider.checkCollisions = true;
        wallCollider.isPickable = false;
        wallCollider.isVisible = false;
        wallCollider.freezeWorldMatrix();
        wallCollider.doNotSyncBoundingInfo = true;
        this._ledWallCollider = wallCollider;

        // PERFORMANCE: static geometry
        wall.freezeWorldMatrix();
        wall.doNotSyncBoundingInfo = true;
        wall.isPickable = false;
        this._ledWall = { mesh: wall, texture: wallTexture, buffer: wallBuffer, useFloat, cols, rows };

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                this.ledPanels.push({
                    mesh: wall,
                    // What the patterns write to. A plain holder, not a Babylon material: the wall
                    // has one material, and _flushLedWall() turns these colours into texels.
                    material: {
                        emissiveColor: new BABYLON.Color3(0.1, 0, 0), // MUCH dimmer for contrast
                        unfreeze() {}, freeze() {}
                    },
                    row: row,
                    col: col,
                    centerX: col - (cols / 2) + 0.5,
                    centerY: row - (rows / 2) + 0.5,
                    // Every colour written to this panel goes through this one
                    // Color3. Two reasons, both load-bearing:
                    //  1. Several patterns mutate `material.emissiveColor` in
                    //     place. If that ever points at a shared cached colour
                    //     they silently corrupt it — this is exactly how
                    //     cachedColors.black stopped being black and left the
                    //     "wall off" looks glowing a dim purple.
                    //  2. The render loop forbids per-frame allocation, and the
                    //     old scale() path allocated 210 Color3s every frame.
                    colorBuffer: new BABYLON.Color3(0, 0, 0)
                });
            }
        }
        this._flushLedWall();
        
        this.ledTime = 0;
        this.ledPattern = 0;  // Start with Hypnotic Spiral — the flagship immersive vortex
        this.ledPatternSwitchTime = 0;
        this.ledColorIndex = 0;
        this.lastColorChange = 0;  // Initialize to 0 instead of -1
        this.lastPatternChange = 0;  // Initialize to 0 instead of -1
        this.lastExplosionTime = 0;  // Initialize explosion timer
        
        // Store LED grid dimensions for pattern calculations
        this.ledCols = cols;
        this.ledRows = rows;
        
        // Initialize LED panels with a visible color to confirm they work
        log.info(`🎨 LED Wall created: ${cols}x${rows} = ${this.ledPanels.length} panels`);
        
        // Beat detection and BPM tracking
        this.bpm = 130; // Default 130 BPM
        this.beatInterval = 60 / this.bpm; // ~0.46 seconds per beat
        this.lastBeat = 0;
        this.beatThreshold = 0.15; // Bass threshold for beat detection
        this.lastBassLevel = 0;
        
        // BPM detection from audio
        this.beatHistory = []; // Track detected beat times
        this.maxBeatHistory = 8; // Use last 8 beats for BPM calculation
        this.detectedBPM = 130; // Detected BPM from music
        this.lastBPMUpdate = 0;
    }

    createHyperrealisticSmoke() {
        // === HYPERREALISTIC FOG MACHINE SYSTEM ===
        // Two fog machines mounted on trusses that blow fog into the room
        // Based on professional Martin/MDG haze machines used in real clubs
        
        log.info('💨 Creating hyperrealistic fog machine system...');
        
        const noise = (x, y, seed, period) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            let fx = x - ix, fy = y - iy;
            fx = fx * fx * (3 - 2 * fx);
            fy = fy * fy * (3 - 2 * fy);
            const hash = (px, py) => {
                let h = (Math.imul(px + seed, 374761393) + Math.imul(py + seed * 31, 668265263)) >>> 0;
                h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
                return ((h ^ (h >>> 16)) & 0xffff) / 65535;
            };
            const x0 = ((ix % period) + period) % period, y0 = ((iy % period) + period) % period;
            const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
            const a = hash(x0, y0) + (hash(x1, y0) - hash(x0, y0)) * fx;
            const b = hash(x0, y1) + (hash(x1, y1) - hash(x0, y1)) * fx;
            return a + (b - a) * fy;
        };
        const smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = smokeCanvas.height = 512;
        const smokeContext = smokeCanvas.getContext('2d');
        const smokeImage = smokeContext.createImageData(512, 512);
        for (let cell = 0; cell < 16; cell++) {
            const seed = cell + 1;
            const angle = (cell * 2.399963) % (Math.PI * 2);
            const ca = Math.cos(angle), sa = Math.sin(angle);
            const sx = 0.84 + (cell % 3) * 0.08;
            const sy = 1.18 - (cell % 3) * 0.07;
            for (let py = 0; py < 128; py++) {
                for (let px = 0; px < 128; px++) {
                    const u = (px + 0.5) / 64 - 1, v = (py + 0.5) / 64 - 1;
                    const rOuterSq = u * u + v * v;
                    if (rOuterSq >= 0.98) continue;
                    const ru = (u * ca - v * sa) * sx;
                    const rv = (u * sa + v * ca) * sy;
                    // Smooth low-frequency domain warp only (no high-frequency grit/speckles):
                    // overlapping warped Gaussian pillows merge into a velvety, continuous glycol vapour cloud.
                    const warpX = (noise(ru * 1.4 + 5, rv * 1.4 + 3, seed + 17, 6) - 0.5) * 0.44;
                    const warpY = (noise(ru * 1.4 - 4, rv * 1.4 + 7, seed + 29, 6) - 0.5) * 0.44;
                    const wx = ru + warpX, wy = rv + warpY;
                    const rWarpedSq = wx * wx + wy * wy;
                    const gaussian = Math.exp(-3.1 * rWarpedSq);
                    const borderFade = Math.max(0, Math.min(1, (0.98 - rOuterSq) / 0.30));
                    const borderSmooth = borderFade * borderFade * (3 - 2 * borderFade);
                    const billow = 0.68 + 0.32 * (
                        noise(wx * 1.6 + 2, wy * 1.6 - 3, seed, 6) * 0.68 +
                        noise(wx * 3.1 - 5, wy * 3.1 + 4, seed + 43, 12) * 0.32
                    );
                    const alpha = Math.round(158 * gaussian * borderSmooth * billow);
                    const index = ((Math.floor(cell / 4) * 128 + py) * 512 +
                        (cell % 4) * 128 + px) * 4;
                    smokeImage.data[index] = 255;
                    smokeImage.data[index + 1] = 255;
                    smokeImage.data[index + 2] = 255;
                    smokeImage.data[index + 3] = alpha;
                }
            }
        }
        smokeContext.putImageData(smokeImage, 0, 0);
        const particleTexture = new BABYLON.DynamicTexture('proceduralSmokeTexture', smokeCanvas, this.scene, false);
        particleTexture.hasAlpha = true;
        particleTexture.update(false);
        this._fogParticleTexture = particleTexture; // Store for reuse

        const dustCanvas = document.createElement('canvas');
        dustCanvas.width = dustCanvas.height = 128;
        const dustContext = dustCanvas.getContext('2d');
        const dustGradient = dustContext.createRadialGradient(64, 64, 0, 64, 64, 64);
        dustGradient.addColorStop(0, 'rgba(255,255,255,1)');
        dustGradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
        dustGradient.addColorStop(0.6, 'rgba(255,255,255,0.25)');
        dustGradient.addColorStop(1, 'rgba(255,255,255,0)');
        dustContext.fillStyle = dustGradient;
        dustContext.fillRect(0, 0, 128, 128);
        this._dustParticleTexture = new BABYLON.DynamicTexture('proceduralDustTexture', dustCanvas, this.scene, false);
        this._dustParticleTexture.hasAlpha = true;
        this._dustParticleTexture.update(false);
        
        // === FOG MACHINE POSITIONS ===
        // Mounted on front truss (z=-8) on left and right sides, turned inward toward the dance floor (-Z, z=-12)
        const fogMachinePositions = [
            { x: -6, y: 7.8, z: -8, rotY: Math.PI - 0.3 },   // Left fog machine, angled inward toward dance floor
            { x: 6, y: 7.8, z: -8, rotY: Math.PI + 0.3 }     // Right fog machine, angled inward toward dance floor
        ];
        
        this.fogMachines = [];
        
        fogMachinePositions.forEach((pos, i) => {
            // === CREATE FOG MACHINE 3D MODEL ===
            // Based on Martin Jem ZR35 industrial fog machine dimensions
            const machineParent = new BABYLON.TransformNode(`fogMachine${i}_parent`, this.scene);
            machineParent.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
            machineParent.rotation.y = pos.rotY;
            
            // Main body (rectangular housing)
            // UPGRADE: Shared material for all fog machine bodies
            const bodyMat = this.materialFactory.createPBRMaterial('fogMachineBodyShared', {
                baseColor: [0.15, 0.15, 0.15], // Dark gray
                metallic: 0.6,
                roughness: 0.4
            }, true); // shared
            
            const body = i
                ? this.fogMachines[0].body.createInstance(`fogMachineBody${i}`)
                : BABYLON.MeshBuilder.CreateBox(`fogMachineBody${i}`, {
                    width: 0.6,
                    height: 0.35,
                    depth: 0.4
                }, this.scene);
            body.position = new BABYLON.Vector3(0, 0, 0);
            body.parent = machineParent;
            if (!i) body.material = bodyMat;
            // UPGRADE: Freeze static fog machine hardware
            body.freezeWorldMatrix();
            body.doNotSyncBoundingInfo = true;
            
            // Mounting bracket (attaches to truss)
            const bracketMat = this.materialFactory.getPreset('barStool');
            const bracket = i
                ? this.fogMachines[0].bracket.createInstance(`fogMachineBracket${i}`)
                : BABYLON.MeshBuilder.CreateBox(`fogMachineBracket${i}`, {
                    width: 0.15,
                    height: 0.1,
                    depth: 0.3
                }, this.scene);
            bracket.position = new BABYLON.Vector3(0, 0.22, 0);
            bracket.parent = machineParent;
            if (!i) bracket.material = bracketMat;
            bracket.freezeWorldMatrix();
            bracket.doNotSyncBoundingInfo = true;
            
            // Nozzle (where fog comes out)
            // UPGRADE: Shared material for all fog machine nozzles
            const nozzleMat = this.materialFactory.createPBRMaterial('fogMachineNozzleShared', {
                baseColor: [0.08, 0.08, 0.08],
                metallic: 0.8,
                roughness: 0.2
            }, true); // shared
            
            const nozzle = i
                ? this.fogMachines[0].nozzle.createInstance(`fogMachineNozzle${i}`)
                : BABYLON.MeshBuilder.CreateCylinder(`fogMachineNozzle${i}`, {
                    diameter: 0.12,
                    height: 0.15,
                    tessellation: 12
                }, this.scene);
            nozzle.position = new BABYLON.Vector3(0, -0.25, 0.1);
            nozzle.rotation.x = Math.PI / 2 + 0.3; // Angled slightly downward
            nozzle.parent = machineParent;
            if (!i) nozzle.material = nozzleMat;
            nozzle.freezeWorldMatrix();
            nozzle.doNotSyncBoundingInfo = true;
            
            // Status LED
            const ledMat = this.materialFactory.createStandardMaterial(`fogMachineLED${i}`, {
                mutable: true, // colour written at runtime
                emissiveColor: [0, 0.3, 0], // Subtle green when ready
                disableLighting: true
            });
            const led = BABYLON.MeshBuilder.CreateSphere(`fogMachineLED${i}`, {
                diameter: 0.03,
                segments: 8
            }, this.scene);
            led.position = new BABYLON.Vector3(0.25, 0.1, 0.21);
            led.parent = machineParent;
            led.material = ledMat;
            led.freezeWorldMatrix();
            led.doNotSyncBoundingInfo = true;
            
            // === FOG PARTICLE EMITTER ===
            // Directional plume from nozzle on the dance-floor side of the front truss (z = -8.15)
            const fogEmitter = new BABYLON.ParticleSystem(
                `fogEmitter${i}`, this.tierSettings.fogParticleCapacity, this.scene);
            fogEmitter.particleTexture = particleTexture;
            fogEmitter.isAnimationSheetEnabled = true;
            fogEmitter.spriteCellWidth = fogEmitter.spriteCellHeight = 128;
            fogEmitter.startSpriteCellID = 0;
            fogEmitter.endSpriteCellID = 15;
            fogEmitter.spriteCellChangeSpeed = 0.8;
            fogEmitter.spriteRandomStartCell = true;
            
            // World position of the angled nozzle mouth (turned toward -Z dance floor)
            const nozzleWorldPos = new BABYLON.Vector3(
                pos.x + 0.15 * Math.sin(pos.rotY),
                pos.y - 0.25,
                pos.z + 0.15 * Math.cos(pos.rotY)
            );
            fogEmitter.emitter = nozzleWorldPos;
            
            // 12 cm nozzle aperture box
            fogEmitter.minEmitBox = new BABYLON.Vector3(-0.06, -0.06, -0.06);
            fogEmitter.maxEmitBox = new BABYLON.Vector3(0.06, 0.06, 0.06);
            
            // Unlit base colour is dark club air (zero self-brightness): plumes only light up from active club lighting
            fogEmitter.color1 = new BABYLON.Color4(0.035, 0.04, 0.055, 0.21);
            fogEmitter.color2 = new BABYLON.Color4(0.03, 0.035, 0.05, 0.17);
            fogEmitter.colorDead = new BABYLON.Color4(0.02, 0.025, 0.035, 0.0);
            
            // Smooth overlapping vapor pillows (compact at nozzle, wide rolling cloud bank on floor, VR-safe overdraw)
            fogEmitter.minSize = 1.15;
            fogEmitter.maxSize = 2.35;
            fogEmitter.minScaleX = 1.15;
            fogEmitter.maxScaleX = 1.48;
            fogEmitter.minScaleY = 0.82;
            fogEmitter.maxScaleY = 1.06;
            fogEmitter.minInitialRotation = -Math.PI;
            fogEmitter.maxInitialRotation = Math.PI;
            
            // Lifetime (with updateSpeed = 0.008, 4.8..8.5 units is ~10..17.5 real seconds, within tier capacities)
            fogEmitter.minLifeTime = 4.8;
            fogEmitter.maxLifeTime = 8.5;
            
            // Emission rate (VJ controlled). Leave manualEmitCount at default (-1) so Babylon uses emitRate;
            // setting manualEmitCount = 0 puts Babylon's ParticleSystem into manual mode with 0 particles!
            fogEmitter.emitRate = 55;
            fogEmitter.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            
            // Direction - pressurized nozzle jet aimed down onto the dance floor and deep toward the DJ booth (z = -18)
            const centerDir = i === 0 ? 0.56 : -0.56; // Left machine aims right (+X), right aims left (-X)
            fogEmitter.direction1 = new BABYLON.Vector3(centerDir - 0.18, -0.82, -1.16);
            fogEmitter.direction2 = new BABYLON.Vector3(centerDir + 0.36, -0.36, -0.58);
            
            // Velocity — industrial pressurized glycol jet with hyperbolic entrainment decay
            fogEmitter.minEmitPower = 5.0;
            fogEmitter.maxEmitPower = 8.0;
            
            // Physics - cooled dense vapor settles onto the floor and drifts toward the stage
            fogEmitter.gravity = new BABYLON.Vector3(0, -0.24, -0.10);
            fogEmitter.limitVelocityDamping = 0.14;
            fogEmitter.addLimitVelocityGradient(0.00, 8.0);
            fogEmitter.addLimitVelocityGradient(0.24, 5.5);
            fogEmitter.addLimitVelocityGradient(0.55, 2.9);
            fogEmitter.addLimitVelocityGradient(0.82, 1.48);
            fogEmitter.addLimitVelocityGradient(1.00, 0.62);
            
            // Rotation for natural billow turbulence
            fogEmitter.minAngularSpeed = -0.18;
            fogEmitter.maxAngularSpeed = 0.18;
            
            // Normalized size growth (compact nozzle exit -> smooth overlapping cloud pillows across floor & stage)
            fogEmitter.addSizeGradient(0.0, 0.28);
            fogEmitter.addSizeGradient(0.22, 0.74);
            fogEmitter.addSizeGradient(0.62, 1.15);
            fogEmitter.addSizeGradient(1.0, 1.42);
            
            // 6-key alpha/colour envelope: visible wispy smoke plumes illuminated by club fixtures
            fogEmitter.addColorGradient(0.00, new BABYLON.Color4(0.035, 0.04, 0.055, 0.00));
            fogEmitter.addColorGradient(0.06, new BABYLON.Color4(0.035, 0.04, 0.055, 0.21));
            fogEmitter.addColorGradient(0.24, new BABYLON.Color4(0.035, 0.04, 0.055, 0.175));
            fogEmitter.addColorGradient(0.52, new BABYLON.Color4(0.03, 0.035, 0.05, 0.13));
            fogEmitter.addColorGradient(0.82, new BABYLON.Color4(0.025, 0.03, 0.04, 0.075));
            fogEmitter.addColorGradient(1.00, new BABYLON.Color4(0.02, 0.025, 0.035, 0.00));
            
            fogEmitter.updateSpeed = 0.008;
            fogEmitter.preWarmCycles = 120;
            fogEmitter.preWarmStepOffset = 2;
            fogEmitter.start();
            
            // Store references
            this.fogMachines.push({
                parent: machineParent,
                body: body,
                bracket: bracket,
                nozzle: nozzle,
                led: led,
                ledMat: ledMat,
                emitter: fogEmitter,
                position: pos,
                burstTimer: 0,
                isBursting: false
            });
        });
        
        // === AMBIENT HAZE (residual fog in air) ===
        // Light dispersed particles from accumulated fog - makes beams visible
        this.haze = new BABYLON.ParticleSystem("haze", this.tierSettings.hazeCapacity, this.scene);
        this.haze.particleTexture = particleTexture;
        this.haze.isAnimationSheetEnabled = true;
        this.haze.spriteCellWidth = this.haze.spriteCellHeight = 128;
        this.haze.startSpriteCellID = 0;
        this.haze.endSpriteCellID = 15;
        this.haze.spriteCellChangeSpeed = 0.45;
        this.haze.spriteRandomStartCell = true;
        this.haze.minInitialRotation = -Math.PI;
        this.haze.maxInitialRotation = Math.PI;
        this.haze.minAngularSpeed = -0.08;
        this.haze.maxAngularSpeed = 0.08;
        this.haze.minScaleX = 1.15;
        this.haze.maxScaleX = 1.48;
        this.haze.minScaleY = 0.80;
        this.haze.maxScaleY = 1.05;
        
        // Emitter covers dance floor area
        this.haze.emitter = new BABYLON.Vector3(0, 4, -12);
        this.haze.minEmitBox = new BABYLON.Vector3(-10, -3, -8);
        this.haze.maxEmitBox = new BABYLON.Vector3(10, 3, 8);
        
        // Visible ambient haze - makes light beams stand out. color1/color2 carry the
        // peak alpha (vrSettings.hazeAlpha, asserted by tests and rewritten on a VR/desktop
        // switch); the gradients below shape each puff's life around that peak so a
        // puff condenses out of the air and thins away instead of popping into view.
        this.haze.color1 = new BABYLON.Color4(0.6, 0.6, 0.7, this.vrSettings.desktop.hazeAlpha[0]);
        this.haze.color2 = new BABYLON.Color4(0.7, 0.7, 0.8, this.vrSettings.desktop.hazeAlpha[1]);
        this.haze.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
        this._hazeFade = [0, 1, 1, 0];
        [0, 0.16, 0.7, 1].forEach((stop, k) => {
            const fade = this._hazeFade[k];
            this.haze.addColorGradient(stop,
                new BABYLON.Color4(0.6, 0.6, 0.7, this.vrSettings.desktop.hazeAlpha[0] * fade),
                new BABYLON.Color4(0.7, 0.7, 0.8, this.vrSettings.desktop.hazeAlpha[1] * fade));
        });
        this._hazeGradients = this.haze.getColorGradients ? this.haze.getColorGradients() : null;
        // Bounded size growth avoids large full-screen quads that hurt headset fill rate.
        this.haze.addSizeGradient(0, 0.55);
        this.haze.addSizeGradient(0.3, 0.92);
        this.haze.addSizeGradient(1, 1.12);
        
        // Smoke, not glow sprites. STANDARD keeps the asserted alphas from
        // adding a white sheet over the floor; size stays inside the beam volume.
        this.haze.minSize = 1.0;
        this.haze.maxSize = 2.0;
        this.haze.minLifeTime = 8.0;
        this.haze.maxLifeTime = 15.0;
        
        this.haze.emitRate = 80; // Thick haze for beam visibility
        this.haze.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        this.haze.gravity = new BABYLON.Vector3(0, 0.02, 0);
        this.haze.direction1 = new BABYLON.Vector3(-0.3, -0.1, -0.3);
        this.haze.direction2 = new BABYLON.Vector3(0.3, 0.2, 0.3);
        
        this.haze.minEmitPower = 0.05;
        this.haze.maxEmitPower = 0.2;
        this.haze.updateSpeed = 0.005;
        // A club's air is already hazy when you walk in. Without this the room starts
        // empty and the medium builds up in front of the guest over ~30 s.
        this.haze.preWarmCycles = 800;
        this.haze.preWarmStepOffset = 2;
        
        // Haze is always running when smoke is active
        this.haze.start();
        
        // === AIRBORNE DUST MOTES ===
        // Haze makes a beam visible as a solid volume; individual glinting motes are
        // what make it read as real air. Tiny additive sprites represent visible glints,
        // not the physical size of individual airborne dust grains.
        const moteCapacity = this.graphicsTier === 'ultra' ? 1400
            : this.graphicsTier === 'high' ? 900 : 400;
        this.dustMotes = new BABYLON.ParticleSystem("dustMotes", moteCapacity, this.scene);
        this.dustMotes.particleTexture = this._dustParticleTexture;
        this.dustMotes.emitter = new BABYLON.Vector3(0, 4, -12);
        this.dustMotes.minEmitBox = new BABYLON.Vector3(-11, -3.5, -8);
        this.dustMotes.maxEmitBox = new BABYLON.Vector3(11, 3.5, 8);
        this.dustMotes.color1 = new BABYLON.Color4(1, 0.98, 0.92, 0.5);
        this.dustMotes.color2 = new BABYLON.Color4(0.9, 0.94, 1.0, 0.38);
        this.dustMotes.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        // Motes drift into the light and out of it; none blink on or off.
        [[0, 0], [0.18, 1], [0.8, 1], [1, 0]].forEach(([stop, fade]) => {
            this.dustMotes.addColorGradient(stop,
                new BABYLON.Color4(1, 0.98, 0.92, 0.5 * fade),
                new BABYLON.Color4(0.9, 0.94, 1.0, 0.38 * fade));
        });
        this.dustMotes.preWarmCycles = 600;
        this.dustMotes.preWarmStepOffset = 3;
        this.dustMotes.minSize = 0.003;
        this.dustMotes.maxSize = 0.012;
        this.dustMotes.minLifeTime = 6.0;
        this.dustMotes.maxLifeTime = 14.0;
        this.dustMotes.emitRate = moteCapacity / 10;
        this.dustMotes.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        // Convection off a room full of people: motes drift upward, never fall.
        this.dustMotes.gravity = new BABYLON.Vector3(0, 0.012, 0);
        this.dustMotes.direction1 = new BABYLON.Vector3(-0.06, 0.02, -0.06);
        this.dustMotes.direction2 = new BABYLON.Vector3(0.06, 0.09, 0.06);
        this.dustMotes.minEmitPower = 0.01;
        this.dustMotes.maxEmitPower = 0.05;
        this.dustMotes.updateSpeed = 0.006;
        this.dustMotes.start();
        if (typeof this._installAirLighting === 'function') this._installAirLighting();
        
        // Initialize fog machine state
        this.smokeActive = true;
        this.fogBurstMode = 'auto'; // 'auto', 'burst', 'continuous'
        this.fogIntensity = 1.0; // 0.0 to 2.0
        this.lastFogBurst = 0;
        this.fogBurstInterval = 4; // Seconds between auto bursts (real hazers cycle frequently)
        
        log.info('💨 Hyperrealistic fog machine system created (2 machines on truss)');
    }

    createBoothLighting() {
        // LED strip under platform (accent lighting)
        const stripMat = this.materialFactory.createStandardMaterial("ledStripMat", {
            mutable: true, // colour written at runtime
            emissiveColor: [0, 0.5, 1],
            disableLighting: true,
            alpha: 0.8
        });
        
        for (const side of [-4.2, 4.2]) {
            const strip = BABYLON.MeshBuilder.CreateBox("ledStrip", {
                width: 8,
                height: 0.05,
                depth: 0.1
            }, this.scene);
            strip.position = new BABYLON.Vector3(0, 0.15, -24 + side);
            strip.rotation.x = Math.PI / 2;
            strip.material = stripMat;
            
            // Point light for LED strip effect
            const stripLight = new BABYLON.PointLight("stripLight" + side,
                new BABYLON.Vector3(0, 0.3, -24 + side), this.scene);
            stripLight.diffuse = new BABYLON.Color3(0, 0.5, 1);
            stripLight.intensity = 2;
            stripLight.range = 3;
            stripLight.setEnabled(false); // Start disabled - floor strips not needed initially
        }
    }

    // Bar area removed - will be replaced with 3D models later

    createTrussMountedLights() {
        // Moving head lights on truss - ONLY for spotlights (6 fixtures to match 6 spotlights)
        const lightFixtureMat = this.materialFactory.getPreset('lightFixture');
        
        // Where the side cross beams (x = ±sideTrussX) cross the three main trusses (z -8, -12, -16).
        // Must match spotPositions in createLights().
        const sideX = CLUB_POSITIONS.sideTrussX;
        const lightPositions = [
            { x: -sideX, z: -8 },   // Left, front truss
            { x: -sideX, z: -12 },  // Left, middle truss
            { x: -sideX, z: -16 },  // Left, rear truss
            { x: sideX, z: -8 },    // Right, front truss
            { x: sideX, z: -12 },   // Right, middle truss
            { x: sideX, z: -16 }    // Right, rear truss
        ];
        
        this.trussLights = [];
        const clampMat = this.materialFactory.createPBRMaterial("spotClampMatShared", {
            baseColor: [0.1, 0.1, 0.1], // Dark gray steel
            metallic: 0.9,
            roughness: 0.4
        }, true); // shared
        const bezelMat = this.materialFactory.createPBRMaterial("bezelMatShared", {
            baseColor: [0.02, 0.02, 0.02],
            metallic: 0.8,
            roughness: 0.4
        }, true); // shared
        const clampParts = [];
        const staticBaseParts = [];

        lightPositions.forEach((pos, i) => {
            // === REALISTIC MOVING HEAD FIXTURE WITH TRUSS MOUNTING ===
            // Hierarchy: Root -> Clamp (on truss) -> Drop Pipe -> Base (Static) -> Yoke (Pan) -> Head (Tilt)
            
            // Root Transform Node (for positioning the whole unit)
            const root = new BABYLON.TransformNode("lightRoot" + i, this.scene);
            root.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            
            // C-Clamp body (wraps around truss tube at Y=8)
            const clamp = BABYLON.MeshBuilder.CreateTorus("clamp" + i, {
                diameter: 0.12,  // Fits around 48mm (0.048m) truss tube
                thickness: 0.02,
                tessellation: 16,
                arc: 0.85  // Open C-shape
            }, this.scene);
            clamp.position.set(pos.x, 8.0, pos.z);
            clamp.rotation.x = Math.PI / 2;  // Horizontal orientation
            clamp.rotation.z = Math.PI;  // Open side facing outward
            clampParts.push(clamp);
            
            // Clamp bolt (tightening mechanism)
            const clampBolt = BABYLON.MeshBuilder.CreateCylinder("clampBolt" + i, {
                diameter: 0.03,
                height: 0.08,
                tessellation: 8
            }, this.scene);
            clampBolt.position.set(pos.x + 0.06, 8.0, pos.z);
            clampBolt.rotation.z = Math.PI / 2;
            clampParts.push(clampBolt);
            
            // Drop pipe (vertical pipe from clamp to fixture base)
            const dropPipe = BABYLON.MeshBuilder.CreateCylinder("dropPipe" + i, {
                diameter: 0.04,
                height: 0.2,  // 0.2m drop from truss to fixture
                tessellation: 12
            }, this.scene);
            dropPipe.position.set(pos.x, 7.9, pos.z);
            staticBaseParts.push(dropPipe);
            
            // Safety cable (realistic safety loop)
            const safetyCable = BABYLON.MeshBuilder.CreateTorus("safetyCable" + i, {
                diameter: 0.15,
                thickness: 0.005,
                tessellation: 16
            }, this.scene);
            safetyCable.position.set(pos.x, 7.95, pos.z);
            safetyCable.rotation.x = Math.PI / 2;
            clampParts.push(safetyCable);

            // 1. BASE (Static mount)
            const base = BABYLON.MeshBuilder.CreateBox("fixtureBase" + i, {
                width: 0.4,
                height: 0.1,
                depth: 0.4
            }, this.scene);
            base.position.set(pos.x, 7.8, pos.z);
            staticBaseParts.push(base);
            
            // 2. YOKE (Pan mechanism - Rotates around Y)
            const yoke = new BABYLON.TransformNode("yoke" + i, this.scene);
            yoke.parent = root;
            yoke.position.y = -0.1; // Below base
            
            // All yokes share the same rigid geometry; only their parent pan nodes move.
            let yokeMesh;
            if (i) {
                yokeMesh = this.trussLights[0].yokeMesh.createInstance("yokeMesh" + i);
                yokeMesh.parent = yoke;
                yokeMesh.position.set(0, 0, 0);
            } else {
                const yokeCrossbar = BABYLON.MeshBuilder.CreateBox("yokeCross" + i, {
                    width: 0.5,
                    height: 0.05,
                    depth: 0.15
                }, this.scene);
                yokeCrossbar.position.y = 0;

                const yokeArmL = BABYLON.MeshBuilder.CreateBox("yokeArmL" + i, {
                    width: 0.05,
                    height: 0.4,
                    depth: 0.15
                }, this.scene);
                yokeArmL.position = new BABYLON.Vector3(-0.225, -0.2, 0);

                const yokeArmR = BABYLON.MeshBuilder.CreateBox("yokeArmR" + i, {
                    width: 0.05,
                    height: 0.4,
                    depth: 0.15
                }, this.scene);
                yokeArmR.position = new BABYLON.Vector3(0.225, -0.2, 0);

                yokeMesh = BABYLON.Mesh.MergeMeshes([yokeCrossbar, yokeArmL, yokeArmR], true, true, undefined, false, false);
                if (yokeMesh) {
                    yokeMesh.name = "yokeMesh" + i;
                    yokeMesh.parent = yoke;
                    yokeMesh.material = lightFixtureMat;
                    yokeMesh.isPickable = false;
                }
            }

            // 3. HEAD (Tilt mechanism - Rotates around X)
            // Pivot point is between the yoke arms
            const head = new BABYLON.TransformNode("head" + i, this.scene);
            head.parent = yoke;
            head.position.y = -0.2; // Center of rotation between arms
            
            // Main fixture body
            const fixture = i
                ? this.trussLights[0].fixture.createInstance("lightFixture" + i)
                : BABYLON.MeshBuilder.CreateCylinder("lightFixture" + i, {
                    diameterTop: 0.3,
                    diameterBottom: 0.38,
                    height: 0.5,
                    tessellation: 20
                }, this.scene);
            fixture.parent = head;
            fixture.position.y = 0;
            if (!i) fixture.material = lightFixtureMat;
            
            // Recessed front rim keeps the aperture readable without a separate bulb or billboard flare.
            const bezel = i
                ? this.trussLights[0].bezel.createInstance("bezel" + i)
                : BABYLON.MeshBuilder.CreateTorus("bezel" + i, {
                    diameter: 0.37,
                    thickness: 0.025,
                    tessellation: 20
                }, this.scene);
            bezel.parent = head;
            bezel.position.y = -0.255;
            if (!i) bezel.material = bezelMat;
            
            // Light lens
            const lens = BABYLON.MeshBuilder.CreateCylinder("lens" + i, {
                diameter: 0.34,
                height: 0.02,
                tessellation: 20
            }, this.scene);
            lens.parent = head;
            lens.position.y = -0.26;
            
            const lensMat = this.materialFactory.createStandardMaterial("lensMat" + i, {
                mutable: true,
                emissiveColor: [0, 0, 0],
                disableLighting: true
            });
            lensMat.backFaceCulling = false;
            lens.material = lensMat;
            lens.renderingGroupId = 2;

            if (this.glowLayer) {
                this.glowLayer.addIncludedOnlyMesh(lens);
            }
            
            this.trussLights.push({ 
                root,
                yoke,
                head,
                yokeMesh,
                fixture, 
                lens, 
                lensMat, 
                base: null,
                bezel
            });
        });

        for (const [name, parts, mat] of [
            ['spotMountingClamps', clampParts, clampMat],
            ['spotStaticBases', staticBaseParts, lightFixtureMat]
        ]) {
            const merged = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, false);
            if (merged) {
                merged.name = name;
                merged.material = mat;
                merged.isPickable = false;
                merged.freezeWorldMatrix();
                merged.doNotSyncBoundingInfo = true;
            }
        }
        
        // Strobe lights on the side trusses
        this.createStrobeLights();
    }
    
    createStrobeLights() {
        const sideX = CLUB_POSITIONS.sideTrussX;
        const strobePositions = [
            { x: -sideX, z: -9.2 },
            { x: sideX, z: -9.2 },
            { x: -sideX, z: -14.8 },
            { x: sideX, z: -14.8 }
        ];
        
        this.strobes = [];

        const glareTexture = new BABYLON.DynamicTexture('strobeGlareFalloff', { width: 64, height: 64 }, this.scene, false);
        const glareContext = glareTexture.getContext();
        const glareGradient = glareContext.createRadialGradient(32, 32, 0, 32, 32, 32);
        glareGradient.addColorStop(0, 'rgba(255,255,255,1)');
        glareGradient.addColorStop(0.42, 'rgba(255,255,255,0.95)');
        glareGradient.addColorStop(0.72, 'rgba(255,255,255,0.32)');
        glareGradient.addColorStop(1, 'rgba(255,255,255,0)');
        glareContext.fillStyle = glareGradient;
        glareContext.fillRect(0, 0, 64, 64);
        glareTexture.hasAlpha = true;
        glareTexture.update();
        this._strobeGlareTexture = glareTexture;
        
        // Reuse clamp material for strobe mounts
        const strobeMountMat = this.materialFactory.createPBRMaterial("strobeMountMat", {
            baseColor: [0.14, 0.14, 0.15], metallic: 0.8, roughness: 0.5
        }, true); // shared
        const casingMat = this.materialFactory.createPBRMaterial('strobeCasingMat', {
            baseColor: [0.05, 0.05, 0.055], metallic: 0.3, roughness: 0.3
        }, true);
        const reflectorMat = this.materialFactory.createPBRMaterial('strobeReflectorMat', {
            baseColor: [0.48, 0.5, 0.53], metallic: 0.85, roughness: 0.7
        }, true);
        const tubeMat = this.materialFactory.createPBRMaterial('strobeTubeMat', {
            baseColor: [0.55, 0.57, 0.6], metallic: 0, roughness: 0.8
        }, true);
        const strobeMountParts = [];
        
        strobePositions.forEach((pos, i) => {
            // === STROBE MOUNTING HARDWARE ===
            // Bracket that connects strobe to truss
            const bracket = BABYLON.MeshBuilder.CreateBox("strobeBracket" + i, {
                width: 0.1,
                height: 0.4,  // Drops from truss (Y=8) to strobe (Y=7.6)
                depth: 0.1
            }, this.scene);
            bracket.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            strobeMountParts.push(bracket);
            
            // Clamp at top (grips truss)
            const clamp = BABYLON.MeshBuilder.CreateTorus("strobeClamp" + i, {
                diameter: 0.1, // Babylon's diameter is the tube centreline; outer diameter is 0.12 m.
                thickness: 0.02,
                tessellation: 12,
                arc: 0.85
            }, this.scene);
            clamp.position = new BABYLON.Vector3(pos.x, 8, pos.z);
            clamp.rotation.x = Math.PI / 2;
            strobeMountParts.push(clamp);
            
            const strobe = i ? this.strobes[0].mesh.createInstance('strobe' + i) : BABYLON.MeshBuilder.CreateBox("strobe" + i, {
                width: 1.05,
                height: 0.36,
                depth: 0.22
            }, this.scene);
            strobe.position = new BABYLON.Vector3(pos.x, 7.6, pos.z);
            strobe.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
                Math.atan2(-pos.x, -12 - pos.z),
                Math.atan2(7.6 - 1.7, Math.hypot(pos.x, -12 - pos.z)), 0);
            strobe.isPickable = false;
            if (!i) strobe.material = casingMat;

            const reflector = i ? this.strobes[0].reflector.createInstance('strobeReflector' + i)
                : BABYLON.MeshBuilder.CreatePlane('strobeReflector' + i, { width: 0.94, height: 0.28 }, this.scene);
            reflector.parent = strobe;
            reflector.position.set(0, 0, 0.112);
            reflector.rotation.y = Math.PI;
            reflector.isPickable = false;
            if (!i) reflector.material = reflectorMat;

            const tube = i ? this.strobes[0].tube.createInstance('strobeTube' + i)
                : BABYLON.MeshBuilder.CreatePlane('strobeTube' + i, { width: 0.87, height: 0.055 }, this.scene);
            tube.parent = strobe;
            tube.position.set(0, 0, 0.116);
            tube.rotation.y = Math.PI;
            tube.isPickable = false;
            if (!i) tube.material = tubeMat;

            const strobeMat = this.materialFactory.createStandardMaterial("strobeMat" + i, {
                mutable: true, // colour written at runtime
                emissiveColor: [0, 0, 0], // Off by default
                disableLighting: true
            });
            // A dark additive emitter leaves the reflector and resting tube visible.
            strobeMat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            strobeMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            strobeMat.disableDepthWrite = true;

            const emitter = BABYLON.MeshBuilder.CreatePlane("strobeEmitter" + i, {
                width: 0.87,
                height: 0.21
            }, this.scene);
            emitter.parent = strobe;
            emitter.position.set(0, 0, 0.12);
            emitter.rotation.y = Math.PI;
            emitter.material = strobeMat;
            emitter.isPickable = false;
            emitter.renderingGroupId = 2;
            emitter.setEnabled(false);
            if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(emitter);

            const glare = BABYLON.MeshBuilder.CreatePlane(`strobeGlare${i}`, {
                width: 1.8,
                height: 0.9
            }, this.scene);
            glare.parent = strobe;
            glare.position.set(0, 0, 0.13);
            glare.rotation.y = Math.PI;
            glare.isPickable = false;
            glare.renderingGroupId = 2;
            glare.setEnabled(false);
            const glareMat = this.materialFactory.createStandardMaterial(`strobeGlareMat${i}`, {
                mutable: true, emissiveColor: [0, 0, 0], opacityTexture: glareTexture, disableLighting: true
            });
            glareMat.alpha = 0;
            glareMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            glareMat.disableDepthWrite = true;
            glareMat.backFaceCulling = false;
            glare.material = glareMat;
            if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(glare);
            
            // DISABLED: Strobe PointLights caused shader uniform buffer overflow
            // WebGL2 PBR materials have strict uniform buffer limits (~12)
            // With 6 spotlights + ambient + LED + strobes = too many lights
            // Visual strobe effect still works via emissive mesh materials
            const strobeLight = null; // Disabled - strobe visual only via emissive mesh
            
            this.strobes.push({ 
                mesh: strobe, 
                reflector,
                tube,
                emitter,
                glare,
                glareMaterial: glareMat,
                material: strobeMat,
                light: strobeLight, // null - visual-only strobe
                flashDuration: 0
            });
        });

        const mergedStrobeMounts = BABYLON.Mesh.MergeMeshes(strobeMountParts, true, true, undefined, false, false);
        if (mergedStrobeMounts) {
            mergedStrobeMounts.name = 'strobeMounts';
            mergedStrobeMounts.material = strobeMountMat;
            mergedStrobeMounts.isPickable = false;
            mergedStrobeMounts.freezeWorldMatrix();
            mergedStrobeMounts.doNotSyncBoundingInfo = true;
        }
        
        // === SHARED STROBE FLASH LIGHT ===
        // Single PointLight high above dance floor that flashes with strobes
        // Uses 1 light slot instead of 4 (respects GPU uniform limits)
        this.strobeFlashLight = new BABYLON.PointLight("strobeFlash", 
            new BABYLON.Vector3(0, 8, -12), this.scene);
        this.strobeFlashLight.diffuse = new BABYLON.Color3(1, 1, 1);
        this.strobeFlashLight.specular = new BABYLON.Color3(1, 1, 1);
        this.strobeFlashLight.intensity = 0;
        this.strobeFlashLight.range = 35;
        this.strobeFlashLight.setEnabled(false);

        // ACES tone mapping deliberately preserves detail in very bright frames,
        // which also suppresses the momentary retinal veil a real xenon discharge
        // creates. A scene Layer renders in both XR eyes (unlike a DOM overlay) and
        // starts fully transparent; updateStrobes drives it only during the impulse.
        const flashCanvas = document.createElement('canvas');
        flashCanvas.width = 1;
        flashCanvas.height = 1;
        const flashContext = flashCanvas.getContext('2d');
        flashContext.fillStyle = '#ffffff';
        flashContext.fillRect(0, 0, 1, 1);
        this.strobeRetinalFlash = new BABYLON.Layer(
            'strobeRetinalFlash',
            flashCanvas.toDataURL(),
            this.scene,
            false,
            new BABYLON.Color4(1, 1, 1, 0)
        );

    }

    createLasers() {
        
        this.lasers = [];
        
        // Lasers mounted UNDER the truss (hanging down)
        // ALL LASERS ARE MULTI-BEAM TYPE (5 rotating beams each)
        // The side units hang from the side cross beams at z -14, between the moving heads.
        const sideX = CLUB_POSITIONS.sideTrussX;
        const laserPositions = [
            { x: -sideX, z: -14, trussY: 7.55, type: 'multi' },  // left cross beam
            { x: 0, z: -8, trussY: 7.55, type: 'multi' },        // centre, under the front truss
            { x: sideX, z: -14, trussY: 7.55, type: 'multi' }    // right cross beam
        ];
        
        laserPositions.forEach((pos, i) => {

            
            // Determine parent truss for each laser
            let parentTruss = null;
            let localX = pos.x;
            let localZ = pos.z;
            
            // The side cross beams are turned a quarter turn about y, so their local x runs along world -z
            // (local z runs along world x). Offsetting along local z, as this used to, slid the side units
            // 2 m sideways off their beams (x -10 and +6) instead of 2 m along them.
            if (pos.x < -3 && this.sideTrusses && this.sideTrusses.left) {
                parentTruss = this.sideTrusses.left;
                localX = -(pos.z - (-12));
                localZ = 0;
            } else if (pos.x > 3 && this.sideTrusses && this.sideTrusses.right) {
                parentTruss = this.sideTrusses.right;
                localX = -(pos.z - (-12));
                localZ = 0;
            } else if (Math.abs(pos.x) <= 3 && this.horizontalTrusses && this.horizontalTrusses.length > 1) {
                // CENTER laser mounts to truss2 (Z=-12, index 1)
                // Laser is at z=-14, truss2 is at z=-12
                parentTruss = this.horizontalTrusses[1]; // truss2 at Z=-12
                localX = 0; // Center on truss
                localZ = pos.z - (-12); // Relative to truss z position (-14 - (-12) = -2)
            }
            
            // Mounting clamp connecting to truss
            const clamp = BABYLON.MeshBuilder.CreateBox("laserClamp" + i, {
                width: 0.3,
                height: 0.15,
                depth: 0.3
            }, this.scene);
            
            if (parentTruss) {
                clamp.position = new BABYLON.Vector3(localX, -0.2, localZ);
                clamp.parent = parentTruss;
            } else {
                clamp.position = new BABYLON.Vector3(pos.x, pos.trussY + 0.25, pos.z);
            }
            const clampMat = this.materialFactory.createPBRMaterial("laserClampMat", {
                mutable: true, // colour written at runtime
                baseColor: [0.3, 0.3, 0.3],
                metallic: 1.0,
                roughness: 0.4
            }, true); // UPGRADE: shared across all laser clamps
            clamp.material = clampMat;
            
            // Laser housing UNDER truss (hanging from clamp)
            const housing = BABYLON.MeshBuilder.CreateBox("laserHousing" + i, {
                width: 0.25,
                height: 0.2,
                depth: 0.35
            }, this.scene);
            
            if (parentTruss) {
                housing.position = new BABYLON.Vector3(localX, -0.45, localZ);
                housing.parent = parentTruss;
            } else {
                housing.position = new BABYLON.Vector3(pos.x, pos.trussY, pos.z);
            }
            housing.isPickable = false;
            
            const housingMat = this.materialFactory.createPBRMaterial("projectorHousingMat", {
                baseColor: [0.05, 0.05, 0.05],
                metallic: 0.8,
                roughness: 0.3
            }, true); // shared across all laser housings; a projector's body does not glow
            housing.material = housingMat;
            housing.isPickable = false;
            
            // Exit aperture on the underside: these units hang inverted under the truss and fan their
            // beams downward, so the beams must leave the bottom face, not the housing's centre.
            const emitter = BABYLON.MeshBuilder.CreateCylinder("laserEmitter" + i, {
                diameter: 0.07,
                height: 0.012,
                tessellation: 16
            }, this.scene);
            
            if (parentTruss) {
                emitter.position = new BABYLON.Vector3(localX, -0.556, localZ + 0.06);
                emitter.parent = parentTruss;
            } else {
                emitter.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.106, pos.z + 0.06);
            }
            emitter.isPickable = false;
            
            // Shared across all laser emitters. createStandardMaterial has no cache path,
            // so this must go through the memoised preset - passing a third `shared`
            // argument silently produced one fresh material (and GPU program) per emitter.
            const emitterMat = this.materialFactory.getPreset('laserEmitter');
            emitterMat.backFaceCulling = false;
            emitter.material = emitterMat;
            emitter.renderingGroupId = 2; // Render on top for visibility
            if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(emitter);
            
            // Logical beams. Geometry lives in one shared segmented ribbon batch built after the loop.
            const beams = [];
            // No real lights: 15 SpotLights would overflow every PBR material's light budget.
            const lights = [];
            const beamCount = pos.type === 'multi' ? 5 : (pos.type === 'spread' ? 3 : 1);
            for (let j = 0; j < beamCount; j++) beams.push({ beamIndex: j, length: 0 });
            
            const actualWorldPos = emitter.computeWorldMatrix(true).getTranslation();
            
            this.lasers.push({
                beams: beams,
                housing: housing,
                clamp: clamp,
                housingMat: housingMat,
                emitter: emitter,
                emitterMat: emitterMat,
                lights: lights,
                rotation: i === 2 ? Math.PI : 0,
                rotationSpeed: 0.01,
                tiltPhase: 0,
                direction: i === 2 ? -1 : 1,
                originPos: actualWorldPos,
                parentTruss: parentTruss,
                localPos: new BABYLON.Vector3(localX, -0.45, localZ),
                type: pos.type,
                colorIndex: 0
            });
            
            // UPGRADE: Freeze static laser hardware (clamp, housing, emitter don't animate)
            clamp.freezeWorldMatrix();
            clamp.doNotSyncBoundingInfo = true;
            housing.freezeWorldMatrix();
            housing.doNotSyncBoundingInfo = true;
            emitter.freezeWorldMatrix();
            emitter.doNotSyncBoundingInfo = true;
        });

        const totalBeams = this.lasers.reduce((sum, laser) => sum + laser.beams.length, 0);
        this.laserBeamBatch = this._createLaserBeamBatch(totalBeams);
        let slot = 0;
        for (const laser of this.lasers) {
            for (const beam of laser.beams) {
                beam.slot = slot++;
                beam.mesh = this.laserBeamBatch.mesh;
                beam.material = this.laserBeamBatch.material;
            }
        }
        
        // Initialize lighting mode control
        this.lightingMode = 'synchronized'; // or 'random'
        this.modeSwitchTime = 0;
        this.currentColorIndex = 0;
        this.colorSwitchTime = 0;
        
        // Retained phase names decode older manual snapshots; only ShowDirector chooses automatic looks.
        this.lightingPhase = 'tension';
        this.currentShowMode = 'spotlights';
        this.energyLevel = 0.7;
        
        // === INITIAL TENSION PHASE SETTINGS ===
        // Starting in 'tension' phase means we need to set all the effect states here
        // Each aerial system has its own moment.
        this.lightsActive = true;
        this.lasersActive = false;
        this.mirrorBallActive = false;
        this.strobesActive = true;      // Strobes ENABLED for immediate impact
        this.laserSheetActive = false;
        this.smokeActive = true;        // Haze for beam visibility
        
        this.spotlightPattern = 3;      // CROSSED BEAMS for tension
        this.spotlightMode = 0;         // Strobe + sweep
        this.spotlightSpeed = 1.2;
        this.laserSpeed = 1.0;
        this.ledWallSpeed = 1.2;
        this.strobeSpeed = 1.5;         // Active strobe rate
        
        // === IMMERSIVE ANIMATION PARAMETERS ===
        // Professional VJ timing variables for crowd-focused moments
        this.crowdFocusIntensity = 0; // 0-1: How much focus on dance floor
        this.beamConvergencePoint = new BABYLON.Vector3(0, 2, -12); // Center of dance floor
        this.colorTransitionSpeed = 0.5; // How fast colors morph
        this.syncedBeatPhase = 0; // All lights pulse together on beat
        this.dramaticPauseTimer = 0; // For tension builds
        this.spotlightChaseIndex = 0; // For chase sequences
        this.laserFanAngle = 0; // For expanding/contracting laser fans
        
    }
    
    /**
     * One dynamic mesh for every ceiling-laser beam, without surface-hit dots.
     *
     * A real show beam is 2-5 mm wide: at club distances that is under a pixel, so a modelled cylinder
     * aliases into a dashed, crawling line. Each beam is instead a camera-facing ribbon never narrower
     * than a few pixels, carrying a Gaussian core and a faint scatter halo in its opacity profile, with its
     * brightness divided by the widening so a distant beam does not turn into a bright bar
     * (updateLasers()). Brightness lives in vertex alpha, which the glow layer reads too.
     */
    _createLaserBeamBatch(count) {
        const segments = 6;
        const profile = (name, w, h, alphaAt) => {
            const tex = new BABYLON.DynamicTexture(name, { width: w, height: h }, this.scene, false);
            const ctx = tex.getContext();
            const img = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const o = (y * w + x) * 4;
                    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
                    img.data[o + 3] = Math.round(255 * Math.min(1, alphaAt((x + 0.5) / w, (y + 0.5) / h)));
                }
            }
            ctx.putImageData(img, 0, 0);
            tex.update();
            tex.hasAlpha = true;
            tex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            return tex;
        };
        // A narrow core and halo across the beam, with restrained axial variation from turbulent haze.
        const beamTex = profile('laserBeamProfile', 64, 128, (u, v) => {
            const s = 2 * u - 1;
            const transverse = Math.exp(-(s / 0.11) * (s / 0.11)) +
                0.2 * Math.exp(-(s / 0.45) * (s / 0.45));
            const eddy = 0.88 + 0.12 * (
                0.55 * Math.sin(v * 31 + s * 4.3) +
                0.3 * Math.sin(v * 73 - s * 8.1) +
                0.15 * Math.cos(v * 137 + s * 2.7));
            return transverse * Math.max(0.65, eddy);
        });
        const build = (name, texture) => {
            const mesh = new BABYLON.Mesh(name, this.scene);
            const quadCount = count * segments;
            const positions = new Float32Array(quadCount * 12);
            const colors = new Float32Array(quadCount * 16);
            const normals = new Float32Array(quadCount * 12);
            const uvs = new Float32Array(quadCount * 8);
            const indices = new Uint16Array(quadCount * 6);
            for (let i = 0; i < quadCount; i++) {
                uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
                for (let k = 0; k < 4; k++) {
                    normals[(i * 4 + k) * 3 + 1] = 1;
                    colors.set([1, 1, 1, 0], (i * 4 + k) * 4);
                }
                const v = i * 4;
                indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
            }
            const data = new BABYLON.VertexData();
            data.positions = positions;
            data.normals = normals;
            data.uvs = uvs;
            data.colors = colors;
            data.indices = indices;
            data.applyToMesh(mesh, true);
            mesh.hasVertexAlpha = true;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true; // vertices move every frame; the bounds do not
            mesh.renderingGroupId = 2;
            mesh.setEnabled(false);

            const mat = new BABYLON.StandardMaterial(`${name}Mat`, this.scene);
            mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            mat.opacityTexture = texture;
            mat.disableLighting = true;
            mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            mat.backFaceCulling = false;
            mat.disableDepthWrite = true;
            // Additive light must not be mixed toward the fog colour: that greys a beam out instead of
            // dimming it. Distance attenuation is applied in the vertex alpha.
            mat.fogEnabled = false;
            mesh.material = mat;
            // EffectLayer renders only its selected emissive meshes, not the opaque venue depth
            // that hides them. Blooming a whole beam there therefore makes it visible through walls.
            // The ribbon already carries its own scatter halo and remains correctly depth-tested.
            if (this.glowLayer && this.glowLayer.addExcludedMesh) this.glowLayer.addExcludedMesh(mesh);
            return { mesh, material: mat, positions, colors };
        };

        const beams = build('laser_beams', beamTex);
        return {
            count,
            segments,
            mesh: beams.mesh,
            material: beams.material,
            positions: beams.positions,
            colors: beams.colors,
            hit: { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
        };
    }

}
window.VRClubFixtures = VRClubFixtures;
