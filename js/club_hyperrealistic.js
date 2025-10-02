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
            blurKernelSize: 32  // Reduced for sharper shapes
        });
        this.glowLayer.intensity = 0.8; // Reduced for sharper LED shapes
        
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
        
        // Add disco ball in center of truss
        this.createDiscoBall();
    }
    
    createDiscoBall() {
        // REALISTIC DISCO BALL with actual light reflections
        const discoBall = BABYLON.MeshBuilder.CreateSphere("discoBall", {
            diameter: 1.2,
            segments: 16
        }, this.scene);
        discoBall.position = new BABYLON.Vector3(0, 7.2, -12); // Center of middle truss
        
        // Reflective base sphere (visible mirror surface)
        const discoBallMat = new BABYLON.StandardMaterial("discoBallMat", this.scene);
        discoBallMat.diffuseColor = new BABYLON.Color3(0.4, 0.4, 0.45); // Brighter, more visible
        discoBallMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.9); // Shiny mirror surface
        discoBallMat.specularPower = 64; // Glossy
        discoBall.material = discoBallMat;
        
        // Create mirror facets that will actually cast light spots
        this.discoBallFacets = [];
        const facetCount = 150; // Mirror tiles on ball
        
        for (let i = 0; i < facetCount; i++) {
            // Evenly distribute facets on sphere surface using Fibonacci sphere
            const offset = 2.0 / facetCount;
            const increment = Math.PI * (3.0 - Math.sqrt(5.0));
            const y = ((i * offset) - 1) + (offset / 2);
            const r = Math.sqrt(1 - y * y);
            const phi = ((i + 1) % facetCount) * increment;
            
            const x = Math.cos(phi) * r * 0.6;
            const z = Math.sin(phi) * r * 0.6;
            
            // Create small square mirror facet
            const facet = BABYLON.MeshBuilder.CreatePlane("facet" + i, {
                size: 0.06
            }, this.scene);
            facet.position = new BABYLON.Vector3(x, 7.2 + y * 0.6, -12 + z);
            facet.lookAt(discoBall.position);
            facet.parent = discoBall;
            
            // Bright mirror material (highly reflective)
            const facetMat = new BABYLON.StandardMaterial("facetMat" + i, this.scene);
            facetMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 1.0); // Bright mirror
            facetMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.12); // Slight glow
            facetMat.specularColor = new BABYLON.Color3(1, 1, 1);
            facetMat.specularPower = 128;
            facet.material = facetMat;
            
            // Create a small spotlight for each facet to simulate reflection
            const reflectionSpot = new BABYLON.SpotLight("discoBallReflection" + i,
                facet.getAbsolutePosition(),
                new BABYLON.Vector3(0, 0, 0), // Will be updated in animation
                Math.PI / 16, // Tight beam
                20, // Sharp falloff
                this.scene
            );
            reflectionSpot.diffuse = new BABYLON.Color3(1, 1, 1);
            reflectionSpot.intensity = 0; // Start off, will activate when lit
            reflectionSpot.range = 30;
            
            this.discoBallFacets.push({
                mesh: facet,
                light: reflectionSpot,
                normal: new BABYLON.Vector3(x, y * 0.6, z).normalize()
            });
        }
        
        // Suspension cable
        const suspensionCable = BABYLON.MeshBuilder.CreateCylinder("discoCable", {
            diameter: 0.02,
            height: 0.8
        }, this.scene);
        suspensionCable.position = new BABYLON.Vector3(0, 7.6, -12);
        
        const discoCableMat = new BABYLON.StandardMaterial("discoCableMat", this.scene);
        discoCableMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        discoCableMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        suspensionCable.material = discoCableMat;
        
        // Main spotlight hitting disco ball - ALWAYS ON to create reflections
        const discoSpot = new BABYLON.SpotLight("discoMainSpot",
            new BABYLON.Vector3(3, 9, -10), // From side/above
            new BABYLON.Vector3(-0.25, -1, -0.15).normalize(), // Aimed at ball
            Math.PI / 8, // Focused beam
            8,
            this.scene
        );
        discoSpot.diffuse = new BABYLON.Color3(1, 1, 1); // Bright white
        discoSpot.intensity = 60; // VERY bright to light up mirror ball and create strong reflections
        discoSpot.range = 20;
        
        // Secondary disco spotlight (colored, alternates)
        const discoSpot2 = new BABYLON.SpotLight("discoSpot2",
            new BABYLON.Vector3(-3, 8.5, -14),
            new BABYLON.Vector3(0.25, -1, 0.15).normalize(),
            Math.PI / 7,
            8,
            this.scene
        );
        discoSpot2.diffuse = new BABYLON.Color3(1, 0.2, 0.8); // Pink/magenta
        discoSpot2.intensity = 50; // Bright to create visible reflections
        discoSpot2.range = 20;
        
        // Store for animation
        this.discoBall = discoBall;
        this.discoBallRotation = 0;
        this.discoMainSpot = discoSpot;
        this.discoSpot2 = discoSpot2;
        this.discoSpotToggle = 0; // For alternating spots
    }

    createDJBooth() {
        // Professional DJ platform/riser (lowered for better view)
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 9,
            height: 0.6,
            depth: 5
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.3, -24);
        
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
        frontRail.position = new BABYLON.Vector3(0, 0.9, -21.5);
        frontRail.material = railMat;
        
        // DJ console table (main work surface)
        const djConsole = BABYLON.MeshBuilder.CreateBox("djConsole", {
            width: 6,
            height: 0.35,
            depth: 2.5
        }, this.scene);
        djConsole.position = new BABYLON.Vector3(0, 0.9, -24);
        
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
            leg.position = new BABYLON.Vector3(x, 0.75, -24);
            leg.material = railMat;
        }
        
        // Cable management tray under console
        const cableTray = BABYLON.MeshBuilder.CreateBox("cableTray", {
            width: 5.5,
            height: 0.1,
            depth: 2
        }, this.scene);
        cableTray.position = new BABYLON.Vector3(0, 0.65, -24);
        const trayMat = new BABYLON.StandardMaterial("trayMat", this.scene);
        trayMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        cableTray.material = trayMat;
        
        // CDJ Decks
        this.createCDJs();
        
        // DJ mixer
        this.createMixer();
        
        // Monitor speakers
        this.createMonitorSpeakers();
        
        // Laptop stand
        this.createLaptopStand();
        
        // VJ station (right side of booth)
        this.createVJStation();
        
        // DJ booth laser (front-facing floor sweeper)
        this.createDJBoothLaser();
        
        // Accent lighting under platform
        this.createBoothLighting();
        
    }

    createCDJs() {
        const cdjMat = new BABYLON.PBRMetallicRoughnessMaterial("cdjMat", this.scene);
        cdjMat.baseColor = new BABYLON.Color3(0.12, 0.12, 0.15);
        cdjMat.metallic = 0.8;
        cdjMat.roughness = 0.3;
        
        // Left CDJ (lowered)
        const leftCDJ = BABYLON.MeshBuilder.CreateBox("leftCDJ", {
            width: 1.3,
            height: 0.12,
            depth: 1.3
        }, this.scene);
        leftCDJ.position = new BABYLON.Vector3(-1.6, 1.12, -24);
        leftCDJ.material = cdjMat;
        
        // Right CDJ (lowered)
        const rightCDJ = BABYLON.MeshBuilder.CreateBox("rightCDJ", {
            width: 1.3,
            height: 0.12,
            depth: 1.3
        }, this.scene);
        rightCDJ.position = new BABYLON.Vector3(1.6, 1.12, -24);
        rightCDJ.material = cdjMat;
        
        // Jog wheels (glowing)
        const jogMat = new BABYLON.StandardMaterial("jogMat", this.scene);
        jogMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0.3);
        jogMat.disableLighting = true;
        
        const leftJog = BABYLON.MeshBuilder.CreateCylinder("leftJog", {
            diameter: 0.6,
            height: 0.05
        }, this.scene);
        leftJog.position = new BABYLON.Vector3(-1.6, 1.2, -24);
        leftJog.material = jogMat;
        
        const rightJog = BABYLON.MeshBuilder.CreateCylinder("rightJog", {
            diameter: 0.6,
            height: 0.05
        }, this.scene);
        rightJog.position = new BABYLON.Vector3(1.6, 1.2, -24);
        rightJog.material = jogMat.clone("jogMatR");
    }

    createMixer() {
        const mixer = BABYLON.MeshBuilder.CreateBox("mixer", {
            width: 2,
            height: 0.15,
            depth: 1.1
        }, this.scene);
        mixer.position = new BABYLON.Vector3(0, 1.12, -24);
        
        const mixerMat = new BABYLON.PBRMetallicRoughnessMaterial("mixerMat", this.scene);
        mixerMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        mixerMat.metallic = 0.85;
        mixerMat.roughness = 0.25;
        mixer.material = mixerMat;
        
        // Mixer display with text label
        const display = BABYLON.MeshBuilder.CreateBox("mixerDisplay", {
            width: 1.5,
            height: 0.02,
            depth: 0.3
        }, this.scene);
        display.position = new BABYLON.Vector3(0, 1.21, -23.7);
        
        const displayMat = new BABYLON.StandardMaterial("displayMat", this.scene);
        displayMat.emissiveColor = new BABYLON.Color3(0, 1, 0.5);
        displayMat.disableLighting = true;
        display.material = displayMat;
        
        // AUDIO STREAM CONTROL - Label above mixer
        const audioLabel = BABYLON.MeshBuilder.CreatePlane("audioStreamLabel", {
            width: 2.5,
            height: 0.4
        }, this.scene);
        audioLabel.position = new BABYLON.Vector3(0, 1.5, -23.3);
        audioLabel.rotation.x = -0.3;
        
        const audioLabelMat = new BABYLON.StandardMaterial("audioLabelMat", this.scene);
        audioLabelMat.emissiveColor = new BABYLON.Color3(1, 0.8, 0); // Bright yellow/orange
        audioLabelMat.disableLighting = true;
        audioLabel.material = audioLabelMat;
        
        // "STREAM" indicator lights on mixer
        for (let i = 0; i < 3; i++) {
            const indicator = BABYLON.MeshBuilder.CreateSphere("streamIndicator" + i, {
                diameter: 0.08
            }, this.scene);
            indicator.position = new BABYLON.Vector3(-0.6 + i * 0.3, 1.23, -23.4);
            
            const indicatorMat = new BABYLON.StandardMaterial("indicatorMat" + i, this.scene);
            indicatorMat.emissiveColor = new BABYLON.Color3(0, 1, 0); // Green = active
            indicatorMat.disableLighting = true;
            indicator.material = indicatorMat;
        }
    }

    createMonitorSpeakers() {
        const speakerMat = new BABYLON.PBRMetallicRoughnessMaterial("monitorSpeakerMat", this.scene);
        speakerMat.baseColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        speakerMat.metallic = 0.2;
        speakerMat.roughness = 0.8;
        
        // Left monitor (lowered)
        const leftMonitor = BABYLON.MeshBuilder.CreateBox("leftMonitor", {
            width: 0.5,
            height: 0.7,
            depth: 0.45
        }, this.scene);
        leftMonitor.position = new BABYLON.Vector3(-3, 0.95, -24);
        leftMonitor.material = speakerMat;
        
        // Right monitor (lowered)
        const rightMonitor = BABYLON.MeshBuilder.CreateBox("rightMonitor", {
            width: 0.5,
            height: 0.7,
            depth: 0.45
        }, this.scene);
        rightMonitor.position = new BABYLON.Vector3(3, 0.95, -24);
        rightMonitor.material = speakerMat;
    }
    
    createLaptopStand() {
        // Laptop stand/shelf (lowered)
        const laptopStand = BABYLON.MeshBuilder.CreateBox("laptopStand", {
            width: 1.5,
            height: 0.05,
            depth: 1.0
        }, this.scene);
        laptopStand.position = new BABYLON.Vector3(-3, 1.1, -24.5);
        
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
        laptop.position = new BABYLON.Vector3(-3, 1.38, -24.7);
        laptop.rotation.x = -0.3;
        
        const screenMat = new BABYLON.StandardMaterial("screenMat", this.scene);
        screenMat.emissiveColor = new BABYLON.Color3(0.2, 0.3, 0.8);
        screenMat.disableLighting = true;
        laptop.material = screenMat;
    }
    
    createVJStation() {
        // VJ control station on right side of booth
        const vjTable = BABYLON.MeshBuilder.CreateBox("vjTable", {
            width: 2.5,
            height: 0.15,
            depth: 1.8
        }, this.scene);
        vjTable.position = new BABYLON.Vector3(3.5, 1.05, -24);
        
        const vjTableMat = new BABYLON.PBRMetallicRoughnessMaterial("vjTableMat", this.scene);
        vjTableMat.baseColor = new BABYLON.Color3(0.08, 0.08, 0.1);
        vjTableMat.metallic = 0.85;
        vjTableMat.roughness = 0.25;
        vjTable.material = vjTableMat;
        
        // Main VJ screen/monitor (larger for visuals)
        const vjScreen = BABYLON.MeshBuilder.CreateBox("vjScreen", {
            width: 2.0,
            height: 1.2,
            depth: 0.05
        }, this.scene);
        vjScreen.position = new BABYLON.Vector3(3.5, 1.8, -24.8);
        vjScreen.rotation.x = -0.15;
        
        const vjScreenMat = new BABYLON.StandardMaterial("vjScreenMat", this.scene);
        vjScreenMat.emissiveColor = new BABYLON.Color3(0.6, 0.2, 0.8); // Purple/magenta glow
        vjScreenMat.disableLighting = true;
        vjScreen.material = vjScreenMat;
        
        // VJ controller/pad (like MIDI controller)
        const vjController = BABYLON.MeshBuilder.CreateBox("vjController", {
            width: 1.5,
            height: 0.08,
            depth: 1.2
        }, this.scene);
        vjController.position = new BABYLON.Vector3(3.5, 1.14, -24);
        
        const controllerMat = new BABYLON.PBRMetallicRoughnessMaterial("vjControllerMat", this.scene);
        controllerMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.18);
        controllerMat.metallic = 0.7;
        controllerMat.roughness = 0.4;
        vjController.material = controllerMat;
        
        // Controller buttons (grid of illuminated pads)
        const buttonMat = new BABYLON.StandardMaterial("vjButtonMat", this.scene);
        buttonMat.emissiveColor = new BABYLON.Color3(0.8, 0.4, 0);
        buttonMat.disableLighting = true;
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 4; col++) {
                const button = BABYLON.MeshBuilder.CreateBox("vjButton" + row + col, {
                    width: 0.2,
                    height: 0.02,
                    depth: 0.2
                }, this.scene);
                button.position = new BABYLON.Vector3(
                    3.5 - 0.5 + col * 0.35,
                    1.19,
                    -24 - 0.3 + row * 0.35
                );
                button.material = buttonMat.clone("vjButtonMat" + row + col);
                
                // Randomize button colors
                const randomColor = Math.random();
                if (randomColor < 0.33) {
                    button.material.emissiveColor = new BABYLON.Color3(1, 0, 0.2); // Red
                } else if (randomColor < 0.66) {
                    button.material.emissiveColor = new BABYLON.Color3(0, 1, 0.5); // Green
                } else {
                    button.material.emissiveColor = new BABYLON.Color3(0.2, 0.5, 1); // Blue
                }
            }
        }
        
        // LIGHTING CONTROL PANEL - Clear labels
        const lightingPanel = BABYLON.MeshBuilder.CreateBox("lightingControlPanel", {
            width: 1.2,
            height: 0.5,
            depth: 0.15
        }, this.scene);
        lightingPanel.position = new BABYLON.Vector3(3.5, 1.5, -23.2);
        lightingPanel.rotation.x = -0.25;
        
        const lightPanelMat = new BABYLON.StandardMaterial("lightPanelMat", this.scene);
        lightPanelMat.diffuseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        lightPanelMat.emissiveColor = new BABYLON.Color3(0.8, 0.3, 0); // Orange glow
        lightingPanel.material = lightPanelMat;
        
        // LIGHTING CONTROL - Big indicator
        const lightControlLabel = BABYLON.MeshBuilder.CreatePlane("lightingLabel", {
            width: 2.0,
            height: 0.4
        }, this.scene);
        lightControlLabel.position = new BABYLON.Vector3(3.5, 1.9, -23.0);
        lightControlLabel.rotation.x = -0.25;
        
        const lightLabelMat = new BABYLON.StandardMaterial("lightLabelMat", this.scene);
        lightLabelMat.emissiveColor = new BABYLON.Color3(1, 0.5, 0); // Bright orange
        lightLabelMat.disableLighting = true;
        lightControlLabel.material = lightLabelMat;
        
        // Lighting mode indicator lights
        const modes = ['SPOTS', 'LASERS', 'STROBE', 'LED'];
        for (let i = 0; i < 4; i++) {
            const modeLED = BABYLON.MeshBuilder.CreateSphere("modeLight" + i, {
                diameter: 0.1
            }, this.scene);
            modeLED.position = new BABYLON.Vector3(3.2 + i * 0.2, 1.6, -23.15);
            
            const modeMat = new BABYLON.StandardMaterial("modeMat" + i, this.scene);
            modeMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red when active
            modeMat.disableLighting = true;
            modeLED.material = modeMat;
        }
        
        // Smoke machine control panel
        const smokePanel = BABYLON.MeshBuilder.CreateBox("smokePanel", {
            width: 0.8,
            height: 0.3,
            depth: 0.15
        }, this.scene);
        smokePanel.position = new BABYLON.Vector3(3.5, 1.2, -23.2);
        smokePanel.rotation.x = -0.3;
        
        const smokePanelMat = new BABYLON.StandardMaterial("smokePanelMat", this.scene);
        smokePanelMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        smokePanelMat.emissiveColor = new BABYLON.Color3(0, 0.5, 0); // Bright green
        smokePanel.material = smokePanelMat;
    }
    
    createDJBoothLaser() {
        // DRAMATIC LASER BLANKET - mounted ABOVE DJ on LED wall
        // Creates horizontal sweeping "blanket" of light that moves up/down
        const laserHousing = BABYLON.MeshBuilder.CreateBox("djLaserHousing", {
            width: 2.0,  // Wider housing for more beams
            height: 0.25,
            depth: 0.3
        }, this.scene);
        laserHousing.position = new BABYLON.Vector3(0, 7.0, -25.5); // Above DJ, on LED wall
        laserHousing.rotation.x = Math.PI / 18; // Slight downward tilt
        
        const housingMat = new BABYLON.PBRMetallicRoughnessMaterial("djLaserHousingMat", this.scene);
        housingMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        housingMat.metallic = 0.9;
        housingMat.roughness = 0.2;
        housingMat.emissiveColor = new BABYLON.Color3(0.3, 0, 0);
        laserHousing.material = housingMat;
        
        // Laser curtain effect removed (was broken)
        
        this.djLaserHousing = laserHousing;
        this.djLaserHousingMat = housingMat;
        
        // Special mode tracking for dramatic effects
        this.discoBallShowActive = false;
        this.discoBallShowNextShow = 30; // First disco show after 30s
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
        
        // BIGGER LED WALL - covers entire wall behind DJ booth
        const panelWidth = 1.2;
        const panelHeight = 1.2;
        const cols = 10;  // Increased from 6 to 10
        const rows = 6;   // Increased from 4 to 6
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
                const y = (row * panelHeight) + (panelHeight / 2) + 1.5; // Lower starting position
                const z = -26; // Behind DJ booth
                
                panel.position = new BABYLON.Vector3(x, y, z);
                panel.rotation.y = Math.PI; // Rotate 180° to face dance floor
                
                // VERY LOW BASE BRIGHTNESS - so blackout patterns are clearly visible
                const panelMat = new BABYLON.StandardMaterial("ledMat_" + row + "_" + col, this.scene);
                panelMat.emissiveColor = new BABYLON.Color3(0.1, 0, 0); // MUCH dimmer for contrast
                panelMat.disableLighting = true;
                panel.material = panelMat;
                
                // Remove most backlights - only minimal ambient
                if (row === 3 && col === 5) {
                    const backLight = new BABYLON.PointLight("ledBack_" + row + "_" + col,
                        new BABYLON.Vector3(x, y, z - 0.5), this.scene);
                    backLight.diffuse = new BABYLON.Color3(0.5, 0, 0);
                    backLight.intensity = 0.5; // Very subtle
                    backLight.range = 3;
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
        
        // Lights and lasers control - BOTH ALWAYS ACTIVE for continuous show
        this.lightsActive = true;
        this.lasersActive = true; // Changed to true - always active
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
        
        // Get audio data for reactive lighting
        const audioData = this.getAudioData();
        
        // Check if any special effect is active
        const specialEffectActive = this.discoBallShowActive;
        
        // Update LED wall (with audio reactivity) - OFF during special effects
        if (this.ledPanels && !specialEffectActive) {
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && specialEffectActive) {
            // Turn off LED wall during special effects
            this.ledPanels.forEach(panel => {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            });
        }
        
        // Rotate disco ball and update reflections
        if (this.discoBall && this.discoBallFacets) {
            this.discoBallRotation += 0.003; // Slow rotation (18 seconds per rotation)
            this.discoBall.rotation.y = this.discoBallRotation;
            
            // Disco ball spotlights ALWAYS ON to create reflections around the room
            // Alternate between main spot and colored spot (every 8 seconds)
            if (Math.floor(time) % 8 === 0 && Math.floor(time) !== this.discoSpotToggle) {
                this.discoSpotToggle = Math.floor(time);
                // Toggle between main spot and colored spot
                if (this.discoMainSpot.intensity > 0) {
                    this.discoMainSpot.intensity = 60;
                    this.discoSpot2.intensity = 0;
                } else {
                    this.discoMainSpot.intensity = 0;
                    this.discoSpot2.intensity = 50;
                }
            }
            
            // During special show, increase intensity even more
            if (this.discoBallShowActive) {
                if (this.discoMainSpot.intensity > 0) {
                    this.discoMainSpot.intensity = 100;
                } else {
                    this.discoSpot2.intensity = 80;
                }
            }
            
            // Update reflection spots from disco ball facets (always active now)
            if (true) {
                const lightSource = this.discoMainSpot.intensity > 0 ? 
                    this.discoMainSpot.position : this.discoSpot2.position;
                const ballCenter = this.discoBall.position;
            
            // Only update subset of facets each frame for performance
            const facetsToUpdate = 30; // Update 30 facets per frame
            const startIdx = Math.floor(time * 50) % this.discoBallFacets.length;
            
            for (let i = 0; i < facetsToUpdate; i++) {
                const idx = (startIdx + i) % this.discoBallFacets.length;
                const facet = this.discoBallFacets[idx];
                
                // Get facet world position and normal (rotated with ball)
                const facetPos = facet.mesh.getAbsolutePosition();
                const rotatedNormal = BABYLON.Vector3.TransformNormal(
                    facet.normal, 
                    this.discoBall.getWorldMatrix()
                );
                
                // Calculate if this facet is facing the light source
                const toLight = lightSource.subtract(facetPos).normalize();
                const facingLight = BABYLON.Vector3.Dot(rotatedNormal, toLight);
                
                if (facingLight > 0.3) { // Facet is facing light
                    // Calculate reflection direction (perfect mirror reflection)
                    const reflectionDir = toLight.subtract(
                        rotatedNormal.scale(2 * BABYLON.Vector3.Dot(toLight, rotatedNormal))
                    ).normalize();
                    
                    // Cast reflection ray into scene
                    facet.light.position = facetPos;
                    facet.light.direction = reflectionDir;
                    facet.light.intensity = facingLight * 2; // Intensity based on angle
                    
                    // Color from main spotlight
                    const activeSpot = this.discoMainSpot.intensity > 0 ? this.discoMainSpot : this.discoSpot2;
                    facet.light.diffuse = activeSpot.diffuse.clone();
                } else {
                    facet.light.intensity = 0; // Facet not facing light
                }
            }
            } else {
                // Turn off all facet reflections when not in show mode
                this.discoBallFacets.forEach(facet => {
                    facet.light.intensity = 0;
                });
            }
        }
        
        // DISCO BALL SHOW MODE - activates every 45-75 seconds for 20 seconds
        if (time > this.discoBallShowNextShow && !this.discoBallShowActive) {
            this.discoBallShowActive = true;
            this.discoBallShowStartTime = time;
            this.discoBallShowNextShow = time + 45 + Math.random() * 30; // Next show in 45-75s
            
            // BLACKOUT all other lights for dramatic effect
            if (this.spotlights) {
                this.spotlights.forEach(spot => spot.light.intensity = 0);
            }
            if (this.lasers) {
                this.lasers.forEach(laser => {
                    laser.lights.forEach(light => light.intensity = 0);
                    laser.beams.forEach(beam => {
                        beam.mesh.visibility = 0;
                        beam.material.alpha = 0;
                    });
                });
            }
        }
        
        // End disco ball show after 20 seconds
        if (this.discoBallShowActive && (time - this.discoBallShowStartTime > 20)) {
            this.discoBallShowActive = false;
        }
        
        // Keep both lights and lasers always active (removed alternating behavior)
        // Both spotlights and lasers run continuously for a fuller club experience
        // Only turn off during special effects (disco ball or laser curtain shows)
        
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
        // Turn off during special effects
        if (this.lasers && this.lasersActive && !specialEffectActive) {
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
        
        // Update spotlights with synchronized movement patterns (AUDIO REACTIVE)
        // Turn off during special effects
        if (this.spotlights && this.lightsActive && !specialEffectActive) {
            // Choose pattern based on lighting mode
            let globalPhase = time * 0.5;
            
            // Audio reactivity - make movement speed react to bass
            const audioSpeedMultiplier = 1 + (audioData.bass * 2);
            
            this.spotlights.forEach((spot, i) => {
                let dirX, dirZ;
                
                if (this.lightingMode === 'synchronized') {
                    // All lights do same pattern
                    dirX = Math.sin(globalPhase * audioSpeedMultiplier) * 0.8;
                    dirZ = Math.cos(globalPhase * audioSpeedMultiplier) * 0.8;
                } else {
                    // Individual patterns
                    spot.phase += 0.016 * spot.speed * audioSpeedMultiplier;
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
                
                // AUDIO REACTIVE intensity - pulses with music
                const baseIntensity = 6;
                const audioPulse = audioData.average * 8; // React to overall volume
                const timePulse = Math.sin(time * 3) * 2;
                spot.light.intensity = this.lightsActive ? (baseIntensity + audioPulse + timePulse) : 0;
            });
        } else if (this.spotlights) {
            // Turn off spotlights when not active
            this.spotlights.forEach(spot => {
                spot.light.intensity = 0;
            });
        }
        
        // Laser curtain show removed (was broken)
        
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
        
        // LED wall is now updated via this.updateLEDWall(time, audioData) which is called separately
        // with the new 26-pattern system including creative blackout shapes
        if (this.ledPanels && this.ledPanels.length > 0) {
            this.ledTime += 0.016;
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

    updateLEDWall(time, audioData) {
        const patterns = [
            // Smooth patterns
            this.patternWaveHorizontal,
            this.patternWaveVertical,
            this.patternRipple,
            this.patternBreathing,
            // BLACKOUT SHAPE PATTERNS (creative geometric forms)
            this.patternOuterBox,          // Frame with black center
            this.patternInnerBox,          // Small box, black surround
            this.patternXShape,            // Big X, rest black
            this.patternPlusSign,          // Plus/cross shape
            this.patternCorners,           // 4 corner blocks
            this.patternArrowUp,           // Arrow pointing up
            this.patternArrowDown,         // Arrow pointing down
            this.patternDiamond,           // Diamond outline
            this.patternLetterH,           // Letter H
            this.patternZigZag,            // Zig-zag pattern
            // Animated blackout patterns
            this.patternCheckerboard,      // Checker with black squares
            this.patternScanLines,         // Single row lit, rest black
            this.patternDiagonalWipe,      // Clean division
            this.patternExpandingBox,      // Animated box outline
            this.patternSpiral,            // Spiral with blackout
            this.patternVerticalSplit,     // Left/right division
            this.patternHorizontalSplit,   // Top/bottom division
            this.patternRandomFlicker,     // Random on/off
            this.patternChase,             // Perimeter chase
            this.patternPulsingRings,      // Rings with blackout
            this.patternStarburst          // Rays with blackout
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
        
        // AUDIO REACTIVE: Quick pattern changes for club energy
        const patternSpeed = audioData.average > 0.6 ? 1 : 1.5; // 1s when energetic, 1.5s when calm - FASTER for club atmosphere
        
        if (Math.floor(time * 2) % 6 === 0 && Math.floor(time * 2) !== this.lastColorChange) { // Change color every 3 seconds
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.lastColorChange = Math.floor(time * 2);
        }
        
        if (Math.floor(time * 2) % (patternSpeed * 2) === 0 && Math.floor(time * 2) !== this.lastPatternChange) {
            this.ledPattern = (this.ledPattern + 1) % patterns.length;
            this.lastPatternChange = Math.floor(time * 2);
        }
        
        patterns[this.ledPattern].call(this, colors[this.ledColorIndex], time, audioData);
    }

    patternWaveHorizontal(color, time, audioData) {
        // AUDIO REACTIVE: Speed increases with bass
        const speed = 3 + (audioData ? audioData.bass * 3 : 0);
        this.ledPanels.forEach(panel => {
            // Reduced range for better contrast: 0.1 to 0.5
            const brightness = 0.1 + 0.4 * Math.sin(panel.col * 0.8 + this.ledTime * speed);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternWaveVertical(color, time, audioData) {
        // AUDIO REACTIVE: Speed increases with bass
        const speed = 3 + (audioData ? audioData.bass * 3 : 0);
        this.ledPanels.forEach(panel => {
            // Reduced range for better contrast: 0.1 to 0.5
            const brightness = 0.1 + 0.4 * Math.sin(panel.row * 0.8 + this.ledTime * speed);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternCheckerboard(color, time, audioData) {
        // AUDIO REACTIVE: Flicker speed increases with mid frequencies
        const speed = 2 + (audioData ? audioData.mid * 4 : 0);
        this.ledPanels.forEach(panel => {
            const checker = (panel.row + panel.col + Math.floor(this.ledTime * speed)) % 2;
            const brightness = checker ? 1.0 : 0;
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternScanLines(color, time, audioData) {
        // AUDIO REACTIVE: Scan speed increases with treble (updated for 6 rows)
        const speed = 2 + (audioData ? audioData.treble * 6 : 0);
        this.ledPanels.forEach(panel => {
            const scanLine = Math.floor(this.ledTime * speed) % 6;
            const brightness = panel.row === scanLine ? 1.0 : 0;
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternRipple(color, time, audioData) {
        // AUDIO REACTIVE: Ripple emanates from center with bass hits (centered on 10x6 grid)
        const centerX = 4.5;
        const centerY = 2.5;
        const speed = 2 + (audioData ? audioData.bass * 4 : 0);
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            // Reduced range for better contrast: 0.1 to 0.5
            const brightness = 0.1 + 0.4 * Math.sin(dist - this.ledTime * speed);
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    patternBreathing(color, time, audioData) {
        // AUDIO REACTIVE: Breathe with overall music volume
        // Reduced range for better contrast: 0.1 to 0.5
        const baseBrightness = 0.1 + 0.4 * Math.sin(this.ledTime);
        const audioBrightness = audioData ? audioData.average * 0.2 : 0;
        const brightness = Math.min(0.6, baseBrightness + audioBrightness);
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor = color.scale(brightness);
        });
    }

    // CREATIVE BLACKOUT PATTERNS - shapes formed by blacked out panels (10x6 grid)
    
    patternOuterBox(color, time, audioData) {
        // OUTER FRAME lit, center completely BLACK
        this.ledPanels.forEach(panel => {
            const isEdge = panel.row === 0 || panel.row === 5 || panel.col === 0 || panel.col === 9;
            const brightness = isEdge ? 1.0 : 0;
            // Force black for center
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternInnerBox(color, time, audioData) {
        // SMALL BOX in center lit, everything else BLACK
        this.ledPanels.forEach(panel => {
            const isInner = panel.row >= 2 && panel.row <= 3 && panel.col >= 3 && panel.col <= 6;
            const brightness = isInner ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternXShape(color, time, audioData) {
        // BIG X pattern, rest BLACK
        this.ledPanels.forEach(panel => {
            const isDiagonal1 = Math.abs(panel.row - panel.col * 0.6) < 0.7;
            const isDiagonal2 = Math.abs(panel.row - (5 - panel.col * 0.6)) < 0.7;
            const brightness = (isDiagonal1 || isDiagonal2) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternPlusSign(color, time, audioData) {
        // PLUS/CROSS shape, rest BLACK
        this.ledPanels.forEach(panel => {
            const isMiddleRow = panel.row === 2 || panel.row === 3;
            const isMiddleCol = panel.col === 4 || panel.col === 5;
            const brightness = (isMiddleRow || isMiddleCol) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternCorners(color, time, audioData) {
        // 4 CORNER BLOCKS (2x2 each), rest BLACK
        this.ledPanels.forEach(panel => {
            const isTopLeft = panel.row <= 1 && panel.col <= 1;
            const isTopRight = panel.row <= 1 && panel.col >= 8;
            const isBottomLeft = panel.row >= 4 && panel.col <= 1;
            const isBottomRight = panel.row >= 4 && panel.col >= 8;
            const brightness = (isTopLeft || isTopRight || isBottomLeft || isBottomRight) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternDiagonalWipe(color, time, audioData) {
        // Animated diagonal wipe - clear blackout division
        const wipePos = (Math.sin(this.ledTime) + 1) * 7;
        this.ledPanels.forEach(panel => {
            const diagonalPos = panel.col + panel.row * 1.5;
            const brightness = (diagonalPos < wipePos) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }
    
    patternArrowUp(color, time, audioData) {
        // ARROW POINTING UP, rest BLACK
        this.ledPanels.forEach(panel => {
            // Arrow tip (top center)
            const isTip = panel.row === 0 && (panel.col === 4 || panel.col === 5);
            // Arrow sides expanding down
            const isLeftSide = panel.row === 1 && (panel.col === 3 || panel.col === 4);
            const isRightSide = panel.row === 1 && (panel.col === 5 || panel.col === 6);
            const isLeftWing = panel.row === 2 && (panel.col === 2 || panel.col === 3);
            const isRightWing = panel.row === 2 && (panel.col === 6 || panel.col === 7);
            // Arrow shaft
            const isShaft = (panel.row >= 3) && (panel.col === 4 || panel.col === 5);
            
            const brightness = (isTip || isLeftSide || isRightSide || isLeftWing || isRightWing || isShaft) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }
    
    patternArrowDown(color, time, audioData) {
        // ARROW POINTING DOWN, rest BLACK
        this.ledPanels.forEach(panel => {
            // Arrow shaft (top)
            const isShaft = (panel.row <= 2) && (panel.col === 4 || panel.col === 5);
            // Arrow sides
            const isLeftWing = panel.row === 3 && (panel.col === 2 || panel.col === 3);
            const isRightWing = panel.row === 3 && (panel.col === 6 || panel.col === 7);
            const isLeftSide = panel.row === 4 && (panel.col === 3 || panel.col === 4);
            const isRightSide = panel.row === 4 && (panel.col === 5 || panel.col === 6);
            // Arrow tip (bottom)
            const isTip = panel.row === 5 && (panel.col === 4 || panel.col === 5);
            
            const brightness = (isShaft || isLeftWing || isRightWing || isLeftSide || isRightSide || isTip) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }
    
    patternDiamond(color, time, audioData) {
        // DIAMOND shape, rest BLACK
        this.ledPanels.forEach(panel => {
            const centerX = 4.5;
            const centerY = 2.5;
            const manhattanDist = Math.abs(panel.col - centerX) + Math.abs(panel.row - centerY);
            const brightness = (manhattanDist <= 4 && manhattanDist >= 3) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }
    
    patternLetterH(color, time, audioData) {
        // Letter H shape, rest BLACK
        this.ledPanels.forEach(panel => {
            const isLeftBar = panel.col === 2;
            const isRightBar = panel.col === 7;
            const isMiddleBar = panel.row === 3 && (panel.col >= 2 && panel.col <= 7);
            const brightness = (isLeftBar || isRightBar || isMiddleBar) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }
    
    patternZigZag(color, time, audioData) {
        // ZIG-ZAG pattern, rest BLACK
        this.ledPanels.forEach(panel => {
            const isZig = (panel.row === 1 || panel.row === 4) && (panel.col === 1 || panel.col === 4 || panel.col === 7);
            const isZag = (panel.row === 2 || panel.row === 3) && (panel.col === 2 || panel.col === 5 || panel.col === 8);
            const isBorder = (panel.row === 0 || panel.row === 5) && (panel.col === 0 || panel.col === 3 || panel.col === 6 || panel.col === 9);
            const brightness = (isZig || isZag || isBorder) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternExpandingBox(color, time, audioData) {
        // Box that expands and contracts from center - TRUE BLACKOUT
        const size = Math.abs(Math.sin(this.ledTime * 0.5)) * 5;
        const centerRow = 2.5;
        const centerCol = 4.5;
        
        this.ledPanels.forEach(panel => {
            const distFromCenter = Math.max(
                Math.abs(panel.row - centerRow),
                Math.abs(panel.col - centerCol)
            );
            const isInBox = distFromCenter < size && distFromCenter > size - 1;
            const brightness = isInBox ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternSpiral(color, time, audioData) {
        // Spiral pattern from center - TRUE BLACKOUT
        const centerRow = 2.5;
        const centerCol = 4.5;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerCol;
            const dy = panel.row - centerRow;
            const angle = Math.atan2(dy, dx);
            const dist = Math.sqrt(dx * dx + dy * dy);
            const spiralValue = angle + dist - this.ledTime * 2;
            const brightness = (Math.sin(spiralValue) > 0) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternVerticalSplit(color, time, audioData) {
        // Vertical split that moves - CLEAR DIVISION with blackout
        const splitPos = Math.floor((Math.sin(this.ledTime) + 1) * 5);
        this.ledPanels.forEach(panel => {
            const brightness = (panel.col < splitPos) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternHorizontalSplit(color, time, audioData) {
        // Horizontal split that moves - CLEAR DIVISION with blackout
        const splitPos = Math.floor((Math.sin(this.ledTime) + 1) * 3);
        this.ledPanels.forEach(panel => {
            const brightness = (panel.row < splitPos) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternRandomFlicker(color, time, audioData) {
        // Random panels flicker on/off - TRUE BLACKOUT
        const flickerSpeed = Math.floor(this.ledTime * 5);
        this.ledPanels.forEach(panel => {
            const random = Math.sin(panel.row * 12.9898 + panel.col * 78.233 + flickerSpeed) * 43758.5453;
            const brightness = (random - Math.floor(random) > 0.5) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternChase(color, time, audioData) {
        // Chase lights around perimeter - TRUE BLACKOUT for non-active
        const chasePos = Math.floor(this.ledTime * 3) % 32;
        const perimeter = [
            // Top row (left to right)
            [0,0], [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [0,8], [0,9],
            // Right column (top to bottom)
            [1,9], [2,9], [3,9], [4,9], [5,9],
            // Bottom row (right to left)
            [5,8], [5,7], [5,6], [5,5], [5,4], [5,3], [5,2], [5,1], [5,0],
            // Left column (bottom to top)
            [4,0], [3,0], [2,0], [1,0]
        ];
        
        this.ledPanels.forEach(panel => {
            let brightness = 0;
            for (let i = 0; i < 3; i++) {
                const idx = (chasePos + i) % perimeter.length;
                if (perimeter[idx][0] === panel.row && perimeter[idx][1] === panel.col) {
                    brightness = 1.0 - i * 0.3;
                }
            }
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternPulsingRings(color, time, audioData) {
        // Concentric rings pulsing from center - TRUE BLACKOUT between rings
        const centerRow = 2.5;
        const centerCol = 4.5;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(
                Math.pow(panel.row - centerRow, 2) + 
                Math.pow((panel.col - centerCol) * 0.6, 2)
            );
            const ringValue = Math.sin(dist * 2 - this.ledTime * 3);
            const brightness = (ringValue > 0.5) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
        });
    }

    patternStarburst(color, time, audioData) {
        // Starburst/rays from center - TRUE BLACKOUT between rays
        const centerRow = 2.5;
        const centerCol = 4.5;
        const numRays = 8;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerCol;
            const dy = panel.row - centerRow;
            const angle = Math.atan2(dy, dx) + this.ledTime;
            const rayIndex = Math.floor((angle + Math.PI) / (2 * Math.PI) * numRays);
            const brightness = (rayIndex % 2 === 0) ? 1.0 : 0;
            if (brightness === 0) {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            } else {
                panel.material.emissiveColor = color.scale(brightness);
            }
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
            this.audioAnalyser.fftSize = 256;
            this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
            this.audioSource.connect(this.audioAnalyser);
            this.audioAnalyser.connect(this.audioContext.destination);
        }
        
        this.audioElement.src = url;
        this.audioElement.play();
        
        // Show success message
        document.getElementById('musicUrl').style.borderColor = '#00ff00';
        setTimeout(() => {
            document.getElementById('musicUrl').style.borderColor = '';
        }, 2000);
    }
    
    getAudioData() {
        if (!this.audioAnalyser || !this.audioDataArray) {
            return {
                bass: 0,
                mid: 0,
                treble: 0,
                average: 0
            };
        }
        
        this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
        
        // Split frequency data into bass, mid, treble
        const bassEnd = Math.floor(this.audioDataArray.length * 0.1);
        const midEnd = Math.floor(this.audioDataArray.length * 0.5);
        
        let bassSum = 0, midSum = 0, trebleSum = 0;
        
        for (let i = 0; i < bassEnd; i++) {
            bassSum += this.audioDataArray[i];
        }
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += this.audioDataArray[i];
        }
        for (let i = midEnd; i < this.audioDataArray.length; i++) {
            trebleSum += this.audioDataArray[i];
        }
        
        const bass = bassSum / bassEnd / 255;
        const mid = midSum / (midEnd - bassEnd) / 255;
        const treble = trebleSum / (this.audioDataArray.length - midEnd) / 255;
        const average = (bass + mid + treble) / 3;
        
        return { bass, mid, treble, average };
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
