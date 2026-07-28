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

        // === GRAPHICS QUALITY TIER ===
        // Hyperrealistic effects (SSR, contact-hardening shadows, supersampling, motion
        // blur) are expensive and scale badly on weak GPUs. Rather than shipping one
        // setting that is either too heavy for laptops or too timid for a desktop GPU,
        // the renderer picks a tier and every heavy effect is gated behind it.
        // A user override persists so the choice survives a reload.
        this.graphicsTier = this.detectGraphicsTier();
        log.info(`🎨 Graphics tier: ${this.graphicsTier}`);

        // Per-tier switches. Nothing here applies in VR — headsets always use the
        // conservative VR path regardless of tier (see applyVRSettings).
        this.qualityTiers = {
            ultra: {
                renderScale: 0.8,          // <1.0 = supersample, then downsample (huge sharpness win)
                pipelineSamples: 4,        // MSAA on the pipeline render target
                bloomKernel: 160,
                ssr: true,
                ssrQuality: 'high',
                motionBlur: true,
                motionBlurSamples: 24,
                contactHardeningShadows: true,
                shadowQuality: 'high',
                anisotropy: 16,
                probeResolution: 512,
                ssaoSamples: 24,
                ssaoExpensiveBlur: true,
                floorShadows: true
            },
            high: {
                renderScale: 1.0,
                pipelineSamples: 4,
                bloomKernel: 128,
                ssr: true,
                ssrQuality: 'balanced',
                motionBlur: false,
                motionBlurSamples: 16,
                contactHardeningShadows: true,
                shadowQuality: 'medium',
                anisotropy: 8,
                probeResolution: 256,
                ssaoSamples: 16,
                ssaoExpensiveBlur: true,
                floorShadows: false
            },
            balanced: {
                renderScale: 1.0,
                pipelineSamples: 1,
                bloomKernel: 96,
                ssr: false,
                ssrQuality: 'balanced',
                motionBlur: false,
                motionBlurSamples: 8,
                contactHardeningShadows: false,
                shadowQuality: 'low',
                anisotropy: 4,
                probeResolution: 128,
                ssaoSamples: 8,
                ssaoExpensiveBlur: false,
                floorShadows: false
            }
        };
        
        // VR optimization settings configuration - ENHANCED FOR HYPERREALISM
        this.vrSettings = {
            desktop: {
                exposure: 1.1,
                contrast: 1.6, // Deep contrast for dramatic club lighting
                bloomWeight: 0.55, // Strong bloom for neon/laser glow (clubs are LUMINOUS)
                bloomThreshold: 0.35, // Catch more light sources (lower = more things glow)
                bloomScale: 0.5, // Wide bloom halo
                glowIntensity: 0.9, // Pronounced glow on emissive surfaces
                ambientIntensity: 0.06, // Very low ambient - club should be DARK except for lighting
                environmentIntensity: 0.5, // Rich PBR reflections for wet/metallic surfaces
                clearColor: new BABYLON.Color3(0.003, 0.003, 0.008), // Near-black with subtle blue tint
                grainEnabled: true, // Filmic grain for cinema feel
                chromaticAberrationEnabled: true, // Lens realism
                toneMappingEnabled: true,
                fxaaEnabled: true,
                sharpenAmount: 0.5,
                fogDensity: 0.028 // Haze/smoke density tuned so spot/laser beams are clearly visible
            },
            vr: {
                exposure: 1.05, // Aligned with desktop so metallic PBR (trusses, fixtures) matches
                contrast: 1.55, // Near-desktop contrast — keep VR/desktop visually consistent
                bloomWeight: 0.22, // VR — lower weight so emissives don't smear across pixels
                bloomThreshold: 0.85, // Only the brightest highlights bloom (laser/spot cores at scale 6-10)
                                      // — LED panels (emissive ~1.0) stop blooming so tile gaps stay visible
                bloomScale: 0.3,
                glowIntensity: 0.5, // Visible glow in VR
                ambientIntensity: 0.06, // Match desktop — keeps shadowed metal readable
                environmentIntensity: 0.5, // MATCH desktop — metallic trusses/pipes/fixtures rely on env reflections
                clearColor: new BABYLON.Color3(0.003, 0.003, 0.008), // Match desktop tint (was pure black)
                grainEnabled: false,
                chromaticAberrationEnabled: false,
                toneMappingEnabled: true, // ENABLE — same color/luminance response as desktop
                edgeSharpness: 0.7,
                colorSharpness: 0.9,
                fxaaEnabled: true,
                fogDensity: 0.022 // Smoke in VR — denser so beams read as 3D volumes, not flat lines
            }
        };
        
        // CRITICAL: Track VR mode to disable frame-skip optimizations
        // Frame-skipping causes different states per eye = epileptic effect
        this.isInVRMode = false;

        // Tier-owned post-process pipelines (created in addPostProcessing()).
        this.ssrPipeline = null;
        this.motionBlur = null;
        
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
        this.audioMasterGain = null;     // Master gain node (post-analyser, pre-destination)
        this.audioCompressor = null;     // Mastering compressor for "loud club" feel without clipping

        // === ACCESSIBILITY ===
        // Photosensitive Safe Mode: globally disables all strobe lights and sharp flashes.
        // Persists across sessions so a returning user with photosensitive epilepsy
        // never sees a strobe by accident. Honored at the single strobe render gate
        // and at the bloom-spike branch.
        this.photosensitiveSafeMode = (() => {
            try { return localStorage.getItem('vrclub.safeMode') === '1'; } catch (_) { return false; }
        })();

        // === HAPTICS ===
        // Bass-driven controller rumble. Off by default to respect battery /
        // user preference; toggle in the VJ menu. Persists across sessions.
        this.bassHapticsEnabled = (() => {
            try { return localStorage.getItem('vrclub.bassHaptics') !== '0'; } catch (_) { return true; }
        })();
        this._lastHapticPulseAt = 0;     // ms timestamp guard (prevents rumble spam)
        this._xrControllers = [];        // Tracked controllers for haptic dispatch
        
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
            warmWhite: new BABYLON.Color3(1, 0.9, 0.7), // Blinder warm white
            // QC O3: cached fog-machine indicator colors (used per frame in
            // the smoke loop — was allocating 5 fresh Color3 objects per fog
            // machine per frame).
            fogActive: new BABYLON.Color3(1, 0.2, 0),       // Red — burst firing
            fogReady: new BABYLON.Color3(0, 0.8, 0),        // Green — ready
            fogContinuous: new BABYLON.Color3(1, 0.5, 0),   // Orange — continuous
            fogStandby: new BABYLON.Color3(0.3, 0.3, 1),    // Blue — standby
            fogOff: new BABYLON.Color3(0.3, 0.3, 0.3)       // Gray — off
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
            rayDir: new BABYLON.Vector3(0, 0, 0),
            // QC O5: dedicated rotation-axis scratch vectors so the laser/spot
            // beam loops can compute Cross + normalize in-place instead of
            // allocating a new Vector3 per beam per frame (~900 alloc/sec).
            laserAxis: new BABYLON.Vector3(0, 0, 0),
            spotAxis: new BABYLON.Vector3(0, 0, 0),
            xAxis: new BABYLON.Vector3(1, 0, 0)
        };
        // QC O5: per-beam quaternions live on the beam objects themselves
        // (lazy-initialised on first use). These shared scratch quats are for
        // the special-case "straight up / straight down" branches that don't
        // depend on per-beam state.
        this._quatIdentity = BABYLON.Quaternion.Identity();
        this._quatFlipX = BABYLON.Quaternion.RotationAxis(this.vecPool.xAxis, Math.PI);
        
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
        // (Per-light-type speed multipliers — including a unified spotlightSpeed —
        // are initialised in a single block below.)
        this.spotlightPattern = 0; // 0=automated/moving, 1=static down, 2=mirror sweep, 3=crossed beams
        
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

        // NOTE: A modular `js/systems/*` lighting layer existed historically but
        // was removed (see QC review). These two fields remain as inert stubs so
        // any leftover `if (this.useModularSystems && this.systems.x)` guards in
        // legacy code paths short-circuit cleanly to the inline implementation.
        this.useModularSystems = false;
        this.systems = {};

        // `init()` is async. Previously its promise was dropped on the floor, so
        // ANY failure (WebGL init, IndexedDB blocked in private mode, a CDN 404,
        // a typo in a create* method) produced nothing but an unhandled rejection
        // in the console while the splash spinner span forever. Surface it.
        this.ready = false;
        this.initPromise = this.init().catch((err) => {
            log.error('❌ VRClub initialisation failed:', err);
            this._handleFatalInitError(err);
            throw err;
        });
    }

    /**
     * Last-resort UI for an unrecoverable startup failure. Without this the user
     * is left looking at an infinite "Loading club experience…" spinner.
     */
    _handleFatalInitError(err) {
        try {
            const loading = document.getElementById('splashLoading');
            if (loading) loading.classList.remove('visible');
            const splash = document.getElementById('splashScreen');
            if (splash) {
                splash.classList.remove('hidden');
                splash.style.display = '';
            }
            const btn = document.getElementById('enterClubBtn');
            if (btn) {
                btn.style.display = '';
                btn.textContent = '↻ RETRY';
            }
        } catch (_) { /* DOM may not exist in a test harness */ }
        this.showErrorMessage(
            'The club failed to load: ' + (err && err.message ? err.message : 'unknown error') +
            '. Check your connection and try again.'
        );
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
                this.renderPipeline.imageProcessing.toneMappingEnabled = vr.toneMappingEnabled; // Honor config (now true) so VR matches desktop tonemapping
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

        // Screen-space reflections are far too expensive for a standalone headset:
        // the pre-pass renderer plus ray marching runs per eye, so the cost roughly
        // doubles exactly where the frame budget is tightest.
        if (this.ssrPipeline) {
            this.ssrPipeline.isEnabled = false;
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssr", this.camera);
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssr", xrCamera);
            log.info('⚡ Screen-space reflections disabled for VR');
        }

        // Motion blur in a headset is actively unpleasant - the blur is keyed to head
        // motion, so every glance smears the whole world and induces sim sickness.
        if (this.motionBlur) {
            this.motionBlur.dispose();
            this.motionBlur = null;
            log.info('⚡ Motion blur disabled for VR');
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
                    // Contact hardening (PCSS) takes many taps per pixel per eye - the
                    // one shadow feature a standalone headset genuinely cannot afford.
                    if ('useContactHardeningShadow' in shadowGen) shadowGen.useContactHardeningShadow = false;
                    shadowGen.usePercentageCloserFiltering = false;
                    shadowGen.filteringQuality = BABYLON.ShadowGenerator.QUALITY_LOW;
                }
            }
        });

        // Drop anisotropy for VR. 4x still keeps the floor readable into the distance
        // but costs a fraction of 16x across two eyes.
        const vrAniso = Math.min(4, this.engine.getCaps().maxAnisotropy || 1);
        this.scene.textures.forEach(tex => {
            if (!tex || tex.isCube || tex.isRenderTarget) return;
            if (tex.anisotropicFilteringLevel > vrAniso) tex.anisotropicFilteringLevel = vrAniso;
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

        // Restore the heavy desktop-only realism effects.
        if (this.ssrPipeline) {
            this.scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline("ssr", this.camera);
            this.ssrPipeline.isEnabled = true;
        } else {
            this._createScreenSpaceReflections();
        }
        this._createMotionBlur();
        
        // Restore render scale. Below 1.0 this SUPERSAMPLES: the scene renders above
        // native resolution and is downsampled on present, which removes shader aliasing
        // that no post-process AA can reach - specular glints on the trusses, the LED
        // wall pixel grid, and the hard edges of every light beam.
        this.engine.setHardwareScalingLevel(this.tierSettings.renderScale);
        
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
        
        // Restore shadow quality for desktop (contact-hardening on capable tiers)
        this._applyShadowQuality();

        // Textures may have been downgraded for VR - restore full anisotropy.
        this._applyAnisotropicFiltering();
        
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

    /**
     * Pick a graphics quality tier for the current device.
     *
     * The heavy hyperrealism effects (screen-space reflections, contact-hardening
     * shadows, supersampling, motion blur) can easily cost more than the entire rest
     * of the frame on an integrated GPU, so they are gated behind this tier rather
     * than shipped unconditionally.
     *
     * Detection is deliberately conservative: anything we cannot positively identify
     * as a discrete desktop GPU falls back to 'high', and mobile/XR falls to 'balanced'.
     * A stored user override always wins.
     *
     * @returns {'ultra'|'high'|'balanced'}
     */
    detectGraphicsTier() {
        // 1. Explicit user override wins over any heuristic.
        try {
            const stored = localStorage.getItem('vrclub.graphicsTier');
            if (stored === 'ultra' || stored === 'high' || stored === 'balanced') {
                log.info(`🎨 Using stored graphics tier override: ${stored}`);
                return stored;
            }
        } catch (_) { /* private browsing - fall through to detection */ }

        const ua = navigator.userAgent.toLowerCase();
        if (ua.includes('quest') || ua.includes('oculus') || /android|iphone|ipad|mobile/i.test(ua)) {
            return 'balanced';
        }

        // 2. WebGL2 is a hard requirement for SSR; without it 'ultra' is pointless.
        const webGL2 = this.engine.webGLVersion >= 2;
        if (!webGL2) return 'balanced';

        // 3. Read the unmasked GPU string where the browser exposes it.
        let renderer = '';
        try {
            const gl = this.engine._gl;
            const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
        } catch (_) { /* extension blocked by privacy settings */ }

        const cores = navigator.hardwareConcurrency || 4;
        const memoryGB = navigator.deviceMemory || 4;

        // Known-weak integrated parts: never promote these to ultra.
        const isWeakIntegrated = /(intel).*(hd|uhd) graphics|gma|swiftshader|llvmpipe|software/.test(renderer);
        if (isWeakIntegrated) return 'balanced';

        // Discrete GPU families that comfortably absorb SSR + supersampling.
        const isDiscrete = /(rtx|geforce|radeon rx|quadro|arc a|apple m[1-9])/.test(renderer);

        if (isDiscrete && cores >= 8 && memoryGB >= 8) return 'ultra';
        if (cores >= 4) return 'high';
        return 'balanced';
    }

    /**
     * Switch graphics tier at runtime and rebuild the tier-dependent effects.
     * Persists the choice so it survives a reload.
     * @param {'ultra'|'high'|'balanced'} tier
     */
    setGraphicsTier(tier) {
        if (!this.qualityTiers[tier]) {
            log.warn(`⚠️ Unknown graphics tier: ${tier}`);
            return;
        }
        if (tier === this.graphicsTier) return;

        this.graphicsTier = tier;
        try { localStorage.setItem('vrclub.graphicsTier', tier); } catch (_) { /* ignore */ }

        // Tear down tier-owned pipelines; they are rebuilt with the new settings.
        if (this.ssrPipeline) { this.ssrPipeline.dispose(); this.ssrPipeline = null; }
        if (this.motionBlur) { this.motionBlur.dispose(); this.motionBlur = null; }

        this._applyTierToPipeline();
        this._createScreenSpaceReflections();
        this._createMotionBlur();
        this._suppressUnlitSpecular();
        this._applyAnisotropicFiltering();
        this._applyShadowQuality();
        if (this.floorMesh) this.floorMesh.receiveShadows = !!this.tierSettings.floorShadows;

        // Re-run the desktop path so render scale / attachments match the new tier.
        // In VR the conservative VR path already owns these values, so leave it alone.
        if (!this.isInVRMode) this.applyDesktopSettings();

        log.info(`🎨 Graphics tier switched to: ${tier}`);
        this.showErrorMessage(`Graphics quality: ${tier.toUpperCase()}`);
    }

    /** Current tier's settings object. */
    get tierSettings() {
        return this.qualityTiers[this.graphicsTier] || this.qualityTiers.high;
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
            blurKernelSize: 32  // Wider blur for more realistic light halos
        });
        this.glowLayer.intensity = 0.85; // Pronounced glow for dramatic light sources
        
        // Custom glow intensity per mesh type - selective glow for realism
        // LED panels and strobes get strong glow, lasers get intense glow, structures get none
        this.glowLayer.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
            const name = mesh.name || '';
            if (name.startsWith('ledPanel_') || name.startsWith('strobe')) {
                // LED panels and strobes: bright emissive glow (visible from across club)
                result.set(
                    material.emissiveColor.r * 2.0,
                    material.emissiveColor.g * 2.0,
                    material.emissiveColor.b * 2.0,
                    1.0
                );
            } else if (name.includes('Emitter')) {
                // Fixture emitters: visible source glow without blooming laser beams across the LED wall
                result.set(
                    material.emissiveColor.r * 1.2,
                    material.emissiveColor.g * 1.2,
                    material.emissiveColor.b * 1.2,
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
                            // Track for haptic dispatch (bass-pulse rumble)
                            if (this._xrControllers.indexOf(controller) === -1) {
                                this._xrControllers.push(controller);
                            }
                            controller.onDisposeObservable.add(() => {
                                const idx = this._xrControllers.indexOf(controller);
                                if (idx >= 0) this._xrControllers.splice(idx, 1);
                            });
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
                                // Lazy-init the per-frame physics observer ONCE per VRClub instance
                                // (previous bug: a new observer was added every first jump and never removed,
                                // accumulating across XR sessions and continuing to raycast every frame.)
                                if (!this.jumpState) {
                                    this.jumpState = { active: false, velocity: 0 };
                                    this._jumpRayDir = new BABYLON.Vector3(0, -1, 0);
                                    this._jumpRay = new BABYLON.Ray(BABYLON.Vector3.Zero(), this._jumpRayDir, 2.5);
                                    const meshHasCollisions = (mesh) => mesh.checkCollisions;
                                    this._jumpObserver = this.scene.onBeforeRenderObservable.add(() => {
                                        if (!this.jumpState.active || !xrCamera) return;
                                        // Apply velocity & gravity
                                        xrCamera.position.y += this.jumpState.velocity;
                                        this.jumpState.velocity -= 0.006;
                                        if (this.jumpState.velocity >= 0) return;
                                        // Falling: raycast down to find ground (reuse cached Ray/Vector3)
                                        this._jumpRay.origin.copyFrom(xrCamera.position);
                                        this._jumpRay.direction.copyFrom(this._jumpRayDir);
                                        this._jumpRay.length = 2.5;
                                        const pick = this.scene.pickWithRay(this._jumpRay, meshHasCollisions);
                                        if (pick && pick.hit && pick.distance <= 1.75) {
                                            this.jumpState.active = false;
                                            xrCamera.applyGravity = true;
                                            xrCamera.position.y = pick.pickedPoint.y + 1.7;
                                        } else if (xrCamera.position.y < 1.7) {
                                            // Fallback for infinite fall
                                            this.jumpState.active = false;
                                            xrCamera.applyGravity = true;
                                            xrCamera.position.y = 1.7;
                                        }
                                    });
                                }
                                const jumpBtnIds = ["a-button", "x-button"];
                                jumpBtnIds.forEach(id => {
                                    const btn = motionController.getComponent(id);
                                    if (btn) {
                                        btn.onButtonStateChangedObservable.add((c) => {
                                            if (c.pressed && !this.jumpState.active) {
                                                log.info('🦘 VR Jump activated');
                                                this.jumpState.active = true;
                                                this.jumpState.velocity = 0.12;
                                                xrCamera.applyGravity = false;
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

                    // Remove the per-frame VR jump physics observer (captures stale xrCamera otherwise)
                    if (this._jumpObserver) {
                        this.scene.onBeforeRenderObservable.remove(this._jumpObserver);
                        this._jumpObserver = null;
                        this.jumpState = null;
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
        this.createSafetyDetails(); // Exit signs only
        this.createBar(); // Bar area with counter, stools, bottles
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        this.setupVJControlInteraction(); // Add VJ control button clicks
        
        // Create dancing NPC avatars on the dancefloor
        await this.createDancingNPCs();

        // === VJ DIRECTOR ===
        // Beat-locked palette engine + macros. Conducts the existing rig like
        // a touring VJ would. Reads audioData, writes to existing color/state
        // vars (spotColorIndex, currentSpotColor, vjDropActive, etc.) so the
        // existing render code keeps working unchanged.
        if (typeof VJDirector !== 'undefined') {
            this.vjDirector = new VJDirector(this);
        }
        
        // UPGRADE: Create frozen reflection probe for the dance floor
        // Must be called AFTER all geometry is created so the probe captures everything
        this.createFloorReflectionProbe();

        // Quality passes that must run AFTER all geometry, textures, lights and the
        // reflection probe exist, because they sweep the finished scene.
        this._suppressUnlitSpecular();
        this._applyAnisotropicFiltering();
        this._applyShadowQuality();

        // Apply the tier's render scale. Below 1.0 this supersamples: the scene renders
        // above native resolution and is downsampled on present. applyDesktopSettings()
        // only runs when EXITING VR, so the initial desktop load has to set it here.
        this.engine.setHardwareScalingLevel(this.tierSettings.renderScale);

        // The SSR pipeline wants the probe cube map as its miss-fallback. The probe is
        // only available now, so wire it up (or build SSR if the pipeline was created
        // before the probe existed).
        if (this.ssrPipeline && this.floorReflectionProbe) {
            this.ssrPipeline.environmentTexture = this.floorReflectionProbe.cubeTexture;
            this.ssrPipeline.environmentTextureIsProbe = true;
        } else {
            this._createScreenSpaceReflections();
        }
        
        // Verify scene is ready
        log.info('🎬 Scene initialization complete:');
        log.info(`  📷 Camera: ${this.camera.position.toString()}`);
        log.info(`  🎯 Active camera: ${this.scene.activeCamera ? 'Set' : 'MISSING!'}`);
        log.info(`  💡 Lights: ${this.scene.lights.length}`);
        log.info(`  📦 Meshes: ${this.scene.meshes.length}`);
        log.info(`  🎨 Materials: ${this.scene.materials.length}`);
        
        // Start render loop
        this._renderLoop = () => {
            this.scene.render();
            this.updateAnimations();
            this.updatePerformanceMonitor();
        };
        this.engine.runRenderLoop(this._renderLoop);

        // === LIFECYCLE: pause rendering when the page is hidden ===
        // On Quest the browser keeps a backgrounded tab's render loop alive, which
        // burns battery and GPU for content nobody can see. We never pause while an
        // immersive XR session is active (the headset owns the frame loop there).
        this._onVisibilityChange = () => {
            if (document.hidden && !this.isInVRMode) {
                this.engine.stopRenderLoop(this._renderLoop);
                if (this.audioContext && this.audioContext.state === 'running') {
                    // Leave audio running only if something is actually playing so a
                    // backgrounded club doesn't silently kill the user's music.
                    log.info('⏸️ Render loop paused (tab hidden)');
                }
            } else if (!document.hidden) {
                this.engine.runRenderLoop(this._renderLoop);
            }
        };
        document.addEventListener('visibilitychange', this._onVisibilityChange);

        // === RELIABILITY: WebGL context loss ===
        // The engine is constructed with `doNotHandleContextLost: true` for
        // performance, which means Babylon will NOT rebuild GPU resources itself.
        // Under memory pressure (common on standalone Quest) the context can be
        // evicted; without this handler the user is left staring at a frozen black
        // canvas with no explanation.
        if (this.engine.onContextLostObservable) {
            this.engine.onContextLostObservable.add(() => {
                log.error('❌ WebGL context lost — GPU resources were evicted.');
                this.showErrorMessage('Graphics context lost. Reloading the club…');
                setTimeout(() => window.location.reload(), 2000);
            });
        }

        this._onResize = () => this.engine.resize();
        window.addEventListener('resize', this._onResize);
        
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

        this.ready = true;
    }

    /**
     * Tear down every long-lived resource this instance owns.
     *
     * Previously there was no teardown path at all: the render loop, the
     * AudioContext, the WebGL context, the window/document listeners and the
     * whole Babylon scene graph all leaked for the lifetime of the document.
     * That is survivable for a single-page demo but makes the club impossible to
     * embed, hot-reload, or unmount from a SPA route — and it is the #1 reason
     * "reload the page" is currently the only recovery mechanism.
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        try {
            if (this._renderLoop) this.engine.stopRenderLoop(this._renderLoop);
        } catch (_) { /* engine may already be gone */ }

        if (this._onVisibilityChange) {
            document.removeEventListener('visibilitychange', this._onVisibilityChange);
            this._onVisibilityChange = null;
        }
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
            this._onResize = null;
        }

        // Audio graph — an unclosed AudioContext keeps an audio thread alive.
        if (this.audioElement) {
            try {
                this.audioElement.pause();
                const src = this.audioElement.src;
                if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
                this.audioElement.removeAttribute('src');
                this.audioElement.load();
            } catch (_) { /* ignore */ }
            this.audioElement = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => { /* ignore */ });
        }
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioSource = null;

        if (this.vjDirector) this.vjDirector = null;

        if (this.vrHelper && this.vrHelper.baseExperience) {
            try { this.vrHelper.baseExperience.dispose(); } catch (_) { /* ignore */ }
        }
        this.vrHelper = null;

        if (this.textureLoader && this.textureLoader.clearTexturePool) {
            try { this.textureLoader.clearTexturePool(); } catch (_) { /* ignore */ }
        }

        // Post-process pipelines hold render targets and GL resources that scene.dispose()
        // does not always reclaim - release them explicitly.
        if (this.ssrPipeline) {
            try { this.ssrPipeline.dispose(); } catch (_) { /* ignore */ }
            this.ssrPipeline = null;
        }
        if (this.motionBlur) {
            try { this.motionBlur.dispose(); } catch (_) { /* ignore */ }
            this.motionBlur = null;
        }

        // Release UI-layer timers and XR observers (ui-init.js).
        if (typeof window.teardownVJUI === 'function') {
            try { window.teardownVJUI(); } catch (_) { /* ignore */ }
        }

        if (this.scene) {
            try { this.scene.dispose(); } catch (_) { /* ignore */ }
            this.scene = null;
        }
        if (this.engine) {
            try { this.engine.dispose(); } catch (_) { /* ignore */ }
            this.engine = null;
        }

        if (window.vrClub === this) window.vrClub = null;
        log.info('🧹 VRClub disposed');
    }

    addPostProcessing() {
        // Prevent duplicate pipelines
        if (this.renderPipeline) {
            return;
        }

        const desktop = this.vrSettings.desktop;
        const tier = this.tierSettings;

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

        // MSAA on the pipeline render target. FXAA alone leaves crawling edges on the
        // thin truss/pipe geometry that fills the ceiling; MSAA resolves the geometric
        // edges and FXAA then cleans up the shader aliasing on emissive surfaces.
        pipeline.samples = tier.pipelineSamples;
        
        // ENHANCED Bloom for dramatic glowing lights - key to club atmosphere
        pipeline.bloomEnabled = true;
        pipeline.bloomThreshold = desktop.bloomThreshold;
        pipeline.bloomWeight = desktop.bloomWeight;
        pipeline.bloomKernel = tier.bloomKernel; // Wide kernel = smooth cinematic halos
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

        // DITHERING — the single highest-value fix for a dark scene.
        // This club is almost entirely smooth gradients falling off into near-black.
        // In 8-bit output those gradients quantise into visible concentric "contour"
        // bands around every light pool, which instantly reads as computer graphics.
        // Dithering adds sub-LSB noise that breaks the banding up completely.
        if ('ditheringEnabled' in pipeline.imageProcessing) {
            pipeline.imageProcessing.ditheringEnabled = true;
            pipeline.imageProcessing.ditheringIntensity = 1.0 / 255.0;
        }
        
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
        this.ssaoPipeline.expensiveBlur = tier.ssaoExpensiveBlur;
        this.ssaoPipeline.samples = tier.ssaoSamples;
        this.ssaoPipeline.maxZ = 250;

        // Heavy tier-gated effects.
        this._createScreenSpaceReflections();
        this._createMotionBlur();
        
        log.info(`✨ Post-processing initialized (hyperrealistic mode, tier: ${this.graphicsTier})`);
    }

    /**
     * Re-apply the current tier's values to an already-built pipeline.
     * Used by setGraphicsTier() so the tier can change without a page reload.
     */
    _applyTierToPipeline() {
        const tier = this.tierSettings;
        if (this.renderPipeline) {
            this.renderPipeline.samples = tier.pipelineSamples;
            this.renderPipeline.bloomKernel = tier.bloomKernel;
        }
        if (this.ssaoPipeline) {
            this.ssaoPipeline.samples = tier.ssaoSamples;
            this.ssaoPipeline.expensiveBlur = tier.ssaoExpensiveBlur;
        }
    }

    /**
     * Screen-space reflections.
     *
     * This is the biggest single realism upgrade available to this scene. A real
     * nightclub floor is polished and slightly damp, and almost everything you read as
     * "expensive lighting" in a club photograph is actually the *reflection* of that
     * lighting in the floor. A static reflection probe (which is what the floor used
     * before) can only capture the room geometry once — it cannot reflect the moving
     * spotlight pools, the sweeping lasers, the strobes or the animated LED wall,
     * which is precisely the content that matters here.
     *
     * SSR reflects the live rendered frame, so every moving light shows up in the floor.
     * Desktop only, and only above the 'balanced' tier — it requires WebGL2 and costs
     * real milliseconds.
     */
    _createScreenSpaceReflections() {
        if (this.ssrPipeline) return;
        if (!this.tierSettings.ssr) return;
        if (!BABYLON.SSRRenderingPipeline) {
            log.warn('⚠️ SSRRenderingPipeline unavailable in this Babylon build - skipping reflections');
            return;
        }
        if (this.engine.webGLVersion < 2) {
            log.warn('⚠️ SSR requires WebGL2 - skipping reflections');
            return;
        }

        try {
            // forceGeometryBuffer = false → use the pre-pass renderer (cheaper and more
            // accurate reflectivity). Per Babylon docs, pre-pass + MSAA can produce
            // artifacts, so anti-aliasing on the SSR path relies on FXAA, which is
            // already enabled in the default pipeline.
            const ssr = new BABYLON.SSRRenderingPipeline(
                'ssr',
                this.scene,
                this.camera ? [this.camera] : [],
                false,
                BABYLON.Constants.TEXTURETYPE_UNSIGNED_BYTE
            );

            const highQuality = this.tierSettings.ssrQuality === 'high';

            // Room is ~35 x 45 x 8 m, so rays never need to travel far. Keeping
            // maxDistance tight is the cheapest possible optimisation.
            ssr.maxDistance = 28;
            ssr.maxSteps = highQuality ? 900 : 500;
            ssr.step = highQuality ? 2 : 4;
            ssr.enableSmoothReflections = true;   // Required once step > 1 or reflections stair-step
            ssr.thickness = 0.4;
            ssr.selfCollisionNumSkip = 2;         // Avoids the floor reflecting itself as noise
            ssr.clipToFrustum = true;

            // Blur the reflection by surface roughness. The floor is roughness 0.25 —
            // polished but not a mirror — so reflections should smear slightly.
            // Without this the floor looks like glass, which reads as fake.
            ssr.blurDispersionStrength = 0.035;
            ssr.blurDownsample = highQuality ? 0 : 1;
            ssr.ssrDownsample = highQuality ? 0 : 1;
            ssr.roughnessFactor = 0.18;

            // useFresnel makes grazing angles far more reflective than head-on ones,
            // which is exactly how a real wet floor behaves: the far end of the room
            // mirrors brightly while the floor at your feet stays matte.
            ssr.useFresnel = true;
            ssr.reflectivityThreshold = 0.02; // Below the floor's 0.08 metallic so it qualifies

            // Soften the inherent SSR failure cases rather than letting them pop.
            ssr.attenuateScreenBorders = true;
            ssr.attenuateIntersectionDistance = true;
            ssr.attenuateIntersectionIterations = true;
            ssr.attenuateFacingCamera = true;
            ssr.attenuateBackfaceReflection = true;

            // Where a ray finds nothing, fall back to the floor probe's cube map instead
            // of the pixel's own colour — otherwise missed rays leave flat bright patches.
            if (this.floorReflectionProbe) {
                ssr.environmentTexture = this.floorReflectionProbe.cubeTexture;
                ssr.environmentTextureIsProbe = true;
            } else if (this.scene.environmentTexture) {
                ssr.environmentTexture = this.scene.environmentTexture;
            }

            ssr.isEnabled = !this.isInVRMode;
            this.ssrPipeline = ssr;
            log.info(`🪩 Screen-space reflections enabled (${this.tierSettings.ssrQuality} quality)`);
        } catch (err) {
            log.warn('⚠️ Failed to create SSR pipeline, continuing without reflections:', err);
            this.ssrPipeline = null;
        }
    }

    /**
     * Object-based motion blur.
     *
     * Moving heads, the mirror ball and the sweeping laser fans all move fast enough to
     * strobe against the frame rate. A short blur trail is what a real camera (and,
     * loosely, the eye) produces, and it is the difference between "3D objects moving"
     * and "a light show being filmed". Ultra tier only — it needs a velocity buffer.
     */
    _createMotionBlur() {
        if (this.motionBlur) return;
        if (!this.tierSettings.motionBlur) return;
        if (!BABYLON.MotionBlurPostProcess || !this.camera) return;

        try {
            const mb = new BABYLON.MotionBlurPostProcess(
                'motionBlur',
                this.scene,
                1.0,
                this.camera
            );
            // Deliberately restrained. Anything stronger smears the laser beams into
            // mush and makes the LED wall unreadable.
            mb.motionStrength = 0.35;
            mb.motionBlurSamples = this.tierSettings.motionBlurSamples;
            if ('isObjectBased' in mb) mb.isObjectBased = true;
            this.motionBlur = mb;
            log.info('🎞️ Object-based motion blur enabled');
        } catch (err) {
            log.warn('⚠️ Failed to create motion blur, continuing without it:', err);
            this.motionBlur = null;
        }
    }

    /**
     * Zero the specular colour on self-illuminated `StandardMaterial`s.
     *
     * `StandardMaterial` defaults `specularColor` to pure white, and the SSR pre-pass
     * reads `specularColor` as the surface's reflectivity. Left at the default, every
     * emissive surface in the club — the LED wall tiles, laser beams, light pools,
     * gobos, strobes, neon — is treated by SSR as a perfect mirror, so its colour is
     * replaced by a screen-space reflection that resolves to near-black. The visible
     * symptom is an LED wall where only the panel outlines glow (that is the bloom halo
     * surviving) while the panel faces go dark.
     *
     * A specular highlight on a pure emitter is physically meaningless anyway, so this
     * is the correct value independent of SSR. Materials built through
     * `MaterialFactory.createStandardMaterial({ disableLighting: true })` already get
     * this; the sweep catches the ~20 materials constructed directly in this file.
     */
    _suppressUnlitSpecular() {
        const black = new BABYLON.Color3(0, 0, 0);
        let fixed = 0;

        this.scene.materials.forEach(mat => {
            if (!(mat instanceof BABYLON.StandardMaterial)) return;
            if (!mat.specularColor) return;
            if (mat.specularColor.r === 0 && mat.specularColor.g === 0 && mat.specularColor.b === 0) return;

            const isUnlit = mat.disableLighting === true;
            const isAdditive = mat.alphaMode === BABYLON.Engine.ALPHA_ADD;
            const e = mat.emissiveColor;
            const isSelfLit = !!e && (e.r + e.g + e.b) > 0.5;
            if (!isUnlit && !isAdditive && !isSelfLit) return;

            // Frozen materials skip uniform re-evaluation, so unfreeze around the write.
            const wasFrozen = mat.isFrozen;
            if (wasFrozen && mat.unfreeze) mat.unfreeze();
            mat.specularColor = black.clone();
            if (wasFrozen && mat.freeze) mat.freeze();
            fixed++;
        });

        if (fixed) log.info(`💡 Zeroed specular on ${fixed} self-illuminated materials (SSR reflectivity fix)`);
    }

    /**
     * Apply anisotropic filtering to every texture in the scene.
     *
     * The floor is a 35x45 m plane viewed at a very shallow angle from eye height. With
     * the default trilinear filtering its tiles blur into grey mush a few metres out,
     * which is the most obvious "this is a game" tell in the whole room. Anisotropic
     * filtering keeps the tile grid sharp all the way to the far wall and costs almost
     * nothing on desktop.
     */
    _applyAnisotropicFiltering() {
        const caps = this.engine.getCaps();
        const max = caps.maxAnisotropy || 1;
        const target = Math.min(this.tierSettings.anisotropy, max);
        if (target <= 1) return;

        let count = 0;
        this.scene.textures.forEach(tex => {
            // Cube maps and render targets have no meaningful anisotropy.
            if (!tex || tex.isCube || tex.isRenderTarget) return;
            if (tex.anisotropicFilteringLevel !== target) {
                tex.anisotropicFilteringLevel = target;
                count++;
            }
        });
        log.info(`🔍 Anisotropic filtering set to ${target}x on ${count} textures`);
    }

    /**
     * Upgrade shadow filtering to contact-hardening (PCSS) on capable tiers.
     *
     * A club is lit by physically small sources at close range, so its shadows are
     * sharp where an object touches the floor and rapidly soften with distance. A
     * uniform-blur shadow map cannot express that, and uniformly-soft shadows are what
     * make CG interiors look like they are floating.
     */
    _applyShadowQuality() {
        const tier = this.tierSettings;
        const qualityMap = {
            high: BABYLON.ShadowGenerator.QUALITY_HIGH,
            medium: BABYLON.ShadowGenerator.QUALITY_MEDIUM,
            low: BABYLON.ShadowGenerator.QUALITY_LOW
        };

        this.scene.lights.forEach(light => {
            const gen = light.getShadowGenerator && light.getShadowGenerator();
            if (!gen) return;

            if (tier.contactHardeningShadows && 'useContactHardeningShadow' in gen) {
                gen.useContactHardeningShadow = true;
                gen.contactHardeningLightSizeUVRatio = 0.08; // Small source = tight contact shadow
            } else {
                if ('useContactHardeningShadow' in gen) gen.useContactHardeningShadow = false;
                gen.usePercentageCloserFiltering = true;
            }
            gen.filteringQuality = qualityMap[tier.shadowQuality] || BABYLON.ShadowGenerator.QUALITY_MEDIUM;

            // Pull the shadow map's depth range in to the actual room size. A default
            // far plane wastes most of the depth precision on empty space and is the
            // usual cause of shadow acne and peter-panning.
            if (light.shadowMinZ === undefined || light.shadowMinZ === 0) light.shadowMinZ = 0.5;
            if (!light.shadowMaxZ || light.shadowMaxZ > 60) light.shadowMaxZ = 45;
        });
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
        // Floor shadow reception is the strongest single cue that objects are actually
        // standing ON the floor rather than hovering over a painted texture. It is also
        // expensive (every shadow map is sampled across the full 35x45 m plane), so only
        // the top tier pays for it.
        floor.receiveShadows = !!this.tierSettings.floorShadows;
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
        
        // Cube map probe at dance floor level. Resolution scales with the graphics tier:
        // the probe supplies the floor's ambient reflection AND the fallback colour for
        // rays that SSR fails to resolve, so a sharper probe visibly improves both.
        const probe = new BABYLON.ReflectionProbe("floorReflectionProbe", this.tierSettings.probeResolution, this.scene);
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
        // PBR material for walls
        const wallMat = this.materialFactory.getPreset('wall');
        
        // Apply downloaded concrete wall textures if available
        if (this.concreteTextures && this.concreteTextures.walls) {
            log.info('🎨 Applying wall textures (Polyhaven - Red Brick)');
            this.textureLoader.applyTexturesToMaterial(wallMat, this.concreteTextures.walls);
            wallMat.baseColor = new BABYLON.Color3(0.7, 0.6, 0.55); // Warm tint to let natural brick color show
            wallMat.roughness = 0.78; // Slightly polished brick (club condensation/moisture)
            wallMat.environmentIntensity = 0.25; // Subtle reflections for moist brick surface
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
            ceilingMat.baseColor = new BABYLON.Color3(0.25, 0.25, 0.28); // Darker industrial concrete
            ceilingMat.roughness = 0.88;
            ceilingMat.environmentIntensity = 0.15; // Subtle light reflections from below
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
                    width: panelWidth - 0.12,   // Larger physical gap (was -0.05) so VR bloom can't bridge tiles
                    height: panelHeight - 0.12  // Real LED video walls have ~6–10 mm bezels per 60cm tile —
                                                // proportionally we now show a clear ~6cm dark seam
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
            fogEmitter.color1 = new BABYLON.Color4(0.85, 0.85, 0.9, 0.4);
            fogEmitter.color2 = new BABYLON.Color4(0.9, 0.9, 0.95, 0.35);
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
            fogEmitter.addColorGradient(0, new BABYLON.Color4(0.9, 0.9, 0.95, 0.5));
            fogEmitter.addColorGradient(0.4, new BABYLON.Color4(0.85, 0.85, 0.9, 0.35));
            fogEmitter.addColorGradient(0.8, new BABYLON.Color4(0.7, 0.7, 0.8, 0.15));
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
        
        // Visible ambient haze - makes light beams stand out
        this.haze.color1 = new BABYLON.Color4(0.6, 0.6, 0.7, 0.12);
        this.haze.color2 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.10);
        this.haze.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);
        
        this.haze.minSize = 1.0;
        this.haze.maxSize = 3.5;
        this.haze.minLifeTime = 8.0;
        this.haze.maxLifeTime = 15.0;
        
        this.haze.emitRate = 80; // Thick haze for beam visibility
        this.haze.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        
        this.haze.gravity = new BABYLON.Vector3(0, 0.02, 0);
        this.haze.direction1 = new BABYLON.Vector3(-0.3, -0.1, -0.3);
        this.haze.direction2 = new BABYLON.Vector3(0.3, 0.2, 0.3);
        
        this.haze.minEmitPower = 0.05;
        this.haze.maxEmitPower = 0.2;
        this.haze.updateSpeed = 0.005;
        
        // Haze is always running when smoke is active
        this.haze.start();
        
        // === LOW-LYING FLOOR FOG (CO2 cryo effect - pools at ankle level) ===
        this.floorFog = new BABYLON.ParticleSystem("floorFog", 600, this.scene);
        this.floorFog.particleTexture = particleTexture;
        
        // Emit across the dance floor at ankle level
        this.floorFog.emitter = new BABYLON.Vector3(0, 0.1, -12);
        this.floorFog.minEmitBox = new BABYLON.Vector3(-12, -0.1, -10);
        this.floorFog.maxEmitBox = new BABYLON.Vector3(12, 0.2, 10);
        
        // Dense white fog that hugs the floor
        this.floorFog.color1 = new BABYLON.Color4(0.7, 0.7, 0.8, 0.15);
        this.floorFog.color2 = new BABYLON.Color4(0.8, 0.8, 0.9, 0.12);
        this.floorFog.colorDead = new BABYLON.Color4(0, 0, 0, 0);
        
        this.floorFog.minSize = 1.5;
        this.floorFog.maxSize = 4.0;
        this.floorFog.minScaleX = 2.0;
        this.floorFog.maxScaleX = 3.0;
        this.floorFog.minLifeTime = 6.0;
        this.floorFog.maxLifeTime = 12.0;
        
        this.floorFog.emitRate = 40;
        this.floorFog.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        
        // Fog stays low - minimal upward movement, slight drift
        this.floorFog.direction1 = new BABYLON.Vector3(-0.2, -0.05, -0.2);
        this.floorFog.direction2 = new BABYLON.Vector3(0.2, 0.1, 0.2);
        this.floorFog.minEmitPower = 0.02;
        this.floorFog.maxEmitPower = 0.08;
        this.floorFog.gravity = new BABYLON.Vector3(0, -0.15, 0); // Keeps fog on ground
        
        this.floorFog.minAngularSpeed = -0.3;
        this.floorFog.maxAngularSpeed = 0.3;
        
        // Size grows as fog spreads along floor
        this.floorFog.addSizeGradient(0, 1.0);
        this.floorFog.addSizeGradient(0.5, 2.5);
        this.floorFog.addSizeGradient(1.0, 4.0);
        
        // Fast fade out so fog doesn't accumulate unnaturally
        this.floorFog.addColorGradient(0, new BABYLON.Color4(0.8, 0.8, 0.9, 0.15));
        this.floorFog.addColorGradient(0.3, new BABYLON.Color4(0.7, 0.7, 0.8, 0.12));
        this.floorFog.addColorGradient(0.7, new BABYLON.Color4(0.5, 0.5, 0.6, 0.05));
        this.floorFog.addColorGradient(1.0, new BABYLON.Color4(0.3, 0.3, 0.4, 0));
        
        this.floorFog.updateSpeed = 0.004;
        this.floorFog.start();
        
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
            const clampMat = this.materialFactory.createPBRMaterial("laserClampMat", {
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
            
            const housingMat = this.materialFactory.createPBRMaterial("laserHousingMat", {
                baseColor: [0.05, 0.05, 0.05],
                metallic: 0.8,
                roughness: 0.3,
                emissiveColor: [0.05, 0, 0]
            }, true); // UPGRADE: shared across all laser housings
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
            
            const emitterMat = this.materialFactory.createStandardMaterial("laserEmitterMat", {
                emissiveColor: [1, 0, 0],
                disableLighting: true
            }, true); // UPGRADE: shared across all laser emitters
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
        this.blindersActive = true;     // Blinders pulsing
        this.laserSheetActive = false;
        this.smokeActive = true;        // Haze for beam visibility
        
        this.spotlightPattern = 3;      // CROSSED BEAMS for tension
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
        // Crisp laser beam. Keep only the pencil-thin core so beams crossing
        // the LED wall do not create a large additive glow wash.
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
        
        // Hit spots removed - cleaner laser look without floor reflections
        
        return { 
            mesh: beam, 
            material: beamMat,
            innerGlow: null,
            innerGlowMat: null,
            beamGlow: null,
            glowMat: null,
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

        // VR FIX: a pure-metallic surface only renders via environment reflection,
        // and VR drops scene.environmentIntensity to 0.15 (vs 0.5 desktop), making
        // the ball nearly invisible. We give it a faint silver emissive floor so
        // the geometry always has presence, plus we boost the material-level env
        // intensity to compensate for the dimmer scene-level multiplier.
        mirrorBallMat.emissiveColor = new BABYLON.Color3(0.06, 0.06, 0.07);
        mirrorBallMat.environmentIntensity = 6.0; // was 1.8 — compensates for VR's dim scene env

        // Use environment reflection for realistic mirror effect
        if (this.scene.environmentTexture) {
            // (intensity already set above; kept for clarity if env texture loads later)
            mirrorBallMat.environmentIntensity = 6.0;
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
        // UPGRADE: Freeze static cable
        cable.freezeWorldMatrix();
        cable.doNotSyncBoundingInfo = true;
        
        // === MULTIPLE SPOTLIGHTS FOR MIRROR BALL (Professional disco ball setup) ===
        // Strategy: Use 1 main spotlight + visual beams from multiple angles
        // Why: GPU uniform buffer limits prevent multiple real SpotLights with PBR materials
        this.mirrorBallSpotlights = [];
        this.mirrorBallBeams = [];
        this.mirrorBallHousings = [];
        
        // UPGRADE: Create shared gradient texture for all mirror ball beams (was 4 separate 512px textures)
        if (!this._mirrorBeamGradientTexture) {
            const mbGradTex = new BABYLON.DynamicTexture("sharedMirrorBeamGradient", { width: 256, height: 256 }, this.scene);
            const mbCtx = mbGradTex.getContext();
            const mbGrad = mbCtx.createRadialGradient(128, 128, 25, 128, 128, 128);
            mbGrad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            mbGrad.addColorStop(0.3, 'rgba(255, 255, 255, 0.6)');
            mbGrad.addColorStop(0.6, 'rgba(255, 255, 255, 0.3)');
            mbGrad.addColorStop(0.85, 'rgba(255, 255, 255, 0.1)');
            mbGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            mbCtx.fillStyle = mbGrad;
            mbCtx.fillRect(0, 0, 256, 256);
            mbGradTex.update();
            this._mirrorBeamGradientTexture = mbGradTex;
        }
        
        // UPGRADE: Share housing materials across all 4 mirror ball fixtures
        const sharedMirrorHousingMat = new BABYLON.PBRMetallicRoughnessMaterial("sharedMirrorHousingMat", this.scene);
        sharedMirrorHousingMat.baseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        sharedMirrorHousingMat.metallic = 0.85;
        sharedMirrorHousingMat.roughness = 0.3;
        sharedMirrorHousingMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        sharedMirrorHousingMat.maxSimultaneousLights = this.maxLights;
        
        const sharedMirrorBezelMat = new BABYLON.PBRMetallicRoughnessMaterial("sharedMirrorBezelMat", this.scene);
        sharedMirrorBezelMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        sharedMirrorBezelMat.metallic = 0.95;
        sharedMirrorBezelMat.roughness = 0.15;
        sharedMirrorBezelMat.maxSimultaneousLights = this.maxLights;
        
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
            
            // UPGRADE: Use shared housing material instead of per-fixture instances
            housing.material = sharedMirrorHousingMat;
            housing.isPickable = false;
            
            // Front bezel/rim (chrome ring around lens)
            const bezel = BABYLON.MeshBuilder.CreateTorus(`mirrorBezel${index}`, {
                diameter: 0.45,
                thickness: 0.05,
                tessellation: 32
            }, this.scene);
            bezel.position = config.pos.add(housingDirection.scale(0.4));
            bezel.rotationQuaternion = targetQuat;
            
            // UPGRADE: Use shared bezel material
            bezel.material = sharedMirrorBezelMat;
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
                material: sharedMirrorHousingMat,
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
            // UPGRADE: Use shared gradient texture (was 4 separate 512px DynamicTextures)
            const beamTexture = this._mirrorBeamGradientTexture;
            
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
            
            // UPGRADE: Freeze static fixture hardware (housing, base, bezel don't animate)
            base.freezeWorldMatrix();
            base.doNotSyncBoundingInfo = true;
            housing.freezeWorldMatrix();
            housing.doNotSyncBoundingInfo = true;
            bezel.freezeWorldMatrix();
            bezel.doNotSyncBoundingInfo = true;
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
            
            // UPGRADE: Share 1 material for all 40 rays (was 40 unique but identical materials)
            // Per-ray alpha variation handled via mesh.visibility instead of material.alpha
            if (!this._sharedMirrorRayMat) {
                this._sharedMirrorRayMat = new BABYLON.StandardMaterial('sharedMirrorRayMat', this.scene);
                this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                this._sharedMirrorRayMat.alpha = 1.0; // Controlled per-ray via mesh.visibility
                this._sharedMirrorRayMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
                this._sharedMirrorRayMat.disableLighting = true;
                this._sharedMirrorRayMat.backFaceCulling = false;
                this._sharedMirrorRayMat.freeze();
            }
            ray.material = this._sharedMirrorRayMat;
            ray.visibility = 0.12 + Math.random() * 0.08; // Per-ray alpha variation (0.12-0.20)
            ray.isPickable = false;
            ray.setEnabled(false); // Starts disabled
            
            this.mirrorBallOutgoingRays.push({
                mesh: ray,
                material: this._sharedMirrorRayMat,
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
                
                // UPGRADE: Share 1 beam material for all 100 reflection beams (was 100 unique)
                // Per-beam alpha handled via mesh.visibility
                if (!this._sharedMirrorBeamMat) {
                    this._sharedMirrorBeamMat = new BABYLON.StandardMaterial('sharedMirrorBeamMat', this.scene);
                    this._sharedMirrorBeamMat.emissiveColor = this.mirrorBallSpotlightColor.clone();
                    this._sharedMirrorBeamMat.alpha = 1.0;
                    this._sharedMirrorBeamMat.alphaMode = BABYLON.Engine.ALPHA_ADD;
                    this._sharedMirrorBeamMat.disableLighting = true;
                    this._sharedMirrorBeamMat.backFaceCulling = false;
                    this._sharedMirrorBeamMat.freeze();
                }
                beam.material = this._sharedMirrorBeamMat;
                beam.visibility = 0.2; // Default visibility, updated per-frame
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
                    beamMaterial: this._sharedMirrorBeamMat,
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

        // === FRAME-RATE INDEPENDENCE ===
        // Quest headsets run at 72/90/120 Hz, desktop at 60/144 Hz, and thermal
        // throttling can drop any of them to 30 Hz. Every time-accumulator below
        // used to add a hardcoded 0.016 s ("assume 60 fps"), which made the whole
        // light show run at a different musical speed per device.
        // `dtScale` is the ratio of the real frame time to a 60 fps frame, clamped
        // so a single long frame (tab restore, GC pause, shader compile) cannot
        // teleport animation state.
        const frameMs = (this.engine && this.engine.getDeltaTime) ? this.engine.getDeltaTime() : 16.667;
        const dtScale = Math.min(4, Math.max(0.25, frameMs / 16.667));
        const dt = 0.016 * dtScale; // seconds, clamped — use in place of the old literal
        this.dtScale = dtScale;

        this.ledTime += dt * (this.ledWallSpeed || 1.0);
        this.frameCounter++;
        
        // === GOBO ROTATION UPDATE ===
        // Continuous 360° rotation for gobo patterns
        if (this.goboEnabled) {
            this.goboRotation += 0.02 * dtScale * (this.goboRotationSpeed || 1.0);
            if (this.goboRotation > Math.PI * 2) {
                this.goboRotation -= Math.PI * 2;
            } else if (this.goboRotation < -Math.PI * 2) {
                this.goboRotation += Math.PI * 2;
            }
        }
        
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

        // === VJ DIRECTOR per-frame tick ===
        // Drives master palette, beat envelope, BPM tracking, scene transitions.
        // Writes back to this.beatEnvelope / this.masterIntensity / this.barPhase
        // which downstream render code multiplies into intensities.
        if (this.vjDirector) {
            this.vjDirector.update(time, audioData);
        }

        // Bass-driven controller rumble for VR users (no-op outside XR / when disabled)
        this._updateBassHaptics(audioData);

        // === FOG MACHINE SYSTEM CONTROL ===
        if (this.fogMachines && this.fogMachines.length > 0) {
            const currentTime = time;
            
            if (this.smokeActive) {
                // Ensure haze is running for beam visibility
                if (this.haze && !this.haze.isStarted()) this.haze.start();
                
                // Update each fog machine
                this.fogMachines.forEach((machine, i) => {
                    const emitter = machine.emitter;
                    const led = machine.led;
                    const ledMat = machine.ledMat;
                    
                    // === FOG BURST LOGIC ===
                    if (this.fogBurstMode === 'auto') {
                        // Automatic bursts synced to music/phase
                        const timeSinceLastBurst = currentTime - this.lastFogBurst;
                        const burstInterval = this.fogBurstInterval / this.fogIntensity;
                        
                        if (!machine.isBursting && timeSinceLastBurst > burstInterval) {
                            // Start a burst
                            machine.isBursting = true;
                            machine.burstTimer = 2.5; // 2.5 second burst
                            emitter.emitRate = 150 * this.fogIntensity;
                            
                            // Update LED to red (active) — cached, no allocation
                            ledMat.emissiveColor = this.cachedColors.fogActive;
                            
                            if (i === 0) this.lastFogBurst = currentTime;
                        }
                        
                        if (machine.isBursting) {
                            machine.burstTimer -= dt; // frame-rate independent
                            
                            // Fade out burst over last 0.5 seconds
                            if (machine.burstTimer < 0.5) {
                                emitter.emitRate = 150 * this.fogIntensity * (machine.burstTimer / 0.5);
                            }
                            
                            if (machine.burstTimer <= 0) {
                                machine.isBursting = false;
                                emitter.emitRate = 0;
                                ledMat.emissiveColor = this.cachedColors.fogReady; // Green (ready)
                            }
                        }
                        
                    } else if (this.fogBurstMode === 'continuous') {
                        // Continuous low output
                        emitter.emitRate = 80 * this.fogIntensity;
                        ledMat.emissiveColor = this.cachedColors.fogContinuous; // Orange (continuous)
                        machine.isBursting = false;
                        
                    } else if (this.fogBurstMode === 'burst') {
                        // Manual burst mode - awaiting trigger
                        if (!machine.isBursting) {
                            emitter.emitRate = 0;
                            ledMat.emissiveColor = this.cachedColors.fogStandby; // Blue (standby)
                        }
                    }
                });
                
            } else {
                // Smoke disabled - stop all fog machines
                this.fogMachines.forEach(machine => {
                    machine.emitter.emitRate = 0;
                    machine.isBursting = false;
                    machine.ledMat.emissiveColor = this.cachedColors.fogOff; // Gray (off)
                });
                
                if (this.haze && this.haze.isStarted()) this.haze.stop();
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
                    
                    // Twinkling effect - subtle visibility variation (shared material, per-mesh visibility)
                    const twinkle = 0.8 + 0.2 * Math.sin(time * 5 + i * 0.7);
                    ray.mesh.visibility = (0.12 + (i % 5) * 0.02) * twinkle;
                });
                
                // UPGRADE: Update shared ray material color once (not 40× per frame)
                // QC: this material is written EVERY frame, so it must stay permanently
                // unfrozen. The old freeze()/unfreeze() pair called Material.markDirty()
                // twice per frame, and markDirty() walks every mesh in the scene.
                if (this._sharedMirrorRayMat) {
                    if (this._sharedMirrorRayMat.isFrozen) this._sharedMirrorRayMat.unfreeze();
                    this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor;
                }
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
                            // UPGRADE: Use mesh.visibility instead of shared material alpha
                            spot.beam.visibility = 0.18 * distanceFade;
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
                
                // UPGRADE: Update shared beam material color once per frame (not 100×)
                // QC: permanently unfrozen — see note on _sharedMirrorRayMat above.
                if (this._sharedMirrorBeamMat) {
                    if (this._sharedMirrorBeamMat.isFrozen) this._sharedMirrorBeamMat.unfreeze();
                    if (!this._mirrorBeamEmissive) this._mirrorBeamEmissive = new BABYLON.Color3(0, 0, 0);
                    this._mirrorBeamEmissive.copyFromFloats(
                        this.mirrorBallSpotlightColor.r * 0.8,
                        this.mirrorBallSpotlightColor.g * 0.8,
                        this.mirrorBallSpotlightColor.b * 0.8
                    );
                    this._sharedMirrorBeamMat.emissiveColor = this._mirrorBeamEmissive;
                }
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
        //
        // QC O1: VJ Director macros (DROP / BLACKOUT / LOCK / forceScene) write the
        // SAME state vars this legacy cycler writes (lightingPhase, vjDropActive,
        // spotlightPattern, vjBuildIntensity). When a user fires a macro the
        // director sets `manualSceneUntil` to a future timestamp; while that
        // hold is active we MUST NOT let the legacy cycler trample those
        // decisions, or the macro flickers back to whatever phase the timer
        // happened to be in. Single source of truth during a manual hold.
        const directorHoldingMacro = !!(this.vjDirector &&
            this.vjDirector.manualSceneUntil > performance.now());
        if (!this.vjManualMode && !directorHoldingMacro) {
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
                        
                        // === FOG MACHINES: Auto mode with moderate output ===
                        this.fogIntensity = 0.8;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 12; // Occasional bursts
                        
                        this.spotlightPattern = 0; // Automated movement patterns
                        this.spotlightMode = 1; // Sweep only (no strobe)
                        this.spotlightSpeed = 0.6; // Slow, hypnotic
                        this.laserSpeed = 0.5;
                        this.ledWallSpeed = 0.7;
                        this.currentShowMode = 'spotlights';
                        log.info('🎭 BUILD: Tension rising - Slow sweeping beams');
                        break;
                        
                    case 'build':
                        // BUILD → TENSION: Increase intensity with gobos only
                        this.lightingPhase = 'tension';
                        this.targetEnergy = 0.75;
                        
                        // GOBOS ONLY - fast sweeping, no lasers yet (save for later)
                        this.lightsActive = true;  // Gobos featured
                        this.lasersActive = false; // Lasers OFF - save for their moment
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = true; // Blinders start pulsing
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 3; // CROSSED BEAMS - dramatic X patterns build tension
                        this.spotlightMode = 0; // Strobe + sweep
                        this.spotlightSpeed = 1.4; // Faster as tension builds
                        this.laserSpeed = 1.0;
                        this.ledWallSpeed = 1.2;
                        this.blinderSpeed = 0.8;
                        
                        // === FOG: Building intensity ===
                        this.fogIntensity = 1.2;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 6;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('⚡ TENSION: Gobos intensify - Crossed beams building');
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
                        
                        // === FOG MACHINE BURST ON DROP ===
                        this.fogIntensity = 2.0; // Maximum fog output
                        this.fogBurstInterval = 3; // Rapid bursts
                        // Trigger immediate burst
                        if (this.fogMachines) {
                            this.fogMachines.forEach(machine => {
                                machine.isBursting = true;
                                machine.burstTimer = 4.0; // Long burst on drop
                                machine.emitter.emitRate = 250;
                            });
                        }
                        
                        this.spotlightSpeed = 2.5; // FAST
                        this.laserSpeed = 2.0;
                        this.ledWallSpeed = 2.5; // LED wall goes crazy
                        this.strobeSpeed = 2.0; // Rapid strobes
                        this.blinderSpeed = 2.0; // Blinders punching
                        this.currentShowMode = 'laserSheet';
                        log.info('💥 DROP: MAXIMUM IMPACT - Fog machines blast!');
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
                        
                        // === FOG: Sustained high output ===
                        this.fogIntensity = 1.5;
                        this.fogBurstMode = 'continuous';
                        
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
                        
                        // === FOG MACHINE OFF for clean mirror ball reflections ===
                        this.fogIntensity = 0.0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(machine => {
                                machine.isBursting = false;
                                machine.emitter.emitRate = 0;
                            });
                        }
                        
                        this.mirrorBallSpeed = 0.4; // Slow, romantic
                        this.ledWallSpeed = 0.3; // LED wall very slow
                        this.currentShowMode = 'mirror';
                        log.info('🪩 BREAKDOWN: Disco moment - Clear air for reflections');
                        break;
                        
                    case 'breakdown':
                        // BREAKDOWN → ATMOSPHERIC: Slow gobos only - dreamy
                        this.lightingPhase = 'atmospheric';
                        this.targetEnergy = 0.35;
                        
                        // GOBOS ONLY - ethereal slow movement after disco moment
                        this.lightsActive = true;   // Slow ethereal gobos
                        this.lasersActive = false;  // No lasers
                        this.mirrorBallActive = false; // Mirror ball had its moment
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true; // Light haze for beam visibility
                        
                        this.spotlightPattern = 2; // MIRROR SWEEP - converging/diverging ethereal
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.3; // Very slow, dreamlike
                        this.mirrorBallSpeed = 0.5;
                        this.ledWallSpeed = 0.4;
                        
                        // === FOG: Light haze for ethereal beams ===
                        this.fogIntensity = 0.6;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 20;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('✨ ATMOSPHERIC: Ethereal gobos - Dreamlike sweeps');
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
                        
                        // === FOG MACHINES: Heavy continuous output for laser tunnel ===
                        this.fogIntensity = 1.5;
                        this.fogBurstMode = 'continuous';
                        
                        this.laserSpeed = 0.3; // Very slow rotation
                        this.laserFanAngle = 0.2; // Narrow fan - beams converge
                        this.ledWallSpeed = 0.5;
                        this.currentShowMode = 'lasers';
                        log.info('🌀 LASER TUNNEL: Fog machines continuous for beam visibility');
                        break;
                        
                    case 'laser_tunnel':
                        // LASER TUNNEL → GROOVE: Transition to gobos-only hypnotic groove
                        this.lightingPhase = 'groove';
                        this.targetEnergy = 0.6;
                        
                        // GOBOS ONLY for groove - lasers had their moment
                        this.lightsActive = true;   // Gobos take over
                        this.lasersActive = false;  // Lasers OFF - contrast after laser tunnel
                        this.mirrorBallActive = false;
                        this.strobesActive = false;
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = true;
                        
                        this.spotlightPattern = 2; // MIRROR SWEEP - hypnotic synchronized movement
                        this.spotlightMode = 1; // Sweep only
                        this.spotlightSpeed = 0.6; // Medium speed for groove
                        this.laserSpeed = 0.6;
                        this.laserFanAngle = 0.5; // Normal spread
                        this.ledWallSpeed = 0.8;
                        
                        // === FOG: Light haze for groove ===
                        this.fogIntensity = 0.7;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 15;
                        
                        this.currentShowMode = 'spotlights';
                        log.info('🎵 GROOVE: Gobos-only hypnosis after laser intensity');
                        break;
                        
                    case 'groove':
                        // GROOVE → EUPHORIA: Mirror ball moment - disco glory
                        this.lightingPhase = 'euphoria';
                        this.targetEnergy = 0.85;
                        
                        // MIRROR BALL FEATURED - solo star with subtle gobos
                        // This is THE disco moment - mirror ball deserves focus
                        this.lightsActive = true;   // Slow gobos complement
                        this.lasersActive = false;  // Lasers OFF - would overpower reflections
                        this.mirrorBallActive = true; // THE STAR
                        this.strobesActive = false; // No strobes - pure vibes
                        this.blindersActive = false;
                        this.laserSheetActive = false;
                        this.smokeActive = false;   // Clear air for crisp reflections
                        
                        this.spotlightPattern = 1; // STATIC DOWN - let mirror ball shine
                        this.spotlightMode = 1; // Sweep only - elegant
                        this.spotlightSpeed = 0.3; // Very slow - don't compete
                        this.mirrorBallSpeed = 0.6;
                        this.ledWallSpeed = 0.4; // Subdued LED wall
                        
                        // === FOG OFF - clear air for mirror ball reflections ===
                        this.fogIntensity = 0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => { m.isBursting = false; m.emitter.emitRate = 0; });
                        }
                        
                        this.currentShowMode = 'mirror';
                        log.info('💫 EUPHORIA: Mirror ball glory - Disco moment');
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
                        
                        // === FOG OFF - pure darkness ===
                        this.fogIntensity = 0;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => { m.isBursting = false; m.emitter.emitRate = 0; });
                        }
                        
                        this.ledWallSpeed = 0.1; // LED wall very dim, slow pulse
                        this.currentShowMode = 'darkness';
                        log.info('🌑 DARKNESS: Dramatic blackout - fog cleared');
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
                        
                        // === FOG BURST on strobe attack ===
                        this.fogIntensity = 1.8;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 4;
                        if (this.fogMachines) {
                            this.fogMachines.forEach(m => {
                                m.isBursting = true;
                                m.burstTimer = 3.0;
                                m.emitter.emitRate = 180;
                            });
                        }
                        
                        this.strobeSpeed = 3.0; // VERY FAST
                        this.blinderSpeed = 2.5;
                        this.ledWallSpeed = 3.0; // LED goes crazy
                        this.currentShowMode = 'strobe_attack';
                        log.info('⚡ STROBE ATTACK: Fog blast with strobes!');
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
                        
                        // === FOG: moderate auto mode for new cycle ===
                        this.fogIntensity = 1.0;
                        this.fogBurstMode = 'auto';
                        this.fogBurstInterval = 10;
                        
                        this.spotlightPattern = 0;
                        this.spotlightMode = 1;
                        this.spotlightSpeed = 0.7;
                        this.ledWallSpeed = 0.8;
                        this.currentShowMode = 'spotlights';
                        log.info('🔄 BUILD: New cycle begins - The journey continues');
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
        } else if (this.ledWallActive && (this.masterIntensity == null || this.masterIntensity > 0.02)) {
            // Legacy update method (skipped during VJ Director BLACKOUT)
            this.updateLEDWall(time, audioData);
        } else if (this.ledPanels && this.ledPanels.length > 0 &&
                   (!this.ledWallActive || (this.masterIntensity != null && this.masterIntensity <= 0.02))) {
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
                const speedMultiplier = (this.laserSpeed || 1.0) * dtScale;
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
                    
                    // Orient beam — QC O5: pool quaternion on the beam object so
                    // we don't allocate (3 lasers × 5 beams × 60 fps ≈ 900/sec).
                    this.vecPool.up.set(0, 1, 0);
                    BABYLON.Vector3.CrossToRef(this.vecPool.up, direction, this.vecPool.laserAxis);
                    const angle = Math.acos(BABYLON.Vector3.Dot(this.vecPool.up, direction.normalize()));

                    if (!beam._rotQuat) beam._rotQuat = new BABYLON.Quaternion();
                    if (this.vecPool.laserAxis.length() > 0.001) {
                        this.vecPool.laserAxis.normalize();
                        BABYLON.Quaternion.RotationAxisToRef(this.vecPool.laserAxis, angle, beam._rotQuat);
                        beam.mesh.rotationQuaternion = beam._rotQuat;
                    } else {
                        // Straight up or straight down — use shared static quaternions
                        beam.mesh.rotationQuaternion =
                            (BABYLON.Vector3.Dot(this.vecPool.up, direction) > 0)
                                ? this._quatIdentity
                                : this._quatFlipX;
                    }
                    
                    // UPDATE GLOW BEAMS - Same position/rotation/scale as core
                    // QC O5: pool each glow mesh's quaternion + copyFrom (no allocation per frame).
                    if (beam.innerGlow) {
                        beam.innerGlow.scaling.y = beamLength;
                        beam.innerGlow.position.copyFrom(beam.mesh.position);
                        if (!beam._innerGlowQuat) beam._innerGlowQuat = new BABYLON.Quaternion();
                        beam._innerGlowQuat.copyFrom(beam.mesh.rotationQuaternion);
                        beam.innerGlow.rotationQuaternion = beam._innerGlowQuat;
                    }
                    if (beam.beamGlow) {
                        beam.beamGlow.scaling.y = beamLength;
                        beam.beamGlow.position.copyFrom(beam.mesh.position);
                        if (!beam._beamGlowQuat) beam._beamGlowQuat = new BABYLON.Quaternion();
                        beam._beamGlowQuat.copyFrom(beam.mesh.rotationQuaternion);
                        beam.beamGlow.rotationQuaternion = beam._beamGlowQuat;
                    }
                    
                    // Hit spots removed - no floor reflections needed
                    
                    // Color all beam elements with current color - HYPERREALISTIC color grading
                    let currentColor, innerGlowColor, outerGlowColor;
                    if (this.currentColorIndex === 0) {
                        currentColor = this.cachedColors.red;
                        innerGlowColor = this.cachedLaserGlowColors.redInner;
                        outerGlowColor = this.cachedLaserGlowColors.redOuter;
                    } else if (this.currentColorIndex === 1) {
                        currentColor = this.cachedColors.green;
                        innerGlowColor = this.cachedLaserGlowColors.greenInner;
                        outerGlowColor = this.cachedLaserGlowColors.greenOuter;
                    } else {
                        currentColor = this.cachedColors.blue;
                        innerGlowColor = this.cachedLaserGlowColors.blueInner;
                        outerGlowColor = this.cachedLaserGlowColors.blueOuter;
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
                    currentEmissiveColor = this.cachedLaserGlowColors.redEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.redBright;
                } else if (this.currentColorIndex === 1) {
                    currentLaserColor = this.cachedColors.green;
                    currentEmissiveColor = this.cachedLaserGlowColors.greenEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.greenBright;
                } else {
                    currentLaserColor = this.cachedColors.blue;
                    currentEmissiveColor = this.cachedLaserGlowColors.blueEmissive;
                    currentBrightColor = this.cachedLaserGlowColors.blueBright;
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
        // HYPERREALISTIC: Color change interval varies with energy level
        // High energy (drops) = rapid color changes (2-4s)
        // Low energy (ambient) = slow color changes (8-12s)
        const colorChangeInterval = this.vjDropActive ? 2 : (12 - (this.energyLevel * 8));
        if (!this.vjManualMode && time - this.lastColorChange > colorChangeInterval) {
            this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
            
            // SMOOTH COLOR TRANSITION: Store previous color for interpolation
            this.previousSpotColor = this.currentSpotColor ? this.currentSpotColor.clone() : this.spotColorList[0];
            this.targetSpotColor = this.spotColorList[this.spotColorIndex];
            this.colorTransitionProgress = 0; // Start transition
            this.lastColorChange = time;
            
            // Update ALL lights to new color target
            if (this.spotlights) {
                this.spotlights.forEach((spot, i) => {
                    // Update color reference - fixture materials updated in animation loop
                    spot.color = this.targetSpotColor;
                });
            }
        }
        
        // SMOOTH COLOR INTERPOLATION: Fade between colors over 0.5-1.0 seconds
        // This creates the smooth, professional color transitions seen in real clubs
        if (this.colorTransitionProgress !== undefined && this.colorTransitionProgress < 1) {
            // Transition speed: faster during high energy
            const transitionSpeed = this.vjDropActive ? 0.04 : 0.02;
            this.colorTransitionProgress = Math.min(1, this.colorTransitionProgress + transitionSpeed);
            
            // Smooth easing for natural feel
            const t = this.colorTransitionProgress;
            const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
            
            // Interpolate RGB channels
            if (this.previousSpotColor && this.targetSpotColor) {
                this.currentSpotColor = new BABYLON.Color3(
                    this.previousSpotColor.r + (this.targetSpotColor.r - this.previousSpotColor.r) * eased,
                    this.previousSpotColor.g + (this.targetSpotColor.g - this.previousSpotColor.g) * eased,
                    this.previousSpotColor.b + (this.targetSpotColor.b - this.previousSpotColor.b) * eased
                );
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
                
                // VJ PATTERN CONTROL - spotlightPattern: 0=random, 1=static down, 2=mirror sweep, 3=crossed beams
                // Apply speed multiplier to all animated patterns
                const speedMultiplier = this.spotlightSpeed || 1.0;
                
                if (this.spotlightPattern === 1) {
                    // PATTERN 1: STATIC DOWN - All lights point straight down
                    dirX = 0;
                    dirZ = 0;
                    
                } else if (this.spotlightPattern === 2) {
                    // PATTERN 2: MIRROR SWEEP - Left and right sides sweep toward/away from each other
                    // Creates synchronized converging (toward center) and diverging (away from center) motion
                    const sweepPhase = globalPhase * speedMultiplier;
                    const sweepValue = Math.sin(sweepPhase * 0.5) * 0.7; // Slower, wider sweep
                    
                    // Layout: Left side (i=0,1,2) at x=-8, Right side (i=3,4,5) at x=8
                    // When sweepValue > 0: both sides point INWARD (converging toward center)
                    // When sweepValue < 0: both sides point OUTWARD (diverging from center)
                    const isLeftSide = (i < 3);
                    // Left side: positive sweepValue = point right (+X toward center)
                    // Right side: negative sweepValue = point left (-X toward center)
                    dirX = isLeftSide ? sweepValue : -sweepValue;
                    
                    // Also add slight Z oscillation so beams sweep front-to-back together
                    const zSweep = Math.sin(sweepPhase * 0.3) * 0.25;
                    dirZ = zSweep;
                    
                } else if (this.spotlightPattern === 3) {
                    // PATTERN 3: CROSSED BEAMS - Outer gobos cross over middle gobo
                    // Each side has 3 lights: front (0,3), middle (1,4), back (2,5)
                    // The front and back gobos sweep across, crossing over the middle one
                    const sweepPhase = globalPhase * speedMultiplier;
                    const crossSweep = Math.sin(sweepPhase * 0.4) * 0.8; // Wide crossing motion
                    
                    const isLeftSide = (i < 3);
                    const positionInGroup = i % 3; // 0=front, 1=middle, 2=back
                    
                    if (positionInGroup === 1) {
                        // MIDDLE gobo: Points straight down/slightly forward - stationary anchor
                        dirX = 0;
                        dirZ = -0.2; // Slight forward angle toward dance floor
                    } else if (positionInGroup === 0) {
                        // FRONT gobo: Sweeps from outside to inside and back
                        // When crossing, it goes PAST the middle gobo position
                        dirX = isLeftSide ? crossSweep : -crossSweep;
                        dirZ = -0.35 + Math.abs(crossSweep) * 0.2; // More forward when at extremes
                    } else {
                        // BACK gobo: Sweeps opposite to front (counter-phase)
                        // This creates an X pattern when viewed from above
                        dirX = isLeftSide ? -crossSweep : crossSweep; // Opposite of front
                        dirZ = 0.1 - Math.abs(crossSweep) * 0.15; // Slightly back, less when crossing
                    }
                    
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
                    
                    // Calculate where beam centerline intersects surfaces (floor and walls)
                    // Use closest intersection for pool positioning
                    let centerDistanceToSurface;
                    let surfaceIntersection;
                    let hitSurface = 'floor'; // 'floor', 'backWall', 'leftWall', 'rightWall'
                    
                    // Club boundaries
                    const FLOOR_Y = 0;
                    const BACK_WALL_Z = -25.8; // LED wall position
                    const LEFT_WALL_X = -10;
                    const RIGHT_WALL_X = 10;
                    
                    // Calculate distances to each surface (only if beam is heading toward it)
                    let distToFloor = Infinity;
                    let distToBackWall = Infinity;
                    let distToLeftWall = Infinity;
                    let distToRightWall = Infinity;
                    
                    // Floor intersection (beam pointing down)
                    if (direction.y < -0.01) {
                        distToFloor = emissionPoint.y / Math.abs(direction.y);
                    }
                    
                    // Back wall intersection (beam pointing back/negative Z)
                    if (direction.z < -0.01) {
                        distToBackWall = (emissionPoint.z - BACK_WALL_Z) / Math.abs(direction.z);
                    }
                    
                    // Left wall intersection (beam pointing left/negative X)
                    if (direction.x < -0.01) {
                        distToLeftWall = (emissionPoint.x - LEFT_WALL_X) / Math.abs(direction.x);
                    }
                    
                    // Right wall intersection (beam pointing right/positive X)
                    if (direction.x > 0.01) {
                        distToRightWall = (RIGHT_WALL_X - emissionPoint.x) / direction.x;
                    }
                    
                    // Find closest surface hit
                    centerDistanceToSurface = distToFloor;
                    hitSurface = 'floor';
                    
                    if (distToBackWall < centerDistanceToSurface && distToBackWall > 0) {
                        centerDistanceToSurface = distToBackWall;
                        hitSurface = 'backWall';
                    }
                    if (distToLeftWall < centerDistanceToSurface && distToLeftWall > 0) {
                        centerDistanceToSurface = distToLeftWall;
                        hitSurface = 'leftWall';
                    }
                    if (distToRightWall < centerDistanceToSurface && distToRightWall > 0) {
                        centerDistanceToSurface = distToRightWall;
                        hitSurface = 'rightWall';
                    }
                    
                    // Cap at reasonable maximum
                    if (centerDistanceToSurface === Infinity || centerDistanceToSurface > 20) {
                        centerDistanceToSurface = 15;
                    }
                    
                    // Calculate intersection point
                    surfaceIntersection = emissionPoint.add(direction.scale(centerDistanceToSurface));
                    
                    // Keep references for backward compatibility
                    let floorIntersection = surfaceIntersection.clone();
                    let centerDistanceToFloor = centerDistanceToSurface;
                    
                    // HYPERREALISTIC BEAM: Extend beam PAST floor so cone edges touch floor
                    // 
                    // When a cone is tilted, the "uphill" edge of the cone needs to travel
                    // further to reach the floor. We extend the beam past the floor intersection
                    // so ALL edges of the cone touch the floor.
                    //
                    // HYPERREALISTIC BEAM: Extend past floor so cone edges touch, then clip
                    // When a cone hits floor at angle, the "uphill" edge needs to travel further
                    //
                    // Base beam length from emission to surface intersection (centerline)
                    const centerBeamLength = centerDistanceToSurface;
                    
                    // Calculate tilt angle (used for extension and pool ellipse)
                    const cosTheta = Math.abs(direction.y);
                    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
                    const tanTheta = cosTheta > 0.1 ? sinTheta / cosTheta : 0;
                    
                    // Cone radius at surface end (from mesh: diameterTop=1.5, so radius=0.75)
                    const coneRadius = 0.75;
                    
                    // Extension needed for uphill edge to reach surface: r * tan(θ)
                    // For floor: extends cone past floor so edges touch
                    // For walls: extend slightly so beam visually connects to wall surface
                    let uphillExtension;
                    if (hitSurface === 'floor') {
                        uphillExtension = coneRadius * tanTheta;
                    } else {
                        // Wall hits: extend beam slightly past wall for visual connection
                        // Use perpendicular angle to the wall for extension calc
                        let wallCos;
                        if (hitSurface === 'backWall') wallCos = Math.abs(direction.z);
                        else wallCos = Math.abs(direction.x); // left/right walls
                        const wallTan = wallCos > 0.1 ? Math.sqrt(1 - wallCos * wallCos) / wallCos : 0;
                        uphillExtension = coneRadius * wallTan * 0.5; // Half extension for walls
                    }
                    
                    // BEAM LENGTH: Extend past surface so cone edges visually touch
                    const beamLength = Math.min(18, Math.max(2, centerBeamLength + uphillExtension));
                    
                    // Store beamLength on spot for pool calculations
                    spot.currentBeamLength = beamLength;
                    
                    // Position beam: Cylinder is centered at its origin
                    // After rotation, one end will be at emission point, other past floor
                    // 
                    // BABYLON cylinder: local +Y is "top" (diameterTop), local -Y is "bottom" (diameterBottom)
                    // We created: diameterTop=1.5 (wide), diameterBottom=0.2 (narrow)
                    // We want: wide end toward/past floor, narrow end at fixture (emission point)
                    // So: local +Y should point TOWARD FLOOR (same as direction)
                    //
                    // Cylinder extends from center: -height/2 to +height/2 in local Y
                    // After scaling.y = beamLength: from -beamLength/2 to +beamLength/2
                    // After rotation (local +Y = direction):
                    //   - Local +Y end (wide) is at: center + direction * beamLength/2 
                    //   - Local -Y end (narrow) is at: center - direction * beamLength/2 (should be at emission)
                    //
                    // So center should be at: emissionPoint + direction * beamLength/2
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
                    // QC O5: pool the rotation axis + per-spot rotation quaternion so we
                    // don't allocate ~480 objects/sec across the 6 spotlights.
                    this.vecPool.up.set(0, 1, 0);
                    const angle = Math.acos(BABYLON.Vector3.Dot(direction, this.vecPool.up));
                    BABYLON.Vector3.CrossToRef(this.vecPool.up, direction, this.vecPool.spotAxis);
                    const axisLen = this.vecPool.spotAxis.length();

                    if (axisLen > 0.001) {
                        this.vecPool.spotAxis.scaleInPlace(1 / axisLen); // normalize in place
                        if (!spot._rotQuat) spot._rotQuat = new BABYLON.Quaternion();
                        BABYLON.Quaternion.RotationAxisToRef(this.vecPool.spotAxis, angle, spot._rotQuat);
                        spot.beam.rotationQuaternion = spot._rotQuat;
                    } else if (direction.y > 0) {
                        // Pointing up (away from floor) - no flip needed (narrow end up is correct)
                        spot.beam.rotationQuaternion = this._quatIdentity;
                    } else {
                        // Pointing straight down - FLIP 180° so wide end (diameterTop) goes to floor
                        spot.beam.rotationQuaternion = this._quatFlipX;
                    }
                    
                    // UPDATE BEAM LENGTH
                    spot.beam.scaling.y = beamLength;
                    
                    // HYPERREALISTIC: Update clip plane based on hit surface
                    // This hides any part of the beam that extends past the surface.
                    //
                    // Convention (StandardMaterial clipPlane4): a fragment is DISCARDED where
                    //   N·worldPos + d > 0
                    // So for each surface we pick (N, d) such that the half-space we want to
                    // hide (the side past the surface) evaluates positive.
                    //
                    // BUG HISTORY: previous version used `-WALL + 0.01` for d which only
                    // produces a sane plane when WALL is positive (right wall). For walls
                    // at negative coordinates (left wall, back wall) the sign flipped and
                    // the entire beam got clipped — visible as left-side beams disappearing
                    // when aimed at the side wall.
                    if (spot.beamMat) {
                        const EPS = 0.01;
                        // Lazy-init per-spot cached planes (one allocation total instead of one per frame)
                        if (!spot._clipPlanes) {
                            spot._clipPlanes = {
                                floor:     new BABYLON.Plane(0, -1, 0, EPS),
                                backWall:  new BABYLON.Plane(0, 0, -1, BACK_WALL_Z - EPS),
                                leftWall:  new BABYLON.Plane(-1, 0, 0, LEFT_WALL_X - EPS),
                                rightWall: new BABYLON.Plane(1, 0, 0, -RIGHT_WALL_X - EPS)
                            };
                        }
                        spot.beamMat.clipPlane4 = spot._clipPlanes[hitSurface] || spot._clipPlanes.floor;
                    }
                    
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

                    // Physics-based surface brightness (Lambert x inverse-square). Declared
                    // here rather than inside the light-pool block because the gobo block
                    // below is a sibling scope and also needs it. Defaults to 1.0 for the
                    // frames where the beam misses a surface and the value is never computed.
                    let physicsIntensity = 1.0;

                    spot.beam.visibility = beamVisible ? 1.0 : 0;
                    
                    // Update beamGlow - Match main beam world-space positioning
                    if (spot.beamGlow) {
                        // Unparent if needed
                        if (spot.beamGlow.parent) {
                            spot.beamGlow.setParent(null);
                        }
                        // Match main beam position and rotation exactly
                        spot.beamGlow.position.copyFrom(beamMidpoint);
                        // QC O5: pooled quat + copyFrom instead of clone() per frame
                        if (!spot._beamGlowQuat) spot._beamGlowQuat = new BABYLON.Quaternion();
                        spot._beamGlowQuat.copyFrom(spot.beam.rotationQuaternion);
                        spot.beamGlow.rotationQuaternion = spot._beamGlowQuat;
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
                    const baseIntensity = 3.0 + atmosphericNoise; // Boosted to compensate for beam gradient dimming (was 2.0)
                    spot.beamMat.emissiveColor = spotColor.scale(baseIntensity);
                    spot.beamMat.emissiveIntensity = 8.0; // High intensity for light shaft
                    
                    // CRITICAL: Store the actual beam color for fixture sync (BASE color, not scaled)
                    // This ensures fixture uses EXACT same color as beam
                    spot.currentBeamColor = spotColor;
                    
                    // HYPERREALISTIC: Alpha varies with beam angle and atmospheric density
                    // Beams become more visible at shallower angles (more particles in path)
                    // Also factor in distance - longer beams have more particles
                    const beamPathLength = spot.currentBeamLength || 7.3;
                    const pathDensity = Math.min(1.0, beamPathLength / 10.0); // Longer = denser
                    const angleVis = 1.0 + (1.0 - cosTheta) * 0.5; // More visible at steeper tilt
                    spot.beamMat.alpha = (0.12 + Math.abs(atmosphericNoise) * 0.06) * pathDensity * angleVis;
                    
                    // Update HYPERREALISTIC floor light pool - Physics-accurate projection
                    if (spot.lightPool) {
                        if (this.lightsActive && beamVisible) {
                            // === PHYSICS-ACCURATE ELLIPTICAL PROJECTION ===
                            // The beam mesh is a cone with:
                            //   - diameterTop = 1.5m (at floor end, after scaling)
                            //   - diameterBottom = 0.2m (at fixture lens)
                            //   - height = beamLength (scaled dynamically)
                            // The pool should match the beam's floor intersection exactly
                            
                            // Beam half-angle from mesh geometry: atan((0.75 - 0.1) / beamLength)
                            // For typical 7.3m beam: atan(0.65/7.3) ≈ 5.1°
                            // But the mesh scales, so floor diameter is always proportional to length
                            // diameterAtFloor = diameterBottom + (diameterTop - diameterBottom) * 1.0
                            //                 = 0.2 + (1.5 - 0.2) = 1.5m for unit height
                            // When scaled by beamLength, the cone expands proportionally
                            
                            // For consistent visuals: use fixed ratio based on mesh geometry
                            // The beam scales uniformly in Y, so floor diameter scales with length
                            const meshFloorDiameter = 0.2 + (1.5 - 0.2) * 1.0; // 1.5m at unit height
                            const beamDiameterAtFloor = meshFloorDiameter; // Fixed for mesh consistency
                            
                            // === ELLIPSE GEOMETRY ===
                            // When beam hits floor at angle θ from vertical:
                            // Minor axis = beam diameter (perpendicular to tilt)
                            // Major axis = beam diameter / cos(θ) (along tilt direction)
                            const incidentAngle = Math.acos(Math.abs(direction.y)); // θ from vertical
                            const cosIncident = Math.abs(direction.y);
                            const ellipseStretch = 1.0 / Math.max(0.15, cosIncident);
                            
                            // Clamp stretch to prevent extreme ellipses at very shallow angles
                            const clampedStretch = Math.min(5.0, ellipseStretch);
                            
                            // Pool radii: add 15% for soft penumbra edges
                            const minorRadius = (beamDiameterAtFloor * 0.5) * 1.15;
                            const majorRadius = minorRadius * clampedStretch;
                            
                            // Tilt direction on XZ plane
                            const tiltDirX = direction.x;
                            const tiltDirZ = direction.z;
                            const tiltMagnitude = Math.sqrt(tiltDirX * tiltDirX + tiltDirZ * tiltDirZ);
                            
                            // === LAMBERT'S COSINE LAW ===
                            // Irradiance on surface = I₀ * cos(θ)
                            // Light spreads over larger area at steeper angles → dimmer
                            const lambertFactor = Math.max(0.2, cosIncident);
                            
                            // === INVERSE SQUARE FALLOFF ===
                            // I = I₀ / d², normalized to reference distance
                            const refDist = 7.3; // Fixture height in meters
                            const invSqFalloff = Math.pow(refDist / Math.max(2, centerBeamLength), 2);
                            const clampedInvSq = Math.min(2.0, Math.max(0.25, invSqFalloff));
                            
                            // Combined physics-based intensity
                            physicsIntensity = lambertFactor * clampedInvSq;
                            
                            // Subtle atmospheric shimmer (dust particles in beam)
                            const shimmer = 1.0 + Math.sin(time * 1.8 + i * 0.9) * 0.05;
                            
                            // === POSITION POOL AT ACTUAL SURFACE INTERSECTION ===
                            // The pool appears where the beam hits the surface (floor or wall)
                            // Position and orientation depend on which surface was hit
                            
                            // Store hit surface for reference
                            spot.hitSurface = hitSurface;
                            
                            if (hitSurface === 'floor') {
                                // Floor hit - pool lies flat on floor
                                spot.lightPool.position.set(
                                    surfaceIntersection.x,
                                    0.004, // Just above floor (prevent z-fighting)
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = Math.PI / 2; // Flat on floor
                                spot.lightPool.rotation.z = 0;
                                
                                // Ellipse orientation for tilted beams on floor
                                if (tiltMagnitude > 0.03) {
                                    const poolRotation = Math.atan2(tiltDirX, tiltDirZ);
                                    spot.lightPool.rotation.y = poolRotation;
                                    spot.lightPool.scaling.set(minorRadius, majorRadius, 1);
                                } else {
                                    spot.lightPool.rotation.y = 0;
                                    spot.lightPool.scaling.set(minorRadius, minorRadius, 1);
                                }
                            } else if (hitSurface === 'backWall') {
                                // Back wall hit - pool is vertical facing forward (+Z)
                                spot.lightPool.position.set(
                                    surfaceIntersection.x,
                                    surfaceIntersection.y,
                                    BACK_WALL_Z + 0.01 // Just in front of wall
                                );
                                spot.lightPool.rotation.x = 0; // Vertical
                                spot.lightPool.rotation.y = 0; // Facing forward
                                spot.lightPool.rotation.z = 0;
                                
                                // Ellipse stretches vertically when hitting wall at angle
                                const wallAngle = Math.acos(Math.abs(direction.z));
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.z));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            } else if (hitSurface === 'leftWall') {
                                // Left wall hit - pool is vertical facing right (+X)
                                spot.lightPool.position.set(
                                    LEFT_WALL_X + 0.01, // Just in front of wall
                                    surfaceIntersection.y,
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = 0;
                                spot.lightPool.rotation.y = Math.PI / 2; // Facing right
                                spot.lightPool.rotation.z = 0;
                                
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.x));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            } else if (hitSurface === 'rightWall') {
                                // Right wall hit - pool is vertical facing left (-X)
                                spot.lightPool.position.set(
                                    RIGHT_WALL_X - 0.01, // Just in front of wall
                                    surfaceIntersection.y,
                                    surfaceIntersection.z
                                );
                                spot.lightPool.rotation.x = 0;
                                spot.lightPool.rotation.y = -Math.PI / 2; // Facing left
                                spot.lightPool.rotation.z = 0;
                                
                                const wallStretch = 1.0 / Math.max(0.15, Math.abs(direction.x));
                                const clampedWallStretch = Math.min(5.0, wallStretch);
                                spot.lightPool.scaling.set(minorRadius, minorRadius * clampedWallStretch, 1);
                            }
                            spot.lightPool.visibility = 1.0;
                            
                            // === POOL MATERIAL - Physics-based brightness ===
                            // Make pool clearly visible on the surface
                            // Wall hits get boosted brightness since wall materials are darker
                            const surfaceBrightnessBoost = (hitSurface === 'floor') ? 1.0 : 1.6;
                            const poolBrightness = 2.5 * physicsIntensity * shimmer * surfaceBrightnessBoost;
                            if (spot.poolMat) {
                                spot.poolMat.emissiveColor = spotColor.scale(poolBrightness);
                                // Higher alpha on walls for better visibility against dark surfaces
                                const basePoolAlpha = (hitSurface === 'floor') ? 0.8 : 0.95;
                                spot.poolMat.alpha = basePoolAlpha * Math.min(1.0, physicsIntensity);
                            }
                            
                            // === POOL LIGHT (if enabled) ===
                            if (spot.poolLight) {
                                // Position based on hit surface
                                if (hitSurface === 'floor') {
                                    spot.poolLight.position.set(
                                        surfaceIntersection.x,
                                        0.4,
                                        surfaceIntersection.z
                                    );
                                } else {
                                    // For walls, offset light slightly in front of surface
                                    spot.poolLight.position.copyFrom(surfaceIntersection);
                                    if (hitSurface === 'backWall') spot.poolLight.position.z += 0.5;
                                    else if (hitSurface === 'leftWall') spot.poolLight.position.x += 0.5;
                                    else if (hitSurface === 'rightWall') spot.poolLight.position.x -= 0.5;
                                }
                                spot.poolLight.diffuse = spotColor.clone();
                                spot.poolLight.specular = spotColor.scale(0.25);
                                spot.poolLight.intensity = 3.5 * physicsIntensity * shimmer;
                                spot.poolLight.range = majorRadius * 2.0;
                                spot.poolLight.setEnabled(true);
                            }
                            
                            // === OUTER GLOW (penumbra scatter) ===
                            // HYPERREALISTIC: Wall hits produce larger scatter halos (rough surface diffusion)
                            if (spot.lightPoolGlow) {
                                // Wall surfaces scatter light more widely (rough brick/concrete)
                                const scatterMultiplier = (hitSurface === 'floor') ? 2.2 : 3.0;
                                const glowMinor = minorRadius * scatterMultiplier;
                                const glowMajor = majorRadius * scatterMultiplier;
                                
                                // Match pool position for glow
                                spot.lightPoolGlow.position.copyFrom(spot.lightPool.position);
                                // Offset slightly toward viewer to prevent z-fighting
                                if (hitSurface === 'floor') {
                                    spot.lightPoolGlow.position.y = 0.002;
                                } else if (hitSurface === 'backWall') {
                                    spot.lightPoolGlow.position.z += 0.008;
                                } else if (hitSurface === 'leftWall') {
                                    spot.lightPoolGlow.position.x += 0.008;
                                } else if (hitSurface === 'rightWall') {
                                    spot.lightPoolGlow.position.x -= 0.008;
                                }
                                
                                // Copy rotation from pool
                                spot.lightPoolGlow.rotation.copyFrom(spot.lightPool.rotation);
                                
                                // Elliptical glow on all surfaces when beam is tilted
                                if (tiltMagnitude > 0.03) {
                                    spot.lightPoolGlow.scaling.set(glowMinor, glowMajor, 1);
                                } else {
                                    spot.lightPoolGlow.scaling.set(glowMinor, glowMinor, 1);
                                }
                                spot.lightPoolGlow.visibility = 1.0;
                                
                                if (spot.poolGlowMat) {
                                    // HYPERREALISTIC: Wall scatter is warmer/brighter (Lambertian diffuse scatter)
                                    const wallScatterBoost = (hitSurface === 'floor') ? 1.0 : 1.4;
                                    const glowBrightness = 0.7 * physicsIntensity * shimmer * wallScatterBoost;
                                    spot.poolGlowMat.emissiveColor = spotColor.scale(glowBrightness);
                                    const baseGlowAlpha = (hitSurface === 'floor') ? 0.35 : 0.5;
                                    spot.poolGlowMat.alpha = baseGlowAlpha * Math.min(1.0, physicsIntensity);
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
                    
                    // === GOBO PROJECTION UPDATE ===
                    if (spot.goboProjection) {
                        const showGobo = this.lightsActive && this.goboEnabled && beamVisible;
                        spot.goboProjection.setEnabled(showGobo);
                        spot.goboProjection.visibility = showGobo ? 1.0 : 0;
                        
                        if (showGobo) {
                            // === SURFACE-AWARE GOBO POSITIONING ===
                            // Gobo must match the lightPool's position and orientation on any surface
                            const goboLocalOffset = spot.goboLocalRotation || 0;
                            const goboRotAngle = this.goboRotation + goboLocalOffset;
                            
                            if (hitSurface === 'floor') {
                                // Floor: flat disc on XZ plane
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x,
                                    0.025, // Just above floor
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = Math.PI / 2;
                                spot.goboProjection.rotation.y = spot.lightPool.rotation.y;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'backWall') {
                                // Back wall: vertical disc facing +Z
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z + 0.015
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = 0;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'leftWall') {
                                // Left wall: vertical disc facing +X
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x + 0.015,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = Math.PI / 2;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            } else if (hitSurface === 'rightWall') {
                                // Right wall: vertical disc facing -X
                                spot.goboProjection.position.set(
                                    spot.lightPool.position.x - 0.015,
                                    spot.lightPool.position.y,
                                    spot.lightPool.position.z
                                );
                                spot.goboProjection.rotation.x = 0;
                                spot.goboProjection.rotation.y = -Math.PI / 2;
                                spot.goboProjection.rotation.z = goboRotAngle;
                            }
                            
                            // Sync scale with light pool (gobo slightly larger for soft edges)
                            spot.goboProjection.scaling.x = spot.lightPool.scaling.x * 1.1;
                            spot.goboProjection.scaling.y = spot.lightPool.scaling.y * 1.1;
                            
                            // Update color to match spotlight with physics-based brightness
                            if (spot.goboMat) {
                                const goboBrightness = 1.8 * physicsIntensity;
                                spot.goboMat.emissiveColor = spotColor.scale(goboBrightness);
                            }
                            
                            // Hide regular pool when gobo is on (gobo replaces it)
                            spot.lightPool.visibility = 0;
                        } else {
                            // Gobo is off - ensure regular pool is visible (if lights are on)
                            if (this.lightsActive && beamVisible && spot.lightPool) {
                                spot.lightPool.visibility = 1.0;
                            }
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
                    if (spot.goboProjection) {
                        spot.goboProjection.setEnabled(false);
                        spot.goboProjection.visibility = 0;
                    }
                }
                
                // PROFESSIONAL CONSTANT INTENSITY (audio disabled)
                const baseIntensity = 18; // Professional moving head (300W equivalent)
                const smoothPulse = Math.sin(time * 2.5) * 3; // Smooth breathing effect
                
                // UPGRADE: Keep diffuse in sync with specular color for projectionTexture
                spot.light.specular = this.currentSpotColor;
                spot.light.diffuse = this.currentSpotColor.scale(0.15);
                
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
                if (spot.goboProjection) {
                    spot.goboProjection.setEnabled(false);
                    spot.goboProjection.visibility = 0;
                }
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

                // QC O2: use cached refs on the spot object instead of two
                // scene.getMeshByName() calls per spot per frame (~720 hash
                // lookups/sec for 6 spotlights). The references were captured
                // at fixture-creation time in createTrussMountedLights().
                const lens = spot.lens;
                const lightSource = spot.lightSource;

                // Update lens color
                if (lens && lens.material) {
                    const mat = lens.material;
                    // QC: only unfreeze on the first frame. Calling unfreeze() every
                    // frame re-runs Material.markDirty(), which walks every mesh in
                    // the scene (~720 full-scene scans/sec for 6 fixtures at 60 fps).
                    if (mat.isFrozen) mat.unfreeze();
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
                    // QC: only unfreeze on the first frame — see note above.
                    if (mat.isFrozen) mat.unfreeze();
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
        
        // NOTE: `this.ledTime` is advanced exactly ONCE per frame, at the top of
        // updateAnimations(), using `ledWallSpeed`. A second accumulator used to
        // live here that advanced it again using `spotlightSpeed` — LED patterns
        // therefore ran at roughly double speed and were coupled to the spotlight
        // slider. Removed (QC review).
        
        // Update strobes - respects strobesActive control
        // Strobe lights animation (with speed multiplier)
        // === PROFESSIONAL VJ STROBE SYSTEM ===
        // Synchronized with drops, builds, and bass for maximum impact
        const strobeSpeedMultiplier = this.strobeSpeed || 1.0;
        if (this.strobes && this.strobes.length > 0) {
            // Photosensitive Safe Mode hard-disables strobes regardless of VJ state
            if (this.strobesActive && !this.photosensitiveSafeMode) {
                // Get audio data for reactive strobing
                const bass = audioData.bass || 0;
                const treble = audioData.treble || 0;
                
                // VJ AUTO-MODE: Enhanced strobing during drops
                const inDropMode = this.vjDropActive;
                const inBuildMode = this.vjBuildIntensity > 0.7;
                
                this.strobes.forEach((strobe, i) => {
                    // Handle ongoing flash
                    if (strobe.flashDuration > 0) {
                        strobe.flashDuration -= dt * strobeSpeedMultiplier;
                    
                    // Variable intensity - SUPER BRIGHT strobes
                    // BOOST during drops for maximum crowd impact
                    let intensityVariation = strobe.currentIntensity || 80;
                    if (inDropMode) {
                        intensityVariation *= 1.5; // 50% brighter during drops
                    }
                    // VJ Director master fader (1.0 = full, 0 = blackout). Cheap multiply.
                    intensityVariation *= (this.masterIntensity != null ? this.masterIntensity : 1.0);
                    
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
                
                // Drive shared strobe flash light from max strobe intensity
                if (this.strobeFlashLight) {
                    let maxIntensity = 0;
                    this.strobes.forEach(s => {
                        if (s.flashDuration > 0) {
                            const burstPhase = Math.floor(s.flashDuration * 40 * strobeSpeedMultiplier) % 2;
                            if (burstPhase === 0 && s.currentIntensity > maxIntensity) {
                                maxIntensity = s.currentIntensity;
                            }
                        }
                    });
                    if (maxIntensity > 0) {
                        this.strobeFlashLight.intensity = maxIntensity * 3;
                        this.strobeFlashLight.setEnabled(true);
                        // Brief bloom spike for blinding strobe effect
                        if (this.renderPipeline && this.renderPipeline.bloomEnabled) {
                            this._preStrobeBloom = this._preStrobeBloom || this.renderPipeline.bloomWeight;
                            this.renderPipeline.bloomWeight = Math.min(1.0, this._preStrobeBloom + maxIntensity * 0.008);
                        }
                    } else {
                        this.strobeFlashLight.intensity = 0;
                        this.strobeFlashLight.setEnabled(false);
                        // Restore bloom
                        if (this._preStrobeBloom !== undefined && this.renderPipeline) {
                            this.renderPipeline.bloomWeight = this._preStrobeBloom;
                        }
                    }
                }
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
                if (this.strobeFlashLight) {
                    this.strobeFlashLight.intensity = 0;
                    this.strobeFlashLight.setEnabled(false);
                }
            }
        }
        
        // Blinders removed - strobes provide sufficient impact lighting
        
        // Bartender removed - will be replaced with 3D model later
        
        // === BASS-REACTIVE SPEAKER CONE PUSH ===
        // Subwoofer grilles visually pulse with bass for tactile audio feedback
        if (audioData.bass > 0.1) {
            const bassExcursion = audioData.bass * 0.015; // Subtle Z-axis push
            // QC O2: cache grill mesh refs once instead of two getMeshByName()
            // calls every audio-active frame. Resolved on first use.
            if (!this._subGrillRefs) {
                this._subGrillRefs = [
                    this.scene.getMeshByName('subGrill-7'),
                    this.scene.getMeshByName('subGrill7')
                ];
            }
            for (let g = 0; g < this._subGrillRefs.length; g++) {
                const grill = this._subGrillRefs[g];
                if (!grill) continue;
                if (grill._basePosZ === undefined) {
                    grill._basePosZ = grill.position.z; // Store original position
                    if (grill.isWorldMatrixFrozen) {
                        grill.unfreezeWorldMatrix();
                    }
                }
                grill.position.z = grill._basePosZ + bassExcursion;
            }
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
            // === CURATED IMMERSIVE LED WALL SHOW ===
            // Removed short utility effects such as strobes, scanners, EQ bars,
            // confetti, fire, and simple geometric flashes. The remaining set
            // keeps variation through vortex, expansion, organic flow, symmetry,
            // and slow breathing motion while staying hypnotic and continuous.
            this.patternHypnoticSpiral,     // [0] Counter-rotating rainbow vortex
            this.patternConcentricRings,    // [1] Endless rings rippling outward
            this.patternNestedSquares,      // [2] Square outlines blooming from center
            this.patternMandalaBloom,       // [3] Geometric flower opening over and over
            this.patternRippleRain,         // [4] Multiple ripples on a virtual pond
            this.patternBreathing,          // Slow inhale/exhale glow
            this.patternShockwave,          // Concentric rings expanding
            this.patternPulseStar,          // Star shape pulsing outward
            this.patternRadialPulse,        // Radial rays pulsing from center
            this.patternWaveCollide,        // Waves colliding at center
            this.patternCellularPulse,      // Organic cell-like pulsation
            this.patternTunnel,             // Tunnel/vortex effect
            this.patternKaleidoscope,       // Rotating kaleidoscope
            this.patternDNAHelix,           // Double helix spinning
            this.patternInfinityLoop,       // Flowing infinity symbol
            this.patternPlasma,             // Organic plasma flow
            this.patternAurora,             // Northern lights effect
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
        
        // Pattern dwell time. The active playlist is now all immersive and
        // continuous, so even the higher-energy visuals need enough time to
        // settle into a trance instead of flashing by like one-shot effects.
        const HYPNOTIC_PATTERN_COUNT = 5; // indices 0..4
        const isHypnotic = this.ledPattern < HYPNOTIC_PATTERN_COUNT;
        const beatsPerPattern = isHypnotic
            ? 32       // ~14.7s @ 130 BPM — long enough to lock the eye in
            : 16;      // varied but still immersive
        const fallbackSeconds = isHypnotic ? 16.0 : 8.0;
        const patternChangeTime = audioData.hasAudio
            ? this.beatInterval * beatsPerPattern
            : fallbackSeconds;
        
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
            // For partial brightness, use scale() but cache commonly used values
            panel.material.emissiveColor = color.scale(brightness);
        }
    }

    // === IMMERSIVE DANCE CLUB PATTERNS ===

    /**
     * patternHypnoticSpiral — flagship "infinite vortex" visual.
     *
     * Two counter-rotating logarithmic spirals layered with a per-radius hue
     * cycle and a bass-driven breathing zoom. On a 21×10 LED wall this reads
     * as a deep, rainbow tunnel pulling the viewer in on every kick — the
     * classic trance/psy visual that disappears the back wall in VR.
     *
     * Design choices:
     *  - Soft sin-band edges (not on/off) so the effect survives bloom and
     *    the bezel gaps between tiles instead of looking like a strobe grid.
     *  - 3 outer arms + 5 inner arms counter-rotating → parallax / depth.
     *  - Hue precomputed once per frame into a 64-slot palette so we do not
     *    allocate a Color3 per panel per frame (210 panels × 60fps).
     *  - Aspect-corrected radius (cols/rows ratio) so circles read as circles
     *    on the wide grid instead of stretched ellipses.
     */
    patternHypnoticSpiral(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows; // ~2.1 — squash Y so polar = circles, not ovals

        // --- Audio reactivity -------------------------------------------------
        const hasAudio = audioData && audioData.hasAudio;
        const bass = hasAudio ? audioData.bass : 0;
        const mid  = hasAudio ? (audioData.mid || 0) : 0;

        // Smoothed bass envelope → drives the "breathing" zoom of the tunnel.
        // Fast attack, slow release feels musical and avoids jitter.
        if (this._spiralBassEnv === undefined) this._spiralBassEnv = 0;
        const target = bass;
        const k = target > this._spiralBassEnv ? 0.45 : 0.06; // attack / release
        this._spiralBassEnv += (target - this._spiralBassEnv) * k;
        const breath = this._spiralBassEnv; // 0..1

        // Without audio, fake a slow musical breath at ~0.5 Hz so the wall
        // still looks alive in silence.
        const fakeBreath = hasAudio ? 0 : (0.35 + 0.35 * Math.sin(time * Math.PI));
        const zoom = 1.0 + breath * 0.9 + fakeBreath * 0.5; // tunnel pumps in on bass

        // --- Per-frame hue palette (64 entries) -------------------------------
        // Cycle the whole rainbow every ~12s; mids nudge it faster for variety.
        const PALETTE_N = 64;
        if (!this._spiralPalette || this._spiralPalette.length !== PALETTE_N) {
            this._spiralPalette = new Array(PALETTE_N);
        }
        const hueBase = (time * 30 + mid * 60) % 360; // deg/sec
        const hueSpread = 280; // how much of the spectrum is visible at once
        for (let i = 0; i < PALETTE_N; i++) {
            const h = (hueBase + (i / PALETTE_N) * hueSpread) % 360;
            this._spiralPalette[i] = BABYLON.Color3.FromHSV(h, 1.0, 1.0);
        }

        // --- Spiral parameters ------------------------------------------------
        const armsOuter   = 3;          // 3-arm outer spiral
        const armsInner   = 5;          // 5-arm inner spiral, counter-rotating
        const pitchOuter  = 0.9;        // tightness — higher = tighter coil
        const pitchInner  = 1.4;
        const spinOuter   =  0.9 + breath * 1.4;  // rad/sec
        const spinInner   = -1.6 - breath * 2.0;  // opposite direction
        const bandSharp   = 1.6;        // >1 sharpens the bright bands

        // Re-use cached black to clear dark panels without alloc
        const BLACK = this.cachedColors.black;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];

            // Polar coords from center, aspect corrected, then zoomed by bass
            const dx = (panel.col - centerX);
            const dy = (panel.row - centerY) * aspect;
            const r  = Math.sqrt(dx * dx + dy * dy) / zoom;
            const theta = Math.atan2(dy, dx);

            // Two counter-rotating logarithmic spirals.
            // Using log(r) gives the "infinite tunnel" feel — bands stay
            // perceptually evenly spaced as you zoom.
            const logR = Math.log(r + 0.6);
            const phaseOuter = armsOuter * theta + spinOuter * time - logR * pitchOuter * 6;
            const phaseInner = armsInner * theta + spinInner * time - logR * pitchInner * 6;

            // Soft band: sin → [0,1], then sharpen for crisp arms with smooth edges
            const bandO = Math.pow(Math.max(0, Math.sin(phaseOuter) * 0.5 + 0.5), bandSharp);
            const bandI = Math.pow(Math.max(0, Math.sin(phaseInner) * 0.5 + 0.5), bandSharp);

            // Combine layers — outer dominates, inner adds shimmer
            let intensity = bandO * 0.85 + bandI * 0.55;

            // Center hotspot: brighter & whiter near the vortex eye, pulsing on bass
            const eye = Math.exp(-r * 0.55) * (0.6 + breath * 0.8);
            intensity = Math.min(1.0, intensity + eye);

            if (intensity < 0.04) {
                panel.material.emissiveColor = BLACK;
                continue;
            }

            // Hue depends on radius (rainbow rings) + a slow rotation so the
            // colors themselves spiral through the tunnel.
            const hueIdx = ((r * 4 + time * 2) | 0) % PALETTE_N;
            const safeIdx = hueIdx < 0 ? hueIdx + PALETTE_N : hueIdx;
            this.updateLEDPanel(panel, this._spiralPalette[safeIdx], intensity);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Shared helper for the "shapes growing outward" hypnotic family.
    // Maintains a small ring-buffer of expanding "shapes" with staggered
    // birth times so a new one is always being born while older ones are
    // still expanding & fading. Result: an endless, perfectly looping pulse
    // that the eye can lock onto for minutes.
    //
    //   key       — unique string per pattern (separate state per pattern)
    //   time      — current time
    //   spawnRate — seconds between births
    //   maxAge    — seconds a shape lives before it's recycled
    //   slots     — how many concurrent shapes
    //   onSpawn   — optional fn(shape) to assign extra props (e.g. position)
    // Returns the array of {birth, age, life, hue} entries (sorted oldest→newest).
    // ──────────────────────────────────────────────────────────────────────
    _ensureExpandingShapes(key, time, spawnRate, maxAge, slots, onSpawn) {
        if (!this._expandingShapes) this._expandingShapes = {};
        let state = this._expandingShapes[key];
        if (!state) {
            state = { shapes: [], lastSpawn: -spawnRate, hueCursor: 0 };
            // Pre-stagger initial births so we don't start with an empty wall
            for (let i = 0; i < slots; i++) {
                const shape = {
                    birth: time - (i * spawnRate),
                    life: maxAge,
                    hue: (i * (360 / slots)) % 360,
                    x: 0, y: 0
                };
                if (onSpawn) onSpawn(shape, i);
                state.shapes.push(shape);
            }
            state.lastSpawn = time - spawnRate * 0.5;
            this._expandingShapes[key] = state;
        }
        // Spawn new shapes when due, recycling the oldest slot
        while (time - state.lastSpawn >= spawnRate) {
            state.lastSpawn += spawnRate;
            // Find oldest shape (smallest birth)
            let oldestIdx = 0;
            for (let i = 1; i < state.shapes.length; i++) {
                if (state.shapes[i].birth < state.shapes[oldestIdx].birth) oldestIdx = i;
            }
            const shape = state.shapes[oldestIdx];
            shape.birth = state.lastSpawn;
            shape.life = maxAge;
            state.hueCursor = (state.hueCursor + 47) % 360; // pleasant non-repeating hue walk
            shape.hue = state.hueCursor;
            if (onSpawn) onSpawn(shape, oldestIdx);
        }
        // Update ages
        for (let i = 0; i < state.shapes.length; i++) {
            state.shapes[i].age = time - state.shapes[i].birth;
        }
        return state.shapes;
    }

    /**
     * patternConcentricRings — endless rings rippling outward from center.
     * Multiple rings live at once at different radii, spawning at a steady
     * cadence so the wall never goes empty. Each ring has its own hue and
     * fades as it grows, classic pond-ripple hypnosis.
     */
    patternConcentricRings(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        // Bass speeds up the ripple expansion slightly
        const expandSpeed = 4.0 + bass * 3.0; // grid units / sec

        const shapes = this._ensureExpandingShapes('rings', time, 0.55, 3.2, 6);

        const BLACK = this.cachedColors.black;
        const ringWidth = 0.9; // band thickness
        const palette = this._getOrBuildHuePalette('rings', 64);

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * aspect;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > ringWidth) continue;
                // Soft band, fade with age (life remaining)
                const band = Math.pow(1.0 - offset / ringWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                // Reuse a per-panel scratch color to avoid allocs
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternNestedSquares — square outlines blooming outward forever.
     * Same lifecycle as rings but uses Chebyshev distance (max of |dx|, |dy|)
     * so the expanding shape is a square frame instead of a circle.
     */
    patternNestedSquares(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        const expandSpeed = 3.5 + bass * 2.5;

        const shapes = this._ensureExpandingShapes('squares', time, 0.7, 3.5, 5);
        const palette = this._getOrBuildHuePalette('squares', 64);
        const BLACK = this.cachedColors.black;
        const lineWidth = 0.85;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = Math.abs(panel.col - centerX);
            const dy = Math.abs(panel.row - centerY) * aspect;
            const dist = Math.max(dx, dy); // Chebyshev → square iso-contours

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > lineWidth) continue;
                const band = Math.pow(1.0 - offset / lineWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternMandalaBloom — radial petals that grow and fade like a flower
     * opening, then another, then another. Combines an angular sin(N·θ)
     * petal mask with the same expanding-radius lifecycle so each "bloom"
     * literally opens outward from the center.
     */
    patternMandalaBloom(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const centerX = (cols - 1) / 2;
        const centerY = (rows - 1) / 2;
        const aspect = cols / rows;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;

        // Slower spawn — we want each flower fully readable
        const shapes = this._ensureExpandingShapes('mandala', time, 1.6, 4.5, 3, (s, i) => {
            // Vary petal count per bloom: 5, 6, 8 — all visually pleasing
            s.petals = [5, 6, 8][i % 3];
            s.spin = (i % 2 === 0 ? 1 : -1) * (0.3 + Math.random() * 0.4);
        });
        const palette = this._getOrBuildHuePalette('mandala', 64);
        const BLACK = this.cachedColors.black;

        const expandSpeed = 1.6 + bass * 1.2;
        const maxR = Math.sqrt(cols * cols + (rows * aspect) * (rows * aspect)) / 2;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];
            const dx = panel.col - centerX;
            const dy = (panel.row - centerY) * aspect;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const theta = Math.atan2(dy, dx);

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const radius = s.age * expandSpeed;
                if (dist > radius + 0.5) continue; // outside this bloom

                // Petal mask: sin(petals·θ + spin·t) gives N alternating lobes
                const petalRaw = Math.sin(s.petals * theta + s.spin * time);
                const petal = Math.pow(Math.max(0, petalRaw), 2);

                // Radial envelope: bright at the bloom's leading edge, fades inside
                const radialEdge = Math.exp(-Math.abs(dist - radius * 0.7) * 0.6);

                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = petal * radialEdge * lifeFade *
                                  Math.min(1, radius / maxR + 0.3);
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    /**
     * patternRippleRain — multiple ripple sources at varied positions across
     * the wall. Each ripple spawns small at a random spot and expands until
     * it dies, while new ones continuously appear elsewhere. Creates a calm
     * but mesmerizing "rain on water" feel that loops indefinitely.
     */
    patternRippleRain(color, time, audioData) {
        const cols = this.ledCols || 21;
        const rows = this.ledRows || 10;
        const aspect = cols / rows;

        const shapes = this._ensureExpandingShapes('rain', time, 0.4, 2.4, 8, (s) => {
            // Random source position anywhere on the wall
            s.x = Math.random() * cols;
            s.y = Math.random() * rows;
        });
        const palette = this._getOrBuildHuePalette('rain', 64);
        const BLACK = this.cachedColors.black;

        const bass = (audioData && audioData.hasAudio) ? audioData.bass : 0;
        const expandSpeed = 5.5 + bass * 3.5;
        const ringWidth = 0.7;

        for (let p = 0; p < this.ledPanels.length; p++) {
            const panel = this.ledPanels[p];

            let r = 0, g = 0, b = 0;
            for (let i = 0; i < shapes.length; i++) {
                const s = shapes[i];
                if (s.age < 0 || s.age > s.life) continue;
                const dx = panel.col - s.x;
                const dy = (panel.row - s.y) * aspect;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const radius = s.age * expandSpeed;
                const offset = Math.abs(dist - radius);
                if (offset > ringWidth) continue;
                const band = Math.pow(1.0 - offset / ringWidth, 2);
                const lifeFade = 1.0 - (s.age / s.life);
                const intensity = band * lifeFade;
                if (intensity < 0.02) continue;
                const c = palette[((s.hue / 360) * palette.length) | 0];
                r += c.r * intensity;
                g += c.g * intensity;
                b += c.b * intensity;
            }

            if (r < 0.02 && g < 0.02 && b < 0.02) {
                panel.material.emissiveColor = BLACK;
            } else {
                if (!panel._scratchColor) panel._scratchColor = new BABYLON.Color3();
                panel._scratchColor.r = Math.min(1, r);
                panel._scratchColor.g = Math.min(1, g);
                panel._scratchColor.b = Math.min(1, b);
                panel.material.emissiveColor = panel._scratchColor;
            }
        }
    }

    // Slow-cycling hue palette shared by the expanding-shape patterns.
    // Rebuilds every ~150ms (cheap) so the colors drift over time.
    _getOrBuildHuePalette(key, n) {
        if (!this._huePalettes) this._huePalettes = {};
        let entry = this._huePalettes[key];
        const now = performance.now();
        if (!entry || now - entry.builtAt > 150) {
            const palette = entry ? entry.palette : new Array(n);
            const hueBase = (now * 0.02) % 360; // slow drift
            for (let i = 0; i < n; i++) {
                palette[i] = BABYLON.Color3.FromHSV((hueBase + (i / n) * 360) % 360, 1.0, 1.0);
            }
            this._huePalettes[key] = { palette, builtAt: now };
            return palette;
        }
        return entry.palette;
    }

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
            const cellColor = new BABYLON.Color3(
                color.r * (0.7 + brightness * 0.3),
                color.g * (0.5 + brightness * 0.5),
                color.b * (0.8 + brightness * 0.2)
            );
            
            this.updateLEDPanel(panel, cellColor, brightness);
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
                        // QC: never re-freeze — the render loop writes this every frame.
                        if (this._sharedMirrorBeamMat) {
                            if (this._sharedMirrorBeamMat.isFrozen) this._sharedMirrorBeamMat.unfreeze();
                            this._sharedMirrorBeamMat.emissiveColor = this.mirrorBallSpotlightColor.scale(0.8);
                        }
                        
                        // UPGRADE: Update shared ray material once (not 40× per ray)
                        if (this._sharedMirrorRayMat) {
                            if (this._sharedMirrorRayMat.isFrozen) this._sharedMirrorRayMat.unfreeze();
                            this._sharedMirrorRayMat.emissiveColor = this.mirrorBallSpotlightColor;
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
                <input type="file" id="vrAudioFileInput" accept="audio/*" style="display: none;">
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
        const overlayFileInput = inputDiv.querySelector('#vrAudioFileInput');

        document.getElementById('audioFileBrowseBtn').onclick = (e) => {
            e.preventDefault();
            overlayFileInput.click();
        };
        
        // File input handler
        overlayFileInput.onchange = (e) => {
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
        
        // Global Escape handler — declared first so cleanup() can detach it.
        // Without this removal, opening the dialog repeatedly accumulates listeners.
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                cleanup();
            }
        };

        // Cleanup function
        const cleanup = () => {
            const div = document.getElementById('vrAudioInput');
            if (div && div.parentNode) {
                div.parentNode.removeChild(div);
            }
            // Re-attach camera control
            if (camera && camera.attachControl) {
                camera.attachControl(this.canvas, true);
            }
            document.removeEventListener('keydown', escHandler);
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

        document.addEventListener('keydown', escHandler);
    }

    startAudioStream(url) {
        // Audio element should already exist from showAudioStreamInputUI()
        if (!this.audioElement) {
            log.error("❌ Audio element not created! This shouldn't happen.");
            return;
        }

        // Set source (validate user-supplied URL to block javascript:/data: schemes)
        if (url === "") {
            this._setAudioSrc("https://stream.example.com/radio"); // Replace with actual demo
            log.info("🎵 Using demo audio stream");
        } else if (this._isSafeAudioUrl(url)) {
            this._setAudioSrc(url);
            log.info(`🎵 Loading audio stream: ${url}`);
        } else {
            log.warn(`🎵 Rejected unsafe audio URL: ${url}`);
            this.showErrorMessage('Invalid audio URL. Use http://, https:// or blob: only.');
            return;
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
                    this._connectAudioSourceOnce();
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
        
        // Create object URL from file (previous blob, if any, is revoked by _setAudioSrc)
        const fileUrl = URL.createObjectURL(file);
        this._setAudioSrc(fileUrl);
        
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
                    this._connectAudioSourceOnce();
                }).catch(err => {
                    log.error("❌ Failed to play audio file:", err);
                    this.showErrorMessage(`Audio loaded. Click play on the audio button to start.`);
                });
            }
        }, 100); // Small delay to ensure load completes
    }

    showErrorMessage(message) {
        // QC fixes vs. the previous implementation:
        //  - `document.body.removeChild(el)` threw NotFoundError if the node had
        //    already been removed (e.g. two messages fired inside 3 s).
        //  - Concurrent messages stacked at the exact same fixed position, so only
        //    the last one was legible.
        //  - The toast was invisible to assistive technology.
        if (!this._toastHost) {
            const host = document.createElement('div');
            host.id = 'vrclubToasts';
            host.setAttribute('role', 'alert');
            host.setAttribute('aria-live', 'assertive');
            host.style.cssText = [
                'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
                'z-index:10000', 'display:flex', 'flex-direction:column', 'gap:8px',
                'align-items:center', 'pointer-events:none', 'max-width:90vw'
            ].join(';');
            document.body.appendChild(host);
            this._toastHost = host;
        }

        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = [
            'background:rgba(200,0,0,0.92)', 'color:#fff', 'padding:16px 28px',
            'border-radius:10px', 'font-size:17px', 'font-weight:700',
            'text-align:center', 'box-shadow:0 8px 24px rgba(0,0,0,0.5)'
        ].join(';');
        errorDiv.textContent = message; // textContent, never innerHTML — message may echo user input
        this._toastHost.appendChild(errorDiv);

        setTimeout(() => errorDiv.remove(), 4000);
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
        
        const url = musicUrlInput.value;
        if (!url) {
            alert('Please enter a music stream URL');
            return;
        }
        if (!this._isSafeAudioUrl(url)) {
            alert('Invalid audio URL. Use http://, https:// or blob: only.');
            return;
        }

        // Reuse the single audio element / source created elsewhere (or lazy-create here).
        // createMediaElementSource may only be called ONCE per element, so route through
        // _connectAudioSourceOnce instead of building a parallel graph.
        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = 'anonymous';
        }
        this._setAudioSrc(url);
        this._connectAudioSourceOnce();
        this.audioElement.play().catch(err => log.warn('🎵 playMusic() play() rejected:', err));
        
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

            // === CLUB MASTERING CHAIN ===
            // Real club PAs run a hard limiter + master gain so the room stays loud
            // without painful peaks. Routing the analyser through a DynamicsCompressor
            // gives that "wall of sound" feel and protects the user's hearing.
            try {
                this.audioCompressor = this.audioContext.createDynamicsCompressor();
                this.audioCompressor.threshold.value = -18;   // dB
                this.audioCompressor.knee.value = 24;
                this.audioCompressor.ratio.value = 6;         // Glue, not crush
                this.audioCompressor.attack.value = 0.003;
                this.audioCompressor.release.value = 0.18;

                this.audioMasterGain = this.audioContext.createGain();
                this.audioMasterGain.gain.value = 1.15;       // Slight push for "loud"

                // Source (added later) -> analyser -> compressor -> masterGain -> destination
                this.audioAnalyser.connect(this.audioCompressor);
                this.audioCompressor.connect(this.audioMasterGain);
                this.audioMasterGain.connect(this.audioContext.destination);
            } catch (err) {
                // Graceful fallback if compressor is unavailable
                log.warn('🎚️ Mastering chain unavailable, using direct routing:', err);
                this.audioAnalyser.connect(this.audioContext.destination);
            }

            log.info('🎚️ Audio context initialized (with mastering chain)');
        }
        // Resume if suspended (browser autoplay policy). Awaited via .catch() so
        // we surface failures instead of silently leaving the context suspended.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => log.warn('🎚️ AudioContext resume failed:', err));
        }
        return this.audioContext;
    }

    /**
     * Validate that a user-supplied audio URL is safe to hand to <audio src>.
     *
     * Rejects:
     *  - non-http(s)/blob schemes (javascript:, data:, file:, ws:, …)
     *  - URLs carrying embedded credentials (https://user:pass@host/…) which leak
     *    into network logs, referrers and error strings
     *  - plain http:// while the page itself is served over https, because the
     *    browser silently blocks the request as mixed content and the user is
     *    left with a stream that "just doesn't play"
     */
    _isSafeAudioUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return false;
        try {
            const parsed = new URL(url, window.location.href);
            if (parsed.username || parsed.password) return false;
            if (parsed.protocol === 'blob:') return true;
            if (parsed.protocol === 'https:') return true;
            if (parsed.protocol === 'http:') {
                // Allow http only when the page is not secure, or for loopback,
                // which browsers treat as a trustworthy origin.
                const host = parsed.hostname;
                const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
                return window.location.protocol !== 'https:' || isLoopback;
            }
            return false;
        } catch (_) {
            return false;
        }
    }

    /**
     * Connect the (single) audio element to the analyser ONCE.
     * createMediaElementSource throws InvalidStateError if called twice for the
     * same element, so this guard is the source of truth for all audio entry points.
     */
    _connectAudioSourceOnce() {
        if (this.audioSource || !this.audioElement || !window.AudioContext) return;
        this._ensureAudioContext();
        try {
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioSource.connect(this.audioAnalyser);
            log.info('🎚️ Audio analyser connected');
        } catch (err) {
            log.warn('🎚️ Could not connect audio source:', err);
        }
    }

    /**
     * Swap the audio element src safely, revoking any previous blob URL to
     * avoid unbounded memory growth across file selections.
     */
    _setAudioSrc(newSrc) {
        if (!this.audioElement) return;
        const prev = this.audioElement.src;
        if (prev && prev.startsWith('blob:')) {
            try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
        }
        this.audioElement.src = newSrc;
    }
    
    getAudioData() {
        if (!this.audioAnalyser || !this.audioDataArray ||
            !this.audioContext || this.audioContext.state !== 'running') {
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

        // === CORS-TAINTED STREAM DETECTION ===
        // A cross-origin stream WITHOUT `Access-Control-Allow-Origin` still plays
        // through <audio>, but the Web Audio graph receives a tainted (silent)
        // source, so every FFT bin reads 0 forever. Previously this looked exactly
        // like "the club just isn't reacting to the music" with nothing in the
        // console. Detect it and tell the user once.
        if (!this._corsWarningShown && this.audioElement &&
            !this.audioElement.paused && this.audioElement.currentTime > 2) {
            if (average === 0) {
                this._silentAnalyserFrames = (this._silentAnalyserFrames || 0) + 1;
                if (this._silentAnalyserFrames > 180) { // ~3 s of audible-but-silent analysis
                    this._corsWarningShown = true;
                    log.warn('🎚️ Analyser is receiving silence while audio is playing — the stream is likely blocked by CORS.');
                    this.showErrorMessage(
                        'Audio is playing but the visuals cannot react to it. ' +
                        'The stream server does not send an Access-Control-Allow-Origin header.'
                    );
                }
            } else {
                this._silentAnalyserFrames = 0;
            }
        }
        
        return { bass, mid, treble, average, hasAudio };
    }

    /**
     * Pulse VR controllers in time with bass hits.
     * Massive immersion gain — gives the user a physical "thump" on each kick drum,
     * substituting for the chest-rattling sub-bass of a real club PA.
     *
     * Throttled so we don't spam the haptic bus (which causes the actuator to
     * desync from audio). Honors `bassHapticsEnabled` so the user can opt out.
     */
    _updateBassHaptics(audioData) {
        if (!this.bassHapticsEnabled) return;
        if (!this._xrControllers || this._xrControllers.length === 0) return;
        if (!audioData || !audioData.hasAudio) return;

        const bass = audioData.bass || 0;
        if (bass < 0.55) return; // Only fire on real kicks, not ambient rumble

        const now = performance.now();
        // 4 Hz cap — matches typical kick-drum cadence (~140 BPM eighths)
        if (now - this._lastHapticPulseAt < 140) return;
        this._lastHapticPulseAt = now;

        const intensity = Math.min(1.0, (bass - 0.55) * 2.2); // 0..1
        const duration = 60 + Math.floor(intensity * 80);     // 60..140 ms

        for (let i = 0; i < this._xrControllers.length; i++) {
            const ctrl = this._xrControllers[i];
            try {
                const inputSource = ctrl && ctrl.inputSource;
                const gp = inputSource && inputSource.gamepad;
                if (!gp) continue;
                // Standards-compliant path (Quest browser supports this on WebXR gamepads)
                if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
                    gp.hapticActuators[0].pulse(intensity, duration);
                } else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
                    gp.vibrationActuator.playEffect('dual-rumble', {
                        duration: duration,
                        strongMagnitude: intensity,
                        weakMagnitude: intensity * 0.6
                    });
                }
            } catch (_) { /* Per-controller failures must never break the audio loop */ }
        }
    }

    /**
     * Toggle photosensitive Safe Mode. Disables strobes and bloom flashes
     * for users with photosensitive epilepsy or migraine sensitivity.
     * Persists across sessions.
     */
    setPhotosensitiveSafeMode(enabled) {
        this.photosensitiveSafeMode = !!enabled;
        try { localStorage.setItem('vrclub.safeMode', this.photosensitiveSafeMode ? '1' : '0'); } catch (_) {}
        // Immediately quiet any in-flight strobe state
        if (this.photosensitiveSafeMode && this.strobes) {
            this.strobes.forEach((strobe) => {
                strobe.material.emissiveColor = this.cachedColors.black;
                if (strobe.light) {
                    strobe.light.intensity = 0;
                    strobe.light.setEnabled(false);
                }
                strobe.flashDuration = 0;
            });
            if (this.strobeFlashLight) {
                this.strobeFlashLight.intensity = 0;
                this.strobeFlashLight.setEnabled(false);
            }
        }
        log.info(`♿ Photosensitive Safe Mode: ${this.photosensitiveSafeMode ? 'ON (strobes disabled)' : 'OFF'}`);
        return this.photosensitiveSafeMode;
    }

    /**
     * Toggle bass-driven controller haptics. Persists across sessions.
     */
    setBassHapticsEnabled(enabled) {
        this.bassHapticsEnabled = !!enabled;
        try { localStorage.setItem('vrclub.bassHaptics', this.bassHapticsEnabled ? '1' : '0'); } catch (_) {}
        log.info(`📳 Bass haptics: ${this.bassHapticsEnabled ? 'ON' : 'OFF'}`);
        return this.bassHapticsEnabled;
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
                    
                    // Ensure mesh writes to depth buffer when it has a material.
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
        // index.html has never contained an #fpsCounter element, so this lookup
        // always returned null and the whole FPS/debug overlay (including the
        // toggle wired in setupUI) was silently dead. Create the overlay here
        // instead of depending on markup that does not exist.
        this.fpsElement = document.getElementById('fpsCounter');
        if (!this.fpsElement) {
            const el = document.createElement('div');
            el.id = 'fpsCounter';
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = [
                'position:fixed', 'top:10px', 'left:10px', 'z-index:9998',
                'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                'color:#0f0', 'background:rgba(0,0,0,0.55)', 'padding:6px 10px',
                'border-radius:6px', 'white-space:pre', 'pointer-events:none',
                'display:none'
            ].join(';');
            document.body.appendChild(el);
            this.fpsElement = el;
        }
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
                this.fpsElement.style.display = this.debugMode ? 'block' : 'none';
                if (!this.debugMode) return;
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
