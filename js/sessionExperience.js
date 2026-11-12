'use strict';

// Session-only, acknowledged water props and a factual booth presence/reaction readout.
(function () {
    const WATER_Z = [-7, -7.3, -7.6, -7.9];
    const LOCAL_WATER_ID = '__local_water__';
    const SessionExperience = {
        createSessionExperience() {
            if (this._sessionExperience || !this.scene || !this.materialFactory) return;
            const scene = this.scene;
            const material = this.materialFactory.createPBRMaterial('sessionWaterMat', {
                baseColor: [0.55, 0.78, 0.84], metallic: 0.15, roughness: 0.25
            }, true);
            const cups = [];
            for (let slot = 0; slot < WATER_Z.length; slot++) {
                const mesh = BABYLON.MeshBuilder.CreateCylinder(`sessionWater${slot}`, {
                    diameterTop: 0.075, diameterBottom: 0.055, height: 0.12, tessellation: 12
                }, scene);
                mesh.material = material;
                mesh.isPickable = true;
                mesh.metadata = { vrclubSession: 'water' };
                mesh.rotationQuaternion = new BABYLON.Quaternion();
                mesh.setEnabled(false);
                cups.push(mesh);
            }
            const makePanel = (name, width, height, x, y, z) => {
                const mesh = BABYLON.MeshBuilder.CreatePlane(name, { width, height }, scene);
                mesh.position.set(x, y, z);
                const texture = new BABYLON.DynamicTexture(`${name}Texture`, { width: 768, height: 256 }, scene, false);
                const mat = this.materialFactory.createPBRMaterial(`${name}Mat`, {
                    baseColor: [0, 0, 0], metallic: 0, roughness: 1, mutable: true
                }, false);
                mat.unlit = true;
                mat.emissiveTexture = texture;
                mat.emissiveColor.set(0.65, 0.65, 0.65);
                mat.albedoTexture = texture;
                mesh.material = mat;
                mesh.isPickable = false;
                return { mesh, texture, material: mat };
            };
            const station = makePanel('sessionWaterStation', 0.9, 0.3, 9.69, 1.48, -7.45);
            station.mesh.rotation.y = Math.PI / 2;
            station.mesh.isPickable = true;
            station.mesh.metadata = { vrclubSession: 'water' };
            const booth = makePanel('sessionBoothFeedback', 0.9, 0.3, 0, 1.35, -18.85);
            const state = this._sessionExperience = {
                cups, station, booth, drinks: this._pendingSessionWater || [], clock: 0, signature: '',
                reactions: new Map(), up: new BABYLON.Vector3(), forward: new BABYLON.Vector3(), normal: new BABYLON.Vector3(),
                hand: {}, sounds: new Set(), disposed: false, observer: null
            };
            state.observer = scene.onBeforeRenderObservable.add(() => this._updateSessionWaterMeshes());
            this._paintSessionPanel(station.texture, 'SELF-SERVICE WATER', 'ORDER / PICK UP / PUT DOWN', 'Self-service. No bartender handoff.');
            this._paintSessionPanel(booth.texture, 'ROOM FEEDBACK', 'No other guests in a room', 'Presence and reactions, not music analysis');
            this._pendingSessionWater = null;
            state.clock = 0;
        },

        _paintSessionPanel(texture, title, line, detail) {
            const ctx = texture.getContext();
            ctx.fillStyle = '#081318'; ctx.fillRect(0, 0, 768, 256);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#9dd9e2'; ctx.font = 'bold 42px sans-serif'; ctx.fillText(title, 384, 58);
            ctx.fillStyle = '#ffffff'; ctx.font = '36px sans-serif'; ctx.fillText(line, 384, 126);
            ctx.fillStyle = '#b7c8ce'; ctx.font = '25px sans-serif'; ctx.fillText(detail, 384, 199);
            texture.update(false);
        },

        setSessionWater(value) {
            const drinks = Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' &&
                item.id.length <= 64 && Number.isInteger(item.slot) && item.slot >= 0 && item.slot < 4 &&
                typeof item.held === 'boolean' && ['left', 'right'].includes(item.hand)).slice(0, 4) : [];
            if (this._sessionExperience) this._sessionExperience.drinks = drinks;
            else this._pendingSessionWater = drinks;
        },

        recordBoothReaction(id, reaction) {
            const state = this._sessionExperience, peer = this.multiplayer?.client?.peers.get(id);
            if (!state || !peer || peer.simulated) return;
            state.reactions.set(id, { at: performance.now(), reaction });
        },

        pressSessionExperience(pickInfo) {
            const mesh = pickInfo?.pickedMesh;
            if (!mesh?.metadata?.vrclubSession) return false;
            const mp = this.multiplayer, state = this._sessionExperience;
            const offline = !mp?.client || (!mp.connected && !mp.connecting && mp._waterOfflineAllowed === true);
            if (offline && state) {
                const mine = state.drinks.find(item => item.id === LOCAL_WATER_ID);
                const hand = this.isInVRMode && this._vjDeskControllerAt?.(pickInfo.pickedPoint)?.controller?.inputSource?.handedness === 'left' ? 'left' : 'right';
                if (mine && !mine.held && this._vjDeskHandHold?.[hand]?.amount > 0.05) {
                    this.showErrorMessage('Let go of the desk control before picking up water.');
                    return true;
                }
                this.setSessionWater([{ id: LOCAL_WATER_ID, slot: 0, held: mine ? !mine.held : false, hand }]);
                return true;
            }
            if (!mp?.connected || !mp.client.sharedWaterSupported) {
                this.showErrorMessage('Join a room with shared water support to use the self-service station.');
                return true;
            }
            const mine = state?.drinks.find(item => item.id === mp.client.selfId);
            const other = state?.drinks.find(item => state.cups[item.slot] === mesh && item.id !== mp.client.selfId);
            if (other) {
                if (!mine?.held || !other.held) this.showErrorMessage('Both guests must be holding water to clink glasses.');
                else mp.requestWaterClink(other.id);
                return true;
            }
            const action = !mine ? 'order' : mine.held ? 'putdown' : 'pickup';
            const aimed = this.isInVRMode ? this._vjDeskControllerAt?.(pickInfo.pickedPoint) : null;
            const hand = aimed?.controller?.inputSource?.handedness === 'left' ? 'left' : 'right';
            if (action === 'pickup' && this._vjDeskHandHold?.[hand]?.amount > 0.05) {
                this.showErrorMessage('Let go of the desk control before picking up water.');
                return true;
            }
            mp.requestWater(action, hand);
            return true;
        },

        playSessionWaterClink(event) {
            const state = this._sessionExperience, ctx = this.audioContext;
            if (!state || state.disposed || !ctx || ctx.state !== 'running' || state.sounds.size >= 4) return;
            const nodes = [];
            try {
                const source = ctx.createOscillator(), gain = ctx.createGain(), panner = ctx.createPanner();
                nodes.push(source, gain, panner);
                source.type = 'sine';
                source.frequency.setValueAtTime(1900, ctx.currentTime);
                source.frequency.exponentialRampToValueAtTime(1450, ctx.currentTime + 0.16);
                const level = Math.max(0, Math.min(1, this.getCrowdAmbienceLevel?.() ?? 1)) * 0.045;
                gain.gain.setValueAtTime(level, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
                panner.distanceModel = 'inverse'; panner.refDistance = 0.5; panner.maxDistance = 12; panner.rolloffFactor = 2;
                AudioUtils.setPannerPosition(panner, event.x, event.y, event.z);
                source.connect(gain); gain.connect(panner); panner.connect(ctx.destination);
                const sound = { source, nodes };
                state.sounds.add(sound);
                source.onended = () => {
                    for (const node of nodes) node.disconnect();
                    state.sounds.delete(sound);
                };
                source.start(); source.stop(ctx.currentTime + 0.2);
            } catch (_) {
                for (const node of nodes) node.disconnect();
            }
        },

        updateSessionExperience(dt) {
            const state = this._sessionExperience;
            if (!state || state.disposed) return;
            const client = this.multiplayer?.client;
            state.clock -= dt || 0;
            if (state.clock > 0) return;
            state.clock = 0.5;
            this._refreshSessionFeedback(client, state);
        },

        _updateSessionWaterMeshes() {
            const state = this._sessionExperience, client = this.multiplayer?.client;
            if (!state || state.disposed) return;
            let visible = 0;
            for (let i = 0; i < state.drinks.length; i++) {
                const drink = state.drinks[i], mesh = state.cups[drink.slot];
                const self = client?.connected ? drink.id === client.selfId : drink.id === LOCAL_WATER_ID;
                const peer = !self && client?.peers.get(drink.id);
                if (!self && !peer) continue;
                visible |= 1 << drink.slot;
                if (!mesh.isEnabled()) mesh.setEnabled(true);
                mesh.position.set(9.9, 1.17, WATER_Z[drink.slot]);
                mesh.rotationQuaternion.set(0, 0, 0, 1);
                if (!drink.held) continue;
                const person = self ? this._mirrorDouble?.shown ? this._mirrorDouble : null
                    : this.multiplayer.manager?.remotes.get(drink.id)?.person;
                const rig = person?.rig || person?.arms || (self && !person ? this._localRig : null);
                if (!rig || !rig.root?.isEnabled()) { mesh.setEnabled(false); continue; }
                let grip = mesh._sessionGrip;
                if (!grip || grip.rig !== rig || grip.hand !== drink.hand) {
                    let suffix;
                    if (rig.arms) {
                        for (let a = 0; a < rig.arms.length; a++) if (rig.arms[a].side === drink.hand) suffix = rig.arms[a].suffix;
                    } else suffix = (drink.hand === 'right') === (rig.sideL > 0) ? 'l' : 'r';
                    grip = mesh._sessionGrip = { rig, hand: drink.hand, wrist: rig.order[rig.ix[`hand_${suffix}`]],
                        index: rig.order[rig.ix[`index_01_${suffix}`]], pinky: rig.order[rig.ix[`pinky_01_${suffix}`]] };
                }
                const wrist = grip.wrist, index = grip.index, pinky = grip.pinky;
                if (!wrist || !index || !pinky) { mesh.setEnabled(false); continue; }
                wrist.computeWorldMatrix(true);
                index.computeWorldMatrix(true);
                pinky.computeWorldMatrix(true);
                const w = wrist.getAbsolutePosition(), ix = index.getAbsolutePosition(), pk = pinky.getAbsolutePosition();
                state.up.set(ix.x - pk.x, ix.y - pk.y, ix.z - pk.z).normalize();
                state.forward.set((ix.x + pk.x) * 0.5 - w.x, (ix.y + pk.y) * 0.5 - w.y, (ix.z + pk.z) * 0.5 - w.z).normalize();
                BABYLON.Vector3.CrossToRef(state.forward, state.up, state.normal);
                if (drink.hand === 'left') state.normal.scaleInPlace(-1);
                mesh.position.set(w.x + state.forward.x * 0.045 + state.normal.x * 0.035,
                    w.y + state.forward.y * 0.045 + state.normal.y * 0.035,
                    w.z + state.forward.z * 0.045 + state.normal.z * 0.035);
                BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Y, state.up, mesh.rotationQuaternion);
            }
            for (let slot = 0; slot < 4; slot++) if (!(visible & (1 << slot)) && state.cups[slot].isEnabled()) state.cups[slot].setEnabled(false);
        },

        _refreshSessionFeedback(client, state) {
            let guests = 0, nearby = 0, reactions = 0;
            const now = performance.now();
            if (client?.connected) {
                for (const [id, peer] of client.peers) {
                    if (peer.simulated) continue;
                    guests++;
                    if (peer.state && Math.hypot(peer.state.x, peer.state.z + 18) < 8) nearby++;
                    const reaction = state.reactions.get(id);
                    if (reaction && now - reaction.at < 15000) reactions++;
                }
            }
            for (const [id, reaction] of state.reactions) {
                if (!client?.peers.has(id) || now - reaction.at >= 15000) state.reactions.delete(id);
            }
            const mine = state.drinks.find(drink => drink.id === (client?.connected ? client.selfId : LOCAL_WATER_ID));
            const offline = !client || (!client.connected && !this.multiplayer?.connecting && this.multiplayer?._waterOfflineAllowed === true);
            const supported = offline || !!(client?.connected && client.sharedWaterSupported);
            const vjName = client?.vjId ? client.vjId === client.selfId ? 'You' : client.peers.get(client.vjId)?.name || 'Room VJ'
                : this.multiplayer?.hostName() || 'Local';
            const signature = `${guests}:${nearby}:${reactions}:${mine?.held}:${!!mine}:${supported}:${vjName}`;
            if (state.signature === signature) return;
            state.signature = signature;
            this._paintSessionPanel(state.booth.texture, 'ROOM FEEDBACK', `${guests} real guests / ${nearby} near the booth`,
                `${reactions} reacted in 15 s / Lights: ${String(vjName).slice(0, 20)}`);
            this._paintSessionPanel(state.station.texture, 'SELF-SERVICE WATER',
                !supported ? 'Join a room with water support' : !mine ? 'PRESS TO ORDER WATER' : mine.held ? 'PRESS TO PUT DOWN' : 'PRESS TO PICK UP',
                mine?.held ? 'Select another held glass to clink.' : 'Session only. No bartender handoff.');
        },

        disposeSessionExperience() {
            const state = this._sessionExperience;
            if (!state) return;
            state.disposed = true;
            this.scene.onBeforeRenderObservable.remove(state.observer);
            for (const sound of state.sounds) {
                sound.source.onended = null;
                try { sound.source.stop(); } catch (_) { /* already stopped */ }
                for (const node of sound.nodes) node.disconnect();
            }
            state.sounds.clear();
            for (const mesh of state.cups) mesh.dispose();
            for (const panel of [state.station, state.booth]) {
                panel.mesh.dispose(); panel.texture.dispose(); panel.material.dispose();
            }
            state.reactions.clear();
            this._sessionExperience = null;
            this._pendingSessionWater = null;
        }
    };
    window.SessionExperience = SessionExperience;
})();
