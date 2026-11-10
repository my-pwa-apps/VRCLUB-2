/* Shared restroom fixtures; audio stays outside the music/analyser graph. */
'use strict';
class RestroomInteractions {
    constructor(club) {
        this.club = club;
        this.state = RestroomInteractions.initialState();
        this.toilets = [];
        this.sinks = [];
        this.meshes = [];
        this.sounds = new Map();
        this.retiringSounds = new Set();
        this.disposed = false;
        this.elapsed = 0;
        this._point = new BABYLON.Vector3();
    }

    static initialState() {
        return { seats: [false, false], lids: [true, true], taps: [0, 0], flushes: [0, 0] };
    }

    now() {
        return this.club.networkManager?.connected ? this.club.networkManager.serverNow() : Date.now();
    }

    apply(state) {
        if (state === null) {
            this.state = RestroomInteractions.initialState();
            this._stopSounds();
            return true;
        }
        if (!state || !['seats', 'lids', 'taps', 'flushes'].every(key => Array.isArray(state[key]) && state[key].length === 2) ||
            !state.seats.every(value => typeof value === 'boolean') || !state.lids.every(value => typeof value === 'boolean') ||
            !state.taps.concat(state.flushes).every(value => Number.isSafeInteger(value) && value >= 0 && value <= this.now() + 30000) ||
            state.seats.some((on, index) => on && !state.lids[index])) {
            this.club.showErrorMessage('Invalid shared restroom state.');
            return false;
        }
        this.state = { seats: state.seats.slice(), lids: state.lids.slice(),
            taps: state.taps.slice(), flushes: state.flushes.slice() };
        return true;
    }

    occupied(index, refresh = true) {
        if (refresh) this.club._scanRemoteToilets();
        return this.club._activeSeat?.id === `toilet-${index}` || this.club._restroomDoors?.[index]?.remote === true;
    }

    action(action, fixture, on) {
        if (this.disposed) return false;
        if (!['seat', 'lid', 'tap', 'flush'].includes(action) || !Number.isInteger(fixture) || fixture < 0 || fixture > 1 ||
            (action !== 'flush' && typeof on !== 'boolean')) {
            this.club.showErrorMessage('Invalid restroom control.');
            return false;
        }
        if ((action === 'seat' || action === 'lid') && this.occupied(fixture)) {
            this.club.showErrorMessage('This toilet is occupied.');
            return false;
        }
        if (this.club.networkManager?.connected) return this.club.networkManager.sendRestroom(action, fixture, on);
        const state = this.state, now = this.now();
        if (action === 'seat') {
            state.seats[fixture] = on;
            if (on) state.lids[fixture] = true;
        } else if (action === 'lid') {
            state.lids[fixture] = on;
            if (!on) state.seats[fixture] = false;
        } else if (action === 'tap') {
            state.taps[fixture] = on ? now + 12000 : 0;
        } else {
            const last = state.flushes[fixture];
            if (last && now < last + 9000) {
                this.club.showErrorMessage('Please wait before flushing again.');
                return false;
            }
            state.flushes[fixture] = now + 6000;
        }
        return true;
    }

    press(pick) {
        const control = pick?.pickedMesh?.metadata?.vrclubRestroom;
        if (!control) return false;
        const camera = this.club.isInVRMode ? this.club.vrHelper?.baseExperience?.camera : this.club.camera;
        const eye = camera?.globalPosition || camera?.position;
        if (!eye || !pick.pickedPoint || BABYLON.Vector3.DistanceSquared(eye, pick.pickedPoint) > 9) {
            this.club.showErrorMessage('Move closer to use this fixture.');
            return true;
        }
        const { action, fixture } = control;
        const on = action === 'tap' ? this.state.taps[fixture] <= this.now() :
            action === 'seat' ? !this.state.seats[fixture] : !this.state.lids[fixture];
        if (this.action(action, fixture, on)) {
            this.club.showErrorMessage(this.club.networkManager?.connected ? 'Restroom change requested.' :
                action === 'flush' ? 'Flushing' : action === 'tap' ?
                (on ? 'Water on for 12 seconds. Hold your hands under the tap.' : 'Water off') :
                `${action === 'seat' ? 'Toilet seat' : 'Toilet lid'} ${on ? 'raised' : 'lowered'}`);
        }
        return true;
    }

    _material() {
        if (!this.waterMaterial) this.waterMaterial = this.club.materialFactory.createStandardMaterial('restroomWaterMat', {
            diffuseColor: [0.16, 0.36, 0.43], emissiveColor: [0.035, 0.065, 0.08], disableLighting: true
        });
        return this.waterMaterial;
    }

    _position(mesh, x, y, z) {
        mesh.computeWorldMatrix(true);
        this._point.set(x, y, z);
        BABYLON.Vector3.TransformCoordinatesToRef(this._point, mesh.getWorldMatrix(), this._point);
        return this._point;
    }

    _control(name, action, fixture, position, label) {
        const cap = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.085, height: 0.02, tessellation: 16 }, this.club.scene);
        cap.position.copyFrom(position);
        cap.material = this.club.materialFactory.getPreset('stanchionPost');
        cap.metadata = { vrclubRestroom: { action, fixture } };
        cap.isPickable = true;
        this.meshes.push(cap);
        this._label(cap, label);
        return cap;
    }

    _label(control, text) {
        if (!this.labelTexture) {
            this.labelTexture = new BABYLON.DynamicTexture('restroomControlsAtlas', { width: 512, height: 256 }, this.club.scene, true);
            const ctx = this.labelTexture.getContext();
            ctx.fillStyle = '#14181c'; ctx.fillRect(0, 0, 512, 256);
            ctx.font = 'bold 38px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
            ['FLUSH', 'SEAT', 'LID', 'TAP'].forEach((word, i) => ctx.fillText(word, 128 + (i % 2) * 256, 64 + Math.floor(i / 2) * 128));
            this.labelTexture.update();
            this.labelMaterial = this.club.materialFactory.createStandardMaterial('restroomControlLabelsMat', {
                diffuseColor: [1, 1, 1], emissiveColor: [0.2, 0.2, 0.2], disableLighting: true
            });
            this.labelMaterial.diffuseTexture = this.labelTexture;
        }
        const index = ['FLUSH', 'SEAT', 'LID', 'TAP'].indexOf(text);
        const face = BABYLON.MeshBuilder.CreatePlane(`${control.name}Label`, { width: 0.14, height: 0.07 }, this.club.scene);
        face.position.copyFrom(control.position); face.position.y += 0.012;
        face.rotation.x = Math.PI / 2;
        face.material = this.labelMaterial;
        const u = (index % 2) / 2, v = Math.floor(index / 2) / 2;
        face.setVerticesData(BABYLON.VertexBuffer.UVKind, [u, v, u + 0.5, v, u + 0.5, v + 0.5, u, v + 0.5]);
        face.metadata = control.metadata;
        face.isPickable = true;
        this.meshes.push(face);
    }

    attachToilet(meshes, index) {
        const body = meshes.find(mesh => /Bathroom_Toilet$/.test(mesh.name));
        const seat = meshes.find(mesh => /toiletSeat$/.test(mesh.name));
        const lid = meshes.find(mesh => /toiletLid$/.test(mesh.name));
        if (!body || !seat || !lid) {
            this.club.showErrorMessage('The toilet seat controls could not be prepared.');
            return;
        }
        // Coordinates are measured in the Quaternius source, before its glTF and placement transforms.
        const point = this._position(body, 0, 0.0055, 0.0188756).clone();
        ['flush', 'seat', 'lid'].forEach((action, i) => {
            const place = point.clone(); place.z += (i - 1) * 0.14;
            this._control(`restroom${action}${index}`, action, index, place, action.toUpperCase());
        });
        seat.metadata = { ...seat.metadata, vrclubRestroom: { action: 'seat', fixture: index } };
        lid.metadata = { ...lid.metadata, vrclubRestroom: { action: 'lid', fixture: index } };
        seat.isPickable = true; lid.isPickable = true;
        const water = BABYLON.MeshBuilder.CreateCylinder(`restroomFlushWater${index}`,
            { diameter: 0.22, height: 0.004, tessellation: 24 }, this.club.scene);
        water.position.copyFrom(this._position(body, 0, -0.001, 0.0084));
        water.material = this._material(); water.isPickable = false; water.setEnabled(false);
        this.meshes.push(water);
        this.toilets[index] = { seat, lid, seatAngle: 0, lidAngle: 0, water,
            position: water.position.clone(), soundKey: `flush${index}` };
        seat.rotationQuaternion ||= new BABYLON.Quaternion();
        lid.rotationQuaternion ||= new BABYLON.Quaternion();
    }

    attachSink(meshes, index) {
        const mesh = meshes.find(item => /Bathroom_Sink$/.test(item.name));
        if (!mesh) {
            this.club.showErrorMessage('The tap controls could not be prepared.');
            return;
        }
        const controlPoint = this._position(mesh, 0, 0.0011, 0.0158).clone();
        this._control(`restroomTap${index}`, 'tap', index, controlPoint, 'TAP');
        const outlet = this._position(mesh, 0, -0.00205, 0.01576).clone();
        const bottom = this._position(mesh, 0, -0.00205, 0.0122).y;
        const length = outlet.y - bottom;
        const water = BABYLON.MeshBuilder.CreateCylinder(`restroomTapWater${index}`,
            { diameter: 0.008, height: length, tessellation: 8 }, this.club.scene);
        water.position.copyFrom(outlet); water.position.y -= length / 2;
        water.material = this._material(); water.isPickable = false; water.setEnabled(false);
        const splash = BABYLON.MeshBuilder.CreateTorus(`restroomHandSplash${index}`,
            { diameter: 0.035, thickness: 0.003, tessellation: 12 }, this.club.scene);
        splash.material = water.material; splash.isPickable = false; splash.setEnabled(false);
        this.meshes.push(water, splash);
        this.sinks[index] = { water, splash, position: outlet, bottom, rinsing: false, soundKey: `tap${index}` };
    }

    _sound(key, position, active, flush, until = 0) {
        const sound = this.sounds.get(key);
        if (!active) {
            if (sound) {
                this.sounds.delete(key);
                const ctx = this.club.audioContext;
                if (!this.disposed && ctx?.state === 'running') {
                    this.retiringSounds.add(sound);
                    sound.source.onended = () => { this._disconnectSound(sound); this.retiringSounds.delete(sound); };
                    sound.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
                    sound.source.stop(ctx.currentTime + 0.06);
                } else {
                    sound.source.onended = null;
                    sound.source.stop();
                    this._disconnectSound(sound);
                }
            }
            return;
        }
        const ctx = this.club.audioContext;
        if (sound) {
            const level = (flush ? 0.14 : 0.045) * this.club.getCrowdAmbienceLevel();
            if (level !== sound.level) {
                sound.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.08);
                sound.level = level;
            }
            if (sound.until !== until) {
                sound.source.stop(ctx.currentTime + Math.max(0, until - this.now()) / 1000);
                sound.until = until;
            }
            return;
        }
        if (!ctx || ctx.state !== 'running' || this.failedAudioContext === ctx) return;
        const nodes = [];
        try {
            if (!this.noise || this.noiseContext !== ctx) {
                this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
                this.noiseContext = ctx;
                const data = this.noise.getChannelData(0);
                for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            }
            const source = ctx.createBufferSource(); nodes.push(source);
            const filter = ctx.createBiquadFilter(); nodes.push(filter);
            const gain = ctx.createGain(); nodes.push(gain);
            const panner = ctx.createPanner(); nodes.push(panner);
            source.buffer = this.noise; source.loop = true;
            filter.type = 'bandpass'; filter.frequency.value = flush ? 480 : 2300; filter.Q.value = 0.5;
            gain.gain.setValueAtTime(0, ctx.currentTime);
            const level = (flush ? 0.14 : 0.045) * this.club.getCrowdAmbienceLevel();
            gain.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.1);
            panner.distanceModel = 'inverse'; panner.refDistance = 0.5; panner.maxDistance = 10; panner.rolloffFactor = 2;
            AudioUtils.setPannerPosition(panner, position.x, position.y, position.z);
            source.connect(filter); filter.connect(gain); gain.connect(panner); panner.connect(ctx.destination);
            source.start();
            const record = { source, filter, gain, panner, level, until };
            source.onended = () => {
                this._disconnectSound(record);
                if (this.sounds.get(key) === record) this.sounds.delete(key);
            };
            source.stop(ctx.currentTime + Math.max(0, until - this.now()) / 1000);
            this.sounds.set(key, record);
        } catch (error) {
            nodes.forEach(node => node.disconnect());
            this.failedAudioContext = ctx;
            this.club.showErrorMessage(`Restroom sound unavailable: ${error.message}`);
        }
    }

    update(dt) {
        if (this.disposed) return;
        const now = this.now();
        this.elapsed += dt || 0;
        const ease = 1 - Math.exp(-(dt || 0) / 0.18);
        for (let index = 0; index < 2; index++) {
            const toilet = this.toilets[index], sink = this.sinks[index];
            if (toilet) {
                const occupied = this.occupied(index, false);
                const seatTarget = !occupied && this.state.seats[index] ? 1.65 : 0;
                const lidTarget = occupied || this.state.lids[index] ? 1.8 : 0;
                toilet.lidAngle += (lidTarget - toilet.lidAngle) * ease;
                // Open the lid first and lower the seat first, so they never pass through one another.
                const seatGoal = seatTarget > 0 && toilet.lidAngle < 1.6 ? 0 : seatTarget;
                toilet.seatAngle += (seatGoal - toilet.seatAngle) * ease;
                if (lidTarget === 0 && toilet.seatAngle > 0.05) toilet.lidAngle = Math.max(toilet.lidAngle, 1.8);
                BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.X, -toilet.seatAngle, toilet.seat.rotationQuaternion);
                BABYLON.Quaternion.RotationAxisToRef(BABYLON.Axis.X, -toilet.lidAngle, toilet.lid.rotationQuaternion);
                const flushing = this.state.flushes[index] > now;
                toilet.water.setEnabled(flushing);
                if (flushing) {
                    const remaining = (this.state.flushes[index] - now) / 6000;
                    toilet.water.scaling.x = toilet.water.scaling.z = 0.75 + 0.25 * Math.sin(this.elapsed * 7);
                    toilet.water.position.y = toilet.position.y - 0.025 * (1 - remaining);
                }
                this._sound(toilet.soundKey, toilet.position, flushing, true, this.state.flushes[index]);
            }
            if (sink) {
                const running = this.state.taps[index] > now;
                sink.water.setEnabled(running);
                sink.rinsing = false;
                if (running && this.club.isInVRMode) {
                    const controllers = this.club._xrControllers;
                    for (let i = 0; i < (controllers?.length || 0); i++) {
                        const controller = controllers[i];
                        const hand = controller.grip?.absolutePosition || controller.pointer?.absolutePosition;
                        if (hand && Math.hypot(hand.x - sink.position.x, hand.z - sink.position.z) < 0.07 &&
                            hand.y < sink.position.y && hand.y > sink.bottom) {
                            sink.rinsing = true;
                            sink.splash.position.copyFrom(hand);
                            sink.splash.scaling.setAll(0.8 + 0.25 * Math.sin(this.elapsed * 19));
                            break;
                        }
                    }
                }
                sink.splash.setEnabled(sink.rinsing);
                this._sound(sink.soundKey, sink.position, running, false, this.state.taps[index]);
            }
        }
    }

    _stopSounds() {
        for (const key of this.sounds.keys()) this._sound(key, null, false, false);
    }

    _disconnectSound(sound) {
        sound.source.disconnect(); sound.filter.disconnect(); sound.gain.disconnect(); sound.panner.disconnect();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this._stopSounds();
        this.retiringSounds.forEach(sound => {
            sound.source.onended = null;
            sound.source.stop();
            this._disconnectSound(sound);
        });
        this.retiringSounds.clear();
        this.meshes.forEach(mesh => mesh.dispose());
        this.labelMaterial?.dispose();
        this.labelTexture?.dispose();
        this.noise = null; this.noiseContext = null;
        this.meshes.length = 0; this.toilets.length = 0; this.sinks.length = 0;
    }
}

window.RestroomInteractions = RestroomInteractions;
