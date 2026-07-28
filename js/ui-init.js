/**
 * UI Initialization Script
 * Handles splash screen, VJ controls, and audio menu
 * Optimized for Quest 3S browser
 */

// Debug mode - set false for production
const UI_DEBUG = false;
const uiLog = {
    info: (...args) => UI_DEBUG && console.log('[UI]', ...args),
    warn: (...args) => console.warn('[UI]', ...args),
    error: (...args) => console.error('[UI]', ...args)
};

// =============================================================================
// SPLASH SCREEN PARTICLES
// =============================================================================

// Create floating particles on splash screen
(function initSplashParticles() {
    const splashBg = document.getElementById('splashScreen');
    if (!splashBg) return;
    
    // Reduced particle count for mobile/VR performance
    const particleCount = 15;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'splash-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (8 + Math.random() * 4) + 's';
        if (Math.random() > 0.5) {
            particle.style.background = '#00ffff';
            particle.style.boxShadow = '0 0 8px #00ffff';
        }
        splashBg.appendChild(particle);
    }
})();

// =============================================================================
// SETTINGS PANEL
// =============================================================================

(function initSettingsPanel() {
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel = document.getElementById('settingsPanel');
    
    if (!settingsToggle || !settingsPanel) return;
    
    // Settings panel toggle
    settingsToggle.addEventListener('click', function() {
        settingsPanel.classList.toggle('visible');
    });
    
    // Close panel when clicking outside
    document.addEventListener('click', function(e) {
        if (!settingsToggle.contains(e.target) && !settingsPanel.contains(e.target)) {
            settingsPanel.classList.remove('visible');
        }
    });
})();

// =============================================================================
// SPLASH SCREEN HANDLER
// =============================================================================

// Multiplayer was removed from this project; the #enableMultiplayer / #roomCodeGroup /
// #roomCode elements no longer exist in index.html, so all the wiring that referenced
// them was permanently inert. Removed rather than left as misleading dead code.
let splashConfig = {
    username: 'Guest'
};

const splashScreen = document.getElementById('splashScreen');
const enterClubBtn = document.getElementById('enterClubBtn');
const splashLoading = document.getElementById('splashLoading');
const canvas = document.getElementById('canvas');

// Enter Club Button
if (enterClubBtn) {
    enterClubBtn.addEventListener('click', function() {
        // Get user configuration
        const usernameInput = document.getElementById('splashUsername');
        
        splashConfig.username = (usernameInput && usernameInput.value.trim()) || 'Guest';
        
        // Show loading state
        enterClubBtn.style.display = 'none';
        splashLoading.classList.add('visible');
        
        // Show canvas and initialize VR club
        setTimeout(() => {
            canvas.classList.remove('hidden'); // Remove hidden class to show canvas
            canvas.style.display = 'block';
            
            // Initialize VRClub instance (club_hyperrealistic.js creates window.vrClub)
            if (!window.vrClub) {
                window.vrClub = new VRClub();
            }
            
            // Initialize UI menus once VRClub is ready
            waitForVRClubInstance();
            
            // Hide splash after initialization
            setTimeout(() => {
                splashScreen.classList.add('hidden');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                }, 500);
            }, 1000);
        }, 500);
    });
}

// =============================================================================
// VJ MENU CONTROLS
// =============================================================================

let vrClubInstance = null;

// Initialize VJ menu once VRClub is created (called from Enter Club button).
// `window.vrClub` is constructed synchronously in the click handler, so we
// only need a single fallback poll for the rare case where ordering changes.
function waitForVRClubInstance() {
    if (window.vrClub) {
        vrClubInstance = window.vrClub;
        initVJMenu();
        initAudioMenu();
        uiLog.info('VJ/Audio menus initialized');
        return;
    }
    let waitAttempts = 0;
    const maxWaitAttempts = 50; // 5s safety net
    const checkInterval = setInterval(() => {
        waitAttempts++;
        if (window.vrClub) {
            vrClubInstance = window.vrClub;
            clearInterval(checkInterval);
            initVJMenu();
            initAudioMenu();
            uiLog.info('VJ/Audio menus initialized');
        } else if (waitAttempts >= maxWaitAttempts) {
            clearInterval(checkInterval);
            uiLog.error('Timeout waiting for VRClub instance');
        }
    }, 100);
}

function initVJMenu() {
    const vjToggle = document.getElementById('vjToggle');
    const vjMenu = document.getElementById('vjMenu');
    const vjMinimize = document.getElementById('vjMinimize');
    const vjClose = document.getElementById('vjClose');
    const spotSpeed = document.getElementById('spotSpeed');
    const spotSpeedValue = document.getElementById('spotSpeedValue');
    
    if (!vjToggle || !vjMenu) return;
    
    // Toggle VJ menu visibility
    vjToggle.addEventListener('click', () => {
        vjMenu.classList.toggle('hidden');
        if (!vjMenu.classList.contains('hidden')) {
            vjMenu.classList.remove('minimized');
            updateButtonStates();
        }
    });
    
    // Minimize/maximize VJ menu
    if (vjMinimize) {
        vjMinimize.addEventListener('click', () => {
            vjMenu.classList.toggle('minimized');
            vjMinimize.textContent = vjMenu.classList.contains('minimized') ? '+' : '−';
        });
    }
    
    // Close VJ menu
    if (vjClose) {
        vjClose.addEventListener('click', () => {
            vjMenu.classList.add('hidden');
        });
    }
    
    // Handle VJ control buttons
    const vjButtons = document.querySelectorAll('.vj-button[data-control]');

    // Show the auto-detected graphics tier on the quality button so the label never
    // reads "AUTO" once we actually know what was picked.
    const qualityButton = document.querySelector('.vj-button[data-control="cycleGraphicsQuality"]');
    if (qualityButton && vrClubInstance.graphicsTier) {
        qualityButton.textContent = `QUALITY: ${vrClubInstance.graphicsTier.toUpperCase()}`;
    }

    // Show Director readout: which movement / set-piece is currently playing.
    // Declared as a function so the button handlers below can call it before
    // this point in the file is reached at runtime.
    const showReadout = document.getElementById('showMovementReadout');
    function updateShowReadout() {
        if (!showReadout || !vrClubInstance.showDirector) return;
        const s = vrClubInstance.showDirector;
        if (!s.enabled) { showReadout.textContent = 'OFF'; return; }
        const st = s.getStatus();
        showReadout.textContent = st.setPiece ? `⚡ ${st.setPiece}` : st.movement;
    }
    const showToggleBtn = document.querySelector('.vj-button[data-control="toggleShow"]');
    if (showToggleBtn && vrClubInstance.showDirector) {
        showToggleBtn.classList.toggle('active', vrClubInstance.showDirector.enabled);
    }
    updateShowReadout();

    vjButtons.forEach(button => {
        button.addEventListener('click', () => {
            const control = button.getAttribute('data-control');
            
            if (control === 'changeColor') {
                // Change spotlight color with ENHANCED visual feedback
                vrClubInstance.spotColorIndex = (vrClubInstance.spotColorIndex + 1) % vrClubInstance.spotColorList.length;
                vrClubInstance.currentSpotColor = vrClubInstance.spotColorList[vrClubInstance.spotColorIndex];
                vrClubInstance.lastColorChange = performance.now() / 1000;
                
                // Update all spotlight colors
                if (vrClubInstance.spotlights) {
                    vrClubInstance.spotlights.forEach((spot, i) => {
                        spot.light.specular = vrClubInstance.currentSpotColor;
                        spot.color = vrClubInstance.currentSpotColor;
                        
                        if (vrClubInstance.trussLights && vrClubInstance.trussLights[i]) {
                            const trussLight = vrClubInstance.trussLights[i];
                            if (trussLight.lensMat && vrClubInstance.lightsActive) {
                                trussLight.lensMat.emissiveColor = vrClubInstance.currentSpotColor.scale(5.0);
                            }
                            if (trussLight.sourceMat && vrClubInstance.lightsActive) {
                                trussLight.sourceMat.emissiveColor = vrClubInstance.currentSpotColor.scale(8.0);
                            }
                        }
                    });
                }
                
                // ENHANCED visual feedback with smooth color transition
                const color = vrClubInstance.currentSpotColor;
                button.style.background = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.8)`;
                button.style.boxShadow = `0 0 20px rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.6)`;
                button.style.transform = 'scale(1.05)';
                setTimeout(() => {
                    button.style.background = '';
                    button.style.boxShadow = '';
                    button.style.transform = '';
                }, 400);
                
            } else if (control === 'cycleGraphicsQuality') {
                // Cycle render quality. Auto-detection is conservative, so this lets a
                // user on a strong GPU opt into ULTRA (SSR + PCSS + supersampling) or
                // drop to BALANCED if their frame rate is suffering.
                const tiers = ['balanced', 'high', 'ultra'];
                const next = tiers[(tiers.indexOf(vrClubInstance.graphicsTier) + 1) % tiers.length];
                vrClubInstance.setGraphicsTier(next);
                button.textContent = `QUALITY: ${next.toUpperCase()}`;

            } else if (control === 'toggleShow') {
                // Hand the rig between the composed show and the legacy auto-cycler.
                const show = vrClubInstance.showDirector;
                if (show) {
                    const on = show.setEnabled(!show.enabled);
                    button.textContent = `SHOW: ${on ? 'ON' : 'OFF'}`;
                    button.classList.toggle('active', on);
                    updateShowReadout();
                }

            } else if (control === 'nextMovement') {
                const show = vrClubInstance.showDirector;
                if (show && show.isDriving()) {
                    show.nextMovement();
                    updateShowReadout();
                }

            } else if (control === 'showCountdown') {
                // Fire THE COUNTDOWN: 4 bars of escalation into one beat of black.
                const show = vrClubInstance.showDirector;
                if (show && show.isDriving()) {
                    show.triggerShowDrop();
                    updateShowReadout();
                }

            } else if (control === 'changeMirrorBallColor') {
                // Change mirror ball color with ENHANCED visual feedback
                vrClubInstance.mirrorBallColorIndex = (vrClubInstance.mirrorBallColorIndex + 1) % vrClubInstance.mirrorBallColors.length;
                vrClubInstance.mirrorBallSpotlightColor = vrClubInstance.mirrorBallColors[vrClubInstance.mirrorBallColorIndex];
                
                if (vrClubInstance.mirrorBallSpotlights) {
                    vrClubInstance.mirrorBallSpotlights.forEach(light => {
                        if (light) light.diffuse = vrClubInstance.mirrorBallSpotlightColor.clone();
                    });
                }
                if (vrClubInstance.mirrorBallBeams) {
                    vrClubInstance.mirrorBallBeams.forEach(beam => {
                        beam.material.emissiveColor = vrClubInstance.mirrorBallSpotlightColor.clone();
                    });
                }
                if (vrClubInstance.mirrorBallHousings) {
                    vrClubInstance.mirrorBallHousings.forEach(housing => {
                        housing.material.emissiveColor = vrClubInstance.mirrorBallSpotlightColor.scale(0.2);
                        housing.lensMaterial.emissiveColor = vrClubInstance.mirrorBallSpotlightColor.scale(5.0);
                        housing.sourceMaterial.emissiveColor = vrClubInstance.mirrorBallSpotlightColor.scale(8.0);
                        housing.flareMaterial.emissiveColor = vrClubInstance.mirrorBallSpotlightColor.scale(3.0);
                    });
                }
                
                // ENHANCED visual feedback with disco ball effect
                const color = vrClubInstance.mirrorBallSpotlightColor;
                button.style.background = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.8)`;
                button.style.boxShadow = `0 0 20px rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.6)`;
                button.style.transform = 'scale(1.05) rotate(5deg)';
                setTimeout(() => {
                    button.style.background = '';
                    button.style.boxShadow = '';
                    button.style.transform = '';
                }, 400);
                
            } else if (control === 'cycleSpotMode') {
                // Cycle spotlight mode with ENHANCED feedback
                vrClubInstance.spotlightMode = (vrClubInstance.spotlightMode + 1) % 4;
                const modeNames = ["STROBE+SWEEP", "SWEEP ONLY", "STROBE STATIC", "STATIC"];
                button.textContent = modeNames[vrClubInstance.spotlightMode];
                button.style.transform = 'scale(1.1)';
                button.style.background = 'rgba(102, 126, 234, 0.9)';
                setTimeout(() => {
                    button.textContent = 'MODE';
                    button.style.transform = '';
                    button.style.background = '';
                }, 1500);
                
            } else if (control === 'cyclePattern') {
                // Cycle spotlight pattern with ENHANCED feedback
                vrClubInstance.spotlightPattern = (vrClubInstance.spotlightPattern + 1) % 3;
                const patternNames = ["RANDOM", "STATIC DOWN", "SYNC SWEEP"];
                button.textContent = patternNames[vrClubInstance.spotlightPattern];
                button.style.transform = 'scale(1.1)';
                button.style.background = 'rgba(102, 126, 234, 0.9)';
                setTimeout(() => {
                    button.textContent = 'PATTERN';
                    button.style.transform = '';
                    button.style.background = '';
                }, 1500);
                
            } else if (control === 'goboActive') {
                // Toggle gobo filters - use VRClub methods directly (legacy system)
                let isActive = false;
                if (vrClubInstance.toggleGobo) {
                    isActive = vrClubInstance.toggleGobo();
                } else if (vrClubInstance.systems && vrClubInstance.systems.spotlight) {
                    isActive = vrClubInstance.systems.spotlight.toggleGobo();
                }
                button.classList.toggle('active', isActive);
                button.style.transform = 'scale(1.05)';
                button.style.background = isActive ? 'rgba(0, 255, 128, 0.8)' : '';
                setTimeout(() => {
                    button.style.transform = '';
                    if (!button.classList.contains('active')) button.style.background = '';
                }, 300);
                
            } else if (control === 'cycleGoboPattern') {
                // Cycle gobo pattern - use VRClub methods directly (legacy system)
                let patternName = 'circle';
                if (vrClubInstance.nextGoboPattern) {
                    patternName = vrClubInstance.nextGoboPattern();
                } else if (vrClubInstance.systems && vrClubInstance.systems.spotlight) {
                    patternName = vrClubInstance.systems.spotlight.nextGoboPattern();
                }
                button.textContent = patternName.toUpperCase();
                button.style.transform = 'scale(1.1)';
                button.style.background = 'rgba(255, 0, 255, 0.8)';
                button.style.boxShadow = '0 0 15px rgba(255, 0, 255, 0.6)';
                setTimeout(() => {
                    button.textContent = 'PATTERN';
                    button.style.transform = '';
                    button.style.background = '';
                    button.style.boxShadow = '';
                }, 1500);
                
            } else if (control === 'reverseGoboSpin') {
                // Reverse gobo rotation direction - use VRClub properties directly
                const currentSpeed = vrClubInstance.goboRotationSpeed || 1.0;
                const newSpeed = -currentSpeed;
                if (vrClubInstance.setGoboRotationSpeed) {
                    vrClubInstance.setGoboRotationSpeed(newSpeed);
                } else {
                    vrClubInstance.goboRotationSpeed = newSpeed;
                }
                
                // Update slider if exists
                const goboSpeedSlider = document.getElementById('goboSpeed');
                const goboSpeedValue = document.getElementById('goboSpeedValue');
                if (goboSpeedSlider) goboSpeedSlider.value = newSpeed;
                if (goboSpeedValue) goboSpeedValue.textContent = `${newSpeed.toFixed(1)}x`;
                
                button.style.transform = 'scale(1.1) rotate(180deg)';
                button.style.background = 'rgba(0, 200, 255, 0.8)';
                setTimeout(() => {
                    button.style.transform = '';
                    button.style.background = '';
                }, 400);
                
            } else {
                // Toggle on/off control
                vrClubInstance[control] = !vrClubInstance[control];
                button.classList.toggle('active');
                
                // Activate VJ manual mode for toggle controls
                vrClubInstance.lastVJInteraction = performance.now() / 1000;
                vrClubInstance.vjManualMode = true;
            }
            
            // Sync VJ control change to multiplayer server
            if (vrClubInstance.networkManager && vrClubInstance.networkManager.isConnected()) {
                vrClubInstance.networkManager.sendVJControl(control, vrClubInstance[control]);
            }
        });
    });
    
    // Handle speed slider - controls ALL light types simultaneously
    if (spotSpeed && spotSpeedValue) {
        spotSpeed.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            // Update ALL speed multipliers for unified control
            vrClubInstance.spotlightSpeed = value;
            vrClubInstance.laserSpeed = value;
            vrClubInstance.mirrorBallSpeed = value;
            vrClubInstance.ledWallSpeed = value;
            vrClubInstance.strobeSpeed = value;
            vrClubInstance.blinderSpeed = value;
            spotSpeedValue.textContent = `${value.toFixed(1)}x`;
        });
    }
    
    // Handle gobo speed slider - use VRClub properties directly
    const goboSpeed = document.getElementById('goboSpeed');
    const goboSpeedValue = document.getElementById('goboSpeedValue');
    if (goboSpeed && goboSpeedValue) {
        goboSpeed.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (vrClubInstance.setGoboRotationSpeed) {
                vrClubInstance.setGoboRotationSpeed(value);
            } else {
                vrClubInstance.goboRotationSpeed = value;
            }
            goboSpeedValue.textContent = `${value.toFixed(1)}x`;
        });
    }

    // === VJ DIRECTOR: Live Macros (DROP / BLACKOUT / LOCK / TAP / Master / BPM) ===
    const vjDir = () => vrClubInstance && vrClubInstance.vjDirector;
    const dropBtn = document.getElementById('vjDropBtn');
    const blackoutBtn = document.getElementById('vjBlackoutBtn');
    const lockBtn = document.getElementById('vjLockBtn');
    const tapBtn = document.getElementById('vjTapBtn');
    const masterSlider = document.getElementById('vjMasterSlider');
    const masterValue = document.getElementById('vjMasterValue');
    const bpmReadout = document.getElementById('vjBpmReadout');

    const flashBtn = (btn) => {
        if (!btn) return;
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 250);
    };

    if (dropBtn) {
        dropBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) { d.triggerDrop(); flashBtn(dropBtn); }
        });
    }
    if (blackoutBtn) {
        blackoutBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) { d.blackout(800); flashBtn(blackoutBtn); }
        });
    }
    if (lockBtn) {
        lockBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) { d.lockToCenter(4000); flashBtn(lockBtn); }
        });
    }
    if (tapBtn) {
        tapBtn.addEventListener('click', () => {
            const d = vjDir();
            if (d) {
                const newBpm = d.tapTempo();
                flashBtn(tapBtn);
                if (newBpm && bpmReadout) bpmReadout.textContent = newBpm.toFixed(0);
            }
        });
    }
    if (masterSlider) {
        masterSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            const d = vjDir();
            if (d) d.setMasterIntensity(v);
            if (masterValue) masterValue.textContent = `${Math.round(v * 100)}%`;
        });
    }
    // Refresh BPM readout from director's auto-detection (every 1 s)
    if (bpmReadout) {
        if (window.__vjBpmInterval) clearInterval(window.__vjBpmInterval);
        window.__vjBpmInterval = setInterval(() => {
            if (document.hidden) return;
            const d = vjDir();
            if (d) bpmReadout.textContent = d.bpm.toFixed(0);
            updateShowReadout();
        }, 1000);
    }

    // === ACCESSIBILITY: Photosensitive Safe Mode + Bass Haptics ===
    const safeModeBtn = document.getElementById('vjSafeModeBtn');
    const bassHapticsBtn = document.getElementById('vjBassHapticsBtn');
    if (safeModeBtn) {
        // Sync initial state from persisted VRClub flag
        if (vrClubInstance.photosensitiveSafeMode) safeModeBtn.classList.add('active');
        else safeModeBtn.classList.remove('active');
        safeModeBtn.addEventListener('click', () => {
            const next = !vrClubInstance.photosensitiveSafeMode;
            vrClubInstance.setPhotosensitiveSafeMode(next);
            safeModeBtn.classList.toggle('active', next);
        });
    }
    if (bassHapticsBtn) {
        if (vrClubInstance.bassHapticsEnabled) bassHapticsBtn.classList.add('active');
        else bassHapticsBtn.classList.remove('active');
        bassHapticsBtn.addEventListener('click', () => {
            const next = !vrClubInstance.bassHapticsEnabled;
            vrClubInstance.setBassHapticsEnabled(next);
            bassHapticsBtn.classList.toggle('active', next);
        });
    }

    // Update button states periodically
    function updateButtonStates() {
        if (!vrClubInstance || vjMenu.classList.contains('hidden')) return;
        
        vjButtons.forEach(button => {
            const control = button.getAttribute('data-control');
            if (control && !control.includes('change') && !control.includes('cycle') && !control.includes('reverse')) {
                // Special handling for goboActive - check VRClub.goboEnabled directly
                if (control === 'goboActive') {
                    if (vrClubInstance.goboEnabled) {
                        button.classList.add('active');
                    } else {
                        button.classList.remove('active');
                    }
                } else if (vrClubInstance[control]) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            }
        });
        
        // Update speed slider
        if (spotSpeed && spotSpeedValue) {
            spotSpeed.value = vrClubInstance.spotlightSpeed;
            spotSpeedValue.textContent = `${vrClubInstance.spotlightSpeed.toFixed(1)}x`;
        }
        
        // Update gobo speed slider - use VRClub properties directly
        if (goboSpeed && goboSpeedValue) {
            const speed = vrClubInstance.goboRotationSpeed || 1.0;
            goboSpeed.value = speed;
            goboSpeedValue.textContent = `${speed.toFixed(1)}x`;
        }
    }
    
    // Update button states every 2 seconds (reduced frequency for VR performance).
    // The interval and the XR observers are all registered with window.__vjUiTeardown
    // so they can actually be released - previously they ran forever, kept the whole
    // VRClub instance reachable, and continued polling while the tab was hidden.
    if (window.__vjButtonStateInterval) clearInterval(window.__vjButtonStateInterval);
    window.__vjButtonStateInterval = setInterval(() => {
        if (document.hidden) return; // don't poll a backgrounded tab
        updateButtonStates();
    }, 2000);

    const teardowns = (window.__vjUiTeardown = window.__vjUiTeardown || []);
    teardowns.push(() => {
        clearInterval(window.__vjButtonStateInterval);
        window.__vjButtonStateInterval = null;
        clearInterval(window.__vjBpmInterval);
        window.__vjBpmInterval = null;
    });
    
    // Hide VJ menu in VR mode (wait for scene to be ready)
    if (vrClubInstance && vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        const scene = vrClubInstance.scene;
        const onInit = scene.onXRSessionInit.add(() => {
            vjMenu.classList.add('hidden');
            vjToggle.style.display = 'none';
        });
        
        const onEnded = scene.onXRSessionEnded.add(() => {
            vjToggle.style.display = 'block';
        });

        teardowns.push(() => {
            scene.onXRSessionInit.remove(onInit);
            scene.onXRSessionEnded.remove(onEnded);
        });
    }
    
    uiLog.info('VJ desktop menu initialized');
}

/**
 * Release every timer and observer registered by the UI layer.
 * Called from VRClub.dispose() and on pagehide.
 */
function teardownVJUI() {
    const teardowns = window.__vjUiTeardown || [];
    for (const fn of teardowns) {
        try { fn(); } catch (err) { uiLog.warn('VJ UI teardown step failed:', err); }
    }
    window.__vjUiTeardown = [];
}
window.teardownVJUI = teardownVJUI;
window.addEventListener('pagehide', teardownVJUI);

// =============================================================================
// AUDIO MENU
// =============================================================================

function initAudioMenu() {
    const audioToggle = document.getElementById('audioToggle');
    const audioMenu = document.getElementById('audioMenu');
    const audioMinimize = document.getElementById('audioMinimize');
    const audioClose = document.getElementById('audioClose');
    const streamUrl = document.getElementById('streamUrl');
    const playStreamBtn = document.getElementById('playStreamBtn');
    const audioFileInput = document.getElementById('audioFileInput');
    const audioFileName = document.getElementById('audioFileName');
    const audioStatus = document.getElementById('audioStatus');
    
    if (!audioToggle || !audioMenu) return;
    
    // Toggle audio menu
    audioToggle.addEventListener('click', () => {
        audioMenu.classList.toggle('hidden');
        if (!audioMenu.classList.contains('hidden')) {
            audioMenu.classList.remove('minimized');
        }
    });
    
    // Minimize/maximize
    if (audioMinimize) {
        audioMinimize.addEventListener('click', () => {
            audioMenu.classList.toggle('minimized');
            audioMinimize.textContent = audioMenu.classList.contains('minimized') ? '+' : '−';
        });
    }
    
    // Close
    if (audioClose) {
        audioClose.addEventListener('click', () => {
            audioMenu.classList.add('hidden');
        });
    }
    
    // Show status message
    function showStatus(message, type = 'success') {
        if (!audioStatus) return;
        audioStatus.textContent = message;
        audioStatus.className = `audio-status ${type}`;
        audioStatus.style.display = 'block';
        setTimeout(() => {
            audioStatus.style.display = 'none';
        }, 3000);
    }

    // Single audio element shared with VRClub. createMediaElementSource may only
    // be called ONCE per HTMLMediaElement, so we route everything through
    // VRClub's _connectAudioSourceOnce / _setAudioSrc helpers.
    function ensureAudioElement() {
        if (!vrClubInstance) return null;
        if (!vrClubInstance.audioElement) {
            const el = document.createElement('audio');
            el.crossOrigin = 'anonymous';
            el.preload = 'auto';
            el.style.display = 'none';
            document.body.appendChild(el);
            vrClubInstance.audioElement = el;
        }
        return vrClubInstance.audioElement;
    }

    // Play stream URL
    if (playStreamBtn && streamUrl) {
        playStreamBtn.addEventListener('click', () => {
            const url = streamUrl.value.trim();
            if (!url) {
                showStatus('Please enter a stream URL', 'error');
                return;
            }
            if (vrClubInstance && typeof vrClubInstance._isSafeAudioUrl === 'function'
                && !vrClubInstance._isSafeAudioUrl(url)) {
                showStatus('Invalid URL. Use http://, https:// or blob:', 'error');
                return;
            }
            try {
                const el = ensureAudioElement();
                if (!el) { showStatus('Audio not ready', 'error'); return; }
                vrClubInstance._setAudioSrc(url);
                vrClubInstance._connectAudioSourceOnce();
                el.play()
                    .then(() => {
                        showStatus('🎵 Stream playing!', 'success');
                        playStreamBtn.textContent = '⏸️ Pause';
                    })
                    .catch(err => {
                        showStatus(`Error: ${err.message}`, 'error');
                    });
            } catch (err) {
                showStatus(`Error: ${err.message}`, 'error');
            }
        });
    }
    
    // Handle file upload
    if (audioFileInput && audioFileName) {
        audioFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            audioFileName.textContent = `📄 ${file.name}`;
            
            try {
                const el = ensureAudioElement();
                if (!el) { showStatus('Audio not ready', 'error'); return; }
                const url = URL.createObjectURL(file);
                vrClubInstance._setAudioSrc(url);
                vrClubInstance._connectAudioSourceOnce();
                el.play()
                    .then(() => {
                        showStatus(`🎵 Playing: ${file.name}`, 'success');
                    })
                    .catch(err => {
                        showStatus(`Error: ${err.message}`, 'error');
                    });
            } catch (err) {
                showStatus(`Error: ${err.message}`, 'error');
            }
        });
    }
    
    // Hide in VR mode (wait for scene to be ready)
    if (vrClubInstance && vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        vrClubInstance.scene.onXRSessionInit.add(() => {
            audioMenu.classList.add('hidden');
            audioToggle.style.display = 'none';
        });
        
        vrClubInstance.scene.onXRSessionEnded.add(() => {
            audioToggle.style.display = 'block';
        });
    }
    
    uiLog.info('Audio menu initialized');
}

// Audio menu is now initialized by waitForVRClubInstance() after Enter Club is clicked


