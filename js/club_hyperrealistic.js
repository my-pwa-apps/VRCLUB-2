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
// UNDERGROUND CLUB REDESIGN: Lower ceiling (4.5m) creates intimate, oppressive atmosphere
// Inspired by Tresor/Berghain Kantine/Shelter Amsterdam — raw concrete bunker aesthetic
const ROOM_BOUNDS = {
    x: { min: -12.5, max: 12.5, width: 25 },
    y: { min: 0, max: 4.5, height: 4.5 },
    z: { min: -21, max: -5, depth: 16 }
};

// Key positions in the club
const CLUB_POSITIONS = {
    djBooth: { x: 0, y: 0.95, z: -18 },
    danceFloor: { x: 0, y: 0, z: -12 },
    entrance: { x: 0, y: 0, z: 0 },
    mirrorBall: { x: 0, y: 3.8, z: -12 },
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
        // UNDERGROUND CLUB ATMOSPHERE — Designed for techno/house immersion
        // Philosophy: Total darkness. Fog so thick you taste it. Light cuts like a blade.
        // References: Tresor Berlin, Berghain Kantine, Shelter Amsterdam, DC-10 Ibiza
        this.vrSettings = {
            desktop: {
                exposure: 0.95, // Darker exposure
                contrast: 1.6, // Adjusted contrast
                bloomWeight: 0.25, 
                bloomThreshold: 0.6, 
                bloomScale: 0.35, 
                glowIntensity: 0.7, 
                ambientIntensity: 0.05, // Dark, but you can see walls now
                environmentIntensity: 0.35, // More reflections
                clearColor: new BABYLON.Color3(0.005, 0.005, 0.008),
                grainEnabled: true, // Film grain adds to the raw/industrial feel
                chromaticAberrationEnabled: true,
                toneMappingEnabled: true,
                fxaaEnabled: true,
                sharpenAmount: 0.6,
                fogDensity: 0.08 // EXTREME haze — thick techno club fog
            },
            vr: {
                exposure: 0.85, // Balanced exposure
                contrast: 1.5, // Better contrast for options
                bloomWeight: 0.15, // Subtle bloom in VR
                bloomThreshold: 0.8,
                bloomScale: 0.25,
                glowIntensity: 0.5,
                ambientIntensity: 0.04, // Easier to navigate
                environmentIntensity: 0.15, // Noticeable reflections
                clearColor: new BABYLON.Color3(0.005, 0.005, 0.005),
                grainEnabled: false,
                chromaticAberrationEnabled: false,
                toneMappingEnabled: false,
                edgeSharpness: 0.7,
                colorSharpness: 0.9,
                fxaaEnabled: true,
                fogDensity: 0.05 // Extreme thick haze in VR
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
        
        // Fog machine LED state colors (pre-allocated to avoid per-frame allocations)
        this.cachedFogColors = {
            active: new BABYLON.Color3(1, 0.2, 0),
            ready: new BABYLON.Color3(0, 0.8, 0),
            continuous: new BABYLON.Color3(1, 0.5, 0),
            standby: new BABYLON.Color3(0.3, 0.3, 1),
            off: new BABYLON.Color3(0.3, 0.3, 0.3)
        };
        
        // PERFORMANCE: Pre-allocated Color3 for LED patterns (eliminates thousands of allocations/frame)
        this._ledColor = new BABYLON.Color3(0, 0, 0); // Reusable color for LED updates
        this._ledColor2 = new BABYLON.Color3(0, 0, 0); // Second reusable color
        
        // Cached LED pattern colors (avoid per-frame allocations)
        this.cachedLEDColors = {
            matrixGreen: new BABYLON.Color3(0, 1, 0.2),
            auroraTeal: new BABYLON.Color3(0, 1, 1),
            oceanBlue: new BABYLON.Color3(0, 0.5, 1),
            heartRed: new BABYLON.Color3(1, 0.1, 0.2),
            fireOrange: new BABYLON.Color3(1, 0.6, 0),
        };
        
        // Cached laser glow colors (avoid per-frame allocations)
        this.cachedLaserGlowColors = {
            redInner: new BABYLON.Color3(1, 0.4, 0.4),
            redOuter: new BABYLON.Color3(1, 0.25, 0.25),
            greenInner: new BABYLON.Color3(0.4, 1, 0.4),
            greenOuter: new BABYLON.Color3(0.25, 1, 0.25),
            blueInner: new BABYLON.Color3(0.4, 0.4, 1),
            blueOuter: new BABYLON.Color3(0.25, 0.25, 1),
            redEmissive: new BABYLON.Color3(0.2, 0, 0),
            greenEmissive: new BABYLON.Color3(0, 0.2, 0),
            blueEmissive: new BABYLON.Color3(0, 0, 0.2),
            redBright: new BABYLON.Color3(3, 0, 0),
            greenBright: new BABYLON.Color3(0, 3, 0),
            blueBright: new BABYLON.Color3(0, 0, 3),
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
        this.spotlightPattern = 0; // 0=automated/moving, 1=static down, 2=mirror sweep, 3=crossed beams
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
        
        // Gobo filter settings (for legacy spotlight system)
        this.goboEnabled = false;
        this.goboPatternIndex = 0;
        this.goboRotationSpeed = 1.0;
        this.goboRotation = 0;
        this.goboPatterns = [
            'circle', 'star', 'triangles', 'squares', 'rings',
            'spiral', 'dots', 'slats', 'cross', 'flower'
        ];
        
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
        this.useModularSystems = true; // Enabled - Now using modern systems from js/systems/

        this.init();
    }

    applyVRSettings(xrCamera) {
        const vr = this.vrSettings.vr;
        
        // CRITICAL: Track VR mode to disable frame-skip optimizations
        // Frame-skipping causes different states per eye = epileptic effect
        this.isInVRMode = true;
        
        // UPGRADE: Set scene performance priority to Aggressive for VR
        // This tells Babylon.js to skip frustum checks, reduce draw calls, etc.
        if (BABYLON.ScenePerformancePriority) {
            this.scene.performancePriority = BABYLON.ScenePerformancePriority.Aggressive;
            log.info('⚡ Scene performance priority set to Aggressive for VR');
        }
        
        // UPGRADE: Disable floor reflection probe in VR (one less render target)
        if (this.floorReflectionProbe) {
            this.floorReflectionProbe.cubeTexture.refreshRate = 0; // Stop rendering
            log.info('⚡ Disabled floor reflection probe updates for VR');
        }
        
        // VR POST-PROCESSING: Keep minimal effects for immersion while staying performant
        // Completely disabling post-processing makes lights look flat and unrealistic in VR
        if (this.renderPipeline) {
            // Remove desktop camera from pipeline
            if (this.camera) {
                this.renderPipeline.removeCamera(this.camera);
            }
            
            // Selective post-processing for VR - keep bloom for light glow, disable expensive effects
            this.renderPipeline.fxaaEnabled = false; // Use XR layer's native AA instead
            this.renderPipeline.bloomEnabled = true; // KEEP bloom - essential for light glow in dark club
            this.renderPipeline.bloomWeight = vr.bloomWeight; // Subtle bloom
            this.renderPipeline.bloomThreshold = vr.bloomThreshold;
            this.renderPipeline.bloomKernel = 32; // Smaller kernel for VR performance
            this.renderPipeline.bloomScale = vr.bloomScale;
            this.renderPipeline.sharpenEnabled = false; // Disable - not needed with native AA
            this.renderPipeline.imageProcessingEnabled = true; // Keep for contrast/exposure
            if (this.renderPipeline.imageProcessing) {
                this.renderPipeline.imageProcessing.exposure = vr.exposure;
                this.renderPipeline.imageProcessing.contrast = vr.contrast;
                this.renderPipeline.imageProcessing.toneMappingEnabled = false; // Skip tone mapping in VR
                this.renderPipeline.imageProcessing.vignetteEnabled = false; // No vignette in VR (causes discomfort)
            }
            this.renderPipeline.grainEnabled = false;
            this.renderPipeline.chromaticAberrationEnabled = false;
            
            log.info('⚡ VR post-processing: bloom + contrast enabled, expensive effects disabled');
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
        
        // #4 OPTIMIZED: Reduce glow layer intensity in VR but keep it ENABLED
        // Glow is essential for laser beams and LED panels to look like real light sources
        if (this.glowLayer) {
            this.glowLayer.isEnabled = true;
            this.glowLayer.intensity = vr.glowIntensity; // Reduced but visible
            log.info('⚡ Reduced glow layer intensity for VR');
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
            
            // Don't freeze dynamic materials (beams, lasers, spots, mirror ball)
            // Use lowercase comparison for consistent matching
            if (matName && !matName.includes('beam') && !matName.includes('laser') && 
                !matName.includes('spot') && !matName.includes('mirror')) {
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
            this.floorFog.emitRate = 20; // Reduced for VR performance
            log.info('⚡ Reduced floor fog emit rate for VR');
        }
        if (this.haze) {
            this.haze.emitRate = 40; // Keep visible for beam visibility
            log.info('⚡ Reduced haze emit rate for VR');
        }
        
        // Keep subtle scene fog in VR for atmospheric depth (reduced density)
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = vr.fogDensity * 0.5; // Half density in VR
        log.info('⚡ Reduced scene fog density for VR');
        
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
        
        // UPGRADE: Restore scene performance priority for desktop
        if (BABYLON.ScenePerformancePriority) {
            this.scene.performancePriority = BABYLON.ScenePerformancePriority.BackwardCompatible;
        }
        this.isInVRMode = false;
        
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
            
            // Restore grain settings for cinematic filmic texture
            if (this.renderPipeline.grain) {
                this.renderPipeline.grain.intensity = 3;
                this.renderPipeline.grain.animated = true;
            }
            
            // Restore chromatic aberration settings for lens realism
            if (this.renderPipeline.chromaticAberration) {
                this.renderPipeline.chromaticAberration.aberrationAmount = 8;
                this.renderPipeline.chromaticAberration.radialIntensity = 0.6;
            }
            
            if (this.renderPipeline.imageProcessing) {
                this.renderPipeline.imageProcessing.exposure = desktop.exposure;
                this.renderPipeline.imageProcessing.contrast = desktop.contrast;
                this.renderPipeline.imageProcessing.toneMappingEnabled = desktop.toneMappingEnabled;
                
                // Restore cinematic vignette
                this.renderPipeline.imageProcessing.vignetteEnabled = true;
                this.renderPipeline.imageProcessing.vignetteWeight = 2.2;
                this.renderPipeline.imageProcessing.vignetteStretch = 0.4;
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
            this.floorFog.emitRate = 40; // Full floor fog for desktop
        }
        if (this.haze) {
            this.haze.emitRate = 80; // Full haze for desktop
        }
        
        // Restore scene fog for desktop (EXP2 matches initial setup for consistent falloff)
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
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
        this.scene.clearColor = new BABYLON.Color3(0.003, 0.003, 0.008); // Near-black with subtle blue - real clubs are DARK
        
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
        
        // Multiplayer disabled - single-player only
        this.networkManager = null;
        this.avatarManager = null;
        this.isMultiplayer = false;
        
        // NPC avatars for atmosphere
        this.npcAvatars = [];
        this.npcDancePositions = [];
        
        // Load environment for PBR reflections
        this.scene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData(
            "https://assets.babylonjs.com/environments/environmentSpecular.env",
            this.scene
        );
        this.scene.environmentIntensity = 0.4; // Enhanced PBR reflections for hyperrealistic surfaces
        
        // Atmospheric fog for depth and haze machine simulation
        // Real clubs have warm-gray smoke machine haze that scatters light beams
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = this.vrSettings.desktop.fogDensity;
        this.scene.fogColor = new BABYLON.Color3(0.015, 0.012, 0.018); // Warm dark haze (smoke machines)
        
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
        
        // Glow layer for dramatic emissive effects (LEDs, lasers, spotlights)
        this.glowLayer = new BABYLON.GlowLayer("glow", this.scene, {
            mainTextureFixedSize: 512,
            blurKernelSize: 16  // Tighter blur so LED patterns stay crisp
        });
        this.glowLayer.intensity = 0.7; // Balanced glow - visible halos without washing out LED patterns
        
        // Custom glow intensity per mesh type - selective glow for realism
        // LED panels and strobes get strong glow, lasers get intense glow, structures get none
        this.glowLayer.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
            const name = mesh.name || '';
            if (name.startsWith('ledPanel_')) {
                // LED panels: subtle glow so patterns/shapes remain clearly visible
                result.set(
                    material.emissiveColor.r * 0.6,
                    material.emissiveColor.g * 0.6,
                    material.emissiveColor.b * 0.6,
                    1.0
                );
            } else if (name.startsWith('strobe')) {
                // Strobes: strong glow for flash impact
                result.set(
                    material.emissiveColor.r * 2.0,
                    material.emissiveColor.g * 2.0,
                    material.emissiveColor.b * 2.0,
                    1.0
                );
            } else if (name.startsWith('laser') || name.includes('Emitter')) {
                // Laser cores: intense glow (lasers should cut through haze)
                result.set(
                    material.emissiveColor.r * 3.0,
                    material.emissiveColor.g * 3.0,
                    material.emissiveColor.b * 3.0,
                    1.0
                );
            } else if (name.includes('lens') || name.includes('lightSource') || name.includes('Lens')) {
                // Fixture lenses: visible glow (like real stage lights)
                result.set(
                    material.emissiveColor.r * 1.5,
                    material.emissiveColor.g * 1.5,
                    material.emissiveColor.b * 1.5,
                    1.0
                );
            } else if (name.includes('exitSign') || name.includes('stepLight') || name.includes('danceFloorLED')) {
                // Safety and decorative LEDs: subtle glow
                result.set(
                    material.emissiveColor.r * 0.8,
                    material.emissiveColor.g * 0.8,
                    material.emissiveColor.b * 0.8,
                    1.0
                );
            } else {
                // Everything else: no glow (prevents unwanted bloom on structural meshes)
                result.set(0, 0, 0, 0);
            }
        };
        
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
                                                this.movementFeature.movementSpeed = 4.5; // Fast sprint
                                            }
                                        } else {
                                            if (this.movementFeature) {
                                                this.movementFeature.movementSpeed = 1.5; // Normal walk speed
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
                                                                this.vecPool.rayOrigin.copyFrom(xrCamera.position);
                                                                this.vecPool.rayDir.set(0, -1, 0);
                                                                const ray = new BABYLON.Ray(this.vecPool.rayOrigin, this.vecPool.rayDir, 2.5);
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
        this.createDJBoothAccessories(); // Add laptop stand with laptop
        this.createPASpeakers();
        
        // Use modular LED wall system
        this.systems.ledWall.createLEDWall();
        log.info('🎨 LED Wall created via LEDWallSystem module');
        
        this.systems.laser.createLasers();
        this.createTrussMountedLights(); // MUST be before createLights() so fixtures exist
        
        // Use modular spotlight system
        this.systems.spotlight.setTrussLights(this.trussLights);
        this.systems.spotlight.createSpotlights();
        // Store reference for compatibility with VJ controls
        this.spotlights = this.systems.spotlight.spotlights;
        log.info('🔦 Spotlights created via SpotlightSystem module');
        
        this.createLights(); // Creates other lights (ambient, etc.) - skips spotlights if modular
        
        // Strobe lights
        this.systems.strobe.createStrobeLights();
        
        // Volumetric smoke/fog
        this.systems.haze.createHaze();
        
        // Disco/mirror ball
        this.systems.mirrorBall.createMirrorBall();
        
        // Entrance, bar, and dance floor lighting removed for cleaner look
        this.createSafetyDetails(); // Exit signs only
        this.createBar(); // Bar area with counter, stools, bottles
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        this.setupVJControlInteraction(); // Add VJ control button clicks
        
        // Create dancing NPC avatars on the dancefloor
        await this.createDancingNPCs();
        
        // UPGRADE: Create frozen reflection probe for the dance floor
        // Must be called AFTER all geometry is created so the probe captures everything
        this.createFloorReflectionProbe();
        
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
            try {
                this.updateAnimations();
            } catch (e) {
                log.error('Animation error:', e);
            }
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

        const desktop = this.vrSettings.desktop;

        // Create ENHANCED rendering pipeline for hyperrealistic cinematic effects
        // Pass cameras array in constructor to avoid "reuse" warnings from addCamera()
        const pipeline = new BABYLON.DefaultRenderingPipeline(
            "defaultPipeline",
            true, // HDR enabled for better color range
            this.scene,
            this.camera ? [this.camera] : [] // Pass camera array directly
        );
        
        // FXAA anti-aliasing for smooth edges (essential for immersion)
        pipeline.fxaaEnabled = desktop.fxaaEnabled;
        
        // ENHANCED Bloom for dramatic glowing lights - key to club atmosphere
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = desktop.bloomThreshold;
        pipeline.bloomWeight = desktop.bloomWeight;
        pipeline.bloomKernel = 128; // Wide kernel for smooth, cinematic bloom halos
        pipeline.bloomScale = desktop.bloomScale;
        
        // Chromatic aberration for realistic camera lens simulation (desktop only)
        pipeline.chromaticAberrationEnabled = desktop.chromaticAberrationEnabled;
        if (pipeline.chromaticAberration) {
            pipeline.chromaticAberration.aberrationAmount = 8;     // Subtle color fringing at edges
            pipeline.chromaticAberration.radialIntensity = 0.6;    // Concentrated at edges (lens-like)
        }
        
        // Film grain for cinematic texture (desktop only)
        pipeline.grainEnabled = desktop.grainEnabled;
        if (pipeline.grain) {
            pipeline.grain.intensity = 3;         // Very subtle grain
            pipeline.grain.animated = true;       // Animated for film-like feel
        }
        
        // Sharpen for crystal-clear details
        pipeline.sharpenEnabled = true;
        pipeline.sharpen.edgeAmount = 0.35; // Crisp edge definition
        pipeline.sharpen.colorAmount = desktop.sharpenAmount;
        
        // ENHANCED Image processing for cinematic depth
        pipeline.imageProcessingEnabled = true;
        pipeline.imageProcessing.contrast = desktop.contrast;
        pipeline.imageProcessing.exposure = desktop.exposure;
        pipeline.imageProcessing.toneMappingEnabled = desktop.toneMappingEnabled;
        pipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
        
        // Cinematic vignette - darkens edges for immersive club atmosphere
        pipeline.imageProcessing.vignetteEnabled = true;
        pipeline.imageProcessing.vignetteWeight = 2.2;          // Stronger edge darkening for club feel
        pipeline.imageProcessing.vignetteStretch = 0.4;         // Tighter vignette
        pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0, 0, 0.02, 0); // Subtle blue-black edge
        pipeline.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
        
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
        // Uses full PBRMaterial with clearcoat for polished/wet nightclub floor look
        const floorMat = this.materialFactory.getPreset('floorPolished');
        
        // Apply downloaded wood textures if available
        if (this.concreteTextures && this.concreteTextures.floor) {
            log.info('🎨 Applying ENHANCED floor textures (Polyhaven - Large Floor Tiles) with clearcoat');
            this.textureLoader.applyTexturesToMaterial(floorMat, this.concreteTextures.floor);
            // Dark polished tiles for modern nightclub aesthetic
            floorMat.albedoColor = new BABYLON.Color3(0.12, 0.12, 0.15); 
            
            // Override roughness for polished look (wet floor effect)
            floorMat.roughness = 0.25; 
            floorMat.metallic = 0.08;
            
            // Reduce roughness map influence to keep polished look
            if (floorMat.metallicTexture) {
                floorMat.metallicTexture.level = 0.4; // Reduce roughness map strength for shinier surface
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
            floorMat.albedoColor = new BABYLON.Color3(0.15, 0.15, 0.18); // Dark polished concrete
        }
        
        // ENHANCED PBR properties for hyperrealistic polished floor
        // (environmentIntensity, directIntensity, specularIntensity set via preset)
        
        floor.material = floorMat;
        floor.receiveShadows = false; // Optimization Phase 3: Disable shadows on floor
        floor.freezeWorldMatrix(); // OPTIMIZATION: Freeze static floor mesh
        floor.doNotSyncBoundingInfo = true; // Skip bounding info updates
    }

    /**
     * UPGRADE: Create a frozen ReflectionProbe for realistic floor reflections
     * Captures the club environment (trusses, LED wall, ceiling, walls) into a cube map
     * and applies it to the polished floor PBR material.
     * Uses REFRESHRATE_RENDER_ONCE so it's captured once and never re-rendered (free at runtime).
     * Call this AFTER all geometry is created so the probe captures everything.
     */
    createFloorReflectionProbe() {
        if (!this.floorMesh || !this.floorMesh.material) {
            log.warn('⚠️ Cannot create floor reflection probe - floor mesh not found');
            return;
        }
        
        // Create a low-res cube map probe at dance floor level
        // 128px per face is sufficient for blurry floor reflections (roughness 0.25)
        const probe = new BABYLON.ReflectionProbe("floorReflectionProbe", 256, this.scene);
        probe.position = new BABYLON.Vector3(0, 0.5, -12); // Dance floor center, slightly above floor
        
        // CRITICAL: Render only ONCE (frozen probe) - zero runtime cost after first frame
        probe.refreshRate = BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
        
        // Add key static meshes to the probe's render list
        // These are the objects that should appear reflected in the floor
        const renderList = probe.renderList;
        this.scene.meshes.forEach(mesh => {
            if (!mesh.name) return;
            const n = mesh.name.toLowerCase();
            // Include structural and decorative elements (skip floor itself, beams, pools, gobos)
            if (n.includes('wall') || n.includes('ceiling') || n.includes('truss') ||
                n.includes('brace') || n.includes('pillar') || n.includes('speaker') ||
                n.includes('djtable') || n.includes('platform') || n.includes('rail') ||
                n.includes('pipe') || n.includes('led') || n.includes('brick') ||
                n.includes('mirrorball') || n.includes('fixture') || n.includes('sign')) {
                renderList.push(mesh);
            }
        });
        
        // Apply the probe's cube texture to the floor PBR material
        const floorMat = this.floorMesh.material;
        
        // Unfreeze material if needed to apply reflection
        if (floorMat.unfreeze) floorMat.unfreeze();
        
        floorMat.reflectionTexture = probe.cubeTexture;
        floorMat.reflectionTexture.coordinatesMode = BABYLON.Texture.CUBIC_REFLECTION_MODE;
        
        // Moderate reflection level - polished but not mirror-like
        // The floor already has roughness 0.25 which naturally blurs the reflection
        floorMat.environmentIntensity = 0.6; // Subtle ambient reflections
        
        // Re-freeze material after applying reflection
        floorMat.freeze();
        
        this.floorReflectionProbe = probe;
        log.info(`🪞 Floor reflection probe created (128px cube, ${renderList.length} meshes, frozen)`);
    }

    createWalls() {
        // PBR material for walls — raw bunker concrete
        const wallMat = this.materialFactory.getPreset('wall');

        // Apply downloaded concrete wall textures if available
        // UNDERGROUND REDESIGN: Use concrete texture with dark, cold tint
        if (this.concreteTextures && this.concreteTextures.walls) {
            log.info('🎨 Applying wall textures (Polyhaven - Raw Concrete)');
            this.textureLoader.applyTexturesToMaterial(wallMat, this.concreteTextures.walls);
            wallMat.baseColor = new BABYLON.Color3(0.12, 0.11, 0.10); // Dark, cold concrete — smoke-stained
            wallMat.roughness = 0.92; // Raw poured concrete — no polish
            wallMat.environmentIntensity = 0.05; // Concrete barely reflects
        }

        // Back wall — UNDERGROUND: 5m height (walls slightly taller than ceiling gap)
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 25,
            height: 5,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 2.5, -21);
        backWall.material = wallMat;
        backWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        backWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        backWall.doNotSyncBoundingInfo = true;
        
        // Left wall
        const leftWall = BABYLON.MeshBuilder.CreateBox("leftWall", {
            width: 0.5,
            height: 5,
            depth: 45
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-12.5, 2.5, -10);
        leftWall.material = wallMat;
        leftWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        leftWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        leftWall.doNotSyncBoundingInfo = true;
        
        // Right wall
        const rightWall = BABYLON.MeshBuilder.CreateBox("rightWall", {
            width: 0.5,
            height: 5,
            depth: 45
        }, this.scene);
        rightWall.position = new BABYLON.Vector3(12.5, 2.5, -10);
        rightWall.material = wallMat;
        rightWall.receiveShadows = false; // Optimization Phase 3: Disable shadows on walls
        rightWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        rightWall.doNotSyncBoundingInfo = true;
        
        // Front wall
        const frontWall = BABYLON.MeshBuilder.CreateBox("frontWall", {
            width: 25,
            height: 5,
            depth: 0.5
        }, this.scene);
        frontWall.position = new BABYLON.Vector3(0, 2.5, 0);
        frontWall.material = wallMat;
        frontWall.receiveShadows = false; // Optimization: disable shadows on walls
        frontWall.freezeWorldMatrix(); // OPTIMIZATION: Freeze static wall
        frontWall.doNotSyncBoundingInfo = true;
        
        // Add industrial wall details
        this.createIndustrialWallDetails();
    }

    createIndustrialWallDetails() {
        // UNDERGROUND CLUB: Exposed raw concrete, dark stained brick, industrial pipes
        const brickMat = this.materialFactory.getPreset('brick');

        // Apply texture with very dark, smoke-stained treatment
        if (this.concreteTextures && this.concreteTextures.walls) {
            this.textureLoader.applyTexturesToMaterial(brickMat, this.concreteTextures.walls);
            brickMat.baseColor = new BABYLON.Color3(0.15, 0.12, 0.1); // Dark smoke-stained brick
        }

        // Concrete pillar material
        const pillarMat = this.materialFactory.getPreset('pillar');

        if (this.concreteTextures && this.concreteTextures.ceiling) {
            this.textureLoader.applyTexturesToMaterial(pillarMat, this.concreteTextures.ceiling);
            pillarMat.roughness = 0.9;
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
                height: 4.5,
                depth: 0.6
            }, this.scene);
            pillar.position = new BABYLON.Vector3(pos.x, 2.25, pos.z);
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
            pipe.position = new BABYLON.Vector3(run.start.x, 4.0, (run.start.z + run.end.z) / 2);
            pipe.rotation.x = Math.PI / 2;
            pipe.material = pipeMat;
            pipesToMerge.push(pipe);
            
            // Add smaller conduit pipes next to main pipe
            const conduit = BABYLON.MeshBuilder.CreateCylinder("conduit" + i, {
                diameter: 0.08,
                height: pipeLength,
                tessellation: 8
            }, this.scene);
            conduit.position = new BABYLON.Vector3(run.start.x - 0.25, 3.8, (run.start.z + run.end.z) / 2);
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
        
        // OPTIMIZATION: Freeze exit sign material
        if (exitSignMat.freeze) exitSignMat.freeze();
        
        // === NEON WALL SIGNS ===
        // Decorative neon tube art on walls (club atmosphere)
        const neonSigns = [
            { text: 'CLUB', pos: new BABYLON.Vector3(12.4, 4, -10), rot: -Math.PI/2, color: [1, 0, 0.4], w: 2.0, h: 0.5 },
            { text: 'VR', pos: new BABYLON.Vector3(-12.4, 3.5, -14), rot: Math.PI/2, color: [0, 0.5, 1], w: 1.2, h: 0.5 },
            { text: 'DANCE', pos: new BABYLON.Vector3(0, 3, 1.7), rot: Math.PI, color: [1, 0.2, 1], w: 2.5, h: 0.5 }
        ];
        
        neonSigns.forEach((sign, i) => {
            const neonPlane = BABYLON.MeshBuilder.CreatePlane(`neonSign${i}`, {
                width: sign.w, height: sign.h
            }, this.scene);
            neonPlane.position = sign.pos;
            neonPlane.rotation.y = sign.rot;
            
            const neonMat = new BABYLON.StandardMaterial(`neonMat${i}`, this.scene);
        
            neonMat.emissiveColor = new BABYLON.Color3(sign.color[0], sign.color[1], sign.color[2]);
            neonMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            neonMat.specularColor = new BABYLON.Color3(0, 0, 0);
            neonMat.disableLighting = true;
            neonMat.alpha = 0.95;
            neonPlane.material = neonMat;
            neonPlane.isPickable = false;
            neonPlane.freezeWorldMatrix();
            neonPlane.doNotSyncBoundingInfo = true;
        });
        
        // === PLATFORM STEP LIGHTS ===
        // Small emissive discs along DJ platform edge (safety + atmosphere)
        const platformEdgeZ = -16; // Front edge of DJ platform
        for (let x = -2.5; x <= 2.5; x += 1.0) {
            const stepLight = BABYLON.MeshBuilder.CreateDisc(`stepLight_${x}`, {
                radius: 0.06, tessellation: 8
            }, this.scene);
            stepLight.position = new BABYLON.Vector3(x, 0.52, platformEdgeZ);
            stepLight.rotation.x = -Math.PI / 2; // Face upward
            
            const stepMat = new BABYLON.StandardMaterial(`stepLightMat_${x}`, this.scene);
        
            stepMat.emissiveColor = new BABYLON.Color3(0.2, 0.3, 1); // Cool blue
            stepMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            stepMat.disableLighting = true;
            stepLight.material = stepMat;
            stepLight.isPickable = false;
            stepLight.freezeWorldMatrix();
            stepLight.doNotSyncBoundingInfo = true;
        }
        
        log.info("✅ Created safety details (exit signs, neon signs, step lights) - frozen for performance");
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
        // UNDERGROUND: Low ceiling at 4.5m — oppressive, intimate
        const ceiling = BABYLON.MeshBuilder.CreateBox("ceiling", {
            width: 35,
            height: 0.3,
            depth: 45
        }, this.scene);
        ceiling.position = new BABYLON.Vector3(0, 4.5, -10);
        
        // Raw concrete ceiling — dark, heavy, industrial
        const ceilingMat = this.materialFactory.getPreset('ceiling');
        
        // Apply downloaded concrete ceiling textures if available
        if (this.concreteTextures && this.concreteTextures.ceiling) {
            log.info('🎨 Applying ceiling textures (Raw Concrete)');
            this.textureLoader.applyTexturesToMaterial(ceilingMat, this.concreteTextures.ceiling);
            
            // UNDERGROUND: Ceiling should nearly disappear into darkness
            ceilingMat.baseColor = new BABYLON.Color3(0.05, 0.05, 0.06);
            ceilingMat.roughness = 0.95;
            ceilingMat.environmentIntensity = 0.03;
        }
        
        ceiling.material = ceilingMat;
        ceiling.receiveShadows = false; // Optimization Phase 3: Disable shadows on ceiling
        ceiling.freezeWorldMatrix(); // OPTIMIZATION: Freeze static ceiling
        ceiling.doNotSyncBoundingInfo = true;

        // === UNDERGROUND CLUB: Exposed ceiling infrastructure ===
        // Pipes and ducts mounted directly to the low concrete ceiling
        const pipeMat = this.materialFactory.getPreset('pipe');
        
        // Main ventilation duct — runs along left wall, just below ceiling
        const ventDuct = BABYLON.MeshBuilder.CreateCylinder("ventDuct", {
            diameter: 0.6,
            height: 45,
            tessellation: 16
        }, this.scene);
        ventDuct.rotation.x = Math.PI / 2;
        ventDuct.position = new BABYLON.Vector3(-11.5, 4.0, -10);
        ventDuct.material = pipeMat;
        ventDuct.freezeWorldMatrix();
        ventDuct.doNotSyncBoundingInfo = true;

        // Smaller water/electrical conduit pipes
        const pipe1 = BABYLON.MeshBuilder.CreateCylinder("ceilingPipe1", {
            diameter: 0.12,
            height: 45,
            tessellation: 8
        }, this.scene);
        pipe1.rotation.x = Math.PI / 2;
        pipe1.position = new BABYLON.Vector3(11.8, 4.2, -10);
        pipe1.material = pipeMat;
        pipe1.freezeWorldMatrix();
        pipe1.doNotSyncBoundingInfo = true;

        const pipe2 = BABYLON.MeshBuilder.CreateCylinder("ceilingPipe2", {
            diameter: 0.1,
            height: 25,
            tessellation: 8
        }, this.scene);
        pipe2.rotation.z = Math.PI / 2;
        pipe2.position = new BABYLON.Vector3(0, 4.3, -5);
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
        
        // UNDERGROUND: Truss grid at 3.8m — just below the 4.5m ceiling
        // Tight spacing creates an oppressive cage of black metal above the dancefloor
        const truss1 = createBoxTruss("truss1", 24, new BABYLON.Vector3(0, 3.8, -8));
        
        // Truss 2 - Middle (center of dance floor)
        const truss2 = createBoxTruss("truss2", 24, new BABYLON.Vector3(0, 3.8, -12));
        
        // Truss 3 - Back (near LED wall)
        const truss3 = createBoxTruss("truss3", 24, new BABYLON.Vector3(0, 3.8, -16));
        
        // Store horizontal trusses for attachment
        this.horizontalTrusses = [truss1, truss2, truss3];
        
        // Cross beams connecting the trusses at the sides (X = -8 and +8)
        // These run perpendicular to main trusses, connecting them together
        // Length of 10m covers Z=-8 to Z=-18 (connecting trusses 1, 2, and 3)
        this.sideTrusses = {};
        const leftSideBeam = createBoxTruss("crossBeamLeft", 10, new BABYLON.Vector3(-8, 3.8, -12));
        leftSideBeam.rotation.y = Math.PI / 2;
        this.sideTrusses[-8] = leftSideBeam;
        
        const rightSideBeam = createBoxTruss("crossBeamRight", 10, new BABYLON.Vector3(8, 3.8, -12));
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
            createChainHoist(new BABYLON.Vector3(pos.x, 4.2, pos.z), "hoist" + i);
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
            cable.position = new BABYLON.Vector3(pos.x, 4.2, pos.z);
            cable.isPickable = false;
            
            // Turnbuckle tensioner (middle of cable)
            const turnbuckle = BABYLON.MeshBuilder.CreateCylinder("turnbuckle" + i, {
                diameter: 0.04,
                height: 0.12,
                tessellation: 12
            }, this.scene);
            turnbuckle.position = new BABYLON.Vector3(pos.x, 4.2, pos.z);
            turnbuckle.isPickable = false;
            
            // End eye bolts
            const eyeBolt1 = BABYLON.MeshBuilder.CreateTorus("eyeBolt1_" + i, {
                diameter: 0.03,
                thickness: 0.006,
                tessellation: 12
            }, this.scene);
            eyeBolt1.rotation.z = Math.PI / 2;
            eyeBolt1.position = new BABYLON.Vector3(pos.x, 4.4, pos.z);
            eyeBolt1.material = turnbuckleMat;
            eyeBolt1.isPickable = false;
            
            const eyeBolt2 = BABYLON.MeshBuilder.CreateTorus("eyeBolt2_" + i, {
                diameter: 0.03,
                thickness: 0.006,
                tessellation: 12
            }, this.scene);
            eyeBolt2.rotation.z = Math.PI / 2;
            eyeBolt2.position = new BABYLON.Vector3(pos.x, 4.05, pos.z);
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
        platformTop.position = new BABYLON.Vector3(0, 0.51, -18);
        
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

    // Blinders removed - strobes provide sufficient impact lighting
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
        
        // UPGRADE: Create shared beam gradient texture for volumetric beam brightness falloff
        // Simulates realistic light scatter through atmospheric haze:
        // - Bright mid-section (accumulated haze scattering)
        // - Softer near floor (smooth termination, hides hard clip plane edge)
        // - Moderate near fixture (concentrated but less path length)
        // On cylinder UV: V=0 = bottom (fixture/narrow), V=1 = top (floor/wide)
        // On canvas: Y=0 = top (maps to V=1 = floor), Y=H = bottom (maps to V=0 = fixture)
        if (!this._beamGradientTexture) {
            const gradH = 128;
            const gradCanvas = document.createElement('canvas');
            gradCanvas.width = 4;   // Narrow - uniform around circumference
            gradCanvas.height = gradH;
            const gCtx = gradCanvas.getContext('2d');
            
            const beamGrad = gCtx.createLinearGradient(0, 0, 0, gradH);
            // Canvas Y=0 → V=1 (floor/wide end): soft termination
            beamGrad.addColorStop(0.0,  'rgb(77,77,77)');    // V=1.0: 30% - soft fade at floor
            beamGrad.addColorStop(0.08, 'rgb(128,128,128)'); // V=0.92: 50% - quickening
            beamGrad.addColorStop(0.25, 'rgb(230,230,230)'); // V=0.75: 90% - entering mid zone
            beamGrad.addColorStop(0.45, 'rgb(255,255,255)'); // V=0.55: 100% - peak brightness
            beamGrad.addColorStop(0.65, 'rgb(255,255,255)'); // V=0.35: 100% - sustained peak
            beamGrad.addColorStop(0.85, 'rgb(217,217,217)'); // V=0.15: 85% - near fixture
            beamGrad.addColorStop(1.0,  'rgb(179,179,179)'); // V=0.0: 70% - at fixture lens
            
            gCtx.fillStyle = beamGrad;
            gCtx.fillRect(0, 0, 4, gradH);
            
            this._beamGradientTexture = new BABYLON.DynamicTexture("beamGradient", gradCanvas, this.scene, false);
            this._beamGradientTexture.hasAlpha = false; // RGB only, no alpha channel needed
            this._beamGradientTexture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._beamGradientTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            this._beamGradientTexture.update();
        }
        
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
            // UPGRADE: Enable diffuse for projectionTexture gobo patterns on surfaces
            // Diffuse at 15% intensity provides visible gobo patterns without overwhelming scene
            spot.diffuse = this.currentSpotColor.scale(0.15);
            spot.specular = this.currentSpotColor; // Specular for floor reflections
            spot.intensity = 12; // Increased for visibility
            spot.range = 25;
            
            // UPGRADE: SpotLight.projectionTexture support (physically correct gobo projection)
            // Near/far define the frustum for texture projection (like shadow mapping)
            spot.projectionTextureLightNear = 0.5;
            spot.projectionTextureLightFar = 25;
            
            spot.setEnabled(false); // Start disabled - will be enabled by animation loop based on lightsActive state
            
            // SPOTLIGHT BEAM - Cone that extends FROM fixture DOWN to floor/wall
            // When cylinder points DOWN, its +Y local axis points toward surface
            // So: diameterTop (at +Y local) should be WIDE (at surface hit)
            //     diameterBottom (at -Y local) should be NARROW (at fixture)
            // Higher tessellation creates smoother cone edges for hyperrealistic look
            const beam = BABYLON.MeshBuilder.CreateCylinder("spotBeam" + i, {
                diameterTop: 2.0,      // Wide end at surface - 2.0m diameter
                diameterBottom: 0.12,  // Narrower lens opening for tighter source point
                height: 1,             // Will be scaled to actual beam length
                tessellation: 12,      // Higher tessellation for smoother cone (was 8)
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
            
            // UPGRADE: Beam gradient texture for distance-based brightness falloff
            // On a cylinder, V=0 at bottom (fixture/narrow), V=1 at top (floor/wide)
            // Canvas Y=0 → V=1 (floor), Canvas Y=height → V=0 (fixture)
            // This gives realistic light scatter: brighter mid-beam (haze accumulation),
            // softer at floor (smooth termination instead of hard clip), moderate at fixture
            if (this._beamGradientTexture) {
                beamMat.emissiveTexture = this._beamGradientTexture;
            }
            
            // UPGRADE: Share one noise texture across all spotlight beams (was 6 separate GPU textures)
            if (!this._spotBeamNoiseTexture) {
                this._spotBeamNoiseTexture = new BABYLON.NoiseProceduralTexture("sharedBeamNoise", 128, this.scene);
                this._spotBeamNoiseTexture.animationSpeedFactor = 0.6;
                this._spotBeamNoiseTexture.persistence = 0.35;
                this._spotBeamNoiseTexture.brightness = 0.55;
                this._spotBeamNoiseTexture.octaves = 4;
            }
            beamMat.opacityTexture = this._spotBeamNoiseTexture; // Shared noise for smoke particles
            
            beamMat.alpha = 0.18; // Base alpha (will be dynamically adjusted in render loop)
            beamMat.alphaMode = BABYLON.Engine.ALPHA_COMBINE; // Standard alpha blending respects depth
            beamMat.backFaceCulling = false; // Visible from all angles
            beamMat.disableLighting = true; // Self-illuminated
            beamMat.useAlphaFromDiffuseTexture = false;
            
            // CRITICAL: Beam must respect depth buffer to NOT render through NPCs
            // ALPHA_COMBINE properly discards fragments behind opaque geometry
            beamMat.disableDepthWrite = true; // Don't write to depth (transparent object)
            beamMat.separateCullingPass = false;
            beamMat.needDepthPrePass = false;
            beamMat.zOffset = -2; // Ensure beam renders slightly behind at equal depth
            
            // HYPERREALISTIC: Clip plane to hide beam below floor level (y < 0)
            // This allows beam to extend past floor for tilted angles while hiding the portion below
            // Babylon.js clips fragments where dot(normal, pos) + d < 0
            // To clip y < 0 (keep y >= 0): normal = (0, -1, 0), d = 0 → clips where -y < 0 (y > 0)? NO
            // Actually: normal = (0, 1, 0), d = 0 clips where y + 0 < 0, i.e. y < 0 ✓
            // But StandardMaterial uses clipPlane differently - it clips where result > 0
            // So we need normal (0, -1, 0), d = 0 to clip where -y + 0 > 0, i.e. y < 0 ✓
            beamMat.clipPlane4 = new BABYLON.Plane(0, -1, 0, 0.01); // Clip below floor level
            
            beam.material = beamMat;
            beam.visibility = 1.0;
            beam.renderingGroupId = 1; // Render after opaque objects
            
            // PERFORMANCE: Removed beamGlow (outer glow cylinder) - caused doubled beam effect
            const beamGlow = null;
            const beamGlowMat = null;

            
            // HYPERREALISTIC LIGHT POOL - Physics-accurate spotlight floor projection
            // Based on real optics: inverse-square falloff, Lambert's cosine law, Fresnel scattering
            
            // Create physics-accurate radial gradient texture (reuse across all pools)
            if (!this._poolGradientTexture) {
                const gradientSize = 512; // High resolution for smooth physics-based falloff
                const gradientCanvas = document.createElement('canvas');
                gradientCanvas.width = gradientSize;
                gradientCanvas.height = gradientSize;
                const ctx = gradientCanvas.getContext('2d');
                
                // PHYSICS-ACCURATE GRADIENT using inverse-square law with Gaussian hot spot
                // Real spotlight beam profiles have:
                // 1. Bright central hot spot (Gaussian distribution)
                // 2. Field angle region (inverse-square falloff)
                // 3. Soft penumbra edge (Fresnel scattering)
                const gradient = ctx.createRadialGradient(
                    gradientSize/2, gradientSize/2, 0,
                    gradientSize/2, gradientSize/2, gradientSize/2
                );
                
                // Physics model: I(r) = I₀ * exp(-r²/σ²) for hot spot + 1/r² falloff
                // Hot spot (beam angle) typically 10-15% of total, field (flood angle) 50-60%
                // σ = 0.15 for tight hot spot, with inverse-square beyond
                const hotSpotSize = 0.12; // 12% of radius is hot spot
                const fieldSize = 0.55;   // 55% is field angle
                
                gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');      // Center peak
                gradient.addColorStop(hotSpotSize * 0.5, 'rgba(255, 255, 255, 0.98)'); // Gaussian plateau
                gradient.addColorStop(hotSpotSize, 'rgba(255, 255, 255, 0.85)');  // Hot spot edge
                gradient.addColorStop(0.25, 'rgba(255, 255, 255, 0.55)');  // Field region (1/r² starts)
                gradient.addColorStop(fieldSize, 'rgba(255, 255, 255, 0.22)');  // Field edge
                gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.08)');  // Penumbra (soft scatter)
                gradient.addColorStop(0.90, 'rgba(255, 255, 255, 0.02)');  // Fresnel edge scatter
                gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');    // Full transparency
                
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, gradientSize, gradientSize);
                
                this._poolGradientTexture = new BABYLON.DynamicTexture("poolGradient", gradientCanvas, this.scene, false);
                this._poolGradientTexture.hasAlpha = true;
                this._poolGradientTexture.update();
            }
            
            // Main light pool with soft gradient
            const lightPool = BABYLON.MeshBuilder.CreateDisc("lightPool" + i, {
                radius: 1.0, // Larger base radius for better visibility
                tessellation: 32
            }, this.scene);
            lightPool.rotation.x = Math.PI / 2;
            // HYPERREALISTIC: Position pool at floor level (y=0.01, just above to prevent z-fighting)
            // The pool should look like it's ON the floor, not floating
            lightPool.position = new BABYLON.Vector3(pos.x, 0.01, pos.z - 5);
            lightPool.isPickable = false;
            
            // Material with radial gradient for soft edges
            const poolMat = new BABYLON.StandardMaterial("poolMat" + i, this.scene);
        
            poolMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            poolMat.specularColor = new BABYLON.Color3(0, 0, 0);
            poolMat.emissiveColor = this.currentSpotColor.clone();
            poolMat.opacityTexture = this._poolGradientTexture; // Use gradient for soft edges
            poolMat.alpha = 0.9; // High alpha for visible pool
            poolMat.alphaMode = BABYLON.Engine.ALPHA_ADD; // Additive blending for light effect
            poolMat.disableLighting = true;
            poolMat.backFaceCulling = false;
            // Transparent mesh settings
            poolMat.disableDepthWrite = true;
            poolMat.depthFunction = BABYLON.Constants.LEQUAL;
            lightPool.material = poolMat;
            // Use default rendering group (0) so pool renders with floor
            lightPool.renderingGroupId = 0;
            
            // Store reference for gobo texture (null - not using procedural texture anymore)
            const goboTexture = null;
            
            // HYPERREALISTIC SOFT OUTER GLOW - Very soft ambient light spread
            // Creates the "light spill" effect around the main pool
            const lightPoolGlow = BABYLON.MeshBuilder.CreateDisc("lightPoolGlow" + i, {
                radius: 1.5, // Larger glow radius
                tessellation: 32
            }, this.scene);
            lightPoolGlow.rotation.x = Math.PI / 2;
            lightPoolGlow.position = new BABYLON.Vector3(pos.x, 0.005, pos.z - 5); // Just below main pool
            lightPoolGlow.isPickable = false;
            lightPoolGlow.renderingGroupId = 0; // Same group as floor
            
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
            
            // === GOBO PROJECTION DISC ===
            // Creates pattern shapes on floor when gobo is enabled
            const goboProjection = BABYLON.MeshBuilder.CreateDisc("goboProjection" + i, {
                radius: 1.0,
                tessellation: 64
            }, this.scene);
            goboProjection.rotation.x = Math.PI / 2;
            goboProjection.position = new BABYLON.Vector3(pos.x, 0.02, pos.z - 5);
            goboProjection.isPickable = false;
            
            const goboMat = new BABYLON.StandardMaterial("goboMat" + i, this.scene);
        
            goboMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
            goboMat.specularColor = new BABYLON.Color3(0, 0, 0);
            goboMat.emissiveColor = this.currentSpotColor.clone();
            goboMat.alpha = 0.9;
            goboMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
            goboMat.disableLighting = true;
            goboMat.backFaceCulling = false;
            goboMat.disableDepthWrite = true;
            goboProjection.material = goboMat;
            goboProjection.renderingGroupId = 1;
            goboProjection.setEnabled(false); // Hidden by default
            
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
                goboProjection: goboProjection,
                goboMat: goboMat,
                goboLocalRotation: i * (Math.PI / 3), // Offset each spotlight's gobo rotation
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
            root.position = new BABYLON.Vector3(pos.x, 3.5, pos.z);
            
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
        // this.createStrobeLights();
    }


updateAnimations() {       const time = performance.now() / 1000;
        const deltaTime = this.engine.getDeltaTime() / 1000;
        this.frameCounter++;

        const audioData = this.getAudioData() || { baseEnergy: 0, low: 0, mid: 0, high: 0 };

        // Modular System Master Update
        if (this.useModularSystems && this.systems.vjControl) {
            // Sync toggles and settings to the VJ console state
            if (this.systems.laser) this.systems.laser.setActive(this.lasersActive);
            // Sync spot color changes
            if (this.systems.spotlight && this.currentSpotColor) {
               this.systems.spotlight.currentSpotColor = this.currentSpotColor;
            }
            if (this.systems.spotlight) {
                this.systems.spotlight.setActive(this.lightsActive);
                this.systems.spotlight.spotlightSpeed = this.spotlightSpeed || 1.0;
                this.systems.spotlight.spotlightMode = this.spotlightMode;
                this.systems.spotlight.spotlightPattern = this.spotlightPattern;
                this.systems.spotlight.spotStrobeActive = this.spotStrobeActive;
            }
            if (this.systems.mirrorBall) this.systems.mirrorBall.setActive(this.mirrorBallActive);
            if (this.systems.ledWall) this.systems.ledWall.setActive(this.ledWallActive);
            if (this.systems.strobe) this.systems.strobe.setActive(this.strobesActive);
            if (this.systems.haze) this.systems.haze.setActive(this.smokeActive);

            this.systems.vjControl.update(time, audioData);
        }

        // Update NPCs
        if (this.npcAvatars && this.npcAvatars.length > 0) {
            this.updateDancingNPCs(time);
        }
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
            // Use scaleToRef with reusable color to avoid per-call allocation
            color.scaleToRef(brightness, this._ledColor);
            panel.material.emissiveColor = this._ledColor;
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
            // Color gradient from green to red - reuse _ledColor
            const intensity = panel.row / rows;
            this._ledColor.r = intensity;
            this._ledColor.g = 1.0 - intensity;
            this._ledColor.b = 0;
            
            if (brightness > 0) {
                panel.material.emissiveColor.copyFrom(this._ledColor);
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
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
            const rainColor = this.cachedLEDColors.matrixGreen;
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
            
            // Color shift - reuse _ledColor to avoid allocation
            this._ledColor.r = Math.sin(val * Math.PI) * 0.5 + 0.5;
            this._ledColor.g = Math.sin(val * Math.PI + 2) * 0.5 + 0.5;
            this._ledColor.b = Math.sin(val * Math.PI + 4) * 0.5 + 0.5;
            
            panel.material.emissiveColor.copyFrom(this._ledColor);
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
            // Aurora colors (Green/Teal) - reuse cached color
            this._ledColor.r = 0;
            this._ledColor.g = Math.max(0, 1.0 - dist / 4);
            this._ledColor.b = 1.0;
            
            this.updateLEDPanel(panel, this._ledColor, brightness);
        });
    }

    patternOceanWave(color, time, audioData) {
        // Horizontal sine waves
        const cols = this.ledCols || 28;
        const rows = this.ledRows || 8;
        
        this.ledPanels.forEach(panel => {
            const waveHeight = Math.sin(panel.col * 0.3 + time * 2) * 2 + rows/2;
            const brightness = panel.row < waveHeight ? 1.0 : 0.0;
            this.updateLEDPanel(panel, this.cachedLEDColors.oceanBlue, brightness);
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
            
            // Fire colors: Red -> Orange -> Yellow - reuse _ledColor
            this._ledColor.r = 1.0;
            this._ledColor.g = panel.row / rows * 0.8;
            this._ledColor.b = 0;
            
            if (brightness > 0) {
                panel.material.emissiveColor.r = this._ledColor.r * brightness;
                panel.material.emissiveColor.g = this._ledColor.g * brightness;
                panel.material.emissiveColor.b = 0;
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
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
                // Random color - reuse _ledColor
                this._ledColor.r = Math.sin(rand * 100) * 0.5 + 0.5;
                this._ledColor.g = Math.sin(rand * 200) * 0.5 + 0.5;
                this._ledColor.b = Math.sin(rand * 300) * 0.5 + 0.5;
                panel.material.emissiveColor.copyFrom(this._ledColor);
            } else {
                panel.material.emissiveColor.copyFrom(this.cachedColors.black);
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
            
            // HSV to RGB - reuse _ledColor
            const h = hue * 6;
            const c = 1.0;
            const x = c * (1 - Math.abs(h % 2 - 1));
            if (h < 1) { this._ledColor.r = c; this._ledColor.g = x; this._ledColor.b = 0; }
            else if (h < 2) { this._ledColor.r = x; this._ledColor.g = c; this._ledColor.b = 0; }
            else if (h < 3) { this._ledColor.r = 0; this._ledColor.g = c; this._ledColor.b = x; }
            else if (h < 4) { this._ledColor.r = 0; this._ledColor.g = x; this._ledColor.b = c; }
            else if (h < 5) { this._ledColor.r = x; this._ledColor.g = 0; this._ledColor.b = c; }
            else { this._ledColor.r = c; this._ledColor.g = 0; this._ledColor.b = x; }
            
            panel.material.emissiveColor.copyFrom(this._ledColor);
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
            
            // Deep red/pink for heartbeat - reuse _ledColor
            this._ledColor.r = 1.0;
            this._ledColor.g = 0.1 + pulse * 0.2;
            this._ledColor.b = 0.2 + pulse * 0.1;
            this.updateLEDPanel(panel, this._ledColor, brightness);
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
        this._ledColor2.r = 0.2 + breath * 0.6;
        this._ledColor2.g = 0.1 + breath * 0.3;
        this._ledColor2.b = 0.8 - breath * 0.5;
        
        this.ledPanels.forEach(panel => {
            // Gentle radial gradient that expands/contracts with breath
            const centerX = cols / 2;
            const centerY = rows / 2;
            const dist = Math.sqrt(Math.pow(panel.col - centerX, 2) + Math.pow(panel.row - centerY, 2));
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
            
            // Brightness peaks at center and expands outward with breath
            const expandRadius = breath * maxDist * 1.5;
            const brightness = Math.max(0, 1.0 - Math.abs(dist - expandRadius * 0.3) / (3 + breath * 5));
            
            const scaleFactor = brightness * 0.8 + 0.2;
            panel.material.emissiveColor.r = this._ledColor2.r * scaleFactor;
            panel.material.emissiveColor.g = this._ledColor2.g * scaleFactor;
            panel.material.emissiveColor.b = this._ledColor2.b * scaleFactor;
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
            this._ledColor2.set(
                color.r * (0.7 + brightness * 0.3),
                color.g * (0.5 + brightness * 0.5),
                color.b * (0.8 + brightness * 0.2)
            );
            
            this.updateLEDPanel(panel, this._ledColor2, brightness);
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
        
        // Debug toggle
        document.addEventListener('keydown', (e) => {
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
                        
                        // Update ALL light colors immediately (specular for reflections, diffuse for gobo projection)
                        if (this.spotlights) {
                            this.spotlights.forEach((spot, i) => {
                                // Update color references - fixture materials updated in animation loop
                                spot.light.specular = this.currentSpotColor; // Specular for reflections
                                spot.light.diffuse = this.currentSpotColor.scale(0.15); // Diffuse for projectionTexture
                                spot.color = this.currentSpotColor;
                            });
                        }
                        
                        // Flash button feedback
                        clickedButton.material.emissiveColor = clickedButton.onColor;
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 200);
                        
                        log.info(`🎨 Color changed to index ${this.spotColorIndex}`);
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
                                // Immediate color update for spot disc (individual materials - unique emissive per spot)
                                spot.material.emissiveColor = this.mirrorBallSpotlightColor.scale(spot.baseIntensity || 0.7);
                            });
                        }
                        
                        // UPGRADE: Update shared beam material once (not 100× per spot)
                        if (this._sharedMirrorBeamMat) {
                            this._sharedMirrorBeamMat.unfreeze();
                            this._sharedMirrorBeamMat.emissiveColor = this.mirrorBallSpotlightColor.scale(0.8);
                            this._sharedMirrorBeamMat.freeze();
                        }
                        
                        // UPGRADE: Update shared ray material once (not 40× per ray)
                        if (this._sharedMirrorRayMat) {
                            this._sharedMirrorRayMat.unfreeze();
                            this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor;
                            this._sharedMirrorRayMat.freeze();
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
                    } else if (clickedButton.control === "cyclePattern") {
                        // Cycle through spotlight patterns: 0=random, 1=static, 2=mirror, 3=crossed
                        this.spotlightPattern = (this.spotlightPattern + 1) % 4;
                        
                        // Flash button feedback with different colors for each pattern
                        const patternColors = [
                            new BABYLON.Color3(1, 0, 1),    // Pattern 0: Magenta (random)
                            new BABYLON.Color3(0, 1, 1),    // Pattern 1: Cyan (static down)
                            new BABYLON.Color3(1, 0.5, 1),  // Pattern 2: Pink (mirror sweep)
                            new BABYLON.Color3(1, 0.8, 0)   // Pattern 3: Gold (crossed beams)
                        ];
                        clickedButton.material.emissiveColor = patternColors[this.spotlightPattern];
                        setTimeout(() => {
                            clickedButton.material.emissiveColor = clickedButton.offColor;
                        }, 300);
                        
                        const patternNames = ["RANDOM", "STATIC DOWN", "MIRROR SWEEP", "CROSSED BEAMS"];
                        log.info(`🎯 Spotlight pattern: ${patternNames[this.spotlightPattern]}`);
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
                    } else if (clickedButton.control === "fogBurst") {
                        // === MANUAL FOG BURST TRIGGER ===
                        // Immediately triggers all fog machines for dramatic effect
                        if (this.fogMachines) {
                            this.fogMachines.forEach(machine => {
                                machine.isBursting = true;
                                machine.burstTimer = 3.5; // 3.5 second burst
                                machine.emitter.emitRate = 200 * (this.fogIntensity || 1.0);
                                machine.ledMat.emissiveColor = new BABYLON.Color3(1, 0.2, 0); // Red LED
                            });
                            this.lastFogBurst = performance.now() / 1000;
                            
                            // Flash button with bright white
                            clickedButton.material.emissiveColor = new BABYLON.Color3(1, 1, 1);
                            setTimeout(() => {
                                clickedButton.material.emissiveColor = clickedButton.offColor;
                            }, 500);
                            
                            log.info('💨 FOG BURST triggered!');
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
        
        // Build UI with DOM API (avoids innerHTML for CSP compliance)
        const heading = document.createElement('h2');
        heading.textContent = '🎵 Audio Stream';
        heading.style.cssText = 'color: #00ff88; margin: 0 0 20px 0; font-size: 24px;';
        
        const audioUrlField = document.createElement('input');
        audioUrlField.type = 'text';
        audioUrlField.id = 'audioUrlInput';
        audioUrlField.placeholder = 'Paste URL or drop audio file here';
        audioUrlField.style.cssText = 'width: 400px; padding: 12px; font-size: 16px; border: 2px solid #00ff88; background: rgba(0, 0, 0, 0.7); color: #00ff88; border-radius: 5px; margin-bottom: 10px;';
        
        const browseDiv = document.createElement('div');
        browseDiv.style.cssText = 'margin: 10px 0;';
        const browseBtn = document.createElement('button');
        browseBtn.id = 'audioFileBrowseBtn';
        browseBtn.textContent = '📁 Browse File';
        browseBtn.style.cssText = 'padding: 8px 20px; font-size: 14px; background: #0088ff; color: white; border: none; border-radius: 5px; cursor: pointer;';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'audioFileInput';
        fileInput.accept = 'audio/*';
        fileInput.style.display = 'none';
        browseDiv.appendChild(browseBtn);
        browseDiv.appendChild(fileInput);
        
        const btnDiv = document.createElement('div');
        btnDiv.style.cssText = 'margin-top: 15px;';
        const playBtn = document.createElement('button');
        playBtn.id = 'audioPlayBtn';
        playBtn.textContent = '▶️ PLAY';
        playBtn.style.cssText = 'padding: 12px 30px; font-size: 16px; margin: 0 10px; background: #00ff88; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;';
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'audioCancelBtn';
        cancelBtn.textContent = '✖️ CANCEL';
        cancelBtn.style.cssText = 'padding: 12px 30px; font-size: 16px; margin: 0 10px; background: #ff4444; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;';
        btnDiv.appendChild(playBtn);
        btnDiv.appendChild(cancelBtn);
        
        const hint = document.createElement('p');
        hint.textContent = 'Stream URL, local file, or drag & drop';
        hint.style.cssText = 'color: #888; font-size: 14px; margin-top: 15px;';
        
        inputDiv.appendChild(heading);
        inputDiv.appendChild(audioUrlField);
        inputDiv.appendChild(browseDiv);
        inputDiv.appendChild(btnDiv);
        inputDiv.appendChild(hint);
        
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
        
        // Validate URL - must be empty or use http/https protocol
        if (url === "") {
            this.showErrorMessage("Please enter a stream URL or select a file.");
            return;
        }
        
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                this.showErrorMessage("Invalid URL protocol. Use https:// or http://");
                return;
            }
        } catch (e) {
            this.showErrorMessage("Invalid URL format. Please enter a valid stream URL.");
            return;
        }
        
        this.audioElement.src = url;
        log.info(`🎵 Loading audio stream: ${url}`);
        
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
                    
                    // Connect to audio analyzer
                    if (!this.audioSource && window.AudioContext) {
                        this._ensureAudioContext();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        log.info("🎚️ Audio analyzer connected (stream)");
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
                    if (!this.audioSource && window.AudioContext) {
                        this._ensureAudioContext();
                        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
                        this.audioSource.connect(this.audioAnalyser);
                        log.info("🎚️ Audio analyzer connected (file)");
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
            // UNDERGROUND CLUB: All camera heights fit within 4.5m ceiling
            exterior: { pos: new BABYLON.Vector3(0, 1.7, 10), target: new BABYLON.Vector3(0, 2, 0) },
            entrance: { pos: new BABYLON.Vector3(0, 1.7, 2), target: new BABYLON.Vector3(0, 1.7, -15) },
            danceFloor: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 2.5, -18) },
            djBooth: { pos: new BABYLON.Vector3(0, 2.0, -18.5), target: new BABYLON.Vector3(0, 1.7, -10) },
            djSide: { pos: new BABYLON.Vector3(-5, 2.0, -17), target: new BABYLON.Vector3(0, 1.5, -17.5) },
            ledWallClose: { pos: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 2.5, -19) },
            speakers: { pos: new BABYLON.Vector3(-4, 1.7, -14), target: new BABYLON.Vector3(-7, 2.5, -19) },
            truss: { pos: new BABYLON.Vector3(0, 2.5, -8), target: new BABYLON.Vector3(0, 3.5, -12) },
            mirrorBall: { pos: new BABYLON.Vector3(3, 3.0, -12), target: new BABYLON.Vector3(0, 3.8, -12) },
            overview: { pos: new BABYLON.Vector3(-12, 3.5, -5), target: new BABYLON.Vector3(0, 1.5, -15) },
            ceiling: { pos: new BABYLON.Vector3(0, 4.0, -12), target: new BABYLON.Vector3(0, 0, -15) }
        };
        
        const p = presets[preset];
        if (p) {
            // Temporarily disable gravity/collisions for smooth camera transition
            this.camera.applyGravity = false;
            this.camera.checkCollisions = false;
            
            this.camera.position = p.pos.clone();
            this.camera.setTarget(p.target);
            
            // Re-enable collisions after camera settles (short delay for physics)
            setTimeout(() => {
                this.camera.checkCollisions = true;
                // Only re-enable gravity for ground-level presets
                if (p.pos.y < 3.0) {
                    this.camera.applyGravity = false; // Keep false for free camera
                }
            }, 300);
            
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
        
        const url = musicUrlInput.value.trim();
        if (!url) {
            alert('Please enter a music stream URL');
            return;
        }
        
        // Validate URL protocol
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                alert('Invalid URL protocol. Use https:// or http://');
                return;
            }
        } catch (e) {
            alert('Invalid URL format.');
            return;
        }
        
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = "anonymous";
            this._ensureAudioContext();
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioSource.connect(this.audioAnalyser);
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
    
    // ========== GOBO FILTER CONTROL METHODS ==========
    
    /**
     * Toggle gobo filters on/off
     */
    toggleGobo() {
        this.goboEnabled = !this.goboEnabled;
        
        // Apply or remove gobo textures
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                if (spot.goboProjection) {
                    const showGobo = this.goboEnabled && this.lightsActive;
                    spot.goboProjection.setEnabled(showGobo);
                    spot.goboProjection.visibility = showGobo ? 1.0 : 0;
                    if (this.goboEnabled) {
                        this._applyGoboTexture(spot, i);
                        // Hide regular pool when gobo is on (gobo replaces it)
                        if (spot.lightPool) spot.lightPool.visibility = 0;
                    } else {
                        // Clear projectionTexture when gobos disabled
                        if (spot.light.projectionTexture) {
                            spot.light.projectionTexture.dispose();
                            spot.light.projectionTexture = null;
                        }
                        // Show regular pool when gobo disabled
                        if (spot.lightPool && this.lightsActive) spot.lightPool.visibility = 1.0;
                    }
                }
            });
        }
        
        log.info(`🎭 Gobo filters ${this.goboEnabled ? 'enabled' : 'disabled'}`);
        return this.goboEnabled;
    }
    
    /**
     * Set gobo enabled state
     */
    setGoboEnabled(enabled) {
        this.goboEnabled = enabled;
        
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                if (spot.goboProjection) {
                    const showGobo = enabled && this.lightsActive;
                    spot.goboProjection.setEnabled(showGobo);
                    spot.goboProjection.visibility = showGobo ? 1.0 : 0;
                    if (enabled) {
                        this._applyGoboTexture(spot, i);
                        // Hide regular pool
                        if (spot.lightPool) spot.lightPool.visibility = 0;
                    } else {
                        // Clear projectionTexture when gobos disabled
                        if (spot.light.projectionTexture) {
                            spot.light.projectionTexture.dispose();
                            spot.light.projectionTexture = null;
                        }
                        // Show regular pool when gobo disabled
                        if (spot.lightPool && this.lightsActive) spot.lightPool.visibility = 1.0;
                    }
                }
            });
        }
    }
    
    /**
     * Cycle to next gobo pattern
     */
    nextGoboPattern() {
        this.goboPatternIndex = (this.goboPatternIndex + 1) % this.goboPatterns.length;
        
        // Regenerate textures for all spotlights
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                this._applyGoboTexture(spot, i);
            });
        }
        
        const patternName = this.goboPatterns[this.goboPatternIndex];
        log.info(`🎭 Gobo pattern: ${patternName}`);
        return patternName;
    }
    
    /**
     * Set gobo pattern by index or name
     */
    setGoboPattern(pattern) {
        if (typeof pattern === 'string') {
            const idx = this.goboPatterns.indexOf(pattern);
            if (idx >= 0) {
                this.goboPatternIndex = idx;
            }
        } else {
            this.goboPatternIndex = pattern % this.goboPatterns.length;
        }
        
        // Regenerate textures
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                this._applyGoboTexture(spot, i);
            });
        }
    }
    
    /**
     * Get current gobo pattern name
     */
    getGoboPattern() {
        return this.goboPatterns[this.goboPatternIndex];
    }
    
    /**
     * Set gobo rotation speed
     */
    setGoboRotationSpeed(speed) {
        this.goboRotationSpeed = speed;
    }
    
    /**
     * Apply gobo texture to a spotlight's projection disc
     */
    _applyGoboTexture(spot, index) {
        if (!spot.goboProjection || !spot.goboMat) return;
        
        const patternName = this.goboPatterns[this.goboPatternIndex];
        
        // Dispose old texture if exists
        if (spot.goboMat.emissiveTexture) {
            spot.goboMat.emissiveTexture.dispose();
            spot.goboMat.emissiveTexture = null;
        }
        
        // Dispose old projection texture on the SpotLight
        if (spot.light.projectionTexture) {
            spot.light.projectionTexture.dispose();
            spot.light.projectionTexture = null;
        }
        
        // Circle pattern = no texture (plain disc / plain light)
        if (patternName === 'circle') {
            return;
        }
        
        // Create procedural gobo texture for disc mesh overlay
        const texture = this._createGoboTexture(patternName, index);
        if (texture) {
            spot.goboMat.emissiveTexture = texture;
            
            // UPGRADE: Create a second gobo texture for SpotLight.projectionTexture
            // This makes the SpotLight physically project the gobo pattern onto ALL surfaces
            // (floors, walls, objects, NPCs) with proper PBR lighting math
            const projTexture = this._createGoboTexture(patternName, index + '_proj');
            if (projTexture) {
                spot.light.projectionTexture = projTexture;
            }
        }
    }
    
    /**
     * Create procedural gobo texture
     */
    _createGoboTexture(patternName, index) {
        const size = 256;
        const texture = new BABYLON.DynamicTexture("goboTex" + index + "_" + patternName, size, this.scene, true);
        const ctx = texture.getContext();
        
        // Clear with black (transparent areas)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, size, size);
        
        const cx = size / 2;
        const cy = size / 2;
        const radius = size / 2 - 10;
        
        // Circular mask
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.clip();
        
        // Draw pattern in white
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'white';
        
        switch (patternName) {
            case 'star':
                this._drawStar(ctx, cx, cy, radius * 0.9, 6);
                break;
            case 'triangles':
                this._drawTriangles(ctx, cx, cy, radius);
                break;
            case 'squares':
                this._drawSquares(ctx, cx, cy, radius);
                break;
            case 'rings':
                this._drawRings(ctx, cx, cy, radius);
                break;
            case 'spiral':
                this._drawSpiral(ctx, cx, cy, radius);
                break;
            case 'dots':
                this._drawDots(ctx, cx, cy, radius);
                break;
            case 'slats':
                this._drawSlats(ctx, cx, cy, radius);
                break;
            case 'cross':
                this._drawCross(ctx, cx, cy, radius);
                break;
            case 'flower':
                this._drawFlower(ctx, cx, cy, radius);
                break;
        }
        
        ctx.restore();
        texture.update();
        
        texture.hasAlpha = true;
        texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        
        return texture;
    }
    
    // Gobo pattern drawing functions
    _drawStar(ctx, cx, cy, radius, points) {
        const innerRadius = radius * 0.4;
        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const r = i % 2 === 0 ? radius : innerRadius;
            const angle = (i * Math.PI / points) - Math.PI / 2;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }
    
    _drawTriangles(ctx, cx, cy, radius) {
        const triangleSize = radius * 0.4;
        const positions = [
            [0, -0.5], [-0.4, 0.3], [0.4, 0.3],
            [-0.3, -0.2], [0.3, -0.2], [0, 0.4]
        ];
        positions.forEach(([ox, oy]) => {
            const x = cx + ox * radius;
            const y = cy + oy * radius;
            ctx.beginPath();
            ctx.moveTo(x, y - triangleSize * 0.5);
            ctx.lineTo(x - triangleSize * 0.4, y + triangleSize * 0.3);
            ctx.lineTo(x + triangleSize * 0.4, y + triangleSize * 0.3);
            ctx.closePath();
            ctx.fill();
        });
    }
    
    _drawSquares(ctx, cx, cy, radius) {
        const gridSize = 5;
        const cellSize = (radius * 2) / gridSize;
        const startX = cx - radius;
        const startY = cy - radius;
        for (let row = 0; row < gridSize; row++) {
            for (let col = 0; col < gridSize; col++) {
                if ((row + col) % 2 === 0) {
                    ctx.fillRect(startX + col * cellSize + 2, startY + row * cellSize + 2, cellSize - 4, cellSize - 4);
                }
            }
        }
    }
    
    _drawRings(ctx, cx, cy, radius) {
        const ringCount = 4;
        const ringWidth = radius / (ringCount * 2);
        ctx.lineWidth = ringWidth;
        for (let i = 1; i <= ringCount; i++) {
            ctx.beginPath();
            ctx.arc(cx, cy, i * (radius / ringCount) - ringWidth / 2, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    
    _drawSpiral(ctx, cx, cy, radius) {
        const arms = 4;
        const rotations = 1.5;
        ctx.lineWidth = radius * 0.15;
        ctx.lineCap = 'round';
        for (let arm = 0; arm < arms; arm++) {
            const startAngle = (arm * Math.PI * 2) / arms;
            ctx.beginPath();
            for (let t = 0; t <= 1; t += 0.01) {
                const angle = startAngle + t * Math.PI * 2 * rotations;
                const r = t * radius;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    }
    
    _drawDots(ctx, cx, cy, radius) {
        const dotRadius = radius * 0.08;
        const rings = 3;
        for (let ring = 1; ring <= rings; ring++) {
            const ringRadius = (ring / rings) * radius * 0.85;
            const dotCount = ring * 6;
            for (let i = 0; i < dotCount; i++) {
                const angle = (i / dotCount) * Math.PI * 2;
                const x = cx + ringRadius * Math.cos(angle);
                const y = cy + ringRadius * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // Center dot
        ctx.beginPath();
        ctx.arc(cx, cy, dotRadius * 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    _drawSlats(ctx, cx, cy, radius) {
        const slatCount = 7;
        const slatHeight = radius * 0.12;
        const gap = (radius * 2) / (slatCount + 1);
        const startY = cy - radius;
        for (let i = 1; i <= slatCount; i++) {
            const y = startY + i * gap;
            ctx.fillRect(cx - radius, y - slatHeight / 2, radius * 2, slatHeight);
        }
    }
    
    _drawCross(ctx, cx, cy, radius) {
        const armWidth = radius * 0.35;
        const armLength = radius * 0.9;
        ctx.fillRect(cx - armWidth / 2, cy - armLength, armWidth, armLength * 2);
        ctx.fillRect(cx - armLength, cy - armWidth / 2, armLength * 2, armWidth);
    }
    
    _drawFlower(ctx, cx, cy, radius) {
        const petalCount = 8;
        const petalLength = radius * 0.7;
        const petalWidth = radius * 0.35;
        for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * Math.PI * 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.ellipse(0, -petalLength / 2, petalWidth / 2, petalLength / 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        // Center circle
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    
    /**
     * Centralized audio context initialization - prevents multiple AudioContext creation
     * Call this before connecting any audio source to the analyser
     */
    _ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);
            this.audioAnalyser.connect(this.audioContext.destination);
            log.info('🎚️ Audio context initialized');
        }
        // Resume if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        return this.audioContext;
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
                    
                    // CRITICAL: Set rendering group so NPCs properly OCCLUDE beams
                    // Beams use renderingGroupId=1 with additive blending
                    // NPCs must render BEFORE beams (group 0) with depth write enabled
                    // This ensures beams are depth-tested against NPC geometry
                    mesh.renderingGroupId = 0; // Opaque objects group

                    // Ensure mesh writes to depth buffer
                    if (mesh.material) {
                        mesh.material.disableDepthWrite = false;
                        mesh.material.forceDepthWrite = true;
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

}

// Initialize when page loads - DISABLED for splash screen
// Now initialized from splash screen in index.html after user clicks "ENTER CLUB"
// window.addEventListener('DOMContentLoaded', () => {
//     window.vrClub = new VRClub();
// });
    
