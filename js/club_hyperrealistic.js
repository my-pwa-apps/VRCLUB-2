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
        
        // Cache Color3 objects for performance (avoid creating new ones every frame)
        this.cachedColors = {
            red: new BABYLON.Color3(1, 0, 0),
            green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1),
            magenta: new BABYLON.Color3(1, 0, 1),
            yellow: new BABYLON.Color3(1, 1, 0),
            cyan: new BABYLON.Color3(0, 1, 1),
            white: new BABYLON.Color3(10, 10, 10),
            black: new BABYLON.Color3(0, 0, 0)
        };
        
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
        
        // Add atmospheric haze/fog for depth (reduced to see truss)
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXPONENTIAL;
        this.scene.fogDensity = 0.008; // Reduced from 0.02 for visibility
        this.scene.fogColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        
        // Setup camera FIRST (needed for post-processing)
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
        
        // Add glow layer for neon/LED effects (works in both desktop and VR)
        this.glowLayer = new BABYLON.GlowLayer("glow", this.scene, {
            mainTextureFixedSize: 1024, // Increased for VR
            blurKernelSize: 64
        });
        this.glowLayer.intensity = 2.5; // Increased intensity for VR visibility
        
        // Add post-processing for cinematic realism
        this.addPostProcessing();
        
        // Build hyperrealistic club (need floor first for VR setup)
        this.createFloor();
        
        // Enable VR with teleportation on floor
        const vrHelper = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: [this.floorMesh]
        }).catch(err => {
            // VR not available - continue with desktop mode
            return null;
        });
        
        // Store VR helper for later use
        this.vrHelper = vrHelper;
        
        // Continue building club
        this.createWalls();
        this.createCeiling();
        this.createDJBooth();
        this.createPASpeakers();
        this.createLEDWall();
        this.createLasers();
        this.createLights();
        this.createSmokeParticles();
        this.createBarArea();
        this.createTrussMountedLights();
        
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
    }

    createFloor() {
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: 35,
            height: 45,
            subdivisions: 20
        }, this.scene);
        floor.position.z = -10;
        
        // Store floor mesh for VR teleportation
        this.floorMesh = floor;
        
        // Industrial concrete floor with PBR - worn and realistic
        const floorMat = new BABYLON.PBRMetallicRoughnessMaterial("floorMat", this.scene);
        floorMat.baseColor = new BABYLON.Color3(0.25, 0.25, 0.27); // Concrete gray
        floorMat.metallic = 0.0; // Not metallic at all
        floorMat.roughness = 0.9; // Very rough, matte concrete
        
        // Create procedural noise texture for concrete variation
        const noiseTexture = new BABYLON.NoiseProceduralTexture("floorNoise", 512, this.scene);
        noiseTexture.octaves = 4;
        noiseTexture.persistence = 0.8;
        noiseTexture.animationSpeedFactor = 0; // Static texture
        floorMat.bumpTexture = noiseTexture;
        floorMat.bumpTexture.level = 0.3; // Subtle bump
        
        // Slightly dirty, aged concrete
        floorMat.environmentIntensity = 0.1; // Minimal reflections
        
        floor.material = floorMat;
        floor.receiveShadows = true;
    }

    createWalls() {
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
        const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
            width: 35,
            height: 0.3,
            depth: 45
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, 10, -10);
        
        // Industrial concrete/metal ceiling
        const ceilingMat = new BABYLON.PBRMetallicRoughnessMaterial("ceilingMat", this.scene);
        ceilingMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.17); // Dark industrial gray
        ceilingMat.metallic = 0.2;
        ceilingMat.roughness = 0.8;
        ceiling.material = ceilingMat;
        
        // Add lighting truss above dance floor
        this.createLightingTruss();
    }

    createLightingTruss() {
        // Professional stage truss material - metallic aluminum
        const trussMat = new BABYLON.PBRMetallicRoughnessMaterial("trussMat", this.scene);
        trussMat.baseColor = new BABYLON.Color3(0.6, 0.6, 0.65); // Aluminum color
        trussMat.metallic = 1.0; // Fully metallic
        trussMat.roughness = 0.3; // Somewhat shiny
        
        // Darker material for diagonal bracing
        const braceMat = new BABYLON.PBRMetallicRoughnessMaterial("braceMat", this.scene);
        braceMat.baseColor = new BABYLON.Color3(0.5, 0.5, 0.55);
        braceMat.metallic = 1.0;
        braceMat.roughness = 0.4;
        
        // Main horizontal truss beams (square tube) - make them triangular truss
        const tubeSize = 0.05; // Individual tube diameter
        const trussSize = 0.3; // Overall truss width/height
        
        // Helper function to create triangular truss section
        const createTriangularTruss = (name, length, position) => {
            const parent = new BABYLON.TransformNode(name + "_parent", this.scene);
            parent.position = position;
            
            // Three main chords (corner tubes)
            const chord1 = BABYLON.MeshBuilder.CreateCylinder(name + "_chord1", {
                diameter: tubeSize,
                height: length
            }, this.scene);
            chord1.rotation.z = Math.PI / 2;
            chord1.position = new BABYLON.Vector3(0, trussSize * 0.289, 0); // Top
            chord1.parent = parent;
            chord1.material = trussMat;
            
            const chord2 = BABYLON.MeshBuilder.CreateCylinder(name + "_chord2", {
                diameter: tubeSize,
                height: length
            }, this.scene);
            chord2.rotation.z = Math.PI / 2;
            chord2.position = new BABYLON.Vector3(0, -trussSize * 0.144, -trussSize * 0.25); // Bottom left
            chord2.parent = parent;
            chord2.material = trussMat;
            
            const chord3 = BABYLON.MeshBuilder.CreateCylinder(name + "_chord3", {
                diameter: tubeSize,
                height: length
            }, this.scene);
            chord3.rotation.z = Math.PI / 2;
            chord3.position = new BABYLON.Vector3(0, -trussSize * 0.144, trussSize * 0.25); // Bottom right
            chord3.parent = parent;
            chord3.material = trussMat;
            
            // Diagonal bracing every 1m
            const segments = Math.floor(length / 1);
            for (let i = 0; i < segments; i++) {
                const xPos = -length / 2 + (i * 1) + 0.5;
                
                // Create cross-braces in triangular pattern
                const brace1 = BABYLON.MeshBuilder.CreateCylinder(name + "_brace1_" + i, {
                    diameter: tubeSize * 0.7,
                    height: trussSize * 0.5
                }, this.scene);
                brace1.rotation.x = Math.PI / 4;
                brace1.rotation.z = Math.PI / 2;
                brace1.position = new BABYLON.Vector3(xPos, 0, 0);
                brace1.parent = parent;
                brace1.material = braceMat;
                
                // Add bolt connectors at joints
                if (i % 2 === 0) {
                    const bolt = BABYLON.MeshBuilder.CreateSphere(name + "_bolt_" + i, {
                        diameter: tubeSize * 1.5
                    }, this.scene);
                    bolt.position = new BABYLON.Vector3(xPos, trussSize * 0.289, 0);
                    bolt.parent = parent;
                    bolt.material = trussMat;
                }
            }
            
            return parent;
        };
        
        // Truss 1 - Front (above dance floor front)
        const truss1 = createTriangularTruss("truss1", 20, new BABYLON.Vector3(0, 8, -8));
        
        // Truss 2 - Middle (center of dance floor)
        const truss2 = createTriangularTruss("truss2", 20, new BABYLON.Vector3(0, 8, -12));
        
        // Truss 3 - Back (near LED wall)
        const truss3 = createTriangularTruss("truss3", 20, new BABYLON.Vector3(0, 8, -16));
        
        // Cross beams connecting the trusses - also triangular
        for (let i = -8; i <= 8; i += 4) {
            const crossBeam = createTriangularTruss("crossBeam" + i, 8, new BABYLON.Vector3(i, 8, -12));
            crossBeam.rotation.y = Math.PI / 2;
        }
        
        // Diagonal support cables/wires from ceiling to truss
        const cableMat = new BABYLON.StandardMaterial("cableMat", this.scene);
        cableMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        cableMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        
        // Support cables
        const cablePositions = [
            { x: -10, z: -8 },
            { x: -10, z: -16 },
            { x: 10, z: -8 },
            { x: 10, z: -16 },
            { x: 0, z: -8 },
            { x: 0, z: -16 }
        ];
        
        cablePositions.forEach((pos, i) => {
            const cable = BABYLON.MeshBuilder.CreateCylinder("cable" + i, {
                diameter: 0.03,
                height: 2
            }, this.scene);
            cable.position = new BABYLON.Vector3(pos.x, 9, pos.z);
            cable.material = cableMat;
        });
    }

    createDJBooth() {
        // Professional DJ platform/riser
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 9,
            height: 1.2,
            depth: 5
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.6, -24);
        
        const platformMat = new BABYLON.PBRMetallicRoughnessMaterial("platformMat", this.scene);
        platformMat.baseColor = new BABYLON.Color3(0.02, 0.02, 0.03);
        platformMat.metallic = 0.9;
        platformMat.roughness = 0.2;
        platform.material = platformMat;
        platform.receiveShadows = true;
        
        // Platform safety rail (front)
        const railMat = new BABYLON.PBRMetallicRoughnessMaterial("railMat", this.scene);
        railMat.baseColor = new BABYLON.Color3(0.7, 0.7, 0.75);
        railMat.metallic = 1.0;
        railMat.roughness = 0.3;
        
        const frontRail = BABYLON.MeshBuilder.CreateBox("frontRail", {
            width: 9,
            height: 0.08,
            depth: 0.08
        }, this.scene);
        frontRail.position = new BABYLON.Vector3(0, 1.5, -21.5);
        frontRail.material = railMat;
        
        // DJ console table (main work surface)
        const djConsole = BABYLON.MeshBuilder.CreateBox("djConsole", {
            width: 6,
            height: 0.35,
            depth: 2.5
        }, this.scene);
        djConsole.position = new BABYLON.Vector3(0, 1.5, -24);
        
        const consoleMat = new BABYLON.PBRMetallicRoughnessMaterial("consoleMat", this.scene);
        consoleMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        consoleMat.metallic = 0.95;
        consoleMat.roughness = 0.1;
        consoleMat.emissiveColor = new BABYLON.Color3(0, 0.02, 0.05);
        djConsole.material = consoleMat;
        
        // Console legs/supports
        for (let x of [-2.8, 2.8]) {
            const leg = BABYLON.MeshBuilder.CreateCylinder("consoleLeg", {
                diameter: 0.08,
                height: 0.3
            }, this.scene);
            leg.position = new BABYLON.Vector3(x, 1.35, -24);
            leg.material = railMat;
        }
        
        // Cable management tray under console
        const cableTray = BABYLON.MeshBuilder.CreateBox("cableTray", {
            width: 5.5,
            height: 0.1,
            depth: 2
        }, this.scene);
        cableTray.position = new BABYLON.Vector3(0, 1.25, -24);
        const trayMat = new BABYLON.StandardMaterial("trayMat", this.scene);
        trayMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        cableTray.material = trayMat;
        
        // CDJ Decks
        this.createCDJs();
        
        // DJ mixer
        this.createMixer();
        
        // Monitor speakers
        this.createMonitorSpeakers();
        
        // VU meters
        this.createVUMeters();
        
        // Laptop stand
        this.createLaptopStand();
        
        // Accent lighting under platform
        this.createBoothLighting();
        
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
    
    createLaptopStand() {
        // Laptop stand/shelf
        const laptopStand = BABYLON.MeshBuilder.CreateBox("laptopStand", {
            width: 1.5,
            height: 0.05,
            depth: 1.0
        }, this.scene);
        laptopStand.position = new BABYLON.Vector3(-3, 1.7, -24.5);
        
        const standMat = new BABYLON.PBRMetallicRoughnessMaterial("standMat", this.scene);
        standMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        standMat.metallic = 0.8;
        standMat.roughness = 0.4;
        laptopStand.material = standMat;
        
        // Laptop screen (glowing)
        const laptop = BABYLON.MeshBuilder.CreateBox("laptop", {
            width: 0.8,
            height: 0.5,
            depth: 0.02
        }, this.scene);
        laptop.position = new BABYLON.Vector3(-3, 1.98, -24.7);
        laptop.rotation.x = -0.3;
        
        const screenMat = new BABYLON.StandardMaterial("screenMat", this.scene);
        screenMat.emissiveColor = new BABYLON.Color3(0.2, 0.3, 0.8);
        screenMat.disableLighting = true;
        laptop.material = screenMat;
    }
    
    createBoothLighting() {
        // LED strip under platform (accent lighting)
        const stripMat = new BABYLON.StandardMaterial("ledStripMat", this.scene);
        stripMat.emissiveColor = new BABYLON.Color3(0, 0.5, 1);
        stripMat.disableLighting = true;
        stripMat.alpha = 0.8;
        
        for (let side of [-4.2, 4.2]) {
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
        }
    }

    createPASpeakers() {
        
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

    createTrussMountedLights() {
        // Moving head lights on truss (PAR cans style)
        const lightFixtureMat = new BABYLON.PBRMetallicRoughnessMaterial("lightFixtureMat", this.scene);
        lightFixtureMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        lightFixtureMat.metallic = 0.9;
        lightFixtureMat.roughness = 0.2;
        
        // Array of light positions on truss
        const lightPositions = [
            { x: -8, z: -12 },
            { x: -4, z: -12 },
            { x: 0, z: -12 },
            { x: 4, z: -12 },
            { x: 8, z: -12 },
            { x: -6, z: -8 },
            { x: 6, z: -8 },
            { x: -6, z: -16 },
            { x: 6, z: -16 }
        ];
        
        this.trussLights = [];
        
        lightPositions.forEach((pos, i) => {
            // Light fixture body
            const fixture = BABYLON.MeshBuilder.CreateCylinder("lightFixture" + i, {
                diameter: 0.3,
                height: 0.4
            }, this.scene);
            fixture.position = new BABYLON.Vector3(pos.x, 7.7, pos.z);
            fixture.rotation.x = Math.PI / 2;
            fixture.material = lightFixtureMat;
            
            // Light lens (glowing)
            const lens = BABYLON.MeshBuilder.CreateCylinder("lens" + i, {
                diameter: 0.25,
                height: 0.05
            }, this.scene);
            lens.position = new BABYLON.Vector3(pos.x, 7.5, pos.z);
            lens.rotation.x = Math.PI / 2;
            
            const lensMat = new BABYLON.StandardMaterial("lensMat" + i, this.scene);
            lensMat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
            lensMat.disableLighting = true;
            lens.material = lensMat;
            
            this.trussLights.push({ fixture, lens, lensMat });
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
        
        strobePositions.forEach((pos, i) => {
            const strobe = BABYLON.MeshBuilder.CreateBox("strobe" + i, {
                width: 0.4,
                height: 0.3,
                depth: 0.3
            }, this.scene);
            strobe.position = new BABYLON.Vector3(pos.x, 7.6, pos.z);
            
            const strobeMat = new BABYLON.StandardMaterial("strobeMat" + i, this.scene);
            strobeMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Off by default
            strobeMat.disableLighting = true;
            strobe.material = strobeMat;
            
            // Add powerful point light for each strobe
            const strobeLight = new BABYLON.PointLight("strobeLight" + i,
                new BABYLON.Vector3(pos.x, 7.6, pos.z),
                this.scene
            );
            strobeLight.diffuse = new BABYLON.Color3(1, 1, 1);
            strobeLight.intensity = 0; // Off by default
            strobeLight.range = 30;
            
            this.strobes.push({ 
                mesh: strobe, 
                material: strobeMat,
                light: strobeLight,
                flashDuration: 0,
                nextFlashTime: Math.random() * 2
            });
        });
    }

    createSmokeParticles() {
        
        // Heavy smoke machine effect on dance floor (multiple sources)
        const smokePositions = [
            { x: -8, z: -8 },   // Front left
            { x: 8, z: -8 },    // Front right
            { x: -8, z: -16 },  // Back left
            { x: 8, z: -16 },   // Back right
            { x: 0, z: -20 }    // DJ booth
        ];
        
        smokePositions.forEach((smokePos, idx) => {
            const smokeSystem = new BABYLON.ParticleSystem("smoke" + idx, 600, this.scene);
            smokeSystem.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
            
            smokeSystem.emitter = new BABYLON.Vector3(smokePos.x, 0.2, smokePos.z);
            smokeSystem.minEmitBox = new BABYLON.Vector3(-0.5, 0, -0.5);
            smokeSystem.maxEmitBox = new BABYLON.Vector3(0.5, 0, 0.5);
            
            // Balanced smoke - visible but not overwhelming
            smokeSystem.color1 = new BABYLON.Color4(0.15, 0.15, 0.25, 0.15);
            smokeSystem.color2 = new BABYLON.Color4(0.2, 0.2, 0.3, 0.1);
            smokeSystem.colorDead = new BABYLON.Color4(0.05, 0.05, 0.1, 0);
            
            smokeSystem.minSize = 2;
            smokeSystem.maxSize = 6;
            
            smokeSystem.minLifeTime = 4;
            smokeSystem.maxLifeTime = 8;
            
            smokeSystem.emitRate = 40;
            
            smokeSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            
            smokeSystem.gravity = new BABYLON.Vector3(0, 0.2, 0);
            
            // Spread smoke across dance floor
            smokeSystem.direction1 = new BABYLON.Vector3(-2, 1, -2);
            smokeSystem.direction2 = new BABYLON.Vector3(2, 3, 2);
            
            smokeSystem.minEmitPower = 0.8;
            smokeSystem.maxEmitPower = 2.0;
            smokeSystem.updateSpeed = 0.015;
            
            // Add turbulence for realistic swirling
            smokeSystem.noiseStrength = new BABYLON.Vector3(2, 1, 2);
            
            smokeSystem.start();
            
            this.smokeMachines.push(smokeSystem);
        });
    }

    createLEDWall() {
        
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
                const y = (row * panelHeight) + (panelHeight / 2) + 2.5;
                const z = -26; // Behind DJ booth
                
                panel.position = new BABYLON.Vector3(x, y, z);
                
                // Make LED panels highly visible with bright emission
                const panelMat = new BABYLON.StandardMaterial("ledMat_" + row + "_" + col, this.scene);
                panelMat.emissiveColor = new BABYLON.Color3(2, 0, 0); // Brighter red
                panelMat.disableLighting = true;
                panel.material = panelMat;
                
                // Add point light behind each panel for backlighting
                if (row === 1 && col % 2 === 0) {
                    const backLight = new BABYLON.PointLight("ledBack_" + row + "_" + col,
                        new BABYLON.Vector3(x, y, z - 0.5), this.scene);
                    backLight.diffuse = new BABYLON.Color3(1, 0, 0);
                    backLight.intensity = 3;
                    backLight.range = 5;
                }
                
                this.ledPanels.push({
                    mesh: panel,
                    material: panelMat,
                    row: row,
                    col: col,
                    centerX: col - (cols / 2) + 0.5,
                    centerY: row - (rows / 2) + 0.5
                });
            }
        }
        
        this.ledTime = 0;
        this.ledPattern = 0;
        this.ledPatternSwitchTime = 0;
        this.ledColorIndex = 0;
        this.lastColorChange = -1;
        this.lastPatternChange = -1;
        
    }

    createLasers() {
        
        this.lasers = [];
        
        // Reduced lasers mounted UNDER the truss (hanging down)
        // Each laser has a type: 'single', 'spread', 'multi'
        const laserPositions = [
            { x: -6, z: -10, trussY: 7.55, type: 'spread' },   // Spread laser left
            { x: 0, z: -10, trussY: 7.55, type: 'multi' },     // Multi-beam center
            { x: 6, z: -10, trussY: 7.55, type: 'single' }     // Single beam right
        ];
        
        laserPositions.forEach((pos, i) => {
            // Laser housing UNDER truss (hanging from clamp)
            const housing = BABYLON.MeshBuilder.CreateBox("laserHousing" + i, {
                width: 0.25,
                height: 0.2,
                depth: 0.35
            }, this.scene);
            housing.position = new BABYLON.Vector3(pos.x, pos.trussY, pos.z);
            housing.isPickable = false;
            
            const housingMat = new BABYLON.PBRMetallicRoughnessMaterial("laserHousingMat" + i, this.scene);
            housingMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            housingMat.metallic = 0.8;
            housingMat.roughness = 0.3;
            housingMat.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
            housing.material = housingMat;
            
            // Mounting clamp connecting to truss
            const clamp = BABYLON.MeshBuilder.CreateBox("laserClamp" + i, {
                width: 0.3,
                height: 0.15,
                depth: 0.3
            }, this.scene);
            clamp.position = new BABYLON.Vector3(pos.x, pos.trussY + 0.25, pos.z);
            clamp.isPickable = false;
            const clampMat = new BABYLON.PBRMetallicRoughnessMaterial("clampMat" + i, this.scene);
            clampMat.baseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
            clampMat.metallic = 1.0;
            clampMat.roughness = 0.4;
            clamp.material = clampMat;
            
            // Create beams based on laser type
            const beams = [];
            const lights = [];
            
            if (pos.type === 'single') {
                // Single beam laser
                const beam = this.createLaserBeam(i, 0, pos);
                beams.push(beam);
                
                const light = new BABYLON.SpotLight("laserLight" + i,
                    new BABYLON.Vector3(pos.x, pos.trussY, pos.z),
                    new BABYLON.Vector3(0, -1, 0),
                    Math.PI / 8, 5, this.scene
                );
                light.diffuse = new BABYLON.Color3(1, 0, 0);
                light.intensity = 5;
                light.range = 20;
                lights.push(light);
                
            } else if (pos.type === 'spread') {
                // Spread laser (3 beams fanning out)
                for (let j = -1; j <= 1; j++) {
                    const beam = this.createLaserBeam(i, j, pos);
                    beams.push(beam);
                    
                    const light = new BABYLON.SpotLight("laserLight" + i + "_" + j,
                        new BABYLON.Vector3(pos.x, pos.trussY, pos.z),
                        new BABYLON.Vector3(j * 0.3, -1, 0).normalize(),
                        Math.PI / 12, 5, this.scene
                    );
                    light.diffuse = new BABYLON.Color3(1, 0, 0);
                    light.intensity = 3;
                    light.range = 20;
                    lights.push(light);
                }
                
            } else if (pos.type === 'multi') {
                // Multi-beam laser (5 rotating beams in circle)
                for (let j = 0; j < 5; j++) {
                    const beam = this.createLaserBeam(i, j, pos);
                    beams.push(beam);
                    
                    const angle = (j / 5) * Math.PI * 2;
                    const light = new BABYLON.SpotLight("laserLight" + i + "_" + j,
                        new BABYLON.Vector3(pos.x, pos.trussY, pos.z),
                        new BABYLON.Vector3(Math.sin(angle) * 0.3, -1, Math.cos(angle) * 0.3).normalize(),
                        Math.PI / 12, 5, this.scene
                    );
                    light.diffuse = new BABYLON.Color3(1, 0, 0);
                    light.intensity = 2;
                    light.range = 20;
                    lights.push(light);
                }
            }
            
            this.lasers.push({
                beams: beams,
                housing: housing,
                clamp: clamp,
                housingMat: housingMat,
                lights: lights,
                rotation: 0,
                rotationSpeed: 0.01,
                tiltPhase: 0,
                originPos: new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z),
                type: pos.type,
                colorIndex: 0
            });
        });
        
        // Initialize lighting mode control
        this.lightingMode = 'synchronized'; // or 'random'
        this.modeSwitchTime = 0;
        this.currentColorIndex = 0;
        this.colorSwitchTime = 0;
        
        // Alternating lights/lasers control
        this.lightsActive = true; // Start with lights
        this.lasersActive = false;
        this.lightModeSwitchTime = 0;
        
    }
    
    createLaserBeam(laserIndex, beamIndex, pos) {
        const beam = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_beam" + beamIndex, {
            diameter: 0.04,
            height: 1,
            tessellation: 8
        }, this.scene);
        beam.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        beam.isPickable = false;
        beam.rotationQuaternion = BABYLON.Quaternion.Identity();
        
        const beamMat = new BABYLON.StandardMaterial("laserBeamMat" + laserIndex + "_" + beamIndex, this.scene);
        beamMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        beamMat.alpha = 0.6;
        beamMat.disableLighting = true;
        beam.material = beamMat;
        
        return { mesh: beam, material: beamMat, beamIndex: beamIndex };
    }

    createLights() {
        
        // Very dim ambient for industrial atmosphere
        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.08;
        ambient.diffuse = new BABYLON.Color3(0.1, 0.1, 0.12);
        
        // Spotlights mounted on truss (moving heads)
        this.spotlights = [];
        const spotPositions = [
            { x: -8, z: -12 },
            { x: -4, z: -12 },
            { x: 0, z: -12 },
            { x: 4, z: -12 },
            { x: 8, z: -12 },
            { x: -6, z: -8 },
            { x: 6, z: -8 },
            { x: -6, z: -16 },
            { x: 6, z: -16 }
        ];
        
        const spotColors = [
            new BABYLON.Color3(1, 0, 0),      // Red
            new BABYLON.Color3(0, 0, 1),      // Blue
            new BABYLON.Color3(0, 1, 0),      // Green
            new BABYLON.Color3(1, 0, 1),      // Magenta
            new BABYLON.Color3(1, 1, 0),      // Yellow
            new BABYLON.Color3(0, 1, 1),      // Cyan
            new BABYLON.Color3(1, 0.5, 0),    // Orange
            new BABYLON.Color3(0.5, 0, 1),    // Purple
            new BABYLON.Color3(1, 1, 1)       // White
        ];
        
        spotPositions.forEach((pos, i) => {
            // Spotlight from truss position
            const spot = new BABYLON.SpotLight("spot" + i,
                new BABYLON.Vector3(pos.x, 7.8, pos.z),  // Truss height
                new BABYLON.Vector3(0, -1, 0),           // Initial direction
                Math.PI / 6,                              // Narrower cone for focused beams
                5,                                        // Sharper falloff
                this.scene
            );
            spot.diffuse = spotColors[i % spotColors.length];
            spot.intensity = 8;
            spot.range = 25;
            
            // Enable shadows for more immersion (expensive but worth it for some lights)
            if (i % 3 === 0) { // Only every 3rd light for performance
                const shadowGenerator = new BABYLON.ShadowGenerator(512, spot);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurScale = 2;
                shadowGenerator.setDarkness(0.4);
            }
            
            this.spotlights.push({
                light: spot,
                basePos: new BABYLON.Vector3(pos.x, 7.8, pos.z),
                phase: Math.random() * Math.PI * 2,
                speed: 0.5 + Math.random() * 0.5,
                color: spotColors[i % spotColors.length]
            });
        });
        
        // LED wall backlight
        const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
        ledLight.diffuse = new BABYLON.Color3(0.8, 0.8, 1.0);
        ledLight.intensity = 10;
        ledLight.range = 25;
        
    }

    updateAnimations() {
        const time = performance.now() / 1000;
        this.ledTime += 0.016;
        
        // Update LED wall
        if (this.ledPanels) {
            this.updateLEDWall(time);
        }
        
        // Alternate between lights and lasers (every 15-30 seconds)
        if (time - this.lightModeSwitchTime > (15 + Math.random() * 15)) {
            this.lightsActive = !this.lightsActive;
            this.lasersActive = !this.lasersActive;
            this.lightModeSwitchTime = time;
        }
        
        // Switch between synchronized and random lighting modes (every 20-40 seconds)
        if (time - this.modeSwitchTime > (20 + Math.random() * 20)) {
            this.lightingMode = this.lightingMode === 'synchronized' ? 'random' : 'synchronized';
            this.modeSwitchTime = time;
            
            // If switching to synchronized, reset all phases
            if (this.lightingMode === 'synchronized' && this.lasers) {
                this.lasers.forEach(laser => {
                    laser.rotation = 0;
                    laser.tiltPhase = 0;
                });
            }
        }
        
        // Color switching (every 8-12 seconds)
        if (time - this.colorSwitchTime > (8 + Math.random() * 4)) {
            this.currentColorIndex = (this.currentColorIndex + 1) % 3; // RGB cycle
            this.colorSwitchTime = time;
        }
        
        // Update lasers with raycasting and dynamic positioning
        if (this.lasers && this.lasersActive) {
            this.lasers.forEach((laser, i) => {
                // Movement depends on mode
                if (this.lightingMode === 'synchronized') {
                    laser.rotation += 0.015;
                    laser.tiltPhase += 0.02;
                } else {
                    laser.rotation += laser.rotationSpeed;
                    laser.tiltPhase += 0.015 + Math.sin(time + i) * 0.01;
                }
                
                // Update each beam in the laser
                laser.beams.forEach((beam, beamIdx) => {
                    let direction;
                    
                    if (laser.type === 'single') {
                        // Single beam pointing down with movement
                        const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.3;
                        const dirX = Math.sin(laser.rotation) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(laser.rotation) * Math.sin(tilt);
                        direction = new BABYLON.Vector3(dirX, dirY, dirZ);
                        
                    } else if (laser.type === 'spread') {
                        // Spread laser (3 beams fanning out)
                        const spreadAngle = (beam.beamIndex - 1) * 0.4; // -0.4, 0, 0.4
                        const tilt = Math.PI / 6 + Math.sin(laser.tiltPhase) * 0.2;
                        const dirX = Math.sin(laser.rotation + spreadAngle) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(laser.rotation + spreadAngle) * Math.sin(tilt);
                        direction = new BABYLON.Vector3(dirX, dirY, dirZ);
                        
                    } else if (laser.type === 'multi') {
                        // Multi-beam (5 beams rotating in circle)
                        const baseAngle = (beam.beamIndex / 5) * Math.PI * 2;
                        const rotatingAngle = baseAngle + laser.rotation * 2;
                        const tilt = Math.PI / 5;
                        const dirX = Math.sin(rotatingAngle) * Math.sin(tilt);
                        const dirY = -Math.cos(tilt);
                        const dirZ = Math.cos(rotatingAngle) * Math.sin(tilt);
                        direction = new BABYLON.Vector3(dirX, dirY, dirZ);
                    }
                    
                    // Raycast to find surface
                    const ray = new BABYLON.Ray(laser.originPos, direction, 30);
                    const hit = this.scene.pickWithRay(ray, (mesh) => {
                        return mesh.isPickable && !mesh.name.includes('laser') && !mesh.name.includes('Housing') && !mesh.name.includes('Clamp');
                    });
                    
                    let beamLength = 15;
                    if (hit && hit.hit && hit.pickedPoint) {
                        beamLength = BABYLON.Vector3.Distance(laser.originPos, hit.pickedPoint);
                    }
                    
                    // Update beam geometry
                    beam.mesh.scaling.y = beamLength;
                    beam.mesh.position = laser.originPos.add(direction.scale(beamLength * 0.5));
                    
                    // Orient beam
                    const up = new BABYLON.Vector3(0, 1, 0);
                    const rotAxis = BABYLON.Vector3.Cross(up, direction);
                    const angle = Math.acos(BABYLON.Vector3.Dot(up.normalize(), direction.normalize()));
                    
                    if (rotAxis.length() > 0.001) {
                        beam.mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(rotAxis.normalize(), angle);
                    } else {
                        beam.mesh.rotationQuaternion = BABYLON.Vector3.Dot(up, direction) > 0 ?
                            BABYLON.Quaternion.Identity() :
                            BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), Math.PI);
                    }
                    
                    // Color all beams
                    if (this.currentColorIndex === 0) {
                        beam.material.emissiveColor = this.cachedColors.red;
                    } else if (this.currentColorIndex === 1) {
                        beam.material.emissiveColor = this.cachedColors.green;
                    } else {
                        beam.material.emissiveColor = this.cachedColors.blue;
                    }
                });
                
                // Update lights
                laser.lights.forEach((light, lightIdx) => {
                    if (this.currentColorIndex === 0) {
                        light.diffuse = this.cachedColors.red;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
                    } else if (this.currentColorIndex === 1) {
                        light.diffuse = this.cachedColors.green;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0);
                    } else {
                        light.diffuse = this.cachedColors.blue;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0, 0, 0.2);
                    }
                    light.intensity = this.lasersActive ? 5 : 0;
                });
            });
        } else if (this.lasers) {
            // Turn off lasers when not active
            this.lasers.forEach(laser => {
                laser.lights.forEach(light => {
                    light.intensity = 0;
                });
                laser.beams.forEach(beam => {
                    beam.mesh.visibility = 0;
                    beam.material.alpha = 0;
                });
            });
        }
        
        // Make laser beams visible when active
        if (this.lasers && this.lasersActive) {
            this.lasers.forEach(laser => {
                laser.beams.forEach(beam => {
                    beam.mesh.visibility = 1;
                    beam.material.alpha = 0.6;
                });
            });
        }
        
        // Update spotlights with synchronized movement patterns
        if (this.spotlights && this.lightsActive) {
            // Choose pattern based on lighting mode
            let globalPhase = time * 0.5;
            
            this.spotlights.forEach((spot, i) => {
                let dirX, dirZ;
                
                if (this.lightingMode === 'synchronized') {
                    // All lights do same pattern
                    dirX = Math.sin(globalPhase) * 0.8;
                    dirZ = Math.cos(globalPhase) * 0.8;
                } else {
                    // Individual patterns
                    spot.phase += 0.016 * spot.speed;
                    const patternType = i % 3;
                    
                    if (patternType === 0) {
                        // Circular sweep
                        dirX = Math.sin(spot.phase);
                        dirZ = Math.cos(spot.phase);
                    } else if (patternType === 1) {
                        // Figure-8 pattern
                        dirX = Math.sin(spot.phase * 2);
                        dirZ = Math.sin(spot.phase) * Math.cos(spot.phase);
                    } else {
                        // Cross pattern
                        dirX = Math.sin(spot.phase) * 0.5;
                        dirZ = Math.cos(spot.phase * 1.5) * 0.5;
                    }
                }
                
                // Set direction (pointing from truss to dance floor)
                spot.light.direction = new BABYLON.Vector3(dirX, -1, dirZ).normalize();
                
                // Synchronized intensity pulsing
                spot.light.intensity = this.lightsActive ? (6 + Math.sin(time * 3) * 3) : 0;
            });
        } else if (this.spotlights) {
            // Turn off spotlights when not active
            this.spotlights.forEach(spot => {
                spot.light.intensity = 0;
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
        
        // Update truss-mounted lights - all same color
        if (this.trussLights && this.trussLights.length > 0) {
            const pulse = 0.4 + Math.sin(time * 3) * 0.6;
            
            // All lights same color based on current color index
            let currentColor;
            if (this.currentColorIndex === 0) {
                currentColor = this.cachedColors.red;
            } else if (this.currentColorIndex === 1) {
                currentColor = this.cachedColors.green;
            } else {
                currentColor = this.cachedColors.blue;
            }
            
            this.trussLights.forEach((light, i) => {
                light.lensMat.emissiveColor = currentColor.scale(pulse);
            });
        }
        
        // Update LED wall with abstract animations
        if (this.ledPanels && this.ledPanels.length > 0) {
            this.ledTime += 0.016;
            
            // Switch patterns every 15-25 seconds
            if (time - this.ledPatternSwitchTime > (15 + Math.random() * 10)) {
                this.ledPattern = (this.ledPattern + 1) % 4;
                this.ledPatternSwitchTime = time;
            }
            
            // Initialize currentColorIndex if not set
            if (this.currentColorIndex === undefined) {
                this.currentColorIndex = 0;
            }
            
            // Get current color
            let ledColor;
            if (this.currentColorIndex === 0) {
                ledColor = this.cachedColors.red;
            } else if (this.currentColorIndex === 1) {
                ledColor = this.cachedColors.green;
            } else {
                ledColor = this.cachedColors.blue;
            }
            
            this.ledPanels.forEach((panel) => {
                let brightness = 1;
                
                if (this.ledPattern === 0) {
                    // Circular ripples from center
                    const dist = Math.sqrt(panel.centerX * panel.centerX + panel.centerY * panel.centerY);
                    brightness = 0.3 + 0.7 * Math.abs(Math.sin(dist * 0.8 - this.ledTime * 2));
                } else if (this.ledPattern === 1) {
                    // Horizontal waves
                    brightness = 0.3 + 0.7 * Math.abs(Math.sin(panel.centerY * 1.2 + this.ledTime * 3));
                } else if (this.ledPattern === 2) {
                    // Vertical waves
                    brightness = 0.3 + 0.7 * Math.abs(Math.sin(panel.centerX * 1.2 + this.ledTime * 3));
                } else {
                    // Checkerboard pulse
                    const checker = ((panel.row + panel.col) % 2) * 2 - 1;
                    brightness = 0.5 + 0.5 * Math.sin(this.ledTime * 2 + checker * Math.PI);
                }
                
                panel.material.emissiveColor = ledColor.scale(brightness);
            });
        }
        
        // Update strobes with realistic flash sequences
        if (this.strobes && this.strobes.length > 0) {
            this.strobes.forEach((strobe, i) => {
                // Handle ongoing flash
                if (strobe.flashDuration > 0) {
                    strobe.flashDuration -= 0.016;
                    // Intense flash with multiple bursts
                    const burstPhase = Math.floor(strobe.flashDuration * 20) % 2;
                    const intensity = burstPhase === 0 ? 15 : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity);
                    strobe.light.intensity = intensity * 50; // Very bright illumination
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        strobe.light.intensity = 0;
                        strobe.nextFlashTime = time + 0.5 + Math.random() * 2;
                    }
                } else {
                    // Check if it's time for next flash
                    if (time >= strobe.nextFlashTime) {
                        strobe.flashDuration = 0.15 + Math.random() * 0.1; // 150-250ms flash
                    }
                }
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
        
        // Use cached colors instead of creating new ones
        const colors = [
            this.cachedColors.red,
            this.cachedColors.green,
            this.cachedColors.blue,
            this.cachedColors.magenta,
            this.cachedColors.yellow,
            this.cachedColors.cyan
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
