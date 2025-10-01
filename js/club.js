// VR Club - Babylon.js Implementation
// Clean, optimized code for Quest 3S

class VRClub {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.engine = new BABYLON.Engine(this.canvas, true, {
            preserveDrawingBuffer: true,
            stencil: true
        });
        
        this.audioContext = null;
        this.audioAnalyser = null;
        this.audioSource = null;
        this.audioElement = null;
        
        this.init();
    }

    async init() {
        // Create scene
        this.scene = new BABYLON.Scene(this.engine);
        this.scene.clearColor = new BABYLON.Color3(0.02, 0.02, 0.05);
        
        // Enable VR
        const vrHelper = await this.scene.createDefaultXRExperienceAsync({
            floorMeshes: []
        });
        
        // Setup camera for non-VR testing - Enhanced controls
        this.camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 1.7, -10), this.scene);
        this.camera.setTarget(new BABYLON.Vector3(0, 1.7, 0));
        this.camera.attachControl(this.canvas, true);
        this.camera.speed = 0.3;
        this.camera.applyGravity = true;
        this.camera.ellipsoid = new BABYLON.Vector3(0.5, 0.9, 0.5);
        this.camera.checkCollisions = true;
        
        // Enhanced camera controls for testing
        this.camera.keysUp = [87]; // W
        this.camera.keysDown = [83]; // S
        this.camera.keysLeft = [65]; // A
        this.camera.keysRight = [68]; // D
        this.camera.keysUpward = [69]; // E (fly up)
        this.camera.keysDownward = [81]; // Q (fly down)
        
        // Mouse sensitivity for easier viewing
        this.camera.angularSensibility = 2000;
        this.camera.inertia = 0.9;
        
        // Lighting - BRIGHT and CLEAR
        const ambient = new BABYLON.HemisphericLight("ambient", new BABYLON.Vector3(0, 1, 0), this.scene);
        ambient.intensity = 1.5;
        ambient.diffuse = new BABYLON.Color3(0.8, 0.8, 0.9);
        ambient.groundColor = new BABYLON.Color3(0.3, 0.3, 0.4);
        
        // Main directional light
        const mainLight = new BABYLON.DirectionalLight("main", new BABYLON.Vector3(0, -1, 0.5), this.scene);
        mainLight.position = new BABYLON.Vector3(0, 10, -10);
        mainLight.intensity = 2.0;
        
        // Additional point lights for atmosphere
        const light1 = new BABYLON.PointLight("light1", new BABYLON.Vector3(-10, 3, -10), this.scene);
        light1.intensity = 2.0;
        light1.diffuse = new BABYLON.Color3(0.8, 0.6, 1.0);
        
        const light2 = new BABYLON.PointLight("light2", new BABYLON.Vector3(10, 3, -10), this.scene);
        light2.intensity = 2.0;
        light2.diffuse = new BABYLON.Color3(1.0, 0.6, 0.8);
        
        // Back wall light for LED wall
        const backLight = new BABYLON.PointLight("backLight", new BABYLON.Vector3(0, 3, -23), this.scene);
        backLight.intensity = 5.0;
        backLight.range = 25;
        
        // Build the club
        this.createFloor();
        this.createWalls();
        this.createDJBooth();
        this.createLEDWall();
        this.createLasers();
        this.createLights();
        
        // Setup UI
        this.setupUI(vrHelper);
        
        // Setup FPS counter
        this.setupPerformanceMonitor();
        
        // Start render loop
        this.engine.runRenderLoop(() => {
            this.scene.render();
            this.updateAnimations();
            this.updatePerformanceMonitor();
        });
        
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
        
        console.log('%c✅ VR Club initialized successfully!', 'color: #4ade80; font-weight: bold; font-size: 14px;');
        console.log('%c🎨 Features Active:', 'color: #667eea; font-weight: bold;');
        console.log('  • LED Wall: 24 panels with 6 animated patterns');
        console.log('  • Lasers: 6 systems with color cycling');
        console.log('  • Spotlights: 5 dynamic lights');
        console.log('  • Lighting: Bright environment optimized');
        console.log('%c💡 Ready to use!', 'color: #4ade80; font-weight: bold;');
        console.log('  Desktop: Use WASD to move, mouse to look around');
        console.log('  VR: Click "Enter VR" button (requires Quest 3S connected)');
    }

    createFloor() {
        const floor = BABYLON.MeshBuilder.CreateGround("floor", {
            width: 30,
            height: 40
        }, this.scene);
        floor.position.z = -10;
        floor.checkCollisions = true;
        
        const floorMat = new BABYLON.StandardMaterial("floorMat", this.scene);
        floorMat.diffuseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        floorMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        floor.material = floorMat;
    }

    createWalls() {
        // Back wall
        const backWall = BABYLON.MeshBuilder.CreateBox("backWall", {
            width: 30,
            height: 8,
            depth: 0.5
        }, this.scene);
        backWall.position = new BABYLON.Vector3(0, 4, -25);
        backWall.checkCollisions = true;
        
        const wallMat = new BABYLON.StandardMaterial("wallMat", this.scene);
        wallMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.12);
        wallMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        backWall.material = wallMat;
        
        // Side walls
        const leftWall = BABYLON.MeshBuilder.CreateBox("leftWall", {
            width: 0.5,
            height: 8,
            depth: 40
        }, this.scene);
        leftWall.position = new BABYLON.Vector3(-15, 4, -10);
        leftWall.checkCollisions = true;
        leftWall.material = wallMat;
        
        const rightWall = leftWall.clone("rightWall");
        rightWall.position = new BABYLON.Vector3(15, 4, -10);
    }

    createDJBooth() {
        // DJ platform
        const platform = BABYLON.MeshBuilder.CreateBox("djPlatform", {
            width: 8,
            height: 1.5,
            depth: 4
        }, this.scene);
        platform.position = new BABYLON.Vector3(0, 0.75, -22);
        
        const platformMat = new BABYLON.StandardMaterial("platformMat", this.scene);
        platformMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.25);
        platform.material = platformMat;
        
        // DJ table
        const table = BABYLON.MeshBuilder.CreateBox("djTable", {
            width: 6,
            height: 1,
            depth: 2
        }, this.scene);
        table.position = new BABYLON.Vector3(0, 2, -22);
        
        const tableMat = new BABYLON.StandardMaterial("tableMat", this.scene);
        tableMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.15);
        tableMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        table.material = tableMat;
        
        // DJ equipment
        const equipment = BABYLON.MeshBuilder.CreateBox("equipment", {
            width: 4,
            height: 0.3,
            depth: 1.5
        }, this.scene);
        equipment.position = new BABYLON.Vector3(0, 2.65, -22);
        
        const equipMat = new BABYLON.StandardMaterial("equipMat", this.scene);
        equipMat.diffuseColor = new BABYLON.Color3(0.3, 0.3, 0.35);
        equipMat.emissiveColor = new BABYLON.Color3(0.1, 0.3, 0.5);
        equipment.material = equipMat;
    }

    createLEDWall() {
        console.log('🎨 Creating LED Wall...');
        
        this.ledPanels = [];
        const panelWidth = 1.5;
        const panelHeight = 1.3;
        const cols = 6;
        const rows = 4;
        const startX = -(cols * panelWidth) / 2 + panelWidth / 2;
        const startY = 5.5;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const panel = BABYLON.MeshBuilder.CreatePlane(`ledPanel_${row}_${col}`, {
                    width: panelWidth,
                    height: panelHeight
                }, this.scene);
                
                const x = startX + col * panelWidth;
                const y = startY - row * panelHeight;
                panel.position = new BABYLON.Vector3(x, y, -24.5);
                
                const mat = new BABYLON.StandardMaterial(`ledMat_${row}_${col}`, this.scene);
                mat.emissiveColor = new BABYLON.Color3(1, 0, 0);
                mat.disableLighting = true;
                panel.material = mat;
                
                this.ledPanels.push({
                    mesh: panel,
                    material: mat,
                    col: col,
                    row: row
                });
            }
        }
        
        console.log(`✅ LED Wall created with ${this.ledPanels.length} panels`);
        
        // Animation time
        this.ledAnimTime = 0;
        this.ledPattern = 0;
        this.ledColorIndex = 0;
        this.ledColors = [
            new BABYLON.Color3(1, 0, 0),    // Red
            new BABYLON.Color3(0, 1, 0),    // Green
            new BABYLON.Color3(0, 0, 1),    // Blue
            new BABYLON.Color3(1, 0, 1),    // Magenta
            new BABYLON.Color3(1, 1, 0),    // Yellow
            new BABYLON.Color3(0, 1, 1)     // Cyan
        ];
    }

    createLasers() {
        // Laser emitters on truss
        this.lasers = [];
        const laserPositions = [
            new BABYLON.Vector3(-8, 7, -5),
            new BABYLON.Vector3(-4, 7, -5),
            new BABYLON.Vector3(0, 7, -5),
            new BABYLON.Vector3(4, 7, -5),
            new BABYLON.Vector3(8, 7, -5),
            new BABYLON.Vector3(0, 7, -15)
        ];
        
        laserPositions.forEach((pos, i) => {
            // Emitter head
            const emitter = BABYLON.MeshBuilder.CreateCylinder(`laser${i}`, {
                diameter: 0.4,
                height: 0.6
            }, this.scene);
            emitter.position = pos;
            emitter.rotation.x = Math.PI / 2;
            
            const emitterMat = new BABYLON.StandardMaterial(`laserMat${i}`, this.scene);
            emitterMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
            emitterMat.specularColor = new BABYLON.Color3(0.8, 0.8, 0.8);
            emitter.material = emitterMat;
            
            // Laser beam (will be animated)
            const beam = BABYLON.MeshBuilder.CreateCylinder(`beam${i}`, {
                diameter: 0.1,
                height: 10
            }, this.scene);
            beam.position = pos.clone();
            beam.position.y -= 5;
            
            const beamMat = new BABYLON.StandardMaterial(`beamMat${i}`, this.scene);
            beamMat.emissiveColor = new BABYLON.Color3(0, 1, 0);
            beamMat.alpha = 0.6;
            beamMat.disableLighting = true;
            beam.material = beamMat;
            
            this.lasers.push({ emitter, beam, material: beamMat });
        });
    }

    createLights() {
        // Spotlights
        this.spotlights = [];
        const spotPositions = [
            new BABYLON.Vector3(-6, 7, -8),
            new BABYLON.Vector3(-3, 7, -8),
            new BABYLON.Vector3(0, 7, -8),
            new BABYLON.Vector3(3, 7, -8),
            new BABYLON.Vector3(6, 7, -8)
        ];
        
        spotPositions.forEach((pos, i) => {
            const spot = new BABYLON.SpotLight(
                `spot${i}`,
                pos,
                new BABYLON.Vector3(0, -1, 0),
                Math.PI / 4,
                2,
                this.scene
            );
            spot.intensity = 0;
            spot.diffuse = new BABYLON.Color3(1, 1, 1);
            this.spotlights.push(spot);
        });
    }

    updateAnimations() {
        const deltaTime = this.engine.getDeltaTime();
        this.ledAnimTime += deltaTime / 1000;
        
        // Update LED wall
        if (this.ledPanels && this.ledPanels.length > 0) {
            // Change pattern every 15 seconds
            this.ledPattern = Math.floor(this.ledAnimTime / 15) % 6;
            
            // Change color every 10 seconds
            this.ledColorIndex = Math.floor(this.ledAnimTime / 10) % this.ledColors.length;
            const currentColor = this.ledColors[this.ledColorIndex];
            
            this.ledPanels.forEach(panelData => {
                const { col, row, material } = panelData;
                let brightness = 0;
                
                switch(this.ledPattern) {
                    case 0: // Horizontal wave
                        const wavePos = (this.ledAnimTime * 2) % 6;
                        brightness = Math.max(0, 1 - Math.abs(col - wavePos) * 0.5);
                        break;
                    case 1: // Vertical wave
                        const waveRow = (this.ledAnimTime * 2) % 4;
                        brightness = Math.max(0, 1 - Math.abs(row - waveRow) * 0.5);
                        break;
                    case 2: // Checkerboard pulse
                        const pulse = (Math.sin(this.ledAnimTime * 2) + 1) / 2;
                        brightness = ((row + col) % 2 === 0) ? pulse : 0;
                        break;
                    case 3: // Scan lines
                        const scanLine = (this.ledAnimTime * 2) % 4;
                        brightness = Math.max(0, 1 - Math.abs(row - scanLine) * 0.5);
                        break;
                    case 4: // Ripple from center
                        const centerX = 2.5, centerY = 1.5;
                        const dist = Math.sqrt((col - centerX) ** 2 + (row - centerY) ** 2);
                        const ripple = (this.ledAnimTime * 2) % 6;
                        brightness = Math.max(0, 1 - Math.abs(dist - ripple) * 0.5);
                        break;
                    case 5: // Breathing
                        brightness = (Math.sin(this.ledAnimTime * 3) + 1) / 2;
                        break;
                }
                
                // Boost minimum brightness so panels are always visible
                brightness = 0.4 + brightness * 0.6;
                
                material.emissiveColor = currentColor.scale(brightness);
            });
        }
        
        // Animate lasers
        if (this.lasers) {
            this.lasers.forEach((laser, i) => {
                const time = this.ledAnimTime + i;
                const color = this.ledColors[Math.floor(time / 3) % this.ledColors.length];
                laser.material.emissiveColor = color.scale(0.8);
                laser.beam.rotation.z = Math.sin(time) * 0.3;
            });
        }
        
        // Animate spotlights
        if (this.spotlights) {
            this.spotlights.forEach((spot, i) => {
                spot.intensity = (Math.sin(this.ledAnimTime * 2 + i) + 1) * 3;
                const colorTime = this.ledAnimTime + i;
                const colorIndex = Math.floor(colorTime / 3) % this.ledColors.length;
                spot.diffuse = this.ledColors[colorIndex];
            });
        }
    }

    setupUI(vrHelper) {
        // Camera presets for testing different views
        this.cameraPresets = {
            entrance: { position: new BABYLON.Vector3(0, 1.7, -10), target: new BABYLON.Vector3(0, 1.7, 0) },
            danceFloor: { position: new BABYLON.Vector3(0, 1.7, -12), target: new BABYLON.Vector3(0, 3, -24) },
            djBooth: { position: new BABYLON.Vector3(0, 2.5, -18), target: new BABYLON.Vector3(0, 3, -24) },
            ledWallClose: { position: new BABYLON.Vector3(0, 3, -21), target: new BABYLON.Vector3(0, 3, -24) },
            overview: { position: new BABYLON.Vector3(-12, 6, -12), target: new BABYLON.Vector3(0, 2, -15) },
            ceiling: { position: new BABYLON.Vector3(0, 7, -12), target: new BABYLON.Vector3(0, 0, -15) }
        };
        
        // VR button
        const vrButton = document.getElementById('vr');
        vrButton.addEventListener('click', async () => {
            if (vrHelper && vrHelper.baseExperience) {
                try {
                    console.log('🎮 Attempting to enter VR mode...');
                    await vrHelper.baseExperience.enterXRAsync('immersive-vr', 'local-floor');
                    console.log('✅ VR mode entered successfully!');
                } catch (error) {
                    console.warn('⚠️ VR not available:', error.message);
                    alert('VR Not Available\n\n' +
                          'This requires:\n' +
                          '• Meta Quest 3S connected via Link/Air Link\n' +
                          '• OR Firefox Reality browser\n' +
                          '• OR Chrome with WebXR Device API\n\n' +
                          'Desktop mode works without VR!');
                }
            }
        });
        
        // Camera preset buttons
        document.querySelectorAll('[data-camera-preset]').forEach(button => {
            button.addEventListener('click', () => {
                const preset = button.dataset.cameraPreset;
                this.moveCameraToPreset(preset);
            });
        });
        
        // Music setup
        document.getElementById('play').addEventListener('click', () => {
            const url = document.getElementById('music').value;
            if (url) {
                this.playMusic(url);
            } else {
                alert('Please enter a music stream URL');
            }
        });
        
        // Keyboard shortcuts info
        window.addEventListener('keydown', (e) => {
            if (e.key === 'h' || e.key === 'H') {
                this.showHelp();
            }
        });
    }
    
    moveCameraToPreset(presetName) {
        const preset = this.cameraPresets[presetName];
        if (preset) {
            // Smooth transition
            BABYLON.Animation.CreateAndStartAnimation(
                'cameraMove',
                this.camera,
                'position',
                60,
                30,
                this.camera.position.clone(),
                preset.position,
                BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
            );
            
            this.camera.setTarget(preset.target);
            console.log(`📷 Camera moved to: ${presetName}`);
        }
    }
    
    showHelp() {
        const helpText = `
🎮 DESKTOP TESTING CONTROLS:

MOVEMENT:
  W - Move forward
  S - Move backward
  A - Strafe left
  D - Strafe right
  Q - Fly down
  E - Fly up
  Mouse - Look around

CAMERA PRESETS (Click UI buttons):
  1 - Entrance view
  2 - Dance floor (see LED wall)
  3 - DJ booth view
  4 - LED wall close-up
  5 - Overview (full club)
  6 - Ceiling view (see lasers)

SHORTCUTS:
  H - Show this help
  ESC - Exit VR mode

TESTING CHECKLIST:
  ✓ LED wall animating?
  ✓ Lasers visible?
  ✓ Spotlights pulsing?
  ✓ Scene bright enough?
  ✓ Smooth movement?
        `;
        console.log(helpText);
        alert(helpText);
    }

    playMusic(url) {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
        }
        
        if (this.audioElement) {
            this.audioElement.pause();
        }
        
        this.audioElement = new Audio(url);
        this.audioElement.crossOrigin = "anonymous";
        this.audioElement.loop = true;
        
        this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
        this.audioSource.connect(this.audioAnalyser);
        this.audioAnalyser.connect(this.audioContext.destination);
        
        this.audioElement.play().then(() => {
            console.log('🎵 Music playing!');
        }).catch(err => {
            console.error('Music playback error:', err);
        });
    }
    
    setupPerformanceMonitor() {
        // Create FPS display element
        const fpsDiv = document.createElement('div');
        fpsDiv.id = 'fps-monitor';
        fpsDiv.style.cssText = `
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.9);
            color: #4ade80;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            font-weight: bold;
            z-index: 1000;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(74,222,128,0.3);
            min-width: 100px;
            text-align: center;
        `;
        fpsDiv.innerHTML = 'FPS: --';
        document.body.appendChild(fpsDiv);
        
        this.fpsDiv = fpsDiv;
        this.fpsUpdateCounter = 0;
    }
    
    updatePerformanceMonitor() {
        // Update FPS every 10 frames
        this.fpsUpdateCounter++;
        if (this.fpsUpdateCounter >= 10) {
            const fps = Math.round(this.engine.getFps());
            if (this.fpsDiv) {
                this.fpsDiv.innerHTML = `FPS: ${fps}`;
                
                // Color based on performance
                if (fps >= 55) {
                    this.fpsDiv.style.color = '#4ade80'; // Green
                    this.fpsDiv.style.borderColor = 'rgba(74,222,128,0.3)';
                } else if (fps >= 30) {
                    this.fpsDiv.style.color = '#fbbf24'; // Yellow
                    this.fpsDiv.style.borderColor = 'rgba(251,191,36,0.3)';
                } else {
                    this.fpsDiv.style.color = '#ef4444'; // Red
                    this.fpsDiv.style.borderColor = 'rgba(239,68,68,0.3)';
                }
            }
            this.fpsUpdateCounter = 0;
        }
    }
}

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new VRClub();
});
