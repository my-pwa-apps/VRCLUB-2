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

    /** In someone else's room the host owns the music and the lights; this guest follows them. */
    isFollowingHost() {
        return !!(this.multiplayer && this.multiplayer.following);
    }

    /**
     * Gate for every control that changes the room's shared music or lights (what is 'music' or 'lights').
     * @returns {boolean} true when the caller may go ahead
     */
    guardHostControl(what) {
        if (!this.isFollowingHost()) return true;
        const now = performance.now();
        if (!this._hostGuardAt || now - this._hostGuardAt > 1500) {
            this._hostGuardAt = now;
            const host = this.multiplayer.hostName();
            this.showErrorMessage(`Only the host${host ? ` (${host})` : ''} controls the ${what}. Leave the room to take over.`);
        }
        return false;
    }
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

    /** Display names for the moving heads' movement modes and aiming patterns: one list for every surface. */
    static get SPOT_MODE_NAMES() {
        return this._spotModeNames || (this._spotModeNames = Object.freeze(['STROBE+SWEEP', 'SWEEP ONLY', 'STROBE STATIC', 'STATIC']));
    }

    static get SPOT_PATTERN_NAMES() {
        return this._spotPatternNames || (this._spotPatternNames = Object.freeze(['RANDOM', 'STATIC DOWN', 'MIRROR SWEEP', 'CROSSED BEAMS']));
    }

    /** The on/off light controls a person may flip by name (never `this[anything]`). */
    static get LIGHT_TOGGLES() {
        return this._lightToggles || (this._lightToggles = Object.freeze(new Set([
            'lightsActive', 'lasersActive', 'laserSheetActive', 'mirrorBallActive', 'ledWallActive', 'ledMonochrome',
            'strobesActive', 'smokeActive', 'spotStrobeActive'
        ])));
    }

    /** Take the lights by hand: the automatic show stands down until AUTO SHOW, or until nobody touches them for VJ_TIMEOUT. */
    takeLightControl() {
        this.lastVJInteraction = performance.now() / 1000;
        this.vjManualMode = true;
    }

    /** Hand the lights back to the automatic show. */
    resumeAutoShow() {
        this.vjManualMode = false;
        this.lastVJInteraction = 0;
    }

    /** One movement speed (0.1..2) for every fixture, as the speed faders set it. */
    setLightSpeed(value) {
        const speed = Math.max(0.1, Math.min(2, Number(value) || 1));
        this.spotlightSpeed = speed;
        this.laserSpeed = speed;
        this.mirrorBallSpeed = speed;
        this.ledWallSpeed = speed;
        this.strobeSpeed = speed;
        return speed;
    }

    /**
     * Flip or step one light control by name, for the in-world desk and the VR quick menu: the same allow-list, the
     * same Safe Mode rule for strobes, the same one-aerial-idea rule, and the lights handed to whoever pressed it.
     * @returns {boolean} true when something changed
     */
    toggleLightControl(control) {
        if (!this.guardHostControl('lights')) return false;
        switch (control) {
            case 'changeColor': this.cycleSpotColor(); break;
            case 'changeMirrorBallColor': this.cycleMirrorBallColor(); break;
            case 'cycleSpotMode': this.spotlightMode = (this.spotlightMode + 1) % VRClubUI.SPOT_MODE_NAMES.length; break;
            case 'cyclePattern': this.spotlightPattern = (this.spotlightPattern + 1) % VRClubUI.SPOT_PATTERN_NAMES.length; break;
            case 'cycleGoboPattern': if (typeof this.nextGoboPattern === 'function') this.nextGoboPattern(); break;
            case 'goboActive': if (typeof this.toggleGobo === 'function') this.toggleGobo(); break;
            case 'cycleLedPattern': {
                const count = this._ledPatternPlaylist ? this._ledPatternPlaylist.length : 20;
                this.ledPattern = ((this.ledPattern || 0) + 1) % count;
                break;
            }
            default: {
                if (!VRClubUI.LIGHT_TOGGLES.has(control)) return false;
                if (this.photosensitiveSafeMode && !this[control] && (control === 'strobesActive' || control === 'spotStrobeActive')) {
                    this.showErrorMessage('Photosensitive Safe Mode blocks strobes.');
                    return false;
                }
                this[control] = !this[control];
                const note = this.applyFixtureExclusivity(control);
                if (note) this.showErrorMessage(note);
            }
        }
        this.takeLightControl();
        return true;
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
        const active = this._isVRQuickMenuButtonActive(button);
        const disabled = this._isVRButtonDisabled(button);
        context.clearRect(0, 0, 512, 192);
        const isNavigation = ['page', 'back', 'seek', 'randomEpisode', 'latestEpisode', 'person'].includes(button.action);
        const isDanger = button.danger === true;
        // A button that cannot do anything here (a guest's lighting, the mic before joining a room) is drawn
        // flat and grey, so it reads as unavailable before anyone points at it. Its second line says why.
        context.fillStyle = disabled ? '#16191f'
            : button.action === 'close' ? '#641f2c'
            : isDanger ? '#7a2434'
            : button.action === 'quality' ? '#5b3fa3'
            : isNavigation ? '#173e58'
            : (active ? '#087f75' : '#252a35');
        context.fillRect(0, 0, 512, 192);
        if (!disabled) {
            const gradient = context.createLinearGradient(0, 0, 512, 192);
            gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
            gradient.addColorStop(0.5, 'rgba(255,255,255,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.18)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 512, 192);
        }
        context.strokeStyle = disabled ? '#343a46' : active || isNavigation ? '#8fffee' : '#6f7787';
        context.lineWidth = disabled ? 4 : 8;
        context.strokeRect(4, 4, 504, 184);
        context.fillStyle = disabled ? '#6b7280' : '#ffffff';
        context.font = 'bold 44px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const value = this._vrQuickMenuButtonValue(button, active);
        context.fillText(button.label, 256, value ? 70 : 96, 480);
        if (value) {
            context.fillStyle = disabled ? '#8a919e' : active ? '#b9fff5' : '#c5cad4';
            context.font = 'bold 32px sans-serif';
            context.fillText(value, 256, 132, 480);
        }
        button.texture.update();
    }

    /** Can this button do nothing right now? (It still answers a press, with a message saying why.) */
    _isVRButtonDisabled(button) {
        if (this.isFollowingHost() && this._isHostOwnedVRButton(button)) return true;
        if (button.action !== 'net' && button.action !== 'person') return false;
        const mp = this._multiplayer();
        if (!mp) return true;
        const needsRoom = ['mic', 'avatar', 'gesture', 'emoji', 'phrase', 'muteAll', 'leave', 'listenAlong'];
        if (needsRoom.includes(button.op) && !mp.connected) return true;
        if (button.op === 'lock' && !mp.isHost()) return true;
        if (button.op === 'listenAlong' && !mp.pendingMusicInfo()) return true;
        if (button.op === 'unblockAll' && !mp.blockedList().length) return true;
        return false;
    }

    _isVRQuickMenuButtonActive(button) {
        if (button.op) return this._vrNetActive(button);
        if (button.action === 'people') {
            return VRClubCore.peopleCategories(button.people).every(name => this.isPeopleVisible(name));
        }
        if (button.action === 'autoShow') return !this.vjManualMode;
        if (button.action === 'podcast') return this._selectedPodcastId() === button.podcast;
        if (button.action === 'playPause') return this.getPlaybackInfo().playing;
        if (button.action === 'quality' || button.action === 'cycle') return true;
        if (button.control) return !!this[button.control];
        return false;
    }

    /** The chosen podcast's id ('resident' | 'colourizon'), whichever surface chose it. */
    _selectedPodcastId() {
        if (this.podcastPlayer) return this.podcastPlayer.selectedId();
        try { return window.Podcasts ? window.Podcasts.selectedId(localStorage) : 'resident'; } catch (_) { return 'resident'; }
    }

    /** Buttons that change the room's music or lights: in someone else's room they belong to the host. */
    _isHostOwnedVRButton(button) {
        if (['seek', 'playPause', 'podcast', 'randomEpisode', 'latestEpisode', 'autoShow', 'reset', 'cycle'].includes(button.action)) return true;
        return !!button.control && !button.action && !['vrComfortMode', 'photosensitiveSafeMode', 'bassHapticsEnabled'].includes(button.control);
    }

    _vrQuickMenuButtonValue(button, active) {
        if (button.op || button.action === 'person') return this._vrNetValue(button, active);
        if (button.action === 'people') return active ? 'HERE' : 'SENT HOME';
        if (this.isFollowingHost() && this._isHostOwnedVRButton(button)) return 'HOST ONLY';
        if (button.action === 'podcast') return active ? 'SELECTED' : '';
        if (button.action === 'playPause') return active ? 'PLAYING' : 'PAUSED';
        if (button.action === 'quality') return this.graphicsTier.toUpperCase();
        if (button.action === 'cycle' && button.control === 'cycleLedPattern') {
            return `PATTERN ${(this.ledPattern || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'changeColor') {
            return `COLOUR ${(this.spotColorIndex || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'changeMirrorBallColor') {
            return `COLOUR ${(this.mirrorBallColorIndex || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'cycleSpotMode') {
            return `MODE ${(this.spotlightMode || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'cyclePattern') {
            return `PATTERN ${(this.spotlightPattern || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'cycleGoboPattern') {
            return `GOBO ${(this.goboPatternIndex || 0) + 1}`;
        }
        if (button.action === 'autoShow') return active ? 'ON' : 'MANUAL';
        if (button.control) return active ? 'ON' : 'OFF';
        return '';
    }

    _vrQuickMenuPageDefinitions(page) {
        const common = {
            back: { label: '\u2190 BACK', action: 'back' },
            close: { label: 'CLOSE', action: 'close' }
        };
        if (VRClubUI.VR_NET_PAGES.includes(page)) return this._vrNetPageDefinitions(page, common);
        const mp = this._multiplayer();
        // In a room, talking and reacting come first: one press to the mic, the emoji or a quick message.
        const social = mp && mp.connected ? [
            { label: 'TALK', action: 'net', op: 'mic' },
            { label: 'REACT', action: 'page', target: 'gestures' },
            { label: 'CHAT', action: 'page', target: 'chat', op: 'chatUnread' }
        ] : [];
        const pages = {
            home: [
                ...social,
                { label: 'MUSIC', action: 'page', target: 'music' },
                { label: 'LIGHTING', action: 'page', target: 'lighting' },
                { label: 'EFFECTS', action: 'page', target: 'effects' },
                { label: 'SHOW', action: 'page', target: 'show' },
                // Who is in the club gets its own page: it used to sit at the bottom of COMFORT, where nobody found it.
                { label: 'CROWD', action: 'page', target: 'crowd' },
                { label: 'ONLINE', action: 'page', target: 'online' },
                { label: 'TRAVEL', action: 'page', target: 'travel' },
                { label: 'COMFORT', action: 'page', target: 'comfort' },
                common.close
            ],
            lighting: [
                { label: 'SPOTS', control: 'lightsActive' },
                { label: 'LASERS', control: 'lasersActive' },
                { label: 'LASER SHEET', control: 'laserSheetActive' },
                { label: 'MIRROR BALL', control: 'mirrorBallActive' },
                { label: 'LED WALL', control: 'ledWallActive' },
                { label: 'LED NEXT', control: 'cycleLedPattern', action: 'cycle' },
                { label: 'SPOT COLOUR', control: 'changeColor', action: 'cycle' },
                { label: 'SPOT MODE', control: 'cycleSpotMode', action: 'cycle' },
                { label: 'SPOT PATTERN', control: 'cyclePattern', action: 'cycle' },
                { label: 'GOBO', control: 'cycleGoboPattern', action: 'cycle' },
                common.back,
                common.close
            ],
            effects: [
                { label: 'STROBES', control: 'strobesActive' },
                { label: 'SPOT STROBE', control: 'spotStrobeActive' },
                { label: 'SMOKE', control: 'smokeActive' },
                { label: 'LED MONO', control: 'ledMonochrome' },
                { label: 'MIRROR COLOUR', control: 'changeMirrorBallColor', action: 'cycle' },
                { label: 'SAFE MODE', control: 'photosensitiveSafeMode' },
                common.back,
                common.close
            ],
            comfort: [
                { label: 'LOCOMOTION', control: 'vrComfortMode' },
                { label: 'SAFE MODE', control: 'photosensitiveSafeMode' },
                { label: 'HAPTICS', control: 'bassHapticsEnabled' },
                { label: 'QUALITY', action: 'quality' },
                common.back,
                common.close
            ],
            // Who is in the club: a personal choice, like Safe Mode, so it is never the host's.
            crowd: [
                { label: 'DANCERS', action: 'people', people: 'dancers' },
                { label: 'BYSTANDERS', action: 'people', people: 'bystanders' },
                { label: 'DJ', action: 'people', people: 'dj' },
                { label: 'EVERYONE', action: 'people', people: 'all' },
                common.back,
                common.close
            ],
            travel: [
                { label: 'ENTRANCE', control: 'arrival', action: 'travel' },
                { label: 'DANCE FLOOR', control: 'danceFloor', action: 'travel' },
                { label: 'DJ BOOTH', control: 'djBooth', action: 'travel' },
                { label: 'BALCONY', control: 'balcony', action: 'travel' },
                { label: 'STREET', control: 'street', action: 'travel' },
                common.back,
                common.close
            ],
            show: [
                { label: 'AUTO SHOW', action: 'autoShow' },
                { label: 'LED NEXT', control: 'cycleLedPattern', action: 'cycle' },
                { label: 'SPOT COLOUR', control: 'changeColor', action: 'cycle' },
                { label: 'RESET SHOW', action: 'reset' },
                common.back,
                common.close
            ],
            // The first row is the seek bar (its own mesh), so its three button slots stay empty.
            music: [
                null, null, null,
                { label: '\u2212 1 MIN', action: 'seek', delta: -60 },
                { label: 'PLAY / PAUSE', action: 'playPause' },
                { label: '+ 1 MIN', action: 'seek', delta: 60 },
                { label: 'HERNAN', action: 'podcast', podcast: 'resident' },
                { label: 'MELERA', action: 'podcast', podcast: 'colourizon' },
                { label: 'RANDOM', action: 'randomEpisode' },
                { label: 'LATEST', action: 'latestEpisode' },
                common.back,
                common.close
            ]
        };
        return pages[page] || pages.home;
    }

    _showVRQuickMenuPage(page) {
        this._vrQuickMenuPage = page;
        if (page === 'chat' && this.multiplayer) this.multiplayer.markChatRead();
        const definitions = this._vrQuickMenuPageDefinitions(page);
        this._vrQuickMenuButtons.forEach((button, index) => {
            const definition = definitions[index];
            button.mesh.setEnabled(!!definition);
            if (!definition) return;
            button.label = '';
            button.control = null;
            button.action = null;
            button.target = null;
            button.podcast = null;
            button.delta = 0;
            button.op = null;
            button.peer = null;
            button.gesture = null;
            button.emoji = null;
            button.digit = null;
            button.pool = null;
            button.phrase = null;
            button.people = null;
            button.danger = false;
            Object.assign(button, definition);
            this._drawVRQuickMenuButton(button);
        });
        // The seek bar lives on the Music page only, and only that page keeps its clock ticking.
        if (this._vrSeek) {
            this._vrSeek.mesh.setEnabled(page === 'music');
            if (page === 'music') this._startVRMusicTicker();
            else this._stopVRMusicTicker();
            this._drawVRSeekBar();
        }
        if (this._vrQuickMenuHeaderTexture) {
            const context = this._vrQuickMenuHeaderTexture.getContext();
            context.clearRect(0, 0, 1024, 192);
            context.fillStyle = '#8fffee';
            context.font = 'bold 66px sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            const titles = { home: 'VR CLUB', room: 'JOIN ROOM', look: 'RANDOM LOOK', gestures: 'REACT', chat: 'CHAT', crowd: 'WHO IS HERE' };
            context.fillText(titles[page] || page.toUpperCase(), 54, 72);
            context.fillStyle = '#a7afbf';
            context.font = '30px sans-serif';
            // In someone else's room the music and lighting pages say whose they are, not only "HOST ONLY" per button.
            const hostOwned = ['home', 'lighting', 'effects', 'show', 'music'].includes(page) && this.isFollowingHost();
            const host = hostOwned ? (this.multiplayer.hostName() || 'THE HOST').toUpperCase().slice(0, 18) : '';
            // What each page is for, in plain words: the first thing a new visitor reads.
            const about = {
                lighting: 'TURN THE CLUB\u2019S LIGHTS ON OR OFF, CHANGE THEIR COLOUR',
                effects: 'STROBES, SMOKE AND THE MIRROR BALL',
                show: 'THE AUTOMATIC LIGHT SHOW THAT FOLLOWS THE MUSIC',
                comfort: 'HOW YOU MOVE, WHAT YOU SEE AND FEEL',
                crowd: 'SEND THE DANCERS, THE OTHER GUESTS OR THE DJ HOME',
                travel: 'POINT AT A PLACE TO JUMP THERE',
                music: 'POINT + TRIGGER ON THE BAR TO GO ANYWHERE IN THE SET'
            };
            context.fillText(hostOwned
                ? `${host} IS THE HOST: THEIR MUSIC AND LIGHTS`
                : about[page] || this._vrNetSubtitle(page) || `${this.graphicsTier.toUpperCase()} QUALITY  \u2022  POINT + TRIGGER`, 56, 142);
            this._vrQuickMenuHeaderTexture.update();
        }
    }

    // ---- The seek bar -------------------------------------------------------------------------------------
    // One plane with a canvas texture. A pick on it maps to a fraction of the set through the plane's local x
    // (the bar spans SEEK_BAR_PX of the texture), so it works with any controller ray and needs no slider mesh.

    static get VR_SEEK_BAR_PX() { return { left: 70, right: 954, width: 1024, height: 192 }; }

    /** Fraction (0..1) of the bar at a world-space pick point on the seek plane. */
    _vrSeekFractionAt(point) {
        const mesh = this._vrSeek && this._vrSeek.mesh;
        if (!mesh || !point) return null;
        const inverse = mesh.getWorldMatrix().clone().invert();
        const local = BABYLON.Vector3.TransformCoordinates(point, inverse);
        const { left, right, width } = VRClubUI.VR_SEEK_BAR_PX;
        const px = (local.x / this._vrSeek.width + 0.5) * width;
        return Math.min(1, Math.max(0, (px - left) / (right - left)));
    }

    _drawVRSeekBar() {
        if (!this._vrSeek) return;
        const { left, right, width, height } = VRClubUI.VR_SEEK_BAR_PX;
        const ctx = this._vrSeek.texture.getContext();
        const info = this.getPlaybackInfo();
        const drag = this._vrSeek.drag;
        const fraction = drag ? drag.fraction : (info.seekable ? info.position / info.duration : 0);
        const shownSeconds = drag ? drag.fraction * info.duration : info.position;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#10161f';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = info.seekable ? '#8fffee' : '#4a5363';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, width - 6, height - 6);

        // What is playing, and whose.
        const title = this.nowPlayingLabel || 'Nothing playing';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let shown = title;
        while (shown.length > 4 && ctx.measureText(shown).width > right - left) shown = `${shown.slice(0, -2)}\u2026`;
        ctx.fillText(shown, left, 42);

        // The bar.
        const y = 112, h = 24;
        ctx.fillStyle = '#2a3342';
        ctx.fillRect(left, y - h / 2, right - left, h);
        if (info.seekable) {
            const x = left + fraction * (right - left);
            ctx.fillStyle = drag ? '#ffd166' : '#16c7b4';
            ctx.fillRect(left, y - h / 2, x - left, h);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, 22, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#c5cad4';
        ctx.font = '30px sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        const clock = window.AudioUtils ? window.AudioUtils.formatClock : (s => String(Math.floor(s)));
        if (info.seekable) {
            ctx.fillText(clock(shownSeconds), left, 178);
            ctx.textAlign = 'right';
            ctx.fillText(clock(info.duration), right, 178);
        } else {
            ctx.fillText(this._audioKind ? 'Live stream: no position to seek' : 'Pick a podcast to start', left, 178);
        }
        this._vrSeek.texture.update();
    }

    _startVRMusicTicker() {
        if (this._vrMusicTicker || this._disposed) return;
        // Twice a second is plenty for a clock; it runs only while the menu is open on the Music page.
        this._vrMusicTicker = setInterval(() => {
            const open = this._vrQuickMenuRoot && this._vrQuickMenuRoot.isEnabled() && this._vrQuickMenuPage === 'music';
            if (!open) { this._stopVRMusicTicker(); return; }
            this._drawVRSeekBar();
            this._vrQuickMenuButtons.forEach(button => {
                if (button.action === 'playPause') this._drawVRQuickMenuButton(button);
            });
        }, 500);
    }

    _stopVRMusicTicker() {
        if (this._vrMusicTicker) clearInterval(this._vrMusicTicker);
        this._vrMusicTicker = null;
    }

    _beginVRSeek(pickResult) {
        if (!this.guardHostControl('music')) return;
        const info = this.getPlaybackInfo();
        if (!info.seekable) {
            this.showErrorMessage('Nothing to seek in: a live stream has no position.');
            return;
        }
        const fraction = this._vrSeekFractionAt(pickResult.pickedPoint);
        if (fraction === null) return;
        this._vrSeek.drag = { fraction };
        this.pulseHaptic(0.5, 20);
        this._drawVRSeekBar();
    }

    _moveVRSeek(pickResult) {
        const drag = this._vrSeek && this._vrSeek.drag;
        if (!drag || !pickResult || !pickResult.hit || pickResult.pickedMesh !== this._vrSeek.mesh) return;
        const fraction = this._vrSeekFractionAt(pickResult.pickedPoint);
        if (fraction === null || Math.abs(fraction - drag.fraction) < 0.002) return;
        drag.fraction = fraction;
        this._drawVRSeekBar();
    }

    _endVRSeek() {
        const drag = this._vrSeek && this._vrSeek.drag;
        if (!drag) return;
        this._vrSeek.drag = null;
        this.seekAudioFraction(drag.fraction);
        this.pulseHaptic(0.7, 30);
        this._drawVRSeekBar();
    }

    /** Music page actions: run on whichever podcast player the DOM script attached (the same one the Audio menu uses). */
    async _runVRMusicAction(button) {
        if (!this.guardHostControl('music')) return;
        const player = this.podcastPlayer;
        if (button.action === 'seek') {
            if (!this.seekAudioBy(button.delta)) this.showErrorMessage('Nothing to seek in.');
        } else if (button.action === 'playPause') {
            this.toggleAudioPlayback();
        } else if (!player) {
            this.showErrorMessage('The music player is not ready yet.');
        } else {
            const podcast = window.Podcasts.get(button.action === 'podcast' ? button.podcast : player.selectedId());
            this.showErrorMessage(`Finding ${podcast.artist}'s set\u2026`);
            try {
                if (button.action === 'podcast') await player.switchTo(button.podcast);
                else if (button.action === 'randomEpisode') await player.playRandom();
                else await player.playLatest();
            } catch (err) {
                this.showErrorMessage(`Could not start the music: ${err && err.message ? err.message : 'unknown error'}`);
            }
        }
        this.pulseHaptic(0.6, 30);
        this._refreshVRQuickMenu();
    }

    _refreshVRQuickMenu() {
        if (!this._vrQuickMenuButtons) return;
        this._showVRQuickMenuPage(this._vrQuickMenuPage || 'home');
    }

    // ---- ONLINE: the VR face of js/multiplayer.js ----------------------------------------------------------------
    // These pages only read and call the shared ClubMultiplayer (the DOM panel drives the same object), so a person
    // can connect, talk, gesture, block, mute, and (as host) kick, ban or lock without leaving the headset.

    /** The session, created on first use if the DOM script has not (it normally has). */
    _multiplayer() {
        if (this.multiplayer) return this.multiplayer;
        return typeof ClubMultiplayer !== 'undefined' ? new ClubMultiplayer(this) : null;
    }

    static get VR_NET_PAGES() { return ['online', 'gestures', 'chat', 'people', 'person', 'safety', 'room', 'look']; }

    /** The five pages' buttons. Names come from other guests, so they are shortened and never interpreted. */
    _vrNetPageDefinitions(page, common) {
        const mp = this._multiplayer();
        const back = (target) => ({ ...common.back, target });
        const net = (label, op, extra = {}) => ({ label, action: 'net', op, ...extra });
        if (!mp) return [common.back, common.close];
        if (page === 'online') {
            return [
                net('NETWORK', 'connection'),
                net('MIC', 'mic'),
                { label: 'LOOK', action: 'page', target: 'look', op: 'avatar' },
                { label: 'GESTURES', action: 'page', target: 'gestures' },
                { label: 'PEOPLE', action: 'page', target: 'people', op: 'peopleCount' },
                { label: 'SAFETY', action: 'page', target: 'safety' },
                net('NEW PRIVATE ROOM', 'privateRoom'),
                { label: 'JOIN ROOM', action: 'page', target: 'room' },
                net('PUBLIC LOBBY', 'lobby'),
                net('LISTEN ALONG', 'listenAlong'),
                common.back,
                common.close
            ];
        }
        if (page === 'look') {
            // Whom the relay may hand you as a random look, then a fresh roll from that pool.
            return [
                net('WOMEN', 'pool', { pool: 'women' }),
                net('MEN', 'pool', { pool: 'men' }),
                net('ANYONE', 'pool', { pool: 'any' }),
                net('NEW LOOK', 'avatar'),
                back('online'),
                common.close
            ];
        }
        if (page === 'room') {
            const digit = (d) => ({ label: d, action: 'net', op: 'digit', digit: d });
            const typed = (this._vrRoomDigits || '').length > 0;
            return [...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(digit),
                { label: typed ? '\u2190 DELETE' : '\u2190 BACK', action: 'net', op: 'roomBack' }, common.close];
        }
        if (page === 'gestures') {
            const emoji = ClubMultiplayer.EMOJI.filter(item => item !== '\u{1F57A}').map(item => ({ label: item, action: 'net', op: 'emoji', emoji: item }));
            return [
                net('WAVE', 'gesture', { gesture: 'wave' }),
                net('NOD', 'gesture', { gesture: 'nod' }),
                net('DANCE', 'gesture', { gesture: 'dance' }),
                ...emoji,
                back('online'),
                common.close
            ];
        }
        if (page === 'chat') {
            // No keyboard in a headset: one tap sends a ready-made message, shown in a bubble over your head.
            const phrases = ClubMultiplayer.QUICK_PHRASES.map(text => net(text.toUpperCase(), 'phrase', { phrase: text }));
            return [...phrases, back('home'), common.close];
        }
        if (page === 'safety') {
            return [
                net('PERSONAL SPACE', 'personalSpace'),
                net('LOWER MUSIC', 'duck'),
                net('NAME TAGS', 'nameTags'),
                net('MUTE ALL', 'muteAll'),
                net('LOCK ROOM', 'lock'),
                net('NOD TO NOD', 'autoNod'),
                net('UNBLOCK ALL', 'unblockAll'),
                net('LEAVE ROOM', 'leave', { danger: true }),
                back('online'),
                common.close
            ];
        }
        if (page === 'people') {
            const people = mp.people();
            const per = 9;
            const offset = Math.min(this._vrPeopleOffset || 0, Math.max(0, people.length - 1));
            const slice = people.slice(offset, offset + per);
            const rows = slice.map(person => ({ label: this._vrShortName(person.name), action: 'person', op: 'select', peer: person.id }));
            if (people.length > per) rows.push({ label: 'MORE \u25B8', action: 'net', op: 'morePeople' });
            return [...rows, back('online'), common.close];
        }
        // person: one guest, chosen from the list
        const person = mp.people().find(item => item.id === this._vrPerson);
        if (!person) return [back('people'), common.close];
        const armedFor = (op) => this._vrArmed && this._vrArmed.key === `${op}:${person.id}` && this._vrArmed.until > Date.now();
        const rows = [
            net(person.muted ? 'UNMUTE' : 'MUTE', 'peerMute', { peer: person.id }),
            net('BLOCK', 'peerBlock', { peer: person.id })
        ];
        if (mp.isHost()) {
            rows.push(net(armedFor('kick') ? 'SURE? KICK' : 'KICK', 'peerKick', { peer: person.id, danger: true }));
            rows.push(net(armedFor('ban') ? 'SURE? BAN' : 'BAN', 'peerBan', { peer: person.id, danger: true }));
        }
        return [...rows, back('people'), common.close];
    }

    _vrShortName(name) {
        const text = String(name || 'Guest');
        return text.length > 11 ? `${text.slice(0, 10)}\u2026` : text;
    }

    /** What the second line of the header says on the ONLINE pages: the room and who is in it, or whom the page is about. */
    _vrNetSubtitle(page) {
        if (!VRClubUI.VR_NET_PAGES.includes(page)) return '';
        const mp = this._multiplayer();
        if (!mp) return '';
        if (page === 'person') {
            const person = mp.people().find(item => item.id === this._vrPerson);
            return person ? this._vrShortName(person.name).toUpperCase() : '';
        }
        if (page === 'gestures') return mp.connected ? 'WAVE, NOD, DANCE OR SEND AN EMOJI' : 'JOIN A ROOM FIRST: ONLINE \u2192 NETWORK';
        if (page === 'chat') {
            if (!mp.connected) return 'JOIN A ROOM FIRST: ONLINE \u2192 NETWORK';
            const last = mp.chat.filter(entry => !entry.self).at(-1);
            return last ? `${this._vrShortName(last.name)}: ${last.text}`.toUpperCase().slice(0, 52) : 'TAP A MESSAGE TO SEND IT';
        }
        if (page === 'look') {
            return mp.avatarPool === 'any' ? 'RANDOM LOOK: ANYONE' : `RANDOM LOOK: ${mp.avatarPool.toUpperCase()}`;
        }
        if (page === 'room') {
            const digits = (this._vrRoomDigits || '').padEnd(6, '_');
            return `ROOM CODE  ${digits.slice(0, 3)} ${digits.slice(3)}`;
        }
        return mp.statusText().replace(/^In /, '').slice(0, 56).toUpperCase();
    }

    /** Which toggles are lit: a button is "on" when its setting is. */
    _vrNetActive(button) {
        const mp = this._multiplayer();
        if (!mp) return false;
        switch (button.op) {
            case 'connection': return mp.connected;
            case 'mic': return mp.micEnabled;
            case 'personalSpace': return mp.personalSpace;
            case 'nameTags': return mp.nameTags;
            case 'duck': return mp.duckForVoice;
            case 'muteAll': return mp.muteAll;
            case 'lock': return mp.locked;
            case 'autoNod': return mp.autoNod;
            case 'pool': return mp.avatarPool === button.pool;
            case 'gesture': return button.gesture === 'dance' && mp.dancing;
            case 'listenAlong': return !!mp.pendingMusicInfo();
            case 'peerMute': {
                const person = mp.people().find(item => item.id === button.peer);
                return !!(person && person.muted);
            }
            default: return false;
        }
    }

    /** The small second line on a button. */
    _vrNetValue(button, active) {
        const mp = this._multiplayer();
        if (!mp) return '';
        switch (button.op) {
            case 'connection': return mp.connected ? 'CONNECTED' : mp.connecting ? 'CONNECTING' : 'OFFLINE';
            case 'mic': return !mp.connected ? 'JOIN A ROOM FIRST' : active ? 'MIC ON' : 'MIC OFF';
            case 'chatUnread': return mp.chatUnread ? ` NEW` : '';
            case 'duck': return active ? 'WHILE TALKING' : 'OFF';
            case 'phrase': return !mp.connected ? 'JOIN A ROOM FIRST' : '';
            case 'avatar': return mp.selfAvatar ? (ClubMultiplayer.AVATAR_LABELS[mp.selfAvatar] || '').split(',')[0].toUpperCase() : '';
            case 'peopleCount': return mp.connected ? `${mp.client.peerCount} HERE` : '';
            case 'personalSpace': case 'muteAll': case 'autoNod': case 'nameTags': return active ? 'ON' : 'OFF';
            case 'lock': return !mp.isHost() ? 'HOST ONLY' : active ? 'LOCKED' : 'OPEN';
            case 'unblockAll': return `${mp.blockedList().length} BLOCKED`;
            case 'listenAlong': return active ? 'TAP TO JOIN' : '';
            case 'pool': return active ? 'SELECTED' : '';
            case 'gesture': return button.gesture === 'dance' ? (active ? 'DANCING' : '') : '';
            case 'select': {
                const person = mp.people().find(item => item.id === button.peer);
                if (!person) return '';
                return person.speaking ? 'SPEAKING' : person.muted ? 'MUTED' : person.isHost ? 'HOST' : '';
            }
            default: return '';
        }
    }

    /** One tap on an ONLINE button. Everything it does is a ClubMultiplayer call; this only says what happened. */
    async _runVRNetworkAction(button) {
        const mp = this._multiplayer();
        if (!mp) return;
        const needConnection = () => {
            if (mp.connected) return false;
            this.showErrorMessage('Join a room first: ONLINE \u2192 NETWORK');
            return true;
        };
        switch (button.op) {
            case 'connection': {
                const wasOn = mp.connected || mp.connecting;
                mp.toggleConnection();
                this.showErrorMessage(wasOn ? 'Left the room' : `Joining "${mp.currentRoom}"\u2026`);
                break;
            }
            case 'mic':
                if (needConnection()) break;
                this.showErrorMessage((await mp.toggleMic())
                    ? (mp.duckForVoice ? 'Microphone on: others hear you, and the music is lowered' : 'Microphone on: others hear you')
                    : 'Microphone off');
                break;
            case 'avatar':
                if (!needConnection()) { mp.rerollAvatar(); this.showErrorMessage('Picking a new look\u2026'); }
                break;
            case 'phrase':
                if (!needConnection() && mp.sendChat(button.phrase)) this.showErrorMessage(`Sent: ${button.phrase}`);
                break;
            case 'duck': mp.setDuckForVoice(!mp.duckForVoice); break;
            case 'pool':
                mp.setAvatarPool(button.pool);
                this.showErrorMessage(button.pool === 'any' ? 'Random looks: anyone' : `Random looks: ${button.pool}`);
                break;
            case 'privateRoom':
                mp.joinNewPrivateRoom();
                this.showErrorMessage(`Private room ${mp.currentRoom.replace('private-', '')}: tell friends this code (ONLINE \u2192 JOIN ROOM)`);
                break;
            case 'digit': {
                this._vrRoomDigits = ((this._vrRoomDigits || '') + button.digit).slice(0, 6);
                if (this._vrRoomDigits.length < 6) break;
                const code = this._vrRoomDigits;
                this._vrRoomDigits = '';
                mp.joinRoom(code);
                this.showErrorMessage(`Joining room ${code.slice(0, 3)} ${code.slice(3)}\u2026`);
                this._showVRQuickMenuPage('online');
                this.pulseHaptic(0.6, 30);
                return;
            }
            case 'roomBack':
                if (this._vrRoomDigits) { this._vrRoomDigits = this._vrRoomDigits.slice(0, -1); break; }
                this._showVRQuickMenuPage('online');
                return;
            case 'lobby':
                mp.joinLobby();
                this.showErrorMessage('Joining the public lobby\u2026');
                break;
            case 'listenAlong':
                if (mp.pendingMusicInfo()) mp.acceptListenAlong();
                else this.showErrorMessage('Nothing to listen along to right now');
                break;
            case 'gesture':
                if (!needConnection()) mp.sendGesture(button.gesture);
                break;
            case 'emoji':
                if (!needConnection()) mp.sendEmoji(button.emoji);
                break;
            case 'select':
                this._vrPerson = button.peer;
                this._showVRQuickMenuPage('person');
                this.pulseHaptic(0.45, 25);
                return;
            case 'morePeople': {
                const total = mp.people().length;
                this._vrPeopleOffset = ((this._vrPeopleOffset || 0) + 9) % Math.max(1, total);
                break;
            }
            case 'peerMute': mp.togglePeerMute(button.peer); break;
            case 'peerBlock': {
                const person = mp.people().find(item => item.id === button.peer);
                if (mp.blockPeer(button.peer)) this.showErrorMessage(`Blocked ${person ? person.name : 'guest'}: you will not see or hear each other`);
                this._vrPerson = null;
                this._showVRQuickMenuPage('people');
                this.pulseHaptic(0.7, 35);
                return;
            }
            case 'peerKick':
            case 'peerBan': {
                // Neither can be undone from here, so the first press arms the button and the second (within 4 s) acts.
                const kind = button.op === 'peerKick' ? 'kick' : 'ban';
                const key = `${kind}:${button.peer}`;
                if (!this._vrArmed || this._vrArmed.key !== key || this._vrArmed.until < Date.now()) {
                    this._vrArmed = { key, until: Date.now() + 4000 };
                    setTimeout(() => { if (!this._disposed) this._refreshVRQuickMenu(); }, 4100);
                    break;
                }
                this._vrArmed = null;
                if (kind === 'kick') mp.kickPeer(button.peer); else mp.banPeer(button.peer);
                this.showErrorMessage(kind === 'kick' ? 'Guest removed from the room' : 'Guest banned from this room');
                this._vrPerson = null;
                this._showVRQuickMenuPage('people');
                this.pulseHaptic(0.8, 40);
                return;
            }
            case 'personalSpace': mp.setPersonalSpace(!mp.personalSpace); break;
            case 'nameTags': mp.setNameTags(!mp.nameTags); break;
            case 'muteAll': mp.setMuteAll(!mp.muteAll); break;
            case 'autoNod': mp.setAutoNod(!mp.autoNod); break;
            case 'lock':
                if (!mp.isHost()) this.showErrorMessage('Only the host can lock the room');
                else mp.setLocked(!mp.locked);
                break;
            case 'unblockAll': {
                const count = mp.unblockAll();
                this.showErrorMessage(count ? `Unblocked ${count} guest${count === 1 ? '' : 's'}` : 'Nobody is blocked');
                break;
            }
            case 'leave':
                mp.disconnect();
                this.showErrorMessage('Left the room');
                break;
            default: break;
        }
        this.pulseHaptic(0.6, 30);
        this._refreshVRQuickMenu();
    }

    _activateVRQuickMenuButton(button) {
        if (!button) return;
        if (button.action === 'close') {
            this.toggleVRQuickMenu(false);
            return;
        }
        if (button.action === 'page') {
            // Remember where this page was opened from, so its BACK returns there (REACT is reached from HOME and ONLINE).
            this._vrPageParent = { ...(this._vrPageParent || {}), [button.target]: this._vrQuickMenuPage || 'home' };
            this._showVRQuickMenuPage(button.target);
            this.pulseHaptic(0.45, 25);
            return;
        }
        if (button.action === 'back') {
            const parent = this._vrPageParent && this._vrPageParent[this._vrQuickMenuPage];
            this._showVRQuickMenuPage(parent || button.target || 'home');
            this.pulseHaptic(0.35, 20);
            return;
        }
        if (button.action === 'net' || button.action === 'person') {
            this._runVRNetworkAction(button);
            return;
        }
        if (['seek', 'playPause', 'podcast', 'randomEpisode', 'latestEpisode'].includes(button.action)) {
            this._runVRMusicAction(button);
            return;
        }
        if (button.action === 'travel') {
            this.moveCameraToPreset(button.control);
            this.toggleVRQuickMenu(false);
            return;
        }
        if (button.action === 'quality') {
            const tiers = ['balanced', 'high', 'ultra'];
            this.setGraphicsTier(tiers[(tiers.indexOf(this.graphicsTier) + 1) % tiers.length]);
            this.pulseHaptic(0.7, 35);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'reset') {
            if (!this.guardHostControl('lights')) return;
            this.resetVJControls();
            this.showErrorMessage('Light show reset to defaults');
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'autoShow') {
            if (!this.guardHostControl('lights')) return;
            this.resumeAutoShow();
            this.showErrorMessage('NOCTURNE auto show resumed');
            this._refreshVRQuickMenu();
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
        if (button.action === 'people') {
            // Who is in the club: personal and local, so it is never gated on the host.
            const here = this.togglePeopleVisible(button.people);
            const who = button.people === 'all' ? 'Everyone'
                : button.people === 'dj' ? 'The DJ'
                : button.people === 'dancers' ? 'The dancers' : 'The bystanders';
            this.showErrorMessage(here ? `${who}: back in the club` : `${who}: sent home`);
            this.pulseHaptic(0.6, 30);
            this._refreshVRQuickMenu();
            return;
        }

        // The remaining show controls are host-owned in someone else's room (the legacy "lights" guard name is
        // retained for multiplayer protocol compatibility).
        if (!this.guardHostControl('lights')) return;
        if (this.toggleLightControl(button.control)) this.pulseHaptic(0.7, 35);
        this._refreshVRQuickMenu();
    }

    _createVRQuickMenu() {
        if (this._vrQuickMenuRoot) return;
        const root = new BABYLON.TransformNode('vrQuickMenuRoot', this.scene);
        const panel = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuPanel', {
            width: 1.62,
            height: 1.72,
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

        const header = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuHeader', {
            width: 1.48,
            height: 0.28,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        header.parent = root;
        header.position.set(0, 0.65, -0.012);
        header.isPickable = false;
        const headerTexture = new BABYLON.DynamicTexture(
            'vrQuickMenuHeaderTexture',
            { width: 1024, height: 192 },
            this.scene,
            false
        );
        const headerMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuHeaderMat', {
            emissiveColor: [0, 0, 0],
            emissiveTexture: headerTexture,
            disableLighting: true
        });
        headerMaterial.backFaceCulling = false;
        header.material = headerMaterial;
        this._vrQuickMenuHeaderTexture = headerTexture;

        // The seek bar: a wide strip where the Music page's first button row would be.
        const seekWidth = 1.48;
        const seekMesh = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuSeek', {
            width: seekWidth,
            height: 0.28,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        seekMesh.parent = root;
        seekMesh.position.set(0, 0.34, -0.012);
        seekMesh.isPickable = true;
        seekMesh.renderingGroupId = 2;
        const seekTexture = new BABYLON.DynamicTexture('vrQuickMenuSeekTexture', { width: 1024, height: 192 }, this.scene, false);
        const seekMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuSeekMat', {
            emissiveColor: [0, 0, 0],
            emissiveTexture: seekTexture,
            disableLighting: true
        });
        seekMaterial.backFaceCulling = false;
        seekMesh.material = seekMaterial;
        seekMesh.setEnabled(false);
        this._vrSeek = { mesh: seekMesh, texture: seekTexture, width: seekWidth, drag: null };

        this._vrQuickMenuButtons = [];
        for (let index = 0; index < 12; index++) {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const mesh = BABYLON.MeshBuilder.CreatePlane(`vrQuickMenuButton${index}`, {
                width: 0.46,
                height: 0.27,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            }, this.scene);
            mesh.parent = root;
            mesh.position.set((col - 1) * 0.50, 0.36 - row * 0.36, -0.012);
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
                label: '',
                control: null,
                action: null
            };
            this._vrQuickMenuButtons.push(button);
        }
        this._showVRQuickMenuPage('home');
        root.setEnabled(false);
        this._vrQuickMenuRoot = root;
        // The ONLINE pages show live state (who joined, who is speaking): redraw them when the session changes.
        const mp = this._multiplayer();
        if (mp) {
            let wasFollowing = mp.following;
            this._vrNetUnsubscribe = mp.onChange(() => {
                const open = this._vrQuickMenuRoot && this._vrQuickMenuRoot.isEnabled();
                const roleChanged = wasFollowing !== mp.following;
                wasFollowing = mp.following;
                // Taking or losing the host's lights and music relabels the lighting and music buttons too, and HOME
                // shows the mic, the unread chat count and (only in a room) the TALK / REACT / CHAT row.
                const page = this._vrQuickMenuPage;
                if (open && (roleChanged || page === 'home' || VRClubUI.VR_NET_PAGES.includes(page))) this._refreshVRQuickMenu();
            });
        }
    }

    toggleVRQuickMenu(force) {
        this._createVRQuickMenu();
        const camera = this.isInVRMode
            ? this.vrHelper?.baseExperience?.camera : this.scene.activeCamera;
        if (!camera) return false;
        const next = force === undefined ? !this._vrQuickMenuRoot.isEnabled() : !!force;
        if (next) this._placeVRQuickMenu(camera);
        if (next) this._refreshVRQuickMenu();
        if (!next) this._stopVRMusicTicker();
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

    /**
     * Pointer routing for everything pickable in the world: the VR quick menu, its seek bar and the VJ desk at the
     * DJ table (js/vjDesk.js), whose two touch panels and faders answer a mouse click and a controller ray alike.
     */
    setupVJControlInteraction() {
        this.scene.onPointerDown = (evt, pickResult) => {
            if (!pickResult || !pickResult.hit || !pickResult.pickedMesh) return;
            const vrMenuButton = this._vrQuickMenuButtons &&
                this._vrQuickMenuButtons.find(button => button.mesh === pickResult.pickedMesh);
            if (this._vrSeek && pickResult.pickedMesh === this._vrSeek.mesh) {
                this._beginVRSeek(pickResult);
                return;
            }
            if (vrMenuButton) {
                this._activateVRQuickMenuButton(vrMenuButton);
                return;
            }
            if (typeof this.pressVJDesk === 'function') this.pressVJDesk(pickResult);
        };

        this.scene.onPointerUp = () => {
            this._endVRSeek();
            if (typeof this.releaseVJDesk === 'function') this.releaseVJDesk();
        };

        this.scene.onPointerMove = (evt, pickResult) => {
            this._moveVRSeek(pickResult);
            if (typeof this.dragVJDesk === 'function') this.dragVJDesk(pickResult);
        };
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
        this.nowPlayingLabel = url; // a podcast episode replaces this with its title once it has started
        return this._playAudio(url, 'stream', url, { loop: !options.onDemand });
    }

    startAudioFromFile(file) {
        log.info(`🎵 Loading audio file: ${file.name}`);
        const fileUrl = URL.createObjectURL(file);
        this.nowPlayingLabel = file.name;
        return this._playAudio(fileUrl, 'file', file.name);
    }

    // =========================================================================
    // PLAYBACK POSITION
    //
    // Shared by the desktop Audio menu's slider and the VR menu's seek bar: both read getPlaybackInfo() and
    // write through seekAudioTo(), so a seek means the same thing on either surface (including telling the
    // room when this guest is its host).
    // =========================================================================

    /**
     * Where the music is. `seekable` is false for a live stream (its duration is Infinity) and when nothing is loaded.
     * @returns {{ seekable: boolean, position: number, duration: number, playing: boolean }}
     */
    getPlaybackInfo() {
        const audio = this.audioElement;
        if (!audio) return { seekable: false, position: 0, duration: 0, playing: false };
        const duration = audio.duration;
        const seekable = Number.isFinite(duration) && duration > 0 && !!audio.seekable && audio.seekable.length > 0;
        return {
            seekable,
            position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
            duration: seekable ? duration : 0,
            playing: !audio.paused && !audio.ended
        };
    }

    /** Jump to `seconds` (clamped to the audio). Returns false when there is nothing to seek in. */
    seekAudioTo(seconds) {
        if (!this.guardHostControl('music')) return false;
        const info = this.getPlaybackInfo();
        if (!info.seekable || !Number.isFinite(seconds)) return false;
        // Stay just inside the end: seeking to the very end fires 'ended' and starts the next episode.
        this.audioElement.currentTime = Math.min(Math.max(0, seconds), Math.max(0, info.duration - 1));
        this._shareAudioPosition();
        return true;
    }

    /** Jump to a fraction (0..1) of the audio's length. */
    seekAudioFraction(fraction) {
        const info = this.getPlaybackInfo();
        return info.seekable && Number.isFinite(fraction) ? this.seekAudioTo(Math.min(1, Math.max(0, fraction)) * info.duration) : false;
    }

    /** Go forward (positive) or back (negative) by `delta` seconds. */
    seekAudioBy(delta) {
        const info = this.getPlaybackInfo();
        return info.seekable ? this.seekAudioTo(info.position + delta) : false;
    }

    /** Play or pause what is loaded. Returns true when it is now playing. */
    toggleAudioPlayback() {
        if (!this.guardHostControl('music')) return false;
        const audio = this.audioElement;
        if (!audio || !audio.src) {
            this.showErrorMessage('Nothing is playing yet. Pick a podcast.');
            return false;
        }
        if (audio.paused) {
            if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
            audio.play().catch(() => this.showErrorMessage('Playback was blocked. Press Play again.'));
        } else {
            audio.pause();
        }
        this._shareAudioPosition(!audio.paused);
        return !audio.paused;
    }

    /** The room's host publishes the position after a seek or a pause, so listeners follow (guests cannot publish). */
    _shareAudioPosition(playing) {
        const net = this.networkManager;
        const audio = this.audioElement;
        if (!net || !net.connected || !net.isHost() || !audio || this._audioKind !== 'stream' || !this._audioStreamUrl) return;
        net.sendMusic({
            url: this._audioStreamUrl,
            playing: playing === undefined ? !audio.paused : playing,
            position: audio.currentTime
        });
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
        // Never camera gravity in the headset: its collision ellipsoid hangs from the EYE, so gravity sank the eye
        // to 0.8 m and fought the walking-surface follow every frame (no stair could be climbed). The follow
        // (_updateVRWalkSurface) owns the headset's height on the floor, the stair, the balcony and the DJ riser.
        if (xrCamera) xrCamera.applyGravity = false;
        if (xrCamera && this.vrComfortMode) {
            xrCamera.cameraDirection?.set(0, 0, 0);
            xrCamera.cameraRotation?.set(0, 0);
        }
        if (this.vrComfortMode && this.jumpState) this.jumpState.active = false;
        if (typeof document !== 'undefined') {
            const splashState = document.getElementById('splashVRComfortState');
            const splashBtn = document.getElementById('splashVRComfortBtn');
            if (splashBtn) splashBtn.setAttribute('aria-pressed', String(this.vrComfortMode));
            if (splashState) splashState.textContent = this.vrComfortMode ? 'ON' : 'OFF';
            const button = document.getElementById('vjVRComfortBtn');
            if (button) {
                button.setAttribute('aria-pressed', String(this.vrComfortMode));
                button.classList.toggle('active', this.vrComfortMode);
            }
        }
        this._refreshVRQuickMenu();
        return this.vrComfortMode;
    }

    /** Surfaces the VR teleport arc may land on: the club floor, the balcony deck and stair, the entrance's floors and stair, and the street. */
    _teleportFloorMeshes() {
        return [this.floorMesh, this._mezzDeck, this._vestibuleFloor, this._vestibuleStair, ...(this._cityGround || [])].filter(Boolean);
    }

    _teleportBlockerMeshes() {
        const floors = this._teleportFloorMeshes();
        return this.scene.meshes.filter(mesh => mesh.checkCollisions && mesh.isEnabled() && !floors.includes(mesh));
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
            movementOrientationFollowsViewerPose: true,
            movementOrientationFollowsController: false,
            // Reuse Babylon's dead-zone handlers, swapping its default right-walk/left-turn layout.
            customRegistrationConfigurations: BABYLON.WebXRControllerMovement.REGISTRATIONS.default.map(registration => ({
                ...registration,
                forceHandedness: registration.forceHandedness === 'left' ? 'right' : 'left'
            }))
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
                // Use the same geometry as walking, excluding walkable floors. This includes
                // the vestibule, bar, rails and equipment added after the original room.
                if (typeof teleport.addBlockerMesh === 'function' && this.scene) {
                    for (const mesh of this._xrTeleportBlockers || []) teleport.removeBlockerMesh(mesh);
                    this._xrTeleportBlockers = this._teleportBlockerMeshes();
                    for (const mesh of this._xrTeleportBlockers) {
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
        // The club is a basement: the street and the top of the entrance stair are at street level.
        const street = (window.VenueLayout && window.VenueLayout.vestibule.streetLevel) || 0;
        const presets = {
            // At the top of the entrance stair (the street-level landing), looking down it into the club.
            arrival: { label: 'Arrival', pos: new BABYLON.Vector3(0, street + 1.7, 5.5), target: new BABYLON.Vector3(0, 1.2, -12), level: street },
            danceFloor: { label: 'Dance Floor', pos: new BABYLON.Vector3(-2.8, 1.7, -9.2), target: new BABYLON.Vector3(0, 2.6, -18.5) },
            // Eye height for someone standing on the 0.5 m riser, inside the 1 m
            // gap between the LED wall (z=-20) and the deck plinth (z=-19), facing out.
            djBooth: { label: 'DJ Booth', pos: new BABYLON.Vector3(0, 2.2, -19.4), target: new BABYLON.Vector3(0, 1.7, -10) },
            lightingGallery: { label: 'Lighting Gallery', pos: new BABYLON.Vector3(10, 5.2, -6.5), target: new BABYLON.Vector3(0, 2.4, -15.5) },
            // Standing on the steel mezzanine (deck at y 3), looking across the dance floor to the booth.
            balcony: { label: 'Balcony', pos: new BABYLON.Vector3(-10.9, 4.7, -12.4), target: new BABYLON.Vector3(1, 2.7, -16), level: 3.0 },
            // On the pavement outside the street door, looking across the avenue at the far row of buildings.
            street: { label: 'Street', pos: new BABYLON.Vector3(0, street + 1.7, 8.2), target: new BABYLON.Vector3(0, street + 8, 30), level: street }
        };
        
        const p = presets[preset];
        if (preset === 'street' && !(this._streetDoor && this._streetDoor.open)) {
            this.showErrorMessage('The street is not available yet.');
            return;
        }
        if (p) {
            const xrCamera = this.isInVRMode ? this.vrHelper?.baseExperience?.camera : null;
            if (xrCamera) {
                const height = this._xrHeadHeight();
                if (!Number.isFinite(height)) {
                    this.showErrorMessage('Head tracking is not ready. Please try the destination again.');
                    return;
                }
                xrCamera.position.x = p.pos.x;
                xrCamera.position.z = p.pos.z;
                xrCamera.position.y = height + (preset === 'djBooth' ? 0.5 : (p.level || 0));
                if (xrCamera._deferOnly && xrCamera._deferredUpdated) xrCamera._deferredPositionUpdate.copyFrom(xrCamera.position);
                if (this.jumpState) this.jumpState.active = false;
            } else {
                this.camera.position.copyFrom(p.pos);
                this.camera.setTarget(p.target);
            }
            this._walkLevel = p.level || 0;
            this._vrFallSpeed = 0;
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
