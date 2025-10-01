// VR Club - HYPERREALISTIC Babylon.js Implementation
// Ultra-realistic club environment for Quest 3S VR

class VRClub {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.engine = new BABYLON.Engine(this.canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
            antialias: true // Enable antialiasing for smoothness
        });
        
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioSource = null;
        this.audioElement = null;
        
        this.vuMeters = [];
        this.smokeMachines = [];
        
        this.init();
    }

    async init() {
        // Create scene with hyperrealistic atmosphere
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.01, 0.01, 0.02); // Very dark club atmosphere
        
        // Load environment for PBR reflections
        this.scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://assets.babylonjs.com/environments/environmentSpecular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.3; // Subtle reflections
        
        // Add atmospheric haze/fog for depth
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXPONENTIAL;
        this.scene.fogDensity = 0.02; // Smoke machine effect
        this.scene.fogColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        
        // Enable VR
        const vrHelper = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: []
        });
        
        // Setup camera for non-VR testing
        this.camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 1.7, -10), this.scene);
        this.camera.setTarget(new BABYLON.Vector3(0, 1.7, 0));
        this.camera.attachControl(this.canvas, true);
        this.camera.speed = 0.3; // Realistic walking speed
        this.camera.applyGravity = false;
        this.camera.checkCollisions = false;
        this.camera.fov = 1.1; // Wider FOV for immersion
        this.camera.minZ = 0.1;
        this.camera.maxZ = 150;
        
        // Movement controls
        this.camera.keysUp = [87]; // W
        this.camera.keysDown = [83]; // S
        this.camera.keysLeft = [65]; // A
        this.camera.keysRight = [68]; // D
        this.camera.keysUpward = [69]; // E
        this.camera.keysDownward = [81]; // Q
        this.camera.angularSensibility = 2000;
        this.camera.inertia = 0.7; // Smooth movement
        
        this.scene.activeCamera = this.camera;
        
        // Add glow layer for neon/LED effects
        this.glowLayer = new BABYLON.GlowLayer("glow", this.scene, {
            mainTextureFixedSize: 512,
            blurKernelSize: 64
        });
        this.glowLayer.intensity = 1.5;
        
        // Add post-processing for cinematic realism
        this.addPostProcessing();
        
        // Build hyperrealistic club
        this.createFloor();
        this.createWalls();
        this.createCeiling();
        this.createDJBooth();
        this.createPASpeakers();
        this.createLEDWall();
        this.createLasers();
        this.createLights();
        this.createSmokeParticles();
        this.createBarArea();
        this.createDanceFloorLights();
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        
        // Start render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
            this.updateAnimations();
            this.updatePerformanceMonitor();
        });
        
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
        
        console.log('%c🎉 HYPERREALISTIC VR CLUB LOADED!', 'color: #00ff00; font-weight: bold; font-size: 16px; text-shadow: 0 0 10px #00ff00;');
        console.log('%c✨ Features:', 'color: #00ffff; font-weight: bold;');
        console.log('  🎨 PBR Materials with realistic reflections');
        console.log('  💨 Atmospheric fog/smoke effects');
        console.log('  ✨ Bloom & glow for lights');
        console.log('  📺 24-panel LED wall with animations');
        console.log('  🔦 6 laser systems');
        console.log('  💡 Dynamic club lighting');
        console.log('  🔊 PA speaker system');
        console.log('  🎧 DJ booth with equipment details');
        console.log('  🍹 Bar area');
        console.log('  ⚡ Dance floor lights');
    }

    addPostProcessing() {
        // Create rendering pipeline for cinematic effects
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true,
            this.scene,
            [this.camera]
        );
        
        // Bloom for glowing lights
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.4;
        pipeline.bloomWeight = 0.4;
        pipeline.bloomKernel = 64;
        pipeline.bloomScale = 0.5;
        
        // Chromatic aberration for lens realism
        pipeline.chromaticAberrationEnabled = true;
        pipeline.chromaticAberration.aberrationAmount = 2;
        
        // Film grain
        pipeline.grainEnabled = true;
        pipeline.grain.intensity = 8;
        pipeline.grain.animated = true;
        
        // Sharpen for clarity
        pipeline.sharpenEnabled = true;
        pipeline.sharpen.edgeAmount = 0.3;
        pipeline.sharpen.colorAmount = 0.5;
        
        // Image processing
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.contrast = 1.2;
        pipeline.imageProcessing.exposure = 1.0;
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        
        console.log('✅ Post-processing pipeline created');
    }

    createFloor() {
        console.log('🏗️ Creating hyperrealistic floor...');
        
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: 35,
            height: 45,
            subdivisions: 20
        }, this.scene);
        floor.position.z = -10;
        
        // Glossy black club floor with PBR
        const floorMat = new BABYLON.PBRMetallicRoughnessMaterial("floorMat", this.scene);
        floorMat.baseColor = new BABYLON.Color3(0.02, 0.02, 0.03);
        floorMat.metallic = 0.95; // Very reflective
        floorMat.roughness = 0.05; // Very glossy
        floorMat.environmentIntensity = 2.0; // Strong reflections
        
        floor.material = floorMat;
        floor.receiveShadows = true;
        
        console.log('✅ Hyperrealistic floor created');
    }

    createWalls() {
        console.log('🏗️ Creating walls with details...');
        
        // PBR material for walls
        const wallMat = new BABYLON.PBRMetallicRoughnessMaterial("wallMat", this.scene);
        wallMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        wallMat.metallic = 0.1;
        wallMat.roughness = 0.9; // Rough industrial surface
        
        // Back wall
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 35,
            height: 10,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 5, -27);
        backWall.material = wallMat;
        backWall.receiveShadows = true;
        
        // Left wall
        const leftWall = BABYLON.MeshBuilder.CreateBox("leftWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-17, 5, -10);
        leftWall.material = wallMat;
        leftWall.receiveShadows = true;
        
        // Right wall
        const rightWall = BABYLON.MeshBuilder.CreateBox("rightWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        rightWall.position = new BABYLON.Vector3(17, 5, -10);
        rightWall.material = wallMat;
        rightWall.receiveShadows = true;
        
        // Add LED strips along walls
        this.createWallLEDStrips();
        
        console.log('✅ Walls created');
    }

    createWallLEDStrips() {
        // Vertical LED strips for atmosphere
        const stripMat = new BABYLON.StandardMaterial("stripMat", this.scene);
        stripMat.emissiveColor = new BABYLON.Color3(0, 0.5, 1); // Cyan glow
        stripMat.disableLighting = true;
        
        // Left wall strips
        for (let i = 0; i < 6; i++) {
            const strip = BABYLON.MeshBuilder.CreateBox("leftStrip" + i, {
                width: 0.05,
                height: 9,
                depth: 0.02
            }, this.scene);
            strip.position = new BABYLON.Vector3(-16.8, 5, -25 + (i * 7));
            strip.material = stripMat.clone("stripL" + i);
        }
        
        // Right wall strips
        for (let i = 0; i < 6; i++) {
            const strip = BABYLON.MeshBuilder.CreateBox("rightStrip" + i, {
                width: 0.05,
                height: 9,
                depth: 0.02
            }, this.scene);
            strip.position = new BABYLON.Vector3(16.8, 5, -25 + (i * 7));
            strip.material = stripMat.clone("stripR" + i);
        }
    }

    createCeiling() {
        console.log('🏗️ Creating ceiling with details...');
        
        const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
            width: 35,
            height: 0.3,
            depth: 45
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, 10, -10);
        
        const ceilingMat = new BABYLON.PBRMetallicRoughnessMaterial("ceilingMat", this.scene);
        ceilingMat.baseColor = new BABYLON.Color3(0.03, 0.03, 0.05);
        ceilingMat.metallic = 0.3;
        ceilingMat.roughness = 0.7;
        ceiling.material = ceilingMat;
        
        // Add lighting truss
        this.createLightingTruss();
    }

    createLightingTruss() {
        // Industrial lighting truss across ceiling
        const trussMat = new BABYLON.PBRMetallicRoughnessMaterial("trussMat", this.scene);
        trussMat.baseColor = new BABYLON.Color3(0.2, 0.2, 0.22);
        trussMat.metallic = 1.0;
        trussMat.roughness = 0.4;
        
        // Main truss beams
        for (let i = 0; i < 3; i++) {
            const truss = BABYLON.MeshBuilder.CreateBox("truss" + i, {
                width: 0.2,
                height: 0.2,
                depth: 30
            }, this.scene);
            truss.position = new BABYLON.Vector3(-10 + (i * 10), 9, -15);
            truss.material = trussMat;
        }
    }

    createDJBooth() {
        console.log('🎧 Creating hyperrealistic DJ booth...');
        
        // DJ platform
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 8,
            height: 1.2,
            depth: 4
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.6, -24);
        
        const platformMat = new BABYLON.PBRMetallicRoughnessMaterial("platformMat", this.scene);
        platformMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        platformMat.metallic = 0.9;
        platformMat.roughness = 0.2;
        platform.material = platformMat;
        platform.receiveShadows = true;
        
        // DJ console table
        const console = BABYLON.MeshBuilder.CreateBox("djConsole", {
            width: 5,
            height: 0.3,
            depth: 2
        }, this.scene);
        console.position = new BABYLON.Vector3(0, 1.5, -24);
        
        const consoleMat = new BABYLON.PBRMetallicRoughnessMaterial("consoleMat", this.scene);
        consoleMat.baseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
        consoleMat.metallic = 0.95;
        consoleMat.roughness = 0.15;
        consoleMat.emissiveColor = new BABYLON.Color3(0.02, 0.05, 0.1); // Subtle glow
        console.material = consoleMat;
        
        // CDJ Decks
        this.createCDJs();
        
        // DJ mixer
        this.createMixer();
        
        // Monitor speakers
        this.createMonitorSpeakers();
        
        // VU meters
        this.createVUMeters();
        
        console.log('✅ DJ booth created');
    }

    createCDJs() {
        const cdjMat = new BABYLON.PBRMetallicRoughnessMaterial("cdjMat", this.scene);
        cdjMat.baseColor = new BABYLON.Color3(0.12, 0.12, 0.15);
        cdjMat.metallic = 0.8;
        cdjMat.roughness = 0.3;
        
        // Left CDJ
        const leftCDJ = BABYLON.MeshBuilder.CreateBox("leftCDJ", {
            width: 1.3,
            height: 0.12,
            depth: 1.3
        }, this.scene);
        leftCDJ.position = new BABYLON.Vector3(-1.6, 1.72, -24);
        leftCDJ.material = cdjMat;
        
        // Right CDJ
        const rightCDJ = BABYLON.MeshBuilder.CreateBox("rightCDJ", {
            width: 1.3,
            height: 0.12,
            depth: 1.3
        }, this.scene);
        rightCDJ.position = new BABYLON.Vector3(1.6, 1.72, -24);
        rightCDJ.material = cdjMat;
        
        // Jog wheels (glowing)
        const jogMat = new BABYLON.StandardMaterial("jogMat", this.scene);
        jogMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.3);
        jogMat.disableLighting = true;
        
        const leftJog = BABYLON.MeshBuilder.CreateCylinder("leftJog", {
            diameter: 0.6,
            height: 0.05
        }, this.scene);
        leftJog.position = new BABYLON.Vector3(-1.6, 1.8, -24);
        leftJog.material = jogMat;
        
        const rightJog = BABYLON.MeshBuilder.CreateCylinder("rightJog", {
            diameter: 0.6,
            height: 0.05
        }, this.scene);
        rightJog.position = new BABYLON.Vector3(1.6, 1.8, -24);
        rightJog.material = jogMat.clone("jogMatR");
    }

    createMixer() {
        const mixer = BABYLON.MeshBuilder.CreateBox("mixer", {
            width: 2,
            height: 0.15,
            depth: 1.1
        }, this.scene);
        mixer.position = new BABYLON.Vector3(0, 1.72, -24);
        
        const mixerMat = new BABYLON.PBRMetallicRoughnessMaterial("mixerMat", this.scene);
        mixerMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        mixerMat.metallic = 0.85;
        mixerMat.roughness = 0.25;
        mixer.material = mixerMat;
        
        // Mixer display
        const display = BABYLON.MeshBuilder.CreateBox("mixerDisplay", {
            width: 1.5,
            height: 0.02,
            depth: 0.3
        }, this.scene);
        display.position = new BABYLON.Vector3(0, 1.81, -23.7);
        
        const displayMat = new BABYLON.StandardMaterial("displayMat", this.scene);
        displayMat.emissiveColor = new BABYLON.Color3(0, 1, 0.5);
        displayMat.disableLighting = true;
        display.material = displayMat;
    }

    createMonitorSpeakers() {
        const speakerMat = new BABYLON.PBRMetallicRoughnessMaterial("monitorSpeakerMat", this.scene);
        speakerMat.baseColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        speakerMat.metallic = 0.2;
        speakerMat.roughness = 0.8;
        
        // Left monitor
        const leftMonitor = BABYLON.MeshBuilder.CreateBox("leftMonitor", {
            width: 0.5,
            height: 0.7,
            depth: 0.45
        }, this.scene);
        leftMonitor.position = new BABYLON.Vector3(-3, 1.55, -24);
        leftMonitor.material = speakerMat;
        
        // Right monitor
        const rightMonitor = BABYLON.MeshBuilder.CreateBox("rightMonitor", {
            width: 0.5,
            height: 0.7,
            depth: 0.45
        }, this.scene);
        rightMonitor.position = new BABYLON.Vector3(3, 1.55, -24);
        rightMonitor.material = speakerMat;
    }

    createVUMeters() {
        this.vuMeters = [];
        
        // VU meter bars (animated with music)
        for (let i = 0; i < 12; i++) {
            const bar = BABYLON.MeshBuilder.CreateBox("vu" + i, {
                width: 0.08,
                height: 0.2,
                depth: 0.02
            }, this.scene);
            bar.position = new BABYLON.Vector3(-0.8 + (i * 0.15), 1.81, -23.6);
            
            const barMat = new BABYLON.StandardMaterial("vuMat" + i, this.scene);
            barMat.emissiveColor = i < 8 ? new BABYLON.Color3(0, 1, 0) : new BABYLON.Color3(1, 0.5, 0);
            barMat.disableLighting = true;
            bar.material = barMat;
            
            this.vuMeters.push(bar);
        }
    }

    createPASpeakers() {
        console.log('🔊 Creating PA speaker stacks...');
        
        const speakerMat = new BABYLON.PBRMetallicRoughnessMaterial("paSpeakerMat", this.scene);
        speakerMat.baseColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        speakerMat.metallic = 0.3;
        speakerMat.roughness = 0.7;
        
        // Left PA stack (3-way system)
        this.createPAStack(-13, speakerMat);
        
        // Right PA stack
        this.createPAStack(13, speakerMat);
    }

    createPAStack(xPos, material) {
        // Sub
        const sub = BABYLON.MeshBuilder.CreateBox("sub" + xPos, {
            width: 1.8,
            height: 2.2,
            depth: 1.8
        }, this.scene);
        sub.position = new BABYLON.Vector3(xPos, 1.1, -23);
        sub.material = material;
        
        // Mid
        const mid = BABYLON.MeshBuilder.CreateBox("mid" + xPos, {
            width: 1.4,
            height: 1.6,
            depth: 1.4
        }, this.scene);
        mid.position = new BABYLON.Vector3(xPos, 3, -23);
        mid.material = material;
        
        // High
        const high = BABYLON.MeshBuilder.CreateBox("high" + xPos, {
            width: 1,
            height: 1,
            depth: 1
        }, this.scene);
        high.position = new BABYLON.Vector3(xPos, 4.4, -23);
        high.material = material;
        
        // Glowing speaker mesh
        const grillMat = new BABYLON.StandardMaterial("grill" + xPos, this.scene);
        grillMat.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.1);
        grillMat.alpha = 0.6;
        
        [sub, mid, high].forEach((speaker, i) => {
            const grill = BABYLON.MeshBuilder.CreateBox("grill", {
                width: speaker.scaling.x * 0.7,
                height: speaker.scaling.y * 0.7,
                depth: 0.05
            }, this.scene);
            grill.position = speaker.position.clone();
            grill.position.z += 0.91;
            grill.material = grillMat.clone("grillMat" + xPos + i);
        });
    }

    createBarArea() {
        console.log('🍹 Creating bar area...');
        
        // Bar counter
        const bar = BABYLON.MeshBuilder.CreateBox("bar", {
            width: 8,
            height: 1.2,
            depth: 1.2
        }, this.scene);
        bar.position = new BABYLON.Vector3(-10, 0.6, 5);
        
        const barMat = new BABYLON.PBRMetallicRoughnessMaterial("barMat", this.scene);
        barMat.baseColor = new BABYLON.Color3(0.15, 0.08, 0.05);
        barMat.metallic = 0.7;
        barMat.roughness = 0.3;
        bar.material = barMat;
        
        // Bar top
        const barTop = BABYLON.MeshBuilder.CreateBox("barTop", {
            width: 8.2,
            height: 0.08,
            depth: 1.4
        }, this.scene);
        barTop.position = new BABYLON.Vector3(-10, 1.24, 5);
        
        const topMat = new BABYLON.PBRMetallicRoughnessMaterial("barTopMat", this.scene);
        topMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        topMat.metallic = 0.95;
        topMat.roughness = 0.1; // Very glossy
        barTop.material = topMat;
        
        // Back bar with bottles
        this.createBackBar();
    }

    createBackBar() {
        // Shelf
        const shelf = BABYLON.MeshBuilder.CreateBox("backShelf", {
            width: 7.5,
            height: 0.05,
            depth: 0.4
        }, this.scene);
        shelf.position = new BABYLON.Vector3(-10, 2, 4.4);
        
        const shelfMat = new BABYLON.StandardMaterial("shelfMat", this.scene);
        shelfMat.diffuseColor = new BABYLON.Color3(0.2, 0.15, 0.1);
        shelf.material = shelfMat;
        
        // Bottles with colored lights
        const bottleColors = [
            new BABYLON.Color3(0, 1, 0.5),
            new BABYLON.Color3(1, 0.5, 0),
            new BABYLON.Color3(0.5, 0, 1),
            new BABYLON.Color3(1, 0, 0.5)
        ];
        
        for (let i = 0; i < 8; i++) {
            const bottle = BABYLON.MeshBuilder.CreateCylinder("bottle" + i, {
                diameter: 0.1,
                height: 0.4
            }, this.scene);
            bottle.position = new BABYLON.Vector3(-13 + (i * 0.9), 2.25, 4.4);
            
            const bottleMat = new BABYLON.StandardMaterial("bottleMat" + i, this.scene);
            bottleMat.emissiveColor = bottleColors[i % 4];
            bottleMat.alpha = 0.7;
            bottle.material = bottleMat;
        }
    }

    createDanceFloorLights() {
        console.log('💡 Creating dance floor lights...');
        
        // RGB floor tiles
        const tileSize = 1.5;
        const colors = [
            new BABYLON.Color3(1, 0, 0),
            new BABYLON.Color3(0, 1, 0),
            new BABYLON.Color3(0, 0, 1),
            new BABYLON.Color3(1, 1, 0),
            new BABYLON.Color3(1, 0, 1),
            new BABYLON.Color3(0, 1, 1)
        ];
        
        this.floorTiles = [];
        
        for (let x = -2; x <= 2; x++) {
            for (let z = -2; z <= 2; z++) {
                const tile = BABYLON.MeshBuilder.CreateBox("tile" + x + "_" + z, {
                    width: tileSize - 0.1,
                    height: 0.05,
                    depth: tileSize - 0.1
                }, this.scene);
                tile.position = new BABYLON.Vector3(x * tileSize, 0.03, -12 + (z * tileSize));
                
                const tileMat = new BABYLON.StandardMaterial("tileMat" + x + "_" + z, this.scene);
                tileMat.emissiveColor = colors[(x + z) % colors.length].clone();
                tileMat.emissiveColor.scale(0.3); // Dim initially
                tileMat.disableLighting = true;
                tile.material = tileMat;
                
                this.floorTiles.push(tile);
            }
        }
    }

    createSmokeParticles() {
        console.log('💨 Creating smoke particles...');
        
        // Smoke machine effect near DJ booth
        const smokeSystem = new BABYLON.ParticleSystem("smoke", 800, this.scene);
        smokeSystem.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        
        smokeSystem.emitter = new BABYLON.Vector3(0, 0.5, -20);
        smokeSystem.minEmitBox = new BABYLON.Vector3(-5, 0, -2);
        smokeSystem.maxEmitBox = new BABYLON.Vector3(5, 0, 2);
        
        smokeSystem.color1 = new BABYLON.Color4(0.1, 0.1, 0.2, 0.1);
        smokeSystem.color2 = new BABYLON.Color4(0.2, 0.2, 0.4, 0.05);
        smokeSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        
        smokeSystem.minSize = 2;
        smokeSystem.maxSize = 6;
        
        smokeSystem.minLifeTime = 3;
        smokeSystem.maxLifeTime = 8;
        
        smokeSystem.emitRate = 50;
        
        smokeSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        smokeSystem.gravity = new BABYLON.Vector3(0, 0.3, 0);
        
        smokeSystem.direction1 = new BABYLON.Vector3(-1, 1, -1);
        smokeSystem.direction2 = new BABYLON.Vector3(1, 2, 1);
        
        smokeSystem.minEmitPower = 0.5;
        smokeSystem.maxEmitPower = 1.5;
        smokeSystem.updateSpeed = 0.02;
        
        smokeSystem.start();
        
        this.smokeMachines.push(smokeSystem);
    }

    createLEDWall() {
        console.log('🎨 Creating LED Wall...');
        
        const panelWidth = 1.45;
        const panelHeight = 1.25;
        const cols = 6;
        const rows = 4;
        const wallWidth = cols * panelWidth;
        const wallHeight = rows * panelHeight;
        
        this.ledPanels = [];
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const panel = BABYLON.MeshBuilder.CreatePlane("ledPanel_" + row + "_" + col, {
                    width: panelWidth - 0.05,
                    height: panelHeight - 0.05
                }, this.scene);
                
                const x = (col * panelWidth) - (wallWidth / 2) + (panelWidth / 2);
                const y = (row * panelHeight) + (panelHeight / 2) + 1;
                const z = -26.5;
                
                panel.position = new BABYLON.Vector3(x, y, z);
                
                const panelMat = new BABYLON.StandardMaterial("ledMat_" + row + "_" + col, this.scene);
                panelMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
                panelMat.disableLighting = true;
                panel.material = panelMat;
                
                this.ledPanels.push({
                    mesh: panel,
                    material: panelMat,
                    row: row,
                    col: col
                });
            }
        }
        
        this.ledTime = 0;
        this.ledPattern = 0;
        this.ledColorIndex = 0;
        
        console.log('✅ LED Wall created: 24 panels');
    }

    createLasers() {
        console.log('🔦 Creating laser systems...');
        
        this.lasers = [];
        const laserPositions = [
            { x: -8, z: -20 },
            { x: 8, z: -20 },
            { x: -10, z: -10 },
            { x: 10, z: -10 },
            { x: -5, z: -5 },
            { x: 5, z: -5 }
        ];
        
        laserPositions.forEach((pos, i) => {
            const laser = BABYLON.MeshBuilder.CreateCylinder("laser" + i, {
                diameter: 0.05,
                height: 20
            }, this.scene);
            laser.position = new BABYLON.Vector3(pos.x, 5, pos.z);
            laser.rotation.x = Math.PI / 4;
            
            const laserMat = new BABYLON.StandardMaterial("laserMat" + i, this.scene);
            laserMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
            laserMat.alpha = 0.6;
            laserMat.disableLighting = true;
            laser.material = laserMat;
            
            this.lasers.push({
                mesh: laser,
                material: laserMat,
                rotation: Math.random() * Math.PI * 2
            });
        });
        
        console.log('✅ 6 laser systems created');
    }

    createLights() {
        console.log('💡 Creating atmospheric lighting...');
        
        // Very dim ambient
        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.1;
        ambient.diffuse = new BABYLON.Color3(0.1, 0.1, 0.15);
        
        // Spotlights from ceiling
        this.spotlights = [];
        const spotPositions = [
            { x: -8, z: -15 },
            { x: 8, z: -15 },
            { x: -5, z: -8 },
            { x: 5, z: -8 },
            { x: 0, z: -12 }
        ];
        
        const spotColors = [
            new BABYLON.Color3(1, 0, 0),
            new BABYLON.Color3(0, 0, 1),
            new BABYLON.Color3(0, 1, 0),
            new BABYLON.Color3(1, 0, 1),
            new BABYLON.Color3(1, 1, 0)
        ];
        
        spotPositions.forEach((pos, i) => {
            const spot = new BABYLON.SpotLight("spot" + i,
                new BABYLON.Vector3(pos.x, 9, pos.z),
                new BABYLON.Vector3(0, -1, 0),
                Math.PI / 3,
                2,
                this.scene
            );
            spot.diffuse = spotColors[i];
            spot.intensity = 0;
            spot.range = 15;
            
            this.spotlights.push(spot);
        });
        
        // LED wall backlight
        const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
        ledLight.diffuse = new BABYLON.Color3(1, 1, 1);
        ledLight.intensity = 12;
        ledLight.range = 20;
        
        console.log('✅ Lighting created');
    }

    updateAnimations() {
        const time = performance.now() / 1000;
        this.ledTime += 0.016;
        
        // Update LED wall
        if (this.ledPanels) {
            this.updateLEDWall(time);
        }
        
        // Update lasers
        if (this.lasers) {
            this.lasers.forEach((laser, i) => {
                laser.rotation += 0.01;
                laser.mesh.rotation.y = laser.rotation;
                laser.mesh.rotation.x = Math.PI / 4 + Math.sin(time + i) * 0.3;
            });
        }
        
        // Update spotlights
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                spot.intensity = 3 + Math.sin(time * 2 + i) * 2;
            });
        }
        
        // Update VU meters
        if (this.vuMeters) {
            this.vuMeters.forEach((bar, i) => {
                const scale = 0.5 + Math.random() * 0.5;
                bar.scaling.y = scale;
                bar.position.y = 1.81 + (scale - 0.5) * 0.1;
            });
        }
        
        // Update floor tiles
        if (this.floorTiles) {
            this.floorTiles.forEach((tile, i) => {
                const pulse = 0.2 + Math.sin(time * 2 + i * 0.5) * 0.3;
                tile.material.emissiveColor.scale(1 / tile.material.emissiveColor.length());
                tile.material.emissiveColor.scaleInPlace(pulse);
            });
        }
    }

    updateLEDWall(time) {
        const patterns = [
            this.patternWaveHorizontal,
            this.patternWaveVertical,
            this.patternCheckerboard,
            this.patternScanLines,
            this.patternRipple,
            this.patternBreathing
        ];
        
        const colors = [
            new BABYLON.Color3(1, 0, 0),
            new BABYLON.Color3(0, 1, 0),
            new BABYLON.Color3(0, 0, 1),
            new BABYLON.Color3(1, 0, 1),
            new BABYLON.Color3(1, 1, 0),
            new BABYLON.Color3(0, 1, 1)
        ];
        
        if (Math.floor(time) % 10 === 0 && Math.floor(time) !== this.lastColorChange) {
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.lastColorChange = Math.floor(time);
        }
        
        if (Math.floor(time) % 15 === 0 && Math.floor(time) !== this.lastPatternChange) {
            this.ledPattern = (this.ledPattern + 1) % patterns.length;
            this.lastPatternChange = Math.floor(time);
        }
        
        patterns[this.ledPattern].call(this, colors[this.ledColorIndex], time);
    }

    patternWaveHorizontal(color, time) {
        this.ledPanels.forEach(panel => {
            const brightness = 0.4 + 0.6 * Math.sin(panel.col * 0.8 + this.ledTime * 3);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternWaveVertical(color, time) {
        this.ledPanels.forEach(panel => {
            const brightness = 0.4 + 0.6 * Math.sin(panel.row * 0.8 + this.ledTime * 3);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternCheckerboard(color, time) {
        this.ledPanels.forEach(panel => {
            const checker = (panel.row + panel.col + Math.floor(this.ledTime * 2)) % 2;
            const brightness = checker ? 1.0 : 0.4;
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternScanLines(color, time) {
        this.ledPanels.forEach(panel => {
            const scanLine = Math.floor(this.ledTime * 2) % 4;
            const brightness = panel.row === scanLine ? 1.0 : 0.4;
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternRipple(color, time) {
        const centerX = 3;
        const centerY = 2;
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const brightness = 0.4 + 0.6 * Math.sin(dist - this.ledTime * 2);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternBreathing(color, time) {
        const brightness = 0.4 + 0.6 * Math.sin(this.ledTime);
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    setupUI(vrHelper) {
        // VR button
        document.getElementById('vrButton').addEventListener('click', async () => {
            try {
                if (vrHelper.baseExperience) {
                    await vrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
                }
            } catch (error) {
                console.error('VR Error:', error);
                alert('VR not available. Make sure your Quest 3S is connected via Link/Air Link.');
            }
        });
        
        // Camera presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.cameraPreset;
                this.moveCameraToPreset(preset);
            });
        });
        
        // Music
        document.getElementById('playMusicBtn').addEventListener('click', () => {
            this.playMusic();
        });
        
        // Help
        document.addEventListener('keydown', (e) => {
            if (e.key === 'h' || e.key === 'H') {
                this.showHelp();
            }
            if (e.key === 'd' || e.key === 'D') {
                this.debugMode = !this.debugMode;
            }
        });
    }

    moveCameraToPreset(preset) {
        const presets = {
            entrance: { pos: new BABYLON.Vector3(0, 1.7, -10), target: new BABYLON.Vector3(0, 1.7, 0) },
            danceFloor: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 3, -24) },
            djBooth: { pos: new BABYLON.Vector3(0, 2.5, -18), target: new BABYLON.Vector3(0, 3, -24) },
            ledWallClose: { pos: new BABYLON.Vector3(0, 3, -21), target: new BABYLON.Vector3(0, 3, -24) },
            overview: { pos: new BABYLON.Vector3(-12, 6, -12), target: new BABYLON.Vector3(0, 2, -15) },
            ceiling: { pos: new BABYLON.Vector3(0, 7, -12), target: new BABYLON.Vector3(0, 0, -15) }
        };
        
        const p = presets[preset];
        if (p) {
            this.camera.applyGravity = false;
            this.camera.checkCollisions = false;
            
            this.camera.position = p.pos.clone();
            this.camera.setTarget(p.target);
            
            setTimeout(() => {
                this.camera.applyGravity = false;
                this.camera.checkCollisions = false;
            }, 100);
            
            this.showCameraTransitionFeedback(preset);
            console.log('📷 Camera moved to:', preset, p.pos);
        }
    }

    showCameraTransitionFeedback(preset) {
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 255, 200, 0.9);
            color: black;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 10000;
            animation: fadeOut 1.5s forwards;
        `;
        feedback.textContent = `📷 ${preset.toUpperCase()}`;
        document.body.appendChild(feedback);
        
        setTimeout(() => feedback.remove(), 1500);
    }

    playMusic() {
        const url = document.getElementById('musicUrl').value;
        if (!url) {
            alert('Please enter a music stream URL');
            return;
        }
        
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = "anonymous";
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioSource.connect(this.audioAnalyser);
            this.audioAnalyser.connect(this.audioContext.destination);
        }
        
        this.audioElement.src = url;
        this.audioElement.play();
        console.log('🎵 Music playing');
    }

    setupPerformanceMonitor() {
        this.fpsElement = document.getElementById('fpsCounter');
        this.lastTime = performance.now();
        this.frames = 0;
        this.fps = 0;
        this.debugMode = false;
    }

    updatePerformanceMonitor() {
        this.frames++;
        const now = performance.now();
        
        if (now >= this.lastTime + 1000) {
            this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
            this.frames = 0;
            this.lastTime = now;
            
            const color = this.fps >= 60 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
            let text = `FPS: ${this.fps}`;
            
            if (this.debugMode) {
                const pos = this.camera.position;
                text += `\nX: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
            }
            
            this.fpsElement.textContent = text;
            this.fpsElement.style.color = color;
        }
    }

    showHelp() {
        alert(`🎮 CONTROLS:
        
MOVEMENT:
  W/A/S/D - Move around
  E/Q - Fly up/down
  Mouse - Look around
  
CAMERA PRESETS:
  Click buttons to jump to preset views
  
DEBUG:
  D - Toggle debug mode (show position)
  H - Show this help
  
VR:
  Click "Enter VR" button
  Requires Quest 3S via Link/Air Link`);
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    new VRClub();
});
