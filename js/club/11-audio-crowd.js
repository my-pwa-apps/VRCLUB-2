class VRClubAudioCrowd extends VRClubUI {
    _ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            this.audioDataArray = new Uint8Array(this.audioAnalyser.frequencyBinCount);

            // === CLUB MASTERING CHAIN ===
            // Real club PAs run a hard limiter + master gain so the room stays loud
            // without painful peaks. Routing the analyser through a DynamicsCompressor
            // gives that "wall of sound" feel and protects the user's hearing.
            try {
                this.audioCompressor = this.audioContext.createDynamicsCompressor();
                this.audioCompressor.threshold.value = -18;   // dB
                this.audioCompressor.knee.value = 24;
                this.audioCompressor.ratio.value = 6;         // Glue, not crush
                this.audioCompressor.attack.value = 0.003;
                this.audioCompressor.release.value = 0.18;

                this.audioMasterGain = this.audioContext.createGain();
                this.audioMasterGain.gain.value = 1.15;       // Slight push for "loud"

                // Source (added later) -> analyser -> compressor -> masterGain -> destination
                this.audioAnalyser.connect(this.audioCompressor);
                this.audioCompressor.connect(this.audioMasterGain);
                this.audioMasterGain.connect(this.audioContext.destination);
            } catch (err) {
                // Graceful fallback if compressor is unavailable
                log.warn('🎚️ Mastering chain unavailable, using direct routing:', err);
                this.audioAnalyser.connect(this.audioContext.destination);
            }

            log.info('🎚️ Audio context initialized (with mastering chain)');
        }
        // Resume if suspended (browser autoplay policy). Awaited via .catch() so
        // we surface failures instead of silently leaving the context suspended.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(err => log.warn('🎚️ AudioContext resume failed:', err));
        }
        return this.audioContext;
    }

    /**
     * Validate that a user-supplied audio URL is safe to hand to <audio src>.
     *
     * Rejects:
     *  - non-http(s)/blob schemes (javascript:, data:, file:, ws:, …)
     *  - URLs carrying embedded credentials (https://user:pass@host/…) which leak
     *    into network logs, referrers and error strings
     *  - plain http:// while the page itself is served over https, because the
     *    browser silently blocks the request as mixed content and the user is
     *    left with a stream that "just doesn't play"
     */
    _isSafeAudioUrl(url) {
        return AudioUtils.isSafeAudioUrl(url, window.location.href);
    }

    /**
     * Connect the (single) audio element to the analyser ONCE.
     * createMediaElementSource throws InvalidStateError if called twice for the
     * same element, so this guard is the source of truth for all audio entry points.
     */
    _connectAudioSourceOnce() {
        if (this.audioSource || !this.audioElement || !window.AudioContext) return;
        this._ensureAudioContext();
        try {
            this.audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            this.audioSource.connect(this.audioAnalyser);
            log.info('🎚️ Audio analyser connected');
        } catch (err) {
            log.warn('🎚️ Could not connect audio source:', err);
        }
    }

    /**
     * Swap the audio element src safely, revoking any previous blob URL to
     * avoid unbounded memory growth across file selections.
     */
    _setAudioSrc(newSrc) {
        if (!this.audioElement) return;
        const prev = this.audioElement.src;
        if (prev && prev.startsWith('blob:')) {
            try { URL.revokeObjectURL(prev); } catch (_) { /* ignore */ }
        }
        this.audioElement.src = newSrc;
    }
    
    getAudioData() {
        const frame = this._audioFrameData;
        if (!this.audioAnalyser || !this.audioDataArray ||
            !this.audioContext || this.audioContext.state !== 'running') {
            frame.bass = 0;
            frame.mid = 0;
            frame.treble = 0;
            frame.average = 0;
            frame.hasAudio = false;
            return frame;
        }
        
        this.audioAnalyser.getByteFrequencyData(this.audioDataArray);
        
        // Split frequency data into bass, mid, treble
        const bassEnd = Math.floor(this.audioDataArray.length * 0.1);
        const midEnd = Math.floor(this.audioDataArray.length * 0.5);
        
        let bassSum = 0, midSum = 0, trebleSum = 0;
        
        for (let i = 0; i < bassEnd; i++) {
            bassSum += this.audioDataArray[i];
        }
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += this.audioDataArray[i];
        }
        for (let i = midEnd; i < this.audioDataArray.length; i++) {
            trebleSum += this.audioDataArray[i];
        }
        
        const bass = bassSum / bassEnd / 255;
        const mid = midSum / (midEnd - bassEnd) / 255;
        const treble = trebleSum / (this.audioDataArray.length - midEnd) / 255;
        const average = (bass + mid + treble) / 3;
        
        // Check if audio is actually playing
        const hasAudio = average > 0.01;

        // === CORS-TAINTED STREAM DETECTION ===
        // A cross-origin stream WITHOUT `Access-Control-Allow-Origin` still plays
        // through <audio>, but the Web Audio graph receives a tainted (silent)
        // source, so every FFT bin reads 0 forever. Previously this looked exactly
        // like "the club just isn't reacting to the music" with nothing in the
        // console. Detect it and tell the user once.
        if (!this._corsWarningShown && this.audioElement &&
            !this.audioElement.paused && this.audioElement.currentTime > 2) {
            if (average === 0) {
                this._silentAnalyserFrames = (this._silentAnalyserFrames || 0) + 1;
                if (this._silentAnalyserFrames > 180) { // ~3 s of audible-but-silent analysis
                    this._corsWarningShown = true;
                    log.warn('🎚️ Analyser is receiving silence while audio is playing — the stream is likely blocked by CORS.');
                    this.showErrorMessage(
                        'Audio is playing but the visuals cannot react to it. ' +
                        'The stream server does not send an Access-Control-Allow-Origin header.'
                    );
                }
            } else {
                this._silentAnalyserFrames = 0;
            }
        }
        
        frame.bass = bass;
        frame.mid = mid;
        frame.treble = treble;
        frame.average = average;
        frame.hasAudio = hasAudio;
        return frame;
    }

    /**
     * Pulse VR controllers in time with bass hits.
     * Massive immersion gain — gives the user a physical "thump" on each kick drum,
     * substituting for the chest-rattling sub-bass of a real club PA.
     *
     * Throttled so we don't spam the haptic bus (which causes the actuator to
     * desync from audio). Honors `bassHapticsEnabled` so the user can opt out.
     */
    _updateBassHaptics(audioData) {
        if (!this.bassHapticsEnabled) return;
        if (!this._xrControllers || this._xrControllers.length === 0) return;
        if (!audioData || !audioData.hasAudio) return;

        const bass = audioData.bass || 0;
        if (bass < 0.55) return; // Only fire on real kicks, not ambient rumble

        const now = performance.now();
        // 4 Hz cap — matches typical kick-drum cadence (~140 BPM eighths)
        if (now - this._lastHapticPulseAt < 140) return;
        this._lastHapticPulseAt = now;

        const intensity = Math.min(1.0, (bass - 0.55) * 2.2); // 0..1
        const duration = 60 + Math.floor(intensity * 80);     // 60..140 ms

        for (let i = 0; i < this._xrControllers.length; i++) {
            const ctrl = this._xrControllers[i];
            try {
                const inputSource = ctrl && ctrl.inputSource;
                const gp = inputSource && inputSource.gamepad;
                if (!gp) continue;
                // Standards-compliant path (Quest browser supports this on WebXR gamepads)
                if (gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse) {
                    gp.hapticActuators[0].pulse(intensity, duration);
                } else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
                    gp.vibrationActuator.playEffect('dual-rumble', {
                        duration: duration,
                        strongMagnitude: intensity,
                        weakMagnitude: intensity * 0.6
                    });
                }
            } catch (_) { /* Per-controller failures must never break the audio loop */ }
        }
    }

    /**
     * Toggle photosensitive Safe Mode. Disables strobes and bloom flashes
     * for users with photosensitive epilepsy or migraine sensitivity.
     * Persists across sessions.
     */
    setPhotosensitiveSafeMode(enabled) {
        this.photosensitiveSafeMode = !!enabled;
        try { localStorage.setItem('vrclub.safeMode', this.photosensitiveSafeMode ? '1' : '0'); } catch (_) {}
        // Immediately quiet any in-flight strobe state
        if (this.photosensitiveSafeMode && this.strobes) {
            this.strobes.forEach((strobe) => {
                strobe.material.emissiveColor = this.cachedColors.black;
                if (strobe.light) {
                    strobe.light.intensity = 0;
                    strobe.light.setEnabled(false);
                }
                strobe.flashDuration = 0;
            });
            if (this.strobeFlashLight) {
                this.strobeFlashLight.intensity = 0;
                this.strobeFlashLight.setEnabled(false);
            }
        }
        log.info(`♿ Photosensitive Safe Mode: ${this.photosensitiveSafeMode ? 'ON (strobes disabled)' : 'OFF'}`);
        return this.photosensitiveSafeMode;
    }

    /**
     * Toggle bass-driven controller haptics. Persists across sessions.
     */
    setBassHapticsEnabled(enabled) {
        this.bassHapticsEnabled = !!enabled;
        try { localStorage.setItem('vrclub.bassHaptics', this.bassHapticsEnabled ? '1' : '0'); } catch (_) {}
        log.info(`📳 Bass haptics: ${this.bassHapticsEnabled ? 'ON' : 'OFF'}`);
        return this.bassHapticsEnabled;
    }

    /**
     * Normalise the materials that arrive inside an avatar GLB.
     *
     * Runs ONCE per source file, not once per dancer: every clone shares these
     * materials, so a single pass covers the whole crowd.
     */
    _prepareAvatarMaterials(materials) {
        const aniso = this.tierSettings.anisotropy;

        materials.forEach(mat => {
            // Exceeding the device light budget produces "Too many lights" and a
            // black character, so this applies to imported materials too.
            mat.maxSimultaneousLights = this.maxLights;

            // VR stereo rendering is hypersensitive to transparency and these GLBs
            // ship alpha channels they do not actually use - without this the crowd
            // renders see-through in the headset.
            mat.alpha = 1.0;
            mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
            if (mat.needAlphaBlending) mat.needAlphaBlending = () => false;
            if (mat.needAlphaTesting) mat.needAlphaTesting = () => false;

            // Depth write is what makes the crowd OCCLUDE the additive light beams
            // in rendering group 1 instead of letting them shine straight through.
            mat.disableDepthWrite = false;
            mat.forceDepthWrite = true;
            mat.backFaceCulling = true;

            [mat.albedoTexture, mat.diffuseTexture].forEach(tex => {
                if (!tex) return;
                tex.hasAlpha = false;
                tex.anisotropicFilteringLevel = aniso;
            });

            // Frozen once, here. Never inside the render loop - Material.freeze()
            // calls markDirty(), which walks every mesh in the scene.
            mat.freeze();
        });
    }

    /**
     * Clone one dancer out of a loaded AssetContainer and drop it into the club.
     *
     * @param {BABYLON.AssetContainer} container source GLB
     * @param {string} name                      unique node name
     * @param {BABYLON.Vector3} position         x/z placement; y is the floor to stand on
     * @param {number} facing                    world Y rotation, radians
     * @param {number} height                    real-world height in metres
     * @param {number} speedRatio                animation playback rate
     */
    _spawnAvatar(container, name, position, facing, height, speedRatio) {
        // doNotInstantiate: these are skinned meshes, so each dancer needs its own
        // skeleton and animation group to move independently. cloneMaterials stays
        // false so the whole crowd still shares one set of materials and textures.
        const entry = container.instantiateModelsToScene(
            nodeName => `${name}_${nodeName}`,
            false,
            { doNotInstantiate: true }
        );

        const root = entry.rootNodes[0];
        if (!root) {
            log.warn(`  ❌ ${name}: container produced no root node`);
            return null;
        }

        root.name = name;
        root.position.copyFrom(position);
        root.rotation.y = facing;
        root.scaling.setAll(1);
        root.computeWorldMatrix(true);

        // The three source GLBs are authored in wildly different units (one is
        // ~100x the others), so normalise on real-world height rather than
        // trusting the file's own scale.
        let bounds = root.getHierarchyBoundingVectors(true);
        const rawHeight = bounds.max.y - bounds.min.y;
        if (rawHeight > 1e-6) root.scaling.setAll(height / rawHeight);
        root.computeWorldMatrix(true);

        // Plant the feet on the requested surface. getHierarchyBoundingVectors()
        // already returns WORLD space, so this correction must not be re-scaled.
        bounds = root.getHierarchyBoundingVectors(true);
        root.position.y += position.y - bounds.min.y;
        root.computeWorldMatrix(true);

        entry.rootNodes.forEach(node => {
            node.getChildMeshes().forEach(mesh => {
                // Group 0 = opaque. Beams live in group 1 with additive blending and
                // are depth-tested against whatever group 0 already wrote.
                mesh.renderingGroupId = 0;
                mesh.isPickable = false;
            });
        });

        entry.animationGroups.forEach(group => {
            group.start(true);
            group.speedRatio = speedRatio;
            // Offset the phase, otherwise every clone of the same clip hits the same
            // pose on the same frame and the crowd looks like a chorus line.
            const span = group.to - group.from;
            if (span > 0) group.goToFrame(group.from + Math.random() * span);
        });

        this.npcAvatars.push({
            name,
            root,
            animations: entry.animationGroups,
            baseSpeed: speedRatio
        });

        return entry;
    }

    async createDancingNPCs() {
        // === CROWD + DJ ===
        // Only three animated avatar GLBs exist, and two of them are ~60 MB, so the
        // crowd is built by loading each file ONCE into an AssetContainer and then
        // instantiating it per dancer. That gives every dancer its own skeleton and
        // animation group (so nobody moves in lockstep) off a single download and a
        // single set of geometry buffers and materials.
        const crowdSize = Math.max(0, this.tierSettings.crowdSize | 0);
        const maxCrowdSize = Math.max(...Object.values(this.qualityTiers).map(tier => tier.crowdSize | 0));

        const avatarSources = [
            './js/models/avatars/Hip Hop Dancing.glb',
            './js/models/avatars/house.glb',
            './js/models/avatars/rumba_dancing_female_character.glb'
        ];

        log.info(`🕺 Loading ${avatarSources.length} avatar sources for a crowd of ${crowdSize}...`);

        const containers = [];
        for (const url of avatarSources) {
            try {
                const container = await BABYLON.SceneLoader.LoadAssetContainerAsync("", url, this.scene);
                this._prepareAvatarMaterials(container.materials);
                this._avatarContainers.push(container);
                containers.push(container);
            } catch (error) {
                log.warn(`  ❌ Failed to load avatar source ${url}: ${error.message}`);
                containers.push(null);
            }
        }

        const available = containers.filter(Boolean);
        if (available.length === 0) {
            log.warn('⚠️ No avatar sources loaded — the club will be empty');
            return;
        }
        // Fall back to whatever did load so a single missing file does not leave
        // holes in the crowd.
        const pick = index => containers[index] || available[index % available.length];

        // Hand-placed rather than randomised: the list is ordered so that the first
        // N slots are already well spread, which means a `balanced` tier still gets
        // an even crowd instead of everyone bunched in one corner.
        // `facing` is an offset from "square on to the DJ booth".
        // None of these fall inside the DJ platform footprint (x -3..3, z -20..-16).
        const crowdSlots = [
            { x: -3.4, z: -13.4, src: 0, height: 1.84, facing:  0.10 },
            { x:  3.2, z: -13.0, src: 2, height: 1.66, facing: -0.12 },
            { x:  0.4, z: -10.8, src: 1, height: 1.74, facing:  0.04 },
            { x: -6.0, z: -11.6, src: 1, height: 1.79, facing:  0.28 },
            { x:  5.6, z: -11.0, src: 0, height: 1.71, facing: -0.26 },
            { x: -1.4, z:  -8.6, src: 2, height: 1.62, facing:  0.08 },
            { x:  2.6, z: -15.0, src: 1, height: 1.88, facing: -0.06 },
            { x: -4.6, z: -15.2, src: 2, height: 1.69, facing:  0.16 },
            { x:  6.6, z:  -8.4, src: 1, height: 1.77, facing: -0.34 },
            { x: -6.8, z:  -8.0, src: 0, height: 1.81, facing:  0.36 },
            { x:  1.6, z:  -7.4, src: 2, height: 1.60, facing: -0.10 },
            { x: -7.4, z: -13.8, src: 2, height: 1.73, facing:  0.42 },
            { x:  7.2, z: -13.6, src: 0, height: 1.86, facing: -0.40 },
            { x: -0.6, z:  -6.4, src: 1, height: 1.68, facing:  0.02 }
        ];

        // Rotation.y = PI puts a source model's front toward -z, i.e. toward the booth.
        const FACING_BOOTH = Math.PI;

        crowdSlots.slice(0, maxCrowdSize).forEach((slot, i) => {
            const source = pick(slot.src);
            if (!source) return;
            this._spawnAvatar(
                source,
                `dancer${i}`,
                new BABYLON.Vector3(slot.x, 0, slot.z),
                FACING_BOOTH + slot.facing,
                slot.height,
                0.85 + (i % 5) * 0.07   // deterministic per-dancer tempo spread
            );
        });

        // === THE DJ ===
        // Stands on the 0.5 m riser in the 1 m gap between the LED wall (z=-20) and
        // the deck plinth (z=-19), facing the floor. Playback is dialled well down so
        // they read as working the decks rather than raving in the crowd.
        const djSource = pick(1);
        if (djSource) {
            this._spawnAvatar(
                djSource,
                'djPerformer',
                new BABYLON.Vector3(0, 0.5, -19.4),
                FACING_BOOTH + Math.PI,   // square on to the crowd
                1.78,
                0.55
            );
        }

        this._applyCrowdSize();
        this._refreshShadowCasters();

        log.info(`✅ Crowd ready: ${this.npcAvatars.length} animated characters (incl. the DJ)`);
    }

    _applyCrowdSize() {
        if (!this.npcAvatars) return;
        const target = Math.max(0, this.tierSettings.crowdSize | 0);
        this.npcAvatars.forEach(npc => {
            if (!npc.name.startsWith('dancer')) return;
            const index = Number(npc.name.slice('dancer'.length));
            const enabled = Number.isFinite(index) && index < target;
            npc.root.setEnabled(enabled);
            npc.animations.forEach(group => {
                if (enabled) {
                    if (group.isPaused && group.restart) group.restart();
                } else if (!group.isPaused && group.pause) {
                    group.pause();
                }
            });
        });
    }
    
    /**
     * @param {number} time
     * @param {object} [audioData] Analyser output for THIS frame, supplied by
     *   updateAnimations. This used to call getAudioData() itself, which meant two
     *   full getByteFrequencyData() reads plus two passes over every FFT bin every
     *   frame - and, more subtly, it incremented the CORS silent-stream frame
     *   counter twice, so the "~3 s of silence" heuristic actually fired after ~1.5 s.
     */
    updateDancingNPCs(time, audioData) {
        // GLB avatars animate themselves via their animation groups; this only
        // nudges playback rate so the floor visibly reacts to the low end.
        if (!this.npcAvatars || this.npcAvatars.length === 0) return;

        if (!audioData) audioData = this.getAudioData();
        // Previously this rolled a fresh Math.random() per animation per frame, which
        // made playback rates jitter wildly, and it never restored the base rate once
        // the bass dropped - the crowd stayed permanently sped up.
        const beatBoost = (audioData.hasAudio && audioData.bass > 0.3)
            ? 1.0 + (audioData.bass - 0.3) * 0.3
            : 1.0;

        if (Math.abs(beatBoost - this._npcBeatBoost) < 0.01) return;
        this._npcBeatBoost = beatBoost;

        for (let i = 0; i < this.npcAvatars.length; i++) {
            const npc = this.npcAvatars[i];
            if (!npc.animations) continue;
            for (let a = 0; a < npc.animations.length; a++) {
                npc.animations[a].speedRatio = npc.baseSpeed * beatBoost;
            }
        }
    }

    setupPerformanceMonitor() {
        // index.html has never contained an #fpsCounter element, so this lookup
        // always returned null and the whole FPS/debug overlay (including the
        // toggle wired in setupUI) was silently dead. Create the overlay here
        // instead of depending on markup that does not exist.
        this.fpsElement = document.getElementById('fpsCounter');
        if (!this.fpsElement) {
            const el = document.createElement('div');
            el.id = 'fpsCounter';
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = [
                'position:fixed', 'top:10px', 'left:10px', 'z-index:9998',
                'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                'color:#0f0', 'background:rgba(0,0,0,0.55)', 'padding:6px 10px',
                'border-radius:6px', 'white-space:pre', 'pointer-events:none',
                'display:none'
            ].join(';');
            document.body.appendChild(el);
            this.fpsElement = el;
        }
        this.lastTime = performance.now();
        this.frames = 0;
        this.fps = 0;
        this.drawCallsPerFrame = 0;
        this._lastDrawCallCount = this.engine && this.engine._drawCalls
            ? this.engine._drawCalls.current
            : 0;
        this.debugMode = false;
    }

    updatePerformanceMonitor() {
        this.frames++;
        const now = performance.now();
        
        if (now >= this.lastTime + 1000) {
            const sampledFrames = this.frames;
            this.fps = Math.round((sampledFrames * 1000) / (now - this.lastTime));
            if (this.engine && this.engine._drawCalls && sampledFrames > 0) {
                const currentDrawCalls = this.engine._drawCalls.current;
                this.drawCallsPerFrame = Math.round(
                    (currentDrawCalls - this._lastDrawCallCount) / sampledFrames
                );
                this._lastDrawCallCount = currentDrawCalls;
            }
            this.frames = 0;
            this.lastTime = now;
            
            // Only update if element exists
            if (this.fpsElement) {
                this.fpsElement.style.display = this.debugMode ? 'block' : 'none';
                if (!this.debugMode) return;
                const color = this.fps >= 60 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
                let text = `FPS: ${this.fps}`;
                
                if (this.debugMode) {
                    const pos = this.camera.position;
                    text += `\nX: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
                    text += `\nDraws: ${this.drawCallsPerFrame}`;
                    text += `\nMeshes: ${this.scene.getActiveMeshes().length}/${this.scene.meshes.length}`;
                    text += `\nMaterials: ${this.scene.materials.length}`;
                }
                
                this.fpsElement.textContent = text;
                this.fpsElement.style.color = color;
            }
        }
    }

}
window.VRClubAudioCrowd = VRClubAudioCrowd;
