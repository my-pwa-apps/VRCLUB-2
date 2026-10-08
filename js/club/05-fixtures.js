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
        //   booth front barrier     z = -18.05 .. -17.55  (collisionWall5)
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
        
        const platformMat = this.materialFactory.getPreset('platform');
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
        // shin height; as a nosing it instead marks the plinth's front face,
        // which is exactly where the invisible booth barrier (collisionWall5) sits.
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
        
        // === AUDIO STREAM CONTROL BUTTON ===
        const audioBtn = BABYLON.MeshBuilder.CreateBox("audioStreamBtn", {
            width: 0.4,
            height: 0.08,
            depth: 0.25
        }, this.scene);
        // Sits on the VJ control inlay along the front lip of the plinth. Keep it
        // clear of the DJ console model's footprint (x -0.51..0.51, z -18.89..-18.35)
        // or the button ends up buried inside the gear and unpickable.
        audioBtn.position = new BABYLON.Vector3(-0.75, DECK_TOP_Y + 0.07, DECK_Z + 0.33);
        audioBtn.isPickable = true;
        
        const audioBtnMat = this.materialFactory.createStandardMaterial("audioBtnMat", {
            mutable: true, // colour written at runtime
            emissiveColor: [0, 0.8, 0],
            disableLighting: true
        });
        audioBtn.material = audioBtnMat;
        
        // Label (removed diagonal plane - was confusing)
        
        // Store for interaction
        this.audioStreamButton = {
            mesh: audioBtn,
            material: audioBtnMat,
            isPlaying: false
        };
        
        // === MONITOR SPEAKERS REMOVED ===
        // Monitor speakers removed per user request (2025-11-27)
        // The DJ relies on headphones or the main PA system

        
        // === VJ CONTROL SURFACE INLAY ===
        // A shallow raised strip along the front lip of the plinth carrying the
        // audio transport button and the speed slider. This mesh used to be a
        // separate 2.5 x 2.0 desk at x = 3.5 / z = -21.4, which put it behind both
        // the LED wall and the back wall of the building.
        const vjConsole = BABYLON.MeshBuilder.CreateBox("vjConsole", {
            width: 4,
            height: 0.03,
            depth: 0.34
        }, this.scene);
        vjConsole.position = new BABYLON.Vector3(0, DECK_TOP_Y + 0.015, DECK_Z + 0.33);
        vjConsole.material = tableMat;
        
        // VJ Console label removed - buttons are self-explanatory by color
        
        // === VJ CONTROL BUTTONS ===
        // Two rows of six flanking the DJ console model (which occupies x -0.51..0.51),
        // all on the plinth top and all within arm's reach of an operator standing at
        // z ~ -19.4. Buttons are 0.4 wide x 0.3 deep, so these columns/rows leave a
        // 0.06 m gutter between neighbours and 0.16 m either side of the console.
        const VJ_COL_X = [-1.79, -1.33, -0.87, 0.87, 1.33, 1.79];
        const VJ_ROW_Z = [DECK_Z - 0.32, DECK_Z]; // back row (nearest the DJ), front row
        
        const toggleButtons = [
            { 
                label: "SPOTS", 
                control: "lightsActive",
                onColor: new BABYLON.Color3(1, 0.5, 0),
                offColor: new BABYLON.Color3(0.2, 0.1, 0),
                col: 0, row: 0
            },
            { 
                label: "LASERS", 
                control: "lasersActive",
                onColor: new BABYLON.Color3(1, 0, 0),
                offColor: new BABYLON.Color3(0.2, 0, 0),
                col: 1, row: 0
            },
            { 
                label: "LED WALL", 
                control: "ledWallActive",
                onColor: new BABYLON.Color3(0, 0.5, 1),
                offColor: new BABYLON.Color3(0, 0.1, 0.2),
                col: 2, row: 0
            },
            { 
                label: "STROBES", 
                control: "strobesActive",
                onColor: new BABYLON.Color3(1, 1, 1),
                offColor: new BABYLON.Color3(0.2, 0.2, 0.2),
                col: 3, row: 0
            },
            { 
                label: "DISCO BALL", 
                control: "mirrorBallActive",
                onColor: new BABYLON.Color3(1, 1, 0),
                offColor: new BABYLON.Color3(0.2, 0.2, 0),
                col: 0, row: 1
            },
            { 
                label: "B&W WALL",
                control: "ledMonochrome",
                onColor: new BABYLON.Color3(1, 1, 1),
                offColor: new BABYLON.Color3(0.25, 0.25, 0.25),
                col: 1, row: 1
            },
            { 
                label: "NEXT COLOR", 
                control: "changeColor",
                onColor: new BABYLON.Color3(0.5, 1, 0.5),
                offColor: new BABYLON.Color3(0.1, 0.3, 0.1),
                col: 2, row: 1
            },
            { 
                label: "SPOT MODE", 
                control: "cycleSpotMode",
                onColor: new BABYLON.Color3(0, 1, 1), // Cyan
                offColor: new BABYLON.Color3(0, 0.3, 0.3), // Dark cyan
                col: 3, row: 1
            },
            { 
                label: "SMOKE", 
                control: "smokeActive",
                onColor: new BABYLON.Color3(0.8, 0.8, 1.0), // White/Blueish
                offColor: new BABYLON.Color3(0.2, 0.2, 0.3),
                col: 4, row: 0
            },
            { 
                label: "LASER SHEET", 
                control: "laserSheetActive",
                onColor: new BABYLON.Color3(0, 1, 0), // Green
                offColor: new BABYLON.Color3(0, 0.2, 0),
                col: 5, row: 0
            },
            { 
                label: "PATTERN", 
                control: "cyclePattern",
                onColor: new BABYLON.Color3(1, 0.5, 1), // Pink - changes per pattern
                offColor: new BABYLON.Color3(0.2, 0.1, 0.2),
                col: 4, row: 1
            }
        ];
        
        toggleButtons.forEach((btnDef) => {
            const toggleBtn = BABYLON.MeshBuilder.CreateBox("toggleBtn_" + btnDef.control, {
                width: 0.4,
                height: 0.1,
                depth: 0.3
            }, this.scene);
            
            toggleBtn.position = new BABYLON.Vector3(
                VJ_COL_X[btnDef.col],
                DECK_TOP_Y + 0.05, // half the button height, so it rests on the plinth top
                VJ_ROW_Z[btnDef.row]
            );
            toggleBtn.isPickable = true;
            // Determine initial state
            const isActive = this[btnDef.control];
            
            const toggleMat = this.materialFactory.createStandardMaterial("toggleMat_" + btnDef.control, {
                mutable: true, // colour written at runtime
                emissiveColor: isActive ? btnDef.onColor : btnDef.offColor,
                disableLighting: true
            });
            toggleBtn.material = toggleMat;
            
            this.vjControlButtons.push({
                mesh: toggleBtn,
                control: btnDef.control,
                material: toggleMat,
                onColor: btnDef.onColor,
                offColor: btnDef.offColor,
                label: btnDef.label
            });
            
            // Labels removed - they were blocking button access
        });
        
        // === SPEED SLIDER for controlling spotlight sweep speed ===
        // On the VJ control inlay, right of the audio transport button.
        const sliderX = 0.35;
        const sliderZ = DECK_Z + 0.33;
        const sliderY = DECK_TOP_Y + 0.06;
        
        // Slider track (background rail)
        const sliderTrack = BABYLON.MeshBuilder.CreateBox("speedSliderTrack", {
            width: 0.5,  // 0.5m wide
            height: 0.05, // Thin
            depth: 0.1
        }, this.scene);
        sliderTrack.position = new BABYLON.Vector3(sliderX + 0.25, sliderY, sliderZ);
        
        const trackMat = this.materialFactory.createStandardMaterial("sliderTrackMat", {
            emissiveColor: [0.1, 0.1, 0.1], // Dark gray
            disableLighting: true
        });
        sliderTrack.material = trackMat;
        sliderTrack.isPickable = false;
        
        // Slider handle (draggable)
        const sliderHandle = BABYLON.MeshBuilder.CreateBox("speedSliderHandle", {
            width: 0.05, height: 0.06, depth: 0.12
        }, this.scene);
        
        // Initialize slider to current speed (default 1.0 = middle position)
        this.spotlightSpeed = this.spotlightSpeed || 1.0; // 0.1 to 2.0
        const speedToPosition = (speed) => {
            // Speed range: 0.1 to 2.0
            // Position range: sliderX (0.1) to sliderX+0.5 (2.0)
            return sliderX + ((speed - 0.1) / 1.9) * 0.5;
        };
        
        sliderHandle.position = new BABYLON.Vector3(speedToPosition(this.spotlightSpeed), sliderY, sliderZ);
        
        const handleMat = this.materialFactory.createStandardMaterial("sliderHandleMat", {
            mutable: true, // colour written at runtime
            emissiveColor: [0, 0.8, 1], // Cyan
            disableLighting: true
        });
        sliderHandle.material = handleMat;
        sliderHandle.isPickable = true;
        
        // Store slider references
        this.speedSlider = {
            handle: sliderHandle,
            track: sliderTrack,
            handleMat: handleMat,
            minX: sliderX,
            maxX: sliderX + 0.5,
            z: sliderZ,
            y: sliderY,
            isDragging: false
        };
        
        // Add label above slider
        const sliderLabel = BABYLON.MeshBuilder.CreatePlane("speedSliderLabel", {
            width: 0.5,
            height: 0.08
        }, this.scene);
        sliderLabel.position = new BABYLON.Vector3(sliderX + 0.25, sliderY + 0.15, sliderZ);
        sliderLabel.rotation.x = Math.PI / 2; // Face up
        sliderLabel.isPickable = false;
        
        const labelTexture = new BABYLON.DynamicTexture("speedLabelTexture", { width: 512, height: 128 }, this.scene);
        const labelContext = labelTexture.getContext();
        labelContext.fillStyle = "black";
        labelContext.fillRect(0, 0, 512, 128);
        labelContext.font = "bold 60px Arial";
        labelContext.fillStyle = "cyan";
        labelContext.textAlign = "center";
        labelContext.fillText("SPEED", 256, 80);
        labelTexture.update();
        
        const labelMat = this.materialFactory.createStandardMaterial("speedLabelMat", {
            emissiveTexture: labelTexture,
            opacityTexture: labelTexture,
            disableLighting: true
        });
        sliderLabel.material = labelMat;
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
        // eye). The geometry is unchanged: the same 210 quads at the same positions with the same
        // dark seams between them. What changed is how a panel gets its colour: every panel samples
        // one texel of a 21x10 texture (all four of its corners share the texel's centre, so the
        // panel is a flat colour, exactly as before), and the patterns still write
        // `panel.material.emissiveColor` as they always did; _flushLedWall() copies those colours
        // into the texture once per frame. The glow layer reads the same emissive texture, so the
        // wall still glows in each panel's own colour.
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
                for (let k = 0; k < 4; k++) {
                    positions.set([x + corners[k][0], y + corners[k][1], z], (v + k) * 3);
                    normals.set([0, 0, -1], (v + k) * 3);
                    uvs.set([(col + 0.5) / cols, (row + 0.5) / rows], (v + k) * 2);
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

        // One texel per panel. Float where the GPU samples it (so a colour above 1.0 still drives the
        // glow as it did), else 8-bit, which the on-screen clamp makes visually identical.
        const caps = this.engine.getCaps();
        const useFloat = !!caps.textureFloat;
        const wallBuffer = useFloat ? new Float32Array(count * 4) : new Uint8Array(count * 4);
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
        
        // Create a soft particle texture using Canvas
        const smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = 128;
        smokeCanvas.height = 128;
        const ctx = smokeCanvas.getContext('2d');
        
        // Create soft radial gradient for smoke puff
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
        grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.25)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        
        const particleTexture = new BABYLON.Texture(smokeCanvas.toDataURL(), this.scene);
        particleTexture.name = "proceduralSmokeTexture";
        this._fogParticleTexture = particleTexture; // Store for reuse
        
        // === FOG MACHINE POSITIONS ===
        // Mounted on front truss (z=-8) on left and right sides
        const fogMachinePositions = [
            { x: -6, y: 7.8, z: -8, rotY: 0.3 },   // Left fog machine, angled toward center
            { x: 6, y: 7.8, z: -8, rotY: -0.3 }    // Right fog machine, angled toward center
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
            
            const body = BABYLON.MeshBuilder.CreateBox(`fogMachineBody${i}`, {
                width: 0.6,
                height: 0.35,
                depth: 0.4
            }, this.scene);
            body.position = new BABYLON.Vector3(0, 0, 0);
            body.parent = machineParent;
            body.material = bodyMat;
            // UPGRADE: Freeze static fog machine hardware
            body.freezeWorldMatrix();
            body.doNotSyncBoundingInfo = true;
            
            // Mounting bracket (attaches to truss)
            const bracketMat = this.materialFactory.getPreset('barStool');
            const bracket = BABYLON.MeshBuilder.CreateBox(`fogMachineBracket${i}`, {
                width: 0.15,
                height: 0.1,
                depth: 0.3
            }, this.scene);
            bracket.position = new BABYLON.Vector3(0, 0.22, 0);
            bracket.parent = machineParent;
            bracket.material = bracketMat;
            bracket.freezeWorldMatrix();
            bracket.doNotSyncBoundingInfo = true;
            
            // Nozzle (where fog comes out)
            // UPGRADE: Shared material for all fog machine nozzles
            const nozzleMat = this.materialFactory.createPBRMaterial('fogMachineNozzleShared', {
                baseColor: [0.08, 0.08, 0.08],
                metallic: 0.8,
                roughness: 0.2
            }, true); // shared
            
            const nozzle = BABYLON.MeshBuilder.CreateCylinder(`fogMachineNozzle${i}`, {
                diameter: 0.12,
                height: 0.15,
                tessellation: 12
            }, this.scene);
            nozzle.position = new BABYLON.Vector3(0, -0.25, 0.1);
            nozzle.rotation.x = Math.PI / 2 + 0.3; // Angled slightly downward
            nozzle.parent = machineParent;
            nozzle.material = nozzleMat;
            nozzle.freezeWorldMatrix();
            nozzle.doNotSyncBoundingInfo = true;
            
            // Status LED
            const ledMat = this.materialFactory.createStandardMaterial(`fogMachineLED${i}`, {
                mutable: true, // colour written at runtime
                emissiveColor: [0, 0.8, 0], // Green when ready
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
            // Directional burst from nozzle position
            const fogEmitter = new BABYLON.ParticleSystem(`fogEmitter${i}`, 800, this.scene);
            fogEmitter.particleTexture = particleTexture;
            
            // Get world position of nozzle for emitter
            const nozzleWorldPos = new BABYLON.Vector3(pos.x, pos.y - 0.25, pos.z + 0.15);
            fogEmitter.emitter = nozzleWorldPos;
            
            // Small emit box at nozzle
            fogEmitter.minEmitBox = new BABYLON.Vector3(-0.05, -0.05, -0.05);
            fogEmitter.maxEmitBox = new BABYLON.Vector3(0.05, 0.05, 0.05);
            
            // Fog colors (White/gray smoke with slight blue tint)
            fogEmitter.color1 = new BABYLON.Color4(0.85, 0.85, 0.9, 0.12);
            fogEmitter.color2 = new BABYLON.Color4(0.9, 0.9, 0.95, 0.09);
            fogEmitter.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0.0);
            
            // Start small, expand as fog disperses
            fogEmitter.minSize = 0.3;
            fogEmitter.maxSize = 2.5;
            fogEmitter.minScaleX = 1.0;
            fogEmitter.maxScaleX = 2.0;
            fogEmitter.minScaleY = 1.0;
            fogEmitter.maxScaleY = 2.0;
            
            // Lifetime - fog hangs in the air
            fogEmitter.minLifeTime = 4.0;
            fogEmitter.maxLifeTime = 8.0;
            
            // Emission rate (VJ controlled)
            fogEmitter.emitRate = 30; // Start with active haze (real clubs run fog machines continuously)
            fogEmitter.manualEmitCount = 0;
            fogEmitter.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            
            // Direction - angled downward and toward center of dance floor
            const centerDir = i === 0 ? 0.4 : -0.4; // Left machine aims right, right aims left
            fogEmitter.direction1 = new BABYLON.Vector3(centerDir - 0.2, -0.8, 0.3);
            fogEmitter.direction2 = new BABYLON.Vector3(centerDir + 0.2, -0.4, 0.6);
            
            // Velocity
            fogEmitter.minEmitPower = 2.0;
            fogEmitter.maxEmitPower = 4.0;
            
            // Physics - fog slowly falls and disperses
            fogEmitter.gravity = new BABYLON.Vector3(0, -0.3, 0);
            
            // Rotation for natural turbulence
            fogEmitter.minAngularSpeed = -1.0;
            fogEmitter.maxAngularSpeed = 1.0;
            
            // Size growth over lifetime (fog expands)
            fogEmitter.addSizeGradient(0, 0.3);
            fogEmitter.addSizeGradient(0.3, 1.2);
            fogEmitter.addSizeGradient(0.7, 2.0);
            fogEmitter.addSizeGradient(1.0, 2.5);
            
            // Alpha fade over lifetime
            fogEmitter.addColorGradient(0, new BABYLON.Color4(0.9, 0.9, 0.95, 0.12));
            fogEmitter.addColorGradient(0.4, new BABYLON.Color4(0.85, 0.85, 0.9, 0.075));
            fogEmitter.addColorGradient(0.8, new BABYLON.Color4(0.7, 0.7, 0.8, 0.03));
            fogEmitter.addColorGradient(1.0, new BABYLON.Color4(0.5, 0.5, 0.6, 0.0));
            
            fogEmitter.updateSpeed = 0.008;
            fogEmitter.start();
            
            // Store references
            this.fogMachines.push({
                parent: machineParent,
                body: body,
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
        this.haze = new BABYLON.ParticleSystem("haze", 1500, this.scene);
        this.haze.particleTexture = particleTexture;
        
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
        // Smoke billows as it disperses.
        this.haze.addSizeGradient(0, 0.55);
        this.haze.addSizeGradient(0.25, 1.0);
        this.haze.addSizeGradient(1, 1.3);
        
        // Smoke, not glow sprites. STANDARD keeps the asserted alphas from
        // adding a white sheet over the floor; size stays inside the beam volume.
        this.haze.minSize = 0.8;
        this.haze.maxSize = 2.2;
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
        // what make it read as real air. They are tiny, additive and slow, so they cost
        // almost nothing but remove the "smooth CG cone" look from every fixture.
        const moteCapacity = this.graphicsTier === 'ultra' ? 1400
            : this.graphicsTier === 'high' ? 900 : 400;
        this.dustMotes = new BABYLON.ParticleSystem("dustMotes", moteCapacity, this.scene);
        this.dustMotes.particleTexture = particleTexture;
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
        this.dustMotes.minSize = 0.012;
        this.dustMotes.maxSize = 0.05;
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
        this.smokeActive = false;
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

        lightPositions.forEach((pos, i) => {
            // === REALISTIC MOVING HEAD FIXTURE WITH TRUSS MOUNTING ===
            // Hierarchy: Root -> Clamp (on truss) -> Drop Pipe -> Base (Static) -> Yoke (Pan) -> Head (Tilt)
            
            // Root Transform Node (for positioning the whole unit)
            const root = new BABYLON.TransformNode("lightRoot" + i, this.scene);
            root.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            
            // === TRUSS MOUNTING HARDWARE (connects fixture to truss above) ===
            // Professional C-clamp that wraps around truss tube
            // UPGRADE: Shared clamp material for all spotlight fixtures (was 6 unique)
            const clampMat = this.materialFactory.createPBRMaterial("spotClampMatShared", {
                baseColor: [0.1, 0.1, 0.1], // Dark gray steel
                metallic: 0.9,
                roughness: 0.4
            }, true); // shared
            
            // C-Clamp body (wraps around truss tube at Y=8)
            const clamp = BABYLON.MeshBuilder.CreateTorus("clamp" + i, {
                diameter: 0.12,  // Fits around 48mm (0.048m) truss tube
                thickness: 0.02,
                tessellation: 16,
                arc: 0.85  // Open C-shape
            }, this.scene);
            clamp.parent = root;
            clamp.position.y = 0.2;  // 0.2m above fixture base (at truss level Y=8)
            clamp.rotation.x = Math.PI / 2;  // Horizontal orientation
            clamp.rotation.z = Math.PI;  // Open side facing outward
            clamp.material = clampMat;
            // UPGRADE: Freeze static mounting hardware
            clamp.freezeWorldMatrix();
            clamp.doNotSyncBoundingInfo = true;
            
            // Clamp bolt (tightening mechanism)
            const clampBolt = BABYLON.MeshBuilder.CreateCylinder("clampBolt" + i, {
                diameter: 0.03,
                height: 0.08,
                tessellation: 8
            }, this.scene);
            clampBolt.parent = root;
            clampBolt.position = new BABYLON.Vector3(0.06, 0.2, 0);
            clampBolt.rotation.z = Math.PI / 2;
            clampBolt.material = clampMat;
            clampBolt.freezeWorldMatrix();
            clampBolt.doNotSyncBoundingInfo = true;
            
            // Drop pipe (vertical pipe from clamp to fixture base)
            const dropPipe = BABYLON.MeshBuilder.CreateCylinder("dropPipe" + i, {
                diameter: 0.04,
                height: 0.2,  // 0.2m drop from truss to fixture
                tessellation: 12
            }, this.scene);
            dropPipe.parent = root;
            dropPipe.position.y = 0.1;  // Centered between clamp and base
            dropPipe.material = lightFixtureMat;
            dropPipe.freezeWorldMatrix();
            dropPipe.doNotSyncBoundingInfo = true;
            
            // Safety cable (realistic safety loop)
            const safetyCable = BABYLON.MeshBuilder.CreateTorus("safetyCable" + i, {
                diameter: 0.15,
                thickness: 0.005,
                tessellation: 16
            }, this.scene);
            safetyCable.parent = root;
            safetyCable.position.y = 0.15;
            safetyCable.rotation.x = Math.PI / 2;
            safetyCable.material = clampMat;
            safetyCable.freezeWorldMatrix();
            safetyCable.doNotSyncBoundingInfo = true;

            // 1. BASE (Static mount)
            const base = BABYLON.MeshBuilder.CreateBox("fixtureBase" + i, {
                width: 0.4,
                height: 0.1,
                depth: 0.4
            }, this.scene);
            base.parent = root;
            base.position.y = 0; // At root position
            base.material = lightFixtureMat;
            base.freezeWorldMatrix();
            base.doNotSyncBoundingInfo = true;
            
            // 2. YOKE (Pan mechanism - Rotates around Y)
            const yoke = new BABYLON.TransformNode("yoke" + i, this.scene);
            yoke.parent = root;
            yoke.position.y = -0.1; // Below base
            
            // Yoke Geometry (U-bracket)
            const yokeCrossbar = BABYLON.MeshBuilder.CreateBox("yokeCross" + i, {
                width: 0.5,
                height: 0.05,
                depth: 0.15
            }, this.scene);
            yokeCrossbar.parent = yoke;
            yokeCrossbar.position.y = 0;
            yokeCrossbar.material = lightFixtureMat;

            const yokeArmL = BABYLON.MeshBuilder.CreateBox("yokeArmL" + i, {
                width: 0.05,
                height: 0.4,
                depth: 0.15
            }, this.scene);
            yokeArmL.parent = yoke;
            yokeArmL.position = new BABYLON.Vector3(-0.225, -0.2, 0);
            yokeArmL.material = lightFixtureMat;

            const yokeArmR = BABYLON.MeshBuilder.CreateBox("yokeArmR" + i, {
                width: 0.05,
                height: 0.4,
                depth: 0.15
            }, this.scene);
            yokeArmR.parent = yoke;
            yokeArmR.position = new BABYLON.Vector3(0.225, -0.2, 0);
            yokeArmR.material = lightFixtureMat;

            // 3. HEAD (Tilt mechanism - Rotates around X)
            // Pivot point is between the yoke arms
            const head = new BABYLON.TransformNode("head" + i, this.scene);
            head.parent = yoke;
            head.position.y = -0.2; // Center of rotation between arms
            
            // Main fixture body
            const fixture = BABYLON.MeshBuilder.CreateCylinder("lightFixture" + i, {
                diameterTop: 0.3,
                diameterBottom: 0.38,
                height: 0.5,
                tessellation: 20
            }, this.scene);
            fixture.parent = head;
            fixture.position.y = 0;
            fixture.material = lightFixtureMat;
            
            // Recessed front rim keeps the aperture readable without a separate bulb or billboard flare.
            const bezel = BABYLON.MeshBuilder.CreateTorus("bezel" + i, {
                diameter: 0.37,
                thickness: 0.025,
                tessellation: 20
            }, this.scene);
            bezel.parent = head;
            bezel.position.y = -0.255;
            bezel.material = this.materialFactory.createPBRMaterial("bezelMat" + i, {
                baseColor: [0.02, 0.02, 0.02],
                metallic: 0.8,
                roughness: 0.4
            });
            
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
                fixture, 
                lens, 
                lensMat, 
                base,
                bezel
            });
        });
        
        // Strobe lights on truss corners
        this.createStrobeLights();
    }
    
    createStrobeLights() {
        const strobePositions = [
            { x: -10, z: -8 },
            { x: 10, z: -8 },
            { x: -10, z: -16 },
            { x: 10, z: -16 }
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
            mutable: true, // colour written at runtime
            baseColor: [0.1, 0.1, 0.1],
            metallic: 0.9,
            roughness: 0.4
        }, true); // shared
        
        strobePositions.forEach((pos, i) => {
            // === STROBE MOUNTING HARDWARE ===
            // Bracket that connects strobe to truss
            const bracket = BABYLON.MeshBuilder.CreateBox("strobeBracket" + i, {
                width: 0.1,
                height: 0.4,  // Drops from truss (Y=8) to strobe (Y=7.6)
                depth: 0.1
            }, this.scene);
            bracket.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            bracket.material = strobeMountMat;
            // UPGRADE: Freeze static mounting hardware
            bracket.freezeWorldMatrix();
            bracket.doNotSyncBoundingInfo = true;
            
            // Clamp at top (grips truss)
            const clamp = BABYLON.MeshBuilder.CreateTorus("strobeClamp" + i, {
                diameter: 0.12,
                thickness: 0.02,
                tessellation: 12,
                arc: 0.85
            }, this.scene);
            clamp.position = new BABYLON.Vector3(pos.x, 8, pos.z);
            clamp.rotation.x = Math.PI / 2;
            clamp.material = strobeMountMat;
            clamp.freezeWorldMatrix();
            clamp.doNotSyncBoundingInfo = true;
            
            const strobe = BABYLON.MeshBuilder.CreateBox("strobe" + i, {
                width: 0.8,
                height: 0.3,
                depth: 0.18
            }, this.scene);
            strobe.position = new BABYLON.Vector3(pos.x, 7.6, pos.z);
            const strobeMat = this.materialFactory.createStandardMaterial("strobeMat" + i, {
                mutable: true, // colour written at runtime
                emissiveColor: [0, 0, 0], // Off by default
                disableLighting: true
            });
            
            strobe.material = strobeMat;

            const emitter = BABYLON.MeshBuilder.CreatePlane("strobeEmitter" + i, {
                width: 0.68,
                height: 0.20
            }, this.scene);
            emitter.position = new BABYLON.Vector3(pos.x, 7.6, pos.z + 0.095);
            emitter.material = strobeMat;
            emitter.isPickable = false;
            emitter.renderingGroupId = 2;
            if (this.glowLayer) this.glowLayer.addIncludedOnlyMesh(emitter);

            const glare = BABYLON.MeshBuilder.CreatePlane(`strobeGlare${i}`, {
                width: 1.8,
                height: 0.9
            }, this.scene);
            glare.position = new BABYLON.Vector3(pos.x, 7.6, pos.z + 0.105);
            glare.isPickable = false;
            glare.renderingGroupId = 2;
            const glareMat = new BABYLON.StandardMaterial(`strobeGlareMat${i}`, this.scene);
            glareMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
            glareMat.opacityTexture = glareTexture;
            glareMat.alpha = 0;
            glareMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            glareMat.disableLighting = true;
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
                emitter,
                glare,
                glareMaterial: glareMat,
                material: strobeMat,
                light: strobeLight, // null - visual-only strobe
                flashDuration: 0
            });
        });
        
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
            
            // Logical beams. Geometry lives in one shared camera-facing ribbon batch built after the loop
            // (see _createLaserBeamBatch), so 15 beams cost one draw call, plus one for their surface dots.
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
                rotation: 0,
                rotationSpeed: 0.01,
                tiltPhase: 0,
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
        
        // Lights and lasers control - PROFESSIONAL VJ PATTERN SYSTEM
        // 8-phase show cycle designed for maximum crowd engagement
        // Philosophy: Build tension → Release → Create moments → Repeat
        this.lightModeSwitchTime = 0;
        this.lightingPhase = 'tension'; // Start with tension phase for immediate action
        this.currentShowMode = 'spotlights'; // What's currently active
        
        // Dynamic phase durations - SHORTENED for faster action and more variety
        this.phaseDurations = {
            intro: 6 + Math.random() * 4,         // 6-10s: Quick mood setting
            build: 10 + Math.random() * 6,        // 10-16s: Building anticipation
            tension: 8 + Math.random() * 4,       // 8-12s: Maximum tension before drop
            drop: 4 + Math.random() * 4,          // 4-8s: THE BIG MOMENT (short!)
            peak: 10 + Math.random() * 6,         // 10-16s: Sustained high energy
            breakdown: 6 + Math.random() * 4,     // 6-10s: Disco ball moment
            atmospheric: 8 + Math.random() * 6,   // 8-14s: Dreamy transition
            groove: 12 + Math.random() * 8,       // 12-20s: Finding the pocket
            // NEW PHASES for more immersive experience
            euphoria: 6 + Math.random() * 4,      // 6-10s: Pure bliss moment
            darkness: 3 + Math.random() * 2,      // 3-5s: Dramatic blackout
            strobe_attack: 4 + Math.random() * 2, // 4-6s: Intense strobe assault
            laser_tunnel: 8 + Math.random() * 6   // 8-14s: Laser beam immersion
        };
        
        // Track energy level for smooth transitions (0.0 = ambient, 1.0 = peak)
        this.energyLevel = 0.7; // Start higher for immediate action
        this.targetEnergy = 0.75; // Tension phase target
        
        // === INITIAL TENSION PHASE SETTINGS ===
        // Starting in 'tension' phase means we need to set all the effect states here
        // PROFESSIONAL VJ RULE: Never gobos + lasers together - each system has its moment
        this.lightsActive = true;       // Gobos/spotlights on (LASERS OFF)
        this.lasersActive = false;      // Ceiling lasers OFF when gobos on
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
     * One dynamic mesh for every ceiling-laser beam and one for their surface dots.
     *
     * A real show beam is 2-5 mm wide: at club distances that is under a pixel, so a modelled cylinder
     * aliases into a dashed, crawling line. Each beam is instead a camera-facing ribbon never narrower
     * than a few pixels, carrying a Gaussian core and a faint scatter halo in its opacity profile, with its
     * brightness divided by the widening so a distant beam does not turn into a bright bar
     * (updateLasers()). Brightness lives in vertex alpha, which the glow layer reads too.
     */
    _createLaserBeamBatch(count) {
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
        // Across the ribbon: the coherent core (sigma ~5% of the ribbon) plus forward-scatter halo.
        const beamTex = profile('laserBeamProfile', 64, 4, u => {
            const s = 2 * u - 1;
            return Math.exp(-(s / 0.11) * (s / 0.11)) + 0.2 * Math.exp(-(s / 0.45) * (s / 0.45));
        });
        // The dot a beam throws on a surface: a hot centre and a soft diffuse bloom.
        const dotTex = profile('laserDotProfile', 32, 32, (u, v) => {
            const r2 = ((2 * u - 1) ** 2 + (2 * v - 1) ** 2);
            return Math.exp(-r2 / 0.05) + 0.3 * Math.exp(-r2 / 0.3);
        });

        const build = (name, texture) => {
            const mesh = new BABYLON.Mesh(name, this.scene);
            const positions = new Float32Array(count * 12);
            const colors = new Float32Array(count * 16);
            const normals = new Float32Array(count * 12);
            const uvs = new Float32Array(count * 8);
            const indices = new Uint16Array(count * 6);
            for (let i = 0; i < count; i++) {
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
        const hits = build('laser_beamHits', dotTex);
        return {
            count,
            mesh: beams.mesh,
            material: beams.material,
            positions: beams.positions,
            colors: beams.colors,
            hitMesh: hits.mesh,
            hitMaterial: hits.material,
            hitPositions: hits.positions,
            hitColors: hits.colors,
            hit: { t: 0, px: 0, py: 0, pz: 0, nx: 0, ny: 0, nz: 0 }
        };
    }

}
window.VRClubFixtures = VRClubFixtures;
