'use strict';

class VRClubControls extends VRClubAnimationFinish {
    static isLocalAudioFile(file) {
        return !!file && (
            String(file.type || '').toLowerCase().startsWith('audio/') ||
            /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i.test(String(file.name || ''))
        );
    }

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
        vrButton.hidden = true;

        const setLabel = (text, inSession) => {
            vrButton.textContent = text;
            vrButton.classList.toggle('in-session', !!inSession);
        };

        const supported = navigator.xr && typeof navigator.xr.isSessionSupported === 'function'
            ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false)
            : Promise.resolve(false);
        supported.then(ok => {
            this._vrAvailable = !!(ok && vrHelper?.baseExperience);
            if (!this._disposed) vrButton.hidden = !this._vrAvailable;
        });

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

        const entryCheck = Promise.all([supported, entryReady]);
        // Immersive launch (js/immersiveLaunch.js) waits on this instead of the button: true when VR can be entered now.
        this._vrEntryReady = entryCheck.then(([ok]) => !!(ok && vrHelper && vrHelper.baseExperience));
        entryCheck.then(([ok]) => {
            if (this._disposed) return;
            if (!ok || !vrHelper || !vrHelper.baseExperience) {
                vrButton.hidden = true;
                vrButton.disabled = true;
                vrButton.title = 'No VR headset detected. Connect via Link/Air Link, or open this page in the Quest browser.';
                setLabel('\u{1F97D} VR unavailable', false);
                return;
            }
            vrButton.hidden = false;
            vrButton.disabled = false;
            if (!this.isInVRMode) setLabel('\u{1F97D} Enter VR', false);
        });

        this._onVRButtonClick = async () => {
            const base = vrHelper && vrHelper.baseExperience;
            if (!base) {
                this.showErrorMessage('VR unavailable. Connect your headset via Link/Air Link, or open this page in the Quest browser.');
                return;
            }
            const payment = window.VRPayment;
            if (!this.isInVRMode && payment && !(payment.canEnterVR ? payment.canEnterVR() : payment.hasEntitlement())) {
                window.VRPayment.showGate();
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
            this.scene?.onDisposeObservable?.add(() => window.VRPayment?.dispose?.());
            window.VRPayment?.setXRHandlers?.(
                () => vrHelper.baseExperience.exitXRAsync(),
                message => this.showErrorMessage(message)
            );
            this._vrButtonStateObserver = vrHelper.baseExperience.onStateChangedObservable.add(state => {
                const inSession = state === BABYLON.WebXRState.IN_XR;
                if (inSession || state === BABYLON.WebXRState.NOT_IN_XR) {
                    window.VRPayment?.onXRStateChange?.(inSession);
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
        if (what === 'music' && this.multiplayer?.hasLiveEvent) {
            this.showErrorMessage('The live event DJ controls the music. Leave the event to play your own set.');
            return false;
        }
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
        if (this.colorLockActive) {
            if (this.vjDirector && typeof this.vjDirector.setLedHarmony === 'function') this.vjDirector.setLedHarmony('match');
            this._setMirrorBallColor(this.currentSpotColor);
        }
        return this.currentSpotColor;
    }

    /** Advance the shared beam-laser colour. The laser sheet reads the same source. */
    cycleLaserColor() {
        this.colorLockActive = false;
        this.currentColorIndex = ((this.currentColorIndex || 0) + 1) % 3;
        this.colorSwitchTime = performance.now() / 1000;
        return typeof this._laserColor === 'function' ? this._laserColor() : null;
    }

    /** Apply one palette colour to every light and a single-colour LED-wall show. */
    matchAllLightColors(advance = true) {
        const colour = advance ? this.cycleSpotColor() : this.currentSpotColor;
        if (!colour) return null;
        this.colorLockActive = true;
        this.ledMonochrome = false;
        this.ledMulti = false;
        // Breathing is the playlist's full-wall, handed-colour look. Holding this
        // index prevents hue-synthesising rainbow patterns from defeating MATCH ALL.
        this.ledPattern = 5;
        this.ledPatternSwitchTime = performance.now() / 1000;
        if (this.vjDirector && typeof this.vjDirector.setLedHarmony === 'function') {
            this.vjDirector.setLedHarmony('match');
        } else {
            this.ledShowColor = colour;
        }
        this._setMirrorBallColor(colour);
        return colour;
    }

    /** Write an exact mirror-ball colour without stepping its independent palette. */
    _setMirrorBallColor(colour) {
        this.mirrorBallSpotlightColor = colour;
        if (this.mirrorBallSpotlights) {
            this.mirrorBallSpotlights.forEach(light => { if (light) light.diffuse = colour.clone(); });
        }
        if (this.mirrorBallBeams) {
            this.mirrorBallBeams.forEach(beam => { beam.material.emissiveColor = colour.clone(); });
        }
        if (this.mirrorBallHousings) {
            this.mirrorBallHousings.forEach(housing => {
                housing.material.emissiveColor.set(0, 0, 0);
                housing.lensMaterial.emissiveColor = colour.scale(5.0);
                housing.sourceMaterial.emissiveColor = colour.scale(8.0);
                housing.flareMaterial.emissiveColor = colour.scale(3.0);
            });
        }
        if (this.mirrorReflectionBatch) {
            this.mirrorReflectionBatch.spotMat.emissiveColor.copyFrom(colour);
            this.mirrorReflectionBatch.rayMat.emissiveColor.copyFrom(colour);
        }
        this.mirrorBallCachedColorSource = null;
    }

    /** Advance the mirror-ball palette and push it to every dependent surface. */
    cycleMirrorBallColor() {
        this.mirrorBallColorIndex = (this.mirrorBallColorIndex + 1) % this.mirrorBallColors.length;
        const colour = this.mirrorBallColors[this.mirrorBallColorIndex];
        this._setMirrorBallColor(colour);
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
            return 'Mirror ball takes the room \u2014 lasers, laser sheet and spots off';
        }
        if (control === 'laserSheetActive' && this.laserSheetActive) {
            this.lasersActive = false;
            this.mirrorBallActive = false;
            this.lightsActive = false;
            return 'Laser sheet takes the room \u2014 lasers, mirror ball and spots off';
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
        return this._spotPatternNames || (this._spotPatternNames = Object.freeze(['RANDOM', 'STATIC DOWN', 'MIRROR SWEEP', 'CROSSED BEAMS', 'INDEPENDENT', 'ROW WAVE', 'ROW FANS', 'ROW CALL / RESPONSE']));
    }

    static get SPOT_GROUPS() {
        return this._spotGroups || (this._spotGroups = Object.freeze([
            ['ALL SIX', [0, 1, 2, 3, 4, 5]], ['ENTRANCE ROW', [0, 3]], ['MIDDLE ROW', [1, 4]], ['DJ ROW', [2, 5]],
            ['LEFT SIDE', [0, 1, 2]], ['RIGHT SIDE', [3, 4, 5]],
            ['ENTRANCE LEFT', [0]], ['MIDDLE LEFT', [1]], ['DJ LEFT', [2]],
            ['ENTRANCE RIGHT', [3]], ['MIDDLE RIGHT', [4]], ['DJ RIGHT', [5]]
        ].map(([name, heads]) => Object.freeze({ name, heads: Object.freeze(heads) }))));
    }

    static get SPOT_MOTIONS() {
        return this._spotMotions || (this._spotMotions = Object.freeze(['USE MAIN AIM PATH', 'INDEPENDENT', 'STATIC DOWN', 'MIRROR SWEEP', 'CROSSED BEAMS', 'ROW WAVE', 'ROW FANS', 'ROW CALL / RESPONSE']));
    }

    static get SPOT_SEQUENCES() {
        return this._spotSequences || (this._spotSequences = Object.freeze(['ALL TOGETHER', 'ONE SPOT AT A TIME', 'ONE ROW AT A TIME', 'ONE SIDE AT A TIME', 'ADD ROWS', 'ADD SIDES', 'ADD SPOTS']));
    }

    static get SPOT_RIG_CONTROLS() {
        return this._spotRigControls || (this._spotRigControls = Object.freeze({
            cycleSpotTarget: 'CHOOSE SPOTS', toggleSpotGroup: 'SELECTED ON/OFF', cycleSpotGroupColor: 'SELECTED COLOUR',
            cycleSpotGroupMotion: 'SELECTED AIM PATH', cycleSpotSequence: 'ORDER: ALL SPOTS', cycleSpotSequenceRate: 'ORDER STEP EVERY',
            resetSpotRig: 'RESET ALL SPOTS'
        }));
    }

    resetSpotRig() {
        this.spotSequence = 0;
        this.spotSequenceRate = 2;
        for (let i = 0; i < 6; i++) {
            this[`spotHead${i}Enabled`] = true;
            this[`spotHead${i}Color`] = -1;
            this[`spotHead${i}Motion`] = 0;
        }
    }

    selectSpotRigGroup(target) {
        if (!Number.isInteger(target) || !VRClubUI.SPOT_GROUPS[target]) {
            this.showErrorMessage('That spotlight selection is unavailable.');
            return false;
        }
        this._spotEditTarget = target;
        return true;
    }

    /** One validated edit path for heads, rows and columns on every control surface. */
    setSpotGroup(target, patch) {
        if (!this.guardHostControl('lights')) return false;
        const group = VRClubUI.SPOT_GROUPS[target];
        if (!Number.isInteger(target) || !group || !patch || typeof patch !== 'object' ||
            Object.keys(patch).some(key => !['enabled', 'color', 'motion'].includes(key)) ||
            ('enabled' in patch && typeof patch.enabled !== 'boolean') ||
            ('color' in patch && (!Number.isInteger(patch.color) || patch.color < -1 || patch.color >= this.spotColorList.length)) ||
            ('motion' in patch && (!Number.isInteger(patch.motion) || patch.motion < 0 || patch.motion >= VRClubUI.SPOT_MOTIONS.length))) {
            this.showErrorMessage('That spotlight group setting is unavailable.');
            return false;
        }
        for (const i of group.heads) {
            if ('enabled' in patch) this[`spotHead${i}Enabled`] = patch.enabled;
            if ('color' in patch) this[`spotHead${i}Color`] = patch.color;
            if ('motion' in patch) this[`spotHead${i}Motion`] = patch.motion;
        }
        if ('color' in patch && patch.color >= 0) this.colorLockActive = false;
        this.takeLightControl();
        return true;
    }

    spotRigControlValue(control) {
        const group = VRClubUI.SPOT_GROUPS[this._spotEditTarget || 0];
        const common = suffix => {
            const value = this[`spotHead${group.heads[0]}${suffix}`] ?? (suffix === 'Enabled' ? true : suffix === 'Color' ? -1 : 0);
            return group.heads.every(i => (this[`spotHead${i}${suffix}`] ?? (suffix === 'Enabled' ? true : suffix === 'Color' ? -1 : 0)) === value) ? value : null;
        };
        if (control === 'cycleSpotTarget') return group.name;
        if (control === 'cycleSpotSequence') return VRClubUI.SPOT_SEQUENCES[this.spotSequence || 0];
        if (control === 'cycleSpotSequenceRate') return `${this.spotSequenceRate || 2} BEAT${this.spotSequenceRate === 1 ? '' : 'S'}`;
        if (control === 'resetSpotRig') return 'ALL ON / MAIN SETTINGS';
        const value = common(control === 'toggleSpotGroup' ? 'Enabled' : control === 'cycleSpotGroupColor' ? 'Color' : 'Motion');
        if (value === null) return 'MIXED';
        if (control === 'toggleSpotGroup') return value ? 'ON' : 'OFF';
        if (control === 'cycleSpotGroupMotion') return VRClubUI.SPOT_MOTIONS[value];
        return value === -1 ? 'FOLLOW SPOT COLOUR' : ['RED', 'BLUE', 'GREEN', 'MAGENTA', 'YELLOW', 'CYAN', 'ORANGE', 'PURPLE', 'WHITE'][value];
    }

    _stepSpotRigControl(control) {
        if (control === 'cycleSpotTarget') {
            this.selectSpotRigGroup(((this._spotEditTarget || 0) + 1) % VRClubUI.SPOT_GROUPS.length);
            return;
        }
        const target = this._spotEditTarget || 0, first = VRClubUI.SPOT_GROUPS[target].heads[0];
        if (control === 'toggleSpotGroup') {
            this.setSpotGroup(target, { enabled: this.spotRigControlValue(control) !== 'ON' });
        } else if (control === 'cycleSpotGroupColor') {
            this.setSpotGroup(target, { color: ((this[`spotHead${first}Color`] ?? -1) + 2) % (this.spotColorList.length + 1) - 1 });
        } else if (control === 'cycleSpotGroupMotion') {
            this.setSpotGroup(target, { motion: ((this[`spotHead${first}Motion`] || 0) + 1) % VRClubUI.SPOT_MOTIONS.length });
        } else {
            if (control === 'cycleSpotSequence') this.spotSequence = ((this.spotSequence || 0) + 1) % VRClubUI.SPOT_SEQUENCES.length;
            else if (control === 'cycleSpotSequenceRate') {
                const rates = [1, 2, 4, 8];
                this.spotSequenceRate = rates[(rates.indexOf(this.spotSequenceRate || 2) + 1) % rates.length];
            } else this.resetSpotRig();
            this.takeLightControl();
        }
    }

    /** The on/off light controls a person may flip by name (never `this[anything]`). */
    static get LIGHT_TOGGLES() {
        return this._lightToggles || (this._lightToggles = Object.freeze(new Set([
            'lightsActive', 'lasersActive', 'laserSheetActive', 'mirrorBallActive', 'ledWallActive', 'ledMonochrome',
            'strobesActive', 'smokeActive', 'spotStrobeActive', 'mirrorBallRaysActive', 'spotPrismActive'
        ])));
    }

    /** Take the lights by hand: the automatic show stands down until AUTO SHOW, or as the hold policy (lightHold) says. */
    takeLightControl() {
        this.lastVJInteraction = performance.now() / 1000;
        this.vjManualMode = true;
        // A section the show was holding is superseded by the hand-made look.
        if (this.showDirector && typeof this.showDirector.releaseHold === 'function') this.showDirector.releaseHold();
    }

    /** Hand the lights back to the automatic show. */
    resumeAutoShow() {
        this.vjManualMode = false;
        this.lastVJInteraction = 0;
        if (this.showDirector && typeof this.showDirector.releaseHold === 'function') this.showDirector.releaseHold();
        if (this.showDirector) {
            this.showDirector.enabled = true;
            this.showDirector.onPhotosensitiveModeChanged?.();
        }
    }

    showLookHoldUnavailableReason() {
        const show = this.showDirector;
        if (show?.follower) return 'HOST ONLY';
        if (!show?.isDriving()) return 'AUTO SHOW ONLY';
        return show._setPiece ? 'WAIT FOR TRANSITION' : '';
    }

    toggleShowLookHold() {
        if (!this.guardHostControl('lights')) return null;
        const reason = this.showLookHoldUnavailableReason();
        if (reason) {
            this.showErrorMessage(reason === 'AUTO SHOW ONLY' ? 'Start the automatic show before holding a look'
                : reason === 'HOST ONLY' ? 'The host controls the lighting' : 'Let the current countdown or transition finish first');
            return null;
        }
        const show = this.showDirector, held = !show.isHeld();
        if (held) show.holdLook({ mode: 'keep', explicit: true });
        else show.releaseHold();
        this.showErrorMessage(held ? 'Holding this look: its movement continues. Press again to release'
            : 'Look released: automatic changes resume on the next bar');
        return held;
    }

    // ---- What happens after a hand-made change: keep it, return to the automatic show, or shuffle the colours ----

    static get LIGHT_HOLD_NAMES() {
        return this._lightHoldNames || (this._lightHoldNames = Object.freeze({
            resume: 'RETURN TO AUTO', keep: 'KEEP IT', shuffle: 'SHUFFLE COLOURS'
        }));
    }

    /** 15 -> "15 S", 60 -> "1 MIN": the same words on every surface. */
    static lightHoldSecondsName(seconds) {
        return seconds < 60 ? `${seconds} S` : `${Math.round(seconds / 60)} MIN`;
    }

    /** The current choice in words, for a button's second line or a panel readout. */
    lightHoldSummary() {
        const hold = this.lightHold;
        if (hold.mode === 'keep') return 'KEPT UNTIL AUTO SHOW';
        if (hold.mode === 'shuffle') return `NEW COLOURS EVERY ${VRClubUI.lightHoldSecondsName(hold.shuffle)}`;
        return `AUTO AFTER ${VRClubUI.lightHoldSecondsName(hold.delay)}`;
    }

    /**
     * Choose the hold policy: { mode, delay, shuffle }, any subset. Unknown values are ignored, the choice is saved on
     * this device and a section the show is already holding follows it at once.
     */
    setLightHold(patch = {}) {
        const next = Object.assign({}, this.lightHold);
        if (VRClubCore.LIGHT_HOLD_MODES.includes(patch.mode)) next.mode = patch.mode;
        if (VRClubCore.LIGHT_HOLD_DELAYS.includes(patch.delay)) next.delay = patch.delay;
        if (VRClubCore.LIGHT_SHUFFLE_SECONDS.includes(patch.shuffle)) next.shuffle = patch.shuffle;
        this.lightHold = next;
        try { localStorage.setItem('vrclub.lightHold', JSON.stringify(next)); } catch (_) { /* private browsing */ }
        // A fresh countdown from the moment the choice is made, not from the last touch.
        if (this.vjManualMode) this.lastVJInteraction = performance.now() / 1000;
        if (this.vjDirector) this.vjDirector._shuffleAt = 0;
        if (this.showDirector && typeof this.showDirector.isHeld === 'function' && this.showDirector.isHeld() && !this.showDirector._hold?.explicit) {
            this.showDirector.holdLook(next);
        }
        return next;
    }

    /** Step KEEP IT -> SHUFFLE COLOURS -> RETURN TO AUTO (the VR menu and the desk have one button for it). */
    cycleLightHoldMode() {
        const modes = VRClubCore.LIGHT_HOLD_MODES;
        return this.setLightHold({ mode: modes[(modes.indexOf(this.lightHold.mode) + 1) % modes.length] });
    }

    /** Step the time that belongs to the current mode: how long until auto returns, or how often the colour changes. */
    cycleLightHoldTiming() {
        const hold = this.lightHold;
        if (hold.mode === 'keep') return hold;
        const key = hold.mode === 'shuffle' ? 'shuffle' : 'delay';
        const list = hold.mode === 'shuffle' ? VRClubCore.LIGHT_SHUFFLE_SECONDS : VRClubCore.LIGHT_HOLD_DELAYS;
        return this.setLightHold({ [key]: list[(list.indexOf(hold[key]) + 1) % list.length] });
    }

    /**
     * Jump the automatic show to one of its sections (ARRIVAL, PULSE, ASCENT, IGNITION, AFTERGLOW) and keep it as the
     * hold policy says. Taking a section after hand-made changes hands the lights back to the show first.
     * @returns {string|null} the section's title, or null when it could not be picked
     */
    pickShowSection(name) {
        if (!this.guardHostControl('lights')) return null;
        const show = this.showDirector;
        if (!show || show.follower) return null;
        if (this.vjManualMode) this.resumeAutoShow();
        return show.pickSection(name, this.lightHold);
    }

    /** The section after the current one, kept as the hold policy says. */
    nextShowSection() {
        if (!this.guardHostControl('lights')) return null;
        const show = this.showDirector;
        if (!show || show.follower) return null;
        if (this.vjManualMode) this.resumeAutoShow();
        return show.nextSection(this.lightHold);
    }

    /** Step the strobe pattern (all at once, circle, ping-pong ...). */
    cycleStrobePattern() {
        const list = VRClubAnimationFinish.STROBE_PATTERNS;
        const next = list[(list.indexOf(this.strobePattern) + 1) % list.length];
        this.strobePattern = next;
        this._strobePatternStep = -1;
        return next;
    }

    /** "CIRCLE" for a strobe pattern id. */
    strobePatternName() {
        return VRClubAnimationFinish.STROBE_PATTERN_NAMES[this.strobePattern] || 'ALL AT ONCE';
    }

    smokeControlValue(control) {
        if (control === 'cycleFogMode') return this.fogBurstMode === 'auto' ? 'STEADY + BURSTS'
            : this.fogBurstMode === 'burst' ? 'BURST STANDBY' : 'STEADY';
        const amount = Number.isFinite(this.fogIntensity) ? this.fogIntensity : 1;
        return amount <= 0.5 ? 'LOW' : amount <= 1 ? 'MEDIUM' : amount <= 1.5 ? 'HIGH' : 'MAXIMUM';
    }

    aestheticControlValue(control) {
        if (control === 'cycleShowProgram') return this.showDirector?.program === 'aesthetic' ? 'AESTHETIC' : 'NOCTURNE';
        if (control === 'toggleReducedShowSmoke') return this.reducedShowSmoke ? 'NORMAL HAZE ONLY' : 'DENSE PASSAGES ALLOWED';
        if (control === 'cycleSheetSpeed') return `${Math.round((this.laserSheetSpeed ?? 1) * 100)}%`;
        const spec = VRClubUI.FIXTURE_BRIGHTNESS_CONTROLS[control];
        return `${Math.round((this[spec?.property || 'laserSheetBrightness'] ?? 1) * 100)}%`;
    }

    static FIXTURE_BRIGHTNESS_CONTROLS = Object.freeze({
        cycleSpotBrightness: { property: 'spotBrightness', label: 'SPOT BRIGHTNESS', max: 2 },
        cycleLaserBrightness: { property: 'laserBrightness', label: 'LASER BRIGHTNESS', max: 2 },
        cycleLedBrightness: { property: 'ledWallBrightness', label: 'WALL BRIGHTNESS', max: 2 },
        cycleSheetBrightness: { property: 'laserSheetBrightness', label: 'SHEET BRIGHTNESS', max: 3 }
    });

    cycleShowProgram() {
        if (!this.guardHostControl('lights')) return false;
        const program = this.showDirector.program === 'aesthetic' ? 'nocturne' : 'aesthetic';
        this.showDirector.setProgram(program);
        this.resumeAutoShow();
        return true;
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
        if (control === 'toggleReducedShowSmoke') {
            this.reducedShowSmoke = !this.reducedShowSmoke;
            return true;
        }
        if (control === 'cycleShowProgram') return this.cycleShowProgram();
        if (control === 'cycleSpotTarget') {
            this._stepSpotRigControl(control);
            return true;
        }
        if (!this.guardHostControl('lights')) return false;
        if (Object.hasOwn(VRClubUI.FIXTURE_BRIGHTNESS_CONTROLS, control)) {
            const brightness = VRClubUI.FIXTURE_BRIGHTNESS_CONTROLS[control];
            const levels = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
            this[brightness.property] = levels.find(value => value <= brightness.max &&
                value > (this[brightness.property] ?? 1) + 0.01) ?? 0;
            this.takeLightControl();
            return true;
        }
        if (Object.prototype.hasOwnProperty.call(VRClubUI.SPOT_RIG_CONTROLS, control)) {
            this._stepSpotRigControl(control);
            return true;
        }
        switch (control) {
            case 'cycleSheetSpeed': {
                const levels = [0.25, 0.5, 1, 1.5, 2];
                this.laserSheetSpeed = levels.find(value => value > (this.laserSheetSpeed ?? 1) + 0.01) ?? levels[0];
                break;
            }
            case 'changeColor': this.cycleSpotColor(); break;
            case 'changeLaserColor': this.cycleLaserColor(); break;
            case 'matchAllColors': this.matchAllLightColors(); break;
            case 'changeMirrorBallColor': this.cycleMirrorBallColor(); break;
            case 'cycleSpotMode': this.spotlightMode = (this.spotlightMode + 1) % VRClubUI.SPOT_MODE_NAMES.length; break;
            case 'cyclePattern': this.spotlightPattern = (this.spotlightPattern + 1) % VRClubUI.SPOT_PATTERN_NAMES.length; break;
            case 'cycleStrobePattern': this.cycleStrobePattern(); break;
            case 'goboActive': this.toggleGobo(); break;
            case 'cycleGoboPattern': this.nextGoboPattern(); break;
            case 'cycleFogMode':
                this.fogBurstMode = this.fogBurstMode === 'continuous' ? 'auto' : 'continuous';
                this.smokeActive = true;
                break;
            case 'cycleFogAmount': {
                const levels = [0.5, 1, 1.5, 2];
                const amount = Number.isFinite(this.fogIntensity) ? this.fogIntensity : 1;
                this.fogIntensity = levels.find(level => level > amount + 0.01) ?? levels[0];
                this.smokeActive = true;
                break;
            }
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
            mirrorBallRaysActive: true,
            laserSheetActive: false,
            smokeActive: false,
            fogIntensity: 1,
            fogBurstMode: 'auto',
            fogImmersion: 0,
            spotBrightness: 1,
            laserBrightness: 1,
            ledWallBrightness: 1,
            laserSheetBrightness: 1,
            laserSheetSpeed: 1,
            spotStrobeActive: true,
            strobePattern: 'all',
            spotlightMode: 0,
            spotlightPattern: 0,
            colorLockActive: false,
            goboPatternIndex: 0,
            goboRotationSpeed: 1.0,
            spotPrismActive: false,
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
        if (this.goboEnabled) this.setGoboEnabled(false);
        Object.assign(this, VRClubUI.VJ_DEFAULTS);
        this.resetSpotRig();
        if (this.vjDirector && typeof this.vjDirector.setMasterIntensity === 'function') {
            this.vjDirector.setMasterIntensity(1);
        }
        log.info('\u21ba VJ controls reset to defaults');
    }

    triggerShowPeak() {
        if (!this.guardHostControl('lights')) return false;
        if (this.showDirector && this.showDirector.isDriving()) this.showDirector.triggerShowPeak();
        else if (this.vjDirector) {
            this.vjDirector.triggerDrop();
            this.applyFixtureExclusivity('lasersActive');
        }
        else return false;
        return true;
    }

    /**
     * Animate in-world 3D button depression.
     * @param {BABYLON.AbstractMesh} mesh
     */
    _pressButton3D(mesh) {
        if (!mesh || mesh._isPressed) return;
        mesh._isPressed = true;
        const origY = mesh.position.y;
        mesh.position.y -= 0.015;
        setTimeout(() => {
            if (mesh) {
                mesh.position.y = origY;
                mesh._isPressed = false;
            }
        }, 120);
    }
}
window.VRClubControls = VRClubControls;
