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
        
        // Detect device capabilities for optimal light count
        this.maxLights = this.detectMaxLights();
        console.log(`🎮 Device detected - Max lights per material: ${this.maxLights}`);
        
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

    detectMaxLights() {
        // Detect device type and GPU capabilities
        const ua = navigator.userAgent.toLowerCase();
        const isQuest = ua.includes('quest') || ua.includes('oculus');
        const isMobile = /android|iphone|ipad|mobile/i.test(ua);
        
        // Quest 3/3S has a powerful Snapdragon XR2 Gen 2 GPU
        // Can handle significantly more lights than a laptop
        if (isQuest) {
            console.log('🥽 Quest VR headset detected - using high light count');
            return 24; // Quest 3S can handle more lights
        } else if (isMobile) {
            console.log('📱 Mobile device detected - using moderate light count');
            return 16; // Mobile devices moderate
        } else {
            console.log('💻 Desktop/laptop detected - using conservative light count');
            return 12; // Conservative for laptops/desktops
        }
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
        
        // No fog/smoke for now - removed for clarity
        
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
            blurKernelSize: 16  // Very sharp for crisp LED shapes
        });
        this.glowLayer.intensity = 0.5; // Minimal glow for sharp definition
        
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
        this.createTrussMountedLights();
        
        // VOLUMETRIC FOG SYSTEM - Makes light beams visible!
        this.createVolumetricFog();
        
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
        
        // Store pipeline for fog effects
        this.renderPipeline = pipeline;
    }
    
    createVolumetricFog() {
        // HYPERREALISTIC ATMOSPHERIC FOG - Makes light beams visible!
        
        // Create fog particle systems for volumetric atmosphere
        this.fogSystems = [];
        
        // Main dance floor fog (low-lying, subtle)
        const danceFloorFog = new BABYLON.ParticleSystem("danceFloorFog", 1200, this.scene);
        danceFloorFog.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        danceFloorFog.emitter = new BABYLON.Vector3(0, 0.5, -12); // Low to ground
        danceFloorFog.minEmitBox = new BABYLON.Vector3(-10, 0, -10);
        danceFloorFog.maxEmitBox = new BABYLON.Vector3(10, 0.8, 10);
        
        // Fog appearance - very subtle white/gray mist (REDUCED DENSITY)
        danceFloorFog.color1 = new BABYLON.Color4(0.85, 0.85, 0.92, 0.08); // Reduced from 0.15 to 0.08
        danceFloorFog.color2 = new BABYLON.Color4(0.65, 0.65, 0.75, 0.04); // Reduced from 0.08 to 0.04
        danceFloorFog.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0);
        
        // Varied particle sizes for realism
        danceFloorFog.minSize = 1.5;
        danceFloorFog.maxSize = 6.0; // More size variation
        danceFloorFog.minLifeTime = 10;
        danceFloorFog.maxLifeTime = 20;
        danceFloorFog.emitRate = 40; // Reduced from 80 to 40
        
        // More natural, turbulent movement
        danceFloorFog.direction1 = new BABYLON.Vector3(-0.3, 0.08, -0.15);
        danceFloorFog.direction2 = new BABYLON.Vector3(0.3, 0.25, 0.15);
        danceFloorFog.minEmitPower = 0.08;
        danceFloorFog.maxEmitPower = 0.25;
        danceFloorFog.updateSpeed = 0.008; // Slower for more realistic drift
        
        // Add turbulence for realistic swirling
        danceFloorFog.noiseTexture = new BABYLON.NoiseProceduralTexture("fogNoise", 256, this.scene);
        danceFloorFog.noiseStrength = new BABYLON.Vector3(0.5, 0.3, 0.5); // Subtle turbulence
        
        // Blending for realistic fog
        danceFloorFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - Make fog particles receive light from scene
        // This makes spotlights/lasers realistically illuminate the fog
        danceFloorFog.addColorGradient(0, new BABYLON.Color4(0.85, 0.85, 0.92, 0.08));
        danceFloorFog.addColorGradient(0.5, new BABYLON.Color4(0.75, 0.75, 0.85, 0.06));
        danceFloorFog.addColorGradient(1.0, new BABYLON.Color4(0.5, 0.5, 0.6, 0));
        
        danceFloorFog.start();
        this.fogSystems.push(danceFloorFog);
        
        // Upper atmosphere fog (ultra-light, barely visible)
        const upperFog = new BABYLON.ParticleSystem("upperFog", 800, this.scene);
        upperFog.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        upperFog.emitter = new BABYLON.Vector3(0, 5, -12); // Mid-height
        upperFog.minEmitBox = new BABYLON.Vector3(-14, -1.5, -14);
        upperFog.maxEmitBox = new BABYLON.Vector3(14, 1.5, 14);
        
        // Ultra-light, barely visible (REDUCED DENSITY)
        upperFog.color1 = new BABYLON.Color4(0.72, 0.72, 0.8, 0.04); // Reduced from 0.08 to 0.04
        upperFog.color2 = new BABYLON.Color4(0.55, 0.55, 0.65, 0.02); // Reduced from 0.04 to 0.02
        upperFog.colorDead = new BABYLON.Color4(0.4, 0.4, 0.5, 0);
        
        // Large, wispy particles
        upperFog.minSize = 4.0;
        upperFog.maxSize = 12.0; // Very large for atmospheric effect
        upperFog.minLifeTime = 15;
        upperFog.maxLifeTime = 30;
        upperFog.emitRate = 25; // Reduced from 50 to 25
        
        // Very slow, gentle drift
        upperFog.direction1 = new BABYLON.Vector3(-0.4, -0.08, -0.25);
        upperFog.direction2 = new BABYLON.Vector3(0.4, 0.08, 0.25);
        upperFog.minEmitPower = 0.03;
        upperFog.maxEmitPower = 0.15;
        upperFog.updateSpeed = 0.006; // Even slower
        
        // Add turbulence for realistic air currents
        upperFog.noiseTexture = new BABYLON.NoiseProceduralTexture("upperFogNoise", 256, this.scene);
        upperFog.noiseStrength = new BABYLON.Vector3(0.8, 0.4, 0.8); // More turbulence
        
        upperFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - Upper fog catches colored light from spotlights
        upperFog.addColorGradient(0, new BABYLON.Color4(0.72, 0.72, 0.8, 0.04));
        upperFog.addColorGradient(0.5, new BABYLON.Color4(0.62, 0.62, 0.72, 0.03));
        upperFog.addColorGradient(1.0, new BABYLON.Color4(0.4, 0.4, 0.5, 0));
        
        upperFog.start();
        this.fogSystems.push(upperFog);
        
        // DJ Booth fog machine effect (realistic bursts)
        const djFog = new BABYLON.ParticleSystem("djFog", 600, this.scene);
        djFog.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        djFog.emitter = new BABYLON.Vector3(0, 0.8, -24); // DJ booth area, lower
        djFog.minEmitBox = new BABYLON.Vector3(-3.5, 0, -0.5);
        djFog.maxEmitBox = new BABYLON.Vector3(3.5, 0.3, 0.5);
        
        // Moderate fog from machine (REDUCED DENSITY)
        djFog.color1 = new BABYLON.Color4(0.88, 0.88, 0.98, 0.12); // Reduced from 0.2 to 0.12
        djFog.color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.06);   // Reduced from 0.12 to 0.06
        djFog.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0);
        
        // Varied sizes for realistic fog plume
        djFog.minSize = 1.2;
        djFog.maxSize = 5.0; // More variation
        djFog.minLifeTime = 8;
        djFog.maxLifeTime = 16;
        djFog.emitRate = 35; // Reduced from 60 to 35
        
        // Fog spreads forward into crowd with realistic motion
        djFog.direction1 = new BABYLON.Vector3(-1.2, 0.15, 2.5);
        djFog.direction2 = new BABYLON.Vector3(1.2, 0.4, 4.5);
        djFog.minEmitPower = 0.4;
        djFog.maxEmitPower = 1.0;
        djFog.updateSpeed = 0.012;
        
        // Add turbulence for realistic fog machine plume
        djFog.noiseTexture = new BABYLON.NoiseProceduralTexture("djFogNoise", 256, this.scene);
        djFog.noiseStrength = new BABYLON.Vector3(1.0, 0.5, 1.0); // Strong turbulence
        
        // Gravity effect - fog sinks slightly
        djFog.gravity = new BABYLON.Vector3(0, -0.15, 0);
        
        djFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - DJ fog catches colored light beams
        djFog.addColorGradient(0, new BABYLON.Color4(0.88, 0.88, 0.98, 0.12));
        djFog.addColorGradient(0.5, new BABYLON.Color4(0.78, 0.78, 0.88, 0.08));
        djFog.addColorGradient(1.0, new BABYLON.Color4(0.5, 0.5, 0.6, 0));
        
        djFog.start();
        this.fogSystems.push(djFog);
        
        // Scene fog for depth/atmosphere (REDUCED DENSITY)
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = 0.008; // Reduced from 0.015 to 0.008 (nearly half)
        this.scene.fogColor = new BABYLON.Color3(0.08, 0.08, 0.1); // Slightly darker for subtlety
        
        console.log("✅ Created hyperrealistic volumetric fog system (3 particle systems + scene fog)");
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
        floorMat.maxSimultaneousLights = this.maxLights; // Device-specific: Quest=24, Mobile=16, Desktop=12
        
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
        wallMat.maxSimultaneousLights = this.maxLights; // Device-specific: Quest=24, Mobile=16, Desktop=12
        
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
        
        // Add industrial wall details
        this.createIndustrialWallDetails();
    }

    createIndustrialWallDetails() {
        // Create exposed brick sections, pipes, conduits, and graffiti for authentic warehouse feel
        
        // Exposed brick material - old red brick
        const brickMat = new BABYLON.PBRMetallicRoughnessMaterial("brickMat", this.scene);
        brickMat.baseColor = new BABYLON.Color3(0.4, 0.15, 0.1); // Rusty red brick
        brickMat.metallic = 0;
        brickMat.roughness = 1;
        brickMat.maxSimultaneousLights = this.maxLights;
        
        // Concrete pillar material
        const pillarMat = new BABYLON.PBRMetallicRoughnessMaterial("pillarMat", this.scene);
        pillarMat.baseColor = new BABYLON.Color3(0.3, 0.3, 0.32);
        pillarMat.metallic = 0;
        pillarMat.roughness = 0.95;
        pillarMat.maxSimultaneousLights = this.maxLights;
        
        // Metal pipe material
        const pipeMat = new BABYLON.PBRMetallicRoughnessMaterial("pipeMat", this.scene);
        pipeMat.baseColor = new BABYLON.Color3(0.2, 0.2, 0.22);
        pipeMat.metallic = 0.8;
        pipeMat.roughness = 0.6;
        pipeMat.maxSimultaneousLights = this.maxLights;
        
        // Add concrete support pillars along walls
        const pillarPositions = [
            { x: -17, z: -5 }, { x: -17, z: -15 }, { x: -17, z: -25 },
            { x: 17, z: -5 }, { x: 17, z: -15 }, { x: 17, z: -25 }
        ];
        
        pillarPositions.forEach((pos, i) => {
            const pillar = BABYLON.MeshBuilder.CreateBox("pillar" + i, {
                width: 0.6,
                height: 10,
                depth: 0.6
            }, this.scene);
            pillar.position = new BABYLON.Vector3(pos.x, 5, pos.z);
            pillar.material = pillarMat;
            pillar.receiveShadows = true;
        });
        
        // Add exposed brick sections between pillars
        const brickSections = [
            { x: -16.5, z: -10, width: 1, height: 4 },
            { x: -16.5, z: -20, width: 1, height: 3 },
            { x: 16.5, z: -10, width: 1, height: 4 },
            { x: 16.5, z: -20, width: 1, height: 3 }
        ];
        
        brickSections.forEach((section, i) => {
            const brick = BABYLON.MeshBuilder.CreateBox("brick" + i, {
                width: section.width,
                height: section.height,
                depth: 0.3
            }, this.scene);
            brick.position = new BABYLON.Vector3(section.x, 2 + section.height/2, section.z);
            brick.material = brickMat;
            brick.receiveShadows = true;
        });
        
        // Add industrial pipes running along ceiling (near walls)
        const pipeRuns = [
            { start: { x: -16, z: -25 }, end: { x: -16, z: 5 } },  // Left wall
            { start: { x: 16, z: -25 }, end: { x: 16, z: 5 } }     // Right wall
        ];
        
        pipeRuns.forEach((run, i) => {
            const pipeLength = Math.abs(run.end.z - run.start.z);
            const pipe = BABYLON.MeshBuilder.CreateCylinder("pipe" + i, {
                diameter: 0.15,
                height: pipeLength,
                tessellation: 12
            }, this.scene);
            pipe.position = new BABYLON.Vector3(run.start.x, 9.5, (run.start.z + run.end.z) / 2);
            pipe.rotation.x = Math.PI / 2;
            pipe.material = pipeMat;
            
            // Add smaller conduit pipes next to main pipe
            const conduit = BABYLON.MeshBuilder.CreateCylinder("conduit" + i, {
                diameter: 0.08,
                height: pipeLength,
                tessellation: 8
            }, this.scene);
            conduit.position = new BABYLON.Vector3(run.start.x - 0.25, 9.3, (run.start.z + run.end.z) / 2);
            conduit.rotation.x = Math.PI / 2;
            conduit.material = pipeMat;
        });
        
        console.log("✅ Created industrial wall details");
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
        ceilingMat.maxSimultaneousLights = this.maxLights; // Device-specific: Quest=24, Mobile=16, Desktop=12
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
        const truss1 = createTriangularTruss("truss1", 24, new BABYLON.Vector3(0, 8, -8));
        
        // Truss 2 - Middle (center of dance floor)
        const truss2 = createTriangularTruss("truss2", 24, new BABYLON.Vector3(0, 8, -12));
        
        // Truss 3 - Back (near LED wall)
        const truss3 = createTriangularTruss("truss3", 24, new BABYLON.Vector3(0, 8, -16));
        
        // Truss 4 - Extended back (for back spotlights)
        const truss4 = createTriangularTruss("truss4", 24, new BABYLON.Vector3(0, 8, -20));
        
        // Cross beams connecting the trusses - also triangular (extended to cover all spotlights)
        // Store side beams for laser mounting
        this.sideTrusses = {};
        for (let i = -12; i <= 12; i += 4) {
            const crossBeam = createTriangularTruss("crossBeam" + i, 14, new BABYLON.Vector3(i, 8, -14));
            crossBeam.rotation.y = Math.PI / 2;
            if (i === -8 || i === 8) {
                this.sideTrusses[i] = crossBeam; // Store left (-8) and right (8) side trusses
            }
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
        
        // MASSIVE solid speaker material - heavy duty PA system
        const speakerMat = new BABYLON.PBRMetallicRoughnessMaterial("paSpeakerMat", this.scene);
        speakerMat.baseColor = new BABYLON.Color3(0.02, 0.02, 0.02); // Almost black
        speakerMat.metallic = 0.3;
        speakerMat.roughness = 0.8; // Matte black finish
        speakerMat.maxSimultaneousLights = this.maxLights;
        speakerMat.alpha = 1.0; // Completely solid
        speakerMat.backFaceCulling = true;
        
        // MASSIVE speakers positioned to the SIDES (not blocking LED wall)
        // Left PA stack - moved further left
        this.createPAStack(-10, -18, speakerMat);
        
        // Right PA stack - moved further right
        this.createPAStack(10, -18, speakerMat);
        
        console.log("✅ Created MASSIVE solid PA speakers next to DJ booth");
    }

    createPAStack(xPos, zPos, material) {
        // MASSIVE sub-woofer (bottom) - club-style double 18" subs
        const sub = BABYLON.MeshBuilder.CreateBox("sub" + xPos, {
            width: 3.2,
            height: 3.5,
            depth: 3.2
        }, this.scene);
        sub.position = new BABYLON.Vector3(xPos, 1.75, zPos);
        sub.material = material;
        sub.receiveShadows = true;
        sub.checkCollisions = true;
        
        // Large mid-range speaker cabinet
        const mid = BABYLON.MeshBuilder.CreateBox("mid" + xPos, {
            width: 2.5,
            height: 2.5,
            depth: 2.5
        }, this.scene);
        mid.position = new BABYLON.Vector3(xPos, 4.75, zPos);
        mid.material = material;
        mid.receiveShadows = true;
        mid.checkCollisions = true;
        
        // High frequency horn array
        const high = BABYLON.MeshBuilder.CreateBox("high" + xPos, {
            width: 2,
            height: 2,
            depth: 2
        }, this.scene);
        high.position = new BABYLON.Vector3(xPos, 6.75, zPos);
        high.material = material;
        high.receiveShadows = true;
        high.checkCollisions = true;
        
        // Prominent glowing speaker grills with better visibility
        const grillMat = new BABYLON.StandardMaterial("grill" + xPos, this.scene);
        grillMat.emissiveColor = new BABYLON.Color3(0.05, 0.1, 0.15); // Subtle blue glow
        grillMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12); // Dark gray base
        grillMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        grillMat.alpha = 1.0; // Solid
        
        // MASSIVE sub grill - double 18" drivers
        const subGrill = BABYLON.MeshBuilder.CreateBox("subGrill" + xPos, {
            width: 2.6,
            height: 2.8,
            depth: 0.15
        }, this.scene);
        subGrill.position = new BABYLON.Vector3(xPos, 1.75, zPos + 1.65);
        subGrill.material = grillMat.clone("subGrillMat" + xPos);
        
        // Large mid grill
        const midGrill = BABYLON.MeshBuilder.CreateBox("midGrill" + xPos, {
            width: 2,
            height: 2,
            depth: 0.15
        }, this.scene);
        midGrill.position = new BABYLON.Vector3(xPos, 4.75, zPos + 1.3);
        midGrill.material = grillMat.clone("midGrillMat" + xPos);
        
        // High frequency horn grill
        const highGrill = BABYLON.MeshBuilder.CreateBox("highGrill" + xPos, {
            width: 1.5,
            height: 1.5,
            depth: 0.15
        }, this.scene);
        highGrill.position = new BABYLON.Vector3(xPos, 6.75, zPos + 1.05);
        highGrill.material = grillMat.clone("highGrillMat" + xPos);
        
        // Add speaker logo plates (optional detail)
        const logoMat = new BABYLON.StandardMaterial("logo" + xPos, this.scene);
        logoMat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        logoMat.alpha = 1.0;
        
        const logo = BABYLON.MeshBuilder.CreateBox("logo" + xPos, {
            width: 0.8,
            height: 0.3,
            depth: 0.05
        }, this.scene);
        logo.position = new BABYLON.Vector3(xPos, 0.3, zPos + 1.65);
        logo.material = logoMat;
    }

    createBarArea() {
        
        // Bar counter - solid wood
        const bar = BABYLON.MeshBuilder.CreateBox("bar", {
            width: 10,
            height: 1.2,
            depth: 1.5
        }, this.scene);
        bar.position = new BABYLON.Vector3(-10, 0.6, 5);
        
        const barMat = new BABYLON.PBRMetallicRoughnessMaterial("barMat", this.scene);
        barMat.baseColor = new BABYLON.Color3(0.2, 0.12, 0.08); // Dark wood
        barMat.metallic = 0.1;
        barMat.roughness = 0.6;
        barMat.maxSimultaneousLights = this.maxLights;
        bar.material = barMat;
        bar.receiveShadows = true;
        
        // Bar top - polished glossy surface
        const barTop = BABYLON.MeshBuilder.CreateBox("barTop", {
            width: 10.2,
            height: 0.08,
            depth: 1.7
        }, this.scene);
        barTop.position = new BABYLON.Vector3(-10, 1.24, 5);
        
        const topMat = new BABYLON.PBRMetallicRoughnessMaterial("barTopMat", this.scene);
        topMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.08);
        topMat.metallic = 0.95;
        topMat.roughness = 0.05; // Very glossy polished surface
        topMat.maxSimultaneousLights = this.maxLights;
        barTop.material = topMat;
        
        // Back bar wall and shelves with bottles
        this.createBackBar();
        
        // Create bartender character
        this.createBartender();
    }

    createBackBar() {
        // Back bar wall/mirror
        const backWall = BABYLON.MeshBuilder.CreateBox("backBarWall", {
            width: 10,
            height: 3,
            depth: 0.2
        }, this.scene);
        backWall.position = new BABYLON.Vector3(-10, 2.5, 3.8);
        
        const backWallMat = new BABYLON.PBRMetallicRoughnessMaterial("backWallMat", this.scene);
        backWallMat.baseColor = new BABYLON.Color3(0.15, 0.12, 0.1);
        backWallMat.metallic = 0.3;
        backWallMat.roughness = 0.7;
        backWallMat.maxSimultaneousLights = this.maxLights;
        backWall.material = backWallMat;
        
        // Wood shelf material
        const shelfMat = new BABYLON.PBRMetallicRoughnessMaterial("shelfMat", this.scene);
        shelfMat.baseColor = new BABYLON.Color3(0.25, 0.18, 0.12);
        shelfMat.metallic = 0;
        shelfMat.roughness = 0.8;
        shelfMat.maxSimultaneousLights = this.maxLights;
        
        // Create 3 shelves
        for (let i = 0; i < 3; i++) {
            const shelf = BABYLON.MeshBuilder.CreateBox("backShelf" + i, {
                width: 9.5,
                height: 0.08,
                depth: 0.4
            }, this.scene);
            shelf.position = new BABYLON.Vector3(-10, 1.8 + (i * 0.8), 3.9);
            shelf.material = shelfMat;
        }
        
        // Glass material for bottles
        const glassMat = new BABYLON.PBRMetallicRoughnessMaterial("glassMat", this.scene);
        glassMat.baseColor = new BABYLON.Color3(0.9, 0.9, 0.9);
        glassMat.metallic = 0;
        glassMat.roughness = 0.1;
        glassMat.alpha = 0.3;
        glassMat.indexOfRefraction = 1.5;
        glassMat.maxSimultaneousLights = this.maxLights;
        
        // Bottle liquid colors (various spirits)
        const liquidColors = [
            { color: new BABYLON.Color3(0.6, 0.3, 0.1), name: "whiskey" },    // Amber whiskey
            { color: new BABYLON.Color3(0.9, 0.9, 0.85), name: "vodka" },     // Clear vodka
            { color: new BABYLON.Color3(0.2, 0.6, 0.2), name: "absinthe" },   // Green absinthe
            { color: new BABYLON.Color3(0.8, 0.5, 0.2), name: "rum" },        // Golden rum
            { color: new BABYLON.Color3(0.9, 0.2, 0.2), name: "campari" },    // Red campari
            { color: new BABYLON.Color3(0.3, 0.5, 0.8), name: "gin" },        // Blue gin
            { color: new BABYLON.Color3(0.7, 0.4, 0.2), name: "cognac" },     // Cognac
            { color: new BABYLON.Color3(0.95, 0.95, 0.9), name: "tequila" }   // Clear tequila
        ];
        
        // Create multiple bottles on shelves
        let bottleIndex = 0;
        for (let shelf = 0; shelf < 3; shelf++) {
            for (let i = 0; i < 8; i++) {
                const liquidColor = liquidColors[bottleIndex % liquidColors.length];
                
                // Bottle body
                const bottle = BABYLON.MeshBuilder.CreateCylinder("bottle" + bottleIndex, {
                    diameterTop: 0.08,
                    diameterBottom: 0.1,
                    height: 0.45,
                    tessellation: 16
                }, this.scene);
                bottle.position = new BABYLON.Vector3(-14 + (i * 1.15), 1.85 + (shelf * 0.8), 3.9);
                bottle.material = glassMat.clone("glassMat" + bottleIndex);
                
                // Liquid inside bottle
                const liquid = BABYLON.MeshBuilder.CreateCylinder("liquid" + bottleIndex, {
                    diameterTop: 0.07,
                    diameterBottom: 0.09,
                    height: 0.35,
                    tessellation: 16
                }, this.scene);
                liquid.position = new BABYLON.Vector3(-14 + (i * 1.15), 1.8 + (shelf * 0.8), 3.9);
                
                const liquidMat = new BABYLON.StandardMaterial("liquidMat" + bottleIndex, this.scene);
                liquidMat.diffuseColor = liquidColor.color;
                liquidMat.emissiveColor = liquidColor.color.scale(0.2);
                liquidMat.alpha = 0.7;
                liquid.material = liquidMat;
                
                // Bottle cap
                const cap = BABYLON.MeshBuilder.CreateCylinder("cap" + bottleIndex, {
                    diameter: 0.06,
                    height: 0.05,
                    tessellation: 16
                }, this.scene);
                cap.position = new BABYLON.Vector3(-14 + (i * 1.15), 2.1 + (shelf * 0.8), 3.9);
                
                const capMat = new BABYLON.PBRMetallicRoughnessMaterial("capMat" + bottleIndex, this.scene);
                capMat.baseColor = new BABYLON.Color3(0.7, 0.6, 0.4); // Gold cap
                capMat.metallic = 1;
                capMat.roughness = 0.3;
                capMat.maxSimultaneousLights = this.maxLights;
                cap.material = capMat;
                
                bottleIndex++;
            }
        }
        
        console.log(`✅ Created bar with ${bottleIndex} bottles`);
    }
    
    createBartender() {
        // Bartender body (simplified humanoid)
        const bodyMat = new BABYLON.PBRMetallicRoughnessMaterial("bodyMat", this.scene);
        bodyMat.baseColor = new BABYLON.Color3(0.2, 0.2, 0.25); // Dark clothing
        bodyMat.metallic = 0;
        bodyMat.roughness = 0.9;
        bodyMat.maxSimultaneousLights = this.maxLights;
        
        const skinMat = new BABYLON.PBRMetallicRoughnessMaterial("skinMat", this.scene);
        skinMat.baseColor = new BABYLON.Color3(0.7, 0.5, 0.4); // Skin tone
        skinMat.metallic = 0;
        skinMat.roughness = 0.7;
        skinMat.maxSimultaneousLights = this.maxLights;
        
        // Torso
        const torso = BABYLON.MeshBuilder.CreateCylinder("bartenderTorso", {
            diameterTop: 0.4,
            diameterBottom: 0.45,
            height: 0.8,
            tessellation: 16
        }, this.scene);
        torso.position = new BABYLON.Vector3(-10, 1.7, 4.5);
        torso.material = bodyMat;
        
        // Head
        const head = BABYLON.MeshBuilder.CreateSphere("bartenderHead", {
            diameter: 0.3,
            segments: 16
        }, this.scene);
        head.position = new BABYLON.Vector3(-10, 2.25, 4.5);
        head.material = skinMat;
        
        // Arms (will animate for glass cleaning)
        const armMat = bodyMat.clone("armMat");
        
        // Left arm (upper)
        const leftArmUpper = BABYLON.MeshBuilder.CreateCylinder("leftArmUpper", {
            diameter: 0.1,
            height: 0.35,
            tessellation: 12
        }, this.scene);
        leftArmUpper.position = new BABYLON.Vector3(-10.25, 1.85, 4.5);
        leftArmUpper.rotation.z = Math.PI / 6;
        leftArmUpper.material = armMat;
        
        // Left forearm
        const leftForearm = BABYLON.MeshBuilder.CreateCylinder("leftForearm", {
            diameter: 0.08,
            height: 0.3,
            tessellation: 12
        }, this.scene);
        leftForearm.position = new BABYLON.Vector3(-10.4, 1.6, 4.5);
        leftForearm.rotation.z = Math.PI / 4;
        leftForearm.material = armMat;
        
        // Left hand holding glass
        const leftHand = BABYLON.MeshBuilder.CreateSphere("leftHand", {
            diameter: 0.08,
            segments: 12
        }, this.scene);
        leftHand.position = new BABYLON.Vector3(-10.5, 1.4, 4.5);
        leftHand.material = skinMat;
        
        // Right arm (upper)
        const rightArmUpper = BABYLON.MeshBuilder.CreateCylinder("rightArmUpper", {
            diameter: 0.1,
            height: 0.35,
            tessellation: 12
        }, this.scene);
        rightArmUpper.position = new BABYLON.Vector3(-9.75, 1.85, 4.5);
        rightArmUpper.rotation.z = -Math.PI / 6;
        rightArmUpper.material = armMat;
        
        // Right forearm with cloth
        const rightForearm = BABYLON.MeshBuilder.CreateCylinder("rightForearm", {
            diameter: 0.08,
            height: 0.3,
            tessellation: 12
        }, this.scene);
        rightForearm.position = new BABYLON.Vector3(-9.6, 1.6, 4.5);
        rightForearm.rotation.z = -Math.PI / 4;
        rightForearm.material = armMat;
        
        // Right hand with cloth
        const rightHand = BABYLON.MeshBuilder.CreateSphere("rightHand", {
            diameter: 0.08,
            segments: 12
        }, this.scene);
        rightHand.position = new BABYLON.Vector3(-9.5, 1.4, 4.5);
        rightHand.material = skinMat;
        
        // Glass being cleaned
        const glassBeingCleaned = BABYLON.MeshBuilder.CreateCylinder("cleaningGlass", {
            diameterTop: 0.08,
            diameterBottom: 0.06,
            height: 0.15,
            tessellation: 16
        }, this.scene);
        glassBeingCleaned.position = new BABYLON.Vector3(-10.5, 1.35, 4.5);
        
        const cleanGlassMat = new BABYLON.PBRMetallicRoughnessMaterial("cleanGlassMat", this.scene);
        cleanGlassMat.baseColor = new BABYLON.Color3(0.95, 0.95, 0.95);
        cleanGlassMat.metallic = 0;
        cleanGlassMat.roughness = 0.05;
        cleanGlassMat.alpha = 0.4;
        cleanGlassMat.maxSimultaneousLights = this.maxLights;
        glassBeingCleaned.material = cleanGlassMat;
        
        // Cleaning cloth in right hand
        const cloth = BABYLON.MeshBuilder.CreateBox("cleaningCloth", {
            width: 0.12,
            height: 0.02,
            depth: 0.12
        }, this.scene);
        cloth.position = new BABYLON.Vector3(-9.5, 1.38, 4.5);
        
        const clothMat = new BABYLON.StandardMaterial("clothMat", this.scene);
        clothMat.diffuseColor = new BABYLON.Color3(0.9, 0.9, 0.85); // White cloth
        cloth.material = clothMat;
        
        // Store references for animation
        this.bartender = {
            leftHand: leftHand,
            rightHand: rightHand,
            leftForearm: leftForearm,
            rightForearm: rightForearm,
            glass: glassBeingCleaned,
            cloth: cloth,
            animationPhase: 0
        };
        
        console.log("✅ Created bartender with glass cleaning animation");
    }

    createTrussMountedLights() {
        // Moving head lights on truss - ONLY for spotlights (6 fixtures to match 6 spotlights)
        const lightFixtureMat = new BABYLON.PBRMetallicRoughnessMaterial("lightFixtureMat", this.scene);
        lightFixtureMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        lightFixtureMat.metallic = 0.9;
        lightFixtureMat.roughness = 0.2;
        
        // Array of light positions on truss - MATCH spotlight positions exactly
        const lightPositions = [
            { x: -8, z: -10 },  // Left front - matches spotlight
            { x: -8, z: -14 },  // Left middle - matches spotlight
            { x: -8, z: -18 },  // Left back - matches spotlight
            { x: 8, z: -10 },   // Right front - matches spotlight
            { x: 8, z: -14 },   // Right middle - matches spotlight
            { x: 8, z: -18 }    // Right back - matches spotlight
        ];
        
        this.trussLights = [];
        
        lightPositions.forEach((pos, i) => {
            // Light fixture body - make larger and more visible
            const fixture = BABYLON.MeshBuilder.CreateCylinder("lightFixture" + i, {
                diameter: 0.4,    // Increased from 0.3 to 0.4
                height: 0.6       // Increased from 0.4 to 0.6
            }, this.scene);
            fixture.position = new BABYLON.Vector3(pos.x, 7.6, pos.z);  // Lower to 7.6 from 7.7
            fixture.rotation.x = Math.PI / 2;
            fixture.material = lightFixtureMat;
            
            // Light lens (glowing) - The actual visible light source - make larger
            const lens = BABYLON.MeshBuilder.CreateCylinder("lens" + i, {
                diameter: 0.35,   // Increased from 0.25 to 0.35
                height: 0.08      // Increased from 0.05 to 0.08
            }, this.scene);
            lens.position = new BABYLON.Vector3(pos.x, 7.3, pos.z);  // Adjusted position
            lens.rotation.x = Math.PI / 2;
            
            const lensMat = new BABYLON.StandardMaterial("lensMat" + i, this.scene);
            lensMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Start bright
            lensMat.disableLighting = true;
            lensMat.backFaceCulling = false; // Visible from all angles
            lens.material = lensMat;
            lens.renderingGroupId = 2; // Render on top for maximum visibility
            
            // Add bright glow sphere inside lens for extra visibility - make larger
            const lightSource = BABYLON.MeshBuilder.CreateSphere("lightSource" + i, {
                diameter: 0.3     // Increased from 0.2 to 0.3
            }, this.scene);
            lightSource.position = new BABYLON.Vector3(pos.x, 7.3, pos.z);  // Match lens position
            
            const sourceMat = new BABYLON.StandardMaterial("sourceMat" + i, this.scene);
            sourceMat.emissiveColor = new BABYLON.Color3(1, 1, 1); // Very bright
            sourceMat.disableLighting = true;
            sourceMat.backFaceCulling = false;
            lightSource.material = sourceMat;
            lightSource.renderingGroupId = 2;
            
            this.trussLights.push({ fixture, lens, lensMat, lightSource, sourceMat });
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

    createLasers() {
        
        this.lasers = [];
        
        // Lasers mounted UNDER the truss (hanging down)
        // Each laser has a type: 'single', 'spread', 'multi'
        // Center laser on truss, side lasers on side trusses
        const laserPositions = [
            { x: -6, z: -10, trussY: 7.55, type: 'spread' },   // Spread laser left (side truss)
            { x: 0, z: -10, trussY: 7.55, type: 'multi' },     // Multi-beam center (main truss)
            { x: 6, z: -10, trussY: 7.55, type: 'single' }     // Single beam right (side truss)
        ];
        
        laserPositions.forEach((pos, i) => {

            
            // Determine parent truss for side lasers
            let parentTruss = null;
            let localX = pos.x;
            let localZ = pos.z;
            
            // Side lasers mount to side trusses (±8)
            if (pos.x < -3 && this.sideTrusses && this.sideTrusses[-8]) {
                // Left laser mounts to left side truss at x: -8
                parentTruss = this.sideTrusses[-8];
                localX = 2; // Offset from truss center (truss is at x:-8, laser at x:-6)
                localZ = pos.z - (-12); // Relative to truss z position
            } else if (pos.x > 3 && this.sideTrusses && this.sideTrusses[8]) {
                // Right laser mounts to right side truss at x: 8
                parentTruss = this.sideTrusses[8];
                localX = -2; // Offset from truss center (truss is at x:8, laser at x:6)
                localZ = pos.z - (-12); // Relative to truss z position
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
            clamp.isPickable = false;
            
            const clampMat = new BABYLON.PBRMetallicRoughnessMaterial("clampMat" + i, this.scene);
            clampMat.baseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
            clampMat.metallic = 1.0;
            clampMat.roughness = 0.4;
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
            
            const housingMat = new BABYLON.PBRMetallicRoughnessMaterial("laserHousingMat" + i, this.scene);
            housingMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            housingMat.metallic = 0.8;
            housingMat.roughness = 0.3;
            housingMat.emissiveColor = new BABYLON.Color3(0.05, 0, 0); // Dimmer red glow (was 0.2)
            housing.material = housingMat;
            housing.isPickable = false;
            
            // BRIGHT LASER EMITTER - Visible light source on housing front
            const emitter = BABYLON.MeshBuilder.CreateCylinder("laserEmitter" + i, {
                diameter: 0.12,
                height: 0.03,
                tessellation: 16
            }, this.scene);
            
            if (parentTruss) {
                emitter.position = new BABYLON.Vector3(localX, -0.45, localZ + 0.18);
                emitter.parent = parentTruss;
            } else {
                emitter.position = new BABYLON.Vector3(pos.x, pos.trussY, pos.z + 0.18);
            }
            emitter.rotation.x = Math.PI / 2;
            emitter.isPickable = false;
            
            const emitterMat = new BABYLON.StandardMaterial("laserEmitterMat" + i, this.scene);
            emitterMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Bright red
            emitterMat.disableLighting = true;
            emitterMat.backFaceCulling = false;
            emitter.material = emitterMat;
            emitter.renderingGroupId = 2; // Render on top for visibility
            
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
                emitter: emitter,
                emitterMat: emitterMat,
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
        
        // Lights and lasers control - ALTERNATING PATTERN
        // Pattern: Lights on for 30s (longer with varied patterns), then Lasers on for 15s
        this.lightsActive = true;
        this.lasersActive = false;
        this.lightModeSwitchTime = 0;
        this.lightingPhase = 'lights'; // 'lights' or 'lasers'
        this.lightsPhaseDuration = 30; // Lights show for 30 seconds (LONGER with pattern changes)
        this.lasersPhaseDuration = 15; // Lasers show for 15 seconds (shorter, more impactful)
        
    }
    
    createLaserBeam(laserIndex, beamIndex, pos) {
        // HYPERREALISTIC LASER BEAM - Very thin, intense core with volumetric glow
        
        // CORE BEAM - Ultra-thin, super bright (realistic laser appearance)
        const beam = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_beam" + beamIndex, {
            diameter: 0.015,  // Very thin - reduced from 0.04 to 0.015 (real laser thinness)
            height: 1,
            tessellation: 8
        }, this.scene);
        beam.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        beam.isPickable = false;
        beam.rotationQuaternion = BABYLON.Quaternion.Identity();
        
        // PBR Material with high intensity for core beam
        const beamMat = new BABYLON.PBRMaterial("laserBeamMat" + laserIndex + "_" + beamIndex, this.scene);
        beamMat.albedoColor = new BABYLON.Color3(0, 0, 0);
        beamMat.metallic = 0;
        beamMat.roughness = 1;
        beamMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Bright red core
        beamMat.emissiveIntensity = 4.0; // Very intense for laser
        beamMat.alpha = 0.9; // Nearly opaque core
        beamMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        beamMat.backFaceCulling = false;
        beamMat.disableLighting = true;
        beamMat.unlit = true;
        beam.material = beamMat;
        beam.renderingGroupId = 1;
        
        // VOLUMETRIC GLOW - Soft halo around the laser (atmospheric scatter)
        const beamGlow = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_glow" + beamIndex, {
            diameter: 0.08,   // Wider glow around thin core
            height: 1,
            tessellation: 8
        }, this.scene);
        beamGlow.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        beamGlow.isPickable = false;
        beamGlow.rotationQuaternion = BABYLON.Quaternion.Identity();
        
        const beamGlowMat = new BABYLON.PBRMaterial("laserGlowMat" + laserIndex + "_" + beamIndex, this.scene);
        beamGlowMat.albedoColor = new BABYLON.Color3(0, 0, 0);
        beamGlowMat.metallic = 0;
        beamGlowMat.roughness = 1;
        beamGlowMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red glow
        beamGlowMat.emissiveIntensity = 1.5;
        beamGlowMat.alpha = 0.15; // Very transparent for soft glow
        beamGlowMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        beamGlowMat.backFaceCulling = false;
        beamGlowMat.disableLighting = true;
        beamGlowMat.unlit = true;
        beamGlow.material = beamGlowMat;
        beamGlow.renderingGroupId = 1;
        
        // FLOOR HIT SPOT - Where laser hits the ground (small, focused like real laser)
        const hitSpot = BABYLON.MeshBuilder.CreateDisc("laserHit" + laserIndex + "_" + beamIndex, {
            radius: 0.04,  // Much smaller - reduced from 0.15 to 0.04 (realistic laser spot)
            tessellation: 16
        }, this.scene);
        hitSpot.rotation.x = Math.PI / 2;
        hitSpot.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
        hitSpot.isPickable = false;
        
        const hitSpotMat = new BABYLON.StandardMaterial("laserHitMat" + laserIndex + "_" + beamIndex, this.scene);
        hitSpotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        hitSpotMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Bright red spot (will be updated with color)
        hitSpotMat.alpha = 0.9;  // More opaque for brighter spot
        hitSpotMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive for bright glow
        hitSpotMat.disableLighting = true;
        hitSpot.material = hitSpotMat;
        hitSpot.renderingGroupId = 1;
        
        return { 
            mesh: beam, 
            material: beamMat, 
            beamGlow: beamGlow,
            glowMat: beamGlowMat,
            hitSpot: hitSpot,
            hitSpotMat: hitSpotMat,
            beamIndex: beamIndex 
        };
    }

    createLights() {
        
        // Very dim ambient for industrial atmosphere
        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.08;
        ambient.diffuse = new BABYLON.Color3(0.1, 0.1, 0.12);
        
        // Spotlights mounted on truss (moving heads)
        this.spotlights = [];
        // 6 spotlights: 3 on left side, 3 on right side
        const spotPositions = [
            { x: -8, z: -10 },  // Left front
            { x: -8, z: -14 },  // Left middle
            { x: -8, z: -18 },  // Left back
            { x: 8, z: -10 },   // Right front
            { x: 8, z: -14 },   // Right middle
            { x: 8, z: -18 }    // Right back
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
        
        // Track current color for all lights (changes periodically)
        this.currentSpotColor = spotColors[0];
        this.spotColorIndex = 0;
        this.lastColorChange = 0;
        
        spotPositions.forEach((pos, i) => {
            // Spotlight from truss position
            const spot = new BABYLON.SpotLight("spot" + i,
                new BABYLON.Vector3(pos.x, 7.8, pos.z),  // Truss height
                new BABYLON.Vector3(0, -1, 0),           // Initial direction
                Math.PI / 6,                              // Narrower cone for focused beams
                5,                                        // Sharper falloff
                this.scene
            );
            spot.diffuse = this.currentSpotColor; // All start with same color
            spot.intensity = 12; // Increased for visibility
            spot.range = 25;
            
            // SPOTLIGHT BEAM - Cone that extends FROM fixture DOWN to floor
            // When cylinder points DOWN, its +Y local axis points toward floor
            // So: diameterTop (at +Y local) should be WIDE (at floor)
            //     diameterBottom (at -Y local) should be NARROW (at fixture)
            // Reduced size for more realistic club spotlights
            const beam = BABYLON.MeshBuilder.CreateCylinder("spotBeam" + i, {
                diameterTop: 2.0,      // Wide end - reduced from 4.0 to 2.0m for realism
                diameterBottom: 0.25,  // Narrow end - slightly reduced for tighter beam
                height: 1,             // Will be scaled to actual beam length
                tessellation: 16,
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // Start at fixture position (will be updated each frame)
            beam.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            beam.isPickable = false;
            beam.rotationQuaternion = BABYLON.Quaternion.Identity();
            
            // HYPERREALISTIC VOLUMETRIC BEAM - Simulates light scattering through haze/fog
            // Use PBR material for more realistic light interaction
            const beamMat = new BABYLON.PBRMaterial("spotBeamMat" + i, this.scene);
            
            // No base color - pure emission and transparency
            beamMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamMat.metallic = 0;
            beamMat.roughness = 1;
            
            // Soft emissive glow - the "light particles" in the air
            beamMat.emissiveColor = this.currentSpotColor.scale(0.3);
            beamMat.emissiveIntensity = 2.0; // Boost intensity for visibility
            
            // Critical: Very low alpha with additive-like blending
            beamMat.alpha = 0.04; // Extremely transparent - builds up with overlapping views
            beamMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
            
            // Fresnel effect - more visible from the side (like real light beams)
            beamMat.opacityFresnel = new BABYLON.FresnelParameters();
            beamMat.opacityFresnel.leftColor = new BABYLON.Color3(0.1, 0.1, 0.1); // More opaque from side
            beamMat.opacityFresnel.rightColor = new BABYLON.Color3(0, 0, 0); // Transparent when looking along beam
            beamMat.opacityFresnel.bias = 0.2;
            beamMat.opacityFresnel.power = 2;
            
            // Important settings for realism
            beamMat.backFaceCulling = false; // Visible from all angles
            beamMat.disableLighting = true; // Self-illuminated
            beamMat.unlit = true; // Don't receive lighting
            
            beam.material = beamMat;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1; // Render after opaque objects
            
            // VOLUMETRIC GLOW - Outer soft glow around the beam for realism
            const beamGlow = BABYLON.MeshBuilder.CreateCylinder("spotBeamGlow" + i, {
                diameterTop: 2.6,      // Slightly larger than beam (2.0 + 0.6)
                diameterBottom: 0.4,   // Slightly larger than beam (0.25 + 0.15)
                height: 1,
                tessellation: 16,
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            beamGlow.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            beamGlow.isPickable = false;
            beamGlow.rotationQuaternion = BABYLON.Quaternion.Identity();
            
            // Ultra-soft glow material
            const beamGlowMat = new BABYLON.PBRMaterial("spotBeamGlowMat" + i, this.scene);
            beamGlowMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamGlowMat.metallic = 0;
            beamGlowMat.roughness = 1;
            beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.15); // Softer than main beam
            beamGlowMat.emissiveIntensity = 1.5;
            beamGlowMat.alpha = 0.02; // Even more transparent for soft glow effect
            beamGlowMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
            beamGlowMat.backFaceCulling = false;
            beamGlowMat.disableLighting = true;
            beamGlowMat.unlit = true;
            
            beamGlow.material = beamGlowMat;
            beamGlow.visibility = 1.0;
            beamGlow.renderingGroupId = 1;

            
            // HYPERREALISTIC FLOOR LIGHT SPLASH - Multi-layer gradient effect
            // Core bright spot (center hotspot)
            const lightPoolCore = BABYLON.MeshBuilder.CreateDisc("lightPoolCore" + i, {
                radius: 0.5,
                tessellation: 32
            }, this.scene);
            lightPoolCore.rotation.x = Math.PI / 2;
            lightPoolCore.position = new BABYLON.Vector3(pos.x, 0.04, pos.z - 5);
            lightPoolCore.isPickable = false;
            
            const poolCoreMat = new BABYLON.StandardMaterial("poolCoreMat" + i, this.scene);
            poolCoreMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolCoreMat.emissiveColor = this.currentSpotColor.scale(2.5); // Very bright center
            poolCoreMat.alpha = 0.8; // Nearly opaque center
            poolCoreMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive for glow
            poolCoreMat.disableLighting = true;
            lightPoolCore.material = poolCoreMat;
            lightPoolCore.renderingGroupId = 1;
            
            // Mid glow (gradient falloff)
            const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + i, {
                radius: 1.5,
                tessellation: 32
            }, this.scene);
            lightPool.rotation.x = Math.PI / 2;
            lightPool.position = new BABYLON.Vector3(pos.x, 0.03, pos.z - 5);
            lightPool.isPickable = false;
            
            const poolMat = new BABYLON.StandardMaterial("poolMat" + i, this.scene);
            poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolMat.emissiveColor = this.currentSpotColor.scale(1.0); // Medium bright
            poolMat.alpha = 0.35; // Semi-transparent
            poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending
            poolMat.disableLighting = true;
            lightPool.material = poolMat;
            lightPool.renderingGroupId = 1;
            
            // Outer soft glow (wide falloff)
            const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + i, {
                radius: 3.0,
                tessellation: 32
            }, this.scene);
            lightPoolGlow.rotation.x = Math.PI / 2;
            lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
            lightPoolGlow.isPickable = false;
            
            const poolGlowMat = new BABYLON.StandardMaterial("poolGlowMat" + i, this.scene);
            poolGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.3); // Soft glow
            poolGlowMat.alpha = 0.15; // Very transparent
            poolGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending
            poolGlowMat.disableLighting = true;
            lightPoolGlow.material = poolGlowMat;
            lightPoolGlow.renderingGroupId = 1;
            


            
            // Enable shadows for more immersion (expensive but worth it for some lights)
            if (i % 3 === 0) { // Only every 3rd light for performance
                const shadowGenerator = new BABYLON.ShadowGenerator(512, spot);
                shadowGenerator.useBlurExponentialShadowMap = true;
                shadowGenerator.blurScale = 2;
                shadowGenerator.setDarkness(0.4);
            }
            
            this.spotlights.push({
                light: spot,
                beam: beam,
                beamMat: beamMat,
                beamGlow: beamGlow,
                beamGlowMat: beamGlowMat,
                lightPool: lightPool,
                poolMat: poolMat,
                lightPoolCore: lightPoolCore,
                poolCoreMat: poolCoreMat,
                lightPoolGlow: lightPoolGlow,
                poolGlowMat: poolGlowMat,
                fixture: this.trussLights ? this.trussLights[i]?.fixture : null,
                basePos: new BABYLON.Vector3(pos.x, 7.8, pos.z),
                phase: i * (Math.PI * 2 / spotPositions.length),
                speed: 0.8,
                color: this.currentSpotColor,
                index: i
            });
        });
        
        this.spotColorList = spotColors;
        
        // LED wall backlight
        const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
        ledLight.diffuse = new BABYLON.Color3(0.8, 0.8, 1.0);
        ledLight.intensity = 10;
        ledLight.range = 25;
        
    }

    updateFogLighting(time) {
        // Dynamically tint fog particles based on current spotlight color
        // This creates realistic light scattering through the atmosphere
        
        // Get current spotlight color
        let lightColor;
        if (this.currentColorIndex === 0) {
            lightColor = this.cachedColors.red; // Red
        } else if (this.currentColorIndex === 1) {
            lightColor = this.cachedColors.green; // Green
        } else {
            lightColor = this.cachedColors.blue; // Blue/Cyan
        }
        
        // Mix base fog color with light color for realistic illumination
        // Base fog is white/gray, tinted by colored lights passing through
        const baseFogColor = new BABYLON.Color3(0.85, 0.85, 0.92); // Neutral white fog
        const mixFactor = 0.4; // 40% light color, 60% base fog color
        
        // Calculate tinted fog color (light scattering effect)
        const tintedR = baseFogColor.r * (1 - mixFactor) + lightColor.r * mixFactor;
        const tintedG = baseFogColor.g * (1 - mixFactor) + lightColor.g * mixFactor;
        const tintedB = baseFogColor.b * (1 - mixFactor) + lightColor.b * mixFactor;
        
        // Add subtle pulsing based on time (simulates light intensity variation)
        const pulse = 0.85 + Math.sin(time * 1.5) * 0.15; // Subtle 15% variation
        
        // Update all fog systems with light-tinted colors
        if (this.fogSystems[0]) { // Dance floor fog
            const alpha1 = 0.08 * pulse;
            const alpha2 = 0.04 * pulse;
            this.fogSystems[0].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[0].color2 = new BABYLON.Color4(tintedR * 0.85, tintedG * 0.85, tintedB * 0.85, alpha2);
        }
        
        if (this.fogSystems[1]) { // Upper atmosphere fog
            const alpha1 = 0.04 * pulse;
            const alpha2 = 0.02 * pulse;
            this.fogSystems[1].color1 = new BABYLON.Color4(tintedR * 0.9, tintedG * 0.9, tintedB * 0.9, alpha1);
            this.fogSystems[1].color2 = new BABYLON.Color4(tintedR * 0.75, tintedG * 0.75, tintedB * 0.75, alpha2);
        }
        
        if (this.fogSystems[2]) { // DJ booth fog
            const alpha1 = 0.12 * pulse;
            const alpha2 = 0.06 * pulse;
            this.fogSystems[2].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[2].color2 = new BABYLON.Color4(tintedR * 0.8, tintedG * 0.8, tintedB * 0.8, alpha2);
        }
    }
    
    updateFogLightingForLasers(time) {
        // Tint fog based on laser colors (RGB cycling)
        // Lasers are thinner and more focused, so fog tint is more subtle
        
        let laserColor;
        if (this.currentColorIndex === 0) {
            laserColor = this.cachedColors.red;
        } else if (this.currentColorIndex === 1) {
            laserColor = this.cachedColors.green;
        } else {
            laserColor = this.cachedColors.blue;
        }
        
        // Less mixing for lasers (they're more focused than spotlights)
        const baseFogColor = new BABYLON.Color3(0.85, 0.85, 0.92);
        const mixFactor = 0.25; // 25% laser color, 75% base fog (subtle)
        
        const tintedR = baseFogColor.r * (1 - mixFactor) + laserColor.r * mixFactor;
        const tintedG = baseFogColor.g * (1 - mixFactor) + laserColor.g * mixFactor;
        const tintedB = baseFogColor.b * (1 - mixFactor) + laserColor.b * mixFactor;
        
        // Faster pulse for lasers (more energetic)
        const pulse = 0.8 + Math.sin(time * 2.5) * 0.2;
        
        if (this.fogSystems[0]) {
            const alpha1 = 0.08 * pulse;
            const alpha2 = 0.04 * pulse;
            this.fogSystems[0].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[0].color2 = new BABYLON.Color4(tintedR * 0.85, tintedG * 0.85, tintedB * 0.85, alpha2);
        }
        
        if (this.fogSystems[1]) {
            const alpha1 = 0.04 * pulse;
            const alpha2 = 0.02 * pulse;
            this.fogSystems[1].color1 = new BABYLON.Color4(tintedR * 0.9, tintedG * 0.9, tintedB * 0.9, alpha1);
            this.fogSystems[1].color2 = new BABYLON.Color4(tintedR * 0.75, tintedG * 0.75, tintedB * 0.75, alpha2);
        }
        
        if (this.fogSystems[2]) {
            const alpha1 = 0.12 * pulse;
            const alpha2 = 0.06 * pulse;
            this.fogSystems[2].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[2].color2 = new BABYLON.Color4(tintedR * 0.8, tintedG * 0.8, tintedB * 0.8, alpha2);
        }
    }
    
    resetFogToNeutral() {
        // Return fog to neutral white/gray when no lights are active
        if (this.fogSystems[0]) {
            this.fogSystems[0].color1 = new BABYLON.Color4(0.85, 0.85, 0.92, 0.08);
            this.fogSystems[0].color2 = new BABYLON.Color4(0.65, 0.65, 0.75, 0.04);
        }
        
        if (this.fogSystems[1]) {
            this.fogSystems[1].color1 = new BABYLON.Color4(0.72, 0.72, 0.8, 0.04);
            this.fogSystems[1].color2 = new BABYLON.Color4(0.55, 0.55, 0.65, 0.02);
        }
        
        if (this.fogSystems[2]) {
            this.fogSystems[2].color1 = new BABYLON.Color4(0.88, 0.88, 0.98, 0.12);
            this.fogSystems[2].color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.06);
        }
    }

    updateAnimations() {
        const time = performance.now() / 1000;
        this.ledTime += 0.016;
        
        // Get audio data for reactive lighting
        const audioData = this.getAudioData();
        
        // ALTERNATING PATTERN: Lights and Lasers don't mix
        // Lights: 15 seconds, Lasers: 25 seconds (longer but less frequent)
        if (time - this.lightModeSwitchTime > (this.lightingPhase === 'lights' ? this.lightsPhaseDuration : this.lasersPhaseDuration)) {
            // Switch phases
            if (this.lightingPhase === 'lights') {
                this.lightingPhase = 'lasers';
                this.lightsActive = false;
                this.lasersActive = true;

            } else {
                this.lightingPhase = 'lights';
                this.lightsActive = true;
                this.lasersActive = false;

            }
            this.lightModeSwitchTime = time;
        }
        
        // Update LED wall (with audio reactivity)
        if (this.ledPanels) {
            this.updateLEDWall(time, audioData);
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
        
        // UPDATE FOG COLORS - Make fog realistically reflect current light colors
        if (this.fogSystems) {
            if (this.lightsActive) {
                // Fog reflects spotlight colors
                this.updateFogLighting(time);
            } else if (this.lasersActive) {
                // Fog reflects laser colors (RGB cycling)
                this.updateFogLightingForLasers(time);
            } else {
                // Reset to neutral fog when no lights
                this.resetFogToNeutral();
            }
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
                // Mark laser as spinning
                laser.isSpinning = true;
                
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
                    
                    // UPDATE GLOW BEAM - Same position/rotation/scale as core
                    if (beam.beamGlow) {
                        beam.beamGlow.scaling.y = beamLength;
                        beam.beamGlow.position.copyFrom(beam.mesh.position);
                        beam.beamGlow.rotationQuaternion = beam.mesh.rotationQuaternion.clone();
                    }
                    
                    // UPDATE HIT SPOT - Position where laser hits surface
                    if (beam.hitSpot && hit && hit.hit && hit.pickedPoint) {
                        beam.hitSpot.position.copyFrom(hit.pickedPoint);
                        beam.hitSpot.position.y = 0.02; // Slightly above floor to avoid z-fighting
                        beam.hitSpot.visibility = 1.0;
                        
                        // Pulse effect on hit spot
                        const pulse = 0.8 + Math.sin(time * 8 + beamIdx) * 0.2;
                        beam.hitSpot.scaling.x = pulse;
                        beam.hitSpot.scaling.y = pulse;
                    } else if (beam.hitSpot) {
                        beam.hitSpot.visibility = 0; // Hide if no hit
                    }
                    
                    // Color all beam elements with current color
                    let currentColor;
                    if (this.currentColorIndex === 0) {
                        currentColor = this.cachedColors.red;
                    } else if (this.currentColorIndex === 1) {
                        currentColor = this.cachedColors.green;
                    } else {
                        currentColor = this.cachedColors.blue;
                    }
                    
                    // Apply color to core beam
                    beam.material.emissiveColor = currentColor;
                    beam.mesh.visibility = 1.0;
                    
                    // Apply softer color to glow
                    if (beam.glowMat) {
                        beam.glowMat.emissiveColor = currentColor;
                    }
                    if (beam.beamGlow) {
                        beam.beamGlow.visibility = 1.0;
                    }
                    
                    // Apply color to hit spot (already handled above with visibility check)
                });
                
                // Update lights and emitter color
                laser.lights.forEach((light, lightIdx) => {
                    if (this.currentColorIndex === 0) {
                        light.diffuse = this.cachedColors.red;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0.2, 0, 0);
                        if (laser.emitterMat) laser.emitterMat.emissiveColor = this.cachedColors.red.scale(3.0); // Bright red emitter
                    } else if (this.currentColorIndex === 1) {
                        light.diffuse = this.cachedColors.green;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0, 0.2, 0);
                        if (laser.emitterMat) laser.emitterMat.emissiveColor = this.cachedColors.green.scale(3.0); // Bright green emitter
                    } else {
                        light.diffuse = this.cachedColors.blue;
                        laser.housingMat.emissiveColor = new BABYLON.Color3(0, 0, 0.2);
                        if (laser.emitterMat) laser.emitterMat.emissiveColor = this.cachedColors.blue.scale(3.0); // Bright blue emitter
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
                    if (beam.beamGlow) beam.beamGlow.visibility = 0;
                    if (beam.hitSpot) beam.hitSpot.visibility = 0;
                });
            });
        }
        
        // Make laser beams visible only when spinning
        if (this.lasers) {
            this.lasers.forEach(laser => {
                laser.beams.forEach(beam => {
                    // Only show beams if laser is actively spinning
                    if (laser.isSpinning && this.lasersActive) {
                        beam.mesh.visibility = 1;
                        beam.material.alpha = 0.6;
                    } else {
                        // Turn off beams when not spinning
                        beam.mesh.visibility = 0;
                        beam.material.alpha = 0;
                    }
                });
                // Reset spinning flag for next frame
                laser.isSpinning = false;
            });
        }
        
        // Update spotlights with synchronized movement patterns (AUDIO REACTIVE)
        // ALWAYS change color every 10 seconds for ALL lights (outside the lightsActive check)
        if (time - this.lastColorChange > 10) {
            this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
            this.currentSpotColor = this.spotColorList[this.spotColorIndex];
            this.lastColorChange = time;
            

            
            // Update ALL lights to new color
            if (this.spotlights) {
                this.spotlights.forEach(spot => {
                    spot.light.diffuse = this.currentSpotColor;
                    spot.color = this.currentSpotColor;
                    // Beam color updated in animation loop
                });
            }
        }
        
        if (this.spotlights && this.lightsActive) {
            
            // SYNCHRONIZED SWEEPING - recreate iconic club vibe
            // All lights move together, sweeping their beams across the dance floor
            let globalPhase = time * 0.4; // Slower, more dramatic
            
            // Audio reactivity - make movement speed react to bass
            const audioSpeedMultiplier = 1 + (audioData.bass * 1.5);
            
            this.spotlights.forEach((spot, i) => {
                let dirX, dirZ;
                
                if (this.lightingMode === 'synchronized') {
                    // SYNCHRONIZED SWEEPING: All lights sweep together across dance floor
                    // Multiple patterns that change every 5 seconds during the 30-second light phase
                    const sweepPhase = globalPhase * audioSpeedMultiplier;
                    const sweepPattern = Math.floor(sweepPhase / 5) % 6; // Change pattern every 5 seconds (6 patterns)
                    
                    if (sweepPattern === 0) {
                        // Linear sweep left to right - classic club move
                        dirX = Math.sin(sweepPhase * 1.2) * 1.3; // Wide sweep
                        dirZ = -0.5; // Point towards back of dance floor
                    } else if (sweepPattern === 1) {
                        // Circular sweep - all lights rotate together
                        dirX = Math.sin(sweepPhase * 0.8) * 1.1;
                        dirZ = Math.cos(sweepPhase * 0.8) * 1.1;
                    } else if (sweepPattern === 2) {
                        // Fan sweep - from center outwards and back
                        const fanPhase = Math.sin(sweepPhase * 0.7);
                        dirX = fanPhase * 1.4;
                        dirZ = Math.abs(fanPhase) * -0.9;
                    } else if (sweepPattern === 3) {
                        // Cross sweep - diagonal sweeps
                        dirX = Math.sin(sweepPhase * 1.0) * 1.2;
                        dirZ = Math.sin(sweepPhase * 1.0 + Math.PI / 4) * 1.2;
                    } else if (sweepPattern === 4) {
                        // Figure-8 sweep - complex synchronized pattern
                        dirX = Math.sin(sweepPhase * 0.6) * 1.3;
                        dirZ = Math.sin(sweepPhase * 1.2) * 0.9;
                    } else {
                        // Pulse sweep - beams converge to center then spread out
                        const pulsePhase = Math.sin(sweepPhase * 0.8);
                        dirX = pulsePhase * Math.cos(sweepPhase * 0.5) * 1.2;
                        dirZ = pulsePhase * Math.sin(sweepPhase * 0.5) * 1.0;
                    }
                } else {
                    // Individual patterns for variety
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
                
                // Set direction (pointing from truss DOWN to dance floor)
                // Direction should always have strong downward component (negative Y)
                const direction = new BABYLON.Vector3(dirX, -1.5, dirZ).normalize(); // Stronger downward bias
                spot.light.direction = direction;
                

                
                // Dynamic beam angle (simulates zoom adjustment) - subtle variation
                const baseAngle = Math.PI / 6; // 30 degrees base
                const angleVariation = Math.sin(time * 0.3 + i * 0.5) * 0.1; // ±6 degrees
                spot.light.angle = baseAngle + angleVariation;
                
                // Rotate FIXTURE if available
                if (spot.fixture) {
                    // Calculate target point on dance floor
                    const targetPoint = spot.basePos.add(direction.scale(8));
                    spot.fixture.lookAt(targetPoint);
                }
                
                // PROFESSIONAL VOLUMETRIC BEAM - Simple and effective
                if (spot.beam) {
                    // Calculate where beam centerline intersects floor (for pool positioning)
                    let centerDistanceToFloor;
                    let floorIntersection;
                    
                    if (direction.y < -0.01) {
                        centerDistanceToFloor = spot.basePos.y / Math.abs(direction.y);
                        floorIntersection = spot.basePos.add(direction.scale(centerDistanceToFloor));
                        floorIntersection.y = 0; // Clamp to floor
                    } else {
                        centerDistanceToFloor = 15;
                        floorIntersection = spot.basePos.add(direction.scale(centerDistanceToFloor));
                    }
                    
                    // IMPORTANT: Calculate beam length to ensure FULL CONE reaches floor
                    // The cone widens from 0.25m to 2.0m, so at angles the edge hits floor first
                    // We need to extend the beam so the WIDE END fully reaches floor
                    // Cone radius at floor = 1.0m (diameter 2.0m)
                    // When beam is angled, we need extra length for the outer edge to reach floor
                    const coneRadiusAtFloor = 1.0; // Half of diameterTop (2.0)
                    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
                    const angleFromVertical = Math.atan2(horizontalDistance, Math.abs(direction.y));
                    const extraLength = coneRadiusAtFloor * Math.tan(angleFromVertical);
                    const beamLength = centerDistanceToFloor + extraLength;
                    const endPoint = floorIntersection.clone();
                    
                    // CRITICAL: Position beam so narrow end is at fixture, wide end at floor
                    // Cylinder with height=1 extends from -0.5 to +0.5 in local Y
                    // When we scale.y = beamLength, it extends from -beamLength/2 to +beamLength/2
                    // So we position at the MIDDLE and rotate to point downward
                    
                    const startPoint = spot.basePos; // Fixture position (narrow end)
                    const midPoint = new BABYLON.Vector3(
                        (startPoint.x + endPoint.x) / 2,
                        (startPoint.y + endPoint.y) / 2,
                        (startPoint.z + endPoint.z) / 2
                    );
                    
                    // Position beam at midpoint
                    spot.beam.position.copyFrom(midPoint);
                    
                    // Scale to actual length - set full scaling vector
                    spot.beam.scaling.x = 1.0;
                    spot.beam.scaling.y = beamLength;
                    spot.beam.scaling.z = 1.0;
                    
                    // Rotate beam to point from start to end
                    // The cylinder's Y-axis should align with (endPoint - startPoint) direction
                    const beamDirection = endPoint.subtract(startPoint).normalize();
                    
                    // Create rotation from Y-axis (0,1,0) to beam direction
                    const yAxis = new BABYLON.Vector3(0, 1, 0);
                    const rotAxis = BABYLON.Vector3.Cross(yAxis, beamDirection);
                    const rotAngle = Math.acos(BABYLON.Vector3.Dot(yAxis, beamDirection));
                    
                    if (rotAxis.length() > 0.0001) {
                        spot.beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                            rotAxis.normalize(),
                            rotAngle
                        );
                    } else {
                        // Pointing straight up or down
                        if (beamDirection.y > 0) {
                            spot.beam.rotationQuaternion = BABYLON.Quaternion.Identity();
                        } else {
                            spot.beam.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(0, Math.PI, 0);
                        }
                    }
                    

                    
                    // Consistent beam size (no zoom variation)
                    const zoomFactor = 1.0; // Keep beams consistent size
                    spot.beam.scaling.x = zoomFactor;
                    spot.beam.scaling.z = zoomFactor;
                    
                    // UPDATE GLOW BEAM - Same position/rotation/scale as main beam
                    if (spot.beamGlow) {
                        spot.beamGlow.position.copyFrom(midPoint);
                        spot.beamGlow.scaling.x = zoomFactor;
                        spot.beamGlow.scaling.y = beamLength;
                        spot.beamGlow.scaling.z = zoomFactor;
                        
                        // Copy rotation
                        if (rotAxis.length() > 0.0001) {
                            spot.beamGlow.rotationQuaternion = BABYLON.Quaternion.RotationAxis(
                                rotAxis.normalize(),
                                rotAngle
                            );
                        } else {
                            if (beamDirection.y > 0) {
                                spot.beamGlow.rotationQuaternion = BABYLON.Quaternion.Identity();
                            } else {
                                spot.beamGlow.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(0, Math.PI, 0);
                            }
                        }
                        
                        spot.beamGlow.visibility = this.lightsActive ? 1.0 : 0;
                        spot.beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.15);
                    }
                    
                    // Beam visibility and color - HYPERREALISTIC with subtle variation
                    spot.beam.visibility = this.lightsActive ? 1.0 : 0;
                    
                    // Subtle atmospheric variation - simulates particles moving through beam
                    const atmosphericNoise = Math.sin(time * 3 + i * 0.5) * 0.1; // Subtle flicker
                    const audioReactivity = audioData.bass * 0.3;
                    
                    // Update emissive color with variation
                    const baseIntensity = 0.3 + atmosphericNoise + audioReactivity;
                    spot.beamMat.emissiveColor = this.currentSpotColor.scale(baseIntensity);
                    spot.beamMat.emissiveIntensity = 1.8 + audioData.bass * 0.5; // Boost for PBR material
                    
                    // Very subtle alpha variation - creates "depth" in the beam
                    spot.beamMat.alpha = 0.04 + Math.abs(atmosphericNoise) * 0.02;
                    

                    
                    // Update HYPERREALISTIC floor light splash - 3-layer gradient effect
                    if (spot.lightPool) {
                        if (this.lightsActive) {
                            // Calculate beam width at floor (cone: 0.25m → 2.0m)
                            const beamProgress = centerDistanceToFloor / beamLength;
                            const beamWidthAtFloor = 0.25 + 1.75 * beamProgress; // 1.75 = 2.0 - 0.25
                            const baseSize = (beamWidthAtFloor * 0.5) * zoomFactor;
                            
                            // Audio reactive effects
                            const audioPulse = 1.0 + audioData.bass * 0.3;
                            const atmosphericShimmer = 1.0 + Math.sin(time * 2 + i) * 0.1;
                            
                            // Reuse floor intersection point
                            const poolPosition = floorIntersection;
                            
                            // CORE (bright center hotspot)
                            poolPosition.y = 0.04;
                            spot.lightPoolCore.position.copyFrom(poolPosition);
                            const coreSize = baseSize * 0.3 * audioPulse;
                            spot.lightPoolCore.scaling.set(coreSize, coreSize, 1);
                            spot.lightPoolCore.visibility = 1.0;
                            spot.poolCoreMat.emissiveColor = this.currentSpotColor.scale(2.5 * audioPulse);
                            
                            // MID GLOW (medium gradient)
                            poolPosition.y = 0.03;
                            spot.lightPool.position.copyFrom(poolPosition);
                            const midSize = baseSize * 0.7 * atmosphericShimmer;
                            spot.lightPool.scaling.set(midSize, midSize, 1);
                            spot.lightPool.visibility = 0.9;
                            spot.poolMat.emissiveColor = this.currentSpotColor.scale(atmosphericShimmer);
                            
                            // OUTER GLOW (soft falloff)
                            poolPosition.y = 0.02;
                            spot.lightPoolGlow.position.copyFrom(poolPosition);
                            const glowSize = baseSize * 1.5 * atmosphericShimmer;
                            spot.lightPoolGlow.scaling.set(glowSize, glowSize, 1);
                            spot.lightPoolGlow.visibility = 0.7;
                            spot.poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.3);
                        } else {
                            // CRITICAL: Hide floor pools immediately when lights turn off
                            spot.lightPoolCore.visibility = 0;
                            spot.lightPool.visibility = 0;
                            spot.lightPoolGlow.visibility = 0;
                        }
                    }
                }
                
                // CRITICAL: Hide beams when lights are off (no beams without light source!)
                if (!this.lightsActive) {
                    if (spot.beam) spot.beam.visibility = 0;
                    if (spot.beamGlow) spot.beamGlow.visibility = 0;
                }
                
                // PROFESSIONAL AUDIO REACTIVE INTENSITY
                const baseIntensity = 18; // Professional moving head (300W equivalent)
                const volumePulse = audioData.average * 12; // Strong music reaction
                const bassPulse = audioData.bass * 8; // Heavy bass punch
                const smoothPulse = Math.sin(time * 2.5) * 3; // Smooth breathing
                
                // Dynamic strobe bursts on drops (every 8-12 seconds)
                let strobeMultiplier = 1.0;
                const strobePhase = (time * 0.12) % 1; // 0-1 over ~8.3s
                if (strobePhase < 0.05) {
                    strobeMultiplier = 1.8 + Math.sin(time * 30) * 0.4; // 200ms strobe burst
                }
                
                spot.light.intensity = this.lightsActive ? 
                    ((baseIntensity + volumePulse + bassPulse + smoothPulse) * strobeMultiplier) : 0;
            });
        } else if (this.spotlights) {
            // Turn off spotlights completely when not active
            this.spotlights.forEach(spot => {
                spot.light.intensity = 0;
                if (spot.beam) spot.beam.visibility = 0;
                if (spot.beamGlow) spot.beamGlow.visibility = 0;
                if (spot.lightPoolCore) spot.lightPoolCore.visibility = 0;
                if (spot.lightPool) spot.lightPool.visibility = 0;
                if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
            });
        }
        
        // Laser curtain show removed (was broken)
        
        // Update truss-mounted light fixtures - MATCH SPOTLIGHT COLOR
        // Update spotlight fixture lenses - make them VERY BRIGHT when active
        // These are the actual visible light sources in the moving heads
        if (this.spotlights && this.spotlights.length > 0) {
            this.spotlights.forEach((spot, i) => {
                if (spot.fixture) {
                    // Find corresponding lens from trussLights if available
                    const trussLight = this.trussLights && this.trussLights[i];
                    if (trussLight && trussLight.lensMat) {
                        if (this.lightsActive) {
                            // EXTREMELY BRIGHT lens when active - the actual light source
                            const pulse = 0.8 + Math.sin(time * 4 + i * 0.5) * 0.2; // 0.6-1.0
                            const audioPulse = 1.0 + audioData.bass * 0.5;
                            trussLight.lensMat.emissiveColor = this.currentSpotColor.scale(5.0 * pulse * audioPulse); // 5x brighter!
                            
                            // Update the bright inner light source sphere
                            if (trussLight.sourceMat) {
                                trussLight.sourceMat.emissiveColor = this.currentSpotColor.scale(8.0 * pulse * audioPulse); // Even brighter center
                            }
                        } else {
                            // Completely dark when off (no light without light source!)
                            trussLight.lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                            if (trussLight.sourceMat) {
                                trussLight.sourceMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                            }
                        }
                    }
                }
            });
        }
        
        // LED wall is now updated via this.updateLEDWall(time, audioData) which is called separately
        // with the new 26-pattern system including creative blackout shapes
        if (this.ledPanels && this.ledPanels.length > 0) {
            this.ledTime += 0.016;
        }
        
        // Update strobes - ALWAYS ACTIVE with variable intensity
        // Strobe lights animation
        if (this.strobes && this.strobes.length > 0) {
            this.strobes.forEach((strobe, i) => {
                // Handle ongoing flash
                if (strobe.flashDuration > 0) {
                    strobe.flashDuration -= 0.016;
                    
                    // Variable intensity - sometimes super bright, sometimes moderate
                    const intensityVariation = strobe.currentIntensity || 50; // Store current intensity
                    const burstPhase = Math.floor(strobe.flashDuration * 40) % 2; // Fast bursts
                    const intensity = burstPhase === 0 ? intensityVariation : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity);
                    strobe.light.intensity = intensity * 120; // Very bright
                    strobe.light.range = 50 + (intensityVariation * 0.5); // Wider range for brighter flashes
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        strobe.light.intensity = 0;
                        strobe.nextFlashTime = time + 0.1 + Math.random() * 0.9; // Frequent flashes (0.1-1.0s)
                    }
                } else {
                    // Check if it's time for next flash (ALWAYS fires, no condition)
                    if (time >= strobe.nextFlashTime) {
                        // Vary intensity: 60% chance medium (30-40), 40% chance super bright (50-70)
                        strobe.currentIntensity = Math.random() > 0.6 ? 
                            (30 + Math.random() * 10) : // Medium intensity
                            (50 + Math.random() * 20);  // Super bright
                        
                        strobe.flashDuration = 0.15 + Math.random() * 0.2; // Duration 0.15-0.35s
                    }
                }
            });
        }
        
        // Animate bartender cleaning glass
        if (this.bartender) {
            this.bartender.animationPhase += 0.03;
            
            // Circular wiping motion with right hand (cloth)
            const wipeRadius = 0.05;
            const wipeX = Math.cos(this.bartender.animationPhase * 3) * wipeRadius;
            const wipeZ = Math.sin(this.bartender.animationPhase * 3) * wipeRadius;
            
            this.bartender.rightHand.position.x = -9.5 + wipeX;
            this.bartender.rightHand.position.z = 4.5 + wipeZ;
            this.bartender.cloth.position.x = -9.5 + wipeX;
            this.bartender.cloth.position.z = 4.5 + wipeZ;
            
            // Slight arm rotation for wiping
            this.bartender.rightForearm.rotation.z = -Math.PI / 4 + Math.sin(this.bartender.animationPhase * 3) * 0.2;
            
            // Left hand holds glass steady with slight rotation
            const glassRotation = Math.sin(this.bartender.animationPhase * 2) * 0.3;
            this.bartender.glass.rotation.z = glassRotation;
            this.bartender.leftForearm.rotation.z = Math.PI / 4 + Math.sin(this.bartender.animationPhase) * 0.1;
            
            // Occasionally look around (head movement simulation through glass position)
            if (Math.floor(this.bartender.animationPhase) % 10 === 0) {
                // Could add head turning animation here if we stored head reference
            }
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
        
        // BEAT DETECTION: Auto-detect BPM from music or use 130 BPM fallback
        let beatDetected = false;
        
        // If music playing: detect beats from bass peaks
        if (audioData.hasAudio && audioData.bass > this.beatThreshold && audioData.bass > this.lastBassLevel * 1.3) {
            // Bass spike detected = beat!
            if (time - this.lastBeat > 0.2) { // Prevent double-triggering (max 300 BPM)
                beatDetected = true;
                this.lastBeat = time;
                
                // Track beat time for BPM calculation
                this.beatHistory.push(time);
                if (this.beatHistory.length > this.maxBeatHistory) {
                    this.beatHistory.shift(); // Keep only recent beats
                }
                
                // Calculate BPM from beat intervals (every 2 seconds)
                if (this.beatHistory.length >= 4 && time - this.lastBPMUpdate > 2) {
                    const intervals = [];
                    for (let i = 1; i < this.beatHistory.length; i++) {
                        intervals.push(this.beatHistory[i] - this.beatHistory[i-1]);
                    }
                    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
                    this.detectedBPM = Math.round(60 / avgInterval);
                    
                    // Clamp to realistic range (60-200 BPM)
                    this.detectedBPM = Math.max(60, Math.min(200, this.detectedBPM));
                    this.bpm = this.detectedBPM;
                    this.beatInterval = 60 / this.bpm;
                    this.lastBPMUpdate = time;
                    
                    console.log(`🎵 Detected BPM: ${this.bpm}`);
                }
            }
        }
        
        // Fallback: If no audio or no beats detected, sync to current BPM timing
        if (!beatDetected && time - this.lastBeat > this.beatInterval) {
            beatDetected = true;
            this.lastBeat = time;
            
            // If no audio, reset to 130 BPM
            if (!audioData.hasAudio && this.bpm !== 130) {
                this.bpm = 130;
                this.beatInterval = 60 / 130;
                this.beatHistory = [];
                console.log('🎵 No audio - using default 130 BPM');
            }
        }
        
        this.lastBassLevel = audioData.bass;
        
        // Change pattern more frequently - especially without audio for energy
        // With audio: every 4 beats (~1.8s), Without audio: every 2 seconds
        const beatsPerPattern = audioData.hasAudio ? 4 : 4; // Reduced from 8 to 4
        const patternChangeTime = audioData.hasAudio 
            ? this.beatInterval * beatsPerPattern 
            : 2.0; // Fast 2-second changes without audio
        
        if (time - this.ledPatternSwitchTime > patternChangeTime) {
            this.ledPattern = (this.ledPattern + 1) % patterns.length;
            this.ledPatternSwitchTime = time;
        }
        
        // Change color more frequently too
        // With audio: every 8 beats (~3.7s), Without audio: every 4 seconds
        const beatsPerColor = audioData.hasAudio ? 8 : 8; // Reduced from 16 to 8
        const colorChangeTime = audioData.hasAudio 
            ? this.beatInterval * beatsPerColor 
            : 4.0; // 4-second color changes without audio
        
        if (time - this.lastColorChange > colorChangeTime || this.lastColorChange === -1) {
            this.ledColorIndex = (this.ledColorIndex + 1) % colors.length;
            this.lastColorChange = time;
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
                average: 0,
                hasAudio: false
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
        
        // Check if audio is actually playing
        const hasAudio = average > 0.01;
        
        return { bass, mid, treble, average, hasAudio };
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
