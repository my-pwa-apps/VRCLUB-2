'use strict';
/**
 * Visual and spatial-audio representation of the OTHER guests in a shared
 * session. Driven entirely by `NetworkClient` events wired up in ui-init.js;
 * this class never touches the network itself.
 *
 * Each remote guest is a person, not a dance clip: an AvatarRig (js/avatarRig.js)
 * poses the shared dancer skeleton from the interpolated position and facing, so they
 * walk, turn and stand like the local player's body does. Rigs are skinned characters,
 * so only the first MAX_RIGS guests get one; the rest, and any guest who arrives before
 * the crowd has loaded, fall back to a capsule + head. The capsule always stays as an
 * invisible collision body. A floating name tag and an emoji reaction bubble ride on
 * top. Position and facing are interpolated toward the last network sample rather than
 * snapped, because state arrives far slower than the render loop.
 */
class AvatarManager {
    /** Remote `state.y` is the sender's EYE height; the avatar head sits this far above its root. */
    static EYE_HEIGHT = 1.7;
    // Mirrors the Multiplayer panel's buttons and the relay's allow-list.
    static ALLOWED_EMOJI = new Set(['🎉', '🔥', '❤️', '😂', '👋', '🙌', '💃', '🕺']);
    static EMOJI_MIN_INTERVAL = 0.5; // seconds between reactions rendered per guest
    static MAX_RIGS = 4;             // skinned bodies for remote guests (each is a skeleton + 4-8 draws)

    /** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
    static shortestAngle(from, to) {
        const tau = Math.PI * 2;
        return (to - from) - tau * Math.round((to - from) / tau);
    }

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
        body.checkCollisions = true;

        const head = BABYLON.MeshBuilder.CreateSphere(`remoteHead_${id}`, { diameter: 0.32 }, scene);
        head.parent = root;
        head.position.y = 1.75;
        head.material = this._getMaterial();
        head.isPickable = false;

        const nameplate = this._createLabel(id, name, root);
        const rig = this._createRig(id);
        if (rig) {
            body.isVisible = false;         // stays as the collision body
            head.isVisible = false;
        }

        peer = {
            root, body, head, nameplate, rig,
            pose: { x: 0, z: 0, groundY: 0, eyeY: AvatarManager.EYE_HEIGHT, headYaw: 0, headPitch: 0, left: null, right: null },
            emojiPlane: null, emojiTimer: 0, lastEmojiAt: -Infinity,
            target: { x: root.position.x, y: root.position.y, z: root.position.z, rotY: 0 },
            hasState: false,
            audio: null
        };
        this.remotes.set(id, peer);
        return peer;
    }

    /** A person for this guest, or null (rig limit reached, crowd not loaded yet, no AvatarRig). */
    _createRig(id) {
        const club = this.club;
        if (typeof AvatarRig === 'undefined' || !club._crowdSourceContainers || !club._avatarContainerFor) return null;
        let live = 0;
        for (const peer of this.remotes.values()) if (peer.rig) live++;
        if (live >= AvatarManager.MAX_RIGS) return null;
        const key = String(id);
        let hash = 0;
        for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
        const container = club._avatarContainerFor(hash & 1 ? 'male' : 'female');
        if (!container) return null;
        const rig = new AvatarRig(club, container, { eyeHeight: AvatarManager.EYE_HEIGHT });
        return rig.ok ? rig : null;
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

    /** @param {{x:number,y:number,z:number,rotY:number}} state - y is the sender's eye height */
    updatePeerState(id, name, state) {
        if (!state) return;
        const peer = this.ensurePeer(id, name);
        const finite = value => (Number.isFinite(value) ? value : 0);
        peer.target.x = finite(state.x);
        // Place the root on the sender's floor so the head (root + EYE_HEIGHT) lands at
        // their eye. Using the eye height as the root floated every guest ~1.7 m up.
        peer.target.y = finite(state.y) - AvatarManager.EYE_HEIGHT;
        peer.target.z = finite(state.z);
        peer.target.rotY = finite(state.rotY);
        if (!peer.hasState) {
            // Snap on the first sample instead of sliding in from the world origin.
            peer.hasState = true;
            peer.root.position.set(peer.target.x, peer.target.y, peer.target.z);
            peer.root.rotation.y = peer.target.rotY;
        }
    }

    showEmoji(id, emoji) {
        const peer = this.remotes.get(id);
        if (!peer || !AvatarManager.ALLOWED_EMOJI.has(emoji)) return;
        // Each reaction allocates a mesh, material and DynamicTexture, so a flooding
        // peer must not be able to churn GPU resources on every other guest.
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        if (now - peer.lastEmojiAt < AvatarManager.EMOJI_MIN_INTERVAL) return;
        peer.lastEmojiAt = now;
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

        // Chromium (desktop Chrome/Edge and Quest Browser) delivers no samples from a
        // remote WebRTC stream into Web Audio unless the stream is also attached to a
        // media element. The element stays muted: the HRTF panner is the only audible path.
        let element = null;
        if (typeof Audio !== 'undefined') {
            element = new Audio();
            element.muted = true;
            element.autoplay = true;
            element.srcObject = mediaStream;
            const played = element.play();
            if (played && typeof played.catch === 'function') played.catch(() => { /* muted: allowed */ });
        }
        peer.audio = { source, panner, gain, element };
    }

    detachVoice(id) {
        const peer = this.remotes.get(id);
        if (!peer || !peer.audio) return;
        for (const node of [peer.audio.source, peer.audio.panner, peer.audio.gain]) {
            try { node.disconnect(); } catch { /* ignore */ }
        }
        if (peer.audio.element) {
            try { peer.audio.element.pause(); } catch { /* ignore */ }
            peer.audio.element.srcObject = null;
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
        if (peer.rig) peer.rig.dispose();
        peer.body.dispose();
        peer.head.dispose();
        peer.root.dispose();
        this.remotes.delete(id);
    }

    /** Called once per frame from VRClubAnimationCore.updateAnimations() with ctx.dt (seconds). */
    update(dt) {
        if (!(dt > 0)) return;
        // Exponential smoother compounded for frame-rate independence (see
        // .github/copilot-instructions.md - "never scale a bare retention rate").
        const step = dt;
        const lerpK = 1 - (1 - 0.15) ** (step * 60);

        for (const peer of this.remotes.values()) {
            const root = peer.root;
            root.position.x += (peer.target.x - root.position.x) * lerpK;
            root.position.y += (peer.target.y - root.position.y) * lerpK;
            root.position.z += (peer.target.z - root.position.z) * lerpK;

            // JavaScript's % keeps the dividend's sign, so the previous wrap left
            // differences below -PI unwrapped and avatars spun the long way round.
            root.rotation.y += AvatarManager.shortestAngle(root.rotation.y, peer.target.rotY) * lerpK;

            if (peer.rig && peer.hasState) {
                // The guest's feet are the root; their eye is EYE_HEIGHT above it.
                const pose = peer.pose;
                pose.x = root.position.x; pose.z = root.position.z;
                pose.groundY = root.position.y;
                pose.eyeY = root.position.y + AvatarManager.EYE_HEIGHT;
                pose.headYaw = root.rotation.y;
                peer.rig.update(dt, pose);
            }

            if (peer.audio && peer.audio.panner) {
                AudioUtils.setPannerPosition(peer.audio.panner,
                    root.position.x, root.position.y + AvatarManager.EYE_HEIGHT, root.position.z);
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
