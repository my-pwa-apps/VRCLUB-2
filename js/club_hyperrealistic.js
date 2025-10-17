// VR Club - HYPERREALISTIC Babylon.js Implementation
// Ultra-realistic club environment for Quest 3S VR

// Room dimensions and boundaries
const ROOM_BOUNDS = {
    x: { min: -15, max: 15, width: 30 },
    y: { min: 0, max: 8, height: 8 },
    z: { min: -26, max: 2, depth: 28 }
};

// Key positions in the club
const CLUB_POSITIONS = {
    djBooth: { x: 0, y: 0.95, z: -23 },
    danceFloor: { x: 0, y: 0, z: -12 },
    entrance: { x: 0, y: 0, z: 0 },
    mirrorBall: { x: 0, y: 6.5, z: -12 },
    paSpeakers: {
        left: { x: -7, y: 0, z: -25 },
        right: { x: 7, y: 0, z: -25 }
    }
};

class VRClub {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.engine = new BABYLON.Engine(this.canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true,
            antialias: true
        });
        
        // VR optimization settings configuration
        this.vrSettings = {
            desktop: {
                exposure: 1.0,
                contrast: 1.2,
                bloomWeight: 0.2, // Reduced from 0.6 to minimize haze
                bloomThreshold: 0.6, // Increased from 0.3 to reduce bloom spread
                bloomScale: 0.3, // Reduced from 0.6 to minimize haze
                glowIntensity: 0.7,
                ambientIntensity: 0.15,
                environmentIntensity: 0.3,
                clearColor: new BABYLON.Color3(0.01, 0.01, 0.02),
                grainEnabled: false, // Disabled - causes hazy appearance
                chromaticAberrationEnabled: false, // Disabled - causes hazy color fringing
                toneMappingEnabled: true,
                fxaaEnabled: true
            },
            vr: {
                exposure: 0.65,
                contrast: 1.6,
                bloomWeight: 0.15,
                bloomThreshold: 0.8,
                bloomScale: 0.3,
                glowIntensity: 0.4,
                ambientIntensity: 0.08,
                environmentIntensity: 0.1,
                clearColor: new BABYLON.Color3(0, 0, 0),
                grainEnabled: false,
                chromaticAberrationEnabled: false,
                toneMappingEnabled: false,
                edgeSharpness: 0.6,
                colorSharpness: 0.8,
                fxaaEnabled: true  // Enable FXAA for smooth edges in VR
            }
        };
        
        // Detect device capabilities for optimal light count
        this.maxLights = this.detectMaxLights();
        console.log(`🎮 Device detected - Max lights per material: ${this.maxLights}`);
        
        // Initialize material factory for centralized material creation
        this.materialFactory = new MaterialFactory(null, this.maxLights); // Scene set later in init()
        
        // Initialize light factory for centralized light creation
        this.lightFactory = null; // Initialized after scene creation
        
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
        
        // Initialize spotlight color EARLY (needed for fixture creation)
        this.spotColorList = [
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
        this.currentSpotColor = this.spotColorList[0]; // Start with RED
        this.spotColorIndex = 0;
        this.lastColorChange = 0;
        
        // Initialize VJ control buttons array (populated in createDJBooth)
        this.vjControlButtons = [];
        
        // Initialize lighting control state
        this.lightsActive = true;
        this.lasersActive = false;
        this.ledWallActive = true;
        this.strobesActive = true;
        this.mirrorBallActive = false; // Mirror ball effect (turns off all other lights)
        
        // Spotlight pattern and speed controls
        this.spotlightPattern = 1; // 0=random, 1=static down (DEFAULT), 2=synchronized sweep
        this.spotlightSpeed = 1.0; // Speed multiplier (0.5x to 3.0x)
        
        // Mirror ball spotlight color (configurable)
        this.mirrorBallSpotlightColor = new BABYLON.Color3(1, 1, 1); // Default: pure white
        this.mirrorBallColorIndex = 0;
        this.mirrorBallColors = [
            new BABYLON.Color3(1, 1, 1),      // White (classic)
            new BABYLON.Color3(1, 0.3, 0.3),  // Red
            new BABYLON.Color3(0.3, 0.3, 1),  // Blue
            new BABYLON.Color3(0.3, 1, 0.3),  // Green
            new BABYLON.Color3(1, 0.3, 1),    // Magenta
            new BABYLON.Color3(1, 1, 0.3),    // Yellow
            new BABYLON.Color3(0.3, 1, 1),    // Cyan
            new BABYLON.Color3(1, 0.6, 0.3),  // Orange
            new BABYLON.Color3(0.7, 0.3, 1)   // Purple
        ];
        
        // Spotlight mode: 0=strobe+sweep, 1=sweep only, 2=strobe static, 3=static
        this.spotlightMode = 0;
        this.spotStrobeActive = true; // Simple strobe toggle (true = strobe on)
        
        // VJ manual control tracking - pause automated patterns when VJ interacts
        this.lastVJInteraction = 0;
        this.vjManualMode = false;
        this.VJ_TIMEOUT = 300; // Seconds before resuming automated patterns (5 minutes)
        
        this.init();
    }

    applyVRSettings(xrCamera) {
        const vr = this.vrSettings.vr;
        
        // Apply post-processing to VR camera
        if (this.renderPipeline) {
            this.renderPipeline.addCamera(xrCamera);
            this.renderPipeline.sharpen.edgeAmount = vr.edgeSharpness;
            this.renderPipeline.sharpen.colorAmount = vr.colorSharpness;
            this.renderPipeline.grainEnabled = vr.grainEnabled;
            this.renderPipeline.chromaticAberrationEnabled = vr.chromaticAberrationEnabled;
            this.renderPipeline.fxaaEnabled = vr.fxaaEnabled;  // Enable FXAA anti-aliasing
            
            if (this.renderPipeline.imageProcessing) {
                this.renderPipeline.imageProcessing.exposure = vr.exposure;
                this.renderPipeline.imageProcessing.contrast = vr.contrast;
                this.renderPipeline.imageProcessing.toneMappingEnabled = vr.toneMappingEnabled;
            }
            
            if (this.renderPipeline.bloomEnabled) {
                this.renderPipeline.bloomWeight = vr.bloomWeight;
                this.renderPipeline.bloomThreshold = vr.bloomThreshold;
                this.renderPipeline.bloomScale = vr.bloomScale;
            }
        }
        
        // Apply scene settings
        if (this.glowLayer) this.glowLayer.intensity = vr.glowIntensity;
        
        const ambient = this.scene.getLightByName('ambient');
        if (ambient) ambient.intensity = vr.ambientIntensity;
        
        this.scene.environmentIntensity = vr.environmentIntensity;
        this.scene.clearColor = vr.clearColor;
    }
    
    applyDesktopSettings() {
        const desktop = this.vrSettings.desktop;
        
        // Restore post-processing
        if (this.renderPipeline) {
            this.renderPipeline.grainEnabled = desktop.grainEnabled;
            this.renderPipeline.chromaticAberrationEnabled = desktop.chromaticAberrationEnabled;
            this.renderPipeline.fxaaEnabled = desktop.fxaaEnabled;  // Restore FXAA anti-aliasing
            
            if (this.renderPipeline.imageProcessing) {
                this.renderPipeline.imageProcessing.exposure = desktop.exposure;
                this.renderPipeline.imageProcessing.contrast = desktop.contrast;
                this.renderPipeline.imageProcessing.toneMappingEnabled = desktop.toneMappingEnabled;
            }
            
            if (this.renderPipeline.bloomEnabled) {
                this.renderPipeline.bloomWeight = desktop.bloomWeight;
                this.renderPipeline.bloomThreshold = desktop.bloomThreshold;
                this.renderPipeline.bloomScale = desktop.bloomScale;
            }
        }
        
        // Restore scene settings
        if (this.glowLayer) this.glowLayer.intensity = desktop.glowIntensity;
        
        const ambient = this.scene.getLightByName('ambient');
        if (ambient) ambient.intensity = desktop.ambientIntensity;
        
        this.scene.environmentIntensity = desktop.environmentIntensity;
        this.scene.clearColor = desktop.clearColor;
    }

    detectMaxLights() {
        // Detect device type and GPU capabilities
        const ua = navigator.userAgent.toLowerCase();
        const isQuest = ua.includes('quest') || ua.includes('oculus');
        const isMobile = /android|iphone|ipad|mobile/i.test(ua);
        
        // PBR materials use many uniform buffers, so we need to limit lights
        // to avoid exceeding GL_MAX_VERTEX_UNIFORM_BUFFERS
        // With loaded 3D models (which have their own PBR materials), we need even lower limits
        // CRITICAL: With mirror ball system, we need ultra-conservative limits
        if (isQuest) {
            console.log('🥽 Quest VR headset detected - using optimized light count');
            return 4; // Quest 3S - reduced from 6 for mirror ball compatibility
        } else if (isMobile) {
            console.log('📱 Mobile device detected - using reduced light count');
            return 3; // Mobile devices - ultra-conservative for PBR + 3D models
        } else {
            console.log('💻 Desktop/laptop detected - using safe light count for PBR materials');
            return 3; // Ultra-safe limit for PBR materials + loaded 3D models + mirror ball (reduced from 4)
        }
    }

    async init() {
        // Create scene with hyperrealistic atmosphere
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.01, 0.01, 0.02); // Very dark club atmosphere
        
        // Set scene reference in material factory
        this.materialFactory.scene = this.scene;
        
        // Initialize light factory
        this.lightFactory = new LightFactory(this.scene);
        
        // Load environment for PBR reflections
        this.scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://assets.babylonjs.com/environments/environmentSpecular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.3; // Subtle reflections
        
        // Initialize texture loader and load textures from CDN (cached for subsequent loads)
        console.log('🎨 Loading wooden floor and concrete textures from Polyhaven CDN...');
        this.textureLoader = new TextureLoader(this.scene);
        await this.textureLoader.init();
        
        try {
            this.concreteTextures = await this.textureLoader.loadAllTextures();
            console.log('✅ All textures loaded and cached');
        } catch (error) {
            console.warn('⚠️ Failed to load some textures, using fallback materials:', error);
            this.concreteTextures = null; // Will use procedural materials as fallback
        }
        
        // Initialize model loader for DJ equipment and PA speakers
        console.log('🎸 Initializing 3D model loader...');
        this.modelLoader = new ModelLoader(this.scene);
        await this.modelLoader.init();
        
        // Load all models in the background (they'll load asynchronously)
        console.log('📦 Loading DJ equipment and PA speaker models...');
        this.modelLoader.loadAllModels().then(() => {
            console.log('✅ All 3D models loaded successfully');
        }).catch(error => {
            console.warn('⚠️ Some models failed to load, using procedural fallbacks:', error);
        });
        
        // Setup camera for post-processing pipeline
        this.camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(-12, 6, -12), this.scene);
        this.camera.setTarget(new BABYLON.Vector3(0, 2, -15));
        this.camera.attachControl(this.canvas, true);
        this.camera.speed = 0.3; // Realistic walking speed
        this.camera.applyGravity = false; // No gravity for easier navigation
        this.camera.checkCollisions = true; // Enable collision detection with invisible walls
        this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5); // Collision bounding box (human-sized)
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
        this.glowLayer.intensity = 0.7; // Increased from 0.5 for better visibility
        
        // Add post-processing for cinematic realism
        this.addPostProcessing();
        
        // Build hyperrealistic club (need floor first for VR setup)
        this.createFloor();
        
        // Enable VR with teleportation on floor - optimized for Quest 3S
        const vrHelper = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: [this.floorMesh],
            optionalFeatures: true
        }).catch(err => {
            // VR not available - continue with desktop mode
            return null;
        });
        
        // Configure VR rendering for better quality
        if (vrHelper && vrHelper.baseExperience) {
            // Optimize rendering for VR (applies immediately)
            this.scene.autoClear = false; // Better performance
            this.scene.autoClearDepthAndStencil = true; // Proper depth handling
            
            // Set render state ONLY when XR session is active (not during initialization)
            // This will be configured when user enters VR via onStateChangedObservable
        }
        
        // Store VR helper for later use
        this.vrHelper = vrHelper;
        
        // Set VR starting position at DJ booth when entering VR
        if (vrHelper) {
            vrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    // Position user at DJ booth in VR mode
                    const xrCamera = vrHelper.baseExperience.camera;
                    if (xrCamera) {
                        xrCamera.position = new BABYLON.Vector3(0, 0, -20);
                        
                        // Configure depth range for better VR rendering (now that session is active)
                        if (vrHelper.baseExperience.sessionManager && vrHelper.baseExperience.sessionManager.session) {
                            vrHelper.baseExperience.sessionManager.updateRenderStateAsync({
                                depthNear: 0.1,
                                depthFar: 150
                            }).catch(err => {
                                console.warn('Could not update render state:', err);
                            });
                        }
                        
                        // Apply VR-optimized settings
                        this.applyVRSettings(xrCamera);
                        console.log('🥽 VR mode activated with optimized settings');
                    }
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    // Restore desktop settings
                    this.applyDesktopSettings();
                    console.log('🖥️ Desktop mode restored');
                }
            });
        }
        
        // Continue building club
        this.createWalls();
        this.createCollisionBoundaries(); // Add invisible collision walls
        this.createCeiling();
        this.createDJBooth();
        this.createPASpeakers();
        this.createLEDWall();
        this.createLasers();
        this.createLights();
        this.createTrussMountedLights();
        this.createMirrorBall(); // Add disco/mirror ball with spotlight
        
        // VOLUMETRIC FOG SYSTEM - DISABLED for performance (can re-enable later)
        // this.createVolumetricFog();
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        this.setupVJControlInteraction(); // Add VJ control button clicks
        
        // Start render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
            this.updateAnimations();
            this.updatePerformanceMonitor();
        });
        
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
        
        // Prevent default drag and drop behavior on the page (except in our audio UI)
        window.addEventListener('dragover', (e) => {
            // Only prevent if not in our audio input
            if (!e.target.id || e.target.id !== 'audioUrlInput') {
                e.preventDefault();
                e.dataTransfer.effectAllowed = 'none';
                e.dataTransfer.dropEffect = 'none';
            }
        }, false);
        
        window.addEventListener('drop', (e) => {
            // Only prevent if not in our audio input
            if (!e.target.id || e.target.id !== 'audioUrlInput') {
                e.preventDefault();
                e.stopPropagation();
            }
        }, false);
    }

    addPostProcessing() {
        // Create rendering pipeline for cinematic effects
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true,
            this.scene,
            [this.camera]
        );
        
        // FXAA anti-aliasing for smooth edges
        pipeline.fxaaEnabled = true;
        
        // Bloom for glowing lights - enhanced for better visibility
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.3; // Lower threshold to catch more lights
        pipeline.bloomWeight = 0.6; // Increased from 0.4 for stronger bloom
        pipeline.bloomKernel = 64;
        pipeline.bloomScale = 0.6; // Increased from 0.5
        
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
        
        // Fog appearance - ultra-subtle atmospheric haze (not visible particles)
        danceFloorFog.color1 = new BABYLON.Color4(0.85, 0.85, 0.92, 0.03); // Very low alpha
        danceFloorFog.color2 = new BABYLON.Color4(0.65, 0.65, 0.75, 0.02); // Very low alpha
        danceFloorFog.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0);
        
        // LARGE particles for haze effect (not visible as individual balls)
        danceFloorFog.minSize = 8.0;  // Much larger - creates soft haze
        danceFloorFog.maxSize = 15.0; // Very large - blends into atmosphere
        danceFloorFog.minLifeTime = 20; // Long lifetime
        danceFloorFog.maxLifeTime = 40; // Very long - particles hang in air
        danceFloorFog.emitRate = 20; // Fewer particles
        
        // MINIMAL movement - haze hangs in air, barely drifts
        danceFloorFog.direction1 = new BABYLON.Vector3(-0.05, 0.01, -0.02);
        danceFloorFog.direction2 = new BABYLON.Vector3(0.05, 0.02, 0.02);
        danceFloorFog.minEmitPower = 0.01; // Almost no power
        danceFloorFog.maxEmitPower = 0.03; // Very gentle
        danceFloorFog.updateSpeed = 0.002; // Extremely slow - nearly static
        
        // Minimal turbulence - haze should be stable, not swirling
        danceFloorFog.noiseTexture = new BABYLON.NoiseProceduralTexture("fogNoise", 256, this.scene);
        danceFloorFog.noiseStrength = new BABYLON.Vector3(0.1, 0.05, 0.1); // Very subtle
        
        // Blending for soft atmospheric haze
        danceFloorFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - Make fog particles receive light from scene
        // Color gradients for soft fade (lower alpha values)
        danceFloorFog.addColorGradient(0, new BABYLON.Color4(0.85, 0.85, 0.92, 0.03));
        danceFloorFog.addColorGradient(0.5, new BABYLON.Color4(0.75, 0.75, 0.85, 0.02));
        danceFloorFog.addColorGradient(1.0, new BABYLON.Color4(0.5, 0.5, 0.6, 0));
        
        danceFloorFog.start();
        this.fogSystems.push(danceFloorFog);
        
        // Upper atmosphere fog (ultra-light, barely visible)
        const upperFog = new BABYLON.ParticleSystem("upperFog", 800, this.scene);
        upperFog.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        upperFog.emitter = new BABYLON.Vector3(0, 5, -12); // Mid-height
        upperFog.minEmitBox = new BABYLON.Vector3(-14, -1.5, -14);
        upperFog.maxEmitBox = new BABYLON.Vector3(14, 1.5, 14);
        
        // Ultra-light atmospheric haze (barely visible)
        upperFog.color1 = new BABYLON.Color4(0.72, 0.72, 0.8, 0.02); // Extremely low alpha
        upperFog.color2 = new BABYLON.Color4(0.55, 0.55, 0.65, 0.01); // Nearly invisible
        upperFog.colorDead = new BABYLON.Color4(0.4, 0.4, 0.5, 0);
        
        // HUGE particles for soft atmospheric haze
        upperFog.minSize = 10.0;  // Very large
        upperFog.maxSize = 20.0;  // Massive - creates soft haze layer
        upperFog.minLifeTime = 30; // Very long lifetime
        upperFog.maxLifeTime = 60; // Hangs in air
        upperFog.emitRate = 12;    // Very few particles
        
        // BARELY any movement - static atmospheric layer
        upperFog.direction1 = new BABYLON.Vector3(-0.02, -0.01, -0.01);
        upperFog.direction2 = new BABYLON.Vector3(0.02, 0.01, 0.01);
        upperFog.minEmitPower = 0.005; // Almost stationary
        upperFog.maxEmitPower = 0.02;  // Very gentle
        upperFog.updateSpeed = 0.001;  // Nearly frozen
        
        // Minimal turbulence - stable atmospheric layer
        upperFog.noiseTexture = new BABYLON.NoiseProceduralTexture("upperFogNoise", 256, this.scene);
        upperFog.noiseStrength = new BABYLON.Vector3(0.05, 0.02, 0.05); // Almost none
        
        upperFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - Upper fog catches colored light from spotlights
        upperFog.addColorGradient(0, new BABYLON.Color4(0.72, 0.72, 0.8, 0.02));
        upperFog.addColorGradient(0.5, new BABYLON.Color4(0.62, 0.62, 0.72, 0.01));
        upperFog.addColorGradient(1.0, new BABYLON.Color4(0.4, 0.4, 0.5, 0));
        
        upperFog.start();
        this.fogSystems.push(upperFog);
        
        // DJ Booth fog machine effect (realistic bursts)
        const djFog = new BABYLON.ParticleSystem("djFog", 600, this.scene);
        djFog.particleTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
        djFog.emitter = new BABYLON.Vector3(0, 0.8, -24); // DJ booth area, lower
        djFog.minEmitBox = new BABYLON.Vector3(-3.5, 0, -0.5);
        djFog.maxEmitBox = new BABYLON.Vector3(3.5, 0.3, 0.5);
        
        // Subtle atmospheric haze from DJ area
        djFog.color1 = new BABYLON.Color4(0.88, 0.88, 0.98, 0.04); // Very low alpha
        djFog.color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.02);   // Very low alpha
        djFog.colorDead = new BABYLON.Color4(0.5, 0.5, 0.6, 0);
        
        // LARGE particles for haze (not visible fog plume)
        djFog.minSize = 6.0;  // Larger
        djFog.maxSize = 12.0; // Much larger - creates haze
        djFog.minLifeTime = 20; // Longer lifetime
        djFog.maxLifeTime = 40; // Hangs around
        djFog.emitRate = 15;    // Fewer particles
        
        // GENTLE spread - haze drifts slowly, not billowing
        djFog.direction1 = new BABYLON.Vector3(-0.2, 0.05, 0.5);
        djFog.direction2 = new BABYLON.Vector3(0.2, 0.1, 1.0);
        djFog.minEmitPower = 0.05; // Very gentle
        djFog.maxEmitPower = 0.15; // Slow drift
        djFog.updateSpeed = 0.003; // Very slow
        
        // Minimal turbulence - stable haze
        djFog.noiseTexture = new BABYLON.NoiseProceduralTexture("djFogNoise", 256, this.scene);
        djFog.noiseStrength = new BABYLON.Vector3(0.1, 0.05, 0.1); // Very subtle
        
        // Slight gravity - haze settles gently
        djFog.gravity = new BABYLON.Vector3(0, -0.05, 0);
        
        djFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // LIGHT INTERACTION - DJ fog catches colored light beams
        djFog.addColorGradient(0, new BABYLON.Color4(0.88, 0.88, 0.98, 0.04));
        djFog.addColorGradient(0.5, new BABYLON.Color4(0.78, 0.78, 0.88, 0.02));
        djFog.addColorGradient(1.0, new BABYLON.Color4(0.5, 0.5, 0.6, 0));
        
        djFog.start();
        this.fogSystems.push(djFog);
        
        // Scene fog DISABLED - was causing screendoor effect in VR
        // Particle systems provide enough atmospheric haze
        this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
        this.scene.fogDensity = 0;
        this.scene.fogColor = new BABYLON.Color3(0, 0, 0);
        
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
        
        // Wooden floor panels with PBR - dark nightclub aesthetic
        const floorMat = this.materialFactory.getPreset('floor');
        
        // Apply downloaded wood textures if available
        if (this.concreteTextures && this.concreteTextures.floor) {
            console.log('🎨 Applying floor textures (Polyhaven - Worn Wood Floor)');
            this.textureLoader.applyTexturesToMaterial(floorMat, this.concreteTextures.floor);
            // Darken wooden floor for nightclub atmosphere
            floorMat.baseColor = new BABYLON.Color3(0.3, 0.25, 0.2); // Dark brown tint
        } else {
            // Fallback to procedural noise texture
            console.log('🎨 Using procedural floor texture (fallback)');
            const noiseTexture = new BABYLON.NoiseProceduralTexture("floorNoise", 512, this.scene);
            noiseTexture.octaves = 4;
            noiseTexture.persistence = 0.8;
            noiseTexture.animationSpeedFactor = 0; // Static texture
            floorMat.bumpTexture = noiseTexture;
            floorMat.bumpTexture.level = 0.3; // Subtle bump
            floorMat.baseColor = new BABYLON.Color3(0.25, 0.2, 0.15); // Dark wood
        }
        
        // Wood floor properties
        floorMat.metallic = 0.0; // Wood is non-metallic
        floorMat.roughness = 0.7; // Slightly worn wood
        floorMat.environmentIntensity = 0.15; // Subtle reflections from polish
        
        floor.material = floorMat;
        floor.receiveShadows = true;
    }

    createWalls() {
        // PBR material for walls
        const wallMat = this.materialFactory.getPreset('wall');
        
        // Apply downloaded concrete wall textures if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            console.log('🎨 Applying wall textures (Polyhaven - Industrial Concrete)');
            this.textureLoader.applyTexturesToMaterial(wallMat, this.concreteTextures.walls);
        }
        
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
        const brickMat = this.materialFactory.getPreset('brick');
        
        // Concrete pillar material
        const pillarMat = this.materialFactory.getPreset('pillar');
        
        // Metal pipe material
        const pipeMat = this.materialFactory.getPreset('pipe');
        
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

    createCollisionBoundaries() {
        // Create invisible collision walls to prevent walking through geometry
        // These use Babylon.js collision system for camera
        
        const collisionMat = new BABYLON.StandardMaterial("collisionMat", this.scene);
        collisionMat.alpha = 0; // Completely invisible
        
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
            { width: 10, height: 4, depth: 0.5, 
              pos: new BABYLON.Vector3(-12, 2, ROOM_BOUNDS.z.max) },
            { width: 10, height: 4, depth: 0.5, 
              pos: new BABYLON.Vector3(12, 2, ROOM_BOUNDS.z.max) },
            
            // DJ Booth protection area (prevent walking through equipment)
            { width: 8, height: 2, depth: 0.5, 
              pos: new BABYLON.Vector3(0, 1, -23.8) }, // Front of DJ booth
            { width: 0.5, height: 2, depth: 2, 
              pos: new BABYLON.Vector3(-4.5, 1, -23) }, // Left side
            { width: 0.5, height: 2, depth: 2, 
              pos: new BABYLON.Vector3(4.5, 1, -23) }, // Right side
            
            // PA Speaker protection (left stack)
            { width: 3, height: 6, depth: 2, 
              pos: new BABYLON.Vector3(-7, 3, -25) },
            // PA Speaker protection (right stack)
            { width: 3, height: 6, depth: 2, 
              pos: new BABYLON.Vector3(7, 3, -25) }
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
        
        console.log("✅ Created invisible collision boundaries around room and DJ booth");
    }

    createCeiling() {
        const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
            width: 35,
            height: 0.3,
            depth: 45
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, 10, -10);
        
        // Industrial concrete/metal ceiling
        const ceilingMat = this.materialFactory.getPreset('ceiling');
        
        // Apply downloaded concrete ceiling textures if available
        if (this.concreteTextures && this.concreteTextures.ceiling) {
            console.log('🎨 Applying ceiling textures (Polyhaven - Raw Concrete)');
            this.textureLoader.applyTexturesToMaterial(ceilingMat, this.concreteTextures.ceiling);
        }
        
        ceiling.material = ceilingMat;
        
        // Add lighting truss above dance floor
        this.createLightingTruss();
    }

    createLightingTruss() {
        // Professional stage truss material - metallic aluminum
        const trussMat = this.materialFactory.getPreset('truss');
        
        // Darker material for diagonal bracing
        const braceMat = this.materialFactory.getPreset('brace');
        
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
        // === HYPERREALISTIC INTEGRATED DJ/VJ BOOTH ===
        // Positioned at BACK of club (z=-24)
        // DJ faces DANCE FLOOR (toward positive z direction)
        
        console.log("🎛️ Creating integrated DJ/VJ booth...");
        
        // === RAISED PLATFORM (STAGE) ===
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 10,
            height: 0.5,
            depth: 4
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.25, -24);
        
        const platformMat = this.materialFactory.getPreset('platform');
        platform.material = platformMat;
        platform.receiveShadows = true;
        
        // Anti-slip surface
        const platformTop = BABYLON.MeshBuilder.CreateBox("djPlatformTop", {
            width: 10,
            height: 0.02,
            depth: 4
        }, this.scene);
        platformTop.position = new BABYLON.Vector3(0, 0.51, -24);
        
        const topMat = this.materialFactory.getPreset('platformTop');
        platformTop.material = topMat;
        platformTop.receiveShadows = true;
        
        // Front safety rail
        const railMat = this.materialFactory.getPreset('rail');
        
        const frontRail = BABYLON.MeshBuilder.CreateBox("frontRail", {
            width: 9,
            height: 0.08,
            depth: 0.08
        }, this.scene);
        frontRail.position = new BABYLON.Vector3(0, 0.8, -22);
        frontRail.material = railMat;
        
        // === DJ EQUIPMENT TABLE (CENTER) ===
        const djTable = BABYLON.MeshBuilder.CreateBox("djTable", {
            width: 5,
            height: 0.08,
            depth: 1.5
        }, this.scene);
        djTable.position = new BABYLON.Vector3(0, 0.8, -23);
        
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
        leftCDJ.position = new BABYLON.Vector3(-1.5, 0.89, -23);
        leftCDJ.material = cdjMat;
        
        // Left jog wheel (glowing)
        const leftJog = BABYLON.MeshBuilder.CreateCylinder("leftJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        leftJog.position = new BABYLON.Vector3(-1.5, 0.96, -23);
        const jogMat = this.materialFactory.getPreset('jogWheel');
        leftJog.material = jogMat;
        
        // Right CDJ
        const rightCDJ = BABYLON.MeshBuilder.CreateBox("rightCDJ", {
            width: 1.2,
            height: 0.1,
            depth: 1.0
        }, this.scene);
        rightCDJ.position = new BABYLON.Vector3(1.5, 0.89, -23);
        rightCDJ.material = cdjMat;
        
        // Right jog wheel
        const rightJog = BABYLON.MeshBuilder.CreateCylinder("rightJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        rightJog.position = new BABYLON.Vector3(1.5, 0.96, -23);
        rightJog.material = jogMat.clone("rightJogMat");
        
        // === DJ MIXER (CENTER) ===
        const mixer = BABYLON.MeshBuilder.CreateBox("mixer", {
            width: 1.8,
            height: 0.12,
            depth: 0.9
        }, this.scene);
        mixer.position = new BABYLON.Vector3(0, 0.89, -23);
        mixer.material = cdjMat; // Reuse CDJ material for mixer body
        
        // Mixer display (facing DJ)
        const mixerDisplay = BABYLON.MeshBuilder.CreatePlane("mixerDisplay", {
            width: 1.2,
            height: 0.2
        }, this.scene);
        mixerDisplay.position = new BABYLON.Vector3(0, 0.98, -23.5);
        mixerDisplay.rotation.x = Math.PI / 6;
        const displayMat = new BABYLON.StandardMaterial("mixerDisplayMat", this.scene);
        displayMat.emissiveColor = new BABYLON.Color3(0, 1, 0.5);
        displayMat.disableLighting = true;
        mixerDisplay.material = displayMat;
        
        // === AUDIO STREAM CONTROL BUTTON ===
        const audioBtn = BABYLON.MeshBuilder.CreateBox("audioStreamBtn", {
            width: 0.4,
            height: 0.08,
            depth: 0.25
        }, this.scene);
        audioBtn.position = new BABYLON.Vector3(0, 0.96, -22.5);
        audioBtn.isPickable = true;
        
        const audioBtnMat = new BABYLON.StandardMaterial("audioBtnMat", this.scene);
        audioBtnMat.emissiveColor = new BABYLON.Color3(0, 0.8, 0);
        audioBtnMat.disableLighting = true;
        audioBtn.material = audioBtnMat;
        
        // Label (removed diagonal plane - was confusing)
        
        // Store for interaction
        this.audioStreamButton = {
            mesh: audioBtn,
            material: audioBtnMat,
            isPlaying: false
        };
        
        // === MONITOR SPEAKERS (behind table, facing DJ) ===
        const monitorMat = new BABYLON.PBRMetallicRoughnessMaterial("monitorMat", this.scene);
        monitorMat.baseColor = new BABYLON.Color3(0.03, 0.03, 0.03);
        monitorMat.metallic = 0.2;
        monitorMat.roughness = 0.8;
        
        const leftMonitor = BABYLON.MeshBuilder.CreateBox("leftMonitor", {
            width: 0.4,
            height: 0.6,
            depth: 0.35
        }, this.scene);
        leftMonitor.position = new BABYLON.Vector3(-2.3, 0.85, -23.8);
        leftMonitor.material = monitorMat;
        
        const rightMonitor = BABYLON.MeshBuilder.CreateBox("rightMonitor", {
            width: 0.4,
            height: 0.6,
            depth: 0.35
        }, this.scene);
        rightMonitor.position = new BABYLON.Vector3(2.3, 0.85, -23.8);
        rightMonitor.material = monitorMat;
        
        // === VJ LIGHTING CONTROL CONSOLE (RIGHT SIDE) ===
        const vjConsole = BABYLON.MeshBuilder.CreateBox("vjConsole", {
            width: 2.5,
            height: 0.15,
            depth: 2.0 // Extended to fit 3 rows
        }, this.scene);
        vjConsole.position = new BABYLON.Vector3(3.5, 0.8, -24.4); // Moved back to center
        vjConsole.material = tableMat;
        
        // VJ Console label removed - buttons are self-explanatory by color
        
        // === VJ CONTROL BUTTONS ===
        const toggleButtons = [
            { 
                label: "SPOTS", 
                control: "lightsActive",
                onColor: new BABYLON.Color3(1, 0.5, 0),
                offColor: new BABYLON.Color3(0.2, 0.1, 0),
                x: 2.8
            },
            { 
                label: "LASERS", 
                control: "lasersActive",
                onColor: new BABYLON.Color3(1, 0, 0),
                offColor: new BABYLON.Color3(0.2, 0, 0),
                x: 3.3
            },
            { 
                label: "LED WALL", 
                control: "ledWallActive",
                onColor: new BABYLON.Color3(0, 0.5, 1),
                offColor: new BABYLON.Color3(0, 0.1, 0.2),
                x: 3.8
            },
            { 
                label: "STROBES", 
                control: "strobesActive",
                onColor: new BABYLON.Color3(1, 1, 1),
                offColor: new BABYLON.Color3(0.2, 0.2, 0.2),
                x: 4.3
            },
            { 
                label: "DISCO BALL", 
                control: "mirrorBallActive",
                onColor: new BABYLON.Color3(1, 1, 0),
                offColor: new BABYLON.Color3(0.2, 0.2, 0),
                x: 2.8,
                row2: true
            },
            { 
                label: "BALL COLOR", 
                control: "changeMirrorBallColor",
                onColor: new BABYLON.Color3(1, 1, 1), // White - changes to current color
                offColor: new BABYLON.Color3(0.3, 0.3, 0.3),
                x: 3.3,
                row2: true
            },
            { 
                label: "NEXT COLOR", 
                control: "changeColor",
                onColor: new BABYLON.Color3(0.5, 1, 0.5),
                offColor: new BABYLON.Color3(0.1, 0.3, 0.1),
                x: 3.8,
                row2: true
            },
            { 
                label: "SPOT MODE", 
                control: "cycleSpotMode",
                onColor: new BABYLON.Color3(0, 1, 1), // Cyan
                offColor: new BABYLON.Color3(0, 0.3, 0.3), // Dark cyan
                x: 4.3,
                row2: true
            },
            { 
                label: "PATTERN", 
                control: "cyclePattern",
                onColor: new BABYLON.Color3(1, 0.5, 1), // Pink - changes per pattern
                offColor: new BABYLON.Color3(0.2, 0.1, 0.2),
                x: 2.8,
                row3: true
            },
            { 
                label: "STROBE", 
                control: "spotStrobeActive",
                onColor: new BABYLON.Color3(1, 1, 0), // Yellow - strobe on
                offColor: new BABYLON.Color3(0.2, 0.2, 0),
                x: 3.3,
                row3: true
            }
        ];
        
        toggleButtons.forEach((btnDef) => {
            const toggleBtn = BABYLON.MeshBuilder.CreateBox("toggleBtn_" + btnDef.control, {
                width: 0.4,
                height: 0.1,
                depth: 0.3
            }, this.scene);
            // Row 1: z=-23.7, Row 2: z=-24.5, Row 3: z=-25.3
            let zPos = -23.7; // Row 1 (default)
            if (btnDef.row2) zPos = -24.5; // Row 2
            if (btnDef.row3) zPos = -25.3; // Row 3
            
            toggleBtn.position = new BABYLON.Vector3(btnDef.x, 0.95, zPos);
            toggleBtn.isPickable = true;
            
            const toggleMat = new BABYLON.StandardMaterial("toggleMat_" + btnDef.control, this.scene);
            // Check active state - action buttons start inactive
            let isActive = false;
            if (btnDef.control === "changeColor" || btnDef.control === "changeMirrorBallColor" || 
                btnDef.control === "cycleSpotMode" || btnDef.control === "cyclePattern") {
                isActive = false; // Action buttons, not toggles
            } else {
                isActive = this[btnDef.control]; // Normal toggle buttons
            }
            
            toggleMat.emissiveColor = isActive ? btnDef.onColor : btnDef.offColor;
            toggleMat.disableLighting = true;
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
        
        // Laptop removed - doesn't add useful functionality
        
        console.log("✅ Created hyperrealistic integrated DJ/VJ booth");
    }

    createPASpeakers() {
        // === HYPERREALISTIC PA SPEAKER SYSTEM ===
        // Positioned on sides of dance floor, facing center
        
        console.log("🔊 Creating PA speaker system...");
        
        // MASSIVE professional PA speaker material - VERY VISIBLE with emissive glow
        const speakerMat = new BABYLON.PBRMetallicRoughnessMaterial("paSpeakerMat", this.scene);
        speakerMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15); // Much lighter (was 0.08)
        speakerMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.02); // Slight glow for visibility
        speakerMat.metallic = 0.2;
        speakerMat.roughness = 0.7;
        speakerMat.maxSimultaneousLights = this.maxLights;
        speakerMat.alpha = 1.0; // Fully opaque
        speakerMat.transparencyMode = null; // No transparency
        speakerMat.backFaceCulling = true; // Proper culling
        
        // Left PA stack - NEXT TO DJ BOOTH (beside LED wall)
        this.createPAStack(-7, -25, speakerMat);
        
        // Right PA stack - NEXT TO DJ BOOTH (beside LED wall)
        this.createPAStack(7, -25, speakerMat);
        
        console.log("✅ PA speaker system created at x=±7, z=-25 (beside DJ booth)");
    }

    createPAStack(xPos, zPos, material) {
        // === MASSIVE PROFESSIONAL PA SPEAKER STACK ===
        console.log(`📦 Creating PA stack at x=${xPos}, z=${zPos}`);
        
        // Sub-woofer (bottom) - BIGGER
        const sub = BABYLON.MeshBuilder.CreateBox("sub" + xPos, {
            width: 3.0,
            height: 3.0,
            depth: 3.0
        }, this.scene);
        sub.position = new BABYLON.Vector3(xPos, 1.5, zPos);
        sub.material = material;
        sub.receiveShadows = true;
        sub.checkCollisions = true;
        
        // Sub grille - visible speaker cone area with emissive glow
        const grillMat = this.materialFactory.getPreset('speakerGrill');
        grillMat.alpha = 1.0; // Fully opaque
        grillMat.transparencyMode = null; // No transparency
        
        const subGrill = BABYLON.MeshBuilder.CreateBox("subGrill" + xPos, {
            width: 2.6,
            height: 2.6,
            depth: 0.1
        }, this.scene);
        subGrill.position = new BABYLON.Vector3(xPos, 1.5, zPos + 1.45);
        subGrill.material = grillMat;
        
        // Mid-range cabinet (top) - BIGGER
        const mid = BABYLON.MeshBuilder.CreateBox("mid" + xPos, {
            width: 2.4,
            height: 2.4,
            depth: 2.4
        }, this.scene);
        mid.position = new BABYLON.Vector3(xPos, 4.2, zPos);
        mid.material = material;
        mid.receiveShadows = true;
        mid.checkCollisions = true;
        
        // Mid grille
        const midGrill = BABYLON.MeshBuilder.CreateBox("midGrill" + xPos, {
            width: 2.0,
            height: 2.0,
            depth: 0.1
        }, this.scene);
        midGrill.position = new BABYLON.Vector3(xPos, 4.2, zPos + 1.15);
        midGrill.material = grillMat;
        
        // Horn tweeter - MORE VISIBLE
        const horn = BABYLON.MeshBuilder.CreateCylinder("horn" + xPos, {
            diameterTop: 0.5,
            diameterBottom: 0.25,
            height: 0.35,
            tessellation: 16
        }, this.scene);
        horn.position = new BABYLON.Vector3(xPos, 5.4, zPos + 1.15);
        horn.rotation.x = Math.PI / 2;
        const hornMat = this.materialFactory.getPreset('speakerHorn');
        hornMat.alpha = 1.0; // Fully opaque
        hornMat.transparencyMode = null; // No transparency
        horn.material = hornMat;
        
        // Add LARGE LED indicator light for visibility
        const led = BABYLON.MeshBuilder.CreateSphere("speakerLED" + xPos, {
            diameter: 0.3 // Doubled size (was 0.15)
        }, this.scene);
        led.position = new BABYLON.Vector3(xPos - 1.0, 1.5, zPos + 1.4); // Higher position (was 0.5)
        const ledMat = new BABYLON.StandardMaterial("ledMat" + xPos, this.scene);
        ledMat.emissiveColor = new BABYLON.Color3(0, 2, 0); // BRIGHTER green LED (was 1)
        ledMat.disableLighting = true;
        led.material = ledMat;
        
        // Add point light at LED for extra visibility
        const ledLight = new BABYLON.PointLight("ledLight" + xPos, 
            new BABYLON.Vector3(xPos - 1.0, 1.5, zPos + 1.4), this.scene);
        ledLight.diffuse = new BABYLON.Color3(0, 1, 0);
        ledLight.intensity = 2;
        ledLight.range = 5;
        ledLight.setEnabled(false); // Start disabled - PA speaker lights not needed initially
        
        console.log(`✅ PA stack created at x=${xPos}, z=${zPos}, height=5.7m`);
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
                    backLight.setEnabled(false); // Start disabled
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

    createVJLightingControls() {
        // === VJ LIGHTING CONTROL CONSOLE (right side of platform) ===
        // Simple control panel with toggle buttons for easy lighting control
        // Positioned at x=3, facing DJ (who stands with back to LED wall)
        
        const consoleMat = new BABYLON.PBRMetallicRoughnessMaterial("vjConsoleMat", this.scene);
        consoleMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        consoleMat.metallic = 0.9;
        consoleMat.roughness = 0.3;
        
        // Console base/stand
        const consoleBase = BABYLON.MeshBuilder.CreateBox("vjConsoleBase", {
            width: 2.5,
            height: 0.15,
            depth: 1.2
        }, this.scene);
        consoleBase.position = new BABYLON.Vector3(3, 0.8, -24);
        consoleBase.material = consoleMat;
        
        // === 6 TOGGLE BUTTONS FOR LIGHTING CONTROL ===
        const toggleButtons = [
            { 
                label: "SPOTLIGHTS", 
                control: "lightsActive",
                onColor: new BABYLON.Color3(1, 0.5, 0),
                offColor: new BABYLON.Color3(0.2, 0.1, 0),
                row: 0, col: 0
            },
            { 
                label: "LASERS", 
                control: "lasersActive",
                onColor: new BABYLON.Color3(1, 0, 0),
                offColor: new BABYLON.Color3(0.2, 0, 0),
                row: 0, col: 1
            },
            { 
                label: "STROBES", 
                control: "strobesActive",
                onColor: new BABYLON.Color3(1, 1, 1),
                offColor: new BABYLON.Color3(0.2, 0.2, 0.2),
                row: 0, col: 2
            },
            { 
                label: "LED WALL", 
                control: "ledWallActive",
                onColor: new BABYLON.Color3(0, 0.5, 1),
                offColor: new BABYLON.Color3(0, 0.1, 0.2),
                row: 1, col: 0
            },
            { 
                label: "MIRROR BALL", 
                control: "mirrorBallActive",
                onColor: new BABYLON.Color3(1, 1, 0),
                offColor: new BABYLON.Color3(0.2, 0.2, 0),
                row: 1, col: 1
            },
            { 
                label: "CHANGE COLOR", 
                control: "changeColor",
                onColor: new BABYLON.Color3(0.5, 1, 0.5),
                offColor: new BABYLON.Color3(0.1, 0.3, 0.1),
                row: 1, col: 2
            },
            { 
                label: "RANDOM", 
                control: "patternRandom",
                onColor: new BABYLON.Color3(1, 0, 1),
                offColor: new BABYLON.Color3(0.2, 0, 0.2),
                row: 2, col: 0
            },
            { 
                label: "STATIC DOWN", 
                control: "patternStatic",
                onColor: new BABYLON.Color3(0, 1, 1),
                offColor: new BABYLON.Color3(0, 0.2, 0.2),
                row: 2, col: 1
            },
            { 
                label: "SWEEP SYNC", 
                control: "patternSweep",
                onColor: new BABYLON.Color3(1, 0.5, 1),
                offColor: new BABYLON.Color3(0.2, 0.1, 0.2),
                row: 2, col: 2
            }
        ];
        
        const buttonWidth = 0.6;
        const buttonHeight = 0.15;
        const buttonDepth = 0.4;
        const spacing = 0.7;
        const startX = 2.2;
        const startZ = -23.5;
        const rowSpacing = 0.5;
        
        toggleButtons.forEach((btnDef) => {
            const xPos = startX + (btnDef.col * spacing);
            const yPos = 0.95 - (btnDef.row * rowSpacing);
            
            // Create larger, more visible button
            const toggleBtn = BABYLON.MeshBuilder.CreateBox("toggleBtn_" + btnDef.control, {
                width: buttonWidth,
                height: buttonHeight,
                depth: buttonDepth
            }, this.scene);
            toggleBtn.position = new BABYLON.Vector3(xPos, yPos, startZ);
            toggleBtn.isPickable = true;
            
            const toggleMat = new BABYLON.StandardMaterial("toggleMat_" + btnDef.control, this.scene);
            // Special handling for different button types
            let isActive = false;
            if (btnDef.control === "changeColor") {
                isActive = false; // Action button, not a toggle
            } else if (btnDef.control.startsWith("pattern")) {
                // Pattern buttons - check if this pattern is active
                if (btnDef.control === "patternRandom") isActive = (this.spotlightPattern === 0);
                else if (btnDef.control === "patternStatic") isActive = (this.spotlightPattern === 1);
                else if (btnDef.control === "patternSweep") isActive = (this.spotlightPattern === 2);
            } else {
                // Regular toggle buttons
                isActive = this[btnDef.control];
            }
            toggleMat.emissiveColor = isActive ? btnDef.onColor : btnDef.offColor;
            toggleMat.disableLighting = true;
            toggleBtn.material = toggleMat;
            
            this.vjControlButtons.push({
                mesh: toggleBtn,
                control: btnDef.control,
                material: toggleMat,
                onColor: btnDef.onColor,
                offColor: btnDef.offColor,
                label: btnDef.label
            });
            
            // Create text label using dynamic texture
            const labelPlane = BABYLON.MeshBuilder.CreatePlane("label_" + btnDef.control, {
                width: buttonWidth,
                height: 0.2
            }, this.scene);
            labelPlane.position = new BABYLON.Vector3(xPos, yPos + 0.15, startZ);
            labelPlane.rotation.x = Math.PI / 4; // Tilt for better visibility
            
            // Create dynamic texture for text
            const labelTexture = new BABYLON.DynamicTexture("labelTex_" + btnDef.control, 
                {width: 512, height: 128}, this.scene, false);
            labelTexture.hasAlpha = true;
            labelTexture.drawText(btnDef.label, null, null, 
                "bold 72px Arial", "white", "transparent", true, true);
            
            const labelMat = new BABYLON.StandardMaterial("labelMat_" + btnDef.control, this.scene);
            labelMat.diffuseTexture = labelTexture;
            labelMat.emissiveColor = new BABYLON.Color3(0.9, 0.9, 0.9);
            labelMat.disableLighting = true;
            labelMat.opacityTexture = labelTexture;
            labelPlane.material = labelMat;
        });
        
        console.log("✅ Created VJ lighting control console with 9 intuitive buttons in 3x3 grid");
    }

    // createVJStation() method removed - was 310+ lines of duplicate/unused code


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
            stripLight.setEnabled(false); // Start disabled - floor strips not needed initially
        }
    }

    // Bar area removed - will be replaced with 3D models later

    createTrussMountedLights() {
        // Moving head lights on truss - ONLY for spotlights (6 fixtures to match 6 spotlights)
        const lightFixtureMat = this.materialFactory.getPreset('lightFixture');
        
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
            // === REALISTIC MOVING HEAD FIXTURE ===
            
            // Base/Yoke (connects to truss) - Professional moving head design
            const base = BABYLON.MeshBuilder.CreateBox("fixtureBase" + i, {
                width: 0.5,
                height: 0.2,
                depth: 0.4
            }, this.scene);
            base.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            base.material = lightFixtureMat;
            
            // Main fixture body (head) - Larger, more realistic
            const fixture = BABYLON.MeshBuilder.CreateCylinder("lightFixture" + i, {
                diameter: 0.5,    // Professional moving head size
                height: 0.7,      // Longer body
                tessellation: 24  // Smoother
            }, this.scene);
            fixture.position = new BABYLON.Vector3(pos.x, 7.5, pos.z);
            fixture.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 2);
            fixture.material = lightFixtureMat;
            
            // Front bezel/rim around lens (realistic detail)
            const bezel = BABYLON.MeshBuilder.CreateTorus("bezel" + i, {
                diameter: 0.45,
                thickness: 0.05,
                tessellation: 32
            }, this.scene);
            bezel.position = new BABYLON.Vector3(pos.x, 7.2, pos.z);
            bezel.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 2);
            
            const bezelMat = new BABYLON.PBRMetallicRoughnessMaterial("bezelMat" + i, this.scene);
            bezelMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
            bezelMat.metallic = 0.95;
            bezelMat.roughness = 0.15;
            bezel.material = bezelMat;
            
            // Light lens (glowing) - The actual visible light output
            const lens = BABYLON.MeshBuilder.CreateCylinder("lens" + i, {
                diameter: 0.4,    // Fits inside bezel
                height: 0.1,
                tessellation: 32
            }, this.scene);
            lens.position = new BABYLON.Vector3(pos.x, 7.15, pos.z);
            lens.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 2);
            
            const lensMat = new BABYLON.StandardMaterial("lensMat" + i, this.scene);
            lensMat.emissiveColor = this.currentSpotColor.scale(6.0);
            lensMat.disableLighting = true;
            lensMat.backFaceCulling = false;
            lens.material = lensMat;
            lens.renderingGroupId = 2;
            
            // Bright light source (visible from all angles)
            const lightSource = BABYLON.MeshBuilder.CreateSphere("lightSource" + i, {
                diameter: 0.35
            }, this.scene);
            lightSource.position = new BABYLON.Vector3(pos.x, 7.15, pos.z);
            
            const sourceMat = new BABYLON.StandardMaterial("sourceMat" + i, this.scene);
            sourceMat.emissiveColor = this.currentSpotColor.scale(10.0); // Very bright
            sourceMat.disableLighting = true;
            sourceMat.backFaceCulling = false;
            lightSource.material = sourceMat;
            lightSource.renderingGroupId = 2;
            
            // Lens flare effect (subtle glass reflection)
            const flare = BABYLON.MeshBuilder.CreateDisc("flare" + i, {
                radius: 0.25,
                tessellation: 32
            }, this.scene);
            flare.position = new BABYLON.Vector3(pos.x, 7.1, pos.z);
            flare.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), Math.PI / 2);
            
            const flareMat = new BABYLON.StandardMaterial("flareMat" + i, this.scene);
            flareMat.emissiveColor = this.currentSpotColor.scale(3.0);
            flareMat.alpha = 0.4;
            flareMat.disableLighting = true;
            flareMat.backFaceCulling = false;
            flare.material = flareMat;
            flare.renderingGroupId = 2;
            
            this.trussLights.push({ 
                fixture, 
                lens, 
                lensMat, 
                lightSource, 
                sourceMat,
                base,
                bezel,
                flare,
                flareMat
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
            strobeLight.range = 50; // Increased from 30
            strobeLight.setEnabled(false); // Start disabled - will be enabled when strobesActive = true
            
            this.strobes.push({ 
                mesh: strobe, 
                material: strobeMat,
                light: strobeLight,
                flashDuration: 0,
                nextFlashTime: Math.random() * 2
            });
        });
    }

    createLasers() {
        
        this.lasers = [];
        
        // Lasers mounted UNDER the truss (hanging down)
        // ALL LASERS ARE MULTI-BEAM TYPE (5 rotating beams each)
        // ALL LASERS ON SAME Z POSITION for consistency (z: -14)
        const laserPositions = [
            { x: -8, z: -14, trussY: 7.55, type: 'multi' },   // Multi-beam left (left truss) - CHANGED
            { x: 0, z: -14, trussY: 7.55, type: 'multi' },    // Multi-beam center (main truss)
            { x: 8, z: -14, trussY: 7.55, type: 'multi' }     // Multi-beam right (right truss) - CHANGED
        ];
        
        laserPositions.forEach((pos, i) => {

            
            // Determine parent truss for each laser
            let parentTruss = null;
            let localX = pos.x;
            let localZ = pos.z;
            
            // Side lasers mount to side trusses (x: ±8)
            if (pos.x < -3 && this.sideTrusses && this.sideTrusses[-8]) {
                // Left laser mounts to left side truss at x: -8
                parentTruss = this.sideTrusses[-8];
                localX = 0; // Center on truss
                localZ = pos.z - (-12); // Relative to truss z position (-14 - (-12) = -2)
            } else if (pos.x > 3 && this.sideTrusses && this.sideTrusses[8]) {
                // Right laser mounts to right side truss at x: 8
                parentTruss = this.sideTrusses[8];
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
            
            const housingMat = this.materialFactory.createPBRMaterial("laserHousingMat" + i, {
                baseColor: [0.05, 0.05, 0.05],
                metallic: 0.8,
                roughness: 0.3,
                emissiveColor: [0.05, 0, 0]
            });
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
            
            const emitterMat = this.materialFactory.createStandardMaterial("laserEmitterMat" + i, {
                emissiveColor: [1, 0, 0],
                disableLighting: true
            });
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
                light.setEnabled(false); // Start disabled
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
                    light.setEnabled(false); // Start disabled
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
                    light.setEnabled(false); // Start disabled
                    lights.push(light);
                }
            }
            
            // Calculate actual world position for beam origin
            let actualWorldPos;
            if (parentTruss) {
                // Get world position from parented housing
                actualWorldPos = housing.getAbsolutePosition().clone();
                actualWorldPos.y = housing.getAbsolutePosition().y; // Use actual Y
            } else {
                // Center laser - use direct position
                actualWorldPos = new BABYLON.Vector3(pos.x, pos.trussY, pos.z);
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
                originPos: actualWorldPos,
                parentTruss: parentTruss, // Store parent reference
                localPos: new BABYLON.Vector3(localX, -0.45, localZ), // Store local position
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
        // Pattern: Lights → Lasers → Mirror Ball (cycling showcase)
        this.lightModeSwitchTime = 0;
        this.lightingPhase = 'lights'; // 'lights', 'lasers', or 'mirrorball'
        this.lightsPhaseDuration = 25; // Lights show for 25 seconds
        this.lasersPhaseDuration = 20; // Lasers show for 20 seconds
        this.mirrorBallPhaseDuration = 15; // Mirror ball show for 15 seconds (dramatic moment)
        
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
        
        // Ambient light - brighter for better visibility in VR and desktop
        this.lightFactory.getPreset('ambient', 'ambient');
        
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
            // Spotlight from truss position - MATCH FIXTURE POSITION (y: 7.3)
            const spot = new BABYLON.SpotLight("spot" + i,
                new BABYLON.Vector3(pos.x, 7.3, pos.z),  // Match fixture lens position
                new BABYLON.Vector3(0, -1, 0),           // Initial direction
                Math.PI / 6,                              // Narrower cone for focused beams
                5,                                        // Sharper falloff
                this.scene
            );
            spot.diffuse = new BABYLON.Color3(0, 0, 0); // No ambient diffuse - light only through beam
            spot.specular = this.currentSpotColor; // Specular for floor reflections
            spot.intensity = 12; // Increased for visibility
            spot.range = 25;
            spot.setEnabled(false); // Start disabled - will be enabled by animation loop based on lightsActive state
            
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
            
            // Start at fixture position (will be updated each frame) - MATCH FIXTURE POSITION
            beam.position = new BABYLON.Vector3(pos.x, 7.3, pos.z);
            beam.isPickable = false;
            beam.rotationQuaternion = BABYLON.Quaternion.Identity();
            
            // ULTRA-REALISTIC VOLUMETRIC BEAM - Simulates light scattering with varying intensity
            // Create gradient texture for realistic brightness falloff
            const beamTexture = new BABYLON.DynamicTexture("beamGradient" + i, { width: 512, height: 512 }, this.scene);
            const ctx = beamTexture.getContext();
            
            // Create radial gradient from center (bright) to edge (dim)
            // Enhanced gradient with sharper center and smoother falloff for professional look
            const gradient = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');    // Pure white center hotspot (increased from 0.8)
            gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.7)');  // Sharp bright core
            gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.4)'); // Smooth middle transition
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.15)'); // Soft outer glow
            gradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.05)'); // Very faint edge
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // Transparent edge
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 512, 512);
            beamTexture.update();
            
            // Use PBR material with gradient texture for realistic light falloff
            const beamMat = new BABYLON.PBRMaterial("spotBeamMat" + i, this.scene);
            
            // No base color - pure emission and transparency
            beamMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamMat.metallic = 0;
            beamMat.roughness = 1;
            
            // Apply gradient texture to emissive channel for realistic brightness variation
            beamMat.emissiveTexture = beamTexture;
            beamMat.emissiveColor = this.currentSpotColor.scale(1.2); // Increased visibility
            beamMat.emissiveIntensity = 6.0; // Increased for better visibility
            
            // Use gradient as alpha mask for realistic edge softness
            beamMat.opacityTexture = beamTexture;
            beamMat.alpha = 0.30; // Increased from 0.15 for much more visible beams
            beamMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
            
            // Fresnel effect - more visible from the side (like real light beams)
            beamMat.opacityFresnel = new BABYLON.FresnelParameters();
            beamMat.opacityFresnel.leftColor = new BABYLON.Color3(0.15, 0.15, 0.15); // More opaque from side
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
            
            // VOLUMETRIC GLOW - Outer soft glow around the beam for realistic atmospheric scatter
            const beamGlow = BABYLON.MeshBuilder.CreateCylinder("spotBeamGlow" + i, {
                diameterTop: 2.8,      // Larger outer glow
                diameterBottom: 0.5,   // Larger at source
                height: 1,
                tessellation: 16,
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            beamGlow.position = new BABYLON.Vector3(pos.x, 7.8, pos.z);
            beamGlow.isPickable = false;
            beamGlow.rotationQuaternion = BABYLON.Quaternion.Identity();
            
            // Create glow gradient texture (softer than main beam)
            const glowTexture = new BABYLON.DynamicTexture("glowGradient" + i, { width: 512, height: 512 }, this.scene);
            const glowCtx = glowTexture.getContext();
            
            // Softer radial gradient for outer glow - Enhanced for better atmospheric scatter
            const glowGradient = glowCtx.createRadialGradient(256, 256, 80, 256, 256, 256);
            glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');   // Brighter soft center (increased from 0.4)
            glowGradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)'); // More visible middle
            glowGradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.08)'); // Smooth transition
            glowGradient.addColorStop(0.9, 'rgba(255, 255, 255, 0.02)'); // Very faint edge
            glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // Transparent
            
            glowCtx.fillStyle = glowGradient;
            glowCtx.fillRect(0, 0, 512, 512);
            glowTexture.update();
            
            // Ultra-soft glow material with gradient
            const beamGlowMat = new BABYLON.PBRMaterial("spotBeamGlowMat" + i, this.scene);
            beamGlowMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamGlowMat.metallic = 0;
            beamGlowMat.roughness = 1;
            
            // Apply gradient to glow
            beamGlowMat.emissiveTexture = glowTexture;
            beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.6); // Increased visibility
            beamGlowMat.emissiveIntensity = 5.0; // Increased for more glow
            
            beamGlowMat.opacityTexture = glowTexture;
            beamGlowMat.alpha = 0.15; // Increased from 0.08 for more visible glow
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
                lens: this.trussLights ? this.trussLights[i]?.lens : null,
                lightSource: this.trussLights ? this.trussLights[i]?.lightSource : null,
                bezel: this.trussLights ? this.trussLights[i]?.bezel : null,
                flare: this.trussLights ? this.trussLights[i]?.flare : null,
                lensMat: this.trussLights ? this.trussLights[i]?.lensMat : null,
                sourceMat: this.trussLights ? this.trussLights[i]?.sourceMat : null,
                flareMat: this.trussLights ? this.trussLights[i]?.flareMat : null,
                basePos: new BABYLON.Vector3(pos.x, 7.3, pos.z), // Match fixture position
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
        ledLight.setEnabled(false); // Start disabled - LED wall light controlled by ledWallActive
        
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
        
        // Update all fog systems with light-tinted colors (SUBTLE HAZE)
        if (this.fogSystems[0]) { // Dance floor fog
            const alpha1 = 0.03 * pulse; // Reduced for haze effect
            const alpha2 = 0.02 * pulse;
            this.fogSystems[0].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[0].color2 = new BABYLON.Color4(tintedR * 0.85, tintedG * 0.85, tintedB * 0.85, alpha2);
        }
        
        if (this.fogSystems[1]) { // Upper atmosphere fog
            const alpha1 = 0.02 * pulse; // Reduced for haze effect
            const alpha2 = 0.01 * pulse;
            this.fogSystems[1].color1 = new BABYLON.Color4(tintedR * 0.9, tintedG * 0.9, tintedB * 0.9, alpha1);
            this.fogSystems[1].color2 = new BABYLON.Color4(tintedR * 0.75, tintedG * 0.75, tintedB * 0.75, alpha2);
        }
        
        if (this.fogSystems[2]) { // DJ booth fog
            const alpha1 = 0.04 * pulse; // Reduced for haze effect
            const alpha2 = 0.02 * pulse;
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
            const alpha1 = 0.03 * pulse; // Reduced for haze effect
            const alpha2 = 0.02 * pulse;
            this.fogSystems[0].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[0].color2 = new BABYLON.Color4(tintedR * 0.85, tintedG * 0.85, tintedB * 0.85, alpha2);
        }
        
        if (this.fogSystems[1]) {
            const alpha1 = 0.02 * pulse; // Reduced for haze effect
            const alpha2 = 0.01 * pulse;
            this.fogSystems[1].color1 = new BABYLON.Color4(tintedR * 0.9, tintedG * 0.9, tintedB * 0.9, alpha1);
            this.fogSystems[1].color2 = new BABYLON.Color4(tintedR * 0.75, tintedG * 0.75, tintedB * 0.75, alpha2);
        }
        
        if (this.fogSystems[2]) {
            const alpha1 = 0.04 * pulse; // Reduced for haze effect
            const alpha2 = 0.02 * pulse;
            this.fogSystems[2].color1 = new BABYLON.Color4(tintedR, tintedG, tintedB, alpha1);
            this.fogSystems[2].color2 = new BABYLON.Color4(tintedR * 0.8, tintedG * 0.8, tintedB * 0.8, alpha2);
        }
    }
    
    createMirrorBall() {
        // === DRAMATIC MIRROR/DISCO BALL EFFECT ===
        // Professional mirror ball suspended from center truss with dedicated spotlight
        
        // Position: Center of middle truss (x:0, y:8, z:-12)
        const ballPosition = new BABYLON.Vector3(0, 6.5, -12); // Hanging 1.5m below truss
        const trussPosition = new BABYLON.Vector3(0, 8, -12);
        
        // === MIRROR BALL SPHERE ===
        const mirrorBall = BABYLON.MeshBuilder.CreateSphere("mirrorBall", {
            diameter: 1.2, // Professional club-size mirror ball
            segments: 32   // High detail for reflections
        }, this.scene);
        mirrorBall.position = ballPosition;
        
        // Highly reflective material with FACETED appearance (like real disco balls)
        const mirrorBallMat = new BABYLON.PBRMetallicRoughnessMaterial("mirrorBallMat", this.scene);
        mirrorBallMat.baseColor = new BABYLON.Color3(0.95, 0.95, 0.95); // Bright silver
        mirrorBallMat.metallic = 1.0;  // Fully metallic
        mirrorBallMat.roughness = 0.15; // Increased roughness for faceted mirror appearance (was 0.05)
        mirrorBallMat.reflectivityColor = new BABYLON.Color3(1, 1, 1);
        mirrorBallMat.maxSimultaneousLights = this.maxLights;
        
        // Use environment reflection for realistic mirror effect
        if (this.scene.environmentTexture) {
            mirrorBallMat.environmentIntensity = 1.8; // Stronger reflections for more sparkle
        }
        
        // Add bump map for faceted appearance (using vertex normals)
        // This makes it look like many small square mirrors instead of one smooth sphere
        mirrorBall.convertToFlatShadedMesh(); // Creates hard edges between faces = disco ball facets!
        
        mirrorBall.material = mirrorBallMat;
        mirrorBall.isPickable = false;
        
        // === HANGING CABLE/CHAIN ===
        const cable = BABYLON.MeshBuilder.CreateCylinder("mirrorBallCable", {
            diameter: 0.02,
            height: 1.5, // Distance from truss to ball
            tessellation: 8
        }, this.scene);
        cable.position = new BABYLON.Vector3(0, 7.25, -12); // Midpoint between truss and ball
        
        const cableMat = this.materialFactory.createPBRMaterial("cableMat", {
            baseColor: [0.1, 0.1, 0.1],
            metallic: 0.7,
            roughness: 0.4
        });
        cable.material = cableMat;
        cable.isPickable = false;
        
        // === MULTIPLE SPOTLIGHTS FOR MIRROR BALL (Professional disco ball setup) ===
        // Strategy: Use 1 main spotlight + visual beams from multiple angles
        // Why: GPU uniform buffer limits prevent multiple real SpotLights with PBR materials
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        
        const spotlightConfigs = [
            { pos: new BABYLON.Vector3(4, 7.5, -8), name: "Front-Right", isRealLight: true },  // Only this one is a real light
            { pos: new BABYLON.Vector3(-4, 7.5, -8), name: "Front-Left", isRealLight: false }, // Visual only
            { pos: new BABYLON.Vector3(4, 7.5, -16), name: "Back-Right", isRealLight: false }, // Visual only - cross pattern
            { pos: new BABYLON.Vector3(-4, 7.5, -16), name: "Back-Left", isRealLight: false }  // Visual only - cross pattern
        ];
        
        spotlightConfigs.forEach((config, index) => {
            const direction = ballPosition.subtract(config.pos).normalize();
            
            // Create real spotlight only for the main one
            if (config.isRealLight) {
                const spotlight = new BABYLON.SpotLight(
                    `mirrorBallSpotlight${index}`,
                    config.pos,
                    direction,
                    Math.PI / 6,  // Wider beam to cover ball from one angle
                    8,            // Softer falloff
                    this.scene
                );
                spotlight.diffuse = this.mirrorBallSpotlightColor.clone();
                spotlight.intensity = 150; // Very bright since it's the only real light
                spotlight.range = 35;
                spotlight.setEnabled(false);
                this.mirrorBallSpotlights.push(spotlight);
            } else {
                // Fake spotlight (visual only, no actual light)
                this.mirrorBallSpotlights.push(null);
            }
            
            // === HYPERREALISTIC MOVING HEAD FIXTURE (Professional Stage Light) ===
            const housingDirection = ballPosition.subtract(config.pos).normalize();
            const targetQuat = BABYLON.Quaternion.FromLookDirectionLH(housingDirection, BABYLON.Vector3.Up());
            
            // Base/Yoke mount (connects to truss) - Professional design
            const base = BABYLON.MeshBuilder.CreateBox(`mirrorFixtureBase${index}`, {
                width: 0.5,
                height: 0.2,
                depth: 0.4
            }, this.scene);
            base.position = config.pos.clone();
            base.rotationQuaternion = targetQuat;
            
            const baseMat = this.materialFactory.getPreset('lightFixture');
            base.material = baseMat;
            base.isPickable = false;
            
            // Main fixture body (cylindrical housing) - Professional moving head
            const housing = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotHousing${index}`, {
                diameter: 0.5,
                height: 0.7,
                tessellation: 24
            }, this.scene);
            housing.position = config.pos.add(housingDirection.scale(0.1)); // Slight offset forward
            housing.rotationQuaternion = targetQuat;
            
            const housingMat = new BABYLON.PBRMetallicRoughnessMaterial(`mirrorHousingMat${index}`, this.scene);
            housingMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.12); // Dark gunmetal
            housingMat.metallic = 0.85;
            housingMat.roughness = 0.3;
            housingMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow when active
            housingMat.maxSimultaneousLights = this.maxLights;
            housing.material = housingMat;
            housing.isPickable = false;
            
            // Front bezel/rim (chrome ring around lens)
            const bezel = BABYLON.MeshBuilder.CreateTorus(`mirrorBezel${index}`, {
                diameter: 0.45,
                thickness: 0.05,
                tessellation: 32
            }, this.scene);
            bezel.position = config.pos.add(housingDirection.scale(0.4)); // At front of housing
            bezel.rotationQuaternion = targetQuat;
            
            const bezelMat = new BABYLON.PBRMetallicRoughnessMaterial(`mirrorBezelMat${index}`, this.scene);
            bezelMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
            bezelMat.metallic = 0.95;
            bezelMat.roughness = 0.15; // Shiny chrome
            bezelMat.maxSimultaneousLights = this.maxLights;
            bezel.material = bezelMat;
            bezel.isPickable = false;
            
            // Lens (glass front element) - Cylindrical lens shape
            const lens = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotLens${index}`, {
                diameter: 0.4,
                height: 0.1,
                tessellation: 32
            }, this.scene);
            lens.position = config.pos.add(housingDirection.scale(0.38)); // Inside bezel
            lens.rotationQuaternion = targetQuat;
            
            const lensMat = new BABYLON.StandardMaterial(`mirrorLensMat${index}`, this.scene);
            lensMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow with color when active
            lensMat.disableLighting = true;
            lensMat.backFaceCulling = false;
            lens.material = lensMat;
            lens.renderingGroupId = 2;
            lens.isPickable = false;
            
            // Bright light source (visible bulb/LED)
            const lightSource = BABYLON.MeshBuilder.CreateSphere(`mirrorLightSource${index}`, {
                diameter: 0.35,
                segments: 16
            }, this.scene);
            lightSource.position = config.pos.add(housingDirection.scale(0.38));
            
            const sourceMat = new BABYLON.StandardMaterial(`mirrorSourceMat${index}`, this.scene);
            sourceMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow bright when active
            sourceMat.disableLighting = true;
            sourceMat.backFaceCulling = false;
            lightSource.material = sourceMat;
            lightSource.renderingGroupId = 2;
            lightSource.isPickable = false;
            
            // Lens flare (glass reflection effect)
            const flare = BABYLON.MeshBuilder.CreateDisc(`mirrorFlare${index}`, {
                radius: 0.25,
                tessellation: 32
            }, this.scene);
            flare.position = config.pos.add(housingDirection.scale(0.42)); // Slightly in front
            flare.rotationQuaternion = targetQuat;
            
            const flareMat = new BABYLON.StandardMaterial(`mirrorFlareMat${index}`, this.scene);
            flareMat.emissiveColor = new BABYLON.Color3(0, 0, 0); // Will glow when active
            flareMat.alpha = 0.4;
            flareMat.disableLighting = true;
            flareMat.backFaceCulling = false;
            flare.material = flareMat;
            flare.renderingGroupId = 2;
            flare.isPickable = false;
            
            this.mirrorBallHousings.push({ 
                mesh: housing, 
                material: housingMat,
                base: base,
                bezel: bezel,
                lens: lens,
                lensMaterial: lensMat,
                lightSource: lightSource,
                sourceMaterial: sourceMat,
                flare: flare,
                flareMaterial: flareMat
            });
            
            // Visible volumetric beam from all positions (dramatic effect with HIGH-QUALITY rendering)
            const beamLength = BABYLON.Vector3.Distance(config.pos, ballPosition);
            const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorSpotBeam${index}`, {
                diameterTop: 1.4,     // Wide at ball
                diameterBottom: 0.3,  // Narrow at source
                height: beamLength,
                tessellation: 16,
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // Position and rotate beam
            const beamMidpoint = BABYLON.Vector3.Center(config.pos, ballPosition);
            beam.position = beamMidpoint;
            
            const beamRotationAxis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), direction);
            const beamRotationAngle = Math.acos(BABYLON.Vector3.Dot(BABYLON.Vector3.Up(), direction));
            beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(beamRotationAxis, beamRotationAngle);
            
            // === ULTRA-REALISTIC VOLUMETRIC BEAM (same quality as truss spotlights) ===
            // Create radial gradient texture for realistic brightness falloff
            const beamTexture = new BABYLON.DynamicTexture("mirrorBeamGradient" + index, { width: 512, height: 512 }, this.scene);
            const ctx = beamTexture.getContext();
            
            // Create radial gradient from center (bright) to edge (dim)
            const gradient = ctx.createRadialGradient(256, 256, 50, 256, 256, 256);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');    // Bright center hotspot
            gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');  // Still bright
            gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');  // Dimmer middle
            gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.1)'); // Faint edge
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');      // Transparent edge
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 512, 512);
            beamTexture.update();
            
            // Use PBR material with gradient texture for professional quality
            const beamMat = new BABYLON.PBRMaterial("mirrorSpotBeamMat" + index, this.scene);
            
            // No base color - pure emission and transparency
            beamMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            beamMat.metallic = 0;
            beamMat.roughness = 1;
            
            // Apply gradient texture to emissive channel
            beamMat.emissiveTexture = beamTexture;
            beamMat.emissiveColor = this.mirrorBallSpotlightColor.scale(0.6);
            beamMat.emissiveIntensity = 3.5;
            
            // Use gradient as alpha mask for realistic edge softness
            beamMat.opacityTexture = beamTexture;
            beamMat.alpha = 0.15; // Slightly more visible than truss spots for drama
            beamMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
            
            // Fresnel effect - more visible from the side
            beamMat.opacityFresnel = new BABYLON.FresnelParameters();
            beamMat.opacityFresnel.leftColor = new BABYLON.Color3(0.15, 0.15, 0.15);
            beamMat.opacityFresnel.rightColor = new BABYLON.Color3(0, 0, 0);
            beamMat.opacityFresnel.bias = 0.2;
            beamMat.opacityFresnel.power = 2;
            
            // Important settings for realism
            beamMat.backFaceCulling = false;
            beamMat.disableLighting = true;
            beamMat.unlit = true;
            
            beam.material = beamMat;
            beam.isPickable = false;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1;
            beam.setEnabled(false);
            
            this.mirrorBallBeams.push({ mesh: beam, material: beamMat, texture: beamTexture });
        });
        
        // === REFLECTION SPOTS (Simulated light spots from mirror facets) ===
        // VISUAL ONLY - No actual PointLights to stay within GPU uniform buffer limits
        // These are purely emissive meshes that create the illusion of reflections
        // REALISTIC DISCO BALL: Spots should cover ENTIRE room in all directions
        this.mirrorReflectionSpots = [];
        const numSpots = 300; // Increased to 300 for better coverage
        
        // PRE-DISTRIBUTE spots across surfaces for guaranteed even coverage
        const spotsPerSurface = Math.floor(numSpots / 6); // Divide evenly among 6 surfaces
        let spotIndex = 0;
        
        const surfaces = [
            { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02 },
            { name: 'ceiling', axis: 'xz', fixed: 'y', value: 7.98 },
            { name: 'leftWall', axis: 'yz', fixed: 'x', value: -14.98 },
            { name: 'rightWall', axis: 'yz', fixed: 'x', value: 14.98 },
            { name: 'backWall', axis: 'xy', fixed: 'z', value: -25.98 },
            { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.98 }
        ];
        
        surfaces.forEach(surface => {
            for (let i = 0; i < spotsPerSurface && spotIndex < numSpots; i++, spotIndex++) {
                // Visual spot (emissive disc - looks like light reflection)
                const spot = BABYLON.MeshBuilder.CreateDisc(`mirrorSpot${spotIndex}`, {
                    radius: 0.15 + Math.random() * 0.15, // SMALLER: 0.15-0.3m (was 0.25-0.5m)
                    tessellation: 8
                }, this.scene);
                
                const spotMat = new BABYLON.StandardMaterial(`mirrorSpotMat${spotIndex}`, this.scene);
                spotMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                spotMat.alpha = 1.0; // FULLY OPAQUE
                spotMat.disableLighting = true;
                spotMat.backFaceCulling = false; // Visible from both sides
                spot.material = spotMat;
                spot.isPickable = false;
                spot.setEnabled(false);
                
                // Generate random position on this surface
                let targetPos, normal;
                
                if (surface.axis === 'xz') { // Floor or ceiling
                    targetPos = new BABYLON.Vector3(
                        -14 + Math.random() * 28,  // x: -14 to +14
                        surface.value,
                        -25 + Math.random() * 27   // z: -25 to +2
                    );
                    normal = surface.name === 'floor' ? 
                        new BABYLON.Vector3(0, 1, 0) : 
                        new BABYLON.Vector3(0, -1, 0);
                        
                } else if (surface.axis === 'yz') { // Left or right wall
                    targetPos = new BABYLON.Vector3(
                        surface.value,
                        0.2 + Math.random() * 7.6,  // y: 0.2 to 7.8
                        -25 + Math.random() * 27    // z: -25 to +2
                    );
                    normal = surface.name === 'leftWall' ? 
                        new BABYLON.Vector3(1, 0, 0) : 
                        new BABYLON.Vector3(-1, 0, 0);
                        
                } else { // Back or front wall (xy)
                    targetPos = new BABYLON.Vector3(
                        -14 + Math.random() * 28,  // x: -14 to +14
                        0.2 + Math.random() * 7.6,  // y: 0.2 to 7.8
                        surface.value
                    );
                    normal = surface.name === 'backWall' ? 
                        new BABYLON.Vector3(0, 0, 1) : 
                        new BABYLON.Vector3(0, 0, -1);
                }
                
                spot.position = targetPos;
                
                // Calculate direction from ball to spot (for animation)
                const ballPos = new BABYLON.Vector3(0, 6.5, -12);
                const directionFromBall = targetPos.subtract(ballPos).normalize();
                
                // Convert to spherical coordinates for rotation
                const distance = BABYLON.Vector3.Distance(targetPos, ballPos);
                let theta = Math.atan2(directionFromBall.z, directionFromBall.x);
                let phi = Math.acos(directionFromBall.y);
                
                this.mirrorReflectionSpots.push({
                    visual: spot,
                    material: spotMat,
                    surface: surface.name,
                    surfaceNormal: normal,
                    targetPosition: targetPos.clone(),
                    theta: theta,
                    phi: phi,
                    distance: distance,
                    thetaSpeed: (Math.random() - 0.5) * 0.8,  // Rotation speed
                    phiSpeed: (Math.random() - 0.5) * 0.5,
                    baseIntensity: 0.5 + Math.random() * 0.7,
                    twinkleSpeed: 2 + Math.random() * 4,
                    twinklePhase: Math.random() * Math.PI * 2
                });
            }
        });
        
        console.log(`✨ Created ${this.mirrorReflectionSpots.length} reflection spots across 6 surfaces`);
        
        // Store references for animation and color updates
        this.mirrorBall = mirrorBall;
        this.mirrorBallRotation = 0; // Track rotation for animation
        
        console.log('✨ Mirror ball created with 3 dramatic spotlights from multiple angles');
    }
    
    resetFogToNeutral() {
        // Return fog to neutral white/gray when no lights are active (SUBTLE HAZE)
        if (this.fogSystems[0]) {
            this.fogSystems[0].color1 = new BABYLON.Color4(0.85, 0.85, 0.92, 0.03);
            this.fogSystems[0].color2 = new BABYLON.Color4(0.65, 0.65, 0.75, 0.02);
        }
        
        if (this.fogSystems[1]) {
            this.fogSystems[1].color1 = new BABYLON.Color4(0.72, 0.72, 0.8, 0.02);
            this.fogSystems[1].color2 = new BABYLON.Color4(0.55, 0.55, 0.65, 0.01);
        }
        
        if (this.fogSystems[2]) {
            this.fogSystems[2].color1 = new BABYLON.Color4(0.88, 0.88, 0.98, 0.04);
            this.fogSystems[2].color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.02);
        }
    }

    updateAnimations() {
        const time = performance.now() / 1000;
        this.ledTime += 0.016;
        
        // Get audio data for reactive lighting
        const audioData = this.getAudioData();
        
        // === MIRROR BALL EFFECT ===
        if (this.mirrorBallActive) {
            // In AUTOMATED mode: Turn OFF all other lights when mirror ball is active
            // In MANUAL mode: Allow VJ to control lights independently
            if (!this.vjManualMode) {
                this.lightsActive = false;
                this.lasersActive = false;
                this.ledWallActive = false;
            }
            
            // Disable spotlight beams (unless manually enabled by VJ)
            if (this.spotlights && !this.lightsActive) {
                this.spotlights.forEach(spot => {
                    if (spot.spot) spot.spot.setEnabled(false);
                    if (spot.beam) spot.beam.setEnabled(false);
                });
            }
            
            // Disable lasers (each laser has multiple lights in 'lights' array) - unless manually enabled
            if (this.lasers && !this.lasersActive) {
                this.lasers.forEach(laser => {
                    laser.lights.forEach(light => light.setEnabled(false)); // Disable all lights in array
                    laser.beams.forEach(beam => {
                        beam.mesh.setEnabled(false);      // Main beam cylinder
                        beam.beamGlow.setEnabled(false);  // Glow halo
                        beam.hitSpot.setEnabled(false);   // Floor hit spot
                    });
                });
            }
            
            // Disable strobes
            if (this.strobes) {
                this.strobes.forEach(strobe => {
                    if (strobe.light) strobe.light.setEnabled(false);
                    if (strobe.material) strobe.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
                });
            }
            
            // Turn off LED wall (unless manually enabled by VJ)
            if (this.ledPanels && !this.ledWallActive) {
                this.ledPanels.forEach(panel => {
                    panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
                });
            }
            
            // Enable all mirror ball spotlights and beams
            if (this.mirrorBallSpotlights) {
                this.mirrorBallSpotlights.forEach(light => {
                    if (light) light.setEnabled(true); // Only enable real lights (not nulls)
                });
            }
            if (this.mirrorBallBeams) {
                this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(true));
            }
            if (this.mirrorBallHousings) {
                this.mirrorBallHousings.forEach(housing => {
                    // Make all fixture components glow with current color (professional moving head)
                    housing.material.emissiveColor = this.mirrorBallSpotlightColor.scale(0.2); // Housing subtle glow
                    housing.lensMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(5.0); // Lens bright
                    housing.sourceMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(8.0); // Light source very bright
                    housing.flareMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(3.0); // Flare medium bright
                });
            };
            
            // Rotate mirror ball faster so you can see it spinning (classic disco ball rotation)
            if (this.mirrorBall) {
                this.mirrorBallRotation -= 0.003; // Negative rotation - spots now move in same visual direction
                this.mirrorBall.rotation.y = this.mirrorBallRotation;
            }
            
            // Animate reflection spots around the room (300 spots covering all surfaces)
            // PROJECT spots onto actual room surfaces (walls, floor, ceiling)
            if (this.mirrorReflectionSpots && this.mirrorReflectionSpots.length > 0) {
                const ballPos = this.mirrorBall.position; // Ball at (0, 6.5, -12)
                
                this.mirrorReflectionSpots.forEach((spot, i) => {
                    // Enable visual spot (no actual light - just emissive mesh)
                    spot.visual.setEnabled(true);
                    
                    // PROPER RAY CASTING: Calculate direction from mirror ball based on rotation
                    // Each spot represents a mirror facet at a specific angle (theta, phi)
                    // As ball rotates, the facet direction rotates with it
                    // SUBTRACT rotation for proper reflection (facets stay fixed relative to ball)
                    const rotatedTheta = spot.theta - this.mirrorBall.rotation.y; // Subtract for correct reflection
                    const phi = spot.phi; // Vertical angle stays constant
                    
                    // Calculate ray direction from ball in spherical coordinates
                    const dirX = Math.sin(phi) * Math.cos(rotatedTheta);
                    const dirY = Math.cos(phi);
                    const dirZ = Math.sin(phi) * Math.sin(rotatedTheta);
                    
                    // Ray cast from ball position to find which surface it hits
                    let closestT = Infinity;
                    let hitPos = null;
                    let hitNormal = null;
                    
                    // Test intersection with all 6 room surfaces
                    // FLOOR (y = 0)
                    if (dirY < -0.001) {
                        const t = (0 - ballPos.y) / dirY;
                        if (t > 0) {
                            const x = ballPos.x + dirX * t;
                            const z = ballPos.z + dirZ * t;
                            if (x >= -15 && x <= 15 && z >= -26 && z <= 2 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(x, 0.02, z);
                                hitNormal = new BABYLON.Vector3(0, 1, 0);
                            }
                        }
                    }
                    
                    // CEILING (y = 8)
                    if (dirY > 0.001) {
                        const t = (8 - ballPos.y) / dirY;
                        if (t > 0) {
                            const x = ballPos.x + dirX * t;
                            const z = ballPos.z + dirZ * t;
                            if (x >= -15 && x <= 15 && z >= -26 && z <= 2 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(x, 7.98, z);
                                hitNormal = new BABYLON.Vector3(0, -1, 0);
                            }
                        }
                    }
                    
                    // LEFT WALL (x = -15)
                    if (dirX < -0.001) {
                        const t = (-15 - ballPos.x) / dirX;
                        if (t > 0) {
                            const y = ballPos.y + dirY * t;
                            const z = ballPos.z + dirZ * t;
                            if (y >= 0 && y <= 8 && z >= -26 && z <= 2 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(-14.98, y, z);
                                hitNormal = new BABYLON.Vector3(1, 0, 0);
                            }
                        }
                    }
                    
                    // RIGHT WALL (x = 15)
                    if (dirX > 0.001) {
                        const t = (15 - ballPos.x) / dirX;
                        if (t > 0) {
                            const y = ballPos.y + dirY * t;
                            const z = ballPos.z + dirZ * t;
                            if (y >= 0 && y <= 8 && z >= -26 && z <= 2 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(14.98, y, z);
                                hitNormal = new BABYLON.Vector3(-1, 0, 0);
                            }
                        }
                    }
                    
                    // BACK WALL (z = -26)
                    if (dirZ < -0.001) {
                        const t = (-26 - ballPos.z) / dirZ;
                        if (t > 0) {
                            const x = ballPos.x + dirX * t;
                            const y = ballPos.y + dirY * t;
                            if (x >= -15 && x <= 15 && y >= 0 && y <= 8 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(x, y, -25.98);
                                hitNormal = new BABYLON.Vector3(0, 0, 1);
                            }
                        }
                    }
                    
                    // FRONT WALL (z = 2)
                    if (dirZ > 0.001) {
                        const t = (2 - ballPos.z) / dirZ;
                        if (t > 0) {
                            const x = ballPos.x + dirX * t;
                            const y = ballPos.y + dirY * t;
                            if (x >= -15 && x <= 15 && y >= 0 && y <= 8 && t < closestT) {
                                closestT = t;
                                hitPos = new BABYLON.Vector3(x, y, 1.98);
                                hitNormal = new BABYLON.Vector3(0, 0, -1);
                            }
                        }
                    }
                    
                    const hitDistance = closestT;
                    
                    // Position spot at ray intersection point
                    if (hitPos) {
                        spot.visual.position.copyFrom(hitPos);
                        spot.visual.lookAt(hitPos.add(hitNormal)); // Orient perpendicular to surface
                        
                        // Distance fade and twinkling - REDUCED BRIGHTNESS
                        const distanceFade = Math.max(0.3, 1 - (hitDistance / 30)); // Dimmer with distance
                        const twinkle = 0.7 + 0.3 * Math.sin(time * spot.twinkleSpeed + spot.twinklePhase); // Gentle twinkling
                        const brightness = spot.baseIntensity * distanceFade * twinkle * 0.6; // 40% dimmer overall
                        
                        // DIMMER emissive color
                        spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(Math.max(0.4, brightness));
                        spot.material.alpha = 0.85; // Slightly transparent for softer look
                    } else {
                        // Ray didn't hit any surface - fade out
                        spot.material.alpha = Math.max(0, spot.material.alpha - 0.02);
                    }
                });
            }
        } else {
            // Mirror ball inactive - disable all mirror ball elements
            if (this.mirrorBallSpotlights) {
                this.mirrorBallSpotlights.forEach(light => {
                    if (light) light.setEnabled(false); // Check for null (fake lights)
                });
            }
            if (this.mirrorBallBeams) {
                this.mirrorBallBeams.forEach(beam => beam.mesh.setEnabled(false));
            }
            if (this.mirrorBallHousings) {
                this.mirrorBallHousings.forEach(housing => {
                    housing.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    housing.lensMaterial.emissiveColor = new BABYLON.Color3(0, 0, 0);
                });
            }
            if (this.mirrorReflectionSpots) {
                this.mirrorReflectionSpots.forEach(spot => {
                    spot.visual.setEnabled(false);
                });
            }
        }
        
        // AUTOMATIC CYCLING PATTERN: Lights → Lasers → Mirror Ball
        // Only cycle automatically when NOT in VJ manual mode
        if (!this.vjManualMode) {
            // Determine phase duration based on current phase
            let currentPhaseDuration;
            if (this.lightingPhase === 'lights') {
                currentPhaseDuration = this.lightsPhaseDuration;
            } else if (this.lightingPhase === 'lasers') {
                currentPhaseDuration = this.lasersPhaseDuration;
            } else if (this.lightingPhase === 'mirrorball') {
                currentPhaseDuration = this.mirrorBallPhaseDuration;
            }
            
            if (time - this.lightModeSwitchTime > currentPhaseDuration) {
                // Cycle through phases: lights → lasers → mirrorball → lights
                if (this.lightingPhase === 'lights') {
                    this.lightingPhase = 'lasers';
                    this.lightsActive = false;
                    this.lasersActive = true;
                    this.mirrorBallActive = false;
                    console.log('🎪 Phase: LASERS');
                    
                } else if (this.lightingPhase === 'lasers') {
                    this.lightingPhase = 'mirrorball';
                    this.lightsActive = false;
                    this.lasersActive = false;
                    this.mirrorBallActive = true;
                    console.log('🪩 Phase: MIRROR BALL');
                    
                } else {
                    this.lightingPhase = 'lights';
                    this.lightsActive = true;
                    this.lasersActive = false;
                    this.mirrorBallActive = false;
                    console.log('💡 Phase: SPOTLIGHTS');
                }
                this.lightModeSwitchTime = time;
                
                // Update VJ control button visuals to reflect state
                if (this.vjControlButtons) {
                    this.vjControlButtons.forEach(btn => {
                        if (btn.control === 'lightsActive' || btn.control === 'lasersActive' || btn.control === 'mirrorBallActive') {
                            btn.material.emissiveColor = this[btn.control] ? btn.onColor : btn.offColor;
                        }
                    });
                }
            }
        } else {
            // In manual mode: update lightModeSwitchTime to prevent immediate cycling when mode expires
            this.lightModeSwitchTime = time;
        }
        
        // Update LED wall (with audio reactivity) - respects ledWallActive control
        if (this.ledPanels && this.ledWallActive) {
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && !this.ledWallActive) {
            // Turn off LED wall when disabled
            this.ledPanels.forEach(panel => {
                panel.material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            });
        }
        
        // ALWAYS SYNCHRONIZED MODE - no random mode
        // Spotlights always move together in coordinated patterns
        this.lightingMode = 'synchronized';
        
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
                // Update origin position for parented lasers (get world position)
                if (laser.parentTruss) {
                    laser.originPos = laser.housing.getAbsolutePosition().clone();
                }
                
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
                this.spotlights.forEach((spot, i) => {
                    // spot.light.diffuse stays black - no ambient colored glow
                    spot.color = this.currentSpotColor;
                    
                    // Update fixture lens and light source colors immediately
                    if (spot.lensMat && this.lightsActive) {
                        spot.lensMat.emissiveColor = this.currentSpotColor.scale(5.0);
                    }
                    if (spot.sourceMat && this.lightsActive) {
                        spot.sourceMat.emissiveColor = this.currentSpotColor.scale(8.0);
                    }
                    // Beam color updated in animation loop
                });
            }
        }
        
        // Check if VJ manual mode should expire (5 minutes of no interaction)
        if (this.vjManualMode && (time - this.lastVJInteraction) > this.VJ_TIMEOUT) {
            this.vjManualMode = false;
            console.log("🤖 Automated patterns resumed - no VJ interaction for 5 minutes");
        }
        
        // Calculate global phase for spotlight patterns (used in multiple places)
        // Phase ALWAYS advances when lights are active (for sweep animations)
        // VJ manual mode only affects Pattern 0's auto-cycling between sub-patterns
        if (this.lightsActive) {
            this.lastActivePhase = time * 0.8; // Always update when lights on
        }
        const globalPhase = this.lastActivePhase || 0;
        const audioSpeedMultiplier = 1.0; // Audio control disabled - focus on basics
        
        // Auto-cycling control for Pattern 0 (random mode)
        const allowAutomatedPatterns = this.lightsActive && !this.vjManualMode;
        
        if (this.spotlights && this.lightsActive) {
            
            // SYNCHRONIZED SWEEPING - recreate iconic club vibe
            // All lights move together, sweeping their beams across the dance floor
            
            this.spotlights.forEach((spot, i) => {
                let dirX, dirZ;
                
                // VJ PATTERN CONTROL - spotlightPattern: 0=random, 1=static down, 2=synchronized sweep
                // Apply speed multiplier to all animated patterns
                const speedMultiplier = this.spotlightSpeed || 1.0;
                
                if (this.spotlightPattern === 1) {
                    // PATTERN 1: STATIC DOWN - All lights point straight down
                    dirX = 0;
                    dirZ = 0;
                    
                } else if (this.spotlightPattern === 2) {
                    // PATTERN 2: SYNCHRONIZED SWEEP - All lights sweep left to right together
                    const sweepPhase = globalPhase * speedMultiplier;
                    dirX = Math.sin(sweepPhase * 0.8) * 0.6; // Smooth left-right sweep
                    dirZ = -0.3; // Slight forward angle toward dance floor
                    
                } else {
                    // PATTERN 0: RANDOM/AUTOMATED (default) - Complex pattern cycling
                    
                    // SPOTLIGHT MODE CONTROL
                    // Mode 0: strobe+sweep, Mode 1: sweep only, Mode 2: strobe static, Mode 3: static
                    const isSweepMode = (this.spotlightMode === 0 || this.spotlightMode === 1);
                    const isStrobeMode = (this.spotlightMode === 0 || this.spotlightMode === 2);
                    
                    // SYNCHRONIZED SWEEPING: All lights sweep together continuously
                    // SMOOTH pattern transitions - patterns blend into each other naturally
                    const sweepPhase = globalPhase * audioSpeedMultiplier * speedMultiplier;
                    
                    // Slow pattern selector that cycles through patterns smoothly
                    // Each pattern lasts ~10 seconds with smooth transitions
                    const patternCycle = (sweepPhase / 10) % 7; // 0-7, smoothly increasing
                    const currentPattern = Math.floor(patternCycle);
                    const nextPattern = (currentPattern + 1) % 7;
                    const blendFactor = patternCycle - currentPattern; // 0-1 smooth blend
                    
                    // MAX 45 DEGREES = tan(45°) ≈ 1.0, so dirX and dirZ should be ≤ 0.6 for smooth angles
                    // Calculate current and next pattern positions, then blend
                    
                    let dirX1 = 0, dirZ1 = 0; // Current pattern
                    let dirX2 = 0, dirZ2 = 0; // Next pattern
                    
                    // Static positions for non-sweep modes (centered on dance floor)
                    const staticPositions = [
                        { x: -0.3, z: -0.3 },  // Spotlight 0: front-left
                        { x: 0.3, z: -0.3 },   // Spotlight 1: front-right
                        { x: -0.3, z: 0.3 },   // Spotlight 2: back-left
                        { x: 0.3, z: 0.3 }     // Spotlight 3: back-right
                    ];
                    
                    if (!isSweepMode) {
                        // Static mode: use fixed positions based on spotlight index
                        const staticPos = staticPositions[i % staticPositions.length];
                        dirX = staticPos.x;
                        dirZ = staticPos.z;
                    } else {
                        // Sweep mode: calculate animated pattern positions
                        // Calculate CURRENT pattern position - FASTER for more energy
                        if (currentPattern === 0) {
                        // Linear sweep left to right - FAST
                        dirX1 = Math.sin(sweepPhase * 1.6) * 0.6; // 2x faster (0.8 → 1.6)
                        dirZ1 = -0.3;
                } else if (currentPattern === 1) {
                    // Circular sweep - ENERGETIC
                    dirX1 = Math.sin(sweepPhase * 1.2) * 0.5; // 2x faster (0.6 → 1.2)
                    dirZ1 = Math.cos(sweepPhase * 1.2) * 0.5;
                } else if (currentPattern === 2) {
                    // Fan sweep - RAPID
                    const fanPhase = Math.sin(sweepPhase * 1.0); // 2x faster (0.5 → 1.0)
                    dirX1 = fanPhase * 0.6;
                    dirZ1 = -0.2;
                } else if (currentPattern === 3) {
                    // Cross sweep - DYNAMIC
                    dirX1 = Math.sin(sweepPhase * 1.4) * 0.5; // 2x faster (0.7 → 1.4)
                    dirZ1 = Math.cos(sweepPhase * 1.4) * 0.5;
                } else if (currentPattern === 4) {
                    // Figure-8 sweep - FLOWING
                    dirX1 = Math.sin(sweepPhase * 1.0) * 0.6; // 2x faster (0.5 → 1.0)
                    dirZ1 = Math.sin(sweepPhase * 2.0) * 0.4; // 2x faster (1.0 → 2.0)
                } else if (currentPattern === 5) {
                    // Pulse sweep - PULSING
                    const pulsePhase = Math.sin(sweepPhase * 0.8); // 2x faster (0.4 → 0.8)
                    const angle = sweepPhase * 0.6; // 2x faster (0.3 → 0.6)
                    dirX1 = pulsePhase * Math.cos(angle) * 0.6;
                    dirZ1 = pulsePhase * Math.sin(angle) * 0.6;
                } else {
                    // STROBE FLASHING - static center position
                    dirX1 = 0;
                    dirZ1 = 0;
                }
                
                // Calculate NEXT pattern position - FASTER for more energy
                if (nextPattern === 0) {
                    dirX2 = Math.sin(sweepPhase * 1.6) * 0.6; // 2x faster
                    dirZ2 = -0.3;
                } else if (nextPattern === 1) {
                    dirX2 = Math.sin(sweepPhase * 1.2) * 0.5; // 2x faster
                    dirZ2 = Math.cos(sweepPhase * 1.2) * 0.5;
                } else if (nextPattern === 2) {
                    const fanPhase = Math.sin(sweepPhase * 1.0); // 2x faster
                    dirX2 = fanPhase * 0.6;
                    dirZ2 = -0.2;
                } else if (nextPattern === 3) {
                    dirX2 = Math.sin(sweepPhase * 1.4) * 0.5; // 2x faster
                    dirZ2 = Math.cos(sweepPhase * 1.4) * 0.5;
                } else if (nextPattern === 4) {
                    dirX2 = Math.sin(sweepPhase * 1.0) * 0.6; // 2x faster
                    dirZ2 = Math.sin(sweepPhase * 2.0) * 0.4; // 2x faster
                } else if (nextPattern === 5) {
                    const pulsePhase = Math.sin(sweepPhase * 0.8); // 2x faster
                    const angle = sweepPhase * 0.6; // 2x faster
                    dirX2 = pulsePhase * Math.cos(angle) * 0.6;
                    dirZ2 = pulsePhase * Math.sin(angle) * 0.6;
                } else {
                    dirX2 = 0;
                    dirZ2 = 0;
                }
                
                        // SMOOTH BLEND between patterns - no jumps!
                        dirX = dirX1 * (1 - blendFactor) + dirX2 * blendFactor;
                        dirZ = dirZ1 * (1 - blendFactor) + dirZ2 * blendFactor;
                    } // End sweep mode else block
                } // End pattern 0 (random/automated) else block
                
                // Set direction (pointing from truss DOWN to dance floor)
                // Direction should always have strong downward component (negative Y)
                const direction = new BABYLON.Vector3(dirX, -1.5, dirZ).normalize(); // Stronger downward bias
                spot.light.direction = direction;
                

                
                // Dynamic beam angle (simulates zoom adjustment) - subtle variation
                const baseAngle = Math.PI / 6; // 30 degrees base
                const angleVariation = Math.sin(time * 0.3 + i * 0.5) * 0.1; // ±6 degrees
                spot.light.angle = baseAngle + angleVariation;
                
                // === HYPERREALISTIC MOVING HEAD ROTATION ===
                // Rotate ALL fixture components together to match beam direction
                // Professional moving heads have pan (Y-axis) and tilt (X/Z-axis) motors
                if (spot.fixture) {
                    // Calculate target point where beam aims (8m down the beam)
                    const targetPoint = spot.basePos.add(direction.scale(8));
                    
                    // Method 1: Use lookAt for fixture body (most accurate)
                    spot.fixture.lookAt(targetPoint);
                    
                    // Rotate ALL fixture components to match the fixture body orientation
                    // This creates the illusion that the entire moving head is tracking the target
                    const fixtureRotation = spot.fixture.rotationQuaternion || BABYLON.Quaternion.FromEulerAngles(
                        spot.fixture.rotation.x,
                        spot.fixture.rotation.y,
                        spot.fixture.rotation.z
                    );
                    
                    // Apply same rotation to all visible components
                    if (spot.lens) {
                        spot.lens.rotationQuaternion = fixtureRotation.clone();
                    }
                    if (spot.lightSource) {
                        spot.lightSource.rotationQuaternion = fixtureRotation.clone();
                    }
                    if (spot.bezel) {
                        spot.bezel.rotationQuaternion = fixtureRotation.clone();
                    }
                    if (spot.flare) {
                        spot.flare.rotationQuaternion = fixtureRotation.clone();
                    }
                    
                    // Update light flare intensity based on viewing angle (brighter when looking at lens)
                    if (spot.flareMat && this.camera) {
                        const cameraDir = this.camera.position.subtract(spot.basePos).normalize();
                        const lightDir = direction.scale(-1); // Light points opposite of beam direction
                        const dot = BABYLON.Vector3.Dot(cameraDir, lightDir);
                        const brightness = Math.max(0, dot); // 0 to 1
                        spot.flareMat.alpha = 0.2 + (brightness * 0.3); // 0.2 to 0.5 based on angle
                    }
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
                    
                    // Beam visibility and color - HYPERREALISTIC with subtle variation + FLASHING
                    // Strobe is controlled by dedicated toggle button (simple on/off)
                    const sweepPhase = globalPhase * audioSpeedMultiplier;
                    
                    // Strobe is simply controlled by the STROBE toggle button
                    const isStrobeEnabled = this.spotStrobeActive;
                    
                    let beamVisible = this.lightsActive;
                    if (isStrobeEnabled) {
                        // STROBE: Rapid on/off flashing at 8Hz (8 flashes per second)
                        const flashPhase = sweepPhase * 2.5;
                        const flashOn = Math.floor(flashPhase * 8) % 2 === 0;
                        beamVisible = beamVisible && flashOn;
                    }
                    
                    spot.beam.visibility = beamVisible ? 1.0 : 0;
                    spot.light.intensity = beamVisible ? 12 : 0; // Also control light intensity
                    
                    // Subtle atmospheric variation - simulates particles moving through beam
                    const atmosphericNoise = Math.sin(time * 3 + i * 0.5) * 0.1; // Subtle flicker
                    
                    // Update emissive color with variation (audio disabled)
                    const baseIntensity = 0.3 + atmosphericNoise;
                    spot.beamMat.emissiveColor = this.currentSpotColor.scale(baseIntensity);
                    spot.beamMat.emissiveIntensity = 1.8; // Constant intensity
                    
                    // Very subtle alpha variation - creates "depth" in the beam
                    spot.beamMat.alpha = 0.04 + Math.abs(atmosphericNoise) * 0.02;
                    

                    
                    // Update HYPERREALISTIC floor light splash - 3-layer gradient effect
                    if (spot.lightPool) {
                        if (this.lightsActive && beamVisible) { // Also check beamVisible for flashing
                            // Calculate beam width at floor (cone: 0.25m → 2.0m)
                            const beamProgress = centerDistanceToFloor / beamLength;
                            const beamWidthAtFloor = 0.25 + 1.75 * beamProgress; // 1.75 = 2.0 - 0.25
                            const baseSize = (beamWidthAtFloor * 0.5) * zoomFactor;
                            
                            // Atmospheric shimmer (audio disabled)
                            const atmosphericShimmer = 1.0 + Math.sin(time * 2 + i) * 0.1;
                            
                            // Reuse floor intersection point
                            const poolPosition = floorIntersection;
                            
                            // CORE (bright center hotspot)
                            poolPosition.y = 0.04;
                            spot.lightPoolCore.position.copyFrom(poolPosition);
                            const coreSize = baseSize * 0.3;
                            spot.lightPoolCore.scaling.set(coreSize, coreSize, 1);
                            spot.lightPoolCore.visibility = 1.0;
                            spot.poolCoreMat.emissiveColor = this.currentSpotColor.scale(2.5);
                            
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
                            // CRITICAL: Hide floor pools immediately when lights turn off or flashing off
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
                
                // PROFESSIONAL CONSTANT INTENSITY (audio disabled)
                const baseIntensity = 18; // Professional moving head (300W equivalent)
                const smoothPulse = Math.sin(time * 2.5) * 3; // Smooth breathing effect
                
                spot.light.intensity = this.lightsActive ? (baseIntensity + smoothPulse) : 0;
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
        
        // Update truss-mounted light fixtures - MATCH SPOTLIGHT COLOR + FLASHING
        // Update spotlight fixture lenses - make them VERY BRIGHT when active
        // These are the actual visible light sources in the moving heads
        if (this.spotlights && this.spotlights.length > 0) {
            // Check if we're in flashing pattern using same logic as beams
            const sweepPhase = globalPhase * audioSpeedMultiplier;
            const patternCycle = (sweepPhase / 10) % 7;
            const currentPattern = Math.floor(patternCycle);
            const nextPattern = (currentPattern + 1) % 7;
            const isFlashing = (currentPattern === 6 || nextPattern === 6);
            const flashPhase = sweepPhase * 2.5;
            const flashOn = Math.floor(flashPhase * 8) % 2 === 0;
            
            this.spotlights.forEach((spot, i) => {
                if (spot.fixture) {
                    // Find corresponding lens from trussLights if available
                    const trussLight = this.trussLights && this.trussLights[i];
                    if (trussLight && trussLight.lensMat) {
                        const fixtureVisible = this.lightsActive && (!isFlashing || flashOn);
                        
                        if (fixtureVisible) {
                            // EXTREMELY BRIGHT lens when active - the actual light source (audio disabled)
                            const pulse = 0.8 + Math.sin(time * 4 + i * 0.5) * 0.2; // 0.6-1.0
                            trussLight.lensMat.emissiveColor = this.currentSpotColor.scale(5.0 * pulse); // COLORED, not white!
                            
                            // Update the bright inner light source sphere
                            if (trussLight.sourceMat) {
                                trussLight.sourceMat.emissiveColor = this.currentSpotColor.scale(8.0 * pulse); // Even brighter center, COLORED
                            }
                        } else {
                            // Completely dark when off or flashing off
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
        
        // Update strobes - respects strobesActive control
        // Strobe lights animation
        if (this.strobes && this.strobes.length > 0) {
            if (this.strobesActive) {
                this.strobes.forEach((strobe, i) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        strobe.flashDuration -= 0.016;
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    const intensityVariation = strobe.currentIntensity || 80; // Store current intensity (increased from 50)
                    const burstPhase = Math.floor(strobe.flashDuration * 40) % 2; // Fast bursts
                    const intensity = burstPhase === 0 ? intensityVariation : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity * 1.5); // Brighter emissive (1.5x)
                    strobe.light.intensity = intensity * 200; // MUCH brighter (was 120, now 200)
                    strobe.light.range = 80 + (intensityVariation * 0.8); // Wider range (was 50, now 80)
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        strobe.light.intensity = 0;
                        strobe.nextFlashTime = time + 0.1 + Math.random() * 0.9; // Frequent flashes (0.1-1.0s)
                    }
                } else {
                    // Check if it's time for next flash (ALWAYS fires, no condition)
                    if (time >= strobe.nextFlashTime) {
                        // Vary intensity: MUCH BRIGHTER - 60% bright (60-80), 40% super bright (80-100)
                        strobe.currentIntensity = Math.random() > 0.6 ? 
                            (60 + Math.random() * 20) : // Bright (was 30-40, now 60-80)
                            (80 + Math.random() * 20);  // Super bright (was 50-70, now 80-100)
                        
                        strobe.flashDuration = 0.15 + Math.random() * 0.2; // Duration 0.15-0.35s
                    }
                }
                });
            } else {
                // Turn off strobes when disabled
                this.strobes.forEach((strobe) => {
                    strobe.material.emissiveColor = this.cachedColors.black;
                    strobe.light.intensity = 0;
                    strobe.flashDuration = 0;
                });
            }
        }
        
        // Bartender removed - will be replaced with 3D model later
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

    /**
     * Helper method to update LED panel emissive colors
     * Reduces code duplication across pattern methods
     */
    updateLEDPanel(panel, color, brightness) {
        if (brightness === 0) {
            panel.material.emissiveColor = this.cachedColors.black;
        } else if (brightness === 1) {
            panel.material.emissiveColor = color;
        } else {
            panel.material.emissiveColor = color.scale(brightness);
        }
    }

    patternWaveHorizontal(color, time, audioData) {
        // AUDIO REACTIVE: Speed increases with bass
        const speed = 3 + (audioData ? audioData.bass * 3 : 0);
        this.ledPanels.forEach(panel => {
            // Reduced range for better contrast: 0.1 to 0.5
            const brightness = 0.1 + 0.4 * Math.sin(panel.col * 0.8 + this.ledTime * speed);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternWaveVertical(color, time, audioData) {
        // AUDIO REACTIVE: Speed increases with bass
        const speed = 3 + (audioData ? audioData.bass * 3 : 0);
        this.ledPanels.forEach(panel => {
            // Reduced range for better contrast: 0.1 to 0.5
            const brightness = 0.1 + 0.4 * Math.sin(panel.row * 0.8 + this.ledTime * speed);
            this.updateLEDPanel(panel, color, brightness);
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
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternDiagonalWipe(color, time, audioData) {
        // Animated diagonal wipe - clear blackout division
        const wipePos = (Math.sin(this.ledTime) + 1) * 7;
        this.ledPanels.forEach(panel => {
            const diagonalPos = panel.col + panel.row * 1.5;
            const brightness = (diagonalPos < wipePos) ? 1.0 : 0;
            this.updateLEDPanel(panel, color, brightness);
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
        // VR button (optional - only if element exists)
        const vrButton = document.getElementById('vrButton');
        if (vrButton) {
            vrButton.addEventListener('click', async () => {
                try {
                    if (vrHelper.baseExperience) {
                        await vrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
                    }
                } catch (error) {
                    console.error('VR Error:', error);
                    alert('VR not available. Make sure your Quest 3S is connected via Link/Air Link.');
                }
            });
        }
        
        // Camera presets - support both old class and new data attribute
        document.querySelectorAll('[data-camera-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.cameraPreset;
                this.moveCameraToPreset(preset);
            });
        });
        
        // Music (optional - only if elements exist)
        const playMusicBtn = document.getElementById('playMusicBtn');
        if (playMusicBtn) {
            playMusicBtn.addEventListener('click', () => {
                this.playMusic();
            });
        }
        
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

    setupVJControlInteraction() {
        // Setup click handling for VJ control buttons and audio stream in 3D scene
        this.scene.onPointerDown = (evt, pickResult) => {
            if (pickResult.hit && pickResult.pickedMesh) {
                // Check if audio stream button was clicked
                if (this.audioStreamButton && pickResult.pickedMesh === this.audioStreamButton.mesh) {
                    this.toggleAudioStream();
                    return;
                }
                
                // Check if a VJ control button was clicked
                const clickedButton = this.vjControlButtons.find(btn => btn.mesh === pickResult.pickedMesh);
                
                if (clickedButton) {
                    console.log(`🎛️ VJ Control: ${clickedButton.label} clicked`);
                    
                    // Track VJ interaction - but DON'T pause patterns for pattern/mode cycling
                    // Only pause for manual light toggles (ON/OFF controls)
                    const isPatternControl = (clickedButton.control === "cyclePattern" || 
                                             clickedButton.control === "cycleSpotMode" ||
                                             clickedButton.control === "changeColor");
                    
                    if (!isPatternControl) {
                        this.lastVJInteraction = performance.now() / 1000;
                        this.vjManualMode = true;
                        console.log("🎛️ VJ manual mode: Automated patterns paused for 5 minutes");
                    }
                    
                    if (clickedButton.control === "changeColor") {
                        // Change color button - cycle to next color
                        this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
                        this.currentSpotColor = this.spotColorList[this.spotColorIndex];
                        this.lastColorChange = performance.now() / 1000;
                        
                        // Update ALL light colors immediately (specular for reflections, NO diffuse ambient)
                        if (this.spotlights) {
                            this.spotlights.forEach((spot, i) => {
                                // spot.light.diffuse stays black - no ambient colored glow
                                spot.light.specular = this.currentSpotColor; // Specular for reflections
                                spot.color = this.currentSpotColor;
                                
                                // Update fixture lens and light source colors
                                if (this.trussLights && this.trussLights[i]) {
                                    const trussLight = this.trussLights[i];
                                    if (trussLight.lensMat && this.lightsActive) {
                                        trussLight.lensMat.emissiveColor = this.currentSpotColor.scale(5.0);
                                    }
                                    if (trussLight.sourceMat && this.lightsActive) {
                                        trussLight.sourceMat.emissiveColor = this.currentSpotColor.scale(8.0);
                                    }
                                }
                            });
                        }
                        
                        // Flash button feedback
                        clickedButton.material.emissiveColor = clickedButton.onColor;
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 200);
                        
                        console.log(`🎨 Color changed to index ${this.spotColorIndex}`);
                    } else if (clickedButton.control === "changeMirrorBallColor") {
                        // Change mirror ball spotlight color - cycle through colors
                        this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
                        this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
                        
                        // Update all spotlight colors (only real lights, skip nulls)
                        if (this.mirrorBallSpotlights) {
                            this.mirrorBallSpotlights.forEach(light => {
                                if (light) light.diffuse = this.mirrorBallSpotlightColor.clone();
                            });
                        }
                        
                        // Update all beam colors
                        if (this.mirrorBallBeams) {
                            this.mirrorBallBeams.forEach(beam => {
                                beam.material.emissiveColor = this.mirrorBallSpotlightColor.clone();
                            });
                        }
                        
                        // Update housing and lens glow colors (hyperrealistic fixtures)
                        if (this.mirrorBallHousings) {
                            this.mirrorBallHousings.forEach(housing => {
                                housing.material.emissiveColor = this.mirrorBallSpotlightColor.scale(0.2); // Housing subtle glow
                                housing.lensMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(5.0); // Lens bright
                                housing.sourceMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(8.0); // Light source very bright
                                housing.flareMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(3.0); // Flare medium bright
                            });
                        }
                        
                        // Update reflection spot colors (visual only, no lights)
                        if (this.mirrorReflectionSpots) {
                            this.mirrorReflectionSpots.forEach(spot => {
                                // Color will be applied in animation loop with shimmer effect
                                // Just store the base material reference
                            });
                        }
                        
                        // Flash button with current color
                        clickedButton.material.emissiveColor = this.mirrorBallSpotlightColor;
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 300);
                        
                        const colorNames = ["White", "Red", "Blue", "Green", "Magenta", "Yellow", "Cyan", "Orange", "Purple"];
                        console.log(`🪩 Mirror ball color: ${colorNames[this.mirrorBallColorIndex]}`);
                    } else if (clickedButton.control === "cycleSpotMode") {
                        // Cycle through spotlight modes: 0=strobe+sweep, 1=sweep only, 2=strobe static, 3=static
                        this.spotlightMode = (this.spotlightMode + 1) % 4;
                        
                        // Flash button feedback with different colors for each mode
                        const modeColors = [
                            new BABYLON.Color3(1, 0, 1),    // Mode 0: Magenta (strobe+sweep)
                            new BABYLON.Color3(0, 1, 1),    // Mode 1: Cyan (sweep only)
                            new BABYLON.Color3(1, 1, 0),    // Mode 2: Yellow (strobe static)
                            new BABYLON.Color3(0, 1, 0)     // Mode 3: Green (static)
                        ];
                        clickedButton.material.emissiveColor = modeColors[this.spotlightMode];
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 300);
                        
                        const modeNames = ["STROBE+SWEEP", "SWEEP ONLY", "STROBE STATIC", "STATIC"];
                        console.log(`💡 Spotlight mode: ${modeNames[this.spotlightMode]}`);
                    } else if (clickedButton.control === "cyclePattern") {
                        // Cycle through spotlight patterns: 0=random, 1=static down, 2=sync sweep
                        this.spotlightPattern = (this.spotlightPattern + 1) % 3;
                        
                        // Flash button feedback with different colors for each pattern
                        const patternColors = [
                            new BABYLON.Color3(1, 0, 1),    // Pattern 0: Magenta (random)
                            new BABYLON.Color3(0, 1, 1),    // Pattern 1: Cyan (static down)
                            new BABYLON.Color3(1, 0.5, 1)   // Pattern 2: Pink (sync sweep)
                        ];
                        clickedButton.material.emissiveColor = patternColors[this.spotlightPattern];
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 300);
                        
                        const patternNames = ["RANDOM", "STATIC DOWN", "SYNC SWEEP"];
                        console.log(`🎯 Spotlight pattern: ${patternNames[this.spotlightPattern]}`);
                    } else {
                        // Toggle on/off control
                        this[clickedButton.control] = !this[clickedButton.control];
                        
                        // Update button appearance
                        clickedButton.material.emissiveColor = this[clickedButton.control] ? 
                            clickedButton.onColor : clickedButton.offColor;
                        
                        console.log(`${clickedButton.label}: ${this[clickedButton.control] ? 'ON' : 'OFF'}`);
                    }
                }
            }
        };
        
        console.log("✅ VJ Control interaction enabled - click buttons to control lights!");
    }

    toggleAudioStream() {
        if (!this.audioStreamButton) return;
        
        if (this.audioStreamButton.isPlaying) {
            // Stop audio
            if (this.audioElement) {
                this.audioElement.pause();
                this.audioElement.currentTime = 0;
            }
            this.audioStreamButton.isPlaying = false;
            this.audioStreamButton.material.emissiveColor = new BABYLON.Color3(0, 0.8, 0); // Green
            console.log("🔇 Audio stream stopped");
        } else {
            // Show in-VR UI for stream URL input
            this.showAudioStreamInputUI();
        }
    }

    showAudioStreamInputUI() {
        // Pause pointer lock to allow input interaction
        if (this.scene.activeCamera && this.scene.activeCamera.detachControl) {
            this.scene.activeCamera.detachControl();
        }
        
        // Create audio element NOW during user interaction to satisfy autoplay policy
        if (!this.audioElement) {
            this.audioElement = document.createElement('audio');
            this.audioElement.crossOrigin = "anonymous";
            this.audioElement.loop = true;
            this.audioElement.autoplay = true;
            this.audioElement.preload = "auto";
            this.audioElement.style.display = 'none';
            document.body.appendChild(this.audioElement);
            console.log("🎵 Audio element created during user interaction");
        }
        
        // Create HTML input overlay (NO 3D panel - was blocking view)
        const inputDiv = document.createElement('div');
        inputDiv.id = 'vrAudioInput';
        inputDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(20, 20, 30, 0.95);
            border: 3px solid #00ff88;
            border-radius: 15px;
            padding: 30px;
            z-index: 10000;
            text-align: center;
            box-shadow: 0 0 30px rgba(0, 255, 136, 0.5);
        `;
        
        inputDiv.innerHTML = `
            <h2 style="color: #00ff88; margin: 0 0 20px 0; font-size: 24px;">🎵 Audio Stream</h2>
            <input type="text" id="audioUrlInput" placeholder="Paste URL or drop audio file here" 
                style="width: 400px; padding: 12px; font-size: 16px; border: 2px solid #00ff88; 
                background: rgba(0, 0, 0, 0.7); color: #00ff88; border-radius: 5px; margin-bottom: 10px;">
            <div style="margin: 10px 0;">
                <button id="audioFileBrowseBtn" style="padding: 8px 20px; font-size: 14px; 
                    background: #0088ff; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    📁 Browse File
                </button>
                <input type="file" id="audioFileInput" accept="audio/*" style="display: none;">
            </div>
            <div style="margin-top: 15px;">
                <button id="audioPlayBtn" style="padding: 12px 30px; font-size: 16px; margin: 0 10px; 
                    background: #00ff88; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    ▶️ PLAY
                </button>
                <button id="audioCancelBtn" style="padding: 12px 30px; font-size: 16px; margin: 0 10px; 
                    background: #ff4444; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                    ✖️ CANCEL
                </button>
            </div>
            <p style="color: #888; font-size: 14px; margin-top: 15px;">Stream URL, local file, or drag & drop</p>
        `;
        
        document.body.appendChild(inputDiv);
        
        // Store camera reference for cleanup
        const camera = this.scene.activeCamera;
        
        // Variable to store selected file
        let selectedFile = null;
        
        // Focus input after slight delay
        setTimeout(() => {
            const input = document.getElementById('audioUrlInput');
            if (input) {
                input.focus();
                input.select(); // Select all text for easy replacement
            }
        }, 100);
        
        // File browse button handler
        document.getElementById('audioFileBrowseBtn').onclick = (e) => {
            e.preventDefault();
            document.getElementById('audioFileInput').click();
        };
        
        // File input handler
        document.getElementById('audioFileInput').onchange = (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('audio/')) {
                selectedFile = file;
                document.getElementById('audioUrlInput').value = `📁 ${file.name}`;
                console.log(`📁 File selected: ${file.name}`);
            }
        };
        
        // Drag and drop support
        const urlInput = document.getElementById('audioUrlInput');
        urlInput.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            urlInput.style.borderColor = '#00ffff';
            urlInput.style.background = 'rgba(0, 100, 100, 0.3)';
        };
        
        urlInput.ondragleave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            urlInput.style.borderColor = '#00ff88';
            urlInput.style.background = 'rgba(0, 0, 0, 0.7)';
        };
        
        urlInput.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            urlInput.style.borderColor = '#00ff88';
            urlInput.style.background = 'rgba(0, 0, 0, 0.7)';
            
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('audio/')) {
                selectedFile = file;
                urlInput.value = `📁 ${file.name}`;
                console.log(`📁 File dropped: ${file.name}`);
            } else {
                console.warn('⚠️ Please drop an audio file');
            }
        };
        
        // Paste support for files
        urlInput.onpaste = (e) => {
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file' && item.type.startsWith('audio/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    selectedFile = file;
                    urlInput.value = `📁 ${file.name}`;
                    console.log(`📁 File pasted: ${file.name}`);
                    break;
                }
            }
        };
        
        // Cleanup function
        const cleanup = () => {
            const div = document.getElementById('vrAudioInput');
            if (div && div.parentNode) {
                document.body.removeChild(div);
            }
            // Re-attach camera control
            if (camera && camera.attachControl) {
                camera.attachControl(this.canvas, true);
            }
        };
        
        // Handle play button
        document.getElementById('audioPlayBtn').onclick = () => {
            if (selectedFile) {
                // Play local file
                cleanup();
                this.startAudioFromFile(selectedFile);
            } else {
                // Play URL
                const url = document.getElementById('audioUrlInput').value.trim();
                // Remove file indicator if present
                const cleanUrl = url.startsWith('📁') ? '' : url;
                cleanup();
                this.startAudioStream(cleanUrl);
            }
        };
        
        // Handle cancel button
        document.getElementById('audioCancelBtn').onclick = () => {
            cleanup();
        };
        
        // Handle Enter key
        document.getElementById('audioUrlInput').onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('audioPlayBtn').click();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
            }
        };
        
        // Handle Escape key globally
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    startAudioStream(url) {
        // Audio element should already exist from showAudioStreamInputUI()
        if (!this.audioElement) {
            console.error("❌ Audio element not created! This shouldn't happen.");
            return;
        }
        
        // Set source
        if (url === "") {
            this.audioElement.src = "https://stream.example.com/radio"; // Replace with actual demo
            console.log("🎵 Using demo audio stream");
        } else {
            this.audioElement.src = url;
            console.log(`🎵 Loading audio stream: ${url}`);
        }
        
        // Force load
        this.audioElement.load();
        
        // Play immediately - should work because element was created during user gesture
        setTimeout(() => {
            const playPromise = this.audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.audioStreamButton.isPlaying = true;
                    this.audioStreamButton.material.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red when playing
                    console.log("🔊 Audio stream playing automatically!");
                    
                    // Connect to audio analyzer
                    if (!this.audioContext && window.AudioContext) {
                        this.audioContext = new AudioContext();
                        this.audioAnalyser = this.audioContext.createAnalyser();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        this.audioAnalyser.connect(this.audioContext.destination);
                        this.audioAnalyser.fftSize = 256;
                        console.log("🎚️ Audio analyzer connected");
                    }
                }).catch(err => {
                    console.error("❌ Failed to play audio:", err);
                    this.showErrorMessage("Audio loaded. Click play on the audio button to start.");
                });
            }
        }, 100); // Small delay to ensure load completes
    }

    startAudioFromFile(file) {
        console.log(`🎵 Loading audio file: ${file.name}`);
        
        // Audio element should already exist from showAudioStreamInputUI()
        if (!this.audioElement) {
            console.error("❌ Audio element not created! This shouldn't happen.");
            return;
        }
        
        // Create object URL from file
        const fileUrl = URL.createObjectURL(file);
        this.audioElement.src = fileUrl;
        
        // Force load
        this.audioElement.load();
        
        // Play immediately - should work because element was created during user gesture
        setTimeout(() => {
            const playPromise = this.audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.audioStreamButton.isPlaying = true;
                    this.audioStreamButton.material.emissiveColor = new BABYLON.Color3(1, 0, 0); // Red when playing
                    console.log(`🔊 Playing audio file automatically: ${file.name}`);
                    
                    // Connect to audio analyzer
                    if (!this.audioContext && window.AudioContext) {
                        this.audioContext = new AudioContext();
                        this.audioAnalyser = this.audioContext.createAnalyser();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        this.audioAnalyser.connect(this.audioContext.destination);
                        this.audioAnalyser.fftSize = 256;
                        console.log("🎚️ Audio analyzer connected");
                    }
                }).catch(err => {
                    console.error("❌ Failed to play audio file:", err);
                    this.showErrorMessage(`Audio loaded. Click play on the audio button to start.`);
                });
            }
        }, 100); // Small delay to ensure load completes
    }

    showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(200, 0, 0, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            z-index: 10000;
            font-size: 18px;
            font-weight: bold;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            document.body.removeChild(errorDiv);
        }, 3000);
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
        const musicUrlInput = document.getElementById('musicUrl');
        if (!musicUrlInput) return; // No music input available
        
        const url = musicUrlInput.value;
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
        
        // Show success message (if element exists)
        if (musicUrlInput) {
            musicUrlInput.style.borderColor = '#00ff00';
            setTimeout(() => {
                musicUrlInput.style.borderColor = '';
            }, 2000);
        }
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
            
            // Only update if element exists
            if (this.fpsElement) {
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
