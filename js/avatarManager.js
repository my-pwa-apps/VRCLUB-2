/**
 * Visual and spatial-audio representation of the OTHER guests in a shared
 * session. Driven entirely by `NetworkClient` events wired up in ui-init.js;
 * this class never touches the network itself.
 *
 * Each remote guest gets a simple capsule + head (not the full skinned dancer
 * rig used for atmosphere NPCs - see js/club/11-audio-crowd.js - since real
 * players need low-latency, allocation-free updates every frame, not a dance
 * animation) plus a floating name tag and an emoji reaction bubble. Position
 * and facing are interpolated toward the last network sample rather than
 * snapped, because state arrives far slower than the render loop.
 */
class AvatarManager {
    constructor(club) {
        this.club = club;
        this.scene = club.scene;
        /** @type {Map<string, object>} */
        this.remotes = new Map();
        this._material = null;
    }

    _getMaterial() {
        if (this._material) return this._material;
        this._material = this.club.materialFactory
            ? this.club.materialFactory.createPBRMaterial('remotePlayerMat',
                { baseColor: [0.25, 0.75, 1.0], metallic: 0.15, roughness: 0.55 }, true)
            : new BABYLON.StandardMaterial('remotePlayerMat', this.scene);
        return this._material;
    }

    ensurePeer(id, name) {
        let peer = this.remotes.get(id);
        if (peer) {
            if (name) this._drawLabel(peer.nameplate.material.diffuseTexture, name);
            return peer;
        }

        const scene = this.scene;
        const root = new BABYLON.TransformNode(`remotePlayer_${id}`, scene);

        const body = BABYLON.MeshBuilder.CreateCapsule(`remoteBody_${id}`, { height: 1.6, radius: 0.28 }, scene);
        body.parent = root;
        body.position.y = 0.9;
        body.material = this._getMaterial();
        body.isPickable = false;

        const head = BABYLON.MeshBuilder.CreateSphere(`remoteHead_${id}`, { diameter: 0.32 }, scene);
        head.parent = root;
        head.position.y = 1.75;
        head.material = this._getMaterial();
        head.isPickable = false;

        const nameplate = this._createLabel(id, name, root);

        peer = {
            root, body, head, nameplate,
            emojiPlane: null, emojiTimer: 0,
            target: { x: root.position.x, y: root.position.y, z: root.position.z, rotY: 0 },
            audio: null
        };
        this.remotes.set(id, peer);
        return peer;
    }

    _createLabel(id, name, root) {
        const scene = this.scene;
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteLabel_${id}`, { width: 1.1, height: 0.28 }, scene);
        plane.parent = root;
        plane.position.y = 2.05;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const dt = new BABYLON.DynamicTexture(`remoteLabelTex_${id}`, { width: 256, height: 64 }, scene, false);
        dt.hasAlpha = true;
        this._drawLabel(dt, name);

        const mat = new BABYLON.StandardMaterial(`remoteLabelMat_${id}`, scene);
        mat.diffuseTexture = dt;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        plane.material = mat;
        return plane;
    }

    _drawLabel(dynamicTexture, name) {
        const ctx = dynamicTexture.getContext();
        const { width, height } = dynamicTexture.getSize();
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, width, height);
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(name || 'Guest').slice(0, 18), width / 2, height / 2);
        dynamicTexture.update();
    }

    /** @param {{x:number,y:number,z:number,rotY:number}} state */
    updatePeerState(id, name, state) {
        if (!state) return;
        const peer = this.ensurePeer(id, name);
        peer.target.x = state.x;
        peer.target.y = state.y;
        peer.target.z = state.z;
        peer.target.rotY = state.rotY || 0;
    }

    showEmoji(id, emoji) {
        const peer = this.remotes.get(id);
        if (!peer || !emoji) return;
        if (peer.emojiPlane) {
            peer.emojiPlane.material.diffuseTexture.dispose();
            peer.emojiPlane.material.dispose();
            peer.emojiPlane.dispose();
        }

        const scene = this.scene;
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteEmoji_${id}`, { size: 0.5 }, scene);
        plane.parent = peer.root;
        plane.position.y = 2.45;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const dt = new BABYLON.DynamicTexture(`remoteEmojiTex_${id}`, { width: 128, height: 128 }, scene, false);
        dt.hasAlpha = true;
        const ctx = dt.getContext();
        ctx.font = '92px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, 64, 68);
        dt.update();

        const mat = new BABYLON.StandardMaterial(`remoteEmojiMat_${id}`, scene);
        mat.diffuseTexture = dt;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.useAlphaFromDiffuseTexture = true;
        mat.backFaceCulling = false;
        plane.material = mat;

        peer.emojiPlane = plane;
        peer.emojiTimer = 2.2;
    }

    /** Anchors a remote guest's WebRTC voice stream as spatial audio at their avatar. */
    attachVoice(id, mediaStream) {
        const peer = this.remotes.get(id);
        if (!peer) return;
        // A guest who has not yet started any audio (no default stream, no upload)
        // has no AudioContext yet - create the same shared one music/crowd-ambience
        // will reuse, rather than silently dropping their voice.
        if (!this.club.audioContext && typeof this.club._ensureAudioContext === 'function') {
            this.club._ensureAudioContext();
        }
        if (!this.club.audioContext) return;
        this.detachVoice(id);

        const ctx = this.club.audioContext;
        const source = ctx.createMediaStreamSource(mediaStream);
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.5;
        panner.maxDistance = 30;
        panner.rolloffFactor = 1.2;
        const gain = ctx.createGain();
        gain.gain.value = 1.0;

        source.connect(panner);
        panner.connect(gain);
        gain.connect(ctx.destination);
        peer.audio = { source, panner, gain };
    }

    detachVoice(id) {
        const peer = this.remotes.get(id);
        if (!peer || !peer.audio) return;
        for (const node of [peer.audio.source, peer.audio.panner, peer.audio.gain]) {
            try { node.disconnect(); } catch { /* ignore */ }
        }
        peer.audio = null;
    }

    removePeer(id) {
        const peer = this.remotes.get(id);
        if (!peer) return;
        this.detachVoice(id);
        if (peer.emojiPlane) {
            peer.emojiPlane.material.diffuseTexture.dispose();
            peer.emojiPlane.material.dispose();
            peer.emojiPlane.dispose();
        }
        peer.nameplate.material.diffuseTexture.dispose();
        peer.nameplate.material.dispose();
        peer.nameplate.dispose();
        peer.body.dispose();
        peer.head.dispose();
        peer.root.dispose();
        this.remotes.delete(id);
    }

    /** Called once per frame from VRClubAnimationCore.updateAnimations(). */
    update(dt) {
        const step = dt || 0.016;
        // Exponential smoother compounded for frame-rate independence (see
        // .github/copilot-instructions.md - "never scale a bare retention rate").
        const lerpK = 1 - (1 - 0.15) ** (step * 60);

        for (const peer of this.remotes.values()) {
            const root = peer.root;
            root.position.x += (peer.target.x - root.position.x) * lerpK;
            root.position.y += (peer.target.y - root.position.y) * lerpK;
            root.position.z += (peer.target.z - root.position.z) * lerpK;

            let dy = peer.target.rotY - root.rotation.y;
            dy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
            root.rotation.y += dy * lerpK;

            if (peer.audio && peer.audio.panner) {
                const p = peer.audio.panner;
                const headY = root.position.y + 1.6;
                if (p.positionX) {
                    p.positionX.value = root.position.x;
                    p.positionY.value = headY;
                    p.positionZ.value = root.position.z;
                } else if (p.setPosition) {
                    p.setPosition(root.position.x, headY, root.position.z);
                }
            }

            if (peer.emojiPlane) {
                peer.emojiTimer -= step;
                if (peer.emojiTimer <= 0) {
                    peer.emojiPlane.material.diffuseTexture.dispose();
                    peer.emojiPlane.material.dispose();
                    peer.emojiPlane.dispose();
                    peer.emojiPlane = null;
                }
            }
        }
    }

    dispose() {
        for (const id of [...this.remotes.keys()]) this.removePeer(id);
        if (this._material && this._material._vrclubShared !== true) {
            try { this._material.dispose(); } catch { /* ignore */ }
        }
        this._material = null;
    }
}

window.AvatarManager = AvatarManager;
