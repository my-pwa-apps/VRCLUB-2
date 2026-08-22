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
window.ROOM_BOUNDS = ROOM_BOUNDS;

// Key positions in the club
const CLUB_POSITIONS = {
    // Centre of the DJ deck row; y is the work surface. See the BOOTH LAYOUT
    // ANCHORS block in createDJBooth() for the full z/y breakdown.
    djBooth: { x: 0, y: 1.42, z: -18.5 },
    danceFloor: { x: 0, y: 0, z: -12 },
    entrance: { x: 0, y: 0, z: 0 },
    mirrorBall: { x: 0, y: 6.5, z: -12 },
    paSpeakers: {
        // Flown from the rear lighting truss (z=-16), not floor-stacked.
        // y is the top of the cabinet; see ModelLoader.getModelConfigs().
        left: { x: -6, y: 7.1, z: -16 },
        right: { x: 6, y: 7.1, z: -16 }
    }
};
window.CLUB_POSITIONS = CLUB_POSITIONS;

class VRClubCore {
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
                floorShadows: true,
                crowdSize: 14,             // animated skinned dancers on the floor
                mirrorSpots: 100
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
                floorShadows: false,
                crowdSize: 10,
                mirrorSpots: 60
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
                floorShadows: false,
                // Skinned characters are the most expensive per-object thing in the
                // scene (one skeleton + one animation group evaluation each), so the
                // headcount is the first thing to give on weak GPUs. Quest is always
                // `balanced`, so this is the number a headset actually renders.
                crowdSize: 6,
                mirrorSpots: 30
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
                exposure: 1.0,
                contrast: 1.65,
                bloomWeight: 0.12, // Keep LED tile gaps crisp instead of bridging them with bloom
                bloomThreshold: 1.1, // Reserve bloom for fixture cores, not the LED panel faces
                                      // — LED panels (emissive ~1.0) stop blooming so tile gaps stay visible
                bloomScale: 0.3,
                glowIntensity: 0.7, // Preserve beam presence without washing out the LED wall
                ambientIntensity: 0.06, // Match desktop — keeps shadowed metal readable
                environmentIntensity: 0.5, // MATCH desktop — metallic trusses/pipes/fixtures rely on env reflections
                clearColor: new BABYLON.Color3(0.003, 0.003, 0.008), // Match desktop tint (was pure black)
                grainEnabled: false,
                chromaticAberrationEnabled: false,
                toneMappingEnabled: true, // ENABLE — same color/luminance response as desktop
                edgeSharpness: 0.3,
                colorSharpness: 0.2,
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
        this._desktopRenderPipeline = null;
        
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

        // === EMBODIMENT ===
        // Desktop walking head-bob. A camera that glides at a fixed height reads as a
        // drone, not a person. Never applied in VR: the headset already carries real
        // head motion and synthetic bob on top of it causes sim sickness.
        this.headBobEnabled = (() => {
            try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
            catch (_) { return true; }
        })();
        this._headBobPhase = 0;
        this._headBobAmount = 0;
        this._headBobOffset = 0;
        this._headBobRoll = 0;
        this._lastCameraX = null;
        this._lastCameraZ = null;

        // === EYE ADAPTATION ===
        // Iris response: closes fast against a blinder, opens slowly in the dark.
        // The asymmetric time constants are what make it read as an eye.
        this._adaptedExposure = null;
        
        // === STRUCTURED DIAGNOSTICS BUFFER ===
        // Circular buffer storing timestamped runtime events (audio state, WebXR
        // sessions, WebGL metrics, errors). In-VR users cannot open devtools, so this
        // makes diagnostics accessible directly in-app or via getDiagnostics().
        this.diagnosticsBuffer = [];
        this.maxDiagnosticsEntries = 100;
        this.recordDiagnostic('init', 'VRClubCore constructed', { tier: this.graphicsTier });
        
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
            // LED wall monochrome palette. `white` above is an over-driven HDR
            // value for blinders and would clip the whole wall flat, so the
            // black-and-white looks use these near-neutral tones instead. Three
            // slightly different whites keep the 8-beat colour rotation alive
            // without reintroducing hue.
            ledMonoWhite: new BABYLON.Color3(1, 1, 1),
            ledMonoCool: new BABYLON.Color3(0.86, 0.92, 1.0),
            ledMonoWarm: new BABYLON.Color3(1.0, 0.95, 0.86),
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

        // The live spotlight colour and its fade source.
        //
        // These are deliberately instance-OWNED Color3s, never references into
        // `spotColorList`. Two reasons:
        //  1. The colour fade runs every frame while a transition is in flight; it
        //     used to allocate a fresh Color3 per frame plus a .clone() per switch.
        //     Owning the objects lets it write in place with copyFromFloats().
        //  2. `currentSpotColor` is handed straight to `light.specular` and read by
        //     the fixture/beam/pool passes. When it aliased `spotColorList[0]`, any
        //     in-place write would have silently rewritten the shared palette entry
        //     for every consumer - the same class of bug that previously corrupted
        //     `cachedColors` via emissiveColor aliasing.
        this.currentSpotColor = new BABYLON.Color3(1, 0, 0);
        this.previousSpotColor = new BABYLON.Color3(1, 0, 0);
        // Scratch colours for the per-frame spotlight pass (diffuse/pool/glow).
        this._spotDiffuseScratch = new BABYLON.Color3(0, 0, 0);
        this._poolColorScratch = new BABYLON.Color3(0, 0, 0);
        this._poolSpecScratch = new BABYLON.Color3(0, 0, 0);
        
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
            xAxis: new BABYLON.Vector3(1, 0, 0),
            // Dedicated scratch for the mirror-ball outgoing-ray loop. That loop ran
            // 40 rays x ~6 allocations per ray per frame (~14k Vector3/Quaternion per
            // second) before these existed. Kept separate from temp1/temp2 so the two
            // loops can never stomp on each other within a frame.
            mirrorDir: new BABYLON.Vector3(0, 0, 0),
            mirrorTmp: new BABYLON.Vector3(0, 0, 0),
            mirrorAxis: new BABYLON.Vector3(0, 0, 0),
            mirrorLook: new BABYLON.Vector3(0, 0, 0),
            // Laser beam loop scratch. 3 lasers x up to 5 beams x 60 fps was
            // ~2,700 Vector3/sec between the direction vector and the two
            // temporaries used to place each beam's midpoint.
            laserDir: new BABYLON.Vector3(0, 0, 0),
            laserTmp: new BABYLON.Vector3(0, 0, 0)
        };
        // QC O5: per-beam quaternions live on the beam objects themselves
        // (lazy-initialised on first use). These shared scratch quats are for
        // the special-case "straight up / straight down" branches that don't
        // depend on per-beam state.
        this._quatIdentity = BABYLON.Quaternion.Identity();
        this._quatFlipX = BABYLON.Quaternion.RotationAxis(this.vecPool.xAxis, Math.PI);
        this._spotStaticPositions = [
            { x: -0.3, z: -0.3 },
            { x: 0.3, z: -0.3 },
            { x: -0.3, z: 0.3 },
            { x: 0.3, z: 0.3 }
        ];
        this._audioFrameData = { bass: 0, mid: 0, treble: 0, average: 0, hasAudio: false };
        
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
            djBooth: new BABYLON.Vector3(CLUB_POSITIONS.djBooth.x, CLUB_POSITIONS.djBooth.y, CLUB_POSITIONS.djBooth.z),
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
        // copyFrom, NOT assignment - see the note where currentSpotColor is allocated.
        this.currentSpotColor.copyFrom(this.spotColorList[0]); // Start with RED
        this.previousSpotColor.copyFrom(this.spotColorList[0]);
        this.targetSpotColor = this.spotColorList[0];
        this.spotColorIndex = 0;
        this.lastColorChange = 0;
        
        // Initialize VJ control buttons array (populated in createDJBooth)
        this.vjControlButtons = [];
        
        // Initialize lighting control state
        this.lightsActive = true;
        this.lasersActive = false;
        this.ledWallActive = true;
        this.ledMonochrome = false; // true = wall renders in black & white only
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
        this._adaptedExposure = null; // pipeline is rebuilt below; re-seed the iris
        
        // UPGRADE: Disable floor reflection probe in VR (one less render target)
        if (this.floorReflectionProbe) {
            this.floorReflectionProbe.cubeTexture.refreshRate = 0; // Stop rendering
            log.info('⚡ Disabled floor reflection probe updates for VR');
        }
        
        // VR POST-PROCESSING: Keep minimal effects for immersion while staying performant
        // Completely disabling post-processing makes lights look flat and unrealistic in VR
        if (this.renderPipeline) {
            // Babylon post-process instances are camera-owned and are not reusable.
            // Keep the desktop pipeline intact and create a small XR-owned chain;
            // moving one chain between cameras logs reuse errors and drops effects.
            if (this._desktopRenderPipeline && this.renderPipeline !== this._desktopRenderPipeline) {
                this.renderPipeline.dispose();
            } else {
                this._desktopRenderPipeline = this.renderPipeline;
            }
            this.renderPipeline = new BABYLON.DefaultRenderingPipeline(
                'vrPipeline',
                true,
                this.scene,
                [xrCamera]
            );
            
            // Selective post-processing for VR - keep bloom for light glow, disable expensive effects
            this.renderPipeline.fxaaEnabled = false; // Use XR layer's native AA instead
            this.renderPipeline.bloomEnabled = true; // KEEP bloom - essential for light glow in dark club
            this.renderPipeline.bloomWeight = vr.bloomWeight; // Subtle bloom
            this.renderPipeline.bloomThreshold = vr.bloomThreshold;
            this.renderPipeline.bloomKernel = 32; // Smaller kernel for VR performance
            this.renderPipeline.bloomScale = vr.bloomScale;
            this.renderPipeline.samples = 1; // XR layer provides its own antialiasing
            this.renderPipeline.sharpenEnabled = true;
            this.renderPipeline.sharpen.edgeAmount = vr.edgeSharpness;
            this.renderPipeline.sharpen.colorAmount = vr.colorSharpness;
            this.renderPipeline.imageProcessingEnabled = true; // Keep for contrast/exposure
            if (this.renderPipeline.imageProcessing) {
                this.renderPipeline.imageProcessing.exposure = vr.exposure;
                this.renderPipeline.imageProcessing.contrast = vr.contrast;
                this.renderPipeline.imageProcessing.toneMappingEnabled = vr.toneMappingEnabled; // Honor config (now true) so VR matches desktop tonemapping
                this.renderPipeline.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
                this.renderPipeline.imageProcessing.vignetteEnabled = false; // No vignette in VR (causes discomfort)
                if ('ditheringEnabled' in this.renderPipeline.imageProcessing) {
                    this.renderPipeline.imageProcessing.ditheringEnabled = true;
                    this.renderPipeline.imageProcessing.ditheringIntensity = 1.0 / 255.0;
                }
            }
            this.renderPipeline.grainEnabled = false;
            this.renderPipeline.chromaticAberrationEnabled = false;
            
            log.info('⚡ VR post-processing: bloom + contrast enabled, expensive effects disabled');
        }

        // OPTIMIZED: Disable SSAO in VR (too expensive)
        if (this.ssaoPipeline) {
            // SSAO remains owned by the inactive desktop camera. Ensure it is not
            // accidentally attached to the XR camera.
            this.scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", xrCamera);
        }

        // Screen-space reflections are far too expensive for a standalone headset:
        // the pre-pass renderer plus ray marching runs per eye, so the cost roughly
        // doubles exactly where the frame budget is tightest.
        if (this.ssrPipeline) {
            this.ssrPipeline.isEnabled = false;
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
        
        // Static materials are frozen at their creation sites, where ownership is
        // known. Do not freeze by name here: fog LEDs, mirror fixtures, gobos and VJ
        // controls all mutate at runtime and several of their names look static.
        
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
        
        // #7 OPTIMIZED: Reduce shadow quality for better VR performance
        this.scene.lights.forEach(light => {
            if (light.getShadowGenerator) {
                const shadowGen = light.getShadowGenerator();
                if (shadowGen) {
                    light.shadowEnabled = false;
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
        if (this.dustMotes) {
            this.dustMotes.emitRate = 30; // Motes still glint in the beams, at a third the cost
        }
        
        // Keep the configured VR haze. Halving this a second time made volumetric
        // beams and distant fixtures disappear compared with desktop.
        this.scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        this.scene.fogDensity = vr.fogDensity;
        log.info('⚡ Applied VR scene fog density');
        
        // #10 OPTIMIZED: Enable Fixed Foveated Rendering (FFR) on Quest 3S
        // Quest 3S supports hardware-level foveated rendering which renders peripheral vision
        // at lower resolution, significantly improving GPU performance
        try {
            this.engine.setHardwareScalingLevel(1.0);
            log.info('⚡ Kept native XR render scale for fixture and LED-wall clarity');

            const session = this.vrHelper?.baseExperience?.sessionManager?.session;
            if (session && 'updateRenderState' in session) {
                // Check if XR layer supports foveated rendering
                const xrLayer = session.renderState.baseLayer;
                if (xrLayer && 'fixedFoveation' in xrLayer) {
                    xrLayer.fixedFoveation = 0.4;
                    log.info('⚡ Fixed Foveated Rendering enabled at moderate strength (0.4)');
                }
            }
        } catch (err) {
            log.warn('Could not enable Fixed Foveated Rendering:', err);
        }
    }
    
    applyDesktopSettings() {
        const desktop = this.vrSettings.desktop;

        if (this._desktopRenderPipeline) {
            const vrPipeline = this.renderPipeline;
            this.renderPipeline = this._desktopRenderPipeline;
            this._desktopRenderPipeline = null;
            if (vrPipeline && vrPipeline !== this.renderPipeline) {
                vrPipeline.dispose();
            }
        }
        
        // UPGRADE: Restore scene performance priority for desktop
        if (BABYLON.ScenePerformancePriority) {
            this.scene.performancePriority = BABYLON.ScenePerformancePriority.BackwardCompatible;
        }
        this.isInVRMode = false;
        this._adaptedExposure = null; // re-seed the iris against the desktop base exposure
        
        // Restore post-processing
        if (this.renderPipeline) {
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

            this._applyTierToPipeline();
            
            log.info('✨ Re-enabled post-processing pipeline for desktop');
        }

        // Enable SSAO in Desktop mode
        // It remains attached to the desktop camera while XR is active, so there is
        // nothing to reattach here (reattaching non-reusable passes logs errors).

        // Restore the heavy desktop-only realism effects.
        if (this.ssrPipeline) {
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
        if (this.dustMotes) {
            this.dustMotes.emitRate = this.dustMotes.getCapacity() / 10;
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
        this._rebuildFloorReflectionProbe();
        this._applyCrowdSize();

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

    _reportInitProgress(progress, stage) {
        const value = Math.max(this._initProgress || 0, Math.min(1, progress));
        this._initProgress = value;
        const percent = Math.round(value * 100);
        const bar = document.getElementById('splashProgressBar');
        const root = bar && bar.parentElement;
        const label = document.getElementById('splashLoadingStage');
        if (bar) bar.style.width = `${percent}%`;
        if (root) root.setAttribute('aria-valuenow', String(percent));
        if (label) label.textContent = stage;
    }

    /**
     * Record a structured diagnostic event in the circular telemetry buffer.
     * @param {string} category Category identifier (e.g. 'audio', 'xr', 'render', 'error')
     * @param {string} message Human-readable message
     * @param {any} [data] Optional auxiliary data payload
     */
    recordDiagnostic(category, message, data = null) {
        if (!this.diagnosticsBuffer) this.diagnosticsBuffer = [];
        const entry = {
            timestamp: Date.now(),
            time: Number((performance.now() / 1000).toFixed(2)),
            category,
            message,
            data
        };
        this.diagnosticsBuffer.push(entry);
        if (this.diagnosticsBuffer.length > (this.maxDiagnosticsEntries || 100)) {
            this.diagnosticsBuffer.shift();
        }
    }

    /**
     * Export complete runtime diagnostics snapshot.
     */
    getDiagnostics() {
        return {
            timestamp: new Date().toISOString(),
            tier: this.graphicsTier,
            isInVR: this.isInVRMode,
            fps: this.fps || 0,
            drawCalls: this.drawCallsPerFrame || 0,
            meshes: this.scene ? this.scene.meshes.length : 0,
            activeMeshes: this.scene ? this.scene.getActiveMeshes().length : 0,
            materials: this.scene ? this.scene.materials.length : 0,
            audioState: this.audioContext ? this.audioContext.state : 'none',
            safeMode: this.photosensitiveSafeMode,
            bassHaptics: this.bassHapticsEnabled,
            recentLogs: this.diagnosticsBuffer ? this.diagnosticsBuffer.slice(-25) : []
        };
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

}
window.VRClubCore = VRClubCore;
