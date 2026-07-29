class VRClubUI extends VRClubAnimationFinish {
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
                    // A blocking alert() steals focus, cannot be styled, and on Quest
                    // renders as a flat 2D browser panel over the scene. Use the app's
                    // own toast so failures look like part of the product.
                    this.showErrorMessage('VR unavailable. Connect your headset via Link/Air Link, or open this page in the Quest browser.');
                }
            });
        }
        
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
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.key === 'd' || e.key === 'D') {
                this.debugMode = !this.debugMode;
                this.showErrorMessage(`Debug overlay ${this.debugMode ? 'on' : 'off'}`);
            }
        };
        document.addEventListener('keydown', this._onKeyDown);
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

    _ensureAudioElement() {
        if (this.audioElement) return this.audioElement;
        const audio = document.createElement('audio');
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.loop = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.audioElement = audio;
        return audio;
    }

    _playAudio(src, kind, label) {
        const audio = this._ensureAudioElement();
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

    startAudioStream(url) {
        if (!this._isSafeAudioUrl(url)) {
            log.warn(`🎵 Rejected unsafe audio URL: ${url}`);
            this.showErrorMessage('Invalid audio URL. Use http://, https:// or blob: only.');
            return Promise.reject(new TypeError('Unsafe audio URL'));
        }
        return this._playAudio(url, 'stream', url);
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

    moveCameraToPreset(preset) {
        const presets = {
            arrival: { label: 'Arrival', pos: new BABYLON.Vector3(0, 1.7, -3), target: new BABYLON.Vector3(0, 2.2, -17) },
            danceFloor: { label: 'Dance Floor', pos: new BABYLON.Vector3(-2.8, 1.7, -9.2), target: new BABYLON.Vector3(0, 2.6, -18.5) },
            // Eye height for someone standing on the 0.5 m riser, inside the 1 m
            // gap between the LED wall (z=-20) and the deck plinth (z=-19), facing out.
            djBooth: { label: 'DJ Booth', pos: new BABYLON.Vector3(0, 2.2, -19.4), target: new BABYLON.Vector3(0, 1.7, -10) },
            lightingGallery: { label: 'Lighting Gallery', pos: new BABYLON.Vector3(10, 5.2, -6.5), target: new BABYLON.Vector3(0, 2.4, -15.5) }
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
