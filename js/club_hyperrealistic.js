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
    x: { min: -12.5, max: 12.5, width: 25 },
    y: { min: 0, max: 8, height: 8 },
    z: { min: -21, max: -5, depth: 16 }
};

// Key positions in the club
const CLUB_POSITIONS = {
    djBooth: { x: 0, y: 0.95, z: -18 },
    danceFloor: { x: 0, y: 0, z: -12 },
    entrance: { x: 0, y: 0, z: 0 },
    mirrorBall: { x: 0, y: 6.5, z: -12 },
    paSpeakers: {
        left: { x: -7, y: 0, z: -16 },
        right: { x: 7, y: 0, z: -16 }
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
        
        // CRITICAL: Track VR mode to disable frame-skip optimizations
        // Frame-skipping causes different states per eye = epileptic effect
        this.isInVRMode = false;
        
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
            purple: new BABYLON.Color3(0.5, 0, 1),
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7) // Blinder warm white
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
        this.spotlightPattern = 0; // 0=automated/moving (DEFAULT), 1=static down, 2=mirror sweep
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
        
        // === PROFESSIONAL VJ AUTO-PATTERN SYSTEM ===
        // Immersive light show timing for drops, builds, and impacts
        this.vjAutoMode = true;         // Auto VJ show mode (synchronized effects)
        this.vjBeatPhase = 0;           // Current beat phase (0-3 for 4/4 timing)
        this.vjDropTimer = 0;           // Time since last drop effect
        this.vjBuildIntensity = 0;      // Build-up intensity (0-1)
        this.vjLastBeatTime = 0;        // Last detected beat timestamp
        this.vjBPM = 128;               // Estimated BPM (will be auto-detected from audio)
        this.vjDropActive = false;      // Currently in a drop sequence
        this.vjBuildActive = false;     // Currently building up
        
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
        
        // CRITICAL: Track VR mode to disable frame-skip optimizations
        // Frame-skipping causes different states per eye = epileptic effect
        this.isInVRMode = true;
        
        // CRITICAL VR PERFORMANCE: Disable ALL post-processing in VR
        // Post-processing pipelines are extremely expensive in stereoscopic rendering
        // WebXR layer's native antialias: true handles AA much more efficiently
        if (this.renderPipeline) {
            // Remove desktop camera from pipeline
            if (this.camera) {
                this.renderPipeline.removeCamera(this.camera);
            }
            
            // DISABLE all post-processing for VR performance
            // The XR layer's native antialias handles AA efficiently at the hardware level
            this.renderPipeline.fxaaEnabled = false; // Disable - use XR layer's native AA
            this.renderPipeline.bloomEnabled = false; // Disable - too expensive in VR
            this.renderPipeline.sharpenEnabled = false; // Disable - not needed with native AA
            this.renderPipeline.imageProcessingEnabled = false; // Disable - saves GPU cycles
            this.renderPipeline.grainEnabled = false;
            this.renderPipeline.chromaticAberrationEnabled = false;
            
            log.info('⚡ Disabled post-processing pipeline for VR performance (using native XR AA)');
        }

        // OPTIMIZED: Disable SSAO in VR (too expensive)
        if (this.ssaoPipeline) {
            // Detach desktop camera to save performance
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", this.camera);
            // Also detach XR camera just in case
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", xrCamera);
        }
        
        // #5 OPTIMIZED: Use native resolution for VR (let XR layer handle scaling)
        this.engine.setHardwareScalingLevel(1.0); // Native resolution - XR handles foveated rendering
        
        // #4 OPTIMIZED: Disable glow layer entirely in VR for performance
        if (this.glowLayer) {
            this.glowLayer.isEnabled = false; // Completely disable glow for VR performance
            log.info('⚡ Disabled glow layer for VR performance');
        }
        
        const ambient = this.scene.getLightByName('ambient');
        if (ambient) ambient.intensity = vr.ambientIntensity;
        
        this.scene.environmentIntensity = vr.environmentIntensity;
        this.scene.clearColor = vr.clearColor;
        this.scene.fogDensity = vr.fogDensity;
        
        // #6 OPTIMIZED: Freeze static materials to prevent shader recompilation
        this.scene.materials.forEach(mat => {
            // CRITICAL FIX: Explicitly unfreeze LED and strobe materials to ensure animation works in VR
            const matName = mat.name ? mat.name.toLowerCase() : '';
            if (matName.includes('led') || matName.includes('strobe')) {
                mat.unfreeze();
                return; // Skip freezing - these need dynamic emissive color updates
            }
            
            if (mat.name && !mat.name.includes('beam') && !mat.name.includes('laser') && 
                !mat.name.includes('spot')) {
                mat.freeze();
            }
        });
        
        // CRITICAL: Force unfreeze ALL LED panel materials (they may have been frozen during creation)
        if (this.ledPanels && this.ledPanels.length > 0) {
            this.ledPanels.forEach(panel => {
                if (panel.material) {
                    panel.material.unfreeze();
                }
            });
            log.info(`⚡ Unfroze ${this.ledPanels.length} LED panel materials for VR animation`);
        }
        
        // CRITICAL: Force unfreeze strobe materials
        if (this.strobes && this.strobes.length > 0) {
            this.strobes.forEach(strobe => {
                if (strobe.material) {
                    strobe.material.unfreeze();
                }
            });
            log.info(`⚡ Unfroze ${this.strobes.length} strobe materials for VR animation`);
        }
        
        // #11 OPTIMIZED: Aggressively freeze static meshes in VR
        // Freeze world matrix for objects that never move
        this.scene.meshes.forEach(mesh => {
            if (mesh.name && (
                mesh.name.includes('wall') || 
                mesh.name.includes('floor') || 
                mesh.name.includes('ceiling') || 
                mesh.name.includes('pillar') || 
                mesh.name.includes('truss') || 
                mesh.name.includes('speaker') || 
                mesh.name.includes('djTable') || 
                mesh.name.includes('platform') ||
                mesh.name.includes('rail') ||
                mesh.name.includes('pipe') ||
                mesh.name.includes('brick')
            )) {
                mesh.freezeWorldMatrix();
                mesh.doNotSyncBoundingInfo = true;
                mesh.isPickable = false;
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
        
        // #8 OPTIMIZED: Reduce particle systems for VR performance
        // Particles are expensive - reduce capacity and emit rates in VR
        if (this.floorFog) {
            this.floorFog.emitRate = 50; // Reduced from 200 (75% reduction)
            log.info('⚡ Reduced floor fog emit rate for VR');
        }
        if (this.haze) {
            this.haze.emitRate = 25; // Reduced from 100 (75% reduction)
            log.info('⚡ Reduced haze emit rate for VR');
        }
        
        // #9 OPTIMIZED: Disable scene fog in VR (use particle-based fog instead if needed)
        this.scene.fogMode = BABYLON.Scene.FOGMODE_NONE;
        log.info('⚡ Disabled scene fog for VR performance');
        
        // #10 OPTIMIZED: Enable Fixed Foveated Rendering (FFR) on Quest 3S
        // Quest 3S supports hardware-level foveated rendering which renders peripheral vision
        // at lower resolution, significantly improving GPU performance
        try {
            // CRITICAL PERFORMANCE FIX: Reduce render resolution slightly for Quest 3S
            // Native resolution is too high for complex scenes. 1.3x scaling = ~75% resolution
            // This provides massive FPS boost with minimal visual impact in VR
            this.engine.setHardwareScalingLevel(1.3);
            log.info('⚡ Set hardware scaling level to 1.3 for VR performance');

            const session = this.vrHelper?.baseExperience?.sessionManager?.session;
            if (session && 'updateRenderState' in session) {
                // Check if XR layer supports foveated rendering
                const xrLayer = session.renderState.baseLayer;
                if (xrLayer && 'fixedFoveation' in xrLayer) {
                    // Set high foveation (0 = none, 1 = maximum peripheral reduction)
                    // 0.75-1.0 is good for performance without noticeable quality loss
                    xrLayer.fixedFoveation = 1.0; // Maximum foveation for best performance
                    log.info('⚡ Fixed Foveated Rendering enabled (1.0 max) - hardware accelerated');
                }
            }
        } catch (err) {
            log.warn('Could not enable Fixed Foveated Rendering:', err);
        }
    }
    
    applyDesktopSettings() {
        const desktop = this.vrSettings.desktop;
        
        // Restore post-processing
        if (this.renderPipeline) {
            // Fix: Add desktop camera back
            if (this.camera) {
                this.renderPipeline.addCamera(this.camera);
            }
            
            // Re-enable all post-processing effects for desktop
            this.renderPipeline.fxaaEnabled = desktop.fxaaEnabled;
            this.renderPipeline.bloomEnabled = true;
            this.renderPipeline.sharpenEnabled = true;
            this.renderPipeline.imageProcessingEnabled = true;
            this.renderPipeline.grainEnabled = desktop.grainEnabled;
            this.renderPipeline.chromaticAberrationEnabled = desktop.chromaticAberrationEnabled;
            
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
            
            log.info('✨ Re-enabled post-processing pipeline for desktop');
        }

        // Enable SSAO in Desktop mode
        if (this.ssaoPipeline) {
            this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssao", this.camera);
        }
        
        // Restore hardware scaling to native resolution
        this.engine.setHardwareScalingLevel(1.0);
        
        // Restore glow layer for desktop
        if (this.glowLayer) {
            this.glowLayer.isEnabled = true;
            this.glowLayer.intensity = desktop.glowIntensity;
        }
        
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
        
        // Restore particle system emit rates for desktop
        if (this.floorFog) {
            this.floorFog.emitRate = 200; // Full rate for desktop
        }
        if (this.haze) {
            this.haze.emitRate = 100; // Full rate for desktop
        }
        
        // Restore scene fog for desktop
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
        this.scene.fogDensity = desktop.fogDensity;
        log.info('🌫️ Restored scene fog and particle rates for desktop');
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
        this.camera.inertia = 0.1; // Reduced inertia to prevent "ice skating" feel
        
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
            disableTeleportation: true, // Disable default teleportation to allow smooth movement
            // CRITICAL: Configure XR layer with anti-aliasing enabled
            outputCanvasOptions: {
                canvasOptions: {
                    antialias: true, // Enable anti-aliasing in XR layer
                    depth: true,
                    stencil: true,
                    alpha: true,
                    framebufferScaleFactor: 1.0 // Use native resolution (can increase for supersampling)
                }
            }
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
        // CRITICAL: Must wait for XR session to be active before enabling movement
        if (vrHelper && vrHelper.baseExperience) {
            // Enable movement feature AFTER entering XR mode (when controllers are available)
            vrHelper.baseExperience.onStateChangedObservable.add((state) => {
                if (state === BABYLON.WebXRState.IN_XR && !this.movementFeature) {
                    try {
                        // Enable movement controller feature for smooth locomotion with thumbsticks
                        // Left thumbstick = move, Right thumbstick = turn (Babylon.js default)
                        this.movementFeature = vrHelper.baseExperience.featuresManager.enableFeature(
                            BABYLON.WebXRFeatureName.MOVEMENT,
                            'latest',
                            {
                                xrInput: vrHelper.input,
                                // Smooth locomotion settings - left stick moves, right stick rotates
                                movementEnabled: true,
                                movementSpeed: 1.5, // Slower for realistic walking feel
                                movementThreshold: 0.2, // Higher threshold to prevent drift
                                rotationEnabled: true,
                                rotationSpeed: 0.8, // Slightly slower turning for comfort
                                rotationThreshold: 0.2, // Higher threshold for rotation
                                // IMPORTANT: Set to FALSE so movement doesn't follow head pitch (looking up/down)
                                // This prevents flying when looking up and moving forward
                                movementOrientationFollowsViewerPose: false,
                                // Instead follow controller orientation (flattened to XZ plane)
                                movementOrientationFollowsController: true
                            }
                        );
                        
                        // GRAVITY & COLLISIONS: Enable physics-like movement
                        const xrCamera = vrHelper.baseExperience.camera;
                        xrCamera.applyGravity = true;
                        xrCamera.checkCollisions = true;
                        // Set ellipsoid for collision detection (approximate human size)
                        xrCamera.ellipsoid = new BABYLON.Vector3(0.3, 0.8, 0.3); // Lower height
                        xrCamera.inertia = 0.1; // Reduce sliding (default 0.9)
                        
                        log.info('🎮 VR controller locomotion enabled with gravity');
                        
                        // SPRINT FEATURE: Press thumbstick or Grip button to run
                        vrHelper.input.onControllerAddedObservable.add((controller) => {
                            controller.onMotionControllerInitObservable.add((motionController) => {
                                // 1. Thumbstick Press (Click)
                                const thumbstick = motionController.getComponent("xr-standard-thumbstick");
                                if (thumbstick) {
                                    thumbstick.onButtonStateChangedObservable.add((component) => {
                                        if (component.pressed) {
                                            if (this.movementFeature) {
                                                this.movementFeature.movementSpeed = 3.0; // Sprint (2x normal)
                                                log.info('🏃 VR Sprint activated');
                                            }
                                        } else {
                                            if (this.movementFeature) {
                                                this.movementFeature.movementSpeed = 1.5; // Normal walk
                                            }
                                        }
                                    });
                                }
                                
                                // 2. Squeeze/Grip Button (Alternative Sprint)
                                const squeeze = motionController.getComponent("xr-standard-squeeze");
                                if (squeeze) {
                                    squeeze.onButtonStateChangedObservable.add((component) => {
                                        if (component.pressed) {
                                            if (this.movementFeature) {
                                                this.movementFeature.movementSpeed = 6.0; // Sprint
                                            }
                                        } else {
                                            if (this.movementFeature) {
                                                this.movementFeature.movementSpeed = 3.0; // Normal
                                            }
                                        }
                                    });
                                }

                                // 3. JUMP FEATURE: Press A (Right) or X (Left) to jump
                                const jumpBtnIds = ["a-button", "x-button"];
                                jumpBtnIds.forEach(id => {
                                    const btn = motionController.getComponent(id);
                                    if (btn) {
                                        btn.onButtonStateChangedObservable.add((c) => {
                                            if (c.pressed && (!this.jumpState || !this.jumpState.active)) {
                                                log.info('🦘 VR Jump activated');
                                                
                                                // Initialize jump state if needed
                                                if (!this.jumpState) {
                                                    this.jumpState = { active: false, velocity: 0 };
                                                    
                                                    // Add physics observer for jump arc
                                                    this.scene.onBeforeRenderObservable.add(() => {
                                                        if (this.jumpState.active && xrCamera) {
                                                            // Apply velocity
                                                            xrCamera.position.y += this.jumpState.velocity;
                                                            // Apply gravity to velocity
                                                            this.jumpState.velocity -= 0.006; // Gravity
                                                            
                                                            // Check for landing (only when falling)
                                                            if (this.jumpState.velocity < 0) {
                                                                // Raycast down to find ground
                                                                const ray = new BABYLON.Ray(xrCamera.position, new BABYLON.Vector3(0, -1, 0), 2.5);
                                                                // Pick meshes that have collisions enabled (floor, platform)
                                                                const pick = this.scene.pickWithRay(ray, (mesh) => mesh.checkCollisions);
                                                                
                                                                // If ground is within standing height (1.7m) + tolerance
                                                                if (pick && pick.hit && pick.distance <= 1.75) {
                                                                    this.jumpState.active = false;
                                                                    xrCamera.applyGravity = true; // Re-enable Babylon gravity
                                                                    // Smooth landing
                                                                    xrCamera.position.y = pick.pickedPoint.y + 1.7;
                                                                }
                                                                // Fallback for infinite fall (reset to floor)
                                                                else if (xrCamera.position.y < 1.7) {
                                                                    this.jumpState.active = false;
                                                                    xrCamera.applyGravity = true;
                                                                    xrCamera.position.y = 1.7;
                                                                }
                                                            }
                                                        }
                                                    });
                                                }
                                                
                                                // Trigger jump
                                                this.jumpState.active = true;
                                                this.jumpState.velocity = 0.12; // Jump force
                                                xrCamera.applyGravity = false; // Disable Babylon gravity during jump
                                            }
                                        });
                                    }
                                });
                            });
                        });
                    } catch (e) {
                        log.warn('Could not enable VR movement feature:', e);
                    }
                }
            });
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
                    // CRITICAL: Re-enable frame-skip optimizations on desktop
                    this.isInVRMode = false;
                    
                    // Remove Y-lock observer when exiting VR
                    if (this.vrYLockObserver) {
                        this.scene.onBeforeRenderObservable.remove(this.vrYLockObserver);
                        this.vrYLockObserver = null;
                    }
                    
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
        if (this.useModularSystems && this.systems.ledWall) {
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
        // Blinders removed - strobes are sufficient
        // this.createLaserSheet(); // Laser sheet disabled for now
        this.createHyperrealisticSmoke(); // Add volumetric smoke/fog
        this.createMirrorBall(); // Add disco/mirror ball with spotlight
        // Entrance, bar, and dance floor lighting removed for cleaner look
        this.createSafetyDetails(); // Exit signs, fire extinguishers, smoke detectors
        
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
        // Pass cameras array in constructor to avoid "reuse" warnings from addCamera()
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true, // HDR enabled for better color range
            this.scene,
            this.camera ? [this.camera] : [] // Pass camera array directly
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

        // SSAO 2 Pipeline (Screen Space Ambient Occlusion) - Adds realistic contact shadows
        // ONLY for desktop mode (too expensive for standalone VR)
        // Adds depth to corners and contact points for hyperrealism
        // Note: Pass camera in constructor - don't call attachCamerasToRenderPipeline again (causes reuse warnings)
        this.ssaoPipeline = new BABYLON.SSAO2RenderingPipeline("ssao", this.scene, 0.75, this.camera ? [this.camera] : []);
        this.ssaoPipeline.radius = 3.5;
        this.ssaoPipeline.totalStrength = 1.2;
        this.ssaoPipeline.expensiveBlur = true;
        this.ssaoPipeline.samples = 16;
        this.ssaoPipeline.maxZ = 250;
        
        log.info('✨ Enhanced post-processing pipeline initialized (hyperrealistic mode)');
    }

    createFloor() {
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: 35,
            height: 45,
            subdivisions: 20
        }, this.scene);
        floor.position.z = -10;
        
        // CRITICAL: Ensure floor is pickable for laser/spotlight raycasts
        floor.isPickable = true;
        floor.checkCollisions = true; // Enable collisions for gravity/walking
        
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
            width: 25,
            height: 10,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 5, -21);
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
        leftWall.position = new BABYLON.Vector3(-12.5, 5, -10);
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
        rightWall.position = new BABYLON.Vector3(12.5, 5, -10);
        rightWall.material = wallMat;
        rightWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        rightWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        rightWall.doNotSyncBoundingInfo = true;
        
        // Front wall
        const frontWall = BABYLON.MeshBuilder.CreateBox("frontWall", {
            width: 25,
            height: 10,
            depth: 0.5
        }, this.scene);
        frontWall.position = new BABYLON.Vector3(0, 5, 0);
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
            { x: -12.5, z: -5 }, { x: -12.5, z: -15 }, { x: -12.5, z: -21 },
            { x: 12.5, z: -5 }, { x: 12.5, z: -15 }, { x: 12.5, z: -21 }
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
            { x: -12.0, z: -10, width: 1, height: 4 },
            { x: -12.0, z: -20, width: 1, height: 3 },
            { x: 12.0, z: -10, width: 1, height: 4 },
            { x: 12.0, z: -20, width: 1, height: 3 }
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
            { start: { x: -11.5, z: -21 }, end: { x: -11.5, z: 5 } },  // Left wall
            { start: { x: 11.5, z: -21 }, end: { x: 11.5, z: 5 } }     // Right wall
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
        archTop.freezeWorldMatrix();
        
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
            
            // OPTIMIZATION: Freeze rope meshes (static)
            rope.freezeWorldMatrix();
            midRope.freezeWorldMatrix();
        };
        
        // Connect ropes on left queue line
        createVelvetRope(stanchionPositions[0], stanchionPositions[1], "velvetRope_L1");
        createVelvetRope(stanchionPositions[1], stanchionPositions[2], "velvetRope_L2");
        
        // Connect ropes on right queue line
        createVelvetRope(stanchionPositions[3], stanchionPositions[4], "velvetRope_R1");
        createVelvetRope(stanchionPositions[4], stanchionPositions[5], "velvetRope_R2");
        
        // Cross rope at entrance
        createVelvetRope(stanchionPositions[6], stanchionPositions[7], "velvetRope_entrance");
        
        // OPTIMIZATION: Freeze all stanchion components (static entrance decoration)
        stanchions.forEach(s => {
            s.base.freezeWorldMatrix();
            s.post.freezeWorldMatrix();
            s.topBall.freezeWorldMatrix();
            s.hookRing.freezeWorldMatrix();
        });
        
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
            { x: -12.0, y: 3.2, z: -15, rotY: Math.PI/2 } // Side exit (facing in)
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
            signHousing.freezeWorldMatrix(); // OPTIMIZATION: Static
            
            // Glowing EXIT text (simplified as plane)
            const signFace = BABYLON.MeshBuilder.CreatePlane(`exitSign${i}`, {
                width: 0.5, height: 0.18
            }, this.scene);
            signFace.position = new BABYLON.Vector3(pos.x, pos.y, pos.z + (pos.rotY === Math.PI ? -0.05 : 0));
            signFace.position.x += pos.rotY === Math.PI/2 ? 0.05 : 0;
            signFace.rotation.y = pos.rotY;
            signFace.material = exitSignMat;
            signFace.freezeWorldMatrix(); // OPTIMIZATION: Static
        });
        
        // === FIRE EXTINGUISHERS ===
        const fireExtMat = this.materialFactory.getPreset('fireExtinguisher');
        
        const fireExtPositions = [
            { x: -12.0, z: -5 },
            { x: 12.0, z: -15 }
        ];
        
        fireExtPositions.forEach((pos, i) => {
            // Extinguisher body
            const extBody = BABYLON.MeshBuilder.CreateCylinder(`fireExt${i}`, {
                diameter: 0.15, height: 0.45, tessellation: 16
            }, this.scene);
            extBody.position = new BABYLON.Vector3(pos.x, 0.8, pos.z);
            extBody.material = fireExtMat;
            extBody.freezeWorldMatrix(); // OPTIMIZATION: Static
            
            // Valve/handle
            const extHandle = BABYLON.MeshBuilder.CreateBox(`fireExtHandle${i}`, {
                width: 0.12, height: 0.08, depth: 0.05
            }, this.scene);
            extHandle.position = new BABYLON.Vector3(pos.x, 1.08, pos.z);
            extHandle.material = this.materialFactory.getPreset('barStool');
            extHandle.freezeWorldMatrix(); // OPTIMIZATION: Static
            
            // Wall bracket
            const bracket = BABYLON.MeshBuilder.CreateBox(`fireExtBracket${i}`, {
                width: 0.2, height: 0.06, depth: 0.1
            }, this.scene);
            bracket.position = new BABYLON.Vector3(pos.x, 0.7, pos.z);
            bracket.material = this.materialFactory.getPreset('barStool');
            bracket.freezeWorldMatrix(); // OPTIMIZATION: Static
        });
        
        // === SMOKE DETECTORS ===
        const smokeMat = this.materialFactory.getPreset('smokeDetector');
        
        const smokePositions = [
            { x: -8, z: -8 }, { x: 8, z: -8 },
            { x: -8, z: -14 }, { x: 8, z: -14 },
            { x: 0, z: -18 }
        ];
        
        smokePositions.forEach((pos, i) => {
            const detector = BABYLON.MeshBuilder.CreateCylinder(`smokeDetector${i}`, {
                diameter: 0.12, height: 0.04, tessellation: 16
            }, this.scene);
            detector.position = new BABYLON.Vector3(pos.x, 9.8, pos.z);
            detector.material = smokeMat;
            detector.freezeWorldMatrix(); // OPTIMIZATION: Static
            
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
            led.freezeWorldMatrix(); // OPTIMIZATION: Static
        });
        
        // OPTIMIZATION: Freeze all safety equipment materials
        if (exitSignMat.freeze) exitSignMat.freeze();
        if (fireExtMat.freeze) fireExtMat.freeze();
        if (smokeMat.freeze) smokeMat.freeze();
        
        log.info("✅ Created safety details (exit signs, fire extinguishers, smoke detectors) - frozen for performance");
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
        standBase.position = new BABYLON.Vector3(-0.8, 0.84, -17.6);
        standBase.material = this.materialFactory.getPreset('barStool');
        
        const standArm = BABYLON.MeshBuilder.CreateBox("laptopStandArm", {
            width: 0.04, height: 0.15, depth: 0.04
        }, this.scene);
        standArm.position = new BABYLON.Vector3(-0.8, 0.92, -17.65);
        standArm.material = this.materialFactory.getPreset('barStool');
        
        // Laptop base
        const laptopBase = BABYLON.MeshBuilder.CreateBox("laptopBase", {
            width: 0.32, height: 0.015, depth: 0.22
        }, this.scene);
        laptopBase.position = new BABYLON.Vector3(-0.8, 1.02, -17.55);
        laptopBase.rotation.x = -0.2; // Tilted toward DJ
        laptopBase.material = laptopMat;
        
        // Laptop screen
        const laptopScreen = BABYLON.MeshBuilder.CreateBox("laptopScreen", {
            width: 0.3, height: 0.2, depth: 0.008
        }, this.scene);
        laptopScreen.position = new BABYLON.Vector3(-0.8, 1.18, -17.64);
        laptopScreen.rotation.x = -0.5;
        laptopScreen.material = laptopMat;
        
        // Screen display (glowing)
        const screenDisplay = BABYLON.MeshBuilder.CreatePlane("laptopDisplay", {
            width: 0.28, height: 0.18
        }, this.scene);
        screenDisplay.position = new BABYLON.Vector3(-0.8, 1.18, -17.635);
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
        headphoneBand.position = new BABYLON.Vector3(0.6, 0.98, -16.7);
        headphoneBand.rotation.z = Math.PI;
        headphoneBand.rotation.y = 0.3;
        headphoneBand.material = headphoneBandMat;
        
        // Left ear cup
        const leftCup = BABYLON.MeshBuilder.CreateCylinder("headphoneLeftCup", {
            diameter: 0.1, height: 0.05, tessellation: 16
        }, this.scene);
        leftCup.position = new BABYLON.Vector3(0.5, 0.94, -16.68);
        leftCup.rotation.z = Math.PI / 2;
        leftCup.material = headphoneCupMat;
        
        // Right ear cup
        const rightCup = BABYLON.MeshBuilder.CreateCylinder("headphoneRightCup", {
            diameter: 0.1, height: 0.05, tessellation: 16
        }, this.scene);
        rightCup.position = new BABYLON.Vector3(0.7, 0.94, -16.72);
        rightCup.rotation.z = Math.PI / 2;
        rightCup.material = headphoneCupMat;
        
        // Cushion pads
        const cushionMat = this.materialFactory.getPreset('stoolCushion');
        const leftPad = BABYLON.MeshBuilder.CreateCylinder("headphoneLeftPad", {
            diameter: 0.09, height: 0.02, tessellation: 16
        }, this.scene);
        leftPad.position = new BABYLON.Vector3(0.47, 0.94, -16.68);
        leftPad.rotation.z = Math.PI / 2;
        leftPad.material = cushionMat;
        
        const rightPad = BABYLON.MeshBuilder.CreateCylinder("headphoneRightPad", {
            diameter: 0.09, height: 0.02, tessellation: 16
        }, this.scene);
        rightPad.position = new BABYLON.Vector3(0.73, 0.94, -16.72);
        rightPad.rotation.z = Math.PI / 2;
        rightPad.material = cushionMat;
        
        // === CABLE MANAGEMENT (under table) ===
        const cableMat = this.materialFactory.getPreset('cableRubber');
        
        // Main cable bundle running under DJ table
        const cableBundle = BABYLON.MeshBuilder.CreateCylinder("cableBundle", {
            diameter: 0.06, height: 4.5, tessellation: 8
        }, this.scene);
        cableBundle.position = new BABYLON.Vector3(0, 0.7, -17.5);
        cableBundle.rotation.z = Math.PI / 2;
        cableBundle.material = cableMat;
        
        // Vertical cable drops
        const cableDrops = [-1.5, 0, 1.5]; // Under each CDJ and mixer
        cableDrops.forEach((x, i) => {
            const drop = BABYLON.MeshBuilder.CreateCylinder(`cableDrop${i}`, {
                diameter: 0.025, height: 0.4, tessellation: 8
            }, this.scene);
            drop.position = new BABYLON.Vector3(x, 0.5, -17.5);
            drop.material = cableMat;
        });
        
        // === USB STICK IN CDJ (left deck) ===
        const usbStick = BABYLON.MeshBuilder.CreateBox("usbStick", {
            width: 0.02, height: 0.008, depth: 0.04
        }, this.scene);
        usbStick.position = new BABYLON.Vector3(-1.1, 0.9, -16.65);
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
        
        // OPTIMIZATION: Freeze static DJ booth accessories (never move)
        standBase.freezeWorldMatrix();
        standArm.freezeWorldMatrix();
        laptopBase.freezeWorldMatrix();
        laptopScreen.freezeWorldMatrix();
        screenDisplay.freezeWorldMatrix();
        headphoneBand.freezeWorldMatrix();
        leftCup.freezeWorldMatrix();
        rightCup.freezeWorldMatrix();
        leftPad.freezeWorldMatrix();
        rightPad.freezeWorldMatrix();
        cableBundle.freezeWorldMatrix();
        usbStick.freezeWorldMatrix();
        usbLED.freezeWorldMatrix();
        cableDrops.forEach((x, i) => {
            const drop = this.scene.getMeshByName(`cableDrop${i}`);
            if (drop) drop.freezeWorldMatrix();
        });
        
        // Freeze materials too
        [standBase, standArm, laptopBase, laptopScreen, headphoneBand, leftCup, rightCup, 
         leftPad, rightPad, cableBundle, usbStick].forEach(mesh => {
            if (mesh.material && mesh.material.freeze) mesh.material.freeze();
        });
        
        log.info("✅ Created DJ booth accessories (laptop, headphones, cables) - frozen for performance");
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
            
            // PA Speaker protection (left stack)
            { width: 3, height: 6, depth: 2, 
              pos: new BABYLON.Vector3(-7, 3, -19) },
            // PA Speaker protection (right stack)
            { width: 3, height: 6, depth: 2, 
              pos: new BABYLON.Vector3(7, 3, -19) }
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
        // Positioned at BACK of club (z=-18)
        // DJ faces DANCE FLOOR (toward positive z direction)
        
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
        platformTop.position = new BABYLON.Vector3(0, 0.51, -21);
        
        const topMat = this.materialFactory.getPreset('platformTop');
        platformTop.material = topMat;
        platformTop.receiveShadows = true;
        platformTop.checkCollisions = true; // Enable collisions for walking
        platformTop.freezeWorldMatrix(); // OPTIMIZATION: Freeze static platform top
        platformTop.doNotSyncBoundingInfo = true;
        
        // Front safety rail
        const railMat = this.materialFactory.getPreset('rail');
        
        const frontRail = BABYLON.MeshBuilder.CreateBox("frontRail", {
            width: 5,
            height: 0.08,
            depth: 0.08
        }, this.scene);
        frontRail.position = new BABYLON.Vector3(0, 0.8, -19);
        frontRail.material = railMat;
        
        // === DJ EQUIPMENT TABLE (CENTER) ===
        const djTable = BABYLON.MeshBuilder.CreateBox("djTable", {
            width: 4,
            height: 0.08,
            depth: 1.5
        }, this.scene);
        djTable.position = new BABYLON.Vector3(0, 0.8, -20);
        
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
        leftCDJ.position = new BABYLON.Vector3(-1.5, 0.89, -20);
        leftCDJ.material = cdjMat;
        
        // Left jog wheel (glowing)
        const leftJog = BABYLON.MeshBuilder.CreateCylinder("leftJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        leftJog.position = new BABYLON.Vector3(-1.5, 0.96, -20);
        const jogMat = this.materialFactory.getPreset('jogWheel');
        leftJog.material = jogMat;
        
        // Right CDJ
        const rightCDJ = BABYLON.MeshBuilder.CreateBox("rightCDJ", {
            width: 1.2,
            height: 0.1,
            depth: 1.0
        }, this.scene);
        rightCDJ.position = new BABYLON.Vector3(1.5, 0.89, -20);
        rightCDJ.material = cdjMat;
        
        // Right jog wheel
        const rightJog = BABYLON.MeshBuilder.CreateCylinder("rightJog", {
            diameter: 0.5,
            height: 0.04
        }, this.scene);
        rightJog.position = new BABYLON.Vector3(1.5, 0.96, -20);
        rightJog.material = jogMat.clone("rightJogMat");
        
        // === DJ MIXER (CENTER) ===
        const mixer = BABYLON.MeshBuilder.CreateBox("mixer", {
            width: 1.8,
            height: 0.12,
            depth: 0.9
        }, this.scene);
        mixer.position = new BABYLON.Vector3(0, 0.89, -20);
        mixer.material = cdjMat; // Reuse CDJ material for mixer body
        
        // Mixer display (facing DJ)
        const mixerDisplay = BABYLON.MeshBuilder.CreatePlane("mixerDisplay", {
            width: 1.2,
            height: 0.2
        }, this.scene);
        mixerDisplay.position = new BABYLON.Vector3(0, 0.98, -20.5);
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
        audioBtn.position = new BABYLON.Vector3(0, 0.96, -19.5);
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
        vjConsole.position = new BABYLON.Vector3(3.5, 0.8, -21.4); // Moved back to center
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
            // Row 1: z=-26.7, Row 2: z=-27.5, Row 3: z=-28.3
            let zPos = -26.7; // Row 1 (default)
            if (btnDef.row2) zPos = -27.5; // Row 2
            if (btnDef.row3) zPos = -28.3; // Row 3
            
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
        const sliderZ = -28.3; // Row 3
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
        // Back wall is 25m wide × 10m tall at Z=-27
        const panelWidth = 1.2;
        const panelHeight = 1.0; // Slightly smaller for more rows
        const cols = 21;  // 21 × 1.2 = 25.2m (fills 25m wall completely)
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
                const z = -20; // Behind DJ booth
                
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
        consoleBase.position = new BABYLON.Vector3(2.0, 0.8, -24);
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
        const startX = 1.2;
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
            { x: -8, z: -8 },   // Left on truss1 (front) - Moved closer to dancefloor
            { x: -8, z: -12 },  // Left on truss2 (middle)
            { x: -8, z: -16 },  // Left on truss3 (back) - Moved closer to dancefloor
            { x: 8, z: -8 },    // Right on truss1 (front) - Moved closer to dancefloor
            { x: 8, z: -12 },   // Right on truss2 (middle)
            { x: 8, z: -16 }    // Right on truss3 (back) - Moved closer to dancefloor
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
            
            // DISABLED: Strobe PointLights caused shader uniform buffer overflow
            // WebGL2 PBR materials have strict uniform buffer limits (~12)
            // With 6 spotlights + ambient + LED + strobes = too many lights
            // Visual strobe effect still works via emissive mesh materials
            const strobeLight = null; // Disabled - strobe visual only via emissive mesh
            
            this.strobes.push({ 
                mesh: strobe, 
                material: strobeMat,
                light: strobeLight, // null - visual-only strobe
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
            { x: 0, z: -8, trussY: 7.55, type: 'multi' },    // Multi-beam center (main truss) - Moved to farthest truss from DJ
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
            // DISABLED: Laser SpotLights caused shader uniform buffer overflow
            // 3 multi-beam lasers × 5 lights each = 15 SpotLights, way over limit
            // Visual laser beams still work via emissive cylinder meshes
            const lights = []; // Empty - no actual lights, visual-only beams
            
            if (pos.type === 'single') {
                // Single beam laser
                const beam = this.createLaserBeam(i, 0, pos);
                beams.push(beam);
                // No light - visual beam only
                
            } else if (pos.type === 'spread') {
                // Spread laser (3 beams fanning out)
                for (let j = -1; j <= 1; j++) {
                    const beam = this.createLaserBeam(i, j, pos);
                    beams.push(beam);
                    // No light - visual beam only
                }
                
            } else if (pos.type === 'multi') {
                // Multi-beam laser (5 rotating beams in circle)
                for (let j = 0; j < 5; j++) {
                    const beam = this.createLaserBeam(i, j, pos);
                    beams.push(beam);
                    // No light - visual beam only
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
        // (The switch statement only handles transitions, not initial state)
        this.lightsActive = true;       // Spotlights on
        this.lasersActive = true;       // Ceiling lasers on
        this.mirrorBallActive = false;
        this.strobesActive = true;      // Strobes ENABLED for immediate impact
        this.blindersActive = true;     // Blinders pulsing
        this.laserSheetActive = false;
        this.smokeActive = true;        // Haze for beam visibility
        
        this.spotlightPattern = 0;      // Automated movement patterns
        this.spotlightMode = 0;         // Strobe + sweep
        this.spotlightSpeed = 1.2;
        this.laserSpeed = 1.0;
        this.ledWallSpeed = 1.2;
        this.blinderSpeed = 0.8;
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
        
        // Hit spots removed - cleaner laser look without floor reflections
        
        return { 
            mesh: beam, 
            material: beamMat,
            innerGlow: innerGlow,
            innerGlowMat: innerGlowMat,
            beamGlow: outerGlow,  // Keep name for compatibility
            glowMat: outerGlowMat,
            hitSpot: null,        // No longer created
            hitSpotMat: null,
            hitGlow: null,
            hitGlowMat: null,
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
                diameterTop: 1.5,      // Wide end at floor - 1.5m diameter for realistic spotlight
                diameterBottom: 0.2,   // Narrow end at fixture - 0.2m (roughly 8 inch lens)
                height: 1,             // Will be scaled to actual beam length
                tessellation: 8,       // OPTIMIZED: Reduced from 16 (sufficient for VR)
                cap: BABYLON.Mesh.NO_CAP
            }, this.scene);
            
            // HYPERREALISTIC: Beam positioned in WORLD SPACE (not parented to head)
            // This ensures beam visually connects from fixture lens to floor pool
            // Position will be set dynamically in animation loop
            beam.position = new BABYLON.Vector3(pos.x, 4, pos.z); // Initial position (will be updated)
            beam.rotationQuaternion = BABYLON.Quaternion.Identity(); // Use quaternion for proper world-space rotation
            
            beam.isPickable = false;
            
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

            
            // HYPERREALISTIC LIGHT POOL - Soft radial gradient for realistic light hitting floor
            // Real spotlight pools have bright centers that fade smoothly to soft edges
            
            // Create radial gradient texture for soft falloff (reuse across all pools)
            if (!this._poolGradientTexture) {
                const gradientSize = 128;
                const gradientCanvas = document.createElement('canvas');
                gradientCanvas.width = gradientSize;
                gradientCanvas.height = gradientSize;
                const ctx = gradientCanvas.getContext('2d');
                
                // Create radial gradient: bright center -> transparent edges
                const gradient = ctx.createRadialGradient(
                    gradientSize/2, gradientSize/2, 0,           // Inner circle (center)
                    gradientSize/2, gradientSize/2, gradientSize/2  // Outer circle (edge)
                );
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');    // Bright center
                gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');  // Still bright
                gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.4)');  // Fading
                gradient.addColorStop(0.8, 'rgba(255, 255, 255, 0.1)');  // Very soft
                gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');  // Fully transparent edge
                
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, gradientSize, gradientSize);
                
                this._poolGradientTexture = new BABYLON.DynamicTexture("poolGradient", gradientCanvas, this.scene, false);
                this._poolGradientTexture.hasAlpha = true;
                this._poolGradientTexture.update();
            }
            
            // Main light pool with soft gradient
            const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + i, {
                radius: 0.5, 
                tessellation: 32
            }, this.scene);
            lightPool.rotation.x = Math.PI / 2;
            lightPool.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
            lightPool.isPickable = false;
            
            // Material with radial gradient for soft edges
            const poolMat = new BABYLON.StandardMaterial("poolMat" + i, this.scene);
            poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolMat.specularColor = new BABYLON.Color3(0, 0, 0);
            poolMat.emissiveColor = this.currentSpotColor.clone();
            poolMat.opacityTexture = this._poolGradientTexture; // Use gradient for soft edges
            poolMat.alpha = 0.6; // Lower alpha for more subtle, realistic light
            poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light effect
            poolMat.disableLighting = true;
            poolMat.backFaceCulling = false;
            lightPool.material = poolMat;
            lightPool.renderingGroupId = 1;
            
            // Store reference for gobo texture (null - not using procedural texture anymore)
            const goboTexture = null;
            
            // HYPERREALISTIC SOFT OUTER GLOW - Very soft ambient light spread
            // Creates the "light spill" effect around the main pool
            const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + i, {
                radius: 0.5,
                tessellation: 32
            }, this.scene);
            lightPoolGlow.rotation.x = Math.PI / 2;
            lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.01, pos.z - 5); // Just above floor
            lightPoolGlow.isPickable = false;
            
            // Very soft glow with same gradient texture
            const poolGlowMat = new BABYLON.StandardMaterial("poolGlowMat" + i, this.scene);
            poolGlowMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolGlowMat.emissiveColor = this.currentSpotColor.scale(0.5);
            poolGlowMat.opacityTexture = this._poolGradientTexture; // Same soft gradient
            poolGlowMat.alpha = 0.25; // Very subtle ambient glow
            poolGlowMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            poolGlowMat.disableLighting = true;
            poolGlowMat.backFaceCulling = false;
            lightPoolGlow.material = poolGlowMat;
            lightPoolGlow.renderingGroupId = 1;
            
            // Core layer removed for performance - using main pool + glow ring only
            const lightPoolCore = null;
            const poolCoreMat = null;
            
            // === HYPERREALISTIC POOL LIGHT ===
            // DISABLED: Pool lights (PointLights) caused shader uniform buffer overflow
            // With 6 spotlights + 6 pool lights + ambient + LED = 14+ lights
            // WebGL2 only supports ~12 uniform buffers for PBR materials
            // The visual pool meshes still create the light pool effect on the floor
            // Real illumination comes from the SpotLights which are more efficient
            const poolLight = null; // Disabled for performance - was causing shader compilation errors
            
            // PERFORMANCE: Shadows and pool lights disabled for better FPS
            
            this.spotlights.push({
                light: spot,
                beam: beam,
                beamMat: beamMat,
                beamGlow: beamGlow,
                beamGlowMat: beamGlowMat,
                lightPool: lightPool,
                poolMat: poolMat,
                poolLight: poolLight, // NEW: Actual light for surface illumination
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

    // Blinders removed - strobes provide sufficient impact lighting

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
        
        // 4. Light Source (Actual light projection) - DISABLED for performance
        // DISABLED: Laser sheet SpotLight adds to uniform buffer count
        // Visual effect from emissive laser sheet mesh is sufficient
        this.laserLight = null; // Disabled - visual sheet provides the effect
        
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
        
        // === OUTGOING RAYS FROM MIRROR BALL (Hyperrealistic all-direction light rays) ===
        // These are the visible light rays emanating FROM the ball in all directions
        // Real disco balls reflect light to ceiling, walls, floor - creating a sphere of rays
        this.mirrorBallOutgoingRays = [];
        const numRays = 40; // Reduced from 80 for VR performance
        
        for (let i = 0; i < numRays; i++) {
            // Distribute rays evenly using golden angle spiral on a sphere
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
            const theta = goldenAngle * i;
            const phi = Math.acos(1 - 2 * (i + 0.5) / numRays); // Uniform sphere distribution
            
            // Calculate ray direction in spherical coordinates
            const dirX = Math.sin(phi) * Math.cos(theta);
            const dirY = Math.cos(phi); // Goes up AND down
            const dirZ = Math.sin(phi) * Math.sin(theta);
            
            // Vary ray length (6-15m) for natural look
            const rayLength = 6 + Math.random() * 9;
            
            // Create ray cylinder from ball position
            const ray = BABYLON.MeshBuilder.CreateCylinder(`mirrorOutgoingRay${i}`, {
                diameterTop: 0.015,   // Very thin at ball (light source point)
                diameterBottom: 0.08, // Slightly wider at end (light spread)
                height: rayLength,
                tessellation: 4
            }, this.scene);
            
            // Position at ball and orient along direction
            ray.position = ballPosition.clone();
            
            // Calculate rotation to point along direction
            // Cylinder default is Y-up, so we need to rotate it to point along our direction
            const up = new BABYLON.Vector3(0, 1, 0);
            const dir = new BABYLON.Vector3(dirX, dirY, dirZ);
            
            // Create rotation from default up to desired direction
            const angle = Math.acos(BABYLON.Vector3.Dot(up, dir));
            const axis = BABYLON.Vector3.Cross(up, dir);
            if (axis.length() > 0.001) {
                ray.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);
            }
            
            // Offset position so ray starts at ball surface, not center
            ray.position = ballPosition.add(dir.scale(rayLength / 2 + 0.6)); // 0.6m = ball radius
            
            // Ray material - bright, glowing
            const rayMat = new BABYLON.StandardMaterial(`mirrorRayMat${i}`, this.scene);
            rayMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
            rayMat.alpha = 0.12 + Math.random() * 0.08; // Varied transparency (0.12-0.20)
            rayMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            rayMat.disableLighting = true;
            rayMat.backFaceCulling = false;
            ray.material = rayMat;
            ray.isPickable = false;
            ray.setEnabled(false); // Starts disabled
            
            this.mirrorBallOutgoingRays.push({
                mesh: ray,
                material: rayMat,
                theta: theta,
                phi: phi,
                length: rayLength,
                direction: dir.clone(),
                rotationSpeed: 0.3 + Math.random() * 0.4 // Individual rotation speeds
            });
        }
        
        log.info(`✨ Created ${numRays} outgoing rays from mirror ball (all directions)`);
        
        // === REFLECTION SPOTS (Simulated light spots from mirror facets) ===
        // VISUAL ONLY - No actual PointLights to stay within GPU uniform buffer limits
        // These are purely emissive meshes that create the illusion of reflections
        this.mirrorReflectionSpots = [];
        const numSpots = 100; // Reduced from 300 for VR performance
        
        // PRE-DISTRIBUTE spots across surfaces for guaranteed even coverage
        // Weight distribution to emphasize walls and ceiling (more visible in VR)
        const floorSpots = Math.floor(numSpots * 0.20);     // 20% on floor
        const ceilingSpots = Math.floor(numSpots * 0.20);   // 20% on ceiling
        const wallSpots = Math.floor(numSpots * 0.15);      // 15% per wall (4 walls = 60%)
        let spotIndex = 0;
        
        // No shared texture - using simple colored discs for performance and correct color updates
        
        const surfaces = [
            { name: 'floor', axis: 'xz', fixed: 'y', value: 0.02, count: floorSpots },
            { name: 'ceiling', axis: 'xz', fixed: 'y', value: 9.83, count: ceilingSpots },
            { name: 'leftWall', axis: 'yz', fixed: 'x', value: -16.73, count: wallSpots },
            { name: 'rightWall', axis: 'yz', fixed: 'x', value: 16.73, count: wallSpots },
            { name: 'backWall', axis: 'xy', fixed: 'z', value: -26.73, count: wallSpots },
            { name: 'frontWall', axis: 'xy', fixed: 'z', value: 1.77, count: wallSpots }
        ];
        
        surfaces.forEach(surface => {
            for (let i = 0; i < surface.count; i++, spotIndex++) {
                // Visual spot (emissive disc - looks like light reflection)
                const spot = BABYLON.MeshBuilder.CreateDisc(`mirrorSpot${spotIndex}`, {
                    radius: 0.12 + Math.random() * 0.12, // Size: 0.12-0.24m 
                    tessellation: 8
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
                // Thin cylinder stretching from ball to spot - HYPERREALISTIC light rays
                const beam = BABYLON.MeshBuilder.CreateCylinder(`mirrorBeam${spotIndex}`, {
                    diameterTop: 0.03,    // Thin at ball (light source)
                    diameterBottom: 0.25, // Wider at spot (light spread)
                    height: 1.0,          // Initial height (will be scaled)
                    tessellation: 4       // Low poly for performance (hundreds of beams)
                }, this.scene);
                
                // Pivot at top (ball position) so we can scale length easily
                beam.setPivotPoint(new BABYLON.Vector3(0, 0.5, 0)); 
                
                const beamMat = new BABYLON.StandardMaterial(`mirrorBeamMat${spotIndex}`, this.scene);
                beamMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                beamMat.alpha = 0.2; // Visible smoke beams
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
            
            // === ANIMATE OUTGOING RAYS FROM MIRROR BALL ===
            // These rays rotate WITH the ball and raycast to surfaces for realistic termination
            if (this.mirrorBallOutgoingRays && this.mirrorBallOutgoingRays.length > 0) {
                const ballPos = this.mirrorBall.position;
                const speedMultiplier = this.mirrorBallSpeed || 1.0;
                
                // Reuse ray object for performance
                if (!this.mirrorOutgoingRay) {
                    this.mirrorOutgoingRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), BABYLON.Vector3.Zero(), 40);
                    this.mirrorOutgoingRayPredicate = (mesh) => {
                        return mesh.isPickable && 
                               !mesh.name.includes('mirror') && 
                               !mesh.name.includes('Ray') &&
                               !mesh.name.includes('spot') &&
                               !mesh.name.includes('laser');
                    };
                }
                
                // Only update ray lengths every 6th frame on desktop (expensive raycasts)
                // In VR update every 2nd frame for better sync
                const shouldUpdateRayLengths = this.isInVRMode ? 
                    (this.frameCounter % 2 === 0) : 
                    (this.frameCounter % 6 === 0);
                
                this.mirrorBallOutgoingRays.forEach((ray, i) => {
                    ray.mesh.setEnabled(true);
                    
                    // Rotate ray direction with the mirror ball (around Y axis)
                    const rotatedTheta = ray.theta + this.mirrorBallRotation;
                    
                    // Calculate new direction based on rotated angle
                    const sinPhi = Math.sin(ray.phi);
                    const dirX = sinPhi * Math.cos(rotatedTheta);
                    const dirY = Math.cos(ray.phi);
                    const dirZ = sinPhi * Math.sin(rotatedTheta);
                    const dir = new BABYLON.Vector3(dirX, dirY, dirZ);
                    
                    // Raycast to find actual surface hit (staggered for performance)
                    let actualLength = ray.length; // Default to stored length
                    if (shouldUpdateRayLengths && (i % 8 === this.frameCounter % 8)) {
                        // Raycast from ball surface outward
                        const rayStart = ballPos.add(dir.scale(0.6)); // Start at ball surface
                        this.mirrorOutgoingRay.origin.copyFrom(rayStart);
                        this.mirrorOutgoingRay.direction.copyFrom(dir);
                        
                        const hit = this.scene.pickWithRay(this.mirrorOutgoingRay, this.mirrorOutgoingRayPredicate);
                        if (hit && hit.hit && hit.pickedPoint) {
                            actualLength = hit.distance;
                            ray.currentLength = actualLength; // Cache for smooth interpolation
                        }
                    }
                    
                    // Use cached length with smooth interpolation
                    const targetLength = ray.currentLength || ray.length;
                    ray.displayLength = ray.displayLength || ray.length;
                    ray.displayLength += (targetLength - ray.displayLength) * 0.1; // Smooth
                    
                    // Update mesh scale to match actual ray length
                    const scaleRatio = ray.displayLength / ray.length;
                    ray.mesh.scaling.y = scaleRatio;
                    
                    // Position ray starting from ball surface
                    ray.mesh.position = ballPos.add(dir.scale(ray.displayLength / 2 + 0.6));
                    
                    // Rotate ray to point along direction
                    const up = new BABYLON.Vector3(0, 1, 0);
                    const angle = Math.acos(BABYLON.Vector3.Dot(up, dir));
                    const axis = BABYLON.Vector3.Cross(up, dir);
                    if (axis.length() > 0.001) {
                        ray.mesh.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);
                    }
                    
                    // Twinkling effect - subtle alpha variation
                    const twinkle = 0.8 + 0.2 * Math.sin(time * 5 + i * 0.7);
                    ray.material.alpha = (0.12 + (i % 5) * 0.02) * twinkle;
                    
                    // Update ray color to match current mirror ball color
                    ray.material.emissiveColor = this.mirrorBallSpotlightColor;
                });
            }
            
            // Animate reflection spots around the room (150 spots covering all surfaces)
            // SYNCHRONIZED FRAME-SKIP OPTIMIZATION: Update ALL spots every 3 frames
            // This eliminates "catch-up" effect while maintaining 60fps performance
            if (this.mirrorReflectionSpots && this.mirrorReflectionSpots.length > 0) {
                const ballPos = this.mirrorBall.position; // Ball at (0, 6.5, -12)
                
                // FRAME-SKIP STRATEGY: Update every frame in VR (stereo sync), every 3rd frame on desktop
                // Frame-skipping in VR causes different states per eye = epileptic effect
                this.spotUpdateFrameCounter = (this.spotUpdateFrameCounter || 0) + 1;
                const shouldUpdate = this.isInVRMode ? true : (this.spotUpdateFrameCounter % 3 === 0);
                
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
                    // SYNC FIX: Use same rotation direction as outgoing rays (+ not -)
                    const rotatedTheta = spot.theta + this.mirrorBallRotation; // Match outgoing ray rotation direction
                    
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
                        spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(Math.max(0.5, brightness));
                        spot.material.alpha = 0.9; // More visible spot

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
                            
                            // HYPERREALISTIC: Brighter beams for all directions
                            // Beams hitting walls/ceiling should be as visible as floor beams
                            spot.beamMaterial.alpha = 0.18 * distanceFade; // Increased from 0.08
                            spot.beamMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(0.8);
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
            if (this.mirrorBallOutgoingRays) {
                this.mirrorBallOutgoingRays.forEach(ray => ray.mesh.setEnabled(false));
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
        // Designed by a world-class VJ with experience at Berghain, Fabric, Amnesia, and Output
        // Philosophy: Build tension → Release → Create moments → Repeat
        // Each phase tells a story with the lights
        if (!this.vjManualMode) {
            const currentPhaseDuration = this.phaseDurations[this.lightingPhase];
            
            // Smoothly interpolate energy level toward target
            const energySpeed = 0.005; // Faster for more dynamic feel
            this.energyLevel += (this.targetEnergy - this.energyLevel) * energySpeed;
            
            // === IMMERSIVE BEAT-SYNCED MICRO-DYNAMICS ===
            // Real VJ: constant subtle adjustments, never static
            const bpm = this.bpm || 128;
            const beatTime = 60 / bpm;
            this.syncedBeatPhase = (time % beatTime) / beatTime; // 0-1 per beat
            
            // Breathing effect synced to 4-beat bars
            const barPhase = (time % (beatTime * 4)) / (beatTime * 4);
            const microPulse = Math.sin(barPhase * Math.PI * 2) * 0.15;
            
            // Sharp beat pulse (peaks on each beat)
            const beatPulse = Math.pow(1 - this.syncedBeatPhase, 3) * 0.2;
            
            // Crowd focus: spotlights occasionally converge on dance floor center
            this.crowdFocusIntensity = Math.sin(time * 0.1) * 0.5 + 0.5;
            
            if (time - this.lightModeSwitchTime > currentPhaseDuration) {
                // === IMMERSIVE 12-PHASE SHOW CYCLE ===
                // Professional animation sequence designed for maximum crowd immersion
                switch(this.lightingPhase) {
                    case 'intro':
                        // INTRO → BUILD: Tease the crowd, slow reveal
                        this.lightingPhase = 'build';
                        this.targetEnergy = 0.5;
                        
                        // Moving heads sweep slowly, creating anticipation
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true; // Haze for beam visibility
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1; // Sweep only (no strobe)
                        this.spotlightSpeed = 0.6; // Slow, hypnotic
                        this.laserSpeed = 0.5;
                        this.ledWallSpeed = 0.7;
                        this.currentShowMode = 'spotlights';
                        log.info('🎭 BUILD: Tension rising - Slow sweeping beams');
                        break;
                        
                    case 'build':
                        // BUILD → TENSION: Increase intensity, add lasers
                        this.lightingPhase = 'tension';
                        this.targetEnergy = 0.75;
                        
                        // Add ceiling lasers, faster movement
                        this.lightsActive = true;
                        this.lasersActive = true; // Ceiling lasers join
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = true; // Blinders start pulsing
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 0; // Strobe + sweep
                        this.spotlightSpeed = 1.2;
                        this.laserSpeed = 1.0;
                        this.ledWallSpeed = 1.2;
                        this.blinderSpeed = 0.8;
                        this.currentShowMode = 'spotlights';
                        log.info('⚡ TENSION: Energy building - Lasers join the party');
                        break;
                        
                    case 'tension':
                        // TENSION → DROP: THE BIG MOMENT - Everything explodes!
                        this.lightingPhase = 'drop';
                        this.targetEnergy = 1.0;
                        this.vjDropActive = true; // Trigger drop effects
                        this.vjDropTimer = time;
                        
                        // MAXIMUM CHAOS - Laser sheet + strobes + blinders
                        this.lightsActive = false; // Gobos off for laser sheet
                        this.lasersActive = false; // Ceiling lasers off
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // STROBES FIRE
                        this.blindersActive = true; // BLINDERS FIRE
                        // this.laserSheetActive = true; // LASER SHEET DISABLED
                        this.smokeActive = true; // Maximum haze
                        
                        this.spotlightSpeed = 2.5; // FAST
                        this.laserSpeed = 2.0;
                        this.ledWallSpeed = 2.5; // LED wall goes crazy
                        this.strobeSpeed = 2.0; // Rapid strobes
                        this.blinderSpeed = 2.0; // Blinders punching
                        this.currentShowMode = 'laserSheet';
                        log.info('💥 DROP: MAXIMUM IMPACT - All systems firing!');
                        break;
                        
                    case 'drop':
                        // DROP → PEAK: Sustain the energy, controlled chaos
                        this.lightingPhase = 'peak';
                        this.targetEnergy = 0.95;
                        this.vjDropActive = false;
                        
                        // High energy but slightly more controlled
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // Keep strobes
                        this.blindersActive = true; // Keep blinders
                        // this.laserSheetActive = true; // LASER SHEET DISABLED
                        this.smokeActive = true;
                        
                        this.spotlightSpeed = 1.8;
                        this.laserSpeed = 1.5;
                        this.ledWallSpeed = 1.8;
                        this.strobeSpeed = 1.5;
                        this.blinderSpeed = 1.2;
                        this.currentShowMode = 'laserSheet';
                        log.info('🔥 PEAK: Riding the wave - Sustained high energy');
                        break;
                        
                    case 'peak':
                        // PEAK → BREAKDOWN: Sudden cut - create contrast
                        this.lightingPhase = 'breakdown';
                        this.targetEnergy = 0.2; // DRAMATIC DROP in energy
                        
                        // EVERYTHING OFF except mirror ball - disco moment!
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = true; // THE DISCO BALL MOMENT
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = false; // Clear air for reflections
                        
                        this.mirrorBallSpeed = 0.4; // Slow, romantic
                        this.ledWallSpeed = 0.3; // LED wall very slow
                        this.currentShowMode = 'mirror';
                        log.info('🪩 BREAKDOWN: Disco moment - Mirror ball takes over');
                        break;
                        
                    case 'breakdown':
                        // BREAKDOWN → ATMOSPHERIC: Dreamy transition
                        this.lightingPhase = 'atmospheric';
                        this.targetEnergy = 0.35;
                        
                        // Mirror ball + slow spotlights = ethereal
                        this.lightsActive = true; // Spotlights back
                        this.lasersActive = false;
                        this.mirrorBallActive = true; // Keep mirror ball
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true; // Light haze
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.4; // Very slow
                        this.mirrorBallSpeed = 0.5;
                        this.ledWallSpeed = 0.4;
                        this.currentShowMode = 'mixed';
                        log.info('✨ ATMOSPHERIC: Dreamy transition - Beams + reflections');
                        break;
                        
                    case 'atmospheric':
                        // ATMOSPHERIC → LASER TUNNEL: Immersive laser experience
                        this.lightingPhase = 'laser_tunnel';
                        this.targetEnergy = 0.7;
                        
                        // ALL lasers converge toward dance floor - tunnel effect
                        this.lightsActive = false;
                        this.lasersActive = true;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        // this.laserSheetActive = true; // LASER SHEET DISABLED
                        this.smokeActive = true; // Maximum haze for beam visibility
                        
                        this.laserSpeed = 0.3; // Very slow rotation
                        this.laserFanAngle = 0.2; // Narrow fan - beams converge
                        this.ledWallSpeed = 0.5;
                        this.currentShowMode = 'lasers';
                        log.info('🌀 LASER TUNNEL: Immersive laser cocoon around dancers');
                        break;
                        
                    case 'laser_tunnel':
                        // LASER TUNNEL → GROOVE: Transition to hypnotic groove
                        this.lightingPhase = 'groove';
                        this.targetEnergy = 0.6;
                        
                        // Spotlights + ceiling lasers = hypnotic groove
                        this.lightsActive = true;
                        this.lasersActive = true; // Slow lasers
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.8;
                        this.laserSpeed = 0.6; // Slow lasers
                        this.laserFanAngle = 0.5; // Normal spread
                        this.ledWallSpeed = 0.8;
                        this.currentShowMode = 'spotlights';
                        log.info('🎵 GROOVE: Finding the pocket - Hypnotic patterns');
                        break;
                        
                    case 'groove':
                        // GROOVE → EUPHORIA: Pure bliss moment - everything harmonizes
                        this.lightingPhase = 'euphoria';
                        this.targetEnergy = 0.85;
                        
                        // Everything on but gentle - synchronized beauty
                        this.lightsActive = true;
                        this.lasersActive = true;
                        this.mirrorBallActive = true;
                        this.strobesActive = false; // No strobes - pure vibes
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0;
                        this.spotlightMode = 1; // Sweep only - elegant
                        this.spotlightSpeed = 1.0;
                        this.laserSpeed = 0.8;
                        this.mirrorBallSpeed = 0.6;
                        this.ledWallSpeed = 1.0;
                        this.currentShowMode = 'euphoria';
                        log.info('💫 EUPHORIA: Pure bliss - Everything harmonizes');
                        break;
                        
                    case 'euphoria':
                        // EUPHORIA → DARKNESS: Dramatic blackout for contrast
                        this.lightingPhase = 'darkness';
                        this.targetEnergy = 0.05; // Near-blackout
                        
                        // EVERYTHING OFF - total darkness except minimal LED
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = false;
                        
                        this.ledWallSpeed = 0.1; // LED wall very dim, slow pulse
                        this.currentShowMode = 'darkness';
                        log.info('🌑 DARKNESS: Dramatic blackout - anticipation builds');
                        break;
                        
                    case 'darkness':
                        // DARKNESS → STROBE ATTACK: Explosive return!
                        this.lightingPhase = 'strobe_attack';
                        this.targetEnergy = 1.0; // MAXIMUM
                        
                        // STROBES + BLINDERS - sensory overload
                        this.lightsActive = false;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = true; // FULL STROBES
                        this.blindersActive = true; // BLINDERS PUNCH
                        // this.laserSheetActive = true; // LASER SHEET DISABLED
                        this.smokeActive = true;
                        
                        this.strobeSpeed = 3.0; // VERY FAST
                        this.blinderSpeed = 2.5;
                        this.ledWallSpeed = 3.0; // LED goes crazy
                        this.currentShowMode = 'strobe_attack';
                        log.info('⚡ STROBE ATTACK: Explosive return from darkness!');
                        break;
                        
                    case 'strobe_attack':
                        // STROBE ATTACK → BUILD: Reset cycle with high energy start
                        this.lightingPhase = 'build';
                        this.targetEnergy = 0.55;
                        
                        // Transition back to building phase
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0;
                        this.spotlightMode = 1;
                        this.spotlightSpeed = 0.7;
                        this.ledWallSpeed = 0.8;
                        this.currentShowMode = 'spotlights';
                        log.info('🔄 BUILD: New cycle begins - The journey continues');
                        break;
                        break;
                        
                    default:
                        // STARTUP: Begin with intro
                        this.lightingPhase = 'intro';
                        this.targetEnergy = 0.3;
                        
                        this.lightsActive = true;
                        this.lasersActive = false;
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1;
                        this.spotlightSpeed = 0.4;
                        this.ledWallSpeed = 0.5;
                        this.currentShowMode = 'spotlights';
                        log.info('🌅 INTRO: Show begins - Setting the mood');
                        break;
                }
                
                this.lightModeSwitchTime = time;
                
                // DYNAMIC PHASE DURATIONS - Randomized for natural feel
                const phaseName = this.lightingPhase;
                if (phaseName === 'intro') {
                    this.phaseDurations.intro = 12 + Math.random() * 8;
                } else if (phaseName === 'build') {
                    this.phaseDurations.build = 20 + Math.random() * 12;
                } else if (phaseName === 'tension') {
                    this.phaseDurations.tension = 12 + Math.random() * 8;
                } else if (phaseName === 'drop') {
                    this.phaseDurations.drop = 6 + Math.random() * 6; // SHORT for impact!
                } else if (phaseName === 'peak') {
                    this.phaseDurations.peak = 16 + Math.random() * 12;
                } else if (phaseName === 'breakdown') {
                    this.phaseDurations.breakdown = 10 + Math.random() * 6;
                } else if (phaseName === 'atmospheric') {
                    this.phaseDurations.atmospheric = 14 + Math.random() * 10;
                } else if (phaseName === 'groove') {
                    this.phaseDurations.groove = 20 + Math.random() * 12;
                } else if (phaseName === 'euphoria') {
                    this.phaseDurations.euphoria = 8 + Math.random() * 6;
                } else if (phaseName === 'darkness') {
                    this.phaseDurations.darkness = 4 + Math.random() * 4; // Very short!
                } else if (phaseName === 'strobe_attack') {
                    this.phaseDurations.strobe_attack = 5 + Math.random() * 3;
                } else if (phaseName === 'laser_tunnel') {
                    this.phaseDurations.laser_tunnel = 12 + Math.random() * 8;
                }
                
                // Update VJ control button visuals to reflect state
                if (this.vjControlButtons) {
                    this.vjControlButtons.forEach(btn => {
                        if (btn.control === 'lightsActive' || btn.control === 'lasersActive' || 
                            btn.control === 'mirrorBallActive' || btn.control === 'strobesActive' || 
                            btn.control === 'ledWallActive' ||
                            btn.control === 'smokeActive') {
                            btn.material.emissiveColor = this[btn.control] ? btn.onColor : btn.offColor;
                        }
                    });
                }
            }
            
            // === IMMERSIVE MICRO-DYNAMICS: Real-time crowd-focused animations ===
            // Professional VJ technique: constant subtle adjustments create "living" show
            
            // Speed variations based on energy (things accelerate as energy rises)
            const energySpeedBoost = 0.7 + this.energyLevel * 0.6; // 0.7x to 1.3x
            
            // === SPOTLIGHT CROWD FOCUS ===
            // Occasionally converge spotlights on dance floor center for dramatic effect
            if (this.lightsActive && this.spotlights) {
                const convergeFactor = this.crowdFocusIntensity * 0.3; // 0-0.3 convergence
                
                this.spotlights.forEach((spot, i) => {
                    if (spot.light) {
                        // Intensity breathes with energy + beat sync
                        const baseIntensity = 8 + this.energyLevel * 15; // 8-23
                        const beatBoost = beatPulse * 2; // Punch on beats
                        spot.light.intensity = baseIntensity * (1 + microPulse + beatBoost);
                        
                        // Color temperature shifts with phase
                        if (this.lightingPhase === 'euphoria') {
                            // Warm, golden tones during euphoria
                            spot.light.diffuse.r = Math.min(1, spot.light.diffuse.r + 0.1);
                            spot.light.diffuse.g = Math.min(1, spot.light.diffuse.g + 0.05);
                        } else if (this.lightingPhase === 'tension') {
                            // Cooler, bluer tones during tension
                            spot.light.diffuse.b = Math.min(1, spot.light.diffuse.b + 0.1);
                        }
                    }
                });
            }
            
            // === LASER DYNAMICS ===
            // Lasers respond to energy and create immersive patterns
            if (this.lasersActive && this.lasers) {
                const fanAngle = this.laserFanAngle || 0.5;
                
                this.lasers.forEach((laser, i) => {
                    // Rotation speed tied to energy
                    laser.rotationSpeed = (0.008 + this.energyLevel * 0.03) * energySpeedBoost;
                    
                    // During laser_tunnel phase, lasers converge
                    if (this.lightingPhase === 'laser_tunnel') {
                        laser.convergenceTarget = this.beamConvergencePoint;
                        laser.fanSpread = fanAngle; // Narrow spread
                    } else {
                        laser.convergenceTarget = null;
                        laser.fanSpread = 0.5; // Normal spread
                    }
                });
            }
            
            // === MIRROR BALL IMMERSIVE DYNAMICS ===
            // OPTIMIZATION: Skip mirror ball updates in VR if performance is critical
            if (this.mirrorBallActive && this.mirrorBall && (!this.isInVRMode || this.frameCounter % 2 === 0)) {
                if (this.lightingPhase === 'breakdown') {
                    // Romantic slow rotation with breathing
                    const romancePulse = Math.sin(time * 0.3) * 0.15;
                    this.mirrorBallSpeed = 0.35 + romancePulse;
                } else if (this.lightingPhase === 'euphoria') {
                    // Faster, joyful rotation
                    this.mirrorBallSpeed = 0.6 + Math.sin(time * 0.5) * 0.1;
                } else {
                    // Normal rotation
                    this.mirrorBallSpeed = 0.5;
                }
            }
            
            // === STROBE INTENSITY CONTROL ===
            if (this.strobesActive && this.lightingPhase === 'strobe_attack') {
                // Maximum intensity during strobe attack
                this.strobeSpeed = 2.5 + Math.random() * 0.5; // Vary speed slightly
            }
            
        } else {
            // In manual mode: update lightModeSwitchTime to prevent immediate cycling when mode expires
            this.lightModeSwitchTime = time;
        }
        
        // Update LED wall animations
        // CRITICAL FIX: Handle both modular and legacy systems
        if (this.useModularSystems && this.systems.ledWall) {
            this.systems.ledWall.setActive(this.ledWallActive);
            this.systems.ledWall.update(time, audioData);
        } else if (this.ledWallActive) {
            // Legacy update method
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && this.ledPanels.length > 0) {
            // LED Wall is OFF - turn all panels black (not just paused)
            const blackColor = this.cachedColors.black;
            this.ledPanels.forEach(panel => {
                panel.material.emissiveColor = blackColor;
            });
        }
        
        // === IMMERSIVE DANCE FLOOR EDGE LED ANIMATION ===
        // Creates a "breathing" floor that responds to the music and phase
        if (this.danceFloorLEDs && this.danceFloorLEDs.length > 0) {
            const bassLevel = audioData ? audioData.bass / 255 : 0.5;
            const midLevel = audioData ? audioData.mid / 255 : 0.5;
            const phase = this.lightingPhase;
            
            this.danceFloorLEDs.forEach((led, i) => {
                let r, g, b, intensity;
                
                // Phase-specific floor colors for immersion
                if (phase === 'darkness') {
                    // Minimal glow during blackout - just enough to see
                    r = 0.1; g = 0.1; b = 0.2;
                    intensity = 0.2 + Math.sin(time * 0.5) * 0.1;
                } else if (phase === 'strobe_attack') {
                    // White strobe sync with floor
                    const strobe = Math.sin(time * 20) > 0 ? 1 : 0;
                    r = g = b = strobe;
                    intensity = 1.0;
                } else if (phase === 'euphoria') {
                    // Warm golden pulse
                    const warmPhase = time * 1.2 + i * 0.5;
                    r = 1.0;
                    g = 0.7 + Math.sin(warmPhase) * 0.2;
                    b = 0.3;
                    intensity = 0.7 + bassLevel * 0.3;
                } else if (phase === 'laser_tunnel') {
                    // Match laser colors (cycling RGB)
                    const laserPhase = time * 0.5;
                    r = Math.sin(laserPhase) * 0.5 + 0.5;
                    g = Math.sin(laserPhase + 2.1) * 0.5 + 0.5;
                    b = Math.sin(laserPhase + 4.2) * 0.5 + 0.5;
                    intensity = 0.5 + midLevel * 0.5;
                } else if (phase === 'breakdown') {
                    // Soft purple/pink for romantic moment
                    r = 0.8; g = 0.3; b = 0.9;
                    intensity = 0.4 + Math.sin(time * 0.4) * 0.2;
                } else {
                    // Default: Color cycling with phase offset
                    const colorPhase = time * 0.8 + i * Math.PI / 2;
                    r = Math.sin(colorPhase) * 0.5 + 0.5;
                    g = Math.sin(colorPhase + Math.PI * 2 / 3) * 0.5 + 0.5;
                    b = Math.sin(colorPhase + Math.PI * 4 / 3) * 0.5 + 0.5;
                    intensity = 0.5 + bassLevel * 0.5;
                }
                
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
                    
                    // SIMPLIFIED: Always calculate floor intersection directly
                    // This is more reliable than raycasting, especially in VR
                    // Raycasting can fail due to timing issues between eyes
                    
                    let beamLength = 50; // Default max length
                    
                    // Calculate floor intersection mathematically (always works, VR-safe)
                    if (direction.y < -0.01) {
                        // Laser pointing downward - calculate floor intersection
                        const distanceToFloor = laser.originPos.y / Math.abs(direction.y);
                        beamLength = Math.min(distanceToFloor, 50); // Cap at 50
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
                    
                    // Hit spots removed - no floor reflections needed
                    
                    // Color all beam elements with current color - HYPERREALISTIC color grading
                    let currentColor, innerGlowColor, outerGlowColor;
                    if (this.currentColorIndex === 0) {
                        currentColor = this.cachedColors.red;
                        innerGlowColor = new BABYLON.Color3(1, 0.4, 0.4);  // Slightly desaturated
                        outerGlowColor = new BABYLON.Color3(1, 0.25, 0.25); // Even softer
                    } else if (this.currentColorIndex === 1) {
                        currentColor = this.cachedColors.green;
                        innerGlowColor = new BABYLON.Color3(0.4, 1, 0.4);
                        outerGlowColor = new BABYLON.Color3(0.25, 1, 0.25);
                    } else {
                        currentColor = this.cachedColors.blue;
                        innerGlowColor = new BABYLON.Color3(0.4, 0.4, 1);
                        outerGlowColor = new BABYLON.Color3(0.25, 0.25, 1);
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
                    
                    // Hit spot materials no longer updated (spots are hidden)
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
                
                // Update light diffuse color (if lights exist - disabled for performance)
                laser.lights.forEach((light) => {
                    if (light) {
                        light.diffuse = currentLaserColor;
                        light.intensity = this.lasersActive ? 5 : 0;
                    }
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
                    if (light) light.intensity = 0;
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
                
                // PROFESSIONAL VOLUMETRIC BEAM - Hyperrealistic light cone
                // The beam must VISUALLY CONNECT to the floor light pool for realism
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
                    
                    // HYPERREALISTIC BEAM: Extend beam so ALL edges of cone touch the floor
                    // When a cone is tilted, the "uphill" edge needs to extend further to reach the floor
                    // 
                    // Geometry: For a cone tilted at angle θ from vertical:
                    // - Centerline distance to floor: L = h / cos(θ) where h = emission height
                    // - Cone radius at floor: r = L * tan(coneAngle/2)
                    // - The uphill edge of the cone needs extra length: r / cos(θ)
                    // - Total beam length should be: L + r * tan(θ) approximately
                    //
                    // cos(θ) = |direction.y| (since direction is normalized)
                    const cosTheta = Math.abs(direction.y);
                    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                    const tanTheta = cosTheta > 0.01 ? sinTheta / cosTheta : 0;
                    
                    // Cone half-angle from beam creation (diameterTop=1.5, over typical 7.5m length ≈ 5.7°)
                    // At floor, radius is 0.75m (half of 1.5m diameter)
                    const coneRadiusAtFloor = 0.75; // meters
                    
                    // Extension needed for uphill edge to reach floor
                    // This is approximately: coneRadius * tan(tiltAngle) / cos(tiltAngle)
                    // Simplified: coneRadius * sin(θ) / cos²(θ) = coneRadius * tan(θ) / cos(θ)
                    const beamExtension = cosTheta > 0.1 ? coneRadiusAtFloor * tanTheta : 0;
                    
                    // Base beam length from emission to floor intersection (centerline)
                    const centerBeamLength = BABYLON.Vector3.Distance(emissionPoint, floorIntersection);
                    
                    // Extended beam length so uphill cone edge reaches floor
                    const beamLength = centerBeamLength + beamExtension;
                    
                    // Position beam: Start at emission point, extend in direction for full length
                    // Cylinder center should be at midpoint of the EXTENDED beam
                    // The wide end (diameterTop, +Y local) should extend PAST the floor intersection
                    // so the uphill edge reaches the floor
                    const beamMidpoint = new BABYLON.Vector3(
                        emissionPoint.x + direction.x * (beamLength * 0.5),
                        emissionPoint.y + direction.y * (beamLength * 0.5),
                        emissionPoint.z + direction.z * (beamLength * 0.5)
                    );
                    
                    // Position beam at calculated midpoint
                    spot.beam.position.copyFrom(beamMidpoint);
                    
                    // Orient beam to point from emission toward floor
                    // The cylinder's local +Y points "up". We rotate it so +Y aligns with our direction.
                    // But we want narrow end (diameterBottom) at emission, wide end (diameterTop) at floor.
                    // Cylinder is created with diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // Default: +Y is top (wide). We need +Y to point TOWARD floor (where wide end should be).
                    // direction points FROM emission TOWARD floor - that's exactly what we want for +Y!
                    
                    // Use lookAt toward floor intersection, then rotate 90° to align cylinder axis
                    // Actually, easier: compute rotation directly from direction vector
                    // Cylinder: diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // We want WIDE end at FLOOR, NARROW end at fixture
                    // So cylinder +Y (diameterTop) should point TOWARD floor (same as direction)
                    const up = new BABYLON.Vector3(0, 1, 0);
                    const angle = Math.acos(BABYLON.Vector3.Dot(direction, up));
                    const axis = BABYLON.Vector3.Cross(up, direction).normalize();
                    
                    if (axis.length() > 0.001) {
                        spot.beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
                    } else if (direction.y > 0) {
                        // Pointing up (away from floor) - no flip needed (narrow end up is correct)
                        spot.beam.rotationQuaternion = BABYLON.Quaternion.Identity();
                    } else {
                        // Pointing straight down - FLIP 180° so wide end (diameterTop) goes to floor
                        spot.beam.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), Math.PI);
                    }
                    
                    // UPDATE BEAM LENGTH
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
                    
                    // REMOVED: Old local positioning code (now using world space)
                    // Beam is positioned at beamMidpoint with quaternion rotation above
                    
                    // HYPERREALISTIC: Stretch beam cone when hitting floor at angle
                    // The cone's base (diameterTop) expands into an ellipse on the floor
                    // We approximate this by scaling the cylinder wider in the tilt direction
                    // Note: cosTheta already calculated above for beam extension
                    const tiltStretch = 1.0 / Math.max(0.4, cosTheta); // How much to stretch due to angle
                    
                    // Scale beam: X/Z control diameter, Y controls length
                    // When tilted, the cone appears wider in the tilt direction
                    const baseScale = 1.0;
                    spot.beam.scaling.x = baseScale;
                    spot.beam.scaling.z = baseScale * Math.min(1.3, tiltStretch); // Subtle stretch in Z (forward/back)
                    
                    // UPDATE GLOW BEAM - Match main beam positioning (unparent and world space)
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
                    
                    // Update beamGlow - Match main beam world-space positioning
                    if (spot.beamGlow) {
                        // Unparent if needed
                        if (spot.beamGlow.parent) {
                            spot.beamGlow.setParent(null);
                        }
                        // Match main beam position and rotation exactly
                        spot.beamGlow.position.copyFrom(beamMidpoint);
                        spot.beamGlow.rotationQuaternion = spot.beam.rotationQuaternion.clone();
                        spot.beamGlow.scaling.y = beamLength;
                        spot.beamGlow.scaling.x = baseScale;
                        spot.beamGlow.scaling.z = baseScale * Math.min(1.3, tiltStretch);
                        
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
                    

                    
                    // Update HYPERREALISTIC floor light pool - Soft radial gradient for realistic light reflection
                    if (spot.lightPool) {
                        if (this.lightsActive && beamVisible) {
                            // HYPERREALISTIC: Pool is ELLIPTICAL when beam hits floor at angle
                            // When a circular cone intersects a plane at angle θ, the result is an ellipse
                            // - Minor axis (perpendicular to tilt): same as cone diameter = 1.5m
                            // - Major axis (along tilt direction): diameter / cos(θ)
                            const beamDiameterAtFloor = 1.5; // Matches diameterTop from beam creation
                            
                            // cosTheta already calculated above for beam extension
                            // Use the same values for consistency
                            const ellipseStretch = 1.0 / Math.max(0.25, cosTheta); // How much to stretch along tilt
                            
                            // Pool radius = half diameter, with expansion for soft edge glow
                            const poolBaseSize = (beamDiameterAtFloor * 0.5) * 1.3; // Base radius with soft edge
                            
                            // Calculate ellipse orientation (stretch in direction of beam tilt)
                            // Project beam direction onto XZ plane to get stretch direction
                            const tiltDirX = direction.x;
                            const tiltDirZ = direction.z;
                            const tiltMagnitude = Math.sqrt(tiltDirX * tiltDirX + tiltDirZ * tiltDirZ);
                            
                            // Subtle shimmer for realistic light variation
                            const shimmer = 1.0 + Math.sin(time * 1.5 + i * 0.7) * 0.08;
                            
                            // Position at beam-floor intersection (centerline)
                            spot.lightPool.position.x = floorIntersection.x;
                            spot.lightPool.position.y = 0.02; // Just above floor to prevent z-fighting
                            spot.lightPool.position.z = floorIntersection.z;
                            
                            // ELLIPTICAL SCALING: stretch in tilt direction
                            // The disc mesh is in XY plane, rotated 90° around X to lie flat
                            // So disc's local X = world X (perpendicular to tilt when rotated)
                            // And disc's local Y = world Z (along tilt direction when rotated)
                            if (tiltMagnitude > 0.05) {
                                // Calculate rotation angle around Y to align stretch with tilt direction
                                const poolRotation = Math.atan2(tiltDirX, tiltDirZ);
                                spot.lightPool.rotation.y = poolRotation; // Rotate around Y (vertical axis)
                                // After Y rotation, local +Z aligns with tilt direction
                                // Scale: X stays same (minor axis), Z is stretched (major axis along tilt)
                                spot.lightPool.scaling.set(poolBaseSize, poolBaseSize * ellipseStretch, 1);
                            } else {
                                // Nearly vertical - circular pool
                                spot.lightPool.rotation.y = 0;
                                spot.lightPool.scaling.set(poolBaseSize, poolBaseSize, 1);
                            }
                            spot.lightPool.visibility = 1.0;
                            
                            // Color intensity falls off with distance (inverse square approximation)
                            const normalizedDistance = Math.min(1.0, centerBeamLength / 10.0);
                            const distanceFalloff = Math.max(0.3, 1.0 - (normalizedDistance * 0.5));
                            const poolIntensity = 1.8 * shimmer * distanceFalloff;
                            
                            if (spot.poolMat) {
                                spot.poolMat.emissiveColor = spotColor.scale(poolIntensity);
                                spot.poolMat.alpha = 0.55 * distanceFalloff;
                            }
                            
                            // === HYPERREALISTIC POOL LIGHT UPDATE ===
                            // Move the actual point light to illuminate surfaces where beam hits
                            if (spot.poolLight) {
                                spot.poolLight.position.x = floorIntersection.x;
                                spot.poolLight.position.y = 0.8; // Slightly above floor for better spread
                                spot.poolLight.position.z = floorIntersection.z;
                                spot.poolLight.diffuse = spotColor.clone();
                                spot.poolLight.specular = spotColor.scale(0.4);
                                spot.poolLight.intensity = 5.0 * distanceFalloff * shimmer;
                                spot.poolLight.range = 3.5 + (ellipseStretch * 0.5); // Range matches pool size
                                spot.poolLight.setEnabled(true);
                            }
                            
                            // Outer glow - larger, softer ambient light spread (also elliptical)
                            if (spot.lightPoolGlow) {
                                const glowBaseSize = poolBaseSize * 2.2; // Much larger for soft ambient spread
                                spot.lightPoolGlow.position.x = floorIntersection.x;
                                spot.lightPoolGlow.position.y = 0.01;
                                spot.lightPoolGlow.position.z = floorIntersection.z;
                                
                                // Match ellipse shape of main pool (use rotation.y for horizontal rotation)
                                if (tiltMagnitude > 0.05) {
                                    spot.lightPoolGlow.rotation.y = spot.lightPool.rotation.y;
                                    spot.lightPoolGlow.scaling.set(glowBaseSize, glowBaseSize * ellipseStretch, 1);
                                } else {
                                    spot.lightPoolGlow.rotation.y = 0;
                                    spot.lightPoolGlow.scaling.set(glowBaseSize, glowBaseSize, 1);
                                }
                                spot.lightPoolGlow.visibility = 1.0;
                                
                                if (spot.poolGlowMat) {
                                    // Very soft ambient glow
                                    spot.poolGlowMat.emissiveColor = spotColor.scale(0.5 * shimmer * distanceFalloff);
                                    spot.poolGlowMat.alpha = 0.25 * distanceFalloff;
                                }
                            }
                            
                        } else {
                            // CRITICAL: Hide floor pools immediately when lights turn off or flashing off
                            spot.lightPool.visibility = 0;
                            if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                            // Disable pool light when beam is off
                            if (spot.poolLight) spot.poolLight.setEnabled(false);
                        }
                    }
                }
                
                // CRITICAL: Hide beams when lights are off (no beams without light source!)
                if (!this.lightsActive) {
                    spot.beamVisible = false; // CRITICAL: Update beamVisible for fixture sync
                    if (spot.beam) spot.beam.visibility = 0;
                    if (spot.beamGlow) spot.beamGlow.visibility = 0;
                    if (spot.lightPoolGlow) spot.lightPoolGlow.visibility = 0;
                    if (spot.poolLight) spot.poolLight.setEnabled(false);
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
                if (spot.poolLight) spot.poolLight.setEnabled(false);
            });
        }
        
        // Laser curtain show removed (was broken)

        // Update truss-mounted light fixtures so they EXACTLY match their beams
        // Rule: fixture stays lit with current color when lightsActive=true (beam strobe doesn't affect fixture)
        if (this.spotlights && this.spotlights.length > 0) {
            // Use the GLOBAL currentSpotColor for ALL fixtures - they must all match
            const targetColor = this.currentSpotColor;
            const lensIntensity = 1.8;
            const sourceIntensity = 3.0;
            
            for (let i = 0; i < this.spotlights.length; i++) {
                const spot = this.spotlights[i];
                if (!spot) continue;

                // Fixture should be lit when lights are active
                const fixtureVisible = this.lightsActive;

                // Lookup meshes by name (guaranteed unique per fixture)
                const lens = this.scene.getMeshByName("lens" + i);
                const lightSource = this.scene.getMeshByName("lightSource" + i);

                // Update lens color
                if (lens && lens.material) {
                    const mat = lens.material;
                    // Unfreeze material to allow dynamic updates (factory freezes by default)
                    mat.unfreeze();
                    if (!mat.emissiveColor) {
                        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    }
                    if (fixtureVisible) {
                        mat.emissiveColor.copyFromFloats(
                            targetColor.r * lensIntensity,
                            targetColor.g * lensIntensity,
                            targetColor.b * lensIntensity
                        );
                    } else {
                        mat.emissiveColor.copyFromFloats(0, 0, 0);
                    }
                }

                // Update light source (inner bulb) color
                if (lightSource && lightSource.material) {
                    const mat = lightSource.material;
                    // Unfreeze material to allow dynamic updates (factory freezes by default)
                    mat.unfreeze();
                    if (!mat.emissiveColor) {
                        mat.emissiveColor = new BABYLON.Color3(0, 0, 0);
                    }
                    if (fixtureVisible) {
                        mat.emissiveColor.copyFromFloats(
                            targetColor.r * sourceIntensity,
                            targetColor.g * sourceIntensity,
                            targetColor.b * sourceIntensity
                        );
                    } else {
                        mat.emissiveColor.copyFromFloats(0, 0, 0);
                    }
                }
            }
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
        // === PROFESSIONAL VJ STROBE SYSTEM ===
        // Synchronized with drops, builds, and bass for maximum impact
        const strobeSpeedMultiplier = this.strobeSpeed || 1.0;
        if (this.strobes && this.strobes.length > 0) {
            if (this.strobesActive) {
                // Get audio data for reactive strobing
                const bass = audioData.bass || 0;
                const treble = audioData.treble || 0;
                
                // VJ AUTO-MODE: Enhanced strobing during drops
                const inDropMode = this.vjDropActive;
                const inBuildMode = this.vjBuildIntensity > 0.7;
                
                this.strobes.forEach((strobe, i) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        strobe.flashDuration -= 0.016 * strobeSpeedMultiplier;
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    // BOOST during drops for maximum crowd impact
                    let intensityVariation = strobe.currentIntensity || 80;
                    if (inDropMode) {
                        intensityVariation *= 1.5; // 50% brighter during drops
                    }
                    
                    const burstPhase = Math.floor(strobe.flashDuration * 40 * strobeSpeedMultiplier) % 2;
                    const intensity = burstPhase === 0 ? intensityVariation : 0;
                    
                    strobe.material.emissiveColor = this.cachedColors.white.scale(intensity * 1.5);
                    // Strobe lights disabled for performance - visual effect only via emissive material
                    if (strobe.light) {
                        strobe.light.intensity = intensity * 200;
                        strobe.light.range = 80 + (intensityVariation * 0.8);
                        strobe.light.setEnabled(intensity > 0);
                    }
                    
                    if (strobe.flashDuration <= 0) {
                        strobe.material.emissiveColor = this.cachedColors.black;
                        if (strobe.light) {
                            strobe.light.intensity = 0;
                            strobe.light.setEnabled(false);
                        }
                        
                        // VJ AUTO-MODE: Faster strobing during drops and builds
                        let flashInterval;
                        if (inDropMode) {
                            // RAPID FIRE during drops (0.05-0.15s)
                            flashInterval = (0.05 + Math.random() * 0.1) / strobeSpeedMultiplier;
                        } else if (inBuildMode) {
                            // Increasing frequency during build (0.1-0.3s)
                            const buildFactor = 1 - (this.vjBuildIntensity - 0.7) / 0.3;
                            flashInterval = (0.1 + Math.random() * 0.2 * buildFactor) / strobeSpeedMultiplier;
                        } else {
                            // Normal operation (0.1-1.0s)
                            flashInterval = (0.1 + Math.random() * 0.9) / strobeSpeedMultiplier;
                        }
                        strobe.nextFlashTime = time + flashInterval;
                    }
                } else {
                    // Check if it's time for next flash
                    if (time >= strobe.nextFlashTime) {
                        // VJ AUTO-MODE: Brighter strobes during drops
                        let intensityBase = Math.random() > 0.6 ? 
                            (60 + Math.random() * 20) : 
                            (80 + Math.random() * 20);
                        
                        // BASS REACTIVE: Boost on bass hits
                        if (bass > 0.6) {
                            intensityBase *= 1 + (bass - 0.6) * 0.5;
                        }
                        
                        // DROP BOOST: Maximum power during drops
                        if (inDropMode) {
                            intensityBase = 100; // Full power
                        }
                        
                        strobe.currentIntensity = Math.min(100, intensityBase);
                        
                        // Flash duration varies with mode
                        let flashDuration;
                        if (inDropMode) {
                            flashDuration = (0.08 + Math.random() * 0.12) / strobeSpeedMultiplier;
                        } else {
                            flashDuration = (0.15 + Math.random() * 0.2) / strobeSpeedMultiplier;
                        }
                        strobe.flashDuration = flashDuration;
                    }
                }
                });
            } else {
                // Turn off strobes when disabled
                this.strobes.forEach((strobe) => {
                    strobe.material.emissiveColor = this.cachedColors.black;
                    if (strobe.light) {
                        strobe.light.intensity = 0;
                        strobe.light.setEnabled(false);
                    }
                    strobe.flashDuration = 0;
                });
            }
        }
        
        // Blinders removed - strobes provide sufficient impact lighting
        
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
            
            // === PULSATING/BREATHING PATTERNS (NEW) ===
            this.patternHeartbeat,          // Rhythmic heartbeat pulse
            this.patternBreathing,          // Slow inhale/exhale glow
            this.patternShockwave,          // Concentric rings expanding
            this.patternPulseStar,          // Star shape pulsing outward
            this.patternCrossBeam,          // Crossing beams pulsating
            this.patternRadialPulse,        // Radial rays pulsing from center
            this.patternWaveCollide,        // Waves colliding at center
            this.patternCellularPulse,      // Organic cell-like pulsation
            
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

    // === IMMERSIVE PULSATING PATTERNS ===
    
    patternHeartbeat(color, time, audioData) {
        // Rhythmic heartbeat pulse - two quick beats then pause
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Heartbeat timing: beat-beat-pause (~72 BPM heart rate feel)
        const cycle = time * 1.2; // Speed of heartbeat cycle
        const phase = cycle % 1.0;
        
        // Two pulses in quick succession
        let pulse = 0;
        if (phase < 0.15) {
            // First beat (lub)
            pulse = Math.sin(phase / 0.15 * Math.PI);
        } else if (phase > 0.2 && phase < 0.35) {
            // Second beat (dub)
            pulse = Math.sin((phase - 0.2) / 0.15 * Math.PI) * 0.8;
        }
        // Rest of cycle is pause
        
        // Heart shape approximation expanding from center
        const heartRadius = 2 + pulse * 6;
        
        this.ledPanels.forEach(panel => {
            const dx = (panel.col - centerX) / 3;
            const dy = (panel.row - centerY) / 2.5;
            
            // Heart equation: (x^2 + y^2 - 1)^3 - x^2*y^3 < 0
            const heartEq = Math.pow(dx*dx + dy*dy - 1, 3) - dx*dx * Math.pow(dy, 3);
            const inHeart = heartEq < heartRadius * 0.1;
            
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const ringMatch = Math.abs(dist - heartRadius) < 2;
            
            const brightness = (inHeart || ringMatch) ? pulse : pulse * 0.1;
            
            // Deep red/pink for heartbeat
            const heartColor = new BABYLON.Color3(1.0, 0.1 + pulse * 0.2, 0.2 + pulse * 0.1);
            this.updateLEDPanel(panel, heartColor, brightness);
        });
    }
    
    patternBreathing(color, time, audioData) {
        // Slow inhale/exhale - meditative pulsing glow
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        // Very slow breathing cycle (4 seconds per breath)
        const breathCycle = Math.sin(time * 0.5) * 0.5 + 0.5; // 0 to 1
        
        // Inhale is slower than exhale (realistic breathing)
        const breath = Math.pow(breathCycle, 0.7); // Ease in the exhale
        
        // Color shifts from cool (exhale) to warm (inhale)
        const r = 0.2 + breath * 0.6;
        const g = 0.1 + breath * 0.3;
        const b = 0.8 - breath * 0.5;
        const breathColor = new BABYLON.Color3(r, g, b);
        
        this.ledPanels.forEach(panel => {
            // Gentle radial gradient that expands/contracts with breath
            const centerX = cols / 2;
            const centerY = rows / 2;
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
            
            // Brightness peaks at center and expands outward with breath
            const expandRadius = breath * maxDist * 1.5;
            const brightness = Math.max(0, 1.0 - Math.abs(dist - expandRadius * 0.3) / (3 + breath * 5));
            
            panel.material.emissiveColor = breathColor.scale(brightness * 0.8 + 0.2);
        });
    }
    
    patternShockwave(color, time, audioData) {
        // Concentric rings expanding rapidly from center
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Multiple shockwaves at different phases
        const waveSpeed = 15;
        const waveSpacing = 8; // Distance between waves
        
        this.ledPanels.forEach(panel => {
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow((panel.row - centerY) * 2, 2));
            
            // Multiple expanding rings
            let brightness = 0;
            for (let i = 0; i < 4; i++) {
                const wavePos = ((time * waveSpeed + i * waveSpacing) % 30);
                const ringDist = Math.abs(dist - wavePos);
                if (ringDist < 1.5) {
                    // Intensity decreases as wave expands
                    const fade = Math.max(0, 1.0 - wavePos / 25);
                    brightness = Math.max(brightness, (1.0 - ringDist / 1.5) * fade);
                }
            }
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternPulseStar(color, time, audioData) {
        // Star shape that pulses and rotates
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        const pulse = Math.sin(time * 4) * 0.5 + 0.5; // Fast pulse
        const rotation = time * 0.5; // Slow rotation
        const numPoints = 5;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2; // Stretch Y
            
            // Convert to polar
            const angle = Math.atan2(dy, dx) + rotation;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Star shape: radius varies with angle
            const starAngle = angle * numPoints;
            const innerRadius = 2 + pulse * 2;
            const outerRadius = 5 + pulse * 4;
            const starRadius = innerRadius + (outerRadius - innerRadius) * Math.pow((Math.cos(starAngle) + 1) / 2, 2);
            
            const brightness = dist < starRadius ? (1.0 - dist / starRadius) * (0.5 + pulse * 0.5) : 0;
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternCrossBeam(color, time, audioData) {
        // Crossing beams that pulse in intensity
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        // Two crossing beams rotating
        const angle1 = time * 0.8;
        const angle2 = time * 0.8 + Math.PI / 2;
        
        // Pulse intensity
        const pulse1 = Math.sin(time * 6) * 0.5 + 0.5;
        const pulse2 = Math.sin(time * 6 + Math.PI) * 0.5 + 0.5;
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2;
            
            // Distance to each beam line
            const dist1 = Math.abs(dx * Math.sin(angle1) - dy * Math.cos(angle1));
            const dist2 = Math.abs(dx * Math.sin(angle2) - dy * Math.cos(angle2));
            
            const beamWidth = 1.5;
            const b1 = dist1 < beamWidth ? (1.0 - dist1 / beamWidth) * pulse1 : 0;
            const b2 = dist2 < beamWidth ? (1.0 - dist2 / beamWidth) * pulse2 : 0;
            
            const brightness = Math.min(1.0, b1 + b2);
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternRadialPulse(color, time, audioData) {
        // Radial rays pulsing outward from center like a sun
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        const centerY = rows / 2 - 0.5;
        
        const numRays = 12;
        const rayRotation = time * 0.3;
        const rayPulse = time * 8; // Fast pulse along rays
        
        this.ledPanels.forEach(panel => {
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * 2.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) + rayRotation;
            
            // Check if on a ray
            const rayAngle = (angle * numRays / (2 * Math.PI) + 100) % 1.0;
            const onRay = rayAngle < 0.3 || rayAngle > 0.7;
            
            // Pulse travels outward along rays
            const pulseDist = (rayPulse % 20);
            const pulseMatch = Math.abs(dist - pulseDist) < 2;
            
            let brightness = 0;
            if (onRay) {
                brightness = 0.2; // Base ray visibility
                if (pulseMatch) {
                    brightness = 1.0 - Math.abs(dist - pulseDist) / 2;
                }
            }
            // Center always bright
            if (dist < 2) brightness = 1.0;
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternWaveCollide(color, time, audioData) {
        // Waves from left and right that collide at center with splash
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        const centerX = cols / 2 - 0.5;
        
        const waveSpeed = 8;
        const cycleDuration = cols / waveSpeed + 1;
        const cycleTime = time % cycleDuration;
        
        // Wave positions (moving toward center)
        const leftWave = cycleTime * waveSpeed;
        const rightWave = cols - cycleTime * waveSpeed;
        
        // Collision detection
        const colliding = Math.abs(leftWave - centerX) < 3 && Math.abs(rightWave - centerX) < 3;
        
        this.ledPanels.forEach(panel => {
            let brightness = 0;
            
            // Left wave
            const distLeft = Math.abs(panel.col - leftWave);
            if (distLeft < 2) {
                brightness = Math.max(brightness, 1.0 - distLeft / 2);
            }
            
            // Right wave  
            const distRight = Math.abs(panel.col - rightWave);
            if (distRight < 2) {
                brightness = Math.max(brightness, 1.0 - distRight / 2);
            }
            
            // Collision splash - vertical burst at center
            if (colliding) {
                const distCenter = Math.abs(panel.col - centerX);
                if (distCenter < 4) {
                    // Vertical splash
                    brightness = 1.0;
                }
            }
            
            this.updateLEDPanel(panel, color, brightness);
        });
    }
    
    patternCellularPulse(color, time, audioData) {
        // Organic cell-like blobs that pulse and merge
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        // Define 4 cell centers that move slowly
        const cells = [
            { x: cols * 0.25 + Math.sin(time * 0.5) * 3, y: rows * 0.3 + Math.cos(time * 0.7) * 2 },
            { x: cols * 0.75 + Math.sin(time * 0.6 + 1) * 3, y: rows * 0.3 + Math.cos(time * 0.5 + 1) * 2 },
            { x: cols * 0.25 + Math.sin(time * 0.4 + 2) * 3, y: rows * 0.7 + Math.cos(time * 0.8 + 2) * 2 },
            { x: cols * 0.75 + Math.sin(time * 0.7 + 3) * 3, y: rows * 0.7 + Math.cos(time * 0.6 + 3) * 2 }
        ];
        
        // Each cell pulses at slightly different rate
        const pulses = cells.map((_, i) => Math.sin(time * (3 + i * 0.5)) * 0.5 + 0.5);
        
        this.ledPanels.forEach(panel => {
            let totalInfluence = 0;
            
            // Sum influence from all cells (metaball-like)
            cells.forEach((cell, i) => {
                const dist = Math.sqrt(Math.pow(panel.col - cell.x, 2) + Math.pow((panel.row - cell.y) * 2, 2));
                const radius = 3 + pulses[i] * 3;
                if (dist < radius) {
                    totalInfluence += (1.0 - dist / radius) * pulses[i];
                }
            });
            
            const brightness = Math.min(1.0, totalInfluence);
            
            // Shift color based on brightness for organic feel
            const cellColor = new BABYLON.Color3(
                color.r * (0.7 + brightness * 0.3),
                color.g * (0.5 + brightness * 0.5),
                color.b * (0.8 + brightness * 0.2)
            );
            
            this.updateLEDPanel(panel, cellColor, brightness);
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
                        
                        // Update reflection spot colors IMMEDIATELY (don't wait for animation loop)
                        // This ensures instant visual sync when VJ changes color
                        if (this.mirrorReflectionSpots) {
                            this.mirrorReflectionSpots.forEach(spot => {
                                // Immediate color update for spot disc
                                spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(spot.baseIntensity || 0.7);
                                // Immediate color update for volumetric beam
                                if (spot.beamMaterial) {
                                    spot.beamMaterial.emissiveColor = this.mirrorBallSpotlightColor.scale(0.8);
                                }
                            });
                        }
                        
                        // Update outgoing rays from mirror ball
                        if (this.mirrorBallOutgoingRays) {
                            this.mirrorBallOutgoingRays.forEach(ray => {
                                ray.material.emissiveColor = this.mirrorBallSpotlightColor;
                            });
                        }
                        
                        // Invalidate cached colors so they get recalculated
                        this.mirrorBallCachedColors = null;
                        
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
            danceFloor: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 3, -18) },
            djBooth: { pos: new BABYLON.Vector3(0, 2.0, -18.5), target: new BABYLON.Vector3(0, 1.7, -10) },
            djSide: { pos: new BABYLON.Vector3(-5, 2.0, -17), target: new BABYLON.Vector3(0, 1.5, -17.5) },
            ledWallClose: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 3, -19) },
            speakers: { pos: new BABYLON.Vector3(-4, 1.7, -14), target: new BABYLON.Vector3(-7, 2.5, -19) },
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
        // Load 3 animated GLB avatars directly onto the dancefloor
        // These GLB files contain pre-baked dance animations
        
        const avatarModels = [
            {
                name: 'HipHopDancer',
                url: './js/models/avatars/Hip Hop Dancing.glb',
                position: new BABYLON.Vector3(-3, 0, -10),
                rotation: Math.PI * 0.2, // Facing slightly toward DJ
                scale: 1.0
            },
            {
                name: 'HouseDancer',
                url: './js/models/avatars/house.glb',
                position: new BABYLON.Vector3(0, 0, -14),
                rotation: Math.PI, // Facing DJ booth
                scale: 1.0
            },
            {
                name: 'RumbaDancer',
                url: './js/models/avatars/rumba_dancing_female_character.glb',
                position: new BABYLON.Vector3(3, 0, -10),
                rotation: Math.PI * -0.2, // Facing slightly toward DJ
                scale: 1.0
            }
        ];
        
        log.info(`🕺 Loading ${avatarModels.length} animated dancing avatars...`);
        
        for (const avatar of avatarModels) {
            try {
                const result = await BABYLON.SceneLoader.ImportMeshAsync(
                    "",
                    "",
                    avatar.url,
                    this.scene
                );
                
                const rootMesh = result.meshes[0];
                rootMesh.name = avatar.name;
                rootMesh.position = avatar.position;
                rootMesh.rotation.y = avatar.rotation;
                
                // Auto-scale to reasonable human height (~1.7m)
                const boundingInfo = rootMesh.getHierarchyBoundingVectors();
                const currentHeight = boundingInfo.max.y - boundingInfo.min.y;
                const targetHeight = 1.7; // 1.7 meters
                const scaleFactor = (targetHeight / currentHeight) * avatar.scale;
                rootMesh.scaling.setAll(scaleFactor);
                
                // Ensure avatar is grounded (feet on floor)
                const newBounding = rootMesh.getHierarchyBoundingVectors();
                rootMesh.position.y = -newBounding.min.y * scaleFactor;
                
                // Fix materials for proper rendering in the club
                // CRITICAL: Enforce fully opaque materials to prevent see-through NPCs
                result.meshes.forEach(mesh => {
                    if (mesh.material) {
                        const mat = mesh.material;
                        mat.maxSimultaneousLights = this.maxLights;
                        
                        // CRITICAL: Force fully opaque - NPCs should NOT be transparent
                        mat.alpha = 1.0;
                        mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
                        
                        // Disable all alpha blending paths
                        if (mat.needAlphaBlending) {
                            mat.needAlphaBlending = () => false;
                        }
                        if (mat.needAlphaTesting) {
                            mat.needAlphaTesting = () => false;
                        }
                        
                        // Force depth write for proper occlusion
                        mat.disableDepthWrite = false;
                        mat.forceDepthWrite = true;
                        
                        // For PBR materials, disable any alpha from textures
                        if (mat.albedoTexture) {
                            mat.albedoTexture.hasAlpha = false;
                        }
                        if (mat.baseTexture) {
                            mat.baseTexture.hasAlpha = false;
                        }
                        
                        // Set backface culling for performance
                        mat.backFaceCulling = true;
                        
                        // Freeze material after changes
                        mat.freeze();
                    }
                });
                
                // Play all animation groups from the GLB
                if (result.animationGroups && result.animationGroups.length > 0) {
                    result.animationGroups.forEach(animGroup => {
                        animGroup.start(true); // Loop the animation
                        // Vary speed slightly for natural feel
                        animGroup.speedRatio = 0.9 + Math.random() * 0.2;
                    });
                    log.info(`  ✅ ${avatar.name}: ${result.animationGroups.length} animations playing`);
                } else {
                    log.info(`  ⚠️ ${avatar.name}: No animations found in GLB`);
                }
                
                // Store reference for potential future use
                this.npcAvatars.push({
                    name: avatar.name,
                    root: rootMesh,
                    meshes: result.meshes,
                    animations: result.animationGroups,
                    position: avatar.position
                });
                
            } catch (error) {
                log.warn(`  ❌ Failed to load ${avatar.name}: ${error.message}`);
            }
        }
        
        log.info(`✅ Loaded ${this.npcAvatars.length} dancing avatars on dancefloor`);
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
        // GLB avatars with built-in animations play automatically via animation groups
        // This function can be used for any additional effects (e.g., lighting response)
        
        if (!this.npcAvatars || this.npcAvatars.length === 0) return;
        
        // Optional: Sync animation speed to audio
        const audioData = this.getAudioData();
        if (audioData.hasAudio && audioData.bass > 0.3) {
            // Speed up animations slightly with the beat
            const beatBoost = 1.0 + (audioData.bass - 0.3) * 0.3;
            this.npcAvatars.forEach(npc => {
                if (npc.animations) {
                    npc.animations.forEach(anim => {
                        anim.speedRatio = (0.9 + Math.random() * 0.2) * beatBoost;
                    });
                }
            });
        }
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
