// VR Club - HYPERREALISTIC Babylon.js Implementation
// Ultra-realistic club environment for Quest 3S VR

// Debug mode (set to false for production to disable verbose logging)
const DEBUG_MODE = false; // Set to false to disable console.log statements

// Conditional logging helper
const log = {
    info: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => console.warn(...args), // Always show warnings
    error: (...args) => console.error(...args) // Always show errors
};

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
            antialias: true,
            // VR Anti-Aliasing: Enable MSAA for smooth edges in VR headsets
            // FXAA alone causes jaggies in VR - MSAA is essential
            antialiasingSamples: 4, // 4x MSAA for VR quality
            // PERFORMANCE: Additional engine optimizations
            doNotHandleContextLost: true, // Skip context lost handling for performance
            useHighPrecisionFloats: false // Use medium precision for better performance
        });
        
        // PERFORMANCE: Enable hardware scaling mode (renders at lower resolution, scales up)
        this.engine.setHardwareScalingLevel(1.0); // 1.0 = native, increase for lower res
        
        // VR optimization settings configuration - ENHANCED FOR HYPERREALISM
        this.vrSettings = {
            desktop: {
                exposure: 1.05,
                contrast: 1.5, // Increased contrast for deeper blacks
                bloomWeight: 0.3, // Stronger bloom for neon lights
                bloomThreshold: 0.5, // Lower threshold to catch more light sources
                bloomScale: 0.4, // Larger bloom spread
                glowIntensity: 0.8, // Stronger glow
                ambientIntensity: 0.1, // Lower ambient for more dramatic lighting
                environmentIntensity: 0.4, // Stronger PBR reflections
                clearColor: new BABYLON.Color3(0.005, 0.005, 0.01), // Almost black background
                grainEnabled: true, // Enable subtle grain for filmic look on desktop
                chromaticAberrationEnabled: true, // Enable subtle CA for lens realism
                toneMappingEnabled: true,
                fxaaEnabled: true,
                sharpenAmount: 0.5, // Sharper details
                fogDensity: 0.02 // Slightly denser fog for volumetric feel
            },
            vr: {
                exposure: 0.7, // Slightly brighter for VR visibility
                contrast: 1.7, // Enhanced contrast for VR depth
                bloomWeight: 0.12, // Optimized VR bloom
                bloomThreshold: 0.8, // Balanced threshold for VR
                bloomScale: 0.25, // Enhanced VR bloom scale
                glowIntensity: 0.4, // Enhanced VR glow
                ambientIntensity: 0.08, // Improved VR ambient
                environmentIntensity: 0.12, // Enhanced VR reflections
                clearColor: new BABYLON.Color3(0, 0, 0),
                grainEnabled: false,
                chromaticAberrationEnabled: false,
                toneMappingEnabled: false,
                edgeSharpness: 0.7, // Enhanced sharpness for VR clarity
                colorSharpness: 0.9, // Enhanced color definition
                fxaaEnabled: true,  // Enable FXAA for smooth edges in VR
                fogDensity: 0.01 // Reduced fog for VR performance
            }
        };
        
        // Detect device capabilities for optimal light count
        this.maxLights = this.detectMaxLights();
        log.info(`🎮 Device detected - Max lights per material: ${this.maxLights}`);
        
        // Initialize material factory for centralized material creation
        this.materialFactory = new MaterialFactory(null, this.maxLights, log); // Scene set later in init()
        
        // Initialize light factory for centralized light creation
        this.lightFactory = null; // Initialized after scene creation
        
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioSource = null;
        this.audioElement = null;
        
        this.vuMeters = [];
        
        // Cache Color3 objects for performance (avoid creating new ones every frame)
        this.cachedColors = {
            red: new BABYLON.Color3(1, 0, 0),
            green: new BABYLON.Color3(0, 1, 0),
            blue: new BABYLON.Color3(0, 0, 1),
            magenta: new BABYLON.Color3(1, 0, 1),
            yellow: new BABYLON.Color3(1, 1, 0),
            cyan: new BABYLON.Color3(0, 1, 1),
            white: new BABYLON.Color3(10, 10, 10),
            black: new BABYLON.Color3(0, 0, 0),
            orange: new BABYLON.Color3(1, 0.5, 0),
            purple: new BABYLON.Color3(0.5, 0, 1)
        };
        
        // PERFORMANCE: Reusable Vector3 pool for animation calculations (reduces GC pressure)
        this.vecPool = {
            direction: new BABYLON.Vector3(0, 0, 0),
            up: new BABYLON.Vector3(0, 1, 0),
            temp1: new BABYLON.Vector3(0, 0, 0),
            temp2: new BABYLON.Vector3(0, 0, 0),
            rayOrigin: new BABYLON.Vector3(0, 0, 0),
            rayDir: new BABYLON.Vector3(0, 0, 0)
        };
        
        // PERFORMANCE: Frame counters for staggered updates
        this.frameCounter = 0;
        this.laserUpdateFrame = 0;
        
        // Cache commonly used Vector3 positions for performance
        this.cachedVectors = {
            zero: BABYLON.Vector3.Zero(),
            up: BABYLON.Vector3.Up(),
            down: BABYLON.Vector3.Down(),
            gravity: new BABYLON.Vector3(0, -9.81, 0),
            danceFloor: new BABYLON.Vector3(0, 0, -12),
            djBooth: new BABYLON.Vector3(0, 0.95, -23),
            mirrorBall: new BABYLON.Vector3(0, 6.5, -12)
        };
        
        // Initialize spotlight color list - reference cached colors to avoid duplicates
        this.spotColorList = [
            this.cachedColors.red,      // Red
            this.cachedColors.blue,     // Blue  
            this.cachedColors.green,    // Green
            this.cachedColors.magenta,  // Magenta
            this.cachedColors.yellow,   // Yellow
            this.cachedColors.cyan,     // Cyan
            this.cachedColors.orange,   // Orange
            this.cachedColors.purple,   // Purple
            this.cachedColors.white     // White (dimmed to 1,1,1 for spotlights)
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
        this.laserSheetActive = false; // Laser sheet effect
        
        // Spotlight pattern and speed controls
        this.spotlightPattern = 1; // 0=random, 1=static down (DEFAULT), 2=synchronized sweep
        this.spotlightSpeed = 1.0; // Speed multiplier (0.5x to 3.0x)
        
        // Add color variations for mirror ball (soft pastels) - reference cached colors
        this.cachedColors.whiteSpot = new BABYLON.Color3(1, 1, 1); // Full white for mirror ball
        this.cachedColors.redSoft = new BABYLON.Color3(1, 0.3, 0.3);
        this.cachedColors.blueSoft = new BABYLON.Color3(0.3, 0.3, 1);
        this.cachedColors.greenSoft = new BABYLON.Color3(0.3, 1, 0.3);
        this.cachedColors.magentaSoft = new BABYLON.Color3(1, 0.3, 1);
        this.cachedColors.yellowSoft = new BABYLON.Color3(1, 1, 0.3);
        this.cachedColors.cyanSoft = new BABYLON.Color3(0.3, 1, 1);
        this.cachedColors.orangeSoft = new BABYLON.Color3(1, 0.6, 0.3);
        this.cachedColors.purpleSoft = new BABYLON.Color3(0.7, 0.3, 1);
        
        // Mirror ball spotlight color (configurable) - reference cached colors
        this.mirrorBallSpotlightColor = this.cachedColors.magentaSoft; // Default: magenta (visible color)
        this.mirrorBallColorIndex = 4; // Start at magenta
        this.mirrorBallColors = [
            this.cachedColors.magentaSoft,  // Magenta (start here - visible)
            this.cachedColors.cyanSoft,     // Cyan
            this.cachedColors.yellowSoft,   // Yellow
            this.cachedColors.redSoft,      // Red
            this.cachedColors.blueSoft,     // Blue
            this.cachedColors.greenSoft,    // Green
            this.cachedColors.orangeSoft,   // Orange
            this.cachedColors.purpleSoft,   // Purple
            this.cachedColors.whiteSpot     // White (classic) - now last
        ];
        
        // Spotlight mode: 0=strobe+sweep, 1=sweep only, 2=strobe static, 3=static
        this.spotlightMode = 0;
        this.spotStrobeActive = true; // Simple strobe toggle (true = strobe on)
        
        // Independent speed controls per light type (0.1 = 10% speed, 2.0 = 200% speed)
        this.spotlightSpeed = 1.0;  // Spotlight sweep/rotation speed
        this.laserSpeed = 1.0;      // Laser rotation speed
        this.mirrorBallSpeed = 1.0; // Mirror ball rotation speed
        this.ledWallSpeed = 1.0;    // LED wall animation speed
        this.strobeSpeed = 1.0;     // Strobe flash rate
        
        // VJ manual control tracking - pause automated patterns when VJ interacts
        this.lastVJInteraction = 0;
        
        // Multiplayer networking
        this.networkManager = null;
        this.avatarManager = null;
        this.isMultiplayer = false;
        this.vjManualMode = false;
        this.VJ_TIMEOUT = 60; // Seconds before resuming automated patterns (1 minute)
        
        // Animation phase tracking for smooth spotlight animations
        this.lastActivePhase = 0; // Initialize phase counter
        
        // === MODULAR LIGHTING SYSTEMS ===
        // These are the new refactored system classes that can replace inline code
        // Set to null here, initialized in init() after scene creation
        this.systems = {
            laser: null,
            spotlight: null,
            mirrorBall: null,
            ledWall: null,
            strobe: null,
            haze: null,
            vjControl: null
        };
        // Toggle to use new modular systems vs legacy inline code
        this.useModularSystems = false; // Disabled - modular spotlights cause too many lights error
        
        this.init();
    }

    applyVRSettings(xrCamera) {
        const vr = this.vrSettings.vr;
        
        // Apply post-processing to VR camera
        if (this.renderPipeline) {
            // Fix: Remove desktop camera first to avoid "reuse" error
            if (this.camera) {
                this.renderPipeline.removeCamera(this.camera);
            }
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
            
            // OPTIMIZED: Reduce bloom significantly in VR for performance
            if (this.renderPipeline.bloomEnabled) {
                this.renderPipeline.bloomWeight = 0.05; // OPTIMIZED: Much lower than desktop
                this.renderPipeline.bloomThreshold = 0.9; // Higher threshold = fewer pixels bloomed
                this.renderPipeline.bloomScale = 0.15; // Smaller bloom spread
            }
        }

        // OPTIMIZED: Disable SSAO in VR (too expensive)
        if (this.ssaoPipeline) {
            // Detach desktop camera to save performance
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", this.camera);
            // Also detach XR camera just in case
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", xrCamera);
        }
        
        // #5 OPTIMIZED: Use hardware scaling for VR (render at 80% resolution)
        this.engine.setHardwareScalingLevel(1.25);
        
        // #4 OPTIMIZED: Reduce glow layer intensity significantly in VR
        if (this.glowLayer) this.glowLayer.intensity = 0.15; // Much lower than desktop
        
        const ambient = this.scene.getLightByName('ambient');
        if (ambient) ambient.intensity = vr.ambientIntensity;
        
        this.scene.environmentIntensity = vr.environmentIntensity;
        this.scene.clearColor = vr.clearColor;
        this.scene.fogDensity = vr.fogDensity;
        
        // #6 OPTIMIZED: Freeze static materials to prevent shader recompilation
        this.scene.materials.forEach(mat => {
            if (mat.name && !mat.name.includes('beam') && !mat.name.includes('laser') && 
                !mat.name.includes('led') && !mat.name.includes('strobe') && !mat.name.includes('spot')) {
                mat.freeze();
            }
        });
        
        // #7 OPTIMIZED: Reduce shadow quality for better VR performance
        this.scene.lights.forEach(light => {
            if (light.getShadowGenerator) {
                const shadowGen = light.getShadowGenerator();
                if (shadowGen) {
                    shadowGen.usePercentageCloserFiltering = false;
                    shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
                }
            }
        });
    }
    
    applyDesktopSettings() {
        const desktop = this.vrSettings.desktop;
        
        // Restore post-processing
        if (this.renderPipeline) {
            // Fix: Add desktop camera back
            if (this.camera) {
                this.renderPipeline.addCamera(this.camera);
            }
            
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

        // Enable SSAO in Desktop mode
        if (this.ssaoPipeline) {
            this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", this.camera);
        }
        
        // Restore hardware scaling to native resolution
        this.engine.setHardwareScalingLevel(1.0);
        
        // Restore scene settings
        if (this.glowLayer) this.glowLayer.intensity = desktop.glowIntensity;
        
        const ambient = this.scene.getLightByName('ambient');
        if (ambient) ambient.intensity = desktop.ambientIntensity;
        
        this.scene.environmentIntensity = desktop.environmentIntensity;
        this.scene.clearColor = desktop.clearColor;
        this.scene.fogDensity = desktop.fogDensity;
        
        // Unfreeze materials for desktop (allows dynamic updates)
        this.scene.materials.forEach(mat => {
            if (mat.unfreeze) mat.unfreeze();
        });
        
        // Restore shadow quality for desktop
        this.scene.lights.forEach(light => {
            if (light.getShadowGenerator) {
                const shadowGen = light.getShadowGenerator();
                if (shadowGen) {
                    shadowGen.usePercentageCloserFiltering = true;
                    shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
                }
            }
        });
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
            log.info('🥽 Quest VR headset detected - using optimized light count');
            return 4; // Quest 3S - reduced from 6 for mirror ball compatibility
        } else if (isMobile) {
            log.info('📱 Mobile device detected - using reduced light count');
            return 3; // Mobile devices - ultra-conservative for PBR + 3D models
        } else {
            log.info('💻 Desktop/laptop detected - using safe light count for PBR materials');
            return 3; // Ultra-safe limit for PBR materials + loaded 3D models + mirror ball (reduced from 4)
        }
    }

    /**
     * Initialize modular lighting systems (new architecture)
     * These systems encapsulate lighting logic into separate, maintainable classes
     */
    _initModularSystems() {
        const systemOptions = { logger: log };
        
        // Only initialize if the classes are available (loaded via script tags)
        if (typeof LaserSystem !== 'undefined') {
            this.systems.laser = new LaserSystem(this.scene, this.materialFactory, systemOptions);
            log.info('✅ LaserSystem module loaded');
        }
        
        if (typeof SpotlightSystem !== 'undefined') {
            this.systems.spotlight = new SpotlightSystem(this.scene, this.materialFactory, systemOptions);
            log.info('✅ SpotlightSystem module loaded');
        }
        
        if (typeof MirrorBallSystem !== 'undefined') {
            this.systems.mirrorBall = new MirrorBallSystem(this.scene, this.materialFactory, systemOptions);
            log.info('✅ MirrorBallSystem module loaded');
        }
        
        if (typeof LEDWallSystem !== 'undefined') {
            this.systems.ledWall = new LEDWallSystem(this.scene, this.materialFactory, systemOptions);
            log.info('✅ LEDWallSystem module loaded');
        }
        
        if (typeof StrobeSystem !== 'undefined') {
            this.systems.strobe = new StrobeSystem(this.scene, this.materialFactory, systemOptions);
            log.info('✅ StrobeSystem module loaded');
        }
        
        if (typeof HazeSystem !== 'undefined') {
            this.systems.haze = new HazeSystem(this.scene, systemOptions);
            log.info('✅ HazeSystem module loaded');
        }
        
        if (typeof VJControlSystem !== 'undefined') {
            this.systems.vjControl = new VJControlSystem(this.scene, systemOptions);
            // Register all systems with VJ controller
            if (this.systems.laser) this.systems.vjControl.registerSystem('laser', this.systems.laser);
            if (this.systems.spotlight) this.systems.vjControl.registerSystem('spotlight', this.systems.spotlight);
            if (this.systems.mirrorBall) this.systems.vjControl.registerSystem('mirrorball', this.systems.mirrorBall);
            if (this.systems.ledWall) this.systems.vjControl.registerSystem('ledwall', this.systems.ledWall);
            if (this.systems.strobe) this.systems.vjControl.registerSystem('strobe', this.systems.strobe);
            if (this.systems.haze) this.systems.vjControl.registerSystem('haze', this.systems.haze);
            log.info('✅ VJControlSystem module loaded and systems registered');
        }
        
        log.info('🎛️ Modular lighting systems initialized (useModularSystems=' + this.useModularSystems + ')');
    }

    async init() {
        // Create scene with hyperrealistic atmosphere
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.01, 0.01, 0.02); // Very dark club atmosphere
        
        // PERFORMANCE OPTIMIZATIONS - Scene-level settings
        this.scene.skipFrustumClipping = false; // Keep frustum culling for VR (important)
        this.scene.blockMaterialDirtyMechanism = true; // Reduce material updates
        this.scene.useGeometryIdsMap = true; // Faster mesh lookups
        this.scene.useClonedMeshMap = true; // Faster instance lookups
        
        // Physics DISABLED - not needed without avatars (massive CPU savings)
        // this.scene.enablePhysics(
        //     new BABYLON.Vector3(0, -9.81, 0), // Gravity
        //     new BABYLON.CannonJSPlugin()       // Physics engine
        // );
        // log.info('⚽ Physics engine enabled (avatars won\'t sink through floor)');
        log.info('⚡ Physics disabled - single-player mode (better performance)');
        
        // Set scene reference in material factory
        this.materialFactory.scene = this.scene;
        
        // Initialize light factory
        this.lightFactory = new LightFactory(this.scene, log);
        
        // Initialize modular lighting systems (new architecture)
        this._initModularSystems();
        
        // Initialize Ready Player Me loader (optional, with fallback)
        // this.readyPlayerMeLoader = new ReadyPlayerMeLoader(this.scene);
        // await this.readyPlayerMeLoader.testConnection(); // Check if RPM is available
        this.readyPlayerMeLoader = null;
        
        // Initialize multiplayer managers (DISABLED - focusing on single-player quality)
        // this.networkManager = new NetworkManager(this.scene);
        // this.avatarManager = new AvatarManager(this.scene, this.materialFactory, this.readyPlayerMeLoader);
        // this.setupNetworkingCallbacks();
        this.networkManager = null; // Explicitly disable networking
        this.avatarManager = null; // Disable avatar manager
        this.isMultiplayer = false;
        
        // NPC avatars for atmosphere
        this.npcAvatars = [];
        this.npcDancePositions = [];
        
        // Load environment for PBR reflections
        this.scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://assets.babylonjs.com/environments/environmentSpecular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.3; // Subtle reflections
        
        // Add atmospheric fog for depth and light scattering simulation
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = this.vrSettings.desktop.fogDensity;
        this.scene.fogColor = new BABYLON.Color3(0.02, 0.02, 0.05); // Dark blue-ish fog
        
        // Initialize texture loader and load textures from CDN (cached for subsequent loads)
        log.info('🎨 Loading wooden floor and concrete textures from Polyhaven CDN...');
        this.textureLoader = new TextureLoader(this.scene, log);
        await this.textureLoader.init();
        
        try {
            this.concreteTextures = await this.textureLoader.loadAllTextures();
            log.info('✅ All textures loaded and cached');
        } catch (error) {
            log.warn('⚠️ Failed to load some textures, using fallback materials:', error);
            this.concreteTextures = null; // Will use procedural materials as fallback
        }
        
        // Initialize model loader for DJ equipment and PA speakers
        log.info('🎸 Initializing 3D model loader...');
        this.modelLoader = new ModelLoader(this.scene, this.materialFactory, log);
        await this.modelLoader.init();
        
        // Load all models in the background (they'll load asynchronously)
        log.info('📦 Loading DJ equipment and PA speaker models...');
        this.modelLoader.loadAllModels().then(() => {
            log.info('✅ All 3D models loaded successfully');
        }).catch(error => {
            log.warn('⚠️ Some models failed to load, using procedural fallbacks:', error);
        });
        
        // Setup camera for post-processing pipeline
        // Using FreeCamera (not UniversalCamera) for proper desktop mouse rotation
        // Spawn at dance floor entrance at standing height (1.7m)
        this.camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 1.7, -5), this.scene);
        this.camera.setTarget(new BABYLON.Vector3(0, 1.7, -15));
        
        // Movement controls - WASD + Arrow Keys
        this.camera.keysUp = [87, 38]; // W + Up Arrow
        this.camera.keysDown = [83, 40]; // S + Down Arrow
        this.camera.keysLeft = [65, 37]; // A + Left Arrow
        this.camera.keysRight = [68, 39]; // D + Right Arrow
        this.camera.keysUpward = [69]; // E
        this.camera.keysDownward = [81]; // Q
        
        // ENHANCED Mouse rotation settings (must be set BEFORE attachControl)
        this.camera.angularSensibility = 900; // Enhanced sensitivity for responsive look controls
        this.camera.inertia = 0.8; // Smooth, natural camera movement with slight momentum
        
        // Attach controls AFTER setting up inputs
        this.camera.attachControl(this.canvas, true);
        
        // ENHANCED Camera properties for immersive experience
        this.camera.speed = 0.5; // Faster movement speed for responsive controls
        this.camera.applyGravity = false; // No gravity for easier navigation
        this.camera.checkCollisions = true; // Enable collision detection with invisible walls
        this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5); // Human-sized collision bounding box
        this.camera.fov = 1.2; // Enhanced FOV for more immersive peripheral vision
        this.camera.minZ = 0.1; // Near plane
        this.camera.maxZ = 100; // Reduced far plane for better performance
        
        this.scene.activeCamera = this.camera;
        
        // PERFORMANCE: Reduced glow layer settings for better FPS
        this.glowLayer = new BABYLON.GlowLayer("glow", this.scene, {
            mainTextureFixedSize: 512, // Reduced from 1024 for better performance
            blurKernelSize: 16  // Reduced from 32 for better performance
        });
        this.glowLayer.intensity = 0.6; // Reduced from 0.8 for better performance
        
        // Add post-processing for cinematic realism
        this.addPostProcessing();
        
        // Build hyperrealistic club (need floor first for VR setup)
        this.createFloor();
        
        // Enable VR with teleportation on floor - optimized for Quest 3S
        const vrHelper = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: [this.floorMesh],
            optionalFeatures: true,
            disableTeleportation: true // Disable default teleportation to allow smooth movement
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
        
        // Enable VR controller locomotion (thumbstick movement)
        if (vrHelper && vrHelper.baseExperience) {
            try {
                // Enable movement controller feature for smooth locomotion with thumbsticks
                this.movementFeature = vrHelper.baseExperience.featuresManager.enableFeature(
                    BABYLON.WebXRFeatureName.MOVEMENT,
                    'latest',
                    {
                        xrInput: vrHelper.input,
                        // Smooth locomotion settings
                        movementEnabled: true,
                        movementSpeed: 0.5, // Movement speed (meters per second at full stick deflection)
                        rotationEnabled: true,
                        rotationSpeed: 0.8, // Turning speed with right stick
                        // Keep user on floor
                        movementOrientationFollowsViewerPose: true // Move in direction you're looking
                    }
                );
                
                // SPRINT FEATURE: Press thumbstick or Grip button to run
                vrHelper.input.onControllerAddedObservable.add((controller) => {
                    controller.onMotionControllerInitObservable.add((motionController) => {
                        // 1. Thumbstick Press (Click)
                        const thumbstick = motionController.getComponent("xr-standard-thumbstick");
                        if (thumbstick) {
                            thumbstick.onButtonStateChangedObservable.add((component) => {
                                if (component.pressed) {
                                    this.movementFeature.movementSpeed = 1.5; // Sprint (3x speed)
                                    log.info('🏃 VR Sprint activated (Thumbstick)');
                                } else {
                                    this.movementFeature.movementSpeed = 0.5; // Walk
                                }
                            });
                        }
                        
                        // 2. Squeeze/Grip Button (Alternative Sprint)
                        const squeeze = motionController.getComponent("xr-standard-squeeze");
                        if (squeeze) {
                            squeeze.onButtonStateChangedObservable.add((component) => {
                                if (component.pressed) {
                                    this.movementFeature.movementSpeed = 1.5; // Sprint
                                    log.info('🏃 VR Sprint activated (Grip)');
                                } else {
                                    this.movementFeature.movementSpeed = 0.5; // Walk
                                }
                            });
                        }
                    });
                });
                
                log.info('🎮 VR controller locomotion enabled (Press Thumbstick or Grip to SPRINT)');
            } catch (e) {
                log.warn('Could not enable VR movement feature:', e);
            }
        }
        
        // Set VR starting position at dance floor center (below mirror ball)
        if (vrHelper) {
            vrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR) {
                    // Position user at dance floor center below mirror ball
                    const xrCamera = vrHelper.baseExperience.camera;
                    if (xrCamera) {
                        // Y=1.7 for proper standing eye height (not 0 which is floor level)
                        xrCamera.position = new BABYLON.Vector3(0, 1.7, -12);
                        
                        // Configure depth range for better VR rendering (now that session is active)
                        if (vrHelper.baseExperience.sessionManager && vrHelper.baseExperience.sessionManager.session) {
                            vrHelper.baseExperience.sessionManager.updateRenderStateAsync({
                                depthNear: 0.1,
                                depthFar: 150
                            }).catch(err => {
                                log.warn('Could not update render state:', err);
                            });
                        }
                        
                        // Apply VR-optimized settings
                        this.applyVRSettings(xrCamera);
                        log.info('🥽 VR mode activated with optimized settings');
                    }
                } else if (state === BABYLON.WebXRState.NOT_IN_XR) {
                    // Restore desktop settings
                    this.applyDesktopSettings();
                    log.info('🖥️ Desktop mode restored');
                }
            });
        }
        
        // Continue building club
        this.createWalls();
        this.createCollisionBoundaries(); // Add invisible collision walls
        this.createCeiling();
        this.createDJBooth();
        this.createDJBoothAccessories(); // Add laptop, headphones, cables
        this.createPASpeakers();
        
        // Use modular LED wall system
        if (this.systems.ledWall) {
            this.systems.ledWall.createLEDWall();
            log.info('🎨 LED Wall created via LEDWallSystem module');
        } else {
            this.createLEDWall(); // Fallback to legacy method
        }
        
        this.createLasers();
        this.createTrussMountedLights(); // MUST be before createLights() so fixtures exist
        
        // Use modular spotlight system if enabled
        if (this.useModularSystems && this.systems.spotlight) {
            this.systems.spotlight.setTrussLights(this.trussLights);
            this.systems.spotlight.createSpotlights();
            // Store reference for compatibility with VJ controls
            this.spotlights = this.systems.spotlight.spotlights;
            log.info('🔦 Spotlights created via SpotlightSystem module');
        }
        
        this.createLights(); // Creates other lights (ambient, etc.) - skips spotlights if modular
        this.createBlinders();
        this.createLaserSheet(); // Add scanning laser sheet effect
        this.createHyperrealisticSmoke(); // Add volumetric smoke/fog
        this.createMirrorBall(); // Add disco/mirror ball with spotlight
        // Entrance, bar, and dance floor lighting removed for cleaner look
        this.createSafetyDetails(); // Exit signs, fire extinguishers, sprinklers
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        this.setupVJControlInteraction(); // Add VJ control button clicks
        
        // Create dancing NPC avatars on the dancefloor
        await this.createDancingNPCs();
        
        // Verify scene is ready
        log.info('🎬 Scene initialization complete:');
        log.info(`  📷 Camera: ${this.camera.position.toString()}`);
        log.info(`  🎯 Active camera: ${this.scene.activeCamera ? 'Set' : 'MISSING!'}`);
        log.info(`  💡 Lights: ${this.scene.lights.length}`);
        log.info(`  📦 Meshes: ${this.scene.meshes.length}`);
        log.info(`  🎨 Materials: ${this.scene.materials.length}`);
        
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
        // Prevent duplicate pipelines
        if (this.renderPipeline) {
            return;
        }

        // Create ENHANCED rendering pipeline for hyperrealistic cinematic effects
        // Note: We create it without cameras first, then add camera to avoid potential "reuse" warnings
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true, // HDR enabled for better color range
            this.scene
        );
        
        // FXAA anti-aliasing for smooth edges (essential for immersion)
        pipeline.fxaaEnabled = true;
        
        // ENHANCED Bloom for dramatic glowing lights - hyperrealistic nightclub atmosphere
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = 0.6; // Optimized threshold from vrSettings
        pipeline.bloomWeight = 0.22; // Enhanced weight for immersive lighting
        pipeline.bloomKernel = 64; // Large kernel for smooth bloom spread
        pipeline.bloomScale = 0.35; // Enhanced scale for dramatic effect
        
        // Chromatic aberration DISABLED - causes hazy color fringing
        pipeline.chromaticAberrationEnabled = false;
        
        // Film grain DISABLED - causes overall hazy appearance
        pipeline.grainEnabled = false;
        
        // ENHANCED Sharpen for crystal-clear details (hyperrealism focus)
        pipeline.sharpenEnabled = true;
        pipeline.sharpen.edgeAmount = 0.4; // Crisp edge definition
        pipeline.sharpen.colorAmount = 0.5; // Enhanced color separation
        
        // ENHANCED Image processing for cinematic depth
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.contrast = 1.4; // Enhanced contrast for depth
        pipeline.imageProcessing.exposure = 1.05; // Balanced exposure
        pipeline.imageProcessing.toneMappingEnabled = true;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES; // Cinematic tone mapping
        
        // Optional: Depth of Field for camera focus effect (disabled by default for VR compatibility)
        pipeline.depthOfFieldEnabled = false;
        
        // Store pipeline for VR/desktop switching
        this.renderPipeline = pipeline;

        // Add camera explicitly AFTER configuration to avoid reuse warnings
        if (this.camera) {
            pipeline.addCamera(this.camera);
        }

        // SSAO 2 Pipeline (Screen Space Ambient Occlusion) - Adds realistic contact shadows
        // ONLY for desktop mode (too expensive for standalone VR)
        // Adds depth to corners and contact points for hyperrealism
        this.ssaoPipeline = new BABYLON.SSAO2RenderingPipeline("ssao", this.scene, 0.75, [this.camera]);
        this.ssaoPipeline.radius = 3.5;
        this.ssaoPipeline.totalStrength = 1.2;
        this.ssaoPipeline.expensiveBlur = true;
        this.ssaoPipeline.samples = 16;
        this.ssaoPipeline.maxZ = 250;
        
        // Attach to pipeline but disable by default (enabled in applyDesktopSettings)
        this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", this.camera);
        
        log.info('✨ Enhanced post-processing pipeline initialized (hyperrealistic mode)');
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
        
        // ENHANCED Wooden floor panels with PBR - hyperrealistic nightclub aesthetic
        const floorMat = this.materialFactory.getPreset('floor');
        
        // Apply downloaded wood textures if available
        if (this.concreteTextures && this.concreteTextures.floor) {
            log.info('🎨 Applying ENHANCED floor textures (Polyhaven - Large Floor Tiles)');
            this.textureLoader.applyTexturesToMaterial(floorMat, this.concreteTextures.floor);
            // Dark polished tiles for modern nightclub aesthetic
            floorMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.18); 
            
            // Override roughness for polished look (wet floor effect)
            floorMat.roughness = 0.3; 
            floorMat.metallic = 0.1;
            
            // If roughness map is loaded, reduce its influence to keep it shiny
            if (floorMat.metallicTexture) {
                floorMat.metallicTexture.level = 0.5; // Reduce roughness map strength
            }
        } else {
            // Enhanced fallback to procedural noise texture
            log.info('🎨 Using ENHANCED procedural floor texture (fallback)');
            const noiseTexture = new BABYLON.NoiseProceduralTexture("floorNoise", 512, this.scene); // OPTIMIZED: Reduced from 1024
            noiseTexture.octaves = 6; // More detail layers
            noiseTexture.persistence = 0.9; // Stronger detail retention
            noiseTexture.animationSpeedFactor = 0; // Static texture
            floorMat.bumpTexture = noiseTexture;
            floorMat.bumpTexture.level = 0.4; // Enhanced bump for realistic surface
            floorMat.baseColor = new BABYLON.Color3(0.18, 0.18, 0.2); // Dark polished concrete
        }
        
        // ENHANCED PBR properties for hyperrealistic polished concrete floor
        floorMat.environmentIntensity = 0.5; // Enhanced reflections from polished surface
        floorMat.directIntensity = 1.0; // Full direct light response
        floorMat.specularIntensity = 0.8; // Enhanced specular highlights
        
        floor.material = floorMat;
        floor.receiveShadows = false; // Optimization Phase 3: Disable shadows on floor
        floor.freezeWorldMatrix(); // OPTIMIZATION: Freeze static floor mesh
        floor.doNotSyncBoundingInfo = true; // Skip bounding info updates
    }

    createWalls() {
        // PBR material for walls
        const wallMat = this.materialFactory.getPreset('wall');
        
        // Apply downloaded concrete wall textures if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            log.info('🎨 Applying wall textures (Polyhaven - Red Brick)');
            this.textureLoader.applyTexturesToMaterial(wallMat, this.concreteTextures.walls);
            wallMat.baseColor = new BABYLON.Color3(0.5, 0.5, 0.5); // Neutral tint to let brick color show
            wallMat.roughness = 0.8; // Rough brick
        }
        
        // Back wall
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 35,
            height: 10,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 5, -27);
        backWall.material = wallMat;
        backWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        backWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        backWall.doNotSyncBoundingInfo = true;
        
        // Left wall
        const leftWall = BABYLON.MeshBuilder.CreateBox("leftWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-17, 5, -10);
        leftWall.material = wallMat;
        leftWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        leftWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        leftWall.doNotSyncBoundingInfo = true;
        
        // Right wall
        const rightWall = BABYLON.MeshBuilder.CreateBox("rightWall", {
            width: 0.5,
            height: 10,
            depth: 45
        }, this.scene);
        rightWall.position = new BABYLON.Vector3(17, 5, -10);
        rightWall.material = wallMat;
        rightWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        rightWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        rightWall.doNotSyncBoundingInfo = true;
        
        // Front wall
        const frontWall = BABYLON.MeshBuilder.CreateBox("frontWall", {
            width: 35,
            height: 10,
            depth: 0.5
        }, this.scene);
        frontWall.position = new BABYLON.Vector3(0, 5, 2);
        frontWall.material = wallMat;
        frontWall.receiveShadows = false; // Optimization: disable shadows on walls
        frontWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        frontWall.doNotSyncBoundingInfo = true;
        
        // Add industrial wall details
        this.createIndustrialWallDetails();
    }

    createIndustrialWallDetails() {
        // Create exposed brick sections, pipes, conduits, and graffiti for authentic warehouse feel
        
        // Exposed brick material - old red brick
        const brickMat = this.materialFactory.getPreset('brick');
        
        // Apply texture to these details too if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            this.textureLoader.applyTexturesToMaterial(brickMat, this.concreteTextures.walls);
            // Make these sections slightly darker/dirtier
            brickMat.baseColor = new BABYLON.Color3(0.4, 0.4, 0.4);
        }
        
        // Concrete pillar material
        const pillarMat = this.materialFactory.getPreset('pillar');
        
        // Apply concrete texture to pillars if available (using ceiling texture for concrete look)
        if (this.concreteTextures && this.concreteTextures.ceiling) {
            this.textureLoader.applyTexturesToMaterial(pillarMat, this.concreteTextures.ceiling);
            pillarMat.roughness = 0.7;
        }
        
        // Metal pipe material
        const pipeMat = this.materialFactory.getPreset('pipe');
        
        // Add concrete support pillars along walls
        const pillarPositions = [
            { x: -17, z: -5 }, { x: -17, z: -15 }, { x: -17, z: -25 },
            { x: 17, z: -5 }, { x: 17, z: -15 }, { x: 17, z: -25 }
        ];
        
        // OPTIMIZATION: Create pillars array for merging
        const pillarsToMerge = [];
        pillarPositions.forEach((pos, i) => {
            const pillar = BABYLON.MeshBuilder.CreateBox("pillar" + i, {
                width: 0.6,
                height: 10,
                depth: 0.6
            }, this.scene);
            pillar.position = new BABYLON.Vector3(pos.x, 5, pos.z);
            pillar.material = pillarMat;
            pillar.receiveShadows = false;
            pillarsToMerge.push(pillar);
        });
        
        // OPTIMIZATION: Merge all pillars into single mesh (6 draw calls → 1)
        const mergedPillars = BABYLON.Mesh.MergeMeshes(
            pillarsToMerge, 
            true, // dispose source meshes
            true, // allow multi-materials
            undefined, 
            false, 
            true // use material indices
        );
        if (mergedPillars) {
            mergedPillars.name = "mergedPillars";
            mergedPillars.freezeWorldMatrix();
            mergedPillars.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 6 pillars into single mesh");
        }
        
        // Add exposed brick sections between pillars
        const brickSections = [
            { x: -16.5, z: -10, width: 1, height: 4 },
            { x: -16.5, z: -20, width: 1, height: 3 },
            { x: 16.5, z: -10, width: 1, height: 4 },
            { x: 16.5, z: -20, width: 1, height: 3 }
        ];
        
        // OPTIMIZATION: Create bricks array for merging
        const bricksToMerge = [];
        brickSections.forEach((section, i) => {
            const brick = BABYLON.MeshBuilder.CreateBox("brick" + i, {
                width: section.width,
                height: section.height,
                depth: 0.3
            }, this.scene);
            brick.position = new BABYLON.Vector3(section.x, 2 + section.height/2, section.z);
            brick.material = brickMat;
            brick.receiveShadows = false;
            bricksToMerge.push(brick);
        });
        
        // OPTIMIZATION: Merge all bricks into single mesh (4 draw calls → 1)
        const mergedBricks = BABYLON.Mesh.MergeMeshes(
            bricksToMerge,
            true, // dispose source meshes
            true, // allow multi-materials
            undefined,
            false,
            true // use material indices
        );
        if (mergedBricks) {
            mergedBricks.name = "mergedBricks";
            mergedBricks.freezeWorldMatrix();
            mergedBricks.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 4 brick sections into single mesh");
        }
        
        // Add industrial pipes running along ceiling (near walls)
        const pipeRuns = [
            { start: { x: -16, z: -25 }, end: { x: -16, z: 5 } },  // Left wall
            { start: { x: 16, z: -25 }, end: { x: 16, z: 5 } }     // Right wall
        ];
        
        // OPTIMIZATION: Create pipes/conduits array for merging
        const pipesToMerge = [];
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
            pipesToMerge.push(pipe);
            
            // Add smaller conduit pipes next to main pipe
            const conduit = BABYLON.MeshBuilder.CreateCylinder("conduit" + i, {
                diameter: 0.08,
                height: pipeLength,
                tessellation: 8
            }, this.scene);
            conduit.position = new BABYLON.Vector3(run.start.x - 0.25, 9.3, (run.start.z + run.end.z) / 2);
            conduit.rotation.x = Math.PI / 2;
            conduit.material = pipeMat;
            pipesToMerge.push(conduit);
        });
        
        // OPTIMIZATION: Merge all pipes/conduits into single mesh (4 draw calls → 1)
        const mergedPipes = BABYLON.Mesh.MergeMeshes(
            pipesToMerge,
            true, // dispose source meshes
            true, // allow multi-materials
            undefined,
            false,
            true // use material indices
        );
        if (mergedPipes) {
            mergedPipes.name = "mergedPipes";
            mergedPipes.freezeWorldMatrix();
            mergedPipes.doNotSyncBoundingInfo = true;
            log.info("✅ Merged 4 pipes/conduits into single mesh");
        }
        
        log.info("✅ Created industrial wall details");
    }

    // === HYPERREALISTIC ENTRANCE AREA ===
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
        leftArchPillar.position = new BABYLON.Vector3(-3, 1.75, 1.5);
        leftArchPillar.material = archMat;
        leftArchPillar.freezeWorldMatrix();
        
        // Right arch pillar
        const rightArchPillar = BABYLON.MeshBuilder.CreateBox("rightArchPillar", {
            width: 0.4, height: 3.5, depth: 0.4
        }, this.scene);
        rightArchPillar.position = new BABYLON.Vector3(3, 1.75, 1.5);
        rightArchPillar.material = archMat;
        rightArchPillar.freezeWorldMatrix();
        
        // Arch top beam
        const archTop = BABYLON.MeshBuilder.CreateBox("archTop", {
            width: 6.4, height: 0.3, depth: 0.4
        }, this.scene);
        archTop.position = new BABYLON.Vector3(0, 3.65, 1.5);
        archTop.material = archMat;
        archTop.freezeWorldMatrix();
        
        // === VELVET ROPE QUEUE SYSTEM ===
        const stanchionPositions = [
            // Left queue line
            { x: -5, z: -1 }, { x: -5, z: 1 }, { x: -5, z: 3 },
            // Right queue line  
            { x: -3.5, z: -1 }, { x: -3.5, z: 1 }, { x: -3.5, z: 3 },
            // Entrance guide right side
            { x: 5, z: -1 }, { x: 5, z: 1 }
        ];
        
        const stanchions = [];
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
        };
        
        // Connect ropes on left queue line
        createVelvetRope(stanchionPositions[0], stanchionPositions[1], "velvetRope_L1");
        createVelvetRope(stanchionPositions[1], stanchionPositions[2], "velvetRope_L2");
        
        // Connect ropes on right queue line
        createVelvetRope(stanchionPositions[3], stanchionPositions[4], "velvetRope_R1");
        createVelvetRope(stanchionPositions[4], stanchionPositions[5], "velvetRope_R2");
        
        // Cross rope at entrance
        createVelvetRope(stanchionPositions[6], stanchionPositions[7], "velvetRope_entrance");
        
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
        });
        
        log.info("✅ Created hyperrealistic entrance with velvet ropes and stanchions");
    }

    // === DANCE FLOOR EDGE LIGHTING ===
    createDanceFloorLighting() {
        log.info("💃 Creating dance floor edge lighting...");
        
        const edgeLEDMat = this.materialFactory.getPreset('floorEdgeLED');
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
                emissiveColor: [0, 0.5, 1],
                disableLighting: true
            });
            led.material = mat;
            
            this.danceFloorLEDs.push({ mesh: led, material: mat });
        });
        
        // === FLOOR TILE GRID PATTERN ===
        // Create subtle tile gaps for realism
        const tileSize = 2; // 2m x 2m tiles
        for (let x = danceFloorBounds.x.min; x <= danceFloorBounds.x.max; x += tileSize) {
            const gapLine = BABYLON.MeshBuilder.CreateBox(`tileGapX_${x}`, {
                width: 0.02, height: 0.005, depth: 12
            }, this.scene);
            gapLine.position = new BABYLON.Vector3(x, 0.002, -12);
            gapLine.material = gapMat;
            gapLine.freezeWorldMatrix();
        }
        
        for (let z = danceFloorBounds.z.min; z <= danceFloorBounds.z.max; z += tileSize) {
            const gapLine = BABYLON.MeshBuilder.CreateBox(`tileGapZ_${z}`, {
                width: 16, height: 0.005, depth: 0.02
            }, this.scene);
            gapLine.position = new BABYLON.Vector3(0, 0.002, z);
            gapLine.material = gapMat;
            gapLine.freezeWorldMatrix();
        }
        
        log.info("✅ Created dance floor edge lighting and tile pattern");
    }

    // === SAFETY & ATMOSPHERE DETAILS ===
    createSafetyDetails() {
        log.info("🚨 Creating safety and atmosphere details...");
        
        // === EXIT SIGNS ===
        const exitSignMat = this.materialFactory.getPreset('exitSign');
        
        const exitPositions = [
            { x: 0, y: 3.2, z: 1.8, rotY: Math.PI },      // Front entrance (facing in)
            { x: -16.5, y: 3.2, z: -15, rotY: Math.PI/2 } // Side exit (facing in)
        ];
        
        exitPositions.forEach((pos, i) => {
            // Exit sign housing
            const signHousing = BABYLON.MeshBuilder.CreateBox(`exitHousing${i}`, {
                width: 0.6, height: 0.25, depth: 0.08
            }, this.scene);
            signHousing.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
            signHousing.rotation.y = pos.rotY;
            signHousing.material = this.materialFactory.createPBRMaterial(`exitHousingMat${i}`, {
                baseColor: [0.1, 0.1, 0.1],
                metallic: 0.5,
                roughness: 0.5
            });
            
            // Glowing EXIT text (simplified as plane)
            const signFace = BABYLON.MeshBuilder.CreatePlane(`exitSign${i}`, {
                width: 0.5, height: 0.18
            }, this.scene);
            signFace.position = new BABYLON.Vector3(pos.x, pos.y, pos.z + (pos.rotY === Math.PI ? -0.05 : 0));
            signFace.position.x += pos.rotY === Math.PI/2 ? 0.05 : 0;
            signFace.rotation.y = pos.rotY;
            signFace.material = exitSignMat;
        });
        
        // === FIRE EXTINGUISHERS ===
        const fireExtMat = this.materialFactory.getPreset('fireExtinguisher');
        
        const fireExtPositions = [
            { x: -16.5, z: -5 },
            { x: 16.5, z: -20 }
        ];
        
        fireExtPositions.forEach((pos, i) => {
            // Extinguisher body
            const extBody = BABYLON.MeshBuilder.CreateCylinder(`fireExt${i}`, {
                diameter: 0.15, height: 0.45, tessellation: 16
            }, this.scene);
            extBody.position = new BABYLON.Vector3(pos.x, 0.8, pos.z);
            extBody.material = fireExtMat;
            
            // Valve/handle
            const extHandle = BABYLON.MeshBuilder.CreateBox(`fireExtHandle${i}`, {
                width: 0.12, height: 0.08, depth: 0.05
            }, this.scene);
            extHandle.position = new BABYLON.Vector3(pos.x, 1.08, pos.z);
            extHandle.material = this.materialFactory.getPreset('barStool');
            
            // Wall bracket
            const bracket = BABYLON.MeshBuilder.CreateBox(`fireExtBracket${i}`, {
                width: 0.2, height: 0.06, depth: 0.1
            }, this.scene);
            bracket.position = new BABYLON.Vector3(pos.x, 0.7, pos.z);
            bracket.material = this.materialFactory.getPreset('barStool');
        });
        
        // === SPRINKLER HEADS (ceiling) ===
        const sprinklerMat = this.materialFactory.getPreset('sprinklerHead');
        
        // Grid of sprinklers every 5m
        for (let x = -15; x <= 15; x += 5) {
            for (let z = -25; z <= 0; z += 5) {
                const sprinkler = BABYLON.MeshBuilder.CreateCylinder(`sprinkler_${x}_${z}`, {
                    diameterTop: 0.06, diameterBottom: 0.02, height: 0.06, tessellation: 12
                }, this.scene);
                sprinkler.position = new BABYLON.Vector3(x, 9.7, z);
                sprinkler.material = sprinklerMat;
            }
        }
        
        // === SMOKE DETECTORS ===
        const smokeMat = this.materialFactory.getPreset('smokeDetector');
        
        const smokePositions = [
            { x: -8, z: -8 }, { x: 8, z: -8 },
            { x: -8, z: -18 }, { x: 8, z: -18 },
            { x: 0, z: -24 }
        ];
        
        smokePositions.forEach((pos, i) => {
            const detector = BABYLON.MeshBuilder.CreateCylinder(`smokeDetector${i}`, {
                diameter: 0.12, height: 0.04, tessellation: 16
            }, this.scene);
            detector.position = new BABYLON.Vector3(pos.x, 9.8, pos.z);
            detector.material = smokeMat;
            
            // LED indicator
            const led = BABYLON.MeshBuilder.CreateSphere(`smokeDetectorLED${i}`, {
                diameter: 0.015, segments: 8
            }, this.scene);
            led.position = new BABYLON.Vector3(pos.x, 9.77, pos.z + 0.04);
            const ledMat = this.materialFactory.createStandardMaterial(`smokeDetectorLEDMat${i}`, {
                emissiveColor: [0, 0.8, 0], // Green = normal
                disableLighting: true
            });
            led.material = ledMat;
        });
        
        log.info("✅ Created safety details (exit signs, fire extinguishers, sprinklers, smoke detectors)");
    }

    // === ENHANCED DJ BOOTH ACCESSORIES ===
    createDJBoothAccessories() {
        log.info("🎧 Creating DJ booth accessories...");
        
        // === LAPTOP STAND WITH LAPTOP ===
        const laptopMat = this.materialFactory.getPreset('laptopBody');
        
        // Stand (adjustable laptop stand)
        const standBase = BABYLON.MeshBuilder.CreateBox("laptopStandBase", {
            width: 0.3, height: 0.02, depth: 0.25
        }, this.scene);
        standBase.position = new BABYLON.Vector3(-0.8, 0.84, -23.6);
        standBase.material = this.materialFactory.getPreset('barStool');
        
        const standArm = BABYLON.MeshBuilder.CreateBox("laptopStandArm", {
            width: 0.04, height: 0.15, depth: 0.04
        }, this.scene);
        standArm.position = new BABYLON.Vector3(-0.8, 0.92, -23.65);
        standArm.material = this.materialFactory.getPreset('barStool');
        
        // Laptop base
        const laptopBase = BABYLON.MeshBuilder.CreateBox("laptopBase", {
            width: 0.32, height: 0.015, depth: 0.22
        }, this.scene);
        laptopBase.position = new BABYLON.Vector3(-0.8, 1.02, -23.55);
        laptopBase.rotation.x = -0.2; // Tilted toward DJ
        laptopBase.material = laptopMat;
        
        // Laptop screen
        const laptopScreen = BABYLON.MeshBuilder.CreateBox("laptopScreen", {
            width: 0.3, height: 0.2, depth: 0.008
        }, this.scene);
        laptopScreen.position = new BABYLON.Vector3(-0.8, 1.18, -23.64);
        laptopScreen.rotation.x = -0.5;
        laptopScreen.material = laptopMat;
        
        // Screen display (glowing)
        const screenDisplay = BABYLON.MeshBuilder.CreatePlane("laptopDisplay", {
            width: 0.28, height: 0.18
        }, this.scene);
        screenDisplay.position = new BABYLON.Vector3(-0.8, 1.18, -23.635);
        screenDisplay.rotation.x = -0.5;
        const screenMat = this.materialFactory.createStandardMaterial("laptopScreenMat", {
            emissiveColor: [0.2, 0.4, 0.8], // Blue waveform display
            disableLighting: true
        });
        screenDisplay.material = screenMat;
        
        // === HEADPHONES (on mixer) ===
        const headphoneBandMat = this.materialFactory.getPreset('headphoneBand');
        const headphoneCupMat = this.materialFactory.getPreset('headphoneCup');
        
        // Headphone band
        const headphoneBand = BABYLON.MeshBuilder.CreateTorus("headphoneBand", {
            diameter: 0.2, thickness: 0.015, tessellation: 24, arc: 0.5
        }, this.scene);
        headphoneBand.position = new BABYLON.Vector3(0.6, 0.98, -22.7);
        headphoneBand.rotation.z = Math.PI;
        headphoneBand.rotation.y = 0.3;
        headphoneBand.material = headphoneBandMat;
        
        // Left ear cup
        const leftCup = BABYLON.MeshBuilder.CreateCylinder("headphoneLeftCup", {
            diameter: 0.1, height: 0.05, tessellation: 16
        }, this.scene);
        leftCup.position = new BABYLON.Vector3(0.5, 0.94, -22.68);
        leftCup.rotation.z = Math.PI / 2;
        leftCup.material = headphoneCupMat;
        
        // Right ear cup
        const rightCup = BABYLON.MeshBuilder.CreateCylinder("headphoneRightCup", {
            diameter: 0.1, height: 0.05, tessellation: 16
        }, this.scene);
        rightCup.position = new BABYLON.Vector3(0.7, 0.94, -22.72);
        rightCup.rotation.z = Math.PI / 2;
        rightCup.material = headphoneCupMat;
        
        // Cushion pads
        const cushionMat = this.materialFactory.getPreset('stoolCushion');
        const leftPad = BABYLON.MeshBuilder.CreateCylinder("headphoneLeftPad", {
            diameter: 0.09, height: 0.02, tessellation: 16
        }, this.scene);
        leftPad.position = new BABYLON.Vector3(0.47, 0.94, -22.68);
        leftPad.rotation.z = Math.PI / 2;
        leftPad.material = cushionMat;
        
        const rightPad = BABYLON.MeshBuilder.CreateCylinder("headphoneRightPad", {
            diameter: 0.09, height: 0.02, tessellation: 16
        }, this.scene);
        rightPad.position = new BABYLON.Vector3(0.73, 0.94, -22.72);
        rightPad.rotation.z = Math.PI / 2;
        rightPad.material = cushionMat;
        
        // === CABLE MANAGEMENT (under table) ===
        const cableMat = this.materialFactory.getPreset('cableRubber');
        
        // Main cable bundle running under DJ table
        const cableBundle = BABYLON.MeshBuilder.CreateCylinder("cableBundle", {
            diameter: 0.06, height: 4.5, tessellation: 8
        }, this.scene);
        cableBundle.position = new BABYLON.Vector3(0, 0.7, -23.5);
        cableBundle.rotation.z = Math.PI / 2;
        cableBundle.material = cableMat;
        
        // Vertical cable drops
        const cableDrops = [-1.5, 0, 1.5]; // Under each CDJ and mixer
        cableDrops.forEach((x, i) => {
            const drop = BABYLON.MeshBuilder.CreateCylinder(`cableDrop${i}`, {
                diameter: 0.025, height: 0.4, tessellation: 8
            }, this.scene);
            drop.position = new BABYLON.Vector3(x, 0.5, -23.5);
            drop.material = cableMat;
        });
        
        // === USB STICK IN CDJ (left deck) ===
        const usbStick = BABYLON.MeshBuilder.CreateBox("usbStick", {
            width: 0.02, height: 0.008, depth: 0.04
        }, this.scene);
        usbStick.position = new BABYLON.Vector3(-1.1, 0.9, -22.65);
        usbStick.material = this.materialFactory.createPBRMaterial('usbMat', {
            baseColor: [0.2, 0.2, 0.2],
            metallic: 0.3,
            roughness: 0.5
        });
        
        // USB LED indicator
        const usbLED = BABYLON.MeshBuilder.CreateSphere("usbLED", {
            diameter: 0.008, segments: 6
        }, this.scene);
        const usbLEDMat = this.materialFactory.createStandardMaterial("usbLEDMat", {
            emissiveColor: [0, 0.8, 0],
            disableLighting: true
        });
        usbLED.material = usbLEDMat;
        usbLED.parent = usbStick;
        usbLED.position.set(0, 0.005, 0.015);
        
        log.info("✅ Created DJ booth accessories (laptop, headphones, cables)");
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
        
        log.info("✅ Created invisible collision boundaries around room and DJ booth");
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
            log.info('🎨 Applying ceiling textures (Polyhaven - Raw Concrete)');
            this.textureLoader.applyTexturesToMaterial(ceilingMat, this.concreteTextures.ceiling);
            
            // Adjust for darker, more industrial look
            ceilingMat.albedoColor = new BABYLON.Color3(0.3, 0.3, 0.3); 
            ceilingMat.roughness = 0.9;
        }
        
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
        
        // Add lighting truss above dance floor
        this.createLightingTruss();
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
        
        // Helper function to create hyperrealistic BOX truss section
        const createBoxTruss = (name, length, position) => {
            const parent = new BABYLON.TransformNode(name + "_parent", this.scene);
            parent.position = position;
            
            const halfSize = trussSize / 2;
            
            // === FOUR MAIN CHORD TUBES (corners of box) ===
            const chordPositions = [
                { y: halfSize, z: halfSize },   // Top-front
                { y: halfSize, z: -halfSize },  // Top-back
                { y: -halfSize, z: halfSize },  // Bottom-front
                { y: -halfSize, z: -halfSize }  // Bottom-back
            ];
            
            chordPositions.forEach((pos, idx) => {
                const chord = BABYLON.MeshBuilder.CreateCylinder(name + "_chord" + idx, {
                    diameter: tubeSize,
                    height: length,
                    tessellation: 12
                }, this.scene);
                chord.rotation.z = Math.PI / 2;
                chord.position = new BABYLON.Vector3(0, pos.y, pos.z);
                chord.parent = parent;
                chord.material = trussMat;
            });
            
            // === HORIZONTAL RUNGS (connecting chords at intervals) ===
            const segments = Math.floor(length / braceSpacing);
            for (let i = 0; i <= segments; i++) {
                const xPos = -length / 2 + (i * braceSpacing);
                
                // Top horizontal rung (connecting top chords)
                const topRung = BABYLON.MeshBuilder.CreateCylinder(name + "_topRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                topRung.rotation.x = Math.PI / 2;
                topRung.position = new BABYLON.Vector3(xPos, halfSize, 0);
                topRung.parent = parent;
                topRung.material = trussMat;
                
                // Bottom horizontal rung
                const bottomRung = BABYLON.MeshBuilder.CreateCylinder(name + "_bottomRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                bottomRung.rotation.x = Math.PI / 2;
                bottomRung.position = new BABYLON.Vector3(xPos, -halfSize, 0);
                bottomRung.parent = parent;
                bottomRung.material = trussMat;
                
                // Front vertical rung (connecting front chords)
                const frontRung = BABYLON.MeshBuilder.CreateCylinder(name + "_frontRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                frontRung.position = new BABYLON.Vector3(xPos, 0, halfSize);
                frontRung.parent = parent;
                frontRung.material = trussMat;
                
                // Back vertical rung
                const backRung = BABYLON.MeshBuilder.CreateCylinder(name + "_backRung" + i, {
                    diameter: tubeSize * 0.8,
                    height: trussSize,
                    tessellation: 8
                }, this.scene);
                backRung.position = new BABYLON.Vector3(xPos, 0, -halfSize);
                backRung.parent = parent;
                backRung.material = trussMat;
            }
            
            // === DIAGONAL X-BRACING (on all 4 faces) ===
            for (let i = 0; i < segments; i++) {
                const xStart = -length / 2 + (i * braceSpacing);
                const xMid = xStart + braceSpacing / 2;
                const braceLength = Math.sqrt(braceSpacing * braceSpacing + trussSize * trussSize);
                const braceAngle = Math.atan2(trussSize, braceSpacing);
                
                // === TOP FACE X-BRACING ===
                const topBrace1 = BABYLON.MeshBuilder.CreateCylinder(name + "_topBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                topBrace1.rotation.z = Math.PI / 2 - braceAngle;
                topBrace1.rotation.x = Math.PI / 2;
                topBrace1.position = new BABYLON.Vector3(xMid, halfSize, 0);
                topBrace1.parent = parent;
                topBrace1.material = braceMat;
                
                const topBrace2 = BABYLON.MeshBuilder.CreateCylinder(name + "_topBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                topBrace2.rotation.z = Math.PI / 2 + braceAngle;
                topBrace2.rotation.x = Math.PI / 2;
                topBrace2.position = new BABYLON.Vector3(xMid, halfSize, 0);
                topBrace2.parent = parent;
                topBrace2.material = braceMat;
                
                // === BOTTOM FACE X-BRACING ===
                const bottomBrace1 = BABYLON.MeshBuilder.CreateCylinder(name + "_bottomBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                bottomBrace1.rotation.z = Math.PI / 2 - braceAngle;
                bottomBrace1.rotation.x = Math.PI / 2;
                bottomBrace1.position = new BABYLON.Vector3(xMid, -halfSize, 0);
                bottomBrace1.parent = parent;
                bottomBrace1.material = braceMat;
                
                const bottomBrace2 = BABYLON.MeshBuilder.CreateCylinder(name + "_bottomBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                bottomBrace2.rotation.z = Math.PI / 2 + braceAngle;
                bottomBrace2.rotation.x = Math.PI / 2;
                bottomBrace2.position = new BABYLON.Vector3(xMid, -halfSize, 0);
                bottomBrace2.parent = parent;
                bottomBrace2.material = braceMat;
                
                // === FRONT FACE X-BRACING ===
                const frontBrace1 = BABYLON.MeshBuilder.CreateCylinder(name + "_frontBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                frontBrace1.rotation.z = Math.PI / 2 - braceAngle;
                frontBrace1.position = new BABYLON.Vector3(xMid, 0, halfSize);
                frontBrace1.parent = parent;
                frontBrace1.material = braceMat;
                
                const frontBrace2 = BABYLON.MeshBuilder.CreateCylinder(name + "_frontBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                frontBrace2.rotation.z = Math.PI / 2 + braceAngle;
                frontBrace2.position = new BABYLON.Vector3(xMid, 0, halfSize);
                frontBrace2.parent = parent;
                frontBrace2.material = braceMat;
                
                // === BACK FACE X-BRACING ===
                const backBrace1 = BABYLON.MeshBuilder.CreateCylinder(name + "_backBrace1_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                backBrace1.rotation.z = Math.PI / 2 - braceAngle;
                backBrace1.position = new BABYLON.Vector3(xMid, 0, -halfSize);
                backBrace1.parent = parent;
                backBrace1.material = braceMat;
                
                const backBrace2 = BABYLON.MeshBuilder.CreateCylinder(name + "_backBrace2_" + i, {
                    diameter: tubeSize * 0.5,
                    height: braceLength,
                    tessellation: 6
                }, this.scene);
                backBrace2.rotation.z = Math.PI / 2 + braceAngle;
                backBrace2.position = new BABYLON.Vector3(xMid, 0, -halfSize);
                backBrace2.parent = parent;
                backBrace2.material = braceMat;
                
                // === WELD JOINTS at rung connections (every 2nd segment for performance) ===
                if (i % 2 === 0) {
                    chordPositions.forEach((pos, idx) => {
                        const weld = BABYLON.MeshBuilder.CreateTorus(name + "_weld" + i + "_" + idx, {
                            diameter: tubeSize * 1.3,
                            thickness: tubeSize * 0.15,
                            tessellation: 8
                        }, this.scene);
                        weld.rotation.z = Math.PI / 2;
                        weld.position = new BABYLON.Vector3(xStart, pos.y, pos.z);
                        weld.parent = parent;
                        weld.material = weldMat;
                    });
                }
            }
            
            // === END PLATES (connector flanges at truss ends) ===
            const createEndPlate = (xPos, isStart) => {
                const plate = BABYLON.MeshBuilder.CreateBox(name + "_endPlate" + (isStart ? "Start" : "End"), {
                    width: 0.02,
                    height: trussSize + 0.04,
                    depth: trussSize + 0.04
                }, this.scene);
                plate.position = new BABYLON.Vector3(xPos, 0, 0);
                plate.parent = parent;
                plate.material = connectorMat;
                
                // Corner bolt holes (visual detail)
                const boltPositions = [
                    { y: halfSize, z: halfSize },
                    { y: halfSize, z: -halfSize },
                    { y: -halfSize, z: halfSize },
                    { y: -halfSize, z: -halfSize }
                ];
                boltPositions.forEach((bPos, bIdx) => {
                    const bolt = BABYLON.MeshBuilder.CreateCylinder(name + "_bolt" + (isStart ? "S" : "E") + bIdx, {
                        diameter: tubeSize * 0.6,
                        height: 0.025,
                        tessellation: 8
                    }, this.scene);
                    bolt.rotation.z = Math.PI / 2;
                    bolt.position = new BABYLON.Vector3(xPos + (isStart ? -0.01 : 0.01), bPos.y, bPos.z);
                    bolt.parent = parent;
                    bolt.material = weldMat;
                });
            };
            
            createEndPlate(-length / 2, true);
            createEndPlate(length / 2, false);
            
            // OPTIMIZATION: Freeze all truss components (static geometry)
            parent.getChildMeshes().forEach(mesh => {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
            });
            
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
    
    createDJBooth() {
        // === HYPERREALISTIC INTEGRATED DJ/VJ BOOTH ===
        // Positioned at BACK of club (z=-24)
        // DJ faces DANCE FLOOR (toward positive z direction)
        
        log.info("🎛️ Creating integrated DJ/VJ booth...");
        
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
        platform.freezeWorldMatrix(); // OPTIMIZATION: Freeze static platform
        platform.doNotSyncBoundingInfo = true;
        
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
        platformTop.freezeWorldMatrix(); // OPTIMIZATION: Freeze static platform top
        platformTop.doNotSyncBoundingInfo = true;
        
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
        audioBtn.position = new BABYLON.Vector3(0, 0.96, -22.5);
        audioBtn.isPickable = true;
        
        const audioBtnMat = this.materialFactory.createStandardMaterial("audioBtnMat", {
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
                label: "SMOKE", 
                control: "smokeActive",
                onColor: new BABYLON.Color3(0.8, 0.8, 1.0), // White/Blueish
                offColor: new BABYLON.Color3(0.2, 0.2, 0.3),
                x: 1.8,
                row3: true
            },
            { 
                label: "LASER SHEET", 
                control: "laserSheetActive",
                onColor: new BABYLON.Color3(0, 1, 0), // Green
                offColor: new BABYLON.Color3(0, 0.2, 0),
                x: 2.3,
                row3: true
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
            // Determine initial state
            const isActive = this[btnDef.control];
            
            const toggleMat = this.materialFactory.createStandardMaterial("toggleMat_" + btnDef.control, {
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
        // Position: Row 3, right side (x=3.8 to 4.3)
        const sliderX = 3.8;
        const sliderZ = -25.3; // Row 3
        const sliderY = 0.95;
        
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
        // Back wall is 35m wide × 10m tall at Z=-27
        const panelWidth = 1.2;
        const panelHeight = 1.0; // Slightly smaller for more rows
        const cols = 28;  // 28 × 1.2 = 33.6m (fills 35m wall with slight margin)
        const rows = 10;  // 10 × 1.0 = 10m (floor to ceiling)
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
                const y = (row * panelHeight) + (panelHeight / 2) + 0.05; // Start just above floor
                const z = -26; // Behind DJ booth
                
                panel.position = new BABYLON.Vector3(x, y, z);
                // Plane faces -Z by default, which is toward the dance floor - correct!
                // No rotation needed (was incorrectly rotating to face the wall)
                
                // VERY LOW BASE BRIGHTNESS - so blackout patterns are clearly visible
                const panelMat = this.materialFactory.createStandardMaterial("ledMat_" + row + "_" + col, {
                    emissiveColor: [0.1, 0, 0], // MUCH dimmer for contrast
                    disableLighting: true
                });
                panelMat.backFaceCulling = false; // Ensure visible from both sides
                panel.material = panelMat;
                
                // PERFORMANCE: Freeze static geometry (panel position never changes)
                panel.freezeWorldMatrix();
                panel.doNotSyncBoundingInfo = true;
                panel.isPickable = false;
                
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
        this.ledPattern = 23;  // Start with Rainbow Rave pattern (always visible)
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

    createVJLightingControls() {
        // === VJ LIGHTING CONTROL CONSOLE (right side of platform) ===
        // Simple control panel with toggle buttons for easy lighting control
        // Positioned at x=3, facing DJ (who stands with back to LED wall)
        
        const consoleMat = this.materialFactory.createPBRMaterial("vjConsoleMat", {
            baseColor: [0.05, 0.05, 0.06],
            metallic: 0.9,
            roughness: 0.3
        });
        
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
            },
            { 
                label: "LASER SHEET", 
                control: "laserSheetActive",
                onColor: new BABYLON.Color3(0, 1, 0),
                offColor: new BABYLON.Color3(0, 0.2, 0),
                row: 3, col: 0 // New row for laser sheet
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
            
            const toggleMat = this.materialFactory.createStandardMaterial("toggleMat_" + btnDef.control, {
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
            
            const labelMat = this.materialFactory.createStandardMaterial("labelMat_" + btnDef.control, {
                diffuseTexture: labelTexture,
                emissiveColor: [0.9, 0.9, 0.9],
                disableLighting: true,
                opacityTexture: labelTexture
            });
            labelPlane.material = labelMat;
        });
        
        log.info("✅ Created VJ lighting control console with 9 intuitive buttons in 3x3 grid");
    }

    // createVJStation() method removed - was 310+ lines of duplicate/unused code

    createHyperrealisticSmoke() {
        // 2. Atmospheric Haze: Dispersed particles for light beams
        
        // Create a soft particle texture using Canvas (no external assets needed)
        const smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = 128;
        smokeCanvas.height = 128;
        const ctx = smokeCanvas.getContext('2d');
        
        // Create soft radial gradient for smoke puff
        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');     // Center opaque
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.5)'); // Soft edge
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');     // Transparent fade
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        
        const particleTexture = new BABYLON.Texture(smokeCanvas.toDataURL(), this.scene);
        particleTexture.name = "proceduralSmokeTexture";
        
        // --- 1. FLOOR FOG (Dry Ice) ---
        // Heavy, low-lying fog that stays near the floor
        this.floorFog = new BABYLON.ParticleSystem("floorFog", 2000, this.scene);
        this.floorFog.particleTexture = particleTexture;
        this.floorFog.emitter = new BABYLON.Vector3(0, 0.1, -12); // Center of dance floor
        
        // Emit box (wide area on floor)
        this.floorFog.minEmitBox = new BABYLON.Vector3(-10, 0, -10);
        this.floorFog.maxEmitBox = new BABYLON.Vector3(10, 0.5, 10);
        
        // Colors (Cold white/blueish for dry ice look)
        this.floorFog.color1 = new BABYLON.Color4(0.8, 0.8, 0.9, 0.3); // Increased visibility
        this.floorFog.color2 = new BABYLON.Color4(0.9, 0.9, 1.0, 0.3);
        this.floorFog.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
        
        // Size & Life
        this.floorFog.minSize = 1.5;
        this.floorFog.maxSize = 4.0;
        this.floorFog.minLifeTime = 4.0;
        this.floorFog.maxLifeTime = 7.0;
        
        // Emission
        this.floorFog.emitRate = 200; // Increased rate
        this.floorFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        // Physics (Gravity pulls down slightly to keep it low)
        this.floorFog.gravity = new BABYLON.Vector3(0, -0.05, 0);
        this.floorFog.direction1 = new BABYLON.Vector3(-1, 0, -1);
        this.floorFog.direction2 = new BABYLON.Vector3(1, 0.1, 1);
        
        // Rotation
        this.floorFog.minAngularSpeed = -0.5;
        this.floorFog.maxAngularSpeed = 0.5;
        
        // Speed
        this.floorFog.minEmitPower = 0.5;
        this.floorFog.maxEmitPower = 1.0;
        this.floorFog.updateSpeed = 0.005;
        
        // --- 2. ATMOSPHERIC HAZE ---
        // Light, dispersed particles to make light beams visible
        this.haze = new BABYLON.ParticleSystem("haze", 1000, this.scene);
        this.haze.particleTexture = particleTexture;
        
        // Emitter (Large box covering the room air volume)
        this.haze.emitter = new BABYLON.Vector3(0, 4, -12);
        this.haze.minEmitBox = new BABYLON.Vector3(-12, -4, -12);
        this.haze.maxEmitBox = new BABYLON.Vector3(12, 4, 12);
        
        // Colors (Very faint dust/smoke)
        this.haze.color1 = new BABYLON.Color4(0.5, 0.5, 0.6, 0.05); // Increased visibility
        this.haze.color2 = new BABYLON.Color4(0.6, 0.6, 0.7, 0.05);
        this.haze.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
        
        // Size & Life
        this.haze.minSize = 0.2;
        this.haze.maxSize = 1.5;
        this.haze.minLifeTime = 3.0;
        this.haze.maxLifeTime = 6.0;
        
        // Emission
        this.haze.emitRate = 100;
        this.haze.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        // Physics (Float gently)
        this.haze.gravity = new BABYLON.Vector3(0, 0.01, 0); // Slight rise
        this.haze.direction1 = new BABYLON.Vector3(-0.5, -0.5, -0.5);
        this.haze.direction2 = new BABYLON.Vector3(0.5, 0.5, 0.5);
        
        this.haze.minEmitPower = 0.1;
        this.haze.maxEmitPower = 0.5;
        this.haze.updateSpeed = 0.005;
        
        // Initialize state
        this.smokeActive = false;
        
        log.info('💨 Hyperrealistic smoke systems created (Floor Fog + Haze)');
    }

    createBoothLighting() {
        // LED strip under platform (accent lighting)
        const stripMat = this.materialFactory.createStandardMaterial("ledStripMat", {
            emissiveColor: [0, 0.5, 1],
            disableLighting: true,
            alpha: 0.8
        });
        
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
        
        // Array of light positions on truss - positioned ON actual truss beams
        // Main trusses run along X at Z=-8, -12, -16, -20 (horizontal beams)
        // Cross beams run along Z at X=-8, -4, 0, 4, 8 (vertical connecting beams)
        const lightPositions = [
            { x: -8, z: -8 },   // Left on truss1 (front)
            { x: -8, z: -12 },  // Left on truss2 (middle)
            { x: -8, z: -16 },  // Left on truss3 (back)
            { x: 8, z: -8 },    // Right on truss1 (front)
            { x: 8, z: -12 },   // Right on truss2 (middle)
            { x: 8, z: -16 }    // Right on truss3 (back)
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
            const clampMat = this.materialFactory.createPBRMaterial("clampMat" + i, {
                baseColor: [0.1, 0.1, 0.1], // Dark gray steel
                metallic: 0.9,
                roughness: 0.4
            });
            
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
            
            // Drop pipe (vertical pipe from clamp to fixture base)
            const dropPipe = BABYLON.MeshBuilder.CreateCylinder("dropPipe" + i, {
                diameter: 0.04,
                height: 0.2,  // 0.2m drop from truss to fixture
                tessellation: 12
            }, this.scene);
            dropPipe.parent = root;
            dropPipe.position.y = 0.1;  // Centered between clamp and base
            dropPipe.material = lightFixtureMat;
            
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

            // 1. BASE (Static mount)
            const base = BABYLON.MeshBuilder.CreateBox("fixtureBase" + i, {
                width: 0.4,
                height: 0.1,
                depth: 0.4
            }, this.scene);
            base.parent = root;
            base.position.y = 0; // At root position
            base.material = lightFixtureMat;
            
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
                diameter: 0.4,    // Fits between arms
                height: 0.6,      // Body length
                tessellation: 24
            }, this.scene);
            fixture.parent = head;
            // Rotate cylinder so its top points along local Z (forward) or Y (down)?
            // Let's align it so -Y is the light direction (standard for spotlights)
            // Cylinder default is vertical (Y). So default is pointing up/down.
            // We want it to point "down" relative to the head node when tilt is 0.
            fixture.rotation.x = 0; 
            fixture.position.y = 0;
            fixture.material = lightFixtureMat;
            
            // Front bezel/rim - VERY DARK to not be distracting
            const bezel = BABYLON.MeshBuilder.CreateTorus("bezel" + i, {
                diameter: 0.42,
                thickness: 0.03,
                tessellation: 32
            }, this.scene);
            bezel.parent = head;
            bezel.position.y = -0.3; // Bottom of cylinder
            bezel.material = this.materialFactory.createPBRMaterial("bezelMat" + i, {
                baseColor: [0.02, 0.02, 0.02], // Nearly black
                metallic: 0.8,
                roughness: 0.4
            });
            
            // Light lens
            const lens = BABYLON.MeshBuilder.CreateCylinder("lens" + i, {
                diameter: 0.35,
                height: 0.05,
                tessellation: 32
            }, this.scene);
            lens.parent = head;
            lens.position.y = -0.28; // Just inside bezel
            
            const lensMat = this.materialFactory.createStandardMaterial("lensMat" + i, {
                emissiveColor: this.currentSpotColor.scale(6.0),
                disableLighting: true
            });
            lensMat.backFaceCulling = false;
            lens.material = lensMat;
            lens.renderingGroupId = 2;
            
            // Light source (bulb)
            const lightSource = BABYLON.MeshBuilder.CreateSphere("lightSource" + i, {
                diameter: 0.3
            }, this.scene);
            lightSource.parent = head;
            lightSource.position.y = -0.25;
            const sourceMat = this.materialFactory.createStandardMaterial("sourceMat" + i, {
                emissiveColor: this.currentSpotColor.scale(10.0),
                disableLighting: true
            });
            sourceMat.backFaceCulling = false;
            sourceMat.backFaceCulling = false;
            lightSource.material = sourceMat;
            lightSource.renderingGroupId = 2;
            
            // Flare removed - was causing visible red ring artifact
            
            this.trussLights.push({ 
                root,
                yoke,
                head,
                fixture, 
                lens, 
                lensMat, 
                lightSource, 
                sourceMat,
                base,
                bezel,
                flare: null,
                flareMat: null
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
        
        // Reuse clamp material for strobe mounts
        const strobeMountMat = this.materialFactory.createPBRMaterial("strobeMountMat", {
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
            
            const strobe = BABYLON.MeshBuilder.CreateBox("strobe" + i, {
                width: 0.4,
                height: 0.3,
                depth: 0.3
            }, this.scene);
            strobe.position = new BABYLON.Vector3(pos.x, 7.6, pos.z);
            const strobeMat = this.materialFactory.createStandardMaterial("strobeMat" + i, {
                emissiveColor: [0, 0, 0], // Off by default
                disableLighting: true
            });
            
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
            { x: 0, z: -12, trussY: 7.55, type: 'multi' },    // Multi-beam center (main truss) - FIXED: Moved to Z=-12 to sit ON truss
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
            const clampMat = this.materialFactory.createPBRMaterial("clampMat" + i, {
                baseColor: [0.3, 0.3, 0.3],
                metallic: 1.0,
                roughness: 0.4
            });BABYLON.Color3(0.3, 0.3, 0.3);
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
        // PROFESSIONAL VJ PATTERN SYSTEM - Based on real club/concert lighting
        // Pattern progression: Build → Peak → Break → Ambient → Build (repeating cycle)
        this.lightModeSwitchTime = 0;
        this.lightingPhase = 'build'; // 'build', 'peak', 'breakdown', 'ambient', 'drop'
        this.currentShowMode = 'spotlights'; // What's currently active: 'spotlights', 'lasers', 'mirror', 'combo'
        
        // Dynamic phase durations - vary for natural feel (like real DJ sets)
        this.phaseDurations = {
            build: 30 + Math.random() * 10,      // 30-40s: Building energy with spotlights
            peak: 20 + Math.random() * 10,       // 20-30s: High energy with lasers
            breakdown: 15 + Math.random() * 5,   // 15-20s: Dramatic breakdown with mirror ball
            ambient: 20 + Math.random() * 10,    // 20-30s: Chill moment with slow patterns
            drop: 25 + Math.random() * 10        // 25-35s: Big drop with everything combined
        };
        
        // Track energy level for smooth transitions (0.0 = ambient, 1.0 = peak)
        this.energyLevel = 0.5;
        this.targetEnergy = 0.8;
        
    }
    
    createLaserBeam(laserIndex, beamIndex, pos) {
        // HYPERREALISTIC LASER BEAM - Physically accurate laser appearance
        // Real lasers: pencil-thin coherent light with atmospheric scatter creating visible beam
        
        // === CORE BEAM - Ultra-thin, razor-sharp coherent light ===
        // Real show lasers are 2-4mm diameter, we use 5mm for visibility
        const beam = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_beam" + beamIndex, {
            diameterTop: 0.004,    // 4mm at source (very tight)
            diameterBottom: 0.008, // 8mm at end (slight divergence like real laser)
            height: 1,
            tessellation: 6        // Low poly - lasers are perfectly round
        }, this.scene);
        beam.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        
        // Core material - BLINDINGLY bright, pure saturated color
        const beamMat = new BABYLON.StandardMaterial("laserCoreMat" + laserIndex + "_" + beamIndex, this.scene);
        beamMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        beamMat.specularColor = new BABYLON.Color3(0, 0, 0);
        beamMat.emissiveColor = new BABYLON.Color3(1, 0, 0); // Pure red - will be updated
        beamMat.disableLighting = true;
        beamMat.backFaceCulling = false;
        beam.material = beamMat;
        beam.renderingGroupId = 2; // Render on top for crisp appearance
        beam.isPickable = false;
        
        // === INNER GLOW - Tight halo simulating light scatter in immediate vicinity ===
        const innerGlow = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_innerGlow" + beamIndex, {
            diameterTop: 0.025,    // 2.5cm at source
            diameterBottom: 0.05,  // 5cm at end (expands with beam)
            height: 1,
            tessellation: 8
        }, this.scene);
        innerGlow.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        innerGlow.isPickable = false;
        
        const innerGlowMat = new BABYLON.StandardMaterial("laserInnerGlowMat" + laserIndex + "_" + beamIndex, this.scene);
        innerGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        innerGlowMat.specularColor = new BABYLON.Color3(0, 0, 0);
        innerGlowMat.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3); // Slightly desaturated for glow
        innerGlowMat.alpha = 0.6; // Semi-transparent
        innerGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for glow
        innerGlowMat.disableLighting = true;
        innerGlowMat.backFaceCulling = false;
        innerGlow.material = innerGlowMat;
        innerGlow.renderingGroupId = 1;
        
        // === OUTER ATMOSPHERIC SCATTER - Wide soft haze from fog/smoke ===
        // This is what makes laser beams visible in clubs (haze machine effect)
        const outerGlow = BABYLON.MeshBuilder.CreateCylinder("laser" + laserIndex + "_outerGlow" + beamIndex, {
            diameterTop: 0.08,     // 8cm at source
            diameterBottom: 0.18,  // 18cm at end (wide scatter)
            height: 1,
            tessellation: 8
        }, this.scene);
        outerGlow.position = new BABYLON.Vector3(pos.x, pos.trussY - 0.1, pos.z);
        outerGlow.isPickable = false;
        
        // Animated noise texture for realistic atmospheric turbulence
        const hazeNoise = new BABYLON.NoiseProceduralTexture("laserHazeNoise" + laserIndex + "_" + beamIndex, 64, this.scene);
        hazeNoise.octaves = 3;
        hazeNoise.persistence = 0.7;
        hazeNoise.animationSpeedFactor = 2.0; // Faster animation for turbulent haze
        hazeNoise.brightness = 0.6;
        
        const outerGlowMat = new BABYLON.StandardMaterial("laserOuterGlowMat" + laserIndex + "_" + beamIndex, this.scene);
        outerGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        outerGlowMat.specularColor = new BABYLON.Color3(0, 0, 0);
        outerGlowMat.emissiveColor = new BABYLON.Color3(1, 0.2, 0.2); // Soft color
        outerGlowMat.opacityTexture = hazeNoise; // Noise creates realistic haze pattern
        outerGlowMat.alpha = 0.15; // Very transparent
        outerGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        outerGlowMat.disableLighting = true;
        outerGlowMat.backFaceCulling = false;
        outerGlow.material = outerGlowMat;
        outerGlow.renderingGroupId = 1;
        
        // === FLOOR HIT SPOT - Sharp bright point where laser terminates ===
        // Real lasers create a small, intense dot
        const hitSpot = BABYLON.MeshBuilder.CreateDisc("laserHit" + laserIndex + "_" + beamIndex, {
            radius: 0.025,  // 2.5cm - very small like real laser
            tessellation: 12
        }, this.scene);
        hitSpot.rotation.x = Math.PI / 2;
        hitSpot.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
        hitSpot.isPickable = false;
        
        const hitSpotMat = new BABYLON.StandardMaterial("laserHitMat" + laserIndex + "_" + beamIndex, this.scene);
        hitSpotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        hitSpotMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
        hitSpotMat.alpha = 1.0;
        hitSpotMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        hitSpotMat.disableLighting = true;
        hitSpot.material = hitSpotMat;
        hitSpot.renderingGroupId = 2;
        
        // === HIT SPOT GLOW - Soft bloom around termination point ===
        const hitGlow = BABYLON.MeshBuilder.CreateDisc("laserHitGlow" + laserIndex + "_" + beamIndex, {
            radius: 0.12,  // 12cm soft glow around hit point
            tessellation: 16
        }, this.scene);
        hitGlow.rotation.x = Math.PI / 2;
        hitGlow.position = new BABYLON.Vector3(pos.x, 0.015, pos.z - 5);
        hitGlow.isPickable = false;
        
        const hitGlowMat = new BABYLON.StandardMaterial("laserHitGlowMat" + laserIndex + "_" + beamIndex, this.scene);
        hitGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        hitGlowMat.emissiveColor = new BABYLON.Color3(1, 0.3, 0.3);
        hitGlowMat.alpha = 0.4;
        hitGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        hitGlowMat.disableLighting = true;
        hitGlow.material = hitGlowMat;
        hitGlow.renderingGroupId = 1;
        
        return { 
            mesh: beam, 
            material: beamMat,
            innerGlow: innerGlow,
            innerGlowMat: innerGlowMat,
            beamGlow: outerGlow,  // Keep name for compatibility
            glowMat: outerGlowMat,
            hitSpot: hitSpot,
            hitSpotMat: hitSpotMat,
            hitGlow: hitGlow,
            hitGlowMat: hitGlowMat,
            beamIndex: beamIndex 
        };
    }

    createLights() {
        
        // Ambient light - brighter for better visibility in VR and desktop
        this.lightFactory.getPreset('ambient', 'ambient');
        
        // Skip inline spotlight creation if using modular system
        if (this.useModularSystems && this.systems.spotlight) {
            log.info('⏭️ Skipping inline spotlight creation (using modular SpotlightSystem)');
            
            // Initialize color tracking (still needed for VJ controls)
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
            this.currentSpotColor = spotColors[0];
            this.spotColorIndex = 0;
            this.lastColorChange = 0;
            this.spotColorList = spotColors;
            
            // LED wall backlight
            const ledLight = new BABYLON.PointLight("ledLight", new BABYLON.Vector3(0, 4, -25), this.scene);
            ledLight.diffuse = new BABYLON.Color3(0.8, 0.8, 1.0);
            ledLight.intensity = 10;
            ledLight.range = 25;
            ledLight.setEnabled(false);
            
            return; // Skip rest of inline spotlight creation
        }
        
        // === LEGACY INLINE SPOTLIGHT CREATION (when modular systems disabled) ===
        // Spotlights mounted on truss (moving heads)
        this.spotlights = [];
        // 6 spotlights: 3 on left side, 3 on right side - POSITIONED ON ACTUAL TRUSSES
        // Main trusses at Z=-8, -12, -16; spotlights at X=±8 (where trusses intersect side beams)
        const spotPositions = [
            { x: -8, z: -8 },   // Left on truss1 (front)
            { x: -8, z: -12 },  // Left on truss2 (middle)
            { x: -8, z: -16 },  // Left on truss3 (back)
            { x: 8, z: -8 },    // Right on truss1 (front)
            { x: 8, z: -12 },   // Right on truss2 (middle)
            { x: 8, z: -16 }    // Right on truss3 (back)
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
            // Get fixture data if available
            const fixtureData = this.trussLights ? this.trussLights[i] : null;
            const head = fixtureData ? fixtureData.head : null;
            const yoke = fixtureData ? fixtureData.yoke : null;

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
                diameterTop: 1.5,      // Wide end - reduced from 3.0 to 1.5m for tighter, more realistic beam
                diameterBottom: 0.2,   // Narrow end - slightly reduced for tighter beam
                height: 1,             // Will be scaled to actual beam length
                tessellation: 8,       // OPTIMIZED: Reduced from 16 (sufficient for VR)
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // PARENT BEAM TO HEAD for realistic movement
            if (head) {
                beam.parent = head;
                // Cylinder is Y-up. We want it to point along local -Y (down relative to head)
                // But diameterTop is the "top" (+Y). We want the wide end at the bottom.
                // So we need to rotate it 180 degrees so "top" (wide) points down (-Y).
                beam.rotation.x = Math.PI; 
                beam.position = new BABYLON.Vector3(0, -0.5, 0); // Initial position
            } else {
                beam.position = new BABYLON.Vector3(pos.x, 7.3, pos.z);
            }
            
            beam.isPickable = false;
            // beam.rotationQuaternion = BABYLON.Quaternion.Identity(); // Removed to allow parenting rotation
            
            // HYPERREALISTIC VOLUMETRIC BEAM - Animated smoke/dust particles in light cone
            // Real light beams show visible particles drifting through the beam
            const beamMat = new BABYLON.StandardMaterial("spotBeamMat" + i, this.scene);
            beamMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            beamMat.specularColor = new BABYLON.Color3(0, 0, 0);
            beamMat.emissiveColor = this.currentSpotColor.clone(); // Will be updated in animation loop
            
            // HYPERREALISM: Add animated noise texture for smoke/dust particles in beam
            const noiseTexture = new BABYLON.NoiseProceduralTexture("beamNoise" + i, 128, this.scene); // OPTIMIZED: Reduced from 256
            noiseTexture.animationSpeedFactor = 0.8; // Slow drifting smoke
            noiseTexture.persistence = 0.3; // Softer noise pattern
            noiseTexture.brightness = 0.6;
            noiseTexture.octaves = 3;
            beamMat.opacityTexture = noiseTexture; // Use noise as opacity for particle effect
            
            beamMat.alpha = 0.12; // Slightly more visible for hyperrealism
            beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light
            beamMat.backFaceCulling = false; // Visible from all angles
            beamMat.disableLighting = true; // Self-illuminated
            beamMat.useAlphaFromDiffuseTexture = false;
            
            beam.material = beamMat;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1; // Render after opaque objects
            
            // PERFORMANCE: Removed beamGlow (outer glow cylinder) - caused doubled beam effect
            const beamGlow = null;
            const beamGlowMat = null;

            
            // HYPERREALISTIC LIGHT POOL - Simple colored disc on floor
            // Real spotlight pools are smooth gradients, not textured
            const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + i, {
                radius: 0.5, 
                tessellation: 32
            }, this.scene);
            lightPool.rotation.x = Math.PI / 2;
            lightPool.position = new BABYLON.Vector3(pos.x, 0.03, pos.z - 5);
            lightPool.isPickable = false;
            
            // Simple emissive material - no texture animation
            const poolMat = new BABYLON.StandardMaterial("poolMat" + i, this.scene);
            poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolMat.specularColor = new BABYLON.Color3(0, 0, 0);
            poolMat.emissiveColor = this.currentSpotColor.clone(); // Will be updated in animation loop
            poolMat.alpha = 0.7; // Semi-transparent for realistic light pool
            poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending
            poolMat.disableLighting = true;
            lightPool.material = poolMat;
            lightPool.renderingGroupId = 1;
            
            // Store reference for gobo texture (null - not using procedural texture anymore)
            const goboTexture = null;
            
            // HYPERREALISTIC SOFT EDGE GLOW - Outer ring for realistic light falloff
            const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + i, {
                radius: 0.5, // Diameter 1.0 base
                tessellation: 32
            }, this.scene);
            lightPoolGlow.rotation.x = Math.PI / 2;
            lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5); // Slightly below main pool
            lightPoolGlow.isPickable = false;
            
            // Soft gradient material for outer glow
            const poolGlowMat = new BABYLON.StandardMaterial("poolGlowMat" + i, this.scene);
            poolGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.8); // Softer than core
            poolGlowMat.alpha = 0.4; // Semi-transparent
            poolGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            poolGlowMat.disableLighting = true;
            lightPoolGlow.material = poolGlowMat;
            lightPoolGlow.renderingGroupId = 1;
            
            // Core layer removed for performance - using main pool + glow ring only
            const lightPoolCore = null;
            const poolCoreMat = null;
            


            
            // PERFORMANCE: Shadows disabled for better FPS\n            // Shadow generators are very expensive - removing them entirely\n            // if (i % 3 === 0) { // Only every 3rd light for performance\n            //     const shadowGenerator = new BABYLON.ShadowGenerator(512, spot);\n            //     shadowGenerator.useBlurExponentialShadowMap = true;\n            //     shadowGenerator.blurScale = 2;\n            //     shadowGenerator.setDarkness(0.4);\n            // }
            
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
                goboTexture: goboTexture, // Store for animation updates
                fixture: fixtureData ? fixtureData.fixture : null,
                head: head,
                yoke: yoke,
                lens: fixtureData ? fixtureData.lens : null,
                lightSource: fixtureData ? fixtureData.lightSource : null,
                bezel: fixtureData ? fixtureData.bezel : null,
                flare: fixtureData ? fixtureData.flare : null,
                lensMat: fixtureData ? fixtureData.lensMat : null,
                sourceMat: fixtureData ? fixtureData.sourceMat : null,
                flareMat: fixtureData ? fixtureData.flareMat : null,
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

    createBlinders() {
        // AUDIENCE BLINDERS - High intensity warm white lights for drops/impacts
        // 4 Blinders mounted on the front truss facing the crowd
        this.blinders = [];
        
        const blinderPositions = [
            { x: -6, y: 7.5, z: -8 },
            { x: -2, y: 7.5, z: -8 },
            { x: 2, y: 7.5, z: -8 },
            { x: 6, y: 7.5, z: -8 }
        ];

        blinderPositions.forEach((pos, i) => {
            // Fixture Mesh (Square 4-cell blinder style)
            const fixture = BABYLON.MeshBuilder.CreateBox("blinder" + i, {
                width: 0.8,
                height: 0.8,
                depth: 0.2
            }, this.scene);
            fixture.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
            fixture.rotation.x = Math.PI / 6; // Angled down slightly
            
            const fixtureMat = this.materialFactory.getPreset('lightFixture');
            fixture.material = fixtureMat;

            // Light Emitter (The "Bulb" face)
            const emitter = BABYLON.MeshBuilder.CreatePlane("blinderEmitter" + i, {
                size: 0.7
            }, this.scene);
            emitter.parent = fixture;
            emitter.position.z = -0.11; // Front face
            emitter.rotation.y = Math.PI; // Face forward
            
            const emitterMat = new BABYLON.PBRMaterial("blinderMat" + i, this.scene);
            emitterMat.albedoColor = new BABYLON.Color3(0, 0, 0);
            emitterMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.7); // Warm white
            emitterMat.emissiveIntensity = 0; // Start off
            emitterMat.disableLighting = true;
            emitter.material = emitterMat;

            // Lens Flare for "Blinding" effect
            // We use a billboarded plane with a flare texture that scales up when on
            const flare = BABYLON.MeshBuilder.CreatePlane("blinderFlare" + i, {
                size: 4.0
            }, this.scene);
            flare.parent = fixture;
            flare.position.z = -0.2;
            flare.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
            
            const flareTexture = new BABYLON.Texture("https://assets.babylonjs.com/textures/flare.png", this.scene);
            const flareMat = new BABYLON.StandardMaterial("blinderFlareMat" + i, this.scene);
            flareMat.diffuseTexture = flareTexture;
            flareMat.emissiveColor = new BABYLON.Color3(1, 0.9, 0.7);
            flareMat.opacityTexture = flareTexture;
            flareMat.alpha = 0; // Start invisible
            flareMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            flareMat.disableLighting = true;
            flare.material = flareMat;

            this.blinders.push({
                fixture: fixture,
                emitterMat: emitterMat,
                flare: flare,
                flareMat: flareMat,
                intensity: 0
            });
        });
    }

    createLaserSheet() {
        // === LASER SHEET EFFECT ===
        // Single source fan from LED wall scanning the room
        // Hyperrealistic implementation: Triangle fan geometry with smoke texture
        
        // 1. Create the Source/Projector Housing
        // Positioned high on the back LED wall (z=-26), centered
        // Height 5.5m clears the DJ booth and hits the dancefloor nicely
        const sourcePos = new BABYLON.Vector3(0, 5.5, -25.8); 
        
        this.laserSheetSource = BABYLON.MeshBuilder.CreateBox("laserSheetSource", {
            width: 0.5, height: 0.2, depth: 0.4
        }, this.scene);
        this.laserSheetSource.position = sourcePos;
        this.laserSheetSource.material = this.materialFactory.getPreset('cdjBody'); // Dark metal
        
        // Aperture (Glowing slit)
        this.laserAperture = BABYLON.MeshBuilder.CreateBox("laserSheetAperture", {
            width: 0.4, height: 0.05, depth: 0.02
        }, this.scene);
        this.laserAperture.parent = this.laserSheetSource;
        this.laserAperture.position.z = 0.21; // Front face
        
        const apertureMat = new BABYLON.StandardMaterial("apertureMat", this.scene);
        apertureMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
        apertureMat.disableLighting = true;
        this.laserAperture.material = apertureMat;
        
        // 2. Create the Laser Sheet Geometry (Triangle Fan)
        // We create a custom mesh for the fan shape
        const sheet = new BABYLON.Mesh("laserSheet", this.scene);
        
        // Fan dimensions
        const length = 45; // Reach across the room
        const widthEnd = 35; // Wide spread at the end
        
        const positions = [
            0, 0, 0,              // 0: Source (Tip)
            -widthEnd/2, 0, length, // 1: Far Left
            widthEnd/2, 0, length   // 2: Far Right
        ];
        
        const indices = [0, 1, 2, 0, 2, 1]; // Double sided
        
        const uvs = [
            0.5, 0,  // Source
            0, 1,    // Left
            1, 1     // Right
        ];
        
        const normals = [];
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.uvs = uvs;
        vertexData.normals = normals;
        vertexData.applyToMesh(sheet);
        
        // Parent to source for easy rotation/scanning
        sheet.parent = this.laserSheetSource;
        sheet.position = new BABYLON.Vector3(0, 0, 0.25); // Start at aperture
        
        // 3. Material & Texture (Hyperrealistic Smoke)
        const sheetMat = new BABYLON.StandardMaterial("laserSheetMat", this.scene);
        sheetMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.specularColor = new BABYLON.Color3(0, 0, 0);
        sheetMat.emissiveColor = new BABYLON.Color3(0, 1, 0); // Default green
        sheetMat.disableLighting = true;
        sheetMat.alpha = 0.6;
        sheetMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        sheetMat.backFaceCulling = false;
        
        // Procedural noise for smoke movement
        const noiseTexture = new BABYLON.NoiseProceduralTexture("laserSheetNoise", 256, this.scene); // OPTIMIZED: Reduced from 512
        noiseTexture.octaves = 4;
        noiseTexture.persistence = 0.8; // Smoky detail
        noiseTexture.animationSpeedFactor = 0.5;
        noiseTexture.brightness = 0.5;
        noiseTexture.contrast = 2.0; // Defined smoke wisps
        
        sheetMat.opacityTexture = noiseTexture;
        sheetMat.emissiveTexture = noiseTexture; // Texture the light itself
        
        sheet.material = sheetMat;
        this.laserSheet = sheet;
        
        // 4. Light Source (Actual light projection)
        // A spot light to illuminate the floor/avatars where the sheet hits
        this.laserLight = new BABYLON.SpotLight("laserSheetLight", 
            sourcePos,
            new BABYLON.Vector3(0, -0.5, 1), // Initial direction
            Math.PI / 2, // Wide angle
            2, // Exponent
            this.scene
        );
        this.laserLight.diffuse = new BABYLON.Color3(0, 1, 0);
        this.laserLight.intensity = 0; // Controlled by animation
        this.laserLight.parent = this.laserSheetSource; // Move with source
        
        // Remove old fan if it exists (cleanup)
        this.laserFan = null;
        
        // Add to glow layer for bloom effect
        if (this.glowLayer) {
            this.glowLayer.addIncludedOnlyMesh(this.laserSheet);
            this.glowLayer.addIncludedOnlyMesh(this.laserAperture);
        }
        
        log.info('✨ Laser sheet effect created with hyperrealistic source');
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
        this.mirrorReflectionSpots = [];
        const numSpots = 250; // INCREASED for hyperrealism (was 60)
        
        // PRE-DISTRIBUTE spots across surfaces for guaranteed even coverage
        const spotsPerSurface = Math.floor(numSpots / 6); // Divide evenly among 6 surfaces (including front wall)
        let spotIndex = 0;
        
        // No shared texture - using simple colored discs for performance and correct color updates
        
        const surfaces = [
            { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02 },
            { name: 'ceiling', axis: 'xz', fixed: 'y', value: 9.83 }, // Ceiling box bottom at 9.85
            { name: 'leftWall', axis: 'yz', fixed: 'x', value: -16.73 }, // Left wall inner face at -16.75
            { name: 'rightWall', axis: 'yz', fixed: 'x', value: 16.73 }, // Right wall inner face at 16.75
            { name: 'backWall', axis: 'xy', fixed: 'z', value: -26.73 }, // Back wall front face at -26.75
            { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.77 } // Front wall inner face at 1.75 + 0.02 offset (box center at 2, depth 0.5)
        ];
        
        surfaces.forEach(surface => {
            for (let i = 0; i < spotsPerSurface && spotIndex < numSpots; i++, spotIndex++) {
                // Visual spot (emissive disc - looks like light reflection)
                const spot = BABYLON.MeshBuilder.CreateDisc(`mirrorSpot${spotIndex}`, {
                    radius: 0.15 + Math.random() * 0.1, // Increased size: 0.15-0.25m for better visibility
                    tessellation: 8 // Increased detail slightly
                }, this.scene);
                
                const spotMat = new BABYLON.StandardMaterial(`mirrorSpotMat${spotIndex}`, this.scene);
                spotMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
                spotMat.specularColor = new BABYLON.Color3(0, 0, 0);
                spotMat.emissiveColor = this.mirrorBallSpotlightColor.clone(); // Initial color - updated every frame in animation loop
                spotMat.alpha = 0.85; // High visibility
                spotMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light
                spotMat.disableLighting = true;
                spotMat.backFaceCulling = false; // Visible from both sides
                spot.material = spotMat;
                spot.isPickable = false;
                spot.setEnabled(false);
                
                // Create VOLUMETRIC BEAM for this spot (light cutting through smoke)
                // Thin cylinder stretching from ball to spot
                const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorBeam${spotIndex}`, {
                    diameterTop: 0.02,    // Very thin at ball
                    diameterBottom: 0.2,  // Wider at spot (was 0.15)
                    height: 1.0,          // Initial height (will be scaled)
                    tessellation: 4       // Low poly for performance (hundreds of beams)
                }, this.scene);
                
                // Pivot at top (ball position) so we can scale length easily
                beam.setPivotPoint(new BABYLON.Vector3(0, 0.5, 0)); 
                
                const beamMat = new BABYLON.StandardMaterial(`mirrorBeamMat${spotIndex}`, this.scene);
                beamMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                beamMat.alpha = 0.15; // Increased from 0.08 for visible smoke beams
                beamMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending
                beamMat.disableLighting = true;
                beamMat.backFaceCulling = false;
                beam.material = beamMat;
                beam.isPickable = false;
                beam.setEnabled(false);
                
                // Generate random position on this surface
                let targetPos, normal;
                
                if (surface.axis === 'xz') { // Floor or ceiling
                    targetPos = new BABYLON.Vector3(
                        -17 + Math.random() * 34,  // x: -17 to +17 (full room width)
                        surface.value,
                        -27 + Math.random() * 29   // z: -27 to +2 (full room depth)
                    );
                    normal = surface.name === 'floor' ? 
                        new BABYLON.Vector3(0, 1, 0) : 
                        new BABYLON.Vector3(0, -1, 0);
                        
                } else if (surface.axis === 'yz') { // Left or right wall
                    targetPos = new BABYLON.Vector3(
                        surface.value,
                        0.2 + Math.random() * 9.6,  // y: 0.2 to 9.8 (full wall height)
                        -27 + Math.random() * 29    // z: -27 to +2 (full wall depth)
                    );
                    normal = surface.name === 'leftWall' ? 
                        new BABYLON.Vector3(1, 0, 0) : 
                        new BABYLON.Vector3(-1, 0, 0);
                        
                } else { // Back or front wall (xy)
                    targetPos = new BABYLON.Vector3(
                        -17 + Math.random() * 34,  // x: -17 to +17 (full wall width)
                        0.2 + Math.random() * 9.6,  // y: 0.2 to 9.8 (full wall height)
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
                    beam: beam, // Store beam reference
                    material: spotMat,
                    beamMaterial: beamMat,
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
                    twinklePhase: Math.random() * Math.PI * 2,
                    previousPosition: targetPos.clone(), // Track previous position for smooth interpolation
                    previousHitMesh: null // Track which mesh was hit last frame
                });
            }
        });
        
        log.info(`✨ Created ${this.mirrorReflectionSpots.length} reflection spots across 6 surfaces (floor, ceiling, 4 walls)`);
        
        // Store references for animation and color updates
        this.mirrorBall = mirrorBall;
        this.mirrorBallRotation = 0; // Track rotation for animation
        this.spotUpdateFrameCounter = 0; // Frame counter for synchronized updates
        
        // PERFORMANCE: Cache ray picking predicate (avoid creating new function every ray cast)
        // CRITICAL: Only accept REAL ROOM SURFACES - floor, walls, ceiling, pillars, truss
        // Reject everything else to prevent reflection spots floating in mid-air
        this.mirrorBallRayPredicate = (mesh) => {
            if (!mesh.isPickable || !mesh.isEnabled()) return false;
            if (!mesh.isVisible) return false;
            
            const name = mesh.name.toLowerCase();
            
            // WHITELIST APPROACH: Only accept known room surfaces
            // This prevents spots appearing on invisible/transparent objects
            const validSurfaces = [
                'floor', 'ground', 'dancefloor',
                'wall', 'backwall', 'sidewall', 'frontwall',
                'ceiling',
                'pillar', 'column',
                'truss', 'beam',  // Structural beams, not light beams
                'stage', 'platform', 'booth',
                'bar', 'counter',
                'brick', 'concrete'
            ];
            
            // Check if mesh name contains any valid surface keyword
            for (const surface of validSurfaces) {
                if (name.includes(surface)) {
                    // Double-check it's not a light beam or effect
                    if (name.includes('light') || name.includes('spot') || 
                        name.includes('laser') || name.includes('glow') ||
                        name.includes('led') || name.includes('pool')) {
                        return false;
                    }
                    return true;
                }
            }
            
            // Reject everything else (avatars, NPCs, effects, UI, etc.)
            return false;
        };
        
        // PERFORMANCE: Pre-create reusable Ray object (avoid allocating new Ray every frame)
        // Initialize with mirror ball position (0, 6.5, -12)
        const mirrorBallPos = new BABYLON.Vector3(0, 6.5, -12);
        this.mirrorBallRay = new BABYLON.Ray(mirrorBallPos, new BABYLON.Vector3(0, 0, 1), 30);
        
        log.info('✨ Mirror ball created with 3 dramatic spotlights from multiple angles');
    }
    
    updateAnimations() {
        const time = performance.now() / 1000;
        this.ledTime += 0.016 * (this.ledWallSpeed || 1.0);
        this.frameCounter++;
        
        // OPTIMIZATION: Pre-calculate frequently used trig values (reduces ~30-40 Math.sin/cos calls per frame)
        const sinTime = Math.sin(time);
        const cosTime = Math.cos(time);
        const sinTime2 = Math.sin(time * 2);
        const sinTime3 = Math.sin(time * 3);
        const sinTime8 = Math.sin(time * 8);
        const sinTimeThird = Math.sin(time * 0.3);
        
        // PERFORMANCE: Cache expensive calculations
        const speedMultiplierSpot = this.spotlightSpeed || 1.0;
        const speedMultiplierLaser = this.laserSpeed || 1.0;
        
        // Get audio data for reactive lighting (needed for laser sheet pulse)
        const audioData = this.getAudioData();

        // SMOKE SYSTEM CONTROL
        if (this.floorFog && this.haze) {
            if (this.smokeActive) {
                if (!this.floorFog.isStarted()) this.floorFog.start();
                if (!this.haze.isStarted()) this.haze.start();
            } else {
                if (this.floorFog.isStarted()) this.floorFog.stop();
                if (this.haze.isStarted()) this.haze.stop();
            }
        }

        // ANIMATE LASER SHEET (Hyperrealism)
        if (this.laserSheet && this.laserSheetActive) {
            // SCANNING MOTION (Tilt up and down)
            // Source is at y=5.5. Target z range is 0 to 40.
            // Angle 0 = Horizontal. Angle + = Down.
            
            const scanSpeed = 0.2 * speedMultiplierLaser;
            // Scan range: -0.1 (slightly up) to +0.4 (down to floor)
            const scanAngle = 0.15 + Math.sin(time * scanSpeed) * 0.25; 
            
            // Rotate the SOURCE (parent), sheet follows
            if (this.laserSheetSource) {
                this.laserSheetSource.rotation.x = scanAngle;
            }
            
            // Animate smoke texture flowing OUTWARD from source
            if (this.laserSheet.material && this.laserSheet.material.opacityTexture) {
                // Move V offset to flow from 0 (source) to 1 (end)
                this.laserSheet.material.opacityTexture.vOffset -= 0.008 * speedMultiplierLaser;
                // Slight side drift
                this.laserSheet.material.opacityTexture.uOffset += 0.001 * Math.sin(time * 0.5);
            }
            
            // Pulse intensity with audio
            const pulse = 0.5 + (audioData.average || 0) * 0.5;
            this.laserSheet.material.alpha = 0.5 * pulse;
            
            // Color sync
            if (this.laserEmissiveColors) {
                let sheetColor;
                if (this.currentColorIndex === 0) sheetColor = this.cachedColors.red;
                else if (this.currentColorIndex === 1) sheetColor = this.cachedColors.green;
                else sheetColor = this.cachedColors.blue;
                
                this.laserSheet.material.emissiveColor = sheetColor;
                if (this.laserAperture) this.laserAperture.material.emissiveColor = sheetColor;
                if (this.laserLight) {
                    this.laserLight.diffuse = sheetColor;
                    this.laserLight.intensity = 2.0 * pulse;
                }
            }
            
            this.laserSheet.isVisible = true;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = true;
        } else if (this.laserSheet) {
            this.laserSheet.isVisible = false;
            if (this.laserSheetSource) this.laserSheetSource.isVisible = false;
            if (this.laserLight) this.laserLight.intensity = 0;
        }

        // Update dancing NPC avatars
        if (this.npcAvatars && this.npcAvatars.length > 0) {
            this.updateDancingNPCs(time);
        }
        
        // === MIRROR BALL EFFECT ===
        if (this.mirrorBallActive) {
            // Mirror ball is now INDEPENDENT - doesn't disable other lights
            // All lights (spotlights, lasers, LED wall, strobes) can run simultaneously
            // VJ has full control to enable any combination
            
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
                // PERFORMANCE: Cache scaled colors for mirror ball housings (avoid creating Color3 objects every frame)
                if (!this.mirrorBallCachedColors || this.mirrorBallCachedColorSource !== this.mirrorBallSpotlightColor) {
                    this.mirrorBallCachedColors = {
                        housingGlow: this.mirrorBallSpotlightColor.scale(0.2),
                        lensBright: this.mirrorBallSpotlightColor.scale(5.0),
                        sourceVeryBright: this.mirrorBallSpotlightColor.scale(8.0),
                        flareMedium: this.mirrorBallSpotlightColor.scale(3.0)
                    };
                    this.mirrorBallCachedColorSource = this.mirrorBallSpotlightColor;
                }
                
                this.mirrorBallHousings.forEach(housing => {
                    // Make all fixture components glow with current color (professional moving head)
                    housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                    housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
                    housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
                    housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
                });
            };
            
            // Rotate mirror ball faster so you can see it spinning (classic disco ball rotation)
            // Apply speed multiplier for VJ control
            if (this.mirrorBall) {
                const speedMultiplier = this.mirrorBallSpeed || 1.0;
                this.mirrorBallRotation -= 0.003 * speedMultiplier; // Negative rotation - spots now move in same visual direction
                this.mirrorBall.rotation.y = this.mirrorBallRotation;
                
                // AUTOMATIC COLOR CYCLING for Mirror Ball (if not manually set)
                // Cycle colors every 3 seconds for dynamic club atmosphere
                if (!this.vjManualMode && this.frameCounter % 180 === 0) { // Every ~3 seconds at 60fps
                    this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
                    this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
                    
                    // Update spotlight diffuse colors (the actual lights pointing at the ball)
                    if (this.mirrorBallSpotlights) {
                        this.mirrorBallSpotlights.forEach(light => {
                            if (light) light.diffuse = this.mirrorBallSpotlightColor.clone();
                        });
                    }
                    
                    // Update beam colors (visual beams from fixtures to ball)
                    if (this.mirrorBallBeams) {
                        this.mirrorBallBeams.forEach(beam => {
                            beam.material.emissiveColor = this.mirrorBallSpotlightColor.clone();
                        });
                    }
                    
                    // Update housing colors immediately
                    if (this.mirrorBallHousings) {
                        // Update cached colors
                        this.mirrorBallCachedColors = {
                            housingGlow: this.mirrorBallSpotlightColor.scale(0.2),
                            lensBright: this.mirrorBallSpotlightColor.scale(5.0),
                            sourceVeryBright: this.mirrorBallSpotlightColor.scale(8.0),
                            flareMedium: this.mirrorBallSpotlightColor.scale(3.0)
                        };
                        
                        this.mirrorBallHousings.forEach(housing => {
                            housing.material.emissiveColor = this.mirrorBallCachedColors.housingGlow;
                            housing.lensMaterial.emissiveColor = this.mirrorBallCachedColors.lensBright;
                            housing.sourceMaterial.emissiveColor = this.mirrorBallCachedColors.sourceVeryBright;
                            housing.flareMaterial.emissiveColor = this.mirrorBallCachedColors.flareMedium;
                        });
                    }
                }
            }
            
            // Animate reflection spots around the room (150 spots covering all surfaces)
            // SYNCHRONIZED FRAME-SKIP OPTIMIZATION: Update ALL spots every 3 frames
            // This eliminates "catch-up" effect while maintaining 60fps performance
            if (this.mirrorReflectionSpots && this.mirrorReflectionSpots.length > 0) {
                const ballPos = this.mirrorBall.position; // Ball at (0, 6.5, -12)
                
                // FRAME-SKIP STRATEGY: Update all 150 spots simultaneously every 3rd frame
                // This maintains synchronized movement (no lag between spots) while reducing ray casts
                // 150 spots ÷ 3 frames = 50 ray casts/frame average (better than 60, all spots sync)
                this.spotUpdateFrameCounter = (this.spotUpdateFrameCounter || 0) + 1;
                const shouldUpdate = (this.spotUpdateFrameCounter % 3 === 0);
                
                if (shouldUpdate) {
                    // Update ALL spots synchronously
                    for (let i = 0; i < this.mirrorReflectionSpots.length; i++) {
                    const spot = this.mirrorReflectionSpots[i];
                    // Enable visual spot (no actual light - just emissive mesh)
                    spot.visual.setEnabled(true);
                    
                    // REALISTIC RAY CASTING: Calculate direction from mirror ball based on rotation
                    // Each spot represents a mirror facet at a specific angle (theta, phi)
                    // As ball rotates, the facet direction rotates with it in a realistic manner
                    // The ball rotates on Y-axis, so horizontal angle (theta) changes, vertical (phi) stays fixed
                    const rotatedTheta = spot.theta - this.mirrorBallRotation; // Use actual rotation value for precise tracking
                    
                    // OPTIMIZED: Cache cos/sin calculations for reuse
                    const cosTheta = Math.cos(rotatedTheta);
                    const sinTheta = Math.sin(rotatedTheta);
                    
                    // Calculate ray direction from ball in spherical coordinates (standard physics)
                    const sinPhi = Math.sin(spot.phi);
                    const dirX = sinPhi * cosTheta;
                    const dirY = Math.cos(spot.phi);
                    const dirZ = sinPhi * sinTheta;
                    
                    // Ray cast from ball position to find which surface it hits
                    // ULTRA-OPTIMIZED: Reuse cached Ray object instead of creating new ones (massive allocation savings)
                    this.mirrorBallRay.origin.copyFrom(ballPos);
                    this.mirrorBallRay.direction.set(dirX, dirY, dirZ);
                    this.mirrorBallRay.length = 30; // Max 30m range
                    
                    // Pick meshes using cached predicate and cached ray (MAXIMUM PERFORMANCE)
                    const pickResult = this.scene.pickWithRay(this.mirrorBallRay, this.mirrorBallRayPredicate);
                    
                    let hitPos = null;
                    let hitNormal = null;
                    let hitDistance = Infinity;
                    let hitMesh = null;
                    
                    if (pickResult.hit && pickResult.pickedPoint) {
                        hitPos = pickResult.pickedPoint;
                        hitNormal = pickResult.getNormal(true); // Get normalized surface normal
                        hitDistance = pickResult.distance;
                        hitMesh = pickResult.pickedMesh;
                        
                        // Offset slightly from surface to prevent z-fighting
                        if (hitNormal) {
                            hitPos = hitPos.add(hitNormal.scale(0.02));
                        } else {
                            // Fallback if normal calculation fails - use reverse ray direction
                            hitNormal = this.mirrorBallRay.direction.scale(-1);
                        }
                    }
                    
                    // Position spot at ray intersection point with REALISTIC SMOOTH INTERPOLATION
                    if (hitPos) {
                        // IMPROVED: Calculate realistic movement based on ball rotation speed
                        const distanceMoved = BABYLON.Vector3.Distance(spot.visual.position, hitPos);
                        const isSameMesh = (spot.previousHitMesh === hitMesh);
                        
                        // REALISTIC interpolation: mirror ball reflections move based on physics
                        // Real disco balls create smooth, continuous movement patterns
                        let lerpFactor;
                        
                        if (!isSameMesh && distanceMoved > 5.0) {
                            // Surface transition (e.g., wall to floor) - instant snap for realism
                            // Real disco ball reflections jump between surfaces, not slide
                            lerpFactor = 1.0;
                        } else if (distanceMoved > 1.5) {
                            // Significant movement - moderate tracking speed
                            // Prevents unrealistic sliding while maintaining smooth motion
                            lerpFactor = 0.7;
                        } else if (distanceMoved < 0.1) {
                            // Micro-movements - very smooth to eliminate jitter
                            // Stabilizes spots that are nearly stationary
                            lerpFactor = 0.9;
                        } else {
                            // Normal movement - balanced tracking
                            // Natural speed that matches ball rotation
                            lerpFactor = 0.75;
                        }
                        
                        // Smoothly interpolate position (prevents jarring jumps)
                        spot.visual.position.x += (hitPos.x - spot.visual.position.x) * lerpFactor;
                        spot.visual.position.y += (hitPos.y - spot.visual.position.y) * lerpFactor;
                        spot.visual.position.z += (hitPos.z - spot.visual.position.z) * lerpFactor;
                        
                        // Orient perpendicular to surface
                        spot.visual.lookAt(spot.visual.position.add(hitNormal));
                        
                        // Update tracking for next frame
                        spot.previousPosition.copyFrom(spot.visual.position);
                        spot.previousHitMesh = hitMesh;
                        
                        // Distance fade and twinkling - REDUCED BRIGHTNESS
                        const distanceFade = Math.max(0.3, 1 - (hitDistance / 30)); // Dimmer with distance
                        const twinkle = 0.7 + 0.3 * Math.sin(time * spot.twinkleSpeed + spot.twinklePhase); // Gentle twinkling
                        const brightness = spot.baseIntensity * distanceFade * twinkle * 0.6; // 40% dimmer overall
                        
                        // DIMMER emissive color
                        spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(Math.max(0.4, brightness));
                        spot.material.alpha = 0.85; // Slightly transparent for softer look

                        // UPDATE VOLUMETRIC BEAM - Position at ball, point at spot
                        if (spot.beam) {
                            spot.beam.setEnabled(true);
                            // CRITICAL: Set beam position at the mirror ball
                            spot.beam.position.copyFrom(ballPos);
                            // Point beam at spot position
                            spot.beam.lookAt(spot.visual.position);
                            // Scale length to reach spot
                            const beamDist = BABYLON.Vector3.Distance(ballPos, spot.visual.position);
                            spot.beam.scaling.y = beamDist; // Cylinder height is Y axis
                            
                            // Fade beam with distance
                            spot.beamMaterial.alpha = 0.08 * distanceFade;
                            spot.beamMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(0.6);
                        }
                        
                        // Mark as visible for this frame
                        spot.isVisible = true;

                    } else {
                        // Ray didn't hit any surface - HIDE IMMEDIATELY
                        // Spots shouldn't float in mid-air
                        spot.visual.setEnabled(false);
                        if (spot.beam) spot.beam.setEnabled(false);
                        spot.isVisible = false;
                        spot.previousHitMesh = null;
                    }
                }
                } // Close if (shouldUpdate)
                
                // Update visibility based on tracking state
                this.mirrorReflectionSpots.forEach(spot => {
                    // Only enable if it was marked visible during the last update
                    // AND if the mirror ball is active
                    if (spot.isVisible) {
                        spot.visual.setEnabled(true);
                        if (spot.beam && spot.material.alpha > 0.01) {
                            spot.beam.setEnabled(true);
                        }
                    } else {
                        spot.visual.setEnabled(false);
                        if (spot.beam) spot.beam.setEnabled(false);
                    }
                });
            } // Close if (this.mirrorReflectionSpots...)
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
                // PERFORMANCE: Use cached black color instead of creating new Color3 objects
                this.mirrorBallHousings.forEach(housing => {
                    housing.material.emissiveColor = this.cachedColors.black;
                    housing.lensMaterial.emissiveColor = this.cachedColors.black;
                });
            }
            if (this.mirrorReflectionSpots) {
                this.mirrorReflectionSpots.forEach(spot => {
                    spot.visual.setEnabled(false);
                    if (spot.beam) spot.beam.setEnabled(false);
                });
            }
        }
        
        // PROFESSIONAL VJ AUTOMATIC PATTERN SYSTEM
        // Inspired by real club lighting: builds, peaks, breakdowns, and drops
        // Only runs when NOT in VJ manual mode
        if (!this.vjManualMode) {
            const currentPhaseDuration = this.phaseDurations[this.lightingPhase];
            
            // Smoothly interpolate energy level toward target
            const energySpeed = 0.002; // Smooth transitions
            this.energyLevel += (this.targetEnergy - this.energyLevel) * energySpeed;
            
            if (time - this.lightModeSwitchTime > currentPhaseDuration) {
                // PROFESSIONAL PHASE PROGRESSION (like real DJ sets)
                // ACTIVELY CONTROLS LIGHT STATES when in auto mode
                switch(this.lightingPhase) {
                    case 'build':
                        // BUILD → PEAK: Transition to high energy with laser sheet
                        this.lightingPhase = 'peak';
                        this.targetEnergy = 1.0;
                        
                        // ACTIVE CONTROL: High Energy - Laser Sheet (NOT ceiling lasers/gobos)
                        this.lightsActive = false; // Gobos OFF (mutual exclusivity with laser sheet)
                        this.lasersActive = false; // Ceiling lasers OFF (mutual exclusivity)
                        this.mirrorBallActive = false;
                        this.strobesActive = true;
                        this.laserSheetActive = true; // Laser Sheet ON
                        this.smokeActive = true; // Smoke ON
                        
                        this.spotlightPattern = 0; // Random/Fast
                        this.spotlightMode = 0; // Strobe + Sweep
                        
                        this.spotlightSpeed = 1.5;
                        this.laserSpeed = 1.5;
                        this.mirrorBallSpeed = 1.5;
                        this.ledWallSpeed = 1.5;
                        this.strobeSpeed = 1.5;
                        this.currentShowMode = 'laserSheet';
                        log.info('🔥 PEAK: High energy - Laser Sheet & Strobes ON');
                        break;
                        
                    case 'peak':
                        // PEAK → BREAKDOWN: Drop to mirror ball (dramatic moment)
                        this.lightingPhase = 'breakdown';
                        this.targetEnergy = 0.3;
                        
                        // ACTIVE CONTROL: Disco Moment
                        this.lightsActive = false; // Spotlights OFF
                        this.lasersActive = false; // Lasers OFF
                        this.mirrorBallActive = true; // Mirror Ball ON
                        this.strobesActive = false; // Strobes OFF
                        this.laserSheetActive = false; // Laser Sheet OFF
                        this.smokeActive = false; // Smoke OFF (Clear air for reflections)
                        
                        this.spotlightSpeed = 0.5;
                        this.laserSpeed = 0.5;
                        this.mirrorBallSpeed = 0.5;
                        this.ledWallSpeed = 0.5;
                        this.strobeSpeed = 0.5;
                        this.currentShowMode = 'mirror';
                        log.info('🪩 BREAKDOWN: Mirror Ball Moment');
                        break;
                        
                    case 'breakdown':
                        // BREAKDOWN → AMBIENT: Slow atmospheric spotlights with ceiling lasers
                        this.lightingPhase = 'ambient';
                        this.targetEnergy = 0.4;
                        
                        // ACTIVE CONTROL: Atmospheric - Ceiling lasers (NOT laser sheet/mirror ball)
                        this.lightsActive = true;
                        this.lasersActive = true; // Ceiling lasers ON (slow atmospheric)
                        this.mirrorBallActive = false; // Mirror ball OFF (mutual exclusivity)
                        this.strobesActive = false;
                        this.laserSheetActive = false; // Laser Sheet OFF (mutual exclusivity)
                        this.smokeActive = true; // Smoke ON (Atmosphere)
                        
                        this.spotlightPattern = 0; // Automated
                        this.spotlightMode = 1; // Sweep Only (No Strobe)
                        
                        this.spotlightSpeed = 0.5; // Slow movement
                        this.laserSpeed = 0.3; // Very slow lasers
                        this.mirrorBallSpeed = 0.7;
                        this.ledWallSpeed = 0.6;
                        this.strobeSpeed = 0.5;
                        this.currentShowMode = 'spotlights';
                        log.info('🌙 AMBIENT: Atmospheric Spotlights & Slow Lasers');
                        break;
                        
                    case 'ambient':
                        // AMBIENT → DROP: Big drop with laser sheet!
                        this.lightingPhase = 'drop';
                        this.targetEnergy = 1.0;
                        
                        // ACTIVE CONTROL: Maximum Chaos - Laser Sheet (NOT ceiling lasers/gobos)
                        this.lightsActive = false; // Gobos OFF (mutual exclusivity with laser sheet)
                        this.lasersActive = false; // Ceiling lasers OFF (mutual exclusivity)
                        this.mirrorBallActive = false;
                        this.strobesActive = true;
                        this.laserSheetActive = true; // Laser Sheet ON
                        this.smokeActive = true; // Smoke ON
                        
                        this.spotlightPattern = 0;
                        this.spotlightMode = 0; // Strobe + Sweep
                        
                        this.spotlightSpeed = 2.0; // Fast movement for drop
                        this.laserSpeed = 2.0;
                        this.mirrorBallSpeed = 2.0;
                        this.ledWallSpeed = 2.0;
                        this.strobeSpeed = 1.8; // Faster strobe
                        this.currentShowMode = 'laserSheet';
                        log.info('💥 DROP: Maximum Energy - Laser Sheet & Strobes ON');
                        break;
                        
                    case 'drop':
                        // DROP → BUILD: Return to building energy
                        this.lightingPhase = 'build';
                        this.targetEnergy = 0.7;
                        
                        // ACTIVE CONTROL: Building Up
                        this.lightsActive = true;
                        this.lasersActive = false; // Lasers OFF for contrast
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.laserSheetActive = false; // Laser Sheet OFF
                        this.smokeActive = true; // Smoke ON
                        
                        this.spotlightPattern = 2; // Mirror Sweep (Structured)
                        this.spotlightMode = 1; // Sweep Only
                        
                        this.spotlightSpeed = 1.0; // Normal speed
                        this.laserSpeed = 1.0;
                        this.mirrorBallSpeed = 1.0;
                        this.ledWallSpeed = 1.0;
                        this.strobeSpeed = 1.0;
                        this.currentShowMode = 'spotlights';
                        log.info('⬆️ BUILD: Building energy speeds (VJ controls which lights are active)');
                        break;
                }
                
                this.lightModeSwitchTime = time;
                
                // Randomize next phase duration for natural variation
                const phaseName = this.lightingPhase;
                if (phaseName === 'build') {
                    this.phaseDurations.build = 30 + Math.random() * 10;
                } else if (phaseName === 'peak') {
                    this.phaseDurations.peak = 20 + Math.random() * 10;
                } else if (phaseName === 'breakdown') {
                    this.phaseDurations.breakdown = 15 + Math.random() * 5;
                } else if (phaseName === 'ambient') {
                    this.phaseDurations.ambient = 20 + Math.random() * 10;
                } else if (phaseName === 'drop') {
                    this.phaseDurations.drop = 25 + Math.random() * 10;
                }
                
                // Update VJ control button visuals to reflect state
                if (this.vjControlButtons) {
                    this.vjControlButtons.forEach(btn => {
                        if (btn.control === 'lightsActive' || btn.control === 'lasersActive' || 
                            btn.control === 'mirrorBallActive' || btn.control === 'strobesActive' || 
                            btn.control === 'ledWallActive' || btn.control === 'laserSheetActive' ||
                            btn.control === 'smokeActive') {
                            btn.material.emissiveColor = this[btn.control] ? btn.onColor : btn.offColor;
                        }
                    });
                }
            }
            
            // ENERGY-BASED DYNAMIC ADJUSTMENTS (within each phase)
            // Spotlights intensity varies with energy
            if (this.spotlights && this.lightsActive) {
                this.spotlights.forEach(spot => {
                    if (spot.light) {
                        spot.light.intensity = 12 * (0.6 + this.energyLevel * 0.4); // 7.2 to 12
                    }
                });
            }
            
            // Laser rotation speed varies with energy
            if (this.lasers && this.lasersActive) {
                this.lasers.forEach(laser => {
                    laser.rotationSpeed = 0.01 + (this.energyLevel * 0.02); // 0.01 to 0.03
                });
            }
            
        } else {
            // In manual mode: update lightModeSwitchTime to prevent immediate cycling when mode expires
            this.lightModeSwitchTime = time;
        }
        
        // Update LED wall animations using the modular system
        if (this.systems.ledWall && this.ledWallActive) {
            this.systems.ledWall.update(time, audioData);
        }
        
        // === DANCE FLOOR EDGE LED ANIMATION ===
        if (this.danceFloorLEDs && this.danceFloorLEDs.length > 0) {
            // Animated color cycling synchronized with music if available
            const bassLevel = audioData ? audioData.bass / 255 : 0.5;
            const midLevel = audioData ? audioData.mid / 255 : 0.5;
            
            this.danceFloorLEDs.forEach((led, i) => {
                // Color cycling with phase offset per strip
                const phase = time * 0.8 + i * Math.PI / 2;
                const r = Math.sin(phase) * 0.5 + 0.5;
                const g = Math.sin(phase + Math.PI * 2 / 3) * 0.5 + 0.5;
                const b = Math.sin(phase + Math.PI * 4 / 3) * 0.5 + 0.5;
                
                // Intensity pulses with bass
                const intensity = 0.5 + bassLevel * 0.5;
                led.material.emissiveColor.set(r * intensity, g * intensity, b * intensity);
            });
        }
        
        // ALWAYS SYNCHRONIZED MODE - no random mode
        // Spotlights always move together in coordinated patterns
        this.lightingMode = 'synchronized';
        
        // LASER COLOR SWITCHING: Only change automatically in AUTOMATED mode
        // In MANUAL mode: colors only change via VJ control button
        if (!this.vjManualMode && time - this.colorSwitchTime > (8 + Math.random() * 4)) {
            this.currentColorIndex = (this.currentColorIndex + 1) % 3; // RGB cycle
            this.colorSwitchTime = time;
            
            // Broadcast automatic laser color change to other players
            if (this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendVJControl('laserColorIndex', this.currentColorIndex);
            }
        }
        
        // Update lasers with raycasting and dynamic positioning
        if (this.lasers && this.lasersActive) {
            this.lasers.forEach((laser, i) => {
                // Update origin position for ALL lasers (parented and non-parented)
                if (laser.parentTruss) {
                    // Parented lasers: get world position from housing
                    laser.originPos = laser.housing.getAbsolutePosition().clone();
                } else {
                    // Non-parented lasers: ensure originPos is set (should be from initial setup)
                    if (!laser.originPos) {
                        // Fallback if originPos wasn't set during creation
                        laser.originPos = laser.housing.getAbsolutePosition().clone();
                    }
                }
                
                // Movement depends on mode (apply laser speed multiplier)
                const speedMultiplier = this.laserSpeed || 1.0;
                if (this.lightingMode === 'synchronized') {
                    laser.rotation += 0.015 * speedMultiplier;
                    laser.tiltPhase += 0.02 * speedMultiplier;
                } else {
                    laser.rotation += laser.rotationSpeed * speedMultiplier;
                    laser.tiltPhase += (0.015 + Math.sin(time + i) * 0.01) * speedMultiplier;
                }
                // Mark laser as spinning
                laser.isSpinning = true;
                
                // === LASER HOUSING STAYS STATIC ===
                // The housing/emitter fixture stays fixed - only the beam meshes animate
                // This prevents the visible "spinning box" effect
                // Real laser projectors have stationary housings with internal galvo mirrors
                
                // Clamp is static - housing stays fixed, beams animate independently
                
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
                    
                    // PERFORMANCE: Raycast only every 2nd frame per laser (staggered)
                    // This reduces ray casts by 50% while maintaining smooth visuals
                    const shouldRaycast = ((this.frameCounter + i) % 2 === 0);
                    
                    let hit = beam.lastHit; // Reuse last hit result
                    if (shouldRaycast || !hit) {
                        // Reuse ray object instead of creating new one
                        if (!this.laserRay) {
                            this.laserRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), 30);
                            this.laserRayPredicate = (mesh) => {
                                return mesh.isPickable && !mesh.name.includes('laser') && !mesh.name.includes('Housing') && !mesh.name.includes('Clamp');
                            };
                        }
                        this.laserRay.origin.copyFrom(laser.originPos);
                        this.laserRay.direction.copyFrom(direction);
                        hit = this.scene.pickWithRay(this.laserRay, this.laserRayPredicate);
                        beam.lastHit = hit; // Cache for next frame
                    }
                    
                    let beamLength = 15;
                    if (hit && hit.hit && hit.pickedPoint) {
                        beamLength = BABYLON.Vector3.Distance(laser.originPos, hit.pickedPoint);
                    }
                    
                    // Update beam geometry
                    beam.mesh.scaling.y = beamLength;
                    beam.mesh.position = laser.originPos.add(direction.scale(beamLength * 0.5));
                    
                    // Orient beam - PERFORMANCE: Reuse cached vectors
                    this.vecPool.up.set(0, 1, 0);
                    const rotAxis = BABYLON.Vector3.Cross(this.vecPool.up, direction);
                    const angle = Math.acos(BABYLON.Vector3.Dot(this.vecPool.up, direction.normalize()));
                    
                    if (rotAxis.length() > 0.001) {
                        beam.mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(rotAxis.normalize(), angle);
                    } else {
                        beam.mesh.rotationQuaternion = BABYLON.Vector3.Dot(up, direction) > 0 ?
                            BABYLON.Quaternion.Identity() :
                            BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), Math.PI);
                    }
                    
                    // UPDATE GLOW BEAMS - Same position/rotation/scale as core
                    if (beam.innerGlow) {
                        beam.innerGlow.scaling.y = beamLength;
                        beam.innerGlow.position.copyFrom(beam.mesh.position);
                        beam.innerGlow.rotationQuaternion = beam.mesh.rotationQuaternion.clone();
                    }
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
                        
                        // Pulse effect on hit spot - rapid flicker like real laser
                        const pulse = 0.85 + Math.sin(time * 12 + beamIdx * 2) * 0.15;
                        beam.hitSpot.scaling.x = pulse;
                        beam.hitSpot.scaling.y = pulse;
                        
                        // Update hit glow too
                        if (beam.hitGlow) {
                            beam.hitGlow.position.copyFrom(hit.pickedPoint);
                            beam.hitGlow.position.y = 0.015;
                            beam.hitGlow.visibility = 1.0;
                            // Softer pulse for glow
                            const glowPulse = 0.9 + Math.sin(time * 6 + beamIdx) * 0.1;
                            beam.hitGlow.scaling.x = glowPulse * 1.2;
                            beam.hitGlow.scaling.y = glowPulse * 1.2;
                        }
                    } else if (beam.hitSpot) {
                        beam.hitSpot.visibility = 0; // Hide if no hit
                        if (beam.hitGlow) beam.hitGlow.visibility = 0;
                    }
                    
                    // Color all beam elements with current color - HYPERREALISTIC color grading
                    let currentColor, innerGlowColor, outerGlowColor, hitGlowColor;
                    if (this.currentColorIndex === 0) {
                        currentColor = this.cachedColors.red;
                        innerGlowColor = new BABYLON.Color3(1, 0.4, 0.4);  // Slightly desaturated
                        outerGlowColor = new BABYLON.Color3(1, 0.25, 0.25); // Even softer
                        hitGlowColor = new BABYLON.Color3(1, 0.5, 0.5);
                    } else if (this.currentColorIndex === 1) {
                        currentColor = this.cachedColors.green;
                        innerGlowColor = new BABYLON.Color3(0.4, 1, 0.4);
                        outerGlowColor = new BABYLON.Color3(0.25, 1, 0.25);
                        hitGlowColor = new BABYLON.Color3(0.5, 1, 0.5);
                    } else {
                        currentColor = this.cachedColors.blue;
                        innerGlowColor = new BABYLON.Color3(0.4, 0.4, 1);
                        outerGlowColor = new BABYLON.Color3(0.25, 0.25, 1);
                        hitGlowColor = new BABYLON.Color3(0.5, 0.5, 1);
                    }
                    
                    // Apply color to core beam - pure saturated color
                    beam.material.emissiveColor = currentColor;
                    beam.mesh.visibility = 1.0;
                    
                    // Apply inner glow color (tight halo)
                    if (beam.innerGlowMat) {
                        beam.innerGlowMat.emissiveColor = innerGlowColor;
                    }
                    if (beam.innerGlow) {
                        beam.innerGlow.visibility = 1.0;
                    }
                    
                    // Apply outer glow color (atmospheric scatter)
                    if (beam.glowMat) {
                        beam.glowMat.emissiveColor = outerGlowColor;
                    }
                    if (beam.beamGlow) {
                        beam.beamGlow.visibility = 1.0;
                    }
                    
                    // Apply color to hit spots
                    if (beam.hitSpotMat) {
                        beam.hitSpotMat.emissiveColor = currentColor;
                    }
                    if (beam.hitGlowMat) {
                        beam.hitGlowMat.emissiveColor = hitGlowColor;
                    }
                });
                
                // Update lights and emitter color - Now updates every frame for sync with beams
                // Get current color based on color index
                let currentLaserColor, currentEmissiveColor, currentBrightColor;
                if (this.currentColorIndex === 0) {
                    currentLaserColor = this.cachedColors.red;
                    currentEmissiveColor = new BABYLON.Color3(0.2, 0, 0);
                    currentBrightColor = this.cachedColors.red.scale(3.0);
                } else if (this.currentColorIndex === 1) {
                    currentLaserColor = this.cachedColors.green;
                    currentEmissiveColor = new BABYLON.Color3(0, 0.2, 0);
                    currentBrightColor = this.cachedColors.green.scale(3.0);
                } else {
                    currentLaserColor = this.cachedColors.blue;
                    currentEmissiveColor = new BABYLON.Color3(0, 0, 0.2);
                    currentBrightColor = this.cachedColors.blue.scale(3.0);
                }
                
                // Update light diffuse color
                laser.lights.forEach((light) => {
                    light.diffuse = currentLaserColor;
                    light.intensity = this.lasersActive ? 5 : 0;
                });
                
                // Update housing glow with current color
                if (laser.housingMat) {
                    laser.housingMat.emissiveColor = this.lasersActive ? currentEmissiveColor : this.cachedColors.black;
                }
                
                // Update emitter to match beam color - this is the visible light source
                if (laser.emitterMat) {
                    laser.emitterMat.emissiveColor = this.lasersActive ? currentBrightColor : this.cachedColors.black;
                }
            });
        } else if (this.lasers) {
            // Turn off lasers when not active (e.g., when laser sheet is on)
            this.lasers.forEach(laser => {
                laser.lights.forEach(light => {
                    light.intensity = 0;
                });
                laser.beams.forEach(beam => {
                    beam.mesh.visibility = 0;
                    beam.material.alpha = 0;
                    if (beam.innerGlow) beam.innerGlow.visibility = 0;
                    if (beam.beamGlow) beam.beamGlow.visibility = 0;
                    if (beam.hitSpot) beam.hitSpot.visibility = 0;
                    if (beam.hitGlow) beam.hitGlow.visibility = 0;
                });
                // Also turn off emitter when lasers are off
                if (laser.emitterMat) {
                    laser.emitterMat.emissiveColor = this.cachedColors.black;
                }
                if (laser.housingMat) {
                    laser.housingMat.emissiveColor = this.cachedColors.black;
                }
            });
        }
        
        // Make laser beams visible only when spinning AND lasers are active
        if (this.lasers) {
            this.lasers.forEach(laser => {
                laser.beams.forEach(beam => {
                    // Only show beams if laser is actively spinning AND lasersActive is true
                    if (laser.isSpinning && this.lasersActive) {
                        beam.mesh.visibility = 1;
                        beam.material.alpha = 0.6;
                        if (beam.innerGlow) beam.innerGlow.visibility = 1;
                        if (beam.beamGlow) beam.beamGlow.visibility = 1;
                    } else {
                        // Turn off ALL beam components when not spinning or lasers disabled
                        beam.mesh.visibility = 0;
                        beam.material.alpha = 0;
                        if (beam.innerGlow) beam.innerGlow.visibility = 0;
                        if (beam.beamGlow) beam.beamGlow.visibility = 0;
                        if (beam.hitSpot) beam.hitSpot.visibility = 0;
                        if (beam.hitGlow) beam.hitGlow.visibility = 0;
                    }
                });
                // Reset spinning flag for next frame
                laser.isSpinning = false;
            });
        }
        
        // Update spotlights with synchronized movement patterns (AUDIO REACTIVE)
        // ONLY auto-change color when NOT in VJ manual mode
        // Manual mode allows VJ to lock in their chosen color
        if (!this.vjManualMode && time - this.lastColorChange > 10) {
            this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
            this.currentSpotColor = this.spotColorList[this.spotColorIndex];
            this.lastColorChange = time;
            
            // Broadcast automatic color change to other players
            if (this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendVJControl('spotColorIndex', this.spotColorIndex);
            }
            
            // Update ALL lights to new color
            if (this.spotlights) {
                this.spotlights.forEach((spot, i) => {
                    // Update color reference - fixture materials updated in animation loop
                    spot.color = this.currentSpotColor;
                });
            }
        }
        
        // Check if VJ manual mode should expire (60 seconds of no interaction)
        if (this.vjManualMode && (time - this.lastVJInteraction) > this.VJ_TIMEOUT) {
            this.vjManualMode = false;
            this.spotlightPattern = 0; // Switch to automated pattern
            log.info("🤖 Automated patterns resumed - no VJ interaction for 60 seconds");
        }
        
        // === MODULAR SPOTLIGHT SYSTEM UPDATE ===
        // When useModularSystems is enabled, delegate to SpotlightSystem module
        if (this.useModularSystems && this.systems.spotlight) {
            // Sync state from VJ controls to modular system
            this.systems.spotlight.lightsActive = this.lightsActive;
            this.systems.spotlight.spotlightSpeed = this.spotlightSpeed || 1.0;
            this.systems.spotlight.spotlightMode = this.spotlightMode;
            this.systems.spotlight.spotlightPattern = this.spotlightPattern;
            this.systems.spotlight.spotStrobeActive = this.spotStrobeActive;
            
            // Sync color changes
            if (this.currentSpotColor) {
                this.systems.spotlight.currentSpotColor = this.currentSpotColor;
            }
            
            // Update modular system
            this.systems.spotlight.update(time, audioData);
            
            // Sync spotlights reference back for compatibility
            this.spotlights = this.systems.spotlight.spotlights;
        } else {
            // === LEGACY INLINE SPOTLIGHT ANIMATION ===
            // Calculate global phase for spotlight patterns (used in multiple places)
            // Phase ALWAYS advances when lights are active (for sweep animations)
            // VJ manual mode only affects Pattern 0's auto-cycling between sub-patterns
            if (this.lightsActive) {
                this.lastActivePhase = time * 0.8; // Always update when lights on
            }
            const globalPhase = this.lastActivePhase || 0;
        
        // Audio speed multiplier: only apply when actual audio is playing
        // When no audio: use default 1.0x speed for consistent automated patterns
        const audioSpeedMultiplier = audioData.hasAudio 
            ? 1.0 + (audioData.average * 0.5) // 1.0x to 1.5x based on audio energy
            : 1.0; // No audio = consistent timing
        
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
                    // PATTERN 2: MIRROR SWEEP - Left and right sides sweep toward/away from each other
                    const sweepPhase = globalPhase * speedMultiplier;
                    const sweepValue = Math.sin(sweepPhase * 0.8) * 0.6; // -0.6 to +0.6
                    
                    // Mirror the sweep based on which side the spotlight is on
                    // Left side (i=0,1,2): sweep normally (left to right)
                    // Right side (i=3,4,5): sweep inverted (right to left)
                    // This creates converging/diverging effect
                    const isLeftSide = (i < 3); // First 3 are left side
                    dirX = isLeftSide ? sweepValue : -sweepValue; // Mirror for right side
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
                        // Calculate CURRENT pattern position - SLOWER for IMMERSIVE feel
                        if (currentPattern === 0) {
                        // Linear sweep left to right - SMOOTH
                        dirX1 = Math.sin(sweepPhase * 0.6) * 0.6; // Slower (1.6 → 0.6)
                        dirZ1 = -0.3;
                } else if (currentPattern === 1) {
                    // Circular sweep - ELEGANT
                    dirX1 = Math.sin(sweepPhase * 0.5) * 0.5; // Slower (1.2 → 0.5)
                    dirZ1 = Math.cos(sweepPhase * 0.5) * 0.5;
                } else if (currentPattern === 2) {
                    // Fan sweep - GENTLE
                    const fanPhase = Math.sin(sweepPhase * 0.4); // Slower (1.0 → 0.4)
                    dirX1 = fanPhase * 0.6;
                    dirZ1 = -0.2;
                } else if (currentPattern === 3) {
                    // Cross sweep - FLOWING
                    dirX1 = Math.sin(sweepPhase * 0.6) * 0.5; // Slower (1.4 → 0.6)
                    dirZ1 = Math.cos(sweepPhase * 0.6) * 0.5;
                } else if (currentPattern === 4) {
                    // Figure-8 sweep - HYPNOTIC
                    dirX1 = Math.sin(sweepPhase * 0.4) * 0.6; // Slower (1.0 → 0.4)
                    dirZ1 = Math.sin(sweepPhase * 0.8) * 0.4; // Slower (2.0 → 0.8)
                } else if (currentPattern === 5) {
                    // Pulse sweep - BREATHING
                    const pulsePhase = Math.sin(sweepPhase * 0.3); // Slower (0.8 → 0.3)
                    const angle = sweepPhase * 0.2; // Slower (0.6 → 0.2)
                    dirX1 = pulsePhase * Math.cos(angle) * 0.6;
                    dirZ1 = pulsePhase * Math.sin(angle) * 0.6;
                } else {
                    // STROBE FLASHING - static center position
                    dirX1 = 0;
                    dirZ1 = 0;
                }
                
                // Calculate NEXT pattern position - SLOWER for IMMERSIVE feel
                if (nextPattern === 0) {
                    dirX2 = Math.sin(sweepPhase * 0.6) * 0.6; // Slower
                    dirZ2 = -0.3;
                } else if (nextPattern === 1) {
                    dirX2 = Math.sin(sweepPhase * 0.5) * 0.5; // Slower
                    dirZ2 = Math.cos(sweepPhase * 0.5) * 0.5;
                } else if (nextPattern === 2) {
                    const fanPhase = Math.sin(sweepPhase * 0.4); // Slower
                    dirX2 = fanPhase * 0.6;
                    dirZ2 = -0.2;
                } else if (nextPattern === 3) {
                    dirX2 = Math.sin(sweepPhase * 0.6) * 0.5; // Slower
                    dirZ2 = Math.cos(sweepPhase * 0.6) * 0.5;
                } else if (nextPattern === 4) {
                    dirX2 = Math.sin(sweepPhase * 0.4) * 0.6; // Slower
                    dirZ2 = Math.sin(sweepPhase * 0.8) * 0.4; // Slower
                } else if (nextPattern === 5) {
                    const pulsePhase = Math.sin(sweepPhase * 0.3); // Slower
                    const angle = sweepPhase * 0.2; // Slower
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
                // PERFORMANCE: Reuse Vector3 from pool instead of creating new one
                this.vecPool.direction.set(dirX, -1.5, dirZ).normalize();
                spot.light.direction.copyFrom(this.vecPool.direction);
                
                // Local reference for moving head animation (avoid repeated property access)
                const direction = this.vecPool.direction;
                
                // Dynamic beam angle (simulates zoom adjustment) - subtle variation
                const baseAngle = Math.PI / 6; // 30 degrees base
                const angleVariation = Math.sin(time * 0.3 + i * 0.5) * 0.1; // ±6 degrees
                spot.light.angle = baseAngle + angleVariation;
                
                // === HYPERREALISTIC MOVING HEAD ANIMATION ===
                // Professional moving heads have pan (Y-axis) and tilt (X/Z-axis) motors
                // We rotate the Yoke (Pan) and Head (Tilt) separately for mechanical realism
                // Using smooth interpolation to simulate realistic servo motor movement
                
                if (spot.yoke && spot.head) {
                    // 1. PAN (Yoke Rotation around Y)
                    // Calculate target angle on XZ plane. atan2(x, z) gives angle from Z axis.
                    const targetPanAngle = Math.atan2(direction.x, direction.z);
                    
                    // SMOOTH INTERPOLATION: Simulate realistic servo motor speed (~60°/s)
                    // This prevents jarring instant movements and adds mechanical realism
                    const panLerpSpeed = 0.15; // Smooth but responsive (professional moving head speed)
                    
                    // Handle angle wrapping for smooth pan rotation
                    let panDiff = targetPanAngle - spot.yoke.rotation.y;
                    if (panDiff > Math.PI) panDiff -= Math.PI * 2;
                    if (panDiff < -Math.PI) panDiff += Math.PI * 2;
                    
                    spot.yoke.rotation.y += panDiff * panLerpSpeed;

                    // 2. TILT (Head Rotation around X)
                    // Calculate target angle from vertical (down).
                    // acos(-direction.y) gives 0 when pointing down (-1), PI/2 when horizontal (0).
                    // We use negative angle because positive rotation moves -Y to -Z (Back),
                    // but we want to move -Y to +Z (Forward) relative to the Yoke.
                    const targetTiltAngle = -Math.acos(-direction.y);
                    
                    // SMOOTH INTERPOLATION for tilt (same realistic servo simulation)
                    const tiltLerpSpeed = 0.12; // Slightly slower tilt for mechanical weight feel
                    spot.head.rotation.x += (targetTiltAngle - spot.head.rotation.x) * tiltLerpSpeed;
                    
                    // Note: Lens/bezel/flare/beam are children of the head and move automatically!
                    
                    // === HYPERREALISTIC FLARE RESPONSE ===
                    // Update flare intensity based on viewing angle AND movement speed
                    // Moving heads create more light scatter/flare when sweeping quickly
                    if (spot.flareMat && this.camera) {
                        const cameraDir = this.camera.position.subtract(spot.basePos).normalize();
                        const lightDir = direction.scale(-1); // Light points opposite of beam direction
                        const dot = BABYLON.Vector3.Dot(cameraDir, lightDir);
                        const viewBrightness = Math.max(0, dot); // 0 to 1 based on viewing angle
                        
                        // Calculate movement speed for dynamic flare (brighter when moving)
                        // Store previous direction for speed calculation
                        if (!spot.prevDirection) spot.prevDirection = direction.clone();
                        const movementSpeed = BABYLON.Vector3.Distance(direction, spot.prevDirection);
                        spot.prevDirection.copyFrom(direction);
                        
                        // Dynamic flare: base visibility + viewing angle + movement boost
                        const movementBoost = Math.min(0.15, movementSpeed * 2); // Cap at 0.15 extra
                        spot.flareMat.alpha = 0.2 + (viewBrightness * 0.3) + movementBoost;
                        
                        // Movement glow boost is now handled in main fixture update loop
                        // Store movement speed for fixture update to use
                        spot.movementSpeed = movementSpeed;
                    }
                } else if (spot.fixture) {
                    // Fallback for legacy fixtures (if any)
                    const targetPoint = spot.basePos.add(direction.scale(8));
                    spot.fixture.lookAt(targetPoint);
                }
                
                // PROFESSIONAL VOLUMETRIC BEAM - Simple and effective
                if (spot.beam) {
                    // Get the actual world position of the light emission point (lens position)
                    // This correctly accounts for head tilt and rotation
                    let emissionPoint;
                    if (spot.lens) {
                        // Use lens mesh's actual world position (correct for any tilt angle)
                        emissionPoint = spot.lens.getAbsolutePosition().clone();
                    } else if (spot.head) {
                        // Fallback: Get head's world position and transform lens offset by rotation
                        const headPos = spot.head.getAbsolutePosition();
                        // Local lens offset
                        const localLensOffset = new BABYLON.Vector3(0, -0.28, 0);
                        // Transform offset by head's world rotation matrix
                        const headWorldMatrix = spot.head.getWorldMatrix();
                        const transformedOffset = BABYLON.Vector3.TransformNormal(localLensOffset, headWorldMatrix);
                        emissionPoint = headPos.add(transformedOffset);
                    } else {
                        emissionPoint = spot.basePos.clone();
                    }
                    
                    // Calculate where beam centerline intersects floor (for pool positioning)
                    let centerDistanceToFloor;
                    let floorIntersection;
                    
                    if (direction.y < -0.01) {
                        // Use emission point (actual light position) instead of static basePos
                        centerDistanceToFloor = emissionPoint.y / Math.abs(direction.y);
                        floorIntersection = emissionPoint.add(direction.scale(centerDistanceToFloor));
                        floorIntersection.y = 0; // Clamp to floor
                    } else {
                        centerDistanceToFloor = 15;
                        floorIntersection = emissionPoint.add(direction.scale(centerDistanceToFloor));
                    }
                    
                    // IMPORTANT: Calculate beam length to ensure FULL CONE reaches floor
                    // The cone widens from 0.25m to 2.0m, so at angles the edge hits floor first
                    // We need to extend the beam so the WIDE END fully reaches floor
                    const coneRadiusAtFloor = 1.0; // Half of diameterTop (2.0)
                    const horizontalDistance = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
                    const angleFromVertical = Math.atan2(horizontalDistance, Math.abs(direction.y));
                    const extraLength = coneRadiusAtFloor * Math.tan(angleFromVertical);
                    const beamLength = centerDistanceToFloor + extraLength;
                    
                    // UPDATE BEAM LENGTH (Position/Rotation handled by parenting to Head)
                    // Scale to actual length
                    spot.beam.scaling.y = beamLength;
                    
                    // ANIMATE SMOKE TEXTURE (Hyperrealism)
                    if (spot.beamMat && spot.beamMat.emissiveTexture) {
                        // Much slower animation for realistic drifting haze (was 0.02)
                        spot.beamMat.emissiveTexture.vOffset -= 0.002 * speedMultiplier; 
                        // Slight horizontal drift for turbulence
                        spot.beamMat.emissiveTexture.uOffset += 0.0005 * Math.sin(time * 0.5 + i);
                    }

                    // ANIMATE GOBO ROTATION (Hyperrealism)
                    if (spot.lightPool) {
                        spot.lightPool.rotation.z += 0.01 * speedMultiplier; // Faster rotation
                    }
                    
                    // Update position to keep start of beam at the lens
                    // Lens is at y=-0.28. Beam is rotated 180, so start is at top (+y relative to beam center).
                    // We need center to be lower so top aligns with lens.
                    spot.beam.position.y = -0.28 - (beamLength * 0.5);
                    
                    // Consistent beam size (no zoom variation)
                    const zoomFactor = 1.0; 
                    spot.beam.scaling.x = zoomFactor;
                    spot.beam.scaling.z = zoomFactor;
                    
                    // UPDATE GLOW BEAM - Same scaling and position
                    // Beam visibility and color - HYPERREALISTIC with subtle variation + FLASHING
                    // Strobe is controlled by both toggle button AND spotlight mode
                    const sweepPhase = globalPhase * audioSpeedMultiplier;
                    
                    // Strobe is active when: button is on AND mode includes strobe (0 or 2)
                    const isStrobeMode = (this.spotlightMode === 0 || this.spotlightMode === 2);
                    const isStrobeEnabled = this.spotStrobeActive && isStrobeMode;
                    
                    let beamVisible = this.lightsActive;
                    if (isStrobeEnabled) {
                        // STROBE: Rapid on/off flashing at 8Hz (8 flashes per second)
                        const flashPhase = sweepPhase * 2.5;
                        const flashOn = Math.floor(flashPhase * 8) % 2 === 0;
                        beamVisible = beamVisible && flashOn;
                    }
                    
                    // Store beamVisible on spot for fixture sync
                    spot.beamVisible = beamVisible;
                    
                    spot.beam.visibility = beamVisible ? 1.0 : 0;
                    
                    // Update beamGlow - SYNC WITH STROBE
                    if (spot.beamGlow) {
                        // Position/Rotation handled by parenting
                        spot.beamGlow.scaling.y = beamLength;
                        spot.beamGlow.scaling.x = zoomFactor;
                        spot.beamGlow.scaling.z = zoomFactor;
                        // Match position with main beam
                        spot.beamGlow.position.y = -0.28 - (beamLength * 0.5);
                        
                        // CRITICAL: Sync glow visibility with strobe/beam visibility
                        spot.beamGlow.visibility = beamVisible ? 1.0 : 0;
                        // Use global color for perfect sync
                        spot.beamGlowMat.emissiveColor = this.currentSpotColor.scale(0.15);
                    }
                    spot.light.intensity = beamVisible ? 12 : 0; // Also control light intensity
                    
                    // Subtle atmospheric variation - simulates particles moving through beam
                    const atmosphericNoise = Math.sin(time * 3 + i * 0.5) * 0.1; // Subtle flicker
                    
                    // Update emissive color with variation (audio disabled)
                    // CRITICAL: Use this.currentSpotColor (global) as single source of truth
                    // This ensures beam, fixture, and all effects use the EXACT same color
                    const spotColor = this.currentSpotColor;
                    const baseIntensity = 2.0 + atmosphericNoise; // Increased base intensity (was 0.3)
                    spot.beamMat.emissiveColor = spotColor.scale(baseIntensity);
                    spot.beamMat.emissiveIntensity = 8.0; // High intensity for light shaft
                    
                    // CRITICAL: Store the actual beam color for fixture sync (BASE color, not scaled)
                    // This ensures fixture uses EXACT same color as beam
                    spot.currentBeamColor = spotColor;
                    
                    // Very subtle alpha variation - creates "depth" in the beam
                    spot.beamMat.alpha = 0.1 + Math.abs(atmosphericNoise) * 0.05; // Low alpha base (0.1)
                    

                    
                    // Update HYPERREALISTIC floor light splash - Single layer gobo effect
                    if (spot.lightPool) {
                        if (this.lightsActive && beamVisible) { // Also check beamVisible for flashing
                            // Calculate beam width at floor (cone: 0.25m → 3.0m)
                            const beamProgress = centerDistanceToFloor / beamLength;
                            const beamWidthAtFloor = 0.25 + 2.75 * beamProgress; // 2.75 = 3.0 - 0.25
                            const baseSize = (beamWidthAtFloor * 0.6) * zoomFactor; // Slightly larger pool
                            
                            // Atmospheric shimmer (audio disabled)
                            const atmosphericShimmer = 1.0 + Math.sin(time * 2 + i) * 0.15; // More shimmer
                            
                            // Use floor intersection point where beam actually hits
                            
                            // CRITICAL: Use global color for perfect sync
                            const spotColor = this.currentSpotColor;
                            
                            // GOBO POOL (Single layer with texture)
                            spot.lightPool.position.x = floorIntersection.x;
                            spot.lightPool.position.y = 0.03;
                            spot.lightPool.position.z = floorIntersection.z;
                            
                            // Scale based on beam width
                            const poolSize = baseSize * 1.2; // Larger pool for better visibility
                            spot.lightPool.scaling.set(poolSize, poolSize, 1);
                            
                            spot.lightPool.visibility = 1.0; // Full visibility
                            if (spot.poolMat) {
                                // HYPERREALISTIC: Bright core with color matching
                                // Reduced scale from 5.0 to 2.0 to prevent whiteout
                                spot.poolMat.emissiveColor = spotColor.scale(2.0 * atmosphericShimmer);
                            }
                            
                            // UPDATE GLOW RING - Soft outer halo for realistic light falloff
                            if (spot.lightPoolGlow) {
                                spot.lightPoolGlow.position.x = floorIntersection.x;
                                spot.lightPoolGlow.position.y = 0.02; // Just below main pool
                                spot.lightPoolGlow.position.z = floorIntersection.z;
                                
                                // Glow is 1.5x larger than main pool
                                const glowSize = poolSize * 1.5;
                                spot.lightPoolGlow.scaling.set(glowSize, glowSize, 1);
                                
                                spot.lightPoolGlow.visibility = 0.8;
                                if (spot.poolGlowMat) {
                                    // Softer outer glow with same color
                                    spot.poolGlowMat.emissiveColor = spotColor.scale(1.0 * atmosphericShimmer);
                                }
                            }
                            
                        } else {
                            // CRITICAL: Hide floor pools immediately when lights turn off or flashing off
                            spot.lightPool.visibility = 0;
                            if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                        }
                    }
                }
                
                // CRITICAL: Hide beams when lights are off (no beams without light source!)
                if (!this.lightsActive) {
                    if (spot.beam) spot.beam.visibility = 0;
                    if (spot.beamGlow) spot.beamGlow.visibility = 0;
                    if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
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
        if (this.spotlights && this.spotlights.length > 0 && this.trussLights && this.trussLights.length > 0) {
            this.spotlights.forEach((spot, i) => {
                // CRITICAL: Use this.currentSpotColor as single source of truth
                // This ensures fixture always matches the beam color exactly
                const spotColor = this.currentSpotColor;
                
                // CRITICAL: Use stored beamVisible from beam update for PERFECT SYNC
                // This ensures fixture flashes exactly when beam flashes
                const fixtureVisible = spot.beamVisible !== undefined ? spot.beamVisible : this.lightsActive;
                
                // Get materials DIRECTLY from trussLights (the actual materials on the meshes)
                const trussLight = this.trussLights[i];
                if (!trussLight) return;
                
                const lensMat = trussLight.lensMat;
                const sourceMat = trussLight.sourceMat;
                
                // Movement glow boost (brighter when head is moving fast)
                const movementBoost = spot.movementSpeed ? Math.min(2.0, spot.movementSpeed * 10) : 0;
                
                // Update lens material (the bright front of the moving head)
                if (lensMat) {
                    if (fixtureVisible) {
                        const pulse = 0.8 + Math.sin(time * 4 + i * 0.5) * 0.2;
                        // DIRECTLY set r, g, b components to ensure exact color match
                        const scaleFactor = 4.0 + pulse + movementBoost;
                        lensMat.emissiveColor.r = spotColor.r * scaleFactor;
                        lensMat.emissiveColor.g = spotColor.g * scaleFactor;
                        lensMat.emissiveColor.b = spotColor.b * scaleFactor;
                    } else {
                        lensMat.emissiveColor.r = 0;
                        lensMat.emissiveColor.g = 0;
                        lensMat.emissiveColor.b = 0;
                    }
                }
                
                // Update light source material (the bright inner sphere)
                if (sourceMat) {
                    if (fixtureVisible) {
                        const pulse = 0.8 + Math.sin(time * 4 + i * 0.5) * 0.2;
                        // DIRECTLY set r, g, b components to ensure exact color match
                        const scaleFactor = 6.0 + pulse * 2 + movementBoost;
                        sourceMat.emissiveColor.r = spotColor.r * scaleFactor;
                        sourceMat.emissiveColor.g = spotColor.g * scaleFactor;
                        sourceMat.emissiveColor.b = spotColor.b * scaleFactor;
                    } else {
                        sourceMat.emissiveColor.r = 0;
                        sourceMat.emissiveColor.g = 0;
                        sourceMat.emissiveColor.b = 0;
                    }
                }
            });
        }
        } // End of legacy inline spotlight animation else block
        
        // LED wall is now updated via this.updateLEDWall(time, audioData) which is called separately
        // with the new 26-pattern system including creative blackout shapes
        // Apply speed multiplier for VJ control
        if (this.ledPanels && this.ledPanels.length > 0) {
            const speedMultiplier = this.spotlightSpeed || 1.0;
            this.ledTime += 0.016 * speedMultiplier;
        }
        
        // Update strobes - respects strobesActive control
        // Strobe lights animation (with speed multiplier)
        const strobeSpeedMultiplier = this.strobeSpeed || 1.0;
        if (this.strobes && this.strobes.length > 0) {
            if (this.strobesActive) {
                this.strobes.forEach((strobe, i) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        strobe.flashDuration -= 0.016 * strobeSpeedMultiplier; // Apply speed to decay
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    const intensityVariation = strobe.currentIntensity || 80; // Store current intensity (increased from 50)
                    const burstPhase = Math.floor(strobe.flashDuration * 40 * strobeSpeedMultiplier) % 2; // Fast bursts with speed
                    const intensity = burstPhase === 0 ? intensityVariation : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity * 1.5); // Brighter emissive (1.5x)
                    strobe.light.intensity = intensity * 200; // MUCH brighter (was 120, now 200)
                    strobe.light.range = 80 + (intensityVariation * 0.8); // Wider range (was 50, now 80)
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        strobe.light.intensity = 0;
                        const flashInterval = (0.1 + Math.random() * 0.9) / strobeSpeedMultiplier; // Adjust interval by speed
                        strobe.nextFlashTime = time + flashInterval; // Frequent flashes (0.1-1.0s divided by speed)
                    }
                } else {
                    // Check if it's time for next flash (ALWAYS fires, no condition)
                    if (time >= strobe.nextFlashTime) {
                        // Vary intensity: MUCH BRIGHTER - 60% bright (60-80), 40% super bright (80-100)
                        strobe.currentIntensity = Math.random() > 0.6 ? 
                            (60 + Math.random() * 20) : // Bright (was 30-40, now 60-80)
                            (80 + Math.random() * 20);  // Super bright (was 50-70, now 80-100)
                        
                        const flashDuration = (0.15 + Math.random() * 0.2) / strobeSpeedMultiplier; // Duration 0.15-0.35s divided by speed
                        strobe.flashDuration = flashDuration;
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

    /**
     * Simplified LED Wall animation - reliable patterns that always show
     */
    updateLEDWallSimple(time) {
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 10;
        
        // Use performance.now() directly to ensure time is always fresh
        const t = performance.now() / 1000;
        
        // Simple animated rainbow wave - always moving
        this.ledPanels.forEach(panel => {
            const col = panel.col;
            const row = panel.row;
            
            // Rainbow wave that definitely moves
            const hue = (col / cols * 0.5 + row / rows * 0.3 + t * 0.3) % 1.0;
            const h = hue * 6;
            const x = 1 - Math.abs(h % 2 - 1);
            let r, g, b;
            if (h < 1) { r = 1; g = x; b = 0; }
            else if (h < 2) { r = x; g = 1; b = 0; }
            else if (h < 3) { r = 0; g = 1; b = x; }
            else if (h < 4) { r = 0; g = x; b = 1; }
            else if (h < 5) { r = x; g = 0; b = 1; }
            else { r = 1; g = 0; b = x; }
            
            panel.material.emissiveColor.r = r;
            panel.material.emissiveColor.g = g;
            panel.material.emissiveColor.b = b;
        });
    }

    updateLEDWall(time, audioData) {
        // Debug: Log first few calls to verify update is running
        if (this.ledUpdateCount === undefined) this.ledUpdateCount = 0;
        this.ledUpdateCount++;
        if (this.ledUpdateCount <= 3) {
            log.info(`🎨 LED Wall update #${this.ledUpdateCount}, pattern=${this.ledPattern}, panels=${this.ledPanels?.length}`);
        }
        
        const patterns = [
            // === IMMERSIVE DANCE CLUB PATTERNS ===
            // Energy Bursts
            this.patternBassExplosion,      // Explosive burst from center on bass
            this.patternEnergyWave,         // Powerful wave sweeping across
            this.patternStrobe,             // Club strobe effect
            this.patternLaserScan,          // Scanning laser lines
            
            // Hypnotic Patterns
            this.patternTunnel,             // Tunnel/vortex effect
            this.patternKaleidoscope,       // Rotating kaleidoscope
            this.patternDNAHelix,           // Double helix spinning
            this.patternInfinityLoop,       // Flowing infinity symbol
            
            // Club Classics
            this.patternVUMeter,            // Audio reactive VU bars
            this.patternEqualizerBars,      // Bouncing EQ columns
            this.patternBeatGrid,           // Pulsing grid on beat
            this.patternPixelRain,          // Digital rain effect
            
            // Geometric Shapes
            this.patternTriangleWave,       // Triangles flowing
            this.patternHexagonPulse,       // Hexagonal ripples
            this.patternDiamondSpin,        // Spinning diamond patterns
            this.patternCubeRotate,         // 3D cube illusion
            
            // Flow Patterns
            this.patternPlasma,             // Organic plasma flow
            this.patternAurora,             // Northern lights effect
            this.patternOceanWave,          // Deep ocean waves
            this.patternFire,               // Rising fire columns
            
            // Party Vibes
            this.patternConfetti,           // Scattered confetti
            this.patternSpotlightSweep,     // Moving spotlights
            this.patternNeonPulse,          // Neon sign pulsing
            this.patternRainbowRave         // Full spectrum rave
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
                    
                    log.info(`🎵 Detected BPM: ${this.bpm}`);
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
                log.info('🎵 No audio - using default 130 BPM');
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
            
            // Broadcast automatic LED pattern change to other players
            if (this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendVJControl('ledPattern', this.ledPattern);
            }
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
            
            // Broadcast automatic LED color change to other players
            if (this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendVJControl('ledColorIndex', this.ledColorIndex);
            }
        }
        
        // Execute current pattern with error handling
        const currentPattern = patterns[this.ledPattern];
        if (currentPattern && typeof currentPattern === 'function') {
            try {
                currentPattern.call(this, colors[this.ledColorIndex], time, audioData);
            } catch (err) {
                log.warn('LED pattern error:', err);
                // Fallback: simple color pulse
                const brightness = 0.5 + Math.sin(time * 3) * 0.5;
                this.ledPanels.forEach(panel => {
                    panel.material.emissiveColor = colors[this.ledColorIndex].scale(brightness);
                });
            }
        } else {
            // Pattern not found - use simple rainbow wave fallback
            log.warn(`LED pattern ${this.ledPattern} not found, using fallback`);
            this.ledPanels.forEach(panel => {
                const wave = Math.sin(time * 2 + panel.col * 0.3);
                const brightness = 0.5 + wave * 0.5;
                panel.material.emissiveColor = colors[this.ledColorIndex].scale(brightness);
            });
        }
    }

    /**
     * Helper method to update LED panel emissive colors
     * Reduces code duplication across pattern methods
     * PERFORMANCE: Uses direct color assignment when possible, avoids scale() for common values
     */
    updateLEDPanel(panel, color, brightness) {
        if (brightness === 0) {
            panel.material.emissiveColor = this.cachedColors.black;
        } else if (brightness >= 0.99) {
            // Avoid scale() call for full brightness
            panel.material.emissiveColor = color;
        } else {
            // For partial brightness, use scale() but cache commonly used values
            panel.material.emissiveColor = color.scale(brightness);
        }
    }

    // === IMMERSIVE DANCE CLUB PATTERNS ===

    patternBassExplosion(color, time, audioData) {
        // Explosive burst from center on bass
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Trigger explosion on bass OR periodically if no audio
        const hasAudio = audioData && audioData.hasAudio;
        const bassTrigger = hasAudio && audioData.bass > 0.2;
        const autoTrigger = !hasAudio && (time - (this.lastExplosionTime || 0) > 2.0); // Every 2 seconds
        
        if ((bassTrigger || autoTrigger) && time - (this.lastExplosionTime || 0) > 0.5) {
            this.lastExplosionTime = time;
        }
        
        const age = time - (this.lastExplosionTime || 0);
        const radius = age * 30; // Expand speed
        
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            let brightness = 0;
            if (Math.abs(dist - radius) < 3 && age < 1.5) {
                brightness = Math.max(0, 1.0 - (age * 0.8)); // Fade out
            }
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternEnergyWave(color, time, audioData) {
        // Powerful wave sweeping across
        const cols = this.ledCols || 28;
        const speed = 5 + (audioData ? audioData.bass * 5 : 0);
        const wavePos = (time * speed) % (cols + 10) - 5;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.abs(panel.col - wavePos);
            const brightness = Math.max(0, 1.0 - dist / 2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternStrobe(color, time, audioData) {
        // Club strobe effect
        const strobeSpeed = 15; // Hz
        const on = Math.sin(time * strobeSpeed * Math.PI * 2) > 0;
        const brightness = on ? 1.0 : 0.0;
        
        this.ledPanels.forEach(panel => {
            panel.material.emissiveColor = this.cachedColors.white.scale(brightness);
        });
    }

    patternLaserScan(color, time, audioData) {
        // Scanning laser lines
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const t = time * 2;
        
        this.ledPanels.forEach(panel => {
            // Horizontal scan
            const hScan = Math.abs(panel.row - (Math.sin(t) * 0.5 + 0.5) * rows) < 0.5;
            // Vertical scan
            const vScan = Math.abs(panel.col - (Math.cos(t * 1.3) * 0.5 + 0.5) * cols) < 0.5;
            
            const brightness = (hScan || vScan) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternTunnel(color, time, audioData) {
        // Tunnel/vortex effect
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        this.ledPanels.forEach(panel => {
            const dist = Math.max(Math.abs(panel.col - centerX), Math.abs(panel.row - centerY) * (cols/rows));
            const wave = Math.sin(dist * 0.5 - time * 4);
            const brightness = wave > 0.5 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternKaleidoscope(color, time, audioData) {
        // Symmetrical mirroring
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2;
        const centerY = rows / 2;
        
        this.ledPanels.forEach(panel => {
            // Fold coordinates
            const x = Math.abs(panel.col - centerX);
            const y = Math.abs(panel.row - centerY);
            
            // Generate pattern based on folded coords
            const val = Math.sin(x * 0.5 + time) * Math.cos(y * 0.5 + time);
            const brightness = val > 0 ? val : 0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternDNAHelix(color, time, audioData) {
        // Double helix
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const x = panel.col / cols * Math.PI * 4 + time * 2;
            const y1 = (Math.sin(x) * 0.5 + 0.5) * (rows - 1);
            const y2 = (Math.sin(x + Math.PI) * 0.5 + 0.5) * (rows - 1);
            
            const dist1 = Math.abs(panel.row - y1);
            const dist2 = Math.abs(panel.row - y2);
            
            const brightness = (dist1 < 1.0 || dist2 < 1.0) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternInfinityLoop(color, time, audioData) {
        // Figure-8 motion
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const t = time * 2;
        
        // Parametric equation for infinity symbol (Lemniscate)
        const scale = Math.min(cols, rows) * 0.4;
        const cx = cols / 2;
        const cy = rows / 2;
        
        // We render the trail
        this.ledPanels.forEach(panel => {
            let minD = 100;
            // Sample points along the curve
            for(let i=0; i<20; i++) {
                const offset = i * 0.1;
                const lt = t - offset;
                const x = (scale * Math.cos(lt)) / (1 + Math.sin(lt)*Math.sin(lt));
                const y = (scale * Math.sin(lt) * Math.cos(lt)) / (1 + Math.sin(lt)*Math.sin(lt));
                
                const d = Math.sqrt(Math.pow(panel.col - (cx + x), 2) + Math.pow(panel.row - (cy + y), 2));
                minD = Math.min(minD, d);
            }
            
            const brightness = Math.max(0, 1.0 - minD);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternVUMeter(color, time, audioData) {
        // Vertical bars rising with volume
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const hasAudio = audioData && audioData.hasAudio;
        
        // Simulate frequency data if not available
        const levels = [];
        for(let i=0; i<cols; i++) {
            // Create a symmetric wave pattern that reacts to audio
            const x = (i - cols/2) / (cols/2);
            const base = Math.exp(-x*x*2); // Bell curve
            
            let audioBoost;
            if (hasAudio) {
                audioBoost = audioData.bass * (1-Math.abs(x)) + audioData.treble * Math.abs(x);
            } else {
                // Auto animation when no audio
                audioBoost = 0.3 + Math.sin(time * 5 + Math.abs(x) * 5) * 0.2;
            }
            
            levels[i] = base * audioBoost * rows * 1.5;
        }
        
        this.ledPanels.forEach(panel => {
            const brightness = panel.row < levels[panel.col] ? 1.0 : 0.0;
            // Color gradient from green to red
            const intensity = panel.row / rows;
            const barColor = new BABYLON.Color3(intensity, 1.0 - intensity, 0);
            
            if (brightness > 0) {
                panel.material.emissiveColor = barColor;
            } else {
                panel.material.emissiveColor = this.cachedColors.black;
            }
        });
    }

    patternEqualizerBars(color, time, audioData) {
        // Bouncing EQ columns
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const hasAudio = audioData && audioData.hasAudio;
        
        this.ledPanels.forEach(panel => {
            // Randomize height slightly with noise/time
            const noise = Math.sin(panel.col * 0.5 + time * 5) * 0.5 + 0.5;
            
            let height;
            if (hasAudio) {
                height = noise * rows * (audioData.average * 2);
            } else {
                // Auto animation
                height = noise * rows * (0.3 + Math.sin(time * 2) * 0.2);
            }
            
            const brightness = panel.row < height ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternBeatGrid(color, time, audioData) {
        // Pulsing grid on beat
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const hasAudio = audioData && audioData.hasAudio;
        
        let beat = 0.1;
        if (hasAudio) {
            beat = audioData.bass > 0.2 ? 1.0 : 0.1;
        } else {
            // Auto beat (130 BPM approx)
            beat = Math.sin(time * 13) > 0.8 ? 1.0 : 0.1;
        }
        
        this.ledPanels.forEach(panel => {
            const isGrid = panel.col % 4 === 0 || panel.row % 4 === 0;
            const brightness = isGrid ? beat : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternPixelRain(color, time, audioData) {
        // Digital rain effect
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const speed = 5 + (panel.col % 3);
            const y = (time * speed + panel.col * 7) % (rows + 5);
            const dist = y - panel.row;
            
            let brightness = 0;
            if (dist > 0 && dist < 4) {
                brightness = 1.0 - dist/4;
            }
            
            // Matrix green or provided color
            const rainColor = new BABYLON.Color3(0, 1, 0.2);
            this.updateLEDPanel(panel, rainColor, brightness);
        });
    }

    patternTriangleWave(color, time, audioData) {
        // Diagonal lines forming triangles
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const val = (panel.col + panel.row + time * 5) % 8;
            const brightness = val < 2 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternHexagonPulse(color, time, audioData) {
        // Hexagonal grid approximation (staggered rows)
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const offset = (panel.row % 2) * 0.5;
            const x = panel.col + offset;
            const dist = Math.sqrt(Math.pow(x - cols/2, 2) + Math.pow(panel.row - rows/2, 2));
            
            const wave = Math.sin(dist - time * 5);
            const brightness = wave > 0.5 ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternDiamondSpin(color, time, audioData) {
        // Rotating diamond shape
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const cx = cols / 2;
        const cy = rows / 2;
        
        const angle = time;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - cx;
            const dy = panel.row - cy;
            
            // Rotate coordinates
            const rx = dx * cos - dy * sin;
            const ry = dx * sin + dy * cos;
            
            // Diamond distance (Manhattan)
            const d = Math.abs(rx) + Math.abs(ry);
            const brightness = (d < 5 && d > 4) ? 1.0 : 0.0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternCubeRotate(color, time, audioData) {
        // 3D cube illusion (wireframe projection)
        // Simplified: rotating square projected
        this.patternDiamondSpin(color, time, audioData); // Reuse for now as it's similar visually in 2D
    }

    patternPlasma(color, time, audioData) {
        // Organic plasma flow
        this.ledPanels.forEach(panel => {
            const v1 = Math.sin(panel.col * 0.1 + time);
            const v2 = Math.sin(panel.row * 0.1 + time);
            const v3 = Math.sin((panel.col + panel.row) * 0.1 + time);
            const v4 = Math.sin(Math.sqrt(panel.col*panel.col + panel.row*panel.row) * 0.1 + time);
            
            const val = (v1 + v2 + v3 + v4) / 4;
            const brightness = (val + 1) / 2;
            
            // Color shift
            const plasmaColor = new BABYLON.Color3(
                Math.sin(val * Math.PI) * 0.5 + 0.5,
                Math.sin(val * Math.PI + 2) * 0.5 + 0.5,
                Math.sin(val * Math.PI + 4) * 0.5 + 0.5
            );
            
            panel.material.emissiveColor = plasmaColor;
        });
    }

    patternAurora(color, time, audioData) {
        // Wavy vertical bands
        const cols = this.ledCols || 28;
        
        this.ledPanels.forEach(panel => {
            const x = panel.col;
            const y = panel.row;
            
            const wave = Math.sin(x * 0.2 + time) * 2 + Math.sin(x * 0.5 + time * 2);
            const dist = Math.abs(y - (4 + wave));
            
            const brightness = Math.max(0, 1.0 - dist / 2);
            // Aurora colors (Green/Teal/Purple)
            const auroraColor = new BABYLON.Color3(0, 1.0 - dist/4, 1.0);
            
            this.updateLEDPanel(panel, auroraColor, brightness);
        });
    }

    patternOceanWave(color, time, audioData) {
        // Horizontal sine waves
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const waveHeight = Math.sin(panel.col * 0.3 + time * 2) * 2 + rows/2;
            const brightness = panel.row < waveHeight ? 1.0 : 0.0;
            const oceanColor = new BABYLON.Color3(0, 0.5, 1.0);
            this.updateLEDPanel(panel, oceanColor, brightness);
        });
    }

    patternFire(color, time, audioData) {
        // Rising fire columns
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            // Noise based on column and time
            const noise = Math.sin(panel.col * 543.12 + time * 2) * Math.cos(panel.col * 123.45 + time * 3);
            const height = (noise * 0.5 + 0.5) * rows * 0.8;
            
            const dist = height - panel.row;
            let brightness = 0;
            if (dist > 0) brightness = 1.0;
            if (dist > 0 && dist < 1) brightness = dist; // Fade top
            
            // Fire colors: Red -> Orange -> Yellow
            const fireColor = new BABYLON.Color3(1.0, panel.row / rows * 0.8, 0);
            
            if (brightness > 0) {
                panel.material.emissiveColor = fireColor.scale(brightness);
            } else {
                panel.material.emissiveColor = this.cachedColors.black;
            }
        });
    }

    patternConfetti(color, time, audioData) {
        // Random colored pixels sparkling
        this.ledPanels.forEach(panel => {
            // Random flicker based on time and position
            const rand = Math.sin(panel.col * 12.9898 + panel.row * 78.233 + time * 20);
            const on = rand > 0.95;
            
            if (on) {
                // Random color
                const r = Math.sin(rand * 100) * 0.5 + 0.5;
                const g = Math.sin(rand * 200) * 0.5 + 0.5;
                const b = Math.sin(rand * 300) * 0.5 + 0.5;
                panel.material.emissiveColor = new BABYLON.Color3(r, g, b);
            } else {
                panel.material.emissiveColor = this.cachedColors.black;
            }
        });
    }

    patternSpotlightSweep(color, time, audioData) {
        // Moving spotlights
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        const spot1X = (Math.sin(time) * 0.5 + 0.5) * cols;
        const spot1Y = (Math.cos(time * 1.3) * 0.5 + 0.5) * rows;
        
        const spot2X = (Math.sin(time * 1.5 + Math.PI) * 0.5 + 0.5) * cols;
        const spot2Y = (Math.cos(time * 0.7) * 0.5 + 0.5) * rows;
        
        this.ledPanels.forEach(panel => {
            const d1 = Math.sqrt(Math.pow(panel.col - spot1X, 2) + Math.pow(panel.row - spot1Y, 2));
            const d2 = Math.sqrt(Math.pow(panel.col - spot2X, 2) + Math.pow(panel.row - spot2Y, 2));
            
            const b1 = Math.max(0, 1.0 - d1 / 3);
            const b2 = Math.max(0, 1.0 - d2 / 3);
            
            const brightness = Math.min(1.0, b1 + b2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternNeonPulse(color, time, audioData) {
        // Bright outlines pulsing
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        const pulse = Math.sin(time * 5) * 0.5 + 0.5;
        
        this.ledPanels.forEach(panel => {
            const isBorder = panel.col === 0 || panel.col === cols-1 || panel.row === 0 || panel.row === rows-1;
            const brightness = isBorder ? 1.0 : pulse * 0.2;
            this.updateLEDPanel(panel, color, brightness);
        });
    }

    patternRainbowRave(color, time, audioData) {
        // Full RGB cycle
        const cols = this.ledCols || 28;
        
        this.ledPanels.forEach(panel => {
            const hue = (panel.col / cols + panel.row / 10 + time) % 1.0;
            
            // HSV to RGB
            const h = hue * 6;
            const c = 1.0;
            const x = c * (1 - Math.abs(h % 2 - 1));
            let r, g, b;
            if (h < 1) { r = c; g = x; b = 0; }
            else if (h < 2) { r = x; g = c; b = 0; }
            else if (h < 3) { r = 0; g = c; b = x; }
            else if (h < 4) { r = 0; g = x; b = c; }
            else if (h < 5) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            
            panel.material.emissiveColor = new BABYLON.Color3(r, g, b);
        });
    }
    
    // === MULTIPLAYER NETWORKING ===
    
    setupNetworkingCallbacks() {
        // Handle connection
        this.networkManager.onConnect = (playerId, clubState, players) => {
            log.info(`🌐 Connected as Player ${playerId}`);
            this.isMultiplayer = true;
            
            // Apply server's club state
            this.lightsActive = clubState.lightsActive;
            this.lasersActive = clubState.lasersActive;
            this.ledWallActive = clubState.ledWallActive;
            this.strobesActive = clubState.strobesActive;
            this.mirrorBallActive = clubState.mirrorBallActive;
            this.spotStrobeActive = clubState.spotStrobeActive !== undefined ? clubState.spotStrobeActive : false;
            this.spotlightSpeed = clubState.spotlightSpeed;
            this.spotlightMode = clubState.spotlightMode;
            this.spotlightPattern = clubState.spotlightPattern;
            this.spotColorIndex = clubState.spotColorIndex;
            this.currentSpotColor = this.spotColorList[this.spotColorIndex];
            this.mirrorBallColorIndex = clubState.mirrorBallColorIndex;
            this.mirrorBallSpotlightColor = this.mirrorBallColors[this.mirrorBallColorIndex];
            this.currentColorIndex = clubState.laserColorIndex !== undefined ? clubState.laserColorIndex : 0;
            this.ledPattern = clubState.ledPattern !== undefined ? clubState.ledPattern : 0;
            this.ledColorIndex = clubState.ledColorIndex !== undefined ? clubState.ledColorIndex : 0;
            
            // Create avatars for existing players
            players.forEach(player => {
                if (player.id !== playerId) {
                    this.avatarManager.createAvatar(player.id, player);
                }
            });
            
            // Apply audio sync if available
            if (clubState.audioUrl && clubState.audioPlaying) {
                this.syncAudio(clubState.audioUrl, clubState.audioTime);
            }
        };
        
        // Handle player joined
        this.networkManager.onPlayerJoined = (player) => {
            log.info(`👤 ${player.username} joined the club`);
            this.avatarManager.createAvatar(player.id, player);
        };
        
        // Handle player left
        this.networkManager.onPlayerLeft = (playerId) => {
            log.info(`👋 Player ${playerId} left the club`);
            this.avatarManager.removeAvatar(playerId);
        };
        
        // Handle player updates
        this.networkManager.onPlayerUpdate = (updateData) => {
            this.avatarManager.updateAvatar(updateData.playerId, updateData);
        };
        
        // Handle VJ control changes from other players
        this.networkManager.onVJControl = (control, value, fromPlayerId) => {
            log.info(`🎛️ ${control} changed to ${value} by Player ${fromPlayerId}`);
            this[control] = value;
            
            // Update specific controls
            if (control === 'spotColorIndex') {
                this.currentSpotColor = this.spotColorList[value];
            } else if (control === 'mirrorBallColorIndex') {
                this.mirrorBallSpotlightColor = this.mirrorBallColors[value];
            } else if (control === 'laserColorIndex') {
                this.currentColorIndex = value;
            } else if (control === 'ledPattern') {
                this.ledPattern = value;
            } else if (control === 'ledColorIndex') {
                this.ledColorIndex = value;
            }
        };
        
        // Handle audio sync
        this.networkManager.onAudioSync = (syncData) => {
            if (syncData.audioUrl) {
                this.syncAudio(syncData.audioUrl, syncData.audioTime, syncData.audioPlaying);
            }
        };
        
        // Periodic audio sync to prevent drift (every 5 seconds)
        /*
        this.audioSyncInterval = setInterval(() => {
            if (this.audioElement && !this.audioElement.paused && this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendAudioSync(
                    this.audioElement.src,
                    this.audioElement.currentTime,
                    true
                );
                log.info(`🔄 Audio sync: ${this.audioElement.currentTime.toFixed(1)}s`);
            }
        }, 5000);
        */
    }
    
    syncAudio(audioUrl, audioTime, isPlaying = true) {
        // Handle stop command (null URL or empty URL)
        if (!audioUrl || audioUrl === '') {
            if (this.audioElement) {
                this.audioElement.pause();
                this.audioElement.currentTime = 0;
                if (this.audioStreamButton) {
                    this.audioStreamButton.isPlaying = false;
                    this.audioStreamButton.material.emissiveColor = new BABYLON.Color3(0, 0.8, 0); // Green
                }
            }
            log.info('🔇 Audio stopped by remote player');
            return;
        }
        
        // Create or update audio element
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = "anonymous";
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.audioAnalyser = this.audioContext.createAnalyser();
                this.audioAnalyser.fftSize = 256;
                this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
            }
            
            const source = this.audioContext.createMediaElementSource(this.audioElement);
            source.connect(this.audioAnalyser);
            this.audioAnalyser.connect(this.audioContext.destination);
        }
        
        // Load and sync audio
        if (this.audioElement.src !== audioUrl) {
            this.audioElement.src = audioUrl;
            log.info(`🎵 Remote player started audio: ${audioUrl}`);
        }
        
        this.audioElement.currentTime = audioTime;
        
        // Update audio button state
        if (this.audioStreamButton) {
            this.audioStreamButton.isPlaying = isPlaying;
            this.audioStreamButton.material.emissiveColor = isPlaying ? 
                new BABYLON.Color3(1, 0, 0) : // Red when playing
                new BABYLON.Color3(0, 0.8, 0); // Green when paused
        }
        
        if (isPlaying) {
            this.audioElement.play().catch(err => {
                log.warn('Audio playback requires user interaction:', err);
            });
        } else {
            this.audioElement.pause();
        }
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
                    log.error('VR Error:', error);
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
        // Setup click handling for VJ control buttons, speed slider, and audio stream in 3D scene
        this.scene.onPointerDown = (evt, pickResult) => {
            if (pickResult.hit && pickResult.pickedMesh) {
                // Check if speed slider handle was clicked
                if (this.speedSlider && pickResult.pickedMesh === this.speedSlider.handle) {
                    this.speedSlider.isDragging = true;
                    this.speedSlider.handleMat.emissiveColor = new BABYLON.Color3(0, 1, 1); // Brighter cyan when dragging
                    return;
                }
                
                // Check if audio stream button was clicked
                if (this.audioStreamButton && pickResult.pickedMesh === this.audioStreamButton.mesh) {
                    this.toggleAudioStream();
                    return;
                }
                
                // Check if a VJ control button was clicked
                const clickedButton = this.vjControlButtons.find(btn => btn.mesh === pickResult.pickedMesh);
                
                if (clickedButton) {
                    log.info(`🎛️ VJ Control: ${clickedButton.label} clicked`);
                    
                    // Track VJ interaction - but DON'T pause patterns for pattern/mode cycling
                    // Only pause for manual light toggles (ON/OFF controls)
                    const isPatternControl = (clickedButton.control === "cyclePattern" || 
                                             clickedButton.control === "cycleSpotMode" ||
                                             clickedButton.control === "changeColor");
                    
                    if (!isPatternControl) {
                        this.lastVJInteraction = performance.now() / 1000;
                        this.vjManualMode = true;
                        log.info("🎛️ VJ manual mode: Automated patterns paused for 60 minutes");
                    }
                    
                    if (clickedButton.control === "changeColor") {
                        // Change color button - cycle to next color
                        this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
                        this.currentSpotColor = this.spotColorList[this.spotColorIndex];
                        this.lastColorChange = performance.now() / 1000;
                        
                        // Update ALL light colors immediately (specular for reflections, NO diffuse ambient)
                        if (this.spotlights) {
                            this.spotlights.forEach((spot, i) => {
                                // Update color references - fixture materials updated in animation loop
                                spot.light.specular = this.currentSpotColor; // Specular for reflections
                                spot.color = this.currentSpotColor;
                            });
                        }
                        
                        // Flash button feedback
                        clickedButton.material.emissiveColor = clickedButton.onColor;
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 200);
                        
                        log.info(`🎨 Color changed to index ${this.spotColorIndex}`);
                        
                        // Broadcast spotlight color change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl('spotColorIndex', this.spotColorIndex);
                        }
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
                        log.info(`🪩 Mirror ball color: ${colorNames[this.mirrorBallColorIndex]}`);
                        
                        // Broadcast mirror ball color change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl('mirrorBallColorIndex', this.mirrorBallColorIndex);
                        }
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
                        log.info(`💡 Spotlight mode: ${modeNames[this.spotlightMode]}`);
                        
                        // Broadcast spotlight mode change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl('spotlightMode', this.spotlightMode);
                        }
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
                        log.info(`🎯 Spotlight pattern: ${patternNames[this.spotlightPattern]}`);
                        
                        // Broadcast spotlight pattern change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl('spotlightPattern', this.spotlightPattern);
                        }
                    } else if (clickedButton.control === "patternRandom" || 
                               clickedButton.control === "patternStatic" || 
                               clickedButton.control === "patternSweep") {
                        // Direct pattern selection buttons
                        if (clickedButton.control === "patternRandom") {
                            this.spotlightPattern = 0;
                        } else if (clickedButton.control === "patternStatic") {
                            this.spotlightPattern = 1;
                        } else if (clickedButton.control === "patternSweep") {
                            this.spotlightPattern = 2;
                        }
                        
                        // Update all pattern buttons to show current selection
                        this.vjControlButtons.forEach(btn => {
                            if (btn.control === "patternRandom") {
                                btn.material.emissiveColor = (this.spotlightPattern === 0) ? btn.onColor : btn.offColor;
                            } else if (btn.control === "patternStatic") {
                                btn.material.emissiveColor = (this.spotlightPattern === 1) ? btn.onColor : btn.offColor;
                            } else if (btn.control === "patternSweep") {
                                btn.material.emissiveColor = (this.spotlightPattern === 2) ? btn.onColor : btn.offColor;
                            }
                        });
                        
                        const patternNames = ["RANDOM", "STATIC DOWN", "SYNC SWEEP"];
                        log.info(`🎯 Spotlight pattern: ${patternNames[this.spotlightPattern]}`);
                        
                        // Broadcast spotlight pattern change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl('spotlightPattern', this.spotlightPattern);
                        }
                    } else {
                        // Toggle on/off control
                        this[clickedButton.control] = !this[clickedButton.control];
                        
                        // MUTUAL EXCLUSIVITY: Laser sheet and mirror ball cannot be active with ceiling lasers/gobos
                        // When mirrorBall or laserSheet turns ON, turn OFF ceiling lasers AND gobos (and vice versa)
                        if (clickedButton.control === 'mirrorBallActive' && this.mirrorBallActive) {
                            this.lasersActive = false;
                            this.laserSheetActive = false; // Mirror ball is solo effect
                            this.lightsActive = false; // Gobos OFF
                            log.info('🪩 Mirror ball ON - ceiling lasers, laser sheet & gobos OFF');
                        } else if (clickedButton.control === 'laserSheetActive' && this.laserSheetActive) {
                            this.lasersActive = false;
                            this.mirrorBallActive = false; // Laser sheet excludes mirror ball too
                            this.lightsActive = false; // Gobos OFF (mutual exclusivity)
                            log.info('📡 Laser sheet ON - ceiling lasers, mirror ball & gobos OFF');
                        } else if (clickedButton.control === 'lasersActive' && this.lasersActive) {
                            this.mirrorBallActive = false;
                            this.laserSheetActive = false;
                            this.lightsActive = true; // Gobos ON with ceiling lasers
                            log.info('🔴 Ceiling lasers ON - mirror ball & laser sheet OFF, gobos ON');
                        }
                        
                        // Update ALL affected button appearances (including lightsActive/gobos)
                        this.vjControlButtons.forEach(btn => {
                            if (btn.control === 'lasersActive' || btn.control === 'mirrorBallActive' || 
                                btn.control === 'laserSheetActive' || btn.control === 'lightsActive') {
                                btn.material.emissiveColor = this[btn.control] ? btn.onColor : btn.offColor;
                            }
                        });
                        
                        // Update clicked button appearance (for non-exclusive controls)
                        clickedButton.material.emissiveColor = this[clickedButton.control] ? 
                            clickedButton.onColor : clickedButton.offColor;
                        
                        log.info(`${clickedButton.label}: ${this[clickedButton.control] ? 'ON' : 'OFF'}`);
                        
                        // Broadcast VJ control change to other players
                        if (this.networkManager && this.networkManager.isConnected()) {
                            this.networkManager.sendVJControl(clickedButton.control, this[clickedButton.control]);
                            // Also broadcast the mutual exclusivity changes
                            if (clickedButton.control === 'mirrorBallActive' || 
                                clickedButton.control === 'laserSheetActive' || 
                                clickedButton.control === 'lasersActive') {
                                this.networkManager.sendVJControl('lasersActive', this.lasersActive);
                                this.networkManager.sendVJControl('mirrorBallActive', this.mirrorBallActive);
                                this.networkManager.sendVJControl('laserSheetActive', this.laserSheetActive);
                            }
                        }
                    }
                }
            }
        };
        
        // Handle pointer up (release slider)
        this.scene.onPointerUp = () => {
            if (this.speedSlider && this.speedSlider.isDragging) {
                this.speedSlider.isDragging = false;
                this.speedSlider.handleMat.emissiveColor = new BABYLON.Color3(0, 0.8, 1); // Normal cyan
                log.info(`🎛️ Speed set to: ${this.spotlightSpeed.toFixed(2)}x`);
                
                // Broadcast speed change to other players (after drag completes)
                if (this.networkManager && this.networkManager.isConnected()) {
                    this.networkManager.sendVJControl('spotlightSpeed', this.spotlightSpeed);
                }
            }
        };
        
        // Handle pointer move (drag slider)
        this.scene.onPointerMove = (evt, pickResult) => {
            if (this.speedSlider && this.speedSlider.isDragging && pickResult.hit) {
                // Get world position of pointer
                const pointerX = pickResult.pickedPoint.x;
                
                // Clamp to slider range
                const clampedX = Math.max(this.speedSlider.minX, Math.min(this.speedSlider.maxX, pointerX));
                
                // Update handle position
                this.speedSlider.handle.position.x = clampedX;
                
                // Calculate speed from position (0.1 to 2.0)
                const normalizedPos = (clampedX - this.speedSlider.minX) / (this.speedSlider.maxX - this.speedSlider.minX);
                const newSpeed = 0.1 + (normalizedPos * 1.9); // 0.1 to 2.0
                
                // Update ALL speed multipliers for unified control
                this.spotlightSpeed = newSpeed;
                this.laserSpeed = newSpeed;
                this.mirrorBallSpeed = newSpeed;
                this.ledWallSpeed = newSpeed;
                this.strobeSpeed = newSpeed;
            }
        };
        
        log.info("✅ VJ Control interaction enabled - click buttons to control lights!");
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
            log.info("🔇 Audio stream stopped");
            
            // Broadcast audio stop to other players
            if (this.networkManager && this.networkManager.isConnected()) {
                this.networkManager.sendAudioSync(null, 0, false);
            }
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
            log.info("🎵 Audio element created during user interaction");
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
                log.info(`📁 File selected: ${file.name}`);
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
                log.info(`📁 File dropped: ${file.name}`);
            } else {
                log.warn('⚠️ Please drop an audio file');
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
                    log.info(`📁 File pasted: ${file.name}`);
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
            log.error("❌ Audio element not created! This shouldn't happen.");
            return;
        }
        
        // Set source
        if (url === "") {
            this.audioElement.src = "https://stream.example.com/radio"; // Replace with actual demo
            log.info("🎵 Using demo audio stream");
        } else {
            this.audioElement.src = url;
            log.info(`🎵 Loading audio stream: ${url}`);
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
                    log.info("🔊 Audio stream playing automatically!");
                    
                    // Broadcast audio stream to other players
                    if (this.networkManager && this.networkManager.isConnected()) {
                        this.networkManager.sendAudioSync(this.audioElement.src, 0, true);
                        log.info("📡 Broadcasting audio stream to other players");
                    }
                    
                    // Connect to audio analyzer
                    if (!this.audioContext && window.AudioContext) {
                        this.audioContext = new AudioContext();
                        this.audioAnalyser = this.audioContext.createAnalyser();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        this.audioAnalyser.connect(this.audioContext.destination);
                        this.audioAnalyser.fftSize = 256;
                        log.info("🎚️ Audio analyzer connected");
                    }
                }).catch(err => {
                    log.error("❌ Failed to play audio:", err);
                    this.showErrorMessage("Audio loaded. Click play on the audio button to start.");
                });
            }
        }, 100); // Small delay to ensure load completes
    }

    startAudioFromFile(file) {
        log.info(`🎵 Loading audio file: ${file.name}`);
        
        // Audio element should already exist from showAudioStreamInputUI()
        if (!this.audioElement) {
            log.error("❌ Audio element not created! This shouldn't happen.");
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
                    log.info(`🔊 Playing audio file automatically: ${file.name}`);
                    
                    // Note: Local files use blob URLs which can't be shared across network
                    // Only the local user will hear the file. Use streaming URLs for multiplayer.
                    log.warn("⚠️ Local audio files are not shared in multiplayer (use stream URLs)");
                    
                    // Connect to audio analyzer
                    if (!this.audioContext && window.AudioContext) {
                        this.audioContext = new AudioContext();
                        this.audioAnalyser = this.audioContext.createAnalyser();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        this.audioAnalyser.connect(this.audioContext.destination);
                        this.audioAnalyser.fftSize = 256;
                        log.info("🎚️ Audio analyzer connected");
                    }
                }).catch(err => {
                    log.error("❌ Failed to play audio file:", err);
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
            exterior: { pos: new BABYLON.Vector3(0, 1.7, 10), target: new BABYLON.Vector3(0, 2, 0) },
            entrance: { pos: new BABYLON.Vector3(0, 1.7, 2), target: new BABYLON.Vector3(0, 1.7, -15) },
            danceFloor: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 3, -24) },
            djBooth: { pos: new BABYLON.Vector3(0, 2.0, -24.5), target: new BABYLON.Vector3(0, 1.7, -10) },
            djSide: { pos: new BABYLON.Vector3(-5, 2.0, -23), target: new BABYLON.Vector3(0, 1.5, -23.5) },
            ledWallClose: { pos: new BABYLON.Vector3(0, 1.7, -18), target: new BABYLON.Vector3(0, 3, -25) },
            speakers: { pos: new BABYLON.Vector3(-4, 1.7, -20), target: new BABYLON.Vector3(-7, 2.5, -25) },
            truss: { pos: new BABYLON.Vector3(0, 5, -8), target: new BABYLON.Vector3(0, 6.5, -12) },
            mirrorBall: { pos: new BABYLON.Vector3(3, 6.5, -12), target: new BABYLON.Vector3(0, 6.5, -12) },
            overview: { pos: new BABYLON.Vector3(-15, 8, -8), target: new BABYLON.Vector3(0, 2, -15) },
            ceiling: { pos: new BABYLON.Vector3(0, 8.5, -12), target: new BABYLON.Vector3(0, 0, -15) }
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

    async createDancingNPCs() {
        // Check if avatar manager is available (disabled when multiplayer is off)
        if (!this.avatarManager) {
            log.info('🕺 NPC avatars disabled (multiplayer system not active)');
            return; // Skip NPC creation when avatar manager is disabled
        }
        
        // Create 4 random HUMANLIKE NPC avatars dancing on the dancefloor (using 2 dance styles)
        const npcCount = 4; // Fixed count - mix of hip hop and house dance styles
        const npcNames = [
            'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey',
            'Riley', 'Skyler', 'Cameron', 'Avery', 'Quinn',
            'Sam', 'Jesse', 'Dakota', 'River', 'Phoenix'
        ];
        
        // Shuffle names for variety
        const shuffledNames = [...npcNames].sort(() => Math.random() - 0.5);
        
        log.info(`🕺 Creating ${npcCount} diverse dancing NPC avatars (Hip Hop + House styles)...`);
        
        // Dancefloor boundaries
        const dancefloorCenter = { x: 0, z: -12 };
        const dancefloorRadius = 5; // 5m radius around center
        
        for (let i = 0; i < npcCount; i++) {
            // Random position on dancefloor (avoid exact center where user spawns)
            const angle = (Math.PI * 2 * i) / npcCount + Math.random() * 0.5;
            const distance = 2 + Math.random() * 3; // 2-5m from center
            
            const x = dancefloorCenter.x + Math.cos(angle) * distance;
            const z = dancefloorCenter.z + Math.sin(angle) * distance;
            
            // Random VR vs Desktop (50/50 mix for variety)
            const isVR = Math.random() < 0.5;
            
            // HUMANLIKE RANDOMIZATION - Make each NPC unique
            const npcId = `npc_${i}`;
            const npcData = {
                username: shuffledNames[i],
                isVR: isVR,
                position: { x, y: 0, z },
                rotation: { x: 0, y: Math.random() * Math.PI * 2, z: 0 },
                // Unique appearance traits
                customization: {
                    // Random height variation (±15% from base)
                    heightMultiplier: 0.85 + Math.random() * 0.3,
                    
                    // Random body size (slim to broad)
                    bodyScale: 0.8 + Math.random() * 0.4,
                    
                    // Random skin tone (variety of human skin colors)
                    skinTone: this.getRandomSkinTone(),
                    
                    // Random outfit/body color
                    outfitColor: this.getRandomOutfitColor(),
                    
                    // Random head size (slight variation)
                    headScale: 0.9 + Math.random() * 0.2
                }
            };
            
            // Create avatar using existing AvatarManager (wait for loading)
            await this.avatarManager.createAvatar(npcId, npcData);
            
            // Apply customization after creation
            this.customizeNPCAvatar(npcId, npcData.customization);
            
            // Store NPC data for animation
            this.npcAvatars.push({
                id: npcId,
                isVR: isVR,
                basePosition: { x, y: 0, z },
                angle: Math.random() * Math.PI * 2,
                danceSpeed: 0.4 + Math.random() * 0.8, // Varied dance speed
                bobPhase: Math.random() * Math.PI * 2,
                spinPhase: Math.random() * Math.PI * 2,
                handWavePhase: Math.random() * Math.PI * 2,
                // Unique dance style
                danceStyle: Math.floor(Math.random() * 4), // 0-3: different dance patterns
                heightMultiplier: npcData.customization.heightMultiplier
            });
        }
        
        log.info(`✅ Created ${npcCount} diverse NPC avatars on dancefloor`);
    }
    
    getRandomSkinTone() {
        // Variety of human skin tones
        const skinTones = [
            new BABYLON.Color3(0.95, 0.76, 0.65), // Light skin
            new BABYLON.Color3(0.88, 0.70, 0.58), // Fair skin
            new BABYLON.Color3(0.80, 0.62, 0.50), // Medium skin
            new BABYLON.Color3(0.72, 0.55, 0.42), // Olive skin
            new BABYLON.Color3(0.60, 0.45, 0.35), // Tan skin
            new BABYLON.Color3(0.50, 0.37, 0.28), // Brown skin
            new BABYLON.Color3(0.40, 0.28, 0.20), // Dark brown skin
            new BABYLON.Color3(0.30, 0.20, 0.15)  // Deep brown skin
        ];
        return skinTones[Math.floor(Math.random() * skinTones.length)];
    }
    
    getRandomOutfitColor() {
        // Varied clothing/outfit colors (club-appropriate)
        const outfitColors = [
            // Vibrant club colors
            new BABYLON.Color3(0.2, 0.4, 0.8),  // Blue
            new BABYLON.Color3(0.8, 0.2, 0.4),  // Pink/Red
            new BABYLON.Color3(0.4, 0.2, 0.7),  // Purple
            new BABYLON.Color3(0.2, 0.7, 0.5),  // Teal
            new BABYLON.Color3(0.9, 0.6, 0.2),  // Orange
            new BABYLON.Color3(0.3, 0.8, 0.3),  // Green
            // Neutral colors
            new BABYLON.Color3(0.2, 0.2, 0.2),  // Black
            new BABYLON.Color3(0.9, 0.9, 0.9),  // White
            new BABYLON.Color3(0.4, 0.4, 0.5),  // Gray
            // Metallic/shimmer effects
            new BABYLON.Color3(0.8, 0.8, 0.9),  // Silver
            new BABYLON.Color3(0.9, 0.8, 0.5)   // Gold
        ];
        return outfitColors[Math.floor(Math.random() * outfitColors.length)];
    }
    
    customizeNPCAvatar(npcId, customization) {
        // Skip if avatar manager is disabled
        if (!this.avatarManager) return;
        
        const avatar = this.avatarManager.avatars.get(npcId);
        if (!avatar) return;
        
        // Apply height variation
        if (avatar.root) {
            avatar.root.scaling.y = customization.heightMultiplier;
        }
        
        // Apply body customization (desktop avatars)
        if (avatar.body) {
            // Scale body width
            avatar.body.scaling.x = customization.bodyScale;
            avatar.body.scaling.z = customization.bodyScale;
            
            // Apply outfit color to body
            const bodyMat = new BABYLON.PBRMetallicRoughnessMaterial(`npcBody_${npcId}`, this.scene);
            bodyMat.baseColor = customization.outfitColor;
            bodyMat.metallic = 0.1 + Math.random() * 0.3; // Some shimmer variation
            bodyMat.roughness = 0.6 + Math.random() * 0.3;
            bodyMat.emissiveColor = customization.outfitColor.scale(0.1); // Slight glow
            avatar.body.material = bodyMat;
        }
        
        // Apply head customization
        if (avatar.head) {
            // Scale head
            avatar.head.scaling.set(
                customization.headScale,
                customization.headScale,
                customization.headScale
            );
            
            // Apply skin tone to all head/neck parts
            const headMat = new BABYLON.PBRMetallicRoughnessMaterial(`npcHead_${npcId}`, this.scene);
            headMat.baseColor = customization.skinTone;
            headMat.metallic = 0.0;
            headMat.roughness = 0.7;
            
            // Apply to head, neck, ears, nose
            avatar.head.getChildMeshes().forEach(mesh => {
                if (mesh.name.includes('head') || mesh.name.includes('neck') || 
                    mesh.name.includes('Ear') || mesh.name.includes('nose')) {
                    mesh.material = headMat;
                }
            });
        }
        
        // Apply hand customization (VR avatars) - skin tone to hands and fingers
        if (avatar.leftHand && avatar.rightHand) {
            const handMat = new BABYLON.PBRMetallicRoughnessMaterial(`npcHands_${npcId}`, this.scene);
            handMat.baseColor = customization.skinTone;
            handMat.metallic = 0.0;
            handMat.roughness = 0.7;
            
            // Apply to palm and fingers
            avatar.leftHand.getChildMeshes().forEach(mesh => {
                if (mesh.name.includes('palm') || mesh.name.includes('finger') || 
                    mesh.name.includes('thumb') || mesh.name.includes('pinky') || 
                    mesh.name.includes('ring') || mesh.name.includes('middle') || 
                    mesh.name.includes('index')) {
                    mesh.material = handMat;
                }
            });
            
            avatar.rightHand.getChildMeshes().forEach(mesh => {
                if (mesh.name.includes('palm') || mesh.name.includes('finger') || 
                    mesh.name.includes('thumb') || mesh.name.includes('pinky') || 
                    mesh.name.includes('ring') || mesh.name.includes('middle') || 
                    mesh.name.includes('index')) {
                    mesh.material = handMat;
                }
            });
        }
        
        // Apply outfit customization to body parts (Desktop avatars)
        if (avatar.body) {
            const bodyMat = new BABYLON.PBRMetallicRoughnessMaterial(`npcBody_${npcId}`, this.scene);
            bodyMat.baseColor = customization.outfitColor;
            bodyMat.metallic = 0.1 + Math.random() * 0.3;
            bodyMat.roughness = 0.6 + Math.random() * 0.3;
            bodyMat.emissiveColor = customization.outfitColor.scale(0.1);
            
            // Apply to torso, hips, arms, legs (not skin parts)
            avatar.body.getChildMeshes().forEach(mesh => {
                if (mesh.name.includes('torso') || mesh.name.includes('hips') || 
                    mesh.name.includes('Thigh') || mesh.name.includes('Calf') || 
                    mesh.name.includes('Foot') || mesh.name.includes('Arm')) {
                    mesh.material = bodyMat;
                }
            });
            
            // Apply skin tone to exposed hands
            const skinMat = new BABYLON.PBRMetallicRoughnessMaterial(`npcSkin_${npcId}`, this.scene);
            skinMat.baseColor = customization.skinTone;
            skinMat.metallic = 0.0;
            skinMat.roughness = 0.7;
            
            avatar.body.getChildMeshes().forEach(mesh => {
                if (mesh.name.includes('Hand')) {
                    mesh.material = skinMat;
                }
            });
        }
    }
    
    updateDancingNPCs(time) {
        // Skip if avatar manager is disabled
        if (!this.avatarManager) return;
        
        // Animate each NPC with unique, humanlike dancing movements
        this.npcAvatars.forEach(npc => {
            const avatar = this.avatarManager.avatars.get(npc.id);
            if (!avatar || !avatar.root) return;
            
            // Skip procedural animation if avatar has built-in animations (Mixamo, etc.)
            if (avatar.root.currentAnimation) {
                // Avatar has its own animation - just keep it at base position
                avatar.root.position.x = npc.basePosition.x;
                avatar.root.position.z = npc.basePosition.z;
                avatar.root.position.y = npc.basePosition.y;
                // Don't override rotation - let the animation handle it
                
                // Debug: Log once that we're using built-in animation
                if (!npc.loggedAnimation) {
                    log.info(`🎭 ${npc.id} using built-in animation (skipping procedural)`);
                    npc.loggedAnimation = true;
                }
                return;
            }
            
            // Debug: Log once that we're using procedural animation
            if (!npc.loggedProcedural) {
                log.info(`🤖 ${npc.id} using procedural animation (no built-in animation found)`);
                npc.loggedProcedural = true;
            }
            
            // DANCE STYLE VARIATIONS - Each NPC has their own style
            let sideMotion, forwardMotion, bobAmount, rotationAmount;
            
            switch(npc.danceStyle) {
                case 0: // ENERGETIC - Big movements, lots of jumping
                    sideMotion = Math.sin(time * npc.danceSpeed * 1.5 + npc.angle) * 0.4;
                    forwardMotion = Math.cos(time * npc.danceSpeed * 1.8 + npc.angle) * 0.3;
                    bobAmount = Math.abs(Math.sin(time * npc.danceSpeed * 3 + npc.bobPhase)) * 0.25;
                    rotationAmount = Math.sin(time * npc.danceSpeed * 0.8 + npc.spinPhase) * 0.8;
                    break;
                    
                case 1: // CHILL - Smooth, flowing movements
                    sideMotion = Math.sin(time * npc.danceSpeed * 0.6 + npc.angle) * 0.2;
                    forwardMotion = Math.cos(time * npc.danceSpeed * 0.7 + npc.angle) * 0.15;
                    bobAmount = Math.abs(Math.sin(time * npc.danceSpeed * 1.5 + npc.bobPhase)) * 0.1;
                    rotationAmount = Math.sin(time * npc.danceSpeed * 0.3 + npc.spinPhase) * 0.3;
                    break;
                    
                case 2: // RHYTHMIC - Sharp, beat-focused movements
                    sideMotion = Math.floor(Math.sin(time * npc.danceSpeed * 2 + npc.angle) * 4) * 0.1;
                    forwardMotion = Math.floor(Math.cos(time * npc.danceSpeed * 2.2 + npc.angle) * 4) * 0.08;
                    bobAmount = Math.floor(Math.sin(time * npc.danceSpeed * 4 + npc.bobPhase) * 2) * 0.15;
                    rotationAmount = Math.floor(Math.sin(time * npc.danceSpeed * 0.6 + npc.spinPhase) * 3) * 0.2;
                    break;
                    
                case 3: // SHUFFLE - Side-to-side with occasional spins
                    const shufflePhase = Math.floor(time * npc.danceSpeed * 0.5) % 4;
                    sideMotion = (shufflePhase < 2 ? 0.3 : -0.3) * Math.sin(time * npc.danceSpeed * 2);
                    forwardMotion = Math.sin(time * npc.danceSpeed * 0.5 + npc.angle) * 0.1;
                    bobAmount = Math.abs(Math.sin(time * npc.danceSpeed * 2 + npc.bobPhase)) * 0.12;
                    rotationAmount = Math.sin(time * npc.danceSpeed * 0.4 + npc.spinPhase) * 1.2;
                    break;
            }
            
            // Apply movement (accounting for height variation)
            avatar.root.position.x = npc.basePosition.x + sideMotion;
            avatar.root.position.z = npc.basePosition.z + forwardMotion;
            avatar.root.position.y = bobAmount * npc.heightMultiplier; // Shorter NPCs bob less
            
            // Apply rotation
            avatar.root.rotation.y = rotationAmount;
            
            // VR avatars: animate hands with style-specific movements
            if (npc.isVR && avatar.leftHand && avatar.rightHand) {
                switch(npc.danceStyle) {
                    case 0: // ENERGETIC - Hands way up, waving wildly
                        avatar.leftHand.position.y = 1.5 + Math.sin(time * npc.danceSpeed * 4 + npc.handWavePhase) * 0.4;
                        avatar.rightHand.position.y = 1.5 + Math.cos(time * npc.danceSpeed * 4 + npc.handWavePhase) * 0.4;
                        avatar.leftHand.position.x = -0.4 + Math.sin(time * npc.danceSpeed * 3) * 0.2;
                        avatar.rightHand.position.x = 0.4 + Math.cos(time * npc.danceSpeed * 3) * 0.2;
                        break;
                        
                    case 1: // CHILL - Hands at chest level, gentle sway
                        avatar.leftHand.position.y = 1.0 + Math.sin(time * npc.danceSpeed * 1.5 + npc.handWavePhase) * 0.15;
                        avatar.rightHand.position.y = 1.0 + Math.cos(time * npc.danceSpeed * 1.5 + npc.handWavePhase) * 0.15;
                        avatar.leftHand.position.x = -0.25 + Math.sin(time * npc.danceSpeed) * 0.05;
                        avatar.rightHand.position.x = 0.25 + Math.cos(time * npc.danceSpeed) * 0.05;
                        break;
                        
                    case 2: // RHYTHMIC - Hands pumping to the beat
                        avatar.leftHand.position.y = 1.2 + Math.floor(Math.sin(time * npc.danceSpeed * 4 + npc.handWavePhase) * 2) * 0.15;
                        avatar.rightHand.position.y = 1.2 + Math.floor(Math.cos(time * npc.danceSpeed * 4 + npc.handWavePhase) * 2) * 0.15;
                        avatar.leftHand.position.x = -0.3;
                        avatar.rightHand.position.x = 0.3;
                        break;
                        
                    case 3: // SHUFFLE - One hand up, one down alternating
                        const handSwitch = Math.floor(time * npc.danceSpeed * 0.5) % 2;
                        avatar.leftHand.position.y = handSwitch ? 1.5 : 0.8;
                        avatar.rightHand.position.y = handSwitch ? 0.8 : 1.5;
                        avatar.leftHand.position.x = -0.3 + Math.sin(time * npc.danceSpeed) * 0.1;
                        avatar.rightHand.position.x = 0.3 + Math.cos(time * npc.danceSpeed) * 0.1;
                        break;
                }
            }
        });
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

// Initialize when page loads - DISABLED for splash screen
// Now initialized from splash screen in index.html after user clicks "ENTER CLUB"
// window.addEventListener('DOMContentLoaded', () => {
//     window.vrClub = new VRClub();
// });
