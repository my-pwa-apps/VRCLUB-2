class VRClubLifecycle extends VRClubCore {
    async init() {
        this._reportInitProgress(0.04, 'Preparing renderer...');
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
        this._npcBeatBoost = 1.0; // last applied crowd tempo multiplier
        // AssetContainers holding the source avatar GLBs. These are deliberately NOT
        // added to the scene - every dancer is instantiated from them - so
        // scene.dispose() will not reclaim them and dispose() has to do it by hand.
        this._avatarContainers = [];
        
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
        this._reportInitProgress(0.14, 'Loading surface textures...');
        
        try {
            this.concreteTextures = await this.textureLoader.loadAllTextures();
            log.info('✅ All textures loaded and cached');
        } catch (error) {
            log.warn('⚠️ Failed to load some textures, using fallback materials:', error);
            this.concreteTextures = null; // Will use procedural materials as fallback
        }
        this._reportInitProgress(0.30, 'Preparing 3D models...');
        
        // Initialize model loader for DJ equipment and PA speakers
        log.info('🎸 Initializing 3D model loader...');
        this.modelLoader = new ModelLoader(this.scene, this.materialFactory, log);
        await this.modelLoader.init();
        this._reportInitProgress(0.38, 'Building the club...');
        
        // Load all models in the background (they'll load asynchronously)
        log.info('📦 Loading DJ equipment and PA speaker models...');
        this.modelLoadPromise = this.modelLoader.loadAllModels().then(() => {
            this._refreshShadowCasters();
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
        this._reportInitProgress(0.52, 'Configuring WebXR...');
        
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
        this.createHyperrealisticSmoke(); // Add volumetric smoke/fog
        this.createMirrorBall(); // Add disco/mirror ball with spotlight
        // Entrance, bar, and dance floor lighting removed for cleaner look
        this.createSafetyDetails(); // Exit signs only
        this._reportInitProgress(0.72, 'Loading performers...');
        
        // Setup UI
        this.setupUI(vrHelper);
        this.setupPerformanceMonitor();
        this.setupVJControlInteraction(); // Add VJ control button clicks
        
        // Create dancing NPC avatars on the dancefloor
        await this.createDancingNPCs();
        this._reportInitProgress(0.92, 'Finalizing lighting...');

        // === VJ DIRECTOR ===
        // Beat-locked palette engine + macros. Conducts the existing rig like
        // a touring VJ would. Reads audioData, writes to existing color/state
        // vars (spotColorIndex, currentSpotColor, vjDropActive, etc.) so the
        // existing render code keeps working unchanged.
        if (typeof VJDirector !== 'undefined') {
            this.vjDirector = new VJDirector(this);
        }

        // "NOCTURNE" — the composed light show. A beat-locked cue engine that
        // becomes the single source of truth for fixture state, replacing the
        // legacy wall-clock 12-phase cycler and the director's energy-threshold
        // scene picker (both of which stand down while showDirector.isDriving()).
        // Depends on the beat grid VJDirector publishes, so it is created after it.
        if (typeof ShowDirector !== 'undefined' && this.vjDirector) {
            this.showDirector = new ShowDirector(this);
        }
        
        // UPGRADE: Create frozen reflection probe for the dance floor
        // Must be called AFTER all geometry is created so the probe captures everything
        this.createFloorReflectionProbe();

        // Quality passes that must run AFTER all geometry, textures, lights and the
        // reflection probe exist, because they sweep the finished scene.
        this._clampMaterialLightBudgets();
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

        // Prevent the browser's default "navigate to the dropped file" behaviour
        // everywhere except our own audio drop target.
        //
        // These handlers MUST be stored and removed in dispose(). They are registered
        // on `window`, so the closure's `this` reference pins the entire VRClub
        // instance - and therefore the whole Babylon scene graph and its GPU
        // resources - in memory for the lifetime of the document, even after
        // dispose() has run.
        this._onWindowDragOver = (e) => {
            if (e.target && e.target.id === 'audioUrlInput') return;
            e.preventDefault();
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'none';
                e.dataTransfer.dropEffect = 'none';
            }
        };
        this._onWindowDrop = (e) => {
            if (e.target && e.target.id === 'audioUrlInput') return;
            e.preventDefault();
            e.stopPropagation();
        };
        window.addEventListener('dragover', this._onWindowDragOver, false);
        window.addEventListener('drop', this._onWindowDrop, false);

        this.ready = true;
        this._reportInitProgress(1, 'Ready');
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
        if (this._onWindowDragOver) {
            window.removeEventListener('dragover', this._onWindowDragOver, false);
            this._onWindowDragOver = null;
        }
        if (this._onWindowDrop) {
            window.removeEventListener('drop', this._onWindowDrop, false);
            this._onWindowDrop = null;
        }
        if (this._onKeyDown) {
            document.removeEventListener('keydown', this._onKeyDown);
            this._onKeyDown = null;
        }
        if (this._onCameraPresetToggle) {
            const toggle = document.getElementById('cameraPresetToggle');
            if (toggle) toggle.removeEventListener('click', this._onCameraPresetToggle);
            this._onCameraPresetToggle = null;
        }
        if (this._cameraPresetHandlers) {
            this._cameraPresetHandlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
            this._cameraPresetHandlers = null;
        }

        // Scene pointer callbacks are plain properties holding closures over `this`.
        // Null them before scene.dispose() so nothing can re-enter a torn-down instance
        // if a pointer event is already queued.
        if (this.scene) {
            this.scene.onPointerDown = null;
            this.scene.onPointerUp = null;
            this.scene.onPointerMove = null;
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
        if (this.showDirector) this.showDirector = null;

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

        // Avatar source containers were never added to the scene (every dancer is a
        // clone of them), so scene.dispose() below will not touch their geometry,
        // skeletons or textures. Roughly 120 MB of GPU/CPU buffers if skipped.
        if (this._avatarContainers) {
            this._avatarContainers.forEach(container => {
                try { container.dispose(); } catch (_) { /* ignore */ }
            });
            this._avatarContainers = [];
        }
        this.npcAvatars = [];

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

}
window.VRClubLifecycle = VRClubLifecycle;
