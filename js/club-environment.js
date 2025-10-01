// Club Environment Component
AFRAME.registerComponent('club-environment', {
  init: function() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.currentLightMode = 'lasers'; // 'lasers', 'spotlights', 'strobes', 'mixed'
    this.lightModeTimer = 0;
    
    this.setupLasers();
    this.setupMusicSystem();
    this.setupNetworking();
    this.setupLightShowSequence();
  },

  setupLasers: function() {
    const lasersContainer = document.querySelector('#lasers');
    const emittersContainer = document.querySelector('#laser-emitters');
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#ffff00', '#00ffff'];
    
    // Create 6 laser systems with visible sources mounted on simplified truss
    const positions = [
      {x: -7, z: -8}, {x: 7, z: -8},
      {x: -7, z: -16}, {x: 7, z: -16},
      {x: -3.5, z: -12}, {x: 3.5, z: -12}
    ];

    positions.forEach((pos, i) => {
      // Create visible laser emitter mounted on truss
      const emitter = document.createElement('a-entity');
      emitter.setAttribute('position', `${pos.x} 7.5 ${pos.z}`);
      
      // Mounting bracket
      const bracket = document.createElement('a-box');
      bracket.setAttribute('width', '0.15');
      bracket.setAttribute('height', '0.25');
      bracket.setAttribute('depth', '0.15');
      bracket.setAttribute('position', '0 0.3 0');
      bracket.setAttribute('material', {
        color: '#2a2a2a',
        metalness: 0.9,
        roughness: 0.3
      });
      emitter.appendChild(bracket);

      // Laser housing
      const emitterBox = document.createElement('a-box');
      emitterBox.setAttribute('width', '0.3');
      emitterBox.setAttribute('height', '0.3');
      emitterBox.setAttribute('depth', '0.3');
      emitterBox.setAttribute('material', {
        color: '#0a0a0a',
        emissive: colors[i % colors.length],
        emissiveIntensity: 0,
        metalness: 0.9,
        roughness: 0.2
      });
      emitterBox.classList.add('laser-emitter');
      emitter.appendChild(emitterBox);

      // Lens
      const lens = document.createElement('a-circle');
      lens.setAttribute('radius', '0.12');
      lens.setAttribute('position', '0 0 0.16');
      lens.setAttribute('material', {
        color: colors[i % colors.length],
        emissive: colors[i % colors.length],
        emissiveIntensity: 0,
        metalness: 0.9,
        roughness: 0.1
      });
      lens.classList.add('laser-lens');
      emitter.appendChild(lens);
      
      emittersContainer.appendChild(emitter);

      // Create laser beam from emitter - extends from truss (7.5) down to floor (0)
      const laser = document.createElement('a-entity');
      
      // Position at the emitter location (top of the beam)
      laser.setAttribute('position', `${pos.x} 7.5 ${pos.z}`);
      
      // Beam cylinder - height is distance from truss to floor
      const beamHeight = 7.5;
      const beam = document.createElement('a-cylinder');
      beam.setAttribute('radius', '0.03');
      beam.setAttribute('height', beamHeight);
      // Position beam so top is at emitter, extends downward
      beam.setAttribute('position', `0 ${-beamHeight / 2} 0`);
      beam.setAttribute('material', {
        color: colors[0],  // Use same color for all beams initially
        emissive: colors[0],
        emissiveIntensity: 0,
        opacity: 0,
        transparent: true
      });
      beam.classList.add('laser-beam-cylinder');
      laser.appendChild(beam);
      
      // Rotate the entire laser entity (pivots at emitter position)
      const initialRotX = 5 + Math.random() * 15;   // Small angle from vertical (5-20 degrees)
      const initialRotY = Math.random() * 360;       // Random horizontal rotation
      laser.setAttribute('rotation', `${initialRotX} ${initialRotY} 0`);
      
      // Animate rotation to create sweeping effect
      laser.setAttribute('animation', {
        property: 'rotation',
        to: `${5 + Math.random() * 15} ${initialRotY + 360} 0`,
        loop: true,
        dur: 5000 + Math.random() * 3000,
        easing: 'linear'
      });
      laser.classList.add('laser-beam');
      
      lasersContainer.appendChild(laser);
    });
  },

  setupLightShowSequence: function() {
    // Initialize with first light mode
    setTimeout(() => {
      this.switchLightMode(this.currentLightMode);
    }, 1000); // Small delay to ensure scene is loaded

    // Alternate between different lighting modes
    setInterval(() => {
      this.lightModeTimer++;
      const modes = ['lasers', 'spotlights', 'strobes', 'mixed'];
      this.currentLightMode = modes[this.lightModeTimer % modes.length];
      this.switchLightMode(this.currentLightMode);
    }, 8000); // Switch every 8 seconds

    // Start animation loop for reactive lighting
    this.tick = this.tick.bind(this);
    this.el.sceneEl.addBehavior(this);
  },

  switchLightMode: function(mode) {
    const lasers = document.querySelectorAll('.laser-beam');
    const laserCylinders = document.querySelectorAll('.laser-beam-cylinder');
    const laserEmitters = document.querySelectorAll('.laser-emitter');
    const laserLenses = document.querySelectorAll('.laser-lens');
    const spotlights = document.querySelectorAll('#spotlight-1 [light], #spotlight-2 [light], #spotlight-3 [light], #spotlight-4 [light], #spotlight-5 [light]');
    const strobes = document.querySelectorAll('#strobe-1 [light], #strobe-2 [light], #strobe-3 [light], #strobe-4 [light], #strobe-5 [light]');
    const strobePlanes = document.querySelectorAll('#strobe-1 a-plane, #strobe-2 a-plane, #strobe-3 a-plane, #strobe-4 a-plane, #strobe-5 a-plane');
    const ledPanels = document.querySelectorAll('#led-panel-1 a-plane, #led-panel-2 a-plane, #led-panel-3 a-plane');

    // Debug logging
    console.log('Switching to mode:', mode);
    console.log('Found elements:', {
      laserCylinders: laserCylinders.length,
      spotlights: spotlights.length,
      strobes: strobes.length,
      ledPanels: ledPanels.length
    });

    // Color array for laser cycling
    const laserColors = ['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#ffff00', '#00ffff'];
    const currentColor = laserColors[this.lightModeTimer % laserColors.length];

    // Reset all
    laserCylinders.forEach(l => {
      l.setAttribute('material', 'opacity', 0);
      l.setAttribute('material', 'emissive', '#000000');
    });
    laserEmitters.forEach(e => e.setAttribute('material', 'emissive', '#000000'));
    laserLenses.forEach(l => l.setAttribute('material', 'emissive', '#000000'));
    spotlights.forEach(s => s.setAttribute('light', 'intensity', 0));
    strobes.forEach(s => s.setAttribute('light', 'intensity', 0));
    strobePlanes.forEach(b => b.setAttribute('material', 'emissive', '#000000'));
    ledPanels.forEach(p => p.setAttribute('material', 'emissive', '#000000'));

    switch(mode) {
      case 'lasers':
        // Set all lasers to the same color
        laserCylinders.forEach(l => {
          l.setAttribute('material', {
            color: currentColor,
            emissive: currentColor,
            opacity: 0.8
          });
        });
        laserEmitters.forEach(e => {
          e.setAttribute('material', 'emissive', currentColor);
        });
        laserLenses.forEach(l => {
          l.setAttribute('material', {
            color: currentColor,
            emissive: currentColor
          });
        });
        break;

      case 'spotlights':
        spotlights.forEach(s => s.setAttribute('light', 'intensity', 2.5));
        ledPanels.forEach((p, i) => {
          setTimeout(() => {
            p.setAttribute('material', 'emissive', '#ff00ff');
          }, i * 200);
        });
        break;

      case 'strobes':
        this.startStrobePattern(strobes, strobePlanes);
        break;

      case 'mixed':
        // Set all lasers to the same color in mixed mode too
        laserCylinders.forEach(l => {
          l.setAttribute('material', {
            color: currentColor,
            emissive: currentColor,
            opacity: 0.5
          });
        });
        laserEmitters.forEach(e => {
          e.setAttribute('material', 'emissive', currentColor);
        });
        laserLenses.forEach(l => {
          l.setAttribute('material', {
            color: currentColor,
            emissive: currentColor
          });
        });
        spotlights.forEach(s => s.setAttribute('light', 'intensity', 1.5));
        ledPanels.forEach(p => p.setAttribute('material', 'emissive', '#ff00ff'));
        break;
    }
  },

  startStrobePattern: function(strobes, strobePlanes) {
    let strobeIndex = 0;
    const strobeInterval = setInterval(() => {
      if (this.currentLightMode !== 'strobes') {
        clearInterval(strobeInterval);
        return;
      }

      // Turn off all strobes
      strobes.forEach(s => s.setAttribute('light', 'intensity', 0));
      strobePlanes.forEach(b => b.setAttribute('material', 'emissive', '#000000'));

      // Flash current strobe
      strobes[strobeIndex].setAttribute('light', 'intensity', 5);
      strobePlanes[strobeIndex].setAttribute('material', 'emissive', '#ffffff');

      setTimeout(() => {
        strobes[strobeIndex].setAttribute('light', 'intensity', 0);
        strobePlanes[strobeIndex].setAttribute('material', 'emissive', '#000000');
      }, 100);

      strobeIndex = (strobeIndex + 1) % strobes.length;
    }, 150);
  },

  tick: function(time, timeDelta) {
    // Update lights based on audio analysis with enhanced realism
    if (this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      
      // Get frequency bands
      const bass = this.getAverageFrequency(0, 10);
      const mid = this.getAverageFrequency(10, 40);
      const high = this.getAverageFrequency(40, 100);

      // Normalize values (0-1)
      const bassLevel = bass / 255;
      const midLevel = mid / 255;
      const highLevel = high / 255;

      // React disco ball to bass with enhanced intensity range
      const discoBall = document.querySelector('#disco-ball');
      if (discoBall) {
        const intensity = 2.5 + bassLevel * 2.5;
        const lights = discoBall.querySelectorAll('[light]');
        lights.forEach(light => {
          light.setAttribute('light', 'intensity', intensity);
        });
      }

      // React lasers to mid frequencies with volumetric effects
      if (this.currentLightMode === 'lasers' || this.currentLightMode === 'mixed') {
        const laserCylinders = document.querySelectorAll('.laser-beam-cylinder');
        laserCylinders.forEach((laser, i) => {
          const intensity = 1.2 + midLevel * 2.8;
          const opacity = 0.5 + midLevel * 0.5;
          const radius = 0.03 + midLevel * 0.02;
          laser.setAttribute('material', 'emissiveIntensity', intensity);
          laser.setAttribute('material', 'opacity', opacity);
          laser.setAttribute('radius', radius);
        });
        
        // React laser emitters
        const laserEmitters = document.querySelectorAll('.laser-emitter');
        laserEmitters.forEach(emitter => {
          const emissiveInt = 0.3 + midLevel * 0.7;
          const material = emitter.getAttribute('material');
          if (material) {
            material.emissiveIntensity = emissiveInt;
            emitter.setAttribute('material', material);
          }
        });
        
        // React laser lenses
        const laserLenses = document.querySelectorAll('.laser-lens');
        laserLenses.forEach(lens => {
          const emissiveInt = 0.5 + midLevel * 0.8;
          const material = lens.getAttribute('material');
          if (material) {
            material.emissiveIntensity = emissiveInt;
            lens.setAttribute('material', material);
          }
        });
      }

      // React LED panels to high frequencies with dynamic intensity
      const ledPanels = document.querySelectorAll('#led-wall-panels a-plane');
      ledPanels.forEach((panel, i) => {
        const intensity = 0.3 + highLevel * 1.2;
        panel.setAttribute('material', 'emissiveIntensity', intensity);
      });

      // React spotlights to mid frequencies
      if (this.currentLightMode === 'spotlights' || this.currentLightMode === 'mixed') {
        const spotlights = document.querySelectorAll('#spotlight-1, #spotlight-2, #spotlight-3, #spotlight-4, #spotlight-5');
        spotlights.forEach(spotlight => {
          const light = spotlight.querySelector('[light]');
          if (light) {
            const intensity = 1.8 + midLevel * 2.7;
            light.setAttribute('light', 'intensity', intensity);
          }
        });
      }

      // React ground haze to bass for atmospheric depth
      const hazes = document.querySelectorAll('#ground-haze a-plane');
      hazes.forEach((haze, i) => {
        const baseOpacity = [0.15, 0.1, 0.12][i] || 0.12;
        const opacity = baseOpacity + bassLevel * 0.18;
        haze.setAttribute('material', 'opacity', opacity);
      });
      
      // Subtle dust particle brightness variation
      const particles = document.querySelectorAll('#dust-particles a-sphere');
      particles.forEach((particle, i) => {
        const baseOpacity = [0.3, 0.2, 0.25, 0.2][i] || 0.2;
        const opacity = baseOpacity + highLevel * 0.15;
        particle.setAttribute('material', 'opacity', opacity);
      });
    }
  },

  getAverageFrequency: function(startIndex, endIndex) {
    let sum = 0;
    for (let i = startIndex; i < endIndex && i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    return sum / (endIndex - startIndex);
  },

  setupMusicSystem: function() {
    const musicControls = document.querySelector('.music-ui');
    const audioElement = document.querySelector('#club-music');
    let isPlaying = false;

    // Click handler for music controls
    musicControls.addEventListener('click', () => {
      if (!audioElement.src) {
        // Prompt for URL
        const url = prompt('Enter music stream URL (YouTube embed, direct MP3, or streaming URL):\n\nFor YouTube: Use format https://www.youtube.com/embed/VIDEO_ID\nFor SoundCloud: Use embed URL\nFor direct streams: Use direct MP3/stream URL');
        
        if (url) {
          // Handle different URL types
          if (url.includes('youtube.com') && !url.includes('embed')) {
            // Convert regular YouTube URL to embed
            const videoId = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
            if (videoId && videoId[1]) {
              alert('YouTube requires embedding. Please use: https://www.youtube.com/embed/' + videoId[1]);
              return;
            }
          }
          
          audioElement.src = url;
          audioElement.load();
          musicControls.setAttribute('text', 'value', '🎵 Music Loaded\nClick to Play/Pause');
        }
      } else {
        // Toggle play/pause
        if (isPlaying) {
          audioElement.pause();
          musicControls.setAttribute('text', 'value', '▶️ Click to Play');
          this.broadcastMusicState('pause');
        } else {
          audioElement.play().then(() => {
            // Setup audio analysis when music starts
            this.setupAudioAnalysis(audioElement);
          }).catch(err => {
            console.error('Error playing audio:', err);
            alert('Error playing audio. Make sure the URL is a valid audio stream and CORS is enabled.');
          });
          musicControls.setAttribute('text', 'value', '⏸️ Click to Pause');
          this.broadcastMusicState('play');
        }
        isPlaying = !isPlaying;
      }
    });

    // Sync audio with positional audio (so everyone hears it)
    audioElement.addEventListener('play', () => {
      console.log('Music started playing');
    });

    audioElement.addEventListener('error', (e) => {
      console.error('Audio error:', e);
      alert('Error loading audio. Please check the URL and CORS settings.');
    });
  },

  setupAudioAnalysis: function(audioElement) {
    if (this.audioContext) return; // Already setup

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create analyser
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      
      // Connect audio element to analyser
      const source = this.audioContext.createMediaElementSource(audioElement);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      console.log('Audio analysis enabled - lights will react to music!');
    } catch (error) {
      console.error('Error setting up audio analysis:', error);
      console.log('Lights will still work with timed patterns');
    }
  },

  broadcastMusicState: function(action) {
    // Broadcast music state to other players via networked-aframe
    const scene = document.querySelector('a-scene');
    if (scene.components && scene.components['networked-scene']) {
      NAF.connection.broadcastData('music-sync', {
        action: action,
        timestamp: Date.now()
      });
    }
  },

  setupNetworking: function() {
    const scene = document.querySelector('a-scene');
    
    // Wait for networked-scene to be ready
    scene.addEventListener('connected', () => {
      console.log('Connected to multiplayer server!');
      
      // Listen for music sync messages
      NAF.connection.subscribeToDataChannel('music-sync', (senderId, dataType, data) => {
        const audioElement = document.querySelector('#club-music');
        if (data.action === 'play') {
          audioElement.play();
        } else if (data.action === 'pause') {
          audioElement.pause();
        }
      });
    });

    scene.addEventListener('clientConnected', (evt) => {
      console.log('New player joined!', evt.detail.clientId);
    });

    scene.addEventListener('clientDisconnected', (evt) => {
      console.log('Player left', evt.detail.clientId);
    });
  }
});
