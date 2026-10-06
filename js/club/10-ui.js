'use strict';
class VRClubUI extends VRClubAnimationFinish {
    setupUI(vrHelper) {
        this._setupVRButton(vrHelper);

        const cameraControls = document.getElementById('cameraControls');
        const cameraPresetToggle = document.getElementById('cameraPresetToggle');
        const cameraPresetGrid = document.getElementById('cameraPresetGrid');
        const setCameraPresetsOpen = (open) => {
            if (!cameraPresetToggle || !cameraPresetGrid) return;
            cameraPresetGrid.hidden = !open;
            cameraPresetToggle.setAttribute('aria-expanded', String(open));
            cameraPresetToggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} camera viewpoints`);
            if (cameraControls) cameraControls.classList.toggle('expanded', open);
        };

        if (cameraPresetToggle) {
            this._onCameraPresetToggle = () => {
                setCameraPresetsOpen(cameraPresetToggle.getAttribute('aria-expanded') !== 'true');
            };
            cameraPresetToggle.addEventListener('click', this._onCameraPresetToggle);
        }

        this._cameraPresetHandlers = [];
        document.querySelectorAll('[data-camera-preset]').forEach(btn => {
            const handler = () => {
                const preset = btn.dataset.cameraPreset;
                this.moveCameraToPreset(preset);
                // Move focus back to the trigger BEFORE hiding the grid: hiding the
                // element that currently holds focus drops the keyboard user to <body>.
                if (cameraPresetToggle) cameraPresetToggle.focus();
                setCameraPresetsOpen(false);
            };
            btn.addEventListener('click', handler);
            this._cameraPresetHandlers.push({ btn, handler });
        });
        
        // Debug toggle.
        //
        // Two bugs fixed here:
        //  1. The handler fired on ANY 'd' keypress, including while the user was
        //     typing into the stream-URL field - so pasting a URL containing "d"
        //     silently toggled debug mode. Editable targets are now ignored.
        //  2. It was registered on `document` and never removed, pinning this
        //     instance in memory after dispose(). It is now tracked.
        this._onKeyDown = (e) => {
            const t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
            if (e.altKey) return;
            // Debug is a developer affordance; a bare `D` collided with the WASD-adjacent
            // keys a user presses constantly while walking around.
            if ((e.key === 'd' || e.key === 'D') && e.ctrlKey && e.shiftKey) {
                e.preventDefault();
                this.debugMode = !this.debugMode;
                this.showErrorMessage(`Debug overlay ${this.debugMode ? 'on' : 'off'}`);
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
    }

    /**
     * Wire the top-level Enter/Exit VR button.
     *
     * Feature-detects `immersive-vr` up front rather than offering the app's headline
     * action at full prominence on machines that cannot honour it and reporting the
     * failure only after the click.
     */
    _setupVRButton(vrHelper) {
        const vrButton = document.getElementById('vrButton');
        if (!vrButton) return;

        const setLabel = (text, inSession) => {
            vrButton.textContent = text;
            vrButton.classList.toggle('in-session', !!inSession);
        };

        const supported = navigator.xr && typeof navigator.xr.isSessionSupported === 'function'
            ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false)
            : Promise.resolve(false);

        // The DJ console and PA speaker GLBs are parsed, instanced and compiled on the
        // main thread for several seconds after the club appears (measured 250-600 ms
        // stalls). On a desktop that is a rough start; in a headset every stall is a
        // run of dropped frames. VR entry therefore waits for the background load and
        // for every material to compile, with a ceiling so a slow network can never
        // lock VR out.
        const settled = Promise.resolve(this.modelLoadPromise)
            .catch(() => {})
            .then(() => (this.scene && this.scene.whenReadyAsync ? this.scene.whenReadyAsync() : null))
            .catch(() => {});
        const ceiling = new Promise(resolve => {
            this._vrEntryTimer = setTimeout(resolve, VRClubUI.VR_ENTRY_MAX_WAIT_MS);
        });
        const entryReady = Promise.race([settled, ceiling]).then(() => {
            clearTimeout(this._vrEntryTimer);
            this._vrEntryTimer = null;
        });
        if (navigator.xr) {
            vrButton.disabled = true;
            setLabel('\u{1F97D} Preparing VR\u2026', false);
        }

        Promise.all([supported, entryReady]).then(([ok]) => {
            if (this._disposed) return;
            if (!ok || !vrHelper || !vrHelper.baseExperience) {
                vrButton.disabled = true;
                vrButton.title = 'No VR headset detected. Connect via Link/Air Link, or open this page in the Quest browser.';
                setLabel('\u{1F97D} VR unavailable', false);
                return;
            }
            vrButton.disabled = false;
            if (!this.isInVRMode) setLabel('\u{1F97D} Enter VR', false);
        });

        this._onVRButtonClick = async () => {
            const base = vrHelper && vrHelper.baseExperience;
            if (!base) {
                this.showErrorMessage('VR unavailable. Connect your headset via Link/Air Link, or open this page in the Quest browser.');
                return;
            }
            try {
                if (this.isInVRMode) {
                    await base.exitXRAsync();
                } else {
                    await base.enterXRAsync('immersive-vr', 'local-floor');
                }
            } catch (error) {
                log.error('VR Error:', error);
                // A blocking alert() steals focus, cannot be styled, and on Quest
                // renders as a flat 2D browser panel over the scene. Use the app's
                // own toast so failures look like part of the product.
                this.showErrorMessage('VR unavailable. Connect your headset via Link/Air Link, or open this page in the Quest browser.');
            }
        };
        vrButton.addEventListener('click', this._onVRButtonClick);
        this._vrButtonEl = vrButton;

        if (this.scene && this.scene.onXRSessionInit) {
            this._vrButtonObservers = [
                this.scene.onXRSessionInit.add(() => setLabel('\u{1F97D} Exit VR', true)),
                this.scene.onXRSessionEnded.add(() => setLabel('\u{1F97D} Enter VR', false))
            ];
        }
        if (vrHelper && vrHelper.baseExperience) {
            this._vrButtonStateObserver = vrHelper.baseExperience.onStateChangedObservable.add(state => {
                const inSession = state === BABYLON.WebXRState.IN_XR;
                if (inSession || state === BABYLON.WebXRState.NOT_IN_XR) {
                    setLabel(inSession ? '\u{1F97D} Exit VR' : '\u{1F97D} Enter VR', inSession);
                }
            });
        }
    }

    // =========================================================================
    // SHARED VJ ACTIONS
    //
    // These used to exist twice - once in js/ui-init.js for the DOM panel and once
    // in the 3D pointer handler below - and the two copies had silently diverged
    // (only the 3D path updated the mirror-ball reflection spots and shared beam
    // materials, and only the 3D path applied fixture exclusivity). Both surfaces
    // now call the same methods, so they cannot drift again.
    // =========================================================================

    /** Advance the spotlight palette and push the new colour to every consumer. */
    cycleSpotColor() {
        this.spotColorIndex = (this.spotColorIndex + 1) % this.spotColorList.length;
        this.currentSpotColor.copyFrom(this.spotColorList[this.spotColorIndex]);
        this.lastColorChange = performance.now() / 1000;

        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                spot.light.specular = this.currentSpotColor;
                spot.light.diffuse = this.currentSpotColor.scale(0.15);
                spot.color = this.currentSpotColor;

                const trussLight = this.trussLights && this.trussLights[i];
                if (trussLight && this.lightsActive) {
                    if (trussLight.lensMat) trussLight.lensMat.emissiveColor = this.currentSpotColor.scale(5.0);
                    if (trussLight.sourceMat) trussLight.sourceMat.emissiveColor = this.currentSpotColor.scale(8.0);
                }
            });
        }
        return this.currentSpotColor;
    }

    /** Advance the mirror-ball palette and push it to every dependent surface. */
    cycleMirrorBallColor() {
        this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
        const colour = this.mirrorBallColors[this.mirrorBallColorIndex];
        this.mirrorBallSpotlightColor = colour;

        if (this.mirrorBallSpotlights) {
            this.mirrorBallSpotlights.forEach(light => { if (light) light.diffuse = colour.clone(); });
        }
        if (this.mirrorBallBeams) {
            this.mirrorBallBeams.forEach(beam => { beam.material.emissiveColor = colour.clone(); });
        }
        if (this.mirrorBallHousings) {
            this.mirrorBallHousings.forEach(housing => {
                housing.material.emissiveColor = colour.scale(0.2);
                housing.lensMaterial.emissiveColor = colour.scale(5.0);
                housing.sourceMaterial.emissiveColor = colour.scale(8.0);
                housing.flareMaterial.emissiveColor = colour.scale(3.0);
            });
        }
        if (this.mirrorReflectionBatch) {
            this.mirrorReflectionBatch.spotMat.emissiveColor.copyFrom(colour);
            this.mirrorReflectionBatch.rayMat.emissiveColor.copyFrom(colour);
        }
        this.mirrorBallCachedColors = null;
        return colour;
    }

    /**
     * Apply the "one aerial idea at a time" rule after a fixture toggle.
     * Returns a human-readable note when other fixtures were changed, so the caller
     * can tell the user rather than silently discarding their previous choices.
     * @param {string} control the control that was just toggled on
     * @returns {string|null}
     */
    applyFixtureExclusivity(control) {
        if (control === 'strobesActive' && this.strobesActive) {
            // The show leaves its per-look strobe speed behind (2.4 for the peak, up to 4.8 after
            // the countdown). Switching strobes on by hand is a deliberate effect at the default
            // speed, not whatever the last cue was doing; the speed slider takes over from there.
            // Only when the show is handing over, so a speed the guest chose is never overwritten.
            if (this.showDirector && this.showDirector.isDriving()) {
                this.strobeSpeed = VRClubUI.VJ_DEFAULTS.strobeSpeed;
            }
            return null;
        }
        if (control === 'mirrorBallActive' && this.mirrorBallActive) {
            this.lasersActive = false;
            this.laserSheetActive = false;
            this.lightsActive = false;
            return 'Mirror ball takes the room \u2014 lasers, laser sheet and gobos off';
        }
        if (control === 'laserSheetActive' && this.laserSheetActive) {
            this.lasersActive = false;
            this.mirrorBallActive = false;
            this.lightsActive = false;
            return 'Laser sheet takes the room \u2014 lasers, mirror ball and gobos off';
        }
        if (control === 'lasersActive' && this.lasersActive) {
            this.mirrorBallActive = false;
            this.laserSheetActive = false;
            this.lightsActive = true;
            return 'Ceiling lasers on \u2014 mirror ball and laser sheet off';
        }
        return null;
    }

    /** Per-mode / per-pattern confirmation colours for the in-world buttons.
     *  Static so they are allocated once, not per click. */
    static get SPOT_MODE_COLORS() {
        if (!this._spotModeColors) {
            this._spotModeColors = [
                new BABYLON.Color3(1, 0, 1),    // 0 strobe+sweep
                new BABYLON.Color3(0, 1, 1),    // 1 sweep only
                new BABYLON.Color3(1, 1, 0),    // 2 strobe static
                new BABYLON.Color3(0, 1, 0)     // 3 static
            ];
        }
        return this._spotModeColors;
    }

    static get SPOT_PATTERN_COLORS() {
        if (!this._spotPatternColors) {
            this._spotPatternColors = [
                new BABYLON.Color3(1, 0, 1),    // 0 random
                new BABYLON.Color3(0, 1, 1),    // 1 static down
                new BABYLON.Color3(1, 0.5, 1),  // 2 mirror sweep
                new BABYLON.Color3(1, 0.8, 0)   // 3 crossed beams
            ];
        }
        return this._spotPatternColors;
    }

    /**
     * Flash an in-world VJ button, then restore its resting colour.
     * The restore is guarded and tracked so a dispose() mid-flash cannot write to a
     * material that scene.dispose() has already destroyed.
     */
    _flashButton3D(button, colour, durationMs) {
        if (!button || !button.material) return;
        button.material.emissiveColor = colour;
        if (!this._pendingTimers) this._pendingTimers = new Set();
        const id = setTimeout(() => {
            this._pendingTimers.delete(id);
            if (this._disposed || !button.material) return;
            button.material.emissiveColor = button.offColor;
        }, durationMs);
        this._pendingTimers.add(id);
    }

    /** Visible geometry the VR teleport arc must not pass through. */
    static get TELEPORT_BLOCKERS() {
        return ['frontWall', 'frontWallRight', 'frontWallLintel', 'backWall', 'leftWall', 'rightWall', 'djPlatform', 'djPlatformTop'];
    }

    /** Longest the Enter VR button waits for background model loading. */
    static get VR_ENTRY_MAX_WAIT_MS() { return 30000; }

    /** A playing stream whose clock has not advanced this long is reconnected. */
    static get STREAM_STALL_SECONDS() { return 8; }

    /** Backoff between stream reconnect attempts; its length is the attempt cap. */
    static get STREAM_RETRY_DELAYS_MS() { return [2000, 5000, 10000]; }

    /** Documented defaults for every VJ-controllable property. */
    static get VJ_DEFAULTS() {
        return {
            lightsActive: true,
            lasersActive: false,
            ledWallActive: true,
            ledMonochrome: false,
            strobesActive: true,
            mirrorBallActive: false,
            laserSheetActive: false,
            smokeActive: false,
            spotStrobeActive: true,
            spotlightMode: 0,
            spotlightPattern: 0,
            goboPatternIndex: 0,
            goboRotationSpeed: 1.0,
            spotlightSpeed: 1.0,
            laserSpeed: 1.0,
            mirrorBallSpeed: 1.0,
            ledWallSpeed: 1.0,
            strobeSpeed: 1.0,
            vjManualMode: false
        };
    }

    /**
     * Restore every VJ control to its documented default.
     * Photosensitive safe mode and the graphics tier are deliberately NOT reset:
     * they are accessibility/hardware preferences, not part of the light show.
     */
    resetVJControls() {
        Object.assign(this, VRClubUI.VJ_DEFAULTS);
        if (this.goboEnabled && typeof this.toggleGobo === 'function') this.toggleGobo();
        if (this.vjDirector && typeof this.vjDirector.setMasterIntensity === 'function') {
            this.vjDirector.setMasterIntensity(1);
        }
        log.info('\u21ba VJ controls reset to defaults');
    }

    /**
     * Animate in-world 3D button depression and trigger tactile haptic pulse.
     * @param {BABYLON.AbstractMesh} mesh
     */
    _pressButton3D(mesh) {
        if (!mesh || mesh._isPressed) return;
        mesh._isPressed = true;
        const origY = mesh.position.y;
        mesh.position.y -= 0.015;
        this.pulseHaptic(0.85, 35);
        setTimeout(() => {
            if (mesh) {
                mesh.position.y = origY;
                mesh._isPressed = false;
            }
        }, 120);
    }

    /**
     * Dispatch a sharp tactile haptic pulse to all active VR controllers.
     * @param {number} [intensity=0.8] 0.0 .. 1.0
     * @param {number} [duration=30] ms
     */
    pulseHaptic(intensity = 0.8, duration = 30) {
        if (!this.bassHapticsEnabled) return;
        if (!this._xrControllers || this._xrControllers.length === 0) return;
        for (let i = 0; i < this._xrControllers.length; i++) {
            const ctrl = this._xrControllers[i];
            try {
                const inputSource = ctrl && ctrl.inputSource;
                const gp = inputSource && inputSource.gamepad;
                if (!gp) continue;
                if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
                    gp.hapticActuators[0].pulse(intensity, duration);
                } else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
                    gp.vibrationActuator.playEffect('dual-rumble', {
                        duration: duration,
                        strongMagnitude: intensity,
                        weakMagnitude: intensity * 0.5
                    });
                }
            } catch (_) { /* ignore */ }
        }
    }

    _drawVRQuickMenuButton(button) {
        const context = button.texture.getContext();
        const active = !button.action && button.control && button.control !== 'cycleLedPattern'
            ? !!this[button.control]
            : true;
        context.clearRect(0, 0, 512, 192);
        context.fillStyle = button.action === 'close'
            ? '#641f2c'
            : (active ? '#087f75' : '#252a35');
        context.fillRect(0, 0, 512, 192);
        context.strokeStyle = active ? '#8fffee' : '#6f7787';
        context.lineWidth = 8;
        context.strokeRect(4, 4, 504, 184);
        context.fillStyle = '#ffffff';
        context.font = 'bold 48px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const suffix = !button.action && button.control && button.control !== 'cycleLedPattern'
            ? (active ? '  ON' : '  OFF')
            : '';
        context.fillText(button.label + suffix, 256, 96);
        button.texture.update();
    }

    _refreshVRQuickMenu() {
        if (!this._vrQuickMenuButtons) return;
        this._vrQuickMenuButtons.forEach(button => this._drawVRQuickMenuButton(button));
    }

    _activateVRQuickMenuButton(button) {
        if (!button) return;
        if (button.action === 'close') {
            this.toggleVRQuickMenu(false);
            return;
        }
        if (button.action === 'travel') {
            this.moveCameraToPreset(button.control);
            this.toggleVRQuickMenu(false);
            return;
        }
        if (button.control === 'vrComfortMode') {
            this.setVRComfortMode(!this.vrComfortMode);
            return;
        }
        if (button.control === 'photosensitiveSafeMode') {
            this.setPhotosensitiveSafeMode(!this.photosensitiveSafeMode);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.control === 'bassHapticsEnabled') {
            this.setBassHapticsEnabled(!this.bassHapticsEnabled);
            this._refreshVRQuickMenu();
            return;
        }

        if (button.control === 'cycleLedPattern') {
            const patternCount = this._ledPatternPlaylist ? this._ledPatternPlaylist.length : 18;
            this.ledPattern = (this.ledPattern + 1) % patternCount;
        } else if (button.control) {
            if (this.photosensitiveSafeMode && button.control === 'strobesActive') {
                this.showErrorMessage('Photosensitive Safe Mode blocks strobes.');
                return;
            }
            this[button.control] = !this[button.control];
            const note = this.applyFixtureExclusivity(button.control);
            if (note) this.showErrorMessage(note);
        }

        this.lastVJInteraction = performance.now() / 1000;
        this.vjManualMode = true;
        this.pulseHaptic(0.7, 35);
        this._refreshVRQuickMenu();
    }

    _createVRQuickMenu() {
        if (this._vrQuickMenuRoot) return;
        const root = new BABYLON.TransformNode('vrQuickMenuRoot', this.scene);
        const panel = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuPanel', {
            width: 1.42,
            height: 1.8,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        panel.parent = root;
        panel.isPickable = false;
        const panelMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuPanelMat', {
            diffuseColor: [0.015, 0.02, 0.03],
            emissiveColor: [0.025, 0.04, 0.055],
            disableLighting: true
        });
        panelMaterial.alpha = 0.96;
        panel.material = panelMaterial;

        const definitions = [
            ['COMFORT', 'vrComfortMode'],
            ['SAFE MODE', 'photosensitiveSafeMode'],
            ['HAPTICS', 'bassHapticsEnabled'],
            ['ENTRANCE', 'arrival', 'travel'],
            ['DANCE FLOOR', 'danceFloor', 'travel'],
            ['DJ BOOTH', 'djBooth', 'travel'],
            ['BALCONY', 'balcony', 'travel'],
            ['SPOTS', 'lightsActive'],
            ['LASERS', 'lasersActive'],
            ['MIRROR', 'mirrorBallActive'],
            ['STROBES', 'strobesActive'],
            ['LED WALL', 'ledWallActive'],
            ['LED NEXT', 'cycleLedPattern'],
            ['SMOKE', 'smokeActive'],
            ['CLOSE', null, 'close']
        ];
        this._vrQuickMenuButtons = [];
        definitions.forEach((definition, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const mesh = BABYLON.MeshBuilder.CreatePlane(`vrQuickMenuButton${index}`, {
                width: 0.40,
                height: 0.25,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            }, this.scene);
            mesh.parent = root;
            mesh.position.set((col - 1) * 0.45, 0.68 - row * 0.34, -0.012);
            mesh.isPickable = true;
            mesh.renderingGroupId = 2;

            const texture = new BABYLON.DynamicTexture(
                `vrQuickMenuTexture${index}`,
                { width: 512, height: 192 },
                this.scene,
                false
            );
            texture.hasAlpha = false;
            const material = this.materialFactory.createStandardMaterial(`vrQuickMenuMat${index}`, {
                emissiveColor: [0, 0, 0],
                emissiveTexture: texture,
                disableLighting: true
            });
            material.backFaceCulling = false;
            mesh.material = material;

            const button = {
                mesh,
                texture,
                material,
                label: definition[0],
                control: definition[1],
                action: definition[2] || null
            };
            this._vrQuickMenuButtons.push(button);
            this._drawVRQuickMenuButton(button);
        });
        root.setEnabled(false);
        this._vrQuickMenuRoot = root;
    }

    toggleVRQuickMenu(force) {
        this._createVRQuickMenu();
        const camera = this.isInVRMode
            ? this.vrHelper?.baseExperience?.camera : this.scene.activeCamera;
        if (!camera) return false;
        const next = force === undefined ? !this._vrQuickMenuRoot.isEnabled() : !!force;
        if (next) this._placeVRQuickMenu(camera);
        if (next) this._refreshVRQuickMenu();
        this._vrQuickMenuRoot.setEnabled(next);
        this.pulseHaptic(next ? 0.8 : 0.35, 35);
        return next;
    }

    /**
     * World-lock the menu where the player is looking when it opens: 1.8 m ahead along the horizontal gaze, a
     * little below eye level, upright and turned to face them. Parenting it to the head made it follow every head
     * movement, which is uncomfortable in a headset and makes the buttons hard to aim at.
     */
    _placeVRQuickMenu(camera) {
        const root = this._vrQuickMenuRoot;
        const eye = camera.globalPosition || camera.position;
        const forward = camera.getDirection(BABYLON.Axis.Z);
        let fx = forward.x, fz = forward.z;
        const flat = Math.hypot(fx, fz);
        if (flat < 1e-3) { fx = 0; fz = -1; } else { fx /= flat; fz /= flat; } // looking straight up or down
        root.parent = null;
        root.position.set(eye.x + fx * 1.8, eye.y - 0.1, eye.z + fz * 1.8);
        root.rotationQuaternion = null;
        root.rotation.set(0, Math.atan2(fx, fz), 0);
        root.computeWorldMatrix(true);
    }

    setupVJControlInteraction() {
        // Setup click handling for VJ control buttons, speed slider, and audio stream in 3D scene
        this.scene.onPointerDown = (evt, pickResult) => {
            if (pickResult.hit && pickResult.pickedMesh) {
                // Check if speed slider handle was clicked
                if (this.speedSlider && pickResult.pickedMesh === this.speedSlider.handle) {
                    this.speedSlider.isDragging = true;
                    this.speedSlider.handleMat.emissiveColor = new BABYLON.Color3(0, 1, 1); // Brighter cyan when dragging
                    this.pulseHaptic(0.6, 25);
                    return;
                }
                
                // Check if audio stream button was clicked
                if (this.audioStreamButton && pickResult.pickedMesh === this.audioStreamButton.mesh) {
                    this._pressButton3D(this.audioStreamButton.mesh);
                    this.toggleAudioStream();
                    return;
                }

                const vrMenuButton = this._vrQuickMenuButtons &&
                    this._vrQuickMenuButtons.find(button => button.mesh === pickResult.pickedMesh);
                if (vrMenuButton) {
                    this._activateVRQuickMenuButton(vrMenuButton);
                    return;
                }
                
                // Check if a VJ control button was clicked
                const clickedButton = this.vjControlButtons.find(btn => btn.mesh === pickResult.pickedMesh);
                
                if (clickedButton) {
                    this._pressButton3D(clickedButton.mesh);
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
                        this.cycleSpotColor();
                        this._flashButton3D(clickedButton, clickedButton.onColor, 200);
                        log.info(`🎨 Color changed to index ${this.spotColorIndex}`);

                    } else if (clickedButton.control === "changeMirrorBallColor") {
                        const colour = this.cycleMirrorBallColor();
                        this._flashButton3D(clickedButton, colour, 300);
                        log.info(`🪩 Mirror ball color index: ${this.mirrorBallColorIndex}`);

                    } else if (clickedButton.control === "cycleSpotMode") {
                        this.spotlightMode = (this.spotlightMode + 1) % VRClubUI.SPOT_MODE_COLORS.length;
                        this._flashButton3D(clickedButton, VRClubUI.SPOT_MODE_COLORS[this.spotlightMode], 300);
                        log.info(`💡 Spotlight mode: ${this.spotlightMode}`);

                    } else if (clickedButton.control === "cyclePattern") {
                        this.spotlightPattern = (this.spotlightPattern + 1) % VRClubUI.SPOT_PATTERN_COLORS.length;
                        this._flashButton3D(clickedButton, VRClubUI.SPOT_PATTERN_COLORS[this.spotlightPattern], 300);
                        log.info(`🎯 Spotlight pattern: ${this.spotlightPattern}`);

                    } else {
                        // Toggle on/off control
                        this[clickedButton.control] = !this[clickedButton.control];

                        // One aerial idea at a time - see applyFixtureExclusivity().
                        // The rule used to live only here, so the DOM panel silently
                        // behaved differently from the in-world desk.
                        const note = this.applyFixtureExclusivity(clickedButton.control);
                        if (note) this.showErrorMessage(note);
                        
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
        if (document.getElementById('vrAudioInput')) return;

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
        
        // Built with DOM APIs, not an HTML template: this was the app's only markup
        // injection sink and the last reason CSP needed style-src 'unsafe-inline'.
        // CSSOM writes (element.style / cssText) are not restricted by style-src.
        const el = (tag, props = {}, css = '') => {
            const node = document.createElement(tag);
            Object.assign(node, props);
            if (css) node.style.cssText = css;
            return node;
        };
        const buttonCss = 'border: none; border-radius: 5px; cursor: pointer;';
        const urlInputEl = el('input', {
            type: 'text', id: 'audioUrlInput', placeholder: 'Paste URL or drop audio file here'
        }, 'width: 400px; padding: 12px; font-size: 16px; border: 2px solid #00ff88; ' +
            'background: rgba(0, 0, 0, 0.7); color: #00ff88; border-radius: 5px; margin-bottom: 10px;');
        urlInputEl.setAttribute('aria-label', 'Audio stream URL');
        const browseRow = el('div', {}, 'margin: 10px 0;');
        browseRow.append(
            el('button', { type: 'button', id: 'audioFileBrowseBtn', textContent: '📁 Browse File' },
                `padding: 8px 20px; font-size: 14px; background: #0088ff; color: white; ${buttonCss}`),
            el('input', { type: 'file', id: 'vrAudioFileInput', accept: 'audio/*' }, 'display: none;')
        );
        const actionRow = el('div', {}, 'margin-top: 15px;');
        actionRow.append(
            el('button', { type: 'button', id: 'audioPlayBtn', textContent: '▶️ PLAY' },
                `padding: 12px 30px; font-size: 16px; margin: 0 10px; background: #00ff88; font-weight: bold; ${buttonCss}`),
            el('button', { type: 'button', id: 'audioCancelBtn', textContent: '✖️ CANCEL' },
                `padding: 12px 30px; font-size: 16px; margin: 0 10px; background: #ff4444; color: white; font-weight: bold; ${buttonCss}`)
        );
        inputDiv.append(
            el('h2', { textContent: '🎵 Audio Stream' }, 'color: #00ff88; margin: 0 0 20px 0; font-size: 24px;'),
            urlInputEl,
            browseRow,
            actionRow,
            el('p', { textContent: 'Stream URL, local file, or drag & drop' }, 'color: #888; font-size: 14px; margin-top: 15px;')
        );
        
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

    _ensureAudioElement() {
        if (this.audioElement) return this.audioElement;
        const audio = document.createElement('audio');
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.loop = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.audioElement = audio;
        this._watchAudioStream(audio);
        return audio;
    }

    /**
     * Internet radio drops mid-session, after which the element simply goes quiet
     * and the show falls back to synthetic beats with no explanation. Watch for a
     * media error, or for an un-paused stream whose clock stops advancing, and
     * reconnect with bounded backoff. Local files and user pauses are left alone.
     */
    _watchAudioStream(audio) {
        const recovery = this._streamRecovery = { attempts: 0, timer: null, lastTime: -1, stalledFor: 0, hasPlayed: false };
        this._onAudioFault = () => this._recoverAudioStream('error');
        this._onAudioPlaying = () => { recovery.attempts = 0; recovery.stalledFor = 0; recovery.hasPlayed = true; };
        audio.addEventListener('error', this._onAudioFault);
        audio.addEventListener('playing', this._onAudioPlaying);
        this._audioWatchdog = setInterval(() => {
            if (this._audioKind !== 'stream' || audio.paused || recovery.timer) {
                recovery.stalledFor = 0;
                recovery.lastTime = audio.currentTime;
                return;
            }
            recovery.stalledFor = audio.currentTime === recovery.lastTime ? recovery.stalledFor + 2 : 0;
            recovery.lastTime = audio.currentTime;
            if (recovery.stalledFor >= VRClubUI.STREAM_STALL_SECONDS) {
                recovery.stalledFor = 0;
                this._recoverAudioStream('stall');
            }
        }, 2000);
    }

    _recoverAudioStream(reason) {
        const audio = this.audioElement;
        const recovery = this._streamRecovery;
        if (!audio || !recovery || this._disposed) return;
        if (this._audioKind !== 'stream') {
            if (reason === 'error' && this._audioKind === 'file') {
                this.showErrorMessage('This audio file cannot be played. Try an MP3, AAC, OGG or WAV file.');
            }
            return;
        }
        if (recovery.timer) return;
        // A stream that never started (bad URL, CORS, codec) is reported by the
        // rejected play() in _playAudio; only a dropped, previously-playing stream
        // is worth reconnecting.
        if (!recovery.hasPlayed) return;
        const delays = VRClubUI.STREAM_RETRY_DELAYS_MS;
        if (recovery.attempts >= delays.length) {
            this.showErrorMessage('The stream stopped and could not be reconnected. Choose another station.');
            return;
        }
        const delay = delays[recovery.attempts++];
        // An on-demand episode (finite duration) resumes where it dropped instead of
        // restarting an hour-long set from zero. Captured now: reloading resets it.
        const resumeAt = Number.isFinite(audio.duration) ? audio.currentTime : 0;
        this.showErrorMessage(`Stream interrupted \u2014 reconnecting (attempt ${recovery.attempts} of ${delays.length})\u2026`);
        log.warn(`🎵 Stream ${reason}; reconnect attempt ${recovery.attempts} in ${delay} ms`);
        recovery.timer = setTimeout(() => {
            recovery.timer = null;
            if (this._disposed || this._audioKind !== 'stream' || !this._audioStreamUrl) return;
            audio.src = this._audioStreamUrl;
            if (resumeAt > 0) {
                audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; }, { once: true });
            }
            audio.load();
            audio.play().catch(() => this._recoverAudioStream('error'));
        }, delay);
    }

    /**
     * @param {string} src
     * @param {'stream'|'file'} kind
     * @param {string} label
     * @param {{ loop?: boolean }} [options] `loop: false` lets an on-demand episode reach its
     *        end so the caller can queue the next one. Everything else loops, as before.
     */
    _playAudio(src, kind, label, options = {}) {
        const audio = this._ensureAudioElement();
        audio.loop = options.loop !== false;
        this._audioKind = kind;
        this._audioStreamUrl = kind === 'stream' ? src : null;
        if (this._streamRecovery) {
            clearTimeout(this._streamRecovery.timer);
            this._streamRecovery.timer = null;
            this._streamRecovery.attempts = 0;
            this._streamRecovery.hasPlayed = false;
        }
        this._setAudioSrc(src);
        this._connectAudioSourceOnce();
        audio.load();

        return audio.play().then(() => {
            if (this.audioStreamButton) {
                this.audioStreamButton.isPlaying = true;
                this.audioStreamButton.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
            }
            log.info(`🔊 Playing ${kind}: ${label}`);
            return audio;
        }).catch(error => {
            log.error(`❌ Failed to play ${kind}:`, error);
            this.showErrorMessage('Audio loaded, but playback was blocked. Press Play again.');
            throw error;
        });
    }

    /** @param {{ onDemand?: boolean }} [options] an on-demand episode plays once instead of looping */
    startAudioStream(url, options = {}) {
        if (!this._isSafeAudioUrl(url)) {
            log.warn(`🎵 Rejected unsafe audio URL: ${url}`);
            this.showErrorMessage('Invalid audio URL. Use http://, https:// or blob: only.');
            return Promise.reject(new TypeError('Unsafe audio URL'));
        }
        return this._playAudio(url, 'stream', url, { loop: !options.onDemand });
    }

    startAudioFromFile(file) {
        log.info(`🎵 Loading audio file: ${file.name}`);
        const fileUrl = URL.createObjectURL(file);
        return this._playAudio(fileUrl, 'file', file.name);
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

    setVRComfortMode(enabled) {
        this.vrComfortMode = !!enabled;
        try { localStorage.setItem('vrclub.vrComfort', this.vrComfortMode ? '1' : '0'); } catch (_) {}
        this._applyXRLocomotionMode();
        const xrCamera = this.vrHelper?.baseExperience?.camera;
        if (xrCamera) xrCamera.applyGravity = !this.vrComfortMode;
        if (xrCamera && this.vrComfortMode) {
            xrCamera.cameraDirection?.set(0, 0, 0);
            xrCamera.cameraRotation?.set(0, 0);
        }
        if (this.vrComfortMode && this.jumpState) this.jumpState.active = false;
        if (typeof document !== 'undefined') {
            const splash = document.getElementById('splashVRComfort');
            if (splash) splash.checked = this.vrComfortMode;
            const button = document.getElementById('vjVRComfortBtn');
            if (button) {
                button.setAttribute('aria-pressed', String(this.vrComfortMode));
                button.classList.toggle('active', this.vrComfortMode);
            }
        }
        this._refreshVRQuickMenu();
        return this.vrComfortMode;
    }

    /** Surfaces the VR teleport arc may land on: the club floor, plus the balcony deck and its stair treads. */
    _teleportFloorMeshes() {
        return [this.floorMesh, this._mezzDeck].filter(Boolean);
    }

    _xrMovementOptions() {
        return {
            xrInput: this.vrHelper.input,
            movementEnabled: true,
            movementSpeed: 1.5,
            movementThreshold: 0.2,
            rotationEnabled: true,
            rotationSpeed: 0.8,
            rotationThreshold: 0.2,
            // Follow the flattened controller direction, not head pitch, so looking up
            // while pushing forward never lifts the player off the floor.
            movementOrientationFollowsViewerPose: false,
            movementOrientationFollowsController: true
        };
    }

    /**
     * Babylon declares MOVEMENT and TELEPORTATION mutually exclusive: enabling one
     * while the other is enabled throws. Comfort mode therefore swaps features rather
     * than toggling flags on both. The swap only happens in-session, because the
     * movement feature needs live XR input; outside XR teleportation stays registered
     * (the default experience created it) and the IN_XR handler re-applies the mode.
     */
    _applyXRLocomotionMode() {
        const vrHelper = this.vrHelper;
        const experience = vrHelper && vrHelper.baseExperience;
        const features = experience && experience.featuresManager;
        const names = typeof BABYLON !== 'undefined' ? BABYLON.WebXRFeatureName : null;
        if (!features || !names) return;

        const inXR = experience.state === BABYLON.WebXRState.IN_XR;
        try {
            if (this.vrComfortMode) {
                if (features.getEnabledFeature(names.MOVEMENT)) features.disableFeature(names.MOVEMENT);
                this.movementFeature = null;
                let teleport = features.getEnabledFeature(names.TELEPORTATION);
                if (!teleport) {
                    teleport = features.enableFeature(names.TELEPORTATION, 'latest', {
                        xrInput: vrHelper.input,
                        floorMeshes: this._teleportFloorMeshes()
                    });
                    if (vrHelper.pointerSelection && teleport.setSelectionFeature) {
                        teleport.setSelectionFeature(vrHelper.pointerSelection);
                    }
                }
                // The default experience registered only the main floor. The balcony deck and its stair are
                // floors too; remove-then-add keeps re-application idempotent.
                if (typeof teleport.addFloorMesh === 'function') {
                    for (const mesh of this._teleportFloorMeshes()) {
                        if (typeof teleport.removeFloorMesh === 'function') teleport.removeFloorMesh(mesh);
                        teleport.addFloorMesh(mesh);
                    }
                }
                vrHelper.teleportation = teleport;
                teleport.teleportationEnabled = true;
                teleport.rotationEnabled = true;
                teleport.rotationAngle = Math.PI / 6;
                teleport.backwardsMovementEnabled = false;
                // Babylon's teleport ray tests only floor and blocker meshes, and the floor
                // slab runs 5-12 m past the brick shell: without blockers the arc passed
                // through the walls and landed the player outside the venue, or under the
                // DJ platform. Remove-then-add keeps re-application idempotent.
                if (typeof teleport.addBlockerMesh === 'function' && this.scene) {
                    for (const name of VRClubUI.TELEPORT_BLOCKERS) {
                        const mesh = this.scene.getMeshByName(name);
                        if (!mesh) continue;
                        teleport.removeBlockerMesh(mesh);
                        teleport.addBlockerMesh(mesh);
                    }
                }
            } else if (inXR) {
                if (features.getEnabledFeature(names.TELEPORTATION)) features.disableFeature(names.TELEPORTATION);
                vrHelper.teleportation = null;
                this.movementFeature = features.getEnabledFeature(names.MOVEMENT)
                    || features.enableFeature(names.MOVEMENT, 'latest', this._xrMovementOptions());
                this.movementFeature.movementEnabled = true;
                this.movementFeature.rotationEnabled = true;
                this.movementFeature.movementSpeed = 1.5;
            } else if (vrHelper.teleportation) {
                vrHelper.teleportation.teleportationEnabled = false;
                vrHelper.teleportation.rotationEnabled = false;
            }
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            log.error('Could not apply VR locomotion mode:', message);
            if (typeof this.recordDiagnostic === 'function') {
                this.recordDiagnostic('xr', 'VR locomotion mode failed', { error: message });
            }
        }
    }

    moveCameraToPreset(preset) {
        const presets = {
            arrival: { label: 'Arrival', pos: new BABYLON.Vector3(0, 1.7, 5.0), target: new BABYLON.Vector3(0, 1.9, -12) },
            danceFloor: { label: 'Dance Floor', pos: new BABYLON.Vector3(-2.8, 1.7, -9.2), target: new BABYLON.Vector3(0, 2.6, -18.5) },
            // Eye height for someone standing on the 0.5 m riser, inside the 1 m
            // gap between the LED wall (z=-20) and the deck plinth (z=-19), facing out.
            djBooth: { label: 'DJ Booth', pos: new BABYLON.Vector3(0, 2.2, -19.4), target: new BABYLON.Vector3(0, 1.7, -10) },
            lightingGallery: { label: 'Lighting Gallery', pos: new BABYLON.Vector3(10, 5.2, -6.5), target: new BABYLON.Vector3(0, 2.4, -15.5) },
            // Standing on the steel mezzanine (deck at y 3), looking across the dance floor to the booth.
            balcony: { label: 'Balcony', pos: new BABYLON.Vector3(-10.9, 4.7, -12.4), target: new BABYLON.Vector3(1, 2.7, -16), level: 3.0 }
        };
        
        const p = presets[preset];
        if (p) {
            this._walkLevel = p.level || 0;
            const xrCamera = this.isInVRMode ? this.vrHelper?.baseExperience?.camera : null;
            if (xrCamera) {
                const height = typeof this._xrHeadHeight === 'function' ? this._xrHeadHeight() : 1.6;
                xrCamera.position.x = p.pos.x;
                xrCamera.position.z = p.pos.z;
                xrCamera.position.y = height + (preset === 'djBooth' ? 0.5 : (p.level || 0));
                if (this.jumpState) this.jumpState.active = false;
            } else {
                this.camera.position.copyFrom(p.pos);
                this.camera.setTarget(p.target);
            }
            this.showCameraTransitionFeedback(p.label);
        }
    }

    showCameraTransitionFeedback(label) {
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
        feedback.textContent = `📷 ${label.toUpperCase()}`;
        document.body.appendChild(feedback);
        
        setTimeout(() => feedback.remove(), 1500);
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
}
window.VRClubUI = VRClubUI;
