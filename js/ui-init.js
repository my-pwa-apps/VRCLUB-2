/**
 * UI Initialization Script
 * Handles splash screen, VJ controls, audio menu, and multiplayer menu
 */

// =============================================================================
// SPLASH SCREEN PARTICLES
// =============================================================================

// Create floating particles on splash screen
(function initSplashParticles() {
    const splashBg = document.getElementById('splashScreen');
    if (!splashBg) return;
    
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'splash-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 10 + 's';
        particle.style.animationDuration = (8 + Math.random() * 4) + 's';
        if (Math.random() > 0.5) {
            particle.style.background = '#00ffff';
            particle.style.boxShadow = '0 0 10px #00ffff';
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

let splashConfig = {
    username: 'Guest',
    enableMultiplayer: false,
    roomCode: null
};

const splashScreen = document.getElementById('splashScreen');
const enterClubBtn = document.getElementById('enterClubBtn');
const enableMultiplayer = document.getElementById('enableMultiplayer');
const roomCodeGroup = document.getElementById('roomCodeGroup');
const splashLoading = document.getElementById('splashLoading');
const canvas = document.getElementById('canvas');

// Show/hide room code input
if (enableMultiplayer && roomCodeGroup) {
    enableMultiplayer.addEventListener('change', function() {
        if (this.checked) {
            roomCodeGroup.style.display = 'block';
        } else {
            roomCodeGroup.style.display = 'none';
        }
    });
}

// Enter Club Button
if (enterClubBtn) {
    enterClubBtn.addEventListener('click', function() {
        // Get user configuration
        const usernameInput = document.getElementById('splashUsername');
        const roomCodeInput = document.getElementById('roomCode');
        
        splashConfig.username = usernameInput.value.trim() || 'Guest';
        splashConfig.enableMultiplayer = enableMultiplayer.checked;
        splashConfig.roomCode = roomCodeInput.value.trim() || null;
        
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

// Wait for VRClub instance to be created
const waitForVRClub = setInterval(() => {
    if (window.vrClub) {
        vrClubInstance = window.vrClub;
        clearInterval(waitForVRClub);
        initVJMenu();
    }
}, 100);

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
    vjButtons.forEach(button => {
        button.addEventListener('click', () => {
            const control = button.getAttribute('data-control');
            
            if (control === 'changeColor') {
                // Change spotlight color
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
                
                button.style.background = `rgba(${vrClubInstance.currentSpotColor.r * 255}, ${vrClubInstance.currentSpotColor.g * 255}, ${vrClubInstance.currentSpotColor.b * 255}, 0.5)`;
                setTimeout(() => {
                    button.style.background = '';
                }, 300);
                
            } else if (control === 'changeMirrorBallColor') {
                // Change mirror ball color
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
                
                button.style.background = `rgba(${vrClubInstance.mirrorBallSpotlightColor.r * 255}, ${vrClubInstance.mirrorBallSpotlightColor.g * 255}, ${vrClubInstance.mirrorBallSpotlightColor.b * 255}, 0.5)`;
                setTimeout(() => {
                    button.style.background = '';
                }, 300);
                
            } else if (control === 'cycleSpotMode') {
                // Cycle spotlight mode
                vrClubInstance.spotlightMode = (vrClubInstance.spotlightMode + 1) % 4;
                const modeNames = ["STROBE+SWEEP", "SWEEP ONLY", "STROBE STATIC", "STATIC"];
                button.textContent = modeNames[vrClubInstance.spotlightMode];
                setTimeout(() => {
                    button.textContent = 'MODE';
                }, 1500);
                
            } else if (control === 'cyclePattern') {
                // Cycle spotlight pattern
                vrClubInstance.spotlightPattern = (vrClubInstance.spotlightPattern + 1) % 3;
                const patternNames = ["RANDOM", "STATIC DOWN", "SYNC SWEEP"];
                button.textContent = patternNames[vrClubInstance.spotlightPattern];
                setTimeout(() => {
                    button.textContent = 'PATTERN';
                }, 1500);
                
            } else {
                // Toggle on/off control
                vrClubInstance[control] = !vrClubInstance[control];
                button.classList.toggle('active');
                
                // Handle mutual exclusivity: mirror ball turns off other lights
                if (control === 'mirrorBallActive' && vrClubInstance.mirrorBallActive) {
                    vrClubInstance.lightsActive = false;
                    vrClubInstance.lasersActive = false;
                    // Update button states
                    vjButtons.forEach(btn => {
                        const btnControl = btn.getAttribute('data-control');
                        if (btnControl === 'lightsActive' || btnControl === 'lasersActive') {
                            btn.classList.remove('active');
                        }
                    });
                } else if ((control === 'lightsActive' || control === 'lasersActive') && vrClubInstance[control]) {
                    // When turning on lights or lasers, turn off mirror ball
                    vrClubInstance.mirrorBallActive = false;
                    vjButtons.forEach(btn => {
                        const btnControl = btn.getAttribute('data-control');
                        if (btnControl === 'mirrorBallActive') {
                            btn.classList.remove('active');
                        }
                    });
                }
                
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
            spotSpeedValue.textContent = `${value.toFixed(1)}x`;
        });
    }
    
    // Update button states periodically
    function updateButtonStates() {
        if (!vrClubInstance || vjMenu.classList.contains('hidden')) return;
        
        vjButtons.forEach(button => {
            const control = button.getAttribute('data-control');
            if (control && !control.includes('change') && !control.includes('cycle')) {
                if (vrClubInstance[control]) {
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
    }
    
    // Update button states every second
    setInterval(updateButtonStates, 1000);
    
    // Hide VJ menu in VR mode (wait for scene to be ready)
    if (vrClubInstance && vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        vrClubInstance.scene.onXRSessionInit.add(() => {
            vjMenu.classList.add('hidden');
            vjToggle.style.display = 'none';
        });
        
        vrClubInstance.scene.onXRSessionEnded.add(() => {
            vjToggle.style.display = 'block';
        });
    }
    
    console.log('✅ VJ desktop menu initialized');
}

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
    
    let audioElement = null;
    let audioContext = null;
    let audioSource = null;
    
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
    
    // Initialize audio context
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            if (vrClubInstance) {
                vrClubInstance.audioContext = audioContext;
                vrClubInstance.audioAnalyser = audioContext.createAnalyser();
                vrClubInstance.audioAnalyser.fftSize = 256;
                vrClubInstance.audioDataArray = new Uint8Array(vrClubInstance.audioAnalyser.frequencyBinCount);
            }
        }
        return audioContext;
    }
    
    // Play stream URL
    if (playStreamBtn && streamUrl) {
        playStreamBtn.addEventListener('click', () => {
            const url = streamUrl.value.trim();
            if (!url) {
                showStatus('Please enter a stream URL', 'error');
                return;
            }
            
            try {
                const ctx = initAudioContext();
                
                if (!audioElement) {
                    audioElement = new Audio();
                    audioElement.crossOrigin = "anonymous";
                    audioSource = ctx.createMediaElementSource(audioElement);
                    
                    if (vrClubInstance && vrClubInstance.audioAnalyser) {
                        audioSource.connect(vrClubInstance.audioAnalyser);
                        vrClubInstance.audioAnalyser.connect(ctx.destination);
                    } else {
                        audioSource.connect(ctx.destination);
                    }
                }
                
                audioElement.src = url;
                audioElement.play()
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
                const ctx = initAudioContext();
                const url = URL.createObjectURL(file);
                
                if (!audioElement) {
                    audioElement = new Audio();
                    audioSource = ctx.createMediaElementSource(audioElement);
                    
                    if (vrClubInstance && vrClubInstance.audioAnalyser) {
                        audioSource.connect(vrClubInstance.audioAnalyser);
                        vrClubInstance.audioAnalyser.connect(ctx.destination);
                    } else {
                        audioSource.connect(ctx.destination);
                    }
                }
                
                audioElement.src = url;
                audioElement.play()
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
    
    console.log('✅ Audio menu initialized');
}

// Initialize audio menu when VRClub is ready
const waitForAudioInit = setInterval(() => {
    if (window.vrClub) {
        clearInterval(waitForAudioInit);
        initAudioMenu();
    }
}, 100);

// =============================================================================
// MULTIPLAYER MENU
// =============================================================================

function initMultiplayerMenu() {
    const mpToggle = document.getElementById('multiplayerToggle');
    const mpMenu = document.getElementById('multiplayerMenu');
    const mpMinimize = document.getElementById('mpMinimize');
    const mpClose = document.getElementById('mpClose');
    const serverUrlInput = document.getElementById('serverUrl');
    const usernameInput = document.getElementById('username');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const playerList = document.getElementById('playerList');
    const playerListContent = document.getElementById('playerListContent');
    const mpStatus = document.getElementById('mpStatus');
    
    if (!mpToggle || !mpMenu) return;
    
    // Toggle menu
    mpToggle.addEventListener('click', () => {
        mpMenu.classList.toggle('hidden');
        if (!mpMenu.classList.contains('hidden')) {
            mpMenu.classList.remove('minimized');
        }
    });
    
    // Minimize/maximize
    if (mpMinimize) {
        mpMinimize.addEventListener('click', () => {
            mpMenu.classList.toggle('minimized');
            mpMinimize.textContent = mpMenu.classList.contains('minimized') ? '+' : '−';
        });
    }
    
    // Close
    if (mpClose) {
        mpClose.addEventListener('click', () => {
            mpMenu.classList.add('hidden');
        });
    }
    
    // Show status
    function showMPStatus(message, type = 'success') {
        if (!mpStatus) return;
        mpStatus.textContent = message;
        mpStatus.className = `audio-status ${type}`;
        mpStatus.style.display = 'block';
        setTimeout(() => {
            mpStatus.style.display = 'none';
        }, 3000);
    }
    
    // Update player list
    function updatePlayerList() {
        if (!vrClubInstance.networkManager || !vrClubInstance.networkManager.isConnected()) {
            if (playerList) playerList.style.display = 'none';
            return;
        }
        
        if (playerList) playerList.style.display = 'block';
        const avatars = vrClubInstance.avatarManager.getAllAvatars();
        const playerCount = avatars.length + 1; // +1 for local player
        
        let html = `<div style="margin-bottom: 8px; opacity: 0.7;">Total: ${playerCount} player${playerCount !== 1 ? 's' : ''}</div>`;
        html += `<div style="color: #00ff64; margin-bottom: 4px;">✓ You (${vrClubInstance.networkManager.username})</div>`;
        
        avatars.forEach(avatar => {
            html += `<div style="margin-bottom: 4px;">• ${avatar.username} ${avatar.isVR ? '🥽' : '🖥️'}</div>`;
        });
        
        if (playerListContent) playerListContent.innerHTML = html;
    }
    
    // Connect button
    if (connectBtn && serverUrlInput && usernameInput) {
        connectBtn.addEventListener('click', () => {
            const serverUrl = serverUrlInput.value.trim();
            const username = usernameInput.value.trim() || 'Guest';
            
            if (!serverUrl) {
                showMPStatus('Please enter a server URL', 'error');
                return;
            }
            
            showMPStatus('Connecting...', 'success');
            vrClubInstance.networkManager.connect(serverUrl, username);
            
            // Wait for connection
            setTimeout(() => {
                if (vrClubInstance.networkManager.isConnected()) {
                    connectBtn.style.display = 'none';
                    if (disconnectBtn) disconnectBtn.style.display = 'block';
                    serverUrlInput.disabled = true;
                    usernameInput.disabled = true;
                    showMPStatus('✅ Connected!', 'success');
                    updatePlayerList();
                    
                    // Update player list periodically
                    setInterval(updatePlayerList, 2000);
                }
            }, 500);
        });
    }
    
    // Disconnect button
    if (disconnectBtn && connectBtn && serverUrlInput && usernameInput) {
        disconnectBtn.addEventListener('click', () => {
            vrClubInstance.networkManager.disconnect();
            vrClubInstance.avatarManager.removeAllAvatars();
            
            connectBtn.style.display = 'block';
            disconnectBtn.style.display = 'none';
            serverUrlInput.disabled = false;
            usernameInput.disabled = false;
            if (playerList) playerList.style.display = 'none';
            
            showMPStatus('Disconnected', 'success');
        });
    }
    
    // Hide in VR mode (wait for scene to be ready)
    if (vrClubInstance && vrClubInstance.scene && vrClubInstance.scene.onXRSessionInit) {
        vrClubInstance.scene.onXRSessionInit.add(() => {
            mpMenu.classList.add('hidden');
            mpToggle.style.display = 'none';
        });
        
        vrClubInstance.scene.onXRSessionEnded.add(() => {
            mpToggle.style.display = 'block';
        });
    }
    
    console.log('✅ Multiplayer menu initialized');
}

// Initialize multiplayer menu when VRClub is ready
const waitForMPInit = setInterval(() => {
    if (window.vrClub) {
        clearInterval(waitForMPInit);
        initMultiplayerMenu();
    }
}, 100);
